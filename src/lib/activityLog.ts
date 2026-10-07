/**
 * Client-Helper für das zentrale Aktivitäts-Protokoll (activity_log).
 *
 * Die meisten Einträge entstehen automatisch über DB-Trigger (Kontakt-,
 * Follow-Up-, Aufgaben- und E-Mail-Änderungen). Dieser Helper deckt
 * Aktionen ab, die NICHT über eine reguläre DB-Änderung laufen –
 * z.B. "SA-Erinnerung manuell erneut versendet", "PDF exportiert",
 * "Beratungspräsentation geöffnet", "Kundenordner-ZIP erzeugt".
 *
 * Die DB-RLS-Policy erzwingt actor_id = auth.uid() (außer Admin/Inhaber).
 */
import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  // Kommunikation
  | "email_sent_manual" | "email_reminder_sent"
  | "sa_invitation_sent" | "sa_invitation_resent"
  | "reservierung_signatur_versendet"
  | "whatsapp_sent" | "sms_sent"
  // Dokumente
  | "document_uploaded" | "document_deleted" | "document_downloaded"
  | "kundenordner_zip_generated" | "pdf_exported"
  // Prozess
  | "sa_shared" | "sa_link_copied" | "reservierung_pdf_created"
  | "notar_termin_gesetzt" | "bonitaet_freigegeben"
  | "portal_invited" | "portal_locked" | "portal_unlocked"
  | "kontaktversuch_erfasst" | "lead_reassigned"
  // Sonstiges (Fallback)
  | "profile_viewed" | "custom";

export interface LogActivityInput {
  kontaktId: string;
  action: ActivityAction | string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

/**
 * Schreibt einen Eintrag ins zentrale Aktivitäts-Protokoll.
 * Non-blocking – Fehler werden geloggt, nie geworfen.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  if (!input.kontaktId) return;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? null;
    await (supabase as any).from("activity_log").insert({
      kontakt_id: input.kontaktId,
      actor_id: uid,
      action: input.action,
      entity_type: input.entityType || "kontakt",
      entity_id: input.entityId || null,
      meta: input.meta || {},
      changes: input.changes || {},
      source: "client",
    });
  } catch (err) {
    console.warn("logActivity failed:", err);
  }
}

/**
 * Menschenlesbare Kurz-Beschreibung eines activity_log-Eintrags für die UI.
 */
export function describeActivityAction(action: string, meta: Record<string, any> = {}, changes: Record<string, any> = {}): string {
  const fmt = (val: unknown) => (val === null || val === undefined || val === "" ? "—" : String(val));
  switch (action) {
    case "kontakt_created":  return `Kontakt angelegt${meta.name ? `: ${meta.name}` : ""}${meta.quelle ? ` (Quelle: ${meta.quelle})` : ""}`;
    case "kontakt_deleted":  return "Kontakt gelöscht";
    case "kontakt_updated":  {
      const keys = Object.keys(changes);
      if (keys.length === 0) return "Stammdaten aktualisiert";
      return `Stammdaten geändert: ${keys.map(k => `${k}: ${fmt(changes[k]?.old)} → ${fmt(changes[k]?.new)}`).join(" · ")}`;
    }
    case "kontakt_reassigned": return `Zuständigkeit geändert: ${fmt(changes.zustaendig_id?.old)} → ${fmt(changes.zustaendig_id?.new)}`;
    case "kontakt_archived":   return "Kontakt archiviert";
    case "kontakt_unarchived": return "Kontakt aus Archiv geholt";
    case "kontakt_trashed":    return "Kontakt in Papierkorb verschoben";
    case "kontakt_restored":   return "Kontakt aus Papierkorb wiederhergestellt";
    case "pipeline_changed":   return `Pipeline-Stufe: ${fmt(changes.pipelineStufe?.old)} → ${fmt(changes.pipelineStufe?.new)}`;

    case "followup_created":       return `Follow-Up angelegt: „${fmt(meta.titel)}" (${fmt(meta.typ)}, fällig ${fmt(meta.faellig_am)})`;
    case "followup_auto_created":  return `Follow-Up automatisch angelegt: „${fmt(meta.titel)}" (fällig ${fmt(meta.faellig_am)})`;
    case "followup_completed":     return `Follow-Up erledigt: „${fmt(meta.titel)}"`;
    case "followup_reopened":      return `Follow-Up wieder geöffnet: „${fmt(meta.titel)}"`;
    case "followup_rescheduled":   return `Follow-Up verschoben: „${fmt(meta.titel)}" (${fmt(changes.faellig_am?.old)} → ${fmt(changes.faellig_am?.new)})`;
    case "followup_deleted":       return `Follow-Up gelöscht: „${fmt(meta.titel)}"`;
    case "followup_status_changed": return `Follow-Up-Status: „${fmt(meta.titel)}" (${fmt(changes.status?.old)} → ${fmt(changes.status?.new)})`;

    case "aufgabe_created":        return `Aufgabe angelegt: „${fmt(meta.titel)}" (${fmt(meta.typ)}, ${fmt(meta.prioritaet)})`;
    case "aufgabe_completed":      return `Aufgabe erledigt: „${fmt(meta.titel)}"`;
    case "aufgabe_rescheduled":    return `Aufgabe verschoben: „${fmt(meta.titel)}"`;
    case "aufgabe_deleted":        return `Aufgabe gelöscht: „${fmt(meta.titel)}"`;
    case "aufgabe_status_changed": return `Aufgaben-Status: „${fmt(meta.titel)}" (${fmt(changes.status?.old)} → ${fmt(changes.status?.new)})`;

    case "email_sent":         return `E-Mail versendet: „${fmt(meta.betreff)}"`;
    case "email_received":     return `E-Mail empfangen: „${fmt(meta.betreff)}" von ${fmt(meta.absender)}`;
    case "email_draft_saved":  return `E-Mail-Entwurf gespeichert: „${fmt(meta.betreff)}"`;

    case "sa_invitation_sent":       return "Selbstauskunft-Einladung versendet";
    // Altbestand und echte Wiederholungen. Bis zum 22.09.2026 gab es nur
    // diesen Schluessel, er stand also auch unter jedem Erstversand.
    case "sa_invitation_resent":     return "Selbstauskunft-Einladung erneut versendet";
    case "sa_shared":                return "Selbstauskunft-Bearbeitung freigegeben";
    case "reservierung_signatur_versendet": return "Reservierungsvereinbarung zur Unterschrift versendet";
    // Altbestand: derselbe Vorgang, bis zum 22.09.2026 unter diesem Namen und
    // einmal je Kaeufer geschrieben. Ein PDF ist dabei nie entstanden.
    case "reservierung_pdf_created": return "Reservierungs-PDF erstellt";
    case "document_uploaded":        return `Dokument hochgeladen: ${fmt(meta.filename)}`;
    case "document_deleted":         return `Dokument gelöscht: ${fmt(meta.filename)}`;
    case "kundenordner_zip_generated": return "Kundenordner-ZIP erzeugt";
    case "portal_invited":           return `Kundenportal freigeschaltet – Einladung an ${fmt(meta.email)}`;
    case "portal_locked":            return "Kundenportal gesperrt";
    case "portal_unlocked":          return "Kundenportal entsperrt";
    case "lead_reaktiviert":         return `Neue Anfrage${meta.quelle ? ` über ${meta.quelle}` : ""}: Kontakt war archiviert oder verloren und ist wieder offen`;
    case "kontaktversuch_erfasst":   return `Kontaktversuch ${fmt(meta.versuch)}/${fmt(meta.maximum)} – ${fmt(meta.ergebnis)}`;

    default:
      if (Object.keys(changes).length > 0) {
        const keys = Object.keys(changes);
        return `${action}: ${keys.map(k => `${k}: ${fmt(changes[k]?.old)} → ${fmt(changes[k]?.new)}`).join(" · ")}`;
      }
      return action.split("_").join(" ");
  }
}

/** Sichtbare Kategorie für Filter/Icon-Wahl. */
export function categorizeActivityAction(action: string): "kommunikation" | "prozess" | "dokument" | "daten" | "system" {
  if (action.startsWith("email_") || action === "whatsapp_sent" || action === "sms_sent") return "kommunikation";
  if (action.startsWith("followup_") || action.startsWith("aufgabe_") || action === "pipeline_changed" || action.startsWith("sa_")) return "prozess";
  if (action === "reservierung_signatur_versendet") return "kommunikation";
  if (action.startsWith("document_") || action === "kundenordner_zip_generated" || action === "pdf_exported" || action === "reservierung_pdf_created") return "dokument";
  if (action.startsWith("kontakt_") && !["kontakt_archived", "kontakt_unarchived", "kontakt_trashed", "kontakt_restored"].includes(action)) return "daten";
  return "system";
}