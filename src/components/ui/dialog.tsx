import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
            /*
       * Projektregel: Ein Popup oeffnet direkt auf der Seite und blendet
       * nichts aus. Kein Abdunkeln, kein Weichzeichner, die Seitenleiste
       * bleibt sichtbar. Der Overlay bleibt aber liegen, denn er faengt die
       * Klicks ab: Ein Klick daneben schliesst weiterhin, und niemand
       * navigiert versehentlich weg, waehrend ein Formular offen ist.
       */
      "fixed inset-0 z-50 bg-transparent backdrop-blur-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Optional className(s) forwarded to the default DialogOverlay. Useful to
     *  shift the dim/blur past a persistent sidebar so it remains visible. */
    overlayClassName?: string;
  }
>(({ className, children, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      // Haken fuer Liquid Glass (styles/design-liquid.css), ohne Wirkung sonst.
      data-ui="dialog"
      className={cn(
        /*
          `max-h` und `overflow-y-auto` gehoeren hierher, nicht an jeden
          einzelnen Dialog.

          Christian hat am 14.09.2026 gemeldet, dass sich "Bewerber erfassen"
          auf dem Handy nicht bedienen laesst: Der Dialog wuchs ueber den
          Bildschirm hinaus, und weil kein Scrollbereich festgelegt war, blieb
          der untere Teil samt Speichern-Knopf unerreichbar. Kein Wischen half,
          denn es gab nichts zu scrollen.

          26 Dialoge im Projekt hatten dasselbe Problem, es faellt nur bei
          langen Formularen auf. Einzeln geflickt waere es beim 27. wieder da,
          deshalb steht die Regel hier in der Grundkomponente.

          Kurze Dialoge aendern sich dadurch nicht: Sie erreichen die Grenze
          von 90 Prozent der Fensterhoehe nie. Wer sie fuer einen Dialog
          ueberschreiben will, gibt weiterhin eigene Klassen mit, sie stehen
          weiter unten und gewinnen.
        */
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/60 bg-card p-6 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25)] duration-200 max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-2xl",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[18px] font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
