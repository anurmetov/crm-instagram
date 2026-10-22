import { Check, Copy, ExternalLink, Instagram, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from './ui';
import { instagramService } from '../services/instagram';
import type { InstagramStatus } from '../services/instagram';
import { dataMode } from '../services/leads';

export function InstagramConnection({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<InstagramStatus | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [copied, setCopied] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    try { setStatus(await instagramService.status()); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось получить статус Instagram'); }
  }, []);
  useEffect(() => {
    if (dataMode !== 'api') return;
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const values = new FormData(form.current!);
    try {
      setStatus(await instagramService.configure({ appId: String(values.get('appId')).trim(), publicUrl: String(values.get('publicUrl')).trim(),
        appSecret: String(values.get('appSecret')).trim() || undefined }));
      const secret = form.current?.elements.namedItem('appSecret'); if (secret instanceof HTMLInputElement) secret.value = '';
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось сохранить настройки'); }
    finally { setBusy(false); }
  }
  async function authorize() {
    setBusy(true); setError('');
    try { window.location.assign(await instagramService.authorize()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось открыть Instagram'); setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError('');
    try { setStatus(await instagramService.disconnect()); setConfirmDisconnect(false); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось отключить Instagram'); }
    finally { setBusy(false); }
  }
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setError('Не удалось скопировать. Выделите значение в поле.'); }
  }
  return <Dialog title="Подключение Instagram" subtitle="ИЗ ПЕРЕПИСКИ В НОВЫЕ ЛИДЫ" onClose={() => { if (!busy) onClose(); }} className="instagram-dialog">
    <div className="dialog-body instagram-body">
      <div className="instagram-intro"><Instagram size={25} /><p>После вашего ручного сообщения новый контакт появится в «Новых лидах», когда Instagram передаст событие отправки.</p></div>
      {dataMode === 'demo' ? <p className="panel-description">Сейчас открыт деморежим. Откройте локальную рабочую версию CRM, чтобы подключить свой аккаунт.</p> : <>
        {!status && !error && <p role="status"><LoaderCircle className="spin" size={16} /> Получаем статус…</p>}
        {status && <>
          <div className={`instagram-state ${status.connected && !status.needsReconnect ? 'connected' : ''}`} role="status"><b>{status.connected ? `@${status.username}` : 'Аккаунт пока не подключён'}</b><span>{status.needsReconnect ? 'Нужно повторно предоставить доступ Instagram' : status.connected ? 'Доступ предоставлен' : 'Подключите аккаунт «Автор» или «Бизнес»'}</span></div>
          {status.oauthError && <p className="form-error" role="alert">{status.oauthError}</p>}
          {status.connected && <div className="instagram-check"><h3>Проверка автоматизации</h3><p>{status.lastOutgoing ? `Последнее событие отправки: ${new Date(status.lastOutgoing).toLocaleString('ru-RU')}.` : 'Отправьте человеку сообщение вручную в Instagram. Затем проверьте «Новые лиды»: при получении события контакт добавится автоматически.'}</p><p>Первое сообщение человеку, который ещё вам не отвечал, нужно проверить отдельно: доставка такого события зависит от Instagram.</p>{status.pendingProfiles > 0 && <p>Instagram пока не передал ник для {status.pendingProfiles} контактов. Карточки уже сохранены; ник можно заполнить вручную.</p>}{status.queued > 0 && <p>Обрабатываем событий: {status.queued}.</p>}</div>}
          <form ref={form} onSubmit={save} className="instagram-settings">
            <h3>Приложение Meta и туннель</h3>
            <p className="panel-description">Создайте приложение с Instagram Login в <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Meta for Developers <ExternalLink size={12} /></a>. Введите его данные и адрес туннеля ниже.</p>
            <label className="field">Instagram App ID<input name="appId" defaultValue={status.appId} required pattern="[0-9]{5,40}" inputMode="numeric" readOnly={status.connected} placeholder="Из раздела настройки Instagram" /></label>
            <label className="field">Instagram App Secret<input name="appSecret" type="password" required={!status.configured} disabled={status.connected} autoComplete="off" placeholder={status.configured ? 'Сохранён на этом компьютере' : 'Секрет приложения Instagram'} maxLength={256} /></label>
            <label className="field">HTTPS-адрес туннеля<input name="publicUrl" type="url" defaultValue={status.publicUrl} required placeholder="https://example.trycloudflare.com" /></label>
            <button className="btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Сохранить настройки</button>
          </form>
          {status.configured && <div className="instagram-callbacks"><h3>Укажите в приложении Meta</h3>{[
            ['Redirect URI', status.callbackUrl], ['Webhook Callback URL', status.webhookUrl], ['Verify token', status.verifyToken],
          ].map(([label, value]) => <label className="field" key={label}>{label}<span className="instagram-copy"><input readOnly value={value} onFocus={event => event.target.select()} /><button className="icon-btn" aria-label={`Скопировать ${label}`} onClick={() => void copy(label, value)}>{copied === label ? <Check size={15} /> : <Copy size={15} />}</button></span></label>)}<p className="panel-description">Подпишитесь на события messages. Разрешения: instagram_business_basic и instagram_business_manage_messages.</p></div>}
        </>}
        {error && <div><p className="form-error" role="alert">{error}</p><button className="text-btn" onClick={() => void load()}><RefreshCw size={14} />Обновить статус</button></div>}
      </>}
    </div>
    <div className="dialog-actions instagram-actions">
      {status?.connected && (confirmDisconnect ? <><span>Отключить синхронизацию?</span><button className="btn danger" disabled={busy} onClick={() => void disconnect()}>Отключить</button><button className="btn" disabled={busy} onClick={() => setConfirmDisconnect(false)}>Отмена</button></> : <button className="text-btn danger" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Отключить аккаунт</button>)}
      {dataMode === 'api' && status?.configured && (!status.connected || status.needsReconnect) && <button className="btn primary" disabled={busy} onClick={() => void authorize()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Instagram size={16} />}{status.needsReconnect ? 'Подключить заново' : 'Войти через Instagram'}</button>}
      <button className="btn" disabled={busy} onClick={onClose}>Закрыть</button>
    </div>
  </Dialog>;
}
