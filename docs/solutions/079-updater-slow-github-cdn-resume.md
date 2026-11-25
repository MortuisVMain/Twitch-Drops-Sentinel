# 079. The updater restarted an 85 MB download from zero on a slow GitHub CDN

## Symptom
The in-app update from 3.9.2 to 4.0.0 never finished for the user. The progress bar crawled and fell back to the start. A plain browser download of the same asset was also slow.

## Root cause
- GitHub serves release assets from `release-assets.githubusercontent.com` (after a redirect from `github.com/.../releases/download/...`). For this user that CDN was slow **per connection**: about 12-40 KB/s at times. Several connections in parallel together were fast.
- The old updater read the patch in one stream with a socket timeout. Every timeout raised, and the retry started the whole file again from byte 0. At those speeds a timeout came long before 85 MB, so the download could never finish.
- The first HTTPS handshake on such a link also failed often. A single failed probe used to drop the parallel path and fall back to one stream.

## Fix (v4.0.1, PR #61)
`core/updater.py`:
- `download_file()` first probes with `Range: bytes=0-0`. A `206` with `Content-Range` gives the total size and pins the final CDN URL, so the redirect is not followed again for every part. The probe is retried `PROBE_ATTEMPTS = 4` times with a growing pause (`RETRY_BACKOFF`).
- With a known size the file is preallocated and downloaded in `PART_SIZE = 4 MB` parts by `DOWNLOAD_WORKERS = 8` threads. Each part **resumes from its own last byte** after a drop. `MAX_STALLS = 8` in a row without progress gives up.
- A `401/403/410` on a part means the signed CDN URL expired: `refresh()` probes again for a fresh one. A failed re-probe there is caught and counted as a stall, so it cannot escape the retry budget.
- If the server ignores Range (answers `200`), it falls back to one stream that resumes with `Range` or restarts on `200`.
- `headers_for_host()` strips `Authorization` when a request goes to another host than the original one.
- The SHA-256 of the finished file is checked against the release before anything is installed.

Live check: the real 85 MB v4.0.0 patch downloaded in 15 s with a matching SHA-256. An earlier run on the slow link showed parts resuming after timeouts.

## Pitfalls
- **Old versions cannot be fixed.** 3.x and 4.0.0 keep the old single-stream updater. Users stuck on them must install the new version with `Hell_Harvest_Setup_vX.exe` over the old one. The release notes of 4.0.1 say so.
- Tests (`core/test_updater_download.py`) run a local `ThreadingHTTPServer` that serves Range, drops connections and can drop the first probe. Use it rather than the real CDN; the CDN speed changes from hour to hour.
- When debugging slow updates on a user's machine, measure one connection against several. One slow connection is not proof the whole link is slow.
