/**
 * Zentrale Single-Source-of-Truth für die Bonitätsdokumente.
 * Wird sowohl in der Oberfläche (Kundenprofil, Kundenportal) als auch in der
 * Auto-Advance-Logik (kontaktPipeline.ts) gelesen. Änderungen hier wirken
 * automatisch überall.
 *
 * Seit 15.09.2026 hängt die Liste an der Beschäftigungsart aus der
 * Selbstauskunft: Selbstständige haben keine Gehaltsnachweise, deshalb dürfen
 * diese Zeilen bei ihnen weder angezeigt noch verlangt werden.
 */

export interface BonitaetDoc {
  name: string;
  required: boolean;
}

/** Nachweise, die es nur bei einem Anstellungsverhältnis gibt. */
export const GEHALTSNACHWEIS_DOCS = [
  "Letzter Gehaltsnachweis",
  "Vorletzter Gehaltsnachweis",
  "Vorvorletzter Gehaltsnachweis",
  "Gehaltsnachweis Dezember Vorjahr",
] as const;

/** Nachweise, die jede Beschäftigungsart braucht. */
export const BASIS_BONITAET_DOCS = [
  "Selbstauskunft",
  "Personalausweis",
] as const;

export const OPTIONAL_BONITAET_DOCS = [
  "Schufa-Bonitätsauskunft",
] as const;

/**
 * Erkennt die Selbstständigkeit aus der Angabe der Selbstauskunft.
 * Die Selbstauskunft speichert "selbstaendig"; ältere und frei getippte
 * Schreibweisen werden mit erkannt.
 */
export function istSelbststaendig(beschaeftigungsart?: string | null): boolean {
  const art = (beschaeftigungsart || "").toLowerCase().trim();
  if (!art) return false;
  return art.startsWith("selbst") || art.startsWith("freiberuf");
}

/** Die Pflichtdokumente für diese Beschäftigungsart. */
export function pflichtBonitaetDocs(beschaeftigungsart?: string | null): string[] {
  const basis = [...BASIS_BONITAET_DOCS];
  if (istSelbststaendig(beschaeftigungsart)) return basis;
  return [...basis, ...GEHALTSNACHWEIS_DOCS];
}

/** Die vollständige Bonitätsliste (Pflicht plus freiwillig) für diese Beschäftigungsart. */
export function buildBonitaetDocs(beschaeftigungsart?: string | null): BonitaetDoc[] {
  return [
    ...pflichtBonitaetDocs(beschaeftigungsart).map((name) => ({ name, required: true })),
    ...OPTIONAL_BONITAET_DOCS.map((name) => ({ name, required: false })),
  ];
}

/**
 * Rückfall für Stellen ohne Selbstauskunft: die Liste eines Angestellten.
 * Neuer Code soll `pflichtBonitaetDocs`/`buildBonitaetDocs` mit der
 * Beschäftigungsart aufrufen.
 */
export const REQUIRED_BONITAET_DOCS = pflichtBonitaetDocs();

export const BONITAETSCHECK_DOCS: BonitaetDoc[] = buildBonitaetDocs();

/**
 * Die Bonitätsliste der zweiten Person. Sie enthält keine Selbstauskunft,
 * die gilt gemeinsam für beide Käufer.
 */
export function buildBonitaetDocsPerson2(beschaeftigungsart?: string | null): BonitaetDoc[] {
  const docs: BonitaetDoc[] = [{ name: "Personalausweis Person 2", required: true }];
  if (!istSelbststaendig(beschaeftigungsart)) {
    for (const name of GEHALTSNACHWEIS_DOCS) docs.push({ name: `${name} Person 2`, required: true });
  }
  docs.push({ name: "Schufa-Bonitätsauskunft Person 2", required: false });
  return docs;
}
