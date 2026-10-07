import { describe, it, expect } from "vitest";
import { benachrichtigungZiel } from "./benachrichtigungZiel";

/**
 * Der Klick auf eine Benachrichtigung darf nie auf der 404-Seite enden.
 * Anlass ist der 14.09.2026: "Neuer Bewerber: Eric Schoof" trug eine volle
 * Adresse, und der Router machte daraus einen Pfad, den es nicht gibt.
 */
const HOST = "id-preview-abc.lovable.app";

describe("Ein Pfad bleibt ein Pfad", () => {
  it("laesst einen relativen Pfad unveraendert durch", () => {
    expect(benachrichtigungZiel("/bewerberprozess?openBewerber=abc", HOST))
      .toEqual({ art: "intern", pfad: "/bewerberprozess?openBewerber=abc" });
  });
  it("faellt ohne Link auf die Inbox zurueck", () => {
    expect(benachrichtigungZiel("", HOST)).toEqual({ art: "intern", pfad: "/inbox" });
    expect(benachrichtigungZiel(null, HOST)).toEqual({ art: "intern", pfad: "/inbox" });
  });
});

describe("Eine volle Adresse auf das Haus wird zum Pfad", () => {
  /* Der Fall von Eric Schoof: volle Adresse in der Tabelle, Seite laeuft in
     der Lovable-Vorschau unter einer anderen Domain. */
  it("kuerzt die Portaladresse auf den Pfad, auch in der Vorschau", () => {
    expect(benachrichtigungZiel("https://osimmobilien.netlify.app/bewerberprozess?openBewerber=abc", HOST))
      .toEqual({ art: "intern", pfad: "/bewerberprozess?openBewerber=abc" });
  });
  it("behaelt Suchteil und Anker", () => {
    expect(benachrichtigungZiel("https://osimmobilien.netlify.app/kunden/1?tab=x#oben", HOST))
      .toEqual({ art: "intern", pfad: "/kunden/1?tab=x#oben" });
  });
  it("erkennt auch den eigenen Host der laufenden Seite", () => {
    expect(benachrichtigungZiel("https://" + HOST + "/inbox", HOST))
      .toEqual({ art: "intern", pfad: "/inbox" });
  });
});

describe("Fremdes bleibt draussen", () => {
  it("oeffnet eine fremde Adresse extern statt sie an den Router zu geben", () => {
    expect(benachrichtigungZiel("https://fremd.example/x", HOST))
      .toEqual({ art: "extern", url: "https://fremd.example/x" });
  });
  it("laesst kein javascript: durch", () => {
    expect(benachrichtigungZiel("javascript:alert(1)", HOST)).toEqual({ art: "intern", pfad: "/inbox" });
  });
  it("macht aus einem Wort ohne Schraegstrich einen Pfad", () => {
    expect(benachrichtigungZiel("inbox", HOST)).toEqual({ art: "intern", pfad: "/inbox" });
  });
});
