/**
 * Auswahl eines Verlustgrunds aus dem festen Katalog.
 *
 * Zwei Schritte, damit die Liste nicht erschlägt, erst die Gruppe, dann die
 * konkrete Nennung. Die gewählte Nennung sagt anschließend selbst, ob und
 * wann der Kontakt wieder angesprochen werden darf.
 *
 * Achte Option ist "Sonstiges": Wenn keine Gruppe passt, wird der Grund als
 * kurzer Pflichttext eingetragen. Nach außen geht dann der Text selbst durch
 * `onChange`, genau wie beim Altbestand von vor der Katalog-Umstellung. Alle
 * Lesestellen (Anzeige, Statistik, Verloren-Liste) kommen damit über
 * `verlustGrundLabel()` und `verlustGruppeVon()` bereits zurecht.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, RotateCcw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  auswaehlbareGruppen,
  gruendeDerGruppe,
  istFreitextGrund,
  verlustGrundById,
  verlustGruppeById,
  type VerlustGruppeId,
} from "@/lib/verlustgruende";

interface Props {
  /** Aktuell gewählte Grund-ID, ein Sonstiges-Freitext oder leer. */
  wert: string;
  onChange: (grund: string) => void;
  /** Kompakte Darstellung für enge Dialoge. */
  dicht?: boolean;
}

export function VerlustGrundAuswahl({ wert, onChange, dicht }: Props) {
  // Die sieben Katalog-Gruppen plus "Sonstiges" als Freitext-Ausweg.
  const gruppen = useMemo(
    () => [...auswaehlbareGruppen(), verlustGruppeById("sonstiges")!],
    [],
  );
  const gewaehlt = verlustGrundById(wert);
  const [offeneGruppe, setOffeneGruppe] = useState<VerlustGruppeId | null>(
    gewaehlt ? gewaehlt.gruppe : istFreitextGrund(wert) ? "sonstiges" : null,
  );
  const [freitext, setFreitext] = useState(istFreitextGrund(wert) ? wert.trim() : "");

  if (!offeneGruppe) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Woran lag es? Zuerst die grobe Richtung wählen.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {gruppen.map((gr) => (
            <button
              key={gr.id}
              type="button"
              onClick={() => {
                setOffeneGruppe(gr.id);
                // Beim Wechsel auf Sonstiges zählt nur der eingetragene Text.
                // Ohne Text bleibt der Bestätigen-Knopf im Dialog gesperrt.
                if (gr.id === "sonstiges") onChange(freitext.trim());
              }}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors hover:border-primary hover:bg-accent/50",
                dicht && "p-2",
              )}
            >
              <div className="text-sm font-medium">{gr.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{gr.bedeutung}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (offeneGruppe === "sonstiges") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setOffeneGruppe(null)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
          <span className="text-sm font-medium">Sonstiges</span>
        </div>
        <Textarea
          value={freitext}
          onChange={(e) => {
            setFreitext(e.target.value);
            onChange(e.target.value.trim());
          }}
          placeholder="Eigenen Verlustgrund kurz eintragen"
          rows={2}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {freitext.trim()
            ? "Der Text wird als Grund gespeichert und in der Auswertung unter Sonstiges geführt."
            : "Pflichtfeld. Ohne Text lässt sich das Verloren-Setzen nicht bestätigen."}
        </p>
      </div>
    );
  }

  const aktiveGruppe = gruppen.find((g) => g.id === offeneGruppe)!;
  const gruende = gruendeDerGruppe(aktiveGruppe.id);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setOffeneGruppe(null)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
        </Button>
        <span className="text-sm font-medium">{aktiveGruppe.label}</span>
      </div>
      <div className="space-y-1.5">
        {gruende.map((g) => {
          const aktiv = g.id === wert;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange(g.id)}
              className={cn(
                "w-full text-left rounded-lg border p-2.5 transition-colors hover:border-primary hover:bg-accent/50",
                aktiv && "border-primary bg-accent",
              )}
            >
              <div className="text-sm">{g.label}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {g.wiederAnsprechbar ? (
                  <span className="flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" />
                    Wiedervorlage nach {g.wiedervorlageMonate} Monaten
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Keine Wiedervorlage
                  </span>
                )}
                <span>{g.verantwortung === "uns" ? "Bei uns beeinflussbar" : "Von außen bestimmt"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default VerlustGrundAuswahl;
