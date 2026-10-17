/**
 * „Deine zwei Wege“ auf der Ergebnisseite (17.10.2026): die beiden Konzepte
 * der Beratungspräsentation, kurz und mit den Zahlen des Kunden, gerechnet an
 * echten OS-Wohnungen (siehe `analyseVorsorge.ts`).
 *
 * Beide Wege stehen immer da, weil sie zusammengehören. Der Schwerpunkt aus
 * den Zielen des Kunden entscheidet nur, welche Karte zuerst kommt.
 */
import { ArrowRight, BadgeCheck, Info, Landmark, PiggyBank } from "lucide-react";
import type { AnalysisData } from "@/lib/scoringEngine";
import { EXPOSE_TILGUNG_PROZENT, EXPOSE_ZINS_PROZENT, OS_WOHNUNGEN, VORSORGE_ANNAHMEN, grenzsteuersatzAusKlasse, rechneWohnung, schwerpunkt, vorsorgePlan } from "@/lib/analyseVorsorge";
import { STANDARD_ANNAHMEN } from "@/lib/exposeAnnahmen";
import { kaufnebenkostenProzent } from "@/lib/grunderwerbsteuer";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { euroText } from "@/lib/sprachFormat";
import { ANALYSE_TEXTE } from "./analyseTexte";

interface Props {
  data: AnalysisData;
  /** Finanzierungsrahmen aus dem Rechenkern. */
  rahmen: number;
  onErstgespraech?: () => void;
}

const kicker = "text-xs font-semibold uppercase tracking-wider text-primary inline-flex items-center gap-1.5";
const badge = "rounded-full bg-alert-green/10 px-2.5 py-0.5 text-[11px] font-medium text-alert-green";

export default function VorsorgeBlock({ data, rahmen, onErstgespraech }: Props) {
  const t = useSeitenTexte(ANALYSE_TEXTE).vorsorge;
  const sprache = useSeitenSprache();
  const eur = (v: number) => euroText(Math.round(v), sprache);

  const plan = vorsorgePlan(data, rahmen);
  if (!plan || plan.wohnungen.length === 0) return null;

  const fokus = schwerpunkt(data);
  const satz = grenzsteuersatzAusKlasse(data.incomeClass);
  // Jede Wohnung so gerechnet, als kaufte er sie heute.
  const objekte = OS_WOHNUNGEN
    .map((w) => rechneWohnung(w, data.age, plan.verkaufsAlter, satz))
    .sort((a, b) => Number(b.wohnung.konzept === fokus) - Number(a.wohnung.konzept === fokus));
  const besteSteuer = [...objekte].sort((a, b) => b.steuerMonat - a.steuerMonat)[0];

  const n = plan.wohnungen.length;
  const anteil = plan.wohnungen.reduce((s, w) => s + w.eigenanteilMonat, 0);
  const nebenkosten = plan.wohnungen.reduce((s, w) => s + w.nebenkosten, 0);
  const steuerPlan = plan.wohnungen.reduce((s, w) => s + Math.max(0, w.steuerMonat), 0);

  const alterKarte = (
    <div key="alter" className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={kicker}><PiggyBank className="w-4 h-4" /> {t.alterKicker}</span>
        {fokus === "zusatzrente" && <span className={badge}>{t.passt}</span>}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{t.alterTitel(n, plan.verkaufsAlter)}</h3>

      <ol className="mt-4 space-y-2">
        {plan.wohnungen.map((w) => (
          <li key={w.wohnung.id + w.kaufAlter} className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-foreground">{t.mitAlter(w.kaufAlter)}: {w.wohnung.titel}</span>
              <span className="shrink-0 text-foreground">{eur(w.wohnung.objekt.kaufpreis)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{w.wohnung.ort} · {t.wertBeiVerkauf(plan.verkaufsAlter, w.verkaufswert, w.erloes)}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t.volumen(plan.verkaufsAlter)}</span>
        <span className="font-semibold text-foreground">{eur(plan.verkaufsvolumen)}</span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{t.kapital}</p>
      <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">{eur(plan.kapital)}</p>
      <p className="mt-1 text-sm font-medium text-alert-green">{t.rente(plan.zusatzrenteMonat, VORSORGE_ANNAHMEN.ruhestandJahre)}</p>
      {(data.wunschZusatzrente ?? 0) > 0 && (
        <p className="mt-1 text-sm text-foreground">
          {t.wunsch(data.wunschZusatzrente!, Math.round((plan.zusatzrenteMonat / data.wunschZusatzrente!) * 100))}
        </p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{t.anteil(anteil)}</p>
      {nebenkosten > 0 && <p className="mt-1 text-sm text-muted-foreground">{t.nebenkosten(nebenkosten)}</p>}
      {plan.ueberRahmen && <p className="mt-2 text-xs text-muted-foreground">{t.ueberRahmen(plan.summeKaufpreise, rahmen)}</p>}
    </div>
  );

  const steuerKarte = (
    <div key="steuer" className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={kicker}><Landmark className="w-4 h-4" /> {t.steuerKicker}</span>
        {fokus === "steuer" && <span className={badge}>{t.passt}</span>}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{t.steuerTitel}</h3>
      <p className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-alert-green">+{eur(besteSteuer.steuerMonat)}</p>
      <p className="text-sm text-muted-foreground">{t.steuerObjekt(besteSteuer.wohnung.titel)}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{t.steuerJahr(besteSteuer.steuerMonat * 12)}</p>
      {n > 1 && <p className="mt-3 text-sm text-foreground">{t.steuerPlan(steuerPlan, n)}</p>}
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{t.steuerText}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t.steuerSatz(satz)}</p>
    </div>
  );

  return (
    <section className="mb-10 mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{t.titel}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground max-w-3xl">{t.untertitel}</p>

      {/* Muster, aber echte Objekte: Der Interessent soll wissen, dass am Ende individuell gerechnet wird. */}
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">{t.musterTitel}: </span>
          {t.musterText}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fokus === "steuer" ? [steuerKarte, alterKarte] : [alterKarte, steuerKarte]}
      </div>

      {/* Warum drei Wohnungen: der Weg aus „Arbeitsleistung und Immobilienvermögen“ und „Mehr Netto vom Brutto“. */}
      <div className="glass-card mt-4 rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-semibold text-foreground">{t.warumTitel}</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {t.warumSchritte.map((schritt, i) => (
            <li key={schritt.titel} className="rounded-xl bg-muted/50 p-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{i + 1}</span>
              <p className="mt-2 text-sm font-semibold text-foreground">{schritt.titel}</p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{schritt.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-foreground leading-relaxed">{t.warumModell}</p>
      </div>

      <h3 className="mt-8 text-base font-semibold text-foreground">{t.objekteTitel}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{t.objekteText}</p>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible sm:px-0">
        {objekte.map(({ wohnung: w, steuerMonat, eigenanteilMonat }) => (
          <div key={w.id} className="glass-card w-60 shrink-0 snap-start overflow-hidden rounded-2xl sm:w-auto">
            <img src={w.bild} alt={`${w.titel}, ${w.ort}`} loading="lazy" className="h-28 w-full object-cover" />
            <div className="p-3">
              <span className={`text-[11px] font-medium ${w.konzept === fokus ? "text-alert-green" : "text-primary"}`}>{t.konzept[w.konzept]}</span>
              <p className="text-sm font-semibold text-foreground leading-tight">{w.titel}</p>
              <p className="text-xs text-muted-foreground">{w.ort} · {w.preisrahmen}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{w.beispiel}</p>
              <p className="text-xs text-foreground">{t.kaufpreisMiete(w.objekt.kaufpreis, w.objekt.kaltmieteMonat)}</p>
              {steuerMonat > 10 ? (
                <p className="mt-1 text-sm font-semibold text-alert-green">+{eur(steuerMonat)} <span className="text-[11px] font-normal text-muted-foreground">{t.mehrNetto}</span></p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{t.keinVorteil}</p>
              )}
              <p className="text-xs text-foreground">{t.deinAnteil(eigenanteilMonat)}</p>
              <p className="text-[11px] text-muted-foreground">
                {w.nebenkostenTraegtVerkaeufer ? t.nebenkostenVerkaeufer : t.kaufnebenkosten(kaufnebenkostenProzent(w.objekt.bundeslandId))}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-8 mb-3 text-base font-semibold text-foreground">{t.vorteileTitel}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.vorteile.map((v) => (
          <div key={v.titel} className="glass-card rounded-2xl p-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <BadgeCheck className="h-4 w-4 text-alert-green" /> {v.titel}
            </p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{v.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <p className="text-sm text-foreground">{t.knopfText}</p>
        {onErstgespraech && (
          <button
            onClick={onErstgespraech}
            className="sand-gradient inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-foreground hover:opacity-90"
          >
            {t.knopf} <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {t.annahmen(
          plan.verkaufsAlter,
          EXPOSE_ZINS_PROZENT,
          EXPOSE_TILGUNG_PROZENT,
          STANDARD_ANNAHMEN.wertsteigerungProzent,
          VORSORGE_ANNAHMEN.verkaufskostenProzent,
          VORSORGE_ANNAHMEN.ruhestandJahre,
        )}
      </p>
    </section>
  );
}
