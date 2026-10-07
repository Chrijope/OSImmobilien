/**
 * Finanzierungsrahmen, passender Objekttyp und Musterrechnung.
 *
 * Der Kern der neuen Ergebnisseite. Die alte Fassung zeigte oben das Vermögen
 * nach zehn Jahren und weiter unten eine Zuzahlung von mehreren hundert Euro.
 * Das ist die Antwort auf eine Frage, die der Interessent noch nicht gestellt
 * hat, gefolgt von einer Zahl, die ihn vertreibt.
 *
 * Hier steht zuerst, was er monatlich trägt, dann welcher Objekttyp zu ihm
 * passt, dann eine konkrete Rechnung dazu. Umschaltbar, damit er selbst eine
 * kleine Entscheidung trifft.
 */
import { useMemo, useState } from "react";
import { ArrowRight, Building2, Check, Info } from "lucide-react";
import {
  OBJEKTTYPEN,
  ZUZAHLUNG_GRENZE,
  sortiereTypenNachPassung,
  waehleMusterobjekt,
  type ObjekttypId,
} from "@/lib/objekttypen";
import { bundeslandById, grunderwerbsteuerSpanne } from "@/lib/grunderwerbsteuer";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { euroText } from "@/lib/sprachFormat";
import { ANALYSE_TEXTE } from "./analyseTexte";
import { bundeslandName, objekttypAnzeige } from "./analyseRechenkernTexte";

interface Props {
  /** Empfohlene Obergrenze des Finanzierungsrahmens. */
  rahmenBis: number;
  grenzsteuersatz: number;
  bundeslandId?: string | null;
  onErstgespraech?: () => void;
}

export default function MusterrechnungBlock({
  rahmenBis,
  grenzsteuersatz,
  bundeslandId,
  onErstgespraech,
}: Props) {
  const t = useSeitenTexte(ANALYSE_TEXTE).muster;
  const sprache = useSeitenSprache();
  const eur = (v: number) => euroText(Math.round(v), sprache);
  const typen = useMemo(
    () => sortiereTypenNachPassung(grenzsteuersatz, rahmenBis),
    [grenzsteuersatz, rahmenBis],
  );
  const [gewaehlt, setGewaehlt] = useState<ObjekttypId>(typen[0].id);

  const rechnungen = useMemo(() => {
    const map = new Map<ObjekttypId, ReturnType<typeof waehleMusterobjekt>>();
    for (const t of OBJEKTTYPEN) {
      map.set(t.id, waehleMusterobjekt(t, { rahmenBis, grenzsteuersatz, bundeslandId }));
    }
    return map;
  }, [rahmenBis, grenzsteuersatz, bundeslandId]);

  const r = rechnungen.get(gewaehlt)!;
  const typText = objekttypAnzeige(r.typ, sprache);
  const bl = bundeslandById(bundeslandId);
  const blName = bl ? bundeslandName(bl, sprache) : null;
  const spanne = grunderwerbsteuerSpanne();

  // Der untere Rand des Rahmens: bewusst nicht das Maximum zeigen.
  const rahmenVon = Math.max(150000, Math.round((rahmenBis * 0.55) / 10000) * 10000);

  const zeile = (label: string, wert: string, op?: string, betont?: boolean) => (
    <div
      className={`flex items-center justify-between gap-3 py-2 text-sm border-b border-border/40 last:border-b-0 ${
        betont ? "font-semibold" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-muted-foreground min-w-0">
        <span className="w-3 shrink-0 text-center text-muted-foreground/70">{op || ""}</span>
        <span className={betont ? "text-foreground" : ""}>{label}</span>
      </span>
      <span className="tabular-nums shrink-0">{wert}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── 1. Was ist machbar ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.rahmenTitel}</p>
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-2">
          {t.rahmen(rahmenVon, rahmenBis)}
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">
          {t.rahmenText}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--alert-green))]/10 px-4 py-2">
          <Check className="w-4 h-4 text-[hsl(var(--alert-green))]" />
          <span className="text-sm font-medium text-foreground">
            {t.zuzahlungGrenze(ZUZAHLUNG_GRENZE)}
          </span>
        </div>
      </div>

      {/* ── 2. Welcher Typ passt ── */}
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">{t.typTitel}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t.typText}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {typen.map((typ) => {
            const aktiv = typ.id === gewaehlt;
            const tr = rechnungen.get(typ.id)!;
            const anzeige = objekttypAnzeige(typ, sprache);
            return (
              <button
                key={typ.id}
                onClick={() => setGewaehlt(typ.id)}
                className={`text-left rounded-2xl p-5 border-2 transition-all ${
                  aktiv ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className={`w-4 h-4 ${aktiv ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-semibold text-foreground">{anzeige.name}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{anzeige.kurz}</p>
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-[11px] text-muted-foreground">{t.zuzahlungImBeispiel}</p>
                  <p className="text-xl font-semibold text-foreground tabular-nums">{eur(tr.zuzahlungMonat)}</p>
                  <p className="text-[11px] text-muted-foreground">{t.proMonat}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Die Musterrechnung ── */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {t.musterTitel(typText.name)}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">{typText.passtWenn}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 mt-2">
              {t.derKauf}
            </p>
            {zeile(t.kaufpreis, eur(r.kaufpreis))}
            {zeile(
              t.kaufnebenkosten(blName ?? t.mittelwert, r.kaufnebenkostenProzent),
              eur(r.kaufnebenkosten),
              "+",
            )}
            {zeile(t.ausEigenkapital, eur(r.kaufnebenkosten))}
            {zeile(t.darlehen, eur(r.darlehen), "=", true)}

            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 mt-5">
              {t.monatFuerMonat}
            </p>
            {zeile(t.kaltmiete, eur(r.miete))}
            {zeile(t.rate, eur(r.rate), "−")}
            {zeile(t.nichtUmlagefaehig, eur(r.typ.nichtUmlagefaehigMonat), "−")}
            {r.erhaltungsaufwand > 0 &&
              zeile(t.erhaltungsaufwandWg, eur(r.erhaltungsaufwand / 12), "−")}
            {zeile(t.zwischenstand, eur(r.zuzahlungOhneSteuerMonat), "=", true)}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 mt-2">
              {t.finanzamt}
            </p>
            {zeile(t.abschreibungGebaeude(r.typ.afaSatzProzent), eur(r.afaGebaeude))}
            {r.sonderAfa > 0 &&
              zeile(t.sonderAfa, eur(r.sonderAfa), "+")}
            {zeile(t.schuldzinsen, eur(r.zinsenJahr1), "+")}
            {zeile(t.mieteinnahmenDagegen, eur(r.miete * 12), "−")}
            {zeile(t.steuerlichesErgebnis, eur(r.steuerlichesErgebnis), "=")}
            {zeile(
              t.steuerwirkung(Math.round(grenzsteuersatz * 100)),
              t.imJahr(r.steuerwirkungJahr),
              "",
              true,
            )}

            <div className="mt-5 rounded-xl bg-[hsl(var(--alert-green))]/8 border border-[hsl(var(--alert-green))]/25 p-4">
              <p className="text-xs text-muted-foreground">{t.deineZuzahlung}</p>
              <p className="text-3xl font-semibold text-foreground tabular-nums mt-1">
                {eur(r.zuzahlungMonat)}
                <span className="text-sm font-normal text-muted-foreground"> {t.proMonat}</span>
              </p>
              {!r.innerhalbGrenze && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  {t.ueberGrenze(ZUZAHLUNG_GRENZE)}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">{typText.afaHinweis}</p>
        {r.sonderAfa > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t.sonderAfaText}
          </p>
        )}

        {/* Nach zehn Jahren */}
        <div className="mt-6 pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { titel: t.immobilienwert10, w: eur(r.immobilienwertNach10) },
            { titel: t.restschuld10, w: eur(r.restschuldNach10) },
            { titel: t.vermoegen10, w: eur(r.vermoegenNach10) },
          ].map((k) => (
            <div key={k.titel}>
              <p className="text-[11px] text-muted-foreground">{k.titel}</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">{k.w}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {t.steuerfrei}
        </p>

        <div className="mt-5 rounded-xl bg-muted/50 border border-border p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">{t.hinweisFett}</strong>{" "}
            {bl && blName
              ? t.hinweisMitLand(spanne.min, spanne.max, bl.grunderwerbsteuer, blName)
              : t.hinweisOhneLand(spanne.min, spanne.max)}
          </p>
        </div>

        {onErstgespraech && (
          <button onClick={onErstgespraech} className="apple-btn apple-btn-primary mt-5">
            {t.terminKnopf} <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
