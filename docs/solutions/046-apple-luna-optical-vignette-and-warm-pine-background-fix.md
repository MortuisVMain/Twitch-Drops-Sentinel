# 046. Фикс цвета задника Apple Luna 2.0: Оптическая виньетка и теплый сосново-графитовый градиент

## Проблема
При переключении в Sentinel Field-Deck v3.3.4 на тему №7 (`Apple Luna`) и режим задника `Apple Luna (Orbs)` цвет фона за карточками и по краям окна отображался как глухая смоляная чернота (`#0c0d11` / `#050608`), вместо фирменного теплого сосново-графитового тона `#171d1c` из `ui_redesign_bundle`.

## Диагностика и первопричина (Root Cause)
1. **Глобальная оптическая линза `.chassis-optical-vignette`:**
   В `src/index.css` поверх холста лежал слой `.chassis-optical-vignette` с тяжелым радиальным градиентом:
   `radial-gradient(ellipse 90% 85% at 50% 50%, transparent 45%, rgba(4, 5, 7, 0.72) 100%)`.
   На краях и углах экрана 72% черной маски смешивались с `#171d1c` и превращали фон в смоляной `#090c0d`. Для светлой темы `light` было сделано персональное переопределение, а для `apple-luna` его не было.
2. **Прозрачность холста `LiquidCanvas`:**
   В `drawLiquidSilk2D` выполнялся только `ctx.clearRect(0, 0, w, h)`, холст оставался прозрачным и не заливал базовый тон градиента `#171d1c` ➔ `#141918`, из-за чего просвечивала затемненная виньеткой подложка.

## Хирургическое решение
1. **Специфичное правило для оптической виньетки в `src/index.css`:**
   ```css
   [data-theme="apple-luna"] .chassis-optical-vignette {
     background: 
       radial-gradient(750px circle at var(--mouse-x, 50%) var(--mouse-y, 40%), rgba(115, 187, 165, 0.05) 0%, transparent 70%),
       radial-gradient(ellipse 95% 90% at 50% 50%, transparent 65%, rgba(19, 25, 24, 0.35) 100%);
   }
   ```
2. **Гарантированный фон шасси и окна:**
   ```css
   [data-theme="apple-luna"] body,
   body[data-theme="apple-luna"],
   .field-chassis[data-theme="apple-luna"] {
     background-color: #171d1c !important;
   }
   ```
3. **Отрисовка теплого сосново-графитового градиента в `LiquidCanvas.tsx`:**
   - В `drawLiquidSilk2D` при `isLuna`: заливка градиентом `#171d1c` ➔ `#141918` вместо `clearRect`.
   - Увеличен радиус и глубина сфер `silkOrbs` (`r: 440, 480, 380`, прозрачность `0.18, 0.15, 0.14`), восстанавливая живое дыхание шаров мяты.
   - В `drawHexPrisms3D` для `isAppleLuna` прописан `darkCol = '#171D1C'` и `midCol = '#368873'`.

## Верификация
- `npm run build`: SingleFile `dist/index.html` (596 kB) собран за 2.26s без ошибок.
- `dotnet build`: C# host собран чисто.
- `test_sentinel_suite.py`: Все 36 шлюзов тестирования пройдены с кодом 0.
