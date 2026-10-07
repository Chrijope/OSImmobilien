import { ArrowRight } from "lucide-react";
import LueckenZeitachse from "./charts/LueckenZeitachse";
import ScrollBuehne from "./StickyScrollAbschnitt";
import { useBuehnenZuschnitt } from "./useBuehnenZuschnitt";
import { useScrollAbschnitt } from "./useScrollAbschnitt";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "./mikroseiteTexte";

interface Props {
  onOpenFunnel: () => void;
}

/**
 * Das Problem als Schere („geistige Brandstiftung", ruhig gebaut).
 *
 * Zwei Linien starten am selben Punkt. Die eine steigt — das Einkommen. Die
 * andere bleibt fast flach — was davon Vermögen wird. Beim Scrollen laufen sie
 * auseinander, die Fläche dazwischen bekommt ein Maß, und auf der oberen Linie
 * setzen sich nacheinander die drei Punkte ab.
 *
 * Ton: keine Dringlichkeit, keine Ausrufezeichen. Die Zielgruppe
 * (Unternehmer, Führungskräfte, Gutverdiener) reagiert auf Präzision, nicht
 * auf Lautstärke. Drei nachprüfbare Fakten, der Schluss bleibt beim Leser.
 *
 * Gleiche Mechanik wie der Prozessabschnitt: ein scroll-Listener, eine Zahl
 * von 0 bis 1, `sticky top-0`, keine Bibliothek. Bei „prefers-reduced-motion:
 * reduce" entfällt der zusätzliche Scrollweg, der Endzustand steht still.
 * Der Schlusskasten steht bewusst nach der Bühne, damit er beim normalen
 * Weiterscrollen erscheint.
 */
const SteuerlastSection = ({ onOpenFunnel }: Props) => {
  const texte = useSeitenTexte(MIKROSEITE_TEXTE);
  const t = texte.steuerlast;
  const achse = texte.zeitachse;
  const punkte = t.punkte.map((p, i) => ({
    kicker: String(i + 1).padStart(2, "0"),
    title: p.titel,
    text: p.text,
  }));

  const abschnitt = useScrollAbschnitt(punkte.length);
  const { aktiv, bandFortschritt, gesteuert } = abschnitt;
  const { gross, schmal, niedrig } = useBuehnenZuschnitt();
  /*
   * Die Schere geht stufenlos mit demselben Band auf, in dem auch die Punkte
   * wechseln. Nur so setzt sich jede Marke, während ihr Punkt gerade hell ist.
   * Die 0,06 sind ein Anfangsstück: Ganz bei null wäre am Anfang der Szene
   * nichts als eine leere Achse zu sehen.
   */
  const aufbau = gesteuert ? Math.max(0.06, bandFortschritt) : 1;
  const letzterErreicht = !gesteuert || aktiv === punkte.length - 1;
  const st = punkte[aktiv];

  const kopf = (
    <>
      <span className="mb-3 inline-block text-xs uppercase tracking-[0.25em] text-[hsl(220,10%,46%)]">
        {t.kicker}
      </span>
      <h2
        className={`font-extrabold tracking-tight text-[hsl(220,25%,10%)] ${
          niedrig ? "mb-2 text-2xl sm:text-3xl md:text-4xl" : "mb-3 text-3xl sm:text-4xl md:text-5xl"
        } leading-[1.1]`}
      >
        {t.titelVor} <span className="lp-text-gradient">{t.titelBetont}</span>
      </h2>
    </>
  );

  /** Der Schluss der Textspalte: die Lücke bekommt einen Namen. */
  const lueckenSchluss = (
    <div
      className={`transition-opacity duration-500 ${niedrig ? "mt-4" : "mt-5 sm:mt-7"} ${
        letzterErreicht ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="luecken-eyebrow inline-block text-xs uppercase tracking-[0.25em] text-[hsl(18,88%,40%)]">
        {achse.luecke}
      </span>
      <p className="mt-1 text-[15px] leading-snug text-[hsl(30,8%,16%)] sm:text-base">
        {t.lueckeText}
      </p>
    </div>
  );

  /** Die drei Punkte als Liste. Nur ab 1024 Pixeln, daneben steht die Grafik. */
  const liste = (nurAktiv: boolean) => (
    <ol className={niedrig ? "space-y-2" : "space-y-3 sm:space-y-4"}>
      {punkte.map((p, i) => {
        const hell = !nurAktiv || i === aktiv;
        /*
          Auf flachen Bildschirmen (iPad quer, 1024 × 768) trägt nur der aktive
          Punkt seinen Text. Alle drei zusammen sind dort 441 Pixel hoch, die
          Spalte läuft damit 120 Pixel über die Bildschirmhöhe hinaus und wird
          oben und unten abgeschnitten. Gestrichen ist nichts: Jeder Text
          erscheint, sobald sein Punkt an der Reihe ist.
        */
        const textSichtbar = hell || !niedrig;
        return (
          <li
            key={p.kicker}
            className={`flex gap-3 transition-opacity duration-500 ${hell ? "opacity-100" : "opacity-30"}`}
          >
            <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-primary">
              {p.kicker}
            </span>
            <div className="min-w-0">
              <h3
                className={`font-semibold leading-snug text-[hsl(30,8%,16%)] ${
                  niedrig ? "text-[15px]" : "text-[15px] sm:text-base md:text-lg"
                }`}
              >
                {p.title}
              </h3>
              {textSichtbar && (
                <p
                  className={`mt-1 leading-relaxed text-[hsl(220,10%,46%)] ${
                    niedrig ? "text-[13px]" : "text-sm md:text-[15px]"
                  }`}
                >
                  {p.text}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

  /*
    Die Grafik steht genau einmal im Markup, ihr Zuschnitt kommt aus der
    Medienabfrage statt aus `hidden`/`sm:block`. Zwei Fassungen im Baum wären
    zwei SVG: doppelt vorgelesen und doppelt gezeichnet.
  */
  const grafik = (
    <LueckenZeitachse
      marken={punkte.map((p) => p.kicker)}
      aktiv={aktiv}
      aufbau={aufbau}
      zeigeLuecke={letzterErreicht}
      kompakt={schmal}
    />
  );

  /*
    Unter 640 Pixeln trägt die Grafik keine Schrift mehr, siehe LueckenZeitachse.
    Dieselben Beschriftungen stehen dort als HTML um sie herum — gestrichen wird
    nichts, sie wandern nur nach draußen.
  */
  const grafikMitLegende = schmal ? (
    <div className="mx-auto w-full max-w-[420px]">
      {/* Einzeilig gehalten: Bei 375 Pixeln bräuchten Versalien mit Sperrung
          zwei Zeilen je Seite und schöben die Grafik aus dem Bild. */}
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px]">
        <span className="font-semibold text-primary">{achse.einkommen}</span>
        <span className="text-[hsl(220,10%,46%)]">{achse.vermoegen}</span>
      </div>
      {grafik}
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-[hsl(220,10%,46%)]">
        <span>{achse.heute}</span>
        {letzterErreicht && <span className="font-semibold text-[hsl(18,88%,40%)]">{achse.luecke}</span>}
        <span>{achse.inZehnJahren}</span>
      </div>
      <p className="mt-2 text-[11px] text-[hsl(220,10%,46%)]">
        {achse.hinweis}
      </p>
    </div>
  ) : (
    <div className="mx-auto w-full">{grafik}</div>
  );

  /** Der aktive Punkt unter der Grafik, wo links keine Liste steht. */
  const aktiveKarte = (
    <div className="mx-auto mt-4 min-h-[150px] w-full max-w-[520px]">
      <div
        key={aktiv}
        className="rounded-2xl border border-[hsl(214,24%,88%)] bg-[hsl(210,33%,98%)] px-4 py-4 sm:px-5"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {st.kicker}
        </span>
        <h3 className="mt-1 text-[15px] font-semibold leading-snug text-[hsl(30,8%,16%)] sm:text-lg">
          {st.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[hsl(220,10%,46%)] md:text-[15px]">
          {st.text}
        </p>
      </div>
    </div>
  );

  /*
    Ohne Scrollsteuerung (reduzierte Bewegung, kein messbarer Weg) stehen alle
    drei Punkte gleichzeitig da, nichts abgedunkelt, die Schere offen. Die
    Bühne bleibt trotzdem im Markup: Sie trägt die Bezüge, aus denen der
    Fortschritt gemessen wird. Bei reduzierter Bewegung macht `ScrollBuehne`
    von sich aus einen schlichten Kasten ohne Hülle daraus.
  */
  const allePunkte = (
    <div className="flex flex-col">
      <div className="text-left">
        {kopf}
        <p className="mb-6 text-base text-[hsl(220,10%,46%)] md:text-lg">
          {t.intro}
        </p>
      </div>
      {liste(false)}
      <div className="mt-8">{grafikMitLegende}</div>
      {lueckenSchluss}
    </div>
  );

  return (
    <section className="lp-section-light py-16 md:py-28">
      <div className="container mx-auto max-w-5xl px-4 md:px-6">
        <ScrollBuehne abschnitt={abschnitt} hoehe="h-[240svh] sm:h-[300svh]">
          {!gesteuert ? (
            allePunkte
          ) : gross ? (
            /* ------------------------------ ab 1024 px: Liste links, Schere rechts */
            <div className={`grid grid-cols-12 items-center ${niedrig ? "gap-6" : "gap-10"}`}>
              <div className="col-span-5 text-left">
                {kopf}
                <p
                  className={`text-[hsl(220,10%,46%)] ${
                    niedrig ? "mb-4 text-[15px] leading-snug" : "mb-6 text-base md:text-lg"
                  }`}
                >
                  {t.intro}
                </p>
                {liste(true)}
                {lueckenSchluss}
              </div>
              <div className="col-span-7">{grafikMitLegende}</div>
            </div>
          ) : (
            /* ----------------- unter 1024 px: einspaltig, Schere und Textkarte */
            <div className="flex flex-col">
              <div className="text-left">{kopf}</div>
              <div className={`mx-auto mt-2 w-full ${schmal ? "max-w-[420px]" : "max-w-[620px]"}`}>
                {grafikMitLegende}
              </div>
              {aktiveKarte}
              <div className="mx-auto w-full max-w-[520px]">{lueckenSchluss}</div>
            </div>
          )}
        </ScrollBuehne>

        {/* Der unbequeme Schluss, bewusst ohne Ausrufezeichen */}
        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[hsl(40,15%,88%)] bg-white p-6 text-center shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)] md:mt-12 md:p-9">
          <p className="text-lg font-normal leading-snug text-[hsl(30,8%,16%)] md:text-2xl">
            {t.schlussSatz}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[hsl(220,10%,46%)] md:text-base">
            {t.schlussText}
          </p>
          <button
            onClick={onOpenFunnel}
            className="lp-cta mt-7 inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-medium md:px-8 md:py-4 md:text-base"
          >
            {texte.allgemein.erstberatung}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default SteuerlastSection;
