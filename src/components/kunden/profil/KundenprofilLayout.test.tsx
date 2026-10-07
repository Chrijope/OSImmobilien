import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KundenprofilLayout } from "./KundenprofilLayout";
import { KundenprofilAktivitaeten, type KundenVerlaufReiter } from "./KundenprofilAktivitaeten";
import { KundenprofilNavigation } from "./KundenprofilNavigation";

it("behält den Inhalt der Leiste beim Einklappen bei", () => {
  function Beispiel() {
    const [offen, setOffen] = useState(true);
    return <KundenprofilLayout stammdaten="Stammdaten" navigation="Navigation" aktivitaetenOffen={offen} aktivitaeten={<KundenprofilAktivitaeten offen={offen} anzahl={2} onUmschalten={() => setOffen(!offen)} onNotiz={() => {}}><input aria-label="Aktivitätsfilter" defaultValue="" /></KundenprofilAktivitaeten>}>Arbeitsbereich</KundenprofilLayout>;
  }
  render(<Beispiel />);
  fireEvent.change(screen.getByRole("textbox", { name: "Aktivitätsfilter" }), { target: { value: "Anruf" } });
  fireEvent.click(screen.getByRole("button", { name: "Aktivitäten und Notizen einklappen" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aktivitäten und Notizen ausklappen" }));
  expect(screen.getByRole("textbox", { name: "Aktivitätsfilter" })).toHaveValue("Anruf");
});
it("zeigt nur die übergebenen erlaubten Arbeitsbereiche und reicht den Klick unverändert weiter", () => {
  const wechsel = vi.fn();
  render(<TooltipProvider><KundenprofilNavigation rolle="setterin" activeTab="investments" portalFreigeschalten={false} tabs={[{ key: "stammdaten", label: "Stammdaten" }, { key: "investments", label: "Investments", anzahl: 3 }]} onWechsel={wechsel} /></TooltipProvider>);
  expect(screen.queryByRole("button", { name: /Kommunikation/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Dokumente/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Investments/ }));
  expect(wechsel).toHaveBeenCalledWith("investments");
});

it("zeigt Stammdaten vor Kommunikation und öffnet den bestehenden Reiter", () => {
  const wechsel = vi.fn();
  render(<TooltipProvider><KundenprofilNavigation rolle="vertriebspartner" activeTab="stammdaten" portalFreigeschalten={false} tabs={[{ key: "stammdaten", label: "Stammdaten" }, { key: "kommunikation", label: "Kommunikation" }]} onWechsel={wechsel} /></TooltipProvider>);
  expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Stammdaten", "Kommunikation"]);
  fireEvent.click(screen.getByRole("button", { name: "Stammdaten" }));
  expect(wechsel).toHaveBeenCalledWith("stammdaten");
});


it("ordnet alle erlaubten Reiter unabhängig von der Eingabereihenfolge", () => {
  const keys = ["kommunikation", "empfehlungen", "stammdaten", "dokumente", "investments"];
  render(<TooltipProvider><KundenprofilNavigation rolle="vertriebspartner" activeTab="stammdaten" portalFreigeschalten={false} tabs={keys.map(key => ({ key, label: key }))} onWechsel={() => {}} /></TooltipProvider>);
  expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["stammdaten", "investments", "dokumente", "kommunikation", "empfehlungen"]);
});

/*
 * ─── Dieselbe Reiterleiste wie im Bewerberprofil ───
 *
 * Christian am 17.09.2026: „im Kundenprofil rechts bei Aktivitaeten gleich wie
 * im Bewerberprozess die Auswahl zwischen Aktivitaeten und Notizen anzeigen,
 * und somit dann von unten drunter den Notizbutton hochziehen."
 */
function ZeigeLeiste({
  reiter = "aktivitaeten",
  onReiter = () => {},
  offen = true,
  onNotiz = () => {},
}: {
  reiter?: KundenVerlaufReiter;
  onReiter?: (r: KundenVerlaufReiter) => void;
  offen?: boolean;
  onNotiz?: () => void;
}) {
  return (
    <KundenprofilAktivitaeten
      offen={offen}
      anzahl={7}
      notizenAnzahl={3}
      reiter={reiter}
      onReiter={onReiter}
      onUmschalten={() => {}}
      onNotiz={onNotiz}
    >
      <p>Die Liste</p>
    </KundenprofilAktivitaeten>
  );
}

it("stellt beide Reiter mit ihrer Zahl nebeneinander, ohne zweite Überschrift", () => {
  render(<ZeigeLeiste />);
  expect(screen.getByRole("tab", { name: /Aktivitäten 7/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /Notizen 3/ })).toHaveAttribute("aria-selected", "false");
  expect(screen.queryByRole("heading", { name: "Aktivitäten" })).not.toBeInTheDocument();
});

it("meldet den Reiterwechsel nach oben, weil dort die Liste gefiltert wird", () => {
  const onReiter = vi.fn();
  render(<ZeigeLeiste onReiter={onReiter} />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Notizen/ }));
  expect(onReiter).toHaveBeenCalledWith("notizen");
});

/*
 * Der Knopf stand vorher über der ganzen Liste, also auch über den
 * Systemeinträgen, wo eine Notiz nichts verloren hat. Jetzt steht er dort, wo
 * die Notizen sind.
 */
it("zeigt den Notizknopf nur im Reiter Notizen", () => {
  const onNotiz = vi.fn();
  const { rerender } = render(<ZeigeLeiste onNotiz={onNotiz} />);
  expect(screen.queryByRole("button", { name: "Notiz erstellen" })).not.toBeInTheDocument();
  rerender(<ZeigeLeiste reiter="notizen" onNotiz={onNotiz} />);
  fireEvent.click(screen.getByRole("button", { name: "Notiz erstellen" }));
  expect(onNotiz).toHaveBeenCalledTimes(1);
});

it("nennt eingeklappt beide Spalteninhalte mit ihrer Zahl", () => {
  render(<ZeigeLeiste offen={false} />);
  expect(screen.getByTestId("kundenprofil-marke-aktivitaeten")).toHaveTextContent("Aktivitäten 7");
  expect(screen.getByTestId("kundenprofil-marke-notizen")).toHaveTextContent("Notizen 3");
});
