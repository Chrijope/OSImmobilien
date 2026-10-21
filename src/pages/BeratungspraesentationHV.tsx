/**
 * Beratungspräsentation, neue Fassung nach dem Entwurf vom 15.10.2026.
 *
 * Aufbau Abschnitt für Abschnitt wie im PDF „Beratungspräsentation“:
 * Einstieg, Agenda, Ziele, Rentenlücke, Preis des Nichtstuns, Wer wir sind,
 * Unternehmensgruppe, vier Bausteine, Konzeptschalter, je Konzept Funktion,
 * Objekte, Rechnung und Plan, Stresstest, Kriterien, Weg in 10 Schritten,
 * Abschlussfrage mit Selbstauskunft und der nächste Termin.
 *
 * Aus der bisherigen Präsentation bleibt der interaktive Teil: die Fragen
 * (Erwartung, Erfahrung, Ziele, Monatsbeitrag, Haushaltsrechnung,
 * Finanzierungsrahmen, „besonders wichtig“), die Rückspiegelung „Ihre
 * Angaben“, der Regler, Trainer-Modus mit Sprechskripten und der Sprung in
 * die Selbstauskunft. Angesprochen wird immer per Du (Hausregel seit dem
 * 15.09.2026), eine Sie-Fassung gibt es nicht mehr.
 *
 * Design seit dem 16.10.2026 im CI des CRM: Schrift des CRM, Farben aus den
 * Tokens in index.css, Karten und Knöpfe aus der Glasschicht
 * (design-liquid.css), dunkelgrüne Abschnitte im Wechsel mit hellen. Gold
 * bleibt für die Akzentwörter der Überschriften, passend zum Logo. Die Antworten liegen wie bisher im Browser
 * unter demselben Schlüssel; das Speichern am Investment kommt nach der
 * Freigabe.
 *
 * Texte und Zahlen stehen in `src/lib/beratungOsDaten.ts`.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, CalendarClock, Check, ChevronDown, ClipboardList, Download, FileText, KeyRound, Loader2, Mail, Menu, Moon, Phone, Sun, UserRound, X } from "lucide-react";
import { Sichtbar, ZahlText, verzoegert } from "@/components/beratung/Bewegung";
import type { AntwortAbschnitt } from "@/lib/beratungAntwortenPdf";
import { useUser } from "@/contexts/UserContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SPRECHSKRIPT_NACH_ID, sprechskriptFuerAnrede } from "@/lib/beratungSprechskripte";
import { rahmenAusUeberschuss } from "@/lib/finanzierbarkeitUtils";
import { useCacheReady } from "@/hooks/useCacheReady";
import { getKontaktById } from "@/lib/kundenStore";
import { getInvestmentMetaField, getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { kundenportalFreischalten, portalMetaLesen } from "@/lib/kundenportalFreischalten";
import { toast } from "@/hooks/use-toast";
import { cacheGet, onCacheChange } from "@/lib/dataCache";
import { ladeBerater } from "@/lib/beraterProfil";
import { initialen, vertriebspartnerFuerExpose, type ProfilZeile, type RollenZeile } from "@/lib/exposeAnsprechpartner";
import type { Person } from "@/lib/exposeInhalt";
import { ANLAGE_ZIELE, zielNachLabel } from "@/lib/anlageZiele";
import { zuZahl } from "@/lib/beratungspraesentationSprache";
import { BERATUNG_TEXTE, formatierer, inAnrede, type AnredeWert } from "@/lib/beratungspraesentationTexte";
import {
  OS_TEXTE,
  begruessungsName,
  konzeptAusSchwerpunkt,
  lueckenSatz,
  rentenluecke,
  uebernahmeAusSkript,
  type KonzeptOs,
} from "@/lib/beratungOsDaten";
import { DOKUMENTE_B, KAUFKRAFT_B, OS_TEXTE_B } from "@/lib/beratungOsDatenB";
import { FARBE, Folie, FrageAnDich, Fussnote, Karte, Kopf, Titel, Wert, mitAkzent } from "@/components/beratung/folienBausteine";
import { AltersvorsorgeFolien, SteuerFolien } from "@/components/beratung/KonzeptFolien";
import { Markenfamilie } from "@/components/beratung/Markenfamilie";
import logoHell from "@/assets/os-real-estate-logo.png";
import logoDunkel from "@/assets/os-real-estate-logo-dark.png";
import logoQuer from "@/assets/os-real-estate-logo-quer.png";
import logoQuerDunkel from "@/assets/os-real-estate-logo-quer-dunkel.png";
import fotoZossen from "@/assets/beratung/zossen-wuensdorf.jpg";
import "@/styles/praesentation-liquid.css";
import "@/styles/beratung-os.css";

/** Daten für die lokale Vorschau ohne Anmeldung (src/pages/VorschauBeratung.tsx). */
export interface BeratungVorschau {
  /** Ersetzt die Kontakt-ID, auch im Schlüssel der gemerkten Antworten. */
  schluessel: string;
  kundenName: string;
  kontakt: { anrede?: string; vorname?: string; nachname?: string; qualEinkommen?: string; qualEigenkapital?: string };
  skript: { anrede?: string; antworten?: Record<string, string>; ziele?: string[] } | null;
  /** Erfundener Beispielpartner für die Karte „Dein persönlicher Ansprechpartner“. */
  ansprechpartner?: Person;
  /** Buchungslink „Objektvorstellung“ des Beispielpartners. */
  objektlink?: string;
  /** Simuliert die unterschriebene Selbstauskunft (Abschnitt 16). */
  saUnterschrieben?: boolean;
}


/** Primärgrün der hellen CRM-Fassung, fest: die Hero-Karte bleibt auch im dunklen CRM hell. */
const HERO_GRUEN = "#15724F";

const TrainerContext = createContext(false);


/** Freitext, der mit dem Inhalt wächst, damit lange Antworten nicht abgeschnitten werden. */
function Freitext({
  wert,
  onChange,
  platzhalter,
  className = "",
  label,
}: {
  wert: string;
  onChange: (v: string) => void;
  platzhalter?: string;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [wert]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      rows={1}
      value={wert}
      onChange={(e) => onChange(e.target.value)}
      placeholder={platzhalter}
      className={`bos-feld resize-none overflow-hidden break-words ${className}`}
    />
  );
}

/** Hinweis unter einem Wert, der aus dem Erstgespräch stammt. */
function AusErstgespraech({ sichtbar, dunkel }: { sichtbar: boolean; dunkel?: boolean }) {
  if (!sichtbar) return null;
  return (
    <span className="block mt-1 text-[10px] font-normal" style={{ color: dunkel ? FARBE.gold : FARBE.gruenText }}>
      aus dem Erstgespräch
    </span>
  );
}

/** Sprechskript im Trainer-Modus. Nie im PDF (data-pdf-exclude). */
function Trainer({ id, hinweis, dunkel }: { id?: string; hinweis?: string; dunkel?: boolean }) {
  const an = useContext(TrainerContext);
  if (!an) return null;
  const roh = id ? SPRECHSKRIPT_NACH_ID[id] : undefined;
  const s = roh ? sprechskriptFuerAnrede(roh, "du") : undefined;
  if (!s && !hinweis) return null;
  return (
    <div
      data-pdf-exclude
      className={`mt-6 rounded-2xl border-2 border-dashed p-4 text-sm leading-relaxed ${
        dunkel ? "border-amber-300/40 bg-amber-300/10 text-amber-50" : "border-amber-400/60 bg-amber-50 text-amber-950"
      }`}
    >
      <p className={`text-[10px] uppercase tracking-[0.22em] font-semibold mb-2 ${dunkel ? "text-amber-200" : "text-amber-700"}`}>
        Sprechskript · nur für dich sichtbar
      </p>
      {hinweis && <p className="mb-1">{hinweis}</p>}
      {s?.ueberleitung && <p className="italic mb-2 opacity-80">Überleitung: „{s.ueberleitung}“</p>}
      {s && <p>„{s.skript}“</p>}
      {s && <p className="mt-2 text-xs opacity-70">Warum: {s.warum}</p>}
    </div>
  );
}

/** Der Schalter Konzept 1 / Konzept 2, oben auf der ersten Folie von Abschnitt 08. */
function KonzeptSchalter({
  konzept,
  setKonzept,
  dunkel,
}: {
  konzept: KonzeptOs;
  setKonzept: (k: KonzeptOs) => void;
  dunkel?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Konzept"
      data-testid="konzept-schalter"
      className="inline-flex max-w-full rounded-full border p-1 gap-1"
      style={{
        background: dunkel ? "rgba(255,255,255,0.07)" : "hsl(var(--card) / 0.7)",
        borderColor: dunkel ? "rgba(243,247,245,0.2)" : FARBE.linie,
      }}
    >
      {(["zusatzrente", "steuer"] as const).map((k) => {
        const aktiv = konzept === k;
        return (
          <button
            key={k}
            type="button"
            data-no-shrink
            role="radio"
            aria-checked={aktiv}
            onClick={() => setKonzept(k)}
            className="rounded-full px-3 sm:px-4 py-2 text-[0.72rem] sm:text-sm font-medium transition-colors whitespace-nowrap"
            style={
              aktiv
                ? dunkel
                  ? { background: FARBE.gold, color: FARBE.aufGold }
                  : { background: FARBE.primaer, color: "hsl(var(--primary-foreground))" }
                : { color: dunkel ? FARBE.hellGedaempft : FARBE.grau }
            }
          >
            {OS_TEXTE.konzept.schalter[k]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Persönlicher Ansprechpartner unter der Unternehmensgruppe. Rundes Foto,
 * sonst Initialen; Telefon und Mail erscheinen nur, wenn sie hinterlegt sind.
 */
function AnsprechpartnerKarte({ person, dunkel, etikett, satz }: { person: Person; dunkel?: boolean; etikett: string; satz: string }) {
  const telefon = person.telefon?.trim();
  const email = person.email?.trim();
  const ring = { boxShadow: `0 0 0 2px ${dunkel ? FARBE.gold : FARBE.goldDunkel}` };
  const knopf = "inline-flex max-w-full items-center justify-center gap-2 rounded-full px-5 h-11 text-sm font-semibold transition-transform hover:scale-[1.02]";
  return (
    <Karte dunkel={dunkel} className="mt-12 md:p-8">
      <div data-testid="ansprechpartner" className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7 text-center sm:text-left">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt={person.name} className="h-24 w-24 md:h-28 md:w-28 shrink-0 rounded-full object-cover" style={ring} />
        ) : (
          <div
            data-testid="ansprechpartner-initialen"
            aria-hidden
            className="h-24 w-24 md:h-28 md:w-28 shrink-0 rounded-full flex items-center justify-center text-[1.6rem] md:text-[1.9rem] font-semibold bg-primary text-primary-foreground"
            style={ring}
          >
            {initialen(person.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="bos-kicker" style={{ color: dunkel ? FARBE.gold : FARBE.gruenText }}>
            {etikett}
          </p>
          <p className="mt-2 text-[1.6rem] md:text-[2rem] leading-tight font-semibold tracking-tight break-words">{person.name}</p>
          {/* Der Rückfall „Dein Ansprechpartner“ stünde doppelt unter dem Etikett. */}
          {person.rolle && person.rolle !== "Dein Ansprechpartner" && (
            <p className="mt-1 text-sm" style={{ color: dunkel ? FARBE.hellGedaempft : FARBE.grau }}>
              {person.rolle}
            </p>
          )}
          <p className="mt-4 text-base leading-relaxed max-w-2xl" style={{ color: dunkel ? FARBE.hellGedaempft : FARBE.grau }}>
            {satz}
          </p>
          {(telefon || email) && (
            <div className="mt-5 flex flex-col sm:flex-row flex-wrap justify-center sm:justify-start gap-3">
              {telefon && (
                <a href={`tel:${telefon.replace(/[^\d+]/g, "")}`} className={`${knopf} bg-primary text-primary-foreground`}>
                  <Phone className="h-4 w-4 shrink-0" />
                  {telefon}
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className={`${knopf} border ${dunkel ? "" : "bg-card"}`}
                  style={dunkel ? { borderColor: "rgba(243,247,245,0.35)", color: FARBE.hellText } : { borderColor: FARBE.linie, color: FARBE.tinte }}
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{email}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Karte>
  );
}

/**
 * Ohne Profil (eigenständige Fassung, src/artefakt): statt Name, Foto und
 * Kontaktdaten ein allgemeiner Abschnitt für den Kunden (ohne Hinweis an den
 * Berater, der Kunde sieht die Seite). Kontaktdaten stehen bewusst keine da.
 */
function AnsprechpartnerPlatzhalter({ dunkel, etikett }: { dunkel?: boolean; etikett: string }) {
  const ring = { boxShadow: `0 0 0 2px ${dunkel ? FARBE.gold : FARBE.goldDunkel}` };
  return (
    <Karte dunkel={dunkel} className="mt-12 md:p-8">
      <div data-testid="ansprechpartner-platzhalter" className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7 text-center sm:text-left">
        <div aria-hidden className="h-24 w-24 md:h-28 md:w-28 shrink-0 rounded-full flex items-center justify-center bg-primary text-primary-foreground" style={ring}>
          <UserRound className="h-11 w-11" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="bos-kicker" style={{ color: dunkel ? FARBE.gold : FARBE.gruenText }}>
            {etikett}
          </p>
          <p className="mt-2 text-[1.6rem] md:text-[2rem] leading-tight font-semibold tracking-tight">{OS_TEXTE.gruppe.platzhalter.titel}</p>
          <p className="mt-4 text-base leading-relaxed max-w-2xl" style={{ color: dunkel ? FARBE.hellGedaempft : FARBE.grau }}>
            {OS_TEXTE.gruppe.platzhalter.satz}
          </p>
          <ul className="mt-5 grid gap-2.5 max-w-2xl">
            {OS_TEXTE.gruppe.platzhalter.punkte.map((punkt) => (
              <li key={punkt} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <Check aria-hidden className="h-4 w-4 mt-0.5 shrink-0" style={{ color: dunkel ? FARBE.gold : FARBE.goldDunkel }} />
                {punkt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Karte>
  );
}

/**
 * „Wer zahlt Ihre Finanzierung?“ als Ring (PDF-Präsentation Folie 10). Seit dem
 * 21.10.2026 (Christian): Mieter grün, Finanzamt gelb, Sie rot; die Beträge
 * stehen an den Segmenten. Die Segmente bleiben maßstabsgetreu, der kleinste
 * Teil (Ihr Anteil) ist herausgezogen und eigens beschriftet. Der Ring sitzt
 * ganz in der Zeichenfläche, damit nichts abgeschnitten wird.
 */
function FinanzierungsRing() {
  const f = OS_TEXTE.prinzip.finanzierung;
  const summe = f.teile.reduce((s, x) => s + x.betrag, 0);
  const M = 130, R = 92, r = 58, raus = 12;
  const punkt = (winkel: number, radius: number, versatz = 0, mitte = 0) => {
    const w = ((winkel - 90) * Math.PI) / 180;
    const v = ((mitte - 90) * Math.PI) / 180;
    return [M + Math.cos(w) * radius + Math.cos(v) * versatz, M + Math.sin(w) * radius + Math.sin(v) * versatz];
  };
  let start = 0;
  const segmente = f.teile.map((x, i) => {
    const von = start;
    start += (x.betrag / summe) * 360;
    const bis = start;
    const mitte = (von + bis) / 2;
    const istSie = i === f.teile.length - 1;
    const v = istSie ? raus : 0;
    const gross = bis - von > 180 ? 1 : 0;
    const [ax, ay] = punkt(von + 0.8, R, v, mitte);
    const [bx, by] = punkt(bis - 0.8, R, v, mitte);
    const [cx, cy] = punkt(bis - 0.8, r, v, mitte);
    const [dx, dy] = punkt(von + 0.8, r, v, mitte);
    const d = `M${ax},${ay} A${R},${R} 0 ${gross} 1 ${bx},${by} L${cx},${cy} A${r},${r} 0 ${gross} 0 ${dx},${dy} Z`;
    const [lx, ly] = punkt(mitte, (R + r) / 2, v, mitte);
    return { x, d, lx, ly, istSie, mitte, v };
  });
  return (
    <svg viewBox="0 0 260 260" className="bos-auftauchen mx-auto w-full max-w-[22rem] h-auto overflow-visible" role="img" data-testid="finanzierung-ring" aria-label={`${f.summe} ${f.summeText}: ${f.teile.map((x) => `${x.label} ${x.betrag} €`).join(", ")}`}>
      {segmente.map((s) => (
        <g key={s.x.label}>
          <path d={s.d} fill={s.x.farbe} stroke={s.istSie ? "#FFFFFF" : "none"} strokeWidth={s.istSie ? 2.5 : 0} />
          <text x={s.lx} y={s.ly + 4} textAnchor="middle" fontSize={s.istSie ? 12 : 14} fontWeight="700" fill={s.x.schrift}>
            {s.x.betrag.toLocaleString("de-DE")} €
          </text>
        </g>
      ))}
      <text x={M} y={M - 2} textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor">{f.summe}</text>
      <text x={M} y={M + 15} textAnchor="middle" fontSize="8" letterSpacing="1.2" fill="currentColor" opacity="0.6">{f.summeText.toUpperCase()}</text>
    </svg>
  );
}

/** Werte der Kaufkraft je Jahr, dieselbe Rechnung wie die Karten in Abschnitt 04. */
export function kaufkraftVerlauf(g: { start: number; zins: number; inflation: number; jahre: number }) {
  return Array.from({ length: g.jahre + 1 }, (_, n) => {
    // Wie die Karten: erst den Kontostand auf volle Euro, dann die Kaufkraft daraus.
    const konto = Math.round(g.start * Math.pow(1 + g.zins, n));
    return { jahr: n, konto, kaufkraft: Math.round(konto / Math.pow(1 + g.inflation, n)) };
  });
}

/**
 * Abschnitt 04: Kaufkraft von 100.000 € über 25 Jahre, mit 2 % Zinsen und
 * ohne Zinsen, als Kurven (PDF-Präsentation Folie 8). Den Kontostand zeigt
 * die Folie seit dem 21.10.2026 nicht mehr. Rot hinterlegt ist, was gegenüber
 * heute an Kaufkraft verloren geht.
 */
function KaufkraftJahre({ karten }: { karten: ReadonlyArray<{ wert: string }> }) {
  const g = OS_TEXTE.nichtstun.grafik;
  const reihe = kaufkraftVerlauf(g);
  const W = 560, H = 240, links = 48, rechts = 470, oben = 12, unten = 210;
  // Seit 21.10.2026 ohne den Kontostand (164.061 €): Die Achse endet knapp über den 100.000 € von heute.
  const min = 40_000, max = 110_000;
  const x = (jahr: number) => links + (jahr / g.jahre) * (rechts - links);
  const y = (v: number) => unten - ((v - min) / (max - min)) * (unten - oben);
  const ohneZinsen = (n: number) => Math.round(g.start / Math.pow(1 + g.inflation, n));
  const punkte = (wert: (r: (typeof reihe)[number]) => number) => reihe.map((r) => `${x(r.jahr).toFixed(1)},${y(wert(r)).toFixed(1)}`).join(" ");
  const kaufkraft = punkte((r) => r.kaufkraft);
  const ohne = punkte((r) => ohneZinsen(r.jahr));
  const ende = reihe[reihe.length - 1];
  const euro = (v: number) => `${v.toLocaleString("de-DE")} €`;
  // Rot hinterlegt ist, was gegenüber den 100.000 € von heute verloren geht.
  const flaeche = `M${x(0)},${y(g.start)} L${x(g.jahre)},${y(g.start)} L${ohne.split(" ").reverse().join(" L")} Z`;
  const gruen = "hsl(var(--lg-schrift-blau, var(--primary)))";
  // Schrift in Rot: im dunklen CRM das helle Rosé, sonst reicht der Kontrast nicht.
  const rotText = "fill-[#A8402F] dark:fill-[#E8A49B]";
  return (
    <figure data-ui="card" className="mt-8 rounded-2xl border bg-card p-4 md:p-6" data-testid="kaufkraft-jahre">
      <figcaption className="font-semibold">{g.titel}</figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs sm:text-sm">
        <li className="flex items-center gap-2"><span aria-hidden className="w-5 border-t-2 border-dotted" style={{ borderColor: gruen }} />{g.startText}</li>
        <li className="flex items-center gap-2"><span aria-hidden className="w-5 h-[3px] rounded" style={{ background: ROT }} />{g.kaufkraft}</li>
        <li className="flex items-center gap-2"><span aria-hidden className="w-5 border-t-2 border-dashed" style={{ borderColor: ROT }} />{g.ohneZinsen}</li>
      </ul>
      <Sichtbar className="mt-3 overflow-x-auto" schwelle={0.4}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px] max-w-4xl h-auto"
          role="img"
          aria-label={`${g.titel}: ${g.startText}, ${g.kaufkraft} nach ${g.jahre} Jahren ${karten[1].wert}, ${g.ohneZinsen} ${karten[2].wert}`}
          fill="currentColor"
        >
          {[40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000].map((v) => (
            <g key={v}>
              <line x1={links} x2={rechts} y1={y(v)} y2={y(v)} stroke="currentColor" opacity={0.1} />
              <text x={links - 6} y={y(v) + 3} fontSize="9" textAnchor="end" opacity="0.6">{(v / 1000).toLocaleString("de-DE")}T €</text>
            </g>
          ))}
          {[0, 5, 10, 15, 20, 25].map((j) => (
            <text key={j} x={x(j)} y={unten + 14} fontSize="9" textAnchor="middle" opacity="0.8">{j === 0 ? "heute" : `${j} J.`}</text>
          ))}
          <path className="bos-blende" style={verzoegert(900)} d={flaeche} fill={ROT} fillOpacity="0.1" />
          <line x1={links} x2={rechts} y1={y(g.start)} y2={y(g.start)} stroke={gruen} strokeWidth="1.6" strokeDasharray="2 4" />
          <polyline className="bos-linie" pathLength={1} points={kaufkraft} fill="none" stroke={ROT} strokeWidth="2.6" />
          <polyline className="bos-linie" style={verzoegert(300)} pathLength={1} points={ohne} fill="none" stroke={ROT} strokeWidth="1.8" strokeDasharray="5 4" />
          <g className="bos-blende" style={verzoegert(1300)}>
            <text x={x(13)} y={y(82_000)} fontSize="10" fontWeight="600" textAnchor="middle" className={rotText}>{g.luecke}</text>
            <circle cx={x(0)} cy={y(g.start)} r="3.5" fill={gruen} />
            <text x={x(0) + 6} y={y(g.start) - 7} fontSize="9.5" fontWeight="600">{g.startText}</text>
            {[
              { wert: ende.kaufkraft, text: "mit 2 % Zinsen" },
              { wert: ohneZinsen(g.jahre), text: "ohne Zinsen" },
            ].map((p) => (
              <g key={p.text}>
                <circle cx={rechts} cy={y(p.wert)} r="3.5" fill={ROT} />
                <text x={rechts + 7} y={y(p.wert) + 1} fontSize="11" fontWeight="700" className={rotText}>{euro(p.wert)}</text>
                <text x={rechts + 7} y={y(p.wert) + 12} fontSize="8.5" opacity="0.7">{p.text}</text>
              </g>
            ))}
          </g>
        </svg>
      </Sichtbar>
    </figure>
  );
}

/** Fassung B: das Vertriebsdokument zum Konzept, am Ende seiner Folien; öffnet als PDF in neuem Tab. */
function DokumenteB({ konzepte }: { konzepte: KonzeptOs[] }) {
  return (
    <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3" data-testid="dokumente-b">
      {konzepte.map((k) => (
        <a
          key={k}
          href={DOKUMENTE_B[k].href}
          target="_blank"
          rel="noopener noreferrer"
          className="bos-knopf-gold inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold transition-transform hover:scale-[1.02]"
          style={{ background: FARBE.gold, color: FARBE.aufGold }}
        >
          <FileText className="h-5 w-5" />
          {DOKUMENTE_B[k].knopf}
        </a>
      ))}
    </div>
  );
}

const ROT = "#A8402F";

const NAV: Array<[string, string]> = [
  ["ziele", "Ziele"],
  ["konzept", "Konzept"],
  ["kriterien", "Kriterien"],
  ["schritt", "Nächster Schritt"],
];

const ZIELE_MAX = 3;

/** Felder, die nur Abschnitt 02 „Deine Ziele“ hat; sie werden nicht aus dem Erstgespräch übernommen. */
const NUR_ZIELE = ["motiv", "ziel", "erfahrung", "mitentscheider", "ersteFrage"];


/** Breite eines Zahlenfelds: Ziffern sind etwa 1ch breit, Punkt und Komma deutlich schmaler. */
function breiteInCh(wert: string): number {
  const schmal = (wert.match(/[.,\s]/g) || []).length;
  return Math.max(2, wert.length - schmal * 0.6 + 0.2);
}

/** Euro-Zeichen nur hinter Zahlen oder Spannen, nicht hinter Sätzen wie „drei Netto-Gehälter“. */
function mitEuro(wert: string): boolean {
  const t = wert.trim();
  return !t || (!/[a-zA-ZäöüÄÖÜß€]/.test(t.replace(/\b(bis|ca|etwa|ab)\b\.?/g, "")) && /\d/.test(t));
}

/** Datum der Objektvorstellung als Vorschlag: eine Woche nach heute. */
function inSiebenTagen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "");
}

/** Route der jeweiligen Fassung. B ist die Vergleichsfassung (beratungOsDatenB.ts). */
export const BERATUNG_ROUTE = { a: "/beratungspraesentation-osimmobilien", b: "/beratungspraesentation-osimmobilien-b" } as const;
export type BeratungVariante = keyof typeof BERATUNG_ROUTE;

export default function BeratungspraesentationHV({
  vorschau,
  variante = "a",
  weiterZurSelbstauskunft,
  ohneProfil,
  speichereDatei,
}: {
  vorschau?: BeratungVorschau;
  variante?: BeratungVariante;
  /**
   * Nur für die eigenständige Fassung ohne CRM (src/artefakt): Am Ende steht
   * statt „Objektvorstellung buchen“ der Knopf „Weiter zur Selbstauskunft“,
   * auch ohne Kunde. Bekommt die Adresse samt gewähltem Ziel.
   */
  weiterZurSelbstauskunft?: (adresse: string) => void;
  /** Ohne Nutzerprofil (src/artefakt): Ansprechpartner als allgemeiner Platzhalter, ohne Kontaktdaten. */
  ohneProfil?: boolean;
  /** Datei an den Nutzer geben; ohne Angabe der normale Download von jsPDF. */
  speichereDatei?: (dateiname: string, blob: Blob) => Promise<unknown>;
} = {}) {
  const T = variante === "b" ? OS_TEXTE_B : OS_TEXTE;
  const istB = variante === "b";
  const [suchParameter] = useSearchParams();
  const navigate = useNavigate();
  const { user, authUser, darkMode, toggleDarkMode } = useUser();
  const [navOffen, setNavOffen] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);

  const kundeId = vorschau ? vorschau.schluessel : suchParameter.get("kundeId")?.trim() || "";
  const investmentId = vorschau ? vorschau.schluessel : suchParameter.get("investmentId")?.trim() || "";
  const hatKundenKontext = !!(kundeId && investmentId);
  const trainerVerfuegbar = suchParameter.get("trainer") === "1";
  const [trainerAn, setTrainerAn] = useState(trainerVerfuegbar);

  /** Kontakt und gespeichertes Erstgesprächsskript, am Investment mit Rückfall auf den Kontakt. */
  const leseQuelle = () => {
    if (vorschau) return { kontakt: vorschau.kontakt as Record<string, any>, skript: vorschau.skript as Record<string, any> | null };
    if (!kundeId) return { kontakt: undefined, skript: null };
    const kontakt = getKontaktById(kundeId) as Record<string, any> | undefined;
    const ausInvestment = investmentId
      ? getInvestmentMetaField<Record<string, any> | null>(investmentId, "setterSkript", null)
      : null;
    return { kontakt, skript: ausInvestment ?? (kontakt?.setterSkript as Record<string, any> | undefined) ?? null };
  };

  // Immer Du, auch wenn im Erstgespräch früher „Sie“ gespeichert wurde (Hausregel).
  const a = (w: AnredeWert) => inAnrede(w, "du");
  const tx = BERATUNG_TEXTE.de;
  const fmt = formatierer("de");

  // Vorname für „Herzlich willkommen, …“: aus dem Kontakt, sonst aus den Parametern.
  const kundenName = begruessungsName(
    leseQuelle().kontakt?.vorname,
    suchParameter.get("vorname"),
    vorschau ? vorschau.kundenName : suchParameter.get("kunde"),
  );

  /*
   * Ansprechpartner: mit Kunde dessen zuständiger Partner, sonst der
   * angemeldete Nutzer (Regel wie im Exposé, exposeAnsprechpartner.ts). Für
   * den Angemeldeten Telefon, Position, Mail und Bild aus Einstellungen und
   * Profil (ladeBerater, wie Mikroseite und Signatur).
   */
  const ansprechpartner: Person | undefined = (() => {
    if (vorschau) return vorschau.ansprechpartner;
    const eigen = ladeBerater();
    const eigenePerson: Person = {
      name: user.name,
      rolle: eigen.position || "",
      email: eigen.email || user.email || undefined,
      telefon: eigen.telefon || undefined,
      avatarUrl: eigen.bild || user.avatar || undefined,
    };
    return vertriebspartnerFuerExpose({
      kundeZustaendigId: leseQuelle().kontakt?.zustaendig_id,
      eigeneId: authUser?.id,
      eigenePerson,
      profile: cacheGet<ProfilZeile>("profiles"),
      rollen: cacheGet<RollenZeile>("user_roles"),
    });
  })();

  /*
   * Buchungslink „Objektvorstellung“ (Einstellungen, profiles.objektlink):
   * mit Kunde der des zuständigen Partners, sonst der des Angemeldeten.
   * Dieselbe Reihenfolge wie beim Ansprechpartner.
   */
  const objektLink = (() => {
    if (vorschau) return vorschau.objektlink?.trim() || "";
    const profile = cacheGet<ProfilZeile & { objektlink?: string | null }>("profiles");
    const zustaendig = leseQuelle().kontakt?.zustaendig_id as string | undefined;
    const id = zustaendig && profile.some((p) => p.id === zustaendig) ? zustaendig : authUser?.id;
    return profile.find((p) => p.id === id)?.objektlink?.trim() || "";
  })();

  // Antworten im Gespräch. Schlüssel wie bisher, damit Mitgeschriebenes erhalten bleibt.
  const [antworten, setAntworten] = usePersistedState<Record<string, string>>(
    `beratung-antworten-${kundeId || "ohne-kunde"}`,
    {},
  );
  const antwortenRef = useRef(antworten);
  antwortenRef.current = antworten;
  const [uebernommen, setUebernommen] = useState<Set<string>>(new Set());
  const setzeAntwort = (schluessel: string, wert: string) => {
    setAntworten((v) => ({ ...v, [schluessel]: wert }));
    setUebernommen((v) => {
      if (!v.has(schluessel)) return v;
      const neu = new Set(v);
      neu.delete(schluessel);
      return neu;
    });
  };
  const w = (schluessel: string) => antworten[schluessel] || "";

  /**
   * Übernahme aus dem Erstgespräch. Gefüllt werden nur LEERE Felder: Was im
   * Termin eingetippt wurde, gewinnt, denn dort sitzt der Kunde daneben.
   * Abschnitt 02 ist seit dem 21.10.2026 nicht mehr mit dem Erstgespräch
   * verbunden (Wunsch Christian): Seine Felder (Motiv, Ziele, Erfahrung,
   * Mitentscheider, erste Frage) bleiben leer. Beitrag, Reserve und
   * Eigenkapital gehören auch zu den Kriterien (09) und kommen weiter.
   */
  const datenBereit = useCacheReady(["kontakte", "investments"]);
  const uebernahmeGelaufen = useRef(false);
  const [cacheTakt, setCacheTakt] = useState(0);
  useEffect(() => onCacheChange(() => setCacheTakt((n) => n + 1)), []);
  useEffect(() => {
    if (!kundeId || uebernahmeGelaufen.current) return;
    const { kontakt, skript } = leseQuelle();
    if (!kontakt && !skript) return;
    const daten = uebernahmeAusSkript(skript, kontakt);
    for (const k of NUR_ZIELE) delete daten[k];
    if (!Object.keys(daten).length) return;
    uebernahmeGelaufen.current = true;
    const bestand = antwortenRef.current;
    const leer = Object.keys(daten).filter((k) => !(bestand[k] || "").trim());
    if (!leer.length) return;
    setAntworten((v) => {
      const neu = { ...v };
      for (const k of leer) neu[k] = daten[k];
      return neu;
    });
    setUebernommen(new Set(leer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datenBereit, cacheTakt, kundeId, investmentId]);

  // Konzeptschalter: vorbelegt aus dem Schwerpunkt, ein Klick überschreibt.
  const konzept: KonzeptOs = (w("konzept") as KonzeptOs) || konzeptAusSchwerpunkt(w("schwerpunkt"));
  const setKonzept = (k: KonzeptOs) => setzeAntwort("konzept", k);

  /*
   * Abschnitt 08 zeigt den Inhalt des gewählten Konzepts. Beide Konzepte
   * nacheinander nur auf Wunsch (Knopf in 07) oder bei Schwerpunkt „beides“;
   * dann Steuer zuerst, weil die Altersvorsorge auf der Steuerersparnis aufbaut.
   */
  const beide = w("konzeptBeide") ? w("konzeptBeide") === "ja" : w("schwerpunkt") === "beides";
  const gezeigteKonzepte: KonzeptOs[] = beide ? ["steuer", "zusatzrente"] : [konzept];

  // Ziele, höchstens drei. Gespeichert als Beschriftungen, Semikolon-getrennt (wie bisher).
  const gewaehlteZiele = w("ziel")
    .split(";")
    .map((t) => zielNachLabel(t.trim()))
    .filter(Boolean)
    .slice(0, ZIELE_MAX) as NonNullable<ReturnType<typeof zielNachLabel>>[];
  const gewaehltesZiel = gewaehlteZiele[0];
  const toggleZiel = (label: string) => {
    const bestand = w("ziel").split(";").map((t) => t.trim()).filter(Boolean);
    const neu = bestand.includes(label)
      ? bestand.filter((t) => t !== label)
      : bestand.length >= ZIELE_MAX
      ? bestand
      : [...bestand, label];
    setzeAntwort("ziel", neu.join("; "));
  };

  // Haushaltsrechnung und Finanzierungsrahmen, dieselbe Formel wie im Kundenprofil.
  const einnahmen = zuZahl(w("einnahmen"));
  const ausgaben = zuZahl(w("ausgaben"));
  const hatHaushalt = einnahmen > 0 && ausgaben > 0;
  const rahmen = hatHaushalt ? rahmenAusUeberschuss(einnahmen - ausgaben, zuZahl(w("eigenkapital"))) : null;

  const luecke = rentenluecke(zuZahl(w("wunschNetto")), zuZahl(w("renteErwartet")));

  // Rückspiegelung „Ihre Angaben“
  const beantwortet = [
    gewaehlteZiele.length > 0 && {
      frage: a(gewaehlteZiele.length > 1 ? tx.rueckblick.ziele : tx.rueckblick.ziel),
      wert: gewaehlteZiele.map((z) => z.label).join(", "),
    },
    { frage: T.kriterien.konzept, wert: T.konzept.schalter[konzept] },
    rahmen && { frage: a(tx.rueckblick.rahmen), wert: a(tx.rueckblick.rund(rahmen.empfRahmen)) },
    w("beitrag").trim() && { frage: a(tx.rueckblick.beitrag), wert: w("beitrag") },
    w("grenzeStress").trim() && { frage: T.kriterien.grenze, wert: w("grenzeStress") },
    w("erfahrung").trim() && { frage: a(tx.rueckblick.erfahrung), wert: w("erfahrung") },
    w("ueberzeugungen").trim() && { frage: a(tx.rueckblick.wichtig), wert: w("ueberzeugungen") },
    w("warumJetzt").trim() && { frage: a(T.kriterien.worteKopf), wert: w("warumJetzt") },
  ].filter(Boolean) as Array<{ frage: string; wert: string }>;
  const erwartung = w("erwartung").trim();

  // Fortschrittsbalken oben
  useEffect(() => {
    const beiScroll = () => {
      const hoehe = document.documentElement.scrollHeight - window.innerHeight;
      setFortschritt(hoehe > 0 ? Math.min(100, (window.scrollY / hoehe) * 100) : 0);
    };
    beiScroll();
    window.addEventListener("scroll", beiScroll, { passive: true });
    return () => window.removeEventListener("scroll", beiScroll);
  }, []);

  const springeZu = (id: string) => {
    setNavOffen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /*
   * „Antworten als PDF“ (20.10.2026): je Abschnitt die Frage und was im
   * Gespräch gewählt oder eingetippt wurde. Beschriftungen wie auf den Folien.
   */
  const mitEinheit = (schluessel: string) => {
    const v = w(schluessel).trim();
    return v && mitEuro(v) ? `${v} €` : v;
  };
  const antwortAbschnitte = (): AntwortAbschnitt[] => [
    { titel: T.heute.kicker, zeilen: [{ frage: a(tx.arbeitsweise.erwartungFrage), antwort: w("erwartung") }] },
    {
      titel: a(T.ziele.kicker),
      zeilen: [
        { frage: "Dein wichtigster Satz", antwort: w("motiv") },
        { frage: a(T.ziele.zielKopf), antwort: gewaehlteZiele.map((z) => z.label).join(", ") },
        { frage: a(tx.arbeitsweise.erfahrungFrage), antwort: w("erfahrung") },
        ...rahmenZeilen.map((z) => ({ frage: z.label, antwort: mitEinheit(z.schluessel) })),
      ],
    },
    {
      titel: a(T.luecke.kicker),
      zeilen: [
        { frage: `${T.luecke.gewuenscht}, ${T.luecke.gewuenschtText}`, antwort: mitEinheit("wunschNetto") },
        { frage: `${T.luecke.rente}, ${T.luecke.renteText}`, antwort: mitEinheit("renteErwartet") },
        { frage: T.luecke.ruhestandAb, antwort: w("ruhestandAb") },
        { frage: `${T.luecke.luecke} ${T.luecke.lueckeText}`, antwort: luecke ? fmt.euro(luecke.monat) : "" },
      ],
    },
    {
      titel: a(T.konzept.kicker),
      zeilen: [{ frage: T.kriterien.konzept, antwort: beide ? "Beide Konzepte" : T.konzept.schalter[konzept] }],
    },
    {
      titel: a(T.kriterien.kicker),
      zeilen: [
        { frage: T.kriterien.hoechstens, antwort: mitEinheit("beitrag") },
        { frage: T.kriterien.grenze, antwort: mitEinheit("grenzeStress") },
        { frage: T.kriterien.eigenkapital, antwort: mitEinheit("eigenkapital") },
        { frage: T.kriterien.reserve, antwort: mitEinheit("reserve") },
        { frage: T.kriterien.wichtig, antwort: w("ueberzeugungen") },
        { frage: a(T.kriterien.worteFrage), antwort: w("warumJetzt") },
        { frage: tx.arbeitsweise.feldEinnahmen as string, antwort: mitEinheit("einnahmen") },
        { frage: tx.arbeitsweise.feldAusgaben as string, antwort: mitEinheit("ausgaben") },
        { frage: tx.arbeitsweise.feldEigenkapitalGesamt as string, antwort: mitEinheit("eigenkapitalGesamt") },
        { frage: tx.arbeitsweise.rahmen as string, antwort: rahmen ? fmt.euro(rahmen.empfRahmen) : "" },
      ],
    },
    {
      titel: T.schritt.kicker,
      zeilen: T.schritt.felder.map((f) => ({ frage: `${T.schritt.vorschlag} ${T.schritt.terminTitel}: ${f.label}`, antwort: w(f.schluessel) })),
    },
  ];
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const antwortenAlsPdf = async () => {
    setPdfLaeuft(true);
    try {
      const { erzeugeAntwortenPdf } = await import("@/lib/beratungAntwortenPdf");
      const doc = await erzeugeAntwortenPdf(antwortAbschnitte());
      const name = `Beratung_Antworten_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (speichereDatei) await speichereDatei(name, doc.output("blob"));
      else doc.save(name);
    } catch (e) {
      console.error("[Beratung] Antworten-PDF fehlgeschlagen", e);
      toast({ title: "PDF konnte nicht erstellt werden", description: "Bitte versuche es noch einmal.", variant: "destructive" });
    } finally {
      setPdfLaeuft(false);
    }
  };

  /** Ziel der Selbstauskunft, mit Kunde, Investment und dem führenden Ziel. */
  const selbstauskunftAdresse = () => {
    const q = new URLSearchParams();
    if (hatKundenKontext) {
      q.set("kundeId", kundeId);
      q.set("investmentId", investmentId);
    }
    if (gewaehltesZiel) q.set("ziel", gewaehltesZiel.id);
    return `/selbstauskunft${q.toString() ? `?${q}` : ""}`;
  };
  const [vorschauSprung, setVorschauSprung] = useState<string | null>(null);
  const oeffneSelbstauskunft = () => {
    // In der Vorschau gibt es keinen Kunden und keine Anmeldung: zeigen, wohin es ginge.
    if (weiterZurSelbstauskunft) weiterZurSelbstauskunft(selbstauskunftAdresse());
    else if (vorschau) setVorschauSprung(selbstauskunftAdresse());
    else navigate(selbstauskunftAdresse());
  };

  /*
   * Abschnitt 16: Kundenportal freigeben, derselbe Weg wie im Kundenprofil
   * (kundenportalFreischalten.ts). Erst mit unterschriebener Selbstauskunft
   * am Investment; die Vorschau simuliert nur.
   */
  const saUnterschrieben = vorschau
    ? !!vorschau.saUnterschrieben
    : hatKundenKontext && getInvestmentMetaField<boolean>(investmentId, "saSigned", false) === true;
  const [portalFreigabeLaeuft, setPortalFreigabeLaeuft] = useState(false);
  const [vorschauPortal, setVorschauPortal] = useState(false);
  const portalFreigegeben = vorschau ? vorschauPortal : !!kundeId && portalMetaLesen(kundeId).status !== "none";
  const portalFreigeben = async () => {
    if (vorschau) {
      setVorschauPortal(true);
      return;
    }
    const kunde = getKontaktById(kundeId);
    if (!kunde) return;
    setPortalFreigabeLaeuft(true);
    try {
      await kundenportalFreischalten({
        kontaktId: kundeId,
        kunde,
        investmentIds: getInvestmentsByKontakt(kundeId).map((iv) => iv.id),
        vonName: user.name,
        toast,
        geaendert: () => setCacheTakt((n) => n + 1),
      });
    } finally {
      setPortalFreigabeLaeuft(false);
      setCacheTakt((n) => n + 1);
    }
  };

  const rahmenZeilen: Array<{ label: string; schluessel: string; einheit?: string; platzhalter: string }> = [
    { label: T.ziele.tragbar, schluessel: "beitrag", einheit: "€", platzhalter: "z.B. bis 400" },
    { label: T.ziele.reserve, schluessel: "reserve", einheit: "€", platzhalter: "z.B. 15.000" },
    { label: T.ziele.eigenkapital, schluessel: "eigenkapital", einheit: "€", platzhalter: "z.B. bis 20.000" },
    { label: T.ziele.mitentscheider, schluessel: "mitentscheider", platzhalter: "z.B. Partner" },
  ];

  const pflicht = (gefuellt: boolean) => (gefuellt ? undefined : "#D97706");

  // ─── 05 Wer wir sind ─── (als Variable, weil B die Reihenfolge mit 05b tauscht)
  const folieWerWirSind = (
    <Folie id="werwirsind" ton="hell" kicker={T.werWirSind.kicker} titel={T.werWirSind.titel}>
      <p className="mt-6 text-base md:text-lg max-w-4xl leading-relaxed">{a(T.werWirSind.text)}</p>
      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        {T.werWirSind.karten.map((k, i) => (
          <Karte key={i}>
            <p className="font-semibold">{a(k.titel)}</p>
            <p className="mt-1.5 text-sm leading-relaxed">{a(k.text)}</p>
          </Karte>
        ))}
      </div>
      <Fussnote>{T.werWirSind.fuss}</Fussnote>
    </Folie>
  );

  // ─── 05b Unternehmensgruppe (Konzept C der Markenfamilie) ───
  const folieGruppe = (
    <Folie id="gruppe" ton="tief">
      <div className="text-center">
        <p className="bos-kicker" style={{ color: FARBE.gold }}>
          {T.gruppe.kicker}
        </p>
        <Titel text={T.gruppe.titel} ton="tief" className="mt-2" />
      </div>
      <Markenfamilie gruppe={T.gruppe} />
      <ul data-testid="gruppe-vorteile" className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {T.gruppe.vorteile.map((v) => {
          const farbe = T.gruppe.marken.find((m) => m.name === v.marke)?.farbe ?? FARBE.gold;
          return (
            <li key={v.titel} className="min-w-0">
              <Karte dunkel rand={v.marke ? farbe : undefined} className="h-full md:p-5">
                <p className="flex items-center gap-2 font-semibold" style={{ color: FARBE.hellText }}>
                  <Check aria-hidden className="h-5 w-5 shrink-0" style={{ color: farbe }} />
                  {v.titel}
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: FARBE.hellGedaempft }}>
                  {v.text}
                </p>
              </Karte>
            </li>
          );
        })}
      </ul>
      <Fussnote dunkel>
        <span className="block text-center">{T.gruppe.fuss}</span>
      </Fussnote>
      {ohneProfil ? (
        <AnsprechpartnerPlatzhalter dunkel etikett={a(tx.ueberUns.ansprechpartner)} />
      ) : ansprechpartner && (
        <AnsprechpartnerKarte
          person={ansprechpartner}
          dunkel
          etikett={a(tx.ueberUns.ansprechpartner)}
          satz={`${a(tx.ueberUns.fest)} ${tx.ueberUns.bisNotar}`}
        />
      )}
    </Folie>
  );

  return (
    <>
      <TrainerContext.Provider value={trainerVerfuegbar && trainerAn}>
        <div className="min-h-screen bg-background text-foreground font-sans" data-lg="seite" data-praesentation="beratung" lang="de">
          <div className="bos bos-crm min-h-screen">
            {/*
              Hell/Dunkel unten links, im CRM wie im Artefakt (src/artefakt/main.tsx).
              Schaltet das Theme aus useUser(): im CRM das CRM-Theme, im Artefakt dessen eigenes.
              Der Trainer-Knopf steht daneben, sonst lägen beide übereinander.
            */}
            <div data-pdf-exclude className="fixed bottom-5 left-4 z-[70] flex items-center gap-2">
              <div className="flex items-center rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur">
                <button
                  type="button"
                  data-no-shrink
                  aria-label={darkMode ? "Helle Ansicht" : "Dunkle Ansicht"}
                  onClick={toggleDarkMode}
                  className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
              {trainerVerfuegbar && (
                <button
                  type="button"
                  data-no-shrink
                  onClick={() => setTrainerAn((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-amber-500/70 bg-amber-50 px-4 h-11 text-sm font-semibold text-amber-800 shadow-lg"
                >
                  {trainerAn ? "Trainer-Modus aus" : "Trainer-Modus an"}
                </button>
              )}
            </div>
            <div className="fixed top-0 left-0 right-0 h-[3px] z-[60]">
              <div className="h-full transition-[width] duration-150" style={{ width: `${fortschritt}%`, background: FARBE.gold }} />
            </div>

            {/* ─── Kopfleiste ─── */}
            {/* Die Scheibe macht die Glasschicht (data-lg="kopfscheibe"); bg-background/90 gilt nur ohne sie. */}
            <header data-lg="kopfscheibe" className="sticky top-0 z-50 border-b bg-background/90">
              <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">
                <Link to={BERATUNG_ROUTE[variante]} className="shrink-0">
                  <img src={logoQuer} alt="OS Real Estate" className="h-8 w-auto dark:hidden" />
                  <img src={logoQuerDunkel} alt="OS Real Estate" className="h-8 w-auto hidden dark:block" />
                </Link>
                <nav className="hidden lg:flex items-center gap-6">
                  {NAV.map(([id, label]) => (
                    <button key={id} type="button"
            data-no-shrink onClick={() => springeZu(id)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
            data-no-shrink
                    onClick={() => springeZu("schritt")}
                    data-ui="button"
                    className="hidden sm:inline-flex rounded-full px-4 h-9 items-center text-sm font-semibold bg-primary text-primary-foreground"
                  >
                    Selbstauskunft
                  </button>
                  <button type="button"
            data-no-shrink className="lg:hidden p-2 text-foreground" onClick={() => setNavOffen((v) => !v)} aria-label="Menü">
                    {navOffen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              {navOffen && (
                <div className="lg:hidden px-4 pb-4 flex flex-col gap-3">
                  {[...NAV].map(([id, label]) => (
                    <button key={id} type="button"
            data-no-shrink onClick={() => springeZu(id)} className="text-left text-sm text-foreground">
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </header>

            {/* ─── Einstieg ─── */}
            {/*
             * Hero nach dem Vorbild vom 16.10.2026: Objektfoto weichgezeichnet,
             * davor eine helle Glaskarte mit dem Logo oben. Die Karte bleibt
             * auch im dunklen CRM hell, darum feste Farben statt Tokens.
             */}
            <section id="hero" className="relative overflow-hidden px-4 sm:px-8 py-10 md:py-16 min-h-[70vh] flex items-center" style={{ background: FARBE.tief }}>
              <div
                aria-hidden
                className="absolute -inset-6"
                style={{ backgroundImage: `url(${fotoZossen})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(6px)" }}
              />
              <div aria-hidden className="absolute inset-0" style={{ background: "hsl(158 38% 9% / 0.25)" }} />
              <div
                data-testid="hero-karte"
                className="relative mx-auto w-full max-w-4xl min-w-0 rounded-[28px] border p-3 sm:p-4 text-center"
                style={{
                  color: FARBE.aufGold,
                  background: "rgba(255,255,255,0.72)",
                  borderColor: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(18px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(18px) saturate(1.4)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 30px 60px -30px rgba(0,0,0,0.55)",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-[20px] border h-36 sm:h-52"
                  style={{ background: "rgba(255,255,255,0.6)", borderColor: "rgba(255,255,255,0.8)" }}
                >
                  <img src={logoHell} alt="OS Real Estate GmbH" className="h-24 sm:h-36 w-auto" />
                </div>
                <div className="px-2 sm:px-10 pt-8 pb-6 sm:pt-10 sm:pb-10">
                  <p className="bos-kicker" style={{ color: HERO_GRUEN }}>
                    {T.hero.kicker}
                  </p>
                  <h1 className="mt-4 font-light leading-[1.1] tracking-[-0.02em] text-[2rem] sm:text-[3rem] md:text-[3.6rem] break-words">
                    {T.hero.titel}
                    <br />
                    <span style={{ color: HERO_GRUEN }}>{T.hero.titelAkzent}</span>
                  </h1>
                  <p className="mt-6 text-lg md:text-xl font-semibold break-words">
                    {T.hero.willkommen}
                    {kundenName ? `, ${kundenName}.` : "."}
                  </p>
                  <p className="mt-2 text-base md:text-lg" style={{ color: "rgba(20,35,27,0.72)" }}>
                    {T.hero.unterzeile}
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                    <button
                      type="button"
                      data-no-shrink
                      data-ui="button"
                      onClick={() => springeZu("heute")}
                      className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold text-white"
                      style={{ background: HERO_GRUEN }}
                    >
                      {T.hero.start}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      data-no-shrink
                      data-ui="button"
                      onClick={() => springeZu("konzept")}
                      className="inline-flex items-center justify-center rounded-full px-6 h-12 font-semibold border"
                      style={{ background: "rgba(255,255,255,0.7)", borderColor: "rgba(20,35,27,0.15)" }}
                    >
                      {T.hero.konzepte}
                    </button>
                  </div>
                  <Trainer id="hero" />
                </div>
              </div>
            </section>

            {/* ─── 01 Agenda ─── */}
            <Folie id="heute" ton="hell" kicker={T.heute.kicker} titel={T.heute.titel}>
              <p className="mt-6 text-base md:text-lg max-w-3xl leading-relaxed">{a(T.heute.text)}</p>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {T.heute.punkte.map((pkt, i) => (
                  <Karte key={i}>
                    <p className="text-3xl font-semibold" style={{ color: FARBE.gruenText }}>
                      {i + 1}
                    </p>
                    <p className="mt-2 font-semibold">{a(pkt.titel)}</p>
                    <p className="mt-1 text-sm leading-relaxed">{a(pkt.text)}</p>
                  </Karte>
                ))}
              </div>
              {/* Die zwei Fragen der PDF-Präsentation (Folie 2). */}
              <div className="mt-6 grid md:grid-cols-2 gap-4" data-testid="einstiegsfragen">
                {T.heute.fragen.map((f, i) => (
                  <Karte key={f} rand={FARBE.gold}>
                    <Kopf>Frage {i + 1}</Kopf>
                    <p className="mt-2 text-xl md:text-2xl font-semibold leading-snug">{mitAkzent(f, FARBE.goldDunkel)}</p>
                  </Karte>
                ))}
              </div>
              <Fussnote>{a(T.heute.fuss)}</Fussnote>
              {/* Frage 1 der bisherigen Präsentation: die Erwartung an heute. Sie kommt in der Rückspiegelung zurück. */}
              <Karte className="mt-6">
                <label htmlFor="frage-erwartung" className="font-medium">
                  {a(tx.arbeitsweise.erwartungFrage)}
                </label>
                <textarea
                  id="frage-erwartung"
                  value={w("erwartung")}
                  onChange={(e) => setzeAntwort("erwartung", e.target.value)}
                  rows={2}
                  placeholder={tx.arbeitsweise.erwartungPlatzhalter as string}
                  className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-primary resize-y bg-background"
                  style={{ borderColor: FARBE.linie }}
                />
              </Karte>
              <Trainer id="heute" />
            </Folie>

            {/* ─── 02 Ihre Ziele ─── */}
            <Folie id="ziele" ton="hell" kicker={a(T.ziele.kicker)} titel={a(T.ziele.titel)}>
              {/* B zeigt seit dem 16.10.2026 dieselbe Ziele-Seite wie die normale Präsentation (Wunsch Christian). */}
              <>
              {/* Was sich die meisten Kunden wünschen (PDF-Präsentation Folie 4). */}
              <div className="mt-8" data-testid="wuensche">
                <div className="grid sm:grid-cols-3 gap-4">
                  {T.ziele.wuensche.karten.map((k, i) =>
                    i === T.ziele.wuensche.karten.length - 1 ? (
                      // Feste dunkle Kachel wie in der PDF; die dunkle Glaskarte wirkt nur in dunklen Abschnitten.
                      <div key={k.titel} className="rounded-2xl border p-5 md:p-6 min-w-0" style={{ background: FARBE.gruen, borderColor: FARBE.gruen }}>
                        <p className="font-semibold text-lg" style={{ color: FARBE.hellText }}>{k.titel}</p>
                        <p className="mt-1 text-sm" style={{ color: FARBE.hellGedaempft }}>{k.text}</p>
                      </div>
                    ) : (
                      <Karte key={k.titel}>
                        <p className="font-semibold text-lg">{k.titel}</p>
                        <p className="mt-1 text-sm" style={{ color: FARBE.grau }}>{k.text}</p>
                      </Karte>
                    ),
                  )}
                </div>
                <p className="mt-4 text-base md:text-lg">{mitAkzent(T.ziele.wuensche.satz, FARBE.gruenText)}</p>
                <Fussnote>{T.ziele.wuensche.fuss}</Fussnote>
              </div>
              <p className="mt-10 text-base md:text-lg max-w-3xl leading-relaxed font-medium">{T.ziele.einstieg}</p>
              <div className="mt-5 border-l-[3px] pl-5" style={{ borderColor: FARBE.gold }}>
                <div className="italic text-xl md:text-[1.7rem] leading-snug flex">
                  <span aria-hidden>„</span>
                  <Freitext
                    label="Motiv in den Worten des Kunden"
                    wert={w("motiv")}
                    onChange={(v) => setzeAntwort("motiv", v)}
                    platzhalter={T.ziele.zitatPlatzhalter}
                    className="italic"
                  />
                  <span aria-hidden className="self-end">“</span>
                </div>
              </div>

              <div className="mt-8 grid lg:grid-cols-[1.1fr_1fr] gap-8 items-start">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {a(T.ziele.zielKopf)} · {gewaehlteZiele.length} / {ZIELE_MAX}
                  </p>
                  <div
                    className="mt-3 flex flex-wrap gap-2 rounded-xl p-1 -m-1 border"
                    style={{ borderColor: pflicht(gewaehlteZiele.length > 0) ?? "transparent" }}
                  >
                    {ANLAGE_ZIELE.map((z) => {
                      const aktiv = gewaehlteZiele.some((g) => g.id === z.id);
                      const voll = !aktiv && gewaehlteZiele.length >= ZIELE_MAX;
                      return (
                        <button
                          key={z.id}
                          type="button"
            data-no-shrink
                          onClick={() => toggleZiel(z.label)}
                          disabled={voll}
                          aria-pressed={aktiv}
                          className="rounded-full border px-3.5 py-1.5 text-sm text-left transition-colors disabled:opacity-40"
                          style={
                            aktiv
                              ? { background: FARBE.primaer, borderColor: FARBE.primaer, color: "hsl(var(--primary-foreground))" }
                              : { borderColor: FARBE.linie, background: "hsl(var(--card) / 0.6)", color: FARBE.tinte }
                          }
                        >
                          {z.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-5">{a(T.ziele.nachfrage)}</p>

                  <label className="block mt-6 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground" htmlFor="frage-erfahrung">
                    {a(tx.arbeitsweise.erfahrungFrage)}
                  </label>
                  <Freitext
                    label="Erfahrung mit Immobilien"
                    wert={w("erfahrung")}
                    onChange={(v) => setzeAntwort("erfahrung", v)}
                    platzhalter={tx.arbeitsweise.erfahrungPlatzhalter as string}
                    className="mt-1 text-sm"
                  />

                </div>

                <Karte>
                  <p className="font-semibold text-lg">{a(T.ziele.rahmen)}</p>
                  <div className="mt-2 divide-y" style={{ borderColor: FARBE.linie }}>
                    {rahmenZeilen.map((z) => (
                      <div key={z.schluessel} className="py-2.5 flex items-start justify-between gap-4 border-border">
                        <span className="text-sm pt-0.5 shrink-0 max-w-[50%]">{z.label}</span>
                        <div className="text-right min-w-0 flex-1">
                          <div className="flex items-baseline justify-end gap-1 font-semibold">
                            <Freitext
                              label={z.label}
                              wert={w(z.schluessel)}
                              onChange={(v) => setzeAntwort(z.schluessel, v)}
                              platzhalter={z.platzhalter}
                              className="text-right"
                            />
                            {z.einheit && mitEuro(w(z.schluessel)) && <span>{z.einheit}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Karte>
              </div>
              </>
              <Trainer id="arbeitsweise" hinweis="Erst die Wünsche der meisten Kunden zeigen, dann fragen: „Und du?“ Die Antworten wörtlich mitschreiben." />
            </Folie>

            {/* ─── 03 Rentenlücke ─── */}
            <Folie id="rentenluecke" ton="gruen" kicker={a(T.luecke.kicker)} titel={a(T.luecke.titel)}>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { kopf: T.luecke.gewuenscht, schluessel: "wunschNetto", text: T.luecke.gewuenschtText },
                  { kopf: T.luecke.rente, schluessel: "renteErwartet", text: T.luecke.renteText },
                ].map((k) => (
                  <Karte key={k.schluessel} dunkel>
                    <Kopf dunkel>{k.kopf}</Kopf>
                    <div className="flex items-baseline gap-1 font-semibold text-[2rem] md:text-[2.4rem] mt-2" style={{ color: FARBE.gold }}>
                      <input
                        aria-label={k.kopf}
                        inputMode="decimal"
                        value={w(k.schluessel)}
                        onChange={(e) => setzeAntwort(k.schluessel, e.target.value)}
                        placeholder={T.luecke.platzhalter[k.schluessel as keyof typeof T.luecke.platzhalter]}
                        className="bos-feld tabular-nums max-w-full placeholder:opacity-40"
                        // Breite folgt der Zahl (sonst dem Platzhalter), damit das €-Zeichen direkt dahinter steht.
                        style={{ width: `${breiteInCh(w(k.schluessel) || T.luecke.platzhalter[k.schluessel as keyof typeof T.luecke.platzhalter])}ch` }}
                      />
                      <span>€</span>
                    </div>
                    <p className="mt-2 text-sm">{k.text}</p>
                    <AusErstgespraech sichtbar={uebernommen.has(k.schluessel)} dunkel />
                  </Karte>
                ))}
                <Karte dunkel rand={FARBE.gold}>
                  <Kopf dunkel>{T.luecke.luecke}</Kopf>
                  <Wert farbe={FARBE.gold}>{luecke ? fmt.euro(luecke.monat) : "–"}</Wert>
                  <p className="mt-2 text-sm">{T.luecke.lueckeText}</p>
                </Karte>
                <Karte dunkel>
                  <Kopf dunkel>{T.luecke.gesamt}</Kopf>
                  <Wert farbe={FARBE.gold}>{luecke ? fmt.euro(luecke.gesamt) : "–"}</Wert>
                  <p className="mt-2 text-sm">{T.luecke.gesamtText}</p>
                </Karte>
              </div>
              <div className="mt-4 flex items-baseline gap-2 text-sm" style={{ color: FARBE.hellGedaempft }}>
                <label htmlFor="ruhestand-ab" className="whitespace-nowrap">{T.luecke.ruhestandAb}:</label>
                <input
                  id="ruhestand-ab"
                  inputMode="numeric"
                  value={w("ruhestandAb")}
                  onChange={(e) => setzeAntwort("ruhestandAb", e.target.value)}
                  placeholder="z.B. 67"
                  className="bos-feld w-24 font-semibold"
                  style={{ color: FARBE.hellText }}
                />
              </div>
              {lueckenSatz(zuZahl(w("wunschNetto")), zuZahl(w("renteErwartet"))) && (
                <p data-testid="luecken-satz" className="mt-8 max-w-3xl text-base md:text-lg leading-relaxed">
                  {lueckenSatz(zuZahl(w("wunschNetto")), zuZahl(w("renteErwartet")))}
                </p>
              )}
              <FrageAnDich dunkel className="mt-6 max-w-3xl">{a(T.luecke.frage)}</FrageAnDich>
              <Fussnote dunkel>{T.luecke.fuss}</Fussnote>
            </Folie>

            {/* ─── 04 Preis des Nichtstuns ─── */}
            <Folie id="nichtstun" ton="hell" kicker={T.nichtstun.kicker} titel={T.nichtstun.titel}>
              {istB && <p className="mt-6 text-base md:text-lg">{KAUFKRAFT_B.vorspann}</p>}
              <div className="mt-8 grid md:grid-cols-3 gap-4">
                {T.nichtstun.karten.map((k) =>
                  k.warnung ? (
                    // Die Verlustkarte ist ganz rot, damit der Verlust auf einen Blick steht (seit 20.10.2026 auch in A).
                    <div key={k.kopf} data-testid="kaufkraft-verlust" className="rounded-2xl border-2 p-5 md:p-6 min-w-0" style={{ background: ROT, borderColor: ROT, color: "#FFFFFF" }}>
                      <p className="text-xs font-medium uppercase tracking-[0.06em]">{k.kopf}</p>
                      <Wert><ZahlText text={k.wert} /></Wert>
                      <p className="mt-2 text-sm font-medium">{k.text}</p>
                    </div>
                  ) : (
                    <Karte key={k.kopf}>
                      <Kopf>{k.kopf}</Kopf>
                      <Wert farbe={FARBE.gruenText}><ZahlText text={k.wert} /></Wert>
                      <p className="mt-2 text-sm">{k.text}</p>
                    </Karte>
                  ),
                )}
              </div>
              <KaufkraftJahre karten={T.nichtstun.karten} />
              {/* Die Kernbotschaft des Abschnitts, hervorgehoben. */}
              <div className="mt-7 grid md:grid-cols-2 gap-4">
                <p className="rounded-2xl p-5 text-lg md:text-xl font-medium" style={{ background: FARBE.gruen, color: FARBE.hellText }}>{mitAkzent(T.nichtstun.satz, FARBE.mint)}</p>
                <FrageAnDich>{T.nichtstun.frage}</FrageAnDich>
              </div>
              <Fussnote>{a(T.nichtstun.fuss)}</Fussnote>
              <Trainer id="nichtstun" />
            </Folie>

            {/* In B zuerst „Alles aus einer Hand“, dann „in einem Satz“. */}
            {istB ? (
              <>
                {folieGruppe}
                {folieWerWirSind}
              </>
            ) : (
              <>
                {folieWerWirSind}
                {folieGruppe}
              </>
            )}

            {/* ─── 06 Das Prinzip: fünf Bausteine und der Hebel (PDF-Präsentation Folie 9) ─── */}
            <Folie id="prinzip" ton="gruen" kicker={T.prinzip.kicker} titel={T.prinzip.titel}>
              {/*
                Seit 21.10.2026: Titel und Texte in allen fünf Kästen auf gleicher Höhe (Titel mit fester
                Mindesthöhe), im Fremdkapitalhebel der monatliche Anteil groß, darunter nur noch der Satz.
              */}
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-stretch">
                {T.prinzip.bausteine.map((b) => (
                  <Karte key={b.titel} dunkel rand={b.hervor ? FARBE.gold : undefined} className="h-full flex flex-col">
                    <p className="min-h-[2.6rem] flex items-end text-xl md:text-[1.4rem] font-semibold leading-tight" style={{ color: FARBE.gold }}>
                      {b.titel}
                    </p>
                    {b.wert && (
                      <p className="mt-2 font-semibold tabular-nums leading-none" data-testid="hebel-wert">
                        <span className="text-[2.6rem] md:text-[3.2rem]" style={{ color: FARBE.mint }}><ZahlText text={b.wert} /></span>
                        <span className="ml-1.5 text-sm" style={{ color: FARBE.hellGedaempft }}>{b.wertText}</span>
                      </p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed">{a(b.text)}</p>
                  </Karte>
                ))}
              </div>
              <p data-testid="hebel" className="mt-6 rounded-2xl border-l-4 p-5 md:p-7 text-lg md:text-2xl font-semibold leading-snug" style={{ borderColor: FARBE.gold, background: "rgba(255,255,255,0.06)", color: "#FFFFFF" }}>
                {T.prinzip.hebel.satz}
              </p>
              <Fussnote dunkel>{a(T.prinzip.fuss)}</Fussnote>
            </Folie>

            {/* ─── 06 Wer zahlt deine Finanzierung? (PDF-Präsentation Folie 10) ─── */}
            <Folie id="finanzierung" ton="hell" kicker={T.prinzip.kicker} titel={T.prinzip.finanzierung.titel}>
              <div className="mt-8 grid md:grid-cols-[22rem_1fr] gap-8 items-center">
                <Sichtbar>
                  <FinanzierungsRing />
                </Sichtbar>
                <div className="min-w-0">
                  <ul className="divide-y" style={{ borderColor: FARBE.linie }}>
                    {T.prinzip.finanzierung.teile.map((x) => (
                      <li key={x.label} className="flex items-center justify-between gap-4 py-3">
                        <span className="flex items-start gap-3 min-w-0">
                          <span aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ background: x.farbe }} />
                          <span>
                            <span className="block font-semibold">{x.label}</span>
                            <span className="block text-sm" style={{ color: FARBE.grau }}>{x.text}</span>
                          </span>
                        </span>
                        <span className="text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap" style={x.label === "Sie" ? { color: ROT } : undefined}>{x.betrag.toLocaleString("de-DE")} €</span>
                      </li>
                    ))}
                  </ul>
                  <Karte className="mt-4" rand={FARBE.primaer}>
                    <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-center">
                      <div>
                        <Kopf>{T.prinzip.finanzierung.aufbauKopf}</Kopf>
                        <Wert farbe={FARBE.gruenText}>{T.prinzip.finanzierung.aufbauWert}</Wert>
                        <p className="mt-1 text-xs" style={{ color: FARBE.grau }}>{T.prinzip.finanzierung.aufbauText}</p>
                      </div>
                      <p className="text-sm leading-relaxed">{T.prinzip.finanzierung.aufbauSatz}</p>
                    </div>
                  </Karte>
                  <FrageAnDich className="mt-4">{T.prinzip.finanzierung.frage}</FrageAnDich>
                </div>
              </div>
              <Fussnote>{T.prinzip.finanzierung.fuss}</Fussnote>
            </Folie>

            {/* ─── 07 Konzeptschalter ─── */}
            <Folie id="konzept" ton="hell" kicker={a(T.konzept.kicker)} titel={a(T.konzept.titel)}>
              <div className="mt-8 grid md:grid-cols-2 gap-5">
                {(["zusatzrente", "steuer"] as const).map((k) => {
                  const karte = T.konzept.karten[k];
                  const aktiv = konzept === k;
                  return (
                    <button
                      key={k}
                      type="button"
            data-no-shrink
                      onClick={() => setKonzept(k)}
                      aria-pressed={aktiv}
                      data-testid={`konzept-karte-${k}`}
                      data-ui="card"
                      className="text-left rounded-2xl border bg-card p-6 md:p-7 transition-shadow hover:shadow-md min-w-0"
                      style={aktiv ? { borderColor: FARBE.primaer, boxShadow: `0 0 0 1px ${FARBE.primaer}` } : undefined}
                    >
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{karte.nummer}</p>
                      <p className="font-semibold text-2xl md:text-[1.9rem] leading-tight mt-2">
                        {karte.titel1}
                        <br />
                        {karte.titel2}
                      </p>
                      <p className="mt-3 leading-relaxed">{a(karte.text)}</p>
                      <p className="mt-3 text-sm text-muted-foreground">{karte.objekte}</p>
                      <span
                        className="mt-5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium"
                        style={aktiv ? { background: FARBE.primaer, color: "hsl(var(--primary-foreground))" } : { border: `1px solid ${FARBE.primaer}`, color: FARBE.gruenText }}
                      >
                        {aktiv && <Check className="h-3.5 w-3.5" />}
                        {aktiv ? T.konzept.ausgewaehlt : T.konzept.auswaehlen}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                data-no-shrink
                aria-pressed={beide}
                data-testid="konzept-beide"
                onClick={() => setzeAntwort("konzeptBeide", beide ? "nein" : "ja")}
                className="mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
                style={beide ? { background: FARBE.primaer, borderColor: FARBE.primaer, color: "hsl(var(--primary-foreground))" } : { borderColor: FARBE.linie, color: FARBE.gruenText }}
              >
                {beide && <Check className="h-3.5 w-3.5" />}
                {T.konzept.beide}
              </button>
              <Fussnote>
                {T.konzept.fuss}
                {w("schwerpunkt") && !w("konzept") && (
                  <> Schwerpunkt im Erstgespräch: {w("schwerpunkt") === "steuer" ? "Steuerersparnis" : w("schwerpunkt") === "beides" ? "beides" : "Zusatzrente"}.</>
                )}
              </Fussnote>
            </Folie>

            {/* ─── 08 Dein Konzept im Detail: die Vertriebs-PDFs als Folien ─── */}
            {gezeigteKonzepte.map((k) => {
              const schalter = beide ? undefined : <KonzeptSchalter konzept={konzept} setKonzept={setKonzept} dunkel />;
              const dokument = istB ? <DokumenteB konzepte={[k]} /> : undefined;
              return k === "steuer" ? (
                <SteuerFolien key={k} oben={schalter} ende={dokument} />
              ) : (
                <AltersvorsorgeFolien key={k} oben={schalter} ende={dokument} />
              );
            })}

            {/* ─── 09 Deine Kriterien, vor den Objekten ─── */}
            <Folie id="kriterien" ton="hell" kicker={a(T.kriterien.kicker)} titel={a(T.kriterien.titel)}>
              <div className="mt-8 grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
                <div data-ui="card" className="divide-y divide-border rounded-2xl border bg-card px-2 min-w-0">
                  <div className="flex justify-between gap-4 py-2.5 px-2">
                    <span>{T.kriterien.konzept}</span>
                    <strong>{konzept === "zusatzrente" ? "Zusatzrente" : "Steuerersparnis"}</strong>
                  </div>
                  {[
                    { label: T.kriterien.hoechstens, schluessel: "beitrag", einheit: "€", platzhalter: "z.B. 400" },
                    { label: T.kriterien.grenze, schluessel: "grenzeStress", einheit: "€", platzhalter: "z.B. 500" },
                    { label: T.kriterien.eigenkapital, schluessel: "eigenkapital", einheit: "€", platzhalter: "z.B. 20.000" },
                    { label: T.kriterien.reserve, schluessel: "reserve", einheit: "€", platzhalter: "z.B. 15.000" },
                    { label: T.kriterien.wichtig, schluessel: "ueberzeugungen", platzhalter: "z.B. planbar, wenig Aufwand" },
                  ].map((z) => (
                    <div key={z.schluessel} className="flex items-start justify-between gap-4 py-2.5 px-2">
                      <span className="shrink-0 max-w-[50%]">{z.label}</span>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-baseline justify-end gap-1 font-semibold">
                          <Freitext
                            label={z.label}
                            wert={w(z.schluessel)}
                            onChange={(v) => setzeAntwort(z.schluessel, v)}
                            platzhalter={z.platzhalter}
                            className="text-right"
                          />
                          {z.einheit && mitEuro(w(z.schluessel)) && <span>{z.einheit}</span>}
                        </div>
                        <AusErstgespraech sichtbar={uebernommen.has(z.schluessel)} />
                      </div>
                    </div>
                  ))}
                </div>
                <Karte>
                  <Kopf>{a(T.kriterien.worteKopf)}</Kopf>
                  <p className="mt-2 italic text-xl">{a(T.kriterien.worteFrage)}</p>
                  <Freitext
                    label="Gründe des Kunden, wörtlich"
                    wert={w("warumJetzt")}
                    onChange={(v) => setzeAntwort("warumJetzt", v)}
                    platzhalter="Wörtlich mitschreiben …"
                    className="mt-3 text-base"
                  />
                  <p className="mt-3 text-sm text-muted-foreground">{T.kriterien.worteText}</p>
                </Karte>
              </div>

              {/* Haushaltsrechnung und Finanzierungsrahmen aus der bisherigen Präsentation, gerechnet statt geschätzt. */}
              <div data-ui="card" className="mt-8 rounded-2xl bg-card border-2 p-5 md:p-6" style={{ borderColor: pflicht(hatHaushalt) ?? FARBE.linie }}>
                <p className="font-semibold">{T.kriterien.rahmenKopf}</p>
                <p className="text-sm text-muted-foreground mt-1">{tx.arbeitsweise.finanzierungText as string}</p>
                <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { schluessel: "einnahmen", label: tx.arbeitsweise.feldEinnahmen as string, platzhalter: "4.000" },
                    { schluessel: "ausgaben", label: tx.arbeitsweise.feldAusgaben as string, platzhalter: "2.400" },
                    { schluessel: "eigenkapitalGesamt", label: tx.arbeitsweise.feldEigenkapitalGesamt as string, platzhalter: "80.000" },
                    { schluessel: "eigenkapital", label: tx.arbeitsweise.feldEigenkapital as string, platzhalter: "25.000" },
                  ].map((f) => (
                    <div key={f.schluessel} className="min-w-0">
                      <label htmlFor={`frage-${f.schluessel}`} className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        {f.label}
                      </label>
                      <input
                        id={`frage-${f.schluessel}`}
                        inputMode="decimal"
                        value={w(f.schluessel)}
                        onChange={(e) => setzeAntwort(f.schluessel, e.target.value)}
                        placeholder={`${f.platzhalter} €`}
                        className="mt-1 w-full rounded-xl border px-3 h-11 tabular-nums outline-none focus:border-primary bg-background"
                        style={{ borderColor: (w(f.schluessel) || "").trim() ? FARBE.linie : "#D97706" }}
                      />
                      <AusErstgespraech sichtbar={uebernommen.has(f.schluessel)} />
                    </div>
                  ))}
                </div>
                {rahmen && (
                  <div className="mt-5 grid sm:grid-cols-3 gap-4 rounded-xl p-4 bg-primary/10">
                    <div>
                      <Kopf>{tx.arbeitsweise.ueberschuss as string}</Kopf>
                      <p className="text-xl font-semibold tabular-nums mt-1">{fmt.euro(rahmen.ueberschuss)}</p>
                    </div>
                    <div>
                      <Kopf>{tx.arbeitsweise.tragbar as string}</Kopf>
                      <p className="text-xl font-semibold tabular-nums mt-1">{fmt.euro(rahmen.tragbareRate)}</p>
                    </div>
                    <div>
                      <Kopf>{tx.arbeitsweise.rahmen as string}</Kopf>
                      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: FARBE.gruenText }}>
                        {fmt.euro(rahmen.empfRahmen)}
                      </p>
                    </div>
                    <p className="sm:col-span-3 text-xs text-muted-foreground">
                      {a(tx.arbeitsweise.rahmenErklaerung)} {a(tx.arbeitsweise.orientierung)}
                    </p>
                  </div>
                )}
              </div>
              <Trainer hinweis="Erst die Grenze im Stressfall eintragen. Der Kunde formuliert seine Kriterien selbst, seine Gründe wörtlich mitschreiben." />
            </Folie>

            {/* ─── 10 Sicherheit: Chancen und Risiken (PDF-Präsentation Folie 26) ─── */}
            <Folie id="risiken" ton="hell" kicker={T.risiken.kicker} titel={T.risiken.titel}>
              <div className="mt-8 grid lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
                {/* Feste dunkle Karte wie in der PDF; die dunkle Glaskarte wirkt nur in dunklen Abschnitten. */}
                <div className="rounded-2xl border p-5 md:p-6 min-w-0" style={{ background: FARBE.gruen, borderColor: FARBE.gruen }}>
                  <Kopf dunkel>{T.risiken.vorteileKopf}</Kopf>
                  <ul className="mt-3 divide-y" style={{ borderColor: "rgba(243,247,245,0.15)" }}>
                    {T.risiken.vorteile.map((v) => (
                      <li key={v} className="flex items-start gap-3 py-2.5" style={{ color: FARBE.hellText }}>
                        <Check aria-hidden className="h-5 w-5 mt-0.5 shrink-0" style={{ color: FARBE.gold }} />
                        <span className={v.length > 40 ? "text-sm" : "text-base md:text-lg"}>{a(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-4">
                  <Karte>
                    <Kopf>{T.risiken.risikenKopf}</Kopf>
                    <ul className="mt-3 divide-y divide-border">
                      {T.risiken.risiken.map((r) => (
                        <li key={r} className="py-2 text-sm">– {r}</li>
                      ))}
                    </ul>
                  </Karte>
                  <p className="text-lg leading-snug font-medium">{mitAkzent(T.risiken.satz, FARBE.gruenText)}</p>
                </div>
              </div>
              <Fussnote>{T.risiken.fuss}</Fussnote>
            </Folie>

            {/* ─── 11 Dein Weg (PDF-Präsentation Folie 28) ─── */}
            <Folie id="weg" ton="gruen" kicker={a(T.weg.kicker)} titel={T.weg.titel}>
              <p className="mt-6 text-base md:text-lg max-w-3xl leading-relaxed">{T.weg.lead}</p>
              <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-x-3 gap-y-5 relative">
                <div aria-hidden className="hidden lg:block absolute left-[5%] right-[5%] top-4 h-px" style={{ background: "rgba(243,247,245,0.3)" }} />
                {T.weg.schritte.map((s, i) => (
                  <li key={s.titel} className="relative flex lg:flex-col items-start lg:items-center gap-3 lg:gap-0 lg:text-center">
                    <span
                      className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold"
                      style={
                        s.stand === "erledigt"
                          ? { background: FARBE.salbei, borderColor: FARBE.salbei }
                          : s.stand === "heute"
                          ? { background: FARBE.gold, borderColor: FARBE.gold, color: FARBE.aufGold }
                          : { background: FARBE.gruen, borderColor: "#D8C7A0" }
                      }
                    >
                      {s.stand === "erledigt" ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="lg:mt-2 font-semibold text-sm hyphens-auto break-words">{s.titel}</p>
                      <p className="text-xs leading-snug mt-0.5" style={{ color: FARBE.hellGedaempft }}>
                        {a(s.text)}
                      </p>
                      {s.marke && (
                        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em]" style={{ color: FARBE.gold }}>
                          {s.marke}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-10 grid md:grid-cols-2 gap-4 items-center">
                <FrageAnDich dunkel>{T.weg.frage}</FrageAnDich>
                <p className="text-base md:text-lg">{a(T.weg.satz)}</p>
              </div>
              <Fussnote dunkel>{T.weg.fuss}</Fussnote>
            </Folie>

            {/* ─── Rückspiegelung „Ihre Angaben“ ─── */}
            {(beantwortet.length > 1 || erwartung) && (
              <Folie id="rueckblick" ton="hell" kicker={a(tx.rueckblick.nummer)} titel={a(tx.rueckblick.titel)}>
                <p className="mt-6 max-w-3xl">{a(tx.rueckblick.vorspann)}</p>
                <div className="mt-6 grid md:grid-cols-2 gap-4">
                  {beantwortet.map((f) => (
                    <Karte key={f.frage}>
                      <Kopf>{f.frage}</Kopf>
                      <p className="mt-2 text-lg font-semibold leading-snug break-words">{f.wert}</p>
                    </Karte>
                  ))}
                </div>
                {erwartung && (
                  <Karte className="mt-4">
                    <Kopf>{a(tx.rueckblick.erwartung)}</Kopf>
                    <p className="mt-2 text-lg font-semibold leading-snug break-words">{erwartung}</p>
                    <p className="mt-3 pt-3 border-t border-border font-medium" style={{ color: FARBE.gruenText }}>
                      {tx.rueckblick.erfuellt as string}
                    </p>
                  </Karte>
                )}
                <Trainer id="rueckblick" />
              </Folie>
            )}

            {/* ─── 15 Der nächste Schritt ─── */}
            <Folie id="schritt" ton="gruen" kicker={T.schritt.kicker}>
              <div className="grid lg:grid-cols-[1.5fr_1fr] gap-8 items-start">
                <div className="min-w-0">
                  <p className="bos-kicker" style={{ color: FARBE.gold }}>{T.schritt.satzKopf}</p>
                  <p className="mt-3 text-xl md:text-2xl leading-snug">{mitAkzent(T.schritt.satz, FARBE.mint)}</p>
                  <div className="mt-8 border-l-4 pl-5" style={{ borderColor: FARBE.gold }}>
                    <p className="bos-kicker" style={{ color: FARBE.gold }}>{T.schritt.frageKopf}</p>
                    <Titel text={T.schritt.titel} ton="gruen" className="mt-2 !text-[1.7rem] sm:!text-[2.2rem] md:!text-[2.5rem]" />
                  </div>
                </div>
                {/* Terminvorschlag wie in der PDF, als Felder; die Antworten kommen ins Antworten-PDF. */}
                <Karte dunkel rand={FARBE.gold}>
                  <div data-testid="terminvorschlag">
                    <p className="bos-kicker" style={{ color: FARBE.gold }}>{T.schritt.terminKopf}</p>
                    <p className="mt-2 text-2xl font-semibold">{T.schritt.terminTitel}</p>
                    <p className="mt-1 text-sm" style={{ color: FARBE.hellGedaempft }}>{T.schritt.terminText}</p>
                    <p className="mt-5 text-[0.65rem] font-semibold uppercase tracking-[0.18em]" style={{ color: FARBE.gold }}>{T.schritt.vorschlag}</p>
                    <div className="mt-2 grid gap-1">
                      {T.schritt.felder.map((f) => (
                        <label key={f.schluessel} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2 border-b py-1.5 text-sm" style={{ borderColor: "rgba(243,247,245,0.25)" }}>
                          <span style={{ color: FARBE.hellGedaempft }}>{f.label}</span>
                          <input
                            value={w(f.schluessel)}
                            onChange={(e) => setzeAntwort(f.schluessel, e.target.value)}
                            placeholder={f.schluessel === "terminDatum" ? inSiebenTagen() : ""}
                            className="bos-feld min-w-0 font-semibold placeholder:opacity-50"
                            style={{ color: FARBE.hellText }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </Karte>
              </div>
              <p className="mt-10 text-base md:text-lg max-w-3xl leading-relaxed">{a(hatKundenKontext || weiterZurSelbstauskunft ? T.schritt.text : T.schritt.textOhneKunde)}</p>
              <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
                {weiterZurSelbstauskunft && (
                  <button
                    type="button"
                    data-no-shrink
                    data-testid="weiter-zur-selbstauskunft"
                    onClick={oeffneSelbstauskunft}
                    className="btn-brand inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold"
                  >
                    <ClipboardList className="h-5 w-5" />
                    Weiter zur Selbstauskunft
                  </button>
                )}
                {hatKundenKontext && !weiterZurSelbstauskunft && (
                <button
                  type="button"
            data-no-shrink
                  onClick={oeffneSelbstauskunft}
                  className="bos-knopf-gold inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold transition-transform hover:scale-[1.02]"
                  style={{ background: FARBE.gold, color: FARBE.aufGold }}
                >
                  <ClipboardList className="h-5 w-5" />
                  {T.schritt.knopf}
                </button>
                )}
                {weiterZurSelbstauskunft ? null : objektLink ? (
                  <a
                    href={objektLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-no-shrink
                    className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 border font-semibold transition-transform hover:scale-[1.02]"
                    style={{ borderColor: FARBE.gold, color: FARBE.hellText }}
                  >
                    <CalendarCheck className="h-5 w-5" />
                    {T.schritt.knopfObjekt}
                  </a>
                ) : (
                  <button
                    type="button"
                    data-no-shrink
                    disabled
                    aria-describedby="objektlink-fehlt"
                    className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 border font-semibold opacity-50 cursor-not-allowed"
                    style={{ borderColor: "rgba(243,247,245,0.35)" }}
                  >
                    <CalendarCheck className="h-5 w-5" />
                    {T.schritt.knopfObjekt}
                  </button>
                )}
                <span className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 border text-sm" style={{ borderColor: "#D8C7A0" }}>
                  <CalendarClock className="h-4 w-4" />
                  {T.schritt.termin}: {inSiebenTagen()}
                </span>
              </div>
              {vorschauSprung && (
                <p data-testid="vorschau-sprung" className="mt-4 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: FARBE.gold }}>
                  Vorschau: Im CRM öffnet sich jetzt die Selbstauskunft unter <code className="break-all">{vorschauSprung}</code>
                </p>
              )}
              {!objektLink && !weiterZurSelbstauskunft && (
                <p id="objektlink-fehlt" className="mt-3 text-xs" style={{ color: FARBE.hellGedaempft }}>
                  {T.schritt.ohneObjektLink}
                </p>
              )}
              <Trainer id="schritt" dunkel hinweis={T.schritt.hinweis} />
              <Fussnote dunkel>{T.schritt.hinweisRecht}</Fussnote>
            </Folie>

            {/* ─── 16 Nächster Termin ─── */}
            <Folie id="termin" ton="hell" kicker={a(T.termin.kicker)} titel={a(T.termin.titel)}>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {T.termin.karten.map((k, i) => (
                  <Karte key={i}>
                    <p className="font-semibold">{a(k.titel)}</p>
                    <p className="mt-1.5 text-sm leading-relaxed">{a(k.titel === "Deine Kalkulation" && !hatKundenKontext ? T.termin.kalkulationOhneKunde : k.text)}</p>
                  </Karte>
                ))}
              </div>
              <Karte className="mt-4" data-testid="antworten-pdf">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{T.termin.antwortenKopf}</p>
                    <p className="mt-1 text-sm" style={{ color: FARBE.grau }}>{T.termin.antwortenText}</p>
                  </div>
                  <button
                    type="button"
                    data-no-shrink
                    data-ui="button"
                    onClick={antwortenAlsPdf}
                    disabled={pdfLaeuft}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    {pdfLaeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                    {T.termin.antwortenKnopf}
                  </button>
                </div>
              </Karte>
              {hatKundenKontext && (
              <Karte className="mt-4" rand={FARBE.gold}>
                <p className="text-sm leading-relaxed">{T.termin.portalSatz}</p>
                {portalFreigegeben ? (
                  <p data-testid="portal-freigegeben" className="mt-4 inline-flex items-center gap-2 font-semibold" style={{ color: FARBE.gruenText }}>
                    <Check className="h-5 w-5" />
                    {T.termin.portalFreigegeben}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                      type="button"
                      data-no-shrink
                      onClick={portalFreigeben}
                      disabled={!saUnterschrieben || portalFreigabeLaeuft}
                      aria-describedby={saUnterschrieben ? undefined : "portal-vor-unterschrift"}
                      data-ui="button"
                      className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <KeyRound className="h-5 w-5" />
                      {T.termin.portalKnopf}
                    </button>
                    {!saUnterschrieben && (
                      <p id="portal-vor-unterschrift" className="text-xs" style={{ color: FARBE.grau }}>
                        {T.termin.portalVorUnterschrift}
                      </p>
                    )}
                  </div>
                )}
                {vorschau && vorschauPortal && (
                  <p data-testid="vorschau-portal" className="mt-3 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: FARBE.gold }}>
                    Vorschau: Im CRM geht jetzt die Einladung ins Kundenportal an den Kunden, nichts wurde versendet.
                  </p>
                )}
              </Karte>
              )}
            </Folie>

            <footer className="px-4 sm:px-8 py-10" style={{ background: FARBE.tief }}>
              <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                <img src={logoDunkel} alt="OS Real Estate" className="h-10 w-auto opacity-80" />
                <p className="text-xs text-center md:text-right max-w-xl" style={{ color: "rgba(243,247,245,0.72)" }}>
                  {T.fuss}
                </p>
              </div>
            </footer>

            {/* Sprung zum Ziel des Gesprächs */}
            <button
              type="button"
            data-no-shrink
              data-pdf-exclude
              onClick={() => springeZu("schritt")}
              data-ui="button"
              className="fixed bottom-5 right-4 z-40 rounded-full shadow-2xl px-4 h-11 flex items-center gap-2 text-sm font-semibold bg-primary text-primary-foreground"
            >
              <ChevronDown className="h-4 w-4" />
              Zur Selbstauskunft
            </button>
          </div>
        </div>
      </TrainerContext.Provider>
    </>
  );
}

