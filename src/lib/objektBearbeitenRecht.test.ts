import { describe, expect, it } from "vitest";
import { darfObjektBearbeiten } from "./objektBearbeitenRecht";

describe("darfObjektBearbeiten, dieselbe Regel wie darf_objekt_schreiben", () => {
  const eigenes = { erstellt_von: "op-1" };

  it("laesst Admin und Inhaber jedes Objekt bearbeiten, auch ohne Ersteller", () => {
    expect(darfObjektBearbeiten("admin", {}, "a-1")).toBe(true);
    expect(darfObjektBearbeiten("inhaber", undefined, null)).toBe(true);
  });

  it("laesst den Objektpartner nur an sein eigenes Objekt", () => {
    expect(darfObjektBearbeiten("objektpartner", eigenes, "op-1")).toBe(true);
    expect(darfObjektBearbeiten("objektpartner", eigenes, "op-2")).toBe(false);
    // Alle 91 Objekte hatten am 29.09.2026 keinen Ersteller.
    expect(darfObjektBearbeiten("objektpartner", { erstellt_von: null }, "op-1")).toBe(false);
    expect(darfObjektBearbeiten("objektpartner", eigenes, undefined)).toBe(false);
  });

  it("gibt allen anderen Rollen kein Bearbeitungsrecht", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "backoffice", "hausverwaltung", "kunde", undefined]) {
      expect(darfObjektBearbeiten(rolle, eigenes, "op-1")).toBe(false);
    }
  });
});
