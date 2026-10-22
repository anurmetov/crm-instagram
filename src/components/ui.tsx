import { ArrowRight, Check, Clock3, Search, X, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { dueInfo, stageById } from '../lib/domain';
import type { Lead, StageId } from '../lib/domain';

const avatarColors = ['#ece6f5', '#f4e9dd', '#e5eee5', '#e5eaf5', '#f6e4ea', '#eae6ee'];
export function Avatar({ lead, large = false }: { lead: Pick<Lead, 'name' | 'color'>; large?: boolean }) {
  return <span className={`avatar ${large ? 'avatar-large' : ''}`} style={{ background: avatarColors[lead.color % avatarColors.length] }} aria-hidden="true">{lead.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>;
}
export function StageBadge({ stage }: { stage: StageId }) {
  return <span className="stage-badge" style={{ '--stage-color': stageById[stage].color } as CSSProperties}><i />{stageById[stage].name}</span>;
}
export function DueBadge({ lead }: { lead: Lead }) {
  const due = dueInfo(lead);
  return <span className={`due-badge ${due.kind}`}>{due.kind === 'done' ? <Check size={12} /> : <Clock3 size={12} />}{due.text}</span>;
}
export function SourceBadge({ lead }: { lead: Lead }) {
  return <span className={`source-badge ${lead.source === 'manual' ? 'manual' : ''}`}>
    {lead.source === 'manual' ? <span className="tiny-dot" /> : <Zap size={10} />}
    {lead.source === 'manual' ? 'Вручную' : lead.source === 'instagram' ? 'Instagram' : 'ManyChat'}{lead.keyword && <span>· {lead.keyword}</span>}
  </span>;
}
export function EmptyState({ title = 'Никого не нашли', description = 'Попробуйте другой запрос или сбросьте фильтры.', action, children }: { title?: string; description?: string; action?: () => void; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Search size={26} /></span><h3>{title}</h3><p>{description}</p>{action && <button className="btn" onClick={action}>Сбросить фильтры<ArrowRight size={15} /></button>}{children}</div>;
}
export function Dialog({ title, subtitle, onClose, children, className = '' }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const bodyStyle = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%';
    dialog.showModal();
    return () => { dialog.close(); Object.assign(document.body.style, bodyStyle); window.scrollTo(0, scrollY); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => {
    if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); }
  }} aria-labelledby="dialog-title">
    <div className="sheet-handle" aria-hidden="true" /><header className="dialog-header"><div><span className="eyebrow">{subtitle || 'ПРОСТРАНСТВО ДЛЯ ВАШИХ ДИАЛОГОВ'}</span><h2 id="dialog-title">{title}</h2></div><button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} /></button></header>{children}
  </dialog>;
}
