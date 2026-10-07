import { supabase } from "@/integrations/supabase/client";

export type MobileScanBlock = "bonitaet" | "bankpruefung";

export interface MobileScanSession {
  id: string;
  token: string;
  kontakt_id: string;
  investment_id: string | null;
  person: number;
  block: MobileScanBlock | string;
  status: string;
  last_doc_typ: string | null;
  last_upload_at: string | null;
  meta: any;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

function randomToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createMobileScanSession(params: {
  kontaktId: string;
  investmentId?: string | null;
  person?: number;
  block: MobileScanBlock;
  docList?: string[];
}): Promise<MobileScanSession> {
  const token = randomToken();
  // Insert without returning – the SELECT policy denies direct reads on
  // mobile_scan_sessions (the table is exposed only through the
  // get_mobile_scan_session RPC, which is SECURITY DEFINER).
  const { error: insertError } = await supabase
    .from("mobile_scan_sessions")
    .insert({
      token,
      kontakt_id: params.kontaktId,
      investment_id: params.investmentId ?? null,
      person: params.person ?? 1,
      block: params.block,
      status: "offen",
      meta: { uploads: [], docList: params.docList ?? null },
    });
  if (insertError) throw insertError;
  const session = await getMobileScanSession(token);
  if (!session) throw new Error("Session konnte nach Anlage nicht geladen werden");
  return session;
}

export async function getMobileScanSession(token: string): Promise<MobileScanSession | null> {
  const { data, error } = await supabase.rpc("get_mobile_scan_session", { _token: token });
  if (error) {
    console.error("get_mobile_scan_session failed:", error);
    return null;
  }
  // RPC returns a row (or null)
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !(row as any).id) return null;
  return row as MobileScanSession;
}

export async function appendMobileScanUpload(token: string, upload: {
  docTyp: string;
  fileUrl: string;
  pages: number;
}): Promise<void> {
  const session = await getMobileScanSession(token);
  if (!session) throw new Error("Session nicht gefunden");
  const meta = session.meta || {};
  const uploads = Array.isArray(meta.uploads) ? meta.uploads : [];
  uploads.push({ ...upload, at: new Date().toISOString() });
  const { error } = await supabase.rpc("update_mobile_scan_session", {
    _token: token,
    _meta: { ...meta, uploads },
    _last_doc_typ: upload.docTyp,
    _last_upload_at: new Date().toISOString(),
  });
  if (error) throw error;

  // Zusätzlich in das verknüpfte Investment schreiben, damit das Kundenportal
  // (das auf `investments` per Realtime lauscht) den Upload sofort anzeigt.
  if (session.investment_id) {
    const { error: regErr } = await supabase.rpc("register_unterlage_upload", {
      _investment_id: session.investment_id,
      _doc_name: upload.docTyp,
      _file_url: upload.fileUrl,
    });
    if (regErr) {
      console.warn("register_unterlage_upload failed", regErr);
    }
  }
}

export async function completeMobileScanSession(token: string): Promise<void> {
  const { error } = await supabase.rpc("update_mobile_scan_session", {
    _token: token,
    _status: "abgeschlossen",
  });
  if (error) throw error;
}

export function subscribeMobileScanSession(token: string, onChange: (s: MobileScanSession) => void) {
  const channel = supabase
    .channel(`mss-${token}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mobile_scan_sessions", filter: `token=eq.${token}` },
      (payload) => {
        if (payload.new) onChange(payload.new as MobileScanSession);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}