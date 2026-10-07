/**
 * Der Einblender „Wie es jetzt weitergeht“.
 *
 * Er steht am Ende der oeffentlichen Strecke, dort wo der Interessent gerade
 * seine Kontaktdaten gegeben hat. Drei Dinge halten diese Tests fest:
 *
 *   1  ER ZEIGT NUR VIER FELDER. Name, Position, Bild, Mailadresse und
 *      Telefonnummer, und nichts sonst. Das ist die Lehre aus der
 *      Exposé-Schnittstelle vom 16.09.2026, die mit einem Sternchen-Abruf die
 *      kompletten Rohdaten herausgab. Seither gilt die Positivliste. Die
 *      `userId` darf auf keiner oeffentlichen Seite auftauchen.
 *   2  OHNE MAILADRESSE KEINE KARTE. Christian am 17.09.2026: Ist kein Kontakt
 *      hinterlegt, soll nur zugesagt werden, dass wir uns zeitnah
 *      zurueckmelden. Die Schwelle ist die Mailadresse, die Begruendung steht
 *      im Kopf der Komponente.
 *   3  KEINE LEEREN FELDER. Ein Partner ohne Telefonnummer bekommt keine leere
 *      Zeile, ein Partner ohne Bild bekommt seine Initialen.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AnsprechpartnerEinblender from "./AnsprechpartnerEinblender";

const VOLL = {
  name: "Christian Peetz",
  position: "Dein Ansprechpartner bei OS Immobilien",
  telefon: "+49 30 863289210",
  email: "os@os-immobilien.com",
  bild: "https://example.com/bild.png",
  userId: "auth-4711",
};

const zeige = (berater?: typeof VOLL | Partial<typeof VOLL>) => {
  cleanup();
  render(
    <AnsprechpartnerEinblender
      offen
      onSchliessen={() => {}}
      berater={berater as never}
    />,
  );
};

describe("Der Einblender mit dem Ansprechpartner", () => {
  it("zeigt Name, Position, Bild, Mail und Telefon des Partners aus dem Link", () => {
    zeige(VOLL);
    expect(screen.getByText(/Christian Peetz meldet sich zeitnah bei dir/)).toBeTruthy();
    expect(screen.getByText("Dein Ansprechpartner bei OS Immobilien")).toBeTruthy();
    expect(screen.getByRole("link", { name: /\+49 30 863289210/ })).toHaveAttribute(
      "href",
      "tel:+4930863289210",
    );
    expect(screen.getByRole("link", { name: /os@os-immobilien\.com/ })).toHaveAttribute(
      "href",
      "mailto:os@os-immobilien.com",
    );
  });

  it("laesst die Auth-Kennung des Partners nirgends auftauchen", () => {
    zeige(VOLL);
    expect(document.body.textContent).not.toContain("auth-4711");
    expect(document.body.innerHTML).not.toContain("auth-4711");
  });

  /* ── Der Fall ohne Partner ───────────────────────────────────────────────
     Christian am 17.09.2026, woertlich: „dann bitte nur angeben, dass wir uns
     zeitnah zurueckmelden, um mit ihm persoenlich seine individuellen
     Moeglichkeiten zu besprechen.“ */

  it("sagt ohne Partner am Link nur die Rueckmeldung zu", () => {
    zeige(undefined);
    expect(
      screen.getByText(
        "Wir melden uns zeitnah bei dir zurück, um mit dir persönlich deine individuellen Möglichkeiten zu besprechen.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tut dasselbe, wenn ein Partner am Link haengt, aber keine Mailadresse hat", () => {
    // Der heimtueckischere Fall: Name und Bild sind da, ein Kontaktweg fehlt.
    zeige({ name: "Christian Peetz", bild: "https://example.com/bild.png", userId: "auth-4711" });
    expect(screen.getByText(/Wir melden uns zeitnah bei dir zurück/)).toBeTruthy();
    expect(screen.queryByText(/Christian Peetz meldet sich/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("nennt keine Frist, die der offene Pool nicht halten kann", () => {
    zeige(undefined);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/24 Stunden|noch heute|innerhalb von|Werktag/);
  });

  /* ── Keine leeren Felder ─────────────────────────────────────────────── */

  it("laesst die Telefonzeile weg, wenn keine Nummer hinterlegt ist", () => {
    zeige({ name: "Christian Peetz", email: "os@os-immobilien.com" });
    expect(screen.getByRole("link", { name: /os@os-immobilien\.com/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^\+/ })).toBeNull();
    // Und keine Zeile fuer eine Position, die es nicht gibt.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("zeigt ohne Bild die Initialen statt einer leeren Flaeche", () => {
    zeige({ name: "Christian Peetz", email: "os@os-immobilien.com" });
    expect(screen.getByText("CP")).toBeTruthy();
  });
});
