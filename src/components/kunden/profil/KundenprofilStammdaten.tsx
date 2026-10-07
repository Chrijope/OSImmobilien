import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, List } from "lucide-react";

interface Props {
  name: string;
  /** Steht direkt hinter dem Namen, etwa das Kürzel „EN“ für die Kundensprache. */
  namenZusatz?: ReactNode;
  /** Die gepflegte Anrede des Kontakts, roh aus `kunde.anrede`. */
  anrede?: string | null;
  felder: { label: string; wert: ReactNode }[];
  /** Die Inaktivitätsampel, direkt unter dem Namen. */
  ampel?: ReactNode;
  /** Die runden Schnellaktionen, zwischen Ampel und Kontaktdaten. */
  aktionen?: ReactNode;
  portal?: ReactNode;
  verwaltung?: ReactNode;
  onWeitereFelder: () => void;
  onBearbeiten?: () => void;
}

/**
 * Welche Anrede vor dem Namen steht (Christians Wunsch vom 25.09.2026:
 * „Herr Max Mustermann“ in einer Zeile statt „Herr“ als eigene Zeile darunter).
 *
 * Vorangestellt werden nur „Herr“ und „Frau“, weil nur diese beiden vor einem
 * Namen einen Satz ergeben. Die Formulare bieten Herr, Frau und Divers an; der
 * CSV-Import übernimmt dagegen freien Text. Deshalb:
 * - „Herr“, „Herrn“ und „Frau“, gleich in welcher Schreibung, werden zu
 *   „Herr“ beziehungsweise „Frau“ („Herrn“ ist die Briefform aus Importen).
 * - „Divers“, „Keine Angabe“, „Firma“, ein leerer Wert und jeder andere freie
 *   Text ergeben nichts. „Divers Max Mustermann“ wäre keine Anrede, und bei
 *   Firmen und Gesellschaften gibt es kein Herr oder Frau.
 */
function anredeVorDemNamen(anrede: string | null | undefined): string | null {
  const wert = (anrede ?? "").trim().toLowerCase();
  if (wert === "herr" || wert === "herrn") return "Herr";
  if (wert === "frau") return "Frau";
  return null;
}

/**
 * Die kleine Abschnittsüberschrift der linken Spalte: Kontaktdaten,
 * Kundenportal, Empfehlungsprogramm. Christian wollte am 23.09.2026, dass
 * alle drei gleich aussehen. Deshalb gibt es sie nur hier, als Baustein.
 */
export function KundenprofilUeberschrift({ children }: { children: ReactNode }) {
  return <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{children}</h3>;
}

/**
 * Der Personenblock in der linken Spalte des Kundenprofils.
 *
 * Christian hat am 16.09.2026 entschieden, den Kopfbereich zu entlasten: Der
 * Name stand zweimal, oben groß im Seitenkopf und zwanzig Pixel darunter
 * noch einmal hier. Der hier bleibt, weil er am Datenblock klebt, wo man ihn
 * sucht. Das blaue Kästchen mit den Initialen ist weggefallen, es trug keine
 * Auskunft, die nicht schon im Namen daneben stand.
 *
 * Dafür sind Ampel und Schnellaktionen hierher gezogen: Status und Handlung
 * stehen jetzt bei der Person, nicht mehr quer über dem Seitenkopf.
 */
export function KundenprofilStammdaten({ name, namenZusatz, anrede, felder, ampel, aktionen, portal, verwaltung, onWeitereFelder, onBearbeiten }: Props) {
  const anredeText = anredeVorDemNamen(anrede);
  return (
    <Card className="kundenprofil-person">
      {/*
        Der Name ist am 16.09.2026 groesser geworden, auf Christians Wunsch.
        Seit der grosse Name im Seitenkopf weg ist, ist dieser hier der einzige
        und soll auch so aussehen. `break-words` bleibt: Ein langer Doppelname
        muss in der schmalen Spalte umbrechen duerfen, statt sie zu sprengen.
      */}
      {/*
        Die Anrede steht seit dem 25.09.2026 in der Zeile des Namens, eine
        Stufe leichter als der Name. Das geschützte Leerzeichen hält sie auf
        dem Handy am Vornamen fest, umbrechen darf erst der Name selbst.
        Abzeichen wie „EN“ bleiben hinter dem Namen.
      */}
      <div className="min-w-0 mb-3"><h2 className="text-2xl font-semibold leading-tight break-words">{anredeText && <span className="font-normal">{anredeText}{"\u00A0"}</span>}<span>{name}</span>{namenZusatz && <span className="ml-2 inline-block align-middle">{namenZusatz}</span>}</h2></div>
      {ampel && <div className="mb-4">{ampel}</div>}
      {aktionen && <div className="mb-5">{aktionen}</div>}
      <KundenprofilUeberschrift>Kontaktdaten</KundenprofilUeberschrift>
      <dl className="kundenprofil-felder">
        {felder.map(({ label, wert }) => <div key={label}><dt>{label}</dt><dd>{wert || <span className="text-muted-foreground">Nicht hinterlegt</span>}</dd></div>)}
      </dl>
      <div className="flex flex-wrap gap-2 mt-4">
        {onBearbeiten && <Button variant="outline" size="sm" className="flex-1" onClick={onBearbeiten}><Pencil className="h-3.5 w-3.5" />Bearbeiten</Button>}
        <Button variant="outline" size="sm" className="flex-1" onClick={onWeitereFelder}><List className="h-3.5 w-3.5" />Alle Stammdaten</Button>
      </div>
      {portal && <section className="border-t mt-4 pt-4"><KundenprofilUeberschrift>Kundenportal</KundenprofilUeberschrift><div className="mt-2">{portal}</div></section>}
      {verwaltung}
    </Card>
  );
}
