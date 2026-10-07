import { COMPANY_LINE } from "../pdfBranding";
import {
  exposeAbschnitte,
  marktQuelleHinweis,
  mikrolageZeigen,
  planAnzeigename,
  sichtbareZeilen,
  verwaltungKostenText,
  type ExposeAbschnittId,
  type ExposeInhalt,
  type Person,
} from "../exposeInhalt";
import { ENERGIESTUFEN, SKALA_MAXIMUM } from "../energieskala";
import { STANDARD_ANNAHMEN, type ExposeAnnahmen } from "../exposeAnnahmen";
import { VERMOEGENS_HORIZONTE, type ExposeErgebnis } from "../exposeRechner";
import { eur0 as eur0Sprache, dez as dezSprache, prozent as prozentSprache, zimmerText } from "../objektKennzahlen";
import { NUR_DEUTSCH_HINWEIS } from "../seitenSprache";
import { glossarEnglisch } from "../kundenspracheGlossar";
import { datumText as sprachDatum, type FormatSprache } from "../sprachFormat";
import { entfernungFuer, exposePdfTexte, genauigkeitEnglisch, rechnerHinweisEnglisch, umgebungHinweisEnglisch, umgebungTitel } from "../exposePdfTexte";
import { genauigkeitHinweis, kartenPunkte, legende, umgebungFuerKunden } from "../umgebungspunkte";
import type { AnnahmenHerkunftKarte } from "@/components/expose/ExposeRechner";
import { exposeSeitenTexte } from "@/components/expose/exposeTexte";

/**
 * Das Exposé für den Druck aufbereitet (Entwürfe vom 01.10.2026).
 *
 * Alles, was die Exposé-Seite zeigt, als fertig formatierte Texte in der
 * Sprache des Kunden: dieselben Formulierungen und Zahlen wie im bisherigen
 * Exposé-PDF (bis 01.10.2026 `exposeEinheitPdf.ts`) und auf der Seite. Das
 * Design (`H3Nachtblau.tsx`) gestaltet nur noch, es rechnet und übersetzt
 * nichts.
 */

export interface DruckBild {
  /** Data-URL (JPEG oder PNG). */
  src: string;
  breite: number;
  hoehe: number;
}

/** Was vorab geladen wird, siehe `bilder.ts`. */
export interface DruckBilder {
  fotos: DruckBild[];
  /** Je Plan in derselben Reihenfolge wie `inhalt.grundriss.dokumente`, `null` wenn er nicht als Bild geladen werden konnte. */
  plaene: Array<DruckBild | null>;
  karte?: DruckBild | null;
  logo?: DruckBild | null;
  /** Das Logo mit weißer Schrift für dunkle Flächen. */
  logoHell?: DruckBild | null;
  /** Bild des Ansprechpartners, falls vorhanden. */
  person?: DruckBild | null;
}

export interface Zeile { label: string; wert: string; unter?: string; fett?: boolean }
export interface Punkt { titel: string; text: string }
export interface Tabelle { spalten: Array<{ titel: string; rechts?: boolean; anteil: number }>; zeilen: string[][] }

export interface DruckDaten {
  sprache: FormatSprache;
  /** Kleine feste Wörter der Entwürfe (Inhalt, Seite, Abschnitt …). */
  w: DruckWoerter;
  meta: {
    kennung: string;
    dokumentTitel: string;
    erstelltAm: string;
    preisstand: string;
    firmenzeile: string;
    kunde?: string;
    deckblattFuss: string;
    /** Linke und rechte Angabe der Fußzeile. */
    fussLinks: string;
    fussModell: string;
  };
  kopf: {
    eyebrow: string;
    titel: string;
    /** Adresse ohne Ort, für kurze Kopfzeilen. */
    kurz: string;
    ortszeile: string[];
    einheit: string;
    ort: string;
    /** Lage als Breite und Länge, etwa „51,3375° N · 12,4093° O“, wenn bekannt. */
    koordinaten?: string;
  };
  fotos: DruckBild[];
  logo?: DruckBild | null;
  logoHell?: DruckBild | null;
  kennzahlen: Zeile[];
  ortFakten: Zeile[];
  chips: string[];
  beschreibung?: { text: string; hinweis?: string };
  /** Die Abschnitte, die es in diesem Exposé gibt, in der Reihenfolge der Seite. */
  abschnitte: Array<{ id: ExposeAbschnittId; nr: string; titel: string; claim: string }>;
  standort?: {
    ort: string;
    kennzahlen: Zeile[];
    leerSatz?: string;
    argumenteTitel: string;
    argumente: Punkt[];
    argumenteLeer?: string;
    markt?: { titel: string; punkte: Punkt[]; quelle: string };
    arbeitgeberTitel: string;
    arbeitgeber: Array<{ name: string; unter: string }>;
    quelle: string;
    hinweise: string[];
  };
  mikrolage?: {
    vorspann: string;
    karte?: DruckBild | null;
    legende: Array<{ titel: string; farbe: string }>;
    objektLabel: string;
    genauigkeit?: string;
    gruppen: Array<{ ebene: "mikro" | "makro"; titel: string; farbe: string; teile: Array<{ titel?: string; orte: Array<{ name: string; weg: string }> }> }>;
    makroTitel: string;
    makroText?: string;
    leerText?: { titel: string; text: string };
    fussnote?: string;
  };
  objektdaten: {
    zeilen: Zeile[];
    sanierungenTitel: string;
    sanierungen?: Tabelle;
    sanierungenText?: string;
    gemeinschaft?: string;
    energie: {
      titel: string;
      kopf: string;
      stufen: Array<{ klasse: string; farbe: string; aktiv: boolean }>;
      positionProzent?: number;
      kennwert?: string;
      ohneKennwert: string;
      skala: Array<{ wert: string; prozent: number }>;
      hinweis?: string;
    };
    pflichtFehlen?: Punkt;
    besonderheiten?: { titel: string; texte: string[]; quelle: string };
    merkmale?: { titel: string; liste: Array<{ bezeichnung: string; wert: string }>; quelle: string };
    einheiten?: { titel: string; tabelle: Tabelle; hinweis?: string };
  };
  grundriss?: {
    plaene: Array<{ name: string; bild: DruckBild | null }>;
    ersatz?: string;
    hinweis: string;
    dateiText?: string;
  };
  finanzen?: {
    vorspann: string;
    kaufTitel: string;
    kaufLinks: Zeile[];
    kaufRechts: Zeile[];
    kaufNotiz: string;
    /** Die drei wichtigsten Zahlen für große Darstellung. */
    hoehepunkte: Zeile[];
    annahmenTitel: string;
    annahmen: Tabelle;
    annahmenNotizen: string[];
    monatTitel: string;
    einnahmenTitel: string;
    einnahmen: Zeile[];
    ausgabenTitel: string;
    ausgaben: Zeile[];
    ergebnis: Zeile;
    /** Monatlicher Eigenanteil (true) oder Überschuss (false). */
    eigenanteil: boolean;
    vermoegen?: {
      titel: string;
      tabelle: Tabelle;
      balken: Array<{ label: string; werte: [number, number, number] }>;
      legende: [string, string, string];
      achse: (v: number) => string;
      ekTitel: string;
      ek: Zeile[];
      fuss: string;
    };
    vermoegenLeer?: string;
    karten: Array<{ titel: string; text: string; zeilen: Zeile[] }>;
  };
  verwaltung: { titel: string; unter?: string; leistungen: string[]; ohneLeistungen?: string; notiz: string; einblickeTitel: string };
  /**
   * Nächste Schritte und Zeitplan in einem Kapitel (01.10.2026): vorneweg die
   * erledigten Schritte (Beratung), dann die Stationen mit Zeitangabe und
   * Erklärung.
   */
  zeitplan: {
    erledigt: Array<{ titel: string; text: string }>;
    erledigtLabel: string;
    stationen: Array<{ nr: number; titel: string; frist?: string; zahlung: boolean; text?: string }>;
    notiz: string;
  };
  chancen: { vorspann: string; chance: string; risiko: string; themen: Array<{ titel: string; chance: string; risiko: string }> };
  rechtliches: { entwurf?: Punkt; hinweise: Punkt[]; energieTitel: string; energie: Zeile[] };
  kontakt: {
    eyebrow: string;
    satz: string;
    text: string;
    personTitel: string;
    person: { name: string; rolle: string; initialen: string; zeilen: string[]; bild?: DruckBild | null };
    firma: string;
    erstellt: string;
  };
}

export interface DruckWoerter {
  inhalt: string;
  seite: string;
  abschnitt: string;
  einblicke: string;
  kennzahlen: string;
  aufEinenBlick: string;
  monatlich: string;
  monatlichKurz: string;
  objektdaten: string;
  modellrechnung: string;
  einheit: string;
  ansprechpartner: string;
  fuer: string;
  stand: string;
}

const WOERTER: Record<FormatSprache, DruckWoerter> = {
  de: {
    inhalt: "Inhalt", seite: "Seite", abschnitt: "Abschnitt", einblicke: "Einblicke", kennzahlen: "Kennzahlen",
    aufEinenBlick: "Auf einen Blick", monatlich: "Monatlich", monatlichKurz: "mtl.", objektdaten: "Objektdaten",
    modellrechnung: "Modellrechnung", einheit: "Einheit", ansprechpartner: "Ansprechpartner", fuer: "Für", stand: "Stand",
  },
  en: {
    inhalt: "Contents", seite: "Page", abschnitt: "Section", einblicke: "Impressions", kennzahlen: "Key figures",
    aufEinenBlick: "At a glance", monatlich: "Monthly", monatlichKurz: "p.m.", objektdaten: "Property details",
    modellrechnung: "Model calculation", einheit: "Unit", ansprechpartner: "Contact", fuer: "For", stand: "As of",
  },
};

export interface DruckOptionen {
  sprache?: FormatSprache;
  herkunft?: AnnahmenHerkunftKarte;
  eigenkapitalEuro?: number;
  erstelltAm?: Date;
  preisstandAm?: Date;
  /** Besonderheiten und Merkmale aus Investagon, wie die Seite sie zeigt. */
  zusatz?: { beschreibungen: string[]; merkmale: Array<{ bezeichnung: string; wert: string }> };
}

/** HSL-Text aus energieskala.ts („hsl(145 60% 36%)") als Hex. */
function hslZuHex(hsl: string): string {
  const m = hsl.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (!m) return "#7A8594";
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function initialen(name: string): string {
  return name.split(" ").filter(Boolean).map((t) => t[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Je Liste die nächsten fünf Orte (die Messung liefert sie nach Entfernung).
 * Lange Listen (etwa Schulen, Kitas, Apotheken) sprengten sonst die Seite;
 * die vollständige Liste steht im Online-Exposé.
 */
const ORTE_JE_GRUPPE = 5;

const HERKUNFT_TEXT = { selbstauskunft: "Selbstauskunft", objekt: "Objekt" } as const;
const HERKUNFT_TEXT_EN = { selbstauskunft: "Self-disclosure", objekt: "Property" } as const;

/** Herkunft eines Annahmewerts: Selbstauskunft, Objekt, Standard oder vom Nutzer angepasst. */
export function annahmeHerkunft(feld: keyof ExposeAnnahmen, annahmen: ExposeAnnahmen, herkunft: AnnahmenHerkunftKarte, sprache: FormatSprache = "de"): string {
  const h = herkunft[feld];
  const en = sprache === "en";
  if (h) return (en ? HERKUNFT_TEXT_EN : HERKUNFT_TEXT)[h];
  if (feld === "startjahr" || feld === "betrachtungsjahr") return "Standard";
  const standard = STANDARD_ANNAHMEN[feld as keyof typeof STANDARD_ANNAHMEN];
  if ((standard ?? null) === (annahmen[feld] ?? null)) return "Standard";
  return en ? "Adjusted" : "Angepasst";
}

/** Dateiname „Expose-<Objekt>-<WE>-<Datum>.pdf", nur mit Buchstaben, Ziffern und Bindestrichen, ohne Personennamen. */
export function exposePdfDateiname(inhalt: ExposeInhalt, datum: Date = new Date()): string {
  const sauber = (t: string) =>
    t
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const objekt = sauber(inhalt.kopf.adresse.split(",")[0] || "Objekt") || "Objekt";
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
  // Das Exposé des ganzen Objekts hat keine Wohneinheit; der Titel wiederholte sonst die Adresse.
  if (inhalt.ansicht === "objekt") return `Expose-${objekt}-${tag}.pdf`;
  const we = sauber(inhalt.kopf.weNr || inhalt.kopf.titel) || "WE";
  return `Expose-${objekt}-${we}-${tag}.pdf`;
}

function koordinatenText(k: { lat: number; lng: number } | undefined, sprache: FormatSprache): string | undefined {
  if (!k || !Number.isFinite(k.lat) || !Number.isFinite(k.lng)) return undefined;
  const z = (n: number) => dezSprache(Math.abs(n), 4, sprache);
  const ostWest = k.lng >= 0 ? (sprache === "en" ? "E" : "O") : "W";
  return `${z(k.lat)}° ${k.lat >= 0 ? "N" : "S"} · ${z(k.lng)}° ${ostWest}`;
}

export function baueDruckDaten(
  inhalt: ExposeInhalt,
  annahmen: ExposeAnnahmen,
  ergebnis: ExposeErgebnis,
  bilder: DruckBilder,
  optionen: DruckOptionen = {},
): DruckDaten {
  const sprache: FormatSprache = optionen.sprache === "en" ? "en" : "de";
  const T = exposePdfTexte(sprache);
  const S = exposeSeitenTexte(sprache);
  const en = sprache === "en";
  const eur0 = (n: number) => eur0Sprache(n, sprache);
  const dez = (n: number, st = 1) => dezSprache(n, st, sprache);
  const prozent = (n: number, st = 2) => prozentSprache(n, st, sprache);
  const ganzzahl = (n: number) => (en ? dezSprache(n, 0, "en") : new Intl.NumberFormat("de-DE").format(n));
  const datum = (d: Date) => (en ? sprachDatum(d, "en") : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  const erstelltAm = optionen.erstelltAm ?? new Date();
  const preisstandAm = optionen.preisstandAm ?? erstelltAm;
  const herkunft = optionen.herkunft ?? {};
  // „≈“ fehlt in der Hausschrift.
  const ca = en ? "approx. " : "ca. ";
  const kundeName = (inhalt.kopf.kundeName ?? "").trim();
  const vertrieb = inhalt.kontakt.vertrieb;

  // Geschützte Leerzeichen: „WE 02“ und „04318 Leipzig“ brechen nie auseinander.
  const kopftitel = (inhalt.kopf.ueberschrift || `${inhalt.kopf.adresse.split(",")[0]}, ${inhalt.kopf.titel}`)
    .replace(/(\d{5}) /g, "$1\u00A0")
    .replace(/\b(WE|Wohnung|Unit|Apartment) (\S+)$/, "$1\u00A0$2");
  const ortszeile = inhalt.kopf.ortszeile ?? [inhalt.kopf.ort, inhalt.kopf.untertitel].filter(Boolean);

  /* ── Welche Abschnitte gibt es? Dieselben Regeln wie auf der Seite. ── */
  const st = inhalt.standort;
  const standortZeigen = st.kennzahlen.length > 0 || st.argumente.length > 0 || st.marktargumente.length > 0 || st.arbeitgeber.length > 0;
  const umgebung = umgebungFuerKunden(inhalt.mikrolage.umgebung);
  const mikroZeigen = mikrolageZeigen(inhalt.mikrolage) || !!umgebung;
  const finanzZeigen = inhalt.wirtschaftlichkeit.verfuegbar !== false;
  const vorhanden: Partial<Record<ExposeAbschnittId, boolean>> = {
    standort: standortZeigen,
    mikrolage: mikroZeigen,
    grundriss: inhalt.grundriss.dokumente.length > 0,
    wirtschaftlichkeit: finanzZeigen,
  };
  const abschnitte = exposeAbschnitte(sprache)
    .filter((a) => vorhanden[a.id] !== false)
    .map((a, i) => ({
      id: a.id,
      nr: String(i + 1).padStart(2, "0"),
      titel: a.id === "start" ? S.eyebrowEinheit : a.id === "standort" ? st.ort || S.koepfe.standort[1] : S.koepfe[a.id as Exclude<ExposeAbschnittId, "start">][1],
      claim: a.id === "start" ? T.deineKapitalanlage : S.koepfe[a.id as Exclude<ExposeAbschnittId, "start">][0],
    }));

  /* ── Start ── */
  const ortFakten: Zeile[] = [];
  if (typeof inhalt.start.einwohner === "number" && inhalt.start.einwohner > 0) ortFakten.push({ label: S.einwohnerIn(st.ort), wert: ganzzahl(inhalt.start.einwohner) });
  if (typeof inhalt.start.wachstumProzent === "number" && Number.isFinite(inhalt.start.wachstumProzent)) {
    const w = inhalt.start.wachstumProzent;
    ortFakten.push({ label: S.entwicklungFuenfJahre, wert: `${w > 0 ? "+" : ""}${prozent(w, 1)}` });
  }

  /* ── Standort ── */
  const standort: DruckDaten["standort"] = standortZeigen ? {
    ort: st.ort,
    kennzahlen: st.kennzahlen.map((k) => ({ label: k.label, wert: k.wert, unter: k.unter })),
    leerSatz: st.kennzahlen.length ? undefined : T.keineStandortkennzahlen(st.ort),
    argumenteTitel: T.warum(st.ort),
    argumente: st.argumente,
    argumenteLeer: st.argumente.length ? undefined : T.argumenteImGespraech,
    markt: st.marktargumente.length ? { titel: T.marktUndStandort, punkte: st.marktargumente, quelle: marktQuelleHinweis(sprache) } : undefined,
    arbeitgeberTitel: T.arbeitgeber,
    arbeitgeber: st.arbeitgeber.map((a) => ({ name: a.name, unter: [a.branche, a.mitarbeiter ? T.beschaeftigte(ganzzahl(a.mitarbeiter)) : ""].filter(Boolean).join(" · ") })),
    quelle: T.quelle(st.quelle),
    hinweise: [inhalt.nurDeutsch.standortargumente && st.argumente.length ? NUR_DEUTSCH_HINWEIS : "", inhalt.nurDeutsch.marktargumente && st.marktargumente.length ? NUR_DEUTSCH_HINWEIS : ""].filter(Boolean),
  } : undefined;

  /* ── Mikrolage ── */
  let mikrolage: DruckDaten["mikrolage"];
  if (mikroZeigen) {
    if (umgebung) {
      const genau = en ? genauigkeitEnglisch(umgebung.genauigkeit) : genauigkeitHinweis(umgebung.genauigkeit);
      const umgebungHinweis = en ? umgebungHinweisEnglisch(umgebung.leer) : umgebung.hinweis;
      const gruppen: NonNullable<DruckDaten["mikrolage"]>["gruppen"] = [];
      for (const k of umgebung.kategorien) {
        const titel = umgebungTitel(k.id, k.titel, sprache);
        const teile = k.listen.map((l) => ({
          titel: k.listen.length > 1 ? umgebungTitel(l.id, l.titel, sprache) : undefined,
          orte: l.punkte.slice(0, ORTE_JE_GRUPPE).map((p) => ({ name: p.name, weg: entfernungFuer(p.entfernungMeter, sprache) })),
        }));
        gruppen.push({ ebene: k.ebene, titel, farbe: k.farbe, teile });
      }
      const makroText = !umgebung.makroGemessen ? T.makroNichtGemessen : umgebung.kategorien.some((k) => k.ebene === "makro") ? undefined : T.makroLeer;
      mikrolage = {
        vorspann: T.umgebungVon(inhalt.mikrolage.adresse),
        karte: bilder.karte ?? null,
        legende: legende(kartenPunkte(umgebung)).map((e) => ({ titel: umgebungTitel(e.id, e.titel, sprache), farbe: e.farbe })),
        objektLabel: umgebung.genauigkeit === "ort" || umgebung.genauigkeit === "plz" ? T.messpunkt : T.objekt,
        genauigkeit: genau || undefined,
        gruppen,
        makroTitel: T.makrolage,
        makroText,
        leerText: umgebung.kategorien.some((k) => k.ebene === "mikro") ? undefined : { titel: T.umgebung, text: umgebungHinweis },
        fussnote: umgebung.leer ? undefined : `${umgebungHinweis}${bilder.karte ? "" : T.karteOnline}`,
      };
    } else {
      mikrolage = {
        vorspann: T.umgebungVon(inhalt.mikrolage.adresse),
        legende: [], objektLabel: T.objekt, gruppen: [], makroTitel: T.makrolage,
        leerText: { titel: T.umgebungImGespraechTitel, text: T.umgebungImGespraech },
      };
    }
  }

  /* ── Objektdaten ── */
  const eg = inhalt.objektdaten.energie;
  const zusatz = optionen.zusatz;
  const keineAngabe = en ? "Not specified" : "Keine Angabe";
  const global = inhalt.struktur === "globalobjekt";
  const einheiten = inhalt.einheiten?.length ? (global
    ? {
      titel: S.mietenspiegelTitel,
      hinweis: S.hausImGanzen,
      tabelle: {
        spalten: [{ titel: S.spalteEinheit, anteil: 16 }, { titel: S.spalteLage, anteil: 22 }, { titel: S.spalteWohnflaeche, anteil: 16, rechts: true }, { titel: S.spalteZimmer, anteil: 14, rechts: true }, { titel: S.spalteKaltmiete, anteil: 16, rechts: true }, { titel: S.spalteVermietung, anteil: 16 }],
        zeilen: inhalt.einheiten.map((w) => [w.nummer || S.einheit, w.lage || keineAngabe, w.flaeche > 0 ? `${dez(w.flaeche, 1)} m²` : keineAngabe, w.zimmer ? zimmerText(w.zimmer, sprache) : keineAngabe, w.miete && w.miete > 0 ? eur0(w.miete) : keineAngabe, w.vermietet ? S.vermietet : S.frei]),
      },
    }
    : {
      titel: S.einheitenUeberblick,
      tabelle: {
        spalten: [{ titel: S.spalteEinheit, anteil: 22 }, { titel: S.spalteWohnflaeche, anteil: 20, rechts: true }, { titel: S.spalteZimmer, anteil: 16, rechts: true }, { titel: S.spalteKaufpreis, anteil: 22, rechts: true }, { titel: S.spalteStatus, anteil: 20 }],
        zeilen: inhalt.einheiten.map((w) => [w.nummer, w.flaeche > 0 ? `${dez(w.flaeche, 1)} m²` : keineAngabe, w.zimmer ? zimmerText(w.zimmer, sprache) : keineAngabe, w.preis > 0 ? eur0(w.preis) : keineAngabe, w.status === "frei" ? S.statusVerfuegbar : w.status === "reserviert" ? S.statusReserviert : S.statusVerkauft]),
      },
    }) : undefined;
  const objektdaten: DruckDaten["objektdaten"] = {
    zeilen: sichtbareZeilen(inhalt.objektdaten.zeilen).map((z) => ({ label: z.label, wert: z.wert, unter: z.unter })),
    sanierungenTitel: T.sanierungenTitel,
    sanierungen: inhalt.objektdaten.sanierungen.length ? {
      spalten: [{ titel: T.jahr, anteil: 16 }, { titel: T.massnahme, anteil: 62 }, { titel: T.kosten, anteil: 22, rechts: true }],
      zeilen: inhalt.objektdaten.sanierungen.map((s) => [s.jahr, s.massnahme, s.betrag ? eur0(s.betrag) : ""]),
    } : undefined,
    sanierungenText: inhalt.objektdaten.sanierungen.length ? undefined : inhalt.objektdaten.sanierungenOhneListe || T.keineAngabenBautraeger,
    gemeinschaft: inhalt.objektdaten.gemeinschaftseigentum || undefined,
    energie: {
      titel: T.energieTitel,
      kopf: [eg.art, eg.energietraeger, eg.baujahr ? T.baujahr(eg.baujahr) : "", eg.gueltigBis ? T.gueltigBis(eg.gueltigBis) : ""].filter(Boolean).join(" · ") || T.energieFehlt,
      stufen: ENERGIESTUFEN.map((s) => ({ klasse: s.klasse, farbe: hslZuHex(s.farbe), aktiv: s.klasse === eg.klasse })),
      positionProzent: typeof eg.positionProzent === "number" && typeof eg.kennwert === "number" ? eg.positionProzent : undefined,
      kennwert: typeof eg.kennwert === "number" ? `${dez(eg.kennwert, 1)} kWh/(m²·a)` : undefined,
      ohneKennwert: T.ohneKennwert,
      skala: [0, 50, 100, 150, 200, 250].map((v) => ({ wert: String(v), prozent: (v / SKALA_MAXIMUM) * 100 })).concat([{ wert: T.ueberSkala(SKALA_MAXIMUM), prozent: 100 }]),
      hinweis: eg.hinweis || undefined,
    },
    pflichtFehlen: inhalt.objektdaten.fehlendePflichtangaben.length ? { titel: T.pflichtFehlenTitel, text: T.pflichtFehlen(inhalt.objektdaten.fehlendePflichtangaben.join(", ")) } : undefined,
    besonderheiten: zusatz?.beschreibungen.length ? { titel: S.besonderheiten, texte: zusatz.beschreibungen, quelle: S.quelleAnbieter } : undefined,
    merkmale: zusatz?.merkmale.length ? { titel: S.ausstattung, liste: zusatz.merkmale, quelle: S.quelleAnbieter } : undefined,
    einheiten,
  };

  /* ── Grundriss ── */
  const dokumente = inhalt.grundriss.dokumente;
  const ersatzArt = dokumente.find((d) => d.ersatz)?.ersatz;
  const grundriss: DruckDaten["grundriss"] = dokumente.length ? {
    plaene: dokumente.map((d, i) => ({ name: planAnzeigename(d.name), bild: bilder.plaene[i] ?? null })),
    ersatz: ersatzArt && dokumente.length === 1 ? `${T.ersatzTitel[ersatzArt]}. ${T.ersatzText[ersatzArt]}` : undefined,
    hinweis: T.masseHinweis,
    dateiText: bilder.plaene.some(Boolean) ? undefined : T.grundrissDatei(dokumente.map((d) => planAnzeigename(d.name)).join(", ")),
  } : undefined;

  /* ── Wirtschaftlichkeit ── */
  let finanzen: DruckDaten["finanzen"];
  if (finanzZeigen) {
    const k = ergebnis.kauf;
    const stx = ergebnis.steuer;
    const mo = ergebnis.monat;
    const nk = k.nebenkosten;
    const hk = (feld: keyof ExposeAnnahmen) => annahmeHerkunft(feld, annahmen, herkunft, sprache);
    const Z = T.zeilen;
    const jaNein = (wert: boolean) => (wert ? Z.ja : Z.nein);
    const annahmenZeilen: string[][] = [
      [Z.eigenkapital, `${prozent(annahmen.eigenkapitalProzent, 1)} · ${eur0(k.eigenkapitalInvestition)}`, hk("eigenkapitalProzent")],
      [Z.zins, prozent(annahmen.zinsProzent, 2), hk("zinsProzent")],
      [Z.tilgung, prozent(annahmen.tilgungProzent, 2), hk("tilgungProzent")],
      [Z.zve, eur0(annahmen.zvE), hk("zvE")],
      [Z.verheiratet, jaNein(annahmen.verheiratet), hk("verheiratet")],
      [Z.freibetrag, annahmen.lohnsteuerermaessigung ? Z.ja : Z.freibetragNein, hk("lohnsteuerermaessigung")],
      [Z.grenzsteuersatz, `${prozent(stx.grenzsteuersatzProzent, 1)} ${stx.grenzsteuersatzManuell ? Z.grenzFest : Z.grenzTarif(stx.steuerjahr)}`, stx.grenzsteuersatzManuell ? T.herkunftWerte.angepasst : T.herkunftWerte.tarif],
      [Z.mietsteigerung, prozent(annahmen.mietsteigerungProzent, 1), hk("mietsteigerungProzent")],
      [Z.kostensteigerung, prozent(annahmen.kostensteigerungProzent, 1), hk("kostensteigerungProzent")],
      [Z.wertentwicklung, prozent(annahmen.wertsteigerungProzent, 1), hk("wertsteigerungProzent")],
      [Z.leerstand, prozent(annahmen.leerstandProzent, 1), hk("leerstandProzent")],
      [Z.makler, prozent(annahmen.maklerProzent, 2), hk("maklerProzent")],
      [Z.preisanpassung, `${annahmen.preisanpassungProzent > 0 ? "+" : ""}${prozent(annahmen.preisanpassungProzent, 1)}`, hk("preisanpassungProzent")],
      [Z.afa, Z.afaWert(prozent(annahmen.afaProzent, 1), prozent(stx.gebaeudeanteilProzent, 0), stx.gebaeudeanteilAngenommen), hk("afaProzent")],
      [Z.sonderAfa, annahmen.sonderAfa ? (stx.sonderAfaAktiv ? Z.sonderAfaJa(prozent(stx.sonderAfaProzent, 0), stx.sonderAfaJahre) : Z.sonderAfaNicht) : Z.nein, hk("sonderAfa")],
      [Z.mietverwaltung, jaNein(annahmen.mietverwaltungEinrechnen), hk("mietverwaltungEinrechnen")],
    ];
    if (stx.sanierungsanteil > 0) {
      const artText = annahmen.instandhaltungsart === "erhaltungsaufwand" ? Z.sanierungErhaltung(annahmen.instandhaltungJahre) : annahmen.instandhaltungsart === "werkvertrag" ? Z.sanierungWerkvertrag : Z.sanierungNicht;
      annahmenZeilen.push([Z.sanierung, artText, hk("instandhaltungsart")]);
    }
    annahmenZeilen.push([Z.startHaltedauerTitel, Z.startHaltedauer(annahmen.startjahr, annahmen.haltedauerJahre), hk("haltedauerJahre")]);
    const notizen: string[] = [];
    if (typeof optionen.eigenkapitalEuro === "number" && optionen.eigenkapitalEuro > 0) notizen.push(T.eigenkapitalSa(eur0(optionen.eigenkapitalEuro)));
    const hinweise = en ? ergebnis.hinweise.map(rechnerHinweisEnglisch) : ergebnis.hinweise;
    if (hinweise.length) notizen.push(hinweise.join(" "));

    const kaufLinks: Zeile[] = [{ label: T.kaufpreisWohnung, wert: eur0(k.kaufpreis) }];
    if (k.preisanpassungProzent !== 0) kaufLinks.push({ label: T.preisanpassung(`${k.preisanpassungProzent > 0 ? "+" : ""}${prozent(k.preisanpassungProzent, 1)}`), wert: eur0(k.kaufpreisAngepasst - k.kaufpreis) });
    if (k.stellplatz > 0) kaufLinks.push({ label: T.stellplatz, wert: eur0(k.stellplatz) });
    kaufLinks.push({ label: T.gesamtinvestition, wert: eur0(k.gesamtinvestition), fett: true });
    const kaufRechts: Zeile[] = [
      { label: T.nebenkosten(prozent(nk.prozentGesamt, 1), nk.bundeslandName || ""), wert: eur0(nk.summe) },
      { label: T.darlehen(prozent(k.finanzierungsquoteProzent, 0)), wert: eur0(k.darlehen) },
      { label: T.eigenkapitaleinsatz, wert: eur0(k.eigenkapitaleinsatz), fett: true },
    ];
    const einnahmen: Zeile[] = [
      { label: T.kaltmiete, wert: eur0(mo.miete) },
      { label: T.steuervorteil, wert: eur0(mo.steuervorteil), unter: annahmen.lohnsteuerermaessigung ? T.steuervorteilMonatlich : T.steuervorteilErstattung },
      { label: T.summeEinnahmen, wert: eur0(mo.einnahmen), fett: true },
    ];
    const ausgaben: Zeile[] = [{ label: T.zinsTilgung, wert: eur0(mo.zinsUndTilgung) }, { label: T.hausgeldNu, wert: eur0(mo.hausgeldNichtUmlegbar) }];
    if (mo.ruecklage > 0) ausgaben.push({ label: T.ruecklage, wert: eur0(mo.ruecklage) });
    ausgaben.push({ label: T.mietverwaltung, wert: eur0(mo.mietverwaltung) });
    if (mo.leerstand > 0) ausgaben.push({ label: T.mietausfall, wert: eur0(mo.leerstand) });
    ausgaben.push({ label: T.summeAusgaben, wert: eur0(mo.ausgaben), fett: true });
    const ergebnisZeile: Zeile = { label: mo.eigenanteil >= 0 ? T.eigenanteil : T.ueberschuss, wert: eur0(Math.abs(mo.eigenanteil)), fett: true };

    const horizonte = ergebnis.vermoegensaufbau.filter((h) => (VERMOEGENS_HORIZONTE as readonly number[]).includes(h.jahre));
    const vermoegen = horizonte.length ? {
      titel: T.vermoegensaufbau,
      tabelle: {
        spalten: [{ titel: T.nach, anteil: 20 }, { titel: T.immobilienwert, anteil: 16, rechts: true }, { titel: T.restschuld, anteil: 16, rechts: true }, { titel: T.verkaufsertrag, anteil: 16, rechts: true }, { titel: T.eigenanteile, anteil: 16, rechts: true }, { titel: T.vermoegen, anteil: 16, rechts: true }],
        zeilen: horizonte.map((h) => [T.jahreKalender(h.jahre, h.kalenderjahr), eur0(h.immobilienwert), eur0(h.restschuld), eur0(h.ertragBeiVerkauf), eur0(h.kumCashflow), eur0(h.vermoegen)]),
      },
      balken: horizonte.map((h) => ({ label: T.jahre(h.jahre), werte: [h.immobilienwert, h.restschuld, h.vermoegen] as [number, number, number] })),
      legende: [T.immobilienwert, T.restschuld, T.aufgebautesVermoegen] as [string, string, string],
      achse: (v: number) => (v >= 1_000_000 ? T.achseMio(dez(v / 1_000_000, 1)) : T.achseTsd(Math.round(v / 1000))),
      ekTitel: T.ekRenditeTitel,
      ek: horizonte.map((h) => ({
        label: T.nachJahren(h.jahre),
        wert: h.eigenkapitalrenditeProzent != null ? prozent(h.eigenkapitalrenditeProzent, 1) : T.nichtBestimmbar,
        unter: h.faktorJeEuro != null ? T.ausEinemEuro(dez(h.faktorJeEuro, 2)) : T.ohneEigenkapital,
      })),
      fuss: T.vermoegenFuss(prozent(annahmen.wertsteigerungProzent, 1), eur0(horizonte[0].eigenkapitaleinsatz)),
    } : undefined;

    const karten: NonNullable<DruckDaten["finanzen"]>["karten"] = [];
    if (stx.sanierungsanteil > 0) {
      karten.push({
        titel: T.sanierungTitel,
        text: T.sanierungText(stx.sanierungAbJahr > annahmen.startjahr ? T.wirksamAb(stx.sanierungAbJahr) : T.wirksamErstesJahr),
        zeilen: [
          { label: T.anteilMassnahme, wert: eur0(stx.sanierungsanteil) },
          annahmen.instandhaltungsart === "erhaltungsaufwand"
            ? { label: T.einmaligeErsparnis, wert: `${ca}${eur0(stx.einmaligeSteuerersparnisSanierung)}`, fett: true }
            : annahmen.instandhaltungsart === "werkvertrag"
              ? { label: T.wirkung, wert: T.ueberAfa, fett: true }
              : { label: T.steuerlich, wert: T.nichtAngesetzt, fett: true },
        ],
      });
    }
    const h0 = ergebnis.vermoegensaufbau[0];
    if (h0) {
      karten.push({
        titel: T.jeEuroTitel,
        text: T.jeEuroText(h0.jahre),
        zeilen: [
          { label: T.aufgebautesVermoegen, wert: eur0(h0.vermoegen) },
          { label: T.eingesetztesEk, wert: eur0(h0.eigenkapitaleinsatz) },
          { label: T.ausEinemEuroLabel, wert: h0.faktorJeEuro != null ? `${ca}${en ? `€${dez(h0.faktorJeEuro, 2)}` : `${dez(h0.faktorJeEuro, 2)} €`}` : T.nichtBestimmbar, fett: true },
        ],
      });
    }

    finanzen = {
      vorspann: T.wirtschaftlichkeitVorspann,
      kaufTitel: T.kaufFinanzierung,
      kaufLinks,
      kaufRechts,
      kaufNotiz: T.nebenkostenNotiz({
        grest: prozent(nk.grunderwerbsteuerProzent, 1),
        notar: prozent(nk.notarGrundbuchProzent, 1),
        makler: nk.maklerProzent > 0 ? prozent(nk.maklerProzent, 2) : null,
        quelle: nk.quelle === "manuell" ? "manuell" : nk.quelle === "mittelwert" ? "mittelwert" : "land",
        rate: eur0(ergebnis.finanzierung.monatsrate),
        zins: prozent(ergebnis.finanzierung.zinsProzent, 2),
        tilgung: prozent(ergebnis.finanzierung.tilgungProzent, 2),
      }),
      hoehepunkte: [
        { label: T.gesamtinvestition, wert: eur0(k.gesamtinvestition) },
        { label: T.eigenkapitaleinsatz, wert: eur0(k.eigenkapitaleinsatz) },
        ergebnisZeile,
      ],
      annahmenTitel: T.annahmen,
      annahmen: { spalten: [{ titel: T.annahme, anteil: 44 }, { titel: T.wert, anteil: 38 }, { titel: T.herkunft, anteil: 18 }], zeilen: annahmenZeilen },
      annahmenNotizen: notizen,
      monatTitel: T.monatTitel(mo.kalenderjahr),
      einnahmenTitel: T.einnahmen,
      einnahmen,
      ausgabenTitel: T.ausgaben,
      ausgaben,
      ergebnis: ergebnisZeile,
      eigenanteil: mo.eigenanteil >= 0,
      vermoegen,
      vermoegenLeer: vermoegen ? undefined : T.keinVermoegensaufbau,
      karten,
    };
  }

  /* ── Verwaltung bis Kontakt ── */
  const v = inhalt.verwaltung;
  const person: Person = vertrieb ?? { name: "MOREImmo", rolle: T.kontaktRolleFallback, email: inhalt.kontakt.email, telefon: inhalt.kontakt.telefon };
  const rolle = en ? glossarEnglisch(person.rolle) ?? person.rolle : person.rolle;

  return {
    sprache,
    w: WOERTER[sprache],
    meta: {
      kennung: T.kennung,
      dokumentTitel: T.dokumentTitel(inhalt.kopf.titel),
      erstelltAm: datum(erstelltAm),
      preisstand: datum(preisstandAm),
      firmenzeile: COMPANY_LINE,
      kunde: kundeName || undefined,
      deckblattFuss: T.deckblattFuss(datum(preisstandAm), COMPANY_LINE),
      fussLinks: T.fussPreisstand(COMPANY_LINE, datum(preisstandAm)),
      fussModell: S.koepfe.wirtschaftlichkeit[1],
    },
    kopf: {
      eyebrow: inhalt.ansicht === "objekt" ? S.eyebrowObjekt : S.eyebrowEinheit,
      titel: kopftitel,
      kurz: inhalt.kopf.adresse.split(",")[0] || kopftitel,
      ortszeile,
      einheit: inhalt.kopf.weNr || inhalt.kopf.titel,
      ort: inhalt.kopf.ort,
      koordinaten: koordinatenText(umgebung?.genauigkeit === "adresse" || umgebung?.genauigkeit === "strasse" ? umgebung.zentrum : inhalt.mikrolage.koordinaten, sprache),
    },
    fotos: bilder.fotos,
    logo: bilder.logo ?? null,
    logoHell: bilder.logoHell ?? null,
    kennzahlen: inhalt.start.kennzahlen.map((k) => ({ label: k.label, wert: k.wert, unter: k.unter })),
    ortFakten,
    chips: inhalt.start.chips,
    beschreibung: inhalt.beschreibung ? { text: inhalt.beschreibung, hinweis: inhalt.nurDeutsch.beschreibung ? NUR_DEUTSCH_HINWEIS : undefined } : undefined,
    abschnitte,
    standort,
    mikrolage,
    objektdaten,
    grundriss,
    finanzen,
    verwaltung: {
      titel: v.name ? T.verwaltungTitel(v.name) : v.bezeichnung || T.verwaltungStandard,
      unter: [v.name ? v.bezeichnung : v.zusatz, v.art, verwaltungKostenText(v, sprache)].filter(Boolean).join(" · ") || undefined,
      leistungen: v.leistungen,
      ohneLeistungen: v.leistungen.length ? undefined : T.verwaltungOhneLeistungen,
      notiz: T.verwaltungNotiz,
      einblickeTitel: S.einblicke,
    },
    zeitplan: {
      erledigt: inhalt.naechsteSchritte.filter((s) => s.erledigt).map((s) => ({ titel: s.titel, text: s.text })),
      erledigtLabel: T.erledigt,
      stationen: inhalt.zeitplan.map((s) => ({ nr: s.nr, titel: s.titel, frist: s.frist || undefined, zahlung: !!s.zahlung, text: s.text || undefined })),
      notiz: T.zeitplanNotiz,
    },
    chancen: { vorspann: T.chancenVorspann, chance: T.chance, risiko: T.risiko, themen: inhalt.chancenRisiken.map((c) => ({ titel: c.titel, chance: c.chance, risiko: c.risiko })) },
    rechtliches: {
      entwurf: inhalt.rechtliches.entwurf ? { titel: T.entwurf, text: T.entwurfText } : undefined,
      hinweise: inhalt.rechtliches.hinweise,
      energieTitel: T.energiePflichtTitel,
      energie: inhalt.rechtliches.energieausweis.map((z) => ({ label: z.label, wert: z.wert })),
    },
    kontakt: {
      eyebrow: T.kontakt,
      satz: T.naechsterSchritt,
      text: T.kontaktText,
      personTitel: vertrieb ? T.ansprechpartnerVertrieb : T.kontaktMoreImmo,
      person: { name: person.name, rolle, initialen: initialen(person.name), zeilen: [person.email, person.telefon, person.buchungslink].filter((z): z is string => !!z?.trim()).map((z) => z.trim()), bild: bilder.person ?? null },
      firma: inhalt.kontakt.firma,
      erstellt: T.erstelltAm(datum(erstelltAm), kundeName, vertrieb?.name || ""),
    },
  };
}
