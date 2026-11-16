# ADR 005 — Per-launch secret for the local API

**Date** 2026-11-16  
**Status** Accepted

## Context

The service listens on 127.0.0.1:28492. Origin and Host checks keep foreign web pages out, but a request without an `Origin` header was always accepted, because the desktop shell and local tools send none. Any program on the machine could therefore set the Steam IDLE acknowledgements, start writing achievements to the Steam account, shut the app down or reset the settings. A security review rated this MEDIUM.

## Decision

Each launch of the desktop host creates 32 random bytes (URL-safe base64, 43 characters) and gives them to the service child only through the environment variable `SENTINEL_API_TOKEN`: never on the command line, never on disk, never in a log. The service reads the variable once at start and removes it from its own environment, so the engine and helper processes it spawns do not inherit it.

When the variable is set, every HTTP request and the WebSocket must carry the secret, compared in constant time:

- header `X-Sentinel-Token` on normal requests;
- query parameter `token` only on `/ws` and `/api/v1/giveaways/stream`, because WebSocket and EventSource cannot send headers;
- a CORS preflight (`OPTIONS`) needs no secret, since browsers send no custom headers on it, but it still passes the Origin and Host checks, which run first for every request.

A missing or wrong secret gets `401 {"error": "unauthorized"}` and a log line without the value. When the variable is not set (developer runs with the Vite server, the test suite's sandbox service, a patched core paired with an older executable) the service behaves as before, and logs once at start which mode is active.

The host hands the secret to the page with a script registered before the first navigation (`AddScriptToExecuteOnDocumentCreatedAsync`). The script defines a read-only `window.__SENTINEL_TOKEN` only when `location.origin` is the app's own origin. One small module wraps `window.fetch` so that requests to the service carry the header, and a helper appends the query parameter for the WebSocket and EventSource addresses. The host's own health probes and its shutdown call send the header too.

## Alternatives considered

- Checking only the process that connects (loopback peer lookup). It is racy and does not distinguish two programs of the same user.
- A secret in a file next to the executable. Any local reader could pick it up, and it would outlive the launch.
- A named pipe instead of TCP. It would remove the page's `fetch` and `WebSocket` access and needs a rewrite of every call site.

## Consequences

This blocks other local processes and browser pages that call the API without the per-launch secret. It does not stop a process running as the same Windows user that reads the memory or the environment of the app, or attaches a debugger to it; that attacker already has the user's own access. The fallback page shown when `dist/index.html` is missing runs on an opaque origin, gets no secret and already could not talk to the service. A page opened from the development server has no secret either, so development runs the service without one.
