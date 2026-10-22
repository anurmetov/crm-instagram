import { ArrowDownToLine, ArrowRight, Bell, ChartNoAxesColumnIncreasing, Check, CircleHelp, CloudOff, LayoutDashboard, Link2, ListChecks, LoaderCircle, LockKeyhole, Plus, RefreshCw, UsersRound, WifiOff, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Metrics } from './components/Metrics';
import { Pipeline } from './components/Pipeline';
import { LeadEditor } from './components/LeadEditor';
import { Analytics } from './components/Analytics';
import { Tasks } from './components/Tasks';
import { IncomingDialog, Integrations } from './components/Integrations';
import { Dialog } from './components/ui';
import { useCrm } from './hooks/useCrm';
import { exportLeads } from './lib/export';
import { PAGE_META, isActive, needsAttention, prepareLead, stageById } from './lib/domain';
import type { Lead, Page, StageId } from './lib/domain';
import { dataMode } from './services/leads';

const navigation = [
  { id: 'pipeline', label: 'Воронка', icon: LayoutDashboard },
  { id: 'leads', label: 'Контакты', icon: UsersRound },
  { id: 'tasks', label: 'Задачи', icon: ListChecks },
  { id: 'analytics', label: 'Аналитика', icon: ChartNoAxesColumnIncreasing },
  { id: 'integrations', label: 'Связи', icon: Link2 },
] as const;
function currentPage(): Page { const hash = window.location.hash.slice(1); return navigation.some(item => item.id === hash) ? hash as Page : 'pipeline'; }
type Toast = { id: number; text: string; error?: boolean; action?: () => void };

export function App() {
  const { leads, loading, error, reload, save, remove } = useCrm();
  const [page, setPage] = useState<Page>(currentPage), [editor, setEditor] = useState<{ lead?: Lead; stage?: StageId } | null>(null);
  const [incoming, setIncoming] = useState(false), [help, setHelp] = useState(false), [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const mobileAddRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]), toastId = useRef(0);
  const latestLeads = useRef(leads); latestLeads.current = leads;
  useEffect(() => {
    const hashChange = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    const goOnline = () => setOnline(true), goOffline = () => setOnline(false);
    window.addEventListener('hashchange', hashChange); window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('hashchange', hashChange); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); timers.current.forEach(clearTimeout); };
  }, []);
  useEffect(() => { document.title = `${PAGE_META[page].title} — Поток`; }, [page]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setShowQuickAdd(!entry.isIntersecting), { threshold: .25 });
    if (mobileAddRef.current) observer.observe(mobileAddRef.current);
    return () => observer.disconnect();
  }, []);
  const notify = useCallback((text: string, error = false, action?: () => void) => {
    const id = ++toastId.current; setToasts(current => [...current.slice(-2), { id, text, error, action }]);
    timers.current.push(setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), action ? 9000 : 5000));
  }, []);
  const navigate = (next: Page) => { window.location.hash = next; };
  const openLead = (lead?: Lead, stage?: StageId) => setEditor({ lead, stage });
  const exportContacts = (data = leads) => { exportLeads(data); notify(`Экспортировано контактов: ${data.length}`); };
  async function moveLead(lead: Lead, stage: StageId) {
    if (stage === lead.stage) return;
    if (stage === 'lost') { openLead(lead, stage); return; }
    await save(prepareLead({ ...lead, stage }, lead)); notify(`${lead.name} → ${stageById[stage].name}`);
  }
  const attention = leads.filter(needsAttention).length;
  return <><a className="skip-link" href="#main-content">Перейти к содержимому</a><div className="app-shell">
    <aside className="sidebar"><a className="brand-mark" href="#pipeline" aria-label="Поток — главная"><img src="/favicon.svg" alt="" /><span>поток<span>.</span></span></a><nav className="desktop-nav" aria-label="Основная навигация">{navigation.map(item => <a key={item.id} href={`#${item.id}`} className={`rail-link ${page === item.id ? 'active' : ''}`} aria-label={item.label} title={item.label} aria-current={page === item.id ? 'page' : undefined}><item.icon size={20} /><span>{item.label}</span>{item.id === 'tasks' && attention > 0 && <i className="nav-notification" />}</a>)}<span className="rail-divider" /><button className="rail-link" onClick={() => setIncoming(true)} aria-label="Тестовое входящее" title="Тестовое входящее" disabled={dataMode !== 'demo'}><Zap size={19} /></button></nav><button className="rail-link help-button" onClick={() => setHelp(true)} aria-label="Как пользоваться Потоком" title="Помощь"><CircleHelp size={20} /></button></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand"><img src="/favicon.svg" alt="" /><span>поток<b>.</b></span></div><nav className="top-navigation" aria-label="Быстрый переход">{navigation.filter(item => ['pipeline', 'analytics', 'tasks'].includes(item.id)).map(item => <a href={`#${item.id}`} key={item.id} className={page === item.id ? 'active' : ''}><item.icon size={14} />{item.label}</a>)}</nav><span className="workspace-divider" /><span className="workspace-name"><span className="workspace-dot" />Личный блог<ChevronIcon /></span><button className="top-add btn" onClick={() => openLead()} disabled={loading || !!error}><Plus size={15} />Новый контакт</button><div className="topbar-right"><span className={`mode-indicator ${dataMode}`}><i />{dataMode === 'demo' ? 'Демо' : 'Сервер'}</span><button className="icon-btn notification-button" onClick={() => navigate('tasks')} aria-label={`Открыть задачи, требуют внимания: ${attention}`}><Bell size={18} />{attention > 0 && <i />}</button><button className="owner-avatar" onClick={() => setHelp(true)} aria-label="О пространстве Личный блог">АС</button></div></header>
    {!online && <div className="offline-banner"><WifiOff size={15} />{dataMode === 'demo' ? 'Вы не в сети. Изменения сохраняются на этом устройстве.' : 'Нет связи с сервером. Проверьте подключение.'}</div>}
    <main id="main-content" className={`main-content page-${page}`} tabIndex={-1}><header className="page-header"><div><div className="eyebrow"><i />ЛИЧНЫЙ БЛОГ<span>·</span>INSTAGRAM CRM</div><h1>{PAGE_META[page].title}<span className="title-dot">.</span></h1><p>{PAGE_META[page].description}</p></div><div className="header-actions"><button className="btn export-button" onClick={() => exportContacts()} disabled={loading || !!error}><ArrowDownToLine size={15} /><span>Экспорт</span></button><span className="date-pill">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })}</span><button ref={mobileAddRef} className="mobile-add icon-btn" onClick={() => openLead()} disabled={loading || !!error} aria-label="Добавить контакт"><Plus size={22} /></button></div></header>
    {loading ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={27} /><h2>Собираем ваши диалоги…</h2><p>Всё будет на своих местах.</p></div> : error ? <div className="error-state panel" role="alert"><CloudOff size={30} /><h2>Не удалось загрузить контакты</h2><p>{error}</p><button className="btn primary" onClick={() => void reload()}><RefreshCw size={15} />Попробовать снова</button></div> : <>
      {page === 'pipeline' && <Metrics leads={leads} navigate={navigate} onOpen={openLead} />}
      {(page === 'pipeline' || page === 'leads') && <Pipeline key={page} page={page} leads={leads} onOpen={openLead} onMove={moveLead} onExport={exportContacts} onTasks={() => navigate('tasks')} onError={message => notify(message, true)} />}
      {page === 'tasks' && <Tasks leads={leads} onOpen={openLead} onError={message => notify(message, true)} onComplete={async lead => { await save(prepareLead({ ...lead, nextAction: '', due: '' }, lead)); notify('Ещё один шаг сделан', false, () => {
        const current = latestLeads.current.find(item => item.id === lead.id);
        if (!current || !isActive(current)) { notify('Контакт уже закрыт или удалён', true); return; }
        if (current.nextAction) { notify('У контакта уже есть новая задача', true); return; }
        void save(prepareLead({ ...current, nextAction: lead.nextAction, due: lead.due }, current)).then(() => notify('Задача восстановлена')).catch(error => notify(error.message, true));
      }); }} />}
      {page === 'analytics' && <Analytics leads={leads} />}
      {page === 'integrations' && <Integrations onExport={() => exportContacts()} onIncoming={() => setIncoming(true)} />}
    </>}
    <footer className="page-footer"><span><LockKeyhole size={11} />{dataMode === 'demo' ? 'Демоданные · сохраняются на этом устройстве' : 'Ваше рабочее пространство'}</span><span>С заботой о каждом диалоге<span className="footer-brand">поток.</span></span></footer></main></div>
  </div><nav className="bottom-nav" aria-label="Мобильная навигация">{navigation.map(item => <a href={`#${item.id}`} key={item.id} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'active' : ''}><span><item.icon size={21} />{item.id === 'tasks' && attention > 0 && <i />}</span><small>{item.label}</small></a>)}</nav>
  <button className={`mobile-fab ${showQuickAdd ? 'visible' : ''}`} onClick={() => openLead()} disabled={loading || !!error} aria-label="Быстро добавить контакт"><Plus size={24} /></button>
  {editor && <LeadEditor lead={editor.lead} stage={editor.stage} onClose={() => setEditor(null)} onSave={save} onDelete={remove} notify={message => notify(message)} />}
  {incoming && <IncomingDialog leads={leads} onSave={save} onClose={() => setIncoming(false)} notify={message => notify(message)} />}
  {help && <Dialog title="Всё начинается с диалога" subtitle="ДОБРО ПОЖАЛОВАТЬ В ПОТОК" onClose={() => setHelp(false)} className="help-dialog"><div className="dialog-body"><p className="panel-description">Небольшая CRM, в которой видно каждый следующий шаг.</p>{[['Собирайте людей', 'Добавляйте контакты вручную или попробуйте тестовое входящее в разделе «Связи». Один Instagram-ник — одна карточка.'], ['Двигайте сделки', 'На компьютере перетаскивайте карточки. На телефоне используйте кнопку следующего этапа или меняйте этап в карточке.'], ['Держите фокус', 'Назначайте следующий шаг и дату. В задачах вы увидите, кому пора написать. Завершённую задачу можно сразу вернуть кнопкой «Отменить».'], ['Забирайте данные с собой', 'Экспортируйте базу или выбранные контакты в CSV для Excel и Google Таблиц. В деморежиме данные хранятся на этом устройстве.']].map(([title, text], index) => <div className="help-step" key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="dialog-actions"><button className="btn primary" onClick={() => setHelp(false)}>Начнём<ArrowRight size={16} /></button></div></Dialog>}
  <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(toast => <div className={`toast ${toast.error ? 'error' : ''}`} key={toast.id} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={17} /> : <Check size={17} />}<span>{toast.text}</span>{toast.action && <button onClick={() => { toast.action?.(); setToasts(current => current.filter(item => item.id !== toast.id)); }}>Отменить</button>}<button className="toast-close" aria-label="Скрыть уведомление" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}><X size={14} /></button></div>)}</div>
  </>;
}
function ChevronIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>; }
