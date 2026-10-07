import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { heizungText, merkmale, merkmalWert, miteigentumsanteilText, type MitInvestagonRohdaten } from "@/lib/investagonFelder";
import { einheitenImHaus, istNeubauArt, istWgKonzept, objektartAbleiten, objektartInfo, objektseiteHandwerte } from "@/lib/objektseiteDaten";
import { eur0 } from "@/lib/objektKennzahlen";
import { STANDARD_SPRACHE, type Sprache } from "@/lib/seitenSprache";
import { OBJEKTDETAILS_TEXTE, type ObjektdetailsTexte } from "@/lib/objektdetailsAnzeigeTexte";

/**
 * Was in den Kacheln „Verwaltung“, „Gemeinschaftseigentum“ und „Sanierungen“
 * steht, auf Objektseite, Einheitsseite und im Exposé.
 *
 * WARUM EINE EIGENE DATEI, SEIT 23.09.2026
 *
 * `objektseiteFelder` liefert die von Hand gepflegten Werte, und der
 * Pflegedialog schreibt sie zurück. Was hier entsteht, ist abgeleitet: aus
 * einer Regel (Verwaltung), aus den Rohdaten des Imports (Gemeinschaftseigentum,
 * Sanierungsjahre) und aus den automatisch herausgelesenen Maßnahmen. Stünde
 * das in `objektseiteFelder`, landete es beim ersten Speichern des Dialogs als
 * Handeingabe in `meta`, und der nächste Import käme nicht mehr dagegen an.
 *
 * Es wird nichts gespeichert und nichts erfunden. Fehlt eine Angabe, fehlt sie
 * auch hier; nur wenn gar nichts da ist, steht eine ehrliche Zeile da.
 */

/** Was eine Kachel zeigt: der Wert und die graue Zeile darunter. */
export interface DetailAnzeige {
  wert: string;
  unter?: string;
}

/** Was diese Datei vom Objekt braucht. */
export type ObjektFuerAnzeige = Pick<ObjektData, "meta" | "globalDaten" | "titel"> & {
  badge?: string | null;
  wohnungen?: ReadonlyArray<Pick<ObjektWohnung, "sanierungsjahr" | "investagonRaw">>;
};

export const KEINE_ANGABEN = "Keine Angaben vom Bauträger";
export const VERWALTUNG_WEG = "WEG-Verwaltung";
export const VERWALTUNG_WEG_SEV = "WEG- und SEV-Verwaltung";
export const VERMERK_BAUTRAEGER = "aus den Angaben des Bauträgers";
/*
 * Überschrift über der Liste aus `sanierungenAnzeige`, auf Einheitsseite,
 * Kundenansicht, Exposé und PDF. Bis zum 24.09.2026 hieß sie „Maßnahmen am
 * Gemeinschaftseigentum“. Die herausgelesene Liste nennt aber Maßnahmen am
 * Gebäude und in den Wohnungen (so verlangt es der Text-Lauf), also auch Bad,
 * Küche oder Böden, und die gehören zum Sondereigentum. Welche Maßnahme wohin
 * gehört, steht in den Daten nicht fest; deshalb eine Überschrift, die für
 * beide Arten stimmt. Wo es wirklich nur um Gemeinschaftseigentum geht (die
 * Kosten nach Miteigentumsanteil in Rechner und Finanzen), bleibt das Wort.
 */
export const SANIERUNGEN_UEBERSCHRIFT = "Sanierungen und Maßnahmen";

/* ------------------------------------------------------------------ */
/* Kleine Helfer                                                       */
/* ------------------------------------------------------------------ */

function istObjekt(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function text(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Eine Zahl größer null, sonst nichts. Die Globaldaten tragen 0 für „leer“. */
function positiv(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Ein plausibles Jahr, sonst nichts. Eine 0 im Datensatz ist kein Jahr 0. */
function plausiblesJahr(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  if (!Number.isFinite(n) || n < 1800 || n > 2100) return undefined;
  return Math.trunc(n);
}

/** Alle Jahreszahlen in einem Text, etwa aus „2023/2024“ beide. */
function jahreIn(wert: string): number[] {
  return (wert.match(/(?:18|19|20)\d{2}/g) || []).map(Number);
}

const deutsch = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 });

/*
 * Kundensprache, Etappe 3: Jede Anzeige nimmt eine optionale Sprache. Ohne
 * Angabe Deutsch, so ruft das CRM. Die Texte stehen in
 * `objektdetailsAnzeigeTexte.ts`.
 */
function texte(sprache: Sprache | undefined): ObjektdetailsTexte {
  return OBJEKTDETAILS_TEXTE[sprache === "en" ? "en" : STANDARD_SPRACHE];
}
const ganzeZahl = (n: number, sprache: Sprache | undefined) =>
  sprache === "en" ? n.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : deutsch(n);

/**
 * Objekt und Einheiten als Träger von Rohdaten, das Objekt zuerst.
 *
 * Investagon führt manche Angaben (Heizung, Merkmale) mal am Projekt, mal nur
 * an den Einheiten. Gefragt wird der Reihe nach, die erste Antwort gilt.
 */
function rohdatenQuellen(objekt: ObjektFuerAnzeige): MitInvestagonRohdaten[] {
  return [
    objekt,
    ...(objekt.wohnungen || []).map((w) => ({ meta: { investagonRaw: w?.investagonRaw } })),
  ];
}

function merkmalImObjekt(objekt: ObjektFuerAnzeige, bezeichnung: string): string | undefined {
  for (const quelle of rohdatenQuellen(objekt)) {
    const wert = merkmalWert(quelle, bezeichnung);
    if (wert) return wert;
  }
  return undefined;
}

function baujahrVon(objekt: ObjektFuerAnzeige): number | undefined {
  const gepflegt = plausiblesJahr(objekt.globalDaten?.baujahr);
  if (gepflegt) return gepflegt;
  for (const quelle of rohdatenQuellen(objekt)) {
    const roh = quelle.meta?.investagonRaw;
    const jahr = istObjekt(roh) ? plausiblesJahr(roh.object_building_year) : undefined;
    if (jahr) return jahr;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Verwaltung                                                          */
/* ------------------------------------------------------------------ */

/** Das Merkmal „360°-Verwaltung“, etwa „360°-Verwaltung inklusive“. */
export function rundumVerwaltung(objekt: ObjektFuerAnzeige, sprache?: Sprache): string | undefined {
  const wert = merkmalImObjekt(objekt, "360°-Verwaltung");
  return wert ? texte(sprache).rundumVerwaltung(wert) : undefined;
}

/**
 * Die Verwaltung, nach Christians Regel vom 23.09.2026.
 *
 * Jede Eigentumswohnung hat eine WEG-Verwaltung, deshalb steht sie immer da.
 * Bei einem WG- und Co-Living-Konzept kommt die SEV-Verwaltung dazu, die die
 * Zimmervermietung trägt. Eine Zeile statt zwei, weil „WEG- und
 * SEV-Verwaltung“ sich in einer Kachel besser liest als zwei Werte.
 *
 * Die von Hand gepflegte Angabe, meist der Name des Verwalters, geht nicht
 * verloren: Sie steht in der Zeile darunter, zusammen mit dem Merkmal
 * „360°-Verwaltung“ und dem Hausgeld.
 */
export function verwaltungAnzeige(objekt: ObjektFuerAnzeige, sevMonat?: number | null, sprache?: Sprache): DetailAnzeige & { mitSev: boolean } {
  const t = texte(sprache);
  // Seit 24.09.2026 zählt auch ein gepflegter SEV-Betrag, an der Einheit oder
  // am Objekt: Wer eine Mietverwaltung bezahlt, hat eine SEV-Verwaltung. Sonst
  // stand im Exposé „WEG-Verwaltung“ über dem Betrag der Mietverwaltung.
  const sevAmObjekt = Number((objekt.meta as Record<string, unknown> | undefined)?.verwaltungskostenSev);
  const mitSev = istWgKonzept(objekt) || (Number(sevMonat) > 0) || (Number.isFinite(sevAmObjekt) && sevAmObjekt > 0);
  const hausgeld = positiv(objekt.globalDaten?.hausgeldMonat);
  const zusatz = [
    objektseiteHandwerte(objekt).verwaltung,
    rundumVerwaltung(objekt, sprache),
    hausgeld ? t.hausgeldGesamt(eur0(hausgeld, sprache)) : undefined,
  ].filter((z): z is string => !!z);
  return {
    wert: mitSev ? t.verwaltungWegSev : t.verwaltungWeg,
    unter: zusatz.join(", ") || undefined,
    mitSev,
  };
}

/* ------------------------------------------------------------------ */
/* Gemeinschaftseigentum                                               */
/* ------------------------------------------------------------------ */

const AUFZUG = /aufzug|fahrstuhl|\blift/i;
const NEIN = /^(nein|kein|keiner|keine|nicht vorhanden|false|0)$/i;
const JA = /^(ja|vorhanden|inklusive|inkl\.?|true|1)$/i;

/** Ein Aufzug, aber nur, wenn ein Merkmal ihn nennt. */
function aufzugText(objekt: ObjektFuerAnzeige, t: ObjektdetailsTexte): string | undefined {
  for (const quelle of rohdatenQuellen(objekt)) {
    for (const m of merkmale(quelle)) {
      if (!AUFZUG.test(m.bezeichnung)) continue;
      // „Kein Aufzug“ ohne Doppelpunkt ist eine Aussage für sich.
      if (/^(kein|keine|ohne)\b/i.test(m.bezeichnung) || NEIN.test(m.wert)) return t.keinAufzug;
      if (!m.wert || JA.test(m.wert)) return t.aufzug;
      return t.aufzugMit(m.wert);
    }
  }
  return undefined;
}

/**
 * Was das gemeinschaftliche Eigentum ausmacht, soweit es in den Daten steht.
 *
 * Gemeinschaftseigentum ist das Haus selbst: Wie viele Einheiten sich es
 * teilen, wie hoch es ist, wie es beheizt wird, ob es einen Aufzug gibt, wie
 * viele Stellplätze und wie viel Grundstück dazugehören. Genau daran hängen
 * Hausgeld und Rücklage.
 *
 * Die Anzahl der Einheiten nur aus der Pflege (`meta.einheitenImHaus`). Bis
 * zum 24.09.2026 zählte hier die Liste der Wohnungen, und die ist je nach
 * Seite die der angebotenen oder nur der freien. Beim Kunden stand dann „3
 * Einheiten“ für ein Haus mit 14.
 */
export function gemeinschaftseigentumAngaben(objekt: ObjektFuerAnzeige, sprache?: Sprache): string[] {
  const t = texte(sprache);
  const zahl = (n: number) => ganzeZahl(n, sprache);
  const g = objekt.globalDaten;
  const angaben: string[] = [];
  const einheiten = einheitenImHaus(objekt);
  if (einheiten) angaben.push(t.einheiten(einheiten, zahl(einheiten)));
  const etagen = positiv(g?.etagen);
  if (etagen) angaben.push(t.etagen(etagen, zahl(etagen)));
  const heizung = rohdatenQuellen(objekt).map((q) => heizungText(q)).find(Boolean);
  if (heizung) angaben.push(t.heizung(heizung));
  const aufzug = aufzugText(objekt, t);
  if (aufzug) angaben.push(aufzug);
  const stellplaetze = positiv(g?.stellplaetze);
  if (stellplaetze) angaben.push(t.stellplaetze(stellplaetze, zahl(stellplaetze)));
  const grundstueck = positiv(g?.grundstueckQm);
  if (grundstueck) angaben.push(t.grundstueck(zahl(grundstueck)));
  return angaben;
}

/**
 * Die Kachel „Gemeinschaftseigentum“.
 *
 * Ein von Hand gepflegter Text gewinnt; sein erster Teil bis zum Komma ist
 * der Wert, der Rest die Zeile darunter. Sonst die Angaben aus
 * `gemeinschaftseigentumAngaben`. Auf der Einheitsseite kommt der
 * Miteigentumsanteil der Einheit dazu, denn er sagt, welcher Teil des
 * Gemeinschaftseigentums dem Käufer gehört.
 *
 * Bis zum 23.09.2026 stand hier die Objektbeschreibung aus Investagon, also
 * dieselben Freitexte wie in der Kurzbeschreibung.
 */
export function gemeinschaftseigentumAnzeige(
  objekt: ObjektFuerAnzeige,
  wohnung?: Pick<ObjektWohnung, "investagonRaw"> | null,
  sprache?: Sprache,
): DetailAnzeige & { angaben: string[]; gepflegt: boolean } {
  const t = texte(sprache);
  const anteil = wohnung ? miteigentumsanteilText({ meta: { investagonRaw: wohnung.investagonRaw } }) : undefined;
  const anteilText = anteil ? t.miteigentumsanteil(anteil) : undefined;

  const hand = objektseiteHandwerte(objekt).gemeinschaftseigentum;
  if (hand) {
    const teile = hand.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    const unter = [...teile.slice(1), anteilText].filter(Boolean).join(", ");
    return { wert: teile[0] ?? hand, unter: unter || undefined, angaben: teile, gepflegt: true };
  }

  const angaben = gemeinschaftseigentumAngaben(objekt, sprache);
  const alle = anteilText ? [...angaben, anteilText] : angaben;
  if (alle.length === 0) return { wert: t.keineAngaben, angaben, gepflegt: false };
  return { wert: alle[0], unter: alle.slice(1).join(", ") || undefined, angaben, gepflegt: false };
}

/* ------------------------------------------------------------------ */
/* Sanierungen                                                         */
/* ------------------------------------------------------------------ */

/** „gepflegt“: von Hand im CRM; „bautraeger“: aus Texten und Unterlagen herausgelesen. */
export type SanierungsQuelle = "gepflegt" | "bautraeger";

export interface SanierungEintrag {
  jahr: string;
  massnahme: string;
  /** Nur bei gepflegten Maßnahmen, herausgelesene tragen keinen Betrag. */
  betrag?: number;
  quelle: SanierungsQuelle;
  /** Die Textstelle, aus der die Maßnahme herausgelesen wurde. */
  beleg?: string;
}

export interface SanierungenAnzeige extends DetailAnzeige {
  /** Woher der Wert kommt; „import“ heißt: nur Sanierungsjahre, keine Maßnahmen. */
  art: "gepflegt" | "bautraeger" | "import" | "neubau" | "keine";
  /** Die Maßnahmen, neueste zuerst. Leer bei „import“, „neubau“, „keine“. */
  eintraege: SanierungEintrag[];
  /** Sanierungsjahre aus Objekt- und Einheitsdaten, die keine Maßnahme schon nennt. */
  importJahre: number[];
  /** Alle belegten Jahre, absteigend und ohne Doppelte. */
  jahre: number[];
}

/**
 * Die automatisch herausgelesenen Maßnahmen unter
 * `meta.objekttexteKi.sanierungen`.
 *
 * Absprache mit der Stelle, die das Feld schreibt: ein Array aus
 * `{ jahr: string, massnahme: string, beleg: string }`, neueste zuerst, `jahr`
 * darf leer sein. Gelesen wird trotzdem wie Fremddaten, ohne Schema und ohne
 * Import aus `objektTexteKi.ts`: Ein Eintrag ohne Maßnahme fällt weg, ein Jahr
 * als Zahl wird zum Text, alles andere bricht nichts.
 */
export function sanierungenAusObjekttexteKi(meta: unknown): SanierungEintrag[] {
  if (!istObjekt(meta)) return [];
  const ki = meta.objekttexteKi;
  if (!istObjekt(ki) || !Array.isArray(ki.sanierungen)) return [];
  return ki.sanierungen
    .map((e): SanierungEintrag | null => {
      if (!istObjekt(e)) return null;
      const massnahme = text(e.massnahme);
      if (!massnahme) return null;
      const beleg = text(e.beleg);
      return { jahr: text(e.jahr) ?? "", massnahme, quelle: "bautraeger", ...(beleg ? { beleg } : {}) };
    })
    .filter((e): e is SanierungEintrag => e !== null);
}

/**
 * Die Sanierungsjahre aus dem Import: am Objekt `object_renovation_year`, an
 * jeder Einheit `sanierungsjahr` und `object_renovation_year`.
 *
 * Ein Jahr bis einschließlich Baujahr fällt heraus. Investagon trägt bei
 * manchen Häusern das Baujahr auch als Sanierungsjahr ein, und „zuletzt 1971
 * saniert“ bei Baujahr 1971 wäre keine Sanierung, sondern ein Füllwert.
 */
export function importSanierungsjahre(objekt: ObjektFuerAnzeige): number[] {
  const kandidaten: unknown[] = [];
  const roh = (objekt.meta as Record<string, unknown> | undefined)?.investagonRaw;
  if (istObjekt(roh)) kandidaten.push(roh.object_renovation_year);
  for (const w of objekt.wohnungen || []) {
    kandidaten.push(w?.sanierungsjahr);
    if (istObjekt(w?.investagonRaw)) kandidaten.push(w.investagonRaw.object_renovation_year);
  }
  const baujahr = baujahrVon(objekt);
  const jahre = kandidaten
    .map(plausiblesJahr)
    .filter((j): j is number => j !== undefined && (!baujahr || j > baujahr));
  return [...new Set(jahre)].sort((a, b) => b - a);
}

/** Neueste zuerst; ohne Jahr ans Ende, in der gegebenen Reihenfolge. */
function neuesteZuerst(eintraege: SanierungEintrag[]): SanierungEintrag[] {
  const spaetestes = (e: SanierungEintrag) => Math.max(0, ...jahreIn(e.jahr));
  return [...eintraege].sort((a, b) => spaetestes(b) - spaetestes(a));
}

function jahreSatz(jahre: number[], t: ObjektdetailsTexte = texte(undefined)): string {
  return t.jahreSatz(jahre);
}

/**
 * Die Kachel „Sanierungen“, in dieser Reihenfolge der Quellen:
 *
 *   1. von Hand gepflegt (`meta.sanierungen`), das gewinnt immer;
 *   2. sonst die herausgelesenen Maßnahmen (`meta.objekttexteKi.sanierungen`),
 *      gekennzeichnet als „aus den Angaben des Bauträgers“, damit niemand sie
 *      für geprüft hält;
 *   3. dazu immer die Sanierungsjahre aus dem Import.
 *
 * Wert: „Zuletzt 2024“ nach dem jüngsten belegten Jahr bis heute, „Geplant
 * 2027“ wenn alle Jahre in der Zukunft liegen, „Laut Bauträger“ bei Maßnahmen
 * ohne Jahr, „Neubau 2025“ bei einem Neubau ohne Maßnahmen, sonst „Keine
 * Angaben vom Bauträger“. Darunter höchstens drei Maßnahmen; die vollständige
 * Liste steht auf der Einheitsseite.
 */
export function sanierungenAnzeige(objekt: ObjektFuerAnzeige, heute: Date = new Date(), sprache?: Sprache): SanierungenAnzeige {
  const t = texte(sprache);
  const hand = objektseiteHandwerte(objekt);
  const gepflegt: SanierungEintrag[] = hand.sanierungen.map((s) => ({ ...s, quelle: "gepflegt" }));
  const eintraege = neuesteZuerst(gepflegt.length ? gepflegt : sanierungenAusObjekttexteKi(objekt.meta));

  const genannteJahre = new Set(eintraege.flatMap((e) => jahreIn(e.jahr)));
  const neubau = istNeubauArt(objektartInfo(hand.objektart)?.id ?? objektartAbleiten(objekt));
  // Bei einem Neubau ohne Maßnahmen ist ein Sanierungsjahr ein Füllwert.
  const importJahre = eintraege.length === 0 && neubau
    ? []
    : importSanierungsjahre(objekt).filter((j) => !genannteJahre.has(j));
  const jahre = [...new Set([...genannteJahre, ...importJahre])].sort((a, b) => b - a);

  if (eintraege.length === 0 && importJahre.length === 0) {
    if (neubau) {
      const baujahr = baujahrVon(objekt);
      return { wert: baujahr ? t.neubauJahr(baujahr) : t.neubau, art: "neubau", eintraege, importJahre, jahre };
    }
    return { wert: t.keineAngaben, art: "keine", eintraege, importJahre, jahre };
  }

  const diesesJahr = heute.getFullYear();
  const vergangen = jahre.filter((j) => j <= diesesJahr);
  const art: SanierungenAnzeige["art"] = eintraege.length ? (gepflegt.length ? "gepflegt" : "bautraeger") : "import";
  const wert = vergangen.length
    ? t.zuletzt(vergangen[0])
    : jahre.length
      ? t.geplant(jahre[jahre.length - 1])
      : art === "bautraeger" ? t.laufBautraeger : t.ohneJahresangabe;

  if (art === "import") {
    return { wert, unter: `${jahreSatz(importJahre, t)}, ${t.massnahmenNichtGenannt}`, art, eintraege, importJahre, jahre };
  }

  const kurz = eintraege.slice(0, 3).map((e) => [e.jahr, e.massnahme].filter(Boolean).join(" "));
  const weitere = eintraege.length > 3 ? t.undWeitere(eintraege.length - 3) : "";
  const unter = [
    `${kurz.join(", ")}${weitere}`,
    art === "bautraeger" ? t.vermerkBautraeger : undefined,
    importJahre.length ? jahreSatz(importJahre, t) : undefined,
  ].filter(Boolean).join(" · ");
  return { wert, unter, art, eintraege, importJahre, jahre };
}

/* ------------------------------------------------------------------ */
/* Alles zusammen                                                      */
/* ------------------------------------------------------------------ */

export interface Objektdetails {
  verwaltung: ReturnType<typeof verwaltungAnzeige>;
  gemeinschaftseigentum: ReturnType<typeof gemeinschaftseigentumAnzeige>;
  sanierungen: SanierungenAnzeige;
}

/**
 * Die drei Kacheln auf einmal. Mit Einheit (Einheitsseite) kommt deren
 * Miteigentumsanteil ins Gemeinschaftseigentum, sonst ist alles gleich, damit
 * Objektseite und Einheitsseite dasselbe sagen.
 */
export function objektdetailsAnzeige(
  objekt: ObjektFuerAnzeige,
  wohnung?: (Pick<ObjektWohnung, "investagonRaw"> & Partial<Pick<ObjektWohnung, "verwaltungSevMonat">>) | null,
  heute: Date = new Date(),
  sprache?: Sprache,
): Objektdetails {
  return {
    verwaltung: verwaltungAnzeige(objekt, wohnung?.verwaltungSevMonat, sprache),
    gemeinschaftseigentum: gemeinschaftseigentumAnzeige(objekt, wohnung, sprache),
    sanierungen: sanierungenAnzeige(objekt, heute, sprache),
  };
}
