/**
 * Vorbelegung des persönlichen Objektvergleichs (Christian, 28.10.2026):
 * Objektdaten aus der Objektanlage, Einheiten über `vorbelegungAusEinheit`
 * (Kaufpreis, Garage, Hausgeld U/N/R, Ist-Miete), Kundendaten aus der
 * Selbstauskunft des Investments. Was das System nicht kennt, steht als
 * Vorgabe am Objekt (`meta.objektvergleich`, einmal gepflegt) oder wird im
 * Vergleich eingetragen.
 */
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { objektseiteFelder } from "@/lib/objektseiteDaten";
import { num } from "@/lib/kundenkontextHelper";
import { vorbelegungAusEinheit } from "./objektVorbelegung";
import {
  LEERE_TEXTE, STANDARD_ANNAHMEN,
  type KundenObjektvergleich, type VergleichAnnahmen, type VergleichEinheit, type VergleichKunde, type VergleichObjekt,
} from "./kundenObjektvergleich";

/** Vorgaben am Objekt, `objekte.meta.objektvergleich`. Alles optional. */
export interface ObjektvergleichVorgaben {
  mieteSubQm?: number;
  subventionMonate?: number;
  mieteZielQm?: number;
  mieteZielJahr?: number;
  vergleichsmieteQm?: number;
  vergleichsmieteQuelle?: string;
  garageMiete1?: number;
  garageMieteZiel?: number;
  garageIstVon?: number;
  garageIstBis?: number;
  hausPunkte?: string[];
}

export function vorgabenAus(objekt: Pick<ObjektData, "meta">): ObjektvergleichVorgaben {
  const v = (objekt.meta as Record<string, unknown> | undefined)?.objektvergleich;
  return v && typeof v === "object" ? (v as ObjektvergleichVorgaben) : {};
}

const positiv = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
const runde2 = (x: number) => Math.round(x * 100) / 100;

export function einheitAus(objekt: ObjektData, wohnung: ObjektWohnung, vorgaben: ObjektvergleichVorgaben, heute = new Date()): VergleichEinheit {
  const e = vorbelegungAusEinheit(objekt, wohnung, heute).eingabe;
  const qm = positiv(e.area) || positiv(wohnung.groesse);
  const mieteIst = positiv(e.monthlyColdRent);
  // Subventionierte Miete: Vorgabe am Objekt, sonst Mietgarantie der Einheit, sonst heutige Miete.
  const mieteSubQm = positiv(vorgaben.mieteSubQm)
    || (qm ? runde2(positiv(wohnung.mietgarantieKalt) / qm) : 0)
    || (qm ? runde2(mieteIst / qm) : 0);
  const garageKp = positiv(e.garagePrice);
  const garageMiete1 = positiv(vorgaben.garageMiete1) || positiv(e.monthlyGarageRent);
  const afa = objekt.afaDaten;
  const afaJahre = positiv(afa?.restnutzungsdauer) || Math.round(100 / (positiv(e.buildingDepreciationRate) || 2));
  return {
    wohnungId: wohnung.id,
    nr: String(wohnung.weNr || ""),
    zimmer: positiv(e.rooms) || positiv(wohnung.zimmer),
    qm,
    lage: [wohnung.etage, wohnung.lage].filter(Boolean).join(" "),
    kpWohnung: Math.max(0, positiv(e.purchasePrice) - garageKp),
    kpListe: 0,
    garagen: garageKp > 0 || garageMiete1 > 0 ? 1 : 0,
    garageKp,
    garageMiete1,
    garageMieteZiel: positiv(vorgaben.garageMieteZiel) || garageMiete1,
    garageIstVon: positiv(vorgaben.garageIstVon),
    garageIstBis: positiv(vorgaben.garageIstBis),
    mieteIst,
    mieteSubQm,
    u: positiv(e.housingFeeRecoverable),
    n: positiv(e.housingFeeNonRecoverable) + positiv(e.monthlyOperatingCosts),
    r: positiv(e.monthlyReserveContribution),
    afaJahre,
  };
}

export function objektAus(objekt: ObjektData, vorgaben: ObjektvergleichVorgaben): VergleichObjekt {
  const felder = objektseiteFelder(objekt);
  const baujahr = objekt.globalDaten?.baujahr;
  const bilder = [...(objekt.bilder || [])].sort((a, b) => a.reihenfolge - b.reihenfolge).map((b) => b.url).filter(Boolean);
  const titelbild = objekt.bildUrl || bilder[0] || "";
  const verwaltung = (felder as { verwaltung?: string }).verwaltung?.split(",")[0]?.trim() || "";
  const punkte = vorgaben.hausPunkte?.length ? vorgaben.hausPunkte : [
    baujahr ? `Baujahr ${baujahr}` : "",
    felder.energieausweis?.klasse ? `Energieeffizienzklasse ${felder.energieausweis.klasse}` : "",
    verwaltung ? `Verwaltung ${verwaltung}` : "",
  ].filter(Boolean);
  const wp = (objekt.meta as Record<string, any> | undefined)?.wirtschaftsplan; // eslint-disable-line @typescript-eslint/no-explicit-any
  const wpJahr = typeof wp?.gueltigAb === "string" ? wp.gueltigAb.slice(0, 4) : "";
  return {
    objektId: objekt.id,
    strasse: objekt.adresse || objekt.titel,
    ortZeile: [objekt.plz, objekt.ort].filter(Boolean).join(" "),
    fotoTitel: titelbild,
    fotoHaus: bilder.find((u) => u !== titelbild) || titelbild,
    hausPunkte: punkte,
    verwaltung,
    vergleichsmieteQm: positiv(vorgaben.vergleichsmieteQm),
    vergleichsmieteQuelle: vorgaben.vergleichsmieteQuelle || "",
    wirtschaftsplan: wpJahr ? `Wirtschaftsplan ${wpJahr}` : "Wirtschaftsplan",
  };
}

type Roh = Record<string, unknown>;
const obj = (x: unknown): Roh => (x && typeof x === "object" && !Array.isArray(x) ? (x as Roh) : {});
const liste = (x: unknown): Roh[] => (Array.isArray(x) ? x.map(obj) : []);
const text = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const eur0 = (x: number) => `${Math.round(x).toLocaleString("de-DE")} €`;

/** Jahre bis 67 aus dem Geburtsdatum (JJJJ-MM-TT oder TT.MM.JJJJ), sonst 0. */
export function jahreBisRente(geburtsdatum: string, heute = new Date()): number {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(geburtsdatum) ? geburtsdatum.slice(0, 10)
    : (/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(geburtsdatum)?.slice(1).reverse().map((t) => t.padStart(2, "0")).join("-") ?? "");
  const jahr = Number(iso.slice(0, 4));
  if (!jahr) return 0;
  return Math.max(0, jahr + 67 - heute.getFullYear());
}

/** Kundendaten aus Kontakt und Selbstauskunft des Investments. */
export function kundeAus(
  kontakt: { anrede?: string; vorname?: string; nachname?: string; geburtstag?: string } | null,
  saRoh: unknown,
  saDatum: string,
  heute = new Date(),
): VergleichKunde {
  const sa = obj(saRoh);
  const ek = obj(sa.einkommen);
  const kinder = liste(sa.kinder);
  const kredite = liste(sa.kredite);
  const raten = kredite.reduce((s, k) => s + num(k.rate), 0);
  const anst = obj(sa.anstellung);
  const seit = text(anst.angestelltSeit).slice(0, 4);
  const art = text(sa.beschaeftigungsart);
  const vertrag = text(sa.arbeitsvertragArt);
  const mietart = text(sa.mietart);
  const mieteWarm = num(sa.mieteWarm);
  return {
    anrede: text(sa.anrede) || kontakt?.anrede || "",
    vorname: text(sa.vorname) || kontakt?.vorname || "",
    nachname: text(sa.nachname) || kontakt?.nachname || "",
    netto: num(ek.netto),
    bruttoJahr: num(sa.bruttoJahr),
    steuerklasse: text(sa.steuerklasse),
    familienstand: text(sa.familienstand),
    kinder: kinder.length ? String(kinder.length) : "keine",
    beschaeftigung: [art, vertrag, seit ? `seit ${seit}` : ""].filter(Boolean).join(", "),
    antrag: sa.person2 === true ? "zu zweit, mit Mitantragsteller" : "allein, ohne Mitantragsteller",
    wohnsituation: [mietart.replace(/^Zur /, "zur "), mieteWarm ? `${eur0(mieteWarm)} warm` : ""].filter(Boolean).join(", "),
    mieteWarm,
    lebenshaltung: num(sa.lebenshaltungskosten),
    kredite: kredite.length ? `${kredite.length} Kredit${kredite.length > 1 ? "e" : ""}, ${eur0(raten)} im Monat` : "keine",
    kreditRaten: raten,
    kapital: liste(sa.vermoegenswerte).reduce((s, v) => s + num(v.betrag), 0),
    jahreBisRente: jahreBisRente(text(sa.geburtsdatum) || kontakt?.geburtstag || "", heute),
    saDatum,
  };
}

export function annahmenAus(vorgaben: ObjektvergleichVorgaben, heute = new Date()): VergleichAnnahmen {
  return {
    ...STANDARD_ANNAHMEN,
    startJahr: heute.getFullYear(),
    mieteZielQm: positiv(vorgaben.mieteZielQm) || STANDARD_ANNAHMEN.mieteZielQm,
    mieteZielJahr: positiv(vorgaben.mieteZielJahr) || STANDARD_ANNAHMEN.mieteZielJahr,
    subventionMonate: positiv(vorgaben.subventionMonate) || STANDARD_ANNAHMEN.subventionMonate,
  };
}

/** Ein neuer Vergleich aus Objekt, zwei Einheiten und (optional) Kunde. */
export function neuerVergleich(p: {
  objekt: ObjektData;
  wohnungen: ObjektWohnung[];
  kontaktId: string | null;
  investmentId: string | null;
  kunde: VergleichKunde;
  heute?: Date;
}): KundenObjektvergleich {
  const heute = p.heute ?? new Date();
  const vorgaben = vorgabenAus(p.objekt);
  return {
    version: 1,
    stand: heute.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
    kontaktId: p.kontaktId,
    investmentId: p.investmentId,
    variante: "",
    kunde: p.kunde,
    objekt: objektAus(p.objekt, vorgaben),
    annahmen: annahmenAus(vorgaben, heute),
    einheiten: p.wohnungen.map((w) => einheitAus(p.objekt, w, vorgaben, heute)),
    texte: { ...LEERE_TEXTE },
  };
}

/** Was „Als Standard am Objekt speichern“ schreibt. */
export function vorgabenAusVergleich(v: KundenObjektvergleich): ObjektvergleichVorgaben {
  const e = v.einheiten[0];
  return {
    mieteSubQm: e?.mieteSubQm, subventionMonate: v.annahmen.subventionMonate,
    mieteZielQm: v.annahmen.mieteZielQm, mieteZielJahr: v.annahmen.mieteZielJahr,
    vergleichsmieteQm: v.objekt.vergleichsmieteQm, vergleichsmieteQuelle: v.objekt.vergleichsmieteQuelle,
    garageMiete1: e?.garageMiete1, garageMieteZiel: e?.garageMieteZiel, garageIstVon: e?.garageIstVon, garageIstBis: e?.garageIstBis,
    hausPunkte: v.objekt.hausPunkte,
  };
}
