import { isDraftRoute } from "@/lib/draftRoutes";

/**
 * Welche Bereiche die Einstellungen haben, und wer sie sehen darf.
 *
 * Diese Liste stand bis zum 14.09.2026 nur in `Einstellungen.tsx`. Seit das
 * Zahnrad in der Kopfleiste ein Menü öffnet, brauchen zwei Stellen dieselbe
 * Auskunft, und zwei Kopien derselben Liste liefen bei der ersten Änderung
 * auseinander.
 *
 * **Die Entwurf-Regel ist dieselbe wie in der Seitenleiste**, das war
 * Christians ausdrückliche Vorgabe: Ein Bereich im Aufbau ist für Admin und
 * Inhaber klickbar und trägt „Entwurf"; für alle anderen ist er gesperrt und
 * trägt „Bald verfügbar". Woher die Sperre kommt, entscheidet
 * `draftRoutes.ts`, damit es auch dafür nur eine Wahrheit gibt.
 */

export interface EinstellungenBereich {
  /** Die Beschriftung, zugleich der Schlüssel der alten Reiterleiste. */
  titel: string;
  /** Der Wert für `?tab=` in der Adresse. */
  slug: string;
  /** Im Aufbau, also gesperrt oder mit Hinweis. */
  entwurf: boolean;
  /** Darf diese Rolle ihn trotz Entwurf öffnen? */
  offen: boolean;
  /** Was am Eintrag steht, wenn er im Aufbau ist. */
  abzeichen?: "Entwurf" | "Bald verfügbar";
  /** Wonach Menschen den Bereich in der globalen Suche suchen. Klein geschrieben. */
  suchbegriffe?: string[];
}

/** Suchbegriffe je Bereich für die globale Suche. */
const SUCHBEGRIFFE: Record<string, string[]> = {
  Profil: ["profilbild", "foto", "buchungslink", "gewerbe", "adresse"],
  Kalender: ["termine", "sync", "kalender verbinden"],
  Abwesenheit: ["urlaub", "vertretung", "krank"],
  Benachrichtigungen: ["mitteilungen", "push", "hinweise"],
  Protokoll: ["anmeldeverlauf", "verlauf"],
  Sicherheit: ["passwort", "2fa", "zwei-faktor", "anmeldung", "konto"],
  Tutorial: ["tour", "einfuehrung", "rundgang"],
  "E-Mail-Status": ["mail", "versand"],
};

/**
 * Ein Eintrag im Zahnradmenü.
 *
 * Meist genau ein Bereich. Wo zwei Bereiche dasselbe Thema haben, fasst ein
 * Eintrag sie zusammen und öffnet ein Untermenü: Protokoll und Sicherheit
 * beantworten beide die Frage „wer war an meinem Zugang", und nebeneinander
 * im Hauptmenü lasen sie sich wie zwei unabhängige Dinge.
 */
export interface MenueEintrag {
  titel: string;
  /** Gesetzt, wenn der Eintrag direkt in einen Bereich führt. */
  bereich?: EinstellungenBereich;
  /** Gesetzt, wenn der Eintrag ein Untermenü öffnet. */
  unterpunkte?: EinstellungenBereich[];
}

/**
 * Welche Bereiche unter einem gemeinsamen Eintrag zusammenrücken.
 *
 * Der Eintrag hieß zuerst „Protokoll & Sicherheit" und zählte damit auf, was
 * darunter steht. Christian hat am 14.09.2026 einen Oberbegriff verlangt, und
 * zu Recht: Ein Menüpunkt, der seine eigenen Unterpunkte wiederholt, sagt
 * nichts, was das aufgeklappte Menü nicht schon zeigt. „Konto & Zugang"
 * benennt stattdessen das Thema, das beide teilen: wer an diesem Zugang war
 * und womit er offen ist.
 */
const ZUSAMMEN: { titel: string; teile: string[] } = {
  titel: "Konto & Zugang",
  teile: ["Protokoll", "Sicherheit"],
};

/**
 * Die Einträge des Zahnradmenüs, in der Reihenfolge der Bereiche.
 *
 * Der zusammengefasste Eintrag steht dort, wo sein erster Teil stünde. So
 * bleibt die Reihenfolge die, die Christian vorgegeben hat, auch wenn zwei
 * Zeilen zu einer werden.
 */
export function einstellungenMenue(rolle: string): MenueEintrag[] {
  const bereiche = einstellungenBereiche(rolle);
  const teile = bereiche.filter((b) => ZUSAMMEN.teile.includes(b.titel));
  const eintraege: MenueEintrag[] = [];
  let zusammengefasst = false;

  for (const bereich of bereiche) {
    if (!ZUSAMMEN.teile.includes(bereich.titel)) {
      eintraege.push({ titel: bereich.titel, bereich });
      continue;
    }
    // Nur beim ersten Teil einfügen, die übrigen sind dann schon drin.
    if (zusammengefasst) continue;
    zusammengefasst = true;
    // Bleibt nur ein Teil übrig, lohnt das Untermenü nicht.
    if (teile.length === 1) {
      eintraege.push({ titel: teile[0].titel, bereich: teile[0] });
    } else {
      eintraege.push({ titel: ZUSAMMEN.titel, unterpunkte: teile });
    }
  }
  return eintraege;
}

/** Aus „E-Mail-Status" wird „e-mail-status". Wie bisher in der Reiterleiste. */
export function bereichSlug(titel: string): string {
  return titel.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");
}

/** Wer einen Bereich im Aufbau trotzdem öffnen darf. Wie in der Seitenleiste. */
const DARF_ENTWURF_OEFFNEN = ["admin", "inhaber"];

/**
 * Bereiche im Aufbau, je Bereich die Route, an der die Sperre hängt.
 *
 * Der Kalender steht hier, weil er in der Seitenleiste als Entwurf geführt
 * wird und es einen seltsamen Eindruck macht, wenn dieselbe Sache an einer
 * Stelle gesperrt ist und an der anderen offen. Die Route ist die Brücke:
 * Wird `/kalender` eines Tages freigegeben, fällt die Sperre hier von selbst
 * mit weg.
 */
const BEREICH_ROUTE: Record<string, string> = {
  Kalender: "/kalender",
};

/**
 * Ist dieser Bereich im Aufbau?
 *
 * Die Seitenleiste kennt zwei Quellen: die zentrale Liste in `draftRoutes.ts`
 * und ein Merkmal am Eintrag selbst. Beim Kalender greift heute nur das
 * zweite, deshalb steht er hier ausdrücklich.
 */
function istEntwurf(titel: string): boolean {
  const route = BEREICH_ROUTE[titel];
  if (!route) return false;
  return isDraftRoute(route) || titel === "Kalender";
}

/**
 * Die Bereiche für eine Rolle, in der Reihenfolge, in der sie erscheinen.
 *
 * Die Reihenfolge ist Christians: Profil, Kalender, Abwesenheit,
 * Benachrichtigungen, Protokoll, Sicherheit, Tutorial, E-Mail-Status.
 */
export function einstellungenBereiche(rolle: string): EinstellungenBereich[] {
  const istKunde = rolle === "kunde";
  const istTippgeber = rolle === "tippgeber";
  const istAdmin = rolle === "admin" || rolle === "inhaber";

  const titel = istKunde
    ? ["Benachrichtigungen", "Protokoll", "Sicherheit"]
    : istTippgeber
      ? ["Profil", "Benachrichtigungen", "Protokoll", "Sicherheit"]
      // „Abwesenheit" nur für interne Rollen: Kunden und Tippgeber haben
      // keine Leads, die jemand vertreten könnte.
      : ["Profil", "Kalender", "Abwesenheit", "Benachrichtigungen", "Protokoll", "Sicherheit"];

  // „Tutorial" (CRM-Tour) für alle internen Rollen außer Kunde und Tippgeber.
  if (!istKunde && !istTippgeber) titel.push("Tutorial");
  if (istAdmin) titel.push("E-Mail-Status");

  const darfEntwurf = DARF_ENTWURF_OEFFNEN.includes(rolle);

  return titel.map((t) => {
    const entwurf = istEntwurf(t);
    const offen = !entwurf || darfEntwurf;
    return {
      titel: t,
      slug: bereichSlug(t),
      entwurf,
      offen,
      abzeichen: entwurf ? (darfEntwurf ? "Entwurf" : "Bald verfügbar") : undefined,
      suchbegriffe: SUCHBEGRIFFE[t],
    };
  });
}
