import os

svg_content = """<svg width="1440" height="900" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient (Exact Apple Luna 2.0: #171d1c) -->
    <linearGradient id="bg-grad-shelf" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#171d1c"/>
      <stop offset="100%" stop-color="#141918"/>
    </linearGradient>

    <!-- Ambient Sage Mint Glow -->
    <radialGradient id="orb-s1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#73bba5" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#73bba5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb-s2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#368873" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#368873" stop-opacity="0"/>
    </radialGradient>

    <!-- Poster Gradient -->
    <linearGradient id="poster-fade" x1="0" y1="0.4" x2="0" y2="1">
      <stop offset="0%" stop-color="#202725" stop-opacity="0"/>
      <stop offset="80%" stop-color="#202725" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#202725" stop-opacity="1"/>
    </linearGradient>

    <!-- Rocker Sage Mint Gradient -->
    <linearGradient id="rocker-sage" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#368873"/>
      <stop offset="100%" stop-color="#2d7462"/>
    </linearGradient>
  </defs>

  <style>
    .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', Consolas, monospace; }
  </style>

  <!-- Base Solid Background: #171d1c -->
  <rect width="1440" height="900" fill="url(#bg-grad-shelf)"/>

  <!-- LiquidCanvas Ambient Light Orbs -->
  <g id="LiquidCanvas-Orbs" pointer-events="none">
    <circle cx="280" cy="260" r="360" fill="url(#orb-s1)"/>
    <circle cx="1200" cy="560" r="440" fill="url(#orb-s2)"/>
  </g>

  <!-- ========================================================================= -->
  <!-- 1. TOP FIELD-HEADER                                                       -->
  <!-- ========================================================================= -->
  <g id="Top-Field-Header" transform="translate(24, 16)">
    <rect width="1392" height="52" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>

    <!-- Left Brand Badge -->
    <g transform="translate(16, 10)">
      <rect width="32" height="32" rx="8" fill="#28322e" stroke="#73bba5" stroke-opacity="0.5" stroke-width="1.2"/>
      <path d="M16 8L23 11.5V17C23 21 16 23.5 16 23.5C16 23.5 9 21 9 17V11.5L16 8Z" fill="#73bba5" fill-opacity="0.85"/>
      <path d="M13.5 16L15.5 18L19 14.5" stroke="#171d1c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="42" y="16" class="font-sans" font-size="12" font-weight="800" fill="#e9eeec" letter-spacing="0.04em">SENTINEL FIELD-DECK</text>
      <rect x="180" y="5" width="46" height="18" rx="6" fill="#28322e" stroke="#73bba5" stroke-opacity="0.4"/>
      <text x="203" y="17.5" class="font-mono" font-size="9" font-weight="700" fill="#73bba5" text-anchor="middle">v3.3.4</text>
      <text x="42" y="28" class="font-sans" font-size="8.5" font-weight="600" fill="#828f88" letter-spacing="0.06em">AUTONOMOUS TWITCH HARVESTER &amp; HARDWARE CONSOLE</text>
    </g>

    <!-- Center Navigation Tabs (Полка Игр Active) -->
    <g id="Nav-Tabs" transform="translate(340, 8)">
      <g transform="translate(0, 0)">
        <rect width="130" height="36" rx="8" fill="#1b2220"/>
        <text x="14" y="22" class="font-sans" font-size="13">📊</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#a1afa8">Дашборд</text>
        <rect x="94" y="10" width="26" height="15" rx="4" fill="#28322e"/>
        <text x="107" y="21" class="font-sans" font-size="8.5" font-weight="700" fill="#828f88" text-anchor="middle">LIVE</text>
      </g>

      <!-- Active: Полка Игр (128) -->
      <g transform="translate(138, 0)">
        <rect width="140" height="36" rx="8" fill="#28322e" stroke="#73bba5" stroke-opacity="0.5" stroke-width="1.2"/>
        <text x="14" y="22" class="font-sans" font-size="13">🎮</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="700" fill="#e9eeec">Полка Игр</text>
        <rect x="98" y="10" width="30" height="15" rx="4" fill="#368873" fill-opacity="0.25"/>
        <text x="113" y="21" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">128</text>
      </g>

      <g transform="translate(286, 0)">
        <rect width="134" height="36" rx="8" fill="#1b2220"/>
        <text x="14" y="22" class="font-sans" font-size="13">🎁</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#a1afa8">Раздачи</text>
        <rect x="90" y="10" width="34" height="15" rx="4" fill="#28322e"/>
        <text x="107" y="21" class="font-sans" font-size="8.5" font-weight="700" fill="#38bdf8" text-anchor="middle">FREE</text>
      </g>

      <g transform="translate(428, 0)">
        <rect width="130" height="36" rx="8" fill="#1b2220"/>
        <text x="14" y="22" class="font-sans" font-size="13">🖥</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#a1afa8">Диммер</text>
      </g>

      <g transform="translate(566, 0)">
        <rect width="116" height="36" rx="8" fill="#1b2220"/>
        <text x="14" y="22" class="font-sans" font-size="13">⚙</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#a1afa8">Настройки</text>
      </g>
    </g>

    <!-- Right Controls -->
    <g transform="translate(1080, 10)">
      <rect width="30" height="32" rx="6" fill="#28322e" stroke="#303a35" stroke-width="1"/>
      <text x="15" y="20" class="font-sans" font-size="11" font-weight="700" fill="#a1afa8" text-anchor="middle">ЖК</text>
      <g transform="translate(36, 0)">
        <rect width="36" height="32" rx="6" fill="#28322e" stroke="#303a35" stroke-width="1"/>
        <text x="18" y="20" class="font-sans" font-size="10" font-weight="700" fill="#a1afa8" text-anchor="middle">PIP</text>
      </g>
      <g transform="translate(78, 0)">
        <rect width="58" height="32" rx="6" fill="#28322e" stroke="#303a35" stroke-width="1"/>
        <text x="10" y="20" class="font-sans" font-size="11">🌙</text>
        <text x="34" y="20" class="font-sans" font-size="10.5" font-weight="700" fill="#a1afa8" text-anchor="middle">НОЧЬ</text>
      </g>
      <g transform="translate(142, 0)">
        <rect width="86" height="32" rx="6" fill="#28322e" stroke="#73bba5" stroke-opacity="0.4" stroke-width="1"/>
        <text x="10" y="20" class="font-sans" font-size="11">🎨</text>
        <text x="44" y="20" class="font-sans" font-size="10.5" font-weight="700" fill="#73bba5" text-anchor="middle">LUNA ▾</text>
      </g>
      <g transform="translate(236, 0)">
        <rect width="64" height="32" rx="16" fill="#1b2220" stroke="#73bba5" stroke-opacity="0.5"/>
        <circle cx="48" cy="16" r="10" fill="#73bba5"/>
        <text x="18" y="20" class="font-sans" font-size="9" font-weight="800" fill="#73bba5">FARM</text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 2. GAME SHELF TOOLBAR                                                     -->
  <!-- ========================================================================= -->
  <g id="Shelf-Toolbar" transform="translate(24, 82)">
    <rect width="1392" height="52" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>

    <!-- Filter Buttons with Counts -->
    <g transform="translate(16, 10)">
      <!-- 1. Гарантированные Drops (87) -->
      <rect width="168" height="32" rx="8" fill="#28322e" stroke="#73bba5" stroke-opacity="0.4"/>
      <text x="10" y="20" class="font-sans" font-size="11">🔥</text>
      <text x="26" y="20" class="font-sans" font-size="11" font-weight="700" fill="#e9eeec">Гарантированные Drops</text>
      <text x="156" y="20" class="font-mono" font-size="10" font-weight="700" fill="#73bba5" text-anchor="end">87</text>

      <!-- 2. В моем ТОПе (82) -->
      <g transform="translate(176, 0)">
        <rect width="128" height="32" rx="8" fill="#1b2220"/>
        <text x="10" y="20" class="font-sans" font-size="11">⭐</text>
        <text x="26" y="20" class="font-sans" font-size="11" font-weight="600" fill="#a1afa8">В моем ТОПе</text>
        <text x="118" y="20" class="font-mono" font-size="10" font-weight="600" fill="#828f88" text-anchor="end">82</text>
      </g>

      <!-- 3. Собрано (19) -->
      <g transform="translate(312, 0)">
        <rect width="112" height="32" rx="8" fill="#1b2220"/>
        <text x="10" y="20" class="font-sans" font-size="11">🏆</text>
        <text x="26" y="20" class="font-sans" font-size="11" font-weight="600" fill="#a1afa8">Собрано</text>
        <text x="102" y="20" class="font-mono" font-size="10" font-weight="600" fill="#828f88" text-anchor="end">19</text>
      </g>

      <!-- 4. Установлено на ПК (138) -->
      <g transform="translate(432, 0)">
        <rect width="158" height="32" rx="8" fill="#1b2220"/>
        <text x="10" y="20" class="font-sans" font-size="11">💾</text>
        <text x="26" y="20" class="font-sans" font-size="11" font-weight="600" fill="#a1afa8">Установлено на ПК</text>
        <text x="148" y="20" class="font-mono" font-size="10" font-weight="600" fill="#828f88" text-anchor="end">138</text>
      </g>

      <!-- 5. Исключения (61) -->
      <g transform="translate(598, 0)">
        <rect width="130" height="32" rx="8" fill="#1b2220"/>
        <text x="10" y="20" class="font-sans" font-size="11">🚫</text>
        <text x="26" y="20" class="font-sans" font-size="11" font-weight="600" fill="#a1afa8">Исключения</text>
        <text x="120" y="20" class="font-mono" font-size="10" font-weight="600" fill="#828f88" text-anchor="end">61</text>
      </g>

      <!-- 6. Удалённые (167) -->
      <g transform="translate(736, 0)">
        <rect width="124" height="32" rx="8" fill="#1b2220"/>
        <text x="10" y="20" class="font-sans" font-size="11">🗑️</text>
        <text x="26" y="20" class="font-sans" font-size="11" font-weight="600" fill="#a1afa8">Удалённые</text>
        <text x="114" y="20" class="font-mono" font-size="10" font-weight="600" fill="#828f88" text-anchor="end">167</text>
      </g>
    </g>

    <!-- Search Input on Right -->
    <g transform="translate(970, 10)">
      <rect width="250" height="32" rx="8" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
      <text x="12" y="20" class="font-sans" font-size="12" fill="#828f88">🔍</text>
      <text x="30" y="20" class="font-sans" font-size="11" font-weight="400" fill="#828f88">Быстрый поиск игры...</text>
    </g>

    <!-- Sync Drops Button -->
    <g transform="translate(1232, 10)">
      <rect width="144" height="32" rx="8" fill="#28322e" stroke="#73bba5" stroke-opacity="0.4" stroke-width="1"/>
      <text x="12" y="20" class="font-sans" font-size="11" fill="#73bba5">🔄</text>
      <text x="28" y="20" class="font-sans" font-size="11" font-weight="700" fill="#73bba5">Синхронизировать Drops</text>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 3. GAME CARTRIDGE CARDS GRID (3:4 Ratio Vertical Posters in #202725)      -->
  <!-- ========================================================================= -->
  <g id="Shelf-Cards-Grid" transform="translate(24, 150)">

    <!-- CARD 1: Hunt: Showdown 1896 (✓ Привязан) -->
    <g transform="translate(0, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">🤠</text>

      <!-- Emerald Linked Badge -->
      <g transform="translate(132, 12)">
        <rect width="72" height="20" rx="10" fill="#1b2b25" stroke="#368873" stroke-width="1"/>
        <text x="36" y="14" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">✓ Привязан</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">Hunt: Showdown 1896</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#e5a93c">★ #1 в ТОПе  •  2 наград</text>

      <!-- 3-Position Physical Rocker: СТАНДАРТ | В ТОПЕ | СЕЙЧАС #1 -->
      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        
        <!-- Active: В ТОПЕ -->
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>

    <!-- CARD 2: AION 2 -->
    <g transform="translate(236, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">⚔️</text>

      <g transform="translate(132, 12)">
        <rect width="72" height="20" rx="10" fill="#1b2b25" stroke="#368873" stroke-width="1"/>
        <text x="36" y="14" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">✓ Привязан</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">AION 2</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#e5a93c">★ #4 в ТОПе  •  1 наград</text>

      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>

    <!-- CARD 3: Rust -->
    <g transform="translate(472, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">⛺</text>

      <g transform="translate(132, 12)">
        <rect width="72" height="20" rx="10" fill="#1b2b25" stroke="#368873" stroke-width="1"/>
        <text x="36" y="14" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">✓ Привязан</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">Rust</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#73bba5">● Дропы активны  •  5 наград</text>

      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>

    <!-- CARD 4: Cyberpunk 2077 -->
    <g transform="translate(708, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">🌆</text>

      <g transform="translate(132, 12)">
        <rect width="72" height="20" rx="10" fill="#1b2b25" stroke="#368873" stroke-width="1"/>
        <text x="36" y="14" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">✓ Привязан</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">Cyberpunk 2077</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#e5a93c">★ #2 в ТОПе  •  2 наград</text>

      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>

    <!-- CARD 5: Delta Force -->
    <g transform="translate(944, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">🪖</text>

      <!-- Yellow Amber Badge: Требуется привязка -->
      <g transform="translate(100, 12)">
        <rect width="104" height="20" rx="10" fill="#3b2d18" stroke="#e5a93c" stroke-opacity="0.6"/>
        <text x="52" y="14" class="font-sans" font-size="8.5" font-weight="800" fill="#fde68a" text-anchor="middle">▲ Требуется привязка</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">Delta Force</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#73bba5">● Дропы активны  •  1 наград</text>

      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>

    <!-- CARD 6: World of Warcraft -->
    <g transform="translate(1180, 0)">
      <rect width="216" height="340" rx="12" fill="#202725" stroke="#303a35" stroke-width="1"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="#28322e"/>
      <rect x="6" y="6" width="204" height="236" rx="8" fill="url(#poster-fade)"/>
      <text x="108" y="120" class="font-sans" font-size="36" text-anchor="middle">🐉</text>

      <g transform="translate(132, 12)">
        <rect width="72" height="20" rx="10" fill="#1b2b25" stroke="#368873" stroke-width="1"/>
        <text x="36" y="14" class="font-sans" font-size="9" font-weight="800" fill="#73bba5" text-anchor="middle">✓ Привязан</text>
      </g>

      <text x="14" y="260" class="font-sans" font-size="13" font-weight="800" fill="#e9eeec">World of Warcraft</text>
      <text x="14" y="278" class="font-sans" font-size="10.5" font-weight="600" fill="#73bba5">● Дропы активны  •  3 наград</text>

      <g transform="translate(10, 294)">
        <rect width="196" height="28" rx="6" fill="#1b2220" stroke="#303a35" stroke-width="1"/>
        <text x="32" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СТАНДАРТ</text>
        <g transform="translate(65, 2)">
          <rect width="66" height="24" rx="4" fill="url(#rocker-sage)" stroke="#73bba5" stroke-opacity="0.5"/>
          <text x="33" y="16" class="font-sans" font-size="9" font-weight="800" fill="#e9eeec" text-anchor="middle">В ТОПЕ</text>
        </g>
        <text x="164" y="18" class="font-sans" font-size="9" font-weight="600" fill="#828f88" text-anchor="middle">СЕЙЧАС #1</text>
      </g>
    </g>
  </g>
</svg>"""

out_svg = r"C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3\figma_gameshelf_apple_luna_exact.svg"
with open(out_svg, "w", encoding="utf-8") as f:
    f.write(svg_content)
print(f"Created exact Apple Luna GameShelf SVG: {out_svg} ({len(svg_content)} bytes)")
