/**
 * Die Texte der Berater-Mikroseite (`/vp/:slug`), zweiter Teil: der
 * Seitenrahmen (Kopf, „nicht gefunden“, Titel und Beschreibung für
 * Suchmaschinen), der schwebende Ansprechpartner und die Berufsbezeichnung
 * unter dem Namen. Die Abschnitte 11 bis 16 der alten Mikroseite sind mit dem
 * Umbau auf OS Real Estate (16.10.2026) entfallen.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6. Die Seite ermittelt ihre
 * Sprache selbst, siehe `src/lib/seitenSprache.ts`. Ohne Provider (CRM,
 * Tests) ist alles Deutsch, die deutschen Texte stehen hier unverändert.
 *
 * Englisch: britisch, freundliches „you“. Der Berater heißt nie „advisor“,
 * sondern „your contact person“ (Entscheidung 16). Namen, Orte und Marken
 * bleiben, wie sie sind.
 *
 * Keine Gedankenstriche, in keiner der beiden Sprachen.
 */
import { BERUF_IMMOBILIENBERATER, nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import type { Sprache } from "@/lib/seitenSprache";

const de = {
  rahmen: {
    laden: "Seite wird geladen",
    nichtGefundenTitel: "Vertriebspartner nicht gefunden",
    nichtGefundenText: "Diese Seite existiert nicht oder wurde deaktiviert.",
    nichtGefundenLink: "Weiter zu osimmobilien.netlify.app",
    seoTitel: (name: string) => `${name}: Vermögensaufbau mit Immobilien | OS Real Estate`,
    seoBeschreibung: (name: string) =>
      `Persönliche Beratung von ${name}: Kapitalanlage-Immobilien in Berlin und Umland, zum Steuern senken oder für die Altersvorsorge. Jetzt kostenloses Erstgespräch vereinbaren.`,
  },

  ansprechpartner: {
    /** Feste Bezeichnung, wenn der Partner keine eigene gepflegt hat. */
    rueckfallPosition: BERUF_IMMOBILIENBERATER,
  },

  schwebend: {
    kopf: "Dein persönlicher Ansprechpartner",
    schliessen: "Schließen",
    buchen: "Erstgespräch buchen",
    mehr: "Anfrage senden",
    knopf: "Dein Ansprechpartner",
  },
};

export type MikroseiteAbschlussTexte = typeof de;

const en: MikroseiteAbschlussTexte = {
  rahmen: {
    laden: "Loading page",
    nichtGefundenTitel: "Sales partner not found",
    nichtGefundenText: "This page does not exist or has been deactivated.",
    nichtGefundenLink: "Continue to osimmobilien.netlify.app",
    seoTitel: (name: string) => `${name}: Building wealth with property | OS Real Estate`,
    seoBeschreibung: (name: string) =>
      `A personal consultation with ${name}: investment property in Berlin and the surrounding region, to lower your tax or provide for retirement. Book your free initial consultation now.`,
  },

  ansprechpartner: {
    rueckfallPosition: "Sales partner",
  },

  schwebend: {
    kopf: "Your contact person at OS Real Estate",
    schliessen: "Close",
    buchen: "Book an initial call",
    mehr: "Send an enquiry",
    knopf: "Your contact person",
  },
};

export const MIKROSEITE_ABSCHLUSS_TEXTE = { de, en };

/**
 * Die Berufsbezeichnung unter dem Namen des Partners.
 *
 * Eine selbst gepflegte Bezeichnung aus der Datenbank bleibt, wie sie ist,
 * auch auf der englischen Seite. Nur der feste deutsche Rückfall
 * „Immobilienberater“ wird auf Englisch zu „Sales partner“, wie im Kopf der Seite, nie
 * „advisor“ (Entscheidung 16).
 *
 * Annahme: Die Seite setzt den Rückfall schon beim Laden ein
 * (`BeraterMicroseite.tsx`), danach ist er von einer gleichlautenden eigenen
 * Angabe nicht mehr zu unterscheiden. Beide werden deshalb gleich behandelt.
 */
export function positionFuerAnzeige(position: string | null | undefined, sprache: Sprache): string {
  const echt = nurEchteBezeichnung(position);
  if (!echt || echt === BERUF_IMMOBILIENBERATER) return MIKROSEITE_ABSCHLUSS_TEXTE[sprache].ansprechpartner.rueckfallPosition;
  return echt;
}
