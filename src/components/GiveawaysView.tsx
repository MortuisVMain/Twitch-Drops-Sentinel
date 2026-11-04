import { uiLocale } from '../i18n';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StoreId,
  GiveawaysStateResponse,
  ClaimedGameItem,
  GiveawaysLogEntry,
  SentinelSettings
} from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { initialLoad, loadOk, loadFailed, loadRetry, hasStaleData, isGiveawaysState, failureText, type LoadState } from '../utils/dataLoad';
import { loginAttemptSucceeded, loginHintVisible } from '../utils/loginAttempt';
import { useGiveawaysReadiness } from '../hooks/useGiveawaysReadiness';
import { GiveawaysReadiness } from './GiveawaysReadiness';
import { countTodo } from '../utils/giveawaysReadiness';

interface GiveawaysViewProps {
  onBackToDashboard?: () => void;
  settings?: SentinelSettings;
  onUpdateSettings?: (newSettings: Partial<SentinelSettings>) => void;
  appVersion?: string;
}

interface StoreMeta {
  id: StoreId;
  name: string;
  tag: string;
  badge?: string;
  icon: string;
  color: string;
  bg: string;
}

const STORES: StoreMeta[] = [
  { id: 'epic', name: 'Epic Games', tag: 'EPIC GAMES', badge: 'забрано', icon: '⚡', color: '#3AD29F', bg: 'rgba(58, 210, 159, 0.1)' },
  { id: 'gog', name: 'GOG.com', tag: 'GOG.COM', badge: 'забрано', icon: '🕹️', color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.1)' },
  { id: 'steam', name: 'Steam', tag: 'STEAM', badge: 'забрано', icon: '🎮', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.1)' },
  { id: 'fab', name: 'Fab', tag: 'FAB', badge: 'забрано', icon: '🔷', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.1)' },
  { id: 'unity', name: 'Unity Store', tag: 'UNITY STORE', badge: 'забрано', icon: '📦', color: '#F472B6', bg: 'rgba(244, 114, 182, 0.1)' },
  { id: 'prime', name: 'Prime Gaming', tag: 'PRIME GAMING', badge: 'забрано', icon: '👑', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)' },
  { id: 'itch', name: 'Itch.io', tag: 'ITCH.IO', badge: 'забрано', icon: '👾', color: '#FB7185', bg: 'rgba(251, 113, 133, 0.1)' },
];
interface WeekDayDef {
  key: string;
  short: string;
  bit: number;
  hint: string;
}

const WEEK_DAYS: WeekDayDef[] = [
  { key: 'Monday', short: 'Пн', bit: 2, hint: 'Понедельник — еженедельный старт' },
  { key: 'Tuesday', short: 'Вт', bit: 4, hint: 'Вторник — раздачи GOG & Prime Gaming' },
  { key: 'Wednesday', short: 'Ср', bit: 8, hint: 'Среда — мид-вик обновления' },
  { key: 'Thursday', short: 'Чт', bit: 16, hint: 'Четверг — Epic Games Store (18:00 МСК)' },
  { key: 'Friday', short: 'Пт', bit: 32, hint: 'Пятница — уикенд-раздачи Steam/GOG' },
  { key: 'Saturday', short: 'Сб', bit: 64, hint: 'Суббота — акции выходного дня' },
  { key: 'Sunday', short: 'Вс', bit: 1, hint: 'Воскресенье — еженедельный свип' },
];

const DAY_SHORT_MAP: Record<string, string> = {
  Monday: 'Пн',
  Tuesday: 'Вт',
  Wednesday: 'Ср',
  Thursday: 'Чт',
  Friday: 'Пт',
  Saturday: 'Сб',
  Sunday: 'Вс',
};


function formatClaimDate(rawDate?: string, tsMs?: number): string {
  if (tsMs && tsMs > 0) {
    const d = new Date(tsMs);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
    }
  }
  if (rawDate) {
    if (!rawDate.includes('T') && !rawDate.includes('-')) return rawDate;
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
    }
  }
  return 'Недавно';
}

const STORE_NAMES: Record<string, string> = Object.fromEntries(STORES.map((s) => [s.id, s.name]));

const SWITCH_ACCOUNT_CONFIRM = 'Выйти из этого аккаунта и войти в другой? Если закрыть окно браузера, не войдя, магазин останется без входа. У Fab вход через Epic Games: выйти придётся из обоих.';

export const GiveawaysView: React.FC<GiveawaysViewProps> = ({
  onBackToDashboard,
  settings,
  onUpdateSettings,
  appVersion = '',
}) => {
  const [readinessOpen, setReadinessOpen] = useState(false);
  const readiness = useGiveawaysReadiness(readinessOpen);
  const [load, setLoad] = useState<LoadState<GiveawaysStateResponse>>(initialLoad);
  const data = load.data;
  const isLoading = load.phase === 'loading'; // only until the first answer: the 5 s poll never brings the skeleton back
  const noData = data === null;
  const [isClaiming, setIsClaiming] = useState(false);
  const [headless, setHeadless] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sentinel_giveaways_headless') : null;
    return saved !== null ? saved === 'true' : true;
  });
  const [selectedStores, setSelectedStores] = useState<StoreId[]>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('sentinel_giveaways_selected_stores') : null;
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['epic', 'gog', 'steam', 'fab', 'unity'];
  });
  const [logs, setLogs] = useState<GiveawaysLogEntry[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loginStore, setLoginStore] = useState<StoreId | null>(null);
  const loginStartedAtRef = useRef<number | null>(null);
  const loginAttemptAtRef = useRef<number>(0);
  const [filterStore, setFilterStore] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { playClick, playRewardChime } = useTactileAudio();

  const handleTerminalScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight <= 50;
  };

  const fetchState = async (force = false) => {
    try {
      const res = await fetch(`http://127.0.0.1:28492/api/v1/giveaways/state?force_refresh=${force ? '1' : '0'}`);
      if (!res.ok) {
        console.error('Giveaways state: the service answered with an error', res.status);
        setLoad((prev) => loadFailed(prev, 'http', res.status));
        return;
      }
      const json: unknown = await res.json();
      if (!isGiveawaysState(json)) {
        console.error('Giveaways state: unexpected answer shape (the runner is missing)', json);
        setLoad((prev) => loadFailed(prev, 'shape'));
        return;
      }
      const state = json as GiveawaysStateResponse;
      setLoad(loadOk(state));
      setIsClaiming(state.runner.state === 'running' || state.runner.state === 'aborting');
      if (state.recentLogs && state.recentLogs.length > 0 && logs.length === 0) {
        setLogs(state.recentLogs);
      }
    } catch (e) {
      console.error('Giveaways state: the request failed or the answer is not JSON', e);
      setLoad((prev) => loadFailed(prev, 'network'));
    }
  };

  const retryLoad = () => {
    setLoad((prev) => loadRetry(prev));
    void fetchState(true);
  };

  useEffect(() => {
    fetchState(true);
    const interval = setInterval(() => fetchState(false), 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect SSE Stream for real-time logs
  useEffect(() => {
    try {
      const sse = new EventSource('http://127.0.0.1:28492/api/v1/giveaways/stream');
      eventSourceRef.current = sse;

      sse.addEventListener('log', (event: MessageEvent) => {
        try {
          const logItem: GiveawaysLogEntry = JSON.parse(event.data);
          setLogs((prev) => [...prev.slice(-199), logItem]);
        } catch {}
      });

      // State events only say that something changed (they carry no store data): re-read the full state
      sse.addEventListener('state', () => {
        fetchState(false);
      });

      return () => {
        sse.close();
      };
    } catch (err) {
      console.warn('SSE connection skipped:', err);
    }
  }, []);

  // Auto-scroll terminal to bottom ONLY if user is already near bottom (no hijack during reading)
  useEffect(() => {
    if (terminalRef.current && isAtBottomRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // A scheduled run reads the choice from config.json, so it must not stay in this WebView's localStorage alone
  useEffect(() => {
    if (!settings) return;
    const saved = settings.giveaways_selected_stores;
    if (saved && localStorage.getItem('sentinel_giveaways_selected_stores') === null) {
      setSelectedStores(saved);
    } else if (JSON.stringify(saved) !== JSON.stringify(selectedStores)) {
      onUpdateSettings?.({ giveaways_selected_stores: selectedStores });
    }
  }, [settings?.giveaways_selected_stores, selectedStores]);

  const handleToggleStore = (storeId: StoreId) => {
    playClick();
    setSelectedStores(prev => {
      const updated = prev.includes(storeId) ? prev.filter(s => s !== storeId) : [...prev, storeId];
      localStorage.setItem('sentinel_giveaways_selected_stores', JSON.stringify(updated));
      return updated;
    });
  };

  const handleToggleHeadless = () => {
    playClick();
    const nextVal = !headless;
    setHeadless(nextVal);
    localStorage.setItem('sentinel_giveaways_headless', String(nextVal));
    if (onUpdateSettings) {
      onUpdateSettings({ giveaways_headless: nextVal });
    }
  };

  const handleClaimAll = async () => {
    playClick();
    isAtBottomRef.current = true;
    if (isClaiming) {
      // Abort
      try {
        await fetch('http://127.0.0.1:28492/api/v1/giveaways/abort', { method: 'POST' });
        setIsClaiming(false);
      } catch {}
      return;
    }

    if (selectedStores.length === 0) {
      setActionError('Не выбран ни один магазин.');
      return;
    }

    setIsClaiming(true);
    setActionError(null);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/v1/giveaways/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stores: selectedStores,
          headless,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setActionError(errJson.detail || 'Не удалось запустить сборщик');
        setIsClaiming(false);
      }
    } catch (e: any) {
      setActionError(e.message || 'Ошибка сети при запуске');
      setIsClaiming(false);
    }
  };

  const handleStoreAuth = async (storeId: StoreId, switchAccount = false) => {
    playClick();
    setActionError(null);
    loginStartedAtRef.current = null;
    loginAttemptAtRef.current = Date.now();
    setLoginStore(storeId);
    try {
      const res = await fetch(`http://127.0.0.1:28492/api/v1/giveaways/auth/${storeId}${switchAccount ? '?switch=1' : ''}`, { method: 'POST' });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setActionError(errJson.detail || (res.status === 409
          ? 'Уже идёт сбор или вход в другой магазин. Дождитесь конца или остановите его.'
          : 'Не удалось открыть окно входа'));
        setLoginStore(null);
        return;
      }
      loginStartedAtRef.current = Date.now();
      fetchState(true);
    } catch (err) {
      console.error(`GiveawaysView: авторизация магазина ${storeId} не запущена`, err);
      setActionError('Ошибка сети при запуске');
      setLoginStore(null);
    }
  };

  // A login run has ended: unless this very attempt was confirmed, the user has to know that it did not work.
  // The grace period covers a state poll that was already on its way when the run started.
  useEffect(() => {
    const startedAt = loginStartedAtRef.current;
    if (!loginStore || !data?.runner || startedAt === null || Date.now() - startedAt < 6000) return;
    if (data.runner.state === 'running' || data.runner.state === 'aborting') return;
    if (!loginAttemptSucceeded(data.stores?.[loginStore], loginAttemptAtRef.current)) {
      setActionError('Вход не завершён: окно браузера закрыто или вышло время. Нажмите «Войти в аккаунт» ещё раз.');
    }
    setLoginStore(null);
    loginStartedAtRef.current = null;
  }, [data, loginStore]);

  // The engine confirmed this attempt while the run goes on: an error left from before is stale.
  useEffect(() => {
    if (loginStore && actionError && loginAttemptSucceeded(data?.stores?.[loginStore], loginAttemptAtRef.current)) setActionError(null);
  }, [data, loginStore, actionError]);

  const handleCopyLogs = () => {
    playClick();
    const textToCopy = logs.length > 0 
      ? logs.map(l => (l.ts ? `[${new Date(l.ts).toLocaleTimeString(uiLocale())}] ` : '') + (l.line || (l as any).message || '')).join('\n')
      : logs.map((log) => log.line).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isSchedulerActive = data?.scheduler?.exists === true && data.scheduler.state !== 'Disabled';
  const isSchedulerUnknown = data?.scheduler?.queryFailed === true;
  const isSchedulerMissing = data?.scheduler?.exists === false && !isSchedulerUnknown;
  const activeDays: string[] = useMemo(() => {
    if (data?.scheduler?.activeDays && data.scheduler.activeDays.length > 0) {
      return data.scheduler.activeDays;
    }
    const mask = data?.scheduler?.daysOfWeek;
    if (mask !== undefined && mask !== null) {
      return WEEK_DAYS.filter(d => (mask & d.bit) !== 0).map(d => d.key);
    }
    return ['Tuesday', 'Friday', 'Sunday'];
  }, [data?.scheduler?.activeDays, data?.scheduler?.daysOfWeek]);

  const [selectedDays, setSelectedDays] = useState<string[]>(['Tuesday', 'Friday', 'Sunday']);

  useEffect(() => {
    if (activeDays.length > 0) {
      setSelectedDays(activeDays);
    }
  }, [activeDays]);

  const postSchedulerChange = async (endpoint: string, body: object) => {
    setActionError(null);
    try {
      const res = await fetch(`http://127.0.0.1:28492/api/v1/giveaways/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setActionError(errJson.detail || 'Не удалось изменить расписание автосбора');
      }
      // Also after a refusal: brings the optimistically changed day chips back to the real state
      fetchState(true);
    } catch (err) {
      console.error(`GiveawaysView: запрос ${endpoint} не выполнен`, err);
      setActionError('Ошибка сети при изменении расписания автосбора');
    }
  };

  const handleToggleScheduler = async () => {
    playClick();
    await postSchedulerChange('toggle-scheduler', { enable: !isSchedulerActive });
  };

  const handleToggleDay = async (dayKey: string) => {
    playClick();
    // No task yet means no active days: the chips are unlit, so the first click selects just that day
    const currentDays = isSchedulerMissing ? [] : selectedDays;
    const isPresent = currentDays.includes(dayKey);
    const nextDays = isPresent
      ? currentDays.filter(d => d !== dayKey)
      : [...currentDays, dayKey];
    const orderedDays = WEEK_DAYS.map(d => d.key).filter(k => nextDays.includes(k));
    setSelectedDays(orderedDays);
    await postSchedulerChange('scheduler-days', { days: orderedDays });
  };

  const activeDayLabels = useMemo(() => {
    if (selectedDays.length === 0) return 'Дни не выбраны';
    if (selectedDays.length === 7) return 'Ежедневно';
    return selectedDays.map(d => DAY_SHORT_MAP[d] || d).join(',');
  }, [selectedDays]);

  const schedulerButtonLabel = isSchedulerUnknown
    ? '⚠ Планировщик не отвечает'
    : isSchedulerMissing
      ? '○ Автосбор не настроен'
      : isSchedulerActive ? `● Активен (${activeDayLabels})` : '○ Приостановлен';
  const schedulerButtonTitle = isSchedulerUnknown
    ? 'Не удалось получить состояние задания. Нажмите, чтобы попробовать ещё раз'
    : isSchedulerMissing
      ? 'Задание ещё не создано в Планировщике Windows. Нажмите, чтобы создать его'
      : isSchedulerActive ? 'Нажмите для приостановки планировщика' : 'Нажмите для включения планировщика';

  // Claimed items: Priority to real backend inventory (26+ items)
  const claimedItems: ClaimedGameItem[] = useMemo(() => {
    if (data?.inventory && data.inventory.length > 0) {
      return data.inventory;
    }
    return [];
  }, [data?.inventory]);

  // Filtered claimed items based on active store filter and search box
  const filteredClaimedItems = useMemo(() => {
    return claimedItems.filter((item) => {
      const matchStore = filterStore === 'all' || item.store === filterStore;
      const matchSearch = !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStore && matchSearch;
    });
  }, [claimedItems, filterStore, searchQuery]);

  // Counts by store
  const storeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: claimedItems.length };
    claimedItems.forEach((it) => {
      counts[it.store] = (counts[it.store] || 0) + 1;
    });
    return counts;
  }, [claimedItems]);

  // Helper to colorize log lines
  const renderLogLine = (l: GiveawaysLogEntry, idx: number) => {
    const lineText = l.line || (l as any).message || '';
    if (!lineText) return null;

    let timeStr = '';
    if (l.ts) {
      try {
        const d = new Date(l.ts);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      } catch {}
    }

    let lineStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
    if (lineText.includes('====') || lineText.includes('----')) {
      lineStyle = { color: 'var(--border-subtle)', opacity: 0.6 };
    } else if (lineText.includes('▶') || lineText.includes('[SENTINEL]')) {
      lineStyle = { color: 'var(--led-cyan)', fontWeight: 600 };
    } else if (lineText.includes('успешно') || lineText.includes('claimed') || lineText.includes('SUCCESS') || lineText.includes('забрано') || lineText.includes('finished checking')) {
      lineStyle = { color: 'var(--led-mint)', fontWeight: 600 };
    } else if (lineText.includes('ОШИБКА') || lineText.includes('ERROR') || lineText.includes('failed') || lineText.includes('exception')) {
      lineStyle = { color: 'var(--led-amber)', fontWeight: 600 };
    } else if (lineText.includes('Mortuis_V_Studio') || lineText.includes('МОДУЛЬ РАЗДАЧ')) {
      lineStyle = { color: 'var(--text-primary)', fontWeight: 700 };
    }

    return (
      <div key={idx} style={{ marginBottom: '2.5px', wordBreak: 'break-word', ...lineStyle }}>
        {timeStr && <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>[{timeStr}]</span>}
        <span>{lineText}</span>
      </div>
    );
  };

  return (
    <div id="view-giveaways" className="view-tab active" style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Top Header Island 1-to-1 with SPEC */}
      <div className="titanium-island" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>
            Бесплатные раздачи
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            Забираем бесплатные игры и ассеты в 7 магазинах
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="tactile-btn"
            onClick={() => { playClick(); setReadinessOpen(true); }}
            title="Что уже готово для раздач и что осталось сделать"
            aria-haspopup="dialog"
          >
            ✔ Проверить готовность
            {readiness.data && !readiness.failure && countTodo(readiness.data.items) > 0 && (
              <>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--led-rose)', flexShrink: 0 }} />
                <span className="sr-only" data-overflow-ok>Есть незавершённые шаги</span>
              </>
            )}
          </button>
          <button 
            className={`tactile-btn ${headless ? 'active-mint' : ''}`}
            onClick={handleToggleHeadless}
            title="Браузер работает скрыто: окно магазина не появляется на экране"
          >
            👁 Фоновый режим: {headless ? 'вкл' : 'выкл'}
          </button>
          <button 
            className={`chunky-cta ${isClaiming ? 'amber' : ''}`}
            onClick={handleClaimAll}
          >
            {isClaiming ? '⏹ ОСТАНОВИТЬ КЛЕЙМ' : `▶ ЗАБРАТЬ ВСЁ (${selectedStores.length} МАГАЗИНОВ)`}
          </button>
        </div>
      </div>

      {/* 7 Store Pods Grid (.stores-7-grid) 1-to-1 with SPEC */}
      <div className="stores-7-grid" style={{ flexShrink: 0 }} aria-busy={isLoading}>
        {isLoading && <span className="sr-only" role="status" data-overflow-ok>Загрузка данных раздач…</span>}
        {STORES.map((store) => {
          const isSelected = selectedStores.includes(store.id);
          const storeData = data?.stores ? (data.stores as any)[store.id] : null;
          const count = storeData?.claimedCount ?? 0;
          const isAuthed = Boolean(storeData?.account);
          const rawAccount: string = storeData?.account || '';
          const accountName = rawAccount === rawAccount.toUpperCase() ? rawAccount.toLowerCase() : rawAccount;

          return (
            <div 
              key={store.id} 
              className={`store-pod ${isSelected ? 'selected' : ''}`}
              onClick={() => handleToggleStore(store.id)}
            >
              <div className="store-pod-header">
                <div className="store-pod-title">
                  <span style={{ fontSize: 'var(--fs-sm)' }}>{store.icon}</span>
                  <strong>{store.name}</strong>
                </div>
                <span className={`store-select-badge ${isSelected ? 'active' : ''}`}>
                  {isSelected ? '✓ ВКЛ' : 'ВЫКЛ'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px 6px', flexWrap: 'wrap' }}>
                <span className="tabular" style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: !isAuthed ? 'var(--text-muted)' : 'inherit' }}>
                  {isLoading ? <span className="sk-bar" aria-hidden="true" style={{ width: '1.2em', height: '0.9em' }} /> : noData ? '—' : count}
                </span>
                <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  {store.badge}
                </span>
              </div>

              <div style={{ fontSize: 'var(--fs-xs)', display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                <span className={`led-dot ${!isAuthed ? 'off' : ''}`}></span>
                {isLoading ? (
                  <span className="sk-bar" aria-hidden="true" style={{ flex: 1, height: '0.9em' }} />
                ) : noData ? (
                  <span style={{ color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Служба не прислала данные">
                    Нет данных
                  </span>
                ) : (
                  <span
                    style={{ color: isAuthed ? 'var(--led-mint)' : 'var(--led-amber)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={isAuthed ? `Вы вошли как ${accountName}` : 'Нужно войти в аккаунт магазина'}
                  >
                    {isAuthed ? accountName : '⚠ Требуется вход'}
                  </span>
                )}
                {isAuthed && (
                  <button
                    className="tactile-btn"
                    style={{ minHeight: '20px', width: '22px', padding: 0, fontSize: 'var(--fs-xs)', justifyContent: 'center', flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(SWITCH_ACCOUNT_CONFIRM)) handleStoreAuth(store.id, true);
                    }}
                    title="Сменить аккаунт"
                    aria-label={`Сменить аккаунт ${store.name}`}
                  >
                    ⇄
                  </button>
                )}
              </div>

              {isLoading && <span className="sk-bar" aria-hidden="true" style={{ height: '24px', width: '100%' }} />}
              {!isAuthed && !noData && (
                <button
                  className="tactile-btn active-mint"
                  style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', width: '100%', justifyContent: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStoreAuth(store.id);
                  }}
                >
                  🔑 Войти в аккаунт
                </button>
              )}
            </div>
          );
        })}
      </div>

      <GiveawaysReadiness
        isOpen={readinessOpen}
        onClose={() => setReadinessOpen(false)}
        data={readiness.data}
        loading={readiness.loading}
        failure={readiness.failure}
        actionError={readiness.actionError || actionError}
        storeNames={STORE_NAMES}
        appVersion={appVersion}
        onRecheck={() => readiness.check()}
        onInstallEngine={readiness.installEngine}
        onSignIn={(store) => handleStoreAuth(store)}
        onEnableGiveaways={async () => { await onUpdateSettings?.({ giveaways_enabled: true }); }}
        onEnableScheduler={handleToggleScheduler}
      />

      {(load.failure !== null) && (
        <div className="titanium-island" role={hasStaleData(load) ? 'status' : 'alert'} style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '10px', color: 'var(--led-amber)', fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
          <span style={{ minWidth: 0 }}>
            ⚠ {failureText(load.failure)}{' '}
            {load.failure === 'http' && load.status ? <>Код ответа: {load.status}. </> : null}
            {hasStaleData(load) ? 'Показаны последние полученные данные.' : 'Данные раздач недоступны.'}
          </span>
          <button className="tactile-btn" style={{ minHeight: '22px', flexShrink: 0 }} onClick={() => { playClick(); retryLoad(); }}>
            Повторить
          </button>
        </div>
      )}

      {actionError && (
        <div className="titanium-island" role="alert" style={{ flexShrink: 0, color: 'var(--led-amber)', fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
          ⚠ {actionError}
        </div>
      )}

      {loginStore && loginHintVisible(data?.stores?.[loginStore], loginAttemptAtRef.current, actionError) && (
        <div className="titanium-island" role="status" style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', display: 'block' }}>
          <strong>🔑 {STORES.find(s => s.id === loginStore)?.name}: </strong>
          {isClaiming
            ? <span>войдите в аккаунт в открывшемся окне браузера. Если окна не видно, найдите его на панели задач. На вход есть 3 минуты.</span>
            : <span>готовим браузер. При первом запуске он скачивается, это займёт несколько минут.</span>}
        </div>
      )}

      {/* 2-Column Bento: Left Collected Collection + Right Task Scheduler 1-to-1 with SPEC */}
      <div className="giveaways-main-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '12px', flex: 1, minHeight: 0, overflow: 'hidden', alignItems: 'start' }}>
        {/* Left Bento: Collection */}
        <div className="titanium-island" style={{ display: 'flex', flexDirection: 'column', maxHeight: '100%', minHeight: 0, overflow: 'hidden' }}>
          <div className="engraved-header" style={{ marginBottom: '8px', flexShrink: 0 }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Коллекция забранных игр и UE5-ассетов">КОЛЛЕКЦИЯ · {noData ? '…' : claimedItems.length}</span>
            </span>
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="claimed-filter-bar" style={{ flexShrink: 0 }}>
            <div className="claimed-store-tabs">
              <button 
                className={`claimed-tab-pill ${filterStore === 'all' ? 'active' : ''}`}
                onClick={() => setFilterStore('all')}
              >
                {noData ? 'Все' : `Все (${storeCounts['all'] || 0})`}
              </button>
              {STORES.filter(s => (storeCounts[s.id] || 0) > 0).map(s => (
                <button
                  key={s.id}
                  className={`claimed-tab-pill ${filterStore === s.id ? 'active' : ''}`}
                  onClick={() => setFilterStore(s.id)}
                >
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                  <span style={{ opacity: 0.7 }}>({storeCounts[s.id] || 0})</span>
                </button>
              ))}
            </div>

            <input 
              type="text" 
              className="claimed-search-box" 
              placeholder="🔍 Поиск тайтла..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Compact Tiles Grid */}
          <div className="claimed-compact-grid" style={{ flex: '0 1 auto' }}>
            {isLoading ? (
              [0, 1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="claimed-compact-card" aria-hidden="true">
                  <span className="sk-bar" style={{ width: '28px', height: '28px', flexShrink: 0 }} />
                  <div className="claimed-card-body" style={{ gap: '6px' }}>
                    <span className="sk-bar" style={{ width: '40%', height: '0.8em' }} />
                    <span className="sk-bar" style={{ width: '85%', height: '0.9em' }} />
                  </div>
                </div>
              ))
            ) : noData ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', gridColumn: '1 / -1' }}>
                Коллекция недоступна: служба не прислала данные
              </div>
            ) : filteredClaimedItems.length > 0 ? (
              filteredClaimedItems.map((item) => {
                const storeMeta = STORES.find(s => s.id === item.store) || STORES[0];
                const dateStr = formatClaimDate(item.claimedAt || (item as any).claimed_at, item.timestampMs);

                return (
                  <div key={item.id} className="claimed-compact-card">
                    <div 
                      className="claimed-store-badge-icon" 
                      style={{ color: storeMeta.color, background: storeMeta.bg }}
                      title={`Магазин: ${storeMeta.name}`}
                    >
                      {storeMeta.icon}
                    </div>

                    <div className="claimed-card-body">
                      <div className="claimed-card-header-row">
                        <span style={{ color: storeMeta.color, fontWeight: 700 }} title={storeMeta.id === 'fab' ? 'Fab (магазин Unreal Engine 5)' : storeMeta.name}>
                          {storeMeta.tag}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          ✓ {dateStr}
                        </span>
                      </div>

                      <div className="claimed-card-title" title={item.title}>
                        {item.title}
                      </div>
                    </div>

                    {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="claimed-ext-link"
                        title="Открыть страницу тайтла в магазине ↗"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↗
                      </a>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', gridColumn: '1 / -1' }}>
                Тайтлы не найдены по заданным критериям
              </div>
            )}
          </div>
        </div>

        {/* Right Bento: Task Scheduler & Log */}
        <div className="titanium-island" style={{ display: 'flex', flexDirection: 'column', maxHeight: '100%', minHeight: 0, overflow: 'hidden', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: 0, flexShrink: 0, flexWrap: 'wrap', rowGap: '4px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Планировщик задач Windows: FreeGamesClaimerStudio">ПЛАНИРОВЩИК</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button 
                className={`tactile-btn ${copiedLogs ? 'active-mint' : ''}`} 
                style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={handleCopyLogs}
                title="Скопировать все логи терминала в буфер обмена"
              >
                <span>{copiedLogs ? '✓' : '📋'}</span>
                <span>{copiedLogs ? 'Скопировано!' : 'Копировать логи'}</span>
              </button>
              <button 
                className={`tactile-btn ${isSchedulerActive ? 'active-mint' : ''}`} 
                style={{ minHeight: '22px', fontSize: 'var(--fs-xs)' }}
                onClick={handleToggleScheduler}
                title={schedulerButtonTitle}
              >
                {schedulerButtonLabel}
              </button>
            </div>
          </div>

          {/* Day Selector Strip */}
          <div className="scheduler-days-strip">
            <span className="scheduler-days-label">
              <span className="led-dot" style={{ width: '5px', height: '5px' }}></span>
              Дни автосбора:
            </span>
            <div className="scheduler-days-chips">
              {WEEK_DAYS.map(d => {
                const isActive = !isSchedulerMissing && selectedDays.includes(d.key);
                return (
                  <button
                    key={d.key}
                    className={`scheduler-day-chip ${isActive ? 'active' : ''}`}
                    onClick={() => handleToggleDay(d.key)}
                    title={`${d.hint} (${isActive ? 'Активен — нажмите для отключения' : 'Отключен — нажмите для включения'})`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {isSchedulerMissing && (
            <div style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Автосбор по расписанию не запускается: задание ещё не создано. Выберите дни или нажмите кнопку выше.
            </div>
          )}
          {data?.scheduler?.repairError && (
            <div role="alert" style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', lineHeight: 1.4 }}>
              ⚠ {data.scheduler.repairError}
            </div>
          )}
          {data?.scheduler?.lastRunFailed && (
            <div role="alert" style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {`⚠ Последний запуск по расписанию завершился с ошибкой. Лог: ${data.scheduler.logFile}`}
            </div>
          )}

          <div
            ref={terminalRef}
            onScroll={handleTerminalScroll}
            className="obsidian-well"
            style={{
              flex: '0 1 auto',
              minHeight: logs.length > 0 ? '160px' : 0,
              padding: logs.length > 0 ? '9px' : '7px 10px',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--fs-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              overflowY: 'auto'
            }}
          >
            {logs.length > 0 ? (
              logs.map((l, i) => renderLogLine(l, i))
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                Журнал пуст — появится после первого автосбора
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
