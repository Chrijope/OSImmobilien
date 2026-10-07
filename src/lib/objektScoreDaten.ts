import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Koordinate } from "@/lib/umgebung";
import { getEigeneSaData, getInvestments } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";
import { selbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";
import { energieeffizienzklasse, rohdaten, type MitInvestagonRohdaten } from "@/lib/investagonFelder";
import { objektartAbleiten, objektartInfo, objektseiteFelder } from "@/lib/objektseiteDaten";
import { istGemessen, type StandortAnalyse } from "@/lib/standortanalyse";
import { wohnortAus, wohnortGeoAmInvestment } from "@/lib/wohnortKoordinate";
import { formatStand } from "@/lib/kundenkontextHelper";
import { vorbelegungAusEinheit } from "@/lib/investmentrechner/objektVorbelegung";
import { kundenUebernahmeFuer } from "@/lib/investmentrechner/kundenUebernahme";
import { berechneInvestment, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import {
  empfehlungsKandidaten, finanzierungsrahmen, gespeicherteObjektKoordinate,
  type EmpfehlungsKandidat, type Rahmen,
} from "@/lib/einheitEmpfehlung";
import type { ZugangsNutzer } from "@/lib/objektZugang";
import {
  MIKROLAGE_UMKREIS_M, bewerteEinheit, gueltigeZiele, vergleicheScore,
  type ObjektScore, type ScoreEinheit, type ScoreKunde, type ScoreRechnung,
} from "@/lib/objektScore";

/**
 * Die Zahlen für den Objektscore, aus dem Zwischenspeicher.
 *
 * Gelesen wird nur, was die Zeilensicherheit dem Nutzer ohnehin gibt: Kunden,
 * Investments und Selbstauskünfte aus `dataCache`, Objekte aus `getObjekte`.
 * Gerechnet wird im Browser, nichts geht an eine Function, nichts wird
 * gespeichert. Die Wohnortlage kommt nur aus dem, was am Investment gemerkt
 * ist; nachgeschlagen wird hier nie (dann fehlt die Nähe, Teilwert).
 *
 * EINE WAHRHEIT. Die Rechnung ist die des Investmentrechners: Vorbelegung aus
 * der Einheit (`vorbelegungAusEinheit`), Einkommen und Steuerklasse aus der
 * Selbstauskunft (`kundenUebernahmeFuer`), Rechenkern `berechneInvestment`.
 * Auch die AfA ist die des Rechners: linear mit dem Satz aus der
 * Vorbelegung, degressiv nur, wenn es am Objekt so gepflegt ist (Christian am
 * 04.10.2026: überall gleich rechnen).
 *
 * Vorbereitet wird einmal je Einheit (WeakMap an der Einheit, die bei jeder
 * Änderung im Zwischenspeicher neu entsteht) und einmal je Kunde.
 */

// ── Kunde ───────────────────────────────────────────────────────────────

export interface KundenScoreDaten {
  investmentId: string;
  kontaktId: string;
  kunde: ScoreKunde;
  /** Einkommen, Steuerklasse und Veranlagung für den Rechenkern. */
  steuer: Partial<InvestmentEingabe>;
  steuerBekannt: boolean;
  wohnort: Koordinate | null;
  /** Stand der Selbstauskunft, „18.09.2026“, leer wenn unbekannt. */
  saStand: string;
}

/**
 * Den Kunden eines Investments vorbereiten. `rahmen` überschreibt den aus der
 * Selbstauskunft gerechneten, damit die Objektauswahl denselben nimmt, den sie
 * anzeigt.
 */
export function kundenScoreDaten(
  investmentId: string,
  kontaktId: string,
  opt: { rahmen?: Rahmen | null; wohnort?: Koordinate | null } = {},
): KundenScoreDaten {
  const sa = getEigeneSaData(investmentId);
  const fin = sa ? calculateFinanzierbarkeitFromSaData(sa) : null;
  const rahmen = opt.rahmen !== undefined
    ? opt.rahmen
    : fin && !selbstauskunftEntfaellt(investmentId) ? finanzierungsrahmen(fin.minRahmen, fin.maxRahmen) : null;
  const uebernahme = kundenUebernahmeFuer(kontaktId, investmentId);
  const steuer = uebernahme.aenderung;
  let wohnort = opt.wohnort ?? null;
  if (opt.wohnort === undefined) {
    const w = wohnortAus(sa, getKontaktById(kontaktId));
    const geo = w?.plz ? wohnortGeoAmInvestment(investmentId, w.plz) : null;
    wohnort = geo ? { lat: geo.lat, lng: geo.lng } : null;
  }
  return {
    investmentId,
    kontaktId,
    kunde: {
      rahmen,
      ueberschussMonat: fin ? fin.ueberschuss : null,
      eigenkapital: fin ? fin.eigenkapital : null,
      ziele: gueltigeZiele(sa?.wuenscheZiele),
    },
    steuer,
    steuerBekannt: (steuer.taxableIncomeCustomer ?? 0) > 0,
    wohnort,
    saStand: formatStand(uebernahme.hinweis.stand),
  };
}

// ── Einheit ─────────────────────────────────────────────────────────────

export interface EinheitScoreBasis {
  fakten: Omit<ScoreEinheit, "schluessel" | "objektId" | "gesamtkosten" | "kaufpreis" | "passt" | "rendite" | "entfernungKm">;
  /** Die vorbelegte Eingabe des Rechners, null ohne Kaufpreis oder Miete. */
  eingabe: InvestmentEingabe | null;
}

const alsRoh = (w?: ObjektWohnung | null): MitInvestagonRohdaten | null => (w ? { meta: { investagonRaw: w.investagonRaw } } : null);
const KLASSE = /^(A\+|[A-H])$/;

function rohJahr(wert: unknown): number | undefined {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1800 && n <= 2100 ? n : undefined;
}

/** Das Globalobjekt als eine Einheit für den Rechner: ganzes Haus, Verkaufspreis, Jahresmiete. */
function hausAlsEinheit(objekt: ObjektData, k: EmpfehlungsKandidat): ObjektWohnung {
  return {
    id: objekt.id, weNr: "", etage: "", lage: "", groesse: k.groesse, zimmer: 0,
    mieteGesamt: k.kaltmiete, vkGesamt: k.kaufpreis, qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
    investagonRaw: rohdaten(objekt) as Record<string, unknown> | undefined,
  } as ObjektWohnung;
}

const basisSpeicher = new WeakMap<object, EinheitScoreBasis>();

export function einheitScoreBasis(objekt: ObjektData, wohnung: ObjektWohnung, jahr = new Date().getFullYear()): EinheitScoreBasis {
  const gemerkt = basisSpeicher.get(wohnung);
  if (gemerkt) return gemerkt;

  const felder = objektseiteFelder(objekt);
  const rohO = rohdaten(objekt);
  const rohW = rohdaten(alsRoh(wohnung));
  const baujahr = objekt.globalDaten?.baujahr || rohJahr(rohO?.object_building_year) || rohJahr(rohW?.object_building_year);
  const klasseRoh = (felder.energieausweis.klasse || energieeffizienzklasse(alsRoh(wohnung)) || "").trim().toUpperCase();
  const sanierungsjahre = felder.sanierungen.map((s) => rohJahr(s.jahr)).filter((j): j is number => !!j);
  const saniertJahr = sanierungsjahre.length ? Math.max(...sanierungsjahre) : rohJahr(rohW?.object_renovation_year) ?? rohJahr(rohO?.object_renovation_year);
  const art = felder.objektart ?? objektartAbleiten(objekt);
  const istNeubau = art === "neubau" || art === "kfw40"
    || [rohO?.property_kind, rohW?.property_kind, objekt.globalDaten?.zustand].some((v) => String(v || "").toLowerCase() === "neubau");
  const neubau = istNeubau && (!baujahr || baujahr >= jahr - 5);

  const analyse = (objekt.meta as { standortanalyse?: StandortAnalyse } | undefined)?.standortanalyse;
  const nah = (liste?: { entfernung_m: number }[]) => !!liste?.some((o) => Number(o.entfernung_m) <= MIKROLAGE_UMKREIS_M);
  const m = istGemessen(analyse) ? analyse?.mikrolage ?? {} : null;

  let eingabe: InvestmentEingabe | null = null;
  try {
    const roh = vorbelegungAusEinheit(objekt, wohnung).eingabe;
    eingabe = roh.purchasePrice > 0 && roh.monthlyColdRent > 0 ? roh : null;
  } catch {
    // Unvollständige Daten dürfen die Liste nicht zerlegen: dann ohne Rechnung.
    eingabe = null;
  }
  const afaName = eingabe?.depreciationMethod === "declining" ? "degressive AfA"
    : objekt.afaDaten?.afaModell === "gutachten" ? "Gutachten-AfA" : "lineare AfA";
  const afaText = eingabe ? `${afaName} ${eingabe.buildingDepreciationRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %` : "";

  const basis: EinheitScoreBasis = {
    fakten: {
      baujahr: baujahr || undefined,
      energieklasse: KLASSE.test(klasseRoh) ? klasseRoh : undefined,
      saniertJahr,
      neubau,
      mikrolage: m ? {
        oepnv: nah(m.oepnv), einkauf: nah(m.einkaufen), aerzte: nah(m.aerzte), schule: nah(m.schulen) || nah(m.kindergaerten),
      } : null,
      konzept: objektartInfo(art)?.konzept,
      afaText,
    },
    eingabe,
  };
  basisSpeicher.set(wohnung, basis);
  return basis;
}

function wohnungZuKandidat(objekt: ObjektData, k: EmpfehlungsKandidat): ObjektWohnung | null {
  if (!k.wohnungId) return hausAlsEinheit(objekt, k);
  return [...(objekt.wohnungen || []), ...(objekt.wohnungenNichtImAngebot || [])].find((w) => w.id === k.wohnungId) ?? null;
}

/** Den Rechenkern für Einheit und Kunde laufen lassen. */
export function scoreRechnung(eingabe: InvestmentEingabe | null, kunde: KundenScoreDaten): ScoreRechnung | null {
  if (!eingabe) return null;
  try {
    const e = berechneInvestment({ ...eingabe, ...kunde.steuer });
    return {
      eigenanteilMonat: e.eigenanteilMonat,
      steuerwirkung: kunde.steuerBekannt ? e.cumulativeTaxEffect : null,
      grenzsteuersatz: kunde.steuerBekannt ? e.marginalTotalTaxRate : null,
      faktorJeEuro: e.faktorJeEuro,
      einsatz: e.eigenkapitalBasis,
      kaufnebenkosten: e.purchaseCosts,
    };
  } catch {
    return null;
  }
}

/** Der Score eines Kandidaten aus `empfehlungsKandidaten` für einen Kunden. */
export function scoreFuerKandidat(objekt: ObjektData, k: EmpfehlungsKandidat, kunde: KundenScoreDaten): ObjektScore {
  const wohnung = wohnungZuKandidat(objekt, k);
  const basis = wohnung ? einheitScoreBasis(objekt, wohnung) : null;
  const einheit: ScoreEinheit = {
    ...(basis?.fakten ?? { neubau: false, mikrolage: null, afaText: "" }),
    schluessel: k.schluessel,
    objektId: k.objektId,
    gesamtkosten: k.gesamtkosten,
    kaufpreis: k.kaufpreis + k.stellplatz,
    passt: k.passt,
    rendite: k.rendite,
    entfernungKm: k.entfernungKm,
  };
  return bewerteEinheit(einheit, kunde.kunde, scoreRechnung(basis?.eingabe ?? null, kunde));
}

// ── Passende Kunden je Einheit (Objektseite, Einheitenseite) ────────────

/**
 * Die Pipelinestufen, in denen ein Kunde ein Objekt sucht: von der
 * Selbstauskunft bis zum Follow-Up nach der Objektauswahl.
 */
export const SUCHENDE_STUFEN = ["selbstauskunft", "objektauswahl", "follow_up_objekt"] as const;

/**
 * Wer passende Kunden an Objekt und Einheit sieht, nach der aktiven Rolle.
 *
 * Admin, Inhaber und Vertriebsleitung über alle Kunden, die sie sehen. Seit
 * dem 04.10.2026 auch der Vertriebspartner, aber nur mit seinen eigenen
 * Kunden (`nurEigeneKunden`). Finanzierungspartner, Buchhaltung und
 * Objektpartner nicht.
 */
export function siehtPassendeKunden(rolle: string | undefined | null): boolean {
  return ["admin", "inhaber", "vertriebsleiter", "vertriebspartner"].includes(rolle || "");
}

/**
 * Der Vertriebspartner sieht nur seine eigenen Kunden: zuständig über die
 * Kennung oder als heutige Vertretung des Zuständigen. Nie über den Namen.
 */
export function nurEigeneKunden(rolle: string | undefined | null): boolean {
  return rolle === "vertriebspartner";
}

/** Zuständig über die Kennung oder als Vertretung des Zuständigen. Ohne Kennung nie. */
export function istEigenerKunde(
  zustaendigId: string | null | undefined,
  benutzerId: string | null | undefined,
  vertretungFuer?: ReadonlySet<string>,
): boolean {
  if (!zustaendigId || !benutzerId) return false;
  return zustaendigId === benutzerId || !!vertretungFuer?.has(zustaendigId);
}

export interface KundenTreffer {
  investmentId: string;
  kontaktId: string;
  name: string;
  partnerName: string;
  partnerId: string;
  pipelineStufe: string;
  rahmen: Rahmen;
  entfernungKm: number | null;
  score: ObjektScore;
}

export interface PassendeKunden {
  /** Je Einheit (Kandidatenschlüssel: Wohnungskennung, beim Globalobjekt die Objektkennung), bester zuerst. */
  jeEinheit: Map<string, KundenTreffer[]>;
  /** Kunden, für die mindestens eine Einheit einen Score hat. */
  kundenMitTreffer: number;
  /** Suchende Kunden ohne Rahmen, etwa ohne vollständige Selbstauskunft. */
  nichtBewertet: number;
  /** Alle suchenden Kunden, die der Nutzer sieht. */
  suchende: number;
}

/**
 * Für ein Objekt: welche suchenden Kunden zu welcher freien Einheit passen.
 *
 * Die Exklusivität wird je Kunde gegen dessen zuständigen Partner geprüft
 * (Einheit über die Kennung, Objekt über den Namen, weil am Objekt nur Namen
 * stehen). Ein Kunde ohne zuständigen Partner bekommt keine exklusiv
 * vergebene Einheit. Die eigene Vormerkung des Kunden schließt nichts aus.
 */
export function passendeKundenFuerObjekt(
  objekt: ObjektData,
  opt: {
    benutzerId?: string;
    nurEigene?: boolean;
    /** Nutzer-Kennungen, für die der Angemeldete heute Vertretung ist (`useVertretungen`). */
    vertretungFuer?: ReadonlySet<string>;
    jetzt?: Date;
  },
): PassendeKunden {
  const jeEinheit = new Map<string, KundenTreffer[]>();
  const mitTreffer = new Set<string>();
  const ohneRahmen = new Set<string>();
  const suchende = new Set<string>();

  const investments = getInvestments().filter((i) => (SUCHENDE_STUFEN as readonly string[]).includes(i.pipelineStufe));
  for (const inv of investments) {
    const kontakt = getKontaktById(inv.kontaktId);
    if (!kontakt) continue;
    if (opt.nurEigene && !istEigenerKunde(kontakt.zustaendig_id, opt.benutzerId, opt.vertretungFuer)) continue;
    suchende.add(kontakt.id);
    const daten = kundenScoreDaten(inv.id, kontakt.id);
    if (!daten.kunde.rahmen) { ohneRahmen.add(kontakt.id); continue; }

    const partner: ZugangsNutzer = { rolle: "vertriebspartner", benutzerId: kontakt.zustaendig_id || undefined, name: kontakt.berater || undefined };
    const kandidaten = empfehlungsKandidaten([objekt], {
      nutzer: partner, kundeId: kontakt.id, rahmen: daten.kunde.rahmen, wohnort: daten.wohnort,
      objektKoordinate: gespeicherteObjektKoordinate, jetzt: opt.jetzt,
    });
    for (const k of kandidaten) {
      if (!k.passt) continue;
      const score = scoreFuerKandidat(objekt, k, daten);
      if (score.wert === null) continue;
      mitTreffer.add(kontakt.id);
      const liste = jeEinheit.get(k.schluessel) ?? [];
      // Ein Kunde mit mehreren suchenden Investments steht nur einmal da, mit seinem besten Wert.
      const bisher = liste.findIndex((t) => t.kontaktId === kontakt.id);
      const treffer: KundenTreffer = {
        investmentId: inv.id, kontaktId: kontakt.id,
        name: [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ").trim() || "Kunde",
        partnerName: kontakt.berater || "", partnerId: kontakt.zustaendig_id || "",
        pipelineStufe: inv.pipelineStufe, rahmen: daten.kunde.rahmen, entfernungKm: k.entfernungKm, score,
      };
      if (bisher < 0) liste.push(treffer);
      else if (vergleicheScore(score, liste[bisher].score) < 0) liste[bisher] = treffer;
      jeEinheit.set(k.schluessel, liste);
    }
  }
  for (const liste of jeEinheit.values()) liste.sort((a, b) => vergleicheScore(a.score, b.score));
  for (const id of mitTreffer) ohneRahmen.delete(id);
  return { jeEinheit, kundenMitTreffer: mitTreffer.size, nichtBewertet: ohneRahmen.size, suchende: suchende.size };
}
