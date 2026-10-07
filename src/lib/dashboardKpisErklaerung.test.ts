/**
 * Waechter ueber den Erklaerungen der Dashboard-Kacheln.
 *
 * Anlass war eine Rueckfrage, die sich ohne Blick in den Quelltext nicht
 * beantworten liess: Das Dashboard zeigte sieben offene Reservierungen,
 * waehrend in der Pipelinestufe Reservierung nur drei standen. Die Zahl war
 * richtig, die Kachel zaehlt naemlich zwei Stufen zusammen. Nur wusste das
 * niemand, der nicht in `dashboardKpis.ts` sieht.
 *
 * Seitdem traegt jede dieser Kacheln eine Erklaerung, die die Stufen aufzaehlt.
 * Eine Erklaerung ist aber nur so lange etwas wert, wie sie stimmt. Wenn jemand
 * eine Stufe zur Rechnung hinzufuegt und den Text vergisst, steht auf dem
 * Dashboard wieder eine Zahl, die sich nicht nachrechnen laesst, und diesmal
 * mit einer Erklaerung, die das Gegenteil behauptet.
 *
 * Dieser Test vergleicht deshalb die Mengen im Rechenmodul mit dem, was die
 * Erklaerung aufzaehlt. Er prueft nicht die Formulierung, sondern nur, dass
 * keine Stufe fehlt und keine zu viel genannt wird.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const KPI_DATEI = resolve(__dirname, "dashboardKpis.ts");
const KOPF_DATEI = resolve(__dirname, "../components/dashboard/DashboardKopf.tsx");

/** Liest `const NAME = new Set([...])` und gibt die Stufen zurueck. */
function mengeAusQuelle(quelle: string, name: string): string[] {
  const treffer = quelle.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!treffer) throw new Error(`Menge ${name} nicht gefunden`);
  return [...treffer[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/**
 * Die Stufenkennungen heissen im Code anders als im Text der Erklaerung.
 * Diese Zuordnung ist die Bruecke, und sie ist bewusst hier und nicht im
 * Rechenmodul: Sie gehoert zur Pruefung, nicht zur Rechnung.
 */
const STUFE_ZU_WORT: Record<string, string> = {
  nicht_erreicht: "Nicht erreicht",
  erreicht: "Erreicht",
  follow_up: "Follow-Up",
  kontaktversuche: "Kontaktversuche",
  vermoegensaufbau: "Vermögensaufbau",
  erstgespraech_geplant: "Erstgespräch geplant",
  erstgespraech: "Erstgespräch",
  eg_noshow: "EG NoShow",
  beratungsgespraech: "Beratungsgespräch",
  bg_noshow: "BG NoShow",
  selbstauskunft: "Selbstauskunft",
  bonitaetsunterlagen: "Bonitätsunterlagen",
  objektauswahl: "Objektauswahl",
  follow_up_objekt: "Follow-Up Objekt",
  reservierung: "Reservierung",
  finanzierung: "Finanzierung",
};

describe("Erklaerungen der Dashboard-Kacheln", () => {
  const kpi = readFileSync(KPI_DATEI, "utf8");
  const kopf = readFileSync(KOPF_DATEI, "utf8");

  it("nennt bei 'In Bearbeitung' genau die Stufen, die auch gezaehlt werden", () => {
    const gezaehlt = mengeAusQuelle(kpi, "IN_BEARBEITUNG");
    // Der Erklaerungstext der Kachel, zusammengesetzt aus seinen Teilstuecken.
    const block = kopf.slice(kopf.indexOf('label: "In Bearbeitung"'));
    const text = block.slice(0, block.indexOf("},"));

    const fehlen = gezaehlt.filter((st) => !text.includes(STUFE_ZU_WORT[st] ?? st));
    expect(fehlen).toEqual([]);

    // Und die Zahl im Text muss zur Menge passen.
    expect(text).toContain(`${gezaehlt.length === 16 ? "sechzehn" : String(gezaehlt.length)}`);
  });

  it("sagt bei 'Offene Reservierungen', dass zwei Stufen zusammengezaehlt werden", () => {
    const gezaehlt = mengeAusQuelle(kpi, "OFFENE_RESERVIERUNG");
    expect(gezaehlt.sort()).toEqual(["finanzierung", "reservierung"]);

    const block = kopf.slice(kopf.indexOf('label: "Offene Reservierungen"'));
    const text = block.slice(0, block.indexOf("},"));
    // Beide Stufen muessen beim Namen genannt sein, sonst entsteht genau die
    // Rueckfrage wieder, wegen der es diese Erklaerung gibt.
    expect(text).toContain("Reservierung");
    expect(text).toContain("Finanzierung");
  });

  it("gibt den drei erklaerten Kacheln ueberhaupt eine Erklaerung", () => {
    for (const label of ["Umsatz beurkundet", "Offene Reservierungen", "In Bearbeitung"]) {
      const block = kopf.slice(kopf.indexOf(`label: "${label}"`));
      const text = block.slice(0, block.indexOf("},"));
      expect(text, `${label} ohne Erklaerung`).toContain("erklaerung:");
    }
  });
});
