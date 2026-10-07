/**
 * Vorfuehrmodus: Schutz der Anzeige, wenn Fremde mit auf den Bildschirm sehen.
 *
 * Christian geht mit moeglichen Partnern, Dienstleistern und Bewerbern durch
 * das CRM. Sie sollen den Aufbau und die Ablaeufe sehen, aber keine
 * Kundennamen, keine Kontaktdaten und keine Betraege.
 *
 * Zwei Wirkungen, die bewusst unterschiedlich stark sind:
 *
 *  1. Ersetzen (diese Datei). Personenbezogene Angaben werden vor der Ausgabe
 *     durch ein gleichbleibendes Kuerzel ersetzt, etwa "Kunde M. B.". Der
 *     echte Wert kommt gar nicht erst in den Bildschirmtext. Weichzeichnen
 *     waere hier falsch: Der Text stuende weiter im Dokument, und wer die
 *     Entwicklerwerkzeuge oeffnet, liest ihn.
 *
 *  2. Weichzeichnen (siehe `unscharfKlasse` weiter unten). Betraege,
 *     Provisionen und Kennzahlen werden per CSS unscharf. Hier ist das
 *     richtig, weil die Struktur sichtbar bleiben soll: Man erkennt, dass dort
 *     eine Kennzahl steht, nur nicht welchen Wert sie hat. Diese Stufe wirkt
 *     ausschliesslich optisch, der Wert steht weiter im Dokument.
 *
 * KEINE ZUGRIFFSKONTROLLE. Der Modus ist reine Anzeige. Wer angemeldet ist,
 * darf weiterhin alles, was seine Rolle erlaubt, und die Antworten von
 * Supabase enthalten unveraendert die echten Daten. Massgeblich fuer Rechte
 * bleiben Row Level Security und `src/lib/sidebarPermissions.ts`. Niemand darf
 * diesen Schalter spaeter fuer eine Berechtigung halten.
 *
 * Der Modus veraendert ausserdem niemals Daten. Alle Funktionen hier sind
 * reine Umwandlungen fuer die Ausgabe, es wird nichts gespeichert.
 */

import type { UserRole } from "@/types/user";

const SPEICHER_SCHLUESSEL = "mi_vorfuehrmodus";

/** Name des Fensterereignisses, das bei jedem Umschalten gefeuert wird. */
export const VORFUEHRMODUS_EREIGNIS = "vorfuehrmodus-geaendert";

function ausSpeicherLesen(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SPEICHER_SCHLUESSEL) === "1";
  } catch {
    return false;
  }
}

// Der Zustand liegt im Modul, damit die Tarnfunktionen ihn ohne React lesen
// koennen. So bleibt jede Aufrufstelle ein Einzeiler.
let aktiv = typeof window === "undefined" ? false : ausSpeicherLesen();

export function istVorfuehrmodusAktiv(): boolean {
  return aktiv;
}

/**
 * Schaltet den Modus um und merkt sich den Zustand, damit er einen
 * Seitenwechsel und ein Neuladen ueberlebt.
 */
export function setzeVorfuehrmodus(an: boolean): void {
  aktiv = an;
  try {
    if (typeof window !== "undefined") {
      if (an) window.localStorage.setItem(SPEICHER_SCHLUESSEL, "1");
      else window.localStorage.removeItem(SPEICHER_SCHLUESSEL);
    }
  } catch {
    // Kein Speicher verfuegbar, dann gilt der Modus nur bis zum Neuladen.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VORFUEHRMODUS_EREIGNIS));
  }
}

/** Liest den Zustand neu aus dem Speicher, etwa nach einer Aenderung im anderen Tab. */
export function vorfuehrmodusNeuLesen(): boolean {
  aktiv = ausSpeicherLesen();
  return aktiv;
}

/**
 * Nur die Rollen mit Vollzugriff duerfen den Schalter sehen und bedienen.
 *
 * `individuell` und `testaccount` haben in `sidebarPermissions.ts` zwar
 * ebenfalls Vollzugriff auf die Routen, sind aber keine Geschaeftsfuehrung.
 * Der Schalter bleibt deshalb bei Inhaber und Admin, wie es die
 * Navigationspruefung `siehtAdminOnlyNavigation` ebenfalls handhabt.
 */
export function darfVorfuehrmodusSchalten(rolle: UserRole | string | undefined): boolean {
  return rolle === "inhaber" || rolle === "admin";
}

// ── Weichzeichnen von Betraegen ──────────────────────────────────────────

/**
 * Klassenname fuer alles, was nur unscharf werden soll: Betraege,
 * Provisionen, Umsaetze, Kaufpreise, Kennzahlen.
 *
 * Ehrlich gesagt: Das wirkt ausschliesslich optisch. Der Wert steht weiter im
 * Dokument und in den Netzwerkantworten. Wer die Entwicklerwerkzeuge oeffnet,
 * liest ihn. Fuer Namen und Kontaktdaten deshalb nie diese Klasse nehmen,
 * sondern die Tarnfunktionen weiter unten.
 *
 * Ohne aktiven Modus kommt eine leere Zeichenkette zurueck, die Klasse
 * erscheint dann gar nicht erst im Dokument.
 */
export function unscharfKlasse(zusatz = ""): string {
  if (!aktiv) return zusatz;
  return zusatz ? `vorfuehr-unscharf ${zusatz}` : "vorfuehr-unscharf";
}

// ── Ersetzen personenbezogener Angaben ───────────────────────────────────

export type TarnArt = "kunde" | "bewerber" | "partner" | "person";

const ART_LABEL: Record<TarnArt, string> = {
  kunde: "Kunde",
  bewerber: "Bewerber",
  partner: "Partner",
  person: "Person",
};

/** Werte, die ohnehin keinen Namen enthalten und deshalb unveraendert bleiben. */
const LEERE_WERTE = new Set(["", "-", "--", "n/a", "k.a.", "unbekannt", "laden..."]);

function istLeer(wert: string | null | undefined): boolean {
  if (!wert) return true;
  return LEERE_WERTE.has(wert.trim().toLowerCase());
}

/**
 * Stabile Zahl aus einer Zeichenkette (djb2). Gleicher Text, gleiche Zahl,
 * in jeder Ansicht und nach jedem Neuladen.
 */
function stabileZahl(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Namenszusaetze, die keine Initiale ergeben sollen. */
const TITEL = new Set(["dr", "dr.", "prof", "prof.", "herr", "frau", "dipl", "dipl.", "med", "med."]);

/**
 * Das gleichbleibende Kuerzel einer Person, unabhaengig vom Modus.
 *
 * Bewusst rein aus dem Namen abgeleitet und ohne jeden Zufall: Derselbe
 * Kontakt bekommt in der Liste, in der Pipeline und im Profil dasselbe
 * Kuerzel, damit Christian waehrend der Vorfuehrung ueber ihn sprechen kann.
 *
 * Bewerber bekommen eine Nummer statt Initialen, weil im Bewerbermanagement
 * viele Namen nebeneinander stehen und eine Nummer sich leichter vorlesen
 * laesst.
 */
export function kuerzelFuer(name: string | null | undefined, art: TarnArt = "kunde"): string {
  const roh = (name ?? "").trim();
  if (istLeer(roh)) return ART_LABEL[art];

  if (art === "bewerber") {
    // 10 bis 99, damit die Nummer immer zweistellig und gut lesbar ist.
    return `Bewerber ${(stabileZahl(roh.toLowerCase()) % 90) + 10}`;
  }

  const teile = roh
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !TITEL.has(t.toLowerCase()));

  const initialen = teile
    .map((t) => t[0])
    .filter((c) => /\p{L}/u.test(c))
    .slice(0, 2)
    .map((c) => `${c.toUpperCase()}.`);

  if (initialen.length === 0) return ART_LABEL[art];
  return `${ART_LABEL[art]} ${initialen.join(" ")}`;
}

/**
 * Name fuer die Ausgabe. Ohne Vorfuehrmodus bleibt alles, wie es ist.
 */
export function tarnName(name: string | null | undefined, art: TarnArt = "kunde"): string {
  if (!aktiv) return name ?? "";
  if (istLeer(name)) return name ?? "";
  return kuerzelFuer(name, art);
}

/** Vorname und Nachname getrennt, wie sie in vielen Tabellenspalten stehen. */
export function tarnVorname(vorname: string | null | undefined, art: TarnArt = "kunde"): string {
  if (!aktiv) return vorname ?? "";
  if (istLeer(vorname)) return vorname ?? "";
  if (art === "bewerber") return kuerzelFuer(vorname, art);
  const buchstabe = (vorname ?? "").trim()[0];
  return /\p{L}/u.test(buchstabe) ? `${buchstabe.toUpperCase()}.` : ART_LABEL[art];
}

export function tarnNachname(nachname: string | null | undefined, art: TarnArt = "kunde"): string {
  return tarnVorname(nachname, art);
}

/**
 * Mailadresse. Der erste Buchstabe bleibt stehen, damit erkennbar ist, dass
 * dort eine Adresse steht. Alles Uebrige einschliesslich der Domain faellt
 * weg, denn die Firmendomain benennt den Arbeitgeber.
 */
export function tarnEmail(email: string | null | undefined): string {
  if (!aktiv) return email ?? "";
  const roh = (email ?? "").trim();
  if (istLeer(roh)) return roh;
  if (!roh.includes("@")) return "•••";
  const anfang = roh[0];
  return /\p{L}/u.test(anfang) ? `${anfang.toLowerCase()}•••@•••` : "•••@•••";
}

/**
 * Telefonnummer. Jede Ziffer wird ersetzt, die Laenge bleibt erhalten, damit
 * die Spalte nicht springt.
 */
export function tarnTelefon(telefon: string | null | undefined): string {
  if (!aktiv) return telefon ?? "";
  const roh = (telefon ?? "").trim();
  if (istLeer(roh)) return roh;
  return roh.replace(/\d/g, "•");
}

/** Anschriften, Strasse, Hausnummer, Postleitzahl und Ort. */
export function tarnAdresse(adresse: string | null | undefined): string {
  if (!aktiv) return adresse ?? "";
  if (istLeer(adresse)) return adresse ?? "";
  return "Anschrift verborgen";
}

/** Geburtsdatum. Die Form bleibt, der Wert nicht. */
export function tarnGeburtsdatum(datum: string | null | undefined): string {
  if (!aktiv) return datum ?? "";
  if (istLeer(datum)) return datum ?? "";
  return "••.••.••••";
}

/** Arbeitgeber, Beruf und aehnliche Angaben zur Person. */
export function tarnArbeitgeber(wert: string | null | undefined): string {
  if (!aktiv) return wert ?? "";
  if (istLeer(wert)) return wert ?? "";
  return "Arbeitgeber verborgen";
}

/**
 * Initialen fuer Avatare. Zwei Buchstaben verraten dieselbe Person wie das
 * Kuerzel, deshalb bleibt im Vorfuehrmodus nur ein neutrales Zeichen.
 */
export function tarnInitialen(
  vorname: string | null | undefined,
  nachname: string | null | undefined,
): string {
  const roh = `${(vorname ?? "").trim()[0] ?? ""}${(nachname ?? "").trim()[0] ?? ""}`.toUpperCase();
  if (!aktiv) return roh;
  return "??";
}

/**
 * Verweisziel, das im Vorfuehrmodus wegfaellt: `mailto:`, `tel:` und
 * WhatsApp-Links. Ohne das stuende die Adresse weiter im Dokument, und der
 * Browser zeigte sie beim Ueberfahren unten links an. Ein Verweis ohne Ziel
 * bleibt sichtbar, tut aber nichts.
 */
export function tarnVerweis(ziel: string | null | undefined): string | undefined {
  if (aktiv) return undefined;
  return ziel ?? undefined;
}

/**
 * Freitext, der einen Namen enthalten kann, etwa eine Aktivitaetszeile oder
 * ein Betreff. Der Aufrufer sagt, was stattdessen stehen soll.
 */
export function tarnFreitext(text: string | null | undefined, ersatz = "Text verborgen"): string {
  if (!aktiv) return text ?? "";
  if (istLeer(text)) return text ?? "";
  return ersatz;
}
