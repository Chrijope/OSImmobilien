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
import { CalendarClock, Check, ChevronDown, ClipboardList, FileText, Menu, X } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SPRECHSKRIPT_NACH_ID, sprechskriptFuerAnrede } from "@/lib/beratungSprechskripte";
import { rahmenAusUeberschuss } from "@/lib/finanzierbarkeitUtils";
import { RATE_EINGANG, rateAnteile } from "@/lib/rateAnteile";
import { useCacheReady } from "@/hooks/useCacheReady";
import { onCacheChange } from "@/lib/dataCache";
import { getKontaktById } from "@/lib/kundenStore";
import { getInvestmentMetaField } from "@/lib/investmentsStore";
import { ANLAGE_ZIELE, zielNachLabel } from "@/lib/anlageZiele";
import { zuZahl } from "@/lib/beratungspraesentationSprache";
import { BERATUNG_TEXTE, formatierer, inAnrede, type AnredeWert } from "@/lib/beratungspraesentationTexte";
import {
  OS_TEXTE,
  PLAN_OBJEKT,
  PLAN_ZEILEN,
  aufTausend,
  begruessungsName,
  konzeptAusSchwerpunkt,
  rentenluecke,
  uebernahmeAusSkript,
  vermoegenNach,
  wertNach,
  type KonzeptOs,
} from "@/lib/beratungOsDaten";
import { DOKUMENTE_B, KAUFKRAFT_B, OS_TEXTE_B, dokumenteFuer } from "@/lib/beratungOsDatenB";
import logoDunkel from "@/assets/os-real-estate-logo-dark.png";
import logoQuer from "@/assets/os-real-estate-logo-quer.png";
import logoQuerDunkel from "@/assets/os-real-estate-logo-quer-dunkel.png";
import osZeichen from "@/assets/beratung/os-zeichen-gold.png";
import fotoHauff from "@/assets/beratung/hauffstrasse-38.jpg";
import fotoZossen from "@/assets/beratung/zossen-wuensdorf.jpg";
import fotoBarfuss from "@/assets/beratung/barfusstrasse-9.jpg";
import "@/styles/praesentation-liquid.css";
import "@/styles/beratung-os.css";

/** Daten für die lokale Vorschau ohne Anmeldung (src/pages/VorschauBeratung.tsx). */
export interface BeratungVorschau {
  /** Ersetzt die Kontakt-ID, auch im Schlüssel der gemerkten Antworten. */
  schluessel: string;
  kundenName: string;
  kontakt: { anrede?: string; vorname?: string; nachname?: string; qualEinkommen?: string; qualEigenkapital?: string };
  skript: { anrede?: string; antworten?: Record<string, string>; ziele?: string[] } | null;
}

/** Hell liegt auf dem Grund der Glasschicht, Grün und Tief sind dunkelgrüne Abschnitte. */
type Ton = "hell" | "gruen" | "tief";

/*
 * Farben aus den Tokens des CRM (index.css, design-liquid.css). Die beiden
 * Grüntöne haben den Farbton von --primary, nur dunkel. Gold bleibt als
 * Akzent, wie im Logo; auf hellem Grund das dunklere Gold (--bos-akzent).
 */
const FARBE = {
  gruen: "hsl(157 42% 13%)",
  tief: "hsl(158 38% 9%)",
  gold: "#CCAC05",
  goldDunkel: "var(--bos-akzent)",
  /** Grün als Schrift, auf Glas die dunklere Stufe der Glasschicht. */
  gruenText: "hsl(var(--lg-schrift-blau, var(--primary)))",
  primaer: "hsl(var(--primary))",
  tinte: "hsl(var(--foreground))",
  grau: "hsl(var(--muted-foreground))",
  linie: "hsl(var(--border))",
  hellText: "#F3F7F5",
  // 0,8 statt 0,68: kleine Schrift auf Dunkelgrün braucht 4,5:1 (gerechnet etwa 9:1).
  hellGedaempft: "rgba(243,247,245,0.8)",
  salbei: "#6F9A7E",
  /** Schrift auf Gold. */
  aufGold: "#14231B",
};

const TrainerContext = createContext(false);

/** Überschrift mit [[Akzent]]: auf hellem Grund dunkles Gold, auf Grün helles. */
function Titel({ text, ton, className = "" }: { text: string; ton: Ton; className?: string }) {
  const teile = text.split(/\[\[|\]\]/);
  const akzent = ton === "hell" ? FARBE.goldDunkel : FARBE.gold;
  return (
    <h2 className={`font-semibold leading-[1.12] tracking-[-0.022em] text-[2rem] sm:text-[2.6rem] md:text-[3.1rem] ${className}`}>
      {teile.map((t, i) =>
        i % 2 ? (
          <span key={i} style={{ color: akzent }}>
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </h2>
  );
}

/** Ein Abschnitt: hell auf dem Grund der Glasschicht oder dunkelgrün hinterlegt. */
function Folie({
  id,
  ton,
  kicker,
  titel,
  children,
  oben,
  ohneStrich,
}: {
  id: string;
  ton: Ton;
  kicker?: string;
  titel?: string;
  children?: React.ReactNode;
  /** Steht über dem Kicker, etwa der Konzeptschalter. */
  oben?: React.ReactNode;
  ohneStrich?: boolean;
}) {
  const dunkel = ton !== "hell";
  return (
    <section
      id={id}
      data-ton={ton}
      className={`relative scroll-mt-16 px-4 sm:px-8 md:px-12 py-14 md:py-20 ${dunkel ? "bos-dunkel" : ""}`}
      style={dunkel ? { background: ton === "gruen" ? FARBE.gruen : FARBE.tief, color: FARBE.hellText } : undefined}
    >
      <div className="max-w-6xl mx-auto">
        {oben && <div className="mb-8">{oben}</div>}
        {kicker && (
          <p className="bos-kicker mb-3" style={{ color: dunkel ? FARBE.gold : FARBE.gruenText }}>
            {kicker}
          </p>
        )}
        {titel && <Titel text={titel} ton={ton} />}
        {titel && !ohneStrich && <div className="mt-5 h-[3px] w-14 rounded-full" style={{ background: dunkel ? FARBE.gold : FARBE.primaer }} />}
        {children}
      </div>
    </section>
  );
}

/**
 * Karte. Hell: eine Karte der Glasschicht (`data-ui="card"` mit `bg-card`,
 * design-liquid.css macht sie zu Glas). Dunkel: die dunkle Scheibe
 * `.bos-glas-dunkel` aus beratung-os.css.
 */
function Karte({
  dunkel,
  children,
  className = "",
  rand,
}: {
  dunkel?: boolean;
  children: React.ReactNode;
  className?: string;
  rand?: string;
}) {
  return (
    <div
      data-ui={dunkel ? undefined : "card"}
      className={`rounded-2xl border p-5 md:p-6 min-w-0 ${dunkel ? "bos-glas-dunkel" : "bg-card text-card-foreground"} ${className}`}
      style={rand ? { borderColor: rand } : undefined}
    >
      {children}
    </div>
  );
}

/** Kleine Kopfzeile in Karten. */
function Kopf({ children, dunkel }: { children: React.ReactNode; dunkel?: boolean }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: dunkel ? FARBE.hellGedaempft : FARBE.grau }}>
      {children}
    </p>
  );
}

/** Große Zahl. */
function Wert({ children, farbe, klein }: { children: React.ReactNode; farbe?: string; klein?: boolean }) {
  return (
    <p
      className={`font-semibold tracking-[-0.02em] tabular-nums mt-2 leading-none break-words ${klein ? "text-[1.7rem]" : "text-[2rem] md:text-[2.4rem]"}`}
      style={{ color: farbe }}
    >
      {children}
    </p>
  );
}

function Fussnote({ children, dunkel }: { children: React.ReactNode; dunkel?: boolean }) {
  return (
    <p className="mt-4 text-xs leading-relaxed" style={{ color: dunkel ? "rgba(243,247,245,0.72)" : FARBE.grau }}>
      {children}
    </p>
  );
}

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

/** Der Schalter Konzept 1 / Konzept 2, oben in den Abschnitten 8 bis 10 und 12. */
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

/** Logo der Markenfamilie: OS-Zeichen in Gold, darunter der Name (Konzept C). */
function MarkenLogo({ name, zusatz, farbe, gross }: { name: string; zusatz: string; farbe: string; gross?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <img src={osZeichen} alt="" aria-hidden className={gross ? "h-14 md:h-16 w-auto" : "h-10 md:h-11 w-auto"} />
      <p
        className={`uppercase mt-2 ${gross ? "text-lg md:text-xl tracking-[0.42em]" : "text-sm md:text-[0.95rem] tracking-[0.32em]"}`}
        style={{ color: farbe }}
      >
        {name}
      </p>
      <p className="uppercase text-[0.55rem] tracking-[0.28em] mt-1" style={{ color: "rgba(243,247,245,0.65)" }}>
        {zusatz}
      </p>
      <div className={`mt-2 h-[2px] ${gross ? "w-36" : "w-24"}`} style={{ background: farbe }} />
    </div>
  );
}

/** Fassung B, Abschnitt 04: Kaufkraft als Balken, der Verlust in Rot. */
function KaufkraftGrafik() {
  const max = Math.max(...KAUFKRAFT_B.balken.map((b) => b.wert));
  const farbe = { neutral: FARBE.salbei, papier: "#D8C7A0", verlust: ROT };
  return (
    <figure data-ui="card" className="mt-8 rounded-2xl border bg-card p-5 md:p-6" data-testid="kaufkraft-grafik">
      <figcaption className="font-semibold">{KAUFKRAFT_B.grafikTitel}</figcaption>
      <div className="mt-4 space-y-3">
        {KAUFKRAFT_B.balken.map((b) => (
          <div key={b.label} className="grid grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[12rem_1fr] items-center gap-3 text-sm">
            <span style={{ color: b.ton === "verlust" ? ROT : undefined }} className={b.ton === "verlust" ? "font-semibold" : ""}>
              {b.label}
            </span>
            <div className="h-8 rounded-md bg-muted overflow-hidden">
              <div
                className="h-full rounded-md flex items-center justify-end px-2 text-xs font-semibold tabular-nums whitespace-nowrap"
                style={{ width: `${(b.wert / max) * 100}%`, background: farbe[b.ton], color: b.ton === "verlust" ? "#FFFFFF" : "#1A1D1A" }}
              >
                {b.wert.toLocaleString("de-DE")} €
              </div>
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Fassung B: Vertriebsdokumente zum gewählten Konzept, öffnen als PDF in neuem Tab. */
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
  ["objekte", "Objekte"],
  ["rechnung", "Rechnung"],
  ["kriterien", "Kriterien"],
  ["schritt", "Nächster Schritt"],
];

const ZIELE_MAX = 3;

/** Wer trägt die Rate: aus der Musterrechnung Hauffstraße 38 WE01 gerechnet, nicht getippt. */
const RATE_HAUFF = rateAnteile(RATE_EINGANG.hauffstrasse);

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
}: { vorschau?: BeratungVorschau; variante?: BeratungVariante } = {}) {
  const T = variante === "b" ? OS_TEXTE_B : OS_TEXTE;
  const istB = variante === "b";
  const [suchParameter] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
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

  // Fassung B, Abschnitt 02: nur, was im Erstgespräch wirklich hinterlegt ist.
  const ausErstgespraech = (() => {
    if (!istB || !kundeId) return {};
    const { kontakt, skript } = leseQuelle();
    return uebernahmeAusSkript(skript, kontakt);
  })();

  // Konzeptschalter: vorbelegt aus dem Schwerpunkt, ein Klick überschreibt.
  const konzept: KonzeptOs = (w("konzept") as KonzeptOs) || konzeptAusSchwerpunkt(w("schwerpunkt"));
  const setKonzept = (k: KonzeptOs) => setzeAntwort("konzept", k);

  // Regler: Wertentwicklung im Plan und in „So funktioniert es“.
  const [wertentwicklung, setWertentwicklung] = useState(2);
  const planObjekt = PLAN_OBJEKT[konzept];
  const vermoegen1 = aufTausend(vermoegenNach(planObjekt.kaufpreis, planObjekt.restschuld, wertentwicklung));
  const vermoegen3 = aufTausend(3 * vermoegenNach(planObjekt.kaufpreis, planObjekt.restschuld, wertentwicklung));
  const hauffWert = aufTausend(wertNach(PLAN_OBJEKT.zusatzrente.kaufpreis, wertentwicklung));
  const hauffVermoegen = aufTausend(vermoegenNach(PLAN_OBJEKT.zusatzrente.kaufpreis, PLAN_OBJEKT.zusatzrente.restschuld, wertentwicklung));
  const prozentText = `${fmt.zahl(wertentwicklung, wertentwicklung % 1 ? 1 : 0)} %`;

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
    if (vorschau) setVorschauSprung(selbstauskunftAdresse());
    else navigate(selbstauskunftAdresse());
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
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="mt-10 flex flex-col items-center">
        <MarkenLogo name="Immobilien" zusatz="Berlin · Brandenburg" farbe={FARBE.hellText} gross />
        <p className="mt-5 text-sm text-center" style={{ color: FARBE.hellGedaempft }}>
          <strong className="font-semibold" style={{ color: FARBE.hellText }}>
            {T.gruppe.dach}
          </strong>{" "}
          · {T.gruppe.dachText}
        </p>
      </div>
      {/* Verbindungslinien nur ab Tablet; auf dem Handy stehen die Marken untereinander. */}
      <div aria-hidden className="hidden md:block mx-auto mt-6 w-2/3 h-6 border-x border-t" style={{ borderColor: "rgba(204,172,5,0.6)" }} />
      <div className="mt-6 md:mt-4 grid md:grid-cols-3 gap-10 md:gap-6">
        {T.gruppe.marken.map((m) => (
          <div key={m.name} className="text-center">
            <MarkenLogo name={m.name} zusatz={m.zusatz} farbe={m.farbe} />
            <p className="mt-4 text-sm leading-relaxed max-w-xs mx-auto" style={{ color: FARBE.hellGedaempft }}>
              {a(m.text)}
            </p>
          </div>
        ))}
      </div>
      <Fussnote dunkel>
        <span className="block text-center">{T.gruppe.fuss}</span>
      </Fussnote>
    </Folie>
  );

  return (
    <>
      <TrainerContext.Provider value={trainerVerfuegbar && trainerAn}>
        <div className="min-h-screen bg-background text-foreground font-sans" data-lg="seite" data-praesentation="beratung" lang="de">
          <div className="bos bos-crm min-h-screen">
            {trainerVerfuegbar && (
              <button
                type="button"
            data-no-shrink
                data-pdf-exclude
                onClick={() => setTrainerAn((v) => !v)}
                className="fixed bottom-5 left-4 z-[70] inline-flex items-center gap-2 rounded-full border-2 border-dashed border-amber-500/70 bg-amber-50 px-4 h-11 text-sm font-semibold text-amber-800 shadow-lg"
              >
                {trainerAn ? "Trainer-Modus aus" : "Trainer-Modus an"}
              </button>
            )}
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
            <section id="hero" className="relative overflow-hidden px-4 sm:px-8 md:px-12 py-16 md:py-24 min-h-[70vh] flex items-center" style={{ background: FARBE.tief, color: FARBE.hellText }}>
              <div className="absolute inset-0" style={{ backgroundImage: `url(${fotoHauff})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(158 38% 9% / 0.95) 0%, hsl(157 42% 11% / 0.86) 45%, hsl(157 42% 13% / 0.72) 100%)" }} />
              <div className="relative max-w-6xl mx-auto w-full">
                <img src={logoDunkel} alt="OS Real Estate GmbH" className="h-24 md:h-28 w-auto" />
                <p className="bos-kicker mt-10" style={{ color: FARBE.gold }}>
                  {T.hero.kicker}
                </p>
                <h1 className="font-semibold mt-4 leading-[1.08] text-[2.4rem] sm:text-[3.2rem] md:text-[4rem]">
                  {T.hero.titel1}
                  <br />
                  {T.hero.titel2}
                  <br />
                  {T.hero.titel3} <span style={{ color: FARBE.gold }}>{T.hero.titelAkzent}</span>
                </h1>
                <div className="mt-6 h-[3px] w-14" style={{ background: FARBE.gold }} />
                <p className="mt-6 text-lg md:text-xl break-words">
                  {T.hero.willkommen}
                  {kundenName ? `, ${kundenName}.` : "."}
                </p>
                <Trainer id="hero" dunkel />
              </div>
            </section>

            {/* ─── 01 Agenda ─── */}
            <Folie id="heute" ton="hell" kicker={T.heute.kicker} titel={T.heute.titel}>
              <p className="mt-6 text-base md:text-lg max-w-3xl leading-relaxed">{a(T.heute.text)}</p>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="mt-7 border-l-[3px] pl-5" style={{ borderColor: FARBE.gold }}>
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
                <AusErstgespraech sichtbar={uebernommen.has("motiv")} />
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
                  <AusErstgespraech sichtbar={uebernommen.has("ziel")} />
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
                  <AusErstgespraech sichtbar={uebernommen.has("erfahrung")} />

                  {w("ersteFrage").trim() && (
                    <div data-ui="card" className="mt-6 rounded-xl border p-4 bg-primary/5">
                      <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: FARBE.gruenText }}>
                        {a(T.ziele.ersteFrage)}
                      </p>
                      <p className="mt-1 font-medium break-words">„{w("ersteFrage")}“</p>
                    </div>
                  )}
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
                          <AusErstgespraech sichtbar={uebernommen.has(z.schluessel)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Karte>
              </div>
              </>
              <Trainer id="arbeitsweise" hinweis="Werte aus dem Erstgespräch kurz bestätigen lassen: „Stimmt das noch so?“" />
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
                        placeholder="–"
                        className="bos-feld tabular-nums max-w-full"
                        // Breite folgt der Zahl, damit das €-Zeichen direkt dahinter steht.
                        style={{ width: `${breiteInCh(w(k.schluessel))}ch` }}
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
              <p className="mt-8 text-lg md:text-xl">{a(T.luecke.frage)}</p>
              <Fussnote dunkel>{T.luecke.fuss}</Fussnote>
            </Folie>

            {/* ─── 04 Preis des Nichtstuns ─── */}
            <Folie id="nichtstun" ton="hell" kicker={T.nichtstun.kicker} titel={T.nichtstun.titel}>
              {istB && <p className="mt-6 text-base md:text-lg">{KAUFKRAFT_B.vorspann}</p>}
              <div className="mt-8 grid md:grid-cols-3 gap-4">
                {T.nichtstun.karten.map((k) =>
                  istB && k.warnung ? (
                    // In B ist die Verlustkarte ganz rot, damit der Verlust auf einen Blick steht.
                    <div key={k.kopf} data-testid="kaufkraft-verlust" className="rounded-2xl border-2 p-5 md:p-6 min-w-0" style={{ background: ROT, borderColor: ROT, color: "#FFFFFF" }}>
                      <p className="text-xs font-medium uppercase tracking-[0.06em]">{k.kopf}</p>
                      <Wert>{k.wert}</Wert>
                      <p className="mt-2 text-sm font-medium">{k.text}</p>
                    </div>
                  ) : (
                    <Karte key={k.kopf} rand={k.warnung ? ROT : undefined}>
                      <Kopf>{k.kopf}</Kopf>
                      <Wert farbe={k.warnung ? ROT : FARBE.gruenText}>{k.wert}</Wert>
                      <p className="mt-2 text-sm">{k.text}</p>
                    </Karte>
                  ),
                )}
              </div>
              {istB && <KaufkraftGrafik />}
              <p className="mt-7 text-base md:text-lg">{a(T.nichtstun.satz)}</p>
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

            {/* ─── 06 Vier Bausteine ─── */}
            <Folie id="prinzip" ton="gruen" kicker={T.prinzip.kicker} titel={T.prinzip.titel}>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {T.prinzip.bausteine.map((b) => (
                  <Karte key={b.titel} dunkel>
                    <p className="text-3xl md:text-[2.2rem] font-semibold" style={{ color: FARBE.gold }}>
                      {b.titel}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">{a(b.text)}</p>
                  </Karte>
                ))}
              </div>
              <div className="mt-8 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 flex h-10 rounded-md overflow-hidden text-xs font-semibold" style={{ color: FARBE.aufGold }}>
                  {T.prinzip.anteile.map((t, i) => (
                    <div key={i} className="flex items-center px-2 sm:px-3 whitespace-nowrap overflow-hidden" style={{ width: `${RATE_HAUFF[t.teil]}%`, background: t.farbe }}>
                      {a(t.label)} {RATE_HAUFF[t.teil]} %
                    </div>
                  ))}
                </div>
                <p className="text-lg md:w-52 md:text-right">{a(T.prinzip.frage)}</p>
              </div>
              <Fussnote dunkel>{a(T.prinzip.fuss)}</Fussnote>
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
              <Fussnote>
                {T.konzept.fuss}
                {w("schwerpunkt") && !w("konzept") && (
                  <> Schwerpunkt im Erstgespräch: {w("schwerpunkt") === "steuer" ? "Steuerersparnis" : w("schwerpunkt") === "beides" ? "beides" : "Zusatzrente"}.</>
                )}
              </Fussnote>
            </Folie>

            {/* ─── 08 So funktioniert es ─── */}
            <Folie
              id="funktion"
              ton="gruen"
              oben={<KonzeptSchalter konzept={konzept} setKonzept={setKonzept} dunkel />}
              kicker={T.funktion.kicker}
              titel={konzept === "zusatzrente" ? T.funktion.zusatzrente.titel : T.funktion.steuer.titel}
              ohneStrich
            >
              {konzept === "zusatzrente" ? (
                <>
                  <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
                    <div aria-hidden className="hidden lg:block absolute left-0 right-0 top-4 h-px" style={{ background: "rgba(243,247,245,0.3)" }} />
                    {T.funktion.zusatzrente.schritte.map((s, i) => (
                      <li key={i} className="relative text-center">
                        <span
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold"
                          style={i === 0 ? { background: FARBE.gold, borderColor: FARBE.gold, color: FARBE.aufGold } : { background: FARBE.gruen, borderColor: "rgba(243,247,245,0.7)" }}
                        >
                          {i + 1}
                        </span>
                        <p className="mt-3 font-semibold">{a(s.titel)}</p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: FARBE.hellGedaempft }}>
                          {a(s.text)}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-10 grid md:grid-cols-3 gap-4">
                    <Karte dunkel>
                      <Kopf dunkel>{T.funktion.zusatzrente.karteObjekt}</Kopf>
                      <Wert farbe={FARBE.gold}>{T.funktion.zusatzrente.zusatzrente}</Wert>
                      <p className="mt-2 text-sm">{T.funktion.zusatzrente.zusatzrenteText}</p>
                    </Karte>
                    <Karte dunkel>
                      <Kopf dunkel>{a(T.funktion.zusatzrente.eigenanteilKopf)}</Kopf>
                      <Wert farbe={FARBE.gold}>{T.funktion.zusatzrente.eigenanteil}</Wert>
                      <p className="mt-2 text-sm">{T.funktion.zusatzrente.eigenanteilText}</p>
                    </Karte>
                    <Karte dunkel>
                      <Kopf dunkel>{T.funktion.zusatzrente.vermoegenKopf}</Kopf>
                      <Wert farbe={FARBE.gold}>{fmt.euro(hauffVermoegen)}</Wert>
                      <p className="mt-2 text-sm">
                        Wert {fmt.euro(hauffWert)} abzüglich Restschuld {fmt.euro(aufTausend(PLAN_OBJEKT.zusatzrente.restschuld))}
                        {wertentwicklung !== 2 && <> · bei {prozentText} Wertentwicklung</>}
                      </p>
                    </Karte>
                  </div>
                  <Fussnote dunkel>{T.funktion.zusatzrente.fuss}</Fussnote>
                </>
              ) : (
                <>
                  <div className="mt-8 grid md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                    <Karte dunkel>
                      <Kopf dunkel>{T.funktion.steuer.heute}</Kopf>
                      <div className="mt-2 divide-y divide-white/20 text-sm">
                        <p className="flex justify-between py-2.5"><span>{T.funktion.steuer.brutto}</span><span>{T.funktion.steuer.bruttoWert}</span></p>
                        <p className="flex justify-between py-2.5"><span>{T.funktion.steuer.netto}</span><strong>{T.funktion.steuer.nettoWert}</strong></p>
                      </div>
                    </Karte>
                    <p aria-hidden className="text-3xl text-center rotate-90 md:rotate-0" style={{ color: FARBE.gold }}>→</p>
                    <Karte dunkel rand={FARBE.gold}>
                      <Kopf dunkel>{T.funktion.steuer.mit}</Kopf>
                      <div className="mt-2 divide-y divide-white/20 text-sm">
                        <p className="flex justify-between py-2.5"><span>{T.funktion.steuer.steuerwirkung}</span><span>{T.funktion.steuer.steuerwirkungWert}</span></p>
                        <p className="flex justify-between py-2.5"><span>{T.funktion.steuer.netto}</span><strong>{T.funktion.steuer.nettoNeu}</strong></p>
                      </div>
                    </Karte>
                  </div>
                  <div className="mt-5 grid md:grid-cols-3 gap-4">
                    {T.funktion.steuer.karten.map((k) => (
                      <Karte key={k.kopf} dunkel>
                        <Kopf dunkel>{k.kopf}</Kopf>
                        <Wert farbe={FARBE.gold}>{k.wert}</Wert>
                        {k.text && <p className="mt-2 text-sm">{k.text}</p>}
                      </Karte>
                    ))}
                  </div>
                  <Fussnote dunkel>{a(T.funktion.steuer.fuss)}</Fussnote>
                </>
              )}
              {istB && <DokumenteB konzepte={dokumenteFuer(w("schwerpunkt"), konzept)} />}
            </Folie>

            {/* ─── 09 Objekte ─── */}
            <Folie id="objekte" ton="hell" oben={<KonzeptSchalter konzept={konzept} setKonzept={setKonzept} />} kicker={a(T.objekte.kicker[konzept])}>
              {konzept === "zusatzrente" ? (
                <>
                  <div className="mt-2 grid md:grid-cols-2 gap-5">
                    {[
                      { foto: fotoHauff, o: T.objekte.hauff },
                      { foto: fotoZossen, o: T.objekte.zossen },
                    ].map(({ foto, o }) => (
                      <div key={o.titel} data-ui="card" className="rounded-2xl overflow-hidden bg-card border min-w-0">
                        <img src={foto} alt={o.titel} className="w-full aspect-[16/7] object-cover" />
                        <div className="p-5">
                          <p className="font-semibold">{o.titel}</p>
                          <p className="mt-1.5 text-sm leading-relaxed">{o.text}</p>
                          <p className="mt-2 text-sm">
                            <strong>{o.preis}</strong> {o.preisRest}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Fussnote>{T.objekte.fuss}</Fussnote>
                </>
              ) : (
                <div className="mt-2 grid md:grid-cols-[1.2fr_1fr] gap-6 items-start">
                  <img src={fotoBarfuss} alt={T.objekte.barfuss.titel1} className="w-full rounded-2xl object-cover aspect-[4/3] md:aspect-[5/4]" />
                  <div className="min-w-0">
                    <p className="font-semibold text-2xl md:text-[2rem] leading-tight">
                      {T.objekte.barfuss.titel1}
                      <br />
                      {T.objekte.barfuss.titel2}
                    </p>
                    <p className="mt-3 leading-relaxed">{T.objekte.barfuss.text}</p>
                    <div className="mt-4 divide-y divide-border border-y border-border text-sm">
                      {T.objekte.barfuss.zeilen.map(([l, v]) => (
                        <p key={l} className="flex justify-between gap-4 py-2.5 px-2">
                          <span>{l}</span>
                          <span className="text-right">{v}</span>
                        </p>
                      ))}
                    </div>
                    <Fussnote>{T.objekte.barfuss.fuss}</Fussnote>
                  </div>
                </div>
              )}
            </Folie>

            {/* ─── 10 Rechnung ─── */}
            <Folie id="rechnung" ton="hell" oben={<KonzeptSchalter konzept={konzept} setKonzept={setKonzept} />} kicker={T.rechnung.kicker}>
              <div className="mt-2 grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
                <div data-ui="card" className="min-w-0 rounded-2xl border bg-card p-4 md:p-6">
                  <p className="font-semibold text-lg md:text-2xl">{T.rechnung[konzept].titel}</p>
                  <table className="mt-4 w-full text-[0.95rem] md:text-base">
                    <thead>
                      <tr className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        <th className="text-left font-medium py-2 px-2">{T.rechnung.spalteZeile}</th>
                        <th className="text-right font-medium py-2 px-2">{T.rechnung.spalteBetrag}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {T.rechnung[konzept].zeilen.map((z, i) => {
                        const fett = z.ton === "summe" || z.ton === "ergebnis";
                        return (
                          <tr
                            key={i}
                            className={fett ? "font-semibold" : z.ton === "klein" ? "text-sm text-muted-foreground" : ""}
                            style={{ borderTop: fett ? `1.5px solid ${FARBE.tinte}` : `1px solid ${FARBE.linie}`, borderBottom: `1px solid ${FARBE.linie}` }}
                          >
                            <td className="py-2.5 px-2">{a(z.text)}</td>
                            <td
                              className="py-2.5 px-2 text-right whitespace-nowrap tabular-nums"
                              style={{ color: z.ton === "plus" ? "hsl(var(--success))" : z.ton === "minus" ? "hsl(var(--destructive))" : undefined }}
                            >
                              {z.betrag}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-4">
                  {T.rechnung[konzept].karten.map((k) => (
                    <Karte key={k.kopf}>
                      <Kopf>{k.kopf}</Kopf>
                      <Wert farbe={FARBE.gruenText} klein>
                        {k.wert}
                      </Wert>
                      {a(k.text) && <p className="mt-2 text-sm">{a(k.text)}</p>}
                    </Karte>
                  ))}
                </div>
              </div>
              <Fussnote>{T.rechnung[konzept].fuss}</Fussnote>
            </Folie>

            {/* ─── 11 Sicherheit ─── */}
            <Folie id="sicherheit" ton="gruen" kicker={T.sicherheit.kicker} titel={T.sicherheit.titel}>
              <div className="mt-8 grid md:grid-cols-3 gap-4">
                {T.sicherheit.karten.map((k) => (
                  <Karte key={k.kopf} dunkel>
                    <p className="font-semibold">{k.kopf}</p>
                    <Wert farbe={FARBE.gold}>{k.wert}</Wert>
                    <p className="mt-2 text-sm">{a(k.text)}</p>
                  </Karte>
                ))}
              </div>
              {w("sorgen").trim() && (
                <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: FARBE.gold }}>
                  <Kopf dunkel>{a(T.sicherheit.sorge)}</Kopf>
                  <p className="mt-1 italic text-lg break-words">„{w("sorgen")}“</p>
                </div>
              )}
              <p className="mt-7 text-lg md:text-xl">{a(T.sicherheit.satz)}</p>
              <Fussnote dunkel>{T.sicherheit.fuss}</Fussnote>
              <Trainer dunkel hinweis="Die Sorge aus dem Erstgespräch hier gezielt beantworten, dann die Grenze im Stressfall in Abschnitt 13 eintragen." />
            </Folie>

            {/* ─── 12 Ihr Plan ─── */}
            <Folie id="plan" ton="hell" oben={<KonzeptSchalter konzept={konzept} setKonzept={setKonzept} />} kicker={a(T.plan.kicker)} titel={T.plan.titel} ohneStrich>
              <div data-ui="card" className="mt-6 overflow-x-auto rounded-2xl border bg-card p-2 md:p-4">
                <table className="w-full text-[0.95rem] md:text-base min-w-[420px]">
                  <thead>
                    <tr className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2 px-2">{planObjekt.name}</th>
                      <th className="text-right font-medium py-2 px-2">{T.plan.eins}</th>
                      <th className="text-right font-medium py-2 px-2">{T.plan.drei}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLAN_ZEILEN[konzept].map((z, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="py-2.5 px-2">{a(z.text)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">{z.vermoegen ? fmt.euro(vermoegen1) : z.eins}</td>
                        <td className={`py-2.5 px-2 text-right tabular-nums whitespace-nowrap ${z.fett ? "font-semibold" : ""}`}>
                          {z.vermoegen ? fmt.euro(vermoegen3) : z.drei}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Der Regler: Wer die Wertentwicklung selbst auf null zieht, sieht, was ohne sie bleibt. */}
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="regler-wertentwicklung">
                <label htmlFor="wertentwicklung" className="text-sm font-medium">
                  {T.plan.regler}: <span className="tabular-nums">{prozentText}</span>
                </label>
                <input
                  id="wertentwicklung"
                  type="range"
                  min={0}
                  max={4}
                  step={0.5}
                  value={wertentwicklung}
                  onChange={(e) => setWertentwicklung(Number(e.target.value))}
                  className="w-full sm:w-72 accent-primary"
                />
              </div>
              <p className="mt-6 text-base md:text-lg">{a(T.plan.satz)}</p>
              <Fussnote>{T.plan.fuss(prozentText)}</Fussnote>
            </Folie>

            {/* ─── 13 Ihre Kriterien ─── */}
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
              <Trainer hinweis="Kunde formuliert seine Kriterien selbst. Seine Gründe wörtlich mitschreiben." />
            </Folie>

            {/* ─── 14 Ihr Weg ─── */}
            <Folie id="weg" ton="gruen" kicker={a(T.weg.kicker)} titel={T.weg.titel}>
              <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 gap-x-2 gap-y-5 relative">
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
              <p className="mt-10 text-base md:text-lg">{a(T.weg.satz)}</p>
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
            <Folie id="schritt" ton="gruen" kicker={T.schritt.kicker} titel={a(T.schritt.titel)}>
              <p className="mt-6 text-base md:text-lg max-w-3xl leading-relaxed">{a(T.schritt.text)}</p>
              <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
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
              {!hatKundenKontext && (
                <p className="mt-3 text-xs" style={{ color: FARBE.hellGedaempft }}>
                  {tx.schritt.kontextHinweis as string}
                </p>
              )}
              {/* Die Antwort auf die Abschlussfrage, für den Berater. Speichern am Investment kommt nach der Freigabe. */}
              <div data-pdf-exclude className="mt-8 flex flex-wrap items-center gap-2 text-sm">
                <span style={{ color: FARBE.hellGedaempft }}>{T.schritt.antwortKopf}:</span>
                {T.schritt.antworten.map((ant) => (
                  <button
                    key={ant}
                    type="button"
            data-no-shrink
                    aria-pressed={w("abschlussAntwort") === ant}
                    onClick={() => setzeAntwort("abschlussAntwort", w("abschlussAntwort") === ant ? "" : ant)}
                    className="rounded-full border px-3 py-1"
                    style={
                      w("abschlussAntwort") === ant
                        ? { background: FARBE.gold, color: FARBE.aufGold, borderColor: FARBE.gold }
                        : { borderColor: "rgba(243,247,245,0.35)" }
                    }
                  >
                    {ant}
                  </button>
                ))}
                {w("abschlussAntwort") === "Ja unter Bedingung" && (
                  <input
                    aria-label={T.schritt.bedingung}
                    value={w("abschlussBedingung")}
                    onChange={(e) => setzeAntwort("abschlussBedingung", e.target.value)}
                    placeholder={T.schritt.bedingung}
                    className="bos-feld flex-1 min-w-[12rem]"
                  />
                )}
              </div>
              <Trainer id="schritt" dunkel hinweis={T.schritt.hinweis} />
            </Folie>

            {/* ─── 16 Nächster Termin ─── */}
            <Folie id="termin" ton="hell" kicker={a(T.termin.kicker)} titel={a(T.termin.titel)}>
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {T.termin.karten.map((k, i) => (
                  <Karte key={i}>
                    <p className="font-semibold">{a(k.titel)}</p>
                    <p className="mt-1.5 text-sm leading-relaxed">{a(k.text)}</p>
                  </Karte>
                ))}
              </div>
              <Karte className="mt-4" rand={FARBE.gold}>
                <p className="font-semibold">{T.termin.bereitlegen}</p>
                <p className="mt-1 text-sm">{T.termin.bereitlegenText}</p>
              </Karte>
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

