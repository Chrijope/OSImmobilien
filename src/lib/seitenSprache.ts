/**
 * Die Sprache einer öffentlichen Kundenseite mit persönlichem Link.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 3 (Abschnitt 3.3 a): Kundenlink,
 * Exposé, Terminbuchung und -verwaltung, Partnertermin, Videoraum-Gast,
 * Handy-Scan und der Hinweis der Objektvorstellung.
 *
 * Reihenfolge, in der die Sprache feststeht:
 *   1. `?lang=en` oder `?lang=de` in der Adresse. Das ändert nur die Anzeige
 *      in diesem Browser, nie das Kundenprofil. Gedacht für den Berater, der
 *      die Seite in der anderen Sprache zeigen will, oder für Person 2.
 *   2. Die Sprache vom Server, ermittelt über den Kontakt hinter dem Link
 *      (`kontakte.meta.kundenSprache`).
 *   3. Deutsch. Das gilt auch, solange die Migration
 *      `20260925190000_kundensprache_zum_link.sql` nicht gelaufen ist oder
 *      eine Edge Function noch die alte Fassung ohne `sprache` ausliefert.
 *
 * Die Texte je Seite liegen in eigenen Dateien (`…Texte.ts`) als Objekt
 * `{ de: {...}, en: {...} }`, typgleich. `textdateiLuecken` prüft in den
 * Tests, dass beide Hälften vollständig sind.
 *
 * Bewusst ohne Import aus `kundenSprache.ts`: Dort hängen Zwischenspeicher
 * und CRM-Dialoge dran, die eine öffentliche Seite nicht laden soll.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  normalisiereSprache,
  STANDARD_SPRACHE,
  type Sprache,
} from "../../supabase/functions/_shared/kunden-sprache.ts";

export { STANDARD_SPRACHE, type Sprache };

/** Die Texte einer Seite in beiden Sprachen, typgleich. */
export type ZweiSprachen<T> = Record<Sprache, T>;

/* ── Sprache bestimmen ──────────────────────────────────────── */

/** `?lang=en` aus der Adresse. Fehlt der Parameter oder ist er unbekannt: `null`. */
export function spracheAusAdresse(search: string | null | undefined): Sprache | null {
  if (!search) return null;
  try {
    return normalisiereSprache(new URLSearchParams(search).get("lang"));
  } catch {
    return null;
  }
}

/** Adresse vor Server vor Deutsch. */
export function bestimmeSeitenSprache(e: { adresse?: string | null; server?: unknown }): Sprache {
  return spracheAusAdresse(e.adresse) ?? normalisiereSprache(e.server) ?? STANDARD_SPRACHE;
}

/**
 * Setzt `<html lang>` für Vorleseprogramme und die Silbentrennung des
 * Browsers. Beim Verlassen der Seite gilt wieder, was vorher stand.
 */
export function useHtmlLang(sprache: Sprache): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const vorher = html.getAttribute("lang");
    html.setAttribute("lang", sprache);
    return () => {
      if (vorher === null) html.removeAttribute("lang");
      else html.setAttribute("lang", vorher);
    };
  }, [sprache]);
}

/**
 * Die Sprache der Seite, wenn der Server sie in seiner Antwort mitschickt
 * (`get-kundenansicht`, `get-expose`, `get-objektvorstellung`).
 */
export function useSeitenSprache(serverSprache: unknown): Sprache {
  const { search } = useLocation();
  const sprache = bestimmeSeitenSprache({ adresse: search, server: serverSprache });
  useHtmlLang(sprache);
  return sprache;
}

/* ── Sprache zum Link über die Datenbank ────────────────────── */

/** Die Seiten, deren Sprache `kundensprache_zum_link` kennt. */
export type LinkArt = "buchung" | "buchung_verwalten" | "partnertermin" | "videoraum" | "mobile_scan";

/**
 * Fragt die Sprache zum Schlüssel ab.
 *
 * Gibt `null` zurück, wenn sie sich nicht ermitteln lässt: unbekannter
 * Schlüssel, kein Kontakt am Link, Netzfehler oder die Funktion fehlt noch,
 * weil die Migration nicht gelaufen ist. Wirft nie.
 */
export async function ladeLinkSprache(art: LinkArt, token: string | null | undefined): Promise<Sprache | null> {
  if (!token) return null;
  try {
    const { data, error } = await supabase.rpc(
      "kundensprache_zum_link" as never,
      { _art: art, _token: token } as never,
    );
    if (error) return null;
    return normalisiereSprache(data);
  } catch {
    return null;
  }
}

/**
 * Die Sprache einer Seite, die sie über `kundensprache_zum_link` erfährt.
 *
 * `bereit` wird wahr, sobald die Antwort da ist, auch wenn sie leer war oder
 * fehlschlug. Eine Seite, die ohnehin einen Ladezustand zeigt, wartet damit
 * auf beides und springt nicht sichtbar von Deutsch auf Englisch. Mit
 * `?lang=` in der Adresse ist sie sofort bereit.
 */
export function useLinkSprache(art: LinkArt, token: string | null | undefined): { sprache: Sprache; bereit: boolean } {
  const { search } = useLocation();
  const ausAdresse = spracheAusAdresse(search);
  const [server, setServer] = useState<{ token: string | null | undefined; sprache: Sprache | null } | null>(null);

  useEffect(() => {
    let aktiv = true;
    if (!token) {
      setServer({ token, sprache: null });
      return;
    }
    ladeLinkSprache(art, token).then((sprache) => {
      if (aktiv) setServer({ token, sprache });
    });
    return () => { aktiv = false; };
  }, [art, token]);

  const serverSprache = server && server.token === token ? server.sprache : null;
  const sprache = ausAdresse ?? serverSprache ?? STANDARD_SPRACHE;
  useHtmlLang(sprache);
  return { sprache, bereit: ausAdresse !== null || (server !== null && server.token === token) };
}

/* ── Texte ──────────────────────────────────────────────────── */

/** Die Texte für die Sprache. Kurzform, damit die Seiten `t.titel` schreiben. */
export function texteFuer<T>(texte: ZweiSprachen<T>, sprache: Sprache): T {
  return texte[sprache] ?? texte[STANDARD_SPRACHE];
}

/** Gedankenstriche, die in nutzersichtbaren Texten nicht vorkommen dürfen. */
const GEDANKENSTRICH = /[–—]/;

/**
 * Vergleicht die deutsche und die englische Hälfte einer Textdatei.
 *
 * Meldet jede Lücke als lesbaren Pfad: fehlender oder überzähliger Schlüssel,
 * leerer Text, verschiedene Art (Text gegen Funktion), verschieden lange
 * Listen, Gedankenstrich in einem Text. Funktionen werden nur auf ihr
 * Vorhandensein geprüft; ihre Ausgabe prüft der Test der Seite mit
 * Beispielwerten über `gedankenstrichFrei`.
 *
 * Leere Liste heißt: vollständig.
 */
export function textdateiLuecken(de: unknown, en: unknown, pfad = ""): string[] {
  const luecken: string[] = [];
  const art = (w: unknown) => (Array.isArray(w) ? "liste" : w === null ? "null" : typeof w);
  const artDe = art(de);
  const artEn = art(en);
  if (artDe !== artEn) return [`${pfad || "(Wurzel)"}: de ist ${artDe}, en ist ${artEn}`];

  if (typeof de === "string" && typeof en === "string") {
    if (!de.trim()) luecken.push(`${pfad}: de ist leer`);
    if (!en.trim()) luecken.push(`${pfad}: en ist leer`);
    if (GEDANKENSTRICH.test(de)) luecken.push(`${pfad}: Gedankenstrich in de`);
    if (GEDANKENSTRICH.test(en)) luecken.push(`${pfad}: Gedankenstrich in en`);
    return luecken;
  }
  if (Array.isArray(de) && Array.isArray(en)) {
    if (de.length !== en.length) luecken.push(`${pfad}: de hat ${de.length} Einträge, en ${en.length}`);
    const n = Math.min(de.length, en.length);
    for (let i = 0; i < n; i++) luecken.push(...textdateiLuecken(de[i], en[i], `${pfad}[${i}]`));
    return luecken;
  }
  if (de && en && typeof de === "object" && typeof en === "object") {
    const a = de as Record<string, unknown>;
    const b = en as Record<string, unknown>;
    const schluessel = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of schluessel) {
      const weiter = pfad ? `${pfad}.${k}` : k;
      if (!(k in a)) luecken.push(`${weiter}: fehlt in de`);
      else if (!(k in b)) luecken.push(`${weiter}: fehlt in en`);
      else luecken.push(...textdateiLuecken(a[k], b[k], weiter));
    }
    return luecken;
  }
  return luecken;
}

/** Wahr, wenn ein fertiger Text keinen Gedankenstrich enthält. */
export function gedankenstrichFrei(text: string): boolean {
  return !GEDANKENSTRICH.test(text);
}

/* ── Objekttexte aus der Datenbank ──────────────────────────── */

/** Der Hinweis, wenn ein Objekttext nur auf Deutsch vorliegt (Entscheidung 12). */
export const NUR_DEUTSCH_HINWEIS = "Description available in German only";

export { oeffentlicheObjekttexteEn, type ObjekttexteEn } from "../../supabase/functions/_shared/expose-oeffentlich.ts";

/** Hilfsrückgabe für einen Objekttext in der Seitensprache. */
export interface ObjekttextAnzeige<T> {
  wert: T;
  /** Wahr, wenn die Seite englisch ist, der Text aber deutsch bleibt. */
  nurDeutsch: boolean;
}

/**
 * Wählt zwischen dem deutschen Text und seiner englischen Fassung aus
 * `meta.objekttexteKiEn`. Deutsch: immer der deutsche. Englisch: die
 * englische Fassung, wenn es sie gibt, sonst der deutsche mit dem Vermerk
 * `nurDeutsch`. Leere Texte brauchen keinen Vermerk.
 */
export function objekttextFuer(deutsch: string, englisch: string | null | undefined, sprache: Sprache): ObjekttextAnzeige<string> {
  if (sprache !== "en") return { wert: deutsch, nurDeutsch: false };
  const en = (englisch ?? "").trim();
  if (en) return { wert: en, nurDeutsch: false };
  return { wert: deutsch, nurDeutsch: !!deutsch.trim() };
}

/** Wie `objekttextFuer`, für Listen (Standort- und Marktargumente). */
export function objekttexteFuer(deutsch: string[], englisch: string[] | null | undefined, sprache: Sprache): ObjekttextAnzeige<string[]> {
  if (sprache !== "en") return { wert: deutsch, nurDeutsch: false };
  const en = (englisch ?? []).map((t) => t.trim()).filter(Boolean);
  if (en.length) return { wert: en, nurDeutsch: false };
  return { wert: deutsch, nurDeutsch: deutsch.length > 0 };
}

/* ── Anonyme öffentliche Seiten (Etappe 6) ─────────────────────
 * Die Sprache der anonymen öffentlichen Seiten.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6 (Abschnitt 3.3 b): Auf der
 * Berater-Mikroseite, dem öffentlichen Steuerrechner, dem Analysetool und der
 * Linkseite ist der Besucher unbekannt, eine Kundensprache gibt es noch nicht.
 * Die Seite ermittelt ihre Sprache deshalb selbst, in dieser Reihenfolge:
 *
 *   1. `?lang=en` oder `?lang=de` in der Adresse. Damit lässt sich eine
 *      Anzeige oder ein Beitrag gezielt auf Englisch verlinken.
 *   2. Die gemerkte Wahl aus dem Umschalter oben auf der Seite.
 *   3. Die Browsersprache, aber nur, wenn sie klar Englisch ist: Die erste
 *      bevorzugte Sprache des Browsers beginnt mit „en“. Ein deutscher
 *      Browser mit Englisch an zweiter Stelle bleibt deutsch.
 *   4. Sonst Deutsch.
 *
 * Trägt sich der Besucher ein, geht diese Sprache mit dem Lead an
 * `submit-lead` und wird dort zur Kundensprache des neuen Kontakts.
 *
 * Gemerkt wird unter einem eigenen Schlüssel und nicht unter dem des
 * Kundenportals (`moreimmo-crm-lang`): Wer hier auf Englisch schaltet, soll
 * damit nicht das Portal eines Kunden am selben Rechner umstellen.
 */

/** Schlüssel im Browser-Speicher für die Wahl aus dem Umschalter. */
export const SEITEN_SPRACHE_SPEICHER = "moreimmo-seiten-sprache";

/** Der Name des Adressparameters. */
export const SEITEN_SPRACHE_PARAMETER = "lang";

/**
 * Englisch aus der Browsersprache, aber nur, wenn die erste bevorzugte
 * Sprache Englisch ist. Alles andere ergibt `null`, auch Deutsch, damit der
 * Aufrufer selbst auf Deutsch zurückfällt.
 */
export function spracheAusBrowser(sprachen: readonly (string | null | undefined)[] | null | undefined): Sprache | null {
  const erste = (sprachen ?? []).find((s): s is string => typeof s === "string" && s.trim() !== "");
  return erste && normalisiereSprache(erste) === "en" ? "en" : null;
}

export interface SeitenSpracheQuellen {
  /** Wert von `?lang=` aus der Adresse. */
  parameter?: string | null;
  /** Gemerkte Wahl aus dem Umschalter. */
  gemerkt?: string | null;
  /** `navigator.languages`, ersatzweise `[navigator.language]`. */
  browser?: readonly (string | null | undefined)[] | null;
}

/** Die Sprache der Seite nach der Reihenfolge im Dateikopf. */
export function ermittleSeitenSprache(quellen: SeitenSpracheQuellen): Sprache {
  return (
    normalisiereSprache(quellen.parameter)
    ?? normalisiereSprache(quellen.gemerkt)
    ?? spracheAusBrowser(quellen.browser)
    ?? STANDARD_SPRACHE
  );
}

/** Die Sprachen des Browsers. Ohne `navigator` (Server, Test) eine leere Liste. */
export function browserSprachen(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * Die gemerkte Wahl. Der Speicher kann fehlen oder gesperrt sein (privates
 * Fenster, strenge Einstellungen), dann gibt es eben keine.
 */
export function leseGemerkteSeitenSprache(): Sprache | null {
  try {
    return normalisiereSprache(window.localStorage.getItem(SEITEN_SPRACHE_SPEICHER));
  } catch {
    return null;
  }
}

export function merkeSeitenSprache(sprache: Sprache): void {
  try {
    window.localStorage.setItem(SEITEN_SPRACHE_SPEICHER, sprache);
  } catch {
    /* Ohne Speicher gilt die Wahl nur bis zum Neuladen, die Adresse trägt sie trotzdem. */
  }
}

/**
 * Hängt `lang=en` an einen Verweis innerhalb der Seite, damit das Ziel in
 * derselben Sprache öffnet. Deutsch bleibt ohne Parameter, das ist ohnehin
 * der Rückfall. Anker (`#…`) bleiben am Ende.
 */
export function mitSeitenSprache(url: string, sprache: Sprache): string {
  if (sprache !== "en") return url;
  const [ohneAnker, anker] = url.split("#", 2);
  if (/[?&]lang=/.test(ohneAnker)) return url;
  const verbunden = `${ohneAnker}${ohneAnker.includes("?") ? "&" : "?"}lang=en`;
  return anker !== undefined ? `${verbunden}#${anker}` : verbunden;
}
