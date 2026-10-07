import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

/*
 * Die beiden Terminkarten werden ersetzt, nicht nachgebaut. Geprüft wird hier
 * genau das: dass die Knöpfe die VORHANDENEN Karten öffnen und keine zweite
 * Terminlogik daneben entsteht.
 */
vi.mock("../ClosingTerminKarte", () => ({
  ClosingTerminKarte: () => <div>Die vorhandene Videocall-Karte</div>,
}));
vi.mock("../FollowUpCard", () => ({
  FollowUpCard: () => <div>Die vorhandene Follow-up-Karte</div>,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { BewerberSchnellaktionen } from "./BewerberSchnellaktionen";
import type { Bewerber } from "@/lib/bewerbungStore";

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b-1", vorname: "Michael", nachname: "Beispiel", email: "", telefon: "", ort: "",
    quelle: "", beworben: "", stelleId: "", stelleTitel: "", status: "Eingang", bewertung: 0,
    erstelltAm: "", typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false, ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "", rechnungsAdresse: "", closingTerminDatum: "", closingTerminUhrzeit: "",
    erstgespraechSkript: {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    paketwahl: "", zahlungsweise: "", vertragPdfUrl: "", vertragSignedPdfUrl: "", vertragSignedAt: "",
    vertragHrName: "", vertragVersion: 0, rechnungNr: "", rechnungPdfUrl: "", rechnungErstelltAm: "",
    rechnungBezahltBestaetigungen: [], rechnungBezahltAm: "", userAccountId: "", userInviteSentAt: "",
    karriereStufe: "", onboardingChecklist: [], academyPflichtModule: [], aktivAm: "",
    geworbenVonUserId: "", geworbenVonName: "",
    ...teil,
  } as Bewerber;
}

function zeichne(teil: Partial<Bewerber> = {}, canEdit = true, ohneNotizknopf = false) {
  const onNotiz = ohneNotizknopf ? undefined : vi.fn();
  const onFeld = vi.fn();
  const onAnruf = vi.fn();
  render(
    <TooltipProvider>
      <BewerberSchnellaktionen
        b={baueBewerber(teil)}
        canEdit={canEdit}
        beraterName="Jana Kirchner"
        beraterEmail="jana@example.de"
        autorId="u-1"
        onFeld={onFeld}
        onFollowUp={vi.fn()}
        onNotiz={onNotiz}
        onAnruf={onAnruf}
        onRefresh={vi.fn()}
      />
    </TooltipProvider>,
  );
  return { onFeld, onNotiz, onAnruf };
}

describe("BewerberSchnellaktionen", () => {
  it("zeigt fünf Knöpfe, mit Wort darunter", () => {
    zeichne();
    expect(screen.getByText("Erstgespräch")).toBeInTheDocument();
    expect(screen.getByText("Videocall")).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    expect(screen.getByText("Anrufen")).toBeInTheDocument();
    expect(screen.getByText("Notiz")).toBeInTheDocument();
  });

  /*
   * Die Notiz öffnet ausdrücklich kein eigenes Fenster in diesem Bauteil: Es
   * gibt einen zweiten Weg hinein, den Knopf im Reiter „Notizen" rechts, und
   * beide sollen dasselbe Fenster öffnen. Geprüft wird deshalb der Ruf nach
   * oben, nicht ein Textfeld.
   */
  it("meldet den Notizknopf nach oben, statt ein zweites Fenster zu bauen", () => {
    const { onNotiz } = zeichne();
    fireEvent.click(screen.getByRole("button", { name: /Notiz zu diesem Bewerber schreiben/ }));
    expect(onNotiz).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nennt im Notizknopf, wie viele Notizen schon da sind", () => {
    zeichne({ notizenLog: [{ id: "n1", text: "Ruft morgen zurück", datum: "2026-09-16T10:00:00.000Z", autor: "Jana", autorId: "u-1" }] });
    expect(
      screen.getByRole("button", { name: "Notiz zu diesem Bewerber schreiben, 1 bereits vorhanden" }),
    ).toBeInTheDocument();
  });

  it("lässt den Notizknopf weg, wenn der Aufrufer keinen anbietet", () => {
    zeichne({}, true, true);
    expect(screen.queryByText("Notiz")).not.toBeInTheDocument();
  });

  it("öffnet für das Erstgespräch Datum, Uhrzeit und Vertriebspartner", () => {
    zeichne();
    fireEvent.click(screen.getByRole("button", { name: /Erstgesprächstermin eintragen/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Uhrzeit des Erstgesprächs")).toBeInTheDocument();
    expect(screen.getByLabelText("Vertriebspartner im Erstgespräch")).toBeInTheDocument();
  });

  it("speichert die Uhrzeit des Erstgesprächs über denselben Weg wie bisher", () => {
    const { onFeld } = zeichne();
    fireEvent.click(screen.getByRole("button", { name: /Erstgesprächstermin eintragen/ }));
    fireEvent.change(screen.getByLabelText("Uhrzeit des Erstgesprächs"), { target: { value: "11:30" } });
    expect(onFeld).toHaveBeenCalledWith("erstgespraechUhrzeit", "11:30");
  });

  it("öffnet für den Videocall die vorhandene Karte statt eines zweiten Formulars", () => {
    zeichne();
    fireEvent.click(screen.getByRole("button", { name: /Videocall-Termin eintragen/ }));
    expect(screen.getByText("Die vorhandene Videocall-Karte")).toBeInTheDocument();
  });

  it("öffnet für das Follow-up die vorhandene Karte", () => {
    zeichne();
    fireEvent.click(screen.getByRole("button", { name: /Follow-up setzen/ }));
    expect(screen.getByText("Die vorhandene Follow-up-Karte")).toBeInTheDocument();
  });

  it("nennt einen stehenden Termin schon im Knopf", () => {
    zeichne({ erstgespraechDatum: "24.09.2026", erstgespraechUhrzeit: "11:30" });
    expect(screen.getByRole("button", { name: "Erstgespräch am 24.09.2026 um 11:30 Uhr" })).toBeInTheDocument();
  });

  it("zeigt ohne Recht den Termin nur zum Lesen", () => {
    zeichne({ erstgespraechDatum: "24.09.2026", erstgespraechUhrzeit: "11:30" }, false);
    fireEvent.click(screen.getByRole("button", { name: /Erstgespräch am 24.09.2026/ }));
    expect(screen.queryByLabelText("Uhrzeit des Erstgesprächs")).not.toBeInTheDocument();
    expect(screen.getByText(/24\.09\.2026/)).toBeInTheDocument();
  });
});

/*
 * ─── Der Knopf „Anrufen" ───
 *
 * Christian am 17.09.2026: Ein fünfter runder Knopf, der ein Fenster mit genau
 * den Möglichkeiten öffnet, die im Reiter Übersicht stehen, plus „erreicht",
 * und mit einer Notiz dazu.
 *
 * Geprüft wird auch hier der Ruf nach oben und nicht die Wirkung: Was ein
 * Ergebnis auslöst, steht in `lib/bewerberKontaktversuch.ts` und wird dort
 * geprüft. Zwei Stellen mit eigener Antwort auf dieselbe Frage sind genau das,
 * was hier nicht entstehen soll.
 */
describe("Anrufen", () => {
  function oeffneAnruf() {
    fireEvent.click(screen.getByRole("button", { name: /Ergebnis eines Telefonats festhalten/ }));
  }

  it("bietet alle drei Ergebnisse an, erreicht eingeschlossen", () => {
    zeichne();
    oeffneAnruf();
    expect(screen.getByRole("button", { name: /^Erreicht/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Nicht erreicht/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Kein Interesse/ })).toBeInTheDocument();
  });

  it("gibt Ergebnis und Notiz nach oben weiter", async () => {
    const { onAnruf } = zeichne();
    oeffneAnruf();
    fireEvent.change(screen.getByLabelText("Notiz zum Telefonat"), {
      target: { value: "Ruft morgen zurück." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Erreicht/ }));
    expect(onAnruf).toHaveBeenCalledWith("erreicht", "Ruft morgen zurück.");
  });

  it("nennt bei jedem Ergebnis, was der Klick auslöst", () => {
    zeichne();
    oeffneAnruf();
    expect(screen.getByText(/Keine Mail, keine Stufenänderung/)).toBeInTheDocument();
    expect(screen.getByText(/höchstens fünfmal/)).toBeInTheDocument();
    expect(screen.getByText(/An ihn geht keine Mail/)).toBeInTheDocument();
  });

  it("bietet bei abgeschlossenen Bewerbern kein Ergebnis mehr an", () => {
    zeichne({ status: "KeinInteresse" });
    // Der Knopf trägt dann einen anderen Satz, siehe `hilfe`.
    fireEvent.click(screen.getByRole("button", { name: /Der Bewerber ist abgeschlossen/ }));
    expect(screen.queryByRole("button", { name: /^Erreicht/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Weitere Kontaktversuche werden nicht mehr protokolliert/)).toBeInTheDocument();
  });

  it("fehlt der Knopf, wenn der Aufrufer keine Anrufe entgegennimmt", () => {
    render(
      <TooltipProvider>
        <BewerberSchnellaktionen
          b={baueBewerber()}
          canEdit
          beraterName="Jana Kirchner"
          beraterEmail="jana@example.de"
          autorId="u-1"
          onFeld={vi.fn()}
          onFollowUp={vi.fn()}
          onRefresh={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("Anrufen")).not.toBeInTheDocument();
  });
});
