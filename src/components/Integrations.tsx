import { ArrowRight, Check, Download, FileSpreadsheet, Instagram, LoaderCircle, Send, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { dateKey, prepareLead, userError } from '../lib/domain';
import type { Lead } from '../lib/domain';
import { dataMode } from '../services/leads';
import { Dialog } from './ui';

export function Integrations({ onExport, onIncoming }: { onExport: () => void; onIncoming: () => void }) {
  return <div className="integrations-page"><div className="integration-intro"><span><Zap size={24} /></span><div><h2>Пусть рутина работает сама.</h2><p>Соберите инструменты вокруг ваших диалогов.</p></div></div><div className="integration-grid">
    <article className="panel integration-card"><header><span className="integration-logo instagram"><Instagram size={27} /></span><span className="connection-status">Не подключено</span></header><h2>Instagram</h2><p className="integration-caption">Там, где начинаются ваши диалоги</p><p className="integration-description">Подключение аккаунта и получение сообщений станут доступны после подключения сервера.</p><div className="integration-note"><ShieldCheck size={16} /><span>Статус подключения появится здесь</span></div></article>
    <article className="panel integration-card"><header><span className="integration-logo manychat"><Zap size={27} /></span><span className="connection-status demo">{dataMode === 'demo' ? 'Деморежим' : 'Не подключено'}</span></header><h2>ManyChat</h2><p className="integration-caption">Кодовое слово → новый контакт</p><p className="integration-description">Попробуйте тестовое входящее. Повторное сообщение обновляет контакт и сохраняет его текущий этап.</p><button className="btn primary" disabled={dataMode !== 'demo'} onClick={onIncoming}><Send size={15} />Тестовое входящее</button></article>
    <article className="panel integration-card"><header><span className="integration-logo sheets"><FileSpreadsheet size={27} /></span><span className="connection-status ready"><Check size={11} />CSV доступен</span></header><h2>Ваши таблицы</h2><p className="integration-caption">Контакты всегда под рукой</p><p className="integration-description">Выгрузите базу для Excel или Google Таблиц. В файле будут этапы, суммы, заметки и следующие шаги.</p><button className="btn" onClick={onExport}><Download size={15} />Скачать контакты</button></article>
  </div><section className="integration-flow"><span className="section-overline">ВСЁ НАЧИНАЕТСЯ С ОДНОГО СООБЩЕНИЯ</span><h2>Один диалог — одна карточка.</h2><p>Никаких потерянных контактов. Вся история — в одном месте.</p><div><span><Instagram size={20} />Сообщение</span><ArrowRight size={18} /><span><Zap size={20} />ManyChat</span><ArrowRight size={18} /><span><Check size={20} />Ваша воронка</span></div></section></div>;
}

export function IncomingDialog({ leads, onSave, onClose, notify }: { leads: Lead[]; onSave: (lead: Lead) => Promise<unknown>; onClose: () => void; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Dialog title="Новое знакомство" subtitle="ТЕСТОВОЕ ВХОДЯЩЕЕ" onClose={() => { if (!busy) onClose(); }} className="incoming-dialog"><form onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget), handle = String(form.get('handle')).trim().replace(/^@/, '').toLowerCase(), keyword = String(form.get('keyword'));
    const existing = leads.find(lead => lead.handle === handle);
    try {
      let lead: Lead;
      if (existing) lead = { ...existing, updated: new Date().toISOString(), history: [...existing.history, { at: new Date().toISOString(), kind: 'incoming', text: `Повторное входящее: «${keyword}»` }] };
      else {
        lead = prepareLead({ name: String(form.get('name')), handle, stage: 'new', amount: keyword === 'РАЗБОР' ? 12000 : keyword === 'КУРС' ? 18000 : 35000, source: 'manychat', keyword, product: keyword === 'РАЗБОР' ? 'Разбор блога' : keyword === 'КУРС' ? 'Обучение' : 'Личное сопровождение', note: `Написал(а) кодовое слово «${keyword}». Ждёт подробности.`, nextAction: 'Ответить на входящее сообщение', due: dateKey(), priority: 'normal', lostReason: '' });
        lead.history[0].text = `Лид добавлен по слову «${keyword}»`;
      }
      await onSave(lead); notify(existing ? 'Входящее записано. Текущий этап сохранён.' : 'Новый контакт уже в воронке'); onClose();
    } catch (error) { setError(userError(error, 'Не удалось создать входящее')); }
    finally { setBusy(false); }
  }}><div className="dialog-body"><p className="panel-description">Так будет выглядеть заявка по кодовому слову. Это симуляция: сообщения в Instagram не отправляются.</p><label className="field">Имя отправителя<input name="name" defaultValue="Анастасия" required maxLength={60} /></label><label className="field">Ник в Instagram<input name="handle" defaultValue="anastasia.new" pattern="@?[A-Za-z0-9._]{1,30}" maxLength={31} autoCapitalize="none" required /></label><label className="field">Кодовое слово<select name="keyword"><option value="СТАРТ">СТАРТ · личное сопровождение</option><option value="РАЗБОР">РАЗБОР · консультация</option><option value="КУРС">КУРС · обучение</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="dialog-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Отмена</button><button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}В воронку</button></div></form></Dialog>;
}
