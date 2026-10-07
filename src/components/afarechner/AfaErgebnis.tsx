/**
 * Die Ergebnisseite des AfA-Rechners.
 *
 * Drei Teile, in dieser Reihenfolge:
 *   1. Was jedes Jahr abgesetzt wird, und woraus sich das zusammensetzt.
 *   2. Der Rechenweg, aufklappbar. Wer die Zahl weitergibt, muss sie erklaeren
 *      koennen.
 *   3. Die Modelle im Vergleich (`AfaModelle`) und die steuerliche Wirkung.
 *
 * Jede Angabe der Strecke laesst sich hier noch einmal aendern, und die Zahl
 * oben zieht sofort nach. Gerechnet wird ausschliesslich in `afaRechnung.ts`.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Info, RotateCcw } from "lucide-react";
import { AfaModelle } from "@/components/objekte/AfaModelle";
import {
  GRENZSTEUERSAETZE,
  berechneSteuerwirkung,
  type AfaRechnung,
} from "@/lib/afaRechnung";
import {
  gebaeudeartTitel,
  modernisierungWirkt,
  nebenkosten,
  nebenkostensatz,
  type AfaAntworten,
} from "@/lib/afaStrecke";
import {
  GrundstueckFeld,
  GutachtenFeld,
  LageFeld,
  ModernisierungFeld,
  ObjektFeld,
  PreisFeld,
  SanierungFeld,
} from "@/components/afarechner/AfaEingabefelder";
import { Kennzahl, eur, eurGenau, prozent } from "@/components/afarechner/bausteine";

interface Props {
  antworten: AfaAntworten;
  aendern: (teil: Partial<AfaAntworten>) => void;
  rechnung: AfaRechnung;
  /** Zurueck an den Anfang der Strecke. */
  onNeuBeginnen: () => void;
}

export default function AfaErgebnis({ antworten, aendern, rechnung, onNeuBeginnen }: Props) {
  const [rechenwegOffen, setRechenwegOffen] = useState(false);
  const wirkung = berechneSteuerwirkung(
    rechnung,
    antworten.erhaltungsaufwand,
    antworten.erhaltungsaufwandJahre,
    antworten.grenzsteuersatz,
  );
  const feld = { antworten, aendern };

  return (
    <div className="space-y-6">
      {/* ── Die Zahl, um die es geht ── */}
      <Card className="overflow-hidden p-0">
        <div aria-hidden="true" className="h-0.5 w-full bg-primary/70" />
        <div className="p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dein Ergebnis</p>
          <h2 className="mt-2 text-2xl font-semibold leading-snug tracking-tight md:text-3xl">
            {rechnung.afaBetragPa > 0 ? (
              <>
                {eur(rechnung.afaBetragPa)} Abschreibung im Jahr
              </>
            ) : (
              "Noch keine Abschreibung, es fehlt eine Angabe"
            )}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {rechnung.afaBetragPa > 0 ? (
              <>
                {prozent(rechnung.afaSatz)} von {eur(rechnung.afaBemessungsgrundlage)} Bemessungsgrundlage.
                {antworten.gebaeudeart && ` Grundlage: ${gebaeudeartTitel(antworten.gebaeudeart)}`}
                {rechnung.baujahrBekannt && `, Baujahr ${antworten.baujahr}`}.
              </>
            ) : (
              "Trag Baujahr und Kaufpreis ein, dann steht hier die Abschreibung."
            )}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kennzahl
              bezeichnung="Gebäudeanteil"
              wert={eur(rechnung.gebaeudewert)}
              fussnote={`${rechnung.gebaeudePct.toFixed(1)} % vom Kaufpreis`}
            />
            <Kennzahl
              bezeichnung="Bodenanteil"
              wert={eur(rechnung.bodenwertGesamt)}
              fussnote={`${rechnung.bodenPct.toFixed(1)} %, nicht abschreibbar`}
            />
            <Kennzahl
              bezeichnung="Restnutzungsdauer"
              wert={rechnung.rnd > 0 ? `${rechnung.rnd} Jahre` : "–"}
              fussnote={
                antworten.gutachtenVorhanden
                  ? "laut Gutachten"
                  : rechnung.baujahrBekannt
                    ? `Modernisierungspunkte: ${rechnung.modPunkte}`
                    : "Baujahr fehlt"
              }
              betont
            />
            <Kennzahl
              bezeichnung="AfA-Satz"
              wert={rechnung.afaSatz > 0 ? prozent(rechnung.afaSatz) : "–"}
              fussnote={
                rechnung.afaSatz <= 0
                  ? "Baujahr fehlt"
                  : rechnung.untergrenze.untergrenzeGreift
                    ? `gesetzlicher Mindestsatz (${rechnung.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %)`
                    : `= 100 geteilt durch ${rechnung.rnd}`
              }
              betont
            />
          </div>

          {/*
            Die drei Werte standen in der Maske als eigene Kacheln unter dem
            Ergebnis. Sie erklaeren, warum die Restnutzungsdauer so ausfaellt,
            wie sie ausfaellt. Mit einem Gutachten entfaellt die Modellrechnung,
            dann sagen sie nichts mehr aus, und die Maske hat sie auch dort
            ausgeblendet.
          */}
          {!antworten.gutachtenVorhanden && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Kennzahl
                bezeichnung="Effektives Baujahr"
                wert={rechnung.baujahrBekannt ? rechnung.effektivesBaujahr : "–"}
                fussnote={
                  !rechnung.baujahrBekannt
                    ? "noch nicht eingetragen"
                    : rechnung.kernsaniert
                      ? "Jahr der Kernsanierung"
                      : "ursprüngliches Baujahr"
                }
              />
              <Kennzahl
                bezeichnung="Relatives Gebäudealter"
                wert={rechnung.baujahrBekannt ? `${rechnung.rndErgebnis.relativesAlter.toFixed(0)} %` : "–"}
                fussnote={
                  !rechnung.baujahrBekannt
                    ? "Baujahr eintragen"
                    : rechnung.rndErgebnis.unterSchwelle
                      ? `unter der Schwelle von ${rechnung.rndErgebnis.schwelle} %`
                      : `Schwelle ${rechnung.rndErgebnis.schwelle} % erreicht`
                }
              />
              <Kennzahl
                bezeichnung="Gesamtnutzungsdauer"
                wert={`${rechnung.gnd} Jahre`}
                fussnote={antworten.objektart}
              />
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            In der Bemessungsgrundlage stecken {eurGenau(rechnung.steuerlichGebaeude)} Gebäudeanteil und{" "}
            {eurGenau(rechnung.steuerlichNK)} Nebenkosten, nämlich der auf das Gebäude entfallende Teil der
            Kaufnebenkosten. Der Bodenanteil bleibt außen vor, Boden nutzt sich nicht ab.
          </p>
        </div>
      </Card>

      {/* ── Hinweise, die zur Zahl gehoeren ── */}
      <div className="space-y-2">
        {rechnung.untergrenze.untergrenzeGreift && rechnung.afaSatz > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/5 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--info))]" />
            <p className="text-xs text-muted-foreground">
              Aus der Restnutzungsdauer ergäben sich {rechnung.afaSatzRoh.toFixed(2)} %. Das Gesetz gibt für dieses
              Objekt {rechnung.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} % her (
              {rechnung.untergrenze.gesetzlich.grund}, {rechnung.untergrenze.gesetzlich.paragraf}). Angesetzt wird
              deshalb der gesetzliche Satz, denn niemand schreibt freiwillig langsamer ab.
            </p>
          </div>
        )}
        {rechnung.untergrenze.nachweisNoetig && rechnung.afaSatz > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-muted-foreground">
              Der Satz liegt über dem gesetzlichen von{" "}
              {rechnung.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %. Zulässig ist das nur bei einer
              kürzeren tatsächlichen Nutzungsdauer nach § 7 Abs. 4 Satz 2 EStG. Darlegen lässt sie sich mit jeder im
              Einzelfall geeigneten Methode. Der Modellwert nach ImmoWertV allein trägt dafür nicht, weil er nicht auf
              das konkrete Gebäude eingeht. Dafür braucht es eine objektbezogene Begutachtung, und ob das Finanzamt ihr
              folgt, entscheidet es im Einzelfall.
            </p>
          </div>
        )}
        {antworten.erhaltungsaufwand > 0 && rechnung.anschaffungsnah.ueberschritten && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Anschaffungsnahe Herstellungskosten.</strong> Der Erhaltungsaufwand
              von {eur(antworten.erhaltungsaufwand)} übersteigt 15 % der Gebäude-Anschaffungskosten (
              {eur(rechnung.anschaffungsnah.grenze)}). Fällt er innerhalb von drei Jahren nach dem Kauf an, ist er nach
              § 6 Abs. 1 Nr. 1a EStG nicht sofort absetzbar, sondern erhöht die AfA-Bemessungsgrundlage. Genau so ist er
              hier gerechnet.
            </p>
          </div>
        )}
        {antworten.erhaltungsaufwand > 0 &&
          !rechnung.anschaffungsnah.ueberschritten &&
          rechnung.anschaffungsnah.auslastung > 0.8 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-muted-foreground">
                Der Erhaltungsaufwand liegt bei {(rechnung.anschaffungsnah.auslastung * 100).toFixed(0)} % der
                15-Prozent-Grenze ({eur(rechnung.anschaffungsnah.grenze)}). Noch{" "}
                {eur(Math.abs(rechnung.anschaffungsnah.abstand))} Spielraum, bevor daraus anschaffungsnahe
                Herstellungskosten werden.
              </p>
            </div>
          )}
      </div>

      {/* ── Was das steuerlich wert ist ── */}
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-bold">Was das in der Steuererklärung wert ist</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ein Überschlag, keine Feststellung: die absetzbaren Beträge mal deinem Grenzsteuersatz.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Grenzsteuersatz</span>
            <Select
              value={String(antworten.grenzsteuersatz)}
              onValueChange={(v) => aendern({ grenzsteuersatz: Number(v) })}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRENZSTEUERSAETZE.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} %
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kennzahl
            bezeichnung="Abschreibung je Jahr"
            wert={eur(rechnung.afaBetragPa)}
            fussnote={rechnung.rnd > 0 ? `über ${rechnung.rnd} Jahre` : undefined}
          />
          <Kennzahl
            bezeichnung="Erhaltungsaufwand je Jahr"
            wert={eur(wirkung.erhaltungsaufwandProJahr)}
            fussnote={
              rechnung.anschaffungsnah.ueberschritten
                ? "steckt bereits in der Bemessungsgrundlage"
                : antworten.erhaltungsaufwandJahre > 1
                  ? `verteilt auf ${antworten.erhaltungsaufwandJahre} Jahre, § 82b EStDV`
                  : "im ersten Jahr voll"
            }
          />
          <Kennzahl
            bezeichnung="Steuerersparnis 1. Jahr"
            wert={eur(wirkung.ersparnisErstesJahr)}
            fussnote={`${eur(wirkung.absetzbarErstesJahr)} absetzbar bei ${antworten.grenzsteuersatz} %`}
            betont
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Nicht enthalten sind Zinsen, laufende Kosten und Mieteinnahmen. Der Überschlag zeigt allein die Wirkung der
          Abschreibung und des Erhaltungsaufwands. Eine Steuerberatung ersetzt er nicht.
        </p>
      </Card>

      {/* ── Rechenweg ── */}
      <Card className="p-5">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => setRechenwegOffen(!rechenwegOffen)}
        >
          {rechenwegOffen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {rechenwegOffen ? "Rechenweg ausblenden" : "Rechenweg anzeigen"}
        </button>
        {rechenwegOffen && (
          <div className="mt-4 space-y-4 rounded-lg bg-muted/30 p-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bodenwert</p>
              <p>
                {eurGenau(antworten.kaufpreis)} × {antworten.bodenAnteilPct.toLocaleString("de-DE")} % ={" "}
                <strong>{eurGenau(rechnung.bodenwertGesamt)}</strong>
              </p>
            </div>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Gebäudewert</p>
              <p>
                Kaufpreis {eurGenau(antworten.kaufpreis)} − Bodenwert {eurGenau(rechnung.bodenwertGesamt)} ={" "}
                <strong>{eurGenau(rechnung.gebaeudewert)}</strong>
              </p>
            </div>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Restnutzungsdauer</p>
              {!rechnung.baujahrBekannt ? (
                <p className="text-muted-foreground">
                  Ohne Baujahr lässt sich das Gebäudealter nicht bestimmen, und damit auch keine Restnutzungsdauer.
                </p>
              ) : antworten.gutachtenVorhanden ? (
                <p>
                  Aus dem Gutachten übernommen: <strong>{rechnung.rnd} Jahre</strong>
                  {antworten.gutachterQuelle ? ` (${antworten.gutachterQuelle})` : ""}.
                </p>
              ) : (
                <>
                  <p className="mb-1">
                    Relatives Gebäudealter: {rechnung.alter} / {rechnung.gnd} ={" "}
                    <strong>{rechnung.rndErgebnis.relativesAlter.toFixed(1)} %</strong>, Schwelle laut Anlage 2 bei{" "}
                    {rechnung.rndErgebnis.schwelle} %.
                  </p>
                  {rechnung.rndErgebnis.unterSchwelle ? (
                    <>
                      <p className="text-muted-foreground">
                        Unterhalb der Schwelle wirken sich Modernisierungen noch nicht aus. Es gilt
                        Gesamtnutzungsdauer minus Alter.
                      </p>
                      <p className="my-1 rounded border bg-background p-2 font-mono text-xs">RND = GND − Alter</p>
                      <p className="font-mono text-xs">
                        = {rechnung.gnd} − {rechnung.alter} = {rechnung.gnd - rechnung.alter}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="my-1 rounded border bg-background p-2 font-mono text-xs">
                        RND = a × (Alter² / GND) − b × Alter + c × GND
                      </p>
                      <p className="font-mono text-xs">
                        = {rechnung.params.a} × ({rechnung.alter}² / {rechnung.gnd}) − {rechnung.params.b} ×{" "}
                        {rechnung.alter} + {rechnung.params.c} × {rechnung.gnd} ={" "}
                        {rechnung.rndErgebnis.rndFormel.toFixed(1)}
                      </p>
                    </>
                  )}
                  {rechnung.rndErgebnis.gedeckelt && (
                    <p className="mt-1 text-muted-foreground">
                      Gedeckelt auf {rechnung.kernsaniert ? "90" : "70"} % der Gesamtnutzungsdauer ={" "}
                      {rechnung.rndErgebnis.deckel.toFixed(0)} Jahre.
                    </p>
                  )}
                  <p className="mt-1">
                    = <strong>{rechnung.rnd} Jahre</strong>
                  </p>
                </>
              )}
            </div>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">AfA-Satz</p>
              {rechnung.rnd > 0 && (
                <p>
                  Aus der Restnutzungsdauer: 100 / {rechnung.rnd} ={" "}
                  <strong>{rechnung.afaSatzRoh.toFixed(2)} %</strong>
                </p>
              )}
              <p>
                Gesetzlich nach {rechnung.untergrenze.gesetzlich.paragraf}:{" "}
                <strong>{rechnung.untergrenze.gesetzlich.satz.toLocaleString("de-DE")} %</strong> (
                {rechnung.untergrenze.gesetzlich.grund})
              </p>
              <p className="mt-1 font-semibold">
                Angesetzt: {rechnung.afaSatz > 0 ? `${rechnung.afaSatz.toFixed(2)} %` : "noch nichts, das Baujahr fehlt"}
              </p>
            </div>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bemessungsgrundlage</p>
              <p>
                Gebäudeanteil {eurGenau(rechnung.steuerlichGebaeude)} + anteilige Nebenkosten{" "}
                {eurGenau(rechnung.steuerlichNK)} (von {eurGenau(nebenkosten(antworten))} bei{" "}
                {nebenkostensatz(antworten).toLocaleString("de-DE")} %)
                {rechnung.anschaffungsnah.ueberschritten
                  ? ` + Erhaltungsaufwand ${eurGenau(antworten.erhaltungsaufwand)}`
                  : ""}
              </p>
              <p className="mt-1 font-semibold">= {eurGenau(rechnung.afaBemessungsgrundlage)}</p>
              <p className="mt-1">
                AfA je Jahr: {eurGenau(rechnung.afaBemessungsgrundlage)} × {rechnung.afaSatz.toFixed(2)} % ={" "}
                <strong>{eurGenau(rechnung.afaBetragPa)}</strong>
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── Die Modelle im Vergleich ── */}
      {rechnung.afaBemessungsgrundlage > 0 && (
        <AfaModelle
          bemessungsgrundlage={rechnung.afaBemessungsgrundlage}
          baujahr={antworten.baujahr}
          wohnflaeche={antworten.wohnflaeche}
          linearSatz={rechnung.afaSatz}
        />
      )}

      {/* ── Angaben nachtraeglich aendern ── */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">Deine Angaben ändern</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Jede Änderung wirkt sofort auf die Zahlen oben. Kein Neuladen, kein zweiter Durchlauf.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onNeuBeginnen}>
            <RotateCcw className="mr-1 h-4 w-4" /> Von vorn
          </Button>
        </div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="objekt">
            <AccordionTrigger className="text-sm">Objekt und Baujahr</AccordionTrigger>
            <AccordionContent>
              <ObjektFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="preis">
            <AccordionTrigger className="text-sm">Kaufpreis und Wohnfläche</AccordionTrigger>
            <AccordionContent>
              <PreisFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="lage">
            <AccordionTrigger className="text-sm">Bundesland und Nebenkosten</AccordionTrigger>
            <AccordionContent>
              <LageFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="grundstueck">
            <AccordionTrigger className="text-sm">Grundstücksanteil</AccordionTrigger>
            <AccordionContent>
              <GrundstueckFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="sanierung">
            <AccordionTrigger className="text-sm">Sanierung und Erhaltungsaufwand</AccordionTrigger>
            <AccordionContent>
              <SanierungFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
          {/*
            Dieselbe Regel wie in der Strecke: Der Punkt erscheint, wenn er
            etwas bewirkt. Mit einem Gutachten entfaellt die Modellrechnung
            ohnehin.
          */}
          {!antworten.gutachtenVorhanden && modernisierungWirkt(antworten) && (
            <AccordionItem value="modernisierung">
              <AccordionTrigger className="text-sm">
                Modernisierungsbewertung ({rechnung.modPunkte} Punkte)
              </AccordionTrigger>
              <AccordionContent>
                <ModernisierungFeld {...feld} rechnung={rechnung} />
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="gutachten">
            <AccordionTrigger className="text-sm">Gutachten zur Restnutzungsdauer</AccordionTrigger>
            <AccordionContent>
              <GutachtenFeld {...feld} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
