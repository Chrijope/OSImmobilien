/**
 * Die Positivliste für `meta` an Objekt und Wohnung, wie sie Kunden sehen.
 *
 * Bis zum 28.09.2026 stand sie in `get-kundenansicht/antwort.ts`. Seitdem
 * nutzt auch der OS Lotse sie (Befund LOTSE-R7-002), deshalb liegt sie
 * hier, unverändert. Jedes erlaubte Objekt und jede Liste wird aus geprüften
 * Einzelfeldern neu aufgebaut: kein Beleg, keine Provision, kein Name, kein
 * unbekannter Unterschlüssel.
 *
 * Geprüft in `src/lib/kundenansichtAntwort.test.ts` und
 * `src/lib/lotseRegeln.test.ts`.
 */
import {
  oeffentlicheKoordinaten, oeffentlicheMarktargumente, oeffentlicheObjekttexteEn, oeffentlicheSanierungenKi,
  oeffentlicheStandortanalyse, texteAutomatisch,
} from "./expose-oeffentlich.ts";
import { mitHausgeldMonat } from "./einheit-hausgeld.ts";

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function textWert(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function zahlWert(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Nur Text, Zahl, Wahrheitswert oder leer. Alles andere gilt als nicht vorhanden. */
function istSchlicht(v: unknown): boolean {
  return v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

/** Die erlaubten schlichten Felder aus einer Quelle. */
export function schlichteFelder(quelle: Record<string, unknown> | undefined, erlaubt: readonly string[]): Record<string, unknown> {
  const ziel: Record<string, unknown> = {};
  if (!quelle) return ziel;
  for (const schluessel of erlaubt) {
    if (schluessel in quelle && istSchlicht(quelle[schluessel])) ziel[schluessel] = quelle[schluessel];
  }
  return ziel;
}

/** Schlichte Schlüssel aus `meta` an Objekt und Wohnung. */
const META_SCHLICHT = [
  "kurzbeschreibung", "gemeinschaftseigentum", "verwaltung", "objektart", "einzelwohnung", "stadtteil", "einheitenImHaus",
  "anlageklasse", "verwaltungsart", "verwaltungskostenWeg", "verwaltungskostenSev", "verwaltungskostenSonstige",
  "ruecklageWeg", "garantierteErstvermietungKalt", "kaufnebenkostenPct",
  "vermietungsStatus", "nebenkostenMonat", "mietgarantieKalt", "mietgarantieMonate",
  "hausgeldMonat", "hausgeldNichtUmlagefaehigEuro", "hausgeldNichtUmlagefaehigP",
  "ruecklageWohnung", "stellplatzPreis", "stellplatzMiete", "neueMiete", "mieterhoehungAb", "vermietetSeit",
  "sanierungsjahr", "sanierungAnteilProzent", "sanierungAnteilBetrag",
  "verwaltungWegMonat", "verwaltungSevMonat", "sevErstesJahrInklusive",
] as const;

/** Beim Globalobjekt an den Einheiten nur die Miete samt Erhöhung. */
const META_SCHLICHT_GLOBAL_EINHEIT = ["vermietungsStatus", "neueMiete", "mieterhoehungAb", "vermietetSeit", "stadtteil"] as const;

/** Die Musterrechnung am Objekt (`meta.kalkulation`, älter `meta.kalk`), Zahl für Zahl. */
const KALKULATION_FELDER = [
  "hausgeldMonat", "hausgeldNichtUmlagefaehigP", "hausgeldNichtUmlagefaehigEuro", "sevMonat",
  "mietausfallP", "instandhaltungProQm", "instandhaltungMode", "instandhaltungPctGebaeude",
] as const;

/**
 * Felder aus `investagonRaw`: die geprüfte Liste des Exposés ohne `files`
 * (Originaladressen bei Investagon), `active` und `statusName` (Verkaufsstand).
 */
const ROHDATEN_SCHLICHT = [
  "object_building_year", "object_renovation_year", "object_floor",
  "object_balcony", "object_apartment_type", "object_rooms", "object_size",
  "object_share_owner", "share_land", "transaction_tax_rate",
  "heating_type", "energy_certificate_type", "energy_efficiency_class",
  "property_kind", "property_usage", "rent_status", "rented_since",
] as const;

/** Die Rohdaten auf die geprüfte Liste zusammenstreichen. Freitexte und Merkmale nur als Text. */
export function kundenRohdaten(roh: unknown): Record<string, unknown> | undefined {
  const r = alsObjekt(roh);
  if (!r) return undefined;
  const ziel = schlichteFelder(r, ROHDATEN_SCHLICHT);
  if (Array.isArray(r.extras)) {
    const extras = r.extras
      .map((e) => {
        if (typeof e === "string") return e.trim() ? e : null;
        const x = alsObjekt(e);
        const wert = textWert(x?.value);
        if (!wert) return null;
        const gewicht = zahlWert(x?.weight);
        return gewicht === undefined ? { value: wert } : { value: wert, weight: gewicht };
      })
      .filter((e) => e !== null);
    if (extras.length) ziel.extras = extras;
  }
  if (Array.isArray(r.tags)) {
    const tags = r.tags.filter((t): t is string => typeof t === "string" && !!t.trim());
    if (tags.length) ziel.tags = tags;
  }
  return Object.keys(ziel).length ? ziel : undefined;
}

function textListe(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim());
}

/** `meta` auf das Erlaubte zusammenstreichen. `global` streicht an Einheiten des Globalobjekts alles außer der Miete. */
export function kundenMeta(meta: unknown, art: "objekt" | "wohnung" | "wohnung_global"): Record<string, unknown> {
  const m = alsObjekt(meta);
  if (!m) return {};
  if (art === "wohnung_global") return schlichteFelder(m, META_SCHLICHT_GLOBAL_EINHEIT);

  const ziel = schlichteFelder(m, META_SCHLICHT);

  const argumente = textListe(m.standortargumente);
  if (argumente.length) ziel.standortargumente = argumente;
  // Nur der Wortlaut, dieselbe Regel wie im Exposé. Der Beleg bleibt drin.
  const markt = oeffentlicheMarktargumente(m.marktargumente);
  if (markt) ziel.marktargumente = markt;

  const ea = alsObjekt(m.energieausweis);
  if (ea) {
    const energie = schlichteFelder(ea, ["art", "kennwert", "klasse", "energietraeger", "gueltigBis"]);
    if (Object.keys(energie).length) ziel.energieausweis = energie;
  }

  if (Array.isArray(m.sanierungen)) {
    // Nur Jahr, Maßnahme und Betrag. Ein Beleg aus den Unterlagen bleibt drin.
    const sanierungen = m.sanierungen
      .map((s) => {
        const r = alsObjekt(s);
        if (!r) return null;
        const eintrag = schlichteFelder(r, ["jahr", "massnahme", "betrag"]);
        return textWert(eintrag.jahr) || textWert(eintrag.massnahme) ? eintrag : null;
      })
      .filter((s) => s !== null);
    if (sanierungen.length) ziel.sanierungen = sanierungen;
  }

  if (Array.isArray(m.zeitplan)) {
    const zeitplan = m.zeitplan
      .map((s) => {
        const r = alsObjekt(s);
        const titel = textWert(r?.titel);
        return titel ? { titel, frist: textWert(r?.frist) } : null;
      })
      .filter((s) => s !== null);
    if (zeitplan.length) ziel.zeitplan = zeitplan;
  }

  const leistungen = textListe(m.verwaltungLeistungen);
  if (leistungen.length) ziel.verwaltungLeistungen = leistungen;

  for (const schluessel of ["kalkulation", "kalk"] as const) {
    const k = alsObjekt(m[schluessel]);
    if (!k) continue;
    const werte = schlichteFelder(k, KALKULATION_FELDER);
    if (Object.keys(werte).length) ziel[schluessel] = werte;
  }

  const roh = kundenRohdaten(m.investagonRaw);
  if (roh) ziel.investagonRaw = roh;
  const ki = oeffentlicheSanierungenKi(m.objekttexteKi);
  if (ki) ziel.objekttexteKi = ki;
  const analyse = oeffentlicheStandortanalyse(m.standortanalyse);
  if (analyse) ziel.standortanalyse = analyse;
  // Die gespeicherte Lage für die Karte, nur Zahlen und Quelle (wie im Kundenlink).
  const lage = oeffentlicheKoordinaten(m.koordinaten);
  if (lage) ziel.koordinaten = lage;
  const automatisch = texteAutomatisch(m);
  if (automatisch) ziel.texteAutomatisch = automatisch;
  // Die englische Fassung der Objekttexte (Plan Kundensprache, Entscheidung 12), nur der Wortlaut.
  const englisch = oeffentlicheObjekttexteEn(m.objekttexteKiEn);
  if (englisch) ziel.objekttexteKiEn = englisch;
  // Das Hausgeld gesamt der Einheit, notfalls aus Investagons Teilen gerechnet (einheit-hausgeld.ts).
  return art === "wohnung" ? mitHausgeldMonat(ziel, m) : ziel;
}
