import { describe, expect, it } from 'vitest';
import { prepareLead } from '../src/lib/domain';
import { MemoryLeadsRepository } from '../src/services/leads';

describe('in-memory demo repository', () => {
  it('creates, edits and deletes contacts during one session', () => {
    const repository = new MemoryLeadsRepository();
    const lead = prepareLead({ ...repository.list()[0], name: 'Новый контакт', handle: '@DEMO.NEW' });
    const saved = repository.save(lead);
    expect(saved.handle).toBe('demo.new');
    expect(repository.list()).toHaveLength(21);
    repository.save(prepareLead({ ...saved, stage: 'dialogue', note: 'Новая заметка' }, saved));
    expect(repository.list()[0]).toMatchObject({ id: saved.id, stage: 'dialogue', note: 'Новая заметка' });
    expect(repository.list()[0].history.at(-1)?.kind).toBe('note');
    repository.remove(saved.id);
    expect(repository.list()).toHaveLength(20);
    expect(repository.list().some(item => item.id === saved.id)).toBe(false);
  });

  it('starts each app instance with fresh demo data', () => {
    const first = new MemoryLeadsRepository(), original = first.list();
    first.save({ ...original[0], stage: 'won', note: 'Изменено в первой вкладке' });
    first.remove(original[1].id);
    const second = new MemoryLeadsRepository();
    expect(second.list()).toEqual(original);
    expect(first.list()).toHaveLength(19);
  });

  it('rejects duplicate handles after normalizing case and @', () => {
    const repository = new MemoryLeadsRepository(), [lead] = repository.list();
    expect(() => repository.save({ ...lead, id: 'duplicate', handle: '@ALINA.SMM' })).toThrow('уже есть');
    expect(repository.list()).toHaveLength(20);
  });

  it('validates edits before changing the session data', () => {
    const repository = new MemoryLeadsRepository(), [lead] = repository.list();
    expect(() => repository.save({ ...lead, amount: -1 })).toThrow();
    expect(() => repository.save({ ...lead, handle: '' })).toThrow();
    expect(repository.list()[0]).toEqual(lead);
  });

  it('protects stored contacts and history from unsaved edits', () => {
    const repository = new MemoryLeadsRepository(), [lead] = repository.list();
    const saved = repository.save({ ...lead, note: 'Сохранено' });
    saved.note = 'Не сохранено';
    saved.history[0].text = 'Не сохранено';
    lead.history.length = 0;
    expect(repository.list()[0]).toMatchObject({ note: 'Сохранено' });
    expect(repository.list()[0].history).toHaveLength(1);
    expect(repository.list()[0].history[0].text).not.toBe('Не сохранено');
  });
});
