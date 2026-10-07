import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NachfassHinweisBalken, PerMailAbgemeldetBadge } from "./NachfassBausteine";
import { SelbstAbmeldungKarte } from "./SelbstAbmeldungKarte";

describe("PerMailAbgemeldetBadge", () => {
  it("zeigt das Badge nur, wenn selbstAbgemeldetAm gesetzt ist", () => {
    const { rerender } = render(<PerMailAbgemeldetBadge bewerber={{ selbstAbgemeldetAm: "" }} />);
    expect(screen.queryByText("per Mail abgemeldet")).not.toBeInTheDocument();

    rerender(<PerMailAbgemeldetBadge bewerber={{ selbstAbgemeldetAm: "2026-09-04T08:00:00.000Z" }} />);
    const badge = screen.getByText("per Mail abgemeldet");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("[title]")?.getAttribute("title")).toMatch(/Nachfass-Mail/);
  });
});

describe("NachfassHinweisBalken", () => {
  it("bleibt weg, solange keine Welle hinausging", () => {
    const { container } = render(
      <NachfassHinweisBalken bewerber={[{ status: "Eingang", selbstAbgemeldetAm: "2026-09-04T08:00:00.000Z" }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("nennt Versanddatum, Abmeldungen und Angeschriebene", () => {
    render(
      <NachfassHinweisBalken
        bewerber={[
          { status: "Eingang", klNachfassMailAm: "2026-09-03T09:00:00.000Z" },
          { status: "Eingang", klNachfassMailAm: "2026-09-03T09:00:01.000Z", selbstAbgemeldetAm: "2026-09-04T08:00:00.000Z" },
          { status: "Eingang", klNachfassMailAm: "2026-09-03T09:00:02.000Z", selbstAbgemeldetAm: "2026-09-05T08:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Seit dem Versand am 3\. September 2026 haben sich 2 Bewerber abgemeldet\./);
    expect(screen.getByRole("alert")).toHaveTextContent("Angeschrieben wurden 3.");
  });

  it("sagt, wie weit der Eingang durch ist", () => {
    render(
      <NachfassHinweisBalken
        bewerber={[
          { status: "Eingang", klNachfassMailAm: "2026-09-12T09:00:00.000Z" },
          { status: "Eingang" },
          { status: "Eingang" },
        ]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("1 von 3 im Eingang haben sie.");
  });
});

describe("SelbstAbmeldungKarte", () => {
  it("zeigt Zeitpunkt und Grund, oder dass keiner genannt wurde", () => {
    const { rerender, container } = render(<SelbstAbmeldungKarte bewerber={{ selbstAbgemeldetAm: "" }} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<SelbstAbmeldungKarte bewerber={{ selbstAbgemeldetAm: "2026-09-04T08:15:00.000Z", selbstAbgemeldetGrund: "Habe etwas anderes gefunden." }} />);
    expect(screen.getByText("Per Mail abgemeldet")).toBeInTheDocument();
    expect(screen.getByText(/Hat am 04\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByText("Habe etwas anderes gefunden.")).toBeInTheDocument();

    rerender(<SelbstAbmeldungKarte bewerber={{ selbstAbgemeldetAm: "2026-09-04T08:15:00.000Z", selbstAbgemeldetGrund: "" }} />);
    expect(screen.getByText("Kein Grund angegeben.")).toBeInTheDocument();
  });
});
