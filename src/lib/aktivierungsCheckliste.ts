/**
 * Default Checklisten + Karrierestufen-Mapping für die finale Aktivierung
 * eines Bewerbers nach bezahlter Rechnung.
 *
 * Onboarding-Checkliste = manuelle Schritte vor der Account-Freischaltung.
 * Academy-Pflichtmodule = pro Lizenz unterschiedliche Pflichtinhalte.
 */
import type { LizenzPaketId } from "./lizenzPakete";
import type { AktivierungsCheck } from "./bewerbungStore";

const make = (id: string, label: string): AktivierungsCheck => ({
  id, label, done: false, doneAt: "", doneBy: "",
});

/** Manuelle Onboarding-Schritte (für alle Pakete identisch) */
export const DEFAULT_ONBOARDING: AktivierungsCheck[] = [
  make("welcome-call", "Willkommens-Call durchgeführt"),
  make("plattform-tour", "Plattform-Tour absolviert"),
  make("stammdaten", "Stammdaten & Steuer-ID vollständig"),
  make("beraterprofil", "Beraterprofil befüllt (Foto, Bio, Slug)"),
  make("zugangsdaten", "Zugangsdaten getestet & 2FA aktiviert"),
];

/** Pflicht-Academy-Module je Grundgebühr-Paket (kumulativ) */
export const ACADEMY_PFLICHT: Record<LizenzPaketId, AktivierungsCheck[]> = {
  junior: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
  ],
  // Lead-Berater: identische Pflichtmodule wie das Vertriebspartner-Paket.
  lead_berater: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
  ],
  lead: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
    make("aca-steuern", "Steuern & AfA Basics"),
    make("aca-beratung", "Erweiterte Beratungs-Präsentation"),
  ],
  team_builder: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
    make("aca-steuern", "Steuern & AfA Basics"),
    make("aca-beratung", "Erweiterte Beratungs-Präsentation"),
    make("aca-recruiting", "Recruiting Vertriebspartner"),
    make("aca-coaching", "Team-Coaching & Übergabe"),
  ],
  enterprise: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
    make("aca-steuern", "Steuern & AfA Basics"),
    make("aca-beratung", "Erweiterte Beratungs-Präsentation"),
    make("aca-recruiting", "Recruiting Vertriebspartner"),
    make("aca-coaching", "Team-Coaching & Übergabe"),
    make("aca-whitelabel", "Whitelabel-Setup"),
    make("aca-strategie", "Strategie-Workshop"),
  ],
  partner_2: [
    make("aca-grundlagen", "Vertriebs-Grundlagen"),
    make("aca-dsgvo", "DSGVO & Compliance"),
    make("aca-selbstauskunft", "Selbstauskunft-Prozess"),
    make("aca-pipeline", "Pipeline & Lead-Handling"),
  ],
  tippgeber: [
    make("aca-tipp-portal", "Tippgeberportal-Kurzeinweisung"),
    make("aca-tipp-dsgvo", "DSGVO & Weitergabe von Kontakten"),
    make("aca-tipp-qualitaet", "Qualitätskriterien für Kontakte"),
  ],
};

/**
 * Mapping Lizenz → interne Karrierestufe (KARRIERE_STUFEN.id).
 * Neue Partner (Paket junior) starten einheitlich auf der 4-%-Stufe
 * "vertriebspartner"; die übrigen Zuordnungen bleiben für Bestandsbewerber
 * mit alten Paketen bestehen.
 */
export const PAKET_KARRIERE_MAP: Record<LizenzPaketId, "tippgeber" | "vertriebspartner" | "manager" | "vertriebsfirma"> = {
  junior: "vertriebspartner",
  lead_berater: "vertriebspartner",
  lead: "vertriebspartner",
  team_builder: "manager",
  enterprise: "vertriebsfirma",
  partner_2: "vertriebspartner",
  tippgeber: "tippgeber",
};

/** Alle Items abgehakt? */
export const allDone = (items: AktivierungsCheck[]): boolean =>
  items.length > 0 && items.every((i) => i.done);