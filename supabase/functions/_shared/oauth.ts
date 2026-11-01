/**
 * Anmeldung bei Google und Microsoft für Kalender und Postfach (01.11.2026).
 * Eingerichtet ist sie erst, wenn Client-ID und -Geheimnis als Secrets
 * hinterlegt sind; bis dahin zeigt die Oberfläche „noch nicht eingerichtet“.
 */

export interface Token { access_token: string; refresh_token?: string; expires_at?: number }

export type Anbieter = "google" | "microsoft";
export type Zweck = "kalender" | "mail";

export const OAUTH = {
  google: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: {
      kalender: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
      mail: "openid email https://mail.google.com/",
    },
    id: () => Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "",
    geheimnis: () => Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "",
  },
  microsoft: {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: {
      kalender: "offline_access openid email User.Read Calendars.ReadWrite",
      mail: "offline_access openid email https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
    },
    id: () => Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
    geheimnis: () => Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
  },
} as const;

export function oauthEingerichtet(art: Anbieter): boolean {
  return Boolean(OAUTH[art].id() && OAUTH[art].geheimnis());
}

export function oauthRueckweg(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/kalender-oauth`;
}

/** Tauscht Code oder Refresh-Token gegen ein Zugangstoken. */
export async function tokenHolen(art: Anbieter, felder: Record<string, string>): Promise<Token & { id_token?: string }> {
  const o = OAUTH[art];
  const r = await fetch(o.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: o.id(), client_secret: o.geheimnis(), ...felder }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Anmeldung bei ${art === "google" ? "Google" : "Microsoft"} abgelaufen. Bitte neu verbinden.`);
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? felder.refresh_token,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
    id_token: j.id_token,
  };
}

/** Die Adresse aus dem id_token (vom Anbieter direkt per TLS bekommen, deshalb ohne Signaturprüfung). */
export function adresseAusIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const teil = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const j = JSON.parse(atob(teil.padEnd(Math.ceil(teil.length / 4) * 4, "=")));
    return String(j.email || j.preferred_username || "").toLowerCase() || null;
  } catch {
    return null;
  }
}
