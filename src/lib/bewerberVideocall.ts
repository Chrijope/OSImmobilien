/**
 * Der Videocall des neuen Bewerberprozesses: sechs Kernbausteine, sechs
 * Module, fünf Strecken.
 *
 * ## Warum diese Datei neben `praesentationsDeck.ts` steht
 *
 * `praesentationsDeck.ts` beschreibt das bestehende Bewerbergespräch mit
 * seinen 22 Folien und den vier Pfaden aus `assessmentSkript.ts`. Es läuft
 * heute in der Hand der HR-Managerin, und im bestehenden Bewerbungsmanagement
 * darf sich daran nichts ändern. Der neue Ablauf braucht dagegen etwas ganz
 * anderes: einen gemeinsamen Kern, zuschaltbare Module und Folien, die die
 * Antworten aus dem Kennenlernen aufgreifen, statt sie noch einmal zu
 * erfragen.
 *
 * Beides in eine Datei zu zwingen, hätte den bestehenden Ablauf angefasst,
 * ohne dass irgendjemand etwas davon hat. Deshalb steht der neue Ablauf hier
 * **daneben**, nach demselben Muster wie `bewerberArbeitsplatz.ts`: eine
 * gemeinsame Oberfläche, zwei Beschreibungen. Der Kundenablauf ist von beidem
 * ohnehin nicht betroffen; `praesentationsDeck.ts` und `assessmentSkript.ts`
 * werden ausschließlich im Bewerbermanagement gelesen.
 *
 * ## Der Aufbau in einem Satz
 *
 * Sieben Kernbausteine laufen in jedem Gespräch. Die sechs Module kommen aus
 * der Strecke des Bewerbers (die Weiche im Kennenlernen) und aus seinen
 * offenen Fragen; die HR-Managerin kann jede Auswahl im Gespräch ändern. Die
 * Folienzahl liegt damit zwischen sieben und zehn statt zwischen sechzehn und
 * neunzehn, die Dauer zwischen 31 und 46 Minuten.
 *
 * Sieben Kernbausteine waren es bis zum 08.09.2026. Die Arbeitsprobe ist auf
 * allen fünf Strecken entfallen, mit ihr die Fassung mit Vorlauf. Sie kostete
 * sieben Minuten und war der einzige Baustein, der den Bewerber prüfte statt
 * ihn zu informieren; genau das gehört nicht in dieses Gespräch. Was sie
 * beobachtet hat, ist damit nicht ersetzt, sondern gestrichen.
 *
 * ## Was hier bewusst nicht vorkommt
 *
 * Keine Punktzahl, keine Eignungsprozente, keine Aussage darüber, wie viele
 * Kunden aus einer Berufsgruppe zu erwarten sind, und kein Lob ohne
 * Grundlage. Diese vier Verbote gelten auf allen fünf Strecken gleich und
 * stehen zusätzlich als Kasten auf der Folie zur Ausgangslage.
 *
 * Reine Rechnerei ohne Oberfläche, damit sie sich ohne Attrappen prüfen lässt.
 * Die Ansichten rendern entlang dieser Listen:
 * `BewerberVideocallPraesentation.tsx` zeigt die Folien, die der Bewerber
 * sieht, `BewerberVideocallModeration.tsx` den Bildschirm der HR-Managerin.
 */

import {
  ALTFRAGEN,
  DAUER_LANG_MINUTEN,
  anschlussUnten,
  ansichtNummer,
  ansichtenFuer,
  antwortText,
  fragenDerAnsicht,
  getWeg,
  istKennenlernen,
  optionLabel,
  themenLabels,
  type KennenlernenAntworten,
  type KennenlernenFrage,
  type WegId,
} from "./bewerberKennenlernen";
import { LEAD_PAKET_ANZAHL, LEAD_PAKET_PREIS } from "./lizenzPakete";
import { GESTELLTE_ZUSATZLEISTUNGEN } from "./vertragKonditionen";
import { BEISPIEL_KAUFPREIS_EUR, BEISPIEL_PROVISION_EUR, PROVISION_PROZENT } from "./assessmentSkript";

// ───────────────────────────── Die Bausteine ──────────────────────────────

export type KernId =
  | "begruessung"
  | "ausgangslage"
  | "arbeitsteilung"
  | "service"
  | "bedingungen"
  | "weitergehen";

export type ModulId = "m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7";

export type BausteinId = KernId | ModulId;

export type Kernbaustein = {
  id: KernId;
  /** Nummer, wie sie auf der Folie steht. Die Servicefolie trägt keine. */
  nummer: number | null;
  /** Kurzname in der Schrittliste der Moderation. */
  titel: string;
  /** Kopfzeile der Folie, mit Minutenangabe, wo eine dasteht. */
  kopfzeile: string;
  /**
   * Die Minuten, die dieser Baustein im Termin kostet.
   *
   * Die Summe der sechs ist 26. Die Ausgangslage hat keine eigene Zeile in
   * der Tagesordnung, sie läuft dort mit der Arbeitsteilung zusammen als
   * „Deine beiden Themen, 10 Minuten".
   */
  minuten: number;
  woherErKommt: string;
};

/**
 * Die sechs Kernbausteine, in der Reihenfolge des Termins.
 *
 * Die Module schieben sich zwischen Arbeitsteilung und Servicefolie, das ist
 * die einzige Stelle, an der die Folge auseinandergeht.
 */
export const KERNBAUSTEINE: Kernbaustein[] = [
  {
    id: "begruessung",
    nummer: 1,
    titel: "Begrüßung und Tagesordnung",
    kopfzeile: "Begrüßung, 3 Minuten",
    minuten: 3,
    woherErKommt: "Seine Themen und seine eigene Frage im Wortlaut",
  },
  {
    id: "ausgangslage",
    nummer: 2,
    titel: "Deine Ausgangslage",
    kopfzeile: "Deine Ausgangslage",
    minuten: 7,
    woherErKommt: "Greift die Rückmeldung aus dem Kennenlernen auf, ohne sie vorzulesen",
  },
  {
    id: "arbeitsteilung",
    nummer: 3,
    titel: "Die Arbeitsteilung",
    kopfzeile: "Die Arbeitsteilung, 3 Minuten",
    minuten: 3,
    woherErKommt: "Fünf Schritte, bei jedem steht, wer ihn macht",
  },
  {
    id: "service",
    nummer: null,
    titel: "Was ab Tag 1 bereitsteht",
    kopfzeile: "Was ab Tag 1 bereitsteht, 3 Minuten",
    minuten: 3,
    /*
     * Ohne Nummer, weil `KERNBAUSTEINE` für alle Bewerber gilt und die Nummer
     * am Weg hängt. Genannt wird deshalb die Ansicht bei ihrem Namen.
     */
    woherErKommt: "Was das Haus stellt, wie es im Kennenlernen auf der Ansicht zum ersten Tag steht",
  },
  {
    id: "bedingungen",
    nummer: 4,
    titel: "Die Bedingungen",
    kopfzeile: "Bedingungen, 5 Minuten",
    minuten: 5,
    woherErKommt: "Bestätigen statt erklären, dazu die offenen Punkte des Falls",
  },
  {
    id: "weitergehen",
    nummer: 5,
    titel: "Wie es weitergeht",
    kopfzeile: "Wie es weitergeht, 5 Minuten",
    minuten: 5,
    woherErKommt: "Zwei getrennte Entscheidungen, drei gleich große Türen",
  },
];

/** Die Dauer eines Moduls. Alle sechs sind gleich lang. */
export const MODUL_MINUTEN = 5;

export type Modul = {
  id: ModulId;
  /** Nummer, wie sie im Papier steht. Die Reihenfolge im Termin ist anders. */
  nummer: number;
  titel: string;
  /** Kurzname in der Modulliste der Moderation. */
  kurz: string;
  /** Die Zeile, mit der das Modul in der Tagesordnung auf Folie 1 steht. */
  agenda: string;
  /**
   * Der Satz, der auf der Folie über dem Inhalt steht.
   *
   * Seit dem 08.09.2026 heißt es hier „Interessenten" und nicht mehr
   * „Menschen". Der Bewerber, der die Folie sieht, ist genau das: jemand, der
   * sich für eine Zusammenarbeit interessiert. „Menschen" traf auf jeden zu
   * und sagte deshalb nichts.
   */
  fuerWen: string;
  woherErKommt: string;
};

export const MODULE: Modul[] = [
  {
    id: "m1",
    nummer: 1,
    titel: "Objektangebot",
    kurz: "Objektangebot",
    agenda: "Das Objektangebot und der Käufertyp",
    fuerWen: "Nur für Interessenten, die heute schon Immobilien verkaufen.",
    woherErKommt: "Aus den Folien 7 und 8 der bisherigen Fassung, für Weg 1",
  },
  {
    id: "m2",
    nummer: 2,
    titel: "Übergang aus der Beratung",
    kurz: "Übergang aus der Beratung",
    agenda: "Der Übergang aus der Beratung",
    fuerWen: "Für Interessenten aus Finanzberatung oder Versicherung.",
    woherErKommt: "Die Brückenfolie des Wegs 2, mit der Abgrenzung 34d, 34f, 34c",
  },
  {
    id: "m3",
    nummer: 3,
    titel: "Der lange Zyklus",
    kurz: "Langer Zyklus",
    agenda: "Der lange Zyklus, und was er für deine Woche heißt",
    fuerWen: "Für Interessenten aus einem anderen Vertrieb.",
    woherErKommt: "Die Vergleichsfolie des Wegs 3, ohne feste Wochenzahl",
  },
  {
    id: "m4",
    nummer: 4,
    titel: "Einstieg in die Beratung",
    kurz: "Einstieg Beratung",
    agenda: "Wie ein Beratungsgespräch abläuft",
    fuerWen: "Für Interessenten, die Immobilien aus einer anderen Rolle kennen.",
    woherErKommt: "Die Gesprächsfolie des Wegs 4, vier Schritte",
  },
  {
    id: "m5",
    nummer: 5,
    titel: "Lernplan",
    kurz: "Lernplan",
    agenda: "Der Lernplan, an Voraussetzungen geknüpft",
    fuerWen: "Für den Quereinstieg, und für jeden, der danach fragt.",
    woherErKommt: "Die Lehrplanfolie des Wegs 5, an Voraussetzungen statt an Wochen",
  },
  {
    id: "m6",
    nummer: 6,
    titel: "Konditionen einordnen",
    kurz: "Konditionen einordnen",
    agenda: "Wo sich unsere Konditionen einordnen",
    fuerWen: "Für Interessenten, die schon abgerechnet haben und wissen, was üblich ist.",
    woherErKommt: "Die zweite Wegfolie der bisherigen Fassung, jetzt zuschaltbar",
  },
  {
    id: "m7",
    nummer: 7,
    titel: "Das zweite Produkt",
    kurz: "Zweites Produkt",
    agenda: "Das zweite Produkt, und was es dir bringt",
    fuerWen: "Für Interessenten aus Finanzberatung oder Versicherung.",
    woherErKommt:
      "Neu auf Weg 2. Im Kennenlernen stehen nur die Vorteile, hier wird das Produkt benannt.",
  },
];

/**
 * Der Schlusssatz des Moduls „Das zweite Produkt".
 *
 * Wörtlich so freigegeben (Punkt O1 der Sollfassung vom 07.09.2026): Die
 * Konditionen dieses Produkts stehen ausdrücklich **nicht** auf der Folie.
 * Sie sind Sache der Geschäftsleitung, in einem eigenen Termin.
 */
export const ZWEITES_PRODUKT_SCHLUSSSATZ =
  "Zu den Konditionen dieses Produkts führen wir ein eigenes Gespräch. Dort geht unsere " +
  "Geschäftsleitung mit dir die Einzelheiten durch, von der Vergütung bis zur Abwicklung.";

/** Wie das zweite Produkt auf der Folie heißt. Im Kennenlernbogen bleibt es namenlos. */
export const ZWEITES_PRODUKT_NAME = "Die Netto-Police";

/**
 * Was aus den achtzehn Folien der bisherigen Fassung geworden ist.
 *
 * **Keine davon wird ersatzlos gestrichen.** Die Substanz wandert entweder in
 * einen Kernbaustein, in ein Modul oder vor das Gespräch, also in den
 * Kennenlernbogen. Die Tabelle steht hier und nicht nur im Papier, damit sie
 * sich prüfen lässt: Jedes Ziel muss es wirklich geben.
 *
 * `ziel` ist ein Baustein dieser Datei, `vorab` heißt: steht im Kennenlernen
 * und wird im Gespräch nicht wiederholt.
 */
export type FolienHerkunft = {
  /** Die Folie der bisherigen Fassung, mit ihrer Nummer. */
  alt: string;
  ziel: BausteinId | "vorab";
  /** Was sich dabei ändert. */
  was: string;
};

export const FOLIEN_HERKUNFT: FolienHerkunft[] = [
  { alt: "1 · Deine Punkte", ziel: "begruessung", was: "Gekürzt auf zwei priorisierte Themen, Ablauf und Dauer" },
  { alt: "2 · Dein Weg", ziel: "ausgangslage", was: "Geht in Begrüßung und Ausgangslage auf, keine Wiederholung aller fünf Wege" },
  { alt: "3 · Deine Zahlen", ziel: "ausgangslage", was: "Nur bei Bedarf, ohne Erfolgsprognose aus Arbeitszeit" },
  { alt: "4 · Kundenherkunft", ziel: "arbeitsteilung", was: "Leads ohne Erfolgszusage, bei Bedarf zusätzlich ein Modul" },
  { alt: "5 · Startzeitstrahl", ziel: "m5", was: "Mit Freigaben statt garantiertem Wochenplan" },
  { alt: "6 · Eigene Frage", ziel: "begruessung", was: "In die Tagesordnung, am passenden Punkt statt künstlich später" },
  { alt: "7 · Produkte", ziel: "m1", was: "Grundwissen kommt vorab im Kennenlernen" },
  { alt: "8 · Dealablauf", ziel: "arbeitsteilung", was: "Gebündelt mit der Arbeitsteilung" },
  { alt: "9 · Echter Fall", ziel: "vorab", was: "Nur mit Nachweis, sonst ausdrücklich als Rechenbeispiel" },
  { alt: "10 · Schwierige Arbeit", ziel: "arbeitsteilung", was: "Keine zusätzliche Problemfolie" },
  { alt: "11 · Aufteilung", ziel: "arbeitsteilung", was: "Zum Kern verdichtet" },
  { alt: "12 · Leistungen", ziel: "service", was: "Die Kernfolie zu den gestellten Leistungen, vorab schon auf der Ansicht zum ersten Tag" },
  { alt: "13 · Werte", ziel: "vorab", was: "Vorab oder als Schlussgedanke, keine Pflichtfolie" },
  { alt: "14 · Partnerstimmen", ziel: "vorab", was: "Optional vorab, nur echte und freigegebene Aussagen" },
  { alt: "15 · Bedingungen", ziel: "bedingungen", was: "Gezielt bestätigen statt neu erklären" },
  { alt: "16 · Offene Fragen", ziel: "begruessung", was: "Durchgehend erlaubt, nicht erst am Schluss" },
  { alt: "17 · Erwartungen", ziel: "weitergehen", was: "Dialog statt Häkchenritual" },
  { alt: "18 · Nächste Schritte", ziel: "weitergehen", was: "Neutral betitelt, ohne Pflicht-Rückruf" },
  { alt: "Weg 1 · Objekte", ziel: "m1", was: "Wird Modul 1" },
  { alt: "Weg 1 · Konditionen", ziel: "m6", was: "Wird Modul 6, in dieser Fassung wieder aufgenommen" },
  { alt: "Weg 2 · Brücke", ziel: "m2", was: "Wird Modul 2" },
  { alt: "Weg 2 · Zweites Produkt", ziel: "m7", was: "Neu, benennt das Produkt und nennt keine Konditionen" },
  { alt: "Weg 3 · Produktvergleich", ziel: "m3", was: "Wird Modul 3" },
  { alt: "Weg 4 · Beratungsgespräch", ziel: "m4", was: "Wird Modul 4" },
  { alt: "Weg 5 · Lehrplan", ziel: "m5", was: "Wird Modul 5" },
];

export function getKern(id: KernId): Kernbaustein {
  const k = KERNBAUSTEINE.find((b) => b.id === id);
  if (!k) throw new Error(`Unbekannter Kernbaustein: ${id}`);
  return k;
}

export function getModul(id: ModulId): Modul {
  const m = MODULE.find((b) => b.id === id);
  if (!m) throw new Error(`Unbekanntes Modul: ${id}`);
  return m;
}

/** Die Summe der sechs Kernbausteine: 26 Minuten. */
export const KERN_MINUTEN = KERNBAUSTEINE.reduce((s, b) => s + b.minuten, 0);

// ───────────────────────── Die fünf Strecken ──────────────────────────────

/** Was ein Modul auf einer Strecke ist: gesetzt, bei Bedarf oder gar nicht. */
export type ModulWahl = "gesetzt" | "beiBedarf" | "nicht";

export type Strecke = {
  weg: WegId;
  /** Wie der Bewerber sich selbst beschrieben hat, auf der Weiche. */
  label: string;
  /** Module, die auf dieser Strecke immer laufen, in ihrer Reihenfolge. */
  gesetzt: ModulId[];
  /** Module, die nur auf Nachfrage laufen, in ihrer Reihenfolge. */
  beiBedarf: ModulId[];
  /**
   * Untergrenze der Gesprächsdauer in Minuten.
   *
   * Nur die Strecke 5 hat eine. Sie stammt aus dem Mittelweg zur offenen Frage
   * W4: Die Dauer folgt dem Klärungsbedarf, aber der Hintergrund hebt die
   * Untergrenze, damit ein Quereinstieg nie in einem kurzen Termin landet.
   * Wird W4 anders entschieden, ändert sich genau diese Zahl.
   *
   * Sie ist dieselbe Zahl wie die lange Fassung im Kennenlernen
   * (`DAUER_LANG_MINUTEN`), und das ist Absicht: Der Bewerber bucht eine der
   * beiden Längen, und die Untergrenze darf nicht über der gebuchten liegen.
   */
  untergrenze: number;
  /** Der Satz, der im Sprechtext dieser Strecke die Richtung vorgibt. */
  imSprechtext: string;
};

export const STRECKEN: Strecke[] = [
  {
    weg: "weg1",
    label: "Ich verkaufe schon Immobilien",
    // Die Konditionen kommen vor dem Objektangebot: Das ist die zweite Frage,
    // die ein Profi stellt.
    gesetzt: ["m6", "m1"],
    beiBedarf: [],
    untergrenze: 0,
    imSprechtext: "Nichts erklären, was er kann. Der einzige echte Unterschied ist der Käufertyp.",
  },
  {
    weg: "weg2",
    label: "Ich berate zu Geld, aber nicht zu Immobilien",
    // Erst die Brücke aus der Beratung, dann das zweite Produkt: Wer weiß, was
    // ihm fehlt, hört danach anders zu, was zusätzlich dazukommt.
    gesetzt: ["m2", "m7"],
    beiBedarf: ["m3", "m6"],
    untergrenze: 0,
    imSprechtext: "Die Abgrenzung 34d und 34f gegen 34c gehört ausdrücklich ins Gespräch.",
  },
  {
    weg: "weg3",
    label: "Ich bin im Vertrieb, mit einem anderen Produkt",
    gesetzt: ["m3"],
    beiBedarf: ["m6"],
    untergrenze: 0,
    imSprechtext: "Keine Wochenzahl versprechen. Die drei Zeitachsen stehen getrennt nebeneinander.",
  },
  {
    weg: "weg4",
    label: "Ich kenne Immobilien, aber nicht aus dem Verkauf",
    gesetzt: ["m4"],
    beiBedarf: ["m1", "m5"],
    untergrenze: 0,
    imSprechtext: "Objektwissen würdigen, ohne daraus Verkaufskompetenz abzuleiten.",
  },
  {
    weg: "weg5",
    label: "Beides ist neu für mich",
    gesetzt: ["m5"],
    beiBedarf: ["m3", "m4"],
    untergrenze: DAUER_LANG_MINUTEN,
    imSprechtext: "Nichts beschönigen, und trotzdem nicht belehren. Kein Wort „Quereinsteiger“.",
  },
];

/** Die Strecke zu einem Weg. Ohne gültigen Weg gibt es keinen Termin. */
export function getStrecke(weg: string | null | undefined): Strecke | null {
  return STRECKEN.find((s) => s.weg === weg) ?? null;
}

/** Was das Modul auf dieser Strecke ist. */
export function modulWahl(weg: WegId, modul: ModulId): ModulWahl {
  const s = getStrecke(weg);
  if (!s) return "nicht";
  if (s.gesetzt.includes(modul)) return "gesetzt";
  if (s.beiBedarf.includes(modul)) return "beiBedarf";
  return "nicht";
}

/**
 * Die Matrix „welcher Weg löst welchen Baustein aus", als Tabelle.
 *
 * Ein Haken heißt immer, ein B heißt bei Bedarf. Die HR-Managerin kann jede
 * Auswahl mit einer Begründung ändern; die Matrix ist der Vorschlag, nicht die
 * Vorschrift.
 */
export function modulMatrix(): { modul: Modul; wahl: Record<WegId, ModulWahl> }[] {
  return MODULE.map((modul) => ({
    modul,
    wahl: STRECKEN.reduce((acc, s) => {
      acc[s.weg] = modulWahl(s.weg, modul.id);
      return acc;
    }, {} as Record<WegId, ModulWahl>),
  }));
}

/**
 * Die Module dieses Termins: die gesetzten, dazu die zugeschalteten, in
 * stabiler Reihenfolge.
 *
 * Ein zugeschaltetes Modul steht hinter den gesetzten, in der Reihenfolge, in
 * der es auf dieser Strecke angeboten wird. Module, die diese Strecke gar
 * nicht kennt, lassen sich trotzdem einschieben: Im Gespräch zählt die Frage
 * des Bewerbers und nicht die Vorauswahl.
 */
export function aktiveModule(weg: WegId, zusatz: readonly ModulId[] = []): ModulId[] {
  const s = getStrecke(weg);
  if (!s) return [];
  const gewaehlt = new Set(zusatz);
  const angeboten = s.beiBedarf.filter((m) => gewaehlt.has(m));
  const uebrige = MODULE.map((m) => m.id).filter(
    (m) => gewaehlt.has(m) && !s.gesetzt.includes(m) && !s.beiBedarf.includes(m),
  );
  return [...s.gesetzt, ...angeboten, ...uebrige];
}

/** Ein Eintrag der Folienfolge: Kernbaustein oder Modul. */
export type FolgeEintrag =
  | { art: "kern"; id: KernId }
  | { art: "modul"; id: ModulId };

/**
 * Die Folienfolge eines Termins.
 *
 * Immer: Begrüßung, Ausgangslage, Arbeitsteilung, dann die Module, dann
 * Servicefolie, Bedingungen und Schluss. Die Module sind die einzige Stelle,
 * an der die Strecken auseinandergehen.
 */
export function folienFolge(weg: WegId, zusatz: readonly ModulId[] = []): FolgeEintrag[] {
  return [
    { art: "kern", id: "begruessung" },
    { art: "kern", id: "ausgangslage" },
    { art: "kern", id: "arbeitsteilung" },
    ...aktiveModule(weg, zusatz).map((id) => ({ art: "modul", id } as FolgeEintrag)),
    { art: "kern", id: "service" },
    { art: "kern", id: "bedingungen" },
    { art: "kern", id: "weitergehen" },
  ];
}

/** Die Summe aus Kern und Modulen, ohne die Untergrenze. */
export function bausteinMinuten(weg: WegId, zusatz: readonly ModulId[] = []): number {
  return KERN_MINUTEN + aktiveModule(weg, zusatz).length * MODUL_MINUTEN;
}

/**
 * Die Dauer des Termins.
 *
 * Grundlage ist der Klärungsbedarf, also Kern plus Module. Die Untergrenze der
 * Strecke hebt sie an, wenn die Bausteine darunter blieben; die Differenz
 * steht als Puffer in der Tagesordnung und verschwindet, sobald ein weiteres
 * Modul dazukommt.
 */
export function dauerMinuten(weg: WegId, zusatz: readonly ModulId[] = []): number {
  const s = getStrecke(weg);
  return Math.max(s?.untergrenze ?? 0, bausteinMinuten(weg, zusatz));
}

/** Die Minuten, die als Puffer für Rückfragen übrig bleiben. */
export function pufferMinuten(weg: WegId, zusatz: readonly ModulId[] = []): number {
  return dauerMinuten(weg, zusatz) - bausteinMinuten(weg, zusatz);
}

export type AgendaZeile = { text: string; minuten: number };

/**
 * Die Tagesordnung, wie sie rechts auf der Begrüßungsfolie steht.
 *
 * Sie ist die Modulauswahl in Worten. Die Begrüßung selbst steht nicht darin,
 * sie läuft ja gerade; Ausgangslage und Arbeitsteilung stehen als eine Zeile,
 * weil sie im Gespräch ineinander übergehen.
 */
export function tagesordnung(weg: WegId, zusatz: readonly ModulId[] = []): AgendaZeile[] {
  const zeilen: AgendaZeile[] = [
    {
      text: "Deine beiden Themen",
      minuten: getKern("ausgangslage").minuten + getKern("arbeitsteilung").minuten,
    },
    ...aktiveModule(weg, zusatz).map((id) => ({ text: getModul(id).agenda, minuten: MODUL_MINUTEN })),
    { text: "Was ab Tag 1 bereitsteht", minuten: getKern("service").minuten },
    { text: "Offene Bedingungen und Startvoraussetzungen", minuten: getKern("bedingungen").minuten },
    { text: "Wie wir beide es sehen, und was als Nächstes kommt", minuten: getKern("weitergehen").minuten },
  ];
  const puffer = pufferMinuten(weg, zusatz);
  if (puffer > 0) {
    zeilen.push({ text: "Puffer für Rückfragen, weil hier vieles neu ist", minuten: puffer });
  }
  return zeilen;
}

// ─────────────────── Die Antworten aus dem Kennenlernen ───────────────────

/**
 * Ein Lesekopf auf die Antworten des Kennenlernens.
 *
 * Alle Folien greifen darauf zu, keine liest den Rohschlüssel selbst. So steht
 * an einer Stelle, welcher Wert wo herkommt, und die Ansichtsnummern bleiben
 * nachvollziehbar.
 */
export type KennenlernenLesekopf = {
  antworten: KennenlernenAntworten;
  weg: WegId | null;
  /** Klartext einer Antwort, leer wenn nichts dasteht. */
  text: (key: string) => string;
  /** Rohwert einer Einfachantwort. */
  wert: (key: string) => string;
  /** Rohwerte einer Mehrfachantwort. */
  werte: (key: string) => string[];
  /** Klartext-Beschriftungen einer Mehrfachantwort. */
  labels: (key: string) => string[];
  /**
   * Die Nummer einer Ansicht des Kennenlernens, auf dem Weg dieses Bewerbers.
   *
   * Angegeben wird die Kennung, etwa „zeit" oder „erlaubnis", nicht die Zahl.
   * Die Zahl verschiebt sich, sobald im Bogen eine Ansicht dazukommt oder
   * wegfällt, und auf Weg 2 ist sie ohnehin um eins größer als auf den
   * anderen vier. Von Hand gepflegte Zahlen in den Folientexten waren
   * deshalb dauerhaft falsch.
   */
  nr: (ansichtId: string) => number;
  /**
   * Die Nummer der Ansicht, auf der diese Frage steht.
   *
   * Der ehrlichere Weg für jeden Satz, der eine Antwort belegt: Er zeigt auf
   * die Stelle, an der die Antwort gegeben wurde, und wandert mit, wenn die
   * Frage einmal auf eine andere Ansicht umzieht.
   */
  nrFrage: (key: string) => number;
  /**
   * Der Gruppenkasten unter einer Ansicht des Bogens, wörtlich wie dort.
   *
   * Die Folie schreibt einen Satz, den der Bewerber im Bogen schon gelesen
   * hat, nicht ab, sondern holt ihn hier ab. Gebraucht auf der
   * Arbeitsteilungsfolie: Wie viele der fünf Schritte für ihn neu sind, steht
   * im Bogen auf der Abwicklungsansicht, und nur dort. Wer die Zahl ändert,
   * ändert sie damit an beiden Stellen zugleich.
   */
  bogenKasten: (ansichtId: string) => { titel?: string; text: string } | null;
};

export function lies(antworten: KennenlernenAntworten): KennenlernenLesekopf {
  const ansichten = ansichtenFuer(antworten);
  const fragen = new Map<string, KennenlernenFrage>();
  /** Auf welcher Ansicht steht welche Frage. Für `nrFrage`. */
  const ansichtZuFrage = new Map<string, number>();
  for (const ansicht of ansichten) {
    /*
     * Mit den Antworten dieses Bewerbers geprüft und nicht gegen einen leeren
     * Bogen. Sonst fiele jede bedingte Frage heraus, und seit die Frage nach
     * dem Start eine Bedingung trägt, stand in der Vorbereitung und im
     * Merkmal „Akquiseplan erkennbar" für jeden Bewerber „noch nichts
     * entschieden".
     */
    for (const f of fragenDerAnsicht(ansicht, antworten)) {
      fragen.set(f.key, f);
      if (!ansichtZuFrage.has(f.key)) ansichtZuFrage.set(f.key, ansicht.nummer);
    }
  }
  /*
   * Zweiter Durchgang für die Fragen, die dieser Bewerber nicht sieht. Ein
   * Verweis auf eine unbeantwortete Frage soll trotzdem die richtige Nummer
   * tragen, etwa in „Ansicht 14 ist noch offen". Die sichtbare Fassung hat
   * Vorrang, deshalb erst jetzt.
   */
  for (const ansicht of ansichten) {
    for (const f of ansicht.fragen ?? []) {
      if (!ansichtZuFrage.has(f.key)) ansichtZuFrage.set(f.key, ansicht.nummer);
    }
  }
  const wegWert = typeof antworten.weg === "string" ? antworten.weg : "";
  return {
    antworten,
    weg: getWeg(wegWert)?.id ?? null,
    text: (key) => {
      const f = fragen.get(key);
      return f ? antwortText(f, antworten) : "";
    },
    wert: (key) => (typeof antworten[key] === "string" ? (antworten[key] as string) : ""),
    werte: (key) => (Array.isArray(antworten[key]) ? (antworten[key] as string[]) : []),
    labels: (key) => {
      const f = fragen.get(key);
      const werte = Array.isArray(antworten[key]) ? (antworten[key] as string[]) : [];
      return f ? werte.map((v) => optionLabel(f, v)) : werte;
    },
    nr: (ansichtId) => ansichtNummer(ansichten, ansichtId),
    nrFrage: (key) => ansichtZuFrage.get(key) ?? 1,
    bogenKasten: (ansichtId) => {
      const ansicht = ansichten.find((a) => a.id === ansichtId);
      return ansicht ? anschlussUnten(ansicht, antworten) : null;
    },
  };
}

/**
 * Die drei Zeitfresser aus der zweiten Vertiefung des Wegs, getrennt danach,
 * ob sie hier wegfallen.
 *
 * Die Kundengewinnung fällt nicht weg, und das steht auch so da. Alles andere
 * hier zu bündeln wäre genau das Lob ohne Grundlage, das nicht vorkommen soll.
 */
const ZEITFRESSER_KURZ: Record<string, string> = {
  objektsuche: "Objekte suchen und prüfen",
  unterlagen: "Unterlagen und Exposés bauen",
  finanzierung: "Finanzierung organisieren",
  abwicklung: "Abwicklung bis zum Notar",
  akquise: "Kunden überhaupt erst finden",
  verwaltung: "Verwaltung und Nachhalten",
};

/** Nur die Kundengewinnung bleibt seine Arbeit, alles andere liegt im Haus. */
const ZEITFRESSER_BLEIBT = new Set(["akquise"]);

export type Zeitfresser = { faelltWeg: string[]; bleibt: string[] };

export function zeitfresser(l: KennenlernenLesekopf): Zeitfresser {
  if (l.weg !== "weg1") return { faelltWeg: [], bleibt: [] };
  const werte = l.werte("wegAntwort2");
  return {
    faelltWeg: werte.filter((v) => !ZEITFRESSER_BLEIBT.has(v)).map((v) => ZEITFRESSER_KURZ[v] ?? v),
    bleibt: werte.filter((v) => ZEITFRESSER_BLEIBT.has(v)).map((v) => ZEITFRESSER_KURZ[v] ?? v),
  };
}

// ─────────────────────── Die Folien und ihre Blöcke ───────────────────────

/**
 * Ein Block auf einer Folie.
 *
 * Bewusst wenige Formen. Eine Folie, die eine eigene Form braucht, ist meist
 * eine Folie zu viel.
 */
export type FolienBlock =
  | { art: "liste"; titel: string; unterzeile?: string; punkte: string[] }
  | { art: "schritte"; titel: string; schritte: { wer: string; titel: string; text: string }[] }
  /** Ohne `titel` steht nur der Satz da. Gebraucht für den Anknüpfungssatz. */
  | { art: "kasten"; titel?: string; text: string; ton?: "neutral" | "warnung" }
  | { art: "zitat"; titel: string; text: string; hinweis?: string }
  | { art: "gegenueber"; titel: string; unterzeile?: string; spalten: [string, string]; zeilen: [string, string][] }
  | { art: "agenda"; titel: string; zeilen: AgendaZeile[] }
  /**
   * `ersatz` steht anstelle der Themenliste, wenn der Bewerber keins markiert
   * hat. Ohne ihn stünde dort eine Feststellung darüber, was er nicht getan
   * hat, und das ist der erste Satz des Gesprächs. Was drinsteht, entscheidet
   * `ersatzFuerThemen`.
   */
  | { art: "themen"; titel: string; themen: string[]; ersatz?: string; frageTitel?: string; frage?: string }
  | { art: "tueren"; titel: string; unterzeile?: string; tueren: { titel: string; text: string }[] }
  | { art: "plan"; titel: string; stufen: { wann: string; titel: string; text: string }[] };

export type VideocallFolie = {
  /** Stabile Kennung. Alles, was auf eine Folie zeigt, zeigt über sie. */
  id: string;
  art: "kern" | "modul";
  bausteinId: BausteinId;
  /** „Kern, immer dabei" oder „Modul, bei Bedarf" */
  kicker: string;
  /** „Folie 3 von 9" */
  nummerText: string;
  /** Kopfzeile mit Minutenangabe. */
  kopfzeile: string;
  /** Der Hauptsatz der Folie. */
  titel: string;
  /** Die Zeile darunter. */
  unterzeile: string;
  /**
   * Das eine Wort der Überschrift, das im Glanzverlauf steht.
   *
   * Wie in der Closing-Präsentation: pro Folie genau eine Stelle, sonst wird
   * der Glanz Tapete statt Fokus. Steht das Wort nicht in der Überschrift,
   * bleibt sie einfarbig; die Ansicht muss nichts prüfen.
   */
  glanz: string;
  bloecke: FolienBlock[];
  /** Woher die Angaben stammen, klein unten rechts. */
  quelle: string;
};

/** Der Kasten, der auf allen fünf Strecken auf der Ausgangslage steht. */
export const VERBOTE_KASTEN = {
  titel: "Was auf dieser Folie ausdrücklich nicht steht",
  text:
    "Keine Punktzahl, keine Eignungsprozente, keine Aussage darüber, wie viele Kunden aus deinem " +
    "Beruf zu erwarten sind. Aus einer Selbstauskunft folgt weder ein Kundennetz noch eine kürzere " +
    "Anlaufzeit. Was hier steht, sind deine eigenen Angaben, nüchtern zurückgespiegelt.",
} as const;

/** Die fünf Schritte der Arbeitsteilung. Auf allen Strecken wortgleich. */
export const ARBEITSTEILUNG_SCHRITTE: { wer: string; titel: string; text: string }[] = [
  {
    wer: "Du",
    titel: "Ansprechen und zuhören",
    text: "Du sprichst jemanden an, hörst zu und vereinbarst einen Termin. Das ist der Teil, den niemand für dich übernimmt.",
  },
  {
    wer: "Wir",
    titel: "Objekt und Kalkulation",
    text: "Objektauswahl, Kalkulation, Exposé und Preisliste kommen aus dem Haus.",
  },
  {
    wer: "Gemeinsam",
    titel: "Das Beratungsgespräch",
    text: "Am Anfang ist jemand aus dem Haus dabei, so lange du das brauchst. Ohne Erlaubnis nach Paragraf 34c führst du zu, beraten wird gemeinsam.",
  },
  {
    wer: "Wir",
    titel: "Finanzierung und Notar",
    text: "Finanzierungsanfrage, Notartermin und Abwicklung laufen über uns.",
  },
  {
    wer: "Du",
    titel: "Der Kontakt danach",
    text: "Der Kunde bleibt deiner. Auch dann, wenn wir irgendwann nicht mehr zusammenarbeiten.",
  },
];

/**
 * Die sechs Sätze, die auf der Bedingungsfolie nur bestätigt werden.
 *
 * Der sechste, der Tätigkeitsmaßstab, steht seit dem 10.09.2026 dabei. Er
 * gehört hierher und nicht auf eine eigene Folie: Der Bewerber hat ihn im
 * Kennenlernbogen auf der Ansicht „Was wir erwarten" gelesen, hier wird er
 * bestätigt und nicht zum ersten Mal erklärt.
 */
export const BEDINGUNGEN_GELESEN: string[] = [
  `Selbstständig, kein Fixgehalt, ${PROVISION_PROZENT} Prozent vom Kaufpreis`,
  "CRM, Objektzugänge und Unterlagen kosten nichts",
  "Training, Landingpage, Coaching, Community und Support werden gestellt, kein laufendes Entgelt",
  "Kundengewinnung bleibt deine Arbeit",
  "Es kann Monate ohne Einnahmen geben",
  "Ein beurkundeter Kaufvertrag in zwei aufeinanderfolgenden Quartalen, das ist der Tätigkeitsmaßstab",
];

// ── Kern 1, Begrüßung ──

/**
 * Der Anknüpfungssatz, der erste Satz des Termins, je Gruppe.
 *
 * Er steht ganz oben auf der ersten Folie, noch vor der Tagesordnung, und
 * greift auf, was der Bewerber im Bogen über sich gesagt hat. Er ist der
 * billigste Nachweis, dass sein Bogen gelesen wurde: Der Moderator muss dafür
 * nichts vorbereiten, und der Bewerber merkt es im ersten Satz.
 *
 * Jede Fassung sagt dasselbe in drei Schritten: was er mitbringt, was ihm
 * deshalb heute nicht erklärt wird, und was stattdessen dran ist. Was er
 * mitbringt, ist seine eigene Angabe aus der Weiche und keine Bewertung.
 *
 * Der Satz steht hier und nur hier. Im Bogen kommt er nicht vor, dort stehen
 * die Anschlusssätze der einzelnen Ansichten; wörtlich abgeschrieben ist
 * nichts davon.
 */
export const ANKNUEPFUNG: Record<WegId, string> = {
  weg1:
    "Du verkaufst schon Immobilien. Dein Handwerk erklären wir dir heute nicht. Anders ist bei uns " +
    "nur, wer kauft und warum.",
  weg2:
    "Du berätst zu Geld. Das Gespräch führst du längst. Heute geht es um das, was dazukommt: das " +
    "Objekt und die Erlaubnis dafür.",
  weg3:
    "Du verkaufst bereits, nur etwas anderes. Verkaufen musst du nicht neu lernen. Heute geht es " +
    "darum, wie lange es hier dauert und wovon das abhängt.",
  weg4:
    "Du kennst Immobilien von innen. Über das Objekt musst du dir nichts anlesen. Neu ist für dich " +
    "das Gespräch, und darüber reden wir heute.",
  weg5:
    "Für dich ist beides neu. Das dauert länger, und deshalb sagen wir es dir vorher und rechnen es " +
    "heute mit dir durch.",
};

/**
 * Was im Abschnitt „Womit wir anfangen" steht, wenn er kein Thema markiert hat.
 *
 * Die Frage nach den Themen ist freiwillig, viele überspringen sie. Bis zum
 * 22.09.2026 stand dann auf der ersten Folie des Gesprächs „Du hast kein Thema
 * markiert", also eine Feststellung über eine Unterlassung, und das als
 * Begrüßung. Stattdessen greift diese Leiter, von oben nach unten:
 *
 *   1. Seine eigene Frage. Sie steht im selben Block gleich darunter, hier
 *      wird nur darauf gezeigt, damit sie nicht zweimal dasteht.
 *   2. Der Punkt, der sich aus seinen eigenen Angaben ohnehin ergibt, also die
 *      offene Erlaubnis oder das offene Gewerbe. Er ist im Bogen belegt und
 *      kommt im Gespräch sowieso dran.
 *   3. Ein freundlicher Satz ohne Vorwurf. Er ist besser als eine Leerstelle
 *      und besser als eine Feststellung darüber, was er nicht ausgefüllt hat.
 *
 * Was er ausdrücklich markiert hat, geht immer vor: Steht die Themenliste, wird
 * diese Funktion gar nicht erst gefragt.
 */
export function ersatzFuerThemen(l: KennenlernenLesekopf): string {
  if (themenLabels(l.antworten).length > 0) return "";
  if (l.wert("eigeneFrage").trim()) {
    return "Du hast uns eine eigene Frage mitgegeben. Genau damit fangen wir an, sie steht gleich darunter.";
  }
  const erlaubnisOffen = l.wert("erlaubnis34c") !== "ja";
  const gewerbeOffen = l.wert("gewerbe") !== "ja";
  if (erlaubnisOffen || gewerbeOffen) {
    const punkt = erlaubnisOffen
      ? `der Umfang der Erlaubnis nach Paragraf 34c, aus Ansicht ${l.nrFrage("erlaubnis34c")}`
      : `der Zeitpunkt der Gewerbeanmeldung, aus Ansicht ${l.nrFrage("gewerbe")}`;
    return (
      `Ein Punkt aus deinem Bogen ist ohnehin dran: ${punkt}. Damit fangen wir an, und danach ` +
      "nimmst du dir, was dir wichtiger ist."
    );
  }
  return (
    "Deinen Bogen haben wir gelesen. Wir fangen bei deiner Ausgangslage an, und wenn dir unterwegs " +
    "etwas wichtiger wird, sagst du es einfach."
  );
}

function folieBegruessung(l: KennenlernenLesekopf, zusatz: readonly ModulId[]): FolienBlock[] {
  const weg = l.weg as WegId;
  const themen = themenLabels(l.antworten);
  const frage = l.wert("eigeneFrage").trim();
  const dauer = dauerMinuten(weg, zusatz);
  return [
    // Ohne Überschrift, damit er als gesprochener Satz dasteht und nicht als
    // Kapitel. Er wird gesagt, nicht vorgelesen.
    { art: "kasten", text: ANKNUEPFUNG[weg] },
    {
      art: "themen",
      titel: themen.length > 0 ? `Womit wir anfangen, aus Ansicht ${l.nrFrage("themen")}` : "Womit wir anfangen",
      themen,
      ersatz: ersatzFuerThemen(l),
      frageTitel: "Und deine eigene Frage, freiwillig",
      frage,
    },
    { art: "agenda", titel: `${dauer} Minuten, so aufgeteilt`, zeilen: tagesordnung(weg, zusatz) },
    {
      art: "kasten",
      titel: "Seit deinem Kennenlernen",
      text:
        "Was sich seit deinem Kennenlernen geändert hat, sage ich dir gleich. " +
        "Deine Angaben lese ich dir nicht vor, ich kenne sie.",
    },
  ];
}

// ── Kern 2, Deine Ausgangslage ──

/** Woran wir anknüpfen können, je Strecke aus den eigenen Antworten. */
function anknuepfung(l: KennenlernenLesekopf): { titel: string; punkte: string[] } {
  const a1 = l.text("wegAntwort1").trim();
  const a2 = l.text("wegAntwort2").trim();
  const mit = (s: string) => s.replace(/\.$/, "");

  /*
   * Womit er starten will, mit der Nummer der Ansicht, auf der er es
   * angegeben hat.
   *
   * Hier stand bis zum 08.09.2026 `hintergrund` mit dem Zusatz "aus Ansicht
   * 6". Beides war falsch: `hintergrund` wird beim Absenden aus dem gewählten
   * Weg abgeleitet und in diesem Bogen nirgends gefragt, es gibt dafür also
   * gar keine Ansicht, und weil es keine Frage dazu gibt, standen auf der
   * Folie die Rohwerte ("immo, netzwerk") statt lesbarer Antworten. Der Weg
   * selbst steht ohnehin schon in der Überschrift dieser Spalte.
   */
  const start = l.text("leadPraeferenz").trim();
  const startZeile = start
    ? `Womit du starten willst, steht auf Ansicht ${l.nrFrage("leadPraeferenz")}: ${mit(start)}.`
    : "";

  switch (l.weg) {
    case "weg1":
      return {
        titel: "Du verkaufst Immobilien.",
        punkte: [
          a1 ? `Abschlüsse im letzten Jahr: ${mit(a1)}. Den Weg von der Ansprache bis zum Notar muss dir niemand erklären.` : "",
          "Objekte bewerten, Einwände aushalten, um eine Entscheidung bitten: das bringst du mit, und darüber reden wir heute nicht.",
          startZeile,
        ].filter(Boolean),
      };
    case "weg2":
      return {
        titel: "Du berätst bereits zu Finanzthemen.",
        punkte: [
          a1 ? `Deine Schwerpunkte: ${mit(a1)}. Du kennst die Situation, in der jemand eine größere Entscheidung trifft.` : "",
          "Du redest über Einkommen, Steuern und Eigenkapital, ohne dass es unangenehm wird. Das ist der Teil, der vielen schwerfällt.",
          /*
           * Auf Weg 2 und Weg 4 belegt `wegAntwort2` den dritten Punkt, und
           * für die Startpräferenz blieb bis zum 22.09.2026 kein Platz. Sie
           * steht deshalb als zweiter Satz in demselben Punkt statt als
           * vierter Punkt: Auf Weg 2 gehört beides ohnehin zusammen, es geht
           * zweimal um die Kundenseite.
           */
          [a2 ? `Deine Kunden gewinnst du so: ${mit(a2)}.` : "", startZeile].filter(Boolean).join(" "),
        ].filter(Boolean),
      };
    case "weg3":
      return {
        titel: "Verkaufen ist bei dir kein neues Thema.",
        punkte: [
          a1 ? `${mit(a1)}. Gespräche führen, Einwände aushalten, dranbleiben, um eine Entscheidung bitten: das übt man, das liest man nicht nach.` : "",
          "Du bist gewohnt, dass dein Einkommen von deiner Aktivität abhängt. Hier ist das genauso.",
          startZeile,
        ].filter(Boolean),
      };
    case "weg4":
      return {
        titel: "Du weißt, wovon du redest.",
        punkte: [
          a1 ? `Berührung mit der Immobilie: ${mit(a1)}. Darüber sprichst du aus eigener Erfahrung.` : "",
          "Die Zahlen einer Immobilie sind dir nicht fremd. Der Schritt zur Kapitalanlage ist damit kleiner, als er von außen aussieht.",
          // Wie auf Weg 2: die Startpräferenz als zweiter Satz desselben
          // Punkts, damit die Spalte bei drei Punkten bleibt.
          [
            a2 ? `Zum Verkauf hast du auf Ansicht ${l.nrFrage("wegAntwort2")} angegeben: ${mit(a2)}.` : "",
            startZeile,
          ].filter(Boolean).join(" "),
        ].filter(Boolean),
      };
    case "weg5":
      return {
        titel: "Du bringst mit, was sich schwer nachholen lässt.",
        punkte: [
          a1 ? `Was dich reizt: ${mit(a1)}. Ein Kapitalanlagegespräch besteht überwiegend aus Erklären.` : "",
          "Du lernst System und Ablauf von Anfang an so, wie sie hier gedacht sind, ohne Gewohnheiten aus einem anderen Haus.",
          startZeile,
        ].filter(Boolean),
      };
    default:
      return { titel: "", punkte: [] };
  }
}

/** Was gemeinsam zu klären ist, je Strecke plus die Punkte aus dem Bogen. */
function klaerungen(l: KennenlernenLesekopf): { titel: string; punkte: string[] } {
  const zeit = l.text("zeitProWoche").trim();
  const erlaubnis = l.wert("erlaubnis34c");
  const gewerbe = l.wert("gewerbe");
  const offeneErlaubnis = erlaubnis !== "ja";
  const offenesGewerbe = gewerbe !== "ja";
  const a2 = l.text("wegAntwort2").trim();

  const gemeinsam: string[] = [];
  if (offeneErlaubnis) {
    gemeinsam.push(
      l.weg === "weg2"
        ? "Welche Erlaubnis in deinem Fall nötig ist und in welchem Umfang. Eine 34d oder 34f ersetzt die 34c nicht."
        : "Welche Erlaubnis nach Paragraf 34c in deinem Fall nötig ist und in welchem Umfang.",
    );
  } else if (offenesGewerbe) {
    gemeinsam.push("Der Zeitpunkt der Gewerbeanmeldung. Sie gehört an den Beginn der selbstständigen Tätigkeit.");
  }
  if (zeit) {
    gemeinsam.push(
      `Wie sich die Arbeit zeitlich verteilt. Auf Ansicht ${l.nrFrage("zeitProWoche")} stehen ${zeit.toLowerCase()}.`,
    );
  }

  switch (l.weg) {
    case "weg1":
      return {
        titel: "Der Käufertyp, und was er am Gespräch ändert.",
        punkte: [
          "Unsere Kunden kaufen zur Kapitalanlage. Es geht um Steuern, Cashflow und Bonität, nicht um Küche und Grundriss.",
          ...gemeinsam,
          "Ob dein heutiges Netzwerk für den Anfang trägt. Aus einer Angabe im Bogen lässt sich das nicht ablesen.",
        ],
      };
    case "weg2":
      return {
        titel: "Wie vertraut dir Immobilien als Kapitalanlage sind.",
        punkte: [
          "Objektkunde, Bewertung und Steuerwirkung sind Stoff aus dem Training, kein Talent.",
          ...gemeinsam,
        ],
      };
    case "weg3":
      return {
        titel: "Das Produkt, und die Geduld.",
        punkte: [
          "Immobilie, Finanzierung und Steuerwirkung sind Stoff aus dem Training.",
          a2
            ? `Du hast auf Ansicht ${l.nrFrage("wegAntwort2")} angegeben: ${a2.replace(/\.$/, "")}. `
              + "Hier dauert es länger, und die Zeit hängt an drei getrennten Dingen."
            : "",
          "Wie du an mehreren Fällen gleichzeitig arbeitest, ohne die Wartezeit als Stillstand zu erleben.",
          ...gemeinsam,
        ].filter(Boolean),
      };
    case "weg4":
      return {
        titel: "Das Gespräch selbst.",
        punkte: [
          "Aktiv ansprechen, ein Gespräch führen, um eine Entscheidung bitten. Darauf bauen wir im Training auf.",
          "Deine ersten Kundengespräche führst du nicht allein. Wie viele es sind und wer dabei ist, halten wir heute mit Namen fest.",
          ...gemeinsam,
        ],
      };
    case "weg5":
      return {
        titel: "Beides zugleich, und dafür mehr Zeit.",
        punkte: [
          "Produkt und Verkauf gleichzeitig zu lernen dauert länger. Rechne mit mehr Trainingszeit vor deinem ersten Kundengespräch.",
          ...gemeinsam,
          "Woher deine ersten Interessenten kommen. Im privaten Umfeld anzufangen ist eine Möglichkeit und keine Bedingung.",
        ],
      };
    default:
      return { titel: "", punkte: [] };
  }
}

function folieAusgangslage(l: KennenlernenLesekopf): FolienBlock[] {
  const links = anknuepfung(l);
  const rechts = klaerungen(l);
  return [
    { art: "liste", titel: "Woran wir anknüpfen können", unterzeile: links.titel, punkte: links.punkte },
    { art: "liste", titel: "Und was wir gemeinsam klären", unterzeile: rechts.titel, punkte: rechts.punkte },
    { art: "kasten", titel: VERBOTE_KASTEN.titel, text: VERBOTE_KASTEN.text, ton: "warnung" },
  ];
}

// ── Kern 3, Die Arbeitsteilung ──

/**
 * Was die Folie über den Bogen hinaus sagt, je Gruppe.
 *
 * Wie viele der fünf Schritte für ihn neu sind, steht nicht hier, sondern im
 * Bogen auf der Abwicklungsansicht. Hier steht nur, was im Gespräch dazukommt
 * und was in einem Bogen nichts verloren hätte: der Verweis auf das Modul, das
 * gleich folgt, und auf die Begleitung der ersten Gespräche.
 */
const ARBEITSTEILUNG_ZUSATZ: Record<WegId, string> = {
  weg1: "Neu ist allein der Käufertyp, und dazu kommt gleich ein eigenes Modul.",
  weg2:
    "Ansprechen, zuhören und begleiten kannst du bereits. Genau dafür ist am Anfang jemand aus dem " +
    "Haus dabei.",
  weg3: "Ansprechen, führen und um eine Entscheidung bitten ist dasselbe Handwerk.",
  weg4: "Objekt, Zahlen und der Kontakt danach sind dir vertraut.",
  weg5: "Das ist kein Nachteil, aber es ist der Grund für den Lernplan, der gleich kommt.",
};

/**
 * Nur auf Strecke 1: seine eigenen Markierungen, im Wortlaut der Kacheln.
 *
 * Die einzige Stelle des Kastens, die aus einer Antwort entsteht statt aus
 * einer festen Fassung. Deshalb steht sie hier und nicht im Bogen: Dort ist
 * die Frage danach eine Ansicht früher gestellt, aber der Bogen spiegelt sie
 * nirgends zurück.
 */
function arbeitsteilungMarkierungen(l: KennenlernenLesekopf): string {
  const z = zeitfresser(l);
  if (z.faelltWeg.length === 0 && z.bleibt.length === 0) return "";
  const nr = l.nrFrage("wegAntwort2");
  const kopf = z.faelltWeg.length > 0
    ? `Von dem, was du auf Ansicht ${nr} markiert hast, liegt hier im Haus: ${z.faelltWeg.join(", ")}.`
    : `Von dem, was du auf Ansicht ${nr} markiert hast, liegt hier nichts im Haus.`;
  if (z.bleibt.length === 0) return kopf;
  return (
    `${kopf} Was bleibt, hast du selbst markiert: ${z.bleibt.join(", ")}. ` +
    "Die Kundengewinnung nimmt dir hier niemand ab."
  );
}

/**
 * Der rechte Kasten. Er ist die Stelle, an der jemand merkt, dass sein Bogen
 * gelesen wurde.
 *
 * Er stand bis zum 09.09.2026 zweimal im Projekt: einmal im Bogen auf der
 * Abwicklungsansicht und einmal, mit eigener Zählung, hier. Wer die eine
 * änderte und die andere vergaß, erzählte dem Bewerber im Gespräch etwas
 * anderes als im Bogen. Seither holt die Folie den Satz aus dem Bogen ab und
 * ergänzt ihn nur noch um das, was zum Gespräch gehört.
 */
function arbeitsteilungKasten(l: KennenlernenLesekopf): { titel: string; text: string } {
  const ausDemBogen = l.bogenKasten("abwicklung");
  const titel = ausDemBogen?.titel ?? "Und was das für dich heißt";
  if (!l.weg) return { titel, text: ausDemBogen?.text ?? "" };
  const teile = [
    ausDemBogen?.text ?? "",
    l.weg === "weg1" ? arbeitsteilungMarkierungen(l) : "",
    ARBEITSTEILUNG_ZUSATZ[l.weg],
  ];
  return { titel, text: teile.filter(Boolean).join(" ") };
}

function folieArbeitsteilung(l: KennenlernenLesekopf): FolienBlock[] {
  const kasten = arbeitsteilungKasten(l);
  return [
    { art: "schritte", titel: "Fünf Schritte, und bei jedem steht, wer ihn macht", schritte: ARBEITSTEILUNG_SCHRITTE },
    {
      art: "kasten",
      titel: "Der Teil, der deiner bleibt",
      text:
        "Die Kundengewinnung. Zugeteilte Kontakte gibt es, aber sie werden nicht von selbst zu " +
        "Abschlüssen. Wer darauf wartet, dass ihm jemand Kunden bringt, wird hier nicht glücklich.",
    },
    { art: "kasten", titel: kasten.titel, text: kasten.text },
  ];
}

// ── Kern, Was ab Tag 1 bereitsteht ──

/**
 * Bis zum 06.09.2026 stand hier die Servicevereinbarung mit Preis und
 * Gegenüberstellung. Seither stellt das Haus diese sechs Leistungen wie
 * alles andere; die Folie zählt nur noch auf, was bereitsteht.
 */
function folieService(): FolienBlock[] {
  return [
    {
      art: "liste",
      titel: "Kostet nichts, und darf nichts kosten",
      unterzeile: "Paragraf 86a Handelsgesetzbuch. Eine abweichende Vereinbarung wäre unwirksam.",
      punkte: [
        "Das CRM mit allen Funktionen, die der Vertrag verlangt",
        "Objektzugänge, Exposés, Preislisten, Kalkulationen",
        "Muster, Skripte, Leitfäden, Präsentationen",
        "Pflichtschulungen und die Zuweisung der Leads",
      ],
    },
    {
      art: "liste",
      titel: "Und was zusätzlich dazukommt",
      unterzeile: "Ebenfalls gestellt, ohne eigenen Vertrag, ohne Monatsgebühr und ohne Mindestlaufzeit.",
      punkte: GESTELLTE_ZUSATZLEISTUNGEN.map((z) => z.titel),
    },
    {
      art: "kasten",
      titel: "Und was das im Alltag bedeutet",
      text:
        "Kunden gewinnen, beraten, abschließen. Der Rest steht bereit. Das Einzige, was bei uns Geld " +
        `kostet, sind Leads, und die nur auf Wunsch: ${LEAD_PAKET_ANZAHL} qualifizierte für ` +
        `${LEAD_PAKET_PREIS.toLocaleString("de-DE")} Euro netto. Was im Einzelfall gilt, steht in den ` +
        "Vertragsunterlagen des Partners.",
    },
  ];
}

// ── Kern 4, Die Bedingungen ──

export type OffenerPunkt = { titel: string; text: string; quelle: string };

/**
 * Die offenen Punkte dieses Falls, aus den Antworten abgeleitet.
 *
 * Höchstens zwei, jeder mit einer Zuständigkeit und einer Frist. Ohne Name und
 * Frist wartet am Ende jede Seite auf die andere.
 */
export function offenePunkte(l: KennenlernenLesekopf): OffenerPunkt[] {
  const punkte: OffenerPunkt[] = [];
  const gewerbe = l.wert("gewerbe");
  const erlaubnis = l.wert("erlaubnis34c");
  const zeit = l.text("zeitProWoche").trim();
  const perspektive = l.text("perspektive").trim();
  const lead = l.wert("leadPraeferenz");

  // 1. Der strecken-eigene Punkt steht vorn, weil er das Gespräch trägt.
  if (l.weg === "weg4") {
    punkte.push({
      titel: "Die Begleitung deiner ersten Gespräche",
      text:
        "Wer dabei ist und wie lange, halten wir heute mit Namen fest. Eine feste Zahl begleiteter " +
        "Gespräche sagen wir erst zu, wenn Zuständigkeit und Kapazität stehen.",
      quelle: `Ansicht ${l.nrFrage("themen")}`,
    });
  } else if ((l.weg === "weg3" || l.weg === "weg5") && zeit) {
    punkte.push({
      titel: l.weg === "weg5" ? "Die Zeit, und was in ihr realistisch geht" : "Die Zeit neben deinem Hauptjob",
      text:
        `Auf Ansicht ${l.nrFrage("zeitProWoche")} stehen ${zeit.toLowerCase()}` +
        (perspektive ? `, dazu ${perspektive.toLowerCase()}` : "") +
        (l.weg === "weg5"
          ? ". Damit dauert der Anlauf länger. Wir legen fest, welche Pflichtmodule bis wann laufen."
          : ". Wir legen im Gespräch fest, welche zwei Termine in der Woche fest stehen."),
      quelle: `Ansicht ${l.nrFrage("zeitProWoche")}`,
    });
  }

  // 2. Gewerbe und Erlaubnis, so wie sie im Bogen stehen.
  const erlaubnisOffen = erlaubnis !== "ja";
  const gewerbeOffen = gewerbe !== "ja";
  if (erlaubnisOffen || gewerbeOffen) {
    const was = erlaubnisOffen && gewerbeOffen
      ? "Gewerbe und die Erlaubnis nach Paragraf 34c"
      : erlaubnisOffen
        ? "Der Umfang der Erlaubnis nach Paragraf 34c"
        : "Der Zeitpunkt der Gewerbeanmeldung";
    const zusatz = l.weg === "weg2" && erlaubnisOffen
      ? " Deine bisherige Zulassung nach 34d oder 34f deckt diese Tätigkeit nicht ab."
      : "";
    /*
     * Sein eigener Satz dazu, wenn er „Möchte ich grundsätzlich nicht"
     * angekreuzt hat. Der Bogen sagt über dieses Feld selbst, es entscheide,
     * wo das Gespräch anfängt; ohne den Satz redet die Folie über ihn statt
     * mit ihm. Die Begründung steht auf derselben Ansicht wie die Frage,
     * deshalb „dort" statt einer zweiten gleichen Nummer im selben Absatz.
     */
    const begruendung = erlaubnisOffen ? l.text("erlaubnis34cBegruendung").trim() : "";
    const nrErlaubnis = l.nrFrage("erlaubnis34c");
    const nrBegruendung = l.nrFrage("erlaubnis34cBegruendung");
    const begruendungSatz = begruendung
      ? ` ${nrBegruendung === nrErlaubnis ? "Dort steht auch, warum" : `Warum, steht auf Ansicht ${nrBegruendung}`}: ` +
        `${begruendung.replace(/\.$/, "")}.`
      : "";
    punkte.push({
      titel: was,
      text:
        `Auf Ansicht ${nrErlaubnis} steht das so.${zusatz}${begruendungSatz} Wir klären, was in deinem Fall nötig ist, und melden dir ` +
        "das Ergebnis schriftlich. Ohne Erlaubnis führst du zu, beraten wird gemeinsam.",
      quelle: `Ansicht ${nrErlaubnis}`,
    });
  }

  // 3. Mitgebrachte Kontakte, wenn er über das eigene Netzwerk starten will.
  if (punkte.length < 2 && (lead === "eigen" || lead === "beides")) {
    punkte.push({
      titel: "Die Kontakte, die du mitbringst",
      text:
        "Es gibt keinen Gebietsschutz, es zählt, wer einen Kontakt zuerst im CRM hat. Welche Kontakte " +
        "du mitbringst, halten wir vor dem Start schriftlich fest.",
      quelle: `Ansicht ${l.nrFrage("leadPraeferenz")}`,
    });
  }

  /*
   * 4. Nebentätigkeit und Wettbewerbsverbot, wenn er im Bogen „Ich bin
   * angestellt" angegeben hat.
   *
   * Steht bewusst hinten und nur, wenn noch Platz ist: Es sind höchstens zwei
   * Punkte, und Gewerbe, Erlaubnis oder die Zeit wiegen schwerer. „Beides
   * nebeneinander" löst den Punkt nicht aus, wer schon selbstständig ist,
   * arbeitet bereits nebenher.
   */
  if (punkte.length < 2 && l.wert("arbeitsform") === "angestellt") {
    punkte.push({
      titel: "Nebentätigkeit und Wettbewerbsverbot",
      text:
        `Auf Ansicht ${l.nrFrage("arbeitsform")} steht, dass du angestellt bist. Wir klären, ob dein ` +
        "Arbeitgeber die Nebentätigkeit genehmigt und ob dein Vertrag ein Wettbewerbsverbot enthält. " +
        "Beides ist sehr oft unproblematisch, und beides gehört vor den Start geklärt.",
      quelle: `Ansicht ${l.nrFrage("arbeitsform")}`,
    });
  }

  return punkte.slice(0, 2);
}

function folieBedingungen(l: KennenlernenLesekopf): FolienBlock[] {
  const offen = offenePunkte(l);
  const bloecke: FolienBlock[] = [
    {
      art: "liste",
      titel: "Was du schon gelesen hast",
      unterzeile: "Und heute nur noch bestätigst.",
      punkte: BEDINGUNGEN_GELESEN,
    },
    {
      art: "liste",
      titel: "Was in deinem Fall noch offen ist",
      unterzeile:
        offen.length === 0
          ? "Nichts. Damit steht auch nichts unter Vorbehalt."
          : `${offen.length === 1 ? "Ein Punkt" : "Zwei Punkte"}, jeder mit Namen und Frist.`,
      punkte: offen.map((p) => `${p.titel}. ${p.text}`),
    },
    /*
     * Der Kasten zum Tätigkeitsmaßstab steht bewusst hier und nicht als
     * eigene Folie: Er beantwortet die Rückfrage, die nach dem sechsten
     * Punkt der Liste darüber kommt, und wiederholt sie nicht.
     */
    {
      art: "kasten",
      titel: "Zum letzten Punkt, falls du dazu etwas fragen willst",
      text:
        "Der Maßstab steht in Paragraf 12 Absatz 1a des Vertrages: mindestens ein über uns vermittelter " +
        "und notariell beurkundeter Kaufvertrag in zwei aufeinanderfolgenden Kalenderquartalen. Das " +
        "Quartal, in dem du anfängst, zählt nicht mit, Krankheit und Elternzeit ebenfalls nicht. Bleiben " +
        "zwei Quartale ohne, melden wir uns vorher schriftlich und du hast zwei Wochen für deine Sicht.",
    },
    {
      art: "kasten",
      titel: "Bis dahin",
      text:
        "Keine dieser Angaben ist heute neu. Wenn eine davon doch neu für dich ist, sag es, dann haben " +
        "wir es vorher schlecht erklärt. Bis alles geklärt ist, sind nur die Schritte möglich, die für " +
        "deinen Status freigegeben sind.",
    },
  ];
  if (l.weg === "weg5") {
    /*
     * Seine eigene Angabe zur Reserve, seit dem 22.09.2026. Der Kasten stand
     * hier schon vorher, aber ohne sie: Auf vier von fünf Wegen landete
     * `wegAntwort2` auf einer Folie, ausgerechnet auf Weg 5 nicht, obwohl
     * genau dieser Kasten von nichts anderem handelt. „Bei mir liegt es
     * anders" sagt für sich nichts, deshalb hat der Freitext Vorrang.
     */
    const reserve = (l.text("wegAntwort2Frei").trim() || l.text("wegAntwort2").trim()).replace(/\.$/, "");
    bloecke.push({
      art: "kasten",
      titel: "Und der Satz, der auf diesem Weg dazugehört",
      text:
        (reserve
          ? `Auf Ansicht ${l.nrFrage("wegAntwort2")} steht, wie lange du durchhalten könntest: ${reserve}. `
          : "") +
        "Wenn du das Geld in drei Monaten brauchst, ist das ein sachlicher Grund gegen einen Start und " +
        "kein Makel an dir.",
      ton: "warnung",
    });
  }
  return bloecke;
}

// ── Kern 5, Wie es weitergeht ──

function folieWeitergehen(l: KennenlernenLesekopf): FolienBlock[] {
  /*
   * Der Startzeitpunkt stand bis zum 22.09.2026 nur in der Vorbereitung der
   * Moderatorin. Er gehört hierher: Die Folie fragt, wie es weitergeht, und
   * er hat im Bogen längst gesagt, ab wann er kann. Damit ist der nächste
   * Termin ein Anschluss statt einer neuen Frage.
   */
  const start = l.text("startzeitpunkt").trim().replace(/\.$/, "");
  const bloecke: FolienBlock[] = [
    {
      art: "liste",
      titel: "Von unserer Seite",
      unterzeile: "Drei Möglichkeiten, und ich sage dir gleich, welche es ist.",
      punkte: [
        "Eine Zusammenarbeit ist möglich",
        "Es ist noch eine Klärung nötig, und zwar diese",
        "Ich sehe im Moment keine Grundlage, und zwar deshalb",
      ],
    },
    {
      art: "tueren",
      titel: "Von deiner Seite",
      unterzeile:
        "Meine Einschätzung löst nichts aus. Kein Vertrag, keine Aktivierung, keine Frist. Was als " +
        "Nächstes passiert, entscheidest du, und du musst es nicht heute entscheiden.",
      /*
       * Die drei Türen stehen in derselben Reihenfolge und mit derselben
       * Bedeutung wie `WUNSCH_LABELS` weiter unten: starten, unterlagen,
       * passt_nicht. Was hier steht, muss zu `abschlussWirkung` passen, sonst
       * verspricht die Folie etwas anderes, als der Knopf tut.
       *
       * Genau das war bis zum 08.09.2026 der Fall: Die mittlere Tür hieß
       * „Ich möchte die Unterlagen" und versprach einen Vertrag, während die
       * gleichnamige Wahl im Abschluss den Startfahrplan verschickt und das
       * Closing ausdrücklich offen lässt. Die erste Tür hieß „Ich möchte es
       * überlegen" und beschrieb damit die Unterlagen, während für „Will
       * starten" gar keine Tür dastand. Beides ist hier korrigiert.
       */
      tueren: [
        {
          titel: "Ich möchte starten",
          text:
            "Wir erstellen deinen Vertrag, du bekommst ihn digital zur Ansicht. Dafür brauchen wir " +
            "deine Vertrags- und deine Rechnungsanschrift. Unterschrieben wird heute nichts.",
        },
        {
          titel: "Ich möchte die Unterlagen",
          text:
            "Der Startfahrplan geht dir gleich per Mail zu, mit allem Wichtigen zum Nachlesen. Ein " +
            "Vertrag wird dafür nicht erstellt, entschieden ist noch nichts. Wir vereinbaren einen " +
            "Termin, zu dem wir uns wieder melden, damit die Sache nicht liegen bleibt.",
        },
        {
          titel: "Es passt für mich nicht",
          text:
            "Dann ist die Sache sauber beendet. Du bekommst eine kurze Rückmeldung per Mail, danach " +
            "fasst niemand nach.",
        },
      ],
    },
  ];
  if (start) {
    bloecke.push({
      art: "kasten",
      titel: "Und wann, hast du selbst schon gesagt",
      text:
        `Zum Zeitpunkt hast du auf Ansicht ${l.nrFrage("startzeitpunkt")} angegeben: ${start}. Daran ` +
        "richten wir aus, wann wir uns wieder melden. Welche der drei Türen es wird, ändert daran nichts.",
    });
  }
  return bloecke;
}

// ── Die sechs Module ──

/**
 * Zu welchem Weg ein Modul gehört, und damit zu welcher dritten Wegantwort.
 *
 * Die Zuordnung ist eng gefasst: Nur wenn der Bewerber genau diesen Weg
 * gewählt hat, passt seine dritte Antwort zum Modul. Die Moderatorin kann
 * jedes Modul zuschalten, auch ein fremdes, und dann darf auf der Folie
 * seine Antwort aus einem anderen Zusammenhang nicht auftauchen: Auf Weg 4
 * heißt `wegAntwort3` „Was bisher bremste" und hat mit dem Käufertyp aus
 * Modul 1 nichts zu tun.
 *
 * Modul 6 und Modul 7 stehen nicht in der Liste. Sie gehören zu keinem Weg,
 * sondern zu einer Frage im Gespräch.
 */
const MODUL_ZU_WEG: Partial<Record<ModulId, WegId>> = {
  m1: "weg1",
  m2: "weg2",
  m3: "weg3",
  m4: "weg4",
  m5: "weg5",
};

/**
 * Wie die dritte Wegantwort auf der Modulfolie eingeleitet wird, je Modul.
 *
 * Erster Teil ist der Satzanfang vor dem Doppelpunkt, zweiter Teil der Satz
 * danach. Der Aufbau ist derselbe wie auf Folie 2: Ansichtsnummer, Antwort im
 * Klartext, und was sie für das Gespräch bedeutet. Kein nackter Wert.
 */
const MODUL_WEGANTWORT3: Partial<Record<ModulId, { was: string; folge: string }>> = {
  m1: {
    was: "wer heute bei dir kauft",
    folge: "Daran messen wir, wie groß die Umstellung auf den Kapitalanleger für dich wirklich ist.",
  },
  m2: {
    was: "ob du Immobilien schon einmal in eine Beratung eingebaut hast",
    folge: "Daran richten wir aus, wie ausführlich wir den Objektteil machen.",
  },
  m3: {
    was: "woher deine Kunden heute kommen",
    folge:
      "Daran hängt, an wie vielen Fällen du gleichzeitig arbeiten musst, damit die Wartezeit nicht " +
      "als Stillstand wirkt.",
  },
  m4: {
    was: "was dich bisher vom Verkaufen abgehalten hat",
    folge:
      "Daran richten wir aus, wie lange jemand aus dem Haus bei deinen ersten Gesprächen dabei ist.",
  },
  m5: {
    was: "wie du am liebsten lernst",
    folge: "Daran richten wir aus, womit dein Lernplan anfängt.",
  },
};

/**
 * Seine dritte Wegantwort, als Block für die Modulfolie seines Wegs.
 *
 * Bis zum 22.09.2026 bekam `folieModul` die Antworten gar nicht, deshalb war
 * jede Modulfolie für jeden Bewerber desselben Wegs wortgleich und
 * `wegAntwort3` stand nirgends. Fehlt die Antwort, bleibt die Folie wie bisher:
 * ohne ausgefüllten Bogen gibt es zwar gar keine Folien, aber das soll nicht
 * stillschweigend kaputtgehen.
 */
function modulWegAntwort3(id: ModulId, l?: KennenlernenLesekopf): FolienBlock | null {
  if (!l || !l.weg || MODUL_ZU_WEG[id] !== l.weg) return null;
  const fassung = MODUL_WEGANTWORT3[id];
  if (!fassung) return null;
  const antwort = l.text("wegAntwort3").trim().replace(/\.$/, "");
  if (!antwort) return null;
  return {
    art: "kasten",
    titel: "Was du dazu angegeben hast",
    text: `Auf Ansicht ${l.nrFrage("wegAntwort3")} steht, ${fassung.was}: ${antwort}. ${fassung.folge}`,
  };
}

function folieModul(id: ModulId, l?: KennenlernenLesekopf): FolienBlock[] {
  const eigene = modulWegAntwort3(id, l);
  return eigene ? [eigene, ...modulBloecke(id)] : modulBloecke(id);
}

function modulBloecke(id: ModulId): FolienBlock[] {
  switch (id) {
    case "m1":
      return [
        {
          art: "kasten",
          titel: "Was du kennst",
          text:
            "Objektakquise, Besichtigung, Preisverhandlung. Darüber reden wir nicht. Was du an einem " +
            "Objekt bewerten musst, kannst du bereits.",
        },
        {
          art: "liste",
          titel: "Was hier anders ist",
          unterzeile: "Der Käufer will keine Wohnung, sondern eine Rendite.",
          punkte: [
            "Er besichtigt oft nicht und wohnt nie darin.",
            "Entscheidend sind Lage, Mietniveau, Instandhaltung und die Steuerwirkung.",
            "Die Objekte kommen aus dem Haus, du akquirierst sie nicht selbst.",
          ],
        },
        {
          art: "kasten",
          titel: "Und was das an deinem Alltag ändert",
          text:
            "Du gewinnst weiterhin selbst Kunden, aber du suchst keine Objekte mehr. Die Zeit, die du " +
            "heute in Objektakquise steckst, geht hier vollständig in die Kundenseite.",
        },
      ];
    case "m2":
      return [
        {
          art: "liste",
          titel: "Was direkt anschlussfähig ist",
          punkte: [
            "Das Beratungsgespräch selbst, also zuhören und einordnen",
            "Finanzierung, Haushaltsrechnung, Bonität",
            "Der Umgang mit einer langfristigen Entscheidung",
          ],
        },
        {
          art: "liste",
          titel: "Was du dir holen musst",
          punkte: [
            "Objektwissen: Lage, Mietniveau, Instandhaltung",
            "Die steuerliche Seite der Kapitalanlage",
            "Die Erlaubnis nach Paragraf 34c, im geklärten Umfang",
          ],
        },
        {
          art: "kasten",
          titel: "Und die Abgrenzung, die oft übersehen wird",
          ton: "warnung",
          text:
            "Deine bisherige Zulassung deckt das hier nicht ab. Eine Erlaubnis nach Paragraf 34d oder " +
            "34f ist etwas anderes als die nach Paragraf 34c. Welche du brauchst und in welchem Umfang, " +
            "klären wir vor Aufnahme der Tätigkeit, gemeinsam und schriftlich.",
        },
      ];
    case "m3":
      return [
        {
          art: "kasten",
          titel: "Der Unterschied, in einer Zeile",
          text:
            "Ein Verkaufszyklus dauert hier Wochen bis Monate, nicht Tage. Zwischen dem ersten Gespräch " +
            "und dem Notartermin liegen Objektauswahl, Finanzierungszusage und oft eine zweite Person, " +
            "die mitentscheidet. Das ist kein Zeichen dafür, dass es schlecht läuft.",
        },
        {
          art: "kasten",
          titel: "Was das für deine Woche heißt",
          text:
            "Du arbeitest an mehreren Fällen gleichzeitig und siehst das Ergebnis erst später. Wer aus " +
            "einem Geschäft mit schnellem Abschluss kommt, erlebt das anfangs als Stillstand.",
        },
        {
          art: "liste",
          titel: "Und wovon es abhängt",
          unterzeile:
            "Bewusst ohne Zahl. Belastbare Durchschnittswerte nennen wir erst, wenn sie über mehrere " +
            "Quartale gemessen sind.",
          punkte: [
            "Vom Kunden und seiner Entscheidungssituation",
            "Vom Objekt und seiner Verfügbarkeit",
            "Von der Finanzierung, dem häufigsten Grund für Verzögerung",
          ],
        },
      ];
    case "m4":
      return [
        {
          art: "liste",
          titel: "Wie ein Beratungsgespräch abläuft",
          punkte: [
            "Zuhören. Was will der Mensch erreichen, und bis wann.",
            "Einordnen. Was davon ist mit einer Kapitalanlage erreichbar, was nicht.",
            "Rechnen. Miete, Kosten, Finanzierung, Steuerwirkung.",
            "Offen lassen. Was du nicht weißt, sagst du. Das ist kein Fehler.",
          ],
        },
        {
          art: "liste",
          titel: "Und wie du dahin kommst",
          punkte: [
            "Die ersten Gespräche führst du gemeinsam mit jemandem aus dem Haus.",
            "Wie lange, bestimmst du. Es gibt keine feste Zahl.",
            "Ohne Erlaubnis nach Paragraf 34c führst du zu, beraten wird gemeinsam.",
          ],
        },
        {
          art: "kasten",
          titel: "Was wir nicht versprechen",
          ton: "warnung",
          text:
            "Eine feste Zahl begleiteter Gespräche steht hier erst, wenn Zuständigkeit und Kapazität " +
            "dafür verbindlich geregelt sind. Bis dahin gilt die Regel, nicht die Zahl.",
        },
      ];
    case "m5":
      return [
        {
          art: "plan",
          titel: "Der Lernplan, an Voraussetzungen geknüpft",
          stufen: [
            {
              wann: "Ab Start",
              titel: "Pflichtmodule",
              text: "Vertriebs-Grundlagen, DSGVO und Compliance, Selbstauskunft-Prozess, Pipeline und Lead-Handling.",
            },
            {
              wann: "Danach",
              titel: "Produkt und Rechnen",
              text: "Objektarten, Kalkulation, Finanzierung, Steuerwirkung. Zeitpunkt hängt an deinem Tempo, nicht am Kalender.",
            },
            {
              wann: "Begleitet",
              titel: "Erste Gespräche",
              text: "Gemeinsam mit jemandem aus dem Haus, so lange du das brauchst.",
            },
            {
              wann: "Nach Freigabe",
              titel: "Eigene Fälle",
              text: "Sobald Nachweise vorliegen und die fachliche Freigabe erteilt ist.",
            },
          ],
        },
        {
          art: "kasten",
          titel: "Was ohne Nachweise möglich ist",
          text:
            "Lernen und Interessenten zuführen. Das Beratungsgespräch selbst führt jemand aus dem Haus, " +
            "gemeinsam mit dir. Diese Grenze fällt, sobald die Erlaubnis im geklärten Umfang vorliegt.",
        },
        {
          art: "kasten",
          titel: "Und was hier nicht steht",
          ton: "warnung",
          text:
            "Keine Kalenderwoche als Versprechen. „Erste Kundenfälle in Woche 2“ wäre ein Ziel unter " +
            "Bedingungen und keine Zusage.",
        },
      ];
    case "m6":
      return [
        {
          art: "kasten",
          titel: "Dein Satz",
          text:
            `${PROVISION_PROZENT} Prozent vom notariellen Kaufpreis, brutto inklusive Umsatzsteuer, für ` +
            `zugewiesene Leads wie für eigene Kunden. ${BEISPIEL_KAUFPREIS_EUR.toLocaleString("de-DE")} Euro ` +
            `mal ${PROVISION_PROZENT} Prozent sind ${BEISPIEL_PROVISION_EUR.toLocaleString("de-DE")} Euro.`,
        },
        {
          art: "liste",
          titel: "Wo sich das einordnet",
          unterzeile: "Gegen das, was du kennst. Ohne Wettbewerbernamen, die Spannen kannst du selbst prüfen.",
          punkte: [
            "Ein Maklerauftrag bringt je nach Region drei bis sechs Prozent, aber du beschaffst Objekt, Kunde und Unterlagen selbst.",
            "Im Bauträgervertrieb liegt die Innenprovision beim Bauträger, du bekommst einen Anteil daraus.",
            "Bei uns kommt das Objekt fertig, die Finanzierung läuft über das Haus, das Backoffice macht die Unterlagen.",
            "Was gleich bleibt: ohne Abschluss null Euro.",
          ],
        },
        {
          art: "liste",
          titel: "Was fest ist",
          punkte: [
            "CRM, Objektzugänge und Unterlagen kosten nichts.",
            "Training, Landingpage, Verkaufsunterlagen, Coaching, Community und Support kosten ebenfalls nichts. Kein laufendes Entgelt, keine Mindestlaufzeit.",
            `Leads sind eine eigene Bestellung: ${LEAD_PAKET_ANZAHL} qualifizierte für ${LEAD_PAKET_PREIS.toLocaleString("de-DE")} Euro netto.`,
            "Kein Gebietsschutz. Es zählt, wer einen Kontakt zuerst im CRM hat.",
            "Deine eigenen Kunden bleiben deine, auch nach einer Trennung.",
          ],
        },
        {
          art: "kasten",
          titel: "Was verhandelbar ist",
          text:
            `Weniger, als du vielleicht erwartest. Der Satz des Pakets ist ${PROVISION_PROZENT} Prozent. ` +
            "Abweichungen sind im Einzelfall möglich und stehen dann im Vertrag. Zu verhandeln gibt es " +
            "beim Rest nichts: Was das Haus stellt, kostet nichts, und das steht so im Vertrag.",
        },
      ];
    /*
     * Modul 7, nur auf Weg 2. Im Kennenlernbogen stehen die drei Vorteile ohne
     * Produktnamen; hier wird das Produkt benannt. Die Konditionen bleiben
     * ausdrücklich draußen, dazu gibt es ein eigenes Gespräch (Punkt O1).
     */
    case "m7":
      return [
        {
          art: "kasten",
          titel: "Worum es geht",
          text:
            `${ZWEITES_PRODUKT_NAME}. Ein zweites Produkt neben der Kapitalanlage, für dieselben ` +
            "Interessenten, mit denen du ohnehin über Geld sprichst. Du musst es nicht anbieten, und es " +
            "ist keine Bedingung für die Zusammenarbeit.",
        },
        {
          art: "liste",
          titel: "Was es dir bringt",
          unterzeile: "Dieselben drei Vorteile, die schon im Kennenlernen standen.",
          punkte: [
            "Ein zweiter Anlass für dasselbe Gespräch, ohne einen neuen Kunden gewinnen zu müssen.",
            "Ein Thema, das zu deiner bisherigen Beratung passt und keine neue Erlaubnis nach Paragraf 34c braucht.",
            "Eine zweite Einnahmequelle, die unabhängig vom langen Zyklus der Immobilie läuft.",
          ],
        },
        {
          art: "kasten",
          titel: "Und zu den Konditionen",
          text: ZWEITES_PRODUKT_SCHLUSSSATZ,
        },
      ];
    default:
      return [];
  }
}

// ─────────────────────────── Die Folienfolge ──────────────────────────────

/** Die Kopfzeile eines Bausteins, mit der Minutenangabe, wo eine dazugehört. */
function kopfzeileFuer(eintrag: FolgeEintrag): string {
  if (eintrag.art === "modul") return "Vertiefung, 5 Minuten";
  return getKern(eintrag.id).kopfzeile;
}

/**
 * Titel, Unterzeile und Glanzwort der sechs Kernfolien.
 *
 * Die Unterzeile darf eine Funktion sein. Gebraucht wird das überall dort, wo
 * sie eine Ansicht des Kennenlernens nennt: Deren Nummer hängt am Weg dieses
 * Bewerbers und lässt sich hier oben nicht hinschreiben.
 */
type KernTitel = {
  titel: string;
  unterzeile: string | ((l: KennenlernenLesekopf) => string);
  glanz: string;
};

const KERN_TITEL: Record<KernId, KernTitel> = {
  begruessung: {
    titel: "Wir fangen bei deinen Fragen an.",
    unterzeile: "Was du im Kennenlernen markiert hast, steht heute ganz oben.",
    glanz: "deinen Fragen",
  },
  ausgangslage: {
    titel: "Zwei Spalten: was trägt, und was wir klären.",
    unterzeile: "Aus deinen Angaben, ohne Bewertung.",
    glanz: "was trägt",
  },
  arbeitsteilung: {
    titel: "Fünf Schritte, und bei jedem steht, wer ihn macht.",
    unterzeile: (l) =>
      `Derselbe Fall, den du auf Ansicht ${l.nr("abwicklung")} gelesen hast, hier mit den Zuständigkeiten.`,
    glanz: "wer ihn macht",
  },
  /*
   * Die Servicefolie heißt seit dem Wegfall der Servicevereinbarung (Punkt E2)
   * „Was ab Tag 1 bereitsteht". Der frühere Titel stellte enthaltene Leistungen
   * und Kosten gegenüber; es gibt aber nichts mehr gegenüberzustellen.
   */
  service: {
    titel: "Was ab Tag 1 bereitsteht.",
    unterzeile: "Gestellt, ohne eigenen Vertrag, ohne Monatsgebühr, ohne Mindestlaufzeit.",
    glanz: "ab Tag 1",
  },
  bedingungen: {
    titel: "Bestätigen statt noch einmal erklären.",
    unterzeile: "Wesentliches war vor der Buchung zugänglich. Hier kommt nichts Neues dazu.",
    glanz: "Bestätigen",
  },
  weitergehen: {
    titel: "Zwei Entscheidungen, und sie sind getrennt.",
    unterzeile: "Drei gleich große Türen, keine ist hervorgehoben.",
    glanz: "getrennt",
  },
};

const MODUL_TITEL: Record<ModulId, { titel: string; glanz: string }> = {
  m1: { titel: "Du kennst Immobilien. Neu ist der Käufertyp.", glanz: "der Käufertyp" },
  m2: { titel: "Beratung kannst du. Neu sind Objekt und Erlaubnis.", glanz: "Objekt und Erlaubnis" },
  m3: { titel: "Du verkaufst bereits. Neu ist die Länge.", glanz: "die Länge" },
  m4: { titel: "Objekte kennst du. Neu ist das Gespräch.", glanz: "das Gespräch" },
  m5: { titel: "Beides ist neu. Also fangen wir vorne an.", glanz: "vorne an" },
  m6: { titel: "Wo sich unsere Konditionen einordnen.", glanz: "einordnen" },
  m7: { titel: "Ein zweites Produkt für dieselben Gespräche.", glanz: "zweites Produkt" },
};

/**
 * Woher die Angaben einer Kernfolie stammen, klein unten rechts auf der Folie.
 *
 * Abgeleitet und nicht von Hand gepflegt. Die Nummern verschieben sich, sobald
 * im Bogen eine Ansicht dazukommt oder wegfällt, und auf Weg 2 sind sie
 * ohnehin um eins größer, weil dieser Weg eine Vertiefung mehr hat. Von Hand
 * gepflegt waren sie zuletzt an sechs von zwölf Stellen falsch.
 */
function kernQuelle(id: KernId, l: KennenlernenLesekopf): string {
  const weg = getWeg(l.weg);
  // Die drei bis vier eigenen Ansichten des Wegs, direkt hinter der Weiche.
  const wegNummern = (weg?.ansichten ?? []).map((a) => l.nr(a.id));
  const wegListe = wegNummern.join(", ");

  switch (id) {
    case "begruessung":
      return `Ansicht ${l.nrFrage("themen")} und Ansicht ${l.nr("weiche")}`;
    case "ausgangslage":
      return wegListe
        ? `Ansicht ${l.nr("weiche")}, ${wegListe}`
        : `Ansicht ${l.nr("weiche")}`;
    case "arbeitsteilung":
      return `Ansicht ${l.nr("weiche")} und Ansicht ${l.nrFrage("wegAntwort2")}`;
    case "service":
      return `Ansicht ${l.nr("tageins")}, Was ab Tag 1 bereitsteht`;
    case "bedingungen":
      // Der Tätigkeitsmaßstab steht eine Ansicht früher, in Kapitel 5.
      return `Ansicht ${l.nr("erwartung")}, ${l.nr("zeit")} bis ${l.nr("erlaubnis")}`;
    default:
      return "Für alle gleich";
  }
}

/**
 * Die Folien eines Termins, in ihrer Reihenfolge.
 *
 * Ohne gültige Strecke gibt es keine Folien. Das ist Absicht: Liegt kein
 * ausgefülltes Kennenlernen vor, gibt es diesen Termin nicht, weil sich weder
 * Dauer noch Module bestimmen lassen.
 */
export function videocallFolien(
  antworten: KennenlernenAntworten,
  zusatz: readonly ModulId[] = [],
): VideocallFolie[] {
  const l = lies(antworten);
  if (!l.weg) return [];
  const strecke = getStrecke(l.weg);
  if (!strecke) return [];
  const folge = folienFolge(l.weg, zusatz);
  const gesamt = folge.length;

  return folge.map((eintrag, i) => {
    const nummerText = `Folie ${i + 1} von ${gesamt}`;
    if (eintrag.art === "modul") {
      const m = getModul(eintrag.id);
      return {
        id: `modul-${m.id}`,
        art: "modul",
        bausteinId: m.id,
        kicker: "Modul, bei Bedarf",
        nummerText,
        kopfzeile: kopfzeileFuer(eintrag),
        titel: MODUL_TITEL[m.id].titel,
        unterzeile: m.fuerWen,
        glanz: MODUL_TITEL[m.id].glanz,
        bloecke: folieModul(m.id, l),
        quelle: `Modul ${m.nummer} · ${m.woherErKommt}`,
      };
    }
    const k = getKern(eintrag.id);
    const titel = KERN_TITEL[k.id];
    let bloecke: FolienBlock[] = [];
    switch (k.id) {
      case "begruessung": bloecke = folieBegruessung(l, zusatz); break;
      case "ausgangslage": bloecke = folieAusgangslage(l); break;
      case "arbeitsteilung": bloecke = folieArbeitsteilung(l); break;
      case "service": bloecke = folieService(); break;
      case "bedingungen": bloecke = folieBedingungen(l); break;
      case "weitergehen": bloecke = folieWeitergehen(l); break;
    }
    return {
      id: `kern-${k.id}`,
      art: "kern",
      bausteinId: k.id,
      kicker: "Kern, immer dabei",
      nummerText,
      kopfzeile: kopfzeileFuer(eintrag),
      titel: titel.titel,
      unterzeile: typeof titel.unterzeile === "function" ? titel.unterzeile(l) : titel.unterzeile,
      glanz: titel.glanz,
      bloecke,
      quelle: kernQuelle(k.id, l),
    };
  });
}

// ────────────────── Was die HR-Managerin vorher sieht ──────────────────────

/**
 * Die Übersicht aus fünf Merkmalen, die den Punktwert vor dem Gespräch
 * ersetzt.
 *
 * Drei Spalten, weil Selbstauskunft, im Gespräch bestätigte Erkenntnis und
 * offene Frage drei verschiedene Dinge sind. Der Vorab-Score wird nicht
 * gelöscht, er wird vor dem Gespräch nur nicht mehr angezeigt: eine
 * Entscheidung über die Oberfläche und nicht über die Datenbank.
 */
export type MerkmalId = "rahmen" | "akquise" | "zeitplan" | "lernbedarf" | "voraussetzungen";

export type Merkmal = {
  id: MerkmalId;
  label: string;
  /** Was der Bewerber selbst angegeben hat. */
  selbstauskunft: "erfuellt" | "offen";
  /** Der Klartext dazu, ohne Wertung. */
  beleg: string;
};

export function merkmale(antworten: KennenlernenAntworten): Merkmal[] {
  const l = lies(antworten);
  const passung = l.werte("passung");
  const fixumVerstanden = l.wert("verstaendnisFixum") === "nein";
  const provisionVerstanden = l.wert("verstaendnisProvision") === "nein";
  const lead = l.wert("leadPraeferenz");
  const zeit = l.wert("zeitProWoche");
  const start = l.wert("startzeitpunkt");
  const gewerbe = l.wert("gewerbe");
  const erlaubnis = l.wert("erlaubnis34c");
  const strecke = l.weg ? getStrecke(l.weg) : null;

  const rahmenOk = passung.includes("selbststaendig") && passung.includes("variabel")
    && fixumVerstanden && provisionVerstanden;

  return [
    {
      id: "rahmen",
      label: "Rahmen akzeptiert",
      selbstauskunft: rahmenOk ? "erfuellt" : "offen",
      beleg: rahmenOk
        ? "Selbstständigkeit und schwankende Einnahmen bejaht, beide Verständnisfragen richtig."
        : `Mindestens ein Haken auf Ansicht ${l.nrFrage("passung")} fehlt oder eine Verständnisfrage ist mit Ja beantwortet.`,
    },
    {
      id: "akquise",
      label: "Akquiseplan erkennbar",
      selbstauskunft: lead && lead !== "unklar" ? "erfuellt" : "offen",
      beleg: l.text("leadPraeferenz") || `Auf Ansicht ${l.nrFrage("leadPraeferenz")} noch nichts entschieden.`,
    },
    {
      id: "zeitplan",
      label: "Zeitplan tragfähig",
      selbstauskunft: zeit && start && start !== "umschauen" ? "erfuellt" : "offen",
      beleg: [l.text("zeitProWoche"), l.text("startzeitpunkt")].filter(Boolean).join(" · ")
        || `Ansicht ${l.nrFrage("zeitProWoche")} und ${l.nrFrage("startzeitpunkt")} sind noch offen.`,
    },
    {
      id: "lernbedarf",
      label: "Lernbedarf benannt",
      selbstauskunft: strecke ? "erfuellt" : "offen",
      beleg: strecke ? `${strecke.label}. ${strecke.imSprechtext}` : "Ohne gewählten Weg gibt es keinen Termin.",
    },
    {
      id: "voraussetzungen",
      label: "Startvoraussetzungen",
      selbstauskunft: gewerbe === "ja" && erlaubnis === "ja" ? "erfuellt" : "offen",
      beleg: [
        l.text("gewerbe") ? `Gewerbe: ${l.text("gewerbe")}` : "",
        l.text("erlaubnis34c") ? `Erlaubnis 34c: ${l.text("erlaubnis34c")}` : "",
      ].filter(Boolean).join(" · ") || `Ansicht ${l.nrFrage("erlaubnis34c")} ist noch offen.`,
    },
  ];
}

/**
 * Die entscheidenden Antworten für die Vorbereitung, höchstens sieben Zeilen.
 *
 * Mehr braucht die Vorbereitung nicht, alles Weitere steht eine Ebene tiefer.
 * Ziel sind zwei bis drei Minuten.
 */
export function entscheidendeAntworten(antworten: KennenlernenAntworten): { label: string; wert: string }[] {
  const l = lies(antworten);
  return [
    { label: "Heute", wert: l.text("wegAntwort1") },
    { label: "Kunden heute", wert: l.text("wegAntwort2") },
    { label: "Zeit je Woche", wert: l.text("zeitProWoche") },
    { label: "Start", wert: l.text("startzeitpunkt") },
    { label: "Gewerbe", wert: l.text("gewerbe") },
    { label: "Erlaubnis 34c", wert: l.text("erlaubnis34c") },
    { label: "Akquise", wert: l.text("leadPraeferenz") },
  ].filter((z) => z.wert.trim() !== "");
}

/**
 * Höchstens drei offene Punkte für die Vorbereitung.
 *
 * Die markierten Themen zuerst, weil er sie selbst gesetzt hat, danach die
 * offene Startvoraussetzung, die sich aus seinen Angaben ergibt.
 */
export function vorbereitungsPunkte(antworten: KennenlernenAntworten): string[] {
  const l = lies(antworten);
  const punkte = [...themenLabels(antworten)];
  const erlaubnisOffen = l.wert("erlaubnis34c") !== "ja";
  const gewerbeOffen = l.wert("gewerbe") !== "ja";
  if (erlaubnisOffen) punkte.push("Umfang der Erlaubnis nach Paragraf 34c");
  else if (gewerbeOffen) punkte.push("Zeitpunkt der Gewerbeanmeldung");
  return punkte.slice(0, 3);
}

/** Die Begründung der Dauer, in einem Satz, für die Vorbereitung. */
export function dauerBegruendung(antworten: KennenlernenAntworten, zusatz: readonly ModulId[] = []): string {
  const l = lies(antworten);
  if (!l.weg) return "Ohne ausgefülltes Kennenlernen lässt sich die Dauer nicht bestimmen.";
  const strecke = getStrecke(l.weg);
  const module = aktiveModule(l.weg, zusatz);
  const namen = module.map((m) => `Modul ${getModul(m).nummer}`).join(" und ");
  const puffer = pufferMinuten(l.weg, zusatz);
  const grund = `${dauerMinuten(l.weg, zusatz)} Minuten: ${KERN_MINUTEN} Minuten Kern` +
    (module.length > 0 ? ` und ${module.length * MODUL_MINUTEN} Minuten für ${namen}` : "");
  if (puffer > 0 && strecke) {
    return `${grund}. Dazu ${puffer} Minuten Puffer, weil die Untergrenze dieser Strecke bei ` +
      `${strecke.untergrenze} Minuten liegt. Die Untergrenze stammt aus einer noch offenen Entscheidung und nicht aus einer Regel.`;
  }
  return `${grund}. Die Länge folgt dem Klärungsbedarf, nicht der Berufsgruppe.`;
}

// ───────────── Was die HR-Managerin währenddessen sieht ───────────────────

export type ModerationsHinweis = {
  /** Zu welcher Folie der Impuls gehört. */
  bausteinId: BausteinId;
  /** Gesprächsimpuls, kein Sprechtext. Vorlesen soll ihn niemand. */
  impuls: string;
};

export type StreckenModeration = {
  weg: WegId;
  hinweise: ModerationsHinweis[];
  /** Was auf dieser Strecke schriftlich zu erfassen ist. */
  erfassen: string[];
  /** Und was ausdrücklich nicht erfasst wird. */
  nichtErfassen: string[];
};

export const MODERATION: StreckenModeration[] = [
  {
    weg: "weg1",
    hinweise: [
      { bausteinId: "arbeitsteilung", impuls: "Nach einem Fall fragen, in dem ein Kaufprozess gestockt hat." },
      { bausteinId: "m1", impuls: "Fragen, was sich für ihn ändert, wenn der Käufer nie einzieht." },
    ],
    erfassen: [
      "Welcher der markierten Zeitfresser bei ihm wirklich die meiste Zeit kostet",
      "Was er zum Käufertyp sagt",
    ],
    nichtErfassen: [
      "Kein Ersteindruck zu Stimme, Energie oder Umfeld",
      "Keine Erwartung, die aus der Zahl seiner Abschlüsse abgeleitet wird",
    ],
  },
  {
    weg: "weg2",
    hinweise: [
      { bausteinId: "m2", impuls: "Nachfragen, ob er den Unterschied der Erlaubnisse schon kannte." },
      { bausteinId: "bedingungen", impuls: "Den Umfang der 34c benennen lassen, daraus wird die Frist." },
    ],
    erfassen: ["Was er zum Umfang der Erlaubnis nach 34c sagt, weil daraus die Frist wird"],
    nichtErfassen: [
      "Keine Bewertung seiner bisherigen Zulassung",
      "Keine Notiz über seinen heutigen Arbeitgeber",
    ],
  },
  {
    weg: "weg3",
    hinweise: [
      { bausteinId: "ausgangslage", impuls: "Nachfragen, wie er mit einem Fall umgeht, der drei Monate liegen bleibt." },
      { bausteinId: "m3", impuls: "Keine Durchschnittszahl nennen. Es gibt dazu heute keine gemessene Zahl." },
    ],
    erfassen: ["Die beiden Wochentermine, die auf der Bedingungsfolie zur Absprache werden"],
    nichtErfassen: [
      "Keine Hochrechnung aus seiner eigenen Zykluslänge",
      "Keine Zahl, die er später zitieren könnte",
    ],
  },
  {
    weg: "weg4",
    hinweise: [
      { bausteinId: "bedingungen", impuls: "Einen Namen festhalten: wer die ersten Gespräche begleitet." },
    ],
    erfassen: ["Der Name der Person, die die ersten Gespräche begleitet"],
    nichtErfassen: [
      "Keine Einschätzung, ob ihm das Verkaufen liegt. Dieses Gespräch prüft ihn nicht",
      "Keine Zahl begleiteter Gespräche ohne einen Namen dahinter",
    ],
  },
  {
    weg: "weg5",
    hinweise: [
      { bausteinId: "bedingungen", impuls: "Die Frage nach dem Geldbedarf sachlich stellen und die Antwort ohne Bewertung notieren." },
    ],
    erfassen: ["Welche Pflichtmodule bis wann laufen"],
    nichtErfassen: [
      "Keine Bemerkung über sein privates Umfeld",
      "Keine Angabe über Dritte. Die Frage nach der Zahl der Bekannten ist schon im Bogen gestrichen",
    ],
  },
];

export function getModeration(weg: WegId): StreckenModeration | null {
  return MODERATION.find((m) => m.weg === weg) ?? null;
}

/** Der Impuls zu einer Folie, sonst der allgemeine Impuls dieses Bausteins. */
const IMPULS_ALLGEMEIN: Record<BausteinId, string> = {
  begruessung: "Seine eigene Frage im Wortlaut vorlesen und sagen, wann sie beantwortet wird.",
  ausgangslage: "Fragen, ob die linke Spalte stimmt. Widerspruch ist hier wertvoller als Zustimmung.",
  arbeitsteilung: "„Von diesen fünf Schritten, welcher wäre für dich der ungewohnteste?“",
  service: "Fragen, welche der sechs Leistungen für ihn die wichtigste wäre.",
  bedingungen: "Jeden offenen Punkt mit Name und Frist bestätigen lassen.",
  weitergehen: "Zuerst die eigene Einschätzung nennen, dann die drei Türen, ohne eine zu betonen.",
  m1: "Fragen, wie viel seiner Woche heute für Objektakquise draufgeht.",
  m2: "Nachfragen, ob er den Unterschied der Erlaubnisse schon kannte.",
  m3: "Fragen, wie er mit einem Fall umgeht, der drei Monate liegen bleibt. Keine Durchschnittszahl nennen.",
  m4: "Fragen, welcher der vier Schritte ihm am fremdesten vorkommt.",
  m5: "Fragen, welche Voraussetzung er zuerst schaffen will. Keine Kalenderwoche zusagen.",
  m6: "Fragen, womit er unsere Zahlen vergleicht. Keine Wettbewerbernamen nennen.",
  m7: "Fragen, ob das Thema in seinen Gesprächen schon vorkommt. Keine Konditionen nennen, dafür gibt es den eigenen Termin.",
};

/**
 * Der Gesprächsimpuls zu einer Folie. Kein Sprechtext: Wer vorliest, hört
 * nicht zu. Der Impuls der Strecke geht dem allgemeinen vor.
 */
export function impulsFuer(weg: WegId, bausteinId: BausteinId): string {
  const eigen = getModeration(weg)?.hinweise.find((h) => h.bausteinId === bausteinId);
  return eigen?.impuls ?? IMPULS_ALLGEMEIN[bausteinId] ?? "";
}

// ─────────────────── Was im Gespräch erfasst wird ─────────────────────────

/**
 * Der Gesprächsstand des Videocalls.
 *
 * Liegt im vorhandenen `erstgespraechSkript` und braucht deshalb keine
 * Migration. Erfasst werden ausschließlich sachliche Beispiele und
 * Absprachen. „Stimme, Energie, Umfeld" als Ersteindruck gibt es hier
 * bewusst nicht: Auftreten und Kamerahintergrund sind keine verlässliche
 * Eignungsgrundlage.
 */
export type VideocallErfassung = {
  /** Zusätzlich zugeschaltete Module, in der Reihenfolge des Zuschaltens. */
  module?: ModulId[];
  /** Begründung, wenn die Auswahl von der Vorauswahl abweicht. */
  modulBegruendung?: string;
  /** Punkte, die im Gespräch geklärt wurden. */
  geklaert?: string[];
  /** Punkte, die jemand nachreichen muss, jeweils mit Name und Frist. */
  nachreichen?: string[];
  /** Arbeitsbezogene Beobachtungen mit Beispiel aus dem Gespräch. */
  beobachtungen?: string[];
  /** Getroffene Absprachen. */
  absprachen?: string[];
  /** Welche der fünf Merkmale im Gespräch bestätigt wurden. */
  bestaetigt?: MerkmalId[];
  /** Die Entscheidung von OS Immobilien. Die des Bewerbers steht auf seiner Seite. */
  entscheidung?: "" | "moeglich" | "klaerung" | "nicht_moeglich";
  /** Pflichtgrund, wenn die Entscheidung „nicht möglich" lautet. */
  entscheidungGrund?: string;
  /**
   * Was der Bewerber will: die drei Türen der letzten Folie.
   *
   * Ausdrücklich getrennt von `entscheidung`. Die eine ist die Einschätzung
   * des Hauses, die andere der Wunsch des Bewerbers, und sie können
   * auseinandergehen. Genau das sagt die Schlussfolie auch.
   */
  wunsch?: "" | "starten" | "unterlagen" | "passt_nicht";
  /**
   * Was bei „Noch Klärung erforderlich" offen ist, im Wortlaut.
   *
   * Eigenes Feld und nicht `entscheidungGrund`: Die beiden bedeuten
   * Verschiedenes und landen an verschiedenen Stellen. Der Grund einer Absage
   * geht als `closingAbgelehntGrund` in die Akte, der Klärungsbedarf wird zur
   * Notiz des Follow-ups und steht damit in der Inbox. Ein gemeinsames Feld
   * würde beim Wechsel der Einschätzung stillschweigend die Bedeutung
   * wechseln.
   */
  klaerungBedarf?: string;
  /** Der Folgetermin zur Klärung, als ISO-Datum (JJJJ-MM-TT). */
  klaerungDatum?: string;
  /** Die Uhrzeit des Folgetermins, HH:MM oder leer. */
  klaerungUhrzeit?: string;
  /**
   * Das Nachfassen zum Startfahrplan, wenn er nur die Unterlagen wollte.
   *
   * Eigene Felder und nicht die drei Klärungsfelder: Beide können im selben
   * Gespräch anfallen (unsere Einschätzung „Klärung“ und sein Wunsch nach den
   * Unterlagen), und sie bedeuten Verschiedenes. Ein gemeinsames Feld würde
   * beim Wechsel der Einschätzung stillschweigend die Bedeutung wechseln.
   */
  unterlagenDatum?: string;
  /** Die Uhrzeit des Nachfassens, HH:MM oder leer. */
  unterlagenUhrzeit?: string;
  /** Die Notiz des Nachfassens. Sie wird zur Notiz des Follow-ups. */
  unterlagenNotiz?: string;
  /** Zuletzt gezeigte Folien-Id, damit ein Neuladen nicht auf Folie 1 springt. */
  letzteFolie?: string;
};

export const ENTSCHEIDUNG_LABELS: Record<
  Exclude<NonNullable<VideocallErfassung["entscheidung"]>, "">,
  string
> = {
  moeglich: "Zusammenarbeit möglich",
  klaerung: "Noch Klärung erforderlich",
  nicht_moeglich: "Nicht möglich, mit Grund",
};

/** Die drei Türen der letzten Folie, in ihrer Reihenfolge dort. */
export const WUNSCH_LABELS: Record<
  Exclude<NonNullable<VideocallErfassung["wunsch"]>, "">,
  { label: string; hinweis: string }
> = {
  starten: {
    label: "Will starten",
    hinweis: "Der Vertrag wird erstellt. Dafür braucht es Vertragsanschrift und Rechnungsadresse.",
  },
  unterlagen: {
    label: "Möchte die Unterlagen",
    hinweis:
      "Der Startfahrplan geht ihm gleich per Mail zu. Unterschrieben wird heute nichts, " +
      "und wir setzen ein Nachfassen, damit die Entscheidung nicht liegen bleibt.",
  },
  passt_nicht: {
    label: "Passt für ihn nicht",
    hinweis: "Sauber beendet, niemand fasst nach.",
  },
};

/**
 * Bei welchen Wünschen die Adressen gebraucht werden.
 *
 * „Will starten" und „Möchte die Unterlagen" führen beide zu einem Schriftstück
 * mit Anschrift. „Passt für ihn nicht" führt zu keinem.
 */
export function brauchtAdressen(wunsch: VideocallErfassung["wunsch"]): boolean {
  return wunsch === "starten" || wunsch === "unterlagen";
}

/**
 * Die Entscheidung des Videocalls, übersetzt in die Sprache des Closings.
 *
 * Das Closing kennt nur `ja`, `bedenkzeit` und `nein`. Ohne diese Abbildung
 * blieb der Klick im Videocall folgenlos: Der Reiter Closing las den Wert
 * nicht, zeigte „Präsentation noch nicht gehalten" und ließ die Entscheidung
 * offen. Die Zuordnung steht deshalb an genau einer Stelle.
 */
export const CLOSING_AUS_ENTSCHEIDUNG = {
  moeglich: "ja",
  klaerung: "bedenkzeit",
  nicht_moeglich: "nein",
} as const;

export type ClosingEntscheidung = (typeof CLOSING_AUS_ENTSCHEIDUNG)[keyof typeof CLOSING_AUS_ENTSCHEIDUNG];

export function closingEntscheidungAus(
  entscheidung: VideocallErfassung["entscheidung"],
): ClosingEntscheidung | "" {
  if (!entscheidung) return "";
  return CLOSING_AUS_ENTSCHEIDUNG[entscheidung] ?? "";
}

/**
 * Was der Abschluss tut, aus beiden Wahlen zusammen.
 *
 * ## Warum beide Wahlen zählen
 *
 * Bis zum 07.09.2026 hing die Wirkung allein an unserer Einschätzung. Der
 * Wunsch des Bewerbers stand daneben und blieb folgenlos. Damit landete
 * jemand, der ausdrücklich abgewinkt hatte, im Closing, sobald wir die
 * Zusammenarbeit für möglich hielten. Genau das ist gemeint mit: hinter jeder
 * Wahl muss eine passende Aktion stehen.
 *
 * Die Regel in einem Satz: **Ein Nein des Bewerbers wiegt schwerer als unser
 * Ja, und ein begründetes Nein des Hauses wiegt schwerer als sein Ja.**
 *
 * | Einschätzung  | Wunsch          | Ergebnis                              |
 * | ------------- | --------------- | ------------------------------------- |
 * | möglich       | will starten    | Closing, Entscheidung „ja"            |
 * | möglich       | Unterlagen      | Startfahrplan und Nachfassen          |
 * | möglich       | passt ihm nicht | Kein Interesse, mit Grund             |
 * | möglich       | offen           | Closing, Entscheidung „ja"            |
 * | Klärung       | will starten    | Follow-Up mit Folgetermin             |
 * | Klärung       | Unterlagen      | Follow-Up, Startfahrplan geht mit raus|
 * | Klärung       | passt ihm nicht | Kein Interesse, mit Grund             |
 * | Klärung       | offen           | Follow-Up mit Folgetermin             |
 * | nicht möglich | jeder Wunsch    | Abgelehnt, mit Grund                  |
 * | keine         | jeder Wunsch    | nur speichern                         |
 *
 * ## Warum „Möchte die Unterlagen" seit dem 08.09.2026 eine eigene Tür ist
 *
 * Vorher führte sie in dasselbe Closing wie „will starten", mit der
 * Begründung, der Reiter Closing habe für diesen Fall seine eigene Weiche. Das
 * war eine Wahl ohne Folge: Wer nur die Unterlagen wollte, stand als
 * abschlussbereit in der Pipeline, und ob ihm jemand den Startfahrplan
 * schickte, hing daran, dass die HR-Managerin im Closing den richtigen Knopf
 * fand. Jetzt löst die Wahl selbst aus, was sie verspricht: Der Startfahrplan
 * geht hinaus, und ein Nachfassen sorgt dafür, dass die Entscheidung nicht
 * liegen bleibt. Der Unterschied zu „will starten" ist damit echt: Dort wird
 * der Vertrag erstellt, hier ist noch nichts entschieden.
 */
export type AbschlussArt =
  | "closing"
  | "unterlagen"
  | "followup"
  | "absage"
  | "keinInteresse"
  | "speichern";

export type Abschlusswirkung = {
  art: AbschlussArt;
  /** Der Status, den der Abschluss setzt. Leer heißt: bleibt, wie er ist. */
  status: "Closing" | "FollowUp" | "Abgelehnt" | "KeinInteresse" | "";
  /** Beschriftung des großen Knopfes. Er soll sagen, was er tut. */
  knopf: string;
  /** Die Zeile darunter: was der Klick auslöst. */
  wirkung: string;
};

export function abschlussWirkung(
  entscheidung: VideocallErfassung["entscheidung"],
  wunsch: VideocallErfassung["wunsch"],
): Abschlusswirkung {
  if (!entscheidung) {
    return {
      art: "speichern",
      status: "",
      knopf: "Persönliches Gespräch abschließen",
      wirkung: "Ohne Einschätzung wird nur gespeichert. Status und Closing bleiben, wie sie sind.",
    };
  }
  if (entscheidung === "nicht_moeglich") {
    return {
      art: "absage",
      status: "Abgelehnt",
      knopf: "Gespräch beenden und absagen",
      wirkung:
        "Öffnet die Absage mit Grund und wertschätzender Mail. Status: Abgelehnt. " +
        "Ein offenes Follow-up wird dabei entfernt.",
    };
  }
  if (wunsch === "passt_nicht") {
    return {
      art: "keinInteresse",
      status: "KeinInteresse",
      knopf: "Gespräch beenden, kein Interesse",
      wirkung:
        "Er selbst hat abgewinkt, deshalb geht es nicht ins Closing. Öffnet die Absage mit " +
        "Grund und wertschätzender Mail. Status: Kein Interesse.",
    };
  }
  if (entscheidung === "klaerung") {
    return {
      art: "followup",
      status: "FollowUp",
      knopf: wunsch === "unterlagen"
        ? "Abschließen, Startfahrplan senden und Folgetermin setzen"
        : "Abschließen und Folgetermin setzen",
      wirkung:
        "Setzt Zeitpunkt und Name, legt den Klärungsbedarf als Follow-up mit Termin ab und " +
        "setzt den Status auf Follow-Up. Der Termin erscheint am Fälligkeitstag in der Inbox." +
        (wunsch === "unterlagen"
          ? " Weil er die Unterlagen wollte, geht der Startfahrplan zusätzlich per Mail hinaus."
          : ""),
    };
  }
  if (wunsch === "unterlagen") {
    return {
      art: "unterlagen",
      status: "FollowUp",
      knopf: "Abschließen und Startfahrplan senden",
      wirkung:
        "Schickt ihm den Startfahrplan per Mail, legt das Nachfassen als Follow-up mit Termin " +
        "ab und setzt den Status auf Follow-Up. Der Termin erscheint am Fälligkeitstag in der " +
        "Inbox. Entschieden ist noch nichts, das Closing bleibt offen.",
    };
  }
  return {
    art: "closing",
    status: "Closing",
    knopf: "Persönliches Gespräch abschließen",
    wirkung:
      "Setzt Zeitpunkt und Name, die Entscheidung im Closing auf „Ja, will starten“ und den " +
      "Status auf Closing.",
  };
}

/**
 * Geht beim Abschluss der Startfahrplan hinaus?
 *
 * An genau einer Stelle beantwortet, weil zwei Wege dorthin führen: die eigene
 * Tür „Möchte die Unterlagen" und die Klärung, bei der er die Unterlagen
 * trotzdem wollte. Eine Absage schickt nichts, auch wenn der Wunsch dasteht.
 */
export function sendetStartfahrplan(
  entscheidung: VideocallErfassung["entscheidung"],
  wunsch: VideocallErfassung["wunsch"],
): boolean {
  if (!entscheidung || entscheidung === "nicht_moeglich") return false;
  return wunsch === "unterlagen";
}

/** Die Notiz, die im Follow-up steht, wenn niemand eine eigene schreibt. */
export const UNTERLAGEN_NOTIZ_VORGABE =
  "Startfahrplan gesendet, nachfassen wegen der Entscheidung.";

/**
 * Der Vorschlag für den Folgetermin: in einer Woche, zur selben Tageszeit.
 *
 * Ein Vorschlag und keine Vorschrift, beides bleibt änderbar. Er steht hier
 * und nicht in der Oberfläche, damit sich das Datum ohne Attrappe prüfen
 * lässt. Das Datum kommt im Format des `DateInput` (JJJJ-MM-TT), die Uhrzeit
 * als HH:MM.
 */
export function folgeterminVorschlag(jetzt: Date = new Date()): { datum: string; uhrzeit: string } {
  const ziel = new Date(jetzt.getTime());
  ziel.setDate(ziel.getDate() + 7);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return {
    datum: `${ziel.getFullYear()}-${zwei(ziel.getMonth() + 1)}-${zwei(ziel.getDate())}`,
    uhrzeit: `${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}`,
  };
}

/**
 * Die jüngste **eingereichte** Zeile des Kennenlernens, mit gewähltem Weg.
 *
 * Der Fehler, den das behebt: Geprüft wurde bisher nur die jüngste Zeile aus
 * `bewerber_formular`, gleich welchen Status sie hat. Wurde nach dem Ausfüllen
 * noch einmal eine Einladung verschickt, ist die jüngste Zeile eine leere
 * Einladung, und der Videocall behauptete „kein ausgefülltes Kennenlernen",
 * obwohl der Bogen vorliegt. Genau das ist bei Chris Test passiert.
 *
 * Maßgeblich ist deshalb der Status `eingereicht` **und** ein gewählter Weg.
 * Leere Einladungszeilen zählen nicht, gleich wie neu sie sind. Die Zeilen
 * müssen absteigend nach `created_at` hereinkommen, so wie die Abfragen sie
 * ohnehin bestellen.
 */
export type FormularZeileRoh = {
  status?: string | null;
  antworten?: unknown;
};

export function eingereichteKennenlernZeile<T extends FormularZeileRoh>(
  zeilen: readonly T[] | null | undefined,
): T | null {
  if (!zeilen || zeilen.length === 0) return null;
  return (
    zeilen.find(
      (z) =>
        String(z.status ?? "") === "eingereicht" &&
        istKennenlernen((z.antworten ?? {}) as KennenlernenAntworten),
    ) ?? null
  );
}

/**
 * Warum kein Kennenlernen vorliegt, in Worten.
 *
 * Bis zum 07.09.2026 stand an allen drei Stellen derselbe Satz: „Für X liegt
 * kein ausgefülltes Kennenlernen vor." Er sagt nicht, woran es liegt, und ist
 * bei einem Bewerber, der den Bogen ausgefüllt hat, schlicht unglaubwürdig.
 * Die vier Fälle unterscheiden sich in dem, was zu tun ist, und genau das
 * steht jetzt da.
 *
 * Gerechnet wird ausschließlich aus den Zeilen, die ohnehin geladen sind.
 * Keine zusätzliche Abfrage, kein zusätzlicher Tabellenzugriff im Browser.
 *
 * `text` ist die Feststellung und darf auch auf der geteilten Präsentation
 * stehen. `zuTun` ist der Hinweis an das Haus und bleibt in der Moderation
 * und im Reiter.
 */
export type KennenlernZeileRoh = FormularZeileRoh & {
  created_at?: string | null;
  expires_at?: string | null;
  /**
   * Der persoenliche Schluessel dieser Zeile.
   *
   * Gebraucht fuer die Einladung zur Terminbuchung: Der Knopf in der Mail
   * fuehrt auf die Buchungsstrecke, und die kennt den Bewerber nur ueber
   * dieses Token. Massgeblich ist das Token der EINGEREICHTEN Zeile, nicht
   * der juengsten; siehe `eingereichteKennenlernZeile`.
   */
  token?: string | null;
};

export type KennenlernBefundArt =
  | "laedt"
  | "vorhanden"
  | "ohneEinladung"
  | "offen"
  | "alterBogen"
  | "abgelaufen";

export type KennenlernBefund = {
  art: KennenlernBefundArt;
  titel: string;
  text: string;
  /** Was zu tun ist. Leer, wo nichts zu tun ist. */
  zuTun: string;
};

/** TT.MM.JJJJ aus einem Zeitstempel, leer wenn nichts Lesbares dasteht. */
function tagKurz(roh: string | null | undefined): string {
  const wert = (roh ?? "").trim();
  if (!wert) return "";
  const d = new Date(wert);
  if (isNaN(d.getTime())) return "";
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Ist die Zeile abgelaufen, nach Status oder nach Ablaufdatum? */
function istAbgelaufen(zeile: KennenlernZeileRoh, jetzt: Date): boolean {
  if (String(zeile.status ?? "") === "abgelaufen") return true;
  const bis = (zeile.expires_at ?? "").trim();
  if (!bis) return false;
  const d = new Date(bis);
  return !isNaN(d.getTime()) && d.getTime() < jetzt.getTime();
}

export function kennenlernBefund(
  zeilen: readonly KennenlernZeileRoh[] | null | undefined,
  vorname: string,
  geladen = true,
  jetzt: Date = new Date(),
): KennenlernBefund {
  const wer = (vorname || "").trim() || "diesen Bewerber";
  const leer = { text: "", zuTun: "" };

  if (!geladen) {
    return { art: "laedt", titel: "Einen Moment, der Bogen wird geladen.", ...leer };
  }

  const liste = zeilen ?? [];
  if (eingereichteKennenlernZeile(liste)) {
    return { art: "vorhanden", titel: "", ...leer };
  }

  if (liste.length === 0) {
    return {
      art: "ohneEinladung",
      titel: `Für ${wer} ist noch keine Einladung zum Kennenlernen verschickt.`,
      text:
        "Es gibt zu ihm keinen Bogen, auch keinen offenen. Ohne Kennenlernen lassen sich weder " +
        "die Dauer noch die Module bestimmen, und einen Termin kann er sich damit auch nicht buchen.",
      zuTun:
        "Zu tun: im Reiter Übersicht die Karte Kennenlernen öffnen und die Einladung verschicken.",
    };
  }

  // Ein eingereichter Bogen ohne gewählten Weg ist der alte Vorabbogen. Er
  // wiegt schwerer als eine daneben liegende offene Einladung: Der Bewerber
  // hat etwas ausgefüllt, nur eben das Falsche.
  const alt = liste.find((z) => String(z.status ?? "") === "eingereicht");
  if (alt) {
    const tag = tagKurz(alt.created_at);
    return {
      art: "alterBogen",
      titel: `${wer} hat den alten Vorabbogen ausgefüllt, nicht das neue Kennenlernen.`,
      text:
        `Der eingereichte Bogen${tag ? ` vom ${tag}` : ""} enthält keinen gewählten Weg. Aus ihm ` +
        "lassen sich weder die Module noch die Dauer bestimmen.",
      zuTun:
        "Zu tun: in der Karte Kennenlernen eine neue Einladung verschicken. Sie führt auf den " +
        "neuen Bogen, der alte bleibt unverändert in der Akte.",
    };
  }

  const offen = liste.find(
    (z) => String(z.status ?? "") === "offen" && !istAbgelaufen(z, jetzt),
  );
  if (offen) {
    const tag = tagKurz(offen.created_at);
    return {
      art: "offen",
      titel: `${wer} hat das Kennenlernen noch nicht abgesendet.`,
      text:
        `Die Einladung ist${tag ? ` am ${tag}` : ""} hinausgegangen, der Bogen ist noch offen. ` +
        "Sobald er absendet, stehen Folien und Dauer hier von selbst.",
      zuTun: "Zu tun: in der Karte Kennenlernen nachfassen oder die Einladung erneut verschicken.",
    };
  }

  const juengste = liste[0];
  const tag = tagKurz(juengste?.created_at);
  const bis = tagKurz(juengste?.expires_at);
  return {
    art: "abgelaufen",
    titel: `Die Einladung für ${wer} ist nicht mehr gültig.`,
    text:
      `Der Bogen${tag ? ` vom ${tag}` : ""} ist ${bis ? `seit dem ${bis} abgelaufen` : "abgelaufen oder ersetzt"} ` +
      "und wurde nicht ausgefüllt.",
    zuTun: "Zu tun: in der Karte Kennenlernen eine neue Einladung verschicken.",
  };
}

/**
 * Alle Antworten des Kennenlernens, in denselben drei Gruppen wie der
 * Überblick am Ende des Bogens, aber **vollständig**.
 *
 * `kennenlernenUeberblick` zeigt eine Auswahl, weil die Schlüssel dort von Hand
 * aufgezählt sind und eine später ergänzte Frage deshalb fehlte. Diese Fassung
 * geht stattdessen über die Ansichten dieses Bewerbers und nimmt jede Frage
 * mit, die eine Antwort hat. Kommt im Bogen eine Frage dazu, steht sie hier
 * ohne weiteres Zutun.
 *
 * Zwei Ergänzungen vom 08.09.2026:
 *
 *   - Die bedingten Fragen werden mit den Antworten dieses Bewerbers geprüft
 *     und nicht mehr gegen einen leeren Bogen. Vorher fielen sie stillschweigend
 *     heraus, und in der Akte fehlten die Begründung zur Erlaubnis und jeder
 *     Freitext hinter „Etwas anderes".
 *   - Danach kommen die `ALTFRAGEN` dran, also Fragen, die der Bogen nicht mehr
 *     stellt. Wer die Erreichbarkeit früher angegeben hat, dessen Angabe steht
 *     weiterhin in der Akte, statt mit der Frage zu verschwinden.
 */
const GRUPPE_STARTEN = new Set([
  "zeitProWoche", "perspektive", "leadPraeferenz", "einkommensziel", "startzeitpunkt", "erreichbarkeit",
]);
const GRUPPE_MITBRINGEN = new Set([
  "weg", "hintergrund", "wegAntwort1", "wegAntwort1Frei",
  "wegAntwort2", "wegAntwort2Frei", "wegAntwort3", "passung", "lernweise",
  // Die dritte Tür zu den Leads: eigene Erfahrung, deshalb hierher.
  "leadErfahrung", "leadQuote",
]);

export type UeberblickZeile = { label: string; wert: string };
export type UeberblickGruppe = { titel: string; zeilen: UeberblickZeile[] };

export function vollstaendigerUeberblick(
  antworten: KennenlernenAntworten | null | undefined,
): UeberblickGruppe[] {
  if (!antworten) return [];
  const starten: UeberblickZeile[] = [];
  const mitbringen: UeberblickZeile[] = [];
  const klaeren: UeberblickZeile[] = [];
  const gesehen = new Set<string>();

  const nimm = (frage: KennenlernenFrage) => {
    if (gesehen.has(frage.key)) return;
    gesehen.add(frage.key);
    const wert = antwortText(frage, antworten).trim();
    if (!wert) return;
    const zeile = { label: frage.kurz, wert };
    if (GRUPPE_STARTEN.has(frage.key)) starten.push(zeile);
    else if (GRUPPE_MITBRINGEN.has(frage.key)) mitbringen.push(zeile);
    else klaeren.push(zeile);
  };

  for (const ansicht of ansichtenFuer(antworten)) {
    for (const frage of fragenDerAnsicht(ansicht, antworten)) nimm(frage);
  }
  for (const frage of ALTFRAGEN) nimm(frage);

  return [
    { titel: "So möchte er starten", zeilen: starten },
    { titel: "Das bringt er mit", zeilen: mitbringen },
    { titel: "Das klären wir im Gespräch", zeilen: klaeren },
  ].filter((g) => g.zeilen.length > 0);
}

/** Die zugeschalteten Module aus dem Gesprächsstand, ohne Doppelte. */
export function zusatzModule(e: VideocallErfassung | undefined | null): ModulId[] {
  const roh = Array.isArray(e?.module) ? e.module : [];
  const gueltig = roh.filter((m): m is ModulId => MODULE.some((d) => d.id === m));
  return [...new Set(gueltig)];
}
