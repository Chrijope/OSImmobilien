import type { ObjektData } from "@/lib/objekteStore";
import type { AnlageKonzept } from "@/lib/anlageZiele";
import type { ObjekttypId } from "@/lib/objekttypen";
import { ausweisartText, beschreibungsTexte, energieeffizienzklasse, merkmalWert } from "./investagonFelder";
import { istGlobalobjekt } from "../../supabase/functions/_shared/globalobjekt";

/**
 * Die Felder der Objektseite, die am Objekt gepflegt werden.
 *
 * Sie liegen im `meta`-JSON der Tabelle `objekte`, so wie schon Anlageklasse,
 * Verwaltungsart und Kalkulation. Damit braucht es keine Migration, und ein
 * Objekt ohne diese Angaben zeigt schlicht leere Stellen. Investagon liefert
 * davon nichts, das ist Objektpflege im CRM.
 *
 * Gelesen wird ausschließlich über `objektseiteFelder`, geschrieben über
 * `objektseiteFelderInMeta`, damit Lesen und Schreiben nicht auseinanderlaufen.
 */

export type Objektart = "sanierter_bestand" | "neubau" | "kfw40" | "wg_coliving";

export interface ObjektartInfo {
  id: Objektart;
  label: string;
  /** Das Konzept der Beratungspräsentation, das zu dieser Objektart gehört. */
  konzept: AnlageKonzept;
  /** Der Objekttyp der Musterrechnung im Analysetool. */
  objekttyp: ObjekttypId;
}

/**
 * Die vier Objektarten. Die Namen folgen den Konzepten der
 * Beratungspräsentation (Sanierter Bestand, WG und Co-Living, KfW), damit
 * Objektseite, Exposé und Präsentation dieselben Begriffe sprechen.
 */
export const OBJEKTARTEN: ObjektartInfo[] = [
  { id: "sanierter_bestand", label: "Sanierter Bestand", konzept: "bestand", objekttyp: "sanierter_altbau" },
  { id: "neubau", label: "Neubau", konzept: "kfw", objekttyp: "neubau" },
  { id: "kfw40", label: "KfW 40", konzept: "kfw", objekttyp: "neubau" },
  { id: "wg_coliving", label: "WG und Co-Living", konzept: "wg", objekttyp: "wg_konzept" },
];

/**
 * Die Objektarten, die im Objektfenster der Objektauswahl zur Wahl stehen.
 *
 * Drei der vier. KfW 40 fehlt hier mit Absicht und auf Christians
 * ausdrückliche Entscheidung: Für die Objektauswahl ist ein KfW-40-Haus ein
 * Neubau, und zwei Knöpfe für dieselbe Sache führen nur dazu, dass jeder
 * anders wählt und die Kennzeichen an den Karten auseinanderlaufen.
 *
 * In `OBJEKTARTEN` bleibt die Art trotzdem stehen, denn Objekte im eigenen
 * Bestand tragen sie, die Objektseite bietet sie weiter an und
 * `objektartAbleiten` leitet sie aus dem Titel ab. Wer sie hier vermisst, hat
 * also kein Versehen gefunden.
 */
export const OBJEKTARTEN_AUSWAHL: ObjektartInfo[] = OBJEKTARTEN.filter((a) => a.id !== "kfw40");

export function objektartInfo(id?: Objektart | string | null): ObjektartInfo | undefined {
  return OBJEKTARTEN.find((a) => a.id === id);
}

/** Die Bezeichnung einer Objektart, etwa „Neubau“. Leer, wenn keine feststeht. */
export function objektartLabel(id?: Objektart | string | null): string {
  return objektartInfo(id)?.label ?? "";
}

export interface Energieausweis {
  /** Verbrauchsausweis oder Bedarfsausweis */
  art?: string;
  /** Endenergiekennwert in kWh je m² und Jahr */
  kennwert?: number;
  /** Effizienzklasse A+ bis H */
  klasse?: string;
  /** Energieträger, etwa Gas oder Fernwärme */
  energietraeger?: string;
  /** Gültig bis (YYYY-MM-DD oder Jahr) */
  gueltigBis?: string;
}

export interface Sanierung {
  jahr: string;
  massnahme: string;
  /** Kosten in Euro, sofern bekannt */
  betrag?: number;
}

export interface ObjektseiteFelder {
  objektart?: Objektart;
  kurzbeschreibung?: string;
  standortargumente: string[];
  energieausweis: Energieausweis;
  gemeinschaftseigentum?: string;
  sanierungen: Sanierung[];
  verwaltung?: string;
  /** Alle Wohneinheiten des Hauses, von Hand gepflegt in `meta.einheitenImHaus`. */
  einheitenImHaus?: number;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const zahl = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Nur das, was von Hand in `meta` steht, ohne jeden Rückfall.
 *
 * Diese Funktion liest der Pflegedialog. Er schreibt beim Speichern alle
 * Felder auf einmal zurück (`objektseiteFelderInMeta`). Läse er die Anzeige
 * mit ihren Rückfällen, würde aus einem Investagon-Text oder einer
 * Energieklasse aus der Objektanlage beim ersten Speichern eine gepflegte
 * Angabe, und der nächste Abgleich käme nicht mehr dagegen an. Genau das ist
 * bis zum 23.09.2026 passiert: Die Kurzbeschreibung aus den Freitexten landete
 * so in `meta.kurzbeschreibung` und galt danach als von Hand geschrieben.
 */
export function objektseiteHandwerte(objekt: Pick<ObjektData, "meta">): ObjektseiteFelder {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const ea = (meta.energieausweis && typeof meta.energieausweis === "object" ? meta.energieausweis : {}) as Record<string, unknown>;
  const rohArgumente = Array.isArray(meta.standortargumente) ? meta.standortargumente : [];
  const rohSanierungen = Array.isArray(meta.sanierungen) ? meta.sanierungen : [];
  return {
    objektart: objektartInfo(text(meta.objektart))?.id,
    kurzbeschreibung: text(meta.kurzbeschreibung),
    standortargumente: rohArgumente.map((a) => text(a)).filter((a): a is string => !!a),
    energieausweis: {
      art: text(ea.art),
      kennwert: zahl(ea.kennwert),
      klasse: text(ea.klasse),
      energietraeger: text(ea.energietraeger),
      gueltigBis: text(ea.gueltigBis),
    },
    gemeinschaftseigentum: text(meta.gemeinschaftseigentum),
    sanierungen: rohSanierungen
      .map((s) => {
        const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const jahr = text(r.jahr) ?? (zahl(r.jahr) !== undefined ? String(zahl(r.jahr)) : undefined);
        const massnahme = text(r.massnahme);
        if (!jahr && !massnahme) return null;
        return { jahr: jahr || "", massnahme: massnahme || "", betrag: zahl(r.betrag) } as Sanierung;
      })
      .filter((s): s is Sanierung => s !== null),
    verwaltung: text(meta.verwaltung),
    einheitenImHaus: ganzeZahl(meta.einheitenImHaus),
  };
}

/** Eine positive ganze Zahl, sonst `undefined`. „0“ heißt nicht gepflegt. */
function ganzeZahl(v: unknown): number | undefined {
  const n = zahl(v);
  return n !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Wie viele Wohneinheiten das Haus hat, sofern jemand es gepflegt hat.
 *
 * Seit dem 24.09.2026 die einzige Quelle für „Einheiten im Haus“ in Exposé,
 * Kundenansicht, Objekt- und Einheitsseite. Vorher standen bei Espanstraße 5
 * drei verschiedene Zahlen: die Wohnungen im Angebot, die freien und eine im
 * KI-Text. Keine davon ist die Zahl des Hauses, denn das CRM kennt nur die
 * Einheiten, die im Vertrieb sind. Fehlt die Pflege, steht deshalb keine
 * Einheitenzahl da, statt einer falschen.
 *
 * Investagon liefert im Rohdatensatz keine Gesamtzahl der Einheiten (geprüft
 * am 24.09.2026 an Import und gespeicherten Feldern), also gibt es keine
 * Vorbelegung von dort.
 */
export function einheitenImHaus(objekt: Pick<ObjektData, "meta"> | null | undefined): number | undefined {
  if (!objekt) return undefined;
  return objektseiteHandwerte(objekt).einheitenImHaus;
}

/**
 * Die Felder aus dem Objekt lesen, mit Rückfällen für die Anzeige.
 *
 * Für die Energieklasse gibt es einen Rückfall auf die bestehende Spalte
 * `global_energieeffizienzklasse`, die die Objektanlage schon lange pflegt.
 *
 * DER RÜCKFALL AUF INVESTAGON, seit 16.09.2026
 *
 * Diese Felder pflegt niemand bei einem Objekt, das aus Investagon kommt,
 * und Investagon liefert sie nicht unter diesen Namen. Die Objektseite zeigte
 * deshalb reihenweise „Keine Angabe“, obwohl die Angaben in den Rohdaten
 * stehen, nur woanders:
 *
 *   Kurzbeschreibung      ← `extras`, die Freitexte, nach Gewicht sortiert
 *   Energieausweis, Art   ← `energy_certificate_type`
 *   Energieausweis, Klasse← `tags`, weil `energy_efficiency_class` leer ist
 *
 * Reihenfolge: Was von Hand gepflegt wurde, gewinnt IMMER. Investagon ist nur
 * der Rückfall für ein leeres Feld.
 *
 * SEIT 23.09.2026 OHNE RÜCKFALL: Gemeinschaftseigentum, Verwaltung, Sanierungen
 *
 * `gemeinschaftseigentum`, `verwaltung` und `sanierungen` liefern hier nur
 * noch die Handangabe. Vorher standen im Gemeinschaftseigentum dieselben
 * Freitexte wie in der Kurzbeschreibung, also die Objektbeschreibung, und in
 * der Verwaltung das Wort „inklusive“ aus dem Merkmal „360°-Verwaltung“; das
 * Exposé machte daraus „Leistungen der Verwaltung, inklusive“. Was die Seiten
 * dort jetzt zeigen, setzt `objektdetailsAnzeige` in
 * `src/lib/objektdetailsAnzeige.ts` aus Handangabe, Regel und Rohdaten
 * zusammen. Der Rechner liest `sanierungen` weiter nur von Hand, weil daraus
 * Beträge und Fertigstellungsjahre in die Rechnung gehen.
 */
export function objektseiteFelder(objekt: Pick<ObjektData, "meta" | "globalDaten">): ObjektseiteFelder {
  const hand = objektseiteHandwerte(objekt);

  const ausInvestagon = beschreibungsTexte(objekt);
  const investagonText = ausInvestagon.length ? ausInvestagon.join("\n\n") : undefined;

  return {
    ...hand,
    kurzbeschreibung: hand.kurzbeschreibung ?? investagonText,
    energieausweis: {
      ...hand.energieausweis,
      art: hand.energieausweis.art ?? ausweisartText(objekt),
      klasse: hand.energieausweis.klasse
        ?? text(objekt.globalDaten?.energieeffizienzklasse)
        ?? energieeffizienzklasse(objekt),
    },
  };
}

/**
 * Die Felder in ein `meta` schreiben. Vorhandene, fremde Schlüssel bleiben
 * erhalten, leere Angaben werden entfernt statt als leere Zeichenkette
 * gespeichert.
 */
export function objektseiteFelderInMeta(
  meta: Record<string, unknown> | undefined,
  felder: ObjektseiteFelder,
): Record<string, unknown> {
  const ea = felder.energieausweis;
  const eaBereinigt: Record<string, unknown> = {};
  if (text(ea.art)) eaBereinigt.art = ea.art!.trim();
  if (zahl(ea.kennwert) !== undefined) eaBereinigt.kennwert = ea.kennwert;
  if (text(ea.klasse)) eaBereinigt.klasse = ea.klasse!.trim();
  if (text(ea.energietraeger)) eaBereinigt.energietraeger = ea.energietraeger!.trim();
  if (text(ea.gueltigBis)) eaBereinigt.gueltigBis = ea.gueltigBis!.trim();

  const neu: Record<string, unknown> = { ...(meta || {}) };
  const setzeOderEntferne = (key: string, wert: unknown) => {
    if (wert === undefined || wert === null || wert === "") delete neu[key];
    else neu[key] = wert;
  };
  setzeOderEntferne("objektart", felder.objektart);
  setzeOderEntferne("kurzbeschreibung", text(felder.kurzbeschreibung));
  const argumente = felder.standortargumente.map((a) => a.trim()).filter(Boolean);
  setzeOderEntferne("standortargumente", argumente.length ? argumente : undefined);
  setzeOderEntferne("energieausweis", Object.keys(eaBereinigt).length ? eaBereinigt : undefined);
  setzeOderEntferne("gemeinschaftseigentum", text(felder.gemeinschaftseigentum));
  const sanierungen = felder.sanierungen
    .map((s) => ({ jahr: s.jahr.trim(), massnahme: s.massnahme.trim(), ...(zahl(s.betrag) !== undefined ? { betrag: s.betrag } : {}) }))
    .filter((s) => s.jahr || s.massnahme);
  setzeOderEntferne("sanierungen", sanierungen.length ? sanierungen : undefined);
  setzeOderEntferne("verwaltung", text(felder.verwaltung));
  setzeOderEntferne("einheitenImHaus", ganzeZahl(felder.einheitenImHaus));
  return neu;
}

/**
 * Eine Objektart aus den vorhandenen Angaben ableiten, solange keine gepflegt
 * ist. Sie wird auf der Seite als Vorschlag gekennzeichnet und nie gespeichert,
 * damit eine geratene Einordnung nicht als gepflegte durchgeht.
 *
 * Ob es eine WG ist, entscheidet `istWgKonzept`, dieselbe Regel wie für die
 * Verwaltung (Christian, 23.09.2026). Vorher schaute diese Funktion nur auf die
 * Anlageklasse. Ein Objekt mit „(Co-Living)“ im Titel oder dem Mietmodell
 * „WG-Vermietung“ in Investagon, aber der Anlageklasse „Eigentumswohnung“,
 * bekam dadurch auf der Objektseite den Vorschlag „Sanierter Bestand“ und
 * darunter trotzdem „WEG- und SEV-Verwaltung“.
 */
export function objektartAbleiten(
  objekt: Pick<ObjektData, "meta" | "globalDaten" | "titel"> & Pick<WgPruefObjekt, "badge" | "wohnungen">,
): Objektart | undefined {
  const titel = (objekt.titel || "").toLowerCase();
  const zustand = (objekt.globalDaten?.zustand || "").toLowerCase();
  if (istWgKonzept(objekt)) return "wg_coliving";
  if (/kfw\s*40/.test(titel)) return "kfw40";
  if (zustand === "neubau") return "neubau";
  if (zustand === "kernsanierung" || zustand === "bestand") return "sanierter_bestand";
  return undefined;
}

/**
 * Ob ein Text ein WG- oder Co-Living-Konzept nennt.
 *
 * „WG“ zählt nur als eigenes Wort: „WG-Wohnung“, „4er WG“, „wg_zimmer“ ja,
 * „Bewegung“ oder „WEG“ nein. Buchstaben mit Umlaut zählen als Wortteil,
 * deshalb die Unicode-Klassen statt `\b`, das nur ASCII kennt.
 */
const WG_WORT = /(^|[^\p{L}\p{N}])wgs?(?=$|[^\p{L}\p{N}])/iu;
const CO_LIVING = /(^|[^\p{L}\p{N}])co[\s_-]?living/iu;
const WG_BEGRIFFE = /wohngemeinschaft|zimmervermietung|flat[\s_-]?share|shared[\s_-]?(flat|apartment)/i;

export function nenntWgKonzept(wert: string | undefined | null): boolean {
  if (!wert) return false;
  return WG_WORT.test(wert) || CO_LIVING.test(wert) || WG_BEGRIFFE.test(wert);
}

/**
 * Ob das Objekt ein WG- oder Co-Living-Konzept ist.
 *
 * Daran hängt, ob unter „Verwaltung“ neben der WEG-Verwaltung auch die
 * SEV-Verwaltung steht (Christians Regel vom 23.09.2026). Investagon hat dafür
 * kein eigenes Feld, deshalb werden mehrere Stellen gefragt:
 *
 *   1. die gepflegte Objektart. Ist sie gesetzt, entscheidet sie allein, auch
 *      gegen die übrigen Hinweise: Wer sie festgelegt hat, hat das Objekt
 *      angesehen, und nur so lässt sich eine falsche Ableitung abstellen.
 *   2. die Anlageklasse (Investagon `property_usage`, etwa „WG-Wohnung“),
 *      dieselbe Quelle wie die abgeleitete Objektart
 *   3. die Merkmale „Mietmodell“ und „Produktklasse“ in den Rohdaten von
 *      Objekt und Einheiten
 *   4. Badge und Titel, etwa „Landsbergerstraße 22a (Co-Living)“
 *
 * DIE EINE REGEL. Jede Stelle, die fragt „ist das eine WG oder Co-Living?“,
 * fragt diese Funktion, direkt oder über `objektartAbleiten`: Verwaltung,
 * Objektart-Vorschlag auf Objekt- und Einheitsseite, Exposé. Die
 * Portfoliokachel „Anlageklassen“ fragt nicht, sie zeigt die Anlageklasse
 * wörtlich und entscheidet nichts.
 */
export interface WgPruefObjekt {
  meta?: Record<string, unknown> | null;
  titel?: string | null;
  badge?: string | null;
  wohnungen?: ReadonlyArray<{ investagonRaw?: Record<string, unknown> | null }>;
}

export function istWgKonzept(objekt: WgPruefObjekt): boolean {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const gepflegt = objektartInfo(text(meta.objektart))?.id;
  if (gepflegt) return gepflegt === "wg_coliving";

  if (nenntWgKonzept(text(meta.anlageklasse))) return true;

  const quellen = [
    objekt,
    ...(objekt.wohnungen || []).map((w) => ({ meta: { investagonRaw: w?.investagonRaw } })),
  ];
  for (const quelle of quellen) {
    if (nenntWgKonzept(merkmalWert(quelle, "Mietmodell"))) return true;
    if (nenntWgKonzept(merkmalWert(quelle, "Produktklasse"))) return true;
  }

  return nenntWgKonzept(text(objekt.badge)) || nenntWgKonzept(text(objekt.titel));
}

/** Ob bei dieser Objektart Erstvermietung und Garantie überhaupt Thema sind. */
export function istNeubauArt(art?: Objektart): boolean {
  return art === "neubau" || art === "kfw40";
}

/**
 * Stand des Investagon-Abgleichs, wie ihn der Import in `meta` hinterlässt.
 * Ohne Kennung ist das Objekt von Hand angelegt.
 */
export function investagonStand(objekt: Pick<ObjektData, "meta">): { ausInvestagon: boolean; stand?: string } {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const slug = text(meta.investagonSlug);
  return { ausInvestagon: !!slug, stand: text(meta.importStand) };
}

/**
 * Query-Parameter, mit denen das alte Objektdetail Arbeitsabläufe steuert:
 * Reservierung für einen Kunden, Wohnung bearbeiten.
 * Ruft jemand die Objektadresse mit einem davon auf, will er die
 * Verwaltungsansicht, nicht die Objektseite.
 */
export const VERWALTUNGS_PARAMETER = ["kundeId", "kundeName", "investmentId", "editWohnung", "action", "fromKundenansicht"];

export function willVerwaltungsansicht(search: string): boolean {
  const params = new URLSearchParams(search);
  return VERWALTUNGS_PARAMETER.some((p) => params.has(p));
}

/**
 * Die einzige Einheit eines Objekts, falls es genau eine hat.
 *
 * Fast alle hinterlegten Objekte sind WG-Konzepte mit einer Einheit, keine
 * Häuser mit mehreren Wohnungen. Für sie ist die Objektseite nur ein Umweg:
 * Der Klick in der Objektliste soll direkt auf der Einheiten-Seite landen,
 * und die Einheiten-Seite zeigt dann alles, was sonst auf der Objektseite
 * stünde. Bei null Einheiten gibt es nichts, wohin man springen könnte, dann
 * bleibt es bei der Objektseite.
 */
export function einzigeEinheit<W extends { id: string }>(wohnungen: ReadonlyArray<W> | undefined): W | undefined {
  return wohnungen && wohnungen.length === 1 ? wohnungen[0] : undefined;
}

/**
 * Führt dieses Objekt beim Anklicken auf die Einheiten-Seite statt auf die
 * Objektseite?
 *
 * Bis zum 11.09.2026 entschied das allein die Anzahl der Einheiten. Das ist
 * wackelig, denn die Anzahl ist ein Zustand und keine Eigenschaft: Ein Haus,
 * bei dem zunächst nur eine Wohnung erfasst ist, sprang direkt in die Einheit
 * und verhielt sich ab der zweiten Wohnung plötzlich anders. Maßgeblich ist
 * jetzt zuerst, was das Objekt **ist**:
 *
 * - Ein **Globalobjekt** wird als Ganzes verkauft. Es springt nie in eine
 *   Einheit, auch nicht mit nur einer. Seine Objektseite ist die Stelle, an
 *   der reserviert wird (Entscheidung vom 10.09.2026).
 * - Ein als **Einzelwohnung** angelegtes Objekt (`meta.einzelwohnung`, vom
 *   Anlegeassistenten gesetzt) springt immer in seine Einheit, sobald es eine
 *   hat.
 * - Alles andere entscheidet weiterhin die Anzahl, damit sich für die
 *   bestehenden WG-Konzepte nichts ändert. Sie tragen das Kennzeichen nicht,
 *   weil sie vor dessen Einführung angelegt wurden.
 */
export function springtInDieEinheit(objekt: {
  globalObjekt?: boolean;
  meta?: Record<string, unknown> | null;
  wohnungen?: ReadonlyArray<{ id: string }>;
}): boolean {
  if (istGlobalobjekt(objekt)) return false;
  const anzahl = objekt.wohnungen?.length ?? 0;
  if (anzahl === 0) return false;
  if ((objekt.meta as Record<string, unknown> | undefined)?.einzelwohnung) return true;
  return anzahl === 1;
}

/**
 * Die Adresse, die ein Klick auf ein Objekt öffnen soll: bei einem
 * Einzelobjekt dessen Einheiten-Seite, sonst die Objektseite. Alle
 * Klickstellen (Objektliste, Suche, Brotkrumen) nutzen diese Funktion, und die
 * Objektseite leitet bei direktem Aufruf ebenfalls hierhin weiter. Wann
 * gesprungen wird, entscheidet `springtInDieEinheit`.
 */
export function zielRouteFuerObjekt(objekt: {
  id: string;
  globalObjekt?: boolean;
  meta?: Record<string, unknown> | null;
  wohnungen?: ReadonlyArray<{ id: string }>;
}): string {
  if (!springtInDieEinheit(objekt)) return `/objekte/${objekt.id}`;
  const einheit = objekt.wohnungen![0];
  return `/objekte/${objekt.id}/einheiten/${einheit.id}`;
}
