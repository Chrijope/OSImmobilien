/**
 * Die Folien des Bewerber-Videocalls: das Fenster, das im Termin geteilt wird.
 *
 * Acht bis zehn Folien statt zweiundzwanzig. Sieben Kernbausteine laufen immer,
 * die Module kommen aus der Strecke des Bewerbers und aus seinen offenen
 * Fragen. Was auf den Folien steht, kommt aus seinen eigenen Antworten im
 * Kennenlernen; erzählt wird nichts, was er dort schon gesagt hat. Die ganze
 * Logik dazu steht in `bewerberVideocall.ts`, hier wird nur gezeichnet.
 *
 * Seit dem 23.09.2026 ist das die einzige Präsentation im Videocall, für
 * Bewerber im alten wie im neuen Ablauf. Sie liegt unter der Adresse
 * `/closing-praesentation-entwurf`, die ihren Namen behalten hat. Das alte
 * Deck mit 22 Folien (`ClosingPraesentationEntwurf.tsx`) zeigt nur noch die
 * Übung unter `/praesentation-uebung`.
 *
 * Kopplung: dieselbe wie beim bestehenden Deck (`praesentationsKopplung.ts`).
 * Die Moderation sendet die aktive Folien-Id, diese Seite springt hin und
 * meldet eigene Wechsel zurück. Ohne gekoppeltes Fenster arbeitet sie für
 * sich weiter.
 *
 * Der Bewerber bedient hier nichts. Die Kopplung läuft über einen Kanal
 * innerhalb desselben Browsers; eine Bedienung durch den Bewerber ist damit
 * technisch ausgeschlossen und für den ersten Ausbau auch nicht nötig.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import logo from "@/assets/moreimmo-logo.png";
import { useBewerberAusCache } from "@/components/bewerbung/useBewerberAusCache";
import {
  useKennenlernenAntworten,
  useVideocallErfassung,
  useVideocallFolien,
} from "@/components/bewerbung/useBewerberVideocall";
import type { FolienBlock, VideocallFolie } from "@/lib/bewerberVideocall";
import { findeFolienIndex, oeffneKanal, type KopplungsNachricht } from "@/lib/praesentationsKopplung";

/* ── Farbwelt ──────────────────────────────────────────────────────────────
   Dieselben Töne wie das bestehende Deck. Die Präsentation läuft dunkel, weil
   sie im Termin als Bühne wirkt und nicht wie eine weitere CRM-Seite
   aussehen soll. */
const AKZENT = "#7CBEFF";
const VERLAUF = "linear-gradient(90deg, #5CB0FF 0%, #0A6EDB 100%)";
const GEDIMMT = "rgba(246,248,252,0.6)";
const GEDIMMTER = "rgba(246,248,252,0.45)";
const FLAECHE = "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";
const FLAECHE_WARNUNG = "linear-gradient(160deg, rgba(255,196,120,0.14) 0%, rgba(255,196,120,0.03) 100%)";
const RAND = "1px solid rgba(255,255,255,0.10)";
/** Glanz-Verlauf für das eine Schlüsselwort jeder Folie, wie im Closing-Deck. */
const GLANZ_VERLAUF = "linear-gradient(105deg, #C4E1FF 0%, #7CBEFF 45%, #3E8EF0 100%)";

/**
 * Schlüsselwort im hellen Blauverlauf statt in flacher Akzentfarbe.
 *
 * Pro Folie bewusst nur an einer Stelle, sonst wird der Glanz Tapete statt
 * Fokus. Welches Wort es ist, steht an der Folie (`glanz`) und nicht hier.
 */
function Glanz({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="cp-glanz"
      style={{
        background: GLANZ_VERLAUF,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Setzt genau ein Wort der Überschrift in den Glanzverlauf.
 *
 * Steht das Wort nicht in der Überschrift, bleibt sie einfarbig. Die Ansicht
 * muss also nichts prüfen, und eine geänderte Überschrift kann nichts
 * zerbrechen.
 */
function UeberschriftMitGlanz({ text, glanz }: { text: string; glanz: string }) {
  const stelle = glanz ? text.indexOf(glanz) : -1;
  if (stelle < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, stelle)}
      <Glanz>{glanz}</Glanz>
      {text.slice(stelle + glanz.length)}
    </>
  );
}

/**
 * Blendet Inhalte beim Erscheinen der Folie gestaffelt ein, wie in der
 * Closing-Präsentation. `motion-reduce:animate-none` lässt bei reduzierter
 * Bewegung alles sofort stehen.
 */
function Einblendung({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-4 duration-700 motion-reduce:animate-none ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {children}
    </div>
  );
}

/** Überschrift eines Blocks. */
function BlockTitel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: AKZENT }}>
      {children}
    </p>
  );
}

/** Kartenfläche, in der jeder Block sitzt. */
function Karte({
  children,
  ton = "neutral",
}: {
  children: React.ReactNode;
  ton?: "neutral" | "warnung";
}) {
  return (
    /* Rahmenlose weiche Fläche statt Kasten mit Rand: dieselbe Bildsprache wie
       die Closing-Präsentation. Der Verlauf trägt die Abgrenzung, eine Linie
       braucht es dafür nicht. */
    <div
      className="rounded-2xl p-5 md:p-6 h-full"
      style={{ background: ton === "warnung" ? FLAECHE_WARNUNG : FLAECHE }}
    >
      {children}
    </div>
  );
}

function Aufzaehlung({ punkte }: { punkte: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-snug" style={{ color: GEDIMMT }}>
      {punkte.map((p, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: AKZENT }} />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ein Block der Folie. Wenige Formen, bewusst. */
function Block({ block }: { block: FolienBlock }) {
  switch (block.art) {
    case "liste":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          {block.unterzeile && (
            <p className="text-base md:text-lg font-semibold mb-3 leading-snug">{block.unterzeile}</p>
          )}
          <Aufzaehlung punkte={block.punkte} />
        </Karte>
      );

    case "schritte":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          <ol className="space-y-2.5">
            {block.schritte.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-semibold"
                  style={{ background: "rgba(124,190,255,0.14)", color: AKZENT }}
                >
                  {s.wer}
                </span>
                <span className="text-sm leading-snug">
                  <span className="font-semibold">{s.titel}</span>
                  <span style={{ color: GEDIMMT }}> · {s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Karte>
      );

    case "kasten":
      return (
        <Karte ton={block.ton === "warnung" ? "warnung" : "neutral"}>
          {block.titel && <BlockTitel>{block.titel}</BlockTitel>}
          <p className="text-sm leading-relaxed" style={{ color: GEDIMMT }}>{block.text}</p>
        </Karte>
      );

    case "zitat":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          <p className="text-base md:text-xl font-semibold leading-snug">„{block.text}“</p>
          {block.hinweis && (
            <p className="text-xs leading-relaxed mt-3" style={{ color: GEDIMMTER }}>{block.hinweis}</p>
          )}
        </Karte>
      );

    case "gegenueber":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          {block.unterzeile && (
            <p className="text-sm mb-3 leading-snug" style={{ color: GEDIMMT }}>{block.unterzeile}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {block.spalten.map((s) => (
                    <th
                      key={s}
                      className="text-left font-semibold pb-2 pr-4 text-[11px] uppercase tracking-[0.14em]"
                      style={{ color: GEDIMMTER }}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.zeilen.map(([links, rechts], i) => (
                  <tr key={i} style={{ borderTop: RAND }}>
                    <td className="py-2 pr-4 align-top font-medium">{links}</td>
                    <td className="py-2 align-top" style={{ color: GEDIMMT }}>{rechts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Karte>
      );

    case "agenda":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          <ul className="space-y-2">
            {block.zeilen.map((z, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 text-sm" style={{ borderBottom: i < block.zeilen.length - 1 ? RAND : undefined }}>
                <span className="pb-2">{z.text}</span>
                <span className="pb-2 shrink-0 tabular-nums" style={{ color: GEDIMMTER }}>{z.minuten} Min</span>
              </li>
            ))}
          </ul>
        </Karte>
      );

    case "themen":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          {block.themen.length > 0 ? (
            <ol className="space-y-2 mb-4">
              {block.themen.map((t, i) => (
                <li key={i} className="flex gap-3 items-baseline">
                  <span className="text-xs tabular-nums" style={{ color: AKZENT }}>{i + 1}</span>
                  <span className="text-base md:text-lg font-semibold leading-snug">{t}</span>
                </li>
              ))}
            </ol>
          ) : (
            /*
             * Ohne markiertes Thema stand hier bis zum 22.09.2026 eine
             * Feststellung darüber, was der Bewerber nicht getan hat, und das
             * als erster Satz des Gesprächs. Was stattdessen dasteht,
             * entscheidet `ersatzFuerThemen` aus seinen eigenen Antworten.
             */
            block.ersatz && (
              <p className="text-sm mb-4 leading-relaxed" style={{ color: GEDIMMT }}>
                {block.ersatz}
              </p>
            )
          )}
          {block.frage && (
            <>
              <BlockTitel>{block.frageTitel ?? "Und deine eigene Frage"}</BlockTitel>
              <p className="text-sm md:text-base italic leading-snug">„{block.frage}“</p>
            </>
          )}
        </Karte>
      );

    case "tueren":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          {block.unterzeile && (
            <p className="text-sm mb-4 leading-relaxed" style={{ color: GEDIMMT }}>{block.unterzeile}</p>
          )}
          {/* Drei gleich große Türen, keine ist hervorgehoben. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {block.tueren.map((t, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: RAND }}>
                <p className="text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: GEDIMMTER }}>
                  Tür {i + 1}
                </p>
                <p className="text-sm font-semibold leading-snug mb-1">{t.titel}</p>
                <p className="text-xs leading-relaxed" style={{ color: GEDIMMT }}>{t.text}</p>
              </div>
            ))}
          </div>
        </Karte>
      );

    case "plan":
      return (
        <Karte>
          <BlockTitel>{block.titel}</BlockTitel>
          <ol className="space-y-3">
            {block.stufen.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] font-semibold"
                  style={{ background: "rgba(124,190,255,0.14)", color: AKZENT }}
                >
                  {s.wann}
                </span>
                <span className="text-sm leading-snug">
                  <span className="font-semibold">{s.titel}</span>
                  <span style={{ color: GEDIMMT }}> · {s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Karte>
      );

    default:
      return null;
  }
}

/**
 * Eine Folie. Zwei Spalten, wo zwei Blöcke nebeneinander gehören, sonst
 * untereinander. Exportiert, weil die Moderation dieselbe Folie als kleine
 * Vorschau zeigt: eine Folienquelle für beide Fenster.
 */
export function BewerberVideocallFolie({ folie }: { folie: VideocallFolie }) {
  // Die ersten beiden Blöcke stehen nebeneinander, wenn beide Listen sind.
  const nebeneinander =
    folie.bloecke.length >= 2 &&
    folie.bloecke[0].art === "liste" &&
    folie.bloecke[1].art === "liste";
  const rest = nebeneinander ? folie.bloecke.slice(2) : folie.bloecke;

  return (
    <section className="h-full w-full overflow-y-auto">
      <div className="min-h-full px-6 md:px-14 py-10 md:py-14 max-w-6xl mx-auto">
        {/* Kicker, große ruhige Überschrift, gestaffelte Einblendung: dieselben
            drei Merkmale wie in der Closing-Präsentation. */}
        <Einblendung delay={0}>
          <p className="text-[11px] uppercase tracking-[0.3em] font-semibold" style={{ color: AKZENT }}>
            {folie.kicker} · {folie.kopfzeile}
          </p>
        </Einblendung>
        <Einblendung delay={150}>
          <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight">
            <UeberschriftMitGlanz text={folie.titel} glanz={folie.glanz} />
          </h1>
          <p className="mt-3 text-sm md:text-lg" style={{ color: GEDIMMT }}>{folie.unterzeile}</p>
        </Einblendung>

        <Einblendung delay={450} className="mt-8 md:mt-10">
          <div className="space-y-4">
            {nebeneinander && (
              <div className="grid gap-4 md:grid-cols-2">
                <Block block={folie.bloecke[0]} />
                <Block block={folie.bloecke[1]} />
              </div>
            )}
            {rest.map((b, i) => <Block key={i} block={b} />)}
          </div>
        </Einblendung>

        <Einblendung delay={1300}>
          <p className="mt-8 text-[11px]" style={{ color: GEDIMMTER }}>
            {folie.nummerText} · {folie.quelle}
          </p>
        </Einblendung>
      </div>
    </section>
  );
}

/** Der leere Zustand: ohne Kennenlernen gibt es diesen Termin nicht. */
/**
 * Der Ersatzbildschirm, wenn es nichts zu zeigen gibt.
 *
 * `titel` ist die Feststellung, `text` die Erklärung dazu. Beide gehen über
 * die Bildschirmfreigabe an den Bewerber, deshalb steht hier ausdrücklich
 * **nicht**, was das Haus zu tun hat. Diesen Teil des Befunds
 * (`kennenlernBefund().zuTun`) zeigen nur die Moderation und der Reiter.
 */
function OhneKennenlernen({ titel, text }: { titel: string; text?: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center px-6 text-center">
      <div className="max-w-lg">
        <img src={logo} alt="MOREImmo" className="h-8 w-auto mx-auto mb-6 brightness-0 invert" />
        <p className="text-lg font-semibold">{titel}</p>
        <p className="mt-3 text-sm" style={{ color: GEDIMMT }}>
          {text ||
            "Der Weg in die Buchung führt ausschließlich über das Kennenlernen, weil sich sonst weder die Dauer noch die Module bestimmen lassen."}
        </p>
      </div>
    </div>
  );
}

/**
 * Die Bühne: Fortschrittslinie, Kopfzeile, die aktive Folie, die Fußleiste.
 * Eingebettet (Vorschau in der Moderation) ohne Knöpfe.
 */
export function BewerberVideocallBuehne({
  folien,
  aktiv,
  eingebettet = false,
  onGeheZu,
}: {
  folien: VideocallFolie[];
  aktiv: number;
  eingebettet?: boolean;
  onGeheZu?: (index: number) => void;
}) {
  const folie = folien[aktiv];
  return (
    <div
      className={`${eingebettet ? "absolute" : "fixed"} inset-0 flex flex-col text-[#F6F8FC] font-sans`}
      style={{
        background: "radial-gradient(1200px 700px at 50% -10%, #14243F 0%, #0B1526 45%, #070D1A 100%)",
      }}
    >
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-500 ease-out motion-reduce:transition-none"
          style={{ width: folien.length ? `${((aktiv + 1) / folien.length) * 100}%` : "0%", background: VERLAUF }}
        />
      </div>

      <header
        className="relative shrink-0 h-14 px-5 md:px-8 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <img src={logo} alt="MOREImmo" className="h-7 w-auto brightness-0 invert" />
          <span className="text-xs uppercase tracking-[0.3em] font-semibold hidden sm:inline" style={{ color: GEDIMMTER }}>
            Partner
          </span>
        </div>
        {folie && (
          <span className="text-xs" style={{ color: GEDIMMTER }}>
            {folie.kopfzeile}
          </span>
        )}
      </header>

      <main className="relative flex-1 min-h-0">
        {folie ? (
          <div key={folie.id} className="h-full">
            <BewerberVideocallFolie folie={folie} />
          </div>
        ) : (
          <OhneKennenlernen titel="Diese Folie lässt sich gerade nicht anzeigen." />
        )}
      </main>

      <footer
        className="relative shrink-0 h-16 px-5 md:px-8 flex items-center justify-between gap-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-xs tabular-nums w-24" style={{ color: GEDIMMTER }}>
          {folien.length > 0 ? `Folie ${aktiv + 1} / ${folien.length}` : ""}
        </span>
        {!eingebettet && onGeheZu && folien.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {folien.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onGeheZu(i)}
                  aria-label={`Folie ${i + 1}: ${f.titel}`}
                  title={f.kopfzeile}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === aktiv ? 22 : 8,
                    background: i === aktiv ? AKZENT : "rgba(255,255,255,0.22)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 w-24 justify-end">
              <button
                type="button"
                onClick={() => onGeheZu(Math.max(0, aktiv - 1))}
                disabled={aktiv === 0}
                aria-label="Vorherige Folie"
                className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ border: RAND }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onGeheZu(Math.min(folien.length - 1, aktiv + 1))}
                disabled={aktiv >= folien.length - 1}
                aria-label="Nächste Folie"
                className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ border: RAND }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}

export default function BewerberVideocallPraesentation() {
  const [params] = useSearchParams();
  const bewerberId = params.get("bewerberId") ?? "";
  const { bewerber } = useBewerberAusCache(bewerberId);
  const { antworten, befund } = useKennenlernenAntworten(bewerberId, bewerber?.vorname ?? "");
  // Die Präsentation spiegelt den Stand nur, sie schreibt ihn nicht.
  const { erfassung } = useVideocallErfassung(bewerber, false);
  const folien = useVideocallFolien(antworten, erfassung);

  const [aktiv, setAktiv] = useState(0);
  const kanalRef = useRef<ReturnType<typeof oeffneKanal>>(null);
  const folienRef = useRef(folien);
  folienRef.current = folien;

  const geheZu = useCallback((index: number) => {
    const liste = folienRef.current;
    if (liste.length === 0) return;
    const ziel = Math.max(0, Math.min(liste.length - 1, index));
    setAktiv(ziel);
    kanalRef.current?.senden({ typ: "folie", folieId: liste[ziel].id });
  }, []);

  // Kopplung mit der Moderation. Ohne Kanal läuft die Seite für sich weiter.
  useEffect(() => {
    const kanal = oeffneKanal(bewerberId);
    kanalRef.current = kanal;
    if (!kanal) return;
    const springe = (folieId: string) => {
      const i = findeFolienIndex(folienRef.current, folieId);
      if (i >= 0) setAktiv(i);
    };
    const ab = kanal.empfangen((n: KopplungsNachricht) => {
      if (n.typ === "gehe-zu" || n.typ === "zustand") springe(n.folieId);
      if (n.typ === "ping") kanal.senden({ typ: "pong" });
      if (n.typ === "anfrage") {
        const liste = folienRef.current;
        if (liste.length > 0) kanal.senden({ typ: "folie", folieId: liste[0].id });
      }
    });
    kanal.senden({ typ: "anfrage" });
    return () => { ab(); kanal.schliessen(); kanalRef.current = null; };
  }, [bewerberId]);

  // Tastatur: dieselbe Bedienung wie im bestehenden Deck.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [aktiv, geheZu]);

  if (folien.length === 0) {
    return (
      <div
        className="fixed inset-0 text-[#F6F8FC] font-sans"
        style={{ background: "radial-gradient(1200px 700px at 50% -10%, #14243F 0%, #0B1526 45%, #070D1A 100%)" }}
      >
        {/* Der Befund sagt, woran es liegt. Der Teil „was zu tun ist" bleibt
            bewusst draußen: Dieser Bildschirm wird geteilt. */}
        <OhneKennenlernen titel={befund.titel} text={befund.text} />
      </div>
    );
  }

  return <BewerberVideocallBuehne folien={folien} aktiv={aktiv} onGeheZu={geheZu} />;
}
