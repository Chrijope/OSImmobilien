import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpamHinweis } from "./SpamHinweis";
import { MAIL_ABSENDER } from "@/lib/mailAbsender";

/**
 * Der Spam-Hinweis unter den Danke-Seiten nach einer Bewerbung.
 *
 * Wortlaut von Christian (26.09.2026), mit typografischen Anführungszeichen.
 */
describe("SpamHinweis", () => {
  it("zeigt den Satz mit der Absenderadresse", () => {
    render(<SpamHinweis />);
    const hinweis = screen.getByTestId("spam-hinweis");
    expect(hinweis.textContent).toBe(
      "Unsere Mail kommt von noreply@more.immo. Schau bitte auch im Spam-Ordner nach und markiere sie als ‚Kein Spam‘.",
    );
    expect(hinweis).toHaveAttribute("role", "note");
  });

  it("macht die Adresse nicht zum Link, dorthin soll niemand schreiben", () => {
    render(<SpamHinweis />);
    const adresse = screen.getByText(MAIL_ABSENDER);
    expect(adresse.tagName).toBe("SPAN");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stimmt mit dem Absender von send-transactional-email überein", () => {
    expect(MAIL_ABSENDER).toBe("noreply@more.immo");
  });
});
