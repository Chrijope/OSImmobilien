import type { AmpelTon } from "@/lib/inaktivitaetsAmpel";

/**
 * Der Ampelpunkt in den Farben des Projekts.
 *
 * Eine Tabelle für beide Stellen im Kundenprofil: den Punkt hinter dem Namen
 * (`InactivityAmpel`) und den in der Kachel "Nächste Aktion"
 * (`KundenprofilKennzahlen`). Eigene Datei, damit die Kachel nur die Farben
 * lädt und nicht das ganze Bauteil samt Datenquellen.
 */
export const AMPEL_PUNKT_KLASSEN: Record<AmpelTon, string> = {
  rot: "bg-red-500",
  orange: "bg-orange-500",
  gruen: "bg-emerald-500",
  // Bewusst geparkt, nicht "alles gut" und nicht "liegen geblieben".
  blau: "bg-sky-500",
  grau: "bg-muted-foreground/40",
};
