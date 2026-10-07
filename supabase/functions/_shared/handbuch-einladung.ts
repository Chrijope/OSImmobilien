/**
 * Der persönliche Handbuch-Link aus der Willkommensmail (seit 30.09.2026).
 *
 * Reine Helfer ohne Datenbank, damit sie sich mit Vitest prüfen lassen
 * (src/lib/handbuch/handbuchEinladung.test.ts). Benutzt von
 * send-lead-zuweisung-mail (Link anlegen) und handbuch-einladung (lesen,
 * absenden).
 */
import { HANDBUCH_GUELTIG_TAGE, neuesHandbuchToken } from "./handbuch-funnel.ts";

export interface HandbuchEinladung {
  token: string;
  /** ISO-Zeitpunkt. */
  gueltigBis: string;
}

/** Ein neuer Link, so lange gültig wie das Handbuch selbst. */
export function neueEinladung(jetzt: number = Date.now()): HandbuchEinladung {
  return {
    token: neuesHandbuchToken(),
    gueltigBis: new Date(jetzt + HANDBUCH_GUELTIG_TAGE * 24 * 3600 * 1000).toISOString(),
  };
}

/** Steht ein Link am Kontakt, und läuft er noch? */
export function einladungGueltig(roh: unknown, jetzt: number = Date.now()): boolean {
  if (!roh || typeof roh !== "object") return false;
  const bis = Date.parse(String((roh as Record<string, unknown>).gueltigBis ?? ""));
  return Number.isFinite(bis) && bis > jetzt;
}

/**
 * „m•••@gmail.com“: Der Lead erkennt seine Adresse wieder, ein Dritter mit
 * einer weitergeleiteten Mail liest sie nicht vollständig. Ohne gültige
 * Adresse ein leerer Text.
 */
export function maskiereEmail(email: string): string {
  const e = (email || "").trim();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return "";
  return `${e[0]}•••${e.slice(at)}`;
}

/** Der Link in der Mail. Die Seite liegt bewusst außerhalb von /handbuch/:slug, siehe App.tsx. */
export function einladungsLink(basis: string, token: string, kampagne: string): string {
  return `${basis}/handbuch-einladung/${encodeURIComponent(token)}${kampagne ? `?${kampagne}` : ""}`;
}
