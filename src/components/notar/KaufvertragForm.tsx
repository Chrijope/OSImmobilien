import { useState, useRef, useEffect, useCallback } from "react";
import { format, parse, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormProgress } from "@/components/ui/form-progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, Save, Upload, FileText, CalendarIcon, Check, BookmarkCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KaufvertragData } from "@/lib/investmentsStore";
import {
  NOTARBOGEN_SCHRITTE, NOTARBOGEN_PFLICHT_NAMEN,
  notarbogenLuecken, pflichtfelderImSchritt, pflichtfelderGesamt, vorausgefuellt,
} from "@/lib/notarbogenFelder";
import { KAUFGEGENSTAND_GESAMTOBJEKT } from "@/lib/reservierungErklaerung";
import { useKundenSprache } from "@/lib/kundenSprache";
import { dolmetscherKennzeichen } from "@/lib/notarSprache";
import { getInvestmentMetaField } from "@/lib/investmentsStore";
import { verkaeuferNameLabel, type VerkaeuferArt } from "@/lib/verkaeuferName";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Der Notar-Aufnahmebogen, seit 09/2026 in sechs Schritten.
 *
 * Vorher war das ein einziges Formular: elf Karten, fünfundvierzig Felder,
 * alles untereinander. Wer es öffnete, sah eine Wand und wusste weder, wo er
 * anfangen soll, noch wann er fertig ist. Jetzt läuft es wie die Objektauswahl
 * in `ObjektDatenDialog.tsx`, mit Fortschrittsleiste, Sprungmarken und einem
 * Kasten, der sagt, was noch offen ist.
 *
 * Wie geschnitten wurde, steht in `notarbogenFelder.ts`: nach der Frage, wer
 * die Antwort hat, nicht nach der Reihenfolge im Papierbogen.
 *
 * Drei Dinge sind bewusst so wie im Objektfenster:
 *
 *   Pflichtfelder sind gekennzeichnet und sagen unter dem Feld, wofür sie
 *   gebraucht werden. Ein Feld ohne erkennbaren Zweck bleibt leer.
 *
 *   Gespeichert wird auch unvollständig. Wer die IBAN des Verkäufers nicht zur
 *   Hand hat, soll den Bogen ablegen und später ergänzen, statt eine IBAN zu
 *   erfinden, um weiterzukommen. Verriegelt ist nur der Vollmacht-Upload, und
 *   auch der erst, sobald jemand „Vollmacht vorhanden“ angeklickt hat.
 *
 *   Ein Kasten unter jedem Schritt zählt auf, was fehlt und was ohne diese
 *   Angabe nicht funktioniert.
 *
 * Die Sprungmarken sind jederzeit erreichbar und prüfen nichts. Eine Sperre
 * wäre sinnlos, solange ohnehin unvollständig gespeichert werden darf.
 */

interface Props {
  initialData: KaufvertragData;
  onSave: (data: KaufvertragData) => void;
  readOnly?: boolean;
  kundeName?: string;
  investmentId?: string;
  kundeId?: string;
  /**
   * Zurück dorthin, wo der Bogen aufgegangen ist.
   *
   * Ohne diese Angabe erscheint kein Zurückknopf. Aufgerufen wird sie erst,
   * wenn nichts mehr zu verlieren ist: ohne eigene Eingabe sofort, sonst
   * nach der Rückfrage.
   */
  onZurueck?: () => void;
}

/**
 * Weicht der Bogen von dem Stand ab, mit dem er aufgegangen ist?
 *
 * Verglichen wird Feld für Feld. Leer, „nicht gesetzt“ und ein leerer Text
 * gelten als dasselbe, sonst meldete schon ein einmal angetipptes und wieder
 * geleertes Feld eine Änderung, und die Rückfrage käme bei jedem zweiten
 * Zurückklick ohne Anlass. Eine Rückfrage, die immer kommt, ist so nutzlos
 * wie gar keine.
 *
 * Ausgelagert und ausgeführt, damit sich das ohne die ganze Oberfläche prüfen
 * lässt.
 */
export function notarbogenGeaendert(ausgang: KaufvertragData, jetzt: KaufvertragData): boolean {
  const leer = (wert: unknown) => wert === undefined || wert === null || wert === "";
  const felder = new Set([...Object.keys(ausgang || {}), ...Object.keys(jetzt || {})]);
  for (const feld of felder) {
    const vorher = (ausgang as Record<string, unknown>)?.[feld];
    const nachher = (jetzt as Record<string, unknown>)?.[feld];
    if (leer(vorher) && leer(nachher)) continue;
    // Listen und Objekte, etwa hochgeladene Vollmachten, über ihren Inhalt.
    if (typeof vorher === "object" || typeof nachher === "object") {
      if (JSON.stringify(vorher ?? null) !== JSON.stringify(nachher ?? null)) return true;
      continue;
    }
    if (vorher !== nachher) return true;
  }
  return false;
}

/* ── helpers ── */
const formatEuro = (v: string) => {
  const num = v.replace(/\D/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("de-DE");
};
const parseEuro = (v: string) => v.replace(/\./g, "");
const parseDateStr = (s: string): Date | undefined => {
  if (!s) return undefined;
  const d = parse(s, "dd.MM.yyyy", new Date());
  return isValid(d) ? d : undefined;
};

const formatSteuerIdInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}/${digits.slice(3)}`;
  return `${digits.slice(0, 3)}/${digits.slice(3, 6)}/${digits.slice(6)}`;
};

const formatIbanInput = (raw: string): string => {
  const clean = raw.replace(/\s/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 22);
  return clean.replace(/(.{4})/g, "$1 ").trim();
};

const formatBicInput = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);

/**
 * Die Pflichtfelder des Bogens, aus dem Verzeichnis in `notarbogenFelder.ts`.
 * Früher stand die Liste hier ein zweites Mal und lief der Schrittzuordnung
 * davon, sobald irgendwo ein Feld dazukam.
 */
const REQUIRED_FIELDS: (keyof KaufvertragData)[] = NOTARBOGEN_PFLICHT_NAMEN;

function getDraftKey(investmentId?: string, kundeId?: string) {
  return `mi_kaufvertrag_draft_${kundeId || "x"}_${investmentId || "x"}`;
}

/* ── Vollmacht inline PDF/Image preview ── */
function VollmachtPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let active = true;
    supabase.storage.from("unterlagen").createSignedUrl(path, 60 * 10).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Vorschau wird geladen…</div>;
  const isImg = /\.(png|jpe?g)$/i.test(path);
  if (isImg) return <img src={url} alt="Vollmacht" className="w-full h-full object-contain bg-white" />;
  return <iframe src={url} title="Vollmacht" className="w-full h-full" />;
}

/* ── Option-Button ── */
function OptionButton({ selected, label, onClick, disabled }: { selected: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all select-none cursor-pointer min-h-[42px]",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn(
        "flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-all",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
      )}>
        {selected && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}

/**
 * Der Satz, der sagt, was ein Schritt bewirkt. Steht unter den Feldern, genau
 * wie im Objektfenster, damit erkennbar ist, wozu das Ausfüllen gut ist.
 */
function Wirkung({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}

export function KaufvertragForm({ initialData, onSave, readOnly = false, kundeName, investmentId, kundeId, onZurueck }: Props) {
  /*
   * Kundensprache Englisch: automatisch das Kennzeichen „Dolmetscher nötig“,
   * im Bogen oben und im PDF (Plan Kundensprache 4.3). Die Sprache kommt aus
   * dem Kundenprofil, die Dolmetschersprache, falls schon erfasst, aus der
   * Reservierung.
   */
  const { sprache: kundenSprachWahl } = useKundenSprache(kundeId);
  const dolmetscherSprache = (() => {
    if (!investmentId) return "";
    try {
      const rv = getInvestmentMetaField<{ dolmetscher?: boolean; dolmetscherSprache?: string }>(investmentId, "rvData", {}) || {};
      return rv.dolmetscher ? (rv.dolmetscherSprache || "") : "";
    } catch {
      return "";
    }
  })();
  const dolmetscher = dolmetscherKennzeichen(kundenSprachWahl, dolmetscherSprache);
  // Load draft if available
  const draftKey = getDraftKey(investmentId, kundeId);
  const loadDraft = (): KaufvertragData => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        // Only use draft if it has more data than initialData
        const draftFilled = Object.values(draft).filter(v => v && v !== "").length;
        const initFilled = Object.values(initialData).filter(v => v && v !== "").length;
        if (draftFilled > initFilled) return { ...initialData, ...draft };
      }
    } catch { /* ignore */ }
    return initialData;
  };

  const [data, setData] = useState<KaufvertragData>(loadDraft);
  const [schritt, setSchritt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validated, setValidated] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const vkFileRef = useRef<HTMLInputElement>(null);
  const kFileRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Wie viele Pflichtangaben schon dastanden, als der Bogen aufging.
   *
   * Einmal beim ersten Rendern festgehalten. Zählte die Zeile beim Tippen mit,
   * sagte sie nichts mehr darüber aus, was Kontakt, Selbstauskunft,
   * Reservierung und Objektauswahl von selbst mitgebracht haben.
   */
  const vorbefuellt = useRef(-1);
  if (vorbefuellt.current < 0) vorbefuellt.current = vorausgefuellt(data);

  /*
   * Der Stand, mit dem der Bogen aufgegangen ist.
   *
   * Er entsteht genau einmal, nach der Vorbefüllung und nach dem Einlesen
   * eines vorhandenen Entwurfs, und ändert sich danach nicht mehr. An ihm
   * hängt die Frage, ob der Zurückweg nachfragen muss: Nur was von diesem
   * Stand abweicht, hat jemand in dieser Sitzung selbst eingetragen. Dasselbe
   * Vorgehen wie in `ReservierungsForm.tsx`.
   */
  const ausgangsDatenRef = useRef<KaufvertragData | null>(null);
  if (ausgangsDatenRef.current === null) ausgangsDatenRef.current = { ...data };
  /*
   * Weicht der Bogen vom Ausgangsstand ab?
   *
   * Beim Zeichnen ausgerechnet, nicht in einem eigenen Zustand mitgefuehrt.
   * Der Vergleich laeuft ueber gut vierzig Felder und kostet nichts, ein
   * zweiter Zustand dagegen kann hinterherhinken, und dann faellt die
   * Rueckfrage beim ersten Klick aus.
   */
  const entwurfGeaendert = notarbogenGeaendert(ausgangsDatenRef.current, data);

  const set = (key: keyof KaufvertragData, value: any) => {
    setData(prev => ({ ...prev, [key]: value }));
    setValidated(false);
  };

  /**
   * Firma oder Privatperson wählen.
   *
   * Bei „Firma“ wird ein etwaiger Vorname wieder an den Namen gehängt und das
   * Feld geleert. Das repariert die alte Teilung am letzten Leerzeichen mit
   * genau dem Klick, der sagt, dass es eine Firma ist: Aus Vorname „Musterbau
   * Projektentwicklung“ und Name „GmbH“ wird wieder „Musterbau
   * Projektentwicklung GmbH“. Bliebe der Vorname stehen, führe der Bogen ihn
   * weiter mit und der Notar bekäme einen Vornamen für eine Gesellschaft.
   *
   * In die andere Richtung wird nichts geteilt. Wer auf „Privatperson“ stellt,
   * trägt Vorname und Nachname selbst ein.
   */
  const waehleVkArt = (art: VerkaeuferArt) => {
    setData(prev => {
      if (art !== "firma") return { ...prev, vk_art: art };
      const vorname = String(prev.vk_vorname || "").trim();
      return {
        ...prev,
        vk_art: art,
        vk_name: [vorname, String(prev.vk_name || "").trim()].filter(Boolean).join(" "),
        // Immer geleert, nicht nur wenn etwas drinstand: Eine Firma hat keinen
        // Vornamen, und das Feld ist ab jetzt nicht mehr sichtbar.
        vk_vorname: "",
      };
    });
    setValidated(false);
  };

  // Auto-save draft every 1.5 seconds after changes
  useEffect(() => {
    if (readOnly) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(data));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch { /* quota exceeded */ }
    }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [data, draftKey, readOnly]);

  const isFieldMissing = (field: keyof KaufvertragData) => {
    if (!validated) return false;
    return REQUIRED_FIELDS.includes(field) && !((data[field] as string) || "").trim();
  };

  const getMissingVollmachtUploads = (): Array<"vk" | "k"> => {
    const missing: Array<"vk" | "k"> = [];
    if (data.vk_vollmacht === "vorhanden" && !((data.vk_vollmacht_datei as string) || "").trim()) missing.push("vk");
    if (data.k_vollmacht === "vorhanden" && !((data.k_vollmacht_datei as string) || "").trim()) missing.push("k");
    return missing;
  };

  /* Was im ganzen Bogen fehlt und was in diesem Schritt fehlt. */
  const luecken = notarbogenLuecken(data);
  const lueckenHier = notarbogenLuecken(data, schritt);
  const pflichtHier = pflichtfelderImSchritt(schritt, data);
  const lueckenAndereSchritte = luecken.filter(l => l.schritt !== schritt);

  const getMissingCount = () => luecken.length + getMissingVollmachtUploads().length;

  const handleSave = async () => {
    setValidated(true);
    const missingFields = luecken.length;
    const missingVollmachten = getMissingVollmachtUploads();
    // Hard-Block nur bei fehlendem Vollmacht-Upload (sobald "vorhanden" gewählt wurde).
    if (missingVollmachten.length > 0) {
      toast({
        title: "Vollmacht-Dokument fehlt",
        description: `Bitte ${missingVollmachten.length} Vollmacht-Dokument${missingVollmachten.length === 1 ? "" : "e"} hochladen.`,
        variant: "destructive",
      });
      return;
    }
    // Hinweis bei fehlenden Pflichtfeldern – Speichern wird trotzdem zugelassen.
    if (missingFields > 0) {
      toast({
        title: `Hinweis: ${missingFields} Pflichtfeld${missingFields === 1 ? "" : "er"} offen`,
        description: "Aufnahmebogen wird gespeichert. Bitte ergänze die fehlenden Angaben so bald wie möglich.",
      });
    }
    setSaving(true);
    try {
      await onSave(data);
      // Clear draft on successful save
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  };

  const handleDraftSave = useCallback(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(data));
      toast({ title: "Zwischengespeichert ✓", description: "Der Entwurf wurde lokal gespeichert." });
    } catch {
      toast({ title: "Fehler", description: "Zwischenspeichern fehlgeschlagen.", variant: "destructive" });
    }
  }, [data, draftKey]);

  /*
   * Der Weg zurück, oben im Bogen.
   *
   * Gefragt wird nur, wenn wirklich etwas zu verlieren ist. Wer nichts
   * geändert hat, geht ohne Umweg zurück, sonst wäre die Rückfrage eine
   * Belästigung. Dieselbe Regel wie in `ReservierungsForm.tsx`.
   */
  const [verlassenDialogOffen, setVerlassenDialogOffen] = useState(false);

  const zurueckGehen = useCallback(() => {
    if (!onZurueck) return;
    if (entwurfGeaendert && !readOnly) {
      setVerlassenDialogOffen(true);
      return;
    }
    onZurueck();
  }, [onZurueck, entwurfGeaendert, readOnly]);

  /** Entwurf sichern und schließen. Abgelegt wird damit noch nichts. */
  const zwischenspeichernUndSchliessen = useCallback(() => {
    handleDraftSave();
    setVerlassenDialogOffen(false);
    onZurueck?.();
  }, [handleDraftSave, onZurueck]);

  /**
   * Die Änderungen wegwerfen und schließen.
   *
   * Der Bogen legt alle anderthalb Sekunden von selbst einen Entwurf in
   * diesem Browser ab. Ohne dessen Löschung stünden die verworfenen Angaben
   * beim nächsten Öffnen wieder da, und „Verwerfen“ wäre eine Unwahrheit.
   */
  const entwurfVerwerfenUndSchliessen = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* nichts abzuräumen */ }
    setVerlassenDialogOffen(false);
    onZurueck?.();
  }, [draftKey, onZurueck]);

  const handleDownloadPdf = async () => {
    const { generateKaufvertragPDF } = await import("@/lib/kaufvertragPdf");
    const pdf = await generateKaufvertragPDF(data, { kundenSprache: kundenSprachWahl, dolmetscherSprache });
    pdf.save(`Kaufvertrag_${kundeName?.replace(/\s+/g, "_") || "Aufnahmebogen"}.pdf`);
  };

  const handleVollmachtUpload = async (file: File, party: "vk" | "k") => {
    if (!investmentId || !kundeId) {
      toast({ title: "Upload nicht möglich", description: "Bitte speichere zuerst den Bogen.", variant: "destructive" });
      return;
    }
    const ext = file.name.split(".").pop() || "pdf";
    const filename = `Vollmacht_${party === "vk" ? "Verkaeufer" : "Kaeufer"}_${Date.now()}.${ext}`;
    const storagePath = `kaufvertrag/${kundeId}/${investmentId}/${filename}`;
    const { error } = await supabase.storage.from("unterlagen").upload(storagePath, file, { upsert: true });
    if (error) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    const key = party === "vk" ? "vk_vollmacht_datei" : "k_vollmacht_datei";
    set(key as keyof KaufvertragData, storagePath);
    toast({ title: "Vollmacht hochgeladen ✓" });
  };

  /* ── render helpers ── */
  const requiredStar = (field: keyof KaufvertragData) =>
    REQUIRED_FIELDS.includes(field) ? <span className="text-destructive ml-0.5">*</span> : null;

  /**
   * Die Zeile unter dem Feld.
   *
   * Rot, solange nach dem Speichern etwas fehlt, sonst der Hinweis, wofür die
   * Angabe gebraucht wird. Beides zugleich wären zwei Zeilen unter jedem Feld
   * und damit vierzig Zeilen im Bogen.
   */
  const renderHinweis = (missing: boolean, hinweis?: string) => {
    if (missing) return <p className="text-[10px] text-destructive mt-0.5">Pflichtfeld</p>;
    if (hinweis) return <p className="text-[10px] text-muted-foreground mt-0.5">{hinweis}</p>;
    return null;
  };

  const renderField = (label: string, field: keyof KaufvertragData, type = "text", placeholder = "", colSpan = false, hinweis?: string) => {
    const missing = isFieldMissing(field);
    return (
      <div className={colSpan ? "col-span-2" : ""} key={field}>
        <Label className="text-xs font-semibold">{label}{requiredStar(field)}</Label>
        <Input
          type={type}
          value={(data[field] as string) || ""}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          className={cn("h-9 text-sm mt-1", missing && "border-destructive ring-destructive/20 ring-2")}
          disabled={readOnly}
        />
        {renderHinweis(missing, hinweis)}
      </div>
    );
  };

  const renderSteuerIdField = (label: string, field: keyof KaufvertragData, hinweis?: string) => {
    const missing = isFieldMissing(field);
    return (
      <div key={field}>
        <Label className="text-xs font-semibold">{label}{requiredStar(field)}</Label>
        <Input
          type="text"
          inputMode="numeric"
          value={formatSteuerIdInput((data[field] as string) || "")}
          onChange={e => set(field, formatSteuerIdInput(e.target.value))}
          placeholder="XXX/XXX/XXXXX"
          className={cn("h-9 text-sm mt-1", missing && "border-destructive ring-destructive/20 ring-2")}
          disabled={readOnly}
          maxLength={13}
        />
        {renderHinweis(missing, hinweis)}
      </div>
    );
  };

  const renderPhoneField = (label: string, field: keyof KaufvertragData, hinweis?: string) => {
    const missing = isFieldMissing(field);
    return (
      <div key={field}>
        <Label className="text-xs font-semibold">{label}{requiredStar(field)}</Label>
        <div className={cn("mt-1", missing && "ring-2 ring-destructive/20 rounded-md")}>
          {readOnly ? (
            <Input value={(data[field] as string) || ""} disabled className="h-9 text-sm" />
          ) : (
            <PhoneInput value={(data[field] as string) || ""} onChange={v => set(field, v)} />
          )}
        </div>
        {renderHinweis(missing, hinweis)}
      </div>
    );
  };

  const renderDateField = (label: string, field: keyof KaufvertragData, opts?: { pastOnly?: boolean; hinweis?: string }) => {
    const val = (data[field] as string) || "";
    const date = parseDateStr(val);
    const missing = isFieldMissing(field);
    return (
      <div key={field}>
        <Label className="text-xs font-semibold">{label}{requiredStar(field)}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={readOnly}
              className={cn("w-full h-9 text-sm mt-1 justify-start text-left font-normal", !val && "text-muted-foreground", missing && "border-destructive ring-destructive/20 ring-2")}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {val || "TT.MM.JJJJ"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-50" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={d => { if (d) set(field, format(d, "dd.MM.yyyy")); }}
              locale={de}
              initialFocus
              captionLayout="dropdown-buttons"
              fromYear={opts?.pastOnly ? 1920 : 1920}
              toYear={opts?.pastOnly ? new Date().getFullYear() : new Date().getFullYear() + 10}
              defaultMonth={date || (opts?.pastOnly ? new Date(1990, 0) : new Date())}
              disabled={opts?.pastOnly ? (d) => d > new Date() : undefined}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {renderHinweis(missing, opts?.hinweis)}
      </div>
    );
  };

  const renderEuroField = (label: string, field: keyof KaufvertragData, placeholder = "", colSpan = false, hinweis?: string) => {
    const raw = (data[field] as string) || "";
    const missing = isFieldMissing(field);
    return (
      <div className={colSpan ? "col-span-2" : ""} key={field}>
        <Label className="text-xs font-semibold">{label}{requiredStar(field)}</Label>
        <div className="relative mt-1">
          <Input
            type="text"
            inputMode="numeric"
            value={formatEuro(raw)}
            onChange={e => set(field, parseEuro(e.target.value))}
            placeholder={placeholder}
            className={cn("h-9 text-sm pr-8", missing && "border-destructive ring-destructive/20 ring-2")}
            disabled={readOnly}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
        </div>
        {renderHinweis(missing, hinweis)}
      </div>
    );
  };

  const renderVollmachtSection = (party: "vk" | "k") => {
    const vollmachtKey = party === "vk" ? "vk_vollmacht" : "k_vollmacht";
    const dateiKey = party === "vk" ? "vk_vollmacht_datei" : "k_vollmacht_datei";
    const fileRef = party === "vk" ? vkFileRef : kFileRef;
    const vollmachtValue = data[vollmachtKey];
    const dateiValue = data[dateiKey];
    const uploadMissing = validated && vollmachtValue === "vorhanden" && !((dateiValue as string) || "").trim();

    return (
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs font-semibold text-muted-foreground mb-3">Evtl. vertreten durch</p>
        <div className="flex flex-wrap gap-3">
          <OptionButton
            selected={vollmachtValue === "vorhanden"}
            label="Vollmacht vorhanden"
            onClick={() => set(vollmachtKey as keyof KaufvertragData, vollmachtValue === "vorhanden" ? "" : "vorhanden")}
            disabled={readOnly}
          />
          <OptionButton
            selected={vollmachtValue === "nicht_vorhanden"}
            label="Vollmacht nicht vorhanden"
            onClick={() => set(vollmachtKey as keyof KaufvertragData, vollmachtValue === "nicht_vorhanden" ? "" : "nicht_vorhanden")}
            disabled={readOnly}
          />
        </div>
        {vollmachtValue === "vorhanden" && (
          <div className={cn("mt-3 rounded-md", uploadMissing && "border border-destructive bg-destructive/5 p-2")}>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleVollmachtUpload(file, party);
                }}
              />
              {dateiValue ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    onClick={async () => {
                      try {
                        const { data: signed } = await supabase.storage
                          .from("unterlagen")
                          .createSignedUrl(dateiValue as string, 60 * 10);
                        if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
                      } catch (e) {
                        toast({ title: "Fehler", description: "Datei konnte nicht geöffnet werden.", variant: "destructive" });
                      }
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" /> Vollmacht anzeigen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    onClick={() => fileRef.current?.click()}
                    disabled={readOnly}
                  >
                    <Upload className="h-3.5 w-3.5" /> Vollmacht erneut hochladen
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant={uploadMissing ? "destructive" : "outline"}
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  onClick={() => fileRef.current?.click()}
                  disabled={readOnly}
                >
                  <Upload className="h-3.5 w-3.5" /> Vollmacht hochladen *
                </Button>
              )}
            </div>
            {dateiValue && (
              <div className="mt-2 rounded-md border bg-muted/30 overflow-hidden" style={{ height: 360 }}>
                <VollmachtPreview path={dateiValue as string} />
              </div>
            )}
            {uploadMissing && (
              <p className="text-[10px] text-destructive mt-1">Pflicht: Bitte Vollmacht-Dokument hochladen.</p>
            )}
            {!dateiValue && !uploadMissing && (
              <p className="text-[10px] text-muted-foreground mt-1">Pflicht-Upload, sobald „Vollmacht vorhanden" ausgewählt ist.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── Schritt 1: wer verkauft ── */
  const vkArt = (data.vk_art as VerkaeuferArt | "" | undefined) || "";
  const schritt1 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Personalien des Verkäufers</h4>

        {/*
          Zuerst die Wahl, dann die Felder.

          Vorher stand hier ein Feld „Name“ und daneben eines für den Vornamen.
          Bei einem Bauträger gab es keinen Vornamen, also wurde der Firmenname
          am letzten Leerzeichen geteilt, und im Bogen stand Nachname „GmbH“.
          Jetzt wird gewählt, bevor jemand tippt.
        */}
        <div className="mb-4">
          <Label className="text-xs font-semibold">
            Wer verkauft?{requiredStar("vk_art")}
          </Label>
          <div className="flex flex-wrap gap-3 mt-1.5">
            <OptionButton
              selected={vkArt === "firma"}
              label="Firma"
              onClick={() => waehleVkArt("firma")}
              disabled={readOnly}
            />
            <OptionButton
              selected={vkArt === "person"}
              label="Privatperson"
              onClick={() => waehleVkArt("person")}
              disabled={readOnly}
            />
          </div>
          {renderHinweis(
            isFieldMissing("vk_art"),
            vkArt === "firma"
              ? "Der Firmenname steht vollständig in einem Feld und wird nicht geteilt."
              : vkArt === "person"
                ? "Vorname und Nachname stehen getrennt, so wie der Notar sie braucht."
                : "Bei Bauträgern ist die Firma der Regelfall. Ein privater Verkäufer bekommt Vor- und Nachnamen getrennt.",
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {vkArt === "firma"
            ? renderField("Firma", "vk_name", "text", "Firmierung laut Handelsregister", true, "Vertragspartei im Kaufvertrag")
            : (
              <>
                {renderField(verkaeuferNameLabel(vkArt), "vk_name", "text", "Nachname des Verkäufers", false, "Vertragspartei im Kaufvertrag")}
                {renderField("Vorname", "vk_vorname", "text", "Vorname des Verkäufers", false, vkArt === "person" ? "Vertragspartei im Kaufvertrag" : "Bei einer Gesellschaft der vertretende Geschäftsführer")}
              </>
            )}
          {renderDateField("Geburtsdatum", "vk_geburtsdatum", { pastOnly: true, hinweis: "Der Notar weist die Person damit aus" })}
          {renderField("Geburtsname", "vk_geburtsname", "text", "Falls abweichend", false, "Freiwillig, nur falls abweichend")}
          {renderField("Anschrift", "vk_anschrift", "text", "Straße Nr., PLZ Ort", true, "Ladungsanschrift des Notariats")}
          {renderPhoneField("Telefon", "vk_telefon", "Rückfragen des Notariats zur Beurkundung")}
          {renderField("E-Mail", "vk_email", "email", "E-Mail-Adresse", false, "Der Vertragsentwurf geht per E-Mail hinaus")}
          {renderField("HRB", "vk_hrb", "text", "Handelsregisternummer", false, "Bei einer Gesellschaft prüft der Notar die Vertretung")}
        </div>
        {renderVollmachtSection("vk")}
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Herkunft:</span> Diese Angaben kommen aus
        Schritt 3 der Objektauswahl und aus der Objekteinreichung. Was dort steht, steht hier schon.
        Was hier ergänzt wird, bleibt am Bogen und wandert nicht in die Objektauswahl zurück.
      </Wirkung>
    </div>
  );

  /* ── Schritt 2: wer kauft ── */
  const schritt2 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Personalien des Käufers</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Name", "k_name", "text", "Nachname des Käufers", false, "Vertragspartei im Kaufvertrag")}
          {renderField("Vorname", "k_vorname", "text", "Vorname des Käufers", false, "Vertragspartei im Kaufvertrag")}
          {renderDateField("Geburtsdatum", "k_geburtsdatum", { pastOnly: true, hinweis: "Der Notar weist die Person damit aus" })}
          {renderField("Geburtsname", "k_geburtsname", "text", "Falls abweichend", false, "Freiwillig, nur falls abweichend")}
          {renderField("Anschrift", "k_anschrift", "text", "Straße Nr., PLZ Ort", true, "Ladungsanschrift des Notariats")}
          {renderPhoneField("Telefon", "k_telefon", "Rückfragen des Notariats zum Termin")}
          {renderField("E-Mail", "k_email", "email", "E-Mail-Adresse", false, "Der Vertragsentwurf geht per E-Mail hinaus")}
          {renderSteuerIdField("Steuer-ID", "k_steuerid", "Das Finanzamt braucht sie für die Grunderwerbsteuer")}
        </div>
        {renderVollmachtSection("k")}
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Herkunft:</span> Name, Anschrift und
        Kontaktdaten kommen aus dem Kontakt, das Geburtsdatum aus der Selbstauskunft. Die Steuer-ID
        ebenfalls, falls sie dort ausgefüllt wurde, denn dort ist sie freiwillig. Seit dem
        22.09.2026 fragt die Reservierungsvereinbarung sie nicht mehr ab, hier ist also oft der
        erste Ort, an dem sie eingetragen wird. Ein zweiter Käufer wird im Bogen nicht abgefragt und
        gehört unter „Sonstige Notizen“ im letzten Schritt.
      </Wirkung>
    </div>
  );

  /* ── Schritt 3: um welche Wohnung es geht ── */
  const schritt3 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Vertragsobjekt</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Amtsgericht", "amtsgericht", "text", "Zuständiges Amtsgericht", false, "Aus dem Grundbuchauszug")}
          {renderField("Gemarkung", "gemarkung", "text", "Gemarkung", false, "Aus dem Grundbuchauszug")}
          {renderField("Blatt", "blatt", "text", "Grundbuchblatt", false, "Aus dem Grundbuchauszug")}
          {renderField("Fl. Nr.", "flnr", "text", "Flurstücknummer", false, "Aus dem Grundbuchauszug")}
          {renderField("Adresse", "obj_adresse", "text", "Straße Nr., PLZ Ort", true, "Bezeichnung des Vertragsobjekts")}
          {/*
            Welche Wohnung im Haus.

            Die Adresse darüber benennt nur das Haus. Ohne diese beiden Zeilen
            wusste der Notar nicht, um welche der Wohnungen darin es geht.

            Zwei Felder, weil es zwei Angaben sind: Die Wohneinheit ist die
            Nummer, unter der die Wohnung im Haus geführt wird. Die
            Wohnungsnummer laut Teilungserklärung stammt aus der notariellen
            Urkunde, kann davon abweichen und ist die maßgebliche. Deshalb ist
            nur die zweite Pflicht.
          */}
          {/*
            Beim ganzen Haus (Globalobjekt) gibt es keine Wohnung darin. Statt
            der beiden Felder steht dann der Kaufgegenstand, so wie in der
            Reservierungsvereinbarung.
          */}
          {data.obj_gesamtobjekt ? (
            <div className="col-span-2">
              <Label className="text-xs font-semibold">Kaufgegenstand</Label>
              <p className="mt-1 text-sm">{KAUFGEGENSTAND_GESAMTOBJEKT}</p>
            </div>
          ) : (<>
          {renderField("Wohneinheit", "obj_wohneinheit", "text", "z.B. 6", false, "Nummer der Wohnung im Haus, aus Schritt 1 der Objektauswahl")}
          {renderField("Wohnungsnummer laut Teilungserklärung", "obj_wohnungsnummer", "text", "z.B. Nr. 6", false, "Die rechtlich maßgebliche Bezeichnung, aus Schritt 4 der Objektauswahl")}
          </>)}
          <div>
            <Label className="text-xs font-semibold">Bebauung{requiredStar("obj_bebauung")}</Label>
            <Select value={data.obj_bebauung || ""} onValueChange={v => set("obj_bebauung", v)} disabled={readOnly}>
              <SelectTrigger className={cn("h-9 text-sm mt-1", isFieldMissing("obj_bebauung") && "border-destructive ring-destructive/20 ring-2")}><SelectValue placeholder="Auswählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Unbebaut">Unbebaut</SelectItem>
                <SelectItem value="Einfamilienhaus">Einfamilienhaus</SelectItem>
                <SelectItem value="Doppelhaushälfte">Doppelhaushälfte</SelectItem>
                <SelectItem value="Mehrfamilienhaus">Mehrfamilienhaus</SelectItem>
              </SelectContent>
            </Select>
            {renderHinweis(isFieldMissing("obj_bebauung"), "Steht als Ankreuzfeld im PDF")}
          </div>
          {renderEuroField("Kaufpreis", "kaufpreis", "z.B. 250.000", false, "Geschäftswert für Notarkosten und Grunderwerbsteuer")}
        </div>
        <div className="mt-3 p-3 bg-muted/50 rounded-md border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold">Hinweis zu den Erschließungskosten für die Beteiligten:</span>{" "}
            Da die Gemeinde unabhängig von den im Kauf getroffenen Vereinbarungen beim jeweiligen Eigentümer Erschließungsbeiträge anfordert, hat der Notar den Beteiligten geraten, sich vor Beurkundung bei der Gemeinde entsprechend zu informieren.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Besitz | Nutzen | Lastenübergang</h4>
        <div className="flex flex-wrap gap-3">
          <OptionButton
            selected={data.vermietet === true}
            label="Vermietet"
            onClick={() => set("vermietet", data.vermietet === true ? undefined : true)}
            disabled={readOnly}
          />
          <OptionButton
            selected={data.vermietet === false}
            label="Nicht vermietet"
            onClick={() => set("vermietet", data.vermietet === false ? undefined : false)}
            disabled={readOnly}
          />
        </div>
        <div className="mt-3 p-3 bg-muted/50 rounded-md border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Falls das Objekt vermietet ist folgender Hinweis an den Verkäufer: Der Verkäufer sollte sich vom Mieter wegen der dem Käufer ausgehändigten Kaution eine Erklärung geben lassen.
          </p>
        </div>
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Herkunft:</span> Adresse, Wohneinheit und
        Kaufpreis kommen aus Schritt 1 der Objektauswahl, die vier Grundbuchangaben und die
        Wohnungsnummer laut Teilungserklärung aus deren Schritt 4. Wer sie dort einträgt, sobald der
        Grundbuchauszug vorliegt, hat diesen Schritt schon erledigt.
      </Wirkung>
    </div>
  );

  /* ── Schritt 4: wohin das Geld geht und wovon abgelöst wird ── */
  const schritt4 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Bankverbindung des Verkäufers</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Name", "bank_name", "text", "Kontoinhaber", false, "Wohin der Kaufpreis überwiesen wird")}
          {renderField("Bank", "bank_institut", "text", "Kreditinstitut", false, "Wohin der Kaufpreis überwiesen wird")}
          {(() => {
            const missing = isFieldMissing("bank_iban");
            return (
              <div key="bank_iban">
                <Label className="text-xs font-semibold">IBAN{requiredStar("bank_iban")}</Label>
                <Input
                  type="text"
                  value={formatIbanInput((data.bank_iban as string) || "")}
                  onChange={e => set("bank_iban", formatIbanInput(e.target.value))}
                  placeholder="DE00 0000 0000 0000 0000 00"
                  className={cn("h-9 text-sm mt-1 uppercase tracking-wider", missing && "border-destructive ring-destructive/20 ring-2")}
                  disabled={readOnly}
                  maxLength={27}
                />
                {renderHinweis(missing, "Ohne IBAN keine Kaufpreisfälligkeit")}
              </div>
            );
          })()}
          {(() => {
            const missing = isFieldMissing("bank_bic");
            return (
              <div key="bank_bic">
                <Label className="text-xs font-semibold">BIC{requiredStar("bank_bic")}</Label>
                <Input
                  type="text"
                  value={formatBicInput((data.bank_bic as string) || "")}
                  onChange={e => set("bank_bic", formatBicInput(e.target.value))}
                  placeholder="COBADEFFXXX"
                  className={cn("h-9 text-sm mt-1 uppercase tracking-wider", missing && "border-destructive ring-destructive/20 ring-2")}
                  disabled={readOnly}
                  maxLength={11}
                />
                {renderHinweis(missing, "Gehört zur Zahlungsanweisung im Vertrag")}
              </div>
            );
          })()}
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Abzulösende Bank</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Aktenzeichen", "bank_aktenzeichen", "text", "Aktenzeichen der Bank", false, "Die alte Grundschuld muss gelöscht werden")}
          {renderField("Anschrift", "bank_abloesend_anschrift", "text", "Bankadresse", false, "Dorthin geht die Anforderung der Löschungsbewilligung")}
        </div>
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Wer weiß das:</span> Beide Angaben kommen vom
        Verkäufer, nicht aus dem CRM. Die IBAN steht bei einer selbst eingereichten Wohnung in der
        Objekteinreichung und wird dann übernommen. Ist die Wohnung lastenfrei, gibt es keine
        abzulösende Bank. Dann bleiben die beiden Felder leer, und der Bogen wird trotzdem
        gespeichert.
      </Wirkung>
    </div>
  );

  /* ── Schritt 5: was zum Kaufpreis dazukommt oder davon abgeht ── */
  const schritt5 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Instandhaltungsrücklage</h4>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Die Höhe der zum (Datum) vorhandenen Instandhaltungsrücklage beträgt insgesamt €.
          Die auf das Vertragsobjekt entfallende Rücklage beträgt anteilig:
        </p>
        <div className="grid grid-cols-2 gap-3">
          {renderDateField("Datum", "ruecklage_datum", { hinweis: "Zu welchem Tag der Betrag gilt" })}
          {renderEuroField("Rücklage gesamt", "ruecklage_gesamt", "Gesamtbetrag", false, "Aus der Abrechnung der Hausverwaltung")}
          {renderEuroField("Anteilig", "ruecklage_anteilig", "Anteiliger Betrag", false, "Dieser Teil mindert die Grunderwerbsteuer")}
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Inventar</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold">Wird mitverkauft?</Label>
            <Select value={data.inventar_mitverkauft || ""} onValueChange={v => set("inventar_mitverkauft", v)} disabled={readOnly}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Auswählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ja">Ja</SelectItem>
                <SelectItem value="nein">Nein</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-0.5">Freiwillig. Ohne Inventar bleibt der Block leer.</p>
          </div>
          {renderEuroField("Angesetzter Kaufpreis", "inventar_kaufpreis", "z.B. 5.000", false, "Mindert die Grunderwerbsteuer, wenn er im Vertrag steht")}
          <div className="col-span-2">
            <Label className="text-xs font-semibold">Auflistung</Label>
            <Textarea value={data.inventar_auflistung || ""} onChange={e => set("inventar_auflistung", e.target.value)} className="text-sm mt-1" rows={2} disabled={readOnly} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Einbauküche, Möbel, Markise. Ohne Auflistung erkennt das Finanzamt den Abzug nicht an.</p>
          </div>
        </div>
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Wer weiß das:</span> Die Rücklage steht in der
        Abrechnung der Hausverwaltung, das Inventar wird zwischen Käufer und Verkäufer vereinbart.
        Beides mindert die Bemessungsgrundlage der Grunderwerbsteuer, deshalb sind die drei
        Rücklagenfelder Pflicht und das Inventar freiwillig.
      </Wirkung>
    </div>
  );

  /* ── Schritt 6: wer sonst noch beteiligt ist ── */
  const schritt6 = (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Vermittlerangaben</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Firmierung", "makler_name", "text", "z.B. MOREImmo", false, "Vermittlernachweis im Kaufvertrag")}
          {renderField("Anschrift", "makler_anschrift", "text", "Straße Nr., PLZ Ort", true, "Steht bereits voreingetragen")}
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Hausverwaltung</h4>
        <div className="grid grid-cols-2 gap-3">
          {renderField("Name", "hv_name", "text", "Name der Hausverwaltung", false, "Der Notar holt dort die Verwalterzustimmung ein")}
          {renderField("Anschrift", "hv_anschrift", "text", "Straße Nr., PLZ Ort", false, "Ohne Anschrift keine Zustimmung, ohne Zustimmung kein Eigentumsübergang")}
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 text-primary">Sonstige Notizen</h4>
        <Textarea value={data.sonstige_notizen || ""} onChange={e => set("sonstige_notizen", e.target.value)} className="text-sm" rows={5} disabled={readOnly} />
        <p className="text-[11px] text-muted-foreground mt-2">
          Alles, wofür der Bogen kein Feld hat: ein zweiter Käufer, ein Wunschtermin, eine
          Besonderheit im Objekt. Steht als eigene Seite im PDF.
        </p>
      </Card>

      <Wirkung>
        <span className="font-semibold text-foreground">Fast fertig:</span> Vermittler und Anschrift
        sind voreingetragen, die Hausverwaltung kommt aus der Objekteinreichung. Mit „Speichern und
        PDF erstellen“ wird der Bogen abgelegt und das PDF erzeugt, auch wenn noch Angaben fehlen.
      </Wirkung>
    </div>
  );

  const inhalte = [schritt1, schritt2, schritt3, schritt4, schritt5, schritt6];
  const letzter = schritt === NOTARBOGEN_SCHRITTE.length - 1;

  return (
    /*
      Die Höhenaufteilung ist von der Selbstauskunft übernommen
      (`SelbstauskunftForm.tsx`, dort ausführlich begründet):

        aussen ein Rahmen über die volle Höhe,
        darin die Karte als einziger Scrollbereich,
        darunter die Knopfleiste.

      `min-h-0` ist nötig, damit die Karte im Flex-Rahmen schrumpfen darf.
      Ohne das wächst sie über den Bildschirm hinaus, der Scrollbereich landet
      wieder aussen und die Leiste wandert beim Scrollen mit.

      `h-full` setzt voraus, dass der Elternbereich eine feste Höhe hat. Die
      gibt in `KundenDetail.tsx` die Vollbildschicht vor, in der der Bogen
      geöffnet wird.
    */
    <div className="apple-form flex h-full min-h-0 flex-col">
      {/*
        Der Zurückweg, oben und vor dem Formular.

        Genau wie bei der Reservierungsvereinbarung: Der Bogen geht im selben
        Reiter auf, es gibt also kein Fenster zum Zuklappen. `shrink-0` hält
        die Zeile aus der Höhenrechnung heraus, damit weiter nur die Karte
        scrollt.
      */}
      {onZurueck && (
        <div className="mb-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={zurueckGehen}
            className="-ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zum Kundenprofil
          </Button>
        </div>
      )}
      <Card className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        {/* Fortschrittsleiste mit Sprungmarken, wie im Objektfenster */}
        <FormProgress
          eyebrow="Aufnahmebogen Notar"
          steps={NOTARBOGEN_SCHRITTE}
          current={schritt}
          onJump={setSchritt}
        />

        <div className="px-4 sm:px-6 pt-4 space-y-3">
          {dolmetscher && (
            <div
              data-testid="dolmetscher-kennzeichen"
              className="flex items-start gap-2 rounded-md border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 px-3 py-2 text-sm"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
              <div>
                <p className="font-semibold">{dolmetscher.titel}</p>
                <p className="text-muted-foreground">{dolmetscher.text}</p>
              </div>
            </div>
          )}
          {/*
            Was der Bogen von selbst mitgebracht hat.

            Ohne diese Zeile sieht der Bearbeiter nur die Lücken und hält den
            Bogen für unausgefüllt, obwohl Kontakt, Selbstauskunft, Reservierung
            und Objektauswahl den größten Teil bereits geliefert haben.
          */}
          <p className="text-[11px] text-muted-foreground">
            {vorbefuellt.current} von {pflichtfelderGesamt(data)} Pflichtangaben standen beim
            Öffnen schon da, übernommen aus Kontakt, Selbstauskunft, Reservierung und Objektauswahl.
            {draftSaved && !readOnly && (
              <span className="ml-2 inline-flex items-center gap-1">
                <BookmarkCheck className="h-3 w-3" /> Automatisch zwischengespeichert
              </span>
            )}
          </p>

          {/* Nach einem Speicherversuch: der Gesamtstand in einer Zeile */}
          {validated && getMissingCount() > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">
                {getMissingCount()} Pflichtfeld{getMissingCount() > 1 ? "er" : ""} nicht ausgefüllt. Die rot markierten Felder fehlen noch.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6">{inhalte[schritt]}</div>

        {/*
          Der Kasten mit dem, was offen ist.

          Erst die Lücken dieses Schritts, ausführlich und mit Grund, dann in
          einer Zeile, was in den anderen Schritten noch fehlt. Wer liest, dass
          ohne IBAN keine Kaufpreisfälligkeit möglich ist, ruft beim Verkäufer
          an. Wer nur ein rotes Sternchen sieht, tippt irgendetwas.
        */}
        <div className="px-4 sm:px-6 pb-4 space-y-2">
          {lueckenHier.length > 0 ? (
            <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-[11px]">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
                Noch offen: {lueckenHier.length} von {pflichtHier.length} Angaben in diesem Schritt
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {lueckenHier.map(l => (
                  <li key={l.feld}>
                    <span className="font-medium text-foreground">{l.label}</span> · {l.wofuer}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                Speichern geht trotzdem. Was hier fehlt, fehlt im PDF und muss vor dem Notartermin
                nachgetragen werden.
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Vollständig:</span> In diesem Schritt
              ist alles eingetragen, was der Notar braucht.
            </p>
          )}

          {lueckenAndereSchritte.length > 0 && (
            <p className="rounded-md border px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-[hsl(var(--warning))]" />
              <span>
                <span className="font-semibold text-foreground">In anderen Schritten offen:</span>{" "}
                {[...new Set(lueckenAndereSchritte.map(l => l.schritt))]
                  .sort((a, b) => a - b)
                  .map(s => `${NOTARBOGEN_SCHRITTE[s]} (${lueckenAndereSchritte.filter(l => l.schritt === s).length})`)
                  .join(", ")}
                .{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setSchritt(lueckenAndereSchritte[0].schritt)}
                >
                  Zur ersten Lücke
                </button>
              </span>
            </p>
          )}
        </div>

      </Card>

      {/*
        Die Knopfleiste am unteren Rand, wie in der Selbstauskunft.

        Sie steht bewusst ausserhalb der Karte: Die Karte ist der Scrollbereich,
        und darin kann ein Element nicht am unteren Bildschirmrand kleben
        bleiben. Zusammen mit der Höhenkette oben (`h-full` am Rahmen, `flex-1`
        an der Karte, `shrink-0` hier) steht sie immer unten, unabhängig davon,
        wie lang der einzelne Schritt ist.
      */}
      <div className="z-30 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div>
          {schritt > 0 && (
            <Button variant="ghost" onClick={() => setSchritt(s => s - 1)} disabled={saving}>
              Zurück
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!readOnly && (
            <Button variant="outline" onClick={handleDraftSave} className="gap-2" disabled={saving}>
              <BookmarkCheck className="h-4 w-4" /> Zwischenspeichern
            </Button>
          )}
          {!readOnly && !letzter && (
            <Button variant="outline" onClick={handleSave} className="gap-2" disabled={saving}>
              <Save className="h-4 w-4" /> Speichern und später ergänzen
            </Button>
          )}
          {letzter ? (
            <>
              {!readOnly && (
                <Button variant="outline" onClick={handleDownloadPdf} className="gap-2" disabled={saving}>
                  <Download className="h-4 w-4" /> PDF herunterladen
                </Button>
              )}
              {!readOnly && (
                <Button onClick={handleSave} className="gap-2" disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? "Wird gespeichert…" : "Speichern und PDF erstellen"}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => setSchritt(s => s + 1)} disabled={saving}>Weiter</Button>
          )}
        </div>
      </div>

      {/*
        Die Rückfrage vor dem Verlassen, im Stil des Projekts.

        Ein Browser-Fenster (`confirm`) ist hier ausdrücklich verboten. Drei
        Knöpfe statt der zwei aus `confirmDialog`, weil es drei ehrliche
        Antworten gibt: bleiben, behalten, wegwerfen. Bei zwei Knöpfen fiele
        eine davon weg, und die Escape-Taste träfe eine Entscheidung, die der
        Nutzer nicht getroffen hat. Aufbau und Wortwahl wie im
        Verlassen-Dialog der Selbstauskunft (`SelbstauskunftPage.tsx`).
      */}
      <AlertDialog open={verlassenDialogOffen} onOpenChange={setVerlassenDialogOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--warning))]" />
              Aufnahmebogen verlassen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Du hast Angaben geändert, die noch nicht abgelegt sind.
              Zwischenspeichern legt den Entwurf in diesem Browser ab, er steht
              beim nächsten Öffnen wieder da. Ans Notariat geht dabei nichts,
              das macht erst „Speichern und PDF erstellen“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogCancel className="mt-0 w-full">Weiter ausfüllen</AlertDialogCancel>
            <Button variant="outline" className="w-full gap-2" onClick={zwischenspeichernUndSchliessen}>
              <BookmarkCheck className="h-4 w-4" /> Zwischenspeichern und schließen
            </Button>
            <AlertDialogAction
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={entwurfVerwerfenUndSchliessen}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
