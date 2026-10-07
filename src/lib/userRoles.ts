import { supabase } from "@/integrations/supabase/client";
import { ROLES, type UserRole } from "@/types/user";

const ROLE_PRIORITY = ROLES.map((role) => role.id);

export function resolveActiveRole(assignedRoles: UserRole[], preferredRole?: string | null): UserRole {
  const uniqueRoles = Array.from(new Set(assignedRoles)) as UserRole[];

  if (uniqueRoles.length === 0) {
    // WICHTIG: NIE still auf "kunde" defaulten – sonst landen frisch eingeladene
    // Nutzer (Race: user_roles noch nicht lesbar) fälschlicherweise im
    // Kundenportal eines beliebigen Bestandskunden. "individuell" ist ein
    // sicherer, sichtbarer Fallback (kein Kundenportal-Redirect).
    return "individuell";
  }

  if (preferredRole && uniqueRoles.includes(preferredRole as UserRole)) {
    return preferredRole as UserRole;
  }

  return ROLE_PRIORITY.find((role) => uniqueRoles.includes(role)) ?? uniqueRoles[0];
}

/** Ergebnis einer Rollenabfrage. Ein Fehler ist ausdruecklich kein leeres Ergebnis. */
export type RollenLadeErgebnis =
  | { status: "ok"; rollen: UserRole[] }
  | { status: "fehler"; fehler: unknown };

/** Warum ein Rollenwechsel nicht geklappt hat. */
export type RollenWechselErgebnis =
  | { status: "ok" }
  | {
      status: "fehler";
      grund: "nicht-angemeldet" | "rollen-nicht-lesbar" | "nicht-zugewiesen" | "speichern-fehlgeschlagen";
      nachricht: string;
    };

/**
 * Liest die zugewiesenen Rollen eines Nutzers aus `user_roles`.
 *
 * Wichtig: Schlaegt die Abfrage fehl, kommt `status: "fehler"` zurueck und
 * keine leere Liste. Vorher sah ein Netz- oder Rechtefehler genauso aus wie
 * "dieser Nutzer hat nur eine Rolle", der Rollenumschalter verschwand dann
 * stillschweigend und der Nutzer hielt es fuer einen Rechteverlust.
 *
 * Ein kurzer zweiter Versuch faengt die haeufigen Aussetzer ab (Safari
 * "Load failed", Token-Erneuerung direkt nach dem Anmelden).
 */
export async function ladeZugewieseneRollen(
  userId: string,
  optionen: { versuche?: number; wartenMs?: number } = {},
): Promise<RollenLadeErgebnis> {
  const versuche = Math.max(1, optionen.versuche ?? 2);
  const wartenMs = optionen.wartenMs ?? 400;
  let letzterFehler: unknown = new Error("Rollen konnten nicht gelesen werden.");

  for (let versuch = 0; versuch < versuche; versuch++) {
    if (versuch > 0 && wartenMs > 0) {
      await new Promise((fertig) => setTimeout(fertig, wartenMs * versuch));
    }
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) {
        letzterFehler = error;
        continue;
      }
      return {
        status: "ok",
        rollen: ((data ?? []) as Array<{ role: UserRole }>).map((eintrag) => eintrag.role),
      };
    } catch (fehler) {
      letzterFehler = fehler;
    }
  }

  return { status: "fehler", fehler: letzterFehler };
}

export async function upsertUserSettingsRole(userId: string, role: UserRole) {
  const settingsResponse: any = await supabase
    .from("user_settings" as any)
    .select("id, einstellungen")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsResponse.error) {
    throw settingsResponse.error;
  }

  const existing = settingsResponse.data as {
    id?: string;
    einstellungen?: Record<string, unknown> | null;
  } | null;

  const einstellungen: Record<string, unknown> = {};
  if (existing?.einstellungen && typeof existing.einstellungen === "object") {
    Object.assign(einstellungen, existing.einstellungen);
  }
  einstellungen.active_role = role;

  if (existing?.id) {
    const { error } = await supabase
      .from("user_settings" as any)
      .update({ einstellungen, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase.from("user_settings" as any).insert({
    user_id: userId,
    einstellungen,
  });

  if (error) {
    throw error;
  }
}
