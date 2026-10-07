import { useState, useEffect } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, UserPlus, Gift, TrendingUp, CheckCircle2,
  Phone, Mail, Clock, ExternalLink, Trash2, Pencil,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { istZustaendig } from "@/lib/kontaktOwnership";
import { nameMeintNutzer } from "@/lib/beraterNamensabgleich";
import { toast } from "sonner";
import { getKontakte, getKontaktById, deleteKontakt } from "@/lib/kundenStore";
import { getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { cacheGet, cacheInsert, cacheUpdate, cacheRefreshTable } from "@/lib/dataCache";
import {
  fehltKontaktIdSpalte,
  mergeEmpfehlungMeta,
  pipelineToEmpfehlungStatus,
  getProgrammByInvestment,
  getEmpfehlungenByInvestment,
  ALLE_EMPFEHLUNG_STATUS,
  EMPFEHLUNG_STATUS_CONFIG,
  type EmpfehlungStatus,
  type EmpfehlungsProgramm,
} from "@/lib/empfehlungenStore";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import {
  EmpfehlungsprogrammDialoge,
  type EmpfehlungsprogrammDialogArt,
} from "@/components/kunde/EmpfehlungsprogrammDialoge";
import { PhoneInput } from "@/components/ui/phone-input";

// ── Empfehlungsprogramm Store ──
interface EmpfehlungEntry {
  id: string;
  empfehlenderKundeId: string;
  empfehlenderName: string;
  empfohlenerName: string;
  empfohlenerEmail: string;
  empfohlenerTelefon: string;
  beziehung: string;
  berater: string;
  /** Kennung des zustaendigen Vertriebspartners (meta.vpId). Vorrang vor dem Namen. */
  beraterId?: string;
  status: EmpfehlungStatus;
  praemieStatus: "ausstehend" | "berechtigt" | "ausgezahlt";
  praemieBetrag: number;
  erstelltAm: string;
  abgeschlossenAm?: string;
  neuerKontaktId?: string;
  /** true, wenn der Status von Hand gesetzt wurde und die Automatik pausiert. */
  statusManuell?: boolean;
  statusManuellVon?: string;
  statusManuellAm?: string;
}

function loadEmpfehlungen(): EmpfehlungEntry[] {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem("mi_empfehlungen_tracking"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  const rows = cacheGet("empfehlungen");
  return rows.map((r: any) => ({
    id: r.id,
    empfehlenderKundeId: r.meta?.empfehlenderKundeId || r.meta?.kontaktId || r.empfohlen_von || "",
    empfehlenderName: r.meta?.empfehlenderName || r.meta?.kontaktName || r.empfohlen_von || "",
    empfohlenerName: r.empfohlen_name || "",
    empfohlenerEmail: r.empfohlen_email || "",
    empfohlenerTelefon: r.empfohlen_telefon || "",
    beziehung: r.meta?.beziehung || "",
    berater: r.meta?.berater || "",
    beraterId: r.meta?.vpId || "",
    status: (r.status || "neu") as EmpfehlungStatus,
    praemieStatus: r.meta?.praemieStatus || "ausstehend",
    praemieBetrag: r.provision || 500,
    erstelltAm: r.erstellt_am?.split("T")[0] || "",
    abgeschlossenAm: r.meta?.abgeschlossenAm,
    // Spalte zuerst, meta als Rueckfall, solange die Migration nicht gelaufen ist
    neuerKontaktId: r.kontakt_id || r.meta?.neuerKontaktId || "",
    statusManuell: r.meta?.statusManuell === true,
    statusManuellVon: r.meta?.statusManuellVon,
    statusManuellAm: r.meta?.statusManuellAm,
  }));
}

function saveEmpfehlung(entry: EmpfehlungEntry) {
  if (isTestAccount()) {
    const all = loadEmpfehlungen();
    const idx = all.findIndex(e => e.id === entry.id);
    if (idx >= 0) all[idx] = entry; else all.push(entry);
    localStorage.setItem("mi_empfehlungen_tracking", JSON.stringify(all));
    return;
  }
  const existing = cacheGet("empfehlungen").find((r: any) => r.id === entry.id);
  // Nur die hier verwalteten Felder in meta anfassen. Alles andere
  // (z. B. neuerKontaktId, programmId) bleibt durch den Merge erhalten;
  // vorher ersetzte der Statuswechsel das ganze meta-Objekt.
  const metaPatch: Record<string, any> = {
    empfehlenderKundeId: entry.empfehlenderKundeId,
    empfehlenderName: entry.empfehlenderName,
    beziehung: entry.beziehung,
    berater: entry.berater,
    praemieStatus: entry.praemieStatus,
  };
  if (entry.abgeschlossenAm !== undefined) metaPatch.abgeschlossenAm = entry.abgeschlossenAm;
  if (entry.statusManuell !== undefined) metaPatch.statusManuell = entry.statusManuell;
  if (entry.statusManuellVon !== undefined) metaPatch.statusManuellVon = entry.statusManuellVon;
  if (entry.statusManuellAm !== undefined) metaPatch.statusManuellAm = entry.statusManuellAm;
  const row = {
    empfohlen_name: entry.empfohlenerName,
    empfohlen_email: entry.empfohlenerEmail,
    empfohlen_telefon: entry.empfohlenerTelefon,
    empfohlen_von: entry.empfehlenderName,
    status: entry.status,
    provision: entry.praemieBetrag,
    meta: mergeEmpfehlungMeta(existing?.meta, metaPatch),
  };
  if (existing) {
    cacheUpdate("empfehlungen", entry.id, row);
  } else {
    cacheInsert("empfehlungen", { id: entry.id, ...row });
  }
}

// Zentrale Status-Anzeige aus dem Store, damit neue Werte wie in_beratung
// oder in_abwicklung nicht wieder als "Unbekannt" durchrutschen.
const STATUS_CONFIG = EMPFEHLUNG_STATUS_CONFIG;
const STATUS_FALLBACK = { label: "Unbekannt", color: "bg-muted text-muted-foreground" };

const PRAEMIE_CONFIG: Record<string, { label: string; color: string }> = {
  ausstehend: { label: "Ausstehend", color: "bg-muted text-muted-foreground" },
  berechtigt: { label: "Berechtigt", color: "bg-warning/15 text-warning border-warning/30" },
  ausgezahlt: { label: "Ausgezahlt", color: "bg-success/15 text-success border-success/30" },
};
const PRAEMIE_FALLBACK = { label: "Ausstehend", color: "bg-muted text-muted-foreground" };

export default function Empfehlungen() {
  const { user, authUser } = useUser();
  const navigate = useNavigate();
  const _lv = useLiveVersion(["empfehlungen", "kontakte", "empfehlungsprogramme"]);
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  // Wer darf Programme pflegen? Dieselbe Regel wie im Kundenprofil
  // (EmpfehlungsprogrammKnoepfe); Vertriebspartner sehen ohnehin nur die
  // eigenen Kunden.
  const canManageProgramm = ["admin", "inhaber", "vertriebspartner"].includes(user.role);
  // Wem gehoert eine Empfehlung? Kennung zuerst, der Name nur ohne Kennung und
  // nur, wenn er eindeutig ist.
  const ich = { userId: authUser?.id, userName: user.name };
  const istMeine = (e: EmpfehlungEntry) =>
    e.beraterId ? e.beraterId === authUser?.id : nameMeintNutzer(e.berater, ich);

  const [empfehlungen, setEmpfehlungen] = useState<EmpfehlungEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmp, setNewEmp] = useState({ empfehlenderKundeId: "", empfohlenerName: "", empfohlenerEmail: "", empfohlenerTelefon: "", beziehung: "" });
  const [deleteTarget, setDeleteTarget] = useState<EmpfehlungEntry | null>(null);
  const [programmDialog, setProgrammDialog] = useState<{ kunde: any; investments: any[]; art: EmpfehlungsprogrammDialogArt } | null>(null);

  useEffect(() => {
    const all = loadEmpfehlungen();
    const sichtbare = isAdmin ? all : all.filter(istMeine);
    setEmpfehlungen(sichtbare);

    // Neue Empfehlungen als gesehen markieren, damit der Zaehler in der
    // Seitenleiste verschwindet. Nur schreiben, wenn es wirklich neue gibt.
    // Bleibt eine Empfehlung auf "neu" stehen, wird sie leicht doppelt
    // bearbeitet, deshalb muss ein Fehlschlag sichtbar werden.
    // Nicht-Admins markieren nur die EIGENEN Zeilen; vorher lief das Update
    // ungefiltert ueber die Empfehlungen aller Vertriebspartner.
    if (!sichtbare.some(e => e.status === "neu")) return;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        let query = supabase
          .from("empfehlungen")
          .update({ status: "offen" })
          .eq("status", "neu");
        // Ueber die Kennungen der eigenen Zeilen, nicht ueber den Namen:
        // Zwei Partner koennen gleich heissen.
        if (!isAdmin) query = query.in("id", sichtbare.filter(e => e.status === "neu").map(e => e.id));
        const { error } = await query;
        if (error) throw error;
      } catch (fehler) {
        console.error("Empfehlungen konnten nicht als gesehen markiert werden:", fehler);
        toast.error("Die neuen Empfehlungen konnten nicht als gesehen markiert werden. Bitte lade die Seite neu, damit niemand dieselbe Empfehlung doppelt bearbeitet.");
      }
    })();
  }, [_lv]);

  const bestandskunden = getKontakte().filter(k => k.status === "kunde" && !k.archiviert && (isAdmin || istZustaendig(k, ich)));

  // Aktive Empfehlungsgeber: Kunden mit freigeschaltetem Empfehlungsprogramm
  // (meta.empfehlungsprogramm_aktiv). Konditionen und Zaehler kommen wie im
  // Kundenprofil aus den Programmen der Investments. Jeder sieht hier nur die
  // eigenen Kunden, ausdruecklich auch Admins und Inhaber: Es ist die
  // persoenliche Arbeitsliste, keine Verwaltungsansicht.
  const aktiveGeber = cacheGet("kontakte")
    .filter((r: any) => r?.meta?.empfehlungsprogramm_aktiv && !r.archiviert && !r.geloescht && istZustaendig(r, ich))
    .map((r: any) => {
      const invs = getInvestmentsByKontakt(r.id);
      const leitProgramm = (invs.map((inv: any) => getProgrammByInvestment(inv.id)).find(Boolean) as EmpfehlungsProgramm | undefined) ?? null;
      const anzahlEmpfehlungen = invs.reduce((summe: number, inv: any) => summe + getEmpfehlungenByInvestment(inv.id).length, 0);
      return {
        kontakt: r,
        name: `${r.vorname || ""} ${r.nachname || ""}`.trim() || "Unbenannter Kontakt",
        investments: invs,
        leitProgramm,
        anzahlEmpfehlungen,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Status darf neben Admin/Inhaber auch der zustaendige Vertriebspartner
  // aendern; Nicht-Admins sehen ohnehin nur die eigenen Empfehlungen.
  const darfStatusAendern = (e: EmpfehlungEntry) => isAdmin || istMeine(e);
  const statusSpalteSichtbar = isAdmin || empfehlungen.some(istMeine);

  // Stats
  const total = empfehlungen.length;
  const abgeschlossen = empfehlungen.filter(e => e.status === "abgeschlossen").length;
  const conversionRate = total > 0 ? Math.round((abgeschlossen / total) * 100) : 0;
  const praemienGesamt = empfehlungen.filter(e => e.praemieStatus === "ausgezahlt").reduce((s, e) => s + e.praemieBetrag, 0);
  const praemienOffen = empfehlungen.filter(e => e.praemieStatus === "berechtigt").reduce((s, e) => s + e.praemieBetrag, 0);

  // Empfehlungskette: Wer hat wie viele empfohlen? Group by name (normalized) to avoid duplicates from different ID sources
  const empfehlungsKette = new Map<string, { name: string; kundeId: string; count: number; abgeschlossen: number }>();
  empfehlungen.forEach(e => {
    const key = e.empfehlenderName.trim().toLowerCase();
    const existing = empfehlungsKette.get(key);
    if (existing) {
      existing.count++;
      if (e.status === "abgeschlossen") existing.abgeschlossen++;
      // Prefer a real UUID over a name string as kundeId
      if (e.empfehlenderKundeId && e.empfehlenderKundeId.includes("-")) existing.kundeId = e.empfehlenderKundeId;
    } else {
      empfehlungsKette.set(key, {
        name: e.empfehlenderName,
        kundeId: e.empfehlenderKundeId,
        count: 1,
        abgeschlossen: e.status === "abgeschlossen" ? 1 : 0,
      });
    }
  });
  const topEmpfehler = Array.from(empfehlungsKette.entries())
    .sort((a, b) => b[1].count - a[1].count);

  const sichtbareEmpfehlungen = (alle: EmpfehlungEntry[]) =>
    isAdmin ? alle : alle.filter(istMeine);

  const updateStatus = (id: string, status: EmpfehlungEntry["status"]) => {
    const all = loadEmpfehlungen();
    const idx = all.findIndex(e => e.id === id);
    if (idx >= 0) {
      all[idx].status = status;
      // Manuell gesetzter Status: Die Automatik respektiert ihn ab jetzt
      // (Ausnahme abgeschlossen/verloren, siehe entscheideEmpfehlungStatusSync).
      all[idx].statusManuell = true;
      all[idx].statusManuellVon = user.name;
      all[idx].statusManuellAm = new Date().toISOString();
      if (status === "abgeschlossen") {
        all[idx].abgeschlossenAm = new Date().toISOString().split("T")[0];
        all[idx].praemieStatus = "berechtigt";
      }
      saveEmpfehlung(all[idx]);
      setEmpfehlungen(sichtbareEmpfehlungen(all));
      toast.success("Status aktualisiert (manuell, Automatik pausiert)");
    }
  };

  // "Zurueck auf Automatik": manuelle Sperre loesen und den Status sofort
  // wieder aus der aktuellen effektiven Pipelinestufe des verknuepften
  // Kontakts ableiten.
  const resetStatusAutomatik = (id: string) => {
    const all = loadEmpfehlungen();
    const idx = all.findIndex(e => e.id === id);
    if (idx < 0) return;
    const entry = all[idx];
    entry.statusManuell = false;
    if (entry.neuerKontaktId) {
      const kunde = getKontaktById(entry.neuerKontaktId);
      if (kunde) {
        const abgeleitet = pipelineToEmpfehlungStatus(getEffectivePipelineStufe(kunde));
        if (abgeleitet && entry.status !== "dublette") {
          entry.status = abgeleitet;
          if (abgeleitet === "abgeschlossen") {
            if (!entry.abgeschlossenAm) entry.abgeschlossenAm = new Date().toISOString().split("T")[0];
            if (entry.praemieStatus !== "ausgezahlt") entry.praemieStatus = "berechtigt";
          }
        }
      }
    }
    saveEmpfehlung(entry);
    setEmpfehlungen(sichtbareEmpfehlungen(all));
    toast.success("Automatik wieder aktiv, Status aus der Pipeline abgeleitet");
  };

  const updatePraemie = (id: string, praemieStatus: EmpfehlungEntry["praemieStatus"]) => {
    const all = loadEmpfehlungen();
    const idx = all.findIndex(e => e.id === id);
    if (idx >= 0) {
      all[idx].praemieStatus = praemieStatus;
      saveEmpfehlung(all[idx]);
      setEmpfehlungen(sichtbareEmpfehlungen(all));
      toast.success(praemieStatus === "ausgezahlt" ? "Prämie als ausgezahlt markiert" : "Prämien-Status aktualisiert");
    }
  };

  const handleAdd = async () => {
    const kunde = bestandskunden.find(k => k.id === newEmp.empfehlenderKundeId);
    if (!kunde || !newEmp.empfohlenerName) return;

    // Parse first/last name
    const nameParts = newEmp.empfohlenerName.trim().split(/\s+/);
    const vorname = nameParts[0] || newEmp.empfohlenerName;
    const nachname = nameParts.slice(1).join(" ") || "-";

    // Create kontakt + empfehlung together
    const kontaktId = crypto.randomUUID();
    const empId = crypto.randomUUID();
    const empfehlenderName = `${kunde.vorname} ${kunde.nachname}`;

    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // Den zuständigen Vertriebspartner des Empfehlungsgebers ermitteln,
      // damit der neue Kontakt automatisch beim richtigen VP landet.
      const vpId = (kunde as any).zustaendig_id || null;
      const vpName = kunde.berater || user.name;

      // Create kontakt record so it appears in Kontakte / Alle Kontakte
      const { error: kErr } = await supabase.from("kontakte").insert({
        id: kontaktId,
        vorname,
        nachname,
        email: newEmp.empfohlenerEmail || null,
        telefon: newEmp.empfohlenerTelefon || null,
        quelle: `Empfehlung von ${empfehlenderName}`,
        berater: vpName,
        zustaendig_id: vpId,
        status: "neu",
        meta: {
          empfehlungsgeber: true,
          empfehlungsgeberName: empfehlenderName,
          empfehlungsgeberKontaktId: kunde.id,
          empfehlungsgeberVpId: vpId || "",
          empfehlungsgeberBeziehung: newEmp.beziehung || "",
          pipelineStufe: "neuer_lead",
          empfehlungId: empId,
        },
      });
      if (kErr) throw kErr;

      // Create empfehlung record
      const empfehlungRow: Record<string, any> = {
        id: empId,
        empfohlen_name: newEmp.empfohlenerName,
        empfohlen_email: newEmp.empfohlenerEmail || null,
        empfohlen_telefon: newEmp.empfohlenerTelefon || null,
        empfohlen_von: empfehlenderName,
        status: "neu",
        provision: 500,
        benutzer_id: (await supabase.auth.getUser()).data.user?.id || null,
        kontakt_id: kontaktId,
        meta: {
          empfehlenderKundeId: kunde.id,
          empfehlenderName: empfehlenderName,
          kontaktId: kunde.id,
          kontaktName: empfehlenderName,
          beziehung: newEmp.beziehung,
          berater: vpName,
          vpId: vpId || "",
          praemieStatus: "ausstehend",
          neuerKontaktId: kontaktId,
        },
      };
      let { error: eErr } = await supabase.from("empfehlungen").insert(empfehlungRow as any);
      if (eErr && fehltKontaktIdSpalte(eErr)) {
        // Migration fuer kontakt_id noch nicht gelaufen: ohne die Spalte
        // schreiben, die Verknuepfung steht dann in meta.neuerKontaktId.
        const { kontakt_id: _ohneSpalte, ...ohneKontaktId } = empfehlungRow;
        ({ error: eErr } = await supabase.from("empfehlungen").insert(ohneKontaktId as any));
      }
      if (eErr) throw eErr;

      // Glocken-Benachrichtigung an den zuständigen Vertriebspartner.
      // Der Datensatz steht auch ohne die Glocke, deshalb bricht ein Fehlschlag
      // hier nichts ab. Der Nutzer erfährt es aber, damit er selbst Bescheid
      // geben kann.
      let benachrichtigt = true;
      if (vpId) {
        try {
          const { error: notifyError } = await supabase.from("benachrichtigungen").insert({
            benutzer_id: vpId,
            titel: `Neue Empfehlung von ${empfehlenderName}`,
            nachricht: `Dein Kunde ${empfehlenderName} hat eine neue Empfehlung gesendet: ${newEmp.empfohlenerName}${newEmp.empfohlenerTelefon ? ` (${newEmp.empfohlenerTelefon})` : ""}. Bitte zeitnah kontaktieren.`,
            link: `/kunden/${kontaktId}`,
          });
          if (notifyError) throw notifyError;
        } catch (notifyErr) {
          benachrichtigt = false;
          console.error("Benachrichtigung konnte nicht gesendet werden:", notifyErr);
        }
      }

      // Update local state
      const entry: EmpfehlungEntry = {
        id: empId,
        empfehlenderKundeId: kunde.id,
        empfehlenderName: empfehlenderName,
        empfohlenerName: newEmp.empfohlenerName,
        empfohlenerEmail: newEmp.empfohlenerEmail,
        empfohlenerTelefon: newEmp.empfohlenerTelefon,
        beziehung: newEmp.beziehung,
        berater: user.name,
        beraterId: vpId || "",
        status: "neu",
        praemieStatus: "ausstehend",
        praemieBetrag: 500,
        erstelltAm: new Date().toISOString().split("T")[0],
        // Sonst zeigt der frisch angelegte Eintrag bis zum naechsten Laden
        // faelschlich die Kennzeichnung "nicht verknuepft".
        neuerKontaktId: kontaktId,
      };
      setEmpfehlungen([...empfehlungen, entry]);
      setShowAdd(false);
      setNewEmp({ empfehlenderKundeId: "", empfohlenerName: "", empfohlenerEmail: "", empfohlenerTelefon: "", beziehung: "" });
      if (benachrichtigt) {
        toast.success("Empfehlung hinzugefügt – Kontakt wurde angelegt");
      } else {
        toast.warning("Empfehlung hinzugefügt und Kontakt angelegt. Der zuständige Vertriebspartner hat aber keine Benachrichtigung bekommen. Bitte gib ihm kurz selbst Bescheid.");
      }
    } catch (err: any) {
      console.error("Empfehlung erstellen fehlgeschlagen:", err);
      toast.error("Die Empfehlung konnte nicht gespeichert werden. Bitte prüfe die Eingaben und versuche es noch einmal.");
    }
  };

  const handleDelete = async (emp: EmpfehlungEntry) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      // Find the associated kontakt created from this empfehlung
      const empRow = cacheGet("empfehlungen").find((r: any) => r.id === emp.id);
      const neuerKontaktId = empRow?.kontakt_id || empRow?.meta?.neuerKontaktId;

      // Delete empfehlung
      if (isTestAccount()) {
        const all = loadEmpfehlungen().filter(e => e.id !== emp.id);
        localStorage.setItem("mi_empfehlungen_tracking", JSON.stringify(all));
      } else {
        // Fehler beim Löschen wurden früher verschluckt, die Meldung sagte
        // trotzdem "gelöscht" und der Eintrag kam beim nächsten Laden zurück.
        const { error: empfehlungFehler } = await supabase.from("empfehlungen").delete().eq("id", emp.id);
        if (empfehlungFehler) throw empfehlungFehler;
      }

      // Der zugehoerige Kontakt geht in den Papierkorb. Endgueltig loeschen
      // duerfen seit 30.09.2026 nur Admin, Inhaber und Vertriebsleitung; ein
      // direktes DELETE eines Partners liefe still ins Leere.
      if (neuerKontaktId) {
        await deleteKontakt(neuerKontaktId, {
          grund: "Empfehlung gelöscht",
          geloeschtVon: authUser?.id,
          geloeschtVonName: user.name,
        });
      }

      setEmpfehlungen(prev => prev.filter(e => e.id !== emp.id));
      setDeleteTarget(null);
      toast.success(neuerKontaktId ? "Empfehlung gelöscht, der Kontakt liegt im Papierkorb" : "Empfehlung gelöscht");
    } catch (err: any) {
      console.error("Löschfehler:", err);
      toast.error("Die Empfehlung konnte nicht vollständig gelöscht werden. Bitte lade die Seite neu und versuche es erneut.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <PageHeader title="Empfehlungsprogramm" subtitle="Kunden werben Kunden – Empfehlungsketten und Prämien tracken">
          {/* Hauptaktion der Seite, deshalb Marken-Orange. Der zweite Knopf
              darunter ist derselbe Knopf fuer schmale Bildschirme. */}
          <Button variant="brand" onClick={() => setShowAdd(true)} className="gap-1 hidden sm:inline-flex">
            <UserPlus className="h-4 w-4" /> Empfehlung erfassen
          </Button>
        </PageHeader>
        <Button variant="brand" onClick={() => setShowAdd(true)} className="gap-1 sm:hidden self-start">
          <UserPlus className="h-4 w-4" /> Empfehlung erfassen
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 [&>*:nth-child(5):last-child]:col-span-2 [&>*:nth-child(5):last-child]:max-w-[calc(50%-0.5rem)] [&>*:nth-child(5):last-child]:mx-auto md:[&>*:nth-child(5):last-child]:col-span-1 md:[&>*:nth-child(5):last-child]:max-w-none md:[&>*:nth-child(5):last-child]:mx-0">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground">Empfehlungen gesamt</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-success" />
            <div className="text-2xl font-bold text-success">{abgeschlossen}</div>
            <div className="text-xs text-muted-foreground">Abgeschlossen</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-info" />
            <div className="text-2xl font-bold text-info">{conversionRate}%</div>
            <div className="text-xs text-muted-foreground">Conversion Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Gift className="h-5 w-5 mx-auto mb-1 text-warning" />
            <div className="text-2xl font-bold text-warning">{praemienGesamt.toLocaleString("de-DE")} €</div>
            <div className="text-xs text-muted-foreground">Prämien ausgezahlt</div>
          </CardContent>
        </Card>
        <Card className={praemienOffen > 0 ? "border-warning/50" : ""}>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{praemienOffen.toLocaleString("de-DE")} €</div>
            <div className="text-xs text-muted-foreground">Prämien offen</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Empfehler */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            🏆 Top Empfehler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topEmpfehler.slice(0, 6).map(([id, data], idx) => (
              <div key={id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{data.name}</div>
                  <div className="text-[10px] text-muted-foreground">{data.count} Empfehlung{data.count > 1 ? "en" : ""} · {data.abgeschlossen} abgeschlossen</div>
                </div>
                <Badge variant="outline" className="text-[10px]">{data.count}x</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aktive Empfehlungsgeber: Kunden mit freigeschaltetem Programm */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" /> Aktive Empfehlungsgeber
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aktiveGeber.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch kein Kunde mit aktivem Empfehlungsprogramm. Freigeschaltet wird es im Kundenprofil bei den Stammdaten.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Konditionen</TableHead>
                    <TableHead>Empfehlungen</TableHead>
                    {canManageProgramm && <TableHead className="text-right">Aktionen</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aktiveGeber.map(geber => (
                    <TableRow key={geber.kontakt.id}>
                      <TableCell className="font-medium text-sm">
                        <button
                          className="hover:underline text-primary cursor-pointer bg-transparent border-none p-0 font-medium text-sm flex items-center gap-1"
                          onClick={() => navigate(`/kunden/${geber.kontakt.id}`)}
                        >
                          {geber.name}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </TableCell>
                      <TableCell>
                        {geber.leitProgramm ? (
                          <div className="max-w-[340px]">
                            <div className="text-sm">
                              {geber.leitProgramm.provisionsBetrag}{geber.leitProgramm.provisionsTyp === "prozent" ? "%" : " €"} pro Empfehlung
                            </div>
                            <div className="text-xs text-muted-foreground truncate" title={geber.leitProgramm.provisionsText}>
                              {geber.leitProgramm.provisionsText}
                            </div>
                            {geber.leitProgramm.bedingungen && (
                              <div className="text-xs text-muted-foreground truncate" title={geber.leitProgramm.bedingungen}>
                                Bedingungen: {geber.leitProgramm.bedingungen}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Keine Konditionen hinterlegt</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{geber.anzahlEmpfehlungen}</Badge>
                      </TableCell>
                      {canManageProgramm && (
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => setProgrammDialog({ kunde: geber.kontakt, investments: geber.investments, art: "einstellen" })}
                            >
                              <Pencil className="h-3 w-3" /> Konditionen bearbeiten
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => setProgrammDialog({ kunde: geber.kontakt, investments: geber.investments, art: "deaktivieren" })}
                            >
                              Deaktivieren
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empfehlungen-Tabelle */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Alle Empfehlungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empfohlen von</TableHead>
                  <TableHead>Empfohlene Person</TableHead>
                  <TableHead>Beziehung</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prämie</TableHead>
                  <TableHead>Datum</TableHead>
                  {statusSpalteSichtbar && <TableHead>Status ändern</TableHead>}
                  {isAdmin && <TableHead>Prämie ändern</TableHead>}
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empfehlungen.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-sm">
                      <button
                        className="hover:underline text-primary cursor-pointer bg-transparent border-none p-0 font-medium text-sm flex items-center gap-1"
                        onClick={() => {
                          // Kennung zuerst. Der Name nur, wenn genau ein Kunde so heisst.
                          const namensTreffer = bestandskunden.filter(k => `${k.vorname} ${k.nachname}` === e.empfehlenderName);
                          const kunde = bestandskunden.find(k => k.id === e.empfehlenderKundeId)
                            ?? (namensTreffer.length === 1 ? namensTreffer[0] : undefined);
                          if (kunde) navigate(`/kunden/${kunde.id}`);
                        }}
                      >
                        {e.empfehlenderName}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.neuerKontaktId ? (
                        <button
                          className="hover:underline text-primary cursor-pointer bg-transparent border-none p-0 font-medium text-sm flex items-center gap-1"
                          onClick={() => navigate(`/kunden/${e.neuerKontaktId}`)}
                        >
                          {e.empfohlenerName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="flex items-center gap-2">
                          {e.empfohlenerName}
                          <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                            nicht verknüpft
                          </Badge>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.beziehung}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {e.empfohlenerEmail && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                        {e.empfohlenerTelefon && <Phone className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-start">
                        <Badge variant="outline" className={`text-[10px] ${(STATUS_CONFIG[e.status] || STATUS_FALLBACK).color}`}>
                          {(STATUS_CONFIG[e.status] || STATUS_FALLBACK).label}
                        </Badge>
                        {e.statusManuell && (
                          <span
                            className="text-[10px] text-muted-foreground"
                            title={`Manuell gesetzt${e.statusManuellVon ? ` von ${e.statusManuellVon}` : ""}. Die Automatik ändert diesen Status nur noch bei Abschluss oder Verlust.`}
                          >
                            manuell
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${(PRAEMIE_CONFIG[e.praemieStatus] || PRAEMIE_FALLBACK).color}`}>
                        {(PRAEMIE_CONFIG[e.praemieStatus] || PRAEMIE_FALLBACK).label} ({e.praemieBetrag} €)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.erstelltAm}</TableCell>
                    {statusSpalteSichtbar && (
                      <TableCell>
                        {darfStatusAendern(e) ? (
                          <div className="flex flex-col gap-1 items-start">
                            <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v as EmpfehlungEntry["status"])}>
                              <SelectTrigger className="h-8 w-[170px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALLE_EMPFEHLUNG_STATUS.map(status => (
                                  <SelectItem key={status} value={status}>
                                    {EMPFEHLUNG_STATUS_CONFIG[status].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {e.statusManuell && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={() => resetStatusAutomatik(e.id)}
                              >
                                Zurück auf Automatik
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>
                        <Select value={e.praemieStatus} onValueChange={(v) => updatePraemie(e.id, v as EmpfehlungEntry["praemieStatus"])}>
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ausstehend">Ausstehend</SelectItem>
                            <SelectItem value="berechtigt">Berechtigt</SelectItem>
                            <SelectItem value="ausgezahlt">Ausgezahlt</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon" aria-label="Löschen"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Empfehlung erfassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Empfehlender Kunde</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                value={newEmp.empfehlenderKundeId}
                onChange={e => setNewEmp(prev => ({ ...prev, empfehlenderKundeId: e.target.value }))}
              >
                <option value="">Kunde auswählen…</option>
                {bestandskunden.map(k => (
                  <option key={k.id} value={k.id}>{k.vorname} {k.nachname}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Name der empfohlenen Person</Label>
              <Input value={newEmp.empfohlenerName} onChange={e => setNewEmp(prev => ({ ...prev, empfohlenerName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input type="email" value={newEmp.empfohlenerEmail} onChange={e => setNewEmp(prev => ({ ...prev, empfohlenerEmail: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <PhoneInput value={newEmp.empfohlenerTelefon} onChange={v => setNewEmp(prev => ({ ...prev, empfohlenerTelefon: v }))} />
            </div>
            <div>
              <Label className="text-xs">Beziehung (Woher kennen sie sich?)</Label>
              <Input value={newEmp.beziehung} onChange={e => setNewEmp(prev => ({ ...prev, beziehung: e.target.value }))} placeholder="z.B. Arbeitskollege, Freund, Familie…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={!newEmp.empfehlenderKundeId || !newEmp.empfohlenerName}>Empfehlung speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Programm-Dialoge (Konditionen bearbeiten / Deaktivieren), dieselben
          wie im Kundenprofil, damit die Speicherlogik nur einmal existiert. */}
      {programmDialog && (
        <EmpfehlungsprogrammDialoge
          kunde={programmDialog.kunde}
          investments={programmDialog.investments}
          currentUser={{ id: (user as any)?.id, name: user.name, role: user.role }}
          offen={programmDialog.art}
          onSchliessen={() => setProgrammDialog(null)}
          onChanged={() => {
            // merge_kontakt_meta laeuft serverseitig, deshalb den
            // Kontakte-Cache nachziehen, damit der Abschnitt aktuell bleibt.
            cacheRefreshTable("kontakte").catch(() => {});
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empfehlung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block mb-2">
                Möchtest du die Empfehlung von <strong>{deleteTarget?.empfohlenerName}</strong> wirklich löschen?
              </span>
              <span className="block text-destructive font-medium">
                Der zugehörige Kundendatensatz ({deleteTarget?.empfohlenerName}) kommt in den Papierkorb und lässt sich dort wiederherstellen.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
