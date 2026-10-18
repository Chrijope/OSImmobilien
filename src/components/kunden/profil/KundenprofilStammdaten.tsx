import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KundenprofilFeld, feldBearbeitung, type FeldBearbeitung } from "./KundenprofilFeld";
import { KundenprofilAmpel, type AmpelStand } from "./KundenprofilAmpel";

export interface KundenprofilAbschnittDef {
  /** Unter diesem Schlüssel merkt sich das CRM je Nutzer, ob er offen ist. */
  schluessel: string;
  titel: string;
  /** Kurzer Hinweis, der auch eingeklappt dasteht, etwa „4 von 6 beantwortet“. */
  hinweis?: string;
  /** Die Ampel in der Kopfzeile, auch eingeklappt sichtbar. */
  ampel?: AmpelStand;
  inhalt: ReactNode;
}

export interface Namen { vorname: string; nachname: string }

interface Props {
  name: string;
  /** Steht direkt hinter dem Namen, etwa das Kürzel „EN“ für die Kundensprache. */
  namenZusatz?: ReactNode;
  /** Die gepflegte Anrede des Kontakts, roh aus `kunde.anrede`. */
  anrede?: string | null;
  /** Der Stift am Namen; ohne ihn ist der Name reine Anzeige. */
  namenBearbeitung?: Pick<FeldBearbeitung<Namen>, "start" | "speichern">;
  /** Die Inaktivitätsampel, direkt unter dem Namen. */
  ampel?: ReactNode;
  /** Der Lead-Score als Ring, unter der Ampel. */
  leadScore?: ReactNode;
  /** Die runden Schnellaktionen. */
  aktionen?: ReactNode;
  /** Kontaktdaten und persönliche Daten, immer offen. */
  kontakt?: ReactNode;
  /** Person 2 und die Abschnitte 6 bis 11, in dieser Reihenfolge, eingeklappt. */
  abschnitte?: KundenprofilAbschnittDef[];
  istOffen?: (schluessel: string) => boolean;
  onUmschalten?: (schluessel: string) => void;
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
 * Die kleine Abschnittsüberschrift der linken Spalte. Christian wollte am
 * 23.09.2026, dass alle gleich aussehen. Deshalb gibt es sie nur hier.
 */
export function KundenprofilUeberschrift({ children }: { children: ReactNode }) {
  return <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{children}</h3>;
}

/** Ein klappbarer Abschnitt; die Kopfzeile trägt auch eingeklappt Hinweis und Ampel. */
function KlappAbschnitt({ def, offen, onUmschalten }: { def: KundenprofilAbschnittDef; offen: boolean; onUmschalten: () => void }) {
  const inhaltId = `kundenprofil-abschnitt-${def.schluessel}`;
  return (
    <section className="kundenprofil-abschnitt" data-abschnitt={def.schluessel} data-offen={offen ? "true" : "false"}>
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        <button type="button" className="kundenprofil-abschnitt-kopf" aria-expanded={offen} aria-controls={inhaltId} onClick={onUmschalten}>
          <ChevronDown aria-hidden="true" className="kundenprofil-abschnitt-pfeil h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{def.titel}</span>
          {def.hinweis && <span className="shrink-0 normal-case tracking-normal font-normal text-[11px]">{def.hinweis}</span>}
          {def.ampel && <KundenprofilAmpel stand={def.ampel} className="shrink-0 normal-case tracking-normal" />}
        </button>
      </h3>
      {offen && <div id={inhaltId} className="mt-3">{def.inhalt}</div>}
    </section>
  );
}

/**
 * Die linke Spalte des Kundenprofils mit allen Stammdaten (Umbau vom
 * 18.10.2026, der Reiter „Stammdaten“ ist dafür entfallen).
 *
 * Offen stehen nur Name, Ampel, Lead-Score, Schnellaktionen und die
 * Kontaktdaten. Person 2 und die Abschnitte 6 bis 11 starten eingeklappt,
 * am Schreibtisch wie auf dem Handy; wer einen aufklappt, dem merkt das CRM
 * das je Nutzer (`useProfilAbschnitte`). Ohne Merker bleibt der Zustand in
 * dieser Ansicht, etwa in der Vorschau.
 */
export function KundenprofilStammdaten({ name, namenZusatz, anrede, namenBearbeitung, ampel, leadScore, aktionen, kontakt, abschnitte = [], istOffen, onUmschalten }: Props) {
  const anredeText = anredeVorDemNamen(anrede);
  const [eigeneOffen, setEigeneOffen] = useState<Record<string, boolean>>({});
  const offen = (s: string) => (istOffen ? istOffen(s) : !!eigeneOffen[s]);
  const umschalten = (s: string) => (onUmschalten ? onUmschalten(s) : setEigeneOffen((a) => ({ ...a, [s]: !a[s] })));

  /*
    Der Name ist der einzige im Profil und deshalb groß. `break-words` bleibt:
    Ein langer Doppelname muss in der schmalen Spalte umbrechen dürfen. Die
    Anrede steht seit dem 25.09.2026 in der Zeile des Namens, das geschützte
    Leerzeichen hält sie auf dem Handy am Vornamen fest.
  */
  const namenszeile = (
    <h2 className="text-2xl font-semibold leading-tight break-words">
      {anredeText && <span className="font-normal">{anredeText}{" "}</span>}
      <span>{name}</span>
      {namenZusatz && <span className="ml-2 inline-block align-middle">{namenZusatz}</span>}
    </h2>
  );

  return (
    <Card className="kundenprofil-person">
      <dl className="kundenprofil-namenzeile mb-3">
        <KundenprofilFeld
          label="Name"
          wert={namenszeile}
          bearbeitung={namenBearbeitung && feldBearbeitung<Namen>({
            ...namenBearbeitung,
            editor: (w, setze) => (
              <div className="space-y-2">
                <Input className="h-8" aria-label="Vorname" placeholder="Vorname" value={w.vorname} onChange={(e) => setze({ ...w, vorname: e.target.value })} />
                <Input className="h-8" aria-label="Nachname" placeholder="Nachname" value={w.nachname} onChange={(e) => setze({ ...w, nachname: e.target.value })} />
              </div>
            ),
          })}
        />
      </dl>
      {ampel && <div className="mb-3">{ampel}</div>}
      {leadScore && <div className="mb-4">{leadScore}</div>}
      {aktionen && <div className="mb-5">{aktionen}</div>}
      <KundenprofilUeberschrift>Kontaktdaten</KundenprofilUeberschrift>
      {kontakt}
      {abschnitte.map((def) => (
        <KlappAbschnitt key={def.schluessel} def={def} offen={offen(def.schluessel)} onUmschalten={() => umschalten(def.schluessel)} />
      ))}
    </Card>
  );
}
