/**
 * Kampagnenkennungen aus der Adresse der oeffentlichen Seiten.
 *
 * WOZU DAS DA IST
 *
 * Am Lead stand bisher nur ein Textfeld `quelle`, etwa "Steuerrechner". Damit
 * laesst sich nicht sagen, welche Anzeige den Lead gebracht hat, und genau
 * diese Frage entscheidet ueber die Verteilung des Werbebudgets. Jede
 * Anzeigenplattform haengt dafuer Parameter an den Link: `utm_source`,
 * `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, dazu die
 * plattformeigenen Klickkennungen `gclid` (Google) und `fbclid` (Meta).
 *
 * WARUM DAS MODUL DIE ADRESSE SELBST LIEST
 *
 * Die oeffentlichen Seiten sollen dafuer nicht angefasst werden. Dieses Modul
 * liest deshalb `window.location.search` selbst und wird an den beiden Stellen
 * aufgerufen, an denen die Werte gebraucht werden: beim Zaehlen des Trichters
 * und beim Absenden des Leads.
 *
 * WIE LANGE DIE WERTE LEBEN
 *
 * Beim ersten Aufruf mit Kennungen in der Adresse merkt sich die Seite zwei
 * Staende: den ersten Kontakt (first touch) und den letzten (last touch).
 * Kommt jemand ueber eine zweite Anzeige wieder, bleibt der erste stehen, der
 * letzte wird ersetzt. Die Auswertung zaehlt nach dem ersten.
 *
 * Wo sie liegen, entscheidet die Cookie-Einwilligung (`cookieEinwilligung.ts`):
 *   ohne Statistik-Einwilligung   nur im Arbeitsspeicher der geoeffneten Seite.
 *                                 Das ueberlebt jeden Seitenwechsel innerhalb
 *                                 der Seite, aber kein Schliessen. Im Browser
 *                                 wird nichts abgelegt, § 25 TDDDG greift nicht.
 *   mit Statistik-Einwilligung    zusaetzlich im localStorage, 30 Tage lang.
 *                                 Wer nach einer Woche wiederkommt und dann
 *                                 anfragt, wird der Anzeige noch zugeordnet.
 * Wird die Einwilligung zurueckgenommen, verschwindet der gespeicherte Stand
 * sofort. Die fruehere Ablage in der sessionStorage wird beim ersten Lesen
 * entfernt, sie lief ohne Einwilligung.
 *
 * WARUM ALLES BEGRENZT WIRD
 *
 * Die Werte kommen aus der Adresse, also von aussen. Wer den Link von Hand
 * baut, bestimmt ihren Inhalt. Deshalb: Zeichenvorrat pruefen, Laenge kappen,
 * und nur die sieben bekannten Felder uebernehmen. Ohne Kampagne bleibt alles
 * leer, das ist der Normalfall beim persoenlichen Partnerlink.
 */

import {
  aufEinwilligungHoeren,
  hatStatistikEinwilligung,
} from "@/lib/cookieEinwilligung";

/** Der gesicherte Stand, nur mit Statistik-Einwilligung. */
const SPEICHER_SCHLUESSEL = "moreimmo.kampagne.v2";

/** Die fruehere Ablage in der sessionStorage, ohne Einwilligung. Wird entfernt. */
const ALTER_SCHLUESSEL = "moreimmo.kampagne";

/** So lange bleibt ein gespeicherter Stand gueltig. */
const LAUFZEIT_MS = 30 * 86_400_000;

/**
 * Laenge der UTM-Felder. Kampagnennamen der Plattformen sind lang, aber nicht
 * beliebig lang. Was darueber hinausgeht, wird abgeschnitten.
 */
const MAX_UTM = 120;

/**
 * Klickkennungen sind laenger als UTM-Werte, ein `fbclid` faellt schnell ueber
 * hundert Zeichen aus. Abgeschnitten waere er wertlos, deshalb mehr Platz.
 */
const MAX_KLICK_ID = 255;

/**
 * Erlaubte Zeichen in einem UTM-Wert: Buchstaben und Ziffern aus allen
 * Sprachen, Leerzeichen und die Satzzeichen, die Plattformen in
 * Kampagnennamen tatsaechlich verwenden. Alles andere faellt weg, damit weder
 * Steuerzeichen noch Markup in der Datenbank landen.
 */
const VERBOTEN_UTM = /[^\p{L}\p{N} ._\-:+|/()@&,#]/gu;

/** Klickkennungen sind reine Zeichenketten der Plattform, hier reicht weniger. */
const VERBOTEN_KLICK_ID = /[^A-Za-z0-9._-]/g;

export interface KampagnenKennung {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  /** Zeitpunkt des ersten Aufrufs mit diesen Kennungen. */
  erfasstAm?: string;
  /**
   * Nur am Lead: der letzte Kontakt (last touch), wenn er vom ersten
   * abweicht. Die Felder oben sind immer der erste Kontakt.
   */
  zuletzt?: KampagnenKennung;
}

/** Der Parameter in der Adresse und das Feld, in dem er bei uns landet. */
const FELDER: { parameter: string; feld: keyof KampagnenKennung; klickId: boolean }[] = [
  { parameter: "utm_source", feld: "utmSource", klickId: false },
  { parameter: "utm_medium", feld: "utmMedium", klickId: false },
  { parameter: "utm_campaign", feld: "utmCampaign", klickId: false },
  { parameter: "utm_content", feld: "utmContent", klickId: false },
  { parameter: "utm_term", feld: "utmTerm", klickId: false },
  { parameter: "gclid", feld: "gclid", klickId: true },
  { parameter: "fbclid", feld: "fbclid", klickId: true },
];

/** Ein einzelner Wert, gesaeubert und gekappt. Leer heisst: nicht uebernehmen. */
function saeubere(roh: string, klickId: boolean): string {
  const ohneVerbotene = roh.replace(klickId ? VERBOTEN_KLICK_ID : VERBOTEN_UTM, "");
  const zusammengezogen = ohneVerbotene.replace(/\s+/g, " ").trim();
  return zusammengezogen.slice(0, klickId ? MAX_KLICK_ID : MAX_UTM);
}

/** Liegt ueberhaupt eine Kennung vor? */
export function istLeer(kennung: KampagnenKennung | undefined | null): boolean {
  if (!kennung) return true;
  return FELDER.every(({ feld }) => !kennung[feld]);
}

/**
 * Liest die Kennungen aus einer Abfragezeichenkette.
 *
 * Rein und ohne Seiteneffekt, damit sie sich einzeln pruefen laesst.
 */
export function leseKampagneAusAdresse(suche: string): KampagnenKennung {
  const ergebnis: KampagnenKennung = {};
  if (!suche) return ergebnis;
  let parameter: URLSearchParams;
  try {
    parameter = new URLSearchParams(suche.startsWith("?") ? suche.slice(1) : suche);
  } catch {
    return ergebnis;
  }
  for (const { parameter: name, feld, klickId } of FELDER) {
    const roh = parameter.get(name);
    if (typeof roh !== "string") continue;
    const wert = saeubere(roh, klickId);
    if (wert) ergebnis[feld] = wert;
  }
  return ergebnis;
}

/** Ein Stand aus fremder Hand wird Feld fuer Feld neu geprueft. */
function pruefeKennung(gelesen: unknown): KampagnenKennung | null {
  if (!gelesen || typeof gelesen !== "object") return null;
  const quelle = gelesen as Record<string, unknown>;
  const geprueft: KampagnenKennung = {};
  for (const { feld, klickId } of FELDER) {
    const wert = quelle[feld];
    if (typeof wert !== "string") continue;
    const sauber = saeubere(wert, klickId);
    if (sauber) (geprueft as Record<string, string>)[feld] = sauber;
  }
  if (istLeer(geprueft)) return null;
  if (typeof quelle.erfasstAm === "string") geprueft.erfasstAm = quelle.erfasstAm.slice(0, 40);
  return geprueft;
}

interface Stand {
  erster: KampagnenKennung;
  letzter: KampagnenKennung;
}

/** Der Stand dieses Seitenbesuchs, auch ohne jede Einwilligung. */
let imArbeitsspeicher: Stand | null = null;

function entferneAlteAblage(): void {
  try {
    window.sessionStorage.removeItem(ALTER_SCHLUESSEL);
  } catch {
    // egal
  }
}

function liesSpeicher(): Stand | null {
  if (!hatStatistikEinwilligung()) return null;
  try {
    const roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return null;
    const gelesen = JSON.parse(roh) as { erster?: unknown; letzter?: unknown; ablauf?: unknown };
    if (typeof gelesen?.ablauf !== "number" || gelesen.ablauf < Date.now()) {
      window.localStorage.removeItem(SPEICHER_SCHLUESSEL);
      return null;
    }
    const erster = pruefeKennung(gelesen.erster);
    if (!erster) return null;
    return { erster, letzter: pruefeKennung(gelesen.letzter) ?? erster };
  } catch {
    return null;
  }
}

function schreibeSpeicher(stand: Stand): void {
  if (!hatStatistikEinwilligung()) return;
  try {
    window.localStorage.setItem(
      SPEICHER_SCHLUESSEL,
      JSON.stringify({ ...stand, ablauf: Date.now() + LAUFZEIT_MS }),
    );
  } catch {
    // Privates Fenster oder voller Speicher: dann gilt der Arbeitsspeicher.
  }
}

function loescheSpeicher(): void {
  try {
    window.localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } catch {
    // egal
  }
}

/** Dieselben Kennungen, ohne auf den Zeitpunkt zu schauen? */
function gleicheKennung(a: KampagnenKennung, b: KampagnenKennung): boolean {
  return FELDER.every(({ feld }) => (a[feld] ?? "") === (b[feld] ?? ""));
}

/*
 * Aendert der Besucher seine Wahl, folgt die Ablage sofort: Zustimmung legt
 * den Stand dieses Besuchs ab, Widerruf loescht ihn.
 */
if (typeof window !== "undefined") {
  aufEinwilligungHoeren((e) => {
    if (e?.statistik) {
      if (imArbeitsspeicher) schreibeSpeicher(imArbeitsspeicher);
    } else {
      loescheSpeicher();
    }
  });
}

function aktuellerStand(): Stand | null {
  if (imArbeitsspeicher) return imArbeitsspeicher;
  if (typeof window === "undefined") return null;
  entferneAlteAblage();
  imArbeitsspeicher = liesSpeicher();
  return imArbeitsspeicher;
}

/**
 * Die Kennung des ersten Kontakts.
 *
 * Steht eine Kennung in der Adresse, wird sie gemerkt: als erster Kontakt,
 * wenn es noch keinen gibt, sonst als letzter. Jeder weitere Aufruf liefert
 * den ersten Kontakt, auch wenn die Adresse inzwischen leer ist. Ohne jede
 * Kennung kommt ein leeres Objekt zurueck, und nichts geht kaputt.
 */
export function kampagneErfassen(suche?: string): KampagnenKennung {
  const ausAdresse = leseKampagneAusAdresse(
    typeof suche === "string"
      ? suche
      : typeof window !== "undefined"
        ? window.location.search
        : "",
  );
  const stand = aktuellerStand();

  if (!istLeer(ausAdresse)) {
    const mitZeit: KampagnenKennung = { ...ausAdresse, erfasstAm: new Date().toISOString() };
    if (!stand) {
      imArbeitsspeicher = { erster: mitZeit, letzter: mitZeit };
      if (typeof window !== "undefined") schreibeSpeicher(imArbeitsspeicher);
      return mitZeit;
    }
    // Dieselbe Adresse wird oft mehrfach gelesen (Zaehler, Absenden). Nur eine
    // wirklich andere Kennung ist ein neuer letzter Kontakt.
    if (!gleicheKennung(stand.letzter, ausAdresse)) {
      imArbeitsspeicher = { erster: stand.erster, letzter: mitZeit };
      if (typeof window !== "undefined") schreibeSpeicher(imArbeitsspeicher);
    }
    return stand.erster;
  }

  return stand?.erster ?? {};
}

/**
 * Die Kennung fuer den Lead, oder `undefined`, wenn es keine gibt.
 *
 * Die Felder sind der erste Kontakt. Weicht der letzte davon ab, steht er
 * unter `zuletzt`. So bleibt `meta.kampagne` bei einem Lead ohne Anzeige
 * schlicht weg, statt als leeres Objekt herumzuliegen.
 */
export function kampagneFuerLead(suche?: string): KampagnenKennung | undefined {
  const erster = kampagneErfassen(suche);
  if (istLeer(erster)) return undefined;
  const letzter = imArbeitsspeicher?.letzter;
  if (letzter && !gleicheKennung(erster, letzter)) {
    return { ...erster, zuletzt: { ...letzter } };
  }
  return { ...erster };
}

/** Nur fuer Tests: den gemerkten Stand loeschen. */
export function _kampagneVergessen(): void {
  imArbeitsspeicher = null;
  loescheSpeicher();
  entferneAlteAblage();
}

/**
 * So heisst eine Kampagne in den Auswertungen.
 *
 * Gruppiert wird nach `utm_campaign`. Das ist die Ebene, auf der Budget
 * verteilt wird: `utm_source` und `utm_medium` sind zu grob, um zwei Anzeigen
 * derselben Plattform zu unterscheiden, `utm_content` ist so fein, dass jede
 * Bildvariante eine eigene Zeile bekaeme. Fehlt `utm_campaign`, aber es kam
 * eine Kennung mit, wird auf Quelle und Medium zurueckgefallen, sonst
 * verschwaende ein halb gesetzter Link in der Sammelzeile.
 */
export const OHNE_KAMPAGNE = "Ohne Kampagne";

export function kampagnenName(kennung: KampagnenKennung | undefined | null): string {
  if (!kennung) return OHNE_KAMPAGNE;
  if (kennung.utmCampaign) return kennung.utmCampaign;
  const teile = [kennung.utmSource, kennung.utmMedium].filter(Boolean);
  if (teile.length) return teile.join(" / ");
  if (kennung.gclid) return "Google Ads (ohne utm_campaign)";
  if (kennung.fbclid) return "Meta Ads (ohne utm_campaign)";
  return OHNE_KAMPAGNE;
}

/**
 * Die Kennung eines Kontakts aus dem CRM-Zwischenspeicher.
 *
 * Alte Leads tragen keine, sie landen in der Sammelzeile `OHNE_KAMPAGNE`.
 */
export function kampagneAusKontakt(kontakt: unknown): KampagnenKennung | undefined {
  const meta = (kontakt as { meta?: { kampagne?: unknown } } | null | undefined)?.meta;
  const roh = meta?.kampagne;
  if (!roh || typeof roh !== "object") return undefined;
  const kennung = roh as KampagnenKennung;
  return istLeer(kennung) ? undefined : kennung;
}

/**
 * Wer die Kampagnenkennung sieht: im Kundenprofil und in der Auswertung je
 * Kampagne. Das sind die Rollen, die Werbebudget verantworten oder
 * auswerten. Der Vertriebspartner sieht die Quelle wie bisher, die
 * Kampagnendetails braucht er fuer seine Arbeit nicht.
 */
const KAMPAGNE_SICHTBAR_FUER = new Set(["inhaber", "admin", "testaccount", "vertriebsleiter", "marketing"]);

export function darfKampagneSehen(rolle: string | null | undefined): boolean {
  return !!rolle && KAMPAGNE_SICHTBAR_FUER.has(rolle);
}

/**
 * Die Einzelheiten einer Kennung als kurze Zeilen fuer die Anzeige, ohne den
 * Kampagnennamen selbst. Leere Felder fallen weg.
 */
export function kampagnenDetails(kennung: KampagnenKennung): string[] {
  const zeilen: string[] = [];
  const herkunft = [kennung.utmSource, kennung.utmMedium].filter(Boolean).join(" / ");
  if (herkunft) zeilen.push(`Quelle/Medium: ${herkunft}`);
  if (kennung.utmContent) zeilen.push(`Anzeige: ${kennung.utmContent}`);
  if (kennung.utmTerm) zeilen.push(`Anzeigengruppe/Begriff: ${kennung.utmTerm}`);
  if (kennung.gclid) zeilen.push("Google-Klickkennung vorhanden");
  if (kennung.fbclid) zeilen.push("Meta-Klickkennung vorhanden");
  return zeilen;
}
