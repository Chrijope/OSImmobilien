/**
 * Frueher das Zaehlpixel fuer die Vertragsmails an Bewerber.
 *
 * Seit dem 26.09.2026 zaehlt es nichts mehr. Nach Einschaetzung der
 * Rechtspruefung braucht ein Oeffnungspixel eine Einwilligung (Paragraf 25
 * TDDDG), die wir nicht einholen. Neue Mails tragen kein Pixel mehr; gezaehlt
 * wird nur noch der Aufruf des persoenlichen Links (signature_requests.link_opened_at).
 *
 * Die Function bleibt stehen, weil bereits verschickte Mails die Adresse noch
 * enthalten. Sie liefert weiter ein leeres Bild, damit diese Mails kein
 * kaputtes Bild zeigen, schreibt aber nichts mehr in die Datenbank.
 */

// 1x1 transparentes GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const pixelHeaders = {
  "Content-Type": "image/gif",
  "Content-Length": String(PIXEL.length),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Access-Control-Allow-Origin": "*",
};

Deno.serve(() => new Response(PIXEL, { status: 200, headers: pixelHeaders }));
