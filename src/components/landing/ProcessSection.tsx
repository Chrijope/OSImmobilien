import { ArrowRight } from "lucide-react";
import ProzessLoop from "./charts/ProzessLoop";
import ProzessSchrittGrafik from "./charts/ProzessSchrittGrafik";
import ScrollBuehne from "./StickyScrollAbschnitt";
import { useBuehnenZuschnitt } from "./useBuehnenZuschnitt";
import { useScrollAbschnitt } from "./useScrollAbschnitt";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "./mikroseiteAbschlussTexte";

interface ProcessSectionProps {
  onOpenFunnel: () => void;
}

/**
 * Der Prozess als Ringszene, scrollgesteuert.
 *
 * Der Abschnitt bleibt beim Scrollen stehen. Sechs Stationen liegen auf einem
 * Kreis, ein Bogen zeichnet sich mit, ein Leuchtpunkt wandert darauf. Am
 * Rechner läuft links die Liste aller Schritte mit, rechts steht der Ring und
 * darunter die Grafik der aktiven Station. Danach geht es weiter.
 *
 * Bis zum 16.09.2026 stand hier zusätzlich eine senkrechte Zeitleiste mit
 * sechs Karten. Sie ist ersatzlos entfallen, weil dieser Abschnitt dasselbe
 * erzählt und dabei sichtbar macht, dass nach dem letzten Schritt der nächste
 * Zyklus beginnt. Der Aufruf am Ende der Zeitleiste ist geblieben und steht
 * jetzt unter dem sechsten Schritt.
 *
 * Ohne Bibliothek: Der Fortschritt ist eine Zahl aus einem scroll-Listener
 * (`useScrollAbschnitt`), die Bühne klebt mit `sticky top-0`. Bei
 * „prefers-reduced-motion: reduce" entfällt der zusätzliche Scrollweg ganz und
 * der Endzustand steht still — alle sechs Schritte nebeneinander.
 *
 * WICHTIG: `sticky` klebt am nächsten Scroll-Container. Ein `overflow: hidden`
 * auf html/body macht daraus einen solchen Container, die Bühne scrollt dann
 * lautlos durch. In src/index.css steht deshalb `overflow-x: clip`. Nicht
 * zurückdrehen.
 */
const ProcessSection = ({ onOpenFunnel }: ProcessSectionProps) => {
  const texte = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE);
  const t = texte.prozess;
  // Die sechs Schritte stehen in `mikroseiteAbschlussTexte.ts`.
  const steps = t.schritte.map((s, i) => ({ ...s, num: i + 1, title: s.titel }));

  const abschnitt = useScrollAbschnitt(steps.length);
  const { aktiv, bandFortschritt, gesteuert } = abschnitt;
  const { gross, schmal, niedrig } = useBuehnenZuschnitt();
  // Ohne greifende Scrollsteuerung ist der letzte Schritt sofort erreicht.
  // Ein Aufruf, den man nur über eine Animation sieht, wäre verloren.
  const letzterErreicht = !gesteuert || aktiv === steps.length - 1;
  const nr = (i: number) => String(i + 1).padStart(2, "0");

  /**
   * Nummer, Name, Titel, Kennzeichnung und ein Satz.
   *
   * Sie ersetzt unterhalb von 1024 Pixeln die Schrittliste: Ohne Liste stünden
   * Titel und Kennzeichnung der Station sonst nirgends. Am Rechner wäre sie
   * neben der Liste eine Wiederholung, dort steht rechts die Grafik.
   */
  const SchrittKarte = ({ index }: { index: number }) => {
    const step = steps[index];
    return (
      <div className="rounded-2xl border border-[hsl(214,24%,88%)] bg-[hsl(210,33%,98%)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-[hsl(220,10%,46%)]">
            {t.schritt(nr(index))}
          </span>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {step.kurz}
          </span>
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-[hsl(220,25%,10%)]">
          {step.title}
        </h3>
        <p className="mt-1 text-[13px] text-[hsl(220,10%,46%)]">{step.meta}</p>
        <p className="mt-1.5 text-base leading-relaxed text-[hsl(220,10%,46%)]">{step.satz}</p>
      </div>
    );
  };

  /*
    Der Ring steht genau einmal im Markup, sein Zuschnitt kommt aus der
    Medienabfrage statt aus `hidden`/`sm:block`. Zwei Fassungen im Baum wären
    zwei SVG: doppelt vorgelesen und doppelt gezeichnet.
  */
  const ring = (
    <ProzessLoop
      namen={steps.map((s) => s.kurz)}
      namenKompakt={steps.map((s) => s.kurzHandy)}
      aktiv={aktiv}
      gesteuert={gesteuert}
      fortschritt={bandFortschritt}
      zuschnitt={gross ? "gross" : schmal ? "schmal" : "tablet"}
    />
  );

  /*
    Der Aufruf aus der früheren Zeitleiste, jetzt nach Schritt sechs.
    Unsichtbar heißt hier auch: nicht anklickbar und nicht per Tabulator
    erreichbar, sonst springt der Fokus ins Leere.
  */
  const aufruf = (
    <div
      className={`transition-opacity duration-500 ${niedrig ? "mt-4" : "mt-5 sm:mt-7"} ${
        gross ? "text-left" : "text-center"
      } ${letzterErreicht ? "opacity-100" : "pointer-events-none opacity-0"}`}
      aria-hidden={letzterErreicht ? undefined : true}
    >
      <p
        className={`mb-4 text-[hsl(220,15%,30%)] ${niedrig ? "text-[15px]" : "text-base md:text-lg"}`}
      >
        {t.aufruf}
      </p>
      <button
        onClick={onOpenFunnel}
        tabIndex={letzterErreicht ? undefined : -1}
        className="lp-cta inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium md:px-8 md:py-4 md:text-base"
      >
        {texte.erstberatungKnopf}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );

  const kopf = (
    <>
      <span className="mb-3 inline-block text-xs uppercase tracking-[0.25em] text-[hsl(220,10%,46%)]">
        {t.oberzeile}
      </span>
      <h2
        className={`font-extrabold tracking-tight text-[hsl(220,25%,10%)] ${
          niedrig ? "mb-2 text-2xl sm:text-3xl md:text-4xl" : "mb-3 text-3xl sm:text-4xl md:text-5xl"
        } leading-[1.1]`}
      >
        {t.titel}
      </h2>
    </>
  );

  /*
    Ohne Scrollsteuerung (reduzierte Bewegung, kein messbarer Weg) steht alles
    gleichzeitig da: sechs Karten mit ihrer Grafik, nichts abgedunkelt. Eine
    Animation darf nie darüber entscheiden, ob etwas lesbar ist.

    Die Bühne bleibt trotzdem im Markup. Sie trägt die Bezüge, aus denen der
    Fortschritt gemessen wird — ohne sie könnte `gesteuert` nie wahr werden.
    Bei reduzierter Bewegung macht `ScrollBuehne` daraus von sich aus einen
    schlichten Kasten ohne Hülle.
  */
  const alleSchritte = (
    <div className="flex flex-col">
      <div className="text-left">
        {kopf}
        <p className="mb-6 text-base text-[hsl(220,10%,46%)] md:text-lg">
          {t.einleitung}
        </p>
      </div>
      <div className="w-full max-w-[440px]">{ring}</div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {steps.map((step, i) => (
          <div key={step.num} className="flex flex-col gap-3">
            <SchrittKarte index={i} />
            <ProzessSchrittGrafik schritt={i} name={step.kurz} />
          </div>
        ))}
      </div>
      {aufruf}
    </div>
  );

  return (
    <section className="lp-section-light relative py-20 md:py-32">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <ScrollBuehne abschnitt={abschnitt} hoehe="h-[260svh] sm:h-[300svh] md:h-[340svh]">
          {!gesteuert ? (
            alleSchritte
          ) : gross ? (
            /* ------------------------------ ab 1024 px: Liste links, Ring rechts */
            <div className={`grid grid-cols-12 items-center ${niedrig ? "gap-6" : "gap-10"}`}>
              <div className="col-span-5 text-left">
                {kopf}
                <p
                  className={`text-[hsl(220,10%,46%)] ${
                    niedrig ? "mb-4 text-[15px] leading-snug" : "mb-6 text-base md:text-lg"
                  }`}
                >
                  {t.einleitung}
                </p>

                <ol className={niedrig ? "space-y-1.5" : "space-y-2 md:space-y-3"}>
                  {steps.map((step, i) => {
                    const hell = i === aktiv;
                    return (
                      <li
                        key={step.num}
                        className={`flex gap-3 transition-opacity duration-500 ${
                          hell ? "opacity-100" : "opacity-30"
                        }`}
                      >
                        <span className="mt-1 shrink-0 text-xs font-semibold tabular-nums text-primary">
                          {nr(i)}
                        </span>
                        <div className="min-w-0">
                          <h3
                            className={`font-semibold leading-snug text-[hsl(220,25%,10%)] ${
                              niedrig ? "text-[15px]" : "text-base md:text-lg"
                            }`}
                          >
                            {step.kurz}
                          </h3>
                          <p
                            className={`leading-snug text-[hsl(220,10%,46%)] ${
                              niedrig ? "text-[12px]" : "text-[13px] md:text-sm"
                            }`}
                          >
                            {t.schrittMitMeta(nr(i), step.meta)}
                          </p>
                          {/*
                            Der Satz zum Schritt steht immer im HTML, sichtbar
                            ist aber nur der des aktiven Schritts.

                            Alle sechs sichtbar zu setzen liess die linke Spalte
                            auf 955 px bei 900 px Hoehe wachsen. Sie ganz
                            wegzulassen hiesse, dass diese Saetze am Rechner
                            nirgends im Markup stehen — weder fuer Suchmaschinen
                            noch fuer Vorleseprogramme. Mit sr-only steht jeder
                            Satz genau einmal da und kostet nur beim aktiven
                            Schritt Platz.
                          */}
                          <p
                            className={
                              hell
                                ? "mt-0.5 text-[13px] leading-snug text-[hsl(220,10%,56%)]"
                                : "sr-only"
                            }
                          >
                            {step.satz}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {aufruf}
              </div>

              <div className="col-span-7 flex flex-col items-center gap-3">
                <div className={`w-full ${niedrig ? "max-w-[400px]" : "max-w-[540px]"}`}>{ring}</div>
                {/*
                  Die Grafik der aktiven Station. `key` setzt sie bei jedem
                  Wechsel neu auf, damit ihre Darstellung von vorn beginnt statt
                  aus der vorigen heraus stehen zu bleiben.
                */}
                <div className={`w-full ${niedrig ? "max-w-[230px]" : "max-w-[280px]"}`}>
                  <ProzessSchrittGrafik key={aktiv} schritt={aktiv} name={steps[aktiv].kurz} />
                </div>
              </div>
            </div>
          ) : (
            /* ---------------- unter 1024 px: einspaltig, Ring und Textkarte */
            <div className="flex flex-col">
              <div className="text-left">{kopf}</div>
              <div
                className={`mx-auto mt-2 w-full ${schmal ? "max-w-[330px]" : "max-w-[430px]"}`}
              >
                {ring}
              </div>
              {/*
                Fester Platz, damit beim Stationswechsel nichts springt: Die
                Karten sind unterschiedlich hoch, ohne Mindesthöhe wanderte der
                Aufruf darunter bei jedem Schritt.
              */}
              <div className="mx-auto mt-4 min-h-[200px] w-full max-w-[520px]">
                <SchrittKarte index={aktiv} />
              </div>
              <div className="mx-auto w-full max-w-[520px]">{aufruf}</div>
            </div>
          )}
        </ScrollBuehne>
      </div>
    </section>
  );
};

export default ProcessSection;
