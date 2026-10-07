import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "provision_berechnet"
  | "provision_ausgezahlt"
  | "provision_satz_override"
  | "provision_lock_changed";

/**
 * Schreibt einen Eintrag ins audit_log (SECURITY DEFINER RPC).
 * Fehler werden geloggt, aber nie geworfen – Audit darf den Hauptflow nicht blocken.
 */
export async function logAudit(opts: {
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  vorher?: Record<string, unknown> | null;
  nachher?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit_event" as any, {
      _action: opts.action,
      _entity: opts.entity,
      _entity_id: opts.entityId ?? null,
      _vorher: (opts.vorher ?? null) as any,
      _nachher: (opts.nachher ?? null) as any,
      _meta: (opts.meta ?? {}) as any,
    });
    if (error) console.warn("[auditLog] insert failed:", error.message);
  } catch (err) {
    console.warn("[auditLog] exception:", err);
  }
}