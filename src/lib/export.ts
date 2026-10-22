import { money, sourceLabel, stageById, dateKey } from './domain';
import type { Lead } from './domain';

export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function createCsv(leads: Lead[]) {
  const rows = [['Имя', 'Instagram', 'Этап', 'Сумма', 'Источник', 'Продукт', 'Следующее действие', 'Дата', 'Заметки'],
    ...leads.map(lead => [lead.name, '@' + lead.handle, stageById[lead.stage].name, lead.amount, sourceLabel(lead.source), lead.product, lead.nextAction, lead.due, lead.note])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function exportLeads(leads: Lead[]) {
  const url = URL.createObjectURL(new Blob([createCsv(leads)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `potok-${dateKey()}.csv`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const exportLabel = (leads: Lead[]) => `${leads.length} контактов · ${money(leads.reduce((sum, lead) => sum + lead.amount, 0))}`;
