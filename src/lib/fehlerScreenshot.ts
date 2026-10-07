/**
 * Bildschirmfoto für die Fehlermeldung.
 *
 * Benutzt `html2canvas-pro`, das im Projekt bereits für den PDF-Export der
 * Präsentation liegt. Aufgenommen wird nur der sichtbare Bereich, nicht die
 * ganze Seite, weil ein zehntausend Pixel hohes Kundenprofil weder hilft noch
 * hochgeladen werden sollte.
 *
 * Datenschutz: Das Bild wird niemals ungefragt versendet. Der Dialog zeigt es
 * als Vorschau, und es lässt sich mit einem Klick entfernen. Die Entscheidung,
 * ob ein Kundenprofil im Ticket landet, trifft der Partner, nicht die Software.
 */

const MAX_KANTE = 1600;
const QUALITAET = 0.8;

/**
 * Nimmt den sichtbaren Bereich auf.
 *
 * Gibt null zurück, wenn etwas schiefgeht. Ein fehlgeschlagenes Bildschirmfoto
 * darf die Fehlermeldung nie blockieren, sonst verliert man die Meldung wegen
 * des Beiwerks.
 */
export async function macheBildschirmfoto(): Promise<File | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  try {
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(document.body, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      useCORS: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      // Nur der sichtbare Ausschnitt, nicht das gesamte Dokument.
      width: window.innerWidth,
      height: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      // Der Meldedialog selbst gehört nicht aufs Bild.
      ignoreElements: (el) =>
        el.hasAttribute?.("data-fehler-dialog") ||
        el.getAttribute?.("role") === "dialog" ||
        el.hasAttribute?.("data-sonner-toaster"),
    });

    const verhaeltnis = Math.min(1, MAX_KANTE / Math.max(canvas.width, canvas.height));
    let ziel: HTMLCanvasElement = canvas;
    if (verhaeltnis < 1) {
      const klein = document.createElement("canvas");
      klein.width = Math.round(canvas.width * verhaeltnis);
      klein.height = Math.round(canvas.height * verhaeltnis);
      const ctx = klein.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, klein.width, klein.height);
        ziel = klein;
      }
    }

    const blob: Blob | null = await new Promise((resolve) =>
      ziel.toBlob((b) => resolve(b), "image/jpeg", QUALITAET),
    );
    if (!blob) return null;
    return new File([blob], "bildschirmfoto.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (e) {
    // Absichtlich nur eine Warnung: Der Fehler, den der Partner melden will,
    // ist wichtiger als das Bild davon.
    console.warn("Bildschirmfoto fehlgeschlagen", e);
    return null;
  }
}
