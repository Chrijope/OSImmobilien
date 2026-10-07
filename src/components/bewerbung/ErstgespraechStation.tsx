/**
 * Die Stationskarte des Reiters Erstgespräch: immer nur der aktuelle Punkt
 * (Teil 1) oder Abschnitt (Teil 2) groß, mit Sprechtext, Regie, Einwänden
 * und Erfassungsfeldern, unten Zurück und Weiter.
 *
 * Die Inhalte sind dieselben Bausteine wie in der Moderation
 * (erstgespraechBausteine.tsx, ClosingDirektTeil.tsx), nur einzeln statt
 * alle untereinander. Alle Komponenten liegen auf Modulebene, sonst
 * verlören die Eingabefelder nach jedem Tastendruck den Fokus.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import type { Bewerber } from "@/lib/bewerbungStore";
import {
  ASSESSMENT_EINWAENDE, LEISTUNGSTABELLE, LEISTUNGSTABELLE_SPALTEN,
  berechneAssessmentScore, fuellePlatzhalter,
  type AssessmentStation,
} from "@/lib/assessmentSkript";
import { TEIL_1_ANZAHL, TEIL_2_ANZAHL, felderStand, schrittBezeichnung, type ErstgespraechSchritt, type FelderQuelle } from "@/lib/erstgespraechSchritte";
import { ClosingDirektTeil } from "@/components/bewerbung/ClosingDirektTeil";
import { VorabZurStation, type Vorwissen } from "@/components/bewerbung/VorwissenKarte";
import {
  AssessmentFelder, EinschaetzungBlock, EinwandListe, PfadAuswahl, Script, TerminBuchung,
  type FelderKontext,
} from "@/components/bewerbung/erstgespraechBausteine";
import type { ErstgespraechStand } from "@/components/bewerbung/useErstgespraechAbschluss";

/**
 * Die Einwandbehandlung, eingeklappt am Ende jedes Teil-1-Punkts: Einwände
 * kommen, wann sie wollen, nicht erst in Punkt 8. Dort steht die Liste offen.
 */
function EinwandKlapp() {
  const [offen, setOffen] = useState(false);
  return (
    <Collapsible open={offen} onOpenChange={setOffen}>
      <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 text-left" data-testid="einwand-klapp">
            {offen ? <ChevronDown className="h-3.5 w-3.5 text-amber-800" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-800" />}
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Einwandbehandlung ({ASSESSMENT_EINWAENDE.length} Einwände zum Aufklappen)
            </span>
            <span className="ml-auto hidden text-[10px] text-amber-800/80 dark:text-amber-300/80 sm:inline">
              in jedem Punkt erreichbar, Einwände kommen wann sie wollen
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <EinwandListe />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** Der Inhalt eines Teil-1-Punkts, je Station wie bisher im Reiter. */
function PunktInhalt({
  station, ctx, vorname, beraterName, vorwissen, stand, bewerber, onFollowUp, onAbsage,
}: {
  station: AssessmentStation;
  ctx: FelderKontext;
  vorname: string;
  beraterName: string;
  vorwissen: Vorwissen | null;
  stand: ErstgespraechStand;
  bewerber: Bewerber;
  onFollowUp: () => void;
  onAbsage: () => void;
}) {
  const { canEdit } = ctx;
  const score = berechneAssessmentScore(ctx.assessment);
  const sprechtexte = station.sprechtext ? [station.sprechtext] : (station.sprechtexte ?? []);

  switch (station.key) {
    case "einstieg":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {sprechtexte.map((t, i) => (
            <Script key={i}>„{fuellePlatzhalter(t, { vorname, beraterName })}"</Script>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Platzhalter sind eingesetzt: Vorname aus dem Profil, Beratername aus deinem Konto.
          </p>
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
        </>
      );
    case "profil":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          <PfadAuswahl ctx={ctx} />
        </>
      );
    case "ziele":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
          <p className="text-[10px] text-muted-foreground">↑ Ziele und Einkommensziel werden mit der Übersicht synchronisiert</p>
        </>
      );
    case "motivation":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
          <p className="text-[10px] text-muted-foreground">↑ Motivation wird mit der Übersicht synchronisiert</p>
        </>
      );
    case "werWirSind":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {LEISTUNGSTABELLE_SPALTEN.map((spalte) => (
                    <th key={spalte} className="text-left font-semibold p-2">{spalte}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEISTUNGSTABELLE.map((zeile) => (
                  <tr key={zeile.leistung} className="border-t">
                    <td className="p-2 font-medium">{zeile.leistung}</td>
                    <td className="p-2 text-muted-foreground">{zeile.ersparnis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
        </>
      );
    case "konditionen":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {(station.bloecke ?? []).map((block) => (
            <div key={block.key} className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-semibold">{block.titel}</div>
              {block.sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
              <AssessmentFelder felder={block.felder ?? []} ctx={ctx} />
            </div>
          ))}
          {score.koRot.length >= 2 && (
            <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950/30 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>{score.koRot.length} gerissene harte Kriterien</strong> ({score.koRot.join(", ")}).
                Die Empfehlung steht damit automatisch auf <strong>C · Absage</strong>.
              </p>
            </div>
          )}
        </>
      );
    case "einwaende":
      return (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-4">
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          <EinwandListe />
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
        </div>
      );
    case "einschaetzung":
      return (
        <>
          {/* Der Teil-2-Schalter steht bewusst ganz oben in Punkt 9: Die
              HR-Managerin entscheidet zuerst, ob Teil 2 direkt folgt oder als
              zweiter Termin, danach kommen Sterne und Einschätzung. */}
          <div className="space-y-2 rounded-lg border-2 border-dashed border-primary/30 p-4" data-testid="teil2-schalter">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Teil 2 (optional) · Closing direkt anschließen
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  Du entscheidest frei. Der Direktweg bietet sich an, wenn der Bewerber gerade
                  Zeit hat und richtig warm ist: Dann führst du das persönliche Gespräch sofort
                  weiter und Punkt 10 (Termin buchen) entfällt. Schalter aus: alles bleibt wie
                  bisher, weiter mit Punkt 10.
                </p>
              </div>
              <Switch
                aria-label="Teil 2 jetzt direkt anschließen"
                checked={stand.closingDirektAn}
                onCheckedChange={(v) => stand.setClosingDirekt({ aktiv: !!v })}
                disabled={!canEdit}
              />
            </div>
            {stand.closingDirektAn ? (
              <p className="text-xs font-medium text-primary">
                Schalter an: In der Leiste oben erscheinen die {TEIL_2_ANZAHL} Abschnitte von Teil 2,
                Punkt 10 ist durchgestrichen. „Weiter“ führt zu Abschnitt 1.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Schalter aus: „Weiter“ führt zu Punkt 10, Termin buchen. Teil 2 läuft später als
                eigene Präsentation.
              </p>
            )}
          </div>

          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          <EinschaetzungBlock
            ctx={ctx}
            bewerberBewertung={bewerber.bewertung}
            aktionen={canEdit && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button size="sm" variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  onClick={onFollowUp}>
                  <CalendarClock className="h-3.5 w-3.5 mr-1" /> B · Follow-Up-Termin setzen
                </Button>
                <Button size="sm" variant="destructive" onClick={onAbsage}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> C · Absage
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  Beide öffnen den bekannten Dialog (Datum und Notiz beziehungsweise Grund und Absage-Mail).
                </span>
              </div>
            )}
          />

        </>
      );
    case "naechsterSchritt":
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          <TerminBuchung
            vorname={vorname}
            closingDatum={stand.closingDatum}
            closingUhrzeit={stand.closingUhrzeit}
            setClosingDatum={stand.setClosingDatum}
            setClosingUhrzeit={stand.setClosingUhrzeit}
            canEdit={canEdit}
          />
        </>
      );
    default:
      // Punkt 2 (Ausgangslage) und alle Stationen mit Sprechtext plus Feldern
      return (
        <>
          <VorabZurStation station={station.nummer} vorwissen={vorwissen} />
          {sprechtexte.map((t, i) => <Script key={i}>„{t}"</Script>)}
          <AssessmentFelder felder={station.felder ?? []} ctx={ctx} />
        </>
      );
  }
}

export function ErstgespraechStation({
  schritt, schritte, bewerber, canEdit, vorname, beraterName, vorwissen, ctx, stand, onRefresh,
  onZurueck, onWeiter, onFollowUp, onAbsage,
}: {
  schritt: ErstgespraechSchritt;
  schritte: ErstgespraechSchritt[];
  bewerber: Bewerber;
  canEdit: boolean;
  vorname: string;
  beraterName: string;
  vorwissen: Vorwissen | null;
  ctx: FelderKontext;
  stand: ErstgespraechStand;
  onRefresh: () => void;
  onZurueck: () => void;
  onWeiter: () => void;
  onFollowUp: () => void;
  onAbsage: () => void;
}) {
  const index = schritte.findIndex((s) => s.id === schritt.id);
  const vorher = index > 0 ? schritte[index - 1] : null;
  const nachher = index >= 0 && index < schritte.length - 1 ? schritte[index + 1] : null;
  const quelle: FelderQuelle = {
    assessment: stand.assessment,
    closingDirekt: stand.closingDirekt,
    closingDatum: stand.closingDatum,
    closingUhrzeit: stand.closingUhrzeit,
  };
  const felder = felderStand(schritt, quelle);
  const abgehakt = schritt.art === "abschnitt" && (stand.closingDirekt.abgehakt ?? []).includes(schritt.abschnitt.key);

  const toggleAbgehakt = (an: boolean) => {
    if (schritt.art !== "abschnitt") return;
    const key = schritt.abschnitt.key;
    const liste = (stand.closingDirekt.abgehakt ?? []).filter((k) => k !== key);
    stand.setClosingDirekt({ abgehakt: an ? [...liste, key] : liste });
  };

  const kicker = schritt.art === "punkt"
    ? `Teil 1 · Punkt ${schritt.nummer} von ${TEIL_1_ANZAHL}`
    : `Teil 2 · Abschnitt ${schritt.nummer} von ${TEIL_2_ANZAHL}`;
  const folieBadge = schritt.art === "punkt"
    ? schritt.station.folie
      ? `Folie: ${schritt.station.folie.kopfzeile}`
      : "interner Zwischenstopp, keine Folie"
    : `Folie: ${schritt.abschnitt.folieTitel}`;

  const fussText = nachher
    ? "Autosave: sofort lokal, nach 1,5 Sekunden in die Datenbank"
    : schritt.art === "punkt"
      ? "Letzter Punkt ohne Teil 2. Abschließen über die Karte rechts."
      : "Letzter Schritt. Gespräch beenden über die Karte rechts oder direkt in den Reiter Closing wechseln.";

  return (
    <Card className="border-primary/40 ring-1 ring-primary/10 overflow-hidden" data-testid="erstgespraech-station" data-schritt={schritt.id}>
      <div className="flex flex-wrap items-start gap-3 border-b px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{kicker}</div>
          <h2 className="text-lg font-semibold leading-tight mt-0.5">{schritt.titel}</h2>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal text-[10px] text-muted-foreground">{folieBadge}</Badge>
          {schritt.art === "punkt" ? (
            felder.gesamt > 0 && (
              <Badge
                variant="outline"
                className={`font-normal text-[10px] ${felder.erfasst >= felder.gesamt ? "border-green-600/50 bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300" : "text-muted-foreground"}`}
                data-testid="station-felder-badge"
              >
                {felder.erfasst} von {felder.gesamt} Feldern erfasst
              </Badge>
            )
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-[11px] select-none">
              <Checkbox
                id={`station-abgehakt-${schritt.id}`}
                checked={abgehakt}
                onCheckedChange={(v) => toggleAbgehakt(v === true)}
                disabled={!canEdit}
              />
              <span>{abgehakt ? "als besprochen abgehakt" : "als besprochen abhaken"}</span>
            </label>
          )}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        {schritt.art === "punkt" ? (
          <>
            <PunktInhalt
              station={schritt.station}
              ctx={ctx}
              vorname={vorname}
              beraterName={beraterName}
              vorwissen={vorwissen}
              stand={stand}
              bewerber={bewerber}
              onFollowUp={onFollowUp}
              onAbsage={onAbsage}
            />
            {/* Christians Entscheidung: die Einwände an jedem Teil-1-Punkt
                eingeklappt, in Punkt 8 stehen sie ohnehin offen. */}
            {schritt.station.key !== "einwaende" && <EinwandKlapp key={schritt.id} />}
          </>
        ) : (
          <ClosingDirektTeil
            bewerber={bewerber}
            canEdit={canEdit}
            daten={stand.closingDirekt}
            onDatenChange={stand.setClosingDirekt}
            onRefresh={onRefresh}
            abschnittKey={schritt.abschnitt.key}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
        {/* `whitespace-normal` und volle Breite auf dem Handy: Die Beschriftung
            traegt den Namen des naechsten Punktes, etwa "Weiter · Punkt 1 ·
            Einstieg und Rahmen". Ein Knopf bricht von sich aus nicht um, also
            schob er sich aus der Karte heraus. */}
        <Button size="sm" variant="outline" onClick={onZurueck} disabled={!vorher} className="h-auto w-full gap-1.5 whitespace-normal py-2 text-left sm:w-auto" data-testid="station-zurueck">
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          {vorher ? `Zurück · ${schrittBezeichnung(vorher)}` : "Zurück"}
        </Button>
        <span className="mx-auto text-center text-[10px] text-muted-foreground">{fussText}</span>
        {nachher && (
          <Button size="sm" onClick={onWeiter} className="h-auto w-full gap-1.5 whitespace-normal py-2 text-left sm:w-auto" data-testid="station-weiter">
            Weiter · {schrittBezeichnung(nachher)}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Button>
        )}
      </div>
    </Card>
  );
}
