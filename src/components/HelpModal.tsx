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
    title: 'Советы по живому дашборду и фарму',
    tips: [
      {
        icon: <Zap size={16} className="text-[#73bba5]" />,
        title: 'Streamless-протокол фарма',
        description: 'Sentinel взаимодействует с серверами Twitch напрямую через легковесный WebSocket без скачивания видеопотока. Нагрузка на GPU и процессор составляет 0%, экономится до 2.5 ГБ трафика в час.',
        badge: '0% GPU'
      },
      {
        icon: <Radio size={16} className="text-emerald-400" />,
        title: 'Сторож стримеров (Streamer Watchdog)',
        description: 'Если стример завершил эфир, выключил дропы или прогресс перестал начисляться, Sentinel автоматически переключится на следующего активного стримера в течение нескольких секунд.',
        badge: 'Авто-ротация'
      },
      {
        icon: <Sparkles size={16} className="text-amber-400" />,
        title: 'Принудительный фокус на игре',
        description: 'Хотите забрать дроп конкретной игры вне очереди? Используйте выпадающий список «Выбрать игру для фарма ▾» в блоке ручного фокуса. После завершения сбора Sentinel сам вернется к обычной очереди.',
        badge: 'Вне очереди'
      },
      {
        icon: <Coins size={16} className="text-amber-300" />,
        title: 'Автосбор сундуков баллов канала',
        description: 'Sentinel автоматически собирает сундуки с бонусными баллами канала (+50 баллов) на стримах, увеличивая ваш баланс без необходимости держать вкладку браузера открытой.',
        badge: '+50 очков'
      }
    ]
  },
  shelf: {
    label: 'Полка Игр',
    icon: <Gamepad2 size={15} />,
    title: 'Советы по управлению библиотекой и очередью',
    tips: [
      {
        icon: <Layers size={16} className="text-[#73bba5]" />,
        title: 'Строгий приоритет очереди (#1, #2, #3)',
        description: 'Sentinel всегда фармит игры строго сверху вниз. Вы можете менять порядок приоритета в 1 клик с помощью стрелок «Вверх / Вниз» на карточке игры.',
        badge: 'Топ-приоритет'
      },
      {
        icon: <FolderSync size={16} className="text-sky-400" />,
        title: 'Автопоиск установленных игр на ПК',
        description: 'Сканер проверяет библиотеки Steam, Epic Games, GOG и пользовательские папки. Игры, найденные на вашем компьютере, автоматически отмечаются значком «Установлено на ПК».',
        badge: 'Авто-сканер'
      },
      {
        icon: <ShieldCheck size={16} className="text-rose-400" />,
        title: 'Исключения и скрытие лишних кампаний',
        description: 'Если вы не хотите фармить определенную игру, нажмите «В исключения» на карточке. Игра переместится во вкладку исключений и не будет забивать рабочую очередь.',
        badge: 'Черный список'
      },
      {
        icon: <Gift size={16} className="text-lime-400" />,
        title: 'Вкладка «🏆 Собрано» и журнал Trophies.md',
        description: 'Все полностью полученные кампании сохраняются во вкладку «Собрано» с точным временем сбора и дублируются в локальный файл Trophies.md в корне программы.',
        badge: 'Архив трофеев'
      }
    ]
  },
  giveaways: {
    label: 'Раздачи',
    icon: <Gift size={15} />,
    title: 'Советы по Синдикату бесплатных раздач',
    tips: [
      {
        icon: <KeyRound size={16} className="text-[#73bba5]" />,
        title: 'Авторизация в магазинах в 1 клик',
        description: 'Нажмите «🔑 Войти в аккаунт» на карточке любого магазина. Откроется окно встроенного защищенного браузера Chromium — выполните вход один раз, и сессия сохранится навсегда.',
        badge: 'Единый профиль'
      },
      {
        icon: <Clock size={16} className="text-cyan-400" />,
        title: 'Умный мгновенный префлайт (<500 мс)',
        description: 'Перед запуском тяжелого браузера для GOG и Steam сборщик мгновенно опрашивает открытые витрины. Если 100% бесплатных игр сейчас нет, он моментально завершает шаг без нагрузки на ПК.',
        badge: 'Быстрый опрос'
      },
      {
        icon: <Store size={16} className="text-purple-400" />,
        title: 'Бесплатные ассеты Fab и Unity Store',
        description: 'Помимо классических игр Epic Games Store, Sentinel автоматически забирает временные бесплатные паки для Unreal Engine (Fab) и Unity Asset Store прямо на ваш аккаунт разработчика.',
        badge: 'UE & Unity'
      },
      {
        icon: <ShieldCheck size={16} className="text-emerald-400" />,
        title: 'Фоновый стелс-режим',
        description: 'Сборщик работает в тихом фоновом режиме на базе движка Patchright. Он не перехватывает фокус мыши и клавиатуры, позволяя спокойно работать или играть во время сбора.',
        badge: 'Стелс-сбор'
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
        title: 'Яркость дисплеев',
        description: 'Выберите монитор и меняйте яркость его подсветки. Для дисплеев без аппаратной поддержки будут доступны только программные режимы.',
        badge: 'По мониторам'
      },
      {
        icon: <ShieldCheck size={16} className="text-violet-400" />,
        title: 'Профили и исходная яркость',
        description: 'Сохраните базовый уровень яркости перед изменением, чтобы вернуть дисплей к сохраненному значению.',
        badge: 'Восстановление'
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
        title: 'Аппаратный страж гейминга (Hardware Guard)',
        description: 'При запуске любой из 138 поддерживаемых компьютерных игр Sentinel мгновенно ставит сбор на паузу, освобождая 100% ресурсов видеокарты и процессора для максимального FPS.',
        badge: 'Максимальный FPS'
      },
      {
        icon: <Clock size={16} className="text-amber-400" />,
        title: 'Автовыключение ПК (Luna Auto-Shutdown)',
        description: 'Включите таймер выключения или сна: Sentinel завершит фарм текущих дропов в очереди, безопасно сохранит журнал наград и выключит компьютер или отправит его в сон.',
        badge: 'Эко-таймер'
      },
      {
        icon: <RefreshCw size={16} className="text-[#73bba5]" />,
        title: 'Автообновление в 1 клик через GitHub',
        description: 'Sentinel проверяет официальные релизы с GitHub. При выходе новой версии вы можете обновить программу прямо из приложения с сохранением всех куков, настроек и журнала.',
        badge: 'Zero-Data-Loss'
      },
      {
        icon: <Lightbulb size={16} className="text-blue-400" />,
        title: 'Диагностический отчет для поддержки',
        description: 'Если что-то работает не так, кнопка «Скопировать отчет» в настройках сформирует обезличенную техническую сводку (без секретных токенов и паролей) для быстрой диагностики.',
        badge: 'Безопасный лог'
      }
    ]
  }
};

const HOTKEYS_LIST = [
  { key: '1, 2, 3, 4, 5', label: 'Переключение вкладок', desc: 'Открывает соответствующую вкладку приложения' },
  { key: 'Ctrl + K', label: 'Палитра команд', desc: 'Открывает быстрый переход и поиск по играм' },
  { key: 'Ctrl + M', label: 'Режим PiP', desc: 'Переключает компактный режим окна' },
  { key: 'Alt + Backspace', label: 'Сброс ручного фокуса', desc: 'Возвращает фарм из выбранной вручную игры к обычной очереди' },
  { key: 'Alt + Shift + Backspace', label: 'Восстановить яркость', desc: 'Возвращает сохраненную базовую яркость дисплеев' },
  { key: 'F5', label: 'Обновить состояние', desc: 'Принудительная проверка кампаний на Twitch и синхронизация' },
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
        className="w-full max-w-3xl bg-[#171d1c] border border-[#303a35] rounded-2xl shadow-2xl flex flex-col max-h-[88vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header - shrink-0 ensures it stays intact */}
        <div className="p-3.5 px-5 border-b border-[#303a35] bg-[#202725] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#368873]/20 border border-[#73bba5]/40 text-[#73bba5] flex items-center justify-center shrink-0 shadow-sm">
              <CircleHelp size={18} />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <span>База Знаний & Горячие Клавиши</span>
                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30 font-bold">
                  Sentinel Guide
                </span>
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
        <div className="p-2 px-4 bg-[#171d1c] border-b border-[#303a35] flex items-center gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
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
        <div className="p-3.5 md:p-4 overflow-y-auto space-y-3 scrollbar-thin flex-1 min-h-0">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {TAB_TIPS[selectedCategory].tips.map((tip, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#202725] border border-[#303a35] hover:border-[#73bba5]/35 transition-all flex flex-col justify-between gap-1.5 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1 rounded-lg bg-black/40 border border-white/5 shrink-0 text-[#73bba5]">
                          {tip.icon}
                        </div>
                        <span className="text-xs font-bold text-white truncate min-w-0" title={tip.title}>
                          {tip.title}
                        </span>
                      </div>
                      {tip.badge && (
                        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30 font-semibold shrink-0">
                          {tip.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8b9a94] leading-relaxed pl-7">
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
                <span className="text-[10.5px] font-semibold text-[#8b9a94]">
                  Windows Native
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {HOTKEYS_LIST.map((hk, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 px-3 rounded-xl bg-[#202725] border border-[#303a35] flex items-center justify-between gap-2 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{hk.label}</div>
                      <div className="text-[10px] text-[#8b9a94] mt-0.5 truncate">{hk.desc}</div>
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
          <div className="mt-2 p-2.5 px-3 rounded-xl bg-gradient-to-r from-[#202725] to-[#1a2320] border border-[#368873]/30 flex items-start gap-2.5 shrink-0">
            <ShieldCheck size={16} className="text-[#73bba5] shrink-0 mt-0.5" />
            <div className="text-[10.5px] text-[#8b9a94] leading-relaxed">
              <strong className="text-white inline mr-1">Принцип автономности и безопасности Sentinel:</strong>
              Все пароли, сессии и авторизационные токены хранятся исключительно в локальных файлах на вашем компьютере. Никаких внешних серверов, аналитики или облачных баз данных.
            </div>
          </div>
        </div>

        {/* Modal Footer - shrink-0 ensures it is ALWAYS 100% visible */}
        <div className="p-3 px-5 border-t border-[#303a35] bg-[#202725] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-[#8b9a94] flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[9.5px] font-mono text-white">Esc</kbd>
            <span>для закрытия</span>
          </div>

          <button
            onClick={() => {
              playClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-md"
          >
            <Check size={13} />
            <span>Всё понятно</span>
          </button>
        </div>
      </div>
    </div>
  );
};
