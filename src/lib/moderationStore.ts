import { supabase } from "@/integrations/supabase/client";

export interface Meldung {
  id: string;
  melder_id: string;
  typ: "chat_nachricht" | "profil";
  referenz_id: string;
  grund: string;
  beschreibung?: string;
  status: "offen" | "geprueft" | "abgelehnt";
  bearbeitet_von?: string;
  bearbeitet_am?: string;
  erstellt_am: string;
}

export interface ModerationsAktion {
  id: string;
  benutzer_id: string;
  aktion: "warnung" | "strike" | "sperre" | "freischaltung" | "nachricht";
  grund: string;
  meldung_id?: string;
  notizen?: string;
  erstellt_von: string;
  erstellt_am: string;
}

export async function createMeldung(data: {
  melder_id: string;
  typ: string;
  referenz_id: string;
  grund: string;
  beschreibung?: string;
}) {
  const { error } = await supabase.from("meldungen" as any).insert(data as any);
  if (error) throw error;
}

export async function getMeldungen(): Promise<Meldung[]> {
  const { data, error } = await supabase
    .from("meldungen" as any)
    .select("*")
    .order("erstellt_am", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as Meldung[];
}

export async function updateMeldungStatus(id: string, status: string, bearbeitet_von: string) {
  const { error } = await supabase
    .from("meldungen" as any)
    .update({ status, bearbeitet_von, bearbeitet_am: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function createModerationsAktion(data: {
  benutzer_id: string;
  aktion: string;
  grund: string;
  meldung_id?: string;
  notizen?: string;
  erstellt_von: string;
}) {
  const { error } = await supabase.from("moderations_aktionen" as any).insert(data as any);
  if (error) throw error;

  // If action is "sperre", update profile
  if (data.aktion === "sperre") {
    await supabase
      .from("profiles")
      .update({ gesperrt: true, gesperrt_grund: data.grund } as any)
      .eq("id", data.benutzer_id);
  }
  // If action is "freischaltung", unblock profile
  if (data.aktion === "freischaltung") {
    await supabase
      .from("profiles")
      .update({ gesperrt: false, gesperrt_grund: null } as any)
      .eq("id", data.benutzer_id);
  }
}

export async function getModerationsAktionen(benutzerId?: string): Promise<ModerationsAktion[]> {
  let query = supabase
    .from("moderations_aktionen" as any)
    .select("*")
    .order("erstellt_am", { ascending: false });
  if (benutzerId) query = query.eq("benutzer_id", benutzerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as ModerationsAktion[];
}

export async function getStrikeCount(benutzerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("moderations_aktionen" as any)
    .select("id")
    .eq("benutzer_id", benutzerId)
    .eq("aktion", "strike");
  if (error) return 0;
  return (data || []).length;
}
