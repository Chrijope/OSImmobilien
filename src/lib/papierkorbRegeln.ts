import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { darfEndgueltigLoeschen as darfEndgueltigLoeschenRollen } from "../../supabase/functions/_shared/endgueltigLoeschen";

type Rolle = Parameters<typeof isUrlAllowedForRole>[1];

/**
 * Wer den Papierkorb sieht, darf wiederherstellen.
 *
 * Bis zum 15.09.2026 hatte die Papierkorb-Seite eine eigene Rollenliste neben
 * der Freigabe der Seitenleiste. Beide liefen auseinander: Eine Rolle sah den
 * Menüpunkt, bekam aber kein Register „Gelöscht“, und ein Vertriebspartner
 * landete zuerst im Register „Verloren“, in dem kein „Wiederherstellen“
 * steht. Christians Regel ist einfacher: Der Menüpunkt entscheidet.
 */

/** Rollen, die alle gelöschten Kontakte sehen; alle anderen nur eigene. */
export const PAPIERKORB_ALLE_SEHEN: ReadonlyArray<string> = ["admin", "inhaber", "vertriebsleiter"];

/** Rollen, die den Papierkorb auch ohne Menüeintrag nutzen (nur eigene Kontakte). */
const PAPIERKORB_PARTNER: ReadonlyArray<string> = [
  "vertriebspartner", "setterin", "finanzierungspartner", "versicherungsexperte",
];

export function siehtAlleGeloeschten(role: string): boolean {
  return PAPIERKORB_ALLE_SEHEN.includes(role);
}

export function darfWiederherstellen(role: string): boolean {
  return (
    siehtAlleGeloeschten(role) ||
    PAPIERKORB_PARTNER.includes(role) ||
    isUrlAllowedForRole("/papierkorb", role as Rolle)
  );
}

/**
 * Endgültig löschen (DSGVO-Löschung) dürfen Admin, Inhaber und seit dem
 * 26.09.2026 die Vertriebsleitung. Dieselbe Liste prüft dsgvo-hard-delete.
 */
export function darfEndgueltigLoeschen(role: string): boolean {
  return darfEndgueltigLoeschenRollen([role]);
}

/** Das Register, das der Papierkorb beim Öffnen zeigt. */
export function startRegister(role: string): "geloescht" | "verloren" {
  return darfWiederherstellen(role) ? "geloescht" : "verloren";
}

/**
 * Wem ein wiederhergestellter Kontakt zugewiesen werden darf.
 *
 * Wer nur eigene Kontakte sieht, darf sie nur sich selbst zuweisen: Die
 * Datenbankregel für Vertriebspartner lässt eine Zeile nur durch, wenn sie
 * nach dem Schreiben noch ihm gehört. Eine Zuweisung an jemand anderen
 * scheiterte bisher mit einer rohen Fehlermeldung.
 */
export function zuweisbare<T extends { id: string }>(role: string, meId: string | null, kandidaten: T[]): T[] {
  if (siehtAlleGeloeschten(role)) return kandidaten;
  return kandidaten.filter((k) => k.id === meId);
}
