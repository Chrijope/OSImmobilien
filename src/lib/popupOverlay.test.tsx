import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

/**
 * Prüft, dass die Einstellung wirklich am gerenderten Overlay ankommt.
 *
 * Der Test oben liest nur den Quelltext. Er würde nicht merken, wenn die
 * Eigenschaft zwar gesetzt, aber im Baustein nicht durchgereicht wird. Genau
 * das war bei AlertDialogContent bis eben der Fall: Die Eigenschaft gab es
 * dort schlicht nicht.
 */
function overlayVon(container: HTMLElement): HTMLElement {
  // Der Overlay liegt im Portal, also am body, nicht im Container.
  const treffer = document.body.querySelectorAll<HTMLElement>(".fixed.inset-0");
  expect(treffer.length, "kein Overlay gefunden").toBeGreaterThan(0);
  return treffer[0];
}

describe("Overlay der Popup-Bausteine", () => {
  it("dunkelt den Dialog von sich aus nicht ab", () => {
    // Projektregel seit dem 04.08.2026: Ein Popup oeffnet direkt auf der
    // Seite und blendet nichts aus. Vorher stand hier die umgekehrte
    // Erwartung, und jedes Popup musste die Einstellung selbst mitbringen.
    const { container } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const overlay = overlayVon(container);
    expect(overlay.className).toContain("bg-transparent");
    expect(overlay.className).toContain("backdrop-blur-none");
    expect(overlay.className).not.toContain("bg-black/");
    // Der Overlay bleibt liegen und faengt weiterhin Klicks ab.
    expect(overlay.className).toContain("fixed");
  });

  it("dunkelt auch den AlertDialog von sich aus nicht ab", () => {
    const { container } = render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Test</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const overlay = overlayVon(container);
    expect(overlay.className).toContain("bg-transparent");
    expect(overlay.className).not.toContain("bg-black/");
  });

  it("reicht die Einstellung an den Dialog-Overlay durch", () => {
    const { container } = render(
      <Dialog open>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <DialogTitle>Test</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const overlay = overlayVon(container);
    expect(overlay.className).toContain("bg-transparent");
    expect(overlay.className).not.toContain("backdrop-blur-md");
    // Der Overlay ist noch da und fängt weiterhin Klicks ab.
    expect(overlay.className).toContain("fixed");
  });

  it("reicht die Einstellung auch an den AlertDialog-Overlay durch", () => {
    const { container } = render(
      <AlertDialog open>
        <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <AlertDialogTitle>Test</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const overlay = overlayVon(container);
    expect(overlay.className).toContain("bg-transparent");
    expect(overlay.className).not.toContain("bg-black/80");
  });
});
