import { Check, ChevronDown, Copy, ExternalLink, Flame, LoaderCircle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { prepareLead, userError } from '../lib/domain';
import type { Lead, LeadFields, StageId } from '../lib/domain';
import { Avatar, Dialog } from './ui';
import { Select } from './Select';
import { sourceOptions, stageOptions } from './selectionOptions';

export function LeadEditor({ lead, stage, onClose, onSave, onDelete, notify }: { lead?: Lead; stage?: StageId; onClose: () => void; onSave: (lead: Lead) => Promise<unknown>; onDelete: (id: string) => Promise<void>; notify: (message: string) => void }) {
  const [selectedStage, setSelectedStage] = useState(stage ?? lead?.stage ?? 'new');
  const [hot, setHot] = useState(lead?.priority === 'hot');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false), [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(!!stage && stage !== lead?.stage), [confirmClose, setConfirmClose] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const markDirty = () => { setDirty(true); setConfirmClose(false); };
  const close = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose(); };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(form.current!));
    try {
      const fields: LeadFields = {
        name: String(values.name), handle: String(values.handle), stage: selectedStage, amount: Number(values.amount),
        source: values.source as Lead['source'], keyword: lead?.keyword ?? '', product: String(values.product),
        note: String(values.note), nextAction: lead?.nextAction ?? '', due: lead?.due ?? '',
        priority: hot ? 'hot' : 'normal', lostReason: String(values.lostReason ?? ''),
      };
      await onSave(prepareLead(fields, lead));
      notify(lead ? 'Карточка сохранена' : 'Новый контакт уже в воронке'); onClose();
    } catch (error) { setError(userError(error, 'Не удалось сохранить контакт')); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!lead || busy) return; setBusy(true); setError('');
    try { await onDelete(lead.id); notify('Контакт удалён'); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось удалить контакт'); }
    finally { setBusy(false); }
  }
  return <Dialog title={lead ? 'Карточка контакта' : 'Новый контакт'} subtitle={lead ? 'ИЗ ДИАЛОГА В ВОЗМОЖНОСТЬ' : 'НАЧНЁМ С ЗНАКОМСТВА'} onClose={close} className="lead-editor">
    <form ref={form} onSubmit={submit} onChange={markDirty} className="editor-form">
      <div className="dialog-body">
        {lead && <div className="editor-person"><Avatar lead={lead} large /><div><h3>{lead.name}</h3><a href={`https://www.instagram.com/${encodeURIComponent(lead.handle)}/`} target="_blank" rel="noreferrer">@{lead.handle}<ExternalLink size={12} /></a></div><button type="button" className="icon-btn" aria-label={copied ? 'Ник скопирован' : 'Скопировать ник'} onClick={async () => { try { await navigator.clipboard.writeText('@' + lead.handle); setCopied(true); } catch { setError('Не удалось скопировать ник. Его можно выделить в поле ниже.'); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>}
        <div className="form-section-title"><span>01</span>О человеке<button type="button" className={`hot-toggle ${hot ? 'active' : ''}`} aria-pressed={hot} onClick={() => { setHot(!hot); setDirty(true); }}><Flame size={14} />Горячий лид</button></div>
        <div className="form-grid"><label className="field">Имя<input name="name" placeholder="Например, Анна Смирнова" defaultValue={lead?.name} required maxLength={60} autoComplete="name" /></label><label className="field">Ник в Instagram<span className="input-prefix"><span>@</span><input name="handle" placeholder="anna.blog" defaultValue={lead?.handle} required pattern="@?[A-Za-z0-9._]{1,30}" maxLength={31} title="Латинские буквы, цифры, точки и подчёркивания" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></span></label>
        <label className="field full">Продукт или услуга<input name="product" placeholder="Например, личное сопровождение" defaultValue={lead?.product ?? ''} maxLength={120} /></label></div>
        <div className="form-section-title"><span>02</span>О сделке</div>
        <div className="form-grid"><div className="field full"><span>Этап сделки</span><Select label="Этап сделки" name="stage" value={selectedStage} options={stageOptions} onValueChange={value => { setSelectedStage(value as StageId); markDirty(); }} /></div>
        <label className="field">Сумма, $<input name="amount" type="number" min="0" max="100000000" step="1" inputMode="numeric" defaultValue={lead?.amount ?? 25000} required /></label>
        <div className="field"><span>Источник</span><Select label="Источник" name="source" defaultValue={lead?.source ?? 'manual'} options={sourceOptions} onValueChange={markDirty} /></div>
        {selectedStage === 'lost' && <label className="field full">Причина отказа<input name="lostReason" placeholder="Что помешало сделке?" defaultValue={lead?.lostReason ?? ''} required maxLength={160} /></label>}</div>
        <label className="field notes-field">Заметки<textarea name="note" rows={3} placeholder="Что важно помнить о человеке?" defaultValue={lead?.note ?? ''} maxLength={2000} /></label>
        {lead && <details className="timeline"><summary>История диалога<span>{lead.history.length} событий<ChevronDown size={14} /></span></summary><ol>{[...lead.history].reverse().map((event, index) => <li key={index}><i /><div><p>{event.text}</p><time dateTime={event.at}>{new Date(event.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div></li>)}</ol></details>}
        {lead && <div className="delete-zone">{confirmDelete ? <><p>Удалить контакт и всю его историю?</p><button type="button" className="btn danger" disabled={busy} onClick={remove}>Да, удалить</button><button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Оставить</button></> : <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Удалить контакт</button>}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      {confirmClose ? <div className="dialog-actions discard-actions"><p>Есть несохранённые изменения</p><button type="button" className="btn" onClick={onClose}>Не сохранять</button><button type="button" className="btn primary" onClick={() => setConfirmClose(false)}>Продолжить</button></div> : <div className="dialog-actions"><button type="button" className="btn cancel-btn" disabled={busy} onClick={close}>Отмена</button><button type="submit" className="btn primary save-btn" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? 'Сохраняем…' : lead ? 'Сохранить изменения' : 'Добавить контакт'}</button></div>}
    </form>
  </Dialog>;
}
