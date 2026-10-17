/**
 * Die zwei Wege oben auf der Ergebnisseite (seit dem 17.10.2026): „Mehr
 * Netto vom Brutto“ und „Altersvorsorge mit einer, zwei, drei Wohnungen“,
 * mit dem Altersregler. Dieselben Bausteine wie Kapitel 6 und 8 im Handbuch
 * und im PDF (osWegeBloecke.ts), damit Seite, Handbuch und PDF gleich
 * aussehen und gleich rechnen. Das Alter reicht die Seite an das Handbuch
 * weiter, auch an das PDF.
 */
import { useId } from "react";
import type { HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";
import { inSprache } from "@/lib/handbuch/diagramme";
import { ALTER_MAX, ALTER_MIN, nettoWeg, vorsorgeWeg } from "@/lib/handbuch/osWege";
import { nettoBloecke, vorsorgeBloecke } from "@/lib/handbuch/osWegeBloecke";
import { BlockAnsicht } from "./HandbuchAnsicht";

const TEXTE = {
  de: {
    titel: "Deine zwei Wege",
    lead: "Gerechnet an echten Wohnungen aus unserem Bestand, mit deinem Steuersatz. Dieselben Zahlen stehen in deinem Handbuch und im PDF.",
    netto: "Weg 1 · Steuerersparnis",
    alter: "Weg 2 · Altersvorsorge",
    regler: "Dein Alter heute",
    jahre: (n: number) => `${n} Jahre`,
    reglerHinweis: "Das Handbuch und das PDF rechnen mit diesem Alter.",
  },
  en: {
    titel: "Your two paths",
    lead: "Calculated with real flats from our portfolio, at your tax rate. The same figures are in your handbook and the PDF.",
    netto: "Path 1 · Tax savings",
    alter: "Path 2 · Retirement provision",
    regler: "Your age today",
    jahre: (n: number) => `${n} years`,
    reglerHinweis: "The handbook and the PDF use this age.",
  },
};

export default function WegeAnsicht({
  antworten,
  rahmenBis,
  alter,
  onAlter,
  sprache,
}: {
  antworten: HandbuchAntworten;
  rahmenBis: number;
  alter: number;
  onAlter: (alter: number) => void;
  sprache: Sprache;
}) {
  const T = sprache === "en" ? TEXTE.en : TEXTE.de;
  const en = sprache === "en";
  const id = useId();
  const netto = inSprache(sprache, () => nettoBloecke(nettoWeg(antworten, rahmenBis, alter)));
  const vorsorge = inSprache(sprache, () => vorsorgeBloecke(vorsorgeWeg(antworten, rahmenBis, alter)));
  return (
    <section className="hb-abschnitt hb-wege" style={{ paddingTop: 48, paddingBottom: 0 }}>
      <div className="hb-wrap">
        <h2 className="hb-h2">{T.titel}</h2>
        <p className="hb-lead">{T.lead}</p>
        <div className="hb-wege-raster">
          <article className="hb-buch-seite hb-wege-karte">
            <div className="kap">{T.netto}</div>
            {netto.map((b, i) => (
              <BlockAnsicht key={i} b={b} en={en} />
            ))}
          </article>
          <article className="hb-buch-seite hb-wege-karte">
            <div className="kap">{T.alter}</div>
            <label className="hb-alter" htmlFor={id}>
              <span>{T.regler}</span>
              <input
                id={id}
                type="range"
                min={ALTER_MIN}
                max={ALTER_MAX}
                value={alter}
                onChange={(e) => onAlter(Number(e.target.value))}
                aria-valuetext={T.jahre(alter)}
              />
              <b>{T.jahre(alter)}</b>
            </label>
            <p className="hb-klein" style={{ marginTop: 4 }}>{T.reglerHinweis}</p>
            {vorsorge.map((b, i) => (
              <BlockAnsicht key={i} b={b} en={en} />
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
