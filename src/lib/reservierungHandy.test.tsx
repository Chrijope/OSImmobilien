import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { reservierungUntertitel } from "@/lib/reservierungKopf";
import { FormProgress } from "@/components/ui/form-progress";

/*
 * Reservierungsformular auf dem Handy (Befund vom 24.09.2026). jsdom rechnet
 * kein Layout, geprüft werden Texte und Klassen.
 */
const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

describe("Unterzeile ohne Gedankenstrich", () => {
  it("setzt Kommas statt Gedankenstrichen, auch im Objekttitel", () => {
    expect(reservierungUntertitel("Otto Hans", "Espanstraße 5 - Nürnberg")).toBe("Reservierung für Otto Hans, Espanstraße 5, Nürnberg");
    expect(reservierungUntertitel("Otto Hans", "Espanstraße 5 – Nürnberg")).toBe("Reservierung für Otto Hans, Espanstraße 5, Nürnberg");
  });
  it("lässt Bindestriche in Namen stehen", () => {
    expect(reservierungUntertitel("Anna Müller-Lüdenscheidt", "Hans-Sachs-Str. 3")).toBe("Reservierung für Anna Müller-Lüdenscheidt, Hans-Sachs-Str. 3");
  });
  it("ohne Objekt und ohne Kunde", () => {
    expect(reservierungUntertitel("Otto Hans", undefined)).toBe("Reservierung für Otto Hans");
    expect(reservierungUntertitel("", "X")).toBe("Neue Reservierung erstellen");
  });
});

describe("Kopf der Fortschrittskette", () => {
  it("bricht um statt zu überlappen, der Schritttitel wird nicht abgeschnitten", () => {
    render(<FormProgress eyebrow="Reservierungsvereinbarung" steps={["Kunde", "Objekt", "Reservierung & Abschluss"]} current={2} />);
    const kopf = screen.getByTestId("form-progress-kopf");
    expect(kopf.className).toContain("flex-wrap");
    const titel = screen.getByTestId("form-progress-titel");
    expect(titel).toHaveTextContent("Reservierung & Abschluss");
    expect(titel.className).not.toContain("truncate");
    expect(titel.className).toContain("break-words");
  });
});

describe("Formular und Auswahlfenster", () => {
  it("die Zeile „Ich akzeptiere“ ist als Ganzes klickbar und mindestens 44 px hoch", () => {
    const quelle = lies("src/components/reservierung/ReservierungsForm.tsx");
    const start = quelle.indexOf('data-testid="erklaerung-zeile"');
    expect(start).toBeGreaterThan(-1);
    const zeile = quelle.slice(quelle.lastIndexOf("<label", start), quelle.indexOf("</label>", start));
    expect(zeile).toContain('htmlFor="erk"');
    expect(zeile).toContain("min-h-[44px]");
    expect(zeile).toContain('id="erk"');
    expect(zeile).toContain("Ich akzeptiere die vorstehende Reservierungsvereinbarung");
  });

  it("„Weiter“ klebt im Auswahlfenster unten", () => {
    const quelle = lies("src/components/reservierung/KundeZuordnenDialog.tsx");
    expect(quelle).toMatch(/<DialogFooter className="sticky bottom-0[^"]*"/);
  });

  it("keine Gedankenstriche mehr in Kopfzeile, internem Hinweis und Willkommensfenster", () => {
    expect(lies("src/pages/Reservierung.tsx")).not.toMatch(/Reservierung für \$\{kundeName\}[^\n]*–/);
    expect(lies("src/components/reservierung/ReservierungsForm.tsx")).not.toContain("Interner Hinweis –");
    expect(lies("src/components/tutorial/CrmTutorial.tsx")).not.toContain("pausieren –");
  });
});
