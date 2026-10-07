/**
 * Das alte Deck des Bewerbergesprächs: 22 Folien, gezeigt per
 * Bildschirmfreigabe.
 *
 * Seit dem 23.09.2026 hat es keine eigene Adresse mehr. Unter
 * `/closing-praesentation-entwurf` liegt immer die Präsentation des
 * Videocalls mit den fünf Wegen (`BewerberVideocallPraesentation.tsx`). Das
 * Deck lebt nur noch in der Übung unter `/praesentation-uebung`
 * (`PraesentationsUebung.tsx`). Die holt sich von hier die Bühne, die Folien
 * und den Rechner: `Buehne`, `baueFolien`, `useFolienKontext`, `FolieRechner`
 * samt den Typen `DeckEintrag` und `FolienKontext`.
 *
 *   Teil 1, Kennenlernen (Folie 1 bis 7): handelt nur vom Bewerber. Die
 *     Folien kommen datengetrieben aus dem Erstgesprächsskript
 *     (erstgespraechFolien.ts), Folie 7 ist die Überleitung zu Teil 2.
 *   Teil 2, Präsentation über uns (Folie 8 bis 22): das freigegebene
 *     Drehbuch in fünf Phasen: Identifikation, Vision, System, Warum
 *     OS Immobilien, wirtschaftliche Chance, dann die Entscheidung.
 *
 * Reihenfolge, Ids, Kopfzeilentitel und Phase stehen in
 * praesentationsDeck.ts, das auch das Skript der Übung liest. Hier liegt
 * nur die Darstellung. Grafisch ist das Deck die Schwester der
 * Beratungspräsentation, nur als Vollbild-Folien statt als Scrollseite, denn
 * im Termin führt der Presenter, nicht der Scrollbalken.
 *
 * Die Dramaturgie des Drehbuchs steckt in der Reihenfolge: erst das
 * Ja-genau-Gefühl (Chaos gegen System), dann Vision und Substanz, dann die
 * Zahlen mit den Sätzen des Bewerbers, dann die Qualifizierungs-Umkehr
 * (Selbst-Check, "Wir prüfen auch, ob du zu OS Immobilien passt"), erst danach der
 * Preis, und zum Schluss die Risikominderung (Start-Zeitplan) und der
 * Abschluss-Knopf.
 *
 * Zwei Einstiegswege: das ganze Deck ab Folie 1 (Zähler 1 / 22) oder nur
 * Teil 2 ab Folie 8 mit eigenem Zähler (1 / 15). Bei Teil 2 sind die
 * Teil-1-Folien nicht im Deck, auch nicht per Zurück.
 *
 * Ohne Bewerber läuft alles generisch, mit dem einheitlichen Standardsatz von
 * 4 Prozent für beide Wege. So zeigt es die Übung.
 *
 * Bewegung: Alle Animationen (Einblendungen, Hochlauf-Zahlen, Pfad-Zeichnung,
 * Chaos-Zettel, Lichtflächen) respektieren prefers-reduced-motion und
 * degradieren dann zum sofort sichtbaren Endzustand.
 *
 * Optisches Konzept: eine dunkle Bühne mit Licht. Zwei langsam driftende
 * Lichtflächen liegen hinter allen Folien, jede Folie hat genau ein
 * Schlüsselwort im Glanz-Verlauf (Komponente Glanz), und oben läuft eine
 * dünne Fortschrittslinie samt Drehbuch-Phase mit. Karten sind rahmenlose
 * weiche Flächen, die Typografie ist groß und ruhig, Zahlen laufen weich
 * nach. Die Leadberater- und Preis-Folien zeigen ausschließlich Leistungen,
 * die auch in lizenzPakete.ts und im Vertragsgenerator hinterlegt sind.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Building2, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, ClipboardList, Database, Eye, Gauge,
  GraduationCap, Handshake, Landmark, LineChart, Megaphone, Quote, Rocket,
  ShieldCheck, Users, X,
} from "lucide-react";
import {
  Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import logo from "@/assets/moreimmo-logo.png";
import {
  GESTELLT_ZUSATZ_KURZ, LEAD_EINZELPREIS, LEAD_PAKET_ANZAHL, LEAD_PAKET_PREIS,
  formatPreis, ZAHLUNGSWEISEN, type LizenzPaketId, type Zahlungsweise,
} from "@/lib/lizenzPakete";
import { leadpaketAnlageNummer } from "@/lib/vertragKonditionen";
import {
  ermittleSaetze, verguetungProDeal, verguetungProJahr,
} from "@/lib/closingPraesentationRechner";
import { CLOSING_KENNZAHLEN_GEPFLEGT } from "@/lib/closingPraesentationZahlen";
import { PARTNERSTIMMEN } from "@/lib/partnerstimmen";
import { updateBewerber, changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import { DIREKT_PAKETE, closingDirektStatusSprung } from "@/lib/closingDirektSkript";
import {
  getErstgespraechFolie, zerlegeAkzente, zerlegeTitel, type ErstgespraechFolie,
} from "@/lib/erstgespraechFolien";
import { deckFuerEinstieg, type DeckTeil } from "@/lib/praesentationsDeck";

/* ══════════════════════════════════════════════════════════════
   Farbwelt und Bausteine
   ══════════════════════════════════════════════════════════════ */

/**
 * Dieselben Töne wie die dunklen Abschnitte der Beratungspräsentation.
 * Die ganze Präsentation läuft dunkel, weil sie im Termin als Bühne wirkt
 * und nicht wie eine weitere CRM-Seite aussehen soll.
 */
const AKZENT = "#1ED28D";
const AKZENT_STARK = "#1AB57A";
const VERLAUF = "linear-gradient(90deg, #1CC283 0%, #187F58 100%)";
const RAND = "1px solid rgba(255,255,255,0.12)";
const GEDIMMT = "rgba(246,248,252,0.6)";
const GEDIMMTER = "rgba(246,248,252,0.45)";
/** Weiche Kartenfläche ohne Rahmen: dezenter Verlauf statt Kästchen-Optik. */
const FLAECHE = "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";
const FLAECHE_AKTIV = "linear-gradient(160deg, rgba(28,194,131,0.18) 0%, rgba(24,127,88,0.08) 100%)";
/** Glanz-Verlauf für das eine Schlüsselwort jeder Folie. */
const GLANZ_VERLAUF = "linear-gradient(105deg, #92EFCC 0%, #1ED28D 45%, #239F70 100%)";

/**
 * Schlüsselwort im hellen Blauverlauf statt in flacher Akzentfarbe. Pro Folie
 * bewusst nur an einer Stelle einsetzen, damit der Glanz Fokus bleibt und
 * nicht Tapete wird.
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

/** Liest die Systemeinstellung für reduzierte Bewegung. */
function nutztReduzierteBewegung(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Blendet Inhalte beim Erscheinen der Folie ein. Die Folien werden erst beim
 * Aufruf eingehängt, deshalb reicht die reine Einhänge-Animation und es
 * braucht keinen IntersectionObserver wie auf der Scrollseite.
 * motion-reduce:animate-none lässt den Inhalt bei reduzierter Bewegung sofort
 * stehen, ohne Einblendung.
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

/**
 * Zählt einen Zahlenwert weich hoch (requestAnimationFrame, kubisches
 * Ausklingen). Startet beim zuletzt angezeigten Stand, damit Reglerbewegungen
 * fließend nachziehen statt bei null zu beginnen. Bei reduzierter Bewegung
 * steht sofort der Endwert da.
 */
function useHochlauf(wert: number, dauer = 1300): number {
  const reduziert = nutztReduzierteBewegung();
  const [stand, setStand] = useState(() => (reduziert ? wert : 0));
  const standRef = useRef(reduziert ? wert : 0);

  useEffect(() => {
    if (reduziert) {
      standRef.current = wert;
      setStand(wert);
      return;
    }
    const von = standRef.current;
    const start = performance.now();
    let raf = 0;
    const schritt = (jetzt: number) => {
      const p = Math.min(1, (jetzt - start) / dauer);
      // Weiches Ausklingen, damit die Zahl nicht abrupt stehen bleibt.
      const neu = von + (1 - Math.pow(1 - p, 3)) * (wert - von);
      standRef.current = neu;
      setStand(neu);
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [wert, dauer, reduziert]);

  return stand;
}

/** Zahl, die beim Erscheinen hochläuft. */
function HochlaufZahl({
  wert,
  dauer = 1300,
  suffix = "",
}: {
  wert: number;
  dauer?: number;
  suffix?: string;
}) {
  const stand = useHochlauf(wert, dauer);
  return (
    <span className="tabular-nums">
      {Math.round(stand).toLocaleString("de-DE")}
      {suffix}
    </span>
  );
}

/**
 * Kennzahlentext, dessen führende Zahl hochläuft ("12", "20 bis 25",
 * "38 Mio. €"). Texte ohne führende Zahl (Platzhalter wie "X Mio. €")
 * erscheinen unverändert.
 */
function HochlaufText({ text }: { text: string }) {
  const treffer = text.match(/^(\d{1,3}(?:\.\d{3})+|\d+)([\s\S]*)$/);
  const ziel = treffer ? parseInt(treffer[1].replace(/\./g, ""), 10) : 0;
  const stand = useHochlauf(ziel, 1300);
  if (!treffer) return <>{text}</>;
  return (
    <span className="tabular-nums">
      {Math.round(stand).toLocaleString("de-DE")}
      {treffer[2]}
    </span>
  );
}

/** Kleine Überzeile in Versalien, wie auf der Schwesterseite. */
function Kicker({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <Einblendung delay={delay}>
      <p
        className="text-[11px] md:text-xs uppercase tracking-[0.3em] font-semibold mb-4"
        style={{ color: AKZENT }}
      >
        {children}
      </p>
    </Einblendung>
  );
}

/**
 * Fußnote der Beispielrechnungen. Steht auf jeder Folie mit Vergütungszahlen,
 * ausnahmslos, denn das Drehbuch verbietet Einkommensversprechen.
 */
function RechenFussnote({ delay = 0 }: { delay?: number }) {
  return (
    <Einblendung delay={delay}>
      <p className="text-xs leading-relaxed mt-8 max-w-2xl mx-auto" style={{ color: GEDIMMTER }}>
        Beispielrechnung, abhängig von Provisionsbasis und Dealstruktur. Illustrativ vor Kosten
        und Steuern, kein Einkommensversprechen.
      </p>
    </Einblendung>
  );
}

/** Gemeinsamer Rahmen jeder Folie: zentriert, mit Luft, scrollbar falls eng. */
function Folie({ children, breit = false }: { children: React.ReactNode; breit?: boolean }) {
  return (
    <section className="h-full w-full overflow-y-auto">
      <div className="min-h-full flex items-center justify-center px-5 md:px-12 py-10">
        <div className={`w-full ${breit ? "max-w-6xl" : "max-w-4xl"} text-center`}>{children}</div>
      </div>
    </section>
  );
}

/**
 * Schlichte Aufzählung im Stil des Decks: ein kleiner Punkt in Akzentfarbe,
 * eine Aussage je Zeile. Ersetzt auf der Preisfolie die früheren Textblöcke,
 * die im Termin niemand zu Ende liest.
 */
function Punkte({ eintraege }: { eintraege: React.ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-snug" style={{ color: GEDIMMT }}>
      {eintraege.map((eintrag, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: AKZENT }}
          />
          <span>{eintrag}</span>
        </li>
      ))}
    </ul>
  );
}

/* ══════════════════════════════════════════════════════════════
   Inhalte aus dem Drehbuch
   ══════════════════════════════════════════════════════════════ */

/** Alles, was ein Vertriebler alleine stemmen muss (Folie Chaos gegen System). */
const AUFGABEN_ALLEIN = [
  "Ständig neue Objekte suchen",
  "Bauträger und Anbieter einzeln prüfen",
  "Unterschiedliche Unterlagen und Prozesse",
  "Komplizierte Wirtschaftlichkeitsberechnungen",
  "Finanzierungslösungen organisieren",
  "Kunden nachfassen",
  "Dokumente einsammeln",
  "Notartermine koordinieren",
  "Vermietung und Verwaltung erklären",
  "CRM und Systeme selbst aufbauen",
  "Marketing und Leads selbst generieren",
];

/**
 * Der Value Stack (Folie Das System). Die Ersparnis je Baustein ist immer
 * sichtbar: Sie nimmt die frühere Leistungstabelle aus dem Erstgespräch
 * ("Was du von uns bekommst, was es dir spart") mit auf diese Folie, denn
 * im Deck wird die Firma erst in Teil 2 vorgestellt.
 */
const VALUE_STACK: Array<{
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  titel: string;
  text: string;
  /** Was der Baustein dem Partner erspart ("Spart dir: ...") */
  spart: string;
}> = [
  { icon: Database, titel: "CRM", text: "Kunden, Leads, Pipeline und Follow-ups zentral verwalten.", spart: "teure Software-Lizenzen und Entwicklungskosten" },
  { icon: LineChart, titel: "Investagon", text: "Investmentcases professionell berechnen und präsentieren.", spart: "eigenen Kalkulationsaufbau" },
  { icon: Building2, titel: "Produkte", text: "Zugang zu ausgewählten Kapitalanlageimmobilien.", spart: "eigene Objektakquise" },
  { icon: Landmark, titel: "Finanzierung", text: "Zugang zu Finanzierungspartnern und passenden Banklösungen.", spart: "jahrelangen Aufbau von Bankkontakten" },
  { icon: ClipboardList, titel: "Backoffice", text: "Unterstützung bei Dokumenten, Reservierung, Finanzierung und Notar.", spart: "eigene Verwaltung und Rechtsberatung" },
  { icon: Megaphone, titel: "Vertriebsunterlagen", text: "Präsentationen, Exposés, Kalkulationen und Argumentationshilfen.", spart: "Markenaufbau von mehreren tausend Euro" },
  { icon: GraduationCap, titel: "Training", text: "Produkt-, Finanzierungs- und Sales-Know-how.", spart: "teure externe Schulungen" },
  { icon: Users, titel: "Community & Support", text: "Austausch und Unterstützung bei konkreten Kundenfällen.", spart: "den Start bei null" },
];

/** Die fünf Werte samt dem, was sie im Alltag bedeuten. */
const WERTE: Array<{
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  titel: string;
  claim: string;
  alltag: string;
}> = [
  {
    icon: Gauge,
    titel: "Performance",
    claim: "Wir wollen Ergebnisse.",
    alltag: "Wir messen Termine, Beratungen, Abschlüsse und Conversion.",
  },
  {
    icon: ShieldCheck,
    titel: "Verantwortung",
    claim: "Wir behandeln Kundengeld wie unser eigenes.",
    alltag: "Wir verkaufen keine Immobilie, nur weil sie verfügbar ist.",
  },
  {
    icon: Eye,
    titel: "Transparenz",
    claim: "Gute Beratung braucht ehrliche Zahlen.",
    alltag: "Der Kunde sieht echte Kosten, Cashflows und Annahmen.",
  },
  {
    icon: Handshake,
    titel: "Partnerschaft",
    claim: "Gemeinsam gewinnen statt gegeneinander arbeiten.",
    alltag: "Wir unterstützen Partner beim Deal, statt nur ein Exposé zu schicken.",
  },
  {
    icon: Rocket,
    titel: "Fortschritt",
    claim: "Immobilienvertrieb muss nicht funktionieren wie vor 20 Jahren.",
    alltag: "Prozesse werden digitalisiert und kontinuierlich optimiert.",
  },
];

/** Offmarket ist keine eigene Assetklasse, sondern ein Beschaffungsweg. */
const OFFMARKET_ZUSATZ =
  "Dazu kommen immer wieder ausgewählte Offmarket-Objekte außerhalb der Portale.";

/** Die acht Schritte des Deal-Prozesses. */
const DEAL_SCHRITTE = [
  { titel: "Lead", text: "Interessent kommt rein" },
  { titel: "Qualifizierung", text: "Situation und Ziele" },
  { titel: "Strategie", text: "Welche Immobilie passt?" },
  { titel: "Objekt", text: "Investmentcase zeigen" },
  { titel: "Finanzierung", text: "Machbarkeit sichern" },
  { titel: "Closing", text: "Entscheidung" },
  { titel: "Notar", text: "Kaufabschluss" },
  { titel: "Provision", text: "Vergütung" },
];


/**
 * Gegenseitige Erwartung statt Selbst-Check. Vorher hakte der Bewerber sechs
 * Charaktereigenschaften selbst ab ("Du bist ambitioniert."). Das ist im
 * Bewerbungsgespräch angreifbar, weil es sich wie eine Prüfung der Person
 * anfühlt. Jetzt stehen beide Seiten nebeneinander: was wir erwarten und was
 * wir dafür liefern, beides sachlich und nachprüfbar.
 */
const ERWARTEN_WIR = [
  "Du betreibst Vertrieb nebenberuflich, im besten Fall hauptberuflich.",
  "Du gewinnst aktiv Kunden und wartest nicht auf Zuteilung.",
  "Du arbeitest mit unseren Prozessen und im CRM.",
  "Du übernimmst Verantwortung für deine Ergebnisse.",
];

const BEKOMMST_DU = [
  "System, Produktzugang und Finanzierungspartner ab Tag eins.",
  "Backoffice und Support für Abwicklung und Papierkram.",
  "Trainings und Begleitung für deine Beratung.",
  "Klare Vergütungssätze, schriftlich im Vertrag.",
];

const PASST_NICHT_ZU_DIR = [
  "Du suchst ein passives Einkommen ohne Arbeit.",
  "Du erwartest, dass Leads automatisch zu Abschlüssen werden.",
  "Du möchtest keine Prozesse nutzen.",
  "Du willst nur kurzfristig etwas ausprobieren.",
];


/** Der Start-Zeitplan (Risikominderung vor dem Abschluss). */
const START_SCHRITTE = [
  { wann: "Heute", was: "Deine Entscheidung" },
  { wann: "Danach", was: "Vertrag kommt digital zur Unterschrift" },
  { wann: "Tag 1", was: "Onboarding" },
  { wann: "Woche 1", was: "Systemzugang, CRM und Investagon" },
  { wann: "Woche 1", was: "Deine eigene OS Immobilien E-Mail-Adresse" },
  { wann: "Woche 1", was: "Persönliche Erfolgsstrategie mit Zielplanung" },
  { wann: "Woche 1", was: "Produkt- und Beratungstraining" },
  { wann: "Woche 2", was: "Erste Kundenfälle" },
  { wann: "Danach", was: "Beratung, Objekt, Finanzierung, Notar" },
];

/* ══════════════════════════════════════════════════════════════
   Einzelne Folien
   ══════════════════════════════════════════════════════════════ */

/** Alles, was jede Folie über den Bewerber und die Reglerwerte wissen muss. */
export interface FolienKontext {
  vorname: string;
  leadSatz: number;
  eigenSatz: number;
  verhandelt: boolean;
  abschluesse: number;
  setAbschluesse: (v: number) => void;
  kaufpreis: number;
  setKaufpreis: (v: number) => void;
  /**
   * Umschalter Alleine/Mit OS Immobilien auf der Chaos-Folie. Lebt wie die
   * Reglerwerte im Deck, damit die Moderation ihn in der Vorschau spiegeln
   * kann (praesentationsKopplung.ts, Nachricht "umschalter").
   */
  chaosMitMore: boolean;
  setChaosMitMore: (v: boolean) => void;
  leadberaterPasst: boolean;
  /**
   * Gibt es im gewählten Paket überhaupt ein käufliches Leadpaket?
   * Beim Paket Lead-Berater werden Leads gestellt statt verkauft, dann
   * verschwindet die Leadkanal-Karte auf der Preisfolie. Nicht verwechseln
   * mit leadberaterPasst (ehrliche Unterzeile bei Partner-Honorar/Tippgeber).
   */
  leadpaketVerfuegbar: boolean;
  /** Der Bewerber, sofern der Cache ihn kennt. Ohne ihn kein Abschlussformular. */
  bewerber: Bewerber | null;
}

function FolieCover({ ctx }: { ctx: FolienKontext }) {
  return (
    <Folie>
      {/*
        Der Einstieg loest das Versprechen aus Punkt 10 des Erstgespraechs ein:
        "Da gehen wir alles nochmal in der Tiefe und im Detail durch, wir rechnen
        mit deinen Zahlen." Vorher stand hier "Bauen wir deinen Vertrieb". Das
        nahm die Entscheidung vorweg, die der Bewerber erst treffen soll, und
        versprach mit dem Wort "Vertrieb bauen" ein Strukturmodell, das es im
        heutigen Paket gar nicht mehr gibt. Folie 20 dementierte es spaeter
        ausdruecklich.

        Die Fusszeile ist bewusst eine Agenda. Wer weiss, dass die Konditionen
        kommen, muss nicht die ganze Stunde darauf warten.

        Die Folie ist Auftakt von Teil 2 direkt nach Folie 7 UND Deckblatt,
        wenn das Deck mit teil=2 startet (Teil 1 lief am Telefon). Der
        Untertitel "Wir haben uns kennengelernt" traegt beide Wege, deshalb
        steht hier nicht mehr "Beim ersten Gespraech".
      */}
      <Kicker>Persönliches Gespräch</Kicker>
      <Einblendung delay={150}>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.04]">
          {ctx.vorname ? (
            <>
              Heute wird es <Glanz>konkret</Glanz>, {ctx.vorname}.
            </>
          ) : (
            <>Heute wird es <Glanz>konkret</Glanz>.</>
          )}
        </h1>
      </Einblendung>
      <Einblendung delay={500}>
        <p className="mt-8 text-lg md:text-2xl" style={{ color: GEDIMMT }}>
          Wir haben uns kennengelernt. Jetzt siehst du im Detail,
          wie eine Zusammenarbeit mit OS Immobilien aussieht.
        </p>
      </Einblendung>
      <Einblendung delay={800}>
        <p className="mt-12 text-sm md:text-base tracking-wide" style={{ color: GEDIMMTER }}>
          Produkte. System. Ein echter Deal. Deine Zahlen. Konditionen. Dein Start.
        </p>
      </Einblendung>
      {ctx.verhandelt && (
        <Einblendung delay={1100}>
          <p
            className="mt-8 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs md:text-sm font-semibold tabular-nums"
            style={{ border: RAND, backgroundColor: "rgba(255,255,255,0.04)", color: AKZENT }}
          >
            Vorbereitet mit deinen Sätzen: {ctx.leadSatz.toLocaleString("de-DE")} % Leads
            · {ctx.eigenSatz.toLocaleString("de-DE")} % eigene Kunden
          </p>
        </Einblendung>
      )}
    </Folie>
  );
}

/**
 * Chaos gegen System. Der Umschalter macht den Kontrast selbst erlebbar:
 * links das dichte, schiefe Feld aus elf Zetteln, rechts drei ruhige Worte.
 * Laut Drehbuch muss das fast wehtun. Beim Umschalten fallen die Zettel
 * gestaffelt nach unten weg, bevor die Ruhe erscheint; bei reduzierter
 * Bewegung wechselt die Ansicht sofort.
 */
function FolieChaos({ ctx }: { ctx: FolienKontext }) {
  const reduziert = nutztReduzierteBewegung();
  // Der Umschalter lebt im Folienkontext, damit die Moderation ihn spiegelt.
  const mitMore = ctx.chaosMitMore;
  const setMitMore = ctx.setChaosMitMore;
  const [zettelFallen, setZettelFallen] = useState(false);
  // Kommt der Stand von außen zurück auf Alleine (Vorschau in der
  // Moderation), stehen die Zettel wieder.
  useEffect(() => {
    if (!mitMore) setZettelFallen(false);
  }, [mitMore]);
  // Feste, leicht schiefe Winkel je Zettel. Deterministisch statt zufällig,
  // damit die Folie bei jedem Termin gleich aussieht.
  const winkel = [-5, 3, -2, 6, -7, 2, -3, 5, -4, 7, -6];

  const wechsle = (ziel: boolean) => {
    if (ziel === mitMore) return;
    if (!ziel) {
      setMitMore(false);
      setZettelFallen(false);
      return;
    }
    if (reduziert) {
      setMitMore(true);
      return;
    }
    setZettelFallen(true);
    window.setTimeout(() => setMitMore(true), 500);
  };

  return (
    <Folie breit>
      <Kicker>Warum Immobilienvertrieb oft unnötig schwer ist</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.12]">
          Gute Vertriebler sollten <Glanz>verkaufen</Glanz>, nicht
          Probleme verwalten.
        </h2>
      </Einblendung>
      <Einblendung delay={300}>
        <p className="mt-4 text-base md:text-lg max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
          Kaltakquise ohne System. Kein Backoffice im Rücken. Jeder Deal ein Einzelkampf.
        </p>
      </Einblendung>

      <Einblendung delay={450}>
        <div
          className="mt-8 inline-flex rounded-full p-1"
          style={{ border: RAND, backgroundColor: "rgba(255,255,255,0.04)" }}
        >
          {([
            [false, "Alleine"],
            [true, "Mit OS Immobilien"],
          ] as const).map(([wertMitMore, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => wechsle(wertMitMore)}
              className="rounded-full px-6 h-11 text-sm font-semibold transition-all"
              style={
                mitMore === wertMitMore
                  ? { background: VERLAUF, color: "#fff" }
                  : { color: GEDIMMT }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </Einblendung>

      <div className="mt-8 min-h-[300px] flex items-center justify-center">
        {mitMore ? (
          <div key="ruhe">
            <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-2">
              {["Kunden.", "Beratung.", "Closing."].map((wort, i) => (
                <span
                  key={wort}
                  className="animate-in fade-in zoom-in-95 duration-700 motion-reduce:animate-none text-4xl md:text-6xl font-semibold tracking-tight"
                  style={{ color: AKZENT, animationDelay: `${i * 250}ms`, animationFillMode: "both" }}
                >
                  {wort}
                </span>
              ))}
            </div>
            <p
              className="animate-in fade-in duration-700 motion-reduce:animate-none mt-6 text-base"
              style={{ color: GEDIMMT, animationDelay: "850ms", animationFillMode: "both" }}
            >
              Fokus auf Kunden und Closing. Alles andere trägt das System.
            </p>
          </div>
        ) : (
          <div key="chaos" className="flex flex-wrap justify-center gap-3 max-w-4xl">
            {AUFGABEN_ALLEIN.map((aufgabe, i) => (
              <span
                key={aufgabe}
                className="animate-in fade-in zoom-in-90 duration-500 motion-reduce:animate-none rounded-xl px-4 py-2.5 text-sm md:text-base font-medium"
                style={{
                  animationDelay: `${i * 70}ms`,
                  animationFillMode: "both",
                  border: "1px solid rgba(255,120,120,0.35)",
                  backgroundColor: "rgba(255,90,90,0.08)",
                  color: "rgba(255,190,190,0.9)",
                  transition: "transform 0.45s ease-in, opacity 0.45s ease-in",
                  transitionDelay: `${i * 30}ms`,
                  transform: zettelFallen
                    ? `rotate(${winkel[i] * 3}deg) translateY(70px)`
                    : `rotate(${winkel[i]}deg)`,
                  opacity: zettelFallen ? 0 : undefined,
                }}
              >
                {aufgabe}
              </span>
            ))}
          </div>
        )}
      </div>

      <Einblendung delay={900}>
        <p className="text-lg md:text-xl font-medium leading-relaxed max-w-3xl mx-auto">
          {/*
            Vorher stand hier "Kommt dir das bekannt vor?". Das Skript kennt
            ausdruecklich den Pfad Quereinsteiger, und der antwortet auf Folie
            zwei mit Nein. Als Beschreibung funktioniert der Satz fuer beide:
            Erfahrene erkennen sich wieder, Quereinsteiger lesen eine Warnung.
          */}
          {ctx.vorname ? `So sieht der Alltag der meisten Einzelkämpfer aus, ${ctx.vorname}. ` : "So sieht der Alltag der meisten Einzelkämpfer aus. "}
          <span style={{ color: AKZENT }}>
            Der Engpass ist selten der Vertrieb. Der Engpass ist die Infrastruktur dahinter.
          </span>
        </p>
      </Einblendung>
    </Folie>
  );
}

/** Die Vision: drei Sätze nacheinander, dann die Auflösung und die Kette. */
/**
 * Vision und Betriebssystem zusammengefasst.
 *
 * Beide Folien sagten dasselbe: Du machst Kunden, Beratung und Abschluss, wir
 * machen den Rest. Die eine als Dreiklang mit Prozesskette, die andere als
 * Bausteinwolke mit dem Wort Betriebssystem. Geblieben ist der Dreiklang, weil
 * er konkreter ist, dazu die sechs Bausteine und der staerkste Satz der
 * Betriebssystem-Folie. Die Prozesskette Kunde bis Provision entfaellt hier,
 * sie kommt auf der Deal-Folie ohnehin ausfuehrlich.
 */
function FolieVision({ ctx }: { ctx: FolienKontext }) {
  const bausteine = ["Produkte", "Finanzierung", "Technologie", "Marketing", "Backoffice", "Vertriebs-Know-how"];
  return (
    <Folie breit>
      <Kicker>
        Was wäre, wenn du dich auf das konzentrierst, worin du wirklich gut bist
        {ctx.vorname ? `, ${ctx.vorname}` : ""}?
      </Kicker>
      <div className="space-y-3 md:space-y-6 mt-6">
        {["Du gewinnst Kunden.", "Du berätst.", "Du schließt ab."].map((satz, i) => (
          <Einblendung key={satz} delay={300 + i * 600}>
            <p className="text-4xl md:text-7xl font-semibold tracking-tight">{satz}</p>
          </Einblendung>
        ))}
      </div>
      <Einblendung delay={2300}>
        <p className="mt-10 text-2xl md:text-4xl font-semibold">
          <Glanz>OS Immobilien baut alles drumherum.</Glanz>
        </p>
      </Einblendung>
      <Einblendung delay={2700}>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {bausteine.map((b, i) => (
            <span
              key={b}
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none rounded-2xl px-5 py-3 text-sm md:text-base font-medium"
              style={{
                animationDelay: `${2800 + i * 110}ms`,
                animationFillMode: "both",
                background: FLAECHE,
              }}
            >
              {b}
            </span>
          ))}
        </div>
      </Einblendung>
      <Einblendung delay={3600}>
        <p className="mt-10 text-base md:text-lg italic max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
          Das heißt für dich: keine eigene Firma mit 15 verschiedenen Dienstleistern aufbauen.
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Mission und Werte zusammengefasst.
 *
 * Die Mission war ein Satz auf einer eigenen Folie, die Werte fuenf Karten mit
 * Alltagsbeweis. Jetzt traegt die Mission die Ueberschrift und die Karten
 * belegen sie. Der Dreiklang "Bessere Investments, bessere Beratung, bessere
 * Partnerschaften" entfaellt, er wiederholte nur die Ueberschrift.
 */
function FolieWerte() {
  return (
    <Folie breit>
      <Kicker>Wofür wir stehen</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.15]">
          Immobilieninvestment <Glanz>einfacher, transparenter und
          erfolgreicher</Glanz> machen.
        </h2>
        <p className="mt-5 text-base md:text-lg leading-relaxed max-w-3xl mx-auto" style={{ color: GEDIMMT }}>
          Gute Immobilienberatung ist mehr als der Verkauf einer Wohnung: Kunden bekommen
          Investments, die zu ihrer Situation passen. Partner bekommen die Infrastruktur für ein
          langfristig erfolgreiches Geschäft. Werte sind dabei nur etwas wert, wenn man sie lebt.
        </p>
      </Einblendung>
      {/* Auf grossen Schirmen ein 6er-Raster: oben drei Karten je zwei Spalten,
          unten zwei Karten je zwei Spalten ab Spalte 2, dadurch sitzen die
          beiden unteren mittig unter den dreien darueber. */}
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-6 text-left">
        {WERTE.map((w, i) => (
          <Einblendung
            key={w.titel}
            delay={400 + i * 150}
            className={`lg:col-span-2 ${i === 3 ? "lg:col-start-2" : ""} ${i === 4 ? "md:col-span-2 lg:col-span-2" : ""}`}
          >
            <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
              <div className="flex items-center gap-3">
                <span
                  className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: FLAECHE_AKTIV }}
                >
                  <w.icon className="h-5 w-5" style={{ color: AKZENT }} />
                </span>
                <p className="text-[11px] uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
                  {w.titel}
                </p>
              </div>
              <p className="mt-4 text-base md:text-lg font-semibold leading-snug">{w.claim}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: GEDIMMT }}>
                Im Alltag: {w.alltag}
              </p>
            </div>
          </Einblendung>
        ))}
      </div>
    </Folie>
  );
}

/** Der Value Stack als aufklappbare Karten. */
function FolieSystem() {
  const [offen, setOffen] = useState<string | null>(null);
  return (
    <Folie breit>
      <Kicker>Das OS Immobilien System</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Alles, was du für deinen Vertrieb brauchst.
        </h2>
      </Einblendung>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-left">
        {VALUE_STACK.map((v, i) => {
          const istOffen = offen === v.titel;
          return (
            <Einblendung key={v.titel} delay={350 + i * 90}>
              <button
                type="button"
                onClick={() => setOffen(istOffen ? null : v.titel)}
                className="w-full h-full rounded-3xl p-5 text-left transition-all"
                style={{ background: istOffen ? FLAECHE_AKTIV : FLAECHE }}
              >
                <div className="flex items-center justify-between gap-2">
                  <v.icon className="h-5 w-5" style={{ color: AKZENT }} />
                  <ChevronDown
                    className="h-4 w-4 transition-transform"
                    style={{ color: GEDIMMTER, transform: istOffen ? "rotate(180deg)" : "none" }}
                  />
                </div>
                <p className="mt-3 text-sm md:text-base font-semibold">{v.titel}</p>
                {istOffen && (
                  <p className="mt-2 text-xs md:text-sm leading-relaxed animate-in fade-in duration-300 motion-reduce:animate-none" style={{ color: GEDIMMT }}>
                    {v.text}
                  </p>
                )}
                {/* Die Ersparnis steht immer da, auch bei zugeklappter Karte. */}
                <p className="mt-2 text-xs leading-snug" style={{ color: AKZENT }}>
                  Spart dir: {v.spart}.
                </p>
              </button>
            </Einblendung>
          );
        })}
      </div>
      <Einblendung delay={1200}>
        <p className="mt-8 text-xl md:text-2xl font-semibold">
          Wir kennen den <Glanz>Verkaufsprozess</Glanz>, nicht nur das Objekt.
        </p>
        <p className="mt-4 text-sm" style={{ color: GEDIMMTER }}>
          Klick an, was dich interessiert.
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Die Karten der Objekte-und-Standorte-Folie: zuerst die Zielgruppe (aus
 * der früheren Station "Wer wir sind" des Erstgesprächs, denn im Deck wird
 * die Firma erst in Teil 2 vorgestellt), dann die drei Objekttypen.
 */
const OBJEKTTYPEN = [
  {
    titel: "Für wen wir arbeiten",
    text: "Unternehmer, Ärzte und High Experts mit typischerweise 80.000 bis 100.000 Euro Einkommen und mehr, sehr gute Bonität. Ziel: Steuern optimieren, Vermögen aufbauen.",
  },
  {
    titel: "Sanierter Bestand",
    text: "Meist mit erhöhtem Restnutzungsdauer-Gutachten und Erhaltungsaufwand, also echter steuerlicher Substanz.",
  },
  {
    titel: "Neubau KfW 40 QNG",
    text: "Energieeffizienter Neubau, finanziert mit KfW-Kredit.",
  },
  {
    titel: "WG/Co-Living-Konzept",
    text: "Mietkonzept für Kunden mit stärkerem Renditefokus.",
  },
];

/**
 * Unsere Objekte und Standorte: links die drei Objekttypen, rechts eine
 * bewusst eigene, schlanke Deutschland-Silhouette in der Präsentations-Optik.
 * Die CRM-Komponente DeutschlandKarte wird absichtlich nicht verwendet, die
 * Folie braucht nur einen erkennbaren Umriss mit leuchtendem Bayern und drei
 * beschrifteten Standortpunkten, die gestaffelt einblenden. Bei reduzierter
 * Bewegung steht alles sofort da (Klassen cp-karte-umriss, cp-karte-element).
 */
function FolieObjekteStandorte() {
  // Stark vereinfachter, aber erkennbarer Deutschland-Umriss. Die Punkte sind
  // aus groben Längen- und Breitengraden der Grenzmarken abgeleitet
  // (x = (Länge - 5,5) * 17 + 10, y = (55,2 - Breite) * 27 + 8): Flensburg,
  // Ostseeküste mit Rügen, Oder, Görlitz, Erzgebirge, Bayerischer Wald,
  // Alpenrand, Bodensee, Rhein, Saarland, Aachen, Emsland, Nordseeküste.
  const deutschland =
    "M76 16 L88 30 L107 27 L122 35 L144 22 L158 43 L165 86 L172 119 L168 124 " +
    "L155 130 L138 138 L126 140 L131 157 L136 167 L151 181 L144 186 L136 208 " +
    "L138 213 L124 213 L105 219 L98 216 L81 216 L73 211 L46 213 L46 189 " +
    "L56 175 L36 170 L25 162 L27 154 L19 127 L22 111 L19 100 L36 86 L36 81 " +
    "L39 59 L53 49 L56 54 L61 43 L64 43 L70 49 L68 35 L63 16 Z";
  // Bayern teilt sich Ost- und Südkante mit dem Umriss und leuchtet darüber.
  const bayern =
    "M70 147 L87 135 L104 138 L119 140 L126 140 L131 157 L136 167 L151 181 " +
    "L144 186 L136 208 L138 213 L124 213 L105 219 L98 216 L81 216 L81 213 " +
    "L87 192 L92 173 L78 154 Z";
  const standorte = [
    { name: "München und Umland", x: 114, y: 199, labelX: 114, labelY: 231, anchor: "middle" as const, gross: true },
    { name: "Augsburg", x: 102, y: 192, labelX: 96, labelY: 190, anchor: "end" as const, gross: false },
    { name: "Nürnberg", x: 105, y: 163, labelX: 99, labelY: 160, anchor: "end" as const, gross: false },
  ];
  // Dezente, unbeschriftete Punkte für die ausgewählten Objekte im Rest des
  // Landes (Richtung Hamburg, Leipzig, Köln); der Satz darunter ordnet sie ein.
  const weitere = [
    { x: 87, y: 53 },
    { x: 127, y: 112 },
    { x: 35, y: 123 },
  ];

  return (
    <Folie breit>
      <Kicker>Produkte und Standorte</Kicker>
      <style>{`
        @keyframes cpKarteZeichnen { to { stroke-dashoffset: 0; } }
        @keyframes cpKarteElement { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .cp-karte-umriss { animation: none !important; stroke-dashoffset: 0 !important; }
          .cp-karte-element { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Echte Objekte an <Glanz>starken Standorten</Glanz>.
        </h2>
      </Einblendung>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr] items-center text-left">
        {/* Vier Karten statt drei, deshalb etwas kompakter, damit die Folie
            neben der Karte nicht scrollen muss. */}
        <div className="space-y-3">
          {OBJEKTTYPEN.map((o, i) => (
            <Einblendung key={o.titel} delay={350 + i * 200}>
              <div className="rounded-3xl px-6 py-4" style={{ background: FLAECHE }}>
                <p className="text-sm uppercase tracking-[0.2em] font-semibold" style={{ color: AKZENT }}>
                  {o.titel}
                </p>
                <p className="mt-2 text-sm md:text-base leading-relaxed" style={{ color: GEDIMMT }}>
                  {o.text}
                </p>
              </div>
            </Einblendung>
          ))}
        </div>
        <Einblendung delay={500}>
          <div className="text-center">
            <svg
              viewBox="0 0 200 250"
              className="w-full max-w-[300px] mx-auto"
              role="img"
              aria-label="Stilisierte Deutschlandkarte mit hervorgehobenem Bayern und den Standorten München und Umland, Augsburg und Nürnberg"
            >
              {/* Der Umriss zeichnet sich einmal, dezent und ohne Kartendetails. */}
              <path
                d={deutschland}
                className="cp-karte-umriss"
                fill="rgba(255,255,255,0.03)"
                stroke="rgba(246,248,252,0.28)"
                strokeWidth={1.2}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                style={{ animation: "cpKarteZeichnen 2.2s ease-out forwards" }}
              />
              {/* Bayern leuchtet auf, sobald der Umriss steht. */}
              <path
                d={bayern}
                className="cp-karte-element"
                fill="rgba(28,194,131,0.16)"
                stroke={AKZENT}
                strokeWidth={1.4}
                strokeLinejoin="round"
                style={{ animation: "cpKarteElement 0.8s ease-out 1.2s both" }}
              />
              {standorte.map((s, i) => (
                <g
                  key={s.name}
                  className="cp-karte-element"
                  style={{ animation: `cpKarteElement 0.6s ease-out ${1.7 + i * 0.3}s both` }}
                >
                  {s.gross && <circle cx={s.x} cy={s.y} r={9} fill="rgba(26,181,122,0.25)" />}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={s.gross ? 4.5 : 3.5}
                    fill={AKZENT_STARK}
                    stroke={AKZENT}
                    strokeWidth={1}
                  />
                  <text
                    x={s.labelX}
                    y={s.labelY}
                    textAnchor={s.anchor}
                    fontSize={9}
                    fontWeight={600}
                    fill="#F6F8FC"
                  >
                    {s.name}
                  </text>
                </g>
              ))}
              <g
                className="cp-karte-element"
                style={{ animation: "cpKarteElement 0.8s ease-out 2.8s both" }}
              >
                {weitere.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgba(30,210,141,0.4)" />
                ))}
              </g>
            </svg>
            <p className="mt-4 text-sm" style={{ color: GEDIMMT }}>
              und ausgewählte Objekte deutschlandweit
            </p>
          </div>
        </Einblendung>
      </div>
      <Einblendung delay={1200}>
        <p className="mt-6 text-sm" style={{ color: GEDIMMT }}>
          {OFFMARKET_ZUSATZ} In naher Zukunft nehmen wir ein weiteres Produkt ergänzend dazu.
        </p>
      </Einblendung>
      <Einblendung delay={1500}>
        <p className="mt-4 text-xl md:text-2xl font-semibold">
          Nicht das Produkt steht zuerst. <Glanz>Der Kunde steht zuerst.</Glanz>
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Der Deal-Prozess als fließende Linie: eine geschwungene SVG-Welle, auf der
 * die acht Stationen nacheinander aufleuchten, statt acht Kästchen. Die
 * Pfad-Zeichnung und das Aufleuchten stoppen bei reduzierter Bewegung.
 */
function FolieDealProzess() {
  // Stationen entlang einer sanften Welle: gerader Lauf von links nach
  // rechts, die Höhe wechselt, dadurch entsteht die geschwungene Linie.
  const punkte = DEAL_SCHRITTE.map((_, i) => ({
    x: 60 + (i * 880) / (DEAL_SCHRITTE.length - 1),
    y: i % 2 === 0 ? 95 : 175,
  }));
  let pfad = `M ${punkte[0].x} ${punkte[0].y}`;
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1];
    const b = punkte[i];
    const mx = (a.x + b.x) / 2;
    pfad += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }

  return (
    <Folie breit>
      <Kicker>Der Deal-Prozess</Kicker>
      <style>{`
        @keyframes cpPfadZeichnen { to { stroke-dashoffset: 0; } }
        @keyframes cpStationAuftauchen { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .cp-pfad { animation: none !important; stroke-dashoffset: 0 !important; }
          .cp-station { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      <Einblendung delay={200}>
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox="0 0 1000 260"
            className="w-full min-w-[720px]"
            role="img"
            aria-label="Die acht Stationen des Deal-Prozesses von Lead bis Provision"
          >
            <path
              d={pfad}
              className="cp-pfad"
              fill="none"
              stroke="rgba(30,210,141,0.4)"
              strokeWidth={2.5}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1}
              style={{ animation: "cpPfadZeichnen 2.6s ease-out forwards" }}
            />
            {DEAL_SCHRITTE.map((s, i) => {
              const p = punkte[i];
              const letzte = i === DEAL_SCHRITTE.length - 1;
              const oben = i % 2 === 0;
              return (
                <g
                  key={s.titel}
                  className="cp-station"
                  style={{ animation: `cpStationAuftauchen 0.6s ease-out ${350 + i * 260}ms both` }}
                >
                  {letzte && (
                    <circle cx={p.x} cy={p.y} r={22} fill="rgba(26,181,122,0.25)" />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={13}
                    fill={letzte ? AKZENT_STARK : "#0E1C33"}
                    stroke={letzte ? AKZENT : "rgba(30,210,141,0.7)"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={letzte ? "#fff" : AKZENT}
                  >
                    {i + 1}
                  </text>
                  <text
                    x={p.x}
                    y={oben ? p.y - 44 : p.y + 38}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    fill={letzte ? AKZENT : "#F6F8FC"}
                    style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    {s.titel}
                  </text>
                  <text
                    x={p.x}
                    y={oben ? p.y - 27 : p.y + 55}
                    textAnchor="middle"
                    fontSize={11}
                    fill={GEDIMMT}
                  >
                    {s.text}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Einblendung>
      {/* Was frueher eine eigene Folie war: woraus die Qualifizierung und die
          Strategie bestehen. Hier steht es an der Station, zu der es gehoert. */}
      <Einblendung delay={2100}>
        <div className="mt-8 space-y-2 text-sm md:text-base leading-relaxed max-w-3xl mx-auto" style={{ color: GEDIMMT }}>
          <p>
            <span style={{ color: AKZENT }}>Qualifizierung:</span> Einkommen, Steuerklasse,
            Eigenkapital, Bonität, Ziel.
          </p>
          <p>
            <span style={{ color: AKZENT }}>Strategie:</span> Finanzierung, Cashflow,
            Steuerwirkung, Rendite. Daraus ergibt sich das passende Objekt.
          </p>
        </div>
      </Einblendung>
      <Einblendung delay={2500}>
        <p className="mt-6 text-2xl md:text-3xl font-semibold tracking-tight">
          Wir verkaufen nicht einfach Immobilien.{" "}
          <Glanz>Wir suchen die Strategie, die zum Kunden passt.</Glanz>
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Was unsere Partner sagen: sozialer Beweis mit echten Stimmen aus der
 * gemeinsamen Quelle src/lib/partnerstimmen.ts. Bei leerer Liste wird die
 * Folie im Deck komplett
 * übersprungen, auch in der Punkte-Navigation, denn erfundener sozialer
 * Beweis wäre Gift.
 */
function FoliePartnerstimmen() {
  return (
    <Folie breit>
      <Kicker>Was unsere Partner sagen</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Die, die schon <Glanz>losgelegt</Glanz> haben.
        </h2>
      </Einblendung>
      <div className="mt-10 grid gap-4 md:grid-cols-2 text-left">
        {PARTNERSTIMMEN.map((stimme, i) => (
          <Einblendung key={stimme.name} delay={350 + i * 180}>
            <div className="h-full rounded-3xl p-6 flex flex-col" style={{ background: FLAECHE }}>
              <Quote className="h-6 w-6 mb-4" style={{ color: AKZENT }} />
              <div className="space-y-3 flex-1">
                <p className="text-sm leading-relaxed" style={{ color: GEDIMMTER }}>
                  {stimme.vorher}
                </p>
                <p className="text-sm md:text-base leading-relaxed font-medium">
                  {stimme.jetzt}
                </p>
              </div>
              <div className="mt-5 pt-4 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <img
                  src={stimme.bild}
                  alt={stimme.name}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold">{stimme.name}</p>
                  <p className="text-xs" style={{ color: GEDIMMTER }}>
                    {stimme.rolle}
                  </p>
                </div>
              </div>
            </div>
          </Einblendung>
        ))}
      </div>
    </Folie>
  );
}

/**
 * OS Immobilien in Zahlen. Die Folie erscheint NUR, wenn in
 * closingPraesentationZahlen.ts mindestens ein echter Wert gepflegt ist, und
 * zeigt dann ausschließlich die gepflegten.
 *
 * Vorher standen dort Platzhalter wie "X Mio. €" direkt über dem Satz "Wir
 * zeigen nur Zahlen, die wir belegen können". Eine leere Zahlenfolie ist
 * schlimmer als gar keine: Sie widerlegt im selben Bild die Ehrlichkeit, die
 * sie behauptet. Dasselbe Muster nutzt bereits die Partnerstimmen-Folie.
 */
function FolieZahlen() {
  return (
    <Folie breit>
      <Kicker>OS Immobilien in Zahlen</Kicker>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CLOSING_KENNZAHLEN_GEPFLEGT.map((k, i) => (
          <Einblendung key={k.label} delay={250 + i * 150}>
            <div
              className="h-full rounded-3xl p-6 flex flex-col items-center justify-center min-h-[130px]"
              style={{ background: FLAECHE }}
            >
              <p
                className="text-3xl md:text-4xl font-semibold tracking-tight tabular-nums"
                style={{ color: AKZENT }}
              >
                <HochlaufText text={k.wert} />
              </p>
              <p className="mt-2 text-sm text-center" style={{ color: GEDIMMT }}>
                {k.label}
              </p>
            </div>
          </Einblendung>
        ))}
      </div>
      <Einblendung delay={1100}>
        <p className="mt-8 text-sm" style={{ color: GEDIMMTER }}>
          Wir zeigen nur Zahlen, die wir belegen können. Keine aufgeblasenen Marketingmetriken.
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Echter Fall: die Case Study aus dem Drehbuch, gerechnet mit den Sätzen des
 * Bewerbers. Bei einheitlichem Satz (Standardfall des neuen Modells) steht
 * eine einzige Vergütung da; nur wenn individuell verhandelte Sätze
 * auseinanderlaufen, erscheinen beide Wege getrennt.
 */
function FolieEchterFall({ ctx }: { ctx: FolienKontext }) {
  const beispielKaufpreis = 350000;
  const lead = verguetungProDeal(beispielKaufpreis, ctx.leadSatz);
  const eigen = verguetungProDeal(beispielKaufpreis, ctx.eigenSatz);
  const gleich = ctx.leadSatz === ctx.eigenSatz;
  const weg = ["Kunde", "Analyse", "Passendes Objekt", "Finanzierung", "Notar"];

  return (
    <Folie breit>
      <Kicker>Echter Deal statt Theorie</Kicker>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr] items-center text-left">
        <div className="space-y-4">
          <Einblendung delay={200}>
            <div className="rounded-3xl p-5" style={{ background: FLAECHE }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <span style={{ color: GEDIMMTER }}>Kunde</span>
                <span className="font-semibold text-right tabular-nums">4.500 € netto / Monat</span>
                <span style={{ color: GEDIMMTER }}>Ziel</span>
                <span className="font-semibold text-right">Vermögensaufbau + Steueroptimierung</span>
                <span style={{ color: GEDIMMTER }}>Immobilie</span>
                <span className="font-semibold text-right tabular-nums">350.000 €</span>
                <span style={{ color: GEDIMMTER }}>Finanzierung</span>
                <span className="font-semibold text-right tabular-nums">100 %</span>
              </div>
            </div>
          </Einblendung>
          <Einblendung delay={500}>
            <div className="flex flex-wrap items-center gap-1.5">
              {weg.map((schritt, i) => (
                <span key={schritt} className="inline-flex items-center gap-1.5">
                  <span className="text-xs font-medium rounded-full px-3 py-1.5" style={{ border: RAND, color: GEDIMMT }}>
                    {schritt}
                  </span>
                  {i < weg.length - 1 && <ArrowRight className="h-3.5 w-3.5" style={{ color: GEDIMMTER }} />}
                </span>
              ))}
            </div>
          </Einblendung>
        </div>

        <div className="space-y-4">
          <Einblendung delay={800}>
            <div className="rounded-3xl p-6 text-center" style={{ background: FLAECHE_AKTIV }}>
              <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
                Deine Partnervergütung{ctx.vorname ? `, ${ctx.vorname}` : ""}
              </p>
              <p className="mt-3 text-5xl md:text-6xl font-semibold tabular-nums">
                <Glanz><HochlaufZahl wert={lead} suffix=" €" /></Glanz>
              </p>
              <p className="mt-2 text-sm" style={{ color: GEDIMMT }}>
                {gleich
                  ? `mit ${ctx.leadSatz.toLocaleString("de-DE")} %, egal ob OS Immobilien Lead oder eigener Kunde`
                  : `bei ${ctx.leadSatz.toLocaleString("de-DE")} % über OS Immobilien Leads`}
                {gleich && ctx.verhandelt ? ", mit deinem vereinbarten Satz gerechnet" : ""}
              </p>
            </div>
          </Einblendung>
          {!gleich && (
            <Einblendung delay={1200}>
              <div className="rounded-3xl p-6 text-center" style={{ background: FLAECHE }}>
                <p className="mt-1 text-3xl md:text-4xl font-semibold tabular-nums">
                  <HochlaufZahl wert={eigen} suffix=" €" />
                </p>
                <p className="mt-2 text-sm" style={{ color: GEDIMMT }}>
                  bei {ctx.eigenSatz.toLocaleString("de-DE")} % als eigener Kunde
                  {ctx.verhandelt ? ", mit deinen vereinbarten Sätzen gerechnet" : ""}
                </p>
              </div>
            </Einblendung>
          )}
        </div>
      </div>
      <Einblendung delay={1600}>
        <p className="mt-8 text-lg font-medium">Ein Kunde. Ein Objekt. Ein Abschluss. So läuft ein Deal bei uns.</p>
      </Einblendung>
      <RechenFussnote delay={1800} />
    </Folie>
  );
}

/**
 * Dein Rechner, das interaktive Kernstück der Präsentation. Zwei Regler
 * (Abschlusstempo und durchschnittlicher Kaufpreis), dazu ein Diagramm über
 * das Abschlusstempo: Die senkrechte Linie ist der Tempo-Regler, die
 * Kurvenhöhe folgt dem Kaufpreis-Regler. Im Standardfall des neuen Modells
 * (einheitlich 4 Prozent für Leads und eigene Kunden) gibt es genau eine
 * Kurve und zwei Kennzahlen: pro Abschluss und pro Jahr, mit dem Monatswert
 * als Unterzeile. Nur wenn individuell verhandelte Sätze auseinanderlaufen,
 * erscheinen zwei Kurven und vier Kennzahlen wie früher. Alle Zahlen laufen
 * beim Reglerziehen weich nach (useHochlauf).
 */
export function FolieRechner({ ctx }: { ctx: FolienKontext }) {
  const reduziert = nutztReduzierteBewegung();
  const gleich = ctx.leadSatz === ctx.eigenSatz;
  const leadDeal = verguetungProDeal(ctx.kaufpreis, ctx.leadSatz);
  const eigenDeal = verguetungProDeal(ctx.kaufpreis, ctx.eigenSatz);
  const leadJahr = verguetungProJahr(ctx.abschluesse, ctx.kaufpreis, ctx.leadSatz);
  const eigenJahr = verguetungProJahr(ctx.abschluesse, ctx.kaufpreis, ctx.eigenSatz);
  const leadMonat = Math.round(leadJahr / 12);
  const eigenMonat = Math.round(eigenJahr / 12);

  // Beide Kurven über die ganze Regler-Spanne, damit die markierten Punkte
  // sichtbar auf den Linien wandern, wenn der Bewerber am Tempo dreht.
  const kurve = useMemo(() => {
    const daten: Array<{ tempo: number; lead: number; eigen: number }> = [];
    for (let tempo = 1; tempo <= 20; tempo += 1) {
      daten.push({
        tempo,
        lead: verguetungProJahr(tempo, ctx.kaufpreis, ctx.leadSatz),
        eigen: verguetungProJahr(tempo, ctx.kaufpreis, ctx.eigenSatz),
      });
    }
    return daten;
  }, [ctx.kaufpreis, ctx.leadSatz, ctx.eigenSatz]);

  return (
    <Folie breit>
      <Kicker>Dein Rechner</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          {ctx.vorname ? <>Deine Zahlen, <Glanz>{ctx.vorname}</Glanz>.</> : <>Deine <Glanz>Zahlen</Glanz>.</>}
        </h2>
        <p className="mt-3 text-sm md:text-base" style={{ color: GEDIMMT }}>
          Zieh an den Reglern. Alles andere rechnet live mit.
        </p>
      </Einblendung>

      <Einblendung delay={400}>
        <div className="mt-8 grid gap-4 md:grid-cols-2 text-left max-w-4xl mx-auto">
          <div className="rounded-3xl px-6 py-5" style={{ background: FLAECHE }}>
            <label htmlFor="closing-abschluesse" className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: GEDIMMT }}>
              Abschlüsse pro Monat
            </label>
            <p className="mt-1 text-3xl md:text-4xl font-semibold tabular-nums" style={{ color: AKZENT }}>
              {ctx.abschluesse.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
            </p>
            <input
              id="closing-abschluesse"
              type="range"
              min={1}
              max={8}
              step={1}
              value={ctx.abschluesse}
              onChange={(e) => ctx.setAbschluesse(parseFloat(e.target.value))}
              className="w-full mt-3 accent-[#1AB57A] cursor-pointer"
            />
            <div className="flex justify-between text-[11px] mt-2" style={{ color: GEDIMMTER }}>
              <span>1</span>
              <span>4</span>
              <span>8</span>
            </div>
            <p className="text-[11px] mt-2 leading-snug" style={{ color: GEDIMMTER }}>
              Im ersten Jahr sind ein bis zwei Abschlüsse im Monat ein realistisches Ziel.
            </p>
          </div>
          <div className="rounded-3xl px-6 py-5" style={{ background: FLAECHE }}>
            <label htmlFor="closing-kaufpreis" className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: GEDIMMT }}>
              Durchschnittlicher Kaufpreis
            </label>
            <p className="mt-1 text-3xl md:text-4xl font-semibold tabular-nums" style={{ color: AKZENT }}>
              {formatPreis(ctx.kaufpreis)}
            </p>
            <input
              id="closing-kaufpreis"
              type="range"
              min={200000}
              max={500000}
              step={10000}
              value={ctx.kaufpreis}
              onChange={(e) => ctx.setKaufpreis(parseInt(e.target.value, 10))}
              className="w-full mt-3 accent-[#1AB57A] cursor-pointer"
            />
            <div className="flex justify-between text-[11px] mt-2" style={{ color: GEDIMMTER }}>
              <span>200.000 €</span>
              <span>350.000 €</span>
              <span>500.000 €</span>
            </div>
          </div>
        </div>
      </Einblendung>

      <Einblendung delay={700}>
        <div className="mt-6 max-w-4xl mx-auto rounded-3xl px-4 pt-5 pb-3" style={{ background: FLAECHE }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: GEDIMMT }}>
              Vergütung pro Jahr je Abschlusstempo
            </p>
            <div className="flex items-center gap-4 text-xs" style={{ color: GEDIMMT }}>
              {gleich ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-[3px] w-5 rounded-full" style={{ background: AKZENT_STARK }} />
                  Einheitlich {ctx.eigenSatz.toLocaleString("de-DE")} % · Leads und eigene Kunden
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-[3px] w-5 rounded-full" style={{ background: AKZENT_STARK }} />
                    Eigene Kunden · {ctx.eigenSatz.toLocaleString("de-DE")} %
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-[3px] w-5 rounded-full" style={{ background: "rgba(246,248,252,0.45)" }} />
                    OS Immobilien Leads · {ctx.leadSatz.toLocaleString("de-DE")} %
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={kurve} margin={{ top: 18, right: 16, bottom: 0, left: 16 }}>
                <defs>
                  <linearGradient id="cpVerlaufEigen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AKZENT_STARK} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={AKZENT_STARK} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="cpVerlaufLead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F6F8FC" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#F6F8FC" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="tempo"
                  type="number"
                  domain={[1, 20]}
                  ticks={[1, 5, 10, 15, 20]}
                  tickFormatter={(v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                  tick={{ fill: GEDIMMTER, fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  tickLine={false}
                />
                <YAxis hide domain={[0, "dataMax"]} />
                {/* Die senkrechte Linie ist der Tempo-Regler im Diagramm. */}
                <ReferenceLine
                  x={ctx.abschluesse}
                  stroke="rgba(30,210,141,0.5)"
                  strokeDasharray="4 4"
                  label={{
                    value: `${ctx.abschluesse.toLocaleString("de-DE", { maximumFractionDigits: 0 })} / Monat · ${formatPreis(ctx.kaufpreis)}`,
                    position: "top",
                    fill: AKZENT,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                {/* Die Lead-Kurve nur bei abweichenden individuellen Sätzen;
                    im Einheitsfall gibt es genau eine Kurve. */}
                {!gleich && (
                  <Area
                    type="monotone"
                    dataKey="lead"
                    stroke="rgba(246,248,252,0.45)"
                    strokeWidth={1.5}
                    fill="url(#cpVerlaufLead)"
                    isAnimationActive={!reduziert}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="eigen"
                  stroke={AKZENT_STARK}
                  strokeWidth={2.5}
                  fill="url(#cpVerlaufEigen)"
                  isAnimationActive={!reduziert}
                />
                {!gleich && (
                  <ReferenceDot
                    x={ctx.abschluesse}
                    y={leadJahr}
                    r={4.5}
                    fill="#F6F8FC"
                    stroke="rgba(246,248,252,0.5)"
                    strokeWidth={2}
                    isFront
                  />
                )}
                <ReferenceDot
                  x={ctx.abschluesse}
                  y={eigenJahr}
                  r={6}
                  fill="#fff"
                  stroke={AKZENT_STARK}
                  strokeWidth={3}
                  isFront
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Einblendung>

      {/* Die Kennzahlen zu den Reglerwerten, klar beschriftet: zwei Kacheln
          beim Einheitssatz, vier bei abweichenden individuellen Sätzen. */}
      <Einblendung delay={1000}>
        {gleich ? (
          <div className="mt-4 grid gap-3 grid-cols-2 max-w-2xl mx-auto text-left">
            <div className="rounded-3xl p-5" style={{ background: FLAECHE }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: GEDIMMTER }}>
                Pro Abschluss · {ctx.eigenSatz.toLocaleString("de-DE")} %
              </p>
              <p className="mt-2 text-xl md:text-2xl font-semibold tabular-nums">
                <HochlaufZahl wert={eigenDeal} dauer={600} suffix=" €" />
              </p>
            </div>
            <div className="rounded-3xl p-5" style={{ background: FLAECHE_AKTIV }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: AKZENT }}>
                Pro Jahr
              </p>
              <p className="mt-2 text-2xl md:text-3xl font-semibold tabular-nums" style={{ color: AKZENT }}>
                <HochlaufZahl wert={eigenJahr} dauer={600} suffix=" €" />
              </p>
              <p className="mt-1 text-xs tabular-nums" style={{ color: GEDIMMT }}>
                ≈ <HochlaufZahl wert={eigenMonat} dauer={600} suffix=" €" /> pro Monat
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto text-left">
            <div className="rounded-3xl p-5" style={{ background: FLAECHE }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: GEDIMMTER }}>
                Pro Abschluss · Leads {ctx.leadSatz.toLocaleString("de-DE")} %
              </p>
              <p className="mt-2 text-xl md:text-2xl font-semibold tabular-nums">
                <HochlaufZahl wert={leadDeal} dauer={600} suffix=" €" />
              </p>
            </div>
            <div className="rounded-3xl p-5" style={{ background: FLAECHE }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: GEDIMMTER }}>
                Pro Abschluss · Eigene {ctx.eigenSatz.toLocaleString("de-DE")} %
              </p>
              <p className="mt-2 text-xl md:text-2xl font-semibold tabular-nums">
                <HochlaufZahl wert={eigenDeal} dauer={600} suffix=" €" />
              </p>
            </div>
            <div className="rounded-3xl p-5" style={{ background: FLAECHE }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: GEDIMMTER }}>
                Pro Jahr · OS Immobilien Leads
              </p>
              <p className="mt-2 text-xl md:text-2xl font-semibold tabular-nums">
                <HochlaufZahl wert={leadJahr} dauer={600} suffix=" €" />
              </p>
              <p className="mt-1 text-xs tabular-nums" style={{ color: GEDIMMTER }}>
                ≈ <HochlaufZahl wert={leadMonat} dauer={600} suffix=" €" /> pro Monat
              </p>
            </div>
            <div className="rounded-3xl p-5" style={{ background: FLAECHE_AKTIV }}>
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: AKZENT }}>
                Pro Jahr · Eigene Kunden
              </p>
              <p className="mt-2 text-2xl md:text-3xl font-semibold tabular-nums" style={{ color: AKZENT }}>
                <HochlaufZahl wert={eigenJahr} dauer={600} suffix=" €" />
              </p>
              <p className="mt-1 text-xs tabular-nums" style={{ color: GEDIMMT }}>
                ≈ <HochlaufZahl wert={eigenMonat} dauer={600} suffix=" €" /> pro Monat
              </p>
            </div>
          </div>
        )}
      </Einblendung>
      <RechenFussnote delay={1200} />
    </Folie>
  );
}

/**
 * Zwei Wege. Ein System. Im neuen Modell gilt für beide Wege derselbe Satz
 * von 4 Prozent, deshalb stehen die Karten gleichberechtigt nebeneinander und
 * der Glanz liegt auf dem Einheitssatz darunter. Nur individuell verhandelte
 * Sätze aus dem Bewerberprofil lassen die Zahlen auseinanderlaufen. Der
 * Lead-Paket-Teaser steht immer daneben, auch im generischen Modus; nur wenn
 * das gewählte Paket ihn ausdrücklich nicht vorsieht, trägt er eine ehrliche
 * Unterzeile.
 */
function FolieZweiWege({ ctx }: { ctx: FolienKontext }) {
  const gleich = ctx.leadSatz === ctx.eigenSatz;
  return (
    <Folie breit>
      <Kicker>Zwei Wege. Ein System.</Kicker>
      {/* Zwei Karten, nicht drei. Das Lead-Paket ist ein optionaler Zukauf und
          gehoert damit auf die Preisfolie, nicht neben die Verguetungssaetze. */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 text-left">
        <Einblendung delay={250}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: GEDIMMT }}>
              OS Immobilien Leads
            </p>
            <p className="mt-3 text-5xl font-semibold tabular-nums">
              {ctx.leadSatz.toLocaleString("de-DE")} %
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: GEDIMMT }}>
              Leads aus dem gemeinsamen Marketingsystem. OS Immobilien bringt die Infrastruktur,
              du machst Beratung und Closing.
            </p>
          </div>
        </Einblendung>
        <Einblendung delay={500}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: GEDIMMT }}>
              Eigene Kunden
            </p>
            <p className="mt-3 text-5xl font-semibold tabular-nums">
              {ctx.eigenSatz.toLocaleString("de-DE")} %
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: GEDIMMT }}>
              Du bringst den Kunden aus deinem Netzwerk. OS Immobilien liefert Produkte,
              Finanzierung, System, Backoffice und Dealstruktur.
            </p>
          </div>
        </Einblendung>
      </div>
      <Einblendung delay={1100}>
        {gleich ? (
          <p className="mt-10 text-2xl md:text-3xl font-semibold tracking-tight">
            Ein Satz für beide Wege:{" "}
            <Glanz>{ctx.eigenSatz.toLocaleString("de-DE")} %</Glanz> auf jeden Abschluss.
          </p>
        ) : (
          <p className="mt-10 text-2xl md:text-3xl font-semibold tracking-tight">
            Je mehr Wert du einbringst, <Glanz>desto mehr verdienst du.</Glanz>
          </p>
        )}
      </Einblendung>
      <Einblendung delay={1250}>
        <p className="mt-5 text-base md:text-lg leading-relaxed max-w-3xl mx-auto" style={{ color: GEDIMMT }}>
          {gleich
            ? "Keine Stufen, die du dir erst verdienen musst, und keine kleinere Einstiegsprovision. Jeder Partner startet bei uns mit demselben Satz."
            : "Keine Stufen, die du dir erst verdienen musst, und keine kleinere Einstiegsprovision."}
        </p>
      </Einblendung>
      {ctx.verhandelt && (
        <Einblendung delay={1450}>
          <p className="mt-4 text-sm" style={{ color: GEDIMMTER }}>
            Gerechnet mit deinen individuell vereinbarten Sätzen.
          </p>
        </Einblendung>
      )}
    </Folie>
  );
}

/**
 * Einwand-Vorwegnahme vor dem Preis: was OS Immobilien nicht ist, was es kostet
 * und was alles gestellt wird. Erst wenn der Bewerber gedanklich gekauft
 * hat, kommt die Zahl, so will es das Drehbuch. Die zwei Preisflächen
 * trennen sauber das gestellte System vom optionalen Lead-Kauf; beide
 * Inhalte kommen aus lizenzPakete.ts und der Leadpaket-Vereinbarung
 * (Anlage 3 der kompakten Fassung).
 */
function FoliePreis({ ctx }: { ctx: FolienKontext }) {
  const system = ["CRM", "Investagon", "Produktzugang", "Backoffice", "Support", "Finanzierungszugang", "Vertriebsprozesse", "Trainings"];
  return (
    <Folie breit>
      <Kicker>Was das nicht ist, und was es kostet</Kicker>

      {/* Die zwei Zahlen des Abends, sauber getrennt: gestellt und optional. */}
      <div className={`mt-6 grid gap-4 text-left ${ctx.leadpaketVerfuegbar ? "lg:grid-cols-2" : ""}`}>
        <Einblendung delay={250}>
          <div className="h-full rounded-3xl p-7" style={{ background: FLAECHE_AKTIV }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
              Das System · gestellt
            </p>
            <p className="mt-3 text-4xl md:text-5xl font-semibold tabular-nums">
              <Glanz>{formatPreis(0)}</Glanz> <span className="text-lg font-medium" style={{ color: GEDIMMT }}>/ Monat</span>
            </p>
            <Punkte
              eintraege={[
                <>Kein laufendes Entgelt, kein Einmalbetrag.</>,
                <><strong>Keine Mindestlaufzeit</strong>, der Vertrag läuft auf unbestimmte Zeit.</>,
                <>Der Anlauf dauert <strong>zwei bis drei Monate</strong>; so lange investieren wir beide: du Zeit, wir System und Begleitung.</>,
                <>Enthalten ist das gesamte OS Immobilien System: {system.join(", ")}.</>,
                <>Dazu {GESTELLT_ZUSATZ_KURZ}.</>,
                <>Keine eigene Infrastruktur, keine jahrelange Aufbauphase.</>,
              ]}
            />
          </div>
        </Einblendung>
        {ctx.leadpaketVerfuegbar && (
        <Einblendung delay={500}>
          <div className="h-full rounded-3xl p-7" style={{ background: FLAECHE }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: GEDIMMT }}>
              Dein Leadkanal · optional
            </p>
            <p className="mt-3 text-4xl md:text-5xl font-semibold tabular-nums">
              ab {formatPreis(LEAD_PAKET_PREIS)} <span className="text-lg font-medium" style={{ color: GEDIMMT }}>für {LEAD_PAKET_ANZAHL} Leads</span>
            </p>
            <p className="mt-4 text-base font-semibold leading-snug">
              Kein Kaufzwang: Dein eigenes Netzwerk reicht.
            </p>
            <Punkte
              eintraege={[
                <><strong>{LEAD_PAKET_ANZAHL} qualifizierte Leads</strong> für {formatPreis(LEAD_PAKET_PREIS)}, jederzeit erneut buchbar.</>,
                <>Einzel-Leads danach {formatPreis(LEAD_EINZELPREIS)} pro Stück.</>,
                <>Der Betrag geht eins zu eins ins Werbebudget.</>,
                <>Jeder Lead: echtes Interesse, <strong>mindestens 3.000 € netto</strong> im Monat, Eigenkapital vorhanden.</>,
                <>Das ist die zugesicherte Untergrenze, der Schnitt liegt deutlich darüber.</>,
                <>Zielgruppe: Unternehmer, Ärzte, gut verdienende Angestellte.</>,
                <>Nicht erreichbar, falsch eingetragen oder unter der Zusage: <strong>Ersatzlead</strong>, verbindlich in {leadpaketAnlageNummer("neu")}.</>,
              ]}
            />
            {!ctx.leadberaterPasst && (
              <p className="mt-3 text-xs" style={{ color: GEDIMMTER }}>
                Optional, nicht in jedem Paket enthalten.
              </p>
            )}
          </div>
        </Einblendung>
        )}
      </div>

      {/* Die Einordnung: was das nicht ist und was alles gestellt wird. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 text-left">
        <Einblendung delay={750}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
            <p className="text-base font-semibold">Kein Strukturvertrieb ohne Produkt.</p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: GEDIMMT }}>
              Deine Vergütung kommt aus echten Immobilienabschlüssen mit echten Kunden, nicht aus
              dem Anwerben neuer Partner.
            </p>
          </div>
        </Einblendung>
        <Einblendung delay={900}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
            <p className="text-base font-semibold">Was kostet nichts, was kostet etwas?</p>
            {/*
              Vorher standen hier drei Saetze ueber unser Interesse ("wir suchen
              keine Karteileichen", "erwartet Commitment") und der Satz, die
              Gebuehr sei "nicht Kosten". Sie ist selbstverstaendlich Kosten.
              Jetzt steht da, was sie dem Bewerber kauft, und die Jahreszahl,
              die den Preis einordnet. Genau mit ihr argumentiert auch das
              Erstgespraech.
            */}
            <Punkte
              eintraege={[
                <><strong>Unentgeltlich:</strong> CRM, Objektzugänge, Exposés, Preislisten, Skripte, Pflichtschulungen.</>,
                <><strong>Ebenfalls gestellt:</strong> Training über die Pflichtmodule hinaus, deine Landingpage, Marketing- und Verkaufsunterlagen, Coaching, Community, Support.</>,
                <>Kein laufendes Entgelt, keine Mindestlaufzeit. Optional dazukaufen kannst du nur Leads.</>,
                <>Ein einziger Abschluss bei {formatPreis(ctx.kaufpreis)} bringt dir <strong>{formatPreis(verguetungProDeal(ctx.kaufpreis, ctx.eigenSatz))}</strong>.</>,
              ]}
            />
          </div>
        </Einblendung>
      </div>

      {/* Risikoumkehr: die risikomindernden Konditionen aus dem echten
          Vertrag (vertragGenerator.ts), nichts erfunden. */}
      <Einblendung delay={1050}>
        <div
          className="mt-4 rounded-3xl px-6 py-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm"
          style={{ background: FLAECHE }}
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: AKZENT }} />
            Keine Mindestlaufzeit, kein laufendes Entgelt
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: AKZENT }} />
            Lead-Kauf optional
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: AKZENT }} />
            Ersatzlead-Regel bei Nichterreichbarkeit
          </span>
        </div>
      </Einblendung>
      <Einblendung delay={1250}>
        <p className="mt-8 text-xl md:text-2xl font-semibold">
          Der Hebel liegt im <span style={{ color: AKZENT }}>Abschluss</span>, nicht in
          irgendeiner Gebühr.
        </p>
        <p className="mt-3 text-xs md:text-sm" style={{ color: GEDIMMTER }}>
          Alle Details stehen ausführlich im Vertrag und seinen Anlagen.
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Passt das zu dir: die gegenseitige Erwartung. Keine Häkchen mehr, die der
 * Bewerber über sich selbst setzt, sondern zwei Spalten auf Augenhöhe. Der
 * Block "passt nicht zu dir" bleibt, er grenzt sachlich ab.
 */
function FolieSelbstCheck({ ctx }: { ctx: FolienKontext }) {
  return (
    <Folie breit>
      <Kicker>Zusammenarbeit auf Augenhöhe</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {ctx.vorname
            ? `Was wir voneinander erwarten, ${ctx.vorname}.`
            : "Was wir voneinander erwarten."}
        </h2>
        <p className="mt-3 text-sm max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
          Die Zusammenarbeit trägt nur, wenn beide Seiten liefern. Es geht dabei nicht um
          Vorerfahrung, sondern um die Arbeitsweise: Quereinsteiger und erfahrene
          Immobilienberater lesen hier dasselbe.
        </p>
      </Einblendung>

      <div className="mt-8 grid gap-4 lg:grid-cols-2 max-w-4xl mx-auto text-left">
        <Einblendung delay={350}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE_AKTIV }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
              Was wir von dir erwarten
            </p>
            <Punkte eintraege={ERWARTEN_WIR} />
          </div>
        </Einblendung>
        <Einblendung delay={550}>
          <div className="h-full rounded-3xl p-6" style={{ background: FLAECHE }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: GEDIMMT }}>
              Was du von uns bekommst
            </p>
            <Punkte eintraege={BEKOMMST_DU} />
          </div>
        </Einblendung>
      </div>

      <Einblendung delay={800}>
        <p className="text-xs uppercase tracking-[0.25em] font-semibold mt-8 mb-3" style={{ color: GEDIMMTER }}>
          Und ganz bewusst: OS Immobilien passt nicht zu dir, wenn ...
        </p>
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
          {PASST_NICHT_ZU_DIR.map((punkt) => (
            <span
              key={punkt}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs md:text-sm"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: GEDIMMTER }}
            >
              <X className="h-3.5 w-3.5" />
              {punkt}
            </span>
          ))}
        </div>
      </Einblendung>

      {/* Der beste Satz der frueheren Partner-Folie, die hier aufgegangen ist. */}
      <Einblendung delay={1000}>
        <p className="mt-10 text-2xl md:text-3xl font-semibold tracking-tight leading-[1.2]">
          OS Immobilien gibt dir die Plattform.{" "}
          <Glanz>Was du daraus machst, liegt bei dir.</Glanz>
        </p>
      </Einblendung>
    </Folie>
  );
}

/** Dein Start: der Zeitplan nimmt das gefühlte Risiko aus der Entscheidung. */
function FolieStart({ ctx }: { ctx: FolienKontext }) {
  return (
    <Folie>
      <Kicker>Dein Start bei OS Immobilien</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {ctx.vorname ? `So sehen deine ersten Wochen aus, ${ctx.vorname}.` : "So sehen deine ersten Wochen aus."}
        </h2>
        <p className="mt-3 text-sm" style={{ color: GEDIMMTER }}>
          Auf dem Weg zu deinem Ziel aus dem Rechner:{" "}
          <span className="font-semibold" style={{ color: AKZENT }}>
            {formatPreis(verguetungProJahr(ctx.abschluesse, ctx.kaufpreis, ctx.eigenSatz))} im Jahr
          </span>
          .
        </p>
      </Einblendung>
      <div className="mt-10 max-w-2xl mx-auto text-left space-y-0">
        {START_SCHRITTE.map((s, i) => (
          <Einblendung key={`${s.wann}-${s.was}`} delay={400 + i * 200}>
            <div className="flex gap-5">
              <div className="flex flex-col items-center">
                <span
                  className="h-3 w-3 rounded-full shrink-0 mt-1.5"
                  style={{ background: i === START_SCHRITTE.length - 1 ? VERLAUF : "rgba(255,255,255,0.3)" }}
                />
                {i < START_SCHRITTE.length - 1 && (
                  <span className="w-px flex-1 my-1" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
                )}
              </div>
              <div className="pb-7">
                <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
                  {s.wann}
                </p>
                <p className="mt-1 text-base md:text-lg font-medium">{s.was}</p>
              </div>
            </div>
          </Einblendung>
        ))}
      </div>
      <Einblendung delay={1600}>
        <p className="mt-4 text-lg md:text-xl italic" style={{ color: GEDIMMT }}>
          Du weißt also genau, was nach deiner Unterschrift passiert.
        </p>
      </Einblendung>
      {/* Gewerbe und Paragraf 34c sind Voraussetzung fuer die Vermittlung und
          wurden im Erstgespraech ausdruecklich abgefragt. Ohne diesen Hinweis
          unterschreibt jemand heute und merkt erst danach, dass noch eine
          Behoerde dazwischensteht. */}
      <Einblendung delay={1800}>
        <p className="mt-6 text-sm leading-relaxed max-w-2xl mx-auto" style={{ color: GEDIMMTER }}>
          Zwei Dinge brauchst du dafür formal: ein eigenes Gewerbe und die
          Gewerbeerlaubnis nach Paragraf 34c. Fehlt davon noch etwas, ist das kein
          Hindernis, sollte aber zeitnah beantragt werden. Wir unterstützen dich dabei.
        </p>
      </Einblendung>
    </Folie>
  );
}

/**
 * Ein Eingabefeld in der Optik des Decks. Die shadcn-Inputs des CRM sind auf
 * den hellen Rahmen abgestimmt und wirken auf der dunklen Folie wie
 * hineinkopiert, deshalb hier ein eigenes, sehr schlichtes Feld.
 */
function Feld({
  label, wert, setzen, platzhalter, pflicht = false, breit = false, typ = "text", modus,
}: {
  label: string;
  wert: string;
  setzen: (v: string) => void;
  platzhalter?: string;
  pflicht?: boolean;
  breit?: boolean;
  typ?: string;
  modus?: "numeric" | "text";
}) {
  // useId statt eines Namens aus dem Label: "Straße und Hausnummer" und "PLZ"
  // kommen zweimal vor, einmal fuer die Vertragsanschrift und einmal fuer die
  // Rechnungsadresse. Aus dem Label gebaute IDs waeren doppelt, und dann
  // zeigen beide Beschriftungen auf dasselbe Feld.
  const id = useId();
  const leer = pflicht && !wert.trim();
  return (
    <div className={breit ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="block text-[11px] uppercase tracking-[0.2em] font-semibold mb-1.5" style={{ color: GEDIMMT }}>
        {label}{pflicht && <span style={{ color: AKZENT }}> *</span>}
      </label>
      <input
        id={id}
        type={typ}
        value={wert}
        inputMode={modus}
        onChange={(e) => setzen(e.target.value)}
        placeholder={platzhalter}
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
        style={{
          background: FLAECHE,
          color: "#F6F8FC",
          border: leer ? "1px solid rgba(255,120,120,0.5)" : RAND,
        }}
      />
    </div>
  );
}

/**
 * Das Abschlussformular. Es erfasst genau das, was intern fehlt, um den
 * Vertrag zu erstellen und zu versenden:
 *
 *   - Name und Mailadresse zur Kontrolle, denn beide stehen im Vertrag und
 *     die Mailadresse traegt den Versand. Ein Zahlendreher faellt hier auf,
 *     solange der Bewerber noch danebensitzt, und nicht erst, wenn die
 *     Unterlagen ins Leere gehen.
 *   - Die Vertragsanschrift, also die Anschrift der Person, die
 *     unterschreibt.
 *   - Die Rechnungsadresse, die davon abweichen darf, etwa ein Firmensitz.
 *
 * Alles landet direkt im Bewerberprofil unter Closing. Aenderungen an Name
 * und Mailadresse werden dort ebenfalls uebernommen, sonst haette das Profil
 * zwei Wahrheiten.
 */
function AbschlussFormular({ ctx, fertig }: { ctx: FolienKontext; fertig: () => void }) {
  const b = ctx.bewerber;
  // Gleiche Auslegung wie parseRA im ClosingTab und parseAdresse in Teil 2
  // des Erstgesprächs, samt der vierten Zeile mit der USt-IdNr.: Vorher ging
  // eine im Closing erfasste USt-IdNr. beim erneuten Speichern hier verloren.
  const teile = (roh: string) => {
    const zeilen = (roh || "").split(/\r?\n/).map((z) => z.trim());
    const plzOrt = (zeilen[2] || "").match(/^(\d{4,5})\s+(.+)$/);
    return {
      name: zeilen[0] || "",
      strasse: zeilen[1] || "",
      plz: plzOrt ? plzOrt[1] : "",
      ort: plzOrt ? plzOrt[2] : zeilen[2] || "",
      ust: (zeilen[3] || "").replace(/^USt-?IdNr\.?:?\s*/i, ""),
    };
  };
  const va = teile(b?.vertragsAdresse || "");
  const ra = teile(b?.rechnungsAdresse || "");

  const [vorname, setVorname] = useState(b?.vorname || "");
  const [nachname, setNachname] = useState(b?.nachname || "");
  const [email, setEmail] = useState(b?.email || "");
  const [vaStrasse, setVaStrasse] = useState(va.strasse || b?.adresse || "");
  const [vaPlz, setVaPlz] = useState(va.plz);
  const [vaOrt, setVaOrt] = useState(va.ort || b?.ort || "");
  // Der Regelfall ist eine Adresse, deshalb ist der Haken gesetzt. Wer ueber
  // eine Firma abrechnet, nimmt ihn weg und bekommt den zweiten Block.
  const [identisch, setIdentisch] = useState(
    !(Boolean(b?.rechnungsAdresse?.trim()) && b?.rechnungsAdresse !== b?.vertragsAdresse),
  );
  const [raName, setRaName] = useState(ra.name);
  const [raStrasse, setRaStrasse] = useState(ra.strasse);
  const [raPlz, setRaPlz] = useState(ra.plz);
  const [raOrt, setRaOrt] = useState(ra.ort);
  const [raUst, setRaUst] = useState(ra.ust);
  // Nur bei individueller Fassung der Wettbewerbsklausel (§ 8 in der kompakten
  // Fassung, § 10 in der Altfassung): der Bewerber erklaert selbst, fuer
  // welche anderen Vertriebe er aktuell arbeitet. Landet im Bewerberprofil
  // (Closing) und wird von dort in das Konditionenblatt (Anlage 1) bzw. in
  // Anlage 8 der Altfassung eingedruckt.
  //
  // Bewusst hinter einem Exklusiv-Schalter versteckt: Die Praesentation soll
  // nicht von sich aus darauf hinweisen, dass eine Taetigkeit fuer andere
  // Vertriebe moeglich ist. Der Standard ist exklusiv, erst das Umlegen des
  // Schalters oeffnet das Eingabefeld.
  const [vertriebe, setVertriebe] = useState(b?.andereVertriebe || "");
  // IMMER eingeschaltet starten, auch wenn frueher Vertriebe gespeichert
  // wurden: Die Praesentation zeigt standardgemaess die exklusive
  // Zusammenarbeit, das Eingabefeld erscheint erst nach bewusstem Umlegen.
  // Eine frueher gespeicherte Angabe steht dann vorbefuellt im Feld.
  const [exklusiv, setExklusiv] = useState(true);
  // Paketwahl und Zahlungsweise: dieselben Bewerber-Felder wie Teil 2 des
  // Erstgespraechs (ClosingDirektTeil) und der Reiter Closing. Bei Ja plus
  // Paket springt der Status wie dort auf Paketwahl, und der Reiter Closing
  // ist danach komplett vorbefuellt. Neu vergeben werden nur Vertriebspartner
  // und Lead-Berater (DIREKT_PAKETE); ein frueher gespeichertes Altpaket
  // bleibt stehen, bis hier bewusst umgewaehlt wird.
  const [paket, setPaket] = useState<LizenzPaketId | "">((b?.paketwahl as LizenzPaketId) || "junior");
  const [zw, setZw] = useState<Zahlungsweise>((b?.zahlungsweise as Zahlungsweise) || "einmal");
  const gewaehltesPaket = DIREKT_PAKETE.find((p) => p.id === paket) ?? null;
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");

  const zeilen = (name: string, strasse: string, plz: string, ort: string, ust?: string) =>
    [name.trim(), strasse.trim(), [plz.trim(), ort.trim()].filter(Boolean).join(" "), ust?.trim() ? `USt-IdNr.: ${ust.trim()}` : ""]
      .filter(Boolean)
      .join("\n");

  const speichern = async () => {
    const pflicht = [vorname, nachname, email, vaStrasse, vaPlz, vaOrt];
    if (pflicht.some((w) => !w.trim())) {
      setFehler("Bitte fülle alle Pflichtfelder aus.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFehler("Die Mailadresse sieht nicht vollständig aus.");
      return;
    }
    if (!identisch && [raName, raStrasse, raPlz, raOrt].some((w) => !w.trim())) {
      setFehler("Bitte fülle die abweichende Rechnungsadresse vollständig aus.");
      return;
    }
    const voll = [vorname.trim(), nachname.trim()].filter(Boolean).join(" ");
    const vertragsAdresse = zeilen(voll, vaStrasse, vaPlz, vaOrt);
    const rechnungsAdresse = identisch
      ? vertragsAdresse
      : zeilen(raName, raStrasse, raPlz, raOrt, raUst);

    setFehler("");
    setSpeichert(true);
    try {
      // Ohne Bewerber im Cache gibt es nichts zu speichern. Die Praesentation
      // laeuft dann generisch, und der Abschluss bleibt trotzdem moeglich:
      // Die Daten nimmt in dem Fall der Berater im Profil auf.
      if (b) {
        await updateBewerber(b.id, {
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim(),
          vertragsAdresse,
          rechnungsAdresse,
          closingEntscheidung: "ja",
          paketwahl: paket,
          zahlungsweise: zw,
          andereVertriebe: exklusiv ? "" : vertriebe.trim(),
        });
        // Derselbe Status-Sprung wie in Teil 2 des Erstgespraechs: Ja plus
        // Paket fuehrt aus Eingang, Erstgespraech oder Closing auf Paketwahl.
        const ziel = closingDirektStatusSprung(b.status, "ja", paket);
        if (ziel) changeBewerberStatus(b.id, ziel);
      }
      fertig();
    } catch {
      setFehler("Das Speichern hat nicht geklappt. Bitte noch einmal versuchen.");
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Folie breit>
      <Kicker>Damit wir den Vertrag aufsetzen können</Kicker>
      <Einblendung delay={100}>
        <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
          Kurz deine <Glanz>Daten prüfen</Glanz>.
        </h2>
        <p className="mt-3 text-sm max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
          Wir haben das meiste schon. Schau bitte drüber, ob Name und Mailadresse stimmen,
          und ergänze deine Anschrift.
        </p>
      </Einblendung>

      <Einblendung delay={300}>
        <div className="mt-8 max-w-2xl mx-auto text-left space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold mb-3" style={{ color: AKZENT }}>
              Deine Angaben
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Feld label="Vorname" wert={vorname} setzen={setVorname} pflicht />
              <Feld label="Nachname" wert={nachname} setzen={setNachname} pflicht />
              <Feld label="E-Mail für den Vertragsversand" wert={email} setzen={setEmail} pflicht breit typ="email" />
            </div>
          </div>

          {b && (
            <div>
              <p className="text-xs uppercase tracking-[0.25em] font-semibold mb-1" style={{ color: AKZENT }}>
                Dein Paket
              </p>
              <p className="text-xs mb-3" style={{ color: GEDIMMTER }}>
                Das Vertragsdokument, das wir aufsetzen.
              </p>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Paket">
                {DIREKT_PAKETE.map((p) => {
                  const gewaehlt = paket === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={gewaehlt}
                      onClick={() => setPaket(p.id)}
                      className="rounded-2xl px-4 py-3 text-left transition-all"
                      style={gewaehlt
                        ? { background: "rgba(26,181,122,0.14)", border: "1px solid rgba(26,181,122,0.7)", boxShadow: "0 0 24px rgba(26,181,122,0.25)" }
                        : { background: FLAECHE, border: RAND }}
                    >
                      <div className="text-sm font-semibold">{p.titel}</div>
                      <div className="text-xs mt-0.5" style={{ color: GEDIMMT }}>{p.zielgruppe}</div>
                      <div className="text-xs mt-1.5" style={{ color: AKZENT }}>
                        {p.preis > 0
                          ? `${formatPreis(p.preis)} einmalig + ${formatPreis(p.monatlich)}/Monat`
                          : `Kein laufendes Entgelt · ${p.provisionssatz} % Provision`}
                      </div>
                    </button>
                  );
                })}
              </div>
              {gewaehltesPaket && gewaehltesPaket.preis > 0 ? (
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color: GEDIMMTER }}>Zahlungsweise</p>
                  <div className="flex gap-2" role="radiogroup" aria-label="Zahlungsweise">
                    {ZAHLUNGSWEISEN.map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        role="radio"
                        aria-checked={zw === z.id}
                        onClick={() => setZw(z.id)}
                        className="flex-1 rounded-xl px-4 py-2.5 text-sm transition-all"
                        style={zw === z.id
                          ? { background: "rgba(26,181,122,0.14)", border: "1px solid rgba(26,181,122,0.7)" }
                          : { background: FLAECHE, border: RAND, color: GEDIMMT }}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : gewaehltesPaket ? (
                <p className="mt-3 text-xs" style={{ color: GEDIMMTER }}>
                  Keine einmalige Investition und kein laufendes Entgelt. CRM, Objektzugang, Training,
                  Landingpage, Verkaufsunterlagen, Coaching, Community und Support werden gestellt.
                </p>
              ) : null}
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold mb-1" style={{ color: AKZENT }}>
              Vertragsanschrift
            </p>
            <p className="text-xs mb-3" style={{ color: GEDIMMTER }}>
              Diese Anschrift steht im Vertrag.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Feld label="Straße und Hausnummer" wert={vaStrasse} setzen={setVaStrasse} pflicht breit platzhalter="Musterstraße 12" />
              <Feld label="PLZ" wert={vaPlz} setzen={(v) => setVaPlz(v.replace(/[^\d]/g, "").slice(0, 5))} pflicht modus="numeric" platzhalter="83075" />
              <Feld label="Ort" wert={vaOrt} setzen={setVaOrt} pflicht platzhalter="Mittenwalde" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-md flex items-center justify-center transition-all"
                style={identisch ? { background: VERLAUF } : { border: "1px solid rgba(255,255,255,0.3)" }}
              >
                {identisch && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
              <input
                type="checkbox"
                checked={identisch}
                onChange={(e) => setIdentisch(e.target.checked)}
                className="sr-only"
              />
              <span className="text-sm" style={{ color: GEDIMMT }}>
                Rechnungsadresse identisch mit Vertragsanschrift
              </span>
            </label>
          </div>

          {!identisch && (
            <div>
              <p className="text-xs uppercase tracking-[0.25em] font-semibold mb-1" style={{ color: AKZENT }}>
                Rechnungsadresse
              </p>
              <p className="text-xs mb-3" style={{ color: GEDIMMTER }}>
                An diese Adresse geht die Rechnung, zum Beispiel an deine Firma.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Feld label="Name oder Firma" wert={raName} setzen={setRaName} pflicht breit platzhalter="Mustermann GmbH" />
                <Feld label="Straße und Hausnummer" wert={raStrasse} setzen={setRaStrasse} pflicht breit />
                <Feld label="PLZ" wert={raPlz} setzen={(v) => setRaPlz(v.replace(/[^\d]/g, "").slice(0, 5))} pflicht modus="numeric" />
                <Feld label="Ort" wert={raOrt} setzen={setRaOrt} pflicht />
                <Feld label="USt-IdNr. (optional)" wert={raUst} setzen={(v) => setRaUst(v.replace(/[\s\-.]/g, "").toUpperCase().slice(0, 14))} breit platzhalter="DE123456789" />
              </div>
            </div>
          )}

          {b && (
            <div>
              {/* Steht bei JEDEM Bewerber, Standard ist exklusiv. Bewusst
                  zurueckhaltend formuliert: kein Hinweis darauf, dass eine
                  Taetigkeit fuer andere Vertriebe zulaessig waere. Wer nichts
                  anfasst, bestaetigt die exklusive Zusammenarbeit. Die Angabe
                  landet im Bewerberprofil; in den Vertrag kommt sie nur bei
                  aktiver Individualfassung, beim Standardvertrag dient sie als
                  Offenlegung nach Absatz 2 der Wettbewerbsklausel. */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={exklusiv}
                  onClick={() => setExklusiv((v) => !v)}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={exklusiv ? { background: VERLAUF } : { background: FLAECHE, border: RAND }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                    style={{ left: exklusiv ? "22px" : "2px" }}
                  />
                </button>
                <span className="text-sm" style={{ color: GEDIMMT }}>
                  Exklusive Zusammenarbeit mit OS Immobilien
                </span>
              </label>
              {!exklusiv && (
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color: GEDIMMTER }}>
                    Für welche Unternehmen bist du aktuell tätig? Ein Unternehmen pro Zeile.
                  </p>
                  <textarea
                    value={vertriebe}
                    onChange={(e) => setVertriebe(e.target.value)}
                    placeholder={"Muster Vertriebs GmbH, München"}
                    rows={3}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 resize-y"
                    style={{ background: FLAECHE, color: "#F6F8FC", border: RAND }}
                  />
                </div>
              )}
            </div>
          )}

          {fehler && (
            <p className="text-sm font-medium" style={{ color: "rgb(255,138,138)" }}>
              {fehler}
            </p>
          )}

          <div className="flex justify-center pt-2">
            <Button
              size="lg"
              onClick={speichern}
              disabled={speichert}
              className="rounded-full h-14 px-10 text-base font-semibold text-white border-0 transition-shadow hover:shadow-[0_0_50px_rgba(26,181,122,0.5)] disabled:opacity-60"
              style={{ background: VERLAUF, boxShadow: "0 0 35px rgba(26,181,122,0.35)" }}
            >
              {speichert ? "Wird gespeichert ..." : "Angaben speichern"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </Einblendung>
    </Folie>
  );
}

/**
 * Abschluss: Der CTA verlinkt bewusst nirgendwohin. Nach dem Klick erscheint
 * ein grosser Handschlag. Das ist das stille Zeichen an den Praesentierenden,
 * zurueck ins Bewerberprofil zu wechseln und dort die Partnervereinbarung
 * fertig zu machen. Der Bewerber sieht nur den Willkommensmoment.
 */
function FolieAbschluss({ ctx }: { ctx: FolienKontext }) {
  const schritte = ["Partnervereinbarung", "Onboarding", "Systemzugang", "Erster Kundenfall"];
  const [schritt, setSchritt] = useState<"folie" | "formular" | "handschlag">("folie");

  if (schritt === "formular") {
    return <AbschlussFormular ctx={ctx} fertig={() => setSchritt("handschlag")} />;
  }

  if (schritt === "handschlag") {
    return (
      <Folie>
        <Einblendung delay={100}>
          {/* Lichtring um den Handschlag: ein weicher Puls, kein Feuerwerk. */}
          <div className="relative mx-auto h-40 w-40 md:h-52 md:w-52">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full motion-safe:animate-ping"
              style={{ background: "rgba(26,181,122,0.28)", animationDuration: "2.6s" }}
            />
            <div
              className="relative flex h-full w-full items-center justify-center rounded-full motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-700"
              style={{ background: VERLAUF, boxShadow: "0 0 90px rgba(26,181,122,0.45)" }}
            >
              <Handshake className="h-20 w-20 md:h-28 md:w-28 text-white" />
            </div>
          </div>
        </Einblendung>
        <Einblendung delay={600}>
          <h2 className="mt-10 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1]">
            Willkommen bei OS Immobilien{ctx.vorname ? `, ${ctx.vorname}` : ""}.
          </h2>
        </Einblendung>
        <Einblendung delay={1100}>
          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
            Deine Angaben sind gespeichert. Wir erstellen jetzt deinen Vertrag und schicken
            ihn dir digital zur Unterschrift.
          </p>
          <p className="mt-4 text-base md:text-lg max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
            Sobald er uns unterschrieben vorliegt, melden wir uns wegen deines Onboardings
            und der nächsten Schritte.
          </p>
          <p className="mt-10 text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: GEDIMMTER }}>
            OS Immobilien · Performance. Verantwortung. Partnerschaft.
          </p>
        </Einblendung>
      </Folie>
    );
  }

  return (
    <Folie>
      <Kicker>Dein nächster Schritt</Kicker>
      <Einblendung delay={150}>
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1]">
          Dann lass es uns gemeinsam machen{ctx.vorname ? `, ${ctx.vorname}` : ""}.
        </h2>
      </Einblendung>
      <Einblendung delay={500}>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {schritte.map((s, i) => (
            <span
              key={s}
              className="inline-flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm md:text-base font-medium"
              style={{ background: FLAECHE }}
            >
              <span
                className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: VERLAUF }}
              >
                {i + 1}
              </span>
              {s}
            </span>
          ))}
        </div>
      </Einblendung>
      <Einblendung delay={900}>
        <Button
          size="lg"
          onClick={() => setSchritt("formular")}
          className="mt-12 rounded-full h-14 px-10 text-base font-semibold text-white border-0 transition-shadow hover:shadow-[0_0_50px_rgba(26,181,122,0.5)]"
          style={{ background: VERLAUF, boxShadow: "0 0 35px rgba(26,181,122,0.35)" }}
        >
          <Handshake className="mr-2 h-5 w-5" />
          Partnerschaft starten
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </Einblendung>
      <Einblendung delay={1200}>
        <p className="mt-12 text-sm md:text-base italic max-w-2xl mx-auto" style={{ color: GEDIMMT }}>
          Was du hier aufbaust, gehört dir. Deine eigenen Kunden bleiben deine, auch wenn
          wir irgendwann nicht mehr zusammenarbeiten.
        </p>
      </Einblendung>
    </Folie>
  );
}

/* ══════════════════════════════════════════════════════════════
   Teil 1: die Folien zum Erstgespräch
   ══════════════════════════════════════════════════════════════ */

/** Text mit *Stern-Markierung*: die markierten Stellen in Akzentfarbe. */
function Akzente({ text }: { text: string }) {
  return (
    <>
      {zerlegeAkzente(text).map((t, i) =>
        t.akzent ? (
          <span key={i} style={{ color: AKZENT }}>{t.text}</span>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </>
  );
}

/** Titel mit Glanzwort und, bei Anrede, dem Vornamen vor dem Satzzeichen. */
function TitelMitGlanz({
  titel, glanz, vorname, anrede,
}: {
  titel: string;
  glanz: string;
  vorname?: string;
  anrede?: boolean;
}) {
  const t = zerlegeTitel(titel, glanz, vorname, anrede);
  return (
    <>
      {t.vor}
      {t.glanz && <Glanz>{t.glanz}</Glanz>}
      {t.nach}
    </>
  );
}

/** Spaltenraster je Kartenzahl auf den Teil-1-Folien. */
const KARTEN_SPALTEN: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * Eine Folie aus Teil 1, datengetrieben aus dem Erstgesprächsskript
 * (erstgespraechFolien.ts). Alle sieben Folien teilen sich diesen Aufbau:
 * Kicker, Titel mit Glanzwort, dann je nach Station Karten, Stichworte, ein
 * großer Satz, eine Frage mit Antwortoptionen, ein Schlusssatz und zuletzt
 * die Überleitung zu Teil 2. Die Folie zeigt nur, was der Bewerber sehen
 * darf: keine Sprechtexte, keine Regie, keine Eingabefelder. Erfasst wird in
 * der Moderation, nicht hier.
 */
function FolieTeil1({ eintrag, ctx }: { eintrag: ErstgespraechFolie; ctx: FolienKontext }) {
  const f = eintrag.folie;
  const titel = (
    <TitelMitGlanz titel={f.titel} glanz={f.glanz} vorname={ctx.vorname} anrede={f.anrede} />
  );
  return (
    <Folie breit={!f.deckblatt && !f.schmal}>
      <Kicker>{f.kicker}</Kicker>
      <Einblendung delay={150}>
        {f.deckblatt ? (
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.04]">{titel}</h1>
        ) : (
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.12]">{titel}</h2>
        )}
      </Einblendung>
      {f.untertitel && (
        <Einblendung delay={450}>
          <p className="mt-8 text-lg md:text-2xl" style={{ color: GEDIMMT }}>{f.untertitel}</p>
        </Einblendung>
      )}
      {f.karten && (
        <div
          className={`mt-10 grid gap-4 text-left ${KARTEN_SPALTEN[f.karten.length] ?? "md:grid-cols-3"} ${f.deckblatt ? "max-w-4xl mx-auto" : ""}`}
        >
          {f.karten.map((k, i) => (
            <Einblendung key={k.ueber} delay={400 + i * 150}>
              <div className="h-full rounded-3xl p-6" style={{ background: k.aktiv ? FLAECHE_AKTIV : FLAECHE }}>
                <p
                  className="text-xs uppercase tracking-[0.25em] font-semibold"
                  style={{ color: k.ueberGedimmt ? GEDIMMT : AKZENT }}
                >
                  {k.ueber}
                </p>
                {k.titel && <p className="mt-3 text-base md:text-lg font-semibold leading-snug">{k.titel}</p>}
                {k.text && (
                  <p className={`mt-2 leading-relaxed ${k.titel ? "text-sm" : "text-sm md:text-base"}`} style={{ color: GEDIMMT }}>
                    {k.text}
                  </p>
                )}
              </div>
            </Einblendung>
          ))}
        </div>
      )}
      {f.stichworte && (
        <div className="mt-10 flex flex-wrap justify-center gap-3 max-w-5xl mx-auto">
          {f.stichworte.map((s, i) => (
            <span
              key={s}
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none rounded-2xl px-5 py-3 text-sm md:text-base font-medium"
              style={{ animationDelay: `${450 + i * 90}ms`, animationFillMode: "both", background: FLAECHE }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {f.gross && (
        <Einblendung delay={900}>
          <p
            className={`mt-10 font-semibold tracking-tight leading-[1.2] ${f.grossKompakt ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"}`}
          >
            <Akzente text={f.gross} />
          </p>
        </Einblendung>
      )}
      {f.frage && (
        <Einblendung delay={900}>
          <p className="mt-10 text-base md:text-lg" style={{ color: GEDIMMT }}>{f.frage}</p>
        </Einblendung>
      )}
      {f.optionen && (
        <Einblendung delay={1050}>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {f.optionen.map((o) => (
              <span
                key={o}
                className="rounded-full px-4 py-2 text-xs md:text-sm"
                style={{ border: "1px solid rgba(255,255,255,0.08)", color: GEDIMMTER }}
              >
                {o}
              </span>
            ))}
          </div>
        </Einblendung>
      )}
      {f.satz && (
        <Einblendung delay={1200}>
          <p className="mt-6 text-base md:text-lg leading-relaxed max-w-3xl mx-auto" style={{ color: GEDIMMT }}>
            <Akzente text={f.satz} />
          </p>
        </Einblendung>
      )}
      {f.ueberleitung && (
        <Einblendung delay={1500}>
          <div className="mt-8 rounded-3xl px-8 py-6 max-w-3xl mx-auto" style={{ background: FLAECHE_AKTIV }}>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold" style={{ color: AKZENT }}>
              {f.ueberleitung.ueber}
            </p>
            <p className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight leading-[1.25]">
              <TitelMitGlanz titel={f.ueberleitung.satz} glanz={f.ueberleitung.glanz} />
            </p>
            <p className="mt-3 text-sm md:text-base" style={{ color: GEDIMMT }}>{f.ueberleitung.unterzeile}</p>
          </div>
        </Einblendung>
      )}
      {f.schluss && (
        <Einblendung delay={900}>
          <p
            className="mt-10 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs md:text-sm font-semibold"
            style={{ border: RAND, backgroundColor: "rgba(255,255,255,0.04)", color: AKZENT }}
          >
            {f.schluss}
          </p>
        </Einblendung>
      )}
    </Folie>
  );
}

/* ══════════════════════════════════════════════════════════════
   Das Deck
   ══════════════════════════════════════════════════════════════ */

/** Eine Folie, wie das Deck sie rendert: Id, Kopfzeile, Phase, Inhalt. */
export type DeckEintrag = { id: string; titel: string; phase: string; inhalt: React.ReactNode };

/**
 * Der Folienkontext samt Reglerwerten. Die Reglerwerte leben im Deck, nicht
 * in der Rechner-Folie: Die Folie "Preis des Wartens" rechnet mit denselben
 * Werten weiter.
 */
export function useFolienKontext(bewerber: Bewerber | null, vorname: string): FolienKontext {
  const saetze = useMemo(() => ermittleSaetze(bewerber), [bewerber]);
  const [abschluesse, setAbschluesse] = useState(1);
  const [kaufpreis, setKaufpreis] = useState(300000);
  const [chaosMitMore, setChaosMitMore] = useState(false);

  // Die Leadberater-Option ist immer sichtbar. Bei den Sonderformen
  // Partner-Honorar und Tippgeber gibt es kein Leadbudget, dann steht auf den
  // Leadberater-Flächen die ehrliche Unterzeile "nicht in jedem Paket".
  const leadberaterPasst = !bewerber?.paketwahl || !["partner_2", "tippgeber"].includes(bewerber.paketwahl);

  // Beim Paket Lead-Berater gibt es kein käufliches Leadpaket: Leads werden
  // zur Unterstützung gestellt. Die Leadkanal-Karte der Preisfolie entfällt.
  const leadpaketVerfuegbar = bewerber?.paketwahl !== "lead_berater";

  return {
    bewerber,
    vorname,
    leadSatz: saetze.leadSatz,
    eigenSatz: saetze.eigenSatz,
    verhandelt: saetze.verhandelt,
    abschluesse,
    setAbschluesse,
    kaufpreis,
    setKaufpreis,
    chaosMitMore,
    setChaosMitMore,
    leadberaterPasst,
    leadpaketVerfuegbar,
  };
}

/**
 * Das Deck entlang der gemeinsamen Definition (praesentationsDeck.ts): Teil 1
 * aus dem Erstgesprächsskript, Teil 2 aus den Folien oben, je Folien-Id (die
 * folieIds aus closingDirektSkript.ts). Reihenfolge, Titel, Phase und
 * Sichtbarkeit der bedingten Folien (Partnerstimmen nur mit echten Stimmen,
 * Zahlen nur mit gepflegten Kennzahlen) kommen von dort, nicht von hier.
 * Beim ganzen Deck trägt die Kopfzeile das Teil-Präfix ("Teil 1 ·
 * Kennenlernen"), beim Einstieg mit teil=2 nur die Phase wie bisher. Eine
 * Folie ohne Inhalt fällt still heraus, statt die Bühne zu zerlegen.
 */
export function baueFolien(teil: DeckTeil, ctx: FolienKontext): DeckEintrag[] {
  const inhalteTeil2: Record<string, React.ReactNode> = {
    cover: <FolieCover ctx={ctx} />,
    chaos: <FolieChaos ctx={ctx} />,
    vision: <FolieVision ctx={ctx} />,
    werte: <FolieWerte />,
    system: <FolieSystem />,
    "objekte-standorte": <FolieObjekteStandorte />,
    dealprozess: <FolieDealProzess />,
    partnerstimmen: <FoliePartnerstimmen />,
    zahlen: <FolieZahlen />,
    "echter-fall": <FolieEchterFall ctx={ctx} />,
    rechner: <FolieRechner ctx={ctx} />,
    "zwei-wege": <FolieZweiWege ctx={ctx} />,
    preis: <FoliePreis ctx={ctx} />,
    selbstcheck: <FolieSelbstCheck ctx={ctx} />,
    start: <FolieStart ctx={ctx} />,
    abschluss: <FolieAbschluss ctx={ctx} />,
  };

  return deckFuerEinstieg(teil).flatMap((f) => {
    const eintrag = f.teil === 1 ? getErstgespraechFolie(f.id) : null;
    const inhalt: React.ReactNode = f.teil === 1
      ? eintrag && <FolieTeil1 eintrag={eintrag} ctx={ctx} />
      : inhalteTeil2[f.id];
    if (!inhalt) return [];
    return [{
      id: f.id,
      titel: f.titel,
      phase: teil === 2 ? f.phase : `Teil ${f.teil} · ${f.phase}`,
      inhalt,
    }];
  });
}

/**
 * Die dunkle Bühne: Lichtflächen, Fortschrittslinie, Kopfzeile, die aktive
 * Folie und die Fußleiste. Im Vollbild (Präsentationsfenster) füllt sie den
 * Bildschirm und trägt die Steuerung; eingebettet (Vorschau in der
 * Moderation) füllt sie ihren Rahmen und zeigt nur die Folie mit Kopf- und
 * Fußzeile, ohne Knöpfe. So gibt es eine Folienquelle für beide Fenster.
 */
export function Buehne({
  folien,
  aktiv,
  eingebettet = false,
  onGeheZu,
}: {
  folien: DeckEintrag[];
  aktiv: number;
  eingebettet?: boolean;
  onGeheZu?: (index: number) => void;
}) {
  const folie = folien[aktiv];
  const letzte = aktiv === folien.length - 1;
  return (
    <div
      className={`${eingebettet ? "absolute" : "fixed"} inset-0 flex flex-col text-[#F6F8FC] font-sans`}
      style={{
        background: "radial-gradient(1200px 700px at 50% -10%, #122820 0%, #0B1526 45%, #070D1A 100%)",
      }}
    >
      {/* Lichtbühne: zwei weiche, sehr langsam driftende Lichtflächen hinter
          allen Folien. Bei reduzierter Bewegung stehen sie still. */}
      <style>{`
        @keyframes cpLichtA {
          0%, 100% { transform: translate3d(-4%, -2%, 0) scale(1); }
          50% { transform: translate3d(5%, 4%, 0) scale(1.12); }
        }
        @keyframes cpLichtB {
          0%, 100% { transform: translate3d(3%, 2%, 0) scale(1.08); }
          50% { transform: translate3d(-5%, -4%, 0) scale(1); }
        }
        @keyframes cpMausPuls {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cp-licht { animation: none !important; }
          .cp-maus-puls { animation: none !important; }
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="cp-licht absolute rounded-full"
          style={{
            top: "-22%", left: "6%", width: "58vw", height: "58vw",
            background: "radial-gradient(circle, rgba(39,116,87,0.17) 0%, transparent 62%)",
            filter: "blur(60px)",
            animation: "cpLichtA 28s ease-in-out infinite",
          }}
        />
        <div
          className="cp-licht absolute rounded-full"
          style={{
            bottom: "-28%", right: "-4%", width: "50vw", height: "50vw",
            background: "radial-gradient(circle, rgba(28,194,131,0.11) 0%, transparent 62%)",
            filter: "blur(70px)",
            animation: "cpLichtB 34s ease-in-out infinite",
          }}
        />
      </div>

      {/* Dünne Fortschrittslinie am oberen Rand. */}
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${((aktiv + 1) / folien.length) * 100}%`, background: VERLAUF }}
        />
      </div>

      {/* Kopfzeile: Logo links, Phase und Folientitel rechts. Bewusst schmal,
          die Bühne gehört den Folien. */}
      <header className="relative shrink-0 h-14 px-5 md:px-8 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="OS Immobilien" className="h-7 w-auto brightness-0 invert" />
          <span className="text-xs uppercase tracking-[0.3em] font-semibold hidden sm:inline" style={{ color: GEDIMMTER }}>
            Partner
          </span>
        </div>
        <span className="text-xs" style={{ color: GEDIMMTER }}>
          <span className="hidden md:inline uppercase tracking-[0.2em] font-semibold" style={{ color: "rgba(246,248,252,0.3)" }}>
            {folie.phase}
          </span>
          <span className="hidden md:inline" style={{ color: "rgba(246,248,252,0.2)" }}> · </span>
          {folie.titel}
        </span>
      </header>

      {/* Die aktive Folie. Der key erzwingt das Neu-Einhängen, dadurch laufen
          die Einblendungen bei jedem Folienwechsel von vorn. */}
      <main className="relative flex-1 min-h-0">
        <div key={folie.id} className="h-full">
          {folie.inhalt}
        </div>
      </main>

      {/* Fußleiste: Zähler, Punkte, Pfeile. Eingebettet nur der Zähler. */}
      <footer className="relative shrink-0 h-16 px-5 md:px-8 flex items-center justify-between gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="text-xs tabular-nums w-24" style={{ color: GEDIMMTER }}>
          Folie {aktiv + 1} / {folien.length}
        </span>
        {!eingebettet && onGeheZu && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {folien.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onGeheZu(i)}
                  aria-label={`Folie ${i + 1}: ${f.titel}`}
                  title={f.titel}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === aktiv ? 22 : 8,
                    background: i === aktiv ? VERLAUF : "rgba(255,255,255,0.22)",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 w-24 justify-end">
              <button
                type="button"
                onClick={() => onGeheZu(aktiv - 1)}
                disabled={aktiv === 0}
                aria-label="Vorherige Folie"
                className="h-10 w-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
                style={{ border: RAND }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onGeheZu(aktiv + 1)}
                disabled={letzte}
                aria-label="Nächste Folie"
                className="h-10 w-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
                style={{ background: letzte ? "rgba(255,255,255,0.1)" : VERLAUF }}
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
