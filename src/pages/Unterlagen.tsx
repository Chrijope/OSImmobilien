import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, Download, ExternalLink,
  Lock, FileText, Wrench, Link as LinkIcon, BookOpen, Calculator, Loader2,
  Banknote, GraduationCap, Megaphone, Briefcase, MessageSquare, Presentation, Sparkles, Heart,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { getAppConfig, setAppConfig } from "@/lib/appConfigStore";
import { WissenswertSection } from "@/components/praesentation/WissenswertSection";
import { WISSENS_ARTIKEL } from "@/lib/wissenswertArtikel";
import { guardTestWrite } from "@/lib/testModeGuard";
import { isNewBadgeActive, SEEN_KEYS } from "@/lib/seenBadges";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";


import { RechnungsGeneratorDialog } from "@/components/unterlagen/RechnungsGeneratorDialog";
import { EmailSignaturDialog } from "@/components/unterlagen/EmailSignaturDialog";
import { MarketingGrid } from "@/components/unterlagen/MarketingGrid";
import {
  seedUnterlagen, UNTERLAGEN_VERSION, ENTFERNTE_DOKUMENT_IDS,
  type UnterlagenAbschnitt, type UnterlagenDokument, type UnterlagenAktion,
} from "@/lib/unterlagenSeed";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  kultur: Heart,
  praesentation: Presentation,
  bonitaet: Calculator,
  "beratung-abschluss": Briefcase,
  aftersales: Sparkles,
  wissenswert: BookOpen,
  karriere: GraduationCap,
  marketing: Megaphone,
  organisation: Banknote,
  leitfaeden: MessageSquare,
};

const STORE_KEY = "unterlagen_struktur";

/**
 * Reine Anzeige-Filterung, ohne den gespeicherten Stand anzufassen: Solange
 * die Overhead-Provision abgeschaltet ist, wird das Muster der Anlage 7
 * (Struktur- & Overhead-Regelung) ausgeblendet. Beim Wiedereinschalten des
 * Flags taucht der Eintrag von selbst wieder auf.
 */
const OVERHEAD_DOKUMENT_IDS = ["k-hvv-anlage-7"];
function ohneOverheadDokumente(abschnitte: UnterlagenAbschnitt[]): UnterlagenAbschnitt[] {
  if (OVERHEAD_AKTIV) return abschnitte;
  return abschnitte.map((a) => ({
    ...a,
    dokumente: a.dokumente.filter((d) => !OVERHEAD_DOKUMENT_IDS.includes(d.id)),
  }));
}

/** Entfernt Einträge, die es im System nicht mehr gibt. */
function ohneEntfallene(abschnitte: UnterlagenAbschnitt[]): { daten: UnterlagenAbschnitt[]; geaendert: boolean } {
  let geaendert = false;
  const daten = abschnitte.map((a) => {
    const gefiltert = a.dokumente.filter((d) => !ENTFERNTE_DOKUMENT_IDS.includes(d.id));
    if (gefiltert.length !== a.dokumente.length) geaendert = true;
    return gefiltert.length === a.dokumente.length ? a : { ...a, dokumente: gefiltert };
  });
  return { daten, geaendert };
}

/**
 * Beschriftung, Ziel und Sichtbarkeit gehoeren dem Seed, nicht dem Speicher.
 *
 * Der gespeicherte Stand bestimmt die Reihenfolge und traegt selbst angelegte
 * Dokumente. Wie ein Eintrag aus dem Seed heisst und wohin er zeigt, entscheidet
 * dagegen der Code. Vorher wurde ein einmal gespeicherter Eintrag nie wieder
 * angefasst, weshalb eine Umbenennung bei Kollegen nicht ankam.
 */
function ausSeedAktualisiert(daten: UnterlagenAbschnitt[]): UnterlagenAbschnitt[] {
  const seed = seedUnterlagen();
  return daten.map((a) => {
    const seedDoks = seed.find((s) => s.id === a.id)?.dokumente || [];
    return {
      ...a,
      dokumente: a.dokumente.map((d) => {
        const sd = seedDoks.find((x) => x.id === d.id);
        if (!sd) return d;
        return {
          ...d,
          name: sd.name,
          beschreibung: sd.beschreibung,
          aktion: sd.aktion,
          url: sd.url,
          interneRoute: sd.interneRoute,
          pdfKey: sd.pdfKey,
          toolKey: sd.toolKey,
          nurAdmin: sd.nurAdmin,
          alt: sd.alt,
        };
      }),
    };
  });
}

/**
 * Laedt die Liste und schreibt sie bei Bedarf zurueck.
 *
 * `darfSchreiben` sagt, ob der angemeldete Nutzer die unternehmensweite
 * Konfiguration ueberhaupt aendern darf. Vorher hat jeder Seitenaufruf das
 * Zurueckschreiben versucht, auch als Vertriebspartner. Die Zugriffsregel der
 * Tabelle hat das abgelehnt (Fehlercode 42501), und aus dem abgelehnten
 * Versprechen wurde ein Ticket, obwohl der Partner nur eine Seite geoeffnet
 * hatte. Wer nicht schreiben darf, arbeitet jetzt einfach mit dem Stand aus
 * seinem eigenen Programm weiter.
 */
function loadUnterlagen(darfSchreiben: boolean): UnterlagenAbschnitt[] {
  const saved = getAppConfig<{ ver: string; data: UnterlagenAbschnitt[] } | null>(STORE_KEY, null);

  // Die Liste liegt in app_config und gilt fuer alle. Wer die Seite oeffnet,
  // schreibt sie mit der Fassung seines eigenen Programmstands zurueck. Ein
  // Kollege mit einem alten, noch im Browser zwischengespeicherten Stand hat
  // damit den ganzen Betrieb auf seine alte Liste zurueckgesetzt. Deshalb:
  // nur nach vorne, nie zurueck.
  const gespeicherteVersion = Number(saved?.ver ?? -1);
  const eigeneVersion = Number(UNTERLAGEN_VERSION);
  if (saved && gespeicherteVersion >= eigeneVersion) {
    const { daten, geaendert } = ohneEntfallene(saved.data);
    const frisch = ausSeedAktualisiert(daten);
    // Aufraeumen im Hintergrund, nicht vom Nutzer ausgeloest: still.
    if (geaendert && darfSchreiben) {
      void setAppConfig(STORE_KEY, { ver: saved.ver, data: frisch }, { still: true });
    }
    return frisch;
  }

  const seed = seedUnterlagen();
  if (darfSchreiben) {
    void setAppConfig(STORE_KEY, { ver: UNTERLAGEN_VERSION, data: seed }, { still: true });
  }
  return seed;
}

/** Vom Nutzer ausgeloest, deshalb mit sichtbarer Meldung, wenn es scheitert. */
function persistUnterlagen(data: UnterlagenAbschnitt[]) {
  void setAppConfig(STORE_KEY, { ver: UNTERLAGEN_VERSION, data });
}

// Maps pdfKey → lazy generator loader (jspdf only loaded on first click).
const PDF_GENERATORS: Record<string, () => Promise<void>> = {
  "mietfreibestaetigung": async () => (await import("@/lib/mietfreibestaetigungPdf")).generateMietfreibestaetigungPDF(),
  "checkliste-bonitaet": async () => (await import("@/lib/unterlagenPdfContent")).generateChecklisteBonitaetPDF(),
  "lohnsteueroptimierung": async () => (await import("@/lib/unterlagenPdfContent")).generateLohnsteueroptimierungPDF(),
  "ehegattenschaukel": async () => (await import("@/lib/unterlagenPdfContent")).generateEhegattenschaukelPDF(),
  "checkliste-steuerersparnis": async () => (await import("@/lib/unterlagenPdfContent")).generateChecklisteSteuerersparnisPDF(),
  "elster-anleitung": async () => (await import("@/lib/unterlagenPdfContent")).generateElsterAnleitungPDF(),
  "aftersales-beratung": async () => (await import("@/lib/unterlagenPdfContent")).generateAftersalesBeratungPDF(),
  "hvv-muster-vertrag":   async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvVertragMusterPDF(),
  "hvv-muster-anlage-1":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage1MusterPDF(),
  "hvv-muster-anlage-2":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage2MusterPDF(),
  "hvv-muster-anlage-3":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage3MusterPDF(),
  "hvv-muster-anlage-4":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage4MusterPDF(),
  "hvv-muster-anlage-5":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage5MusterPDF(),
  "hvv-muster-anlage-6":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage6MusterPDF(),
  "hvv-muster-anlage-7":  async () => (await import("@/lib/handelsvertretervertragMuster")).generateHvvAnlage7MusterPDF(),
  "leitfaden-kaltakquise": async () => (await import("@/lib/unterlagenPdfContent")).generateLeitfadenKaltakquisePDF(),
  "leitfaden-warmkontakte": async () => (await import("@/lib/unterlagenPdfContent")).generateLeitfadenWarmkontaktePDF(),
  "einwandbehandlung": async () => (await import("@/lib/unterlagenPdfContent")).generateEinwandbehandlungPDF(),
  "steuerwissen": async () => (await import("@/lib/unterlagenPdfContent")).generateSteuerwissenPDF(),
  "steuersaetze": async () => (await import("@/lib/unterlagenPdfContent")).generateSteuersaetzePDF(),
  "mail-setup-anleitung": async () => (await import("@/lib/unterlagenPdfContent")).generateMailSetupPDF(),
  "kultur-manifest": async () => (await import("@/lib/kulturManifestPdf")).generateKulturManifestPDF(),
};



export default function Unterlagen() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAdmin = user.role === "admin" || user.role === "inhaber";

  const [abschnitte, setAbschnitte] = useState<UnterlagenAbschnitt[]>(() => loadUnterlagen(isAdmin));
  const [rechnungOpen, setRechnungOpen] = useState(false);
  const [signaturOpen, setSignaturOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem("unterlagen_open_sections");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });


  // ── Edit-Dialoge ──
  const [editAbschnittId, setEditAbschnittId] = useState<string | null>(null);
  const [editAbschnittName, setEditAbschnittName] = useState("");
  const [addDokSection, setAddDokSection] = useState<string | null>(null);
  const [editDokTarget, setEditDokTarget] = useState<{ sectionId: string; dok: UnterlagenDokument } | null>(null);
  const [dokForm, setDokForm] = useState<UnterlagenDokument>({
    id: "", name: "", aktion: "external-link", url: "",
  });

  const persist = (data: UnterlagenAbschnitt[]) => {
    setAbschnitte(data);
    persistUnterlagen(data);
  };

  const toggle = (id: string) => setOpenSections((p) => {
    const next = { ...p, [id]: !p[id] };
    try { sessionStorage.setItem("unterlagen_open_sections", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // ── Sichtbarkeit ──
  const visibleAbschnitte = useMemo(() =>
    ohneOverheadDokumente(abschnitte).map((a) => ({
      ...a,
      dokumente: a.dokumente.filter((d) => isAdmin || !d.nurAdmin),
    })),
    [abschnitte, isAdmin],
  );

  // ── Aktionen ──
  const handleDokumentClick = async (dok: UnterlagenDokument) => {
    if (dok.gesperrt && !isAdmin) {
      toast({ title: "Bald verfügbar", description: "Dieses Dokument wird in Kürze freigegeben." });
      return;
    }

    switch (dok.aktion) {
      case "pdf-download": {
        const gen = dok.pdfKey ? PDF_GENERATORS[dok.pdfKey] : null;
        if (!gen) {
          toast({
            title: isAdmin ? "PDF noch nicht implementiert" : "Bald verfügbar",
            description: isAdmin ? `PDF-Generator '${dok.pdfKey}' fehlt noch (Loop B).` : undefined,
          });
          return;
        }
        try {
          await gen();
          toast({ title: `${dok.name} heruntergeladen ✓` });
        } catch (err) {
          console.error(err);
          toast({ title: "Fehler beim Erstellen des PDFs", variant: "destructive" });
        }
        return;
      }
      case "internal-link":
        // Nicht navigieren, wenn die Rolle das Ziel nicht oeffnen darf,
        // sonst leitet der Route-Guard kommentarlos aufs Dashboard um.
        if (dok.interneRoute && darfRouteOeffnen(dok.interneRoute)) navigate(dok.interneRoute);
        return;
      case "external-link":
        if (dok.url) {
          if (dok.download) {
            const a = document.createElement("a");
            a.href = dok.url;
            const fileName = dok.url.split("/").pop() || "download";
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast({ title: `${dok.name} heruntergeladen ✓` });
          } else {
            window.open(dok.url, "_blank", "noopener,noreferrer");
          }
        }
        return;
      case "tool-inline":
        if (dok.toolKey === "rechnungs-generator") {
          navigate("/unterlagen/rechnungsvorlage");
        } else if (dok.toolKey === "email-signatur") {
          navigate("/unterlagen/email-signatur");
        } else {
          toast({
            title: dok.gesperrt ? "Bald verfügbar" : "Tool noch nicht verfügbar",
            description: isAdmin ? `Tool '${dok.toolKey}' ist noch nicht implementiert.` : undefined,
          });
        }
        return;
      case "upload":
        if (dok.url) window.open(dok.url, "_blank", "noopener,noreferrer");
        return;
    }
  };

  // ── CRUD: Abschnitt umbenennen ──
  const saveAbschnittName = () => {
    if (guardTestWrite("Abschnitt umbenennen")) return;
    if (!editAbschnittId || !editAbschnittName.trim()) return;
    persist(abschnitte.map((a) => (a.id === editAbschnittId ? { ...a, name: editAbschnittName.trim() } : a)));
    setEditAbschnittId(null);
    toast({ title: "Abschnitt umbenannt ✓" });
  };

  // ── CRUD: Dokument anlegen / bearbeiten ──
  const openAddDok = (sectionId: string) => {
    setDokForm({ id: "", name: "", aktion: "external-link", url: "" });
    setAddDokSection(sectionId);
  };

  const openEditDok = (sectionId: string, dok: UnterlagenDokument) => {
    setDokForm({ ...dok });
    setEditDokTarget({ sectionId, dok });
  };

  const saveDokument = () => {
    if (guardTestWrite("Dokument speichern")) return;
    if (!dokForm.name.trim()) return;

    if (editDokTarget) {
      const { sectionId, dok } = editDokTarget;
      persist(abschnitte.map((a) =>
        a.id !== sectionId ? a : { ...a, dokumente: a.dokumente.map((d) => d.id === dok.id ? { ...dokForm } : d) },
      ));
      setEditDokTarget(null);
      toast({ title: "Dokument aktualisiert ✓" });
    } else if (addDokSection) {
      const newDok: UnterlagenDokument = { ...dokForm, id: `d-${Date.now()}` };
      persist(abschnitte.map((a) =>
        a.id !== addDokSection ? a : { ...a, dokumente: [...a.dokumente, newDok] },
      ));
      setAddDokSection(null);
      toast({ title: "Dokument hinzugefügt ✓" });
    }
  };

  const deleteDokument = async (sectionId: string, dokId: string) => {
    if (guardTestWrite("Dokument löschen")) return;
    const ok = await confirmDialog({
      title: "Dokument wirklich löschen?",
      description: "Das Dokument verschwindet aus diesem Abschnitt.",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    persist(abschnitte.map((a) =>
      a.id !== sectionId ? a : { ...a, dokumente: a.dokumente.filter((d) => d.id !== dokId) },
    ));
    toast({ title: "Dokument entfernt" });
  };

  // ── Render-Helpers ──
  const getActionIcon = (aktion?: UnterlagenAktion) => {
    switch (aktion) {
      case "pdf-download": return Download;
      case "internal-link": return ExternalLink;
      case "external-link": return LinkIcon;
      case "tool-inline": return Wrench;
      default: return FileText;
    }
  };

  // Routen, die in der Sidebar erscheinen → bekommen "Im CRM öffnen"-Badge.
  // Zusaetzlich gilt: Der Knopf erscheint nur, wenn die eigene Rolle das
  // Ziel auch oeffnen darf. Sonst zeigte die Kachel einen Klick an, der per
  // Route-Guard auf dem Dashboard landet (z. B. Zielplanung im Backoffice).
  const SIDEBAR_ROUTES = new Set<string>([
    "/afa-rechner", "/zielplanung",
    "/academy", "/immobilien-lexikon", "/chat",
    "/support-kontaktieren",
  ]);
  const darfRouteOeffnen = (route?: string): boolean =>
    !!route && isUrlAllowedForRole(route, user.role);

  // Sektionen, in denen Action-Badges (außer Entwurf/Bald verfügbar) ausgeblendet werden
  const HIDE_ACTION_BADGE_SECTIONS = new Set<string>([
    "karriere", "marketing", "organisation", "aftersales",
  ]);

  const getActionLabel = (dok: UnterlagenDokument, sectionId?: string): string | null => {
    if (dok.gesperrt && isAdmin) return "Entwurf";
    if (dok.gesperrt) return "Bald verfügbar";
    if (sectionId && HIDE_ACTION_BADGE_SECTIONS.has(sectionId)) return null;
    switch (dok.aktion) {
      case "pdf-download": return "PDF-Download";
      case "internal-link":
        return dok.interneRoute && SIDEBAR_ROUTES.has(dok.interneRoute) && darfRouteOeffnen(dok.interneRoute)
          ? "Im CRM öffnen"
          : null;
      case "external-link": return "Externer Link";
      case "tool-inline": return "Tool";
      default: return null;
    }
  };

  const dialogOpen = !!addDokSection || !!editDokTarget;
  const closeDialog = () => { setAddDokSection(null); setEditDokTarget(null); };

  return (
    <DashboardLayout>
      <div className="library-apple">
        {/* Apple Hero */}
        <header className="la-hero">
          <span className="la-eyebrow relative">OS Immobilien · Dokumente</span>
          <h1 className="la-display">Deine komplette Bibliothek.</h1>
          <p className="la-subtitle relative">
            Alle Vertriebsmaterialien, Tools, Steuer-Strategien und Vorlagen — kuratiert und an einem Ort.
          </p>
          <div className="la-hero-actions">
            <span className="la-count-pill" style={{ background: "hsl(0 0% 100% / 0.1)", border: "1px solid hsl(0 0% 100% / 0.18)", color: "hsl(0 0% 100% / 0.85)" }}>
              {visibleAbschnitte.length} Kategorien
            </span>
            <span className="la-count-pill" style={{ background: "hsl(0 0% 100% / 0.1)", border: "1px solid hsl(0 0% 100% / 0.18)", color: "hsl(0 0% 100% / 0.85)" }}>
              {visibleAbschnitte.reduce((n, a) => n + a.dokumente.length, 0)} Einträge
            </span>
          </div>
        </header>

        <div className="space-y-4">
          {visibleAbschnitte.map((abschnitt) => {
            const Icon = SECTION_ICONS[abschnitt.id] ?? FileText;
            const isOpen = openSections[abschnitt.id] ?? false;
            const docCount = abschnitt.customRender === "wissenswert"
              ? WISSENS_ARTIKEL.length
              : abschnitt.dokumente.length;

            return (
              <Card key={abschnitt.id} id={`sec-${abschnitt.id}`} className="la-section border-0 shadow-none overflow-hidden scroll-mt-24">
                {/* Header */}
                <div className="flex h-[62px] sm:h-auto items-center justify-between px-5 py-0 sm:py-4 border-b">
                  <button
                    onClick={() => toggle(abschnitt.id)}
                    className="flex h-full items-center gap-3 text-left flex-1 min-w-0 overflow-hidden"
                  >
                    <span className="la-section-glyph"><Icon /></span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0 h-6 overflow-hidden">
                        <span className="la-section-title truncate">{abschnitt.name}</span>
                        {(!abschnitt.customRender || abschnitt.customRender === "wissenswert") && (
                          <span className="la-count-pill">{docCount}</span>
                        )}
                        {abschnitt.id === "leadarbeit" && isNewBadgeActive(SEEN_KEYS.leadArbeit) && (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide shrink-0">
                            Neu
                          </Badge>
                        )}
                        {isOpen
                          ? <ChevronDown className="h-4 w-4 opacity-40 shrink-0" />
                          : <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />}
                      </div>
                      {abschnitt.beschreibung && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{abschnitt.beschreibung}</p>
                      )}
                    </div>
                  </button>
                  {isAdmin && !abschnitt.customRender && (
                    <div className="hidden sm:flex items-center gap-1">
                      <Button
                        size="icon" aria-label="Bearbeiten" variant="ghost" className="h-7 w-7"
                        title="Umbenennen"
                        onClick={() => { setEditAbschnittId(abschnitt.id); setEditAbschnittName(abschnitt.name); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" aria-label="Hinzufügen" variant="ghost" className="h-7 w-7"
                        title="Dokument hinzufügen"
                        onClick={() => openAddDok(abschnitt.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Body */}
                {isOpen && (
                  <CardContent className="p-4">
                    {abschnitt.customRender === "wissenswert" ? (
                      <WissenswertSection />
                    ) : abschnitt.id === "marketing" ? (
                      <MarketingGrid
                        dokumente={abschnitt.dokumente}
                        onClick={handleDokumentClick}
                      />
                    ) : abschnitt.dokumente.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-2">Noch keine Dokumente vorhanden.</p>
                        {isAdmin && (
                          <Button size="sm" variant="outline" onClick={() => openAddDok(abschnitt.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Dokument hinzufügen
                          </Button>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {abschnitt.dokumente.map((dok) => {
                          const ActionIcon = getActionIcon(dok.aktion);
                          const label = getActionLabel(dok, abschnitt.id);
                          const isLocked = dok.gesperrt && !isAdmin;
                          return (
                            <li
                              key={dok.id}
                              className={`group flex items-start gap-3 py-2.5 px-3 rounded border border-transparent transition-colors ${
                                isLocked ? "opacity-70" : "hover:bg-muted/50 hover:border-border"
                              }`}
                            >
                              {dok.vorschauUrl ? (
                                <button
                                  onClick={() => handleDokumentClick(dok)}
                                  disabled={isLocked && !isAdmin}
                                  className="h-12 w-12 rounded border bg-[conic-gradient(at_50%_50%,#f8f8f8_25%,#fff_0_50%,#f8f8f8_0_75%,#fff_0)] bg-[length:8px_8px] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden hover:ring-2 hover:ring-primary/40 transition"
                                  title="Vorschau – klicken zum Herunterladen"
                                >
                                  <img
                                    src={dok.vorschauUrl}
                                    alt={`${dok.name} Vorschau`}
                                    className="max-h-full max-w-full object-contain p-1"
                                  />
                                </button>
                              ) : (
                                <div className="h-8 w-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                                  {isLocked ? <Lock className="h-4 w-4" /> : <ActionIcon className="h-4 w-4" />}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => handleDokumentClick(dok)}
                                  disabled={isLocked && !isAdmin}
                                  className="text-left w-full"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm hover:text-primary transition-colors">
                                      {dok.name}
                                    </span>
                                    {label && (
                                      <Badge
                                        variant={dok.gesperrt ? (isAdmin ? "outline" : "secondary") : "secondary"}
                                        className={`text-[10px] ${dok.gesperrt && isAdmin ? "border-orange-400 text-orange-600" : ""}`}
                                      >
                                        {label}
                                      </Badge>
                                    )}
                                    {dok.alt && (
                                      <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-600">
                                        Alt
                                      </Badge>
                                    )}
                                    {dok.nurAdmin && (
                                      <Badge variant="outline" className="text-[10px] border-primary text-primary">
                                        nur Admin
                                      </Badge>
                                    )}
                                  </div>
                                  {dok.beschreibung && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dok.beschreibung}</p>
                                  )}
                                </button>
                              </div>
                              {isAdmin && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="icon" aria-label="Bearbeiten" variant="ghost" className="h-7 w-7" onClick={() => openEditDok(abschnitt.id, dok)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon" aria-label="Löschen" variant="ghost"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => deleteDokument(abschnitt.id, dok.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                        {isAdmin && (
                          <li>
                            <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => openAddDok(abschnitt.id)}>
                              <Plus className="h-3 w-3 mr-1" /> Dokument hinzufügen
                            </Button>
                          </li>
                        )}
                      </ul>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Abschnitt umbenennen ── */}
      <Dialog open={!!editAbschnittId} onOpenChange={(o) => !o && setEditAbschnittId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abschnitt umbenennen</DialogTitle>
          </DialogHeader>
          <Input value={editAbschnittName} onChange={(e) => setEditAbschnittName(e.target.value)} placeholder="Name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAbschnittId(null)}>Abbrechen</Button>
            <Button onClick={saveAbschnittName}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dokument-Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editDokTarget ? "Dokument bearbeiten" : "Neues Dokument"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <Input value={dokForm.name} onChange={(e) => setDokForm({ ...dokForm, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Beschreibung</label>
              <Textarea
                value={dokForm.beschreibung || ""}
                onChange={(e) => setDokForm({ ...dokForm, beschreibung: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Aktion</label>
              <Select
                value={dokForm.aktion || "external-link"}
                onValueChange={(v) => setDokForm({ ...dokForm, aktion: v as UnterlagenAktion })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="external-link">Externer Link</SelectItem>
                  <SelectItem value="internal-link">Interne Route (CRM)</SelectItem>
                  <SelectItem value="pdf-download">PDF-Download (generiert)</SelectItem>
                  <SelectItem value="upload">Datei-Upload-Link</SelectItem>
                  <SelectItem value="tool-inline">Inline-Tool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(dokForm.aktion === "external-link" || dokForm.aktion === "upload") && (
              <div>
                <label className="text-xs text-muted-foreground">URL</label>
                <Input
                  value={dokForm.url || ""}
                  onChange={(e) => setDokForm({ ...dokForm, url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            )}
            {dokForm.aktion === "internal-link" && (
              <div>
                <label className="text-xs text-muted-foreground">Interne Route</label>
                <Input
                  value={dokForm.interneRoute || ""}
                  onChange={(e) => setDokForm({ ...dokForm, interneRoute: e.target.value })}
                  placeholder="/afa-rechner"
                />
              </div>
            )}
            {dokForm.aktion === "pdf-download" && (
              <div>
                <label className="text-xs text-muted-foreground">PDF-Schlüssel (pdfKey)</label>
                <Input
                  value={dokForm.pdfKey || ""}
                  onChange={(e) => setDokForm({ ...dokForm, pdfKey: e.target.value })}
                  placeholder="mietfreibestaetigung"
                />
              </div>
            )}
            {dokForm.aktion === "tool-inline" && (
              <div>
                <label className="text-xs text-muted-foreground">Tool-Schlüssel (toolKey)</label>
                <Input
                  value={dokForm.toolKey || ""}
                  onChange={(e) => setDokForm({ ...dokForm, toolKey: e.target.value })}
                  placeholder="rechnungs-generator"
                />
              </div>
            )}
            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dokForm.gesperrt || false}
                  onChange={(e) => setDokForm({ ...dokForm, gesperrt: e.target.checked })}
                />
                Bald verfügbar (gesperrt)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dokForm.nurAdmin || false}
                  onChange={(e) => setDokForm({ ...dokForm, nurAdmin: e.target.checked })}
                />
                Nur Admin
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Abbrechen</Button>
            <Button onClick={saveDokument}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RechnungsGeneratorDialog open={rechnungOpen} onOpenChange={setRechnungOpen} />
      <EmailSignaturDialog open={signaturOpen} onOpenChange={setSignaturOpen} />
    </DashboardLayout>
  );
}
