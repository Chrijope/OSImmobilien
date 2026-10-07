import { Fragment, type ReactNode } from "react";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import {
  PLATZHALTER,
  abschnittNummer,
  type DatenschutzAbschnitt,
  type DatenschutzBaustein,
  type DatenschutzFassung,
} from "@/lib/datenschutzTexte";

/**
 * Stellt eine Fassung der Datenschutzerklärung dar: Inhaltsverzeichnis mit
 * Sprungmarken, dann die Abschnitte. Der Wortlaut steht vollständig in
 * `src/lib/datenschutzTexte.ts`, hier wird nur gezeichnet. So kann der Anwalt
 * Texte ändern lassen, ohne dass jemand JSX anfassen muss.
 */
export function DatenschutzInhalt({ fassung, sprache }: { fassung: DatenschutzFassung; sprache: "de" | "en" }) {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-6">{fassung.stand}</p>

      <nav aria-labelledby="datenschutz-inhalt" className="mb-10 rounded-lg border border-border bg-muted/40 p-4 sm:p-5">
        <h2 id="datenschutz-inhalt" className="text-base font-semibold mb-3">
          {fassung.inhaltTitel}
        </h2>
        <ol className="space-y-1 text-sm">
          {fassung.abschnitte.map((a, i) => (
            <li key={a.id} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums shrink-0 w-6">{abschnittNummer(i)}</span>
              <a href={`#${a.id}`} className="text-primary hover:underline">
                {a.titel}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground">
        {fassung.abschnitte.map((a, i) => (
          <Abschnitt key={a.id} abschnitt={a} nummer={abschnittNummer(i)} sprache={sprache} />
        ))}
      </div>
    </>
  );
}

function Abschnitt({ abschnitt, nummer, sprache }: { abschnitt: DatenschutzAbschnitt; nummer: string; sprache: "de" | "en" }) {
  return (
    <section id={abschnitt.id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold mt-10 mb-3">
        {nummer} {abschnitt.titel}
      </h2>
      <Bausteine bausteine={abschnitt.inhalt} sprache={sprache} />
      {abschnitt.unterabschnitte?.map((u, j) => (
        <div key={u.id} id={u.id} className="scroll-mt-24">
          <h3 className="text-base font-semibold mt-6 mb-2">
            {nummer}
            {j + 1} {u.titel}
          </h3>
          <Bausteine bausteine={u.inhalt} sprache={sprache} />
        </div>
      ))}
    </section>
  );
}

function Bausteine({ bausteine, sprache }: { bausteine: DatenschutzBaustein[]; sprache: "de" | "en" }) {
  return (
    <div className="space-y-3">
      {bausteine.map((b, i) => (
        <Baustein key={i} baustein={b} sprache={sprache} />
      ))}
    </div>
  );
}

function Baustein({ baustein, sprache }: { baustein: DatenschutzBaustein; sprache: "de" | "en" }) {
  if (typeof baustein === "string") return <p>{mitVerweisen(baustein)}</p>;
  if ("liste" in baustein) {
    return (
      <ul className="list-disc pl-6 space-y-1">
        {baustein.liste.map((punkt, i) => (
          <li key={i}>{mitVerweisen(punkt)}</li>
        ))}
      </ul>
    );
  }
  if ("zeilen" in baustein) {
    return (
      <p>
        {baustein.zeilen.map((zeile, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {mitVerweisen(zeile)}
          </Fragment>
        ))}
      </p>
    );
  }
  if ("tabelle" in baustein) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-border">
          <thead className="bg-muted">
            <tr>
              {baustein.tabelle.kopf.map((k) => (
                <th key={k} className="text-left align-top px-3 py-2 border-b border-border">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baustein.tabelle.zeilen.map((zeile, i) => (
              <tr key={i}>
                {zeile.map((zelle, j) => (
                  <td key={j} className="align-top px-3 py-2 border-b border-border">
                    {mitVerweisen(zelle)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // Der Link, der den Cookie-Banner in der Einstellungsansicht öffnet.
  return (
    <p>
      {baustein.cookieEinstellungen}{" "}
      <CookieEinstellungenLink sprache={sprache} className="text-primary underline hover:no-underline" />
    </p>
  );
}

/**
 * Macht Webadressen und Mailadressen im Fließtext anklickbar und hebt
 * Platzhalter sichtbar hervor. Die Texte bleiben dadurch reine Zeichenketten.
 */
const VERWEIS = /(https?:\/\/[^\s)]+[^\s).,;:]|[\w.+-]+@[\w-]+\.[\w.-]*\w|\[Angabe ergänzen\]|\[to be completed\])/g;

function mitVerweisen(text: string): ReactNode {
  const teile = text.split(VERWEIS);
  if (teile.length === 1) return text;
  return teile.map((teil, i) => {
    if (i % 2 === 0) return teil;
    if (teil === PLATZHALTER.de || teil === PLATZHALTER.en) {
      return (
        <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">
          {teil}
        </mark>
      );
    }
    if (teil.startsWith("http")) {
      return (
        <a key={i} href={teil} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline break-all">
          {teil}
        </a>
      );
    }
    return (
      <a key={i} href={`mailto:${teil}`} className="text-primary underline hover:no-underline">
        {teil}
      </a>
    );
  });
}
