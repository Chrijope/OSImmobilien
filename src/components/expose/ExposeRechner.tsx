import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InfoSymbol } from "@/components/objektseite/Bausteine";
import {
  berechneExpose,
  businessCase,
  monatsuebersicht,
  VERMOEGENS_HORIZONTE,
  type BusinessCaseZeile,
  type ExposeErgebnis,
  type ExposeHorizont,
  type ExposeKauf,
  type ExposeObjektdaten,
  type MonatspostenId,
} from "@/lib/exposeRechner";
import { ANNAHMEN_GRENZEN, eigenkapitalProzentAusBetrag, type ExposeAnnahmen, type Instandhaltungsart } from "@/lib/exposeAnnahmen";
import { eur0, dez, prozent } from "@/lib/objektKennzahlen";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeRechnerTexte, rechnerHinweis, type ExposeRechnerTexte } from "@/lib/exposeRechnerTexte";
import type { Sprache } from "@/lib/seitenSprache";
import "./exposeRechner.css";

/**
 * Abschnitt Wirtschaftlichkeit, aufgebaut wie die Invenio-Vorlage (Christian,
 * 23.09.2026), in dieser Reihenfolge:
 *   1. Business Case mit Gesamtinvestition und Gesamteigenkapitaleinsatz
 *   2. Finanzierungsparameter (Eigenkapital, Zins, Tilgung, Einkommen)
 *   3. Betrachtungsjahr und Monatsübersicht bis zur monatlichen Eigeninvestition
 *   4. Vermögensaufbau zum Aufklappen: Reiter 10 bis 40 Jahre, Schaubild,
 *      jährliche Eigenkapitalrendite
 *   5. Sanierung (nur mit Sanierungsdaten) und Vermögensaufbau nach n Jahren
 *
 * Alle Zahlen kommen aus berechneExpose und den Aufbereitungen businessCase
 * und monatsuebersicht; hier steht nur Darstellung und Bedienung. Die
 * Annahmen liegen beim Aufrufer (Seite oder Kundenlink), damit „Annahmen
 * speichern", die Sperre und die neutralen Werte im Kundenlink dort
 * entschieden werden. Gestaltung in exposeRechner.css.
 */

/**
 * „ %" mit geschütztem Leerzeichen, damit auf dem Handy nichts einzeln in die
 * nächste Zeile rutscht. Auf Englisch ohne Leerzeichen („3.0%“). „p. a.“ steht
 * in den Texten (`proJahr`).
 */
const pz = (wert: number, sprache: Sprache = "de") => (sprache === "en" ? `${dez(wert, 1, sprache)}%` : `${dez(wert, 1)}\u00a0%`);

/** Eine Zahl vor „ %“ in einem Satz: „3,5“ auf Deutsch, „3.5“ auf Englisch. */
const zahl = (wert: number, stellen: number, sprache: Sprache) => dez(wert, stellen, sprache);

export type AnnahmenHerkunftKarte = Partial<Record<keyof ExposeAnnahmen, "selbstauskunft" | "objekt">>;

export interface ExposeRechnerProps {
  objektdaten: ExposeObjektdaten;
  annahmen: ExposeAnnahmen;
  onAnnahmen: (aenderung: Partial<ExposeAnnahmen>) => void;
  /** Woher ein Wert kommt, für die Kennzeichnung „aus der Selbstauskunft". */
  herkunft: AnnahmenHerkunftKarte;
  /** Liquides Eigenkapital laut Selbstauskunft, nur zur Anzeige. */
  eigenkapitalEuro?: number;
  /** Regler festgesetzt, etwa im Kundenlink mit gesperrten Annahmen. */
  gesperrt?: boolean;
  /** Rechts im Kopf der Parameter-Karte, etwa Speichern und Sperre. */
  kopfRechts?: ReactNode;
  /** Für Tests und das PDF: das Ergebnis nach außen reichen. */
  onErgebnis?: (ergebnis: ExposeErgebnis) => void;
  kaufpreisLabel?: string;
}

export function HerkunftChip({ art }: { art?: "selbstauskunft" | "objekt" }) {
  const t = exposeRechnerTexte(useAnzeigeSprache());
  if (!art) return null;
  return (
    <Badge variant="outline" className="ml-1.5 border-primary/30 bg-accent px-1.5 py-0 text-[10px] font-semibold text-primary" data-testid="herkunft-chip">
      {art === "selbstauskunft" ? t.herkunftSelbstauskunft : t.herkunftObjekt}
    </Badge>
  );
}

/** Regler mit Beschriftung, Wertanzeige und Grenztexten. Die Einheiten-Seite nutzt ihn im Reiter Finanzen. */
export function Regler({ label, wert, anzeige, min, max, schritt, onChange, herkunft, disabled, minText, maxText, testId }: {
  label: string; wert: number; anzeige: string; min: number; max: number; schritt: number;
  onChange: (v: number) => void; herkunft?: "selbstauskunft" | "objekt"; disabled?: boolean;
  minText: string; maxText: string; testId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex flex-wrap items-center">{label}<HerkunftChip art={herkunft} /></span>
        <span className="whitespace-nowrap tabular-nums" data-testid={`${testId}-wert`}>{anzeige}</span>
      </div>
      <Slider
        className="mt-2"
        aria-label={label}
        data-testid={testId}
        min={min} max={max} step={schritt}
        value={[Math.min(max, Math.max(min, wert))]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{minText}</span><span>{maxText}</span></div>
    </div>
  );
}

/** Eine Zeile Beschriftung links, Wert rechts. `wertKlasse` färbt den Wert, etwa grün für Einnahmen. */
export function Zeile({ label, wert, fett, info, testId, wertKlasse }: { label: ReactNode; wert: string; fett?: boolean; info?: string; testId?: string; wertKlasse?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", fett && "font-semibold")}>
      <span className={cn("flex items-center gap-1", !fett && "text-muted-foreground")}>{label}{info && <InfoSymbol text={info} />}</span>
      <span className={cn("whitespace-nowrap tabular-nums", wertKlasse)} data-testid={testId}>{wert}</span>
    </div>
  );
}

// ── Bausteine im Stil der Vorlage ───────────────────────────────────────────

/** Regler der Exposé-Ansicht: Wert rechts im Kopf, im Druck nur Beschriftung und Wert. */
function WkRegler({ label, wert, anzeige, min, max, schritt, onChange, herkunft, disabled, minText, maxText, testId, darunter }: {
  label: string; wert: number; anzeige: ReactNode; min: number; max: number; schritt: number;
  onChange: (v: number) => void; herkunft?: "selbstauskunft" | "objekt"; disabled?: boolean;
  minText?: string; maxText?: string; testId: string; darunter?: ReactNode;
}) {
  return (
    <div className="wk-regler">
      <div className="wk-regler-kopf">
        <span className="wk-regler-label">{label}<HerkunftChip art={herkunft} /></span>
        <span className="wk-regler-wert" data-testid={`${testId}-wert`}>{anzeige}</span>
      </div>
      <Slider
        className="wk-regler-bahn"
        aria-label={label}
        data-testid={testId}
        min={min} max={max} step={schritt}
        value={[Math.min(max, Math.max(min, wert))]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
      {(minText || maxText) && <div className="wk-regler-grenzen"><span>{minText}</span><span>{maxText}</span></div>}
      {darunter}
    </div>
  );
}

/** Schalter mit Beschriftung. Im Druck fehlt der Schalter selbst, deshalb steht dort „ja" oder „nein". */
function WkSchalter({ label, checked, onChange, disabled, testId, herkunft }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string; herkunft?: "selbstauskunft" | "objekt";
}) {
  const t = exposeRechnerTexte(useAnzeigeSprache());
  return (
    <label className="wk-schalter">
      {/* Ohne data-no-min: Die Handyregeln in index.css lassen Schalter seit dem 23.09.2026 von selbst in Ruhe. */}
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} data-testid={testId} />
      <span>{label}<HerkunftChip art={herkunft} /><span className="wk-nur-druck">: {checked ? t.ja : t.nein}</span></span>
    </label>
  );
}

/** Beschriftung einer Zeile im Business Case. */
function businessCaseLabel(z: BusinessCaseZeile, k: ExposeKauf, t: ExposeRechnerTexte, sprache: Sprache, kaufpreisLabel?: string): string {
  switch (z.id) {
    case "kaufpreis": return kaufpreisLabel || t.bcKaufpreis;
    case "preisanpassung": return t.bcPreisanpassung(`${k.preisanpassungProzent > 0 ? "+" : ""}${sprache === "en" ? `${dez(k.preisanpassungProzent, 1, sprache)}%` : `${dez(k.preisanpassungProzent, 1)} %`}`);
    case "stellplatz": return t.bcStellplatz;
    case "gesamtinvestition": return t.bcGesamtinvestition;
    case "nebenkosten": return k.nebenkostenTraegtVerkaeufer ? t.bcNebenkostenVerkaeufer : t.bcNebenkosten;
    case "eigenkapital": return t.bcEigenkapital;
    case "eigenkapitalersatz": return t.bcEigenkapitalersatz;
    case "gesamteigenkapital": return t.bcGesamteigenkapital;
  }
}

const BUSINESS_CASE_TESTID: Partial<Record<BusinessCaseZeile["id"], string>> = {
  kaufpreis: "bc-kaufpreis",
  stellplatz: "bc-stellplatz",
  gesamtinvestition: "gesamtinvestition",
  nebenkosten: "nebenkosten",
  eigenkapital: "bc-eigenkapital",
  eigenkapitalersatz: "bc-eigenkapitalersatz",
  gesamteigenkapital: "eigenkapitaleinsatz",
};

function monatspostenLabel(id: MonatspostenId, t: ExposeRechnerTexte): string {
  const labels: Record<MonatspostenId, string> = {
    miete: t.monatMiete,
    steuervorteil: t.monatSteuervorteil,
    finanzierung: t.monatFinanzierung,
    ruecklagen: t.monatRuecklagen,
    bewirtschaftung: t.monatBewirtschaftung,
    hausgeld: t.monatHausgeld,
    mietverwaltung: t.monatMietverwaltung,
    mietausfall: t.monatMietausfall,
  };
  return labels[id];
}

const MONATSPOSTEN_TESTID: Record<MonatspostenId, string> = {
  miete: "monat-miete",
  steuervorteil: "monat-steuervorteil",
  finanzierung: "monat-rate",
  ruecklagen: "monat-ruecklagen",
  bewirtschaftung: "monat-bewirtschaftung",
  hausgeld: "monat-hausgeld",
  mietverwaltung: "monat-mietverwaltung",
  mietausfall: "monat-mietausfall",
};

/** Hinweis unter dem Betrachtungsjahr, wie „Werte ab Dezember 2026" in der Vorlage. */
function monatsHinweis(startjahr: number, betrachtungsjahr: number, t: ExposeRechnerTexte, heute = new Date()): string {
  if (betrachtungsjahr !== startjahr || startjahr !== heute.getFullYear()) return t.werteImJahr(betrachtungsjahr);
  return t.werteAb(t.monate[Math.min(11, heute.getMonth() + 1)], startjahr);
}

/**
 * Schaubild „Vermögensaufbau mit einer Immobilie als Kapitalanlage": links der
 * Kaufpreis, drei Wege nach rechts zu Immobilienwert, Ertrag bei Verkauf und
 * Restschuld. Ab Tabletbreite als SVG (skaliert gleichmäßig, damit die
 * schrägen Beschriftungen auf ihren Linien bleiben), auf dem Handy dieselben
 * Werte untereinander.
 */
function Schaubild({ h, wertsteigerungProzent, tilgungProzent, mitStellplatz }: {
  h: ExposeHorizont; wertsteigerungProzent: number; tilgungProzent: number; mitStellplatz: boolean;
}) {
  const sprache = useAnzeigeSprache();
  const t = exposeRechnerTexte(sprache);
  const e = (n: number) => eur0(n, sprache);
  const titelId = useId();
  const wertsteigerung = `${pz(wertsteigerungProzent, sprache)} ${t.proJahr}`;
  const tilgung = `${pz(tilgungProzent, sprache)} ${t.proJahr}`;
  // Winkel der schrägen Linien von (212|150) nach (628|44) und (628|256).
  const winkel = (Math.atan2(106, 416) * 180) / Math.PI;
  return (
    <div className="wk-diagramm" data-testid="vermoegen-diagramm">
      <svg className="wk-diagramm-svg" viewBox="0 0 900 300" role="img" aria-labelledby={titelId}>
        <title id={titelId}>{t.schaubildTitel(e(h.kaufpreisHeute), h.jahre, e(h.immobilienwert), e(h.restschuld), e(h.ertragBeiVerkauf))}</title>
        <path className="wk-svg-linie" d="M212 150 L628 44" />
        <path className="wk-svg-linie" d="M212 150 L628 256" />
        <path className="wk-svg-linie-haupt" d="M212 150 H628" />
        <text className="wk-svg-weg" x="420" y="97" dy="-10" textAnchor="middle" transform={`rotate(${-winkel} 420 97)`}>{`${t.svgWertsteigerung} ${wertsteigerung.toUpperCase()}`}</text>
        <text className="wk-svg-jahre" x="420" y="138" textAnchor="middle" data-testid="va-jahre">{`${h.jahre} ${t.svgJahre}`}</text>
        <text className="wk-svg-weg" x="420" y="203" dy="21" textAnchor="middle" transform={`rotate(${winkel} 420 203)`}>{`${t.svgTilgung} ${tilgung.toUpperCase()}`}</text>

        <rect className="wk-kasten-neutral" x="0" y="104" width="200" height="92" rx="8" />
        <text className="wk-svg-label" x="100" y="136" textAnchor="middle">{t.svgKaufpreis}</text>
        <text className="wk-svg-betrag" x="100" y={mitStellplatz ? 165 : 170} textAnchor="middle" data-testid="va-kaufpreis">{e(h.kaufpreisHeute)}</text>
        {mitStellplatz && <text className="wk-svg-label" x="100" y="185" textAnchor="middle">{t.svgInklStellplatz}</text>}

        <rect className="wk-kasten-blau" x="640" y="6" width="260" height="76" rx="8" />
        <text className="wk-svg-label" x="884" y="34" textAnchor="end">{t.svgImmobilienwert}</text>
        <text className="wk-svg-betrag" x="884" y="66" textAnchor="end" data-testid="va-immobilienwert">{e(h.immobilienwert)}</text>

        <rect className="wk-kasten-positiv" x="640" y="104" width="260" height="92" rx="8" />
        <text className="wk-svg-label wk-svg-label-dunkel" x="884" y="136" textAnchor="end">{t.svgErtragBeiVerkauf}</text>
        <text className="wk-svg-betrag wk-betrag-positiv" x="884" y="174" textAnchor="end" data-testid="ertrag-verkauf">{e(h.ertragBeiVerkauf)}</text>

        <rect className="wk-kasten-neutral" x="640" y="218" width="260" height="76" rx="8" />
        <text className="wk-svg-label" x="884" y="246" textAnchor="end">{t.svgRestschuld}</text>
        <text className="wk-svg-betrag" x="884" y="278" textAnchor="end" data-testid="va-restschuld">{e(h.restschuld)}</text>
      </svg>
      <div className="wk-diagramm-mobil">
        <div className="wk-mobil-kasten wk-kasten-neutral"><span>{mitStellplatz ? t.mobilKaufpreisStellplatz : t.mobilKaufpreis}</span><strong>{e(h.kaufpreisHeute)}</strong></div>
        <div className="wk-mobil-weg">{t.mobilWeg(h.jahre, wertsteigerung, tilgung)}</div>
        <div className="wk-mobil-kasten wk-kasten-blau"><span>{t.immobilienwert}</span><strong>{e(h.immobilienwert)}</strong></div>
        <div className="wk-mobil-kasten wk-kasten-neutral"><span>{t.restschuld}</span><strong>{e(h.restschuld)}</strong></div>
        <div className="wk-mobil-kasten wk-kasten-positiv"><span>{t.ertragBeiVerkauf}</span><strong className="wk-betrag-positiv">{e(h.ertragBeiVerkauf)}</strong></div>
      </div>
    </div>
  );
}

// ── Abschnitt ───────────────────────────────────────────────────────────────

export function ExposeRechner(p: ExposeRechnerProps) {
  const { annahmen, onAnnahmen, herkunft, gesperrt } = p;
  const sprache = useAnzeigeSprache();
  const t = exposeRechnerTexte(sprache);
  const eur = (n: number) => eur0(n, sprache);
  const pr = (n: number, stellen: number) => prozent(n, stellen, sprache);
  const ergebnis = useMemo(() => berechneExpose(p.objektdaten, annahmen), [p.objektdaten, annahmen]);
  const { onErgebnis } = p;
  useEffect(() => { onErgebnis?.(ergebnis); }, [ergebnis, onErgebnis]);
  const [horizont, setHorizont] = useState<number>(10);
  const [alleOffen, setAlleOffen] = useState(false);
  const [vermoegenOffen, setVermoegenOffen] = useState(true);
  const g = ANNAHMEN_GRENZEN;
  const k = ergebnis.kauf;
  const st = ergebnis.steuer;
  const bc = businessCase(ergebnis);
  const mu = monatsuebersicht(ergebnis.monat);
  const h = ergebnis.vermoegensaufbau.find((x) => x.jahre === horizont) ?? ergebnis.vermoegensaufbau[0];
  const anzahlSa = Object.values(herkunft).filter((v) => v === "selbstauskunft").length;
  const eigenkapitalBetrag = k.gesamtinvestition * (annahmen.eigenkapitalProzent / 100);
  const nk = k.nebenkosten;
  const nkInfo = t.nkInfo({
    prozentGesamt: zahl(nk.prozentGesamt, 1, sprache),
    grunderwerbsteuer: zahl(nk.grunderwerbsteuerProzent, 1, sprache),
    bundesland: nk.bundeslandName,
    notarGrundbuch: zahl(nk.notarGrundbuchProzent, 1, sprache),
    makler: nk.maklerProzent > 0 ? zahl(nk.maklerProzent, 2, sprache) : null,
    quelle: nk.quelle === "manuell" ? "manuell" : nk.quelle === "mittelwert" ? "mittelwert" : "bundesland",
    verkaeuferBetrag: k.nebenkostenTraegtVerkaeufer ? eur(nk.summe) : null,
  });
  const sanierung = st.sanierungsanteil > 0;
  const fertigstellung = p.objektdaten.sanierungFertigstellungJahr;
  const art = annahmen.instandhaltungsart;
  const ersparnisSatz = st.sanierungsanteil > 0 ? (st.einmaligeSteuerersparnisSanierung / st.sanierungsanteil) * 100 : 0;
  const eigen = mu.eigeninvestition;
  const faktor = h?.faktorJeEuro ?? null;
  const rendite = h?.eigenkapitalrenditeProzent ?? null;

  const instandhaltungLabel: Record<Instandhaltungsart, string> = {
    keine: t.instandhaltungKeine,
    erhaltungsaufwand: t.instandhaltungErhaltungsaufwand,
    werkvertrag: t.instandhaltungWerkvertrag,
  };

  return (
    <div className="wk" lang={sprache} data-testid="expose-rechner">
      {/* 1. Business Case */}
      <div className="wk-bc" data-testid="business-case">
        <h3 className="wk-bc-titel" data-testid="business-case-titel">{t.businessCaseTitel(zahl(bc.finanzierungsquoteProzent, 1, sprache))}</h3>
        <div className="wk-bc-tabelle">
          {bc.zeilen.map((z) => (
            <div key={z.id} className={cn("wk-bc-zeile", z.summe && "wk-summe")}>
              <span className="wk-info">
                {businessCaseLabel(z, k, t, sprache, p.kaufpreisLabel)}
                {/* Die Gesamtinvestition ist Kaufpreis plus Stellplatz. Wer hier liest,
                    soll nicht annehmen, die Nebenkosten seien schon enthalten. */}
                {z.id === "gesamtinvestition" && !k.nebenkostenTraegtVerkaeufer && (
                  <span className="wk-klein" data-testid="gesamtinvestition-zusatz">{t.gesamtinvestitionZusatz}</span>
                )}
                {z.id === "nebenkosten" && <InfoSymbol text={nkInfo} />}
                {z.id === "eigenkapitalersatz" && <InfoSymbol text={t.eigenkapitalersatzInfo} />}
              </span>
              <span className={cn("wk-betrag", z.summe && "wk-betrag-stark")} data-testid={BUSINESS_CASE_TESTID[z.id]}>{eur(z.betrag)}</span>
            </div>
          ))}
        </div>
        <div className="wk-klein wk-bc-darlehen">{t.darlehen} <span className="wk-betrag" data-testid="darlehen">{eur(bc.darlehen)}</span></div>
      </div>

      {/* 2. Finanzierungsparameter */}
      <div className="wk-karte" data-testid="finanzierungsparameter">
        <div className="wk-karte-kopf">
          <span>{t.finanzierungsparameter}<span className="wk-nur-bildschirm">{t.finanzierungsparameterZusatz}</span></span>
          <div className="wk-karte-kopf-rechts">
            {anzahlSa > 0 && <Badge variant="outline" className="border-primary/30 bg-accent text-primary" data-testid="anzahl-selbstauskunft">{t.anzahlSelbstauskunft(anzahlSa)}</Badge>}
            {p.kopfRechts}
          </div>
        </div>
        <div className="wk-karte-inhalt">
          {gesperrt && <div className="wk-klein" style={{ marginBottom: 16 }}>{t.gesperrt}</div>}
          <div className="wk-drei">
            <WkRegler label={t.eigenkapital} testId="regler-eigenkapital" herkunft={herkunft.eigenkapitalProzent} disabled={gesperrt}
              wert={annahmen.eigenkapitalProzent} anzeige={pr(annahmen.eigenkapitalProzent, 2)}
              min={g.eigenkapitalProzent.min} max={g.eigenkapitalProzent.max} schritt={g.eigenkapitalProzent.schritt}
              onChange={(v) => onAnnahmen({ eigenkapitalProzent: v })}
              darunter={(
                // Ohne Eigenkapital sagt „0,00 %" alles; ein gedrucktes „Betrag 0 €" sähe nach einer fehlenden Angabe aus.
                <label className={cn("wk-betragfeld", eigenkapitalBetrag < 0.5 && "wk-nur-bildschirm")}>
                  <span>{t.betrag}</span>
                  <input
                    type="number" inputMode="numeric" min={0} max={Math.round(k.gesamtinvestition)} step={1000}
                    value={Math.round(eigenkapitalBetrag)} disabled={gesperrt}
                    aria-label={t.eigenkapitalInEuro} data-testid="eigenkapital-betrag"
                    onChange={(e) => {
                      const betrag = Number(e.target.value);
                      onAnnahmen({ eigenkapitalProzent: eigenkapitalProzentAusBetrag(Number.isFinite(betrag) ? betrag : 0, k.gesamtinvestition) });
                    }}
                  />
                  <span className="wk-nur-bildschirm">€</span>
                  {eigenkapitalBetrag >= 0.5 && <span className="wk-nur-druck wk-betrag">{eur(eigenkapitalBetrag)}</span>}
                </label>
              )} />
            <WkRegler label={t.zinssatz} testId="regler-zins" disabled={gesperrt}
              wert={annahmen.zinsProzent} anzeige={pr(annahmen.zinsProzent, 2)}
              min={g.zinsProzent.min} max={g.zinsProzent.max} schritt={g.zinsProzent.schritt}
              onChange={(v) => onAnnahmen({ zinsProzent: v })} />
            <WkRegler label={t.tilgung} testId="regler-tilgung" disabled={gesperrt}
              wert={annahmen.tilgungProzent} anzeige={pr(annahmen.tilgungProzent, 2)}
              min={g.tilgungProzent.min} max={g.tilgungProzent.max} schritt={g.tilgungProzent.schritt}
              onChange={(v) => onAnnahmen({ tilgungProzent: v })} />
          </div>
          {typeof p.eigenkapitalEuro === "number" && p.eigenkapitalEuro > 0 && (
            <div className="wk-klein" style={{ marginTop: 12 }}>{t.selbstauskunftEigenkapital(eur(p.eigenkapitalEuro))}</div>
          )}

          <div className="wk-trenner" />
          <div className="wk-steuer">
            <div className="wk-steuer-kopf">
              <span className="wk-regler-label">{t.zvE}<HerkunftChip art={herkunft.zvE} /></span>
              <WkSchalter label={t.verheiratet} testId="schalter-verheiratet" herkunft={herkunft.verheiratet} disabled={gesperrt}
                checked={annahmen.verheiratet} onChange={(v) => onAnnahmen({ verheiratet: v })} />
              <span className="wk-regler-wert" data-testid="regler-zve-wert">{eur(annahmen.zvE)}</span>
            </div>
            <Slider
              className="wk-regler-bahn"
              aria-label={t.zvE}
              data-testid="regler-zve"
              min={g.zvE.min} max={g.zvE.max} step={g.zvE.schritt}
              value={[Math.min(g.zvE.max, Math.max(g.zvE.min, annahmen.zvE))]}
              onValueChange={(v) => onAnnahmen({ zvE: v[0] })}
              disabled={gesperrt}
            />
            <div className="wk-klein" data-testid="grenzsteuersatz">
              {t.grenzsteuersatz(zahl(st.grenzsteuersatzProzent, 1, sprache), !!st.grenzsteuersatzManuell, st.steuerjahr)}
            </div>
            <div className="wk-schalterzeile">
              <WkSchalter label={t.lohnsteuer} testId="schalter-lohnsteuer" disabled={gesperrt}
                checked={annahmen.lohnsteuerermaessigung} onChange={(v) => onAnnahmen({ lohnsteuerermaessigung: v })} />
              <InfoSymbol text={t.lohnsteuerInfo} />
            </div>
          </div>

          <div className="wk-trenner" />
          <div className="wk-wachstum" data-testid="wachstumsannahmen">
            {t.wachstum(pz(annahmen.mietsteigerungProzent, sprache), pz(annahmen.kostensteigerungProzent, sprache), pz(annahmen.wertsteigerungProzent, sprache), t.proJahr)}
          </div>
          <div className="wk-nur-druck-block wk-klein wk-mitte" style={{ marginTop: 4 }}>
            {t.weitereAnnahmen({
              leerstand: zahl(annahmen.leerstandProzent, 1, sprache),
              afa: zahl(annahmen.afaProzent, 1, sprache),
              sonderAfa: !!annahmen.sonderAfa,
              mietverwaltung: !!annahmen.mietverwaltungEinrechnen,
              makler: k.nebenkosten.maklerProzent > 0 ? zahl(k.nebenkosten.maklerProzent, 2, sprache) : null,
              preisanpassung: k.preisanpassungProzent !== 0 ? zahl(k.preisanpassungProzent, 1, sprache) : null,
            })}
          </div>
          <Collapsible open={alleOffen} onOpenChange={setAlleOffen} className="wk-alle">
            <CollapsibleTrigger asChild>
              <button type="button" className="wk-link" data-testid="alle-annahmen">
                {alleOffen ? t.wenigerAnzeigen : gesperrt ? t.alleAnsehen : t.alleAnpassen}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="wk-alle-inhalt">
              <WkRegler label={t.mietsteigerung} testId="regler-mietsteigerung" disabled={gesperrt} wert={annahmen.mietsteigerungProzent} anzeige={pr(annahmen.mietsteigerungProzent, 1)}
                min={g.mietsteigerungProzent.min} max={g.mietsteigerungProzent.max} schritt={g.mietsteigerungProzent.schritt} minText={pr(0, 0)} maxText={pr(5, 0)} onChange={(v) => onAnnahmen({ mietsteigerungProzent: v })} />
              <WkRegler label={t.kostensteigerung} testId="regler-kostensteigerung" disabled={gesperrt} wert={annahmen.kostensteigerungProzent} anzeige={pr(annahmen.kostensteigerungProzent, 1)}
                min={g.kostensteigerungProzent.min} max={g.kostensteigerungProzent.max} schritt={g.kostensteigerungProzent.schritt} minText={pr(0, 0)} maxText={pr(5, 0)} onChange={(v) => onAnnahmen({ kostensteigerungProzent: v })} />
              <WkRegler label={t.wertentwicklung} testId="regler-wertentwicklung" disabled={gesperrt} wert={annahmen.wertsteigerungProzent} anzeige={pr(annahmen.wertsteigerungProzent, 1)}
                min={g.wertsteigerungProzent.min} max={g.wertsteigerungProzent.max} schritt={g.wertsteigerungProzent.schritt} minText={pr(0, 0)} maxText={pr(5, 0)} onChange={(v) => onAnnahmen({ wertsteigerungProzent: v })} />
              <WkRegler label={t.leerstand} testId="regler-leerstand" disabled={gesperrt} wert={annahmen.leerstandProzent} anzeige={pr(annahmen.leerstandProzent, 1)}
                min={g.leerstandProzent.min} max={g.leerstandProzent.max} schritt={g.leerstandProzent.schritt} minText={pr(0, 0)} maxText={pr(10, 0)} onChange={(v) => onAnnahmen({ leerstandProzent: v })} />
              <WkRegler label={t.maklerprovision} testId="regler-makler" disabled={gesperrt} wert={annahmen.maklerProzent} anzeige={pr(annahmen.maklerProzent, 2)}
                min={g.maklerProzent.min} max={g.maklerProzent.max} schritt={g.maklerProzent.schritt} minText={pr(0, 0)} maxText={pr(7.14, 2)} onChange={(v) => onAnnahmen({ maklerProzent: v })} />
              <WkRegler label={t.preisanpassung} testId="regler-preisanpassung" disabled={gesperrt} wert={annahmen.preisanpassungProzent} anzeige={`${annahmen.preisanpassungProzent > 0 ? "+" : ""}${pr(annahmen.preisanpassungProzent, 1)}`}
                min={g.preisanpassungProzent.min} max={g.preisanpassungProzent.max} schritt={g.preisanpassungProzent.schritt} minText={pr(-20, 0)} maxText={`+${pr(20, 0)}`} onChange={(v) => onAnnahmen({ preisanpassungProzent: v })} />
              <WkRegler label={t.afaJeJahr} testId="regler-afa" herkunft={herkunft.afaProzent} disabled={gesperrt} wert={annahmen.afaProzent} anzeige={pr(annahmen.afaProzent, 1)}
                min={g.afaProzent.min} max={g.afaProzent.max} schritt={g.afaProzent.schritt} minText={pr(0, 0)} maxText={pr(10, 0)} onChange={(v) => onAnnahmen({ afaProzent: v })} />
              <WkSchalter label={t.sonderAfa} disabled={gesperrt} checked={annahmen.sonderAfa} onChange={(v) => onAnnahmen({ sonderAfa: v })} />
              <WkSchalter label={t.mietverwaltungEinrechnen} disabled={gesperrt} checked={annahmen.mietverwaltungEinrechnen} onChange={(v) => onAnnahmen({ mietverwaltungEinrechnen: v })} />
              {sanierung && (
                <div>
                  <div className="wk-regler-label" style={{ marginBottom: 6 }}>{t.sanierungSteuerlich}<HerkunftChip art={herkunft.instandhaltungsart} /></div>
                  <Select value={annahmen.instandhaltungsart} onValueChange={(v) => onAnnahmen({ instandhaltungsart: v as Instandhaltungsart })} disabled={gesperrt}>
                    <SelectTrigger aria-label={t.sanierungSteuerlich}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(instandhaltungLabel) as Instandhaltungsart[]).map((a) => <SelectItem key={a} value={a}>{instandhaltungLabel[a]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {annahmen.instandhaltungsart === "erhaltungsaufwand" && (
                    <div style={{ marginTop: 14 }}>
                      <WkRegler label={t.verteiltAufJahre} testId="regler-instandhaltung-jahre" disabled={gesperrt} wert={annahmen.instandhaltungJahre} anzeige={t.jahre(annahmen.instandhaltungJahre)}
                        min={g.instandhaltungJahre.min} max={g.instandhaltungJahre.max} schritt={g.instandhaltungJahre.schritt} minText="1" maxText="5" onChange={(v) => onAnnahmen({ instandhaltungJahre: v })} />
                    </div>
                  )}
                </div>
              )}
              {ergebnis.hinweise.length > 0 && (
                <ul className="wk-klein">
                  {ergebnis.hinweise.map((h) => <li key={h}>{rechnerHinweis(h, sprache)}</li>)}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* 3. Betrachtungsjahr und Monatsübersicht */}
      <div className="wk-jahr-block">
        <div className="wk-jahr">
          <div className="wk-jahr-kopf">
            <span>{t.betrachtungsjahr}</span>
            <strong data-testid="regler-betrachtungsjahr-wert">{annahmen.betrachtungsjahr}</strong>
          </div>
          <Slider
            className="wk-regler-bahn"
            aria-label={t.betrachtungsjahr}
            data-testid="regler-betrachtungsjahr"
            min={annahmen.startjahr} max={annahmen.startjahr + 9} step={1}
            value={[Math.min(annahmen.startjahr + 9, Math.max(annahmen.startjahr, annahmen.betrachtungsjahr))]}
            onValueChange={(v) => onAnnahmen({ betrachtungsjahr: Math.round(v[0]) })}
          />
          <div className="wk-regler-grenzen"><span>{annahmen.startjahr}</span><span>{annahmen.startjahr + 9}</span></div>
          <div className="wk-jahr-hinweis" data-testid="monat-hinweis">{monatsHinweis(annahmen.startjahr, annahmen.betrachtungsjahr, t)}</div>
        </div>
        <div className="wk-monat" data-testid="monatsuebersicht">
          <div className="wk-monat-spalten">
            <div className="wk-monat-spalte" aria-label={t.einnahmen}>
              {mu.einnahmen.map((m) => (
                <div className="wk-posten" key={m.id}>
                  <span className="wk-info">
                    {monatspostenLabel(m.id, t)}
                    {m.id === "steuervorteil" && <InfoSymbol text={annahmen.lohnsteuerermaessigung ? t.steuervorteilMitLohnsteuer : t.steuervorteilOhneLohnsteuer} />}
                  </span>
                  <span className={cn("wk-betrag", m.id === "steuervorteil" && m.betrag > 0.5 && "wk-betrag-positiv")} data-testid={MONATSPOSTEN_TESTID[m.id]}>{eur(m.betrag)}</span>
                </div>
              ))}
            </div>
            <div className="wk-monat-spalte" aria-label={t.ausgaben}>
              {mu.ausgaben.map((m) => (
                <div className="wk-posten" key={m.id}>
                  <span className="wk-info">
                    {monatspostenLabel(m.id, t)}
                    {m.id === "finanzierung" && <InfoSymbol text={t.finanzierungInfo} />}
                    {m.id === "hausgeld" && <InfoSymbol text={t.hausgeldInfo} />}
                    {m.id === "bewirtschaftung" && <InfoSymbol text={t.bewirtschaftungInfo} />}
                    {m.id === "mietausfall" && <InfoSymbol text={t.mietausfallInfo(zahl(annahmen.leerstandProzent, 1, sprache))} />}
                  </span>
                  <span className="wk-betrag" data-testid={MONATSPOSTEN_TESTID[m.id]}>{eur(m.betrag)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wk-monat-summen">
            <div><span>{t.einnahmen}</span><span className="wk-betrag" data-testid="monat-einnahmen">{eur(mu.summeEinnahmen)}</span></div>
            <div><span>{t.ausgaben}</span><span className="wk-betrag" data-testid="monat-ausgaben">{eur(mu.summeAusgaben)}</span></div>
          </div>
          <div className={cn("wk-eigen", eigen >= 0 ? "wk-kasten-blau" : "wk-kasten-positiv")} data-testid="eigeninvestition">
            <span>{eigen >= 0 ? t.eigeninvestition : t.ueberschuss}</span>
            <span className={cn("wk-betrag", eigen >= 0 ? "wk-betrag-stark" : "wk-betrag-positiv")} data-testid="eigenanteil">{eur(Math.abs(eigen))}</span>
          </div>
        </div>
      </div>

      {/* 4. Vermögensaufbau */}
      {h && (
        <details className="wk-aufklapp" open={vermoegenOffen} onToggle={(e) => setVermoegenOffen((e.currentTarget as HTMLDetailsElement).open)} data-testid="vermoegensaufbau">
          <summary>{t.vermoegensaufbau}</summary>
          <div className="wk-reiter" role="tablist" aria-label={t.betrachtungszeitraum}>
            {VERMOEGENS_HORIZONTE.filter((n) => ergebnis.vermoegensaufbau.some((x) => x.jahre === n)).map((n) => (
              <button key={n} type="button" role="tab" aria-selected={horizont === n} onClick={() => setHorizont(n)} data-testid={`horizont-${n}`}>
                {t.reiterJahre(n)}
              </button>
            ))}
          </div>
          <div className="wk-va-titel">{t.vaTitelOben}<span>{t.vaTitelUnten}</span></div>
          <Schaubild h={h} wertsteigerungProzent={annahmen.wertsteigerungProzent} tilgungProzent={ergebnis.finanzierung.tilgungProzent} mitStellplatz={k.stellplatz > 0} />
          <div className="wk-rendite wk-kasten-positiv" data-testid="rendite-streifen">
            <div>
              <div className="wk-rendite-titel">
                {t.ekRendite}
                <InfoSymbol text={t.ekRenditeInfo} />
              </div>
              <div className="wk-klein">{t.anfangsinvestitionMit(eur(h.eigenkapitaleinsatz))}</div>
            </div>
            <div className="wk-rendite-rechts">
              {rendite != null
                ? <div className="wk-rendite-wert wk-betrag wk-betrag-positiv" data-testid="ek-rendite">{pr(rendite, 1)}</div>
                : <div className="wk-klein" data-testid="ek-rendite">{t.ohneEigenkapital}</div>}
              <div className="wk-klein">{t.aufgebautMit(eur(h.vermoegen))}</div>
            </div>
          </div>
        </details>
      )}

      {/* 5. Sanierung und Vermögensaufbau nach n Jahren */}
      {(sanierung || h) && (
        <div className={cn("wk-zwei", !(sanierung && h) && "wk-allein")}>
          {sanierung && (
            <div className="wk-infokarte" data-testid="sanierung-karte">
              <h3>{t.sanierungTitel(fertigstellung)}</h3>
              <div className="wk-infozeile">
                <span className="wk-info">
                  {art === "erhaltungsaufwand" ? t.abzugsfaehig : t.deinAnteil}
                  <InfoSymbol text={t.sanierungInfo({
                    gesamt: (p.objektdaten.sanierungskostenGesamt ?? 0) > 0 ? eur(p.objektdaten.sanierungskostenGesamt ?? 0) : null,
                    anteil: (p.objektdaten.miteigentumsanteilProzent ?? 0) > 0 ? zahl(p.objektdaten.miteigentumsanteilProzent ?? 0, 2, sprache) : null,
                    erhaltungsaufwand: art === "erhaltungsaufwand",
                    jahre: annahmen.instandhaltungJahre,
                    abJahr: st.sanierungAbJahr,
                  })} />
                </span>
                <span className="wk-betrag" data-testid="sanierungsanteil">{eur(st.sanierungsanteil)}</span>
              </div>
              <div className="wk-infozeile wk-schluss">
                <span className="wk-info">
                  {art === "erhaltungsaufwand" ? t.einmaligeErsparnis : art === "werkvertrag" ? t.wirkung : t.steuerlich}
                  {art === "erhaltungsaufwand" && <InfoSymbol text={t.ersparnisInfo(zahl(ersparnisSatz, 0, sprache))} />}
                </span>
                <span className={cn("wk-betrag", art === "erhaltungsaufwand" && st.einmaligeSteuerersparnisSanierung > 0 && "wk-betrag-positiv")} data-testid="einmalige-steuerersparnis">
                  {art === "erhaltungsaufwand" ? `≈ ${eur(st.einmaligeSteuerersparnisSanierung)}` : art === "werkvertrag" ? t.ueberDieAfa : t.nichtAngesetzt}
                </span>
              </div>
              <div className="wk-klein">{t.steuerberaterPrueft}</div>
            </div>
          )}
          {h && (
            <div className="wk-infokarte" data-testid="euro-karte">
              <h3 className="wk-info">
                {t.vermoegenNachJahren(h.jahre)}
                <InfoSymbol text={t.vermoegenInfo(eur(h.ertragBeiVerkauf), eur(h.kumCashflow))} />
              </h3>
              <div className="wk-infozeile"><span>{t.aufgebautesVermoegen}</span><span className="wk-betrag" data-testid="euro-vermoegen">{eur(h.vermoegen)}</span></div>
              <div className="wk-infozeile"><span>{t.anfangsinvestition}</span><span className="wk-betrag" data-testid="euro-eigenkapital">{eur(h.eigenkapitaleinsatz)}</span></div>
              <div className="wk-infozeile wk-schluss">
                <span>{t.jederEuro}</span>
                {/* „≈" steht außerhalb der Kennung, damit die Zahl selbst prüfbar bleibt. */}
                <span className={cn("wk-betrag", faktor != null && faktor > 1 && "wk-betrag-positiv")}>
                  {faktor != null && "≈ "}
                  <span className={cn(faktor != null && faktor > 1 && "wk-betrag-positiv")} data-testid="faktor-je-euro">{faktor != null ? (sprache === "en" ? `€${dez(faktor, 2, sprache)}` : `${dez(faktor, 2)} €`) : t.nichtBerechenbar}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="wk-hinweis">
        {t.schluss(h ? zahl(annahmen.wertsteigerungProzent, 1, sprache) : null)}
      </p>
    </div>
  );
}
