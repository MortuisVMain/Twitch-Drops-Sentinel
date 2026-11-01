# ScreenDimmer: Monotonic Wheel Accumulation, Pro-Audio Relative Delta Drag, and Complete Interaction Shielding

## Context & Root Causes
1. **Mouse Wheel Jitter on Knob and Sliders**:
   - `handleJogWheel` read `masterBrightness` from React's state closure. Rapid consecutive wheel ticks (10-20 events in 100ms) fired before React re-rendered, reading stale values and bouncing.
   - `setMonitors` in `handleWebviewMessage` was updating continuously on every asynchronous `DIMMER_STATE_CHANGED` echo from C#, resetting the monitors and sliders to in-flight levels while the user was actively scrolling.
2. **Jump to 100% when Dragging to 0%**:
   - Trigonometric polar coordinates (`atan2(dy, dx)`) with a 90° bottom dead zone caused pointer movements near the bottom/right quadrants to enter the dead zone and evaluate to `pct = 100`.
   - On `pointerDown`, computing polar angle from click coordinates caused the knob to jump to 100% on initial click if clicked to the right of the center.

## Solution Architecture
1. **Total Interaction Shield (`isInteractingRef`)**:
   - During user scrolling, dragging, or slider movement, `isInteractingRef.current` is set to `true` (with an 800ms debounce cooldown).
   - `handleWebviewMessage` drops **all** incoming `DIMMER_STATE_CHANGED` monitor and master brightness echoes while `isInteractingRef` is active. Sliders and dial values remain completely stable and monotonic.
2. **Monotonic Mouse Wheel State Ref (`masterBrightnessRef`)**:
   - Maintained `masterBrightnessRef = useRef(75)`.
   - Rapid wheel ticks update `masterBrightnessRef.current` synchronously, guaranteeing monotonic delta accumulation (`75 -> 70 -> 65 -> 60 -> 55...`) without relying on re-render timing.
3. **Pro-Audio Relative Delta Drag**:
   - Replaced absolute polar angle calculation with Pro-Audio directional relative delta tracking:
     - On `pointerDown`: records anchor `{ startY, startX, startBri: masterBrightnessRef.current }`. The knob **never jumps** on initial click.
     - On `pointerMove`: computes $\Delta y$ (up/down) and $\Delta x$ (right/left). Dragging down/left smoothly decreases brightness to 0% without crossing dead zones.
     - Hard clamps at $[0, 100]$: reaching 0 stays at 0, with zero possibility of jumping to 100.
4. **C# Hardware Debounce Enhancement**:
   - Increased C# `Task.Delay` from 60ms to 100ms in `SetHardwareBrightnessDebounced`.
   - Eliminates redundant I2C writes while user is adjusting levels.

## Verification
- Rebuilt frontend with `npm run build` (583.39 kB).
- Published single-file C# executable via `dotnet publish -p:PublishSingleFile=true`.
- Deployed binary to root `TwitchDropsSentinel.exe` and `TwitchDropsSentinel.update`.
- Verified all 6 test suites passed with Exit Code 0:
  - `test_screendimmer_full_operational.py` (10/10 PASS)
  - `test_giveaways_full_operational.py` (PASS)
  - `test_dashboard_full_operational.py` (PASS)
  - `test_gameshelf_full_operational.py` (PASS)
  - `test_settings_full_operational.py` (PASS)
  - `test_auxiliary_systems.py` (PASS)
