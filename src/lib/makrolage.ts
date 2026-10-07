import { istGemessen } from "@/lib/standortanalyse";

/**
 * Die Makrolage neben der Karte, aus derselben gemessenen Standortanalyse wie
 * die Mikrolage (`meta.standortanalyse`, schema 2).
 *
 * Christian am 24.09.2026: Rechts neben der Karte sollen Mikro- und
 * Makrolage stehen, belegt und für jedes Objekt. Die Mikrolage (Einkaufen,
 * Freizeit, Bus und Bahn, Kitas, Schulen) stand dort schon. Für die Makrolage
 * misst `standort-messung.ts` seit der Messfassung 2 (23.09.2026 abends)
 * zusätzlich Hochschulen und Krankenhäuser im Umkreis von zehn Kilometern,
 * gezeigt wurden sie bisher nirgends.
 *
 * WAS BEWUSST NICHT HINEINKOMMT
 *
 *   - Gewerbe- und Industrieflächen: Die Messung kennt sie, aber benannte
 *     Flächen sind oft einzelne Betriebe. Im Exposé läse sich das wie eine
 *     Arbeitgeberliste, und die gibt es nur mit belegter Quelle.
 *   - Das gepflegte Regionswissen aus `lagetext.ts`: Es trägt keine Quelle.
 *   - Einwohner, Kaufkraft und Ähnliches: Dafür gibt es in der Messung keine
 *     Quelle. Belegte Marktzahlen stehen im Abschnitt Standort.
 *
 * Nur, was OpenStreetMap mit Namen und gemessener Entfernung kennt. Ohne
 * Messung gibt es `undefined`, die Seite zeigt dann nichts Erfundenes.
 */

export type MakrolageGruppeId = "hochschulen" | "kliniken";

export interface MakrolageEintrag {
  name: string;
  /** Etwa „Hochschule“ oder „Krankenhaus“. */
  art: string;
  /** Luftlinie in Metern, gemessen. */
  entfernungMeter: number;
}

export interface MakrolageGruppe {
  id: MakrolageGruppeId;
  titel: string;
  eintraege: MakrolageEintrag[];
}

export interface Makrolage {
  /** Nur Gruppen mit mindestens einem Ort. */
  gruppen: MakrolageGruppe[];
  /**
   * Wurden Hochschulen und Krankenhäuser überhaupt gemessen? Messungen vor
   * der Messfassung 2 kannten sie nicht. Dann heißt eine leere Liste „nicht
   * gemessen“ und nicht „keine vorhanden“.
   */
  gemessen: boolean;
}

/** Höchstens so viele Orte je Gruppe, die nächstgelegenen zuerst. */
export const MAKROLAGE_JE_GRUPPE = 3;

const GRUPPEN: Array<{ id: MakrolageGruppeId; titel: string; art: string }> = [
  { id: "hochschulen", titel: "Hochschulen", art: "Hochschule" },
  { id: "kliniken", titel: "Krankenhäuser", art: "Krankenhaus" },
];

/** Wenn gemessen wurde, aber OpenStreetMap im Umkreis nichts kennt. */
export const MAKROLAGE_LEER =
  "Hochschulen und Krankenhäuser sind im Umkreis in OpenStreetMap nicht erfasst. Das heißt nicht, dass es keine gibt.";

/** Wenn die Messung älter ist als die Makrolage. */
export const MAKROLAGE_NICHT_GEMESSEN =
  "Hochschulen und Krankenhäuser in der Region ergänzt die nächste Messung der Umgebung.";

const endlich = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Die Makrolage aus der gespeicherten Analyse. Gelesen wie Fremddaten: Ein
 * Ort ohne Namen oder ohne Entfernung fällt heraus.
 */
export function makrolageAusAnalyse(analyse: unknown): Makrolage | undefined {
  if (!istGemessen(analyse)) return undefined;
  const a = analyse as { messfassung?: unknown; mikrolage?: unknown };
  const mikro = (a.mikrolage && typeof a.mikrolage === "object" ? a.mikrolage : {}) as Record<string, unknown>;

  let vorhanden = false;
  const gruppen = GRUPPEN.map(({ id, titel, art }) => {
    const roh = Array.isArray(mikro[id]) ? (mikro[id] as unknown[]) : [];
    if (roh.length > 0) vorhanden = true;
    const eintraege: MakrolageEintrag[] = [];
    for (const r of roh) {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name || !endlich(o.entfernung_m) || o.entfernung_m < 0) continue;
      const typ = typeof o.typ === "string" && o.typ.trim() ? o.typ.trim() : art;
      eintraege.push({ name, art: typ, entfernungMeter: o.entfernung_m });
    }
    eintraege.sort((x, y) => x.entfernungMeter - y.entfernungMeter);
    return { id, titel, eintraege: eintraege.slice(0, MAKROLAGE_JE_GRUPPE) };
  }).filter((g) => g.eintraege.length > 0);

  const gemessen = vorhanden || (endlich(a.messfassung) && a.messfassung >= 2);
  return { gruppen, gemessen };
}
