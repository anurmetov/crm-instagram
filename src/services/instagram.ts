import { z } from 'zod';

const statusSchema = z.object({
  configured: z.boolean(), appId: z.string(), publicUrl: z.string(), verifyToken: z.string(),
  callbackUrl: z.string(), webhookUrl: z.string(), connected: z.boolean(), username: z.string(),
  expiresAt: z.number().nullable(), needsReconnect: z.boolean(), lastOutgoing: z.string().nullable(),
  pendingProfiles: z.number(), oauthError: z.string(), queued: z.number(),
});
export type InstagramStatus = z.infer<typeof statusSchema>;
export type InstagramSettings = { appId: string; appSecret?: string; publicUrl: string };
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '') + '/integrations/instagram';
async function request(path = '', method = 'GET', body?: unknown) {
  const response = await fetch(baseUrl + path, { method, credentials: 'include', signal: AbortSignal.timeout(45000),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    let message = 'Не удалось связаться с локальной CRM. Проверьте, что сервер запущен.';
    try { const error = z.object({ error: z.string() }).parse(await response.json()); message = error.error; } catch { /* Keep a safe fallback. */ }
    throw new Error(message);
  }
  return response.json() as Promise<unknown>;
}
export const instagramService = {
  status: async () => statusSchema.parse(await request()),
  configure: async (settings: InstagramSettings) => statusSchema.parse(await request('/settings', 'PUT', settings)),
  authorize: async () => {
    const { url } = z.object({ url: z.url() }).parse(await request('/authorize', 'POST', {}));
    if (new URL(url).origin !== 'https://www.instagram.com') throw new Error('Некорректный адрес авторизации');
    return url;
  },
  disconnect: async () => statusSchema.parse(await request('', 'DELETE')),
};
