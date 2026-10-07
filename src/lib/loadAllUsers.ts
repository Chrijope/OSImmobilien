import { isTestAccount } from "@/lib/dbStoreHelper";
import { cacheGet } from "@/lib/dataCache";

export interface SystemUser {
  id: string;
  name: string;
  rolle?: string;
  rollen?: string[];
  /**
   * Anzeige-Variante aus profiles.rollen_variante ('lead_berater' oder leer).
   * Nur fuer den Anzeigenamen (rollenLabel), keine Rechtewirkung.
   */
  rollenVariante?: string;
  /**
   * Die vier persoenlichen Buchungslinks, je Gespraechsart einer.
   *
   * Erstgespraech und Beratung gab es schon, Objekt und Finanzierung sind am
   * 21.09.2026 dazugekommen. Sie liegen als eigene Spalten in `profiles`, so
   * wie die beiden ersten, und werden im Kundenprofil unter "Meeting
   * erstellen" angeboten.
   */
  buchungslink?: string;
  beratungslink?: string;
  objektlink?: string;
  finanzierungslink?: string;
  /**
   * Kontaktdaten und Profilbild aus `profiles`.
   *
   * Warum sie hier stehen: Mehrere Aufrufer haben den Rueckgabewert auf
   * `{ email?: string }` gecastet und die Adresse gelesen. Die gab es nie,
   * weil sie hier nicht mitgegeben wurde. Der Cast sagte nichts, das Feld
   * blieb leer, und in der Mail stand die allgemeine Adresse statt der des
   * Beraters. Jetzt ist es ein echtes Feld.
   */
  email?: string;
  telefon?: string;
  /** Adresse des Profilbildes, so wie sie in `profiles.avatar_url` steht. */
  bildUrl?: string;
}

/**
 * Loads all system users (from nutzer list in test mode, from profiles in live mode).
 */
export function loadAllUsers(): SystemUser[] {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem("mi_nutzer");
      if (!raw) return [];
      const nutzer = JSON.parse(raw) as any[];
      return nutzer
        .filter((n: any) => n.status === "aktiv")
        .map((n: any) => {
          const rollen: string[] = Array.isArray(n.rollen)
            ? n.rollen.filter(Boolean)
            : (n.rolle ? [n.rolle] : []);
          return {
            id: n.id,
            name: `${n.vorname} ${n.nachname}`.trim(),
            rolle: rollen[0] || "",
            rollen,
            buchungslink: n.buchungslink || "",
            beratungslink: n.beratungslink || "",
            objektlink: n.objektlink || "",
            finanzierungslink: n.finanzierungslink || "",
            email: n.email || "",
            telefon: n.telefon || "",
            bildUrl: n.avatar_url || "",
          };
        });
    } catch {
      return [];
    }
  }
  const profiles = cacheGet("profiles");
  const userRoles = cacheGet("user_roles");
  // Build a map of user_id → all roles
  const rolesMap = new Map<string, string[]>();
  for (const r of userRoles) {
    const arr = rolesMap.get(r.user_id) || [];
    if (r.role && !arr.includes(r.role)) arr.push(r.role);
    rolesMap.set(r.user_id, arr);
  }
  return profiles.map((p: any) => {
    const rollen = rolesMap.get(p.id) || [];
    return {
      id: p.id,
      name: p.name,
      rolle: rollen[0] || "",
      rollen,
      // Defensiv gelesen: solange die Migration nicht gelaufen ist, fehlt die
      // Spalte einfach und die Variante bleibt leer.
      rollenVariante: p.rollen_variante || undefined,
      buchungslink: p.buchungslink || "",
      beratungslink: p.beratungslink || "",
      // Defensiv wie die Zeile darueber: Solange die Migration 20260921170000
      // nicht gelaufen ist, fehlen die Spalten schlicht und bleiben leer.
      objektlink: p.objektlink || "",
      finanzierungslink: p.finanzierungslink || "",
      email: p.email || "",
      telefon: p.telefon || "",
      bildUrl: p.avatar_url || "",
    };
  });
}

/**
 * Returns only users with roles Vertriebspartner or Vertriebsleiter (for Setter booking).
 */
export function loadBeraterUsers(): SystemUser[] {
  const all = loadAllUsers();
  // Strict: nur Nutzer mit zugewiesener Rolle "vertriebspartner"
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem("mi_nutzer");
      const nutzer = raw ? (JSON.parse(raw) as any[]) : [];
      const allowed = new Set(
        nutzer
          .filter((n: any) => {
            const rollen = Array.isArray(n.rollen) ? n.rollen : (n.rolle ? [n.rolle] : []);
            return rollen.map((r: string) => (r || "").toLowerCase()).includes("vertriebspartner");
          })
          .map((n: any) => n.id)
      );
      return all.filter(u => allowed.has(u.id));
    } catch {
      return all.filter(u => (u.rolle || "").toLowerCase() === "vertriebspartner");
    }
  }
  // In live mode, load user_roles to filter
  const userRoles = cacheGet("user_roles");
  const allowedIds = new Set(userRoles.filter((r: any) => r.role === "vertriebspartner").map((r: any) => r.user_id));
  return all.filter(u => allowedIds.has(u.id));
}

/**
 * Returns users with Vertriebspartner ODER Vertriebsleiter Rolle.
 * Wird in Admin-Filtern (Auswertungen, Abrechnungen, ...) verwendet, damit
 * Kunden, Inhaber, Finanzierungspartner etc. nicht in der Liste auftauchen.
 */
export function loadVertriebsUsers(): SystemUser[] {
  const all = loadAllUsers();
  const allowedRoles = new Set(["vertriebspartner", "vertriebsleiter"]);
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem("mi_nutzer");
      const nutzer = raw ? (JSON.parse(raw) as any[]) : [];
      const allowed = new Set(
        nutzer
          .filter((n: any) => {
            const rollen = Array.isArray(n.rollen) ? n.rollen : (n.rolle ? [n.rolle] : []);
            return rollen.map((r: string) => (r || "").toLowerCase()).some((r: string) => allowedRoles.has(r));
          })
          .map((n: any) => n.id),
      );
      return all.filter((u) => allowed.has(u.id));
    } catch {
      return all.filter((u) => allowedRoles.has((u.rolle || "").toLowerCase()));
    }
  }
  const userRoles = cacheGet("user_roles");
  const allowedIds = new Set(
    userRoles
      .filter((r: any) => allowedRoles.has((r.role || "").toLowerCase()))
      .map((r: any) => r.user_id),
  );
  return all.filter((u) => allowedIds.has(u.id));
}
