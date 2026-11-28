import { Layers, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSequencer, errorMessage, importCandidates, importWarning, needsOwnDataConfirm, normalizeState, removableCount, removalMessage, sortFindings,
  type CopyFinding, type StartupCopiesState,
} from '../utils/startupCopies.mjs';

const API = 'http://127.0.0.1:28492/api/startup-copies';

type Ask = { type: 'all' } | { type: 'import'; dir: string } | { type: 'close'; id: string } | null;
type Msg = { text: string; error: boolean } | null;

const KIND_LABEL: Record<string, string> = {
  run_value: 'Автозапуск Windows',
  hklm_run: 'Автозапуск для всех пользователей (нужны права администратора)',
  startup_link: 'Ярлык в папке автозагрузки',
  scheduler_task: 'Задание планировщика (раздачи)',
  process: 'Запущена сейчас',
};

// Other copies of the app that start with Windows or still run, with the means to clean up after them and to bring their data over.
export const StartupCopiesCard: React.FC<{ playClick: () => void; restartApp: () => void | Promise<void> }> = ({ playClick, restartApp }) => {
  const [state, setState] = useState<StartupCopiesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [hintHidden, setHintHidden] = useState(false);
  const sequence = useRef(createSequencer());

  // Only the newest request may change the screen: a slow rescan must not undo what an action has shown since
  const load = useCallback(async (rescan: boolean) => {
    const mine = sequence.current.next();
    setLoading(true);
    try {
      const res = await fetch(rescan ? `${API}?rescan=1` : API);
      const next = normalizeState(await res.json().catch(() => null));
      if (!res.ok || !next) throw new Error(`HTTP ${res.status}`);
      if (!sequence.current.isLatest(mine)) return;
      setState(next);
      setMsg(null);
    } catch (err) {
      console.error('StartupCopiesCard: load failed', err);
      if (sequence.current.isLatest(mine)) setMsg({ text: 'Не удалось проверить другие копии', error: true });
    } finally {
      if (sequence.current.isLatest(mine)) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const post = async (path: string, body: object): Promise<{ ok: boolean; status: number; data: any }> => {
    const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  };

  // One action: busy while it runs, the answer carries the fresh state, a failure is shown and logged
  const act = async (path: string, body: object, done: string | ((data: any) => Msg), fail: string) => {
    playClick();
    setAsk(null);
    sequence.current.next();
    setLoading(false);
    setBusy(true);
    try {
      const { ok, status, data } = await post(path, body);
      if (!ok || data.status !== 'ok') throw new Error(errorMessage(data, status));
      const next = normalizeState(data);
      if (next) setState(next);
      else await load(true);
      setMsg(typeof done === 'function' ? done(data) : { text: done, error: false });
    } catch (err) {
      console.error(`StartupCopiesCard: ${path} failed`, err);
      setMsg({ text: `${fail}: ${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  // On success the card stays busy until the restart: nothing else may be started in between
  const runImport = async (dir: string, confirm: boolean) => {
    playClick();
    setBusy(true);
    try {
      const { ok, status, data } = await post('import', { dir, confirm });
      if (status === 409 && data.status === 'confirm_required') { setAsk({ type: 'import', dir }); setBusy(false); return; }
      if (!ok || data.status !== 'ok') throw new Error(errorMessage(data, status));
      setAsk(null);
      setMsg({ text: 'Данные подготовлены. Перезапуск…', error: false });
      setTimeout(() => { void restartApp(); }, 1500);
    } catch (err) {
      console.error('StartupCopiesCard: import failed', err);
      setMsg({ text: `Не удалось перенести данные: ${err instanceof Error ? err.message : String(err)}`, error: true });
      setBusy(false);
    }
  };

  const dismissHint = async () => {
    playClick();
    setHintHidden(true);
    try {
      const { ok, status, data } = await post('dismiss-hint', {});
      if (!ok) throw new Error(errorMessage(data, status));
    } catch (err) {
      console.error('StartupCopiesCard: dismissing the hint failed', err);
    }
  };

  const rows = state ? sortFindings(state.findings) : [];
  const owner = state?.autostartOwner ?? null;
  const candidates = state ? importCandidates(state.copies) : [];
  const removable = removableCount(rows);
  const versionOf = (v: string | null) => (v ? `v${v}` : 'версия неизвестна');

  const renderRow = (f: CopyFinding) => (
    <li key={f.id} className="webhook-row">
      <div className="webhook-head" style={{ flexWrap: 'wrap' }}>
        <strong className="tabular">{versionOf(f.version)}</strong>
        <span className="danger-zone-hint">{KIND_LABEL[f.kind] ?? f.kind}</span>
        {f.dirExists === false && <span className="danger-zone-hint" style={{ color: 'var(--led-rose)' }}>папки нет</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {f.removable && <button className="tactile-btn" disabled={busy || loading} onClick={() => act('remove', { id: f.id }, 'Запись убрана, оригинал сохранён', 'Не удалось убрать')}>Убрать</button>}
          {f.closable && (ask?.type === 'close' && ask.id === f.id ? (
            <>
              <span className="danger-zone-question">Закрыть запущенную копию? Несохранённые данные в ней могут потеряться.</span>
              <button className="safety-guard-btn armed" disabled={busy || loading} onClick={() => act('close', { id: f.id }, 'Копия закрыта', 'Не удалось закрыть')}>Да, закрыть</button>
              <button className="tactile-btn" autoFocus onClick={() => { playClick(); setAsk(null); }}>Отмена</button>
            </>
          ) : (
            <button className="tactile-btn" disabled={busy || loading} onClick={() => { playClick(); setAsk({ type: 'close', id: f.id }); }}><X className="ui-icon" aria-hidden="true" focusable="false" /> Закрыть</button>
          ))}
        </span>
      </div>
      <span className="danger-zone-hint" style={{ overflowWrap: 'anywhere' }} title={f.target}>{f.copyDir || f.target || f.name}</span>
    </li>
  );

  return (
    <div className="titanium-island" role="group" aria-labelledby="startupCopiesTitle" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="engraved-header">
        <span className="tag"><span className="led-dot"></span> <span id="startupCopiesTitle">ДРУГИЕ КОПИИ В АВТОЗАПУСКЕ</span></span>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        Старая папка с программой может запускаться вместе с Windows, занимать порт и забирать раздачи с теми же аккаунтами. Перед удалением записи её оригинал сохраняется в data/startup_cleanup_backup.json, файлы старых копий не трогаются.
      </div>

      {state?.installerHint.show && !hintHidden && (
        <div className="webhook-row" role="note">
          <span style={{ fontSize: 'var(--fs-sm)' }}>Скачиваете каждую версию заново? Установщик обновляет программу на месте и не плодит копии.</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {state.installerHint.url && <a className="tactile-btn" href={state.installerHint.url} target="_blank" rel="noopener noreferrer">Страница последнего релиза</a>}
            <button className="tactile-btn" onClick={dismissHint}>Больше не показывать</button>
          </div>
        </div>
      )}

      {owner && (
        <div className="webhook-row">
          <span style={{ fontSize: 'var(--fs-sm)', overflowWrap: 'anywhere' }}>{`Автозапуск сейчас у ${versionOf(owner.version)} из ${owner.copyDir ?? owner.target}`}</span>
          <div><button className="tactile-btn" disabled={busy || loading} onClick={() => act('move-autostart', {}, 'Автозапуск перенесён на эту копию', 'Не удалось перенести автозапуск')}>Перенести на эту копию</button></div>
        </div>
      )}

      {loading && !state ? (
        <span className="danger-zone-hint" role="status">Проверяем автозапуск…</span>
      ) : state && rows.length === 0 ? (
        <span className="danger-zone-hint" role="status"><Layers className="ui-icon" aria-hidden="true" focusable="false" /> Других копий нет</span>
      ) : (
        <ul className="restore-list" aria-label="Найденные записи других копий">{rows.map(renderRow)}</ul>
      )}

      {candidates.length > 0 && (
        <ul className="restore-list" aria-label="Данные других копий">
          {candidates.map((c) => (
            <li key={c.dir} className="webhook-row">
              <span style={{ fontSize: 'var(--fs-sm)', overflowWrap: 'anywhere' }}>{`Копия ${versionOf(c.version)}: ${c.dir}`}</span>
              {ask?.type === 'import' && ask.dir === c.dir ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="danger-zone-question">Данные этой копии будут заменены, резервная копия сохранится. Приложение перезапустится.</span>
                  {(() => {
                    const age = importWarning(state?.ownData, c);
                    return age.text ? <span role={age.newer ? 'alert' : undefined} style={{ color: age.newer ? 'var(--led-amber)' : 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>{age.text}</span> : null;
                  })()}
                  <button className="safety-guard-btn armed" disabled={busy || loading} onClick={() => runImport(c.dir, true)}>Да, перенести</button>
                  <button className="tactile-btn" autoFocus onClick={() => { playClick(); setAsk(null); }}>Отмена</button>
                </div>
              ) : (
                <div><button className="tactile-btn" disabled={busy || loading} title="Копирует настройки, вход и данные из этой копии; она должна быть закрыта" onClick={() => (needsOwnDataConfirm(state?.ownData) ? (playClick(), setAsk({ type: 'import', dir: c.dir })) : runImport(c.dir, false))}>Перенести данные из этой копии</button></div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="tactile-btn" disabled={busy || loading} onClick={() => { playClick(); void load(true); }}>
          <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Проверить снова
        </button>
        {removable > 0 && (ask?.type === 'all' ? (
          <>
            <span className="danger-zone-question">Убрать все записи других копий? Оригиналы сохранятся в резервном файле.</span>
            <button className="safety-guard-btn armed" disabled={busy || loading} onClick={() => act('remove', { all: true }, removalMessage, 'Не удалось убрать')}>Да, убрать</button>
            <button className="tactile-btn" autoFocus onClick={() => { playClick(); setAsk(null); }}>Отмена</button>
          </>
        ) : (
          <button className="safety-guard-btn" disabled={busy || loading} onClick={() => { playClick(); setAsk({ type: 'all' }); }}>Убрать все</button>
        ))}
        {msg && <span role="status" className="danger-zone-hint" style={{ color: msg.error ? 'var(--led-rose)' : 'var(--text-secondary)' }}>{msg.text}</span>}
      </div>
    </div>
  );
};
