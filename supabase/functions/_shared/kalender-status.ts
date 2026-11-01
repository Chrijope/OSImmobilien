/**
 * Signierter Status für die Anmeldung bei Google und Microsoft (01.11.2026).
 *
 * Die alte Google-Anbindung schickte nur base64-JSON mit der Nutzerkennung.
 * Jeder konnte damit einen eigenen Google-Kalender an ein fremdes Konto
 * hängen. Jetzt: HMAC-SHA256 über Nutzer, Anbieter, Rücksprung-Herkunft,
 * Zufallswert und Ablaufzeit (10 Minuten).
 */
function schluessel(): string {
  return Deno.env.get("KALENDER_STATUS_SCHLUESSEL") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function b64url(daten: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(daten))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(schluessel()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

/** u Nutzer, a Anbieter, z Zweck, o Herkunft des CRM, n Zufall, t Ablauf. */
export interface Status { u: string; a: "google" | "microsoft"; z: "kalender" | "mail"; o: string; n: string; t: number }

export async function statusSignieren(s: Omit<Status, "n" | "t">): Promise<string> {
  const voll: Status = { ...s, n: crypto.randomUUID(), t: Date.now() + 10 * 60_000 };
  const inhalt = b64url(new TextEncoder().encode(JSON.stringify(voll)));
  return `${inhalt}.${await hmac(inhalt)}`;
}

export async function statusPruefen(roh: string | null): Promise<Status | null> {
  if (!roh || !schluessel()) return null;
  const [inhalt, sig] = roh.split(".");
  if (!inhalt || !sig || (await hmac(inhalt)) !== sig) return null;
  try {
    const s = JSON.parse(atob(inhalt.replace(/-/g, "+").replace(/_/g, "/"))) as Status;
    return s.t > Date.now() ? s : null;
  } catch {
    return null;
  }
}
