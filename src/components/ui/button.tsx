import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Check } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SPEICHER_SIGNAL, type SpeicherErgebnis } from "@/lib/speicherSignal";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,opacity,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.22)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.16)] hover:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.22)]",
        outline: "border border-input bg-card hover:bg-accent hover:text-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        tinted: "bg-primary/10 text-primary hover:bg-primary/15",
        // Marken-Orange: der Knopf, der den Nutzer weiterbringt. In der Regel
        // einer je Seite; in einer Liste gleichartiger Zeilen darf es die eine
        // Handlung je Zeile sein, etwa "Betreten" bei den Gespraechen. Alles
        // daneben bleibt leise. Farbe und Verlauf stehen in index.css unter
        // .btn-brand, das umrandete Gegenstueck unter .btn-brand-umriss.
        brand: "btn-brand focus-visible:ring-brand-orange",
        // "Erledigt": derselbe Knopf, nachdem die Hauptaktion gelaufen ist,
        // etwa "Paket bestaetigt & Vertrag erstellt" mit Datum. Nach der
        // Markenrichtlinie (18.10.2026) flach: Mint hell als Flaeche, Schrift
        // Markengruen tief (5,4:1), Linie Markengruen. Im Dunkeln Tannengruen 2
        // mit Mint-Schrift, beides ueber accent.
        erfolg: "bg-accent text-accent-foreground border border-success/40 hover:bg-accent/80 focus-visible:ring-ring",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-full px-3",
        lg: "h-11 rounded-full px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Haken nach dem Speichern (01.11.2026). Ohne Angabe gilt das für jeden
   * Knopf mit „speicher…“ in der Beschriftung: Er wartet nach dem Klick auf
   * die erste Rückmeldung (`lib/speicherSignal.ts`) und zeigt nur bei Erfolg
   * kurz einen Haken mit „Gespeichert“. `true` heißt: Das Versprechen aus
   * `onClick` entscheidet, es muss mit `true` enden. `false` schaltet ab.
   */
  haken?: boolean;
}

const WARTEN_MS = 8000;
const ZEIGEN_MS = 1600;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, haken, onClick, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const [gespeichert, setGespeichert] = React.useState(false);
    // Wartet der Knopf gerade auf eine Rückmeldung? Beim Abbau wird aufgeräumt.
    const warten = React.useRef<(() => void) | null>(null);
    React.useEffect(() => () => warten.current?.(), []);
    const zeigen = React.useCallback((knopf: HTMLElement) => {
      setGespeichert(true);
      window.setTimeout(() => setGespeichert(false), ZEIGEN_MS);
      // In Dialogen wartet die Schließ-Animation kurz, damit der Haken zu sehen ist.
      const huelle = knopf.closest<HTMLElement>('[data-ui="dialog"], [data-ui="sheet"]');
      if (huelle) {
        huelle.setAttribute("data-gespeichert", "");
        window.setTimeout(() => huelle.removeAttribute("data-gespeichert"), ZEIGEN_MS);
      }
    }, []);
    const klick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (asChild || haken === false) return onClick?.(e);
      const knopf = e.currentTarget;
      if (haken === true) {
        const ergebnis = onClick?.(e) as unknown;
        if (ergebnis instanceof Promise) ergebnis.then((ok) => ok === true && zeigen(knopf), () => {});
        return;
      }
      if (!/speicher/i.test(e.currentTarget.textContent ?? "")) return onClick?.(e);
      // Vor dem Klick lauschen: Manche Abläufe melden sich sofort.
      warten.current?.();
      let erledigt = false;
      const ende = () => {
        erledigt = true;
        warten.current = null;
        window.removeEventListener(SPEICHER_SIGNAL, hoeren);
        window.clearTimeout(frist);
      };
      const hoeren = (ev: Event) => {
        if (erledigt) return;
        const ok = (ev as CustomEvent<SpeicherErgebnis>).detail === "ok";
        ende();
        if (ok) zeigen(knopf);
      };
      window.addEventListener(SPEICHER_SIGNAL, hoeren);
      const frist = window.setTimeout(ende, WARTEN_MS);
      warten.current = ende;
      onClick?.(e);
    };
    return (
      <Comp data-ui="button" className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={asChild ? onClick : klick} {...props}>
        {gespeichert ? (
          <>
            <Check className="bew-plopp" aria-hidden="true" />
            <span role="status">Gespeichert</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
