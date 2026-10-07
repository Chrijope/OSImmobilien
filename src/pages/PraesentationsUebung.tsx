/**
 * Die Moderation der Präsentationen: mit seinen Antworten, mit Notizen.
 *
 * Erreichbar über „Moderation öffnen" im Bewerberprofil (Reiter Videocall
 * und Erstgespräch). Links die Folienleiste (`UebungsLeiste.tsx`) mit dem
 * Ablauf, den Favoriten und den Folien je Weg; rechts die Moderation zur
 * gewählten Folie:
 *
 *   Vorabbogen: die verkleinerte Vorschau des 22er-Decks
 *     (`ClosingPraesentationEntwurf.tsx`) und der Skriptbereich, wie ihn die
 *     Moderation des Bewerbergesprächs zeigt (`ClosingModeration.tsx`):
 *     Sprechtext, Regie, Einwände und die Erfassungsfelder der Folie, hier
 *     mit leeren Antworten und nur zur Ansicht.
 *   Kennenlernbogen: die Folien des Videocalls
 *     (`BewerberVideocallPraesentation.tsx`) auf einem der fünf Wege, dazu
 *     der Impuls je Folie und die Regeln der Strecke aus der Moderation des
 *     Videocalls (`BewerberVideocallModeration.tsx`).
 *   Rechner: nur `FolieRechner` aus dem Vorabbogen mit seinem Skriptabschnitt.
 *
 * **Die Folien des Kennenlernbogens tragen seine Antworten.** Reist eine
 * Bewerberkennung mit (`bewerber=<id>`) und liegt sein eingereichter Bogen
 * vor, rechnet die Ansicht die Folien aus genau diesen Antworten, mit
 * demselben `videocallFolien` wie das geteilte Fenster des Videocalls. Dann
 * steht die dritte Wegantwort auf der Modulfolie, sein Startzeitpunkt auf der
 * Schlussfolie und sein „Womit wir anfangen" auf Folie 1. Vor dem 22.09.2026
 * war das nicht so: Die Ansicht zeichnete immer eine blanke Strecke, und die
 * HR-Managerin moderierte mit leeren Folien.
 *
 * Blank bleibt es in drei Fällen, und jeder ist gewollt: ohne Kennung (dann
 * ist es die Übung), ohne eingereichten Bogen, und auf einem anderen Weg als
 * seinem. Welcher Fall gerade gilt, sagt die Zeile unter der Vorschau.
 * Die Folien des Vorabbogens bleiben immer blank, Platzhalter wie [Vorname]
 * bleiben dort stehen: Das alte 22er-Deck hat seine eigene Moderation
 * (`ClosingModeration.tsx`), hier dient es zum Durchgehen und Zeigen.
 *
 * Sein Name steht in der Kopfzeile der Moderation, nie im
 * Präsentationsfenster. Unter den Notizen liegt zugeklappt sein
 * Kennenlernbogen, dieselbe Karte wie im Bewerberprofil und in der Moderation
 * des Videocalls.
 *
 * Das Präsentationsfenster (`fenster=1`): dieselbe Seite, nur die Folie,
 * für die Bildschirmfreigabe. Beim Kennenlernbogen reist die Bewerberkennung
 * mit, damit dort dieselben gefüllten Folien stehen wie in der Vorschau. Es
 * folgt der Moderation über den Kanal aus
 * `praesentationsKopplung.ts`: Die Moderation sendet bei jedem Wechsel den
 * ganzen Stand (Ablauf, Einstieg, Weg, Module, Folie), das Fenster springt
 * hin und meldet eigene Wechsel, die Reglerwerte des Rechners und den
 * Umschalter der Chaos-Folie zurück; die Vorschau spiegelt sie. Ohne Fenster
 * läuft die Moderation für sich weiter; wer die Leiste ausblendet, bekommt
 * die Folie groß im selben Fenster.
 *
 * PDF: Der vorhandene Weg `exportPraesentationAsPdf` (jsPDF, html2canvas,
 * Kopf- und Fußzeile im Hausstil) bekommt einen Stapel aller Folien des
 * gewählten Ablaufs und Wegs, jede als eigene Fläche in 1280 mal 720.
 *
 * Rechte: hinter dem PraesentationGuard (eingeloggt, interne Rolle) und
 * zusätzlich die Regel des Bewerbermanagements: Inhaber, Admin, HR.
 *
 * Zum Namen: Die Datei heißt aus ihrer Entstehung heraus noch
 * `PraesentationsUebung`, eine reine Übungsseite ist sie aber nicht mehr.
 * Im Alltag wird sie über „Moderation öffnen" im Bewerberprofil geöffnet,
 * also immer mit Bewerberkennung. Deshalb nennt die Leiste sie „Moderation"
 * und zeigt den Namen des Bewerbers; „Übungsansicht, blank ohne
 * Bewerberdaten" steht nur noch beim Aufruf ohne Kennung. Der Dateiname
 * bleibt absichtlich, eine Umbenennung wäre eine eigene Entscheidung.
 *
 * Zur Wegwahl: Ohne Kennung lassen sich alle fünf Wege durchblättern, wie
 * bisher. Mit Kennung hat der Bewerber genau einen, und die Moderation
 * öffnet auf ihm, sofern die Adresse keinen anderen nennt. Die übrigen vier
 * bleiben in der Leiste erreichbar, damit nichts wegfällt, tragen dort aber
 * keine Antworten, und die Zeile unter der Vorschau sagt das.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { confirmDialog } from "@/lib/confirm";
import { bewerberprofilUrl } from "@/lib/praesentationsKopplung";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, MonitorPlay, PanelLeftOpen,
  Wifi, WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { kannBewerberVerwalten } from "@/lib/bewerberRechte";
import { addNotizEntry, type Bewerber } from "@/lib/bewerbungStore";
import type { KennenlernenAntworten, WegId } from "@/lib/bewerberKennenlernen";
import { STRECKEN, type ModulId, type VideocallFolie } from "@/lib/bewerberVideocall";
import { formatPreis } from "@/lib/lizenzPakete";
import { getDeckFolie, type DeckTeil } from "@/lib/praesentationsDeck";
import { exportPraesentationAsPdf } from "@/lib/praesentationPdfExport";
import {
  PING_INTERVALL_MS, VERBINDUNG_TIMEOUT_MS, istVerbunden, oeffneKanal, type KopplungsNachricht,
} from "@/lib/praesentationsKopplung";
import {
  RECHNER_FOLIE_ID,
  bogenWeg,
  kennenlernFolien,
  kennenlernUebungsFolien,
  leererBewerber,
  leseUebungsStand,
  notizFolienBezug,
  notizMitBezug,
  standAusNachricht,
  standNachricht,
  uebungsFensterUrl,
  uebungsKanalKennung,
  uebungsQuery,
  uebungsSitzung,
  wegNummer,
  type UebungsArt,
  type UebungsStand,
} from "@/lib/praesentationsUebung";
import { usePraesentationsFavoriten } from "@/lib/praesentationsFavoriten";
import {
  Buehne, FolieRechner, baueFolien, useFolienKontext, type DeckEintrag, type FolienKontext,
} from "@/pages/ClosingPraesentationEntwurf";
import { BewerberVideocallBuehne } from "@/pages/BewerberVideocallPraesentation";
import { ErgaenzungAusTeil1, SkriptTeil1 } from "@/pages/ClosingModeration";
import { FolienImpuls, StreckenRegeln } from "@/pages/BewerberVideocallModeration";
import { ClosingDirektTeil } from "@/components/bewerbung/ClosingDirektTeil";
import type { FelderKontext } from "@/components/bewerbung/erstgespraechBausteine";
import { useBewerberAusCache } from "@/components/bewerbung/useBewerberAusCache";
import { useKennenlernenAntworten } from "@/components/bewerbung/useBewerberVideocall";
import { KennenlernbogenKarte } from "@/components/bewerbung/KennenlernbogenKarte";
import { UebungsLeiste, type UebungsZiel } from "@/components/bewerbung/UebungsLeiste";
// Liquid Glass fuer die Skriptkaesten der Moderation.
import "@/styles/praesentation-liquid.css";

/** Breite und Höhe, in der jede Folie für PDF und Vorschau gezeichnet wird. */
const DRUCK_BREITE = 1280;
const DRUCK_HOEHE = 720;

/** Was ein PDF enthalten soll: ein Ablauf, dazu Einstieg oder Weg. */
type DruckAuftrag = {
  art: UebungsArt;
  teil: DeckTeil;
  weg: WegId;
  module: ModulId[];
};

/** Die Folien eines Auftrags, in beiden Formen: alt (Deck) oder neu (Videocall). */
type FolienSatz =
  | { form: "deck"; folien: DeckEintrag[] }
  | { form: "videocall"; folien: VideocallFolie[] };

/**
 * Die Folien eines Auftrags. Beim Kennenlernbogen tragen sie die Antworten
 * des Bewerbers, sofern welche vorliegen und der Auftrag seinen Weg zeigt;
 * die Entscheidung darüber trifft `kennenlernFolien`.
 */
function baueFolienSatz(
  auftrag: DruckAuftrag,
  ctx: FolienKontext,
  antworten: KennenlernenAntworten | null = null,
): FolienSatz {
  if (auftrag.art === "kennenlernbogen") {
    return { form: "videocall", folien: kennenlernFolien(auftrag.weg, auftrag.module, antworten) };
  }
  if (auftrag.art === "rechner") {
    return {
      form: "deck",
      folien: [{ id: RECHNER_FOLIE_ID, titel: "Deine Zahlen", phase: "Rechner", inhalt: <FolieRechner ctx={ctx} /> }],
    };
  }
  return { form: "deck", folien: baueFolien(auftrag.teil, ctx) };
}

function folienIds(satz: FolienSatz): string[] {
  return satz.folien.map((f) => f.id);
}

/** Der Titel einer Folie, gleich welcher Form. */
function folienTitel(satz: FolienSatz, index: number): string {
  const f = satz.folien[index];
  if (!f) return "";
  return satz.form === "deck" ? (f as DeckEintrag).titel : (f as VideocallFolie).kopfzeile;
}

/**
 * Der Kontext der Folien: derselbe Hook wie in der Präsentation, für das
 * 22er-Deck des Vorabbogens ohne Bewerber (Standardsatz 4 Prozent, keine
 * Anrede). Die Folien des Kennenlernbogens gehen ihren eigenen Weg, sie
 * bekommen die Antworten des Bewerbers.
 *
 * Die Folienliste hängt an Ablauf, Einstieg, Weg, Modulen und den Antworten;
 * die Reglerwerte lesen die Inhalte beim Zeichnen ohnehin frisch, deshalb
 * stehen sie als Einzelwerte in den Abhängigkeiten.
 */
function useFolienSatz(
  stand: UebungsStand,
  antworten: KennenlernenAntworten | null = null,
): { ctx: FolienKontext; satz: FolienSatz; ids: string[] } {
  const ctx = useFolienKontext(null, "");
  const moduleSchluessel = stand.module.join(",");
  const satz = useMemo(
    () => baueFolienSatz({ art: stand.art, teil: stand.teil, weg: stand.weg, module: stand.module }, ctx, antworten),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stand.art, stand.teil, stand.weg, moduleSchluessel, antworten, ctx.abschluesse, ctx.kaufpreis, ctx.chaosMitMore],
  );
  const ids = useMemo(() => folienIds(satz), [satz]);
  return { ctx, satz, ids };
}

/** Die passende Bühne zur Form des Satzes. */
function FolienBuehne({
  satz, aktiv, eingebettet = false, onGeheZu,
}: {
  satz: FolienSatz;
  aktiv: number;
  eingebettet?: boolean;
  onGeheZu?: (index: number) => void;
}) {
  return satz.form === "deck"
    ? <Buehne folien={satz.folien} aktiv={aktiv} eingebettet={eingebettet} onGeheZu={onGeheZu} />
    : <BewerberVideocallBuehne folien={satz.folien} aktiv={aktiv} eingebettet={eingebettet} onGeheZu={onGeheZu} />;
}

/** Titel des PDFs und Dateiname, je Ablauf und Weg. */
function druckTitel(auftrag: DruckAuftrag): { titel: string; untertitel: string; datei: string } {
  if (auftrag.art === "rechner") {
    return {
      titel: "Der Rechner aus dem Vorabbogen",
      untertitel: "Deine Zahlen, eigenständig. Übungsfassung ohne Bewerberdaten.",
      datei: "OS-Immobilien_Rechner.pdf",
    };
  }
  if (auftrag.art === "kennenlernbogen") {
    const n = wegNummer(auftrag.weg);
    const strecke = STRECKEN.find((s) => s.weg === auftrag.weg);
    return {
      titel: `Kennenlernbogen, Weg ${n}`,
      untertitel: `${strecke?.label ?? ""}. Folien des Videocalls, Übungsfassung ohne Bewerberdaten.`,
      datei: `OS-Immobilien_Kennenlernbogen_Weg${n}.pdf`,
    };
  }
  return {
    titel: auftrag.teil === 2 ? "Vorabbogen, nur Teil 2" : "Vorabbogen, ab Teil 1",
    untertitel: "Folien des Bewerbergesprächs, Übungsfassung ohne Bewerberdaten.",
    datei: `OS-Immobilien_Vorabbogen_Teil${auftrag.teil === 2 ? "2" : "1"}.pdf`,
  };
}

/**
 * Der Stapel aller Folien für das PDF. Jede Folie ist eine eigene Fläche
 * mit fester Größe; die Bühne wird darin eingebettet, wie in der Vorschau
 * der Moderation. Einblendungen und Lichtflächen sind aus, denn html2canvas
 * kann weder Verzögerungen noch Weichzeichner; der Glanz im Titel wird zur
 * Akzentfarbe, weil Text mit Verlaufsfüllung im Bild sonst unsichtbar bliebe.
 */
function Druckstapel({ satz, stapelRef }: { satz: FolienSatz; stapelRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={stapelRef}
      data-druckstapel
      className="fixed inset-0 z-50 overflow-auto bg-[#070D1A]"
      aria-live="polite"
    >
      <style>{`
        [data-druckstapel] .animate-in { animation: none !important; opacity: 1 !important; transform: none !important; }
        [data-druckstapel] .cp-glanz { background: none !important; color: #1ED28D !important; -webkit-text-fill-color: #1ED28D; }
        [data-druckstapel] .cp-licht { display: none !important; }
        [data-druckstapel] header img { visibility: hidden; }
      `}</style>
      <div data-lg="kopfscheibe" className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2 text-sm text-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        PDF wird erstellt, {satz.folien.length} Folien. Das dauert einen Moment, bitte das Fenster offen lassen.
      </div>
      {satz.folien.map((f, i) => (
        <section
          key={f.id}
          data-druckseite
          id={`druck-${i}`}
          style={{ position: "relative", width: DRUCK_BREITE, height: DRUCK_HOEHE, overflow: "hidden" }}
        >
          <FolienBuehne satz={satz} aktiv={i} eingebettet />
        </section>
      ))}
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Die verkleinerte Vorschau der Folie in der Moderation: die echte Bühne in
 * 1280 mal 720, auf die verfügbare Breite skaliert. Anders als
 * `FolienVorschau` in der Moderation des Bewerbergesprächs ist sie bedienbar:
 * Die HR-Managerin schiebt die Regler des Rechners hier, und das
 * Präsentationsfenster zieht über den Kanal nach (und umgekehrt).
 */
function SkalierteVorschau({ satz, aktiv }: { satz: FolienSatz; aktiv: number }) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [massstab, setMassstab] = useState(0.3);
  useEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const messen = () => setMassstab(el.clientWidth / DRUCK_BREITE);
    messen();
    if (typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  return (
    <div
      ref={rahmen}
      className="relative w-full overflow-hidden rounded-lg border bg-[#070D1A]"
      style={{ aspectRatio: `${DRUCK_BREITE} / ${DRUCK_HOEHE}` }}
      aria-label={`Vorschau: ${folienTitel(satz, aktiv)}`}
      data-testid="uebungs-vorschau"
    >
      <div
        className="absolute left-0 top-0"
        style={{ width: DRUCK_BREITE, height: DRUCK_HOEHE, transform: `scale(${massstab})`, transformOrigin: "top left" }}
      >
        <FolienBuehne satz={satz} aktiv={aktiv} eingebettet />
      </div>
    </div>
  );
}

const nichts = () => { /* blank: nichts wird gespeichert */ };

/** Die Abschnittsüberschrift der Moderation, wie in der Leiste. */
function Abschnittstitel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/**
 * Der Skriptbereich zur gewählten Folie, blank.
 *
 * Vorabbogen und Rechner: dieselben Bausteine wie die Moderation des
 * Bewerbergesprächs, mit leeren Antworten, ohne Bewerber und nur zur
 * Ansicht (`canEdit` aus). Kennenlernbogen: Impuls und Streckenregeln aus
 * der Moderation des Videocalls.
 */
function UebungsSkript({
  stand, satz, aktiv, beraterName,
}: {
  stand: UebungsStand;
  satz: FolienSatz;
  aktiv: number;
  beraterName: string;
}) {
  const leererKontext = useMemo<FelderKontext>(
    () => ({ assessment: {}, setAssessment: nichts, canEdit: false, vorwissen: null }),
    [],
  );
  const blank = useMemo(() => leererBewerber(), []);

  if (satz.form === "videocall") {
    const folie = satz.folien[aktiv];
    if (!folie) return null;
    return (
      <div className="space-y-4" data-testid="uebungs-skript">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {folie.nummerText} · {folie.kicker} · {folie.kopfzeile}
          </p>
          <h2 className="text-lg font-semibold leading-tight">{folie.titel}</h2>
        </div>
        <FolienImpuls weg={stand.weg} bausteinId={folie.bausteinId} />
        <StreckenRegeln weg={stand.weg} />
      </div>
    );
  }

  const eintrag = satz.folien[aktiv];
  const deckFolie = eintrag ? getDeckFolie(eintrag.id) : null;
  if (!deckFolie) return null;
  return (
    <div className="space-y-4" data-testid="uebungs-skript">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Sprechtext und Felder wie in der Moderation, ohne Bewerberdaten. Die Felder zeigen, was das
        Skript abfragt; ausgefüllt wird hier nichts. Was du festhalten willst, kommt in die Notiz.
      </p>
      {deckFolie.teil === 1 ? (
        <SkriptTeil1 folie={deckFolie} ctx={leererKontext} vorname="" beraterName={beraterName} vorwissen={null} />
      ) : (
        <>
          <ClosingDirektTeil
            bewerber={blank}
            canEdit={false}
            daten={{}}
            onDatenChange={nichts}
            onRefresh={nichts}
            folieId={deckFolie.id}
          />
          {deckFolie.ergaenzung && (
            <ErgaenzungAusTeil1 ergaenzung={deckFolie.ergaenzung} keys={deckFolie.felder} ctx={leererKontext} />
          )}
        </>
      )}
    </div>
  );
}

/** Nur der Tag, für die Marke „ausgefüllt am" auf der Kennenlernbogen-Karte. */
function bogenDatum(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

function notizDatum(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Die Notizen zur laufenden Folie. Mit Bewerber landen sie in seinem
 * Notizenprotokoll (`addNotizEntry`), mit dem Folienbezug vorn im Text;
 * darunter stehen seine bisherigen Notizen. Ohne Bewerber bleibt das Feld
 * aus, denn es gäbe keinen Ort, an dem die Notiz bliebe.
 */
function UebungsNotizen({
  bewerberId, bewerber, geladen, bezug,
}: {
  bewerberId: string;
  bewerber: Bewerber | null;
  geladen: boolean;
  bezug: string;
}) {
  const { user } = useUser();
  const [text, setText] = useState("");
  const kannSpeichern = !!bewerber && text.trim() !== "";

  const speichern = () => {
    if (!bewerber || !kannSpeichern) return;
    void addNotizEntry(bewerber.id, notizMitBezug(bezug, text), user.name || "Unbekannt", user.moreId);
    setText("");
    toast({ title: "Notiz gespeichert", description: bezug });
  };

  const notizen = bewerber
    ? [...(bewerber.notizenLog || [])].sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
    : [];

  const hinweis = !bewerberId
    ? "Notizen brauchen einen Bewerber. Öffne die Moderation aus einem Bewerberprofil, dann landen sie dort im Notizenprotokoll."
    : !bewerber
      ? (geladen ? "Bewerber nicht gefunden. Öffne die Moderation noch einmal aus dem Bewerberprofil." : "Bewerber wird geladen.")
      : "";

  return (
    <section className="space-y-2" data-testid="uebungs-notizen">
      <div className="flex items-baseline justify-between gap-2">
        <Abschnittstitel>Notizen</Abschnittstitel>
        {bewerber && <span className="truncate text-[10px] text-muted-foreground">{bezug}</span>}
      </div>
      {hinweis && <p className="text-[11px] leading-snug text-muted-foreground">{hinweis}</p>}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); speichern(); }
        }}
        disabled={!bewerber}
        placeholder={bewerber ? "Was dir zu dieser Folie auffällt. Der Folienbezug kommt von selbst dazu." : "Ohne Bewerber keine Notiz."}
        aria-label="Notiz zur Folie"
        className="min-h-[6rem] resize-y text-xs leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{bewerber ? "Strg oder Cmd und Enter speichert." : ""}</span>
        <Button size="sm" onClick={speichern} disabled={!kannSpeichern} data-testid="notiz-speichern">
          Notiz speichern
        </Button>
      </div>
      {notizen.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t pt-2" data-testid="uebungs-notizliste">
          {notizen.map((n) => (
            <li key={n.id} className="text-xs">
              <p className="text-[10px] text-muted-foreground">{notizDatum(n.datum)} · {n.autor}</p>
              <p className="whitespace-pre-wrap leading-snug">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Das Präsentationsfenster: nur die Folie, bedienbar, für die
 * Bildschirmfreigabe. Es folgt der Moderation über den Kanal und meldet
 * eigene Wechsel, Regler und Umschalter zurück.
 *
 * Vom Bewerber kennt es genau eines: seine Antworten aus dem
 * Kennenlernbogen, damit die geteilten Folien dieselben sind wie in der
 * Vorschau der Moderation. Sein Name steht hier nirgends, und in den Stand
 * (`stand.bewerberId`) kommt die Kennung nicht, denn über den Kanal reist
 * sie nie.
 */
function UebungsFenster({
  start, sitzung, bewerberId,
}: {
  start: UebungsStand;
  sitzung: string;
  bewerberId: string;
}) {
  const [stand, setStand] = useState<UebungsStand>(start);
  const { antworten } = useKennenlernenAntworten(bewerberId);
  const { ctx, satz, ids } = useFolienSatz(stand, antworten);
  const aktiv = Math.max(0, ids.indexOf(stand.folieId));
  const aktivId = ids[aktiv] ?? "";

  const geheZu = useCallback((index: number) => {
    if (ids.length === 0) return;
    const ziel = Math.min(Math.max(index, 0), ids.length - 1);
    setStand((s) => ({ ...s, folieId: ids[ziel] }));
  }, [ids]);

  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.isContentEditable)) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv - 1);
      } else if (e.key === "Home") {
        geheZu(0);
      } else if (e.key === "End") {
        geheZu(ids.length - 1);
      }
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [aktiv, ids.length, geheZu]);

  // ── Kopplung: die Moderation führt, dieses Fenster folgt ──
  const kanal = useMemo(() => oeffneKanal(uebungsKanalKennung(sitzung)), [sitzung]);
  useEffect(() => () => kanal?.schliessen(), [kanal]);
  // Der aktuelle Stand von Reglern und Umschalter, damit eine neu geöffnete
  // Moderation ihn beim ersten Lebenszeichen bekommt.
  const reglerRef = useRef({ abschluesse: ctx.abschluesse, kaufpreis: ctx.kaufpreis, chaosMitMore: ctx.chaosMitMore });
  reglerRef.current = { abschluesse: ctx.abschluesse, kaufpreis: ctx.kaufpreis, chaosMitMore: ctx.chaosMitMore };
  const letzterPingRef = useRef(0);
  const { setAbschluesse, setKaufpreis, setChaosMitMore } = ctx;
  useEffect(() => {
    if (!kanal) return;
    const abmelden = kanal.empfangen((n: KopplungsNachricht) => {
      if (n.typ === "stand") {
        setStand(standAusNachricht(n));
      } else if (n.typ === "regler") {
        // Die Moderation hat in ihrer Vorschau geschoben.
        setAbschluesse(n.abschluesse);
        setKaufpreis(n.kaufpreis);
      } else if (n.typ === "umschalter") {
        if (n.id === "chaos") setChaosMitMore(n.an);
      } else if (n.typ === "ping") {
        kanal.senden({ typ: "pong" });
        const jetzt = Date.now();
        if (jetzt - letzterPingRef.current > VERBINDUNG_TIMEOUT_MS) {
          const r = reglerRef.current;
          kanal.senden({ typ: "regler", abschluesse: r.abschluesse, kaufpreis: r.kaufpreis });
          kanal.senden({ typ: "umschalter", id: "chaos", an: r.chaosMitMore });
        }
        letzterPingRef.current = jetzt;
      }
    });
    // Handschlag beim Öffnen: Wo steht die Moderation gerade?
    kanal.senden({ typ: "anfrage" });
    return abmelden;
  }, [kanal, setAbschluesse, setKaufpreis, setChaosMitMore]);
  useEffect(() => {
    if (kanal && aktivId) kanal.senden({ typ: "folie", folieId: aktivId });
  }, [kanal, aktivId]);
  useEffect(() => {
    if (kanal) kanal.senden({ typ: "regler", abschluesse: ctx.abschluesse, kaufpreis: ctx.kaufpreis });
  }, [kanal, ctx.abschluesse, ctx.kaufpreis]);
  useEffect(() => {
    if (kanal) kanal.senden({ typ: "umschalter", id: "chaos", an: ctx.chaosMitMore });
  }, [kanal, ctx.chaosMitMore]);

  return (
    <div data-testid="uebungs-fenster">
      <FolienBuehne satz={satz} aktiv={aktiv} onGeheZu={geheZu} />
    </div>
  );
}

function UebungInhalt({
  stand, onStand, wegInAdresse,
}: {
  stand: UebungsStand;
  onStand: (neu: UebungsStand) => void;
  /** Ob die Adresse einen Weg nennt. Siehe `PraesentationsUebung` unten. */
  wegInAdresse: boolean;
}) {
  const { user } = useUser();

  // Der Bewerber für die Kopfzeile und die Notizen.
  const { bewerber, geladen } = useBewerberAusCache(stand.bewerberId);
  const bewerberName = bewerber ? [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") : "";

  // Seine Antworten aus dem Kennenlernbogen. Sie tun zweierlei: Sie stehen
  // zum Nachschlagen zugeklappt unter den Notizen, und sie füllen die Folien
  // des Kennenlernbogens. Dieselbe Quelle wie im Reiter Videocall und in der
  // Moderation des Videocalls; ohne Bewerberkennung fragt der Hook gar nicht
  // erst nach.
  const { antworten: kennenlernAntworten, eingereichtAm, geladen: bogenGeladen } =
    useKennenlernenAntworten(stand.bewerberId);
  /** Der Weg, den er im Bogen gewählt hat. Null ohne Bogen. */
  const seinWeg = useMemo(() => bogenWeg(kennenlernAntworten), [kennenlernAntworten]);

  const { ctx, satz, ids } = useFolienSatz(stand, kennenlernAntworten);
  const aktiv = Math.max(0, ids.indexOf(stand.folieId));
  const aktivId = ids[aktiv] ?? "";
  const aktuellerTitel = folienTitel(satz, aktiv);
  const nummern = useMemo(() => Object.fromEntries(ids.map((id, i) => [id, i + 1])), [ids]);

  const { favoriten, istFavorit, umschalten } = usePraesentationsFavoriten();
  const [leisteOffen, setLeisteOffen] = useState(true);

  const geheZu = useCallback((index: number) => {
    if (ids.length === 0) return;
    const ziel = Math.min(Math.max(index, 0), ids.length - 1);
    onStand({ ...stand, folieId: ids[ziel] });
  }, [ids, stand, onStand]);

  const aufZiel = useCallback((ziel: UebungsZiel) => {
    const gleicheArt = ziel.art === stand.art;
    onStand({
      art: ziel.art,
      teil: ziel.teil ?? (gleicheArt ? stand.teil : 1),
      weg: ziel.weg ?? (gleicheArt ? stand.weg : "weg1"),
      module: ziel.module ?? (gleicheArt && ziel.weg === stand.weg ? stand.module : []),
      folieId: ziel.folieId ?? (gleicheArt && ziel.weg === stand.weg ? stand.folieId : ""),
      bewerberId: stand.bewerberId,
    });
  }, [stand, onStand]);

  /*
    Einmal beim Öffnen: auf seinen Weg springen.

    Der Knopf „Moderation öffnen" nennt keinen Weg, und ohne Weg fällt die
    Adresse auf Weg 1 zurück. Ein Bewerber hat aber genau einen Weg, und auf
    einem fremden trägt keine Folie seine Antworten. Deshalb rückt die
    Moderation, sobald sein Bogen da ist, auf seinen Weg. Wer selbst einen Weg
    in der Adresse mitgibt oder in der Leiste einen anderen anklickt, bleibt
    dort: Der Merker sorgt dafür, dass das genau einmal geschieht.
  */
  const wegGesetztRef = useRef(false);
  useEffect(() => {
    if (wegGesetztRef.current || wegInAdresse) return;
    if (stand.art !== "kennenlernbogen" || !seinWeg) return;
    wegGesetztRef.current = true;
    if (seinWeg !== stand.weg) onStand({ ...stand, weg: seinWeg, module: [], folieId: "" });
  }, [wegInAdresse, seinWeg, stand, onStand]);

  // Pfeiltasten wie in der Präsentation, nie mitten in einer Eingabe (die
  // Regler des Rechners und das Notizfeld behalten ihre Tasten).
  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel?.closest?.('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]')) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        geheZu(aktiv - 1);
      } else if (e.key === "Home") {
        geheZu(0);
      } else if (e.key === "End") {
        geheZu(ids.length - 1);
      }
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [aktiv, ids.length, geheZu]);

  // ── Kopplung mit dem Präsentationsfenster ──
  const sitzung = useMemo(() => uebungsSitzung(), []);
  const kanal = useMemo(() => oeffneKanal(uebungsKanalKennung(sitzung)), [sitzung]);
  useEffect(() => () => kanal?.schliessen(), [kanal]);
  const [lebenszeichen, setLebenszeichen] = useState<number | null>(null);
  const [verbunden, setVerbunden] = useState(false);
  const navigate = useNavigate();

  /*
    Der Rueckweg ins Bewerberprofil.

    Die Mitschrift ist nicht in Gefahr, sie wird laufend gespeichert. In
    Gefahr ist nur die Kopplung: Haengt die Praesentation an diesem Fenster,
    bleibt sie beim Verlassen auf der aktuellen Folie stehen und folgt nicht
    mehr. Nur dann wird gefragt, sonst geht es ohne Ruecksprache. Eine
    Rueckfrage, die immer kommt, klickt man nach zwei Tagen blind weg.
  */
  const zurueckGehen = async () => {
    if (!stand.bewerberId) return;
    if (verbunden) {
      const weiter = await confirmDialog({
        title: "Die Präsentation läuft noch",
        description:
          "Das geteilte Fenster bleibt offen, folgt dir aber nicht mehr. "
          + "Es bleibt auf der Folie stehen, die gerade zu sehen ist.",
        confirmText: "Zurück zum Bewerberprofil",
        cancelText: "Im Gespräch bleiben",
      });
      if (!weiter) return;
    }
    navigate(bewerberprofilUrl(stand.bewerberId));
  };
  // Der Empfänger braucht immer den aktuellen Stand, ohne sich bei jedem
  // Wechsel neu anzumelden.
  const standRef = useRef({ stand, ids, aktivId, onStand });
  standRef.current = { stand, ids, aktivId, onStand };
  const { setAbschluesse, setKaufpreis, setChaosMitMore } = ctx;
  useEffect(() => {
    if (!kanal) return;
    return kanal.empfangen((n: KopplungsNachricht) => {
      setLebenszeichen(Date.now());
      const s = standRef.current;
      if (n.typ === "folie") {
        // Das Fenster hat selbst geblättert: mitgehen, wenn die Folie hier vorkommt.
        if (n.folieId !== s.aktivId && s.ids.includes(n.folieId)) s.onStand({ ...s.stand, folieId: n.folieId });
      } else if (n.typ === "regler") {
        setAbschluesse(n.abschluesse);
        setKaufpreis(n.kaufpreis);
      } else if (n.typ === "umschalter") {
        if (n.id === "chaos") setChaosMitMore(n.an);
      } else if (n.typ === "anfrage") {
        kanal.senden(standNachricht({ ...s.stand, folieId: s.aktivId }));
      }
    });
  }, [kanal, setAbschluesse, setKaufpreis, setChaosMitMore]);
  // Jeder Wechsel von Ablauf, Einstieg, Weg, Modulen oder Folie geht als
  // ganzer Stand ans Fenster.
  const moduleSchluessel = stand.module.join(",");
  useEffect(() => {
    if (kanal) kanal.senden(standNachricht({ ...stand, folieId: aktivId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanal, stand.art, stand.teil, stand.weg, moduleSchluessel, aktivId]);
  // Regler und Umschalter laufen in beide Richtungen: Wer in der Vorschau
  // schiebt, sieht es im Präsentationsfenster, und umgekehrt. Ein Echo
  // verläuft sich, weil derselbe Wert keinen neuen Zustand erzeugt.
  useEffect(() => {
    if (kanal) kanal.senden({ typ: "regler", abschluesse: ctx.abschluesse, kaufpreis: ctx.kaufpreis });
  }, [kanal, ctx.abschluesse, ctx.kaufpreis]);
  useEffect(() => {
    if (kanal) kanal.senden({ typ: "umschalter", id: "chaos", an: ctx.chaosMitMore });
  }, [kanal, ctx.chaosMitMore]);
  useEffect(() => {
    if (!kanal) return;
    const t = setInterval(() => kanal.senden({ typ: "ping" }), PING_INTERVALL_MS);
    return () => clearInterval(t);
  }, [kanal]);
  useEffect(() => {
    const t = setInterval(() => setVerbunden(istVerbunden(lebenszeichen, Date.now())), 1000);
    setVerbunden(istVerbunden(lebenszeichen, Date.now()));
    return () => clearInterval(t);
  }, [lebenszeichen]);

  const fensterOeffnen = () => {
    window.open(uebungsFensterUrl({ ...stand, folieId: aktivId }, sitzung), "_blank", "noopener,noreferrer");
  };

  // ── PDF ──
  // Absichtlich ohne seine Antworten: Das PDF wird gespeichert und
  // weitergegeben, und sein Untertitel sagt seit jeher „Übungsfassung ohne
  // Bewerberdaten". Ein PDF mit den Angaben eines Bewerbers wäre eine eigene
  // Entscheidung und nicht der Nebeneffekt dieser Änderung.
  const [druck, setDruck] = useState<DruckAuftrag | null>(null);
  const druckSatz = useMemo(() => (druck ? baueFolienSatz(druck, ctx) : null), [druck]); // eslint-disable-line react-hooks/exhaustive-deps
  const stapelRef = useRef<HTMLDivElement>(null);
  const laeuftRef = useRef(false);
  useEffect(() => {
    if (!druck || laeuftRef.current) return;
    laeuftRef.current = true;
    const auftrag = druck;
    void (async () => {
      try {
        // Die Hochlauf-Zahlen brauchen gut eine Sekunde bis zum Endwert.
        await sleep(1600);
        const root = stapelRef.current;
        if (!root) throw new Error("Der Folienstapel ist nicht da.");
        const { titel, untertitel, datei } = druckTitel(auftrag);
        await exportPraesentationAsPdf({
          root,
          title: titel,
          subtitle: untertitel,
          filename: datei,
          sectionSelector: "section[data-druckseite]",
          animationSettleMs: 300,
          hinweisSeiten: false,
        });
        toast({ title: "PDF gespeichert", description: `${titel}, ${datei}` });
      } catch (e) {
        console.error("Übungsansicht: PDF fehlgeschlagen", e);
        toast({ title: "Das PDF ließ sich nicht erstellen", description: "Bitte noch einmal versuchen.", variant: "destructive" });
      } finally {
        laeuftRef.current = false;
        setDruck(null);
      }
    })();
  }, [druck]);

  const druckAuftraege = useMemo(() => {
    const liste: { gruppe: string; label: string; auftrag: DruckAuftrag }[] = [];
    liste.push({ gruppe: "Alter Vorabbogen", label: "Ab Teil 1, 22 Folien", auftrag: { art: "vorabbogen", teil: 1, weg: "weg1", module: [] } });
    liste.push({ gruppe: "Alter Vorabbogen", label: "Nur Teil 2, 15 Folien", auftrag: { art: "vorabbogen", teil: 2, weg: "weg1", module: [] } });
    for (const s of STRECKEN) {
      const module = s.weg === stand.weg ? stand.module : [];
      const anzahl = kennenlernUebungsFolien(s.weg, module).length;
      const zusatz = module.length > 0 ? ", mit den zugeschalteten Modulen" : "";
      liste.push({
        gruppe: "Aktueller Kennenlernbogen",
        label: `Weg ${wegNummer(s.weg)}, ${anzahl} Folien${zusatz}`,
        auftrag: { art: "kennenlernbogen", teil: 1, weg: s.weg, module },
      });
    }
    liste.push({ gruppe: "Rechner", label: "Nur der Rechner, 1 Folie", auftrag: { art: "rechner", teil: 1, weg: "weg1", module: [] } });
    return liste;
  }, [stand.weg, stand.module]);

  const titelZeile = stand.art === "rechner"
    ? "Rechner, eigenständig"
    : stand.art === "vorabbogen"
      ? `Vorabbogen · ${stand.teil === 2 ? "Nur Teil 2" : "Ab Teil 1"}`
      : `Kennenlernbogen · Weg ${wegNummer(stand.weg)}`;
  const bezug = notizFolienBezug(stand, aktiv + 1, aktuellerTitel);
  // Die Reglerzeile zeigt den gemeinsamen Stand, egal wer zuletzt geschoben hat.
  const zeigtRegler = ["rechner", "zwei-wege", "preis"].includes(aktivId);

  /*
    Was auf den Folien steht, in einem Satz.

    Ohne diese Zeile sähe man einer Folie nicht an, ob sie blank ist, weil der
    Bogen fehlt, oder weil gerade ein fremder Weg offen ist. Genau dieses
    Nichtwissen hat fünf Tage lang niemandem auffallen lassen, dass die
    Antworten überhaupt nicht ankamen. Solange der Bogen noch lädt, steht hier
    nichts, damit nicht kurz das Gegenteil dasteht.
  */
  const antwortStand = (() => {
    if (stand.art !== "kennenlernbogen" || !stand.bewerberId || !bogenGeladen) return "";
    if (!kennenlernAntworten || !seinWeg) {
      return "Kein eingereichter Kennenlernbogen. Die Folien bleiben blank, bis seine Antworten da sind.";
    }
    if (seinWeg !== stand.weg) {
      return `Weg ${wegNummer(stand.weg)} ist nicht sein Weg. Sein Bogen steht auf Weg ${wegNummer(seinWeg)};`
        + " dort tragen die Folien seine Antworten, hier bleiben sie blank.";
    }
    return "Auf den Folien stehen seine Antworten aus dem Kennenlernbogen.";
  })();

  return (
    <div data-lg="seite" className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {leisteOffen && (
        <UebungsLeiste
          stand={{ ...stand, folieId: aktivId }}
          nummern={nummern}
          favoriten={favoriten}
          bewerberName={bewerberName}
          seinWeg={seinWeg}
          istFavorit={istFavorit}
          onFavorit={umschalten}
          onZiel={aufZiel}
          onEinklappen={() => setLeisteOffen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {leisteOffen && (
          <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2" data-testid="uebungs-kopf">
            {/*
              Der Weg zurueck steht ganz vorn, wie in der Moderation, im
              Notaraufnahmebogen und in der Reservierungsvereinbarung. Diese
              Ansicht geht in einem eigenen Tab auf, deshalb eine richtige
              Navigation und kein Schliessen des Fensters: Der Tab wurde ueber
              einen Link mit `rel="noopener"` geoeffnet und hat damit kein
              `window.opener`, ein Skript duerfte ihn also gar nicht schliessen.
            */}
            {stand.bewerberId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={zurueckGehen}
                className="-ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                data-testid="uebung-zurueck"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zum Bewerberprofil
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                Moderation · {titelZeile}{bewerberName ? ` · ${bewerberName}` : ""}
              </p>
              <p className="truncate text-sm font-semibold">
                Folie {ids.length ? aktiv + 1 : 0} / {ids.length}{aktuellerTitel ? ` · ${aktuellerTitel}` : ""}
              </p>
            </div>
            <Badge variant={verbunden ? "default" : "outline"} className="gap-1 font-normal" data-testid="uebungs-verbindung">
              {verbunden ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
              {verbunden ? "Präsentation verbunden" : "Präsentation nicht verbunden"}
            </Badge>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={fensterOeffnen} data-testid="fenster-oeffnen">
              <MonitorPlay className="h-3.5 w-3.5" aria-hidden /> Präsentation öffnen (Bildschirmfreigabe)
              <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!!druck} data-testid="pdf-menue">
                  {druck ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                  Als PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {druckAuftraege.map((d, i) => {
                  const neueGruppe = i === 0 || druckAuftraege[i - 1].gruppe !== d.gruppe;
                  return (
                    <div key={`${d.auftrag.art}-${d.auftrag.teil}-${d.auftrag.weg}`}>
                      {neueGruppe && (
                        <>
                          {i > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.gruppe}</DropdownMenuLabel>
                        </>
                      )}
                      <DropdownMenuItem onSelect={() => setDruck(d.auftrag)}>{d.label}</DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => geheZu(aktiv - 1)} disabled={aktiv === 0} aria-label="Zurück">
              <ChevronLeft className="h-4 w-4" /> Zurück
            </Button>
            <Button size="sm" onClick={() => geheZu(aktiv + 1)} disabled={aktiv >= ids.length - 1} aria-label="Weiter">
              Weiter <ChevronRight className="h-4 w-4" />
            </Button>
          </header>
        )}

        {leisteOffen ? (
          <main className="min-h-0 flex-1 overflow-y-auto" data-testid="uebungs-moderation" data-praesentation="moderation">
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {/* Links: Vorschau, Stand der Kopplung, Notizen. Bleibt beim
                  Scrollen des Skripts stehen. */}
              <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <section className="space-y-2">
                  <Abschnittstitel>Vorschau</Abschnittstitel>
                  <SkalierteVorschau satz={satz} aktiv={aktiv} />
                </section>
                {antwortStand && (
                  <p className="text-[11px] leading-snug text-muted-foreground" data-testid="uebungs-antwortstand">
                    {antwortStand}
                  </p>
                )}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {verbunden
                    ? "Das Präsentationsfenster zeigt dieselbe Folie. Im Videocall nur dieses Fenster teilen; Regler und Umschalter kannst du hier in der Vorschau oder dort bedienen, beide Seiten ziehen nach; die Vorschau spiegelt sie."
                    : "Kein Präsentationsfenster verbunden. Für die Bildschirmfreigabe die Präsentation öffnen und im Videocall nur dieses Fenster teilen. Ohne Fenster läuft die Moderation für sich; die Leiste ausblenden zeigt die Folie groß."}
                </p>
                {zeigtRegler && (
                  <p className="text-[11px] leading-snug" data-testid="uebungs-regler">
                    Regler: <strong>{ctx.abschluesse}</strong> Abschlüsse pro Monat,
                    Kaufpreis <strong>{formatPreis(ctx.kaufpreis)}</strong>.
                  </p>
                )}
                <UebungsNotizen bewerberId={stand.bewerberId} bewerber={bewerber} geladen={geladen} bezug={bezug} />
              </div>

              {/* Rechts: das Skript zur Folie. Ohne eigenen Rahmen, denn die
                  Skriptbausteine bringen ihre Rahmen selbst mit. */}
              <section className="min-w-0 space-y-3">
                <Abschnittstitel>Skript</Abschnittstitel>
                <UebungsSkript stand={stand} satz={satz} aktiv={aktiv} beraterName={user.name} />
              </section>

              {/* Seine Antworten aus dem Kennenlernbogen, unter den Notizen und
                  zugeklappt. Dieselbe Karte wie im Reiter Videocall und in der
                  Moderation des Videocalls, damit alle drei Stellen gleich
                  aussehen und eine später ergänzte Frage überall mitkommt.
                  Über beide Spalten, weil die Karte ihre Antworten in drei
                  Spalten legt und in der schmalen linken Spalte sonst
                  umbrechen würde. Weil sie ihren Aufklappzustand selbst hält
                  und beim Folienwechsel nicht neu entsteht, bleibt sie offen,
                  wenn sie einmal offen war. Ohne Bewerberkennung fällt sie
                  ganz weg: Dann läuft die Ansicht blank, es gäbe nichts zu
                  zeigen. Liegt kein Bogen vor, sagt das die Karte selbst; bis
                  die Antwort da ist, bleibt die Stelle leer, damit nicht kurz
                  das Gegenteil dasteht. */}
              {stand.bewerberId && bogenGeladen && (
                <div className="lg:col-span-2" data-testid="uebungs-kennenlernbogen">
                  <KennenlernbogenKarte
                    antworten={kennenlernAntworten}
                    ausgefuelltAm={bogenDatum(eingereichtAm)}
                    aufklappbar
                    offenZuBeginn={false}
                  />
                </div>
              )}
            </div>
          </main>
        ) : (
          <main className="relative min-h-0 flex-1 bg-[#070D1A]" data-testid="uebungs-buehne">
            <FolienBuehne satz={satz} aktiv={aktiv} eingebettet />
            {/* Klein und halb durchsichtig, damit es in der Freigabe kaum auffällt. */}
            <button
              type="button"
              onClick={() => setLeisteOffen(true)}
              aria-label="Leiste einblenden"
              title="Leiste einblenden"
              className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-1.5 text-white/60 opacity-40 transition hover:opacity-100"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          </main>
        )}
      </div>

      {druck && druckSatz && <Druckstapel satz={druckSatz} stapelRef={stapelRef} />}
    </div>
  );
}

export default function PraesentationsUebung() {
  const { user } = useUser();
  const [params, setParams] = useSearchParams();
  const stand = useMemo(() => leseUebungsStand(params), [params]);
  const fenster = params.get("fenster") === "1";
  const kanalSitzung = (params.get("kanal") ?? "").trim();
  /*
    Ob die Adresse beim Öffnen einen Weg genannt hat.

    `leseUebungsStand` fällt sonst auf Weg 1 zurück, und dem Stand sieht man
    danach nicht mehr an, ob jemand Weg 1 gewählt hat oder ob nur nichts
    dastand. Genau das braucht die Moderation aber: Ohne genannten Weg springt
    sie auf den Weg des Bewerbers, mit genanntem bleibt sie, wo sie hingeschickt
    wurde.

    Bewusst nur beim ersten Aufbau gelesen. Die Seite schreibt den Weg gleich
    beim ersten Klick selbst in die Adresse; würde der Wert danach neu gelesen,
    hielte sich die Ansicht selbst für hingeschickt und käme nie mehr auf
    seinen Weg. Genau das wäre der Fall, wenn die Moderation aus dem alten
    Erstgespräch heraus beim Vorabbogen startet und erst danach auf den
    Kennenlernbogen umgeschaltet wird.
  */
  const [wegInAdresse] = useState(() => (params.get("weg") ?? "").trim() !== "");
  const onStand = useCallback(
    (neu: UebungsStand) => setParams(new URLSearchParams(uebungsQuery(neu)), { replace: true }),
    [setParams],
  );

  // Dieselbe Regel wie bei der Moderation: Inhaber, Admin, HR.
  if (!kannBewerberVerwalten(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Das Präsentationsfenster wird geteilt, deshalb bleibt der Bewerber aus
  // seinem Stand heraus: Sein Name soll dort nirgends stehen. Die Kennung
  // reicht es getrennt weiter, allein um seine Antworten auf die Folien des
  // Kennenlernbogens zu holen.
  if (fenster) {
    return (
      <UebungsFenster
        start={{ ...stand, bewerberId: "" }}
        sitzung={kanalSitzung}
        bewerberId={stand.bewerberId}
      />
    );
  }

  return <UebungInhalt stand={stand} onStand={onStand} wegInAdresse={wegInAdresse} />;
}
