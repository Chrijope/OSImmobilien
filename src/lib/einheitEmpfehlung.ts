import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { einheitImAngebot, kaltmieteVon, renditeProzent, eur0 } from "@/lib/objektKennzahlen";
import { angebotsBelegung } from "@/lib/einheitBelegung";
import { gepflegterKaufnebenkostenSatz, kaufnebenkostenPct } from "@/lib/kaufnebenkosten";
import { entfernungMeter, type Koordinate } from "@/lib/umgebung";
import { KOORDINATEN_META_SCHLUESSEL, koordinatenAus } from "../../supabase/functions/_shared/objekt-koordinaten.ts";
import { einheitExklusivSichtbar, objektExklusivSichtbar, type ZugangsNutzer } from "@/lib/objektZugang";
import {
  vormerkungAktiv, vormerkungFuerAnderen, type EinheitStand,
} from "../../supabase/functions/_shared/einheit-vormerkung";
import {
  hausBelegt, hausFremdVorgemerkt, hausFuerKundeVorgemerkt, type HausStand,
} from "../../supabase/functions/_shared/objekt-belegung";
import { hausFrei, hausGesamtStand } from "../../supabase/functions/_shared/haus-stand";
import { vergleicheScore, type ObjektScore } from "@/lib/objektScore";

/**
 * Welche Einheiten passen zu diesem Kunden?
 *
 * Christian am 23.09.2026: Sobald die Selbstauskunft steht, sollen in der
 * Objektauswahl oben fünf Empfehlungen stehen, darunter alle Objekte mit
 * freien Einheiten, die passenden hervorgehoben. Maßgeblich sind vor allem
 * der Preis (im Finanzierungsrahmen „von bis") und die Lage (nah am Wohnort).
 *
 * Diese Datei enthält nur reine Funktionen: kein Zwischenspeicher, keine
 * Datenbank, kein Netz. Objekte, Wohnort und Objektkoordinaten kommen von
 * außen. Die Oberfläche steht in `ObjektEmpfehlungen.tsx`, der Wohnort in
 * `wohnortKoordinate.ts`, die Adressen je Rolle in `empfehlungAuswahl.ts`.
 */

/** Wer die Empfehlungen sieht. Alle anderen sehen die Objektauswahl wie bisher. */
export const EMPFEHLUNG_ROLLEN = [
  "vertriebspartner",
  "vertriebsleiter",
  "inhaber",
  "admin",
  "backoffice",
  "finanzierungspartner",
] as const;

export function siehtEmpfehlungen(rolle: string | undefined | null): boolean {
  return (EMPFEHLUNG_ROLLEN as readonly string[]).includes(rolle || "");
}

/**
 * Zählen die Kaufnebenkosten beim Vergleich mit dem Rahmen mit?
 *
 * Nein. Christian am 23.09.2026: Empfohlen wird, was mit dem reinen
 * Kaufpreis zwischen Minimum und Maximum des Finanzierungsrahmens liegt.
 * Die Rechnung mit Nebenkosten bleibt als Möglichkeit erhalten; umgestellt
 * wird ausschließlich hier.
 */
export const NEBENKOSTEN_IM_RAHMEN = false;

/** Wie viele Empfehlungen oben stehen. */
export const ANZAHL_EMPFEHLUNGEN = 5;

export interface Rahmen {
  von: number;
  bis: number;
}

/**
 * Der Finanzierungsrahmen aus `minRahmen` und `maxRahmen`
 * (`calculateFinanzierbarkeitFromSaData`).
 *
 * Kein Rahmen, wenn die Obergrenze nicht positiv ist oder unter der
 * Untergrenze liegt. Das Zweite passiert genau dann, wenn der monatliche
 * Überschuss negativ ist und nur das Eigenkapital die Werte ins Plus hebt:
 * Dann ist der Rahmen negativ, auch wenn eine Zahl davon positiv aussieht.
 */
export function finanzierungsrahmen(min: number, max: number): Rahmen | null {
  if (!Number.isFinite(max) || max <= 0) return null;
  const von = Number.isFinite(min) && min > 0 ? min : 0;
  if (von > max) return null;
  return { von, bis: max };
}

const positiv = (n: number | undefined | null): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

/** Faktor auf den Kaufpreis: 1,05 bei 5 Prozent Nebenkosten, 1 ohne. */
export function nebenkostenFaktor(nebenkostenProzent: number, mitNebenkosten = NEBENKOSTEN_IM_RAHMEN): number {
  return mitNebenkosten ? 1 + positiv(nebenkostenProzent) / 100 : 1;
}

/**
 * Was die Einheit den Kunden insgesamt kostet: Kaufpreis plus Stellplatz,
 * darauf die Kaufnebenkosten nach Bundesland. Dieselbe Grundlage wie
 * `einfacheFinanzierung` auf der Einheitsseite, die Nebenkosten ebenfalls auf
 * Kaufpreis und Stellplatz zusammen rechnet.
 */
export function gesamtkosten(
  kaufpreis: number,
  stellplatz: number,
  nebenkostenProzent: number,
  mitNebenkosten = NEBENKOSTEN_IM_RAHMEN,
): number {
  return (positiv(kaufpreis) + positiv(stellplatz)) * nebenkostenFaktor(nebenkostenProzent, mitNebenkosten);
}

/**
 * Der Rahmen, umgerechnet in Kaufpreise: Wie teuer darf die Einheit
 * (Kaufpreis einschließlich Stellplatz) sein, damit sie samt Nebenkosten
 * hineinpasst? Damit lässt sich im Gespräch in Kaufpreisen denken.
 */
export function kaufpreisRahmen(
  rahmen: Rahmen,
  nebenkostenProzent: number,
  mitNebenkosten = NEBENKOSTEN_IM_RAHMEN,
): Rahmen {
  const f = nebenkostenFaktor(nebenkostenProzent, mitNebenkosten);
  return { von: rahmen.von / f, bis: rahmen.bis / f };
}

export interface KaufpreisRahmenAnzeige extends Rahmen {
  /** Alle Kandidaten liegen in Ländern mit demselben Nebenkostensatz. */
  einheitlich: boolean;
  satzVon: number;
  satzBis: number;
}

/**
 * Der Kaufpreisrahmen für eine ganze Auswahl, deren Objekte in verschiedenen
 * Bundesländern liegen können.
 *
 * Bei einem einzigen Nebenkostensatz ist er genau. Bei mehreren ist es die
 * Spanne über alle: unten der niedrigste Kaufpreis, der irgendwo passt (im
 * Land mit den höchsten Nebenkosten), oben der höchste (im Land mit den
 * niedrigsten). Die Oberfläche sagt dann „je nach Bundesland".
 */
export function kaufpreisRahmenUeberSaetze(
  rahmen: Rahmen,
  saetze: number[],
  mitNebenkosten = NEBENKOSTEN_IM_RAHMEN,
): KaufpreisRahmenAnzeige | null {
  const gueltig = [...new Set(saetze.filter((s) => Number.isFinite(s) && s >= 0))];
  if (gueltig.length === 0) return null;
  const satzVon = Math.min(...gueltig);
  const satzBis = Math.max(...gueltig);
  return {
    von: rahmen.von / nebenkostenFaktor(satzBis, mitNebenkosten),
    bis: rahmen.bis / nebenkostenFaktor(satzVon, mitNebenkosten),
    einheitlich: !mitNebenkosten || satzVon === satzBis,
    satzVon,
    satzBis,
  };
}

/** Liegt der Betrag im Rahmen? Ohne Preis passt nichts. */
export function passtInRahmen(betrag: number, rahmen: Rahmen): boolean {
  return betrag > 0 && betrag >= rahmen.von && betrag <= rahmen.bis;
}

export function rahmenMitte(rahmen: Rahmen): number {
  return (rahmen.von + rahmen.bis) / 2;
}

// ── Vormerkung ──────────────────────────────────────────────────────────

/*
 * Die Vormerkung an einer Einheit (`vorgemerktBis`, `vorgemerktKundeId`).
 *
 * Die Regel, ob sie gilt, steht an einer Stelle:
 * `supabase/functions/_shared/einheit-vormerkung.ts`, dieselbe Datei lesen die
 * Edge Functions. Hier wird sie nur benutzt. Fehlen die Felder, weil die
 * Migration noch nicht gelaufen ist, gibt es schlicht keine Vormerkung.
 */
export type VormerkungsFelder = Pick<EinheitStand, "vorgemerktBis" | "vorgemerktKundeId">;

/** Für einen anderen Kunden vorgemerkt, und die Frist läuft noch. */
export function fremdVorgemerkt(w: VormerkungsFelder, kundeId: string | undefined, jetzt = new Date()): boolean {
  return vormerkungFuerAnderen(w, kundeId, jetzt);
}

/** Für genau diesen Kunden vorgemerkt, und die Frist läuft noch. */
export function fuerKundeVorgemerkt(w: VormerkungsFelder, kundeId: string | undefined, jetzt = new Date()): boolean {
  return !!kundeId && vormerkungAktiv(w, jetzt) && !vormerkungFuerAnderen(w, kundeId, jetzt);
}

// ── Objektlage ──────────────────────────────────────────────────────────

function gueltigeKoordinate(lat: unknown, lng: unknown): Koordinate | null {
  const a = Number(lat);
  const o = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(o)) return null;
  if (a === 0 && o === 0) return null;
  if (Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  return { lat: a, lng: o };
}

/**
 * Die am Objekt gespeicherte Lage, ohne Nachschlagen.
 *
 * Dieselbe Reihenfolge wie die Karte im Exposé: zuerst die gemessene
 * Standortanalyse (ab Schema 2; ältere Analysen hat eine KI geschätzt, ihren
 * Koordinaten wird nicht getraut), dann `meta.koordinaten` (Investagon-Import
 * oder Messung), zuletzt die alten Felder `meta.lat` und `meta.lng`.
 *
 * Seit dem 23.09.2026 schlägt der Browser keine Objektadresse mehr bei einem
 * Geodienst nach (Christian: keine unnötigen Aufrufe). Fehlt die Lage hier,
 * gibt es keine; die Messung beim Import holt sie nach.
 */
export function gespeicherteObjektKoordinate(objekt: Pick<ObjektData, "meta">): Koordinate | null {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const analyse = (meta.standortanalyse && typeof meta.standortanalyse === "object"
    ? meta.standortanalyse
    : {}) as Record<string, unknown>;
  const schema = Number(analyse.schema);
  const k = (analyse.objekt_koordinaten && typeof analyse.objekt_koordinaten === "object"
    ? analyse.objekt_koordinaten
    : null) as Record<string, unknown> | null;
  if (k && Number.isFinite(schema) && schema >= 2) {
    const gemessen = gueltigeKoordinate(k.lat, k.lng);
    if (gemessen) return gemessen;
  }
  const gespeichert = koordinatenAus(meta[KOORDINATEN_META_SCHLUESSEL]);
  if (gespeichert) return { lat: gespeichert.lat, lng: gespeichert.lng };
  return gueltigeKoordinate(meta.lat, meta.lng);
}

/**
 * Die Adresse, unter der die Objektkarte ihre Koordinaten ablegt
 * (`geocodeCache.ts`). Muss Zeichen für Zeichen dieselbe sein wie in
 * `DeutschlandKarte.tsx`, sonst findet der Zwischenspeicher nichts.
 */
export function objektAdressAnfrage(objekt: Pick<ObjektData, "adresse" | "plz" | "ort">): string {
  const teile = [objekt.adresse, objekt.plz, objekt.ort].filter(Boolean);
  return teile.length ? `${teile.join(", ")}, Deutschland` : "";
}

/** Luftlinie in Kilometern, ohne Wohnort oder Objektlage keine Angabe. */
export function entfernungKm(wohnort: Koordinate | null, objekt: Koordinate | null): number | null {
  if (!wohnort || !objekt) return null;
  return entfernungMeter(wohnort, objekt) / 1000;
}

/** Die Entfernung als Zeile, oder warum es keine gibt. Leer, wenn der Wohnort fehlt. */
export function entfernungZeile(km: number | null, wohnort: WohnortStand, wohnortName?: string): string {
  if (wohnort !== "bekannt") return "";
  if (km === null) return "Entfernung unbekannt";
  return wohnortName ? `${entfernungKmText(km)} von ${wohnortName}` : entfernungKmText(km);
}

/** „42 km", unter einem Kilometer „unter 1 km". */
export function entfernungKmText(km: number): string {
  if (km < 1) return "unter 1 km";
  return `${Math.round(km).toLocaleString("de-DE")} km`;
}

// ── Kandidaten ──────────────────────────────────────────────────────────

export interface EmpfehlungsKandidat {
  /** Eindeutig je Kandidat: die Wohnungskennung, beim Globalobjekt die Objektkennung. */
  schluessel: string;
  objektId: string;
  /** Leer beim Globalobjekt, das als Ganzes verkauft wird. */
  wohnungId: string | null;
  global: boolean;
  objektTitel: string;
  weNr: string;
  /** Etage und Lage im Haus, etwa „2. OG links". Leer beim Globalobjekt. */
  etage: string;
  adresse: string;
  plz: string;
  ort: string;
  /** Unaufgelöste Bildadresse, erst die Einheit, sonst das Objekt. */
  bildUrl: string;
  kaufpreis: number;
  stellplatz: number;
  nebenkostenProzent: number;
  gesamtkosten: number;
  zimmer: number;
  groesse: number;
  kaltmiete: number;
  rendite: number;
  entfernungKm: number | null;
  passt: boolean;
  /** Die Einheit ist für genau diesen Kunden vorgemerkt. */
  vorgemerktFuerKunde: boolean;
}

export interface KandidatenOptionen {
  nutzer: ZugangsNutzer;
  /** Der Kunde, für den ausgewählt wird. Seine eigene Vormerkung schließt nichts aus. */
  kundeId?: string;
  rahmen: Rahmen | null;
  wohnort: Koordinate | null;
  objektKoordinate: (objekt: ObjektData) => Koordinate | null;
  jetzt?: Date;
  mitNebenkosten?: boolean;
  heute?: string;
}

function objektBild(objekt: Pick<ObjektData, "bildUrl" | "bilder">): string {
  if (objekt.bildUrl) return objekt.bildUrl;
  const sortiert = [...(objekt.bilder || [])].sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0));
  return sortiert[0]?.url || "";
}

function einheitBild(w: Pick<ObjektWohnung, "bilder">): string {
  const sortiert = [...(w.bilder || [])].sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0));
  return sortiert[0]?.url || "";
}

/**
 * Alle Einheiten, die für diesen Kunden in Frage kommen, passend oder nicht.
 *
 * In Frage kommt eine Einheit, die
 *   - zu einem sichtbaren Objekt gehört, das der Nutzer sehen darf
 *     (Exklusivpartner am Objekt, Exklusivnutzer an der Einheit),
 *   - frei ist und im Angebot steht (`einheitImAngebot`, Christians Regel vom
 *     23.09.2026: nur was Investagon anbietet),
 *   - nicht für einen anderen Kunden vorgemerkt ist.
 *
 * Ein Globalobjekt wird als Ganzes verkauft (Entscheidung vom 10.09.2026). Es
 * zählt deshalb als ein einziger Kandidat mit seinem Verkaufspreis, und nur,
 * solange keine seiner angebotenen Einheiten belegt ist. Ohne Verkaufspreis
 * lässt es sich nicht einordnen und fällt heraus. Seit dem 23.09.2026 fällt es
 * auch heraus, wenn das Haus selbst reserviert oder verkauft ist oder für
 * einen anderen Kunden vorgemerkt (Belegung am Objekt, siehe
 * `_shared/objekt-belegung.ts`).
 *
 * `objekte` sind die vollständigen Objekte (`getObjekte`), nicht die
 * Angebotssicht: Die Angebotsregel wird hier selbst angewandt, und beim
 * Globalobjekt zählen auch die nicht angebotenen Einheiten mit: Ist auch nur
 * eine davon reserviert oder verkauft, gilt das Haus als teilweise reserviert
 * und fällt heraus (`hausGesamtStand`, Option A vom 05.10.2026).
 */
export function empfehlungsKandidaten(objekte: ObjektData[], opt: KandidatenOptionen): EmpfehlungsKandidat[] {
  const jetzt = opt.jetzt ?? new Date();
  const mit = opt.mitNebenkosten ?? NEBENKOSTEN_IM_RAHMEN;
  const ergebnis: EmpfehlungsKandidat[] = [];

  for (const objekt of objekte || []) {
    if (!objekt?.sichtbar) continue;
    if (!objektExklusivSichtbar(objekt, opt.nutzer)) continue;

    const alle = [...(objekt.wohnungen || []), ...(objekt.wohnungenNichtImAngebot || [])];
    const nk = kaufnebenkostenPct({ plz: objekt.plz, metaPct: gepflegterKaufnebenkostenSatz(objekt) });
    const km = entfernungKm(opt.wohnort, opt.objektKoordinate(objekt));
    const basis = {
      objektId: objekt.id,
      objektTitel: objekt.titel || "",
      adresse: objekt.adresse || "",
      plz: objekt.plz || "",
      ort: objekt.ort || "",
      nebenkostenProzent: nk,
      entfernungKm: km,
    };

    if (objekt.globalObjekt) {
      const angeboten = alle.filter((w) => einheitImAngebot(w));
      const nicht = alle.filter((w) => !einheitImAngebot(w));
      const belegung = angebotsBelegung(angeboten, nicht);
      if (belegung.frei === 0 || belegung.belegt > 0) continue;
      // Auch eine nicht angebotene, belegte Einheit macht das Haus unverfügbar (Option A, 05.10.2026).
      if (!hausFrei(hausGesamtStand({ belegung: objekt.belegung, einheitenStatus: alle.map((w) => w.status) }))) continue;
      if (alle.some((w) => fremdVorgemerkt(w, opt.kundeId, jetzt))) continue;
      const haus: HausStand = {
        belegung: objekt.belegung ?? null,
        kundeId: objekt.belegungKundeId ?? null,
        vorgemerktBis: objekt.vorgemerktBis ?? null,
        vorgemerktKundeId: objekt.vorgemerktKundeId ?? null,
      };
      if (hausBelegt(haus) || hausFremdVorgemerkt(haus, opt.kundeId, jetzt)) continue;
      const g = objekt.globalDaten;
      const kaufpreis = positiv(g?.verkaufspreis);
      if (kaufpreis <= 0) continue;
      const flaeche = positiv(g?.gesamtQm) || alle.reduce((s, w) => s + positiv(w.groesse), 0);
      const mieteMonat = positiv(g?.jahresnettomiete) / 12 || alle.reduce((s, w) => s + kaltmieteVon(w, opt.heute), 0);
      const gesamt = gesamtkosten(kaufpreis, 0, nk, mit);
      ergebnis.push({
        ...basis,
        schluessel: objekt.id,
        wohnungId: null,
        global: true,
        weNr: "",
        etage: "",
        bildUrl: objektBild(objekt),
        kaufpreis,
        stellplatz: 0,
        gesamtkosten: gesamt,
        zimmer: 0,
        groesse: flaeche,
        kaltmiete: mieteMonat,
        rendite: renditeProzent(mieteMonat, kaufpreis),
        passt: !!opt.rahmen && passtInRahmen(gesamt, opt.rahmen),
        vorgemerktFuerKunde: hausFuerKundeVorgemerkt(haus, opt.kundeId, jetzt)
          || alle.some((w) => fuerKundeVorgemerkt(w, opt.kundeId, jetzt)),
      });
      continue;
    }

    for (const w of alle) {
      if (w.status !== "frei" || !einheitImAngebot(w)) continue;
      if (!einheitExklusivSichtbar(w, opt.nutzer)) continue;
      if (fremdVorgemerkt(w, opt.kundeId, jetzt)) continue;
      const kaufpreis = positiv(w.vkGesamt);
      const stellplatz = positiv(w.stellplatzPreis);
      const gesamt = kaufpreis > 0 ? gesamtkosten(kaufpreis, stellplatz, nk, mit) : 0;
      const miete = kaltmieteVon(w, opt.heute);
      ergebnis.push({
        ...basis,
        schluessel: w.id,
        wohnungId: w.id,
        global: false,
        weNr: w.weNr || "",
        etage: [w.etage, w.lage].filter(Boolean).join(" "),
        bildUrl: einheitBild(w) || objektBild(objekt),
        kaufpreis,
        stellplatz,
        gesamtkosten: gesamt,
        zimmer: positiv(w.zimmer),
        groesse: positiv(w.groesse),
        kaltmiete: miete,
        rendite: renditeProzent(miete, kaufpreis),
        passt: !!opt.rahmen && passtInRahmen(gesamt, opt.rahmen),
        vorgemerktFuerKunde: fuerKundeVorgemerkt(w, opt.kundeId, jetzt),
      });
    }
  }
  return ergebnis;
}

// ── Die fünf Empfehlungen ───────────────────────────────────────────────

/** Ob die Entfernung zum Wohnort überhaupt berechnet werden kann. */
export type WohnortStand = "bekannt" | "fehlt" | "nicht_gefunden";

export interface Empfehlung {
  kandidat: EmpfehlungsKandidat;
  /** Weitere passende Einheiten im selben Objekt, die nicht oben stehen. */
  weiterePassendeImHaus: number;
  /** Warum sie oben steht, etwa „passt in den Rahmen, 42 km von Rosenheim". */
  grund: string;
}

export interface EmpfehlungsErgebnis {
  empfehlungen: Empfehlung[];
  /** Alle passenden Einheiten, auch die, die wegen „eine je Objekt" nicht oben stehen. */
  anzahlPassend: number;
  hinweise: string[];
}

export interface EmpfehlungsOptionen {
  rahmen: Rahmen | null;
  wohnort: WohnortStand;
  /** Der Ort des Kunden für den Grund, etwa „Rosenheim". */
  wohnortName?: string;
  anzahl?: number;
}

function vergleicheKandidaten(rahmen: Rahmen, nachEntfernung: boolean) {
  const mitte = rahmenMitte(rahmen);
  return (a: EmpfehlungsKandidat, b: EmpfehlungsKandidat): number => {
    if (nachEntfernung) {
      const ka = a.entfernungKm;
      const kb = b.entfernungKm;
      // Ohne Objektlage nach hinten.
      if (ka === null && kb !== null) return 1;
      if (kb === null && ka !== null) return -1;
      // Ganze Kilometer: Zwei Einheiten im selben Haus liegen gleich weit weg,
      // dann entscheidet die Nähe zur Rahmenmitte.
      if (ka !== null && kb !== null) {
        const d = Math.round(ka) - Math.round(kb);
        if (d !== 0) return d;
      }
    }
    const m = Math.abs(a.gesamtkosten - mitte) - Math.abs(b.gesamtkosten - mitte);
    if (m !== 0) return m;
    return a.schluessel.localeCompare(b.schluessel);
  };
}

/**
 * Die Empfehlungen oben in der Objektauswahl.
 *
 * Rangfolge: nur passende, nach Entfernung aufsteigend, bei gleicher
 * Entfernung die Einheit nah an der Rahmenmitte. Höchstens eine Einheit je
 * Objekt, damit oben nicht fünfmal dasselbe Haus steht; die übrigen passenden
 * desselben Hauses werden als „+2 weitere passende im Haus" genannt.
 *
 * Passen weniger als fünf, stehen nur diese da, aufgefüllt wird nicht: Eine
 * Empfehlung, die nicht passt, wäre keine. Fehlt der Wohnort, wird nach der
 * Nähe zur Rahmenmitte sortiert. Eine Einheit ohne Objektlage steht hinten.
 */
export function empfehlungenAuswaehlen(
  kandidaten: EmpfehlungsKandidat[],
  opt: EmpfehlungsOptionen,
): EmpfehlungsErgebnis {
  if (!opt.rahmen) return { empfehlungen: [], anzahlPassend: 0, hinweise: [] };
  const anzahl = opt.anzahl ?? ANZAHL_EMPFEHLUNGEN;
  const nachEntfernung = opt.wohnort === "bekannt";
  const passende = kandidaten.filter((k) => k.passt).sort(vergleicheKandidaten(opt.rahmen, nachEntfernung));

  const jeObjekt = new Map<string, number>();
  for (const k of passende) jeObjekt.set(k.objektId, (jeObjekt.get(k.objektId) || 0) + 1);

  const gewaehlt: Empfehlung[] = [];
  const schonDa = new Set<string>();
  for (const k of passende) {
    if (schonDa.has(k.objektId)) continue;
    schonDa.add(k.objektId);
    gewaehlt.push({
      kandidat: k,
      weiterePassendeImHaus: (jeObjekt.get(k.objektId) || 1) - 1,
      grund: empfehlungsGrund(k, opt.wohnort, opt.wohnortName),
    });
    if (gewaehlt.length >= anzahl) break;
  }

  const hinweise: string[] = [];
  if (passende.length === 0) {
    hinweise.push("Keine freie Einheit passt in den Rahmen. Darunter stehen alle freien Einheiten.");
  } else if (gewaehlt.length < anzahl) {
    if (passende.length === gewaehlt.length) {
      hinweise.push(passende.length === 1 ? "Nur 1 Einheit passt in den Rahmen" : `Nur ${passende.length} Einheiten passen in den Rahmen`);
    } else {
      hinweise.push(`${passende.length} Einheiten passen in den Rahmen, verteilt auf ${gewaehlt.length} ${gewaehlt.length === 1 ? "Objekt" : "Objekte"}`);
    }
  }
  if (passende.length > 0 && opt.wohnort === "fehlt") hinweise.push("Wohnort fehlt, nach Preis sortiert");
  if (passende.length > 0 && opt.wohnort === "nicht_gefunden") hinweise.push("Wohnort nicht gefunden, nach Preis sortiert");

  return { empfehlungen: gewaehlt, anzahlPassend: passende.length, hinweise };
}

export function empfehlungsGrund(k: EmpfehlungsKandidat, wohnort: WohnortStand, wohnortName?: string): string {
  return [
    k.passt ? "passt in den Rahmen" : "passt nicht in den Rahmen",
    entfernungZeile(k.entfernungKm, wohnort, wohnortName),
  ].filter(Boolean).join(", ");
}

export type KeinRahmenGrund = "keine_selbstauskunft" | "finanziert_selbst" | "rahmen_negativ";

/** Der Hinweis, wenn es keinen Rahmen und damit keine Empfehlungen gibt. */
export function keinRahmenHinweis(grund: KeinRahmenGrund, wohnort: WohnortStand): string {
  const warum = {
    keine_selbstauskunft: "Noch keine Selbstauskunft, deshalb gibt es keinen Finanzierungsrahmen und keine Empfehlungen.",
    finanziert_selbst: "Der Kunde finanziert selbst, deshalb gibt es keinen Finanzierungsrahmen und keine Empfehlungen.",
    rahmen_negativ: "Die Selbstauskunft ergibt keinen positiven Finanzierungsrahmen, deshalb gibt es keine Empfehlungen.",
  }[grund];
  const sortierung = wohnort === "bekannt"
    ? "Die Liste zeigt alle freien Einheiten, nach Entfernung sortiert."
    : "Die Liste zeigt alle freien Einheiten, nach Preis sortiert, weil der Wohnort fehlt.";
  return `${warum} ${sortierung}`;
}

// ── Die Gesamtliste ─────────────────────────────────────────────────────

export interface ObjektListenEintrag {
  objekt: ObjektData;
  objektId: string;
  global: boolean;
  titel: string;
  adresse: string;
  plz: string;
  ort: string;
  bildUrl: string;
  entfernungKm: number | null;
  /** Die Kandidaten dieses Objekts, passende zuerst, dann nach Kaufpreis. */
  einheiten: EmpfehlungsKandidat[];
  anzahlPassend: number;
  preisVon: number;
  preisBis: number;
}

/** Die Kandidaten je Objekt, in der Reihenfolge ihres ersten Auftretens. */
export function objektListe(kandidaten: EmpfehlungsKandidat[], objekte: ObjektData[]): ObjektListenEintrag[] {
  const nachId = new Map(objekte.map((o) => [o.id, o]));
  const gruppen = new Map<string, EmpfehlungsKandidat[]>();
  for (const k of kandidaten) {
    const liste = gruppen.get(k.objektId);
    if (liste) liste.push(k);
    else gruppen.set(k.objektId, [k]);
  }
  const eintraege: ObjektListenEintrag[] = [];
  for (const [objektId, einheiten] of gruppen) {
    const objekt = nachId.get(objektId);
    if (!objekt) continue;
    const sortiert = [...einheiten].sort((a, b) =>
      Number(b.passt) - Number(a.passt) || (a.kaufpreis || Infinity) - (b.kaufpreis || Infinity) || a.weNr.localeCompare(b.weNr, "de", { numeric: true }));
    const preise = einheiten.map((e) => e.kaufpreis).filter((p) => p > 0);
    eintraege.push({
      objekt,
      objektId,
      global: einheiten[0].global,
      titel: einheiten[0].objektTitel,
      adresse: einheiten[0].adresse,
      plz: einheiten[0].plz,
      ort: einheiten[0].ort,
      bildUrl: objektBild(objekt),
      entfernungKm: einheiten[0].entfernungKm,
      einheiten: sortiert,
      anzahlPassend: einheiten.filter((e) => e.passt).length,
      preisVon: preise.length ? Math.min(...preise) : 0,
      preisBis: preise.length ? Math.max(...preise) : 0,
    });
  }
  return eintraege;
}

export type ListenSortierung = "score" | "entfernung" | "preis" | "passende";

/** Die Reihenfolge der Knöpfe wie im Entwurf vom 04.10.2026. „Bester Score" braucht einen Rahmen. */
export const LISTEN_SORTIERUNGEN: { wert: ListenSortierung; label: string }[] = [
  { wert: "score", label: "Bester Score" },
  { wert: "entfernung", label: "Entfernung" },
  { wert: "preis", label: "Preis" },
  { wert: "passende", label: "Passende zuerst" },
];

const preisRang = (e: ObjektListenEintrag) => (e.preisVon > 0 ? e.preisVon : Number.POSITIVE_INFINITY);

function nachEntfernung(a: ObjektListenEintrag, b: ObjektListenEintrag): number {
  if (a.entfernungKm !== null && b.entfernungKm !== null) return a.entfernungKm - b.entfernungKm;
  if (a.entfernungKm !== null) return -1;
  if (b.entfernungKm !== null) return 1;
  return 0;
}

function nachPreis(a: ObjektListenEintrag, b: ObjektListenEintrag): number {
  const pa = preisRang(a);
  const pb = preisRang(b);
  if (pa === pb) return 0;
  return pa < pb ? -1 : 1;
}

/**
 * Sortiert die Gesamtliste. Wo die Entfernung fehlt (kein Wohnort oder keine
 * Objektlage), entscheidet der Preis, und zuletzt der Titel, damit die Liste
 * bei jedem Aufruf gleich aussieht.
 *
 * „Bester Score" (seit dem 04.10.2026) ordnet nach dem besten Score je Objekt
 * (`scoreJeObjekt`). Danach passende Objekte ohne Score, dann die übrigen,
 * untereinander jeweils nach Entfernung.
 */
export function sortiereObjektListe(
  liste: ObjektListenEintrag[],
  sortierung: ListenSortierung,
  scoreJeObjekt?: ReadonlyMap<string, ObjektScore>,
): ObjektListenEintrag[] {
  const titel = (a: ObjektListenEintrag, b: ObjektListenEintrag) => a.titel.localeCompare(b.titel, "de");
  return [...liste].sort((a, b) => {
    if (sortierung === "score") {
      const sa = scoreJeObjekt?.get(a.objektId);
      const sb = scoreJeObjekt?.get(b.objektId);
      const mitA = !!sa && sa.wert !== null;
      const mitB = !!sb && sb.wert !== null;
      if (mitA && mitB) {
        const d = vergleicheScore(sa as ObjektScore, sb as ObjektScore);
        if (d !== 0) return d;
      } else if (mitA || mitB) return mitA ? -1 : 1;
      const p = Number(b.anzahlPassend > 0) - Number(a.anzahlPassend > 0);
      if (p !== 0) return p;
      return nachEntfernung(a, b) || nachPreis(a, b) || titel(a, b);
    }
    if (sortierung === "passende") {
      const p = Number(b.anzahlPassend > 0) - Number(a.anzahlPassend > 0);
      if (p !== 0) return p;
    }
    if (sortierung === "preis") return nachPreis(a, b) || nachEntfernung(a, b) || titel(a, b);
    return nachEntfernung(a, b) || nachPreis(a, b) || titel(a, b);
  });
}

/** Der Kaufpreis einer Spanne als Text, „250.000 € bis 300.000 €". */
export function spanneText(von: number, bis: number): string {
  if (!(von > 0) && !(bis > 0)) return "";
  if (Math.round(von) === Math.round(bis)) return eur0(von);
  return `${eur0(von)} bis ${eur0(bis)}`;
}
