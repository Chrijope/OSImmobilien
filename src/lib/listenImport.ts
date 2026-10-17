/**
 * Excel-Listen eines Objekts in die Objektdaten übernehmen (17.10.2026).
 *
 * Christian führt je Objekt Listen im Drive: Kaufpreis- und Flächenabgleich,
 * Mietdifferenz-Abgleich, Garagenliste, Vertriebsliste. Diese Datei liest eine
 * solche Liste, ordnet jede Zeile ihrer Einheit zu (über die WE-Nummer) und
 * plant, was sich ändern würde. Geschrieben wird erst nach Bestätigung, in
 * `importAusfuehren`.
 *
 * Regeln:
 * - Originalwerte werden 1:1 übernommen, nichts wird umgerechnet.
 * - Kaufpreis, Fläche und Miete gehören bei Objekten aus Investagon Investagon
 *   (Christian, 17.10.2026). Dort wird nur geprüft und die Abweichung gezeigt,
 *   ändern muss man sie in Investagon. Bei selbst angelegten Einheiten werden
 *   sie übernommen.
 * - Mieter und Ist-Kaltmiete landen in der Mietertabelle (`mieter`), die
 *   Garage in `wohnungen.meta.garage`.
 */
import type { Blatt, Zelle } from "./excelLesen";
import { excelDatumIso } from "./excelLesen";
import type { EinheitGarage, GaragenStatus } from "./mietgarantie";
import type { Mieter } from "./mieterStore";
import type { ObjektWohnung } from "./objekteStore";
import { ausInvestagon } from "./investagonHerkunft";
import { aktuellerMieter } from "./objektdaten";

export type ImportFeld =
  | "we" | "lage" | "flaeche" | "kaufpreis" | "garageKaufpreis" | "istKaltmiete" | "mieter" | "mietbeginn"
  | "befristetBis" | "garageNr" | "stellplatzNr" | "garageIstMiete" | "garageStatus";

const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
const gleich = (...w: string[]) => (h: string) => w.includes(h);
const beginnt = (...w: string[]) => (h: string) => w.some((x) => h.startsWith(x));

/*
 * Je Feld die erkannten Spaltenköpfe, in der Reihenfolge des Vorrangs. Die
 * Hauffstraße führt zwei Flächen; Investagon geht vor, weil die Kaufpreise
 * darauf beruhen.
 */
export const FELD_ERKENNUNG: Record<ImportFeld, Array<(h: string) => boolean>> = {
  we: [gleich("we", "we nr", "we nr.", "we-nr.", "einheit")],
  lage: [gleich("lage", "lage im haus", "lage / nutzung")],
  flaeche: [beginnt("m² lt. investagon"), gleich("größe", "fläche m²", "fläche", "wohnfläche")],
  kaufpreis: [gleich("kp wohnung"), gleich("verkaufspreis", "kaufpreis")],
  garageKaufpreis: [gleich("kp garage")],
  istKaltmiete: [beginnt("ist-kaltmiete wohnung"), gleich("ist netto-kaltmiete", "ist-miete mtl.", "nettokalt", "nettokaltmiete", "nettokaltmiete mtl.")],
  mieter: [gleich("mieter", "wohnungsmieter"), beginnt("mieter (")],
  mietbeginn: [gleich("mietbeginn", "einzug", "mv-beginn"), beginnt("mietbeginn (")],
  befristetBis: [gleich("befristet bis", "bis zum")],
  garageNr: [beginnt("garage/stellplatz zugeordnet"), beginnt("garage/sp (kv"), gleich("garagen-nr.")],
  stellplatzNr: [gleich("stellplatz-nr.")],
  garageIstMiete: [gleich("ist-miete garage"), beginnt("ist miete garage")],
  garageStatus: [gleich("garage: status", "ergebnis")],
};

export const FELD_NAME: Record<ImportFeld, string> = {
  we: "WE", lage: "Lage", flaeche: "Fläche", kaufpreis: "Kaufpreis", garageKaufpreis: "Kaufpreis Garage",
  istKaltmiete: "Ist-Kaltmiete", mieter: "Mieter", mietbeginn: "Mietbeginn", befristetBis: "befristet bis",
  garageNr: "Garage/Stellplatz", stellplatzNr: "Stellplatz-Nr.", garageIstMiete: "Ist-Miete Garage", garageStatus: "Garagenstatus",
};

export interface Kopf {
  zeile: number;
  spalten: Partial<Record<ImportFeld, number>>;
}

/** Sucht in den ersten zehn Zeilen die Kopfzeile mit einer WE-Spalte und ordnet die übrigen Felder zu. */
export function kopfErkennen(blatt: Blatt): Kopf | null {
  for (let z = 0; z < Math.min(10, blatt.zeilen.length); z++) {
    const koepfe = (blatt.zeilen[z] || []).map(norm);
    if (!koepfe.some((h) => FELD_ERKENNUNG.we[0](h))) continue;
    const spalten: Kopf["spalten"] = {};
    for (const [feld, regeln] of Object.entries(FELD_ERKENNUNG) as [ImportFeld, Array<(h: string) => boolean>][]) {
      for (const regel of regeln) {
        const i = koepfe.findIndex(regel);
        if (i >= 0) { spalten[feld] = i; break; }
      }
    }
    return { zeile: z, spalten };
  }
  return null;
}

/** Die Nummer einer Einheit: „WE 1“, „WE01“ und „1“ sind dieselbe. */
export function weNummer(wert: unknown): number | null {
  if (typeof wert === "number") return Number.isInteger(wert) && wert > 0 ? wert : null;
  // Nur „12“, „WE 12“, „WE12“, „WE 11/12“: Notizzeilen mit Zahlen im Text zählen nicht.
  const m = /^\s*(?:we\s*)?0*(\d+)(?:\s*[/,].*)?\s*$/i.exec(String(wert ?? ""));
  return m ? Number(m[1]) : null;
}

const zahl = (z: Zelle | undefined): number | null => {
  if (typeof z === "number") return Number.isFinite(z) ? z : null;
  if (typeof z !== "string") return null;
  const t = z.replace(/[€\s]/g, "");
  if (!/\d/.test(t)) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};
const text = (z: Zelle | undefined) => (z === null || z === undefined ? "" : String(z).trim());

/** Kein echter Mietername: Leerstand, verkauft, leer. */
function istMietername(name: string): boolean {
  return !!name && !/^(leer|leerstand|verkauft|-|–)/i.test(name);
}

export function nameTeilen(name: string): { vorname: string; nachname: string } {
  const i = name.indexOf(",");
  return i < 0 ? { vorname: "", nachname: name.trim() } : { nachname: name.slice(0, i).trim(), vorname: name.slice(i + 1).trim() };
}

/** Garage aus den Spalten der Zeile; null heißt: keine Garage, undefined: Liste sagt nichts dazu. */
export function garageAusZeile(z: Zelle[], s: Kopf["spalten"]): EinheitGarage | null | undefined {
  let istMiete = s.garageIstMiete !== undefined ? zahl(z[s.garageIstMiete]) : null;
  const statusText = s.garageStatus !== undefined ? norm(z[s.garageStatus]) : "";
  /*
   * Der Mietdifferenz-Abgleich rechnet mit dem Statustext, nicht mit der
   * Spalte „Ist-Miete Garage“: „frei“ heißt 0 €, „vermietet (50 €)“ heißt
   * 50 €. So ergibt sich dort die Garagen-Subvention (2.200 € im Monat).
   */
  const betrag = /vermietet \((\d+(?:,\d+)?) ?€\)/.exec(statusText);
  if (betrag) istMiete = Number(betrag[1].replace(",", "."));
  else if (/(^|[ ,:])frei\b/.test(statusText) && !statusText.startsWith("frei bzw")) istMiete = 0;
  let nr = s.garageNr !== undefined ? text(z[s.garageNr]) : "";
  let art: EinheitGarage["art"] = "garage";
  if (/^\d+$/.test(nr)) nr = `G${nr}`;
  if (!nr && s.stellplatzNr !== undefined && text(z[s.stellplatzNr])) {
    nr = `SP${text(z[s.stellplatzNr]).replace(/^s?p?/i, "")}`;
  }
  if (s.garageNr === undefined && s.stellplatzNr === undefined) return undefined;
  // „(keine Nr. angegeben)“: laut Teilungserklärung keine Garage an dieser Wohnung.
  if (!nr || /^\(?keine/i.test(nr) || statusText.startsWith("keine")) return null;
  if (/^s/i.test(nr)) art = "stellplatz";
  let status: GaragenStatus;
  if (/extern|fremd/.test(statusText)) status = "extern";
  else if (statusText.includes("vermietet") || statusText.includes("eigene wohnung")) status = "eigener_mieter";
  else if (statusText.includes("frei")) status = "frei";
  else status = istMiete && istMiete > 0 ? "eigener_mieter" : "frei";
  return { nr: nr.toUpperCase(), art, status, istMiete };
}

export type PruefErgebnis = "gleich" | "abweichend" | "fehlt";

export interface ImportZeile {
  zeile: number;
  we: string;
  wohnung?: ObjektWohnung;
  investagon: boolean;
  flaeche: { liste: number | null; crm: number | null; ergebnis: PruefErgebnis };
  kaufpreis: { wohnung: number | null; garage: number | null; crm: number | null; ergebnis: PruefErgebnis };
  mieter?: { name: string; aktion: "neu" | "aktualisieren" | "unverändert" | "anderer Mieter"; vorhanden?: Mieter; kaltmiete: number | null; beginn: string; befristetBis: string };
  garage?: { neu: EinheitGarage | null; aktion: "setzen" | "entfernen" | "unverändert" };
  hinweise: string[];
}

const nah = (a: number, b: number, toleranz: number) => Math.abs(a - b) <= toleranz;

export function importPlanen(
  blatt: Blatt,
  wohnungen: ObjektWohnung[],
  mieter: Mieter[],
  garageVon: (wohnungId: string) => EinheitGarage | null,
): { kopf: Kopf | null; zeilen: ImportZeile[] } {
  const kopf = kopfErkennen(blatt);
  if (!kopf) return { kopf, zeilen: [] };
  const s = kopf.spalten;
  const zeilen: ImportZeile[] = [];
  const gesehen = new Set<number>();
  blatt.zeilen.slice(kopf.zeile + 1).forEach((z, i) => {
    const nr = weNummer(z[s.we!]);
    if (nr === null) return;
    const zeilenNr = kopf.zeile + i + 2;
    const hinweise: string[] = [];
    if (gesehen.has(nr)) {
      zeilen.push({ zeile: zeilenNr, we: text(z[s.we!]), investagon: false, flaeche: { liste: null, crm: null, ergebnis: "fehlt" },
        kaufpreis: { wohnung: null, garage: null, crm: null, ergebnis: "fehlt" },
        hinweise: [`WE ${nr} steht mehrfach in der Liste (etwa eine zweite Garage). Diese Zeile wird nicht übernommen.`] });
      return;
    }
    gesehen.add(nr);
    const wohnung = wohnungen.find((w) => weNummer(w.weNr) === nr);
    const investagon = !!wohnung && ausInvestagon(wohnung);
    if (!wohnung) hinweise.push("Keine Einheit mit dieser Nummer im CRM.");

    const flaecheListe = s.flaeche !== undefined ? zahl(z[s.flaeche]) : null;
    const flaecheCrm = wohnung?.groesse || null;
    const flaeche = {
      liste: flaecheListe, crm: flaecheCrm,
      ergebnis: (flaecheListe === null || flaecheCrm === null ? "fehlt" : nah(flaecheListe, flaecheCrm, 0.005) ? "gleich" : "abweichend") as PruefErgebnis,
    };

    const kpW = s.kaufpreis !== undefined ? zahl(z[s.kaufpreis]) : null;
    const kpG = s.garageKaufpreis !== undefined ? zahl(z[s.garageKaufpreis]) : null;
    const kpCrm = wohnung?.vkGesamt || null;
    let kpErgebnis: PruefErgebnis = "fehlt";
    if (kpW !== null && kpCrm !== null) {
      // Investagon führt die Garage teils im Gesamtpreis, teils daneben.
      kpErgebnis = nah(kpW, kpCrm, 1) || (kpG !== null && nah(kpW + kpG, kpCrm, 1)) ? "gleich" : "abweichend";
    }
    if (investagon && (flaeche.ergebnis === "abweichend" || kpErgebnis === "abweichend")) {
      hinweise.push("Kaufpreis oder Fläche weichen ab. Das Objekt kommt aus Investagon, bitte dort anpassen.");
    }

    const zeile: ImportZeile = { zeile: zeilenNr, we: text(z[s.we!]), wohnung, investagon, flaeche,
      kaufpreis: { wohnung: kpW, garage: kpG, crm: kpCrm, ergebnis: kpErgebnis }, hinweise };

    if (wohnung && s.mieter !== undefined) {
      const name = text(z[s.mieter]);
      const kaltmiete = s.istKaltmiete !== undefined ? zahl(z[s.istKaltmiete]) : null;
      const beginn = s.mietbeginn !== undefined ? excelDatumIso(z[s.mietbeginn]) : "";
      const befristetBis = s.befristetBis !== undefined ? excelDatumIso(z[s.befristetBis]) : "";
      if (istMietername(name)) {
        const vorhanden = aktuellerMieter(mieter, wohnung.id);
        let aktion: NonNullable<ImportZeile["mieter"]>["aktion"] = "neu";
        if (vorhanden) {
          const gleicherName = norm(vorhanden.nachname) === norm(nameTeilen(name).nachname);
          if (!gleicherName) {
            aktion = "anderer Mieter";
            hinweise.push(`Im CRM steht ein anderer Mieter (${vorhanden.nachname}). Nicht geändert, bitte prüfen.`);
          } else {
            const geaendert = (kaltmiete !== null && !nah(kaltmiete, vorhanden.kaltmiete, 0.005))
              || (!!beginn && beginn !== vorhanden.mietvertragBeginn)
              || (!!befristetBis && befristetBis !== vorhanden.mietvertragEnde);
            aktion = geaendert ? "aktualisieren" : "unverändert";
          }
        }
        zeile.mieter = { name, aktion, vorhanden, kaltmiete, beginn, befristetBis };
      } else if (kaltmiete) {
        hinweise.push(`Ist-Miete ${kaltmiete} € ohne Mieter („${name || "leer"}“) wird nicht übernommen.`);
      }
    }

    if (wohnung) {
      const neu = garageAusZeile(z, s);
      if (neu !== undefined) {
        const alt = garageVon(wohnung.id);
        const aktion = JSON.stringify(neu) === JSON.stringify(alt) ? "unverändert" : neu ? "setzen" : alt ? "entfernen" : "unverändert";
        zeile.garage = { neu, aktion };
      }
    }
    zeilen.push(zeile);
  });
  return { kopf, zeilen };
}

/** Wie viele Änderungen der Plan schreibt, für die Bestätigung. */
export function planZaehlen(zeilen: ImportZeile[]) {
  return {
    mieterNeu: zeilen.filter((z) => z.mieter?.aktion === "neu").length,
    mieterAktualisiert: zeilen.filter((z) => z.mieter?.aktion === "aktualisieren").length,
    garagen: zeilen.filter((z) => z.garage && z.garage.aktion !== "unverändert").length,
    stammdaten: zeilen.filter((z) => z.wohnung && !z.investagon && (z.flaeche.ergebnis === "abweichend" || z.kaufpreis.ergebnis === "abweichend")).length,
    abweichendInvestagon: zeilen.filter((z) => z.investagon && (z.flaeche.ergebnis === "abweichend" || z.kaufpreis.ergebnis === "abweichend")).length,
    ohneEinheit: zeilen.filter((z) => !z.wohnung).length,
  };
}

export interface ImportSchreiber {
  mieterAnlegen: (m: Omit<Mieter, "id" | "erstelltAm">) => void;
  mieterAendern: (id: string, felder: Partial<Mieter>) => void;
  garageSetzen: (wohnungId: string, garage: EinheitGarage | null) => Promise<void>;
  wohnungAendern: (wohnungId: string, felder: Partial<ObjektWohnung>) => Promise<unknown | null>;
}

/** Schreibt den Plan. Gibt die Fehler als Sätze zurück; was gelang, bleibt geschrieben. */
export async function importAusfuehren(
  objekt: { id: string; titel: string },
  zeilen: ImportZeile[],
  quelle: string,
  w: ImportSchreiber,
): Promise<string[]> {
  const fehler: string[] = [];
  for (const z of zeilen) {
    const wohnung = z.wohnung;
    if (!wohnung) continue;
    try {
      const m = z.mieter;
      if (m?.aktion === "neu") {
        w.mieterAnlegen({
          ...nameTeilen(m.name), email: "", telefon: "",
          objektId: objekt.id, objektName: objekt.titel, wohneinheitId: wohnung.id, wohneinheitName: wohnung.weNr,
          mietvertragBeginn: m.beginn, mietvertragEnde: m.befristetBis, kaltmiete: m.kaltmiete ?? 0, nebenkosten: 0, kaution: 0,
          kautionEingegangen: false, status: "aktiv", dokumente: [], zahlungen: [], notizen: `Übernommen aus ${quelle}`,
        });
      } else if (m?.aktion === "aktualisieren" && m.vorhanden) {
        w.mieterAendern(m.vorhanden.id, {
          ...(m.kaltmiete !== null ? { kaltmiete: m.kaltmiete } : {}),
          ...(m.beginn ? { mietvertragBeginn: m.beginn } : {}),
          ...(m.befristetBis ? { mietvertragEnde: m.befristetBis } : {}),
        });
      }
      if (z.garage && z.garage.aktion !== "unverändert") await w.garageSetzen(wohnung.id, z.garage.neu);
      if (!z.investagon) {
        const felder: Partial<ObjektWohnung> = {};
        if (z.flaeche.ergebnis === "abweichend" && z.flaeche.liste !== null) felder.groesse = z.flaeche.liste;
        if (z.kaufpreis.ergebnis === "abweichend" && z.kaufpreis.wohnung !== null) felder.vkGesamt = z.kaufpreis.wohnung;
        if (Object.keys(felder).length) {
          const f = await w.wohnungAendern(wohnung.id, felder);
          if (f) fehler.push(`${z.we}: Kaufpreis oder Fläche nicht gespeichert.`);
        }
      }
    } catch (e) {
      fehler.push(`${z.we}: ${e instanceof Error ? e.message : "nicht gespeichert"}`);
    }
  }
  return fehler;
}
