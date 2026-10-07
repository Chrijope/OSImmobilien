import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EREIGNIS_FILTER,
  gruppiereNachTag,
  uhrzeitAusMs,
  zaehleArten,
  type BewerberEreignis,
  type EreignisArt,
  type MarkeTon,
} from "@/lib/bewerberEreignisse";
import type { BewerberNotiz } from "@/lib/bewerbungStore";
/*
 * Die Notiz wird nicht nachgebaut, sondern ist dieselbe wie im Kundenprofil:
 * erst die ersten hundert Zeichen, dann ein Knopf „mehr". Christian hat am
 * 17.09.2026 ausdrücklich „genau wie im Kundenprofil" verlangt, und ein
 * zweiter Aufklappknopf mit eigener Grenze wäre genau das Auseinanderlaufen,
 * das er nicht will. Der Baustein kennt nur Text, keinen Kunden.
 */
import { KundenprofilNotiz } from "@/components/kunden/profil/KundenprofilNotiz";
import "./bewerberprofil.css";

/**
 * Die rechte Spalte des Bewerberprofils, mit zwei Reitern.
 *
 * „Aktivitäten" zeigt, was mit dem Bewerber geschehen ist. „Notizen" zeigt,
 * was jemand von Hand dazugeschrieben hat. Beides stand vorher an zwei ganz
 * verschiedenen Stellen: der Verlauf hier, die Notizen unten im Reiter
 * Übersicht. Seit dem 17.09.2026 stehen sie nebeneinander, so wie im
 * Kundenprofil.
 *
 * Geschrieben wird eine Notiz nicht hier, sondern über den Knopf „Notiz" in
 * der linken Spalte (`BewerberSchnellaktionen`). Diese Spalte zeigt nur an
 * und reicht das Löschen nach oben weiter.
 *
 * Der Reiter „Aktivitäten" zeigt alles, was geschehen ist, nach Tagen gruppiert
 * und nach Art filterbar: versendete Mails samt Öffnungs- und Klickzeit,
 * Termine, ausgefüllte Bögen und erledigte Schritte. Zusammengeführt wird das
 * in `lib/bewerberEreignisse.ts`, hier wird es nur angezeigt.
 *
 * **Was fehlt, und warum es fehlt:** Stufenwechsel. Gespeichert ist allein die
 * aktuelle Pipelinestufe, nicht wann sie sich geändert hat. Es gibt dafür
 * keine Verlaufstabelle, also steht hier auch kein Eintrag. Lieber eine Lücke,
 * die man sieht, als eine erfundene Zeile, der man glaubt. Der Hinweis unten
 * sagt das dem Nutzer, statt es ihn raten zu lassen.
 *
 * Gemountet bleibt der Inhalt auch eingeklappt: Ein- und Ausklappen darf den
 * gewählten Filter nicht zurücksetzen. Dasselbe Verhalten wie im Kundenprofil.
 */

/** Die Farbgebung einer Marke. Alle Werte kommen aus den vorhandenen Tokens. */
const MARKE_KLASSE: Record<MarkeTon, string> = {
  gut: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  info: "bg-primary/10 text-primary border-primary/20",
  still: "bg-muted text-muted-foreground border-transparent",
  warnung: "bg-destructive/10 text-destructive border-destructive/20",
};

/** Zeitpunkt einer Notiz, wie überall im Projekt geschrieben. */
function notizZeit(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Die beiden Reiter der rechten Spalte. */
export type VerlaufReiter = "aktivitaeten" | "notizen";

export function BewerberprofilAktivitaeten({
  ereignisse,
  notizen = [],
  altNotiz = "",
  offen,
  onUmschalten,
  onNotizSchreiben,
  onNotizLoeschen,
  laedt = false,
  reiter: reiterVonAussen,
  onReiter,
}: {
  ereignisse: BewerberEreignis[];
  /** Die von Hand geschriebenen Notizen, neueste zuerst sortiert sie selbst. */
  notizen?: BewerberNotiz[];
  /**
   * Die alte Freitextnotiz aus der Zeit vor dem Notizverlauf.
   *
   * Sie hat weder Autor noch Zeitpunkt und steht deshalb abgesetzt unter den
   * anderen. Weggelassen wird sie ausdrücklich nicht: In manchen Akten ist sie
   * das Einzige, was jemand aufgeschrieben hat.
   */
  altNotiz?: string;
  offen: boolean;
  onUmschalten: () => void;
  /** Öffnet dasselbe Fenster wie der Knopf „Notiz" in der linken Spalte. */
  onNotizSchreiben?: () => void;
  /** Fehlt sie, gibt es keinen Papierkorb an der Notiz. */
  onNotizLoeschen?: (notizId: string) => void;
  /** Solange die Mails nachgeladen werden, ist die Liste noch unvollständig. */
  laedt?: boolean;
  /**
   * Der gezeigte Reiter, wenn der Aufrufer ihn führt.
   *
   * Gebraucht, weil das Schreiben einer Notiz ausserhalb dieser Spalte
   * geschieht: Der runde Knopf „Notiz" sitzt links. Ohne diese Möglichkeit
   * bliebe die Spalte nach dem Speichern auf „Aktivitäten" stehen, und die
   * frische Notiz wäre nirgends zu sehen. Fehlt der Wert, führt die Spalte
   * ihren Reiter wie bisher selbst.
   */
  reiter?: VerlaufReiter;
  onReiter?: (reiter: VerlaufReiter) => void;
}) {
  const [eigenerReiter, setEigenerReiter] = useState<VerlaufReiter>("aktivitaeten");
  const reiter = reiterVonAussen ?? eigenerReiter;
  const setReiter = onReiter ?? setEigenerReiter;
  const [filter, setFilter] = useState<"alle" | EreignisArt>("alle");
  const sortierteNotizen = useMemo(
    () => [...notizen].sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime()),
    [notizen],
  );
  const zahlen = useMemo(() => zaehleArten(ereignisse), [ereignisse]);
  const gefiltert = useMemo(
    () => (filter === "alle" ? ereignisse : ereignisse.filter((e) => e.art === filter)),
    [ereignisse, filter],
  );
  const gruppen = useMemo(() => gruppiereNachTag(gefiltert), [gefiltert]);

  return (
    <Card className="bewerberprofil-verlauf" data-offen={offen} data-testid="bewerberprofil-aktivitaeten">
      <Tabs value={reiter} onValueChange={(v) => setReiter(v as VerlaufReiter)}>
        {/*
          ── Kopfzeile ──

          Über der Reiterauswahl stand bis zum 17.09.2026 noch eine Überschrift
          „Aktivitäten" mit der Zahl daneben. Sie ist entfallen: Direkt darunter
          steht die Auswahl zwischen „Aktivitäten" und „Notizen", und beides
          nebeneinander las sich wie dasselbe zweimal. Der Pfeil bleibt, er ist
          der einzige Weg, die Spalte zuzuklappen. Er sitzt jetzt in derselben
          Zeile wie die Reiterauswahl, sonst bliebe eine leere Zeile stehen.
        */}
        <div className="bewerberprofil-verlauf-kopf">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={offen ? "Aktivitäten und Notizen einklappen" : "Aktivitäten und Notizen ausklappen"}
            aria-expanded={offen}
            aria-controls="bewerberprofil-verlauf-inhalt"
            onClick={onUmschalten}
          >
            {offen ? <ChevronRight /> : <ChevronLeft />}
          </Button>

          {offen ? (
            <TabsList className="grid flex-1 grid-cols-2">
              <TabsTrigger value="aktivitaeten">
                Aktivitäten
                {ereignisse.length > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{ereignisse.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="notizen">
                Notizen
                {sortierteNotizen.length > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{sortierteNotizen.length}</span>
                )}
              </TabsTrigger>
            </TabsList>
          ) : (
            /*
              Eingeklappt standen hier nur „Aktivitäten" und eine Zahl. Wer die
              Spalte zugeklappt hat, sah damit nicht, dass darin auch die
              Notizen liegen. Deshalb stehen jetzt beide Wörter da, jedes mit
              seiner eigenen Zahl.
            */
            <>
              <span className="bewerberprofil-verlauf-marke" data-testid="bewerberprofil-marke-aktivitaeten">
                Aktivitäten
                {ereignisse.length > 0 && <span className="tabular-nums"> {ereignisse.length}</span>}
              </span>
              <span className="bewerberprofil-verlauf-marke" data-testid="bewerberprofil-marke-notizen">
                Notizen
                {sortierteNotizen.length > 0 && (
                  <span className="tabular-nums"> {sortierteNotizen.length}</span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Gemountet lassen: Ein- und Ausklappen darf den Filter nicht verwerfen. */}
        <div hidden={!offen} id="bewerberprofil-verlauf-inhalt" aria-label="Aktivitäten und Notizen">
          <TabsContent value="aktivitaeten">
        <div className="flex flex-wrap gap-1.5 my-3" role="group" aria-label="Nach Art filtern">
          {EREIGNIS_FILTER.map((eintrag) => {
            const anzahl = zahlen[eintrag.key] || 0;
            const aktiv = filter === eintrag.key;
            return (
              <Button
                key={eintrag.key}
                type="button"
                size="sm"
                variant={aktiv ? "default" : "outline"}
                aria-pressed={aktiv}
                className={cn("h-7 px-2 text-[11px] gap-1", !aktiv && "text-muted-foreground")}
                onClick={() => setFilter(eintrag.key)}
              >
                {eintrag.label}
                <span className="tabular-nums opacity-70">{anzahl}</span>
              </Button>
            );
          })}
        </div>

        {gruppen.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            {laedt
              ? "Die Aktivitäten werden geladen …"
              : filter === "alle"
              ? "Zu diesem Bewerber ist bisher nichts aufgezeichnet."
              : "Zu dieser Art gibt es keinen Eintrag."}
          </p>
        ) : (
          gruppen.map((gruppe) => (
            <div key={gruppe.schluessel}>
              <p className="bewerberprofil-tag">{gruppe.label}</p>
              <div className="bewerberprofil-zeitleiste">
                {gruppe.ereignisse.map((ereignis) => (
                  <div key={ereignis.id} className="bewerberprofil-eintrag" data-art={ereignis.art}>
                    <div className="bewerberprofil-eintrag-kopf">
                      <span className="bewerberprofil-eintrag-titel">{ereignis.titel}</span>
                      {/* Ein Termin ohne Uhrzeit bekommt keine erfundene 00:00. */}
                      {!ereignis.nurTag && (
                        <span className="bewerberprofil-eintrag-zeit">{uhrzeitAusMs(ereignis.ms)}</span>
                      )}
                    </div>
                    {ereignis.text && <p className="bewerberprofil-eintrag-text">{ereignis.text}</p>}
                    {ereignis.marken.length > 0 && (
                      <div className="bewerberprofil-marken">
                        {ereignis.marken.map((marke) => (
                          <Badge
                            key={marke.text}
                            variant="outline"
                            className={cn("text-[10px] px-1.5 py-0 font-medium", MARKE_KLASSE[marke.ton])}
                          >
                            {marke.text}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/*
          Der ehrliche Hinweis. Ohne ihn liest sich die Liste als vollständig,
          und genau das ist sie bei den Stufen nicht.
        */}
        <p className="mt-3 border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
          Stufenwechsel stehen nicht in der Liste. Gespeichert ist nur die aktuelle Pipelinestufe,
          nicht wann sie sich geändert hat. Gezeigt wird deshalb ausschließlich, was wirklich
          aufgezeichnet ist.
        </p>
          </TabsContent>

          {/* ── Der Reiter Notizen ──────────────────────────────────── */}
          <TabsContent value="notizen">
            {onNotizSchreiben && (
              <div className="flex items-center gap-2 my-3">
                <Button
                  variant="outline"
                  className="justify-start text-muted-foreground flex-1 min-w-0"
                  onClick={onNotizSchreiben}
                >
                  Notiz schreiben …
                </Button>
                <Button size="icon" className="shrink-0" aria-label="Notiz erstellen" onClick={onNotizSchreiben}>
                  <Plus />
                </Button>
              </div>
            )}

            {sortierteNotizen.length === 0 && !altNotiz ? (
              <p className="text-xs text-muted-foreground py-4">
                Zu diesem Bewerber ist bisher keine Notiz geschrieben.
              </p>
            ) : (
              <div className="space-y-2">
                {sortierteNotizen.map((n) => (
                  <div key={n.id} className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                        <Badge variant="outline" className="font-medium">{n.autor}</Badge>
                        <span className="text-muted-foreground">{notizZeit(n.datum)}</span>
                      </div>
                      {onNotizLoeschen && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Notiz von ${n.autor} löschen`}
                          onClick={() => onNotizLoeschen(n.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <KundenprofilNotiz text={n.text} className="text-sm" />
                  </div>
                ))}
              </div>
            )}

            {altNotiz && (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 mt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Alte Notiz, ohne Autor und Zeitpunkt
                </p>
                <KundenprofilNotiz text={altNotiz} className="text-sm" />
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
