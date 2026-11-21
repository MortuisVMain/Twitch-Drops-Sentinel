import { Send } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const API = 'http://127.0.0.1:28492/api/webhooks';

interface PublicWebhooks {
  telegram: { enabled: boolean; chat_id: string; token_set: boolean };
  discord: { enabled: boolean; url_set: boolean };
}

type Channel = 'telegram' | 'discord';

// Telegram / Discord copies of the app's notifications. Secrets go to the service once and never come back.
export const WebhooksCard: React.FC<{ playClick: () => void }> = ({ playClick }) => {
  const [state, setState] = useState<PublicWebhooks | null>(null);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<Channel | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { setState(d.webhooks); setChatId(d.webhooks.telegram.chat_id || ''); })
      .catch((err) => { console.error('WebhooksCard: load failed', err); setMsg({ text: 'Не удалось загрузить настройки уведомлений', error: true }); });
  }, []);

  const post = async (path: string, body: object): Promise<any> => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'ok') throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  };

  const save = async (channel: Channel, patch: object, done: string) => {
    playClick();
    setBusy(channel);
    try {
      const data = await post(API, { [channel]: patch });
      setState(data.webhooks);
      if (channel === 'telegram') setToken(''); else setUrl('');
      setMsg({ text: done, error: false });
    } catch (err) {
      setMsg({ text: `Не сохранено: ${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setBusy(null);
    }
  };

  const test = async (channel: Channel) => {
    playClick();
    setBusy(channel);
    try {
      await post(`${API}/test`, { channel });
      setMsg({ text: 'Проверочное сообщение отправлено', error: false });
    } catch (err) {
      setMsg({ text: `Не отправлено: ${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setBusy(null);
    }
  };

  const tg = state?.telegram;
  const dc = state?.discord;
  return (
    <div className="titanium-island" role="group" aria-labelledby="webhooksTitle" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="engraved-header">
        <span className="tag"><span className="led-dot"></span> <span id="webhooksTitle">УВЕДОМЛЕНИЯ В TELEGRAM И DISCORD</span></span>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        Те же события, что и всплывающие уведомления: дроп получен, кампания из очереди началась или ждёт привязки, не успеть до конца кампании, забрана бесплатная игра. Токены хранятся зашифрованными только на этом ПК.
      </div>

      <div className="webhook-row">
        <div className="webhook-head">
          <strong>Telegram</strong>
          <span className="danger-zone-hint">{tg?.token_set ? 'токен сохранён' : 'токен не задан'}</span>
          <button type="button" role="switch" aria-checked={Boolean(tg?.enabled)} className={`cnc-switch ${tg?.enabled ? 'on' : ''}`} disabled={!state || busy !== null}
            onClick={() => save('telegram', { enabled: !tg?.enabled }, tg?.enabled ? 'Telegram выключен' : 'Telegram включён')} aria-label="Отправлять в Telegram">
            <span className="knob"></span>
          </button>
        </div>
        <div className="webhook-fields">
          <input type="password" autoComplete="off" placeholder={tg?.token_set ? 'Новый токен бота (необязательно)' : 'Токен бота от @BotFather'} value={token} onChange={(e) => setToken(e.target.value)} aria-label="Токен бота Telegram" />
          <input type="text" autoComplete="off" placeholder="chat_id или @канал" value={chatId} onChange={(e) => setChatId(e.target.value)} aria-label="chat_id Telegram" />
          <button className="tactile-btn" disabled={busy !== null} onClick={() => save('telegram', { token, chat_id: chatId }, 'Telegram сохранён')}>Сохранить</button>
          <button className="tactile-btn" disabled={busy !== null || !tg?.token_set} onClick={() => test('telegram')}><Send className="ui-icon" aria-hidden="true" focusable="false" /> Проверить</button>
        </div>
      </div>

      <div className="webhook-row">
        <div className="webhook-head">
          <strong>Discord</strong>
          <span className="danger-zone-hint">{dc?.url_set ? 'вебхук сохранён' : 'вебхук не задан'}</span>
          <button type="button" role="switch" aria-checked={Boolean(dc?.enabled)} className={`cnc-switch ${dc?.enabled ? 'on' : ''}`} disabled={!state || busy !== null}
            onClick={() => save('discord', { enabled: !dc?.enabled }, dc?.enabled ? 'Discord выключен' : 'Discord включён')} aria-label="Отправлять в Discord">
            <span className="knob"></span>
          </button>
        </div>
        <div className="webhook-fields">
          <input type="password" autoComplete="off" placeholder={dc?.url_set ? 'Новый адрес вебхука (необязательно)' : 'https://discord.com/api/webhooks/…'} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Адрес вебхука Discord" />
          <button className="tactile-btn" disabled={busy !== null || !url} onClick={() => save('discord', { url }, 'Discord сохранён')}>Сохранить</button>
          <button className="tactile-btn" disabled={busy !== null || !dc?.url_set} onClick={() => test('discord')}><Send className="ui-icon" aria-hidden="true" focusable="false" /> Проверить</button>
        </div>
      </div>

      {msg && <span role="status" style={{ fontSize: 'var(--fs-xs)', color: msg.error ? 'var(--led-rose)' : 'var(--text-secondary)' }}>{msg.text}</span>}
    </div>
  );
};
