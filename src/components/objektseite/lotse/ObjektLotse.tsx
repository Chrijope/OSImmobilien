import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/contexts/UserContext";
import { ersterVorname } from "@/lib/kennenlerntermin";
import { cn } from "@/lib/utils";
import {
  bereiteLotseVor,
  frageLotse,
  frageMitKundendaten,
  frageMitKundennamen,
  ladeVerlauf,
  ladeZustimmung,
  LOTSE_KUNDENDATEN_TEXT,
  LOTSE_KUNDENNAME_TEXT,
  lotseVorschlaege,
  speichereZustimmung,
  trenneQuellen,
  type LotseKalkulation,
  type LotseNachricht,
  type LotseStufe,
} from "@/lib/lotseStore";
import { kalkulationErklaerung, kalkulationsQuelle } from "@/lib/lotseKalkulationErklaerung";
import { KalkulationQuelleChip } from "./KalkulationErklaerung";
import { LotseHinweis } from "./LotseHinweis";
import { LotseSymbol } from "./LotseSymbol";
import { festeZahlenEinheit, HAUSGELD_GESAMT, RUECKLAGE } from "../../../../supabase/functions/_shared/lotse-feste-zahlen";

/**
 * Der OS Lotse: KI-Chat zu einer Einheit und ihrem Objekt (Stufe 1,
 * freigegeben am 28.09.2026).
 *
 * Geschnitten für zwei Orte: heute als Reiter der Einheitenseite, später
 * (Stufe 2) im Seitenfenster der Objektseite. Deshalb nur `objektId`, eine
 * optionale `wohnungId`, die Beschriftung und die Kalkulation als Eingang.
 *
 * Wer ihn sieht, entscheidet die Seite (`darfLotseNutzen`), wer ihn nutzen
 * darf, entscheidet die Function `objekt-lotse`. Den Datenweg kapselt
 * `src/lib/lotseStore.ts`.
 */
export interface ObjektLotseProps {
  objektId: string;
  wohnungId?: string | null;
  /** Wofür der Lotse gerade da ist, etwa „Wohnung 9, Friesenstraße 57“. */
  bezeichnung: string;
  /** Die Zahlen der Investmentkalkulation, siehe `kalkulationFuerLotse`. */
  kalkulation: LotseKalkulation | null;
  /** Vermietungsstand der Einheit. Nur bei `false` (leer) tritt die Lagefrage an die Stelle der Mietfrage. */
  vermietet?: boolean | null;
  /** `meta` der Einheit, nur für die Begrüßung: Nennt sie Rücklage und Hausgeld gesamt, wenn erfasst. */
  einheitMeta?: unknown;
  className?: string;
}

type Stand = "laedt" | "bereit" | "migration" | "fehler";

function datum(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? new Date().toLocaleDateString("de-DE")
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Die erste Nachricht des Lotsen. Sie entsteht nur hier im Browser, wird
 * nicht gespeichert und geht nicht an die KI. „Laden...“ und „Nutzer“ sind
 * die Platzhalter aus dem UserContext, solange kein Profilname da ist.
 */
export function lotseBegruessung(name: string, mitEinheit: boolean, einheitMeta?: unknown): string {
  const vorname = name === "Laden..." || name === "Nutzer" ? "" : ersterVorname(name);
  // Dieselbe Rechnung wie im Prompt: Nur was erfasst ist, wird genannt (05.10.2026).
  const fest = festeZahlenEinheit(einheitMeta).werte;
  const hausgeld = [
    HAUSGELD_GESAMT in fest ? "das Hausgeld gesamt" : "",
    "das nicht umlagefähige Hausgeld",
    RUECKLAGE in fest ? "die Rücklage" : "",
  ].filter(Boolean);
  const hausgeldText = hausgeld.length > 2 ? `${hausgeld.slice(0, -1).join(", ")} und ${hausgeld[hausgeld.length - 1]}` : hausgeld.join(" und ");
  return `Hallo${vorname ? ` ${vorname}` : ""},

ich kenne ${mitEinheit ? "diese Wohnung und das Haus" : "dieses Objekt und seine Einheiten"}: Kaufpreis, Fläche, Miete und Vermietungsstand, ${hausgeldText}, die Verwaltungskosten, Baujahr, Energieklasse und Sanierungen, deine aktuelle Investmentkalkulation, die gemessene Lage mit den Wegen zu Bus, Bahn, Einkauf und Schulen und die freigegebenen Unterlagen. Mietverträge und Grundbuch lese ich nur als Faktenauszug ohne Namen.

Frag mich alles, was du wissen willst. Ich antworte mit Quelle und Stand, und wenn etwas nicht vorliegt, sage ich dir das. Zu Provisionen und zu einzelnen Kunden gebe ich keine Auskunft.`;
}

/** Das kleine „KI“-Abzeichen an Reiter und Chatkopf. */
export function KiMarke() {
  return (
    <span className="rounded-md bg-gradient-to-r from-[#197C56] to-[#7b5cf0] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
      KI
    </span>
  );
}

const STUFEN_TEXT: Record<LotseStufe, string> = {
  liest: "Der Lotse liest die Objektdaten …",
  unterlagen: "Der Lotse wertet eine neue Unterlage aus …",
  formuliert: "Der Lotse formuliert die Antwort …",
};

/** Bis der erste geprüfte Block da ist: Symbol in Bewegung, die Stufe und Punkte. */
function Denkt({ stufe }: { stufe: LotseStufe }) {
  return (
    <div className="flex max-w-[92%] items-end gap-2 sm:max-w-[85%]" role="status" data-testid="lotse-denkt">
      <LotseSymbol className="h-7 w-7" />
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border/60 bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
        {STUFEN_TEXT[stufe]}
        <span className="inline-flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

function Antwort({ inhalt, stand, begruessung = false, kalkulation = null, laufend = false, unvollstaendig = false }: {
  inhalt: string;
  stand?: string;
  begruessung?: boolean;
  kalkulation?: LotseKalkulation | null;
  /** Die Blöcke kommen noch. */
  laufend?: boolean;
  unvollstaendig?: boolean;
}) {
  const { text, quellen } = trenneQuellen(inhalt);
  const erklaerung = kalkulationErklaerung(kalkulation);
  return (
    <div className="flex max-w-[92%] items-end gap-2 sm:max-w-[85%]">
      <LotseSymbol ruhig className="h-7 w-7" />
      <div className="min-w-0 rounded-2xl rounded-bl-md border border-border/60 bg-background px-3.5 py-2.5 text-sm leading-relaxed">
        <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
        {quellen.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="lotse-quellen">
            {quellen.map((q) => (
              // Die Erklärung nur mit der Kalkulation, mit der die Antwort erfragt wurde, und passenden Annahmen.
              erklaerung && kalkulationsQuelle(q) === kalkulation?.annahmen ? (
                <KalkulationQuelleChip key={q} quelle={q} erklaerung={erklaerung} />
              ) : (
                <span
                  key={q}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    /^fehlt\b/i.test(q)
                      ? "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-foreground"
                      : "border-primary/20 bg-primary/5 text-primary",
                  )}
                >
                  {q}
                </span>
              )
            ))}
          </div>
        )}
        {laufend && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="lotse-laeuft">
            <Loader2 className="h-3 w-3 animate-spin" /> Der Lotse schreibt weiter …
          </p>
        )}
        {unvollstaendig && (
          <p className="mt-2 text-[11px] text-[hsl(var(--warning))]" data-testid="lotse-unvollstaendig">
            Antwort unvollständig abgebrochen, nicht gespeichert.
          </p>
        )}
        {!begruessung && !laufend && !unvollstaendig && text && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            KI-Antwort aus den genannten Quellen, Stand {datum(stand ?? "")}, nicht geprüft.
          </p>
        )}
      </div>
    </div>
  );
}

export function ObjektLotse({ objektId, wohnungId = null, bezeichnung, kalkulation, vermietet = null, einheitMeta, className }: ObjektLotseProps) {
  const { user } = useUser();
  const [stand, setStand] = useState<Stand>("laedt");
  const [akzeptiert, setAkzeptiert] = useState(false);
  const [hinweisLesen, setHinweisLesen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [gateFehler, setGateFehler] = useState<string | null>(null);
  const [nachrichten, setNachrichten] = useState<LotseNachricht[]>([]);
  const [laufend, setLaufend] = useState(false);
  const [stufe, setStufe] = useState<LotseStufe>("liest");
  /** Die schon geprüften Blöcke der laufenden Antwort. */
  const [teile, setTeile] = useState<string[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Die Frage sieht nach Kundendaten aus: Hinweis statt Senden (LOTSE3-002). */
  /** Der Hinweis, warum die Frage nicht hinausging (Name oder Kundendaten), sonst leer. */
  const [kundendatenHinweis, setKundendatenHinweis] = useState<string | null>(null);
  const eingabeRef = useRef<HTMLTextAreaElement>(null);
  const abbruch = useRef<AbortController | null>(null);
  const verlaufRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let aktiv = true;
    setStand("laedt");
    setMeldung(null);
    void Promise.all([ladeZustimmung(), ladeVerlauf(objektId, wohnungId)]).then(([zustimmung, verlauf]) => {
      if (!aktiv) return;
      if (zustimmung.migrationFehlt || verlauf.migrationFehlt) { setStand("migration"); return; }
      if (zustimmung.fehler || verlauf.fehler) { setMeldung(zustimmung.fehler || verlauf.fehler); setStand("fehler"); return; }
      setAkzeptiert(zustimmung.akzeptiert);
      setNachrichten(verlauf.nachrichten);
      setStand("bereit");
    });
    return () => {
      aktiv = false;
      abbruch.current?.abort();
    };
  }, [objektId, wohnungId]);

  useEffect(() => {
    const el = verlaufRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [nachrichten, laufend, teile, stufe]);

  // Nach der Zustimmung die Unterlagen im Hintergrund vorbereiten, einmal je Einheit und Sitzung.
  const bereitZumFragen = stand === "bereit" && akzeptiert;
  useEffect(() => {
    if (bereitZumFragen) bereiteLotseVor({ rolle: user.role, objektId, wohnungId });
  }, [bereitZumFragen, user.role, objektId, wohnungId]);

  const akzeptieren = async () => {
    setSpeichert(true);
    setGateFehler(null);
    const ergebnis = await speichereZustimmung();
    setSpeichert(false);
    if (ergebnis.migrationFehlt) { setStand("migration"); return; }
    if (ergebnis.fehler) { setGateFehler(ergebnis.fehler); return; }
    setAkzeptiert(true);
  };

  const senden = async (text: string) => {
    const frage = text.trim();
    if (!frage || laufend || !akzeptiert || stand !== "bereit") return;
    // Sieht die Frage nach Kundendaten aus, geht sie nicht hinaus; der Text bleibt zum Ändern stehen.
    const sperrgrund = frageMitKundennamen(frage) ? LOTSE_KUNDENNAME_TEXT : frageMitKundendaten(frage) ? LOTSE_KUNDENDATEN_TEXT : null;
    if (sperrgrund) {
      setKundendatenHinweis(sperrgrund);
      return;
    }
    setKundendatenHinweis(null);
    setEingabe("");
    setMeldung(null);
    const jetzt = new Date().toISOString();
    setNachrichten((alt) => [...alt, { id: `frage-${jetzt}`, rolle: "user", inhalt: frage, quellen: [], erstelltAm: jetzt }]);
    setLaufend(true);
    setStufe("liest");
    setTeile([]);
    const steuerung = new AbortController();
    abbruch.current = steuerung;
    // Genau diese Kalkulation geht mit der Frage hinaus; die Antwort behält sie für die Erklärung an der Quelle.
    const gesendet = kalkulation;
    // Die geprüften Blöcke, wie sie ankommen; die fertige Antwort ersetzt sie.
    const gezeigt: string[] = [];
    const antwort = await frageLotse({
      rolle: user.role, objektId, wohnungId, frage, kalkulation: gesendet, signal: steuerung.signal,
      beiStufe: setStufe,
      beiBlock: (block) => {
        gezeigt.push(block);
        setTeile([...gezeigt]);
      },
    });
    const fertig = new Date().toISOString();
    if (antwort.ok === false) {
      // Nur eine vollständige Antwort gilt als Antwort und wird gespeichert.
      if (antwort.code === "migration_fehlt") setStand("migration");
      if (antwort.code === "zustimmung_fehlt") setAkzeptiert(false);
      // Zu Provisionen steht der feste Text an Stelle der Antwort, nicht als Störung.
      if (antwort.code === "provision") {
        setNachrichten((alt) => [...alt, { id: `antwort-${fertig}`, rolle: "assistant", inhalt: antwort.meldung, quellen: [], erstelltAm: fertig }]);
      } else {
        // Schon gezeigte Blöcke bleiben stehen, gekennzeichnet als unvollständig und nicht gespeichert.
        if (gezeigt.length) {
          setNachrichten((alt) => [...alt, {
            id: `antwort-${fertig}`, rolle: "assistant", inhalt: gezeigt.join("\n\n"), quellen: [], erstelltAm: fertig, unvollstaendig: true,
          }]);
        }
        setMeldung(antwort.meldung);
      }
    } else {
      setNachrichten((alt) => [...alt, { id: `antwort-${fertig}`, rolle: "assistant", inhalt: antwort.text, quellen: [], erstelltAm: fertig, kalkulation: gesendet }]);
    }
    setTeile([]);
    setLaufend(false);
  };

  const beiTaste = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void senden(eingabe);
    }
  };

  const bereit = bereitZumFragen;
  const zeigeHinweis = stand === "bereit" && (!akzeptiert || hinweisLesen);
  // Ohne Einheit oder bei Leerstand passt die Mietfrage nicht.
  const vorschlaege = lotseVorschlaege(Boolean(wohnungId) && vermietet !== false);
  const gefragt = new Set(nachrichten.filter((n) => n.rolle === "user").map((n) => n.inhalt.trim()));

  return (
    <section
      aria-label="Chat mit dem OS Lotsen"
      className={cn(
        "relative flex h-[75vh] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:h-[680px]",
        className,
      )}
      data-testid="objekt-lotse"
    >
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <LotseSymbol className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">OS Lotse <KiMarke /></h2>
          <p className="truncate text-xs text-muted-foreground">Dein KI-Objektmanager für {bezeichnung}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--success))]/10 px-2.5 py-1 text-[11px] text-[hsl(var(--success))] md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" /> kennt Objektdaten, Kalkulation, Lage und Unterlagen
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full font-serif italic"
          aria-label="Umgang mit KI anzeigen"
          title="Umgang mit KI"
          disabled={stand !== "bereit"}
          onClick={() => setHinweisLesen(true)}
        >
          i
        </Button>
      </div>

      {zeigeHinweis && (
        <LotseHinweis
          modus={akzeptiert ? "lesen" : "zustimmen"}
          speichert={speichert}
          fehler={gateFehler}
          onAkzeptieren={() => void akzeptieren()}
          onSchliessen={() => setHinweisLesen(false)}
        />
      )}

      <div ref={verlaufRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {stand === "laedt" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Der Lotse wird geladen …</p>
        )}
        {stand === "migration" && (
          <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground" data-testid="lotse-migration">
            Der Lotse wird gerade eingerichtet. Sobald die Datenbank so weit ist, kannst du hier Fragen stellen.
          </p>
        )}
        {stand === "fehler" && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{meldung ?? "Der Lotse ließ sich nicht laden."}</p>
        )}
        {stand === "bereit" && (
          <>
            <Antwort
              inhalt={lotseBegruessung(user.name, Boolean(wohnungId), einheitMeta)}
              begruessung
            />
            {nachrichten.map((n) =>
              n.rolle === "user" ? (
                <div key={n.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {n.inhalt}
                </div>
              ) : (
                <Antwort key={n.id} inhalt={n.inhalt} stand={n.erstelltAm} kalkulation={n.kalkulation ?? null} unvollstaendig={n.unvollstaendig} />
              ),
            )}
            {laufend && (teile.length ? <Antwort inhalt={teile.join("\n\n")} laufend /> : <Denkt stufe={stufe} />)}
          </>
        )}
      </div>

      {/* Die Vorschläge bleiben immer stehen, damit nichts springt: eine Zeile,
          waagerecht wischbar. Schon Gefragtes wird nur gedämpft, während der
          Antwort ist alles gesperrt. */}
      {stand === "bereit" && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 sm:px-5" data-testid="lotse-vorschlaege">
          {vorschlaege.map((v) => {
            const gestellt = gefragt.has(v);
            return (
              <Button
                key={v}
                variant="outline"
                size="sm"
                className={cn(
                  "h-11 shrink-0 whitespace-nowrap rounded-full text-xs sm:h-8",
                  gestellt && "text-muted-foreground opacity-70",
                )}
                title={gestellt ? "Schon gefragt" : undefined}
                data-gestellt={gestellt || undefined}
                disabled={!bereit || laufend}
                onClick={() => void senden(v)}
              >
                {v}
              </Button>
            );
          })}
        </div>
      )}

      {meldung && stand === "bereit" && (
        <p className="mx-4 mb-2 rounded-lg bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs text-foreground sm:mx-5" role="alert" data-testid="lotse-meldung">{meldung}</p>
      )}

      {kundendatenHinweis && stand === "bereit" && (
        <Alert className="mx-4 mb-2 w-auto border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 sm:mx-5" data-testid="lotse-kundendaten">
          <AlertDescription className="flex flex-col gap-2 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{kundendatenHinweis}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => {
                setKundendatenHinweis(null);
                eingabeRef.current?.focus();
              }}
            >
              Frage ändern
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mx-4 mb-2 flex items-end gap-2 rounded-2xl border border-border bg-background p-2 sm:mx-5">
        <Textarea
          ref={eingabeRef}
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={beiTaste}
          rows={1}
          maxLength={2000}
          disabled={!bereit}
          placeholder={`Frag den Lotsen etwas zu ${bezeichnung} …`}
          aria-label="Frage an den Lotsen"
          className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        {laufend ? (
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Antwort abbrechen" onClick={() => abbruch.current?.abort()}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="brand" size="icon" className="h-10 w-10 shrink-0" aria-label="Senden" disabled={!bereit || !eingabe.trim()} onClick={() => void senden(eingabe)}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="px-4 pb-3 text-[11px] leading-snug text-muted-foreground sm:px-5">
        Der OS Lotse ist eine KI. Er antwortet nur aus Objektdaten, Kalkulation, Karte und Unterlagen im CRM und kann sich
        trotzdem irren. Seine Antworten sind eine Arbeitshilfe, keine geprüfte Auskunft und keine Steuer-, Rechts- oder
        Anlageberatung. Gib an Kunden nur freigegebene Unterlagen weiter, nicht den Text des Lotsen, und gib hier keine Daten
        deiner Kunden ein.
      </p>
    </section>
  );
}
