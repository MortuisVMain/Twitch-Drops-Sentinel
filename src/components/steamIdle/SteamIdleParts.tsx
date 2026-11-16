import React, { useEffect, useRef, useState } from 'react';
import { Check, LogIn, RefreshCw, TriangleAlert } from 'lucide-react';
import { SteamIdleState } from '../../types';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';
import { RefundHeldRow } from './RefundHeldRow';
import { durParts } from './steamIdleLogic.mjs';
import {
  ENGINE_MISSING_HINT, KNOWN_FARM_STATES, Tone, communityText, failedReasonText, farmStateText, helperText, hoursNumber, previewErrorText,
  steamClientText, unavailableHelp,
} from './steamIdleText';

type Send = (command: SteamIdleCommand) => void;

const hasCount = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Seconds as a short human duration; the unit words are plain JSX text so the language switch translates them. */
export const Dur: React.FC<{ s: number; up?: boolean }> = ({ s, up }) => {
  const p = durParts(s, up);
  if (p === null) return null;
  if ('sec' in p) return <>{p.sec} с</>;
  if ('min' in p) return <>{p.min} мин</>;
  return p.rest ? <>{p.h} ч {p.rest} мин</> : <>{p.h} ч</>;
};

const Fact: React.FC<{ label: string; text: string; tone: Tone; children?: React.ReactNode }> = ({ label, text, tone, children }) => (
  <div className="sidle-fact">
    <span className="sidle-label">{label}</span>
    <span className={`sidle-value${tone === 'warn' ? ' warn' : ''}`}>
      {tone === 'ok' && <Check className="ui-icon" aria-hidden="true" focusable="false" style={{ color: 'var(--led-mint)' }} />}
      {tone === 'warn' && <TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" />}
      <span>{text}</span>
    </span>
    {children && <div className="sidle-actions">{children}</div>}
  </div>
);

export const Readiness: React.FC<{ s: SteamIdleState; busy: SteamIdleCommand | null; send: Send; openGiveawaysReadiness?: () => void }> = ({ s, busy, send, openGiveawaysReadiness }) => {
  const steam = steamClientText(s.steam);
  const community = communityText(s.community.session);
  const helper = helperText(s);
  const session = s.community.session;
  const needsLogin = session === 'signed_out' || session === 'account_mismatch' || session === 'login_open';
  const loginOff = !s.available || session === 'login_open' || busy !== null;
  const engineMissing = session === 'engine_missing';
  const checkOff = !s.available || session === 'checking' || session === 'login_open' || engineMissing || busy !== null;
  return (
    <section className="titanium-island sidle-ready" aria-label="Готовность">
      <Fact label="Клиент Steam" text={steam.text} tone={steam.tone} />
      <Fact label="Сессия Community" text={community.text} tone={community.tone}>
        {needsLogin && (
          <button type="button" className="tactile-btn" aria-disabled={loginOff} onClick={() => { if (!loginOff) send('login'); }}>
            <LogIn className="ui-icon" aria-hidden="true" focusable="false" /> Войти в Steam
          </button>
        )}
        <button type="button" className="tactile-btn" aria-disabled={checkOff} onClick={() => { if (!checkOff) send('check'); }}>
          <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Проверить
        </button>
        {engineMissing && openGiveawaysReadiness && (
          <button type="button" className="tactile-btn" onClick={openGiveawaysReadiness}>Открыть готовность раздач</button>
        )}
      </Fact>
      {engineMissing && <p className="sidle-text">{ENGINE_MISSING_HINT}</p>}
      <Fact label="Помощник" text={helper.text} tone={helper.tone} />
    </section>
  );
};

export const RiskGate: React.FC<{ busy: SteamIdleCommand | null; send: Send }> = ({ busy, send }) => {
  const [understood, setUnderstood] = useState(false);
  return (
    <section className="titanium-island sidle-risk" aria-labelledby="sidle-risk-title">
      <h2 id="sidle-risk-title" className="sidle-title warn">
        <TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Перед включением
      </h2>
      <ul className="sidle-list">
        <li>Автоматическое получение карточек противоречит правилам Steam об автоматических наградах и может привести к ограничениям аккаунта.</li>
        <li>Друзья видят статус «в игре», а время в игре растёт.</li>
        <li>Пока фарм держит игру, запустить её самому нельзя: он освободит её сам.</li>
        <li>Достижения включаются отдельно, в своём разделе.</li>
      </ul>
      <label className="sidle-check">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>Я понимаю риск для аккаунта</span>
      </label>
      <div className="sidle-actions">
        <button type="button" className="chunky-cta" disabled={!understood} aria-disabled={busy !== null} onClick={() => { if (busy === null) send('ack'); }}>
          Включить Steam IDLE
        </button>
      </div>
    </section>
  );
};

export const UnavailablePanel: React.FC<{ s: SteamIdleState }> = ({ s }) => (
  <section className="titanium-island" aria-labelledby="sidle-unavail-title">
    <h2 id="sidle-unavail-title" className="sidle-title">Steam IDLE сейчас недоступен</h2>
    <p className="sidle-text">{unavailableHelp(s.unavailableReason)}</p>
  </section>
);

const PRIMARY_STATES = new Set(['idle', 'done', 'stopped', 'needs_login']);
const ACTIVE_STATES = new Set(['scanning', 'farming', 'waiting', 'suspended']);

export const FarmPanel: React.FC<{ s: SteamIdleState; busy: SteamIdleCommand | null; takeFocus: boolean; send: Send }> = ({ s, busy, takeFocus, send }) => {
  const { farm } = s;
  const cur = farm.current;
  const off = busy !== null || !s.available;
  const go = (command: SteamIdleCommand) => () => { if (!off) send(command); };
  const known = KNOWN_FARM_STATES.has(farm.state);
  const hasWork = farm.queue.length > 0 || cur !== null || farm.done.length > 0 || farm.failed.length > 0;
  const nothing = farm.state === 'idle' && !hasWork;
  const stateRef = useRef<HTMLParagraphElement>(null);
  // The risk gate (with the focused button) was just replaced by this panel: keep the keyboard user here.
  useEffect(() => { if (takeFocus) stateRef.current?.focus(); }, [takeFocus]);
  return (
    <section className="titanium-island sidle-farm" aria-labelledby="sidle-farm-title">
      <h2 id="sidle-farm-title" className="sidle-title">Фарм карточек</h2>
      <p ref={stateRef} tabIndex={-1} className="sidle-state" aria-live="polite">{farmStateText(farm.state, farm.lastError)}</p>
      {cur && (
        <div className="sidle-current">
          <span className="sidle-game" title={cur.name}>{cur.name}</span>
          <span className="sidle-meta">
            <span>осталось карточек: <b className="tabular">{cur.dropsRemaining}</b></span>
            <span>держим <b className="tabular"><Dur s={cur.heldSeconds} /></b></span>
          </span>
        </div>
      )}
      {nothing && !s.preview && s.available && s.community.session !== 'signed_out' && (
        <>
          <p className="sidle-text">Карточек для фарма нет</p>
          {hasCount(s.library?.count) && <p className="sidle-meta"><span>игр в библиотеке: <b className="tabular">{s.library.count}</b></span></p>}
        </>
      )}
      {(hasCount(farm.totalDropsRemaining) || hasCount(farm.lastReadAgeSeconds)) && (
        <p className="sidle-meta">
          {hasCount(farm.totalDropsRemaining) && farm.totalDropsRemaining > 0 && <span>всего осталось карточек: <b className="tabular">{farm.totalDropsRemaining}</b></span>}
          {hasCount(farm.lastReadAgeSeconds) && <span>проверено <Dur s={farm.lastReadAgeSeconds} /> назад</span>}
        </p>
      )}
      <div className="sidle-actions">
        {PRIMARY_STATES.has(farm.state) && <button type="button" className="chunky-cta" aria-disabled={off} onClick={go('start')}>Начать фарм</button>}
        {farm.state === 'paused' && <button type="button" className="chunky-cta" aria-disabled={off} onClick={go('resume')}>Продолжить</button>}
        {(ACTIVE_STATES.has(farm.state)) && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('pause')}>Пауза</button>}
        {farm.state === 'farming' && cur && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('skip')}>Пропустить игру</button>}
        {(ACTIVE_STATES.has(farm.state) || farm.state === 'paused' || !known) && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('stop')}>Остановить</button>}
      </div>
    </section>
  );
};

const NameRow: React.FC<{ name: string; end?: React.ReactNode; note?: string }> = ({ name, end, note }) => (
  <li className="sidle-row">
    <span className="sidle-row-main">
      <span className="sidle-row-name" title={name}>{name}</span>
      {note && <span className="sidle-row-note">{note}</span>}
    </span>
    {end}
  </li>
);

/** Games with card drops, read on demand, shown while the farm is not active (an active farm shows its queue instead). */
export const PreviewPanel: React.FC<{ s: SteamIdleState; busy: SteamIdleCommand | null; send: Send }> = ({ s, busy, send }) => {
  const p = s.preview;
  if (!p || !PRIMARY_STATES.has(s.farm.state)) return null;
  const scanning = p.status === 'scanning';
  const off = busy !== null || scanning || !s.available;
  return (
    <section className="titanium-island sidle-preview" aria-labelledby="sidle-preview-title" aria-busy={scanning}>
      <div className="sidle-preview-head">
        <h2 id="sidle-preview-title" className="sidle-title">Игры с карточками{p.games.length > 0 && <span className="sidle-count tabular"> {p.games.length}</span>}</h2>
        <button type="button" className="tactile-btn" aria-disabled={off} onClick={() => { if (!off) send('scan'); }}>
          <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Обновить список
        </button>
      </div>
      {p.status === 'failed' && p.error !== null && (
        <p className="sidle-refusal" role="status"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {previewErrorText(p.error)}</p>
      )}
      {scanning && p.games.length === 0 && (
        <div aria-hidden="true">
          {[0, 1, 2].map((n) => <span key={n} className="sk-bar" style={{ width: `${85 - n * 15}%`, height: '1em', marginTop: n ? 10 : 0 }} />)}
          <span className="sr-only" role="status" data-overflow-ok>Читаем список карточек</span>
        </div>
      )}
      {p.games.length > 0 && (
        <ul className="sidle-list-rows" tabIndex={0} aria-labelledby="sidle-preview-title">
          {p.games.map((g) => (
            <li key={g.appId} className="sidle-row">
              <span className="sidle-row-main">
                <span className="sidle-row-name" title={g.name}>{g.name}</span>
                <span className="sidle-row-note">осталось карточек: <b className="tabular">{g.dropsRemaining}</b></span>
              </span>
              <span className="sidle-row-end tabular">{hoursNumber(g.playtimeHours)} ч</span>
            </li>
          ))}
        </ul>
      )}
      {p.ageSeconds !== null && (
        <p className="sidle-meta">
          {p.games.length > 0 && <span>всего осталось карточек: <b className="tabular">{p.totalDropsRemaining}</b></span>}
          <span>проверено <Dur s={p.ageSeconds} /> назад</span>
        </p>
      )}
      {p.status === 'ready' && p.games.length === 0 && (
        <>
          <p className="sidle-text">Карточек для фарма нет</p>
          {hasCount(s.library?.count) && <p className="sidle-meta"><span>игр в библиотеке: <b className="tabular">{s.library.count}</b></span></p>}
        </>
      )}
    </section>
  );
};

export const Lists: React.FC<{ s: SteamIdleState; busy: SteamIdleCommand | null; send: SendCommand }> = ({ s, busy, send }) => {
  const { queue, done, failed, refundHeld } = s.farm;
  if (!queue.length && !done.length && !failed.length && !refundHeld.length) return null;
  return (
    <section className="titanium-island" aria-labelledby="sidle-queue-title">
      <h2 id="sidle-queue-title" className="sidle-title">Очередь{queue.length > 0 && <span className="sidle-count tabular"> {queue.length}</span>}</h2>
      {queue.length > 0 ? (
        <ul className="sidle-list-rows" tabIndex={0} aria-labelledby="sidle-queue-title">
          {queue.map((g) => <NameRow key={g.appId} name={g.name} end={<span className="sidle-row-end tabular">{g.dropsRemaining}</span>} />)}
        </ul>
      ) : <p className="sidle-text">Очередь пуста</p>}
      {refundHeld.length > 0 && (
        <>
          <h3 id="sidle-held-title" className="sidle-subtitle">Отложены<span className="sidle-count tabular"> {refundHeld.length}</span></h3>
          <ul className="sidle-list-rows short" aria-labelledby="sidle-held-title">
            {refundHeld.map((g) => <RefundHeldRow key={g.appId} game={g} busy={busy} send={send} />)}
          </ul>
        </>
      )}
      {done.length > 0 && (
        <>
          <h3 id="sidle-done-title" className="sidle-subtitle">Уже готово<span className="sidle-count tabular"> {done.length}</span></h3>
          <ul className="sidle-list-rows short" tabIndex={0} aria-labelledby="sidle-done-title">
            {done.map((g) => <NameRow key={g.appId} name={g.name} />)}
          </ul>
        </>
      )}
      {failed.length > 0 && (
        <>
          <h3 id="sidle-failed-title" className="sidle-subtitle">Не получилось<span className="sidle-count tabular"> {failed.length}</span></h3>
          <ul className="sidle-list-rows short" tabIndex={0} aria-labelledby="sidle-failed-title">
            {failed.map((g) => <NameRow key={g.appId} name={g.name} note={failedReasonText(g.reason)} />)}
          </ul>
        </>
      )}
    </section>
  );
};

export const Skeleton: React.FC = () => (
  <div className="sidle-skel" aria-busy="true">
    <span className="sr-only" role="status" data-overflow-ok>Загрузка Steam IDLE…</span>
    <section className="titanium-island sidle-ready" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <div key={n} className="sidle-fact"><span className="sk-bar" style={{ width: '40%', height: '0.9em' }} /><span className="sk-bar" style={{ width: '75%', height: '1.1em' }} /></div>
      ))}
    </section>
    <section className="titanium-island" aria-hidden="true">
      <span className="sk-bar" style={{ width: '30%', height: '1.1em' }} />
      <span className="sk-bar" style={{ width: '50%', height: '1.4em', marginTop: 10 }} />
      <span className="sk-bar" style={{ width: '65%', height: '1em', marginTop: 10 }} />
      <span className="sk-bar" style={{ width: 130, height: 32, marginTop: 14 }} />
    </section>
    <section className="titanium-island" aria-hidden="true">
      {[0, 1, 2, 3].map((n) => <span key={n} className="sk-bar" style={{ width: `${90 - n * 12}%`, height: '1em', marginTop: n ? 10 : 0 }} />)}
    </section>
  </div>
);
