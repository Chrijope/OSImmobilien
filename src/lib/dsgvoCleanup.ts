import { supabase } from "@/integrations/supabase/client";

/**
 * DSGVO Storage Cleanup
 * Löscht alle nutzergebundenen Dateien eines Kontakts aus den
 * Storage-Buckets und schreibt einen Audit-Eintrag.
 *
 * Nur für Admin/Inhaber/Individuell – Edge-Function prüft selbst.
 */
export async function dsgvoStorageCleanup(
  kontaktId: string,
  grundReferenz?: string,
): Promise<{
  success: boolean;
  total_deleted?: number;
  buckets?: Record<string, { deleted: number; errors: number }>;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke("dsgvo-storage-cleanup", {
    body: { kontakt_id: kontaktId, grund_referenz: grundReferenz },
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return data as any;
}