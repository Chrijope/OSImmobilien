import { ArrowRight, Info } from "lucide-react";
import Reveal from "./Reveal";
import SteuerVergleichChart from "./charts/SteuerVergleichChart";
import VermoegensaufbauChart from "./charts/VermoegensaufbauChart";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "./mikroseiteTexte";
import { euroText } from "@/lib/sprachFormat";

interface Props {
  onOpenFunnel: () => void;
}

/**
 * Musterrechnung Neubau.
 *
 * Zahlenbasis: reale Berechnung (Neubau, 83 m², Fertigstellung 2027,
 * Käufer ledig mit 120.000 € zu versteuerndem Einkommen). Anonymisiert —
 * ohne Name, Einheitsnummer und Adresse.
 *
 * Die Schwächen des Modells (auslaufende Sonder-AfA, ab Jahr 6 negative
 * Liquidität, 10-jährige Vermietungspflicht) stehen bewusst mit auf der
 * Seite: Wer die Nachteile selbst nennt, wird beim Rest geglaubt.
 */

const Zeile = ({
  label,
  wert,
  stark = false,
}: {
  label: string;
  wert: string;
  stark?: boolean;
}) => (
  <div className="flex justify-between items-baseline gap-4 border-b border-[hsl(40,15%,88%)] pb-2">
    <span className="text-sm md:text-base text-[hsl(220,10%,46%)]">{label}</span>
    <span
      className={
        stark
          ? "font-semibold lp-text-gradient text-base md:text-lg whitespace-nowrap"
          : "font-semibold text-[hsl(30,8%,16%)] text-sm md:text-base whitespace-nowrap"
      }
    >
      {wert}
    </span>
  </div>
);

const Block = ({ titel, children }: { titel: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.2em] text-[hsl(220,10%,46%)] mb-3">{titel}</div>
    <div className="space-y-3">{children}</div>
  </div>
);

const NeubauBeispielSection = ({ onOpenFunnel }: Props) => {
  const texte = useSeitenTexte(MIKROSEITE_TEXTE);
  const t = texte.neubau;
  const sprache = useSeitenSprache();
  const euro = (n: number) => euroText(n, sprache);
  return (
    <section className="py-16 md:py-28 lp-section-alt">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-4 h-1 rounded-full bg-primary/40" />
          </div>
          <span className="inline-block text-[hsl(220,10%,46%)] text-xs uppercase tracking-[0.25em] mb-4">
            {t.kicker}
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[hsl(220,25%,10%)] leading-[1.1] mb-4 tracking-tight">
            {t.titelVor}{" "}
            <span className="lp-text-gradient">{t.titelBetont}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,46%)] max-w-2xl mx-auto mb-10 md:mb-14">
            {t.intro}
          </p>
        </div>

        <Reveal>
        <div className="grid md:grid-cols-2 gap-3 md:gap-6">
          {/* Eckdaten */}
          <div className="p-5 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
            <Block titel={t.objektTitel}>
              <Zeile label={t.kaufpreis} wert={euro(440000)} />
              <Zeile label={t.nebenkosten(7)} wert={euro(30800)} />
              <Zeile label={t.eigenkapital} wert={euro(30800)} stark />
              <Zeile label={t.finanzierung} wert={euro(440000)} />
              <Zeile label={t.kaltmiete} wert={t.proMonat(1332)} />
            </Block>
            <p className="text-xs text-[hsl(220,10%,46%)] mt-4 leading-relaxed">
              {t.objektText}
            </p>
          </div>

          {/* Steuer */}
          <div className="p-5 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
            <Block titel={t.steuerTitel}>
              <Zeile label={t.abschreibungJahr1} wert={euro(27068)} />
              <Zeile label={t.steuerVorher} wert={t.proJahr(41424)} />
              <Zeile label={t.steuerNachher} wert={t.proJahr(28928)} />
              <Zeile label={t.ersparnisJahr1} wert={euro(12495)} />
              <Zeile label={t.ersparnis10} wert={euro(68227)} stark />
            </Block>
            <p className="text-xs text-[hsl(220,10%,46%)] mt-4 leading-relaxed">
              {t.steuerText}
            </p>
          </div>

          {/* Monatlich */}
          <div className="p-5 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
            <Block titel={t.monatTitel}>
              <Zeile label={t.monatJahr1} wert={t.plusProMonat(758)} stark />
              <Zeile label={t.monatSchnitt} wert={t.plusProMonat(203)} />
              <Zeile label={t.monatAb6} wert={t.minusSpanneProMonat(190, 226)} />
            </Block>
            <p className="text-xs text-[hsl(220,10%,46%)] mt-4 leading-relaxed">
              {t.monatText}
            </p>
          </div>

          {/* Nach 10 Jahren */}
          <div className="p-5 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
            <Block titel={t.zehnTitel}>
              <Zeile label={t.objektwert} wert={euro(536358)} />
              <Zeile label={t.restschuld} wert={euro(370742)} />
              <Zeile label={t.getilgt} wert={euro(69258)} />
              <Zeile label={t.verkaufserloes} wert={euro(165616)} stark />
            </Block>
            <p className="text-xs text-[hsl(220,10%,46%)] mt-4 leading-relaxed">
              {t.zehnText(30800)}
            </p>
          </div>
        </div>
        </Reveal>

        {/* Vermögensaufbau als Bild */}
        <Reveal delay={60}>
          <div className="mt-3 md:mt-6 p-5 md:p-8 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
            <VermoegensaufbauChart />
          </div>
        </Reveal>

        {/* Die Kernaussage */}
        <div className="mt-8 md:mt-12 max-w-3xl mx-auto p-6 md:p-9 rounded-2xl border border-[hsl(40,15%,88%)] bg-white shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]">
          <div className="mb-7">
            <SteuerVergleichChart />
          </div>
          <h3 className="text-xl md:text-2xl font-semibold text-[hsl(30,8%,16%)] mb-4">
            {t.kernTitel}
          </h3>
          <p className="text-sm md:text-base text-[hsl(220,10%,46%)] leading-relaxed">
            {t.kernVor}{" "}
            <span className="font-semibold text-[hsl(30,8%,16%)]">{t.kernOhne}</span>
            {t.kernMitte}{" "}
            <span className="font-semibold text-[hsl(30,8%,16%)]">{t.kernMit}</span>
            {t.kernNach}
          </p>
          <p className="mt-5 text-base md:text-lg text-[hsl(30,8%,16%)] leading-snug">
            {t.kernSchluss}
          </p>
        </div>

        {/* Ehrliche Einschränkungen */}
        <div className="mt-4 md:mt-6 max-w-3xl mx-auto p-5 md:p-7 rounded-2xl border border-[hsl(40,15%,88%)] bg-[hsl(40,20%,98%)]">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h4 className="text-sm md:text-base font-semibold text-[hsl(30,8%,16%)] mb-2">
                {t.ehrlichTitel}
              </h4>
              <ul className="space-y-1.5 text-sm text-[hsl(220,10%,46%)] leading-relaxed">
                {t.ehrlichPunkte.map((punkt) => (
                  <li key={punkt}>{punkt}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Gesetzliche Befristung, Verknappung, die nicht von uns kommt */}
        <div className="mt-4 md:mt-6 max-w-3xl mx-auto text-center">
          <p className="text-sm md:text-base text-[hsl(220,10%,46%)] leading-relaxed">
            <span className="font-semibold text-[hsl(30,8%,16%)]">{t.befristetTitel}</span>{" "}
            {t.befristetText}
          </p>
        </div>

        <div className="mt-8 md:mt-12 text-center">
          <button
            onClick={onOpenFunnel}
            className="lp-cta inline-flex items-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-lg font-medium text-sm md:text-base"
          >
            {texte.allgemein.erstberatung}
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-xs text-[hsl(220,10%,46%)] mt-4 max-w-2xl mx-auto">
            {t.hinweis}
          </p>
        </div>
      </div>
    </section>
  );
};

export default NeubauBeispielSection;
