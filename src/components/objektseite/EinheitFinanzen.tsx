import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EuroInput } from "@/components/ui/euro-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hinweis, InfoSymbol, KartenTitel, ReiterZweck } from "@/components/objektseite/Bausteine";
import { HerkunftChip, Regler, Zeile } from "@/components/expose/ExposeRechner";
import { berechneExpose, VERMOEGENS_HORIZONTE, type ExposeObjektdaten } from "@/lib/exposeRechner";
import { ANNAHMEN_GRENZEN, eigenkapitalProzentAusBetrag, type ExposeAnnahmen, type Tilgungsmodus, type ZweitesDarlehenErsetzt } from "@/lib/exposeAnnahmen";
import { annahmenVorbelegen, exposeObjektdatenAus } from "@/lib/exposeInhalt";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { exposePfad } from "@/lib/objektExposeStore";
import { eur0 as eur0Basis, dez as dezBasis, prozent as prozentBasis } from "@/lib/objektKennzahlen";
import { rechnerHinweis } from "@/lib/exposeRechnerTexte";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { EINHEIT_FINANZEN_TEXTE } from "./einheitFinanzenTexte";

/**
 * Reiter „Finanzen" der Einheiten-Seite, aufgebaut wie der Finanzen-Reiter
 * der Vorlage: links ein aufklappbares Panel „Finanzierungsparameter",
 * rechts die Karten Finanzierungsübersicht, Kaufpreis und
 * Kaufpreisaufteilung, Sanierung, Kaufnebenkosten und Monatliche Übersicht,
 * dazu Entwicklung und Vermögen über die Jahre.
 *
 * Gerechnet wird ausschließlich mit berechneExpose, es gibt keine zweite
 * Rechenlogik. Die Annahmen leben nur in diesem Reiter; gespeichert werden
 * sie im Exposé, nicht hier.
 */

/**
 * Wofür dieser Reiter da ist, ein Satz für das Info-Symbol an der
 * Reiter-Beschriftung. Christian am 23.09.2026: „Finanzen" ist die allgemeine
 * Berechnung für jeden, die Investmentkalkulation die genauere für einen
 * bestimmten Kunden. Das soll man sehen, bevor man klickt.
 */
export const FINANZEN_ERKLAERUNG = "Schnelle Musterrechnung für diese Einheit mit Standardannahmen. Ideal fürs erste Gespräch.";

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";
const GRUEN = "text-[hsl(var(--success))]";
const ROT = "text-destructive";
const BLAU = "text-primary";

function Gruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titel}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Zwei Knöpfe als Umschalter, wie die Horizontwahl im Exposé. */
function Umschalter<T extends string>({ wert, optionen, onChange, label, testId }: {
  wert: T; optionen: Array<{ id: T; label: string }>; onChange: (v: T) => void; label: string; testId: string;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label={label} data-testid={testId}>
      {optionen.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={wert === o.id} onClick={() => onChange(o.id)} data-testid={`${testId}-${o.id}`}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", wert === o.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Aufklappbar({ titel, offen, onOffen, children, testId }: { titel: string; offen: boolean; onOffen: (v: boolean) => void; children: React.ReactNode; testId: string }) {
  return (
    <Collapsible open={offen} onOpenChange={onOffen} className="border-t border-border/60 pt-3">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" data-testid={testId}>
          {titel}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", offen && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Schalter({ checked, onChange, label, testId, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; testId: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export interface EinheitFinanzenProps {
  objekt: ObjektData;
  wohnung: ObjektWohnung;
  /** Für Tests: fester Stichtag. */
  heute?: Date;
  /**
   * Die Fassung für die Kundenansicht (Bauplan vom 23.09.2026, Frage 7):
   * dieselbe Beispielrechnung, aber ohne Verweis ins interne Exposé und ohne
   * Sätze über das CRM. Gespeichert wird ohnehin nichts.
   */
  kundenModus?: boolean;
}

export function EinheitFinanzen({ objekt, wohnung: w, heute = new Date(), kundenModus = false }: EinheitFinanzenProps) {
  // Kundensprache, Etappe 3: in der Kundenansicht die Sprache der Seite, im CRM Deutsch.
  const sprache = useAnzeigeSprache();
  const t = EINHEIT_FINANZEN_TEXTE[sprache];
  const eur0 = (n: number) => eur0Basis(n, sprache);
  const dez = (n: number, stellen = 1) => dezBasis(n, stellen, sprache);
  const prozent = (n: number, stellen = 2) => prozentBasis(n, stellen, sprache);
  const hinweis = (text: string) => rechnerHinweis(text, sprache);
  // Vorbelegung wie im Exposé: Standard, dann Objekt (AfA, Sanierung). Keine Selbstauskunft, das ist die neutrale Sicht.
  const vorbelegung = useMemo(() => annahmenVorbelegen(objekt, w, null, heute), [objekt, w, heute]);
  const basis = useMemo(() => exposeObjektdatenAus(objekt, w, heute), [objekt, w, heute]);
  const [annahmen, setAnnahmen] = useState<ExposeAnnahmen>(vorbelegung.annahmen);
  const [kaltmieteManuell, setKaltmieteManuell] = useState<number | null>(null);
  // Offen starten, nur auf einem nachweislich schmalen Bildschirm zugeklappt, damit die Karten zuerst sichtbar sind.
  const [parameterOffen, setParameterOffen] = useState<boolean>(() => !(typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px)").matches));
  const [erweitertOffen, setErweitertOffen] = useState(false);
  const [optionenOffen, setOptionenOffen] = useState(false);
  const [verlaufOffen, setVerlaufOffen] = useState(false);

  const setze = (aenderung: Partial<ExposeAnnahmen>) => setAnnahmen((a) => ({ ...a, ...aenderung }));

  const objektdaten: ExposeObjektdaten = useMemo(
    () => (kaltmieteManuell == null ? basis : { ...basis, kaltmieteMonat: kaltmieteManuell }),
    [basis, kaltmieteManuell],
  );
  const ergebnis = useMemo(() => berechneExpose(objektdaten, annahmen), [objektdaten, annahmen]);
  const k = ergebnis.kauf;
  const f = ergebnis.finanzierung;
  const st = ergebnis.steuer;
  const m = ergebnis.monat;
  const nk = k.nebenkosten;
  const g = ANNAHMEN_GRENZEN;
  const herkunftAfa = vorbelegung.ausObjekt.includes("afaProzent") ? "objekt" : undefined;

  // Hinterlegte AfA: der Satz am Objekt, sonst der gesetzliche Satz nach Baujahr.
  const hinterlegteAfa = objekt.afaDaten && objekt.afaDaten.afaSatz > 0 ? objekt.afaDaten.afaSatz : linearerAfaSatz(basis.baujahr).satz;
  const afaAngepasst = Math.abs(annahmen.afaProzent - hinterlegteAfa) > 1e-9;
  const mieteAngepasst = kaltmieteManuell != null && Math.abs(kaltmieteManuell - basis.kaltmieteMonat) > 1e-9;
  const mieteMax = Math.max(3000, Math.ceil((basis.kaltmieteMonat * 2) / 50) * 50);

  const grundstueckProzent = 100 - st.gebaeudeanteilProzent;
  const monatText = annahmen.betrachtungsjahr === annahmen.startjahr
    ? t.werteAb(t.monate[Math.min(11, heute.getMonth() + 1)], annahmen.startjahr)
    : t.werteImJahr(annahmen.betrachtungsjahr);
  const betrachtungsjahre = Array.from({ length: Math.min(10, ergebnis.jahresreihe.length) }, (_, i) => annahmen.startjahr + i);
  const restschuld10 = ergebnis.jahresreihe[Math.min(9, ergebnis.jahresreihe.length - 1)]?.restschuldEnde ?? 0;
  const zweitesErsetztLabel: Record<ZweitesDarlehenErsetzt, string> = t.zweitesErsetzt;

  const panel = (
    <aside className={cn(KARTE, "space-y-4")} data-testid="finanzierungsparameter">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold"><Calculator className="h-4 w-4 text-primary" /> {t.parameter}</div>
        <Button variant="ghost" size="icon" className="h-[40px] w-[40px] sm:h-7 sm:w-7" onClick={() => setParameterOffen(false)} aria-label={t.parameterSchliessen}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-2">
        <Regler label={t.eigenkapital} testId="regler-eigenkapital" wert={annahmen.eigenkapitalProzent} anzeige={prozent(annahmen.eigenkapitalProzent, 1)}
          min={g.eigenkapitalProzent.min} max={g.eigenkapitalProzent.max} schritt={g.eigenkapitalProzent.schritt} minText={prozent(0, 0)} maxText={prozent(100, 0)}
          onChange={(v) => setze({ eigenkapitalProzent: v })} />
        <div className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 text-muted-foreground">{t.betrag}</span>
          <EuroInput value={Math.round(k.eigenkapitalInvestition)} onChange={(betrag) => setze({ eigenkapitalProzent: eigenkapitalProzentAusBetrag(betrag, k.gesamtinvestition) })} className="h-9" />
        </div>
        <p className="text-xs text-muted-foreground">{t.eigenkapitalHinweis}</p>
      </div>

      <Gruppe titel={t.bankdarlehen}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t.berechnungUeber}</span>
          <Umschalter<Tilgungsmodus> label={t.berechnungsmodus} testId="tilgungsmodus" wert={annahmen.tilgungsmodus ?? "tilgung"}
            optionen={[{ id: "tilgung", label: t.tilgung }, { id: "laufzeit", label: t.laufzeit }]} onChange={(v) => setze({ tilgungsmodus: v })} />
        </div>
        {annahmen.tilgungsmodus === "laufzeit" && (
          <Regler label={t.laufzeit} testId="regler-laufzeit" wert={annahmen.laufzeitJahre ?? 30} anzeige={t.jahre(annahmen.laufzeitJahre ?? 30)}
            min={g.laufzeitJahre.min} max={g.laufzeitJahre.max} schritt={g.laufzeitJahre.schritt} minText={t.jahre(5)} maxText={t.jahre(40)}
            onChange={(v) => setze({ laufzeitJahre: Math.round(v) })} />
        )}
        <Regler label={t.zinssatz} testId="regler-zins" wert={annahmen.zinsProzent} anzeige={prozent(annahmen.zinsProzent, 2)}
          min={g.zinsProzent.min} max={g.zinsProzent.max} schritt={g.zinsProzent.schritt} minText={prozent(1, 0)} maxText={prozent(8, 0)} onChange={(v) => setze({ zinsProzent: v })} />
        {annahmen.tilgungsmodus === "laufzeit" ? (
          <Zeile label={t.tilgungAusLaufzeit} wert={prozent(f.tilgungProzent, 2)} testId="tilgung-berechnet" info={t.tilgungAusLaufzeitInfo} />
        ) : (
          <>
            <Regler label={t.tilgung} testId="regler-tilgung" wert={annahmen.tilgungProzent} anzeige={prozent(annahmen.tilgungProzent, 2)}
              min={g.tilgungProzent.min} max={g.tilgungProzent.max} schritt={g.tilgungProzent.schritt} minText={prozent(0.5, 1)} maxText={prozent(5, 0)} onChange={(v) => setze({ tilgungProzent: v })} />
            <Zeile label={t.laufzeitBisVolltilgung} wert={f.laufzeitJahre != null ? t.rundJahre(dez(f.laufzeitJahre, 0)) : t.keinDarlehen} testId="laufzeit-berechnet" />
          </>
        )}
        <div className="border-t border-border/60"><Zeile label={t.monatlicheRate} wert={eur0(f.bankMonatsrate)} fett testId="bank-rate" /></div>
      </Gruppe>

      <Gruppe titel={t.zweitesDarlehen}>
        <Schalter checked={!!annahmen.zweitesDarlehenAktiv} onChange={(v) => setze({ zweitesDarlehenAktiv: v })} label={t.zweitesAnsetzen} testId="schalter-zweites" />
        {annahmen.zweitesDarlehenAktiv && (
          <>
            <Select value={annahmen.zweitesDarlehenErsetzt ?? "bankdarlehen"} onValueChange={(v) => setze({ zweitesDarlehenErsetzt: v as ZweitesDarlehenErsetzt })}>
              <SelectTrigger aria-label={t.zweitesVerwendung} className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(zweitesErsetztLabel) as ZweitesDarlehenErsetzt[]).map((id) => <SelectItem key={id} value={id}>{zweitesErsetztLabel[id]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-muted-foreground">{t.betrag}</span>
              <EuroInput value={annahmen.zweitesDarlehenBetrag ?? 0} onChange={(v) => setze({ zweitesDarlehenBetrag: v })} className="h-9" />
            </div>
            <Regler label={t.zinssatz} testId="regler-zweites-zins" wert={annahmen.zweitesDarlehenZinsProzent ?? 3} anzeige={prozent(annahmen.zweitesDarlehenZinsProzent ?? 3, 2)}
              min={g.zweitesDarlehenZinsProzent.min} max={g.zweitesDarlehenZinsProzent.max} schritt={g.zweitesDarlehenZinsProzent.schritt} minText={prozent(0, 0)} maxText={prozent(8, 0)}
              onChange={(v) => setze({ zweitesDarlehenZinsProzent: v })} />
            <Regler label={t.tilgung} testId="regler-zweites-tilgung" wert={annahmen.zweitesDarlehenTilgungProzent ?? 2} anzeige={prozent(annahmen.zweitesDarlehenTilgungProzent ?? 2, 2)}
              min={g.zweitesDarlehenTilgungProzent.min} max={g.zweitesDarlehenTilgungProzent.max} schritt={g.zweitesDarlehenTilgungProzent.schritt} minText={prozent(0.5, 1)} maxText={prozent(10, 0)}
              onChange={(v) => setze({ zweitesDarlehenTilgungProzent: v })} />
            <div className="border-t border-border/60"><Zeile label={t.monatlicheRate} wert={eur0(f.zweitesDarlehen?.monatsrate ?? 0)} fett testId="zweites-rate" /></div>
          </>
        )}
      </Gruppe>

      <Gruppe titel={t.steuer}>
        <Regler label={t.zve} testId="regler-zve" wert={annahmen.zvE} anzeige={eur0(annahmen.zvE)}
          min={g.zvE.min} max={g.zvE.max} schritt={g.zvE.schritt} minText={eur0(g.zvE.min)} maxText={eur0(g.zvE.max)} onChange={(v) => setze({ zvE: v })} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t.familienstand}</span>
          <Umschalter<"ledig" | "verheiratet"> label={t.familienstand} testId="familienstand" wert={annahmen.verheiratet ? "verheiratet" : "ledig"}
            optionen={[{ id: "ledig", label: t.ledig }, { id: "verheiratet", label: t.verheiratet }]} onChange={(v) => setze({ verheiratet: v === "verheiratet" })} />
        </div>
        <p className="text-xs text-muted-foreground" data-testid="grenzsteuersatz">{t.grenzsteuersatz(prozent(st.grenzsteuersatzProzent, 1), st.steuerjahr, annahmen.verheiratet)}</p>
      </Gruppe>

      <Aufklappbar titel={t.erweitert} offen={erweitertOffen} onOffen={setErweitertOffen} testId="erweitert">
        <Schalter checked={!!annahmen.nebenkostenTraegtVerkaeufer} onChange={(v) => setze({ nebenkostenTraegtVerkaeufer: v })} label={t.nkVerkaeufer} testId="schalter-verkaeufer" />
        <Schalter checked={annahmen.lohnsteuerermaessigung} onChange={(v) => setze({ lohnsteuerermaessigung: v })} label={t.lohnsteuer} testId="schalter-lohnsteuer" />
        <Schalter checked={annahmen.sonderAfa} onChange={(v) => setze({ sonderAfa: v })} label={t.sonderAfa} testId="schalter-sonderafa" />
        {annahmen.sonderAfa && st.sonderAfaHinweis && <p className="text-xs text-muted-foreground">{hinweis(st.sonderAfaHinweis)}</p>}
      </Aufklappbar>

      <Aufklappbar titel={t.optionen} offen={optionenOffen} onOffen={setOptionenOffen} testId="optionen">
        <div>
          <Regler label={t.monatlicheKaltmiete} testId="regler-miete" wert={objektdaten.kaltmieteMonat} anzeige={eur0(objektdaten.kaltmieteMonat)}
            min={0} max={mieteMax} schritt={5} minText={sprache === "en" ? eur0(0) : "0 €"} maxText={eur0(mieteMax)} onChange={(v) => setKaltmieteManuell(v)} herkunft={mieteAngepasst ? undefined : "objekt"} />
          {mieteAngepasst && (
            <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline" onClick={() => setKaltmieteManuell(null)} data-testid="miete-reset">
              {t.mieteZuruecksetzen(eur0(basis.kaltmieteMonat))}
            </button>
          )}
          {basis.stellplatzpreis && w.stellplatzMiete ? <p className="mt-1 text-xs text-muted-foreground">{t.stellplatzmiete(eur0(w.stellplatzMiete))}</p> : null}
        </div>
        <Regler label={t.leerstandsquote} testId="regler-leerstand" wert={annahmen.leerstandProzent} anzeige={prozent(annahmen.leerstandProzent, 1)}
          min={g.leerstandProzent.min} max={g.leerstandProzent.max} schritt={g.leerstandProzent.schritt} minText={prozent(0, 0)} maxText={prozent(10, 0)} onChange={(v) => setze({ leerstandProzent: v })} />
        {(basis.mietgarantieJahre ?? 0) > 0 && <p className="-mt-2 text-xs text-muted-foreground">{t.mietgarantie(basis.mietgarantieJahre ?? 0)}</p>}
        <Regler label={t.mietsteigerung} testId="regler-mietsteigerung" wert={annahmen.mietsteigerungProzent} anzeige={prozent(annahmen.mietsteigerungProzent, 1)}
          min={g.mietsteigerungProzent.min} max={g.mietsteigerungProzent.max} schritt={g.mietsteigerungProzent.schritt} minText={prozent(0, 0)} maxText={prozent(5, 0)} onChange={(v) => setze({ mietsteigerungProzent: v })} />
        <Regler label={t.kostensteigerung} testId="regler-kostensteigerung" wert={annahmen.kostensteigerungProzent} anzeige={prozent(annahmen.kostensteigerungProzent, 1)}
          min={g.kostensteigerungProzent.min} max={g.kostensteigerungProzent.max} schritt={g.kostensteigerungProzent.schritt} minText={prozent(0, 0)} maxText={prozent(5, 0)} onChange={(v) => setze({ kostensteigerungProzent: v })} />
        <Regler label={t.wertentwicklung} testId="regler-wertentwicklung" wert={annahmen.wertsteigerungProzent} anzeige={prozent(annahmen.wertsteigerungProzent, 1)}
          min={g.wertsteigerungProzent.min} max={g.wertsteigerungProzent.max} schritt={g.wertsteigerungProzent.schritt} minText={prozent(0, 0)} maxText={prozent(5, 0)} onChange={(v) => setze({ wertsteigerungProzent: v })} />
        <div>
          <Regler label={t.afaSatzGebaeude} testId="regler-afa" wert={annahmen.afaProzent} anzeige={prozent(annahmen.afaProzent, 1)} herkunft={afaAngepasst ? undefined : herkunftAfa}
            min={g.afaProzent.min} max={g.afaProzent.max} schritt={g.afaProzent.schritt} minText={prozent(0, 0)} maxText={prozent(10, 0)} onChange={(v) => setze({ afaProzent: v })} />
          {afaAngepasst && (
            <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline" onClick={() => setze({ afaProzent: hinterlegteAfa })} data-testid="afa-reset">
              {t.afaZuruecksetzen(prozent(hinterlegteAfa, 1))}
            </button>
          )}
        </div>
        <Schalter checked={annahmen.mietverwaltungEinrechnen} onChange={(v) => setze({ mietverwaltungEinrechnen: v })} testId="schalter-sev"
          label={<>{t.sevEinbeziehen}{basis.mietverwaltungMonat ? t.sevJeMonat(eur0(basis.mietverwaltungMonat)) : kundenModus ? t.sevKeineAngabe : " · am Objekt nicht gepflegt"}</>} />
      </Aufklappbar>

      {ergebnis.hinweise.length > 0 && (
        <ul className="space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground" data-testid="hinweise">
          {ergebnis.hinweise.map((text) => <li key={text}>{hinweis(text)}</li>)}
        </ul>
      )}
    </aside>
  );

  const finanzierungsuebersicht = (
    <div className={KARTE} data-testid="karte-finanzierung">
      <KartenTitel>{t.finanzierungsuebersicht}</KartenTitel>
      <Zeile label={t.eigenkapitalMit(prozent(annahmen.eigenkapitalProzent, 1))} wert={eur0(k.eigenkapitalInvestition)} testId="fin-eigenkapital" />
      <Zeile label={t.kaufnebenkosten} wert={k.nebenkostenTraegtVerkaeufer ? t.verkaeuferKlammer(eur0(0)) : eur0(k.nebenkostenKunde)} testId="fin-nebenkosten" />
      {f.zweitesDarlehen?.ersetzt === "eigenkapital" && <Zeile label={t.eigenkapitalersatz} wert={`- ${eur0(f.zweitesDarlehen.betrag)}`} />}
      <div className="border-t border-border/60"><Zeile label={t.eigeninvestition} wert={eur0(k.eigenkapitaleinsatz)} fett testId="fin-eigeninvestition" info={t.eigeninvestitionInfo} /></div>
      <Zeile label={t.darlehensbetrag} wert={eur0(k.darlehen)} testId="fin-darlehen" info={t.darlehensbetragInfo(prozent(k.finanzierungsquoteProzent, 0))} />
      {f.zweitesDarlehen && (
        <>
          <Zeile label={t.davonBank} wert={eur0(f.bankdarlehen)} testId="fin-bankdarlehen" />
          <Zeile label={t.davonZweites(prozent(f.zweitesDarlehen.zinsProzent, 2), prozent(f.zweitesDarlehen.tilgungProzent, 2))} wert={eur0(f.zweitesDarlehen.betrag)} testId="fin-zweites" />
        </>
      )}
      <Zeile label={t.zinssatz} wert={prozent(f.zinsProzent, 2)} testId="fin-zins" />
      <Zeile label={f.tilgungsmodus === "laufzeit" ? t.tilgungAusJahren(f.laufzeitJahre ?? 0) : t.tilgung} wert={prozent(f.tilgungProzent, 2)} testId="fin-tilgung" />
      <div className="border-t border-border/60"><Zeile label={t.annuitaet} wert={eur0(f.monatsrate)} fett testId="fin-rate" /></div>
      <Zeile label={t.bruttomietrendite} wert={prozent(ergebnis.kennzahlen.mietrenditeProzent, 2)} testId="fin-brutto" info={t.bruttomietrenditeInfo} />
      <Zeile label={t.nettomietrendite} wert={prozent(ergebnis.kennzahlen.nettomietrenditeProzent, 2)} testId="fin-netto" info={t.nettomietrenditeInfo} />
    </div>
  );

  const kaufpreisKarte = (
    <div className={KARTE} data-testid="karte-kaufpreis">
      <KartenTitel>{t.kaufpreisKarte}</KartenTitel>
      <Zeile label={t.kaufpreisImmobilie} wert={eur0(k.kaufpreisAngepasst)} testId="kp-immobilie" />
      <Zeile label={t.stellplatz} wert={k.stellplatz > 0 ? eur0(k.stellplatz) : t.keinStellplatz} />
      <div className="border-t border-border/60"><Zeile label={t.gesamtkaufpreis} wert={eur0(k.gesamtinvestition)} fett testId="kp-gesamt" /></div>
      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.kaufpreisaufteilung}</div>
      <Zeile label={t.grundstuecksanteil(prozent(grundstueckProzent, 0))} wert={eur0(k.gesamtinvestition * (grundstueckProzent / 100))} testId="kp-grundstueck" />
      <Zeile label={t.gebaeudeanteil(prozent(st.gebaeudeanteilProzent, 0))} wert={eur0(k.gesamtinvestition * (st.gebaeudeanteilProzent / 100))} testId="kp-gebaeude" />
      {st.gebaeudeanteilAngenommen && <p className="mt-1 text-xs text-muted-foreground">{kundenModus ? t.aufteilungAngenommen(prozent(st.gebaeudeanteilProzent, 0)) : `Aufteilung nicht am Objekt gepflegt, ${dez(st.gebaeudeanteilProzent, 0)} % Gebäudeanteil angenommen.`}</p>}
      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.abschreibung}</div>
      <Zeile label={t.bemessungsgrundlage} wert={eur0(st.afaBasis)} testId="kp-afa-basis" info={t.bemessungsgrundlageInfo} />
      <Zeile label={<>{t.afaSatz}{afaAngepasst && <Badge variant="outline" className="ml-1.5 border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-1.5 py-0 text-[10px] text-[hsl(var(--warning))]" data-testid="afa-angepasst">{t.angepasst}</Badge>}</>} wert={prozent(st.afaProzent, 1)} testId="kp-afa-satz" />
      <Zeile label={t.afaJahr} wert={eur0(st.afaJahr)} testId="kp-afa-jahr" />
      {st.sonderAfaAktiv && <Zeile label={t.sonderAfaJahr(st.sonderAfaJahre)} wert={eur0(st.sonderAfaJahr)} testId="kp-sonderafa" />}
    </div>
  );

  const sanierungKarte = st.sanierungsanteil > 0 ? (
    <div className={KARTE} data-testid="karte-sanierung">
      <KartenTitel zusatz={t.fertigstellung(st.sanierungAbJahr)}>{t.sanierungTitel}</KartenTitel>
      {(basis.sanierungskostenGesamt ?? 0) > 0 && <Zeile label={t.massnahmeGesamt} wert={eur0(basis.sanierungskostenGesamt ?? 0)} testId="san-gesamt" />}
      {(basis.miteigentumsanteilProzent ?? 0) > 0 && <Zeile label={t.miteigentumsanteil} wert={prozent(basis.miteigentumsanteilProzent ?? 0, 2)} />}
      <div className="border-t border-border/60"><Zeile label={t.deinAnteil(annahmen.instandhaltungsart === "erhaltungsaufwand" ? t.erhaltungsaufwand(st.sanierungAbJahr) : annahmen.instandhaltungsart === "werkvertrag" ? t.herstellungskosten : t.nichtAngesetzt)} wert={eur0(st.sanierungsanteil)} fett testId="san-anteil" /></div>
      {annahmen.instandhaltungsart === "erhaltungsaufwand" && (
        <Zeile label={t.steuerersparnis(st.sanierungAbJahr, annahmen.instandhaltungJahre > 1 ? st.sanierungAbJahr + annahmen.instandhaltungJahre - 1 : undefined)} wert={`≈ ${eur0(st.einmaligeSteuerersparnisSanierung)}`} wertKlasse={cn(GRUEN, "font-semibold")} testId="san-ersparnis" />
      )}
      <Hinweis>
        {annahmen.instandhaltungsart === "erhaltungsaufwand"
          ? (kundenModus
            ? t.hinweisErhaltung(annahmen.instandhaltungJahre)
            : `${t.hinweisErhaltung(annahmen.instandhaltungJahre).replace(/\.$/, "")}; das CRM kennt dieses Feld noch nicht.`)
          : annahmen.instandhaltungsart === "werkvertrag"
            ? t.hinweisWerkvertrag
            : kundenModus
            ? t.hinweisNichtAngesetzt
            : 'Steuerlich nicht angesetzt. Die Behandlung wird im Exposé unter „Sanierung steuerlich" gewählt.'}
      </Hinweis>
    </div>
  ) : null;

  // Seit dem 30.09.2026 laufen die Nebenkosten ohne den Sanierungsanteil, dann nennt die Karte die Basis.
  const mitSanierungsabzug = nk.basis < k.gesamtinvestition;
  const nebenkostenKarte = (
    <div className={KARTE} data-testid="karte-nebenkosten">
      <KartenTitel zusatz={nk.quelle === "manuell" ? t.satzGepflegt : undefined}>{t.nebenkostenTitel}</KartenTitel>
      <Zeile label={t.grunderwerbsteuer(nk.bundeslandName ?? (nk.quelle === "mittelwert" ? t.bundeslandUnbekannt : t.bundesland), prozent(nk.grunderwerbsteuerProzent, 1))} wert={eur0(nk.grunderwerbsteuer)} testId="nk-grest" />
      <Zeile label={t.notar} wert={eur0(nk.gebuehren.zeileNotarKaufvertrag)} testId="nk-notar" info={t.notarInfo} />
      <Zeile label={t.grundschuld} wert={eur0(nk.gebuehren.zeileGrundschuld)} testId="nk-grundschuld" info={t.grundschuldInfo(eur0(nk.gebuehren.grundschuldbetrag))} />
      <Zeile label={t.grundbuch} wert={eur0(nk.gebuehren.zeileGrundbuch)} testId="nk-grundbuch" info={t.grundbuchInfo} />
      {nk.maklerProzent > 0 && <Zeile label={t.makler(prozent(nk.maklerProzent, 2))} wert={eur0(nk.makler)} />}
      <div className="border-t border-border/60"><Zeile label={t.gesamt} wert={mitSanierungsabzug ? t.gesamtAufBasis(eur0(nk.summe), prozent(nk.prozentGesamt, 2), eur0(nk.basis)) : t.gesamtVomKaufpreis(eur0(nk.summe), prozent(nk.prozentGesamt, 2))} fett testId="nk-gesamt" /></div>
      <Hinweis>
        {mitSanierungsabzug ? t.nebenkostenOhneSanierung : ""}
        {t.nebenkostenHinweis}
        {k.nebenkostenTraegtVerkaeufer ? t.nebenkostenVerkaeufer : ""}
      </Hinweis>
    </div>
  );

  const monatKarte = (
    <div className={KARTE} data-testid="karte-monat">
      <KartenTitel rechts={
        <Select value={String(annahmen.betrachtungsjahr)} onValueChange={(v) => setze({ betrachtungsjahr: Number(v) })}>
          <SelectTrigger aria-label={t.betrachtungsjahr} className="h-8 w-28 text-xs" data-testid="betrachtungsjahr"><SelectValue /></SelectTrigger>
          <SelectContent>{betrachtungsjahre.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}</SelectContent>
        </Select>
      }>{t.monatTitel(m.kalenderjahr)}</KartenTitel>
      <p className="-mt-2 mb-2 text-xs text-muted-foreground" data-testid="monat-text">{monatText}</p>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.einnahmen}</div>
      <Zeile label={t.mieteinnahmen} wert={eur0(m.miete)} wertKlasse={GRUEN} testId="monat-miete" />
      <Zeile label={t.steuervorteil} wert={eur0(m.steuervorteil)} wertKlasse={GRUEN} testId="monat-steuervorteil" info={annahmen.lohnsteuerermaessigung ? t.steuervorteilLohnsteuer : t.steuervorteilFolgejahr} />
      <div className="border-t border-border/60"><Zeile label={t.einnahmenGesamt} wert={eur0(m.einnahmen)} fett testId="monat-einnahmen" /></div>
      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.ausgaben}</div>
      <Zeile label={t.finanzierungZinsTilgung} wert={eur0(m.zinsUndTilgung)} testId="monat-rate" info={t.zinsUndTilgungInfo(eur0(m.zins), eur0(m.tilgung))} />
      {annahmen.mietverwaltungEinrechnen && <Zeile label={t.sevMietverwaltung} wert={eur0(m.mietverwaltung)} testId="monat-sev" />}
      <Zeile label={t.ruecklage} wert={m.ruecklage > 0 ? eur0(m.ruecklage) : t.imHausgeld} testId="monat-ruecklage" info={kundenModus ? t.ruecklageInfo : "Das CRM führt die Rücklage nicht getrennt, sie steckt im nicht umlagefähigen Hausgeld."} />
      <Zeile label={t.hausgeldNichtUmlagefaehig} wert={eur0(m.hausgeldNichtUmlegbar)} testId="monat-hausgeld" info={t.hausgeldNichtUmlagefaehigInfo} />
      {m.leerstand > 0 && <Zeile label={t.mietausfall} wert={eur0(m.leerstand)} />}
      <div className="border-t border-border/60"><Zeile label={t.ausgabenGesamt} wert={eur0(m.ausgaben)} fett wertKlasse={ROT} testId="monat-ausgaben" /></div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3">
        <span className="font-semibold">{m.eigenanteil >= 0 ? t.monatlicheEigeninvestition : t.monatlicherUeberschuss}</span>
        <span className={cn("text-xl font-semibold tabular-nums", BLAU)} data-testid="monat-eigenanteil">{eur0(Math.abs(m.eigenanteil))}</span>
      </div>
    </div>
  );

  const entwicklungKarte = (
    <div className={cn(KARTE, "md:col-span-2")} data-testid="karte-entwicklung">
      <KartenTitel rechts={kundenModus ? undefined : <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to={exposePfad(objekt.id, w.id)} target="_blank" rel="noopener noreferrer">Vermögensaufbau im Exposé</Link></Button>}>{t.entwicklung}</KartenTitel>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Zeile label={t.restschuld10} wert={eur0(restschuld10)} testId="restschuld-10" />
          <Zeile label={t.volltilgung} wert={f.volltilgungImJahr ? t.imJahr(f.volltilgungImJahr) : t.nichtInnerhalb(ergebnis.jahresreihe.length)} testId="volltilgung" />
          <Zeile label={t.traegtSich} wert={ergebnis.kennzahlen.breakEvenJahr ? t.traegtSichAb(ergebnis.kennzahlen.breakEvenJahr) : t.nichtInnerhalb(ergebnis.jahresreihe.length)} testId="break-even" info={t.traegtSichInfo} />
        </div>
        <div>
          {ergebnis.vermoegensaufbau.map((h) => (
            <Zeile key={h.jahre} label={t.vermoegenNach(h.jahre)} wert={`${eur0(h.vermoegen)}${h.eigenkapitalrenditeProzent != null ? t.jeJahr(prozent(h.eigenkapitalrenditeProzent, 1)) : ""}`} testId={`vermoegen-${h.jahre}`}
              info={t.vermoegenInfo(eur0(h.immobilienwert), eur0(h.restschuld), eur0(h.kumCashflow), eur0(h.eigenkapitaleinsatz))} />
          ))}
          {ergebnis.vermoegensaufbau.length === 0 && <p className="text-sm text-muted-foreground">{t.vermoegenErstAb(VERMOEGENS_HORIZONTE[0])}</p>}
        </div>
      </div>
      <Collapsible open={verlaufOffen} onOpenChange={setVerlaufOffen} className="mt-3">
        <CollapsibleTrigger asChild>
          <button type="button" className="text-xs font-semibold text-primary hover:underline" data-testid="verlauf-toggle">
            {verlaufOffen ? t.verlaufAusblenden : t.verlaufAnzeigen}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="max-h-80 overflow-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide">{t.spalten.jahr}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.miete}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.zins}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.tilgung}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.steuer}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.cashflow}</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.spalten.restschuld}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ergebnis.jahresreihe.map((j) => (
                  <TableRow key={j.kalenderjahr} data-testid={`verlauf-${j.kalenderjahr}`}>
                    <TableCell className="py-1.5 font-medium">{j.kalenderjahr}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{eur0(j.mieteNetto)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{eur0(j.zinsen)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{eur0(j.tilgung)}</TableCell>
                    <TableCell className={cn("py-1.5 text-right tabular-nums", j.steuerwirkungZahlungswirksam > 0 ? GRUEN : j.steuerwirkungZahlungswirksam < 0 ? ROT : "")}>{eur0(j.steuerwirkungZahlungswirksam)}</TableCell>
                    <TableCell className={cn("py-1.5 text-right font-medium tabular-nums", j.cashflow >= 0 ? GRUEN : ROT)}>{eur0(j.cashflow)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{eur0(j.restschuldEnde)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Hinweis>{t.cashflowHinweis}</Hinweis>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="einheit-finanzen">
      {kundenModus ? (
        // Der Satz „Beispielrechnung mit Standardannahmen, keine Finanzierungszusage“
        // steht in der Kundenansicht schon hervorgehoben über dem Reiter.
        <ReiterZweck>{t.zweckKunde}</ReiterZweck>
      ) : (
        <ReiterZweck>
          Schnelle Musterrechnung für diese Einheit mit Standardannahmen, ideal fürs erste Gespräch. Für einen bestimmten
          Kunden, mit den Daten aus Kundenprofil und Selbstauskunft, nimmst du die Investmentkalkulation.
        </ReiterZweck>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!parameterOffen ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setParameterOffen(true)} data-testid="parameter-oeffnen"><Calculator className="h-4 w-4" /> {t.parameter}</Button>
        ) : <span />}
        <p className="text-xs text-muted-foreground">
          {kundenModus
            ? t.kopfKunde
            : "Modellrechnung mit Standardannahmen, Kaltmiete und AfA aus der Einheit, Bundesland aus der Adresse. Jede Änderung rechnet sofort neu. Gespeichert wird im Exposé."}
        </p>
      </div>
      <div className={cn("grid gap-4 lg:items-start", parameterOffen && "lg:grid-cols-[minmax(300px,360px)_1fr] 2xl:grid-cols-[minmax(320px,400px)_1fr]")}>
        {parameterOffen && panel}
        <div className="grid gap-4 md:grid-cols-2">
          {finanzierungsuebersicht}
          {kaufpreisKarte}
          {sanierungKarte}
          {nebenkostenKarte}
          {monatKarte}
          {entwicklungKarte}
        </div>
      </div>
    </div>
  );
}
