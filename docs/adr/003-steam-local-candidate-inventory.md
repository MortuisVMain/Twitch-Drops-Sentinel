# 003 - Read-only local candidate subscription observations

Status: accepted for bounded diagnostic implementation; live compatibility requires separate verification.

## Context

The local library cache can suggest AppIDs but neither its presence nor its filenames establish ownership or a complete library. Full enumeration remains unresolved. The existing identity worker already isolates untrusted native output and checks the approved client build and active account.

## Decision

The opt-in `app <expectedSteamId64> <appId>` command checks one candidate using the same trusted loader, eight-second worker deadline, cleanup guards and identity checks before and after the read. It retrieves `STEAMAPPS_INTERFACE_VERSION008` at SteamClient020 slot 15, then calls subscription slot 6 and installation slot 19 using unsigned 32-bit arguments and one-byte boolean returns. These layouts were verified against Valve source-sdk-2013 commit `e1f1fd42271805072f052051c26c21caa2c87b04`; headers are reference only and are not copied. The four flag combinations use bounded worker exit codes. Public flags appear only after successful account and cleanup verification. Identity command JSON remains unchanged.

The Python adapter enumerates only canonical positive numeric `.json` filenames below an explicitly supplied Steam root, with accountID derived from validated expected SteamID64. It reads no cache contents. Reparse points, links and non-file candidates fail closed; path metadata checks reduce accidental traversal but do not claim race-proof filesystem isolation against concurrent malicious path replacement. Enumeration is limited to 10,000 directory entries, a 30-second overall budget and a maximum ten-second caller timeout per candidate. Each native worker has its own eight-second deadline. Blocking operating-system filesystem calls cannot be interrupted by this monotonic budget.

Results use source `local_cache_candidates` and are always partial for existing caches, including empty caches. Missing caches are unknown. Positive subscription is `subscribed`; negative subscription is `unknown`. Installed status supplies no ownership evidence. Labels are explicit fallback `App <id>`. Failures raise InventoryError; no incomplete successful snapshot escapes. Snapshot items can be supplied as an incomplete InventoryStore page; no complete fallback or action authorization is created by this source.

## Consequences

This diagnostic subset can miss most of a library and incurs a subprocess per candidate. It is not the production enumeration or performance solution. No game context, presence, achievements, API or UI integration is introduced. Full supported library enumeration and permanent-ownership semantics remain open.

Reference: https://github.com/ValveSoftware/source-sdk-2013/tree/e1f1fd42271805072f052051c26c21caa2c87b04/src/public/steam


## Parent termination guard

An app worker validates and retains its public parent's process handle and creation timestamp before any native call. A changed, absent or exited parent causes refusal. If Python terminates a timed-out public parent, or that parent crashes, the child observes its retained parent handle and terminates itself; this forced-exit path cannot guarantee normal native handle cleanup, and the operating system reclaims process resources. Normal results retain the existing explicit cleanup. This guard kills only the worker, never Steam. Python starts a candidate only with at least ten seconds remaining and uses a ten-second outer timeout, reserving the internal eight-second deadline and cleanup allowance. Process exit monitoring is scheduled and does not claim a hard real-time cleanup bound. A synthetic blocking child validates and retains the same parent handle, signals readiness, then the test kills its parent and verifies child exit within five seconds. No Steam DLL is loaded by that regression.
