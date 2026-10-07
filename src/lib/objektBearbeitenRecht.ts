/**
 * Darf die aktive Rolle dieses Objekt bearbeiten (Angaben, Bilder,
 * Reservierung aufheben)?
 *
 * Dieselbe Regel wie in der Datenbank seit 20260930120000
 * (`darf_objekt_schreiben`): Admin und Inhaber immer, die Rolle objektpartner
 * nur am eigenen Objekt (`erstellt_von`). Ohne diese Prüfung bot die
 * Oberfläche einem Objektpartner Knöpfe an fremden Objekten an, die die
 * Datenbank dann ablehnt. Ein ausgeblendeter Knopf ist dabei keine
 * Zugriffskontrolle, maßgeblich bleibt die Zeilensicherheit.
 */
export function darfObjektBearbeiten(
  rolle: string | null | undefined,
  objekt: { erstellt_von?: string | null } | null | undefined,
  nutzerId: string | null | undefined,
): boolean {
  if (rolle === "admin" || rolle === "inhaber") return true;
  if (rolle !== "objektpartner") return false;
  return !!nutzerId && !!objekt?.erstellt_von && objekt.erstellt_von === nutzerId;
}
