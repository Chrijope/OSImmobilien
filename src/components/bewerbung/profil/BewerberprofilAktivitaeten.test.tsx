import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BewerberprofilLayout } from "./BewerberprofilLayout";
import { BewerberprofilAktivitaeten } from "./BewerberprofilAktivitaeten";
import { baueBewerberEreignisse } from "@/lib/bewerberEreignisse";

/*
 * Die Beispieldaten sind so gewählt, dass jede Art einmal vorkommt: eine Mail
 * mit gemessener Öffnung, ein selbst gebuchter Termin, ein ausgefüllter Bogen
 * und ein erledigter Schritt.
 */
function beispielEreignisse() {
  return baueBewerberEreignisse({
    bewerber: {
      beworben: "02.09.2026",
      quelle: "Meta",
      aktivAm: "2026-09-16T10:00:00.000Z",
    },
    mails: [
      {
        token: "t1",
        kind: "kennenlernen_einladung",
        sent_at: "2026-09-12T12:22:00.000Z",
        opened_at: "2026-09-12T12:40:00.000Z",
        clicked_at: "2026-09-12T12:40:00.000Z",
        tracked: true,
      },
    ],
    buchung: { id: "b1", startAt: "2026-09-24T09:30:00.000Z", status: "offen", bezeichnung: "Videocall" },
    kennenlernEingereichtAm: "2026-09-16T07:31:00.000Z",
  });
}

function Beispiel({ start = true }: { start?: boolean }) {
  const [offen, setOffen] = useState(start);
  return (
    <BewerberprofilLayout
      person="Person"
      aktivitaetenOffen={offen}
      aktivitaeten={
        <BewerberprofilAktivitaeten
          ereignisse={beispielEreignisse()}
          offen={offen}
          onUmschalten={() => setOffen(!offen)}
        />
      }
    >
      Arbeitsbereich
    </BewerberprofilLayout>
  );
}

it("stellt die drei Spalten in der besprochenen Reihenfolge auf", () => {
  render(<Beispiel />);
  expect(screen.getByRole("complementary", { name: "Bewerberangaben" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Arbeitsbereich" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Aktivitäten" })).toBeInTheDocument();
});

it("zeigt jede belegte Ereignisart mit ihrem Namen", () => {
  render(<Beispiel />);
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  expect(within(leiste).getByText("Einladung zum Kennenlernbogen")).toBeInTheDocument();
  expect(within(leiste).getByText("Videocall")).toBeInTheDocument();
  expect(within(leiste).getByText("Kennenlernbogen ausgefüllt")).toBeInTheDocument();
  expect(within(leiste).getByText("Als Partner aktiviert")).toBeInTheDocument();
  expect(within(leiste).getByText("Bewerbung eingegangen")).toBeInTheDocument();
});

it("nennt den Linkaufruf und behauptet bei keiner Messung nichts", () => {
  render(<Beispiel />);
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  expect(within(leiste).getByText(/^Link geöffnet \d{2}:\d{2}$/)).toBeInTheDocument();
  expect(within(leiste).queryByText(/ungelesen/i)).not.toBeInTheDocument();
});

it("filtert auf eine Art und zurück auf alle", () => {
  render(<Beispiel />);
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  fireEvent.click(within(leiste).getByRole("button", { name: /Termine/ }));
  expect(within(leiste).getByText("Videocall")).toBeInTheDocument();
  expect(within(leiste).queryByText("Einladung zum Kennenlernbogen")).not.toBeInTheDocument();
  fireEvent.click(within(leiste).getByRole("button", { name: /Alle/ }));
  expect(within(leiste).getByText("Einladung zum Kennenlernbogen")).toBeInTheDocument();
});

it("behält den gewählten Filter über das Ein- und Ausklappen hinweg", () => {
  render(<Beispiel />);
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  fireEvent.click(within(leiste).getByRole("button", { name: /Bögen/ }));
  fireEvent.click(screen.getByRole("button", { name: "Aktivitäten und Notizen einklappen" }));
  // Eingeklappt bleibt der Inhalt bewusst gemountet, nur unsichtbar. Genau
  // deshalb überlebt der Filter das Zuklappen.
  expect(screen.getByText("Kennenlernbogen ausgefüllt")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Aktivitäten und Notizen ausklappen" }));
  expect(screen.getByText("Kennenlernbogen ausgefüllt")).toBeInTheDocument();
  expect(screen.queryByText("Einladung zum Kennenlernbogen")).not.toBeInTheDocument();
});

it("gruppiert nach Tagen und schreibt das Datum an die Überschrift", () => {
  render(<Beispiel />);
  const leiste = screen.getByTestId("bewerberprofil-aktivitaeten");
  expect(within(leiste).getByText("24.09.2026")).toBeInTheDocument();
  expect(within(leiste).getByText("02.09.2026")).toBeInTheDocument();
});

it("sagt ausdrücklich, dass Stufenwechsel fehlen", () => {
  render(<Beispiel />);
  expect(screen.getByText(/Stufenwechsel stehen nicht in der Liste/)).toBeInTheDocument();
});

it("sagt beim Laden, dass noch nachgeladen wird, statt „nichts passiert“ zu behaupten", () => {
  render(<BewerberprofilAktivitaeten ereignisse={[]} offen onUmschalten={() => {}} laedt />);
  expect(screen.getByText(/werden geladen/)).toBeInTheDocument();
  expect(screen.queryByText(/bisher nichts aufgezeichnet/)).not.toBeInTheDocument();
});

it("zeigt ohne Ereignisse den leeren Zustand", () => {
  render(<BewerberprofilAktivitaeten ereignisse={[]} offen onUmschalten={() => {}} />);
  expect(screen.getByText(/bisher nichts aufgezeichnet/)).toBeInTheDocument();
});

/*
 * ─── Der Reiter „Notizen" ───
 *
 * Christian hat am 17.09.2026 zwei Reiter bestellt: Aktivitäten und Notizen.
 * Die Notiz erscheint zunächst gekürzt und lässt sich aufklappen, genau wie im
 * Kundenprofil. Geprüft wird beides, denn eine Notiz, die ungekürzt steht,
 * schiebt in der schmalen Spalte alles andere weg.
 */
const LANGE_NOTIZ =
  "Er hat im ersten Gespräch sehr ausführlich von seiner bisherigen Tätigkeit erzählt und dabei " +
  "mehrfach betont, dass er den Wechsel nur nebenberuflich beginnen möchte.";

/*
 * Radix schaltet den Reiter beim Drücken der Maustaste um, nicht beim Klick.
 * Ein blosses `fireEvent.click` liesse den alten Reiter stehen, und der Test
 * prüfte anschliessend die falsche Seite.
 */
function oeffneNotizen() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Notizen/ }));
}

function zeichneMitNotizen(extra: Partial<Parameters<typeof BewerberprofilAktivitaeten>[0]> = {}) {
  return render(
    <BewerberprofilAktivitaeten
      ereignisse={beispielEreignisse()}
      notizen={[
        { id: "n1", text: LANGE_NOTIZ, datum: "2026-09-16T09:05:00.000Z", autor: "Jana Kirchner", autorId: "u-1" },
      ]}
      offen
      onUmschalten={() => {}}
      {...extra}
    />,
  );
}

it("stellt beide Reiter nebeneinander und zeigt zuerst die Aktivitäten", () => {
  zeichneMitNotizen();
  expect(screen.getByRole("tab", { name: /Aktivitäten/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /Notizen/ })).toHaveAttribute("aria-selected", "false");
});

it("zeigt die Notiz erst gekürzt und nach einem Klick vollständig", () => {
  zeichneMitNotizen();
  oeffneNotizen();
  expect(screen.queryByText(LANGE_NOTIZ)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  expect(screen.getByText(LANGE_NOTIZ)).toBeInTheDocument();
});

it("nennt Autor und Zeitpunkt der Notiz", () => {
  zeichneMitNotizen();
  oeffneNotizen();
  expect(screen.getByText("Jana Kirchner")).toBeInTheDocument();
  expect(screen.getByText(/16\.09\.2026/)).toBeInTheDocument();
});

it("bietet den Papierkorb nur, wenn der Aufrufer löschen lässt", () => {
  const onNotizLoeschen = vi.fn();
  zeichneMitNotizen({ onNotizLoeschen });
  oeffneNotizen();
  fireEvent.click(screen.getByRole("button", { name: /Notiz von Jana Kirchner löschen/ }));
  expect(onNotizLoeschen).toHaveBeenCalledWith("n1");
});

it("zeigt ohne Notizen den leeren Zustand statt einer erfundenen Zeile", () => {
  render(<BewerberprofilAktivitaeten ereignisse={[]} offen onUmschalten={() => {}} />);
  oeffneNotizen();
  expect(screen.getByText(/bisher keine Notiz geschrieben/)).toBeInTheDocument();
});

it("zeigt die alte Notiz ohne Autor abgesetzt weiter an, statt sie zu verlieren", () => {
  render(
    <BewerberprofilAktivitaeten
      ereignisse={[]}
      altNotiz="Stand früher im Freitextfeld"
      offen
      onUmschalten={() => {}}
    />,
  );
  oeffneNotizen();
  expect(screen.getByText("Stand früher im Freitextfeld")).toBeInTheDocument();
  expect(screen.queryByText(/bisher keine Notiz geschrieben/)).not.toBeInTheDocument();
});

/*
 * ─── Eingeklappt: beide Wörter, keine Überschrift mehr ───
 *
 * Christian am 17.09.2026: Über der Reiterauswahl stand noch eine Überschrift
 * „Aktivitäten" mit einer Zahl, und direkt darunter dieselbe Auswahl. Das las
 * sich wie dasselbe zweimal. Eingeklappt fehlte umgekehrt der Hinweis, dass in
 * der Spalte auch die Notizen liegen.
 */
it("zeigt über der Reiterauswahl keine zweite Überschrift mehr", () => {
  zeichneMitNotizen();
  expect(screen.queryByRole("heading", { name: "Aktivitäten" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Aktivitäten/ })).toBeInTheDocument();
});

it("nennt eingeklappt beide Spalteninhalte mit ihrer Zahl", () => {
  render(
    <BewerberprofilAktivitaeten
      ereignisse={beispielEreignisse()}
      notizen={[{ id: "n1", text: "kurz", datum: "2026-09-16T09:05:00.000Z", autor: "Jana", autorId: "u-1" }]}
      offen={false}
      onUmschalten={() => {}}
    />,
  );
  expect(screen.getByTestId("bewerberprofil-marke-aktivitaeten")).toHaveTextContent("Aktivitäten");
  expect(screen.getByTestId("bewerberprofil-marke-notizen")).toHaveTextContent("Notizen 1");
  // Der Pfeil bleibt, er ist der einzige Weg zurück.
  expect(screen.getByRole("button", { name: "Aktivitäten und Notizen ausklappen" })).toBeInTheDocument();
});

it("lässt den Reiter von aussen führen, damit eine frische Notiz sichtbar wird", () => {
  zeichneMitNotizen({ reiter: "notizen", onReiter: () => {} });
  expect(screen.getByRole("tab", { name: /Notizen/ })).toHaveAttribute("aria-selected", "true");
});
