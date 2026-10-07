import { mitAdresse, text, zahl } from "./api.ts";
import type { ImportProjekt } from "./daten.ts";
import {
  gueltigeLage,
  KOORDINATEN_META_SCHLUESSEL,
  koordinatenAus,
  type ObjektKoordinaten,
} from "../_shared/objekt-koordinaten.ts";

export function kennung(o: Record<string, unknown>): string {
  return text(o, [
    "api_property_id",
    "api_project_id",
    "id",
    "uuid",
    "slug",
    "@id",
    "externalId",
    "number",
  ]).split("/").filter(Boolean).pop() || "";
}

export function projektKennungVon(o: Record<string, unknown>): string {
  const roh = o.project ?? o.projekt ?? o.projectId ?? o.project_id ??
    o.building ?? o.gebaeude;
  if (typeof roh === "string" || typeof roh === "number") {
    return String(roh).split("/").filter(Boolean).pop() || "";
  }
  if (roh && typeof roh === "object") {
    return kennung(roh as Record<string, unknown>);
  }
  return "";
}

export function einheitAus(o: Record<string, unknown>) {
  const kp = zahl(o, [
    "purchase_price_apartment",
    "purchasePrice",
    "price",
    "kaufpreis",
    "salesPrice",
    "totalPrice",
  ]);
  const qm = zahl(o, [
    "object_size",
    "livingSpace",
    "area",
    "size",
    "wohnflaeche",
    "squareMeters",
  ]);
  const miete = zahl(o, [
    "rent_apartment_month",
    "rent",
    "coldRent",
    "monthlyRent",
    "kaltmiete",
    "miete",
    "rentNet",
  ]);
  const moebel = zahl(o, [
    "purchase_price_furniture",
    "furniturePrice",
    "moebel",
    "furniture",
  ]);
  // Weitere Felder bleiben in den Originaldaten erhalten.
  const sanierungAnteilProzent = zahl(o, [
    "renovationSharePercent",
    "renovationShare",
    "sanierungsanteilProzent",
    "sanierungAnteilProzent",
  ]);
  const sanierungAnteilBetrag = zahl(o, [
    "renovationShareAmount",
    "renovationCosts",
    "sanierungsanteil",
    "sanierungAnteilBetrag",
  ]);
  return {
    investagonId: kennung(o),
    roh: o,
    stellplatzPreis: zahl(o, ["purchase_price_parking"]),
    stellplatzMiete: zahl(o, ["rent_parking_month"]),
    we: text(o, [
      "object_apartment_number",
      "unitNumber",
      "number",
      "name",
      "title",
      "we",
      "label",
    ]) || kennung(o),
    qm,
    zi: zahl(o, ["object_rooms", "rooms", "roomCount", "zimmer"]),
    miete,
    qmPreis: qm > 0 ? Math.round(((kp + moebel) / qm) * 100) / 100 : 0,
    kp,
    moebel,
    geschoss: text(o, ["object_floor", "floor", "etage", "geschoss"]),
    stadtteil: text(o, ["district", "quarter", "stadtteil", "neighbourhood"]) ||
      undefined,
    sanierungsjahr: zahl(o, [
      "object_renovation_year",
      "renovationYear",
      "refurbishmentYear",
      "modernizationYear",
      "sanierungsjahr",
    ]) || undefined,
    sanierungAnteilProzent: sanierungAnteilProzent > 0
      ? sanierungAnteilProzent
      : undefined,
    sanierungAnteilBetrag: sanierungAnteilBetrag > 0
      ? sanierungAnteilBetrag
      : undefined,
  };
}

export function projektAus(
  o: Record<string, unknown>,
  einheiten: ReturnType<typeof einheitAus>[],
): ImportProjekt {
  const a = mitAdresse(o);
  return {
    roh: o,
    slug: kennung(o),
    name: text(o, ["name", "title", "projectName", "bezeichnung"]) ||
      `Investagon ${kennung(o)}`,
    adresse: [
      text(a, [
        "object_street",
        "street",
        "strasse",
        "address",
        "adresse",
        "streetAndNumber",
      ]),
      text(a, ["object_house_number"]),
    ].filter(Boolean).join(" "),
    plz: text(a, ["object_postal_code", "zip", "zipCode", "postalCode", "plz"]),
    ort: text(a, ["object_city", "city", "ort", "town", "stadt"]),
    art: text(o, ["property_usage", "type", "propertyType", "art"]),
    anlageklasse: text(o, [
      "property_usage",
      "assetClass",
      "anlageklasse",
      "category",
    ]),
    bauzustand: text(o, [
      "property_kind",
      "condition",
      "constructionState",
      "bauzustand",
      "status",
    ]),
    baujahr: zahl(o, [
      "object_building_year",
      "constructionYear",
      "buildYear",
      "yearBuilt",
      "baujahr",
    ]) || undefined,
    foerderung: text(o, ["m3_program", "funding", "foerderung", "subsidy"]) ||
      undefined,
    einheiten,
    beschreibung: beschreibungsText(text(o, [
      "object_explanation",
      "description",
      "beschreibung",
      "text",
      "longDescription",
      "wikiPage",
    ])),
  } as ImportProjekt;
}

/**
 * Nur tatsächlich gelieferte Werte schreiben.
 *
 * Die monatliche Rücklagenzuführung (`operation_cost_reserve_apartment`) ist
 * kein Rücklagenbestand und landet deshalb nie in `ruecklageWohnung`. Seit
 * dem 25.09.2026 steht sie als `ruecklageZufuehrungMonat` daneben, der
 * Investmentrechner zählt sie im Cashflow, aber nicht in den Werbungskosten.
 */
export function einheitMeta(
  o: Record<string, unknown>,
): Record<string, unknown> {
  const felder: Record<string, string> = {
    verwaltungWegMonat: "property_management_fee",
    verwaltungSevMonat: "property_management_fee_sev",
    nebenkostenMonat: "rent_operating_costs",
    // Seit dem 05.10.2026, für das Hausgeld gesamt (`_shared/einheit-hausgeld.ts`).
    hausgeldUmlagefaehigEuro: "operation_cost_tenant_apartment",
    hausgeldNichtUmlagefaehigEuro: "operation_cost_landlord_apartment",
    ruecklageZufuehrungMonat: "operation_cost_reserve_apartment",
  };
  const result: Record<string, unknown> = {};
  for (const [ziel, quelle] of Object.entries(felder)) {
    if (o[quelle] != null && o[quelle] !== "") result[ziel] = zahl(o, [quelle]);
  }
  if (typeof o.rented_since === "string") {
    result.vermietetSeit = o.rented_since.slice(0, 10);
  }
  /*
   * Rechenwerte, die niemand im CRM von Hand pflegt: Der Import führt sie.
   * AfA-Satz, Grundanteil und Erhaltungsaufwand stehen dagegen an Spalten,
   * die man bearbeiten kann, und laufen über `rechenwertNachImport`.
   */
  const rechenwerte = rechenwerteAus(o);
  if (rechenwerte.moebelNutzungsdauerJahre !== undefined) {
    result.moebelNutzungsdauerJahre = rechenwerte.moebelNutzungsdauerJahre;
  }
  if (rechenwerte.finanzierungsnebenkostenSatz !== undefined) {
    result.finanzierungsnebenkostenSatz = rechenwerte.finanzierungsnebenkostenSatz;
  }
  return result;
}

/**
 * Die Rechenwerte einer Einheit, wie Investagon sie für seine Kalkulation
 * nimmt. Alle Sätze in Prozent, Beträge in Euro, die Nutzungsdauer in Jahren.
 * Fehlt ein Wert oder ist er unplausibel, bleibt er `undefined`, und der
 * Abgleich schreibt nichts.
 */
export interface InvestagonRechenwerte {
  /** Wirksamer AfA-Satz des Gebäudes in Prozent. */
  afaSatz?: number;
  /** Anteil Grund und Boden am Kaufpreis in Prozent. */
  grundstueckAnteil?: number;
  /** Erhaltungsaufwand im ersten Jahr in Euro, Anteil dieser Einheit. */
  erhaltungsaufwand?: number;
  /** Nutzungsdauer der Möbel in Jahren. */
  moebelNutzungsdauerJahre?: number;
  /** Finanzierungsnebenkosten in Prozent der Darlehenssumme. */
  finanzierungsnebenkostenSatz?: number;
}

/**
 * Eine Zahl aus der API, streng gelesen.
 *
 * Nicht über `zahl()` aus api.ts: Die hält einen Punkt vor genau drei Ziffern
 * für einen Tausenderpunkt und läse den String "0.035" (so liefert Investagon
 * `depreciation_rate_building`) als 35. Rechenwerte kommen als Zahl oder als
 * schlichter Dezimaltext, alles andere gilt als nicht geliefert.
 */
function rechenzahl(wert: unknown): number | undefined {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : undefined;
  if (typeof wert !== "string") return undefined;
  const glatt = wert.trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(glatt)) return undefined;
  const n = Number(glatt.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Einen Satz auf Prozent bringen.
 *
 * Investagon liefert Sätze uneinheitlich: in der Webansicht als Anteil
 * (`share_land` 0.18, `depreciation_rate_building` "0.035"), in der API als
 * Prozent (`share_land` 18, `transaction_tax_rate` 3.5, nachgesehen an der
 * Sigmundstraße 2 am 25.09.2026). Unterhalb von `anteilBis` gilt ein Wert
 * als Anteil und wird mit 100 multipliziert. Die Schwelle hängt am Feld:
 * Ein Satz, der als Prozent immer über ihr liegt, lässt sich so eindeutig
 * erkennen. Ergebnis nur, wenn es in (0, hoechstens] liegt.
 */
function prozentSatz(
  wert: unknown,
  anteilBis: number,
  hoechstens: number,
): number | undefined {
  const n = rechenzahl(wert);
  if (n === undefined || !(n > 0)) return undefined;
  const prozent = n < anteilBis ? n * 100 : n;
  const gerundet = Math.round(prozent * 10000) / 10000;
  return gerundet > 0 && gerundet <= hoechstens ? gerundet : undefined;
}

export function rechenwerteAus(o: Record<string, unknown>): InvestagonRechenwerte {
  const werte: InvestagonRechenwerte = {};

  /*
   * AfA: der wirksame Satz. `depreciation_rate_building` steht in der
   * Webansicht, in der API-Beschreibung (Property, nachgelesen am
   * 25.09.2026) fehlt er. Dort gibt es den manuellen Satz samt Schalter:
   * 1 „Anwenden“ und 2 „Anwenden + Optional“ nehmen ihn, 0 nicht. Ohne
   * manuellen Satz gilt Investagons Standard, der aus dem Baujahr folgt
   * (`depreciation_rate_building_default`, ebenfalls nicht in der API).
   * Fehlt er, schreibt der Import nichts, und der Rechner nimmt wie bisher
   * den gesetzlichen Satz aus dem Baujahr. AfA-Sätze liegen als Prozent
   * mindestens bei 1, als Anteil darunter; mehr als 10 Prozent ist kein AfA-Satz.
   */
  const manuellAn = [1, 2].includes(Number(o.depreciation_rate_building_manual_onoff));
  const afa = prozentSatz(o.depreciation_rate_building, 1, 10) ??
    (manuellAn ? prozentSatz(o.depreciation_rate_building_manual, 1, 10) : undefined) ??
    prozentSatz(o.depreciation_rate_building_default, 1, 10);
  if (afa !== undefined) werte.afaSatz = afa;

  /*
   * Grundanteil: `share_land`, als Anteil (0.18) oder Prozent (18). Ein
   * Grundanteil von einem Prozent oder weniger kommt nicht vor, deshalb ist
   * alles unter 1 ein Anteil. `share_building` ist nur der Rest und wird
   * nicht gebraucht.
   */
  const grund = prozentSatz(o.share_land, 1, 99);
  if (grund !== undefined) werte.grundstueckAnteil = grund;

  /*
   * Erhaltungsaufwand im ersten Jahr. Der berechnete Wert
   * `initial_investment_extra_1y` steht nur in der Webansicht, die API führt
   * den manuellen `initial_investment_extra_1y_manual`.
   */
  const erhaltung = rechenzahl(o.initial_investment_extra_1y) ??
    rechenzahl(o.initial_investment_extra_1y_manual);
  if (erhaltung !== undefined && erhaltung > 0) {
    werte.erhaltungsaufwand = Math.round(erhaltung * 100) / 100;
  }

  /*
   * Möbel-Nutzungsdauer. Das Feld heißt „rate“, trägt aber Jahre (10). Ein
   * Wert unter 1 wäre ein echter Satz, dann ist die Dauer sein Kehrwert.
   */
  const moebel = rechenzahl(o.depreciation_rate_furniture);
  if (moebel !== undefined && moebel > 0) {
    const jahre = moebel < 1 ? Math.round(1 / moebel) : Math.round(moebel);
    if (jahre >= 1 && jahre <= 50) werte.moebelNutzungsdauerJahre = jahre;
  }

  /*
   * Finanzierungsnebenkosten: `register_fee_rate`, Grundschuldeintragung auf
   * die Darlehenssumme, als Anteil 0.002. Steht nur in der Webansicht, nicht
   * in der API-Beschreibung. Als Prozent läge er bei 0,1 bis 1, als Anteil
   * darunter, deshalb die Schwelle 0,05. Mehr als 2 Prozent ist kein
   * Eintragungssatz. `m3_register_fee_rate` gehört zu Investagons eigenem
   * Finanzierungsmodul und wird bewusst nicht gelesen.
   */
  const finanzierung = prozentSatz(o.register_fee_rate, 0.05, 2);
  if (finanzierung !== undefined) werte.finanzierungsnebenkostenSatz = finanzierung;

  return werte;
}

/**
 * Die Fassung dessen, was der Abgleich an ein Objekt schreibt.
 *
 * Sie steckt im Versionsabdruck je Projekt (`investagonVollSyncVersion`).
 * Unveränderte Projekte überspringt der Viertelstundenlauf, bis der Abdruck
 * sich ändert, und der enthält ohnehin das Tagesdatum. Wer eine neue Fassung
 * einträgt, lässt damit jeden Bestand im nächsten Lauf noch einmal
 * vollständig abgleichen, gedrosselt über das Zeitbudget je Lauf und die
 * Reihenfolge „am längsten nicht abgeglichen zuerst“. Das ist der Nachlauf
 * für neue Felder, ohne eigene Function.
 *
 * 2 = 25.09.2026: Rechenwerte (AfA, Grundanteil, Erhaltungsaufwand,
 * Möbel-Nutzungsdauer, Rücklagenzuführung, Finanzierungsnebenkosten).
 * 3 = 05.10.2026: Hausgeld umlagefähig und Hausgeld gesamt an der Einheit.
 */
export const ABGLEICH_FASSUNG = 3;

/** Der Schlüssel in `meta`, unter dem der Import vermerkt, welche Rechenwerte er geschrieben hat. */
export const RECHENWERTE_META_SCHLUESSEL = "investagonRechenwerte";

/**
 * Darf der Abgleich einen bearbeitbaren Rechenwert schreiben?
 *
 * Der Import vermerkt in `meta.investagonRechenwerte`, welchen Wert er
 * zuletzt geschrieben hat. Steht noch genau dieser Wert da, gehört das Feld
 * ihm, und der neue Wert gilt. Hat jemand ihn danach geändert, bleibt der
 * Handwert stehen. Gibt es noch keinen Vermerk, gilt das Feld als unberührt,
 * wenn es leer ist oder den Datenbankstandard trägt (`unberuehrt`, etwa AfA
 * 2 und Grundanteil 20). Einen Handwert, der zufällig genau dem Standard
 * gleicht, kann niemand davon unterscheiden; er wird beim ersten Lauf
 * übernommen.
 *
 * `schreiben` heißt: `wert` in das Feld und in den Vermerk. `geschuetzt`
 * heißt: Investagon liefert etwas anderes, aber das Feld ist Handarbeit.
 */
export function rechenwertNachImport(
  geliefert: number | undefined,
  bisher: unknown,
  zuletztImportiert: unknown,
  unberuehrt: number[],
): { schreiben: boolean; wert?: number; geschuetzt: boolean } {
  if (geliefert === undefined) return { schreiben: false, geschuetzt: false };
  const alt = bisher == null || bisher === "" ? undefined : Number(bisher);
  const gleich = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (alt === undefined || !Number.isFinite(alt) || gleich(alt, geliefert)) {
    return { schreiben: true, wert: geliefert, geschuetzt: false };
  }
  const vermerk = typeof zuletztImportiert === "number" ? zuletztImportiert : undefined;
  const gehoertDemImport = vermerk !== undefined
    ? gleich(alt, vermerk)
    : unberuehrt.some((standard) => gleich(alt, standard));
  return gehoertDemImport
    ? { schreiben: true, wert: geliefert, geschuetzt: false }
    : { schreiben: false, geschuetzt: true };
}

/**
 * Die Rechenwerte am Objekt: AfA-Satz und Grundanteil, wenn alle Einheiten
 * mit einem Wert denselben liefern. Bei einem Einzelwohnungs-Objekt dazu der
 * Erhaltungsaufwand, denn dann ist der Anteil der Einheit der des Hauses.
 * Weichen die Einheiten voneinander ab, bleibt das Feld am Objekt
 * unberührt: Ein Mittelwert wäre für keine Wohnung richtig.
 */
export function objektRechenwerte(
  einheitenRoh: (Record<string, unknown> | null | undefined)[],
): InvestagonRechenwerte {
  const liste = einheitenRoh.map((roh) => (roh ? rechenwerteAus(roh) : {}));
  const einig = (feld: keyof InvestagonRechenwerte): number | undefined => {
    const werte = liste.map((w) => w[feld]).filter((w): w is number => w !== undefined);
    if (!werte.length) return undefined;
    return werte.every((w) => Math.abs(w - werte[0]) < 1e-6) ? werte[0] : undefined;
  };
  const werte: InvestagonRechenwerte = {};
  const afa = einig("afaSatz");
  if (afa !== undefined) werte.afaSatz = afa;
  const grund = einig("grundstueckAnteil");
  if (grund !== undefined) werte.grundstueckAnteil = grund;
  if (einheitenRoh.length === 1 && liste[0].erhaltungsaufwand !== undefined) {
    werte.erhaltungsaufwand = liste[0].erhaltungsaufwand;
  }
  return werte;
}

/**
 * Die Spalten am Objekt, die der Abgleich aus den Rechenwerten schreibt, mit
 * ihrem Datenbankstandard (Migration 20260314101936 und 20260610165029).
 */
export const OBJEKT_RECHENSPALTEN: {
  spalte: "afa_satz" | "grundstueck_anteil" | "erhaltungsaufwand";
  feld: "afaSatz" | "grundstueckAnteil" | "erhaltungsaufwand";
  standard: number[];
}[] = [
  { spalte: "afa_satz", feld: "afaSatz", standard: [2] },
  { spalte: "grundstueck_anteil", feld: "grundstueckAnteil", standard: [20] },
  { spalte: "erhaltungsaufwand", feld: "erhaltungsaufwand", standard: [0] },
];

/**
 * Die Rechenspalten eines Objekts nach dem Abgleich.
 *
 * Gibt die zu schreibenden Spalten zurück, den neuen Vermerk für
 * `meta.investagonRechenwerte` und die Namen der Spalten, die als Handarbeit
 * stehen blieben.
 */
export function objektRechenspaltenNachImport(
  geliefert: InvestagonRechenwerte,
  bisherSpalten: Record<string, unknown> | null | undefined,
  bisherVermerk: unknown,
): {
  spalten: Record<string, number>;
  vermerk: Record<string, number>;
  geschuetzt: string[];
} {
  const alterVermerk = bisherVermerk && typeof bisherVermerk === "object"
    ? bisherVermerk as Record<string, unknown>
    : {};
  const vermerk: Record<string, number> = {};
  for (const [k, v] of Object.entries(alterVermerk)) {
    if (typeof v === "number") vermerk[k] = v;
  }
  const spalten: Record<string, number> = {};
  const geschuetzt: string[] = [];
  for (const { spalte, feld, standard } of OBJEKT_RECHENSPALTEN) {
    const ergebnis = rechenwertNachImport(
      geliefert[feld],
      bisherSpalten?.[spalte],
      alterVermerk[feld],
      standard,
    );
    if (ergebnis.schreiben && ergebnis.wert !== undefined) {
      spalten[spalte] = ergebnis.wert;
      vermerk[feld] = ergebnis.wert;
    } else if (ergebnis.geschuetzt) {
      geschuetzt.push(spalte);
    }
  }
  return { spalten, vermerk, geschuetzt };
}

/**
 * Die Anlageklasse nach dem Abgleich.
 *
 * Bei Investagon-Objekten fuehrt immer Investagon die Anlageklasse
 * (Christian, 23.09.2026). Ein nicht leerer Wert ersetzt deshalb, was im CRM
 * steht. Ein LEERER Wert loescht aber nie ein gefuelltes Feld: Liefert
 * Investagon einmal nichts, etwa weil ein Zugang nur die Kurzliste schickt,
 * bleibt die bisherige Klasse stehen. Vorher schrieb der Abgleich den leeren
 * Wert einfach darueber, und das Objekt fiel in der Portfoliokachel unter
 * „ohne Angabe“.
 */
export function anlageklasseNachImport(
  geliefert: unknown,
  bisher: unknown,
): string | undefined {
  const neu = typeof geliefert === "string" ? geliefert.trim() : "";
  if (neu) return neu;
  const alt = typeof bisher === "string" ? bisher.trim() : "";
  return alt || undefined;
}

/**
 * Der Schluessel in `objekte.meta`: wann Investagon das Objekt angelegt hat.
 *
 * Daran haengt das Kennzeichen „Neu“ in der Objektuebersicht
 * (`src/lib/objekteNeu.ts`, dort gleich benannt). Der Name ist deshalb ein
 * Vertrag, ein Test prueft, dass beide Seiten uebereinstimmen.
 *
 * Woher Investagon sein „NEU“ nimmt: Ein eigenes Feld dafuer gibt es in der
 * API nicht, weder `is_new` noch `badge` oder `label` (oeffentliche
 * OpenAPI-Beschreibung, nachgelesen am 23.09.2026). Das einzige passende Feld
 * ist `created_at` an der Einheit, und zwar nur im Einzelabruf
 * `/api/properties/{id}`, den der Import ohnehin macht. Die Kurzliste und das
 * Projekt haben keines.
 */
export const INVESTAGON_ERSTELLT_META_SCHLUESSEL = "investagonErstelltAm";

/** Ein lesbarer Zeitpunkt als ISO-Text in UTC, sonst `undefined`. */
function isoZeitpunkt(wert: unknown): string | undefined {
  if (typeof wert !== "string" || !wert.trim()) return undefined;
  const ms = Date.parse(wert.trim());
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/**
 * Wann Investagon ein Projekt angelegt hat: das frueheste `created_at` seiner
 * gelieferten Einheiten.
 *
 * Das frueheste, weil das Projekt selbst kein Datum traegt und seine ersten
 * Einheiten mit ihm entstehen. Kommt spaeter eine einzelne Einheit dazu, wird
 * das Haus dadurch nicht wieder neu. Fehlt das Feld ueberall, etwa bei der
 * hinterlegten Liste ohne Rohdaten, ist das Ergebnis `undefined`, und der
 * Abgleich schreibt nichts.
 */
export function projektErstelltAm(
  einheitenRoh: (Record<string, unknown> | null | undefined)[],
): string | undefined {
  let frueheste: number | undefined;
  for (const roh of einheitenRoh) {
    const iso = isoZeitpunkt(roh?.created_at);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (frueheste === undefined || ms < frueheste) frueheste = ms;
  }
  return frueheste === undefined ? undefined : new Date(frueheste).toISOString();
}

/**
 * Das Anlagedatum nach dem Abgleich: das fruehere von bisher und geliefert.
 *
 * Ein fehlender oder unlesbarer Wert loescht nie ein vorhandenes Datum, und
 * ein spaeteres ersetzt nie ein frueheres. So kann ein Abgleich ein Objekt
 * nie nachtraeglich wieder „neu“ machen.
 */
export function erstelltAmNachImport(
  geliefert: unknown,
  bisher: unknown,
): string | undefined {
  const neu = isoZeitpunkt(geliefert);
  const alt = isoZeitpunkt(bisher);
  if (!neu) return alt;
  if (!alt) return neu;
  return Date.parse(neu) < Date.parse(alt) ? neu : alt;
}

/**
 * Die Lage eines Projekts aus den `lat`/`lng` seiner Einheiten.
 *
 * Investagon fuehrt die Lage an jeder Einheit (`Property`, Felder `lat` und
 * `lng`, OpenAPI-Beschreibung, nachgelesen am 23.09.2026), am Projekt nicht.
 * Die Einheiten eines Hauses liegen am selben Punkt; genommen wird die erste
 * mit einer gueltigen Lage (`gueltigeLage`). Liefert keine eine, etwa die
 * hinterlegte Liste ohne Rohdaten, ist das Ergebnis `undefined`, und der
 * Abgleich schreibt nichts.
 */
export function projektKoordinaten(
  einheitenRoh: (Record<string, unknown> | null | undefined)[],
  am: string,
): ObjektKoordinaten | undefined {
  for (const roh of einheitenRoh) {
    const lage = gueltigeLage(roh?.lat, roh?.lng);
    if (lage) return { ...lage, quelle: "investagon", am };
  }
  return undefined;
}

/**
 * Die Lage nach dem Abgleich.
 *
 * Eine gelieferte gueltige Lage gilt, Investagon ist die fuehrende
 * Objektdatenbank. Ist es derselbe Punkt aus derselben Quelle wie bisher,
 * bleibt der bisherige Eintrag samt Zeitpunkt, sonst aenderte jeder naechtliche
 * Lauf das Objekt. Ohne gelieferte Lage bleibt der bisherige Wert, wie er ist:
 * Ein leerer Wert ueberschreibt nie einen gueltigen, und geloescht wird nichts.
 */
export function koordinatenNachImport(
  geliefert: unknown,
  bisher: unknown,
): unknown {
  const neu = koordinatenAus(geliefert);
  if (!neu) return bisher;
  const alt = koordinatenAus(bisher);
  if (alt && alt.lat === neu.lat && alt.lng === neu.lng && alt.quelle === neu.quelle) {
    return bisher;
  }
  return neu;
}

/**
 * Das `meta` eines vorhandenen Objekts mit dem des Abgleichs zusammenfuehren.
 *
 * Der Import kennt nur seine eigenen Schluessel, alles andere bleibt stehen.
 * Fuer die Anlageklasse gilt `anlageklasseNachImport`, fuer das Anlagedatum
 * aus Investagon `erstelltAmNachImport`, fuer die Lage `koordinatenNachImport`.
 */
export function importMetaZusammenfuehren(
  bisher: Record<string, unknown> | null | undefined,
  ausImport: Record<string, unknown>,
): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(bisher || {}), ...ausImport };
  const klasse = anlageklasseNachImport(
    ausImport.anlageklasse,
    bisher?.anlageklasse,
  );
  if (klasse) neu.anlageklasse = klasse;
  else delete neu.anlageklasse;

  /*
   * Das Anlagedatum nimmt der Abgleich nur von der Hauptquelle an. Liefert
   * ein zweiter Zugang dasselbe Haus (Zweitkennung, siehe `dubletten.ts`),
   * ist das eine Kopie in dessen Organisation, und ihr `created_at` ist der
   * Tag der Kopie. Das Objekt stuende sonst nach der Uebernahme eine Woche
   * lang als neu da.
   */
  const schluessel = INVESTAGON_ERSTELLT_META_SCHLUESSEL;
  const hauptquelle = typeof bisher?.investagonSlug !== "string" ||
    bisher.investagonSlug === ausImport.investagonSlug;
  const erstellt = erstelltAmNachImport(
    hauptquelle ? ausImport[schluessel] : undefined,
    bisher?.[schluessel],
  );
  if (erstellt) neu[schluessel] = erstellt;
  else if (bisher && schluessel in bisher) neu[schluessel] = bisher[schluessel];
  else delete neu[schluessel];

  const lage = koordinatenNachImport(
    ausImport[KOORDINATEN_META_SCHLUESSEL],
    bisher?.[KOORDINATEN_META_SCHLUESSEL],
  );
  if (lage !== undefined) neu[KOORDINATEN_META_SCHLUESSEL] = lage;
  else delete neu[KOORDINATEN_META_SCHLUESSEL];
  return neu;
}

/** CRM-Beschreibungen sind Klartext; HTML aus wikiPage nicht als Markup anzeigen. */
export function beschreibungsText(html: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (match, entity: string) => {
        if (!entity.startsWith("#")) {
          return entities[entity.toLowerCase()] ??
            match;
        }
        const n = entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
      },
    ).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Die sechs Investagon-Stufen bleiben in meta; das CRM hat drei Statuswerte. */
export function statusFelder(
  roh: Record<string, unknown> | undefined,
  bestand?: {
    status?: string | null;
    kunde_id?: string | null;
    kunde_name?: string | null;
    reserviert_am?: string | null;
    meta?: Record<string, unknown> | null;
  },
): { status?: string; verwaltet: boolean } {
  const active = roh?.active;
  if (typeof active !== "number" || ![0, 1, 5, 6, 7, 9].includes(active)) {
    return { verwaltet: false };
  }
  /*
   * Verkauft in Investagon gilt auch fuer eine Einheit, deren Status der
   * Import bisher nicht fuehrte, etwa eine von Hand auf reserviert gesetzte.
   * Christian am 23.09.2026: Ein Partner darf nie eine Wohnung anbieten, die
   * in Investagon schon verkauft ist. Ausgenommen bleibt, woran ein Vorgang
   * aus dem CRM haengt (Kunde, Name, Reservierungsdatum): Dort fuehrt die
   * Abwicklung den Status, und ein Widerspruch gehoert vor einen Menschen.
   */
  if (
    active === 0 && bestand && !bestand.kunde_id &&
    !(bestand.kunde_name || "").trim() && !bestand.reserviert_am
  ) {
    return { status: "verkauft", verwaltet: true };
  }
  const verwaltet = !bestand ||
    (!bestand.kunde_id &&
      (bestand.meta?.investagonStatusVerwaltet === true ||
        bestand.status === "frei"));
  if (!verwaltet) return { verwaltet: false };
  return {
    status: active === 0 ? "verkauft" : active === 1 ? "frei" : "reserviert",
    verwaltet: true,
  };
}

export function bilderAnfordern(body: Record<string, unknown>): boolean {
  return body.bilder === true || (body.sync === true && body.bilder !== false);
}

/**
 * Der alte Kurzlistenimport benutzte mangels Wohnungsnummer die API-ID als we_nr.
 *
 * Zuletzt zaehlt die blosse Wohnungsnummer, auch wenn an der vorhandenen
 * Einheit schon eine andere Investagon-Kennung steht. Das braucht der Fall,
 * in dem ein zweiter Zugang dasselbe Haus uebernimmt: Investagon fuehrt dort
 * eigene Kopien mit neuen Kennungen, und ohne diesen letzten Vergleich laege
 * hinterher jede Wohnung doppelt im Objekt. Innerhalb eines Objekts ist die
 * Wohnungsnummer eindeutig, der Import bricht bei Doppelungen vorher ab.
 *
 * Damit dabei keine Wohnung der anderen die Nummer wegnimmt, gilt der letzte
 * Vergleich nur, wenn der Aufrufer `gelieferteKennungen` mitgibt, also alle
 * Kennungen dieses Projektlaufs, und die vorhandene Einheit nicht darunter
 * ist. Steht sie darunter, gehoert sie einer anderen gelieferten Wohnung und
 * bleibt unangetastet.
 */
export function findeBestandsEinheit<
  T extends { we_nr?: string; meta?: Record<string, unknown> | null },
>(
  bestand: T[],
  id: string | undefined,
  we: string,
  gelieferteKennungen?: Set<string>,
): T | undefined {
  return bestand.find((w) => id && w.meta?.investagonId === id) ||
    bestand.find((w) => id && !w.meta?.investagonId && w.we_nr === id) ||
    bestand.find((w) => !w.meta?.investagonId && w.we_nr === we) ||
    (gelieferteKennungen
      ? bestand.find((w) =>
        !!we && w.we_nr === we &&
        !gelieferteKennungen.has(String(w.meta?.investagonId ?? ""))
      )
      : undefined);
}
