# Local Service Access and Update Trust

**Area:** `core/local_access.py`, `core/updater.py`, `core/settings_transaction.py`, `desktop/DimmerLogic.cs`

## Who may call the local service
CORS with `*` only decided what a page may read: any website could still POST to `127.0.0.1:28492`. The middleware now refuses a foreign `Origin`
and a foreign `Host` (DNS rebinding) on every route. Allowed: `https://app.sentinel`, the Vite ports 5173 and 4173, and requests with no `Origin`,
which is what the desktop shell and local tools send. `Origin: null` is refused because sandboxed frames of any site have it. For that reason the shell
no longer uses `NavigateToString` for its fallback page: it serves the embedded page from the same virtual host. A local program can still call the service.

## What an update may install
The page only asks for the update. The address comes from the release metadata, and `is_trusted_release_url` checks the parsed host and path, with no `%`, `?` or `#`.
The token goes only to such an address and does not follow a redirect to another host. There is no hash or signature on the archive, so the trust root is
TLS plus the GitHub account: a hijacked release is still code execution.

Archive paths are normalized before they are matched against user files, because `./config.json` used to pass a check on the raw string.
Tests call `_install_update` directly to install from a local server: `apply_update_from_url` refuses such addresses.

## Settings change together or not at all
`save_settings` writes two files. `save_transaction` restores both if either write fails, and `apply_change` restores the dict, so a failed save leaves disk and memory as they were.

## Dimmer: pending until the hardware has settled
`SetHardwareBrightness` returns while the write is still queued, and DDC reports the old value for a while after it. A monitor therefore stays pending until its write
ends plus 500 ms; otherwise an explicit poll reads the old value and rolls the slider back. Aliases such as `"0"` and `"disp-primary"` must be resolved before the cache write
and before `Post`, or one monitor has two keys. `tools/dimmer_logic_check` tests the logic on manual time and fake hardware, not real DDC, WMI or audio.

## Builds through a junction lose the font
Building through a `node_modules` junction leaves Inter as an unresolved `url(@fontsource...)`. `test_built_page_embeds_its_font` catches it. Rebuild `dist` from a real `node_modules`.
