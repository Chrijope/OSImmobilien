import type { ObjektData } from "@/lib/objekteStore";
import { investagonStand } from "@/lib/objektseiteDaten";
import {
  GLOBALOBJEKT_ANLAGEKLASSE,
  hausImCrmGebunden,
  istGlobalAnlageklasse,
  istGlobalobjekt,
} from "../../supabase/functions/_shared/globalobjekt";

/*
 * Globalobjekt: EINE Wahrheit, der Schalter `global_objekt` (Christian,
 * 23.09.2026). Die Regeln stehen in `supabase/functions/_shared/globalobjekt.ts`,
 * dieselbe Datei liest der Investagon-Import. Wer im Browser fragt, ob ein
 * Objekt ein Globalobjekt ist, fragt `istGlobalobjekt`.
 */
export { GLOBALOBJEKT_ANLAGEKLASSE, istGlobalAnlageklasse, istGlobalobjekt };

/**
 * Wie ein Objekt verkauft wird, und was für ein Objekt es ist.
 *
 * Zwei Einteilungen, die nichts miteinander zu tun haben und deshalb getrennt
 * bleiben. Ein Neubau kann als Globalobjekt verkauft werden oder in einzelnen
 * Einheiten, und eine WG-Wohnung ist immer eine Einzelwohnung, aber nicht
 * jede Einzelwohnung ist eine WG.
 *
 * Die Struktur wird abgeleitet, weil sie sich aus den Daten selbst ergibt.
 * Die Bauart lässt sich nicht ableiten, ob ein Haus saniert wurde steht
 * nirgends im Datensatz, und sie muss deshalb gepflegt werden.
 */

/** Wie das Objekt verkauft wird. Ergibt sich aus den Daten. */
export type ObjektStruktur = "globalobjekt" | "einzelwohnung" | "mehrere_einheiten";

/**
 * Die Anlageklasse, wie sie am Objekt gepflegt und auf der Kachel als Badge
 * angezeigt wird. Freitext aus einer festen Auswahl in der Objektanlage,
 * deshalb hier kein eigener Typ: Kommt eine Klasse hinzu, taucht sie von
 * selbst in der Übersicht auf, ohne dass hier etwas nachgezogen werden muss.
 */
export type Anlageklasse = string;

export const STRUKTUR_LABEL: Record<ObjektStruktur, string> = {
  globalobjekt: "Globalobjekt",
  einzelwohnung: "Einzelwohnung",
  mehrere_einheiten: "Mehrere Einheiten",
};



/**
 * Die Struktur eines Objekts.
 *
 * Reihenfolge ist wichtig: Ein Globalobjekt bleibt eines, auch wenn es nur
 * eine Einheit hat. Sonst käme ein als Ganzes verkauftes Haus mit einer
 * Wohnung als Einzelwohnung heraus, und der Rechner säße auf der falschen
 * Seite.
 */
export function objektStruktur(objekt: ObjektData): ObjektStruktur {
  if (istGlobalobjekt(objekt)) return "globalobjekt";
  const einzeln = !!(objekt.meta as { einzelwohnung?: boolean } | undefined)?.einzelwohnung;
  if (einzeln || (objekt.wohnungen?.length ?? 0) <= 1) return "einzelwohnung";
  return "mehrere_einheiten";
}

/**
 * Die Anlageklasse eines Objekts, sofern gepflegt.
 *
 * Liegt in `meta.anlageklasse`. Dasselbe Feld hängt bereits als Badge an der
 * Objektkachel und steuert den Filter darüber, es ist also die Angabe, die
 * im Alltag ohnehin gepflegt wird.
 *
 * Ein Objekt ohne Angabe liefert null statt einer geratenen Einordnung. Eine
 * falsche Zahl in einer Portfolioübersicht ist schlechter als eine fehlende,
 * weil man der fehlenden ansieht, dass sie fehlt.
 */
export function objektAnlageklasse(objekt: ObjektData): Anlageklasse | null {
  const roh = (objekt.meta as { anlageklasse?: string } | undefined)?.anlageklasse;
  return roh && roh.trim() ? roh.trim() : null;
}

/**
 * Die Anlageklasse passend zum Schalter „Globalobjekt“.
 *
 * Der Schalter ist die Wahrheit. Ist er an, heißt die Klasse „Globalobjekt“.
 * Ist er aus, kann sie nicht „Globalobjekt“ heißen und bleibt leer, bis eine
 * andere gewählt ist. Jede andere Klasse bleibt, wie sie ist.
 */
export function anlageklasseZumSchalter(anlageklasse: string | null | undefined, globalObjekt: boolean): string {
  if (globalObjekt) return GLOBALOBJEKT_ANLAGEKLASSE;
  const klasse = (anlageklasse || "").trim();
  return istGlobalAnlageklasse(klasse) ? "" : klasse;
}

/**
 * Wie sich die Anlageklasse in der Objektanlage pflegen lässt.
 *
 *   investagon     Das Objekt kommt aus Investagon, dort wird die Klasse
 *                  geführt (Christian, 23.09.2026). Im CRM nur Anzeige.
 *   haus_gebunden  Ein Globalobjekt, an dem im CRM ein Kunde hängt
 *                  (reserviert, verkauft oder zur Unterschrift vorgemerkt).
 *                  Es bleibt Globalobjekt, dieselbe Regel wie im Import.
 *   frei           Von Hand angelegt: wählbar, und Pflicht.
 *
 * Die Herkunft kommt aus `meta.investagonSlug`, wie auf der Objektseite
 * (`investagonStand`). Genau an dieser Kennung schreibt der Import die Klasse.
 */
export type AnlageklassenPflege = "investagon" | "haus_gebunden" | "frei";

export function anlageklassePflege(
  objekt: Pick<ObjektData, "meta" | "globalObjekt" | "belegung" | "belegungKundeId" | "vorgemerktBis"> | null | undefined,
): AnlageklassenPflege {
  if (!objekt) return "frei";
  if (investagonStand(objekt).ausInvestagon) return "investagon";
  if (
    istGlobalobjekt(objekt)
    && hausImCrmGebunden({ belegung: objekt.belegung, belegung_kunde_id: objekt.belegungKundeId, vorgemerkt_bis: objekt.vorgemerktBis })
  ) {
    return "haus_gebunden";
  }
  return "frei";
}

/** Warum die Anlageklasse eines Investagon-Objekts hier nicht zu ändern ist. */
export const ANLAGEKLASSE_INVESTAGON_HINWEIS =
  "Kommt aus Investagon und wird dort gepflegt. Ändern lässt sie sich nur in Investagon.";

/** Warum ein reserviertes Haus Globalobjekt bleibt. */
export const ANLAGEKLASSE_HAUS_GEBUNDEN_HINWEIS =
  "Das Haus ist im CRM reserviert oder vorgemerkt. Solange das so ist, bleibt es ein Globalobjekt.";

/** Der Bauzustand, etwa Neubau oder Kernsanierung. Liegt in den Globaldaten. */
export function objektBauzustand(objekt: ObjektData): string | null {
  const roh = (objekt.globalDaten as { zustand?: string } | undefined)?.zustand;
  return roh && roh.trim() ? roh.trim() : null;
}

export interface PortfolioKennzahlen {
  objekte: number;
  einheiten: number;
  /** Summe aller Einheitenkaufpreise. */
  portfoliowert: number;
  /** Günstigste und teuerste Einheit im Bestand. */
  preisVon: number;
  preisBis: number;
  struktur: Record<ObjektStruktur, number>;
  /** Anlageklassen mit ihrer Anzahl, absteigend nach Häufigkeit. */
  anlageklassen: Array<[string, number]>;
  /** Bauzustände mit ihrer Anzahl, absteigend nach Häufigkeit. */
  bauzustaende: Array<[string, number]>;
  /** Objekte ohne gepflegte Anlageklasse. Wird ausgewiesen statt verschwiegen. */
  klasseOffen: number;
}

/**
 * Kennzahlen über den gesamten sichtbaren Bestand.
 *
 * Gezählt werden Objekte für die Klassen und Einheiten für Menge und Wert.
 * Der Portfoliowert summiert die Einheitenpreise, nicht die Objektpreise:
 * Bei einem Objekt mit sechs Einheiten steht am Objekt selbst kein Preis,
 * und ein Globalobjekt trägt seinen Gesamtpreis ohnehin auf seiner einen
 * oder auf allen Einheiten.
 */
export function portfolioKennzahlen(objekte: ObjektData[]): PortfolioKennzahlen {
  const k: PortfolioKennzahlen = {
    objekte: objekte.length,
    einheiten: 0,
    portfoliowert: 0,
    preisVon: 0,
    preisBis: 0,
    struktur: { globalobjekt: 0, einzelwohnung: 0, mehrere_einheiten: 0 },
    anlageklassen: [],
    bauzustaende: [],
    klasseOffen: 0,
  };

  const preise: number[] = [];
  const klassen = new Map<string, number>();
  const zustaende = new Map<string, number>();

  for (const o of objekte) {
    k.struktur[objektStruktur(o)]++;

    const klasse = objektAnlageklasse(o);
    if (klasse) klassen.set(klasse, (klassen.get(klasse) || 0) + 1);
    else k.klasseOffen++;

    const zustand = objektBauzustand(o);
    if (zustand) zustaende.set(zustand, (zustaende.get(zustand) || 0) + 1);

    for (const w of o.wohnungen || []) {
      k.einheiten++;
      const p = Number(w.vkGesamt) || 0;
      if (p > 0) {
        k.portfoliowert += p;
        preise.push(p);
      }
    }
  }

  if (preise.length > 0) {
    k.preisVon = Math.min(...preise);
    k.preisBis = Math.max(...preise);
  }

  // Häufigstes zuerst, bei Gleichstand alphabetisch, damit die Reihenfolge
  // zwischen zwei Aufrufen nicht springt.
  const sortiert = (m: Map<string, number>): Array<[string, number]> =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
  k.anlageklassen = sortiert(klassen);
  k.bauzustaende = sortiert(zustaende);

  return k;
}
