/**
 * Was das Exposé zusaetzlich aus den Investagon-Rohdaten holt.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `baueExposeInhalt` in `src/lib/exposeInhalt.ts` kennt nur die gepflegten
 * CRM-Felder. Der Investagon-Import legt daneben den vollstaendigen
 * Originaldatensatz unter `meta.investagonRaw` ab, ausgelesen wird er in
 * `src/lib/investagonFelder.ts`. Diese Datei bringt beides zusammen: Sie
 * ergaenzt den fertigen Exposé-Inhalt um das, was dort noch fehlt, und
 * ueberschreibt dabei nie eine gepflegte Angabe.
 *
 * GRUNDRISSE KOMMEN NICHT MEHR VON HIER (seit dem 23.09.2026)
 *
 * Bis dahin suchte diese Datei die Investagon-Dateien der Kategorie `layout`
 * und haengte deren Adresse an. Das war die importierte Kopie als Zeiger
 * `/investagon-dokument/…`, den der Browser nicht oeffnen kann, oder die
 * Originaladresse bei Investagon. Das Exposé zeigte dann ein zerbrochenes
 * Bild, und das PDF sah den Plan nie.
 *
 * Seitdem waehlt `grundrisseFuerExpose` in `src/lib/exposeInhalt.ts` die
 * Plaene aus den Unterlagen im CRM, nach derselben Regel wie der Kundenlink
 * (`supabase/functions/_shared/grundriss-erkennung.ts`). Das Feld
 * `grundrisse` bleibt fuer den Kundenlink: Dort kommen die Plaene als vom
 * Server gepruefte Liste mit befristeter Adresse (`ExposePublic.tsx`).
 */

import {
  anzeigbareMerkmale,
  nummeriereMerkmale,
  beschreibungsTexte,
  objektDetails,
  type Detailzeile,
  type Merkmal,
  type MitInvestagonRohdaten,
} from "@/lib/investagonFelder";
import type { ExposeGrundriss, ExposeInhalt, Kennzahl } from "@/lib/exposeInhalt";
import { EXPOSE_INHALT_TEXTE, katalogwert, zahlenAufEnglisch } from "@/lib/exposeInhaltTexte";
import type { Sprache } from "@/lib/seitenSprache";

export type { ExposeGrundriss };

export interface InvestagonQuellen {
  /** Das Objekt, also der Traeger von `meta.investagonRaw` des Hauses. */
  objekt?: MitInvestagonRohdaten | null;
  /** Die Rohzeile der Einheit aus der Tabelle `wohnungen`, mit ihrem `meta`. */
  einheit?: MitInvestagonRohdaten | null;
  /**
   * Für wen die Angaben sind: eine Wohnung oder das ganze Haus. Ohne Angabe
   * zählt, ob `einheit` belegt ist. Das Exposé einer Wohnung setzt es
   * ausdrücklich, damit eine noch nicht geladene Einheitenzeile nicht
   * stillschweigend die Merkmale des Hauses hereinholt.
   */
  ebene?: "einheit" | "objekt";
  /**
   * Die Sprache der Beschriftungen (Kundensprache, Etappe 3). Ohne Angabe
   * Deutsch. Freitexte und Merkmale aus Investagon bleiben, wie sie sind;
   * übersetzt werden nur unsere Beschriftungen und Katalogwerte.
   */
  sprache?: Sprache;
}

export interface InvestagonErgaenzung {
  /**
   * Nur im Kundenlink belegt: die vom Server gepruefte Liste mit befristeten
   * Adressen. Sie geht dann den Plaenen aus `inhalt.grundriss` vor.
   */
  grundrisse: ExposeGrundriss[];
  /** Die Freitexte zum Objekt, in der Reihenfolge von Investagon. */
  beschreibungen: string[];
  merkmale: Merkmal[];
  /** Objektangaben, die im Exposé noch fehlen. */
  zeilen: Detailzeile[];
}

export const LEERE_ERGAENZUNG: InvestagonErgaenzung = {
  grundrisse: [],
  beschreibungen: [],
  merkmale: [],
  zeilen: [],
};

/**
 * Bezeichnungen, die im Exposé anders heissen als bei Investagon.
 *
 * Ohne diese Zuordnung stuenden "Etage: 2" und "Lage im Gebaeude: 2. OG
 * rechts" als zwei Zeilen untereinander.
 */
/**
 * Die Beschriftungen aus `objektDetails` auf Englisch. Wo das Exposé dieselbe
 * Angabe schon führt (Baujahr), steht dieselbe Beschriftung wie dort, damit
 * `zeilenErgaenzen` die Zeile findet.
 */
export const INVESTAGON_LABELS_EN: Record<string, string> = {
  Baujahr: EXPOSE_INHALT_TEXTE.en.labels.baujahr,
  Sanierungsjahr: "Year of renovation",
  Heizung: "Heating",
  Energieausweis: "Energy certificate",
  Energieeffizienzklasse: "Energy efficiency class",
  Objektkategorie: "Property category",
  Nutzungsart: "Type of use",
  Etage: "Floor",
  Balkon: "Balcony",
  Miteigentumsanteil: "Co-ownership share",
  Grunderwerbsteuer: "Real estate transfer tax (Grunderwerbsteuer)",
};

const LABEL_ZUORDNUNG: Record<string, string> = {
  Etage: EXPOSE_INHALT_TEXTE.de.labels.lageImGebaeude,
  [INVESTAGON_LABELS_EN.Etage]: EXPOSE_INHALT_TEXTE.en.labels.lageImGebaeude,
};

/** Werte, die im Exposé eine leere Zeile bedeuten. */
const LEERWERTE = new Set(["keine angabe", "keiner", "keine", "-", "–", "not specified", "none"]);

function istLeer(wert: string): boolean {
  return LEERWERTE.has((wert || "").trim().toLowerCase());
}

/**
 * Die Objektangaben um die Investagon-Felder ergaenzen.
 *
 * Drei Regeln, in dieser Reihenfolge:
 *   1. Steht die Zeile schon mit einem Wert da, bleibt sie. Die Pflege im CRM
 *      ist die juengere Angabe und geht vor.
 *   2. Steht sie mit "Keine Angabe" da, wird sie gefuellt.
 *   3. Steht der Wert schon woanders in der Tabelle, faellt er weg. Die Art
 *      des Energieausweises etwa steht heute als Zusatz unter der Endenergie.
 */
export function zeilenErgaenzen(vorhandene: Kennzahl[], zusatz: Detailzeile[]): Kennzahl[] {
  const zeilen = vorhandene.map((z) => ({ ...z }));
  const bereitsGenannt = (wert: string) =>
    zeilen.some((z) => z.wert === wert || z.unter === wert || (z.unter ?? "").includes(wert));

  for (const neu of zusatz) {
    const label = LABEL_ZUORDNUNG[neu.label] ?? neu.label;
    const treffer = zeilen.find((z) => z.label === label);
    if (treffer) {
      if (istLeer(treffer.wert)) treffer.wert = neu.wert;
      continue;
    }
    if (bereitsGenannt(neu.wert)) continue;
    zeilen.push({ label, wert: neu.wert });
  }
  return zeilen;
}

/**
 * Energieangaben herausnehmen, die das Exposé schon selbst ausweist.
 *
 * Die Effizienzklasse steht im Exposé als Skala, die Art des Ausweises als
 * Zusatz unter der Endenergie. Beides stammt aus der Objektpflege. Wuerde
 * daneben eine abweichende Angabe aus Investagon stehen, haette das Exposé
 * zwei Wahrheiten zum selben Punkt, und ein Kaeufer koennte sich auf beide
 * berufen. Eine fehlende Angabe ist harmlos, eine widerspruechliche nicht.
 */
export function ohneWidersprueche(
  zeilen: Detailzeile[],
  energie: ExposeInhalt["objektdaten"]["energie"],
): Detailzeile[] {
  return zeilen.filter((z) => {
    if (z.label === "Energieeffizienzklasse" || z.label === INVESTAGON_LABELS_EN.Energieeffizienzklasse) return !energie.klasse;
    if (z.label === "Energieausweis" || z.label === INVESTAGON_LABELS_EN.Energieausweis) return !energie.art;
    return true;
  });
}

/**
 * Die Merkmale genau einer Ebene, ohne Dubletten und ohne gesperrte Einträge.
 *
 * Bis zum 24.09.2026 standen hier die Liste der Einheit und die des Objekts
 * hintereinander. Der Import hat dem Haus aber die Liste einer einzelnen
 * Wohnung gegeben (bei Espanstraße 5 die von Wohnung 11), und der Kunde sah
 * zu einer Wohnung zwei Etagen. Seitdem gilt (Christian): Im Exposé und in der
 * Kundenansicht einer Wohnung stehen nur deren Merkmale, die des Objekts nur
 * im Exposé des ganzen Hauses. Was nie erscheint, regelt
 * `istAnzeigbaresMerkmal` in `investagonFelder.ts`.
 */
function merkmaleSammeln(q: InvestagonQuellen): Merkmal[] {
  const alle = ebeneVon(q) === "einheit" ? anzeigbareMerkmale(q.einheit) : anzeigbareMerkmale(q.objekt);
  const gesehen = new Set<string>();
  // Erst ohne Dubletten, dann nummerieren, sonst entstünden Lücken in der Folge.
  return nummeriereMerkmale(alle.filter((m) => {
    const schluessel = `${m.bezeichnung.toLowerCase()}|${m.wert.toLowerCase()}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  }));
}

function ebeneVon(q: InvestagonQuellen): "einheit" | "objekt" {
  return q.ebene ?? (q.einheit ? "einheit" : "objekt");
}

/**
 * Angaben, die zu genau einer Wohnung gehören. Aus dem Datensatz des Objekts
 * werden sie nie genommen: Dort steht, wie bei den Merkmalen, womöglich die
 * Etage oder der Anteil einer fremden Wohnung.
 */
const NUR_AN_DER_EINHEIT = new Set(["Etage", "Balkon", "Miteigentumsanteil"]);

/** Dieselben Freitexte zweimal zu zeigen, sieht nach einem Fehler aus. */
function beschreibungenSammeln(q: InvestagonQuellen): string[] {
  const alle = [...beschreibungsTexte(q.einheit), ...beschreibungsTexte(q.objekt)];
  const gesehen = new Set<string>();
  return alle.filter((t) => {
    const schluessel = t.trim().toLowerCase();
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
}

/**
 * Alles, was das Exposé zusaetzlich aus Investagon zeigen kann.
 *
 * Angaben der Einheit gehen denen des Objekts vor: Heizung und Etage sind an
 * der Einheit genauer erfasst, Baujahr und Grunderwerbsteuer stehen nur am
 * Objekt. Was nirgends steht, fehlt in der Liste und wird nicht angezeigt.
 */
export function investagonErgaenzung(q: InvestagonQuellen): InvestagonErgaenzung {
  const details = ebeneVon(q) === "einheit" ? objektDetails(q.einheit) : [];
  const vorhandeneLabel = new Set(details.map((z) => z.label));
  for (const zeile of objektDetails(q.objekt)) {
    if (NUR_AN_DER_EINHEIT.has(zeile.label) || vorhandeneLabel.has(zeile.label)) continue;
    details.push(zeile);
  }
  return {
    grundrisse: [],
    beschreibungen: beschreibungenSammeln(q),
    merkmale: merkmaleSammeln(q),
    zeilen: q.sprache === "en" ? details.map(zeileAufEnglisch) : details,
  };
}

/**
 * Eine Zeile aus Investagon auf einer englischen Seite: Beschriftung aus
 * `INVESTAGON_LABELS_EN`, Katalogwerte (Heizung, Ausweisart, Ja) übersetzt,
 * deutsch geschriebene Zahlen umgestellt. Freie Werte bleiben, wie sie sind.
 */
function zeileAufEnglisch(z: Detailzeile): Detailzeile {
  return { ...z, label: INVESTAGON_LABELS_EN[z.label] ?? z.label, wert: zahlenAufEnglisch(katalogwert(z.wert, "en") ?? z.wert) };
}
