import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Trash2, Building2, Clock, Calculator, Eye, FileText, Loader2, Maximize2, FolderOpen, Pencil, CheckCircle2, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getObjektById, removeWohnungBild, removeWohnungDokument, updateWohnungDokument, addWohnungDokument, removeReservierung, hatGeplanteErhoehung, updateObjektFieldFast, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { einheitImAngebot } from "@/lib/objektKennzahlen";
import { resolveImageUrl } from "@/lib/objekteImages";
import { useUser } from "@/contexts/UserContext";
import { darfReservieren } from "@/lib/reservierungsRechte";
import { darfReservierungStarten } from "@/lib/reservierungStart";
import { uhrzeit, vormerkungBlockiert } from "@/lib/einheitVormerkung";
import { useToast, toast } from "@/hooks/use-toast";
import { LazyImage } from "@/components/ui/lazy-image";
import { GREST_BY_BUNDESLAND } from "@/lib/bundeslandGrEst";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { updateInvestment, getWohnungDisplayStatus, getInvestmentDocStatuses, getInvestmentsByKontakt, getRvSignaturePending, getRvSigned } from "@/lib/investmentsStore";
import { getKontaktById, updateKontakt } from "@/lib/kundenStore";
import { supabase } from "@/integrations/supabase/client";
import { befristeteDokumentAdressen, openUnterlage } from "@/lib/storage";
import { toast as sonnerToast } from "sonner";
import { UmgebungsKarteButton } from "@/components/maps/UmgebungsKarteButton";
import { UmgebungsKarte } from "@/components/maps/UmgebungsKarte";
import { Objektbeschreibung } from "@/components/objekte/Objektbeschreibung";
import { istGlobalobjekt, objektStruktur } from "@/lib/objektKlassen";
import { ladeAlsZip } from "@/lib/unterlagenZip";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { kaufnebenkostenPct, BUNDESLAND_NK } from "@/lib/kaufnebenkosten";
import { ZahlenDatenFaktenGrid } from "@/components/objekte/ZahlenDatenFaktenGrid";
import { darfObjektBearbeiten } from "@/lib/objektBearbeitenRecht";
import { PassendeKundenKarte } from "@/components/objektseite/PassendeKundenKarte";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const canEditRole = (role: string) => ["admin", "inhaber", "objektpartner"].includes(role);

export default function WohnungDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id, weId } = useParams<{ id: string; weId: string }>();
  const [searchParams] = useSearchParams();
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "wohnungs_bilder", "investments"]);
  const objekteReady = useCacheReady(["objekte"]);
  const wohnungenReady = useCacheReady(["wohnungen"]);

  const [objekt, setObjekt] = useState<ObjektData | undefined>(() => getObjektById(id || ""));
  // Objektpartner nur am eigenen Objekt, dieselbe Regel wie die Datenbank.
  const isEditor = canEditRole(user.role) && darfObjektBearbeiten(user.role, objekt, authUser?.id);
  const [zipLaeuft, setZipLaeuft] = useState(false);
  const reload = () => setObjekt(getObjektById(id || ""));

  const [wImgIdx, setWImgIdx] = useState(0);
  const [showAddWohnungDoc, setShowAddWohnungDoc] = useState(false);
  const [newWohnungDoc, setNewWohnungDoc] = useState({ name: "", url: "" });
  const [showGallery, setShowGallery] = useState<{ title: string; images: { url: string; alt: string }[] } | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [generatingExpose, setGeneratingExpose] = useState(false);
  const [wohnungsExposeUrl, setWohnungsExposeUrl] = useState<string | null>(null);

  // Check for existing wohnungs-expose
  useEffect(() => {
    if (!id || !weId) return;
    (async () => {
      try {
        const { data } = await supabase.storage
          .from("objekt-medien")
          .list(`wohnungsexpose/${id}/${weId}`, { limit: 1, sortBy: { column: "created_at", order: "desc" } });
        if (data && data.length > 0) {
          const { data: urlData } = supabase.storage
            .from("objekt-medien")
            .getPublicUrl(`wohnungsexpose/${id}/${weId}/${data[0].name}`);
          setWohnungsExposeUrl(urlData.publicUrl);
        }
      } catch {}
    })();
  }, [id, weId]);

  const kundeIdFromUrl = searchParams.get("kundeId");
  const kundeNameFromUrl = searchParams.get("kundeName");
  const investmentIdFromUrl = searchParams.get("investmentId");

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!id) return;
    setObjekt(getObjektById(id));
  }, [id, liveVersion]);

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

  if (!weId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Wohneinheit nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate(`/objekte/${id}`)}>Zurück zum Objekt</Button>
        </div>
      </DashboardLayout>
    );
  }

  if (!objekt) {
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
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Objekt oder Wohnung nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate("/objekte")}>Zurück zu Objekte</Button>
        </div>
      </DashboardLayout>
    );
  }

  const w = objekt.wohnungen.find(wu => wu.id === weId);
  if (!w) {
    if (!wohnungenReady) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Wohneinheit wird geladen…</p>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Wohneinheit nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate(`/objekte/${id}`)}>Zurück zum Objekt</Button>
        </div>
      </DashboardLayout>
    );
  }

  const isAdmin = ["admin", "inhaber", "objektpartner"].includes(user.role) && darfObjektBearbeiten(user.role, objekt, authUser?.id);
  const isPartner = !isAdmin;
  const showCustomerInfo = () => {
    if (isAdmin) return true;
    if (isPartner && w.kundeId) {
      const myKundenIds = kundeIdFromUrl ? [kundeIdFromUrl] : [];
      return myKundenIds.includes(w.kundeId);
    }
    return false;
  };

  const wDocs = w.dokumente || [];
  const wohnDocs = wDocs.filter(d => d.kategorie === "wohnungsunterlagen");
  const interneDokumente = wDocs.filter(d => d.kategorie === "intern").filter(d => !d.name.toLowerCase().includes("mischzins"));
  const wBilder = [...(w.bilder || [])].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));
  const isReserviert = w.status === "reserviert";
  const isOtherPartnerUnit = isPartner && isReserviert && w.kundeId && w.kundeId !== kundeIdFromUrl;
  const assignedKontakt = w.kundeId ? getKontaktById(w.kundeId) : null;
  const assignedVpName = assignedKontakt?.berater || "–";

  // Nur bei einer Einzelwohnung ist die Objektbeschreibung auch die der Wohnung.
  const istEinzelwohnung = objektStruktur(objekt) === "einzelwohnung";
  const objektUnterlagen = objekt.dokumente.filter(d => d.kategorie === "objektunterlagen");
  const images = objekt.bilder.length > 0 ? objekt.bilder : (objekt.bildUrl ? [{ id: "main", url: objekt.bildUrl, alt: objekt.titel, reihenfolge: 0 }] : []);

  const statusColor = (s: string) => {
    if (s === "verkauft") return "text-destructive font-semibold";
    if (s === "reserviert") return "text-primary font-semibold";
    return "text-[hsl(var(--success))] font-semibold";
  };

  const statusLabel = (wu: ObjektWohnung) => {
    const ds = getWohnungDisplayStatus(wu.status, wu.kundeId, false, wu.id);
    return ds.label;
  };

  const handleReservieren = async () => {
    if (!id || !kundeIdFromUrl) return;
    /*
     * Der Name kommt aus dem Kontakt, wenn er nicht in der Adresse steht.
     *
     * Die Objektauswahl im Kundenprofil schickt seit dem 23.09.2026 nur noch
     * Kennungen (`kundeId`, `investmentId`), keine Namen. Vorher brach dieser
     * Knopf ohne `kundeName` in der Adresse wortlos ab: Man klickte, und es
     * geschah nichts.
     */
    const kundeKontakt = getKontaktById(kundeIdFromUrl);
    const kundeName = (kundeNameFromUrl || `${kundeKontakt?.vorname || ""} ${kundeKontakt?.nachname || ""}`).trim();
    if (!kundeName) {
      toast({
        title: "Reservierung nicht möglich",
        description: "Der Kunde ist nicht geladen. Bitte die Seite neu laden oder aus dem Kundenprofil erneut öffnen.",
        variant: "destructive",
      });
      return;
    }
    // Rollenprüfung, siehe src/lib/reservierungsRechte.ts. Der Knopf ist für
    // andere Rollen ausgeblendet; das hier ist die zweite Tür, falls jemand
    // doch bis hierher kommt.
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
    /*
     * Hier wird seit dem 23.09.2026 NICHT mehr reserviert. Bis dahin setzte
     * schon dieser Klick die Einheit auf „reserviert“, bevor überhaupt eine
     * Vereinbarung existierte. Jetzt merkt erst das Absenden der
     * Reservierungsvereinbarung die Einheit 60 Minuten vor, und reserviert
     * wird mit der Unterschrift (Christians Regeln, siehe `vormerkeEinheit`).
     */
    /*
     * Weiter zur Reservierungsvereinbarung, nur mit Kennungen.
     *
     * Bis zum 16.09.2026 reisten hier Name, Mailadresse, Telefonnummer,
     * Anschrift und Geburtsdatum des Kunden im Klartext mit, dazu Adresse,
     * Kaufpreis und Miete der Wohnung. Aufgefallen ist das an einem echten
     * Fehlerticket an diesem Tag, in dem die volle Adresse stand und damit
     * für jeden lesbar war, der das Ticket öffnet. Solche Adressen landen
     * außerdem im Browserverlauf, in Lesezeichen und in Serverprotokollen.
     *
     * Die Reservierungsseite schlägt alles selbst nach: den Kunden über
     * `kunde`, die Wohnung über `objektId` und `wohnungId`, die
     * Objektangaben über `investmentId`.
     */
    const params = new URLSearchParams({
      kunde: kundeIdFromUrl,
      wohnungId: w.id,
      objektId: id,
    });
    if (investmentIdFromUrl) params.set("investmentId", investmentIdFromUrl);
    // Damit der Zurückknopf in der Reservierung wieder hierher führt.
    params.set("zurueck", location.pathname + location.search);
    navigate(`/reservierung?${params.toString()}`);
  };

  const handleRemoveReservierung = async () => {
    if (!id) return;
    const ergebnis = await removeReservierung(id, w.id);
    reload();
    if (!ergebnis.ok) {
      toast({ title: "Reservierung nicht aufgehoben", description: ergebnis.fehlerText, variant: "destructive" });
      return;
    }
    toast({ title: "Reservierung aufgehoben" });
  };

  const handleGenerateWohnungsExpose = async () => {
    if (!id || !objekt || !w) return;
    setGeneratingExpose(true);
    try {
      // Seit 01.10.2026 dasselbe Exposé-PDF wie überall (Design H3, `exposeDruck`).
      const { kundenExposePdf } = await import("@/lib/kundenansichtExpose");
      const { blob: pdfBlob } = await kundenExposePdf(objekt, w, undefined, new Date());
      const fileName = `wohnungsexpose/${id}/${w.id}/expose-WE${(w.weNr || "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

      const saved = await saveExposePdf(fileName, pdfBlob);
      setWohnungsExposeUrl(saved.url);
      sonnerToast.success("Wohnungsexposé erstellt!", { description: `WE ${w.weNr} – PDF wurde gespeichert.` });
    } catch (err: any) {
      sonnerToast.error("Fehler: " + (err.message || "Unbekannter Fehler"));
    }
    setGeneratingExpose(false);
  };

  const backUrl = kundeIdFromUrl
    ? `/objekte/${id}?kundeId=${kundeIdFromUrl}&kundeName=${encodeURIComponent(kundeNameFromUrl || "")}${investmentIdFromUrl ? `&investmentId=${investmentIdFromUrl}` : ""}`
    : `/objekte/${id}`;

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        {/*
          Die Rückwege stehen oben links, vor allem anderen.

          Christian am 22.09.2026: Rechts in der Knopfgruppe werden sie
          schlecht gefunden. Der Rückweg liegt im ganzen System an derselben
          Stelle, Vorbild ist die `ZurueckLeiste` in `EinheitSeite`. Diese
          Seite hat zwei Wege, einen zum Kunden und einen zum Objekt. Beide
          bleiben erhalten, beide stehen jetzt hier.

          `-ml-2` am Rahmen statt am einzelnen Knopf: Welcher Knopf zuerst
          kommt, hängt von der Adresse ab, so beginnt die Zeile immer bündig.
          `flex-wrap`, damit auf dem Handy nichts über den Rand läuft.
        */}
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          {kundeIdFromUrl && searchParams.get("fromKundenansicht") && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/kundenansicht/objekt/${searchParams.get("fromKundenansicht")}?kunde=${encodeURIComponent(kundeNameFromUrl || "")}&kundeId=${kundeIdFromUrl}&investmentId=${investmentIdFromUrl || ""}`)}>
              <ArrowLeft className="h-4 w-4" /> Zurück zur Kundenansicht
            </Button>
          )}
          {kundeIdFromUrl && !searchParams.get("fromKundenansicht") && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/kunden/${kundeIdFromUrl}#objektauswahl`)}>
              <ArrowLeft className="h-4 w-4" /> Zurück zur Wohnungsübersicht
            </Button>
          )}
          {(objekt.meta as any)?.einzelwohnung ? (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate("/objekte")}>
              <ArrowLeft className="h-4 w-4" /> Zurück zur Objektliste
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(backUrl)}>
              <ArrowLeft className="h-4 w-4" /> Zurück zum Objekt
            </Button>
          )}
        </div>

        {/* Header buttons */}
        {["admin", "inhaber", "vertriebspartner", "objektpartner"].includes(user.role) && (
          <div className="flex items-center justify-end gap-2">
            {/* V2 Button vorerst ausgeblendet – Route bleibt unter /expose/:id/wohnung/:weId/v2 erreichbar */}
            <a href={`/expose/${id}/wohnung/${w.id}?berater=${authUser?.id || ""}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="border-accent/50">
                <Globe className="h-3 w-3 mr-1" /> Online-Exposé
              </Button>
            </a>
          </div>
        )}

        {/* Einzelwohnung: Entwurf-Banner + Admin-Bar (gleiche Logik wie Objektseite) */}
        {(objekt.meta as any)?.einzelwohnung && objekt.status === "entwurf" && (
          <div className="bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 text-sm px-3 py-1">
                Entwurf – Freigabe ausstehend
              </Badge>
              <span className="text-sm text-muted-foreground">Diese Wohnung wurde von einem Objektpartner eingereicht und muss geprüft werden.</span>
            </div>
            {["admin", "inhaber"].includes(user.role) && (
              <Button
                onClick={async () => {
                  if (!id) return;
                  try {
                    await updateObjektFieldFast(id, { status: "freigegeben", sichtbar: true });
                  } catch (e) {
                    toast({ title: "Nicht freigegeben", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
                    return;
                  } finally {
                    reload();
                  }
                  toast({ title: "Wohnung freigegeben ✓", description: `„${objekt.titel}" ist jetzt sichtbar und für den Vertrieb verfügbar.` });
                }}
                className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white shrink-0"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Wohnung freigeben & sichtbar stellen
              </Button>
            )}
          </div>
        )}

        {(objekt.meta as any)?.einzelwohnung && isEditor && (
          <div className="flex items-center gap-4 bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              {["admin", "inhaber"].includes(user.role) && (
                <>
                  <Switch
                    checked={objekt.sichtbar}
                    onCheckedChange={async () => {
                      if (!id) return;
                      const newVal = !objekt.sichtbar;
                      try {
                        await updateObjektFieldFast(id, { sichtbar: newVal });
                      } catch (e) {
                        toast({ title: "Nicht gespeichert", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
                      }
                      reload();
                    }}
                    className={objekt.sichtbar ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-destructive"}
                  />
                  <span className={`text-sm font-medium ${objekt.sichtbar ? "text-green-600" : "text-destructive"}`}>
                    Objekt {objekt.sichtbar ? "sichtbar" : "unsichtbar (Entwurf)"}
                  </span>
                </>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`/objekte/${objekt.id}/bearbeiten`)}>
              <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
            </Button>
          </div>
        )}

        <div className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left – Wohnungsinfo + Status */}
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{objekt.titel}</h3>
                    <p className="text-sm text-muted-foreground">{objekt.plz} {objekt.ort}, {objekt.adresse}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <UmgebungsKarteButton
                        address={`${objekt.adresse || ""}, ${objekt.plz || ""} ${objekt.ort || ""}`.trim()}
                        titel={`${objekt.titel} – WHG ${w.weNr}`}
                        meta={objekt.meta}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold">{w.weNr.split("/")[0]?.trim().padStart(2, "0")}</span>
                    <p className="text-xs text-muted-foreground">Wohneinheit</p>
                  </div>
                </div>

                {/* Image Slideshow */}
                {wBilder.length > 0 ? (
                  <div className="space-y-2">
                    <div className="rounded-lg overflow-hidden relative">
                      <LazyImage src={resolveImageUrl(wBilder[wImgIdx % wBilder.length]?.url || "")} alt={wBilder[wImgIdx % wBilder.length]?.alt || ""} className="w-full h-[28rem] object-cover" wrapperClassName="w-full h-[28rem]" />
                      {wBilder.length > 1 && (
                        <>
                          <button onClick={() => setWImgIdx(i => (i - 1 + wBilder.length) % wBilder.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 hover:bg-background shadow"><ChevronLeft className="h-4 w-4" /></button>
                          <button onClick={() => setWImgIdx(i => (i + 1) % wBilder.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 hover:bg-background shadow"><ChevronRight className="h-4 w-4" /></button>
                          <div className="absolute bottom-2 right-2 bg-background/80 rounded px-1.5 py-0.5 text-[10px] font-medium">{(wImgIdx % wBilder.length) + 1} / {wBilder.length}</div>
                        </>
                      )}
                      <button onClick={() => { setShowGallery({ title: `Wohnungsbilder – WE ${w.weNr}`, images: wBilder.map(img => ({ url: resolveImageUrl(img.url), alt: img.alt || "" })) }); setGalleryIdx(wImgIdx % wBilder.length); }}
                        className="absolute top-2 right-2 bg-background/80 rounded-full p-1.5 hover:bg-background shadow" title="Vergrößern">
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
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
                                onClick={() => { if (!id) return; removeWohnungBild(id, w.id, img.id); reload(); }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : !((objekt.meta as any)?.einzelwohnung) && images.length > 0 ? (
                  <div className="rounded-lg overflow-hidden">
                    <LazyImage src={resolveImageUrl(images[0]?.url || "")} alt="" className="w-full h-[28rem] object-cover" wrapperClassName="w-full h-[28rem]" />
                  </div>
                ) : (
                  <div className="bg-muted rounded-lg h-[28rem] flex items-center justify-center">
                    <Building2 className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}

                {/* Details grid – Zahlen, Daten, Fakten */}
                <ZahlenDatenFaktenGrid
                  objekt={objekt}
                  w={w}
                  hatGeplanteErhoehung={hatGeplanteErhoehung}
                  sanierungAnteilLabel={(() => {
                    if (!objekt.sanierungskosten) return null;
                    const gesamtQm = (objekt.globalDaten as any)?.gesamtQm || 0;
                    const summeAngelegteQm = objekt.wohnungen.reduce((s, wu) => s + (wu.groesse || 0), 0);
                    const useFlaeche = gesamtQm > 0 && gesamtQm >= summeAngelegteQm && (w.groesse || 0) > 0;
                    let tausendstel = 0;
                    if (useFlaeche) {
                      tausendstel = Math.round((w.groesse / gesamtQm) * 1000);
                    } else {
                      const totalVk = objekt.wohnungen.reduce((s, wu) => s + wu.vkGesamt, 0);
                      tausendstel = totalVk > 0 ? Math.round((w.vkGesamt / totalVk) * 1000) : 0;
                    }
                    const sanierungAnteil = Math.round((objekt.sanierungskosten! * tausendstel) / 1000);
                    return (
                      <>
                        {(tausendstel / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % = {fmt(sanierungAnteil)}
                        {useFlaeche ? (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            (bezogen auf {gesamtQm.toLocaleString("de-DE")} m² Gesamt)
                          </span>
                        ) : null}
                      </>
                    );
                  })()}
                />

                {/* Status (wird am Ende der Spalte gerendert) */}
                {false && <Card className="p-4">
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
                            Warte auf Unterschrift von Kunde
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
                  {isReserviert && (
                    <div className="space-y-1 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Reserviert am: {w.reserviertAm ? new Date(w.reserviertAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        VP: <span className="font-medium">{assignedVpName}</span>
                      </p>
                      {isAdmin ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde:{" "}
                          <button
                            type="button"
                            onClick={() => navigate(`/kunden/${w.kundeId}`)}
                            className="font-medium text-primary hover:underline"
                          >
                            {w.kundeName || "–"}
                          </button>
                        </p>
                      ) : isOtherPartnerUnit ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde: <span className="font-medium blur-sm select-none">{w.kundeName || "Kunde"}</span>
                        </p>
                      ) : w.kundeId ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde: <span className="font-medium">{w.kundeName || "–"}</span>
                        </p>
                      ) : null}
                      {!isOtherPartnerUnit && isEditor && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 mt-2 text-destructive">Reservierung aufheben</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reservierung aufheben?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Soll die Reservierung für {w.kundeName || "diesen Kunden"} wirklich aufgehoben werden? Die Wohnung wird wieder als „Frei" markiert.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={handleRemoveReservierung} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Ja, aufheben
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}

                  {/* Kunde reservieren button */}
                  {!isOtherPartnerUnit && kundeIdFromUrl && w.status === "frei" && einheitImAngebot(w) && darfReservieren(user.role) && !istGlobalobjekt(objekt) && (() => {
                    // Läuft für einen anderen Kunden gerade eine Vereinbarung, bleibt die Einheit 60 Minuten vorgemerkt.
                    if (vormerkungBlockiert(w, kundeIdFromUrl)) {
                      return <p className="text-xs text-muted-foreground mt-3">Vorgemerkt bis {uhrzeit(w.vorgemerktBis)} Uhr für einen anderen Kunden. Danach ist die Einheit wieder frei.</p>;
                    }
                    const canReserve = investmentIdFromUrl ? darfReservierungStarten(investmentIdFromUrl) : false;
                    return canReserve ? (
                      <Button size="sm" variant="brand" className="mt-3 w-full" onClick={handleReservieren}>Kunde reservieren</Button>
                    ) : (
                      <p className="text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-md px-3 py-2 mt-3">
                        ⚠️ Zuerst muss die Selbstauskunft unterschrieben sein, oder im Kundenprofil steht der Vermerk „Kunde finanziert selbst“.
                      </p>
                    );
                  })()}
                </Card>}

                {/* Investmentinformation */}
              </div>

              {/* Right – Unterlagen */}
              <div className="space-y-6">
                {/* Objektunterlagen – bei Einzelwohnung ausblenden */}
                {!((objekt.meta as any)?.einzelwohnung) && (
                <div>
                  <div className="w-8 h-1 bg-primary mb-3" />
                  <h4 className="font-bold mb-3">Objektunterlagen</h4>
                  {(() => {
                    const link = (objekt as any)?.meta?.unterlagenLink as string | undefined;
                    if (link) {
                      return (
                        <div className="flex flex-col gap-2">
                          <Button size="sm" onClick={() => window.open(link, "_blank")} className="w-fit">
                            <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Objektunterlagen öffnen
                          </Button>
                          <p className="text-[10px] text-muted-foreground break-all">{link}</p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/*
                    Die Unterlagen selbst, nicht nur ein Link darauf.
                    Wohnungs- und Objektunterlagen zusammen: Fuer den Kunden
                    ist das eine Sache, und Grundriss und Teilungserklaerung
                    braucht er im selben Moment.
                    Interne Unterlagen bleiben bewusst draussen.
                  */}
                  {(() => {
                    const alleUnterlagen = [
                      ...wohnDocs.map((d) => ({ ...d, herkunft: "Wohnung" })),
                      ...objektUnterlagen.map((d) => ({ ...d, herkunft: "Objekt" })),
                    ].filter((d) => d.url && d.url !== "" && d.url !== "__gallery__");

                    if (alleUnterlagen.length === 0) {
                      const wLink = (w as any).unterlagenLink as string | undefined;
                      if (wLink) return null;
                      return (
                        <p className="text-xs text-muted-foreground italic">
                          Noch keine Unterlagen hinterlegt. {isEditor ? 'Bitte über „Objekt bearbeiten" hinzufügen.' : "Wird vom Admin bereitgestellt."}
                        </p>
                      );
                    }

                    return (
                      <div className="mt-3 space-y-2">
                        <div className="space-y-1">
                          {alleUnterlagen.map((dok, i) => (
                            <div key={`${dok.id}-${i}`} className="flex items-center gap-2 text-xs">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <button
                                type="button"
                                className="truncate text-left text-primary hover:underline"
                                onClick={() => void openUnterlage(dok.url)}
                              >
                                {dok.name}
                              </button>
                              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{dok.herkunft}</span>
                            </div>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={zipLaeuft}
                          className="w-full"
                          onClick={async () => {
                            setZipLaeuft(true);
                            try {
                              // Geschuetzte Unterlagen haben keine feste Adresse
                              // mehr. Erst kurz vor dem Packen entsteht je Datei
                              // eine befristete; wem keine zusteht, der faellt
                              // heraus und wird unten mitgenannt.
                              const adressen = await befristeteDokumentAdressen(
                                alleUnterlagen.map((d) => ({ name: d.name, url: d.url })),
                              );
                              const ohneZugriff = alleUnterlagen
                                .filter((d) => !adressen.some((a) => a.name === d.name))
                                .map((d) => d.name);
                              const ergebnis = await ladeAlsZip(
                                adressen,
                                `${objekt.titel}_WE${w.weNr || ""}_Unterlagen`,
                              );
                              const gepackt = ergebnis.gepackt;
                              const fehlgeschlagen = [...ohneZugriff, ...ergebnis.fehlgeschlagen];
                              if (fehlgeschlagen.length > 0) {
                                toast({
                                  title: `${gepackt} von ${alleUnterlagen.length} Dateien gepackt`,
                                  description: `Nicht geladen: ${fehlgeschlagen.join(", ")}`,
                                  variant: "destructive",
                                });
                              } else {
                                toast({ title: `${gepackt} Unterlagen heruntergeladen ✓` });
                              }
                            } catch (e: any) {
                              toast({ title: "Download fehlgeschlagen", description: e.message, variant: "destructive" });
                            } finally {
                              setZipLaeuft(false);
                            }
                          }}
                        >
                          {zipLaeuft
                            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> ZIP wird erstellt…</>
                            : <><Download className="mr-1.5 h-3.5 w-3.5" /> Alle {alleUnterlagen.length} als ZIP</>}
                        </Button>
                      </div>
                    );
                  })()}
                </div>
                )}

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
                    return <p className="text-xs text-muted-foreground italic">Noch kein Link hinterlegt. {isEditor ? 'Bitte über „Objekt bearbeiten" einen Link hinzufügen.' : "Wird vom Admin bereitgestellt."}</p>;
                  })()}
                </div>

                {/* Interne Unterlagen / Tools */}
                {/* Status (jetzt rechte Spalte, unter Wohnungsunterlagen) */}
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
                            Warte auf Unterschrift von Kunde
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
                  {isReserviert && (
                    <div className="space-y-1 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Reserviert am: {w.reserviertAm ? new Date(w.reserviertAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        VP: <span className="font-medium">{assignedVpName}</span>
                      </p>
                      {isAdmin ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde:{" "}
                          <button
                            type="button"
                            onClick={() => navigate(`/kunden/${w.kundeId}`)}
                            className="font-medium text-primary hover:underline"
                          >
                            {w.kundeName || "–"}
                          </button>
                        </p>
                      ) : isOtherPartnerUnit ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde: <span className="font-medium blur-sm select-none">{w.kundeName || "Kunde"}</span>
                        </p>
                      ) : w.kundeId ? (
                        <p className="text-xs text-muted-foreground">
                          Kunde: <span className="font-medium">{w.kundeName || "–"}</span>
                        </p>
                      ) : null}
                      {!isOtherPartnerUnit && isEditor && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 mt-2 text-destructive">Reservierung aufheben</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reservierung aufheben?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Soll die Reservierung für {w.kundeName || "diesen Kunden"} wirklich aufgehoben werden? Die Wohnung wird wieder als „Frei" markiert.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={handleRemoveReservierung} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Ja, aufheben
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}

                  {!isOtherPartnerUnit && kundeIdFromUrl && w.status === "frei" && einheitImAngebot(w) && darfReservieren(user.role) && !istGlobalobjekt(objekt) && (() => {
                    // Läuft für einen anderen Kunden gerade eine Vereinbarung, bleibt die Einheit 60 Minuten vorgemerkt.
                    if (vormerkungBlockiert(w, kundeIdFromUrl)) {
                      return <p className="text-xs text-muted-foreground mt-3">Vorgemerkt bis {uhrzeit(w.vorgemerktBis)} Uhr für einen anderen Kunden. Danach ist die Einheit wieder frei.</p>;
                    }
                    const canReserve = investmentIdFromUrl ? darfReservierungStarten(investmentIdFromUrl) : false;
                    return canReserve ? (
                      <Button size="sm" variant="brand" className="mt-3 w-full" onClick={handleReservieren}>Kunde reservieren</Button>
                    ) : (
                      <p className="text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-md px-3 py-2 mt-3">
                        ⚠️ Zuerst muss die Selbstauskunft unterschrieben sein, oder im Kundenprofil steht der Vermerk „Kunde finanziert selbst“.
                      </p>
                    );
                  })()}
                </Card>
              </div>
            </div>

            {/* Interne Unterlagen, volle Seitenbreite unter dem 2-Spalten-Grid.
                Die Rechner sind entfernt (30.09.2026), gerechnet wird in der
                Investmentkalkulation. Ohne Unterlagen bleibt der Bereich weg. */}
            {interneDokumente.filter(dok => !dok.name.includes("Steuerliche Betrachtung")).length > 0 && (
            <div className="mt-6">
              <h4 className="font-bold mb-3">Tools</h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  {interneDokumente.filter(dok => !dok.name.includes("Steuerliche Betrachtung")).map(dok => (
                    <Button key={dok.id} size="sm" variant="outline" className="text-xs"
                      onClick={() => {
                        if (dok.url) void openUnterlage(dok.url);
                        else toast({ title: dok.name, description: "Noch keine Datei hinterlegt." });
                      }}>
                      {dok.name}
                    </Button>
                  ))}
                </div>
            </div>
            )}

            {/* Objekt-Infos (Beschreibung & Highlights) nur bei Einzelwohnung anzeigen –
                bei Mehrfamilien-Objekten sind diese bereits auf der Objektseite sichtbar. */}
            {(objekt.meta as any)?.einzelwohnung && (
            <div className="space-y-6 mt-6">
              {(objekt.highlights?.length ?? 0) > 0 && (
                <Card className="p-6">
                  <div className="w-8 h-1 bg-primary mb-3" />
                  <h3 className="font-bold mb-4">Highlights</h3>
                  <ul className="space-y-1.5 text-sm">
                    {(objekt.highlights || []).map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">✓</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}


              {/*
                Die Objektbeschreibung gehoert auf die Wohnungsseite nur dann,
                wenn Objekt und Wohnung dasselbe sind. Bei sechs Einheiten in
                Arberg staende sonst bei allen sechs derselbe Text.
              */}
              {istEinzelwohnung && <Objektbeschreibung text={objekt.beschreibung} />}
            </div>
            )}

            {/*
              Objektscore (04.10.2026): Diese Ansicht sieht der Vertriebspartner,
              hier stehen deshalb seine eigenen passenden Kunden. Nur intern,
              die Rollen entscheidet die Karte selbst.
            */}
            <div className="mt-6"><PassendeKundenKarte objekt={objekt} wohnung={w} /></div>
        </div>

      </div>

      {/* Add Wohnung Doc Dialog */}
      <Dialog open={showAddWohnungDoc} onOpenChange={setShowAddWohnungDoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={newWohnungDoc.name} onChange={e => setNewWohnungDoc(p => ({ ...p, name: e.target.value }))} placeholder="Dokumentname" />
            <Input value={newWohnungDoc.url} onChange={e => setNewWohnungDoc(p => ({ ...p, url: e.target.value }))} placeholder="URL (optional)" />
            <Button onClick={() => {
              if (!id || !newWohnungDoc.name.trim()) return;
              addWohnungDokument(id, w.id, { id: `wd-${Date.now()}`, name: newWohnungDoc.name.trim(), url: newWohnungDoc.url.trim(), kategorie: "wohnungsunterlagen" });
              reload();
              setShowAddWohnungDoc(false);
              setNewWohnungDoc({ name: "", url: "" });
              toast({ title: "Dokument hinzugefügt ✓" });
            }}>Hinzufügen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gallery Dialog */}
      {showGallery && (
        <Dialog open={!!showGallery} onOpenChange={open => { if (!open) setShowGallery(null); }}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader><DialogTitle>{showGallery.title}</DialogTitle></DialogHeader>
            <div className="relative">
              <img src={showGallery.images[galleryIdx]?.url} alt={showGallery.images[galleryIdx]?.alt} className="w-full max-h-[70vh] object-contain rounded" />
              {showGallery.images.length > 1 && (
                <>
                  <button onClick={() => setGalleryIdx(i => (i - 1 + showGallery.images.length) % showGallery.images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-2"><ChevronLeft className="h-5 w-5" /></button>
                  <button onClick={() => setGalleryIdx(i => (i + 1) % showGallery.images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-2"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground">{galleryIdx + 1} / {showGallery.images.length}</p>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
