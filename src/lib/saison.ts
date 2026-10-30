/**
 * Saisonfiguren im CRM (Christian, 30.10.2026).
 *
 * Zu Halloween, Weihnachten und Ostern erscheint eine kleine 3D-Figur, und ihr
 * Klick bringt etwas Nützliches: liegende Leads, Adventskalender, Eiersuche.
 * Hier steht alles ohne React: die Zeiträume, die Schalter und die Inhalte.
 * Ob eine Figur gerade zu sehen ist, entscheidet `useSaison`.
 *
 * Die Strategie mit allen Entscheidungen F1 bis F7 liegt als Artefakt
 * „Saisonfiguren im CRM“ vor und ist so freigegeben.
 */

export type Anlass = "halloween" | "weihnachten" | "ostern";

/** Die Figuren als 3D-Bilder unter `public/images/saison/`, je etwa 40 KB. */
export const FIGUR = {
  geist: "/images/saison/geist.png",
  kuerbis: "/images/saison/kuerbis.png",
  baum: "/images/saison/baum.png",
  geschenk: "/images/saison/geschenk.png",
  hase: "/images/saison/hase.png",
  ei: "/images/saison/ei.png",
} as const;

/** Ein Tag ohne Uhrzeit, in Ortszeit. */
const tag = (jahr: number, monat: number, t: number) => new Date(jahr, monat - 1, t);

/** Ostersonntag nach der gregorianischen Osterformel (Meeus/Jones/Butcher). */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const t = ((h + l - 7 * m + 114) % 31) + 1;
  return tag(jahr, monat, t);
}

/** Erster Advent: vier Sonntage vor Weihnachten, also der Sonntag vom 27.11. bis 3.12. */
export function ersterAdvent(jahr: number): Date {
  const heiligabend = tag(jahr, 12, 24);
  // Vierter Advent ist der Sonntag am oder vor dem 24.12.
  const vierter = new Date(heiligabend);
  vierter.setDate(24 - heiligabend.getDay());
  const erster = new Date(vierter);
  erster.setDate(vierter.getDate() - 21);
  return erster;
}

const plusTage = (d: Date, n: number) => {
  const neu = new Date(d);
  neu.setDate(neu.getDate() + n);
  return neu;
};

/** Von und bis je einschließlich, als Tage. */
export function zeitraum(anlass: Anlass, jahr: number): { von: Date; bis: Date } {
  if (anlass === "halloween") return { von: tag(jahr, 10, 24), bis: tag(jahr, 10, 31) };
  if (anlass === "weihnachten") return { von: ersterAdvent(jahr), bis: tag(jahr, 12, 26) };
  const ostern = ostersonntag(jahr);
  // Gründonnerstag bis Ostermontag
  return { von: plusTage(ostern, -3), bis: plusTage(ostern, 1) };
}

/**
 * Welcher Anlass läuft an diesem Tag? `null` außerhalb aller Zeiträume.
 * Halloween läuft schon 2026, gebaut am 30.10. (Christian: „ist ja morgen“).
 */
export function anlassAm(datum: Date): Anlass | null {
  const t = tag(datum.getFullYear(), datum.getMonth() + 1, datum.getDate());
  for (const anlass of ["halloween", "weihnachten", "ostern"] as const) {
    const { von, bis } = zeitraum(anlass, t.getFullYear());
    if (t >= von && t <= bis) return anlass;
  }
  return null;
}

// ─── Schalter ───────────────────────────────────────────────────────────

/** In `app_config`: welche Anlässe für alle laufen. Fehlt ein Eintrag, läuft er. */
export const SCHLUESSEL_ZENTRAL = "saison_figuren";
export type ZentraleSchalter = Partial<Record<Anlass, boolean>>;

/** In `user_settings`: `true` heißt, dieser Nutzer will keine Figuren. */
export const SCHLUESSEL_AUS = "saison_figuren_aus";
/** In `user_settings`: Tag (JJJJ-MM-TT), an dem „Heute ausblenden“ gedrückt wurde. */
export const SCHLUESSEL_HEUTE_AUS = "saison_figuren_heute_aus";
/** In `user_settings`, je Jahr: gefundene Ostereier und das Abzeichen. */
export const schluesselOstern = (jahr: number) => `saison_ostern_${jahr}`;
export type OsterStand = { gefunden: string[]; abzeichenAm?: string };

export const heuteText = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Wer Figuren sehen darf: alle internen Rollen (F5). Kunden, Tippgeber und
 * Bewerber nie, dort zählt die Außenwirkung.
 */
export function rolleSiehtFiguren(rolle: string | undefined): boolean {
  return !!rolle && !["kunde", "tippgeber", "bewerber"].includes(rolle);
}

/**
 * Vorschau für Admin und Inhaber: `?saison=weihnachten` (oder `ostern`,
 * `halloween`) zeigt den Anlass außerhalb seines Zeitraums, `?saison=aus`
 * beendet die Vorschau. Sie gilt bis zum Schließen des Tabs.
 */
const VORSCHAU = "saison_vorschau";
export function vorschauAnlass(rolle: string | undefined, suche: string): Anlass | null {
  if (rolle !== "admin" && rolle !== "inhaber") return null;
  try {
    const wert = new URLSearchParams(suche).get("saison");
    if (wert === "aus") sessionStorage.removeItem(VORSCHAU);
    else if (wert === "halloween" || wert === "weihnachten" || wert === "ostern") sessionStorage.setItem(VORSCHAU, wert);
    const gemerkt = sessionStorage.getItem(VORSCHAU);
    return gemerkt === "halloween" || gemerkt === "weihnachten" || gemerkt === "ostern" ? gemerkt : null;
  } catch {
    return null;
  }
}

// ─── Ostern ─────────────────────────────────────────────────────────────

/** Mögliche Verstecke. Drei davon gelten je Jahr, damit es nicht langweilig wird. */
export const VERSTECKE = ["pipeline", "kalender", "unterlagen", "kontakte", "objekte"] as const;
export type Versteck = (typeof VERSTECKE)[number];
export const VERSTECK_NAME: Record<Versteck, string> = {
  pipeline: "in der Pipeline",
  kalender: "im Kalender",
  unterlagen: "in den Unterlagen",
  kontakte: "bei den Kontakten",
  objekte: "bei den Objekten",
};

/** Das Jahr des nächsten (oder laufenden) Osterfests, auch für die Vorschau im Herbst. */
export function osterJahr(datum: Date): number {
  const jahr = datum.getFullYear();
  // Bis einschließlich Ostermontag zählt noch das laufende Jahr.
  return datum < plusTage(zeitraum("ostern", jahr).bis, 1) ? jahr : jahr + 1;
}

/** Die drei Verstecke dieses Jahres, reihum aus der Liste. */
export function versteckeImJahr(jahr: number): Versteck[] {
  const start = (jahr - 2027 + VERSTECKE.length * 100) % VERSTECKE.length;
  return [0, 1, 2].map((i) => VERSTECKE[(start + i) % VERSTECKE.length]);
}

// ─── Weihnachten ────────────────────────────────────────────────────────

export type Tuerchen =
  | { art: "tipp"; text: string }
  | { art: "einwand"; einwand: string; antwort: string }
  | { art: "zahl"; zahl: "kontakte" | "termine" | "inArbeit" }
  | { art: "jahr" };

/** Die 24 Türchen. Tipps führen in die Akademie, Einwände in die Einwand-Bibliothek. */
export const TUERCHEN: Tuerchen[] = [
  { art: "tipp", text: "Je schneller du einen neuen Lead anrufst, desto besser erreichst du ihn. Am besten noch am selben Tag." },
  { art: "einwand", einwand: "Ich habe gerade keine Zeit.", antwort: "Frag nach zehn Minuten zu einem festen Termin und schlag zwei Uhrzeiten vor." },
  { art: "zahl", zahl: "kontakte" },
  { art: "tipp", text: "Schreib nach jedem Gespräch eine kurze Notiz ins Kundenprofil. So weiß auch deine Vertretung sofort Bescheid." },
  { art: "einwand", einwand: "Immobilien sind gerade zu teuer.", antwort: "Rechne mit dem Kunden die monatliche Belastung nach Steuer vor, statt über den Kaufpreis zu reden." },
  { art: "tipp", text: "Heute ist Nikolaus. Schick einem Bestandskunden einen kurzen Gruß. Zufriedene Kunden empfehlen weiter." },
  { art: "zahl", zahl: "termine" },
  { art: "tipp", text: "Geh den Investmentrechner im Gespräch gemeinsam mit dem Kunden durch. Zahlen, die er selbst sieht, überzeugen mehr." },
  { art: "einwand", einwand: "Ich muss das erst mit meiner Frau besprechen.", antwort: "Biete einen Termin zu dritt an, statt Unterlagen mitzugeben." },
  { art: "tipp", text: "Leg nach jedem Gespräch gleich den nächsten Schritt mit Datum an. Ein Lead ohne nächsten Schritt gerät schnell in Vergessenheit." },
  { art: "zahl", zahl: "inArbeit" },
  { art: "einwand", einwand: "Ich warte lieber, bis die Zinsen sinken.", antwort: "Rechne gemeinsam durch, was das Warten kostet: Mieteinnahmen und Steuervorteil fallen in der Zeit weg." },
  { art: "tipp", text: "Frag am Ende eines guten Gesprächs nach einer Empfehlung. Dann ist der Kunde zufrieden und denkt gern an andere." },
  { art: "einwand", einwand: "Ich habe schon eine Immobilie.", antwort: "Frag, wie sie sich entwickelt hat. Oft ist genau das der Einstieg für die zweite." },
  { art: "tipp", text: "Schau vor dem Beratungsgespräch in die Selbstauskunft. Dann kommst du mit passenden Objekten statt mit allgemeinen Ideen." },
  { art: "zahl", zahl: "termine" },
  { art: "einwand", einwand: "Das ist mir zu riskant.", antwort: "Sprich die Risiken offen an und zeig, wo Mietausfall und Rücklagen in der Rechnung schon stecken." },
  { art: "tipp", text: "Wen du nicht erreichst, den ruf zu einer anderen Uhrzeit an. Morgens und am frühen Abend klappt es oft besser." },
  { art: "zahl", zahl: "kontakte" },
  { art: "einwand", einwand: "Schick mir erst mal was zu.", antwort: "Schick das Exposé und vereinbare gleich einen Termin, um es gemeinsam durchzugehen." },
  { art: "tipp", text: "Schau einmal in der Woche auf die Leads, die lange liegen. Dort warten die Kunden, die am ehesten verloren gehen." },
  { art: "einwand", einwand: "Ich kenne mich mit Immobilien nicht aus.", antwort: "Genau dafür bist du da. Erklär einen Schritt nach dem anderen und frag nach, was noch unklar ist." },
  { art: "tipp", text: "Plan die Termine für Januar jetzt schon ein. Wer mit vollem Kalender ins neue Jahr startet, startet stark." },
  { art: "jahr" },
];

/** Wie viele Türchen heute offen sind: 0 vor dem 1.12., ab dem 24.12. alle. */
export function offeneTuerchen(datum: Date): number {
  if (datum.getMonth() !== 11) return datum.getMonth() < 11 ? 0 : 24;
  return Math.min(24, datum.getDate());
}

// ─── Halloween ──────────────────────────────────────────────────────────

/** Ab so vielen Tagen ohne Aktivität „geistert“ ein Lead herum. */
export const GEISTER_TAGE = 14;
