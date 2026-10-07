import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NotizZielrollen } from "./NotizZielrollen";

describe("Zielrollen an Einträgen aus „Neu im CRM“", () => {
  it("zeigt Admin die Rollen mit Anzeigenamen", () => {
    const { container } = render(<NotizZielrollen zielrollen={["inhaber", "vertriebspartner"]} aktiveRolle="admin" />);
    expect(container.textContent).toBe(" · Sichtbar für: Inhaber, Vertriebspartner");
  });

  it("zeigt „alle“ als Alle Rollen", () => {
    const { container } = render(<NotizZielrollen zielrollen={["alle"]} aktiveRolle="admin" />);
    expect(container.textContent).toBe(" · Sichtbar für: Alle Rollen");
  });

  it("zeigt anderen Rollen nichts, auch nicht dem Inhaber", () => {
    for (const rolle of ["inhaber", "vertriebspartner", "backoffice"]) {
      const { container } = render(<NotizZielrollen zielrollen={["alle"]} aktiveRolle={rolle} />);
      expect(container.textContent).toBe("");
    }
  });
});
