import { ChartNoAxesColumnIncreasing, Check, CircleAlert, House, LayoutDashboard, Plus, UsersRound, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Metrics } from './components/Metrics';
import { Pipeline } from './components/Pipeline';
import { LeadEditor } from './components/LeadEditor';
import { Analytics } from './components/Analytics';
import { useCrm } from './hooks/useCrm';
import { PAGE_META, prepareLead, stageById } from './lib/domain';
import type { Lead, Page, StageId } from './lib/domain';

const navigation = [
  { id: 'overview', label: 'Обзор', icon: House },
  { id: 'pipeline', label: 'Воронка', icon: LayoutDashboard },
  { id: 'leads', label: 'Контакты', icon: UsersRound },
  { id: 'analytics', label: 'Аналитика', icon: ChartNoAxesColumnIncreasing },
] as const;
function currentPage(): Page { const hash = window.location.hash.slice(1); return navigation.some(item => item.id === hash) ? hash as Page : 'overview'; }
type Toast = { id: number; text: string; error?: boolean };

export function App() {
  const { leads, save, remove } = useCrm();
  const [page, setPage] = useState<Page>(currentPage), [editor, setEditor] = useState<{ lead?: Lead; stage?: StageId } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const mobileAddRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]), toastId = useRef(0);
  useEffect(() => {
    const hashChange = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    const goOnline = () => setOnline(true), goOffline = () => setOnline(false);
    window.addEventListener('hashchange', hashChange); window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('hashchange', hashChange); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); timers.current.forEach(clearTimeout); };
  }, []);
  useEffect(() => { document.title = PAGE_META[page].title; }, [page]);
  useEffect(() => {
    setShowQuickAdd(false);
    if (page !== 'pipeline') return;
    const observer = new IntersectionObserver(([entry]) => setShowQuickAdd(!entry.isIntersecting), { threshold: .25 });
    if (mobileAddRef.current) observer.observe(mobileAddRef.current);
    return () => observer.disconnect();
  }, [page]);
  const notify = useCallback((text: string, error = false) => {
    const id = ++toastId.current; setToasts(current => [...current.slice(-2), { id, text, error }]);
    timers.current.push(setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 5000));
  }, []);
  const navigate = (next: Page) => { window.location.hash = next; };
  const openLead = (lead?: Lead, stage?: StageId) => setEditor({ lead, stage });
  async function moveLead(lead: Lead, stage: StageId) {
    if (stage === lead.stage) return;
    if (stage === 'lost') { openLead(lead, stage); return; }
    await save(prepareLead({ ...lead, stage }, lead)); notify(`${lead.name} → ${stageById[stage].name}`);
  }
  return <><a className="skip-link" href="#main-content">Перейти к содержимому</a><div className="app-shell">
    <aside className="sidebar"><a className="brand-mark" href="#overview" aria-label="Обзор"><img src="/favicon.svg" alt="" /></a><nav className="desktop-nav" aria-label="Основная навигация">{navigation.map(item => <a key={item.id} href={`#${item.id}`} className={`rail-link ${page === item.id ? 'active' : ''}`} aria-label={item.label} title={item.label} aria-current={page === item.id ? 'page' : undefined}><item.icon size={20} /><span>{item.label}</span></a>)}</nav></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand"><img src="/favicon.svg" alt="" /></div><nav className="top-navigation" aria-label="Быстрый переход">{navigation.filter(item => ['pipeline', 'analytics'].includes(item.id)).map(item => <a href={`#${item.id}`} key={item.id} className={page === item.id ? 'active' : ''}><item.icon size={14} />{item.label}</a>)}</nav></header>
    {!online && <div className="offline-banner" role="status"><WifiOff size={15} />Вы не в сети. Можно продолжать работу.</div>}
    <main id="main-content" className={`main-content page-${page}`} tabIndex={-1}><header className="page-header"><div><h1>{PAGE_META[page].title}<span className="title-dot">.</span></h1>{PAGE_META[page].description && <p>{PAGE_META[page].description}</p>}</div><div className="header-actions">{page === 'pipeline' && <button className="btn primary new-lead-button" onClick={() => openLead()}><Plus size={15} /><span>Новый лид</span></button>}<span className="date-pill">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })}</span>{page === 'pipeline' && <button ref={mobileAddRef} className="mobile-add icon-btn" onClick={() => openLead()} aria-label="Добавить контакт"><Plus size={22} /></button>}</div></header>
      {page === 'overview' && <Metrics leads={leads} navigate={navigate} onOpen={openLead} />}
      {(page === 'pipeline' || page === 'leads') && <Pipeline key={page} page={page} leads={leads} onOpen={openLead} onMove={moveLead} onError={message => notify(message, true)} />}
      {page === 'analytics' && <Analytics leads={leads} />}
    </main></div>
  </div><nav className="bottom-nav" aria-label="Мобильная навигация">{navigation.map(item => <a href={`#${item.id}`} key={item.id} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'active' : ''}><span><item.icon size={21} /></span><small>{item.label}</small></a>)}</nav>
  {page === 'pipeline' && <button className={`mobile-fab ${showQuickAdd ? 'visible' : ''}`} onClick={() => openLead()} aria-label="Быстро добавить контакт"><Plus size={24} /></button>}
  {editor && <LeadEditor lead={editor.lead} stage={editor.stage} onClose={() => setEditor(null)} onSave={save} onDelete={remove} notify={message => notify(message)} />}
  <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(toast => <div className={`toast ${toast.error ? 'error' : ''}`} key={toast.id} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleAlert size={17} /> : <Check size={17} />}<span>{toast.text}</span><button className="toast-close" aria-label="Скрыть уведомление" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}><X size={14} /></button></div>)}</div>
  </>;
}
