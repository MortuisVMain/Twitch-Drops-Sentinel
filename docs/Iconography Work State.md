# App-wide iconography work

User approved implementation on 2026-11-06: unify icons across every Sentinel screen, tab, popup and PiP; preserve behavior.

- Repository: `C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3`.
- Initial unrelated changes: `LICENSE`, `core/lang/English.json`; untracked audit/provenance documents. Preserve these.
- Baseline: `npx tsc --noEmit` exited 0 before edits.
- Frontend implementation: delegated to `unify_icons` (Sol), owns `src/**` and optional focused UI checks. Parent owns backend/native strings and documentation. One active subagent at a time.
- Design: existing Lucide, explicit React SVGs, shared sizing/currentColor; remove redundant decoration. Preserve external names, artwork and brand images. No global text sanitization.
- Risk review: exact-string/regex translations must change with labels; trophies parser accepts historic checkmarks; do not rewrite existing journals or logs. Preserve action handlers and settings.
- Verification: typecheck/build; localization check; offline Edge harness across tabs/dialogs, languages/themes and PiP. No live claims, account changes, shutdown/sleep, updater or hardware actions.
- Playwright available at `C:\Users\mortu\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules`; use `NODE_PATH` for existing `tools/check_*.cjs`.
- Pending: finish UI conversion, clean own backend messages safely, independent review, run checks on final revision, record evidence and limits.

## Finished by Claude (2026-11-06)

- Astra's uncommitted work was taken from the live folder as is (backup: `backups/astra-icons-2026-11-06/astra-working-tree.patch`) onto branch `claude/app-iconography`; `LICENSE` and the built `dist/index.html` were left out (dist is rebuilt).
- Front end: no emoji or pictographic symbols left in `src/**`; Lucide icons with `ui-icon`, `aria-hidden`, `focusable="false"`.
- Suite: eight assertions pinned the old emoji labels ("⚠️ Требуется привязка", "🏆 Собрано", "🗑️ Удалённые", "⚡ ПРИНУДИТЕЛЬНЫЙ ФОКУС", "🎯/⚡ Режим", "Скопировано ✓", "↻ Обновить", "Выбрать игру для фарма ▾"). They now check the new label together with its icon. All 131 gates pass.
- Checked: tsc, i18n (1227 strings), UI harness checks (console, override cards, diagnostics, browser choice, startup states, PiP layout, shelf hit areas, text LCD), engine tests 54/54. Screenshots of every main tab and the command palette in RU and EN, compared with 3.5.18: one icon set, no page errors. The store cards' state badge wraps on long names as it did in 3.5.18.
- Kept on purpose: the monochrome markers ✓ ✕ ▶ ■ in giveaways log lines (tests and the run summary read them), the 🏆 header of a new Trophies.md (file format), and the ✅ check in the journal reader (old journals).
- Trophy rows written from now on say "Забран" without ✅; both readers match the word, so old and new rows count.
- Not covered by the offline check: native Windows toasts and the tray menu (text only, emoji removed from titles), real account, power and update actions.
