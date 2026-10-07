import { useMemo, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AkademieZuordnenAufgabe } from "@/lib/vertriebsakademieContent";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";
import { mischeMitSaat } from "./AufgabenHelfer";
import { useZiehen } from "./useZiehen";

interface Props {
  aufgabe: AkademieZuordnenAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
}

/**
 * Begriffe den passenden Erklärungen zuordnen.
 *
 * Zwei Wege, die sich nicht ausschließen:
 *  - Ziehen: Karte am Griff (Finger) oder irgendwo (Maus) anfassen und auf die
 *    Ablagefläche des Begriffs legen. Die Technik steht in `useZiehen`.
 *  - Antippen: erst die Karte, dann den Begriff. Das bleibt, weil es mit
 *    Tastatur, Screenreader und zitternder Hand verlässlich ist.
 *
 * Beim Ablegen rastet die Karte kurz ein, nach der Prüfung schütteln sich die
 * falsch belegten Begriffe.
 *
 * Der Unterschied zwischen den Pfaden liegt allein im Inhalt: Die Profi-Variante
 * bekommt über `ablenker` zusätzliche falsche Karten, sodass nicht mehr jede
 * Karte irgendwo hingehört und Ausschlussraten nicht funktionieren.
 */
export function AkademieZuordnen({ aufgabe, geloest, versuche, punkte, onFertig }: Props) {
  const paare = aufgabe.paare;
  const karten = useMemo(
    () => mischeMitSaat([...paare.map((p) => p.rechts), ...(aufgabe.ablenker ?? [])], aufgabe.id),
    [paare, aufgabe.ablenker, aufgabe.id],
  );

  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [aktiveKarte, setAktiveKarte] = useState<string | null>(null);
  const [geprueft, setGeprueft] = useState(false);
  /** Begriff, auf dem gerade eine Karte eingerastet ist, für die kurze Animation. */
  const [eingerastet, setEingerastet] = useState<string | null>(null);

  const vergeben = new Set(Object.values(zuordnung));
  const alleGesetzt = paare.every((p) => zuordnung[p.links]);
  const korrekt = paare.every((p) => zuordnung[p.links] === p.rechts);

  function ablegen(links: string, karte: string) {
    if (geprueft) return;
    setZuordnung((z) => {
      const kopie = { ...z };
      for (const k of Object.keys(kopie)) if (kopie[k] === karte) delete kopie[k];
      kopie[links] = karte;
      return kopie;
    });
    setAktiveKarte(null);
    setEingerastet(links);
  }

  function entfernen(links: string) {
    if (geprueft) return;
    setZuordnung((z) => {
      const kopie = { ...z };
      delete kopie[links];
      return kopie;
    });
  }

  const ziehen = useZiehen({
    deaktiviert: geprueft,
    onAblegen: (karte, zielId) => {
      if (zielId && paare.some((p) => p.links === zielId)) ablegen(zielId, karte);
    },
  });

  function pruefen() {
    setGeprueft(true);
    onFertig(paare.every((p) => zuordnung[p.links] === p.rechts));
  }

  function neuStarten() {
    setZuordnung({});
    setAktiveKarte(null);
    setEingerastet(null);
    setGeprueft(false);
  }

  const gezogeneKarte = ziehen.status.id;

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={
        aufgabe.hinweis ??
        (aufgabe.ablenker?.length
          ? "Zieh jede Karte auf den Begriff, zu dem sie gehört, oder tippe erst die Karte und dann den Begriff an. Achtung, nicht jede Karte wird gebraucht."
          : "Zieh jede Karte auf den Begriff, zu dem sie gehört, oder tippe erst die Karte und dann den Begriff an.")
      }
      typLabel={`Zuordnen · ${paare.length} Paare`}
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      onNeuStarten={geprueft ? neuStarten : undefined}
      aktion={
        !geprueft ? (
          <div className="flex justify-end">
            <Button size="sm" disabled={!alleGesetzt} onClick={pruefen}>
              Zuordnung prüfen
            </Button>
          </div>
        ) : (
          <AufgabenRueckmeldung
            korrekt={korrekt}
            text={korrekt ? "Alle Paare stimmen." : "Die richtigen Paare stehen unten."}
            kinder={
              !korrekt ? (
                <ul className="mt-2 space-y-1 text-foreground/90">
                  {paare.map((p) => (
                    <li key={p.links}>
                      <span className="font-medium">{p.links}</span>: {p.rechts}
                    </li>
                  ))}
                </ul>
              ) : undefined
            }
          />
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Begriffe</div>
          {paare.map((p) => {
            const gesetzt = zuordnung[p.links];
            const stimmt = geprueft && gesetzt === p.rechts;
            const zielUnterZeiger = ziehen.status.zielId === p.links && !!gezogeneKarte;
            const bereit = !!aktiveKarte || !!gezogeneKarte;
            return (
              <button
                key={p.links}
                type="button"
                data-va-ziel={p.links}
                onClick={() => (gesetzt && !aktiveKarte ? entfernen(p.links) : aktiveKarte && ablegen(p.links, aktiveKarte))}
                disabled={geprueft}
                onAnimationEnd={() => { if (eingerastet === p.links) setEingerastet(null); }}
                className={cn(
                  "w-full min-h-[44px] text-left rounded-lg border-2 px-3 py-2 transition-[border-color,background-color,transform] duration-200",
                  !gesetzt && !geprueft && "border-dashed",
                  gesetzt && !geprueft && "border-solid border-border",
                  bereit && !geprueft && "border-primary/50",
                  zielUnterZeiger && "border-primary bg-primary/10 scale-[1.02] shadow-sm",
                  !gesetzt && !bereit && !geprueft && "border-muted-foreground/30 bg-muted/20",
                  eingerastet === p.links && "va-einrasten",
                  geprueft && stimmt && "border-emerald-500/40 bg-emerald-500/5",
                  geprueft && !stimmt && "border-rose-500/40 bg-rose-500/5 va-schuetteln",
                )}
              >
                <div className="text-sm font-medium">{p.links}</div>
                {gesetzt ? (
                  <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <span className="flex-1">{gesetzt}</span>
                    {!geprueft && <X className="h-3 w-3 mt-0.5 shrink-0" aria-label="Karte zurücklegen" />}
                  </div>
                ) : (
                  <div className="mt-1 text-xs italic text-muted-foreground">
                    {bereit ? "Hier ablegen" : "Noch offen"}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Karten</div>
          {karten.map((k) => {
            const schonVergeben = vergeben.has(k);
            const aktiv = aktiveKarte === k;
            if (schonVergeben && !geprueft) return null;
            const istAblenker = geprueft && (aufgabe.ablenker ?? []).includes(k);
            const wirdGezogen = gezogeneKarte === k;
            return (
              <div
                key={k}
                role="button"
                tabIndex={geprueft ? -1 : 0}
                aria-pressed={aktiv}
                aria-disabled={geprueft}
                onClick={() => { if (!geprueft) setAktiveKarte(aktiv ? null : k); }}
                onKeyDown={(e) => {
                  if (geprueft) return;
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAktiveKarte(aktiv ? null : k); }
                }}
                {...ziehen.kartenProps(k)}
                className={cn(
                  "flex items-stretch w-full text-left text-sm rounded-lg border bg-card transition-[opacity,border-color,background-color] duration-200 select-none",
                  !geprueft && "cursor-grab",
                  aktiv && "border-primary bg-primary/10",
                  !aktiv && !geprueft && "hover:bg-muted/50",
                  wirdGezogen && "opacity-30 border-dashed",
                  istAblenker && "opacity-60 line-through",
                )}
              >
                {!geprueft && (
                  <span
                    {...ziehen.griffProps(k)}
                    className="flex items-center px-1.5 text-muted-foreground/70 cursor-grab active:cursor-grabbing"
                    aria-label="Zum Ziehen anfassen"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                )}
                <span className={cn("flex-1 py-2 pr-3", geprueft && "pl-3")}>{k}</span>
              </div>
            );
          })}
          {karten.every((k) => vergeben.has(k)) && !geprueft && (
            <div className="text-xs italic text-muted-foreground">Alle Karten vergeben.</div>
          )}
        </div>
      </div>

      {/* Der Geist, der beim Ziehen dem Zeiger folgt. */}
      {ziehen.geistStyle && gezogeneKarte && (
        <div
          aria-hidden
          style={ziehen.geistStyle}
          className="rounded-lg border-2 border-primary bg-card px-3 py-2 text-sm shadow-xl rotate-[-1.5deg] scale-[1.03]"
        >
          {gezogeneKarte}
        </div>
      )}
    </AufgabenRahmen>
  );
}
