import { geocode, type Koordinate } from "@/lib/umgebung";
import { getInvestmentMeta, setInvestmentMeta } from "@/lib/investmentsStore";

/**
 * Wo der Kunde wohnt, als Koordinate, für die Entfernung zu den Objekten.
 *
 * DATENSCHUTZ, DAS IST DER KERN DIESER DATEI
 *
 * Nach außen geht ausschließlich „PLZ Ort", etwa „83022 Rosenheim". Keine
 * Straße, keine Hausnummer, kein Name, keine Kennung. Damit ist die Anfrage
 * an Photon (photon.komoot.io, derselbe Dienst wie in `umgebung.ts`) eine
 * Frage nach einem Ort, nicht nach einer Person.
 *
 * Das Ergebnis wird grob am Investment gemerkt (`meta.wohnortGeo`, auf zwei
 * Nachkommastellen, also etwa einen Kilometer genau), damit nicht bei jedem
 * Aufruf neu gefragt wird. Neu gefragt wird nur, wenn sich die PLZ ändert.
 */

export interface Wohnort {
  plz: string;
  ort: string;
  quelle: "selbstauskunft" | "kontakt";
}

export interface WohnortGeo {
  plz: string;
  lat: number;
  lng: number;
}

/** Der Schlüssel am Investment. */
export const WOHNORT_GEO_SCHLUESSEL = "wohnortGeo";

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * PLZ und Ort: zuerst aus dem Kontakt, sonst aus der Selbstauskunft dieses
 * Investments. Ohne PLZ gibt es keinen Wohnort, auch wenn ein Ort dasteht;
 * ein Ortsname allein ist zu oft mehrdeutig.
 *
 * Der Kontakt ist maßgeblich, wie im Selbstauskunftsformular, das die
 * Adresse beim Öffnen immer aus dem Kontakt übernimmt. Die gespeicherte
 * Selbstauskunft ist dagegen ein Stand von damals: Wurde die Adresse danach
 * im Kontakt korrigiert, stand hier bis zum 27.09.2026 weiter die alte
 * (etwa eine Platzhalteradresse) und die Objektauswahl meldete „Wohnort
 * nicht gefunden“.
 */
export function wohnortAus(
  selbstauskunft: unknown,
  kontakt: { plz?: string | null; ort?: string | null } | null | undefined,
): Wohnort | null {
  const kPlz = text(kontakt?.plz);
  if (kPlz) return { plz: kPlz, ort: text(kontakt?.ort), quelle: "kontakt" };
  const sa = (selbstauskunft && typeof selbstauskunft === "object" ? selbstauskunft : {}) as Record<string, unknown>;
  const saPlz = text(sa.plz);
  if (saPlz) return { plz: saPlz, ort: text(sa.ort), quelle: "selbstauskunft" };
  return null;
}

/** Genau das, was an Photon geht: „PLZ Ort", sonst nichts. */
export function wohnortAnfrage(w: Pick<Wohnort, "plz" | "ort">): string {
  return [w.plz, w.ort].map((t) => t.trim()).filter(Boolean).join(" ");
}

/** Auf zwei Nachkommastellen, etwa einen Kilometer. Für Entfernungen reicht das. */
export function grob(k: Koordinate): Koordinate {
  return { lat: Math.round(k.lat * 100) / 100, lng: Math.round(k.lng * 100) / 100 };
}

/** Die gemerkte Koordinate, aber nur, wenn sie zur heutigen PLZ gehört. */
export function gemerkteWohnortGeo(gespeichert: unknown, plz: string): WohnortGeo | null {
  if (!gespeichert || typeof gespeichert !== "object") return null;
  const g = gespeichert as Record<string, unknown>;
  const lat = Number(g.lat);
  const lng = Number(g.lng);
  if (text(g.plz) !== plz.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { plz: plz.trim(), lat, lng };
}

/**
 * Nachschlagen über Photon, nur mit „PLZ Ort". `suche` ist austauschbar,
 * damit sich im Test prüfen lässt, was nach außen geht.
 */
export async function wohnortKoordinateErmitteln(
  wohnort: Pick<Wohnort, "plz" | "ort">,
  suche: (anfrage: string) => Promise<Koordinate> = geocode,
): Promise<WohnortGeo> {
  const anfrage = wohnortAnfrage(wohnort);
  if (!anfrage) throw new Error("Kein Wohnort");
  const k = grob(await suche(anfrage));
  return { plz: wohnort.plz.trim(), lat: k.lat, lng: k.lng };
}

/**
 * Wer das Ergebnis am Investment ablegen darf.
 *
 * Das Schreiben läuft über `merge_investment_meta`, und das lässt nur zu, wer
 * den Vorgang bearbeiten darf. Bei einer Rolle, die nur liest, käme sonst
 * nach dem stillen Nachschlagen die Meldung „Speichern fehlgeschlagen", ohne
 * dass jemand etwas gespeichert hätte. Sie rechnet deshalb nur im Browser mit
 * dem Ergebnis; Photon fragt sie ohnehin nur einmal, `geocode` merkt es sich.
 */
export const WOHNORT_MERKEN_ROLLEN = ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice"] as const;

export function darfWohnortMerken(rolle: string | undefined | null): boolean {
  return (WOHNORT_MERKEN_ROLLEN as readonly string[]).includes(rolle || "");
}

/** Die am Investment gemerkte Koordinate, falls sie zur PLZ passt. */
export function wohnortGeoAmInvestment(investmentId: string, plz: string): WohnortGeo | null {
  return gemerkteWohnortGeo(getInvestmentMeta<unknown>(investmentId, WOHNORT_GEO_SCHLUESSEL, null), plz);
}

/** Am Investment merken, über das Store-Modul und nur für Rollen, die schreiben dürfen. */
export function wohnortGeoMerken(investmentId: string, geo: WohnortGeo, rolle: string): boolean {
  if (!darfWohnortMerken(rolle)) return false;
  setInvestmentMeta(investmentId, WOHNORT_GEO_SCHLUESSEL, { plz: geo.plz, lat: geo.lat, lng: geo.lng });
  return true;
}
