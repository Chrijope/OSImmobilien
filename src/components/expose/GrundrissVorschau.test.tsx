import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ANGERISSEN, GrundrissVorschau } from "./GrundrissVorschau";

/**
 * Ein Plan mit mehreren Seiten (Christian, 24.09.2026): Seite 1 ganz, Seite 2
 * angerissen, der Rest im eigenen Scrollbereich. Ein einseitiger Plan bleibt
 * wie bisher. Im Druck stehen alle Seiten untereinander.
 */

// Die PDF-Attrappe: so viele Seiten, wie die Adresse im Namen trägt („plan-3.pdf“).
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: (url: string) => {
    const numPages = Number(/plan-(\d+)\.pdf/.exec(url)?.[1] ?? 1);
    return {
      promise: Promise.resolve({
        numPages,
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 848 * scale }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: () => undefined,
        }),
      }),
      destroy: async () => undefined,
    };
  },
}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({ default: "worker.js" }));

/*
 * jsdom zeichnet nicht und misst nicht. Die Leinwand liefert eine feste
 * Bildadresse, und jede Seite ist 440 px hoch mit 16 px Abstand, so wie
 * `.floor + .floor` in premiumExpose.css.
 */
const SEITE = 440;
const ABSTAND = 16;
const originale = {
  getContext: HTMLCanvasElement.prototype.getContext,
  toDataURL: HTMLCanvasElement.prototype.toDataURL,
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop"),
};
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({ fillRect: () => undefined, fillStyle: "" })) as never;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return this.classList.contains("floor") ? SEITE : 0; } });
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() { return this.classList.contains("floor") ? Array.from(this.parentElement?.children ?? []).indexOf(this) * (SEITE + ABSTAND) : 0; },
  });
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originale.getContext;
  HTMLCanvasElement.prototype.toDataURL = originale.toDataURL;
  if (originale.offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originale.offsetHeight);
  if (originale.offsetTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", originale.offsetTop);
});

const plan = (url: string, istBild = false) => ({ id: "d1", name: "Grundrisse bemaßt.pdf", url, istBild });
const zeige = (url: string, istBild = false) => render(<GrundrissVorschau dokument={plan(url, istBild)} onZoom={() => undefined} />);

describe("Grundriss mit mehreren Seiten", () => {
  it("legt die Seiten in einen fokussierbaren Scrollbereich mit Beschriftung für Bildschirmleser", async () => {
    zeige("https://x.test/plan-3.pdf");
    const kasten = await screen.findByTestId("grundriss-seiten");
    expect(kasten).toHaveAttribute("tabindex", "0");
    expect(kasten).toHaveAttribute("role", "region");
    expect(kasten).toHaveAccessibleName("Grundrisse bemaßt: Seite 1 von 3, weitere Seiten durch Scrollen");
    expect(within(kasten).getAllByRole("img")).toHaveLength(3);
    expect(within(kasten).getByText("Seite 1")).toBeInTheDocument();
    expect(within(kasten).getByText("Seite 3")).toBeInTheDocument();
    // Vollbild und Original bleiben außerhalb des Kastens stehen.
    expect(within(kasten).queryByTestId("grundriss-vollbild")).toBeNull();
    expect(screen.getByTestId("grundriss-vollbild")).toBeInTheDocument();
  });

  it("misst die Höhe an den Seiten: Seite 1 ganz, von Seite 2 ein Viertel", async () => {
    zeige("https://x.test/plan-3.pdf");
    const kasten = await screen.findByTestId("grundriss-seiten");
    fireEvent.load(within(kasten).getAllByRole("img")[1]);
    expect(kasten.style.getPropertyValue("--plan-seiten-hoehe")).toBe(`${Math.round(SEITE + ABSTAND + SEITE * ANGERISSEN)}px`);
  });

  it("nimmt den Verlauf weg, sobald das Ende erreicht ist", async () => {
    zeige("https://x.test/plan-3.pdf");
    const kasten = await screen.findByTestId("grundriss-seiten");
    expect(kasten).not.toHaveAttribute("data-ende");
    Object.defineProperty(kasten, "scrollHeight", { configurable: true, value: 1400 });
    Object.defineProperty(kasten, "clientHeight", { configurable: true, value: 566 });
    kasten.scrollTop = 834;
    fireEvent.scroll(kasten);
    expect(kasten).toHaveAttribute("data-ende", "true");
    kasten.scrollTop = 100;
    fireEvent.scroll(kasten);
    expect(kasten).not.toHaveAttribute("data-ende");
  });

  it("lässt einen einseitigen Plan und ein Bild wie bisher, ohne Scrollbereich", async () => {
    zeige("https://x.test/plan-1.pdf");
    expect(await screen.findByRole("img")).toHaveAttribute("alt", "Grundrisse bemaßt");
    expect(screen.queryByTestId("grundriss-seiten")).toBeNull();
    expect(screen.queryByText("Seite 1")).toBeNull();
    document.body.innerHTML = "";

    zeige("https://x.test/grundriss.png", true);
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByTestId("grundriss-seiten")).toBeNull();
  });
});

describe("Grundriss mit mehreren Seiten, Regeln", () => {
  const css = readFileSync(resolve(__dirname, "exposeLageGrundriss.css"), "utf8");
  const bildschirm = css.slice(0, css.indexOf("@media print"));
  const druck = css.slice(css.indexOf("@media print"));

  it("begrenzt die Höhe am Bildschirm, scrollt senkrecht und läuft über eine Maske aus", () => {
    expect(bildschirm).toMatch(/\.plan-seiten \{\s*position: relative;\s*max-height: var\(--plan-seiten-hoehe, 560px\);\s*overflow-y: auto;/);
    expect(bildschirm).toMatch(/\.plan-seiten \{[^}]*\n {2}mask-image: linear-gradient\(to bottom, #000 .*, transparent\);/);
    // Der Verlauf ist kein Element über den Seiten, er kann also nichts abfangen.
    expect(readFileSync(resolve(__dirname, "GrundrissVorschau.tsx"), "utf8")).not.toMatch(/plan-verlauf|pointer-events/);
    expect(bildschirm).toMatch(/\.plan-seiten:focus-visible \{\s*outline: 3px solid/);
  });

  it("zeigt im Druck alle Seiten untereinander", () => {
    expect(druck).toMatch(/\.plan-seiten \{\s*max-height: none;\s*overflow: visible;\s*-webkit-mask-image: none;\s*mask-image: none;/);
  });
});
