import { describe, expect, it } from "vitest";
import { loginZielFuer } from "./chatDirektlink";

describe("Direkt in einen Chat", () => {
  it("merkt sich den Chat, wenn erst angemeldet werden muss", () => {
    const ziel = loginZielFuer("/chat", "?id=abc-123");
    expect(ziel).toBe("/login?redirect=%2Fchat%3Fid%3Dabc-123");
    // Login.tsx liest den Parameter so und springt nach der Anmeldung dorthin.
    expect(new URLSearchParams(ziel.split("?")[1]).get("redirect")).toBe("/chat?id=abc-123");
  });

  it("laesst alle anderen Seiten wie bisher", () => {
    expect(loginZielFuer("/", "")).toBe("/login");
    expect(loginZielFuer("/pipeline", "?x=1")).toBe("/login");
    // Kein Treffer ueber den blossen Anfang des Wortes.
    expect(loginZielFuer("/chatbot", "")).toBe("/login");
  });
});
