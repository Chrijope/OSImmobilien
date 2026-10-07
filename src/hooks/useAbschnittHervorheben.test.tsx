import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HERVORHEBUNG_ATTRIBUT,
  abschnittHervorheben,
  hervorhebungBeenden,
  useAbschnittHervorheben,
} from "./useAbschnittHervorheben";

const scrollIntoView = vi.fn();

function setzeReduzierteBewegung(an: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: an && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

function Seite({ ziel, verzoegert = false }: { ziel: string; verzoegert?: boolean }) {
  const { hervorheben, hervorhebenSobaldDa } = useAbschnittHervorheben();
  return (
    <div>
      <button onClick={() => (verzoegert ? hervorhebenSobaldDa(ziel) : hervorheben(ziel))}>Springen</button>
      <section id="section-bonitaet">
        <h3>Bonität</h3>
        <p>Inhalt</p>
      </section>
    </div>
  );
}

describe("useAbschnittHervorheben", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    setzeReduzierteBewegung(false);
  });
  afterEach(() => {
    hervorhebungBeenden();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrollt weich hin, zeigt den Rahmen und nimmt ihn nach drei Sekunden ab", () => {
    render(<Seite ziel="section-bonitaet" />);
    const abschnitt = document.getElementById("section-bonitaet")!;

    fireEvent.click(screen.getByRole("button", { name: "Springen" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(abschnitt).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    // Versatz für die schwebende Kopfleiste
    expect(abschnitt.style.scrollMarginTop).not.toBe("");

    act(() => vi.advanceTimersByTime(2999));
    expect(abschnitt).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    act(() => vi.advanceTimersByTime(1));
    expect(abschnitt).not.toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("legt den Fokus auf die Überschrift des Abschnitts", () => {
    render(<Seite ziel="section-bonitaet" />);
    fireEvent.click(screen.getByRole("button", { name: "Springen" }));
    const ueberschrift = screen.getByRole("heading", { name: "Bonität" });
    expect(ueberschrift).toHaveFocus();
    expect(ueberschrift).toHaveAttribute("tabindex", "-1");
  });

  it("ein zweiter Klick setzt die drei Sekunden neu, statt zu stapeln", () => {
    render(<Seite ziel="section-bonitaet" />);
    const abschnitt = document.getElementById("section-bonitaet")!;
    const knopf = screen.getByRole("button", { name: "Springen" });

    fireEvent.click(knopf);
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(knopf);

    // Der erste Zeitgeber hätte hier abgenommen.
    act(() => vi.advanceTimersByTime(1500));
    expect(abschnitt).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    act(() => vi.advanceTimersByTime(1500));
    expect(abschnitt).not.toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("nimmt beim Sprung zu einem anderen Abschnitt den alten Rahmen sofort ab", () => {
    document.body.innerHTML = '<div id="a"><h3>A</h3></div><div id="b"><h3>B</h3></div>';
    abschnittHervorheben("a");
    abschnittHervorheben("b");
    expect(document.getElementById("a")).not.toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
    expect(document.getElementById("b")).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("scrollt bei reduzierter Bewegung ohne Animation, der Rahmen bleibt", () => {
    setzeReduzierteBewegung(true);
    render(<Seite ziel="section-bonitaet" />);
    fireEvent.click(screen.getByRole("button", { name: "Springen" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(document.getElementById("section-bonitaet")).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("klappt einen eingeklappten Abschnitt vor dem Scrollen auf", () => {
    document.body.innerHTML = `
      <details id="klapp"><summary>Unterlagen</summary><h3>Unterlagen</h3></details>`;
    const details = document.getElementById("klapp") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    expect(abschnittHervorheben("klapp")).toBe(true);

    expect(details.open).toBe(true);
    // Gescrollt wird erst nach dem Aufklappen.
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(0));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("klappt auch einen Radix-Klappbereich über seinen Auslöser auf", () => {
    document.body.innerHTML = `
      <div id="radix" data-state="closed">
        <button aria-expanded="false">Finanzierung</button>
      </div>`;
    const ausloeser = document.querySelector("button")!;
    const geklickt = vi.fn();
    ausloeser.addEventListener("click", geklickt);

    abschnittHervorheben("radix");
    expect(geklickt).toHaveBeenCalledTimes(1);
  });

  it("ruft einen eigenen Aufklapper auf, wenn der Zustand in React liegt", () => {
    document.body.innerHTML = '<div id="eigen"><h3>Notar</h3></div>';
    const aufklappen = vi.fn();
    abschnittHervorheben("eigen", { aufklappen });
    expect(aufklappen).toHaveBeenCalledWith(document.getElementById("eigen"));
  });

  it("ohne Ziel passiert nichts und es gibt keinen Fehler", () => {
    render(<Seite ziel="section-gibt-es-nicht" />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Springen" }))).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(abschnittHervorheben("section-gibt-es-nicht")).toBe(false);
    expect(abschnittHervorheben(null)).toBe(false);
  });

  it("wartet beim Tiefenlink, bis der Abschnitt gezeichnet ist, und gibt dann auf", () => {
    render(<Seite ziel="section-spaeter" verzoegert />);
    fireEvent.click(screen.getByRole("button", { name: "Springen" }));
    act(() => vi.advanceTimersByTime(500));
    expect(scrollIntoView).not.toHaveBeenCalled();

    const spaeter = document.createElement("div");
    spaeter.id = "section-spaeter";
    document.body.appendChild(spaeter);
    act(() => vi.advanceTimersByTime(200));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(spaeter).toHaveAttribute(HERVORHEBUNG_ATTRIBUT);
  });

  it("hört beim Tiefenlink nach der Wartezeit auf zu suchen", () => {
    render(<Seite ziel="section-nie" verzoegert />);
    fireEvent.click(screen.getByRole("button", { name: "Springen" }));
    act(() => vi.advanceTimersByTime(5000));
    expect(vi.getTimerCount()).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
