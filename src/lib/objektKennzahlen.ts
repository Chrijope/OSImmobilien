import type { ObjektWohnung } from "@/lib/objekteStore";
import { istImAngebot } from "../../supabase/functions/_shared/einheit-angebot";
import { euroText, prozentText, SPRACH_LOCALE, zahlText, type FormatSprache } from "@/lib/sprachFormat";
import { BLICK_ZEILEN_TEXTE } from "@/lib/blickZeilenTexte";
import { heuteBerlinIso } from "@/lib/datumsformate";

/**
 * Rechenkern der Objektseite und der Einheiten-Seite.
 *
 * Reine Funktionen ohne Zugriff auf Cache oder Datenbank, damit sie sich
 * ohne Attrappen testen lassen und später vom Exposé (E3) und dem Rechner
 * (E2) mitbenutzt werden können.
 *
 * Es gibt genau eine Rendite: Jahreskaltmiete durch Kaufpreis. So hat es
 * Christian entschieden, damit Objektliste, Objektseite, Einheiten-Seite und
 * Exposé dieselbe Zahl zeigen. Hausgeld und Rücklage werden getrennt
 * ausgewiesen, nicht in die Rendite eingerechnet.
 */

export interface Spanne {
  von: number;
  bis: number;
}

/** Kleinster und größter Wert; leere Listen und Nullen fallen heraus. */
export function spanne(werte: Array<number | undefined | null>): Spanne | null {
  const gueltig = werte.filter((w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0);
  if (gueltig.length === 0) return null;
  return { von: Math.min(...gueltig), bis: Math.max(...gueltig) };
}

/** Die eine Rendite: Jahreskaltmiete durch Kaufpreis, in Prozent. */
export function renditeProzent(kaltmieteMonat: number, kaufpreis: number): number {
  if (!(kaufpreis > 0) || !(kaltmieteMonat > 0)) return 0;
  return (kaltmieteMonat * 12) / kaufpreis * 100;
}

/** Kaufpreis je Quadratmeter Wohnfläche. */
export function preisJeQm(kaufpreis: number, wohnflaeche: number): number {
  if (!(kaufpreis > 0) || !(wohnflaeche > 0)) return 0;
  return kaufpreis / wohnflaeche;
}

/** Kaltmiete je Quadratmeter Wohnfläche. */
export function mieteJeQm(kaltmieteMonat: number, wohnflaeche: number): number {
  if (!(kaltmieteMonat > 0) || !(wohnflaeche > 0)) return 0;
  return kaltmieteMonat / wohnflaeche;
}

/**
 * Die Miete, mit der gerechnet wird: die aktuelle Kaltmiete, bei einer
 * bereits erreichten Mieterhöhung die neue. Gleiche Regel wie
 * `getAktuelleMiete` im Store, hier ohne Datumsabhängigkeit vom Aufruf.
 */
// Heute in deutscher Zeit; der UTC-Tag hing nachts bis 02:00 Uhr zurück.
export function kaltmieteVon(w: Pick<ObjektWohnung, "mieteGesamt" | "neueMiete" | "mieterhoehungAb">, heute = heuteBerlinIso()): number {
  if (w.neueMiete && w.mieterhoehungAb && heute >= w.mieterhoehungAb) return w.neueMiete;
  return w.mieteGesamt || 0;
}

/**
 * Die Rendite einer Einheit, wie in den Kacheln: Jahreskaltmiete durch
 * Kaufpreis, mit der Miete aus `kaltmieteVon`. 0, wenn Miete oder Kaufpreis
 * fehlt.
 */
export function renditeVon(w: Pick<ObjektWohnung, "mieteGesamt" | "neueMiete" | "mieterhoehungAb" | "vkGesamt">, heute?: string): number {
  return renditeProzent(kaltmieteVon(w, heute), w.vkGesamt);
}

/**
 * Die Zellwerte einer Einheit in den Einheitentabellen, fertig formatiert.
 *
 * Gebraucht von der Wohneinheiten-Tabelle der Objektseite und von „Weitere
 * Einheiten in diesem Haus" auf der Einheitsseite, damit beide dieselben
 * Zahlen gleich schreiben. Ein fehlender Wert bleibt leer, wie bisher in
 * beiden Tabellen.
 */
export function einheitTabellenWerte(w: ObjektWohnung, heute?: string): {
  etage: string; zimmer: string; flaeche: string; kaufpreis: string; jeQm: string; kaltmiete: string; rendite: string;
} {
  const miete = kaltmieteVon(w, heute);
  const qm = preisJeQm(w.vkGesamt, w.groesse);
  const rendite = renditeVon(w, heute);
  return {
    etage: [w.etage, w.lage].filter(Boolean).join(" "),
    zimmer: w.zimmer ? zimmerText(w.zimmer) : "",
    flaeche: w.groesse > 0 ? `${dez(w.groesse, 1)} m²` : "",
    kaufpreis: w.vkGesamt > 0 ? eur0(w.vkGesamt) : "",
    jeQm: qm > 0 ? eur0(qm) : "",
    kaltmiete: miete > 0 ? eur0(miete) : "",
    rendite: rendite > 0 ? prozent(rendite, 2) : "",
  };
}

export interface EinheitenZaehler {
  gesamt: number;
  frei: number;
  reserviert: number;
  verkauft: number;
}

export interface ObjektKennzahlen {
  wohnflaeche: Spanne | null;
  wohnflaecheGesamt: number;
  zimmer: Spanne | null;
  kaufpreis: Spanne | null;
  volumen: number;
  einheiten: EinheitenZaehler;
  kaltmiete: Spanne | null;
  kaltmieteJeQm: Spanne | null;
  rendite: Spanne | null;
  preisJeQm: Spanne | null;
}

/** Die acht „von bis"-Kacheln der Objektseite aus der Einheitenliste. */
export function objektKennzahlen(wohnungen: ObjektWohnung[], heute?: string): ObjektKennzahlen {
  const mieten = wohnungen.map((w) => kaltmieteVon(w, heute));
  return {
    wohnflaeche: spanne(wohnungen.map((w) => w.groesse)),
    wohnflaecheGesamt: wohnungen.reduce((s, w) => s + (w.groesse > 0 ? w.groesse : 0), 0),
    zimmer: spanne(wohnungen.map((w) => w.zimmer)),
    kaufpreis: spanne(wohnungen.map((w) => w.vkGesamt)),
    volumen: wohnungen.reduce((s, w) => s + (w.vkGesamt > 0 ? w.vkGesamt : 0), 0),
    einheiten: zaehleEinheiten(wohnungen),
    kaltmiete: spanne(mieten),
    kaltmieteJeQm: spanne(wohnungen.map((w, i) => mieteJeQm(mieten[i], w.groesse))),
    rendite: spanne(wohnungen.map((w, i) => renditeProzent(mieten[i], w.vkGesamt))),
    preisJeQm: spanne(wohnungen.map((w) => preisJeQm(w.vkGesamt, w.groesse))),
  };
}

export function zaehleEinheiten(wohnungen: ObjektWohnung[]): EinheitenZaehler {
  const z: EinheitenZaehler = { gesamt: wohnungen.length, frei: 0, reserviert: 0, verkauft: 0 };
  for (const w of wohnungen) {
    if (w.status === "verkauft") z.verkauft++;
    else if (w.status === "reserviert") z.reserviert++;
    else z.frei++;
  }
  return z;
}

export interface VerkaufsstandTeil {
  anzahl: number;
  volumen: number;
  /** Anteil am Gesamtvolumen in Prozent, nach Kaufpreis */
  anteilProzent: number;
}

export interface Verkaufsstand {
  verkauft: VerkaufsstandTeil;
  reserviert: VerkaufsstandTeil;
  frei: VerkaufsstandTeil;
  gesamt: { anzahl: number; volumen: number };
}

/** Verkaufsstand nach Stück und Volumen, Anteile nach Kaufpreis. */
export function verkaufsstand(wohnungen: ObjektWohnung[]): Verkaufsstand {
  const teil = (status: ObjektWohnung["status"]): VerkaufsstandTeil => {
    const liste = wohnungen.filter((w) => w.status === status);
    return { anzahl: liste.length, volumen: liste.reduce((s, w) => s + (w.vkGesamt > 0 ? w.vkGesamt : 0), 0), anteilProzent: 0 };
  };
  const verkauft = teil("verkauft");
  const reserviert = teil("reserviert");
  const frei = teil("frei");
  const volumen = verkauft.volumen + reserviert.volumen + frei.volumen;
  for (const t of [verkauft, reserviert, frei]) t.anteilProzent = volumen > 0 ? (t.volumen / volumen) * 100 : 0;
  return { verkauft, reserviert, frei, gesamt: { anzahl: wohnungen.length, volumen } };
}

// ── Einheitentabelle ─────────────────────────────────────────────────────

export type EinheitenSortFeld = "weNr" | "etage" | "zimmer" | "groesse" | "vkGesamt" | "preisJeQm" | "mieteGesamt" | "rendite" | "status";
export type SortRichtung = "asc" | "desc";

const STATUS_RANG: Record<ObjektWohnung["status"], number> = { frei: 0, reserviert: 1, verkauft: 2 };

/**
 * WE-Nummern natürlich sortieren: „WE 2" vor „WE 10", und ein reiner
 * Zahlenwert ebenso. Ohne diese Regel stünde WE 10 zwischen WE 1 und WE 2.
 */
function vergleicheWeNr(a: string, b: string): number {
  return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
}

/** Etagen in Hausordnung: UG, EG, 1. OG, 2. OG, DG. Unbekanntes hinten. */
function etagenRang(etage: string): number {
  const e = (etage || "").trim().toLowerCase();
  if (!e) return 999;
  if (e.startsWith("ug") || e.includes("keller") || e.includes("souterrain")) return -1;
  if (e.startsWith("eg") || e.includes("erdgeschoss")) return 0;
  if (e.startsWith("dg") || e.includes("dach")) return 100;
  const n = parseInt(e, 10);
  return Number.isFinite(n) ? n : 500;
}

export function sortiereEinheiten(wohnungen: ObjektWohnung[], feld: EinheitenSortFeld, richtung: SortRichtung, heute?: string): ObjektWohnung[] {
  const faktor = richtung === "asc" ? 1 : -1;
  const wert = (w: ObjektWohnung): number => {
    switch (feld) {
      case "zimmer": return w.zimmer || 0;
      case "groesse": return w.groesse || 0;
      case "vkGesamt": return w.vkGesamt || 0;
      case "preisJeQm": return preisJeQm(w.vkGesamt, w.groesse);
      case "mieteGesamt": return kaltmieteVon(w, heute);
      case "rendite": return renditeVon(w, heute);
      case "status": return STATUS_RANG[w.status] ?? 9;
      case "etage": return etagenRang(w.etage);
      default: return 0;
    }
  };
  return [...wohnungen].sort((a, b) => {
    let d: number;
    if (feld === "weNr") d = vergleicheWeNr(a.weNr, b.weNr);
    else {
      d = wert(a) - wert(b);
      if (d === 0 && feld === "etage") d = (a.lage || "").localeCompare(b.lage || "", "de");
      if (d === 0) d = vergleicheWeNr(a.weNr, b.weNr);
    }
    return d * faktor;
  });
}

/** Der Schalter „Nur freie Einheiten": reservierte und verkaufte fallen weg. */
export function filtereEinheiten(wohnungen: ObjektWohnung[], nurFreie: boolean): ObjektWohnung[] {
  return nurFreie ? wohnungen.filter((w) => w.status === "frei") : wohnungen;
}

/** Verkaufte Einheiten bleiben sichtbar, aber ausgegraut und ohne Knopf. */
export function istEinheitInaktiv(w: Pick<ObjektWohnung, "status">): boolean {
  return w.status === "verkauft";
}

/**
 * Steht diese Einheit im Angebot?
 *
 * Christians Regel vom 23.09.2026: Angeboten wird nur, was in Investagon
 * online und nicht verkauft ist, und was im CRM nicht verkauft ist. Die Regel
 * selbst steht in `supabase/functions/_shared/einheit-angebot.ts`, damit der
 * Import und die Anzeige dieselbe benutzen. Hier nur die Huelle fuer die
 * Einheiten des Frontends.
 *
 * Wer eine Angebotsliste baut, filtert hiermit. Das Kundenprofil tut es
 * bewusst nicht, dort muss der Kauf des Kunden sichtbar bleiben.
 */
export function einheitImAngebot(w: Pick<ObjektWohnung, "status" | "investagonRaw">): boolean {
  return istImAngebot(w.status, w.investagonRaw);
}

/**
 * „Weitere Einheiten in diesem Haus": nur was im Angebot steht, die
 * aktuelle Einheit bleibt in der Liste und wird hervorgehoben. Speist auch
 * die Einheitenauswahl beim Exposé, damit dort keine verkaufte oder in
 * Investagon nicht angebotene Wohnung zu waehlen ist.
 */
export function weitereEinheiten(wohnungen: ObjektWohnung[], heute?: string): ObjektWohnung[] {
  return sortiereEinheiten(wohnungen.filter(einheitImAngebot), "weNr", "asc", heute);
}

// ── Einfache Finanzierung für den Reiter Finanzen (bis der Rechner kommt) ──

export interface EinfacheFinanzierungInput {
  kaufpreis: number;
  stellplatzPreis?: number;
  /** Kaufnebenkosten in Prozent vom Kaufpreis (Grunderwerbsteuer, Notar, Grundbuch) */
  nebenkostenProzent: number;
  zinsProzent: number;
  tilgungProzent: number;
  kaltmieteMonat: number;
  stellplatzMieteMonat?: number;
  hausgeldNichtUmlegbarMonat: number;
  verwaltungMonat: number;
}

export interface EinfacheFinanzierung {
  gesamtinvestition: number;
  nebenkosten: number;
  /** Darlehen über die volle Gesamtinvestition, die Nebenkosten trägt der Käufer selbst */
  darlehen: number;
  eigenkapitalEinsatz: number;
  rateMonat: number;
  zinsenMonatErstesJahr: number;
  tilgungMonatErstesJahr: number;
  einnahmenMonat: number;
  ausgabenMonat: number;
  /** Positiv: der Käufer zahlt monatlich zu. Negativ: Überschuss. */
  eigenanteilMonat: number;
}

/**
 * Standardannahmen wie in der Vorlage: 100 Prozent Finanzierung des
 * Kaufpreises, Nebenkosten aus Eigenkapital, Annuität aus Zins plus Tilgung.
 * Keine Steuer, keine Wertentwicklung. Das gehört in den Rechner (E2).
 */
export function einfacheFinanzierung(i: EinfacheFinanzierungInput): EinfacheFinanzierung {
  const gesamtinvestition = (i.kaufpreis > 0 ? i.kaufpreis : 0) + (i.stellplatzPreis && i.stellplatzPreis > 0 ? i.stellplatzPreis : 0);
  const nebenkosten = gesamtinvestition * (i.nebenkostenProzent / 100);
  const darlehen = gesamtinvestition;
  const rateMonat = darlehen * ((i.zinsProzent + i.tilgungProzent) / 100) / 12;
  const zinsenMonatErstesJahr = darlehen * (i.zinsProzent / 100) / 12;
  const einnahmenMonat = (i.kaltmieteMonat > 0 ? i.kaltmieteMonat : 0) + (i.stellplatzMieteMonat && i.stellplatzMieteMonat > 0 ? i.stellplatzMieteMonat : 0);
  const ausgabenMonat = rateMonat + Math.max(0, i.hausgeldNichtUmlegbarMonat) + Math.max(0, i.verwaltungMonat);
  return {
    gesamtinvestition,
    nebenkosten,
    darlehen,
    eigenkapitalEinsatz: nebenkosten,
    rateMonat,
    zinsenMonatErstesJahr,
    tilgungMonatErstesJahr: rateMonat - zinsenMonatErstesJahr,
    einnahmenMonat,
    ausgabenMonat,
    eigenanteilMonat: ausgabenMonat - einnahmenMonat,
  };
}

// ── „Auf einen Blick" ────────────────────────────────────────────────────

export interface BlickZeile {
  /**
   * Fester Schlüssel der Zeile, unabhängig von der Sprache der Beschriftung.
   * Die Kundenansicht ersetzt daran einzelne Erklärungen (`kundenBlickZeilen`).
   */
  id?: string;
  label: string;
  wert: string;
  unter?: string;
  /** Erklärung im Info-Tooltip */
  info: string;
}

export interface AufEinenBlickInput {
  wohnung: ObjektWohnung;
  /** Ort und Bundesland für die Zeile Lage */
  ort: string;
  bundesland?: string;
  baujahr?: number;
  /** Bauzustand aus den Globaldaten, etwa Kernsanierung */
  bauzustand?: string;
  anlageklasse?: string;
  /** Ob das Objekt ein Neubau ist (Erstvermietung statt „vermietet seit") */
  neubau: boolean;
  hausgeldMonat: number;
  hausgeldNichtUmlegbarMonat: number;
  /** Verwaltungsart am Objekt, etwa WEG+SEV */
  verwaltungsart?: string;
  /** Rückfall vom Objekt, falls die Einheit keine eigenen Werte hat */
  verwaltungWegMonatObjekt?: number;
  verwaltungSevMonatObjekt?: number;
  mietgarantieKaltObjekt?: number;
  /** Energieausweis des Objekts, für die Zeile Energie */
  energie?: { klasse?: string; art?: string; kennwert?: number; energietraeger?: string; gueltigBis?: string };
  heute?: string;
  /** Sprache der Texte (Kundensprache, Etappe 3). Ohne Angabe Deutsch, so ruft das CRM. */
  sprache?: FormatSprache;
}

/*
 * Die Formatierer nehmen seit dem 25.09.2026 eine Sprache (Kundensprache,
 * Etappe 3). Ohne Angabe bleibt alles wie bisher deutsch, das CRM ruft sie
 * so. Englisch läuft über `sprachFormat.ts` (en-GB, „€1,234“, „3.5%“).
 *
 * Achtung beim Weiterreichen als Rückruf: `liste.map(eur0)` gäbe den Index
 * als Sprache mit. Unbekanntes gilt deshalb als Deutsch.
 */
const englisch = (spr: unknown): spr is "en" => spr === "en";

export const eur0 = (n: number, spr?: FormatSprache) =>
  englisch(spr) ? euroText(n, "en", 0) : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
export const eur2 = (n: number, spr?: FormatSprache) =>
  englisch(spr) ? euroText(n, "en", 2) : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
/**
 * Die Zimmerzahl deutsch und ohne erzwungene Nachkommastelle: „3“, „2,5“.
 * `String(2.5)` ergab „2.5 Zimmer“, `dez(3, 1)` ergäbe „3,0“.
 */
export const zimmerText = (zimmer: number, spr?: FormatSprache) =>
  zimmer.toLocaleString(englisch(spr) ? SPRACH_LOCALE.en : "de-DE", { maximumFractionDigits: 1 });
export const dez = (n: number, stellen = 1, spr?: FormatSprache) =>
  englisch(spr) ? zahlText(n, "en", stellen) : new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(n);
export const prozent = (n: number, stellen = 2, spr?: FormatSprache) =>
  englisch(spr) ? prozentText(n, "en", stellen) : `${dez(n, stellen)} %`;

/** „2024-03" oder „2024-03-15" als „03/2024", ein reines Jahr bleibt stehen. */
export function monatJahr(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[2]}/${m[1]}`;
  return iso;
}

/**
 * Die Zeilen der Karte „Objektdetails" auf der Einheiten-Seite: Fakten links,
 * Mietübersicht rechts. Kaufpreis und Wohnfläche fehlen bewusst, sie stehen
 * schon in den Kacheln über der Karte.
 *
 * Die Regel zur Erstvermietung: Nur bei Neubau oder Leerstand erscheint die
 * garantierte Erstvermietung. Eine vermietete Bestandswohnung zeigt
 * stattdessen „vermietet seit". Ohne Datum bleibt es bei „vermietet".
 */
export function aufEinenBlickZeilen(i: AufEinenBlickInput): { fakten: BlickZeile[]; miete: BlickZeile[] } {
  const w = i.wohnung;
  const spr = i.sprache;
  const t = BLICK_ZEILEN_TEXTE[spr === "en" ? "en" : "de"];
  const e0 = (n: number) => eur0(n, spr);
  const miete = kaltmieteVon(w, i.heute);
  const fakten: BlickZeile[] = [];
  const mieteZeilen: BlickZeile[] = [];

  const etage = [w.etage, w.lage].filter(Boolean).join(" ");
  if (etage) fakten.push({ id: "etage", label: t.etage.label, wert: etage, info: t.etage.info });

  const lage = [i.ort, w.stadtteil].filter(Boolean).join(", ");
  if (lage) fakten.push({ id: "lage", label: t.lage.label, wert: lage, unter: i.bundesland, info: t.lage.info });

  if (w.zimmer > 0) fakten.push({ id: "zimmer", label: t.zimmer.label, wert: zimmerText(w.zimmer, spr), info: t.zimmer.info });

  if (i.baujahr) {
    const sanierung = w.sanierungsjahr ? t.baujahr.sanierung(w.sanierungsjahr) : undefined;
    fakten.push({ id: "baujahr", label: t.baujahr.label, wert: String(i.baujahr), unter: sanierung, info: t.baujahr.info });
  } else if (w.sanierungsjahr) {
    fakten.push({ id: "sanierungsjahr", label: t.sanierungsjahr.label, wert: String(w.sanierungsjahr), info: t.sanierungsjahr.info });
  }

  if (i.bauzustand) fakten.push({ id: "bauzustand", label: t.bauzustand.label, wert: i.bauzustand, info: t.bauzustand.info });

  const en = i.energie;
  if (en && (en.klasse || en.art || en.kennwert || en.energietraeger)) {
    const unter = [en.art, en.kennwert ? `${dez(en.kennwert, 0, spr)} kWh/(m²·a)` : "", en.energietraeger, en.gueltigBis ? t.energie.gueltigBis(en.gueltigBis) : ""].filter(Boolean).join(", ");
    fakten.push({
      id: "energie",
      label: t.energie.label,
      wert: en.klasse ? t.energie.klasse(en.klasse) : t.energie.keineKlasse,
      unter: unter || undefined,
      info: t.energie.info,
    });
  }

  if (i.anlageklasse) {
    const nutzung = i.neubau ? t.anlageklasse.kapitalanlage : w.vermietet ? t.anlageklasse.kapitalanlageVermietet : t.anlageklasse.kapitalanlage;
    fakten.push({ id: "anlageklasse", label: t.anlageklasse.label, wert: i.anlageklasse, unter: nutzung, info: t.anlageklasse.info });
  }

  if (w.sanierungAnteilProzent || w.sanierungAnteilBetrag) {
    const teile: string[] = [];
    if (w.sanierungAnteilProzent) teile.push(prozent(w.sanierungAnteilProzent, 1, spr));
    if (w.sanierungAnteilBetrag) teile.push(e0(w.sanierungAnteilBetrag));
    fakten.push({
      id: "sanierungAnteil",
      label: t.sanierungAnteil.label,
      wert: teile.join(" = "),
      unter: t.sanierungAnteil.unter,
      info: t.sanierungAnteil.info,
    });
  }

  // ── Mietübersicht ──
  if (miete > 0) {
    if (w.nebenkostenMonat && w.nebenkostenMonat > 0) {
      mieteZeilen.push({ id: "warmmiete", label: t.warmmiete.label, wert: e0(miete + w.nebenkostenMonat), unter: t.warmmiete.unter(e0(miete), e0(w.nebenkostenMonat)), info: t.warmmiete.info });
    } else {
      mieteZeilen.push({ id: "kaltmiete", label: t.kaltmiete.label, wert: e0(miete), unter: t.kaltmiete.unter, info: t.kaltmiete.info });
    }
    if (w.groesse > 0) {
      const jeQm = spr === "en" ? euroText(mieteJeQm(miete, w.groesse), "en", 2) : `${dez(mieteJeQm(miete, w.groesse), 2)} €`;
      mieteZeilen.push({ id: "kaltmieteJeQm", label: t.kaltmieteJeQm.label, wert: jeQm, info: t.kaltmieteJeQm.info });
    }
  }

  if (w.vkGesamt > 0 && miete > 0) {
    mieteZeilen.push({ id: "rendite", label: t.rendite.label, wert: prozent(renditeProzent(miete, w.vkGesamt), 2, spr), unter: t.rendite.unter, info: t.rendite.info });
  }

  if (w.stellplatzPreis && w.stellplatzPreis > 0) {
    mieteZeilen.push({
      id: "stellplatz",
      label: t.stellplatz.label,
      wert: e0(w.stellplatzPreis),
      unter: w.stellplatzMiete && w.stellplatzMiete > 0 ? t.stellplatz.mieteJeMonat(e0(w.stellplatzMiete)) : t.stellplatz.ohneMiete,
      info: t.stellplatz.info,
    });
  }

  if (i.hausgeldMonat > 0) {
    mieteZeilen.push({ id: "hausgeld", label: t.hausgeld.label, wert: e0(i.hausgeldMonat), unter: t.hausgeld.unter, info: t.hausgeld.info });
    if (i.hausgeldNichtUmlegbarMonat > 0) {
      mieteZeilen.push({ id: "hausgeldNichtUmlegbar", label: t.hausgeldNichtUmlegbar.label, wert: e0(i.hausgeldNichtUmlegbarMonat), unter: t.hausgeldNichtUmlegbar.unter, info: t.hausgeldNichtUmlegbar.info });
    }
  }

  const garantie = w.mietgarantieKalt ?? i.mietgarantieKaltObjekt;
  const leerstand = !w.vermietet;
  if ((i.neubau || leerstand) && garantie && garantie > 0) {
    mieteZeilen.push({
      id: "erstvermietung",
      label: t.erstvermietung.label,
      wert: e0(garantie),
      unter: w.mietgarantieMonate ? t.erstvermietung.monateAbUebergabe(w.mietgarantieMonate) : t.erstvermietung.abUebergabe,
      info: t.erstvermietung.info,
    });
  } else if (w.vermietet) {
    mieteZeilen.push({
      id: "vermietet",
      label: t.vermietet.label,
      wert: w.vermietetSeit ? t.vermietet.seit(monatJahr(w.vermietetSeit)) : t.vermietet.ja,
      unter: w.vermietetSeit ? undefined : t.vermietet.ohneBeginn,
      info: t.vermietet.info,
    });
  }

  const weg = w.verwaltungWegMonat ?? i.verwaltungWegMonatObjekt;
  const sev = w.verwaltungSevMonat ?? i.verwaltungSevMonatObjekt;
  if (i.verwaltungsart || weg || sev) {
    const teile: string[] = [];
    if (weg && weg > 0) teile.push(`WEG ${e0(weg)}`);
    if (sev && sev > 0) teile.push(`SEV ${e0(sev)}`);
    let unter = teile.length ? t.verwaltung.jeMonat(teile.join(", ")) : undefined;
    if (w.sevErstesJahrInklusive) unter = `${unter ? unter + ", " : ""}${t.verwaltung.sevErstesJahr}`;
    const art = (i.verwaltungsart || "").replace("+", t.verwaltung.plus) || (weg && sev ? t.verwaltung.wegPlusSev : weg ? "WEG" : "SEV");
    mieteZeilen.push({ id: "verwaltung", label: t.verwaltung.label, wert: art, unter, info: t.verwaltung.info });
  }

  return { fakten, miete: mieteZeilen };
}
