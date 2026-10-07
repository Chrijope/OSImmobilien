import { supabase } from "@/integrations/supabase/client";

/**
 * Storage-Bucket-Strategie (Block 1, Schritt 1):
 *  - "objekt-medien"  → public  (Exposés, Objektfotos, Wohnungsexposés)
 *  - "objekt-dokumente" → privat (Objekt- und Wohnungsunterlagen, siehe unten)
 *  - "unterlagen"     → privat  (Kundendokumente, Finanzierung, Chat-Anhänge etc.)
 *  - "academy"        → öffentlich (siehe Hinweis unten)
 *  - "avatars"        → öffentlich (User-Profilbilder; Pfad muss mit {user_id}/ beginnen)
 *  - "ansprechpartner", "email-assets", "rechnung-logos" → public
 *
 * Hinweis zu "academy" und "avatars": Die Migration 20260517102500 hat beide
 * auf privat gestellt, 20260517102924 hat das noch am selben Tag wieder
 * zurückgenommen, und 20260601143536 legt "avatars" erneut öffentlich an.
 * Der Text hier stand seither falsch und hat eine Fehlersuche in die Irre
 * geführt: Ein leerer Signaturkreis in den Mails wurde für ein Rechteproblem
 * gehalten, obwohl das Bild sehr wohl abrufbar war.
 */

/** Pfad-Präfixe die in den public Bucket "objekt-medien" gehören. */
const OBJEKT_MEDIEN_PREFIXES = ["expose/", "wohnungsexpose/", "objektfotos/"] as const;

/** Ermittelt, ob ein Pfad konzeptionell Marketing-Medien sind. */
export function isObjektMedienPath(path: string): boolean {
  return OBJEKT_MEDIEN_PREFIXES.some((p) => path.startsWith(p));
}

/** Public URL für Marketing-Medien (Exposés, Objektfotos). */
export function getObjektMedienUrl(path: string): string {
  return supabase.storage.from("objekt-medien").getPublicUrl(path).data.publicUrl;
}

/* =============================================================
 * Objektunterlagen: geschützter Eimer, Bilder bleiben öffentlich
 * =============================================================
 * Fotos erscheinen in Exposés und Kundenlinks, die auch ohne Anmeldung
 * geöffnet werden. Sie müssen deshalb öffentlich bleiben. Grundbuchauszug,
 * Teilungserklärung, Mietvertrag, Wirtschaftsplan und Versicherungsnachweis
 * dürfen das nicht sein. Beide Sorten liegen bisher im selben öffentlichen
 * Eimer, getrennt nur durch den Pfad. Genau diese Trennung entscheidet
 * `eimerFuerObjektDatei`, und nur dort. Wer eine neue Ablagestelle erfindet,
 * ergänzt sie hier und nirgends sonst.
 */

/** Der geschützte Eimer für Objekt- und Wohnungsunterlagen. */
export const OBJEKT_DOKUMENTE_BUCKET = "objekt-dokumente";

/**
 * Was statt einer dauerhaften Adresse in der Datenbank steht.
 *
 * Ein privater Eimer hat keine dauerhafte Adresse mehr. Gespeichert wird
 * deshalb nur ein Zeiger auf den Ablageort, und erst beim Anzeigen entsteht
 * daraus eine befristete Adresse. Dasselbe Muster nutzen bereits die
 * Investagon-Unterlagen mit `/investagon-dokument/`.
 */
export const OBJEKT_DOKUMENT_ZEIGER = "/objekt-dokument/";

/** Der geschützte Eimer der aus Investagon übernommenen Unterlagen. */
export const INVESTAGON_DOKUMENTE_BUCKET = "investagon-dokumente";

/** Der Zeiger, den der Investagon-Import in die Datenbank schreibt. */
export const INVESTAGON_DOKUMENT_ZEIGER = "/investagon-dokument/";

/** Der Ablagepfad hinter einem Investagon-Zeiger, oder null wenn es keiner ist. */
export function investagonDokumentPfad(wert: string | null | undefined): string | null {
  if (!wert || !wert.startsWith(INVESTAGON_DOKUMENT_ZEIGER)) return null;
  const pfad = wert.slice(INVESTAGON_DOKUMENT_ZEIGER.length);
  return pfad || null;
}

export type ObjektEimer = "objekt-medien" | typeof OBJEKT_DOKUMENTE_BUCKET;

/**
 * Wie lange eine befristete Adresse für eine Objektunterlage gilt.
 *
 * Eine Stunde, dieselbe Spanne wie bei den Kundenunterlagen. Es bleibt also
 * bei einer Regel statt bei zweien. Kürzer wäre unpraktisch: Das Exposé
 * erzeugt die Adresse des Grundrisses schon beim Aufbau der Seite, weil die
 * PDF dort in Bilder umgewandelt wird, und zwischen Seitenaufbau und dem
 * Klick auf „Originaldokument öffnen" kann eine ganze Beratung liegen.
 * Länger wäre gefährlich: Eine weitergegebene Adresse ist ein Schlüssel und
 * soll spätestens am selben Tag wertlos sein.
 */
export const DOKUMENT_GUELTIGKEIT = 60 * 60;

/**
 * Welcher Eimer für diesen Ablagepfad zuständig ist.
 *
 * Die gewachsenen Pfade des Objektbereichs:
 *   objekte/<id>/bilder/…                      Slideshow  → öffentlich
 *   objekte/<id>/dokumente/…                   Objektunterlagen → geschützt
 *   objekte/<id>/wohnungen/<wid>/bilder/…      Wohnungsfotos → öffentlich
 *   objekte/<id>/wohnungen/<wid>/<datei>       Wohnungsunterlagen → geschützt
 *   expose/…, wohnungsexpose/…, objektfotos/…  Marketing → öffentlich
 *
 * Alles Unbekannte bleibt bewusst öffentlich, also unverändert. Ein falsch
 * geratener Umzug wäre schlimmer als ein bekannter Rest: Er würde eine Datei
 * still unerreichbar machen.
 */
export function eimerFuerObjektDatei(pfad: string): ObjektEimer {
  const teile = (pfad || "").split("/").filter(Boolean);
  if (teile[0] !== "objekte" || teile.length < 4) return "objekt-medien";
  if (teile[2] === "dokumente") return OBJEKT_DOKUMENTE_BUCKET;
  if (teile[2] === "wohnungen") {
    if (teile.length < 5) return "objekt-medien";
    if (teile[4] === "bilder") return "objekt-medien";
    if (istGrundriss(teile[4])) return "objekt-medien";
    return OBJEKT_DOKUMENTE_BUCKET;
  }
  return "objekt-medien";
}

/**
 * Kennung der Wohnungsunterlage "Grundriss" aus `DEFAULT_WOHNUNG_DOCS`.
 *
 * Steht hier als eigene Konstante und nicht als Zeichenkette mitten in der
 * Bedingung, damit die Ausnahme auffaellt, wenn jemand die Liste der
 * Wohnungsunterlagen umbaut. Aendert sich dort die Kennung, gehoert sie hier
 * nachgezogen, sonst wandert der Grundriss stillschweigend in den
 * geschuetzten Bereich und verschwindet aus dem Exposé.
 */
const GRUNDRISS_KENNUNG = "wd2";

/**
 * Ist diese Datei der Grundriss?
 *
 * Der Grundriss ist die eine Ausnahme von "alle Dokumente geschuetzt", so
 * entschieden am 10.09.2026. Begruendung: Er ist Verkaufsunterlage wie die
 * Fotos, er steht im oeffentlichen Exposé, und ein Kunde soll ihn ohne
 * Anmeldung ansehen koennen. Alle uebrigen Wohnungsunterlagen, also
 * Mietvertrag, Wirtschaftsplan, Hausgeld und Grundbuchauszug, bleiben
 * geschuetzt, denn dort stehen Namen und Zahlen.
 *
 * Der Ablagepfad einer Wohnungsunterlage endet auf `<kennung>_<dateiname>`,
 * siehe die Uploads in `ObjektNeu.tsx`. Geprueft wird deshalb der Anfang.
 */
function istGrundriss(dateiname: string): boolean {
  return dateiname.startsWith(`${GRUNDRISS_KENNUNG}_`);
}

/**
 * Eine Datei des Objektbereichs ablegen und den Wert liefern, der in die
 * Datenbank gehört.
 *
 * Der Eimer ergibt sich aus dem Pfad, nicht aus dem Aufrufer. Damit kann eine
 * Aufrufstelle die Trennung nicht versehentlich umgehen. Für ein Bild kommt
 * wie bisher die dauerhafte öffentliche Adresse zurück, für eine Unterlage
 * der Zeiger auf den geschützten Ablageort. Im Fehlerfall null.
 */
export async function objektDateiAblegen(
  pfad: string,
  datei: File | Blob,
  contentType?: string,
): Promise<string | null> {
  const eimer = eimerFuerObjektDatei(pfad);
  const { error } = await supabase.storage
    .from(eimer)
    .upload(pfad, datei, { contentType: contentType || (datei as File).type || undefined, upsert: true });
  if (error) {
    console.error(`[storage] Ablage fehlgeschlagen (${eimer}/${pfad}):`, error.message);
    return null;
  }
  return eimer === OBJEKT_DOKUMENTE_BUCKET ? objektDokumentZeiger(pfad) : getObjektMedienUrl(pfad);
}

/** Der Zeiger, der für einen geschützten Ablagepfad gespeichert wird. */
export function objektDokumentZeiger(pfad: string): string {
  return `${OBJEKT_DOKUMENT_ZEIGER}${pfad}`;
}

/** Der Ablagepfad hinter einem Zeiger, oder null wenn es keiner ist. */
export function objektDokumentPfad(wert: string | null | undefined): string | null {
  if (!wert || !wert.startsWith(OBJEKT_DOKUMENT_ZEIGER)) return null;
  const pfad = wert.slice(OBJEKT_DOKUMENT_ZEIGER.length);
  return pfad || null;
}

/**
 * Liefert eine Signed URL für private Buckets (Standard: 1 Stunde TTL).
 * Für public Buckets kann weiterhin getPublicUrl genutzt werden.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn(`[storage] createSignedUrl failed for ${bucket}/${path}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Universeller Reader: wenn der Pfad nach Marketing-Medien aussieht, wird der
 * public URL aus "objekt-medien" zurückgegeben (mit Fallback auf signed URL aus
 * "unterlagen" für Altbestand). Sonst signed URL aus "unterlagen".
 */
export async function getUnterlagenUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  if (isObjektMedienPath(path)) {
    // 1) neuen public Bucket bevorzugen
    const url = getObjektMedienUrl(path);
    return url;
  }
  return getSignedUrl("unterlagen", path, expiresInSeconds);
}

/** Bequemer Sync-Wrapper: nur für Marketing-Pfade verwendbar. */
export function getUnterlagenPublicUrlSync(path: string): string | null {
  if (!path || !isObjektMedienPath(path)) return null;
  return getObjektMedienUrl(path);
}

/**
 * Extrahiert den Storage-Pfad aus einer gespeicherten URL (public oder signed).
 * Unterstützt Altbestand mit publicUrl-Strings sowie reine Pfade.
 * Beispiele:
 *   https://xxx.supabase.co/storage/v1/object/public/unterlagen/foo/bar.pdf  → foo/bar.pdf
 *   https://xxx.supabase.co/storage/v1/object/sign/unterlagen/foo/bar.pdf?...→ foo/bar.pdf
 *   foo/bar.pdf → foo/bar.pdf
 */
export function extractStoragePath(stored: string, bucket: string = "unterlagen"): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//i.test(stored)) return stored;
  const re = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`);
  const m = stored.match(re);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Tolerante Resolver-Funktion: nimmt einen gespeicherten Wert (Pfad ODER
 * Public/Signed URL) und liefert eine frische Signed URL für den privaten
 * "unterlagen"-Bucket. Für Marketing-Pfade liefert sie die public URL des
 * "objekt-medien"-Bucket.
 */
export async function resolveUnterlagenUrl(
  stored: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!stored) return null;
  // 0) Zeiger auf eine geschützte Objektunterlage → befristete Adresse.
  const geschuetzt = objektDokumentPfad(stored);
  if (geschuetzt) return getSignedUrl(OBJEKT_DOKUMENTE_BUCKET, geschuetzt, expiresInSeconds);
  /*
   * 0b) Zeiger auf eine aus Investagon übernommene Unterlage.
   *
   * Diese Zeile hat bis zum 16.09.2026 gefehlt, und der Fehler war lautlos:
   * Der Zeiger fiel durch alle Zweige, landete unten als Pfad im Eimer
   * `unterlagen` und ergab dort nichts. `openUnterlage` schrieb eine Warnung
   * in die Browserkonsole, und der Klick auf „Ansehen" tat sichtbar gar
   * nichts. Gemeldet von Christian.
   */
  const ausInvestagon = investagonDokumentPfad(stored);
  if (ausInvestagon) {
    return getSignedUrl(INVESTAGON_DOKUMENTE_BUCKET, ausInvestagon, expiresInSeconds);
  }
  // 1) Bereits eine Marketing-URL? → unverändert lassen.
  if (/^https?:\/\//i.test(stored) && stored.includes("/objekt-medien/")) {
    return stored;
  }
  /*
   * 1b) Eine vollständige Fremdadresse bleibt, wie sie ist.
   *
   * Investagon liefert in `files` direkte Adressen auf tool.investagon.com.
   * Die im Eimer `unterlagen` zu suchen ergibt nie etwas. Ohne diesen Zweig
   * scheitert jedes Dokument, das noch nicht übernommen wurde.
   */
  if (/^https?:\/\//i.test(stored) && !stored.includes("/storage/v1/object/")) {
    return stored;
  }
  // 2) Pfad oder URL → Pfad extrahieren
  const path = extractStoragePath(stored, "unterlagen") ?? stored;
  if (isObjektMedienPath(path)) {
    return getObjektMedienUrl(path);
  }
  return getSignedUrl("unterlagen", path, expiresInSeconds);
}

/**
 * Click-Handler-Helper: resolved den gespeicherten Wert (Pfad oder URL)
 * und öffnet die Datei in einem neuen Tab. Zeigt im Fehlerfall eine
 * Browser-Console-Warnung.
 */
export async function openUnterlage(stored: string | null | undefined): Promise<void> {
  const url = await resolveUnterlagenUrl(stored);
  if (!url) {
    console.warn("[storage] openUnterlage: konnte URL nicht auflösen", stored);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Eine Unterlage herunterladen, unter einem lesbaren Dateinamen.
 *
 * Die Datei wird erst geholt und dann aus dem Speicher des Browsers
 * gespeichert. Zwei Gründe gegen einen schlichten Link: Das Attribut
 * `download` wirkt nur bei gleicher Herkunft, bei einer befristeten Adresse
 * aus dem Speicher also gar nicht, der Browser öffnete die PDF dann nur. Und
 * ein neuer Tab nach einer Wartezeit gilt Safari als Werbefenster und wird
 * still unterdrückt.
 *
 * Eine Datei auf einem fremden Server (etwa tool.investagon.com) gibt ihren
 * Inhalt nicht heraus, sie öffnet deshalb im neuen Tab. Dasselbe, wenn das
 * Holen scheitert. Nur wenn sich gar keine Adresse erzeugen lässt, kommt
 * `false` zurück, dann sagt die Oberfläche es dem Nutzer.
 */
export async function unterlageHerunterladen(
  stored: string | null | undefined,
  dateiname: string,
): Promise<boolean> {
  const url = await resolveUnterlagenUrl(stored);
  if (!url) {
    console.warn("[storage] unterlageHerunterladen: konnte URL nicht auflösen", stored);
    return false;
  }
  return adresseHerunterladen(url, dateiname);
}

/**
 * Wie `unterlageHerunterladen`, aber für eine schon fertige Adresse, etwa
 * die befristete Adresse, die die Kundenansicht vom Server bekommt. Dort
 * gibt es keine Anmeldung, `resolveUnterlagenUrl` wäre also der falsche Weg.
 */
export async function adresseHerunterladen(url: string, dateiname: string): Promise<boolean> {
  if (!url) return false;
  if (!url.includes("/storage/v1/object/")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  try {
    const antwort = await fetch(url);
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
    const objektUrl = URL.createObjectURL(await antwort.blob());
    const link = document.createElement("a");
    link.href = objektUrl;
    link.download = dateiname;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Erst später freigeben: Manche Browser lesen die Datei nach dem Klick noch.
    setTimeout(() => URL.revokeObjectURL(objektUrl), 60_000);
  } catch (e) {
    console.warn("[storage] unterlageHerunterladen: Holen gescheitert, öffne im neuen Tab", e);
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}

/**
 * Eine Liste von Dateieinträgen auf befristete Adressen umstellen.
 *
 * Einträge, für die sich keine Adresse erzeugen lässt, fallen weg. Genau das
 * passiert bei einem nicht angemeldeten Betrachter, etwa im öffentlichen
 * Exposé oder in der Kundenansicht: Der geschützte Eimer gibt ihm keine
 * Adresse, also erscheint die Unterlage dort nicht mehr. Öffentliche Bilder
 * und alte Marketing-Adressen bleiben unverändert stehen.
 *
 * Die entstandenen Adressen sind Schlüssel auf Zeit. Sie gehören nicht in
 * einen Zwischenspeicher, der länger lebt als sie selbst, und nicht ins
 * Protokoll.
 */
export async function befristeteDokumentAdressen<T extends { url: string }>(
  eintraege: T[],
  expiresInSeconds = DOKUMENT_GUELTIGKEIT,
): Promise<T[]> {
  const aufgeloest: Array<T | null> = await Promise.all(
    eintraege.map(async (e): Promise<T | null> => {
      if (!objektDokumentPfad(e.url)) return e;
      const url = await resolveUnterlagenUrl(e.url, expiresInSeconds);
      return url ? { ...e, url } : null;
    }),
  );
  return aufgeloest.filter((e): e is T => e !== null);
}

/**
 * Ob an einem Objekt überhaupt eine geschützte Unterlage hängt.
 *
 * Ist nichts zu tun, muss eine Seite auch nicht auf eine Auflösung warten.
 * Das betrifft heute noch fast jedes Objekt, denn alles bereits Hochgeladene
 * liegt weiterhin öffentlich.
 */
export function hatGeschuetzteUnterlagen(objekt: {
  dokumente?: Array<{ url: string }>;
  wohnungen?: Array<{ dokumente?: Array<{ url: string }> }>;
}): boolean {
  const geschuetzt = (liste?: Array<{ url: string }>) =>
    (liste ?? []).some((d) => objektDokumentPfad(d.url) !== null);
  return geschuetzt(objekt.dokumente) || (objekt.wohnungen ?? []).some((w) => geschuetzt(w.dokumente));
}

/**
 * Ein ganzes Objekt samt Einheiten auf befristete Adressen umstellen.
 *
 * Für das Exposé, das die Adresse eines Grundrisses schon beim Aufbau der
 * Seite braucht: Die PDF wird dort in Bilder umgewandelt, ein Klick kommt
 * dafür zu spät. Was sich nicht auflösen lässt, fällt weg.
 */
export async function objektUnterlagenBefristen<
  T extends {
    dokumente?: Array<{ url: string }>;
    wohnungen?: Array<{ dokumente?: Array<{ url: string }> }>;
  },
>(objekt: T, expiresInSeconds = DOKUMENT_GUELTIGKEIT): Promise<T> {
  const [dokumente, wohnungen] = await Promise.all([
    befristeteDokumentAdressen(objekt.dokumente ?? [], expiresInSeconds),
    Promise.all(
      (objekt.wohnungen ?? []).map(async (w) => ({
        ...w,
        dokumente: await befristeteDokumentAdressen(w.dokumente ?? [], expiresInSeconds),
      })),
    ),
  ]);
  return { ...objekt, dokumente, wohnungen };
}

/* =============================================================
 * Upload-Validation: Größen- und MIME-Type-Limits
 * ============================================================= */

export type UploadKind = "image" | "pdf" | "document" | "any";

/** Maximalgrößen in Bytes */
export const UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,      // 10 MB
  pdf: 50 * 1024 * 1024,        // 50 MB
  document: 25 * 1024 * 1024,   // 25 MB (DOCX, XLSX, etc.)
  any: 50 * 1024 * 1024,
} as const;

const ALLOWED_MIME: Record<UploadKind, RegExp> = {
  image: /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i,
  pdf: /^application\/pdf$/i,
  document: /^(application\/pdf|application\/(vnd\.openxmlformats-officedocument|msword|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(plain|csv))/i,
  any: /.*/,
};

export interface UploadValidationResult {
  ok: boolean;
  error?: string;
}

/** Validiert Datei-Größe + MIME vor dem Upload. */
export function validateUploadFile(file: File, kind: UploadKind = "any"): UploadValidationResult {
  if (!file) return { ok: false, error: "Keine Datei ausgewählt" };
  const maxBytes = UPLOAD_LIMITS[kind];
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    return { ok: false, error: `Datei zu groß (max. ${mb} MB).` };
  }
  const mime = file.type || "";
  if (!ALLOWED_MIME[kind].test(mime)) {
    return { ok: false, error: `Dateityp nicht erlaubt: ${mime || "unbekannt"}` };
  }
  return { ok: true };
}
