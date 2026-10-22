import { ArrowDownWideNarrow, ArrowRight, Check, ChevronDown, Download, Flame, GripVertical, LayoutGrid, List, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EMPTY_FILTERS, STAGES, filterLeads, isActive, money, needsAttention, stageById } from '../lib/domain';
import type { Filters, Lead, Page, StageId } from '../lib/domain';
import { dataMode } from '../services/leads';
import { Avatar, Dialog, DueBadge, EmptyState, SourceBadge, StageBadge } from './ui';

type Props = {
  leads: Lead[]; page: Page; onOpen: (lead?: Lead, stage?: StageId) => void;
  onMove: (lead: Lead, stage: StageId) => Promise<void>;
  onExport: (leads: Lead[]) => void; onTasks: () => void; onError: (message: string) => void;
};
type Sort = 'recent' | 'name' | 'amount' | 'due';
function LeadCard({ lead, onOpen, onMove, onError }: { lead: Lead; onOpen: Props['onOpen']; onMove: Props['onMove']; onError: Props['onError'] }) {
  const next = STAGES[STAGES.findIndex(stage => stage.id === lead.stage) + 1];
  const [busy, setBusy] = useState(false);
  return <article className={`lead-card ${lead.priority === 'hot' ? 'hot-card' : ''}`} draggable
    onDragStart={event => { event.dataTransfer.setData('text/potok-lead', lead.id); event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging'); }}
    onDragEnd={event => event.currentTarget.classList.remove('dragging')}>
    <button className="card-main" onClick={() => onOpen(lead)} aria-label={`Открыть контакт ${lead.name}`}>
      <div className="lead-person"><Avatar lead={lead} /><div><h3>{lead.name}</h3><p>@{lead.handle}</p></div>{lead.priority === 'hot' ? <Flame size={14} className="hot-icon" /> : <GripVertical size={14} className="card-grip" />}</div>
      <div className="card-labels"><SourceBadge lead={lead} /><span className="mobile-card-stage"><StageBadge stage={lead.stage} /></span></div>
      <p className="lead-note">{lead.note || lead.product || 'Добавьте заметку о человеке'}</p>
      {lead.nextAction && <div className="card-next-action"><span /><p>{lead.nextAction}</p></div>}
      <div className="card-bottom"><b>{money(lead.amount)}</b><DueBadge lead={lead} /></div>
    </button>
    <div className="mobile-card-actions"><button className="text-btn" onClick={() => onOpen(lead)}>Открыть карточку</button>{isActive(lead) && next && <button className="quick-next" disabled={busy} aria-label={`Перевести ${lead.name} в ${next.name}`} onClick={async () => { setBusy(true); try { await onMove(lead, next.id); } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось изменить этап'); } finally { setBusy(false); } }}>{next.short}<ArrowRight size={14} /></button>}</div>
  </article>;
}

export function Pipeline({ leads, page, onOpen, onMove, onExport, onTasks, onError }: Props) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [view, setView] = useState<'board' | 'table'>(page === 'leads' ? 'table' : 'board');
  const [filterOpen, setFilterOpen] = useState(false), [sort, setSort] = useState<Sort>('recent');
  const [selected, setSelected] = useState<string[]>([]), [bulkBusy, setBulkBusy] = useState(false);
  const [dragOver, setDragOver] = useState<StageId | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); search.current?.focus(); } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const baseData = filterLeads(leads, { ...filters, stage: 'all' });
  const data = useMemo(() => filterLeads(leads, filters).sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'amount' ? b.amount - a.amount : sort === 'due'
      ? (a.due || '9999').localeCompare(b.due || '9999') : b.created.localeCompare(a.created)
  ), [leads, filters, sort]);
  const selection = data.filter(lead => selected.includes(lead.id));
  const filterCount = Number(filters.source !== 'all') + Number(filters.period !== 'all') + Number(filters.attention) + Number(filters.hot);
  const attention = leads.filter(needsAttention).length;
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value })); setSelected([]); }
  function toggleSelected(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  function reset() { setFilters({ ...EMPTY_FILTERS }); setSelected([]); }
  async function bulkMove(stage: StageId) {
    setBulkBusy(true);
    try { for (const lead of selection) await onMove(lead, stage); setSelected([]); }
    catch (error) { onError(error instanceof Error ? error.message : 'Не удалось обновить контакты'); }
    finally { setBulkBusy(false); }
  }
  return <>
    <section className="pipeline-panel" aria-label={page === 'leads' ? 'База контактов' : 'Воронка лидов'}>
      <header className="pipeline-header"><div><span className="section-overline">ВАШИ ДИАЛОГИ В ДВИЖЕНИИ</span><h2>{page === 'leads' ? 'База контактов' : 'От диалога к сделке'}<span className="count-pill">{data.length}</span></h2><p>{page === 'leads' ? 'Все люди, с которыми вы на связи' : 'У каждой сделки есть свой следующий шаг'}</p></div>
        <div className="view-toggle" aria-label="Вид отображения"><button aria-label="Карточки" aria-pressed={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => { setView('board'); setSelected([]); }}><LayoutGrid size={14} /><span className="desktop-word">Доска</span><span className="mobile-word">Карточки</span></button><button aria-label="Таблица" aria-pressed={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><List size={16} /><span>Таблица</span></button></div>
      </header>
      <div className="pipeline-controls"><div className="pipeline-toolbar"><label className="search-box"><Search size={17} /><input ref={search} type="search" value={filters.query} onChange={event => updateFilter('query', event.target.value)} placeholder="Найти человека…" aria-label="Поиск контактов" />{filters.query ? <button aria-label="Очистить поиск" onClick={() => updateFilter('query', '')}><X size={14} /></button> : <kbd>⌘ K</kbd>}</label>
        <div className="desktop-filters"><select className="pill-select" value={filters.source} aria-label="Источник контакта" onChange={event => updateFilter('source', event.target.value)}><option value="all">Все источники</option><option value="manychat">ManyChat</option><option value="instagram">Instagram</option><option value="manual">Вручную</option></select><button className={`filter-pill ${filters.attention ? 'active' : ''}`} aria-pressed={filters.attention} onClick={() => updateFilter('attention', !filters.attention)}><span className="attention-dot" />Требуют внимания</button></div>
        <button className={`filter-button ${filterCount ? 'has-filters' : ''}`} aria-label={`Открыть фильтры${filterCount ? `, активно ${filterCount}` : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={17} /><span>Фильтры</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
        <label className="sort-control"><ArrowDownWideNarrow size={14} /><select aria-label="Сортировка контактов" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recent">Сначала новые</option><option value="name">По имени</option><option value="amount">По сумме ↓</option><option value="due">По сроку задачи</option></select></label>
      </div>
      <div className="stage-tabs" aria-label="Этапы воронки"><button className={filters.stage === 'all' ? 'active' : ''} aria-pressed={filters.stage === 'all'} onClick={() => updateFilter('stage', 'all')}>Все этапы<span>{baseData.length}</span></button>{STAGES.map(stage => <button key={stage.id} className={filters.stage === stage.id ? 'active' : ''} aria-pressed={filters.stage === stage.id} onClick={() => updateFilter('stage', stage.id)}><i style={{ background: stage.color }} />{stage.short}<span>{baseData.filter(lead => lead.stage === stage.id).length}</span></button>)}</div></div>
      {(filters.query || filterCount > 0 || filters.stage !== 'all') && <div className="active-filter-note"><span>Найдено контактов: {data.length}</span><button onClick={reset}>Сбросить<X size={12} /></button></div>}
      {selection.length > 0 && <div className="bulk-bar"><span><Check size={14} />Выбрано: {selection.length}</span><select aria-label="Этап для выбранных контактов" value="" disabled={bulkBusy} onChange={event => void bulkMove(event.target.value as StageId)}><option value="" disabled>{bulkBusy ? 'Обновляем…' : 'Изменить этап'}</option>{STAGES.filter(stage => stage.id !== 'lost').map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select><button className="text-btn" onClick={() => onExport(selection)} disabled={bulkBusy}><Download size={14} /><span>CSV</span></button><button className="icon-btn" onClick={() => setSelected([])} aria-label="Снять выделение" disabled={bulkBusy}><X size={15} /></button></div>}
      {!data.length ? <EmptyState action={reset} /> : view === 'board' ? <>
        <div className="kanban" aria-label="Доска сделок">{STAGES.filter(stage => filters.stage === 'all' || filters.stage === stage.id).map(stage => {
          const group = data.filter(lead => lead.stage === stage.id);
          return <section className={`kanban-column ${dragOver === stage.id ? 'drag-over' : ''}`} key={stage.id} style={{ '--stage-color': stage.color } as CSSProperties}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(stage.id); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
            onDrop={event => { event.preventDefault(); setDragOver(null); const lead = leads.find(lead => lead.id === event.dataTransfer.getData('text/potok-lead')); if (lead && lead.stage !== stage.id) void onMove(lead, stage.id).catch(error => onError(error.message)); }}>
            <div className="column-header"><i /><h3>{stage.name}</h3><span>{group.length}</span><button aria-label={`Добавить контакт в ${stage.name}`} onClick={() => onOpen(undefined, stage.id)}><Plus size={14} /></button></div><div className="column-meta"><span>{money(group.reduce((sum, lead) => sum + lead.amount, 0))}</span><span>0{STAGES.indexOf(stage) + 1}</span></div>
            <div className="column-cards">{group.map(lead => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} onMove={onMove} onError={onError} />)}{!group.length && <div className="empty-column">Следующая история<br />начнётся здесь</div>}</div><button className="column-add" onClick={() => onOpen(undefined, stage.id)}><Plus size={13} />Добавить лида</button>
          </section>;
        })}</div>
        <div className="mobile-card-list"><div className="mobile-list-caption"><span>{filters.stage === 'all' ? 'Все ваши контакты' : stageById[filters.stage as StageId].name}</span><span>{data.length} контактов</span></div>{data.map(lead => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} onMove={onMove} onError={onError} />)}<button className="mobile-list-add" onClick={() => onOpen(undefined, filters.stage === 'all' ? undefined : filters.stage as StageId)}><Plus size={18} />Новый контакт</button></div>
      </> : <div className="table-scroll"><table className="leads-table"><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Выбрать все найденные контакты" checked={selection.length === data.length && data.length > 0} ref={node => { if (node) node.indeterminate = selection.length > 0 && selection.length < data.length; }} onChange={event => setSelected(event.target.checked ? data.map(lead => lead.id) : [])} /></th><th><button onClick={() => setSort('name')}>Человек{sort === 'name' && <ChevronDown size={12} />}</button></th><th>Этап</th><th><button onClick={() => setSort('amount')}>Сумма{sort === 'amount' && <ChevronDown size={12} />}</button></th><th>Источник</th><th><button onClick={() => setSort('due')}>Следующий шаг{sort === 'due' && <ChevronDown size={12} />}</button></th><th /></tr></thead>
        <tbody>{data.map(lead => <tr key={lead.id} className={selected.includes(lead.id) ? 'selected' : ''}><td className="check-cell"><input type="checkbox" aria-label={`Выбрать ${lead.name}`} checked={selected.includes(lead.id)} onChange={() => toggleSelected(lead.id)} /></td><td className="person-cell"><button className="table-person" onClick={() => onOpen(lead)}><Avatar lead={lead} /><span><b>{lead.name}{lead.priority === 'hot' && <Flame size={12} className="hot-icon" />}</b><small>@{lead.handle}</small></span></button></td><td className="stage-cell"><StageBadge stage={lead.stage} /></td><td className="amount-cell">{money(lead.amount)}</td><td className="source-cell"><SourceBadge lead={lead} /></td><td className="task-cell"><span>{lead.nextAction || (lead.stage === 'won' ? 'Сделка закрыта' : lead.stage === 'lost' ? lead.lostReason : 'Добавить следующий шаг')}</span><DueBadge lead={lead} /></td><td className="open-cell"><button className="icon-btn" onClick={() => onOpen(lead)} aria-label={`Открыть ${lead.name}`}><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div>}
      <footer className="board-footer"><span><GripVertical size={12} />Перетаскивайте карточки между этапами</span><span><i />{dataMode === 'demo' ? 'Сохранено в этом браузере' : 'Подключено к серверу'}</span></footer>
    </section>
    <div className="insight"><span className="insight-icon"><Sparkles size={21} /></span><div><h3>{attention ? 'Хороший момент продолжить диалог' : 'Ни один диалог не потеряется'}</h3><p>{attention ? `${attention} контактов ждут вашего следующего шага. Маленькое касание может стать большой сделкой.` : 'Назначьте следующий шаг — он появится в вашем списке дел.'}</p></div><button onClick={onTasks}><span>К задачам</span><ArrowRight size={17} /></button></div>
    {filterOpen && <FilterDialog filters={filters} setFilters={next => { setFilters(next); setSelected([]); }} sort={sort} setSort={setSort} count={data.length} onClose={() => setFilterOpen(false)} />}
  </>;
}

function FilterDialog({ filters, setFilters, sort, setSort, count, onClose }: { filters: Filters; setFilters: (filters: Filters) => void; sort: Sort; setSort: (sort: Sort) => void; count: number; onClose: () => void }) {
  return <Dialog title="Найдём нужных людей" subtitle="ФИЛЬТРЫ" onClose={onClose} className="filter-dialog"><div className="dialog-body"><label className="field">Источник<select value={filters.source} onChange={event => setFilters({ ...filters, source: event.target.value })}><option value="all">Все источники</option><option value="manychat">ManyChat</option><option value="instagram">Instagram</option><option value="manual">Добавлены вручную</option></select></label><label className="field">Период добавления<select value={filters.period} onChange={event => setFilters({ ...filters, period: event.target.value })}><option value="all">За всё время</option><option value="week">Последние 7 дней</option><option value="month">Этот месяц</option></select></label><label className="field">Этап сделки<select value={filters.stage} onChange={event => setFilters({ ...filters, stage: event.target.value })}><option value="all">Все этапы</option>{STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
    <label className="field">Порядок отображения<select value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recent">Сначала новые</option><option value="name">По имени</option><option value="amount">По сумме ↓</option><option value="due">По сроку задачи</option></select></label><label className="switch-row"><span><b>Требуют внимания</b><small>Задачи на сегодня и просроченные</small></span><input type="checkbox" role="switch" checked={filters.attention} onChange={event => setFilters({ ...filters, attention: event.target.checked })} /></label><label className="switch-row"><span><b>Только горячие лиды</b><small>Начните с самых заинтересованных</small></span><input type="checkbox" role="switch" checked={filters.hot} onChange={event => setFilters({ ...filters, hot: event.target.checked })} /></label></div><div className="dialog-actions"><button className="btn" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Сбросить</button><button className="btn primary" onClick={onClose}>Показать · {count}<ArrowRight size={16} /></button></div></Dialog>;
}
