import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { einheitLoeschenMitRueckfrage } from "@/lib/einheitLoeschen";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, ArrowLeft, Play, ChevronLeft, ChevronRight, Download, Plus, Trash2, Building2, Pencil, EyeOff, Clock, UserPlus, Calculator, Eye, ExternalLink, FolderOpen, Globe, CheckCircle2, XCircle, FileText, Loader2, Maximize2, ChevronUp, ChevronDown, Search } from "lucide-react";
import { Upload } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { getObjektById, setObjektTitelbild, saveObjekt, getLastObjektSaveError, getLastObjektSaveHinweise, updateObjektField, updateObjektFieldFast, addDokument, removeDokument, updateWohnung, deleteObjekt, removeReservierung, reserveWohnung, gleicheEinheitMitInvestmentAb, addWohnungDokument, removeWohnungDokument, updateWohnungDokument, addWohnungBild, removeWohnungBild, defaultDokumente, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { resolveImageUrl } from "@/lib/objekteImages";
import { useUser } from "@/contexts/UserContext";
import { darfReservieren } from "@/lib/reservierungsRechte";
import { darfReservierungStarten, reservierungIstWirksam } from "@/lib/reservierungStart";
import { uhrzeit, vormerkungBlockiert } from "@/lib/einheitVormerkung";
import { darfObjektBearbeiten } from "@/lib/objektBearbeitenRecht";
import { getAktuelleMiete, hatGeplanteErhoehung, getHausgeldMonatForWohnung, getHausgeldNichtUmlegbarForWohnung, getHausgeldNichtUmlegbarP } from "@/lib/objekteStore";
import { einheitImAngebot } from "@/lib/objektKennzahlen";
import { useToast } from "@/hooks/use-toast";
import { notifyWohnungReserviert } from "@/lib/bellNotifications";
import { InvestmentRechner } from "@/components/objekte/InvestmentRechner";
import { ZahlenDatenFaktenGrid } from "@/components/objekte/ZahlenDatenFaktenGrid";
import { ReservierungsForm } from "@/components/reservierung/ReservierungsForm";
import { updateInvestment, getWohnungDisplayStatus, getInvestmentsByKontakt, getInvestments, getRvSignaturePending, getRvSigned, getInvestmentDocStatuses } from "@/lib/investmentsStore";
import { updateKontakt, getKontaktById } from "@/lib/kundenStore";
import { LazyImage } from "@/components/ui/lazy-image";
// ExposeSection entfernt – Exposé wird über den "Online-Exposé"-Button oben aufgerufen
import { loadAllUsers } from "@/lib/loadAllUsers";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { supabase } from "@/integrations/supabase/client";
import { befristeteDokumentAdressen, objektDateiAblegen, openUnterlage } from "@/lib/storage";
import { useLiveVersion } from "@/hooks/useLiveData";
import { usePassendeKunden } from "@/components/objektscore/usePassendeKunden";
import { PassendeKundenChip } from "@/components/objektseite/PassendeKundenChip";
import { useCacheReady } from "@/hooks/useCacheReady";
import { UmgebungsKarteButton } from "@/components/maps/UmgebungsKarteButton";
import { UmgebungsKarte } from "@/components/maps/UmgebungsKarte";
import { Objektbeschreibung } from "@/components/objekte/Objektbeschreibung";
import { ladeAlsZip } from "@/lib/unterlagenZip";
import { dokumente as investagonDokumente } from "@/lib/investagonFelder";
import { istGlobalobjekt } from "@/lib/objektKlassen";
import { kundenansichtZiel } from "@/lib/kundenansichtZiel";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const canEdit = (role: string) => ["admin", "inhaber", "objektpartner"].includes(role);

/* =============================================================
 * Unterlagen aus Investagon
 * =============================================================
 * Ein Objekt aus Investagon bringt seine Unterlagen mit. Der Import legt den
 * ganzen Originaldatensatz unter `meta.investagonRaw` ab, dort steht unter
 * `files` je Unterlage Titel, Gruppe und Adresse. Zusaetzlich laedt der Import
 * die Dateien in den geschuetzten Eimer `investagon-dokumente` und haengt sie
 * als interne Dokumente ans Objekt, mit dem Zeiger `/investagon-dokument/...`
 * als Adresse.
 *
 * Das Auslesen der Rohdaten macht `dokumente()` aus `src/lib/investagonFelder.ts`.
 * Dort stehen auch die deutschen Gruppennamen. Hier kommt nur dazu, was die
 * Bibliothek nicht wissen kann: ob es zu einer Unterlage schon eine
 * uebernommene Kopie im eigenen Eimer gibt.
 */

/** Was vor dem Ablagepfad einer uebernommenen Investagon-Unterlage steht. */
const INVESTAGON_ZEIGER = "/investagon-dokument/";

/**
 * Eine Adresse, die gar nicht bei uns liegt.
 *
 * Alles, was mit http beginnt und kein Supabase-Ablageort ist, gehoert einem
 * fremden Dienst, etwa `https://tool.investagon.com/uploads/...`. So eine
 * Adresse darf nicht durch die Supabase-Aufloesung laufen, dort gibt es sie
 * nicht.
 */
function istFremdeAdresse(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.includes("/storage/v1/object/");
}

/**
 * Eine Unterlage oeffnen, egal woher sie kommt.
 *
 * Warum nicht einfach `openUnterlage`: Die sucht jeden Wert im Supabase-Eimer
 * "unterlagen". Eine Investagon-Unterlage liegt aber in einem eigenen Eimer
 * und wird ueber die Seite `/investagon-dokument/...` freigegeben, eine fremde
 * Adresse liegt ueberhaupt nicht bei uns. In beiden Faellen findet die Suche
 * nichts, liefert null und der Klick bleibt ohne jede Wirkung, nur eine
 * Warnung in der Entwicklerkonsole. Genau das war der Fehler "Ansehen oeffnet
 * gar nichts". Deshalb entscheidet der Aufrufer zuerst, welcher der drei Wege
 * gemeint ist.
 *
 * Die ersten beiden Wege oeffnen ohne Warten, also noch im Klick selbst. Das
 * ist Absicht: Ein `window.open` nach einem `await` gilt manchen Browsern
 * nicht mehr als Nutzerklick und wird stillschweigend geblockt.
 */
export function unterlageOeffnen(url: string | null | undefined): void {
  if (!url) return;
  if (url.startsWith(INVESTAGON_ZEIGER) || istFremdeAdresse(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void openUnterlage(url);
}

export type InvestagonUnterlage = {
  id: string;
  titel: string;
  gruppe: string;
  /** Leer heisst: Es gibt nichts zu oeffnen. Dann wird auch kein Knopf angeboten. */
  url: string;
  dateiname: string;
};

/**
 * Die Unterlagen eines Investagon-Objekts, fertig fuer die Anzeige.
 *
 * Der eigene Zeiger hat Vorrang vor der Investagon-Adresse: Die uebernommene
 * Kopie liegt in unserem geschuetzten Eimer und braucht keinen
 * Investagon-Zugang. Erst wenn es sie noch nicht gibt, steht die
 * Originaladresse da. Uebernommene Unterlagen ohne Gegenstueck im
 * Originaldatensatz kommen am Ende dazu, damit nichts verschwindet.
 */
export function investagonUnterlagen(objekt: ObjektData): InvestagonUnterlage[] {
  const eigene = new Map<string, string>();
  (objekt.dokumente || []).forEach(d => {
    if (d.url && d.url.startsWith(INVESTAGON_ZEIGER)) eigene.set(d.name, d.url);
  });
  const verwendet = new Set<string>();
  const liste: InvestagonUnterlage[] = investagonDokumente(objekt).map(d => {
    const eigen = eigene.get(d.titel) || eigene.get(d.dateiname) || "";
    if (eigen) verwendet.add(eigen);
    return {
      id: `investagon-${d.id}`,
      titel: d.titel,
      gruppe: d.kategorieLabel,
      url: eigen || (istFremdeAdresse(d.url) ? d.url : ""),
      dateiname: d.dateiname,
    };
  });
  eigene.forEach((url, name) => {
    if (verwendet.has(url)) return;
    liste.push({ id: url, titel: name, gruppe: "Sonstiges", url, dateiname: "" });
  });
  return liste;
}

/** Die Unterlagen nach Gruppe zusammenfassen, in der Reihenfolge ihres ersten Auftretens. */
export function investagonNachGruppe(liste: InvestagonUnterlage[]): Array<[string, InvestagonUnterlage[]]> {
  const gruppen = new Map<string, InvestagonUnterlage[]>();
  liste.forEach(u => {
    const vorhanden = gruppen.get(u.gruppe);
    if (vorhanden) vorhanden.push(u);
    else gruppen.set(u.gruppe, [u]);
  });
  return [...gruppen.entries()];
}

export default function ObjektDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "objekt_dokumente"]);
  const objekteReady = useCacheReady(["objekte"]);
  const wohnungenReady = useCacheReady(["wohnungen"]);

  const [objekt, setObjekt] = useState<ObjektData | undefined>(() => getObjektById(id || ""));
  // Objektpartner nur am eigenen Objekt, dieselbe Regel wie die Datenbank (30.09.2026).
  const isEditor = canEdit(user.role) && darfObjektBearbeiten(user.role, objekt, authUser?.id);
  const [zipLaeuft, setZipLaeuft] = useState(false);
  // Synchronous state sync: update objekt during render (not after) to avoid flash of "Keine Wohnungen"
  const [prevSyncKey, setPrevSyncKey] = useState(`${id}-${liveVersion}`);
  const syncKey = `${id}-${liveVersion}`;
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    const fresh = getObjektById(id || "");
    if (fresh) setObjekt(fresh);
  }
  const [showEdit, setShowEdit] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  
  const [showSteuerTool, setShowSteuerTool] = useState(false);
  const [exklusivInput, setExklusivInput] = useState("");
  const [showAddWohnung, setShowAddWohnung] = useState(false);
  const [showEditWohnung, setShowEditWohnung] = useState<ObjektWohnung | null>(null);
  const [showKundenAnsicht, setShowKundenAnsicht] = useState(false);
  const [selectedWohnung, setSelectedWohnung] = useState<ObjektWohnung | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [savingTitelbild, setSavingTitelbild] = useState(false);

  const [wImgIdx, setWImgIdx] = useState(0);
  const [reservierungWohnung, setReservierungWohnung] = useState<string | null>(null);
  /*
    Objektscore (04.10.2026): Diese Verwaltungsansicht ist die Objektseite des
    Vertriebspartners. Bei freien Einheiten steht deshalb, welche seiner
    eigenen Kunden passen (Admin, Inhaber, Vertriebsleitung: alle). Nur Anzeige.
  */
  const passendeKunden = usePassendeKunden(objekt);
  const [justSetWohnungId, setJustSetWohnungId] = useState<string | null>(null);
  const [showAddWohnungDoc, setShowAddWohnungDoc] = useState(false);
  const [newWohnungDoc, setNewWohnungDoc] = useState({ name: "", url: "" });
  const [wohnungImgUrl, setWohnungImgUrl] = useState("");
  const [showGallery, setShowGallery] = useState<{ title: string; objektBilder?: boolean; images: { url: string; alt: string; originalUrl?: string }[] } | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [showExposeDialog, setShowExposeDialog] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [exposeInclWohnungen, setExposeInclWohnungen] = useState(true);
  const [exposePdfUrl, setExposePdfUrl] = useState<string | null>(null);
  const [exposeLoading, setExposeLoading] = useState<boolean>(false);
  const [zuweisungWohnung, setZuweisungWohnung] = useState<ObjektWohnung | null>(null);
  const [zuweisungNutzer, setZuweisungNutzer] = useState<string[]>([]);
  const [zuweisungSearch, setZuweisungSearch] = useState("");
  const [bulkExposeGenerating, setBulkExposeGenerating] = useState(false);
  const [whgSortField, setWhgSortField] = useState("weNr");
  const [whgSortDir, setWhgSortDir] = useState<"asc" | "desc">("asc");
  const [whgSearch, setWhgSearch] = useState("");
  const [einzelWohnungFallbackDone, setEinzelWohnungFallbackDone] = useState(false);

  const toggleWhgSort = (field: string) => {
    if (whgSortField === field) setWhgSortDir(d => d === "asc" ? "desc" : "asc");
    else { setWhgSortField(field); setWhgSortDir("asc"); }
  };
  const WhgSortIcon = ({ field }: { field: string }) => {
    if (whgSortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return whgSortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const [ef, setEf] = useState<Partial<ObjektData>>(() => {
    const o = getObjektById(id || "");
    return o ? { titel: o.titel, plz: o.plz, ort: o.ort, adresse: o.adresse, badge: o.badge, bildUrl: o.bildUrl, videoUrl: o.videoUrl, groesseVon: o.groesseVon, groesseBis: o.groesseBis, preisVon: o.preisVon, preisBis: o.preisBis, renditeVon: o.renditeVon, renditeBis: o.renditeBis, beschreibung: o.beschreibung, exklusivPartner: o.exklusivPartner || [] } : {};
  });
  const [newDoc, setNewDoc] = useState({ name: "", url: "", kategorie: "objektunterlagen" as "objektunterlagen" | "intern" });
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);
  const [nw, setNw] = useState<Partial<ObjektWohnung>>({ weNr: "", etage: "EG", lage: "rechts", groesse: 0, zimmer: 2, mieteGesamt: 0, vkGesamt: 0, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" });
  const [ew, setEw] = useState<Partial<ObjektWohnung>>({});
  const [newHighlight, setNewHighlight] = useState("");
  const [wohnungMode, setWohnungMode] = useState<"gleich" | "einzeln">("einzeln");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkData, setBulkData] = useState({ etage: "EG", lage: "rechts", groesse: 40, zimmer: 2, miete: 600, vk: 200000, rendite: 3.3 });

  // Get kundeId from URL params (when navigating from KundenDetail)
  const kundeIdFromUrl = searchParams.get("kundeId");
  const kundeNameFromUrl = searchParams.get("kundeName");
  const investmentIdFromUrl = searchParams.get("investmentId");

  // Einzelwohnungs-Modus: Objektseite überspringen und direkt zur Wohnungsseite
  useEffect(() => {
    if (!id || !objekt || !wohnungenReady) return;
    const isEinzel = !!((objekt.meta as any)?.einzelwohnung);
    if (!isEinzel) return;
    if (objekt.wohnungen.length !== 1) return;
    // Nicht redirecten, wenn aus Kundenkontext mit Reservierungs-Flow gekommen
    navigate(`/objekte/${id}/wohnung/${objekt.wohnungen[0].id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`, { replace: true });
  }, [id, objekt, wohnungenReady, navigate, searchParams]);

  useEffect(() => {
    setEinzelWohnungFallbackDone(false);
  }, [id]);

  useEffect(() => {
    if (!id || !objekt || !wohnungenReady) return;
    const isEinzel = !!((objekt.meta as any)?.einzelwohnung);
    if (!isEinzel || objekt.wohnungen.length > 0 || einzelWohnungFallbackDone) return;
    const db = supabase as any;
    db.from("wohnungen").select("*").eq("objekt_id", id).then(async ({ data }: any) => {
      if (data && data.length > 0) {
        const existingWohnungen = cacheGet("wohnungen") || [];
        const wohnungIds = new Set(existingWohnungen.map((w: any) => w.id));
        cacheSet("wohnungen", [...existingWohnungen, ...data.filter((w: any) => !wohnungIds.has(w.id))]);

        const { data: bildRows } = await db.from("wohnungs_bilder").select("*").in("wohnung_id", data.map((w: any) => w.id));
        if (bildRows && bildRows.length > 0) {
          const existingBilder = cacheGet("wohnungs_bilder") || [];
          const bildIds = new Set(existingBilder.map((b: any) => b.id));
          cacheSet("wohnungs_bilder", [...existingBilder, ...bildRows.filter((b: any) => !bildIds.has(b.id))]);
        }
        setObjekt(getObjektById(id));
      }
      setEinzelWohnungFallbackDone(true);
    });
  }, [id, objekt, wohnungenReady, einzelWohnungFallbackDone]);

  const isBrokenEinzelwohnung = !!((objekt?.meta as any)?.einzelwohnung) && wohnungenReady && einzelWohnungFallbackDone && (objekt?.wohnungen.length || 0) !== 1;
  const shouldWaitForEinzelwohnung = !!((objekt?.meta as any)?.einzelwohnung) && wohnungenReady && !einzelWohnungFallbackDone && (objekt?.wohnungen.length || 0) !== 1;

  const reload = () => setObjekt(getObjektById(id || ""));

  // Auto-Sync: Wohnung-Status mit Investment-Pipelinestufe abgleichen.
  // Wenn ein Investment auf eine Wohnung verweist, aber die Wohnung noch
  // als „frei" markiert ist, wird sie automatisch auf „reserviert"
  // (bzw. „verkauft" bei abgeschlossen) gesetzt — damit die
  // Wohnungsübersicht immer die echte Belegung zeigt.
  //
  // Seit dem 23.09.2026 auf der Stufe „Reservierung“ nur noch mit
  // wirksamer, also unterschriebener Reservierung. Die Stufe setzt schon das
  // Absenden der Vereinbarung; bis zur Unterschrift bleibt die Einheit frei
  // (siehe `rvWirksamAusMeta`). `reserveWohnung` prüft außerdem selbst, ob die
  // Einheit noch frei ist, und überschreibt keinen anderen Kunden.
  useEffect(() => {
    if (!objekt || !id || !wohnungenReady) return;
    const reservedStages = new Set(["reservierung", "finanzierung", "notar", "faelligkeit", "abrechnung"]);
    const allInv = getInvestments().filter(inv => inv.objektId === id && inv.wohnungId);
    (async () => {
      for (const inv of allInv) {
        const w = objekt.wohnungen.find(x => x.id === inv.wohnungId);
        if (!w) continue;
        const brauchtAbgleich =
          (inv.pipelineStufe === "abgeschlossen" && w.status !== "verkauft")
          || (reservedStages.has(inv.pipelineStufe) && w.status === "frei");
        if (!brauchtAbgleich) continue;
        // Seit dem 30.09.2026 entscheidet die Datenbank aus dem gespeicherten
        // Investment; der Browser schreibt nicht mehr selbst in `wohnungen`.
        // Nur ohne die Migration gilt noch der Weg darunter.
        if (await gleicheEinheitMitInvestmentAb(inv.id) === "erledigt") continue;
        const k = getKontaktById(inv.kontaktId);
        const kName = k ? `${k.vorname || ""} ${k.nachname || ""}`.trim() : (w.kundeName || "");
        const beraterName = k?.berater;
        if (inv.pipelineStufe === "abgeschlossen" && w.status !== "verkauft") {
          await updateWohnung(id, w.id, { status: "verkauft", kundeId: inv.kontaktId, kundeName: kName, ...(beraterName ? { beraterName } : {}) });
        } else if (
          reservedStages.has(inv.pipelineStufe) && w.status === "frei"
          && (inv.pipelineStufe !== "reservierung" || reservierungIstWirksam(inv.id))
        ) {
          try {
            await reserveWohnung(id, w.id, inv.kontaktId, kName, beraterName);
          } catch (fehler) {
            // Vergeben oder abgelehnt: nichts erzwingen, nur vermerken.
            console.warn(`Abgleich: Einheit ${w.weNr} nicht auf reserviert gesetzt:`, fehler);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wohnungenReady, liveVersion]);

  // Unterlage ablegen. Der Eimer ergibt sich aus dem Pfad: Unterlagen liegen
  // geschuetzt, gespeichert wird dann ein Zeiger statt einer festen Adresse.
  const uploadDocToStorage = async (file: File, docName: string): Promise<string | null> => {
    if (!id) return null;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9äöüÄÖÜß._\-]/g, "_");
      const docId = docName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const storagePath = `objekte/${id}/dokumente/${docId}_${safeName}`;
      return await objektDateiAblegen(storagePath, file, file.type || "application/pdf");
    } catch (err) {
      console.error("Upload failed:", err);
      return null;
    }
  };

  const saveExposePdf = async (fileName: string, file: Blob) => {
    if (!id) throw new Error("Objekt-ID fehlt");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session?.access_token) throw new Error("Sitzung abgelaufen – bitte neu anmelden und erneut versuchen.");

    const form = new FormData();
    form.append("objektId", id);
    form.append("fileName", fileName);
    form.append("file", file, fileName.split("/").pop() || "expose.pdf");

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-expose-pdf`, {
      method: "POST",
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${sess.session.access_token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) throw new Error(body?.error || "Exposé konnte nicht gespeichert werden");
    return body as { url: string; lastGenerated: string };
  };

  // liveVersion sync is handled synchronously above (prevSyncKey pattern)

  // Fetch objekt_bilder and objekt_dokumente from DB if not in cache yet
  useEffect(() => {
    if (!id) return;
    const obj = getObjektById(id);
    const db = supabase as any;

    // Bilder fallback
    if (obj && obj.bilder.length === 0) {
      db.from("objekt_bilder").select("*").eq("objekt_id", id).then(({ data }: any) => {
        if (data && data.length > 0) {
          const existing = cacheGet("objekt_bilder") || [];
          const ids = new Set(existing.map((b: any) => b.id));
          const merged = [...existing, ...data.filter((b: any) => !ids.has(b.id))];
          cacheSet("objekt_bilder", merged);
          setObjekt(getObjektById(id));
        }
      });
    }

    // Dokumente fallback – always fetch for this objekt to ensure custom docs are loaded
    const cachedDoks = cacheGet("objekt_dokumente").filter((d: any) => d.objekt_id === id);
    if (obj && cachedDoks.length === 0) {
      db.from("objekt_dokumente").select("*").eq("objekt_id", id).then(({ data }: any) => {
        if (data && data.length > 0) {
          const existing = cacheGet("objekt_dokumente") || [];
          const ids = new Set(existing.map((d: any) => d.id));
          const merged = [...existing, ...data.filter((d: any) => !ids.has(d.id))];
          cacheSet("objekt_dokumente", merged);
          setObjekt(getObjektById(id));
        }
      });
    }
  }, [id]);

  // removed checkAndExpireGesetzte

  if (!objekt || shouldWaitForEinzelwohnung || isBrokenEinzelwohnung) {
    if (!objekteReady) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Objektdaten werden geladen…</p>
          </div>
        </DashboardLayout>
      );
    }
    if (shouldWaitForEinzelwohnung) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Einzelwohnung wird geladen…</p>
          </div>
        </DashboardLayout>
      );
    }
    if (isBrokenEinzelwohnung) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-muted-foreground">Diese Einzelwohnung hat noch keine gespeicherte Wohneinheit.</p>
            <Button variant="outline" onClick={() => navigate(`/objekte/${id}/bearbeiten`)}>Objekt bearbeiten</Button>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Objekt nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate("/objekte")}>Zurück zu Objekte</Button>
        </div>
      </DashboardLayout>
    );
  }

  // Objektpartner dürfen nur eigene Objekte sehen
  if (user.role === "objektpartner") {
    const ownerId = objekt.erstellt_von || (objekt as any).meta?.erstelltVon;
    if (!ownerId || (authUser?.id && ownerId !== authUser.id)) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-muted-foreground">Du hast keinen Zugriff auf dieses Objekt.</p>
            <Button variant="outline" onClick={() => navigate("/objekte")}>Zurück zu Objekte</Button>
          </div>
        </DashboardLayout>
      );
    }
  }

  // Merge existing docs with standard categories so all buttons always show
  const objektUnterlagen = (() => {
    // Dateien aus Investagon stehen in ihrer eigenen Karte darunter, nicht als Knopf.
    const existing = objekt.dokumente.filter(d => d.kategorie === "objektunterlagen" && !(d.url || "").startsWith(INVESTAGON_ZEIGER));
    const defaults = defaultDokumente();
    const merged = [...defaults];
    // Replace defaults with existing docs that match by name
    existing.forEach(doc => {
      const idx = merged.findIndex(m => m.name === doc.name);
      if (idx >= 0) merged[idx] = doc;
      else merged.push(doc); // custom docs
    });
    return merged;
  })();
  // Die Unterlagen aus Investagon haben eine eigene Karte. Aus der Knopfreihe
  // "Interne Unterlagen / Tools" bleiben sie deshalb draussen: Dort gehoeren
  // Werkzeuge hin, und dreissig PDF-Knoepfe machen die Reihe unlesbar.
  const investagonListe = investagonUnterlagen(objekt);
  const investagonGruppen = investagonNachGruppe(investagonListe);
  const interneDokumente = objekt.dokumente.filter(
    d => d.kategorie === "intern" && !(d.url || "").startsWith(INVESTAGON_ZEIGER),
  );
  const saveTitelbild = async (url: string) => {
    if (!id || !isEditor || !url || savingTitelbild) return;
    setSavingTitelbild(true);
    try {
      await setObjektTitelbild(id, url);
      setObjekt(current => current ? { ...current, bildUrl: url } : current);
      sonnerToast.success("Titelbild für die Objektübersicht gespeichert");
    } catch {
      sonnerToast.error("Titelbild konnte nicht gespeichert werden. Bitte erneut versuchen.");
    } finally {
      setSavingTitelbild(false);
    }
  };
  /** Stern zum Festlegen des Bildes, das in der Objektübersicht erscheint. */
  const titelbildButton = (url?: string) => {
    if (!isEditor || !url) return null;
    const selected = resolveImageUrl(objekt.bildUrl) === resolveImageUrl(url);
    const label = selected ? "Aktuelles Titelbild der Objektübersicht" : "Als Titelbild in der Objektübersicht verwenden";
    return (
      <button type="button" onClick={() => saveTitelbild(url)}
        disabled={savingTitelbild || selected} aria-pressed={selected} aria-label={label} title={label}
        data-no-min
        className="absolute top-3 left-3 z-10 flex h-[40px] w-[40px] items-center justify-center rounded-full bg-background/90 shadow hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default">
        {savingTitelbild
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Star className={`h-4 w-4 ${selected ? "fill-primary text-primary" : "text-muted-foreground"}`} />}
      </button>
    );
  };

  const images = objekt.bilder.length > 0 ? objekt.bilder : (objekt.bildUrl ? [{ id: "main", url: objekt.bildUrl, alt: objekt.titel, reihenfolge: 0 }] : []);
  const wohnungenColSpan = 13 + (objekt.sanierungskosten ? 1 : 0) + (isEditor ? 2 : 0);

  const handleSaveEdit = async () => {
    if (!id) return;
    const { exklusivPartner, ...rest } = ef as any;
    const ep = Array.isArray(exklusivPartner) && exklusivPartner.length > 0 ? exklusivPartner : undefined;
    const saved = await saveObjekt({ ...objekt, ...rest, exklusivPartner: ep } as ObjektData);
    if (!saved) {
      toast({ title: "Fehler beim Speichern", description: getLastObjektSaveError() || undefined, variant: "destructive" });
      return;
    }
    reload();
    setShowEdit(false);
    toast({ title: "Objekt aktualisiert ✓" });
    // Was bewusst nicht übernommen wurde, etwa eine reservierte Einheit, die bleibt.
    const hinweise = getLastObjektSaveHinweise();
    if (hinweise.length > 0) void hinweisDialog({ title: "Nicht alles wurde übernommen", description: hinweise.join("\n\n") });
  };

  const handleAddDoc = () => {
    if (!id || !newDoc.name.trim()) return;
    const docName = newDoc.name.trim();
    const docUrl = newDoc.url.trim();
    // If we have a pending file, upload to storage first
    if (pendingDocFile) {
      setUploadingDocId("new-doc");
      uploadDocToStorage(pendingDocFile, docName).then(async url => {
        if (url) {
          const ok = await addDokument(id, { id: crypto.randomUUID(), name: docName, url, typ: "custom", kategorie: newDoc.kategorie, sichtbar: true });
          setUploadingDocId(null);
          if (ok) {
            reload();
            setShowAddDoc(false);
            setNewDoc({ name: "", url: "", kategorie: "objektunterlagen" });
            setPendingDocFile(null);
            toast({ title: "Dokument hinzugefügt ✓" });
          } else {
            toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
          }
        } else {
          setUploadingDocId(null);
          toast({ title: "Upload fehlgeschlagen", variant: "destructive" });
        }
      });
    } else {
      addDokument(id, { id: crypto.randomUUID(), name: docName, url: docUrl, typ: "custom", kategorie: newDoc.kategorie, sichtbar: true }).then(ok => {
        reload();
        setShowAddDoc(false);
        setNewDoc({ name: "", url: "", kategorie: "objektunterlagen" });
        toast({ title: ok ? "Dokument hinzugefügt ✓" : "Speichern fehlgeschlagen", variant: ok ? undefined : "destructive" });
      });
    }
  };

  const handleDeleteDoc = async (dokId: string) => { if (!id) return; await removeDokument(id, dokId); reload(); };
  /** Schreibt ein Objektfeld und nimmt die Anzeige bei einer Ablehnung zurück. */
  const objektFeldSpeichern = async (felder: Record<string, unknown>, vorher: Partial<ObjektData>): Promise<boolean> => {
    try {
      await updateObjektFieldFast(id!, felder);
      return true;
    } catch (e) {
      setObjekt(prev => prev ? { ...prev, ...vorher } : prev);
      toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return false;
    }
  };
  const handleToggleVideo = async () => {
    if (!id) return;
    const newVal = !objekt.videoSichtbar;
    setObjekt(prev => prev ? { ...prev, videoSichtbar: newVal } : prev);
    await objektFeldSpeichern({ video_sichtbar: newVal }, { videoSichtbar: !newVal });
  };
  const handleToggleSichtbar = async () => {
    if (!id) return;
    const newVal = !objekt.sichtbar;
    setObjekt(prev => prev ? { ...prev, sichtbar: newVal } : prev);
    await objektFeldSpeichern({ sichtbar: newVal }, { sichtbar: !newVal });
  };

  const handleFreigabe = async () => {
    if (!id) return;
    const vorher = { status: objekt.status, sichtbar: objekt.sichtbar };
    setObjekt(prev => prev ? { ...prev, status: "freigegeben", sichtbar: true } : prev);
    if (!(await objektFeldSpeichern({ status: "freigegeben", sichtbar: true }, vorher))) return;
    toast({ title: "Objekt freigegeben ✓", description: `„${objekt.titel}" ist jetzt sichtbar und für den Vertrieb verfügbar.` });
  };

  const handleAddHighlight = () => {
    if (!newHighlight.trim() || !id) return;
    updateObjektField(id, { highlights: [...objekt.highlights, newHighlight.trim()] });
    setNewHighlight("");
    reload();
  };

  const handleRemoveHighlight = (idx: number) => {
    if (!id) return;
    const h = [...objekt.highlights]; h.splice(idx, 1);
    updateObjektField(id, { highlights: h });
    reload();
  };

  const handleAddWohnung = () => {
    if (!id) return;
    if (wohnungMode === "gleich") {
      const newWohnungen = [...objekt.wohnungen];
      const startNum = objekt.wohnungen.length + 1;
      for (let i = 0; i < bulkCount; i++) {
        const num = startNum + i;
        const house = Math.ceil(num / 9);
        newWohnungen.push({
          id: `${id}-w${Date.now()}-${i}`, weNr: `${num} / Haus ${house}`,
          etage: bulkData.etage, lage: bulkData.lage, groesse: bulkData.groesse,
          zimmer: bulkData.zimmer, mieteGesamt: bulkData.miete, vkGesamt: bulkData.vk,
          qmPreis: bulkData.groesse > 0 ? parseFloat((bulkData.vk / bulkData.groesse).toFixed(2)) : 0,
          rendite: bulkData.rendite, vermietet: true, status: "frei",
        });
      }
      saveObjekt({ ...objekt, wohnungen: newWohnungen });
      reload();
      setShowAddWohnung(false);
      toast({ title: `${bulkCount} Wohnungen hinzugefügt ✓` });
    } else {
      if (!nw.weNr) return;
      const w: ObjektWohnung = {
        id: `${id}-w${Date.now()}`, weNr: nw.weNr || "", etage: nw.etage || "EG",
        lage: nw.lage || "rechts", groesse: nw.groesse || 0, zimmer: nw.zimmer || 2,
        mieteGesamt: nw.mieteGesamt || 0, vkGesamt: nw.vkGesamt || 0,
        qmPreis: nw.qmPreis || 0, rendite: nw.rendite || 0, vermietet: nw.vermietet ?? true,
        status: (nw.status as ObjektWohnung["status"]) || "frei",
      };
      saveObjekt({ ...objekt, wohnungen: [...objekt.wohnungen, w] });
      reload();
      setNw({ weNr: "", etage: "EG", lage: "rechts", groesse: 0, zimmer: 2, mieteGesamt: 0, vkGesamt: 0, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" });
      toast({ title: "Wohnung hinzugefügt ✓" });
    }
  };

  const handleSaveEditWohnung = () => {
    if (!id || !showEditWohnung) return;
    updateWohnung(id, showEditWohnung.id, ew);
    reload();
    setShowEditWohnung(null);
    toast({ title: "Wohnung aktualisiert ✓" });
  };

  const handleDeleteWohnung = async (wId: string, weNr: string) => {
    if (!id) return;
    // Prüfung, Hinweis und Rückfrage: src/lib/einheitLoeschen.ts
    if (!(await einheitLoeschenMitRueckfrage(id, wId, weNr))) return;
    reload();
    toast({ title: "Wohnung entfernt" });
  };

  const handleWohnungStatusChange = (wId: string, status: ObjektWohnung["status"]) => {
    if (!id) return;
    updateWohnung(id, wId, { status });
    reload();
  };

  const handleKundeReservieren = (wId: string) => {
    if (!id || !kundeIdFromUrl) return;
    // Rollenprüfung, siehe src/lib/reservierungsRechte.ts.
    if (!darfReservieren(user.role)) {
      toast({
        title: "Reservierung nicht möglich",
        description: "Reservieren dürfen Admin, Inhaber, Vertriebsleitung und Vertriebspartner.",
        variant: "destructive",
      });
      return;
    }
    // Gate: unterschriebene Selbstauskunft oder „Kunde finanziert selbst“,
    // dieselbe Regel wie im Kundenprofil, siehe `darfReservierungStarten`.
    if (investmentIdFromUrl && !darfReservierungStarten(investmentIdFromUrl)) {
      toast({
        title: "Reservierung nicht möglich",
        description: "Zuerst muss die Selbstauskunft unterschrieben sein, oder im Kundenprofil steht der Vermerk „Kunde finanziert selbst“.",
        variant: "destructive",
      });
      return;
    }
    // Einheiten eines Globalobjekts werden nie einzeln reserviert (10.09.2026).
    if (istGlobalobjekt(objekt)) {
      toast({
        title: "Reservierung nicht möglich",
        description: "Bei einem Globalobjekt wird nur das ganze Haus reserviert, nie eine einzelne Einheit.",
        variant: "destructive",
      });
      return;
    }
    /*
     * Reserviert wird hier nicht. Das Absenden der Vereinbarung merkt die
     * Einheit 60 Minuten vor, die Unterschrift reserviert sie (Christians
     * Regeln vom 23.09.2026, siehe `vormerkeEinheit`).
     */
    /*
     * Weiter zur Reservierungsvereinbarung, nur mit Kennungen.
     *
     * Bis zum 16.09.2026 reisten hier Name, Mailadresse und Telefonnummer des
     * Kunden im Klartext mit, dazu Objekt, Wohneinheit und Kaufpreis.
     * Aufgefallen ist das an einem echten Fehlerticket an diesem Tag, in dem
     * die volle Adresse stand und damit für jeden lesbar war, der das Ticket
     * öffnet. Solche Adressen landen außerdem im Browserverlauf, in
     * Lesezeichen und in Serverprotokollen.
     *
     * Die Reservierungsseite schlägt alles selbst nach: den Kunden über
     * `kunde`, die Wohnung über `objektId` und `wohnungId`, die
     * Objektangaben über `investmentId`.
     */
    const params = new URLSearchParams({
      kunde: kundeIdFromUrl,
      wohnungId: wId,
      objektId: id,
    });
    if (investmentIdFromUrl) params.set("investmentId", investmentIdFromUrl);
    /*
     * Im selben Reiter, wie überall sonst.
     *
     * Bisher ging die Reservierungsvereinbarung von hier in einem neuen
     * Reiter auf, von der Wohnungsseite aus dagegen im selben. Dieselbe
     * Handlung verhielt sich damit je nach Startpunkt anders. Die Adresse
     * dieser Seite reist als „zurück“ mit, damit der Zurückknopf dort
     * wieder hierher führt.
     */
    params.set("zurueck", location.pathname + location.search);
    navigate(`/reservierung?${params.toString()}`);
  };

  /** Gibt zurück, ob die Datenbank das Aufheben angenommen hat. */
  const handleRemoveReservierung = async (wId: string): Promise<boolean> => {
    if (!id) return false;
    const ergebnis = await removeReservierung(id, wId);
    reload();
    if (!ergebnis.ok) {
      toast({ title: "Reservierung nicht aufgehoben", description: ergebnis.fehlerText, variant: "destructive" });
      return false;
    }
    toast({ title: "Reservierung aufgehoben" });
    return true;
  };


  /*
   * Alle Objektunterlagen als ZIP. Die Funktion stand hier schon, war aber an
   * keinen Knopf angeschlossen. Seit dem 24.09.2026 haengt sie am Knopf neben
   * "Objektunterlagen", damit auch Rollen, die die neue Objektseite nicht
   * oeffnen (etwa die Finanzierung), alles auf einmal bekommen (Christian).
   * Geladen wird ueber dieselben befristeten Adressen wie beim Einzeldownload.
   */
  const handleDownloadAll = async () => {
    if (zipLaeuft) return;
    const files = objektUnterlagen.filter(d => d.url && d.url !== "" && d.url !== "__gallery__");
    if (files.length === 0) {
      toast({ title: "Keine Dateien vorhanden" });
      return;
    }
    setZipLaeuft(true);
    toast({ title: "ZIP wird erstellt…", description: `${files.length} Dateien werden gepackt.` });
    try {
      // Geschuetzte Unterlagen haben keine feste Adresse mehr. Erst kurz vor
      // dem Packen entsteht je Datei eine befristete.
      const adressen = await befristeteDokumentAdressen(files.map((d) => ({ name: d.name, url: d.url })));
      // Wem keine Adresse zusteht, der faellt hier heraus. Das muss genauso
      // gemeldet werden wie eine Datei, die sich nicht laden liess.
      const ohneZugriff = files
        .filter((d) => !adressen.some((a) => a.name === d.name))
        .map((d) => d.name);
      const gepacktErgebnis = await ladeAlsZip(
        adressen,
        `${objekt?.titel || "Objekt"}_Unterlagen`,
      );
      const gepackt = gepacktErgebnis.gepackt;
      const fehlgeschlagen = [...ohneZugriff, ...gepacktErgebnis.fehlgeschlagen];
      // Fehlende Dateien nennen. Vorher wurden sie stillschweigend
      // uebersprungen und der Download meldete trotzdem Erfolg. Wer zehn
      // Unterlagen erwartet und vier bekommt, merkt das erst beim Kunden.
      if (fehlgeschlagen.length > 0) {
        toast({
          title: `${gepackt} von ${files.length} Dateien gepackt`,
          description: `Nicht geladen: ${fehlgeschlagen.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Download abgeschlossen ✓" });
      }
    } catch (err: any) {
      toast({ title: "Fehler beim ZIP-Erstellen", description: err.message, variant: "destructive" });
    } finally {
      setZipLaeuft(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "verkauft") return "text-destructive font-semibold";
    if (s === "reserviert") return "text-primary font-semibold";
    return "text-[hsl(var(--success))] font-semibold";
  };

  const statusLabel = (w: ObjektWohnung) => {
    const ds = getWohnungDisplayStatus(w.status, w.kundeId, false, w.id);
    return ds.label;
  };


  const prevImg = () => setImgIdx(i => (i - 1 + images.length) % images.length);
  const nextImg = () => setImgIdx(i => (i + 1) % images.length);

  // ── Wohnungsdetail Dialog ──
  const renderWohnungsDetail = () => {
    if (!selectedWohnung) return null;
    const w = selectedWohnung;
    const wDocs = w.dokumente || [];
    const wohnDocs = wDocs.filter(d => d.kategorie === "wohnungsunterlagen");
    
    const wBilder = w.bilder || [];
    const isReserviert = w.status === "reserviert";

    // Role-based customer visibility
    const isAdmin = ["admin", "inhaber", "objektpartner"].includes(user.role) && darfObjektBearbeiten(user.role, objekt, authUser?.id);
    const isPartner = !isAdmin;
    const showCustomerInfo = () => {
      if (isAdmin) return true; // Admin sees all
      if (isPartner && w.kundeId) {
        // Partner only sees own customers
        const myKundenIds = kundeIdFromUrl ? [kundeIdFromUrl] : [];
        return myKundenIds.includes(w.kundeId);
      }
      return false;
    };

    // For partners: if unit is set/reserved by someone else, show as "nicht verfügbar"
    const isOtherPartnerUnit = isPartner && isReserviert && w.kundeId && w.kundeId !== kundeIdFromUrl;

    return (
      <Dialog open={!!selectedWohnung} onOpenChange={open => { if (!open) setSelectedWohnung(null); }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            {/*
              Auch hier steht der Rückweg oben links, über dem Titel.

              Christian am 22.09.2026: Rechts in der Knopfgruppe wird er
              schlecht gefunden. Das gilt im ganzen System, also auch in
              diesem Fenster. Beide Wege bleiben erhalten, der zum Kunden und
              der zurück zum Objekt, nur eben links. Das Kreuz zum Schließen
              sitzt weiterhin oben rechts im Fenster selbst.
            */}
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {kundeIdFromUrl && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/kunden/${kundeIdFromUrl}`)}>
                  <ArrowLeft className="h-4 w-4" /> Zurück zum Kunden
                </Button>
              )}
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setSelectedWohnung(null)}>
                <ArrowLeft className="h-4 w-4" /> Zurück zum Objekt
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-[hsl(var(--warning))] rounded" />
              <DialogTitle className="text-xl">Wohneinheit {w.weNr}</DialogTitle>
            </div>
          </DialogHeader>

          <Tabs defaultValue="uebersicht" className="mt-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
            </TabsList>

            {/* ── Tab: Übersicht ── */}
            <TabsContent value="uebersicht" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left – Wohnungsinfo + Status */}
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{objekt.titel}</h3>
                      <p className="text-sm text-muted-foreground">{objekt.plz} {objekt.ort}, {objekt.adresse}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold">{w.weNr.split("/")[0]?.trim().padStart(2, "0")}</span>
                      <p className="text-xs text-muted-foreground">Wohneinheit</p>
                    </div>
                  </div>

                  {/* Image Slideshow for Wohnung */}
                  {wBilder.length > 0 ? (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden relative">
                        <LazyImage src={resolveImageUrl(wBilder[wImgIdx % wBilder.length]?.url || "")} alt={wBilder[wImgIdx % wBilder.length]?.alt || ""} className="w-full h-48 object-cover" wrapperClassName="w-full h-48" />
                        {wBilder.length > 1 && (
                          <>
                            <button onClick={() => setWImgIdx(i => (i - 1 + wBilder.length) % wBilder.length)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 hover:bg-background shadow">
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button onClick={() => setWImgIdx(i => (i + 1) % wBilder.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 hover:bg-background shadow">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <div className="absolute bottom-2 right-2 bg-background/80 rounded px-1.5 py-0.5 text-[10px] font-medium">
                              {(wImgIdx % wBilder.length) + 1} / {wBilder.length}
                            </div>
                          </>
                        )}
                      </div>
                      {wBilder.length > 1 && (
                        <div className="flex gap-1 flex-wrap">
                          {wBilder.map((img, i) => (
                            <div key={img.id} className="relative group">
                              <button onClick={() => setWImgIdx(i)} className={`w-16 h-12 rounded overflow-hidden border-2 transition-colors ${i === wImgIdx % wBilder.length ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                                <LazyImage src={resolveImageUrl(img.url)} alt={img.alt} className="w-full h-full object-cover" wrapperClassName="w-full h-full" />
                              </button>
                              {isEditor && (
                                <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100"
                                  onClick={() => { if (!id) return; removeWohnungBild(id, w.id, img.id); reload(); const updated = getObjektById(id)?.wohnungen.find(wu => wu.id === w.id); if (updated) setSelectedWohnung(updated); }}>✕</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : images.length > 0 ? (
                    <div className="rounded-lg overflow-hidden">
                      <LazyImage src={resolveImageUrl(images[0]?.url || "")} alt="" className="w-full h-48 object-cover" wrapperClassName="w-full h-48" />
                    </div>
                  ) : (
                    <div className="bg-muted rounded-lg h-48 flex items-center justify-center">
                      <Building2 className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}

                  {isEditor && (
                    <div className="flex gap-2">
                      <Input value={wohnungImgUrl} onChange={e => setWohnungImgUrl(e.target.value)} placeholder="Bild-URL einfügen..." className="h-8 text-xs flex-1" />
                      <Button size="sm" className="h-8 text-xs" onClick={() => {
                        if (!id || !wohnungImgUrl.trim()) return;
                        addWohnungBild(id, w.id, { id: `wb-${Date.now()}`, url: wohnungImgUrl.trim(), alt: `WE ${w.weNr}`, reihenfolge: wBilder.length });
                        setWohnungImgUrl(""); reload();
                        const updated = getObjektById(id)?.wohnungen.find(wu => wu.id === w.id);
                        if (updated) setSelectedWohnung(updated);
                        toast({ title: "Bild hinzugefügt ✓" });
                      }}><Plus className="h-3 w-3 mr-1" /> Bild</Button>
                    </div>
                  )}

                  {/* Details grid – Zahlen, Daten, Fakten */}
                  <ZahlenDatenFaktenGrid objekt={objekt} w={w} />

                  {/* Status – below Rendite */}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium">Status:</span>
                      {isOtherPartnerUnit ? (
                        <span className="text-destructive font-semibold">Reserviert (belegt)</span>
                      ) : (
                        <span className={statusColor(w.status)}>{statusLabel(w)}</span>
                      )}
                      {!isOtherPartnerUnit && isReserviert && w.kundeId && (() => {
                        const invs = getInvestmentsByKontakt(w.kundeId);
                        const pending = invs.some(inv => getRvSignaturePending(inv.id) && !getRvSigned(inv.id));
                        const signed = invs.some(inv => getRvSigned(inv.id));
                        if (pending) {
                          return (
                            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/15 text-[10px]">
                              Warte auf Unterschrift des Kunden
                            </Badge>
                          );
                        }
                        if (signed) {
                          return (
                            <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/15 text-[10px]">
                              RV unterschrieben
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {!isOtherPartnerUnit && isReserviert && (
                      <div>
                        <p className="text-xs text-muted-foreground">Reserviert am: {w.reserviertAm ? new Date(w.reserviertAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</p>
                        {(isAdmin || showCustomerInfo()) && <p className="text-xs text-muted-foreground">Kunde: {w.kundeName || "–"}</p>}
                        {isEditor && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-xs h-7 mt-2 text-destructive">Reservierung aufheben</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reservierung aufheben?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Soll die Reservierung für {w.kundeName || "diesen Kunden"} (VP: {w.beraterName || "–"}) wirklich aufgehoben werden? Die Wohnung wird wieder als „Frei" markiert.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => { if (await handleRemoveReservierung(w.id)) setSelectedWohnung({ ...w, status: "frei" }); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Ja, aufheben
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Right – Unterlagen */}
                <div className="space-y-6">
                  <div>
                    <div className="w-8 h-1 bg-primary mb-3" />
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold">Objektunterlagen</h4>
                      <div className="flex items-center gap-2">
                      {user.role !== "kunde" && objektUnterlagen.some(d => d.url && d.url !== "__gallery__") && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={zipLaeuft} onClick={handleDownloadAll}>
                          {zipLaeuft
                            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Wird gepackt …</>
                            : <><Download className="h-3 w-3 mr-1" /> Alle als ZIP</>}
                        </Button>
                      )}
                      {isEditor && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setNewDoc(p => ({ ...p, kategorie: "objektunterlagen" })); setShowAddDoc(true); }}>
                          <Plus className="h-3 w-3 mr-1" /> Hinzufügen
                        </Button>
                      )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {objektUnterlagen.map(dok => {
                        const hasFile = !!dok.url && dok.url !== "";
                        const isGallery = dok.url === "__gallery__";
                        const handleClick = () => {
                          if (dok.name === "Exposé" && !hasFile) {
                            // Erstellen und hinterlegen ist Pflege (30.09.2026), alle
                            // anderen öffnen das Online-Exposé zum Ansehen und Herunterladen.
                            if (isEditor) setShowExposeDialog(true);
                            else window.open(`/expose/${objekt.id}?berater=${authUser?.id || ""}`, "_blank", "noopener,noreferrer");
                            return;
                          }
                          if (isGallery) {
                            setShowGallery({ title: dok.name, images: images.map(img => ({ url: resolveImageUrl(img.url), alt: img.alt })) });
                            setGalleryIdx(0);
                          } else if (hasFile) { unterlageOeffnen(dok.url); }
                          else if (!isEditor) { toast({ title: dok.name, description: "Noch keine Datei hinterlegt." }); }
                        };
                        // Editor + leerer Slot (außer Exposé/Gallery) → Datei-Picker direkt am Button
                        if (isEditor && !hasFile && dok.name !== "Exposé" && !isGallery) {
                          return (
                            <label key={dok.id} className="cursor-pointer">
                              <Button asChild size="sm" className="bg-muted text-muted-foreground text-xs hover:bg-muted/80">
                                <span>
                                  {uploadingDocId === dok.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                                  {dok.name}
                                </span>
                              </Button>
                              <input type="file" accept=".pdf" className="hidden" onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file || !id) return;
                                setUploadingDocId(dok.id);
                                const url = await uploadDocToStorage(file, dok.name);
                                if (url) {
                                  const ok = await addDokument(id, { id: crypto.randomUUID(), name: dok.name, url, typ: dok.typ || "custom", kategorie: "objektunterlagen", sichtbar: true });
                                  setUploadingDocId(null);
                                  if (ok) {
                                    reload();
                                    toast({ title: `${dok.name} hochgeladen ✓` });
                                  } else {
                                    toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
                                  }
                                } else {
                                  setUploadingDocId(null);
                                  toast({ title: "Upload fehlgeschlagen", variant: "destructive" });
                                }
                                e.target.value = "";
                              }} />
                            </label>
                          );
                        }
                        return (
                          <Button key={dok.id} size="sm" className={hasFile ? "bg-primary text-primary-foreground text-xs" : "bg-muted text-muted-foreground text-xs"} onClick={handleClick}>
                            {dok.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Wohnungsunterlagen */}
                  <div>
                    <div className="w-8 h-1 bg-[hsl(var(--warning))] mb-3" />
                    <h4 className="font-bold mb-3">Wohnungsunterlagen</h4>
                    {(() => {
                      const wLink = (w as any).unterlagenLink as string | undefined;
                      if (wLink) {
                        return (
                          <div className="flex flex-col gap-2">
                            <Button size="sm" onClick={() => window.open(wLink, "_blank")} className="w-fit">
                              <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Wohnungsunterlagen öffnen
                            </Button>
                            <p className="text-[10px] text-muted-foreground break-all">{wLink}</p>
                          </div>
                        );
                      }
                      return <p className="text-xs text-muted-foreground italic">Noch kein Link zu den Wohnungsunterlagen hinterlegt. {isEditor ? 'Bitte über „Objekt bearbeiten" einen Link hinzufügen.' : "Wird vom Admin bereitgestellt."}</p>;
                    })()}
                    {false && (() => {
                      const docsVisible = wohnDocs.filter(dok => isEditor || (dok.url && dok.url !== ""));
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {docsVisible.map(dok => (
                            <div key={dok.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 group border border-transparent hover:border-border">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                {isEditor ? (
                                  <input
                                    className="text-sm bg-transparent border-none outline-none w-full truncate hover:text-primary focus:text-primary"
                                    defaultValue={dok.name}
                                    onBlur={e => {
                                      const newName = e.target.value.trim();
                                      if (newName && newName !== dok.name && id) {
                                        updateWohnungDokument(id, w.id, dok.id, { name: newName });
                                        reload();
                                        const updated = getObjektById(id)?.wohnungen.find(wu => wu.id === w.id);
                                        if (updated) setSelectedWohnung(updated);
                                      }
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  />
                                ) : (
                                  <span className="text-sm truncate">{dok.name}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {dok.url && dok.url !== "__gallery__" ? (
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => unterlageOeffnen(dok.url)}>
                                    <Download className="h-3 w-3" /> PDF
                                  </Button>
                                ) : dok.url === "__gallery__" ? (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                    const wImages = wBilder.map(img => ({ url: resolveImageUrl(img.url), alt: img.alt }));
                                    if (wImages.length > 0) { setShowGallery({ title: `Wohnungsbilder – WE ${w.weNr}`, images: wImages }); setGalleryIdx(0); }
                                    else { toast({ title: dok.name, description: "Noch keine Bilder hinterlegt." }); }
                                  }}>Bilder</Button>
                                ) : isEditor ? (
                                  <label className="cursor-pointer">
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 pointer-events-none text-muted-foreground">
                                      <Download className="h-3 w-3" /> PDF
                                    </Button>
                                    <input type="file" accept=".pdf" className="hidden" onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file || !id) return;
                                      const fakeUrl = URL.createObjectURL(file);
                                      updateWohnungDokument(id, w.id, dok.id, { url: fakeUrl });
                                      reload();
                                      const updated = getObjektById(id)?.wohnungen.find(wu => wu.id === w.id);
                                      if (updated) setSelectedWohnung(updated);
                                      toast({ title: `${dok.name} hochgeladen ✓` });
                                    }} />
                                  </label>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Fehlt</Badge>
                                )}
                                {isEditor && (
                                  <button className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center"
                                    onClick={e => { e.stopPropagation(); if (!id) return; removeWohnungDokument(id, w.id, dok.id); reload(); const updated = getObjektById(id)?.wohnungen.find(wu => wu.id === w.id); if (updated) setSelectedWohnung(updated); }}>
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {isEditor && (
                      <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => setShowAddWohnungDoc(true)}><Plus className="h-3 w-3 mr-1" /> Dokument hinzufügen</Button>
                    )}
                  </div>

                  {/* Interne Unterlagen / Tools */}
                  {istGlobalobjekt(objekt) && (
                    <div>
                      <h4 className="font-bold mb-3">Interne Unterlagen / Tools</h4>
                      <div className="flex flex-wrap gap-2">
                        {interneDokumente
                          .filter(dok => !dok.name.toLowerCase().includes("mischzins") && !dok.name.includes("Steuerliche Betrachtung"))
                          .map(dok => {
                            const label = dok.name.includes("Steuerliche Betrachtung") ? "Investment-Analyse" : dok.name;
                            return (
                              <Button key={dok.id} size="sm" className="bg-primary text-primary-foreground text-xs"
                                onClick={() => {
                                  if (label.includes("Investment-Analyse") || dok.name.includes("Steuerliche Betrachtung")) navigate(`/objekte/${objekt.id}/investment/${w.id}`);
                                  else if (dok.url) unterlageOeffnen(dok.url);
                                  else toast({ title: dok.name, description: "Noch keine Datei hinterlegt." });
                                }}>
                                {label}
                              </Button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  const handleBulkWohnungsExpose = async (onProgress?: (current: number, total: number) => void) => {
    if (!objekt || !id) return;

    setBulkExposeGenerating(true);
    let count = 0;
    try {
      // Seit 01.10.2026 dasselbe Exposé-PDF wie überall (Design H3, `exposeDruck`).
      const { kundenExposePdf } = await import("@/lib/kundenansichtExpose");
      for (const w of objekt.wohnungen) {
        const { blob: pdfBlob } = await kundenExposePdf(objekt, w, undefined, new Date());
        const fileName = `wohnungsexpose/${id}/${w.id}/expose-WE${(w.weNr || "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        await saveExposePdf(fileName, pdfBlob);
        count++;
        onProgress?.(count, objekt.wohnungen.length);
        sonnerToast.info(`${count}/${objekt.wohnungen.length} Exposés erstellt...`);
      }
      sonnerToast.success(`${count} Wohnungsexposés erfolgreich erstellt!`);
    } catch (err: any) {
      sonnerToast.error("Fehler: " + (err.message || "Unbekannter Fehler"));
    }
    setBulkExposeGenerating(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/*
          Die Rückwege stehen oben links, vor der Überschrift.

          Christian am 22.09.2026: Rechts in der Knopfgruppe werden sie
          schlecht gefunden. Der Rückweg liegt im ganzen System an derselben
          Stelle, Vorbild ist die `ZurueckLeiste` in `EinheitSeite`. Diese
          Seite hat zwei Wege, zum Kunden und zur Objektübersicht. Beide
          bleiben erhalten, beide stehen jetzt hier.

          `-ml-2` am Rahmen statt am einzelnen Knopf: Der erste Knopf hängt
          von der Adresse ab, so beginnt die Zeile immer bündig. `flex-wrap`,
          damit auf dem Handy nichts über den Rand läuft.
        */}
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          {kundeIdFromUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => navigate(`/kunden/${kundeIdFromUrl}`)}
            >
              <ArrowLeft className="h-4 w-4" /> Zurück zum Kunden
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/objekte")}
          >
            <ArrowLeft className="h-4 w-4" /> Zurück zur Objektliste
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">Objektseite</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Die alte Kundenansicht ist abgelöst (23.09.2026): Admin und Inhaber
                öffnen die Vorschau der Objektübersicht, Vertriebspartner bis zu
                ihrer Freigabe das Online-Exposé. Siehe `kundenansichtZiel.ts`. */}
            {["admin", "inhaber", "vertriebspartner"].includes(user.role) && (
              <a href={kundenansichtZiel({ rolle: user.role, objektId: objekt.id, investmentId: investmentIdFromUrl, beraterId: authUser?.id })} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="border-primary/50 text-primary">
                  <Eye className="h-3 w-3 mr-1" /> Kundenansicht
                </Button>
              </a>
            )}
            {["admin", "inhaber", "vertriebspartner", "objektpartner"].includes(user.role) && (
              <a href={`/expose/${objekt.id}?berater=${authUser?.id || ""}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="border-accent/50 text-accent-foreground">
                  <Globe className="h-3 w-3 mr-1" /> Online-Exposé
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Entwurf Banner */}
        {objekt.status === "entwurf" && (
          <div className="bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 text-sm px-3 py-1">
                Entwurf – Freigabe ausstehend
              </Badge>
              <span className="text-sm text-muted-foreground">Dieses Objekt wurde von einem Objektpartner eingereicht und muss geprüft werden.</span>
            </div>
            {["admin", "inhaber"].includes(user.role) && (
              <Button onClick={handleFreigabe} className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white shrink-0">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Objekt freigeben & sichtbar stellen
              </Button>
            )}
          </div>
        )}

        {/* Admin bar */}
        {isEditor && (
          <div className="flex items-center gap-4 bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              {["admin", "inhaber"].includes(user.role) && (
                <>
                  <Switch checked={objekt.sichtbar} onCheckedChange={handleToggleSichtbar} className={objekt.sichtbar ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-destructive"} />
                  <span className={`text-sm font-medium ${objekt.sichtbar ? "text-green-600" : "text-destructive"}`}>Objekt {objekt.sichtbar ? "sichtbar" : "unsichtbar (Entwurf)"}</span>
                </>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`/objekte/${objekt.id}/bearbeiten`)}>
              <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
            </Button>
            <div className="flex-1" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="h-3 w-3 mr-1" /> Objekt löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Objekt unwiderruflich löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Das Objekt <strong>„{objekt.titel}"</strong> mit allen {objekt.wohnungen.length} Wohneinheiten und zugehörigen Dokumenten wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                    // Erfolg und Wechsel zur Liste erst nach der Antwort der
                    // Datenbank. Gebundene Einheiten sperren das Löschen.
                    const ergebnis = await deleteObjekt(objekt.id);
                    if (!ergebnis.geloescht) {
                      toast({ title: "Objekt nicht gelöscht", description: ergebnis.grund ?? undefined, variant: "destructive" });
                      return;
                    }
                    toast({ title: "Objekt gelöscht", description: `„${objekt.titel}" wurde entfernt.` });
                    navigate("/objekte");
                  }}>
                    Endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Main 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left */}
          <div className="lg:col-span-3 space-y-6">
            <h2 className="text-[28px] font-semibold tracking-tight text-foreground">{objekt.titel}</h2>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">{objekt.plz} {objekt.ort}, {objekt.adresse}</p>
              <div className="flex gap-2">
                <UmgebungsKarteButton
                  address={`${objekt.adresse || ""}, ${objekt.plz || ""} ${objekt.ort || ""}`.trim()}
                  titel={objekt.titel}
                  meta={objekt.meta}
                />
              </div>
            </div>

            {/* Image Slideshow */}
            {images.length > 0 ? (
              <div className="relative rounded-lg overflow-hidden">
                {titelbildButton(images[imgIdx]?.url)}

                <LazyImage
                  src={resolveImageUrl(images[imgIdx]?.url || "")}
                  alt={images[imgIdx]?.alt || ""}
                  className="w-full h-full object-cover"
                  // Auf dem Handy im Fotoformat 4:3: 28rem Höhe schnitten dort vom Querformat die Seiten ab.
                  wrapperClassName="w-full aspect-[4/3] sm:aspect-auto sm:h-[28rem]"
                />
                {images.length > 1 && (
                  <>
                    <button onClick={prevImg} data-no-min aria-label="Vorheriges Bild" className="absolute left-2 top-1/2 -translate-y-1/2 flex h-[40px] w-[40px] items-center justify-center bg-background/80 rounded-full hover:bg-background shadow">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={nextImg} data-no-min aria-label="Nächstes Bild" className="absolute right-2 top-1/2 -translate-y-1/2 flex h-[40px] w-[40px] items-center justify-center bg-background/80 rounded-full hover:bg-background shadow">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {images.map((_, i) => (
                        <button key={i} onClick={() => setImgIdx(i)}
                          className={`w-2.5 h-2.5 rounded-full transition-colors ${i === imgIdx ? "bg-primary" : "bg-background/60 border border-background"}`} />
                      ))}
                    </div>
                    <button onClick={() => { setShowGallery({ title: "Objektbilder", objektBilder: true, images: images.map(img => ({ url: resolveImageUrl(img.url), originalUrl: img.url, alt: img.alt || "" })) }); setGalleryIdx(imgIdx); }}
                      data-no-min aria-label="Vergrößern"
                      className="absolute top-3 right-3 flex h-[40px] w-[40px] items-center justify-center bg-background/80 rounded-full hover:bg-background shadow" title="Vergrößern">
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  </>
                )}
                {images.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {images.map((img, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`w-16 h-12 rounded overflow-hidden border-2 transition-colors ${i === imgIdx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                        <LazyImage src={resolveImageUrl(img.url)} alt={img.alt} className="w-full h-full object-cover" wrapperClassName="w-full h-full" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-muted rounded-lg h-[28rem] flex items-center justify-center">
                <Building2 className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}

            {/* Highlights */}
            {((objekt.highlights?.length ?? 0) > 0 || isEditor) && (
              <Card className="p-6">
                <div className="w-8 h-1 bg-primary mb-3" />
                <h3 className="font-bold mb-4">Highlights</h3>
                <ul className="space-y-1.5 text-sm">
                  {(objekt.highlights || []).map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span><span className="flex-1">{h}</span>
                      {isEditor && <button className="text-destructive/50 hover:text-destructive text-xs" onClick={() => handleRemoveHighlight(i)}>✕</button>}
                    </li>
                  ))}
                </ul>
                {isEditor && (
                  <div className="flex gap-2 mt-3">
                    <Input value={newHighlight} onChange={e => setNewHighlight(e.target.value)} placeholder="Neues Highlight..." className="h-[40px] text-xs sm:h-7" onKeyDown={e => e.key === "Enter" && handleAddHighlight()} />
                    <Button size="sm" className="h-[40px] min-w-[40px] text-xs sm:h-7 sm:min-w-0" onClick={handleAddHighlight}>+</Button>
                  </div>
                )}
              </Card>
            )}

            {/* Description */}

            {/* Gliederung siehe Objektbeschreibung: derselbe Text, aber in
                Abschnitte zerlegt statt als Textwand. */}
            <Objektbeschreibung text={objekt.beschreibung} />

          </div>

          {/* Right */}
          <div className="lg:col-span-2 space-y-6">
            {/* Objektunterlagen */}
            <Card className="p-6">
              <div className="w-8 h-1 bg-primary mb-3" />
              <h3 className="font-bold mb-4">Objektunterlagen</h3>
              {(() => {
                const link = (objekt as any)?.meta?.unterlagenLink as string | undefined;
                if (link) {
                  return (
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => window.open(link, "_blank")} className="w-full sm:w-auto">
                        <FolderOpen className="h-4 w-4 mr-2" /> Objektunterlagen öffnen
                      </Button>
                      <p className="text-[11px] text-muted-foreground break-all">{link}</p>
                    </div>
                  );
                }
                return (
                  <p className="text-xs text-muted-foreground italic">
                    Noch kein Link zu den Objektunterlagen hinterlegt. {isEditor ? 'Bitte über „Objekt bearbeiten" einen Link hinzufügen.' : "Wird vom Admin bereitgestellt."}
                  </p>
                );
              })()}
            </Card>

            {/* Unterlagen aus Investagon */}
            {investagonListe.length > 0 && (
              <Card className="p-6">
                <div className="w-8 h-1 bg-primary mb-3" />
                <h3 className="font-bold">Unterlagen aus Investagon ({investagonListe.length})</h3>
                <p className="mt-1 mb-4 text-xs text-muted-foreground">
                  Diese Dateien kommen mit dem Objekt aus Investagon. Sie sind nur im CRM sichtbar und erscheinen nicht im Exposé.
                </p>
                <div className="space-y-4">
                  {investagonGruppen.map(([gruppe, eintraege]) => (
                    <div key={gruppe}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{gruppe}</h4>
                      <div className="divide-y divide-border/60">
                        {eintraege.map(u => (
                          <div key={u.id} className="flex items-center gap-3 py-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate" title={u.dateiname || u.titel}>{u.titel}</span>
                            {/* Kein Knopf ohne Adresse: Ein Knopf, der verlaesslich nichts tut, ist schlimmer als kein Knopf. */}
                            {u.url ? (
                              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => unterlageOeffnen(u.url)}>
                                <ExternalLink className="h-3.5 w-3.5" /> Ansehen
                              </Button>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">Keine Datei hinterlegt</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Interne Unterlagen / Tools. Der Knopf zur alten Kalkulation ist
                entfernt (30.09.2026); ohne Unterlagen und ohne Bearbeitungsrecht
                bleibt der Kasten weg statt leer zu stehen. */}
            {istGlobalobjekt(objekt) && (isEditor || interneDokumente.some(dok => !dok.name.toLowerCase().includes("mischzins") && !dok.name.includes("Steuerliche Betrachtung"))) && (
              <Card className="p-6">
                <h4 className="font-bold mb-3">Interne Unterlagen / Tools</h4>
                <div className="flex flex-wrap gap-2">
                  {interneDokumente
                    .filter(dok => !dok.name.toLowerCase().includes("mischzins") && !dok.name.includes("Steuerliche Betrachtung"))
                    .map(dok => {
                      const label = dok.name.includes("Steuerliche Betrachtung") ? "Investment-Analyse" : dok.name;
                      return (
                        <div key={dok.id} className="relative group">
                          <Button size="sm" className="bg-primary text-primary-foreground text-xs"
                            onClick={() => {
                              if (label.includes("Investment-Analyse") || dok.name.includes("Steuerliche Betrachtung")) navigate(`/objekte/${objekt.id}/investment`);
                              else if (dok.url) unterlageOeffnen(dok.url);
                              else toast({ title: dok.name, description: "Noch keine Datei hinterlegt." });
                            }}>
                            {label}
                          </Button>
                          {isEditor && dok.typ === "custom" && (
                            <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleDeleteDoc(dok.id); }}>✕</button>
                          )}
                        </div>
                      );
                    })}
                </div>
                {isEditor && <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => { setNewDoc(p => ({ ...p, kategorie: "intern" })); setShowAddDoc(true); }}><Plus className="h-3 w-3 mr-1" /> Dokument hinzufügen</Button>}
              </Card>
            )}

            {/* Cloud-Ordner Link - nur anzeigen wenn hinterlegt */}
            {objekt.cloudOrdnerUrl && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm">Cloud-Ordner</h4>
                </div>
                <a
                  href={objekt.cloudOrdnerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline break-all"
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{objekt.cloudOrdnerUrl}</span>
                </a>
              </Card>
            )}

            {/* Rücklage WEG - nur anzeigen wenn hinterlegt */}
            {/* Rücklage WEG & Garantierte Erstvermietung Badges wurden entfernt — Werte werden weiterhin in Berechnungen verwendet. */}

          </div>
        </div>

        {/* Wohnungen Table */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold">Wohnungsübersicht ({wohnungenReady ? objekt.wohnungen.length : "…"})</h3>
              {passendeKunden && (
                <Badge className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10" data-testid="passende-kunden-zaehler">
                  {passendeKunden.kundenMitTreffer === 1 ? "Für 1 Kunden passt mindestens eine Einheit" : `Für ${passendeKunden.kundenMitTreffer} Kunden passt mindestens eine Einheit`}
                </Badge>
              )}
              {(() => {
                const wge = (objekt.globalDaten as any)?.wohneinheitenGesamt || 0;
                if (wge > 0 && wge > objekt.wohnungen.length) {
                  return <Badge variant="outline" className="text-[10px]">{objekt.wohnungen.length} von {wge} Einheiten im Vertrieb</Badge>;
                }
                return null;
              })()}
            </div>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-8 text-sm" placeholder="Wohnungen filtern..." value={whgSearch} onChange={e => setWhgSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    { key: "weNr", label: "WE-Nr." },
                    { key: "etage", label: "Etage" },
                    { key: "lage", label: "Lage" },
                    { key: "bilder", label: "Bilder" },
                    { key: "groesse", label: "Größe" },
                    { key: "zimmer", label: "Zimmer" },
                    { key: "mieteGesamt", label: "Miete" },
                    { key: "vkGesamt", label: "VK" },
                    { key: "rendite", label: "Rendite" },
                    { key: "hausgeld", label: "Hausgeld" },
                  ].map(col => (
                    <TableHead key={col.key} className="cursor-pointer select-none" onClick={() => toggleWhgSort(col.key)}>
                      <span className="flex items-center gap-1 text-xs">{col.label} <WhgSortIcon field={col.key} /></span>
                    </TableHead>
                  ))}
                  {objekt.sanierungskosten ? <TableHead className="cursor-pointer select-none" onClick={() => toggleWhgSort("sanierung")}><span className="flex items-center gap-1 text-xs">Sanierung <WhgSortIcon field="sanierung" /></span></TableHead> : null}
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleWhgSort("vermietet")}><span className="flex items-center gap-1 text-xs">Vermietet <WhgSortIcon field="vermietet" /></span></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleWhgSort("status")}><span className="flex items-center gap-1 text-xs">Status <WhgSortIcon field="status" /></span></TableHead>
                  {isEditor && <TableHead className="cursor-pointer select-none" onClick={() => toggleWhgSort("kundeName")}><span className="flex items-center gap-1 text-xs">Kunde <WhgSortIcon field="kundeName" /></span></TableHead>}
                  <TableHead>Aktion</TableHead>
                  {isEditor && <TableHead className="text-right">Bearbeiten</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const q = whgSearch.toLowerCase();
                  // VPs sehen exklusiv zugewiesene Wohnungen nur, wenn sie selbst zugewiesen sind.
                  // Admin/Inhaber/Editor sehen immer alle Wohnungen.
                  const visibleWohnungen = isEditor
                    ? objekt.wohnungen
                    : objekt.wohnungen.filter(w =>
                        !w.exklusivNutzer || w.exklusivNutzer.length === 0 || (authUser?.id && w.exklusivNutzer.includes(authUser.id))
                      );
                  const filtered = q ? visibleWohnungen.filter(w =>
                    w.weNr.toLowerCase().includes(q) || w.etage.toLowerCase().includes(q) ||
                    w.lage.toLowerCase().includes(q) || w.status.toLowerCase().includes(q) ||
                    (w.kundeName || "").toLowerCase().includes(q)
                  ) : visibleWohnungen;
                  return [...filtered].sort((a, b) => {
                    let aVal: string | number = "";
                    let bVal: string | number = "";
                    const totalVk = objekt.wohnungen.reduce((s, wu) => s + wu.vkGesamt, 0);
                    switch (whgSortField) {
                      case "weNr": {
                        const nA = parseFloat(a.weNr), nB = parseFloat(b.weNr);
                        if (!isNaN(nA) && !isNaN(nB)) { aVal = nA; bVal = nB; break; }
                        aVal = a.weNr; bVal = b.weNr; break;
                      }
                      case "groesse": aVal = a.groesse; bVal = b.groesse; break;
                      case "zimmer": aVal = a.zimmer; bVal = b.zimmer; break;
                      case "mieteGesamt": aVal = a.mieteGesamt; bVal = b.mieteGesamt; break;
                      case "vkGesamt": aVal = a.vkGesamt; bVal = b.vkGesamt; break;
                      case "rendite": aVal = a.rendite; bVal = b.rendite; break;
                      case "hausgeld": aVal = a.mieteGesamt * 0.25; bVal = b.mieteGesamt * 0.25; break;
                      case "bilder": aVal = (a.bilder || []).length; bVal = (b.bilder || []).length; break;
                      case "vermietet": aVal = a.vermietet !== false ? 1 : 0; bVal = b.vermietet !== false ? 1 : 0; break;
                      case "sanierung": {
                        const gesamtQm_ = (objekt.globalDaten as any)?.gesamtQm || 0;
                        const summeQm_ = objekt.wohnungen.reduce((s, wu) => s + (wu.groesse || 0), 0);
                        const useF_ = gesamtQm_ > 0 && gesamtQm_ >= summeQm_;
                        const tA = useF_
                          ? Math.round(((a.groesse || 0) / gesamtQm_) * 1000)
                          : (totalVk > 0 ? Math.round((a.vkGesamt / totalVk) * 1000) : 0);
                        const tB = useF_
                          ? Math.round(((b.groesse || 0) / gesamtQm_) * 1000)
                          : (totalVk > 0 ? Math.round((b.vkGesamt / totalVk) * 1000) : 0);
                        aVal = tA; bVal = tB; break;
                      }
                      case "kundeName": aVal = a.kundeName || ""; bVal = b.kundeName || ""; break;
                      default: aVal = String((a as any)[whgSortField] ?? ""); bVal = String((b as any)[whgSortField] ?? "");
                    }
                    if (typeof aVal === "number" && typeof bVal === "number") return whgSortDir === "asc" ? aVal - bVal : bVal - aVal;
                    return whgSortDir === "asc" ? String(aVal).localeCompare(String(bVal), "de", { numeric: true }) : String(bVal).localeCompare(String(aVal), "de", { numeric: true });
                  }).map(w => {
                  const totalVk = objekt.wohnungen.reduce((s, wu) => s + wu.vkGesamt, 0);
                  const gesamtQmObj = (objekt.globalDaten as any)?.gesamtQm || 0;
                  const summeAngelegteQm = objekt.wohnungen.reduce((s, wu) => s + (wu.groesse || 0), 0);
                  const useFlaecheBasis = gesamtQmObj > 0 && gesamtQmObj >= summeAngelegteQm && (w.groesse || 0) > 0;
                  const tausendstel = useFlaecheBasis
                    ? Math.round((w.groesse / gesamtQmObj) * 1000)
                    : (totalVk > 0 ? Math.round((w.vkGesamt / totalVk) * 1000) : 0);
                  const sanierungAnteil = objekt.sanierungskosten ? Math.round((objekt.sanierungskosten * tausendstel) / 1000) : 0;
                  return (
                  <TableRow key={w.id} className={`cursor-pointer hover:bg-muted/50 ${
                    // VP: highlight row if exclusively assigned to them
                    !isEditor && w.exklusivNutzer && w.exklusivNutzer.length > 0 && authUser?.id && w.exklusivNutzer.includes(authUser.id) ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`} onClick={() => {
                    const params = kundeIdFromUrl ? `?kundeId=${kundeIdFromUrl}&kundeName=${encodeURIComponent(kundeNameFromUrl || "")}${investmentIdFromUrl ? `&investmentId=${investmentIdFromUrl}` : ""}` : "";
                    navigate(`/objekte/${objekt.id}/wohnung/${w.id}${params}`);
                  }}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {w.weNr}
                        {/* VP sees "Exklusiv" badge on their assigned units */}
                        {!isEditor && w.exklusivNutzer && w.exklusivNutzer.length > 0 && authUser?.id && w.exklusivNutzer.includes(authUser.id) && (
                          <Badge className="text-[9px] bg-primary/10 text-primary border-primary/30 px-1 py-0" variant="outline">Exklusiv</Badge>
                        )}
                        {/* Admin sees assigned VP names */}
                        {["admin", "inhaber"].includes(user.role) && w.exklusivNutzer && w.exklusivNutzer.length > 0 && (() => {
                          const allUsers = loadAllUsers();
                          const names = w.exklusivNutzer.map(uid => allUsers.find(u => u.id === uid)?.name || "?").join(", ");
                          return <Badge className="text-[9px] bg-primary/10 text-primary border-primary/30 px-1 py-0" variant="outline" title={names}>🔒 {names}</Badge>;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>{w.etage}</TableCell>
                    <TableCell>{w.lage}</TableCell>
                    <TableCell className="text-center">{(w.bilder || []).length}</TableCell>
                    <TableCell>{w.groesse.toFixed(2)} m²</TableCell>
                    <TableCell>{w.zimmer}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{fmt(w.mieteGesamt)}</span>
                        {hatGeplanteErhoehung(w) && (
                          <span className="text-[9px] text-[hsl(var(--success))]">→ {fmt(w.neueMiete!)} ab {w.mieterhoehungAb}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{fmt(w.vkGesamt)}</TableCell>
                    <TableCell>{w.rendite.toFixed(2)} %</TableCell>
                    <TableCell>
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs">{fmt(getHausgeldMonatForWohnung(objekt, w))}/mtl.</span>
                        <span className="text-[10px] text-muted-foreground">davon n.u. {fmt(getHausgeldNichtUmlegbarForWohnung(objekt, w))}</span>
                      </div>
                    </TableCell>
                    {objekt.sanierungskosten ? <TableCell><span className="text-xs">{(tausendstel / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % = {fmt(sanierungAnteil)}</span></TableCell> : null}
                    <TableCell>
                      <Badge variant={w.vermietet !== false ? "default" : "destructive"} className="text-[10px]">
                        {w.vermietet !== false ? "Vermietet" : "Leerstand"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {(() => {
                        const isOther = !isEditor && w.status === "reserviert" && w.kundeId && w.kundeId !== kundeIdFromUrl;
                        const invs = w.kundeId ? getInvestmentsByKontakt(w.kundeId) : [];
                        const rvPending = w.status === "reserviert" && invs.some(inv => getRvSignaturePending(inv.id) && !getRvSigned(inv.id));
                        const canEditStatus = ["admin", "inhaber"].includes(user.role);
                        return (
                          <div className="flex flex-col gap-1">
                            {canEditStatus ? (
                              <select
                                value={w.status}
                                onChange={async e => {
                                  const neuerStatus = e.target.value as ObjektWohnung["status"];
                                  const ok = await confirmDialog({
                                    title: "Status von Hand ändern?",
                                    description: "Damit wird die automatische Ableitung aus Reservierung und Notartermin für diese Wohnung übergangen.",
                                    confirmText: "Status ändern",
                                    cancelText: "So lassen",
                                  });
                                  if (!ok) return;
                                  handleWohnungStatusChange(w.id, neuerStatus);
                                }}
                                className={`text-xs bg-transparent border border-transparent hover:border-border rounded px-1.5 py-0.5 cursor-pointer font-semibold ${statusColor(w.status)}`}
                                title="Status manuell ändern (nur Admin)"
                              >
                                <option value="frei">Frei</option>
                                <option value="reserviert">Reserviert</option>
                                <option value="verkauft">Verkauft</option>
                              </select>
                            ) : (
                              <span className={isOther ? "text-destructive font-semibold" : statusColor(w.status)}>
                                {statusLabel(w)}{isOther ? " (belegt)" : ""}
                              </span>
                            )}
                            {passendeKunden && w.status === "frei" && (
                              <PassendeKundenChip
                                treffer={passendeKunden.jeEinheit.get(w.id) ?? []}
                                weNr={w.weNr}
                                onEinheitOeffnen={() => navigate(`/objekte/${objekt.id}/wohnung/${w.id}`)}
                              />
                            )}
                            {!isOther && rvPending && (
                              <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/15 text-[9px] w-fit">
                                Warte auf Unterschrift
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    {isEditor && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        {w.kundeName ? (
                          <div className="space-y-0.5">
                            {["admin", "inhaber"].includes(user.role) ? (
                              <button className="text-xs font-medium text-primary hover:underline cursor-pointer" onClick={() => navigate(`/kunden/${w.kundeId}`)}>
                                {w.kundeName}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground" title="Anonymisiert – Details nur für Admins sichtbar">
                                {(() => {
                                  const parts = w.kundeName.trim().split(/\s+/);
                                  const initials = parts.map(p => p.charAt(0).toUpperCase()).join(". ");
                                  return `Reserviert (${initials}.)`;
                                })()}
                              </span>
                            )}
                            {w.beraterName && (
                              <p className="text-[10px] text-muted-foreground">VP: {w.beraterName}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell onClick={e => e.stopPropagation()}>
                      {w.status === "frei" && einheitImAngebot(w) && kundeIdFromUrl && darfReservieren(user.role) && !istGlobalobjekt(objekt) && (() => {
                        if (vormerkungBlockiert(w, kundeIdFromUrl)) {
                          return <span className="text-[10px] text-muted-foreground">Vorgemerkt bis {uhrzeit(w.vorgemerktBis)} Uhr</span>;
                        }
                        const saOk = investmentIdFromUrl ? darfReservierungStarten(investmentIdFromUrl) : false;
                        if (!saOk) {
                          return <span className="text-[10px] text-[hsl(var(--warning))]">SA-Unterschrift fehlt</span>;
                        }
                        return (
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleKundeReservieren(w.id)}>
                            <UserPlus className="h-3 w-3 mr-1" /> Reservieren
                          </Button>
                        );
                      })()}
                      {w.status === "reserviert" && isEditor && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 text-destructive">
                              Aufheben
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reservierung aufheben?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Soll die Reservierung für {w.kundeName || "diesen Kunden"} (VP: {w.beraterName || "–"}) wirklich aufgehoben werden? Die Wohnung wird wieder als „Frei" markiert.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveReservierung(w.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Ja, aufheben
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {w.status === "frei" && !kundeIdFromUrl && (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    {isEditor && (
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {["admin", "inhaber"].includes(user.role) && (
                            <Button variant="ghost" size="icon" aria-label="Person hinzufügen" className={`h-7 w-7 ${w.exklusivNutzer && w.exklusivNutzer.length > 0 ? "text-primary" : ""}`} title={w.exklusivNutzer && w.exklusivNutzer.length > 0 ? `Exklusiv: ${w.exklusivNutzer.length} VP(s)` : "Exklusiv zuweisen"} onClick={() => {
                              setZuweisungWohnung(w);
                              setZuweisungNutzer(w.exklusivNutzer || []);
                            }}>
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" aria-label="Bearbeiten" className="h-7 w-7" onClick={() => {
                            setShowEditWohnung(w);
                            setEw({ weNr: w.weNr, etage: w.etage, lage: w.lage, groesse: w.groesse, zimmer: w.zimmer, mieteGesamt: w.mieteGesamt, vkGesamt: w.vkGesamt, rendite: w.rendite, status: w.status });
                          }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7 text-destructive" onClick={() => handleDeleteWohnung(w.id, w.weNr)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                });
                })()}
                {!wohnungenReady ? (
                  <TableRow>
                    <TableCell colSpan={wohnungenColSpan} className="py-8 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wohneinheiten werden geladen…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : objekt.wohnungen.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={wohnungenColSpan} className="text-center py-8 text-muted-foreground">Keine Wohnungen angelegt.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <a href={kundenansichtZiel({ rolle: user.role, objektId: objekt.id, investmentId: investmentIdFromUrl, beraterId: authUser?.id })} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Eye className="h-3 w-3 mr-1" /> Kunden-Ansicht
              </Button>
            </a>
          </div>
        </Card>

      </div>

      {/* ── Wohnungsdetail ── */}
      {renderWohnungsDetail()}

      {/* ── Dialogs ── */}

      {/* Edit Object */}
      <Dialog open={showEdit} onOpenChange={(open) => {
        if (open && objekt) {
          setEf({ titel: objekt.titel, plz: objekt.plz, ort: objekt.ort, adresse: objekt.adresse, badge: objekt.badge, bildUrl: objekt.bildUrl, videoUrl: objekt.videoUrl, groesseVon: objekt.groesseVon, groesseBis: objekt.groesseBis, preisVon: objekt.preisVon, preisBis: objekt.preisBis, renditeVon: objekt.renditeVon, renditeBis: objekt.renditeBis, beschreibung: objekt.beschreibung, exklusivPartner: objekt.exklusivPartner || [] });
        }
        setShowEdit(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Objekt bearbeiten</DialogTitle></DialogHeader>
          <div className="grid gap-3 pt-2">
            <div><Label className="text-xs">Titel</Label><Input value={ef.titel ?? ""} onChange={e => setEf(p => ({ ...p, titel: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">PLZ</Label><Input value={ef.plz ?? ""} onChange={e => setEf(p => ({ ...p, plz: e.target.value }))} /></div>
              <div className="col-span-2"><Label className="text-xs">Ort</Label><Input value={ef.ort ?? ""} onChange={e => setEf(p => ({ ...p, ort: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Adresse</Label><Input value={ef.adresse ?? ""} onChange={e => setEf(p => ({ ...p, adresse: e.target.value }))} /></div>
            <div><Label className="text-xs">Badge</Label><Input value={ef.badge ?? ""} onChange={e => setEf(p => ({ ...p, badge: e.target.value }))} /></div>
            <div><Label className="text-xs">Bild-URL (Hauptbild)</Label><Input value={ef.bildUrl ?? ""} onChange={e => setEf(p => ({ ...p, bildUrl: e.target.value }))} placeholder="https://..." /></div>
            <div><Label className="text-xs">Video-URL</Label><Input value={ef.videoUrl ?? ""} onChange={e => setEf(p => ({ ...p, videoUrl: e.target.value }))} placeholder="https://youtube.com/..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Größe von (m²)</Label><Input type="number" value={ef.groesseVon ?? ""} onChange={e => setEf(p => ({ ...p, groesseVon: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label className="text-xs">Größe bis (m²)</Label><Input type="number" value={ef.groesseBis ?? ""} onChange={e => setEf(p => ({ ...p, groesseBis: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Preis von (€)</Label><Input type="number" value={ef.preisVon ?? ""} onChange={e => setEf(p => ({ ...p, preisVon: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label className="text-xs">Preis bis (€)</Label><Input type="number" value={ef.preisBis ?? ""} onChange={e => setEf(p => ({ ...p, preisBis: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rendite von (%)</Label><Input type="number" step="0.01" value={ef.renditeVon ?? ""} onChange={e => setEf(p => ({ ...p, renditeVon: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label className="text-xs">Rendite bis (%)</Label><Input type="number" step="0.01" value={ef.renditeBis ?? ""} onChange={e => setEf(p => ({ ...p, renditeBis: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label className="text-xs">Beschreibung</Label><Textarea value={ef.beschreibung ?? ""} onChange={e => setEf(p => ({ ...p, beschreibung: e.target.value }))} rows={6} /></div>
            {/* Exklusive Freischaltung */}
            <div className="border rounded-lg p-3 space-y-2">
              <Label className="text-xs font-semibold">Exklusive Freischaltung</Label>
              <p className="text-xs text-muted-foreground">Objekt nur für bestimmte Vertriebspartner sichtbar machen. Ohne Einträge für alle sichtbar.</p>
              {(ef.exklusivPartner as string[] | undefined)?.length ? (
                <div className="flex flex-wrap gap-1">
                  {(ef.exklusivPartner as string[]).map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1">{name}<button className="ml-1 text-destructive" onClick={() => setEf(p => ({ ...p, exklusivPartner: (p.exklusivPartner as string[] || []).filter((_, j) => j !== i) }))}>✕</button></Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Keine Einschränkung</p>
              )}
              <div className="flex gap-2">
                <Input value={exklusivInput} onChange={e => setExklusivInput(e.target.value)} placeholder="Name des Vertriebspartners..." className="h-8 text-xs" onKeyDown={e => {
                  if (e.key === "Enter" && exklusivInput.trim()) {
                    e.preventDefault();
                    const current = (ef.exklusivPartner as string[]) || [];
                    if (!current.includes(exklusivInput.trim())) setEf(p => ({ ...p, exklusivPartner: [...(p.exklusivPartner as string[] || []), exklusivInput.trim()] }));
                    setExklusivInput("");
                  }
                }} />
                <Button type="button" size="sm" className="h-8" onClick={() => {
                  if (!exklusivInput.trim()) return;
                  const current = (ef.exklusivPartner as string[]) || [];
                  if (!current.includes(exklusivInput.trim())) setEf(p => ({ ...p, exklusivPartner: [...(p.exklusivPartner as string[] || []), exklusivInput.trim()] }));
                  setExklusivInput("");
                }}>+</Button>
              </div>
            </div>
            <Button onClick={handleSaveEdit}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Document */}
      <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neues Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="grid gap-3 pt-2">
            <div><Label className="text-xs">Button-Bezeichnung *</Label><Input value={newDoc.name} onChange={e => setNewDoc(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Grundriss" /></div>
            <div>
              <Label className="text-xs">PDF-Datei hochladen oder URL eingeben</Label>
              <div className="space-y-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-3 hover:bg-muted/50 transition-colors">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{pendingDocFile ? `${pendingDocFile.name} ✓` : "PDF auswählen..."}</span>
                  <input type="file" accept=".pdf" className="hidden" multiple onChange={e => {
                    const files = e.target.files;
                    if (!files || files.length === 0 || !id) return;
                    // Multiple file upload
                    if (files.length > 1) {
                      setUploadingDocId("multi");
                      const fileArr = Array.from(files);
                      Promise.all(fileArr.map(async (file) => {
                        const name = file.name.replace(/\.pdf$/i, "");
                        const url = await uploadDocToStorage(file, name);
                        if (url) {
                          addDokument(id, { id: crypto.randomUUID(), name, url, typ: "custom", kategorie: newDoc.kategorie, sichtbar: true });
                        }
                      })).then(() => {
                        setUploadingDocId(null);
                        reload();
                        setShowAddDoc(false);
                        setNewDoc({ name: "", url: "", kategorie: "objektunterlagen" });
                        setPendingDocFile(null);
                        toast({ title: `${fileArr.length} Dokumente hochgeladen ✓` });
                      });
                    } else {
                      const file = files[0];
                      setPendingDocFile(file);
                      if (!newDoc.name.trim()) setNewDoc(p => ({ ...p, name: file.name.replace(/\.pdf$/i, ""), url: file.name }));
                      else setNewDoc(p => ({ ...p, url: file.name }));
                    }
                  }} />
                </label>
                <div className="text-[10px] text-muted-foreground text-center">oder</div>
                <Input value={pendingDocFile ? "" : newDoc.url} onChange={e => { setPendingDocFile(null); setNewDoc(p => ({ ...p, url: e.target.value })); }} placeholder="https://..." className="h-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Kategorie</Label>
              <select value={newDoc.kategorie} onChange={e => setNewDoc(p => ({ ...p, kategorie: e.target.value as any }))} className="w-full text-sm border rounded px-2 py-1.5 bg-background h-8 mt-1">
                <option value="objektunterlagen">Objektunterlagen</option>
                <option value="intern">Interne Unterlagen / Tools</option>
              </select>
            </div>
            <Button onClick={handleAddDoc} disabled={!!uploadingDocId}>
              {uploadingDocId ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird hochgeladen…</> : "Hinzufügen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Wohnung Document */}
      <Dialog open={showAddWohnungDoc} onOpenChange={setShowAddWohnungDoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wohnungsdokument hinzufügen</DialogTitle></DialogHeader>
          <div className="grid gap-3 pt-2">
            <div><Label className="text-xs">Name *</Label><Input value={newWohnungDoc.name} onChange={e => setNewWohnungDoc(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Grundriss WE" /></div>
            <div><Label className="text-xs">URL (optional)</Label><Input value={newWohnungDoc.url} onChange={e => setNewWohnungDoc(p => ({ ...p, url: e.target.value }))} placeholder="https://..." /></div>
            <Button onClick={() => {
              if (!id || !selectedWohnung || !newWohnungDoc.name.trim()) return;
              addWohnungDokument(id, selectedWohnung.id, {
                id: crypto.randomUUID(),
                name: newWohnungDoc.name.trim(),
                url: newWohnungDoc.url.trim(),
                kategorie: "wohnungsunterlagen",
              });
              reload();
              const updated = getObjektById(id)?.wohnungen.find(w => w.id === selectedWohnung.id);
              if (updated) setSelectedWohnung(updated);
              setShowAddWohnungDoc(false);
              setNewWohnungDoc({ name: "", url: "" });
              toast({ title: "Dokument hinzugefügt ✓" });
            }}>Hinzufügen</Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Add Wohnung */}
      <Dialog open={showAddWohnung} onOpenChange={setShowAddWohnung}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Wohnungen hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Card className="p-3 border-primary/30 bg-primary/5">
              <p className="text-sm font-medium mb-2">Wie sollen die Wohnungen angelegt werden?</p>
              <div className="flex gap-3">
                <Button size="sm" variant={wohnungMode === "gleich" ? "default" : "outline"} onClick={() => setWohnungMode("gleich")}>Alle gleiche Konditionen</Button>
                <Button size="sm" variant={wohnungMode === "einzeln" ? "default" : "outline"} onClick={() => setWohnungMode("einzeln")}>Einzeln hinzufügen</Button>
              </div>
            </Card>

            {wohnungMode === "gleich" ? (
              <div className="space-y-3">
                <div><Label className="text-xs">Anzahl Wohnungen</Label><Input type="number" value={bulkCount} onChange={e => setBulkCount(parseInt(e.target.value) || 0)} className="h-8 w-28" /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">Etage</Label><Input value={bulkData.etage} onChange={e => setBulkData(p => ({ ...p, etage: e.target.value }))} className="h-8" /></div>
                  <div><Label className="text-xs">Lage</Label><Input value={bulkData.lage} onChange={e => setBulkData(p => ({ ...p, lage: e.target.value }))} className="h-8" /></div>
                  <div><Label className="text-xs">Größe (m²)</Label><Input type="number" value={bulkData.groesse || ""} onChange={e => setBulkData(p => ({ ...p, groesse: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">Zimmer</Label><Input type="number" value={bulkData.zimmer || ""} onChange={e => setBulkData(p => ({ ...p, zimmer: parseInt(e.target.value) || 0 }))} className="h-8" /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">Miete (€)</Label><Input type="number" value={bulkData.miete || ""} onChange={e => setBulkData(p => ({ ...p, miete: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">VK (€)</Label><Input type="number" value={bulkData.vk || ""} onChange={e => setBulkData(p => ({ ...p, vk: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">Rendite (%)</Label><Input type="number" step="0.01" value={bulkData.rendite || ""} onChange={e => setBulkData(p => ({ ...p, rendite: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                </div>
                <Button onClick={handleAddWohnung} className="w-full">{bulkCount} Wohnungen hinzufügen</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">WE-Nr. *</Label><Input value={nw.weNr || ""} onChange={e => setNw(p => ({ ...p, weNr: e.target.value }))} className="h-8" /></div>
                  <div><Label className="text-xs">Etage</Label><Input value={nw.etage || ""} onChange={e => setNw(p => ({ ...p, etage: e.target.value }))} className="h-8" /></div>
                  <div><Label className="text-xs">Lage</Label><Input value={nw.lage || ""} onChange={e => setNw(p => ({ ...p, lage: e.target.value }))} className="h-8" /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">Größe (m²)</Label><Input type="number" value={nw.groesse || ""} onChange={e => setNw(p => ({ ...p, groesse: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">Zimmer</Label><Input type="number" value={nw.zimmer || ""} onChange={e => setNw(p => ({ ...p, zimmer: parseInt(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">Miete (€)</Label><Input type="number" value={nw.mieteGesamt || ""} onChange={e => setNw(p => ({ ...p, mieteGesamt: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div><Label className="text-xs">VK (€)</Label><Input type="number" value={nw.vkGesamt || ""} onChange={e => setNw(p => ({ ...p, vkGesamt: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Rendite (%)</Label><Input type="number" step="0.01" value={nw.rendite || ""} onChange={e => setNw(p => ({ ...p, rendite: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
                  <div>
                    <Label className="text-xs">Vermietungszustand</Label>
                    <select
                      value={nw.vermietungsStatus || (nw.vermietet === false ? "leerstand" : "vermietet")}
                      onChange={e => setNw(p => ({ ...p, vermietungsStatus: e.target.value as any, vermietet: e.target.value === "vermietet" }))}
                      className="w-full text-sm border rounded px-2 py-1.5 bg-background h-8"
                    >
                      <option value="vermietet">Vermietet</option>
                      <option value="leerstand">Leerstand</option>
                      <option value="gekuendigt">Gekündigt</option>
                      <option value="in_vermietung">In Vermietung</option>
                      <option value="eigennutzung">Eigennutzung</option>
                    </select>
                  </div>
                </div>
                <Button onClick={handleAddWohnung} className="w-full">Wohnung hinzufügen</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Wohnung */}
      <Dialog open={!!showEditWohnung} onOpenChange={v => { if (!v) setShowEditWohnung(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wohnung bearbeiten – {showEditWohnung?.weNr}</DialogTitle></DialogHeader>
          <div className="grid gap-3 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">WE-Nr.</Label><Input value={ew.weNr ?? ""} onChange={e => setEw(p => ({ ...p, weNr: e.target.value }))} className="h-8" /></div>
              <div><Label className="text-xs">Etage</Label><Input value={ew.etage ?? ""} onChange={e => setEw(p => ({ ...p, etage: e.target.value }))} className="h-8" /></div>
              <div><Label className="text-xs">Lage</Label><Input value={ew.lage ?? ""} onChange={e => setEw(p => ({ ...p, lage: e.target.value }))} className="h-8" /></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-xs">Größe (m²)</Label><Input type="number" value={ew.groesse ?? ""} onChange={e => setEw(p => ({ ...p, groesse: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
              <div><Label className="text-xs">Zimmer</Label><Input type="number" value={ew.zimmer ?? ""} onChange={e => setEw(p => ({ ...p, zimmer: parseInt(e.target.value) || 0 }))} className="h-8" /></div>
              <div><Label className="text-xs">Miete (€)</Label><Input type="number" value={ew.mieteGesamt ?? ""} onChange={e => setEw(p => ({ ...p, mieteGesamt: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
              <div><Label className="text-xs">VK (€)</Label><Input type="number" value={ew.vkGesamt ?? ""} onChange={e => setEw(p => ({ ...p, vkGesamt: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Rendite (%)</Label><Input type="number" step="0.01" value={ew.rendite ?? ""} onChange={e => setEw(p => ({ ...p, rendite: parseFloat(e.target.value) || 0 }))} className="h-8" /></div>
              <div>
                <Label className="text-xs">Vermietungszustand</Label>
                <select
                  value={ew.vermietungsStatus ?? showEditWohnung?.vermietungsStatus ?? ((ew.vermietet ?? showEditWohnung?.vermietet) === false ? "leerstand" : "vermietet")}
                  onChange={e => setEw(p => ({ ...p, vermietungsStatus: e.target.value as any, vermietet: e.target.value === "vermietet" }))}
                  className="w-full text-sm border rounded px-2 py-1.5 bg-background h-8"
                >
                  <option value="vermietet">Vermietet</option>
                  <option value="leerstand">Leerstand</option>
                  <option value="gekuendigt">Gekündigt</option>
                  <option value="in_vermietung">In Vermietung</option>
                  <option value="eigennutzung">Eigennutzung</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <p className="text-sm font-medium py-1.5 px-2">{(ew.status ?? showEditWohnung?.status ?? "frei") === "verkauft" ? "Verkauft" : (ew.status ?? showEditWohnung?.status ?? "frei") === "reserviert" ? "Reserviert" : "Frei"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{["admin", "inhaber"].includes(user.role) ? "Status direkt in der Wohnungsübersicht-Tabelle änderbar" : "Status wird automatisch durch Reservierung/Notartermin gesetzt"}</p>
              </div>
            </div>
            <Button onClick={handleSaveEditWohnung}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kunden-Ansicht – now opens full page, dialog removed */}

      {/* Reservierung – navigiert jetzt auf eigene Seite */}

      {/* Investment-Analyse – navigiert jetzt auf eigene Seite */}

      {/* Gallery Slideshow Dialog */}
      <Dialog open={!!showGallery} onOpenChange={open => { if (!open) setShowGallery(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle>{showGallery?.title}</DialogTitle></DialogHeader>
          {showGallery && showGallery.images.length > 0 && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black">
                {showGallery.objektBilder && titelbildButton(showGallery.images[galleryIdx]?.originalUrl)}

                <img
                  src={showGallery.images[galleryIdx]?.url}
                  alt={showGallery.images[galleryIdx]?.alt || ""}
                  className="w-full h-[500px] object-contain"
                />
                {showGallery.images.length > 1 && (
                  <>
                    <button onClick={() => setGalleryIdx(i => (i - 1 + showGallery.images.length) % showGallery.images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-2 hover:bg-background shadow">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={() => setGalleryIdx(i => (i + 1) % showGallery.images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-2 hover:bg-background shadow">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 right-3 bg-background/80 rounded px-2 py-1 text-xs font-medium">
                  {galleryIdx + 1} / {showGallery.images.length}
                </div>
              </div>
              {showGallery.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {showGallery.images.map((img, i) => (
                    <button key={i} onClick={() => setGalleryIdx(i)}
                      className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-colors ${i === galleryIdx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                      <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Exposé erstellen Dialog */}
      <Dialog open={showExposeDialog} onOpenChange={setShowExposeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Online-Exposé erstellen & hinterlegen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Das Online-Exposé wird aus den Objektdaten generiert und als Unterlage hinterlegt. Bitte prüfe, ob alle relevanten Daten vorhanden sind:
            </p>
            <div className="space-y-2 bg-muted/50 rounded-lg p-4">
              {[
                { label: "Objektbilder", ok: images.length > 0 },
                { label: "Beschreibung", ok: !!(objekt.beschreibung && objekt.beschreibung.length > 10) },
                { label: "Adresse / Ort", ok: !!(objekt.adresse || objekt.ort) },
                { label: "Wohneinheiten", ok: objekt.wohnungen.length > 0 },
                { label: "Preisinformationen", ok: objekt.wohnungen.some(w => w.vkGesamt > 0) },
                { label: "AfA-Daten", ok: !!(objekt.afaDaten?.afaModell || objekt.afaDaten?.afaSatz) },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  {!item.ok && <span className="text-xs text-amber-500 ml-auto">Fehlt</span>}
                </div>
              ))}
            </div>
            {objekt.wohnungen.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer bg-muted/30 rounded-lg p-3 border border-border hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={exposeInclWohnungen}
                  onChange={e => setExposeInclWohnungen(e.target.checked)}
                  className="rounded border-border"
                />
                <div>
                  <span className="text-sm font-medium">Wohnungsexposés miterstellen</span>
                  <p className="text-xs text-muted-foreground">Für alle {objekt.wohnungen.length} Wohneinheiten werden individuelle PDF-Exposés generiert</p>
                </div>
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              Das Exposé wird als Online-Link hinterlegt. Du kannst es jederzeit über die Objektdetailseite aktualisieren.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowExposeDialog(false)}>
                Abbrechen
              </Button>
              <Button className="flex-1" disabled={bulkExposeGenerating} onClick={async () => {
                if (!id) return;
                const exposeUrl = `${window.location.origin}/expose/${objekt.id}?berater=${authUser?.id || ""}`;
                const exposeDok = objektUnterlagen.find(d => d.name === "Exposé");
                if (exposeDok) {
                  addDokument(id, { ...exposeDok, url: exposeUrl });
                } else {
                  addDokument(id, { id: `expose-${Date.now()}`, name: "Exposé", url: exposeUrl, typ: "standard", kategorie: "objektunterlagen", sichtbar: true });
                }
                reload();
                setShowExposeDialog(false);
                sonnerToast.success("Exposé erstellt & hinterlegt!", { description: "Das Online-Exposé wurde als Unterlage gespeichert." });

                if (exposeInclWohnungen && objekt.wohnungen.length > 0) {
                  handleBulkWohnungsExpose();
                }
              }}>
                {bulkExposeGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird erstellt...</>
                ) : (
                  <><FileText className="h-4 w-4 mr-2" /> {exposeInclWohnungen ? "Objekt- & Wohnungsexposés erstellen" : "Exposé erstellen & speichern"}</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wohnungs-Zuweisung Dialog */}
      <Dialog open={!!zuweisungWohnung} onOpenChange={(open) => { if (!open) setZuweisungWohnung(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Wohnung {zuweisungWohnung?.weNr} – Exklusive Zuweisung</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Wähle Vertriebspartner aus, die diese Wohnung exklusiv sehen dürfen. Ohne Auswahl ist sie für alle VPs sichtbar.</p>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Partner suchen..."
              value={zuweisungSearch}
              onChange={e => setZuweisungSearch(e.target.value)}
              className="h-8"
            />
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
              {(() => {
                const allUsers = loadAllUsers();
                const userRoles = cacheGet("user_roles") || [];
                const vpRoleNames = ["vertriebspartner", "vertriebsleiter"];
                const q = zuweisungSearch.toLowerCase();
                const vpUsers = allUsers.filter(u => {
                  // Check rolle field (test mode)
                  const rolle = (u.rolle || "").toLowerCase();
                  if (vpRoleNames.some(r => rolle.includes(r))) return true;
                  // Check user_roles table (live mode)
                  return userRoles.some((ur: any) => ur.user_id === u.id && vpRoleNames.includes(ur.role));
                });
                const filtered = vpUsers.filter(u => !q || u.name.toLowerCase().includes(q));
                if (filtered.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">Keine Vertriebspartner gefunden.</p>;
                return filtered.map(u => (
                    <label key={u.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={zuweisungNutzer.includes(u.id)}
                        onChange={e => {
                          if (e.target.checked) setZuweisungNutzer(prev => [...prev, u.id]);
                          else setZuweisungNutzer(prev => prev.filter(id2 => id2 !== u.id));
                        }}
                        className="rounded"
                      />
                      <span>{u.name}</span>
                      {u.rolle && <Badge variant="outline" className="text-[10px] ml-auto">{u.rolle}</Badge>}
                    </label>
                  ));
              })()}
            </div>
            {zuweisungNutzer.length > 0 && (
              <p className="text-xs text-muted-foreground">{zuweisungNutzer.length} Partner ausgewählt – alle anderen sehen die Wohnung ausgegraut.</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setZuweisungWohnung(null)}>Abbrechen</Button>
              <Button size="sm" onClick={async () => {
                if (!id || !zuweisungWohnung) return;
                await updateWohnung(id, zuweisungWohnung.id, { exklusivNutzer: zuweisungNutzer.length > 0 ? zuweisungNutzer : undefined });
                // Benachrichtigung an neu zugewiesene VPs senden
                if (zuweisungNutzer.length > 0 && objekt) {
                  const previousIds = zuweisungWohnung.exklusivNutzer || [];
                  const newIds = zuweisungNutzer.filter(uid => !previousIds.includes(uid));
                  for (const vpId of newIds) {
                    try {
                      await (supabase as any).from("benachrichtigungen").insert({
                        benutzer_id: vpId,
                        titel: "Wohnung exklusiv zugewiesen",
                        nachricht: `Dir wurde Wohnung ${zuweisungWohnung.weNr} im Objekt „${objekt.titel}" exklusiv zugewiesen.`,
                        link: `/objekte/${id}`,
                        ziel_rolle: "vertriebspartner",
                      });
                    } catch {}
                  }
                }
                reload();
                setZuweisungWohnung(null);
                toast({ title: zuweisungNutzer.length > 0 ? `Wohnung ${zuweisungWohnung.weNr} exklusiv zugewiesen ✓` : `Zuweisung für ${zuweisungWohnung.weNr} aufgehoben ✓` });
              }}>
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
