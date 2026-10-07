import { supabase } from "@/integrations/supabase/client";
import type { VpBewertungContext } from "@/components/kunde/VpBewertungFormular";

/**
 * Lädt den Kontext für die VP-Bewertung eines eingeloggten Kunden:
 * - kontakt_id (über meta.authUserId / meta.person2.authUserId)
 * - vertriebspartner (zustaendig_id → profiles.name)
 * - kunde_name
 *
 * Liefert zusätzlich:
 * - latestNotarAt: ISO-Timestamp des spätesten Notartermins über alle
 *   Investments des Kunden (für die 1h-Logik), null wenn keiner.
 * - hasBewertung: true wenn der Kunde bereits eine Bewertung abgegeben hat.
 */
export type VpBewertungLoadResult = {
  ctx: VpBewertungContext | null;
  latestNotarAt: string | null;
  hasBewertung: boolean;
};

export async function loadVpBewertungContext(authUserId: string): Promise<VpBewertungLoadResult> {
  const empty: VpBewertungLoadResult = { ctx: null, latestNotarAt: null, hasBewertung: false };
  try {
    const { data: kontakte } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, zustaendig_id, berater, meta")
      .or(`meta->>authUserId.eq.${authUserId},meta->person2->>authUserId.eq.${authUserId}`)
      .limit(1);
    const k: any = kontakte?.[0];
    if (!k) return empty;

    const isPerson2 = k?.meta?.person2?.authUserId === authUserId;
    const vn = isPerson2 ? k.meta?.person2?.vorname || "" : k.vorname || "";
    const nn = isPerson2 ? k.meta?.person2?.nachname || "" : k.nachname || "";
    const kundeName = [vn, nn].filter(Boolean).join(" ").trim();

    // VP-User-ID + Name
    let vpUserId: string | null = k.zustaendig_id || null;
    let vpName = k.berater || "";
    if (vpUserId) {
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("name")
        .eq("id", vpUserId)
        .maybeSingle();
      if (prof && (prof as any).name) vpName = (prof as any).name;
    } else if (k.berater) {
      const { data: matches } = await supabase
        .from("profiles" as any)
        .select("id, name")
        .eq("name", k.berater)
        .limit(2);
      // Nur bei genau einem Treffer. Zwei Gleichnamige waeren geraten.
      if (matches && (matches as any[]).length === 1) vpUserId = (matches as any[])[0].id;
    }

    // Bereits bewertet?
    const { data: existing } = await supabase
      .from("vp_bewertungen" as any)
      .select("id")
      .eq("kontakt_id", k.id)
      .maybeSingle();
    const hasBewertung = !!existing;

    // Späteste Notar-Datum/Uhrzeit über alle Investments
    const { data: investments } = await supabase
      .from("investments")
      .select("meta")
      .eq("kunde_id", k.id);
    let latestNotarAt: string | null = null;
    for (const inv of (investments || []) as any[]) {
      const meta = inv?.meta || {};
      const datum: string | undefined = meta.notarTermin || meta.notarData?.datum;
      const uhrzeit: string = meta.notarUhrzeit || meta.notarData?.uhrzeit || "00:00";
      if (!datum) continue;
      // datum kann ISO oder TT.MM.JJJJ sein
      let iso: string | null = null;
      if (/^\d{4}-\d{2}-\d{2}/.test(datum)) {
        iso = `${datum.slice(0, 10)}T${uhrzeit.length === 5 ? uhrzeit : "00:00"}:00`;
      } else {
        const m = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
        if (m) iso = `${m[3]}-${m[2]}-${m[1]}T${/^\d{2}:\d{2}$/.test(uhrzeit) ? uhrzeit : "00:00"}:00`;
      }
      if (!iso) continue;
      if (!latestNotarAt || iso > latestNotarAt) latestNotarAt = iso;
    }

    return {
      ctx: {
        kontaktId: k.id,
        vpUserId,
        vpName: vpName || "Dein Berater",
        kundeName,
        bewertetVon: authUserId,
      },
      latestNotarAt,
      hasBewertung,
    };
  } catch {
    return empty;
  }
}