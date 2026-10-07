/**
 * Kurzbeschreibung, fünf Standortargumente und die Sanierungen zu einem Objekt.
 *
 * Der Vertriebspartner soll zu jedem Objekt drei Dinge vorfinden: eine
 * Beschreibung des Objekts, genau fünf Argumente für den Standort und, soweit
 * die Daten es hergeben, die zuletzt erledigten Sanierungen. Alles entsteht
 * aus den gepflegten Objektangaben, den Investagon-Daten, der gemessenen
 * Standortanalyse und den hochgeladenen Unterlagen.
 *
 * Seit dem 23.09.2026 (Christian): Jedes sichtbare Objekt bekommt Beschreibung
 * und Standortargumente, nicht nur die mit Unterlagen oder langer
 * Beschreibung. Möglich ist das, weil die Umgebung jetzt vor dem Lauf gemessen
 * wird (`standort-messung.ts`). Mit gemessener Umgebung lassen sich fünf
 * belegte Argumente praktisch immer finden.
 *
 * Seit Fassung 3 (ebenfalls 23.09.2026) entsteht die Beschreibung aus den
 * gesamten Objektunterlagen (Auswahl in `objekt-texte-unterlagen.ts`), und
 * dazu kommen bis zu drei Marktargumente aus der Standortdatenbank der
 * Marktanalyse (`objekt-texte-markt.ts`).
 *
 * Seit Fassung 4 (23.09.2026 abends, Christian) sind die beiden Blöcke klar
 * getrennt: Die Kurzbeschreibung handelt nur vom Objekt, ohne Kennzahlen,
 * und die fünf Standortargumente nur vom Standort, mit Beschäftigung,
 * belegten Arbeitgebern und der gemessenen Umgebung. Ob und ab wo gemessen
 * wurde, steht unter `umgebung` und nicht mehr als Beanstandung am Text.
 *
 * WARUM DIESE DATEI HIER LIEGT
 *
 * Die Edge Function läuft in Deno und kann nichts aus `src/` importieren.
 * Damit Erzeugung und Anzeige nicht auseinanderlaufen, steht die reine Logik
 * hier, genau wie bei `standort-messung.ts` und `pipeline-schwellen.ts`. Der
 * Browser liest sie über `src/lib/objektTexteKi.ts` mit, die Tests liegen in
 * `src/lib/objektTexteKi.test.ts`. Hier darf deshalb nichts stehen, was nur
 * Deno kennt: kein `Deno.env`, kein Dateizugriff, nur reine Rechnung.
 *
 * DIE WICHTIGSTE REGEL
 *
 * Verkaufsfördernd heißt nicht: etwas versprechen. Das Modell bekommt eine
 * feste Liste von Tatsachen und darf nichts behaupten, was nicht darin steht.
 * Zu jedem der fünf Argumente gehört ein Beleg, also die Zeile aus der Liste,
 * auf die es sich stützt. Ohne Beleg ist ein Argument wertlos und wird
 * beanstandet. Dieselbe Lehre steckt schon in `standort-messung.ts`: Dort hat
 * ein Sprachmodell Schulen, Entfernungen und Koordinaten erfunden, und das
 * stand anschließend im Exposé.
 */

import type { Genauigkeit } from "./standort-messung.ts";

/**
 * Fassung des gespeicherten Stands.
 *
 * 2 seit dem 23.09.2026: längere Beschreibung und die Liste der Sanierungen.
 * 3 seit dem 23.09.2026 abends (Christian): Die Beschreibung entsteht aus den
 * gesamten Objektunterlagen und soll zum Investieren einladen, dazu kommen
 * bis zu drei Marktargumente aus der Standortdatenbank der Marktanalyse.
 *
 * 4 seit dem 23.09.2026 spät (Christian): Die Kurzbeschreibung handelt nur
 * vom Objekt und nennt keine Kennzahlen, die Standortargumente handeln nur
 * vom Standort, samt Beschäftigung und belegten Arbeitgebern. Dazu die
 * robuste Messung und der Vermerk `umgebung`.
 *
 * 5 seit dem 01.10.2026 (Christian): Derselbe Lauf liefert zusätzlich die
 * internen Highlights für den Vertrieb (`interneHighlights`), bis zu acht
 * belegte Punkte aus Objektangaben und Unterlagen. Sie sind rein intern und
 * gehen über keine Positivliste hinaus (`expose-oeffentlich.ts`,
 * `kunden-meta.ts`). Das Anheben holt sie für den ganzen Bestand nach.
 *
 * Ein Stand älterer Fassung gilt als nicht vorhanden, damit jedes Objekt einmal
 * neu erzeugt wird. Seinen Wortlaut liest `automatischerWortlaut` trotzdem,
 * sonst ließe sich nicht erkennen, ob ein gepflegtes Feld von Hand stammt.
 * Das Anheben allein genügt: Sammelmodus (`standBrauchtLauf`), Gesamtlauf
 * (`texteBefund`) und der selbsttätige Start (`objektTexteStand`) lesen alle
 * über `objektTexteAusMeta` und halten einen Stand älterer Fassung für offen.
 */
export const OBJEKT_TEXTE_SCHEMA = 5;

/**
 * Fassung der Edge Function `objekt-texte-ki`, sie steht in jeder Antwort.
 *
 * WARUM ES SIE GIBT
 *
 * Gepushter Function-Code läuft erst, wenn er in Lovable ausgerollt ist. Eine
 * ältere Fassung auf dem Server antwortet trotzdem, nur mit einem Stand, den
 * der Browser nicht mehr liest, und jedes Objekt sah dann fehlgeschlagen aus.
 * Fehlt diese Zahl in der Antwort oder ist sie kleiner, weiß der Browser: Die
 * Function ist noch nicht ausgerollt, und er hält an, statt weiterzuzählen.
 */
export const OBJEKT_TEXTE_FUNKTION_VERSION = 5;

/** Genau so viele Standortargumente, nicht mehr und nicht weniger. */
export const ANZAHL_STANDORTARGUMENTE = 5;

/**
 * Höchstens so viele Marktargumente.
 *
 * Christian am 23.09.2026: drei Argumente zum Standort aus Sicht der
 * Marktanalyse, zusätzlich zu den fünf aus der gemessenen Umgebung. Anders als
 * dort sind weniger normal: Für viele Orte gibt es keine erhobenen Kennzahlen,
 * und dann entsteht lieber keines als ein erfundenes.
 */
export const ANZAHL_MARKTARGUMENTE = 3;

/**
 * Höchstlänge der Kurzbeschreibung, von Christian festgelegt.
 *
 * Bis zum 23.09.2026 waren es 500 Zeichen, damit Beschreibung und Argumente
 * nebeneinander gleich groß wirkten. Das reichte für ein Objekt mit Sanierung,
 * Ausstattung und Lage nicht. Seither 1000 Zeichen, etwa fünf bis acht Sätze,
 * und die beiden Blöcke stehen untereinander.
 */
export const MAX_KURZBESCHREIBUNG = 1000;

/** Höchstlänge eines einzelnen Standortarguments. */
export const MAX_ARGUMENT = 160;

/** Höchstens so viele Sanierungen, die neuesten zuerst. */
export const MAX_SANIERUNGEN = 6;

/** Höchstlänge einer Maßnahme. Eine Zeile in den Objektdetails, kein Absatz. */
export const MAX_MASSNAHME = 120;

/** Höchstens so viele interne Highlights liefert die KI. Die festen Werte aus den Objektdaten kommen in der Anzeige dazu. */
export const MAX_INTERNE_HIGHLIGHTS = 8;

/** Höchstlänge eines Highlights: eine Zeile, kein Absatz. */
export const MAX_HIGHLIGHT = 140;

/** Unter diesem Schlüssel liegt das Ergebnis im `meta` der Objektzeile. */
export const OBJEKT_TEXTE_META_SCHLUESSEL = "objekttexteKi";

/*
 * Den Satz „Automatisch erstellt aus Objektangaben und Unterlagen.“ gibt es
 * seit dem 24.09.2026 nicht mehr: Christian will automatisch entstandene
 * Texte weder auf der Seite noch im Exposé oder PDF gekennzeichnet sehen.
 */

/** Ein Standortargument mit der Tatsache, auf die es sich stützt. */
export interface StandortArgument {
  /** Der Satz, der später im Exposé steht. */
  argument: string;
  /** Die Zeile aus der Quellenliste, die ihn trägt. */
  beleg: string;
}

/**
 * Eine Sanierung oder zuletzt erledigte Maßnahme.
 *
 * DIESE FORM IST EIN VERTRAG. Die Objektdetails lesen genau dieses Feld unter
 * `meta.objekttexteKi.sanierungen`. Nicht umbenennen, nicht umbauen.
 */
export interface SanierungsEintrag {
  /** Vierstellige Jahreszahl, nur wenn sie in den Tatsachen steht, sonst "". */
  jahr: string;
  /** Kurz, etwa „Dach und Fassade renoviert“. Ohne Beträge. */
  massnahme: string;
  /** Die Zeile aus der Quellenliste, auf die sich der Eintrag stützt. */
  beleg: string;
}

/**
 * Ein internes Highlight für die Vorbereitung des Vertriebs (seit Fassung 5).
 *
 * NUR INTERN. Es steht unter `meta.objekttexteKi.interneHighlights`, und die
 * Positivlisten für Exposé und Kundenansicht lassen aus `objekttexteKi` nur
 * die Sanierungen hinaus. `art` sagt, ob der Punkt Erhaltungsaufwand oder
 * Restnutzungsdauer betrifft; die Karte zieht diese beiden nach oben.
 */
export interface InternesHighlight {
  punkt: string;
  /** Die Zeile aus der Quellenliste oder Name und Zitat der Unterlage. Ohne Beleg kein Highlight. */
  beleg: string;
  art: HighlightArt;
}

export type HighlightArt = "erhaltungsaufwand" | "restnutzungsdauer" | "sonstiges";

/**
 * Der letzte gescheiterte Lauf an einem Objekt.
 *
 * Liegt unter `meta.objekttexteKi.letzterFehler`, neben einem vorhandenen
 * Stand oder allein. Er ersetzt keinen Text. Grund: Am 23.09.2026 stand an
 * keinem einzigen Objekt etwas, und niemand konnte sehen, warum. Jetzt steht
 * der Grund in der Datenbank, auch wenn die Oberfläche ihn nicht zeigt. Ein
 * gelungener Lauf schreibt den Stand neu und nimmt den Vermerk damit weg.
 */
export interface LetzterFehler {
  /** Zeitpunkt, ISO. */
  zeitpunkt: string;
  /** Der Grund im Klartext, gekürzt. */
  grund: string;
  /** Der Status, mit dem die Function geantwortet hat. */
  status?: number;
  /** Die Fassung der Function, die den Fehler hatte. */
  version: number;
}

/**
 * Ob und ab wo die Umgebung für diesen Stand gemessen wurde.
 *
 * WARUM ES DAS GIBT
 *
 * Bis Fassung 3 stand eine gescheiterte Messung als Beanstandung am Text, und
 * die Karte zeigte sie allen als gelben Kasten „Bitte ansehen“, auch dem
 * Vertrieb. Christian am 23.09.2026: kein Warnkasten für Vertrieb oder Kunden.
 * Der Grund steht jetzt hier, und nur Admin und Inhaber sehen ihn als
 * unaufdringlichen Vermerk an der Karte (`ObjektTexteKarte`).
 */
export interface UmgebungStand {
  /** Ging eine gemessene Umgebung in die Texte ein? */
  gemessen: boolean;
  /** Ab wo gemessen wurde, siehe `Genauigkeit` in `standort-messung.ts`. */
  genauigkeit?: Genauigkeit;
  /** Zeitpunkt der verwendeten Messung, ISO. */
  gemessenAm?: string;
  /** Nur ohne Messung: warum nicht. */
  grund?: string;
  /** Nur ohne Messung: „dienst“ heißt, ein neuer Versuch lohnt sich, „adresse“ heißt, die Adresse prüfen. */
  art?: "adresse" | "dienst";
}

/** Das gespeicherte Ergebnis eines Laufs. */
export interface ObjektTexte {
  schema: number;
  kurzbeschreibung: string;
  standortargumente: StandortArgument[];
  /**
   * Bis zu drei Argumente aus der Marktanalyse, je mit Beleg. Leer, wenn es
   * für den Ort keine erhobenen Kennzahlen gibt. Fehlt in Ständen vor
   * Fassung 3, deshalb optional; `objektTexteAusMeta` setzt immer eine Liste.
   */
  marktargumente?: StandortArgument[];
  /** Sanierungen, die neueste zuerst. Leer, wenn die Daten nichts hergeben. */
  sanierungen: SanierungsEintrag[];
  /** Zeitpunkt der Erzeugung, ISO. */
  erzeugtAm: string;
  /** Welches Modell den Text geschrieben hat. */
  modell: string;
  /** Fingerabdruck der Tatsachen, aus denen der Text entstand. */
  quellenStand: string;
  /** Dieselben Tatsachen im Klartext, damit der Nutzer sie nachlesen kann. */
  quellen: string[];
  /** Was bei der Prüfung aufgefallen ist. Leer heißt: nichts aufgefallen. */
  beanstandungen: string[];
  /**
   * Gesetzt, wenn ein Lauf bewusst nichts erzeugt hat, samt Grund.
   *
   * WARUM DAS GESPEICHERT WIRD
   *
   * Der Lauf startet von selbst, sobald ein Objekt noch keinen Text hat. Ohne
   * diesen Vermerk würde er bei jedem Seitenaufruf erneut anlaufen, an jedem
   * Objekt, dem die Grundlage fehlt. Ein Vermerk kostet nichts, ein Lauf ins
   * Leere kostet jedes Mal.
   */
  ohneErgebnis?: string;
  /** Nur gesetzt, wenn ein späterer Lauf gescheitert ist. Siehe `LetzterFehler`. */
  letzterFehler?: LetzterFehler;
  /** Ob und ab wo die Umgebung gemessen wurde. Fehlt in Ständen vor Fassung 4. */
  umgebung?: UmgebungStand;
  /** Interne Highlights für den Vertrieb, nie für Kunden. Seit Fassung 5. */
  interneHighlights?: InternesHighlight[];
}

/** Die Tatsachen, aus denen die Texte entstehen, nach Herkunft getrennt. */
export interface ObjektTexteQuellen {
  /** Gepflegte Angaben am Objekt. */
  objekt: string[];
  /** Gemessene Standortangaben aus der Standortanalyse. */
  standort: string[];
  /**
   * Erhobene Kennzahlen aus der Standortdatenbank der Marktanalyse, siehe
   * `objekt-texte-markt.ts`. Optional, damit ältere Aufrufer nicht brechen.
   */
  markt?: string[];
  /** Dateinamen der Unterlagen, die dem Modell mitgegeben werden. */
  unterlagen: string[];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const zahl = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
const alsObjekt = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Eine plausible Jahreszahl als Text, sonst "". Ohne Spanne würde aus 0 ein "Jahr 0". */
function jahrText(v: unknown): string {
  const roh = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!/^\d{4}$/.test(roh)) return "";
  const n = Number(roh);
  return n >= 1850 && n <= 2100 ? roh : "";
}

/**
 * Sätze, die über Ertrag, Steuer oder Preis sprechen.
 *
 * Was im Auftrag steht, landet früher oder später im Text. Die Freitexte der
 * Bauträger sind Werbetexte und handeln oft genau davon ("Mieteinnahmen
 * gesichert", "erhöhte Abschreibung nach § 7h"). Solche Sätze gehen gar nicht
 * erst an das Modell, dann muss die Versprechen-Prüfung sie auch nicht
 * hinterher finden. Der Rest des Absatzes, meist die Lage und das Gebäude,
 * bleibt stehen.
 */
const ERTRAGSSATZ =
  /steuer|\bafa\b|abschreib|restnutzungsdauer|rendite|erhaltungsaufwand|mietgarantie|mieteinnahm|mietsteiger|mietpreis|mietniveau|wertsteiger|wertzuwachs|wertentwicklung|gewinn|garantiert|kaufpreis|kaufnebenkosten|provision|finanzier|eigenkapital|zinsen|€|\beuro\b/i;

/** Einen Freitext ohne die Sätze über Ertrag, Steuer und Preis, in einer Zeile. */
export function ohneErtragsaussagen(roh: unknown): string {
  return text(roh)
    .split(/\n+/)
    .map((absatz) =>
      absatz
        .split(/(?<=[.!?])\s+/)
        .filter((satz) => satz.trim() && !ERTRAGSSATZ.test(satz))
        .join(" "),
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merkmale, die nicht als Tatsache an das Modell gehen.
 *
 * Die Merkmalsliste von Investagon mischt Gebäude und Steuermodell:
 * "Einbauküche: inklusive" neben "Gebäude-AfA: 3.7 % p.a." und "24 Monate
 * Mietgarantie". Steuer, Abschreibung, Erhaltungsaufwand, Gebäudeanteil,
 * Mietgarantie, Miete, Rendite und Preise bleiben draußen. Stünden sie im
 * Auftrag, schriebe das Modell darüber, und genau das darf der Text nicht.
 * Die Produktklasse gehört dazu, weil sie das Steuermodell bezeichnet.
 */
const HEIKLES_MERKMAL =
  /steuer|\bafa\b|abschreib|erhaltungsaufwand|geb(ä|ae)udeanteil|grundst(ü|ue)cksanteil|miet|rendite|ertrag|gewinn|garantie|restnutzungsdauer|preis|kosten|€|\beuro\b|provision|zins|finanz|f(ö|oe)rder|kfw|wertsteiger|wertzuwachs|wertentwicklung|produktklasse|p\.\s?a\./i;

/** Die führende Nummer eines Merkmals, etwa "5. ". Wie in `src/lib/investagonFelder.ts`. */
const MERKMAL_NUMMER = /^\s*(\d{1,3})\s*[.)]\s+/;

/**
 * Die neutralen Merkmale aus `meta.investagonRaw.tags`, in Investagons Folge.
 *
 * Eigene kleine Auslegung statt `merkmale` aus `src/lib/investagonFelder.ts`:
 * Die Edge Function kann nichts aus `src/` importieren. Die Form ist dieselbe,
 * "5. Energieeffizienzklasse: C", die Nummer legt nur die Reihenfolge fest.
 */
export function neutraleMerkmale(investagonRaw: unknown): string[] {
  const roh = alsObjekt(investagonRaw);
  const tags = Array.isArray(roh.tags) ? roh.tags : [];
  return tags
    .map((t, i) => {
      const eintrag = text(t);
      const treffer = MERKMAL_NUMMER.exec(eintrag);
      return {
        nummer: treffer ? Number(treffer[1]) : Number.MAX_SAFE_INTEGER,
        platz: i,
        wert: (treffer ? eintrag.slice(treffer[0].length) : eintrag).trim(),
      };
    })
    .filter((m) => m.wert && !HEIKLES_MERKMAL.test(m.wert))
    .sort((a, b) => a.nummer - b.nummer || a.platz - b.platz)
    .map((m) => m.wert.slice(0, 160))
    .slice(0, 12);
}

/**
 * Die Freitexte aus `meta.investagonRaw.extras`, sortiert nach `weight`.
 *
 * `weight` ist schlicht die Sortiernummer des Absatzes. Einträge ohne
 * brauchbares `weight` kommen ans Ende. Manche Datensätze führen die Extras
 * als einfache Textliste, auch das wird gelesen. Sätze über Ertrag und Steuer
 * fallen heraus, siehe `ohneErtragsaussagen`.
 */
export function investagonFreitexte(investagonRaw: unknown): string[] {
  const roh = alsObjekt(investagonRaw);
  const extras = Array.isArray(roh.extras) ? roh.extras : [];
  return extras
    .map((eintrag, i) => {
      if (typeof eintrag === "string") return { wert: eintrag, gewicht: Number.MAX_SAFE_INTEGER, platz: i };
      const e = alsObjekt(eintrag);
      const gewicht = Number(e.weight);
      return {
        wert: e.value,
        gewicht: e.weight !== null && e.weight !== "" && Number.isFinite(gewicht) ? gewicht : Number.MAX_SAFE_INTEGER,
        platz: i,
      };
    })
    .sort((a, b) => a.gewicht - b.gewicht || a.platz - b.platz)
    .map((e) => ohneErtragsaussagen(e.wert))
    .filter(Boolean);
}

/**
 * Die Sanierungsjahre der Einheiten, zusammengefasst je Jahr, neuestes zuerst.
 *
 * Gelesen wird, was der Import ablegt: `sanierungsjahr` (aus `mapping.ts`)
 * und ersatzweise `investagonRaw.object_renovation_year`. Die Function fragt
 * genau diese beiden Pfade ab und nicht das ganze `meta` jeder Wohnung; für
 * Aufrufer mit vollem `meta` liest diese Funktion auch dort nach.
 */
export function sanierungsjahreDerEinheiten(
  wohnungen: Array<Record<string, unknown>>,
): Array<{ jahr: string; anzahl: number }> {
  const zaehler = new Map<string, number>();
  for (const w of wohnungen || []) {
    const meta = alsObjekt(w?.meta);
    const jahr = [
      w?.sanierungsjahr,
      meta.sanierungsjahr,
      w?.renovierungsjahr,
      alsObjekt(meta.investagonRaw).object_renovation_year,
    ]
      .map(jahrText)
      .find(Boolean);
    if (jahr) zaehler.set(jahr, (zaehler.get(jahr) || 0) + 1);
  }
  return [...zaehler.entries()]
    .map(([jahr, anzahl]) => ({ jahr, anzahl }))
    .sort((a, b) => b.jahr.localeCompare(a.jahr));
}

/**
 * Wörter, die ein Versprechen ankündigen.
 *
 * Sie werden nicht stillschweigend entfernt. Ein Text, den jemand nie gesehen
 * hat, still zu kürzen, wäre schlimmer als ihn zu melden: Der Nutzer würde
 * glauben, er habe das Ganze geprüft. Stattdessen landet der Fund in
 * `beanstandungen`, und die Karte zeigt ihn über dem Text an.
 */
const VERSPRECHEN: Array<{ muster: RegExp; grund: string; belegteVergangenheit?: boolean }> = [
  { muster: /\brendite\w*/i, grund: "nennt eine Rendite" },
  { muster: /\bwertsteigerung\w*/i, grund: "verspricht Wertsteigerung", belegteVergangenheit: true },
  { muster: /\bwertzuwachs\w*/i, grund: "verspricht Wertzuwachs", belegteVergangenheit: true },
  { muster: /\bsteuervorteil\w*/i, grund: "verspricht einen Steuervorteil" },
  { muster: /\bsteuerlich\w* vorteil\w*/i, grund: "verspricht einen Steuervorteil" },
  { muster: /\bgarantiert\w*/i, grund: "sagt etwas zu" },
  { muster: /\bsicher(e|es|er|en)? (rendite|ertrag|einnahme)/i, grund: "sagt Erträge zu" },
  { muster: /\brisikolos\w*/i, grund: "spielt das Risiko herunter" },
  { muster: /\bkrisensicher\w*/i, grund: "spielt das Risiko herunter" },
  { muster: /\bwertstabil\w*/i, grund: "spielt das Risiko herunter" },
  { muster: /\bmieteinnahm\w*/i, grund: "sagt Mieteinnahmen zu" },
  { muster: /\bmietsteigerung\w*/i, grund: "verspricht steigende Mieten", belegteVergangenheit: true },
  { muster: /\bgewinn\w*/i, grund: "verspricht Gewinn" },
  { muster: /\babschreib\w*/i, grund: "berührt die Steuer" },
  { muster: /\bafa\b/i, grund: "berührt die Steuer" },
  // Seit den Marktargumenten: Vorhersagen sind Zusagen in anderem Kleid.
  { muster: /\b(wird|werden|dürfte|dürften)\s+(\w+\s+){0,2}(steigen|wachsen|zulegen|zunehmen)\b/i, grund: "sagt eine Entwicklung voraus" },
  { muster: /\bprognos\w*/i, grund: "stützt sich auf eine Vorhersage" },
];

/** Nennt der Satz eine Quelle oder einen Stand? */
const QUELLENANGABE =
  /\b(stand|laut|quelle|destatis|statistisches|bundesagentur|boris|bbsr|gutachterausschuss|openstreetmap|zensus)\b/i;
/** Ein Zeitbezug in der Vergangenheit: eine Jahreszahl, „seit“, „in den letzten“. */
const ZEITBEZUG = /\b(1[89]\d{2}|20\d{2})\b|\bseit\b|\bin den (letzten|vergangenen)\b|\bzwischen\b/i;
/** Wörter, die aus einer Angabe eine Zusage oder Vorhersage machen. */
const ZUKUNFT =
  /\b(wird|werden|würde|würden|dürfte|dürften|künftig\w*|zukünftig\w*|erwart\w*|voraussichtlich|verspr\w*|garantiert\w*|sicher\w*|bald)\b/i;

/**
 * Ist dieser Satz eine belegte Angabe über Vergangenheit oder Gegenwart?
 *
 * Ein Marktargument darf sagen, was war: „Die Mietsteigerung lag seit 2019 bei
 * 12 Prozent, BBSR, Stand 2024.“ Das ist eine erhobene Tatsache mit Quelle,
 * keine Zusage. Gemeldet würde es trotzdem, weil „Mietsteigerung“ sonst ein
 * Versprechen ankündigt. Deshalb gilt ein Satz als belegte Vergangenheit, wenn
 * er eine Quelle oder einen Stand nennt, einen Zeitbezug hat und kein Wort der
 * Zukunft oder Zusage enthält. Eine Jahreszahl nach `jahr` zählt als Zukunft.
 */
export function istBelegteVergangenheit(satz: string, jahr = new Date().getFullYear()): boolean {
  if (!QUELLENANGABE.test(satz) || !ZEITBEZUG.test(satz) || ZUKUNFT.test(satz)) return false;
  const jahre = satz.match(/\b(1[89]\d{2}|20\d{2})\b/g) || [];
  return jahre.every((j) => Number(j) <= jahr);
}

/**
 * Die Fundstellen eines Textes, jede höchstens einmal.
 *
 * Geprüft wird Satz für Satz, damit die Ausnahme für belegte
 * Vergangenheitsangaben nur den Satz trifft, der die Quelle trägt. Harte
 * Zusagen wie Rendite, Steuervorteil oder „garantiert“ fallen nie darunter.
 */
function versprechenIn(text: string, wo: string): string[] {
  const treffer = new Set<string>();
  const saetze = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  for (const satz of saetze.length > 0 ? saetze : [text]) {
    const belegt = istBelegteVergangenheit(satz);
    for (const v of VERSPRECHEN) {
      const fund = satz.match(v.muster);
      if (!fund) continue;
      if (v.belegteVergangenheit && belegt) continue;
      treffer.add(`${wo}: „${fund[0]}“ ${v.grund}. Bitte prüfen.`);
    }
  }
  return [...treffer];
}

/**
 * Die Objektangaben als Tatsachenliste.
 *
 * Bewusst OHNE Kaufpreis, Miete und Rendite. Sie stehen im CRM und wären
 * verfügbar, aber sobald sie im Auftrag stehen, schreibt jedes Modell über
 * Erträge, und genau das darf der Text nicht. Die Zahlen zeigt der
 * Investmentrechner, dort gehören sie hin.
 *
 * Seit dem 23.09.2026 kommen die Investagon-Daten dazu: die Freitexte des
 * Bauträgers, die neutralen Merkmale und die Sanierungsjahre der Einheiten.
 * Aus ihnen entstehen vor allem die Sanierungen. `wohnungen` braucht dafür
 * `sanierungsjahr` beziehungsweise `renovierungsjahr`, siehe
 * `sanierungsjahreDerEinheiten`.
 */
export function objektQuellen(
  row: Record<string, unknown> | null | undefined,
  wohnungen: Array<Record<string, unknown>> = [],
): string[] {
  const r = row || {};
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
  const zeilen: string[] = [];
  const nimm = (beschriftung: string, wert: string | number | undefined) => {
    if (wert === undefined || wert === "") return;
    zeilen.push(`${beschriftung}: ${wert}`);
  };

  nimm("Titel", text(r.titel));
  const ortszeile = [text(r.adresse), [text(r.plz), text(r.ort)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  nimm("Adresse", ortszeile);
  nimm("Stadtteil", text(meta.stadtteil));
  nimm("Objektart", text(meta.objektart));
  nimm("Baujahr", zahl(r.global_baujahr));
  nimm("Zustand", text(r.global_zustand));
  nimm("Wohnfläche gesamt in m²", zahl(r.global_gesamt_qm));
  nimm("Grundstück in m²", zahl(r.global_grundstueck_qm));
  nimm("Etagen", zahl(r.global_etagen));
  nimm("Stellplätze", zahl(r.global_stellplaetze));
  nimm("Energieeffizienzklasse", text(r.global_energieeffizienzklasse));

  const ea = (meta.energieausweis && typeof meta.energieausweis === "object" ? meta.energieausweis : {}) as Record<string, unknown>;
  nimm("Energieausweis, Art", text(ea.art));
  nimm("Energieausweis, Kennwert in kWh je m² und Jahr", zahl(ea.kennwert));
  nimm("Energieträger", text(ea.energietraeger));

  if (r.global_objekt === true) {
    zeilen.push("Verkaufsart: Das Haus wird als Ganzes verkauft, nicht in einzelnen Einheiten.");
  }
  /*
   * Die Zahl der Einheiten nur, wenn sie am Objekt gepflegt ist
   * (`meta.einheitenImHaus`, seit 24.09.2026). Die Zahl der Zeilen in
   * `wohnungen` ist die der im CRM angelegten Einheiten und nicht die des
   * Hauses; bei Espanstraße 5 stand dadurch eine dritte Zahl im Text.
   */
  const einheitenGepflegt = zahl(meta.einheitenImHaus);
  if (einheitenGepflegt !== undefined && Number.isInteger(einheitenGepflegt) && einheitenGepflegt > 0) {
    nimm("Einheiten im Objekt", einheitenGepflegt);
  }
  if (wohnungen.length > 0) {
    const groessen = wohnungen.map((w) => zahl(w.groesse)).filter((g): g is number => g !== undefined);
    if (groessen.length > 0) {
      const von = Math.min(...groessen);
      const bis = Math.max(...groessen);
      nimm("Wohnungsgrößen in m²", von === bis ? `${von}` : `${von} bis ${bis}`);
    }
    /*
     * Die Vermietungssituation, Christians Wunsch für die Kurzbeschreibung.
     *
     * Nur die vermieteten zählen. Der Import setzt `vermietet` auf falsch,
     * sobald Investagon keinen Mietstatus liefert; „0 von 12 vermietet“ wäre
     * dann eine falsche Aussage und keine fehlende.
     */
    const vermietet = wohnungen.filter((w) => w.vermietet === true).length;
    if (vermietet > 0) {
      zeilen.push(
        `Vermietet laut Einheitendaten: ${vermietet} von ${wohnungen.length} ${wohnungen.length === 1 ? "Einheit" : "Einheiten"}`,
      );
    }
  }

  const sanierungen = Array.isArray(meta.sanierungen) ? meta.sanierungen : [];
  for (const s of sanierungen) {
    const e = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const jahr = text(e.jahr) || (zahl(e.jahr) !== undefined ? String(zahl(e.jahr)) : "");
    const massnahme = text(e.massnahme);
    if (!jahr && !massnahme) continue;
    zeilen.push(`Sanierung: ${[jahr, massnahme].filter(Boolean).join(", ")}`);
  }

  /*
   * Sanierungsjahre aus den Investagon-Daten.
   *
   * Je Einheit, weil Investagon sie dort führt, und zusammengefasst je Jahr.
   * Das Jahr am Objekt stammt in Wahrheit aus der ersten Einheit (der Import
   * mischt deren Datensatz unter die Projektdaten) und zählt deshalb nur, wenn
   * die Einheiten selbst keines liefern.
   *
   * Ein Jahr bis einschließlich Baujahr fällt heraus. Investagon trägt bei
   * manchen Häusern das Baujahr auch als Sanierungsjahr ein, und daraus würde
   * sonst „saniert 1971“ bei Baujahr 1971. Dieselbe Regel gilt in der Anzeige
   * der Objektdetails (`src/lib/objektdetailsAnzeige.ts`).
   */
  const investagonRaw = alsObjekt(meta.investagonRaw);
  const baujahr = Number(zahl(r.global_baujahr) ?? jahrText(investagonRaw.object_building_year)) || 0;
  const nachBaujahr = (jahr: string) => !!jahr && Number(jahr) > baujahr;
  const einheitenJahre = sanierungsjahreDerEinheiten(wohnungen).filter((e) => nachBaujahr(e.jahr));
  for (const { jahr, anzahl } of einheitenJahre) {
    zeilen.push(
      `Sanierungsjahr laut Einheitendaten: ${jahr}, bei ${anzahl} von ${wohnungen.length} ${
        wohnungen.length === 1 ? "Einheit" : "Einheiten"
      }`,
    );
  }
  const objektJahr = jahrText(investagonRaw.object_renovation_year);
  if (einheitenJahre.length === 0 && nachBaujahr(objektJahr)) {
    nimm("Sanierungsjahr laut Investagon", objektJahr);
  }

  nimm("Gemeinschaftseigentum", text(meta.gemeinschaftseigentum));
  nimm("Verwaltung", text(meta.verwaltung));

  const highlights = Array.isArray(r.highlights) ? r.highlights : [];
  for (const h of highlights) {
    const wert = text(h);
    if (wert) zeilen.push(`Gepflegtes Merkmal: ${wert}`);
  }
  for (const merkmal of neutraleMerkmale(investagonRaw)) {
    zeilen.push(`Merkmal laut Investagon: ${merkmal}`);
  }

  const beschreibung = ohneErtragsaussagen(r.beschreibung).slice(0, 1200);
  if (beschreibung) zeilen.push(`Vorhandene Objektbeschreibung: ${beschreibung}`);

  // Höchstens vier Absätze zu je 700 Zeichen. Mehr hilft dem Modell nicht und
  // bläht den Auftrag auf. Was wortgleich schon in der Beschreibung steht,
  // kommt nicht ein zweites Mal.
  for (const freitext of investagonFreitexte(investagonRaw).slice(0, 4)) {
    if (beschreibung.includes(freitext)) continue;
    zeilen.push(`Beschreibung laut Investagon: ${freitext.slice(0, 700)}`);
  }

  return zeilen;
}

/** Die Kategorien der gemessenen Umgebung, in der Reihenfolge der Tatsachenliste. */
const UMGEBUNG_KATEGORIEN: Array<[string, string]> = [
  ["gewerbe", "Gewerbe- und Industrieflächen, Arbeitsorte"],
  ["kliniken", "Kliniken"],
  ["hochschulen", "Hochschulen"],
  ["oepnv", "ÖPNV"],
  ["einkaufen", "Einkaufen"],
  ["kindergaerten", "Kindergärten"],
  ["schulen", "Schulen"],
  ["apotheken", "Apotheken"],
  ["aerzte", "Ärzte und Gesundheit"],
  ["freizeit", "Freizeit und Erholung"],
  // Seit der Messfassung 3 stehen Parks in einer eigenen Liste, vorher unter Freizeit.
  ["parks", "Parks und Grünflächen"],
];

/** Eine Entfernung als Text: „280 m“, „1,8 km“, bei ungefährer Messung „rund 300 m“. */
function entfernungText(meter: number, ungefaehr: boolean): string {
  if (meter >= 1000) {
    const km = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Math.round(meter / 100) / 10);
    return `${ungefaehr ? "rund " : ""}${km} km`;
  }
  return ungefaehr ? `rund ${Math.max(50, Math.round(meter / 50) * 50)} m` : `${meter} m`;
}

/**
 * Die gemessene Standortanalyse als Tatsachenliste.
 *
 * Nur die gemessene Fassung (`schema: 2`) kommt hier durch. Die alte war
 * vollständig erfunden, sie hätte den Standortargumenten erfundene Schulen
 * und Entfernungen untergeschoben.
 *
 * Die Arbeitgeberliste bleibt ausdrücklich draußen. Sie ist laut
 * `HERKUNFT_HINWEIS_ARBEITGEBER` modelliert und nicht erhoben. Als Beleg für
 * ein Verkaufsargument taugt sie damit nicht. Arbeitsorte kommen stattdessen
 * aus der Messung selbst: Kliniken, Hochschulen sowie Gewerbe- und
 * Industriegebiete, die OpenStreetMap mit Namen kennt.
 *
 * Seit Fassung 4 sagt die erste Zeile, ab wo gemessen wurde
 * (`genauigkeit`). Ab Postleitzahlgebiet oder Ortsmitte stehen keine
 * Entfernungen in der Liste: Sie wären Entfernungen ab einem Punkt, an dem das
 * Haus nicht steht, und das Modell schriebe sie als „in 300 m“ in den Text.
 */
export function standortQuellen(analyse: unknown): string[] {
  if (!analyse || typeof analyse !== "object" || (analyse as { schema?: unknown }).schema !== 2) return [];
  const a = analyse as Record<string, unknown>;

  const zeilen: string[] = [];
  const genauigkeit = typeof a.genauigkeit === "string" ? a.genauigkeit : "";
  const lage = alsObjekt(a.lage);
  const ohneEntfernung = genauigkeit === "plz" || genauigkeit === "ort";
  const ungefaehr = genauigkeit === "strasse";

  if (genauigkeit === "adresse") {
    zeilen.push("Umgebung gemessen ab der Hausadresse, Entfernungen als Luftlinie (OpenStreetMap)");
  } else if (genauigkeit === "strasse") {
    zeilen.push(
      "Umgebung gemessen ab der Straße, die Hausnummer ist in OpenStreetMap nicht erfasst. Entfernungen deshalb nur ungefähr, als Luftlinie (OpenStreetMap)",
    );
  } else if (genauigkeit === "plz") {
    zeilen.push(
      `Umgebung gemessen ab dem Mittelpunkt des Postleitzahlgebiets${text(lage.plz) ? ` ${text(lage.plz)}` : ""}, nicht ab der Hausadresse. Entfernungen zum Haus sind deshalb nicht bekannt (OpenStreetMap)`,
    );
  } else if (genauigkeit === "ort") {
    zeilen.push(
      `Umgebung gemessen ab der Ortsmitte${text(lage.ort) ? ` von ${text(lage.ort)}` : ""}, nicht ab der Hausadresse. Entfernungen zum Haus sind deshalb nicht bekannt (OpenStreetMap)`,
    );
  }
  if (text(lage.stadtteil) && !ohneEntfernung) zeilen.push(`Stadtteil laut OpenStreetMap: ${text(lage.stadtteil)}`);

  const erweitert = new Set(Array.isArray(a.erweiterter_umkreis) ? a.erweiterter_umkreis : []);
  const mikro = alsObjekt(a.mikrolage);
  for (const [schluessel, beschriftung] of UMGEBUNG_KATEGORIEN) {
    const liste = (Array.isArray(mikro[schluessel]) ? mikro[schluessel] as unknown[] : []).map(alsObjekt);
    // Höchstens drei je Kategorie, die nächstgelegenen zuerst. Mehr hilft dem
    // Modell nicht und bläht den Auftrag auf. Bei den Arbeitsorten fünf: Die
    // nächste benannte Fläche ist oft ein kleiner Betrieb, die Werft oder das
    // Werk liegt dahinter.
    const naechste = liste
      .filter((o) => !!text(o.name))
      .sort((x, y) => (Number(x.entfernung_m) || 0) - (Number(y.entfernung_m) || 0))
      .slice(0, schluessel === "gewerbe" ? 5 : 3)
      .map((o) => {
        const typ = text(o.typ);
        const meter = zahl(o.entfernung_m);
        const weite = meter !== undefined && !ohneEntfernung ? `${entfernungText(meter, ungefaehr)} Luftlinie` : "";
        const anhang = [typ, weite].filter(Boolean).join(", ");
        return anhang ? `${text(o.name)} (${anhang})` : text(o.name);
      });
    if (naechste.length === 0) continue;
    const wo = ohneEntfernung
      ? genauigkeit === "plz" ? "im Postleitzahlgebiet" : "im Ort"
      : erweitert.has(schluessel) ? "im weiteren Umkreis" : "in der Nähe";
    zeilen.push(`${beschriftung} ${wo}: ${naechste.join("; ")}`);
  }

  const makro = alsObjekt(a.makrolage);
  const einwohner = zahl(makro.einwohner);
  if (einwohner !== undefined) {
    const stand = text(makro.einwohner_stand);
    zeilen.push(`Einwohner der Gemeinde: ${einwohner}${stand ? ` (Stand ${stand})` : ""}`);
  }
  const quote = zahl(makro.arbeitslosenquote);
  if (quote !== undefined) zeilen.push(`Arbeitslosenquote: ${quote} Prozent`);
  const beschreibung = text(makro.beschreibung);
  if (beschreibung) zeilen.push(`Zur Region: ${beschreibung}`);

  return zeilen;
}

/** Alle Tatsachen als eine durchgehende Liste, so wie sie gespeichert wird. */
export function quellenZeilen(q: ObjektTexteQuellen): string[] {
  return [
    ...q.objekt,
    ...q.standort,
    ...(q.markt ?? []),
    ...q.unterlagen.map((name) => `Mitgelesene Unterlage: ${name}`),
  ];
}

/**
 * Ein kurzer Fingerabdruck der Tatsachen.
 *
 * Damit lässt sich später sagen, ob ein gespeicherter Text noch auf dem Stand
 * ist, aus dem er entstand, ohne die ganze Liste zu vergleichen. Die Rechnung
 * ist absichtlich schlicht, sie soll nur Änderungen bemerken und nichts
 * absichern.
 */
export function quellenFingerabdruck(q: ObjektTexteQuellen): string {
  const roh = quellenZeilen(q).join("\n");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < roh.length; i++) {
    const c = roh.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/**
 * Reicht die Grundlage für einen Text?
 *
 * Seit dem 23.09.2026 genügen Objektangaben. Vorher verlangte der Lauf
 * zusätzlich eine gemessene Standortanalyse, Unterlagen oder eine lange
 * Beschreibung, und bei den meisten Objekten aus Investagon lag davon nichts
 * vor. Jetzt misst die Function die Umgebung vor dem Lauf selbst.
 *
 * Die Belegpflicht bleibt davon unberührt. Gelingt die Messung nicht, etwa
 * weil die Adresse nicht zu finden ist, entsteht die Beschreibung trotzdem,
 * und das Modell liefert nur so viele Argumente, wie es belegen kann. Die
 * fehlenden stehen dann als Beanstandung an der Karte. Erfunden wird nichts.
 */
export function genugQuellen(q: ObjektTexteQuellen): { ok: boolean; grund: string } {
  if (q.objekt.length === 0) {
    return { ok: false, grund: "Zu diesem Objekt sind keine Angaben gepflegt. Bitte zuerst Objektangaben ergänzen." };
  }
  return { ok: true, grund: "" };
}

/** Ein Argument mit Beleg, für Standort- und Marktargumente dieselbe Form. */
const ARGUMENT_MIT_BELEG = (beispiel: string) => ({
  type: "object",
  properties: {
    argument: {
      type: "string",
      description:
        `Ein kurzer, aktivierender Anlauf, dann die Tatsache mit Zahl. Beispiel: „${beispiel}“ 70 bis ${MAX_ARGUMENT} Zeichen. Alle ungefähr gleich lang, nicht einer lang und die anderen kurz.`,
    },
    beleg: {
      type: "string",
      description:
        "Die Zeile aus der Tatsachenliste, auf die sich das Argument stützt, wörtlich übernommen. Stammt die Tatsache aus einer Unterlage: deren Name und ein kurzes wörtliches Zitat daraus.",
    },
  },
  required: ["argument", "beleg"],
});

/** Das Werkzeug, über das das Modell antwortet. Freitext ist nicht vorgesehen. */
export const OBJEKT_TEXTE_WERKZEUG = {
  type: "function",
  function: {
    name: "objekt_texte",
    description:
      "Kurzbeschreibung, genau fünf belegte Standortargumente, bis zu drei belegte Marktargumente, die belegten Sanierungen und die belegten internen Highlights zurückgeben",
    parameters: {
      type: "object",
      properties: {
        kurzbeschreibung: {
          type: "string",
          description:
            `Drei bis sechs Sätze nur über das Objekt und seine Einheiten, höchstens ${MAX_KURZBESCHREIBUNG} Zeichen, gern weniger. Objektart, Zustand, Sanierung, Ausstattung, Vermietungssituation und warum sich ein Kauf dieser Einheit in diesem Haus lohnt, soweit es in Tatsachen oder Unterlagen steht. Keine Kennzahlen: kein Kaufpreis, keine Miete, keine Wohnfläche oder Quadratmeter, keine Zimmerzahl, kein Energiekennwert. Die Lage gehört in die Standortargumente. Keine Aussage über Ertrag, Rendite, Wertentwicklung oder Steuern.`,
        },
        standortargumente: {
          type: "array",
          minItems: ANZAHL_STANDORTARGUMENTE,
          maxItems: ANZAHL_STANDORTARGUMENTE,
          description:
            `Genau ${ANZAHL_STANDORTARGUMENTE} Argumente für den Standort, nie über das Gebäude: Beschäftigung und Arbeitgeber, Anbindung, Nahversorgung, Bildung, Gesundheit, Freizeit. Jedes mit seinem Beleg.`,
          items: ARGUMENT_MIT_BELEG("Arbeitsplätze in der Nähe. Klinikum Nord in 1,8 km, Gewerbegebiet Süd in 2,4 km Luftlinie."),
        },
        marktargumente: {
          type: "array",
          minItems: 0,
          maxItems: ANZAHL_MARKTARGUMENTE,
          description:
            `Höchstens ${ANZAHL_MARKTARGUMENTE} Argumente zum Standort aus Sicht der Marktanalyse, nur aus den Zeilen „Markt …“ der Tatsachenliste, jedes mit Quelle und Stand im Satz. Nur Vergangenheit und Gegenwart, keine Vorhersage. Eine leere Liste, wenn es keine solchen Zeilen gibt.`,
          items: ARGUMENT_MIT_BELEG("Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026."),
        },
        sanierungen: {
          type: "array",
          minItems: 0,
          maxItems: MAX_SANIERUNGEN,
          description:
            `Höchstens ${MAX_SANIERUNGEN} Sanierungen oder zuletzt erledigte Maßnahmen am Gebäude und an den Einheiten, die neueste zuerst. Nur, was in den Tatsachen oder Unterlagen steht. Eine leere Liste, wenn dort nichts dazu steht.`,
          items: {
            type: "object",
            properties: {
              jahr: {
                type: "string",
                description:
                  "Vierstellige Jahreszahl, nur wenn sie in den Tatsachen steht. Sonst ein leerer Text. Nie schätzen.",
              },
              massnahme: {
                type: "string",
                description:
                  `Kurz, höchstens ${MAX_MASSNAHME} Zeichen. Beispiel: „Dach und Fassade renoviert“ oder „Hausflure und Eingangsbereiche, Renovierung läuft“. Keine Beträge.`,
              },
              beleg: {
                type: "string",
                description:
                  "Die Zeile aus der Tatsachenliste, auf die sich der Eintrag stützt, wörtlich übernommen, oder Name und Zitat der Unterlage.",
              },
            },
            required: ["jahr", "massnahme", "beleg"],
          },
        },
        interne_highlights: {
          type: "array",
          minItems: 0,
          maxItems: MAX_INTERNE_HIGHLIGHTS,
          description:
            `Höchstens ${MAX_INTERNE_HIGHLIGHTS} interne Highlights für den Vertriebspartner, die wichtigsten verkaufsfördernden Punkte des Objekts, die stärksten zuerst. Nur belegt. Eine leere Liste, wenn nichts belegt ist.`,
          items: {
            type: "object",
            properties: {
              punkt: {
                type: "string",
                description:
                  `Eine Zeile, höchstens ${MAX_HIGHLIGHT} Zeichen, Zahlen genau wie in der Quelle. Beispiel: „Restnutzungsdauergutachten: 30 Jahre RND, AfA 3,33 % p. a.“ oder „Mietgarantie 24 Monate laut Kaufvertragsentwurf“.`,
              },
              beleg: {
                type: "string",
                description:
                  "Die Zeile aus der Tatsachenliste, wörtlich, oder Name und kurzes wörtliches Zitat der Unterlage.",
              },
              art: {
                type: "string",
                enum: ["erhaltungsaufwand", "restnutzungsdauer", "sonstiges"],
                description:
                  "„erhaltungsaufwand“ für Erhaltungsaufwand oder dessen Höhe, „restnutzungsdauer“ für Restnutzungsdauer, RND-Gutachten oder den AfA-Satz daraus, sonst „sonstiges“.",
              },
            },
            required: ["punkt", "beleg", "art"],
          },
        },
      },
      required: ["kurzbeschreibung", "standortargumente", "marktargumente", "sanierungen", "interne_highlights"],
      additionalProperties: false,
    },
  },
};

/**
 * Welche Art Messung hinter den Standortzeilen steht, gelesen an der ersten Zeile.
 *
 * Die Zeile setzt `standortQuellen`. So muss der Auftrag die Analyse selbst
 * nicht kennen, und ein Aufrufer, der nur Zeilen weiterreicht, bekommt
 * trotzdem die passende Anweisung.
 */
function messart(standort: string[]): "adresse" | "strasse" | "flaeche" | "ohne" {
  if (standort.length === 0) return "ohne";
  const erste = standort[0] || "";
  if (erste.startsWith("Umgebung gemessen ab der Straße")) return "strasse";
  if (erste.startsWith("Umgebung gemessen ab dem Mittelpunkt") || erste.startsWith("Umgebung gemessen ab der Ortsmitte")) return "flaeche";
  return "adresse";
}

/**
 * Der Auftrag an das Modell, samt der vollständigen Tatsachenliste.
 *
 * SEIT FASSUNG 4, 23.09.2026 SPÄT (Christians Vorgabe)
 *
 * Zwei Blöcke, klar getrennt:
 *
 *   - Die Kurzbeschreibung handelt nur vom Objekt: Objektart, Zustand,
 *     Sanierung, Ausstattung, Vermietungssituation und warum sich der Kauf
 *     dieser Einheit lohnt. Höchstens 1000 Zeichen, gern weniger, und keine
 *     Kennzahlen, denn Kaufpreis, Fläche und Miete stehen direkt daneben.
 *   - Die fünf Standortargumente handeln nur vom Standort und sollen
 *     Vertriebspartner und Kunden ermutigen, dort zu investieren:
 *     Beschäftigung, Arbeitgeber, dazu die gemessene Umgebung.
 *
 * Arbeitgeber nur aus belegter Quelle. Die Liste „Namhafte Arbeitgeber“ im
 * Exposé stammt aus `standort_arbeitgeber` mit `quelle: "ai"` (von einem
 * Sprachmodell geschätzt, `enrich-arbeitgeber`) oder aus der fest getippten
 * Liste in `src/data/marktanalyseSeed.ts`. Beides ist modelliert und kommt
 * hier nicht an: `marktQuellen` lässt nur Arbeitgeber mit echter Quelle durch,
 * `standortQuellen` nur gemessene Einrichtungen aus OpenStreetMap.
 *
 * Der Ton wird werbender, die Grenzen bleiben dieselben und stehen
 * ausdrücklich über dem Ton: nichts erfinden, nichts zusagen, jedes Argument
 * belegt. Die Versprechen-Prüfung (`pruefeObjektTexte`) läuft danach weiter
 * über jeden Satz.
 */
export function objektTexteAnweisung(q: ObjektTexteQuellen): string {
  const zeilen = quellenZeilen(q);
  const mitUnterlagen = q.unterlagen.length > 0;
  const art = messart(q.standort);
  const mitMarkt = (q.markt ?? []).length > 0;
  const messung: Record<typeof art, string> = {
    adresse:
      "- Die Umgebung ist ab der Hausadresse gemessen, die Zeilen „… in der Nähe“ und „… im weiteren Umkreis“. Nenne die Entfernung so, wie sie dort steht.",
    strasse:
      "- Die Umgebung ist ab der Straße gemessen, nicht ab dem Haus. Übernimm die Entfernungen mit „rund“, so wie sie dort stehen.",
    flaeche:
      "- Die Umgebung ist nicht ab der Hausadresse gemessen, sondern ab dem Mittelpunkt des Postleitzahlgebiets oder des Orts. Nenne deshalb keine Entfernung zum Haus. Schreib, was es im Stadtteil oder im Ort gibt.",
    ohne:
      "- Die Umgebung der Adresse ist nicht gemessen. Nimm die Lageangaben aus den Unterlagen und den Beschreibungen, soweit sie konkret sind, und die Zeilen „Markt …“.",
  };
  return [
    "Du schreibst für ein Immobilien-CRM fünf Dinge zu einem Objekt: eine Kurzbeschreibung, genau",
    `${ANZAHL_STANDORTARGUMENTE} Standortargumente, bis zu ${ANZAHL_MARKTARGUMENTE} Marktargumente, die Liste der Sanierungen und bis zu ${MAX_INTERNE_HIGHLIGHTS} interne Highlights.`,
    "Lesen wird sie zuerst ein Vertriebspartner, danach der Kunde. Die Kurzbeschreibung soll Lust machen, genau diese Einheit in genau diesem Haus zu erwerben. Die Standortargumente sollen zeigen, warum es sich lohnt, an diesem Standort zu investieren.",
    "",
    "TATSACHEN, die du verwenden darfst. Es gibt keine weiteren:",
    ...zeilen.map((z, i) => `${i + 1}. ${z}`),
    mitUnterlagen
      ? "Dazu kommen die oben genannten Objektunterlagen als Anhang. Lies sie ganz, bevor du schreibst: Was darin über Objekt, Gebäude, Ausstattung, Sanierung, Vermietung und Lage steht, gilt ebenfalls als Tatsache und ist die wichtigste Quelle für die Beschreibung. Namen von Personen, Mietern oder Firmen als Vertragspartner, Beträge und Vertragsinhalte übernimmst du daraus nie."
      : null,
    "",
    "DIE KURZBESCHREIBUNG: NUR DAS OBJEKT",
    `- Höchstens ${MAX_KURZBESCHREIBUNG} Zeichen, gern weniger, etwa drei bis sechs Sätze. Kurz und prägnant, jeder Satz trägt eine neue Tatsache.`,
    "- Inhalt: Objektart, Zustand, Sanierung und Modernisierung, Ausstattung, Vermietungssituation und Konzept (etwa WG, möbliert, All-inclusive), und warum ein Anleger in diese Einheit und dieses Haus investieren sollte.",
    "- Keine Kennzahlen. Kein Kaufpreis, keine Miete, keine Rendite, keine Wohnfläche und keine Quadratmeter, keine Zimmerzahl, keine Zahl der Einheiten oder Etagen, kein Energiekennwert, kein Hausgeld. Diese Zahlen stehen auf der Seite direkt daneben. Eine Jahreszahl nur, um Baujahr oder Sanierung einzuordnen.",
    "- Lage und Umgebung gehören in die Standortargumente, nicht hierher. Höchstens ein halber Satz dazu, in welchem Ort oder Stadtteil das Haus steht.",
    "- Der erste Satz ist der stärkste: das wichtigste Merkmal genau dieses Objekts, konkret und bildhaft, etwa die Sanierung, der Zustand oder eine besondere Ausstattung. Keine Begrüßung, keine Frage, keine Floskel.",
    "- Nutzen zeigst du über Tatsachen, nicht über Adjektive: „2021 neues Dach und neue Fenster“ statt „top saniert“. Aktivierende Verben, klare Bilder, nüchtern in der Sache. Keine Übertreibung wie „einmalig“, „traumhaft“ oder „Top-Investment“.",
    "- Zuerst aus den Unterlagen (Exposé, Objekt- und Baubeschreibung), dann aus der Tatsachenliste. Sätze, die auf jedes Haus passen, sind keine Beschreibung.",
    "",
    `DIE ${ANZAHL_STANDORTARGUMENTE} STANDORTARGUMENTE: NUR DER STANDORT`,
    "- Jedes Argument handelt vom Standort, nie vom Gebäude, seiner Ausstattung oder seinem Zustand. Es soll Vertriebspartner und Kunden ermutigen, an diesem Standort zu investieren.",
    "- Je Argument ein Thema: Wirtschaft und Arbeit (Beschäftigungslage, Arbeitgeber, Gewerbegebiete, Kliniken, Hochschulen), Anbindung (Bus, Bahn, Bahnhof), Nahversorgung, Bildung und Familie, Gesundheit, Freizeit und Grün. Gibt es Tatsachen zu Wirtschaft und Arbeit, steht ein Argument dazu an erster Stelle.",
    messung[art],
    "- Arbeitgeber nennst du nur, wenn sie in den Tatsachen stehen: in einer Zeile „Markt …, große Arbeitgeber laut …“, als gemessene Einrichtung aus OpenStreetMap (Klinik, Hochschule, Gewerbe- oder Industriefläche) oder in einer Unterlage. Nie aus dem Gedächtnis, auch keine bekannten Unternehmen der Region. Keine Beschäftigtenzahl, keinen Rang und kein „größter Arbeitgeber“, wenn es nicht so in den Tatsachen steht. Dass es an einer Klinik, Hochschule oder auf einer Gewerbe- oder Industriefläche Arbeitsplätze gibt, darfst du sagen, aber ohne Zahl. Nimm dafür die aussagekräftigsten, nicht zwingend die nächsten.",
    "- Die Beschäftigungslage, etwa die Arbeitslosenquote, darfst du aus einer Zeile „Markt …“ nehmen, mit Quelle und Stand im Satz. Dieselbe Zahl steht dann nicht noch einmal in einem Marktargument.",
    `- Erst ein kurzer, aktivierender Anlauf, dann die Tatsache mit Zahl. Jedes 70 bis ${MAX_ARGUMENT} Zeichen, alle ${ANZAHL_STANDORTARGUMENTE} ungefähr gleich lang.`,
    "",
    `DIE MARKTARGUMENTE, HÖCHSTENS ${ANZAHL_MARKTARGUMENTE}`,
    mitMarkt
      ? "- Nur aus den Zeilen „Markt …“ der Tatsachenliste: erhobene Kennzahlen zur Stadt oder Region, etwa Einwohner, Arbeitsmarkt, Arbeitgeber, Bodenrichtwert."
      : "- Es gibt keine Zeilen „Markt …“ in der Tatsachenliste. Gib eine leere Liste zurück.",
    "- Jedes nennt die Zahl mit Quelle und Stand im Satz, zum Beispiel: „Gefragter Arbeitsmarkt. Arbeitslosenquote 3,1 Prozent, Destatis, Stand 07/2026.“",
    "- Nur was war oder ist, keine Vorhersage und keine Folgerung für dieses Objekt. Nicht „die Mieten werden steigen“, nicht „der Wert wird zulegen“.",
    "- Heißt die Zeile „nächstgelegener Standort“, nennst du die Stadt und die Entfernung, statt so zu tun, als liege das Objekt dort.",
    `- Jedes 70 bis ${MAX_ARGUMENT} Zeichen.`,
    "",
    `DIE INTERNEN HIGHLIGHTS, HÖCHSTENS ${MAX_INTERNE_HIGHLIGHTS}`,
    "- Sie liest nur der Vertriebspartner zur Vorbereitung der Objektvorstellung, nie ein Kunde. Sachlich und intern, keine Werbesprache, keine Anrede.",
    "- Die wichtigsten verkaufsfördernden Punkte des ganzen Objekts, die stärksten zuerst. Vor allem, soweit belegt: Erhaltungsaufwand und seine Höhe, Restnutzungsdauergutachten mit Restnutzungsdauer oder AfA-Satz, Erstvermietungs- oder Mietgarantie, Sonder-AfA, Denkmalschutz, KfW oder andere Förderung, Mietsteigerungspotenzial laut Unterlage, durchgeführte oder beschlossene Sanierungen, Instandhaltungsrücklage, besondere Ausstattung, Lage-Pluspunkte.",
    "- Hier darfst du Zahlen und Beträge nennen, aber nur genau so, wie sie in Tatsachen oder Unterlagen stehen. Nie runden, nie umrechnen, nie schätzen.",
    "- Höchstens eine Zeile je Punkt, prägnant, das Stichwort vorne. Kein Satz über Rendite, Wertsteigerung oder künftige Mieten als Zusage, keine Steuerberatung: nur die Tatsache, nicht was der Kunde daraus spart.",
    "- Keine Namen von Personen, Mietern oder Käufern. Was nicht belegt ist, kommt nicht hinein. Lieber drei Punkte als acht mit einem erfundenen.",
    "",
    "REGELN, sie gehen dem Verkaufston vor (Regel 2 und 5 gelten nicht für die internen Highlights, dort gilt der Abschnitt oben):",
    "1. Behaupte nichts, was nicht in den Tatsachen oder den Unterlagen steht. Keine Einrichtung, keine Entfernung, keine Zahl, keine Firma aus dem Gedächtnis.",
    "2. Keine Zusagen zu Rendite, Wertsteigerung, Mieteinnahmen oder Steuervorteilen. Auch nicht angedeutet. Diese Themen gehören nicht in diese Texte.",
    "3. Jedes Argument braucht einen Beleg: die Zeile aus der Liste oben, wörtlich, oder bei einer Unterlage deren Name und ein kurzes wörtliches Zitat.",
    `4. Genau ${ANZAHL_STANDORTARGUMENTE} Argumente für den Standort. Reichen die Tatsachen nur für weniger, gib weniger zurück, statt eines zu erfinden. Dasselbe gilt für die Marktargumente.`,
    "5. Keine Kaufpreise, Mieten, Beträge oder Namen von Personen. Ein Bodenrichtwert in einem Marktargument ist erlaubt, mit Quelle und Stand.",
    "6. Deutsch. Wo du den Leser ansprichst, dann mit du, klein geschrieben mitten im Satz. Keine Gedankenstriche, auch keinen Strich als Satzzeichen zwischen zwei Satzteilen.",
    "7. Entfernungen in den Tatsachen sind Luftlinie. Schreib „280 m entfernt“ oder „rund 300 m“, nie eine Gehzeit, denn die ist nicht gemessen.",
    `8. Sanierungen: höchstens ${MAX_SANIERUNGEN} Maßnahmen am Gebäude oder an den Einheiten, die in den Tatsachen oder Unterlagen genannt sind, die neueste zuerst. Das Jahr nur, wenn es dort steht, sonst leer lassen. Läuft eine Maßnahme noch, sag das. Keine Beträge. Steht nichts zu Sanierungen in den Tatsachen, bleibt die Liste leer.`,
    "",
    "Antworte ausschließlich über das Werkzeug „objekt_texte“.",
  ]
    // Leere Zeilen bleiben als Absatz stehen, nur die weggelassenen Teile fallen heraus.
    .filter((zeile) => zeile !== null)
    .join("\n");
}

/**
 * Gedankenstriche aus einem Text nehmen.
 *
 * Christians feste Regel: keine Gedankenstriche in Texten, die Nutzer sehen.
 * Das Modell setzt sie trotzdem gern. Anders als ein Versprechen ist das eine
 * Frage der Zeichensetzung und nicht des Inhalts, deshalb wird hier ersetzt
 * statt gemeldet: „2019–2021“ wird zu „2019 bis 2021“, ein Strich zwischen
 * zwei Satzteilen zu einem Komma, ein Strich ohne Leerzeichen zum Bindestrich.
 */
export function ohneGedankenstriche(wert: string): string {
  return wert
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 bis $2")
    .replace(/\s+[–—-]\s+/g, ", ")
    .replace(/[–—]/g, "-")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");
}

/** Eine Zeichenkette auf eine Höchstlänge bringen, ohne mitten im Wort zu enden. */
function kuerzen(wert: string, max: number): string {
  if (wert.length <= max) return wert;
  const schnitt = wert.slice(0, max);
  const letzte = schnitt.lastIndexOf(" ");
  return `${(letzte > max * 0.6 ? schnitt.slice(0, letzte) : schnitt).trimEnd()}…`;
}

export interface GepruefteTexte {
  kurzbeschreibung: string;
  standortargumente: StandortArgument[];
  /** Optional, weil ältere Aufrufer die Prüfung ohne Marktargumente nachbauen. */
  marktargumente?: StandortArgument[];
  sanierungen: SanierungsEintrag[];
  /** Optional, weil ältere Aufrufer die Prüfung ohne Highlights nachbauen. */
  interneHighlights?: InternesHighlight[];
  beanstandungen: string[];
}

/**
 * Eine Liste von Argumenten mit Beleg in Form bringen.
 *
 * Für Standort- und Marktargumente dieselbe Regel: gekürzt auf die
 * Höchstlänge, ein fehlender Beleg wird gemeldet, nicht still ergänzt.
 */
function argumenteMitBeleg(roh: unknown, wort: string, beanstandungen: string[]): StandortArgument[] {
  const liste: StandortArgument[] = [];
  for (const eintrag of Array.isArray(roh) ? roh : []) {
    const e = alsObjekt(eintrag);
    const argument = kuerzen(ohneGedankenstriche(text(e.argument)), MAX_ARGUMENT);
    if (!argument) continue;
    const beleg = kuerzen(text(e.beleg), 300);
    if (!beleg) beanstandungen.push(`${wort} ohne Beleg: „${kuerzen(argument, 60)}“. Bitte gegen die Unterlagen prüfen.`);
    liste.push({ argument, beleg });
  }
  return liste;
}

/** Ein Betrag in einer Maßnahme, etwa „80.000 €“ oder „2 Mio. Euro“. */
const BETRAG = /\d[\d.,\s]*(mio\.?|millionen|tsd\.?)?\s*(€|euro\b|eur\b)/i;

/**
 * Die Sanierungen aus der Antwort prüfen.
 *
 * Das Jahr ist der heikle Teil: Ein Modell schätzt gern eines dazu. Steht es
 * nicht in den Tatsachen, wird es entfernt und gemeldet, die Maßnahme bleibt.
 * Das geht nur, wenn keine Unterlagen mitgelesen wurden; aus einem PDF kann
 * ein Jahr kommen, das hier niemand nachprüfen kann. Die Reihenfolge wird
 * hergestellt, nicht gemeldet: neueste zuerst, ohne Jahr ans Ende.
 */
function pruefeSanierungen(
  roh: unknown,
  quellen: ObjektTexteQuellen | undefined,
  beanstandungen: string[],
): SanierungsEintrag[] {
  const tatsachen = quellen ? quellenZeilen(quellen).join("\n") : "";
  const jahrPruefbar = !!quellen && quellen.unterlagen.length === 0;
  const gesehen = new Set<string>();
  const liste: SanierungsEintrag[] = [];

  for (const eintrag of Array.isArray(roh) ? roh : []) {
    const e = alsObjekt(eintrag);
    const massnahme = kuerzen(ohneGedankenstriche(text(e.massnahme)), MAX_MASSNAHME);
    if (!massnahme) continue;
    const kurz = kuerzen(massnahme, 60);

    const jahrRoh = text(e.jahr) || (typeof e.jahr === "number" ? String(e.jahr) : "");
    let jahr = jahrText(jahrRoh);
    if (jahrRoh && !jahr) {
      beanstandungen.push(`Sanierung „${kurz}“: „${jahrRoh}“ ist keine Jahreszahl und wurde weggelassen.`);
    }
    if (jahr && jahrPruefbar && !tatsachen.includes(jahr)) {
      beanstandungen.push(`Sanierung „${kurz}“: Das Jahr ${jahr} steht nicht in den Angaben und wurde weggelassen.`);
      jahr = "";
    }

    // Wortgleiche Doppel bringen nichts und sähen in der Liste wie ein Fehler aus.
    const schluessel = `${jahr}|${massnahme.toLowerCase()}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    const beleg = kuerzen(text(e.beleg), 300);
    if (!beleg) beanstandungen.push(`Sanierung ohne Beleg: „${kurz}“. Bitte gegen die Unterlagen prüfen.`);
    if (BETRAG.test(massnahme)) beanstandungen.push(`Sanierung „${kurz}“ nennt einen Betrag. Bitte prüfen.`);
    beanstandungen.push(...versprechenIn(massnahme, `Sanierung „${kurz}“`));
    liste.push({ jahr, massnahme, beleg });
  }

  // Stabil sortiert: Einträge mit gleichem Jahr behalten die Folge des Modells.
  liste.sort((a, b) => (b.jahr || "0000").localeCompare(a.jahr || "0000"));
  if (liste.length > MAX_SANIERUNGEN) {
    beanstandungen.push(
      `Es kamen ${liste.length} Sanierungen zurück, gespeichert sind die ${MAX_SANIERUNGEN} neuesten.`,
    );
    liste.length = MAX_SANIERUNGEN;
  }
  return liste;
}

/**
 * Kennzahlen, die nicht in die Kurzbeschreibung gehören.
 *
 * Christian am 23.09.2026: Kaufpreis, Fläche und Miete stehen auf der Seite
 * direkt neben der Beschreibung. Wiederholt sie der Text, liest er sich wie
 * ein Datenblatt. Gemeldet, nicht gestrichen: Ein Satz ohne seine Zahl wäre
 * oft kein Satz mehr.
 */
const KENNZAHLEN_IN_BESCHREIBUNG: Array<{ muster: RegExp; was: string }> = [
  { muster: /\d[\d.,]*\s*(m²|m2|qm\b|quadratmeter)/i, was: "eine Fläche" },
  { muster: /\d[\d.,]*\s*(€|euro\b|eur\b)/i, was: "einen Betrag" },
  { muster: /\b\d+([.,]\d+)?\s*(-\s*)?(zimmer|zi\.)/i, was: "eine Zimmerzahl" },
  { muster: /\d[\d.,]*\s*kwh/i, was: "einen Energiekennwert" },
  { muster: /\d[\d.,]*\s*(%|prozent)/i, was: "einen Prozentwert" },
  { muster: /\b\d+\s*(wohn)?einheiten\b/i, was: "die Zahl der Einheiten" },
];

function kennzahlenIn(kurzbeschreibung: string): string[] {
  const funde: string[] = [];
  for (const k of KENNZAHLEN_IN_BESCHREIBUNG) {
    const fund = kurzbeschreibung.match(k.muster);
    if (fund) funde.push(`Kurzbeschreibung nennt ${k.was} („${fund[0].trim()}“). Kennzahlen stehen schon neben dem Text. Bitte prüfen.`);
  }
  return funde;
}

/**
 * Belege, die eine Objektangabe sind und kein Standort.
 *
 * Die Standortargumente handeln seit Fassung 4 nur vom Standort. Stützt sich
 * eines auf Baujahr, Ausstattung oder Sanierung, ist es ein Objektargument an
 * der falschen Stelle.
 */
const OBJEKTZEILE =
  /^(Titel|Baujahr|Zustand|Wohnfläche|Grundstück|Etagen|Stellplätze|Energie|Sanierung|Gepflegtes Merkmal|Merkmal laut Investagon|Einheiten im Objekt|Wohnungsgrößen|Verkaufsart|Gemeinschaftseigentum|Verwaltung|Vermietet laut)/i;

/** Eine Beschäftigtenzahl im Text, etwa „rund 5.000 Beschäftigte“. */
const BESCHAEFTIGTE = /(\d[\d.\s]*\d|\d)\s*(beschäftigte\w*|mitarbeitende\w*|mitarbeiter\w*|arbeitsplätze\w*|angestellte\w*)/gi;

/**
 * Beschäftigtenzahlen, die nicht in den Tatsachen stehen.
 *
 * Genau so sahen die modellierten Arbeitgeberlisten aus: „BMW, 44.000
 * Mitarbeiter“. Eine solche Zahl darf nur in den Text, wenn sie belegt ist.
 * Mit mitgelesenen Unterlagen lässt sich das hier nicht prüfen, dann bleibt
 * es still. Ohne `quellen` ebenso.
 */
function beschaeftigteOhneBeleg(texte: string[], quellen?: ObjektTexteQuellen): string[] {
  if (!quellen || quellen.unterlagen.length > 0) return [];
  const zahlen = new Set((quellenZeilen(quellen).join("\n").match(/\d[\d.]*\d|\d/g) || []).map((z) => z.replace(/\./g, "")));
  const funde: string[] = [];
  for (const t of texte) {
    for (const fund of t.matchAll(BESCHAEFTIGTE)) {
      const zahl = fund[1].replace(/[.\s]/g, "");
      if (!zahlen.has(zahl)) {
        funde.push(`„${fund[0].trim()}“ steht so nicht in den Angaben. Beschäftigtenzahlen nur mit Beleg. Bitte prüfen.`);
      }
    }
  }
  return [...new Set(funde)];
}

/**
 * Die Antwort des Modells prüfen und in Form bringen.
 *
 * Geprüft wird: Sind es genau fünf Argumente? Trägt jedes einen Beleg? Steht
 * irgendwo ein Versprechen? Stimmen die Jahre der Sanierungen? Nichts davon
 * wird stillschweigend repariert, alles landet in `beanstandungen` und damit
 * vor den Augen des Nutzers. Nur Überzähliges wird abgeschnitten, sonst
 * stünden sechs Argumente in einem Feld, das fünf vorsieht.
 *
 * `quellen` braucht nur die Prüfung der Sanierungsjahre. Fehlt es, bleiben
 * die Jahre ungeprüft.
 */
export function pruefeObjektTexte(roh: unknown, quellen?: ObjektTexteQuellen): GepruefteTexte {
  const r = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const beanstandungen: string[] = [];

  const rohKurz = ohneGedankenstriche(text(r.kurzbeschreibung));
  const kurzbeschreibung = kuerzen(rohKurz, MAX_KURZBESCHREIBUNG);
  if (!kurzbeschreibung) beanstandungen.push("Es kam keine Kurzbeschreibung zurück.");
  else if (rohKurz.length > MAX_KURZBESCHREIBUNG) {
    beanstandungen.push(
      `Die Kurzbeschreibung war ${rohKurz.length} Zeichen lang und wurde auf ${MAX_KURZBESCHREIBUNG} gekürzt. Bitte den Schluss ansehen.`,
    );
  }

  const standortargumente = argumenteMitBeleg(r.standortargumente, "Standortargument", beanstandungen);

  if (standortargumente.length > ANZAHL_STANDORTARGUMENTE) {
    beanstandungen.push(
      `Es kamen ${standortargumente.length} Argumente zurück, gespeichert sind die ersten ${ANZAHL_STANDORTARGUMENTE}.`,
    );
    standortargumente.length = ANZAHL_STANDORTARGUMENTE;
  } else if (standortargumente.length < ANZAHL_STANDORTARGUMENTE) {
    beanstandungen.push(
      `Es kamen nur ${standortargumente.length} von ${ANZAHL_STANDORTARGUMENTE} Argumenten zurück. Meist fehlen dafür Angaben am Objekt.`,
    );
  }

  /*
   * Die fünf Punkte sollen gleichmäßig wirken.
   *
   * Ein langer Punkt und vier kurze sehen neben der Kurzbeschreibung unruhig
   * aus, und der lange zieht alle Aufmerksamkeit. Gemeldet wird das erst ab
   * dem Doppelten, damit nicht jede kleine Abweichung eine Warnung auslöst.
   */
  if (standortargumente.length > 1) {
    const laengen = standortargumente.map((a) => a.argument.length);
    const kuerzestes = Math.min(...laengen);
    const laengstes = Math.max(...laengen);
    if (kuerzestes > 0 && laengstes > kuerzestes * 2) {
      beanstandungen.push(
        `Die Argumente sind unterschiedlich lang, ${kuerzestes} bis ${laengstes} Zeichen. Gleichmäßige Punkte lesen sich besser.`,
      );
    }
  }

  /*
   * Die Marktargumente: null bis drei.
   *
   * Weniger als drei ist kein Fehler, solange es keine Marktdaten gibt. Gab es
   * welche und kam trotzdem nichts zurück, wird das gemeldet. Ohne `quellen`
   * lässt sich das nicht unterscheiden, dann bleibt es still.
   */
  const marktargumente = argumenteMitBeleg(r.marktargumente, "Marktargument", beanstandungen);
  if (marktargumente.length > ANZAHL_MARKTARGUMENTE) {
    beanstandungen.push(
      `Es kamen ${marktargumente.length} Marktargumente zurück, gespeichert sind die ersten ${ANZAHL_MARKTARGUMENTE}.`,
    );
    marktargumente.length = ANZAHL_MARKTARGUMENTE;
  }
  const marktzeilen = quellen?.markt ?? [];
  if (quellen && marktzeilen.length === 0 && marktargumente.length > 0) {
    beanstandungen.push("Es gibt Marktargumente, aber keine Marktdaten zu diesem Ort. Bitte die Belege prüfen.");
  } else if (quellen && marktzeilen.length > 0 && marktargumente.length < ANZAHL_MARKTARGUMENTE) {
    beanstandungen.push(
      `Es kamen nur ${marktargumente.length} von ${ANZAHL_MARKTARGUMENTE} Marktargumenten zurück. Meist reichen die erhobenen Kennzahlen zum Ort nicht weiter.`,
    );
  }

  beanstandungen.push(...kennzahlenIn(kurzbeschreibung));
  standortargumente.forEach((a, i) => {
    if (OBJEKTZEILE.test(a.beleg)) {
      beanstandungen.push(
        `Argument ${i + 1} stützt sich auf eine Objektangabe („${kuerzen(a.beleg, 60)}“), nicht auf den Standort. Bitte prüfen.`,
      );
    }
  });
  beanstandungen.push(
    ...beschaeftigteOhneBeleg(
      [kurzbeschreibung, ...standortargumente.map((a) => a.argument), ...marktargumente.map((a) => a.argument)],
      quellen,
    ),
  );
  beanstandungen.push(...versprechenIn(kurzbeschreibung, "Kurzbeschreibung"));
  standortargumente.forEach((a, i) => {
    beanstandungen.push(...versprechenIn(a.argument, `Argument ${i + 1}`));
  });
  marktargumente.forEach((a, i) => {
    beanstandungen.push(...versprechenIn(a.argument, `Marktargument ${i + 1}`));
  });

  const sanierungen = pruefeSanierungen(r.sanierungen, quellen, beanstandungen);
  const interneHighlights = pruefeInterneHighlights(r.interne_highlights, beanstandungen);

  return { kurzbeschreibung, standortargumente, marktargumente, sanierungen, interneHighlights, beanstandungen };
}

/**
 * Was ein internes Highlight nie sagen darf: Zusagen zu Ertrag, Wert und
 * Steuer. Anders als bei den Kundentexten wird hier nicht gemeldet, sondern
 * weggelassen, denn die Highlights liest niemand mehr gegen.
 */
const HIGHLIGHT_ZUSAGE =
  /\b(rendite\w*|wertsteigerung\w*|wertzuwachs\w*|steuerfrei\w*|steuer(vorteil|ersparnis)\w*|risikolos\w*|krisensicher\w*|sichere?[nrs]? (ertrag|einnahme)\w*|(wird|werden|dürfte|dürften)\s+(\w+\s+){0,2}(steigen|wachsen|zulegen))\b/i;

/**
 * Die internen Highlights prüfen: eine Zeile, ohne Gedankenstrich, mit Beleg,
 * ohne Zusage. Ohne Beleg oder mit Zusage fällt der Punkt weg, samt Vermerk.
 * Wortgleiche Doppel fallen still weg.
 */
export function pruefeInterneHighlights(roh: unknown, beanstandungen: string[] = []): InternesHighlight[] {
  const liste: InternesHighlight[] = [];
  const gesehen = new Set<string>();
  for (const eintrag of Array.isArray(roh) ? roh : []) {
    const e = alsObjekt(eintrag);
    const punkt = kuerzen(ohneGedankenstriche(text(e.punkt)).replace(/\s+/g, " "), MAX_HIGHLIGHT);
    if (!punkt) continue;
    const kurz = kuerzen(punkt, 60);
    const beleg = kuerzen(text(e.beleg), 300);
    if (!beleg) {
      beanstandungen.push(`Highlight ohne Beleg weggelassen: „${kurz}“.`);
      continue;
    }
    if (HIGHLIGHT_ZUSAGE.test(punkt)) {
      beanstandungen.push(`Highlight mit Zusage weggelassen: „${kurz}“.`);
      continue;
    }
    if (gesehen.has(punkt.toLowerCase())) continue;
    gesehen.add(punkt.toLowerCase());
    const art = text(e.art);
    liste.push({ punkt, beleg, art: art === "erhaltungsaufwand" || art === "restnutzungsdauer" ? art : "sonstiges" });
    if (liste.length >= MAX_INTERNE_HIGHLIGHTS) break;
  }
  return liste;
}

/** Das fertige Ergebnis zusammensetzen, so wie es im `meta` landet. */
export function baueObjektTexte(params: {
  geprueft: GepruefteTexte;
  quellen: ObjektTexteQuellen;
  modell: string;
  jetzt?: Date;
  /** Ob und ab wo gemessen wurde. Ohne Angabe fehlt der Vermerk. */
  umgebung?: UmgebungStand;
}): ObjektTexte {
  return {
    schema: OBJEKT_TEXTE_SCHEMA,
    kurzbeschreibung: params.geprueft.kurzbeschreibung,
    standortargumente: params.geprueft.standortargumente,
    // `?? []`, weil ältere Aufrufer die Prüfung ohne diese Listen nachbauen.
    marktargumente: params.geprueft.marktargumente ?? [],
    sanierungen: params.geprueft.sanierungen ?? [],
    interneHighlights: params.geprueft.interneHighlights ?? [],
    erzeugtAm: (params.jetzt ?? new Date()).toISOString(),
    modell: params.modell,
    quellenStand: quellenFingerabdruck(params.quellen),
    quellen: quellenZeilen(params.quellen),
    beanstandungen: params.geprueft.beanstandungen,
    ...(params.umgebung ? { umgebung: params.umgebung } : {}),
  };
}

/**
 * Ein Vermerk, dass ein Lauf bewusst nichts erzeugt hat.
 *
 * Er wird wie ein Ergebnis abgelegt und verhindert damit, dass der
 * selbsttätige Start es bei jedem Seitenaufruf erneut versucht. Wer den Grund
 * behoben hat, stößt die Erzeugung ausdrücklich an.
 */
export function baueLeereObjektTexte(params: {
  grund: string;
  quellen: ObjektTexteQuellen;
  jetzt?: Date;
  umgebung?: UmgebungStand;
}): ObjektTexte {
  return {
    schema: OBJEKT_TEXTE_SCHEMA,
    kurzbeschreibung: "",
    standortargumente: [],
    marktargumente: [],
    sanierungen: [],
    interneHighlights: [],
    erzeugtAm: (params.jetzt ?? new Date()).toISOString(),
    modell: "",
    quellenStand: quellenFingerabdruck(params.quellen),
    quellen: quellenZeilen(params.quellen),
    beanstandungen: [],
    ohneErgebnis: params.grund,
    ...(params.umgebung ? { umgebung: params.umgebung } : {}),
  };
}

/** Trägt dieser Stand überhaupt Text, oder ist er nur ein Vermerk? */
export function hatTexte(texte: ObjektTexte | undefined | null): boolean {
  return !!texte && (!!texte.kurzbeschreibung || texte.standortargumente.length > 0);
}

/** Die Argumente eines Stands als einfache Sätze, gleich ob Text oder `{ argument }`. */
function argumentSaetze(roh: unknown): string[] {
  return (Array.isArray(roh) ? roh : [])
    .map((a) => (typeof a === "string" ? a.trim() : text(alsObjekt(a).argument)))
    .filter(Boolean);
}

/**
 * Der Wortlaut des zuletzt gespeicherten automatischen Stands, gleich welcher
 * Fassung.
 *
 * Bewusst roh gelesen, ohne Prüfung der Fassung: Nach dem Wechsel auf eine
 * neue Fassung stehen in `meta.kurzbeschreibung`, `meta.standortargumente` und
 * `meta.marktargumente` noch die Texte der vorigen. Ob sie von Hand stammen,
 * lässt sich nur durch den Vergleich mit genau diesem Stand sagen.
 */
export function automatischerWortlaut(
  meta: unknown,
): { kurzbeschreibung: string; standortargumente: string[]; marktargumente: string[] } | undefined {
  const roh = alsObjekt(meta)[OBJEKT_TEXTE_META_SCHLUESSEL];
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return undefined;
  const stand = roh as Record<string, unknown>;
  return {
    kurzbeschreibung: text(stand.kurzbeschreibung),
    standortargumente: argumentSaetze(stand.standortargumente),
    marktargumente: argumentSaetze(stand.marktargumente),
  };
}

/**
 * Steht in einem Feld wortgleich der Freitext aus Investagon?
 *
 * Bis zum 23.09.2026 schrieb der Pflegedialog der Objektseite beim Speichern
 * die angezeigte Kurzbeschreibung zurück, und die war bei leerem Feld der
 * Freitext aus Investagon (`objektseiteFelder` in `src/lib/objektseiteDaten.ts`,
 * Absätze nach `weight` sortiert und mit Leerzeile verbunden). Danach galt er
 * als von Hand geschrieben, und kein Lauf durfte ihn mehr ersetzen. Getippt
 * hat ihn aber niemand. Verglichen wird ohne Rücksicht auf Leerraum.
 */
export function istInvestagonKopie(meta: unknown, wert: unknown): boolean {
  const kandidat = text(wert).replace(/\s+/g, " ");
  if (!kandidat) return false;
  const roh = alsObjekt(alsObjekt(meta).investagonRaw);
  const extras = Array.isArray(roh.extras) ? roh.extras : [];
  const absaetze = extras
    .map((eintrag, platz) => {
      if (typeof eintrag === "string") return { wert: eintrag.trim(), gewicht: Number.MAX_SAFE_INTEGER, platz };
      const e = alsObjekt(eintrag);
      const gewicht = Number(e.weight);
      return {
        wert: text(e.value),
        gewicht: e.weight !== null && e.weight !== undefined && e.weight !== "" && Number.isFinite(gewicht) ? gewicht : Number.MAX_SAFE_INTEGER,
        platz,
      };
    })
    .filter((a) => !!a.wert)
    .sort((a, b) => a.gewicht - b.gewicht || a.platz - b.platz)
    .map((a) => a.wert);
  return absaetze.length > 0 && absaetze.join("\n\n").replace(/\s+/g, " ") === kandidat;
}

/** Die Argumente aus einem gepflegten Feld, leere Einträge fallen heraus. */
function argumenteImFeld(meta: Record<string, unknown>, feld: "standortargumente" | "marktargumente"): string[] {
  return (Array.isArray(meta[feld]) ? (meta[feld] as unknown[]) : [])
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean);
}

/** Trägt ein Argumentfeld wortgleich den automatischen Stand? */
function wieAutomatisch(imFeld: string[], automatisch: string[] | undefined): boolean {
  return !!automatisch && automatisch.length > 0 && imFeld.length === automatisch.length &&
    imFeld.every((a, i) => a === automatisch[i]);
}

/**
 * Welche der gepflegten Felder jemand von Hand geschrieben hat.
 *
 * Von Hand heißt: Das Feld ist gefüllt und weicht vom zuletzt automatisch
 * erzeugten Wortlaut ab. Ein Feld, das wortgleich dem automatischen Stand
 * entspricht, hat nie jemand angefasst. Dasselbe gilt für eine
 * Kurzbeschreibung, die wortgleich der Freitext aus Investagon ist
 * (`istInvestagonKopie`).
 */
export function vonHandGepflegt(
  meta: unknown,
): { kurzbeschreibung: boolean; standortargumente: boolean; marktargumente: boolean } {
  const m = alsObjekt(meta);
  const auto = automatischerWortlaut(m);
  const kurz = text(m.kurzbeschreibung);
  const argumente = argumenteImFeld(m, "standortargumente");
  const markt = argumenteImFeld(m, "marktargumente");
  const kurzAutomatisch = !!auto?.kurzbeschreibung && kurz === auto.kurzbeschreibung;
  return {
    kurzbeschreibung: !!kurz && !kurzAutomatisch && !istInvestagonKopie(m, kurz),
    standortargumente: argumente.length > 0 && !wieAutomatisch(argumente, auto?.standortargumente),
    marktargumente: markt.length > 0 && !wieAutomatisch(markt, auto?.marktargumente),
  };
}

/**
 * Den erzeugten Text zusätzlich in die gepflegten Felder schreiben, aber nur
 * dorthin, wo nichts steht oder der vorige automatische Text.
 *
 * WARUM DAS SEIN MUSS
 *
 * Seit dem 22.09.2026 gibt es keinen Freigabeschritt mehr, der Text soll
 * überall sofort erscheinen. Objektseite, Einheitenseite und das Exposé lesen
 * aber seit jeher `meta.kurzbeschreibung` und `meta.standortargumente`, und die
 * Positivliste des öffentlichen Exposés
 * (`supabase/functions/_shared/expose-oeffentlich.ts`) lässt genau diese beiden
 * Schlüssel hinaus, `objekttexteKi` dagegen nicht. Ein Text, der nur dort
 * läge, käme beim Kunden nie an. Seit Fassung 3 gilt dasselbe für
 * `meta.marktargumente`.
 *
 * WAS ÜBERSCHRIEBEN WIRD UND WAS NICHT
 *
 * Was jemand von Hand eingetragen hat, gewinnt immer und bleibt unangetastet.
 * Ersetzt wird ein Feld nur, wenn es leer ist oder wortgleich den vorigen
 * automatischen Stand trägt (`vonHandGepflegt`). Ohne diese zweite Regel
 * bliebe nach dem Wechsel auf 1000 Zeichen überall die alte, kurze Fassung
 * stehen: Die Felder waren ja schon gefüllt, nur eben automatisch.
 *
 * Bei den Marktargumenten kommt eine dritte Regel dazu: Liefert der neue Lauf
 * keine, weil es zum Ort keine Marktdaten gibt, verschwindet ein automatisch
 * gefülltes Feld. Bliebe es stehen, wiche es vom neuen Stand ab und gälte ab
 * dann als von Hand geschrieben.
 *
 * Aufgerufen wird das VOR `objektTexteInMeta`, denn der Vergleich braucht den
 * vorigen Stand, nicht den neuen.
 */
export function texteInGepflegteFelder(
  meta: Record<string, unknown> | null | undefined,
  texte: ObjektTexte,
): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(meta || {}) };
  const vonHand = vonHandGepflegt(neu);
  if (!vonHand.kurzbeschreibung && texte.kurzbeschreibung) neu.kurzbeschreibung = texte.kurzbeschreibung;
  if (!vonHand.standortargumente && texte.standortargumente.length > 0) {
    neu.standortargumente = texte.standortargumente.map((a) => a.argument);
  }
  // Ein Vermerk ohne Ergebnis fasst die Marktargumente nicht an, er hat ja gar nicht erst geschrieben.
  if (!vonHand.marktargumente && !texte.ohneErgebnis) {
    const markt = (texte.marktargumente ?? []).map((a) => a.argument);
    if (markt.length > 0) neu.marktargumente = markt;
    else delete neu.marktargumente;
  }
  return neu;
}

/** Argumente mit Beleg defensiv lesen, leere fallen heraus. */
function argumenteAusStand(roh: unknown): StandortArgument[] {
  return (Array.isArray(roh) ? roh : [])
    .map((a) => ({ argument: text(alsObjekt(a).argument), beleg: text(alsObjekt(a).beleg) }))
    .filter((a) => !!a.argument);
}

/** Den Umgebungsvermerk defensiv lesen. */
function umgebungAus(roh: unknown): UmgebungStand | undefined {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return undefined;
  const u = roh as Record<string, unknown>;
  if (typeof u.gemessen !== "boolean") return undefined;
  const genauigkeit = text(u.genauigkeit);
  const art = text(u.art);
  return {
    gemessen: u.gemessen,
    ...(["adresse", "strasse", "plz", "ort"].includes(genauigkeit) ? { genauigkeit: genauigkeit as Genauigkeit } : {}),
    ...(text(u.gemessenAm) ? { gemessenAm: text(u.gemessenAm) } : {}),
    ...(text(u.grund) ? { grund: text(u.grund) } : {}),
    ...(art === "adresse" || art === "dienst" ? { art } : {}),
  };
}

/** Einen Fehlervermerk defensiv lesen. */
function letzterFehlerAus(roh: unknown): LetzterFehler | undefined {
  const f = alsObjekt(roh);
  const grund = text(f.grund);
  if (!grund) return undefined;
  const status = Number(f.status);
  return {
    zeitpunkt: text(f.zeitpunkt),
    grund,
    ...(Number.isFinite(status) && status > 0 ? { status } : {}),
    version: Number(f.version) || 0,
  };
}

/**
 * Ein gespeichertes Ergebnis aus einem `meta` lesen.
 *
 * Alles, was nicht die erwartete Fassung trägt, gilt als nicht vorhanden. So
 * kann eine spätere Fassung die Form ändern, ohne dass ein alter Datensatz
 * halb dargestellt wird. Ein Stand älterer Fassung kommt hier also nicht
 * durch; seinen Wortlaut liest nur `automatischerWortlaut`. Ein bloßer
 * Fehlervermerk ohne Stand ebenso nicht, den liest `letzterFehlerAusMeta`.
 */
export function objektTexteAusMeta(meta: unknown): ObjektTexte | undefined {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const roh = m[OBJEKT_TEXTE_META_SCHLUESSEL] as Partial<ObjektTexte> | undefined;
  if (!roh || typeof roh !== "object" || roh.schema !== OBJEKT_TEXTE_SCHEMA) return undefined;
  const sanierungen = Array.isArray(roh.sanierungen) ? roh.sanierungen : [];
  const fehler = letzterFehlerAus(roh.letzterFehler);
  const umgebung = umgebungAus(roh.umgebung);
  return {
    schema: OBJEKT_TEXTE_SCHEMA,
    kurzbeschreibung: text(roh.kurzbeschreibung),
    standortargumente: argumenteAusStand(roh.standortargumente),
    marktargumente: argumenteAusStand(roh.marktargumente),
    sanierungen: sanierungen
      .map((s) => {
        const e = alsObjekt(s);
        return { jahr: jahrText(e.jahr), massnahme: text(e.massnahme), beleg: text(e.beleg) };
      })
      .filter((s) => !!s.massnahme),
    // Gespeichert ist schon geprüft; hier nur defensiv lesen, ohne Vermerke.
    interneHighlights: pruefeInterneHighlights(roh.interneHighlights),
    erzeugtAm: text(roh.erzeugtAm),
    modell: text(roh.modell),
    quellenStand: text(roh.quellenStand),
    quellen: (Array.isArray(roh.quellen) ? roh.quellen : []).map((z) => text(z)).filter(Boolean),
    beanstandungen: (Array.isArray(roh.beanstandungen) ? roh.beanstandungen : []).map((z) => text(z)).filter(Boolean),
    ...(text(roh.ohneErgebnis) ? { ohneErgebnis: text(roh.ohneErgebnis) } : {}),
    ...(fehler ? { letzterFehler: fehler } : {}),
    ...(umgebung ? { umgebung } : {}),
  };
}

/** Der Fehlervermerk an einem Objekt, gleich ob mit oder ohne Stand. */
export function letzterFehlerAusMeta(meta: unknown): LetzterFehler | undefined {
  return letzterFehlerAus(alsObjekt(alsObjekt(meta)[OBJEKT_TEXTE_META_SCHLUESSEL]).letzterFehler);
}

/**
 * Einen gescheiterten Lauf am Objekt vermerken, ohne die Texte anzufassen.
 *
 * Geschrieben wird nur `letzterFehler` unter `objekttexteKi`. Ein vorhandener
 * Stand bleibt, wie er ist. Ohne Stand entsteht ein Eintrag, der nur den
 * Vermerk trägt: Er hat keine Fassung und gilt deshalb weiter als offen, der
 * nächste Lauf versucht es also erneut.
 */
export function letztenFehlerInMeta(
  meta: Record<string, unknown> | null | undefined,
  fehler: { grund: string; status?: number; jetzt?: Date },
): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(meta || {}) };
  const bisher = alsObjekt(neu[OBJEKT_TEXTE_META_SCHLUESSEL]);
  const vermerk: LetzterFehler = {
    zeitpunkt: (fehler.jetzt ?? new Date()).toISOString(),
    grund: kuerzen(text(fehler.grund) || "Unbekannter Fehler", 500),
    ...(fehler.status ? { status: fehler.status } : {}),
    version: OBJEKT_TEXTE_FUNKTION_VERSION,
  };
  neu[OBJEKT_TEXTE_META_SCHLUESSEL] = { ...bisher, letzterFehler: vermerk };
  return neu;
}

/**
 * Das Ergebnis in ein `meta` schreiben, fremde Schlüssel bleiben stehen.
 *
 * `undefined` entfernt den Eintrag. Geschrieben wird nur dieser eine
 * Schlüssel, damit ein Lauf nichts anderes am Objekt anfasst.
 */
export function objektTexteInMeta(
  meta: Record<string, unknown> | null | undefined,
  texte: ObjektTexte | undefined,
): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(meta || {}) };
  if (!texte) delete neu[OBJEKT_TEXTE_META_SCHLUESSEL];
  else neu[OBJEKT_TEXTE_META_SCHLUESSEL] = texte;
  return neu;
}
