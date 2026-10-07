/**
 * Die Rohdaten aus Investagon auswerten.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Der Import legt zu jedem Objekt und zu jeder Einheit den vollstaendigen
 * Originaldatensatz unter `meta.investagonRaw` ab. Gelesen haben wir davon
 * bisher ein einziges Feld, naemlich `statusName` in `einheitBelegung.ts`.
 * Alles andere liegt seit Monaten ungenutzt in der Datenbank: die Freitexte zum
 * Objekt, die Merkmalsliste, die Grundrisse, der Energieausweis, die Heizung.
 * Wir muessen es nicht beschaffen, wir muessen es nur lesen.
 *
 * Diese Datei macht das an einer Stelle, damit Objektseite, Einheitenseite und
 * Exposé dieselbe Auslegung benutzen. Waeren es drei Auslegungen, wuerden sie
 * auseinanderlaufen, und der Kunde saehe im Exposé etwas anderes als der
 * Berater auf dem Bildschirm.
 *
 * WAS BEIM LESEN VON FREMDDATEN GILT
 *
 * Investagon ist nicht unser System. Felder koennen fehlen, null sein, ihren
 * Typ wechseln oder unangekuendigt verschwinden. Deshalb wirft hier keine
 * Funktion, und keine rechnet etwas hoch, was nicht dasteht. Fehlt ein Wert,
 * kommt `undefined` oder eine leere Liste zurueck, und die Oberflaeche zeigt
 * die Zeile einfach nicht an. Eine fehlende Angabe faellt niemandem auf, eine
 * erfundene kostet uns die Glaubwuerdigkeit, und bei Energieausweis und
 * Baujahr im Zweifel mehr als das.
 *
 * ZAHLEN VOM 16.09.2026, aus der Datenbank gezaehlt (332 Einheiten,
 * 45 Objekte): `energy_efficiency_class` ist fast immer null, die Klasse
 * steht stattdessen im Merkmalstext `tags`. `object_renovation_year` ist
 * meist null. `extras` ist am Objekt oft ein leeres Array.
 */

/** Was diese Datei von einem Objekt oder einer Einheit braucht. */
export interface MitInvestagonRohdaten {
  meta?: Record<string, unknown> | null;
}

/** Der Originaldatensatz von Investagon. Jedes Feld ist ungeprueft. */
export type InvestagonRohdaten = Record<string, unknown>;

/** Ein Eintrag aus der Merkmalsliste `tags`. */
export interface Merkmal {
  /**
   * Die fuehrende Nummer aus dem Text, etwa die 5 aus
   * "5. Energieeffizienzklasse: C". Sie legt die Reihenfolge fest. Angezeigt
   * wird sie nicht selbst, sondern fortlaufend neu gezaehlt
   * (`nummeriereMerkmale`), weil gesperrte Eintraege sonst Luecken reissen.
   */
  nummer?: number;
  bezeichnung: string;
  /** Leer, wenn der Text keinen Doppelpunkt hat und damit nur eine Aussage ist. */
  wert: string;
}

/** Eine Datei aus `files`, fuer die Anzeige aufbereitet. */
export interface InvestagonDokument {
  id: string;
  titel: string;
  /** Der Rohwert von Investagon, etwa "layout". Zum Filtern. */
  kategorie: string;
  /** Der deutsche Name, etwa "Grundriss". Zum Anzeigen. */
  kategorieLabel: string;
  url: string;
  dateiname: string;
  geaendertAm?: string;
}

/** Eine Zeile der Objektangaben. */
export interface Detailzeile {
  label: string;
  wert: string;
}

/* ------------------------------------------------------------------ */
/* Kleine Helfer. Bewusst privat: sie sind nur wegen der Fremddaten da. */
/* ------------------------------------------------------------------ */

function istObjekt(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Ein Array oder nichts. Erspart jeder Funktion die Array-Pruefung. */
function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Ein Wert als brauchbarer Text, sonst `undefined`.
 *
 * Leerstring und Leerzeichen gelten als "nicht da". Investagon liefert beides
 * anstelle von null, und eine Zeile "Etage:" ohne Angabe sieht nach einem
 * Fehler unserer Seite aus.
 */
function text(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Eine Zahl, auch wenn sie als Text kommt. Investagon wechselt hier den Typ. */
function zahl(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const bereinigt = v.trim().replace(",", ".");
    if (!bereinigt) return undefined;
    const n = Number(bereinigt);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Deutsche Schreibweise, ohne aufgezwungene Nachkommastellen. */
function deutscheZahl(n: number, maxNachkomma: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: maxNachkomma });
}

/**
 * Eine Jahreszahl, aber nur eine plausible.
 *
 * Ohne die Spanne wuerde aus einer 0 im Datensatz das "Baujahr 0". Und ein
 * Jahr bekommt keinen Tausenderpunkt, sonst steht da 1.965.
 */
function jahr(v: unknown): string | undefined {
  const n = zahl(v);
  if (n === undefined || n < 1000 || n > 2100) return undefined;
  return String(Math.trunc(n));
}

/** Ein Prozentwert, nur wenn er groesser als null ist. */
function prozent(v: unknown, maxNachkomma: number): string | undefined {
  const n = zahl(v);
  if (n === undefined || n <= 0) return undefined;
  return `${deutscheZahl(n, maxNachkomma)} %`;
}

/* ------------------------------------------------------------------ */
/* 1. Der Zugang zu den Rohdaten                                       */
/* ------------------------------------------------------------------ */

/**
 * Der Originaldatensatz, falls dieser Eintrag aus Investagon stammt.
 *
 * Alle anderen Funktionen gehen hierdurch. Damit gibt es genau eine Stelle,
 * die wissen muss, wo der Import die Daten ablegt.
 */
export function rohdaten(
  d: MitInvestagonRohdaten | null | undefined,
): InvestagonRohdaten | undefined {
  if (!d || typeof d !== "object") return undefined;
  const meta = d.meta;
  if (!istObjekt(meta)) return undefined;
  const roh = meta.investagonRaw;
  return istObjekt(roh) ? roh : undefined;
}

/* ------------------------------------------------------------------ */
/* 2. Freitexte                                                        */
/* ------------------------------------------------------------------ */

/**
 * Die Freitexte aus `extras`, in der Reihenfolge, die Investagon vorgibt.
 *
 * `weight` ist keine Gewichtung im Sinne von Wichtigkeit, sondern schlicht die
 * Sortiernummer des Absatzes. Eintraege ohne brauchbares `weight` kommen ans
 * Ende, statt die vorhandene Ordnung durcheinanderzubringen.
 */
export function beschreibungsTexte(d: MitInvestagonRohdaten | null | undefined): string[] {
  const roh = rohdaten(d);
  if (!roh) return [];
  return liste(roh.extras)
    .map((eintrag) => {
      // Manche Datensaetze fuehren die Extras als einfache Textliste.
      if (typeof eintrag === "string") {
        return { wert: text(eintrag), gewicht: Number.MAX_SAFE_INTEGER };
      }
      if (!istObjekt(eintrag)) return { wert: undefined, gewicht: 0 };
      return {
        wert: text(eintrag.value),
        gewicht: zahl(eintrag.weight) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((e): e is { wert: string; gewicht: number } => !!e.wert)
    .sort((a, b) => a.gewicht - b.gewicht)
    .map((e) => e.wert);
}

/* ------------------------------------------------------------------ */
/* 3. Merkmalsliste                                                    */
/* ------------------------------------------------------------------ */

/** Die fuehrende Nummer eines Merkmals, etwa "5. " oder "5) ". */
const MERKMAL_NUMMER = /^\s*(\d{1,3})\s*[.)]\s+/;
/** Dieselbe Nummer ohne Leerzeichen danach, etwa "4.Küche". Gilt nur in der Folge, siehe `fuehrendeNummer`. */
const MERKMAL_NUMMER_OHNE_ABSTAND = /^\s*(\d{1,3})\s*[.)](?=\S)/;

/**
 * Die Nummer am Anfang eines Merkmals, oder `undefined`.
 *
 * Mit Leerzeichen danach ("5. ") ist es immer eine Nummer. Ohne Leerzeichen
 * ist es nur dann eine, wenn sie genau die naechste der Liste ist: Investagon
 * schreibt "1.Hoher Erhaltungsaufwand" und "3.500m von neuer U5 entfernt"
 * (Nummer 3, 500 m). Steht dagegen "45.000 € Zuschuss" oder als erstes
 * Merkmal "1.500 € Zuschuss" da, ist das ein Tausenderpunkt und bleibt Text.
 * Deshalb zaehlt eine Nummer, auf die eine Ziffer folgt, erst ab der zweiten
 * Stelle einer schon nummerierten Liste.
 */
function fuehrendeNummer(eintrag: string, erwartet: number): { nummer: number; laenge: number } | undefined {
  const mitAbstand = MERKMAL_NUMMER.exec(eintrag);
  if (mitAbstand) return { nummer: Number(mitAbstand[1]), laenge: mitAbstand[0].length };
  const ohne = MERKMAL_NUMMER_OHNE_ABSTAND.exec(eintrag);
  if (!ohne || Number(ohne[1]) !== erwartet) return undefined;
  const folgtZiffer = /\d/.test(eintrag.charAt(ohne[0].length));
  if (folgtZiffer && erwartet === 1) return undefined;
  return { nummer: erwartet, laenge: ohne[0].length };
}

/**
 * Die Merkmalsliste `tags`, zerlegt in Bezeichnung und Wert.
 *
 * Aus "5. Energieeffizienzklasse: C" wird
 * `{ nummer: 5, bezeichnung: "Energieeffizienzklasse", wert: "C" }`.
 *
 * Getrennt wird am ERSTEN Doppelpunkt, denn er trennt Bezeichnung und Wert;
 * jeder weitere gehoert zum Wert. Ein Merkmal ohne Doppelpunkt ist eine
 * Aussage fuer sich, etwa der abzugsfaehige Erhaltungsaufwand mit seiner
 * Preisspanne. Es kommt vollstaendig als Bezeichnung durch, damit nichts
 * verlorengeht.
 */
export function merkmale(d: MitInvestagonRohdaten | null | undefined): Merkmal[] {
  const roh = rohdaten(d);
  if (!roh) return [];
  let letzteNummer = 0;
  return liste(roh.tags)
    .map((t) => text(t))
    .filter((t): t is string => !!t)
    .map((eintrag): Merkmal => {
      const treffer = fuehrendeNummer(eintrag, letzteNummer + 1);
      const nummer = treffer?.nummer;
      if (nummer !== undefined) letzteNummer = nummer;
      // Die Nummer zaehlt die Anzeige neu, also gehoert sie nicht in den Text.
      const ohneNummer = treffer ? eintrag.slice(treffer.laenge) : eintrag;
      const doppelpunkt = ohneNummer.indexOf(":");
      if (doppelpunkt < 0) {
        return { nummer, bezeichnung: ohneNummer.trim(), wert: "" };
      }
      return {
        nummer,
        bezeichnung: ohneNummer.slice(0, doppelpunkt).trim(),
        wert: ohneNummer.slice(doppelpunkt + 1).trim(),
      };
    })
    .filter((m) => !!m.bezeichnung)
    .sort(
      (a, b) =>
        (a.nummer ?? Number.MAX_SAFE_INTEGER) - (b.nummer ?? Number.MAX_SAFE_INTEGER),
    );
}

/**
 * Der Wert eines Merkmals, gesucht ueber die Bezeichnung.
 *
 * Ohne Ruecksicht auf Gross- und Kleinschreibung, weil die Schreibweise in den
 * Rohdaten von Objekt zu Objekt schwankt. Ein Merkmal ohne Wert zaehlt als
 * nicht gefunden: Ein Leerstring wuerde sonst als vorhandene Angabe
 * durchgereicht.
 */
export function merkmalWert(
  d: MitInvestagonRohdaten | null | undefined,
  bezeichnung: string,
): string | undefined {
  const gesucht = typeof bezeichnung === "string" ? bezeichnung.trim().toLowerCase() : "";
  if (!gesucht) return undefined;
  const treffer = merkmale(d).find((m) => m.bezeichnung.toLowerCase() === gesucht);
  return treffer?.wert || undefined;
}

/**
 * Merkmale, die nie in Exposé, Kundenansicht oder PDF gehören.
 *
 * Christian am 24.09.2026. Investagon mischt in `tags` drei Arten von
 * Einträgen, die für einen Kunden entweder nichts sagen oder schon an
 * anderer, gepflegter Stelle stehen:
 *
 *   Beliebtheit  „Viele Klicks“, „Viele ♡“, „Beliebt“. Das ist die Statistik
 *                der Investagon-Oberfläche, keine Eigenschaft der Wohnung.
 *   Etage, Lage  „Erdgeschoss Links“, „3.OG Links“. Die Lage im Gebäude
 *                steht strukturiert in den Objektdaten. Beim Haus stand
 *                zusätzlich die Etage einer einzelnen Wohnung, weil der Import
 *                dem Objekt die Liste einer Einheit gegeben hat.
 *   AfA-Satz     „3.5% Afa“. Die Abschreibung rechnet das CRM selbst und
 *                zeigt sie mit Herkunft; ein zweiter, ungeprüfter Satz daneben
 *                wäre eine Angabe, an der uns ein Käufer festhalten kann.
 *
 * Geprüft wird der ganze Text, also Bezeichnung und Wert zusammen, denn
 * Investagon schreibt dieselbe Aussage mal mit, mal ohne Doppelpunkt.
 */
const GESPERRTE_MERKMALE: RegExp[] = [
  // Beliebtheit. „Herz“ nur als Symbol oder als „viele Herzen“, damit
  // „im Herzen der Altstadt“ stehen bleibt.
  /klicks?\b/i,
  /♡|♥|❤|\bviele\s+herzen\b/i,
  /\bbeliebt|\bfavorit|\btop[- ]?seller|\bmeistgesehen|\bhohe\s+nachfrage/i,
  // Etage und Lage im Gebäude
  /\b(erd|dach|unter|ober|keller|sout(?:t)?errain|hoch)geschoss/i,
  /\b(eg|ug|dg|og)\b/i,
  /\d+\s*\.?\s*(og|ug|obergeschoss|etage|stock)\b/i,
  /\betage\b|\bstockwerk|\bgeschoss\b/i,
  /^(links|rechts|mitte|vorne|hinten|vorderhaus|hinterhaus)(\s+(links|rechts|mitte|vorne|hinten))?$/i,
  // AfA-Satz: nur mit Zahl. „Denkmal-AfA möglich“ ohne Satz bleibt stehen.
  /\bafa\b.*\d|\d.*\bafa\b/i,
];

/** Darf dieses Merkmal im Exposé, in der Kundenansicht und im PDF stehen? */
export function istAnzeigbaresMerkmal(m: Merkmal): boolean {
  const ganz = [m.bezeichnung, m.wert].filter(Boolean).join(" ").trim();
  if (!ganz) return false;
  return !GESPERRTE_MERKMALE.some((muster) => muster.test(ganz));
}

/**
 * Dezimalpunkte aus Investagon in die deutsche Schreibweise bringen.
 *
 * „2.5 Zimmer“ wird „2,5 Zimmer“, „4.25 %“ wird „4,25 %“. Ein Punkt vor genau
 * drei Ziffern bleibt, das ist der Tausenderpunkt in „20.000 €“. Ein Punkt
 * vor einem Buchstaben („3.OG“) ist keine Zahl und bleibt ebenfalls.
 */
export function deutscheDezimalstellen(text: string): string {
  return text.replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2");
}

/**
 * Die Nummern fuer die Anzeige, fortlaufend ab 1 und immer mit Leerzeichen
 * nach dem Punkt: „1. Hoher Erhaltungsaufwand“ (Christian, 05.10.2026).
 *
 * Gezaehlt wird neu und nicht mit Investagons Nummer, denn gesperrte
 * Merkmale (etwa der AfA-Satz an Stelle 2) fallen vorher heraus, und die
 * Liste spraenge sonst von 1 auf 3. Nur Merkmale, die in den Rohdaten eine
 * Nummer haben, bekommen eine; die uebrigen stehen ohne darunter.
 */
export function nummeriereMerkmale(liste: Merkmal[]): Merkmal[] {
  let n = 0;
  return liste.map((m) => (m.nummer === undefined ? m : { ...m, bezeichnung: `${++n}. ${m.bezeichnung}` }));
}

/**
 * Die Merkmale fertig zum Anzeigen: ohne die gesperrten, mit deutschen
 * Dezimalstellen. `merkmale` selbst bleibt unverändert, weil andere Stellen
 * darin nach Aufzug, Mietmodell oder Verwaltung suchen.
 */
export function anzeigbareMerkmale(d: MitInvestagonRohdaten | null | undefined): Merkmal[] {
  return merkmale(d)
    .filter(istAnzeigbaresMerkmal)
    .map((m) => ({ ...m, bezeichnung: deutscheDezimalstellen(m.bezeichnung), wert: deutscheDezimalstellen(m.wert) }));
}

/* ------------------------------------------------------------------ */
/* 4. Energieausweis                                                   */
/* ------------------------------------------------------------------ */

/** A+ bis H. Alles andere ist keine Effizienzklasse. */
const EFFIZIENZKLASSE = /^(A\+|[A-H])$/;

/**
 * Die Energieeffizienzklasse, sofern sie sich belegen laesst.
 *
 * Erst das eigene Feld, dann die Merkmalsliste. Das Feld ist fast immer null,
 * die Klasse steht in der Praxis im Merkmalstext.
 *
 * Zurueck kommt nur, was wirklich wie eine Klasse aussieht. Eine falsche
 * Energieeffizienzklasse im Exposé ist eine Angabe, an der ein Kaeufer uns
 * festhalten kann. Lieber keine Angabe als eine erfundene, deshalb fallen
 * Werte wie "unbekannt" oder "wird ermittelt" hier heraus.
 */
export function energieeffizienzklasse(
  d: MitInvestagonRohdaten | null | undefined,
): string | undefined {
  const kandidaten = [
    text(rohdaten(d)?.energy_efficiency_class),
    merkmalWert(d, "Energieeffizienzklasse"),
  ];
  for (const kandidat of kandidaten) {
    const geprueft = kandidat?.trim().toUpperCase();
    if (geprueft && EFFIZIENZKLASSE.test(geprueft)) return geprueft;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* 5. Dokumente                                                        */
/* ------------------------------------------------------------------ */

/** Die Kategorien, die Investagon vergibt, auf Deutsch. */
const KATEGORIE_LABEL: Record<string, string> = {
  declaration_of_division: "Teilungserklärung",
  economic_plan: "Wirtschaftsplan",
  energy_certificate: "Energieausweis",
  expose: "Exposé",
  land_register: "Grundbuchauszug",
  layout: "Grundriss",
  living_area_calculation: "Wohnflächenberechnung",
  other_object: "Sonstiges",
  rental_agreement: "Mietvertrag",
  settlements: "Betriebskostenabrechnung",
  site_plan: "Lageplan",
};

/** Dateiendungen, die sich als Bild einbetten lassen. */
const BILD_ENDUNGEN = [".jpg", ".jpeg", ".png", ".webp"];

/** Der Dateiname aus einer Adresse, ohne Abfrageteil und Sprungmarke. */
function dateinameAusUrl(url: string): string {
  const ohneZusatz = url.split(/[?#]/)[0];
  const letztes = ohneZusatz.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(letztes);
  } catch {
    // Kaputte Prozentzeichen in der Adresse duerfen die Liste nicht sprengen.
    return letztes;
  }
}

function istBilddatei(...kandidaten: string[]): boolean {
  return kandidaten.some((k) => {
    const klein = k.split(/[?#]/)[0].toLowerCase();
    return BILD_ENDUNGEN.some((endung) => klein.endsWith(endung));
  });
}

/**
 * Die Dateien aus `files`, fuer die Anzeige aufbereitet.
 *
 * `filename` enthaelt die vollstaendige Adresse, nicht nur den Namen. Eintraege
 * ohne Adresse fallen weg: Ein Dokument, das sich nicht oeffnen laesst, ist in
 * einer Dokumentenliste nur ein Aerger.
 *
 * Sortiert wird nach `position`, das ist die Reihenfolge, die der
 * Objektpartner in Investagon selbst festgelegt hat.
 */
export function dokumente(
  d: MitInvestagonRohdaten | null | undefined,
): InvestagonDokument[] {
  const roh = rohdaten(d);
  if (!roh) return [];
  return liste(roh.files)
    .map((datei, index) => {
      if (!istObjekt(datei)) return undefined;
      // Bewusst nur ein echter Text: Eine Zahl als Adresse waere ein toter Link.
      const url = typeof datei.filename === "string" ? datei.filename.trim() : "";
      if (!url) return undefined;
      const kategorie = text(datei.category) ?? "";
      const dateiname = text(datei.original_filename) ?? dateinameAusUrl(url);
      return {
        position: zahl(datei.position) ?? Number.MAX_SAFE_INTEGER,
        dokument: {
          id: text(datei.id) ?? `${kategorie || "datei"}-${index}`,
          titel: text(datei.title) ?? dateiname,
          kategorie,
          // Unbekannte Kategorien behalten ihren Rohwert. Er sagt mehr als ein
          // leeres Feld, und ein neuer Investagon-Typ faellt so gleich auf.
          kategorieLabel: KATEGORIE_LABEL[kategorie] ?? (kategorie || "Sonstiges"),
          url,
          dateiname,
          geaendertAm: text(datei.updated_at) ?? text(datei.created_at),
        } satisfies InvestagonDokument,
      };
    })
    // `NonNullable<typeof x>` statt eines ausgeschriebenen Typs: Der Eintrag
    // wird oben mit `satisfies` gebaut, und `geaendertAm` ist dort optional.
    // Ein von Hand wiederholter Typ behauptete es als Pflichtfeld und lief
    // deshalb auseinander (TS2677).
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.position - b.position)
    .map((x) => x.dokument);
}

/**
 * Die Grundrisse, Bilder zuerst.
 *
 * Ein Bild laesst sich im Exposé und auf der Einheitenseite direkt zeigen, ein
 * PDF nur verlinken. Wer nur einen Grundriss braucht, nimmt also den ersten
 * und bekommt das, was sich anzeigen laesst.
 */
export function grundrisse(
  d: MitInvestagonRohdaten | null | undefined,
): InvestagonDokument[] {
  return dokumente(d)
    .filter((dok) => dok.kategorie === "layout")
    .sort(
      (a, b) =>
        Number(!istBilddatei(a.url, a.dateiname)) -
        Number(!istBilddatei(b.url, b.dateiname)),
    );
}

/* ------------------------------------------------------------------ */
/* 6. Einzelfelder im Klartext                                         */
/* ------------------------------------------------------------------ */

const HEIZUNG_LABEL: Record<string, string> = {
  district_heating: "Fernwärme",
  electric: "Strom",
  gas: "Gas",
  heat_pump: "Wärmepumpe",
  oil: "Öl",
  pellet: "Pellets",
  solar: "Solar",
};

/**
 * Die Arten des Energieausweises. Investagon schreibt den Bedarfsausweis
 * heute als `requirement_certificate`; `demand_certificate` stand in älteren
 * Datensätzen. Beide Schreibweisen bleiben, damit kein Rohwert durchrutscht.
 */
const AUSWEISART_LABEL: Record<string, string> = {
  consumption_certificate: "Verbrauchsausweis",
  energy_consumption_certificate: "Verbrauchsausweis",
  consumption: "Verbrauchsausweis",
  demand_certificate: "Bedarfsausweis",
  requirement_certificate: "Bedarfsausweis",
  energy_demand_certificate: "Bedarfsausweis",
  energy_requirement_certificate: "Bedarfsausweis",
  demand: "Bedarfsausweis",
  requirement: "Bedarfsausweis",
};

/**
 * Die Heizungsart auf Deutsch.
 *
 * Unbekannte Schluessel kommen unveraendert durch. Investagon kann jederzeit
 * eine Art ergaenzen, und dann ist "district_heating_new" auf dem Bildschirm
 * immer noch besser als eine verschwundene Zeile.
 */
export function heizungText(d: MitInvestagonRohdaten | null | undefined): string | undefined {
  const roh = text(rohdaten(d)?.heating_type);
  if (!roh) return undefined;
  return HEIZUNG_LABEL[roh.toLowerCase()] ?? roh;
}

/**
 * Der Miteigentumsanteil der Einheit, etwa "2,345 %".
 *
 * `object_share_owner` wird wie in `objektDetails` als Prozentwert gelesen.
 * Beide Stellen gehen hierdurch, damit Einheitsseite und Objektangaben nicht
 * zwei Auslegungen derselben Zahl zeigen.
 */
export function miteigentumsanteilText(
  d: MitInvestagonRohdaten | null | undefined,
): string | undefined {
  return prozent(rohdaten(d)?.object_share_owner, 3);
}

/** Die Art des Energieausweises auf Deutsch, unbekannte Werte unveraendert. */
export function ausweisartText(
  d: MitInvestagonRohdaten | null | undefined,
): string | undefined {
  const roh = text(rohdaten(d)?.energy_certificate_type);
  if (!roh) return undefined;
  return AUSWEISART_LABEL[roh.toLowerCase()] ?? roh;
}

/**
 * Ob ein Balkon vorhanden ist.
 *
 * Ein `false` gilt bewusst als "nicht erfasst" und nicht als "kein Balkon".
 * In den Rohdaten steht bei nicht gepflegten Einheiten dasselbe `false` wie
 * bei tatsaechlich balkonlosen, und "Balkon: Nein" waere dann eine Aussage,
 * die wir nicht belegen koennen. Ein Text wie "Loggia" kommt durch.
 */
function balkonText(v: unknown): string | undefined {
  if (typeof v === "boolean") return v ? "Ja" : undefined;
  const roh = text(v);
  if (!roh) return undefined;
  const klein = roh.toLowerCase();
  if (klein === "0" || klein === "false" || klein === "nein") return undefined;
  if (klein === "1" || klein === "true" || klein === "ja") return "Ja";
  return roh;
}

/* ------------------------------------------------------------------ */
/* 7. Die Objektangaben als fertige Liste                              */
/* ------------------------------------------------------------------ */

/**
 * Die Objektangaben, fertig zum Anzeigen.
 *
 * Nur gefuellte Zeilen. Eine Tabelle mit zehn Strichen sieht nach einem
 * kaputten System aus, drei belegte Angaben sehen nach drei belegten Angaben
 * aus. Die Reihenfolge ist fest und geht vom Gebaeude zur Einheit und zuletzt
 * zu den Anteilen, damit dieselbe Angabe auf jeder Seite an derselben Stelle
 * steht.
 */
export function objektDetails(d: MitInvestagonRohdaten | null | undefined): Detailzeile[] {
  const roh = rohdaten(d);
  if (!roh) return [];
  const zeilen: Detailzeile[] = [];
  const nimm = (label: string, wert: string | undefined) => {
    if (wert) zeilen.push({ label, wert });
  };

  nimm("Baujahr", jahr(roh.object_building_year));
  nimm("Sanierungsjahr", jahr(roh.object_renovation_year));
  nimm("Heizung", heizungText(d));
  nimm("Energieausweis", ausweisartText(d));
  nimm("Energieeffizienzklasse", energieeffizienzklasse(d));
  // `property_kind` ist die Einordnung des Objekts („Sanierung“, „Neubau“),
  // keine Art der Wohnung. Unter „Objektart“ stand im Exposé deshalb
  // „Objektart: Sanierung“. Die Wohnungsart (`object_apartment_type`) liefert
  // Investagon als unübersetzten Schlüssel, sie bleibt deshalb draußen.
  nimm("Objektkategorie", text(roh.property_kind));
  nimm("Nutzungsart", text(roh.property_usage));
  nimm("Etage", text(roh.object_floor));
  nimm("Balkon", balkonText(roh.object_balcony));
  nimm("Miteigentumsanteil", miteigentumsanteilText(d));
  nimm("Grunderwerbsteuer", prozent(roh.transaction_tax_rate, 2));

  return zeilen;
}
