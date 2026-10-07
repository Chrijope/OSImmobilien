import { ROLES } from "@/types/user";

/**
 * Der Anzeigename einer Rolle an einer einzigen Stelle.
 *
 * Lead-Berater sind KEINE eigene Rolle: In der Datenbank tragen sie die Rolle
 * "vertriebspartner" und in `profiles.rollen_variante` den Wert
 * 'lead_berater'. Rechte, RLS und has_role bleiben identisch, nur der
 * Anzeigename (und die Weekly-Call-Zeit) unterscheiden sich.
 *
 * Wer irgendwo einen Rollennamen anzeigt, ruft diese Funktion auf und
 * vergleicht NIE gegen den Label-Text. Harte Vergleiche wie
 * `rolle === "Vertriebspartner"` brechen, sobald ein Nutzer als Lead-Berater
 * angezeigt wird.
 */

/** Wert der Spalte profiles.rollen_variante fuer Lead-Berater. */
export const ROLLEN_VARIANTE_LEAD_BERATER = "lead_berater";

/** Anzeigename der Variante. */
export const LEAD_BERATER_LABEL = "Lead-Berater";

/**
 * Anzeigename zu Rollen-Kennung und optionaler Anzeige-Variante.
 *
 * Basis-Labels kommen aus `ROLES` in `src/types/user.ts`, der kanonischen
 * Rollenliste. Unbekannte Kennungen werden lesbar gemacht statt leer zu
 * bleiben ("setterin" -> "Setterin").
 */
/**
 * Liest die Anzeige-Variante defensiv aus einer Profilzeile.
 *
 * Solange die Migration 20260901170000 nicht gelaufen ist, fehlt die Spalte
 * `rollen_variante` sowohl in der Datenbank als auch in den generierten
 * Supabase-Typen. Dieser Helfer kommt ohne `any` aus und liefert dann einfach
 * `undefined`.
 */
export function rollenVarianteVonProfil(profil: unknown): string | undefined {
  const wert = (profil as { rollen_variante?: unknown } | null | undefined)?.rollen_variante;
  return typeof wert === "string" && wert ? wert : undefined;
}

export function rollenLabel(rolle: string, rollenVariante?: string | null): string {
  if (rolle === "vertriebspartner" && rollenVariante === ROLLEN_VARIANTE_LEAD_BERATER) {
    return LEAD_BERATER_LABEL;
  }
  const eintrag = ROLES.find((r) => r.id === rolle);
  if (eintrag) return eintrag.label;
  if (!rolle) return "";
  return rolle.charAt(0).toUpperCase() + rolle.slice(1);
}
