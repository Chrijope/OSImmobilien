import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

/** Die beiden Reiter der rechten Spalte, wie im Bewerberprofil. */
export type KundenVerlaufReiter = "aktivitaeten" | "notizen";

interface Props {
  offen: boolean;
  /** Wie viele Einträge im Reiter „Aktivitäten" stehen, also System, Aufgaben und Termine. */
  anzahl: number;
  /** Wie viele von Hand geschriebene Notizen es gibt. */
  notizenAnzahl?: number;
  /** Welcher Reiter vorn steht. Der Aufrufer führt ihn, weil er die Liste filtert. */
  reiter?: KundenVerlaufReiter;
  onReiter?: (reiter: KundenVerlaufReiter) => void;
  speichert?: boolean;
  onUmschalten: () => void;
  onNotiz: () => void;
  children: ReactNode;
}

/**
 * Die rechte Spalte des Kundenprofils, seit dem 17.09.2026 mit zwei Reitern.
 *
 * ## Warum sie dem Bewerberprofil gleicht
 *
 * Christian wollte beide Profile gleich: oben die Auswahl zwischen
 * „Aktivitäten" und „Notizen", die Zahl jeweils am Reiter, und den Knopf zum
 * Schreiben einer Notiz nicht mehr über der ganzen Liste, sondern dort, wo die
 * Notizen stehen. Aufbau und Wortwahl sind deshalb dieselben wie in
 * `components/bewerbung/profil/BewerberprofilAktivitaeten.tsx`.
 *
 * Eine Überschrift „Aktivitäten" steht nicht mehr darüber. Sie sagte dasselbe
 * wie der Reiter direkt darunter.
 *
 * ## Der Unterschied zum Bewerberprofil
 *
 * Dort sind die Notizen ein eigener Bestand. Hier sind sie eine Art unter den
 * Aktivitäten, und die drei Gruppen schliessen sich gegenseitig aus:
 * `istSystemEintrag`, `istNotiz` und `istManuell` in `pages/KundenDetail`
 * teilen den Bestand vollständig auf. Eine von Hand geschriebene Notiz kann
 * deshalb nicht zugleich unter „Aktivitäten" stehen, es gibt nichts doppelt.
 * Innerhalb von „Aktivitäten" bleibt die vorhandene Unterteilung in
 * „Aufgaben & Termine" und „System" erhalten.
 *
 * Welcher Reiter vorn steht, führt der Aufrufer: An ihm hängt, welche Einträge
 * die Liste überhaupt zeigt. Zwei Zustände für dieselbe Frage wären der Anfang
 * zweier verschiedener Antworten.
 */
export function KundenprofilAktivitaeten({
  offen,
  anzahl,
  notizenAnzahl,
  reiter = "aktivitaeten",
  onReiter,
  speichert,
  onUmschalten,
  onNotiz,
  children,
}: Props) {
  return <Card className="kundenprofil-verlauf" data-offen={offen}>
    <Tabs value={reiter} onValueChange={(v) => onReiter?.(v as KundenVerlaufReiter)}>
      <div className="kundenprofil-verlauf-kopf">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={speichert} aria-label={offen ? "Aktivitäten und Notizen einklappen" : "Aktivitäten und Notizen ausklappen"} aria-expanded={offen} aria-controls="kundenprofil-verlauf-inhalt" onClick={onUmschalten}>
          {offen ? <ChevronRight /> : <ChevronLeft />}
        </Button>
        {offen ? (
          <TabsList className="grid flex-1 grid-cols-2">
            <TabsTrigger value="aktivitaeten">
              Aktivitäten
              {anzahl > 0 && <span className="ml-1 tabular-nums opacity-70">{anzahl}</span>}
            </TabsTrigger>
            <TabsTrigger value="notizen">
              Notizen
              {typeof notizenAnzahl === "number" && notizenAnzahl > 0 && (
                <span className="ml-1 tabular-nums opacity-70">{notizenAnzahl}</span>
              )}
            </TabsTrigger>
          </TabsList>
        ) : (
          /* Eingeklappt stehen beide Wörter senkrecht, damit man sieht, dass es
             beides gibt. Genauso im Bewerberprofil. */
          <>
            <span className="kundenprofil-verlauf-marke text-sm font-semibold" data-testid="kundenprofil-marke-aktivitaeten">
              Aktivitäten
              {anzahl > 0 && <span className="tabular-nums"> {anzahl}</span>}
            </span>
            <span className="kundenprofil-verlauf-marke text-sm font-semibold" data-testid="kundenprofil-marke-notizen">
              Notizen
              {typeof notizenAnzahl === "number" && notizenAnzahl > 0 && (
                <span className="tabular-nums"> {notizenAnzahl}</span>
              )}
            </span>
          </>
        )}
      </div>
      {/* Gemountet lassen: Ein-/Ausklappen darf weder Filter noch Dialoge zurücksetzen. */}
      <div hidden={!offen} id="kundenprofil-verlauf-inhalt" aria-label="Aktivitäten und Notizen">
        {/* Der Knopf steht im Reiter „Notizen", also dort, wo die Notizen sind. */}
        {reiter === "notizen" && (
          <div className="flex items-center gap-2 my-4">
            <Button variant="outline" className="justify-start text-muted-foreground flex-1 min-w-0" onClick={onNotiz}>Notiz schreiben …</Button>
            <Button size="icon" className="shrink-0" aria-label="Notiz erstellen" onClick={onNotiz}><Plus /></Button>
          </div>
        )}
        {children}
      </div>
    </Tabs>
  </Card>;
}
