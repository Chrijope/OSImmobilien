import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Check, Send, Info, ChevronDown, ChevronRight } from "lucide-react";
import {
  FORMULAR_FRAGEN,
  alsAssessmentWert,
  antwortText,
  frageSichtbar,
  getFrage,
  fragenOhneFeldZuStation,
  hatNetzwerk,
  kurzmarken,
  vertiefungZu,
  type FormularAntworten,
} from "@/lib/bewerberFormular";
import { anzahlVorabFelder, vorabHerkunft } from "@/lib/vorabHerkunft";
import { berechneVorabScore, VORAB_EINSTUFUNG_LABELS } from "@/lib/bewerberVorabScore";
import { VorabScoreAufschluesselung, VorabScoreBadge } from "@/components/bewerbung/VorabScoreBadge";
import type { AssessmentAntworten } from "@/lib/assessmentSkript";

/**
 * Was der Bewerber vorab im Fragebogen angegeben hat.
 *
 * Zwei Darstellungen mit zwei verschiedenen Aufgaben:
 *
 *   `VorwissenKarte`   für die zwanzig Sekunden VOR dem Anruf, wenn sich die
 *                      HR-Managerin orientiert.
 *   `VorwissenStreifen` für die zwanzig Minuten WÄHREND des Gesprächs, wenn sie
 *                      den Blick nicht mehr heben kann.
 */

export type Vorwissen = {
  antworten: FormularAntworten;
  eingereichtAm?: string | null;
};

function datumKurz(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function VorwissenKarte({
  vorname,
  vorwissen,
  offen,
  onOffenChange,
}: {
  vorname: string;
  vorwissen: Vorwissen;
  /**
   * Einklapp-Hülle (Reiter Erstgespräch): eingeklappt bleiben nur Kopfzeile
   * und Chips stehen. Ohne diese beiden Angaben ist die Karte immer offen.
   */
  offen?: boolean;
  onOffenChange?: (offen: boolean) => void;
}) {
  const { antworten, eingereichtAm } = vorwissen;
  const marken = kurzmarken(antworten);
  const klappbar = typeof onOffenChange === "function";
  const ausgeklappt = !klappbar || offen !== false;
  /*
   * Die beiden Freitexte stehen unten im Original, nicht in der Zeilenliste.
   * Eine abgetippte Kurzfassung wäre hier wertlos: Bei "was erwartest du" und
   * "was bringst du ein" trägt der Wortlaut die Information, nicht die Länge.
   *
   * "motivation" war bis zum 25.08.2026 die einzige Freitextfrage und wird
   * weiter angezeigt, damit Angaben von Bewerbern aus der Zeit davor nicht
   * verschwinden.
   */
  const freitexte: { label: string; text: string }[] = [
    { label: "Erwartet von uns", text: (antworten["erwartung"] as string) || "" },
    { label: "Bringt selbst ein", text: (antworten["einsatz"] as string) || "" },
    { label: "Was ihn reizt", text: (antworten["motivation"] as string) || "" },
  ].filter((f) => f.text.trim() !== "");
  const vorabFelder = anzahlVorabFelder(antworten);
  // Der Vorab-Score misst nur diese Antworten, nicht das Gespräch. Den
  // Gesprächs-Score zeigt weiterhin der Zwischenstand.
  const vorabScore = berechneVorabScore(antworten);

  const FREITEXT_KEYS = ["erwartung", "einsatz", "motivation"];
  const zeilen = FORMULAR_FRAGEN
    .filter((f) => !FREITEXT_KEYS.includes(f.key) && frageSichtbar(f, antworten))
    .map((f) => ({ kurz: f.kurz, text: antwortText(f, antworten) }))
    .filter((z) => z.text);

  const kopfzeile = (
    <>
      <ClipboardList className="h-4 w-4 text-blue-700 shrink-0" />
      <h3 className="font-bold text-sm">
        Das hat {vorname || "der Bewerber"} vorab angegeben
      </h3>
      {eingereichtAm && (
        <Badge variant="outline" className="bg-white font-normal text-[10px] text-muted-foreground">
          ausgefüllt am {datumKurz(eingereichtAm)}
        </Badge>
      )}
    </>
  );

  return (
    <Card className={`border-blue-200 bg-blue-50/40 ${ausgeklappt ? "p-5" : "px-5 py-3"}`} data-testid="vorwissen-karte" data-offen={ausgeklappt ? "ja" : "nein"}>
      {klappbar ? (
        <button
          type="button"
          onClick={() => onOffenChange(!ausgeklappt)}
          aria-expanded={ausgeklappt}
          className={`flex w-full items-center gap-2 text-left ${ausgeklappt ? "mb-3" : ""}`}
        >
          {kopfzeile}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
            {vorabFelder > 0 && !ausgeklappt && (
              <span className="hidden sm:inline">
                {vorabFelder === 1 ? "Eine Angabe zahlt" : `${vorabFelder} Angaben zahlen`} auf Skriptfelder ein
              </span>
            )}
            {vorabScore && <VorabScoreBadge score={vorabScore} />}
            {ausgeklappt
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 mb-3">
          {kopfzeile}
          {vorabScore && <span className="ml-auto"><VorabScoreBadge score={vorabScore} /></span>}
        </div>
      )}

      {vorabScore && ausgeklappt && (
        <>
          <p className="mb-3 text-[11px] text-muted-foreground" data-testid="vorab-score-begruendung">
            <span className="font-medium text-foreground">Vorab-Score {vorabScore.punkte}, {VORAB_EINSTUFUNG_LABELS[vorabScore.einstufung]}:</span>{" "}
            {vorabScore.begruendung}. Misst nur die Angaben im Fragebogen, den Gesprächs-Score zeigt der Zwischenstand.
          </p>
          {/*
            Die Herleitung steht sichtbar da und nicht im Tooltip: Wer nach dem
            Score auswählt, muss sehen, welche Angabe wie viel getragen hat.
          */}
          <div className="mb-4 rounded-md border border-blue-200 bg-white/60 p-2.5">
            <VorabScoreAufschluesselung score={vorabScore} />
          </div>
        </>
      )}

      {marken.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${ausgeklappt ? "mb-4" : "mt-2"}`}>
          {marken.map((m) => (
            <Badge key={m} variant="outline" className="bg-white border-blue-200 text-blue-900 font-normal">
              {m}
            </Badge>
          ))}
        </div>
      )}

      {ausgeklappt && (
      <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {zeilen.map((z) => (
          <div key={z.kurz} className="contents">
            <dt className="text-muted-foreground whitespace-nowrap">{z.kurz}</dt>
            <dd className="font-medium">{z.text}</dd>
          </div>
        ))}
        {hatNetzwerk(antworten) && (
          <div className="contents">
            <dt className="text-muted-foreground whitespace-nowrap">Netzwerk</dt>
            <dd className="font-medium">Hat ein eigenes Netzwerk</dd>
          </div>
        )}
      </dl>

      {vorabFelder > 0 && (
        // Die Legende steht bewusst hier und nicht als eigener Kasten über dem
        // Skript: Die Karte ist ohnehin der Ort, an dem das Formular erklärt wird.
        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            {vorabFelder === 1
              ? "Eine dieser Angaben zahlt"
              : `${vorabFelder} dieser Angaben zahlen`}{" "}
            auf ein Feld im Skript ein. Dort ist das Feld blau umrandet, sobald der
            Wert der Vorabangabe entspricht. Weicht er im Gespräch davon ab, wird
            die Kennzeichnung gelb.
          </span>
        </p>
      )}

      {freitexte.length > 0 ? (
        <div className="mt-4 space-y-3">
          {freitexte.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </p>
              <blockquote className="mt-1 border-l-2 border-blue-300 pl-3 text-sm italic text-muted-foreground">
                „{f.text}"
              </blockquote>
            </div>
          ))}
        </div>
      ) : (
        // Neutral formuliert: Es ist eine Beobachtung, keine Bewertung.
        <p className="mt-4 text-xs text-muted-foreground">
          Die beiden freiwilligen Fragen nach Erwartung und Einsatz wurden nicht beantwortet.
        </p>
      )}
      </>
      )}
    </Card>
  );
}

/**
 * Der schmale Streifen über einem Skriptfeld: Vorabantwort, Übernehmen-Knopf
 * und die vorformulierte Vertiefungsfrage passend zum gegebenen Wert.
 *
 * Der Knopf ist bewusst nötig. Formularantworten setzen nie selbst ein Feld,
 * weil zwei der drei harten Kriterien aus dem Formular kommen und zwei gerissene
 * harte Kriterien im Scoring die Absage erzwingen. Der Klick ist zugleich der
 * Moment, in dem die Aussage im Gespräch bestätigt wurde.
 */
export function VorwissenStreifen({
  frageKey,
  vorwissen,
  assessment,
  onUebernehmen,
}: {
  frageKey: string;
  vorwissen: Vorwissen | null;
  assessment: AssessmentAntworten;
  onUebernehmen: (patch: Partial<AssessmentAntworten>) => void;
}) {
  if (!vorwissen) return null;
  const frage = getFrage(frageKey);
  if (!frage || !frageSichtbar(frage, vorwissen.antworten)) return null;

  const text = antwortText(frage, vorwissen.antworten);
  if (!text) return null;

  const vertiefung = vertiefungZu(frage, vorwissen.antworten);
  const wert = frage.zielFeld ? alsAssessmentWert(frage, vorwissen.antworten) : null;

  // Schon übernommen oder von Hand anders gesetzt? Dann keinen Knopf mehr zeigen.
  // Derselbe Vergleich trägt die farbige Kennzeichnung am Feld im Skript.
  const bereitsGesetzt = frage.zielFeld
    ? vorabHerkunft(frage.zielFeld, vorwissen.antworten, assessment).status === "uebernommen"
    : false;

  return (
    <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 mb-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Vorab angegeben:</span> {text}
        </p>
        {frage.zielFeld && wert !== null && !bereitsGesetzt && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] shrink-0"
            onClick={() => onUebernehmen({ [frage.zielFeld!]: wert } as Partial<AssessmentAntworten>)}
          >
            Übernehmen
          </Button>
        )}
        {bereitsGesetzt && (
          <span className="flex items-center gap-1 text-[11px] text-green-700 shrink-0">
            <Check className="h-3 w-3" /> übernommen
          </span>
        )}
      </div>
      {vertiefung && (
        <p className="mt-1.5 italic text-muted-foreground/80">„{vertiefung}"</p>
      )}
    </div>
  );
}

/**
 * Die Vorab-Angaben, die zu einer Station gehören, aber an keinem Feld hängen.
 *
 * Ohne diesen Block wären Region, Erfahrungsdauer, Perspektive, Leadwunsch und
 * die beiden Freitexte im Gespräch unsichtbar: Sie füllen kein Skriptfeld und
 * bekämen deshalb keinen Streifen. Sie stehen jetzt unter der Überschrift der
 * Station, zu der sie inhaltlich gehören, mitsamt der vorformulierten
 * Vertiefungsfrage.
 */
export function VorabZurStation({
  station,
  vorwissen,
}: {
  station: number;
  vorwissen: Vorwissen | null;
}) {
  if (!vorwissen) return null;

  const eintraege = fragenOhneFeldZuStation(station)
    .filter((f) => frageSichtbar(f, vorwissen.antworten))
    .map((f) => ({
      frage: f,
      text: antwortText(f, vorwissen.antworten),
      vertiefung: vertiefungZu(f, vorwissen.antworten),
    }))
    .filter((e) => e.text.trim() !== "");

  if (eintraege.length === 0) return null;

  return (
    <div className="rounded-md border border-muted bg-muted/30 px-3 py-2 mb-2 text-xs space-y-1.5">
      {eintraege.map(({ frage, text, vertiefung }) => (
        <div key={frage.key}>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{frage.kurz}:</span> {text}
          </p>
          {vertiefung && (
            <p className="mt-1 italic text-muted-foreground/80">„{vertiefung}"</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Steht statt der Karte da, wenn nichts vorliegt. */
export function VorwissenFehltHinweis({
  onErneutSenden,
  sendet,
  /**
   * Was der Knopf verschickt.
   *
   * Er stand fest auf „Formularlink senden" und verschickte im neuen Ablauf
   * trotzdem etwas anderes, nämlich die Einladung zum Kennenlernen. Die
   * Beschriftung kommt deshalb von außen, aus `bewerberArbeitsplatz.ts`.
   */
  knopfText = "Formularlink senden",
  /** Der Satz daneben. Er nennt den Bogen, den es in diesem Ablauf gibt. */
  hinweisText = "Kein Vorab-Fragebogen vorhanden. Das Gespräch läuft unverändert von Punkt 1 bis Punkt 10.",
}: {
  onErneutSenden: () => void;
  sendet: boolean;
  knopfText?: string;
  hinweisText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-dashed px-4 py-2.5 text-xs text-muted-foreground">
      <span>{hinweisText}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 shrink-0"
        disabled={sendet}
        onClick={onErneutSenden}
      >
        <Send className="h-3 w-3" />
        {sendet ? "Wird gesendet …" : knopfText}
      </Button>
    </div>
  );
}
