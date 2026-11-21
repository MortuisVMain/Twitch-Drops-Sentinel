# Steam IDLE: G0 progress

Objective: implement the Steam IDLE plan in order, using one bounded implementation subagent at a time and independent reviews. The user authorized starting implementation and use of a dedicated test account. Credentials stay out of this document, source, tests and subagent briefs. Account actions have not been performed in G0a.

Status as of 2026-11-11. G0a is complete. G0b has a local identity adapter with passing offline checks and awaits live validation. The user chose to keep the main Steam account active and run offline tests only. G0 remains open.

## G0a — installation diagnostic

The standalone Windows probe is in [tools/steam_idle_probe](../tools/steam_idle_probe). It uses .NET 10 and the Windows registry and PE metadata APIs. This slice introduces no external package dependency or Valve binary and incorporates no source or binaries from SAM, SGI or Idle Master. It does not launch Steam, load Steam DLLs, connect to the client or servers, read cookies or emit an account ID. The existing Python scanner remains the app's local installed-game scanner; the probe does not enumerate games.

```powershell
dotnet build tools/steam_idle_probe -c Release
dotnet run --project tools/steam_idle_probe/checks -c Release
dotnet run --project tools/steam_idle_probe -c Release -- probe
```

Invoke the built console with exactly one argument, `probe`. The executable writes one newline-terminated JSON object to stdout and exits. The command is one-shot and does not read stdin; a future supervisor should enforce a deadline and terminate/reap the child if the OS stalls. Build and restore output are outside the executable's protocol.

| Field | Meaning |
| --- | --- |
| `protocolVersion` | Integer `1` |
| `installation.status` | `detected` if a registry candidate contains a readable PE at `steam.exe`; `not_detected` if checked candidates contained no executable; `unknown` if discovery could not reach either conclusion |
| `installation.client`, `runtime32`, `runtime64` | Metadata for `steam.exe`, `steamclient.dll`, `steamclient64.dll`; each is null if not inspected, or has a status of `readable`, `missing`, `invalid_pe`, or `unreadable`. Readable entries include PE machine and numeric file version; `0.0.0.0` can mean no version resource |
| `identity` | `no_registry_hint` if the current-user ActiveUser value is absent or zero; `unverified_registry_hint` for a nonzero DWORD; `unknown` if unreadable or of an unexpected type. No value proves that Steam is running or an account is authenticated |
| `clientConnection`, `steamOperations` | `not_attempted`, `unsupported` in G0a |
| `error` | Null on exit 0 (which includes installation not detected); `invalid_command` on exit 2 (response contains only version and error); `discovery_incomplete` or `unsupported_os` on exit 3 |

Discovery checks the user Steam path and both available machine registry views. These locations are hints; an installation outside them can be missed. The probe does not emit paths, raw arguments, registry values or exception text. Finding a readable PE proves neither its signature nor its compatibility with a future adapter.

Verification: the offline check exercises missing and corrupt fixtures, registry identity classification, rejected UNC roots, independent runtime status, and subprocess output framing and exit without closing stdin. A local read-only run detected an x64 client, x86 and x64 runtime files, and an unverified registry hint. No client connection, ownership, presence, achievement or authentication was tested.

## G0b — local client identity experiment

The opt-in `identity <expectedSteamId64>` command accepts a nonzero public individual desktop Steam ID. It starts a short-lived worker with an eight-second deadline. The worker checks the active registry account and PID, confirms the process is in its Windows session, and checks the file hashes before loading the approved DLLs. It connects to the client's existing global user through a new pipe. It checks `BLoggedOn` and compares `GetSteamID` against the expected ID twice, rechecks the active account and PID, then releases the user, pipe and DLLs. The JSON reports the match status and a stable error code. Steam IDs and native output are omitted. The argument can be visible to local process inspection, so pass only the public Steam ID. The result describes the client observation at that time. [Valve ISteamClient](https://partner.steamgames.com/doc/api/ISteamClient) · [Valve ISteamUser](https://partner.steamgames.com/doc/api/ISteamUser)

The adapter uses the Windows x64 C++ ABI for `SteamClient020` and `SteamUser023`, pinned to the interface layout in Valve's Source SDK 2013 repository at commit `e1f1fd42271805072f052051c26c21caa2c87b04`. The SDK headers are reference material under Valve's Source SDK license. The project contains independently written interop declarations and a synthetic ABI fixture. At runtime it uses only the existing Steam installation's binaries, distributed by Valve. The probe package contains no SDK headers or Steam binaries. [Valve interface headers](https://github.com/ValveSoftware/source-sdk-2013/tree/e1f1fd42271805072f052051c26c21caa2c87b04/src/public/steam) · [Source SDK license](https://github.com/ValveSoftware/source-sdk-2013/blob/e1f1fd42271805072f052051c26c21caa2c87b04/LICENSE)

This experiment accepts the locally inspected build only. Windows Authenticode reported `Valid` and `Valve Corp.` for `steam.exe`, `steamclient64.dll`, `tier0_s64.dll` and `vstdlib_s64.dll`. The adapter pins those four SHA-256 digests and locks the files while using them. PE metadata identified the two supporting Valve DLLs and the exported `CreateInterface` entry point. The worker preloads the two supporting DLLs by absolute path, with remaining static import resolution restricted to System32. A changed Steam build requires fresh validation. Runtime loader behavior and compatibility of the installed client remain open.

The worker passes no AppID, rejects inherited game context and calls only the interface factory, identity methods and handle lifecycle methods. Each child result maps to a stable redacted status. On timeout or cancellation the parent terminates only its worker and waits up to one additional second for it to exit. A failure to terminate or confirm exit is reported as `worker_cleanup_failed`. The command exits 0 for `expected_account_confirmed`, 2 for invalid syntax or Steam ID, or 4 for an unverified observation. The probe reports `steamOperations: unsupported`. Owned inventory, cards, achievements and game presence are outside this experiment. [Architecture decision](adr/002-steam-local-identity-probe.md)

Offline verification used a fake native interface for account guards, wrong and changing IDs, offline and unsupported responses, and cleanup ordering and failure. It used separate synthetic workers for abnormal exit, output redaction, timeout and cancellation. The public command also ran with a synthetic `SteamAppId` and exited before opening Steam. The C++ fixture checked the hidden return buffer for a nontrivial eight-byte class using MSVC x64. The Steam DLLs were inspected as files. No Steam DLL was loaded for the tests and no live connection or presence comparison was performed.

```powershell
dotnet build tools/steam_idle_probe -c Release
dotnet run --project tools/steam_idle_probe/checks -c Release
```

To repeat the ABI check, run the following in an x64 Visual Studio Developer PowerShell from the repository root. The compiled DLL is the synthetic fixture.

```powershell
$fixtureDir = New-Item -ItemType Directory (Join-Path $env:TEMP ('steam-probe-abi-' + [guid]::NewGuid()))
$fixtureDll = Join-Path $fixtureDir.FullName NativeAbiFixture.dll
cl.exe /nologo /LD /W4 /WX /O2 "/Fo$($fixtureDir.FullName)/NativeAbiFixture.obj" "/Fe$fixtureDll" tools/steam_idle_probe/checks/NativeAbiFixture.cpp /link "/IMPLIB:$($fixtureDir.FullName)/NativeAbiFixture.lib"
if ($LASTEXITCODE -ne 0) { throw 'Native ABI fixture compilation failed' }
dotnet run --project tools/steam_idle_probe/checks -c Release -- --abi $fixtureDll
```

## Acceptance evidence — 2026-11-10

- Primary agent reran Release build (`--no-restore`), offline checks, and the built `probe` (`--no-build`): all exit 0; build has zero warnings/errors. Probe reported readable client x64 and runtime x86/x64 version 11.15.70.27, identity hint unverified, connection not attempted, operations unsupported.
- Independent code review and C# review found no actionable issues. The C# reviewer also ran `dotnet format --verify-no-changes --no-restore` successfully. This does not establish live Steam API compatibility.
- Offline coverage includes missing/corrupt metadata and CLI framing/lifecycle. Actual Windows registry permission failures and every possible malformed PE offset were not exhaustively exercised.
- At this checkpoint the next step was selecting the local identity adapter. The G0b section records the selected design and the subsequent offline evidence.

## Acceptance evidence — 2026-11-11 (G0b offline)

- User explicitly chose to keep the main Steam account active and run offline tests only. No account switching, credential access, real Steam DLL loading or client connection was performed in this milestone.
- General code review found no actionable issues. C# review found that an exception while killing a timed-out worker could escape the JSON protocol and that exit confirmation was unchecked. The regression was reproduced, fixed, and independently re-reviewed. Termination failures now report `worker_cleanup_failed`; timeout/cancellation fixtures verify actual process exit through retained handles.
- Primary agent reran `dotnet build tools/steam_idle_probe -c Release --no-restore` after the final code edit: exit 0, zero warnings/errors. `dotnet run --project tools/steam_idle_probe/checks -c Release --no-build` passed with exit 0.
- The dedicated C++ reviewer hit a model quota before reviewing. A separate fallback reviewer inspected the synthetic fixture and production delegate, compiled the fixture with MSVC x64 `/LD /W4 /WX /O2`, and ran the ABI check successfully. Primary agent repeated the `--abi` check against that synthetic DLL: exit 0. No actual Steam binary was loaded by those tests.
- UTF-8 without BOM validation passed for all 14 source/test/project/progress/decision files in the scoped change. Native compatibility, actual dependency loading, and presence behavior on the installed Steam client remain unverified.
- Current state: G0a complete; G0b implementation and offline acceptance complete; G0 live feasibility still pending. Next dependent step is a controlled identity-only check after the user permits switching to the disposable account. Until then, keep all account operations disabled and use synthetic providers for independent work.

## G1a — offline inventory contract foundation (2026-11-11)

- G0 live identity check succeeded on 2026-11-11 using the replacement disposable test account. This confirms the identity observation only; it does not establish library enumeration or game capabilities. No account identifiers or credentials are recorded here.
- G1a offline foundation is implemented in `core/steam_idle/inventory.py`: independently authored, provider-neutral internal pages become immutable library items/snapshots. The mappings are an adapter contract, not a claimed Steam response parser. Ownership/subscription evidence and installed state are separate required fields.
- A complete empty library requires an explicit terminal complete page and successful iterator exhaustion. Missing pages remain unknown; truncated/unverified pages remain partial. Invalid fields, conflicting duplicate AppIDs, repeated/mismatched cursors, oversized inputs and provider failures raise `InventoryError`. Identical duplicates collapse deterministically and items sort by AppID.
- The in-memory store preserves the last complete observation as explicitly stale fallback after partial/failing refreshes. A new login epoch clears it; late old-epoch results and failures cannot restore a prior account. Refreshes within one epoch must be serialized by the future caller. Stale data is historical evidence and grants no action eligibility.
- Verification: `python -m unittest core.steam_idle.test_inventory -v` passed 8 offline tests (exit 0). Initial missing-module RED and an account-switch-during-failure RED were observed before GREEN. Fixtures cover 9,000 items, invalid/bounded input, pagination, verified empty, installed without ownership, duplicates, failure retention and epoch isolation. These tests access no network, native Steam interfaces, account or application UI.
- G1a offline implementation is complete; full G1 remains open. No SQLite/config/API/UI changes were made. Real provider enumeration and its completeness/ownership semantics remain unresolved and unimplemented. Next exact step: select and document a read-only real library provider, establish its supported account context and pagination/completeness evidence, then implement a separate adapter with sanitized captured/synthetic fixtures before any authorized live enumeration.


## G1b - local candidate inventory implementation (2026-11-11)

- Added opt-in `app <expectedSteamId64> <appId>` using the pinned loader and isolated worker. Only subscription and installed flags are queried; identity is verified before and after, and cleanup failures discard flags. Public identity command contract is unchanged. Native output remains discarded and app flags use bounded exit codes.
- Added filename-only `core/steam_idle/local_inventory.py`, source `local_cache_candidates`. Explicit root and validated expected account select the cache directory. Cache contents are never read. Existing cache snapshots are partial; missing cache is unknown. Subscription is not permanent ownership, negative subscription stays unknown, installed is independent, and fallback labels are `App <id>`. Failures raise InventoryError. There are no UI/API changes or action permissions.
- Bounds: 10,000 directory entries; 30 seconds for the overall diagnostic observation; at most ten seconds per caller subprocess and eight seconds per native worker. Path metadata rejects links/reparse points, without claiming protection from concurrent malicious filesystem replacement. Full enumeration and efficient production collection remain open. See [decision 003](adr/003-steam-local-candidate-inventory.md).
- Worker evidence: missing-module Python RED was recorded before implementation; combined offline inventory suites pass 13 tests, ruff passes, Release probe build passes with zero warnings/errors. C# offline checks pass including all four flags through worker exit codes, managed ABI slot/boolean delegates, account-change and cleanup discard, context refusal and existing timeout/cancellation checks. These are synthetic checks, not native Steam compatibility evidence. No live native call was performed during implementation; independent review and any separately authorized live validation remain pending.

- Lifecycle follow-up: app workers now validate and retain their public parent's PID/start timestamp and process handle before native work, then terminate themselves if the parent dies. This prevents Python timeout from leaving a native worker alive. Forced parent-death exit uses OS process reclamation; normal native cleanup is preserved. The adapter reserves ten seconds before each spawn. Synthetic blocking-parent/child regression passed, including actual parent termination and child exit within five seconds. Combined Python suite now passes 14 tests, including refusing a candidate with insufficient cleanup budget. Scoped ruff and rebuilt C# offline checks pass (exit 0).


## G1b acceptance checkpoint - review and guarded live attempt (2026-11-11)

- C#, Python and general independent reviews approved the implementation after the scoped C# formatting correction. Primary verification repeated the Release build with zero warnings/errors and the C# offline checks, both exit 0. The combined 14 Python tests and scoped Ruff check passed with exit 0 before that formatting-only edit.
- A live Python `observe` attempt for the replacement expected test account exited 1 with `InventoryError`. A standalone `app` request exited 4 with structured `active_account_unverified`; no helper processes remained afterward. Read-only registry inspection confirmed that the active nonzero AccountID differed from the expected disposable test account. No subscription or installed-state result was accepted. Live app-query semantics and compatibility remain unvalidated.
- Next action awaits the user's choice whether to switch the active Steam client to the disposable test account. No account identifiers, account names or credentials are recorded here. Full library enumeration remains open.


## G1b live candidate verification - account mismatch resolved (2026-11-11)

- The user switched the active Steam client to the replacement disposable test account, resolving the earlier active-account mismatch. Primary executed the Python `observe` adapter against the registry-discovered Steam installation and the built Release probe. The command exited 0 in 1.74 seconds.
- The observed snapshot had source `local_cache_candidates` and status `partial`. Its four current cache candidates, AppIDs `386180`, `578080`, `1085660` and `1172470`, each returned ownership `subscribed` and installed `false`. This verifies the live candidate subscription and installed-state query for these four observations only. It establishes neither permanent ownership nor a complete library, and these cache candidates must not be assumed stable.
- A subsequent helper-process check found zero remaining `SteamIdleProbe` processes and exited 0. No source changed, farming action, achievement write or game launch occurred during this verification. Installation paths, account identifiers and credentials are omitted.
- G1b live candidate verification is complete within this diagnostic subset. Before any all-games operation, select and validate a full-enumeration provider and its supported account context; completeness and ownership semantics remain open.
