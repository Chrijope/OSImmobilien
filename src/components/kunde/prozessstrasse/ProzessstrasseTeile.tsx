/**
 * Prozesslinie: gemeinsame Bausteine.
 */
import { Check, CircleCheck, KeyRound, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PipelineStufeHinweis } from "@/components/kunde/PipelineStufeHinweis";
import type { Station, Strasse } from "./prozessstrasseModell";
import "./prozessstrasse.css";

export interface VarianteProps {
  stufe: string;
  rolle: string;
  /** Für die interne Kennzeichnung an Notar, wie heute `isGrundschuldUploaded`. */
  grundschuldHochgeladen?: boolean;
  /**
   * Klick auf eine Station. Im Kundenprofil hängt hier der Ablauf der
   * früheren Chip-Leiste: manuell setzen mit Rückfrage, Alt+Klick oder
   * Rollen ohne Override springen zur Karte. Die Komponente setzt nichts.
   */
  onStation?: (station: Station, e: React.MouseEvent) => void;
  /** Tooltip je Station. */
  stationTitel?: (station: Station) => string | undefined;
}

export const AKTIV = "hsl(var(--ps-aktiv))";
export const ERLEDIGT = "hsl(var(--ps-erledigt))";
export const OFFEN = "hsl(var(--ps-offen))";
export const NEIN = "hsl(var(--ps-nein))";

/** Kopf wie in der Vorlage: Station X von Y, Name, rechts der Prozentwert. */
export function StrassenKopf({ strasse }: { strasse: Strasse }) {
  const { stationen, aktuellIndex, prozent, zielErreicht, nichtErschienen } = strasse;
  const aktuell = stationen[aktuellIndex];
  const naechste = zielErreicht ? undefined : stationen[aktuellIndex + 1];
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {zielErreicht ? "Ziel erreicht" : `Station ${aktuell.nr} von ${stationen.length}`}
        </p>
        <p className="mt-0.5 text-base font-semibold leading-tight text-foreground">
          {aktuell.label}
          {nichtErschienen && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-destructive">
              <XCircle className="h-3 w-3" /> nicht erschienen
            </span>
          )}
        </p>
        {naechste && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Als Nächstes: {naechste.label}
            {naechste.istZiel && " (Ziel)"}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-semibold tabular-nums leading-none tracking-tight",
            "text-[2rem]",
          )}
          style={{ color: zielErreicht ? ERLEDIGT : "hsl(var(--foreground))" }}
        >
          {prozent}
          <span className="ml-0.5 text-[0.55em] font-medium text-muted-foreground">%</span>
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">des Wegs</p>
      </div>
    </div>
  );
}

export function Legende({ strasse }: { strasse: Strasse }) {
  const punkt = "inline-block h-2.5 w-2.5 rounded-full";
  const ziel = strasse.stationen[strasse.stationen.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className={punkt} style={{ background: ERLEDIGT }} />Erledigt</span>
      <span className="inline-flex items-center gap-1.5"><span className={punkt} style={{ background: AKTIV, boxShadow: `0 0 0 3px hsl(var(--ps-aktiv) / 0.2)` }} />Aktuelle Station</span>
      <span className="inline-flex items-center gap-1.5"><span className={cn(punkt, "border-2 bg-card")} style={{ borderColor: OFFEN }} />Noch offen</span>
      <span className="inline-flex items-center gap-1.5"><ZielSymbol strasse={strasse} className="h-3.5 w-3.5" />Ziel: {ziel.label}</span>
    </div>
  );
}

/**
 * Das Haus aus der MORE-Bildmarke (`public/images/moreimmo-icon-blau.png`),
 * als SVG nachgezeichnet, damit es die Farbe aus den Tokens nimmt. Es gibt im
 * Projekt nur PNG-Fassungen. Die weiße Aussparung ist ein Loch (evenodd), so
 * steht auf jedem Grund die Kartenfarbe darin.
 */
export function MoreHaus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 313 311" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        fill="hsl(var(--primary))"
        d="M0 311V155L158 77V2L313 76V311Z M160 81L240 120V196H300V238H240V297H195V238H80V196L160 156Z"
      />
    </svg>
  );
}

/** Ziel der Rolle: Schlüssel für „Abgeschlossen“, Haken im Kreis für „Fälligkeit“ und für jedes erreichte Ziel. */
export function ZielSymbol({ strasse, className }: { strasse: Strasse; className?: string }) {
  const Symbol = strasse.zielKey === "abgeschlossen" && !strasse.zielErreicht ? KeyRound : CircleCheck;
  return (
    <Symbol
      className={className}
      strokeWidth={2}
      style={{ color: strasse.zielErreicht ? ERLEDIGT : "hsl(var(--foreground))" }}
      aria-hidden="true"
    />
  );
}

/**
 * Der Punkt einer Station: Haken, Nummer oder leerer Ring. Ein echter Knopf,
 * damit Tastatur und Bildschirmleser die Stationen erreichen.
 */
export function StationsPunkt({
  station,
  nichtErschienen,
  groesse = 28,
  onClick,
  title,
  puls = true,
}: {
  station: Station;
  nichtErschienen?: boolean;
  groesse?: number;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  puls?: boolean;
}) {
  const aktuell = station.zustand === "aktuell";
  const ton = aktuell ? (nichtErschienen ? "--ps-nein" : "--ps-aktiv") : station.zustand === "erledigt" ? "--ps-erledigt" : "--ps-offen";
  const farbe = `hsl(var(${ton}))`;
  const g = aktuell ? groesse + 6 : groesse;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`${station.label}, ${aktuell ? "aktuelle Station" : station.zustand === "erledigt" ? "erledigt" : "noch offen"}`}
      aria-current={aktuell ? "step" : undefined}
      className={cn(
        "relative shrink-0 rounded-full outline-none transition-transform duration-300",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        onClick && "hover:scale-110 active:scale-95",
      )}
      // Ohne data-no-min zieht die Pillenregel in index.css den Kreis zum Oval.
      data-no-min
      style={{ width: g, height: g }}
    >
      {aktuell && puls && (
        <span className="ps-puls absolute inset-0 rounded-full" style={{ background: farbe }} aria-hidden="true" />
      )}
      <span
        className="absolute inset-0 grid place-items-center rounded-full text-[11px] font-semibold tabular-nums"
        style={
          station.zustand === "offen"
            ? { background: "hsl(var(--card))", border: `2px solid ${farbe}`, color: "hsl(var(--muted-foreground))" }
            : aktuell
              ? { background: "hsl(var(--card))", border: `3px solid ${farbe}`, color: farbe, boxShadow: `0 0 0 4px hsl(var(${ton}) / 0.18)` }
              : { background: farbe, color: "hsl(var(--ps-erledigt-text))" }
        }
      >
        {station.zustand === "erledigt" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : station.nr}
      </span>
    </button>
  );
}

/** Name der Station mit Info-Knopf, wie heute neben jedem Chip. */
export function StationsName({ station, className }: { station: Station; className?: string }) {
  return (
    <span lang="de" className={cn("hyphens-auto break-words", className)}>
      {station.label}
      {station.hinweis && (
        <span className="ml-1 inline-block align-[-2px] [&_svg]:h-3 [&_svg]:w-3">
          <PipelineStufeHinweis label={station.label} hinweis={station.hinweis} />
        </span>
      )}
    </span>
  );
}

/** Interne Kennzeichnung an Notar, nur intern sichtbar (wie heute). */
export function GrundschuldMarke({ hochgeladen }: { hochgeladen: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-dashed px-1.5 py-[1px] text-[10px] italic"
      style={
        hochgeladen
          ? { color: ERLEDIGT, borderColor: "hsl(var(--ps-erledigt) / 0.45)", background: "hsl(var(--ps-erledigt) / 0.08)" }
          : { color: "hsl(var(--ps-aktiv-text))", borderColor: "hsl(var(--ps-aktiv) / 0.5)", background: "hsl(var(--ps-aktiv) / 0.08)" }
      }
      title="Nur intern sichtbar, wird nicht im Kundenportal angezeigt"
    >
      {hochgeladen ? "mit GS" : "ohne GS"}
      <span className="not-italic text-[8px]" aria-hidden="true">🔒</span>
    </span>
  );
}
