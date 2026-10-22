import { ArrowRight, CalendarDays, Check, CheckCheck, Clock3, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { dateKey, dueInfo, isActive, shortDate } from '../lib/domain';
import type { Lead } from '../lib/domain';
import { Avatar, EmptyState } from './ui';

export function Tasks({ leads, onOpen, onComplete, onError }: { leads: Lead[]; onOpen: (lead: Lead) => void; onComplete: (lead: Lead) => Promise<void>; onError: (message: string) => void }) {
  const [filter, setFilter] = useState('all'), [busy, setBusy] = useState<string[]>([]);
  const tasks = leads.filter(lead => isActive(lead) && lead.nextAction);
  const overdue = tasks.filter(lead => lead.due && lead.due < dateKey()), today = tasks.filter(lead => lead.due === dateKey());
  const visible = tasks.filter(lead => filter === 'all' || (filter === 'today' ? lead.due === dateKey() : lead.due && lead.due < dateKey())).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const groups = [
    { title: 'Нужно догнать', subtitle: 'Можно начать с небольшого сообщения', kind: 'overdue', icon: Clock3, data: visible.filter(lead => lead.due && lead.due < dateKey()) },
    { title: 'Сегодня', subtitle: 'Ваши маленькие шаги к большим сделкам', kind: 'today', icon: CalendarDays, data: visible.filter(lead => lead.due === dateKey()) },
    { title: 'Впереди', subtitle: 'Уже запланировано', kind: 'future', icon: CalendarDays, data: visible.filter(lead => lead.due > dateKey() || !lead.due) },
  ];
  return <div className="tasks-page"><div className="task-overview"><div><span className="task-overview-icon"><CheckCheck size={23} /></span><div><h2>Один шаг за раз.</h2><p>Вы на связи — значит, сделка движется.</p></div></div><span><b>{today.length}</b> на сегодня <i /> <b>{overdue.length}</b> просрочено</span></div>
    <div className="task-page-toolbar"><h2>План действий<span className="count-pill">{tasks.length}</span></h2><div className="segmented">{[['all', 'Все'], ['today', 'Сегодня'], ['overdue', 'Просрочены']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
    {!visible.length && <div className="panel"><EmptyState title="Можно выдохнуть" description="В этом списке нет задач. Назначьте следующий шаг в карточке контакта." /></div>}
    {groups.filter(group => group.data.length).map(group => <section className={`task-group ${group.kind}`} key={group.kind}><header><span className="task-group-icon"><group.icon size={17} /></span><div><h3>{group.title}<span>{group.data.length}</span></h3><p>{group.subtitle}</p></div></header><div className="task-group-body">{group.data.map(lead => <div className="task-row" key={lead.id}><button className="task-check" aria-label={`Завершить: ${lead.nextAction}`} disabled={busy.includes(lead.id)} onClick={async () => { setBusy(current => [...current, lead.id]); try { await onComplete(lead); } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось завершить задачу'); } finally { setBusy(current => current.filter(id => id !== lead.id)); } }}>{busy.includes(lead.id) ? <LoaderCircle className="spin" size={15} /> : <Check size={16} />}</button><button className="task-person" onClick={() => onOpen(lead)}><Avatar lead={lead} /><span><b>{lead.nextAction}</b><small>{lead.name} · @{lead.handle}</small></span></button><span className={`task-due ${dueInfo(lead).kind}`}>{lead.due ? shortDate(lead.due) : 'Без даты'}</span><button className="icon-btn task-open" aria-label={`Открыть задачу ${lead.name}`} onClick={() => onOpen(lead)}><ArrowRight size={16} /></button></div>)}</div></section>)}
  </div>;
}
