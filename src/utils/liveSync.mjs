// HTTP /api/state polling is only a fallback: while the WebSocket is open and recently heard from it delivers the state.
// The service broadcasts about every 5 s, so more than 12 s of silence means the socket is stuck.
export const WS_SILENCE_MS = 12000;
export const shouldPollHttp = (wsOpen, msSinceLastMessage = 0) => !wsOpen || msSinceLastMessage > WS_SILENCE_MS;
