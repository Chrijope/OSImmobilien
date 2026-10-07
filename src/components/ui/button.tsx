import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.16)] hover:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.98]",
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
        // Gruen fuer "erledigt": derselbe Knopf, nachdem die Hauptaktion
        // gelaufen ist, etwa "Paket bestaetigt & Vertrag erstellt" mit Datum.
        // Bewusst emerald statt --success, siehe KennenlernMailVermerk.tsx
        // zum Kontrast. Im Dunkelmodus hellt der Hover auf, damit der Knopf
        // auf dunklen Karten nicht im Grund versinkt.
        erfolg: "bg-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-500 focus-visible:ring-emerald-600 shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.18)] active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp data-ui="button" className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
