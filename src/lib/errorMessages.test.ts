import { describe, expect, it } from "vitest";
import { friendlyError } from "./errorMessages";

/*
 * friendlyError ist zweisprachig: ohne Sprache Deutsch (CRM), mit "en"
 * Englisch fürs Kundenportal.
 */
describe("friendlyError", () => {
  it("bleibt ohne Sprachangabe deutsch", () => {
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/^Wir konnten den Server nicht erreichen/);
    expect(friendlyError(null)).toMatch(/^Es ist etwas schiefgelaufen/);
  });

  it("übersetzt bekannte Muster ins Englische", () => {
    expect(friendlyError(new Error("Failed to fetch"), undefined, "en")).toMatch(/^We couldn't reach the server/);
    expect(friendlyError(new Error("JWT expired"), undefined, "en")).toBe("Your session has expired. Please sign in again.");
    expect(friendlyError(null, undefined, "en")).toMatch(/^Something went wrong/);
  });

  it("zeigt einem englischen Leser keine deutsche Rohmeldung", () => {
    const deutsch = new Error("Code ungültig oder bereits verbraucht");
    expect(friendlyError(deutsch)).toBe("Code ungültig oder bereits verbraucht");
    expect(friendlyError(deutsch, undefined, "en")).toMatch(/^Something went wrong/);
    expect(friendlyError(deutsch, "Custom fallback", "en")).toBe("Custom fallback");
  });

  it("lässt englische Rohmeldungen für Englisch durch", () => {
    const roh = new Error("New password should be different from the old password.");
    expect(friendlyError(roh, undefined, "en")).toBe("New password should be different from the old password.");
  });
});
