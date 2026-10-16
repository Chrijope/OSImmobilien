import { describe, expect, it } from "vitest";
import { schonGespeichert, sendeVersuch } from "./chatSenden";

describe("chatSenden", () => {
  it("derselbe Text nach einem Fehlschlag behaelt die Kennung", () => {
    const erster = sendeVersuch(null, "Hallo", () => "a");
    expect(sendeVersuch(erster, "Hallo", () => "b")).toBe(erster);
  });

  it("ein anderer Text bekommt eine neue Kennung", () => {
    const erster = sendeVersuch(null, "Hallo", () => "a");
    expect(sendeVersuch(erster, "Hallo!", () => "b")).toEqual({ text: "Hallo!", id: "b" });
  });

  it("nur ein Doppel der Kennung zaehlt als schon gespeichert", () => {
    expect(schonGespeichert({ code: "23505" })).toBe(true);
    expect(schonGespeichert({ code: "42501" })).toBe(false);
    expect(schonGespeichert(null)).toBe(false);
  });
});
