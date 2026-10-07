import { useMemo, useState } from "react";
import { CornerDownRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AkademieSzenarioAufgabe } from "@/lib/vertriebsakademieContent";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";

interface Props {
  aufgabe: AkademieSzenarioAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
}

/**
 * Verzweigter Fall: Szene, Wahl, Konsequenz, nächste Szene.
 *
 * Vollständig vorgeschrieben, kein Modell im Hintergrund. Jede Option zeigt auf
 * eine Folgeszene, Enden tragen ein Fazit. Als gelöst gilt ein Durchlauf, in
 * dem keine Wahl mit `bewertung: "schwach"` vorkommt. Ein tragfähiger Weg reicht
 * also, es gibt nicht nur einen richtigen Pfad.
 */
export function AkademieSzenario({ aufgabe, geloest, versuche, punkte, onFertig }: Props) {
  const szenenNachId = useMemo(
    () => Object.fromEntries(aufgabe.szenen.map((s) => [s.id, s])),
    [aufgabe.szenen],
  );

  const [aktuelleId, setAktuelleId] = useState(aufgabe.startSzene);
  const [verlauf, setVerlauf] = useState<
    { szeneId: string; wahl: string; konsequenz?: string; bewertung?: "gut" | "tragbar" | "schwach" }[]
  >([]);
  const [beendet, setBeendet] = useState(false);

  const szene = szenenNachId[aktuelleId];
  const schwacheWahl = verlauf.some((v) => v.bewertung === "schwach");

  function waehlen(optIndex: number) {
    if (!szene?.optionen) return;
    const opt = szene.optionen[optIndex];
    const neuerVerlauf = [
      ...verlauf,
      { szeneId: szene.id, wahl: opt.text, konsequenz: opt.konsequenz, bewertung: opt.bewertung },
    ];
    setVerlauf(neuerVerlauf);
    const naechste = opt.weiterZu ? szenenNachId[opt.weiterZu] : undefined;
    if (!naechste) {
      setBeendet(true);
      onFertig(!neuerVerlauf.some((v) => v.bewertung === "schwach"));
      return;
    }
    setAktuelleId(naechste.id);
    if (!naechste.optionen?.length) {
      setBeendet(true);
      onFertig(!neuerVerlauf.some((v) => v.bewertung === "schwach"));
    }
  }

  function neuStarten() {
    setAktuelleId(aufgabe.startSzene);
    setVerlauf([]);
    setBeendet(false);
  }

  if (!szene) return null;

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={aufgabe.hinweis ?? "Entscheide dich. Jede Wahl führt weiter."}
      typLabel="Fall"
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      onNeuStarten={verlauf.length > 0 ? neuStarten : undefined}
      aktion={
        beendet ? (
          <AufgabenRueckmeldung
            korrekt={!schwacheWahl}
            text={
              schwacheWahl
                ? "Ein Schritt auf deinem Weg kostet in der Praxis Vertrauen. Spiel den Fall noch einmal und wähle dort anders."
                : "Dein Weg trägt. Unten siehst du, was deine Entscheidungen ausgelöst haben."
            }
          />
        ) : undefined
      }
    >
      <div className="space-y-3">
        {verlauf.length > 0 && (
          <ol className="space-y-2">
            {verlauf.map((v, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                <div className="flex items-start gap-1.5">
                  <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{v.wahl}</span>
                </div>
                {v.konsequenz && (
                  <div
                    className={cn(
                      "ml-4.5",
                      v.bewertung === "schwach" && "text-rose-600",
                      v.bewertung === "gut" && "text-emerald-600",
                      (!v.bewertung || v.bewertung === "tragbar") && "text-muted-foreground",
                    )}
                  >
                    {v.konsequenz}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="rounded-lg border-l-2 border-primary/50 bg-primary/5 p-3 text-sm">
          {szene.text}
        </div>

        {szene.optionen?.length ? (
          <div className="grid gap-2">
            {szene.optionen.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => waehlen(i)}
                className="text-left text-sm rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                {opt.text}
              </button>
            ))}
          </div>
        ) : (
          szene.fazit && (
            <div className="rounded-lg border p-3 text-sm flex items-start gap-2">
              <Flag className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>{szene.fazit}</span>
            </div>
          )
        )}
      </div>
    </AufgabenRahmen>
  );
}
