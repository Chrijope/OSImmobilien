/**
 * Junior-Override-Logik (Welle 7).
 *
 * Team Lead & Lizenzpartner erhalten eine Provision auf jeden Abschluss
 * eines von ihnen geworbenen Junior Beraters. Die Override-Prozentpunkte
 * sind im jeweiligen Grundgebühr-Paket hinterlegt (`juniorOverride`).
 *
 *   Junior   → kein Override
 *   Lead     → kein Override
 *   Team B.  → +1.5 %
 *   Enterp.  → +2.0 %
 *
 * Die Recruiter-Beziehung wird im Bewerbungsmanagement gesetzt (Feld
 * `geworbenVonUserId` auf dem Bewerber) und beim Anlegen des Nutzers
 * via `merge_user_settings` in `user_settings.einstellungen` propagiert
 * (Schlüssel `geworben_von_user_id` + `lizenz_paket`).
 */
import { cacheGet } from "./dataCache";
import { getBewerber } from "./bewerbungStore";
import { getLizenzPaket, LIZENZ_PAKETE, OVERHEAD_AKTIV, type LizenzPaketId } from "./lizenzPakete";

export interface JuniorOverrideResult {
  recruiterUserId: string;
  recruiterName: string;
  recruiterPaket: LizenzPaketId;
  overridePercent: number;
  betrag: number;
}

/** Liest das Grundgebühr-Paket eines aktivierten Users aus user_settings */
export function getUserPaket(userId: string | null | undefined): LizenzPaketId | null {
  if (!userId) return null;
  const rows = cacheGet<any>("user_settings");
  const p = rows.find((r: any) => r.user_id === userId)?.einstellungen?.lizenz_paket;
  return (p && LIZENZ_PAKETE.some((x) => x.id === p)) ? (p as LizenzPaketId) : null;
}

/**
 * Recruiter/Teamleiter-Beziehung des Beraters.
 * Priorität:
 *  1) `user_settings.einstellungen.teamleader_id` (aus Nutzerverwaltung / Teampartner-Sidebar)
 *  2) `user_settings.einstellungen.geworben_von_user_id` (Bewerbungsmanagement)
 *  3) Fallback Bewerber-Tabelle `geworbenVonUserId`
 */
export function getRecruiterFor(beraterUserId: string): { id: string; name: string } | null {
  // 1) Teamleiter aus user_settings (primär — Nutzerverwaltung)
  const rows = cacheGet<any>("user_settings");
  const s = rows.find((r: any) => r.user_id === beraterUserId)?.einstellungen;
  if (s?.teamleader_id) {
    const profiles = cacheGet<any>("profiles");
    const p = profiles.find((x: any) => x.id === s.teamleader_id);
    return { id: s.teamleader_id, name: p?.name || "—" };
  }
  // 2) Recruiter aus user_settings (Bewerbungsmanagement)
  if (s?.geworben_von_user_id) {
    return { id: s.geworben_von_user_id, name: s.geworben_von_name || "—" };
  }
  // 3) Bewerber-Tabelle (Fallback, falls user_settings noch nicht aktualisiert wurde)
  const b = getBewerber().find((x) => x.userAccountId === beraterUserId);
  if (b?.geworbenVonUserId) {
    return { id: b.geworbenVonUserId, name: b.geworbenVonName || "—" };
  }
  return null;
}

/**
 * Berechnet den Junior-Override für einen einzelnen Deal.
 * @param beraterUserId  Der Abschluss-VP (Junior)
 * @param volumen        Volumen des Deals in EUR (Bemessungsgrundlage)
 */
export function calculateJuniorOverride(
  beraterUserId: string,
  volumen: number,
): JuniorOverrideResult | null {
  // Solange die Overhead-Provision abgeschaltet ist, gibt es keinen Override.
  if (!OVERHEAD_AKTIV) return null;
  if (!beraterUserId || !volumen || volumen <= 0) return null;

  // Nur Override, wenn der Abschluss-VP wirklich Junior-Lizenz hat
  const beraterPaket = getUserPaket(beraterUserId);
  if (beraterPaket !== "junior") return null;

  const recruiter = getRecruiterFor(beraterUserId);
  if (!recruiter) return null;

  const recruiterPaket = getUserPaket(recruiter.id);
  if (!recruiterPaket) return null;

  const paket = getLizenzPaket(recruiterPaket);
  const overridePercent = paket?.juniorOverride ?? 0;
  if (overridePercent <= 0) return null;

  return {
    recruiterUserId: recruiter.id,
    recruiterName: recruiter.name,
    recruiterPaket,
    overridePercent,
    betrag: Math.round(((volumen * overridePercent) / 100) * 100) / 100,
  };
}

/** Alle aktivierten Team Lead / Lizenzpartner Lizenznehmer (für Recruiter-Dropdown) */
export function getMoeglicheRecruiter(): Array<{ userId: string; name: string; paket: LizenzPaketId }> {
  const result: Array<{ userId: string; name: string; paket: LizenzPaketId }> = [];
  for (const b of getBewerber()) {
    if (!b.userAccountId) continue;
    if (b.paketwahl !== "team_builder" && b.paketwahl !== "enterprise") continue;
    result.push({
      userId: b.userAccountId,
      name: `${b.vorname} ${b.nachname}`,
      paket: b.paketwahl as LizenzPaketId,
    });
  }
  return result;
}

/**
 * Liefert alle Junior-Berater, die einem bestimmten Recruiter/Teamleiter
 * untergeordnet sind — vereint Teamleiter-Zuordnung (Nutzerverwaltung) und
 * Recruiter-Zuordnung (Bewerbungsmanagement).
 */
export function getJuniorsForRecruiter(recruiterUserId: string): Array<{ userId: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ userId: string; name: string }> = [];

  // 1) Über user_settings.teamleader_id (Nutzerverwaltung) und
  //    geworben_von_user_id (beim Aktivieren aus der Bewerbung gespiegelt).
  //    Seit dem 27.09.2026 sieht nur noch der Bewerberbereich (hr, admin,
  //    inhaber, backoffice) die Bewerbungen. Für Teamleiter bleibt Schritt 2
  //    deshalb leer, und der Werber muss hier aus user_settings kommen, genau
  //    wie in `public.team_zuordnung`.
  const settings = cacheGet<any>("user_settings");
  const profiles = cacheGet<any>("profiles");
  for (const s of settings) {
    const e = s?.einstellungen;
    if (e?.teamleader_id !== recruiterUserId && e?.geworben_von_user_id !== recruiterUserId) continue;
    if (seen.has(s.user_id)) continue;
    const p = profiles.find((x: any) => x.id === s.user_id);
    // Verwaiste user_settings ohne zugehöriges profile überspringen
    // (z. B. gelöschte oder Test-Accounts) — sonst erscheinen "—"-Zeilen.
    if (!p) continue;
    const name = (p.name && p.name.trim()) || (p.email && p.email.trim()) || "";
    if (!name) continue;
    out.push({ userId: s.user_id, name });
    seen.add(s.user_id);
  }

  // 2) Über Bewerbermanagement (geworben_von)
  for (const b of getBewerber()) {
    if (b.geworbenVonUserId !== recruiterUserId) continue;
    if (!b.userAccountId || seen.has(b.userAccountId)) continue;
    const name = `${b.vorname ?? ""} ${b.nachname ?? ""}`.trim();
    if (!name) continue;
    // Nur wenn der userAccount auch wirklich noch existiert
    const p = profiles.find((x: any) => x.id === b.userAccountId);
    if (!p) continue;
    out.push({ userId: b.userAccountId, name });
    seen.add(b.userAccountId);
  }

  return out;
}