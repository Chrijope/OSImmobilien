import { useEffect, useState } from "react";
import type { Grundriss3dPlan, HausPlan } from "./plan";

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
}

const EINTRAEGE: Array<{ muster: RegExp; laden: () => Promise<BekanntesHaus> }> = [
  {
    muster: /barfusstrasse9(?!\d)/,
    laden: () => import("./beispielBarfuss9").then((m) => ({ name: "Barfusstraße 9", haus: m.BARFUSS9_HAUS, einheiten: m.BARFUSS9_EINHEITEN })),
  },
  {
    // Waldsiedlung Wünsdorf: Mustergrundrisse der Haustypen (beispielZossen.ts). Je Haus eine Einheit.
    muster: /agnesstrasse(29|30)(?!\d)/,
    laden: () => import("./beispielZossen").then((m) => ({ name: m.ZOSSEN_DHH2.name, etagen: m.ZOSSEN_DHH2.etagen, einheiten: [] })),
  },
  {
    muster: /luisenstrasse72(?!\d)/,
    laden: () => import("./beispielZossen").then((m) => ({ name: m.ZOSSEN_DHH1.name, etagen: m.ZOSSEN_DHH1.etagen, einheiten: [] })),
  },
  {
    // Werkpläne Studio LOES, automatisch aus den Vektordaten gelesen (daten/hauff38.json).
    muster: /hauffstrasse38(?!\d)/,
    laden: () => import("./daten/hauff38.json").then((m) => {
      const d = m.default as unknown as { haus: { etagen: BekanntesHaus["etagen"] }; einheiten: BekanntesHaus["einheiten"] };
      return { name: "Hauffstraße 38", etagen: d.haus.etagen, einheiten: d.einheiten };
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
