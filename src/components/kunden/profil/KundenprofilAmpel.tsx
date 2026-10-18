import { cn } from "@/lib/utils";
import type { PortalStatus } from "@/lib/kundenportalFreischalten";

export type AmpelTon = "gruen" | "gelb" | "rot";

export interface AmpelStand {
  ton: AmpelTon;
  /** Das kurze Wort neben dem Punkt, damit die Ampel ohne Farbe lesbar ist. */
  wort: string;
  /** Der ganze Satz für Tooltip und `aria-label`. */
  satz: string;
}

/**
 * Kundenportal: grün, wenn freigeschaltet und angemeldet; gelb nur für den
 * echten Zwischenzustand „eingeladen, noch nicht angemeldet“ (und das
 * seltene „ausstehend“); rot, wenn nicht freigeschaltet oder gesperrt.
 * Die Zustände kommen aus `portalMetaLesen` (kundenportalFreischalten.ts).
 */
export function portalAmpel(status: PortalStatus): AmpelStand {
  switch (status) {
    case "aktiv": return { ton: "gruen", wort: "aktiv", satz: "Kundenportal aktiv, der Kunde hat sich angemeldet." };
    case "eingeladen": return { ton: "gelb", wort: "eingeladen", satz: "Kundenportal freigeschaltet und eingeladen, der Kunde hat sich noch nicht angemeldet." };
    case "ausstehend": return { ton: "gelb", wort: "ausstehend", satz: "Kundenportal ausstehend." };
    case "gesperrt": return { ton: "rot", wort: "gesperrt", satz: "Kundenportal gesperrt, der Kunde kann sich nicht anmelden." };
    default: return { ton: "rot", wort: "aus", satz: "Kundenportal nicht freigeschaltet." };
  }
}

/**
 * Empfehlungsprogramm: Es gibt nur aktiv oder nicht
 * (`meta.empfehlungsprogramm_aktiv`), einen offenen Antrag kennt das CRM
 * nicht. Deshalb kein Gelb.
 */
export function empfehlungAmpel(aktiv: boolean): AmpelStand {
  return aktiv
    ? { ton: "gruen", wort: "aktiv", satz: "Empfehlungsprogramm aktiv." }
    : { ton: "rot", wort: "aus", satz: "Empfehlungsprogramm nicht eingerichtet." };
}

const PUNKT: Record<AmpelTon, string> = {
  gruen: "bg-[hsl(var(--success))]",
  gelb: "bg-[hsl(var(--fortschritt-aktiv))]",
  rot: "bg-destructive",
};

/** Punkt plus Wort, der Satz steht in Tooltip und `aria-label`. */
export function KundenprofilAmpel({ stand, className }: { stand: AmpelStand; className?: string }) {
  return (
    <span
      role="img"
      aria-label={stand.satz}
      title={stand.satz}
      data-ampel={stand.ton}
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground", className)}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", PUNKT[stand.ton])} />
      <span aria-hidden="true">{stand.wort}</span>
    </span>
  );
}
