/**
 * Vereinbarung über eine Mietzuzahlung (Mietsubvention), Christian, 30.10.2026.
 *
 * Vorlage: „Vorlage Mietzuzahlung OS Mietpool Verwaltung (2026-10-23).docx“
 * im Drive. Der Käufer bekommt für höchstens 36 Monate ab Übergabe die
 * Differenz zwischen aktueller Grundmiete und Zielgrundmiete (€/m²):
 *
 *   [Ziel €/m² − aktuelle Miete €/m²] × m² × Monate,
 *
 * bis zur nächsten möglichen Mieterhöhung mit der aktuellen Miete, danach mit
 * der höchstens zulässigen Miete (aktuelle Miete plus Erhöhung in %). Dazu
 * die Garage: bezuschusst auf einen Betrag für eine Anzahl Monate.
 *
 * Alles hier ohne React. Das Formular hält Texte (deutsche Zahlen, ISO-Daten),
 * damit jede Eingabe vor dem Versand noch angepasst werden kann.
 */
import { zahlAus } from "./objektdatenFormular";

export interface MietzuzahlungDaten {
  kaeuferName: string;
  kaeuferAnschrift: string;
  weNr: string;
  /** Lage der Wohnung, etwa „3.OG re“. */
  lage: string;
  strasse: string;
  ort: string;
  garageNr: string;
  grundbuchVon: string;
  amtsgericht: string;
  blatt: string;
  flaeche: string;
  istMiete: string;
  garageIstMiete: string;
  zielQm: string;
  laufzeitMonate: string;
  uebergabe: string;
  letzteErhoehung: string;
  naechsteErhoehung: string;
  erhoehungProzent: string;
  garageZuschussAuf: string;
  garageMonate: string;
  bank: string;
  iban: string;
  ort1: string;
  datum1: string;
  ort2: string;
  datum2: string;
}

export const LEER: MietzuzahlungDaten = {
  kaeuferName: "", kaeuferAnschrift: "", weNr: "", lage: "", strasse: "", ort: "", garageNr: "",
  grundbuchVon: "", amtsgericht: "", blatt: "", flaeche: "", istMiete: "", garageIstMiete: "",
  zielQm: "", laufzeitMonate: "36", uebergabe: "", letzteErhoehung: "", naechsteErhoehung: "",
  erhoehungProzent: "", garageZuschussAuf: "", garageMonate: "", bank: "", iban: "",
  ort1: "", datum1: "", ort2: "", datum2: "",
};

/** Schlüssel des Entwurfs in `investments.meta`. */
export const ENTWURF_SCHLUESSEL = "mietzuzahlungEntwurf";

const cent = (n: number) => Math.round(n * 100) / 100;
const z = (s: string) => zahlAus(s) ?? 0;

/** ISO-Datum plus Monate; leer bleibt leer. */
export function plusMonate(iso: string, monate: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + monate, Number(m[3])));
  return d.toISOString().slice(0, 10);
}

/** Volle Monate von `von` bis `bis` (ISO). Negativ wird 0. */
export function monateZwischen(von: string, bis: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(von || "");
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bis || "");
  if (!a || !b) return 0;
  let n = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) n -= 1;
  return Math.max(0, n);
}

/** Der Tag davor, für „bis“-Angaben. */
function tagDavor(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1)).toISOString().slice(0, 10);
}

export interface MietzuzahlungRechnung {
  zielMiete: number;
  istQm: number;
  /** Ab hier gilt die erhöhte Miete; leer, wenn keine Erhöhung in die Laufzeit fällt. */
  naechsteErhoehung: string;
  ende: string;
  phase1: { von: string; bis: string; monate: number; differenz: number; betrag: number };
  phase2: { von: string; bis: string; monate: number; neueMiete: number; neueMieteQm: number; differenz: number; betrag: number } | null;
  garage: { monate: number; auf: number; ist: number; differenz: number; betrag: number } | null;
  gesamt: number;
}

/**
 * Die Rechnung der Vorlage. Die nächste Erhöhung: eingetragenes Datum, sonst
 * 15 Monate nach der letzten Erhöhung (Sperrfrist ein Jahr plus Zustimmungs-
 * frist, § 558 BGB). Liegt sie vor der Übergabe, gilt die erhöhte Miete ab
 * Übergabe; liegt sie nach dem Ende, gibt es keine zweite Phase.
 */
export function rechne(d: MietzuzahlungDaten): MietzuzahlungRechnung {
  const flaeche = z(d.flaeche);
  const ist = z(d.istMiete);
  const zielMiete = cent(z(d.zielQm) * flaeche);
  const laufzeit = Math.max(0, Math.round(z(d.laufzeitMonate) || 36));
  const ende = plusMonate(d.uebergabe, laufzeit);
  const naechste = d.naechsteErhoehung || (d.letzteErhoehung ? plusMonate(d.letzteErhoehung, 15) : "");
  const mitErhoehung = !!naechste && !!d.uebergabe && naechste < (ende || "9999") && z(d.erhoehungProzent) > 0;
  const m1 = !mitErhoehung ? laufzeit : naechste <= d.uebergabe ? 0 : Math.min(laufzeit, monateZwischen(d.uebergabe, naechste));
  const differenz1 = cent(Math.max(0, zielMiete - ist));
  const phase1 = { von: d.uebergabe, bis: mitErhoehung ? tagDavor(naechste) : tagDavor(ende), monate: m1, differenz: differenz1, betrag: cent(differenz1 * m1) };

  let phase2: MietzuzahlungRechnung["phase2"] = null;
  if (mitErhoehung) {
    const neueMiete = cent(ist * (1 + z(d.erhoehungProzent) / 100));
    const differenz = cent(Math.max(0, zielMiete - neueMiete));
    const monate = laufzeit - m1;
    phase2 = {
      von: naechste <= d.uebergabe ? d.uebergabe : naechste, bis: tagDavor(ende), monate,
      neueMiete, neueMieteQm: flaeche > 0 ? cent(neueMiete / flaeche) : 0, differenz, betrag: cent(differenz * monate),
    };
  }

  let garage: MietzuzahlungRechnung["garage"] = null;
  const auf = z(d.garageZuschussAuf);
  const gMonate = Math.round(z(d.garageMonate));
  if (d.garageNr.trim() && auf > 0 && gMonate > 0) {
    const istG = z(d.garageIstMiete);
    const differenz = cent(Math.max(0, auf - istG));
    garage = { monate: gMonate, auf, ist: istG, differenz, betrag: cent(differenz * gMonate) };
  }

  const gesamt = cent(phase1.betrag + (phase2?.betrag ?? 0) + (garage?.betrag ?? 0));
  return { zielMiete, istQm: flaeche > 0 ? cent(ist / flaeche) : 0, naechsteErhoehung: mitErhoehung ? naechste : "", ende, phase1, phase2, garage, gesamt };
}

// ─── Vorbelegung aus dem System ─────────────────────────────────────────

export interface MietzuzahlungQuellen {
  kunde?: { vorname?: string; nachname?: string; strasse?: string; plz?: string; ort?: string } | null;
  objekt?: { adresse?: string; plz?: string; ort?: string; meta?: Record<string, unknown> | null } | null;
  wohnung?: { weNr?: string; etage?: string; lage?: string; groesse?: number; mieteGesamt?: number } | null;
  /** `wohnungen.meta.listendaten.werte` */
  listenwerte?: Record<string, unknown> | null;
  garage?: { nr: string; istMiete: number | null } | null;
  uebergabe?: string;
}

const deZahl = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? String(cent(n)).replace(".", ",") : "");
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Alles, was das System schon weiß. Leer bleibt, was es nicht kennt (Bank, IBAN). */
export function vorbelegen(q: MietzuzahlungQuellen): MietzuzahlungDaten {
  const meta = (q.objekt?.meta ?? {}) as Record<string, any>;
  const mg = meta.mietgarantie ?? {};
  const kapp = Number(meta.mieterhoehung?.kappungsgrenze);
  const w = q.listenwerte ?? {};
  const prozentEinheit = typeof w.naechsteErhoehungProzent === "number" ? w.naechsteErhoehungProzent : null;
  const k = q.kunde ?? {};
  return {
    ...LEER,
    kaeuferName: [k.vorname, k.nachname].filter(Boolean).join(" ").trim(),
    kaeuferAnschrift: [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    weNr: txt(q.wohnung?.weNr).replace(/^WE\s*/i, ""),
    lage: [txt(q.wohnung?.etage), txt(q.wohnung?.lage)].filter(Boolean).join(" "),
    strasse: txt(q.objekt?.adresse),
    ort: [txt(q.objekt?.plz), txt(q.objekt?.ort)].filter(Boolean).join(" "),
    garageNr: q.garage?.nr ?? "",
    grundbuchVon: txt(meta.grundbuch?.von),
    amtsgericht: txt(meta.grundbuch?.amtsgericht),
    blatt: txt(w.grundbuchBlatt),
    flaeche: deZahl(q.wohnung?.groesse),
    istMiete: deZahl(q.wohnung?.mieteGesamt),
    garageIstMiete: deZahl(q.garage?.istMiete ?? 0),
    zielQm: deZahl(mg.zielQm),
    laufzeitMonate: deZahl(mg.laufzeitMonate) || "36",
    uebergabe: txt(q.uebergabe),
    letzteErhoehung: txt(w.letzteErhoehung),
    naechsteErhoehung: txt(w.naechsteErhoehungAb),
    // Die Prozentzahl der Einheit, sonst die Kappungsgrenze des Objekts, sonst 20 %.
    erhoehungProzent: deZahl(prozentEinheit ?? (Number.isFinite(kapp) && kapp > 0 ? kapp * 100 : 20)),
    garageZuschussAuf: q.garage ? deZahl(mg.garageAnrechnung) : "",
    garageMonate: q.garage ? deZahl(mg.garagenSubventionMonate) : "",
  };
}

/** Ein gespeicherter Entwurf geht vor; neue Felder kommen aus der Vorbelegung. */
export function entwurfErgaenzen(entwurf: Partial<MietzuzahlungDaten> | null | undefined, vorbelegt: MietzuzahlungDaten): MietzuzahlungDaten {
  if (!entwurf || typeof entwurf !== "object") return vorbelegt;
  const neu = { ...vorbelegt };
  for (const k of Object.keys(LEER) as (keyof MietzuzahlungDaten)[]) {
    if (typeof entwurf[k] === "string") neu[k] = entwurf[k] as string;
  }
  return neu;
}

// ─── Anzeige ────────────────────────────────────────────────────────────

export const euro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const datumDe = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

const EINER = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
  "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const ZEHNER = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];

function unterTausend(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = h ? `${EINER[h]}hundert` : "";
  if (r < 20) s += EINER[r];
  else s += `${r % 10 ? `${EINER[r % 10]}und` : ""}${ZEHNER[Math.floor(r / 10)]}`;
  return s;
}

/** Ganze Zahl in Worten, wie auf Verträgen: 12345 → „zwölftausenddreihundertfünfundvierzig“. */
export function zahlInWorten(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "null";
  const mio = Math.floor(n / 1_000_000);
  const tsd = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  let s = "";
  if (mio) s += mio === 1 ? "einemillion" : `${unterTausend(mio)}millionen`;
  if (tsd) s += `${unterTausend(tsd)}tausend`;
  // Am Ende heißt es „eins“: einhunderteins, aber einundzwanzig.
  if (rest) s += unterTausend(rest) + (rest % 100 === 1 ? "s" : "");
  return s;
}

/** Betrag in Worten: „zwölftausenddreihundertfünfundvierzig Euro und 67 Cent“. */
export function betragInWorten(betrag: number): string {
  const euroTeil = Math.floor(cent(betrag));
  const centTeil = Math.round((cent(betrag) - euroTeil) * 100);
  return `${zahlInWorten(euroTeil)} Euro${centTeil ? ` und ${centTeil} Cent` : ""}`;
}
