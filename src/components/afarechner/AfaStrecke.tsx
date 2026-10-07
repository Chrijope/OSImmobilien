/**
 * Die Strecke des AfA-Rechners: eine Seite, mehrere Ansichten.
 *
 * Kein Seitenwechsel, nur ein Umschalten. Oben der Fortschrittsbalken mit
 * gleich breiten Abschnitten, eine Frage je Ansicht. Nach der letzten Frage
 * steht das vollstaendige Ergebnis.
 *
 * Gerechnet wird ausschliesslich in `afaRechnung.ts`, uebersetzt in
 * `afaStrecke.ts`. Diese Datei fuehrt nur Regie. Das Vorbild ist
 * `steuerrechner/SteuerRechnerStrecke.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { berechneAfa, type AfaRechnung } from "@/lib/afaRechnung";
import {
  schritte as alleSchritte,
  schrittBeantwortet,
  standardAntworten,
  zuEingaben,
  type AfaAntworten,
  type AfaSchrittId,
  type AfaVorbelegung,
} from "@/lib/afaStrecke";
import AfaBerechnungOverlay from "@/components/afarechner/AfaBerechnungOverlay";
import AfaErgebnis from "@/components/afarechner/AfaErgebnis";
import {
  GrundstueckFeld,
  GutachtenFeld,
  LageFeld,
  ModernisierungFeld,
  ObjektFeld,
  PreisFeld,
  SanierungFeld,
} from "@/components/afarechner/AfaEingabefelder";
import { Fortschritt, Frage, Weiter } from "@/components/afarechner/bausteine";

/**
 * Ueberschrift, Erklaerung und Knopfbeschriftung je Ansicht.
 *
 * `kurz` steht neben der Schrittzaehlung. Eine Position allein ("Schritt 3 von
 * 6") sagt nur, wie weit es noch ist. Mit dem Stichwort daneben sagt sie auch,
 * worum es gerade geht.
 */
const TEXTE: Record<AfaSchrittId, { titel: string; hinweis: string; knopf: string; kurz: string }> = {
  objekt: {
    kurz: "Objekt",
    titel: "Was für ein Objekt ist es?",
    hinweis:
      "Diese Antwort entscheidet, welche Fragen danach kommen und welcher gesetzliche Mindestsatz gilt. Ein Neubau ab 2023 wird mit drei Prozent abgeschrieben, ein Bestandsgebäude je nach Fertigstellung mit zwei oder zweieinhalb.",
    knopf: "Weiter",
  },
  preis: {
    kurz: "Kaufpreis",
    titel: "Was kostet das Objekt?",
    hinweis:
      "Der Kaufpreis ohne Nebenkosten, so wie er im Kaufvertrag steht. Wer nur den Quadratmeterpreis kennt, trägt die Wohnfläche ein und rechnet ihn darüber hoch.",
    knopf: "Weiter",
  },
  lage: {
    kurz: "Lage",
    titel: "Wo liegt das Objekt?",
    hinweis:
      "Das Bundesland bestimmt die Grunderwerbsteuer und damit die Kaufnebenkosten. Der auf das Gebäude entfallende Anteil dieser Nebenkosten wird mit abgeschrieben, er gehört also in die Bemessungsgrundlage.",
    knopf: "Weiter",
  },
  grundstueck: {
    kurz: "Grundstück",
    titel: "Wie viel vom Kaufpreis entfällt auf das Grundstück?",
    hinweis:
      "Der Wert, an dem die ganze Rechnung hängt. Boden nutzt sich nicht ab und wird deshalb nicht abgeschrieben. Ein zu niedriger Ansatz vergrößert den Gebäudeanteil und damit die ausgewiesene Abschreibung.",
    knopf: "Weiter",
  },
  sanierung: {
    kurz: "Sanierung",
    titel: "Wurde saniert?",
    hinweis:
      "Eine Kernsanierung setzt das Sanierungsjahr an die Stelle des Baujahrs und verlängert damit die Restnutzungsdauer. Der Erhaltungsaufwand ist etwas anderes: Er ist sofort absetzbar, solange er unter 15 Prozent der Gebäude-Anschaffungskosten bleibt.",
    knopf: "Weiter",
  },
  modernisierung: {
    kurz: "Modernisierung",
    titel: "Was wurde am Gebäude modernisiert?",
    hinweis:
      "Diese Frage entscheidet über die Restnutzungsdauer und damit unmittelbar über den AfA-Satz. Die acht Elemente stehen so in der Anlage 2 ImmoWertV. Je näher eine Maßnahme an der Gegenwart liegt, desto mehr Punkte bringt sie.",
    knopf: "Weiter",
  },
  gutachten: {
    kurz: "Gutachten",
    titel: "Gibt es ein Gutachten zur Restnutzungsdauer?",
    hinweis:
      "Wer ein Gutachten hat, trägt dessen Werte ein, dann entfällt die Modellrechnung. Wer keines hat, lässt den Schalter aus.",
    knopf: "Abschreibung berechnen",
  },
};

type Ansicht = "fragen" | "rechnen" | "ergebnis";

interface Props {
  /** Vorbelegung aus einem Objekt, etwa über objektId in der Adresse. */
  vorbelegung?: AfaVorbelegung;
  /** Wird bei jeder neuen Rechnung gemeldet, etwa zum Speichern am Objekt. */
  onErgebnis?: (rechnung: AfaRechnung, antworten: AfaAntworten) => void;
  /** Wechselt der Schlüssel, beginnt die Strecke von vorn. */
  neustartSchluessel?: number;
}

export default function AfaStrecke({ vorbelegung, onErgebnis, neustartSchluessel = 0 }: Props) {
  const [antworten, setAntworten] = useState<AfaAntworten>(() => standardAntworten(vorbelegung));
  const [index, setIndex] = useState(0);
  const [ansicht, setAnsicht] = useState<Ansicht>("fragen");
  const fokusRef = useRef<HTMLDivElement>(null);
  const ersteAnsicht = useRef(true);

  const schritte = useMemo(() => alleSchritte(antworten), [antworten]);
  const aktuell = schritte[Math.min(index, schritte.length - 1)];
  const rechnung = useMemo(() => berechneAfa(zuEingaben(antworten)), [antworten]);

  // Der Aufrufer bekommt jede fertige Rechnung, aber erst wenn das Ergebnis
  // auch sichtbar ist. Waehrend der Fragen waere die Zahl noch unvollstaendig.
  useEffect(() => {
    if (ansicht !== "ergebnis") return;
    onErgebnis?.(rechnung, antworten);
  }, [ansicht, rechnung, antworten, onErgebnis]);

  const neuBeginnen = useCallback(() => {
    setAntworten(standardAntworten(vorbelegung));
    setIndex(0);
    setAnsicht("fragen");
  }, [vorbelegung]);

  // Ein Wechsel des Schluessels setzt die Strecke zurueck. Das ist der Weg, den
  // die Seite oben fuer ihren Knopf "Zurücksetzen" nutzt.
  const ersterSchluessel = useRef(neustartSchluessel);
  useEffect(() => {
    if (neustartSchluessel === ersterSchluessel.current) return;
    ersterSchluessel.current = neustartSchluessel;
    neuBeginnen();
  }, [neustartSchluessel, neuBeginnen]);

  const aendern = useCallback((teil: Partial<AfaAntworten>) => {
    setAntworten((alt) => ({ ...alt, ...teil }));
  }, []);

  const weiter = () => {
    if (index + 1 < schritte.length) {
      setIndex(index + 1);
      return;
    }
    setAnsicht("rechnen");
  };

  const zurueck = () => {
    if (index === 0) return;
    setIndex(index - 1);
  };

  useEffect(() => {
    if (ersteAnsicht.current) {
      ersteAnsicht.current = false;
      return;
    }
    fokusRef.current?.focus({ preventScroll: true });
  }, [index, ansicht]);

  if (ansicht === "rechnen") {
    return <AfaBerechnungOverlay onFertig={() => setAnsicht("ergebnis")} />;
  }

  if (ansicht === "ergebnis") {
    return (
      <div ref={fokusRef} tabIndex={-1} className="outline-none">
        <AfaErgebnis antworten={antworten} aendern={aendern} rechnung={rechnung} onNeuBeginnen={neuBeginnen} />
      </div>
    );
  }

  const text = TEXTE[aktuell];
  const feld = { antworten, aendern };

  return (
    <div className="mx-auto w-full max-w-3xl" ref={fokusRef} tabIndex={-1}>
      <Fortschritt schritt={index + 1} gesamt={schritte.length} label={text.kurz} />

      {/*
        Der Schluessel ist die Schritt-Kennung, nicht die Position. React wirft
        damit die alte Karte weg und setzt eine neue, statt dieselbe Karte mit
        neuem Text weiterzuverwenden. Ohne das wuerde der Wechsel springen.
      */}
      <Frage key={aktuell} titel={text.titel} hinweis={text.hinweis}>
        {aktuell === "objekt" && <ObjektFeld {...feld} />}
        {aktuell === "preis" && <PreisFeld {...feld} />}
        {aktuell === "lage" && <LageFeld {...feld} />}
        {aktuell === "grundstueck" && <GrundstueckFeld {...feld} />}
        {aktuell === "sanierung" && <SanierungFeld {...feld} />}
        {aktuell === "modernisierung" && <ModernisierungFeld {...feld} rechnung={rechnung} />}
        {aktuell === "gutachten" && <GutachtenFeld {...feld} />}

        <Weiter disabled={!schrittBeantwortet(aktuell, antworten)} onClick={weiter}>
          {text.knopf}
        </Weiter>
      </Frage>

      {index > 0 && (
        // Mindestens 44 Pixel hoch, sonst ist der Rueckweg auf dem Handy mit dem
        // Daumen kaum zu treffen.
        <button
          type="button"
          onClick={zurueck}
          className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Eine Frage zurück
        </button>
      )}
    </div>
  );
}
