import { useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowRight, Info, Lightbulb, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  berechne,
  FREIBETRAG_KIND,
  partnerBruttoVorschlag,
  VERANLAGUNG,
  type Hebelziel,
  type SteuerEingaben,
  type Steuerklasse,
} from "@/lib/steuerRechner";
import { BUNDESLAENDER } from "@/lib/grunderwerbsteuer";
import { TILGUNG_ANFANG } from "@/lib/finanzierung";
import { euroText, zahlText } from "@/lib/sprachFormat";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

interface Props {
  onOpenFunnel: () => void;
}

/** Die Zahl aus einem Eingabefeld, gleich ob mit deutschem oder englischem Tausendertrenner. */
const zahlAusEingabe = (text: string) => {
  const n = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/* ───── Bausteine im Seitenstil ───── */

const Abschnitt = ({
  nummer,
  titel,
  intro,
  children,
}: {
  nummer: string;
  titel: string;
  intro: string;
  children: React.ReactNode;
}) => (
  <div className="pt-7 first:pt-0">
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary mb-3">
      {nummer}, {titel}
    </div>
    <p className="border-l-2 border-primary/40 pl-4 text-sm text-[hsl(220,10%,40%)] leading-relaxed mb-6">
      {intro}
    </p>
    <div className="space-y-6">{children}</div>
  </div>
);

const Feld = ({
  label,
  hinweis,
  children,
}: {
  label: string;
  hinweis?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label className="block text-[11px] font-medium text-[hsl(220,10%,40%)] uppercase tracking-wider mb-2">
      {label}
    </label>
    {children}
    {hinweis && (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(220,10%,55%)] leading-relaxed">
        <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>{hinweis}</span>
      </p>
    )}
  </div>
);

const auswahlKlasse =
  "w-full h-12 rounded-xl border-[hsl(40,15%,88%)] bg-white text-[hsl(220,25%,10%)] text-[15px]";

/* ───── Komponente ───── */

export default function AppleSteuerRechner({ onOpenFunnel }: Props) {
  const sprache = useSeitenSprache();
  const texte = useSeitenTexte(MIKROSEITE_TEXTE);
  const t = texte.rechner;
  const fmtEUR = (n: number) => euroText(n, sprache);
  const zahl = (n: number) => zahlText(n, sprache);

  const [bruttoText, setBruttoText] = useState(() => zahlText(85000, sprache));
  const [steuerklasse, setSteuerklasse] = useState<Steuerklasse>("I");
  /** null heißt: der Vorschlag aus der Steuerklasse gilt, der Nutzer hat nichts eingetragen. */
  const [partnerText, setPartnerText] = useState<string | null>(null);
  const [kinder, setKinder] = useState(0);
  const [bestehende, setBestehende] = useState(0);
  const [kirche, setKirche] = useState(false);
  const [bundesland, setBundesland] = useState("");
  const [hebelziel, setHebelziel] = useState<Hebelziel>("maximal");
  const [berechnet, setBerechnet] = useState(false);

  const brutto = useMemo(() => zahlAusEingabe(bruttoText), [bruttoText]);

  // Beim Sprachwechsel stehen die Eingaben in der Schreibweise der neuen Sprache.
  useEffect(() => {
    setBruttoText((alt) => (alt.trim() ? zahlText(zahlAusEingabe(alt), sprache) : alt));
    setPartnerText((alt) => (alt === null || !alt.trim() ? alt : zahlText(zahlAusEingabe(alt), sprache)));
  }, [sprache]);

  const zusammenveranlagt = VERANLAGUNG[steuerklasse] === "splitting";
  const partnerVorschlag = useMemo(
    () => Math.round(partnerBruttoVorschlag(brutto, steuerklasse)),
    [brutto, steuerklasse],
  );
  const partnerBrutto = useMemo(() => {
    if (!zusammenveranlagt) return 0;
    if (partnerText === null) return partnerVorschlag;
    return zahlAusEingabe(partnerText);
  }, [zusammenveranlagt, partnerText, partnerVorschlag]);

  const gueltig = brutto >= 15000 && brutto <= 1_000_000;

  const r = useMemo(() => {
    if (!gueltig) return null;
    const eingaben: SteuerEingaben = {
      jahresbrutto: brutto,
      steuerklasse,
      partnerBrutto,
      kinder,
      kirchensteuer: kirche,
      bundesland: bundesland || undefined,
      bestehendeImmobilien: bestehende,
      hebelziel,
    };
    return berechne(eingaben);
  }, [brutto, steuerklasse, partnerBrutto, kinder, bestehende, kirche, bundesland, hebelziel, gueltig]);

  const zeigeErgebnis = berechnet && r;
  /* Der Rechenkern liefert deutsche Titel; angezeigt wird über die Kennung. */
  const klasse = r ? t.klassen[r.klasse.id] ?? r.klasse : null;

  return (
    <section
      id="steuer-check"
      className="scroll-mt-20 py-20 md:py-32 bg-gradient-to-b from-[hsl(40,20%,98%)] via-white to-[hsl(40,20%,98%)]"
    >
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-5">
            <Sparkles className="w-3 h-3" /> {t.badge}
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold text-[hsl(220,25%,10%)] tracking-tight leading-[1.05] mb-5">
            {t.titelZeile1}
            <br />
            <span className="lp-text-gradient">{t.titelZeile2}</span>
          </h2>
          <p className="text-base md:text-lg text-[hsl(220,10%,40%)] max-w-2xl mx-auto">
            {t.intro}
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 md:gap-8 items-start">
          {/* ───── Eingaben ───── */}
          <div className="lg:col-span-2 rounded-3xl bg-white border border-[hsl(40,15%,90%)] shadow-[0_8px_40px_-12px_hsla(220,30%,14%,0.10)] p-6 md:p-8 divide-y divide-[hsl(40,15%,92%)]">
            <Abschnitt
              nummer="01"
              titel={t.einkommenTitel}
              intro={t.einkommenIntro}
            >
              <Feld
                label={t.bruttoLabel}
                hinweis={t.bruttoHinweis}
              >
                <input
                  inputMode="numeric"
                  value={bruttoText}
                  onChange={(e) => setBruttoText(e.target.value)}
                  onBlur={() => setBruttoText(brutto ? zahl(brutto) : "")}
                  className="w-full h-12 px-4 rounded-xl border border-[hsl(40,15%,88%)] bg-white text-[hsl(220,25%,10%)] text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={t.beispiel(85000)}
                />
              </Feld>

              <Feld
                label={t.steuerklasseLabel}
                hinweis={t.steuerklasseHinweis}
              >
                <Select value={steuerklasse} onValueChange={(v) => setSteuerklasse(v as Steuerklasse)}>
                  <SelectTrigger className={auswahlKlasse}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(t.steuerklassen) as Steuerklasse[]).map((klasse) => (
                      <SelectItem key={klasse} value={klasse}>
                        {t.steuerklassen[klasse]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Feld>

              {zusammenveranlagt && (
                <Feld
                  label={t.partnerLabel}
                  hinweis={t.partnerHinweis}
                >
                  <input
                    inputMode="numeric"
                    value={partnerText ?? zahl(partnerVorschlag)}
                    onChange={(e) => setPartnerText(e.target.value)}
                    onBlur={() =>
                      setPartnerText(partnerBrutto ? zahl(partnerBrutto) : "0")
                    }
                    className="w-full h-12 px-4 rounded-xl border border-[hsl(40,15%,88%)] bg-white text-[hsl(220,25%,10%)] text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t.beispiel(45000)}
                  />
                </Feld>
              )}
            </Abschnitt>

            <Abschnitt
              nummer="02"
              titel={t.familieTitel}
              intro={t.familieIntro}
            >
              <Feld
                label={t.kinderLabel}
                hinweis={
                  zusammenveranlagt
                    ? t.kinderHinweisGemeinsam(FREIBETRAG_KIND)
                    : t.kinderHinweisEinzeln(FREIBETRAG_KIND / 2)
                }
              >
                <Select value={String(kinder)} onValueChange={(v) => setKinder(Number(v))}>
                  <SelectTrigger className={auswahlKlasse}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {t.kinderOptionen.map((text, anzahl) => (
                      <SelectItem key={anzahl} value={String(anzahl)}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Feld>

              <Feld
                label={t.bestehendeLabel}
                hinweis={t.bestehendeHinweis}
              >
                <Select value={String(bestehende)} onValueChange={(v) => setBestehende(Number(v))}>
                  <SelectTrigger className={auswahlKlasse}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {t.bestehendeOptionen.map((text, anzahl) => (
                      <SelectItem key={anzahl} value={String(anzahl)}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Feld>

              <Feld
                label={t.bundeslandLabel}
                hinweis={t.bundeslandHinweis}
              >
                <Select value={bundesland || "ohne"} onValueChange={(v) => setBundesland(v === "ohne" ? "" : v)}>
                  <SelectTrigger className={auswahlKlasse}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ohne">{t.bundeslandOhne}</SelectItem>
                    {BUNDESLAENDER.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Feld>

              <div className="rounded-xl border border-[hsl(40,15%,88%)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[hsl(220,25%,10%)]">{t.kircheTitel}</div>
                    <div className="text-xs text-[hsl(220,10%,55%)] mt-0.5">
                      {t.kircheUnter}
                    </div>
                  </div>
                  <Switch checked={kirche} onCheckedChange={setKirche} aria-label={t.kircheTitel} />
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-[hsl(220,10%,55%)] leading-relaxed">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/70" />
                  <span>{t.kircheHinweis}</span>
                </p>
              </div>
            </Abschnitt>

            <Abschnitt
              nummer="03"
              titel={t.zielTitel}
              intro={t.zielIntro}
            >
              <Feld
                label={t.hebelLabel}
                hinweis={t.hebelHinweis}
              >
                <Select value={hebelziel} onValueChange={(v) => setHebelziel(v as Hebelziel)}>
                  <SelectTrigger className={auswahlKlasse}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(t.hebelOptionen) as Hebelziel[]).map((ziel) => (
                      <SelectItem key={ziel} value={ziel}>
                        {t.hebelOptionen[ziel]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Feld>
            </Abschnitt>

            <div className="pt-7">
              <button
                onClick={() => setBerechnet(true)}
                disabled={!gueltig}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-[hsl(220,25%,10%)] text-white text-[15px] font-medium transition-all hover:bg-[hsl(220,25%,18%)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4" />
                {t.berechnen}
              </button>
              {!gueltig && (
                <p className="mt-2 text-xs text-[hsl(220,10%,55%)] text-center">
                  {t.ungueltig(15000, 1_000_000)}
                </p>
              )}
            </div>
          </div>

          {/* ───── Ergebnis ───── */}
          <div className="lg:col-span-3 space-y-6">
            {!zeigeErgebnis ? (
              <div className="rounded-3xl border border-dashed border-[hsl(40,15%,85%)] bg-white/60 p-10 md:p-14 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-[hsl(220,25%,10%)] mb-2">
                  {t.leerTitel}
                </h3>
                <p className="text-sm md:text-base text-[hsl(220,10%,40%)] max-w-md mx-auto">
                  {t.leerText}
                </p>
              </div>
            ) : (
              <>
                {/* Schritt 1 — was heute abgeht */}
                <div className="rounded-3xl bg-white border border-[hsl(40,15%,90%)] shadow-[0_8px_40px_-12px_hsla(220,30%,14%,0.10)] p-6 md:p-8">
                  <span className="text-xs font-semibold text-[hsl(220,10%,40%)] uppercase tracking-wider">
                    {t.schritt1}
                    {r.veranlagung === "splitting" && t.schritt1Paar}
                  </span>
                  <div className="mt-3 text-4xl md:text-5xl font-semibold text-[hsl(220,25%,10%)] tracking-tight tabular-nums">
                    {fmtEUR(r.vorher.summe)}
                    <span className="text-base md:text-lg font-normal text-[hsl(220,10%,40%)]">{t.proJahr}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[hsl(220,10%,40%)]">
                    <span>{t.einkommensteuer(r.vorher.est)}</span>
                    <span>{t.soli(r.vorher.soli)}</span>
                    {r.vorher.kirche > 0 && <span>{t.kirchensteuer(r.vorher.kirche)}</span>}
                  </div>
                  <p className="mt-3 text-xs text-[hsl(220,10%,55%)] leading-relaxed">
                    {t.grundlage({
                      splitting: r.veranlagung === "splitting",
                      brutto: r.brutto,
                      partnerBrutto: r.partnerBrutto,
                      kinderfreibetrag: r.kinderfreibetrag,
                      zvE: r.zvE,
                      grenzsteuersatz: r.grenzsteuersatz,
                    })}
                  </p>
                  <div className="mt-5 pt-5 border-t border-[hsl(40,15%,90%)]">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-sm text-[hsl(220,10%,40%)]">{t.zehnJahre}</span>
                      <span className="text-xl md:text-2xl font-semibold text-[hsl(220,25%,10%)] tabular-nums">
                        {fmtEUR(r.steuer10J)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[hsl(220,10%,40%)] leading-relaxed">
                      {t.geldWeg}
                    </p>
                  </div>
                </div>

                {/* Schritt 2 — wie die Steuer sinkt */}
                <div className="rounded-3xl bg-white border border-[hsl(40,15%,90%)] shadow-[0_8px_40px_-12px_hsla(220,30%,14%,0.10)] p-6 md:p-8">
                  <span className="text-xs font-semibold text-[hsl(220,10%,40%)] uppercase tracking-wider">
                    {t.schritt2}
                  </span>

                  <p className="mt-3 text-sm md:text-base text-[hsl(220,10%,40%)] leading-relaxed">
                    {t.schritt2Text}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-4 md:gap-6">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[hsl(220,10%,55%)]">
                        {t.heute}
                      </div>
                      <div className="text-xl md:text-2xl font-semibold text-[hsl(220,10%,55%)] tabular-nums line-through decoration-1">
                        {fmtEUR(r.vorher.summe)}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[hsl(220,10%,55%)]" />
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[hsl(220,10%,55%)]">
                        {t.mitWohnung}
                      </div>
                      <div className="text-2xl md:text-3xl font-semibold text-[hsl(220,25%,10%)] tabular-nums">
                        {fmtEUR(r.nachher.summe)}
                      </div>
                    </div>
                    <div className="ml-auto rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wider text-primary/80">
                        {t.ersparnisProJahr}
                      </div>
                      <div className="text-xl md:text-2xl font-semibold text-primary tabular-nums">
                        {fmtEUR(r.ersparnisJahr)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-[hsl(40,15%,88%)] bg-[hsl(40,20%,98%)] p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-[hsl(220,25%,10%)]">
                        {t.gerechnetMit} {klasse.titel}
                      </span>
                      <span className="text-lg md:text-xl font-semibold text-[hsl(220,25%,10%)] tabular-nums">
                        {fmtEUR(r.klasse.preis)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs md:text-sm text-[hsl(220,10%,45%)] leading-relaxed">
                      {klasse.erklaerung} {t.wohnungSenkt(r.ersparnisJahr)}
                      {r.anzahlFuerZiel > 1 && (
                        <>
                          {" "}
                          {t.mehrereWohnungen(r.anzahlFuerZiel)}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Schritt 3 — was daraus an Privatvermögen wird */}
                <div className="rounded-3xl bg-gradient-to-br from-[hsl(220,25%,10%)] to-[hsl(220,25%,18%)] text-white p-6 md:p-8 shadow-[0_12px_48px_-12px_hsla(220,30%,14%,0.35)]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {t.schritt3}
                  </span>
                  {/*
                    Der Satz hiess bis zum 17.09.2026 „Die gesparte Steuer verschwindet
                    nicht in der Wohnung, sie landet bei dir“. Das stimmt nicht: Im Modell
                    geht die Ersparnis vollstaendig in die Luecke zwischen Miete und Rate
                    und reicht dafuer nicht einmal. Was wirklich entsteht, ist Eigentum,
                    und das ist das staerkere Argument.
                  */}
                  <p className="mt-3 text-sm md:text-base text-white/75 leading-relaxed">
                    {t.schritt3Text}
                  </p>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-white">
                          {t.anteilTitel}
                        </span>
                        <span className="text-xl md:text-2xl font-semibold tabular-nums">
                          {fmtEUR(r.anteilAmObjekt)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs md:text-sm text-white/60 leading-relaxed">
                        {t.anteilText(r.tilgung10J, r.wertsteigerung10J, r.vermoegen.restschuld)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-white">
                          {t.gespartTitel}
                        </span>
                        <span className="text-xl md:text-2xl font-semibold tabular-nums">
                          {fmtEUR(r.ersparnis10J)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs md:text-sm text-white/60 leading-relaxed">
                        {t.gespartText(r.ersparnisFuerRaten)}{" "}
                        {r.freieLiquiditaet10J < 0 ? (
                          <>
                            {t.zuzahlungVor}{" "}
                            <span className="text-white font-medium">
                              {fmtEUR(Math.abs(r.freieLiquiditaet10J))}
                            </span>
                            {t.zuzahlungNach(Math.abs(r.plan[0].cashflowNachSteuer) / 12)}
                          </>
                        ) : (
                          <>
                            {t.freiVor}{" "}
                            <span className="text-white font-medium">
                              {fmtEUR(r.freieLiquiditaet10J)}
                            </span>{" "}
                            {t.freiNach}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-white">{t.einsatzTitel}</span>
                        <span className="text-xl md:text-2xl font-semibold tabular-nums text-white/70">
                          − {fmtEUR(r.eigenkapital)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs md:text-sm text-white/60 leading-relaxed">
                        {t.einsatzText(r.nebenkostenProzent, Boolean(bundesland))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white text-[hsl(220,25%,10%)] p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold">
                          {t.zuwachsTitel}
                        </span>
                        <span className="text-2xl md:text-3xl font-semibold tabular-nums">
                          {fmtEUR(r.vermoegenszuwachs)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs md:text-sm text-[hsl(220,10%,45%)] leading-relaxed">
                        {t.zuwachsText(
                          r.anteilAmObjekt,
                          Math.abs(r.freieLiquiditaet10J),
                          r.eigenkapital,
                          r.steuer10J,
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dein Weg */}
                <div className="rounded-3xl bg-white border border-[hsl(40,15%,90%)] shadow-[0_8px_40px_-12px_hsla(220,30%,14%,0.10)] p-6 md:p-8">
                  <span className="text-xs font-semibold text-[hsl(220,10%,40%)] uppercase tracking-wider">
                    {t.wegTitel}
                  </span>
                  <div className="mt-2 text-2xl md:text-3xl font-semibold text-[hsl(220,25%,10%)] tracking-tight">
                    {klasse.titel}
                  </div>
                  <p className="mt-1 text-sm text-primary font-medium">{klasse.kurz}</p>
                  <p className="mt-2 text-sm md:text-base text-[hsl(220,10%,40%)] leading-relaxed">
                    {klasse.erklaerung}
                  </p>
                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={onOpenFunnel}
                      className="lp-cta group inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-medium"
                    >
                      {texte.allgemein.erstberatung}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <button
                      onClick={onOpenFunnel}
                      className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-[hsl(40,15%,85%)] text-[hsl(220,25%,10%)] text-sm font-medium hover:bg-[hsl(40,15%,96%)] transition-all"
                    >
                      {t.detailrechnung}
                    </button>
                  </div>
                </div>

                {/* Ehrliche Einordnung */}
                <div className="rounded-2xl border border-[hsl(40,15%,88%)] bg-[hsl(40,20%,98%)] p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs text-[hsl(220,10%,45%)] leading-relaxed space-y-1.5">
                      <p>
                        <span className="font-semibold text-[hsl(220,25%,10%)]">{t.dazuTitel}</span>{" "}
                        {r.klasse.sonder7b
                          ? t.sonder7b(r.plan[0].ersparnis, r.plan[4].ersparnis)
                          : t.ohne7b(r.plan[0].ersparnis, r.plan[r.plan.length - 1].ersparnis)}
                      </p>
                      <p>
                        <span className="font-semibold text-[hsl(220,25%,10%)]">
                          {t.finanzTitel}
                        </span>{" "}
                        {t.finanzText(r.klasse.zins, TILGUNG_ANFANG, r.plan[0].kosten)}
                      </p>
                      <p>{t.haftung}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
