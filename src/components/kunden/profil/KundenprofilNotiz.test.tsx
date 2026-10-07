import { fireEvent, render, screen } from "@testing-library/react";
import { KundenprofilNotiz } from "./KundenprofilNotiz";

describe("Notizvorschau", () => {
  it.each([99, 100])("zeigt %i Zeichen vollständig", (laenge) => {
    render(<KundenprofilNotiz text={"A".repeat(laenge)} />);
    expect(screen.getByText("A".repeat(laenge))).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each([101, 400])("zeigt von %i Zeichen zunächst 100 und öffnet den Rest", (laenge) => {
    const text = "A".repeat(100) + "B".repeat(laenge - 100);
    render(<KundenprofilNotiz text={text} />);
    expect(screen.getByText("A".repeat(100) + "…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mehr" }));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "weniger" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "weniger" }));
    expect(screen.getByText("A".repeat(100) + "…")).toBeInTheDocument();
  });
  it("trennt keine Unicode-Codepoints und rendert Notizen ausschließlich als Text", () => {
    render(<KundenprofilNotiz text={"🙂".repeat(100) + "<img src=x>"} />);
    expect(screen.getByText("🙂".repeat(100) + "…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mehr" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
