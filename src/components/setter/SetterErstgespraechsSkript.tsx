import { Fragment, useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, type ReactNode } from "react";
import { EinwandSchnellhilfeKompakt } from "@/components/einwaende/EinwandSchnellhilfe";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Loader2, Save, CalendarClock, PhoneForwarded, Check, ChevronDown, ChevronUp, ArrowRightLeft } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { updateKontakt, mergeKontaktMeta, type KundeData } from "@/lib/kundenStore";
import { useUser } from "@/contexts/UserContext";
import { setInvestmentMetaFields, getInvestmentMetaField } from "@/lib/investmentsStore";
import type { DetailFeld, DetailSchritt, ZusammenfassungSchritt } from "@/lib/erstgespraechZusammenfassung";

/*
 * Erstgesprächsskript im Investment, Fassung nach dem Entwurf vom 15.10.2026:
 * 23 Schritte in 6 Phasen (A Einstieg bis F Abschluss), Wortlaut in der
 * Du-Form, und nur in dieser (Entscheidung Christian, 16.10.2026: „bitte immer
 * und überall duzen“). Grundlage ist das Gesprächsskript
 * aus dem Vertriebspaket im Google Drive, angepasst an den Ablauf
 * Erstgespräch → Beratungspräsentation → Selbstauskunft am Ende der
 * Präsentation. Die Selbstauskunft kommt hier deshalb nicht vor.
 *
 * Gespeichert wird wie bisher in investment.meta.setterSkript (antworten,
 * notizen, ziele, erledigt, anrede). `anrede` bleibt für Altdaten im
 * Snapshot und wird immer als "du" gespeichert. Bestehende Schlüssel behalten Ort und
 * Namen; neu sind nur zusätzliche Antwortfelder (siehe NEUE_FELDER).
 */

interface Props {
  kunde: KundeData;
  onUpdate: () => void;
  /** Optional Callback wenn KI-Zusammenfassung erzeugt wurde (für übergeordnete UI). */
  onSummaryGenerated?: (summary: string) => void;
  /** Slot, der im Schritt „Termin für die Beratungspräsentation“ gerendert wird. */
  terminSlot?: ReactNode;
  /** Slot, der unter den Schritten gerendert wird (Abschluss-Karte). */
  abschlussSlot?: ReactNode;
  /** Callback für „Rückruf vereinbaren“ in Schritt 1 (Folgetermin-Dialog wie beim Gesprächsausgang). */
  onFollowUp?: () => void;
  /**
   * Callback, wenn der Lead jetzt keine Zeit hat (Datum + Uhrzeit). Wird von
   * KundenDetail übergeben, das Skript selbst ruft ihn derzeit nicht auf.
   */
  onErstgespraechFollowUp?: (datum: string, uhrzeit: string) => void;
  /**
   * Modus: "setter" = Setterin qualifiziert für Vertriebspartner (Default).
   * "vertriebspartner" = VP ruft selbst an, qualifiziert und terminiert für sich selbst.
   */
  mode?: "setter" | "vertriebspartner";
  /**
   * Investment-Scoping: Wenn gesetzt, lädt + persistiert das Skript per Investment
   * (investment.meta.setterSkript / gespraechsnotizenAI), nicht am Kontakt.
   * Für das ERSTE Investment (isFirstInvestment) wird beim ersten Lesen auf
   * kunde.meta.setterSkript zurückgefallen (Legacy-Migration). */
  investmentId?: string;
  isFirstInvestment?: boolean;
}

export interface SetterErstgespraechsSkriptHandle {
  /** KI-Zusammenfassung jetzt erzeugen (z. B. beim Klick auf "Erstgespräch gebucht & Lead zuweisen"). */
  generateAiSummary: () => Promise<void>;
  /** Gibt true zurück, wenn mindestens 1 Antwort/Notiz vorhanden ist. */
  hasInput: () => boolean;
  /** Erzwingt sofortiges Persistieren der aktuellen Skript-Daten. */
  persistNow: () => Promise<void>;
  /** Der aktuelle Skriptstand, etwa für die lokale Vorschau der Präsentation. */
  stand: () => SkriptDaten;
}


/**
 * Lokal kontrollierter Input für Qualifizierungs-Felder (qualEinkommen / qualEigenkapital).
 * Vermeidet einen Race-Condition-Bug beim schnellen Tippen: updateKontakt() schreibt
 * asynchron in den Cache; der nächste Keystroke konnte den vorherigen überschreiben, sodass
 * Zeichen verschluckt/vertauscht wurden. Hier halten wir den Wert lokal, schreiben debounced
 * in den Store und übernehmen externe Updates nur, wenn das Feld nicht fokussiert ist.
 */
function QualSyncInput({
  kundeId,
  field,
  initialValue,
  placeholder,
  onUpdate,
  className,
}: {
  kundeId: string;
  field: "qualEinkommen" | "qualEigenkapital";
  initialValue: string;
  placeholder: string;
  onUpdate: () => void;
  /** Zusaetzliche Klassen, hier fuer die orange Pflichtfeld-Umrandung. */
  className?: string;
}) {
  const [local, setLocal] = useState<string>(initialValue || "");
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setLocal(initialValue || "");
  }, [initialValue]);

  const flush = useCallback((value: string) => {
    updateKontakt(kundeId, { [field]: value } as any);
    onUpdate();
  }, [kundeId, field, onUpdate]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={local}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        flush(local);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(v), 300);
      }}
      placeholder={placeholder}
      className={`mt-1 ${className ?? ""}`}
    />
  );
}

/**
 * Pflichtangaben: Beruf, Ziele und Schwerpunkt, Netto, Brutto, laufende
 * Raten, Reserve und Eigenkapital. Ohne sie lässt sich in der
 * Beratungspräsentation nicht mit echten Zahlen rechnen.
 *
 * Sie blockieren bewusst nichts. Ein Skript, das ein laufendes Telefonat
 * anhält, wird umgangen statt ausgefüllt. Sie sind nur sichtbar markiert,
 * orange umrandet und am Etikett benannt. Die Farbe allein trägt die
 * Information nicht: Daneben steht das Wort „Pflichtangabe“.
 */
const PFLICHT_RAHMEN = "border-[hsl(var(--warning))] focus-visible:ring-[hsl(var(--warning))]";

function Pflichtmarke({ gefuellt }: { gefuellt: boolean }) {
  return (
    <span className="ml-1 text-[10px] font-semibold text-[hsl(var(--warning))]">
      {gefuellt ? "Pflichtangabe ✓" : "Pflichtangabe"}
    </span>
  );
}

/**
 * Die Antworten, die das CRM aus dem Skript heraus weiterverwendet, und
 * wohin. Wer mit einem eigenen Skript telefoniert, soll auf einen Blick
 * sehen, wo er diese Angaben eintragen muss.
 *
 * Aufgenommen ist nur, was das Skript verlässt: in ein Feld des Kontakts
 * geschrieben oder von einer anderen Seite gezielt gelesen. Die
 * Zusammenfassungen zählen nicht, denn die lesen jede Antwort.
 *
 * Quellen, falls sich etwas ändert:
 *   qualEinkommen, qualEigenkapital, beruf (qualBeruflicheSituation),
 *   ziele (qualZiel): Qualifizierung im Kundenprofil und Lead-Verwaltung.
 *   Beratungspräsentation (uebernahmeAusSkript in beratungOsDaten.ts):
 *   qualEinkommen, qualEigenkapital, investitionMonat, erfahrung, ziele,
 *   schwerpunkt, motivWoertlich, mitentscheider, wunschNetto, renteErwartet,
 *   ruhestandAb, reserve, grenzeStress, sorgen, offeneFragen.
 */
export const UEBERNAHME_ZIELE: Record<string, string> = {
  motivWoertlich: "Zitat auf der Seite „Deine Ziele“ der Beratungspräsentation",
  mitentscheider: "„Dein Rahmen“ in der Beratungspräsentation",
  beruf: "Berufliche Situation in der Qualifizierung im Kundenprofil und in der Lead-Verwaltung",
  ziele: "Ziel in der Qualifizierung im Kundenprofil, Pipeline, Lead-Verwaltung und Beratungspräsentation",
  schwerpunkt: "Konzeptschalter der Beratungspräsentation (Zusatzrente oder Steuerersparnis)",
  ruhestandAb: "Rentenlücke in der Beratungspräsentation",
  renteErwartet: "Rentenlücke in der Beratungspräsentation",
  wunschNetto: "Rentenlücke in der Beratungspräsentation",
  erfahrung: "Beratungspräsentation, Feld Erfahrung",
  qualEinkommen: "Qualifizierung im Kundenprofil, Lead-Verwaltung und Einnahmen in der Beratungspräsentation",
  qualEigenkapital: "Qualifizierung im Kundenprofil, Lead-Verwaltung und Eigenkapital in der Beratungspräsentation",
  reserve: "„Dein Rahmen“ und „Deine Kriterien“ in der Beratungspräsentation",
  investitionMonat: "Monatsbeitrag in „Dein Rahmen“ und „Deine Kriterien“ der Beratungspräsentation",
  grenzeStress: "„Deine Kriterien“ in der Beratungspräsentation",
  sorgen: "Abschnitt „Sicherheit“ der Beratungspräsentation",
  offeneFragen: "Seite „Deine Ziele“ der Beratungspräsentation",
};

/**
 * Antwortfelder, die mit dem Skript vom 15.10.2026 neu sind. Alles andere
 * gab es vorher schon unter demselben Schlüssel.
 */
export const NEUE_FELDER = [
  "motivWoertlich", "kinder", "probezeit", "schwerpunkt", "ruhestandAb", "renteErwartet",
  "wunschNetto", "vorsorgeZufriedenheit", "eigenheimGeplant", "bruttoJahr", "laufendeRaten",
  "reserve", "grenzeStress", "sorgen", "schufa", "ergebnis", "grundNichtPassend",
] as const;

/**
 * Rahmen um eine Antwort, die das CRM übernimmt.
 *
 * Bewusst im Marken-Orange (#BD550A) und als getönter Kasten um das ganze
 * Feld, nicht als Umrandung des Eingabefelds: Die Umrandung in Warn-Orange
 * heißt im Projekt „Pflichtfeld“, und die bleibt davon unberührt. Das Etikett
 * sagt es zusätzlich in Worten, die Farbe allein trägt die Information nicht.
 * Ohne Eintrag in UEBERNAHME_ZIELE gibt es keinen Rahmen.
 */
function UebernahmeRahmen({ feld, children }: { feld: string; children: ReactNode }) {
  const ziel = UEBERNAHME_ZIELE[feld];
  if (!ziel) return <>{children}</>;
  return (
    <div data-uebernahme={feld} className="rounded-lg border-2 border-brand-orange/60 bg-brand-orange/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange px-2 py-0.5 text-[10px] font-semibold text-brand-orange-foreground">
          <ArrowRightLeft className="h-3 w-3" aria-hidden="true" /> wird übernommen
        </span>
        <InfoTooltip
          label="Wohin wird diese Angabe übernommen?"
          text={`Diese Angabe übernimmt das CRM automatisch: ${ziel}.`}
        />
      </div>
      {children}
    </div>
  );
}

interface Frage {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  /** Auswahl als Knöpfe; „mehrfach“ speichert eine Komma-Liste. */
  typ?: "auswahl" | "mehrfach";
  optionen?: readonly string[];
  /** Klartext für gespeicherte Kurzwerte, etwa schwerpunkt "steuer". */
  werte?: Record<string, string>;
  pflicht?: boolean;
}

interface Schritt {
  id: string;
  nr: number;
  /** Phase, die mit diesem Schritt beginnt; davor steht ihr Kopf. */
  phase?: { kennung: string; titel: string };
  titel: string;
  /** Badge neben dem Titel, etwa „NEU: Schwerpunkt“. */
  marke?: string;
  text?: string;
  tipp?: string;
  /** Optionaler ausklappbarer "Mehr Kontext"-Text. */
  tippMehr?: string;
  optional?: boolean;
  fragen?: Frage[];
  notiz?: boolean; // Freitext-Notiz aktivieren
  notizLabel?: string;
  special?: "einleitung" | "netto" | "eigenkapital" | "skala" | "familienstand" | "ziele" | "rentenluecke" | "zusammenfassung" | "einschaetzung";
}

/**
 * Ziele zur Auswahl. Gespeichert wird der Wert links, damit Qualifizierung,
 * Pipeline, Lead-Verwaltung und Beratungspräsentation die bisherigen Werte
 * weiter verstehen; angezeigt wird die Beschriftung aus dem neuen Skript.
 */
export const ZIELE_AUSWAHL: ReadonlyArray<{ wert: string; label: string }> = [
  { wert: "Altersvorsorge", label: "Zusatzrente im Alter" },
  { wert: "Steuern sparen", label: "Steuern sparen / mehr Netto" },
  { wert: "Vermögensaufbau", label: "Vermögen aufbauen" },
  { wert: "Familie absichern", label: "Familie absichern" },
  { wert: "Vererben", label: "Vererben" },
  { wert: "Unabhängigkeit", label: "unabhängig von der gesetzlichen Rente" },
];
/** Ziele aus dem früheren Skript. Gespeicherte Werte bleiben gültig und abwählbar. */
const ZIELE_FRUEHER = ["Passives Einkommen", "Inflationsschutz", "Eigenkapitalaufbau", "Frühe Rente"];
const ZIELE_GUELTIG = [...ZIELE_AUSWAHL.map((z) => z.wert), ...ZIELE_FRUEHER];

const SCHWERPUNKT_WERTE: Record<string, string> = {
  zusatzrente: "Zusatzrente",
  steuer: "Steuerersparnis",
  beides: "beides",
};

const SCHRITTE: Schritt[] = [
  // ── Phase A: Einstieg ──
  { id: "einleitung", nr: 1, phase: { kennung: "A", titel: "Einstieg" }, titel: "Begrüßung und Erlaubnis",
    special: "einleitung",
    text: `„Hallo [Vorname], hier ist [Dein Name] von der OS Real Estate. Du hattest dich [Quelle] für Immobilien als Kapitalanlage interessiert. Passt es dir gerade für etwa zwanzig Minuten, oder soll ich dich lieber zu einem festen Zeitpunkt zurückrufen, zum Beispiel heute um 18 Uhr?“`,
    tipp: `Hat der Kunde keine Zeit, vereinbare den Rückruf mit Datum und Uhrzeit. Ein „irgendwann“ reicht nicht.` },

  // Früher „Anrede klären“. Seit dem 16.10.2026 nur noch ein Hinweis ohne
  // Sprechtext; Nummer und Kennung bleiben, damit gespeicherte Haken passen.
  { id: "anrede", nr: 2, titel: "Hinweis: Wir duzen",
    tipp: `Wir duzen jeden Kunden vom ersten Satz an, im Skript, in der Beratungspräsentation und in den Mails. Hier ist nichts zu fragen und nichts zu wählen.` },

  { id: "ziel_gespraech", nr: 3, titel: "Ablauf und Ziel des Gesprächs",
    text: `„Kurz zum Ablauf, damit du weißt, was dich erwartet: Ich möchte heute vor allem verstehen, wo du stehst und was du erreichen möchtest. Dazu stelle ich dir ein paar Fragen. Einige davon sind persönlich, und du entscheidest, was du mir erzählst. Danach sage ich dir kurz, wer wir sind und wie wir arbeiten. Am Ende sagen wir beide ehrlich, ob ein zweites Gespräch Sinn ergibt. Eine konkrete Immobilie schauen wir heute nicht an, und es wird nichts unterschrieben. Ist das für dich ein guter Ablauf?“\n\n„Darf ich mir dabei ein paar Notizen machen? Und gibt es etwas, das du heute auf jeden Fall geklärt haben möchtest?“`,
    notiz: true, notizLabel: "Was der Kunde heute geklärt haben möchte" },

  // ── Phase B: Kundenrahmen ──
  { id: "warmup", nr: 4, phase: { kennung: "B", titel: "Kundenrahmen" }, titel: "Motiv: Warum gerade jetzt?",
    text: `„Was hat dich dazu gebracht, dich gerade jetzt mit Immobilien als Kapitalanlage zu beschäftigen?“`,
    tipp: `Nachfragen statt bewerten: „Was meinst du genau mit …?“ · „Wie kam es dazu?“ Pausen aushalten. Den wichtigsten Satz des Kunden wörtlich notieren. Er erscheint in der Beratungspräsentation als Zitat auf der Seite „Deine Ziele“.`,
    fragen: [{ key: "motivWoertlich", label: "Motiv in den Worten des Kunden (wörtlich)", placeholder: "z.B. „Ich merke, dass meine Rente später nicht reicht, und ich möchte jetzt anfangen.“", multiline: true }],
    notiz: true },

  { id: "familiaere_situation", nr: 5, titel: "Familie und Mitentscheider",
    special: "familienstand",
    text: `„Damit ich deine Situation richtig einordne: Bist du ledig, verheiratet oder in einer Partnerschaft?“`,
    tipp: `Je nach Antwort blendet das CRM den passenden Folgesatz ein.`,
    fragen: [
      { key: "mitentscheider", label: "Mitentscheider (Name, wird zum Termin eingeladen)", placeholder: "z.B. Partnerin, soll beim nächsten Termin dabei sein" },
      { key: "kinder", label: "Kinder (Anzahl)", placeholder: "z.B. 2" },
    ],
    notiz: true },

  { id: "berufliche_situation", nr: 6, titel: "Beruf",
    text: `„Was machst du beruflich? Bist du angestellt, selbstständig oder verbeamtet? Und seit wann bist du dort?“`,
    tipp: `Probezeit oder Befristung notieren. Die Bank fragt später danach.`,
    fragen: [
      { key: "beruf", label: "Berufliche Situation", pflicht: true },
      { key: "arbeitgeber", label: "Arbeitgeber und seit wann (Jahr)", placeholder: "z.B. Musterfirma GmbH, seit 2019" },
      { key: "probezeit", label: "Probezeit oder befristet", typ: "auswahl", optionen: ["ja", "nein"] },
    ] },

  // ── Phase C: Ziele und Ausgangslage ──
  { id: "ziele", nr: 7, phase: { kennung: "C", titel: "Ziele und Ausgangslage" }, titel: "Ziele und Schwerpunkt", marke: "NEU: Schwerpunkt",
    special: "ziele",
    text: `„Was soll eine Immobilie in zehn bis zwanzig Jahren für dich leisten?“\n\n„Und wenn du dich für eines entscheiden müsstest: Geht es dir eher darum, später im Ruhestand ein zusätzliches Einkommen zu haben, oder eher darum, heute weniger Steuern zu zahlen und mehr Netto vom Brutto zu behalten?“\n\n„Warum ist dir genau das gerade jetzt wichtig?“`,
    tipp: `Bis zu drei Ziele. Der Schwerpunkt ist Pflicht und belegt den Konzeptschalter der Beratungspräsentation vor.`,
    fragen: [{ key: "schwerpunkt", label: "Schwerpunkt", typ: "auswahl", optionen: ["zusatzrente", "steuer", "beides"], werte: SCHWERPUNKT_WERTE, pflicht: true }],
    notiz: true, notizLabel: "Warum gerade jetzt wichtig" },

  { id: "rentenluecke", nr: 8, titel: "Ruhestand und Rentenlücke",
    special: "rentenluecke",
    text: `„Wie stellst du dir deinen Ruhestand vor, und ab wann?“\n\n„Weißt du ungefähr, mit wie viel Rente du rechnen kannst? Eine grobe Zahl aus deiner letzten Renteninformation reicht mir.“\n\n„Und mit wie viel Netto im Monat würdest du im Ruhestand gern leben?“`,
    fragen: [
      { key: "ruhestandAb", label: "Ruhestand ab (Alter)", placeholder: "z.B. 67" },
      { key: "renteErwartet", label: "Erwartete Rente netto im Monat (€)", placeholder: "z.B. 1.800" },
      { key: "wunschNetto", label: "Wunsch-Netto im Ruhestand (€)", placeholder: "z.B. 3.000" },
    ] },

  { id: "sparformen", nr: 9, titel: "Heutige Vorsorge und Erfahrung",
    text: `„Was tust du heute bereits für deine Altersvorsorge und deinen Vermögensaufbau? Und wie zufrieden bist du damit?“\n\n„Hast du schon Erfahrung mit Immobilien, selbst genutzt oder vermietet? Und planst du in den nächsten Jahren ein eigenes Zuhause?“`,
    fragen: [
      { key: "sparformen", label: "Sparformen", typ: "mehrfach", optionen: ["Tagesgeld", "ETF/Aktien", "Bausparvertrag", "Rentenversicherung", "betriebliche Vorsorge", "Immobilie"] },
      { key: "vorsorgeZufriedenheit", label: "Zufriedenheit", placeholder: "z.B. eher unzufrieden, bringt zu wenig" },
      { key: "erfahrung", label: "Immobilienerfahrung", placeholder: "z.B. Eigentumswohnung selbst genutzt, noch nichts vermietet" },
      { key: "eigenheimGeplant", label: "Eigenheim geplant", typ: "auswahl", optionen: ["ja", "nein", "später"] },
    ] },

  // ── Phase D: Finanzieller Rahmen ──
  { id: "ueberleitung_rahmen", nr: 10, phase: { kennung: "D", titel: "Finanzieller Rahmen" }, titel: "Überleitung",
    text: `„Eine Immobilie ist nur dann gut, wenn sie zu deinem Ziel und zu deiner Situation passt. Damit ich dir im nächsten Termin mit echten Zahlen statt mit Wunschwerten rechne, brauche ich ein paar Eckdaten. Eine Spanne reicht mir jeweils.“` },

  { id: "netto", nr: 11, titel: "Einkommen und Verpflichtungen",
    special: "netto",
    text: `„Wie hoch ist ungefähr dein monatliches Nettoeinkommen? Und dein Bruttojahresgehalt?“\n\n„Laufen aktuell Kredite, Leasingraten oder Unterhaltszahlungen?“`,
    tipp: `Das Brutto brauchen wir für den persönlichen Steuersatz. Die Präsentation rechnet nicht mit pauschal 42 %, sondern mit dem Wert des Kunden.`,
    fragen: [
      { key: "bruttoJahr", label: "Brutto im Jahr (€)", placeholder: "z.B. 80.000", pflicht: true },
      { key: "laufendeRaten", label: "Laufende Raten im Monat (€)", placeholder: "z.B. 0 oder 250 Leasing", pflicht: true },
    ],
    notiz: true },

  { id: "eigenkapital", nr: 12, titel: "Eigenkapital und Reserve",
    special: "eigenkapital",
    text: `„Welche Rücklage soll auf jeden Fall unangetastet bleiben, egal was passiert?“\n\n„Und welcher Betrag stünde darüber hinaus für die Kaufnebenkosten zur Verfügung? Wichtig: Nachweisen heißt nicht einsetzen. Was du davon wirklich einsetzt, entscheidest du später.“`,
    fragen: [{ key: "reserve", label: "Reserve, unantastbar (€)", placeholder: "z.B. 15.000", pflicht: true }] },

  { id: "investitionsbereitschaft", nr: 13, titel: "Monatlich tragbarer Betrag",
    text: `„Welcher Betrag im Monat wäre für dich dauerhaft gut tragbar, wenn das Konzept für dich nachvollziehbar ist? Ich meine den Betrag vor Steuern.“\n\n„Und wo wäre deine Grenze, wenn einmal etwas nicht nach Plan läuft?“`,
    fragen: [
      { key: "investitionMonat", label: "Tragbar im Monat vor Steuern (€)", placeholder: "z.B. 300-500 €" },
      { key: "grenzeStress", label: "Grenze im Stressfall (€ im Monat)", placeholder: "z.B. 500" },
    ] },

  { id: "schufa", nr: 14, titel: "Sorgen und Schufa",
    text: `„Was sind deine größten Sorgen, wenn du an eine vermietete Immobilie denkst?“\n\n„Und eine letzte Frage, die ich allen stelle: Gab es in der Vergangenheit Schwierigkeiten mit einer Bank oder mit der Schufa? Ich frage nur, damit wir später keine Überraschung erleben.“`,
    tipp: `Sorgen wörtlich notieren. Die Beratungspräsentation beantwortet sie im Abschnitt „Sicherheit“ gezielt.`,
    fragen: [
      { key: "sorgen", label: "Größte Sorgen (wörtlich)", placeholder: "z.B. „Was ist, wenn der Mieter nicht zahlt?“", multiline: true },
      { key: "schufa", label: "Schufa auffällig", typ: "auswahl", optionen: ["ja", "nein", "unklar"] },
    ],
    notiz: true },

  // ── Phase E: Wer wir sind ──
  { id: "osimmobilien_vorstellung", nr: 15, phase: { kennung: "E", titel: "Wer wir sind" }, titel: "Unternehmen",
    text: `„Danke für deine Offenheit. Damit du weißt, mit wem du sprichst: Wir sind die OS Real Estate GmbH, Teil der OS Immobilien Holding mit Sitz in Mittenwalde bei Berlin. Wir vermitteln vermietete Wohnimmobilien als Kapitalanlage, mit Schwerpunkt Berlin und Brandenburg, heute zum Beispiel in Berlin-Wedding, am Schwielowsee bei Potsdam und in Zossen-Wünsdorf. Jedes Objekt prüfen wir vorher auf Lage, Miete, Zustand und Unterlagen.“\n\n„Was das für dich heißt: Du bekommst die Objekte direkt vom Bauträger, also aus erster Hand. Und du bekommst bei uns alles aus einer Hand: Wir suchen mit dir das passende Objekt, kümmern uns mit unseren Bankpartnern um die passende Finanzierung und begleiten dich durch die gesamte Abwicklung bis zum Notar. Auch danach bist du nicht allein, zum Beispiel bei Vermietung und Verwaltung. Gerechnet wird immer mit echten Zahlen, vor und nach Steuern und mit einem Stresstest. Für Steuer- und Rechtsfragen arbeiten wir mit Steuerberatern und Notaren zusammen.“`,
    tipp: `Persönlich ergänzen: dein Werdegang in zwei Sätzen und dein ehrlicher Grund für diese Arbeit. Keine erfundenen Zahlen, keine fremden Siegel.`,
    notiz: true },

  { id: "ablauf", nr: 16, titel: "So arbeiten wir: der Ablauf",
    text: `„So gehen wir vor: Im nächsten Termin zeige ich dir in etwa einer Stunde unser Konzept, gerechnet mit deinen Zahlen, und dazu unsere Objekte. Passt das für dich, füllen wir am Ende gemeinsam deine Selbstauskunft aus. Rund eine Woche später stelle ich dir die konkrete Immobilie vor, die zu dir passt, mit Exposé und deiner persönlichen Kalkulation. Erst dann entscheidest du über eine Reservierung, und die ist kostenfrei. Danach folgen Finanzierung, Bankgutachter, Besichtigung und Notar. Nach jedem Schritt entscheidest du, ob es weitergeht.“` },

  // ── Phase F: Abschluss ──
  { id: "zusammenfassung", nr: 17, phase: { kennung: "F", titel: "Abschluss" }, titel: "Zusammenfassung",
    special: "zusammenfassung",
    text: `„Lass mich kurz zusammenfassen, ob ich dich richtig verstanden habe: Du bist [Beruf] und möchtest [wichtigstes Ziel]. Wichtig ist dir das gerade jetzt, weil [Motiv]. Heute hast du [Vorsorge], und es fehlen dir später etwa [Lücke] im Monat. Eine Reserve von [Reserve] soll unangetastet bleiben, und monatlich wären für dich etwa [tragbarer Betrag] vor Steuern gut tragbar. Am meisten Sorgen macht dir [Sorge], und mitentscheiden wird [Mitentscheider].“\n\n„Habe ich das richtig verstanden? Was würdest du ändern oder ergänzen?“`,
    tipp: `Das CRM setzt die Werte aus den Schritten 4 bis 14 automatisch ein. Was noch in eckigen Klammern steht, ist offen.` },

  { id: "einschaetzung", nr: 18, titel: "Ehrliche Einschätzung",
    special: "einschaetzung",
    fragen: [
      { key: "ergebnis", label: "Ergebnis", typ: "auswahl", optionen: ["passt", "passt nicht"] },
      { key: "grundNichtPassend", label: "Grund, wenn es nicht passt", typ: "auswahl", optionen: ["kein Bedarf", "keine wirtschaftliche Basis", "nur Steuerrückerstattung gewünscht", "sonstiges"] },
    ],
    tipp: `Bei „passt nicht“ kommt der Kontakt in die Stufe „Verloren“ mit diesem Grund.`,
    notiz: true },

  { id: "skala_verbindlichkeit", nr: 19, titel: "Verbindlichkeit",
    special: "skala",
    text: `„Auf einer Skala von 1 bis 10: Wie wichtig ist es dir, das Thema in den nächsten Wochen anzugehen?“\n\n„Was müsste passieren, damit es eine 10 wird?“`,
    notiz: true },

  { id: "terminvereinbarung", nr: 20, titel: "Termin für die Beratungspräsentation",
    text: `„Ich brauche zwei bis drei Tage, um dein Konzept mit deinen Zahlen vorzubereiten. Passt dir [Tag 1] um [Uhrzeit] oder [Tag 2] um [Uhrzeit] besser? Wir brauchen etwa eine Stunde, per Video oder bei uns im Büro.“\n\n„[Mitentscheider] sollte idealerweise dabei sein. Passt der Termin auch für [ihn/sie]?“` },

  { id: "einladung_check", nr: 21, titel: "Einladung prüfen und Vorbereitung",
    text: `„Du bekommst gleich eine Einladung per E-Mail. Schau bitte kurz nach, ob sie angekommen ist? Manchmal landet sie im Spam-Ordner.“\n\n„Vorbereiten musst du für den Termin nichts. Wenn du magst, leg deine letzte Renteninformation bereit, dann rechnen wir noch genauer.“`,
    notiz: true },

  { id: "offene_fragen", nr: 22, titel: "Offene Fragen",
    text: `„Welche Frage soll ich dir im nächsten Termin als Allererstes beantworten?“`,
    fragen: [{ key: "offeneFragen", label: "Erste Frage für die Beratung", placeholder: "Die Frage des Kunden, möglichst wörtlich", multiline: true }] },

  { id: "verabschiedung", nr: 23, titel: "Verabschiedung",
    text: `„Dann halten wir fest: [Tag], [Datum] um [Uhrzeit], gemeinsam mit [Mitentscheider]. Ich freue mich auf unser Gespräch. Bis [Tag], [Vorname]!“`,
    tipp: `Abschluss-Checkliste: Ziel und Schwerpunkt · Mitentscheider · Rahmen und Reserve · Sorgen · Termin mit Einladung · Nachfass-E-Mail innerhalb 2 Stunden.` },
];

/** Die drei Sätze in Schritt 18, je nach Ergebnis. */
const EINSCHAETZUNG: Record<"passt" | "passtNicht", string> = {
  passt: `Wenn es passt: „Nach dem, was du mir erzählt hast, kann eine vermietete Immobilie ein sinnvoller Baustein für dich sein. Ob die Zahlen wirklich aufgehen, zeige ich dir im nächsten Termin, offen und mit Stresstest.“`,
  passtNicht: `Wenn es nicht passt: „Danke für deine Offenheit. Ehrlich gesagt passt unser Konzept im Moment nicht zu dir, weil [Grund]. Ich möchte dir nichts empfehlen, das nicht zu dir passt. Wenn sich an [Grund] etwas ändert, melde dich gern wieder bei mir.“`,
};

/** Die Phasen im Überblick oben im Skript. */
const PHASEN: ReadonlyArray<{ kennung: string; titel: string; schritte: string; dauer: string; ziel: string }> = [
  { kennung: "A", titel: "Einstieg", schritte: "1 bis 3", dauer: "3 Min.", ziel: "Erlaubnis, Ablauf" },
  { kennung: "B", titel: "Kundenrahmen", schritte: "4 bis 6", dauer: "5 Min.", ziel: "Motiv in den Worten des Kunden, Mitentscheider, Beruf" },
  { kennung: "C", titel: "Ziele", schritte: "7 bis 9", dauer: "6 Min.", ziel: "Ziele, Rentenlücke, heutige Vorsorge, Schwerpunkt" },
  { kennung: "D", titel: "Finanzieller Rahmen", schritte: "10 bis 14", dauer: "6 Min.", ziel: "Einkommen, Eigenkapital, Reserve, tragbarer Betrag, Sorgen" },
  { kennung: "E", titel: "Wer wir sind", schritte: "15 bis 16", dauer: "3 Min.", ziel: "Unternehmen, Arbeitsweise, Ablauf" },
  { kennung: "F", titel: "Abschluss", schritte: "17 bis 23", dauer: "5 Min.", ziel: "Zusammenfassung, Einschätzung, Termin Beratungspräsentation" },
];

/** Reaktionen am Telefon, als Schnellhilfe über dem Skript. */
const REAKTIONEN: ReadonlyArray<{ kunde: string; antwort: string }> = [
  { kunde: "„Schick mir einfach etwas zu.“", antwort: "„Mache ich gern. Damit ich dir das Richtige schicke: Was interessiert dich am meisten? Und lass uns gleich einen kurzen Termin machen, dann gehen wir es zusammen durch.“" },
  { kunde: "„Was kostet so eine Wohnung?“", antwort: "„Unsere Wohnungen liegen zwischen etwa 176.000 und 470.000 Euro. Was das für dich im Monat bedeutet, hängt von deiner Situation ab. Genau das klären wir im nächsten Gespräch.“" },
  { kunde: "„Ich habe gerade keine Zeit.“", antwort: "„Verstehe ich. Wann passt es dir besser, heute Abend oder morgen?“ Rückruf mit Datum und Uhrzeit festhalten." },
  { kunde: "„Ich will nur Steuern sparen.“", antwort: "„Die Steuerwirkung ist ein wichtiger Baustein, aber allein kein Grund für einen Kauf. Die Immobilie muss auch ohne Steuervorteil zu dir passen. Darf ich dir dazu zwei Fragen stellen?“" },
  { kunde: "„Woher habt ihr meine Nummer?“", antwort: "Quelle offen nennen. Auf Wunsch die Daten löschen und das im CRM vermerken." },
  { kunde: "„Ich muss erst mit meinem Partner sprechen.“", antwort: "„Richtig so. Dann machen wir den nächsten Termin am besten zu dritt. Wann passt es euch beiden?“" },
];

const NIE_SAGEN = [
  "„Das bekommen wir bei der Bank schon hin.“",
  "„Das trägt sich durch die Steuer von selbst.“",
  "„Bei deinem Einkommen ist das kein Problem.“",
  "„Immobilien für 150 Euro im Monat.“",
  "„Das Angebot gilt nur noch heute.“",
];

/**
 * Auswahlwerte für den Familienstand. Bewusst als Klartext gespeichert, dann
 * sind sie in Zusammenfassung und KI-Payload ohne Übersetzung lesbar.
 */
export const FAMILIENSTAND_OPTIONEN = ["ledig", "in Partnerschaft", "verheiratet", "geschieden", "verwitwet"] as const;
export type Familienstand = (typeof FAMILIENSTAND_OPTIONEN)[number];

/** Folgesatz in Schritt 5, je nach Familienstand. */
const MITENTSCHEIDER_VARIANTEN: Record<"verheiratet" | "partnerschaft" | "allein", { text: string; tipp: string }> = {
  verheiratet: {
    text: `„Entscheidest du solche Themen gemeinsam mit deiner Frau oder deinem Mann? Dann wäre es gut, wenn wir das nächste Gespräch zu dritt führen. So hört ihr beide dasselbe und müsst nichts nacherzählen.“`,
    tipp: `Den Mitentscheider mit Namen notieren, er wird zum Termin eingeladen.`,
  },
  partnerschaft: {
    text: `„Ist dein Partner oder deine Partnerin bei so einer Entscheidung mit im Boot? Dann laden wir sie oder ihn gern zum nächsten Termin mit ein.“`,
    tipp: `Den Mitentscheider mit Namen notieren, er wird zum Termin eingeladen.`,
  },
  allein: {
    text: `„Gibt es jemanden, dessen Meinung dir bei so einer Entscheidung wichtig ist, etwa Eltern, Geschwister oder ein Steuerberater?“`,
    tipp: `Die offene Rückfrage fängt stille Mitentscheider ein, bevor sie in der Beratung überraschen.`,
  },
};

/**
 * Wählt den Folgesatz zum Familienstand.
 * Unbeantwortet oder unbekannter Wert: undefined, dann steht nur die Frage da.
 * Exportiert, damit die Umschaltlogik testbar ist.
 */
export function waehleMitentscheiderVariante(familienstand: string | undefined): { text: string; tipp: string } | undefined {
  const stand = (familienstand || "").trim();
  if (stand === "verheiratet") return MITENTSCHEIDER_VARIANTEN.verheiratet;
  if (stand === "in Partnerschaft") return MITENTSCHEIDER_VARIANTEN.partnerschaft;
  if (stand === "ledig" || stand === "geschieden" || stand === "verwitwet") return MITENTSCHEIDER_VARIANTEN.allein;
  return undefined;
}

/**
 * Wie der Kontakt zu uns kam, als Satzteil für Schritt 1. Ohne erkennbare
 * Quelle bleibt die Auswahl in Klammern stehen, dann wählt der Anrufer.
 */
export function quelleSatz(kunde: { quelle?: string; leadTyp?: string } | null | undefined): string {
  const q = `${kunde?.leadTyp ?? ""} ${kunde?.quelle ?? ""}`.toLowerCase();
  if (/empfehl|tippgeber/.test(q)) return "auf Empfehlung";
  if (/meta|facebook|instagram|anzeige|ads|google|zapier/.test(q)) return "über unsere Anzeige";
  if (/website|webseite|konfigurator|landing/.test(q)) return "über unsere Website";
  return "[über unsere Anzeige / über unsere Website / auf Empfehlung]";
}

/**
 * Lesbare Titel für Schritt-IDs, die es im Skript nicht mehr gibt. Alte
 * gespeicherte Notizen unter diesen IDs sollen in der KI-Zusammenfassung
 * weiterhin benannt auftauchen statt als kryptischer Schlüssel.
 */
const LEGACY_SCHRITT_TITEL: Record<string, string> = {
  vorabschluss: "Vorabschluss (Punkt entfernt)",
  mitentscheider: "Mitentscheider (früheres Skript)",
  erfahrung: "Immobilien-Erfahrung (früheres Skript)",
  zwei_punkte: "Wichtigste 2 Punkte (früheres Skript)",
  zusammenarbeit: "Wichtig in der Zusammenarbeit (früheres Skript)",
  cashflow_erwartung: "Erwartungsrahmen, Cashflow oder Qualität (früheres Skript)",
  pattern_interrupt: "Einwand-Vorwegnahme (früheres Skript)",
};

/**
 * Die Schritte, reduziert auf das, was die Kurzfassung im eingeklappten
 * Kästchen braucht. Aus SCHRITTE abgeleitet, damit es für die Fragenschlüssel
 * nur eine Quelle gibt.
 */
export const ERSTGESPRAECH_SCHRITTE: ZusammenfassungSchritt[] = SCHRITTE.map(s => ({
  id: s.id,
  fragenSchluessel: (s.fragen ?? []).map(f => f.key),
  hatNotiz: s.notiz === true,
}));

/**
 * Antwortfelder, die kein Eintrag in `fragen` sind, sondern über einen
 * Sonderblock in die Antworten geschrieben werden.
 */
const ZUSATZFELDER: Record<string, DetailFeld[]> = {
  familiaere_situation: [{ key: "familienstand", label: "Familienstand" }],
  skala_verbindlichkeit: [{ key: "verbindlichkeitSkala", label: "Verbindlichkeit (1 bis 10)" }],
};

/**
 * Schritte des früheren Skripts (bis 15.10.2026), deren Antworten oder
 * Notizen in gespeicherten Gesprächen liegen. Sie erscheinen in der
 * ausführlichen Fassung nur, wenn dort etwas steht.
 */
const FRUEHERE_SCHRITTE_DETAIL: DetailSchritt[] = [
  { id: "zwei_punkte", nr: 0, nrText: "früher", titel: "Wichtigste 2 Punkte", felder: [{ key: "zweiPunkte", label: "Die 2 wichtigsten Punkte" }], hatNotiz: false },
  { id: "zusammenarbeit", nr: 0, nrText: "früher", titel: "Wichtig in der Zusammenarbeit", felder: [], hatNotiz: true },
  {
    id: "cashflow_erwartung", nr: 0, nrText: "früher", titel: "Erwartungsrahmen, Cashflow oder Qualität", hatNotiz: true,
    felder: [{
      key: "cashflowPraeferenz",
      label: "Erwartung: Cashflow oder Qualität",
      werte: {
        cashflow: "Cashflow, soll sich selbst tragen, mehr Risiko in Ordnung",
        qualitaet: "Qualität, Top-Lage, Sicherheit, Vermögensaufbau",
        mix: "Mix, ausgewogen, beides wichtig",
      },
    }],
  },
  { id: "pattern_interrupt", nr: 0, nrText: "früher", titel: "Einwand-Vorwegnahme", felder: [], hatNotiz: true },
];

/**
 * Die Schritte für die ausführliche Fassung im Zusammenfassungs-Popup.
 * Beschriftungen in der Sie-Form, weil die Zusammenfassung gelesen und nicht
 * gesprochen wird. Ebenfalls aus SCHRITTE abgeleitet.
 */
export const ERSTGESPRAECH_SCHRITTE_DETAIL: DetailSchritt[] = [
  ...SCHRITTE.map(s => ({
    id: s.id,
    nr: s.nr,
    titel: s.titel,
    felder: [
      ...(s.fragen ?? []).map(f => ({ key: f.key, label: f.label, ...(f.werte ? { werte: f.werte } : {}) })),
      ...(ZUSATZFELDER[s.id] ?? []),
    ],
    hatNotiz: s.notiz === true,
  })),
  ...FRUEHERE_SCHRITTE_DETAIL,
];

/**
 * Das Skript, reduziert auf das, was Kapitel 4 der Vertriebsakademie
 * beschreibt: je Schritt seine Nummer, sein Titel und sein Sprechtext, in der
 * Reihenfolge der Anzeige. Schritte ohne Sprechtext (der Hinweis in Schritt 2)
 * haben keinen Baustein. Platzhalter wie [Vorname] bleiben stehen.
 *
 * Die Akademie zitiert genau diese Sätze; `vertriebsakademieErstgespraech.test.ts`
 * vergleicht beide Stellen Satz für Satz. Schritt 18 hat keinen festen
 * Sprechtext, dort stehen die beiden Fassungen für „passt“ und „passt nicht“.
 */
export const ERSTGESPRAECH_WIZARD_UEBERSICHT: {
  nr: number;
  titel: string;
  bausteine: { id: string; titel: string; text: string }[];
}[] = SCHRITTE.map((s) => ({
  nr: s.nr,
  titel: s.titel,
  bausteine: [{
    id: s.id,
    titel: s.titel,
    text: s.special === "einschaetzung"
      ? `${EINSCHAETZUNG.passt}\n\n${EINSCHAETZUNG.passtNicht}`
      : s.text ?? "",
  }].filter((b) => b.text),
}));

/**
 * Wording-Overrides für den Modus "vertriebspartner". Ein selbst angelegter
 * Lead hat oft keine erkennbare Quelle; der Einstieg nennt dann das Interesse
 * ohne Quelle, statt die Auswahl in Klammern zu zeigen.
 */
const VP_TEXT_OVERRIDES: Record<string, string> = {
  einleitung: `„Hallo [Vorname], hier ist [Dein Name] von der OS Real Estate. Du hattest vor Kurzem Interesse an Immobilien als Kapitalanlage. Passt es dir gerade für etwa zwanzig Minuten, oder soll ich dich lieber zu einem festen Zeitpunkt zurückrufen, zum Beispiel heute um 18 Uhr?“`,
};

export type SkriptDaten = {
  antworten: Record<string, string>;
  notizen: Record<string, string>;
  ziele: string[];
  erledigt: Record<string, boolean>;
  /** Altdaten: früher "sie" möglich. Gespeichert wird seit dem 16.10.2026 immer "du". */
  anrede?: "du" | "sie";
  einleitungBestaetigt?: boolean;
  kiZusammenfassung?: string;
  aktualisiertAm?: string;
};

const LS_KEY = (id: string) => `osimmo_setterSkript_${id}`;

/** Lücke im Monat aus Wunsch-Netto und erwarteter Rente, als Text; leer, wenn eines fehlt. */
function lueckeText(wunsch?: string, rente?: string): string {
  const zahl = (s?: string) => {
    const roh = (s || "").replace(/[^0-9,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = parseFloat(roh);
    return Number.isFinite(n) ? n : NaN;
  };
  const w = zahl(wunsch);
  const r = zahl(rente);
  if (!Number.isFinite(w) || !Number.isFinite(r)) return "";
  return `${Math.max(0, w - r).toLocaleString("de-DE")} €`;
}

function loadInitial(kunde: KundeData, investmentId?: string, isFirstInvestment?: boolean): SkriptDaten {
  // Per-Investment-Scope: zuerst aus investment.meta.setterSkript lesen.
  let dbDaten: SkriptDaten | undefined;
  if (investmentId) {
    dbDaten = getInvestmentMetaField<SkriptDaten | undefined>(investmentId, "setterSkript", undefined);
    // Legacy-Fallback NUR für das erste Investment: ältere Kontakte haben das
    // Skript noch am Kontakt liegen – damit bestehende Daten nicht „verschwinden".
    if (
      (!dbDaten || (Object.keys(dbDaten.antworten || {}).length + Object.keys(dbDaten.notizen || {}).length === 0))
      && isFirstInvestment
    ) {
      dbDaten = (kunde as any).meta?.setterSkript as SkriptDaten | undefined;
    }
  } else {
    dbDaten = (kunde as any).meta?.setterSkript as SkriptDaten | undefined;
  }
  if (dbDaten && Object.keys(dbDaten.antworten || {}).length + Object.keys(dbDaten.notizen || {}).length > 0) {
    return {
      antworten: dbDaten.antworten || {},
      notizen: dbDaten.notizen || {},
      ziele: dbDaten.ziele || [],
      erledigt: dbDaten.erledigt || {},
      anrede: "du",
      kiZusammenfassung: dbDaten.kiZusammenfassung,
      aktualisiertAm: dbDaten.aktualisiertAm,
    };
  }
  // localStorage-Cache nur für Kontakt-Scope verwenden – pro Investment ist
  // er nicht eindeutig zuordenbar und würde Daten aus anderen Investments mischen.
  if (!investmentId) {
    try {
      const raw = localStorage.getItem(LS_KEY(kunde.id));
      if (raw) {
        const p = JSON.parse(raw);
        return { ...p, anrede: "du" };
      }
    } catch {}
  }
  return { antworten: {}, notizen: {}, ziele: [], erledigt: {}, anrede: "du" };
}

/** Knöpfe für Auswahlfragen; ein zweiter Klick hebt die Wahl auf. */
function AuswahlKnoepfe({
  optionen, wert, onChange, werte, mehrfach, pflichtLeer,
}: {
  optionen: readonly string[];
  wert: string;
  onChange: (v: string) => void;
  werte?: Record<string, string>;
  mehrfach?: boolean;
  pflichtLeer?: boolean;
}) {
  const gewaehlt = mehrfach ? wert.split(",").map((t) => t.trim()).filter(Boolean) : [wert].filter(Boolean);
  // Frei getippte Werte aus dem früheren Skript bleiben sichtbar und abwählbar.
  const alle = mehrfach ? [...optionen, ...gewaehlt.filter((g) => !optionen.includes(g))] : optionen;
  const umschalten = (opt: string) => {
    if (!mehrfach) return onChange(wert === opt ? "" : opt);
    const neu = gewaehlt.includes(opt) ? gewaehlt.filter((g) => g !== opt) : [...gewaehlt, opt];
    onChange(neu.join(", "));
  };
  return (
    <div className={`mt-1 flex flex-wrap gap-2 ${pflichtLeer ? `rounded-lg border p-2 ${PFLICHT_RAHMEN}` : ""}`}>
      {alle.map((opt) => {
        const aktiv = gewaehlt.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={aktiv}
            onClick={() => umschalten(opt)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left break-words ${
              aktiv ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/50"
            }`}
          >
            {aktiv && "✓ "}{werte?.[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

export const SetterErstgespraechsSkript = forwardRef<SetterErstgespraechsSkriptHandle, Props>(function SetterErstgespraechsSkript(
  { kunde, onUpdate, onSummaryGenerated, terminSlot, abschlussSlot, onFollowUp, mode = "setter", investmentId, isFirstInvestment },
  ref,
) {
  const { toast } = useToast();
  const { user } = useUser();
  // Name des angemeldeten Nutzers für [Dein Name] im Sprechtext.
  // Solange der Nutzer lädt, steht dort „Laden...“; dann lieber der Platzhalter.
  const callerFullName = /(\.\.\.|…)$/.test((user?.name || "").trim()) ? "" : (user?.name || "").trim();
  const isVpMode = mode === "vertriebspartner";
  const SCHRITTE_EFFECTIVE: Schritt[] = isVpMode
    ? SCHRITTE.map(s => (VP_TEXT_OVERRIDES[s.id] && quelleSatz(kunde as any).startsWith("[") ? { ...s, text: VP_TEXT_OVERRIDES[s.id] } : s))
    : SCHRITTE;
  const [daten, setDaten] = useState<SkriptDaten>(() => loadInitial(kunde, investmentId, isFirstInvestment));
  const [savingAi, setSavingAi] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<SkriptDaten>(daten);
  const dirtyRef = useRef<boolean>(false);
  const savingRef = useRef<boolean>(false);
  // Zaehlt aufeinanderfolgende Fehlschlaege beim Speichern. Der Hinweis kommt
  // erst ab dem zweiten Fehlschlag in Folge und danach hoechstens alle 30
  // Sekunden, sonst wuerde er bei jedem Tastendruck erneut aufpoppen.
  const speicherFehlerRef = useRef<number>(0);
  const letzterSpeicherHinweisRef = useRef<number>(0);

  // Schritt 1: Bestätigung "Ja, hat Zeit"
  const [einleitungJa, setEinleitungJa] = useState<boolean>(
    () => {
      if (investmentId) {
        const invSk = getInvestmentMetaField<any>(investmentId, "setterSkript", null);
        if (invSk) return !!invSk.einleitungBestaetigt;
        if (isFirstInvestment) return !!(kunde as any).meta?.setterSkript?.einleitungBestaetigt;
        return false;
      }
      return !!(kunde as any).meta?.setterSkript?.einleitungBestaetigt;
    },
  );
  useEffect(() => {
    setDaten(d => ({ ...d, einleitungBestaetigt: einleitungJa } as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [einleitungJa]);

  // ── Auto-Save (debounced) ──
  useEffect(() => {
    latestRef.current = daten;
    dirtyRef.current = true;
    // localStorage-Backup nur im Kontakt-Scope – bei Investment-Scope nicht
    // sinnvoll, weil pro Investment unterschiedliche Skripte existieren.
    if (!investmentId) {
      try { localStorage.setItem(LS_KEY(kunde.id), JSON.stringify(daten)); } catch {}
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await persistNow();
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten, kunde.id]);

  // Immediate persistence (used by debounce + flush triggers).
  const persistNow = useCallback(async () => {
    if (!dirtyRef.current || savingRef.current) return;
    savingRef.current = true;
    const snapshot = { ...latestRef.current, aktualisiertAm: new Date().toISOString() };
    try {
      let gespeichert = true;
      if (investmentId) {
        // Per-Investment-Persistierung (kein Kontakt-Meta mehr beschreiben,
        // damit Investments unabhängig bleiben).
        setInvestmentMetaFields(investmentId, { setterSkript: snapshot });
      } else {
        // mergeKontaktMeta zieht den Zwischenspeicher gleich mit nach. Ohne das
        // schreibt das naechste updateKontakt ein veraltetes meta zurueck und
        // loescht das gerade gespeicherte Skript wieder.
        gespeichert = await mergeKontaktMeta(kunde.id, { setterSkript: snapshot });
      }
      if (!gespeichert) throw new Error("merge_kontakt_meta hat den Skriptstand nicht gespeichert");
      dirtyRef.current = false;
      speicherFehlerRef.current = 0;
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      console.error("[SetterErstgespraechsSkript] auto-save error", e);
      // bleibt dirty → wird beim nächsten Tastendruck / Flush erneut probiert
      speicherFehlerRef.current += 1;
      const jetzt = Date.now();
      if (speicherFehlerRef.current >= 2 && jetzt - letzterSpeicherHinweisRef.current > 30000) {
        letzterSpeicherHinweisRef.current = jetzt;
        toast({
          title: "Skriptstand nicht gespeichert",
          description: "Der aktuelle Stand konnte nicht gesichert werden. Bitte die Verbindung prüfen, das Speichern wird weiter versucht.",
          variant: "destructive",
        });
      }
    } finally {
      savingRef.current = false;
    }
  }, [kunde.id, investmentId, toast]);

  // Flush bei Tabwechsel / Schließen / Unmount, damit Notizen niemals verloren gehen.
  useEffect(() => {
    const flush = () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      void persistNow();
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [persistNow]);

  const setAntwort = (key: string, value: string) =>
    setDaten(d => ({ ...d, antworten: { ...d.antworten, [key]: value } }));
  const setNotiz = (id: string, value: string) =>
    setDaten(d => ({ ...d, notizen: { ...d.notizen, [id]: value } }));
  const toggleErledigt = (id: string) =>
    setDaten(d => ({ ...d, erledigt: { ...d.erledigt, [id]: !d.erledigt[id] } }));
  const toggleZiel = (z: string) =>
    setDaten(d => {
      const has = d.ziele.includes(z);
      let nextZiele: string[];
      if (has) {
        nextZiele = d.ziele.filter(x => x !== z);
      } else {
        if (d.ziele.length >= 3) {
          toast({ title: "Max. 3 Ziele", description: "Bitte entferne zuerst ein anderes Ziel.", variant: "destructive" });
          return d;
        }
        nextZiele = [...d.ziele, z];
      }
      // Bi-direktionale Sync mit Qualifizierungsfragen → qualZiel als Komma-Liste.
      try {
        updateKontakt(kunde.id, { qualZiel: nextZiele.join(", ") } as any);
      } catch (e) {
        console.error("[SetterErstgespraechsSkript] Ziele konnten nicht gespeichert werden", e);
        toast({
          title: "Ziel nicht gespeichert",
          description: "Die Auswahl konnte nicht übernommen werden. Bitte erneut versuchen.",
          variant: "destructive",
        });
        return d;
      }
      return { ...d, ziele: nextZiele };
    });

  // ── KI-Zusammenfassung erzeugen ──
  const generateAiSummary = useCallback(async () => {
    setSavingAi(true);
    try {
      // Jede Notiz einzeln und mit dem Titel ihres Skript-Schritts benannt.
      const notizenBenannt = Object.entries(daten.notizen)
        .filter(([, text]) => typeof text === "string" && text.trim() !== "")
        .map(([schrittId, text]) => {
          const titel = SCHRITTE.find((sch) => sch.id === schrittId)?.titel
            || LEGACY_SCHRITT_TITEL[schrittId]
            || schrittId;
          return `Notiz zu „${titel}": ${String(text).trim()}`;
        })
        .join("\n");
      const a = daten.antworten;
      const payload = {
        modus: "kunde",
        vorname: kunde.vorname,
        nachname: kunde.nachname,
        beruf: a.beruf,
        arbeitgeber: a.arbeitgeber,
        familienstand: a.familienstand,
        nettoEinkommen: (kunde as any).qualEinkommen || "",
        eigenkapital: (kunde as any).qualEigenkapital || "",
        sparformen: a.sparformen,
        investitionMonat: a.investitionMonat,
        verbindlichkeit: a.verbindlichkeitSkala,
        // Frühere Gespräche tragen hier noch Cashflow oder Qualität; neu steht der Schwerpunkt im Motiv-Feld.
        cashflowPraeferenz: a.cashflowPraeferenz,
        ziele: daten.ziele.join(", "),
        motivation: [
          a.schwerpunkt ? `Schwerpunkt: ${SCHWERPUNKT_WERTE[a.schwerpunkt] ?? a.schwerpunkt}` : "",
          a.motivWoertlich ? `Motiv wörtlich: ${a.motivWoertlich}` : "",
          a.zweiPunkte ?? "",
        ].filter(Boolean).join(" · "),
        erfahrung: a.erfahrung,
        offeneFragen: a.offeneFragen,
        notizenBenannt,
        antwortenJson: JSON.stringify(a),
      };
      const { data, error } = await supabase.functions.invoke("erstgespraech-zusammenfassung", { body: payload });
      // Mit dem Grund aus der Antwort, etwa „Zusammenfassung gerade nicht möglich“ (503).
      if (error) throw await edgeFehlerMitGrund(error, { functionName: "erstgespraech-zusammenfassung" });
      const summary: string = (data as any)?.summary || "";
      if (!summary) throw new Error("Leere KI-Antwort");

      const updated: SkriptDaten = { ...daten, kiZusammenfassung: summary, aktualisiertAm: new Date().toISOString() };
      setDaten(updated);

      if (investmentId) {
        setInvestmentMetaFields(investmentId, { setterSkript: updated, gespraechsnotizenAI: summary });
      } else {
        // Legacy-Kontakt-Scope. mergeKontaktMeta zieht den Zwischenspeicher nach,
        // sonst schreibt das direkt folgende updateKontakt den alten Stand zurueck.
        await mergeKontaktMeta(kunde.id, { setterSkript: updated, gespraechsnotizenAI: summary });
        updateKontakt(kunde.id, { gespraechsnotizenAI: summary } as any);
      }

      onSummaryGenerated?.(summary);
      onUpdate();
      toast({ title: "KI-Zusammenfassung erstellt ✓", description: "Wird Setter und Berater in den Gesprächsnotizen angezeigt." });
    } catch (e: any) {
      console.error(e);
      toast({ title: "KI-Zusammenfassung fehlgeschlagen", description: e?.message || "Bitte später erneut versuchen.", variant: "destructive" });
    } finally {
      setSavingAi(false);
    }
  }, [daten, kunde, onUpdate, onSummaryGenerated, toast]);

  useImperativeHandle(ref, () => ({
    generateAiSummary,
    hasInput: () => Object.keys(daten.antworten).length + Object.keys(daten.notizen).length + daten.ziele.length > 0,
    persistNow,
    stand: () => latestRef.current,
  }), [generateAiSummary, daten, persistNow]);

  const filledCount =
    Object.values(daten.antworten).filter(v => (v || "").trim().length > 0).length +
    Object.values(daten.notizen).filter(v => (v || "").trim().length > 0).length +
    (daten.ziele.length > 0 ? 1 : 0);

  // Hat das Skript noch keine Ziele, aber qualZiel ist schon gepflegt (etwa
  // über die Meta-Kampagne), wird es einmalig vorbefüllt.
  useEffect(() => {
    if (daten.ziele.length > 0) return;
    const qz = ((kunde as any).qualZiel || "").toString();
    if (!qz) return;
    const parts = qz
      .split(/[,;\n]/)
      .map((p: string) => p.trim())
      .filter(Boolean)
      .filter((p: string) => ZIELE_GUELTIG.includes(p))
      .slice(0, 3);
    if (parts.length > 0) {
      setDaten(d => ({ ...d, ziele: parts }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(kunde as any).qualZiel]);

  // Termin-Daten STRIKT pro Investment lesen — Kontakt-Level nur als Fallback
  // für das erste Investment (Legacy).
  const terminDatum = (investmentId
    ? getInvestmentMetaField<string | undefined>(investmentId, "setterTerminDatum", undefined)
    : undefined)
    ?? (isFirstInvestment ? ((kunde as any).setterTerminDatum as string | undefined) : undefined);
  const terminUhrzeit = (investmentId
    ? getInvestmentMetaField<string | undefined>(investmentId, "setterTerminUhrzeit", undefined)
    : undefined)
    ?? (isFirstInvestment ? ((kunde as any).setterTerminUhrzeit as string | undefined) : undefined);
  const beraterName = (investmentId
    ? getInvestmentMetaField<string | undefined>(investmentId, "setterSelectedBerater", undefined)
    : undefined)
    ?? (isFirstInvestment ? ((kunde as any).berater || (kunde as any).setterCloser) : undefined);

  const nachname = (kunde.nachname || "").trim();

  /**
   * Werte für die Zusammenfassung in Schritt 17. Fehlt ein Wert, bleibt der
   * Platzhalter in eckigen Klammern stehen: Dann sieht der Anrufer, was offen ist.
   */
  const ant = daten.antworten;
  const zielLabel = (wert: string) => ZIELE_AUSWAHL.find((z) => z.wert === wert)?.label ?? wert;
  // Wörtliche Sätze des Kunden in Anführungszeichen, ohne doppelten Schlusspunkt.
  const zitat = (t?: string) => {
    const kern = (t || "").trim().replace(/^[„"“]+|[“"”]+$/g, "").replace(/\.$/, "").trim();
    return kern ? `„${kern}“` : "";
  };
  const zusammenfassungWerte: Record<string, string> = {
    "Beruf": [ant.beruf || (kunde as any).qualBeruflicheSituation, ant.arbeitgeber].filter(Boolean).join(" bei "),
    "wichtigstes Ziel": daten.ziele[0] ? zielLabel(daten.ziele[0]) : "",
    "Motiv": zitat(ant.motivWoertlich),
    "Vorsorge": ant.sparformen || "",
    "Lücke": lueckeText(ant.wunschNetto, ant.renteErwartet),
    "Reserve": ant.reserve ? `${ant.reserve.replace(/\s*€\s*$/, "")} €` : "",
    "tragbarer Betrag": ant.investitionMonat ? `${ant.investitionMonat.replace(/\s*€\s*$/, "")} €` : "",
    "Sorge": zitat(ant.sorgen),
    "Mitentscheider": ant.mitentscheider || "",
  };

  const interpolate = (s: string, mitZusammenfassung = false) => {
    let t = s
      .replace(/\[Vorname\]/g, kunde.vorname || "[Vorname]")
      .replace(/\[Nachname\]/g, nachname || "[Nachname]")
      .replace(/\[Dein Name\]/g, callerFullName || "[Dein Name]")
      .replace(/\[Quelle\]/g, quelleSatz(kunde as any));
    if (mitZusammenfassung || /\[Mitentscheider\]/.test(t)) {
      for (const [platzhalter, wert] of Object.entries(zusammenfassungWerte)) {
        if (wert.trim()) t = t.split(`[${platzhalter}]`).join(wert.trim());
      }
    }
    return t;
  };

  const [mehrOffen, setMehrOffen] = useState<Record<string, boolean>>({});

  const mitentscheiderVariante = waehleMitentscheiderVariante(daten.antworten.familienstand);
  const BERUF_OPTIONS = ["Angestellt", "Selbstständig", "Beamter", "Rentner", "Student", "Arbeitssuchend"];
  const BERUF_MAP: Record<string, string> = {
    "angestellt": "Angestellt", "selbststaendig": "Selbstständig", "selbstständig": "Selbstständig",
    "unternehmer": "Selbstständig", "freiberufler": "Selbstständig", "beamter": "Beamter", "beamtin": "Beamter",
    "rentner": "Rentner", "student": "Student", "arbeitslos": "Arbeitssuchend", "arbeitssuchend": "Arbeitssuchend",
  };

  const Sprechtext = ({ text }: { text: string }) => (
    <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-primary">
      <p className="text-sm whitespace-pre-line">{text}</p>
    </div>
  );

  return (
    <TooltipProvider>
    <Card className="p-0 overflow-hidden border-primary/30">
      <div className="w-full flex items-center gap-3 p-6 border-b">
        <ClipboardList className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <h3 className="font-bold">Erstgesprächs-Skript</h3>
          <p className="text-xs text-muted-foreground">
            {SCHRITTE_EFFECTIVE.length} Schritte in 6 Phasen, etwa 25 bis 30 Minuten • {isVpMode ? <>Du qualifizierst und terminierst direkt für <strong>dich selbst</strong>.</> : <>Wird nur ausgefüllt, wenn der Lead <strong>erreicht</strong> wurde.</>} Auto-Save aktiv • wir duzen.
          </p>
        </div>
        {filledCount > 0 && <Badge variant="secondary" className="text-xs">{filledCount} ausgefüllt</Badge>}
        {savedFlash && <span className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1"><Save className="h-3 w-3" /> gespeichert</span>}
      </div>

      <div className="p-6 space-y-6">
        {/* Aufbau, Haltung und Schnellhilfe: aufklappbar, damit das Skript selbst oben steht. */}
        <div className="rounded-lg border bg-muted/20">
          <button
            type="button"
            onClick={() => setHilfeOffen((o) => !o)}
            aria-expanded={hilfeOffen}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold"
          >
            So ist das Skript aufgebaut · Reaktionen am Telefon · Das sagen wir nie
            {hilfeOffen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {hilfeOffen && (
            <div className="px-4 pb-4 space-y-4 text-sm">
              <ul className="text-xs divide-y">
                {PHASEN.map((p) => (
                  <li key={p.kennung} className="py-1.5">
                    <span className="font-semibold">{p.kennung} {p.titel}</span>
                    <span className="text-muted-foreground"> · Schritte {p.schritte} · {p.dauer}</span>
                    <span className="block text-muted-foreground">{p.ziel}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg border-l-4 border-primary bg-primary/5 p-3 text-xs leading-relaxed">
                <strong>Haltung:</strong> Erst verstehen, dann empfehlen. Der Kunde spricht etwa zwei Drittel der Zeit. Im Erstgespräch zeigen wir kein Objekt, fragen nicht nach Steuer-ID oder Ausweis und nennen keine Renditen und keine Steuerzusagen. Gesamtdauer etwa 25 bis 30 Minuten, am Telefon oder per Video.
              </p>
              <div>
                <p className="font-semibold text-xs mb-2">Reaktionen am Telefon</p>
                <div className="grid gap-2">
                  {REAKTIONEN.map((r) => (
                    <div key={r.kunde} className="grid sm:grid-cols-[minmax(0,14rem)_1fr] gap-1 sm:gap-3 text-xs border-t pt-2">
                      <span className="font-medium">{r.kunde}</span>
                      <span className="text-muted-foreground">{r.antwort}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold text-xs mb-1">Das sagen wir nie</p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  {NIE_SAGEN.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>

        {SCHRITTE_EFFECTIVE.map(s => (
          <Fragment key={s.id}>
          {s.phase && (
            <div className="flex items-center gap-3 pt-2" data-testid={`phase-${s.phase.kennung}`}>
              <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold tracking-wider text-primary-foreground">PHASE {s.phase.kennung}</span>
              <span className="font-semibold">{s.phase.titel}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <div data-ui="card" className="rounded-lg border bg-card/40">
            <div className="flex items-center gap-2 p-3 border-b bg-muted/30 flex-wrap">
              <Checkbox
                checked={!!daten.erledigt[s.id]}
                onCheckedChange={() => toggleErledigt(s.id)}
              />
              <span className="font-semibold text-sm">{s.nr}. {s.titel}</span>
              {s.marke && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{s.marke}</Badge>
              )}
            </div>
            <div className="p-4 space-y-3">
                  {s.text && <Sprechtext text={interpolate(s.text, s.special === "zusammenfassung")} />}

                  {/* Schritt 5: Folgesatz je nach Familienstand */}
                  {s.special === "familienstand" && (
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">Familienstand</Label>
                      <AuswahlKnoepfe
                        optionen={FAMILIENSTAND_OPTIONEN}
                        wert={daten.antworten.familienstand || ""}
                        onChange={(v) => setAntwort("familienstand", v)}
                      />
                      {mitentscheiderVariante ? (
                        <div className="mt-3"><Sprechtext text={mitentscheiderVariante.text} /></div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-1.5">Nach der Auswahl erscheint hier der passende Folgesatz.</p>
                      )}
                    </div>
                  )}

                  {/* Schritt 18: beide Fassungen, die zum Ergebnis passende hervorgehoben */}
                  {s.special === "einschaetzung" && (
                    <div className="space-y-2">
                      {(["passt", "passtNicht"] as const).map((k) => {
                        const ergebnis = daten.antworten.ergebnis;
                        const gedimmt = ergebnis && (ergebnis === "passt") !== (k === "passt");
                        const grund = daten.antworten.grundNichtPassend;
                        const text = EINSCHAETZUNG[k];
                        return (
                          <div key={k} className={gedimmt ? "opacity-40" : ""}>
                            <Sprechtext text={grund && k === "passtNicht" ? text.split("[Grund]").join(grund) : text} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/*
                    Einwandbehandlung an Ort und Stelle. Zeigt nur die Einwände,
                    die in genau diesem Schritt typischerweise kommen.
                  */}
                  <EinwandSchnellhilfeKompakt skriptSchritt={s.id} />

                  {s.special === "einleitung" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEinleitungJa(v => !v)}
                        className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                          einleitungJa
                            ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] font-semibold"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        {einleitungJa ? "Ja, hat Zeit ✓" : "Ja, hat Zeit"}
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onFollowUp?.()}
                        disabled={!onFollowUp}
                        className="gap-2 border-[hsl(var(--warning))]/50 hover:bg-[hsl(var(--warning))]/10 h-auto py-3"
                      >
                        <PhoneForwarded className="h-4 w-4 text-[hsl(var(--warning))]" />
                        Rückruf vereinbaren
                      </Button>
                    </div>
                  )}

                  {s.special === "ziele" && (
                    <UebernahmeRahmen feld="ziele">
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">
                        Bis zu drei Ziele auswählen
                        <Pflichtmarke gefuellt={daten.ziele.length > 0} />
                      </Label>
                      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 rounded-lg border p-2 ${PFLICHT_RAHMEN}`}>
                        {[...ZIELE_AUSWAHL, ...daten.ziele.filter((z) => !ZIELE_AUSWAHL.some((a) => a.wert === z)).map((z) => ({ wert: z, label: `${z} (früher)` }))].map(z => {
                          const selected = daten.ziele.includes(z.wert);
                          return (
                            <button
                              key={z.wert}
                              type="button"
                              onClick={() => toggleZiel(z.wert)}
                              className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                                selected ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/50"
                              }`}
                            >
                              {selected && "✓ "}{z.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {s.special === "netto" && (
                    <UebernahmeRahmen feld="qualEinkommen">
                    <div>
                      <Label className="text-xs font-semibold">
                        Netto-Einkommen / Monat (€) — synchron mit Qualifizierungsfragen
                        <Pflichtmarke gefuellt={!!(kunde as any).qualEinkommen} />
                      </Label>
                      <QualSyncInput
                        kundeId={kunde.id}
                        field="qualEinkommen"
                        initialValue={(kunde as any).qualEinkommen || ""}
                        placeholder="z.B. 3.000-3.500"
                        onUpdate={onUpdate}
                        className={PFLICHT_RAHMEN}
                      />
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {s.special === "eigenkapital" && (
                    <UebernahmeRahmen feld="qualEigenkapital">
                    <div>
                      <Label className="text-xs font-semibold">
                        Eigenkapital einsetzbar (€) — synchron mit Qualifizierungsfragen
                        <Pflichtmarke gefuellt={!!(kunde as any).qualEigenkapital} />
                      </Label>
                      <QualSyncInput
                        kundeId={kunde.id}
                        field="qualEigenkapital"
                        initialValue={(kunde as any).qualEigenkapital || ""}
                        placeholder="z.B. 30.000-50.000"
                        onUpdate={onUpdate}
                        className={PFLICHT_RAHMEN}
                      />
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {s.special === "skala" && (
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">Verbindlichkeit (1 bis 10)</Label>
                      <div className="grid grid-cols-10 gap-1">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => {
                          const active = daten.antworten.verbindlichkeitSkala === String(n);
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAntwort("verbindlichkeitSkala", active ? "" : String(n))}
                              className={`h-9 text-xs rounded-md border transition-colors ${
                                active ? "border-primary bg-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted/50"
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {s.tipp && (
                    <div className="bg-accent/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground"><strong>💡 Hinweis:</strong> {s.id === "familiaere_situation" && mitentscheiderVariante ? mitentscheiderVariante.tipp : s.tipp}</p>
                      {s.tippMehr && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMehrOffen(m => ({ ...m, [s.id]: !m[s.id] }))}
                            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            {mehrOffen[s.id] ? <><ChevronUp className="h-3 w-3" /> Weniger</> : <><ChevronDown className="h-3 w-3" /> Mehr Kontext</>}
                          </button>
                          {mehrOffen[s.id] && (
                            <p className="text-[11px] text-muted-foreground mt-1 pl-1 border-l-2 border-primary/30 ml-0.5">
                              {s.tippMehr}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {s.fragen?.map(f => {
                    // Beruf ist mit der Qualifizierung synchron (qualBeruflicheSituation).
                    const isBerufField = f.key === "beruf";
                    const qualBeruf = (kunde as any).qualBeruflicheSituation || "";
                    const skriptValue = daten.antworten[f.key] || "";
                    const value = isBerufField ? (skriptValue || qualBeruf) : skriptValue;
                    const handleChange = (v: string) => {
                      setAntwort(f.key, v);
                      if (isBerufField) updateKontakt(kunde.id, { qualBeruflicheSituation: v } as any);
                    };
                    const normalizedBerufValue = isBerufField ? (BERUF_MAP[(value || "").trim().toLowerCase()] || value) : value;
                    const gefuellt = !!(isBerufField ? normalizedBerufValue : value).trim();
                    // Der Grund erscheint nur, wenn es nicht passt.
                    if (f.key === "grundNichtPassend" && daten.antworten.ergebnis !== "passt nicht") return null;
                    return (
                      <UebernahmeRahmen key={f.key} feld={f.key}>
                      <div>
                        <Label className="text-xs font-semibold">
                          {f.label}
                          {isBerufField && <span className="ml-1 text-[10px] text-muted-foreground font-normal">— synchron mit Qualifizierungsfragen</span>}
                          {f.pflicht && <Pflichtmarke gefuellt={gefuellt} />}
                        </Label>
                        {isBerufField ? (
                          <Select value={normalizedBerufValue} onValueChange={(v) => handleChange(v)}>
                            <SelectTrigger className={`mt-1 ${PFLICHT_RAHMEN}`}><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                            <SelectContent>
                              {BERUF_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : f.typ ? (
                          <AuswahlKnoepfe
                            optionen={f.optionen ?? []}
                            wert={value}
                            onChange={handleChange}
                            werte={f.werte}
                            mehrfach={f.typ === "mehrfach"}
                            pflichtLeer={f.pflicht && !gefuellt}
                          />
                        ) : f.multiline ? (
                          <Textarea value={value} onChange={e => handleChange(e.target.value)} placeholder={f.placeholder} rows={3} className="mt-1" />
                        ) : (
                          <Input
                            value={value}
                            onChange={e => handleChange(e.target.value)}
                            placeholder={f.placeholder}
                            className={`mt-1 ${f.pflicht ? PFLICHT_RAHMEN : ""}`}
                          />
                        )}
                      </div>
                      </UebernahmeRahmen>
                    );
                  })}

                  {/* Schritt 8: die Lücke, sobald beide Werte da sind */}
                  {s.special === "rentenluecke" && lueckeText(daten.antworten.wunschNetto, daten.antworten.renteErwartet) && (
                    <p className="text-sm rounded-lg bg-primary/5 border border-primary/20 p-3">
                      Lücke: <strong>{lueckeText(daten.antworten.wunschNetto, daten.antworten.renteErwartet)}</strong> im Monat. Die Beratungspräsentation rechnet daraus den Betrag über 25 Jahre.
                    </p>
                  )}

                  {s.notiz && (
                    <div>
                      <Label className="text-xs font-semibold">{s.notizLabel ?? "Notiz"}</Label>
                      <Textarea
                        value={daten.notizen[s.id] || ""}
                        onChange={e => setNotiz(s.id, e.target.value)}
                        placeholder="Deine Notiz zu diesem Punkt..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {s.id === "terminvereinbarung" && terminSlot && (
                    <div className="mt-3">{terminSlot}</div>
                  )}

                  {s.id === "verabschiedung" && (terminDatum || terminUhrzeit) && (
                    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-semibold">Termin nochmal bestätigen:</p>
                        <p className="text-muted-foreground">
                          {beraterName ? <>Mit <strong>{beraterName}</strong> </> : null}
                          am <strong>{terminDatum || "—"}</strong> um <strong>{terminUhrzeit || "—"} Uhr</strong>.
                        </p>
                      </div>
                    </div>
                  )}
            </div>
          </div>
          </Fragment>
        ))}

          {abschlussSlot && (
            <div className="mt-2">{abschlussSlot}</div>
          )}

          {savingAi && (
            <div className="border-t pt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> KI-Zusammenfassung wird erzeugt …
            </div>
          )}
      </div>
    </Card>
    </TooltipProvider>
  );
});
