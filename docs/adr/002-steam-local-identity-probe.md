# ADR 002 — Local Steam identity probe

**Date** 2026-11-11  
**Status** Accepted for the offline prototype

## Context

The Steam installation probe reads registry and executable metadata. G0b needs a way to compare the identity reported by the existing client with the expected Steam account without initializing a game. The user authorized offline validation and chose to keep the main Steam account active.

## Decision

Use a standalone Windows x64 worker with versioned Steam client interfaces. Obtain the existing global user through `SteamClient020`, then read `BLoggedOn` and `GetSteamID` via `SteamUser023`. Require an expected public individual SteamID64, a matching active registry account and process in the same Windows session, and hash matches for the inspected Valve-signed build. The parent enforces a deadline, confirms worker exit within a bounded cleanup interval, and publishes a redacted JSON observation. [Valve interface definitions](https://github.com/ValveSoftware/source-sdk-2013/tree/e1f1fd42271805072f052051c26c21caa2c87b04/src/public/steam)

## Alternatives considered

- The registry hint is useful for preflight. It cannot independently confirm the client-reported account.
- `SteamAPI_Init` uses a game context. The identity experiment needs no AppID.
- A network session introduces a separate sign-in and credential lifecycle. That would answer a different feasibility question.

## Consequences

This prototype accepts one inspected build. Revalidate Valve signatures, DLL imports, interface ABI and hashes after a Steam update. Live client compatibility and presence behavior remain to be verified when authorized. A successful match would establish the local client observation, while inventory and game-scoped capabilities require their own evidence. [Progress and verification](../Steam%20IDLE%20Progress.md)
