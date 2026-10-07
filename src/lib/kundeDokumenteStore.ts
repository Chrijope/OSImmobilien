import { supabase } from "@/integrations/supabase/client";

export type DokumentTyp = "ordner" | "datei";

export interface KundeDokument {
  id: string;
  kontakt_id: string;
  investment_id: string | null;
  parent_id: string | null;
  typ: DokumentTyp;
  name: string;
  groesse_bytes: number | null;
  mime_type: string | null;
  storage_path: string | null;
  sort_order: number;
  erstellt_von: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

const db = supabase as any;
const BUCKET = "unterlagen";

export async function listKundeDokumente(kontaktId: string, investmentId: string | null): Promise<KundeDokument[]> {
  let q = db.from("kunde_dokumente").select("*").eq("kontakt_id", kontaktId);
  if (investmentId === null) q = q.is("investment_id", null);
  else q = q.eq("investment_id", investmentId);
  const { data, error } = await q.order("typ", { ascending: true }).order("name", { ascending: true });
  if (error) { console.error("listKundeDokumente:", error); return []; }
  return (data || []) as KundeDokument[];
}

/**
 * Wie viele Dateien liegen zu diesem Kontakt, und wie viele davon sind frisch?
 *
 * Für die Karte "Zugehörige Unterlagen" im Reiter Kommunikation. Es gibt an
 * den Dokumenten keinen Lesezustand, "neu" kann deshalb nicht heißen "noch
 * nicht angesehen". Gezählt wird stattdessen, was in den letzten sieben Tagen
 * dazugekommen ist. Die Karte schreibt genau das auch hin, damit die Zahl
 * nicht mehr verspricht, als sie weiß.
 *
 * Ordner zählen nicht mit, nur Dateien.
 */
export async function zaehleKundeDateien(
  kontaktId: string,
  tageFuerNeu = 7,
): Promise<{ gesamt: number; neu: number }> {
  const { data, error } = await db
    .from("kunde_dokumente")
    .select("erstellt_am")
    .eq("kontakt_id", kontaktId)
    .eq("typ", "datei");
  if (error) { console.error("zaehleKundeDateien:", error); return { gesamt: 0, neu: 0 }; }
  const zeilen = (data || []) as { erstellt_am: string }[];
  const grenze = Date.now() - tageFuerNeu * 24 * 60 * 60 * 1000;
  const neu = zeilen.filter((z) => new Date(z.erstellt_am).getTime() >= grenze).length;
  return { gesamt: zeilen.length, neu };
}

export async function createOrdner(params: {
  kontaktId: string; investmentId: string | null; parentId: string | null; name: string;
}): Promise<KundeDokument | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await db.from("kunde_dokumente").insert({
    kontakt_id: params.kontaktId,
    investment_id: params.investmentId,
    parent_id: params.parentId,
    typ: "ordner",
    name: params.name.trim() || "Neuer Ordner",
    erstellt_von: user?.id ?? null,
  }).select().single();
  if (error) { console.error("createOrdner:", error); return null; }
  return data as KundeDokument;
}

export async function uploadDatei(params: {
  kontaktId: string; investmentId: string | null; parentId: string | null; file: File;
}): Promise<KundeDokument | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const safeName = params.file.name.replace(/[^\w.\-]+/g, "_");
  const uuid = crypto.randomUUID();
  const path = `kunde-dokumente/${params.kontaktId}/${uuid}-${safeName}`;
  const up = await supabase.storage.from(BUCKET).upload(path, params.file, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) { console.error("upload:", up.error); return null; }
  const { data, error } = await db.from("kunde_dokumente").insert({
    kontakt_id: params.kontaktId,
    investment_id: params.investmentId,
    parent_id: params.parentId,
    typ: "datei",
    name: params.file.name,
    groesse_bytes: params.file.size,
    mime_type: params.file.type || null,
    storage_path: path,
    erstellt_von: user?.id ?? null,
  }).select().single();
  if (error) {
    console.error("uploadDatei insert:", error);
    await supabase.storage.from(BUCKET).remove([path]);
    return null;
  }
  return data as KundeDokument;
}

export async function renameDokument(id: string, name: string): Promise<boolean> {
  const { error } = await db.from("kunde_dokumente").update({ name: name.trim() }).eq("id", id);
  if (error) { console.error("rename:", error); return false; }
  return true;
}

export async function moveDokument(id: string, newParentId: string | null): Promise<boolean> {
  const { error } = await db.from("kunde_dokumente").update({ parent_id: newParentId }).eq("id", id);
  if (error) { console.error("move:", error); return false; }
  return true;
}

export async function deleteDokument(dok: KundeDokument): Promise<boolean> {
  const storagePaths: string[] = [];

  if (dok.typ === "ordner") {
    // Rekursiv: alle Nachfahren finden, Storage-Dateien UND DB-Zeilen löschen.
    // Ohne explizites Löschen der Nachfahren blieben Dateien/Unterordner
    // als "Waisen" (parent_id verweist auf gelöschte ID) in der DB liegen
    // und tauchten nach Reload wieder auf.
    const alle = await listAllDescendants(dok.id);
    storagePaths.push(...alle.filter(d => d.typ === "datei" && d.storage_path).map(d => d.storage_path!));
    if (alle.length) {
      const ids = alle.map(d => d.id);
      const { error: descErr } = await db.from("kunde_dokumente").delete().in("id", ids).select("id");
      if (descErr) { console.error("delete descendants:", descErr); return false; }
    }
  } else if (dok.storage_path) {
    storagePaths.push(dok.storage_path);
  }

  const { data: deletedRows, error } = await db.from("kunde_dokumente").delete().eq("id", dok.id).select("id");
  if (error) { console.error("delete:", error); return false; }
  if (!deletedRows?.length) {
    console.error("delete: no row deleted", dok.id);
    return false;
  }

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(storagePaths);
    if (storageError) console.error("delete storage files:", storageError);
  }

  return true;
}

async function listAllDescendants(parentId: string): Promise<KundeDokument[]> {
  const result: KundeDokument[] = [];
  const queue = [parentId];
  while (queue.length) {
    const p = queue.shift()!;
    const { data, error } = await db.from("kunde_dokumente").select("*").eq("parent_id", p);
    if (error) {
      console.error("listAllDescendants:", error);
      break;
    }
    for (const row of (data || []) as KundeDokument[]) {
      result.push(row);
      if (row.typ === "ordner") queue.push(row.id);
    }
  }
  return result;
}

export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) { console.error("signedUrl:", error); return null; }
  return data?.signedUrl ?? null;
}