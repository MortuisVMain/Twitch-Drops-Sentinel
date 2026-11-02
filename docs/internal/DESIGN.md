# DESIGN CONTRACT: Twitch Drops Sentinel v3.0 [Apple Luna 2.0 — Stealth Luxury Edition]

## 1. Aesthetic Calibration & Taste Read
- **Style Direction:** Stealth Luxury / Tactical Hardware Utility (inspired by Linear, Teenage Engineering OP-1 Field, Leica Maestro UI, and Apple visionOS).
- **Domain Atmosphere:** Premium desktop companion for high-end gaming hardware (RTX 5070 Ti, zero-lag background daemon).
- **Core Principle:** Fused chassis of anodized obsidian aluminum with frosted optical sapphire glass and etched laser telemetry. Zero AI-slop, zero neon gamer colors.

---

## 2. Color Space & Tokens (Zero-Neon Policy)
- **Chassis Background (Level 0):** `oklch(0.13 0.006 255)` (`#08090B`) — deep velvet obsidian base.
- **Recessed Well (Level -1):** `oklch(0.11 0.005 255)` (`#050608`) — machined groove for progress bars and console logs.
- **Surface Level 1 (Bento Cards):** `oklch(0.17 0.008 255)` (`#0E1014`) with `inset 0 1px 0 0 rgba(255, 255, 255, 0.10)`.
- **Surface Level 2 (Elevated):** `oklch(0.21 0.010 255)` (`#15181E`) with subtle bevel and tactile hover.
- **Surface Level 3 (Active/Hover):** `oklch(0.25 0.012 255)` (`#1D2129`).
- **Floating Optical Dock:** `oklch(0.19 0.010 255 / 0.75)` with `backdrop-filter: blur(24px) saturate(150%)`.

### Noble Mint Accent:
- **Primary Mint:** `oklch(0.76 0.125 164)` (`#3AD29F`) — active progress, online status.
- **Specular Mint:** `oklch(0.87 0.105 164)` (`#7CE8C2`) — sharp leading edge highlight, LED core.
- **Muted Mint:** `oklch(0.55 0.090 164)` (`#217C5E`) — secondary progress trail.
- **Mint Surface / Tint:** `oklch(0.23 0.038 164 / 0.35)` — translucent active badges.

### Status Telemetry:
- **Success / Claimed:** `oklch(0.74 0.115 156)` (`#41C485`) — sage emerald.
- **Warning / Wait:** `oklch(0.78 0.130 75)` (`#E5A93C`) — warm amber gold.
- **Danger / Error:** `oklch(0.65 0.160 25)` (`#DF5353`) — oxidized carmine.
- **Idle / Standby:** `oklch(0.58 0.015 255)` (`#767D8A`) — cool titanium.

---

## 3. Typography & Micro-Interactions
- **Font Stack:** `'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`.
- **Numbers & Metrics:** `font-variant-numeric: tabular-nums slashed-zero; font-mono` for all timers, percentages, ping, and memory.
- **Laser Micro-Labels:** `10px uppercase tracking-[0.09em] font-semibold text-[var(--text-muted)]`.
- **Spring Micro-Interactions:** `cubic-bezier(0.22, 1, 0.36, 1)` with `active:scale-[0.985]`.

---

## Приложение: Field-Deck / Flat-2D (v3.3.5, добавлено при аудите 2026-11-01)

Разделы выше описывают Apple Luna 2.0 и сохранены как история. Текущий интерфейс 3.3.5 называется **Sentinel Field-Deck** (бренд в шапке `App.tsx`) и является эталоном.

- **Темы:** переключатель «ТЕМА» + «НОЧЬ». Токены лежат в `src/index.css` как CSS-переменные на `[data-theme]`: `titanium` (по умолчанию, `:root`), `luna-mint`, `gradient`, `cyberpunk`, `light`, `copper`, `apple-luna`.
- **Базовая палитра titanium:** фон `#050608`, шасси `#080A0E`, текст `#F3F5F8 / #9CA3B0 / #5E6573`, LED: мята `#3AD29F`, янтарь `#F59E0B`, циан `#38BDF8`, роза `#F87171`.
- **Вкладки:** Дашборд, Полка Игр, Раздачи, Диммер, Настройки; шапка: ⌘K, PIP, НОЧЬ, ТЕМА, ALPS (звук), ?, переключатель FARM.
- **Терминология:** «дроп / кампания» = Twitch Drops; «Раздачи» = только вкладка бесплатных игр (7 магазинов). Не смешивать (аудит F-011, F-017).
- **Заголовки карточек** (`.engraved-header .tag`) не переносятся (`white-space: nowrap`); если шапка шире карточки, переносить блок кнопок (`flex-wrap`), как в планировщике Раздач.
- **Минимальное окно** 1180×750 физических px; при масштабе 150% это ~787 CSS px, шапка (~1090 px) в таком окне обрезается (наблюдение P3).
