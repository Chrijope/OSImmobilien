import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { GESPRAECH_NAME } from "@/lib/bewerberKennenlernen";

/**
 * Die beiden Wege ohne Konto, ausführlich statt als Zweizeiler.
 *
 * WARUM ES DIESE ANSICHT GIBT
 *
 * Unter dem Anmeldeformular standen zwei kleine Kästen mit je einem Satz und
 * einem Link. Sie beantworteten die Frage nicht, die jemand ohne Zugang
 * wirklich hat: Was passiert, wenn ich hier klicke, und wie komme ich
 * überhaupt an ein Konto? Deshalb ersetzt ein Klick jetzt das Formular durch
 * den passenden Weg, mit Ablauf und einem eindeutigen nächsten Schritt.
 *
 * WARUM AN DERSELBEN STELLE UND NICHT AUF EINER NEUEN SEITE
 *
 * Wer sich verklickt hat, ist mit einem Schritt zurück beim Anmelden. Eine
 * eigene Seite würde die Anmeldung aus dem Fenster schieben, und der Weg
 * zurück liefe über den Zurück-Knopf des Browsers.
 *
 * DER GEMEINSAME PUNKT BEIDER WEGE
 *
 * Niemand legt sich hier selbst ein Konto an, weder Kunde noch Partner.
 * Zugänge entstehen bei uns im Anschluss an ein Gespräch. Genau das sagen
 * beide Ansichten ausdrücklich, sonst sucht jemand weiter nach einem
 * Registrierungsknopf, den es nicht gibt.
 */

export type ZugangsArt = "kunde" | "partner";

interface Weg {
  /** Kleine Zeile über der Überschrift. */
  augenbraue: string;
  titel: string;
  absaetze: string[];
  /** Kurze Merkmale als Chips. Leer lassen, wo sie nichts hinzufügen. */
  chips: string[];
  /** Der abgesetzte Kasten: was hier NICHT verlangt wird. */
  entfaellt: { ueberschrift: string; text: string; punkte: string[] };
  schritteTitel: string;
  schritte: string[];
  aufruf: {
    text: string;
    ziel: string;
    /** Führt aus dem CRM heraus auf die Website. */
    extern: boolean;
    /** Ein Satz unter dem Knopf, der sagt, was danach passiert. */
    danach: string;
  };
}

/**
 * Die Partnerschritte sind nicht ausgedacht, sondern die echten Stufen
 * unseres Bewerberprozesses. Ändert sich dort die Kette, gehört sie hier
 * nachgezogen, sonst verspricht die Seite einen Ablauf, den es nicht gibt.
 *
 * Die Texte kommen aus i18next (`auth.zugang.*`), weil die Anmeldeseite auch
 * englisch angezeigt werden kann. Jeder Schlüssel steht ausgeschrieben da,
 * damit der Schlüsseltest ihn findet.
 */
function wegeFuer(t: TFunction): Record<ZugangsArt, Weg> {
  return {
    kunde: {
      augenbraue: t("auth.zugang.kunde.augenbraue"),
      titel: t("auth.zugang.kunde.titel"),
      absaetze: [t("auth.zugang.kunde.absatz_1"), t("auth.zugang.kunde.absatz_2")],
      chips: [],
      entfaellt: {
        ueberschrift: t("auth.zugang.kunde.entfaellt_titel"),
        text: t("auth.zugang.kunde.entfaellt_text"),
        punkte: [
          t("auth.zugang.kunde.entfaellt_1"),
          t("auth.zugang.kunde.entfaellt_2"),
          t("auth.zugang.kunde.entfaellt_3"),
          t("auth.zugang.kunde.entfaellt_4"),
        ],
      },
      schritteTitel: t("auth.zugang.schritte_titel"),
      schritte: [
        t("auth.zugang.kunde.schritt_1"),
        t("auth.zugang.kunde.schritt_2"),
        t("auth.zugang.kunde.schritt_3"),
        t("auth.zugang.kunde.schritt_4"),
        t("auth.zugang.kunde.schritt_5"),
      ],
      aufruf: {
        text: t("auth.zugang.kunde.aufruf"),
        ziel: "https://more.immo/kontakt",
        extern: true,
        danach: t("auth.zugang.kunde.danach"),
      },
    },

    partner: {
      augenbraue: t("auth.zugang.partner.augenbraue"),
      titel: t("auth.zugang.partner.titel"),
      absaetze: [t("auth.zugang.partner.absatz_1"), t("auth.zugang.partner.absatz_2")],
      chips: [
        t("auth.zugang.partner.chip_1"),
        t("auth.zugang.partner.chip_2"),
        t("auth.zugang.partner.chip_3"),
      ],
      entfaellt: {
        ueberschrift: t("auth.zugang.partner.entfaellt_titel"),
        text: t("auth.zugang.partner.entfaellt_text"),
        punkte: [
          t("auth.zugang.partner.entfaellt_1"),
          t("auth.zugang.partner.entfaellt_2"),
          t("auth.zugang.partner.entfaellt_3"),
          t("auth.zugang.partner.entfaellt_4"),
        ],
      },
      schritteTitel: t("auth.zugang.schritte_titel"),
      schritte: [
        t("auth.zugang.partner.schritt_1"),
        t("auth.zugang.partner.schritt_2"),
        // Deutsch kommt der Name aus bewerberKennenlernen, damit er an einer
        // Stelle gepflegt bleibt. Englisch steht er im Sprachpaket.
        t("auth.zugang.partner.schritt_3", { name: GESPRAECH_NAME }),
        t("auth.zugang.partner.schritt_4"),
        t("auth.zugang.partner.schritt_5"),
      ],
      aufruf: {
        text: t("auth.zugang.partner.aufruf"),
        ziel: "/karriere/vertriebspartner-immobilien",
        extern: false,
        danach: t("auth.zugang.partner.danach"),
      },
    },
  };
}

export function ZugangWeg({ art, onZurueck }: { art: ZugangsArt; onZurueck: () => void }) {
  const { t } = useTranslation();
  const weg = wegeFuer(t)[art];

  const kopf = useRef<HTMLDivElement>(null);

  /*
    Auf dem Handy stehen die beiden Kaesten weit unten. Ohne diesen Sprung
    oeffnet sich der Weg an derselben Scrollposition, und der Leser landet
    mitten im Text statt bei der Ueberschrift.

    Gescrollt wird NICHT das Fenster. Ueber der Anmeldeseite liegt das <main>
    der Anwendung mit eigenem Scrollbereich, das Fenster selbst steht immer
    auf null. Deshalb sucht der Sprung den naechsten Vorfahren, der wirklich
    scrollt, und faellt erst danach auf das Fenster zurueck.
  */
  useEffect(() => {
    let el: HTMLElement | null = kopf.current;
    while (el) {
      const rollt = /auto|scroll/.test(getComputedStyle(el).overflowY);
      if (rollt && el.scrollHeight > el.clientHeight) {
        el.scrollTop = 0;
        return;
      }
      el = el.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [art]);

  return (
    <div ref={kopf} className="w-full">
      <button
        type="button"
        onClick={onZurueck}
        className="mb-6 -ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("auth.zugang.zurueck_anmeldung")}
      </button>

      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-primary">
        {weg.augenbraue}
      </p>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
        {weg.titel}
      </h1>

      <div className="mt-4 space-y-3">
        {weg.absaetze.map((absatz) => (
          <p key={absatz} className="text-[13.5px] leading-relaxed text-muted-foreground">
            {absatz}
          </p>
        ))}
      </div>

      {weg.chips.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {weg.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[12px] text-foreground/80"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {/*
        Der abgesetzte Kasten nimmt die Sorge vorweg, statt sie zu übergehen.
        Die durchgestrichene Liste ist Absicht: Sie sagt in einem Blick, was
        hier NICHT passiert.
      */}
      <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {weg.entfaellt.ueberschrift}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">
          {weg.entfaellt.text}
        </p>
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {weg.entfaellt.punkte.map((punkt) => (
            <li key={punkt} className="flex items-center gap-2.5 text-[12.5px] text-muted-foreground">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/60" />
              <span className="line-through decoration-muted-foreground/50">{punkt}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-7 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {weg.schritteTitel}
      </p>

      {/*
        Die Linie zwischen den Punkten entsteht aus dem linken Rand der Liste
        und wird am letzten Schritt gekappt, sonst liefe sie ins Leere.
      */}
      <ol className="mt-3 space-y-0">
        {weg.schritte.map((schritt, i) => {
          const letzter = i === weg.schritte.length - 1;
          return (
            <li key={schritt} className="relative flex gap-3.5 pb-4 last:pb-0">
              {/*
                Die Linie haengt am <li> und nicht am Punkt-Behaelter: Der ist
                nur so hoch wie der Punkt selbst, eine Linie darin endete nach
                zehn Pixeln. Die 5,5 Pixel sind die Mitte der 12 Pixel breiten
                Spalte, die unteren 6 schliessen die Luecke zum naechsten Punkt.
              */}
              {!letzter && (
                <span
                  aria-hidden
                  className="absolute left-[5.5px] top-4 bottom-[-6px] w-px bg-border"
                />
              )}
              <span className="flex w-3 shrink-0 justify-center">
                <span
                  aria-hidden
                  className={`relative mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                    letzter ? "border-primary bg-primary" : "border-primary bg-background"
                  }`}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block text-[13.5px] font-semibold leading-snug text-foreground">
                  {schritt}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-7">
        {weg.aufruf.extern ? (
          <a
            href={weg.aufruf.ziel}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {weg.aufruf.text}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        ) : (
          <Link
            to={weg.aufruf.ziel}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {weg.aufruf.text}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
        <p className="mt-2.5 text-center text-[12px] leading-relaxed text-muted-foreground">
          {weg.aufruf.danach}
        </p>
      </div>

      {/*
        Der zweite Weg bleibt erreichbar. Wer hier gelandet ist und merkt,
        dass er den anderen meinte, soll nicht über die Anmeldung zurück.
      */}
      <div className="mt-7 border-t border-border pt-4">
        <p className="text-[12.5px] text-muted-foreground">
          {art === "kunde" ? t("auth.zugang.wechsel_kunde") : t("auth.zugang.wechsel_partner")}{" "}
          <button
            type="button"
            onClick={onZurueck}
            className="font-semibold text-primary hover:underline"
          >
            {t("auth.zugang.zurueck_uebersicht")}
          </button>
        </p>
      </div>
    </div>
  );
}
