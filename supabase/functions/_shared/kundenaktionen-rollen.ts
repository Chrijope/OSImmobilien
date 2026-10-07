/**
 * Wer auf Objekt- und Einheitenseite die Kundenaktionen hat: „Kundenlink
 * senden“, „Als Kunde ansehen“ und „Exposé anzeigen“.
 *
 * Christians Freigabe vom 05.10.2026 (das „Go“ aus der Entscheidung vom
 * 23.09.2026): Admin und Inhaber wie bisher, dazu Vertriebsleitung und
 * Vertriebspartner. Welche Kunden jemand dabei wählen darf, entscheidet nicht
 * diese Liste, sondern die Zugriffsregel auf den Kontakt
 * (`pruefeKontaktZugriff`, für Vertriebspartner `is_vp_owner_of_kontakt`).
 *
 * Eine eigene kleine Datei ohne Importe, weil Browser (Knöpfe nach aktiver
 * Rolle) und Functions (`send-kunden-expose`, `get-kundenansicht`, nach den
 * zugewiesenen Rollen aus `user_roles`) dieselbe Liste brauchen.
 */
export const KUNDENAKTIONEN_ROLLEN: readonly string[] = Object.freeze(["admin", "inhaber", "vertriebsleiter", "vertriebspartner"]);

/** Browser: hat die aktive Rolle die Kundenaktionen? */
export function darfKundenaktionen(rolle: string | null | undefined): boolean {
  return !!rolle && KUNDENAKTIONEN_ROLLEN.includes(rolle);
}

/**
 * Server: trägt jemand mit diesen Rollen die Kundenaktionen? Nimmt die rohe
 * Liste aus `user_roles`, nie etwas aus der Anfrage. Alles, was kein Text
 * ist, zählt nicht.
 */
export function hatKundenaktionsRolle(rollen: unknown): boolean {
  if (!Array.isArray(rollen)) return false;
  return rollen.some((rolle) => typeof rolle === "string" && KUNDENAKTIONEN_ROLLEN.includes(rolle.trim()));
}
