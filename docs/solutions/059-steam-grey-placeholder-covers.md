# 059. Steam returns a grey placeholder instead of 404 for missing cover art

## Symptom
Battlefield 6 showed a flat grey cover on the dashboard and in the Game Shelf, although its Steam URLs answered HTTP 200.

## Cause
For newer games Steam keeps store art only under hashed paths
(`/steam/apps/2807960/<hash>/header.jpg`). The old unhashed paths (`library_600x900.jpg`, `header.jpg`) still answer
200 with a 1.6 KB uniform grey JPEG, so `<img onError>` never fires and the cover loader never tries the next candidate.
Image size does not help: the placeholder has the same dimensions as real art (300×450, 460×215).

## Fix
`isBlankCover()` in `src/utils/gameBoxArts.ts` draws a loaded Steam image into an 8×8 canvas and treats a luminance
range under 12 as blank. Steam's CDN sends `Access-Control-Allow-Origin: *`, so the covers load with
`crossOrigin="anonymous"` (only for `steamstatic.com` URLs; other hosts may not send CORS headers). A blank image is
handled like a load error: the Game Shelf moves to the next source, single `<img>` covers use `retryCover()`.

Checked on the UI harness (`?demo=1`): Battlefield 6 falls through to the hashed header; dark posters (EVE Online) are
not mistaken for blanks.
