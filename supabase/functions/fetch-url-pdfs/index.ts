import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ABLEHNUNGSTEXT,
  leseBegrenzt,
  leseTextBegrenzt,
  MAX_ANTWORT_BYTES,
  pruefeZieladresse,
  sichereAbfrage,
  ZieladresseAbgelehnt,
} from "../_shared/ziel-adresse.ts";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Holt PDF-Dateien von einer öffentlichen Adresse.
 *
 * Unterstützt:
 * - Direkte PDF-Links
 * - Öffentliche OneDrive- und SharePoint-Freigaben
 * - Öffentliche Google-Drive-Freigaben
 * - Gewöhnliche Seiten mit PDF-Links darauf
 *
 * SICHERHEIT (Audit-Befund F12, 15.09.2026)
 *
 * Die Adresse kommt vom Aufrufer. Ohne Prüfung wäre diese Function ein
 * Sprungbrett in das interne Netz: Sie ruft ab, was man ihr nennt, und gibt
 * das Geladene als base64 zurück. Damit ließen sich der Metadatendienst der
 * Cloud, die Rückschleife und die privaten Netze auslesen.
 *
 * Deshalb geht **jeder** Abruf dieser Datei über `sichereAbfrage` aus
 * `../_shared/ziel-adresse.ts`. Diese prüft die Adresse vor dem Abruf und noch
 * einmal nach jeder Weiterleitung. Wer hier eine neue Stelle einbaut, die
 * `fetch` direkt aufruft, reißt die Lücke wieder auf.
 *
 * Besonders wichtig ist das bei den Adressen, die nicht aus dem Aufruf, sondern
 * aus einer fremden Antwort stammen: die Download-Links aus der OneDrive-API
 * und die Links, die aus einer abgerufenen HTML-Seite ausgelesen werden. Sie
 * sind genauso wenig vertrauenswürdig wie die Eingabe selbst.
 *
 * ZUGANG (16.09.2026)
 *
 * Die Function hat keinen Eintrag in `supabase/config.toml`, es gilt also
 * `verify_jwt = true`. Das klingt nach Schutz, ist aber kaum einer: Der
 * öffentliche anon-Schlüssel ist selbst ein gültiges, vom Projekt signiertes
 * JWT und steht im ausgelieferten Frontend-Code. Jeder, der die Seite einmal
 * geladen hat, kommt damit durch die Türsteherprüfung von Supabase.
 *
 * Deshalb verlangt `angemeldeterNutzer` unten eine echte Sitzung. Der
 * Unterschied steckt im Anspruch `role` des Tokens: Der anon-Schlüssel trägt
 * `anon`, eine angemeldete Sitzung trägt `authenticated` und gehört zu einem
 * Nutzer, den `auth.getUser()` benennen kann.
 *
 * Bewusst KEINE Rollenliste. Die einzige aufrufende Seite ist
 * `src/components/objekte/ObjektUploadAnalyse.tsx` auf `/objekte/neu` und
 * `/objekte/:id/bearbeiten`. Diese Seite ist über die Präfixlogik der
 * Seitenleiste für viele Rollen erreichbar. Eine Liste hier würde mit hoher
 * Wahrscheinlichkeit jemanden aussperren, der die Seite zu Recht benutzt.
 * Was jemand mit einem Objekt machen darf, entscheiden die Zugriffsregeln der
 * Tabellen, nicht diese Function: Sie legt nichts an, sie lädt nur Dateien
 * und gibt sie zurück.
 */

/** Grenze je Nutzer und Stunde, Begründung siehe `ANZAHL_PRO_TAG`. */
const ANZAHL_PRO_STUNDE = 15;

/**
 * Grenze je Nutzer und Tag.
 *
 * Ein Aufruf kann bis zu 20 Dateien zu je 20 MB holen (`MAX_ANTWORT_BYTES`).
 * Der Aufwand je Aufruf ist also erheblich, und genau darum geht es hier.
 *
 * Die Zahlen kommen von der echten Nutzung her. Ein Objekt anzulegen heißt
 * in der Praxis: einen Cloud-Link einfügen, abrufen, und wenn der Link nicht
 * stimmte, ein- bis zweimal nachbessern. Das sind drei bis vier Abrufe je
 * Objekt. Selbst ein ungewöhnlich voller Tag mit fünfzehn neuen Objekten
 * bleibt damit unter sechzig. Fünfzehn Abrufe in einer Stunde sind mehr, als
 * beim Anlegen von Hand zusammenkommen, und sechzig am Tag decken auch eine
 * Sammelübernahme ab.
 *
 * Wer darüber liegt, klickt nicht mehr, sondern lässt etwas laufen. Dann ist
 * die Absage richtig, auch wenn es einmal ein Mitarbeiter ist: Die
 * Wartestunde kostet ihn wenig, ein durchgelaufenes Skript kostet das Haus
 * viel.
 */
const ANZAHL_PRO_TAG = 60;

/**
 * Gibt die Kennung des angemeldeten Nutzers zurück, sonst null.
 *
 * Nach dem Muster von `istInternerNutzer` in
 * `supabase/functions/finalize-reservierung/index.ts`: Ein Client mit dem
 * anon-Schlüssel, dem der fremde Authorization-Header mitgegeben wird,
 * beantwortet über `auth.getUser()`, zu welchem Nutzer das Token gehört.
 *
 * Der Vergleich mit dem anon-Schlüssel steht davor, weil dieser Schlüssel
 * ein gültiges Token ist, aber zu keinem Nutzer gehört. `auth.getUser()`
 * würde ihn ohnehin ohne Nutzer beantworten, der ausdrückliche Vergleich
 * spart den Netzweg und macht die Absicht im Code sichtbar.
 *
 * Die Rolle wird bewusst nicht geprüft, siehe Kopf der Datei.
 */
async function angemeldeterNutzer(req: Request): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      console.error("SUPABASE_URL oder SUPABASE_ANON_KEY fehlt");
      return null;
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return null;
    // Der öffentliche Schlüssel allein ist kein Nachweis, siehe oben.
    if (jwt === anonKey) return null;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data } = await userClient.auth.getUser();
    return data?.user?.id ?? null;
  } catch (e) {
    console.error("Anmeldeprüfung fehlgeschlagen:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  /*
   * Erst die Anmeldung, dann alles andere. Vor dieser Zeile wird nichts
   * abgerufen und nichts gelesen, damit ein Fremder nicht einmal den Aufwand
   * des Einlesens der Nutzlast auslösen kann.
   */
  const nutzerId = await angemeldeterNutzer(req);
  if (!nutzerId) {
    console.warn("Abruf ohne angemeldete Sitzung abgelehnt");
    return new Response(
      JSON.stringify({ error: "Bitte melde dich an, um Dateien von einem Link zu holen." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  /*
   * Das Kontingent hängt am Nutzer, nicht an der IP. Im Büro teilen sich
   * mehrere Mitarbeiter eine Adresse, eine IP-Grenze würde sie gegenseitig
   * ausbremsen. Umgekehrt nützt einem Angreifer der Wechsel der Leitung
   * nichts, solange er nur ein Konto hat.
   */
  const kontingent = await checkEdgeRateLimit({
    scope: "fetch-url-pdfs",
    key: nutzerId,
    perHour: ANZAHL_PRO_STUNDE,
    perDay: ANZAHL_PRO_TAG,
  });
  if (!kontingent.ok) {
    console.warn("Kontingent erschöpft für Nutzer", nutzerId, kontingent.reason);
    return new Response(
      JSON.stringify({
        error:
          "Du hast in kurzer Zeit sehr viele Links abgerufen. Bitte versuch es später noch einmal.",
      }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL ist erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /*
     * Die Eingabe wird abgewiesen, bevor irgendetwas abgerufen wird. Der Grund
     * steht nur im Serverprotokoll: Bekäme der Aufrufer zu hören, woran es
     * gelegen hat, wäre die Function ein bequemes Werkzeug, um das interne Netz
     * abzutasten.
     */
    const pruefung = pruefeZieladresse(url);
    if (!pruefung.erlaubt) {
      console.warn("Zieladresse abgelehnt:", pruefung.grund, pruefung.hinweis);
      return new Response(
        JSON.stringify({ error: ABLEHNUNGSTEXT }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Fetching URL:", url);

    const pdfs: Array<{ name: string; base64: string }> = [];

    if (isOneDriveLink(url)) {
      console.log("Detected OneDrive link");
      const oneDrivePdfs = await fetchOneDrivePdfs(url);
      pdfs.push(...oneDrivePdfs);
    } else if (isGoogleDriveLink(url)) {
      console.log("Detected Google Drive link");
      const gdPdfs = await fetchGoogleDrivePdfs(url);
      pdfs.push(...gdPdfs);
    } else {
      // Zuerst als direkte PDF-Datei versuchen
      console.log("Trying direct PDF download");
      const directPdf = await tryDirectPdfDownload(url);
      if (directPdf) {
        pdfs.push(directPdf);
      } else {
        // Sonst die Seite nach PDF-Links durchsuchen
        console.log("Trying to scrape page for PDF links");
        const scrapedPdfs = await scrapePageForPdfs(url);
        pdfs.push(...scrapedPdfs);
      }
    }

    if (pdfs.length === 0) {
      console.log("No PDFs found for URL:", url);
      return new Response(
        JSON.stringify({ error: "Keine PDF-Dateien unter dieser URL gefunden. Stelle sicher, dass der Link öffentlich zugänglich ist und PDF-Dateien enthält." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Found ${pdfs.length} PDFs`);
    return new Response(
      JSON.stringify({ pdfs, count: pdfs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error:", err);
    /*
     * Eine abgelehnte Zieladresse kann auch mitten in einer Weiterleitungskette
     * auftauchen. Auch dann bekommt der Aufrufer nur den allgemeinen Satz.
     */
    if (err instanceof ZieladresseAbgelehnt) {
      console.warn("Zieladresse abgelehnt:", err.grund, err.hinweis);
      return new Response(
        JSON.stringify({ error: ABLEHNUNGSTEXT }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function isOneDriveLink(url: string): boolean {
  return /onedrive\.live\.com|1drv\.ms|sharepoint\.com/i.test(url);
}

function isGoogleDriveLink(url: string): boolean {
  return /drive\.google\.com/i.test(url);
}

/**
 * Lädt eine Adresse und gibt sie zurück, wenn ein PDF herauskommt.
 *
 * Fehler werden bewusst geschluckt, weil diese Funktion in Schleifen über
 * viele gefundene Links läuft. Eine abgelehnte Zieladresse ist dabei kein
 * Abbruchgrund, sondern nur ein übersprungener Link: Eine Seite darf einen
 * Link auf 127.0.0.1 enthalten, sie bekommt ihn nur nicht abgerufen.
 */
async function tryDirectPdfDownload(url: string): Promise<{ name: string; base64: string } | null> {
  try {
    const { antwort, endgueltigeUrl } = await sichereAbfrage(url);
    const contentType = antwort.headers.get("content-type") || "";

    if (!contentType.includes("application/pdf")) {
      // Körper verwerfen, sonst bleibt die Verbindung offen.
      await antwort.body?.cancel().catch(() => {});
      return null;
    }

    const rohdaten = await leseBegrenzt(antwort, MAX_ANTWORT_BYTES);
    if (!rohdaten) {
      console.log("PDF too large, skipping");
      return null;
    }
    const base64 = uint8ArrayToBase64(rohdaten);
    const name = extractFileNameFromUrl(endgueltigeUrl) || extractFileNameFromUrl(url) || "dokument.pdf";
    return { name, base64 };
  } catch (e) {
    if (e instanceof ZieladresseAbgelehnt) {
      console.warn("Link übersprungen, Zieladresse abgelehnt:", e.grund, e.hinweis);
    }
    return null;
  }
}

async function fetchOneDrivePdfs(url: string): Promise<Array<{ name: string; base64: string }>> {
  const pdfs: Array<{ name: string; base64: string }> = [];

  // Die eigentliche Freigabeadresse steckt bei manchen Links im redeem-Parameter
  const resolvedUrl = extractRedeemUrl(url) || url;
  console.log("Resolved OneDrive URL:", resolvedUrl);

  try {
    // Der API-Weg funktioniert bei öffentlichen Freigaben am besten
    const apiPdfs = await tryOneDriveApi(resolvedUrl);
    if (apiPdfs.length > 0) {
      pdfs.push(...apiPdfs);
      return pdfs;
    }

    // Wenn die ursprüngliche Adresse abweicht, denselben Weg noch einmal damit
    if (resolvedUrl !== url) {
      const apiPdfs2 = await tryOneDriveApi(url);
      if (apiPdfs2.length > 0) {
        pdfs.push(...apiPdfs2);
        return pdfs;
      }
    }

    // Rückfall: Die Freigabeseite laden und die eingebetteten Dateiangaben lesen
    console.log("API approach failed, trying HTML scrape");
    const { antwort, endgueltigeUrl } = await sichereAbfrage(resolvedUrl);
    const html = await leseTextBegrenzt(antwort);
    const pdfLinks = extractPdfLinksFromHtml(html, endgueltigeUrl);

    for (const link of pdfLinks.slice(0, 20)) {
      try {
        const pdf = await tryDirectPdfDownload(link.url);
        if (pdf) {
          pdf.name = link.name || pdf.name;
          pdfs.push(pdf);
        }
      } catch (e) {
        console.log(`Failed to download ${link.url}:`, e);
      }
    }
  } catch (e) {
    console.error("OneDrive fetch error:", e);
  }

  return pdfs;
}

/**
 * Liest die eigentliche Freigabeadresse aus dem redeem-Parameter.
 *
 * Das Ergebnis ist eine Adresse aus fremder Hand und wird deshalb gleich hier
 * geprüft. Sonst käme sie zwar nur bis zur nächsten Prüfung, aber sie würde
 * vorher noch als base64 in eine API-Adresse eingebaut.
 */
function extractRedeemUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const redeem = parsed.searchParams.get("redeem");
    if (!redeem) return null;
    // Der redeem-Parameter ist base64url-kodiert
    const padded = redeem + "=".repeat((4 - (redeem.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    console.log("Decoded redeem URL:", decoded);
    if (!pruefeZieladresse(decoded).erlaubt) {
      console.warn("redeem-Adresse abgelehnt");
      return null;
    }
    return decoded;
  } catch (e) {
    console.log("Failed to decode redeem param:", e);
    return null;
  }
}

async function tryOneDriveApi(shareUrl: string): Promise<Array<{ name: string; base64: string }>> {
  const pdfs: Array<{ name: string; base64: string }> = [];

  try {
    // Die Freigabeadresse wird für die API base64-kodiert
    const encodedUrl = btoa(shareUrl)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const apiBase = `https://api.onedrive.com/v1.0/shares/u!${encodedUrl}`;

    // Den freigegebenen Eintrag oder Ordner holen
    const { antwort: resp } = await sichereAbfrage(`${apiBase}/driveItem`);

    if (!resp.ok) {
      await resp.body?.cancel().catch(() => {});
      // Zweiter Versuch als Wurzelordner
      const { antwort: rootResp } = await sichereAbfrage(`${apiBase}/root/children`);

      if (rootResp.ok) {
        const data = await leseJson(rootResp);
        const items = data?.value || [];
        for (const item of items) {
          if (item.name?.toLowerCase().endsWith(".pdf") && item["@content.downloadUrl"]) {
            const pdf = await downloadPdfFromUrl(item["@content.downloadUrl"], item.name);
            if (pdf) pdfs.push(pdf);
          }
        }
      } else {
        await rootResp.body?.cancel().catch(() => {});
      }
      return pdfs;
    }

    const item = await leseJson(resp);
    if (!item) return pdfs;

    // Einzelne Datei
    if (item.file && item.name?.toLowerCase().endsWith(".pdf") && item["@content.downloadUrl"]) {
      const pdf = await downloadPdfFromUrl(item["@content.downloadUrl"], item.name);
      if (pdf) pdfs.push(pdf);
      return pdfs;
    }

    // Ordner: Inhalt auflisten
    if (item.folder) {
      const { antwort: childrenResp } = await sichereAbfrage(`${apiBase}/driveItem/children`);
      if (childrenResp.ok) {
        const data = await leseJson(childrenResp);
        const items = data?.value || [];
        for (const child of items) {
          if (child.name?.toLowerCase().endsWith(".pdf") && child["@content.downloadUrl"]) {
            const pdf = await downloadPdfFromUrl(child["@content.downloadUrl"], child.name);
            if (pdf) pdfs.push(pdf);
          }
        }
      } else {
        await childrenResp.body?.cancel().catch(() => {});
      }
    }
  } catch (e) {
    console.log("OneDrive API error (non-fatal):", e);
  }

  return pdfs;
}

/** Liest eine JSON-Antwort mit Größengrenze. */
async function leseJson(antwort: Response): Promise<any | null> {
  const text = await leseTextBegrenzt(antwort);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Lädt eine Datei über eine Adresse, die aus einer fremden Antwort stammt.
 *
 * Auch diese Adresse ist nicht vertrauenswürdig: Sie kommt aus der Antwort der
 * OneDrive-API, und wer die Freigabeadresse bestimmt, bestimmt mittelbar auch,
 * welcher Dienst hier antwortet. Deshalb derselbe geprüfte Weg wie überall.
 */
async function downloadPdfFromUrl(downloadUrl: string, name: string): Promise<{ name: string; base64: string } | null> {
  try {
    const { antwort } = await sichereAbfrage(downloadUrl);
    if (!antwort.ok) {
      await antwort.body?.cancel().catch(() => {});
      return null;
    }
    const rohdaten = await leseBegrenzt(antwort, MAX_ANTWORT_BYTES);
    if (!rohdaten) return null;
    return { name, base64: uint8ArrayToBase64(rohdaten) };
  } catch (e) {
    if (e instanceof ZieladresseAbgelehnt) {
      console.warn("Download übersprungen, Zieladresse abgelehnt:", e.grund, e.hinweis);
    }
    return null;
  }
}

async function fetchGoogleDrivePdfs(url: string): Promise<Array<{ name: string; base64: string }>> {
  const pdfs: Array<{ name: string; base64: string }> = [];

  // Datei-Kennung aus der Google-Drive-Adresse lesen
  const fileMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);

  if (fileMatch) {
    const fileId = fileMatch[1];
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const pdf = await tryDirectPdfDownload(downloadUrl);
    if (pdf) pdfs.push(pdf);
  } else if (folderMatch) {
    // Ordner lassen sich ohne API-Schlüssel nicht auflisten
    console.log("Google Drive folder detected - direct folder listing requires API auth");
  }

  return pdfs;
}

async function scrapePageForPdfs(url: string): Promise<Array<{ name: string; base64: string }>> {
  const pdfs: Array<{ name: string; base64: string }> = [];

  try {
    const { antwort, endgueltigeUrl } = await sichereAbfrage(url);
    const html = await leseTextBegrenzt(antwort);
    const links = extractPdfLinksFromHtml(html, endgueltigeUrl);

    for (const link of links.slice(0, 10)) {
      const pdf = await tryDirectPdfDownload(link.url);
      if (pdf) {
        pdf.name = link.name || pdf.name;
        pdfs.push(pdf);
      }
    }
  } catch (e) {
    console.log("Scrape error:", e);
  }

  return pdfs;
}

function extractPdfLinksFromHtml(html: string, baseUrl: string): Array<{ url: string; name: string }> {
  const links: Array<{ url: string; name: string }> = [];
  const seen = new Set<string>();

  /*
   * Die gefundenen Links stammen aus fremdem HTML. Sie werden schon hier
   * aussortiert, nicht erst beim Abruf: Ein Link auf file:///etc/passwd oder
   * auf 169.254.169.254 hat in der Liste nichts verloren, und so steht der
   * Grund gleich an der Stelle im Protokoll, an der er entsteht.
   */
  const aufnehmen = (roh: string | null, name: string) => {
    if (!roh || seen.has(roh)) return;
    seen.add(roh);
    if (!pruefeZieladresse(roh).erlaubt) {
      console.warn("PDF-Link aus der Seite verworfen, Zieladresse nicht erlaubt");
      return;
    }
    links.push({ url: roh, name });
  };

  // href-Angaben, die auf PDFs zeigen
  const hrefRegex = /href=["']([^"']*\.pdf[^"']*)/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = resolveUrl(match[1], baseUrl);
    aufnehmen(href, (href && extractFileNameFromUrl(href)) || "dokument.pdf");
  }

  // src-Angaben, die auf PDFs zeigen
  const srcRegex = /src=["']([^"']*\.pdf[^"']*)/gi;
  while ((match = srcRegex.exec(html)) !== null) {
    const src = resolveUrl(match[1], baseUrl);
    aufnehmen(src, (src && extractFileNameFromUrl(src)) || "dokument.pdf");
  }

  // Download-Adressen in OneDrive-artigen Datenattributen
  const downloadRegex = /download[Uu]rl["'\s:=]+["']([^"']+)/gi;
  while ((match = downloadRegex.exec(html)) !== null) {
    aufnehmen(resolveUrl(match[1], baseUrl), "dokument.pdf");
  }

  return links;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractFileNameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    const last = parts[parts.length - 1];
    if (last && last.toLowerCase().includes(".pdf")) {
      return decodeURIComponent(last);
    }
    return null;
  } catch {
    return null;
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  // In Stücken, damit der Aufrufstapel bei großen Dateien nicht überläuft.
  const schritt = 0x8000;
  for (let i = 0; i < bytes.length; i += schritt) {
    binary += String.fromCharCode(...bytes.subarray(i, i + schritt));
  }
  return btoa(binary);
}
