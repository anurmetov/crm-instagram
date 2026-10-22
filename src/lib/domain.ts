import { z } from 'zod';

export const STAGES = [
  { id: 'new', name: 'Новые лиды', short: 'Новые', color: '#aaa1ca' },
  { id: 'dialogue', name: 'Переписка', short: 'Переписка', color: '#a099c8' },
  { id: 'booked', name: 'Созвон назначен', short: 'Созвон', color: '#8b9acb' },
  { id: 'called', name: 'Созвон проведён', short: 'После созвона', color: '#b0ba8c' },
  { id: 'payment', name: 'Ждём оплату', short: 'Ждём оплату', color: '#bdcb8b' },
  { id: 'won', name: 'Оплачено', short: 'Оплачено', color: '#8eae61' },
  { id: 'lost', name: 'Отказ', short: 'Отказ', color: '#be9caa' },
] as const;
export const stageSchema = z.enum(['new', 'dialogue', 'booked', 'called', 'payment', 'won', 'lost']);
export type StageId = z.infer<typeof stageSchema>;
export const stageById = Object.fromEntries(STAGES.map(stage => [stage.id, stage])) as Record<StageId, typeof STAGES[number]>;
export const historySchema = z.object({
  at: z.iso.datetime(), kind: z.enum(['created', 'stage', 'note', 'incoming', 'outgoing', 'task']),
  text: z.string(), to: stageSchema.optional(),
});
export const leadFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(60),
  handle: z.string().trim().transform(value => value.replace(/^@/, '').toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, 'Ник: до 30 латинских букв, цифр, точек и подчёркиваний')),
  stage: stageSchema,
  amount: z.number().finite().min(0).max(100_000_000),
  source: z.enum(['manual', 'manychat', 'instagram']),
  keyword: z.string().max(100).default(''),
  product: z.string().trim().max(120),
  note: z.string().trim().max(2000),
  nextAction: z.string().trim().max(160),
  due: z.union([z.literal(''), z.iso.date()]),
  priority: z.enum(['normal', 'hot']),
  lostReason: z.string().max(160),
});
export const leadSchema = leadFieldsSchema.extend({
  id: z.string().min(1), color: z.number().int().nonnegative(),
  created: z.iso.datetime(), updated: z.iso.datetime(), history: z.array(historySchema),
});
export const leadsSchema = z.array(leadSchema);
export type Lead = z.infer<typeof leadSchema>;
export type LeadFields = z.infer<typeof leadFieldsSchema>;
export type Page = 'pipeline' | 'leads' | 'analytics' | 'overview';
export const PAGE_META: Record<Page, { title: string; description: string }> = {
  pipeline: { title: 'Воронка продаж', description: 'От первого «привет» до первой оплаты.' },
  leads: { title: 'Все контакты', description: 'Все ваши знакомства и диалоги в одном месте.' },
  analytics: { title: 'Аналитика продаж', description: 'Смотрите, как диалоги превращаются в сделки.' },
  overview: { title: 'Привет, Адам', description: 'Ваши лиды, успешные сделки и продажи — всё перед глазами.' },
};
export const isActive = (lead: Pick<Lead, 'stage'>) => lead.stage !== 'won' && lead.stage !== 'lost';
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function dayOffset(days: number) {
  const date = new Date(); date.setDate(date.getDate() + days); return dateKey(date);
}
export const money = (amount: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
export const shortDate = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') : 'Без даты';
export const sourceLabel = (source: Lead['source']) => ({ manual: 'Вручную', manychat: 'ManyChat', instagram: 'Instagram' })[source];
export function dueInfo(lead: Lead) {
  if (lead.stage === 'won') return { text: 'Сделка закрыта', kind: 'done' };
  if (lead.stage === 'lost') return { text: 'Отказ', kind: 'neutral' };
  if (!lead.nextAction || !lead.due) return { text: lead.nextAction ? 'Без даты' : 'Без задачи', kind: 'neutral' };
  const today = dateKey();
  if (lead.due < today) return { text: 'Просрочено', kind: 'overdue' };
  if (lead.due === today) return { text: 'Сегодня', kind: 'today' };
  return { text: lead.due === dayOffset(1) ? 'Завтра' : shortDate(lead.due), kind: 'neutral' };
}
export const needsAttention = (lead: Lead) => isActive(lead) && !!lead.nextAction && !!lead.due && lead.due <= dateKey();
export function getStats(leads: Lead[]) {
  const active = leads.filter(isActive), won = leads.filter(lead => lead.stage === 'won');
  return {
    active: active.length, total: leads.length, won: won.length,
    potential: active.reduce((sum, lead) => sum + lead.amount, 0),
    revenue: won.reduce((sum, lead) => sum + lead.amount, 0),
    conversion: leads.length ? Math.round(won.length / leads.length * 100) : 0,
  };
}
export function prepareLead(fields: LeadFields, previous?: Lead): Lead {
  const clean = leadFieldsSchema.parse(fields);
  if (clean.stage === 'lost' && !clean.lostReason.trim()) throw new Error('Укажите причину отказа');
  if (clean.due && !clean.nextAction) throw new Error('Укажите действие для выбранной даты');
  if (!isActive(clean)) { clean.nextAction = ''; clean.due = ''; }
  if (clean.source === 'manual') clean.keyword = '';
  if (clean.stage !== 'lost') clean.lostReason = '';
  const now = new Date().toISOString();
  const history: Lead['history'] = previous ? [...previous.history] : [{ at: now, kind: 'created', to: 'new', text: 'Контакт добавлен вручную' }];
  if (previous?.stage !== clean.stage && (previous || clean.stage !== 'new')) {
    history.push({ at: now, kind: 'stage', to: clean.stage, text: `Переход в «${stageById[clean.stage].name}»` });
  }
  if (previous && previous.note !== clean.note) history.push({ at: now, kind: 'note', text: 'Заметки обновлены' });
  if (previous && (previous.nextAction !== clean.nextAction || previous.due !== clean.due)) {
    history.push({ at: now, kind: 'task', text: clean.nextAction ? `Следующий шаг: ${clean.nextAction}` : 'Задача завершена' });
  }
  return { ...clean, id: previous?.id ?? crypto.randomUUID(), created: previous?.created ?? now, updated: now, color: previous?.color ?? Math.floor(Math.random() * 6), history };
}
export type Filters = { query: string; source: string; period: string; attention: boolean; hot: boolean; stage: string };
export const EMPTY_FILTERS: Filters = { query: '', source: 'all', period: 'all', attention: false, hot: false, stage: 'all' };
export function userError(error: unknown, fallback = 'Не удалось выполнить действие') {
  return error instanceof z.ZodError ? error.issues[0]?.message || fallback : error instanceof Error ? error.message : fallback;
}
export function filterLeads(leads: Lead[], filters: Filters) {
  const query = filters.query.trim().toLowerCase().replace(/^@/, '');
  const monthStart = dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  return leads.filter(lead =>
    (!query || [lead.name, lead.handle, lead.product, lead.note].some(value => value.toLowerCase().includes(query))) &&
    (filters.source === 'all' || lead.source === filters.source) &&
    (filters.stage === 'all' || lead.stage === filters.stage) &&
    (!filters.attention || needsAttention(lead)) && (!filters.hot || lead.priority === 'hot') &&
    (filters.period === 'all' || lead.created.slice(0, 10) >= (filters.period === 'week' ? dayOffset(-6) : monthStart))
  );
}
