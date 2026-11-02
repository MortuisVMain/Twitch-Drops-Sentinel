import React, { useState } from 'react';
import { PHOTO_BACKDROPS, PhotoPreview } from './PhotoBackdrop';
import { ThemedThumb } from './ThemedThumb';

interface ThemeDef { id: string; name: string; bg: string; acc: string; light?: boolean }

const THEMES: ThemeDef[] = [
  { id: 'titanium', name: 'Titanium', bg: '#0D1016', acc: '#3AD29F' },
  { id: 'luna-mint', name: 'Luna Mint', bg: '#1A211F', acc: '#73BBA5' },
  { id: 'apple-luna', name: 'Apple Luna', bg: '#171D1C', acc: '#368873' },
  { id: 'gradient', name: 'Aurora', bg: '#100F22', acc: 'linear-gradient(90deg,#34D399,#818CF8)' },
  { id: 'cyberpunk', name: 'Cyberpunk', bg: '#0D0A14', acc: '#FCEE0A' },
  { id: 'copper', name: 'Copper', bg: '#15110F', acc: '#F08C4B' },
  { id: 'midnight', name: 'Midnight', bg: '#0F1626', acc: '#7DB4FF' },
  { id: 'graphite', name: 'Graphite OLED', bg: '#050506', acc: '#D8DDE3' },
  { id: 'sakura', name: 'Sakura Night', bg: '#1C1419', acc: '#F4A7B9' },
  { id: 'light', name: 'Daylight', bg: '#E8E5DF', acc: '#059669', light: true },
  { id: 'paper', name: 'Paper', bg: '#EEF1F4', acc: '#2457D6', light: true },
];

type Group = 'energy' | 'space' | 'materials' | 'landscape' | 'classic';

interface BackdropDef {
  type: string;
  mode: string;
  name: string;
  hint: string;
  group: Group;
  /** image url for procedural backdrops; without it, a 2D pattern drawn with the backdrop's CSS (photos: ThemedThumb) */
  thumb?: string;
  pattern?: string;
}

const PHOTO_GROUP: Record<string, Group> = {
  lava0: 'energy', lavai: 'energy', caustics: 'energy', wave: 'energy', beams: 'energy', hex2: 'energy',
  globe: 'space', radar: 'space', signal: 'space', drops: 'space',
  metal2: 'materials', silk: 'materials', chrome: 'materials', glass: 'materials', hex1: 'materials', hexi: 'materials',
  ridges: 'landscape',
};

const GROUPS: { id: Group; label: string }[] = [
  { id: 'energy', label: 'Энергия и свет' },
  { id: 'space', label: 'Космос и сигналы' },
  { id: 'materials', label: 'Материалы' },
  { id: 'landscape', label: 'Пейзаж' },
];

const BACKDROPS: BackdropDef[] = [
  ...PHOTO_BACKDROPS.map((p): BackdropDef => ({ type: 'photo', mode: p.id, name: p.name, hint: p.sub, group: PHOTO_GROUP[p.id] ?? 'materials' })),
  ...([
    ['hex-theme', 'Соты в цвете темы', 'Призмы, швы светятся акцентом'],
    ['hex-magma', 'Соты с магмой', 'Призмы и раскалённые швы'],
    ['tectonic-lava', 'Лавовые разломы', 'Трещины и искры'],
    ['topo-damascus', 'Дамасская сталь', 'Изолинии узора'],
    ['carbon-weave', 'Кованый карбон', 'Плетение с бликом'],
    ['pcb-3d', 'Чипы и шины', 'Плата с импульсами'],
    ['liquid-silk', 'Мягкие сферы', 'Плавающие пятна света'],
  ] as const).map(([mode, name, hint]): BackdropDef => ({ type: '3d', mode, name, hint, group: 'classic', thumb: `backdrops/proc/${mode}.webp` })),
  ...([
    ['2d-honeycomb', 'Контур сот', 'Тонкая сетка шестигранников'],
    ['2d-lava', 'Контур лавы', 'Линии разломов'],
    ['2d-dots', 'Точки', 'Ровная точечная сетка'],
    ['2d-carbon', 'Диагональ', 'Плоский узор карбона'],
  ] as const).map(([type, name, hint]): BackdropDef => ({ type, mode: 'none', name, hint, group: 'classic', pattern: type })),
];

const CLASSIC_COUNT = BACKDROPS.filter(b => b.group === 'classic').length;
const LAST_KEY = 'sentinel_last_backdrop';
const DEFAULT_LAST = { type: 'photo', mode: 'hex2', name: 'Неоновые соты' };

/** 'apple-luna' was merged into 'liquid-silk'; saved settings with the old id keep working and show as selected. */
function isActive(b: BackdropDef, type: string, mode: string): boolean {
  if (b.type !== type) return false;
  if (b.type === '3d' || b.type === 'photo') return b.mode === mode || (b.mode === 'liquid-silk' && mode === 'apple-luna');
  return true;
}

/** The backdrop to return to when 'No backdrop' is switched off. */
function readLast(): typeof DEFAULT_LAST {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return v && typeof v.type === 'string' && typeof v.mode === 'string' && typeof v.name === 'string' ? v : DEFAULT_LAST;
  } catch (err) {
    console.warn('AppearancePanel: cannot read the last backdrop:', err);
    return DEFAULT_LAST;
  }
}

export interface AppearancePanelProps {
  open: boolean;
  theme: string;
  backdropType: string;
  reliefMode: string;
  reliefOpacity: number;
  onTheme: (id: string) => void;
  onBackdrop: (type: string, mode: string, label: string) => void;
  onOpacity: (percent: number) => void;
}

export const AppearancePanel: React.FC<AppearancePanelProps> = ({
  open, theme, backdropType, reliefMode, reliefOpacity, onTheme, onBackdrop, onOpacity,
}) => {
  const [tab, setTab] = useState<'theme' | 'backdrop'>('theme');
  const [hovered, setHovered] = useState<string | null>(null);
  const [classicOpen, setClassicOpen] = useState(() => BACKDROPS.some(b => b.group === 'classic' && isActive(b, backdropType, reliefMode)));
  const noBackdrop = backdropType === 'smooth';

  const remember = (b: BackdropDef) => {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ type: b.type, mode: b.mode, name: b.name })); }
    catch (err) { console.warn('AppearancePanel: cannot save the last backdrop:', err); }
  };
  const pick = (b: BackdropDef) => { remember(b); onBackdrop(b.type, b.mode, b.name); };
  const toggleNone = () => {
    if (noBackdrop) { const last = readLast(); onBackdrop(last.type, last.mode, last.name); return; }
    const current = BACKDROPS.find(b => isActive(b, backdropType, reliefMode));
    if (current) remember(current);
    onBackdrop('smooth', 'none', 'Без фона');
  };

  const card = (b: BackdropDef) => {
    const active = !noBackdrop && isActive(b, backdropType, reliefMode);
    const key = b.type + b.mode;
    return (
      <button key={key} type="button" title={b.hint} className={`ap-card ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => pick(b)}
        onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(h => (h === key ? null : h))}>
        <span className="ap-thumb-wrap">
          {b.type === 'photo' ? <ThemedThumb id={b.mode} themeId={theme} />
            : b.thumb ? <img className="ap-thumb" src={b.thumb} alt="" loading="lazy" />
            : <span className="ap-thumb" data-bd={b.pattern} />}
          {b.type === 'photo' && hovered === key && <PhotoPreview photoId={b.mode} themeId={theme} />}
        </span>
        <span className="ap-name">{b.name}</span>
      </button>
    );
  };

  const themeGroup = (label: string, light: boolean) => (
    <>
      <div className="ap-label">{label}</div>
      <div className="ap-grid">
        {THEMES.filter(t => !!t.light === light).map(t => (
          <button key={t.id} type="button" className={`ap-card ${theme === t.id ? 'active' : ''}`} onClick={() => onTheme(t.id)} aria-pressed={theme === t.id}>
            <span className="ap-swatch" style={{ background: t.bg }}>
              <span className={`ap-swatch-panel ${t.light ? 'light' : ''}`} />
              <span className="ap-swatch-acc" style={{ background: t.acc }} />
            </span>
            <span className="ap-name">{t.name}</span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className={`theme-dropdown-menu appearance-panel ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="ap-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'theme'} className={`ap-tab ${tab === 'theme' ? 'on' : ''}`} onClick={() => setTab('theme')}>Тема</button>
        <button type="button" role="tab" aria-selected={tab === 'backdrop'} className={`ap-tab ${tab === 'backdrop' ? 'on' : ''}`} onClick={() => setTab('backdrop')}>Фон</button>
      </div>

      {tab === 'theme' ? (
        <div className="ap-body">
          {themeGroup('Тёмные', false)}
          {themeGroup('Светлые', true)}
        </div>
      ) : (
        <>
          <div className="ap-toolbar">
            <label className="ap-switch">
              <input type="checkbox" checked={noBackdrop} onChange={toggleNone} />
              <span>Без фона</span>
            </label>
            <span className="ap-hint">Наведите на фон, чтобы увидеть движение</span>
          </div>
          <div className={`ap-body ${noBackdrop ? 'dimmed' : ''}`}>
            {GROUPS.map(g => (
              <React.Fragment key={g.id}>
                <div className="ap-label">{g.label}</div>
                <div className="ap-grid">{BACKDROPS.filter(b => b.group === g.id).map(card)}</div>
              </React.Fragment>
            ))}
            <button type="button" className="ap-more" aria-expanded={classicOpen} onClick={() => setClassicOpen(o => !o)}>
              <span>Классические фоны · {CLASSIC_COUNT}</span>
              <span aria-hidden="true">{classicOpen ? '▴' : '▾'}</span>
            </button>
            {classicOpen && <div className="ap-grid">{BACKDROPS.filter(b => b.group === 'classic').map(card)}</div>}
          </div>
          <label className="ap-foot">
            <span>Яркость фона</span>
            <input type="range" min="15" max="100" value={Math.round(reliefOpacity * 100)} onChange={(e) => onOpacity(parseInt(e.target.value, 10))} />
            <span className="tabular ap-value">{Math.round(reliefOpacity * 100)}%</span>
          </label>
        </>
      )}
    </div>
  );
};
