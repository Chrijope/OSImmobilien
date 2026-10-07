/**
 * Die Bausteine der AfA-Strecke: Fortschritt, Frage, Kachel, Kennzahl.
 *
 * Sie liegen zusammen in einer Datei, weil sie nur hier gebraucht werden und
 * jede fuer sich zu klein fuer eine eigene waere. Das Vorbild ist
 * `steuerrechner/bausteine.tsx`.
 *
 * Warum eigene Bausteine und nicht die des Steuerrechners: Jene sind auf die
 * oeffentliche Seite zugeschnitten und haengen an deren CSS-Klassen. Der
 * AfA-Rechner ist ausschliesslich intern und soll nach CRM aussehen, also nach
 * Card, Button und den Tokens aus `index.css`.
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Achtet der Nutzer auf reduzierte Bewegung? */
export function moechteWenigBewegung(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );

export const eurGenau = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n || 0);

export const prozent = (n: number, stellen = 2) =>
  `${(n || 0).toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} %`;

/* ── Fortschritt ────────────────────────────────────────────────────────── */

/**
 * Der Weg durch die Fragen: gleich breite Abschnitte, der laufende eigens
 * getoent. Eine Position allein sagt nur, wie weit es noch ist. Mit dem
 * Stichwort daneben sagt sie auch, worum es gerade geht.
 */
export function Fortschritt({ schritt, gesamt, label }: { schritt: number; gesamt: number; label?: string }) {
  return (
    <div className="mb-5">
      <div className="flex gap-1" role="progressbar" aria-valuenow={schritt} aria-valuemin={1} aria-valuemax={gesamt}>
        {Array.from({ length: gesamt }, (_, i) => {
          const erledigt = i < schritt - 1;
          const laeuft = i === schritt - 1;
          return (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  erledigt ? "w-full bg-primary" : laeuft ? "w-full bg-primary/45" : "w-0 bg-primary"
                }`}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Schritt {schritt} von {gesamt}
        </span>
        {label && (
          <>
            <span aria-hidden="true">·</span>
            <span>{label}</span>
          </>
        )}
      </p>
    </div>
  );
}

/* ── Karte mit einer Frage ──────────────────────────────────────────────── */

export function Frage({
  titel,
  hinweis,
  children,
}: {
  titel: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div aria-hidden="true" className="h-0.5 w-full bg-primary/70" />
      <div className="p-6 md:p-8">
        <h2 className="text-xl font-semibold leading-snug tracking-tight text-foreground md:text-2xl">{titel}</h2>
        {hinweis && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{hinweis}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </Card>
  );
}

/* ── Antwortkachel ueber die volle Breite ───────────────────────────────── */

/**
 * Eine Antwort. Das Gewaehlte traegt nicht nur einen Rahmen, sondern auch einen
 * Haken: Die Auswahl ist damit nicht allein an der Farbe zu erkennen.
 */
export function Kachel({
  titel,
  unterzeile,
  gewaehlt,
  onClick,
}: {
  titel: string;
  unterzeile?: string;
  gewaehlt: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={gewaehlt}
      className={`flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        gewaehlt
          ? "border-primary bg-accent"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${gewaehlt ? "text-accent-foreground" : "text-foreground"}`}>
          {titel}
        </span>
        {unterzeile && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{unterzeile}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          gewaehlt ? "border-primary bg-primary" : "border-input bg-transparent"
        }`}
      >
        {gewaehlt && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
      </span>
    </button>
  );
}

/* ── Knopf ueber die volle Breite ───────────────────────────────────────── */

export function Weiter({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  // Mindestens 44 Pixel hoch, sonst ist der Knopf auf dem Handy mit dem Daumen
  // kaum zu treffen.
  return (
    <Button type="button" variant="brand" size="lg" onClick={onClick} disabled={disabled} className="mt-6 min-h-[3rem] w-full">
      {children}
    </Button>
  );
}

/* ── Kennzahl: Bezeichnung, Wert, Fussnote ──────────────────────────────── */

export function Kennzahl({
  bezeichnung,
  wert,
  fussnote,
  betont = false,
}: {
  bezeichnung: string;
  wert: React.ReactNode;
  fussnote?: React.ReactNode;
  betont?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${betont ? "border-2 border-primary/20 bg-primary/5" : "bg-muted/50"}`}
    >
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{bezeichnung}</p>
      <p className={`font-bold ${betont ? "text-2xl text-primary" : "text-lg"}`}>{wert}</p>
      {fussnote && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{fussnote}</p>}
    </div>
  );
}
