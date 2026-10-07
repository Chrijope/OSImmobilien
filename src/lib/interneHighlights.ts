/**
 * Interne Highlights zu Objekt und Einheit, für die Vorbereitung des Vertriebs.
 *
 * NUR INTERN (Christian, 01.10.2026). Die Highlights stehen auf Objektseite
 * und Einheitenseite und nirgends sonst: nicht im Exposé, nicht in der
 * Kundenansicht, nicht im Kundenportal. Die KI-Punkte liegen unter
 * `meta.objekttexteKi.interneHighlights`, und die Positivlisten für Kunden
 * (`supabase/functions/_shared/expose-oeffentlich.ts`, `kunden-meta.ts`)
 * lassen aus `objekttexteKi` nur die Sanierungen hinaus. Bewacht in
 * `interneHighlights.test.ts`.
 *
 * ZWEI QUELLEN
 *
 * 1. Feste Werte aus den Objektdaten, hier im Browser gerechnet und damit
 *    immer aktuell: Erhaltungsaufwand (`objekte.erhaltungsaufwand`, Anteil der
 *    Einheit), AfA-Modell und Restnutzungsdauer, Mietgarantie, Lage im Haus,
 *    Miete, vereinbarte Mieterhöhung, Kaufpreis je m², Sanierungsjahr.
 * 2. Die KI-Punkte aus dem Lauf von `objekt-texte-ki` (seit Fassung 5), aus
 *    Objektangaben und Unterlagen, jeder mit Beleg.
 *
 * Ein fester Wert geht vor einem KI-Punkt derselben Art. Was nicht belegt
 * ist, erscheint nicht; eine Zeile „nicht vorhanden“ gibt es nicht.
 */

import { objektDetails } from "@/lib/investagonFelder";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { dez, eur0, eur2, kaltmieteVon, preisJeQm, prozent } from "@/lib/objektKennzahlen";
import { objektseiteFelder } from "@/lib/objektseiteDaten";
import { objektTexte, objektTexteStand } from "@/lib/objektTexteKi";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/** Höchstens so viele Punkte zeigt die Karte, die beiden hervorgehobenen mitgezählt. */
export const MAX_PUNKTE_KARTE = 10;

export interface HighlightZeile {
  text: string;
  /** Woher der Punkt stammt: feste Objektdaten oder KI aus Angaben und Unterlagen. */
  herkunft: "daten" | "ki";
  /** Nur bei KI-Punkten: die belegende Zeile oder Unterlage. */
  beleg?: string;
}

export interface InterneHighlights {
  erhaltungsaufwand?: HighlightZeile;
  restnutzungsdauer?: HighlightZeile;
  punkte: HighlightZeile[];
  /** „wird-erstellt“: Der KI-Lauf steht noch aus. „ohne-grundlage“: Es gibt nichts, woraus er schöpfen könnte. */
  stand: "fertig" | "wird-erstellt" | "ohne-grundlage";
}

type ObjektFuerHighlights = Pick<
  ObjektData,
  "id" | "meta" | "globalDaten" | "sanierungskosten" | "erhaltungsaufwandJahre" | "afaDaten" | "dokumente" | "wohnungen"
> & Partial<Pick<ObjektData, "titel" | "adresse" | "ort" | "beschreibung">>;

const RND_UNTERLAGE = /restnutzungsdauer|\brnd\b/i;

/** Der Erhaltungsaufwand am Objekt: die Spalte, sonst die Summe der gepflegten Sanierungen. */
function erhaltungsaufwandGesamt(objekt: ObjektFuerHighlights): number {
  if ((objekt.sanierungskosten || 0) > 0) return objekt.sanierungskosten || 0;
  return objektseiteFelder(objekt).sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
}

function erhaltungZeile(objekt: ObjektFuerHighlights, w?: ObjektWohnung): HighlightZeile | undefined {
  const gesamt = erhaltungsaufwandGesamt(objekt);
  const jahre = objekt.erhaltungsaufwandJahre || 1;
  const verteilt = jahre > 1 ? `, verteilt auf ${jahre} Jahre` : "";
  // Dieselbe Reihenfolge wie im Rechner: der Betrag der Einheit vor Kosten mal Anteil.
  const anteil = w
    ? (w.sanierungAnteilBetrag || 0) > 0
      ? w.sanierungAnteilBetrag || 0
      : gesamt > 0 && (w.sanierungAnteilProzent || 0) > 0 ? gesamt * (w.sanierungAnteilProzent || 0) / 100 : 0
    : 0;
  if (anteil > 0) {
    return { herkunft: "daten", text: `Erhaltungsaufwand: Anteil dieser Einheit ${eur0(anteil)}${gesamt > 0 ? ` von ${eur0(gesamt)} gesamt` : ""}${verteilt}` };
  }
  if (gesamt > 0) return { herkunft: "daten", text: `Erhaltungsaufwand: ${eur0(gesamt)} gesamt, Anteil je Einheit nach MEA${verteilt}` };
  return undefined;
}

function rndZeile(objekt: ObjektFuerHighlights, w?: ObjektWohnung): HighlightZeile | undefined {
  const afa = objekt.afaDaten;
  if (afa?.afaModell === "gutachten" && afa.restnutzungsdauer > 0) {
    return { herkunft: "daten", text: `Restnutzungsdauergutachten: ${dez(afa.restnutzungsdauer, 0)} Jahre RND, AfA ${prozent(100 / afa.restnutzungsdauer)} p. a.` };
  }
  const unterlage = [...(objekt.dokumente || []), ...(w?.dokumente || [])].find((d) => RND_UNTERLAGE.test(d.name || ""));
  const linear = linearerAfaSatz(objekt.globalDaten?.baujahr || null).satz;
  const erhoeht = !!afa && afa.afaSatz > linear;
  if (erhoeht && afa) {
    return {
      herkunft: "daten",
      text: `AfA-Satz ${prozent(afa.afaSatz)} laut Objektdaten (gesetzlich linear ${prozent(linear)}), entspricht rund ${dez(Math.round(100 / afa.afaSatz), 0)} Jahren Restnutzungsdauer${unterlage ? ", Gutachten in den Unterlagen" : ""}`,
    };
  }
  if (unterlage) return { herkunft: "daten", text: `Restnutzungsdauergutachten liegt in den Unterlagen („${unterlage.name}“)` };
  return undefined;
}

/** Feste Punkte zum ganzen Objekt, ohne Erhaltungsaufwand und RND. */
function objektPunkte(objekt: ObjektFuerHighlights): string[] {
  const punkte: string[] = [];
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const erstvermietung = Number(meta.garantierteErstvermietungKalt) || 0;
  if (erstvermietung > 0) punkte.push(`Garantierte Erstvermietung ${eur0(erstvermietung)} kalt laut Objektdaten`);
  const einheiten = objekt.wohnungen || [];
  const mitGarantie = einheiten.filter((w) => (w.mietgarantieMonate || 0) > 0 || (w.mietgarantieKalt || 0) > 0);
  if (mitGarantie.length > 0) {
    const monate = Math.max(...mitGarantie.map((w) => w.mietgarantieMonate || 0));
    punkte.push(`Mietgarantie bei ${mitGarantie.length} von ${einheiten.length} Einheiten${monate > 0 ? `, bis zu ${monate} Monate` : ""}`);
  }
  const heute = new Date().toISOString().slice(0, 10);
  const erhoehung = einheiten.filter((w) => (w.neueMiete || 0) > 0 && !!w.mieterhoehungAb && w.mieterhoehungAb > heute);
  if (erhoehung.length > 0) punkte.push(`Mieterhöhung vereinbart bei ${erhoehung.length} ${erhoehung.length === 1 ? "Einheit" : "Einheiten"}`);
  return punkte;
}

function datum(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return m ? (m[3] ? `${m[3]}.${m[2]}.${m[1]}` : `${m[2]}/${m[1]}`) : iso;
}

/** Feste Punkte zur Einheit: Lage im Haus, Miete und Potenzial, Preis je m², Garantie, Sanierung. */
function einheitPunkte(objekt: ObjektFuerHighlights, w: ObjektWohnung): string[] {
  const punkte: string[] = [];
  const balkon = objektDetails({ meta: { investagonRaw: w.investagonRaw } }).find((z) => z.label === "Balkon")?.wert;
  const lage = [
    w.etage ? `Etage ${w.etage}` : "",
    w.lage || "",
    balkon ? (balkon === "Ja" ? "Balkon" : balkon) : "",
  ].filter(Boolean);
  const flaeche = [w.groesse > 0 ? `${dez(w.groesse, 1)} m²` : "", w.zimmer > 0 ? `${dez(w.zimmer, w.zimmer % 1 ? 1 : 0)} Zimmer` : ""].filter(Boolean);
  if (lage.length || flaeche.length) punkte.push(`Lage im Haus: ${[...lage, ...flaeche].join(", ")}`);

  const heute = new Date().toISOString().slice(0, 10);
  const miete = kaltmieteVon(w, heute);
  if (miete > 0) {
    const jeQm = w.groesse > 0 ? `, ${eur2(miete / w.groesse)} je m²` : "";
    punkte.push(`Kaltmiete ${eur0(miete)}${jeQm}${w.vermietet ? (w.vermietetSeit ? `, vermietet seit ${datum(w.vermietetSeit)}` : ", vermietet") : ""}`);
  }
  if ((w.neueMiete || 0) > 0 && w.mieterhoehungAb && w.mieterhoehungAb > heute) {
    punkte.push(`Mieterhöhung vereinbart: ${eur0(w.neueMiete || 0)} kalt ab ${datum(w.mieterhoehungAb)}`);
  }
  if ((w.mietgarantieKalt || 0) > 0 || (w.mietgarantieMonate || 0) > 0) {
    punkte.push(`Mietgarantie${(w.mietgarantieKalt || 0) > 0 ? ` ${eur0(w.mietgarantieKalt || 0)} kalt` : ""}${(w.mietgarantieMonate || 0) > 0 ? ` für ${w.mietgarantieMonate} Monate` : ""}`);
  }
  const qm = preisJeQm(w.vkGesamt, w.groesse);
  if (qm > 0) punkte.push(`Kaufpreis ${eur0(w.vkGesamt)}, ${eur0(qm)} je m²`);
  const baujahr = objekt.globalDaten?.baujahr || 0;
  if ((w.sanierungsjahr || 0) > baujahr) punkte.push(`Einheit saniert ${w.sanierungsjahr}`);
  return punkte;
}

/**
 * Die Highlights für Objektseite (ohne `wohnung`) oder Einheitenseite.
 *
 * Auf der Einheitenseite stehen die Punkte der Einheit vorne, danach die
 * KI-Punkte des Objekts. Höchstens `MAX_PUNKTE_KARTE` insgesamt.
 */
export function interneHighlights(objekt: ObjektFuerHighlights, wohnung?: ObjektWohnung): InterneHighlights {
  const ki = objektTexte(objekt);
  const kiPunkte = ki?.interneHighlights ?? [];
  const kiZeile = (art: string): HighlightZeile | undefined => {
    const h = kiPunkte.find((p) => p.art === art);
    return h ? { text: h.punkt, beleg: h.beleg, herkunft: "ki" } : undefined;
  };

  const erhaltungsaufwand = erhaltungZeile(objekt, wohnung) ?? kiZeile("erhaltungsaufwand");
  const restnutzungsdauer = rndZeile(objekt, wohnung) ?? kiZeile("restnutzungsdauer");
  const oben = [erhaltungsaufwand, restnutzungsdauer].filter(Boolean).length;

  const fest = (wohnung ? einheitPunkte(objekt, wohnung) : objektPunkte(objekt))
    .map((text): HighlightZeile => ({ text, herkunft: "daten" }));
  // Die KI-Punkte der beiden hervorgehobenen Arten stehen schon oben oder
  // werden von einem festen Wert ersetzt; doppelt zeigen hilft niemandem.
  const sonstige = kiPunkte
    .filter((p) => p.art === "sonstiges")
    .map((p): HighlightZeile => ({ text: p.punkt, beleg: p.beleg, herkunft: "ki" }));
  const punkte = [...fest, ...sonstige].slice(0, Math.max(0, MAX_PUNKTE_KARTE - oben));

  const stand = ki ? "fertig" : objektTexteStand(objekt) === "offen" ? "wird-erstellt" : "ohne-grundlage";
  return { ...(erhaltungsaufwand ? { erhaltungsaufwand } : {}), ...(restnutzungsdauer ? { restnutzungsdauer } : {}), punkte, stand };
}
