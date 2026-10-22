import { createDemoLeads } from '../data/seed';
import { leadSchema, leadsSchema } from '../lib/domain';
import type { Lead } from '../lib/domain';

export interface LeadsRepository {
  list(): Promise<Lead[]>;
  save(lead: Lead): Promise<Lead>;
  remove(id: string): Promise<void>;
}
const STORAGE_KEY = 'potok-crm-v2';
const LEGACY_KEY = 'potok-crm-demo-v1';

export class LocalLeadsRepository implements LeadsRepository {
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {}
  private get store() { return this.storage ?? localStorage; }
  private read() {
    const saved = this.store.getItem(STORAGE_KEY) ?? this.store.getItem(LEGACY_KEY);
    if (saved) {
      let value: unknown;
      try { value = JSON.parse(saved); }
      catch { throw new Error('Сохранённые данные повреждены. Они остаются в браузере: сделайте резервную копию перед очисткой хранилища.'); }
      const result = leadsSchema.safeParse(value);
      if (!result.success) throw new Error('Не удалось прочитать сохранённые данные. Они остаются в браузере. Сделайте резервную копию перед очисткой хранилища.');
      return result.data;
    }
    const leads = createDemoLeads();
    this.write(leads);
    return leads;
  }
  private write(leads: Lead[]) {
    try { this.store.setItem(STORAGE_KEY, JSON.stringify(leads)); }
    catch { throw new Error('Не удалось сохранить данные в браузере. Проверьте свободное место и разрешение на хранение данных.'); }
  }
  async list() { return this.read(); }
  async save(lead: Lead) {
    const validated = leadSchema.parse(lead);
    const leads = this.read();
    if (leads.some(item => item.handle === validated.handle && item.id !== validated.id)) throw new Error('Контакт с таким Instagram-ником уже есть в базе');
    const exists = leads.some(item => item.id === validated.id);
    this.write(exists ? leads.map(item => item.id === validated.id ? validated : item) : [validated, ...leads]);
    return validated;
  }
  async remove(id: string) { this.write(this.read().filter(lead => lead.id !== id)); }
}

export class ApiLeadsRepository implements LeadsRepository {
  constructor(private baseUrl = '/api') {}
  private async request(path: string, method = 'GET', body?: Lead): Promise<unknown> {
    const response = await fetch(this.baseUrl.replace(/\/$/, '') + path, {
      method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const messages: Record<number, string> = { 401: 'Войдите в аккаунт, чтобы продолжить', 403: 'Нет доступа к этому действию', 409: 'Контакт с таким ником уже существует' };
      throw new Error(messages[response.status] || `Сервер не выполнил запрос (${response.status}). Попробуйте ещё раз.`);
    }
    return response.status === 204 ? undefined : response.json();
  }
  async list() {
    const result = leadsSchema.safeParse(await this.request('/leads'));
    if (!result.success) throw new Error('Сервер вернул данные в неизвестном формате. Обратитесь к администратору.');
    return result.data;
  }
  async save(lead: Lead) {
    const result = leadSchema.safeParse(await this.request(`/leads/${encodeURIComponent(lead.id)}`, 'PUT', lead));
    if (!result.success) throw new Error('Сервер не подтвердил сохранение контакта. Обновите данные перед повторной попыткой.');
    return result.data;
  }
  async remove(id: string) { await this.request(`/leads/${encodeURIComponent(id)}`, 'DELETE'); }
}
export const dataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo';
export const leadsRepository: LeadsRepository = dataMode === 'api'
  ? new ApiLeadsRepository(import.meta.env.VITE_API_BASE_URL || '/api') : new LocalLeadsRepository();
