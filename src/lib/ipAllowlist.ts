import { supabase } from "@/integrations/supabase/client";

export type IpAllowlistConfig = {
  enabled: boolean;
  ips: string[]; // exakte IPv4/IPv6 oder Prefix mit '*' (z.B. "82.135.12.*")
  notes?: string;
};

const KEY = "security_ip_allowlist";
const CACHE_KEY = "mi_client_ip";
const CACHE_TTL = 5 * 60 * 1000;

export async function loadIpAllowlist(): Promise<IpAllowlistConfig> {
  const { data } = await supabase.from("app_config").select("wert").eq("schluessel", KEY).maybeSingle();
  const w = (data?.wert as any) || {};
  return { enabled: !!w.enabled, ips: Array.isArray(w.ips) ? w.ips : [], notes: w.notes || "" };
}

export async function saveIpAllowlist(cfg: IpAllowlistConfig): Promise<void> {
  const { error } = await supabase.from("app_config").upsert(
    { schluessel: KEY, wert: cfg as any, aktualisiert_am: new Date().toISOString() },
    { onConflict: "schluessel" }
  );
  if (error) throw error;
}

/**
 * Muss der Browser seine öffentliche IP überhaupt kennen? Nur, wenn die
 * Freigabeliste eingeschaltet ist und Einträge hat. Sonst lässt `isIpAllowed`
 * ohnehin jeden durch, und die Abfrage bei api.ipify.org entfällt ganz
 * (Datenschutz, Punkt 13 vom 27.09.2026).
 */
export function brauchtClientIp(cfg: IpAllowlistConfig): boolean {
  return cfg.enabled && Array.isArray(cfg.ips) && cfg.ips.some((p) => p.trim() !== "");
}

export async function fetchClientIp(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ip, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return ip;
    }
  } catch {}
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const ip = j?.ip || null;
    if (ip) try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ip, ts: Date.now() })); } catch {}
    return ip;
  } catch {
    return null;
  }
}

export function ipMatches(ip: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p === ip) return true;
  if (p.endsWith("*")) {
    const prefix = p.slice(0, -1);
    return ip.startsWith(prefix);
  }
  return false;
}

export function isIpAllowed(ip: string | null, cfg: IpAllowlistConfig): boolean {
  if (!cfg.enabled) return true;
  if (!cfg.ips || cfg.ips.length === 0) return true;
  if (!ip) return false;
  return cfg.ips.some((p) => ipMatches(ip, p));
}