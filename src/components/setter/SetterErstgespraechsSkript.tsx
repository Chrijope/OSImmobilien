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
import { ClipboardList, Sparkles, Loader2, CheckCircle2, Save, CalendarClock, Mic, Smile, UserRound, PhoneForwarded, Check, ChevronDown, ChevronUp, ArrowRightLeft } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { updateKontakt, mergeKontaktMeta, type KundeData } from "@/lib/kundenStore";
import { useUser } from "@/contexts/UserContext";
import { setInvestmentMetaFields, getInvestmentMetaField } from "@/lib/investmentsStore";
import type { DetailFeld, DetailSchritt, ZusammenfassungSchritt } from "@/lib/erstgespraechZusammenfassung";

interface Props {
  kunde: KundeData;
  onUpdate: () => void;
  /** Optional Callback wenn KI-Zusammenfassung erzeugt wurde (für übergeordnete UI). */
  onSummaryGenerated?: (summary: string) => void;
  /** Slot, der innerhalb von Schritt 14 (Terminvereinbarung) gerendert wird. */
  terminSlot?: ReactNode;
  /** Slot, der innerhalb von Schritt 17 (Abschluss-Checkliste) gerendert wird. */
  abschlussSlot?: ReactNode;
  /** Callback für "Follow-Up" Button in Schritt 1 (öffnet Folgetermin-Dialog – gleiche Logik wie Gesprächsausgang). */
  onFollowUp?: () => void;
  /**
   * Callback für den NEUEN Schritt 3 (Zeit-Check). Wird mit Datum + Uhrzeit aufgerufen,
   * wenn der Lead jetzt keine Zeit für 15-20 Min hat. Logik wie Gesprächsausgang →
   * Follow-Up, Titel "Erstgespräch (Vorname Nachname)".
   */
  onErstgespraechFollowUp?: (datum: string, uhrzeit: string) => void;
  /**
   * Modus: "setter" = Setterin qualifiziert für Vertriebspartner (Default).
   * "vertriebspartner" = VP ruft selbst an, qualifiziert und terminiert für sich selbst.
   * Wirkt sich auf Wording einzelner Schritte (u.a. Schritt 18) aus.
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
}

// ── Lokalisiert: Du / Sie Variante ──
type LocText = string | { du: string; sie: string };
function pickText(t: LocText | undefined, anrede: Anrede): string {
  if (!t) return "";
  if (typeof t === "string") return t;
  return anrede === "sie" ? t.sie : t.du;
}

type Anrede = "du" | "sie";

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
 * Die vier Pflichtangaben aus dem Erstgespräch: Beruf, Nettoeinkommen,
 * Eigenkapital und Ziele. Ohne sie lässt sich weder eine Finanzierung noch ein
 * passendes Objekt rechnen, und das Beratungsgespräch beginnt mit Nachfragen,
 * die ins Erstgespräch gehört hätten.
 *
 * Sie blockieren bewusst nichts. Ein Skript, das ein laufendes Telefonat
 * anhält, wird umgangen statt ausgefüllt. Sie sind nur sichtbar markiert,
 * orange umrandet und am Etikett benannt.
 *
 * Die Farbe allein trägt die Information nicht: Wer sie nicht unterscheiden
 * kann, liest das Wort „Pflichtangabe" daneben.
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
 * Erstgesprächs-Zusammenfassung und die KI-Zusammenfassung zählen nicht,
 * denn die lesen jede Antwort und jede Notiz. Zählten sie, wäre alles
 * markiert und die Markierung sagte nichts mehr.
 *
 * Quellen, falls sich etwas ändert:
 *   qualEinkommen, qualEigenkapital, beruf (qualBeruflicheSituation),
 *   ziele (qualZiel): Qualifizierung im Kundenprofil und Lead-Verwaltung,
 *   Einkommen und Ziele auch in der Setter-Kennzahl „Qualifiziert“.
 *   Beratungspräsentation (BeratungspraesentationHV, holeAusErstgespraech):
 *   qualEinkommen, qualEigenkapital, investitionMonat, erfahrung, ziele;
 *   die Anrede über beratungAnrede.ts.
 *   cashflowPraeferenz: Kontakt-Meta qualCashflowPraeferenz.
 */
export const UEBERNAHME_ZIELE: Record<string, string> = {
  anrede: "Du oder Sie in der Beratungspräsentation",
  erfahrung: "Beratungspräsentation, Feld Erfahrung",
  qualEigenkapital: "Qualifizierung im Kundenprofil, Lead-Verwaltung und Eigenkapital in der Beratungspräsentation",
  investitionMonat: "Monatsbeitrag in der Beratungspräsentation",
  beruf: "Berufliche Situation in der Qualifizierung im Kundenprofil und in der Lead-Verwaltung",
  qualEinkommen: "Qualifizierung im Kundenprofil, Lead-Verwaltung und Einnahmen in der Beratungspräsentation",
  ziele: "Ziel in der Qualifizierung im Kundenprofil, Pipeline, Lead-Verwaltung und Beratungspräsentation",
  cashflowPraeferenz: "Kundendaten, Erwartung Cashflow oder Qualität",
};

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

interface Schritt {
  id: string;
  nr: number;
  /**
   * Anzeige-Nummer, wenn sie von `nr` abweicht (z.B. "4a" für den
   * Zwischenschritt Familiäre Situation). So behalten alle Folgepunkte ihre
   * gewohnten Nummern.
   */
  nrText?: string;
  titel: string;
  text?: LocText;
  tipp?: LocText;
  /** Optionaler ausklappbarer "Mehr Kontext"-Text – längere Erklärungen, damit der Setter im Gespräch bleibt. */
  tippMehr?: LocText;
  /** Optional-Badge, wenn ein Schritt nur situativ genutzt werden soll. */
  optional?: boolean;
  fragen?: { key: string; label: LocText; placeholder?: string; multiline?: boolean }[];
  notiz?: boolean; // Freitext-Notiz aktivieren
  special?: "anrede" | "einleitung" | "netto" | "moreimmoVorstellung" | "sparformen" | "skala" | "cashflowErwartung" | "familienstand";
}

const ZIELE_OPTIONEN = [
  "Altersvorsorge", "Steuern sparen", "Vermögensaufbau", "Passives Einkommen",
  "Inflationsschutz", "Eigenkapitalaufbau", "Familie absichern", "Frühe Rente", "Unabhängigkeit",
];

const SCHRITTE: Schritt[] = [
  // 1) Einleitung & Begrüßung — IMMER in Sie-Form (Erstkontakt, Anrede noch nicht geklärt)
  { id: "einleitung", nr: 1, titel: "Einleitung & Begrüßung",
    special: "einleitung",
    text: {
      du:  `"Guten Tag [Vorname] [Nachname], hier ist [dein Name] von OS Immobilien, gut, dass ich Sie erreiche. Sie haben sich über unsere Social-Ads-Anzeige für Immobilien als Kapitalanlage interessiert. Ich brauche fünfzehn Minuten für das, was ich mit Ihnen durchgehen möchte. Haben Sie die jetzt, oder passt Ihnen heute Abend gegen 18 Uhr besser?"`,
      sie: `"Guten Tag [Vorname] [Nachname], hier ist [dein Name] von OS Immobilien, gut, dass ich Sie erreiche. Sie haben sich über unsere Social-Ads-Anzeige für Immobilien als Kapitalanlage interessiert. Ich brauche fünfzehn Minuten für das, was ich mit Ihnen durchgehen möchte. Haben Sie die jetzt, oder passt Ihnen heute Abend gegen 18 Uhr besser?"`,
    },
    tipp: `Ehrlicher Zeitrahmen plus Alternativfrage. Auch ein Nein wird so zum Rückruftermin.`,
    tippMehr: `Energie in die Stimme, nicht abgelesen klingen. Der Social-Ads-Hook holt den Aha-Moment: "Ach ja, stimmt!". Fuenfzehn Minuten sind ehrlich, "ein paar Minuten" war es nicht: Das Skript braucht sie wirklich, und ein Abbruch mitten in der Qualifizierung kostet den Termin ganz. Wer jetzt keine Zeit hat, bekommt sofort die Alternative genannt statt eines vagen "melde mich".` },

  // 2) Anrede klären — IMMER in Sie-Form (Anrede wird erst hier festgelegt)
  { id: "anrede", nr: 2, titel: "Anrede klären (Du oder Sie?)",
    special: "anrede",
    text: {
      du:  `"Eine Sache vorweg: Sind Sie per Du unterwegs, oder bleiben wir beim Sie?"`,
      sie: `"Eine Sache vorweg: Sind Sie per Du unterwegs, oder bleiben wir beim Sie?"`,
    },
    tipp: `Du = mehr Nähe, Sie = mehr Respekt. Lead entscheidet, Skript schaltet ab Punkt 3 automatisch um.`,
    tippMehr: `Wer "Du" sagt, öffnet sich emotional schneller. Wenn der Lead beim Sie bleibt: ernst nehmen – das gesamte restliche Skript inkl. E-Mails respektiert das.` },

  // 3) Zielsetzung des Erstgesprächs erklären (ab hier: gewählte Anrede)
  { id: "ziel_gespraech", nr: 3, titel: "Ziel des Erstgesprächs",
    text: {
      du:  `"Kurz zum Ablauf: Ich stelle dir ein paar Fragen zu deiner Situation und deinen Zielen. Danach weißt du, ob wir zu dir passen, und ich weiß, was zu dir passt. Einverstanden?"`,
      sie: `"Kurz zum Ablauf: Ich stelle Ihnen ein paar Fragen zu Ihrer Situation und Ihren Zielen. Danach wissen Sie, ob wir zu Ihnen passen, und ich weiß, was zu Ihnen passt. Einverstanden?"`,
    },
    tipp: `Klare Erwartung, weniger Druck. Kurz halten, in Sekunde vierzig will niemand eine Agenda hoeren.` },

  { id: "warmup", nr: 4, titel: "Warm-up",
    text: {
      du:  `"Erzähl mir mal ganz kurz, [Vorname] – was hat dich aktuell zum Thema Immobilien als Kapitalanlage gebracht, und warum gerade jetzt? Was hat sich beruflich, privat oder finanziell verändert, dass du jetzt aktiv wirst – egal ob du neu einsteigst oder dein bestehendes Portfolio erweitern möchtest?"`,
      sie: `"Erzählen Sie mir kurz, [Name] – was hat Sie aktuell zum Thema Immobilien als Kapitalanlage gebracht, und warum gerade jetzt? Was hat sich beruflich, privat oder finanziell verändert, dass Sie jetzt aktiv werden – egal ob Sie neu einsteigen oder Ihr bestehendes Portfolio erweitern möchten?"`,
    },
    tipp: `Auslöser + "Warum jetzt" in einem – stärkster emotionaler Closing-Anker.`,
    tippMehr: `Typische Trigger: neuer Job, Gehaltserhöhung, Kinder geboren, Erbe, Steuerlast gestiegen, Zinsen wieder attraktiv. Reden lassen, spiegeln ("Spannend, das hoer ich oft …"), Stichworte notieren.\n\nWICHTIG, immer nachfassen: "Und wenn du das jetzt nicht angehst, wo stehst du dann in fuenf Jahren?" Der Ausloeser allein ist nur Information. Erst der Preis des Nichthandelns macht den Termin wichtig. Danach Pause machen und aushalten.`,
    notiz: true },

  // 4a) Brücke zwischen Warm-up und Mitentscheider: Erst die familiäre
  // Situation erfragen, dann ergibt die Mitentscheider-Frage in Punkt 5 Sinn
  // und der Sprechtext dort kann sich an die Antwort anpassen. Bewusst als
  // "4a" nummeriert, damit alle Folgepunkte ihre gewohnten Nummern behalten.
  { id: "familiaere_situation", nr: 4, nrText: "4a", titel: "Familiäre Situation",
    special: "familienstand",
    text: {
      du:  `"Und wie ist denn deine familiäre Situation, [Vorname]? Bist du ledig, verheiratet oder in einer Partnerschaft?"`,
      sie: `"Und wie ist denn Ihre familiäre Situation, [Name]? Sind Sie ledig, verheiratet oder in einer Partnerschaft?"`,
    },
    tipp: `Beiläufig stellen, direkt nach dem Warm-up wirkt die Frage natürlich. Die Antwort schaltet den Sprechtext in Punkt 5 automatisch um.`,
    notiz: true },

  { id: "mitentscheider", nr: 5, titel: "Mitentscheider",
    // Neutraler Standardtext. Sobald die Brückenfrage 4a beantwortet ist,
    // wird Text und Tipp über waehleMitentscheiderVariante() ersetzt.
    text: {
      du:  `"Eine kurze Frage – entscheidet ihr solche Themen gemeinsam? Falls ja, suchen wir gleich einen Termin, an dem ihr beide könnt. An welchen Abenden passt es euch zusammen?"`,
      sie: `"Eine kurze Frage – entscheiden Sie solche Themen gemeinsam? Falls ja, suchen wir gleich einen Termin, an dem Sie beide können. An welchen Abenden passt es Ihnen zusammen?"`,
    },
    tipp: `Nicht empfehlen, sondern gleich gemeinsam terminieren. Ein Ratschlag laesst sich ignorieren, die Terminfrage nicht.`,
    fragen: [{
      key: "mitentscheider",
      label: { du: "Mitentscheider:in & ob sie dabei sein sollte", sie: "Mitentscheider:in & ob sie dabei sein sollte" },
      placeholder: "z.B. Ehefrau Anna, sollte beim Beratungsgespräch dabei sein",
    }] },

  { id: "erfahrung", nr: 6, titel: "Immobilien-Erfahrung",
    text: {
      du:  `"Welche Erfahrung hast du bisher mit Immobilien? Schon erste Informationen eingeholt oder noch Neuland?"`,
      sie: `"Welche Erfahrung haben Sie bisher mit Immobilien? Schon erste Informationen eingeholt oder noch Neuland?"`,
    },
    tipp: `Erfahrungsstand abklaeren, das steuert die Tiefe deiner Beratung im Folgetermin.`,
    fragen: [{
      key: "erfahrung",
      label: { du: "Immobilien-Erfahrung", sie: "Immobilien-Erfahrung" },
      placeholder: "z.B. Schon Informationen eingeholt, noch Neuland...",
    }] },

  // 7) Bisherige Sparformen + Eigenkapital (sync mit Qualifizierungsfrage qualEigenkapital)
  { id: "sparformen", nr: 7, titel: "Sparformen & Eigenkapital",
    special: "sparformen",
    text: {
      du:  `"Welche Sparformen nutzt du aktuell – ETF, Tagesgeld, Bausparer, Aktien? Und wie viel Eigenkapital könntest du davon ungefähr nachweisen? In den meisten Fällen reicht es schon, das Eigenkapital nachzuweisen — du musst es nicht zwingend einsetzen. Eine Range reicht völlig."`,
      sie: `"Welche Sparformen nutzen Sie aktuell – ETF, Tagesgeld, Bausparer, Aktien? Und wie viel Eigenkapital könnten Sie davon ungefähr nachweisen? In den meisten Fällen reicht es schon, das Eigenkapital nachzuweisen — Sie müssen es nicht zwingend einsetzen. Eine Range reicht völlig."`,
    },
    tipp: `Wichtig: nachweisen ≠ einsetzen. Nimmt sofort Druck raus.`,
    tippMehr: `Banken verlangen i.d.R. einen Eigenkapital-Nachweis (Kontoauszug, Depot-Auszug), das Kapital muss aber nicht zwingend in den Kauf fließen. Diese Klarstellung holt viele "ich hab' aber nichts flüssig"-Leads zurück. Wert wird automatisch mit der Qualifizierungsfrage synchronisiert.`,
    fragen: [{
      key: "sparformen",
      label: { du: "Aktuelle Sparformen", sie: "Aktuelle Sparformen" },
      placeholder: "z.B. ETFs, Tagesgeld, Bausparvertrag, Aktien...",
    }] },

  { id: "investitionsbereitschaft", nr: 8, titel: "Monatliche Investitionsbereitschaft",
    text: {
      du:  `"Zur Einordnung, [Vorname]: Je nach Objektgröße liegt der monatliche Eigenanteil typischerweise im mittleren dreistelligen Bereich. Wo würdest du dich da einordnen? Eine Range reicht völlig."`,
      sie: `"Zur Einordnung, [Name]: Je nach Objektgröße liegt der monatliche Eigenanteil typischerweise im mittleren dreistelligen Bereich. Wo würden Sie sich da einordnen? Eine Range reicht völlig."`,
    },
    tipp: `Erst einordnen, dann fragen. Ohne Bezugswert nennt der Lead eine defensive Zahl, und die steht danach im CRM und begrenzt die Objektauswahl.`,
    fragen: [{
      key: "investitionMonat",
      label: { du: "Mtl. Investitionsbereitschaft", sie: "Mtl. Investitionsbereitschaft" },
      placeholder: "z.B. 300-500 €",
    }] },

  { id: "zwei_punkte", nr: 9, titel: "Wichtigste 2 Punkte",
    text: {
      du:  `"Wenn du zwei Sachen rauspicken müsstest – was ist für dich das Wichtigste beim Investment?"`,
      sie: `"Wenn Sie zwei Sachen rauspicken müssten – was ist für Sie das Wichtigste beim Investment?"`,
    },
    tipp: `Bewusst ohne Vorgaben fragen. Erst wenn gar nichts kommt, nachhelfen: Sicherheit, Rendite, Steuer, Lage, Passivitaet. Wer die Liste mitliefert, bekommt eine Antwort aus der Liste statt das echte Motiv.`,
    fragen: [{
      key: "zweiPunkte",
      label: { du: "Die 2 wichtigsten Punkte", sie: "Die 2 wichtigsten Punkte" },
      placeholder: "z.B. Sicherheit, Rendite, Steuerersparnis, Lage, Passivität...",
      multiline: true,
    }] },

  { id: "zusammenarbeit", nr: 10, titel: "Wichtig in der Zusammenarbeit",
    text: {
      du:  `"Was ist dir in der Zusammenarbeit mit mir am wichtigsten?"`,
      sie: `"Was ist Ihnen in der Zusammenarbeit mit mir am wichtigsten?"`,
    },
    tipp: `Liefert die Erwartungshaltung. Offen fragen, erst bei Stille nachhelfen: Erreichbarkeit, Transparenz, Tempo, persoenlich oder digital.`,
    notiz: true },

  { id: "berufliche_situation", nr: 11, titel: "Berufliche Situation",
    text: {
      du:  `"Damit ich dich später richtig einschätzen kann – was machst du beruflich und wo bist du beschäftigt?"`,
      sie: `"Damit ich Sie später richtig einschätzen kann – was machen Sie beruflich und wo sind Sie beschäftigt?"`,
    },
    fragen: [
      { key: "beruf",
        label: { du: "Was machst du beruflich? Position?", sie: "Was machen Sie beruflich? Position?" },
        placeholder: "z.B. Angestellter Ingenieur, Beamter, Selbstständig..." },
      { key: "arbeitgeber",
        label: { du: "Arbeitgeber & seit wann?", sie: "Arbeitgeber & seit wann?" },
        placeholder: "z.B. Siemens AG, seit 2019" },
    ] },

  // Reihenfolge bewusst: erst das Einkommen, dann die Schufa. Umgekehrt fragt
  // man erst nach Misstrauen und dann nach Geld, das ist die schlechteste
  // aller Reihenfolgen. Vor der Schufa steht ein Nutzensatz, damit der Block
  // nicht in einen Pruefungsmodus kippt.
  { id: "netto", nr: 12, titel: "Netto-Einkommen",
    special: "netto",
    text: {
      du:  `"Damit ich dir wirklich passende Optionen rechnen kann – wie hoch ist dein monatliches Nettoeinkommen ungefähr? Eine Range reicht völlig. Und hast du aktuell laufende Kredite oder Leasingraten?"`,
      sie: `"Damit ich Ihnen wirklich passende Optionen rechnen kann – wie hoch ist Ihr monatliches Nettoeinkommen ungefähr? Eine Range reicht völlig. Und haben Sie aktuell laufende Kredite oder Leasingraten?"`,
    },
    tipp: `Wert wird automatisch mit der Qualifizierungsfrage synchronisiert. Die laufenden Verpflichtungen mitfragen, sie kippen jede Bonitaetspruefung.`,
    notiz: true },

  { id: "schufa", nr: 13, titel: "Schufa",
    text: {
      du:  `"Kurz zum Hintergrund: Ich rechne dir vor dem Termin zwei Objekte durch, dafür muss ich wissen, mit welchen Bankkonditionen ich kalkulieren kann. Gibt es bei dir einen offenen Schufa-Eintrag, oder ist da alles glatt?"`,
      sie: `"Kurz zum Hintergrund: Ich rechne Ihnen vor dem Termin zwei Objekte durch, dafür muss ich wissen, mit welchen Bankkonditionen ich kalkulieren kann. Gibt es bei Ihnen einen offenen Schufa-Eintrag, oder ist da alles glatt?"`,
    },
    tipp: `Erst den Grund nennen, dann fragen. "Alles sauber" impliziert "schmutzig" und macht aus einer Sachfrage einen Vorwurf.`,
    notiz: true },

  { id: "ziele", nr: 14, titel: "Ziele",
    text: {
      du:  `"Welche 3 Ziele, [Vorname], sind dir bei einem möglichen Immobilieninvestment denn am wichtigsten?"`,
      sie: `"Welche 3 Ziele, [Name], sind Ihnen bei einem möglichen Immobilieninvestment denn am wichtigsten?"`,
    },
    tipp: `Maximal 3 Ziele anklicken oder freie Stichworte in den Notizen.`,
    notiz: true },

  // 15) NEU: Erwartungsrahmen Cashflow vs. Qualität — Einwand-Vorwegnahme + Einwand-Behandlung
  { id: "cashflow_erwartung", nr: 15, titel: "Erwartungsrahmen — Cashflow vs. Qualität",
    special: "cashflowErwartung",
    text: {
      du:  `"Eine Sache, die ich dir vorher ehrlich sagen möchte, [Vorname]: Eine Immobilie, die sich vor Steuern komplett selbst trägt, ist möglich — aber nur über drei Hebel: sehr hohe Rendite-Lage (oft B-/C-Stadt, mehr Risiko), spezielles Mietkonzept (WG/Möbliert/Co-Living, mehr Aufwand) oder sehr günstiger Einkauf (Sanierungsstau). Wenn du gleichzeitig Top-Lage, Neubau, ruhige Mieter und wenig Aufwand willst, dann ist der Hebel nicht Cashflow vor Steuern, sondern Vermögensaufbau, Steuerersparnis und Tilgung durch den Mieter. Ich zeige dir im nächsten Termin beides — damit du sauber entscheidest, was zu dir passt."`,
      sie: `"Eine Sache, die ich Ihnen vorher ehrlich sagen möchte, [Name]: Eine Immobilie, die sich vor Steuern vollständig selbst trägt, ist möglich — aber nur über drei Hebel: sehr hohe Rendite-Lage (oft B-/C-Stadt, mehr Risiko), spezielles Mietkonzept (WG/Möbliert/Co-Living, mehr Aufwand) oder sehr günstiger Einkauf (Sanierungsstau). Wenn Sie gleichzeitig Top-Lage, Neubau, ruhige Mieter und wenig Aufwand wünschen, ist der Hebel nicht Cashflow vor Steuern, sondern Vermögensaufbau, Steuerersparnis und Tilgung durch den Mieter. Ich zeige Ihnen im nächsten Termin beides — damit Sie sauber entscheiden, was zu Ihnen passt."`,
    },
    tipp: `Erwartungsmanagement = besseres Closing. Bogen-Prinzip: Wer den Bogen am Anfang sauber spannt, trifft am Ende präzise.`,
    tippMehr: `Diesen Schritt IMMER lesen, wenn der Lead bei "Zielen" oder "2 wichtigsten Punkten" Cashflow / "soll nichts kosten" / "selbsttragend" genannt hat. Der Toggle unten haelt die Erwartung des Leads fest. Sie ist im Beratungsgespraech sichtbar und steuert die Objektauswahl.`,
    notiz: true },

  // Dank + OS Immobilien-Vorstellung (vor Terminvereinbarung)
  { id: "moreimmo_vorstellung", nr: 16, titel: "Dank + Wer ist OS Immobilien?",
    special: "moreimmoVorstellung",
    text: {
      du:  `"Danke, [Vorname], dass du mir so offen von dir erzählt hast. Kurz, wer wir sind:\n\n• Wir machen ausschließlich Immobilien als Kapitalanlage, kein Eigenheim.\n• Unsere Kunden sind Angestellte, Beamte und Selbstständige mit gutem Einkommen.\n• Wir arbeiten in wachstumsstarken deutschen A- und B-Lagen, mit saniertem Bestand, Neubau im KfW-40-Standard und Co-Living.\n• Wir begleiten dich von der Strategie über die Finanzierung bis nach dem Notar, alles aus einer Hand.\n• Seit [X] Jahren, [Y] begleitete Kunden.\n\nWas davon klingt für dich am ehesten nach dem, was du vorhin beschrieben hast?"`,
      sie: `"Danke, [Name], dass Sie mir so offen von sich erzählt haben. Kurz, wer wir sind:\n\n• Wir machen ausschließlich Immobilien als Kapitalanlage, kein Eigenheim.\n• Unsere Kunden sind Angestellte, Beamte und Selbstständige mit gutem Einkommen.\n• Wir arbeiten in wachstumsstarken deutschen A- und B-Lagen, mit saniertem Bestand, Neubau im KfW-40-Standard und Co-Living.\n• Wir begleiten Sie von der Strategie über die Finanzierung bis nach dem Notar, alles aus einer Hand.\n• Seit [X] Jahren, [Y] begleitete Kunden.\n\nWas davon klingt für Sie am ehesten nach dem, was Sie vorhin beschrieben haben?"`,
    },
    tipp: `Halb so lang wie vorher und endet mit einer Frage. Neunzig Sekunden Monolog sind der Punkt, an dem der Zuhoerer aussteigt.`,
    tippMehr: `WICHTIG: [X] und [Y] einmal durch eure echten Zahlen ersetzen. Behauptete Kompetenz ueberzeugt niemanden, das Verhalten anderer Kunden schon. Wenn ihr die Zahlen nicht belegen koennt, die Zeile ersatzlos streichen statt zu schaetzen.`,
    notiz: true },

  // NEU: Pattern Interrupt – versteckte Einwände vor dem Termin auflösen
  { id: "pattern_interrupt", nr: 17, titel: "Pattern Interrupt – Einwand-Vorwegnahme",
    text: {
      du:  `"Bevor wir gleich den Termin fixieren, [Vorname] – gibt es bei dir noch irgendwas im Kopf, das dich vom nächsten Schritt abhalten würde? Lieber jetzt raus damit, als dass wir uns nachher umsonst treffen."`,
      sie: `"Bevor wir gleich den Termin fixieren, [Name] – gibt es bei Ihnen noch irgendetwas im Kopf, das Sie vom nächsten Schritt abhalten würde? Lieber jetzt heraus damit, als dass wir uns später umsonst treffen."`,
    },
    tipp: `Holt versteckte Einwände hoch — verhindert No-Shows und unsinnige Termine.`,
    tippMehr: `Typische Antworten: "Ich muss noch mit meiner Frau sprechen", "Ich bin mir nicht sicher, ob ich überhaupt Zeit habe", "Wieviel kostet das eigentlich?". Was hier kommt, schreibst du in die Notiz. Im Beratungstermin greifst du es als Erstes auf.`,
    notiz: true },

  // NEU: Verbindlichkeits-Skala 1–10 (optional, nur wenn Setter es passend findet)
  { id: "skala_verbindlichkeit", nr: 18, titel: "Verbindlichkeit (Skala 1–10)",
    special: "skala",
    text: {
      du:  `"Auf einer Skala von 1 bis 10 – wie ernst ist es dir, das Thema Immobilieninvestment jetzt wirklich anzugehen? 1 = nur mal informieren, 10 = ich will starten, sobald es Sinn ergibt."`,
      sie: `"Auf einer Skala von 1 bis 10 – wie ernst ist es Ihnen, das Thema Immobilieninvestment jetzt wirklich anzugehen? 1 = nur mal informieren, 10 = ich will starten, sobald es Sinn ergibt."`,
    },
    tipp: `Immer fragen, nicht nur bei lauwarmem Bauchgefuehl. Nur wer bei allen fragt, hat einen Vergleichswert, und der Wert steuert den naechsten Schritt.`,
    tippMehr: `Werte 7+ = Show-Wahrscheinlichkeit deutlich höher. Werte ≤4 = freundlich klären, ob Termin wirklich Sinn ergibt oder besser auf "Vermögensaufbau" / Follow-Up umgeleitet werden sollte.` },

  // Der fruehere Punkt 19 (Vorabschluss, Vorbereitung zusagen lassen) wurde
  // auf Wunsch von Christian ersatzlos gestrichen. Die Folgepunkte ruecken
  // nach, so wie bei frueheren Streichungen auch. Alte Notizen unter der
  // Schritt-ID "vorabschluss" bleiben in gespeicherten Staenden liegen und
  // werden ueber LEGACY_SCHRITT_TITEL weiterhin lesbar benannt.
  { id: "terminvereinbarung", nr: 19, titel: "Terminvereinbarung",
    text: {
      du:  `"Danke dir, dann lass uns direkt den Termin festmachen. Ich zeige dir zwei konkrete Wohnungen mit vollständiger Rechnung: Kaufpreis, Rate, Miete, Steuerwirkung und was am Ende wirklich aus deiner Tasche geht. Das bereite ich individuell für dich vor, das ist gut eine Stunde Arbeit. Ich habe am [Tag 1] um [Uhrzeit] und am [Tag 2] um [Uhrzeit] etwas frei. Was passt dir besser?"`,
      sie: `"Danke Ihnen, dann lassen Sie uns direkt den Termin festmachen. Ich zeige Ihnen zwei konkrete Wohnungen mit vollständiger Rechnung: Kaufpreis, Rate, Miete, Steuerwirkung und was am Ende wirklich aus Ihrer Tasche geht. Das bereite ich individuell für Sie vor, das ist gut eine Stunde Arbeit. Ich habe am [Tag 1] um [Uhrzeit] und am [Tag 2] um [Uhrzeit] etwas frei. Was passt Ihnen besser?"`,
    },
    tipp: `Zwei konkrete Zeitfenster, keine offene Frage. Und den Wert des Termins konkret benennen: zwei durchgerechnete Objekte, eine Stunde Vorbereitung. "In die Tiefe gehen" ist kein Wert.` },

  { id: "einladung_check", nr: 20, titel: "Einladung per E-Mail prüfen",
    text: {
      du:  `"Schau bitte kurz in dein Postfach – ist die Einladung zu unserem Beratungsgespräch schon angekommen? Falls ja, füg' sie dir direkt deinem Kalender hinzu, damit der Termin wie besprochen stattfinden kann. In der E-Mail findest du auch den Link zum Videogespräch. Und falls doch mal was dazwischenkommt: Gib mir bitte spätestens am Vortag Bescheid, dann verschieben wir einfach. Ist das für dich in Ordnung?"`,
      sie: `"Schauen Sie bitte kurz in Ihr Postfach – ist die Einladung zu unserem Beratungsgespräch bereits angekommen? Falls ja, fügen Sie sie direkt Ihrem Kalender hinzu, damit der Termin wie besprochen stattfinden kann. In der E-Mail finden Sie auch den Link zum Videogespräch. Und falls doch einmal etwas dazwischenkommt: Geben Sie mir bitte spätestens am Vortag Bescheid, dann verschieben wir einfach. Ist das für Sie in Ordnung?"`,
    },
    tipp: `Live verifizieren, das ist der staerkste No-Show-Schutz im Skript. Bei "nichts da": Spam pruefen oder zweite Adresse abfragen. Wer zusagt sich abzumelden, meldet sich ab oder erscheint.`,
    notiz: true },

  { id: "offene_fragen", nr: 21, titel: "Offene Fragen klären",
    text: {
      du:  `"Welche Frage soll ich dir im Termin als Allererstes beantworten?"`,
      sie: `"Welche Frage soll ich Ihnen im Termin als Allererstes beantworten?"`,
    },
    tipp: `Offen fragen statt geschlossen. Die alte Form lud zum bequemen "Nein" ein, die neue erzeugt eine Erwartung an den Termin und damit einen Grund zu erscheinen.`,
    fragen: [{
      key: "offeneFragen",
      label: { du: "Offene Fragen / Einwände", sie: "Offene Fragen / Einwände" },
      placeholder: "Was war dem Lead noch unklar? Welche Einwände kamen?",
      multiline: true,
    }] },

  { id: "verabschiedung", nr: 22, titel: "Verabschiedung",
    text: {
      du:  `"Danke, [Vorname], dann hast du den Termin sicher im Kalender. Ich freue mich, dich bei deinem Vorhaben zu begleiten. Bis [Tag] um [Uhrzeit]."`,
      sie: `"Danke, [Name], dann haben Sie den Termin sicher im Kalender. Ich freue mich, Sie bei Ihrem Vorhaben zu begleiten. Bis [Tag] um [Uhrzeit]."`,
    },
    tipp: `Der Termin ist das letzte gesprochene Wort. Der frueher eingeschobene Vorbehalt "wenn alles passt" saete im letzten Satz genau den Zweifel, den zwanzig Minuten vorher abgebaut haben.` },
];

/**
 * Auswahlwerte der Brückenfrage 4a (Familiäre Situation). Bewusst als
 * Klartext gespeichert, dann sind sie in Zusammenfassung und KI-Payload ohne
 * Übersetzung lesbar.
 */
export const FAMILIENSTAND_OPTIONEN = ["ledig", "in Partnerschaft", "verheiratet", "geschieden", "verwitwet"] as const;
export type Familienstand = (typeof FAMILIENSTAND_OPTIONEN)[number];

/**
 * Punkt 5 (Mitentscheider) passt Sprechtext und Tipp an die Antwort der
 * Brückenfrage 4a an. Ohne Antwort bleibt der neutrale Grundtext aus SCHRITTE
 * stehen.
 */
const MITENTSCHEIDER_VARIANTEN: Record<"verheiratet" | "partnerschaft" | "allein", { text: LocText; tipp: LocText }> = {
  verheiratet: {
    text: {
      du:  `"Du hast ja gesagt, dass du verheiratet bist. Bei Ehepaaren berücksichtigen wir grundsätzlich beide Partner und eure gemeinsame finanzielle Situation, das gehört bei uns immer zusammen. Deshalb holen wir deine Frau beziehungsweise deinen Mann am besten direkt mit ins Beratungsgespräch, dann klären wir alle Fragen von Beginn an gemeinsam. An welchen Abenden passt es euch beiden?"`,
      sie: `"Sie haben ja gesagt, dass Sie verheiratet sind. Bei Ehepaaren berücksichtigen wir grundsätzlich beide Partner und Ihre gemeinsame finanzielle Situation, das gehört bei uns immer zusammen. Deshalb holen wir Ihre Frau beziehungsweise Ihren Mann am besten direkt mit ins Beratungsgespräch, dann klären wir alle Fragen von Beginn an gemeinsam. An welchen Abenden passt es Ihnen beiden?"`,
    },
    tipp: `Nicht empfehlen, sondern gleich gemeinsam terminieren. Ein Ratschlag laesst sich ignorieren, die Terminfrage nicht.`,
  },
  partnerschaft: {
    text: {
      du:  `"Da du in einer Partnerschaft lebst: Am besten holen wir deine Partnerin beziehungsweise deinen Partner direkt mit ins Beratungsgespräch, dann klären wir alle Fragen von Beginn an gemeinsam, statt dass du hinterher alles weitererzählen musst. An welchen Abenden passt es euch beiden?"`,
      sie: `"Da Sie in einer Partnerschaft leben: Am besten holen wir Ihre Partnerin beziehungsweise Ihren Partner direkt mit ins Beratungsgespräch, dann klären wir alle Fragen von Beginn an gemeinsam, statt dass Sie hinterher alles weitererzählen müssen. An welchen Abenden passt es Ihnen beiden?"`,
    },
    tipp: `Nicht empfehlen, sondern gleich gemeinsam terminieren. Ein Ratschlag laesst sich ignorieren, die Terminfrage nicht.`,
  },
  allein: {
    text: {
      du:  `"Gut, dann entscheidest du das ganz für dich, das macht vieles einfacher. Eine Frage noch, damit uns nichts durchrutscht: Gibt es sonst jemanden, der bei so einer Entscheidung für dich eine Rolle spielt, zum Beispiel deine Eltern oder ein Steuerberater?"`,
      sie: `"Gut, dann entscheiden Sie das ganz für sich, das macht vieles einfacher. Eine Frage noch, damit uns nichts durchrutscht: Gibt es sonst jemanden, der bei so einer Entscheidung für Sie eine Rolle spielt, zum Beispiel Ihre Eltern oder ein Steuerberater?"`,
    },
    tipp: `Die offene Rückfrage fängt stille Mitentscheider wie Eltern oder Steuerberater ein, bevor sie im Beratungsgespräch überraschen.`,
  },
};

/**
 * Wählt die Mitentscheider-Variante zur Antwort der Brückenfrage 4a.
 * Unbeantwortet oder unbekannter Wert: undefined, der neutrale Grundtext
 * bleibt stehen. Exportiert, damit die Umschaltlogik testbar ist.
 */
export function waehleMitentscheiderVariante(familienstand: string | undefined): { text: LocText; tipp: LocText } | undefined {
  const stand = (familienstand || "").trim();
  if (stand === "verheiratet") return MITENTSCHEIDER_VARIANTEN.verheiratet;
  if (stand === "in Partnerschaft") return MITENTSCHEIDER_VARIANTEN.partnerschaft;
  if (stand === "ledig" || stand === "geschieden" || stand === "verwitwet") return MITENTSCHEIDER_VARIANTEN.allein;
  return undefined;
}

/**
 * Lesbare Titel für Schritt-IDs, die es im Skript nicht mehr gibt. Alte
 * gespeicherte Notizen unter diesen IDs sollen in der KI-Zusammenfassung
 * weiterhin benannt auftauchen statt als kryptischer Schlüssel.
 */
const LEGACY_SCHRITT_TITEL: Record<string, string> = {
  vorabschluss: "Vorabschluss (Punkt entfernt)",
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
 * Sonderblock (Skala, Cashflow-Toggle) in die Antworten geschrieben werden.
 * Ohne diese Liste fehlten sie in der ausführlichen Fassung.
 */
const ZUSATZFELDER: Record<string, DetailFeld[]> = {
  familiaere_situation: [
    { key: "familienstand", label: "Familiäre Situation" },
  ],
  skala_verbindlichkeit: [
    { key: "verbindlichkeitSkala", label: "Verbindlichkeit (1 bis 10)" },
  ],
  cashflow_erwartung: [
    {
      key: "cashflowPraeferenz",
      label: "Erwartung: Cashflow oder Qualität",
      werte: {
        cashflow: "Cashflow — soll sich selbst tragen, mehr Risiko in Ordnung",
        qualitaet: "Qualität — Top-Lage, Sicherheit, Vermögensaufbau",
        mix: "Mix — ausgewogen, beides wichtig",
      },
    },
  ],
};

/**
 * Die Schritte für die ausführliche Fassung im Zusammenfassungs-Popup.
 * Beschriftungen in der Sie-Form, weil die Zusammenfassung gelesen und nicht
 * gesprochen wird. Ebenfalls aus SCHRITTE abgeleitet, damit die Fragen nur an
 * einer Stelle stehen.
 */
export const ERSTGESPRAECH_SCHRITTE_DETAIL: DetailSchritt[] = SCHRITTE.map(s => ({
  id: s.id,
  nr: s.nr,
  ...(s.nrText ? { nrText: s.nrText } : {}),
  titel: s.titel,
  felder: [
    ...(s.fragen ?? []).map(f => ({ key: f.key, label: pickText(f.label, "sie") })),
    ...(ZUSATZFELDER[s.id] ?? []),
  ],
  hatNotiz: s.notiz === true,
}));

/**
 * Bausteine, die immer in der Sie-Form stehen: Beim Erstkontakt ist die Anrede
 * noch nicht geklärt, sie wird erst in Punkt 2 festgelegt.
 */
const IMMER_SIE = new Set(["einleitung", "ziel_gespraech", "anrede"]);

/**
 * Das Skript, reduziert auf das, was Kapitel 4 der Vertriebsakademie
 * beschreibt: je Punkt seine Nummer, sein Titel und sein Sprechtext, in der
 * Reihenfolge der Anzeige und mit der Anrede, die das Skript an dieser Stelle
 * wirklich zeigt. Platzhalter wie [Vorname] bleiben stehen, die ersetzt erst
 * die Oberfläche mit den Daten des Kontakts.
 *
 * Warum das hier steht: Die Akademie zitiert genau diese Sätze, damit ein neuer
 * Partner im Kapitel dasselbe liest, was er später im CRM vor sich hat. Zwei
 * Fassungen desselben Satzes laufen früher oder später auseinander, und dann
 * lernt er den falschen. `vertriebsakademieErstgespraech.test.ts` vergleicht
 * beide Stellen Satz für Satz.
 *
 * Die Form mit `bausteine` stammt aus der Wizard-Fassung, in der ein Schritt
 * mehrere Bausteine bündelte. In der Listenfassung ist jeder Punkt sein eigener
 * Baustein. Die Form bleibt, damit Kapitel und Wächter unverändert weiterlaufen.
 */
export const ERSTGESPRAECH_WIZARD_UEBERSICHT: {
  nr: number;
  titel: string;
  bausteine: { id: string; titel: string; text: string }[];
}[] = SCHRITTE.reduce((liste, s) => {
  /*
    Nach Punktnummer gebündelt, damit die Brückenfrage 4a unter Punkt 4 steht
    und nicht als zweiter Eintrag mit derselben Nummer daneben. Die flache
    Liste der Bausteine bleibt dadurch unverändert, nur die Gruppierung ändert
    sich.
  */
  const baustein = {
    id: s.id,
    titel: s.titel,
    text: pickText(s.text, IMMER_SIE.has(s.id) ? "sie" : "du"),
  };
  const letzte = liste[liste.length - 1];
  if (letzte && letzte.nr === s.nr) {
    letzte.bausteine.push(baustein);
    return liste;
  }
  liste.push({ nr: s.nr, titel: s.titel, bausteine: [baustein] });
  return liste;
}, [] as { nr: number; titel: string; bausteine: { id: string; titel: string; text: string }[] }[]);

/**
 * Wording-Overrides für den Modus "vertriebspartner".
 *
 * Das Grundskript oben ist inzwischen selbst in der Ich-Form geschrieben, weil
 * bei OS Immobilien derselbe Berater das Erstgespräch führt, der anschließend auch
 * berät. Ein "der Berater" in dritter Person wäre falsch, wenn dieselbe Person
 * am Telefon sitzt. Deshalb sind die früheren Overrides für Beruf, Netto,
 * Schufa, Vorabschluss, Termin, Einladung, offene Fragen und Verabschiedung
 * entfallen: Sie sagten nur noch dasselbe wie das Grundskript, und zwei
 * Fassungen desselben Satzes laufen früher oder später auseinander.
 *
 * Übrig bleibt der Einstieg, weil sich dort der Inhalt unterscheidet und nicht
 * nur die Person: Ein manuell angelegter Lead kommt nicht zwingend über die
 * Social-Ads-Anzeige.
 *
 * Sollten später Setter dazukommen, gehören die Formulierungen in dritter
 * Person hierher zurück, nicht ins Grundskript.
 */
const VP_TEXT_OVERRIDES: Record<string, LocText> = {
  // 1) Einleitung – allgemein halten, da manuell angelegte Leads aus
  //    verschiedenen Quellen stammen können, nicht nur aus Social Ads.
  einleitung: {
    du:  `"Guten Tag [Vorname] [Nachname], hier ist [dein Name] von OS Immobilien, gut, dass ich Sie erreiche. Sie hatten vor Kurzem Interesse am Thema Immobilien als Kapitalanlage. Ich brauche fünfzehn Minuten für das, was ich mit Ihnen durchgehen möchte. Haben Sie die jetzt, oder passt Ihnen heute Abend gegen 18 Uhr besser?"`,
    sie: `"Guten Tag [Vorname] [Nachname], hier ist [dein Name] von OS Immobilien, gut, dass ich Sie erreiche. Sie hatten vor Kurzem Interesse am Thema Immobilien als Kapitalanlage. Ich brauche fünfzehn Minuten für das, was ich mit Ihnen durchgehen möchte. Haben Sie die jetzt, oder passt Ihnen heute Abend gegen 18 Uhr besser?"`,
  },
};

type SkriptDaten = {
  antworten: Record<string, string>;
  notizen: Record<string, string>;
  ziele: string[];
  erledigt: Record<string, boolean>;
  anrede?: Anrede;
  einleitungBestaetigt?: boolean;
  kiZusammenfassung?: string;
  aktualisiertAm?: string;
};

const LS_KEY = (id: string) => `mi_setterSkript_${id}`;

/**
 * Cashflow-Erwartung – Toggle + Einwand-Behandlungs-Akkordeon.
 * Wird im Erstgespräch UND im Beratungsgespräch (gleicher Block, beide Touchpoints)
 * angezeigt. Schreibt zusätzlich in kontakt.meta.qualCashflowPraeferenz, damit der
 * Berater die Erwartung des Leads im Beratungsgespräch sieht und die Objektauswahl
 * danach ausrichten kann.
 */
function CashflowErwartungBlock({
  current,
  onChange,
}: {
  kundeId: string;
  current?: "cashflow" | "qualitaet" | "mix";
  onChange: (v: "cashflow" | "qualitaet" | "mix") => void;
}) {
  const [einwandOffen, setEinwandOffen] = useState(false);
  const OPTIONS: { value: "cashflow" | "qualitaet" | "mix"; label: string; sub: string }[] = [
    { value: "cashflow",  label: "Cashflow",  sub: "Soll sich selbst tragen – mehr Risiko OK" },
    { value: "qualitaet", label: "Qualität",  sub: "Top-Lage, Sicherheit, Vermögensaufbau" },
    { value: "mix",       label: "Mix",       sub: "Ausgewogen, beides wichtig" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold mb-2 block">
          Cashflow vs. Qualität — was ist dem Lead wichtiger?
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {OPTIONS.map(opt => {
            const active = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className={`text-sm ${active ? "font-bold" : "font-semibold"}`}>
                  {active && "✓ "}{opt.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Wird im Beratungsgespräch beim Berater angezeigt und steuert die Objektauswahl.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-50/40">
        <button
          type="button"
          onClick={() => setEinwandOffen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold text-amber-800">
            🛡️ Einwand-Behandlung: „Soll sich vor Steuern komplett selbst tragen"
          </span>
          {einwandOffen
            ? <ChevronUp className="h-3.5 w-3.5 text-amber-800" />
            : <ChevronDown className="h-3.5 w-3.5 text-amber-800" />}
        </button>
        {einwandOffen && (
          <div className="px-3 pb-3 space-y-3 text-xs text-foreground/90">
            <div>
              <div className="font-semibold mb-1">Die 3 Hebel — und ihre Trade-offs</div>
              <ul className="space-y-1.5 list-disc list-inside marker:text-amber-700">
                <li><strong>Sehr hohe Rendite-Lage</strong> — B-/C-/D-Lagen, 8–12 % Bruttorendite. Mehr Leerstand-, Mieter- und Wertstabilitäts-Risiko.</li>
                <li><strong>Besonderes Mietkonzept</strong> — WG, Co-Living, möbliert, Kurzzeitvermietung. Mehr Aufwand, mehr Abnutzung, höhere rechtliche/operative Anforderungen (unser Full-Service deckt das ab).</li>
                <li><strong>Sehr günstiger Einkauf</strong> — Off-Market, Sanierungsstau, Verkäuferdruck. Nur gut, wenn das Risiko sauber verstanden und beherrschbar ist.</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold mb-1">Wenn der Kunde Top-Lage & Sicherheit will — Hebel ist nicht Cashflow, sondern:</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 list-disc list-inside marker:text-primary">
                <li>langfristiger Vermögensaufbau</li>
                <li>Inflationsschutz</li>
                <li>Wertstabilität</li>
                <li>Steuerersparnis</li>
                <li>Tilgung durch den Mieter</li>
                <li>planbarer Kapitalaufbau über 10–20 Jahre</li>
              </ul>
            </div>
            <div className="border-t border-amber-500/20 pt-2">
              <div className="font-semibold mb-1 text-amber-900">🎯 Trainer-Tipp (nicht vorlesen): Das Bogen-Prinzip</div>
              <p className="leading-relaxed text-[11px]">
                Wer den Bogen nur halbherzig spannt, dessen Pfeil fliegt unkontrolliert. Wer ihn ruhig und mit voller Spannung aufzieht, trifft präzise. Genauso im Vertrieb: Das erste Gespräch ist der Moment, in dem du den Rahmen setzt, Erwartungen ordnest und ehrlich aufzeigst, was realistisch ist. Ein gutes Closing beginnt nicht beim Abschluss — es beginnt hier, durch Klarheit und sauberes Erwartungsmanagement.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
      anrede: dbDaten.anrede || "du",
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
        return { ...p, anrede: p.anrede || "du" };
      }
    } catch {}
  }
  return { antworten: {}, notizen: {}, ziele: [], erledigt: {}, anrede: "du" };
}

export const SetterErstgespraechsSkript = forwardRef<SetterErstgespraechsSkriptHandle, Props>(function SetterErstgespraechsSkript(
  { kunde, onUpdate, onSummaryGenerated, terminSlot, abschlussSlot, onFollowUp, onErstgespraechFollowUp, mode = "setter", investmentId, isFirstInvestment },
  ref,
) {
  const { toast } = useToast();
  const { user } = useUser();
  // Vorname des angemeldeten Nutzers für die Personalisierung des Skripts
  // ("Hallo …, hier ist [dein Name] von OS Immobilien …" → echter Name).
  const callerFullName = (user?.name || "").trim();
  const callerVorname = callerFullName.split(/\s+/)[0] || callerFullName || "";
  const isVpMode = mode === "vertriebspartner";
  const SCHRITTE_EFFECTIVE: Schritt[] = isVpMode
    ? SCHRITTE.map(s => (VP_TEXT_OVERRIDES[s.id] ? { ...s, text: VP_TEXT_OVERRIDES[s.id] } : s))
    : SCHRITTE;
  const [daten, setDaten] = useState<SkriptDaten>(() => loadInitial(kunde, investmentId, isFirstInvestment));
  const [savingAi, setSavingAi] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<SkriptDaten>(daten);
  const dirtyRef = useRef<boolean>(false);
  const savingRef = useRef<boolean>(false);
  // Zaehlt aufeinanderfolgende Fehlschlaege beim Speichern. Der Hinweis kommt
  // erst ab dem zweiten Fehlschlag in Folge und danach hoechstens alle 30
  // Sekunden, sonst wuerde er bei jedem Tastendruck erneut aufpoppen.
  const speicherFehlerRef = useRef<number>(0);
  const letzterSpeicherHinweisRef = useRef<number>(0);
  const anrede: Anrede = daten.anrede || "du";
  const setAnrede = (a: Anrede) => setDaten(d => ({ ...d, anrede: a }));

  // Schritt 1 (Einleitung): Bestätigung "Ja, der Lead hat Zeit"
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
  // Lokale Sync mit Skript-Daten (persistieren in einleitungBestaetigt)
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
        // loescht das gerade gespeicherte Skript wieder, weil kundeToDbRow das
        // meta aus genau diesem Zwischenspeicher neu aufbaut. Genau das
        // passiert im selben Skript, sobald das Netto-Einkommen gespeichert
        // wird.
        gespeichert = await mergeKontaktMeta(kunde.id, { setterSkript: snapshot });
      }
      // Nur ein wirklich geschriebener Stand gilt als gespeichert. Sonst bleibt
      // der Entwurf schmutzig und wird beim naechsten Tastendruck erneut
      // geschrieben, so wie vor der Umstellung auf mergeKontaktMeta.
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
      // Bei Unmount (Navigation innerhalb der App) sofort persistieren.
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
        // Schreibt in die Datenbank: ein stiller Fehlschlag wuerde die Auswahl
        // angehakt zeigen, ohne dass sie irgendwo gespeichert ist.
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
      // Vorher gingen die Notizen nur als rohes JSON mit kryptischen
      // Schluesseln mit, und die Netto-Notiz lief unter dem falschen Etikett
      // "Reaktion auf Vorstellung". Die KI soll nur verwenden, was dasteht,
      // also muss auch dastehen, was es ist.
      const notizenBenannt = Object.entries(daten.notizen)
        .filter(([, text]) => typeof text === "string" && text.trim() !== "")
        .map(([schrittId, text]) => {
          const titel = SCHRITTE.find((sch) => sch.id === schrittId)?.titel
            || LEGACY_SCHRITT_TITEL[schrittId]
            || schrittId;
          return `Notiz zu „${titel}": ${String(text).trim()}`;
        })
        .join("\n");
      const payload = {
        modus: "kunde",
        vorname: kunde.vorname,
        nachname: kunde.nachname,
        beruf: daten.antworten.beruf,
        arbeitgeber: daten.antworten.arbeitgeber,
        familienstand: daten.antworten.familienstand,
        nettoEinkommen: (kunde as any).qualEinkommen || "",
        eigenkapital: (kunde as any).qualEigenkapital || "",
        sparformen: daten.antworten.sparformen,
        investitionMonat: daten.antworten.investitionMonat,
        verbindlichkeit: daten.antworten.verbindlichkeitSkala,
        cashflowPraeferenz: daten.antworten.cashflowPraeferenz,
        ziele: daten.ziele.join(", "),
        motivation: daten.antworten.zweiPunkte,
        erfahrung: daten.antworten.erfahrung,
        offeneFragen: daten.antworten.offeneFragen,
        notizenBenannt,
        antwortenJson: JSON.stringify(daten.antworten),
      };
      const { data, error } = await supabase.functions.invoke("erstgespraech-zusammenfassung", { body: payload });
      // Mit dem Grund aus der Antwort, etwa „Zusammenfassung gerade nicht möglich“ (503).
      if (error) throw await edgeFehlerMitGrund(error, { functionName: "erstgespraech-zusammenfassung" });
      const summary: string = (data as any)?.summary || "";
      if (!summary) throw new Error("Leere KI-Antwort");

      const updated: SkriptDaten = { ...daten, kiZusammenfassung: summary, aktualisiertAm: new Date().toISOString() };
      setDaten(updated);

      if (investmentId) {
        // Per-Investment-Persistierung: Skript + KI-Zusammenfassung pro Investment.
        setInvestmentMetaFields(investmentId, { setterSkript: updated, gespraechsnotizenAI: summary });
      } else {
        // Legacy-Kontakt-Scope (Fallback, sollte produktiv nicht mehr genutzt werden).
        // mergeKontaktMeta zieht den Zwischenspeicher nach, sonst schreibt das
        // direkt folgende updateKontakt den alten Stand zurueck und loescht
        // Skript und KI-Zusammenfassung im selben Klick wieder.
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
  }), [generateAiSummary, daten, persistNow]);

  const filledCount =
    Object.values(daten.antworten).filter(v => (v || "").trim().length > 0).length +
    Object.values(daten.notizen).filter(v => (v || "").trim().length > 0).length +
    (daten.ziele.length > 0 ? 1 : 0);

  // Wenn das Skript noch keine Ziele hat, aber qualZiel in den Qualifizierungs-
  // fragen schon gepflegt ist (oder über die Meta-Kampagne reinkam), übernehmen
  // wir die Werte einmalig als Vorbefüllung in das Skript.
  useEffect(() => {
    if (daten.ziele.length > 0) return;
    const qz = ((kunde as any).qualZiel || "").toString();
    if (!qz) return;
    const parts = qz
      .split(/[,;\n]/)
      .map((p: string) => p.trim())
      .filter(Boolean)
      .filter((p: string) => ZIELE_OPTIONEN.includes(p))
      .slice(0, 3);
    if (parts.length > 0) {
      setDaten(d => ({ ...d, ziele: parts }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(kunde as any).qualZiel]);

  // Termin-Daten STRIKT pro Investment lesen — Kontakt-Level nur als Fallback
  // für das erste Investment (Legacy). Verhindert, dass Investment 2/3 die
  // Buchung aus Investment 1 anzeigen.
  const invMetaForTermin = investmentId
    ? getInvestmentMetaField<any>(investmentId, "__termin_marker__", undefined) // marker only
    : undefined;
  void invMetaForTermin;
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

  // Höfliche Anrede für Sie-Form: "Herr [Nachname]" / "Frau [Nachname]" – fällt sonst auf "Herr/Frau [Nachname]" zurück.
  const anredeWort = (() => {
    const a = ((kunde as any).anrede || "").toString().toLowerCase();
    if (a.startsWith("frau")) return "Frau";
    if (a.startsWith("herr")) return "Herr";
    return "Herr/Frau";
  })();
  const nachname = (kunde.nachname || "").trim();
  const sieName = nachname ? `${anredeWort} ${nachname}` : anredeWort;
  const interpolate = (s: string) =>
    s
      .replace(/\[Vorname\]/g, kunde.vorname || "")
      .replace(/\[Nachname\]/g, kunde.nachname || "")
      .replace(/\[Name\]/g, anrede === "sie" ? sieName : (kunde.vorname || ""))
      // Personalisierung des Anrufers (Setter / Vertriebspartner): wir ersetzen
      // sowohl die Skript-Platzhalter ([dein Name], [Dein Name], [dein Vorname])
      // als auch die statische Beispiel-Formulierung „[dein Name]" aus dem
      // historischen Skript-Text, damit alle Rollen ein vollständig
      // personalisiertes Skript sehen.
      .replace(/\[dein\s+Vorname\]/gi, callerVorname)
      .replace(/\[dein\s+Name\]/gi, callerVorname || callerFullName);

  // Schritte 1 & 2 IMMER in Sie-Form anzeigen (Erstkontakt, Anrede wird erst in Schritt 2 festgelegt).
  const anredeFor = (s: Schritt): Anrede => (s.nr <= 2 ? "sie" : anrede);

  // Pro Schritt: "Mehr Kontext"-Ausklappstatus
  const [mehrOffen, setMehrOffen] = useState<Record<string, boolean>>({});

  // Punkt 5 (Mitentscheider) schaltet seinen Sprechtext anhand der Antwort
  // der Brückenfrage 4a um. Ohne Antwort bleibt der neutrale Grundtext.
  const mitentscheiderVariante = waehleMitentscheiderVariante(daten.antworten.familienstand);
  const schritteAnzeige: Schritt[] = SCHRITTE_EFFECTIVE.map(s =>
    s.id === "mitentscheider" && mitentscheiderVariante
      ? { ...s, text: mitentscheiderVariante.text, tipp: mitentscheiderVariante.tipp }
      : s,
  );

  return (
    <TooltipProvider>
    <Card className="p-0 overflow-hidden border-primary/30">
      <div className="w-full flex items-center gap-3 p-6 border-b">
        <ClipboardList className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <h3 className="font-bold">Erstgesprächs-Skript</h3>
          <p className="text-xs text-muted-foreground">
            {SCHRITTE_EFFECTIVE.length} Schritte • {isVpMode ? <>Du qualifizierst und terminierst direkt für <strong>dich selbst</strong>.</> : <>Wird nur ausgefüllt, wenn der Lead <strong>erreicht</strong> wurde.</>} Auto-Save aktiv • aktuell <strong>{anrede === "sie" ? "Sie-Form" : "Du-Form"}</strong>.
          </p>
        </div>
        {filledCount > 0 && <Badge variant="secondary" className="text-xs">{filledCount} ausgefüllt</Badge>}
        {savedFlash && <span className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1"><Save className="h-3 w-3" /> gespeichert</span>}
      </div>

      <div className="p-6 space-y-6">
        {schritteAnzeige.map(s => (
          <Fragment key={s.id}>
          <div data-ui="card" className="rounded-lg border bg-card/40">
            <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
              <Checkbox
                checked={!!daten.erledigt[s.id]}
                onCheckedChange={() => toggleErledigt(s.id)}
              />
              <span className="font-semibold text-sm">{s.nrText ?? s.nr}. {s.titel}</span>
              {s.optional && (
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 bg-amber-50">Optional</Badge>
              )}
              {s.special === "anrede" && (
                <Badge variant="outline" className="ml-auto text-[10px]">{anrede === "sie" ? "Sie-Form aktiv" : "Du-Form aktiv"}</Badge>
              )}
            </div>
            <div className="p-4 space-y-3">
                  {s.text && (
                    <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-primary">
                      <p className="text-sm whitespace-pre-line">
                        {interpolate(pickText(s.text, anredeFor(s)))}
                      </p>
                    </div>
                  )}

                  {/*
                    Einwandbehandlung an Ort und Stelle. Zeigt nur die Einwände,
                    die in genau diesem Schritt typischerweise kommen, und
                    klappt die Antwort darunter auf. Das Skript bleibt sichtbar,
                    es gibt keinen Seitenwechsel.
                  */}
                  <EinwandSchnellhilfeKompakt skriptSchritt={s.id} />

                  {/* Schritt 1 (Einleitung): Ja-Bestätigung + Follow-Up Button */}
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
                        {einleitungJa ? "Ja, Lead hat Zeit ✓" : "Ja, Lead hat Zeit"}
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onFollowUp?.()}
                        disabled={!onFollowUp}
                        className="gap-2 border-[hsl(var(--warning))]/50 hover:bg-[hsl(var(--warning))]/10 h-auto py-3"
                      >
                        <PhoneForwarded className="h-4 w-4 text-[hsl(var(--warning))]" />
                        Erstgespräch Termin vereinbaren
                      </Button>
                    </div>
                  )}

                  {/* Schritt 1: Anrede-Auswahl */}
                  {s.special === "anrede" && (
                    <UebernahmeRahmen feld="anrede">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setAnrede("du")}
                        className={`flex items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                          anrede === "du"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <Smile className="h-4 w-4" /> Du-Form
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnrede("sie")}
                        className={`flex items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                          anrede === "sie"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <UserRound className="h-4 w-4" /> Sie-Form
                      </button>
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {/* Schritt 4a: Familiäre Situation als Kachel-Auswahl */}
                  {s.special === "familienstand" && (
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">Familiäre Situation des Leads</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {FAMILIENSTAND_OPTIONEN.map(opt => {
                          const active = daten.antworten.familienstand === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAntwort("familienstand", active ? "" : opt)}
                              className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                                active ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/50"
                              }`}
                            >
                              {active && "✓ "}{opt}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Die Auswahl passt den Sprechtext in Punkt 5 (Mitentscheider) automatisch an.
                      </p>
                    </div>
                  )}

                  {/* Schritt Netto: Wert mit qualEinkommen synchronisieren */}
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
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(kunde as any).qualEinkommen
                          ? "Wert wurde bereits aus den Qualifizierungsfragen / Meta-Kampagne übernommen — bei Bedarf anpassen."
                          : "Noch leer — Wert hier eintragen, wird automatisch in die Qualifizierungsfrage übernommen."}
                      </p>
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {/* Schritt Sparformen: Eigenkapital synchron mit qualEigenkapital */}
                  {s.special === "sparformen" && (
                    <UebernahmeRahmen feld="qualEigenkapital">
                    <div>
                      <Label className="text-xs font-semibold">
                        Verfügbares Eigenkapital (€) — synchron mit Qualifizierungsfragen
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
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(kunde as any).qualEigenkapital
                          ? "Wert wurde bereits aus den Qualifizierungsfragen / Meta-Kampagne übernommen — bei Bedarf anpassen."
                          : "Noch leer — Wert hier eintragen, wird automatisch in die Qualifizierungsfrage übernommen."}
                      </p>
                    </div>
                    </UebernahmeRahmen>
                  )}

                  {/* Schritt Skala 1–10 Verbindlichkeit */}
                  {s.special === "skala" && (
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">Verbindlichkeit (1 = nur info, 10 = will starten)</Label>
                      <div className="grid grid-cols-10 gap-1">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => {
                          const active = daten.antworten.verbindlichkeitSkala === String(n);
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAntwort("verbindlichkeitSkala", active ? "" : String(n))}
                              className={`h-9 text-xs rounded-md border transition-colors ${
                                active
                                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                                  : "border-border hover:bg-muted/50"
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Schritt Cashflow-Erwartung: Toggle + Einwand-Behandlung (Bausteine 1 & 3) */}
                  {s.special === "cashflowErwartung" && (
                    <UebernahmeRahmen feld="cashflowPraeferenz">
                    <CashflowErwartungBlock
                      kundeId={kunde.id}
                      current={(daten.antworten.cashflowPraeferenz as "cashflow" | "qualitaet" | "mix" | undefined)
                        || ((kunde as any).meta?.qualCashflowPraeferenz as "cashflow" | "qualitaet" | "mix" | undefined)}
                      onChange={(v) => {
                        setAntwort("cashflowPraeferenz", v);
                        void mergeKontaktMeta(kunde.id, { qualCashflowPraeferenz: v });
                      }}
                    />
                    </UebernahmeRahmen>
                  )}

                  {s.tipp && (
                    <div className="bg-accent/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground"><strong>💡 Tipp:</strong> {pickText(s.tipp, anredeFor(s))}</p>
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
                              {pickText(s.tippMehr, anredeFor(s))}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {s.fragen?.map(f => {
                    // Bi-direktionale Sync mit den Qualifizierungsfragen:
                    // Skript-Feld "beruf" ↔ qualBeruflicheSituation.
                    // Vorbefüllt aus qualBeruflicheSituation, wenn das Skript-Feld leer ist.
                    const isBerufField = f.key === "beruf";
                    const qualBeruf = (kunde as any).qualBeruflicheSituation || "";
                    const skriptValue = daten.antworten[f.key] || "";
                    const value = isBerufField ? (skriptValue || qualBeruf) : skriptValue;
                    const handleChange = (v: string) => {
                      setAntwort(f.key, v);
                      if (isBerufField) {
                        updateKontakt(kunde.id, { qualBeruflicheSituation: v } as any);
                      }
                    };
                    // Dropdown-Optionen für "Berufliche Situation" – identisch zur Stammdaten-Qualifizierung
                    const BERUF_OPTIONS = ["Angestellt", "Selbstständig", "Beamter", "Rentner", "Student", "Arbeitssuchend"];
                    const BERUF_MAP: Record<string, string> = {
                      "angestellt": "Angestellt",
                      "selbststaendig": "Selbstständig",
                      "selbstständig": "Selbstständig",
                      "unternehmer": "Selbstständig",
                      "freiberufler": "Selbstständig",
                      "beamter": "Beamter",
                      "beamtin": "Beamter",
                      "rentner": "Rentner",
                      "student": "Student",
                      "arbeitslos": "Arbeitssuchend",
                      "arbeitssuchend": "Arbeitssuchend",
                    };
                    const normalizedBerufValue = isBerufField
                      ? (BERUF_MAP[(value || "").trim().toLowerCase()] || value)
                      : value;
                    return (
                      <UebernahmeRahmen key={f.key} feld={f.key}>
                      <div>
                        <Label className="text-xs font-semibold">
                          {pickText(f.label, anredeFor(s))}
                          {isBerufField && (
                            <>
                              <span className="ml-1 text-[10px] text-muted-foreground font-normal">— synchron mit Qualifizierungsfragen</span>
                              <Pflichtmarke gefuellt={!!normalizedBerufValue} />
                            </>
                          )}
                        </Label>
                        {isBerufField ? (
                          <Select
                            value={normalizedBerufValue}
                            onValueChange={(v) => handleChange(v)}
                          >
                            <SelectTrigger className={`mt-1 ${PFLICHT_RAHMEN}`}><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                            <SelectContent>
                              {BERUF_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : f.multiline ? (
                          <Textarea
                            value={value}
                            onChange={e => handleChange(e.target.value)}
                            placeholder={f.placeholder}
                            rows={3}
                            className="mt-1"
                          />
                        ) : (
                          <Input
                            value={value}
                            onChange={e => handleChange(e.target.value)}
                            placeholder={f.placeholder}
                            className="mt-1"
                          />
                        )}
                      </div>
                      </UebernahmeRahmen>
                    );
                  })}
                  {/* Ziele (Schritt 13) als Kachel-Picker */}
                  {s.id === "ziele" && (
                    <UebernahmeRahmen feld="ziele">
                    <div>
                      <Label className="text-xs font-semibold mb-2 block">
                        Bis zu drei Ziele auswählen
                        <Pflichtmarke gefuellt={daten.ziele.length > 0} />
                      </Label>
                      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border p-2 ${PFLICHT_RAHMEN}`}>
                      {ZIELE_OPTIONEN.map(z => {
                        const selected = daten.ziele.includes(z);
                        return (
                          <button
                            key={z}
                            type="button"
                            onClick={() => toggleZiel(z)}
                            className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                              selected ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/50"
                            }`}
                          >
                            {selected && "✓ "}{z}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                    </UebernahmeRahmen>
                  )}
                  {/* Freitext-Notiz bei Punkten 8, 10, 11, 12 (= zusammenarbeit / schufa / netto / ziele) */}
                  {s.notiz && (
                    <div>
                      <Label className="text-xs font-semibold">Notiz</Label>
                      <Textarea
                        value={daten.notizen[s.id] || ""}
                        onChange={e => setNotiz(s.id, e.target.value)}
                        placeholder="Deine Notiz zu diesem Punkt..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Schritt 13: Terminvereinbarung – Termin-UI direkt eingebettet */}
                  {s.id === "terminvereinbarung" && terminSlot && (
                    <div className="mt-3">{terminSlot}</div>
                  )}

                  {/* Schritt 15: Verabschiedung – automatischer Termin-Hinweis */}
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

          {/* Abschluss-Buttons (frühere Schritt 22) – jetzt unabhängig von der Checkliste,
              direkt unter den Skript-Schritten anzeigen. */}
          {abschlussSlot && (
            <div className="mt-2">{abschlussSlot}</div>
          )}

          {/* KI-Zusammenfassung wird beim Klick auf "Beratungsgespräch gebucht & KI-Zusammenfassung erstellen"
              automatisch erzeugt. Anzeige erfolgt ausschließlich in der Stammdaten-Investment-Übersicht
              (Reiter Invest. 1 / Invest. 2 …). Hier nur Lade-Indikator während der Erzeugung. */}
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