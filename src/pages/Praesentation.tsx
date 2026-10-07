import { useState, useRef, useMemo } from "react";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { objektbereichGesperrt } from "@/lib/sidebarNavigation";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ChevronUp, ChevronDown, Pencil, Plus, Trash2, FileText,
  Download, ExternalLink, Upload, Link as LinkIcon,
  Building2, Quote, BookOpen, Calculator, Presentation,
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { addKontakt, getKontakte } from "@/lib/kundenStore";
import { getAppConfig, setAppConfig } from "@/lib/appConfigStore";
import { KundenstimmenSection } from "@/components/praesentation/KundenstimmenSection";
import { WissenswertSection } from "@/components/praesentation/WissenswertSection";
import { PhoneInput } from "@/components/ui/phone-input";

const canEdit = (role: string) => ["admin", "inhaber"].includes(role);

interface Dokument {
  id: string;
  name: string;
  url: string;
  typ: "upload" | "link";
  dateityp?: string;
  /** Spezial-Aktionen, die statt einfacher Links/Uploads gerendert werden */
  action?: "pdf-download" | "internal-link";
  internalRoute?: string;
  /**
   * Abgeloeste Fassung. Traegt das Badge "Alt" und wird nur noch der Leitung
   * gezeigt. Die alten Praesentationen bleiben erhalten, damit man
   * nachschlagen kann, was frueher wie formuliert war.
   */
  alt?: boolean;
}

interface Abschnitt {
  id: string;
  name: string;
  /** Render-Modus für komplette Sektionen */
  customRender?: "kundenstimmen" | "wissenswert";
  dokumente: Dokument[];
}

const CURRENT_VER = "11";

function seedAbschnitte(): Abschnitt[] {
  return [
    {
      id: "1", name: "Präsentation", dokumente: [
        // Die aktuelle Fassung, sichtbar fuer alle. Das war bis eben die
        // HV-Fassung; sie ist jetzt die einzige, mit der im Vertrieb
        // gearbeitet wird, und traegt deshalb den schlichten Namen.
        {
          id: "1hv",
          name: "Beratungspräsentation MOREImmo",
          url: "/beratungspraesentation-moreimmo",
          typ: "link",
          action: "internal-link",
          internalRoute: "/beratungspraesentation-moreimmo",
        },
        // Die PDF-Fassung zum Herunterladen und Praesentieren. Im Termin ist die
        // Webfassung darueber der bevorzugte Weg, das sagt auch der Name.
        {
          id: "1pdf",
          name: "Beratungspräsentation als PDF (bevorzugt die Webfassung nutzen)",
          url: "/dokumente/beratungspraesentation.pdf",
          typ: "link",
        },
        // Nur noch die aktuelle MOREImmo-Fassung. Die abgeloesten Varianten
        // wurden entfernt, damit ueberall dieselbe Praesentation steht.
      ],
    },
    {
      id: "2", name: "Bonitätscheck", dokumente: [
        {
          id: "2d",
          name: "Schufa-Bestellung (selbstauskunft.de)",
          url: "https://selbstauskunft.de/?gad_source=1&gad_campaignid=20743780254&gbraid=0AAAAAoXCn_3L9WlSJw_scB80MzrP4nMaR&gclid=CjwKCAjwpcTNBhA5EiwAdO1S9jyb7ZawK2jbkX-3Nw7vae0CReo9jDASw4nYOgBGDYuuznEPD3T-XRoCCKkQAvD_BwE#form",
          typ: "link",
        },
        {
          id: "2e",
          name: "Mietfreibestätigung (PDF zum Download)",
          url: "",
          typ: "link",
          action: "pdf-download",
        },
      ],
    },
    {
      id: "3", name: "Objektbeispiele", dokumente: [
        {
          id: "3a",
          name: "Aktuelle Objekte ansehen",
          url: "/objekte",
          typ: "link",
          action: "internal-link",
          internalRoute: "/objekte",
        },
        {
          id: "3b",
          name: "Objekte in Investagon",
          url: "https://fmd-invest.investagon.com/properties",
          typ: "link",
        },
      ],
    },
    { id: "4", name: "Kundenstimmen", dokumente: [], customRender: "kundenstimmen" },
    { id: "5", name: "Wissenswert", dokumente: [], customRender: "wissenswert" },
  ];
}

/**
 * Ergänzt fehlende Standard-Einträge im gespeicherten Stand, ohne etwas zu
 * entfernen. Selbst hinzugefügte Dokumente und eigene Abschnitte bleiben
 * unangetastet, nur was aus dem Seed fehlt, wird nachgetragen.
 *
 * Der Grund: Die Seite liegt als Ganzes in der App-Konfiguration. Ein
 * gespeicherter Stand mit passender Versionsnummer wurde bisher unverändert
 * übernommen, auch wenn im Seed inzwischen ein Eintrag dazugekommen war. So
 * fehlte die aktuelle Beratungspräsentation in einem einmal gespeicherten
 * Stand dauerhaft. Ein Zurücksetzen auf den Seed wäre die falsche Antwort,
 * das würde selbst hochgeladene Dokumente löschen.
 */
/**
 * Dokumente, die es nicht mehr gibt und die deshalb auch aus einem bereits
 * gespeicherten Stand verschwinden müssen.
 */
const ENTFALLENE_DOKUMENT_IDS = [
  // Haushaltsrechner / Bonitätsrechner: die Seite gibt es nicht mehr.
  "2f",
  // Abgeloeste Beratungspraesentationen. Es bleibt nur die MOREImmo-Fassung.
  "1n",
  "1a",
  "1b",
  "1c",
];

/**
 * Beschriftung, Ziel und Sichtbarkeit gehoeren dem Seed, nicht dem Speicher.
 *
 * Der gespeicherte Stand darf die Reihenfolge bestimmen und eigene Dokumente
 * enthalten. Wie ein Eintrag aus dem Seed heisst und wohin er zeigt, entscheidet
 * dagegen der Code. Vorher wurde ein einmal gespeicherter Eintrag nie wieder
 * angefasst: Die HV-Fassung hiess deshalb bei Hermann Vogl weiter
 * "Beratungspraesentation MOREImmo HV", obwohl sie im Code laengst umbenannt war.
 */
function ausSeedAktualisiert<T extends { id: string }>(gespeichert: T, ausSeed?: T): T {
  if (!ausSeed) return gespeichert;
  const { name, url, action, internalRoute, alt } = ausSeed as unknown as Dokument;
  return { ...gespeichert, name, url, action, internalRoute, alt } as T;
}

function ergaenzeFehlendeSeedEintraege(gespeichert: Abschnitt[]): Abschnitt[] {
  const seed = seedAbschnitte();
  const ergebnis = gespeichert.map((roh) => {
    const seedDokumente = seed.find((s) => s.id === roh.id)?.dokumente || [];
    const abschnitt = {
      ...roh,
      dokumente: roh.dokumente
        .filter((d) => !ENTFALLENE_DOKUMENT_IDS.includes(d.id))
        .map((d) => ausSeedAktualisiert(d, seedDokumente.find((sd) => sd.id === d.id))),
    };
    const seedAbschnitt = seed.find((s) => s.id === abschnitt.id);
    if (!seedAbschnitt) return abschnitt;
    const vorhandeneIds = new Set(abschnitt.dokumente.map((d) => d.id));
    const fehlende = seedAbschnitt.dokumente.filter((d) => !vorhandeneIds.has(d.id));
    if (fehlende.length === 0) return abschnitt;
    // Die aktuelle Präsentation gehört nach oben, alles andere wird angehängt.
    const nachVorne = fehlende.filter((d) => !d.alt);
    const nachHinten = fehlende.filter((d) => d.alt);
    return { ...abschnitt, dokumente: [...nachVorne, ...abschnitt.dokumente, ...nachHinten] };
  });
  // Ganze Abschnitte, die im gespeicherten Stand fehlen, kommen ebenfalls dazu.
  const vorhandeneAbschnitte = new Set(ergebnis.map((a) => a.id));
  for (const s of seed) {
    if (!vorhandeneAbschnitte.has(s.id)) ergebnis.push(s);
  }
  return ergebnis;
}

/**
 * `darfSchreiben` sagt, ob der Nutzer die unternehmensweite Konfiguration
 * aendern darf. Ohne dieses Recht wird beim Oeffnen der Seite gar nicht erst
 * zurueckgeschrieben, sonst lehnt die Zugriffsregel der Tabelle den Versuch
 * ab und der Nutzer sieht einen Fehler, den er nicht ausgeloest hat.
 */
function loadAbschnitte(darfSchreiben: boolean): Abschnitt[] {
  const saved = getAppConfig<{ ver: string; data: Abschnitt[] } | null>("praesentation_abschnitte", null);

  // Die Liste liegt in app_config und gilt fuer alle. Wer die Seite oeffnet,
  // schreibt sie mit der Fassung seines eigenen Programmstands zurueck. Ein
  // Kollege mit einem alten, noch im Browser zwischengespeicherten Stand hat
  // damit den ganzen Betrieb auf seine alte Liste zurueckgesetzt.
  //
  // Deshalb: nur nach vorne. Ist der gespeicherte Stand neuer als der eigene,
  // wird er gelesen, aber nicht ueberschrieben.
  const gespeicherteVersion = Number(saved?.ver ?? -1);
  const eigeneVersion = Number(CURRENT_VER);
  if (saved && gespeicherteVersion >= eigeneVersion) {
    return ergaenzeFehlendeSeedEintraege(saved.data);
  }

  const seed = seedAbschnitte();
  if (darfSchreiben) {
    void setAppConfig("praesentation_abschnitte", { ver: CURRENT_VER, data: seed }, { still: true });
  }
  return seed;
}

/** Vom Nutzer ausgeloest, deshalb mit sichtbarer Meldung, wenn es scheitert. */
function saveAbschnitte(data: Abschnitt[]) {
  void setAppConfig("praesentation_abschnitte", { ver: CURRENT_VER, data });
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "1": Presentation,
  "2": Calculator,
  "3": Building2,
  "4": Quote,
  "5": BookOpen,
};

export default function Praesentation() {
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isEditor = canEdit(user.role);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [abschnitte, setAbschnitte] = useState<Abschnitt[]>(() => loadAbschnitte(isEditor));

  // Interne Verlinkungen respektieren die Rollenrechte. Sonst führt hier ein
  // Link auf eine Seite, die in der Navigation für diese Rolle ausgeblendet
  // ist (zum Beispiel der Bonitätsrechner beim Vertriebspartner).
  const sichtbareAbschnitte = useMemo(
    () =>
      abschnitte.map((a) => ({
        ...a,
        dokumente: a.dokumente.filter(
          (d) =>
            // Abgeloeste Fassungen sieht nur noch die Leitung. Sie werden
            // nicht geloescht, damit man nachschlagen kann, was frueher wie
            // formuliert war, aber im Vertrieb soll nur die aktuelle
            // Praesentation auftauchen.
            (!d.alt || isEditor) &&
            (!d.internalRoute ||
              (isUrlAllowedForRole(d.internalRoute, user.role) && !objektbereichGesperrt(d.internalRoute, { rolle: user.role, identitaet: { userId: authUser?.id, email: authUser?.email } }))),
        ),
      })),
    [abschnitte, user.role, isEditor, authUser?.id, authUser?.email],
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // Dialog states
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");

  const [addDokId, setAddDokId] = useState<string | null>(null);
  const [dokForm, setDokForm] = useState({ name: "", url: "", typ: "upload" as "upload" | "link" });

  const [editDok, setEditDok] = useState<{ sectionId: string; dok: Dokument } | null>(null);
  const [editDokForm, setEditDokForm] = useState({ name: "", url: "", typ: "upload" as "upload" | "link" });

  const [uploadTarget, setUploadTarget] = useState<{ sectionId: string; dokId: string } | null>(null);

  // Kontakt dialog
  const [kontaktOpen, setKontaktOpen] = useState(false);
  const [newKontakt, setNewKontakt] = useState({
    anrede: "", vorname: "", nachname: "", email: "", telefon: "",
    quelle: "", firma: "", position: "",
    strasse: "", hausnummer: "", plz: "", ort: "",
  });

  const persist = (data: Abschnitt[]) => {
    setAbschnitte(data);
    saveAbschnitte(data);
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Abschnitte CRUD ──
  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const id = `s-${Date.now()}`;
    const updated = [...abschnitte, { id, name: newSectionName.trim(), dokumente: [] }];
    persist(updated);
    setOpenSections((prev) => ({ ...prev, [id]: true }));
    setNewSectionName("");
    setAddSectionOpen(false);
    toast({ title: "Abschnitt angelegt ✓" });
  };

  const handleEditSection = () => {
    if (!editSectionId || !editSectionName.trim()) return;
    persist(abschnitte.map((a) => (a.id === editSectionId ? { ...a, name: editSectionName.trim() } : a)));
    setEditSectionId(null);
    toast({ title: "Abschnitt umbenannt ✓" });
  };

  const handleDeleteSection = async (id: string) => {
    const ok = await confirmDialog({
      title: "Abschnitt wirklich löschen?",
      description: "Der Abschnitt und die darin abgelegten Einträge verschwinden aus der Präsentation.",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    persist(abschnitte.filter((a) => a.id !== id));
    toast({ title: "Abschnitt gelöscht" });
  };

  // ── Dokumente CRUD ──
  const handleAddDok = () => {
    if (!addDokId || !dokForm.name.trim()) return;
    const dok: Dokument = { id: `d-${Date.now()}`, name: dokForm.name.trim(), url: dokForm.url, typ: dokForm.typ };
    persist(abschnitte.map((a) => (a.id === addDokId ? { ...a, dokumente: [...a.dokumente, dok] } : a)));
    setAddDokId(null);
    setDokForm({ name: "", url: "", typ: "upload" });
    toast({ title: "Dokument hinzugefügt ✓" });
  };

  const handleEditDok = () => {
    if (!editDok) return;
    const updated = abschnitte.map((a) => {
      if (a.id !== editDok.sectionId) return a;
      return {
        ...a, dokumente: a.dokumente.map((d) =>
          d.id === editDok.dok.id ? { ...d, name: editDokForm.name, url: editDokForm.url, typ: editDokForm.typ } : d,
        ),
      };
    });
    persist(updated);
    setEditDok(null);
    toast({ title: "Dokument aktualisiert ✓" });
  };

  const handleDeleteDok = (sectionId: string, dokId: string) => {
    persist(abschnitte.map((a) => (a.id === sectionId ? { ...a, dokumente: a.dokumente.filter((d) => d.id !== dokId) } : a)));
    toast({ title: "Dokument entfernt" });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadTarget || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    persist(abschnitte.map((a) => {
      if (a.id !== uploadTarget.sectionId) return a;
      return {
        ...a, dokumente: a.dokumente.map((d) =>
          d.id === uploadTarget.dokId ? { ...d, url, typ: "upload" as const, dateityp: file.name.split(".").pop() } : d,
        ),
      };
    }));
    setUploadTarget(null);
    toast({ title: `"${file.name}" hochgeladen ✓` });
  };

  // ── Kontakt ──
  const updK = (field: string, value: string) => setNewKontakt((p) => ({ ...p, [field]: value }));
  const handleCreateKontakt = () => {
    if (!newKontakt.vorname.trim() || !newKontakt.nachname.trim()) {
      toast({ title: "Fehler", description: "Vor- und Nachname sind Pflichtfelder.", variant: "destructive" });
      return;
    }
    const emailLower = (newKontakt.email || "").trim().toLowerCase();
    if (emailLower) {
      const existing = getKontakte().find((k) => k.email?.toLowerCase() === emailLower);
      if (existing) {
        toast({
          title: "E-Mail bereits vergeben",
          description: `Diese E-Mail ist bereits dem Kontakt "${existing.vorname} ${existing.nachname}" zugeordnet.`,
          variant: "destructive",
        });
        return;
      }
    }
    addKontakt({
      anrede: newKontakt.anrede, vorname: newKontakt.vorname.trim(), nachname: newKontakt.nachname.trim(),
      email: newKontakt.email, telefon: newKontakt.telefon,
      quelle: newKontakt.quelle, firma: newKontakt.firma, position: newKontakt.position,
      strasse: newKontakt.strasse, hausnummer: newKontakt.hausnummer, plz: newKontakt.plz, ort: newKontakt.ort,
    });
    toast({ title: "Kontakt angelegt ✓", description: `${newKontakt.vorname} ${newKontakt.nachname}` });
    setKontaktOpen(false);
    setNewKontakt({ anrede: "", vorname: "", nachname: "", email: "", telefon: "", quelle: "", firma: "", position: "", strasse: "", hausnummer: "", plz: "", ort: "" });
  };

  const handleDokumentClick = async (dok: Dokument, e: React.MouseEvent) => {
    if (dok.action === "pdf-download") {
      e.preventDefault();
      try {
        const { generateMietfreibestaetigungPDF } = await import("@/lib/mietfreibestaetigungPdf");
        await generateMietfreibestaetigungPDF();
        toast({ title: "Mietfreibestätigung heruntergeladen ✓" });
      } catch (err) {
        toast({ title: "Fehler beim Erstellen des PDFs", variant: "destructive" });
      }
      return;
    }
    if (dok.action === "internal-link" && dok.internalRoute) {
      e.preventDefault();
      navigate(dok.internalRoute);
    }
  };

  return (
    <DashboardLayout>
      <div className="library-apple">
        {/* Apple Hero */}
        <header className="la-hero">
          <span className="la-eyebrow relative">MOREImmo · Vertriebsraum</span>
          <h1 className="la-display">Alles, was du fürs Gespräch brauchst.</h1>
          <p className="la-subtitle relative">
            Vertriebsmaterialien, Tools und Wissenswertes — kuratiert für deine Kundengespräche.
          </p>
          {isEditor && (
            <div className="la-hero-actions">
              <button onClick={() => setAddSectionOpen(true)} className="la-hero-btn">
                <Plus className="h-4 w-4" /> Abschnitt hinzufügen
              </button>
              <button onClick={() => setKontaktOpen(true)} className="la-hero-btn ghost">
                <Plus className="h-4 w-4" /> Kontakt anlegen
              </button>
            </div>
          )}
        </header>

        {/* ── Abschnitte ── */}
        <div className="space-y-4">
          {sichtbareAbschnitte.map((abschnitt) => {
            const Icon = SECTION_ICONS[abschnitt.id] ?? FileText;
            const isFullWidth = !!abschnitt.customRender;
            return (
              <Card key={abschnitt.id} className="la-section border-0 shadow-none">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <button
                    onClick={() => toggleSection(abschnitt.id)}
                    className="flex items-center gap-3 text-left"
                  >
                    <span className="la-section-glyph"><Icon /></span>
                    <span className="la-section-title">{abschnitt.name}</span>
                    {!abschnitt.customRender && (
                      <span className="la-count-pill">{abschnitt.dokumente.length}</span>
                    )}
                    {openSections[abschnitt.id]
                      ? <ChevronUp className="h-4 w-4 ml-1 opacity-50" />
                      : <ChevronDown className="h-4 w-4 ml-1 opacity-50" />}
                  </button>
                  {isEditor && !abschnitt.customRender && (
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Umbenennen"
                        onClick={() => { setEditSectionId(abschnitt.id); setEditSectionName(abschnitt.name); }}
                      ><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Dokument hinzufügen"
                        onClick={() => { setAddDokId(abschnitt.id); setDokForm({ name: "", url: "", typ: "upload" }); }}
                      ><Plus className="h-3.5 w-3.5" /></button>
                      <button
                        className="p-1 rounded hover:bg-destructive/10 text-destructive hover:text-destructive/80"
                        title="Löschen"
                        onClick={() => handleDeleteSection(abschnitt.id)}
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
                {openSections[abschnitt.id] && (
                  <CardContent className="p-4">
                    {/* Custom-Render: Kundenstimmen / Wissenswert */}
                    {abschnitt.customRender === "kundenstimmen" ? (
                      <KundenstimmenSection />
                    ) : abschnitt.customRender === "wissenswert" ? (
                      <WissenswertSection />
                    ) : abschnitt.dokumente.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-2">Noch keine Dokumente vorhanden.</p>
                        {isEditor && (
                          <Button size="sm" variant="outline" onClick={() => { setAddDokId(abschnitt.id); setDokForm({ name: "", url: "", typ: "upload" }); }}>
                            <Plus className="h-3 w-3 mr-1" /> Dokument hinzufügen
                          </Button>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {abschnitt.dokumente.map((dok) => {
                          const isPdfDownload = dok.action === "pdf-download";
                          const isInternalLink = dok.action === "internal-link";
                          const IconComp = isPdfDownload ? Download : isInternalLink ? ExternalLink : dok.typ === "link" ? LinkIcon : FileText;

                          return (
                            <li key={dok.id} className="group flex items-center gap-2 text-sm py-2 px-3 rounded hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                              <IconComp className="h-4 w-4 text-primary shrink-0" />
                              {isPdfDownload ? (
                                <button
                                  onClick={(e) => handleDokumentClick(dok, e)}
                                  className="hover:text-primary flex-1 truncate text-left font-medium"
                                >
                                  {dok.name}
                                </button>
                              ) : isInternalLink ? (
                                <button
                                  onClick={(e) => handleDokumentClick(dok, e)}
                                  className="hover:text-primary flex-1 truncate text-left font-medium"
                                >
                                  {dok.name}
                                </button>
                              ) : dok.url ? (
                                <a href={dok.url} target="_blank" rel="noreferrer" className="hover:text-primary flex-1 truncate font-medium">
                                  {dok.name}
                                </a>
                              ) : (
                                <span className="flex-1 truncate text-muted-foreground">{dok.name}</span>
                              )}

                              {dok.alt && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-amber-500/60 text-amber-600 shrink-0"
                                >
                                  Alt
                                </Badge>
                              )}
                              {isPdfDownload && <Badge variant="secondary" className="text-[10px]">PDF-Download</Badge>}
                              {isInternalLink && <Badge variant="secondary" className="text-[10px]">Im CRM öffnen</Badge>}
                              {!dok.url && dok.typ === "upload" && !dok.action && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">Kein Upload</Badge>
                              )}

                              {isEditor && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {dok.typ === "upload" && !dok.action && (
                                    <button
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Datei hochladen"
                                      onClick={() => { setUploadTarget({ sectionId: abschnitt.id, dokId: dok.id }); fileInputRef.current?.click(); }}
                                    ><Upload className="h-3 w-3" /></button>
                                  )}
                                  <button
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Bearbeiten"
                                    onClick={() => { setEditDok({ sectionId: abschnitt.id, dok }); setEditDokForm({ name: dok.name, url: dok.url, typ: dok.typ }); }}
                                  ><Pencil className="h-3 w-3" /></button>
                                  <button
                                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                                    title="Entfernen"
                                    onClick={() => handleDeleteDok(abschnitt.id, dok.id)}
                                  ><Trash2 className="h-3 w-3" /></button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Kontakt anlegen — Apple ghost tile */}
          <button
            onClick={() => setKontaktOpen(true)}
            className="la-section border-0 shadow-none w-full flex items-center justify-center gap-2 py-5 text-sm font-medium hover:bg-white"
            style={{ borderStyle: "dashed", background: "transparent" }}
          >
            <Plus className="h-4 w-4" /> Kontakt anlegen
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

      {/* ── Add Section Dialog ── */}
      <Dialog open={addSectionOpen} onOpenChange={setAddSectionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuen Abschnitt anlegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="z.B. Finanzierung" onKeyDown={(e) => e.key === "Enter" && handleAddSection()} /></div>
            <Button onClick={handleAddSection} className="w-full">Anlegen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Section Dialog ── */}
      <Dialog open={!!editSectionId} onOpenChange={(v) => { if (!v) setEditSectionId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abschnitt umbenennen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={editSectionName} onChange={(e) => setEditSectionName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEditSection()} /></div>
            <Button onClick={handleEditSection} className="w-full">Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Dokument Dialog ── */}
      <Dialog open={!!addDokId} onOpenChange={(v) => { if (!v) setAddDokId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={dokForm.name} onChange={(e) => setDokForm((p) => ({ ...p, name: e.target.value }))} placeholder="z.B. Exposé" /></div>
            <div>
              <Label className="text-xs">Typ</Label>
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant={dokForm.typ === "upload" ? "default" : "outline"} onClick={() => setDokForm((p) => ({ ...p, typ: "upload" }))}>
                  <Upload className="h-3 w-3 mr-1" /> Datei-Upload
                </Button>
                <Button size="sm" variant={dokForm.typ === "link" ? "default" : "outline"} onClick={() => setDokForm((p) => ({ ...p, typ: "link" }))}>
                  <LinkIcon className="h-3 w-3 mr-1" /> Link
                </Button>
              </div>
            </div>
            {dokForm.typ === "link" && (
              <div><Label className="text-xs">URL</Label><Input value={dokForm.url} onChange={(e) => setDokForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://..." /></div>
            )}
            <Button onClick={handleAddDok} className="w-full">Hinzufügen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dokument Dialog ── */}
      <Dialog open={!!editDok} onOpenChange={(v) => { if (!v) setEditDok(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dokument bearbeiten</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={editDokForm.name} onChange={(e) => setEditDokForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Typ</Label>
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant={editDokForm.typ === "upload" ? "default" : "outline"} onClick={() => setEditDokForm((p) => ({ ...p, typ: "upload" }))}>
                  <Upload className="h-3 w-3 mr-1" /> Datei-Upload
                </Button>
                <Button size="sm" variant={editDokForm.typ === "link" ? "default" : "outline"} onClick={() => setEditDokForm((p) => ({ ...p, typ: "link" }))}>
                  <LinkIcon className="h-3 w-3 mr-1" /> Link
                </Button>
              </div>
            </div>
            {editDokForm.typ === "link" && (
              <div><Label className="text-xs">URL</Label><Input value={editDokForm.url} onChange={(e) => setEditDokForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://..." /></div>
            )}
            <Button onClick={handleEditDok} className="w-full">Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Kontakt anlegen Dialog ── */}
      <Dialog open={kontaktOpen} onOpenChange={setKontaktOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Neuen Kontakt anlegen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Anrede</Label>
                <Select value={newKontakt.anrede} onValueChange={(v) => updK("anrede", v)}>
                  <SelectTrigger><SelectValue placeholder="–" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Herr">Herr</SelectItem>
                    <SelectItem value="Frau">Frau</SelectItem>
                    <SelectItem value="Divers">Divers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Vorname *</Label><Input value={newKontakt.vorname} onChange={(e) => updK("vorname", e.target.value)} /></div>
              <div><Label className="text-xs">Nachname *</Label><Input value={newKontakt.nachname} onChange={(e) => updK("nachname", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">E-Mail</Label><Input type="email" value={newKontakt.email} onChange={(e) => updK("email", e.target.value)} /></div>
              <div><Label className="text-xs">Telefon</Label><PhoneInput value={newKontakt.telefon} onChange={(v) => updK("telefon", v)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Quelle</Label><Input placeholder="z.B. Website, Empfehlung..." value={newKontakt.quelle} onChange={(e) => updK("quelle", e.target.value)} /></div>
              <div><Label className="text-xs">Firma</Label><Input value={newKontakt.firma} onChange={(e) => updK("firma", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Position</Label><Input value={newKontakt.position} onChange={(e) => updK("position", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={newKontakt.strasse} onChange={(e) => updK("strasse", e.target.value)} /></div>
              <div><Label className="text-xs">Nr.</Label><Input value={newKontakt.hausnummer} onChange={(e) => updK("hausnummer", e.target.value)} /></div>
              <div><Label className="text-xs">PLZ</Label><Input value={newKontakt.plz} onChange={(e) => updK("plz", e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Ort</Label><Input value={newKontakt.ort} onChange={(e) => updK("ort", e.target.value)} /></div>
            <Button onClick={handleCreateKontakt} className="w-full">Kontakt anlegen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
