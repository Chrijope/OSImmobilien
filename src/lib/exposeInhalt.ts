/**
 * Inhalt des Exposés je Wohneinheit: die elf Abschnitte, die festen Texte
 * und der Aufbau der Abschnittsdaten aus Objekt, Wohnung und Standort.
 *
 * Alles hier ist reine Logik ohne Oberfläche. Die Exposé-Seite (E3) rendert
 * `ExposeInhalt`, das PDF (E4) soll dieselbe Struktur in derselben
 * Reihenfolge ausgeben, damit Seite und PDF nicht auseinanderlaufen. Der
 * Rechner in Abschnitt 6 kommt aus exposeRechner.ts; hier stehen nur die
 * Objektdaten, die er braucht.
 *
 * Die Texte sind eigene Formulierungen in Du-Ansprache, wie im Kundenportal
 * und in der Objektvorstellung. Die rechtlichen Hinweise sind ein Entwurf
 * und vor dem ersten Kundenlink vom Anwalt freizugeben (Konzept, Rückfrage
 * 6); die Seite kennzeichnet das sichtbar.
 */

import type { ObjektBild, ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { getHausgeldMonatForWohnung, getHausgeldNichtUmlegbarForWohnung } from "@/lib/objekteStore";
import { einheitenImHaus, objektseiteFelder, objektartInfo, objektartAbleiten, istNeubauArt, type Sanierung } from "@/lib/objektseiteDaten";
import { rundumVerwaltung, sanierungenAnzeige, verwaltungAnzeige } from "@/lib/objektdetailsAnzeige";
import { objektDetails, rohdaten } from "@/lib/investagonFelder";
import { kaltmieteVon, renditeVon, eur0, dez, prozent, zimmerText } from "@/lib/objektKennzahlen";
import { objektBauzustand, objektStruktur, type ObjektStruktur } from "@/lib/objektKlassen";
import { ANZAHL_MARKTARGUMENTE, anzuzeigendeObjektTexte } from "@/lib/objektTexteKi";
import { istGemessen, HERKUNFT_HINWEIS_LEER, HERKUNFT_HINWEIS_MIKROLAGE, type StandortAnalyse, type StandortOrt } from "@/lib/standortanalyse";
import { IMPRESSUM_EMAIL, IMPRESSUM_TELEFON } from "@/lib/impressumKontakt";
import { detectBundesland } from "@/lib/bundeslandGrEst";
import { gepflegterKaufnebenkostenSatz } from "@/lib/kaufnebenkosten";
import { BUNDESLAENDER } from "@/lib/grunderwerbsteuer";
import { getZusatzVerwaltungMonat, verwaltungsartLabel } from "@/lib/verwaltungInfo";
import { energieklasseNormalisieren, energieskalaBewerten } from "@/lib/energieskala";
import { COMPANY_LINE } from "@/lib/impressumKontakt";
import { heuteBerlinIso } from "@/lib/datumsformate";
import { berechneExpose, type ExposeObjektdaten } from "@/lib/exposeRechner";
import { annahmenAusSelbstauskunft, standardAnnahmen, type ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import type { KategorieErgebnis } from "@/lib/umgebung";
import type { Standort } from "@/data/marktanalyseSeed";
import { makrolageAusAnalyse, type Makrolage } from "@/lib/makrolage";
import { umgebungAusAnalyse, type Umgebung } from "@/lib/umgebungspunkte";
import type { StandortArbeitgeber } from "@/lib/marktdatenStore";
import type { SaDaten } from "@/lib/saQuelle";
import {
  dateinameAusAblage, eigeneEinheitNummer, einheitNummern, ersatzArt, grundrisseWaehlen, planIstBild, type ErsatzArt, type PlanKandidat,
} from "../../supabase/functions/_shared/grundriss-erkennung.ts";
import { darfZumKunden, internVonHandAusZeile, istInvestagonDatei } from "../../supabase/functions/_shared/dokument-freigabe.ts";
export { planAnzeigename } from "../../supabase/functions/_shared/grundriss-erkennung.ts";
import { investagonKategorieAusRohdaten } from "../../supabase/functions/_shared/dokument-gruppen.ts";
import { KOORDINATEN_META_SCHLUESSEL, koordinatenAus } from "../../supabase/functions/_shared/objekt-koordinaten.ts";
import { objekttextFuer, objekttexteFuer, oeffentlicheObjekttexteEn, type Sprache } from "@/lib/seitenSprache";
import { EXPOSE_INHALT_TEXTE, RECHTLICHE_HINWEISE_VORRANG_EN, exposeInhaltTexte, herkunftHinweisEn, katalogwert, ortsartText, type ExposeInhaltTexte } from "@/lib/exposeInhaltTexte";

// ── Abschnitte ──────────────────────────────────────────────────────────────

export type ExposeAbschnittId =
  | "start" | "standort" | "mikrolage" | "objektdaten" | "grundriss" | "wirtschaftlichkeit"
  | "verwaltung" | "zeitplan" | "chancen-risiken" | "rechtliches" | "kontakt";

export interface ExposeAbschnitt {
  id: ExposeAbschnittId;
  nr: number;
  titel: string;
  /** Kurzform für die Leiste auf dem Handy. */
  kurz: string;
}

const ABSCHNITT_REIHENFOLGE: ExposeAbschnittId[] = [
  "start", "standort", "mikrolage", "objektdaten", "grundriss", "wirtschaftlichkeit",
  "verwaltung", "zeitplan", "chancen-risiken", "rechtliches", "kontakt",
];
// „Nächste Schritte“ ist seit dem 01.10.2026 kein eigener Abschnitt mehr, die Erklärungen stehen im Zeitplan.

/**
 * Die elf Abschnitte in der Sprache der Seite, in fester Reihenfolge wie
 * in der Vorlage. Ohne Sprache deutsch (Kundensprache, Etappe 3).
 */
export function exposeAbschnitte(sprache?: Sprache): ExposeAbschnitt[] {
  const t = exposeInhaltTexte(sprache);
  return ABSCHNITT_REIHENFOLGE.map((id, i) => ({ id, nr: i + 1, titel: t.abschnitte[id].titel, kurz: t.abschnitte[id].kurz }));
}

/** Die elf Abschnitte in fester Reihenfolge, wie in der Vorlage. Deutsch, für PDF und CRM. */
export const EXPOSE_ABSCHNITTE: ExposeAbschnitt[] = exposeAbschnitte();

export const EXPOSE_ABSCHNITTE_ANZAHL = EXPOSE_ABSCHNITTE.length;

/** HTML-Kennung des Abschnitts auf der Seite, zugleich Sprungmarke. */
export function abschnittAnker(id: ExposeAbschnittId): string {
  return `expose-${id}`;
}

// ── Feste Texte ─────────────────────────────────────────────────────────────

/**
 * Der Betrag der Verwaltung als Text, etwa „Mietverwaltung (SEV) 80 € je
 * Monat“. Exposé, Kundenansicht und PDF nehmen alle diese Funktion, damit
 * der Betrag überall denselben Namen trägt. Leer, wenn kein Betrag da ist.
 */
export function verwaltungKostenText(v: Pick<ExposeInhalt["verwaltung"], "kostenMonat" | "kostenBezeichnung">, sprache?: Sprache): string {
  if (!v.kostenMonat || !(v.kostenMonat > 0)) return "";
  return [v.kostenBezeichnung, exposeInhaltTexte(sprache).jeMonat(eur0(v.kostenMonat, sprache))].filter(Boolean).join(" ");
}

/** Leistungen der Mietverwaltung vor Ort, als Hakenliste. */
export const VERWALTUNG_LEISTUNGEN: string[] = EXPOSE_INHALT_TEXTE.de.verwaltungLeistungen;

export interface SchrittKarte {
  nr: number;
  titel: string;
  text: string;
  /** Schon hinter dem Leser: abgehakt und gedämpft dargestellt. */
  erledigt?: boolean;
}

/**
 * Sechs Schritte in der Reihenfolge unseres Prozesses. Im Exposé steht seit
 * dem 01.10.2026 nur noch der erledigte Schritt (Beratung) als eigene Zeile
 * vor dem Zeitplan, die übrigen Erklärungen tragen die Zeitplan-Stationen.
 *
 * Die Beratung ist seit dem 23.09.2026 abgehakt (Christian): Wer das Exposé
 * in der Hand hat, ist beraten, der nächste Schritt ist die Reservierung.
 * Der Text steht deshalb ohne Zeitform, er passt vor wie nach dem Gespräch.
 */
export const NAECHSTE_SCHRITTE: SchrittKarte[] = EXPOSE_INHALT_TEXTE.de.naechsteSchritte;

/** Die sechs Karten in der Sprache der Seite. */
export function naechsteSchritte(sprache?: Sprache): SchrittKarte[] {
  return exposeInhaltTexte(sprache).naechsteSchritte;
}

export interface ZeitplanStation {
  nr: number;
  titel: string;
  /** Die kurze Angabe im kleinen Kasten, etwa „2 bis 6 Wochen“. Leer heißt: kein Kasten. */
  frist: string;
  /** Hier wird gezahlt (Reservierung, Kaufpreis): Der Kasten ist hervorgehoben. */
  zahlung?: boolean;
  /** Erklärung unter dem Titel. Ein von Hand gepflegter Zeitplan hat keine. */
  text?: string;
}

/**
 * Der Standardablauf, im Wortlaut und Aufbau der Vorlage: kurze Stationen,
 * je eine kurze Angabe (Christian am 23.09.2026). Der lange Text zur
 * Reservierungsgebühr mit Betrag, Frist und Rückzahlung steht nicht mehr im
 * Zeitstrahl, sondern allein in der Reservierungsvereinbarung.
 *
 * Eine Station „Werkvertrag“ wie in der Vorlage gibt es bewusst nicht, auch
 * nicht bei Sanierungsobjekten (Christian, 23.09.2026). Ein von Hand
 * gepflegter Zeitplan am Objekt (`meta.zeitplan`) geht allem vor.
 */
/** Der Standardablauf in der Sprache der Seite. Eine Station ohne Frist hat keinen Kasten. */
export function zeitplanStandard(sprache?: Sprache): ZeitplanStation[] {
  return exposeInhaltTexte(sprache).zeitplan.map((s) => ({ nr: s.nr, titel: s.titel, frist: s.frist ?? "", ...(s.zahlung ? { zahlung: true } : {}), ...(s.text ? { text: s.text } : {}) }));
}

export const ZEITPLAN_STANDARD: ZeitplanStation[] = zeitplanStandard();

/** Zahlungsrelevant auch in einem von Hand gepflegten Zeitplan, am Titel erkannt. */
function istZahlungsstation(titel: string): boolean {
  return /reservier|werkvertrag|kaufpreis|zahlung/i.test(titel);
}

export interface ChanceRisiko {
  id: string;
  titel: string;
  chance: string;
  risiko: string;
}

/** Elf Themen, jeweils Chance und Risiko in eigenen Worten. */
export const CHANCEN_RISIKEN: ChanceRisiko[] = EXPOSE_INHALT_TEXTE.de.chancenRisiken;

/** Die elf Themen in der Sprache der Seite. */
export function chancenRisiken(sprache?: Sprache): ChanceRisiko[] {
  return exposeInhaltTexte(sprache).chancenRisiken;
}

export interface RechtlicherHinweis {
  titel: string;
  text: string;
}

/**
 * Entwurf der rechtlichen Hinweise. Vor dem ersten Kundenlink vom Anwalt
 * freizugeben. Die Seite zeigt die Kennzeichnung „Entwurf" mit an.
 */
export const RECHTLICHE_HINWEISE_ENTWURF: RechtlicherHinweis[] = EXPOSE_INHALT_TEXTE.de.rechtlicheHinweise;

/**
 * Die rechtlichen Hinweise in der Sprache der Seite. Auf Englisch steht davor
 * der Satz, dass die deutsche Fassung maßgeblich ist (Plan 4.2, Anwaltsfrage 8
 * ist offen).
 */
export function rechtlicheHinweise(sprache?: Sprache): RechtlicherHinweis[] {
  if (sprache !== "en") return RECHTLICHE_HINWEISE_ENTWURF;
  return [RECHTLICHE_HINWEISE_VORRANG_EN, ...EXPOSE_INHALT_TEXTE.en.rechtlicheHinweise];
}

/**
 * Die Quellenzeile unter „Markt und Standort“. Quelle und Stand stehen in
 * jedem Marktargument selbst; der Beleg, auf den es sich intern stützt, geht
 * nicht an Kunden.
 */
export const MARKT_QUELLE_HINWEIS = EXPOSE_INHALT_TEXTE.de.marktQuelle;

/** Die Quellenzeile unter „Markt und Standort“ in der Sprache der Seite. */
export function marktQuelleHinweis(sprache: Sprache): string {
  return exposeInhaltTexte(sprache).marktQuelle;
}

// ── Mikrolage ───────────────────────────────────────────────────────────────

export type MikrolageGruppeId = "einkaufen" | "freizeit" | "infrastruktur";

/** Die sieben Listen der gemessenen Standortanalyse (`meta.standortanalyse.mikrolage`). */
export type AnalyseSchluessel = keyof NonNullable<StandortAnalyse["mikrolage"]>;

export interface MikrolageGruppe {
  id: MikrolageGruppeId;
  titel: string;
  /** Kategorie-Schlüssel aus umgebung.ts, die in dieser Gruppe landen. */
  kategorien: string[];
  /** Listen der gemessenen Analyse, die in dieser Gruppe landen. */
  analyse: AnalyseSchluessel[];
  /** Farbe der Pinnadeln auf der Karte und des Punkts in der Liste. */
  farbe: string;
}

/** Die drei Listen der Vorlage, gefüllt aus der Standortmessung (OpenStreetMap). */
export const MIKROLAGE_GRUPPEN: MikrolageGruppe[] = [
  { id: "einkaufen", titel: EXPOSE_INHALT_TEXTE.de.mikrolageGruppen.einkaufen, kategorien: ["supermarket", "bakery", "pharmacy", "doctor", "bank"], analyse: ["einkaufen", "apotheken", "aerzte"], farbe: "#15724F" },
  // Parks stehen seit der Messfassung 3 in einer eigenen Liste, gehören hier aber weiter zur Erholung.
  { id: "freizeit", titel: EXPOSE_INHALT_TEXTE.de.mikrolageGruppen.freizeit, kategorien: ["park", "sports"], analyse: ["freizeit", "parks"], farbe: "#2e9468" },
  { id: "infrastruktur", titel: EXPOSE_INHALT_TEXTE.de.mikrolageGruppen.infrastruktur, kategorien: ["transit", "station", "kindergarten", "school", "hospital", "motorway"], analyse: ["oepnv", "kindergaerten", "schulen"], farbe: "#c77d12" },
];

/** Die drei Gruppen mit Titeln in der Sprache der Seite. */
export function mikrolageGruppen(sprache?: Sprache): MikrolageGruppe[] {
  if (sprache !== "en") return MIKROLAGE_GRUPPEN;
  const t = exposeInhaltTexte(sprache);
  return MIKROLAGE_GRUPPEN.map((g) => ({ ...g, titel: t.mikrolageGruppen[g.id] }));
}

/**
 * Höchstens so viele Orte je Liste in den drei Gruppen, so viele wie die
 * Messung bis zur Fassung 3 lieferte. Seitdem misst sie bis zu zehn je
 * Kategorie für Karte und Lagekasten (`umgebungspunkte.ts`). Seit dem
 * 24.09.2026 liest auch das Exposé-PDF die Umgebung (`umgebung`) statt
 * dieser drei Gruppen.
 */
const JE_LISTE_IN_GRUPPEN: Partial<Record<AnalyseSchluessel, number>> = {
  kindergaerten: 4, schulen: 4, einkaufen: 4, apotheken: 3, aerzte: 4, oepnv: 4, freizeit: 4, parks: 2,
};

/** Gehminuten bei etwa 80 Metern je Minute, mindestens eine. */
export function gehminuten(meter: number): number {
  if (!Number.isFinite(meter) || meter <= 0) return 1;
  return Math.max(1, Math.ceil(meter / 80));
}

export interface MikrolageEintrag {
  name: string;
  /** Kategorie, etwa „Supermarkt". */
  art: string;
  entfernungMeter: number;
  gehminuten: number;
  /** Lage des Orts, sofern gemessen. Ohne sie gibt es keine Pinnadel. */
  lat?: number;
  lng?: number;
}

export interface MikrolageListe {
  gruppe: MikrolageGruppe;
  eintraege: MikrolageEintrag[];
}

/** Die Mikrolage aus der gemessenen Analyse, fertig für Karte und Liste. */
export interface MikrolageAnalyse {
  /** Lage des Objekts, Mitte der Karte. */
  zentrum: { lat: number; lng: number };
  /** Die drei Gruppen in fester Reihenfolge; leere Gruppen bleiben drin. */
  listen: MikrolageListe[];
  /** Kein einziger Ort in der ganzen Messung. */
  leer: boolean;
  /** Herkunftssatz unter der Liste. */
  hinweis: string;
  /** Zeitpunkt der Messung, ISO. */
  gemessenAm?: string;
}

const endlich = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Reicht die Adresse, um die Lage zu nennen? Eine Straße mit Namen und dazu
 * PLZ oder Ort, dieselbe Mindestangabe wie bei der Messung auf dem Server.
 */
export function adresseReicht(objekt: Pick<ObjektData, "adresse" | "plz" | "ort">): boolean {
  const plz = String(objekt.plz ?? "").trim();
  const ort = (objekt.ort || "").trim();
  return hatStrassenname((objekt.adresse || "").trim()) && (!!plz || !!ort);
}

/**
 * Steht der Abschnitt Mikrolage da? Seit dem 23.09.2026 immer, wenn eine
 * gemessene Analyse, eine gespeicherte Lage (`meta.koordinaten`) oder eine
 * brauchbare Adresse vorliegt. Vorher fiel er ohne Analyse ganz weg, samt
 * Karte und Kartenknopf im Kopf. Exposé und Kundenansicht fragen beide hier,
 * damit sie nicht auseinanderlaufen.
 */
export function mikrolageZeigen(m: ExposeInhalt["mikrolage"]): boolean {
  return !!m.analyse || !!m.koordinaten || !!m.adresseReicht;
}

/**
 * Die gemessene Standortanalyse in die drei Gruppen der Vorlage sortieren.
 *
 * Gelesen wird nur eine Analyse mit `schema: 2`, also eine gemessene. Die
 * alten Datensätze hat ein Sprachmodell erfunden, samt Koordinaten; sie
 * gelten als nicht vorhanden (siehe `standortanalyse.ts`). Ohne gemessene
 * Analyse gibt es `undefined`; das Exposé zeigt dann die Karte nur mit der
 * Nadel aus der gespeicherten Lage `meta.koordinaten` (`Mikrolage.tsx`).
 * Gelesen wird wie Fremddaten: Ein Ort ohne Namen oder ohne Entfernung
 * fällt heraus, eine Koordinate ohne Zahl wird nicht zur Pinnadel.
 */
export function mikrolageAusAnalyse(analyse: unknown, sprache?: Sprache): MikrolageAnalyse | undefined {
  if (!istGemessen(analyse)) return undefined;
  const a = analyse as StandortAnalyse;
  const zentrum = a.objekt_koordinaten;
  if (!zentrum || !endlich(zentrum.lat) || !endlich(zentrum.lng)) return undefined;
  const mikro = (a.mikrolage && typeof a.mikrolage === "object" ? a.mikrolage : {}) as Record<string, unknown>;
  const t = exposeInhaltTexte(sprache);

  const listen = mikrolageGruppen(sprache).map((gruppe) => {
    const eintraege: MikrolageEintrag[] = [];
    for (const schluessel of gruppe.analyse) {
      const orte = Array.isArray(mikro[schluessel]) ? (mikro[schluessel] as unknown[]) : [];
      const vorher = eintraege.length;
      for (const roh of orte) {
        if (eintraege.length - vorher >= (JE_LISTE_IN_GRUPPEN[schluessel] ?? 4)) break;
        const o = (roh && typeof roh === "object" ? roh : {}) as Partial<StandortOrt>;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        if (!name || !endlich(o.entfernung_m) || o.entfernung_m < 0) continue;
        // Der gemessene Typ ist deutsch gespeichert; auf Englisch übersetzt ihn `ortsartText` nur für die Anzeige.
        const typ = typeof o.typ === "string" && o.typ.trim() ? ortsartText(o.typ.trim(), sprache) : t.analyseArt[schluessel];
        eintraege.push({
          name,
          art: typ,
          entfernungMeter: o.entfernung_m,
          gehminuten: gehminuten(o.entfernung_m),
          ...(endlich(o.lat) && endlich(o.lng) ? { lat: o.lat, lng: o.lng } : {}),
        });
      }
    }
    eintraege.sort((x, y) => x.entfernungMeter - y.entfernungMeter);
    return { gruppe, eintraege };
  });

  const leer = listen.every((l) => l.eintraege.length === 0);
  return {
    zentrum: { lat: zentrum.lat, lng: zentrum.lng },
    listen,
    leer,
    /*
     * Der gespeicherte Satz der Messung sagt, ab wo gemessen wurde („ab der
     * Ortsmitte“). Bis zum 24.09.2026 stand hier immer der allgemeine Satz,
     * und eine Entfernung ab der Ortsmitte las sich wie eine ab der Haustür.
     */
    hinweis: sprache === "en"
      ? herkunftHinweisEn(leer, (a as { genauigkeit?: unknown }).genauigkeit)
      : leer ? HERKUNFT_HINWEIS_LEER : (typeof a.mikrolage_hinweis === "string" && a.mikrolage_hinweis.trim()) || HERKUNFT_HINWEIS_MIKROLAGE,
    ...(typeof a.gemessen_am === "string" ? { gemessenAm: a.gemessen_am } : {}),
  };
}


export { ortsartText };

/**
 * Messergebnisse in die drei Listen einsortieren: je Kategorie die nächsten
 * zwei Orte, insgesamt nach Entfernung sortiert. Leere Gruppen bleiben in
 * der Liste, damit die Seite sagen kann, dass nichts erfasst ist.
 */
export function mikrolageListen(ergebnisse: KategorieErgebnis[], jeKategorie = 2): MikrolageListe[] {
  return MIKROLAGE_GRUPPEN.map((gruppe) => {
    const eintraege: MikrolageEintrag[] = [];
    for (const e of ergebnisse) {
      if (!gruppe.kategorien.includes(e.kategorie.key)) continue;
      for (const o of e.orte.slice(0, jeKategorie)) {
        eintraege.push({ name: o.name, art: e.kategorie.label, entfernungMeter: o.entfernung, gehminuten: gehminuten(o.entfernung) });
      }
    }
    eintraege.sort((a, b) => a.entfernungMeter - b.entfernungMeter);
    return { gruppe, eintraege };
  });
}

// ── Objektdaten für den Rechner ─────────────────────────────────────────────

/** Kürzel aus grunderwerbsteuer.ts zu einem Bundeslandnamen, etwa „Bayern" zu „by". */
export function bundeslandIdAusName(name: string | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return BUNDESLAENDER.find((b) => b.name.toLowerCase() === n)?.id ?? null;
}

/** Jahr der Fertigstellung aus den gepflegten Sanierungen: das späteste Jahr, das nicht in der Vergangenheit liegt. */
export function sanierungFertigstellungJahr(sanierungen: Sanierung[], heuteJahr: number): number | null {
  const jahre = sanierungen.map((s) => parseInt(s.jahr, 10)).filter((j) => Number.isFinite(j) && j >= heuteJahr);
  return jahre.length ? Math.max(...jahre) : null;
}

/**
 * Die Objektdaten für berechneExpose aus Objekt und Wohnung. Miete ist die
 * Kaltmiete inklusive Stellplatzmiete, weil der Stellplatz in der
 * Gesamtinvestition steckt. Der nicht umlegbare Hausgeldanteil enthält im
 * CRM Verwaltung und Rücklage zusammen; eine getrennte Rücklage gibt es
 * nicht, deshalb bleibt ruecklageMonat leer.
 */
export function exposeObjektdatenAus(objekt: ObjektData, w: ObjektWohnung, heute = new Date()): ExposeObjektdaten {
  const felder = objektseiteFelder(objekt);
  const nkGepflegt = gepflegterKaufnebenkostenSatz(objekt);
  const sanierungSumme = felder.sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
  const grundstueck = objekt.afaDaten?.grundstueckAnteil;
  // Der Kalendertag in deutscher Zeit, nicht der UTC-Tag.
  const heuteIso = heuteBerlinIso(heute);
  // Eine noch ausstehende Mieterhöhung gibt der Rechner ab ihrem Monat weiter; eine erreichte steckt schon in kaltmieteVon.
  const erhoehungOffen = !!(w.neueMiete && w.mieterhoehungAb && w.mieterhoehungAb > heuteIso);
  return {
    kaufpreis: w.vkGesamt || 0,
    stellplatzpreis: w.stellplatzPreis || 0,
    wohnflaeche: w.groesse || null,
    kaltmieteMonat: kaltmieteVon(w, heuteIso) + (w.stellplatzMiete || 0),
    stellplatzMieteMonat: w.stellplatzMiete || 0,
    mieterhoehungAb: erhoehungOffen ? w.mieterhoehungAb : null,
    mieterhoehungKaltmieteMonat: erhoehungOffen ? (w.neueMiete || 0) + (w.stellplatzMiete || 0) : null,
    hausgeldGesamtMonat: getHausgeldMonatForWohnung(objekt, w) || 0,
    hausgeldNichtUmlegbarMonat: getHausgeldNichtUmlegbarForWohnung(objekt, w) || 0,
    mietverwaltungMonat: (w.verwaltungSevMonat ?? getZusatzVerwaltungMonat(objekt.meta)) || 0,
    bundeslandId: bundeslandIdAusName(detectBundesland(objekt.plz, objekt.ort)),
    kaufnebenkostenProzent: nkGepflegt ?? null,
    baujahr: objekt.globalDaten?.baujahr || null,
    gebaeudeanteilProzent: typeof grundstueck === "number" && grundstueck > 0 && grundstueck < 100 ? 100 - grundstueck : null,
    sanierungskostenGesamt: objekt.sanierungskosten || sanierungSumme || undefined,
    miteigentumsanteilProzent: w.sanierungAnteilProzent,
    sanierungsanteilEuro: w.sanierungAnteilBetrag,
    sanierungFertigstellungJahr: sanierungFertigstellungJahr(felder.sanierungen, heute.getFullYear()),
    mietgarantieJahre: w.mietgarantieMonate ? Math.round(w.mietgarantieMonate / 12) : 0,
  };
}

export interface AnnahmenVorbelegung {
  annahmen: ExposeAnnahmen;
  /** Felder, die aus der Selbstauskunft kommen. */
  ausSelbstauskunft: Array<keyof ExposeAnnahmen>;
  /** Felder, die aus dem Objekt kommen (AfA-Satz, Erhaltungsaufwand). */
  ausObjekt: Array<keyof ExposeAnnahmen>;
  eigenkapitalEuro: number;
}

/**
 * Annahmen vorbelegen: Standardwerte, dann Objekt (AfA-Satz, Verteilung des
 * Erhaltungsaufwands), dann Selbstauskunft des Kunden. Die Herkunft wird
 * mitgeliefert, damit die Seite „aus der Selbstauskunft" kennzeichnen kann.
 */
export function annahmenVorbelegen(objekt: ObjektData, w: ObjektWohnung, saData: SaDaten | null | undefined, heute = new Date()): AnnahmenVorbelegung {
  const startjahr = heute.getFullYear();
  const annahmen = standardAnnahmen(startjahr);
  const ausObjekt: Array<keyof ExposeAnnahmen> = [];
  if (objekt.afaDaten && objekt.afaDaten.afaSatz > 0) {
    annahmen.afaProzent = objekt.afaDaten.afaSatz;
    ausObjekt.push("afaProzent");
  }
  const objektdaten = exposeObjektdatenAus(objekt, w, heute);
  const hatSanierung = (objektdaten.sanierungsanteilEuro || 0) > 0
    || ((objektdaten.sanierungskostenGesamt || 0) > 0 && (objektdaten.miteigentumsanteilProzent || 0) > 0);
  if (hatSanierung) {
    annahmen.instandhaltungsart = "erhaltungsaufwand";
    annahmen.instandhaltungJahre = Math.min(5, Math.max(1, objekt.erhaltungsaufwandJahre || 1));
    ausObjekt.push("instandhaltungsart", "instandhaltungJahre");
  }
  const gesamtinvestition = (w.vkGesamt || 0) + (w.stellplatzPreis || 0);
  const sa = annahmenAusSelbstauskunft(saData, gesamtinvestition);
  Object.assign(annahmen, sa.werte);
  return { annahmen, ausSelbstauskunft: sa.herkunft, ausObjekt, eigenkapitalEuro: sa.eigenkapitalEuro };
}

/**
 * Die Kaufnebenkosten einer Einheit mit den Standardannahmen, also genau der
 * Betrag, den der Reiter „Finanzen“ beim Öffnen zeigt.
 *
 * Seit dem 24.09.2026 steht dieser Betrag auch in der Kachel
 * „Gesamtinvestition“ auf Einheitsseite und Kundenansicht. Vorher stand dort
 * der pauschale Satz nach Bundesland („5,0 % in Bayern“), der Reiter rechnete
 * mit den echten Notar- und Grundbuchgebühren (Grüntenweg 2: 22.595 € oder
 * 4,9 %). Beide Stellen rechnen jetzt über `berechneExpose`, einen zweiten
 * Rechenweg gibt es nicht.
 *
 * `null`, wenn es keinen Kaufpreis gibt.
 */
export function kaufnebenkostenStandard(objekt: ObjektData, w: ObjektWohnung, heute = new Date()): {
  betrag: number;
  prozent: number;
  traegtVerkaeufer: boolean;
} | null {
  if (!((w.vkGesamt || 0) + (w.stellplatzPreis || 0) > 0)) return null;
  const ergebnis = berechneExpose(exposeObjektdatenAus(objekt, w, heute), annahmenVorbelegen(objekt, w, null, heute).annahmen);
  const k = ergebnis.kauf;
  return { betrag: k.nebenkosten.summe, prozent: k.nebenkosten.prozentGesamt, traegtVerkaeufer: k.nebenkostenTraegtVerkaeufer };
}

/**
 * Die Zeile unter der Kachel „Gesamtinvestition“, etwa „zuzüglich
 * Kaufnebenkosten rund 22.600 €“. Gerundet auf volle hundert Euro, weil die
 * Kachel eine Größenordnung nennt; den genauen Betrag zeigt der Reiter
 * „Finanzen“.
 */
export function kaufnebenkostenKachelText(objekt: ObjektData, w: ObjektWohnung, heute = new Date(), sprache?: Sprache): string {
  const t = exposeInhaltTexte(sprache);
  const nk = kaufnebenkostenStandard(objekt, w, heute);
  if (!nk || !(nk.betrag > 0)) return t.kaufnebenkostenZuzueglich;
  const betrag = eur0(Math.round(nk.betrag / 100) * 100, sprache);
  if (nk.traegtVerkaeufer) return t.kaufnebenkostenVerkaeufer(betrag);
  return t.kaufnebenkostenRund(betrag);
}

// ── Aufbau der Abschnittsdaten ──────────────────────────────────────────────

export interface Kennzahl {
  label: string;
  wert: string;
  unter?: string;
  /**
   * Nur auf einer englischen Seite: die deutsche Beschriftung als feste
   * Kennung. Seite und CSS (`data-zeile`) suchen Zeilen darüber, nicht über
   * die angezeigte Beschriftung. Auf Deutsch ist die Beschriftung selbst die Kennung.
   */
  schluessel?: string;
}

/** Die feste Kennung einer Zeile, unabhängig von der Sprache. */
export function kennzahlSchluessel(k: Pick<Kennzahl, "label" | "schluessel">): string {
  return k.schluessel ?? k.label;
}

/**
 * Setzt auf Englisch an jede Kennzahl ihre deutsche Beschriftung als
 * `schluessel`. Auf Deutsch bleibt die Liste, wie sie ist.
 */
export function mitSchluessel(liste: Kennzahl[], sprache?: Sprache): Kennzahl[] {
  if (sprache !== "en") return liste;
  const en = EXPOSE_INHALT_TEXTE.en.labels as Record<string, string>;
  const de = EXPOSE_INHALT_TEXTE.de.labels as Record<string, string>;
  return liste.map((k) => {
    const feld = Object.keys(en).find((f) => en[f] === k.label);
    return feld && !k.schluessel ? { ...k, schluessel: de[feld] } : k;
  });
}

export interface Person {
  name: string;
  rolle: string;
  email?: string;
  telefon?: string;
  buchungslink?: string;
  avatarUrl?: string;
}

/** Eine Zeile der Einheitentabelle in der Objektansicht. */
export interface EinheitZeile {
  id: string;
  nummer: string;
  flaeche: number;
  zimmer: number;
  preis: number;
  status: string;
  /** Kaltmiete je Monat, für den Mietenspiegel beim Globalobjekt. */
  miete?: number;
  /** Etage und Lage, etwa „2. OG rechts". */
  lage?: string;
  vermietet?: boolean;
}

export interface ExposeInhalt {
  beschreibung?: string;
  /**
   * Welche Objekttexte auf einer englischen Seite deutsch bleiben, weil es
   * (noch) keine englische Fassung in `meta.objekttexteKiEn` gibt
   * (Entscheidung 12). Die Seite setzt dann den Vermerk „Description available
   * in German only“ darunter. Auf Deutsch immer alles `false`.
   */
  nurDeutsch: { beschreibung: boolean; standortargumente: boolean; marktargumente: boolean };
  dokumente?: Array<{ id: string; name: string; url: string }>;
  einheiten?: EinheitZeile[];
  objektId?: string;
  ansicht?: "einheit" | "objekt";
  /** Wie das Objekt verkauft wird. Beim Globalobjekt ist die Einheitentabelle ein Mietenspiegel ohne Einzelpreise. */
  struktur?: ObjektStruktur;
  kopf: {
    /** „Wohnung 7" */
    titel: string;
    weNr: string;
    adresse: string;
    ort: string;
    /** „Sanierter Bestand · vermietet" */
    untertitel: string;
    /**
     * Die große Zeile im Kopf, wie in der Vorlage: „Söflinger Str. 203,
     * 89077 Ulm, WE 7“. Aus `kopfUeberschrift`.
     */
    ueberschrift?: string;
    /** Die kleine Zeile darunter: Ort, Stadtteil, Art und Vermietung, ohne Doppelungen. */
    ortszeile?: string[];
    kundeName?: string;
    erstellerName?: string;
  };
  start: {
    bilder: ObjektBild[];
    kennzahlen: Kennzahl[];
    chips: string[];
    einwohner?: number;
    wachstumProzent?: number;
  };
  standort: {
    ort: string;
    kennzahlen: Kennzahl[];
    argumente: Array<{ titel: string; text: string }>;
    /**
     * Block „Markt und Standort“ direkt nach den Standortargumenten: bis zu
     * drei Marktargumente, dieselben wie auf der Objektseite. Leer heißt, der
     * Block entfällt.
     */
    marktargumente: Array<{ titel: string; text: string }>;
    arbeitgeber: Array<{ name: string; branche?: string; mitarbeiter?: number }>;
    quelle: string;
  };
  mikrolage: {
    adresse: string;
    gruppen: MikrolageGruppe[];
    /** Nur mit gemessener Analyse (schema 2): Lage des Objekts und die drei Listen. */
    analyse?: MikrolageAnalyse;
    /** Hochschulen und Krankenhäuser aus derselben Messung, siehe `makrolage.ts`. */
    makro?: Makrolage;
    /**
     * Die Punkte der Umgebung nach Kategorien für Karte und Lagekasten am
     * Bildschirm (`umgebungspunkte.ts`, seit dem 24.09.2026). `analyse` und
     * `makro` bleiben für das PDF.
     */
    umgebung?: Umgebung;
    /**
     * Die gespeicherte Lage des Objekts aus `meta.koordinaten`, geschrieben
     * vom Import oder von der Messung. Die Karte nimmt sie, wenn die Analyse
     * fehlt. Im Browser wird nie eine Adresse gesucht.
     */
    koordinaten?: { lat: number; lng: number };
    /** Reicht die Adresse, um die Lage zu nennen (`adresseReicht`)? Ohne alles entfällt der Abschnitt. */
    adresseReicht?: boolean;
  };
  objektdaten: {
    zeilen: Kennzahl[];
    sanierungen: Sanierung[];
    /**
     * Was statt der Maßnahmenliste dasteht, wenn es keine Maßnahmen gibt:
     * „Neubau 2025", die Sanierungsjahre aus dem Import oder „Keine Angaben
     * vom Bauträger". Aus `sanierungenAnzeige`, wie auf Objekt- und Einheitsseite.
     */
    sanierungenOhneListe?: string;
    gemeinschaftseigentum?: string;
    energie: {
      klasse?: string;
      kennwert?: number;
      art?: string;
      energietraeger?: string;
      gueltigBis?: string;
      baujahr?: number;
      positionProzent?: number;
      hinweis?: string;
    };
    /** Pflichtangaben nach GEG § 87, die am Objekt fehlen. */
    fehlendePflichtangaben: string[];
  };
  grundriss: {
    /** `ersatz`: kein eigener Plan der Einheit, sondern der des Geschosses oder des Hauses (`ersatzArt`). */
    dokumente: Array<{ id: string; name: string; url: string; istBild: boolean; ersatz?: ErsatzArt }>;
  };
  wirtschaftlichkeit: {
    objektdaten: ExposeObjektdaten;
    bundesland?: string;
    verfuegbar?: boolean;
  };
  verwaltung: {
    name?: string;
    /** „WEG-Verwaltung" oder „WEG- und SEV-Verwaltung", nach der Regel in `objektdetailsAnzeige`. */
    bezeichnung: string;
    /** Gepflegter Verwaltername und Merkmal „360°-Verwaltung", sofern vorhanden. */
    zusatz?: string;
    art?: string;
    /** Nur ein Betrag über null. Ein „0 € je Monat" wäre keine Angabe, sondern ein Fehler. */
    kostenMonat?: number;
    /**
     * Wofür `kostenMonat` steht: „Mietverwaltung (SEV)“ oder „WEG-Verwaltung“.
     * Ohne diese Angabe stand „WEG-Verwaltung“ über dem Betrag der
     * Mietverwaltung.
     */
    kostenBezeichnung?: string;
    leistungen: string[];
  };
  naechsteSchritte: SchrittKarte[];
  zeitplan: ZeitplanStation[];
  chancenRisiken: ChanceRisiko[];
  rechtliches: {
    entwurf: boolean;
    hinweise: RechtlicherHinweis[];
    energieausweis: Kennzahl[];
  };
  /**
   * Ganz unten „Dein Ansprechpartner". Nur der Vertrieb, der Objektpartner
   * steht seit dem 23.09.2026 nicht mehr im Exposé (Christians Vorgabe).
   * Fehlt der Vertrieb, stehen Telefon und E-Mail aus dem Impressum da.
   */
  kontakt: {
    vertrieb?: Person;
    firma: string;
    telefon?: string;
    email?: string;
  };
}

export interface ExposeInhaltEingabe {
  objekt: ObjektData;
  wohnung: ObjektWohnung;
  /** Standort aus der Standortdatenbank, falls der Ort dort geführt wird. */
  standort?: Standort;
  standortArbeitgeber?: StandortArbeitgeber[];
  kundeName?: string;
  ersteller?: Person;
  heute?: Date;
  /** Die Sprache der festen Texte. Ohne Angabe Deutsch, wie für PDF und CRM. */
  sprache?: Sprache;
}

/** Werte, die in einer Tabelle oder Kachel „nichts" bedeuten. */
const LEERWERTE = new Set(["keine angabe", "not specified", "-", "–", ""]);

/** Steht in dieser Kennzahl überhaupt etwas? „Keiner" beim Stellplatz ist eine Aussage und zählt. */
export function hatWert(k: Pick<Kennzahl, "wert">): boolean {
  return !LEERWERTE.has((k.wert || "").trim().toLowerCase()) && !/undefined|NaN/.test(k.wert || "");
}

/**
 * Die Zeilen, die das Exposé wirklich zeigt: ohne „Keine Angabe".
 *
 * Die Daten behalten die leeren Zeilen, damit die Investagon-Ergänzung sie an
 * ihrer Stelle füllen kann (`zeilenErgaenzen`). Angezeigt wird erst danach
 * gefiltert, auf der Seite wie im PDF.
 */
export function sichtbareZeilen(zeilen: Kennzahl[]): Kennzahl[] {
  return zeilen.filter(hatWert);
}

const zahlOderLeer = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Der von Hand gepflegte Zeitplan am Objekt, sonst der Standardablauf. */
function zeitplanAusMeta(meta: Record<string, unknown>, sprache?: Sprache): ZeitplanStation[] {
  const roh = Array.isArray(meta.zeitplan) ? meta.zeitplan : [];
  const stationen = roh
    .map((s) => {
      const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const titel = typeof r.titel === "string" ? r.titel.trim() : "";
      const frist = typeof r.frist === "string" ? r.frist.trim() : "";
      return titel ? { titel, frist } : null;
    })
    .filter((s): s is { titel: string; frist: string } => s !== null)
    // Erst nach dem Aussortieren nummerieren, sonst entstehen Lücken.
    .map((s, i): ZeitplanStation => ({ nr: i + 1, ...s, ...(istZahlungsstation(s.titel) ? { zahlung: true } : {}) }));
  // Ein von Hand gepflegter Zeitplan bleibt, wie er geschrieben ist, auch auf Englisch.
  return stationen.length ? stationen : sprache === "en" ? zeitplanStandard(sprache) : ZEITPLAN_STANDARD;
}

/** Begriffe ohne leere Einträge und ohne Wiederholung, Groß- und Kleinschreibung egal. */
export function ohneDoppelte(teile: ReadonlyArray<string | null | undefined | false>): string[] {
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const t of teile) {
    const text = typeof t === "string" ? t.trim() : "";
    if (!text || gesehen.has(text.toLowerCase())) continue;
    gesehen.add(text.toLowerCase());
    ergebnis.push(text);
  }
  return ergebnis;
}

/**
 * Steht in der Adresse ein Straßenname? „9a“ allein ist nur eine Hausnummer.
 *
 * Der Investagon-Import setzt die Adresse aus Straße und Hausnummer zusammen
 * (`mapping.ts`). Liefert Investagon keine Straße, bleibt die Hausnummer
 * allein stehen, und genau so stand im Kopf eines Exposés einmal nur „9a“.
 */
export function hatStrassenname(adresse: string | null | undefined): boolean {
  return /\p{L}{2,}/u.test(adresse || "");
}

/** „WE 6b“ aus „6b“, „WE6b“ oder „Wohnung 6b“. Eine Bezeichnung ohne Nummer bleibt, wie sie ist. */
export function weBezeichnung(weNr: string | null | undefined, sprache?: Sprache): string {
  const roh = (weNr || "").trim();
  const nummer = roh.replace(/^(?:WE|WHG|Wohnung|Einheit)[\s_.-]*/i, "").trim();
  if (!nummer) return "";
  return /^\d/.test(nummer) ? `${exposeInhaltTexte(sprache).weKurz} ${nummer}` : roh;
}

/**
 * Die große Zeile im Kopf des Exposés, wie in der Vorlage: Straße, PLZ und
 * Ort, bei einer Einheit dahinter die Wohneinheit, etwa
 * „Söflinger Str. 203, 89077 Ulm, WE 7“. Bei uns mit Komma statt
 * Gedankenstrich.
 *
 * Eine Adresse ohne Straßennamen fällt weg (siehe `hatStrassenname`). Fehlen
 * Straße und Ort ganz, steht der Name des Objekts da.
 */
export function kopfUeberschrift(objekt: Pick<ObjektData, "adresse" | "plz" | "ort" | "titel">, weNr?: string, sprache?: Sprache): string {
  const strasse = hatStrassenname(objekt.adresse) ? objekt.adresse.trim() : "";
  const plz = (objekt.plz || "").trim();
  const ort = [plz, (objekt.ort || "").trim()].filter(Boolean).join(" ");
  // Steht die PLZ schon in der gepflegten Adresse, kommt der Ort nicht zweimal.
  const ortSchonDrin = !!strasse && !!plz && strasse.includes(plz);
  const we = weBezeichnung(weNr, sprache);
  if (strasse || ort) return [strasse, ortSchonDrin ? "" : ort, we].filter(Boolean).join(", ");
  return [(objekt.titel || "").trim(), we].filter(Boolean).join(", ") || exposeInhaltTexte(sprache).wohnung;
}

/** Keine Angabe, sondern ein Rest: „0“, „-“ oder eine nackte Zahl ist kein Merkmal. */
function istMerkmal(chip: string): boolean {
  return /\p{L}{2,}/u.test(chip);
}

/** „Balkon“ oder die Angabe aus Investagon, etwa „Loggia“. Leer, wenn nichts belegt ist. */
function balkonMerkmal(quellen: Array<{ meta?: Record<string, unknown> | null }>, t: ExposeInhaltTexte = EXPOSE_INHALT_TEXTE.de): string {
  for (const q of quellen) {
    const wert = objektDetails(q).find((z) => z.label === "Balkon")?.wert?.trim();
    if (!wert || /^(nein|no|none|kein|keiner|keine|false|0)$/i.test(wert)) continue;
    return /^(ja|\d+)$/i.test(wert) ? t.chipBalkon : wert;
  }
  return "";
}

/**
 * Die Abschreibung als Merkmal. „Erhöht“ heißt sie erst über 3 Prozent, dem
 * höchsten linearen Regelsatz (Neubau ab 2023); darunter steht sie schlicht
 * als Abschreibung da. So behauptet der Chip nichts, was die Zahl nicht trägt.
 */
function abschreibungMerkmal(afaSatz: number, sprache?: Sprache): string {
  if (!(afaSatz > 0)) return "";
  const t = exposeInhaltTexte(sprache);
  const satz = prozent(afaSatz, 2, sprache);
  return afaSatz > 3 ? t.chipErhoehteAbschreibung(satz) : t.chipAbschreibung(satz);
}

/** Argument „Titel. Text" in Titel und Text trennen, wie auf der Objektseite. */
function argumentTeilen(a: string): { titel: string; text: string } {
  const punkt = a.indexOf(". ");
  if (punkt > 0 && punkt < 60) return { titel: a.slice(0, punkt), text: a.slice(punkt + 2) };
  return { titel: a, text: "" };
}

/** Ein Grundriss im Exposé. */
export type ExposeGrundriss = ExposeInhalt["grundriss"]["dokumente"][number];

type GrundrissKandidat = PlanKandidat & { id: string; url: string };

/** Zeiger auf die geschützten Eimer. Der Browser löst sie erst beim Anzeigen auf (`useGrundrissAdressen`). */
export function istAblageZeiger(url: string): boolean {
  return url.startsWith("/investagon-dokument/") || url.startsWith("/objekt-dokument/");
}

/**
 * Die Grundrisse einer Einheit, mit `wohnung = null` die des ganzen Objekts.
 *
 * Dieselbe Erkennung, Zuordnung und Ampel wie im Kundenlink
 * (`supabase/functions/_shared/grundriss-erkennung.ts`,
 * `get-expose/unterlagen.ts`). Bis zum 23.09.2026 zählte hier nur das Wort
 * „Grundriss“ im Namen, und Unterlagen aus Investagon (`kategorie: "intern"`)
 * fielen ganz heraus. Deren Pläne kamen über `exposeInvestagon.ts` mit einer
 * Adresse dazu, die der Browser nicht öffnen konnte, und das PDF sah sie nie.
 *
 * Kandidaten sind die Unterlagen der Einheit (Tabelle und `meta.dokumente`),
 * die des Objekts und die Wohnungsbilder mit „Grundriss“ im Bildtext. Was die
 * Ampel nicht hinauslässt, ist kein Kandidat: Das Exposé geht an Kunden.
 * Die Adresse bleibt, wie sie ist, auch ein Zeiger auf den geschützten Eimer.
 */
export function grundrisseFuerExpose(objekt: ObjektData, wohnung: ObjektWohnung | null): ExposeGrundriss[] {
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const objektKategorie = investagonKategorieAusRohdaten(meta.investagonRaw);
  const kandidaten: GrundrissKandidat[] = [];
  const bekannt = new Set<string>();
  const dazu = (k: GrundrissKandidat) => {
    if (!k.url || k.url === "__gallery__" || /^javascript:/i.test(k.url) || bekannt.has(k.url)) return;
    bekannt.add(k.url);
    kandidaten.push(k);
  };

  if (wohnung) {
    const einheitKategorie = investagonKategorieAusRohdaten(wohnung.investagonRaw);
    for (const d of wohnung.dokumente ?? []) {
      const kategorie = einheitKategorie(d.name) ?? null;
      // Freigabe und Schwärzung zählen nur aus der Tabelle, `meta.dokumente` darf jede interne Rolle schreiben.
      const darf = darfZumKunden({
        name: d.name, kategorie: d.kategorie, investagonKategorie: kategorie,
        internVonHand: internVonHandAusZeile({ url: d.url, kategorie: d.kategorie, name: d.name }),
        kundenFreigabe: d.ausTabelle ? d.kundenFreigabe ?? null : null,
        geschwaerzt: d.ausTabelle === true && d.geschwaerzt === true,
      });
      if (darf) dazu({ id: d.id, name: d.name, url: d.url, dateiname: dateinameAusAblage(d.url), investagonKategorie: kategorie, bereich: "wohnung" });
    }
    // Wohnungsbilder sind Fotos, keine Unterlagen: Für sie gilt die Ampel nicht.
    for (const b of wohnung.bilder ?? []) {
      if (/grundriss/i.test(b.alt || "")) dazu({ id: b.id, name: b.alt, url: b.url, dateiname: dateinameAusAblage(b.url), bereich: "wohnung" });
    }
  }
  for (const d of objekt.dokumente ?? []) {
    const kategorie = objektKategorie(d.name) ?? null;
    const darf = darfZumKunden({
      name: d.name, kategorie: d.kategorie, investagonKategorie: kategorie,
      internVonHand: internVonHandAusZeile({ url: d.url, kategorie: d.kategorie, sichtbar: d.sichtbar, name: d.name }),
      kundenFreigabe: d.kundenFreigabe ?? null,
      geschwaerzt: d.geschwaerzt === true,
    });
    if (darf) dazu({ id: d.id, name: d.name, url: d.url, dateiname: dateinameAusAblage(d.url), investagonKategorie: kategorie, bereich: "objekt" });
  }

  const ziel = { weNr: wohnung ? wohnung.weNr : null, einzelwohnung: meta.einzelwohnung === true, etage: wohnung?.etage ?? null };
  return grundrisseWaehlen(kandidaten, ziel).map((k) => {
    const ersatz = ersatzArt(k, ziel);
    return { id: k.id, name: k.name, url: k.url, istBild: planIstBild(k.dateiname, k.name), ...(ersatz ? { ersatz } : {}) };
  });
}

/**
 * Den kompletten Exposé-Inhalt aufbauen. Reine Funktion, damit Seite, Tests
 * und später das PDF denselben Aufbau bekommen.
 */
export function baueExposeInhalt(e: ExposeInhaltEingabe): ExposeInhalt {
  const { objekt, wohnung: w } = e;
  const heute = e.heute ?? new Date();
  const sprache: Sprache = e.sprache === "en" ? "en" : "de";
  const t = exposeInhaltTexte(sprache);
  const L = t.labels;
  const keine = t.keineAngabe;
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const felder = objektseiteFelder(objekt);
  const art = objektartInfo(felder.objektart) ?? objektartInfo(objektartAbleiten(objekt));
  const neubau = istNeubauArt(art?.id);
  const bauzustand = objektBauzustand(objekt) || undefined;
  const bundesland = detectBundesland(objekt.plz, objekt.ort);
  const ort = [objekt.plz, objekt.ort].filter(Boolean).join(" ");
  const adresse = [objekt.adresse, ort].filter(Boolean).join(", ");
  const lage = koordinatenAus(meta[KOORDINATEN_META_SCHLUESSEL]);
  const makro = makrolageAusAnalyse(meta.standortanalyse);
  const umgebung = umgebungAusAnalyse(meta.standortanalyse);
  const miete = kaltmieteVon(w, heute.toISOString().slice(0, 10));
  const gesamt = (w.vkGesamt || 0) + (w.stellplatzPreis || 0);
  // Eine Regel überall (M20, 04.10.2026): Jahreskaltmiete der Wohnung durch
  // den Kaufpreis der Wohnung, der Stellplatz steht mit Preis und Miete in
  // eigener Zeile. Bis dahin teilte das Exposé durch Wohnung plus Stellplatz.
  const rendite = renditeVon(w, heute.toISOString().slice(0, 10));
  // Gepflegtes Baujahr, sonst das aus den Investagon-Rohdaten von Objekt oder
  // Einheit. Ohne diesen Rückfall meldete das Exposé „Baujahr fehlt“, während
  // die Tabelle darüber es aus Investagon zeigte.
  const baujahr = objekt.globalDaten?.baujahr
    || [rohdaten(objekt), rohdaten({ meta: { investagonRaw: w.investagonRaw } })]
      .map((r) => Number(r?.object_building_year))
      .find((j) => Number.isInteger(j) && j >= 1800 && j <= 2100)
    || undefined;
  const hausgeld = getHausgeldMonatForWohnung(objekt, w);
  const hausgeldNu = getHausgeldNichtUmlegbarForWohnung(objekt, w);
  const bilder = [...new Map([
    ...[...(w.bilder || [])].sort((a, b) => a.reihenfolge - b.reihenfolge), ...[...(objekt.bilder || [])].sort((a, b) => a.reihenfolge - b.reihenfolge),
    ...(objekt.bildUrl ? [{ id: "titelbild", url: objekt.bildUrl, alt: objekt.titel, reihenfolge: 0 }] : []),
  ].filter((b) => b.url && !/grundriss/i.test(b.alt || "")).map((b) => [b.url, b])).values()];
  const afa = objekt.afaDaten;
  const struktur = objektStruktur(objekt);

  // Ohne Doppelungen: Objektart und gepflegter Zustand heißen oft beide
  // „Neubau“, im Kopf stand dann „Neubau · Neubau · Erstvermietung“.
  const untertitelTeile = ohneDoppelte([
    katalogwert(art?.label, sprache),
    w.sanierungsjahr ? t.untertitelSaniert(String(w.sanierungsjahr)) : bauzustand,
    w.vermietet ? t.untertitelVermietet : neubau ? t.untertitelErstvermietung : t.untertitelFrei,
  ]);
  const untertitel = untertitelTeile.join(" · ");

  // Eine Kachel mit „Keine Angabe“ verspricht eine Zahl und liefert keine.
  // Was fehlt, fällt hier heraus; die Objektdaten weiter unten sagen es.
  const kennzahlen: Kennzahl[] = mitSchluessel([
    { label: L.kaufpreis, wert: gesamt > 0 ? eur0(gesamt, sprache) : keine, unter: w.stellplatzPreis ? t.inklusiveStellplatz : undefined },
    { label: L.wohnflaeche, wert: w.groesse > 0 ? `${dez(w.groesse, 1, sprache)} m²` : keine },
    { label: L.zimmer, wert: w.zimmer > 0 ? zimmerText(w.zimmer, sprache) : keine },
    { label: L.kaltmieteMonat, wert: miete > 0 ? eur0(miete, sprache) : keine },
    { label: L.mietrendite, wert: rendite > 0 ? prozent(rendite, 2, sprache) : keine, unter: t.jahreskaltmieteDurchKaufpreis },
  ].filter(hatWert), sprache);

  /*
   * Beschreibung und Standortargumente in der Reihenfolge, die Objektseite
   * und Einheitsseite auch nutzen (`anzuzeigendeObjektTexte`): von Hand
   * gepflegt, sonst automatisch erzeugt. Die Investagon-Freitexte stehen im
   * Exposé schon als eigener Block „Besonderheiten dieser Immobilie“ und
   * werden hier nicht ein zweites Mal gezeigt; an ihrer Stelle bleibt die
   * Beschreibung aus der Objektanlage.
   *
   * Seit dem 24.09.2026 trägt ein automatisch entstandener Text keinen
   * Vermerk „Automatisch erstellt …“ mehr (Christians Vorgabe), weder hier
   * noch in Kundenansicht und PDF. Das Kennzeichen `meta.texteAutomatisch`
   * aus `get-expose` wird dafür nicht mehr gelesen.
   */
  const texte = anzuzeigendeObjektTexte(objekt);
  const beschreibungDe = (texte.kurzbeschreibungHerkunft === "gepflegt" || texte.kurzbeschreibungHerkunft === "automatisch" ? texte.kurzbeschreibung : "")
    || objekt.beschreibung?.trim() || "";
  /*
   * Kundensprache, Entscheidung 12: Auf einer englischen Seite die englische
   * Fassung aus `meta.objekttexteKiEn`, sonst der deutsche Text mit Vermerk
   * (`nurDeutsch`). Auf Deutsch ändert sich nichts.
   */
  const texteEn = sprache === "en" ? oeffentlicheObjekttexteEn(meta.objekttexteKiEn) : undefined;
  const beschreibungAnzeige = objekttextFuer(beschreibungDe, texteEn?.kurzbeschreibung, sprache);
  const beschreibung = beschreibungAnzeige.wert || undefined;
  const gemessen = istGemessen(meta.standortanalyse) ? (meta.standortanalyse as StandortAnalyse) : undefined;

  const energie = felder.energieausweis;
  const skala = energieskalaBewerten({ klasse: energie.klasse, kennwert: energie.kennwert });
  /*
   * Die Merkmal-Chips unter den Kennzahlen, wie in der Vorlage: Balkon,
   * Energieeffizienz, Stellplatz, Abschreibung, dazu Verwaltung und
   * Vermietung. Nur, was belegt ist.
   *
   * Die Lage im Gebäude steht seit dem 23.09.2026 nicht mehr als Chip da:
   * Investagon liefert die Etage als nackte Zahl, und aus dem Erdgeschoss
   * wurde ein Chip „0“. Die Lage steht in den Objektdaten.
   */
  const chips = ohneDoppelte([
    // Beim Balkon zählt die Einheit, bei einer Einzelwohnung auch das Objekt.
    balkonMerkmal([{ meta: { investagonRaw: w.investagonRaw } }, ...(struktur === "einzelwohnung" ? [objekt] : [])], t),
    skala.klasse ? t.chipEnergieklasse(skala.klasse) : "",
    w.stellplatzPreis ? t.chipStellplatzInklusive : "",
    afa ? abschreibungMerkmal(afa.afaSatz, sprache) : "",
    // `felder.verwaltung` ist seit 23.09.2026 nur noch der gepflegte Name. Das
    // Merkmal „360°-Verwaltung“, das vorher als Rückfall darin steckte, zählt
    // deshalb hier ausdrücklich mit.
    felder.verwaltung || meta.verwaltungsart || rundumVerwaltung(objekt) ? t.chipVerwaltungVorOrt : "",
    w.vermietetSeit && /^\d{4}/.test(w.vermietetSeit) ? t.chipVermietetSeit(w.vermietetSeit.slice(0, 4)) : "",
  ]).filter(istMerkmal);

  // Standort
  const st = e.standort;
  /*
   * Aus `meta.standortanalyse` zählt nur die gemessene Fassung (schema 2).
   * Die alten Datensätze hat ein Sprachmodell geschrieben, Einwohnerzahl und
   * Arbeitgeber inbegriffen; bis zum 23.09.2026 standen sie hier als Rückfall
   * und damit erfunden im Exposé. Die gemessene Fassung kennt beides heute
   * nicht, der Zugriff bleibt für den Fall, dass sie es einmal misst.
   */
  const standortKennzahlen: Kennzahl[] = [];
  const ganzeZahl = (n: number) => (sprache === "en" ? dez(n, 0, sprache) : new Intl.NumberFormat("de-DE").format(n));
  if (st) {
    standortKennzahlen.push({ label: L.einwohner, wert: ganzeZahl(st.einwohner) });
    standortKennzahlen.push({
      label: L.entwicklungFuenfJahre,
      wert: sprache === "en"
        ? `${st.einwohner_trend_5j_pct > 0 ? "+" : ""}${prozent(st.einwohner_trend_5j_pct, 1, sprache)}`
        : `${st.einwohner_trend_5j_pct > 0 ? "+" : ""}${dez(st.einwohner_trend_5j_pct, 1)} %`,
      unter: t.einwohnerzahl,
    });
    if (Number.isFinite(st.leerstand_pct)) standortKennzahlen.push({ label: L.leerstandsquote, wert: prozent(st.leerstand_pct, 1, sprache) });
    if (st.miete_qm_eur > 0) standortKennzahlen.push({ label: L.angebotsmieteQm, wert: sprache === "en" ? `€${dez(st.miete_qm_eur, 2, sprache)}` : `${dez(st.miete_qm_eur, 2)} €` });
  }
  const gemesseneEinwohner = gemessen?.makrolage?.einwohner;
  if (!st && typeof gemesseneEinwohner === "number" && gemesseneEinwohner > 0) standortKennzahlen.push({ label: L.einwohner, wert: sprache === "en" ? ganzeZahl(gemesseneEinwohner) : gemesseneEinwohner.toLocaleString("de-DE") });
  /*
   * Die Standortargumente, dieselben wie auf Objekt- und Einheitsseite
   * (`ObjektTexteKarte`): gepflegt in `meta.standortargumente`, sonst die
   * automatisch erzeugten aus `meta.objekttexteKi`. Bis zum 23.09.2026 kamen
   * ohne sie die Highlights der Standortdatenbank oder der Standortanalyse
   * hinein, also andere Sätze als auf der Objektseite. Das entfällt: Fehlen
   * die Argumente, fehlt der Block.
   */
  const argumenteAnzeige = objekttexteFuer(texte.standortargumente.filter((a) => typeof a === "string" && !!a.trim()), texteEn?.standortargumente, sprache);
  const argumente = argumenteAnzeige.wert.map(argumentTeilen);
  /*
   * Die Marktargumente aus derselben Quelle wie auf der Objektseite
   * (`ObjektTexteKarte`): gepflegt in `meta.marktargumente`, sonst die
   * automatisch erzeugten. Höchstens drei, wie dort. Im öffentlichen Exposé
   * und in der Kundenansicht steht nur der Wortlaut im Feld, ohne Beleg.
   */
  const marktAnzeige = objekttexteFuer(texte.marktargumente.slice(0, ANZAHL_MARKTARGUMENTE), texteEn?.marktargumente, sprache);
  const marktargumente = marktAnzeige.wert.slice(0, ANZAHL_MARKTARGUMENTE).map(argumentTeilen);
  const arbeitgeber = (e.standortArbeitgeber && e.standortArbeitgeber.length
    ? e.standortArbeitgeber.map((a) => ({ name: a.name, branche: a.branche ?? undefined, mitarbeiter: a.mitarbeiter ?? undefined }))
    : (st?.top_arbeitgeber ?? gemessen?.arbeitgeber ?? []).map((a) => ({ name: a.name, branche: a.branche, mitarbeiter: a.mitarbeiter }))
  ).filter((a) => !!a.name).slice(0, 4);

  // Nur die gepflegte Zahl. Die Wohnungen im Angebot oder die freien sind
  // nicht die Einheiten des Hauses (Christian, 24.09.2026).
  const einheitenGesamt = einheitenImHaus(objekt);

  // Objektdaten
  // Energieausweis und Energieträger sind Katalogwerte; auf Englisch übersetzt, gespeichert bleibt der deutsche Wert.
  const energieArt = katalogwert(energie.art, sprache);
  const energieTraeger = katalogwert(energie.energietraeger, sprache);
  const zeilen: Kennzahl[] = mitSchluessel([
    { label: L.wohneinheit, wert: w.weNr || keine },
    // Ohne gepflegten Stadtteil keine Zeile. Der Ort als Ersatz stand hier
    // als „Stadtteil: Augsburg“ und steht ohnehin schon in der Überschrift.
    ...(w.stadtteil?.trim() ? [{ label: L.stadtteil, wert: w.stadtteil.trim() }] : []),
    { label: L.zimmer, wert: w.zimmer > 0 ? zimmerText(w.zimmer, sprache) : keine },
    { label: L.wohnflaeche, wert: w.groesse > 0 ? `${dez(w.groesse, 1, sprache)} m²` : keine },
    { label: L.lageImGebaeude, wert: [w.etage, w.lage].filter(Boolean).join(" ") || keine },
    { label: L.baujahr, wert: baujahr ? String(baujahr) : keine, unter: w.sanierungsjahr ? t.sanierungJahr(String(w.sanierungsjahr)) : undefined },
    { label: L.einheitenImHaus, wert: einheitenGesamt ? String(einheitenGesamt) : keine },
    { label: L.etagen, wert: objekt.globalDaten?.etagen ? String(objekt.globalDaten.etagen) : keine },
    { label: L.energietraeger, wert: energieTraeger || keine },
    { label: L.endenergie, wert: energie.kennwert ? `${dez(energie.kennwert, 1, sprache)} kWh/(m²·a)` : keine, unter: energieArt },
    { label: L.stellplatz, wert: w.stellplatzPreis ? `${eur0(w.stellplatzPreis, sprache)}${w.stellplatzMiete ? t.stellplatzMiete(eur0(w.stellplatzMiete, sprache)) : ""}` : t.keiner },
    { label: L.hausgeldMonat, wert: hausgeld > 0 ? eur0(hausgeld, sprache) : keine, unter: hausgeldNu > 0 ? t.davonNichtUmlegbar(eur0(hausgeldNu, sprache)) : undefined },
    { label: L.erhaltungsruecklage, wert: w.ruecklageWohnung ? eur0(w.ruecklageWohnung, sprache) : keine, unter: w.ruecklageWohnung ? t.anteilDieserEinheit : undefined },
    { label: L.abschreibung, wert: afa ? (sprache === "en" ? `${prozent(afa.afaSatz, 1, sprache)} ${afa.afaModell}` : `${dez(afa.afaSatz, 1)} % ${afa.afaModell}`) : keine },
    { label: L.vermietung, wert: w.vermietet ? (w.vermietetSeit ? t.vermietetSeitMonat(w.vermietetSeit.slice(0, 7).split("-").reverse().join("/")) : t.vermietet) : neubau ? t.erstvermietung : t.leerstand },
  ], sprache);
  const fehlendePflichtangaben: string[] = [];
  if (!energie.art) fehlendePflichtangaben.push(t.pflichtArtDesEnergieausweises);
  if (!energie.kennwert) fehlendePflichtangaben.push(t.pflichtEndenergiekennwert);
  if (!energie.energietraeger) fehlendePflichtangaben.push(t.pflichtEnergietraeger);
  if (!baujahr) fehlendePflichtangaben.push(t.pflichtBaujahr);
  if (!skala.klasse) fehlendePflichtangaben.push(t.pflichtEffizienzklasse);

  /*
   * Eine Objektunterlage, die ausdrücklich eine andere Einheit nennt, gehört
   * nicht in dieses Exposé. Nennt sie eine Nummer, die sich mangels eigener
   * Nummer nicht prüfen lässt („2. OG links“), bleibt sie ebenfalls draußen.
   * Ohne eigene Nummer (Exposé des ganzen Objekts) bleibt alles.
   */
  const passendeNummer = (name: string) => {
    const genannt = einheitNummern(name);
    if (!genannt.length || !w.weNr.trim()) return true;
    const eigene = eigeneEinheitNummer(w.weNr);
    return !!eigene && genannt.includes(eigene);
  };
  const grundrisse = grundrisseFuerExpose(objekt, w);

  /*
    Dieselben Maßnahmen wie auf Objekt- und Einheitsseite: gepflegte, sonst
    die herausgelesenen. Herausgelesene tragen den Vermerk im Text, damit
    Seite und PDF ihn ohne eigene Darstellung zeigen. Der Rechner nimmt
    weiter nur gepflegte (`exposeObjektdatenAus`), dort gehen Beträge und
    Jahre in die Rechnung.
  */
  const sanierungsStand = sanierungenAnzeige(objekt, heute, sprache);
  const sanierungenFuerExpose: Sanierung[] = sanierungsStand.eintraege.map((s) => ({
    jahr: s.jahr,
    massnahme: s.quelle === "bautraeger" ? `${s.massnahme} ${t.angabeBautraeger}` : s.massnahme,
    ...(s.betrag ? { betrag: s.betrag } : {}),
  }));
  const sanierungenOhneListe = sanierungenFuerExpose.length === 0
    ? [sanierungsStand.wert, sanierungsStand.unter].filter(Boolean).join(", ")
    : undefined;

  // Verwaltung
  const verwaltungText = felder.verwaltung;
  const verwaltungName = verwaltungText ? verwaltungText.split(",")[0].trim() : undefined;
  const sev = zahlOderLeer(w.verwaltungSevMonat) ?? zahlOderLeer(meta.verwaltungskostenSev);
  const weg = zahlOderLeer(w.verwaltungWegMonat) ?? zahlOderLeer(meta.verwaltungskostenWeg);
  // Bezeichnung nach Christians Regel vom 23.09.2026, wie auf Objekt- und
  // Einheitsseite. Das Hausgeld des ganzen Hauses aus derselben Zeile bleibt
  // hier weg, das der Einheit steht in den Objektdaten.
  const verwaltungZusatz = [verwaltungText, rundumVerwaltung(objekt, sprache)].filter(Boolean).join(", ") || undefined;

  const energieausweisAngaben: Kennzahl[] = mitSchluessel([
    { label: L.artDesAusweises, wert: energieArt || keine },
    { label: L.endenergie, wert: energie.kennwert ? `${dez(energie.kennwert, 1, sprache)} kWh/(m²·a)` : keine },
    { label: L.energietraeger, wert: energieTraeger || keine },
    { label: L.baujahr, wert: baujahr ? String(baujahr) : keine },
    { label: L.effizienzklasse, wert: skala.klasse || keine },
    { label: L.gueltigBis, wert: energie.gueltigBis || keine },
  ], sprache);

  return {
    ansicht: "einheit",
    struktur,
    objektId: objekt.id,
    beschreibung,
    nurDeutsch: {
      beschreibung: !!beschreibung && beschreibungAnzeige.nurDeutsch,
      standortargumente: argumente.length > 0 && argumenteAnzeige.nurDeutsch,
      marktargumente: marktargumente.length > 0 && marktAnzeige.nurDeutsch,
    },
    dokumente: [...new Map([
      ...(w.dokumente || []).filter((d) => d.kategorie === "wohnungsunterlagen"),
      ...objekt.dokumente.filter((d) => d.sichtbar !== false && d.kategorie === "objektunterlagen" && passendeNummer(d.name)),
    ]
      // Dateien aus Investagon stehen hier nie: Ihr Zeiger lässt sich im
      // Browser nicht öffnen, und bis zum 24.09.2026 trugen sie alle die
      // Kategorie „intern“ und fielen schon deshalb heraus. Seit der Import
      // sie als Objekt- oder Wohnungsunterlage ablegt, hält diese Zeile das
      // Exposé so eng wie vorher. Ihre Pläne kommen über `grundrisseFuerExpose`.
      .filter((d) => d.url && d.url !== "__gallery__" && !/^javascript:/i.test(d.url) && !istInvestagonDatei(d.url))
      .map((d) => [d.url, { id: d.id, name: d.name, url: d.url }])).values()],
    kopf: {
      // Ohne Nummer schlicht „Wohnung“, nicht „Wohnung ?“.
      titel: [t.wohnung, (w.weNr || "").replace(/^WE\s*/i, "").trim()].filter(Boolean).join(" "),
      weNr: w.weNr,
      adresse,
      ort,
      untertitel,
      ueberschrift: kopfUeberschrift(objekt, w.weNr, sprache),
      // PLZ und Wohneinheit stehen schon in der Überschrift darüber.
      ortszeile: ohneDoppelte([objekt.ort, w.stadtteil, ...untertitelTeile]),
      kundeName: e.kundeName,
      erstellerName: e.ersteller?.name,
    },
    start: {
      bilder,
      kennzahlen,
      chips,
      einwohner: st?.einwohner,
      wachstumProzent: st?.einwohner_trend_5j_pct,
    },
    standort: {
      ort: objekt.ort || t.standortOhneOrt,
      kennzahlen: standortKennzahlen,
      argumente,
      marktargumente,
      arbeitgeber,
      quelle: st ? t.quelleStandortdatenbank : t.quelleHinterlegt,
    },
    mikrolage: { adresse, gruppen: mikrolageGruppen(sprache), analyse: mikrolageAusAnalyse(meta.standortanalyse, sprache), ...(makro ? { makro } : {}), ...(umgebung ? { umgebung } : {}), ...(lage ? { koordinaten: { lat: lage.lat, lng: lage.lng } } : {}), adresseReicht: adresseReicht(objekt) },
    objektdaten: {
      zeilen,
      sanierungen: sanierungenFuerExpose,
      ...(sanierungenOhneListe ? { sanierungenOhneListe } : {}),
      // Nur der gepflegte Text. Einheiten, Etagen und Energieträger stehen
      // im Exposé schon als eigene Zeilen in `zeilen`.
      gemeinschaftseigentum: felder.gemeinschaftseigentum,
      energie: {
        klasse: skala.klasse,
        kennwert: energie.kennwert,
        art: energieArt,
        energietraeger: energieTraeger,
        gueltigBis: energie.gueltigBis,
        baujahr,
        positionProzent: skala.positionProzent,
        // Der Satz aus `energieskala.ts` spricht von „im Objekt gepflegt“ und ist
        // für die Objektseite gedacht. Im Exposé liest ein Kunde mit.
        hinweis: skala.hinweis && skala.ausKennwert
          ? t.energieHinweis(energieklasseNormalisieren(energie.klasse) ?? energie.klasse ?? "", skala.ausKennwert)
          : undefined,
      },
      fehlendePflichtangaben,
    },
    grundriss: { dokumente: grundrisse },
    wirtschaftlichkeit: { objektdaten: exposeObjektdatenAus(objekt, w, heute), bundesland, verfuegbar: w.vkGesamt > 0 },
    verwaltung: {
      name: verwaltungName,
      // Mit einem SEV-Betrag gehört die SEV in die Überschrift, wie auf der Objektseite.
      bezeichnung: verwaltungAnzeige(objekt, sev, sprache).wert,
      ...(verwaltungZusatz ? { zusatz: verwaltungZusatz } : {}),
      art: katalogwert(verwaltungsartLabel(meta.verwaltungsart), sprache) || undefined,
      kostenMonat: sev ?? weg,
      ...(sev ? { kostenBezeichnung: t.kostenMietverwaltung } : weg ? { kostenBezeichnung: t.kostenWegVerwaltung } : {}),
      leistungen: Array.isArray(meta.verwaltungLeistungen) ? meta.verwaltungLeistungen.filter((x): x is string => typeof x === "string" && !!x.trim()) : [],
    },
    naechsteSchritte: naechsteSchritte(sprache),
    zeitplan: zeitplanAusMeta(meta, sprache),
    chancenRisiken: chancenRisiken(sprache),
    rechtliches: { entwurf: true, hinweise: rechtlicheHinweise(sprache), energieausweis: energieausweisAngaben },
    kontakt: {
      vertrieb: e.ersteller,
      firma: COMPANY_LINE,
      ...(IMPRESSUM_TELEFON ? { telefon: IMPRESSUM_TELEFON } : {}),
      ...(IMPRESSUM_EMAIL ? { email: IMPRESSUM_EMAIL } : {}),
    },
  };
}
