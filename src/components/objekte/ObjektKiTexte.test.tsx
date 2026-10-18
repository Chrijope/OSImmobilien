import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

const ki = vi.hoisted(() => ({ argumente: vi.fn(), beschreibung: vi.fn() }));
vi.mock("@/lib/objektWizardTexte", async (original) => ({
  ...(await original<typeof import("@/lib/objektWizardTexte")>()),
  standortargumenteErstellen: ki.argumente,
  beschreibungErstellen: ki.beschreibung,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: () => undefined }));

const { BeschreibungFeld, StandortargumenteFeld } = await import("./ObjektKiTexte");

afterEach(cleanup);

function Argumente({ start, mitKi = true }: { start: string[]; mitKi?: boolean }) {
  const [werte, setWerte] = useState(start);
  return <StandortargumenteFeld werte={werte} onChange={setWerte} angaben={mitKi ? () => ({ adresse: "Seeweg 1", ort: "Potsdam" }) : undefined} />;
}

describe("Standortargumente im Wizard", () => {
  it("ohne Recht kein KI-Knopf", () => {
    render(<Argumente start={[]} mitKi={false} />);
    expect(screen.queryByRole("button", { name: /Mit KI erstellen/ })).toBeNull();
  });

  it("KI-Vorschlag landet in der Liste und ist einzeln löschbar", async () => {
    ki.argumente.mockResolvedValue({ standortargumente: ["Seenähe. Wasser vor der Tür.", "Arbeitgeber. Viele Jobs."], hinweise: [] });
    render(<Argumente start={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Mit KI erstellen/ }));
    await waitFor(() => expect(screen.getByLabelText("Standortargument 2")).toHaveValue("Arbeitgeber. Viele Jobs."));
    expect(screen.getByRole("button", { name: /Neu erstellen/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Standortargument 1 entfernen" }));
    expect(screen.getByLabelText("Standortargument 1")).toHaveValue("Arbeitgeber. Viele Jobs.");
  });

  it("bei acht Argumenten kein weiteres Feld", () => {
    render(<Argumente start={Array.from({ length: 8 }, (_, i) => `P${i}. Text`)} />);
    expect(screen.queryByPlaceholderText("Neues Standortargument…")).toBeNull();
    expect(screen.getByText("Höchstens 8 Standortargumente.")).toBeInTheDocument();
  });
});

describe("Beschreibung im Wizard", () => {
  it("zählt Zeichen und begrenzt auf 1000", () => {
    render(<BeschreibungFeld wert={"x".repeat(120)} onChange={() => undefined} />);
    expect(screen.getByText("120 von 1000 Zeichen")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "1000");
    expect(screen.queryByRole("button", { name: /Mit KI erstellen/ })).toBeNull();
  });

  it("mit KI: Bilder und Angaben gehen an die Erstellung", async () => {
    ki.beschreibung.mockResolvedValue({ beschreibung: "Ein helles Haus.", hinweise: [], bilder: 2 });
    const onChange = vi.fn();
    render(<BeschreibungFeld wert="" onChange={onChange} ki={{ angaben: () => ({ adresse: "Seeweg 1" }), bildUrls: () => ["blob:a", "blob:b"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Mit KI erstellen/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Ein helles Haus."));
    expect(ki.beschreibung).toHaveBeenCalledWith({ adresse: "Seeweg 1" }, ["blob:a", "blob:b"]);
  });
});
