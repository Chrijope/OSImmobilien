/**
 * Mieterhöhungsplaner (Christian, 17.10.2026): Wann und wie hoch kann die
 * Miete einer Einheit nach § 558 BGB steigen?
 *
 * - Wirksam frühestens 15 Monate nach Mietbeginn bzw. letzter Erhöhung und
 *   frühestens zu Beginn des dritten Kalendermonats nach Zugang des
 *   Erhöhungsverlangens (§ 558 Abs. 1, § 558b Abs. 1). Angenommen wird ein
 *   Versand heute.
 * - Kappungsgrenze: höchstens 20 % (in Gebieten mit Verordnung 15 %, etwa
 *   Berlin) auf die Miete von vor drei Jahren (§ 558 Abs. 3).
 * - Obergrenze ortsübliche Vergleichsmiete (§ 558 Abs. 2), je Objekt als
 *   €/m² eingetragen; ohne Eintrag gilt nur die Kappungsgrenze.
 *
 * Ist die Kappungsgrenze durch eine Erhöhung der letzten drei Jahre schon
 * ausgeschöpft, rückt der Termin auf drei Jahre nach dieser Erhöhung. So
 * rechnet auch der Mietdifferenz-Abgleich der Hauffstraße. Modernisierungs-,
 * Index- und Staffelmieten bleiben außen vor; das ist eine Planung, keine
 * Rechtsberatung.
 */

export interface ErhoehungsRegel {
  /** Kappungsgrenze als Anteil, 0,2 = 20 %. */
  kappungsgrenze: number;
  /** Ortsübliche Vergleichsmiete in € je m²; null ohne Angabe. */
  vergleichsmieteQm: number | null;
}

export interface ErhoehungsEingabe {
  istMiete: number;
  flaeche: number;
  /** ISO-Datum. */
  mietbeginn: string;
  /** ISO-Datum der letzten Erhöhung, leer ohne. */
  letzteErhoehung: string;
  /** Miete vor der letzten Erhöhung; null, wenn unbekannt. */
  mieteVorErhoehung: number | null;
}

export interface ErhoehungsErgebnis {
  /** ISO-Datum, ab dem die Erhöhung wirksam werden kann. */
  ab: string;
  neueMiete: number;
  plus: number;
  begrenztDurch: "Kappungsgrenze" | "Vergleichsmiete";
  hinweis?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tag = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const plusMonate = (s: string, m: number) => { const d = tag(s); d.setUTCMonth(d.getUTCMonth() + m); return iso(d); };
/** Erster eines Monats, auf oder nach dem Datum. */
const monatsanfang = (s: string) => { const d = tag(s); if (d.getUTCDate() !== 1) { d.setUTCMonth(d.getUTCMonth() + 1, 1); } return iso(d); };
const cent = (n: number) => Math.round(n * 100) / 100;
/** Obergrenzen auf den Cent abrunden: Die Grenze darf nicht überschritten werden (so auch die Excel). */
const centAb = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
const gueltig = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s);

/** Kappungsgrenze nach Ort: Berlin 15 %, sonst 20 % (Brandenburger Verordnung prüfen). */
export function kappungsgrenzeVorgabe(bundesland: string | null): number {
  return bundesland === "berlin" ? 0.15 : 0.2;
}

export function naechsteErhoehung(e: ErhoehungsEingabe, regel: ErhoehungsRegel, heute: string): ErhoehungsErgebnis | null {
  if (!(e.istMiete > 0)) return null;
  // Versand heute: wirksam zum Beginn des dritten Kalendermonats danach.
  const fristen = [monatsanfang(plusMonate(`${heute.slice(0, 7)}-01`, 3))];
  if (gueltig(e.mietbeginn)) fristen.push(monatsanfang(plusMonate(e.mietbeginn, 15)));
  if (gueltig(e.letzteErhoehung)) fristen.push(monatsanfang(plusMonate(e.letzteErhoehung, 15)));
  let ab = fristen.sort().at(-1)!;
  let hinweis: string | undefined;

  // Miete von vor drei Jahren: vor einer Erhöhung im Dreijahresfenster die Miete davor.
  const imFenster = (datum: string) => gueltig(e.letzteErhoehung) && e.letzteErhoehung.slice(0, 10) > plusMonate(datum, -36);
  let basis = e.istMiete;
  if (imFenster(ab)) {
    if (e.mieteVorErhoehung !== null && e.mieteVorErhoehung > 0) basis = e.mieteVorErhoehung;
    else { basis = 0; hinweis = "Miete vor der letzten Erhöhung fehlt; gerechnet ab drei Jahren nach der Erhöhung."; }
  }
  // Kappungsgrenze ausgeschöpft: drei Jahre nach der letzten Erhöhung, dann von der heutigen Miete aus.
  if (basis * (1 + regel.kappungsgrenze) <= e.istMiete + 0.005) {
    ab = [ab, monatsanfang(plusMonate(e.letzteErhoehung, 36))].sort().at(-1)!;
    basis = e.istMiete;
  }
  const nachKappung = centAb(basis * (1 + regel.kappungsgrenze));
  const nachVergleich = regel.vergleichsmieteQm && e.flaeche > 0 ? centAb(regel.vergleichsmieteQm * e.flaeche) : null;
  const neueMiete = nachVergleich !== null ? Math.min(nachKappung, nachVergleich) : nachKappung;
  if (neueMiete <= e.istMiete + 0.005) {
    return { ab, neueMiete: e.istMiete, plus: 0, begrenztDurch: "Vergleichsmiete", hinweis: "Die Miete liegt schon auf Höhe der Vergleichsmiete." };
  }
  return {
    ab, neueMiete, plus: cent(neueMiete - e.istMiete),
    begrenztDurch: nachVergleich !== null && nachVergleich < nachKappung ? "Vergleichsmiete" : "Kappungsgrenze",
    hinweis,
  };
}

/** Die Regel eines Objekts aus `objekte.meta.mieterhoehung`; ohne Eintrag die Kappungsgrenze nach Ort. */
export function erhoehungsRegelAusMeta(meta: unknown, bundesland: string | null): ErhoehungsRegel {
  const m = (meta as { mieterhoehung?: { kappungsgrenze?: unknown; vergleichsmieteQm?: unknown } } | null)?.mieterhoehung;
  const k = Number(m?.kappungsgrenze);
  const v = Number(m?.vergleichsmieteQm);
  return {
    kappungsgrenze: Number.isFinite(k) && k > 0 && k <= 0.2 ? k : kappungsgrenzeVorgabe(bundesland),
    vergleichsmieteQm: Number.isFinite(v) && v > 0 ? v : null,
  };
}
