# Security policy

## Supported versions

Only the [latest release](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases/latest) gets fixes. The built-in updater keeps you on it.

## Reporting a vulnerability

Please do not open a public issue. Use [private vulnerability reporting](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/security/advisories/new) on GitHub and describe what you found and how to reproduce it. You will get an answer within a week.

## What Sentinel stores

Everything stays on your PC, next to the executable:

| File | Contents |
|---|---|
| `cookies.jar` | Your Twitch session from the official device login. Treat it like a password. |
| `config.json` | Your settings. |
| `Trophies.md` | The log of claimed rewards. |
| `giveaways_engine/data/` | Browser profiles of the free-games claimer, if you use it. |

Sentinel talks only to Twitch, GitHub (update checks) and, if you enable the free-games claimer, the game stores. Diagnostic reports remove tokens before you copy them. Never share `cookies.jar` or a report you edited by hand.
