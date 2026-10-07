/**
 * Gemeinsame Bausteine des Erstgesprächsskripts (Teil 1).
 *
 * Der Reiter Erstgespräch (ErstgespraechsTab.tsx) und die Moderationsansicht
 * (ClosingModeration.tsx) zeigen dieselben Sprechtexte, Regie-Hinweise und
 * Erfassungsfelder. Damit beide nicht auseinanderlaufen, liegen die
 * Darstellung und die Feld-Renderer hier, einmal für beide.
 *
 * Alle Komponenten sind auf Modulebene definiert, nicht innerhalb einer
 * anderen Komponente: Eine lokal definierte Komponente würde bei jedem Render
 * neu eingehängt, und die Eingabefelder verlören nach jedem Tastendruck den
 * Fokus.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Quote, Info, ClipboardList, Star, Calendar, ExternalLink, Sparkles, ChevronDown } from "lucide-react";
import type { ErstgespraechSkript } from "@/lib/bewerbungStore";
import {
  ASSESSMENT_EINWAENDE, ASSESSMENT_PFADE, CLOSING_BUCHUNGSLINK, EMPFEHLUNG_LABELS,
  berechneAssessmentScore, fuellePlatzhalter, getStation, staerksterPfad,
  type AssessmentAntworten, type AssessmentEmpfehlung, type AssessmentFeld,
} from "@/lib/assessmentSkript";
import { frageFuerFeld } from "@/lib/bewerberFormular";
import { istGekennzeichnet, vorabEtikett, vorabHerkunft, type VorabStatus } from "@/lib/vorabHerkunft";
import { VorwissenStreifen, type Vorwissen } from "@/components/bewerbung/VorwissenKarte";

/** Wörtlicher Sprechtext, als Zitat gesetzt. */
export const Script = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border-l-4 border-primary/50 bg-primary/5 p-3 text-sm leading-relaxed italic flex gap-2">
    <Quote className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
    <div className="not-italic"><span className="italic">{children}</span></div>
  </div>
);

export const PunktTitel = ({ nummer, titel, className }: { nummer: number; titel: string; className?: string }) => (
  <div className={`text-xs font-semibold uppercase tracking-wider ${className ?? "text-muted-foreground"}`}>
    Punkt {nummer} · {titel}
  </div>
);

/** Regie-Hinweis für den Gesprächsführer, bewusst kein Sprechtext-Block. */
export const RegieHinweis = ({ hinweis, wortlaut }: { hinweis: string; wortlaut?: string }) => (
  <div className="rounded-md border border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
      <Info className="h-3.5 w-3.5" /> Hinweis für dich
    </div>
    <p className="text-xs text-amber-900 dark:text-amber-200">{hinweis}</p>
    {wortlaut && (
      <p className="text-xs italic text-amber-900/90 dark:text-amber-200/90">„{wortlaut}"</p>
    )}
  </div>
);

/**
 * Farben der Feldkennzeichnung. Blau ist die Farbe des Vorwissens, sie ist
 * schon die der Vorwissen-Karte. Bernstein ist im Skript die Farbe für
 * "hier bitte hinschauen", siehe Regie-Hinweis und Punkt 8.
 */
const VORAB_KLASSEN: Record<"uebernommen" | "abweichend", { box: string; text: string }> = {
  uebernommen: {
    box: "rounded-md border border-blue-200 bg-blue-50/50 px-2 pt-1.5 pb-1.5 dark:border-blue-900 dark:bg-blue-950/20",
    text: "text-blue-800 dark:text-blue-300",
  },
  abweichend: {
    box: "rounded-md border border-amber-300 bg-amber-50/60 px-2 pt-1.5 pb-1.5 dark:border-amber-800 dark:bg-amber-950/20",
    text: "text-amber-800 dark:text-amber-300",
  },
};

/**
 * Rahmen und Etikett um ein Feld, zu dem eine Vorabantwort vorliegt.
 *
 * Der umschließende `div` steht bewusst immer da, auch ohne Kennzeichnung.
 * Käme er erst beim Statuswechsel dazu, würde React das Eingabefeld darin neu
 * einhängen und der Fokus ginge mitten im Tippen verloren.
 */
export const VorabRahmen = ({ status, children }: { status: VorabStatus; children: React.ReactNode }) => {
  const stil = istGekennzeichnet(status)
    ? VORAB_KLASSEN[status as "uebernommen" | "abweichend"]
    : null;
  return (
    <div className={stil?.box}>
      {children}
      {stil && (
        <p className={`mt-1 flex items-center gap-1 text-[10px] ${stil.text}`}>
          <ClipboardList className="h-3 w-3 shrink-0" />
          {vorabEtikett(status)}
        </p>
      )}
    </div>
  );
};

/** Alles, was die Feld-Renderer über den Gesprächsstand wissen müssen. */
export type FelderKontext = {
  assessment: AssessmentAntworten;
  setAssessment: (patch: Partial<AssessmentAntworten>) => void;
  canEdit: boolean;
  /** Der Vorab-Fragebogen des Bewerbers, falls vorhanden */
  vorwissen: Vorwissen | null;
};

/** Ein einzelnes Eingabefeld je nach Feldtyp. */
export function AssessmentFeldEingabe({ feld, ctx }: { feld: AssessmentFeld; ctx: FelderKontext }) {
  const { assessment, setAssessment, canEdit } = ctx;
  const wert = assessment[feld.key];
  switch (feld.typ) {
    case "text":
    case "zahl":
      return (
        <Input
          className="mt-1 h-9 text-sm"
          inputMode={feld.typ === "zahl" ? "numeric" : undefined}
          value={(wert as string) ?? ""}
          onChange={(e) => setAssessment({ [feld.key]: e.target.value })}
          disabled={!canEdit}
          placeholder={feld.placeholder}
        />
      );
    case "notiz":
      return (
        <Textarea
          className="text-sm min-h-[70px] mt-1"
          value={(wert as string) ?? ""}
          onChange={(e) => setAssessment({ [feld.key]: e.target.value })}
          disabled={!canEdit}
          placeholder={feld.placeholder}
        />
      );
    case "auswahl":
      return (
        <Select
          value={(wert as string) ?? ""}
          onValueChange={(v) => setAssessment({ [feld.key]: v })}
          disabled={!canEdit}
        >
          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="– auswählen –" /></SelectTrigger>
          <SelectContent>
            {(feld.optionen ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "janein":
      return (
        <Select
          value={(wert as string) ?? ""}
          onValueChange={(v) => setAssessment({ [feld.key]: v })}
          disabled={!canEdit}
        >
          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="– auswählen –" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ja">Ja</SelectItem>
            <SelectItem value="nein">Nein</SelectItem>
          </SelectContent>
        </Select>
      );
    case "mehrfach": {
      const liste = Array.isArray(wert) ? (wert as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(feld.optionen ?? []).map((o) => {
            const aktiv = liste.includes(o.value);
            return (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={aktiv ? "default" : "outline"}
                disabled={!canEdit}
                onClick={() =>
                  setAssessment({
                    [feld.key]: aktiv ? liste.filter((x) => x !== o.value) : [...liste, o.value],
                  })
                }
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      );
    }
    case "skala": {
      const zahl = typeof wert === "number" ? wert : 0;
      return (
        /* Auf dem Handy grosse Ziele: 32px nebeneinander trifft man mit dem
           Daumen nicht zuverlaessig. Ab `sm` bleibt alles wie bisher. */
        <div className="flex items-center gap-2 mt-1 sm:gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant={zahl === i ? "default" : "outline"}
              className="h-10 w-10 p-0 sm:h-8 sm:w-8"
              disabled={!canEdit}
              onClick={() => setAssessment({ [feld.key]: i })}
            >
              {i}
            </Button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">{zahl > 0 ? `${zahl}/5` : "–"}</span>
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * Eine Liste von Feldern samt Frage-Sprechtext, Vorwissen-Streifen und
 * Vorab-Rahmen. Hat der Bewerber zu genau diesem Feld etwas vorab angegeben,
 * steht der Hinweis direkt über der Eingabe, mitsamt der vorformulierten
 * Vertiefungsfrage. Ohne Vorwissen ändert sich nichts.
 */
export function AssessmentFelder({ felder, ctx }: { felder: AssessmentFeld[]; ctx: FelderKontext }) {
  const { assessment, setAssessment, vorwissen } = ctx;
  return (
    <div className="space-y-3">
      {felder.map((feld) => {
        const vorabFrage = frageFuerFeld(String(feld.key));
        // Woher stammt der Wert im Feld? Daraus wird der farbige Rahmen samt
        // Etikett. Ohne Vorwissen bleibt der Status "keine" und nichts ändert sich.
        const herkunft = vorabHerkunft(String(feld.key), vorwissen?.antworten, assessment);
        return (
          <div key={String(feld.key)} className="space-y-1">
            {feld.frage && <Script>„{feld.frage}"</Script>}
            <Label className="text-xs">{feld.label}</Label>
            {vorabFrage && (
              <VorwissenStreifen
                frageKey={vorabFrage.key}
                vorwissen={vorwissen}
                assessment={assessment}
                onUebernehmen={setAssessment}
              />
            )}
            <VorabRahmen status={herkunft.status}><AssessmentFeldEingabe feld={feld} ctx={ctx} /></VorabRahmen>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Punkt 3: die vier Pfad-Kacheln (Mehrfachwahl) und darunter der
 * Vertiefungsblock je gewähltem Pfad mit Sprechtext, Regie und Feldern.
 */
export function PfadAuswahl({ ctx }: { ctx: FelderKontext }) {
  const { assessment, setAssessment, canEdit, vorwissen } = ctx;
  const pfade = assessment.pfade ?? [];
  const stark = staerksterPfad(pfade);
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Was bringt der Bewerber mit? Mehrfachwahl möglich, der stärkste Pfad zählt. Die Auswahl steuert den Vertiefungsblock und das Scoring.
      </p>
      {/* Die Selbsteinschätzung aus dem Fragebogen als Vorschlag über den
          Kacheln. Sie setzt die Auswahl bewusst nicht selbst: Der Pfad ist
          mit 30 von 100 Punkten der größte Einzelposten im Scoring. */}
      <VorwissenStreifen
        frageKey="hintergrund"
        vorwissen={vorwissen}
        assessment={assessment}
        onUebernehmen={setAssessment}
      />
      <VorabRahmen status={vorabHerkunft("pfade", vorwissen?.antworten, assessment).status}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {ASSESSMENT_PFADE.map((p) => {
            const aktiv = pfade.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  setAssessment({
                    pfade: aktiv ? pfade.filter((x) => x !== p.id) : [...pfade, p.id],
                  })
                }
                className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed ${
                  aktiv ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-primary/40"
                }`}
              >
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {p.label}
                  {aktiv && stark?.id === p.id && pfade.length > 1 && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">stärkster Pfad</Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{p.beschreibung}</div>
              </button>
            );
          })}
        </div>
      </VorabRahmen>
      {pfade.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
          Wähle oben mindestens ein Profil aus, dann erscheint hier der passende Vertiefungsblock.
        </p>
      ) : (
        ASSESSMENT_PFADE.filter((p) => pfade.includes(p.id)).map((p) => (
          <div key={p.id} className="rounded-lg border p-3 space-y-3">
            <div className="text-xs font-semibold flex items-center gap-2">
              Pfad {p.label}
              {stark?.id === p.id && pfade.length > 1 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0">stärkster Pfad</Badge>
              )}
            </div>
            <Script>„{p.sprechtext}"</Script>
            {p.hinweis && <RegieHinweis hinweis={p.hinweis} wortlaut={p.hinweisWortlaut} />}
            <AssessmentFelder felder={p.felder} ctx={ctx} />
          </div>
        ))
      )}
    </>
  );
}

/** Punkt 8: die Einwände zum Aufklappen, jeder mit seiner Antwort. */
export function EinwandListe() {
  return (
    <>
      <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
        Klicke auf einen Einwand, um die passende Antwort zu sehen.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {ASSESSMENT_EINWAENDE.map((e) => (
          <AccordionItem key={e.id} value={e.id}>
            <AccordionTrigger className="text-sm">„{e.einwand}"</AccordionTrigger>
            <AccordionContent className="space-y-2">
              <Script>„{e.antwort}"</Script>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

const EMPFEHLUNG_BADGE: Record<AssessmentEmpfehlung, string> = {
  A: "bg-green-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-red-600 text-white",
};

/**
 * Punkt 9: Sterne für den Gesamteindruck, Punktzahl mit Empfehlung, die
 * Übersteuerung durch HR und die Begründung. Die Handlungsknöpfe (Follow-Up,
 * Absage) gibt der Aufrufer als `aktionen` mit, denn sie öffnen Dialoge, die
 * nur der Reiter kennt.
 */
export function EinschaetzungBlock({
  ctx,
  bewerberBewertung,
  aktionen,
}: {
  ctx: FelderKontext;
  /** Rückfall für den Gesamteindruck, falls im Skript noch nichts steht */
  bewerberBewertung?: number;
  aktionen?: React.ReactNode;
}) {
  const { assessment, setAssessment, canEdit } = ctx;
  const score = berechneAssessmentScore(assessment);
  const eindruck = assessment.gesamteindruck ?? bewerberBewertung ?? 0;
  return (
    <>
      <div>
        <Label className="text-xs">
          Wie schätzt du den Bewerber nach dem Gespräch ein? (1 = nicht qualifiziert, 5 = absoluter Top-Kandidat)
        </Label>
        <div className="flex items-center gap-1 mt-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" disabled={!canEdit}
              onClick={() => setAssessment({ gesamteindruck: i })}
              className="p-0.5 disabled:cursor-not-allowed">
              <Star className={`h-7 w-7 ${i <= eindruck ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} ${canEdit ? "hover:scale-110 transition" : ""}`} />
            </button>
          ))}
          <span className="ml-2 text-sm font-medium">{eindruck}/5</span>
        </div>
        <p className="text-[10px] text-muted-foreground">↑ wird mit Übersicht synchronisiert</p>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Punktzahl</span>
          <Badge variant="outline">{score.punkte} / {score.maxPunkte}</Badge>
          <span className="text-xs text-muted-foreground ml-2">Empfehlung</span>
          <Badge className={EMPFEHLUNG_BADGE[score.empfehlung]}>
            {EMPFEHLUNG_LABELS[score.empfehlung]}
          </Badge>
          {score.uebersteuert && (
            <Badge variant="outline" className="text-[10px]">übersteuert, automatisch: {score.empfehlungAuto}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{score.begruendung}</p>

        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Empfehlung übersteuern (HR)</Label>
            <Select
              value={assessment.empfehlungOverride || "auto"}
              onValueChange={(v) => setAssessment({ empfehlungOverride: v === "auto" ? "" : (v as AssessmentEmpfehlung) })}
              disabled={!canEdit}
            >
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatisch ({EMPFEHLUNG_LABELS[score.empfehlungAuto]})</SelectItem>
                <SelectItem value="A">{EMPFEHLUNG_LABELS.A}</SelectItem>
                <SelectItem value="B">{EMPFEHLUNG_LABELS.B}</SelectItem>
                <SelectItem value="C">{EMPFEHLUNG_LABELS.C}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Begründung / Anmerkung</Label>
            <Input className="mt-1 h-9 text-sm"
              value={assessment.empfehlungBegruendung ?? ""}
              onChange={(e) => setAssessment({ empfehlungBegruendung: e.target.value })}
              disabled={!canEdit}
              placeholder="Warum diese Einschätzung?" />
          </div>
        </div>

        {aktionen}
      </div>
    </>
  );
}

/** Wandelt ein Datum im Format TT.MM.JJJJ in den Wert eines date-Inputs um. */
function alsInputDatum(datum: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum;
  return datum.includes(".") ? datum.split(".").reverse().join("-") : "";
}

/**
 * Punkt 10: die Sprechtexte zur Terminbuchung mit eingesetztem Termin, der
 * Buchungslink und die Felder Datum und Uhrzeit. Das Datum wird wie im
 * Bewerberprofil als TT.MM.JJJJ gehalten.
 */
export function TerminBuchung({
  vorname,
  closingDatum,
  closingUhrzeit,
  setClosingDatum,
  setClosingUhrzeit,
  canEdit,
}: {
  vorname: string;
  closingDatum: string;
  closingUhrzeit: string;
  setClosingDatum: (v: string) => void;
  setClosingUhrzeit: (v: string) => void;
  canEdit: boolean;
}) {
  const p10 = getStation(10);
  return (
    <>
      {(p10.sprechtexte ?? []).map((t, i) => (
        <Script key={i}>
          „{fuellePlatzhalter(t, {
            vorname,
            datum: closingDatum && closingUhrzeit ? `${closingDatum} um ${closingUhrzeit} Uhr` : closingDatum,
          })}"
        </Script>
      ))}
      <a href={CLOSING_BUCHUNGSLINK} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="default" className="gap-1">
          <Calendar className="h-3.5 w-3.5" /> Closing-Termin buchen
          <ExternalLink className="h-3 w-3 ml-0.5" />
        </Button>
      </a>
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Closing-Termin Datum</Label>
          <Input type="date" className="mt-1 h-9 text-sm"
            value={alsInputDatum(closingDatum)}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-");
              setClosingDatum(d && m && y ? `${d}.${m}.${y}` : "");
            }} disabled={!canEdit} />
          {closingDatum && <p className="text-[10px] text-muted-foreground mt-0.5">{closingDatum}</p>}
        </div>
        <div>
          <Label className="text-xs">Uhrzeit</Label>
          <Input type="time" className="mt-1 h-9 text-sm" value={closingUhrzeit}
            onChange={(e) => setClosingUhrzeit(e.target.value)} disabled={!canEdit} />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        ↑ Sobald Datum und Uhrzeit gesetzt sind, springt der Status beim Abschließen automatisch auf <strong>Closing</strong>.
      </p>
    </>
  );
}

// ─── Abschluss des Gesprächs: Zusammenfassung und die beiden Dialoge ───
// Gemeinsam für den Reiter Erstgespräch und die Moderationsansicht; die
// Wirkung dahinter liegt in useErstgespraechAbschluss.ts.

/**
 * Die Karte mit der KI-Zusammenfassung, einklappbar. Der Zustand liegt beim
 * Aufrufer und wird bewusst nicht gespeichert.
 */
export function ZusammenfassungKarte({
  skript, mitClosing, offen, onOffenChange,
}: {
  skript: Pick<ErstgespraechSkript, "zusammenfassung" | "zusammenfassungAm">;
  /** Lief Teil 2 mit? Dann trägt die Karte beide Namen. */
  mitClosing: boolean;
  offen: boolean;
  onOffenChange: (offen: boolean) => void;
}) {
  if (!skript.zusammenfassung) return null;
  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 to-transparent border-primary/30">
      <Collapsible open={offen} onOpenChange={onOffenChange}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 text-left">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              {mitClosing ? "KI-Zusammenfassung Erstgespräch und Closing" : "KI-Zusammenfassung Erstgespräch"}
            </span>
            {skript.zusammenfassungAm && (
              <span className="text-[10px] text-muted-foreground">
                · {new Date(skript.zusammenfassungAm).toLocaleDateString("de-DE")}
              </span>
            )}
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${offen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
            {skript.zusammenfassung}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/** Empfehlung B: Wiedervorlage mit Datum, Uhrzeit und Notiz. */
export function FollowUpDialog({
  open, onOpenChange, initial, onBestaetigen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vorbelegung beim Öffnen, meist das bereits gespeicherte Follow-Up */
  initial: { datum: string; uhrzeit: string; notiz: string };
  /** Liefert true, wenn gespeichert wurde; dann schließt der Dialog. */
  onBestaetigen: (datum: string, uhrzeit: string, notiz: string) => Promise<boolean>;
}) {
  const [datum, setDatum] = useState(initial.datum);
  const [uhrzeit, setUhrzeit] = useState(initial.uhrzeit);
  const [notiz, setNotiz] = useState(initial.notiz);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => {
    if (open) { setDatum(initial.datum); setUhrzeit(initial.uhrzeit); setNotiz(initial.notiz); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bestaetigen = async () => {
    setSpeichert(true);
    try {
      const ok = await onBestaetigen(datum, uhrzeit, notiz);
      if (ok) onOpenChange(false);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!speichert) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow-Up-Termin setzen</DialogTitle>
          <DialogDescription>
            Das Gespräch wird gespeichert, eine KI-Zusammenfassung wird erstellt und der Status wechselt auf{" "}
            <strong>Follow-Up</strong>. Die Wiedervorlage erscheint am Fälligkeitstag in der Inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="follow-up-dialog-datum">Datum (Pflichtfeld)</Label>
              <Input id="follow-up-dialog-datum" type="date" className="mt-1 h-9 text-sm"
                value={datum.match(/^\d{4}-\d{2}-\d{2}$/) ? datum :
                  datum.includes(".") ? datum.split(".").reverse().join("-") : ""}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split("-");
                  setDatum(d && m && y ? `${d}.${m}.${y}` : "");
                }} />
              {datum && <p className="text-[10px] text-muted-foreground mt-0.5">{datum}</p>}
            </div>
            <div>
              <Label className="text-xs" htmlFor="follow-up-dialog-uhrzeit">Uhrzeit (optional)</Label>
              <Input id="follow-up-dialog-uhrzeit" type="time" className="mt-1 h-9 text-sm" value={uhrzeit}
                onChange={(e) => setUhrzeit(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs" htmlFor="follow-up-dialog-notiz">Notiz (optional)</Label>
            <Textarea id="follow-up-dialog-notiz" className="text-sm min-h-[70px] mt-1" value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Was soll beim Follow-Up geklärt werden?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={speichert} onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button size="sm" disabled={speichert || !datum.trim()} onClick={bestaetigen}>
            {speichert ? "Speichere …" : "Follow-Up planen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kein Interesse oder Absage: Grund (Pflicht) und optionale Absage-Mail. */
export function AbsageDialog({
  open, onOpenChange, modus, initialGrund, bewerberEmail, onBestaetigen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modus: "kein_interesse" | "abgelehnt";
  initialGrund: string;
  bewerberEmail: string;
  /** Liefert true, wenn gespeichert wurde; dann schließt der Dialog. */
  onBestaetigen: (grund: string, mailSenden: boolean) => Promise<boolean>;
}) {
  const [grund, setGrund] = useState(initialGrund);
  // Wertschätzende Absage-Mail: standardmäßig an, bei jedem Öffnen zurückgesetzt
  const [mailSenden, setMailSenden] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => {
    if (open) { setGrund(initialGrund); setMailSenden(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bestaetigen = async () => {
    setSpeichert(true);
    try {
      const ok = await onBestaetigen(grund, mailSenden);
      if (ok) { onOpenChange(false); setGrund(""); }
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!speichert) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modus === "kein_interesse" ? "Kein Interesse" : "Abgelehnt"}
          </DialogTitle>
          <DialogDescription>
            Bitte gib einen kurzen Grund an. Das Erstgespräch wird gespeichert,
            eine KI-Zusammenfassung wird erstellt und der Bewerber-Status wechselt auf{" "}
            <strong>{modus === "kein_interesse" ? '„Kein Interesse"' : '„Abgelehnt"'}</strong>.
            {" "}Der Grund bleibt intern und steht nicht in der Mail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs" htmlFor="absage-dialog-grund">Grund (Pflichtfeld)</Label>
          <Textarea
            id="absage-dialog-grund"
            className="text-sm min-h-[100px]"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder="z. B. Kein Budget, kein echtes Interesse, falsche Vorstellungen, anderer Job zugesagt …"
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
            <Checkbox
              checked={mailSenden}
              onCheckedChange={(v) => setMailSenden(v === true)}
              disabled={!bewerberEmail}
            />
            <span>Wertschätzende Absage-Mail senden{bewerberEmail ? ` (an ${bewerberEmail})` : " (keine E-Mail hinterlegt)"}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={speichert} onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="destructive" size="sm" disabled={speichert || !grund.trim()} onClick={bestaetigen}>
            {speichert
              ? "Speichere …"
              : modus === "kein_interesse"
                ? 'Als „Kein Interesse" markieren'
                : 'Als „Abgelehnt" markieren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
