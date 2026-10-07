import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChevronDown } from "lucide-react";
import type { MetaScore } from "@/lib/bewerberMetaScore";
import {
  VORAB_EINSTUFUNG_LABELS,
  VORAB_SCHWELLE_A,
  VORAB_SCHWELLE_B,
  type BogenHerkunft,
  type VorabEinstufung,
  type VorabPosten,
  type VorabScore,
} from "@/lib/bewerberVorabScore";

/**
 * Anzeige des Vorab-Scores an drei Stellen: in der Bewerberliste als Spalte,
 * in der Übersicht des Bewerbers und in der Vorwissen-Karte des Erstgesprächs.
 *
 * Dargestellt als Ampel, mit denselben Farben wie die InactivityAmpel bei den
 * Kunden: A grün, B orange, C rot. Ampelpunkt plus "82 · A" in der Farbe der
 * Einstufung, damit der Score überall gleich wiedererkennbar ist.
 */

const AMPEL_PUNKT: Record<VorabEinstufung, string> = {
  A: "bg-emerald-500",
  B: "bg-orange-500",
  C: "bg-red-500",
};

const AMPEL_TEXT: Record<VorabEinstufung, string> = {
  A: "text-emerald-700",
  B: "text-orange-600",
  C: "text-red-600",
};

/**
 * Woher der Score stammt, als Kürzel hinter der Zahl. Seit dem 16.09.2026.
 *
 * ## Warum ein Buchstabe und nicht eine Farbe
 *
 * Die Farbe im Badge gehört der Einstufung, sie ist vergeben. Und Farbe allein
 * trägt ohnehin keine Aussage: Wer sie nicht unterscheiden kann, sähe nichts.
 * Deshalb ein Buchstabe, dazu ein Tooltip, der ihn ausschreibt, und ein
 * `aria-label`, das ihn als Satz nennt.
 *
 * ## Warum es mit Tilde und Sternchen nicht zu verwechseln ist
 *
 * In dieser Spalte stehen schon zwei Zeichen, die etwas anderes meinen:
 *
 *   - die Tilde, etwa `~67 · B`. Sie sitzt VOR der Zahl, in einem eigenen,
 *     gedämpften Badge ohne Ampelpunkt, und meint die Vorabeinschätzung aus
 *     den Bewerbungsfragen der Anzeige (`MetaScoreBadge`).
 *   - das Sternchen, etwa `85 · A *`. Es sitzt direkt hinter der Einstufung,
 *     in ihrer Farbe, und meint einen unvollständig ausgefüllten Bogen
 *     (`score.unvollstaendig`).
 *
 * Das Herkunftskürzel ist von beiden abgesetzt: Es steht hinter einem
 * senkrechten Trennstrich, in gedämpfter Farbe und in normaler Strichstärke,
 * und es ist ein Buchstabe und kein Satzzeichen. Der Trennstrich ist dabei das
 * Entscheidende, ohne ihn stünden zwei Buchstaben nebeneinander, die
 * Verschiedenes meinen: die Einstufung und die Herkunft.
 */
const HERKUNFT_KUERZEL: Record<BogenHerkunft, string> = {
  kennenlernen: "K",
  vorabbogen: "V",
  unbekannt: "?",
};

/** Die Überschrift im Tooltip: welcher Bogen gemeint ist. */
const HERKUNFT_TITEL: Record<BogenHerkunft, string> = {
  kennenlernen: "Kennenlernbogen",
  vorabbogen: "Früherer Vorabbogen",
  unbekannt: "Bogen nicht mehr erkennbar",
};

/** Was das für die Aussagekraft bedeutet. Ganzer Satz, auch für das `aria-label`. */
const HERKUNFT_SATZ: Record<BogenHerkunft, string> = {
  kennenlernen:
    "Dieser Score beruht auf dem Kennenlernbogen. Er ist der neuere und ausführlichere Bogen, " +
    "deshalb trägt seine Einschätzung weiter.",
  vorabbogen:
    "Dieser Score beruht auf dem früheren Vorabbogen. Er fragt weniger und kennt die Fragen der " +
    "fünf Wege nicht, deshalb trägt seine Einschätzung weniger weit als der Kennenlernbogen.",
  unbekannt:
    "Aus den Antworten lässt sich nicht mehr ablesen, welcher der beiden Bögen ausgefüllt wurde. " +
    "Deshalb ist offen, wie weit diese Einschätzung trägt. Im Zweifel im Gespräch nachfragen.",
};

/**
 * Das Kürzel im Badge.
 *
 * `role="img"` mit `aria-label` ist Absicht: Vorgelesen werden soll der Satz
 * und nicht der einzelne Buchstabe, den niemand deuten kann, der die Legende
 * nicht kennt.
 */
function HerkunftKuerzel({ herkunft }: { herkunft: BogenHerkunft }) {
  return (
    <span
      role="img"
      aria-label={HERKUNFT_SATZ[herkunft]}
      className="border-l border-border pl-1 font-normal text-muted-foreground"
      data-testid="vorab-score-herkunft"
      data-herkunft={herkunft}
    >
      {HERKUNFT_KUERZEL[herkunft]}
    </span>
  );
}

/** Was der Score bedeutet, für Spaltenkopf und Tooltip. */
export const VORAB_SCORE_ERKLAERUNG =
  `Aus dem eingereichten Bogen berechnet, 0 bis 100. Am meisten zählen die Zeit pro Woche, ` +
  `woher die ersten Kunden kommen sollen und die Perspektive, dazu die Fragen des gewählten ` +
  `Wegs. Gerechnet wird immer auf das, was dieser Bogen wirklich gefragt hat, deshalb sind alle ` +
  `fünf Wege vergleichbar. A ab ${VORAB_SCHWELLE_A}, B ab ${VORAB_SCHWELLE_B}, darunter C. ` +
  `Ein Strich heißt: kein Bogen und keine Angaben aus der Anzeige. Eine gedämpfte Zahl mit ` +
  `Tilde, etwa ~67 · B, ist eine Vorabeinschätzung aus den vier Bewerbungsfragen der Anzeige. ` +
  `Sie sagt nur, wen man zuerst anrufen sollte, und wird vom richtigen Score abgelöst, sobald ` +
  `der Bogen da ist. Beide können deutlich auseinanderliegen: Die Herkunft zählt in der ` +
  `Einschätzung schwer, im Bogen bewusst wenig. ` +
  `Ein Sternchen hinter der Einstufung, etwa 85 · A *, heißt: Pflichtfragen blieben offen. ` +
  `Der Buchstabe hinter dem Trennstrich sagt, aus welchem Bogen der Score stammt. K steht für ` +
  `den Kennenlernbogen, V für den früheren Vorabbogen, ein Fragezeichen dafür, dass sich das ` +
  `aus den Antworten nicht mehr ablesen lässt. Der Kennenlernbogen ist der neuere und ` +
  `ausführlichere, seine Einschätzung trägt weiter.`;

/** Das kompakte Ampel-Badge "82 · A". Ohne Tooltip, damit es überall einsetzbar ist. */
export function VorabScoreBadge({ score, className = "" }: { score: VorabScore; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 bg-background text-[10px] font-semibold whitespace-nowrap ${AMPEL_TEXT[score.einstufung]} ${className}`}
      title={`${VORAB_EINSTUFUNG_LABELS[score.einstufung]}: ${score.begruendung}\n${HERKUNFT_TITEL[score.herkunft]}. ${HERKUNFT_SATZ[score.herkunft]}`}
      data-testid="vorab-score-badge"
      data-einstufung={score.einstufung}
      data-herkunft={score.herkunft}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${AMPEL_PUNKT[score.einstufung]}`}
        aria-hidden="true"
        data-testid="vorab-score-ampel"
      />
      {score.punkte} · {score.einstufung}{score.unvollstaendig ? " *" : ""}
      <HerkunftKuerzel herkunft={score.herkunft} />
    </Badge>
  );
}

/**
 * Der grüne Punkt für einen passenden Hintergrund, dort wo sonst der Strich steht.
 *
 * Nur ein Punkt, ausdrücklich keine Zahl und keine Bewertung: Er sagt, dass in
 * den Antworten aus der Meta-Anzeige Immobilien oder Finanzdienstleistung
 * stehen, und damit, wen die HR-Managerin zuerst anrufen sollte. Woraus er
 * sich ergibt, steht im Tooltip, sonst müsste man dafür die Akte öffnen.
 *
 * `stopPropagation` ist wie beim `KennenlernMailVermerk` keine Feinheit: Die
 * ganze Tabellenzeile ist klickbar und öffnet die Akte. Ohne den Stopp wäre
 * der Punkt ein Knopf, der etwas anderes tut, als er verspricht.
 */
export function MetaScoreBadge({ score }: { score: MetaScore }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Vorabeinschätzung aus den Bewerbungsfragen: ${score.wert} von 100, Stufe ${score.stufe}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center align-middle"
          data-testid="meta-score-badge"
        >
          {/*
            Gedämpft und mit Tilde. Die Tilde sagt „geschätzt", die Farbe sagt
            „belegt"; der richtige Score daneben steht in Farbe. Ohne diesen
            Unterschied stünden zwei Zahlen derselben Skala nebeneinander, die
            Verschiedenes messen.
          */}
          <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            ~{score.wert} · {score.stufe}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs leading-snug" style={{ maxWidth: 320 }}>
        <p className="font-semibold">Vorabeinschätzung aus den Bewerbungsfragen</p>
        <p className="mt-0.5 text-muted-foreground">
          Noch kein Kennenlernbogen. Diese Zahl kommt aus den Antworten der Anzeige und sagt nur,
          wen man zuerst anrufen sollte. Sobald der Bogen da ist, steht hier der richtige Score,
          und der kann deutlich anders ausfallen.
        </p>
        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
          {score.posten.map((p) => (
            <li key={p.frage} className="flex justify-between gap-3">
              <span>
                {p.frage}: <span className="font-medium text-foreground">{p.antwort}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {p.punkte}/{p.moeglich}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Die Zelle in der Bewerberliste: Badge mit Begründung im Tooltip, sonst ein Strich.
 *
 * Ohne Score steht dort die Vorabeinschätzung aus den Bewerbungsfragen, sofern
 * der Bewerber sie beantwortet hat. Der Bogen-Score schlägt sie und nicht
 * umgekehrt: Wer den Bogen ausgefüllt hat, ist damit genauer beschrieben, als
 * vier Antworten aus einer Anzeige es je könnten.
 */
export function VorabScoreZelle({
  score,
  metaScore,
}: {
  score: VorabScore | null | undefined;
  /** Die Einschätzung aus den Bewerbungsfragen, falls es sie gibt. */
  metaScore?: MetaScore | null;
}) {
  if (!score) {
    if (metaScore) return <MetaScoreBadge score={metaScore} />;
    return <span className="text-xs text-muted-foreground" data-testid="vorab-score-leer">–</span>;
  }
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span className="inline-flex"><VorabScoreBadge score={score} /></span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs leading-snug" style={{ maxWidth: 300 }}>
        <p className="font-semibold">{VORAB_EINSTUFUNG_LABELS[score.einstufung]}</p>
        <p className="text-muted-foreground">{score.begruendung}</p>
        {/*
          Die Herkunft steht hier ausgeschrieben, damit der Buchstabe im Badge
          niemanden raten lässt. Sie entscheidet mit, wie weit die Zahl trägt.
        */}
        <p className="mt-1.5 border-t border-border pt-1.5" data-testid="vorab-score-herkunft-tooltip">
          <span className="font-semibold">{HERKUNFT_TITEL[score.herkunft]}</span>{" "}
          <span className="text-muted-foreground">{HERKUNFT_SATZ[score.herkunft]}</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Der Spaltenkopf "Vorab-Score" mit Erklärung. */
export function VorabScoreSpaltenkopf() {
  return (
    <span className="inline-flex items-center gap-1">
      Vorab-Score
      <InfoTooltip text={VORAB_SCORE_ERKLAERUNG} size={12} />
    </span>
  );
}

/**
 * Die Zeile in der Übersicht des Bewerbers, über der Assessment-Kurzinfo:
 * Badge, Einstufung und Begründung stehen sichtbar da, ohne Mausbewegung.
 * Ohne Fragebogen erscheint die Zeile nicht, das sagt dort schon der Kasten
 * "Vorab-Formular" ganz oben.
 */
export function VorabScoreZeile({ score }: { score: VorabScore }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="vorab-score-zeile">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Vorab-Score</span>
      <VorabScoreBadge score={score} />
      <Badge variant="outline" className="text-[10px]">{VORAB_EINSTUFUNG_LABELS[score.einstufung]}</Badge>
      <span className="text-[11px] text-muted-foreground">{score.begruendung}</span>
      <InfoTooltip text={VORAB_SCORE_ERKLAERUNG} size={12} />
    </div>
  );
}

/**
 * Woran es vor allem lag, aus der Rechnung abgelesen.
 *
 * Bewusst nicht danebengeschrieben: Beschriftung und Wert getrennt zu pflegen
 * ist genau der Fehler, der in dieser Woche schon einmal dazu geführt hat,
 * dass auf einer Ergebnisseite die Ersparnis unter dem Namen des Aufwands
 * stand. Beide Sätze entstehen deshalb aus `score.posten`.
 *
 * „Stärkster Posten" ist der mit den meisten erreichten Punkten, bei
 * Gleichstand der, der seinen Rahmen am besten ausgeschöpft hat. „Grösster
 * Abzug" ist der mit dem grössten Abstand zwischen erreicht und möglich. Gibt
 * es keinen Abzug, wird auch keiner behauptet.
 */
export function vorabSchwerpunkte(score: VorabScore): { stark: VorabPosten | null; schwach: VorabPosten | null } {
  let stark: VorabPosten | null = null;
  let schwach: VorabPosten | null = null;
  for (const p of score.posten) {
    if (
      !stark ||
      p.punkte > stark.punkte ||
      (p.punkte === stark.punkte && p.punkte / p.maxPunkte > stark.punkte / stark.maxPunkte)
    ) {
      stark = p;
    }
    const abzug = p.maxPunkte - p.punkte;
    if (abzug > 0 && (!schwach || abzug > schwach.maxPunkte - schwach.punkte)) schwach = p;
  }
  return { stark, schwach };
}

/**
 * Der Vorab-Score als kleines Abzeichen, mit der Rechnung dahinter.
 *
 * ## Warum ein Abzeichen und keine Karte
 *
 * Am 17.09.2026 stand hier kurz eine grosse Karte. Christian hat sie am selben
 * Tag zurückgenommen: Gemeint war der Abzeichenstil des Kundenprofils, also
 * das kleine `Badge` mit sehr kleiner Schrift und knappem Innenabstand, wie es
 * dort in `KundenprofilKennzahlen` überall steht.
 *
 * ## Warum ein Fenster und kein Tooltip
 *
 * Die Herleitung darf dabei nicht verloren gehen, sie war Christians erster
 * Wunsch. In ein Abzeichen passt sie nicht, also steckt sie hinter einem Klick.
 * Bewusst kein Tooltip beim Darüberfahren: Auf dem Telefon gibt es kein
 * Darüberfahren, und die Aufschlüsselung sind je nach Bogen zehn bis fünfzehn
 * Zeilen, für die ein Tooltip ohnehin zu klein ist. Ein `Popover` öffnet mit
 * dem Finger genauso wie mit der Maus und schliesst mit einem Tipp daneben
 * oder mit Escape.
 *
 * Gerechnet wird nichts davon hier. Alle Zahlen kommen aus `score.posten`,
 * derselben Quelle, aus der auch die Zahl im Abzeichen entsteht.
 */
export function VorabScoreAbzeichen({ score }: { score: VorabScore }) {
  const { stark, schwach } = vorabSchwerpunkte(score);
  const [offen, setOffen] = useState(false);

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Vorab-Score ${score.punkte} von 100, Einstufung ${score.einstufung}. Öffnet die Rechnung dahinter.`}
          aria-expanded={offen}
          data-testid="vorab-score-abzeichen"
        >
          <VorabScoreBadge score={score} />
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${offen ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(320px,calc(100vw-32px))] p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vorab-Score</p>
        <p className="text-sm font-semibold">
          {score.punkte} von 100 · {VORAB_EINSTUFUNG_LABELS[score.einstufung]}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {score.rohPunkte} von {score.maxPunkte} erreichbaren Punkten aus {score.posten.length}{" "}
          {score.posten.length === 1 ? "bewerteten Angabe" : "bewerteten Angaben"}.{" "}
          {HERKUNFT_TITEL[score.herkunft]}.
          {score.unvollstaendig && ` Unvollständig, ${score.beantwortet} von ${score.sichtbar} Pflichtfragen beantwortet.`}
        </p>

        {/* Woran es vor allem lag, beides aus der Rechnung abgelesen. */}
        <dl className="mt-2 grid gap-1 border-t pt-2 text-[11px]">
          {stark && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Am meisten gebracht:</dt>
              <dd className="font-medium">
                {stark.label} ({stark.antwort}), {stark.punkte} von {stark.maxPunkte}
              </dd>
            </div>
          )}
          {schwach ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Grösster Abzug:</dt>
              <dd className="font-medium">
                {schwach.label} ({schwach.antwort}), {schwach.punkte} von {schwach.maxPunkte}
              </dd>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Abzüge:</dt>
              <dd className="font-medium">keine, jede bewertete Angabe brachte die volle Punktzahl</dd>
            </div>
          )}
        </dl>

        <div className="mt-2 max-h-[40vh] overflow-y-auto border-t pt-2">
          <VorabScoreAufschluesselung score={score} />
        </div>

        <p className="mt-2 border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
          {VORAB_SCORE_ERKLAERUNG}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Die Aufschlüsselung: woraus sich die Zahl ergibt, Zeile für Zeile.
 *
 * Die HR-Managerin wählt nach diesem Score aus, wen sie zuerst einlädt. Eine
 * Zahl allein trägt diese Entscheidung nicht, sie muss sehen können, welche
 * Angabe wie viel beigetragen hat. Deshalb steht hier jedes bewertete Merkmal
 * mit der Antwort des Bewerbers, seinen Punkten und dem, was dort erreichbar
 * war. Der Grund, warum ein Merkmal zählt, hängt am Titel der Zeile.
 *
 * Fragen, die dieser Bogen gar nicht gestellt hat, fehlen hier bewusst: Sie
 * gehen weder in die Punkte noch in die Höchstzahl ein.
 */
export function VorabScoreAufschluesselung({ score }: { score: VorabScore }) {
  return (
    <div className="space-y-2" data-testid="vorab-score-aufschluesselung">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Woraus sich die {score.punkte} ergeben
        </span>
        <span className="text-[11px] text-muted-foreground">
          {score.rohPunkte} von {score.maxPunkte} erreichbaren Punkten
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px]">
        {score.posten.map((p) => (
          <div key={p.key} className="contents">
            <dt className="min-w-0 truncate" title={p.warum}>
              <span className="text-muted-foreground">{p.label}: </span>
              <span className="font-medium">{p.antwort}</span>
            </dt>
            <dd
              className={`whitespace-nowrap tabular-nums ${
                p.punkte >= p.maxPunkte * 0.7
                  ? "text-emerald-700"
                  : p.punkte <= p.maxPunkte * 0.34
                    ? "text-red-600"
                    : "text-muted-foreground"
              }`}
            >
              {p.punkte} / {p.maxPunkte}
            </dd>
          </div>
        ))}
      </dl>
      {score.luecken.length > 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid="vorab-score-luecken">
          Ohne Antwort und deshalb nicht gewertet: {score.luecken.join(", ")}.
        </p>
      )}
    </div>
  );
}
