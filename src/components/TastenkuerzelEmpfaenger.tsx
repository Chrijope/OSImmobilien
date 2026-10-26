import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KUERZEL_AUFGABE, kuerzelFuer, kuerzelListe } from "@/lib/tastenkuerzel";

/*
 * Nimmt die Tastenkürzel des CRM entgegen (A8, 26.10.2026). Regeln in
 * `lib/tastenkuerzel.ts`. Hängt einmal im App-Rahmen (DashboardLayout).
 */

/** Hauptaktion eines offenen Dialogs: ausdrücklich markiert, sonst nach Beschriftung. */
const HAUPTAKTION = /^(Speichern|Anlegen|Erstellen|Senden|Übernehmen|Bestätigen|Hinzufügen)\b/;

function speichereImDialog(dialog: Element): void {
  const aktiv = document.activeElement;
  const formular = aktiv instanceof HTMLElement ? aktiv.closest("form") : null;
  if (formular && dialog.contains(formular)) {
    formular.requestSubmit();
    return;
  }
  const knoepfe = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
  const markiert = knoepfe.find((k) => k.hasAttribute("data-hauptaktion"));
  const nachText = knoepfe.filter((k) => HAUPTAKTION.test((k.textContent || "").trim()));
  (markiert ?? nachText[nachText.length - 1])?.click();
}

export function TastenkuerzelEmpfaenger() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [uebersicht, setUebersicht] = useState(false);

  useEffect(() => {
    const aufTaste = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const dialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      const aktion = kuerzelFuer(e, !!dialog);
      if (!aktion) return;
      e.preventDefault();
      if (aktion === "uebersicht") setUebersicht(true);
      else if (aktion === "neuer-kontakt") navigate("/alle-kontakte?neu=1");
      else if (aktion === "neue-aufgabe") {
        // Nur im Kundenprofil gibt es „den“ Kunden, für den die Aufgabe gilt.
        if (/^\/kunden\/[^/]+/.test(pathname)) window.dispatchEvent(new CustomEvent(KUERZEL_AUFGABE));
      } else if (aktion === "dialog-speichern" && dialog) speichereImDialog(dialog);
    };
    document.addEventListener("keydown", aufTaste);
    return () => document.removeEventListener("keydown", aufTaste);
  }, [navigate, pathname]);

  return (
    <Dialog open={uebersicht} onOpenChange={setUebersicht}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
          <DialogDescription>Einfache Tasten wirken nicht, während du in ein Feld tippst.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y">
          {kuerzelListe().map((k) => (
            <div key={k.was} className="flex items-center justify-between gap-4 py-2 text-fliesstext">
              <dt>{k.was}</dt>
              <dd className="flex gap-1">
                {k.tasten.map((t) => (
                  <kbd key={t} className="min-w-[1.75rem] rounded-md border bg-muted px-1.5 py-0.5 text-center text-hinweis font-medium">{t}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
