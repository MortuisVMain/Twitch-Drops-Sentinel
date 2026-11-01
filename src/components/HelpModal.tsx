import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  Sparkles, 
  Keyboard, 
  LayoutDashboard, 
  Gamepad2, 
  Monitor,
  Gift, 
  SlidersHorizontal,
  Zap,
  ShieldCheck,
  Radio,
  Coins,
  RefreshCw,
  FolderSync,
  Clock,
  KeyRound,
  Store,
  Layers,
  CircleHelp,
  Lightbulb
} from 'lucide-react';
import { NavTab } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: NavTab;
}

type HelpCategory = 'dashboard' | 'shelf' | 'giveaways' | 'dimmer' | 'settings' | 'hotkeys';

interface TipItem {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

const TAB_TIPS: Record<Exclude<HelpCategory, 'hotkeys'>, { label: string; icon: React.ReactNode; title: string; tips: TipItem[] }> = {
  dashboard: {
    label: 'Дашборд',
    icon: <LayoutDashboard size={15} />,
    title: 'Советы по дашборду и фарму',
    tips: [
      {
        icon: <Zap size={16} className="text-[#73bba5]" />,
        title: 'Фарм без видео',
        description: 'Sentinel общается с серверами Twitch напрямую, не скачивая видеопоток. Видеокарта не нагружается, а трафик экономится: до 2,5 ГБ в час.',
        badge: '0% GPU'
      },
      {
        icon: <Radio size={16} className="text-emerald-400" />,
        title: 'Замена зависшего стрима',
        description: 'Если стример закончил эфир, выключил дропы или минуты перестали идти, Sentinel сам перейдёт на другого стримера. Включается в Настройках: «Менять зависший стрим».',
        badge: 'Автозамена'
      },
      {
        icon: <Sparkles size={16} className="text-amber-400" />,
        title: 'Принудительный фокус на игре',
        description: 'Хотите забрать дроп конкретной игры вне очереди? Используйте выпадающий список «Выбрать игру для фарма ▾» в блоке ручного фокуса. После завершения сбора Sentinel сам вернется к обычной очереди.',
        badge: 'Вне очереди'
      },
      {
        icon: <Coins size={16} className="text-amber-300" />,
        title: 'Бонусные баллы канала',
        description: 'Sentinel сам нажимает на сундуки с баллами на стримах (+50 за каждый), и вкладку браузера держать открытой не нужно. Включается в Настройках: «Собирать бонусные баллы канала».',
        badge: '+50 очков'
      }
    ]
  },
  shelf: {
    label: 'Полка игр',
    icon: <Gamepad2 size={15} />,
    title: 'Советы по управлению библиотекой и очередью',
    tips: [
      {
        icon: <Layers size={16} className="text-[#73bba5]" />,
        title: 'Очередь по порядку (#1, #2, #3)',
        description: 'Sentinel фармит игры из очереди строго сверху вниз. Порядок меняется стрелками ▲ ▼ на карточке игры. Вкладка «Активные кампании» показывает только то, что идёт прямо сейчас, новые кампании с меткой «НОВАЯ» стоят первыми.',
        badge: 'Порядок'
      },
      {
        icon: <FolderSync size={16} className="text-sky-400" />,
        title: 'Автопоиск установленных игр на ПК',
        description: 'Сканер проверяет библиотеки Steam, Epic Games, GOG и пользовательские папки. Игры, найденные на вашем компьютере, автоматически отмечаются значком «Установлено на ПК».',
        badge: 'Авто-сканер'
      },
      {
        icon: <ShieldCheck size={16} className="text-rose-400" />,
        title: 'Исключения и скрытие лишних игр',
        description: 'Не хотите фармить игру — нажмите «Исключить» на карточке. Она уйдёт в список «Исключения»; он и список «Удалённые» открываются в меню ⋯ справа от поиска.',
        badge: 'Исключения'
      },
      {
        icon: <Gift size={16} className="text-lime-400" />,
        title: 'Вкладка «Собрано» и журнал Trophies.md',
        description: 'Полученные награды попадают во вкладку «Собрано» с точным временем и записываются в файл Trophies.md рядом с программой. Блок «Трофеи» на других вкладках свёрнут в одну строку.',
        badge: 'Трофеи'
      }
    ]
  },
  giveaways: {
    label: 'Раздачи',
    icon: <Gift size={15} />,
    title: 'Советы по бесплатным раздачам',
    tips: [
      {
        icon: <KeyRound size={16} className="text-[#73bba5]" />,
        title: 'Вход в магазины в один клик',
        description: 'Нажмите «🔑 Войти в аккаунт» на карточке магазина. Откроется окно браузера: войдите один раз, и сессия сохранится. Сменить аккаунт можно кнопкой ⇄ на карточке.',
        badge: 'Один раз'
      },
      {
        icon: <Clock size={16} className="text-cyan-400" />,
        title: 'Быстрая проверка перед запуском',
        description: 'Перед тяжёлым браузером для GOG и Steam сборщик быстро смотрит витрины. Если бесплатных игр сейчас нет, шаг завершается сразу и ПК не нагружается.',
        badge: 'Быстро'
      },
      {
        icon: <Store size={16} className="text-purple-400" />,
        title: 'Бесплатные ассеты Fab и Unity Store',
        description: 'Помимо классических игр Epic Games Store, Sentinel автоматически забирает временные бесплатные паки для Unreal Engine (Fab) и Unity Asset Store прямо на ваш аккаунт разработчика.',
        badge: 'UE & Unity'
      },
      {
        icon: <ShieldCheck size={16} className="text-emerald-400" />,
        title: 'Фоновый режим',
        description: 'Кнопка «Фоновый режим» скрывает окно браузера: сборщик работает тихо и не перехватывает мышь и клавиатуру, можно спокойно работать или играть.',
        badge: 'Без окна'
      }
    ]
  },
  dimmer: {
    label: 'Диммер',
    icon: <Monitor size={15} />,
    title: 'Управление яркостью и экранами',
    tips: [
      {
        icon: <SlidersHorizontal size={16} className="text-[#73bba5]" />,
        title: 'Одна карточка на монитор',
        description: 'У каждого монитора свой ползунок, своя база и кнопка «Затемнить только этот». Если монитор не принимает команды яркости, доступно только программное затемнение.',
        badge: 'По мониторам'
      },
      {
        icon: <ShieldCheck size={16} className="text-violet-400" />,
        title: 'База яркости',
        description: 'Нажмите «Запомнить как базу», а потом меняйте яркость как угодно: «Вернуть к базе» (или Alt+Shift+Backspace) вернёт сохранённый уровень, даже из игры.',
        badge: 'Возврат'
      }
    ]
  },
  settings: {
    label: 'Настройки',
    icon: <SlidersHorizontal size={15} />,
    title: 'Советы по настройкам и защите ПК',
    tips: [
      {
        icon: <ShieldCheck size={16} className="text-violet-400" />,
        title: 'Пауза, когда вы играете',
        description: 'Как только Sentinel замечает запущенную игру, он ставит фарм на паузу и не отнимает ресурсы у видеокарты и процессора. Закрыли игру — фарм продолжится.',
        badge: 'Больше FPS'
      },
      {
        icon: <Clock size={16} className="text-amber-400" />,
        title: 'Выключить или усыпить ПК после очереди',
        description: 'Когда все дропы очереди получены, Sentinel за 60 секунд предупредит и выполнит выбранное действие: сон, выключение или блокировка. Кнопка «Проверить таймер» только показывает отсчёт, ПК не трогает.',
        badge: 'После очереди'
      },
      {
        icon: <RefreshCw size={16} className="text-[#73bba5]" />,
        title: 'Автообновление в 1 клик через GitHub',
        description: 'Sentinel проверяет релизы на GitHub. Когда выходит новая версия, её можно поставить прямо из приложения: вход, настройки и журнал сохранятся.',
        badge: 'Данные целы'
      },
      {
        icon: <Lightbulb size={16} className="text-blue-400" />,
        title: 'Диагностический отчет для поддержки',
        description: 'Если что-то работает не так, кнопка «Отчет» внизу Настроек соберёт техническую сводку без паролей и токенов — её можно отправить на разбор.',
        badge: 'Без секретов'
      }
    ]
  }
};

const HOTKEYS_LIST = [
  { key: '1, 2, 3, 4, 5', label: 'Переключение вкладок', desc: 'Открывает соответствующую вкладку приложения' },
  { key: 'Ctrl + K', label: 'Палитра команд', desc: 'Открывает быстрый переход и поиск по играм' },
  { key: 'Ctrl + M', label: 'Режим PiP', desc: 'Переключает компактный режим окна' },
  { key: 'Alt + Backspace', label: 'Сброс ручного фокуса', desc: 'Возвращает фарм из выбранной вручную игры к обычной очереди. На вкладке «Диммер» — блэкаут экранов' },
  { key: 'Alt + Shift + Backspace', label: 'Восстановить яркость', desc: 'Возвращает сохраненную базовую яркость дисплеев' },
  { key: 'F5', label: 'Обновить данные', desc: 'Заново запрашивает кампании у Twitch' },
  { key: 'Esc', label: 'Закрыть модальное окно', desc: 'Мгновенное закрытие справки, каталога или окна обновления' },
  { key: 'Клик по иконке трея', label: 'Свернуть / Развернуть', desc: 'Прячет Sentinel в системный трей Windows для тихой работы в фоне' },
  { key: 'Двойной клик по шапке', label: 'Оконный режим', desc: 'Переключение между полноэкранным и стандартным размером окна' },
  { key: 'Колесико мыши', label: 'Лог консоли', desc: 'Скролл ленты реального времени в терминале активности' },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, activeTab = 'dashboard' }) => {
  const { playClick } = useTactileAudio();
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('dashboard');

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'giveaways') setSelectedCategory('giveaways');
      else if (activeTab === 'shelf') setSelectedCategory('shelf');
      else if (activeTab === 'dimmer') setSelectedCategory('dimmer');
      else if (activeTab === 'settings') setSelectedCategory('settings');
      else setSelectedCategory('dashboard');
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#0c100f]/75 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-[min(920px,92vw)] bg-[#171d1c] border border-[#303a35] rounded-2xl shadow-2xl flex flex-col max-h-[88vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header - shrink-0 ensures it stays intact */}
        <div className="py-4 px-6 border-b border-[#303a35] bg-[#202725] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#368873]/20 border border-[#73bba5]/40 text-[#73bba5] flex items-center justify-center shrink-0 shadow-sm">
              <CircleHelp size={18} />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white">
                Справка и горячие клавиши
              </h2>
              <p className="text-[11px] text-[#8b9a94] mt-0.5">
                Практические советы, правила работы и быстрые сочетания клавиш
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClick();
              onClose();
            }}
            aria-label="Закрыть"
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#8b9a94] hover:text-white transition-all cursor-pointer active:scale-95 border border-white/5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Categories Tab Navigation Strip - shrink-0 */}
        <div className="py-2 px-6 bg-[#171d1c] border-b border-[#303a35] flex items-center gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
          {(Object.keys(TAB_TIPS) as Array<Exclude<HelpCategory, 'hotkeys'>>).map((catKey) => {
            const cat = TAB_TIPS[catKey];
            const isCurrentActiveTab = activeTab === catKey;
            const isSelected = selectedCategory === catKey;

            return (
              <button
                key={catKey}
                onClick={() => {
                  playClick();
                  setSelectedCategory(catKey);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 select-none ${
                  isSelected
                    ? 'bg-[#368873]/25 text-[#73bba5] border border-[#73bba5]/40 shadow-sm'
                    : 'text-[#8b9a94] hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                {isCurrentActiveTab && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3AD29F] animate-pulse" title="Текущая открытая вкладка" />
                )}
              </button>
            );
          })}

          <button
            onClick={() => {
              playClick();
              setSelectedCategory('hotkeys');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 select-none ${
              selectedCategory === 'hotkeys'
                ? 'bg-[#368873]/25 text-[#73bba5] border border-[#73bba5]/40 shadow-sm'
                : 'text-[#8b9a94] hover:text-white hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Keyboard size={15} />
            <span>Клавиши</span>
          </button>
        </div>

        {/* Modal Scrollable Body - flex-1 min-h-0 ensures smooth scrolling without pushing footer offscreen */}
        <div className="py-4 px-6 overflow-y-auto space-y-3 scrollbar-thin flex-1 min-h-0">
          {selectedCategory !== 'hotkeys' ? (
            <>
              <div className="flex items-center justify-between pb-0.5">
                <span className="text-[11px] font-bold text-[#8b9a94] uppercase tracking-wider font-mono">
                  {TAB_TIPS[selectedCategory].title}
                </span>
                {activeTab === selectedCategory && (
                  <span className="text-[10.5px] font-semibold text-[#73bba5] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Активная вкладка
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TAB_TIPS[selectedCategory].tips.map((tip, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#202725] border border-[#303a35] hover:border-[#73bba5]/35 transition-all flex flex-col justify-between gap-2 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="p-1 rounded-lg bg-black/40 border border-white/5 shrink-0 text-[#73bba5]">
                          {tip.icon}
                        </div>
                        <span className="text-xs font-bold text-white leading-snug min-w-0 break-words" title={tip.title}>
                          {tip.title}
                        </span>
                      </div>
                      {tip.badge && (
                        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30 font-semibold shrink-0">
                          {tip.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8b9a94] leading-relaxed pl-8">
                      {tip.description}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between pb-0.5">
                <span className="text-[11px] font-bold text-[#8b9a94] uppercase tracking-wider font-mono">
                  Быстрые клавиши и управление
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {HOTKEYS_LIST.map((hk, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 px-3 rounded-xl bg-[#202725] border border-[#303a35] flex items-center justify-between gap-2 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white leading-snug break-words">{hk.label}</div>
                      <div className="text-[10px] text-[#8b9a94] mt-0.5 leading-snug break-words">{hk.desc}</div>
                    </div>
                    <kbd className="px-2 py-0.5 rounded-md bg-black/60 border border-white/15 text-[11px] font-mono font-bold text-[#73bba5] shadow-inner shrink-0 select-none">
                      {hk.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Bottom Security / Architecture Note - Compact */}
          <div className="mt-2 p-3 px-4 rounded-xl bg-gradient-to-r from-[#202725] to-[#1a2320] border border-[#368873]/30 flex items-start gap-2.5 shrink-0">
            <ShieldCheck size={16} className="text-[#73bba5] shrink-0 mt-0.5" />
            <div className="text-[10.5px] text-[#8b9a94] leading-relaxed">
              <strong className="text-white inline mr-1">Принцип автономности и безопасности Sentinel:</strong>
              Все пароли, сессии и авторизационные токены хранятся исключительно в локальных файлах на вашем компьютере. Никаких внешних серверов, аналитики или облачных баз данных.
            </div>
          </div>
        </div>

        {/* Modal Footer - shrink-0 ensures it is ALWAYS 100% visible */}
        <div className="py-3 px-6 border-t border-[#303a35] bg-[#202725] flex items-center justify-between gap-4 shrink-0">
          <div className="text-[11px] text-[#8b9a94] flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[9.5px] font-mono text-white">Esc</kbd>
            <span>для закрытия</span>
          </div>

          <button
            onClick={() => {
              playClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-md shrink-0 whitespace-nowrap"
          >
            <Check size={13} />
            <span>Всё понятно</span>
          </button>
        </div>
      </div>
    </div>
  );
};
