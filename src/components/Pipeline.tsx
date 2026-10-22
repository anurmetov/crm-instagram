import { ArrowDownWideNarrow, ArrowRight, Download, Flame, GripVertical, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EMPTY_FILTERS, STAGES, filterLeads, isActive, money, stageById } from '../lib/domain';
import type { Filters, Lead, Page, StageId } from '../lib/domain';
import { Avatar, Dialog, EmptyState, SourceBadge, StageBadge } from './ui';
import { Select } from './Select';
import { periodOptions, sortOptions, sourceFilterOptions, stageOptions } from './selectionOptions';

type Props = {
  leads: Lead[]; page: Page; onOpen: (lead?: Lead, stage?: StageId) => void;
  onMove: (lead: Lead, stage: StageId) => Promise<void>;
  onExport: (leads: Lead[]) => void; onError: (message: string) => void;
};
type Sort = 'recent' | 'name' | 'amount';
function LeadCard({ lead, onOpen, onMove, onError }: { lead: Lead; onOpen: Props['onOpen']; onMove: Props['onMove']; onError: Props['onError'] }) {
  const next = STAGES[STAGES.findIndex(stage => stage.id === lead.stage) + 1];
  const [busy, setBusy] = useState(false);
  return <article className={`lead-card ${lead.priority === 'hot' ? 'hot-card' : ''}`} draggable
    onDragStart={event => { event.dataTransfer.setData('text/potok-lead', lead.id); event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging'); }}
    onDragEnd={event => event.currentTarget.classList.remove('dragging')}>
    <button className="card-main" onClick={() => onOpen(lead)} aria-label={`Открыть контакт ${lead.name}`}>
      <div className="lead-person"><Avatar lead={lead} /><div><h3>{lead.name}</h3><p>{lead.handle ? `@${lead.handle}` : 'Ник пока недоступен'}</p></div>{lead.priority === 'hot' ? <Flame size={14} className="hot-icon" /> : <GripVertical size={14} className="card-grip" />}</div>
      <div className="card-labels"><SourceBadge lead={lead} /><span className="mobile-card-stage"><StageBadge stage={lead.stage} /></span></div>
      <p className="lead-note">{lead.note || lead.product || 'Добавьте заметку о человеке'}</p>
      <div className="card-bottom"><b>{money(lead.amount)}</b></div>
    </button>
    <div className="mobile-card-actions"><button className="text-btn" onClick={() => onOpen(lead)}>Открыть карточку</button>{isActive(lead) && next && <button className="quick-next" disabled={busy} aria-label={`Перевести ${lead.name} в ${next.name}`} onClick={async () => { setBusy(true); try { await onMove(lead, next.id); } catch (error) { onError(error instanceof Error ? error.message : 'Не удалось изменить этап'); } finally { setBusy(false); } }}>{next.short}<ArrowRight size={14} /></button>}</div>
  </article>;
}

export function Pipeline({ leads, page, onOpen, onMove, onExport, onError }: Props) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [filterOpen, setFilterOpen] = useState(false), [sort, setSort] = useState<Sort>('recent');
  const [dragOver, setDragOver] = useState<StageId | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); search.current?.focus(); } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const baseData = filterLeads(leads, { ...filters, stage: 'all' });
  const data = useMemo(() => filterLeads(leads, filters).sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'amount' ? b.amount - a.amount : b.created.localeCompare(a.created)
  ), [leads, filters, sort]);
  const filterCount = Number(filters.source !== 'all') + Number(filters.period !== 'all') + Number(filters.hot);
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value })); }
  function reset() { setFilters({ ...EMPTY_FILTERS }); }
  return <>
    <section className="pipeline-panel" aria-label={page === 'leads' ? 'База контактов' : 'Воронка лидов'}>
      <header className="pipeline-header"><div><span className="section-overline">ВАШИ ДИАЛОГИ В ДВИЖЕНИИ</span><h2>{page === 'leads' ? 'База контактов' : 'От диалога к сделке'}<span className="count-pill">{data.length}</span></h2><p>{page === 'leads' ? 'Все люди, с которыми вы на связи' : 'Все ваши сделки на одной доске'}</p></div>
        <button className="icon-btn contacts-export" aria-label="Экспорт контактов в CSV" title="Скачать контакты" onClick={() => onExport(data)} disabled={!data.length}><Download size={18} /></button>
      </header>
      <div className="pipeline-controls"><div className="pipeline-toolbar"><label className="search-box"><Search size={17} /><input ref={search} type="search" value={filters.query} onChange={event => updateFilter('query', event.target.value)} placeholder="Найти человека…" aria-label="Поиск контактов" />{filters.query ? <button aria-label="Очистить поиск" onClick={() => updateFilter('query', '')}><X size={14} /></button> : <kbd>⌘ K</kbd>}</label>
        <div className="desktop-filters"><Select className="select-pill" label="Источник контакта" value={filters.source} options={sourceFilterOptions} onValueChange={value => updateFilter('source', value)} /></div>
        <button className={`filter-button ${filterCount ? 'has-filters' : ''}`} aria-label={`Открыть фильтры${filterCount ? `, активно ${filterCount}` : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={17} /><span>Фильтры</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
        <div className="sort-control"><Select className="select-sort" label="Сортировка контактов" value={sort} options={sortOptions} icon={<ArrowDownWideNarrow size={14} />} onValueChange={value => setSort(value as Sort)} /></div>
      </div>
      <div className="stage-tabs" aria-label="Этапы воронки"><button className={filters.stage === 'all' ? 'active' : ''} aria-pressed={filters.stage === 'all'} onClick={() => updateFilter('stage', 'all')}>Все этапы<span>{baseData.length}</span></button>{STAGES.map(stage => <button key={stage.id} className={filters.stage === stage.id ? 'active' : ''} aria-pressed={filters.stage === stage.id} onClick={() => updateFilter('stage', stage.id)}><i style={{ background: stage.color }} />{stage.short}<span>{baseData.filter(lead => lead.stage === stage.id).length}</span></button>)}</div></div>
      {(filters.query || filterCount > 0 || filters.stage !== 'all') && <div className="active-filter-note"><span>Найдено контактов: {data.length}</span><button onClick={reset}>Сбросить<X size={12} /></button></div>}
      {!data.length ? <EmptyState action={reset} /> : <>
        <div className="kanban" aria-label="Доска сделок">{STAGES.filter(stage => filters.stage === 'all' || filters.stage === stage.id).map(stage => {
          const group = data.filter(lead => lead.stage === stage.id);
          return <section className={`kanban-column ${dragOver === stage.id ? 'drag-over' : ''}`} key={stage.id} style={{ '--stage-color': stage.color } as CSSProperties}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(stage.id); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
            onDrop={event => { event.preventDefault(); setDragOver(null); const lead = leads.find(lead => lead.id === event.dataTransfer.getData('text/potok-lead')); if (lead && lead.stage !== stage.id) void onMove(lead, stage.id).catch(error => onError(error.message)); }}>
            <div className="column-header"><i /><h3>{stage.name}</h3><span>{group.length}</span><button aria-label={`Добавить контакт в ${stage.name}`} onClick={() => onOpen(undefined, stage.id)}><Plus size={14} /></button></div><div className="column-meta"><span>0{STAGES.indexOf(stage) + 1}</span></div>
            <div className="column-cards">{group.map(lead => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} onMove={onMove} onError={onError} />)}{!group.length && <div className="empty-column">Следующая история<br />начнётся здесь</div>}</div><button className="column-add" onClick={() => onOpen(undefined, stage.id)}><Plus size={13} />Добавить лида</button>
          </section>;
        })}</div>
        <div className="mobile-card-list"><div className="mobile-list-caption"><span>{filters.stage === 'all' ? 'Все ваши контакты' : stageById[filters.stage as StageId].name}</span><span>{data.length} контактов</span></div>{data.map(lead => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} onMove={onMove} onError={onError} />)}<button className="mobile-list-add" onClick={() => onOpen(undefined, filters.stage === 'all' ? undefined : filters.stage as StageId)}><Plus size={18} />Новый контакт</button></div>
      </>}
      <footer className="board-footer"><span><GripVertical size={12} />Перетаскивайте карточки между этапами</span><span><i />Изменения до перезагрузки</span></footer>
    </section>
    {filterOpen && <FilterDialog filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} count={data.length} onClose={() => setFilterOpen(false)} />}
  </>;
}

function FilterDialog({ filters, setFilters, sort, setSort, count, onClose }: { filters: Filters; setFilters: (filters: Filters) => void; sort: Sort; setSort: (sort: Sort) => void; count: number; onClose: () => void }) {
  return <Dialog title="Найдём нужных людей" subtitle="ФИЛЬТРЫ" onClose={onClose} className="filter-dialog"><div className="dialog-body">
    <div className="field"><span>Источник</span><Select label="Источник" value={filters.source} options={sourceFilterOptions} onValueChange={value => setFilters({ ...filters, source: value })} /></div>
    <div className="field"><span>Период добавления</span><Select label="Период добавления" value={filters.period} options={periodOptions} onValueChange={value => setFilters({ ...filters, period: value })} /></div>
    <div className="field"><span>Этап сделки</span><Select label="Этап сделки" value={filters.stage} options={[{ value: 'all', label: 'Все этапы' }, ...stageOptions]} onValueChange={value => setFilters({ ...filters, stage: value })} /></div>
    <div className="field"><span>Порядок отображения</span><Select label="Порядок отображения" value={sort} options={sortOptions} onValueChange={value => setSort(value as Sort)} /></div>
    <label className="switch-row"><span><b>Только горячие лиды</b><small>Начните с самых заинтересованных</small></span><input type="checkbox" role="switch" checked={filters.hot} onChange={event => setFilters({ ...filters, hot: event.target.checked })} /></label></div><div className="dialog-actions"><button className="btn" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Сбросить</button><button className="btn primary" onClick={onClose}>Показать · {count}<ArrowRight size={16} /></button></div></Dialog>;
}
