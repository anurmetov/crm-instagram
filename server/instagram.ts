import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.ts';

export const settingsSchema = z.object({
  appId: z.string().regex(/^\d{5,40}$/, 'Укажите Instagram App ID из Meta'),
  appSecret: z.string().trim().min(16).max(256).optional(),
  publicUrl: z.url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  }, 'Нужен HTTPS-адрес туннеля без пути'),
});
export type Settings = z.infer<typeof settingsSchema> & { appSecret: string; verifyToken: string };
export type Connection = { accountId: string; username: string; token: string; expiresAt: number; refreshedAt: number; needsReconnect?: boolean };
const id = z.string().regex(/^\d{1,40}$/);
const echoSchema = z.object({
  sender: z.object({ id }), recipient: z.object({ id }), timestamp: z.number().int().nonnegative().max(8_000_000_000_000).optional(),
  message: z.object({ mid: z.string().min(1).max(1024), is_echo: z.literal(true), app_id: z.union([z.string(), z.number()]).optional(), is_deleted: z.boolean().optional() }),
});
const envelopeSchema = z.object({ object: z.literal('instagram'), entry: z.array(z.object({ id, messaging: z.array(z.unknown()).optional() })) });
type Echo = z.infer<typeof echoSchema>;
export type Profile = { username: string; name?: string };
export interface InstagramClient {
  authorize(settings: Settings, state: string): string;
  connect(settings: Settings, code: string): Promise<Connection>;
  profile(connection: Connection, userId: string): Promise<Profile>;
  refresh(connection: Connection): Promise<Connection>;
  unsubscribe(connection: Connection): Promise<void>;
}
export class MetaError extends Error {
  code: number;
  constructor(code = 0) { super('Instagram не выполнил запрос. Проверьте права приложения и подключение аккаунта.'); this.code = code; }
}
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const profileSchema = z.object({ username: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/), name: z.string().optional() });

export class MetaClient implements InstagramClient {
  private version: string;
  constructor(version = 'v24.0') {
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('Некорректная версия Instagram API');
    this.version = version;
  }
  private async request(url: string | URL, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error' });
    const body = await response.json() as { error?: { code?: number } };
    if (!response.ok || body.error) throw new MetaError(body.error?.code);
    return body;
  }
  private graph(path: string, token: string, method = 'GET', fields?: string) {
    const url = new URL(`https://graph.instagram.com/${this.version}/${path}`);
    if (fields) url.searchParams.set('fields', fields);
    return this.request(url, { method, headers: { Authorization: `Bearer ${token}` } });
  }
  authorize(settings: Settings, state: string) {
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.search = new URLSearchParams({ client_id: settings.appId, redirect_uri: `${settings.publicUrl}/auth/instagram/callback`,
      response_type: 'code', scope: 'instagram_business_basic,instagram_business_manage_messages', state,
      enable_fb_login: '0', force_authentication: '1' }).toString();
    return url.toString();
  }
  async connect(settings: Settings, code: string) {
    const short = z.object({ access_token: z.string().min(1) }).parse(await this.request('https://api.instagram.com/oauth/access_token', {
      method: 'POST', body: new URLSearchParams({ client_id: settings.appId, client_secret: settings.appSecret,
        grant_type: 'authorization_code', redirect_uri: `${settings.publicUrl}/auth/instagram/callback`, code }),
    }));
    const url = new URL('https://graph.instagram.com/access_token');
    url.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: settings.appSecret, access_token: short.access_token }).toString();
    const long = tokenSchema.parse(await this.request(url));
    // user_id, not the app-scoped `id`, is used in entry.id and messaging webhooks.
    const account = z.object({ user_id: id, username: profileSchema.shape.username }).parse(await this.graph('me', long.access_token, 'GET', 'user_id,username'));
    const subscribeUrl = new URL(`https://graph.instagram.com/${this.version}/${account.user_id}/subscribed_apps`);
    subscribeUrl.searchParams.set('subscribed_fields', 'messages');
    z.object({ success: z.literal(true) }).parse(await this.request(subscribeUrl, { method: 'POST', headers: { Authorization: `Bearer ${long.access_token}` } }));
    return { accountId: account.user_id, username: account.username.toLowerCase(), token: long.access_token,
      expiresAt: Date.now() + long.expires_in * 1000, refreshedAt: Date.now() };
  }
  async profile(connection: Connection, userId: string) {
    return profileSchema.parse(await this.graph(userId, connection.token, 'GET', 'name,username'));
  }
  async refresh(connection: Connection) {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: connection.token }).toString();
    const result = tokenSchema.parse(await this.request(url));
    return { ...connection, token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000, refreshedAt: Date.now(), needsReconnect: false };
  }
  async unsubscribe(connection: Connection) {
    z.object({ success: z.literal(true) }).parse(await this.graph(`${connection.accountId}/subscribed_apps`, connection.token, 'DELETE'));
  }
}

export function validSignature(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const digest = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(digest, Buffer.from(signature.slice(7), 'hex'));
}
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export class InstagramIntegration {
  store: Store;
  client: InstagramClient;
  private states = new Map<string, { expires: number; settings: Settings }>();
  private working = false;
  private lastProfileCheck = 0;
  private lastRefreshAttempt = 0;
  private generation = 0;
  constructor(store: Store, client: InstagramClient = new MetaClient()) { this.store = store; this.client = client; }
  settings() { return this.store.get<Settings>('instagram.settings'); }
  connection() { return this.store.get<Connection>('instagram.connection'); }
  configure(input: unknown) {
    const parsed = settingsSchema.parse(input), previous = this.settings();
    const appSecret = parsed.appSecret || previous?.appSecret;
    if (!appSecret) throw new Error('Укажите Instagram App Secret');
    if (this.connection() && (previous?.appId !== parsed.appId || previous?.appSecret !== appSecret)) {
      throw new Error('Сначала отключите текущий аккаунт перед сменой приложения Meta');
    }
    this.generation++; this.states.clear();
    this.store.set('instagram.settings', { ...parsed, publicUrl: parsed.publicUrl.replace(/\/$/, ''), appSecret, verifyToken: previous?.verifyToken ?? randomBytes(24).toString('hex') });
  }
  status() {
    const settings = this.settings(), connection = this.connection();
    const lastOutgoing = this.store.get<string>('instagram.lastOutgoing');
    const pendingProfiles = Number(this.store.db.prepare("SELECT count(*) AS count FROM leads WHERE handle IS NULL AND json_extract(body, '$.instagram') IS NOT NULL").get()?.count ?? 0);
    return { configured: !!settings, appId: settings?.appId ?? '', publicUrl: settings?.publicUrl ?? '', verifyToken: settings?.verifyToken ?? '',
      callbackUrl: settings ? `${settings.publicUrl}/auth/instagram/callback` : '', webhookUrl: settings ? `${settings.publicUrl}/webhooks/instagram` : '',
      connected: !!connection, username: connection?.username ?? '', expiresAt: connection?.expiresAt ?? null,
      needsReconnect: !!connection && (connection.needsReconnect === true || connection.expiresAt <= Date.now()),
      lastOutgoing: lastOutgoing ?? null, pendingProfiles, oauthError: this.store.get<string>('instagram.oauthError') ?? '',
      queued: Number(this.store.db.prepare('SELECT count(*) AS count FROM inbox WHERE processed = 0').get()?.count ?? 0) };
  }
  startAuthorization() {
    const settings = this.settings();
    if (!settings) throw new Error('Сначала сохраните настройки приложения Meta и адрес туннеля');
    for (const [state, value] of this.states) if (value.expires <= Date.now()) this.states.delete(state);
    if (this.states.size >= 10) throw new Error('Слишком много попыток подключения. Подождите 10 минут.');
    const state = randomBytes(32).toString('hex');
    this.states.set(state, { expires: Date.now() + 600_000, settings });
    this.store.deleteSetting('instagram.oauthError');
    return this.client.authorize(settings, state);
  }
  async finishAuthorization(state: string, code: string | null, denied: boolean) {
    const pending = this.states.get(state); this.states.delete(state);
    if (!pending || pending.expires < Date.now()) throw new Error('Авторизация устарела. Откройте подключение заново в CRM.');
    if (denied || !code) { this.store.set('instagram.oauthError', 'Разрешение Instagram не предоставлено. Повторите подключение.'); return; }
    const generation = this.generation;
    try {
      const connection = await this.client.connect(pending.settings, code);
      if (generation !== this.generation) throw new Error('Подключение отменено');
      const previous = this.connection();
      if (previous && previous.accountId !== connection.accountId) throw new Error('Отключите текущий аккаунт перед подключением другого');
      this.store.set('instagram.connection', connection);
      this.store.deleteSetting('instagram.oauthError');
    } catch {
      this.store.set('instagram.oauthError', 'Не удалось подключить Instagram. Проверьте App ID, App Secret, адрес возврата и права instagram_business_basic / instagram_business_manage_messages в Meta.');
    }
  }
  async disconnect() {
    const connection = this.connection();
    // Require confirmation from Meta so a failed revocation is not reported as a full disconnect.
    if (connection) {
      try { await this.client.unsubscribe(connection); }
      catch (error) { if (!(error instanceof MetaError && error.code === 190)) throw error; }
    }
    this.generation++; this.states.clear();
    this.store.deleteSetting('instagram.connection');
    this.store.deleteSetting('instagram.oauthError');
  }
  receive(payload: unknown) {
    const parsed = envelopeSchema.safeParse(payload), connection = this.connection();
    if (!parsed.success || !connection) return;
    this.store.transaction(() => {
      for (const entry of parsed.data.entry) {
        if (entry.id !== connection.accountId) continue;
        for (const value of entry.messaging ?? []) {
          const result = echoSchema.safeParse(value);
          if (!result.success) continue;
          const echo = result.data;
          if (echo.sender.id !== connection.accountId || echo.recipient.id === connection.accountId || echo.message.app_id !== undefined || echo.message.is_deleted) continue;
          this.store.db.prepare('INSERT OR IGNORE INTO inbox(account_id, mid, body, received_at) VALUES (?, ?, ?, ?)')
            .run(connection.accountId, echo.message.mid, JSON.stringify(echo), Date.now());
        }
      }
    });
  }
  private ingest(accountId: string, echo: Echo) {
    this.store.transaction(() => {
      const queued = this.store.db.prepare('SELECT processed FROM inbox WHERE account_id = ? AND mid = ?').get(accountId, echo.message.mid);
      if (!queued || queued.processed) return;
      const identity = this.store.db.prepare('SELECT lead_id FROM identities WHERE account_id = ? AND user_id = ?').get(accountId, echo.recipient.id);
      // A deleted lead stays deleted when Meta retries or another message arrives.
      if (identity && !identity.lead_id) {
        this.store.db.prepare('UPDATE inbox SET processed = 1 WHERE account_id = ? AND mid = ?').run(accountId, echo.message.mid); return;
      }
      const now = new Date().toISOString(), at = echo.timestamp ? new Date(echo.timestamp).toISOString() : now;
      let lead = identity ? this.store.find(String(identity.lead_id)) : undefined;
      if (!lead) {
        lead = { id: randomUUID(), name: 'Контакт Instagram', handle: '', stage: 'new', amount: 0, source: 'instagram', keyword: '',
          product: '', note: '', nextAction: '', due: '', priority: 'normal', lostReason: '', color: 0, created: now, updated: now,
          instagram: { accountId, userId: echo.recipient.id },
          history: [{ at: now, kind: 'created', to: 'new', text: 'Добавлен после вашего исходящего сообщения в Instagram' }] };
      }
      lead = { ...lead, updated: now, history: [...lead.history, { at, kind: 'outgoing', text: 'Вы отправили сообщение в Instagram' }] };
      this.store.save(lead);
      this.store.db.prepare('INSERT OR IGNORE INTO identities(account_id, user_id, lead_id) VALUES (?, ?, ?)').run(accountId, echo.recipient.id, lead.id);
      this.store.db.prepare('UPDATE inbox SET processed = 1 WHERE account_id = ? AND mid = ?').run(accountId, echo.message.mid);
      this.store.set('instagram.lastOutgoing', now);
    });
  }
  private async resolveProfile(connection: Connection, userId: string) {
    try {
      const profile = await this.client.profile(connection, userId);
      if (this.connection()?.accountId !== connection.accountId) return;
      const row = this.store.db.prepare('SELECT lead_id FROM identities WHERE account_id = ? AND user_id = ?').get(connection.accountId, userId);
      const current = row?.lead_id ? this.store.find(String(row.lead_id)) : undefined;
      if (!current) return;
      const handle = profileSchema.parse(profile).username.toLowerCase(), matching = this.store.byHandle(handle);
      this.store.transaction(() => {
        const pristine = current.name === 'Контакт Instagram' && current.stage === 'new' && current.amount === 0 && !current.note && !current.product && !current.nextAction && !current.due && current.priority === 'normal';
        if (matching && matching.id !== current.id && !matching.instagram && pristine) {
          // Attach a manually entered card without resetting its stage, notes or deal amount.
          this.store.save({ ...matching, instagram: current.instagram, updated: new Date().toISOString(), history: [...matching.history, ...current.history] });
          this.store.db.prepare('UPDATE identities SET lead_id = ? WHERE account_id = ? AND user_id = ?').run(matching.id, connection.accountId, userId);
          this.store.remove(current.id);
        } else if (!matching || matching.id === current.id) {
          this.store.save({ ...current, handle, name: current.name === 'Контакт Instagram' ? (profile.name?.trim() || handle).slice(0, 60) : current.name });
        }
      });
    } catch (error) {
      if (error instanceof MetaError && error.code === 190 && this.connection()?.token === connection.token) this.store.set('instagram.connection', { ...connection, needsReconnect: true });
      // Missing profile consent must never prevent creating a lead. Retry later.
    } finally {
      this.store.db.prepare('UPDATE identities SET checked_at = ? WHERE account_id = ? AND user_id = ?').run(Date.now(), connection.accountId, userId);
    }
  }
  async tick() {
    if (this.working) return;
    const connection = this.connection();
    if (!connection) return;
    this.working = true;
    try {
      const rows = this.store.db.prepare('SELECT body FROM inbox WHERE processed = 0 AND account_id = ? ORDER BY received_at LIMIT 50').all(connection.accountId);
      for (const row of rows) this.ingest(connection.accountId, echoSchema.parse(JSON.parse(String(row.body))));
      if (!connection.needsReconnect && connection.expiresAt > Date.now()) {
        if (Date.now() - this.lastProfileCheck >= 30_000) {
          this.lastProfileCheck = Date.now();
          const unresolved = this.store.db.prepare('SELECT user_id FROM identities WHERE account_id = ? AND lead_id IS NOT NULL AND checked_at < ? ORDER BY checked_at LIMIT 3')
            .all(connection.accountId, Date.now() - 300_000);
          for (const row of unresolved) await this.resolveProfile(connection, String(row.user_id));
        }
        if (connection.expiresAt - Date.now() < 7 * 86400_000 && Date.now() - connection.refreshedAt > 86400_000 && Date.now() - this.lastRefreshAttempt > 3600_000) {
          this.lastRefreshAttempt = Date.now();
          try {
            const refreshed = await this.client.refresh(connection);
            if (this.connection()?.token === connection.token) this.store.set('instagram.connection', refreshed);
          } catch (error) {
            if (error instanceof MetaError && error.code === 190 && this.connection()?.token === connection.token) this.store.set('instagram.connection', { ...connection, needsReconnect: true });
          }
        }
      }
    } finally { this.working = false; }
  }
}
