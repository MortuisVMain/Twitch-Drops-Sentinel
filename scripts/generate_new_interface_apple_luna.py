import os

svg_content = """<svg width="1440" height="900" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient (Apple Luna 2.0 Base from user screenshots) -->
    <linearGradient id="bg-grad" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0B0E14"/>
      <stop offset="100%" stop-color="#07090D"/>
    </linearGradient>

    <!-- LiquidCanvas Floating Mint Ambient Orbs -->
    <radialGradient id="orb-mint-1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2DD4BF" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#2DD4BF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb-mint-2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#14B8A6" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#14B8A6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb-mint-3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5EEAD4" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#5EEAD4" stop-opacity="0"/>
    </radialGradient>

    <!-- Card Backgrounds -->
    <linearGradient id="card-surface" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141824"/>
      <stop offset="100%" stop-color="#11141F"/>
    </linearGradient>
    <linearGradient id="card-inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#181D2B"/>
      <stop offset="100%" stop-color="#131722"/>
    </linearGradient>

    <!-- Radial Chrono Dial Gradient -->
    <linearGradient id="chrono-mint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5EEAD4"/>
      <stop offset="100%" stop-color="#2DD4BF"/>
    </linearGradient>

    <!-- Button Gradient -->
    <linearGradient id="btn-mint-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5EEAD4"/>
      <stop offset="100%" stop-color="#2DD4BF"/>
    </linearGradient>
  </defs>

  <style>
    .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>

  <!-- Base Solid Background -->
  <rect width="1440" height="900" fill="url(#bg-grad)"/>

  <!-- LiquidCanvas Floating Ambient Orbs (Apple Luna Standard) -->
  <g id="LiquidCanvas-Orbs" pointer-events="none">
    <circle cx="260" cy="240" r="340" fill="url(#orb-mint-1)"/>
    <circle cx="1180" cy="520" r="420" fill="url(#orb-mint-2)"/>
    <circle cx="720" cy="780" r="280" fill="url(#orb-mint-3)"/>
  </g>

  <!-- ========================================================================= -->
  <!-- 1. TOP FIELD-HEADER (NEW INTERFACE HEADER IN APPLE LUNA COLORS)           -->
  <!-- ========================================================================= -->
  <g id="Top-Field-Header" transform="translate(24, 16)">
    <!-- Header Surface Bar -->
    <rect width="1392" height="52" rx="12" fill="#111520" stroke="#FFFFFF" stroke-opacity="0.06"/>

    <!-- Left Brand Badge: Shield + Title -->
    <g transform="translate(16, 10)">
      <!-- Shield Icon -->
      <rect width="32" height="32" rx="8" fill="#181E2C" stroke="#2DD4BF" stroke-opacity="0.5" stroke-width="1.2"/>
      <path d="M16 8L23 11.5V17C23 21 16 23.5 16 23.5C16 23.5 9 21 9 17V11.5L16 8Z" fill="#2DD4BF" fill-opacity="0.85"/>
      <path d="M13.5 16L15.5 18L19 14.5" stroke="#0B0E14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- Brand Text -->
      <text x="42" y="16" class="font-sans" font-size="12" font-weight="800" fill="#FFFFFF" letter-spacing="0.04em">SENTINEL FIELD-DECK</text>
      <!-- Version Pill (Apple Luna Style) -->
      <rect x="180" y="5" width="46" height="18" rx="6" fill="#181E2C" stroke="#2DD4BF" stroke-opacity="0.3"/>
      <text x="203" y="17.5" class="font-mono" font-size="9" font-weight="700" fill="#2DD4BF" text-anchor="middle">v3.3.4</text>
      <!-- Subtitle -->
      <text x="42" y="28" class="font-sans" font-size="8.5" font-weight="600" fill="#6B7280" letter-spacing="0.06em">AUTONOMOUS TWITCH HARVESTER &amp; HARDWARE CONSOLE</text>
    </g>

    <!-- Center Navigation Tabs -->
    <g id="Nav-Tabs" transform="translate(340, 8)">
      <!-- Tab 1: Дашборд LIVE (Active) -->
      <g transform="translate(0, 0)">
        <rect width="130" height="36" rx="8" fill="#1A2130" stroke="#2DD4BF" stroke-opacity="0.4" stroke-width="1.2"/>
        <text x="14" y="22" class="font-sans" font-size="13">📊</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="700" fill="#FFFFFF">Дашборд</text>
        <rect x="94" y="10" width="26" height="15" rx="4" fill="#2DD4BF" fill-opacity="0.2"/>
        <text x="107" y="21" class="font-sans" font-size="8.5" font-weight="800" fill="#2DD4BF" text-anchor="middle">LIVE</text>
      </g>

      <!-- Tab 2: Полка Игр (128) -->
      <g transform="translate(138, 0)">
        <rect width="140" height="36" rx="8" fill="#131722"/>
        <text x="14" y="22" class="font-sans" font-size="13">🎮</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#9CA3AF">Полка Игр</text>
        <rect x="98" y="10" width="30" height="15" rx="4" fill="#1B2230"/>
        <text x="113" y="21" class="font-sans" font-size="9" font-weight="600" fill="#6B7280" text-anchor="middle">128</text>
      </g>

      <!-- Tab 3: Раздачи (3 STORES) -->
      <g transform="translate(286, 0)">
        <rect width="134" height="36" rx="8" fill="#131722"/>
        <text x="14" y="22" class="font-sans" font-size="13">🎁</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#9CA3AF">Раздачи</text>
        <rect x="90" y="10" width="34" height="15" rx="4" fill="#1B2230"/>
        <text x="107" y="21" class="font-sans" font-size="8.5" font-weight="700" fill="#38BDF8" text-anchor="middle">FREE</text>
      </g>

      <!-- Tab 4: Диммер DDC/CI -->
      <g transform="translate(428, 0)">
        <rect width="130" height="36" rx="8" fill="#131722"/>
        <text x="14" y="22" class="font-sans" font-size="13">🖥</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#9CA3AF">Диммер</text>
        <rect x="88" y="10" width="32" height="15" rx="4" fill="#1B2230"/>
        <text x="104" y="21" class="font-sans" font-size="8" font-weight="600" fill="#6B7280" text-anchor="middle">DDC</text>
      </g>

      <!-- Tab 5: Настройки -->
      <g transform="translate(566, 0)">
        <rect width="116" height="36" rx="8" fill="#131722"/>
        <text x="14" y="22" class="font-sans" font-size="13">⚙</text>
        <text x="34" y="22" class="font-sans" font-size="12" font-weight="500" fill="#9CA3AF">Настройки</text>
      </g>
    </g>

    <!-- Right Quick Controls -->
    <g id="Header-Right-Actions" transform="translate(1080, 10)">
      <!-- ЖК -->
      <rect width="30" height="32" rx="6" fill="#161B26" stroke="#FFFFFF" stroke-opacity="0.06"/>
      <text x="15" y="20" class="font-sans" font-size="11" font-weight="700" fill="#9CA3AF" text-anchor="middle">ЖК</text>

      <!-- PIP -->
      <g transform="translate(36, 0)">
        <rect width="36" height="32" rx="6" fill="#161B26" stroke="#FFFFFF" stroke-opacity="0.06"/>
        <text x="18" y="20" class="font-sans" font-size="10" font-weight="700" fill="#9CA3AF" text-anchor="middle">PIP</text>
      </g>

      <!-- НОЧЬ -->
      <g transform="translate(78, 0)">
        <rect width="58" height="32" rx="6" fill="#161B26" stroke="#FFFFFF" stroke-opacity="0.06"/>
        <text x="10" y="20" class="font-sans" font-size="11">🌙</text>
        <text x="34" y="20" class="font-sans" font-size="10.5" font-weight="700" fill="#9CA3AF" text-anchor="middle">НОЧЬ</text>
      </g>

      <!-- ТЕМА Selector (Pill) -->
      <g transform="translate(142, 0)">
        <rect width="86" height="32" rx="6" fill="#18202D" stroke="#2DD4BF" stroke-opacity="0.3"/>
        <text x="10" y="20" class="font-sans" font-size="11">🎨</text>
        <text x="44" y="20" class="font-sans" font-size="10.5" font-weight="700" fill="#2DD4BF" text-anchor="middle">LUNA ▾</text>
      </g>

      <!-- Farm Toggle -->
      <g transform="translate(236, 0)">
        <rect width="64" height="32" rx="16" fill="#161B26" stroke="#2DD4BF" stroke-opacity="0.4"/>
        <circle cx="48" cy="16" r="10" fill="#2DD4BF"/>
        <text x="18" y="20" class="font-sans" font-size="9" font-weight="800" fill="#2DD4BF">FARM</text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 2. MAIN COCKPIT WORKSPACE (NEW INTERFACE LAYOUT)                          -->
  <!-- ========================================================================= -->
  <g id="Main-Cockpit-Grid" transform="translate(24, 82)">

    <!-- ======================================================================= -->
    <!-- LEFT ISLAND: ПОЛКА КАМПАНИЙ (Hero Card + Reorderable Queue) (410px)      -->
    <!-- ======================================================================= -->
    <g id="Left-Campaigns-Island">
      <rect width="410" height="796" rx="14" fill="#10141E" stroke="#FFFFFF" stroke-opacity="0.06"/>

      <!-- Island Header -->
      <g transform="translate(18, 16)">
        <circle cx="4" cy="8" r="3" fill="#2DD4BF"/>
        <text x="14" y="11" class="font-sans" font-size="11.5" font-weight="800" fill="#FFFFFF" letter-spacing="0.04em">ПОЛКА КАМПАНИЙ (6)</text>
        
        <!-- Filter pill -->
        <rect x="290" y="0" width="84" height="22" rx="11" fill="#161C28" stroke="#2DD4BF" stroke-opacity="0.3"/>
        <circle cx="300" cy="11" r="2.5" fill="#F43F5E"/>
        <text x="336" y="15" class="font-sans" font-size="9" font-weight="700" fill="#EDEFF2" text-anchor="middle">ТОЛЬКО ТОП</text>
      </g>

      <!-- 1. HERO ACTIVE FARM CARD: Hunt: Showdown 1896 -->
      <g id="Hero-Active-Card" transform="translate(16, 50)">
        <rect width="378" height="152" rx="12" fill="url(#card-inner)" stroke="#2DD4BF" stroke-opacity="0.4" stroke-width="1.2"/>

        <!-- Top pill badges -->
        <g transform="translate(14, 14)">
          <circle cx="4" cy="5" r="2.5" fill="#2DD4BF"/>
          <text x="12" y="8" class="font-sans" font-size="9.5" font-weight="800" fill="#2DD4BF" letter-spacing="0.04em">АКТИВНЫЙ ФАРМ  •  АВТОКЛЕЙМ GQL</text>
          
          <!-- Streamer live chip -->
          <text x="348" y="8" class="font-sans" font-size="10" font-weight="700" fill="#9CA3AF" text-anchor="end">🎮 @lvndmark (LIVE)</text>
        </g>

        <!-- Content: Poster + Title + Progress -->
        <g transform="translate(14, 34)">
          <!-- Box art thumbnail -->
          <rect width="64" height="84" rx="8" fill="#1F2636"/>
          <text x="32" y="48" class="font-sans" font-size="22" text-anchor="middle">🤠</text>

          <!-- Title & Reward -->
          <text x="76" y="22" class="font-sans" font-size="15" font-weight="800" fill="#FFFFFF">Hunt: Showdown 1896</text>
          <text x="76" y="40" class="font-sans" font-size="11.5" font-weight="500" fill="#9CA3AF">★ Weapon Charm &amp; Blood Bonds Pack</text>

          <!-- Progress Bar & Stats -->
          <rect x="76" y="54" width="272" height="7" rx="3.5" fill="#1C2230"/>
          <rect x="76" y="54" width="224" height="7" rx="3.5" fill="url(#chrono-mint)"/>

          <text x="76" y="78" class="font-sans" font-size="11" font-weight="600" fill="#9CA3AF">49 / 60 мин</text>
          <text x="348" y="78" class="font-mono" font-size="12" font-weight="800" fill="#2DD4BF" text-anchor="end">82.4%</text>
        </g>
      </g>

      <!-- 2. QUEUE SCROLL LIST (Rust, Cyberpunk, Delta Force, Aion) -->
      <g id="Queue-List" transform="translate(16, 218)">

        <!-- Queue Item 1: Rust Rivals #1 -->
        <g transform="translate(0, 0)">
          <rect width="378" height="64" rx="10" fill="#131722" stroke="#FFFFFF" stroke-opacity="0.05"/>
          <rect x="12" y="11" width="42" height="42" rx="8" fill="#1A202C"/>
          <text x="33" y="38" class="font-sans" font-size="18" text-anchor="middle">⛺</text>
          <text x="64" y="27" class="font-sans" font-size="13" font-weight="700" fill="#FFFFFF">Rust · Rivals 32</text>
          <rect x="170" y="15" width="22" height="15" rx="4" fill="#1E2534"/>
          <text x="181" y="26" class="font-sans" font-size="9" font-weight="700" fill="#2DD4BF" text-anchor="middle">#1</text>
          <text x="64" y="45" class="font-sans" font-size="11" font-weight="400" fill="#6B7280">Tactical Thompson &amp; Mask</text>
          
          <text x="318" y="37" class="font-mono" font-size="13" font-weight="700" fill="#2DD4BF">94%</text>
          <!-- Reorder Rocker ▲ / ▼ -->
          <rect x="348" y="16" width="18" height="32" rx="4" fill="#1A202C"/>
          <text x="357" y="28" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▲</text>
          <text x="357" y="42" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▼</text>
        </g>

        <!-- Queue Item 2: Cyberpunk 2077 #2 -->
        <g transform="translate(0, 72)">
          <rect width="378" height="64" rx="10" fill="#131722" stroke="#FFFFFF" stroke-opacity="0.05"/>
          <rect x="12" y="11" width="42" height="42" rx="8" fill="#1A202C"/>
          <text x="33" y="38" class="font-sans" font-size="18" text-anchor="middle">🌆</text>
          <text x="64" y="27" class="font-sans" font-size="13" font-weight="700" fill="#FFFFFF">Cyberpunk 2077</text>
          <rect x="176" y="15" width="22" height="15" rx="4" fill="#1E2534"/>
          <text x="187" y="26" class="font-sans" font-size="9" font-weight="700" fill="#6B7280" text-anchor="middle">#2</text>
          <text x="64" y="45" class="font-sans" font-size="11" font-weight="400" fill="#6B7280">Phantom Liberty Vest</text>
          
          <text x="318" y="37" class="font-mono" font-size="13" font-weight="700" fill="#9CA3AF">65%</text>
          <rect x="348" y="16" width="18" height="32" rx="4" fill="#1A202C"/>
          <text x="357" y="28" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▲</text>
          <text x="357" y="42" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▼</text>
        </g>

        <!-- Queue Item 3: Delta Force #3 -->
        <g transform="translate(0, 144)">
          <rect width="378" height="64" rx="10" fill="#131722" stroke="#FFFFFF" stroke-opacity="0.05"/>
          <rect x="12" y="11" width="42" height="42" rx="8" fill="#1A202C"/>
          <text x="33" y="38" class="font-sans" font-size="18" text-anchor="middle">🪖</text>
          <text x="64" y="27" class="font-sans" font-size="13" font-weight="700" fill="#FFFFFF">Delta Force</text>
          <rect x="146" y="15" width="22" height="15" rx="4" fill="#1E2534"/>
          <text x="157" y="26" class="font-sans" font-size="9" font-weight="700" fill="#6B7280" text-anchor="middle">#3</text>
          <text x="64" y="45" class="font-sans" font-size="11" font-weight="400" fill="#6B7280">Zero Dam Tactical Bundle</text>
          
          <text x="318" y="37" class="font-mono" font-size="13" font-weight="700" fill="#9CA3AF">40%</text>
          <rect x="348" y="16" width="18" height="32" rx="4" fill="#1A202C"/>
          <text x="357" y="28" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▲</text>
          <text x="357" y="42" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▼</text>
        </g>

        <!-- Queue Item 4: AION 2 #4 -->
        <g transform="translate(0, 216)">
          <rect width="378" height="64" rx="10" fill="#131722" stroke="#FFFFFF" stroke-opacity="0.05"/>
          <rect x="12" y="11" width="42" height="42" rx="8" fill="#1A202C"/>
          <text x="33" y="38" class="font-sans" font-size="18" text-anchor="middle">⚔️</text>
          <text x="64" y="27" class="font-sans" font-size="13" font-weight="700" fill="#FFFFFF">AION 2</text>
          <rect x="120" y="15" width="22" height="15" rx="4" fill="#1E2534"/>
          <text x="131" y="26" class="font-sans" font-size="9" font-weight="700" fill="#6B7280" text-anchor="middle">#4</text>
          <text x="64" y="45" class="font-sans" font-size="11" font-weight="400" fill="#6B7280">Celestial Wing Cloak</text>
          
          <text x="318" y="37" class="font-mono" font-size="13" font-weight="700" fill="#6B7280">15%</text>
          <rect x="348" y="16" width="18" height="32" rx="4" fill="#1A202C"/>
          <text x="357" y="28" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▲</text>
          <text x="357" y="42" class="font-sans" font-size="8" fill="#9CA3AF" text-anchor="middle">▼</text>
        </g>
      </g>
    </g>

    <!-- ======================================================================= -->
    <!-- RIGHT DECK: CHRONO HERO + OPERATIONS CONSOLE (966px)                     -->
    <!-- ======================================================================= -->
    <g id="Right-Deck" transform="translate(426, 0)">

      <!-- MODULE 1: CHRONO HERO & TARGET REWARD (Height: 380px) -->
      <g id="Chrono-Hero-Module">
        <rect width="966" height="380" rx="14" fill="#10141E" stroke="#FFFFFF" stroke-opacity="0.06"/>

        <!-- Header -->
        <g transform="translate(24, 16)">
          <circle cx="4" cy="8" r="3" fill="#2DD4BF"/>
          <text x="14" y="11" class="font-sans" font-size="11.5" font-weight="800" fill="#FFFFFF" letter-spacing="0.04em">ЦЕЛЕВАЯ НАГРАДА // АКТИВНЫЙ ХРОНОГРАФ</text>
          
          <text x="918" y="11" class="font-sans" font-size="10.5" font-weight="700" fill="#2DD4BF" text-anchor="end">✓ ЗАПАС ДО КОНЦА: +18 Ч   |   STREAMLESS GQL</text>
        </g>

        <!-- Chrono Dial & Reward Description -->
        <g transform="translate(32, 54)">
          <!-- Circular Chronograph Ring -->
          <g transform="translate(70, 70)">
            <circle cx="0" cy="0" r="62" stroke="#181E2A" stroke-width="8" fill="none"/>
            <circle cx="0" cy="0" r="62" stroke="#2DD4BF" stroke-width="8" stroke-dasharray="390" stroke-dashoffset="70" stroke-linecap="round" fill="none"/>
            <text x="0" y="2" class="font-sans" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle">82%</text>
            <text x="0" y="20" class="font-mono" font-size="10" font-weight="700" fill="#2DD4BF" text-anchor="middle">~11 МИН</text>
          </g>

          <!-- Reward Metadata & Actions -->
          <g transform="translate(164, 16)">
            <!-- Phase tag -->
            <rect width="180" height="20" rx="4" fill="#1A2130"/>
            <text x="10" y="14" class="font-sans" font-size="9.5" font-weight="800" fill="#2DD4BF" letter-spacing="0.04em">ЭТАП 2 ИЗ 3  •  49 ИЗ 60 МИН  •  1.00x</text>

            <text x="0" y="56" class="font-sans" font-size="24" font-weight="800" fill="#FFFFFF" letter-spacing="-0.02em">Weapon Charm &amp; Blood Bonds Pack</text>
            <text x="0" y="80" class="font-sans" font-size="13" font-weight="500" fill="#9CA3AF">ИГРА: <tspan fill="#EDEFF2" font-weight="700">Hunt: Showdown 1896</tspan>  •  СТАТУС: <tspan fill="#2DD4BF" font-weight="700">@lvndmark (LIVE)</tspan></text>

            <!-- Buttons -->
            <g transform="translate(0, 102)">
              <rect width="168" height="40" rx="8" fill="url(#btn-mint-grad)"/>
              <text x="84" y="25" class="font-sans" font-size="12" font-weight="800" fill="#0B0E14" text-anchor="middle">АВТОКЛЕЙМ GQL: ВКЛ</text>

              <g transform="translate(178, 0)">
                <rect width="154" height="40" rx="8" fill="#161B26" stroke="#FFFFFF" stroke-opacity="0.08"/>
                <text x="77" y="25" class="font-sans" font-size="12" font-weight="600" fill="#EDEFF2" text-anchor="middle">🔄 Сменить стримера</text>
              </g>

              <g transform="translate(342, 0)">
                <rect width="124" height="40" rx="8" fill="#161B26" stroke="#FFFFFF" stroke-opacity="0.08"/>
                <text x="62" y="25" class="font-sans" font-size="12" font-weight="600" fill="#EDEFF2" text-anchor="middle">⏭ След. игра</text>
              </g>
            </g>
          </g>

          <!-- 16:9 Streamer Viewfinder Box (Right Side) -->
          <g transform="translate(650, 6)">
            <rect width="250" height="140" rx="10" fill="#0A0D12" stroke="#FFFFFF" stroke-opacity="0.08"/>
            <text x="16" y="24" class="font-sans" font-size="11" font-weight="700" fill="#2DD4BF">● @lvndmark</text>
            <text x="234" y="24" class="font-sans" font-size="9.5" font-weight="600" fill="#6B7280" text-anchor="end">1080p60 MUTED</text>
            
            <!-- Channel chips -->
            <g transform="translate(14, 96)">
              <rect width="72" height="24" rx="4" fill="#141822"/>
              <text x="36" y="16" class="font-sans" font-size="9" font-weight="600" fill="#EDEFF2" text-anchor="middle">pestily (12k)</text>

              <g transform="translate(78, 0)">
                <rect width="72" height="24" rx="4" fill="#141822"/>
                <text x="36" y="16" class="font-sans" font-size="9" font-weight="600" fill="#EDEFF2" text-anchor="middle">geenosh (4k)</text>
              </g>

              <g transform="translate(156, 0)">
                <rect width="66" height="24" rx="4" fill="#141822"/>
                <text x="33" y="16" class="font-sans" font-size="9" font-weight="600" fill="#EDEFF2" text-anchor="middle">rfour (2k)</text>
              </g>
            </g>
          </g>
        </g>
      </g>

      <!-- MODULE 2: LIVE OPERATIONS CONSOLE (Height: 400px) -->
      <g id="Operations-Console-Module" transform="translate(0, 396)">
        <rect width="966" height="400" rx="14" fill="#10141E" stroke="#FFFFFF" stroke-opacity="0.06"/>

        <!-- Header -->
        <g transform="translate(24, 16)">
          <circle cx="4" cy="8" r="3" fill="#2DD4BF"/>
          <text x="14" y="11" class="font-sans" font-size="11.5" font-weight="800" fill="#FFFFFF" letter-spacing="0.04em">КОНСОЛЬ ЖИВЫХ ОПЕРАЦИЙ (LIVE TELEMETRY)</text>

          <!-- Console filters -->
          <g transform="translate(680, -2)">
            <rect width="56" height="22" rx="4" fill="#1A2130" stroke="#2DD4BF" stroke-opacity="0.4"/>
            <text x="28" y="15" class="font-sans" font-size="9.5" font-weight="800" fill="#2DD4BF" text-anchor="middle">ALL (60)</text>

            <g transform="translate(62, 0)">
              <rect width="50" height="22" rx="4" fill="#131722"/>
              <text x="25" y="15" class="font-sans" font-size="9.5" font-weight="600" fill="#6B7280" text-anchor="middle">WATCH</text>
            </g>

            <g transform="translate(118, 0)">
              <rect width="48" height="22" rx="4" fill="#131722"/>
              <text x="24" y="15" class="font-sans" font-size="9.5" font-weight="600" fill="#6B7280" text-anchor="middle">CLAIM</text>
            </g>

            <g transform="translate(172, 0)">
              <rect width="48" height="22" rx="4" fill="#131722"/>
              <text x="24" y="15" class="font-sans" font-size="9.5" font-weight="600" fill="#6B7280" text-anchor="middle">CORE</text>
            </g>
          </g>
        </g>

        <!-- Monospace Operational Log Stream -->
        <g transform="translate(24, 52)">
          <!-- Row 1 -->
          <text x="0" y="20" class="font-mono" font-size="11" fill="#6B7280">10:48:12</text>
          <rect x="64" y="8" width="62" height="18" rx="4" fill="#2DD4BF" fill-opacity="0.15"/>
          <text x="95" y="21" class="font-mono" font-size="9" font-weight="800" fill="#2DD4BF" text-anchor="middle">GQL-SYNC</text>
          <text x="136" y="20" class="font-mono" font-size="11.5" fill="#EDEFF2">Twitch GQL Operations channel connected: authenticated as user #284920</text>

          <!-- Row 2 -->
          <text x="0" y="48" class="font-mono" font-size="11" fill="#6B7280">10:48:19</text>
          <rect x="64" y="36" width="82" height="18" rx="4" fill="#38BDF8" fill-opacity="0.15"/>
          <text x="105" y="49" class="font-mono" font-size="9" font-weight="800" fill="#38BDF8" text-anchor="middle">WATCH-SOCKET</text>
          <text x="156" y="48" class="font-mono" font-size="11.5" fill="#EDEFF2">Active payload stream assigned to channel @lvndmark (Hunt: Showdown 1896)</text>

          <!-- Row 3 -->
          <text x="0" y="76" class="font-mono" font-size="11" fill="#6B7280">10:48:35</text>
          <rect x="64" y="64" width="62" height="18" rx="4" fill="#E5A93C" fill-opacity="0.15"/>
          <text x="95" y="77" class="font-mono" font-size="9" font-weight="800" fill="#E5A93C" text-anchor="middle">PROGRESS</text>
          <text x="136" y="76" class="font-mono" font-size="11.5" fill="#EDEFF2">Drop progress updated: 81.2% → 82.4% (Elapsed: 49 min / 60 min required)</text>

          <!-- Row 4 -->
          <text x="0" y="104" class="font-mono" font-size="11" fill="#6B7280">10:48:58</text>
          <rect x="64" y="92" width="66" height="18" rx="4" fill="#10B981" fill-opacity="0.15"/>
          <text x="97" y="105" class="font-mono" font-size="9" font-weight="800" fill="#10B981" text-anchor="middle">HEARTBEAT</text>
          <text x="140" y="104" class="font-mono" font-size="11.5" fill="#EDEFF2">Streamless ACK verified: latency 14ms • GPU load 0.0% • 0 dropped packets</text>

          <!-- Row 5 -->
          <text x="0" y="132" class="font-mono" font-size="11" fill="#6B7280">10:49:12</text>
          <rect x="64" y="120" width="88" height="18" rx="4" fill="#A855F7" fill-opacity="0.15"/>
          <text x="108" y="133" class="font-mono" font-size="9" font-weight="800" fill="#A855F7" text-anchor="middle">TROPHY-GUARD</text>
          <text x="162" y="132" class="font-mono" font-size="11.5" fill="#EDEFF2">Trophies.md synced: 42 trophies recorded in secure vault storage</text>
        </g>
      </g>
    </g>
  </g>
</svg>"""

out_svg = r"C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3\figma_new_interface_apple_luna.svg"
with open(out_svg, "w", encoding="utf-8") as f:
    f.write(svg_content)
print(f"Created new interface Apple Luna SVG: {out_svg} ({len(svg_content)} bytes)")
