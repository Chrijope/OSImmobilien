import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExklusivZuweisung } from "./ExklusivZuweisung";

afterEach(cleanup);

const kandidaten = [
  { id: "u-ali", name: "Ali Leitung", rolle: "vertriebsleiter" },
  { id: "u-zoe", name: "Zoe Vertrieb", rolle: "vertriebspartner" },
];

describe("Exklusive Freischaltung im Wizard", () => {
  it("weist das ganze Objekt einem echten Nutzer zu, mit Kennung", () => {
    const onObjekt = vi.fn();
    render(<ExklusivZuweisung kandidaten={kandidaten} objektNamen={[]} objektKennungen={{}} onObjekt={onObjekt} einheiten={[]} onEinheit={() => undefined} />);
    fireEvent.focus(screen.getByLabelText("Nutzer für das ganze Objekt suchen"));
    expect(screen.queryByText("Lisa Weber")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("option", { name: /Zoe Vertrieb/ }));
    expect(onObjekt).toHaveBeenCalledWith(["Zoe Vertrieb"], { "Zoe Vertrieb": "u-zoe" });
  });

  it("weist eine einzelne Einheit zu und entfernt einen Altnamen ohne Nutzer", () => {
    const onEinheit = vi.fn();
    const onObjekt = vi.fn();
    render(<ExklusivZuweisung kandidaten={kandidaten} objektNamen={["Altname"]} objektKennungen={{}} onObjekt={onObjekt}
      einheiten={[{ id: "w1", bezeichnung: "WE 1", exklusivNutzer: ["u-zoe"] }]} onEinheit={onEinheit} />);
    fireEvent.focus(screen.getByLabelText("Nutzer für WE 1 suchen"));
    expect(screen.queryByRole("option", { name: /Zoe Vertrieb/ })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("option", { name: /Ali Leitung/ }));
    expect(onEinheit).toHaveBeenCalledWith("w1", ["u-zoe", "u-ali"]);
    fireEvent.click(screen.getByRole("button", { name: "Altname entfernen" }));
    expect(onObjekt).toHaveBeenCalledWith([], {});
  });

  it("ohne angelegte Partner ein klarer Hinweis statt Beispielnamen", () => {
    render(<ExklusivZuweisung kandidaten={[]} objektNamen={[]} objektKennungen={{}} onObjekt={() => undefined} einheiten={[]} onEinheit={() => undefined} />);
    fireEvent.focus(screen.getByLabelText("Nutzer für das ganze Objekt suchen"));
    expect(screen.getByText("Keine aktiven Vertriebspartner oder Vertriebsleiter angelegt.")).toBeInTheDocument();
  });
});
