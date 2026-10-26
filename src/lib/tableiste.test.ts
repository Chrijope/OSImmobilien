import { describe, expect, it } from "vitest";
import type { NavItem } from "./sidebarNavigation";
import { tableisteEintraege } from "./tableiste";

const item = (url: string, title: string) => ({ url, title }) as NavItem;
const ALLE = [item("/", "Dashboard"), item("/inbox", "Inbox"), item("/chat", "Chat"), item("/alle-kontakte", "Alle Kontakte"), item("/pipeline", "Pipeline"), item("/objekte", "Objekte")];
const urls = (rolle: string, erlaubt = ALLE) => tableisteEintraege(erlaubt, rolle).map((e) => e.url);

describe("Tableiste je Rolle", () => {
  it("Vertrieb: Start, Kontakte, Pipeline, Aufgaben", () => {
    expect(urls("vertriebspartner")).toEqual(["/", "/alle-kontakte", "/pipeline", "/inbox"]);
    expect(tableisteEintraege(ALLE, "vertriebspartner").map((e) => e.titel)).toEqual(["Start", "Kontakte", "Pipeline", "Aufgaben"]);
  });

  it("Führung: Start, Kontakte, Objekte, Inbox", () => {
    expect(urls("inhaber")).toEqual(["/", "/alle-kontakte", "/objekte", "/inbox"]);
  });

  it("übrige Rollen: Start, Inbox und die nächsten Menüpunkte", () => {
    expect(urls("buchhaltung")).toEqual(["/", "/inbox", "/chat", "/alle-kontakte"]);
  });

  it("nimmt nur, was die Seitenleiste zeigt, und lässt nachrücken", () => {
    const ohneObjekte = ALLE.filter((i) => i.url !== "/objekte");
    expect(urls("vertriebsleiter", ohneObjekte)).toEqual(["/", "/alle-kontakte", "/inbox", "/chat"]);
  });
});
