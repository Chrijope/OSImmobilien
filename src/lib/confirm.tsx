import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Rückfragen, Hinweise und Eingaben im Aussehen des Projekts.
 *
 * Die Browser-eigenen Fenster `confirm`, `alert` und `prompt` sind hier
 * ausdrücklich nicht erlaubt. Sie zeigen dem Nutzer die technische Adresse der
 * Seite („Auf id-preview….lovable.app wird Folgendes angezeigt“), lassen sich
 * nicht gestalten, tragen englische Knopfbeschriftungen und stehen in der
 * Lovable-Vorschau besonders quer. Manche Umgebungen unterdrücken sie sogar
 * stillschweigend, dann geschieht auf einen Klick hin schlicht nichts.
 *
 * Deshalb laufen alle drei Fälle über diese Datei. Sie hängt einen
 * `AlertDialog` aus `components/ui` an das Dokument, gibt ein Versprechen
 * zurück und räumt sich selbst wieder ab. Aufrufen lässt sie sich damit aus
 * jedem Klickbehandler, ohne dass die Seite einen eigenen Zustand dafür
 * braucht.
 *
 * Die Ebene `z-[90]`: Eine Rückfrage kommt oft aus einem Fenster heraus, und
 * die großen Fenster liegen auf `z-[80]` über der Kopfleiste (Objektauswahl,
 * „Für Kunden reservieren", Galerie). Mit dem `z-50` des AlertDialogs öffnete
 * sie dahinter, unsichtbar und doch modal, die Seite wäre scheinbar erstarrt.
 */

/** Hängt einen Dialog an das Dokument und räumt ihn danach wieder ab. */
function zeigeDialog(bauen: (schliessen: () => void) => React.ReactElement): void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const cleanup = () => {
    // unmount nach kurzer Verzögerung, damit die Schließ-Animation laufen kann
    setTimeout(() => {
      try { root.unmount(); } catch { /* schon abgeräumt */ }
      try { host.remove(); } catch { /* schon entfernt */ }
    }, 200);
  };

  root.render(bauen(cleanup));
}

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

/**
 * Promise-basierter Bestätigungsdialog im CI des Projekts.
 * Ersetzt den nativen `window.confirm()`.
 *
 * Die Knöpfe sollen sagen, was sie tun, nicht „OK“ und „Abbrechen“.
 *
 * Usage:
 *   if (await confirmDialog({ title: "Wirklich löschen?", confirmText: "Löschen" })) { ... }
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    zeigeDialog((cleanup) => {
      const Dialog = () => {
        const [open, setOpen] = useState(false);
        useEffect(() => { setOpen(true); }, []);

        const handle = (value: boolean) => {
          setOpen(false);
          resolve(value);
          cleanup();
        };

        return (
          <AlertDialog open={open} onOpenChange={(o) => { if (!o) handle(false); }}>
            <AlertDialogContent className="z-[90]">
              <AlertDialogHeader>
                <AlertDialogTitle>{opts.title}</AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription asChild>
                    <div className="whitespace-pre-line text-sm text-muted-foreground">
                      {opts.description}
                    </div>
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => handle(false)}>
                  {opts.cancelText || "Abbrechen"}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handle(true)}
                  className={
                    opts.variant === "destructive"
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : undefined
                  }
                >
                  {opts.confirmText || "OK"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      };
      return <Dialog />;
    });
  });
}

export interface HinweisOptions {
  title: string;
  description?: React.ReactNode;
  /** Beschriftung des einzigen Knopfes. Ohne Angabe „Verstanden“. */
  buttonText?: string;
}

/**
 * Eine Mitteilung ohne Rückfrage, im CI des Projekts.
 * Ersetzt den nativen `window.alert()`.
 *
 * Nur dort einsetzen, wo der Nutzer die Meldung wirklich bestätigen soll. Für
 * die beiläufige Rückmeldung nach einer gelungenen Aktion ist der Toast das
 * passendere Mittel, er unterbricht nicht.
 */
export function hinweisDialog(opts: HinweisOptions): Promise<void> {
  return new Promise((resolve) => {
    zeigeDialog((cleanup) => {
      const Dialog = () => {
        const [open, setOpen] = useState(false);
        useEffect(() => { setOpen(true); }, []);

        const handle = () => {
          setOpen(false);
          resolve();
          cleanup();
        };

        return (
          <AlertDialog open={open} onOpenChange={(o) => { if (!o) handle(); }}>
            <AlertDialogContent className="z-[90]">
              <AlertDialogHeader>
                <AlertDialogTitle>{opts.title}</AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription asChild>
                    <div className="whitespace-pre-line text-sm text-muted-foreground">
                      {opts.description}
                    </div>
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={handle}>
                  {opts.buttonText || "Verstanden"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      };
      return <Dialog />;
    });
  });
}

export interface AuswahlOption<T extends string> {
  wert: T;
  /** Die Beschriftung des Knopfes, sie sagt, was gewählt wird. */
  text: string;
}

export interface AuswahlOptions<T extends string> {
  title: string;
  description?: React.ReactNode;
  /** Zwei bis drei gleichrangige Möglichkeiten, als Knöpfe nebeneinander. */
  optionen: AuswahlOption<T>[];
}

/**
 * Eine Wahl zwischen gleichrangigen Möglichkeiten, im CI des Projekts.
 *
 * Für Fragen, auf die es kein Ja oder Nein gibt, etwa „Deutsch oder
 * English?“. Jede Möglichkeit ist ein eigener Knopf mit ihrem Namen, keiner
 * ist hervorgehoben. Gibt den gewählten Wert zurück, oder `null`, wenn der
 * Dialog ohne Wahl geschlossen wurde (Escape, Klick daneben).
 */
export function auswahlDialog<T extends string>(opts: AuswahlOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    zeigeDialog((cleanup) => {
      const Dialog = () => {
        const [open, setOpen] = useState(false);
        useEffect(() => { setOpen(true); }, []);
        const erledigt = useRef(false);

        const handle = (ergebnis: T | null) => {
          // Radix meldet nach einem Knopfdruck zusätzlich das Schließen.
          if (erledigt.current) return;
          erledigt.current = true;
          setOpen(false);
          resolve(ergebnis);
          cleanup();
        };

        return (
          <AlertDialog open={open} onOpenChange={(o) => { if (!o) handle(null); }}>
            <AlertDialogContent className="z-[90]">
              <AlertDialogHeader>
                <AlertDialogTitle>{opts.title}</AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription asChild>
                    <div className="whitespace-pre-line text-sm text-muted-foreground">
                      {opts.description}
                    </div>
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                {opts.optionen.map((o) => (
                  <Button key={o.wert} variant="outline" onClick={() => handle(o.wert)}>
                    {o.text}
                  </Button>
                ))}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      };
      return <Dialog />;
    });
  });
}

export interface AbfrageOptions {
  title: string;
  description?: React.ReactNode;
  /** Was am Anfang im Feld steht. */
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Eine kurze Texteingabe im CI des Projekts.
 * Ersetzt den nativen `window.prompt()`.
 *
 * Gibt den eingegebenen Text zurück oder `null`, wenn abgebrochen wurde. Ein
 * leeres Feld gilt als Abbruch, denn `prompt` verhielt sich an den
 * Aufrufstellen genauso und ein leerer Name ist nirgends brauchbar.
 */
export function abfrageDialog(opts: AbfrageOptions): Promise<string | null> {
  return new Promise((resolve) => {
    zeigeDialog((cleanup) => {
      const Dialog = () => {
        const [open, setOpen] = useState(false);
        const [wert, setWert] = useState(opts.defaultValue || "");
        useEffect(() => { setOpen(true); }, []);

        const handle = (ergebnis: string | null) => {
          setOpen(false);
          resolve(ergebnis);
          cleanup();
        };

        const bestaetigen = () => {
          const text = wert.trim();
          handle(text ? text : null);
        };

        return (
          <AlertDialog open={open} onOpenChange={(o) => { if (!o) handle(null); }}>
            <AlertDialogContent className="z-[90]">
              <AlertDialogHeader>
                <AlertDialogTitle>{opts.title}</AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription asChild>
                    <div className="whitespace-pre-line text-sm text-muted-foreground">
                      {opts.description}
                    </div>
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <Input
                autoFocus
                value={wert}
                placeholder={opts.placeholder}
                onChange={(e) => setWert(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bestaetigen(); } }}
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => handle(null)}>
                  {opts.cancelText || "Abbrechen"}
                </AlertDialogCancel>
                <AlertDialogAction onClick={bestaetigen} disabled={!wert.trim()}>
                  {opts.confirmText || "Übernehmen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      };
      return <Dialog />;
    });
  });
}
