import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { leadSchema, prepareLead } from '../src/lib/domain.ts';
import { InstagramIntegration, equalSecret, validSignature } from './instagram.ts';
import { Store } from './store.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function send(response: ServerResponse, status: number, data?: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}
async function body(request: IncomingMessage, limit = 1_048_576) {
  if (Number(request.headers['content-length'] ?? 0) > limit) throw new HttpError(413, 'Слишком большой запрос');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function json(request: IncomingMessage) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Ожидается JSON');
  try { return JSON.parse((await body(request)).toString('utf8')) as unknown; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Некорректный JSON'); }
}
function failure(response: ServerResponse, error: unknown) {
  if (response.headersSent) { response.end(); return; }
  if (error instanceof HttpError) send(response, error.status, { error: error.message });
  else if (error instanceof z.ZodError) send(response, 400, { error: 'Проверьте формат и обязательные поля' });
  else if (error instanceof Error && error.message === 'DUPLICATE_HANDLE') send(response, 409, { error: 'Контакт с таким Instagram-ником уже существует' });
  else send(response, 500, { error: 'Не удалось выполнить действие. Проверьте настройки и повторите попытку.' });
}

export function createLocalApi(store: Store, instagram: InstagramIntegration, origins: string[]) {
  return createServer((request, response) => {
    void (async () => {
      // Loopback binding + Host / Origin validation prevent public tunnel access and browser DNS rebinding.
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host ?? '')) throw new HttpError(403, 'Только локальный доступ');
      if (request.headers.origin && !origins.includes(request.headers.origin)) throw new HttpError(403, 'Нет доступа с этого адреса');
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Запрос с другого сайта запрещён');
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = url.pathname, method = request.method;
      if (path === '/api/health' && method === 'GET') { send(response, 200, { ok: true }); return; }
      if (path === '/api/leads' && method === 'GET') { send(response, 200, store.list()); return; }
      const leadPath = /^\/api\/leads\/([^/]+)$/.exec(path);
      if (leadPath) {
        const id = decodeURIComponent(leadPath[1]);
        if (method === 'DELETE') { store.remove(id); send(response, 204); return; }
        if (method === 'PUT') {
          const input = leadSchema.parse(await json(request));
          if (input.id !== id) throw new HttpError(400, 'ID контакта не совпадает');
          const previous = store.find(id);
          if (!previous && !input.handle) throw new HttpError(400, 'Укажите Instagram-ник');
          // The server owns timestamps, provider identity and history. Clients supply editable fields only.
          let prepared;
          try { prepared = prepareLead(input, previous); }
          catch (error) {
            if (error instanceof z.ZodError) throw error;
            throw new HttpError(400, error instanceof Error ? error.message : 'Проверьте поля контакта');
          }
          const saved = store.save(prepared);
          send(response, previous ? 200 : 201, saved); return;
        }
      }
      if (path === '/api/integrations/instagram' && method === 'GET') { send(response, 200, instagram.status()); return; }
      if (path === '/api/integrations/instagram/settings' && method === 'PUT') {
        const settings = await json(request);
        try { instagram.configure(settings); }
        catch (error) {
          if (error instanceof z.ZodError) throw error;
          throw new HttpError(400, error instanceof Error ? error.message : 'Проверьте настройки Instagram');
        }
        send(response, 200, instagram.status()); return;
      }
      if (path === '/api/integrations/instagram/authorize' && method === 'POST') {
        await json(request); send(response, 200, { url: instagram.startAuthorization() }); return;
      }
      if (path === '/api/integrations/instagram' && method === 'DELETE') {
        await instagram.disconnect(); send(response, 200, instagram.status()); return;
      }
      send(response, 404, { error: 'Маршрут не найден' });
    })().catch(error => failure(response, error));
  });
}

// This server alone is exposed through the tunnel. It has no routes to the CRM data or settings.
export function createInstagramGateway(instagram: InstagramIntegration, frontendOrigin: string) {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/auth/instagram/callback' && request.method === 'GET') {
        try { await instagram.finishAuthorization(url.searchParams.get('state') ?? '', url.searchParams.get('code'), url.searchParams.has('error')); }
        catch { throw new HttpError(400, 'Авторизация устарела. Повторите подключение из CRM.'); }
        response.writeHead(303, { Location: `${frontendOrigin}/?instagram=return#pipeline`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(); return;
      }
      const settings = instagram.settings();
      if (url.pathname !== '/webhooks/instagram') { send(response, 404, { error: 'Маршрут не найден' }); return; }
      if (!settings) throw new HttpError(503, 'Подключение ещё не настроено');
      if (request.method === 'GET') {
        if (url.searchParams.get('hub.mode') !== 'subscribe' || !equalSecret(url.searchParams.get('hub.verify_token') ?? '', settings.verifyToken)) throw new HttpError(403, 'Неверный verify token');
        const challenge = url.searchParams.get('hub.challenge');
        if (!challenge || !/^\d{1,100}$/.test(challenge)) throw new HttpError(400, 'Некорректный challenge');
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); response.end(challenge); return;
      }
      if (request.method === 'POST') {
        const raw = await body(request), signature = request.headers['x-hub-signature-256'];
        if (!validSignature(raw, typeof signature === 'string' ? signature : undefined, settings.appSecret)) throw new HttpError(403, 'Неверная подпись');
        let payload: unknown;
        try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Некорректный JSON'); }
        instagram.receive(payload); // Durable enqueue before acknowledgement; Graph calls happen in the worker.
        send(response, 200, { received: true }); return;
      }
      send(response, 405, { error: 'Метод не поддерживается' });
    })().catch(error => failure(response, error));
  });
}
