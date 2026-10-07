/**
 * Die Eintragung nach dem Ergebnis.
 *
 * Drei Dinge haelt dieser Test fest:
 *   1  Ohne Pflichthaken geht nichts raus, und die Meldung sagt, was fehlt.
 *      Derselbe Massstab wie bei `ErgebnisFreischalten`: ein Pflichthaken und
 *      ein davon GETRENNTER freiwilliger Haken.
 *   2  Die Auswertung entsteht erst, NACHDEM der Lead angekommen ist. Sie ist
 *      die Gegenleistung fuer die Kontaktdaten, nicht der Vorschuss.
 *   3  Was passiert, wenn die Mail nicht ankommt. Ein Interessent, der seine
 *      Daten hergegeben und nichts bekommen hat, ist schlimmer als einer, der
 *      sich nie eingetragen hat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendeSteuerLead = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true, kontaktId: "kontakt-1" })),
);
const sendeSteuerAuswertung = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({
    ok: true,
    mailVersendet: true,
    pdfUrl: "https://ablage.example/auswertung.pdf",
    blob: new Blob(["%PDF"], { type: "application/pdf" }),
    dateiname: "auswertung.pdf",
  })),
);
const ladeAuswertungHerunter = vi.hoisted(() => vi.fn());

vi.mock("@/lib/steuerrechnerLead", async () => {
  const echt = await vi.importActual<typeof import("@/lib/steuerrechnerLead")>(
    "@/lib/steuerrechnerLead",
  );
  return { ...echt, sendeSteuerLead };
});
vi.mock("@/lib/steuerrechnerVersand", () => ({ sendeSteuerAuswertung, ladeAuswertungHerunter }));

import SteuerFormular from "./SteuerFormular";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben } from "@/lib/steuerrechnerStrecke";
import { LEAD_EINWILLIGUNG_TEXT, LEAD_WERBUNG_TEXT } from "@/lib/leadEinwilligung";

const ANTWORTEN = { ...standardAntworten(), startzeitpunkt: "sofort" as const };
const ERGEBNIS = berechne(zuEingaben(ANTWORTEN));

function fuelleAus() {
  fireEvent.change(screen.getByPlaceholderText("Vorname *"), { target: { value: "Max" } });
  fireEvent.change(screen.getByPlaceholderText("Nachname *"), { target: { value: "Mustermann" } });
  fireEvent.change(screen.getByPlaceholderText("E-Mail *"), {
    target: { value: "max@example.com" },
  });
  const telefon = document.querySelector('input[type="tel"]') as HTMLInputElement;
  fireEvent.change(telefon, { target: { value: "0170 1234567" } });
}

const knopf = () => screen.getByRole("button", { name: /Auswertung per Mail anfordern/ });
const pflichtHaken = () => screen.getByLabelText(new RegExp(LEAD_EINWILLIGUNG_TEXT.slice(0, 40)));
const werbeHaken = () => screen.getByLabelText(new RegExp(LEAD_WERBUNG_TEXT.slice(0, 40)));

/** Vollstaendig ausfuellen, Haken setzen, abschicken. */
function schickeAb() {
  fuelleAus();
  fireEvent.click(pflichtHaken());
  fireEvent.click(knopf());
}

beforeEach(() => {
  sendeSteuerLead.mockClear();
  sendeSteuerAuswertung.mockClear();
  ladeAuswertungHerunter.mockClear();
  render(
    <SteuerFormular
      antworten={ANTWORTEN}
      ergebnis={ERGEBNIS}
      berater={{ name: "Christian Peetz", telefon: "", email: "", userId: "u-1" }}
    />,
  );
});

describe("Die Pflichteinwilligung", () => {
  it("zeigt zwei getrennte Haken, Pflicht und Werbung", () => {
    expect(pflichtHaken()).toBeTruthy();
    expect(werbeHaken()).toBeTruthy();
    expect(pflichtHaken()).not.toBe(werbeHaken());
  });

  it("schickt ohne Haken nichts ab und sagt, was fehlt", async () => {
    fuelleAus();
    fireEvent.click(knopf());
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Einwilligung/);
    });
    expect(sendeSteuerLead).not.toHaveBeenCalled();
    expect(sendeSteuerAuswertung).not.toHaveBeenCalled();
  });

  it("schickt mit Haken ab und meldet die Einwilligung mit", async () => {
    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(knopf());
    await waitFor(() => expect(sendeSteuerLead).toHaveBeenCalled());
    const eingabe = sendeSteuerLead.mock.calls[0][0] as Record<string, unknown>;
    expect(eingabe.einwilligung).toBe(true);
    expect(eingabe.werbeeinwilligung).toBe(false);
  });

  it("blockiert nicht, wenn nur der freiwillige Haken fehlt", async () => {
    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(werbeHaken());
    fireEvent.click(knopf());
    await waitFor(() => expect(sendeSteuerLead).toHaveBeenCalled());
    const eingabe = sendeSteuerLead.mock.calls[0][0] as Record<string, unknown>;
    expect(eingabe.werbeeinwilligung).toBe(true);
  });
});

/* ── Das Gate vor der Auswertung ────────────────────────────────────────── */
describe("Die Auswertung gibt es nur gegen die Kontaktdaten", () => {
  it("entsteht ohne abgeschickte Angaben ueberhaupt nicht", () => {
    // Solange nichts abgeschickt ist, wird auch nichts gebaut und nichts
    // verschickt. Das Ergebnis am Bildschirm bleibt davon unberuehrt.
    expect(sendeSteuerAuswertung).not.toHaveBeenCalled();
  });

  it("entsteht erst, nachdem der Lead angekommen ist", async () => {
    schickeAb();
    await waitFor(() => expect(sendeSteuerAuswertung).toHaveBeenCalled());
    expect(sendeSteuerLead).toHaveBeenCalledBefore(sendeSteuerAuswertung);
    expect(await screen.findByText(/Auswertung ist unterwegs/)).toBeTruthy();
  });

  it("bleibt aus, wenn der Lead nicht durchgeht", async () => {
    sendeSteuerLead.mockResolvedValueOnce({ ok: false, fehler: "Das hat nicht geklappt." } as never);
    schickeAb();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/nicht geklappt/));
    expect(sendeSteuerAuswertung).not.toHaveBeenCalled();
  });
});

/* ── Der Versand per Mail ───────────────────────────────────────────────── */
describe("Der Versand per Mail", () => {
  it("geht an die eingegebene Adresse und sagt das auch", async () => {
    schickeAb();
    await waitFor(() => expect(sendeSteuerAuswertung).toHaveBeenCalled());
    const eingabe = sendeSteuerAuswertung.mock.calls[0][0] as Record<string, unknown>;
    expect(eingabe.email).toBe("max@example.com");
    expect(eingabe.vorname).toBe("Max");
    expect(await screen.findByText(/max@example.com/)).toBeTruthy();
  });

  it("laedt nichts herunter, solange die Mail hinausgegangen ist", async () => {
    schickeAb();
    await waitFor(() => expect(sendeSteuerAuswertung).toHaveBeenCalled());
    expect(ladeAuswertungHerunter).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Auswertung öffnen/ })).toBeNull();
  });

  it("nennt das Erstgespraech, in dem die genauen Zahlen kommen", async () => {
    schickeAb();
    expect(await screen.findByText(/Erstgespräch/)).toBeTruthy();
  });
});

/* ── Und wenn die Mail nicht ankommt ────────────────────────────────────── */
describe("Wenn die Mail nicht ankommt", () => {
  it("zeigt die abgelegte Auswertung direkt auf der Seite", async () => {
    sendeSteuerAuswertung.mockResolvedValueOnce({
      ok: true,
      mailVersendet: false,
      pdfUrl: "https://ablage.example/auswertung.pdf",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      dateiname: "auswertung.pdf",
    } as never);
    schickeAb();
    const link = (await screen.findByRole("link", {
      name: /Auswertung öffnen/,
    })) as HTMLAnchorElement;
    expect(link.href).toBe("https://ablage.example/auswertung.pdf");
    expect(screen.queryByText(/Wir haben sie an/)).toBeNull();
    expect(ladeAuswertungHerunter).not.toHaveBeenCalled();
  });

  it("laedt sie herunter, wenn nicht einmal die Ablage geklappt hat", async () => {
    sendeSteuerAuswertung.mockResolvedValueOnce({
      ok: false,
      mailVersendet: false,
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      dateiname: "auswertung.pdf",
    } as never);
    schickeAb();
    await waitFor(() => expect(ladeAuswertungHerunter).toHaveBeenCalled());
    expect(await screen.findByText(/Download-Ordner/)).toBeTruthy();
  });

  it("bestaetigt trotzdem, denn der Lead ist angekommen", async () => {
    sendeSteuerAuswertung.mockResolvedValueOnce({
      ok: false,
      mailVersendet: false,
    } as never);
    schickeAb();
    expect(await screen.findByRole("heading", { name: "Deine Anfrage ist angekommen" })).toBeTruthy();
    expect(screen.queryByText(/Wir haben sie an/)).toBeNull();
    expect(await screen.findByText(/Ansprechpartner schickt sie dir zu/)).toBeTruthy();
  });
});


describe("Zugaengliche Eingaben", () => {
  it("behaelt Labels und erklaert eine ungueltige Mail direkt am Feld", () => {
    const mail = screen.getByLabelText("E-Mail *");
    fireEvent.change(mail, { target: { value: "name@" } });
    fireEvent.blur(mail);
    expect(mail).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Bitte gib eine gültige E-Mail ein.")).toHaveAttribute("id", mail.getAttribute("aria-describedby"));
    fireEvent.change(mail, { target: { value: "max@example.com" } });
    expect(mail).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Vorname *")).toBeTruthy();
    expect(screen.getByLabelText("Nachname *")).toBeTruthy();
    expect(screen.getByLabelText("Telefon *")).toBeTruthy();
  });
});

/**
 * Das Formular am Ende der oeffentlichen Strecke.
 *
 * Seit dem 17.09.2026 erscheint das Ergebnis dort GAR NICHT MEHR, es kommt als
 * PDF per Mail. Drei Dinge muessen deshalb stimmen:
 *   1  Die Texte sagen das VORHER. Wer erst hinterher merkt, dass die Zahl
 *      nicht kommt, traegt beim naechsten Mal etwas Erfundenes ein.
 *   2  Nach dem Absenden gibt es keinen Knopf „Ergebnis ansehen“, solange die
 *      Strecke kein `onWeiter` uebergibt, und oeffentlich tut sie das nicht.
 *   3  Ging die Mail hinaus, steht auch kein Knopf „Auswertung öffnen“ da.
 *      Sonst waere das Ergebnis eben doch einen Klick entfernt.
 */
describe("Die Fassung am Ende der oeffentlichen Strecke", () => {
  it("sagt vorher, dass die Auswertung per Mail kommt, und zeigt danach kein Ergebnis", async () => {
    cleanup();
    render(
      <SteuerFormular
        antworten={ANTWORTEN}
        ergebnis={ERGEBNIS}
        berater={{ name: "Christian Peetz", telefon: "", email: "", userId: "u-1" }}
        vorErgebnis
      />,
    );
    expect(
      screen.getByText(
        "Die Auswertung kommt als PDF an deine E-Mail, deshalb bitte die Adresse, die du wirklich liest.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Auf dem Bildschirm zeigen wir sie nicht/)).toBeTruthy();

    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(screen.getByRole("button", { name: /Auswertung per Mail anfordern/ }));

    await waitFor(() =>
      expect(screen.getByText("Deine Auswertung ist unterwegs")).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Ergebnis ansehen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Auswertung öffnen" })).toBeNull();
  });

  /**
   * Der Ersatzweg, wenn die Mail nicht hinausging.
   *
   * Er ist die einzige Ausnahme von Punkt 3 oben, und er wiegt schwerer: Wer
   * seine Daten gegeben hat und nichts bekommt, ist schlimmer dran als einer,
   * der sich nie eingetragen hat.
   */
  it("zeigt die Auswertung nur dann, wenn die Mail nicht zugestellt wurde", async () => {
    cleanup();
    sendeSteuerAuswertung.mockResolvedValueOnce({
      ok: true,
      mailVersendet: false,
      pdfUrl: "https://ablage.example/auswertung.pdf",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      dateiname: "auswertung.pdf",
    });
    render(
      <SteuerFormular
        antworten={ANTWORTEN}
        ergebnis={ERGEBNIS}
        berater={{ name: "Christian Peetz", telefon: "", email: "", userId: "u-1" }}
        vorErgebnis
      />,
    );
    fuelleAus();
    fireEvent.click(pflichtHaken());
    fireEvent.click(screen.getByRole("button", { name: /Auswertung per Mail anfordern/ }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Auswertung öffnen" })).toBeTruthy(),
    );
    expect(screen.getByText("Deine Anfrage ist angekommen")).toBeTruthy();
  });
});
