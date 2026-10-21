/**
 * Abschnitt 08 der Beratungspräsentation: die beiden Vertriebs-PDFs als
 * Folien, Seite für Seite. Die Grafiken sind nachgebaut (HTML und SVG),
 * keine Bilder aus dem PDF, damit sie auf jedem Bildschirm scharf bleiben
 * und mit hellem wie dunklem Grund funktionieren.
 *
 * Texte und Zahlen: `src/lib/beratungKonzeptDaten.ts`.
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Home } from "lucide-react";
import { FARBE, Folie, FrageAnDich, Fussnote, Karte, Kopf, Titel, mitAkzent } from "@/components/beratung/folienBausteine";
import { Sichtbar, ZahlText, verzoegert } from "@/components/beratung/Bewegung";
import {
  KONZEPT_ALTER,
  KONZEPT_STEUER,
  VERLAUF_WOHNUNG,
  type KennKarte,
} from "@/lib/beratungKonzeptDaten";
import { BEISPIEL } from "@/lib/beratungBeispielrechnung";

/** Farben der PDFs. Auf dunklem Grund die hellen Stufen (mint, rosé, champagner). */
const P = {
  gruen: "#198A5F",
  mint: "#5FD39C",
  rot: "#C0564A",
  rose: "#E8A49B",
  grau: "#9AA29E",
  grauDunkel: "#7E8A84",
  gold: "#CCAC05",
  /** Dunkles Gold als Schrift auf hellem Abschnitt; im dunklen CRM hell (beratung-os.css). */
  goldText: "var(--bos-grafik-goldtext)",
  /** Tannengrün als Schrift oder Balken auf hellem Abschnitt; im dunklen CRM Champagner. */
  tinte: "var(--bos-grafik-tinte)",
  champagner: "#D8C79F",
  navy: "#12362A",
  orange: "#F26B3A",
  blau: "#3F51B5",
};

const gruenAuf = (dunkel: boolean) => (dunkel ? P.mint : "var(--bos-grafik-gruen)");

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
  untereinander,
}: {
  heute: { etikett?: string; wert: string; text: string };
  mitOs: { etikett?: string; wert: string; text: string };
  dunkel: boolean;
  /** Wie in der PDF (Steuer 03): Heute über Mit OS, neben der Grafik. */
  untereinander?: boolean;
}) {
  return (
    <div className={untereinander ? "grid gap-4" : "mt-8 grid md:grid-cols-2 gap-4"}>
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

/**
 * Das Gehalt als Torte mit herausgezogenen Stücken (Seite 11, seit 21.10.2026):
 * Netto, Lohnsteuer und Sozialabgaben maßstabsgetreu, Beschriftung außen mit
 * Betrag und Anteil, in der Mitte „Ihr Gehalt“.
 */
function Torte({
  teile,
  mitte,
  wert,
  unter,
}: {
  teile: ReadonlyArray<{ label: string; text: string; wert: string; betrag: number; farbe: string; schrift: string }>;
  mitte: string;
  wert: string;
  unter: string;
}) {
  const summe = teile.reduce((s, t) => s + t.betrag, 0);
  const M = 210, R = 150, raus = 10;
  const pol = (grad: number, r: number) => {
    const w = ((grad - 90) * Math.PI) / 180;
    return [Math.cos(w) * r, Math.sin(w) * r];
  };
  let start = 0;
  const stuecke = teile.map((t) => {
    const von = start;
    start += (t.betrag / summe) * 360;
    const mittel = (von + start) / 2;
    const [vx, vy] = pol(mittel, raus);
    const [ax, ay] = pol(von, R);
    const [bx, by] = pol(start, R);
    const d = `M${M + vx},${M + vy} L${M + vx + ax},${M + vy + ay} A${R},${R} 0 ${start - von > 180 ? 1 : 0} 1 ${M + vx + bx},${M + vy + by} Z`;
    const [ix, iy] = pol(mittel, R * 0.62);
    const [lx, ly] = pol(mittel, R + 34);
    const prozent = Math.round((t.betrag / summe) * 100);
    return { t, d, ix: M + vx + ix, iy: M + vy + iy, lx: M + lx, ly: M + ly, rechts: lx >= 0, prozent };
  });
  return (
    <Sichtbar>
      {/* Volle Torte ohne Loch, „Pizza“ (Christian, 21.10.2026); „Ihr Gehalt“ steht darüber. */}
      <p className="text-center text-xs uppercase tracking-[0.2em]" style={{ color: P.champagner }}>{mitte}</p>
      <p className="text-center text-3xl md:text-4xl font-bold" style={{ color: "#FFFFFF" }}>{wert} <span className="text-base font-normal" style={{ color: FARBE.hellGedaempft }}>{unter}</span></p>
      <svg viewBox="-60 0 540 420" className="mt-2 mx-auto w-full max-w-[48rem] h-auto overflow-visible" role="img" aria-label={`${mitte} ${wert} ${unter}: ${teile.map((t) => `${t.label} ${t.wert}`).join(", ")}`}>
        {stuecke.map((s, i) => (
          <g key={s.t.label} className="bos-auftauchen" style={verzoegert(i * 250)}>
            <path d={s.d} fill={s.t.farbe} stroke={FARBE.tief} strokeWidth="2" />
            <text x={s.ix} y={s.iy} textAnchor="middle" fontSize="22" fontWeight="700" fill={s.t.schrift}>{s.prozent} %</text>
            <text x={s.lx} y={s.ly - 6} textAnchor={s.rechts ? "start" : "end"} fontSize="15" fontWeight="600" fill={FARBE.hellText}>{s.t.label}</text>
            <text x={s.lx} y={s.ly + 16} textAnchor={s.rechts ? "start" : "end"} fontSize="22" fontWeight="700" fill={s.t.farbe === P.rot ? P.rose : FARBE.hellText}>{s.t.wert}</text>
          </g>
        ))}
      </svg>
    </Sichtbar>
  );
}

/**
 * Seite 12: Die Lohnsteuer fließt als Münzen in den Trichter des Finanzamts
 * (seit 21.10.2026, Christian: „ins Klo geschmissen“). Rein gezeichnet, ohne Bilddatei.
 */
function FinanzamtTrichter({ wert }: { wert: string }) {
  const muenzen = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 260 300" className="w-full max-w-[17rem] h-auto mx-auto" role="img" aria-label={`${wert} Lohnsteuer fließen jeden Monat in den Trichter des Finanzamts`}>
      {muenzen.map((n) => (
        <g key={n} className="bos-muenze" style={{ animationDelay: `${n * 0.55}s` }}>
          <circle cx={112 + (n % 2) * 36} cy={18} r="13" fill={P.gold} stroke="#9C8204" strokeWidth="2" />
          <text x={112 + (n % 2) * 36} y={23} textAnchor="middle" fontSize="14" fontWeight="700" fill={P.navy}>€</text>
        </g>
      ))}
      {/* Trichter */}
      <path d="M48,52 L212,52 L146,128 L146,160 L114,160 L114,128 Z" fill={P.rot} fillOpacity="0.9" />
      <path d="M48,52 L212,52" stroke="#8E3A31" strokeWidth="6" strokeLinecap="round" />
      {/* Finanzamt */}
      <path d="M50,196 L130,166 L210,196 Z" fill={P.grauDunkel} />
      <rect x="58" y="196" width="144" height="10" fill={P.grauDunkel} />
      {[70, 98, 126, 154, 182].map((x) => (
        <rect key={x} x={x} y="210" width="10" height="56" rx="2" fill={P.grau} />
      ))}
      <rect x="50" y="266" width="160" height="14" rx="2" fill={P.grauDunkel} />
      <text x="130" y="296" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="3" fill={P.grauDunkel}>FINANZAMT</text>
    </svg>
  );
}

/** Seite 15: ein Haus, in das die Münzen der Steuerersparnis fließen. */
function HausMitMuenzen({ text }: { text: string }) {
  return (
    <svg viewBox="0 0 240 230" className="w-full max-w-[15rem] h-auto mx-auto" role="img" aria-label={text}>
      {[0, 1, 2].map((n) => (
        <g key={n} className="bos-muenze" style={{ animationDelay: `${n * 0.6}s` }}>
          <circle cx={98 + n * 22} cy={16} r="12" fill={P.gold} stroke="#9C8204" strokeWidth="2" />
          <text x={98 + n * 22} y={21} textAnchor="middle" fontSize="13" fontWeight="700" fill={P.navy}>€</text>
        </g>
      ))}
      <path d="M30,108 L120,40 L210,108 Z" fill={P.mint} />
      <rect x="48" y="104" width="144" height="104" rx="4" fill="#FFFFFF" stroke={P.mint} strokeWidth="4" />
      <rect x="104" y="146" width="32" height="62" rx="3" fill={P.gruen} />
      <rect x="62" y="122" width="30" height="26" rx="3" fill="#A7D7C5" />
      <rect x="148" y="122" width="30" height="26" rx="3" fill="#A7D7C5" />
      {/* Fortschrittsbalken „abbezahlt“ */}
      <rect x="40" y="216" width="160" height="10" rx="5" fill="rgba(255,255,255,0.25)" />
      <rect className="bos-wachsen-x" x="40" y="216" width="104" height="10" rx="5" fill={P.mint} />
    </svg>
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
function KennKarten({ karten, dunkel, spalte }: { karten: ReadonlyArray<KennKarte>; dunkel: boolean; spalte?: boolean }) {
  const farbe: Record<KennKarte["ton"], string> = {
    grau: P.grau,
    rot: dunkel ? P.rose : P.rot,
    gold: P.gold,
    gruen: gruenAuf(dunkel),
    navy: dunkel ? P.champagner : P.tinte,
  };
  return (
    <div className={spalte ? "grid gap-4" : "mt-6 grid sm:grid-cols-3 gap-4"}>
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
  const torteFarbe = { netto: { farbe: P.champagner, schrift: P.navy }, steuer: { farbe: P.rot, schrift: "#FFFFFF" }, sozial: { farbe: P.grauDunkel, schrift: "#FFFFFF" } };
  // Seite 14: Netto unter den Säulen je Weg in eigener Farbe (Christian, 21.10.2026).
  const nettoFarbe = { leer: P.goldText, grau: "var(--bos-grafik-blau)", gruen: gruenAuf(false) };
  return (
    <div id="konzept-steuer" data-testid="konzept-inhalt-steuer">
      {/* Seite 11: Titelseite, das Gehalt als große Torte */}
      <Folie id="steuer-titel" ton="tief" oben={oben} kicker={kicker(`Konzept ${block}`)} titel={t.titel.titel}>
        <p className="mt-3 text-sm" style={{ color: FARBE.hellGedaempft }}>
          {t.dokument} · {t.titel.kicker}
        </p>
        <p className="mt-5 text-lg md:text-xl" style={{ color: FARBE.hellText }}>{t.titel.lead}</p>
        <div className="mt-6" data-testid="gehalt-torte">
          <Torte teile={t.titel.teile.map((x) => ({ ...x, ...torteFarbe[x.ton] }))} mitte={t.titel.mitte} wert={t.titel.brutto} unter={t.titel.bruttoText} />
        </div>
        <ul className="mt-6 grid sm:grid-cols-3 gap-4">
          {t.titel.teile.map((x) => (
            <li key={x.label} className="flex items-start gap-3 text-sm" style={{ color: FARBE.hellGedaempft }}>
              <span aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: torteFarbe[x.ton].farbe }} />
              <span><strong style={{ color: FARBE.hellText }}>{x.label}:</strong> {x.text}</span>
            </li>
          ))}
        </ul>
        <Fussnote dunkel>{t.titel.fuss}</Fussnote>
      </Folie>

      {/* Seite 12: Die Lohnsteuer fließt in den Trichter des Finanzamts */}
      <Folie id="steuer-1" ton="hell" kicker={kicker(block, t.finanzamt.kicker)} titel={t.finanzamt.titel}>
        <div className="mt-8 grid md:grid-cols-[1fr_1.2fr] gap-8 items-center">
          <FinanzamtTrichter wert={t.finanzamt.wert} />
          <div className="min-w-0">
            <Kopf>{t.finanzamt.label}</Kopf>
            <Gross farbe={P.rot} className="mt-3 text-[4rem] md:text-[6rem]" >
              <ZahlText text={t.finanzamt.wert} />
            </Gross>
            <p className="mt-4 text-lg md:text-xl">{t.finanzamt.text}</p>
            <p className="mt-2 text-sm opacity-70">{t.finanzamt.jahr}</p>
          </div>
        </div>
        <p data-testid="finanzamt-satz" className="mt-10 rounded-2xl p-6 md:p-8 text-xl md:text-3xl font-semibold leading-snug" style={{ background: P.navy, color: "#fff", boxShadow: `inset 0 0 0 3px ${P.mint}` }}>
          {mitAkzent(t.finanzamt.satz, P.mint)}
        </p>
        <Fussnote>{t.finanzamt.fuss}</Fussnote>
      </Folie>

      {/* Seite 13: Der Hebel AfA */}
      <Folie id="steuer-2" ton="gruen" kicker={kicker(block, t.hebel.kicker)} titel={t.hebel.titel}>
        <p className="mt-4 text-base md:text-lg" style={{ color: FARBE.hellGedaempft }}>
          {t.hebel.unterzeile}
        </p>
        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-center">
        <div className="grid sm:grid-cols-2 gap-4">
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
        <div className="min-w-0">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: P.champagner }}>{t.hebel.balkenKopf}</p>
        <Balken
          max={Math.max(...t.hebel.balken.map((b) => b.betrag))}
          zeilen={t.hebel.balken.map((b) => ({
            ...b,
            farbe: b.ton === "gruen" ? P.mint : b.ton === "grau" ? P.grau : "rgba(243,247,245,0.3)",
            fett: b.ton === "gruen",
          }))}
        />
        </div>
        </div>
        <div className="mt-8 rounded-xl p-4 md:p-5 text-sm md:text-base" style={{ borderLeft: `4px solid ${P.mint}`, background: "rgba(255,255,255,0.06)" }}>
          {mitAkzent(t.hebel.band, P.mint)}
        </div>
        {/* Zwei Wege zur AfA und die Rechtsgrundlage, hervorgehoben (Christian, 21.10.2026). */}
        <div data-testid="afa-wege" className="mt-6 rounded-2xl p-5 md:p-7" style={{ background: P.gold, color: P.navy }}>
          <p className="text-xs font-bold uppercase tracking-[0.16em]">{t.hebel.wege.kopf}</p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {t.hebel.wege.liste.map((w, i) => (
              <div key={w.titel} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.55)" }}>
                <p className="text-lg md:text-xl font-bold">{i + 1}. {w.titel}</p>
                <p className="text-sm">{w.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-lg md:text-xl font-semibold leading-snug">{mitAkzent(t.hebel.wege.recht, P.navy)}</p>
        </div>
        <Fussnote dunkel>{t.hebel.fuss}</Fussnote>
      </Folie>

      {/* Seite 14: Drei Wege im Vergleich */}
      <Folie id="steuer-3" ton="hell" kicker={kicker(block, t.dreiWege.kicker)} titel={t.dreiWege.titel}>
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-end">
        <div className="min-w-0">
        <Etikett dunkel={false}>{t.dreiWege.kopf}</Etikett>
        {/*
          Christian, 21.10.2026: die graue Säule halb so hoch wie die grüne, nicht nach Betrag
          (in der Fußnote so vermerkt). Die Beträge stehen über den Säulen.
        */}
        <Saeulen
          max={1}
          saeulen={t.dreiWege.saeulen.map((s) => ({
            label: s.label,
            wert: s.wert,
            betrag: s.ton === "gruen" ? 1 : s.ton === "grau" ? 0.5 : 0,
            farbe: s.ton === "gruen" ? P.gruen : s.ton === "grau" ? P.grau : "transparent",
            gross: s.ton === "gruen",
            zeilen: [s.lohnsteuer],
          }))}
        />
        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-6" data-testid="netto-zeile">
          {t.dreiWege.saeulen.map((s) => (
            <div key={s.label} className="text-center rounded-xl py-3" style={{ background: s.ton === "gruen" ? "rgba(25,138,95,0.12)" : s.ton === "grau" ? "rgba(63,81,181,0.08)" : "rgba(204,172,5,0.14)" }}>
              <p className="text-[0.65rem] uppercase tracking-[0.14em] opacity-70">{t.dreiWege.nettoKopf}</p>
              <p className={`font-bold tabular-nums ${s.ton === "gruen" ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`} style={{ color: nettoFarbe[s.ton] }}>{s.netto}</p>
            </div>
          ))}
        </div>
        </div>
        <div className="grid gap-4">
          <Karte>
            <Kopf>Heute</Kopf>
            <Gross farbe={P.rot} className="mt-3 text-[2.4rem] md:text-[3rem]">{t.dreiWege.heute.wert}</Gross>
            <p className="mt-3 text-sm md:text-base">{t.dreiWege.heute.text}</p>
          </Karte>
          {/* Dunkel mit heller Schrift, damit „Mit OS Real Estate“ gut lesbar ist (Christian, 21.10.2026). */}
          <div className="rounded-2xl p-5 md:p-6" style={{ background: P.navy, color: "#fff", boxShadow: `inset 0 0 0 3px ${P.mint}` }}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: P.mint }}>Mit OS Real Estate</p>
            <Gross farbe={P.mint} className="mt-3 text-[2.8rem] md:text-[3.6rem]"><ZahlText text={t.dreiWege.mitOs.wert} /></Gross>
            <p className="mt-3 text-base md:text-lg">{t.dreiWege.mitOs.text}</p>
          </div>
        </div>
        </div>
        <Fussnote>{t.dreiWege.fuss}</Fussnote>
      </Folie>

      {/* Seite 15: Unterm Strich, das Mehr-Netto zahlt die Wohnung ab */}
      <Folie id="steuer-4" ton="gruen" kicker={kicker(block, t.unterm.kicker)} titel={t.unterm.titel}>
        <div className="mt-8 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div className="min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: P.champagner }}>{t.unterm.balken.kopf}</p>
            <Sichtbar>
              <div data-testid="gehaltsbalken" className="flex h-24 rounded-xl overflow-hidden bos-wachsen-x" role="img" aria-label={`${t.unterm.balken.netto.label} ${t.unterm.balken.netto.wert} plus ${t.unterm.balken.plus.label} ${t.unterm.balken.plus.wert} = ${t.unterm.balken.summe}`}>
                <div className="flex flex-col justify-center px-4" style={{ width: `${(t.unterm.balken.netto.betrag / (t.unterm.balken.netto.betrag + t.unterm.balken.plus.betrag)) * 100}%`, background: P.champagner, color: P.navy }}>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em]">{t.unterm.balken.netto.label}</span>
                  <span className="text-2xl font-bold tabular-nums">{t.unterm.balken.netto.wert}</span>
                </div>
                <div className="flex flex-col justify-center items-center px-1 text-center" style={{ flex: 1, minWidth: "7.5rem", background: P.mint, color: P.navy, boxShadow: `inset 0 0 0 3px ${P.gold}` }}>
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em]">{t.unterm.balken.plus.label}</span>
                  <span className="text-2xl font-bold tabular-nums">{t.unterm.balken.plus.wert}</span>
                </div>
              </div>
            </Sichtbar>
            <p className="mt-2 text-right text-sm" style={{ color: FARBE.hellGedaempft }}>= {t.unterm.balken.summe} netto im Monat</p>
            <div className="mt-6 flex items-center gap-3" aria-hidden>
              <ArrowRight className="h-8 w-8 shrink-0 rotate-90 lg:rotate-0" style={{ color: P.gold }} />
              <p className="text-xl md:text-2xl font-semibold" style={{ color: P.gold }}>{t.unterm.haus.titel}</p>
            </div>
            <p className="mt-2 text-base md:text-lg">{t.unterm.haus.text}</p>
          </div>
          <div className="text-center">
            <HausMitMuenzen text={t.unterm.haus.bild} />
            <p className="mt-3 text-lg font-semibold" style={{ color: P.mint }}>{t.unterm.haus.bild}</p>
          </div>
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
  const y = (wert: number) => unten - (wert / 400_000) * (unten - oben);
  const linie = (wert: (p: (typeof VERLAUF_WOHNUNG)[number]) => number) => VERLAUF_WOHNUNG.map((p) => `${x(p.alter).toFixed(1)},${y(wert(p)).toFixed(1)}`).join(" ");
  const flaeche = (pkt: string) => `M${x(25)},${unten} L${pkt.replace(/ /g, " L")} L${x(65)},${unten} Z`;
  const wert = linie((p) => p.wert);
  const schulden = linie((p) => p.rest);
  const vermoegen = linie((p) => p.wert - p.rest);
  const t = KONZEPT_ALTER.eineWohnung;
  const raster = dunkel ? "rgba(243,247,245,0.15)" : "rgba(18,54,42,0.12)";
  const blau = dunkel ? "#9FA8F0" : P.blau;
  // Abgezahlt nach 404 Monaten: 25 Jahre plus 33,67 Jahre, im Jahr 2059 (wie im PDF).
  const abgezahlt = 25 + BEISPIEL.wohnung.freiMonate / 12;
  const wertAbgezahlt = BEISPIEL.wohnung.wertFrei;
  const wert65 = VERLAUF_WOHNUNG[VERLAUF_WOHNUNG.length - 1].wert;
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
        {[0, 100, 200, 300, 400].map((v) => (
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
          <text x={spalteMitte} y={y(200_000)} fontSize="9" fontWeight="600" textAnchor="middle" opacity="0.85">Gesamt-</text>
          <text x={spalteMitte} y={y(200_000) + 11} fontSize="9" fontWeight="600" textAnchor="middle" opacity="0.85">vermögen</text>
          <text x={spalteMitte} y={y(200_000) + 22} fontSize="8.5" textAnchor="middle" opacity="0.7">mit 65 Jahren</text>
          <text x={spalteMitte} y={y(200_000) + 38} fontSize="13" fontWeight="700" textAnchor="middle" fill={blau}>{t.ende.wert}</text>
          <text x={x(abgezahlt) + 3} y={unten - 6} fontSize="8.5" fontWeight="600">Kredit abgezahlt</text>
        </g>
        <circle className="bos-auftauchen" style={verzoegert(2000)} cx={x(abgezahlt)} cy={unten} r="3.5" fill={P.orange} />
        <circle className="bos-auftauchen" style={verzoegert(2100)} cx={x(abgezahlt)} cy={y(wertAbgezahlt)} r="4" fill={blau} />
        <circle className="bos-auftauchen" style={verzoegert(2200)} cx={x(65)} cy={y(wert65)} r="4" fill={blau} />
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

export function AltersvorsorgeFolien({ oben, ende }: { oben?: ReactNode; ende?: ReactNode }) {
  const t = KONZEPT_ALTER;
  const block = "Altersvorsorge";
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

      {/* Seite 19: Ein Arbeitsleben. Drei große Kästen über die ganze Breite, darunter die Einkünfte aus drei Immobilien. */}
      <Folie id="alter-3" ton="hell" kicker={kicker(block, t.arbeitsleben.kicker)} titel={t.arbeitsleben.titel}>
        <div className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="arbeitsleben-karten">
          {t.arbeitsleben.karten.map((k) => {
            const farbe = k.ton === "gruen" ? P.gruen : k.ton === "rot" ? P.rot : P.gold;
            return (
              <div key={k.kopf} className="rounded-2xl p-6 md:p-8 min-w-0" style={{ background: farbe, color: k.ton === "gold" ? P.navy : "#FFFFFF" }} data-ton={k.ton}>
                <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.16em]">{k.kopf}</p>
                <p className="mt-3 text-[2.6rem] md:text-[3.4rem] font-bold tabular-nums leading-none"><ZahlText text={k.wert} /></p>
                <p className="mt-3 text-sm md:text-base opacity-90">{k.text}</p>
              </div>
            );
          })}
        </div>
        <Etikett dunkel={false}>{t.arbeitsleben.reinKopf}</Etikett>
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-center">
          <Balken
            max={2_000_000}
            zeilen={t.arbeitsleben.rein.map((r) => ({
              ...r,
              wert: r.text ? `${r.wert} ${r.text}` : r.wert,
              farbe: r.ton === "gruen" ? P.gruen : r.ton === "gold" ? P.gold : P.tinte,
              fett: true,
            }))}
          />
          {/* Bezug: Abgaben (rot) gehören zum umgewandelten Vermögen (grün). */}
          <div data-testid="arbeitsleben-bezug" className="rounded-2xl p-5 md:p-6 flex gap-4 items-start" style={{ border: `2px solid ${P.gruen}`, background: "rgba(25,138,95,0.06)" }}>
            <ArrowLeft aria-hidden className="h-8 w-8 shrink-0 hidden lg:block" style={{ color: P.gruen }} />
            <p className="text-base md:text-lg font-medium leading-snug">{t.arbeitsleben.bezug}</p>
          </div>
        </div>
        <KennKarten karten={t.arbeitsleben.ergebnis} dunkel={false} />
        <Schluss text={t.arbeitsleben.schluss} />
        <Fussnote>{t.arbeitsleben.fuss}</Fussnote>
      </Folie>

      {/* Seite 20: Eine Wohnung */}
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
        {/* Wie in der PDF: Grafik links, die drei Kästchen rechts untereinander. */}
        <div className="grid lg:grid-cols-[1fr_15rem] gap-4 items-start">
          <div className="min-w-0">
            <Karte dunkel className="!p-3 md:!p-5">
              {/* Auf dem Handy waagerecht scrollen statt die Schrift zu schrumpfen. */}
              <div className="overflow-x-auto">
                <div className="min-w-[520px]"><VermoegenKurve dunkel /></div>
              </div>
            </Karte>
            <p className="mt-2 text-xs" style={{ color: FARBE.hellGedaempft }}>{t.eineWohnung.unter}</p>
          </div>
          <KennKarten karten={t.eineWohnung.karten} dunkel spalte />
        </div>
        <Fussnote dunkel>{t.eineWohnung.fuss}</Fussnote>
      </Folie>

      {/* Seite 22: Eine, zwei, drei Wohnungen. Säulen groß, Tabelle zurückhaltend, ganze Zahlen statt „0,39 Mio.“. */}
      <Folie id="alter-6" ton="gruen" kicker={kicker(block, t.mehrWohnungen.kicker)} titel={t.mehrWohnungen.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.mehrWohnungen.lead}</p>
        <Etikett dunkel>{t.mehrWohnungen.kopf}</Etikett>
        <Saeulen max={3} hoehe={17} saeulen={t.mehrWohnungen.saeulen.map((s, i) => ({ ...s, zeilen: [s.text], farbe: i === 2 ? P.mint : P.champagner, gross: true }))} />
        <Schluss text={t.mehrWohnungen.schluss} wert={t.mehrWohnungen.schlussWert} />
        <div className="mt-6 overflow-x-auto opacity-80">
          <table className="w-full min-w-[480px] text-xs md:text-sm tabular-nums">
            <thead>
              {/* Die Glasschicht hinterlegt Tabellenköpfe hell; auf Dunkelgrün bleibt der Kopf durchsichtig. */}
              <tr className="text-[0.65rem] uppercase tracking-[0.06em]" style={{ color: FARBE.hellGedaempft, background: "transparent" }}>
                <th />
                {t.mehrWohnungen.spalten.map((s) => (
                  <th key={s} className="text-right font-medium py-1.5 px-2">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.mehrWohnungen.zeilen.map((z) => (
                <tr key={z.text} className="border-t" style={{ borderColor: "rgba(243,247,245,0.15)" }}>
                  <td className="py-1.5 px-2">{z.text}</td>
                  {z.werte.map((v, i) => <td key={i} className="py-1.5 px-2 text-right whitespace-nowrap">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Fussnote dunkel>{t.mehrWohnungen.fuss}</Fussnote>
      </Folie>

      {/* Seite 23: Nach der Abzahlung. Zeitstrahl über die ganze Breite, darunter A und B mit Pfeilen. */}
      <Folie id="alter-7" ton="hell" kicker={kicker(block, t.rente.kicker)} titel={t.rente.titel}>
        <p className="mt-6 max-w-3xl text-base md:text-lg">{t.rente.lead}</p>
        <Sichtbar className="mt-10 relative rounded-2xl border bg-card p-6 md:p-8" schwelle={0.4}>
          <div aria-hidden className="absolute left-10 right-10 top-[3.1rem] md:top-[3.6rem] h-2 rounded bg-muted" />
          <div
            aria-hidden
            className="absolute left-10 right-10 top-[3.1rem] md:top-[3.6rem] h-2 rounded bos-wachsen-x"
            style={{ transitionDuration: "2.4s", background: `linear-gradient(90deg, ${P.gold} 0%, ${P.gold} 55%, ${P.gruen} 55%)` }}
          />
          <ol className="relative grid grid-cols-3 gap-2" data-testid="rente-zeitstrahl">
            {t.rente.zeitstrahl.map((z, i) => (
              <li
                key={z.alter}
                className={`flex flex-col min-w-0 ${i === 0 ? "items-start text-left" : i === 1 ? "items-center text-center" : "items-end text-right"}`}
              >
                <span className="bos-auftauchen h-14 w-14 rounded-full border-[6px] bg-card" style={{ ...verzoegert(i * 1100), borderColor: i === 0 ? P.gold : P.gruen }} />
                <div className="bos-blende" style={verzoegert(i * 1100 + 150)}>
                  <p className="mt-3 text-2xl md:text-3xl font-bold">{z.alter}</p>
                  <p className="text-sm md:text-base font-semibold" style={{ color: i === 0 ? FARBE.goldDunkel : FARBE.gruenText }}>{z.titel}</p>
                  <p className="text-sm text-muted-foreground max-w-[12rem]">{z.text}</p>
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
          <p className="mt-4 text-sm font-medium bos-blende" style={{ ...verzoegert(900), color: FARBE.goldDunkel }}>25 bis {t.rente.zeitstrahl[1].alter.replace(" J.", "")}: {t.rente.zahlstZu}</p>
        </Sichtbar>
        {/* Vom Renteneintritt zeigen zwei Pfeile auf Weg A und Weg B. */}
        <div aria-hidden className="mt-2 grid grid-cols-2 gap-4">
          {[P.blau, P.gruen].map((farbe, i) => (
            <div key={farbe} className="flex justify-center">
              <ArrowDown className="h-10 w-10" style={{ color: farbe, transform: i === 0 ? "rotate(20deg)" : "rotate(-20deg)" }} />
            </div>
          ))}
        </div>
        <Etikett dunkel={false}>{t.rente.wegeKopf}</Etikett>
        <Sichtbar className="grid md:grid-cols-2 gap-4" schwelle={0.3}>
          {t.rente.wege.map((w, i) => (
            <div key={w.buchstabe} className="bos-auftauchen min-w-0" style={verzoegert(i * 350)}>
              <Karte rand={i === 1 ? P.gruen : P.blau} className="h-full">
                <p className="flex items-center gap-3 font-semibold">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-bold" style={{ background: i === 1 ? P.gruen : P.blau }}>{w.buchstabe}</span>
                  {w.titel}
                </p>
                <Gross farbe={i === 1 ? gruenAuf(false) : "var(--bos-grafik-blau)"} className="mt-4 text-[1.9rem] md:text-[2.4rem]">
                  <ZahlText text={w.wert} />
                </Gross>
                <p className="mt-3 text-sm opacity-80">{w.text}</p>
              </Karte>
            </div>
          ))}
        </Sichtbar>
        <Fussnote>{t.rente.fuss}</Fussnote>
        <Fussnote>{t.rente.grundlagen}</Fussnote>
      </Folie>

      {/* Seite 24: Mit einer Wohnung beginnen, mit uns drei aufbauen */}
      <Folie id="alter-8" ton="gruen" kicker={kicker(block, t.aufbau.kicker)} titel={t.aufbau.titel}>
        <Sichtbar className="mt-10 relative" schwelle={0.3}>
          <div aria-hidden className="hidden lg:block absolute left-[10%] right-[10%] top-4 h-px" style={{ background: "rgba(243,247,245,0.3)" }} />
          <ol className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-5" data-testid="aufbau-schritte">
            {t.aufbau.schritte.map((s, i) => (
              <li key={s.titel} className="bos-auftauchen flex lg:flex-col items-start lg:items-center gap-3 lg:gap-0 lg:text-center min-w-0" style={verzoegert(i * 250)}>
                <span
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold"
                  style={i === 0 ? { background: P.mint, borderColor: P.mint, color: P.navy } : { background: FARBE.gruen, borderColor: P.champagner }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="lg:mt-2 text-[0.6rem] uppercase tracking-[0.18em]" style={{ color: P.champagner }}>{s.marke}</p>
                  <p className="font-semibold">{s.titel}</p>
                  <p className="text-xs leading-snug mt-0.5" style={{ color: FARBE.hellGedaempft }}>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Sichtbar>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {t.aufbau.karten.map((k) => (
            <Karte key={k.kopf} dunkel rand={k.ton === "gruen" ? P.mint : undefined}>
              <Kopf dunkel>{k.kopf}</Kopf>
              <Gross farbe={k.ton === "gruen" ? P.mint : "#fff"} className="mt-2 text-[1.7rem] md:text-[2rem]">
                <ZahlText text={k.wert} />
              </Gross>
              <p className="mt-2 text-sm opacity-80">{k.text}</p>
            </Karte>
          ))}
          <FrageAnDich dunkel>{t.aufbau.frage}</FrageAnDich>
        </div>
        {ende}
        <Fussnote dunkel>{t.aufbau.fuss}</Fussnote>
      </Folie>
    </div>
  );
}
