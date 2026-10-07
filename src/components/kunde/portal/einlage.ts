import { cn } from "@/lib/utils";

/**
 * Die Innenkachel im Kundenportal, also die Karte in der Karte: Kennzahlen,
 * Objektangaben, Kaufpreis und Ähnliches.
 *
 * Vorher hatte jede Stelle ihre eigene Fläche (`bg-muted/50`, `bg-white/85`,
 * `bg-card/60` mit Weichzeichnung) und ihren eigenen Radius. Im Dunkelmodus
 * blieben manche davon hell. Jetzt gibt es eine Form:
 *
 *  - `bg-card` und `border-border/60`, beides Tokens mit Dunkelwert,
 *  - `data-ui="card"`, damit Liquid Glass sie als Einlage zeichnet: ohne
 *    zweite Weichzeichnung, mit Lichtkante und dem Radius der Einlage
 *    (design-liquid.css und kundenportal-liquid.css, „Glas in Glas“).
 *
 * Verwendung: `<div {...einlage("p-3")}>…</div>`.
 */
export const EINLAGE_KLASSE = "rounded-xl border border-border/60 bg-card";

export function einlage(zusatz?: string) {
  return { "data-ui": "card", className: cn(EINLAGE_KLASSE, zusatz) } as const;
}
