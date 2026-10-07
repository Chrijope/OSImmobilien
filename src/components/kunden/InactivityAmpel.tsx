/**
 * Der Status hinter dem Kundennamen.
 *
 * Er zeigt jetzt dasselbe wie die Kachel in der Pipeline. Vorher hatte diese
 * Anzeige eine eigene, ältere Logik: Sie kannte weder Aufgaben noch die
 * Zuordnung zum Investment und maß ausschließlich die Zeit seit der letzten
 * Änderung. Auf der Kachel stand deshalb "Termin 64d überfällig" und im Profil
 * daneben ein grauer Punkt ohne Zahl.
 */
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INACTIVITY_THRESHOLDS } from "@/lib/inactivityThresholds";
import { berechneInaktivitaetsAmpel } from "@/lib/inaktivitaetsAmpel";
import { AMPEL_PUNKT_KLASSEN } from "./ampelPunkt";
import { PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import type { KundeData } from "@/lib/kundenStore";
import type { PipelineStufe } from "@/lib/kontaktPipeline";

interface Props {
  kunde: KundeData;
  stufeOverride?: PipelineStufe;
  /** Investment, auf das sich der Status bezieht. */
  investmentId?: string;
  /** Größe des Punkts: sm = 8px, md = 10px */
  size?: "sm" | "md";
  /** Text neben dem Punkt anzeigen, etwa "Termin 64d überfällig". */
  showLabel?: boolean;
  className?: string;
}

function stufenLabel(stufe: PipelineStufe): string {
  return PIPELINE_STUFEN.find((s) => s.key === stufe)?.label || stufe;
}

export function InactivityAmpel({
  kunde,
  stufeOverride,
  investmentId,
  size = "sm",
  showLabel = false,
  className = "",
}: Props) {
  // Dieselbe Rechnung wie in der Kachel "Nächste Aktion" im Kundenprofil.
  const ampel = berechneInaktivitaetsAmpel(kunde, { stufeOverride, investmentId });
  const { stufe, naechster, tage, bewertung, titel, kurztext } = ampel;

  // Dieselbe Farbtabelle wie der Punkt in der Kachel "Nächste Aktion".
  const punktKlasse = AMPEL_PUNKT_KLASSEN[ampel.ton];

  const textKlasse =
    bewertung.farbe === "red"
      ? "text-red-600 font-semibold"
      : bewertung.farbe === "orange"
      ? "text-orange-600 font-semibold"
      : "text-muted-foreground";

  const schwellen = INACTIVITY_THRESHOLDS[stufe];
  const dotSize = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  const terminText = naechster
    ? `${naechster.bezeichnung}${naechster.titel ? ` (${naechster.titel})` : ""} am ${new Date(
        naechster.zeitpunkt,
      ).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })} Uhr`
    : null;

  return (
    <div className={`inline-flex items-center gap-1 min-w-0 ${className}`} onClick={(e) => e.stopPropagation()}>
      <span
        className={`inline-block shrink-0 rounded-full ${dotSize} ${punktKlasse}`}
        aria-label={titel}
        title={titel}
      />
      {/*
        Farbe ist nie der einzige Traeger der Aussage. Fehlt der Kurztext,
        etwa weil nichts ueberfaellig ist, steht statt seiner die Ueberschrift
        da ("Aktiv", "Termin geplant"). Sonst stuende an der Stelle, wo die
        Ampel jetzt unter dem Namen sitzt, ein farbiger Punkt ganz ohne Wort.
      */}
      {/*
        Kein `whitespace-nowrap` mehr: Seit dem 16.09.2026 steht die Ampel in
        der schmalen linken Spalte des Kundenprofils. Ein langer Text wie
        "Beratungsgespraech 14d ueberfaellig" haette die Karte dort seitlich
        gesprengt. In den Tabellen faellt das nicht ins Gewicht, dort wird der
        Text gar nicht erst angezeigt.
      */}
      {showLabel && (
        <span className={`text-[10px] leading-tight min-w-0 ${textKlasse}`}>{kurztext || titel}</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center rounded text-muted-foreground hover:text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="Status-Details"
          >
            <Info className={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs space-y-1">
            <div className="font-semibold">{titel}</div>
            <div>
              <span className="text-muted-foreground">Stufe:</span> {stufenLabel(stufe)}
            </div>
            {terminText && (
              <div>
                <span className="text-muted-foreground">
                  {naechster?.ueberfaellig ? "Fällig war:" : "Nächster Kontakt:"}
                </span>{" "}
                {terminText}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Ohne Aktivität seit:</span> {tage}d
            </div>
            {schwellen && (
              <div>
                <span className="text-muted-foreground">Schwellen ohne Termin:</span> orange ab{" "}
                {schwellen[0]}d, rot ab {schwellen[1]}d
              </div>
            )}
            <div className="text-muted-foreground pt-1 border-t border-border/40">
              {bewertung.grund === "eingeplant"
                ? "Ein Termin, eine Aufgabe oder ein Follow-Up in der Zukunft ist hinterlegt, es ist nichts zu tun."
                : bewertung.grund === "termin_versaeumt"
                ? "Ein vereinbarter Termin ist verstrichen, ohne dass ein neuer geplant wurde."
                : bewertung.grund === "keine_regel"
                ? "Für diese Stufe wird kein Status angezeigt."
                : "Gemessen wird die Zeit seit der letzten Aktivität am Kontakt."}
            </div>
            {/* Standard-Erinnerung aus dem Kultur-Modul: erinnern, nicht bevormunden. */}
            {bewertung.grund !== "eingeplant" && bewertung.grund !== "keine_regel" && (
              <div className="text-primary/90 pt-1">
                Unser Standard: Jeder Kunde hat immer einen nächsten Termin oder eine offene
                Aufgabe. Nie nichts.
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
