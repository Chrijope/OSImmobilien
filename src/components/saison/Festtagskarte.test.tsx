import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FesttagskarteAnzeige } from "./Festtagskarte";
import { kartenTexte, type Festtag } from "@/lib/festtagskarten";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const f: Festtag = { anlass: "silvester", jahr: 2026, motiv: 1 };
const t = kartenTexte(f, { ton: "sie", sprache: "de", vorname: "Eva", nachname: "Kurz", anrede: "Frau" });

describe("FesttagskarteAnzeige", () => {
  it("zeigt den Gruß auf der Rückseite, dreht um und schließt", () => {
    const zu = vi.fn();
    render(<FesttagskarteAnzeige f={f} t={t} en={false} onSchliessen={zu} />);
    expect(screen.getByText("Liebe Frau Kurz,")).toBeTruthy();
    expect(screen.getByText("Ihr Oliver Skowrnowski")).toBeTruthy();

    const karte = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Karte umdrehen" }));
    expect(karte.className).toContain("dreh");

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(zu).toHaveBeenCalledTimes(2);
  });
});
