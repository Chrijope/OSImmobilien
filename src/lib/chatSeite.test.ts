import { describe, it, expect } from "vitest";
import { aussenKennungen, chatArt, stehtRechts } from "./chatSeite";

// Erfundene Kennungen, keine echten Personen.
const ADMIN = "admin-1";
const PARTNER = "partner-1";
const KUNDE = "kunde-1";
const KUNDE_ZWEI = "kunde-2";
const TIPPGEBER = "tippgeber-1";

const kundenchat = {
  typ: "kundenkommunikation",
  kundeId: "kontakt-1",
  teilnehmer: [
    { id: PARTNER, role: "Immobilienberater" },
    { id: KUNDE, role: "Kunde" },
    { id: ADMIN, role: "Admin" },
  ],
  nachrichten: [{ senderId: KUNDE }, { senderId: PARTNER }],
};

const kontakte = [{ id: "kontakt-1", meta: { authUserId: KUNDE } }];

describe("chatArt", () => {
  it("erkennt Kunden-, Tippgeber- und interne Chats", () => {
    expect(chatArt({ typ: "kundenkommunikation" })).toBe("kunde");
    expect(chatArt({ typ: "direkt", kind: "tippgeber_vp" })).toBe("tippgeber");
    expect(chatArt({ typ: "intern" })).toBe("intern");
  });
});

describe("Kundenchat im CRM", () => {
  const aussen = aussenKennungen(kundenchat, { kontakte });

  it("aus Admin-Sicht: Kunde links, Partner rechts", () => {
    expect(stehtRechts(KUNDE, ADMIN, aussen)).toBe(false);
    expect(stehtRechts(PARTNER, ADMIN, aussen)).toBe(true);
    expect(stehtRechts(ADMIN, ADMIN, aussen)).toBe(true);
  });

  it("aus Partner-Sicht genauso: Kunde links, Partner und Admin rechts", () => {
    expect(stehtRechts(KUNDE, PARTNER, aussen)).toBe(false);
    expect(stehtRechts(PARTNER, PARTNER, aussen)).toBe(true);
    expect(stehtRechts(ADMIN, PARTNER, aussen)).toBe(true);
  });

  it("aus Kundensicht umgekehrt: eigene rechts, MOREImmo links", () => {
    expect(stehtRechts(KUNDE, KUNDE, aussen)).toBe(true);
    expect(stehtRechts(PARTNER, KUNDE, aussen)).toBe(false);
    expect(stehtRechts(ADMIN, KUNDE, aussen)).toBe(false);
  });

  it("findet den Kunden auch ohne Kontaktzeile, allein ueber die Rolle", () => {
    const ohneRollenbezeichnung = {
      ...kundenchat,
      teilnehmer: kundenchat.teilnehmer.map((t) => ({ ...t, role: "" })),
    };
    const userRoles = [
      { user_id: KUNDE, role: "kunde" },
      { user_id: PARTNER, role: "vertriebspartner" },
      { user_id: ADMIN, role: "admin" },
    ];
    const ids = aussenKennungen(ohneRollenbezeichnung, { userRoles });
    expect(ids && [...ids]).toEqual([KUNDE]);
  });

  it("ein Mitarbeiter, der zusaetzlich die Kundenrolle traegt, bleibt auf der MOREImmo-Seite", () => {
    const userRoles = [
      { user_id: PARTNER, role: "kunde" },
      { user_id: PARTNER, role: "vertriebspartner" },
    ];
    const ids = aussenKennungen({ ...kundenchat, teilnehmer: [{ id: PARTNER, role: "" }] }, { userRoles });
    expect(ids?.has(PARTNER)).toBe(false);
  });

  it("zaehlt die zweite Person des Kontakts zur Kundenseite", () => {
    const ids = aussenKennungen(kundenchat, {
      kontakte: [{ id: "kontakt-1", meta: { authUserId: KUNDE, person2: { authUserId: KUNDE_ZWEI } } }],
    });
    expect(stehtRechts(KUNDE_ZWEI, ADMIN, ids)).toBe(false);
  });
});

describe("Tippgeber-Chat", () => {
  const chat = {
    typ: "direkt",
    kind: "tippgeber_vp",
    erstelltVonId: TIPPGEBER,
    teilnehmer: [
      { id: TIPPGEBER, role: "Tippgeber" },
      { id: PARTNER, role: "Vertriebspartner" },
    ],
  };
  const aussen = aussenKennungen(chat);

  it("im CRM: Tippgeber links, MOREImmo rechts, auch wenn der Admin liest", () => {
    expect(stehtRechts(TIPPGEBER, ADMIN, aussen)).toBe(false);
    expect(stehtRechts(PARTNER, ADMIN, aussen)).toBe(true);
    expect(stehtRechts(PARTNER, PARTNER, aussen)).toBe(true);
  });

  it("im Tippgeber-Portal: eigene rechts, MOREImmo links", () => {
    expect(stehtRechts(TIPPGEBER, TIPPGEBER, aussen)).toBe(true);
    expect(stehtRechts(PARTNER, TIPPGEBER, aussen)).toBe(false);
  });
});

describe("Interner Chat", () => {
  const aussen = aussenKennungen({ typ: "intern", teilnehmer: [{ id: ADMIN }, { id: PARTNER }] });

  it("hat keine Aussenseite", () => {
    expect(aussen).toBeNull();
  });

  it("eigene rechts, alle anderen links", () => {
    expect(stehtRechts(ADMIN, ADMIN, aussen)).toBe(true);
    expect(stehtRechts(PARTNER, ADMIN, aussen)).toBe(false);
    expect(stehtRechts(ADMIN, PARTNER, aussen)).toBe(false);
  });

  it("das Testkonto schreibt als \"current\" und steht rechts", () => {
    expect(stehtRechts("current", "current", aussen)).toBe(true);
  });
});

describe("Portalsicht", () => {
  it("Kundenportal mit der eigenen Kennung als Kundenseite: eigene rechts, sonst links", () => {
    const kundenSeite = new Set([KUNDE]);
    expect(stehtRechts(KUNDE, KUNDE, kundenSeite)).toBe(true);
    expect(stehtRechts(PARTNER, KUNDE, kundenSeite)).toBe(false);
    expect(stehtRechts(ADMIN, KUNDE, kundenSeite)).toBe(false);
  });
});
