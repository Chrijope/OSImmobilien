/**
 * Abschnitt 08 der Beratungspräsentation: die beiden Vertriebs-PDFs als
 * Folien, Seite für Seite. Die Grafiken sind nachgebaut (HTML und SVG),
 * keine Bilder aus dem PDF, damit sie auf jedem Bildschirm scharf bleiben
 * und mit hellem wie dunklem Grund funktionieren.
 *
 * Texte und Zahlen: `src/lib/beratungKonzeptDaten.ts`.
 */
import type { ReactNode } from "react";
import { ArrowRight, HandCoins, Home, Landmark } from "lucide-react";
import { FARBE, Folie, Fussnote, Karte, Kopf, Titel, mitAkzent } from "@/components/beratung/folienBausteine";
import { Sichtbar, ZahlText, verzoegert } from "@/components/beratung/Bewegung";
import {
  KONZEPT_ALTER,
  KONZEPT_STEUER,
  MONATSVERLAUF,
  VERLAUF_WOHNUNG,
  type KennKarte,
  type StapelTeil,
  type WasserfallZeile,
} from "@/lib/beratungKonzeptDaten";

/** Farben der PDFs. Auf dunklem Grund die hellen Stufen (mint, rosé, champagner). */
const P = {
  gruen: "#198A5F",
  mint: "#5FD39C",
  rot: "#C0564A",
  rose: "#E8A49B",
  grau: "#9AA29E",
  grauDunkel: "#7E8A84",
  gold: "#CCAC05",
  goldText: "#8A7404",
  champagner: "#D8C79F",
  navy: "#12362A",
  orange: "#F26B3A",
  blau: "#3F51B5",
};

const gruenAuf = (dunkel: boolean) => (dunkel ? P.mint : P.gruen);

/** Titelbild des Altersvorsorge-Dokuments: Altbauwohnung, wie im PDF. */
const FOTO_ALTBAU = "/images/mikroseite/barfuss-altbau-innen.jpg";

/** Vorangestellte Nummer des Abschnitts, z. B. „08 · Steuerersparnis · 01 Die Sicht des Finanzamts“. */
const kicker = (block: string, teil?: string) => `08 · ${block}${teil ? ` · ${teil.replace(/^(\d\d) · /, "$1 ")}` : ""}`;

/** Großer Wert in der Farbe des Tons. */
function Gross({ children, farbe, className = "" }: { children: ReactNode; farbe?: string; className?: string }) {
  return (
    <p className={`font-semibold tracking-[-0.03em] tabular-nums leading-none break-words ${className}`} style={{ color: farbe }}>
      {children}
    </p>
  );
}

/** Zwei Karten nebeneinander: Heute (grau) und mit OS Real Estate (Grün mit Goldrand). */
function HeuteMitOs({
  heute,
  mitOs,
  dunkel,
}: {
  heute: { etikett?: string; wert: string; text: string };
  mitOs: { etikett?: string; wert: string; text: string };
  dunkel: boolean;
}) {
  return (
    <div className="mt-8 grid md:grid-cols-2 gap-4">
      <Karte dunkel={dunkel}>
        <Kopf dunkel={dunkel}>{heute.etikett ?? "Heute"}</Kopf>
        <Gross farbe={dunkel ? P.rose : P.rot} className="mt-3 text-[2.4rem] md:text-[3rem]">
          {heute.wert}
        </Gross>
        <p className="mt-3 text-sm md:text-base">{heute.text}</p>
      </Karte>
      <Karte dunkel={dunkel} rand={gruenAuf(dunkel)}>
        <Kopf dunkel={dunkel}>{mitOs.etikett ?? "Mit OS Real Estate"}</Kopf>
        <Gross farbe={gruenAuf(dunkel)} className="mt-3 text-[2.8rem] md:text-[3.6rem]">
          <ZahlText text={mitOs.wert} />
        </Gross>
        <p className="mt-3 text-sm md:text-base">{mitOs.text}</p>
      </Karte>
    </div>
  );
}

/** Ring aus drei Teilen (Netto, Lohnsteuer, Sozialabgaben), per CSS conic-gradient. */
function Ring({ teile, mitte, unter }: { teile: ReadonlyArray<{ betrag: number; farbe: string }>; mitte: string; unter: string }) {
  const summe = teile.reduce((s, t) => s + t.betrag, 0);
  let start = 0;
  const stopps = teile
    .map((t) => {
      const von = start;
      start += (t.betrag / summe) * 360;
      return `${t.farbe} ${von}deg ${start}deg`;
    })
    .join(", ");
  return (
    <div
      role="img"
      aria-label={`${mitte} ${unter}`}
      className="relative mx-auto aspect-square w-full max-w-[16rem] rounded-full"
      style={{ background: `conic-gradient(${stopps})` }}
    >
      <div className="absolute inset-[22%] rounded-full flex flex-col items-center justify-center text-center" style={{ background: FARBE.tief }}>
        <p className="text-[0.6rem] tracking-[0.2em] uppercase" style={{ color: P.champagner }}>
          Dein Brutto
        </p>
        <p className="mt-1 text-xl sm:text-2xl font-bold" style={{ color: "#fff" }}>
          {mitte}
        </p>
        <p className="text-xs" style={{ color: FARBE.hellGedaempft }}>
          {unter}
        </p>
      </div>
    </div>
  );
}

/** Waagerechte Balken mit Beschriftung links und Wert rechts. */
function Balken({
  zeilen,
  max,
}: {
  zeilen: ReadonlyArray<{ label: string; wert: string; betrag: number; farbe: string; gestrichelt?: boolean; fett?: boolean }>;
  max: number;
}) {
  return (
    <Sichtbar className="space-y-3">
      {zeilen.map((z, i) => (
        <div key={z.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr] sm:grid-cols-[12rem_1fr] items-center gap-3 text-sm">
          <span className={z.fett ? "font-semibold" : ""}>{z.label}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-7 rounded shrink-0 bos-wachsen-x"
              style={{
                ...verzoegert(i * 150),
                width: `${Math.max(1, (z.betrag / max) * 78)}%`,
                background: z.gestrichelt ? "transparent" : z.farbe,
                border: z.gestrichelt ? `2px dashed ${z.farbe}` : undefined,
              }}
            />
            <span className={`tabular-nums whitespace-nowrap ${z.fett ? "font-bold text-base" : "font-semibold"}`}>
              <ZahlText text={z.wert} />
            </span>
          </div>
        </div>
      ))}
    </Sichtbar>
  );
}

/** Vom Brutto zum Netto: jede Abzugszeile setzt dort an, wo die vorige aufhörte. */
function Wasserfall({ zeilen, dunkel }: { zeilen: ReadonlyArray<WasserfallZeile>; dunkel: boolean }) {
  const brutto = zeilen[0].betrag;
  let stand = brutto;
  const farbe = { brutto: dunkel ? P.champagner : P.navy, steuer: P.rot, sozial: P.grauDunkel, netto: dunkel ? P.mint : P.gold };
  return (
    <div className="space-y-2" role="img" aria-label={zeilen.map((z) => `${z.label} ${z.wert}`).join(", ")}>
      {zeilen.map((z) => {
        let links = 0;
        if (z.ton === "steuer" || z.ton === "sozial") {
          stand -= z.betrag;
          links = stand;
        }
        return (
          <div key={z.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] sm:grid-cols-[11rem_1fr_auto] items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <span className={z.ton === "brutto" || z.ton === "netto" ? "font-semibold" : ""}>{z.label}</span>
            <div className="relative h-6">
              <div className="absolute inset-y-0 rounded-sm" style={{ left: `${(links / brutto) * 100}%`, width: `${(z.betrag / brutto) * 100}%`, background: farbe[z.ton] }} />
            </div>
            <span className="tabular-nums font-semibold whitespace-nowrap text-right">
              {z.wert}
              {z.zusatz && <span className="block sm:inline sm:ml-2 font-normal opacity-70">{z.zusatz}</span>}
              {z.plus && <span className="block sm:inline sm:ml-2 font-bold" style={{ color: gruenAuf(dunkel) }}>{z.plus}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Ein gestapelter Balken mit Legende, z. B. die Rate aus Miete, Steuer und deinem Anteil. */
function Stapel({ teile }: { teile: ReadonlyArray<StapelTeil> }) {
  const summe = teile.reduce((s, t) => s + t.betrag, 0);
  return (
    <Sichtbar>
      <div className="flex h-10 rounded-md overflow-hidden bos-wachsen-x" role="img" aria-label={teile.map((t) => `${t.label} ${t.wert}`).join(", ")}>
        {teile.map((t) => {
          const anteil = (t.betrag / summe) * 100;
          return (
            <div
              key={t.label}
              className="flex items-center px-2 text-xs sm:text-sm font-semibold whitespace-nowrap overflow-hidden"
              style={{ width: `${anteil}%`, background: t.farbe, color: ["#A7D7C5", "#D8C79F", "#CCAC05"].includes(t.farbe) ? P.navy : "#fff" }}
            >
              {anteil > 12 ? t.wert : ""}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1.5 text-xs sm:text-sm">
        {teile.map((t) => (
          <li key={t.label} className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: t.farbe }} />
            <span>
              {t.label}: <strong className="tabular-nums">{t.wert}</strong>
            </span>
          </li>
        ))}
      </ul>
    </Sichtbar>
  );
}

/** Senkrechte Säulen, Wert darüber, Beschriftung darunter. */
function Saeulen({
  saeulen,
  max,
  hoehe = 14,
}: {
  saeulen: ReadonlyArray<{ label: string; wert: string; betrag: number; farbe: string; zeilen?: ReadonlyArray<string>; gross?: boolean }>;
  max: number;
  /** Höhe der größten Säule in rem. */
  hoehe?: number;
}) {
  return (
    <Sichtbar className="grid gap-3 sm:gap-6" style={{ gridTemplateColumns: `repeat(${saeulen.length}, minmax(0, 1fr))` }}>
      {saeulen.map((s, i) => (
        <div key={s.label} className="flex flex-col items-center text-center min-w-0">
          <div className="flex flex-col justify-end items-center w-full" style={{ height: `${hoehe + 3.5}rem` }}>
            <p className={`font-bold tabular-nums leading-none mb-2 ${s.gross ? "text-3xl sm:text-5xl" : "text-xl sm:text-3xl"}`} style={{ color: s.farbe === "transparent" ? undefined : s.farbe }}>
              <ZahlText text={s.wert} />
            </p>
            <div
              className="w-full max-w-[9rem] rounded-t-md bos-wachsen-y"
              style={{ ...verzoegert(i * 180), height: `${Math.max(0.25, (s.betrag / max) * hoehe)}rem`, background: s.farbe === "transparent" ? P.grau : s.farbe }}
            />
          </div>
          <div className="w-full h-px" style={{ background: "currentColor", opacity: 0.25 }} />
          <p className="mt-2 text-xs sm:text-sm font-semibold">{s.label}</p>
          {s.zeilen?.map((z) => (
            <p key={z} className="text-[0.7rem] sm:text-xs opacity-75">
              {z}
            </p>
          ))}
        </div>
      ))}
    </Sichtbar>
  );
}

/** Drei Kennzahlen als Karten mit farbiger Oberkante (wie die Kästen im PDF). */
function KennKarten({ karten, dunkel }: { karten: ReadonlyArray<KennKarte>; dunkel: boolean }) {
  const farbe: Record<KennKarte["ton"], string> = {
    grau: P.grau,
    rot: dunkel ? P.rose : P.rot,
    gold: P.gold,
    gruen: gruenAuf(dunkel),
    navy: dunkel ? P.champagner : P.navy,
  };
  return (
    <div className="mt-6 grid sm:grid-cols-3 gap-4">
      {karten.map((k) => (
        <Karte key={k.kopf} dunkel={dunkel} randOben={farbe[k.ton]}>
          <Kopf dunkel={dunkel}>{k.kopf}</Kopf>
          <Gross farbe={k.ton === "grau" && !dunkel ? undefined : k.ton === "gold" && !dunkel ? P.goldText : farbe[k.ton]} className="mt-2 text-[1.7rem] md:text-[2rem]">
            <ZahlText text={k.wert} />
          </Gross>
          <p className="mt-2 text-sm opacity-80">{k.text}</p>
        </Karte>
      ))}
    </div>
  );
}

/** Kleine Zwischenüberschrift über einer Grafik. */
function Etikett({ children, dunkel }: { children: ReactNode; dunkel: boolean }) {
  return (
    <p className="mt-10 mb-4 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: dunkel ? P.champagner : FARBE.goldDunkel }}>
      {children}
    </p>
  );
}

/** Schlusssatz mit Akzent in einem dunklen Band. */
function Schluss({ text, wert }: { text: string; wert?: string }) {
  return (
    <div className="mt-10 rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: P.navy, color: "#fff", borderLeft: `6px solid ${P.mint}` }}>
      <p className="text-lg md:text-2xl font-semibold leading-snug">{mitAkzent(text, P.mint)}</p>
      {wert && <p className="text-3xl md:text-4xl font-bold whitespace-nowrap" style={{ color: P.mint }}><ZahlText text={wert} /></p>}
    </div>
  );
}

/* ───────────────────────── Konzept Steuerersparnis ───────────────────────── */

/** `oben` steht über der Titelseite (Konzeptschalter), `ende` unter der letzten Folie (Dokument in Fassung B). */
export function SteuerFolien({ oben, ende }: { oben?: ReactNode; ende?: ReactNode }) {
  const t = KONZEPT_STEUER;
  const block = "Steuerersparnis";
  const ringFarbe = { netto: P.champagner, steuer: P.rot, sozial: P.grauDunkel };
  return (
    <div id="konzept-steuer" data-testid="konzept-inhalt-steuer">
      {/* Titelseite */}
      <Folie id="steuer-titel" ton="tief" oben={oben} kicker={kicker(`Konzept ${block}`)} titel={t.titel.titel}>
        <p className="mt-3 text-sm" style={{ color: FARBE.hellGedaempft }}>
          {t.dokument} · {t.titel.kicker}
        </p>
        <div className="mt-10 grid md:grid-cols-[18rem_1fr] gap-8 md:gap-12 items-center">
          <Ring teile={t.titel.teile.map((x) => ({ betrag: x.betrag, farbe: ringFarbe[x.ton] }))} mitte={t.titel.brutto} unter={t.titel.bruttoText} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: P.champagner }}>
              {t.titel.kopf}
            </p>
            {t.titel.teile.map((x) => (
              <div key={x.label} className="grid grid-cols-[1rem_1fr_auto] gap-3 items-center py-3 border-b" style={{ borderColor: "rgba(216,199,159,0.3)" }}>
                <span aria-hidden className="h-4 w-4 rounded" style={{ background: ringFarbe[x.ton] }} />
                <span className={x.ton === "steuer" ? "font-semibold text-base md:text-lg" : "font-semibold"}>{x.label}</span>
                <span className={`font-semibold tabular-nums ${x.ton === "steuer" ? "text-2xl md:text-3xl" : "text-lg md:text-xl"}`} style={{ color: x.ton === "steuer" ? P.rose : "#fff" }}>
                  {x.wert}
                </span>
              </div>
            ))}
          </div>
        </div>
        <HeuteMitOs heute={t.titel.heute} mitOs={t.titel.mitOs} dunkel />
        <Fussnote dunkel>{t.titel.fuss}</Fussnote>
      </Folie>

      {/* 01 Die Sicht des Finanzamts */}
      <Folie id="steuer-1" ton="hell" kicker={kicker(block, t.finanzamt.kicker)} titel={t.finanzamt.titel}>
        <div className="mt-8 grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
          <Karte>
            <Kopf>1 · {t.finanzamt.heute.etikett}</Kopf>
            <p className="mt-2 font-semibold text-lg">{t.finanzamt.heute.kopf}</p>
            <Landmark aria-hidden className="my-5 h-14 w-14" style={{ color: P.grauDunkel }} />
            <Kopf>{t.finanzamt.heute.label}</Kopf>
            <Gross farbe={P.rot} className="mt-2 text-[2.4rem] md:text-[3rem]">{t.finanzamt.heute.wert}</Gross>
            <p className="mt-3 text-sm">{t.finanzamt.heute.text}</p>
          </Karte>
          <div aria-hidden className="flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: P.gruen }}>
              <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
            </span>
          </div>
          <Karte rand={P.gruen}>
            <Kopf>2 · {t.finanzamt.mitOs.etikett}</Kopf>
            <p className="mt-2 font-semibold text-lg">{t.finanzamt.mitOs.kopf}</p>
            <HandCoins aria-hidden className="my-5 h-14 w-14" style={{ color: P.gruen }} />
            <Kopf>{t.finanzamt.mitOs.label}</Kopf>
            <Gross farbe={P.gruen} className="mt-2 text-[2.4rem] md:text-[3rem]">{t.finanzamt.mitOs.wert}</Gross>
            <p className="mt-3 text-sm">{t.finanzamt.mitOs.text}</p>
          </Karte>
        </div>
        <div className="mt-6 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ background: P.navy, color: "#fff", boxShadow: `inset 0 0 0 3px ${P.mint}` }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: P.mint }}>
              3 · {t.finanzamt.ergebnis.etikett}
            </p>
            <p className="mt-2 text-lg md:text-2xl font-semibold leading-snug">
              Das Geld wäre <span style={{ color: P.mint }}>ohnehin weg</span>.
              <br />
              {t.finanzamt.ergebnis.satz2}
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-5xl md:text-7xl font-bold tracking-[-0.04em]" style={{ color: P.mint }}>
              <ZahlText text={t.finanzamt.ergebnis.wert} />
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em]" style={{ color: FARBE.hellGedaempft }}>
              {t.finanzamt.ergebnis.text}
            </p>
          </div>
        </div>
        <Etikett dunkel={false}>{t.finanzamt.rechnungKopf}</Etikett>
        <div className="grid sm:grid-cols-3 gap-4">
          {t.finanzamt.rechnung.map((r) => (
            <Karte key={r.kopf} rand={r.ergebnis ? P.gruen : undefined}>
              <Kopf>{r.kopf}</Kopf>
              <Gross farbe={r.minus ? P.rot : undefined} className="mt-2 text-[1.7rem] md:text-[2rem]">{r.wert}</Gross>
              <p className="mt-2 text-sm opacity-80">{r.text}</p>
            </Karte>
          ))}
        </div>
        <Fussnote>{t.finanzamt.fuss}</Fussnote>
      </Folie>

      {/* 02 Der Hebel */}
      <Folie id="steuer-2" ton="gruen" kicker={kicker(block, t.hebel.kicker)} titel={t.hebel.titel}>
        <p className="mt-4 text-base md:text-lg" style={{ color: FARBE.hellGedaempft }}>
          {t.hebel.unterzeile}
        </p>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {[
            { k: t.hebel.normal, farbe: P.grau },
            { k: t.hebel.os, farbe: P.mint },
          ].map(({ k, farbe }) => (
            <Karte key={k.etikett} dunkel rand={farbe === P.mint ? P.mint : undefined} className="text-center">
              <Kopf dunkel>{k.etikett}</Kopf>
              <Gross farbe={farbe} className="mt-3 text-[4rem] md:text-[5.5rem]">{k.wert}</Gross>
              <p className="mt-3 text-sm">{k.text}</p>
            </Karte>
          ))}
        </div>
        <Etikett dunkel>{t.hebel.balkenKopf}</Etikett>
        <Balken
          max={15360}
          zeilen={t.hebel.balken.map((b) => ({
            ...b,
            farbe: b.ton === "gruen" || b.ton === "gestrichelt" ? P.mint : b.ton === "grau" ? P.grau : "rgba(243,247,245,0.3)",
            gestrichelt: b.ton === "gestrichelt",
            fett: b.ton === "gruen",
          }))}
        />
        <div className="mt-8 rounded-xl p-4 md:p-5 text-sm md:text-base" style={{ borderLeft: `4px solid ${P.mint}`, background: "rgba(255,255,255,0.06)" }}>
          {mitAkzent(t.hebel.band, FARBE.gold)}
        </div>
        <Fussnote dunkel>{t.hebel.fuss}</Fussnote>
      </Folie>

      {/* 03 Drei Wege im Vergleich */}
      <Folie id="steuer-3" ton="hell" kicker={kicker(block, t.dreiWege.kicker)} titel={t.dreiWege.titel}>
        <Etikett dunkel={false}>{t.dreiWege.kopf}</Etikett>
        <Saeulen
          max={274}
          saeulen={t.dreiWege.saeulen.map((s) => ({
            ...s,
            farbe: s.ton === "gruen" ? P.gruen : s.ton === "grau" ? P.grau : "transparent",
            gross: s.ton === "gruen",
          }))}
        />
        <HeuteMitOs heute={t.dreiWege.heute} mitOs={t.dreiWege.mitOs} dunkel={false} />
        <Fussnote>{t.dreiWege.fuss}</Fussnote>
      </Folie>

      {/* 04 Unterm Strich */}
      <Folie id="steuer-4" ton="gruen" kicker={kicker(block, t.unterm.kicker)} titel={t.unterm.titel}>
        <div className="mt-8 max-w-xl mx-auto">
          <Saeulen max={274} hoehe={11} saeulen={t.unterm.saeulen.map((s) => ({ ...s, farbe: s.ton === "gruen" ? P.mint : P.champagner, zeilen: [s.text], gross: true }))} />
        </div>
        <Karte dunkel rand={P.mint} className="mt-8">
          <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <Kopf dunkel>{t.unterm.aufbau.etikett}</Kopf>
              <p className="mt-2 text-sm md:text-base">{t.unterm.aufbau.text}</p>
            </div>
            <p className="text-2xl md:text-3xl font-semibold whitespace-nowrap">
              {t.unterm.aufbau.zahlen} <span className="text-base opacity-70">zahlen</span> → <span style={{ color: P.mint }}>{t.unterm.aufbau.wird}</span>
            </p>
          </div>
        </Karte>
        <div className="mt-6 rounded-2xl p-6 md:p-8 grid md:grid-cols-[14rem_1fr] gap-6 items-center" style={{ background: "rgba(204,172,5,0.12)", border: `1px solid ${P.gold}` }}>
          <div className="text-center">
            <Kopf dunkel>{t.unterm.ersparnis.kopf}</Kopf>
            <p className="mt-2 text-5xl font-bold" style={{ color: P.gold }}>{t.unterm.ersparnis.wert}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em]" style={{ color: P.gold }}>{t.unterm.ersparnis.text}</p>
          </div>
          <div>
            <p className="text-lg md:text-xl font-semibold leading-snug">{t.unterm.zitat}</p>
            <ul className="mt-4 space-y-2 text-sm md:text-base list-disc pl-5">
              {t.unterm.fragen.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
        {ende}
        <Fussnote dunkel>{t.unterm.fuss}</Fussnote>
      </Folie>
    </div>
  );
}

/* ───────────────────────── Konzept Altersvorsorge ───────────────────────── */

/** Kreditschulden, Vermögen und Immobilienwert über 40 Jahre, aus VERLAUF_WOHNUNG. */
function VermoegenKurve({ dunkel }: { dunkel: boolean }) {
  const W = 540, H = 250, links = 44, unten = 222, oben = 8, rechts = 530;
  const x = (alter: number) => links + ((alter - 25) / 40) * (rechts - links);
  const y = (wert: number) => unten - (wert / 600_000) * (unten - oben);
  const linie = (wert: (p: (typeof VERLAUF_WOHNUNG)[number]) => number) => VERLAUF_WOHNUNG.map((p) => `${x(p.alter).toFixed(1)},${y(wert(p)).toFixed(1)}`).join(" ");
  const flaeche = (pkt: string) => `M${x(25)},${unten} L${pkt.replace(/ /g, " L")} L${x(65)},${unten} Z`;
  const wert = linie((p) => p.wert);
  const schulden = linie((p) => p.rest);
  const vermoegen = linie((p) => p.wert - p.rest);
  const t = KONZEPT_ALTER.eineWohnung;
  const raster = dunkel ? "rgba(243,247,245,0.15)" : "rgba(18,54,42,0.12)";
  const blau = dunkel ? "#9FA8F0" : P.blau;
  // Abgezahlt nach 404 Monaten: 25 Jahre plus 33,67 Jahre, im Jahr 2059 (wie im PDF).
  const abgezahlt = 25 + 404 / 12;
  const wertAbgezahlt = 467_500;
  // Die Spalte rechts zwischen Abzahlung und 65, darin das Gesamtvermögen wie im PDF.
  const spalteMitte = (x(abgezahlt) + rechts) / 2;
  const punkte = [
    { farbe: P.orange, text: t.marke.zeilen[0] },
    { farbe: blau, text: t.marke.zeilen[1] },
    { farbe: "#5DBE8E", text: t.marke.zeilen[2] },
  ];
  return (
    <Sichtbar schwelle={0.35}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label={`${t.kopf}: ${t.marke.titel}, ${t.ende.kopf} ${t.ende.wert}`} fill="currentColor">
        {[0, 100, 200, 300, 400, 500, 600].map((v) => (
          <g key={v}>
            <line x1={links} x2={rechts} y1={y(v * 1000)} y2={y(v * 1000)} stroke={raster} />
            <text x={links - 6} y={y(v * 1000) + 3} fontSize="9" textAnchor="end" opacity="0.6">{v}T</text>
          </g>
        ))}
        {[25, 30, 35, 40, 45, 50, 55, 60, 65].map((a) => (
          <g key={a}>
            <text x={x(a)} y={unten + 13} fontSize="9" textAnchor="middle" opacity="0.8">{2001 + a}</text>
            <text x={x(a)} y={unten + 24} fontSize="8.5" textAnchor="middle" opacity="0.55">{a} J.</text>
          </g>
        ))}
        {/* Flächen nach dem Vorbild des PDFs: Wert grün, Vermögen blau, Schulden orange. */}
        <path className="bos-blende" style={verzoegert(900)} d={flaeche(wert)} fill={P.mint} fillOpacity="0.16" />
        <path className="bos-blende" style={verzoegert(1300)} d={flaeche(vermoegen)} fill={blau} fillOpacity="0.22" />
        <path className="bos-blende" style={verzoegert(500)} d={flaeche(schulden)} fill={P.orange} fillOpacity="0.18" />
        <polyline className="bos-linie" pathLength={1} points={schulden} fill="none" stroke={P.orange} strokeWidth="2.5" />
        <polyline className="bos-linie" style={verzoegert(250)} pathLength={1} points={wert} fill="none" stroke="#5DBE8E" strokeWidth="2.5" />
        <polyline className="bos-linie" style={verzoegert(500)} pathLength={1} points={vermoegen} fill="none" stroke={blau} strokeWidth="2.5" />
        <g className="bos-blende" style={verzoegert(1900)}>
          <line x1={x(abgezahlt)} x2={x(abgezahlt)} y1={oben} y2={unten} stroke="currentColor" strokeDasharray="4 4" opacity="0.5" />
          <text x={spalteMitte} y={y(330_000)} fontSize="9" fontWeight="600" textAnchor="middle" opacity="0.85">Gesamt-</text>
          <text x={spalteMitte} y={y(330_000) + 11} fontSize="9" fontWeight="600" textAnchor="middle" opacity="0.85">vermögen</text>
          <text x={spalteMitte} y={y(330_000) + 22} fontSize="8.5" textAnchor="middle" opacity="0.7">mit 65 Jahren</text>
          <text x={spalteMitte} y={y(330_000) + 38} fontSize="13" fontWeight="700" textAnchor="middle" fill={blau}>{t.ende.wert}</text>
          <text x={x(abgezahlt) + 3} y={unten - 6} fontSize="8.5" fontWeight="600">Kredit abgezahlt</text>
        </g>
        <circle className="bos-auftauchen" style={verzoegert(2000)} cx={x(abgezahlt)} cy={unten} r="3.5" fill={P.orange} />
        <circle className="bos-auftauchen" style={verzoegert(2100)} cx={x(abgezahlt)} cy={y(wertAbgezahlt)} r="4" fill={blau} />
        <circle className="bos-auftauchen" style={verzoegert(2200)} cx={x(65)} cy={y(529_930)} r="4" fill={blau} />
        {/* Kasten oben links, wo keine Linie verläuft, wie im PDF. */}
        <g className="bos-auftauchen" style={verzoegert(2300)}>
          <rect x={x(25.6)} y={12} width={150} height={56} rx={6} fill={dunkel ? FARBE.gruen : "#fff"} stroke="currentColor" strokeOpacity="0.25" />
          <text x={x(26.1)} y={27} fontSize="10" fontWeight="700">{t.marke.titel}</text>
          {punkte.map((p, i) => (
            <g key={p.text}>
              <circle cx={x(26.1) + 3} cy={38 + i * 11} r="3" fill={p.farbe} />
              <text x={x(26.1) + 10} y={41 + i * 11} fontSize="9" opacity="0.9">{p.text}</text>
            </g>
          ))}
        </g>
      </svg>
    </Sichtbar>
  );
}

/** Zuzahlung und Überschuss je Alter, eine Wohnung, aus MONATSVERLAUF. */
function MonatsBalken({ dunkel }: { dunkel: boolean }) {
  const W = 540, H = 240, links = 46, rechts = 534, oben = 8, unten = 210;
  const min = -600, max = 1600;
  const y = (v: number) => oben + ((max - v) / (max - min)) * (unten - oben);
  const breite = (rechts - links) / MONATSVERLAUF.length;
  const x = (alter: number) => links + (alter - 25) * breite;
  const t = KONZEPT_ALTER.zuzahlung;
  const zahlst = P.gold;
  const bekommst = gruenAuf(dunkel);
  // „Vor Steuer“ als gestrichelte Treppe wie im PDF, Stufe je Jahr.
  const vorTreppe = MONATSVERLAUF.map((m) => `${x(m.alter).toFixed(1)},${y(m.vor).toFixed(1)} ${(x(m.alter) + breite).toFixed(1)},${y(m.vor).toFixed(1)}`).join(" ");
  return (
    <Sichtbar schwelle={0.35}>
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full h-auto" role="img" aria-label={t.phasen.map((p) => `${p.titel}: ${p.text}`).join(", ")} fill="currentColor">
      {[-600, -400, -200, 0, 200, 400, 600, 800, 1000, 1200, 1400, 1600].map((v) => (
        <g key={v}>
          <line x1={links} x2={rechts} y1={y(v)} y2={y(v)} stroke="currentColor" opacity={v === 0 ? 0.5 : 0.1} />
          <text x={links - 5} y={y(v) + 3} fontSize="8.5" textAnchor="end" opacity="0.6">{v.toLocaleString("de-DE")} €</text>
        </g>
      ))}
      {/* Die Säulen wachsen Jahr für Jahr von der Nulllinie aus. */}
      {MONATSVERLAUF.map((m, i) => (
        <rect
          key={m.alter}
          className={`bos-wachsen-y ${m.nach < 0 ? "bos-nach-unten" : ""}`}
          style={verzoegert(i * 45)}
          x={x(m.alter) + 1.5}
          width={breite - 3}
          y={y(Math.max(0, m.nach))}
          height={Math.abs(y(m.nach) - y(0))}
          fill={m.nach < 0 ? zahlst : bekommst}
        />
      ))}
      <g className="bos-blende" style={verzoegert(1600)}>
        <polyline points={vorTreppe} fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 3" strokeOpacity="0.6" />
      </g>
      {[25, 30, 35, 40, 45, 50, 55, 60].map((a) => (
        <text key={a} x={x(a) + breite / 2} y={unten + 14} fontSize="8.5" textAnchor="middle" opacity="0.8">{a}</text>
      ))}
      <text x={rechts} y={unten + 26} fontSize="8.5" textAnchor="end" opacity="0.6">Alter</text>
      {t.phasen.map((p, i) => {
        const mitte = (x(p.von) + x(p.bis) + breite) / 2;
        const farbe = i === 2 ? bekommst : dunkel ? P.gold : P.goldText;
        const ty = i === 2 ? y(1000) : y(400);
        return (
          <g key={p.titel} className="bos-blende" style={verzoegert(1200 + i * 450)}>
            <text x={i === 2 ? x(p.von) - 4 : mitte} y={ty} fontSize="10" fontWeight="700" textAnchor={i === 2 ? "end" : "middle"} fill={farbe}>{p.titel}</text>
            <text x={i === 2 ? x(p.von) - 4 : mitte} y={ty + 13} fontSize="9.5" textAnchor={i === 2 ? "end" : "middle"} fill={farbe}>{p.text}</text>
          </g>
        );
      })}
    </svg>
    </Sichtbar>
  );
}

export function AltersvorsorgeFolien({ oben, ende }: { oben?: ReactNode; ende?: ReactNode }) {
  const t = KONZEPT_ALTER;
  const block = "Altersvorsorge";
  const tabelle = t.zuzahlung.tabelle.alter.map((a) => MONATSVERLAUF.find((m) => m.alter === a)!);
  const euro = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("de-DE")} €`;
  return (
    <div id="konzept-alter" data-testid="konzept-inhalt-alter">
      {/* Titelseite mit Foto */}
      <section id="alter-titel" data-ton="tief" className="relative scroll-mt-16 overflow-hidden bos-dunkel" style={{ background: FARBE.tief, color: FARBE.hellText }}>
        <div aria-hidden className="absolute inset-x-0 top-0 h-[60%]" style={{ backgroundImage: `url(${FOTO_ALTBAU})`, backgroundSize: "cover", backgroundPosition: "center 60%" }} />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[60%]" style={{ background: `linear-gradient(180deg, rgba(18,54,42,0.55) 0%, rgba(18,54,42,0.1) 30%, ${FARBE.tief} 100%)` }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 md:px-12 pt-14 md:pt-20 pb-14 md:pb-20">
          {oben && <div className="mb-8">{oben}</div>}
          <div className="pt-[22vh] md:pt-[30vh]">
            <p className="bos-kicker mb-3" style={{ color: FARBE.gold }}>
              {kicker(`Konzept ${block}`)}
            </p>
            <Titel text={t.titel.titel} ton="tief" />
            <p className="mt-3 text-sm" style={{ color: FARBE.hellGedaempft }}>
              {t.dokument} · {t.titel.kicker}
            </p>
            <p className="mt-6 max-w-3xl text-base md:text-lg leading-relaxed" style={{ color: FARBE.hellGedaempft }}>
              {t.titel.text}
            </p>
            <div className="mt-10 grid sm:grid-cols-3 gap-6">
              {t.titel.karten.map((k) => (
                <div key={k.kopf} className="border-t pt-3" style={{ borderColor: "rgba(216,199,159,0.5)" }}>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em]" style={{ color: P.champagner }}>{k.kopf}</p>
                  <p className="mt-1 text-2xl font-semibold">{k.wert}</p>
                  <p className="mt-1 text-xs" style={{ color: FARBE.hellGedaempft }}>{k.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 01 Ein Monat · heute */}
      <Folie id="alter-1" ton="hell" kicker={kicker(block, t.heute.kicker)} titel={t.heute.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.heute.lead}</p>
        <Etikett dunkel={false}>{t.heute.kopf}</Etikett>
        <Wasserfall zeilen={t.heute.zeilen} dunkel={false} />
        <KennKarten karten={t.heute.karten} dunkel={false} />
        <Etikett dunkel={false}>{t.heute.abzuegeKopf}</Etikett>
        <Stapel teile={t.heute.abzuege} />
        <p className="mt-8 border-l-4 pl-4 text-lg md:text-xl font-medium" style={{ borderColor: P.gold }}>{t.heute.sprech}</p>
        <Fussnote>{t.heute.fuss}</Fussnote>
      </Folie>

      {/* 02 Ein Monat · mit Immobilie */}
      <Folie id="alter-2" ton="gruen" kicker={kicker(block, t.mitImmobilie.kicker)} titel={t.mitImmobilie.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.mitImmobilie.lead}</p>
        <Etikett dunkel>{t.mitImmobilie.kopf}</Etikett>
        <Wasserfall zeilen={t.mitImmobilie.zeilen} dunkel />
        <KennKarten karten={t.mitImmobilie.karten} dunkel />
        <Etikett dunkel>{t.mitImmobilie.rateKopf}</Etikett>
        <Stapel teile={t.mitImmobilie.rate} />
        <div className="mt-8 rounded-xl p-4 md:p-5 text-sm md:text-base leading-relaxed" style={{ borderLeft: `4px solid ${P.mint}`, background: "rgba(255,255,255,0.06)" }}>
          {t.mitImmobilie.band}
        </div>
        <p className="mt-3 text-sm" style={{ color: FARBE.hellGedaempft }}>{t.mitImmobilie.rechnung}</p>
        <Fussnote dunkel>{t.mitImmobilie.fuss}</Fussnote>
      </Folie>

      {/* 03 Ein Arbeitsleben */}
      <Folie id="alter-3" ton="hell" kicker={kicker(block, t.arbeitsleben.kicker)} titel={t.arbeitsleben.titel}>
        <KennKarten karten={t.arbeitsleben.karten} dunkel={false} />
        <Etikett dunkel={false}>{t.arbeitsleben.rausKopf}</Etikett>
        <Stapel teile={t.arbeitsleben.raus} />
        <Etikett dunkel={false}>{t.arbeitsleben.reinKopf}</Etikett>
        <Balken
          max={1_760_000}
          zeilen={t.arbeitsleben.rein.map((r) => ({ ...r, farbe: r.ton === "gruen" ? P.gruen : r.ton === "gold" ? P.gold : P.navy, fett: true }))}
        />
        <KennKarten karten={t.arbeitsleben.ergebnis} dunkel={false} />
        <Schluss text={t.arbeitsleben.schluss} />
        <Fussnote>{t.arbeitsleben.fuss}</Fussnote>
      </Folie>

      {/* 04 Eine Wohnung */}
      <Folie id="alter-4" ton="gruen" kicker={kicker(block, t.eineWohnung.kicker)} titel={t.eineWohnung.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.eineWohnung.lead}</p>
        <Etikett dunkel>{t.eineWohnung.kopf}</Etikett>
        <ul className="mb-3 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 text-xs sm:text-sm">
          {[
            { farbe: P.orange, text: t.eineWohnung.legende.schulden },
            { farbe: "#9FA8F0", text: t.eineWohnung.legende.vermoegen },
            { farbe: "#5DBE8E", text: t.eineWohnung.legende.wert },
          ].map((l) => (
            <li key={l.text} className="flex items-center gap-2">
              <span aria-hidden className="h-1 w-5 rounded" style={{ background: l.farbe }} />
              {l.text}
            </li>
          ))}
        </ul>
        <Karte dunkel className="!p-3 md:!p-5">
          {/* Auf dem Handy waagerecht scrollen statt die Schrift zu schrumpfen. */}
          <div className="overflow-x-auto">
            <div className="min-w-[520px]"><VermoegenKurve dunkel /></div>
          </div>
        </Karte>
        <p className="mt-2 text-xs" style={{ color: FARBE.hellGedaempft }}>{t.eineWohnung.unter}</p>
        <KennKarten karten={t.eineWohnung.karten} dunkel />
        <Fussnote dunkel>{t.eineWohnung.fuss}</Fussnote>
      </Folie>

      {/* 05 Deine monatliche Zuzahlung */}
      <Folie id="alter-5" ton="hell" kicker={kicker(block, t.zuzahlung.kicker)} titel={t.zuzahlung.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.zuzahlung.lead}</p>
        <KennKarten karten={t.zuzahlung.karten} dunkel={false} />
        <Etikett dunkel={false}>{t.zuzahlung.kopf}</Etikett>
        <ul className="mb-3 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 text-xs sm:text-sm">
          <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: P.gold }} />{t.zuzahlung.legende.zahlst}</li>
          <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: P.gruen }} />{t.zuzahlung.legende.bekommst}</li>
          <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-sm border border-dashed" style={{ borderColor: P.grauDunkel }} />{t.zuzahlung.legende.vor}</li>
        </ul>
        <Karte className="!p-3 md:!p-5">
          {/* Auf dem Handy waagerecht scrollen statt die Schrift zu schrumpfen. */}
          <div className="overflow-x-auto">
            <div className="min-w-[520px]"><MonatsBalken dunkel={false} /></div>
          </div>
        </Karte>
        <Etikett dunkel={false}>{t.zuzahlung.tabelleKopf}</Etikett>
        <div data-ui="card" className="overflow-x-auto rounded-2xl border bg-card p-2 md:p-4">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead>
              <tr className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <th className="text-left font-medium py-2 px-2">Im Monat</th>
                {tabelle.map((m) => <th key={m.alter} className="text-right font-medium py-2 px-2">{m.alter} J.</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-2 px-2">vor Steuer</td>
                {tabelle.map((m) => <td key={m.alter} className="py-2 px-2 text-right">{euro(m.vor)}</td>)}
              </tr>
              <tr className="border-t border-border font-semibold">
                <td className="py-2 px-2">nach Steuer</td>
                {tabelle.map((m) => <td key={m.alter} className="py-2 px-2 text-right" style={{ color: m.nach < 0 ? P.goldText : P.gruen }}>{euro(m.nach)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <Fussnote>{t.zuzahlung.fuss}</Fussnote>
      </Folie>

      {/* 06 Eine, zwei, drei Wohnungen */}
      <Folie id="alter-6" ton="gruen" kicker={kicker(block, t.mehrWohnungen.kicker)} titel={t.mehrWohnungen.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.mehrWohnungen.lead}</p>
        <Etikett dunkel>{t.mehrWohnungen.kopf}</Etikett>
        <Saeulen max={3} hoehe={12} saeulen={t.mehrWohnungen.saeulen.map((s, i) => ({ ...s, zeilen: [s.text], farbe: i === 2 ? P.mint : P.champagner, gross: i === 2 }))} />
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm md:text-base tabular-nums">
            <thead>
              {/* Die Glasschicht hinterlegt Tabellenköpfe hell; auf Dunkelgrün bleibt der Kopf durchsichtig. */}
              <tr className="text-xs uppercase tracking-[0.06em]" style={{ color: FARBE.hellGedaempft, background: "transparent" }}>
                <th />
                {t.mehrWohnungen.spalten.map((s, i) => (
                  <th key={s} className="text-right font-medium py-2 px-2" style={i === 2 ? { color: P.mint } : undefined}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.mehrWohnungen.zeilen.map((z) => (
                <tr key={z.text} className={`border-t ${z.summe ? "font-semibold" : ""}`} style={{ borderColor: "rgba(243,247,245,0.2)" }}>
                  <td className="py-2.5 px-2">{z.text}</td>
                  {z.werte.map((v, i) => <td key={i} className="py-2.5 px-2 text-right whitespace-nowrap" style={i === 2 ? { color: P.mint } : undefined}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Schluss text={t.mehrWohnungen.schluss} wert={t.mehrWohnungen.schlussWert} />
        <Fussnote dunkel>{t.mehrWohnungen.fuss}</Fussnote>
      </Folie>

      {/* 07 Nach der Abzahlung */}
      <Folie id="alter-7" ton="hell" kicker={kicker(block, t.rente.kicker)} titel={t.rente.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.rente.lead}</p>
        {/* Zeitstrahl: drei Wohnungen, dann abbezahlt, dann zwei Wege. Läuft einmal ab, wenn er ins Bild kommt. */}
        <Sichtbar className="mt-10 relative" schwelle={0.4}>
          <div aria-hidden className="absolute left-4 right-4 top-[1.1rem] h-1 rounded bg-muted" />
          <div
            aria-hidden
            className="absolute left-4 right-4 top-[1.1rem] h-1 rounded bos-wachsen-x"
            style={{ transitionDuration: "2.4s", background: `linear-gradient(90deg, ${P.gold} 0%, ${P.gold} 55%, ${P.gruen} 55%)` }}
          />
          <ol className="relative grid grid-cols-3 gap-2" data-testid="rente-zeitstrahl">
            {t.rente.zeitstrahl.map((z, i) => (
              <li
                key={z.alter}
                className={`flex flex-col min-w-0 ${i === 0 ? "items-start text-left" : i === 1 ? "items-center text-center" : "items-end text-right"}`}
              >
                <span className="bos-auftauchen h-10 w-10 rounded-full border-4 bg-card" style={{ ...verzoegert(i * 1100), borderColor: i === 0 ? P.gold : P.gruen }} />
                <div className="bos-blende" style={verzoegert(i * 1100 + 150)}>
                  <p className="mt-2 font-semibold">{z.alter}</p>
                  <p className="text-xs font-medium" style={{ color: i === 0 ? FARBE.goldDunkel : FARBE.gruenText }}>{z.titel}</p>
                  <p className="text-xs text-muted-foreground max-w-[8rem]">{z.text}</p>
                </div>
                {"wohnungen" in z && z.wohnungen && (
                  <ul className="mt-3 flex flex-col sm:flex-row gap-1.5" aria-label={z.text}>
                    {Array.from({ length: z.wohnungen }, (_, n) => (
                      <li
                        key={n}
                        className="bos-auftauchen inline-flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap bg-card"
                        style={{ ...verzoegert(300 + n * 300), borderColor: P.gold, color: FARBE.goldDunkel }}
                      >
                        <Home aria-hidden className="h-4 w-4" />
                        {t.rente.wohnung} {n + 1}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs font-medium bos-blende" style={{ ...verzoegert(900), color: FARBE.goldDunkel }}>25 bis 58: {t.rente.zahlstZu}</p>
        </Sichtbar>
        <Etikett dunkel={false}>{t.rente.wegeKopf}</Etikett>
        <Sichtbar className="grid md:grid-cols-2 gap-4" schwelle={0.3}>
          {t.rente.wege.map((w, i) => (
            <div key={w.buchstabe} className="bos-auftauchen min-w-0" style={verzoegert(i * 350)}>
              <Karte rand={i === 1 ? P.gruen : P.blau} className="h-full">
                <p className="flex items-center gap-3 font-semibold">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-bold" style={{ background: i === 1 ? P.gruen : P.blau }}>{w.buchstabe}</span>
                  {w.titel}
                </p>
                <Gross farbe={i === 1 ? P.gruen : P.blau} className="mt-4 text-[1.9rem] md:text-[2.4rem]">
                  <ZahlText text={w.wert} />
                </Gross>
                <p className="mt-3 text-sm opacity-80">{w.text}</p>
              </Karte>
            </div>
          ))}
        </Sichtbar>
        {ende}
        <Fussnote>{t.rente.fuss}</Fussnote>
        <Fussnote>{t.rente.grundlagen}</Fussnote>
      </Folie>
      {/* Die frühere Folie 08 „Die nächsten Schritte mit uns“ entfällt: Das folgt in Abschnitt 11 „So geht es weiter“. */}
    </div>
  );
}
