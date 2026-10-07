/**
 * Die Bausteine, aus denen eine Handbuch-Seite besteht.
 *
 * Das Handbuch wird einmal als Struktur beschrieben (`inhalt.ts`) und zweimal
 * gezeichnet: als Seite im Browser (`HandbuchAnsicht.tsx`) und als PDF
 * (`handbuchPdf.ts`). So kann das PDF nie etwas anderes sagen als die Seite.
 */
import type { Zeichnung } from "./diagramme";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";

/** Symbole, die die Online-Fassung als Lucide-Icon zeigt. Das PDF kommt ohne aus. */
export type SymbolName =
  | "bank"
  | "person"
  | "prozent"
  | "haus"
  | "euro"
  | "schluessel"
  | "dokument"
  | "diagramm"
  | "stift"
  | "blitz"
  | "schild"
  | "brief"
  | "kalender"
  | "haken"
  | "stern"
  | "x";

export type KastenTon = "dich" | "gut" | "acht" | "ok";

export interface Tabellenzeile {
  zellen: string[];
  hervor?: boolean;
  summe?: boolean;
  /** Farbe je Zelle: grün für Zuflüsse, rot für Abflüsse. */
  toene?: Array<"plus" | "minus" | undefined>;
}

export type Block =
  | { typ: "lead"; text: string }
  | { typ: "absatz"; text: string }
  | { typ: "h2"; text: string }
  | { typ: "fussnote"; text: string }
  | { typ: "liste"; punkte: string[] }
  | { typ: "karten"; spalten: 2 | 3; karten: Array<{ symbol?: SymbolName; titel: string; text: string }> }
  | { typ: "kasten"; ton: KastenTon; titel: string; text: string }
  | { typ: "grafik"; titel?: string; untertitel?: string; zeichnung: Zeichnung }
  | { typ: "tabelle"; kopf?: string[]; zeilen: Tabellenzeile[]; rechtsAb?: number; titel?: string }
  | { typ: "weg"; schritte: Array<{ titel: string; text: string }> }
  | { typ: "vergleich"; links: { titel: string; punkte: string[] }; rechts: { titel: string; punkte: string[] } }
  | { typ: "prozess"; schritte: Array<{ symbol: SymbolName; titel: string; text: string }> }
  | { typ: "trichter"; stufen: Array<{ titel: string; text: string }> }
  | { typ: "zeitstrahl"; eintraege: Array<{ symbol: SymbolName; marke: string; titel: string; text: string }> }
  | { typ: "checkliste"; titel: string; punkte: Array<{ text: string; optional?: boolean }> }
  | { typ: "zahlen"; werte: Array<{ wert: string; text: string }> }
  | { typ: "angaben"; titel: string; paare: Array<[string, string]>; hinweis?: string }
  | { typ: "inhalt"; eintraege: Array<{ nr: string; titel: string; seitenId: string }> }
  | { typ: "portal"; titel: string; zeilen: Array<{ text: string; status: string; ton: "g" | "y" | "r" }>; hinweis: string }
  | {
      typ: "naechsterSchritt";
      fuer: string;
      titel: string;
      text: string;
      knopf: string;
      /** Der persönliche Link zur Selbstauskunft, oder null, wenn es keinen gibt. */
      link: string | null;
      ersatz: string;
    }
  | { typ: "zweispaltig"; links: Block[]; rechts: Block[] };

export interface HandbuchSeite {
  /** Feste Kennung, für Sprungmarken und das Inhaltsverzeichnis. */
  id: string;
  /** Kopfzeile, etwa „Kapitel 5“. */
  kapitel: string;
  titel: string;
  bloecke: Block[];
  /** Hängt diese Seite an den Antworten? Nur für Tests und Auswertung. */
  personalisiert?: string;
}

export interface Handbuch {
  /** Sprache des Handbuchs, für die festen Beschriftungen im PDF. */
  sprache: Sprache;
  titel: string;
  untertitel: string;
  erstelltFuer: string;
  datum: string;
  seiten: HandbuchSeite[];
}
