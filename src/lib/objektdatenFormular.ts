/**
 * Felder der Objektdaten im Formular „Objekt anlegen“ (17.10.2026).
 *
 * Christian legt Objekte künftig nur noch über das Formular an; was dort
 * steht, soll ohne zweite Eingabe in den Objektdaten erscheinen. Das Formular
 * hält die Werte als Text (wie die Eingabefelder), diese Datei übersetzt in
 * die Orte, aus denen die Objektdaten lesen, und zurück für den
 * Bearbeiten-Modus:
 *   - je Einheit `wohnungen.meta.listendaten.werte` und `wohnungen.meta.garage`,
 *     dazu der Mieter in der Tabelle `mieter`;
 *   - je Objekt `objekte.meta.mietgarantie`, `.mieterhoehung` und
 *     `.aufteilung.reservierungTage`;
 *   - seit dem 29.10.2026 die Mietentwicklung für die ausführliche Berechnung
 *     (Zielmiete, Zieljahr, Garagenmiete im Zieljahr, Quelle der
 *     Vergleichsmiete) in `objekte.meta.objektvergleich`, dieselben Vorgaben,
 *     die der persönliche Objektvergleich am Objekt speichert.
 */
import { excelDatumIso } from "./excelLesen";
import type { EinheitGarage, GaragenArt, GaragenStatus, ObjektMietgarantie, SubventionsArt } from "./mietgarantie";

export interface EinheitFormDaten {
  haus: string; mea: string; flaecheTe: string; sollMiete: string; letzteErhoehung: string; mieteVorErhoehung: string;
  /** Für die Mietzuzahlung (30.10.2026): ab wann und um wie viel Prozent die nächste Erhöhung möglich ist, Grundbuchblatt. */
  naechsteErhoehungAb: string; naechsteErhoehungProzent: string; grundbuchBlatt: string;
  garageNr: string; garageArt: GaragenArt; garageStatus: GaragenStatus; garageIstMiete: string;
  mieterName: string; mietbeginn: string; befristetBis: string; kaution: string;
}

export interface ObjektFormDaten {
  subventionArt: "" | SubventionsArt;
  zielQm: string; steigerungProzent: string; einmalBetrag: string; garageAnrechnung: string;
  laufzeitMonate: string; garagenSubventionMonate: string;
  vergleichsmieteQm: string; kappungsgrenzeProzent: string; reservierungTage: string;
  vergleichsmieteQuelle: string; mieteZielQm: string; mieteZielJahr: string; garageMieteZiel: string;
  /** Grundbuch des Hauses für die Mietzuzahlung (30.10.2026). */
  grundbuchVon: string; amtsgericht: string;
}

export const LEERE_EINHEIT: EinheitFormDaten = {
  haus: "", mea: "", flaecheTe: "", sollMiete: "", letzteErhoehung: "", mieteVorErhoehung: "",
  naechsteErhoehungAb: "", naechsteErhoehungProzent: "", grundbuchBlatt: "",
  garageNr: "", garageArt: "garage", garageStatus: "frei", garageIstMiete: "",
  mieterName: "", mietbeginn: "", befristetBis: "", kaution: "",
};

/** Deutsche oder einfache Zahl; leer oder unlesbar heißt null. */
export function zahlAus(s: string): number | null {
  const t = (s || "").trim().replace(/\s|€|%/g, "");
  if (!t) return null;
  // „1.200“ ohne Komma ist deutsch eintausendzweihundert, nicht 1,2.
  const deutsch = t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t);
  const n = Number(deutsch ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
const text = (n: unknown) => (typeof n === "number" ? String(n).replace(".", ",") : typeof n === "string" ? n : "");
const datum = (v: unknown) => (typeof v === "string" || typeof v === "number" ? excelDatumIso(v) || "" : "");

type Werte = Record<string, unknown>;
interface MieterAuszug { vorname: string; nachname: string; mietvertragBeginn: string; mietvertragEnde: string; kaution: number }

export function einheitFormAus(werte: Werte | undefined, garage: EinheitGarage | null, mieter: MieterAuszug | null): EinheitFormDaten {
  const w = werte ?? {};
  return {
    haus: text(w.haus), mea: text(w.mea), flaecheTe: text(w.flaecheTe), sollMiete: text(w.sollMiete),
    letzteErhoehung: datum(w.letzteErhoehung), mieteVorErhoehung: text(w.mieteVorErhoehung),
    naechsteErhoehungAb: datum(w.naechsteErhoehungAb), naechsteErhoehungProzent: text(w.naechsteErhoehungProzent), grundbuchBlatt: text(w.grundbuchBlatt),
    garageNr: garage?.nr ?? "", garageArt: garage?.art ?? "garage", garageStatus: garage?.status ?? "frei", garageIstMiete: text(garage?.istMiete ?? ""),
    mieterName: mieter ? `${mieter.vorname} ${mieter.nachname}`.trim() : "",
    mietbeginn: mieter?.mietvertragBeginn ?? "", befristetBis: mieter?.mietvertragEnde ?? "", kaution: mieter?.kaution ? text(mieter.kaution) : "",
  };
}

/**
 * Was beim Speichern an der Einheit ankommt. Die Listenwerte, die das
 * Formular kennt, werden gesetzt oder (leer) entfernt; alle übrigen Werte
 * der Liste bleiben stehen. Garage: ohne Nummer keine Garage.
 */
export function einheitFormInDaten(f: EinheitFormDaten, alteWerte: Werte | undefined) {
  const werte: Werte = { ...(alteWerte ?? {}) };
  const setze = (k: string, v: string | number | null) => { if (v === null || v === "") delete werte[k]; else werte[k] = v; };
  setze("haus", f.haus.trim());
  setze("mea", zahlAus(f.mea));
  setze("flaecheTe", zahlAus(f.flaecheTe));
  setze("sollMiete", zahlAus(f.sollMiete));
  setze("letzteErhoehung", f.letzteErhoehung);
  setze("mieteVorErhoehung", zahlAus(f.mieteVorErhoehung));
  setze("naechsteErhoehungAb", f.naechsteErhoehungAb);
  setze("naechsteErhoehungProzent", zahlAus(f.naechsteErhoehungProzent));
  setze("grundbuchBlatt", f.grundbuchBlatt.trim());
  const garage: EinheitGarage | null = f.garageNr.trim()
    ? { nr: f.garageNr.trim(), art: f.garageArt, status: f.garageStatus, istMiete: f.garageStatus === "frei" ? null : zahlAus(f.garageIstMiete) }
    : null;
  const mieter = f.mieterName.trim()
    ? { name: f.mieterName.trim(), beginn: f.mietbeginn, befristetBis: f.befristetBis, kaution: zahlAus(f.kaution) ?? 0 }
    : null;
  return { werte, garage, mieter };
}

export function objektFormAus(meta: unknown, mietgarantie: ObjektMietgarantie | null): ObjektFormDaten {
  const m = (meta ?? {}) as {
    mieterhoehung?: { kappungsgrenze?: unknown; vergleichsmieteQm?: unknown }; aufteilung?: { reservierungTage?: unknown };
    grundbuch?: { von?: unknown; amtsgericht?: unknown };
    objektvergleich?: { vergleichsmieteQuelle?: unknown; mieteZielQm?: unknown; mieteZielJahr?: unknown; garageMieteZiel?: unknown };
  };
  const ov = m.objektvergleich ?? {};
  const k = Number(m.mieterhoehung?.kappungsgrenze);
  return {
    subventionArt: mietgarantie?.art ?? "",
    zielQm: mietgarantie?.zielQm ? text(mietgarantie.zielQm) : "",
    steigerungProzent: mietgarantie?.steigerung ? text(Math.round(mietgarantie.steigerung * 10000) / 100) : "",
    einmalBetrag: mietgarantie?.einmalBetrag ? text(mietgarantie.einmalBetrag) : "",
    garageAnrechnung: mietgarantie?.garageAnrechnung ? text(mietgarantie.garageAnrechnung) : "",
    laufzeitMonate: mietgarantie ? text(mietgarantie.laufzeitMonate) : "",
    garagenSubventionMonate: mietgarantie ? text(mietgarantie.garagenSubventionMonate) : "",
    vergleichsmieteQm: text(m.mieterhoehung?.vergleichsmieteQm ?? ""),
    kappungsgrenzeProzent: Number.isFinite(k) && k > 0 ? text(Math.round(k * 10000) / 100) : "",
    reservierungTage: text(m.aufteilung?.reservierungTage ?? ""),
    vergleichsmieteQuelle: typeof ov.vergleichsmieteQuelle === "string" ? ov.vergleichsmieteQuelle : "",
    mieteZielQm: text(ov.mieteZielQm ?? ""),
    mieteZielJahr: text(ov.mieteZielJahr ?? ""),
    garageMieteZiel: text(ov.garageMieteZiel ?? ""),
    grundbuchVon: typeof m.grundbuch?.von === "string" ? m.grundbuch.von : "",
    amtsgericht: typeof m.grundbuch?.amtsgericht === "string" ? m.grundbuch.amtsgericht : "",
  };
}

/**
 * Teile für `objekte.meta`. `mietgarantie: null` entfernt die Regel (Art
 * „keine“). Die Kappungsgrenze kommt als Prozent und wird als Anteil
 * gespeichert, höchstens 20 % wie im Gesetz.
 */
export function objektFormInMeta(
  f: ObjektFormDaten,
  aufteilungAlt: Record<string, unknown> | undefined,
  objektvergleichAlt?: Record<string, unknown>,
) {
  const mietgarantie = f.subventionArt ? {
    art: f.subventionArt,
    zielQm: zahlAus(f.zielQm) ?? 0,
    steigerung: (zahlAus(f.steigerungProzent) ?? 0) / 100,
    einmalBetrag: zahlAus(f.einmalBetrag) ?? 0,
    garageAnrechnung: zahlAus(f.garageAnrechnung) ?? 0,
    laufzeitMonate: zahlAus(f.laufzeitMonate) ?? 36,
    garagenSubventionMonate: zahlAus(f.garagenSubventionMonate) ?? 12,
  } : null;
  const k = zahlAus(f.kappungsgrenzeProzent);
  const v = zahlAus(f.vergleichsmieteQm);
  const mieterhoehung = {
    ...(k !== null && k > 0 && k <= 20 ? { kappungsgrenze: k / 100 } : {}),
    ...(v !== null && v > 0 ? { vergleichsmieteQm: v } : {}),
  };
  const tage = zahlAus(f.reservierungTage);
  const aufteilung = { ...(aufteilungAlt ?? {}) };
  if (tage && tage > 0) aufteilung.reservierungTage = Math.round(tage); else delete aufteilung.reservierungTage;
  // Die übrigen Vorgaben des Objektvergleichs (Hauspunkte, Garagen-Ist-Miete …) bleiben stehen.
  const objektvergleich: Record<string, unknown> = { ...(objektvergleichAlt ?? {}) };
  const setze = (key: string, wert: number | string | null) => {
    if (wert === null || wert === "" || wert === 0) delete objektvergleich[key]; else objektvergleich[key] = wert;
  };
  setze("vergleichsmieteQuelle", f.vergleichsmieteQuelle.trim());
  setze("mieteZielQm", zahlAus(f.mieteZielQm));
  const jahr = zahlAus(f.mieteZielJahr);
  setze("mieteZielJahr", jahr && jahr > 2000 ? Math.round(jahr) : null);
  setze("garageMieteZiel", zahlAus(f.garageMieteZiel));
  const grundbuch = {
    ...(f.grundbuchVon.trim() ? { von: f.grundbuchVon.trim() } : {}),
    ...(f.amtsgericht.trim() ? { amtsgericht: f.amtsgericht.trim() } : {}),
  };
  return { mietgarantie, mieterhoehung, aufteilung, objektvergleich, grundbuch };
}
