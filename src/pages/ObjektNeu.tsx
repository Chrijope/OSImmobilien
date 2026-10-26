import { useState, useRef, useMemo, useEffect, useCallback, useLayoutEffect } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useNavigate, useParams } from "react-router-dom";
import { flushSync } from "react-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KONZEPTE, type ObjektKonzept } from "@/lib/objektKonzept";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Upload, X, ImagePlus, ArrowLeft, Pencil, Trash2, FileText, AlertCircle, Search, Copy, ChevronDown, ChevronUp, Building2, TrendingUp, Star, Users } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
// Im CRM rollt der Inhaltskasten, nicht das Fenster. Siehe lib/rollen.ts.
import { rolleSeiteNachOben } from "@/lib/rollen";
import { EuroInput } from "@/components/ui/euro-input";
import { saveObjekt, speichereObjektKonzept, getObjekte, getObjektById, getLastObjektSaveError, getLastObjektSaveHinweise, defaultDokumente, DEFAULT_WOHNUNG_DOCS, objektMetaErgaenzen, wohnungMetaErgaenzen, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { EinheitObjektdatenFelder, ObjektObjektdatenFelder } from "@/components/objektdaten/ObjektdatenFelder";
import { LEERE_EINHEIT, einheitFormAus, einheitFormInDaten, objektFormAus, objektFormInMeta, type EinheitFormDaten, type ObjektFormDaten } from "@/lib/objektdatenFormular";
import { aktuellerMieter } from "@/lib/objektdaten";
import { listendatenFuerEinheit } from "@/lib/listendaten";
import { garageFuerEinheit, mietgarantieAusMeta } from "@/lib/mietgarantie";
import { addMieter, getMieter, updateMieter } from "@/lib/mieterStore";
import { nameTeilen } from "@/lib/listenImport";
import { AfaRechnerEmbed, type AfaErgebnis, type AfaRechnerDraft } from "@/components/objekte/AfaRechnerEmbed";
import { ObjektUploadAnalyse, type ExtractedObjektData } from "@/components/objekte/ObjektUploadAnalyse";
import { EinheitVerkaufsstatus } from "@/components/objekte/EinheitVerkaufsstatus";
import { BildSteuerung, verschiebeBild } from "@/components/objekte/BildReihenfolge";
import { hausgeldTeile } from "../../supabase/functions/_shared/einheit-hausgeld";
import { ObjektseiteFelderFormular } from "@/components/objektseite/ObjektseiteFelderDialog";
import { objektartLabel, objektseiteFelderInMeta, objektseiteHandwerte, type ObjektseiteFelder } from "@/lib/objektseiteDaten";
import { HAND_HIGHLIGHTS_SCHLUESSEL, MAX_HAND_HIGHLIGHTS, handHighlights } from "@/lib/interneHighlights";
import { BeschreibungFeld, StandortargumenteFeld } from "@/components/objekte/ObjektKiTexte";
import { ExklusivZuweisung } from "@/components/objekte/ExklusivZuweisung";
import { exklusivKennungenInMeta, exklusivMeldungen, exklusivStand, ladeExklusivKandidaten } from "@/lib/exklusivZuweisung";
import { exklusivKennungenLesen } from "../../supabase/functions/_shared/objekt-zugang.ts";
import { darfObjektTexteErstellen, MAX_KURZBESCHREIBUNG, type WizardTexteEingabe } from "@/lib/objektWizardTexte";
import { konzeptLabel } from "@/lib/objektKonzept";
import { objektTexteEnOhneGepflegte } from "../../supabase/functions/_shared/objekt-texte-en.ts";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { objektDateiAblegen } from "@/lib/storage";
import { darfObjektBearbeiten } from "@/lib/objektBearbeitenRecht";
import { compressImageImmediate, compressForUpload, compressToFile } from "@/lib/imageCompression";
import { deleteObjektDraft, loadObjektDraft, loadObjektDraftBlobs, saveObjektDraft, saveObjektDraftBlobs, saveObjektDraftSofort } from "@/lib/objektDraftStore";
import { createEmptyUploadAnalyseRuntimeState, type UploadAnalyseRuntimeState } from "@/lib/objektAnalyseShared";
import { PhoneInput } from "@/components/ui/phone-input";
import { verkaeuferNameLabel, verkaeuferVollerName, type VerkaeuferArt } from "@/lib/verkaeuferName";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { Objektart } from "@/lib/objektseiteDaten";
import {
  ANLAGEKLASSE_HAUS_GEBUNDEN_HINWEIS,
  ANLAGEKLASSE_INVESTAGON_HINWEIS,
  anlageklassePflege,
  anlageklasseZumSchalter,
  istGlobalAnlageklasse,
  istGlobalobjekt,
} from "@/lib/objektKlassen";
import {
  VERWALTUNGSART_OPTIONS,
  VERWALTUNGSART_TOOLTIP,
  SEV_KOSTEN_TOOLTIP,
  normalizeVerwaltungsart,
} from "@/lib/verwaltungInfo";
import { wizardStruktur, unterlagenRegeln } from "@/lib/objektUnterlagenRegeln";
import { kaufnebenkostenPct } from "@/lib/kaufnebenkosten";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);


type ObjektDateiDraft = { id: string; name: string; filename: string; file?: File; existingUrl?: string };
type UploadedWohnungImage = { sourceId: string; finalId: string; image: { id: string; url: string; alt: string; reihenfolge: number } };

type ObjektNeuDraft = {
  nf: typeof initialNfState;
  isGlobalObjekt: boolean;
  isEinzelwohnung: boolean;
  gewaehlteObjektart?: Objektart;
  verkaeuferDaten: typeof initialVerkaeuferDaten;
  sanierungskosten: number;
  afaDaten: typeof initialAfaDaten;
  afaDraft: AfaRechnerDraft | null;
  globalDaten: typeof initialGlobalDaten;
  objektangaben?: ObjektseiteFelder;
  interneHighlightsText?: string;
  einzelWohnungen: Partial<ObjektWohnung>[];
  hauptbildPreview: string;
  hauptbildFile: File | null;
  slideshowPreviews: { id: string; url: string; alt: string }[];
  slideshowFiles: Record<string, File>;
  objektDocs: Record<string, string>;
  objektDocFiles: Record<string, File>;
  extraDocs: ObjektDateiDraft[];
  interneDocs: ObjektDateiDraft[];
  wohnungDocs: Record<string, Record<string, string>>;
  wohnungDocFiles: Record<string, Record<string, File>>;
  expandedWohnungDocs: Record<number, boolean>;
  customWohnungDocs: Record<string, ObjektDateiDraft[]>;
  newCustomWohnungDocName: Record<string, string>;
  wohnungBilder: Record<string, { id: string; url: string; alt: string; reihenfolge: number }[]>;
  wohnungBilderFiles: Record<string, Record<string, File>>;
  uploadedPdfFiles: File[];
  newW: Partial<ObjektWohnung>;
  bulkW: Partial<ObjektWohnung>;
  bulkAnzahl: number;
  bulkStartWeNr: number;
  newExtraDocName: string;
  newInterneDocName: string;
  uploadAnalyseDraft: {
    files: File[];
    slotFiles: Record<string, File[]>;
    cloudUrl: string;
    result: ExtractedObjektData | null;
    runtime: UploadAnalyseRuntimeState;
  };
  step: string;
  editingIdx: number | null;
  isDirty: boolean;
  hasPendingLocalFiles: boolean;
  /** Seit 18.10.2026. Fehlte vorher und war nach dem Neuladen weg. */
  zusatz?: ObjektNeuZusatz;
};

/** Angaben, die bis zum 18.10.2026 nicht im Entwurf standen. */
type ObjektNeuZusatz = {
  anlageklasse: string;
  konzept: ObjektKonzept | "";
  verwaltungsart: string;
  verwaltungskostenWeg: number;
  verwaltungskostenSev: number;
  verwaltungskostenSonstige: number;
  kalkHausgeldNuP: number;
  kalkHausgeldNuEuro: number;
  kalkHausgeldMonat: number;
  ruecklageWeg: number;
  garantierteErstvermietungKalt: number;
  kalkSevMonat: number;
  kalkMietausfallP: number;
  kalkInstandhaltungQm: number;
  kalkInstandhaltungMode: "qm" | "pct";
  kalkInstandhaltungPct: number;
  objektUnterlagenLink: string;
  einzelProfilBildId: string;
  objektdatenForm: ObjektFormDaten | null;
  /** Name zu Nutzer-ID der Exklusivpartner, `meta.exklusivPartnerKennung`. */
  exklusivKennungen?: Record<string, string>;
};

const initialNfState = {
  titel: "", adresse: "", plz: "", ort: "", beschreibung: "", badge: "",
  videoUrl: "", videoSichtbar: false, bildUrl: "",
  exklusivPartner: [] as string[], newExklusivPartner: "",
  cloudOrdnerUrl: "",
};

/**
 * Wer das Objekt verkauft.
 *
 * `art` entscheidet, ob es ein Namensfeld gibt oder zwei: Bei einer Firma
 * steht der Firmenname allein in `name`, bei einer Privatperson sind es
 * `vorname` und `name`. Vorher gab es nur `name` und daneben ein zweites,
 * freiwilliges Feld `firma`, und niemand wusste, was wohin gehört.
 *
 * `firma` wird nicht mehr abgefragt, bleibt aber im Datensatz, damit an
 * bestehenden Objekten nichts verschwindet. Siehe `verkaeuferName.ts`.
 */
const initialVerkaeuferDaten = {
  art: "" as VerkaeuferArt | "",
  name: "", vorname: "", strasse: "", plz: "", ort: "", email: "", telefon: "", firma: "",
};

const initialAfaDaten = {
  afaModell: "linear" as "linear" | "degressiv" | "gutachten",
  afaSatz: 2,
  restnutzungsdauer: 50,
  grundstueckAnteil: 20,
};

const initialGlobalDaten = {
  gesamtQm: 0, etagen: 0, baujahr: new Date().getFullYear(), grundstueckQm: 0,
  verkaufspreis: 0, qmPreis: 0, rendite: 0, jahresnettomiete: 0, hausgeldMonat: 0,
  // 0 heißt: Satz nach Bundesland aus der Postleitzahl. Bis 10/2026 stand hier 5
  // und schlug als gepflegter Wert den Landessatz des Objekts.
  kaufnebenkosten: 0, grundstueckAnteil: 20, zustand: "Bestand",
  energieeffizienzklasse: "", stellplaetze: 0, vermietungsstand: 100,
  wohneinheitenGesamt: 0,
};

const leereObjektangaben = (): ObjektseiteFelder => ({ standortargumente: [], energieausweis: {}, sanierungen: [] });

/** Text mit einem Punkt je Zeile als Liste, leere Zeilen fallen weg. */
const zeilenListe = (text: string) => text.split("\n").map(z => z.trim()).filter(Boolean).slice(0, MAX_HAND_HIGHLIGHTS);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const hasPersistedFiles = (draft: Partial<ObjektNeuDraft> | null | undefined) =>
  Boolean(draft?.hauptbildFile) ||
  (draft?.uploadedPdfFiles?.length ?? 0) > 0 ||
  Object.keys(draft?.slideshowFiles || {}).length > 0 ||
  Object.keys(draft?.objektDocFiles || {}).length > 0 ||
  Object.values(draft?.wohnungDocFiles || {}).some(files => Object.keys(files || {}).length > 0) ||
  Object.values(draft?.wohnungBilderFiles || {}).some(files => Object.keys(files || {}).length > 0) ||
  (draft?.extraDocs || []).some(doc => isFileInstance(doc.file)) ||
  (draft?.interneDocs || []).some(doc => isFileInstance(doc.file)) ||
  Object.values(draft?.customWohnungDocs || {}).some(docs => docs.some(doc => isFileInstance(doc.file)));

/**
 * Grenze für hochgeladene Unterlagen.
 *
 * PDFs werden nicht verkleinert, anders als Bilder. Eine 200-MB-Datei würde
 * den Upload minutenlang blockieren und dann am Speicher scheitern, ohne dass
 * jemand erfährt warum. Deshalb wird sie vorher abgelehnt, mit Begründung.
 */
const MAX_DOKUMENT_MB = 25;
const MAX_DOKUMENT_BYTES = MAX_DOKUMENT_MB * 1024 * 1024;

// Fixed object document categories
const OBJEKT_DOC_CATEGORIES = [
  { id: "expose", name: "Exposé" },
  { id: "objektbeschreibung", name: "Objektbeschreibung" },

  { id: "lageplan", name: "Lageplan" },
  { id: "versicherungsnachweis", name: "Versicherungsnachweis" },
  { id: "energieausweis", name: "Energieausweis" },
  { id: "aufteilungsplan", name: "Aufteilungsplan" },
  { id: "grundbuchauszug", name: "Grundbuchauszug" },
  { id: "teilungserklaerung", name: "Teilungserklärung" },
  { id: "wohnflaechenberechnung", name: "Wohnflächenberechnung" },
];

// Auto-calculate related fields for a wohnung
function recalcWohnung(w: Partial<ObjektWohnung>, changedField: string): Partial<ObjektWohnung> {
  const updated = { ...w };
  const groesse = updated.groesse || 0;
  const vk = updated.vkGesamt || 0;
  const miete = updated.mieteGesamt || 0;
  const qmPreis = updated.qmPreis || 0;

  switch (changedField) {
    case "groesse":
      if (qmPreis > 0 && groesse > 0) updated.vkGesamt = Math.round(groesse * qmPreis);
      if (groesse > 0 && updated.vkGesamt && updated.vkGesamt > 0) updated.qmPreis = parseFloat((updated.vkGesamt / groesse).toFixed(2));
      if (miete > 0 && updated.vkGesamt && updated.vkGesamt > 0) updated.rendite = parseFloat(((miete * 12 / updated.vkGesamt) * 100).toFixed(2));
      break;
    case "vkGesamt":
      if (groesse > 0 && vk > 0) updated.qmPreis = parseFloat((vk / groesse).toFixed(2));
      if (miete > 0 && vk > 0) updated.rendite = parseFloat(((miete * 12 / vk) * 100).toFixed(2));
      break;
    case "qmPreis":
      if (groesse > 0 && qmPreis > 0) updated.vkGesamt = Math.round(groesse * qmPreis);
      if (miete > 0 && updated.vkGesamt && updated.vkGesamt > 0) updated.rendite = parseFloat(((miete * 12 / updated.vkGesamt) * 100).toFixed(2));
      break;
    case "mieteGesamt":
      if (vk > 0 && miete > 0) updated.rendite = parseFloat(((miete * 12 / vk) * 100).toFixed(2));
      break;
    case "rendite":
      if (vk > 0 && updated.rendite && updated.rendite > 0) updated.mieteGesamt = Math.round((updated.rendite / 100 * vk) / 12);
      break;
  }
  return updated;
}

/**
 * Die Objektunterlagen aus dem Bestand, so wie das Formular sie jetzt zeigt.
 *
 * Bis zum 16.10.2026 kam der Bestand unverändert durch: Eine im Formular
 * entfernte Unterlage stand nach dem Speichern wieder da. Jetzt gilt:
 * Weitere und interne Unterlagen (`typ: "custom"`) fallen hier heraus, sie
 * hängt der Aufrufer aus dem Formularstand wieder an. Eine feste Kategorie
 * ohne Datei im Formular wird leer, wie eine nie hochgeladene. Alles andere,
 * etwa Unterlagen aus Investagon, bleibt, wie es ist.
 */
export function objektDokumenteZumSpeichern<D extends { name: string; url: string; typ: string }>(
  bestand: D[],
  imFormular: Record<string, string>,
  hochgeladen: Record<string, string>,
): D[] {
  return bestand
    .filter(d => d.typ !== "custom")
    .map(d => {
      const kategorie = OBJEKT_DOC_CATEGORIES.find(c => c.name === d.name)?.id;
      if (!kategorie) return d;
      if (hochgeladen[kategorie]) return { ...d, url: hochgeladen[kategorie] };
      return imFormular[kategorie] ? d : { ...d, url: "" };
    });
}

/**
 * Das AfA-Modell aus dem AfA-Rechner. Wählt man dort „Gutachten“
 * (Restnutzungsdauer laut Gutachten), muss das Objekt das auch tragen, sonst
 * fehlt die Zeile in den internen Highlights. Ohne Rechnerstand bleibt es
 * beim gespeicherten Modell.
 */
export function afaModellAusRechner(
  draft: Pick<AfaRechnerDraft, "afaModus"> | null | undefined,
  bisher: "linear" | "degressiv" | "gutachten",
): "linear" | "degressiv" | "gutachten" {
  if (draft?.afaModus === "gutachten") return "gutachten";
  if (draft?.afaModus === "berechnen" && bisher === "gutachten") return "linear";
  return bisher;
}

const isFileInstance = (value: unknown): value is File => typeof File !== "undefined" && value instanceof File;

const DRAFT_BLOB_KEYS = {
  hauptbild: "hauptbild",
  slideshow: "slideshow::",
  objektDoc: "objektDoc::",
  wohnungDoc: "wohnungDoc::",
  wohnungBild: "wohnungBild::",
  extraDoc: "extraDoc::",
  interneDoc: "interneDoc::",
  customWohnungDoc: "customWohnungDoc::",
  uploadedPdf: "uploadedPdf::",
  uploadAnalyseFile: "uploadAnalyseFile::",
  uploadAnalyseSlotFile: "uploadAnalyseSlotFile::",
} as const;

/**
 * `Rahmen` ist sonst immer das CRM-Layout. Nur die lokale Vorschau
 * (`VorschauObjektAnlegen`, nur `npm run dev`) setzt einen schlichten Rahmen,
 * weil das Layout ohne Anmeldung zum Login umleitet.
 */
export default function ObjektNeu({ Rahmen = DashboardLayout }: { Rahmen?: React.ComponentType<{ children: React.ReactNode }> } = {}) {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const { user, authUser, loading: nutzerLaedt } = useUser();
  const { toast } = useToast();
  const [showAnalysisAbortConfirm, setShowAnalysisAbortConfirm] = useState(false);
  const [step, setStep] = useState(editId ? "0" : "typ");
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedPdfFiles, setUploadedPdfFiles] = useState<File[]>([]);
  const [showBlockerDialog, setShowBlockerDialog] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{ titel: string; wohnungen: number; objektBilder: number; wohnungBilderCount: number; objektDoks: number; wohnungDoks: number; extraDoks: number; interneDoks: number } | null>(null);
  const [uploadAnalyseDraft, setUploadAnalyseDraft] = useState<ObjektNeuDraft["uploadAnalyseDraft"]>({
    files: [],
    slotFiles: {},
    cloudUrl: "",
    result: null,
    runtime: createEmptyUploadAnalyseRuntimeState(),
  });
  const isEditMode = !!editId;
  // Objekte kommen in der zweiten Ladewelle. Ohne Version bliebe der
  // Bearbeiten-Modus per Direktlink dauerhaft bei "Objekt wird geladen".
  useLiveVersion(["objekte", "wohnungen"]);
  const existingObjekt = isEditMode ? getObjektById(editId) : undefined;
  const editNotReady = isEditMode && !existingObjekt;

  // Navigation blocker state (manual, since BrowserRouter doesn't support useBlocker)
  const blockerPendingNav = useRef<string | null>(null);

  // Intercept navigate calls during analysis
  const safeNavigate = useCallback((to: string) => {
    if (isAnalysisRunning) {
      blockerPendingNav.current = to;
      setShowBlockerDialog(true);
    } else {
      navigate(to);
    }
  }, [isAnalysisRunning, navigate]);

  // Prevent browser close/refresh while analysis runs
  useEffect(() => {
    if (!isAnalysisRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnalysisRunning]);
  // Form state
  const [nf, setNf] = useState(initialNfState);
  const [isGlobalObjekt, setIsGlobalObjekt] = useState(false);
  const [isEinzelwohnung, setIsEinzelwohnung] = useState(false);
  /*
   * Die Objektart, so wie sie im Typ-Fenster gewaehlt wurde.
   *
   * Bis zum 11.09.2026 hat der Assistent sie nie gesetzt. Sie wurde spaeter
   * aus Titel, Zustand und Anlageklasse **geraten**
   * (`objektartAbleiten` in `src/lib/objektseiteDaten.ts`). Bei WG und
   * Co-Living ging das regelmaessig daneben, weil das Raten dort auf das Wort
   * "WG" in der Anlageklasse angewiesen ist. Die Art entscheidet aber, welches
   * Konzept die Beratungspraesentation zeigt und mit welchem Objekttyp das
   * Analysetool rechnet. Wer sie im Typ-Fenster waehlt, legt sie hiermit fest;
   * fuer die uebrigen Wege bleibt es beim Ableiten.
   */
  const [gewaehlteObjektart, setGewaehlteObjektart] = useState<Objektart | undefined>(undefined);

  const [verkaeuferDaten, setVerkaeuferDaten] = useState(initialVerkaeuferDaten);
  const [vkListVersion, setVkListVersion] = useState(0);
  const [sanierungskosten, setSanierungskosten] = useState(0);
  // AfA / Grund & Boden Aufteilung
  const [afaDaten, setAfaDaten] = useState(initialAfaDaten);
  const [afaDraft, setAfaDraft] = useState<AfaRechnerDraft | null>(null);
  const [afaErgebnis, setAfaErgebnis] = useState<AfaErgebnis | null>(null);
  const [globalDaten, setGlobalDaten] = useState(initialGlobalDaten);
  /*
   * Die Objektangaben der Objekt- und Einheitenseite (Energieausweis,
   * Sanierungen, Gemeinschaftseigentum, Verwalter, Einheiten im Haus). Bis
   * zum 16.10.2026 nur über den Stift auf der Objektseite pflegbar, jetzt
   * schon beim Anlegen. Die Objektart läuft weiter über `gewaehlteObjektart`.
   */
  const [objektangaben, setObjektangaben] = useState<ObjektseiteFelder>(leereObjektangaben);
  const [interneHighlightsText, setInterneHighlightsText] = useState("");
  // Objektdaten aus „Basisdaten“ (Vergleichsmiete, Kappungsgrenze, Reservierungsdauer und mehr).
  const [objektdatenForm, setObjektdatenForm] = useState<ObjektFormDaten | null>(null);

  // Sync AfA-Rechner-Ergebnis in das persistente `afaDaten`, damit die
  // Kalkulationen die korrekten Werte (Grundstücksanteil, AfA-Satz, RND)
  // als Vorbelegung erhalten.
  useEffect(() => {
    if (!afaErgebnis) return;
    setAfaDaten(prev => ({
      ...prev,
      afaSatz: afaErgebnis.afaSatz > 0 ? Number(afaErgebnis.afaSatz.toFixed(2)) : prev.afaSatz,
      restnutzungsdauer: afaErgebnis.rnd > 0 ? afaErgebnis.rnd : prev.restnutzungsdauer,
      grundstueckAnteil: afaErgebnis.bodenPct > 0 ? Number(afaErgebnis.bodenPct.toFixed(2)) : prev.grundstueckAnteil,
    }));
  }, [afaErgebnis]);
  const [anlageklasse, setAnlageklasse] = useState<string>("");
  // Leer heißt „nicht gepflegt“. Eigener Wert, weil Radix-Select keinen leeren Eintrag kennt.
  const [konzept, setKonzept] = useState<ObjektKonzept | "">("");
  const [verwaltungsart, setVerwaltungsart] = useState<string>("");
  const [verwaltungskostenWeg, setVerwaltungskostenWeg] = useState<number>(0);
  const [verwaltungskostenSev, setVerwaltungskostenSev] = useState<number>(0);
  const [verwaltungskostenSonstige, setVerwaltungskostenSonstige] = useState<number>(0);
  // Kalkulations-Annahmen (gespeichert in meta.kalkulation). Die frühere
  // Musterkalkulation ist entfernt, die Werte liest aber weiter u. a.
  // objekteStore (Hausgeld, nicht umlagefähiger Anteil).
  const [kalkHausgeldNuP, setKalkHausgeldNuP] = useState<number>(30);
  const [kalkHausgeldNuEuro, setKalkHausgeldNuEuro] = useState<number>(0);
  const [kalkHausgeldMonat, setKalkHausgeldMonat] = useState<number>(0);
  const [ruecklageWeg, setRuecklageWeg] = useState<number>(0);
  const [garantierteErstvermietungKalt, setGarantierteErstvermietungKalt] = useState<number>(0);
  const [kalkSevMonat, setKalkSevMonat] = useState<number>(0);
  const [kalkMietausfallP, setKalkMietausfallP] = useState<number>(2);
  const [kalkInstandhaltungQm, setKalkInstandhaltungQm] = useState<number>(0);
  const [kalkInstandhaltungMode, setKalkInstandhaltungMode] = useState<"qm" | "pct">("qm");
  const [kalkInstandhaltungPct, setKalkInstandhaltungPct] = useState<number>(1.0);

  // Load existing object data in edit mode
  const [editLoaded, setEditLoaded] = useState(false);
  // Die Beschreibung beim Öffnen. Nur eine geänderte wird zur gepflegten Kurzbeschreibung,
  // sonst würde ein Investagon- oder Automatiktext beim Speichern „von Hand“.
  const beschreibungStart = useRef<string | null>(null);
  useEffect(() => {
    if (isEditMode && existingObjekt && !editLoaded) {
      setNf({
        titel: existingObjekt.titel || "",
        adresse: existingObjekt.adresse || "",
        plz: existingObjekt.plz || "",
        ort: existingObjekt.ort || "",
        // Was Objektseite und Exposé zeigen: die gepflegte Kurzbeschreibung, sonst die Spalte.
        beschreibung: (beschreibungStart.current = objektseiteHandwerte(existingObjekt).kurzbeschreibung || existingObjekt.beschreibung || ""),
        badge: existingObjekt.badge || "",
        videoUrl: existingObjekt.videoUrl || "",
        videoSichtbar: existingObjekt.videoSichtbar || false,
        bildUrl: existingObjekt.bildUrl || "",
        exklusivPartner: existingObjekt.exklusivPartner || [],
        newExklusivPartner: "",
        cloudOrdnerUrl: existingObjekt.cloudOrdnerUrl || "",
      });
      setIsGlobalObjekt(istGlobalobjekt(existingObjekt));
      setIsEinzelwohnung(!!(existingObjekt.meta as any)?.einzelwohnung);
      setGewaehlteObjektart((existingObjekt.meta as any)?.objektart);
      setEinzelProfilBildId(String((existingObjekt.meta as any)?.einzelProfilBildId || ""));
      setSanierungskosten(existingObjekt.sanierungskosten || 0);
      setAnlageklasse((existingObjekt.meta as any)?.anlageklasse || "");
      setKonzept(existingObjekt.konzept ?? "");
      setVerwaltungsart(normalizeVerwaltungsart((existingObjekt.meta as any)?.verwaltungsart) || "");
      setVerwaltungskostenWeg(Number((existingObjekt.meta as any)?.verwaltungskostenWeg) || 0);
      setVerwaltungskostenSev(Number((existingObjekt.meta as any)?.verwaltungskostenSev) || 0);
      setVerwaltungskostenSonstige(Number((existingObjekt.meta as any)?.verwaltungskostenSonstige) || 0);
      const kalk = (existingObjekt.meta as any)?.kalkulation || {};
      setKalkHausgeldNuP(Number(kalk.hausgeldNichtUmlagefaehigP ?? 30));
      setKalkHausgeldNuEuro(Number(kalk.hausgeldNichtUmlagefaehigEuro ?? 0));
      setKalkHausgeldMonat(Number(kalk.hausgeldMonat ?? (existingObjekt.globalDaten as any)?.hausgeldMonat ?? 0));
      setKalkSevMonat(Number(kalk.sevMonat ?? 0));
      setKalkMietausfallP(Number(kalk.mietausfallP ?? 2));
      setKalkInstandhaltungQm(Number(kalk.instandhaltungProQm ?? 0));
      setKalkInstandhaltungMode((kalk.instandhaltungMode === "pct" ? "pct" : "qm"));
      setKalkInstandhaltungPct(Number(kalk.instandhaltungPctGebaeude ?? 1.0));
      setRuecklageWeg(Number((existingObjekt.meta as any)?.ruecklageWeg ?? 0));
      setGarantierteErstvermietungKalt(Number((existingObjekt.meta as any)?.garantierteErstvermietungKalt ?? 0));
      if (existingObjekt.verkaeuferDaten) {
        // Über die Vorbelegung gelegt, damit ein bestehendes Objekt ohne die
        // neuen Felder nicht mit undefined in die Eingabefelder läuft.
        setVerkaeuferDaten({ ...initialVerkaeuferDaten, ...existingObjekt.verkaeuferDaten });
      }
      if (existingObjekt.afaDaten) {
        setAfaDaten({
          ...initialAfaDaten,
          ...existingObjekt.afaDaten,
        });
      }
      // Restore AfA draft from meta, but override stale values with authoritative DB fields
      if (existingObjekt.meta?.afaDraft) {
        const savedDraft = existingObjekt.meta.afaDraft as Partial<AfaRechnerDraft>;
        const dbSanierungskosten = existingObjekt.sanierungskosten ?? 0;
        const dbBaujahr = existingObjekt.globalDaten?.baujahr ?? 0;
        const dbBodenPct = existingObjekt.afaDaten?.grundstueckAnteil ?? 0;
        setAfaDraft({
          ...savedDraft,
          bodenAnteilPct: savedDraft.bodenAnteilPct ?? (dbBodenPct > 0 ? dbBodenPct : 20),
          sanierungskosten: dbSanierungskosten !== 0 ? dbSanierungskosten : (savedDraft.sanierungskosten ?? 0),
          baujahr: dbBaujahr !== 0 ? dbBaujahr : (savedDraft.baujahr ?? 1969),
        } as AfaRechnerDraft);
      }
      if (existingObjekt.globalDaten) {
        const gd: any = existingObjekt.globalDaten;
        const qm = Number(gd.gesamtQm) || 0;
        const vp = Number(gd.verkaufspreis) || 0;
        setGlobalDaten({
          ...initialGlobalDaten,
          ...gd,
          qmPreis: gd.qmPreis ?? (qm > 0 ? parseFloat((vp / qm).toFixed(2)) : 0),
        });
      }
      if (existingObjekt.bilder?.length) {
        // All images go into slideshowPreviews, ordered by reihenfolge
        const sorted = [...existingObjekt.bilder].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0));
        setSlideshowPreviews(sorted);
      } else if (existingObjekt.bildUrl) {
        // Fallback: if no bilder entries but bildUrl exists, add as single image
        setSlideshowPreviews([{ id: crypto.randomUUID(), url: existingObjekt.bildUrl, alt: "Hauptbild" }]);
      }
      setObjektangaben(objektseiteHandwerte(existingObjekt));
      setExklusivKennungen(exklusivKennungenLesen(existingObjekt.meta));
      setInterneHighlightsText(handHighlights(existingObjekt).join("\n"));
      setEinzelWohnungen(existingObjekt.wohnungen || []);
      // Restore externen Unterlagen-Link
      if ((existingObjekt as any)?.meta?.unterlagenLink) {
        setObjektUnterlagenLink((existingObjekt as any).meta.unterlagenLink);
      }

      // Restore Objekt-Dokumente: map existing docs back to objektDocs state
      const restoredObjektDocs: Record<string, string> = {};
      for (const doc of existingObjekt.dokumente || []) {
        if (!doc.url) continue;
        const cat = OBJEKT_DOC_CATEGORIES.find(c => c.name === doc.name);
        if (cat) {
          restoredObjektDocs[cat.id] = doc.url.split("/").pop() || doc.name;
        }
      }
      if (Object.keys(restoredObjektDocs).length > 0) setObjektDocs(restoredObjektDocs);

      // Restore extra docs (custom objektunterlagen)
      const restoredExtraDocs: ObjektDateiDraft[] = [];
      const restoredInterneDocs: ObjektDateiDraft[] = [];
      for (const doc of existingObjekt.dokumente || []) {
        if (doc.typ !== "custom") continue;
        const entry: ObjektDateiDraft = { id: crypto.randomUUID(), name: doc.name, filename: doc.url ? (doc.url.split("/").pop() || doc.name) : "", existingUrl: doc.url || undefined };
        if (doc.kategorie === "intern") {
          restoredInterneDocs.push(entry);
        } else {
          restoredExtraDocs.push(entry);
        }
      }
      if (restoredExtraDocs.length > 0) setExtraDocs(restoredExtraDocs);
      if (restoredInterneDocs.length > 0) setInterneDocs(restoredInterneDocs);

      // Restore wohnung documents and images
      const wDocsMap: Record<string, Record<string, string>> = {};
      const customWDocsMap: Record<string, ObjektDateiDraft[]> = {};
      const bilderMap: Record<string, { id: string; url: string; alt: string; reihenfolge: number }[]> = {};
      (existingObjekt.wohnungen || []).forEach(w => {
        // Standard wohnung docs
        if (w.dokumente && w.dokumente.length > 0) {
          const docMap: Record<string, string> = {};
          const customs: ObjektDateiDraft[] = [];
          for (const d of w.dokumente) {
            if (!d.url) continue;
            const stdDoc = DEFAULT_WOHNUNG_DOCS.find(sd => sd.name === d.name);
            if (stdDoc) {
              docMap[stdDoc.id] = d.url.split("/").pop() || d.name;
            } else {
              // existingUrl merken, sonst verliert ein Speichern ohne erneuten
              // Upload genau die Unterlagen, die keine feste Kategorie haben.
              customs.push({ id: crypto.randomUUID(), name: d.name, filename: d.url.split("/").pop() || d.name, existingUrl: d.url });
            }
          }
          if (Object.keys(docMap).length > 0) wDocsMap[w.id] = docMap;
          if (customs.length > 0) customWDocsMap[w.id] = customs;
        }
        // Wohnung images
        if (w.bilder && w.bilder.length > 0) bilderMap[w.id] = w.bilder;
      });
      if (Object.keys(wDocsMap).length > 0) setWohnungDocs(wDocsMap);
      if (Object.keys(customWDocsMap).length > 0) setCustomWohnungDocs(customWDocsMap);
      if (Object.keys(bilderMap).length > 0) setWohnungBilder(bilderMap);
      setRemovedWohnungBildIds({});
      setEditLoaded(true);
    }
  }, [isEditMode, existingObjekt, editLoaded]);

  /**
   * Hinweis bei Abweichung: Gesamt-Wohnfläche gegen die Summe der Wohnungen.
   *
   * Die Prüfung saß bisher in `updateGlobal` und stellte bei jedem Tastendruck
   * ein Browser-Fenster in den Weg: Wer 120 tippte, wurde nach der 1 und noch
   * einmal nach der 12 gefragt, weil beides von der Summe abweicht. Jetzt
   * läuft sie beim Verlassen des Feldes und meldet sich als Hinweis im
   * Projektstil, ohne die Eingabe anzuhalten.
   */
  const pruefeGesamtflaeche = (wert: number) => {
    if (!(wert > 0)) return;
    const summe = einzelWohnungen.reduce((s, w) => s + (Number(w.groesse) || 0), 0);
    // Auf 2 Nachkommastellen gerundet, um Float-Rauschen zu ignorieren
    if (!(summe > 0) || Math.abs(wert - summe) <= 0.01) return;
    toast({
      title: "Wohnfläche weicht ab",
      description:
        `Eingetragen sind ${wert.toLocaleString("de-DE")} m², die einzelnen Wohnungen ergeben zusammen ` +
        `${summe.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m². Bitte prüfen, welcher Wert stimmt.`,
    });
  };

  const updateGlobal = (field: string, value: any) => {
    setGlobalDaten(prev => {
      const updated: any = { ...prev, [field]: value };
      // qm-Preis ↔ Verkaufspreis ↔ Gesamtfläche bidirectional
      if (field === "qmPreis" && updated.gesamtQm > 0) {
        updated.verkaufspreis = Math.round(value * updated.gesamtQm);
      } else if (field === "verkaufspreis" && updated.gesamtQm > 0) {
        updated.qmPreis = parseFloat((value / updated.gesamtQm).toFixed(2));
      } else if (field === "gesamtQm" && value > 0) {
        if (updated.qmPreis > 0) updated.verkaufspreis = Math.round(updated.qmPreis * value);
        else if (updated.verkaufspreis > 0) updated.qmPreis = parseFloat((updated.verkaufspreis / value).toFixed(2));
      }
      // Auto-calc rendite ↔ jahresnettomiete (Verkaufspreis bezogen)
      if (field === "jahresnettomiete" && updated.verkaufspreis > 0) {
        updated.rendite = parseFloat(((updated.jahresnettomiete / updated.verkaufspreis) * 100).toFixed(2));
      } else if (field === "rendite" && updated.verkaufspreis > 0) {
        updated.jahresnettomiete = Math.round(updated.rendite / 100 * updated.verkaufspreis);
      } else if ((field === "verkaufspreis" || field === "qmPreis" || field === "gesamtQm") && updated.jahresnettomiete > 0 && updated.verkaufspreis > 0) {
        updated.rendite = parseFloat(((updated.jahresnettomiete / updated.verkaufspreis) * 100).toFixed(2));
      }
      return updated;
    });
    markDirty();
  };

  // Exklusive Freischaltung: Kennung je Name (`meta.exklusivPartnerKennung`), Auswahl nur aus echten Nutzern.
  const [exklusivKennungen, setExklusivKennungen] = useState<Record<string, string>>({});
  const profilVersion = useLiveVersion(["profiles", "user_roles"]);
  const exklusivKandidaten = useMemo(() => ladeExklusivKandidaten(), [profilVersion]);

  // Images – store compressed thumbnails for preview + original Files for upload
  const [hauptbildPreview, setHauptbildPreview] = useState<string>("");
  const [hauptbildFile, setHauptbildFile] = useState<File | null>(null);
  const [slideshowPreviews, setSlideshowPreviews] = useState<{ id: string; url: string; alt: string }[]>([]);
  const [slideshowFiles, setSlideshowFiles] = useState<Record<string, File>>({});
  const hauptbildRef = useRef<HTMLInputElement>(null);
  const slideshowRef = useRef<HTMLInputElement>(null);

  // Wohnungen
  const [einzelWohnungen, setEinzelWohnungen] = useState<Partial<ObjektWohnung>[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const emptyW = (): Partial<ObjektWohnung> => ({ id: `w-new-${Date.now()}`, weNr: "", etage: "EG", lage: "", groesse: 0, zimmer: 2, mieteGesamt: 0, vkGesamt: 0, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" });
  const [newW, setNewW] = useState<Partial<ObjektWohnung>>(emptyW());
  const latestEinzelWohnungenRef = useRef<Partial<ObjektWohnung>[]>([]);
  const latestNewWRef = useRef<Partial<ObjektWohnung>>(newW);
  const latestEditingIdxRef = useRef<number | null>(null);

  // Bulk-Wohnungen
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkAnzahl, setBulkAnzahl] = useState(2);
  const [bulkStartWeNr, setBulkStartWeNr] = useState(1);
  const [bulkW, setBulkW] = useState<Partial<ObjektWohnung>>(emptyW());

  // Document uploads (track which docs have been "uploaded")
  const [objektDocs, setObjektDocs] = useState<Record<string, string>>({}); // id -> filename
  const [objektDocFiles, setObjektDocFiles] = useState<Record<string, File>>({}); // id -> File object
  // Externer Unterlagen-Link (z.B. Cloud-Ordner) - ersetzt PDF-Uploads
  const [objektUnterlagenLink, setObjektUnterlagenLink] = useState<string>("");
  // Extra documents for admin
  const [extraDocs, setExtraDocs] = useState<ObjektDateiDraft[]>([]);
  const [newExtraDocName, setNewExtraDocName] = useState("");
  // Internal docs (kategorie: "intern")
  const [interneDocs, setInterneDocs] = useState<ObjektDateiDraft[]>([]);
  const [newInterneDocName, setNewInterneDocName] = useState("");
  // Per-wohnung document uploads: wohnungId -> { docId -> filename }
  const [wohnungDocs, setWohnungDocs] = useState<Record<string, Record<string, string>>>({});
  const [wohnungDocFiles, setWohnungDocFiles] = useState<Record<string, Record<string, File>>>({});
  const [expandedWohnungDocs, setExpandedWohnungDocs] = useState<Record<number, boolean>>({});
  // Custom wohnung docs: wohnungId -> [{ id, name, filename, file }]
  const [customWohnungDocs, setCustomWohnungDocs] = useState<Record<string, ObjektDateiDraft[]>>({});
  const [newCustomWohnungDocName, setNewCustomWohnungDocName] = useState<Record<string, string>>({});
  // Per-wohnung image uploads: wohnungId -> ObjektBild[] (thumbnails for preview)
  const [wohnungBilder, setWohnungBilder] = useState<Record<string, { id: string; url: string; alt: string; reihenfolge: number }[]>>({});
  // Original files for wohnung images: wohnungId -> { bildId -> File }
  const [wohnungBilderFiles, setWohnungBilderFiles] = useState<Record<string, Record<string, File>>>({});
  const [removedWohnungBildIds, setRemovedWohnungBildIds] = useState<Record<string, string[]>>({});
  // Einzelwohnung: ID des als Profilbild (Kachel) verwendeten Wohnungsbildes
  const [einzelProfilBildId, setEinzelProfilBildId] = useState<string>("");

  const handleWohnungDocUpload = (wohnungId: string, docId: string, file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Nur PDF-Dateien erlaubt", description: `„${file.name}" wurde nicht übernommen. Wohnungsbilder gehören in den Bilder-Bereich der Einheit.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOKUMENT_BYTES) {
      toast({ title: "Datei ist zu groß", description: `„${file.name}" ist größer als ${MAX_DOKUMENT_MB} MB und wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    setWohnungDocs(prev => ({
      ...prev,
      [wohnungId]: { ...(prev[wohnungId] || {}), [docId]: file.name },
    }));
    setWohnungDocFiles(prev => ({
      ...prev,
      [wohnungId]: { ...(prev[wohnungId] || {}), [docId]: file },
    }));
    toast({ title: `„${file.name}" hinzugefügt ✓`, description: "Unterlage wurde erfolgreich geladen." });
    markDirty();
  };

  const removeWohnungDoc = (wohnungId: string, docId: string) => {
    setWohnungDocs(prev => {
      const updated = { ...prev };
      if (updated[wohnungId]) {
        const docs = { ...updated[wohnungId] };
        delete docs[docId];
        updated[wohnungId] = docs;
      }
      return updated;
    });
    setWohnungDocFiles(prev => {
      const updated = { ...prev };
      if (updated[wohnungId]) {
        const files = { ...updated[wohnungId] };
        delete files[docId];
        updated[wohnungId] = files;
      }
      return updated;
    });
    markDirty();
  };

  const handleWohnungImageUpload = async (wohnungId: string, files: FileList | File[]) => {
    const all = Array.from(files);
    const imageFiles = all.filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i.test(f.name));
    if (imageFiles.length === 0) {
      toast({ title: "Bitte Bilddateien auswählen", variant: "destructive" });
      return;
    }
    if (imageFiles.length < all.length) {
      toast({ title: `${all.length - imageFiles.length} Datei(en) übersprungen – keine Bilder` });
    }
    let added = 0;
    let skipped = 0;
    for (const file of imageFiles) {
      if (!file.size || file.size === 0) { skipped++; continue; }
      try {
        const compressed = await compressImageImmediate(file, "standard");
        if (!compressed?.originalFile || !compressed.originalFile.size || compressed.originalFile.size === 0) {
          skipped++;
          continue;
        }
        const bildId = `wimg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setWohnungBilder(prev => ({
          ...prev,
          [wohnungId]: [...(prev[wohnungId] || []), {
            id: bildId,
            url: compressed.thumbnailDataUrl,
            alt: file.name,
            reihenfolge: (prev[wohnungId] || []).length,
          }],
        }));
        setWohnungBilderFiles(prev => ({
          ...prev,
          [wohnungId]: { ...(prev[wohnungId] || {}), [bildId]: compressed.originalFile },
        }));
        added++;
      } catch (err) {
        console.error("[ObjektNeu] Bild-Verarbeitung fehlgeschlagen:", err);
        skipped++;
      }
    }
    if (added > 0) toast({ title: `${added} Bild(er) hinzugefügt ✓`, description: `Wohnungsbilder wurden erfolgreich geladen.` });
    if (skipped > 0) toast({ title: `${skipped} Bild(er) übersprungen`, description: `Leere oder fehlerhafte Dateien wurden ignoriert.`, variant: "destructive" });
    markDirty();
  };

  const removeWohnungBild = (wohnungId: string, bildId: string) => {
    const isExistingBild = !wohnungBilderFiles[wohnungId]?.[bildId];
    setWohnungBilder(prev => ({
      ...prev,
      [wohnungId]: (prev[wohnungId] || []).filter(b => b.id !== bildId),
    }));
    setWohnungBilderFiles(prev => {
      const updated = { ...prev };
      if (updated[wohnungId]) {
        const files = { ...updated[wohnungId] };
        delete files[bildId];
        updated[wohnungId] = files;
      }
      return updated;
    });
    if (isExistingBild) {
      setRemovedWohnungBildIds(prev => ({
        ...prev,
        [wohnungId]: Array.from(new Set([...(prev[wohnungId] || []), bildId])),
      }));
    }
    markDirty();
  };

  const markDirty = () => {
    hasUserInteractedRef.current = true;

    if (!draftRestored) {
      skipRestore.current = true;
      setDraftRestored(true);
    }

    if (!isDirty) setIsDirty(true);
  };

  /*
   * Anlageklasse und Globalobjekt sind EINE Angabe (Christian, 23.09.2026).
   *
   * Maßgeblich ist der Schalter `isGlobalObjekt`, den die Typwahl setzt. Die
   * Anlageklasse „Globalobjekt“ wird daraus abgeleitet statt ein zweites Mal
   * abgefragt: Ist der Schalter an, zeigt das Feld „Globalobjekt“, ist er aus,
   * kann es nicht „Globalobjekt“ zeigen. Umgekehrt setzt die Wahl
   * „Globalobjekt“ im Feld den Schalter, jede andere Wahl nimmt ihn zurück.
   * So läuft keine der beiden Stellen der anderen davon, auch nicht nach dem
   * Wiederherstellen eines Entwurfs, der nur den Schalter kennt.
   *
   * Bei einem Objekt aus Investagon führt Investagon die Klasse, und der
   * Import setzt danach den Schalter. Hier ist das Feld dann nur Anzeige.
   * Hängt an einem Globalobjekt im CRM ein Kunde, bleibt es Globalobjekt.
   */
  const klassenPflege = isEditMode ? anlageklassePflege(existingObjekt) : "frei";
  const anlageklasseAusInvestagon = klassenPflege === "investagon";
  /** Der Schalter, der gespeichert wird. Nur bei freier Pflege entscheidet dieses Formular. */
  const globalObjektWirksam = klassenPflege === "frei" ? isGlobalObjekt : istGlobalobjekt(existingObjekt);
  const angezeigteAnlageklasse = anlageklasseAusInvestagon
    ? String((existingObjekt?.meta as Record<string, unknown> | undefined)?.anlageklasse ?? "").trim()
    : anlageklasseZumSchalter(anlageklasse, globalObjektWirksam);
  const anlageklasseWaehlen = (wert: string) => {
    if (klassenPflege !== "frei") return;
    setAnlageklasse(wert);
    const global = istGlobalAnlageklasse(wert);
    if (global !== isGlobalObjekt) {
      setIsGlobalObjekt(global);
      // Ein Globalobjekt ist nie zugleich Einzelwohnung, wie bei der Typwahl.
      if (global) setIsEinzelwohnung(false);
      // Die Schritte ändern sich mit, deshalb ein kurzer Hinweis.
      toast(global
        ? { title: "Objekttyp: Globalobjekt", description: "Das Haus wird als Ganzes verkauft. Die Globaldaten folgen im nächsten Schritt." }
        : { title: "Kein Globalobjekt mehr", description: "Das Objekt wird jetzt mit einzelnen Einheiten angelegt." });
    }
    markDirty();
  };

  const removeObjektDoc = (docId: string) => {
    setObjektDocs(prev => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    setObjektDocFiles(prev => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    markDirty();
  };

  const removeExtraDoc = (docId: string) => {
    setExtraDocs(prev => prev.filter(doc => doc.id !== docId));
    markDirty();
  };

  const removeInterneDoc = (docId: string) => {
    setInterneDocs(prev => prev.filter(doc => doc.id !== docId));
    markDirty();
  };

  /**
   * Eine zusätzliche Unterlage an eine Einheit hängen, deren Art nicht in der
   * festen Liste steht. Ohne Titel wird der Dateiname genommen.
   */
  const handleCustomWohnungDocUpload = (wohnungId: string, file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Nur PDF-Dateien erlaubt", description: `„${file.name}" wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOKUMENT_BYTES) {
      toast({ title: "Datei ist zu groß", description: `„${file.name}" ist größer als ${MAX_DOKUMENT_MB} MB und wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    const name = (newCustomWohnungDocName[wohnungId] || "").trim() || file.name.replace(/\.pdf$/i, "");
    setCustomWohnungDocs(prev => ({
      ...prev,
      [wohnungId]: [...(prev[wohnungId] || []), { id: `wcustom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, filename: file.name, file }],
    }));
    setNewCustomWohnungDocName(prev => ({ ...prev, [wohnungId]: "" }));
    toast({ title: `„${name}" hinzugefügt ✓` });
    markDirty();
  };

  const removeCustomWohnungDoc = (wohnungId: string, docId: string) => {
    setCustomWohnungDocs(prev => ({
      ...prev,
      [wohnungId]: (prev[wohnungId] || []).filter(doc => doc.id !== docId),
    }));
    markDirty();
  };

  const removeHauptbild = () => {
    setHauptbildPreview("");
    setHauptbildFile(null);
    setNf(prev => ({ ...prev, bildUrl: "" }));
    markDirty();
  };

  const removeSlideshowImage = (slideId: string) => {
    setSlideshowPreviews(prev => prev.filter(img => img.id !== slideId));
    setSlideshowFiles(prev => {
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    markDirty();
  };

  // ── LocalStorage persistence: save form state so it survives tab switches, browser minimize, etc. ──
  // Je Nutzer (18.10.2026): Vorher teilten sich alle Nutzer eines Browsers
  // einen Entwurf. Der alte Schlüssel wird beim Wiederherstellen einmal
  // übernommen und dann gelöscht.
  const LS_KEY_ALT = isEditMode ? `osimmo_objekt_edit_${editId}` : "osimmo_objekt_neu_draft";
  const LS_KEY = `${LS_KEY_ALT}::${authUser?.id ?? "lokal"}`;
  // Nach „Entwurf verwerfen“ darf nichts mehr zurückgeschrieben werden,
  // weder verzögert noch beim Verlassen der Seite.
  const entwurfVerworfenRef = useRef(false);
  const skipRestore = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Refs to always hold the latest draft values for flush handlers (avoids stale closures)
  const latestPersistedDraftRef = useRef<ObjektNeuDraft | null>(null);
  const latestDraftBlobsRef = useRef<Record<string, File>>({});
  const latestVerkaeuferDatenRef = useRef(verkaeuferDaten);
  const saveSuccessRef = useRef(saveSuccess);
  saveSuccessRef.current = saveSuccess;
  const draftRestoredRef = useRef(draftRestored);
  draftRestoredRef.current = draftRestored;

  const currentDraft = useMemo<ObjektNeuDraft>(() => ({
    nf,
    isGlobalObjekt,
    isEinzelwohnung,
    gewaehlteObjektart,
    verkaeuferDaten,
    sanierungskosten,
    afaDaten,
    afaDraft,
    globalDaten,
    objektangaben,
    interneHighlightsText,
    einzelWohnungen,
    hauptbildPreview,
    hauptbildFile,
    slideshowPreviews,
    slideshowFiles,
    objektDocs,
    objektDocFiles,
    extraDocs,
    interneDocs,
    wohnungDocs,
    wohnungDocFiles,
    expandedWohnungDocs,
    customWohnungDocs,
    newCustomWohnungDocName,
    wohnungBilder,
    wohnungBilderFiles,
    uploadedPdfFiles,
    newW,
    bulkW,
    bulkAnzahl,
    bulkStartWeNr,
    newExtraDocName,
    newInterneDocName,
    uploadAnalyseDraft,
    step,
    editingIdx,
    isDirty,
    zusatz: {
      anlageklasse, konzept, verwaltungsart, verwaltungskostenWeg, verwaltungskostenSev, verwaltungskostenSonstige,
      kalkHausgeldNuP, kalkHausgeldNuEuro, kalkHausgeldMonat, ruecklageWeg, garantierteErstvermietungKalt, kalkSevMonat,
      kalkMietausfallP, kalkInstandhaltungQm, kalkInstandhaltungMode, kalkInstandhaltungPct,
      objektUnterlagenLink, einzelProfilBildId, objektdatenForm, exklusivKennungen,
    },
    hasPendingLocalFiles: hasPersistedFiles({
      hauptbildFile,
      uploadedPdfFiles: [...uploadedPdfFiles, ...uploadAnalyseDraft.files, ...Object.values(uploadAnalyseDraft.slotFiles).flat()],
      slideshowFiles,
      objektDocFiles,
      wohnungDocFiles,
      wohnungBilderFiles,
      extraDocs,
      interneDocs,
      customWohnungDocs,
    }),
  }), [nf, isGlobalObjekt, isEinzelwohnung, gewaehlteObjektart, verkaeuferDaten, sanierungskosten, afaDaten, afaDraft, globalDaten, objektangaben, interneHighlightsText,
      einzelWohnungen, hauptbildPreview, hauptbildFile, slideshowPreviews, slideshowFiles,
      objektDocs, objektDocFiles, extraDocs, interneDocs, wohnungDocs, wohnungDocFiles,
      expandedWohnungDocs, customWohnungDocs, newCustomWohnungDocName, wohnungBilder,
      wohnungBilderFiles, uploadedPdfFiles, newW, bulkW, bulkAnzahl, bulkStartWeNr,
      uploadAnalyseDraft,
      newExtraDocName, newInterneDocName, step, editingIdx, isDirty,
      anlageklasse, konzept, verwaltungsart, verwaltungskostenWeg, verwaltungskostenSev, verwaltungskostenSonstige,
      kalkHausgeldNuP, kalkHausgeldNuEuro, kalkHausgeldMonat, ruecklageWeg, garantierteErstvermietungKalt, kalkSevMonat,
      kalkMietausfallP, kalkInstandhaltungQm, kalkInstandhaltungMode, kalkInstandhaltungPct,
      objektUnterlagenLink, einzelProfilBildId, objektdatenForm, exklusivKennungen]);

  const currentDraftBlobs = useMemo<Record<string, File>>(() => {
    const blobs: Record<string, File> = {};

    if (hauptbildFile) blobs[DRAFT_BLOB_KEYS.hauptbild] = hauptbildFile;

    Object.entries(slideshowFiles).forEach(([id, file]) => {
      blobs[`${DRAFT_BLOB_KEYS.slideshow}${id}`] = file;
    });

    Object.entries(objektDocFiles).forEach(([docId, file]) => {
      blobs[`${DRAFT_BLOB_KEYS.objektDoc}${docId}`] = file;
    });

    Object.entries(wohnungDocFiles).forEach(([wohnungId, docs]) => {
      Object.entries(docs).forEach(([docId, file]) => {
        blobs[`${DRAFT_BLOB_KEYS.wohnungDoc}${wohnungId}::${docId}`] = file;
      });
    });

    Object.entries(wohnungBilderFiles).forEach(([wohnungId, bilder]) => {
      Object.entries(bilder).forEach(([bildId, file]) => {
        blobs[`${DRAFT_BLOB_KEYS.wohnungBild}${wohnungId}::${bildId}`] = file;
      });
    });

    extraDocs.forEach((doc) => {
      if (isFileInstance(doc.file)) blobs[`${DRAFT_BLOB_KEYS.extraDoc}${doc.id}`] = doc.file;
    });

    interneDocs.forEach((doc) => {
      if (isFileInstance(doc.file)) blobs[`${DRAFT_BLOB_KEYS.interneDoc}${doc.id}`] = doc.file;
    });

    Object.entries(customWohnungDocs).forEach(([wohnungId, docs]) => {
      docs.forEach((doc) => {
        if (isFileInstance(doc.file)) blobs[`${DRAFT_BLOB_KEYS.customWohnungDoc}${wohnungId}::${doc.id}`] = doc.file;
      });
    });

    uploadedPdfFiles.forEach((file, index) => {
      blobs[`${DRAFT_BLOB_KEYS.uploadedPdf}${index}`] = file;
    });

    uploadAnalyseDraft.files.forEach((file, index) => {
      blobs[`${DRAFT_BLOB_KEYS.uploadAnalyseFile}${index}`] = file;
    });

    Object.entries(uploadAnalyseDraft.slotFiles).forEach(([slotId, files]) => {
      files.forEach((file, index) => {
        blobs[`${DRAFT_BLOB_KEYS.uploadAnalyseSlotFile}${slotId}::${index}`] = file;
      });
    });

    return blobs;
  }, [customWohnungDocs, extraDocs, hauptbildFile, interneDocs, objektDocFiles, slideshowFiles, uploadAnalyseDraft.files, uploadAnalyseDraft.slotFiles, uploadedPdfFiles, wohnungBilderFiles, wohnungDocFiles]);

  const persistedDraft = useMemo<ObjektNeuDraft>(() => ({
    ...currentDraft,
    hauptbildFile: null,
    slideshowFiles: {},
    objektDocFiles: {},
    wohnungDocFiles: {},
    wohnungBilderFiles: {},
    uploadedPdfFiles: [],
    extraDocs: currentDraft.extraDocs.map(({ file, ...doc }) => doc),
    interneDocs: currentDraft.interneDocs.map(({ file, ...doc }) => doc),
    customWohnungDocs: Object.fromEntries(
      Object.entries(currentDraft.customWohnungDocs).map(([wohnungId, docs]) => [
        wohnungId,
        docs.map(({ file, ...doc }) => doc),
      ]),
    ),
    uploadAnalyseDraft: {
      ...currentDraft.uploadAnalyseDraft,
      files: [],
      slotFiles: {},
    },
    hasPendingLocalFiles: Object.keys(currentDraftBlobs).length > 0,
  }), [currentDraft, currentDraftBlobs]);

  // Keep refs in sync so flush handlers always use the latest values
  useLayoutEffect(() => {
    latestPersistedDraftRef.current = persistedDraft;
    latestDraftBlobsRef.current = currentDraftBlobs;
    latestEinzelWohnungenRef.current = einzelWohnungen;
    latestNewWRef.current = newW;
    latestEditingIdxRef.current = editingIdx;
    latestVerkaeuferDatenRef.current = verkaeuferDaten;
  }, [persistedDraft, currentDraftBlobs, einzelWohnungen, newW, editingIdx, verkaeuferDaten]);

  // In Einzelwohnung-Modus mit genau einer vorhandenen Wohnung automatisch in den
  // Edit-Modus springen, damit der Nutzer die Felder direkt sieht & bearbeiten kann
  // (statt erst auf das Stift-Icon klicken zu müssen).
  useEffect(() => {
    if (isEinzelwohnung && einzelWohnungen.length === 1 && editingIdx === null) {
      setEditingIdx(0);
      latestEditingIdxRef.current = 0;
    }
  }, [isEinzelwohnung, einzelWohnungen.length, editingIdx]);

  // Save draft on every relevant change (debounced).
  // Drafts werden auch im Edit-Modus gespeichert, damit Tab-Wechsel keine
  // Bearbeitungen verlieren. Erst nach erfolgreichem Speichern wird der Draft
  // verworfen.
  useEffect(() => {
    if (saveSuccess || !draftRestored || entwurfVerworfenRef.current) return;

    const timeoutId = window.setTimeout(() => {
      void saveObjektDraft(LS_KEY, persistedDraft).catch(() => undefined);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [LS_KEY, draftRestored, persistedDraft, saveSuccess]);

  // Dateien eigener Effekt: Vorher schrieb jeder Tastendruck alle Bilder und
  // PDFs erneut in den Browser-Speicher.
  useEffect(() => {
    if (saveSuccess || !draftRestored || entwurfVerworfenRef.current) return;
    void saveObjektDraftBlobs(LS_KEY, currentDraftBlobs).catch(() => undefined);
  }, [LS_KEY, currentDraftBlobs, draftRestored, saveSuccess]);

  // Flush draft immediately on tab switch / blur / pagehide using refs (never stale)
  useEffect(() => {
    let rafId: number | null = null;

    const flushDraft = () => {
      flushSync(() => undefined);
      if (saveSuccessRef.current || entwurfVerworfenRef.current || !draftRestoredRef.current) return;

      if (latestPersistedDraftRef.current) {
        const draftSnapshot: ObjektNeuDraft = {
          ...latestPersistedDraftRef.current,
          einzelWohnungen: latestEinzelWohnungenRef.current,
          newW: latestNewWRef.current,
          editingIdx: latestEditingIdxRef.current,
          verkaeuferDaten: latestVerkaeuferDatenRef.current,
        };

        // Synchron zuerst: Beim Neuladen schafft IndexedDB es oft nicht mehr.
        saveObjektDraftSofort(LS_KEY, draftSnapshot);
        void Promise.all([
          saveObjektDraft(LS_KEY, draftSnapshot),
          saveObjektDraftBlobs(LS_KEY, latestDraftBlobsRef.current),
        ]).catch(() => undefined);
      }
    };

    const scheduleFlushDraft = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        flushDraft();
        rafId = null;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("blur", scheduleFlushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("blur", scheduleFlushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [LS_KEY]);

  // Flush draft on component unmount (SPA navigation away from this page)
  const lsKeyRef = useRef(LS_KEY);
  lsKeyRef.current = LS_KEY;
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;
  useEffect(() => {
    return () => {
      if (saveSuccessRef.current || entwurfVerworfenRef.current || !draftRestoredRef.current) return;
      if (latestPersistedDraftRef.current) {
        const draftSnapshot: ObjektNeuDraft = {
          ...latestPersistedDraftRef.current,
          einzelWohnungen: latestEinzelWohnungenRef.current,
          newW: latestNewWRef.current,
          editingIdx: latestEditingIdxRef.current,
          verkaeuferDaten: latestVerkaeuferDatenRef.current,
        };
        void Promise.all([
          saveObjektDraft(lsKeyRef.current, draftSnapshot),
          saveObjektDraftBlobs(lsKeyRef.current, latestDraftBlobsRef.current),
        ]).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore draft on mount for new objects only.
  // CRITICAL: In edit mode, NEVER restore a local draft – always use fresh DB data.
  // This prevents stale drafts from overwriting existing images, documents, or field values.
  useEffect(() => {
    // Erst wenn feststeht, wer angemeldet ist, sonst liefe die Suche unter dem falschen Schlüssel.
    if (draftRestored || nutzerLaedt || (isEditMode && !editLoaded)) return;
    let cancelled = false;

    const restoreDraft = async () => {
      try {
        let [draft, draftBlobs] = await Promise.all([
          loadObjektDraft<ObjektNeuDraft>(LS_KEY),
          loadObjektDraftBlobs(LS_KEY),
        ]);
        if (!draft) {
          // Entwurf aus der Zeit vor dem Schlüssel je Nutzer übernehmen.
          [draft, draftBlobs] = await Promise.all([
            loadObjektDraft<ObjektNeuDraft>(LS_KEY_ALT),
            loadObjektDraftBlobs(LS_KEY_ALT),
          ]);
          if (draft) void deleteObjektDraft(LS_KEY_ALT);
        }
        if (cancelled || skipRestore.current || hasUserInteractedRef.current || !draft) {
          if (!cancelled) setDraftRestored(true);
          return;
        }

        // Safety: if an objekt with the same address already exists in DB, the draft
        // is stale (e.g. a previous save partially succeeded). Discard it.
        if (!isEditMode && draft.nf?.adresse) {
          const existing = getObjekte();
          const normalize = (s: string) => (s || "").trim().toLowerCase();
          const collision = existing.some(o => normalize(o.adresse) === normalize(draft.nf!.adresse!));
          if (collision) {
            await deleteObjektDraft(LS_KEY);
            toast({
              title: "Entwurf verworfen",
              description: `Ein Objekt mit der Adresse „${draft.nf.adresse}" existiert bereits. Der alte Entwurf wurde entfernt.`,
            });
            if (!cancelled) setDraftRestored(true);
            return;
          }
        }

        const restoredUploadAnalyseFiles = Object.entries(draftBlobs)
          .filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.uploadAnalyseFile))
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([, file]) => file);

        const restoredUploadAnalyseSlotFiles = Object.entries(draftBlobs)
          .filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.uploadAnalyseSlotFile))
          .reduce<Record<string, File[]>>((acc, [key, file]) => {
            const [, slotId, index] = key.split("::");
            const next = [...(acc[slotId] || [])];
            next[Number(index)] = file;
            acc[slotId] = next.filter(Boolean);
            return acc;
          }, {});

        const restoredWohnungDocFiles = Object.entries(draftBlobs)
          .filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.wohnungDoc))
          .reduce<Record<string, Record<string, File>>>((acc, [key, file]) => {
            const [, wohnungId, docId] = key.split("::");
            acc[wohnungId] = { ...(acc[wohnungId] || {}), [docId]: file };
            return acc;
          }, {});

        const restoredWohnungBilderFiles = Object.entries(draftBlobs)
          .filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.wohnungBild))
          .reduce<Record<string, Record<string, File>>>((acc, [key, file]) => {
            const [, wohnungId, bildId] = key.split("::");
            acc[wohnungId] = { ...(acc[wohnungId] || {}), [bildId]: file };
            return acc;
          }, {});

        const restoredCustomWohnungDocs = Object.fromEntries(
          Object.entries(draft.customWohnungDocs || {}).map(([wohnungId, docs]) => [
            wohnungId,
            docs.map((doc) => ({ ...doc, file: draftBlobs[`${DRAFT_BLOB_KEYS.customWohnungDoc}${wohnungId}::${doc.id}`] })),
          ]),
        );

        // Über die Vorbelegung gelegt: Ein Entwurf aus einer älteren Fassung
        // kennt neuere Felder nicht, und undefined brachte das Formular zum Absturz.
        if (draft.nf) setNf({ ...initialNfState, ...draft.nf });
        if (draft.isGlobalObjekt !== undefined) setIsGlobalObjekt(draft.isGlobalObjekt);
        if (draft.isEinzelwohnung !== undefined) setIsEinzelwohnung(draft.isEinzelwohnung);
        if (draft.gewaehlteObjektart !== undefined) setGewaehlteObjektart(draft.gewaehlteObjektart);
        if (draft.verkaeuferDaten) setVerkaeuferDaten({ ...initialVerkaeuferDaten, ...draft.verkaeuferDaten });
        if (draft.sanierungskosten !== undefined) setSanierungskosten(draft.sanierungskosten);
        if (draft.afaDaten) setAfaDaten({ ...initialAfaDaten, ...draft.afaDaten });
        if (draft.afaDraft) setAfaDraft(draft.afaDraft);
        if (draft.globalDaten) setGlobalDaten({ ...initialGlobalDaten, ...draft.globalDaten });
        if (draft.objektangaben) setObjektangaben(draft.objektangaben);
        if (draft.interneHighlightsText !== undefined) setInterneHighlightsText(draft.interneHighlightsText);
        if (draft.einzelWohnungen) setEinzelWohnungen(draft.einzelWohnungen);
        if (draft.editingIdx !== undefined) setEditingIdx(draft.editingIdx);
        if (draft.hauptbildPreview !== undefined) setHauptbildPreview(draft.hauptbildPreview);
        if (draft.hauptbildFile !== undefined) setHauptbildFile(draftBlobs[DRAFT_BLOB_KEYS.hauptbild] ?? null);
        if (draft.slideshowPreviews) setSlideshowPreviews(draft.slideshowPreviews);
        const restoredSlideshowFiles = Object.fromEntries(
          Object.entries(draftBlobs).filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.slideshow)).map(([key, file]) => [key.replace(DRAFT_BLOB_KEYS.slideshow, ""), file]),
        );
        setSlideshowFiles(restoredSlideshowFiles);
        if (draft.objektDocs) setObjektDocs(draft.objektDocs);
        setObjektDocFiles(Object.fromEntries(
          Object.entries(draftBlobs).filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.objektDoc)).map(([key, file]) => [key.replace(DRAFT_BLOB_KEYS.objektDoc, ""), file]),
        ));
        if (draft.extraDocs) setExtraDocs(draft.extraDocs.map((doc) => ({ ...doc, file: draftBlobs[`${DRAFT_BLOB_KEYS.extraDoc}${doc.id}`] })));
        if (draft.interneDocs) setInterneDocs(draft.interneDocs.map((doc) => ({ ...doc, file: draftBlobs[`${DRAFT_BLOB_KEYS.interneDoc}${doc.id}`] })));
        if (draft.wohnungDocs) setWohnungDocs(draft.wohnungDocs);
        setWohnungDocFiles(restoredWohnungDocFiles);
        if (draft.expandedWohnungDocs) setExpandedWohnungDocs(draft.expandedWohnungDocs);
        if (draft.wohnungBilder) setWohnungBilder(draft.wohnungBilder);
        setWohnungBilderFiles(restoredWohnungBilderFiles);
        if (draft.customWohnungDocs) setCustomWohnungDocs(restoredCustomWohnungDocs);
        if (draft.newCustomWohnungDocName) setNewCustomWohnungDocName(draft.newCustomWohnungDocName);
        setUploadedPdfFiles(Object.entries(draftBlobs)
          .filter(([key]) => key.startsWith(DRAFT_BLOB_KEYS.uploadedPdf))
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([, file]) => file));
        if (draft.newW) setNewW(draft.newW);
        if (draft.zusatz) {
          const z = draft.zusatz;
          setAnlageklasse(z.anlageklasse ?? "");
          setKonzept(z.konzept ?? "");
          setVerwaltungsart(z.verwaltungsart ?? "");
          setVerwaltungskostenWeg(z.verwaltungskostenWeg ?? 0);
          setVerwaltungskostenSev(z.verwaltungskostenSev ?? 0);
          setVerwaltungskostenSonstige(z.verwaltungskostenSonstige ?? 0);
          setKalkHausgeldNuP(z.kalkHausgeldNuP ?? 30);
          setKalkHausgeldNuEuro(z.kalkHausgeldNuEuro ?? 0);
          setKalkHausgeldMonat(z.kalkHausgeldMonat ?? 0);
          setRuecklageWeg(z.ruecklageWeg ?? 0);
          setGarantierteErstvermietungKalt(z.garantierteErstvermietungKalt ?? 0);
          setKalkSevMonat(z.kalkSevMonat ?? 0);
          setKalkMietausfallP(z.kalkMietausfallP ?? 2);
          setKalkInstandhaltungQm(z.kalkInstandhaltungQm ?? 0);
          setKalkInstandhaltungMode(z.kalkInstandhaltungMode === "pct" ? "pct" : "qm");
          setKalkInstandhaltungPct(z.kalkInstandhaltungPct ?? 1.0);
          setObjektUnterlagenLink(z.objektUnterlagenLink ?? "");
          setEinzelProfilBildId(z.einzelProfilBildId ?? "");
          setObjektdatenForm(z.objektdatenForm ?? null);
          setExklusivKennungen(z.exklusivKennungen ?? {});
        }
        if (draft.bulkW) setBulkW(draft.bulkW);
        if (draft.bulkAnzahl !== undefined) setBulkAnzahl(draft.bulkAnzahl);
        if (draft.bulkStartWeNr !== undefined) setBulkStartWeNr(draft.bulkStartWeNr);
        if (draft.newExtraDocName !== undefined) setNewExtraDocName(draft.newExtraDocName);
        if (draft.newInterneDocName !== undefined) setNewInterneDocName(draft.newInterneDocName);
        if (draft.uploadAnalyseDraft) {
          setUploadAnalyseDraft({
            ...draft.uploadAnalyseDraft,
            files: restoredUploadAnalyseFiles,
            slotFiles: restoredUploadAnalyseSlotFiles,
            runtime: draft.uploadAnalyseDraft.runtime ?? createEmptyUploadAnalyseRuntimeState({ result: draft.uploadAnalyseDraft.result ?? null }),
          });
        }
        // Zurück an den zuletzt offenen Schritt, auch beim Neuanlegen
        // (18.10.2026). Vorher begann es immer bei der Typwahl, und eine
        // andere Karte als vorher änderte still die Objektart.
        if (draft.step && (isEditMode || draft.step !== "typ")) setStep(draft.step);
        if (draft.isDirty) setIsDirty(true);

        const restoredFiles = Object.keys(draftBlobs).length > 0;
        if (draft.hasPendingLocalFiles && !restoredFiles) {
          toast({
            title: "Entwurf wiederhergestellt",
            description: "Alle Felder wurden geladen. Bitte lokale Datei-Uploads erneut auswählen.",
          });
        } else if (draft.isDirty || restoredFiles) {
          toast({
            title: "Entwurf wiederhergestellt",
            description: restoredFiles
              ? "Alle Felder und hochgeladenen Unterlagen wurden wiederhergestellt."
              : "Alle eingegebenen Felder wurden wiederhergestellt.",
          });
        }
      } catch {
        // Ignore corrupt drafts.
      }

      if (!cancelled) setDraftRestored(true);
    };

    void restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [LS_KEY, LS_KEY_ALT, draftRestored, editLoaded, isEditMode, nutzerLaedt, toast]);

  /*
   * Hinweis beim Verlassen (18.10.2026), gebaut wie im Schnellaktionen-Dialog
   * (QuickActionDialog): BrowserRouter kennt kein useBlocker, deshalb werden
   * Klicks auf interne Links (Sidebar, Kopfzeile) in der Capture-Phase
   * angehalten und nach „Ja“ selbst ausgelöst. Schließen oder Neuladen des
   * Tabs fragt der Browser über beforeunload. Die Eingaben bleiben in jedem
   * Fall als Entwurf liegen.
   */
  const verlassenHinweisAktiv = isDirty && !saveSuccess;
  const verlassenBestaetigen = () => confirmDialog({
    title: isEditMode ? "Möchtest du das Bearbeiten des Objekts wirklich verlassen?" : "Möchtest du das Anlegen des Objekts wirklich verlassen?",
    description: "Deine Eingaben bleiben als Entwurf gespeichert.",
    confirmText: "Ja",
    cancelText: "Nein",
  });
  const verlassenBestaetigenRef = useRef(verlassenBestaetigen);
  verlassenBestaetigenRef.current = verlassenBestaetigen;
  useEffect(() => {
    if (!verlassenHinweisAktiv) return;
    // Einmaliger Freifahrtschein für den Klick, den wir nach „Ja“ selbst auslösen.
    let wechselFreigegeben = false;
    // Nach „Ja“ nicht noch einmal über den Browser fragen (Links ohne Router).
    let verlassenBestaetigt = false;
    const beimSchliessen = (e: BeforeUnloadEvent) => {
      if (entwurfVerworfenRef.current || verlassenBestaetigt) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const beimKlick = (ev: MouseEvent) => {
      if (wechselFreigegeben) { wechselFreigegeben = false; return; }
      // Neuer Tab (Strg/Cmd, Mittelklick) verlässt das Formular nicht.
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const anchor = (ev.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      if (anchor.origin === window.location.origin && anchor.pathname === window.location.pathname) return;
      ev.preventDefault();
      ev.stopPropagation();
      void verlassenBestaetigenRef.current().then((ok) => {
        if (!ok) return;
        wechselFreigegeben = true;
        verlassenBestaetigt = true;
        anchor.click();
      });
    };
    window.addEventListener("beforeunload", beimSchliessen);
    document.addEventListener("click", beimKlick, true);
    return () => {
      window.removeEventListener("beforeunload", beimSchliessen);
      document.removeEventListener("click", beimKlick, true);
    };
  }, [verlassenHinweisAktiv]);

  // Clear draft after successful save
  useEffect(() => {
    if (saveSuccess) {
      void deleteObjektDraft(LS_KEY);
    }
  }, [LS_KEY, saveSuccess]);

  // Auto-fill from KI analysis
  const handleAnalyseComplete = (data: ExtractedObjektData, pdfFiles: File[], cloudUrl?: string) => {
    setUploadedPdfFiles(pdfFiles);
    if (cloudUrl) setNf(prev => ({ ...prev, cloudOrdnerUrl: cloudUrl }));

    // Fill Basisdaten
    setNf(prev => ({
      ...prev,
      titel: data.titel || prev.titel,
      adresse: data.adresse || prev.adresse,
      plz: data.plz || prev.plz,
      ort: data.ort || prev.ort,
      beschreibung: data.beschreibung || prev.beschreibung,
    }));

    // Fill Global data
    setGlobalDaten(prev => ({
      ...prev,
      gesamtQm: data.gesamtWohnflaeche || prev.gesamtQm,
      grundstueckQm: data.grundstueckFlaeche || prev.grundstueckQm,
      etagen: data.etagen || prev.etagen,
      baujahr: data.baujahr || prev.baujahr,
      zustand: data.zustand || prev.zustand,
      energieeffizienzklasse: data.energieeffizienzklasse || prev.energieeffizienzklasse,
      stellplaetze: data.stellplaetze || prev.stellplaetze,
    }));

    // Fill Wohnungen
    if (data.wohnungen && data.wohnungen.length > 0) {
      const wohnungen: Partial<ObjektWohnung>[] = data.wohnungen.map((w, i) => {
        const groesse = w.groesse || 0;
        const vk = w.kaufpreis || 0;
        const miete = w.kaltmiete || 0;
        const qmPreis = groesse > 0 && vk > 0 ? parseFloat((vk / groesse).toFixed(2)) : 0;
        const rendite = vk > 0 && miete > 0 ? parseFloat(((miete * 12 / vk) * 100).toFixed(2)) : 0;

        return {
          id: `w-ai-${Date.now()}-${i}`,
          weNr: w.weNr || String(i + 1),
          etage: w.etage || "EG",
          lage: w.hauseingang ? `Eingang ${w.hauseingang}` : "",
          groesse,
          zimmer: w.zimmer || 2,
          mieteGesamt: miete,
          vkGesamt: vk,
          qmPreis,
          rendite,
          vermietet: w.vermietet !== false,
          status: "frei" as const,
        };
      });
      latestEinzelWohnungenRef.current = wohnungen;
      setEinzelWohnungen(wohnungen);

      // If many wohnungen, don't set as global. Nicht bei einem Objekt, dessen
      // Schalter dieses Formular nicht führt (Investagon, reserviertes Haus).
      if (wohnungen.length > 1 && klassenPflege === "frei") {
        setIsGlobalObjekt(false);
      }
    }

    // Map erkannte Dokumente to objektDocs
    if (data.erkannte_dokumente) {
      const docMapping: Record<string, string> = {};
      const DOC_TYPE_TO_CATEGORY: Record<string, string> = {
        expose: "expose",
        lageplan: "lageplan",
        versicherungsnachweis: "versicherungsnachweis",
        energieausweis: "energieausweis",
        aufteilungsplan: "aufteilungsplan",
        grundbuchauszug: "grundbuchauszug",
        teilungserklaerung: "teilungserklaerung",
        wohnflaechenberechnung: "wohnflaechenberechnung",
      };
      data.erkannte_dokumente.forEach(doc => {
        const catId = DOC_TYPE_TO_CATEGORY[doc.typ];
        if (catId) docMapping[catId] = doc.dateiname;
      });
      setObjektDocs(prev => ({ ...prev, ...docMapping }));
    }

    markDirty();
    toast({ title: "Daten übernommen ✓", description: "Alle extrahierten Daten wurden in die Formulare eingetragen. Bitte prüfe die Angaben." });
    setStep("0"); // Navigate to Basisdaten
  };

  const updateField = (field: string, value: any) => {
    setNf(p => ({ ...p, [field]: value }));
    markDirty();
  };

  const handleWohnungFieldChange = (field: string, value: any, isEdit = false) => {
    if (isEdit && editingIdx !== null) {
      setEinzelWohnungen(prev => {
        const updated = [...prev];
        updated[editingIdx] = recalcWohnung({ ...updated[editingIdx], [field]: value }, field);
        latestEinzelWohnungenRef.current = updated;
        return updated;
      });
    } else {
      setNewW(prev => {
        const updated = recalcWohnung({ ...prev, [field]: value }, field);
        latestNewWRef.current = updated;
        return updated;
      });
    }
    markDirty();
  };

  const handleBulkFieldChange = (field: string, value: any) => {
    setBulkW(prev => recalcWohnung({ ...prev, [field]: value }, field));
  };

  const addEinzelWohnung = () => {
    if (!newW.weNr) { toast({ title: "WE-Nr. ist Pflicht", variant: "destructive" }); return; }
    const wId = newW.id || `w-${Date.now()}`;
    // Transfer docs from newW id to permanent id
    if (newW.id && wohnungDocs[newW.id]) {
      setWohnungDocs(prev => ({ ...prev, [wId]: prev[newW.id!] }));
    }
    setEinzelWohnungen(prev => {
      const updated = [...prev, { ...newW, id: wId }];
      latestEinzelWohnungenRef.current = updated;
      return updated;
    });
    const resetWohnung = emptyW();
    latestNewWRef.current = resetWohnung;
    setNewW(resetWohnung);
    markDirty();
  };

  const addBulkWohnungen = () => {
    const newUnits: Partial<ObjektWohnung>[] = [];
    for (let i = 0; i < bulkAnzahl; i++) {
      const weNr = String(bulkStartWeNr + i);
      newUnits.push({ ...bulkW, weNr, id: `w-${Date.now()}-${i}` });
    }
    setEinzelWohnungen(prev => {
      const updated = [...prev, ...newUnits];
      latestEinzelWohnungenRef.current = updated;
      return updated;
    });
    setShowBulkDialog(false);
    setBulkW(emptyW());
    setBulkAnzahl(2);
    markDirty();
    toast({ title: `${newUnits.length} Wohnungen angelegt ✓` });
  };

  const removeWohnung = (idx: number) => {
    const removedWohnungId = einzelWohnungen[idx]?.id;
    setEinzelWohnungen(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      latestEinzelWohnungenRef.current = updated;
      return updated;
    });
    if (removedWohnungId) {
      setWohnungDocs(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setWohnungDocFiles(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setWohnungBilder(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setWohnungBilderFiles(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setRemovedWohnungBildIds(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setCustomWohnungDocs(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
      setNewCustomWohnungDocName(prev => {
        const next = { ...prev };
        delete next[removedWohnungId];
        return next;
      });
    }
    if (editingIdx === idx) {
      latestEditingIdxRef.current = null;
      setEditingIdx(null);
    }
    markDirty();
  };

  const startEdit = (idx: number) => {
    latestEditingIdxRef.current = idx;
    setEditingIdx(idx);
  };

  const saveEdit = () => {
    latestEditingIdxRef.current = null;
    setEditingIdx(null);
    toast({ title: "Wohnung aktualisiert ✓" });
  };

  /**
   * Eine Objektunterlage in eine feste Kategorie legen.
   *
   * Nur PDF: Alles andere wird nicht stillschweigend verworfen, sondern
   * abgelehnt, damit der Nutzer nicht glaubt, die Datei sei angekommen.
   * Bilder gehören nicht hierher, sie laufen über den Medien-Schritt.
   */
  const handleDocUpload = async (docId: string, file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Nur PDF-Dateien erlaubt", description: `„${file.name}" wurde nicht übernommen. Bilder gehören in den Schritt Medien.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOKUMENT_BYTES) {
      toast({ title: "Datei ist zu groß", description: `„${file.name}" ist größer als ${MAX_DOKUMENT_MB} MB und wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    setObjektDocs(prev => ({ ...prev, [docId]: file.name }));
    setObjektDocFiles(prev => ({ ...prev, [docId]: file }));
    toast({ title: `„${file.name}" hinzugefügt ✓` });
    markDirty();
  };

  const handleExtraDocUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Nur PDF-Dateien erlaubt", variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOKUMENT_BYTES) {
      toast({ title: "Datei ist zu groß", description: `„${file.name}" ist größer als ${MAX_DOKUMENT_MB} MB und wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    const name = newExtraDocName.trim() || file.name.replace(".pdf", "");
    setExtraDocs(prev => [...prev, { id: `extra-${Date.now()}`, name, filename: file.name, file }]);
    setNewExtraDocName("");
    markDirty();
  };

  const handleInterneDocUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Nur PDF-Dateien erlaubt", variant: "destructive" });
      return;
    }
    if (file.size > MAX_DOKUMENT_BYTES) {
      toast({ title: "Datei ist zu groß", description: `„${file.name}" ist größer als ${MAX_DOKUMENT_MB} MB und wurde nicht übernommen.`, variant: "destructive" });
      return;
    }
    const name = newInterneDocName.trim() || file.name.replace(".pdf", "");
    setInterneDocs(prev => [...prev, { id: `intern-${Date.now()}`, name, filename: file.name, file }]);
    setNewInterneDocName("");
    markDirty();
  };

  const handleBack = async () => {
    if (isAnalysisRunning) {
      setShowAnalysisAbortConfirm(true);
      return;
    }
    if (verlassenHinweisAktiv && !(await verlassenBestaetigen())) return;
    navigate(isEditMode ? `/objekte/${editId}` : "/objekte");
  };

  const handleCreate = async () => {
    if (isSaving) return;
    if (!nf.titel.trim()) { toast({ title: "Titel ist Pflichtfeld", variant: "destructive" }); return; }
    if (!verkaeuferDaten.name.trim()) { toast({ title: "Verkäuferdaten: Name ist Pflichtfeld", variant: "destructive" }); return; }
    // Das Sternchen gilt jetzt wirklich. Nicht bei Investagon-Objekten: Dort
    // führt Investagon die Klasse, und das Feld ist hier gesperrt.
    if (!anlageklasseAusInvestagon && !angezeigteAnlageklasse) {
      toast({ title: "Anlageklasse ist Pflichtfeld", description: "Bitte wähle unter Basisdaten eine Anlageklasse.", variant: "destructive" });
      setStep("0");
      return;
    }

    // Auto-Commit: wenn der Nutzer im "Wohnung hinzufügen"-Formular Daten eingegeben hat,
    // aber NICHT auf "Wohnung hinzufügen" geklickt hat, wird die Wohnung beim Speichern
    // automatisch übernommen. Andernfalls würden Wohnungsdaten und -bilder verloren gehen.
    let effectiveEinzelWohnungen = einzelWohnungen;
    const newWTempId = newW.id || "";
    const newWHasBilder = !!(newWTempId && ((wohnungBilder[newWTempId]?.length || 0) > 0 || Object.keys(wohnungBilderFiles[newWTempId] || {}).length > 0));
    const newWHasDocs = !!(newWTempId && ((Object.keys(wohnungDocs[newWTempId] || {}).length > 0) || (Object.keys(wohnungDocFiles[newWTempId] || {}).length > 0) || ((customWohnungDocs[newWTempId]?.length || 0) > 0)));
    const newWHasData = !!(newW.weNr || (newW.groesse || 0) > 0 || (newW.vkGesamt || 0) > 0 || (newW.mieteGesamt || 0) > 0 || (newW.zimmer || 0) > 0 || (newW as any).unterlagenLink || newWHasBilder || newWHasDocs);
    /*
     * Bei mehreren Einheiten fiel eine begonnene, nicht hinzugefügte Einheit
     * bis zum 18.10.2026 still weg, ihre Bilder wurden trotzdem hochgeladen.
     * Jetzt wird sie übernommen, sobald eigene Angaben drinstehen. Die
     * Vorbelegung (2 Zimmer, EG) zählt dafür nicht.
     */
    const newWHasEigeneAngaben = !!(newW.weNr || (newW.groesse || 0) > 0 || (newW.vkGesamt || 0) > 0 || (newW.mieteGesamt || 0) > 0 || (newW as any).unterlagenLink || newWHasBilder || newWHasDocs);
    const shouldAutoCommit = isEinzelwohnung ? newWHasData && einzelWohnungen.length === 0 : newWHasEigeneAngaben;
    if (shouldAutoCommit) {
      const autoWeNr = newW.weNr || (isEinzelwohnung ? "1" : String(einzelWohnungen.length + 1));
      const oldWId = newW.id || "";
      // Mehrere Einheiten behalten ihre Formular-ID wie beim Klick auf
      // „Wohnung hinzufügen“, damit Bilder und Unterlagen an ihr hängen bleiben.
      const wId = !isEinzelwohnung && oldWId ? oldWId : oldWId && isUuid(oldWId) ? oldWId : crypto.randomUUID();
      if (oldWId && oldWId !== wId) {
        setWohnungDocs(prev => ({ ...prev, [wId]: prev[oldWId] || {} }));
        setWohnungDocFiles(prev => ({ ...prev, [wId]: prev[oldWId] || {} }));
        setWohnungBilder(prev => ({ ...prev, [wId]: prev[oldWId] || [] }));
        setWohnungBilderFiles(prev => ({ ...prev, [wId]: prev[oldWId] || {} }));
        setRemovedWohnungBildIds(prev => ({ ...prev, [wId]: prev[oldWId] || [] }));
        setCustomWohnungDocs(prev => ({ ...prev, [wId]: prev[oldWId] || [] }));
      } else if (oldWId && wohnungDocs[oldWId]) {
        setWohnungDocs(prev => ({ ...prev, [wId]: prev[oldWId] }));
      }
      const committed = { ...newW, id: wId, weNr: autoWeNr } as typeof newW;
      effectiveEinzelWohnungen = [...einzelWohnungen, committed];
      latestEinzelWohnungenRef.current = effectiveEinzelWohnungen;
      setEinzelWohnungen(effectiveEinzelWohnungen);
      const resetWohnung = emptyW();
      latestNewWRef.current = resetWohnung;
      setNewW(resetWohnung);
      toast({ title: "Wohnung automatisch übernommen", description: "Die im Formular eingegebene Wohnung wurde vor dem Speichern übernommen." });
    }

    setIsSaving(true);

    // Auto-save seller to dropdown list if not already saved
    if (verkaeuferDaten.name.trim()) {
      try {
        const LS_VK = "osimmo_saved_verkaeufer";
        const existing: typeof verkaeuferDaten[] = JSON.parse(localStorage.getItem(LS_VK) || "[]");
        const duplicate = existing.find(v => v.name.toLowerCase() === verkaeuferDaten.name.trim().toLowerCase());
        if (duplicate) {
          Object.assign(duplicate, verkaeuferDaten);
        } else {
          existing.push({ ...verkaeuferDaten });
        }
        localStorage.setItem(LS_VK, JSON.stringify(existing));
        setVkListVersion(v => v + 1);
      } catch { /* ignore */ }
    }

    const objektId = isEditMode ? editId : crypto.randomUUID();

    // Upload document files to permanent storage and build URLs
    const uploadedDocUrls: Record<string, string> = {};
    const uploadPromises: Promise<void>[] = [];

    // Upload standard category docs (from manual file picker)
    for (const [catId, file] of Object.entries(objektDocFiles)) {
      if (!file) continue;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `objekte/${objektId}/dokumente/${catId}_${safeName}`;
      uploadPromises.push(
        objektDateiAblegen(storagePath, file, "application/pdf").then((wert) => {
          if (wert) uploadedDocUrls[catId] = wert;
        })
      );
    }

    // Upload analysis-matched docs that weren't manually picked
    for (const [catId, filename] of Object.entries(objektDocs)) {
      if (objektDocFiles[catId]) continue; // already handled
      const matchedFile = uploadedPdfFiles.find(f => f.name === filename);
      if (matchedFile) {
        const safeName = matchedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `objekte/${objektId}/dokumente/${catId}_${safeName}`;
        uploadPromises.push(
          objektDateiAblegen(storagePath, matchedFile, "application/pdf").then((wert) => {
            if (wert) uploadedDocUrls[catId] = wert;
          })
        );
      }
    }

    // Upload extra docs
    const extraDocUrls: Record<string, string> = {};
    for (const ed of extraDocs) {
      if (!isFileInstance(ed.file)) continue;
      const safeName = ed.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `objekte/${objektId}/dokumente/extra_${ed.id}_${safeName}`;
      uploadPromises.push(
        objektDateiAblegen(storagePath, ed.file, "application/pdf").then((wert) => {
          if (wert) extraDocUrls[ed.id] = wert;
        })
      );
    }

    // Upload internal docs
    const interneDocUrls: Record<string, string> = {};
    for (const id of interneDocs) {
      if (!isFileInstance(id.file)) continue;
      const safeName = id.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `objekte/${objektId}/dokumente/intern_${id.id}_${safeName}`;
      uploadPromises.push(
        objektDateiAblegen(storagePath, id.file, "application/pdf").then((wert) => {
          if (wert) interneDocUrls[id.id] = wert;
        })
      );
    }

    // Doc uploads collected – will be merged with image uploads below

    // Upload wohnung document files to storage
    const wohnungDocUrls: Record<string, Record<string, string>> = {};
    const customWohnungDocUrls: Record<string, Record<string, string>> = {};
    const wohnungUploadPromises: Promise<void>[] = [];
    const wohnungIdMap = Object.fromEntries(
      effectiveEinzelWohnungen.map((wohnung, index) => {
        const origId = wohnung.id || `w-${index}`;
        return [origId, origId.match(/^[0-9a-f]{8}-/) ? origId : crypto.randomUUID()];
      }),
    );
    const onlyWohnungId = effectiveEinzelWohnungen.length === 1 ? (effectiveEinzelWohnungen[0].id || "") : "";
    const resolveWohnungUploadKey = (sourceId: string) => {
      if (wohnungIdMap[sourceId]) return sourceId;
      if (isEinzelwohnung && onlyWohnungId && sourceId.startsWith("w-new-")) return onlyWohnungId;
      return sourceId;
    };

    // Collect wohnung doc upload tasks with metadata for proper result mapping
    const wohnungDocUploadTasks: { wId: string; docId: string; storagePath: string; file: File }[] = [];
    for (const [wId, docFiles] of Object.entries(wohnungDocFiles)) {
      const targetWId = resolveWohnungUploadKey(wId);
      const permanentWId = wohnungIdMap[targetWId] || targetWId;
      for (const [docId, file] of Object.entries(docFiles)) {
        if (!file) continue;
        const safeName = (file.name || "dokument.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `objekte/${objektId}/wohnungen/${permanentWId}/${docId}_${safeName}`;
        wohnungDocUploadTasks.push({ wId: targetWId, docId, storagePath, file });
      }
    }

    for (const task of wohnungDocUploadTasks) {
      wohnungUploadPromises.push(
        objektDateiAblegen(task.storagePath, task.file, "application/pdf").then((wert) => {
          if (!wert) {
            console.error(`Wohnung doc upload failed [${task.wId}/${task.docId}]`);
          } else {
            if (!wohnungDocUrls[task.wId]) wohnungDocUrls[task.wId] = {};
            wohnungDocUrls[task.wId][task.docId] = wert;
          }
        })
      );
    }

    // Upload wohnung images to storage (compress before upload)
    const wohnungImageResults: UploadedWohnungImage[] = [];
    for (const [wId, bilder] of Object.entries(wohnungBilder)) {
      const targetWId = resolveWohnungUploadKey(wId);
      for (const bild of bilder) {
        const originalFile = wohnungBilderFiles[wId]?.[bild.id];
        if (originalFile) {
          const capturedWId = targetWId;
          const capturedBild = { ...bild };
          wohnungUploadPromises.push(
            (async () => {
              const compressed = await compressToFile(originalFile, 1920, 1920, 0.75);
              // Guard: never upload empty files. Use original if compression returned 0 bytes.
              const fileToUpload = (compressed && compressed.size > 0) ? compressed : originalFile;
              if (!fileToUpload || fileToUpload.size === 0) {
                throw new Error(`Leere Bilddatei übersprungen [${capturedWId}/${capturedBild.id}]`);
              }
              const ext = (fileToUpload.name?.split(".").pop()) || (originalFile.name.split(".").pop()) || "jpg";
              const permanentWId = wohnungIdMap[capturedWId] || capturedWId;
              const storagePath = `objekte/${objektId}/wohnungen/${permanentWId}/bilder/${capturedBild.id}.${ext}`;
              const { error } = await supabase.storage.from("objekt-medien").upload(storagePath, fileToUpload, { contentType: fileToUpload.type || "image/jpeg", upsert: true });
              if (!error) {
                const { data: urlData } = supabase.storage.from("objekt-medien").getPublicUrl(storagePath);
                wohnungImageResults.push({ sourceId: capturedWId, finalId: permanentWId, image: { ...capturedBild, url: urlData.publicUrl } });
              } else {
                console.error(`[ObjektNeu] Wohnung image upload failed [${capturedWId}/${capturedBild.id}]:`, error.message);
                // Fallback: try direct upload with original file
                try {
                  if (!originalFile || originalFile.size === 0) {
                    throw new Error("Originaldatei ist leer");
                  }
                  const permanentWId2 = wohnungIdMap[capturedWId] || capturedWId;
                  const fallbackExt = originalFile.name.split(".").pop() || "jpg";
                  const fallbackPath = `objekte/${objektId}/wohnungen/${permanentWId2}/bilder/${capturedBild.id}.${fallbackExt}`;
                  const { error: fbErr } = await supabase.storage.from("objekt-medien").upload(fallbackPath, originalFile, { contentType: originalFile.type || "image/jpeg", upsert: true });
                  if (!fbErr) {
                    const { data: fbUrl } = supabase.storage.from("objekt-medien").getPublicUrl(fallbackPath);
                    wohnungImageResults.push({ sourceId: capturedWId, finalId: permanentWId2, image: { ...capturedBild, url: fbUrl.publicUrl } });
                  } else {
                    console.error(`[ObjektNeu] Wohnung image fallback also failed:`, fbErr.message);
                    throw fbErr;
                  }
                } catch (fbCatchErr) {
                  console.error(`[ObjektNeu] Wohnung image fallback error:`, fbCatchErr);
                  throw fbCatchErr;
                }
              }
            })().catch(async (err) => {
              console.error(`[ObjektNeu] Wohnung image compress error [${capturedWId}/${capturedBild.id}]:`, err);
              // Compression failed – try uploading original file directly
              try {
                const permanentWId = wohnungIdMap[capturedWId] || capturedWId;
                const fallbackExt = originalFile.name.split(".").pop() || "jpg";
                const fallbackPath = `objekte/${objektId}/wohnungen/${permanentWId}/bilder/${capturedBild.id}.${fallbackExt}`;
                const { error: fbErr } = await supabase.storage.from("objekt-medien").upload(fallbackPath, originalFile, { contentType: originalFile.type || "image/jpeg", upsert: true });
                if (!fbErr) {
                  const { data: fbUrl } = supabase.storage.from("objekt-medien").getPublicUrl(fallbackPath);
                  wohnungImageResults.push({ sourceId: capturedWId, finalId: permanentWId, image: { ...capturedBild, url: fbUrl.publicUrl } });
                } else {
                  console.error(`[ObjektNeu] Wohnung image all upload attempts failed:`, fbErr.message);
                  throw fbErr;
                }
              } catch (lastErr) {
                console.error(`[ObjektNeu] Wohnung image final fallback error:`, lastErr);
                throw lastErr;
              }
            })
          );
        } else if (bild.url && !bild.url.startsWith("data:")) {
          // Already a storage URL (edit mode)
          const permanentWId = wohnungIdMap[targetWId] || targetWId;
          wohnungImageResults.push({ sourceId: targetWId, finalId: permanentWId, image: bild });
        }
      }
    }

    for (const [wId, docs] of Object.entries(customWohnungDocs)) {
      const targetWId = resolveWohnungUploadKey(wId);
      const permanentWId = wohnungIdMap[targetWId] || targetWId;
      if (!customWohnungDocUrls[targetWId]) customWohnungDocUrls[targetWId] = {};

      for (const doc of docs) {
        if (!isFileInstance(doc.file)) continue;

        const safeName = doc.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `objekte/${objektId}/wohnungen/${permanentWId}/custom_${doc.id}_${safeName}`;
        wohnungUploadPromises.push(
          objektDateiAblegen(storagePath, doc.file, "application/pdf").then((wert) => {
            if (wert) customWohnungDocUrls[targetWId][doc.id] = wert;
          })
        );
      }
    }

    // Hauptbild is derived from first slideshow image – no separate upload needed
    let hauptbildUrl = "";
    const hauptbildUploadPromises: Promise<void>[] = [];

    // Upload slideshow – compress before upload
    const slideshowUploadedUrls: Record<string, string> = {};
    for (const slide of slideshowPreviews) {
      const originalFile = slideshowFiles[slide.id];
      if (originalFile) {
        hauptbildUploadPromises.push(
          compressToFile(originalFile, 1920, 1920, 0.75).then(async (compressed) => {
            const ext = compressed.name?.split(".").pop() || "webp";
            const storagePath = `objekte/${objektId}/bilder/${slide.id}.${ext}`;
            const { error } = await supabase.storage.from("objekt-medien").upload(storagePath, compressed, { contentType: compressed.type, upsert: true });
            if (!error) {
              const { data: urlData } = supabase.storage.from("objekt-medien").getPublicUrl(storagePath);
              slideshowUploadedUrls[slide.id] = urlData.publicUrl;
            } else {
              console.error("[ObjektNeu] Slideshow upload failed for", slide.id, error);
            }
          }).catch(err => console.error("[ObjektNeu] Slideshow compress/upload error:", slide.id, err))
        );
      } else if (slide.url && slide.url.startsWith("http")) {
        // Existing image (edit mode) – preserve URL
        slideshowUploadedUrls[slide.id] = slide.url;
      } else if (slide.url && slide.url.startsWith("data:")) {
        // Fallback: convert data URL to blob and upload
        hauptbildUploadPromises.push(
          (async () => {
            try {
              const response = await fetch(slide.url);
              const blob = await response.blob();
              const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
              const file = new File([blob], `${slide.id}.${ext}`, { type: blob.type });
              const compressed = await compressToFile(file, 1920, 1920, 0.75);
              const cExt = compressed.name?.split(".").pop() || ext;
              const storagePath = `objekte/${objektId}/bilder/${slide.id}.${cExt}`;
              const { error } = await supabase.storage.from("objekt-medien").upload(storagePath, compressed, { contentType: compressed.type, upsert: true });
              if (!error) {
                const { data: urlData } = supabase.storage.from("objekt-medien").getPublicUrl(storagePath);
                slideshowUploadedUrls[slide.id] = urlData.publicUrl;
              } else {
                console.error("[ObjektNeu] Slideshow (data: fallback) upload failed:", slide.id, error);
              }
            } catch (err) {
              console.error("[ObjektNeu] Slideshow data: URL fallback error:", slide.id, err);
            }
          })()
        );
      }
    }

    // Run ALL uploads (docs + images + hauptbild + slideshow) in a single parallel batch
    const allUploadPromises = [...uploadPromises, ...wohnungUploadPromises, ...hauptbildUploadPromises];
    if (allUploadPromises.length > 0) {
      toast({ title: `${allUploadPromises.length} Dateien werden hochgeladen...` });
      const results = await Promise.allSettled(allUploadPromises);
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) {
        toast({
          title: `${failed} von ${allUploadPromises.length} Uploads fehlgeschlagen`,
          description: "Andere Änderungen (Links, Texte, Felder) werden trotzdem gespeichert. Fehlgeschlagene Datei(en) bitte erneut hochladen.",
          variant: "destructive",
        });
        // Wir brechen NICHT mehr ab: Link- und Feld-Änderungen müssen auch dann
        // persistiert werden, wenn ein Bild-Upload scheitert.
      }
    }

    const wohnungImageUrls: Record<string, { id: string; url: string; alt: string; reihenfolge: number }[]> = {};
    wohnungImageResults.forEach(({ sourceId, finalId, image }) => {
      [sourceId, finalId].forEach((key) => {
        if (!key) return;
        if (!wohnungImageUrls[key]) wohnungImageUrls[key] = [];
        if (!wohnungImageUrls[key].some((existing) => existing.id === image.id)) {
          wohnungImageUrls[key].push(image);
        }
      });
    });

    // Debug: Log upload results

    // Build dokumente array with real URLs
    const baseDocs = isEditMode && existingObjekt ? existingObjekt.dokumente : defaultDokumente();
    const dokumente = objektDokumenteZumSpeichern(baseDocs, objektDocs, uploadedDocUrls);

    // Append extra docs with real URLs (preserve existing URL if not re-uploaded)
    for (const ed of extraDocs) {
      const finalUrl = extraDocUrls[ed.id] || ed.existingUrl || "";
      if (!finalUrl) continue; // skip empty entries to avoid wiping data
      dokumente.push({
        id: crypto.randomUUID(),
        name: ed.name,
        url: finalUrl,
        typ: "custom" as const,
        kategorie: "objektunterlagen" as const,
        sichtbar: true,
      });
    }

    // Append internal docs with real URLs (preserve existing URL if not re-uploaded)
    for (const id of interneDocs) {
      const finalUrl = interneDocUrls[id.id] || id.existingUrl || "";
      if (!finalUrl) continue;
      dokumente.push({
        id: crypto.randomUUID(),
        name: id.name,
        url: finalUrl,
        typ: "custom" as const,
        kategorie: "intern" as const,
        sichtbar: true,
      });
    }

    const einzelwohnungObjektBilderAlsWohnungsbilder = isEinzelwohnung ? slideshowPreviews
      .map((s, i) => ({
        id: isUuid(s.id) ? s.id : crypto.randomUUID(),
        url: slideshowUploadedUrls[s.id] || s.url,
        alt: s.alt || `Bild ${i + 1}`,
        reihenfolge: i,
      }))
      .filter(b => b.url && b.url.startsWith("http")) : [];

    const wohnungen: ObjektWohnung[] = effectiveEinzelWohnungen.map((w, i) => {
      const origId = w.id || "";
      const wId = wohnungIdMap[origId] || (origId.match(/^[0-9a-f]{8}-/) ? origId : crypto.randomUUID());
      const uploadedWDocUrls = wohnungDocUrls[origId] || {};
      const existingW = isEditMode ? existingObjekt?.wohnungen.find(ew => ew.id === origId || ew.id === wId) : undefined;
      const existingWImages = existingW?.bilder || [];
      const removedBildIds = new Set([
        ...(removedWohnungBildIds[origId] || []),
        ...(removedWohnungBildIds[wId] || []),
      ]);
      const uploadedBildIds = new Set([
        ...Object.keys(wohnungBilderFiles[origId] || {}),
        ...Object.keys(wohnungBilderFiles[wId] || {}),
      ]);
      
      // In edit mode, preserve existing doc URLs for docs that weren't re-uploaded
      const existingWDocs = existingW?.dokumente || [];
      const existingDocUrlMap: Record<string, string> = {};
      for (const ed of existingWDocs) {
        if (ed.url) existingDocUrlMap[ed.name] = ed.url;
      }

      let uploadedWImages = wohnungImageUrls[origId] || wohnungBilder[origId] || w.bilder || [];
      if (isEinzelwohnung && effectiveEinzelWohnungen.length === 1 && einzelwohnungObjektBilderAlsWohnungsbilder.length > 0) {
        // Nach Adresse abgleichen, nicht nach Kennung: Ein altes Objekt kann
        // dasselbe Foto einmal am Objekt und einmal an der Wohnung tragen,
        // mit zwei verschiedenen Kennungen. Sonst steht es doppelt in der
        // Galerie.
        const vorhandeneUrls = new Set(uploadedWImages.map((b: { url?: string }) => b.url).filter(Boolean));
        uploadedWImages = [
          ...uploadedWImages,
          ...einzelwohnungObjektBilderAlsWohnungsbilder.filter(b => !vorhandeneUrls.has(b.url)),
        ];
      }
      
      // In edit mode, merge with current DB state so partial form state never wipes images from untouched units.
      if (isEditMode && existingW) {
        const preservedExistingImages = existingWImages.filter(img => !removedBildIds.has(img.id));
        const newUploadedImages = uploadedWImages.filter((img: any) => {
          if (!img.url || img.url.startsWith("data:") || removedBildIds.has(img.id)) return false;
          return uploadedBildIds.has(img.id) || !existingWImages.some(existingImg => existingImg.id === img.id);
        });

        const mergedImageMap = new Map<string, { id: string; url: string; alt: string; reihenfolge: number }>();
        [...preservedExistingImages, ...newUploadedImages].forEach((img) => {
          mergedImageMap.set(img.id, img);
        });

        uploadedWImages = Array.from(mergedImageMap.values());
      }

      // Reihenfolge wie im Formular. Vorher standen beim Bearbeiten die
      // gespeicherten Bilder immer vorn, und neue kamen in der Reihenfolge,
      // in der ihr Upload fertig wurde.
      const formReihenfolge = (wohnungBilder[origId] || wohnungBilder[wId] || []).map(b => b.id);
      const rang = (id: string) => { const i = formReihenfolge.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
      uploadedWImages = [...uploadedWImages].sort((a: { id: string }, b: { id: string }) => rang(a.id) - rang(b.id));
      
      // Filter out data: URLs that didn't get uploaded
      uploadedWImages = uploadedWImages
        .filter((b: any) => b.url && !b.url.startsWith("data:"))
        .map((b: any, index: number) => ({ ...b, reihenfolge: index }));


      return {
        // Alles, was die Einheit schon trägt, zuerst. Vorher entstand die
        // Einheit hier nur aus den Feldern darunter, und Stadtteil,
        // Sanierungsanteil, Mietgarantie, Nebenkosten, Verwaltung und
        // „vermietet seit“ gingen beim Speichern als leer an die Datenbank.
        // Reservierung, Kunde und Investagon-Kennung schreibt `saveObjekt`
        // ohnehin nie, siehe `objektSpeichernAbgleich.ts`.
        ...(w as ObjektWohnung),
        id: wId,
        weNr: w.weNr || `${i + 1}`,
        etage: w.etage || "EG",
        lage: w.lage ?? "",
        groesse: w.groesse ?? 0,
        zimmer: w.zimmer ?? 2,
        mieteGesamt: w.mieteGesamt ?? 0,
        vkGesamt: w.vkGesamt ?? 0,
        qmPreis: w.qmPreis ?? 0,
        rendite: w.rendite ?? 0,
        vermietet: w.vermietet ?? true,
        // Vorhandene Einheit: Der Status gehört dem Reservierungsweg und steht
        // im Assistenten nur zur Anzeige. Mitgeschickt wird der gespeicherte
        // Stand, damit ein veralteter Formular- oder Entwurfsstand bei
        // `saveObjekt` nicht als Änderungswunsch samt Hinweis ankommt.
        status: existingW ? existingW.status : ((w.status as ObjektWohnung["status"]) || "frei"),
        stellplatzPreis: w.stellplatzPreis ?? undefined,
        stellplatzMiete: w.stellplatzMiete ?? undefined,
        ruecklageWohnung: (w as any).ruecklageWohnung ?? undefined,
        // Einzelwohnung: Die Objektwerte aus dem AfA-Schritt gelten für die
        // eine Einheit. Ein leeres Feld dort löscht aber nicht, was an der
        // Einheit selbst steht.
        hausgeldMonat: isEinzelwohnung ? (kalkHausgeldMonat || w.hausgeldMonat || undefined) : (w.hausgeldMonat ?? undefined),
        hausgeldNichtUmlagefaehigEuro: isEinzelwohnung ? (kalkHausgeldNuEuro || w.hausgeldNichtUmlagefaehigEuro || undefined) : (w.hausgeldNichtUmlagefaehigEuro ?? undefined),
        hausgeldNichtUmlagefaehigP: isEinzelwohnung ? (kalkHausgeldNuP ?? undefined) : (w.hausgeldNichtUmlagefaehigP ?? undefined),
        neueMiete: w.neueMiete ?? undefined,
        mieterhoehungAb: w.mieterhoehungAb || undefined,
        vermietungsStatus: (w as any).vermietungsStatus,
        // Nur Unterlagen mit Datei werden gespeichert. Früher legte jedes
        // Speichern acht leere Einträge an, die keine Oberfläche füllen
        // konnte: eine Liste voller Namen ohne Dateien dahinter.
        dokumente: [
          ...DEFAULT_WOHNUNG_DOCS.map(d => ({
            ...d,
            id: crypto.randomUUID(),
            url: uploadedWDocUrls[d.id] || existingDocUrlMap[d.name] || "",
          })),
          ...(customWohnungDocs[origId] || customWohnungDocs[wId] || []).map(cd => {
            return {
              id: crypto.randomUUID(),
              name: cd.name,
              url: customWohnungDocUrls[origId]?.[cd.id] || customWohnungDocUrls[wId]?.[cd.id] || cd.existingUrl || "",
              kategorie: "wohnungsunterlagen" as const,
            };
          }),
        ].filter(d => !!d.url),
        bilder: uploadedWImages,
        unterlagenLink: (w as any).unterlagenLink || undefined,
        ...(w.interneHighlightsHand !== undefined ? { interneHighlightsHand: zeilenListe(w.interneHighlightsHand.join("\n")) } : {}),
      };
    });

    const groessen = wohnungen.map(w => w.groesse).filter(g => g > 0);
    const preise = wohnungen.map(w => w.vkGesamt).filter(p => p > 0);
    const renditen = wohnungen.map(w => w.rendite).filter(r => r > 0);

    const isObjektpartner = user.role === "objektpartner";
    const beschreibungGeaendert = !isEditMode || nf.beschreibung !== beschreibungStart.current;
    // Build bilder array – all images in upload order, first = hauptbild (reihenfolge 0)
    const allBilder: { id: string; url: string; alt: string; reihenfolge: number }[] = isEinzelwohnung ? [] : slideshowPreviews
      .map((s, i) => ({
        id: isUuid(s.id) ? s.id : crypto.randomUUID(),
        url: slideshowUploadedUrls[s.id] || s.url,
        alt: s.alt || `Bild ${i + 1}`,
        reihenfolge: i,
      }))
      .filter(b => b.url && b.url.startsWith("http"));

    // CRITICAL SAFETY: In edit mode, if the form somehow lost all images but the DB has them,
    // preserve the existing images to prevent accidental data loss.
    if (!isEinzelwohnung && isEditMode && existingObjekt && allBilder.length === 0 && (existingObjekt.bilder?.length || existingObjekt.bildUrl)) {
      console.warn("[ObjektNeu] Edit mode safety: preserving existing bilder from DB (form had 0 valid images)");
      if (existingObjekt.bilder?.length) {
        allBilder.push(...existingObjekt.bilder);
      } else if (existingObjekt.bildUrl) {
        allBilder.push({ id: crypto.randomUUID(), url: existingObjekt.bildUrl, alt: "Hauptbild", reihenfolge: 0 });
      }
    }

    // First image becomes the hauptbild / bildUrl
    hauptbildUrl = allBilder.length > 0 ? allBilder[0].url : (isEditMode && existingObjekt?.bildUrl ? existingObjekt.bildUrl : "");

    // Einzelwohnung: Profilbild (für Kachel/Übersicht) aus den Wohnungsbildern wählen
    if (isEinzelwohnung && wohnungen.length > 0) {
      const w0 = wohnungen[0];
      const chosen = w0.bilder?.find((b: any) => b.id === einzelProfilBildId) || w0.bilder?.[0];
      if (chosen?.url) hauptbildUrl = chosen.url;
    }

    const newObj: ObjektData = {
      id: objektId,
      titel: nf.titel, adresse: nf.adresse, plz: nf.plz, ort: nf.ort,
      beschreibung: beschreibungGeaendert ? nf.beschreibung : (existingObjekt?.beschreibung ?? nf.beschreibung),
      bildUrl: hauptbildUrl,
      bilder: allBilder,
      dokumente,
      wohnungen,
      videoUrl: nf.videoUrl, videoSichtbar: nf.videoSichtbar, badge: nf.badge,
      groesseVon: isGlobalObjekt ? globalDaten.gesamtQm : (groessen.length ? Math.min(...groessen) : 0),
      groesseBis: isGlobalObjekt ? globalDaten.gesamtQm : (groessen.length ? Math.max(...groessen) : 0),
      preisVon: isGlobalObjekt ? globalDaten.verkaufspreis : (preise.length ? Math.min(...preise) : 0),
      preisBis: isGlobalObjekt ? globalDaten.verkaufspreis : (preise.length ? Math.max(...preise) : 0),
      renditeVon: isGlobalObjekt ? globalDaten.rendite : (renditen.length ? Math.min(...renditen) : 0),
      renditeBis: isGlobalObjekt ? globalDaten.rendite : (renditen.length ? Math.max(...renditen) : 0),
      sichtbar: isEditMode && existingObjekt ? existingObjekt.sichtbar : (isObjektpartner ? false : true),
      status: isEditMode && existingObjekt ? existingObjekt.status : (isObjektpartner ? "entwurf" : "freigegeben"),
      erstellt_am: isEditMode && existingObjekt ? existingObjekt.erstellt_am : new Date().toISOString(),
      erstellt_von: isEditMode && existingObjekt ? existingObjekt.erstellt_von : authUser?.id,
      exklusivPartner: nf.exklusivPartner.length > 0 ? nf.exklusivPartner : undefined,
      globalObjekt: globalObjektWirksam || undefined,
      globalDaten: globalDaten,
      sanierungskosten: sanierungskosten ?? 0,
      // Die Verteilung auf 1 bis 5 Jahre wählt man im AfA-Rechner. Sie kam
      // bisher nie hier an, und jedes Speichern setzte sie auf ein Jahr zurück.
      erhaltungsaufwandJahre: afaDraft?.erhaltungsaufwandJahre ?? existingObjekt?.erhaltungsaufwandJahre ?? 1,
      afaDaten: { ...afaDaten, afaModell: afaModellAusRechner(afaDraft, afaDaten.afaModell) },
      cloudOrdnerUrl: nf.cloudOrdnerUrl || undefined,
      verkaeuferDaten: verkaeuferDaten.name.trim() ? verkaeuferDaten : undefined,
      meta: {
        ...(isEditMode && existingObjekt?.meta ? existingObjekt.meta : {}),
        afaDraft: afaDraft || undefined,
        einzelwohnung: isEinzelwohnung || undefined,
        objektart: gewaehlteObjektart || (isEditMode ? (existingObjekt?.meta as any)?.objektart : undefined),
        einzelProfilBildId: isEinzelwohnung && einzelProfilBildId ? einzelProfilBildId : undefined,
        unterlagenLink: objektUnterlagenLink?.trim() || undefined,
        verkaeuferDaten: verkaeuferDaten.name.trim() ? verkaeuferDaten : undefined,
        // Immer passend zum Schalter, siehe `anlageklasseWaehlen`.
        anlageklasse: angezeigteAnlageklasse || undefined,
        verwaltungsart: verwaltungsart || undefined,
        verwaltungskostenWeg: verwaltungskostenWeg || undefined,
        verwaltungskostenSev: verwaltungskostenSev || undefined,
        verwaltungskostenSonstige: verwaltungskostenSonstige || undefined,
        ruecklageWeg: ruecklageWeg || undefined,
        garantierteErstvermietungKalt: garantierteErstvermietungKalt || undefined,
        kalkulation: {
          hausgeldMonat: kalkHausgeldMonat,
          hausgeldNichtUmlagefaehigP: kalkHausgeldNuP,
          hausgeldNichtUmlagefaehigEuro: kalkHausgeldNuEuro,
          sevMonat: kalkSevMonat,
          mietausfallP: kalkMietausfallP,
          instandhaltungProQm: kalkInstandhaltungQm,
          instandhaltungMode: kalkInstandhaltungMode,
          instandhaltungPctGebaeude: kalkInstandhaltungPct,
        },
      },
    };
    // Objektangaben und Hand-Highlights wie im Pflegedialog der Objektseite.
    // Die Standortargumente pflegt seit dem 18.10.2026 der Wizard selbst. Die
    // Beschreibung wird nur dann zur gepflegten Kurzbeschreibung, wenn sie neu
    // ist oder geändert wurde; sonst bleibt `meta.kurzbeschreibung`, wie es war.
    const metaVorher = (newObj.meta || {}) as Record<string, unknown>;
    let metaNeu = objektseiteFelderInMeta(metaVorher, { ...objektangaben, objektart: metaVorher.objektart as ObjektseiteFelder["objektart"], kurzbeschreibung: undefined });
    if (beschreibungGeaendert && nf.beschreibung.trim()) metaNeu.kurzbeschreibung = nf.beschreibung.trim();
    else if (beschreibungGeaendert) delete metaNeu.kurzbeschreibung;
    else if ("kurzbeschreibung" in metaVorher) metaNeu.kurzbeschreibung = metaVorher.kurzbeschreibung;
    else delete metaNeu.kurzbeschreibung;
    // Ein von Hand geänderter Block bleibt deutsch, wie in `speichereGepflegteTexte`.
    metaNeu = objektTexteEnOhneGepflegte(metaNeu);
    const handPunkte = zeilenListe(interneHighlightsText);
    if (handPunkte.length > 0) metaNeu[HAND_HIGHLIGHTS_SCHLUESSEL] = handPunkte;
    else delete metaNeu[HAND_HIGHLIGHTS_SCHLUESSEL];
    newObj.meta = exklusivKennungenInMeta(metaNeu, nf.exklusivPartner, exklusivKennungen);
    // Eine Energieklasse statt zwei: die aus dem Energieausweis gilt auch für die Objektspalte.
    if (objektangaben.energieausweis.klasse && newObj.globalDaten) {
      newObj.globalDaten = { ...newObj.globalDaten, energieeffizienzklasse: objektangaben.energieausweis.klasse };
    }

    const saved = await saveObjekt(newObj);
    if (!saved) {
      const detail = getLastObjektSaveError();
      toast({ title: "Fehler beim Speichern", description: detail || "Das Objekt konnte nicht gespeichert werden. Bitte versuche es erneut.", variant: "destructive" });
      setIsSaving(false);
      return;
    }
    // Glocke für neu exklusiv Zugewiesene, wie in der Verwaltungsansicht. Ein Fehler hält das Speichern nicht auf.
    const meldungen = exklusivMeldungen(
      { id: objektId, titel: newObj.titel },
      exklusivStand(isEditMode ? existingObjekt : undefined),
      exklusivStand(newObj),
      id => exklusivKandidaten.find(k => k.id === id)?.rolle,
    );
    if (meldungen.length > 0) {
      try {
        await (supabase as any).from("benachrichtigungen").insert(meldungen);
      } catch { /* Glocke ist Zusatz */ }
    }
    // Das Konzept getrennt, damit das Speichern auch ohne die neue Spalte gelingt.
    if ((konzept || undefined) !== (isEditMode ? existingObjekt?.konzept : undefined)) {
      const konzeptFehler = await speichereObjektKonzept(objektId, konzept || null);
      if (konzeptFehler) toast({ title: "Konzept nicht gespeichert", description: konzeptFehler, variant: "destructive" });
    }
    // Objektdaten aus dem Formular dorthin, wo die Objektdaten lesen (17.10.2026).
    // `wohnungen` entsteht Index für Index aus `effectiveEinzelWohnungen`.
    try {
      if (objektdatenForm) {
        const metaAlt = (getObjektById(objektId)?.meta || {}) as Record<string, any>;
        await objektMetaErgaenzen(objektId, objektFormInMeta(objektdatenForm, metaAlt.aufteilung));
      }
      for (const [i, quelle] of effectiveEinzelWohnungen.entries()) {
        const f = (quelle as { objektdaten?: EinheitFormDaten }).objektdaten;
        const ziel = wohnungen[i];
        if (!f || !ziel) continue;
        const alt = listendatenFuerEinheit(ziel.id);
        const { werte, garage, mieter } = einheitFormInDaten(f, alt?.werte);
        await wohnungMetaErgaenzen(ziel.id, {
          listendaten: { ...alt, werte, quelle: alt?.quelle ? `${alt.quelle}, Formular` : "Formular Objekt anlegen", stand: new Date().toISOString().slice(0, 10) },
          garage,
        });
        if (!mieter) continue;
        const vorhanden = aktuellerMieter(getMieter(), ziel.id);
        const angaben = { ...nameTeilen(mieter.name), mietvertragBeginn: mieter.beginn, mietvertragEnde: mieter.befristetBis, kaution: mieter.kaution };
        if (vorhanden) updateMieter(vorhanden.id, angaben);
        else addMieter({
          ...angaben, email: "", telefon: "", objektId, objektName: nf.titel, wohneinheitId: ziel.id, wohneinheitName: ziel.weNr,
          kaltmiete: ziel.mieteGesamt || 0, nebenkosten: 0, kautionEingegangen: false, status: "aktiv", dokumente: [], zahlungen: [], notizen: "Aus dem Formular Objekt anlegen",
        });
      }
    } catch (e) {
      toast({ title: "Objektdaten nicht vollständig gespeichert", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
    // Gespeichert, aber nicht alles übernommen: etwa eine reservierte Einheit,
    // die nicht entfernt wird.
    const speicherHinweise = getLastObjektSaveHinweise();
    if (speicherHinweise.length > 0) {
      void hinweisDialog({ title: "Nicht alles wurde übernommen", description: speicherHinweise.join("\n\n") });
    }

    // Send notification to admins if objektpartner created a draft
    if (!isEditMode && isObjektpartner) {
      try {
        const db = supabase as any;
        const { data: adminRoles } = await db.from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
        if (adminRoles && adminRoles.length > 0) {
          const notifications = adminRoles.map((r: any) => ({
            benutzer_id: r.user_id,
            titel: "Neues Objekt eingereicht",
            nachricht: `Neues Objekt „${nf.titel}" wurde als Entwurf eingereicht – bitte prüfen und freigeben.`,
            link: `/objekte/${objektId}`,
          }));
          await db.from("benachrichtigungen").insert(notifications);
        }
      } catch (e) {
        console.error("Failed to notify admins:", e);
      }
    }

    // Build summary stats
    const totalObjektBilder = slideshowPreviews.length;
    const totalWohnungBilder = Object.values(wohnungBilder).reduce((sum, arr) => sum + arr.length, 0);
    const totalObjektDoks = Object.values(objektDocFiles).filter(Boolean).length + Object.values(objektDocs).filter(v => v && !objektDocFiles[Object.keys(objektDocs).find(k => objektDocs[k] === v) || ""]).length;
    const totalWohnungDoks = Object.values(wohnungDocFiles).reduce((sum, files) => sum + Object.keys(files).length, 0) + Object.values(customWohnungDocs).reduce((sum, docs) => sum + docs.length, 0);
    const totalExtraDoks = extraDocs.length;
    const totalInterneDoks = interneDocs.length;

    setSaveSummary({
      titel: nf.titel,
      wohnungen: einzelWohnungen.length,
      objektBilder: totalObjektBilder,
      wohnungBilderCount: totalWohnungBilder,
      objektDoks: totalObjektDoks,
      wohnungDoks: totalWohnungDoks,
      extraDoks: totalExtraDoks,
      interneDoks: totalInterneDoks,
    });
    setSaveSuccess(true);
    setIsSaving(false);
  };

  const isAdmin = ["admin", "inhaber", "objektpartner"].includes(user.role);
  // KI-Texte im Wizard: nur die Rollen, die Objekte pflegen; die Function prüft es noch einmal.
  const darfKiTexte = darfObjektTexteErstellen([user.role]);
  const kiAngaben = (): WizardTexteEingabe => ({
    titel: nf.titel, adresse: nf.adresse, plz: nf.plz, ort: nf.ort, badge: nf.badge,
    objektart: gewaehlteObjektart ? objektartLabel(gewaehlteObjektart) : undefined,
    anlageklasse: angezeigteAnlageklasse || undefined,
    baujahr: globalDaten.baujahr || undefined,
    zustand: globalDaten.zustand || undefined,
    konzept: konzept ? konzeptLabel(konzept) : undefined,
    sanierungen: objektangaben.sanierungen,
    energieausweis: objektangaben.energieausweis,
    einheiten: einzelWohnungen.map(w => ({ groesse: w.groesse, zimmer: w.zimmer, kaufpreis: w.vkGesamt, kaltmiete: w.mieteGesamt, rendite: w.rendite })),
    standortargumente: objektangaben.standortargumente,
  });
  // Erst die Objektbilder, dann die der Einheiten; die Function nimmt höchstens sechs.
  const kiBildUrls = () => [
    ...slideshowPreviews.map(b => b.url),
    ...Object.values(wohnungBilder).flat().map(b => b.url),
  ].filter(Boolean);

  /**
   * Die gespeicherte Fassung einer Einheit, oder nichts bei einer neuen.
   * Gelesen wird der aktuelle Zwischenspeicher, nicht der Formularstand:
   * Reserviert jemand die Einheit, während der Assistent offen ist, zeigt er
   * das, statt eines veralteten „frei“.
   */
  const gespeicherteEinheit = (id?: string): ObjektWohnung | undefined =>
    isEditMode && id ? existingObjekt?.wohnungen.find(ew => ew.id === id) : undefined;
  const belegungsKontext = { rolle: user.role as string, benutzerId: authUser?.id, name: user.name };

  // Render wohnung form fields (reused for new + edit + bulk)
  /**
   * Welche Upload-Bereiche der Assistent zeigt und wohin die Dateien gehen.
   * Die Regeln stehen in `objektUnterlagenRegeln.ts`, damit Assistent,
   * Objektseite und Einheitsseite dieselbe Antwort geben.
   */
  const struktur = wizardStruktur(isGlobalObjekt, isEinzelwohnung);
  const regeln = unterlagenRegeln(struktur, einzelWohnungen.length > 0);

  /**
   * Zählt eine Objektunterlage als wirklich vorhanden?
   *
   * Der Dateiname allein reicht nicht: Die PDF-Analyse trägt erkannte Namen
   * ein, ohne dass eine Datei dahinterliegt. Ein Haken auf so einem Eintrag
   * wäre eine falsche Auskunft über den Stand des Objekts.
   */
  const objektDocHatDatei = (catId: string) => {
    if (objektDocFiles[catId]) return true;
    const dateiname = objektDocs[catId];
    if (!dateiname) return false;
    if (uploadedPdfFiles.some(f => f.name === dateiname)) return true;
    if (!isEditMode || !existingObjekt) return false;
    const name = OBJEKT_DOC_CATEGORIES.find(c => c.id === catId)?.name;
    return !!existingObjekt.dokumente.some(d => d.name === name && !!d.url);
  };
  const objektDocsMitDatei = OBJEKT_DOC_CATEGORIES.filter(c => objektDocHatDatei(c.id)).length;

  /**
   * Die Einheitenfelder, die bisher nur der Stift auf der Einheitenseite
   * (`EinheitFelderDialog`) oder der Investagon-Import setzen konnte
   * (16.10.2026). Ohne sie trug ein im CRM angelegtes Objekt kein Hausgeld
   * nach Teilen, keinen Erhaltungsaufwand je Einheit, keine Mietgarantie und
   * keinen Möbelanteil, und Investmentrechner und Exposé blieben leer.
   * Ein leeres Feld heißt „nicht erfasst“.
   */
  /**
   * Objektdaten einer Einheit im Formular (17.10.2026): was der Nutzer schon
   * eingegeben hat, sonst der gespeicherte Stand aus Liste, Garage und Mieter.
   * Nur angefasste Einheiten (`objektdaten` gesetzt) werden beim Speichern
   * geschrieben.
   */
  const einheitFormWert = (w: Partial<ObjektWohnung>, wohnungId?: string): EinheitFormDaten => {
    const eigene = (w as { objektdaten?: EinheitFormDaten }).objektdaten;
    if (eigene) return eigene;
    if (!wohnungId) return LEERE_EINHEIT;
    return einheitFormAus(listendatenFuerEinheit(wohnungId)?.werte, garageFuerEinheit(wohnungId), aktuellerMieter(getMieter(), wohnungId) ?? null);
  };
  const objektdatenWert = objektdatenForm ?? objektFormAus(existingObjekt?.meta, mietgarantieAusMeta(existingObjekt?.meta));

  const renderEinheitZusatzfelder = (w: Partial<ObjektWohnung>, onChange: (field: string, value: any) => void) => {
    const zahl = (feld: keyof ObjektWohnung, label: string, opts: { euro?: boolean; step?: string; hinweis?: string; platzhalter?: string } = {}) => (
      <div key={feld}>
        <Label className="text-xs">{label}</Label>
        {opts.euro ? (
          <EuroInput value={(w[feld] as number | undefined) || 0} onChange={v => onChange(feld, v || 0)} className="h-8" />
        ) : (
          // Geleert wird 0, nicht undefined: Sonst bliebe ein alter Wert in `meta` stehen. 0 gilt überall als „nicht erfasst“.
          <Input type="number" step={opts.step ?? "1"} value={(w[feld] as number | undefined) || ""} placeholder={opts.platzhalter}
            onChange={e => onChange(feld, parseFloat(e.target.value) || 0)} className="h-8" />
        )}
        {opts.hinweis && <p className="text-bildunterschrift text-muted-foreground mt-0.5">{opts.hinweis}</p>}
      </div>
    );
    const teile = hausgeldTeile(w);
    return (
      <details className="rounded-lg border border-dashed border-muted-foreground/30 p-3 group/zusatz">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          Hausgeld, Erhaltungsaufwand, Mietgarantie und weitere Angaben
        </summary>
        <div className="space-y-4 pt-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Hausgeld dieser Einheit je Monat</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {zahl("hausgeldUmlagefaehigEuro", "Umlagefähig (€)", { euro: true })}
              {zahl("hausgeldNichtUmlagefaehigEuro", "Nicht umlagefähig (€)", { euro: true })}
              {zahl("ruecklageZufuehrungMonat", "Zuführung Rücklage (€)", { euro: true })}
              {zahl("hausgeldMonat", "Hausgeld gesamt (€)", { euro: true, hinweis: teile.gesamt && !w.hausgeldMonat ? `Aus den drei Teilen: ${fmt(teile.gesamt)}` : "Leer lassen, wenn die drei Teile erfasst sind" })}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {zahl("nebenkostenMonat", "Nebenkosten Mieter / Monat (€)", { euro: true, hinweis: "Für die Warmmiete" })}
            {zahl("verwaltungWegMonat", "WEG-Verwaltung / Monat (€)", { euro: true })}
            {zahl("verwaltungSevMonat", "SEV / Monat (€)", { euro: true })}
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={!!w.sevErstesJahrInklusive} onCheckedChange={v => onChange("sevErstesJahrInklusive", v || undefined)} />
              <Label className="text-xs">SEV im ersten Jahr inklusive</Label>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {zahl("sanierungAnteilBetrag", "Erhaltungsaufwand Anteil (€)", { euro: true, hinweis: "Anteil dieser Einheit am Erhaltungsaufwand" })}
            {zahl("sanierungAnteilProzent", "Erhaltungsaufwand Anteil (%)", { step: "0.01", hinweis: "Nach Miteigentumsanteil, wenn kein Betrag" })}
            {zahl("sanierungsjahr", "Sanierungsjahr", { platzhalter: "2024" })}
            <div>
              <Label className="text-xs">Stadtteil</Label>
              <Input value={w.stadtteil || ""} onChange={e => onChange("stadtteil", e.target.value || undefined)} className="h-8" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {zahl("mietgarantieKalt", "Mietgarantie kalt / Monat (€)", { euro: true, hinweis: "Nur bei Neubau oder Leerstand" })}
            {zahl("mietgarantieMonate", "Mietgarantie (Monate)")}
            <div>
              <Label className="text-xs">Vermietet seit</Label>
              <Input value={w.vermietetSeit || ""} onChange={e => onChange("vermietetSeit", e.target.value || undefined)} placeholder="2023-04" className="h-8" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Interne Highlights dieser Einheit (ein Punkt je Zeile)</Label>
            <Textarea rows={2} value={(w.interneHighlightsHand || []).join("\n")} onChange={e => onChange("interneHighlightsHand", e.target.value ? e.target.value.split("\n") : [])} />
            <p className="text-bildunterschrift text-muted-foreground mt-0.5">Nur intern, auf der Einheitenseite vor den Highlights des Objekts.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {zahl("moebelPreis", "Davon Möbel im Kaufpreis (€)", { euro: true })}
            {zahl("moebelNutzungsdauerJahre", "Nutzungsdauer Möbel (Jahre)")}
            {zahl("finanzierungsnebenkostenSatz", "Finanzierungsnebenkosten (%)", { step: "0.01", hinweis: "Grundschuld und Notar, in % des Darlehens" })}
          </div>
        </div>
      </details>
    );
  };

  const renderWohnungFields = (w: Partial<ObjektWohnung>, onChange: (field: string, value: any) => void, showWeNr = true, wohnungId?: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {showWeNr && <div><Label className="text-xs">WE-Nr. *</Label><Input value={w.weNr || ""} onChange={e => onChange("weNr", e.target.value)} className="h-8" /></div>}
        <div><Label className="text-xs">Etage *</Label><Input value={w.etage || ""} onChange={e => onChange("etage", e.target.value)} className="h-8" /></div>
        <div><Label className="text-xs">Lage</Label><Input value={w.lage || ""} onChange={e => onChange("lage", e.target.value)} className="h-8" /></div>
        <div><Label className="text-xs">Zimmer *</Label><Input type="number" value={w.zimmer || ""} onChange={e => onChange("zimmer", parseInt(e.target.value) || 0)} className="h-8" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div><Label className="text-xs">Größe (m²) *</Label><Input type="number" step="0.01" value={w.groesse || ""} onChange={e => onChange("groesse", parseFloat(e.target.value) || 0)} className="h-8" /></div>
        <div><Label className="text-xs">QM-Preis (€)</Label><EuroInput value={w.qmPreis || 0} onChange={v => onChange("qmPreis", v)} className="h-8" /></div>
        <div><Label className="text-xs">Verkaufspreis (€) *</Label><EuroInput value={w.vkGesamt || 0} onChange={v => onChange("vkGesamt", v)} className="h-8" /></div>
        <div>
          <Label className="text-xs">{w.vermietet === false ? "Marktübliche Miete mtl. (€) *" : "Miete mtl. (€) *"}</Label>
          <EuroInput value={w.mieteGesamt || 0} onChange={v => onChange("mieteGesamt", v)} className="h-8" />
          {w.vermietet === false && <p className="text-bildunterschrift text-[hsl(var(--warning))] mt-0.5">Leerstand – marktübliche Miete eingeben</p>}
        </div>
        <div><Label className="text-xs">Rendite (%)</Label><Input type="number" step="0.01" value={w.rendite || ""} onChange={e => onChange("rendite", parseFloat(e.target.value) || 0)} className="h-8" /></div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Vermietungszustand:</Label>
          <Select
            value={w.vermietungsStatus || (w.vermietet === false ? "leerstand" : "vermietet")}
            onValueChange={v => {
              onChange("vermietungsStatus", v);
              onChange("vermietet", v === "vermietet");
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vermietet">Vermietet</SelectItem>
              <SelectItem value="leerstand">Leerstand</SelectItem>
              <SelectItem value="gekuendigt">Gekündigt</SelectItem>
              <SelectItem value="in_vermietung">In Vermietung</SelectItem>
              <SelectItem value="eigennutzung">Eigennutzung</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <EinheitVerkaufsstatus
          vorhandene={gespeicherteEinheit(w.id)}
          wert={w.status as string | undefined}
          onWaehlen={v => onChange("status", v)}
          kontext={belegungsKontext}
        />
      </div>
      {/* Stellplatz */}
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Stellplatz – Kaufpreis (€)</Label>
          <EuroInput value={w.stellplatzPreis || 0} onChange={v => onChange("stellplatzPreis", v)} className="h-8" />
        </div>
        <div>
          <Label className="text-xs">Stellplatz – Miete mtl. (€)</Label>
          <EuroInput value={w.stellplatzMiete || 0} onChange={v => onChange("stellplatzMiete", v)} className="h-8" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Rücklage Wohnung (€)</Label>
          <EuroInput value={(w as any).ruecklageWohnung || 0} onChange={v => onChange("ruecklageWohnung", v)} className="h-8" />
          <p className="text-bildunterschrift text-muted-foreground mt-1">Aktueller Stand der Instandhaltungsrücklage dieser Wohnung. Wird auf der Wohnungsseite angezeigt, wenn &gt; 0.</p>
        </div>
      </div>
      {/* Geplante Mieterhöhung */}
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" /> Geplante Mieterhöhung
          {w.neueMiete && w.mieterhoehungAb && (
            <Badge variant="outline" className="text-bildunterschrift ml-1 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Hinterlegt</Badge>
          )}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Neue Kaltmiete (€)</Label>
            <EuroInput value={w.neueMiete || 0} onChange={v => onChange("neueMiete", v)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Erhöhung ab</Label>
            <DateInput value={w.mieterhoehungAb || ""} onChange={v => onChange("mieterhoehungAb", v)} />
          </div>
        </div>
        {w.neueMiete && w.mieterhoehungAb && w.mieteGesamt ? (
          <p className="text-bildunterschrift text-muted-foreground">
            Erhöhung von {w.mieteGesamt.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € auf {(w.neueMiete || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € ab {w.mieterhoehungAb} 
            ({((((w.neueMiete || 0) - w.mieteGesamt) / w.mieteGesamt) * 100).toFixed(1)}% Steigerung)
          </p>
        ) : (
          <p className="text-bildunterschrift text-muted-foreground">Optional – leer lassen wenn keine Erhöhung geplant</p>
        )}
      </div>
      {renderEinheitZusatzfelder(w, onChange)}
      {/* Nicht beim Anlegen mehrerer gleicher Einheiten: Garage und Mieter gehören zu genau einer. */}
      {showWeNr && <EinheitObjektdatenFelder wert={einheitFormWert(w, wohnungId)} onChange={v => onChange("objektdaten", v)} />}
      {/* Inline Wohnungsunterlagen */}
      {wohnungId && (
        <div className="pt-3 border-t mt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-3 w-3" /> Wohnungsunterlagen</p>
          <Label className="text-bildunterschrift">Link zu den Wohnungsunterlagen (z.B. Cloud-Ordner)</Label>
          <Input
            type="url"
            value={(w as any).unterlagenLink || ""}
            onChange={e => onChange("unterlagenLink", e.target.value)}
            placeholder="https://..."
            className="h-8 text-xs mt-1"
          />
          {/* Wohnungsbilder Upload */}
          <div className="pt-3 border-t mt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><ImagePlus className="h-3 w-3" /> Wohnungsbilder</p>
            <p className="text-bildunterschrift text-muted-foreground mb-2">
              Das erste Bild ist das Titelbild der Einheit{isEinzelwohnung ? " und das Kachelbild in der Objektübersicht" : ""}. Stern und Pfeile ändern die Reihenfolge.
            </p>
            {(wohnungBilder[wohnungId] || []).length > 0 && (() => {
              const bilder = wohnungBilder[wohnungId] || [];
              // Ein früher per Stern gewähltes Profilbild der Einzelwohnung gilt, bis die Reihenfolge geändert wird.
              const titelId = isEinzelwohnung && bilder.some(b => b.id === einzelProfilBildId) ? einzelProfilBildId : bilder[0]?.id;
              return (
                <div className="flex flex-wrap gap-2 mb-2">
                  {bilder.map((bild, idx) => (
                    <div key={bild.id} className={`relative group w-24 h-24 rounded-lg overflow-hidden border-2 ${bild.id === titelId ? "border-primary" : "border-border"}`}>
                      <img src={bild.url} alt={bild.alt} className="w-full h-full object-cover" />
                      {bild.id === titelId && <Badge className="absolute bottom-1 left-1 text-bildunterschrift bg-primary">Titelbild</Badge>}
                      <BildSteuerung
                        index={idx}
                        anzahl={bilder.length}
                        onVerschieben={ziel => {
                          setWohnungBilder(prev => ({ ...prev, [wohnungId]: verschiebeBild(prev[wohnungId] || [], bild.id, ziel) }));
                          if (isEinzelwohnung) setEinzelProfilBildId("");
                          markDirty();
                        }}
                        onEntfernen={() => removeWohnungBild(wohnungId, bild.id)}
                      />
                    </div>
                  ))}
                </div>
              );
            })()}
            <label
              className="flex flex-col items-center justify-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 transition-colors text-muted-foreground"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
              onDragLeave={e => { e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                handleWohnungImageUpload(wohnungId, e.dataTransfer.files);
              }}
            >
              <input type="file" accept="image/*,.heic,.heif,.avif" multiple className="hidden" onChange={e => { if (e.target.files) handleWohnungImageUpload(wohnungId, e.target.files); }} />
              <ImagePlus className="h-5 w-5" />
              <span className="text-bildunterschrift">JPEG/PNG-Bilder hochladen oder hierher ziehen</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );

  if (editNotReady) {
    return (
      <Rahmen>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center space-y-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Objekt wird geladen…</p>
          </div>
        </div>
      </Rahmen>
    );
  }

  // Objektpartner bearbeiten nur eigene Objekte, dieselbe Regel wie die
  // Datenbank (30.09.2026). Sonst böte das Formular ein Speichern an, das
  // hinterher abgelehnt wird.
  if (isEditMode && user.role === "objektpartner" && !darfObjektBearbeiten(user.role, existingObjekt, authUser?.id)) {
    return (
      <Rahmen>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Dieses Objekt kannst du nicht bearbeiten, es gehört nicht zu deinen Objekten.</p>
          <Button variant="outline" onClick={() => navigate("/objekte")}>Zurück zu Objekte</Button>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      <div className="space-y-6 w-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Zurück" onClick={handleBack}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader title={isEditMode ? "Objekt bearbeiten" : "Neues Objekt anlegen"} subtitle={isEditMode ? `${existingObjekt?.titel || ""}: Angaben bearbeiten und ergänzen` : "Fülle alle relevanten Informationen zum neuen Objekt aus."} />
          {!isEditMode && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Entwurf wirklich verwerfen?",
                  description:
                    "Alle bisher eingegebenen Daten, hochgeladenen Bilder, Wohnungen und Dokumente in diesem Entwurf werden gelöscht. Das lässt sich nicht rückgängig machen.",
                  confirmText: "Entwurf verwerfen",
                  cancelText: "Eingaben behalten",
                  variant: "destructive",
                });
                if (!ok) return;
                // Bis 18.10.2026 wurde nur localStorage geleert, der Entwurf
                // liegt aber in IndexedDB und kam nach dem Neuladen zurück.
                entwurfVerworfenRef.current = true;
                await deleteObjektDraft(LS_KEY);
                window.location.reload();
              }}
            >
              Entwurf verwerfen
            </Button>
          )}
        </div>

        {/* Wizard-Fortschrittsbalken */}
        {step !== "typ" && (() => {
          // Der Medien-Schritt gilt für alle Arten. Bei der Einzelwohnung
          // landen die dort hochgeladenen Bilder an der Einheit, weil es für
          // den Nutzer keine Objektseite gibt.
          const wizardSteps: string[] = isGlobalObjekt
            ? ["upload", "0", "global", "1", "afa", "2", "3"]
            : ["upload", "0", "1", "afa", "2", "3"];
          const labels: Record<string, string> = {
            upload: "Upload & Analyse",
            "0": "Basisdaten",
            "1": isGlobalObjekt ? "Einheiten" : isEinzelwohnung ? "Wohnung" : "Wohnungen",
            global: "Globaldaten",
            afa: "AfA-Rechner",
            "2": "Unterlagen",
            "3": "Medien",
          };
          const idx = Math.max(0, wizardSteps.indexOf(step));
          const pct = Math.round(((idx + 1) / wizardSteps.length) * 100);
          return (
            <div className="sticky top-2 z-30 space-y-3">
              {/* Progress Pill */}
              <div className="bg-card/70 backdrop-blur-sm rounded-full p-1 pl-4 pr-4 flex items-center gap-4 border border-border shadow-sm">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                  Schritt {idx + 1} von {wizardSteps.length} · {pct}%
                </span>
              </div>
              {/* Segmented Step Navigation */}
              <nav className="hidden md:flex gap-1 bg-muted/60 p-1 rounded-xl border border-border/60 overflow-x-auto">
                {wizardSteps.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={`flex-1 min-w-fit px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                      i === idx
                        ? "bg-card text-primary shadow-sm"
                        : i < idx
                          ? "text-foreground hover:bg-card/60"
                          : "text-muted-foreground hover:bg-card/40"
                    }`}
                  >
                    {i + 1}. {labels[s]}
                  </button>
                ))}
              </nav>
            </div>
          );
        })()}

        {/* Typ-Wahl-Screen (nur bei neuem Objekt) */}
        {step === "typ" && !isEditMode && (
          <div className="pt-4">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl font-semibold tracking-tight">Welche Art von Objekt möchtest du anlegen?</h2>
              <p className="text-sm text-muted-foreground">Die Auswahl bestimmt, welche Felder anschließend abgefragt werden. Du kannst sie später noch ändern.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <button
                type="button"
                onClick={() => { setIsGlobalObjekt(true); setIsEinzelwohnung(false); setGewaehlteObjektart(undefined); setStep("upload"); markDirty(); }}
                className="group text-left bg-card p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:border-primary hover:-translate-y-0.5 transition-all space-y-5"
              >
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Building2 className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Globalobjekt</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">Das Haus wird als Ganzes verkauft. Einheiten kannst du freiwillig hinterlegen.</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70 italic">z.B. MFH-Komplettkauf, Globalverkauf an Investor</p>
              </button>

              <button
                type="button"
                onClick={() => { setIsEinzelwohnung(true); setIsGlobalObjekt(false); setGewaehlteObjektart(undefined); setStep("upload"); markDirty(); }}
                className="group text-left bg-card p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:border-primary hover:-translate-y-0.5 transition-all space-y-5"
              >
                <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <Star className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Einzelwohnung</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">Genau eine Wohneinheit (ETW) – Bulk-Anlage deaktiviert.</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70 italic">z.B. ETW im Bestand oder Neubau</p>
              </button>

              {/*
                WG und Co-Living als eigene Karte. Vorher lag es mit der
                Einzelwohnung zusammen, und dadurch trug ein WG-Objekt die
                Objektart nur, wenn zufaellig das Wort "WG" in der
                Anlageklasse stand. Der Ablauf ist derselbe wie bei der
                Einzelwohnung, nur die Objektart wird hier festgeschrieben.
              */}
              <button
                type="button"
                onClick={() => { setIsEinzelwohnung(true); setIsGlobalObjekt(false); setGewaehlteObjektart("wg_coliving"); setStep("upload"); markDirty(); }}
                className="group text-left bg-card p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:border-primary hover:-translate-y-0.5 transition-all space-y-5"
              >
                <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform">
                  <Users className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">WG und Co-Living</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">Eine Einheit, die zimmerweise vermietet wird. Rechnet mit dem WG-Konzept.</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70 italic">z.B. Micro-Apartment, Co-Living-Einheit, WG-Konzept</p>
              </button>

              <button
                type="button"
                onClick={() => { setIsGlobalObjekt(false); setIsEinzelwohnung(false); setGewaehlteObjektart(undefined); setStep("upload"); markDirty(); }}
                className="group text-left bg-card p-8 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:border-primary hover:-translate-y-0.5 transition-all space-y-5"
              >
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Objekt mit Einheiten</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">Mehrere Wohneinheiten anlegen (Aufteilung WEG, MFH).</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70 italic">z.B. MFH mit 10 ETW im Einzelverkauf</p>
              </button>
            </div>
          </div>
        )}

        {step !== "typ" && (
        <Tabs value={step} onValueChange={setStep}>
          <TabsList className="sr-only grid w-full grid-cols-6">
            <TabsTrigger value="upload">📄 Upload</TabsTrigger>
            <TabsTrigger value="0">1. Basisdaten</TabsTrigger>
            {isGlobalObjekt && <TabsTrigger value="global">2. Globaldaten</TabsTrigger>}
            <TabsTrigger value="1">{isGlobalObjekt ? "Einheiten" : isEinzelwohnung ? "2. Wohnung" : "2. Wohnungen"}</TabsTrigger>
            <TabsTrigger value="afa">3. AfA-Rechner</TabsTrigger>
            <TabsTrigger value="2">4. Unterlagen</TabsTrigger>
            <TabsTrigger value="3">5. Medien</TabsTrigger>
          </TabsList>

          {/* Step 0: Upload & Analyse – forceMount keeps analysis running during tab switches */}
          <TabsContent value="upload" forceMount className={`space-y-4 pt-4 ${step !== "upload" ? "hidden" : ""}`}>
            <ObjektUploadAnalyse draftKey={LS_KEY} onAnalyseComplete={handleAnalyseComplete} onAnalyzingChange={setIsAnalysisRunning} onCloudUrlChange={(url) => setNf(prev => ({ ...prev, cloudOrdnerUrl: url }))} draft={uploadAnalyseDraft} onDraftChange={setUploadAnalyseDraft} isAdmin={isAdmin} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep("0")}>Überspringen → Manuell ausfüllen</Button>
            </div>
          </TabsContent>

          {/* Step 1: Basisdaten */}
          <TabsContent value="0" forceMount className={`space-y-4 pt-4 ${step !== "0" ? "hidden" : ""}`}>
            <Card className="p-5 space-y-4">
              <div><Label className="text-xs font-semibold">Titel *</Label><Input value={nf.titel} onChange={e => updateField("titel", e.target.value)} placeholder="z.B. KFW 40 QNG Neubau Waldachtal" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">PLZ *</Label><Input value={nf.plz} onChange={e => updateField("plz", e.target.value)} /></div>
                <div className="col-span-2"><Label className="text-xs">Ort *</Label><Input value={nf.ort} onChange={e => updateField("ort", e.target.value)} /></div>
              </div>
              <div><Label className="text-xs">Adresse *</Label><Input value={nf.adresse} onChange={e => updateField("adresse", e.target.value)} /></div>
              <div><Label className="text-xs">Badge (z.B. KFW 40 QNG) *</Label><Input value={nf.badge} onChange={e => updateField("badge", e.target.value)} /></div>
              <BeschreibungFeld
                wert={nf.beschreibung}
                onChange={v => updateField("beschreibung", v)}
                hinweis={<>Die KI schreibt die Beschreibung am Ende im Schritt <button type="button" className="underline" onClick={() => setStep("3")}>„Medien“</button>, wenn Einheiten und Bilder da sind.</>}
              />
              <StandortargumenteFeld
                werte={objektangaben.standortargumente}
                onChange={liste => { setObjektangaben(p => ({ ...p, standortargumente: liste })); markDirty(); }}
                angaben={darfKiTexte ? kiAngaben : undefined}
              />
              {/* Baujahr */}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Baujahr *</Label><Input type="number" value={globalDaten.baujahr || ""} onChange={e => updateGlobal("baujahr", parseInt(e.target.value) || 0)} placeholder="z.B. 1969" /></div>
              </div>
              {/* Bauzustand & Anlageklasse */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Bauzustand *</Label>
                  <Select value={globalDaten.zustand || ""} onValueChange={v => updateGlobal("zustand", v)}>
                    <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bestand">Bestand</SelectItem>
                      <SelectItem value="Denkmal">Denkmal</SelectItem>
                      <SelectItem value="Gepflegt">Gepflegt</SelectItem>
                      <SelectItem value="Jungbau">Jungbau</SelectItem>
                      <SelectItem value="Kapitalanlage">Kapitalanlage</SelectItem>
                      <SelectItem value="Kernsanierung">Kernsanierung</SelectItem>
                      <SelectItem value="Neubau">Neubau</SelectItem>
                      <SelectItem value="renoviert">renoviert</SelectItem>
                      <SelectItem value="Sanierung">Sanierung</SelectItem>
                      {/* Aus dem früheren zweiten Zustandsfeld der Globaldaten. */}
                      <SelectItem value="Saniert">Saniert</SelectItem>
                      <SelectItem value="Teilsaniert">Teilsaniert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs" htmlFor="objekt-anlageklasse">Anlageklasse{anlageklasseAusInvestagon ? "" : " *"}</Label>
                  {anlageklasseAusInvestagon ? (
                    <>
                      <Input
                        id="objekt-anlageklasse"
                        value={angezeigteAnlageklasse || "Keine Angabe aus Investagon"}
                        disabled
                        readOnly
                        aria-describedby="objekt-anlageklasse-hinweis"
                      />
                      <p id="objekt-anlageklasse-hinweis" className="mt-1 text-[11px] text-muted-foreground">{ANLAGEKLASSE_INVESTAGON_HINWEIS}</p>
                    </>
                  ) : (
                  <>
                  <Select value={angezeigteAnlageklasse} onValueChange={anlageklasseWaehlen} disabled={klassenPflege === "haus_gebunden"}>
                    <SelectTrigger id="objekt-anlageklasse"><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Micro Apartment">Micro Apartment</SelectItem>
                      <SelectItem value="Eigentumswohnung">Eigentumswohnung</SelectItem>
                      <SelectItem value="Pflege">Pflege</SelectItem>
                      <SelectItem value="Betreutes Wohnen">Betreutes Wohnen</SelectItem>
                      <SelectItem value="Ferienapartment">Ferienapartment</SelectItem>
                      <SelectItem value="Einfamilienhaus">Einfamilienhaus</SelectItem>
                      <SelectItem value="Wohnungspaket">Wohnungspaket</SelectItem>
                      <SelectItem value="Mehrfamilienhaus">Mehrfamilienhaus</SelectItem>
                      <SelectItem value="Globalobjekt">Globalobjekt</SelectItem>
                      <SelectItem value="Sonstiges (Gewerbe)">Sonstiges (Gewerbe)</SelectItem>
                      <SelectItem value="Sonstiges (Wohnen)">Sonstiges (Wohnen)</SelectItem>
                      <SelectItem value="WG-Wohnung">WG-Wohnung</SelectItem>
                      <SelectItem value="Doppelhaushälfte">Doppelhaushälfte</SelectItem>
                    </SelectContent>
                  </Select>
                  {klassenPflege === "haus_gebunden" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{ANLAGEKLASSE_HAUS_GEBUNDEN_HINWEIS}</p>
                  )}
                  </>
                  )}
                </div>
                <div>
                  <Label className="text-xs" htmlFor="objekt-konzept">Konzept</Label>
                  <Select value={konzept || "keins"} onValueChange={(w) => setKonzept(w === "keins" ? "" : (w as ObjektKonzept))}>
                    <SelectTrigger id="objekt-konzept"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keins">Nicht festgelegt</SelectItem>
                      {KONZEPTE.map((k) => <SelectItem key={k.wert} value={k.wert}>{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Verwaltung */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    Verwaltungsart *
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm whitespace-pre-line text-xs">
                          {VERWALTUNGSART_TOOLTIP}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Select value={verwaltungsart} onValueChange={v => { setVerwaltungsart(v); markDirty(); }}>
                    <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                    <SelectContent>
                      {VERWALTUNGSART_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(verwaltungsart === "WEG" || verwaltungsart === "WEG+SEV") && (
                  <div>
                    <Label className="text-xs">WEG-Verwaltung / Monat (€)</Label>
                    <EuroInput value={verwaltungskostenWeg} onChange={v => { setVerwaltungskostenWeg(v); markDirty(); }} className="h-8" />
                  </div>
                )}
                {(verwaltungsart === "SEV" || verwaltungsart === "WEG+SEV") && (
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      SEV / Monat (€) *
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {SEV_KOSTEN_TOOLTIP}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <EuroInput value={verwaltungskostenSev} onChange={v => { setVerwaltungskostenSev(v); markDirty(); }} className="h-8" />
                  </div>
                )}
                {(verwaltungsart === "Mietpool" || verwaltungsart === "Betreiber") && (
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      {verwaltungsart === "Mietpool" ? "Mietpool-Anteil / Monat (€)" : "Betreiber-Abzug / Monat (€)"}
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {SEV_KOSTEN_TOOLTIP}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <EuroInput value={verwaltungskostenSonstige} onChange={v => { setVerwaltungskostenSonstige(v); markDirty(); }} className="h-8" />
                  </div>
                )}
              </div>
              {/* Interne Highlights, von Hand */}
              <div>
                <Label className="text-xs font-semibold" htmlFor="interne-highlights">Interne Highlights <span className="text-muted-foreground font-normal">(nur für das Team, ein Punkt je Zeile)</span></Label>
                <Textarea id="interne-highlights" rows={3} value={interneHighlightsText} onChange={e => { setInterneHighlightsText(e.target.value); markDirty(); }}
                  placeholder={"Restnutzungsdauergutachten liegt vor\nVerkäufer übernimmt Erhaltungsaufwand im ersten Jahr"} />
                <p className="mt-1 text-[11px] text-muted-foreground">Erscheinen auf Objekt- und Einheitenseite im Kasten „Interne Highlights“, nie beim Kunden. Höchstens {MAX_HAND_HIGHLIGHTS}. Erhaltungsaufwand und AfA ergänzt das CRM selbst.</p>
              </div>
              {/* Objektangaben der Objekt- und Einheitenseite */}
              <div className="pt-4 border-t space-y-4" data-testid="objektangaben">
                <div>
                  <h3 className="text-sm font-semibold">Objektangaben</h3>
                  <p className="text-xs text-muted-foreground">Erscheinen auf Objektseite, Einheitenseite und im Exposé. Später auch über den Stift an den Objektdetails änderbar.</p>
                </div>
                <ObjektseiteFelderFormular
                  f={{ ...objektangaben, objektart: gewaehlteObjektart }}
                  setF={aendern => {
                    const neu = aendern({ ...objektangaben, objektart: gewaehlteObjektart });
                    setGewaehlteObjektart(neu.objektart);
                    setObjektangaben({ ...neu, objektart: undefined });
                    markDirty();
                  }}
                  objekt={isEditMode ? existingObjekt : undefined}
                />
              </div>
              {/* Objektdaten: Mietsubvention, Mieterhöhung, Reservierung */}
              <div className="pt-4 border-t space-y-3" data-testid="objektdaten-felder">
                <div>
                  <h3 className="text-sm font-semibold">Objektdaten</h3>
                  <p className="text-xs text-muted-foreground">Rechnen in den Objektdaten Mietsubvention, Mieterhöhungen und Fristen. Angaben je Einheit (MEA, Mieter, Garage) stehen bei jeder Wohnung.</p>
                </div>
                <ObjektObjektdatenFelder wert={objektdatenWert} onChange={v => { setObjektdatenForm(v); markDirty(); }} />
              </div>
              {/* Verkäuferdaten */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold">Verkäuferdaten</h3>
                    <p className="text-xs text-muted-foreground">Diese Daten werden automatisch in die Reservierungsvereinbarung übernommen.</p>
                  </div>
                  {(() => {
                    const LS_VK = "osimmo_saved_verkaeufer";
                    const _v = vkListVersion;
                    const saved: typeof verkaeuferDaten[] = JSON.parse(localStorage.getItem(LS_VK) || "[]");
                    const isAlreadySaved = verkaeuferDaten.name.trim() && saved.some(v => v.name.toLowerCase() === verkaeuferDaten.name.trim().toLowerCase());
                    const hasName = verkaeuferDaten.name.trim().length > 0;
                    return (
                      <Button type="button" size="sm"
                        variant={hasName && !isAlreadySaved ? "default" : "outline"}
                        className={`gap-1.5 text-xs ${hasName && !isAlreadySaved ? "animate-pulse shadow-md" : ""}`}
                        onClick={() => {
                          const missing: string[] = [];
                          if (!verkaeuferDaten.name.trim()) missing.push("Name");
                          if (!verkaeuferDaten.strasse.trim()) missing.push("Straße");
                          if (!verkaeuferDaten.plz.trim()) missing.push("PLZ");
                          if (!verkaeuferDaten.ort.trim()) missing.push("Ort");
                          if (missing.length > 0) { toast({ title: "Bitte alle Felder ausfüllen", description: `Fehlend: ${missing.join(", ")}`, variant: "destructive" }); return; }
                          const existing: typeof verkaeuferDaten[] = JSON.parse(localStorage.getItem(LS_VK) || "[]");
                          const duplicate = existing.find(v => v.name.toLowerCase() === verkaeuferDaten.name.toLowerCase());
                          if (duplicate) {
                            Object.assign(duplicate, verkaeuferDaten);
                          } else {
                            existing.push({ ...verkaeuferDaten });
                          }
                          localStorage.setItem(LS_VK, JSON.stringify(existing));
                          setVkListVersion(v => v + 1);
                          toast({ title: `Verkäufer "${verkaeuferDaten.name}" gespeichert` });
                        }}
                      ><Plus className="h-3.5 w-3.5" /> Verkäufer speichern</Button>
                    );
                  })()}
                </div>
                {/* Saved seller dropdown + delete */}
                {(() => {
                  const _vkVer = vkListVersion; // dependency to trigger re-render
                  const LS_VK = "osimmo_saved_verkaeufer";
                  const saved: typeof verkaeuferDaten[] = JSON.parse(localStorage.getItem(LS_VK) || "[]");
                  if (saved.length === 0) return null;
                  const activeIdx = saved.findIndex(v => v.name.toLowerCase() === (verkaeuferDaten.name || "").trim().toLowerCase());
                  return (
                    <div className="mb-3 space-y-2">
                      <Label className="text-xs">Gespeicherten Verkäufer auswählen</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {saved.map((v, i) => {
                          const isActive = i === activeIdx;
                          return (
                            <div
                              key={`${v.name}-${i}`}
                              className={`group inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-md border text-xs transition-colors ${
                                isActive
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background hover:bg-accent hover:text-accent-foreground border-border"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setVerkaeuferDaten({ ...v });
                                  markDirty();
                                  toast({ title: `Verkäufer „${v.name}" übernommen` });
                                }}
                                className="text-left"
                              >
                                <span className="font-medium">{verkaeuferVollerName(v) || v.name}</span>
                                {v.firma && <span className="opacity-80"> ({v.firma})</span>}
                                {v.ort && <span className="opacity-60"> · {v.ort}</span>}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  aria-label={`Verkäufer ${v.name} löschen`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = await confirmDialog({
                                      title: `Verkäufer „${v.name}“ löschen?`,
                                      description: "Der Eintrag verschwindet aus der gespeicherten Verkäuferliste. Bereits angelegte Objekte behalten ihre Angaben.",
                                      confirmText: "Löschen",
                                      cancelText: "Behalten",
                                      variant: "destructive",
                                    });
                                    if (!ok) return;
                                    const updated = saved.filter((_, idx) => idx !== i);
                                    localStorage.setItem(LS_VK, JSON.stringify(updated));
                                    setVkListVersion(ver => ver + 1);
                                    toast({ title: `Verkäufer "${v.name}" gelöscht` });
                                    markDirty();
                                  }}
                                  className={`inline-flex items-center justify-center h-5 w-5 rounded hover:bg-destructive/15 ${
                                    isActive ? "text-primary-foreground/80 hover:text-destructive" : "text-muted-foreground hover:text-destructive"
                                  }`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/*
                  Zuerst die Wahl, dann die Namensfelder.

                  Der Verkäufer ist meist ein Bauträger, kann aber auch eine
                  Privatperson sein. Vorher stand hier ein Feld „Name“ und
                  daneben ein freiwilliges Feld „Firma“, und weder war klar,
                  was wohin gehört, noch konnte der Notarbogen daraus einen
                  Vor- und Nachnamen ablesen. Er teilte deshalb am letzten
                  Leerzeichen und machte aus einer GmbH einen Nachnamen.
                */}
                <div className="mb-3">
                  <Label className="text-xs">Wer verkauft?</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(["firma", "person"] as const).map(art => (
                      <button
                        key={art}
                        type="button"
                        aria-pressed={verkaeuferDaten.art === art}
                        onClick={() => {
                          // Bei „Firma“ wandert ein eingetragener Vorname
                          // zurück an den Namen, statt unsichtbar liegen zu
                          // bleiben. Geteilt wird in die andere Richtung nichts.
                          setVerkaeuferDaten(p => {
                            const vorname = (p.vorname || "").trim();
                            if (art !== "firma" || !vorname) return { ...p, art };
                            return {
                              ...p, art,
                              name: [vorname, (p.name || "").trim()].filter(Boolean).join(" "),
                              vorname: "",
                            };
                          });
                          markDirty();
                        }}
                        className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                          verkaeuferDaten.art === art
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        {art === "firma" ? "Firma" : "Privatperson"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {verkaeuferDaten.art === "person"
                      ? "Vorname und Nachname stehen getrennt, so wie der Notar sie braucht."
                      : "Bei Bauträgern ist die Firma der Regelfall. Der Firmenname wird nirgends geteilt."}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {verkaeuferDaten.art === "person" && (
                    <div>
                      <Label className="text-xs">Vorname</Label>
                      <Input value={verkaeuferDaten.vorname || ""} onChange={e => {
                        setVerkaeuferDaten(p => ({ ...p, vorname: e.target.value }));
                        markDirty();
                      }} placeholder="Erika" autoComplete="off" />
                    </div>
                  )}
                  <div className="relative">
                    <Label className="text-xs">{verkaeuferNameLabel(verkaeuferDaten.art)} *</Label>
                    <Input value={verkaeuferDaten.name} onChange={e => {
                      setVerkaeuferDaten(p => ({ ...p, name: e.target.value }));
                      markDirty();
                    }} placeholder={verkaeuferDaten.art === "person" ? "Mustermann" : "z.B. Musterbau Projektentwicklung GmbH"} autoComplete="off" />
                    {(() => {
                      const query = verkaeuferDaten.name.trim().toLowerCase();
                      if (!query || query.length < 1) return null;
                      const LS_VK = "osimmo_saved_verkaeufer";
                      const _v = vkListVersion;
                      const saved: typeof verkaeuferDaten[] = JSON.parse(localStorage.getItem(LS_VK) || "[]");
                      const matches = saved.filter(v => v.name.toLowerCase().includes(query) && v.name.toLowerCase() !== query);
                      if (matches.length === 0) return null;
                      return (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {matches.map((v, i) => (
                            <button key={i} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                              onMouseDown={e => {
                                e.preventDefault();
                                setVerkaeuferDaten({ ...v });
                                markDirty();
                              }}
                            >
                              <span className="font-medium">{verkaeuferVollerName(v) || v.name}</span>
                              {v.firma && <span className="text-muted-foreground"> ({v.firma})</span>}
                              <span className="text-muted-foreground text-xs ml-2">– {v.plz} {v.ort}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {/*
                    Das alte zweite Feld. Es wird nicht mehr angeboten, denn
                    die Firmierung steht jetzt im Namensfeld darüber. Wo aber
                    schon etwas drinsteht, bleibt es sichtbar und änderbar:
                    Ausblenden hieße, eine gepflegte Angabe verschwinden zu
                    lassen, ohne sie zu löschen.
                  */}
                  {!!(verkaeuferDaten.firma || "").trim() && (
                    <div>
                      <Label className="text-xs">Firma <span className="text-muted-foreground font-normal">(altes Feld)</span></Label>
                      <Input value={verkaeuferDaten.firma} onChange={e => { setVerkaeuferDaten(p => ({ ...p, firma: e.target.value })); markDirty(); }} />
                      <p className="mt-1 text-xs text-muted-foreground">Gehört die Firmierung nach oben in das Namensfeld, kann dieses Feld geleert werden.</p>
                    </div>
                  )}
                  <div><Label className="text-xs">Straße *</Label><Input value={verkaeuferDaten.strasse} onChange={e => { setVerkaeuferDaten(p => ({ ...p, strasse: e.target.value })); markDirty(); }} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">PLZ *</Label><Input value={verkaeuferDaten.plz} onChange={e => { setVerkaeuferDaten(p => ({ ...p, plz: e.target.value })); markDirty(); }} /></div>
                    <div className="col-span-2"><Label className="text-xs">Ort *</Label><Input value={verkaeuferDaten.ort} onChange={e => { setVerkaeuferDaten(p => ({ ...p, ort: e.target.value })); markDirty(); }} /></div>
                  </div>
                  <div><Label className="text-xs">E-Mail *<span className="text-muted-foreground font-normal"> (oder Telefon)</span></Label><Input value={verkaeuferDaten.email} onChange={e => { setVerkaeuferDaten(p => ({ ...p, email: e.target.value })); markDirty(); }} /></div>
                  <div><Label className="text-xs">Telefon *<span className="text-muted-foreground font-normal"> (oder E-Mail)</span></Label><PhoneInput value={verkaeuferDaten.telefon} onChange={v => { setVerkaeuferDaten(p => ({ ...p, telefon: v })); markDirty(); }} /></div>
                </div>
              </div>
              {/* Hinweis: Typ wurde im ersten Schritt gewählt */}
              {!isEditMode && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 text-xs">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold">Objekttyp: </span>
                    {isGlobalObjekt ? "Globalobjekt" : isEinzelwohnung ? "Einzelwohnung / Co-Living" : "Objekt mit Einheiten"}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep("typ")}>Ändern</Button>
                </div>
              )}

              <ExklusivZuweisung
                kandidaten={exklusivKandidaten}
                objektNamen={nf.exklusivPartner}
                objektKennungen={exklusivKennungen}
                onObjekt={(namen, kennungen) => { setNf(p => ({ ...p, exklusivPartner: namen })); setExklusivKennungen(kennungen); markDirty(); }}
                einheiten={einzelWohnungen.filter(w => w.id).map((w, i) => ({ id: w.id!, bezeichnung: `WE ${w.weNr || i + 1}`, exklusivNutzer: w.exklusivNutzer || [] }))}
                onEinheit={(id, nutzer) => { setEinzelWohnungen(prev => prev.map(w => (w.id === id ? { ...w, exklusivNutzer: nutzer.length ? nutzer : undefined } : w))); markDirty(); }}
              />
            </Card>
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setStep(isGlobalObjekt ? "global" : "1")}>Weiter: {isGlobalObjekt ? "Globaldaten" : isEinzelwohnung ? "Wohnung" : "Wohnungen"} →</Button>
            </div>
          </TabsContent>

          {/* Step: Globalobjekt-Daten (nur sichtbar wenn isGlobalObjekt) */}
          {isGlobalObjekt && (
            <TabsContent value="global" forceMount className={`space-y-4 pt-4 ${step !== "global" ? "hidden" : ""}`}>
              <Card className="p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Globalobjekt – Kennzahlen</h3>
                  <p className="text-xs text-muted-foreground mt-1">Gib die Parameter für das gesamte Objekt ein. Diese werden für die Investment-Analyse und Darstellung verwendet.</p>
                </div>

                {/* Gebäude */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Gebäude</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><Label className="text-xs">Gesamt-Wohnfläche (m²) *</Label><Input type="number" value={globalDaten.gesamtQm || ""} onChange={e => updateGlobal("gesamtQm", parseFloat(e.target.value) || 0)} onBlur={e => pruefeGesamtflaeche(parseFloat(e.target.value) || 0)} className="h-8" /></div>
                    <div><Label className="text-xs">Grundstück (m²) *</Label><Input type="number" value={globalDaten.grundstueckQm || ""} onChange={e => updateGlobal("grundstueckQm", parseFloat(e.target.value) || 0)} className="h-8" /></div>
                    <div><Label className="text-xs">Etagen *</Label><Input type="number" value={globalDaten.etagen || ""} onChange={e => updateGlobal("etagen", parseInt(e.target.value) || 0)} className="h-8" /></div>
                    <div><Label className="text-xs">Stellplätze</Label><Input type="number" value={globalDaten.stellplaetze || ""} onChange={e => updateGlobal("stellplaetze", parseInt(e.target.value) || 0)} className="h-8" /></div>
                  </div>
                  {/*
                    Baujahr, Zustand, Energieklasse und Einheiten im Haus stehen
                    seit dem 16.10.2026 nur noch unter Basisdaten, Erhaltungsaufwand,
                    Grundstücksanteil, Hausgeld und Kaufnebenkosten im AfA-Schritt.
                    Vorher gab es sie hier ein zweites Mal; „Wohneinheiten gesamt“
                    und der Grundstücksanteil von hier wurden nie gespeichert.
                  */}
                </div>

                {/* Finanzen */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Finanzdaten</p>
                  <p className="text-bildunterschrift text-muted-foreground mb-2">💡 Verkaufspreis, qm-Preis und Gesamtfläche werden automatisch ineinander umgerechnet.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                     <div><Label className="text-xs">Verkaufspreis gesamt (€) *</Label><EuroInput value={globalDaten.verkaufspreis} onChange={v => updateGlobal("verkaufspreis", v)} className="h-8" /></div>
                     <div><Label className="text-xs">Verkaufspreis pro m² (€)</Label><EuroInput value={globalDaten.qmPreis ?? 0} onChange={v => updateGlobal("qmPreis", v)} className="h-8" /></div>
                     <div><Label className="text-xs">Jahresnettomiete (€) *</Label><EuroInput value={globalDaten.jahresnettomiete} onChange={v => updateGlobal("jahresnettomiete", v)} className="h-8" /></div>
                     <div><Label className="text-xs">Rendite (%) *</Label><Input type="number" step="0.01" value={globalDaten.rendite || ""} onChange={e => updateGlobal("rendite", parseFloat(e.target.value) || 0)} className="h-8" /></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div><Label className="text-xs">Vermietungsstand (%) *</Label><Input type="number" step="1" value={globalDaten.vermietungsstand || ""} onChange={e => updateGlobal("vermietungsstand", parseFloat(e.target.value) || 0)} className="h-8" min={0} max={100} /></div>
                  </div>
                </div>

                {/* Auto-calculated summary */}
                {globalDaten.verkaufspreis > 0 && (
                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <p className="text-xs font-semibold mb-2">Berechnete Werte</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><span className="text-muted-foreground">QM-Preis:</span> <span className="font-medium">{globalDaten.gesamtQm > 0 ? fmt(globalDaten.verkaufspreis / globalDaten.gesamtQm) : "–"}</span></div>
                      <div><span className="text-muted-foreground">Rendite:</span> <span className="font-medium">{globalDaten.rendite > 0 ? `${globalDaten.rendite.toFixed(2)}%` : "–"}</span></div>
                      <div><span className="text-muted-foreground">Hausgeld p.a.:</span> <span className="font-medium">{fmt(globalDaten.hausgeldMonat * 12)}</span></div>
                      <div><span className="text-muted-foreground">Gesamtkosten:</span> <span className="font-medium">{fmt(globalDaten.verkaufspreis * (1 + kaufnebenkostenPct({ plz: nf.plz, metaPct: globalDaten.kaufnebenkosten }) / 100))}</span></div>
                      <div><span className="text-muted-foreground">Hausgeld nicht umlegbar:</span> <span className="font-medium">{fmt(kalkHausgeldNuEuro > 0 ? kalkHausgeldNuEuro : Math.round(globalDaten.hausgeldMonat * (kalkHausgeldNuP || 30) / 100))}/mtl.</span></div>
                    </div>
                  </Card>
                )}
              </Card>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("0")}>← Zurück</Button>
                <Button className="flex-1" onClick={() => setStep("1")}>Weiter: Einheiten →</Button>
              </div>
            </TabsContent>
          )}

          {/* Step 2: Wohnungen */}
          <TabsContent value="1" forceMount className={`space-y-4 pt-4 ${step !== "1" ? "hidden" : ""}`}>
            {isGlobalObjekt && (
              <Card className="p-3 border-primary/40 bg-primary/5">
                <p className="text-xs">
                  <span className="font-semibold">Freiwillig:</span> Das Haus wird als Ganzes verkauft. Wenn du die Einheiten hier anlegst, bekommt jede ihre eigene Seite mit Bildern, Unterlagen, Miete und Hausgeld. Preise der Einheiten sind dafür nicht nötig.
                </p>
              </Card>
            )}
            {isEinzelwohnung && (
              <Card className="p-3 border-primary/40 bg-primary/5">
                <p className="text-xs">
                  <span className="font-semibold">Einzelwohnungs-Modus aktiv:</span> Es kann genau <strong>eine</strong> Wohneinheit angelegt werden. Bulk-Anlage ist deaktiviert.
                </p>
              </Card>
            )}
            {einzelWohnungen.length > 0 && (
              <Card className="p-4">
                <p className="text-sm font-semibold mb-3">
                  {isEinzelwohnung
                    ? "Wohnungsdaten (Einzelwohnung)"
                    : `${einzelWohnungen.length} Wohnung(en) angelegt`}
                </p>
                <div className="space-y-2">
                  {einzelWohnungen
                    .map((w, originalIdx) => ({ w, originalIdx }))
                    .sort((a, b) => {
                      const nA = parseFloat(a.w.weNr || ""); const nB = parseFloat(b.w.weNr || "");
                      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
                      return (a.w.weNr || "").localeCompare(b.w.weNr || "", "de", { numeric: true });
                    }).map(({ w, originalIdx }) => {
                    const i = originalIdx;
                    const wId = w.id || `w-idx-${i}`;
                    const docsForW = wohnungDocs[wId] || {};
                    const docCount = Object.keys(docsForW).length;
                    const isExpanded = expandedWohnungDocs[i];
                    return (
                    <div key={wId} className={`rounded-lg border p-3 ${editingIdx === i ? "border-primary bg-primary/5" : ""}`}>
                      {editingIdx === i ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold">WE {w.weNr} bearbeiten</span>
                            <Button size="sm" onClick={saveEdit}>Speichern ✓</Button>
                          </div>
                          {renderWohnungFields(w, (field, value) => handleWohnungFieldChange(field, value, true), true, w.id)}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-medium">{w.weNr}</span>
                              <span className="text-muted-foreground">{(w.groesse || 0).toFixed(2)} m²</span>
                              <span className="text-muted-foreground">{fmt(w.vkGesamt || 0)}</span>
                              <span className="text-muted-foreground">{w.qmPreis?.toFixed(0)} €/m²</span>
                              <span className="text-muted-foreground">{w.rendite?.toFixed(2)}%</span>
                              {(() => {
                                // Bei einer vorhandenen Einheit der gespeicherte Stand, wie in der Bearbeitung.
                                const s = (gespeicherteEinheit(w.id)?.status ?? (w.status as string)) || "frei";
                                const cfg: Record<string, { label: string; cls: string }> = {
                                  frei: { label: "Frei", cls: "bg-[hsl(120,100%,40%)]/10 text-[hsl(120,100%,40%)] border-[hsl(120,100%,40%)]/30" },
                                  reserviert: { label: "Reserviert", cls: "bg-[hsl(157,68%,31%)]/10 text-[hsl(157,68%,31%)] border-[hsl(157,68%,31%)]/30" },
                                  verkauft: { label: "Verkauft", cls: "bg-[hsl(0,100%,50%)]/10 text-[hsl(0,100%,50%)] border-[hsl(0,100%,50%)]/30" },
                                };
                                const c = cfg[s] || cfg.frei;
                                return <Badge variant="outline" className={`text-bildunterschrift ${c.cls}`}>{c.label}</Badge>;
                              })()}
                              <Badge variant={w.vermietet !== false ? "default" : "destructive"} className="text-bildunterschrift">
                                {w.vermietet !== false ? "Vermietet" : "Leerstand"}
                              </Badge>
                              {docCount > 0 && <Badge variant="outline" className="text-bildunterschrift gap-1"><FileText className="h-2.5 w-2.5" />{docCount} Dok.</Badge>}
                              {(wohnungBilder[wId] || []).length > 0 && <Badge variant="outline" className="text-bildunterschrift gap-1"><ImagePlus className="h-2.5 w-2.5" />{(wohnungBilder[wId] || []).length} Bild(er)</Badge>}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" aria-label="Bearbeiten" className="h-7 w-7" onClick={() => startEdit(i)}><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7 text-destructive" onClick={() => removeWohnung(i)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Bulk vs Einzeln Auswahl */}
            {!(isEinzelwohnung && einzelWohnungen.length >= 1) && (
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> {isEinzelwohnung ? "Wohnung erfassen" : "Wohnungen hinzufügen"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Felder werden automatisch berechnet: QM-Preis ↔ Verkaufspreis, Miete ↔ Rendite</p>
                </div>
                {!isEinzelwohnung && (
                  <Button size="sm" variant="outline" onClick={() => setShowBulkDialog(true)} className="gap-1">
                    <Copy className="h-3 w-3" /> Mehrere gleiche anlegen
                  </Button>
                )}
              </div>
              {renderWohnungFields(newW, (field, value) => handleWohnungFieldChange(field, value, false), true, newW.id)}
              <div className="flex justify-end">
                <Button size="sm" variant={einzelWohnungen.length > 0 ? "default" : "outline"} onClick={addEinzelWohnung}>
                  {isEinzelwohnung
                    ? (<><Plus className="h-3 w-3 mr-1" /> Wohnung übernehmen</>)
                    : (einzelWohnungen.length > 0 ? "Wohnung hinzufügen" : <><Plus className="h-3 w-3 mr-1" /> Wohnung hinzufügen</>)}
                </Button>
              </div>
            </Card>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(isGlobalObjekt ? "global" : "0")}>← Zurück</Button>
              <Button className="flex-1" onClick={() => setStep("afa")}>Weiter: AfA-Rechner →</Button>
            </div>
          </TabsContent>

          {/* Step AfA: AfA-Rechner (Punkt 3) */}
          <TabsContent value="afa" forceMount className={`space-y-4 pt-4 ${step !== "afa" ? "hidden" : ""}`}>
            <Card className="p-5 space-y-2">
              <h3 className="text-sm font-semibold">AfA-Rechner</h3>
              <p className="text-xs text-muted-foreground">
                Bitte fülle die AfA-Daten zum Objekt aus. Adresse, Kaufpreis, Wohnfläche und Baujahr sind aus den vorigen Schritten vorausgefüllt – die übrigen Felder (Grundstücksfläche, Bodenrichtwert, Modernisierungen, Erhaltungsaufwand) bitte ergänzen. Die Eingaben werden mit dem AfA-Rechner im Objekt-/Wohnungsbereich synchronisiert.
              </p>
            </Card>
            <AfaRechnerEmbed
              computedAdresse={nf.adresse}
              computedPlz={nf.plz}
              computedOrt={nf.ort}
              computedKaufpreis={isGlobalObjekt ? (globalDaten.verkaufspreis || 0) : einzelWohnungen.reduce((s, w) => s + (w.vkGesamt || 0), 0)}
              computedWohnflaeche={isGlobalObjekt ? (globalDaten.gesamtQm || 0) : einzelWohnungen.reduce((s, w) => s + (w.groesse || 0), 0)}
              computedBaujahr={globalDaten.baujahr || undefined}
              initialSanierungskosten={sanierungskosten}
              initialErhaltungsaufwandJahre={existingObjekt?.erhaltungsaufwandJahre}
              draft={afaDraft}
              onSanierungskostenChange={setSanierungskosten}
              onResultChange={setAfaErgebnis}
              onDraftChange={setAfaDraft}
              slotBeforeModus={
                <Card className="p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Annahmen für die Kalkulation</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 Diese Werte dienen den Kalkulationen als Vorbelegung und gelten für jede Wohnung dieses Objekts.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Hausgeld gesamt (€/Monat)</Label>
                      <EuroInput value={kalkHausgeldMonat} onChange={v => {
                        setKalkHausgeldMonat(v);
                        if (isGlobalObjekt) updateGlobal("hausgeldMonat", v);
                        markDirty();
                      }} className="h-8" />
                      <p className="text-bildunterschrift text-muted-foreground mt-1">Brutto-Hausgeld der Einheit/des Objekts (umlagefähig + nicht umlagefähig).</p>
                    </div>
                    <div>
                      <Label className="text-xs">Hausgeld nicht umlagefähig (%)</Label>
                      <Input type="number" step="1" min={0} max={100} value={kalkHausgeldNuP || ""} onChange={e => { setKalkHausgeldNuP(parseFloat(e.target.value) || 0); markDirty(); }} className="h-8" disabled={kalkHausgeldNuEuro > 0} />
                      {kalkHausgeldNuEuro > 0 && (
                        <p className="text-bildunterschrift text-muted-foreground mt-1">Überschrieben durch EUR-Wert.</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Hausgeld nicht umlegbar (€/Monat)</Label>
                      <EuroInput value={kalkHausgeldNuEuro} onChange={v => { setKalkHausgeldNuEuro(v); markDirty(); }} className="h-8" />
                      <p className="text-bildunterschrift text-muted-foreground mt-1">Wenn &gt; 0, überschreibt diesen Wert die %-Berechnung.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Rücklage WEG (€)</Label>
                      <EuroInput value={ruecklageWeg} onChange={v => { setRuecklageWeg(v); markDirty(); }} className="h-8" />
                      <p className="text-bildunterschrift text-muted-foreground mt-1">Aktueller Stand der Instandhaltungsrücklage der gesamten WEG. Wird auf der Objektseite angezeigt, wenn &gt; 0.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Garantierte Erstvermietung (kalt) (€)</Label>
                      <EuroInput value={garantierteErstvermietungKalt} onChange={v => { setGarantierteErstvermietungKalt(v); markDirty(); }} className="h-8" />
                      <p className="text-bildunterschrift text-muted-foreground mt-1">Garantierte Erstvermietung kalt. Wird auf der Wohnungsseite angezeigt, wenn &gt; 0.</p>
                    </div>
                    <div>
                      <Label className="text-xs">SEV / Monat (€)</Label>
                      <EuroInput value={kalkSevMonat} onChange={v => { setKalkSevMonat(v); markDirty(); }} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Kaufnebenkosten (%)</Label>
                      <Input type="number" step="0.5" min={0} value={globalDaten.kaufnebenkosten || ""} onChange={e => updateGlobal("kaufnebenkosten", parseFloat(e.target.value) || 0)} className="h-8" />
                      <p className="text-bildunterschrift text-muted-foreground mt-1">Grunderwerbsteuer, Notar, Grundbuch. Leer lassen: Satz nach Bundesland aus der Postleitzahl. Vorbelegung für Investmentrechner und Exposé.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Mietausfall (%)</Label>
                      <Input type="number" step="0.5" min={0} max={100} value={kalkMietausfallP || ""} onChange={e => { setKalkMietausfallP(parseFloat(e.target.value) || 0); markDirty(); }} className="h-8" />
                    </div>
                     <div className="col-span-2">
                       <Label className="text-xs">Instandhaltungspauschale</Label>
                       <div className="flex gap-2">
                         <select
                           value={kalkInstandhaltungMode}
                           onChange={e => { setKalkInstandhaltungMode(e.target.value as "qm" | "pct"); markDirty(); }}
                           className="h-8 rounded-md border bg-background px-2 text-xs"
                         >
                           <option value="qm">€/m²/Jahr</option>
                           <option value="pct">% vom Gebäudewert p.a.</option>
                         </select>
                         {kalkInstandhaltungMode === "qm" ? (
                           <Input
                             type="number" step="0.5" min={0}
                             placeholder="z.B. 10"
                             value={kalkInstandhaltungQm || ""}
                             onChange={e => { setKalkInstandhaltungQm(parseFloat(e.target.value) || 0); markDirty(); }}
                             className="h-8 flex-1"
                           />
                         ) : (
                           <Input
                             type="number" step="0.1" min={0}
                             placeholder="z.B. 1,0"
                             value={kalkInstandhaltungPct || ""}
                             onChange={e => { setKalkInstandhaltungPct(parseFloat(e.target.value) || 0); markDirty(); }}
                             className="h-8 flex-1"
                           />
                         )}
                       </div>
                       <p className="text-bildunterschrift text-muted-foreground mt-1">
                         {kalkInstandhaltungMode === "qm"
                           ? "Petersche Formel: 8–15 €/m² · Standard 10 €"
                           : "Branchenüblich 0,5–1,5 % vom Gebäudewert · Standard 1,0 %"}
                       </p>
                     </div>
                  </div>
                </Card>
              }
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("1")}>← Zurück</Button>
              <Button className="flex-1" onClick={() => setStep("2")}>Weiter: Objekt Unterlagen →</Button>
            </div>
          </TabsContent>

          {/* Step 4: Unterlagen */}
          <TabsContent value="2" forceMount className={`space-y-4 pt-4 ${step !== "2" ? "hidden" : ""}`}>
            <Card className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">{regeln.objektDokumenteTitel}</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {regeln.objektDokumente
                    ? "Unterlagen, die für das ganze Objekt gelten. Lade die PDF hoch, hinterlege zusätzlich einen Sammel-Link, oder beides."
                    : "Eine Einzelwohnung hat keine eigenen Objektunterlagen. Alle Unterlagen gehören zur Wohnung und stehen weiter unten. Der Sammel-Link bleibt trotzdem möglich."}
                </p>
                <div className="space-y-2 mb-4">
                  <Label className="text-xs">Link zu den Objektunterlagen</Label>
                  <Input
                    type="url"
                    value={objektUnterlagenLink}
                    onChange={e => { setObjektUnterlagenLink(e.target.value); markDirty(); }}
                    placeholder="https://..."
                    className="h-9 text-sm"
                  />
                  {objektUnterlagenLink && (
                    <p className="text-bildunterschrift text-muted-foreground">Auf der {isEinzelwohnung ? "Einheitsseite" : "Objektseite"} erscheint ein Knopf „Objektunterlagen öffnen", der diesen Link aufruft.</p>
                  )}
                </div>
                {regeln.objektDokumente && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Nur PDF, höchstens {MAX_DOKUMENT_MB} MB je Datei. Fotos gehören in den Schritt „Medien", nicht hierher.
                    </p>
                    {OBJEKT_DOC_CATEGORIES.map(doc => {
                      const dateiname = objektDocs[doc.id];
                      const hatDatei = objektDocHatDatei(doc.id);
                      return (
                        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{doc.name}</p>
                              {dateiname ? (
                                <p className={`truncate text-bildunterschrift ${hatDatei ? "text-muted-foreground" : "text-[hsl(var(--warning))]"}`}>
                                  {dateiname}{hatDatei ? "" : " · nur erkannt, Datei fehlt noch"}
                                </p>
                              ) : (
                                <p className="text-bildunterschrift text-muted-foreground">Noch nichts hochgeladen</p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {hatDatei && (
                              <Badge variant="outline" className="text-bildunterschrift text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Vorhanden</Badge>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.id, f); e.target.value = ""; }}
                              />
                              <Badge variant="outline" className="cursor-pointer text-xs hover:bg-muted"><Upload className="mr-1 h-3 w-3" /> PDF</Badge>
                            </label>
                            {dateiname && (
                              <Button variant="ghost" size="icon" aria-label="Entfernen" className="h-7 w-7 text-destructive" onClick={() => removeObjektDoc(doc.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Zusätzliche Objektunterlagen ohne feste Kategorie */}
              {regeln.objektDokumente && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-1">Weitere Objektunterlagen</h3>
                  <p className="text-xs text-muted-foreground mb-3">Alles, was in keine der Kategorien oben passt. Erscheint auf der Objektseite unter den Objektunterlagen.</p>
                  {extraDocs.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {extraDocs.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm">{doc.name}</span>
                            <span className="truncate text-xs text-muted-foreground">({doc.filename || "Datei bereits gespeichert"})</span>
                          </div>
                          <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7 text-destructive" onClick={() => removeExtraDoc(doc.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Dokumenttitel</Label>
                      <Input value={newExtraDocName} onChange={e => setNewExtraDocName(e.target.value)} placeholder="z.B. Protokoll Eigentümerversammlung" className="h-8 text-xs" />
                    </div>
                    <label className="cursor-pointer">
                      <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleExtraDocUpload(f); e.target.value = ""; }} />
                      <Button size="sm" variant="outline" className="h-8 gap-1" asChild><span><Upload className="h-3 w-3" /> PDF hochladen</span></Button>
                    </label>
                  </div>
                </div>
              )}

              {/* Wohnungsbilder Ordner (aus Schritt 2) */}
              {Object.keys(wohnungBilder).length > 0 && (
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Wohnungsbilder</h3>
                  <p className="text-xs text-muted-foreground mb-3">Diese Bilder wurden in Schritt 2 (Wohnungen) hochgeladen und werden beim Download mit eingeschlossen.</p>
                  <div className="space-y-2">
                    {einzelWohnungen.map(w => {
                      const wId = w.id || "";
                      const bilder = wohnungBilder[wId];
                      if (!bilder || bilder.length === 0) return null;
                      return (
                        <div data-ui="card" key={wId} className="rounded-lg border bg-card p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">WE {w.weNr} – {bilder.length} Bild(er)</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {bilder.map(b => (
                              <div key={b.id} className="w-12 h-12 rounded overflow-hidden border">
                                <img src={b.url} alt={b.alt} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

            {/* Interne Unterlagen / Tools */}
            <Card className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Interne Unterlagen / Tools</h3>
                <p className="text-xs text-muted-foreground mb-4">Interne Dokumente, die nur für das Team sichtbar sind (z.B. Kalkulationen, Verträge, Protokolle). Diese erscheinen im Objektbereich unter „Interne Unterlagen / Tools".</p>
                {interneDocs.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {interneDocs.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{doc.name}</span>
                          <span className="text-xs text-muted-foreground">({doc.filename})</span>
                        </div>
                        <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7 text-destructive" onClick={() => removeInterneDoc(doc.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Dokumenttitel</Label>
                    <Input value={newInterneDocName} onChange={e => setNewInterneDocName(e.target.value)} placeholder="z.B. Kalkulation, Vertrag..." className="h-8 text-xs" />
                  </div>
                  <label className="cursor-pointer">
                    <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleInterneDocUpload(f); }} />
                    <Button size="sm" variant="outline" className="h-8 gap-1" asChild><span><Upload className="h-3 w-3" /> PDF hochladen</span></Button>
                  </label>
                </div>
              </div>
            </Card>

            {regeln.wohnungDokumente && einzelWohnungen.length === 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-1">{regeln.wohnungDokumenteTitel}</h3>
                <p className="text-xs text-muted-foreground">
                  Es ist noch keine Einheit übernommen. Lege sie im Schritt „{isEinzelwohnung ? "Wohnung" : "Wohnungen"}" an, danach erscheinen hier die Upload-Felder je Einheit.
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setStep("1")}>Zum Schritt „{isGlobalObjekt ? "Einheiten" : isEinzelwohnung ? "Wohnung" : "Wohnungen"}"</Button>
              </Card>
            )}

            {regeln.wohnungDokumente && einzelWohnungen.length > 0 && (
              <Card className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">{regeln.wohnungDokumenteTitel}</h3>
                  <p className="text-xs text-muted-foreground">
                    Diese Unterlagen hängen an der einzelnen Einheit und erscheinen nur auf deren Seite unter „Unterlagen der Wohnung".
                    Nur PDF, höchstens {MAX_DOKUMENT_MB} MB je Datei. Zusätzlich lässt sich je Einheit ein Sammel-Link hinterlegen.
                  </p>
                </div>
                <div className="space-y-3">
                  {einzelWohnungen.map((w, idx) => {
                    const wId = w.id || `w-idx-${idx}`;
                    const docsForW = wohnungDocs[wId] || {};
                    const customs = customWohnungDocs[wId] || [];
                    const anzahl = Object.keys(docsForW).length + customs.length;
                    const offen = expandedWohnungDocs[idx] ?? (einzelWohnungen.length === 1);
                    return (
                      <div data-ui="card" key={wId} className="rounded-lg border bg-card p-3 space-y-2">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-left"
                          onClick={() => setExpandedWohnungDocs(prev => ({ ...prev, [idx]: !offen }))}
                        >
                          <span className="text-xs font-semibold">
                            WE {w.weNr || idx + 1}{w.lage ? ` – ${w.lage}` : ""}
                            {anzahl > 0 && <Badge variant="outline" className="ml-2 text-bildunterschrift gap-1"><FileText className="h-2.5 w-2.5" />{anzahl}</Badge>}
                          </span>
                          {offen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>

                        {offen && (
                          <div className="space-y-2 pt-1">
                            <div>
                              <Label className="text-bildunterschrift">Sammel-Link zu den Wohnungsunterlagen</Label>
                              <Input
                                type="url"
                                value={w.unterlagenLink || ""}
                                onChange={e => {
                                  const v = e.target.value;
                                  setEinzelWohnungen(prev => prev.map((x, i) => i === idx ? { ...x, unterlagenLink: v } : x));
                                  markDirty();
                                }}
                                placeholder="https://..."
                                className="h-8 text-sm"
                              />
                            </div>

                            {DEFAULT_WOHNUNG_DOCS.map(doc => {
                              const dateiname = docsForW[doc.id];
                              return (
                                <div key={doc.id} className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium">{doc.name}</p>
                                      <p className="truncate text-bildunterschrift text-muted-foreground">{dateiname || "Noch nichts hochgeladen"}</p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <label className="cursor-pointer">
                                      <input
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleWohnungDocUpload(wId, doc.id, f); e.target.value = ""; }}
                                      />
                                      <Badge variant="outline" className="cursor-pointer text-bildunterschrift hover:bg-muted"><Upload className="mr-1 h-2.5 w-2.5" /> PDF</Badge>
                                    </label>
                                    {dateiname && (
                                      <Button variant="ghost" size="icon" aria-label="Entfernen" className="h-6 w-6 text-destructive" onClick={() => removeWohnungDoc(wId, doc.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {customs.length > 0 && (
                              <div className="space-y-1.5">
                                {customs.map(cd => (
                                  <div key={cd.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate text-xs">{cd.name}</span>
                                      <span className="truncate text-bildunterschrift text-muted-foreground">({cd.filename || "bereits gespeichert"})</span>
                                    </div>
                                    <Button variant="ghost" size="icon" aria-label="Löschen" className="h-6 w-6 text-destructive" onClick={() => removeCustomWohnungDoc(wId, cd.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <Label className="text-bildunterschrift">Weitere Unterlage, Titel</Label>
                                <Input
                                  value={newCustomWohnungDocName[wId] || ""}
                                  onChange={e => { const v = e.target.value; setNewCustomWohnungDocName(prev => ({ ...prev, [wId]: v })); }}
                                  placeholder="z.B. Übergabeprotokoll"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCustomWohnungDocUpload(wId, f); e.target.value = ""; }}
                                />
                                <Button size="sm" variant="outline" className="h-8 gap-1" asChild><span><Upload className="h-3 w-3" /> PDF hochladen</span></Button>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("afa")}>← Zurück</Button>
              <Button className="flex-1" onClick={() => setStep("3")}>Weiter: Medien →</Button>
            </div>
          </TabsContent>

          {/* Step 4: Medien */}
          <TabsContent value="3" forceMount className={`space-y-4 pt-4 ${step !== "3" ? "hidden" : ""}`}>
            <Card className="p-5 space-y-4">
              {/* Objektbilder Upload */}
              <div>
                <Label className="text-xs font-semibold">{regeln.medienZiel === "einheit" ? "Bilder der Wohnung" : "Objektbilder"}</Label>
                <p className="text-bildunterschrift text-muted-foreground mt-1 mb-2">
                  {regeln.medienZiel === "einheit"
                    ? "Diese Bilder gehören zur Wohnung und erscheinen auf der Einheitsseite. Eine eigene Objektseite gibt es bei einer Einzelwohnung nicht."
                    : "Bilder des Gebäudes: Außenansicht, Treppenhaus, Umgebung. Sie erscheinen auf der Objektseite."}
                </p>
                <p className="text-bildunterschrift text-muted-foreground mb-2">Das erste Bild ist das Titelbild. Mit dem Stern machst du ein anderes Bild zum Titelbild, mit den Pfeilen änderst du die Reihenfolge.</p>
                {regeln.wohnungBilder && regeln.medienZiel === "objekt" && (
                  <p className="text-bildunterschrift text-muted-foreground mb-2">
                    Bilder einzelner Einheiten gehören nicht hierher, sondern in den Schritt „{isGlobalObjekt ? "Einheiten" : "Wohnungen"}“, direkt bei der jeweiligen Einheit.
                  </p>
                )}
                <input ref={slideshowRef} type="file" accept="image/*,.heic,.heif,.avif" multiple className="hidden" onChange={async e => {
                  const files = e.target.files;
                  if (!files) return;
                  for (const file of Array.from(files)) {
                    const compressed = await compressImageImmediate(file, "standard");
                    const slideId = `slide-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    setSlideshowPreviews(prev => [...prev, { id: slideId, url: compressed.thumbnailDataUrl, alt: file.name }]);
                    setSlideshowFiles(prev => ({ ...prev, [slideId]: compressed.originalFile }));
                  }
                  markDirty();
                }} />
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {slideshowPreviews.map((img, idx) => (
                    <div key={img.id} className="relative group rounded-lg overflow-hidden border aspect-video">
                      <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <Badge className="absolute bottom-1 left-1 text-bildunterschrift bg-primary">Titelbild</Badge>
                      )}
                      <BildSteuerung
                        index={idx}
                        anzahl={slideshowPreviews.length}
                        onVerschieben={ziel => { setSlideshowPreviews(prev => verschiebeBild(prev, img.id, ziel)); markDirty(); }}
                        onEntfernen={() => removeSlideshowImage(img.id)}
                      />
                    </div>
                  ))}
                  <div className="border-2 border-dashed rounded-lg aspect-video flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors" onClick={() => slideshowRef.current?.click()}>
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <p className="text-bildunterschrift text-muted-foreground">Bilder hinzufügen</p>
                  </div>
                </div>
              </div>

              {/* Video */}
              {/* Bilder je Einheit: bei jeder Objektart im Schritt der Einheiten, ein Weg für alle (16.10.2026). */}
              <div><Label className="text-xs font-semibold">Video-URL</Label><Input value={nf.videoUrl} onChange={e => updateField("videoUrl", e.target.value)} placeholder="https://youtube.com/..." /></div>
            </Card>

            {/* Beschreibung zum Schluss: Jetzt sind Einheiten, Kennzahlen und Bilder da (Inhaber, 18.10.2026). */}
            <Card className="p-5 space-y-2" data-testid="beschreibung-ki-karte">
              <div>
                <h3 className="text-sm font-semibold">Objektbeschreibung</h3>
                <p className="text-xs text-muted-foreground">Steht im Exposé und auf der Objektseite. Die KI wertet dafür die Bilder und alle Angaben aus, höchstens {MAX_KURZBESCHREIBUNG} Zeichen. Danach frei änderbar.</p>
              </div>
              <BeschreibungFeld
                wert={nf.beschreibung}
                onChange={v => updateField("beschreibung", v)}
                ki={darfKiTexte ? { angaben: kiAngaben, bildUrls: kiBildUrls } : undefined}
              />




            </Card>

            {/* Strukturierte Vollständigkeits-Übersicht */}
            {(() => {
              const wohnungenStep = isGlobalObjekt ? "global" : "1";
              const sections: { titel: string; target: string; felder: { label: string; ok: boolean; target?: string }[] }[] = [
                {
                  titel: "Basisdaten",
                  target: "0",
                  felder: [
                    { label: "Titel", ok: !!nf.titel.trim() },
                    { label: "Adresse", ok: !!nf.adresse.trim() },
                    { label: "PLZ / Ort", ok: !!nf.plz.trim() && !!nf.ort.trim() },
                    { label: "Beschreibung", ok: !!nf.beschreibung.trim() && nf.beschreibung.length <= MAX_KURZBESCHREIBUNG },
                    { label: "Badge", ok: !!nf.badge.trim() },
                    { label: "Standortargumente", ok: objektangaben.standortargumente.some(a => a.trim()) },
                  ],
                },
                {
                  titel: "Verkäufer",
                  target: "0",
                  felder: [
                    { label: "Name", ok: !!verkaeuferDaten.name.trim() },
                    { label: "Straße", ok: !!verkaeuferDaten.strasse?.trim() },
                    { label: "PLZ / Ort", ok: !!verkaeuferDaten.plz?.trim() && !!verkaeuferDaten.ort?.trim() },
                    { label: "E-Mail / Telefon", ok: !!((verkaeuferDaten as any).email?.trim() || (verkaeuferDaten as any).telefon?.trim()) },
                  ],
                },
                isGlobalObjekt
                  ? {
                      titel: "Globaldaten",
                      target: "global",
                      felder: [
                        { label: "Verkaufspreis", ok: (globalDaten.verkaufspreis || 0) > 0 },
                        { label: "Wohnfläche gesamt", ok: (globalDaten.gesamtQm || 0) > 0 },
                        { label: "Baujahr", ok: (globalDaten.baujahr || 0) > 0 },
                        { label: "Grundstücksfläche", ok: ((globalDaten as any).grundstueckQm || 0) > 0 },
                        { label: "Rendite", ok: ((globalDaten as any).rendite || 0) > 0 },
                      ],
                    }
                  : {
                      titel: "Wohnungen",
                      target: "1",
                      felder: [
                        { label: "Mindestens eine Wohnung", ok: einzelWohnungen.length > 0 },
                        { label: "Alle Wohnungen mit Preis", ok: einzelWohnungen.length > 0 && einzelWohnungen.every(w => (w.vkGesamt || 0) > 0) },
                        { label: "Alle Wohnungen mit Größe", ok: einzelWohnungen.length > 0 && einzelWohnungen.every(w => (w.groesse || 0) > 0) },
                        { label: "Alle Wohnungen mit Miete", ok: einzelWohnungen.length > 0 && einzelWohnungen.every(w => (w.mieteGesamt || 0) > 0) },
                      ],
                    },
                {
                  titel: "AfA-Rechner",
                  target: "afa",
                  felder: [
                     { label: "Baujahr", ok: ((afaDraft?.baujahr ?? globalDaten.baujahr ?? 0) > 0) },
                    { label: "Grundstücksanteil (%)", ok: ((afaDraft?.bodenAnteilPct ?? 0) > 0) },
                    { label: "Erhaltungsaufwand", ok: ((afaDraft?.sanierungskosten ?? sanierungskosten ?? 0) >= 0) && afaDraft != null },
                    { label: "AfA-Satz berechnet", ok: !!(afaErgebnis?.afaSatz && afaErgebnis.afaSatz > 0) },
                  ],
                },
                {
                  titel: "Unterlagen",
                  target: "2",
                  felder: [
                    // Der Haken zählt nur, was wirklich als Datei vorliegt.
                    // Ein von der Analyse erkannter Dateiname ohne Datei
                    // dahinter ist keine hochgeladene Unterlage.
                    ...(regeln.objektDokumente
                      ? [{ label: "Objektunterlagen hochgeladen", ok: objektDocsMitDatei > 0 }]
                      : []),
                    ...(regeln.wohnungDokumente
                      ? [{
                          label: "Unterlagen je Einheit",
                          ok: einzelWohnungen.length > 0 && einzelWohnungen.some(w => {
                            const wId = w.id || "";
                            return Object.keys(wohnungDocs[wId] || {}).length > 0 || (customWohnungDocs[wId]?.length || 0) > 0;
                          }),
                        }]
                      : []),
                    { label: "Interne Unterlagen", ok: (interneDocs?.length || 0) > 0 },
                    { label: "Cloud-Ordner-URL", ok: !!nf.cloudOrdnerUrl?.trim() },
                  ],
                },
                {
                  titel: "Medien",
                  target: "3",
                  felder: [
                    { label: regeln.medienZiel === "einheit" ? "Bild der Wohnung (mind. 1)" : "Objektbilder (mind. 1)", ok: slideshowPreviews.length > 0 || Object.values(wohnungBilder).some(b => b.length > 0) },
                    { label: regeln.medienZiel === "einheit" ? "Mehrere Bilder (≥ 3)" : "Mehrere Objektbilder (≥ 3)", ok: slideshowPreviews.length >= 3 || Object.values(wohnungBilder).some(b => b.length >= 3) },
                    { label: "Video-URL", ok: !!nf.videoUrl?.trim() },
                  ],
                },
              ];
              const allFields = sections.flatMap(s => s.felder);
              const okCount = allFields.filter(f => f.ok).length;
              const pct = allFields.length > 0 ? Math.round((okCount / allFields.length) * 100) : 0;
              const goTo = (target: string) => {
                setStep(target);
                setTimeout(() => rolleSeiteNachOben(), 50);
              };
              return (
                <Card className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Übersicht – Vollständigkeit</h3>
                    <Badge variant="outline" className={`text-xs ${pct >= 80 ? "text-[hsl(var(--success))] border-[hsl(var(--success))]/30" : pct >= 50 ? "text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" : "text-destructive border-destructive/30"}`}>
                      {pct}% ({okCount}/{allFields.length})
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-2">Klicke auf einen Eintrag, um direkt zum entsprechenden Schritt zu springen. Eingaben bleiben bis zur endgültigen Erstellung lokal gespeichert.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sections.map(sec => {
                      const secOk = sec.felder.filter(f => f.ok).length;
                      return (
                        <div key={sec.titel} className="rounded-lg border p-3">
                          <button
                            type="button"
                            onClick={() => goTo(sec.target)}
                            className="flex w-full items-center justify-between mb-2 text-left hover:text-primary transition-colors"
                          >
                            <span className="text-xs font-semibold underline-offset-2 hover:underline">{sec.titel} →</span>
                            <span className="text-bildunterschrift text-muted-foreground">{secOk}/{sec.felder.length}</span>
                          </button>
                          <ul className="space-y-1">
                            {sec.felder.map(f => (
                              <li key={f.label}>
                                <button
                                  type="button"
                                  onClick={() => goTo(f.target ?? sec.target)}
                                  className="flex w-full items-center gap-2 text-[11px] text-left hover:text-primary transition-colors"
                                  title={`Zu ${sec.titel} springen`}
                                >
                                  {f.ok ? (
                                    <span className="text-[hsl(var(--success))] w-3 inline-block text-center">✓</span>
                                  ) : (
                                    <span className="text-muted-foreground w-3 inline-block text-center">○</span>
                                  )}
                                  <span className={`${f.ok ? "text-foreground" : "text-muted-foreground"} hover:underline underline-offset-2`}>{f.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })()}

            {/* Pre-creation hints (Pflichtfelder werden bereits oben in der Übersicht angezeigt) */}
            {(() => {
              const missing: string[] = [];
              if (!nf.titel.trim()) missing.push("Titel");
              if (!verkaeuferDaten.name.trim()) missing.push("Verkäufer: Name");
              if (!verkaeuferDaten.strasse.trim()) missing.push("Verkäufer: Straße");
              if (!verkaeuferDaten.plz.trim()) missing.push("Verkäufer: PLZ");
              if (!verkaeuferDaten.ort.trim()) missing.push("Verkäufer: Ort");
              if (!anlageklasseAusInvestagon && !angezeigteAnlageklasse) missing.push("Anlageklasse");
              if (!isGlobalObjekt && einzelWohnungen.length === 0) missing.push("Mindestens eine Wohnung");
              const hatIrgendeinBild = slideshowPreviews.length > 0 || Object.values(wohnungBilder).some(b => b.length > 0);
              if (!hatIrgendeinBild) missing.push(regeln.medienZiel === "einheit" ? "Mindestens ein Bild der Wohnung" : "Mindestens ein Objektbild");
              // Hinweise zu Bildern
              const hints: string[] = [];
              if (regeln.medienZiel === "objekt" && slideshowPreviews.length === 1) hints.push("Weitere Objektbilder hinzufügen für einen besseren Eindruck bei den VP");
              if (!isGlobalObjekt && einzelWohnungen.length > 0) {
                const ohneB = einzelWohnungen.filter(w => !(wohnungBilder[w.id || ""]?.length));
                if (ohneB.length > 0) hints.push(`Wohnungsbilder fehlen bei ${ohneB.length} Wohnung(en) – Bilder verbessern den Eindruck bei den VP`);
              }
              return (
                <>
                  {hints.length > 0 && (
                    <Card className="p-4 border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
                      <div className="flex items-start gap-2">
                        <ImagePlus className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Empfehlung – Bilder hinzufügen:</p>
                          <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {hints.map(h => <li key={h}>• {h}</li>)}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  )}
                  {missing.length === 0 && hints.length === 0 && (
                    <Card className="p-4 border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[hsl(var(--success))]">✓</span>
                        <p className="text-sm font-medium text-[hsl(var(--success))]">Alle Pflichtfelder ausgefüllt – bereit zum Erstellen!</p>
                      </div>
                    </Card>
                  )}
                </>
              );
            })()}

            {isSaving && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Objekt wird gespeichert…</span>
                  <span className="animate-pulse">Bitte warten</span>
                </div>
                <Progress value={undefined} className="h-2 w-full [&>div]:animate-[indeterminate_1.5s_ease-in-out_infinite] [&>div]:!translate-x-0 [&>div]:!w-1/3" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("2")} disabled={isSaving}>← Zurück</Button>
              <Button className={`flex-1 transition-colors duration-300 ${saveSuccess ? "bg-green-600 hover:bg-green-600 text-white" : ""}`} onClick={handleCreate} disabled={saveSuccess || isSaving}>{isSaving ? "Speichert..." : saveSuccess ? "✓ Objekt angelegt!" : (isEditMode ? "Änderungen speichern ✓" : "Objekt erstellen ✓")}</Button>
            </div>
          </TabsContent>
        </Tabs>
        )}
      </div>

      {/* Analysis abort confirmation dialog */}
      <Dialog open={showAnalysisAbortConfirm} onOpenChange={setShowAnalysisAbortConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Analyse läuft noch</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Die KI-Analyse deiner Dokumente läuft noch. Wenn du die Seite jetzt verlässt, wird die Analyse abgebrochen und die bisherigen Ergebnisse gehen verloren.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAnalysisAbortConfirm(false)}>Analyse fortsetzen</Button>
            <Button variant="destructive" onClick={() => { setShowAnalysisAbortConfirm(false); navigate(isEditMode ? `/objekte/${editId}` : "/objekte"); }}>
              Abbrechen & Zurück
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navigation blocker dialog */}
      <Dialog open={showBlockerDialog} onOpenChange={(open) => {
        if (!open) {
          blockerPendingNav.current = null;
        }
        setShowBlockerDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>KI-Analyse läuft noch</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Die KI-Analyse deiner Dokumente läuft noch. Wenn du jetzt zu einer anderen Seite navigierst, wird die Analyse abgebrochen und der gesamte Fortschritt geht verloren.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowBlockerDialog(false); blockerPendingNav.current = null; }}>Auf Seite bleiben</Button>
            <Button variant="destructive" onClick={() => {
              setShowBlockerDialog(false);
              const dest = blockerPendingNav.current;
              blockerPendingNav.current = null;
              if (dest) navigate(dest);
            }}>
              Analyse abbrechen & Navigieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mehrere gleiche Wohnungen anlegen</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Alle Wohnungen erhalten die gleichen Kennzahlen. Die WE-Nummern werden fortlaufend vergeben.</p>
          <div className="grid grid-cols-2 gap-3 my-3">
            <div>
              <Label className="text-xs">Anzahl Wohnungen</Label>
              <Input type="number" value={bulkAnzahl} onChange={e => setBulkAnzahl(Math.max(1, parseInt(e.target.value) || 1))} className="h-8" min={1} max={100} />
            </div>
            <div>
              <Label className="text-xs">Startnummer WE-Nr.</Label>
              <Input type="number" value={bulkStartWeNr} onChange={e => setBulkStartWeNr(parseInt(e.target.value) || 1)} className="h-8" min={1} />
            </div>
          </div>
          {renderWohnungFields(bulkW, (field, value) => handleBulkFieldChange(field, value), false)}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Abbrechen</Button>
            <Button onClick={addBulkWohnungen}>{bulkAnzahl} Wohnungen anlegen ✓</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save summary dialog */}
      <Dialog open={!!saveSummary} onOpenChange={(open) => {
        if (!open) {
          setSaveSummary(null);
          navigate(isEditMode ? `/objekte/${editId}` : "/objekte");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-[hsl(var(--success))]">✓</span>
              {isEditMode ? "Objekt aktualisiert" : "Objekt erfolgreich erstellt"}
            </DialogTitle>
          </DialogHeader>
          {saveSummary && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                „{saveSummary.titel}" wurde erfolgreich {isEditMode ? "gespeichert" : "angelegt"}.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Zusammenfassung</p>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Objekt</span>
                  <span className="font-medium">1</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Wohnungen</span>
                  <span className="font-medium">{saveSummary.wohnungen}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><ImagePlus className="h-3.5 w-3.5 text-muted-foreground" /> Objektbilder</span>
                  <span className="font-medium">{saveSummary.objektBilder}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><ImagePlus className="h-3.5 w-3.5 text-muted-foreground" /> Wohnungsbilder</span>
                  <span className="font-medium">{saveSummary.wohnungBilderCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> Objektunterlagen</span>
                  <span className="font-medium">{saveSummary.objektDoks + saveSummary.extraDoks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> Wohnungsunterlagen</span>
                  <span className="font-medium">{saveSummary.wohnungDoks}</span>
                </div>
                {saveSummary.interneDoks > 0 && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> Interne Dokumente</span>
                    <span className="font-medium">{saveSummary.interneDoks}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setSaveSummary(null); navigate(isEditMode ? `/objekte/${editId}` : "/objekte"); }}>
              Zur Objektübersicht →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Rahmen>
  );
}
