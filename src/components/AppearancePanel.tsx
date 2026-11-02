import React, { useState } from 'react';
import { PHOTO_BACKDROPS, photoBackdropUrl } from './PhotoBackdrop';

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

type Category = 'photo' | 'motion' | 'pattern';

interface BackdropDef {
  type: string;
  mode: string;
  name: string;
  hint: string;
  cat: Category | 'none';
  /** image url, or a 2D pattern id rendered live with the same CSS as the backdrop */
  thumb?: string;
  pattern?: string;
}

const BACKDROPS: BackdropDef[] = [
  { type: 'smooth', mode: 'none', name: 'Без фона', hint: 'Ровная матовая поверхность', cat: 'none' },
  ...PHOTO_BACKDROPS.map((p): BackdropDef => ({ type: 'photo', mode: p.id, name: p.name, hint: p.sub, cat: 'photo', thumb: photoBackdropUrl(p.id, true) })),
  ...([
    ['hex-theme', 'Соты в цвете темы', 'Призмы, швы светятся акцентом'],
    ['hex-magma', 'Соты с магмой', 'Призмы и раскалённые швы'],
    ['tectonic-lava', 'Лавовые разломы', 'Трещины и искры'],
    ['topo-damascus', 'Дамасская сталь', 'Изолинии узора'],
    ['carbon-weave', 'Кованый карбон', 'Плетение с бликом'],
    ['pcb-3d', 'Чипы и шины', 'Плата с импульсами'],
    ['liquid-silk', 'Мягкие сферы', 'Плавающие пятна света'],
  ] as const).map(([mode, name, hint]): BackdropDef => ({ type: '3d', mode, name, hint, cat: 'motion', thumb: `backdrops/proc/${mode}.webp` })),
  ...([
    ['2d-honeycomb', 'Контур сот', 'Тонкая сетка шестигранников'],
    ['2d-lava', 'Контур лавы', 'Линии разломов'],
    ['2d-dots', 'Точки', 'Ровная точечная сетка'],
    ['2d-carbon', 'Диагональ', 'Плоский узор карбона'],
  ] as const).map(([type, name, hint]): BackdropDef => ({ type, mode: 'none', name, hint, cat: 'pattern', pattern: type })),
];

const FILTERS: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'photo', label: 'Фото' },
  { id: 'motion', label: 'Анимация' },
  { id: 'pattern', label: 'Узоры' },
];

/** 'apple-luna' was merged into 'liquid-silk'; saved settings with the old id keep working and show as selected. */
function isActive(b: BackdropDef, type: string, mode: string): boolean {
  if (b.type !== type) return false;
  if (b.type === '3d' || b.type === 'photo') return b.mode === mode || (b.mode === 'liquid-silk' && mode === 'apple-luna');
  return true;
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
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const shown = BACKDROPS.filter(b => filter === 'all' || b.cat === filter || b.cat === 'none');

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
          <div className="ap-chips">
            {FILTERS.map(f => (
              <button key={f.id} type="button" className={`ap-chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>{f.label}</button>
            ))}
          </div>
          <div className="ap-body">
            <div className="ap-grid">
              {shown.map(b => {
                const active = isActive(b, backdropType, reliefMode);
                return (
                  <button key={b.type + b.mode} type="button" title={b.hint} className={`ap-card ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => onBackdrop(b.type, b.mode, b.name)}>
                    {b.thumb ? <img className="ap-thumb" src={b.thumb} alt="" loading="lazy" />
                      : <span className="ap-thumb" data-bd={b.pattern} />}
                    <span className="ap-name">{b.name}</span>
                  </button>
                );
              })}
            </div>
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
