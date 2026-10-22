import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoLeads } from '../src/data/seed';
import { ApiLeadsRepository, LocalLeadsRepository } from '../src/services/leads';

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
describe('local repository', () => {
  it('imports existing mockup data without overwriting it', async () => {
    const storage = memory(), original = createDemoLeads().slice(0, 2);
    storage.setItem('potok-crm-demo-v1', JSON.stringify(original));
    const repository = new LocalLeadsRepository(storage);
    expect(await repository.list()).toEqual(original);
    await repository.save({ ...original[0], note: 'Обновлённая заметка' });
    expect(storage.getItem('potok-crm-demo-v1')).toBe(JSON.stringify(original));
    expect(await new LocalLeadsRepository(storage).list()).toHaveLength(2);
  });
  it('rejects duplicate handles on save', async () => {
    const repository = new LocalLeadsRepository(memory()), leads = await repository.list();
    await expect(repository.save({ ...leads[0], id: 'duplicate' })).rejects.toThrow('уже есть');
    expect(await repository.list()).toHaveLength(20);
  });
  it('keeps corrupt storage intact instead of silently resetting contacts', async () => {
    const storage = memory(); storage.setItem('potok-crm-v2', '[{"invalid":true}]');
    await expect(new LocalLeadsRepository(storage).list()).rejects.toThrow('сохранённые данные');
    expect(storage.getItem('potok-crm-v2')).toBe('[{"invalid":true}]');
  });
  it('reports failed persistence instead of claiming a successful save', async () => {
    const storage = memory(), repository = new LocalLeadsRepository(storage), leads = await repository.list();
    storage.setItem = () => { throw new Error('quota'); };
    await expect(repository.save(leads[0])).rejects.toThrow('Не удалось сохранить');
  });
});
describe('HTTP repository', () => {
  beforeEach(() => vi.unstubAllGlobals());
  it('uses cookie credentials and validates server data', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(createDemoLeads()))); vi.stubGlobal('fetch', fetch);
    expect(await new ApiLeadsRepository('/api/').list()).toHaveLength(20);
    expect(fetch).toHaveBeenCalledWith('/api/leads', expect.objectContaining({ credentials: 'include', method: 'GET' }));
    fetch.mockResolvedValueOnce(new Response('[{"invalid":true}]'));
    await expect(new ApiLeadsRepository().list()).rejects.toThrow();
  });
  it('surfaces auth and duplicate errors and accepts empty DELETE responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(new Response('', { status: 409 })).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    const repository = new ApiLeadsRepository();
    await expect(repository.list()).rejects.toThrow('Войдите');
    await expect(repository.save(createDemoLeads()[0])).rejects.toThrow('существует');
    await expect(repository.remove('demo-0')).resolves.toBeUndefined();
  });
});
