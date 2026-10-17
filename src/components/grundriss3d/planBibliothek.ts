import { useEffect, useState } from "react";
import type { Aussehen, Dachflaeche, Grundriss3dPlan, HausPlan } from "./plan";

/*
 * Bibliothek nachgezeichneter Häuser (seit 17.10.2026).
 *
 * Für Objekte, deren Pläne wir aus den Unterlagen nachgezeichnet haben,
 * liegen Hülle und Einheitenpläne im Code. Erkannt wird das Objekt an der
 * Adresse, in jeder üblichen Schreibweise. So erscheint das 3D-Modell, ohne
 * dass Daten in der Datenbank stehen müssen. Ein im Editor gespeicherter
 * Plan geht immer vor. Die Daten laden erst, wenn ein 3D-Reiter offen ist.
 */

export interface BekanntesHaus {
  name: string;
  /** Hülle mit Einheiten darin (Barfusstraße) … */
  haus?: HausPlan;
  /** … oder ganze Etagenpläne aus CAD-Zeichnungen (Hauffstraße). */
  etagen?: Array<{ geschoss: number; titel: string; plan: Grundriss3dPlan }>;
  einheiten: Array<{ we: number; plan: Grundriss3dPlan }>;
  /** Fassade, Dach, Balkone nach Fotos und Ansichten. */
  aussehen?: Aussehen;
}

const EINTRAEGE: Array<{ muster: RegExp; laden: () => Promise<BekanntesHaus> }> = [
  {
    muster: /barfusstrasse9(?!\d)/,
    // Vorderhaus aus beispielBarfuss9, Seitenflügel und Quergebäude aus den übrigen Exposés; eigens gezeichnete gehen vor.
    laden: () => Promise.all([import("./beispielBarfuss9"), import("./beispielBarfuss9Weitere")]).then(([m, w]) => ({
      name: "Barfusstraße 9", haus: m.BARFUSS9_HAUS, aussehen: m.BARFUSS9_AUSSEHEN,
      einheiten: [...w.BARFUSS9_WEITERE, ...m.BARFUSS9_EINHEITEN.filter((e) => !w.BARFUSS9_WEITERE.some((x) => x.we === e.we))],
    })),
  },
  {
    // Studentenwohnheim, Häuser Nr. 9 und 10: Geschosse aus den Wohnungsplänen des Bauträgers zusammengesetzt (beispielCottbus.ts).
    muster: /jamlitzerstrasse(9|10)(?!\d)/,
    laden: () => import("./beispielCottbus").then((m) => ({ name: m.COTTBUS.name, etagen: m.COTTBUS.etagen, einheiten: m.COTTBUS.einheiten, aussehen: m.COTTBUS.aussehen })),
  },
  {
    // Aufteilungspläne (Vektor) EG, 1. OG, DG; Wohnungen nach Teilungserklärung (beispielBrueck.ts).
    muster: /marktstrasse6(?!\d)/,
    laden: () => import("./beispielBrueck").then((m) => ({ name: m.BRUECK.name, etagen: m.BRUECK.etagen, einheiten: [], aussehen: m.BRUECK.aussehen })),
  },
  {
    // Waldsiedlung Wünsdorf: Mustergrundrisse der Haustypen (beispielZossen.ts). Je Haus eine Einheit.
    muster: /agnesstrasse(29|30)(?!\d)/,
    laden: () => import("./beispielZossen").then((m) => ({ name: m.ZOSSEN_DHH2.name, etagen: m.ZOSSEN_DHH2.etagen, einheiten: [], aussehen: m.ZOSSEN_DHH2.aussehen })),
  },
  {
    muster: /luisenstrasse72(?!\d)/,
    laden: () => import("./beispielZossen").then((m) => ({ name: m.ZOSSEN_DHH1.name, etagen: m.ZOSSEN_DHH1.etagen, einheiten: [], aussehen: m.ZOSSEN_DHH1.aussehen })),
  },
  {
    // Werkpläne Studio LOES, automatisch aus den Vektordaten gelesen (daten/hauff38.json).
    muster: /hauffstrasse38(?!\d)/,
    // Dach eins zu eins aus Dachaufsicht, Schnitten und Ansichten (Blätter 06 bis 10, scripts/grundriss3d/hauff_dach.py).
    laden: () => Promise.all([import("./daten/hauff38.json"), import("./daten/hauff38-dach.json")]).then(([m, dach]) => {
      const d = m.default as unknown as { haus: { etagen: BekanntesHaus["etagen"] }; einheiten: BekanntesHaus["einheiten"] };
      const flaechen = (dach.default as unknown as { flaechen: Dachflaeche[] }).flaechen;
      // Heller Klinker nach Exposé-Fotos und Luftbild.
      return { name: "Hauffstraße 38", etagen: d.haus.etagen, einheiten: d.einheiten, aussehen: { fassade: "#c9c1b8", dach: { art: "flaechen" as const, flaechen } } };
    }),
  },
];

/** „Barfußstr. 9“, „Barfusstraße 9, 13349 Berlin“ → „barfusstrasse9 13349berlin“ */
export function adresseNormal(text: string): string {
  return text.toLowerCase()
    .replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/str\.?(?=\s*\d)/g, "strasse")
    // Trennzeichen fallen weg, nur zwischen zwei Zahlen bleibt eines: „9, 13349“ ist nicht „913349“.
    .replace(/[^a-z0-9]+/g, " ").replace(/ (?=[a-z])|(?<=[a-z]) /g, "").trim()
    // „Barfußstraße“ ergäbe sonst „barfussstrasse“, „Barfusstraße“ aber „barfusstrasse“.
    .replace(/s{3,}/g, "ss");
}

export function bekanntesHausFinden(objekt: { adresse?: string; titel?: string } | undefined) {
  if (!objekt) return undefined;
  const text = `${adresseNormal(objekt.adresse ?? "")}|${adresseNormal(objekt.titel ?? "")}`;
  return EINTRAEGE.find((e) => e.muster.test(text));
}

/** „WE 03“, „3“, „WE03 (Vorderhaus)“ → 3 */
export function weNummer(weNr: string | undefined): number | null {
  const m = /\d+/.exec(weNr ?? "");
  return m ? Number(m[0]) : null;
}

export function useBekanntesHaus(objekt: { adresse?: string; titel?: string } | undefined): BekanntesHaus | null {
  const eintrag = bekanntesHausFinden(objekt);
  const [haus, setHaus] = useState<BekanntesHaus | null>(null);
  useEffect(() => {
    let aktiv = true;
    setHaus(null);
    if (eintrag) void eintrag.laden().then((h) => { if (aktiv) setHaus(h); }).catch(() => undefined);
    return () => { aktiv = false; };
  }, [eintrag]);
  return haus;
}
