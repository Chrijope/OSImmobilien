import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istEigenesWeiterleitungsziel, istZaehlmarke } from "../_shared/mail-zaehlung.ts";

/**
 * Linkzählung für die Bewerbermails.
 *
 * Seit dem 26.09.2026 zählt hier nur noch der Aufruf eines Links
 * (`mode=click`), kein Öffnungspixel mehr. Ein Öffnungspixel braucht nach
 * Einschätzung der Rechtsprüfung eine Einwilligung (§ 25 TDDDG).
 *
 *   - `mode=click&url=...` zählt und leitet weiter, nur auf eigene Adressen,
 *     siehe `istEigenesWeiterleitungsziel`. Gebraucht vom Startfahrplan-PDF.
 *   - `mode=click` ohne `url` zählt nur. So meldet die Seite hinter dem Link
 *     ihre Zählmarke, siehe `_shared/mail-zaehlung.ts`.
 *   - alles andere ist das Pixel bereits verschickter Mails: leeres Bild,
 *     gezählt wird nichts mehr.
 */

// 1x1 transparent GIF
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

const leerHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const mode = url.searchParams.get("mode") || "open";
  const ziel = url.searchParams.get("url");

  if (mode !== "click") return new Response(PIXEL, { status: 200, headers: pixelHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (ziel && !istEigenesWeiterleitungsziel(ziel, supabaseUrl)) {
    return new Response("Dieses Ziel wird nicht weitergeleitet.", {
      status: 400,
      headers: { ...leerHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (istZaehlmarke(token)) {
    try {
      const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabase.rpc("mark_bewerber_mail_clicked", { _token: token });
    } catch (e) {
      // Best effort: Die Weiterleitung darf an der Zählung nie scheitern.
      console.error("track-bewerber-mail error", e);
    }
  }

  if (ziel) return new Response(null, { status: 302, headers: { ...leerHeaders, Location: ziel } });
  return new Response(null, { status: 204, headers: leerHeaders });
});
