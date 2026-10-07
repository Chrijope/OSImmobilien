import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { andereAdresseOffen, rpcFehlt, saDatenFuerPerson, saDatenSicht, saLinkAblauf, saLinkFrischAbgeschlossen, saPersonNr, saSignaturErlaubt, saUnterschriftenSicht, SA_LINK_GUELTIG_TAGE } from "../../supabase/functions/_shared/sa-fester-link";

/**
 * Ein fester Selbstauskunfts-Link je Kontakt, Investment und Person
 * (07.10.2026). Die Rechnerei der Functions und ihr Einsatz in Einladung,
 * Erinnerung und Abschluss.
 */

const jetzt = new Date("2026-10-07T10:00:00.000Z");
const lies = (d: string) => readFileSync(d, "utf8");

describe("fester Selbstauskunfts-Link, Rechnerei", () => {
  it("gilt 30 Tage ab jetzt und verkürzt nie einen längeren Ablauf", () => {
    expect(SA_LINK_GUELTIG_TAGE).toBe(30);
    expect(saLinkAblauf(jetzt)).toBe("2026-11-06T10:00:00.000Z");
    expect(saLinkAblauf(jetzt, "2026-10-01T00:00:00.000Z")).toBe("2026-11-06T10:00:00.000Z");
    expect(saLinkAblauf(jetzt, "2027-01-01T00:00:00.000Z")).toBe("2027-01-01T00:00:00.000Z");
    expect(saLinkAblauf(jetzt, "kein Datum")).toBe("2026-11-06T10:00:00.000Z");
  });

  it("Person 2 schreibt nur ihren Teil, die Angaben von Person 1 bleiben", () => {
    const bestand = { vorname: "Max", steuerId: "123", bankkonten: [{ iban: "DE00" }], person2Data: { vorname: "Alt" } };
    const eingabe = { vorname: "", steuerId: "", bankkonten: [], person2Data: { vorname: "Erika", steuerId: "456" } };
    expect(saDatenFuerPerson(2, eingabe, bestand)).toEqual({
      vorname: "Max", steuerId: "123", bankkonten: [{ iban: "DE00" }], person2: true, person2Data: { vorname: "Erika", steuerId: "456" },
    });
    expect(saDatenFuerPerson(2, { vorname: "X" }, null)).toEqual({ person2: true, person2Data: {} });
  });

  it("Person 1 ersetzt den Stand wie bisher", () => {
    const eingabe = { vorname: "Max", person2Data: { vorname: "Erika" } };
    expect(saDatenFuerPerson(1, eingabe, { vorname: "Alt" })).toBe(eingabe);
    expect(saDatenFuerPerson(undefined, eingabe, null)).toBe(eingabe);
  });

  it("Person 2 sieht nur ihren Teil und ihre eigene Unterschrift", () => {
    const stand = { vorname: "Max", steuerId: "123", person2Data: { vorname: "Erika" } };
    expect(saDatenSicht(2, stand)).toEqual({ person2: true, person2Data: { vorname: "Erika" } });
    expect(saDatenSicht(1, stand)).toBe(stand);
    expect(saDatenSicht(2, null)).toBeNull();
    expect(saUnterschriftenSicht(2, { person1: "a", person2: "b" })).toEqual({ person2: "b" });
    expect(saUnterschriftenSicht(1, { person1: "a", person2: "b" })).toEqual({ person1: "a", person2: "b" });
  });

  it("Unterschrift gehört zur Person des Links: Person 2 nur person2, Person 1 wie bisher", () => {
    expect(saSignaturErlaubt(2, "person2")).toBe(true);
    expect(saSignaturErlaubt(2, " Person2 ")).toBe(true);
    expect(saSignaturErlaubt(2, "person1")).toBe(false);
    expect(saSignaturErlaubt(2, "partner")).toBe(false);
    expect(saSignaturErlaubt(1, "person1")).toBe(true);
    expect(saSignaturErlaubt(1, "person2")).toBe(true);
  });

  it("abgeschlossener Link darf nur zwei Stunden nach dem eigenen Abschluss abholen", () => {
    const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000).toISOString();
    expect(saLinkFrischAbgeschlossen({ abgeschlossen_am: vor(5) }, jetzt)).toBe(true);
    expect(saLinkFrischAbgeschlossen({ abgeschlossen_am: vor(119) }, jetzt)).toBe(true);
    expect(saLinkFrischAbgeschlossen({ abgeschlossen_am: vor(121) }, jetzt)).toBe(false);
    // Spalte da, aber leer: nicht über den eigenen Abschluss beendet, also nie.
    expect(saLinkFrischAbgeschlossen({ abgeschlossen_am: null, updated_at: vor(1) }, jetzt)).toBe(false);
    // Ohne Migration fehlt die Spalte, dann zählt updated_at.
    expect(saLinkFrischAbgeschlossen({ updated_at: vor(10) }, jetzt)).toBe(true);
    expect(saLinkFrischAbgeschlossen({ updated_at: vor(300) }, jetzt)).toBe(false);
    expect(saLinkFrischAbgeschlossen({}, jetzt)).toBe(false);
  });

  it("erkennt einen offenen Link an einer anderen Adresse", () => {
    expect(andereAdresseOffen([{ email: " Max@Example.org" }], "max@example.org")).toBe(false);
    expect(andereAdresseOffen([{ email: "alt@example.org" }], "max@example.org")).toBe(true);
    expect(andereAdresseOffen([], "max@example.org")).toBe(false);
  });

  it("nur Person 1 oder 2, ohne Angabe Person 1", () => {
    expect(saPersonNr(undefined)).toBe(1);
    expect(saPersonNr(1)).toBe(1);
    expect(saPersonNr("2")).toBe(2);
    expect(saPersonNr(3)).toBeNull();
    expect(saPersonNr("x")).toBeNull();
  });

  it("erkennt eine fehlende Datenbankfunktion, sonst nicht", () => {
    expect(rpcFehlt({ code: "PGRST202" })).toBe(true);
    expect(rpcFehlt({ code: "42883" })).toBe(true);
    expect(rpcFehlt({ code: "42501" })).toBe(false);
    expect(rpcFehlt(null)).toBe(false);
  });
});

describe("Einladung zur Selbstauskunft (send-sa-invitation)", () => {
  const src = lies("supabase/functions/send-sa-invitation/index.ts");
  const vor = (a: string, b: string) => expect(src.indexOf(a), `${a} vor ${b}`).toBeLessThan(src.indexOf(b));

  it("prüft Berechtigung, Investment und Person vor jeder Service-Role-Aktion", () => {
    expect(src).toContain('String(kontaktId), caller.id, null, { ohneKunde: true },');
    expect(src).toContain('if (!zugriff.erlaubt || !zugriff.kontakt) return antwort(403,');
    expect(src).toContain('String(investmentZeile.kunde_id ?? "") !== String(kontaktId)');
    expect(src).toContain("if (!kontaktId || !investmentId || personNr === null) return antwort(400,");
    // Reihenfolge: erst prüfen, dann zählen, ausstellen oder anlegen.
    for (const danach of ['.from("sa_fill_tokens")', 'supabase.rpc("sa_link_ausstellen"', "sendeVorlage("]) {
      vor("pruefeKontaktZugriff(", danach);
      vor("investmentZeile.kunde_id", danach);
    }
  });

  it("Empfänger nur aus dem Kontakt, nie aus der Anfrage", () => {
    expect(src).toContain('empfaengerAusKontakt(zugriff.kontakt, personNr === 2 ? "person2" : "person1")');
    expect(src).toContain("const kundeEmail = empfaenger.email;");
    expect(src).not.toMatch(/const \{[^}]*kundeEmail[^}]*\} = (await req\.json\(\)|anfrage)/);
  });

  it("stellt den Link über die Datenbank aus, fällt ohne Migration auf den alten Weg zurück", () => {
    expect(src).toContain('supabase.rpc("sa_link_ausstellen", {');
    expect(src).toContain("} else if (ausstellFehler && !rpcFehlt(ausstellFehler)) {");
    expect(src).toContain("expires_at: saLinkAblauf(jetzt),");
    // Rückfall nur, wenn kein offener Link an einer anderen Adresse liegt.
    expect(src).toContain("if (andereAdresseOffen(offene || [], kundeEmail)) {");
    expect(src).toContain('return antwort(409, "Bitte zuerst die Datenbank-Erweiterung einspielen.');
    expect(src.indexOf("andereAdresseOffen(offene")).toBeLessThan(src.lastIndexOf("expires_at: saLinkAblauf(jetzt),"));
    // Derselbe Link darf beim Neuversand nicht als doppelte Mail verschluckt werden.
    expect(src).toContain("idempotencyKey: `sa-fill-${tokenRow.token}-${Math.floor(jetzt.getTime() / 60000)}`");
  });

  it("der Kunde selbst darf keine Einladung auslösen (Zugriffshelfer ohne Kundenzweig)", () => {
    const helfer = lies("supabase/functions/_shared/kontakt-signatur-zugriff.ts");
    expect(helfer).toContain("if (!optionen.ohneKunde) {\n    if (meta.authUserId === aufruferId)");
  });
});

describe("Erinnerung und Abschluss", () => {
  it("Erinnerung verlängert denselben Link", () => {
    const src = lies("supabase/functions/send-sa-abbrecher-reminder/index.ts");
    expect(src).toContain("expires_at: saLinkAblauf(new Date(), t.expires_at)");
    expect(src).toContain("const fillUrl = `${SA_FILL_BASE_URL}/${t.token}`;");
  });

  it("Abschluss: widerrufen abgewiesen, Unterschrift an die Person gebunden, alles in einer RPC unter Sperre", () => {
    const src = lies("supabase/functions/submit-sa-signature/index.ts");
    expect(src).toContain('if (tokenData.status !== "pending") {');
    expect(src.indexOf('if (tokenData.status === "used")')).toBeLessThan(src.indexOf('if (tokenData.status !== "pending")'));
    // Punkt 2: Unterschrift serverseitig an die Person des Links gebunden, vor jedem Schreiben.
    expect(src).toContain("every((sig) => saSignaturErlaubt(personNrLink, sig?.personType))");
    expect(src.indexOf("saSignaturErlaubt(personNrLink")).toBeLessThan(src.indexOf("saNeueFassungMetaPatch(metaVorher"));
    // Punkte 3 und 4: Abschluss über die RPC, Rückfall nur ohne Migration.
    expect(src).toContain('supabase.rpc("sa_link_abschliessen", {');
    expect(src).toContain("if (rpcFehlt(abschlussFehler)) {");
    expect(src).toContain('if (ergebnis === "schon_abgeschlossen") {');
    expect(src).toContain('if (ergebnis !== "ok") {');
    // Die Mail an Person 2 erst nach dem Abschluss.
    expect(src.indexOf('supabase.rpc("sa_link_abschliessen"')).toBeLessThan(src.indexOf("const p2Mail = await p2Nachfordern(saDaten);"));
    // Auch der Rückfall setzt used nur auf einen offenen Link.
    expect(src).toContain('.update({ status: "used" })\n        .eq("token", token)\n        .eq("status", "pending");');
    expect(src).not.toMatch(/\.update\(\{ status: "used" \}\)\n\s*\.eq\("token", token\);/);
  });

  it("finalize: offener Link bis Ablauf, abgeschlossener nur kurz danach, nur eigene Fassung, Person 2 nur ihr Teil", () => {
    const src = lies("supabase/functions/finalize-selbstauskunft/index.ts");
    expect(src).toContain('fillRow.status === "pending"\n          ? new Date(String(fillRow.expires_at ?? "")).getTime() > Date.now()\n          : fillRow.status === "used" && saLinkFrischAbgeschlossen(fillRow, new Date())');
    expect(src).toContain("fillFassung = String(fillRow.id);");
    // Antworten nur für die eigene Fassung, sonst 403.
    expect(src).toContain("if (fillFassung && fassung !== fillFassung) {");
    expect(src.match(/return antwortFuerLink\(\{/g)).toHaveLength(3);
    expect(src).toContain("}, bisher.fassung);");
    expect(src.match(/\}, stand\.fassung\);/g)).toHaveLength(2);
    expect(src).not.toContain("fuerDenLink(");
    // Auch die PDF-Ablage über den Link nur für die eigene Fassung.
    expect(src).toContain("if (saUnterschriftenStand(anfragenZurPdf ?? []).fassung !== fillFassung) {");
    expect(src.indexOf("anfragenZurPdf")).toBeLessThan(src.indexOf("const ergebnis = await pdfAblegen("));
    expect(src).toContain("saData: antwort.saData === undefined ? undefined : saDatenSicht(2, antwort.saData),");
    expect(src).toContain("signatures: saUnterschriftenSicht(2, antwort.signatures");
  });

  it("Mail an Person 2: nachholbar, Vermerk erst nach erfolgreichem Versand, nie von einem Person-2-Link", () => {
    const src = lies("supabase/functions/submit-sa-signature/index.ts");
    expect(src).toContain("const p2PerMail = Number(tokenData.person_nr) === 2 ? null : p2ViaEmail;");
    expect(src).toContain('Object.prototype.hasOwnProperty.call(tokenData, "p2_nachforderung_am")');
    // Vermerk nur nach erfolgreichem Versand.
    const vermerk = src.indexOf(".update({ p2_nachforderung_am: new Date().toISOString() })");
    expect(vermerk).toBeGreaterThan(src.indexOf("if (p2Mail.versendet) {"));
    // Nachgeholt im frühen Wiederholungszweig und im Zweig schon_abgeschlossen.
    expect(src.match(/const p2Mail = p2NachforderungOffen \? await p2Nachfordern\(saData\) : null;/g)).toHaveLength(2);
    const frueh = src.indexOf('if (tokenData.status === "used") {');
    expect(src.indexOf("p2NachforderungOffen ? await p2Nachfordern(saData)", frueh)).toBeLessThan(src.indexOf('invoke("finalize-selbstauskunft"', frueh));
    // Hauptweg: nach dem Abschluss.
    expect(src.indexOf("const p2Mail = await p2Nachfordern(saDaten);")).toBeGreaterThan(src.indexOf('supabase.rpc("sa_link_abschliessen"'));
    // Die Fassung der Anfrage bleibt die des Links (Idempotenz bei send-signature-request).
    expect(src).toContain("saFassung: String(tokenData.id),");
  });
});
