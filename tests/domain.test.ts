import { describe, expect, it } from 'vitest';
import { createDemoLeads } from '../src/data/seed';
import { EMPTY_FILTERS, dateKey, dayOffset, dueInfo, filterLeads, getStats, leadsSchema, prepareLead } from '../src/lib/domain';
import { createCsv, csvCell } from '../src/lib/export';

describe('CRM rules', () => {
  it('preserves the original 20 contacts and sales totals', () => {
    const leads = leadsSchema.parse(createDemoLeads());
    expect(getStats(leads)).toMatchObject({ total: 20, active: 15, won: 3, revenue: 78000, potential: 365000, conversion: 15 });
  });
  it('normalizes handles and records stage changes without changing identity', () => {
    const lead = createDemoLeads()[0];
    const updated = prepareLead({ ...lead, handle: '  @Alina.SMM  ', stage: 'dialogue' }, lead);
    expect(updated.handle).toBe('alina.smm'); expect(updated.id).toBe(lead.id);
    expect(updated.history.at(-1)).toMatchObject({ kind: 'stage', to: 'dialogue' });
    expect(lead.history).toHaveLength(1);
  });
  it('clears pending tasks for closed deals and requires a refusal reason', () => {
    const lead = createDemoLeads()[0];
    expect(prepareLead({ ...lead, stage: 'won' }, lead)).toMatchObject({ nextAction: '', due: '' });
    expect(() => prepareLead({ ...lead, stage: 'lost', lostReason: '' }, lead)).toThrow('Укажите причину отказа');
  });
  it('rejects invalid amounts, handles, dates, and a date without an action', () => {
    const lead = createDemoLeads()[0];
    expect(() => prepareLead({ ...lead, amount: Infinity })).toThrow();
    expect(() => prepareLead({ ...lead, handle: '<script>' })).toThrow();
    expect(() => prepareLead({ ...lead, due: '2026-02-31' })).toThrow();
    expect(() => prepareLead({ ...lead, nextAction: '', due: dateKey() })).toThrow('Укажите действие');
  });
  it('combines text, source, stage, hot and due filters', () => {
    const leads = createDemoLeads();
    const result = filterLeads(leads, { ...EMPTY_FILTERS, query: '@ALINA', source: 'manychat', stage: 'new', attention: true, hot: true });
    expect(result.map(lead => lead.handle)).toEqual(['alina.smm']);
    expect(filterLeads(leads, { ...EMPTY_FILTERS, query: 'несуществующий человек' })).toEqual([]);
  });
  it('treats undated tasks separately from overdue tasks', () => {
    const lead = createDemoLeads()[0];
    expect(dueInfo({ ...lead, due: '' }).kind).toBe('neutral');
    expect(dueInfo({ ...lead, due: dayOffset(-1) }).kind).toBe('overdue');
    expect(dueInfo(lead).kind).toBe('today');
  });
});
describe('CSV export', () => {
  it('escapes quotes and prevents spreadsheet formula injection, including leading whitespace', () => {
    expect(csvCell('"имя"')).toBe('"""имя"""');
    expect(csvCell(' =HYPERLINK("bad")')).toBe('"\' =HYPERLINK(""bad"")"');
    expect(csvCell('@handle')).toBe('"\'@handle"');
  });
  it('exports only supplied rows with UTF-8 BOM and portable line breaks', () => {
    const csv = createCsv(createDemoLeads().slice(0, 1));
    expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('Алина Смирнова'); expect(csv).not.toContain('Мария Волкова');
  });
});
