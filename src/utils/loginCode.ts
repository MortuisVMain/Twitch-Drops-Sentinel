// Helpers for the Twitch device-login banner. No imports, so the test gate can bundle the file on its own.

const COPY_ENDPOINT = 'http://127.0.0.1:28492/api/clipboard/copy';

export interface ClipboardLike {
  writeText: (text: string) => Promise<void>;
}

// The service copies through Windows itself (WebView2 often refuses navigator.clipboard); the browser API is the fallback.
// Resolves to false, never throws: the caller tells the user to select the code by hand.
export const copyText = async (
  text: string,
  fetchImpl: typeof fetch = fetch,
  clipboard: ClipboardLike | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
): Promise<boolean> => {
  try {
    const res = await fetchImpl(COPY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (!body || body.status === 'ok') return true;
    }
  } catch (err) {
    console.warn('copyText: сервис недоступен, пробуем буфер браузера', err);
  }
  try {
    if (clipboard) {
      await clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('copyText: буфер браузера отказал', err);
  }
  return false;
};

// Twitch pre-fills the code field when it is passed as ?device-code=
export const activateUrl = (uri: string | null | undefined, code: string): string => {
  const base = uri && /^https?:\/\//.test(uri) ? uri : 'https://www.twitch.tv/activate';
  if (!code || /[?&]device-code=/.test(base)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}device-code=${encodeURIComponent(code)}`;
};
