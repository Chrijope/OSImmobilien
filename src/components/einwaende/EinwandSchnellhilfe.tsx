import { useMemo, useState } from "react";
import { ChevronDown, Lightbulb, Search, ShieldAlert, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  EINWAND_BIBLIOTHEK,
  EINWAND_KATEGORIEN,
  EINWAND_TECHNIKEN,
  type EinwandEintrag,
} from "@/lib/vertriebsakademieContent";
import { useZielgruppe, showGoldNugget } from "@/lib/vertriebsakademieZielgruppe";

/**
 * Einwandbehandlung dort, wo der Einwand wirklich kommt.
 *
 * Der wichtigste Moment für die Bibliothek ist nicht der Abend am Schreibtisch,
 * sondern die Sekunde im Telefonat. Wer dafür die Seite wechseln muss, verliert
 * seinen Platz im Skript, und der Kunde hört die Pause.
 *
 * Deshalb sitzt diese Komponente direkt im Erstgesprächsskript. Sie zeigt die
 * Einwände, die an dieser Stelle typischerweise kommen, klappt die Behandlung
 * darunter auf und lässt das Skript sichtbar. Kein Seitenwechsel, kein Dialog.
 */

interface Props {
  /** Schritt des Erstgesprächsskripts, etwa "mitentscheider". */
  skriptSchritt?: string;
  /** Ohne Schrittbezug: freie Suche über alle Einwände. */
  freieSuche?: boolean;
  className?: string;
}

function technikZu(id?: string) {
  if (!id) return null;
  return EINWAND_TECHNIKEN.find((t) => t.id === id) ?? null;
}

/**
 * Die Technik hinter der Antwort, ausgeklappt.
 *
 * Bisher stand hier nur der Name als Badge. Wer die Antwort nur abliest, kann
 * sie nicht abwandeln, sobald der Kunde anders reagiert als im Beispiel. Was
 * eine Technik trägt, ist das Prinzip dahinter: warum sie wirkt, in welchen
 * Schritten sie abläuft und wann sie nach hinten losgeht.
 */
export function TechnikErklaerung({
  technikId,
  tiefe = "kompakt",
  standardOffen = false,
}: {
  technikId?: string;
  /**
   * "kompakt" für Quereinsteiger: was die Technik tut und die drei Schritte.
   * "voll" für Profis: dazu das Prinzip dahinter und die Stelle, an der sie
   * nach hinten losgeht.
   */
  tiefe?: "kompakt" | "voll";
  standardOffen?: boolean;
}) {
  const [auf, setAuf] = useState(standardOffen);
  const t = technikZu(technikId);
  if (!t) return null;
  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setAuf((a) => !a)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs">
          <span className="text-muted-foreground">Technik dahinter: </span>
          <span className="font-medium">{t.name}</span>
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", auf && "rotate-180")}
        />
      </button>
      {auf && (
        <div className="px-2.5 pb-2.5 space-y-2 text-xs">
          <p className="text-foreground/90">{t.kurz}</p>
          {tiefe === "voll" && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Warum sie wirkt
              </div>
              <p className="text-foreground/90">{t.prinzip}</p>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
              In drei Schritten
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-foreground/90">
              {t.schritte.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div className="rounded border-l-2 border-primary/60 bg-primary/5 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
              So klingt es
            </div>
            <p className="text-foreground/90">{t.beispiel}</p>
          </div>
          <p className="text-muted-foreground">{t.wann}</p>
          {tiefe === "voll" && (
            <p className="text-rose-700 dark:text-rose-400">
              <span className="font-semibold">Achtung: </span>
              {t.achtung}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EinwandSchnellhilfe({ skriptSchritt, freieSuche, className }: Props) {
  const [zielgruppe] = useZielgruppe();
  const zeigeProfi = showGoldNugget(zielgruppe);
  const [offen, setOffen] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [alleZeigen, setAlleZeigen] = useState(false);

  const passend = useMemo(() => {
    if (skriptSchritt) {
      return EINWAND_BIBLIOTHEK.filter((e) => e.skriptSchritte?.includes(skriptSchritt));
    }
    return EINWAND_BIBLIOTHEK;
  }, [skriptSchritt]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return passend;
    return EINWAND_BIBLIOTHEK.filter((e) =>
      [e.einwand, e.meintEigentlich, e.antwortKurz, ...(e.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [passend, suche]);

  if (!skriptSchritt && !freieSuche) return null;
  if (skriptSchritt && passend.length === 0 && !suche) return null;

  return (
    <div className={cn("rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          {skriptSchritt ? "Wenn hier ein Einwand kommt" : "Einwand suchen"}
        </div>
        {freieSuche && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Zwei Wörter reichen"
              className="h-8 pl-7 text-xs"
            />
          </div>
        )}
      </div>

      {/* Die Einwände als Zeile, damit sie im Gespräch überflogen werden können */}
      <div className="flex flex-wrap gap-1.5">
        {gefiltert.slice(0, suche || alleZeigen ? gefiltert.length : 4).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setOffen(offen === e.id ? null : e.id)}
            className={cn(
              "text-left text-xs rounded-md border px-2 py-1 transition-colors max-w-full",
              offen === e.id
                ? "border-amber-500/60 bg-amber-500/15"
                : "bg-background hover:bg-muted/60",
            )}
          >
            <span className="line-clamp-1">„{e.einwand}"</span>
          </button>
        ))}
        {gefiltert.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Kein Treffer.</span>
        )}
        {!suche && !alleZeigen && gefiltert.length > 4 && (
          <button
            type="button"
            onClick={() => setAlleZeigen(true)}
            className="text-xs rounded-md border border-dashed px-2 py-1 text-muted-foreground hover:bg-muted/60"
          >
            {gefiltert.length - 4} weitere
          </button>
        )}
      </div>

      {offen && (
        <EinwandAntwort
          eintrag={gefiltert.find((e) => e.id === offen) ?? passend.find((e) => e.id === offen)!}
          zeigeProfi={zeigeProfi}
          onSchliessen={() => setOffen(null)}
        />
      )}
    </div>
  );
}

/**
 * Die Behandlung selbst.
 *
 * Reihenfolge bewusst anders als bisher: erst was der Kunde eigentlich meint,
 * dann die Antwort. Wer das Motiv versteht, kann die Antwort auch abwandeln.
 * Wer nur den Satz abliest, klingt abgelesen.
 */
export function EinwandAntwort({
  eintrag,
  zeigeProfi,
  onSchliessen,
}: {
  eintrag: EinwandEintrag;
  zeigeProfi: boolean;
  onSchliessen?: () => void;
}) {
  const kat = EINWAND_KATEGORIEN.find((k) => k.id === eintrag.kategorie);
  const technikObjekt = technikZu(eintrag.technik);
  const technik = technikObjekt?.name ?? null;
  return (
    <div data-ui="card" className="rounded-lg border bg-background p-3 space-y-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">„{eintrag.einwand}"</div>
        {onSchliessen && (
          <button type="button" onClick={onSchliessen} aria-label="Schließen" className="shrink-0">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {kat && (
          <Badge variant="outline" className={`text-[10px] ${kat.farbe}`}>{kat.label}</Badge>
        )}
        {technik && <Badge variant="secondary" className="text-[10px]">{technik}</Badge>}
      </div>

      <div className="rounded-md bg-muted/50 p-2.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
          Was er eigentlich meint
        </div>
        <div className="text-foreground/90">{eintrag.meintEigentlich}</div>
      </div>

      <div
        className={cn(
          "rounded-md border-l-2 border-primary bg-primary/5 p-2.5",
          // Für Quereinsteiger ist das der Satz zum Vorlesen, also größer.
          !zeigeProfi && "text-base leading-relaxed",
        )}
      >
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
          {zeigeProfi ? "Antwort" : "So antwortest du, ruhig vorlesen"}
        </div>
        <div className="whitespace-pre-line">{eintrag.antwortKurz}</div>
      </div>

      {/*
        Der Weg dorthin. Ein Quereinsteiger braucht die drei Schritte als
        Handlungsanweisung, weil er die Technik noch nicht im Gefühl hat. Ein
        Profi kennt sie und würde sie als Bevormundung lesen.
      */}
      {!zeigeProfi && technikObjekt && (
        <div className="rounded-md border p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            So gehst du vor
          </div>
          <ol className="list-decimal list-inside space-y-0.5 text-xs text-foreground/90">
            {technikObjekt.schritte.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      {eintrag.antwortZahlen && (
        <div className="rounded-md border p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Mit Zahlen
          </div>
          <div className="whitespace-pre-line text-foreground/90">{eintrag.antwortZahlen}</div>
        </div>
      )}

      {/* Die Geschichte trägt nur, wer sie frei erzählen kann. */}
      {zeigeProfi && eintrag.antwortStory && (
        <div className="rounded-md border p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Als Geschichte
          </div>
          <div className="whitespace-pre-line text-foreground/90">{eintrag.antwortStory}</div>
        </div>
      )}

      <div className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
        <span className="font-semibold shrink-0">Falle:</span>
        <span className="text-foreground/90">{eintrag.falle}</span>
      </div>

      <TechnikErklaerung
        technikId={eintrag.technik}
        tiefe={zeigeProfi ? "voll" : "kompakt"}
        standardOffen={false}
      />

      {zeigeProfi && eintrag.profiMove && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-amber-700 dark:text-amber-400">Profi-Move</div>
            <div className="text-foreground/90">{eintrag.profiMove}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Aufklappbarer Streifen für Stellen, an denen dauerhaft wenig Platz ist.
 */
export function EinwandSchnellhilfeKompakt({ skriptSchritt }: { skriptSchritt: string }) {
  const [auf, setAuf] = useState(false);
  const anzahl = EINWAND_BIBLIOTHEK.filter((e) => e.skriptSchritte?.includes(skriptSchritt)).length;
  if (anzahl === 0) return null;
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
        onClick={() => setAuf((a) => !a)}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        {anzahl === 1 ? "1 typischer Einwand" : `${anzahl} typische Einwände`}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", auf && "rotate-180")} />
      </Button>
      {auf && <EinwandSchnellhilfe skriptSchritt={skriptSchritt} className="mt-2" />}
    </div>
  );
}
