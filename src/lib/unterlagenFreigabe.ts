/**
 * Gemeinsame Regel, ob die vollständigen Bonitätsunterlagen eines Investments
 * freigeschaltet sind.
 *
 * Maßgeblich ist das Kundenprofil (CRM): Hat das Investment ein eigenes
 * boolesches Flag, gilt das Flag. Hat es keins, fällt JEDES Investment auf
 * die Kontakt-Ebene zurück, und dort zählt neben der ausdrücklichen
 * Freischaltung auch ein aktiviertes Kundenportal als frei.
 *
 * Das Kundenportal hatte vorher eine eigene, engere Kopie dieser Regel:
 * Der Rückfall galt nur für Investment Nummer 1, und die Portal-Aktivierung
 * zählte gar nicht. Jedes weitere Investment blieb dadurch im Portal dauerhaft
 * gesperrt, obwohl das CRM es längst als freigeschaltet behandelte.
 *
 * Bewusst ohne Importe, damit Portal-Seiten (die ohne dataCache arbeiten) und
 * der investmentsStore dieselbe Funktion nutzen können, ohne einen Importkreis
 * zu riskieren.
 */
/**
 * Ist die Selbstauskunft dieses Investments hinterlegt?
 *
 * Hinterlegt heisst: vollstaendig unterschrieben, als Papier-PDF hochgeladen
 * oder im Bonitaetscheck bereits als hochgeladen/freigegeben gefuehrt. Ein
 * blosser Ausfuellstand (saData) genuegt bewusst NICHT, sonst schaltet alles
 * frei, waehrend der Kunde noch tippt und sich die abgeleitete
 * Bankpruefungsliste noch aendert.
 */
export function istSaHinterlegtAusMeta(
  invMeta: Record<string, unknown> | null | undefined,
): boolean {
  const m = invMeta || {};
  if (m.saSigned === true) return true;
  if (typeof m.saPdf === "string" && m.saPdf) return true;
  const status = (m.docStatuses as Record<string, unknown> | undefined)?.["Selbstauskunft"];
  return status === "uploaded" || status === "approved";
}

export function istUnterlagenFreigeschaltetAusMeta(
  invMeta: Record<string, unknown> | null | undefined,
  kontaktMeta: Record<string, unknown> | null | undefined,
): boolean {
  // Hinterlegte Selbstauskunft schaltet ALLE Unterlagen frei, unabhaengig von
  // der Portal-Freischaltung und auch ueber eine alte ausdrueckliche
  // Investment-Sperre hinweg (Entscheidung Christian, 01.09.2026): Die
  // Bankpruefungsliste wird aus den SA-Antworten abgeleitet und ist ab der
  // hinterlegten SA erstmals korrekt.
  if (istSaHinterlegtAusMeta(invMeta)) return true;
  if (typeof invMeta?.unterlagenFreigeschaltet === "boolean") {
    return invMeta.unterlagenFreigeschaltet;
  }
  const km = kontaktMeta || {};
  if (km.unterlagenFreigeschaltet) return true;
  // Auto-Freischaltung, sobald das Kundenportal aktiviert ist. Gleiche Regel
  // wie getUnterlagenFreigeschalten im investmentsStore.
  if (km.portalFreigeschalten) return true;
  if (km.portalAktiviert) return true;
  return false;
}
