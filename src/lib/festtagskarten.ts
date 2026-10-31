/**
 * Festtagskarten (Christian, 30. und 31.10.2026).
 *
 * Beim ersten Anmelden an Weihnachten (24. bis 26.12.), an Silvester (31.12.
 * und 1.1.) und am eigenen Geburtstag erscheint eine Postkarte von Oliver
 * Skowrnowski und dem OS Real Estate Team. Vorderseite mit Animation, Rückseite
 * mit dem Gruß, dazu ein PDF zum Herunterladen.
 *
 * Weihnachten und Geburtstag haben je drei Motive, die jährlich wechseln
 * (2026 Motiv 1, 2027 Motiv 2, 2028 Motiv 3, dann von vorn). Silvester hat
 * ein Motiv mit der jeweiligen Jahreszahl.
 *
 * Hier steht alles ohne React: Zeiträume, Motivwahl und Texte. Die Karte
 * selbst ist `components/saison/Festtagskarte.tsx`.
 */
import { leseGeburtstag, tageBisGeburtstag } from "./geburtstage";
import type { Sprache } from "./kundenSprache";

export type Anlass = "weihnachten" | "silvester" | "geburtstag";
export type Motiv = 1 | 2 | 3;
/** Interne Rollen und Partner im CRM werden geduzt, Kunden und Tippgeber gesiezt. */
export type Ton = "du" | "sie";

export interface Festtag {
  anlass: Anlass;
  /** Weihnachten und Geburtstag: das Kalenderjahr. Silvester: das Jahr, das endet. */
  jahr: number;
  motiv: Motiv;
}

/** Erstes Jahr der Karten, damit Motiv 1 zuerst kommt. */
const STARTJAHR = 2026;

export function motivImJahr(jahr: number): Motiv {
  return ((((jahr - STARTJAHR) % 3) + 3) % 3 + 1) as Motiv;
}

/**
 * Welche Karte ist an diesem Tag dran? Der Geburtstag geht vor: fällt er auf
 * einen Feiertag, kommt die Festtagskarte bei der nächsten Anmeldung.
 */
export function festtagAm(datum: Date, geburtstag?: string | null): Festtag | null {
  const jahr = datum.getFullYear();
  const monat = datum.getMonth() + 1;
  const tag = datum.getDate();
  const g = leseGeburtstag(geburtstag);
  if (g && tageBisGeburtstag(g, datum) === 0) return { anlass: "geburtstag", jahr, motiv: motivImJahr(jahr) };
  if (monat === 12 && tag >= 24 && tag <= 26) return { anlass: "weihnachten", jahr, motiv: motivImJahr(jahr) };
  if (monat === 12 && tag === 31) return { anlass: "silvester", jahr, motiv: 1 };
  if (monat === 1 && tag === 1) return { anlass: "silvester", jahr: jahr - 1, motiv: 1 };
  return null;
}

/** In `user_settings`: diese Karte hat der Nutzer schon gesehen. */
export const gesehenSchluessel = (f: Festtag) => `festtagskarte_${f.anlass}_${f.jahr}`;

/** Bewerber bekommen keine Karte, alle anderen Rollen schon. */
export function tonFuerRolle(rolle: string | undefined): Ton | null {
  if (!rolle || rolle === "bewerber") return null;
  return rolle === "kunde" || rolle === "tippgeber" ? "sie" : "du";
}

export interface Empfaenger {
  ton: Ton;
  /** Englisch gibt es nur für Kunden, nach ihrem Profil. */
  sprache: Sprache;
  vorname: string;
  nachname: string;
  anrede?: string | null;
  /** Zweite Adresszeile, etwa „Vertriebspartner“. Bei Kunden leer, dann gilt „Kunde der OS Real Estate“. */
  rolle?: string;
}

export interface KartenTexte {
  augenbraue: string;
  gruss: string;
  anrede: string;
  kurz: string;
  brief: string;
  unterschrift: string;
  team: string;
  stempel: string;
  an: [string, string];
  briefmarke: string;
  poststempel: string;
  umdrehen: string;
  pdf: string;
  pdfLaeuft: string;
  pdfFehler: string;
  schliessen: string;
  dateiname: string;
}

const MONATE_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONATE_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const zwei = (n: number) => String(n).padStart(2, "0");

function anredeZeile(e: Empfaenger): string {
  const name = `${e.vorname} ${e.nachname}`.trim();
  if (e.ton === "du") return `Hallo ${e.vorname || name},`;
  const herr = e.anrede === "Herr";
  const frau = e.anrede === "Frau";
  if (e.sprache === "en") {
    if ((herr || frau) && e.nachname) return `Dear ${herr ? "Mr" : "Ms"} ${e.nachname},`;
    return `Dear ${name},`;
  }
  if ((herr || frau) && e.nachname) return `${herr ? "Lieber Herr" : "Liebe Frau"} ${e.nachname},`;
  return `Guten Tag ${name},`;
}

/** Brieftexte je Anlass, Ton und Sprache. `j` ist das Jahr, `n` das neue. */
function brieftexte(anlass: Anlass, ton: Ton, en: boolean, j: number) {
  const n = j + 1;
  if (anlass === "weihnachten") {
    if (en) return {
      gruss: "Merry Christmas!",
      kurz: "We're glad you're with us. Turn the card over, we've written you a note.",
      brief: "as the year comes to an end, we simply want to say thank you for your trust in OS Real Estate. It's a pleasure to count you among our clients. We wish you and your loved ones a merry Christmas, peaceful holidays and a healthy, happy New Year.",
    };
    return ton === "du"
      ? {
          gruss: "Merry Christmas!",
          kurz: "Danke für ein starkes Jahr. Dreh die Karte um, wir haben dir etwas geschrieben.",
          brief: "danke für deinen Einsatz, deine Ideen und die richtig gute Zusammenarbeit in diesem Jahr. Ohne dich wäre vieles nicht möglich gewesen. Wir wünschen dir und deinen Liebsten eine schöne, besinnliche Weihnachtszeit und ein paar ruhige Tage zum Durchatmen.",
        }
      : {
          gruss: "Merry Christmas!",
          kurz: "Schön, dass es Sie gibt. Drehen Sie die Karte um, wir haben Ihnen etwas geschrieben.",
          brief: "zum Jahresende möchten wir einfach Danke sagen: für Ihr Vertrauen in OS Real Estate. Es ist schön, Sie zu unseren Kunden zählen zu dürfen. Wir wünschen Ihnen und Ihren Liebsten frohe Weihnachten, ruhige Feiertage und ein gesundes, glückliches neues Jahr.",
        };
  }
  if (anlass === "silvester") {
    if (en) return {
      gruss: "Happy New Year!",
      kurz: "Here's to a great new year. Turn the card over, we've written you a note.",
      brief: `${j} is coming to an end, and we'd like to thank you for your trust in OS Real Estate. We wish you and your loved ones a wonderful New Year's Eve and health, happiness and success in ${n}.`,
    };
    return ton === "du"
      ? {
          gruss: "Prosit Neujahr!",
          kurz: "Komm gut rüber! Dreh die Karte um, wir haben dir etwas geschrieben.",
          brief: `was für ein Jahr! Danke, dass du ${j} mit uns gestaltet hast. Wir freuen uns auf ${n}: auf neue Ziele, gemeinsame Erfolge und viele gute Gespräche. Feier schön, komm gut rüber und starte mit Schwung ins neue Jahr.`,
        }
      : {
          gruss: "Prosit Neujahr!",
          kurz: "Auf ein gutes neues Jahr. Drehen Sie die Karte um, wir haben Ihnen etwas geschrieben.",
          brief: `das Jahr ${j} geht zu Ende, und wir möchten Danke sagen für Ihr Vertrauen in OS Real Estate. Wir wünschen Ihnen und Ihren Liebsten einen schönen Jahreswechsel und für ${n} Gesundheit, Glück und Zufriedenheit.`,
        };
  }
  if (en) return {
    gruss: "Happy Birthday!",
    kurz: "Today is your day. Turn the card over, we've written you a note.",
    brief: "happy birthday from all of us at OS Real Estate! We wish you health, happiness and contentment in the year ahead and a wonderful day with the people you love.",
  };
  return ton === "du"
    ? {
        gruss: "Happy Birthday!",
        kurz: "Heute ist dein Tag. Dreh die Karte um, wir haben dir etwas geschrieben.",
        brief: "alles Gute zum Geburtstag! Schön, dass du Teil von OS Real Estate bist. Wir wünschen dir ein neues Lebensjahr voller Gesundheit, Erfolg und Momente, die du nicht vergisst. Lass dich heute ordentlich feiern.",
      }
    : {
        gruss: "Alles Gute!",
        kurz: "Heute ist Ihr Tag. Drehen Sie die Karte um, wir haben Ihnen etwas geschrieben.",
        brief: "zu Ihrem Geburtstag gratulieren wir Ihnen herzlich. Wir wünschen Ihnen Gesundheit, Glück und Zufriedenheit für das neue Lebensjahr und einen wunderschönen Tag im Kreis Ihrer Liebsten.",
      };
}

export function kartenTexte(f: Festtag, e: Empfaenger, heute: Date = new Date()): KartenTexte {
  // Englisch nur beim Siezen, intern ist die Oberfläche deutsch.
  const en = e.sprache === "en" && e.ton === "sie";
  const j = f.jahr;
  const kurzJahr = zwei(j % 100);
  const augenbraue =
    f.anlass === "weihnachten" ? (en ? `Christmas ${j}` : `Weihnachten ${j}`)
    : f.anlass === "silvester" ? (en ? `New Year's Eve ${j}` : `Silvester ${j}`)
    : en ? `Birthday · ${heute.getDate()} ${MONATE_EN[heute.getMonth()]}` : `Geburtstag · ${heute.getDate()}. ${MONATE_DE[heute.getMonth()]}`;
  const poststempel =
    f.anlass === "weihnachten" ? `24.12.${kurzJahr}`
    : f.anlass === "silvester" ? `31.12.${kurzJahr}`
    : `${zwei(heute.getDate())}.${zwei(heute.getMonth() + 1)}.${zwei(heute.getFullYear() % 100)}`;
  const briefmarke =
    f.anlass === "weihnachten" ? (en ? "MERRY XMAS" : "FROHES FEST")
    : f.anlass === "silvester" ? `PROSIT ${j + 1}`
    : "HAPPY BIRTHDAY";
  const art = f.anlass === "weihnachten" ? (en ? "Christmas card" : "Weihnachtskarte")
    : f.anlass === "silvester" ? (en ? "New Year card" : "Neujahrskarte")
    : en ? "Birthday card" : "Geburtstagskarte";
  const zweiteZeile = e.rolle
    || (en ? "Client of OS Real Estate" : e.anrede === "Frau" ? "Kundin der OS Real Estate" : "Kunde der OS Real Estate");

  return {
    augenbraue,
    ...brieftexte(f.anlass, e.ton, en, j),
    anrede: anredeZeile(e),
    unterschrift: en ? "Yours, Oliver Skowrnowski" : e.ton === "sie" ? "Ihr Oliver Skowrnowski" : "Oliver Skowrnowski",
    team: en ? "and the OS Real Estate team" : "und das OS Real Estate Team",
    stempel: en ? "Reserved for you" : e.ton === "sie" ? "Reserviert für Sie" : "Reserviert für dich",
    an: [`${e.vorname} ${e.nachname}`.trim(), zweiteZeile],
    briefmarke,
    poststempel,
    umdrehen: en ? "Turn card over" : "Karte umdrehen",
    pdf: en ? "Download as PDF" : "Als PDF herunterladen",
    pdfLaeuft: en ? "Creating …" : "Wird erstellt …",
    pdfFehler: en ? "The PDF could not be created." : "Das PDF konnte nicht erstellt werden.",
    schliessen: en ? "Close" : "Schließen",
    dateiname: `${art} OS Real Estate ${f.anlass === "geburtstag" ? heute.getFullYear() : j}.pdf`,
  };
}
