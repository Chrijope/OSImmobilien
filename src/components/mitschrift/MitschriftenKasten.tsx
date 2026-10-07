/**
 * Kaestchen „Mitschriften" in der Kundenakte, direkt neben dem
 * Erstgespraechs-Skript.
 *
 * Absichtlich dieselbe Machart wie das Kaestchen daneben: eine `Card` mit
 * `<details>` und `<summary>`, eingeklappt eine Kurzfassung, aufgeklappt der
 * volle Text. So fuegt es sich ein, statt danebenzustehen.
 *
 * Die Mitschriften kommen nicht aus dem Zwischenspeicher, sondern werden beim
 * ersten Aufklappen geholt. Der volle Text eines 45-Minuten-Gespraechs hat
 * nichts im Arbeitsspeicher jeder Seite verloren.
 */

import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import { formatiereZeit } from "@/lib/mitschrift";
import { baueMitschriftKurzfassung } from "@/lib/mitschriftZusammenfassung";
import { ladeMitschriften, ladeMitschriftenZuRaeumen, type MitschriftEintrag } from "@/lib/mitschriftStore";

interface Props {
  /** Kontakt, dessen Mitschriften gezeigt werden. */
  kontaktId?: string;
  /**
   * Investment, auf das eingeschraenkt wird. Ohne Angabe erscheinen alle
   * Mitschriften des Kontakts. Aeltere Mitschriften haben kein Investment
   * hinterlegt, die bleiben deshalb immer sichtbar.
   */
  investmentId?: string;
  /**
   * Der zweite Weg: ueber die Videoraeume statt ueber den Kontakt. Fuer alles,
   * was kein Kontakt ist, derzeit das Bewerbergespraech. Ist er gesetzt, gilt
   * er, und `kontaktId` bleibt unbeachtet.
   *
   * Bewusst dieselbe Komponente und kein zweiter Kasten daneben: Datum je
   * Mitschrift, die Auswahl bei mehreren Gespraechen und der Deckel gegen
   * lange Texte stehen hier schon, und sie sollen an beiden Orten gleich
   * aussehen.
   */
  raumIds?: string[];
  /**
   * Satz statt nichts, wenn es keine Mitschrift gibt. Ohne ihn verschwindet
   * der Kasten lautlos, was in der Kundenakte richtig ist: Dort steht er in
   * einer langen Seite voller Kaesten. Im Bewerberprofil dagegen wartet
   * jemand auf die Mitschrift eines bestimmten Gespraechs und soll erfahren,
   * warum keine da ist.
   */
  leerHinweis?: string;
  /**
   * Im Investment der Kundenakte `false`: Dort steht jeder Kasten immer offen
   * (Christian, 29.09.2026). Im Bewerberprofil bleibt er klappbar.
   */
  einklappbar?: boolean;
}

function datumText(eintrag: MitschriftEintrag): string {
  const roh = eintrag.beendetAt || eintrag.begonnenAt || eintrag.createdAt;
  if (!roh) return "";
  try {
    return new Date(roh).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MitschriftenKasten({ kontaktId, investmentId, raumIds, leerHinweis, einklappbar = true }: Props) {
  const [offenGewaehlt, setOffen] = useState(false);
  const offen = !einklappbar || offenGewaehlt;
  const [laedt, setLaedt] = useState(true);
  const [eintraege, setEintraege] = useState<MitschriftEintrag[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  // Ein neues Feld bei jedem Rendern waere eine neue Abfrage bei jedem
  // Rendern. Der Schluessel haelt die Liste stabil.
  const raumSchluessel = (raumIds ?? []).join(",");

  const holen = useCallback(() => {
    let abgebrochen = false;
    setLaedt(true);
    const quelle = raumSchluessel
      ? ladeMitschriftenZuRaeumen(raumSchluessel.split(","))
      : ladeMitschriften(kontaktId ?? "");
    void quelle.then((liste) => {
      if (abgebrochen) return;
      const gefiltert = investmentId
        ? liste.filter((e) => !e.investmentId || e.investmentId === investmentId)
        : liste;
      setEintraege(gefiltert);
      setGewaehlt((bisher) => bisher ?? gefiltert[0]?.id ?? null);
      setLaedt(false);
    });
    return () => { abgebrochen = true; };
  }, [kontaktId, investmentId, raumSchluessel]);

  useEffect(() => holen(), [holen]);

  // Ohne Mitschriften und ohne laufende Abfrage gibt es nichts zu zeigen.
  // Ein leeres Kaestchen waere nur eine Zeile Rauschen in einer ohnehin
  // langen Seite. Wer einen `leerHinweis` mitgibt, bekommt stattdessen den
  // Satz, damit niemand vor einem stummen Loch steht.
  if (!laedt && eintraege.length === 0) {
    if (!leerHinweis) return null;
    return (
      <Card className="p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {leerHinweis}
        </p>
      </Card>
    );
  }

  // Ohne Klappen dieselbe Karte, nur als schlichter Block statt details/summary.
  const Huelle = einklappbar ? "details" : "div";
  const Kopf = einklappbar ? "summary" : "div";

  const aktuell = eintraege.find((e) => e.id === gewaehlt) || eintraege[0] || null;
  const kurz = aktuell
    ? baueMitschriftKurzfassung(aktuell.zeilen, { dauerSekunden: aktuell.dauerSekunden })
    : null;

  return (
    <Card className="p-0 overflow-hidden">
      <Huelle
        className="group"
        {...(einklappbar
          ? { open: offen, onToggle: (e: SyntheticEvent<HTMLElement>) => setOffen((e.currentTarget as HTMLDetailsElement).open) }
          : {})}
      >
        {/* flex-wrap plus Mindestbreite: siehe Erstgespraechs-Skript in
            KundenDetail, gleiche Kopfzeile, gleicher Mobil-Fix. */}
        <Kopf className={`flex flex-wrap items-center gap-2 p-4 list-none border-b border-border ${einklappbar ? "cursor-pointer hover:bg-muted/30" : ""}`}>
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0 basis-48">
            <h3 className="font-bold">Mitschriften</h3>
            {!offen && laedt && (
              <p className="text-xs font-normal text-muted-foreground mt-0.5">Wird geladen …</p>
            )}
            {!offen && !laedt && kurz && (
              <p
                className="text-xs font-normal text-muted-foreground mt-0.5 line-clamp-2"
                title={[datumText(aktuell!), kurz.kennzahlen, kurz.text].filter(Boolean).join(" · ")}
              >
                <span className="text-foreground/70">
                  {[datumText(aktuell!), kurz.kennzahlen].filter(Boolean).join(" · ")}
                </span>
                {kurz.text ? " · " : ""}
                {kurz.text}
              </p>
            )}
          </div>
          {eintraege.length > 1 && (
            <span className="text-xs text-muted-foreground mr-2">
              {eintraege.length} Gespräche
            </span>
          )}
          {einklappbar && (
            <>
              <span className="hidden sm:inline text-xs text-muted-foreground mr-2">Einklappen / Ausklappen</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </>
          )}
        </Kopf>

        <div className="p-4 space-y-3">
          {laedt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Mitschriften werden geladen …
            </div>
          )}

          {!laedt && eintraege.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {eintraege.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setGewaehlt(e.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    e.id === aktuell?.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {datumText(e) || "Ohne Datum"}
                </button>
              ))}
            </div>
          )}

          {!laedt && aktuell && (
            <>
              <p className="text-xs text-muted-foreground">
                {[datumText(aktuell), kurz?.kennzahlen, aktuell.modell ? `Modell: ${aktuell.modell}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {aktuell.zeilen.length > 0 ? (
                <div className="max-h-[28rem] overflow-y-auto rounded border border-border bg-muted/20 divide-y divide-border/60">
                  {aktuell.zeilen.map((z, i) => (
                    <div key={`${z.zeitpunkt}-${i}`} className="flex gap-3 px-3 py-2 text-sm">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5 w-12">
                        {formatiereZeit(z.zeitpunkt)}
                      </span>
                      <span className="font-semibold shrink-0 w-24 truncate" title={z.sprecher}>
                        {z.sprecher}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap break-words">{z.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-sm whitespace-pre-wrap break-words max-h-[28rem] overflow-y-auto rounded border border-border bg-muted/20 p-3">
                  {aktuell.volltext}
                </pre>
              )}

              <p className="text-xs text-muted-foreground">
                Die Erkennung lief auf dem Gerät des Beraters. Es wurde nur Text gespeichert, kein Ton.
              </p>
            </>
          )}
        </div>
      </Huelle>
    </Card>
  );
}
