/**
 * Kundenportal freischalten: Einladung über `invite-user`, danach Unterlagen
 * freigeben, Aktivität und Rückmeldung.
 *
 * Stand bis zum 16.10.2026 nur im Kundenprofil (KundenDetail.tsx). Seitdem
 * nutzt auch die Beratungspräsentation (Abschnitt 16) denselben Weg, damit
 * Rechte, Rückmeldung und Absicherung an beiden Stellen gleich sind. Wer
 * einladen darf, prüft die Edge Function selbst.
 */
import { supabase } from "@/integrations/supabase/client";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { mergeKontaktMeta } from "@/lib/kundenStore";
import { setInvestmentUnterlagenFreigeschalten, setUnterlagenFreigeschalten } from "@/lib/investmentsStore";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { notifyUser } from "@/lib/bellNotifications";
import { stelleKundenspracheSicher } from "@/lib/kundenSprache";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import type { toast as toastFn } from "@/hooks/use-toast";

export type PortalStatus = "none" | "eingeladen" | "aktiv" | "ausstehend" | "gesperrt";

type Toast = typeof toastFn;

export interface PortalKunde {
  email?: string;
  vorname?: string;
  nachname?: string;
  person2?: { vorname?: string; nachname?: string; email?: string; telefon?: string } | null;
}

/** Portalstand aus `kontakte.meta`; beim Testkonto aus localStorage. */
export function portalMetaLesen(kontaktId: string): Record<string, any> & { status: PortalStatus } {
  if (isTestAccount()) {
    const raw = localStorage.getItem(`osimmo_portal_meta_${kontaktId || ""}`);
    return raw ? JSON.parse(raw) : { status: localStorage.getItem(`osimmo_portal_${kontaktId || ""}`) === "true" ? "eingeladen" : "none" };
  }
  const rows = cacheGet("kontakte");
  const row = rows.find((r: any) => r.id === kontaktId);
  const meta = (row?.meta as any) || {};
  if (meta.portalGesperrt) return { status: "gesperrt" as PortalStatus, ...meta };
  if (meta.portalAktiv) return { status: "aktiv" as PortalStatus, ...meta };
  if (meta.portalFreigeschalten) return { status: "eingeladen" as PortalStatus, ...meta };
  return { status: "none" as PortalStatus, ...meta };
}

/**
 * Schreibt Felder in den Portalstand. `geaendert` läuft nach dem lokalen
 * Schreiben und noch einmal nach der Antwort des Servers.
 */
export function portalMetaAendern(kontaktId: string, updates: Record<string, any>, geaendert: () => void = () => {}) {
  if (isTestAccount()) {
    const rows = cacheGet("kontakte");
    const row = rows.find((r: any) => r.id === kontaktId);
    const meta = { ...(row?.meta || {}), ...updates };
    localStorage.setItem(`osimmo_portal_meta_${kontaktId || ""}`, JSON.stringify(meta));
    localStorage.setItem(`osimmo_portal_${kontaktId || ""}`, "true");
    geaendert();
    return;
  }
  // Optimistic local update
  const rows = cacheGet("kontakte");
  const row = rows.find((r: any) => r.id === kontaktId);
  if (row) {
    const idx = rows.findIndex((r: any) => r.id === kontaktId);
    if (idx >= 0) {
      const next = [...rows];
      next[idx] = { ...rows[idx], meta: { ...(row.meta || {}), ...updates } };
      cacheSet("kontakte", next);
    }
  }
  geaendert();
  // Atomic server-side merge to prevent race conditions
  supabase.rpc("merge_kontakt_meta", {
    _kontakt_id: kontaktId,
    _updates: updates,
  }).then(({ data, error }) => {
    if (error) console.error("merge_kontakt_meta error:", error);
    else if (data) {
      const arr = cacheGet("kontakte");
      const i = arr.findIndex((r: any) => r.id === kontaktId);
      if (i >= 0) {
        const next = [...arr];
        next[i] = { ...arr[i], meta: data };
        cacheSet("kontakte", next);
      }
      geaendert();
    }
  });
}

interface Freischaltung {
  kontaktId: string;
  kunde: PortalKunde;
  investmentIds: string[];
  /** Name des Angemeldeten, für die Aktivität. */
  vonName: string;
  toast: Toast;
  geaendert?: () => void;
}

/** Lädt Person 2 ins Portal ein. */
export async function person2Einladen({ kontaktId, kunde, toast, geaendert }: Omit<Freischaltung, "investmentIds" | "vonName">) {
  if (!kunde?.person2?.email) {
    toast({ title: "Keine E-Mail für Person 2", description: "Bitte zuerst eine E-Mail-Adresse für Person 2 eintragen.", variant: "destructive" });
    return;
  }
  // Eine Sprache je Kontakt, Person 2 bekommt dieselbe (Plan Entscheidung 11).
  await stelleKundenspracheSicher(kontaktId);
  if (isTestAccount()) {
    portalMetaAendern(kontaktId, { person2Invited: true, person2InvitedAt: new Date().toISOString() }, geaendert);
    toast({ title: "Person 2 eingeladen ✓", description: `Einladung an ${kunde.person2.email} gesendet.` });
    return;
  }
  try {
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: kunde.person2.email,
        name: `${kunde.person2.vorname} ${kunde.person2.nachname}`,
        role: "kunde",
        kontaktId,
        person2: true,
        vorname: kunde.person2.vorname,
        nachname: kunde.person2.nachname,
        telefon: kunde.person2.telefon,
      },
    });
    if (error || data?.error) {
      const mitGrund = error ? ((await edgeFehlerMitGrund(error, { functionName: "invite-user" })) as Error) : null;
      toast({ title: "Fehler", description: data?.error || mitGrund?.message || error?.message, variant: "destructive" });
      return;
    }
    portalMetaAendern(kontaktId, { person2Invited: true, person2InvitedAt: new Date().toISOString(), person2AuthUserId: data?.userId }, geaendert);
    toast({ title: "Person 2 eingeladen ✓", description: `Einladung an ${kunde.person2.email} gesendet.` });
  } catch (err) {
    toast({ title: "Fehler", description: "Person 2 konnte nicht eingeladen werden.", variant: "destructive" });
  }
}

/**
 * Schaltet das Portal frei und schickt die Einladung.
 * @returns true, wenn die Einladung raus ist.
 */
export async function kundenportalFreischalten(e: Freischaltung): Promise<boolean> {
  const { kontaktId: id, kunde, investmentIds, vonName, toast, geaendert = () => {} } = e;
  if (!kunde?.email) {
    toast({ title: "Keine E-Mail hinterlegt", description: "Bitte zuerst eine E-Mail-Adresse für den Kunden eintragen.", variant: "destructive" });
    return false;
  }
  // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
  await stelleKundenspracheSicher(id);

  const now = new Date().toISOString();
  if (isTestAccount()) {
    portalMetaAendern(id, { portalFreigeschalten: true, portalActivatedAt: now }, geaendert);
    // Unterlagen automatisch mit-freischalten (Kontakt- + Investment-Ebene)
    try {
      setUnterlagenFreigeschalten(id, true);
      investmentIds.forEach((ivId) => {
        try { setInvestmentUnterlagenFreigeschalten(ivId, true); } catch {}
      });
    } catch {}
    toast({ title: "Kundenportal freigeschaltet ✓", description: `Login-Daten werden an ${kunde.email} gesendet.` });
    return true;
  }

  try {
    // Retry up to 2 times on transient errors (network blips, cold starts)
    let data: any = null;
    let error: any = null;
    let lastMsg = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await supabase.functions.invoke("invite-user", {
        body: {
          email: kunde.email,
          name: `${kunde.vorname} ${kunde.nachname}`,
          role: "kunde",
          kontaktId: id,
        },
      });
      data = res.data;
      error = res.error;
      if (!error && !data?.error) break;
      // Bei einer Ablehnung steht der Grund im Rumpf der Antwort, nicht in
      // `error.message` („Keine Berechtigung …“ bei fremden Kontakten).
      const mitGrund = error ? ((await edgeFehlerMitGrund(error, { functionName: "invite-user" })) as Error) : null;
      lastMsg = data?.error || mitGrund?.message || error?.message || "Unbekannter Fehler";
      console.warn(`Portal freischalten attempt ${attempt + 1} failed:`, lastMsg);
      // Don't retry on permission / validation errors
      if (/berechtig|autoris|fehlend|email/i.test(lastMsg)) break;
      await new Promise((r) => setTimeout(r, 800));
    }

    if (error || data?.error) {
      console.error("Portal freischalten error (final):", lastMsg, error, data);
      toast({ title: "Fehler beim Einladen", description: lastMsg, variant: "destructive" });
      return false;
    }

    // Edge Function already updated meta server-side, only update local cache
    const rows = cacheGet("kontakte");
    const row = rows.find((r: any) => r.id === id);
    if (row) {
      const idx = rows.findIndex((r: any) => r.id === id);
      if (idx >= 0) { rows[idx] = { ...rows[idx], meta: { ...(row.meta || {}), portalFreigeschalten: true, portalActivatedAt: now, authUserId: data?.userId } }; }
    }
    geaendert();
    // Unterlagen automatisch mit-freischalten, damit der Kunde sofort
    // alle Bonitätsunterlagen im Portal hochladen kann.
    // Ueber mergeKontaktMeta statt setUnterlagenFreigeschalten: nur so wird
    // der Schreibvorgang abgewartet und der Zwischenspeicher erst bei Erfolg
    // auf "freigegeben" gestellt. Sonst zeigt das CRM eine Freigabe an, die
    // der Kunde in seinem Portal gar nicht hat.
    let unterlagenFreigabeOk = false;
    try {
      unterlagenFreigabeOk = await mergeKontaktMeta(id, {
        unterlagenFreigeschaltet: true,
        unterlagenFreigeschaltetAt: now,
      });
    } catch (err) {
      console.error("[Portal freischalten] Unterlagen-Freigabe fehlgeschlagen:", err);
    }
    if (unterlagenFreigabeOk) {
      investmentIds.forEach((ivId) => {
        try {
          setInvestmentUnterlagenFreigeschalten(ivId, true);
        } catch (err) {
          console.error("[Portal freischalten] Freigabe am Investment fehlgeschlagen:", ivId, err);
        }
      });
    }
    addAktivitaet({ kundeId: id, art: "notiz", beschreibung: `Kundenportal freigeschaltet – Einladung an ${kunde.email} gesendet`, von: vonName });
    toast({ title: "Kundenportal freigeschaltet ✓", description: `Einladung wurde an ${kunde.email} gesendet.` });
    if (!unterlagenFreigabeOk) {
      toast({
        title: "Unterlagen sind noch gesperrt",
        description: "Das Kundenportal ist offen, aber die Unterlagen konnten nicht freigegeben werden. Der Kunde sieht sie noch nicht. Bitte die Freigabe gleich noch einmal auslösen.",
        variant: "destructive",
      });
    }

    // Invite Person 2 if exists
    if (kunde.person2) {
      if (kunde.person2.email) {
        void person2Einladen({ kontaktId: id, kunde, toast, geaendert });
      } else {
        // Person 2 hat keine E-Mail → Vertriebspartner benachrichtigen
        const kontaktRow = cacheGet("kontakte").find((k: any) => k.id === id);
        const beraterId = kontaktRow?.zustaendig_id;
        if (beraterId) {
          notifyUser(beraterId, {
            titel: "Person 2 ohne E-Mail-Adresse",
            nachricht: `Beim Freischalten des Kundenportals für ${kunde.vorname} ${kunde.nachname} wurde festgestellt, dass Person 2 (${kunde.person2.vorname} ${kunde.person2.nachname}) keine E-Mail-Adresse hinterlegt hat. Bitte E-Mail nachtragen, damit Person 2 ebenfalls Zugang zum Portal erhält.`,
            link: `/kunden/${id}`,
          });
        }
        toast({ title: "Hinweis: Person 2 ohne E-Mail", description: `${kunde.person2.vorname} ${kunde.person2.nachname} hat keine E-Mail – Portal kann nur für Person 1 aktiviert werden. Vertriebspartner wurde benachrichtigt.` });
      }
    }
    return true;
  } catch (err) {
    console.error("Portal freischalten error:", err);
    toast({ title: "Fehler", description: "Kundenportal konnte nicht freigeschaltet werden.", variant: "destructive" });
    return false;
  }
}
