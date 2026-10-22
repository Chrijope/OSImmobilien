import { useState, type DragEvent } from "react";
import { FileSearch, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SectionCard, SectionCardContent, SectionCardDescription, SectionCardHeader, SectionCardTitle,
} from "@/components/ui/section-card";
import { cn } from "@/lib/utils";
import {
  AuslesFehler, anfrageZusammenstellen, dateiErlaubt, herkunftText, unterlagenAuslesen,
  type AuslesFeld, type Vorschlag,
} from "@/lib/ankaufstoolUnterlagen";

interface Props {
  /** Beschriftung je Feld, wie im Tool. */
  labels: Record<AuslesFeld, string>;
  /** Wert als Text, wie er im Tool steht (für „bisher“). */
  anzeige: (feld: AuslesFeld, wert: number | string) => string;
  aktuell: (feld: AuslesFeld) => number | string;
  /** Felder, die in dieser Sitzung von Hand geändert wurden: Vorschläge dafür sind nicht vorausgewählt. */
  vonHand: ReadonlySet<AuslesFeld>;
  onUebernehmen: (vorschlaege: Vorschlag[]) => void;
}

/*
 * Unterlagen per Ziehen ablegen und auslesen lassen (22.10.2026). Die Dateien
 * bleiben nur im Browser, solange die Seite offen ist; gespeichert wird nichts.
 * Übernommen wird nur, was angehakt ist, damit nichts still überschrieben wird.
 */
export function UnterlagenAuslesen({ labels, anzeige, aktuell, vonHand, onUebernehmen }: Props) {
  const [dateien, setDateien] = useState<File[]>([]);
  const [zieht, setZieht] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState<Set<AuslesFeld>>(new Set());
  /** Dateiname je Unterlagennummer. Bleibt im Browser, die KI sieht nur „Unterlage n“. */
  const [namen, setNamen] = useState<string[]>([]);

  const hinzufuegen = (neu: File[]) => {
    const erlaubt = neu.filter(dateiErlaubt);
    const abgelehnt = neu.length - erlaubt.length;
    setFehler(abgelehnt ? `${abgelehnt} Datei(en) übersprungen: nur PDF, JPG, PNG oder WebP.` : null);
    // Gleiche Datei nicht doppelt: Name und Größe genügen hier.
    setDateien((alt) => [...alt, ...erlaubt.filter((d) => !alt.some((a) => a.name === d.name && a.size === d.size))]);
  };

  const ablegen = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setZieht(false);
    hinzufuegen(Array.from(event.dataTransfer.files));
  };

  const auslesen = async () => {
    setLaeuft(true);
    setFehler(null);
    setVorschlaege([]);
    setHinweise([]);
    try {
      const { dokumente, namen: dateinamen, uebersprungen } = await anfrageZusammenstellen(dateien);
      setNamen(dateinamen);
      const ergebnis = await unterlagenAuslesen(dokumente);
      setVorschlaege(ergebnis.vorschlaege);
      setHinweise([...uebersprungen, ...ergebnis.hinweise]);
      setAuswahl(new Set(ergebnis.vorschlaege.filter((v) => !vonHand.has(v.feld)).map((v) => v.feld)));
      if (ergebnis.vorschlaege.length === 0) setFehler("In den Unterlagen wurden keine passenden Werte gefunden.");
    } catch (err) {
      setFehler(err instanceof AuslesFehler ? err.message : "Die Unterlagen konnten nicht ausgelesen werden.");
      if (!(err instanceof AuslesFehler)) console.error(err);
    } finally {
      setLaeuft(false);
    }
  };

  const uebernehmen = () => {
    onUebernehmen(vorschlaege.filter((v) => auswahl.has(v.feld)));
    setVorschlaege([]);
    setHinweise([]);
  };

  const umschalten = (feld: AuslesFeld) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(feld)) neu.delete(feld); else neu.add(feld);
      return neu;
    });

  return (
    <SectionCard data-testid="ankauf-unterlagen">
      <SectionCardHeader>
        <SectionCardTitle>Unterlagen auslesen</SectionCardTitle>
        <SectionCardDescription>
          Exposé, Energieausweis, Flächenberechnung, Grundrisse, Mieterliste oder Mietverträge hineinziehen. Die KI überträgt
          Flächen, Einheiten, Mieten, Kaufpreis, Objektart, Baujahr, Energie und Leerstand in die Objektdaten. Namen und andere
          Personendaten werden überlesen, Dateinamen verlassen den Browser nicht, gespeichert wird nichts. Zustand, Lage und
          Makler bitte von Hand eintragen.
        </SectionCardDescription>
      </SectionCardHeader>
      <SectionCardContent className="space-y-4">
        {/* Ohne preventDefault am Überfahren öffnet der Browser die Datei selbst in einem neuen Tab. */}
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-sm transition-colors hover:bg-muted/40",
            zieht && "border-primary bg-primary/5",
          )}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setZieht(true);
          }}
          onDragLeave={(event) => {
            // Wechselt der Zeiger nur auf ein Kindelement, bleibt die Einfärbung stehen.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setZieht(false);
          }}
          onDrop={ablegen}
        >
          <input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              hinzufuegen(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <strong className="font-medium">{zieht ? "Jetzt loslassen" : "Unterlagen hierher ziehen oder klicken"}</strong>
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG oder WebP · Scans und Fotos höchstens 4 MB</span>
        </label>

        {dateien.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 text-sm">
            {dateien.map((d) => (
              <li key={`${d.name}-${d.size}`} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.max(1, Math.round(d.size / 1024))} KB</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${d.name} entfernen`}
                  onClick={() => setDateien((alt) => alt.filter((x) => x !== d))}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={auslesen} disabled={dateien.length === 0 || laeuft}>
            {laeuft ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSearch className="h-4 w-4 mr-1" />}
            {laeuft ? "Liest aus …" : "Werte auslesen"}
          </Button>
          {dateien.length > 0 && !laeuft && (
            <Button variant="outline" onClick={() => { setDateien([]); setVorschlaege([]); setHinweise([]); setFehler(null); }}>
              Liste leeren
            </Button>
          )}
        </div>

        {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}

        {vorschlaege.length > 0 && (
          <div className="space-y-3" data-testid="ankauf-vorschlaege">
            <p className="text-sm font-medium">Gefundene Werte: Angehaktes wird übernommen.</p>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60 text-sm">
              {vorschlaege.map((v) => {
                const bisher = anzeige(v.feld, aktuell(v.feld));
                const neu = anzeige(v.feld, v.wert);
                return (
                  <li key={v.feld} className="flex items-start gap-3 px-3 py-2">
                    <Checkbox
                      id={`vorschlag-${v.feld}`}
                      checked={auswahl.has(v.feld)}
                      onCheckedChange={() => umschalten(v.feld)}
                      className="mt-0.5"
                    />
                    <label htmlFor={`vorschlag-${v.feld}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-muted-foreground">{labels[v.feld]}</span>
                        <span className="font-medium tabular-nums">{neu}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {herkunftText(v.quelle)}
                        {(() => { const n = /Unterlage (\d+)\)/.exec(v.quelle)?.[1]; const datei = n ? namen[Number(n) - 1] : undefined; return datei ? ` · ${datei}` : ""; })()}
                        {v.sicherheit !== "hoch" && <span className="text-amber-700 dark:text-amber-400"> · Sicherheit {v.sicherheit}</span>}
                        {bisher && bisher !== neu && <> · bisher {bisher}{vonHand.has(v.feld) ? " (von Hand)" : ""}</>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={uebernehmen} disabled={auswahl.size === 0}>{auswahl.size} Werte übernehmen</Button>
              <Button variant="outline" onClick={() => setVorschlaege([])}>Verwerfen</Button>
            </div>
          </div>
        )}

        {hinweise.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            {hinweise.map((h) => <li key={h}>{h}</li>)}
          </ul>
        )}
      </SectionCardContent>
    </SectionCard>
  );
}
