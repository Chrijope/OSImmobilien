/**
 * Sperre der Unterlagenzeilen im Reiter Investments des Kundenprofils
 * (Bonitätscheck und Bankunterlagen).
 *
 * Die Zeilen jenseits der Grunddokumente (Selbstauskunft, Personalausweis,
 * letzter Gehaltsnachweis) tragen bis zur „Vollfreigabe" den Vermerk „Wird
 * nach Vollfreigabe freigeschaltet" und keinen Hochladen-Knopf. Die Freigabe
 * steuert, was der Kunde in seinem Portal hochladen darf. Bis zum 15.09.2026
 * galt dieselbe Sperre auch für die Mitarbeiter im CRM: Ein Vertriebspartner
 * konnte bei seinem eigenen Kunden keine Schufa und keine Bankunterlage
 * hochladen, solange das Kundenportal nicht freigeschaltet war. Der einzige
 * Weg zur Freigabe war „Portal freischalten", und der setzt eine E-Mail des
 * Kunden voraus und lädt ihn ein.
 *
 * Neue Regel: Wer die Unterlagen im CRM bearbeiten darf, wird von der
 * Portal-Sperre nicht aufgehalten. Die Datenbank lässt diese Rollen ohnehin
 * schreiben (Storage-Policy „Internal upload unterlagen", RPC
 * register_unterlage_upload, Update auf investments, alle über
 * is_internal_role). Die Sperre bleibt nur als Anzeige für Rollen, die hier
 * nichts hochladen sollen.
 */

/** Rollen, die im Kundenprofil Unterlagen hochladen und freigeben dürfen. */
export const UNTERLAGEN_HOCHLADEN_ROLLEN: ReadonlyArray<string> = [
  "admin", "inhaber", "vertriebsleiter", "backoffice", "vertriebspartner",
];

export function darfUnterlagenImCrmHochladen(role: string): boolean {
  return UNTERLAGEN_HOCHLADEN_ROLLEN.includes(role);
}

export interface UnterlagenSperreParameter {
  /** Rolle des angemeldeten Nutzers. */
  role: string;
  /** Vollfreigabe für dieses Investment (Portal oder hinterlegte Selbstauskunft). */
  unterlagenFreigeschaltet: boolean;
  /** Selbstauskunft, Personalausweis, letzter Gehaltsnachweis: nie gesperrt. */
  istBasisdokument: boolean;
  /** Nur-Lese-Ansicht (Finanzierung, Setterin): zeigt ohnehin keine Knöpfe. */
  nurLesend: boolean;
}

/**
 * Trägt die Zeile den Sperrvermerk statt des Hochladen-Knopfs?
 */
export function unterlagenZeileGesperrt(p: UnterlagenSperreParameter): boolean {
  if (p.nurLesend) return false;
  if (p.istBasisdokument) return false;
  if (p.unterlagenFreigeschaltet) return false;
  return !darfUnterlagenImCrmHochladen(p.role);
}
