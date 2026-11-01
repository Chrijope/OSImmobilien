/**
 * Abholen gegen einen echten, lokalen IMAP-Testserver (hoodiecrow): Zuordnung
 * zu Kontakten, Gelesen-Status, keine Dubletten, am Handy gelesen.
 * Laufen lassen: MAIL_TEST_LOKALE_SERVER=1 deno test -A --node-modules-dir=none --no-config supabase/functions/_shared/mailkonto_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ImapFlow } from "npm:imapflow@1.0.172";
import hoodiecrow from "npm:hoodiecrow-imap@2.1.0";
import { istInterneAdresse, kontoAbholen, sichererServer, type MailKonto } from "./mailkonto.ts";
import { assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const roh = (von: string, an: string, betreff: string, id: string) =>
  `From: ${von}\r\nTo: ${an}\r\nSubject: ${betreff}\r\nMessage-ID: <${id}@x>\r\nDate: Sat, 01 Nov 2026 10:00:00 +0100\r\n\r\nText von ${betreff}\r\n`;
const server = hoodiecrow({
  plugins: ["SPECIAL-USE", "UIDPLUS", "MOVE"],
  users: { os: { password: 'pass' } },
  storage: {
    INBOX: { messages: [
      { raw: roh("Anna Kunde <anna@kunde.de>", "os@os.de", "Erste", "1"), flags: [] },
      { raw: roh("fremd@x.de", "os@os.de", "Zweite", "2"), flags: ["\\Seen"] },
    ] },
    "": { folders: { Sent: { "special-use": "\\Sent", messages: [ { raw: roh("os@os.de", "anna@kunde.de", "Antwort", "3"), flags: ["\\Seen"] } ] } } },
  },
});
Deno.test({ name: "Mailkonto abholen", sanitizeOps: false, sanitizeResources: false, fn: async () => {
await new Promise((r) => server.listen(1143, r));

// Attrappe der Datenbank: zeichnet Aufrufe auf.
const zeilen: any[] = []; const kontoUpdates: any[] = [];
const admin: any = {
  rpc: async (name: string, a: any) => name === "email_geheimnis_lesen" ? { data: 'pass' } : { data: a._adressen.includes("anna@kunde.de") ? "kontakt-anna" : null },
  from: (t: string) => {
    const q: any = { _t: t, _f: {} as any };
    q.upsert = async (z: any) => { if (!zeilen.some((x) => x.imap_uid === z.imap_uid && x.imap_ordner === z.imap_ordner)) zeilen.push(z); return { error: null }; };
    q.update = (w: any) => { q._w = w; return q; };
    q.select = () => q; q.not = () => q; q.limit = () => q; q.is = () => q;
    q.maybeSingle = async () => ({ data: null });
    q.eq = (k: string, v: any) => { q._f[k] = v; if (q._w && t === "email_konten") { kontoUpdates.push(q._w); return Promise.resolve({ error: null }); } return q; };
    q.in = (_k: string, ids: string[]) => { for (const z of zeilen) if (ids.includes(z._id)) Object.assign(z, q._w); return Promise.resolve({ error: null }); };
    q.then = (ok: any) => ok({ data: zeilen.filter((z) => z.imap_ordner === q._f.imap_ordner && z.gelesen === false).map((z) => ({ id: z._id ??= crypto.randomUUID(), imap_uid: z.imap_uid })) });
    return q;
  },
};
const konto: MailKonto = { id: "k1", benutzer_id: "u1", art: "imap", adresse: "os@os.de", anzeigename: null, imap_host: "localhost", imap_port: 1143, smtp_host: null, smtp_port: 465, benutzername: "os", ordner_stand: {} };
const e1 = await kontoAbholen(admin, konto);
assertEquals(e1.neu, 3);
assertEquals(zeilen.map((z) => [z.ordner, z.betreff, z.kontakt_id, z.gelesen]), [
  ["posteingang", "Erste", "kontakt-anna", false],
  ["posteingang", "Zweite", null, true],
  ["gesendet", "Antwort", "kontakt-anna", true],
]);
konto.ordner_stand = kontoUpdates.at(-1).ordner_stand;
// Am "Handy" lesen: Flag direkt auf dem Server setzen.
const handy = new ImapFlow({ host: "localhost", port: 1143, secure: false, auth: { user: "os", pass: "pass" }, logger: false });
await handy.connect(); await handy.mailboxOpen("INBOX"); await handy.messageFlagsAdd("1", ["\\Seen"], { uid: true }); await handy.logout();
const e2 = await kontoAbholen(admin, konto);
assertEquals(e2, { neu: 0, gelesenNachgezogen: 1 });
assertEquals(zeilen.length, 3);
server.close();
} });

Deno.test("Mailserver dürfen nicht ins interne Netz zeigen", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert(istInterneAdresse(ip), ip);
  for (const ip of ["8.8.8.8", "212.227.17.1", "2a00:1450::1"]) assertEquals(istInterneAdresse(ip), false, ip);
  // Ohne Testfreigabe: fremder Port und Name ohne Domain werden abgewiesen.
  if (Deno.env.get("MAIL_TEST_LOKALE_SERVER") !== "1") {
    await assertRejects(() => sichererServer("imap.gmail.com", 22, [993, 143]));
    await assertRejects(() => sichererServer("localhost", 993, [993, 143]));
  }
});
