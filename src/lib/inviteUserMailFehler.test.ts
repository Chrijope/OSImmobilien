import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * M18 (04.10.2026): Bei einem neuen Konto meldete invite-user Erfolg, auch
 * wenn die Aktivierungs-E-Mail nicht rausging. Jetzt wie beim vorhandenen
 * Konto ein Fehler, aber erst nachdem Rollen, Einstellungen und Kontakt
 * verknüpft sind.
 */

const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/invite-user/index.ts"), "utf-8");

describe("invite-user: Mailfehler beim neuen Konto", () => {
  it("merkt sich den Fehler im Zweig für neue Konten", () => {
    const zweig = quelle.slice(quelle.indexOf('console.error("invite-user: activation email error (new)"'), quelle.indexOf('if (role === "kunde" && newUser?.user?.id)'));
    expect(zweig).toContain("neuMailFehler = mailErr instanceof Error ? mailErr.message : String(mailErr);");
  });

  it("gibt ihn nach der Verknüpfung als Fehler zurück, nicht als Erfolg", () => {
    const verknuepfung = quelle.indexOf("// Link kontakt to auth user");
    const meldung = quelle.indexOf("if (neuMailFehler) {");
    const erfolg = quelle.indexOf('console.log("invite-user: Success for", email);');
    expect(verknuepfung).toBeGreaterThan(-1);
    expect(meldung).toBeGreaterThan(verknuepfung);
    expect(erfolg).toBeGreaterThan(meldung);
    expect(quelle.slice(meldung, erfolg)).toContain("status: 500");
  });

  it("wertet eine Antwort success false, etwa email_suppressed, als Fehler (Prüfung Codex)", () => {
    expect(quelle).toContain("const { data: sendData, error: sendError } = await adminClient.functions.invoke(\"send-transactional-email\"");
    const pruefung = quelle.indexOf("if (versand.success === false) {");
    expect(pruefung).toBeGreaterThan(quelle.indexOf("if (sendError) {"));
    expect(quelle.slice(pruefung, pruefung + 400)).toContain('versand.reason === "email_suppressed"');
    expect(quelle.slice(pruefung, pruefung + 600)).toContain("throw new Error(");
  });
});
