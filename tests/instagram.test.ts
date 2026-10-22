import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareLead } from '../src/lib/domain';
import { Store } from '../server/store';
import { InstagramIntegration, MetaClient, MetaError, validSignature } from '../server/instagram';
import type { Connection, InstagramClient } from '../server/instagram';
import { createInstagramGateway, createLocalApi } from '../server/http';

const secret = 'test-secret-not-a-real-meta-secret';
const settings = { appId: '123456789', appSecret: secret, publicUrl: 'https://crm-test.example.com' };
const connected: Connection = { accountId: '17840000001', username: 'my.creator', token: 'test-token-not-a-real-access-token',
  expiresAt: Date.now() + 60 * 86400_000, refreshedAt: Date.now() };
const outgoing = (mid = 'mid-1', userId = '99001') => ({ sender: { id: connected.accountId }, recipient: { id: userId }, timestamp: Date.now(), message: { mid, is_echo: true } });
const payload = (...messaging: unknown[]) => ({ object: 'instagram', entry: [{ id: connected.accountId, messaging }] });
const sign = (raw: string) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
let directory: string, store: Store, service: InstagramIntegration, client: InstagramClient;
let servers: Server[];
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'potok-crm-test-')); store = new Store(directory); servers = [];
  client = { authorize: vi.fn((_settings, state) => `https://www.instagram.com/oauth/authorize?state=${state}`),
    connect: vi.fn(async () => connected), profile: vi.fn(async () => ({ username: 'new.person', name: 'Новый человек' })),
    refresh: vi.fn(async connection => connection), unsubscribe: vi.fn(async () => {}) };
  service = new InstagramIntegration(store, client); service.configure(settings); store.set('instagram.connection', connected);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
  }
  store.close();
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('potok-crm-test-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true });
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server port');
  return `http://127.0.0.1:${address.port}`;
}

describe('Instagram outgoing leads', () => {
  it('durably queues before acknowledgement and creates a new lead with the recipient identity', async () => {
    service.receive(payload(outgoing()));
    expect(store.list()).toHaveLength(0); expect(service.status().queued).toBe(1); expect(service.status().lastOutgoing).toBeNull();
    await service.tick();
    const [lead] = store.list();
    expect(lead).toMatchObject({ name: 'Новый человек', handle: 'new.person', stage: 'new', amount: 0, source: 'instagram',
      instagram: { accountId: connected.accountId, userId: '99001' } });
    expect(lead.history.map(event => event.kind)).toEqual(['created', 'outgoing']);
    expect(service.status()).toMatchObject({ queued: 0, pendingProfiles: 0 });
    expect(client.profile).toHaveBeenCalledWith(connected, '99001');
  });
  it('ignores inbound messages, automated echoes, read receipts, self-messages and foreign accounts', async () => {
    const echo = outgoing();
    service.receive(payload({ ...echo, message: { mid: 'inbound', is_echo: false } }, { ...echo, message: { ...echo.message, app_id: '999' } },
      { ...echo, message: { ...echo.message, is_deleted: true } }, { ...echo, sender: { id: '123' } },
      { ...echo, recipient: { id: connected.accountId } }, { read: { mid: 'read' } }, { message: { is_echo: true } }));
    service.receive({ object: 'instagram', entry: [{ id: '111', messaging: [echo] }] });
    service.receive({ object: 'page', entry: [] });
    await service.tick(); expect(store.list()).toHaveLength(0); expect(service.status().queued).toBe(0);
  });
  it('deduplicates retries across process restarts', async () => {
    service.receive(payload(outgoing(), outgoing())); await service.tick(); const original = store.list()[0];
    store.close(); store = new Store(directory); service = new InstagramIntegration(store, client);
    service.receive(payload(outgoing())); await service.tick();
    expect(store.list()).toHaveLength(1); expect(store.list()[0]).toEqual(original);
  });
  it('keeps stage, amount and notes on later outgoing messages', async () => {
    service.receive(payload(outgoing())); await service.tick();
    const [lead] = store.list(); store.save(prepareLead({ ...lead, stage: 'payment', note: 'Согласовали условия', amount: 35000 }, lead));
    service.receive(payload(outgoing('mid-2'))); await service.tick();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ stage: 'payment', note: 'Согласовали условия', amount: 35000 });
    expect(store.list()[0].history.filter(event => event.kind === 'outgoing')).toHaveLength(2);
  });
  it('attaches an existing manual contact and preserves its deal', async () => {
    const manual = prepareLead({ name: 'Мой клиент', handle: 'NEW.PERSON', stage: 'won', amount: 50000, source: 'manual', keyword: '',
      product: 'Сопровождение', note: 'Не потерять заметку', nextAction: '', due: '', priority: 'hot', lostReason: '' });
    store.save(manual); service.receive(payload(outgoing())); await service.tick();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ id: manual.id, stage: 'won', amount: 50000, note: manual.note, instagram: { userId: '99001' } });
    service.receive(payload(outgoing('later'))); await service.tick(); expect(store.list()).toHaveLength(1);
  });
  it('tracks a changed username by stable provider ID', async () => {
    service.receive(payload(outgoing())); await service.tick(); const leadId = store.list()[0].id;
    vi.mocked(client.profile).mockResolvedValue({ username: 'renamed.person' });
    store.db.prepare('UPDATE identities SET checked_at = 0').run(); service = new InstagramIntegration(store, client);
    service.receive(payload(outgoing('after-rename'))); await service.tick();
    expect(store.list()).toHaveLength(1); expect(store.list()[0]).toMatchObject({ id: leadId, handle: 'renamed.person' });
  });
  it('creates a real lead even if Meta withholds profile consent, without inventing a username', async () => {
    vi.mocked(client.profile).mockRejectedValue(new MetaError(100));
    service.receive(payload(outgoing())); await service.tick();
    expect(store.list()[0]).toMatchObject({ handle: '', stage: 'new', instagram: { userId: '99001' } });
    expect(service.status().pendingProfiles).toBe(1);
    expect(prepareLead({ ...store.list()[0], note: 'Можно редактировать без ника' }, store.list()[0])).toMatchObject({ handle: '', instagram: { userId: '99001' } });
    expect(() => prepareLead({ ...store.list()[0], handle: '' })).toThrow();
  });
  it('marks invalid access as requiring reconnection and keeps the lead', async () => {
    vi.mocked(client.profile).mockRejectedValue(new MetaError(190)); service.receive(payload(outgoing())); await service.tick();
    expect(service.status()).toMatchObject({ connected: true, needsReconnect: true, pendingProfiles: 1 }); expect(store.list()).toHaveLength(1);
  });
  it('rolls back a failed import and retries the durable event', async () => {
    service.receive(payload(outgoing())); const failing = vi.spyOn(store, 'save').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(service.tick()).rejects.toThrow('disk full'); expect(store.list()).toHaveLength(0); expect(service.status().queued).toBe(1);
    failing.mockRestore(); await service.tick(); expect(store.list()).toHaveLength(1); expect(service.status().queued).toBe(0);
  });
  it('does not recreate a contact after explicit deletion', async () => {
    service.receive(payload(outgoing())); await service.tick(); store.remove(store.list()[0].id);
    service.receive(payload(outgoing('new-message'))); await service.tick(); expect(store.list()).toHaveLength(0);
  });
  it('encrypts app secrets and access tokens and never exposes them in status', () => {
    const persisted = JSON.stringify(store.db.prepare('SELECT * FROM settings').all());
    expect(persisted).not.toContain(secret); expect(persisted).not.toContain(connected.token);
    expect(JSON.stringify(service.status())).not.toContain(secret); expect(JSON.stringify(service.status())).not.toContain(connected.token);
    expect(readFileSync(join(directory, 'key')).length).toBe(32);
  });
});

describe('Instagram authorization and signatures', () => {
  it('checks the signature over the unmodified raw body', () => {
    const raw = JSON.stringify(payload(outgoing()));
    expect(validSignature(Buffer.from(raw), sign(raw), secret)).toBe(true);
    expect(validSignature(Buffer.from(raw + ' '), sign(raw), secret)).toBe(false);
    for (const signature of [undefined, '', 'sha256=00', 'sha1=' + 'a'.repeat(64), 'sha256=' + 'g'.repeat(64)]) expect(validSignature(Buffer.from(raw), signature, secret)).toBe(false);
  });
  it('rejects absent, expired and replayed OAuth state', async () => {
    await expect(service.finishAuthorization('forged', 'code', false)).rejects.toThrow('устарела');
    const state = new URL(service.startAuthorization()).searchParams.get('state')!;
    await service.finishAuthorization(state, 'code', false); expect(client.connect).toHaveBeenCalledTimes(1);
    await expect(service.finishAuthorization(state, 'code', false)).rejects.toThrow('устарела');
    const expired = new URL(service.startAuthorization()).searchParams.get('state')!;
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 601_000);
    await expect(service.finishAuthorization(expired, 'code', false)).rejects.toThrow('устарела');
  });
  it('does not report a cancelled or failed OAuth flow as connected', async () => {
    store.deleteSetting('instagram.connection');
    let state = new URL(service.startAuthorization()).searchParams.get('state')!;
    await service.finishAuthorization(state, null, true); expect(service.status().connected).toBe(false); expect(service.status().oauthError).toContain('не предоставлено');
    state = new URL(service.startAuthorization()).searchParams.get('state')!; vi.mocked(client.connect).mockRejectedValue(new Error('sensitive upstream response'));
    await service.finishAuthorization(state, 'code', false); expect(service.status().connected).toBe(false); expect(service.status().oauthError).not.toContain('sensitive');
  });
  it('validates the tunnel origin and prevents changing credentials on a connected account', () => {
    for (const publicUrl of ['http://localhost:3001', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?token=x']) expect(() => service.configure({ ...settings, publicUrl })).toThrow();
    expect(() => service.configure({ ...settings, appId: '999999' })).toThrow('Сначала отключите');
  });
  it('uses the documented Instagram Login scopes and callback', () => {
    const settings = service.settings()!;
    const url = new URL(new MetaClient().authorize(settings, 'state-test'));
    expect(url.origin).toBe('https://www.instagram.com'); expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages');
    expect(url.searchParams.get('redirect_uri')).toBe('https://crm-test.example.com/auth/instagram/callback');
  });
});

describe('local API and public gateway separation', () => {
  it('serves CRM locally but exposes no CRM routes through the gateway', async () => {
    const local = await listen(createLocalApi(store, service, ['http://localhost:5173']));
    const gateway = await listen(createInstagramGateway(service, 'http://localhost:5173'));
    expect((await fetch(local + '/api/leads')).status).toBe(200);
    for (const path of ['/api/leads', '/api/integrations/instagram', '/api/integrations/instagram/settings', '/']) expect((await fetch(gateway + path)).status).toBe(404);
    expect((await fetch(local + '/api/leads', { headers: { Origin: 'https://attacker.example' } })).status).toBe(403);
    expect((await fetch(local + '/api/leads', { headers: { Host: 'attacker.example' } })).status).toBe(403);
    expect((await fetch(local + '/api/leads', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });
  it('verifies the Meta challenge and rejects unsigned or tampered events', async () => {
    const gateway = await listen(createInstagramGateway(service, 'http://localhost:5173'));
    const challenge = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': service.settings()!.verifyToken, 'hub.challenge': '12345' });
    expect(await (await fetch(`${gateway}/webhooks/instagram?${challenge}`)).text()).toBe('12345');
    challenge.set('hub.verify_token', 'wrong'); expect((await fetch(`${gateway}/webhooks/instagram?${challenge}`)).status).toBe(403);
    const raw = JSON.stringify(payload(outgoing()));
    expect((await fetch(gateway + '/webhooks/instagram', { method: 'POST', body: raw })).status).toBe(403);
    expect((await fetch(gateway + '/webhooks/instagram', { method: 'POST', body: raw + ' ', headers: { 'X-Hub-Signature-256': sign(raw) } })).status).toBe(403);
    expect((await fetch(gateway + '/webhooks/instagram', { method: 'POST', body: raw, headers: { 'X-Hub-Signature-256': sign(raw) } })).status).toBe(200);
    expect(service.status().queued).toBe(1); await service.tick(); expect(store.list()).toHaveLength(1);
  });
  it('validates writes, rejects duplicate handles and generates authoritative history', async () => {
    const local = await listen(createLocalApi(store, service, ['http://localhost:5173']));
    const lead = prepareLead({ name: 'Тест', handle: 'test.person', stage: 'new', amount: 0, source: 'manual', keyword: '', product: '', note: '', nextAction: '', due: '', priority: 'normal', lostReason: '' });
    const put = (id: string, data: unknown, contentType = 'application/json') => fetch(`${local}/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': contentType, Origin: 'http://localhost:5173' }, body: JSON.stringify(data) });
    expect((await put(lead.id, lead, 'text/plain')).status).toBe(415);
    expect((await put('wrong-id', lead)).status).toBe(400);
    const created = await put(lead.id, { ...lead, history: [{ at: lead.created, kind: 'created', text: 'Forged history' }] });
    expect(created.status).toBe(201); expect(await created.json()).toMatchObject({ history: [expect.objectContaining({ text: 'Контакт добавлен вручную' })] });
    expect((await put('duplicate', { ...lead, id: 'duplicate' })).status).toBe(409);
    expect((await put(lead.id, { ...lead, stage: 'lost', lostReason: '' })).status).toBe(400);
    expect(store.list()[0].stage).toBe('new');
    expect((await fetch(`${local}/api/leads/${lead.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(store.list()).toHaveLength(0);
  });
});
