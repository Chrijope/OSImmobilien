import { describe, expect, it } from "vitest";
// Die Logik liegt bei der Edge Function `chat-benachrichtigung`, getestet wird
// sie hier, weil Vitest nur unterhalb von src sucht (wie bei
// finanzierungStartenMail.test.ts).
import {
  chatEmpfaengerErmitteln,
  chatMailDaten,
  chatMailSchluessel,
  chatZiel,
  chatZielAdresse,
  erwaehnteIds,
  glockenZeile,
} from "../../supabase/functions/_shared/chat-empfaenger.ts";

const rollen = new Map<string, string[]>([
  ["partner", ["vertriebspartner"]],
  ["admin", ["admin"]],
  ["kunde", ["kunde"]],
  ["beides", ["kunde", "vertriebspartner"]],
  ["tippgeber", ["tippgeber"]],
  ["leiter", ["vertriebsleiter"]],
]);

describe("Wer bei einer Chatnachricht benachrichtigt wird", () => {
  it("schreibt der Kunde, bekommt sein Partner Glocke und Mail, der Kunde selbst nicht", () => {
    const e = chatEmpfaengerErmitteln("kunde", ["kunde", "partner"], rollen);
    expect(e.map((x) => x.id)).toEqual(["partner"]);
  });

  it("schreibt der Partner, bekommt der Kunde hier nichts, er hat eigene Meldungen", () => {
    const e = chatEmpfaengerErmitteln("partner", ["kunde", "partner"], rollen);
    expect(e).toEqual([]);
  });

  it("im internen Chat bekommen alle ausser dem Absender eine Meldung", () => {
    const e = chatEmpfaengerErmitteln("admin", ["admin", "partner", "leiter"], rollen);
    expect(e.map((x) => x.id)).toEqual(["partner", "leiter"]);
  });

  it("nennt jeden Empfaenger nur einmal, auch bei doppelter Teilnehmerzeile", () => {
    const e = chatEmpfaengerErmitteln("admin", ["partner", "partner", null, undefined], rollen);
    expect(e.map((x) => x.id)).toEqual(["partner"]);
  });

  it("wer neben kunde eine CRM-Rolle hat, gilt als CRM-Nutzer", () => {
    const e = chatEmpfaengerErmitteln("admin", ["beides"], rollen);
    expect(e.map((x) => x.id)).toEqual(["beides"]);
  });

  it("wer gar keine Rolle mehr hat, bekommt nichts", () => {
    expect(chatEmpfaengerErmitteln("admin", ["geloescht"], rollen)).toEqual([]);
  });

  it("kennzeichnet Tippgeber, ihr Chat liegt im Portal", () => {
    const e = chatEmpfaengerErmitteln("partner", ["tippgeber"], rollen);
    expect(e).toEqual([{ id: "tippgeber", istTippgeber: true }]);
  });
});

describe("Wohin Glocke und Mail fuehren", () => {
  it("fuehrt im CRM direkt in genau diesen Chat", () => {
    expect(chatZiel("chat-1", { istTippgeber: false })).toBe("/chat?id=chat-1");
  });

  it("fuehrt Tippgeber in den Chat ihres Portals", () => {
    expect(chatZiel("chat-1", { istTippgeber: true })).toBe("/tippgeber-portal?tab=chat");
  });

  it("baut die volle Adresse auf osimmobilien.netlify.app, auch mit Schraegstrich am Ende", () => {
    expect(chatZielAdresse("https://osimmobilien.netlify.app/", "/chat?id=chat-1")).toBe(
      "https://osimmobilien.netlify.app/chat?id=chat-1",
    );
  });
});

describe("Eine Glocke je Nachricht und Empfaenger", () => {
  const basis = {
    chatId: "chat-1",
    chatName: "Otto Hans",
    nachrichtId: "n-1",
    absenderId: "kunde",
    absenderName: "Otto Hans",
    empfaengerName: "Bea Beispiel",
    text: "Kurze Rückfrage zur Wohnung.",
  };

  it("schreibt eine gewoehnliche Chatglocke mit Link in den Chat", () => {
    const z = glockenZeile({ ...basis, empfaenger: { id: "partner", istTippgeber: false }, erwaehnt: false });
    expect(z.benutzer_id).toBe("partner");
    expect(z.titel).toBe("Neue Nachricht von Otto Hans");
    expect(z.link).toBe("/chat?id=chat-1");
    expect(z.meta).toMatchObject({ notif_type: "chat_nachricht", chatId: "chat-1", nachrichtId: "n-1" });
    // Chatname und Absender sind im Kundenchat derselbe, er steht nicht doppelt da.
    expect(z.nachricht).toBe("Kurze Rückfrage zur Wohnung.");
  });

  it("nennt im internen Chat den Chat vor dem Auszug", () => {
    const z = glockenZeile({
      ...basis,
      chatName: "Team Süd",
      absenderName: "Chris Chef",
      empfaenger: { id: "partner", istTippgeber: false },
      erwaehnt: false,
    });
    expect(z.nachricht).toBe("Team Süd: Kurze Rückfrage zur Wohnung.");
  });

  it("wer erwaehnt wurde, bekommt die Erwaehnung statt der Chatglocke, nicht beides", () => {
    const z = glockenZeile({ ...basis, empfaenger: { id: "partner", istTippgeber: false }, erwaehnt: true });
    expect(z.titel).toBe("@Erwähnung von Otto Hans");
    expect(z.meta.notif_type).toBe("mention");
    // Das Format, das notificationStore.ts fuer Erwaehnungen liest.
    expect(z.meta.payload).toMatchObject({
      chatId: "chat-1",
      mentionedId: "partner",
      mentionedById: "kunde",
      mentionedByName: "Otto Hans",
    });
  });

  it("kuerzt den Auszug in der Glocke", () => {
    const z = glockenZeile({ ...basis, text: "x".repeat(200), empfaenger: { id: "p", istTippgeber: false }, erwaehnt: false });
    expect(z.nachricht.length).toBe(81);
    expect(z.nachricht.endsWith("…")).toBe(true);
  });
});

describe("Erwaehnungen", () => {
  const namen = new Map<string, string[]>([
    ["partner", ["Bea Beispiel"]],
    ["zwilling-1", ["Otto Hans"]],
    ["zwilling-2", ["Otto Hans"]],
  ]);

  it("findet den Angesprochenen ohne Ruecksicht auf Gross- und Kleinschreibung", () => {
    expect([...erwaehnteIds("Hallo @bea beispiel, kurz schauen?", namen)]).toEqual(["partner"]);
  });

  it("meint bei gleichem Namen beide, wie bisher im Browser", () => {
    expect([...erwaehnteIds("@Otto Hans bitte", namen)].sort()).toEqual(["zwilling-1", "zwilling-2"]);
  });

  it("ohne @ ist niemand erwaehnt", () => {
    expect(erwaehnteIds("Bea Beispiel weiss Bescheid", namen).size).toBe(0);
  });
});

describe("Die Mail an den Partner", () => {
  it("fuehrt mit dem Knopf direkt in den Chat und geht in der Partner-Richtung", () => {
    const d = chatMailDaten({
      empfaengerName: "Bea Beispiel",
      absenderName: "Otto Hans",
      chatName: "Otto Hans",
      text: "Kurze Rückfrage zur Wohnung.",
      portalUrl: "https://osimmobilien.netlify.app/chat?id=chat-1",
    });
    // kundeName ist in der Vorlage die Anrede des Empfaengers, beraterName der Absender.
    expect(d.kundeName).toBe("Bea Beispiel");
    expect(d.beraterName).toBe("Otto Hans");
    expect(d.portalUrl).toBe("https://osimmobilien.netlify.app/chat?id=chat-1");
    expect(d.anPartner).toBe(true);
  });

  it("hat einen Schluessel je Nachricht und Empfaenger, damit keine Mail doppelt geht", () => {
    expect(chatMailSchluessel("n-1", "partner")).toBe("chat-nachricht-n-1-partner");
    expect(chatMailSchluessel("n-1", "partner")).not.toBe(chatMailSchluessel("n-1", "leiter"));
    expect(chatMailSchluessel("n-1", "partner")).not.toBe(chatMailSchluessel("n-2", "partner"));
  });
});
