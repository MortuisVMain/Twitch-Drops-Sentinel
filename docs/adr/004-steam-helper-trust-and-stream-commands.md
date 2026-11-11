# 004 - Steam helper trust by Authenticode signature, and the apps and hold stream commands

Status: accepted for implementation; live behaviour requires separate verification on the disposable test account.

## Context

The helper loads `steamclient64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll` from the user's Steam install by absolute path. Trust was a pinned SHA-256 for four files, including `steam.exe`, which is valid for one client build only: every Steam update made the helper fail closed until someone re-pinned. A comment also claimed Authenticode verification that did not exist. Two further gaps: the identity worker had no parent-death watchdog, and `Dispose()` of the native wrapper could throw and mask the original exception. Farming needs many AppIDs and a way to show presence, and one process per AppID is too slow and too chatty for that.

## Decision

Trust: each library that will be loaded must pass `WinVerifyTrust` and its leaf signer must be Valve (subject CN and O both `Valve Corp.`, matched on name, never on thumbprint, so certificate renewals keep working). Verification runs on the same locked file handle (`FileShare.Read`) that stays open until the load, so the file cannot be swapped between check and load. Revocation checking is off and URL retrieval is cache-only, so no network is touched. Rejection codes: `client_build_unverified` (unsigned, tampered, verifier failure) and `client_signer_untrusted` (valid signature, other signer). The verifier sits behind `ISignatureReader` so policy is tested with fakes, plus one real-API check. Directory locking, reparse-point rejection, fixed-drive and canonical-path checks, and the `steam.exe` image-name and session checks stay; the `steam.exe` hash is dropped.

Hardening: every worker mode validates the retained parent handle and creation time. `Dispose()` records a failed library release in `ReleaseFailed`, which becomes `client_library_release_failed` in the result.

Streams: protocolVersion is 2. `apps <steamid64>` reads up to 10000 decimal AppIDs from stdin and uses one worker: one connection, one identity check, then flags per AppID. The parent accepts only fixed-shape JSON lines (shape, appId, order), buffers them and prints them only after `complete`; otherwise it prints one `failed` line. Total timeout is 60 s with the worker tree killed. `hold <steamid64> <appid>` is the only path that starts a worker with `SteamAppId` set; the inherited-context guard still applies to the hold parent and to every other worker. The worker confirms identity and subscription, prints `holding`, and keeps the pipe and user open until stdin EOF or `stop`, then releases and prints `released`. Reaching `holding` is limited to 8 s. On parent death the worker releases its handles, with a 3 s forced exit.

## Trade-offs

Signature trust follows Valve's signing identity rather than a build, so it accepts any Valve-signed build, including older ones. A cold certificate cache with a missing intermediate fails closed because network retrieval is disabled. Buffering apps output delays the first line but guarantees no data from an unconfirmed session. Idle presence is held by a long-lived helper process that the controller must supervise.

## Consequences

Steam updates no longer break the helper. Exit-code table gains `client_signer_untrusted` at the end. The Python layer must speak protocol 2, use stdin streaming for `apps`, and treat `hold` as a supervised process. Offline checks cover policy, protocol validation, call order and release on every path with a fake native layer. Real Steam behaviour (signature of the installed files, `SteamAppId` presence effect) remains verifiable only live.
