/**
 * Mailkonten: Verbinden, Abholen, Zuordnen, Senden (01.11.2026).
 *
 * Ersetzt den selbstgebauten IMAP-Client. Der baute Befehle aus
 * ungeprüften Werten zusammen (ein Anführungszeichen im Passwort genügte, um
 * eigene Befehle einzuschleusen), hielt keine UID und suchte den Mailtext
 * später über Absender und Datum, was die falsche Mail treffen konnte.
 *
 * Jetzt: imapflow (IMAP mit UIDs und Flags), mailparser (MIME), nodemailer
 * (SMTP). Passwörter liegen im Tresor und werden nur hier mit der
 * Dienstrolle gelesen (`email_geheimnis_lesen`).
 */
import { ImapFlow } from "npm:imapflow@1.0.172";
import { simpleParser } from "npm:mailparser@3.7.2";
import nodemailer from "npm:nodemailer@6.9.16";
import MailComposer from "npm:nodemailer@6.9.16/lib/mail-composer/index.js";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface MailKonto {
  id: string;
  benutzer_id: string;
  art: string;
  adresse: string;
  anzeigename: string | null;
  imap_host: string | null;
  imap_port: number;
  smtp_host: string | null;
  smtp_port: number;
  benutzername: string | null;
  ordner_stand: Record<string, { validity: number; uid: number }>;
}

export const KONTO_SPALTEN =
  "id, benutzer_id, art, adresse, anzeigename, imap_host, imap_port, smtp_host, smtp_port, benutzername, ordner_stand";

/** Höchstens so viele neue Mails je Ordner und Lauf; der Rest kommt beim nächsten. */
const JE_LAUF = 100;
/** Beim ersten Abholen eines Ordners die letzten so vielen. */
const ERSTER_LAUF = 30;
const MAX_QUELLE = 1_000_000;
const MAX_TEXT = 100_000;

export function klein(adresse: string | null | undefined): string {
  return (adresse ?? "").trim().toLowerCase();
}

export async function passwortLesen(admin: Admin, kontoId: string): Promise<string> {
  const { data, error } = await admin.rpc("email_geheimnis_lesen", { _konto: kontoId });
  if (error) throw new Error(`Zugang nicht lesbar: ${error.message}`);
  if (!data) throw new Error("Für dieses Konto ist kein Passwort hinterlegt.");
  return data as string;
}

export const IMAP_PORTS = [993, 143];
export const SMTP_PORTS = [465, 587];

/** Private, Loopback-, Link-local- und ähnliche Bereiche: dorthin darf kein Mailserver zeigen. */
export function istInterneAdresse(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return istInterneAdresse(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

/**
 * Löst den Servernamen einmal auf und gibt die geprüfte Adresse zurück. Verbunden
 * wird dann fest mit dieser Adresse (der Name nur für das Zertifikat), damit ein
 * Namensserver nicht zwischen Prüfung und Verbindung auf ein internes Ziel
 * umschwenken kann. Schützt die Functions davor, ins interne Netz zu greifen.
 */
export async function sichererServer(host: string, port: number, erlaubt: number[]): Promise<string> {
  // Nur für den Test mit einem lokalen Testserver (mailkonto_test.ts). Live nie gesetzt.
  if (Deno.env.get("MAIL_TEST_LOKALE_SERVER") === "1") return host;
  if (!erlaubt.includes(port)) throw new Error(`Port ${port} ist nicht erlaubt (erlaubt: ${erlaubt.join(", ")}).`);
  const name = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(name)) throw new Error("Ungültiger Servername.");
  const adressen: string[] = [];
  for (const art of ["A", "AAAA"] as const) {
    try {
      adressen.push(...(await Deno.resolveDns(name, art)));
    } catch {
      // Keine Einträge dieser Art.
    }
  }
  if (adressen.length === 0) throw new Error("Server nicht gefunden.");
  if (adressen.some(istInterneAdresse)) throw new Error("Dieser Server zeigt auf eine interne Adresse und ist nicht erlaubt.");
  return adressen[0];
}

export async function imapClient(k: Pick<MailKonto, "imap_host" | "imap_port" | "benutzername" | "adresse">, passwort: string) {
  if (!k.imap_host) throw new Error("Kein IMAP-Server angegeben.");
  const port = k.imap_port || 993;
  const ip = await sichererServer(k.imap_host, port, IMAP_PORTS);
  return new ImapFlow({
    host: ip,
    servername: k.imap_host,
    port,
    // 993 ist verschlüsselt ab der ersten Zeile, 143 muss per STARTTLS wechseln.
    secure: port === 993,
    doSTARTTLS: port === 993 || Deno.env.get("MAIL_TEST_LOKALE_SERVER") === "1" ? undefined : true,
    auth: { user: k.benutzername || k.adresse, pass: passwort },
    logger: false,
    socketTimeout: 60_000,
  });
}

export async function smtpTransport(k: Pick<MailKonto, "smtp_host" | "smtp_port" | "benutzername" | "adresse">, passwort: string) {
  if (!k.smtp_host) throw new Error("Kein SMTP-Server angegeben.");
  const port = k.smtp_port || 465;
  const ip = await sichererServer(k.smtp_host, port, SMTP_PORTS);
  return nodemailer.createTransport({
    host: ip,
    port,
    secure: port === 465,
    // 587: ohne STARTTLS keine Anmeldung, nie im Klartext.
    requireTLS: port !== 465,
    tls: { servername: k.smtp_host },
    auth: { user: k.benutzername || k.adresse, pass: passwort },
    connectionTimeout: 30_000,
  });
}

/** Meldet sich am Server an und gleich wieder ab. Wirft mit verständlichem Text. */
export async function anmeldungPruefen(
  k: Pick<MailKonto, "imap_host" | "imap_port" | "smtp_host" | "smtp_port" | "benutzername" | "adresse">,
  passwort: string,
): Promise<void> {
  let imap;
  try {
    imap = await imapClient(k, passwort);
    await imap.connect();
  } catch (e) {
    throw new Error(`Anmeldung am Posteingang (IMAP) fehlgeschlagen: ${fehlerText(e)}`);
  }
  await imap.logout().catch(() => {});
  if (k.smtp_host) {
    try {
      await (await smtpTransport(k, passwort)).verify();
    } catch (e) {
      throw new Error(`Anmeldung am Postausgang (SMTP) fehlgeschlagen: ${fehlerText(e)}`);
    }
  }
}

export function fehlerText(e: unknown): string {
  // deno-lint-ignore no-explicit-any
  const f = e as any;
  if (f?.authenticationFailed || /auth/i.test(String(f?.responseText ?? ""))) {
    return "Benutzername oder Passwort stimmt nicht. Viele Anbieter verlangen ein App-Passwort.";
  }
  if (f?.code === "ENOTFOUND" || /getaddrinfo|dns/i.test(String(f?.message))) return "Server nicht gefunden.";
  if (f?.code === "ETIMEDOUT" || /timeout/i.test(String(f?.message))) return "Server antwortet nicht.";
  return String(f?.responseText || f?.message || f || "Unbekannter Fehler").slice(0, 300);
}

/** Posteingang und Gesendet; Gesendet über die Sonderkennung, sonst der übliche Name. */
async function ordnerFinden(client: InstanceType<typeof ImapFlow>) {
  const liste = await client.list();
  // deno-lint-ignore no-explicit-any
  const sonder = (kennung: string) => liste.find((o: any) => o.specialUse === kennung)?.path as string | undefined;
  // deno-lint-ignore no-explicit-any
  const name = (re: RegExp) => liste.find((o: any) => re.test(o.path))?.path as string | undefined;
  return {
    eingang: "INBOX",
    gesendet: sonder("\\Sent") ?? name(/^(sent|gesendet|sent items|gesendete (objekte|elemente))$/i),
    papierkorb: sonder("\\Trash") ?? name(/^(trash|papierkorb|deleted items|gelöschte (objekte|elemente))$/i),
    archiv: sonder("\\Archive") ?? name(/^(archive|archiv)$/i),
  };
}

export interface AbholErgebnis {
  neu: number;
  gelesenNachgezogen: number;
}

/** Holt neue Mails aus Posteingang und Gesendet, ordnet sie Kontakten zu und zieht Gelesen-Status nach. */
export async function kontoAbholen(admin: Admin, konto: MailKonto): Promise<AbholErgebnis> {
  const passwort = await passwortLesen(admin, konto.id);
  const client = await imapClient(konto, passwort);
  const ergebnis: AbholErgebnis = { neu: 0, gelesenNachgezogen: 0 };
  const stand = { ...(konto.ordner_stand ?? {}) };
  try {
    await client.connect();
    const o = await ordnerFinden(client);
    const plan: [string | undefined, "posteingang" | "gesendet"][] = [[o.eingang, "posteingang"], [o.gesendet, "gesendet"]];
    for (const [pfad, ordner] of plan) {
      if (!pfad) continue;
      const lock = await client.getMailboxLock(pfad);
      try {
        // deno-lint-ignore no-explicit-any
        const mb = client.mailbox as any;
        const validity = Number(mb.uidValidity);
        const naechste = Number(mb.uidNext);
        const alt = stand[pfad];
        if (alt && alt.validity !== validity) {
          // Der Server hat die Nummern neu vergeben: Alte Nummern gelten nicht
          // mehr. Die Zeilen bleiben als Verlauf, Aktionen im Postfach gehen
          // für sie nicht mehr; per Message-ID bekommen sie ihre neue Nummer.
          await admin.from("emails").update({ imap_uid: null }).eq("konto_id", konto.id).eq("imap_ordner", pfad);
        }
        let start = alt && alt.validity === validity ? alt.uid + 1 : Math.max(1, naechste - ERSTER_LAUF);
        if (start < naechste && mb.exists > 0) {
          const ende = Math.min(naechste - 1, start + JE_LAUF - 1);
          for await (const msg of client.fetch(`${start}:${ende}`, { uid: true, flags: true, envelope: true, source: { maxLength: MAX_QUELLE } }, { uid: true })) {
            if (msg.uid < start) continue;
            const zeile = await mailZeile(admin, konto, pfad, ordner, msg);
            // Schon bekannt, nur ohne gültige Nummer (nach neuer Nummerierung)?
            if (zeile.message_id) {
              const { data: bekannt } = await admin.from("emails").select("id").eq("konto_id", konto.id)
                .eq("imap_ordner", pfad).eq("message_id", zeile.message_id).is("imap_uid", null).limit(1).maybeSingle();
              if (bekannt) {
                await admin.from("emails").update({ imap_uid: msg.uid }).eq("id", bekannt.id);
                continue;
              }
            }
            const { error } = await admin.from("emails").upsert(zeile, { onConflict: "konto_id,imap_ordner,imap_uid", ignoreDuplicates: true });
            if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
            ergebnis.neu++;
          }
          start = ende + 1;
          stand[pfad] = { validity, uid: ende };
        } else {
          stand[pfad] = { validity, uid: Math.max(alt?.validity === validity ? alt.uid : 0, naechste - 1) };
        }
        ergebnis.gelesenNachgezogen += await gelesenNachziehen(admin, client, konto, pfad);
      } finally {
        lock.release();
      }
    }
    await admin.from("email_konten").update({ ordner_stand: stand, zuletzt_abgeholt: new Date().toISOString(), letzter_fehler: null }).eq("id", konto.id);
  } catch (e) {
    await admin.from("email_konten").update({ letzter_fehler: fehlerText(e), ordner_stand: stand }).eq("id", konto.id);
    throw e;
  } finally {
    await client.logout().catch(() => {});
  }
  return ergebnis;
}

// deno-lint-ignore no-explicit-any
async function mailZeile(admin: Admin, konto: MailKonto, pfad: string, ordner: string, msg: any) {
  const env = msg.envelope ?? {};
  // deno-lint-ignore no-explicit-any
  const adressen = (liste: any[] | undefined) => (liste ?? []).map((a) => klein(a.address)).filter(Boolean);
  const von = env.from?.[0] ?? {};
  const empfaenger = [...adressen(env.to), ...adressen(env.cc)];
  let text = "";
  try {
    const p = await simpleParser(msg.source);
    text = (p.text ?? (typeof p.html === "string" ? p.html.replace(/<[^>]+>/g, " ") : "")).trim();
  } catch {
    // Unlesbarer Inhalt: Kopfdaten reichen, der Text bleibt leer.
  }
  const eigene = klein(konto.adresse);
  const gegenseite = ordner === "gesendet" ? empfaenger : [klein(von.address)];
  const { data: kontaktId } = await admin.rpc("email_kontakt_finden", {
    _benutzer: konto.benutzer_id,
    _adressen: gegenseite.filter((a) => a && a !== eigene),
  });
  return {
    benutzer_id: konto.benutzer_id,
    konto_id: konto.id,
    kontakt_id: kontaktId ?? null,
    ordner,
    imap_ordner: pfad,
    imap_uid: msg.uid,
    message_id: env.messageId ?? null,
    absender_name: von.name || null,
    absender_email: klein(von.address) || null,
    empfaenger,
    betreff: env.subject || "(kein Betreff)",
    vorschau: text.replace(/\s+/g, " ").slice(0, 200),
    inhalt: text.slice(0, MAX_TEXT),
    gelesen: ordner === "gesendet" || msg.flags?.has?.("\\Seen") === true,
    empfangen_am: (env.date ? new Date(env.date) : new Date()).toISOString(),
  };
}

/** Am Handy gelesen gilt auch im CRM als gelesen. */
// deno-lint-ignore no-explicit-any
async function gelesenNachziehen(admin: Admin, client: any, konto: MailKonto, pfad: string): Promise<number> {
  const { data: offen } = await admin
    .from("emails")
    .select("id, imap_uid")
    .eq("konto_id", konto.id)
    .eq("imap_ordner", pfad)
    .eq("gelesen", false)
    .not("imap_uid", "is", null)
    .limit(500);
  if (!offen?.length) return 0;
  const gelesen: string[] = [];
  const nachUid = new Map<number, string>(offen.map((z: { id: string; imap_uid: number }) => [Number(z.imap_uid), z.id]));
  for await (const msg of client.fetch([...nachUid.keys()].join(","), { uid: true, flags: true }, { uid: true })) {
    if (msg.flags?.has?.("\\Seen")) gelesen.push(nachUid.get(msg.uid)!);
  }
  if (gelesen.length) await admin.from("emails").update({ gelesen: true }).in("id", gelesen);
  return gelesen.length;
}

/** Eine Aktion auf Mails eines Kontos im echten Postfach ausführen. */
export async function imapArbeiten<T>(admin: Admin, konto: MailKonto, arbeit: (client: InstanceType<typeof ImapFlow>, ordner: Awaited<ReturnType<typeof ordnerFinden>>) => Promise<T>): Promise<T> {
  const client = await imapClient(konto, await passwortLesen(admin, konto.id));
  await client.connect();
  try {
    return await arbeit(client, await ordnerFinden(client));
  } finally {
    await client.logout().catch(() => {});
  }
}

export interface Ausgang {
  an: string[];
  cc?: string[];
  betreff: string;
  text: string;
  html?: string;
  antwortAufMessageId?: string | null;
}

/**
 * Öffnet einen Ordner und prüft, ob seine Nummerierung noch die beim Abholen
 * gemerkte ist. Sonst könnte eine gespeicherte Nummer eine andere Mail treffen.
 */
// deno-lint-ignore no-explicit-any
export async function ordnerSperren(client: any, konto: MailKonto, pfad: string) {
  const lock = await client.getMailboxLock(pfad);
  const gemerkt = konto.ordner_stand?.[pfad]?.validity;
  if (gemerkt !== undefined && Number(client.mailbox.uidValidity) !== gemerkt) {
    lock.release();
    throw new Error("Das Postfach wurde neu nummeriert. Bitte einmal abholen und dann erneut versuchen.");
  }
  return lock;
}

/** Sendet über SMTP und legt die Mail in „Gesendet“ ab, sofern der Anbieter das nicht selbst tut. */
/** Gibt einen Hinweis zurück, wenn gesendet, aber nicht in „Gesendet“ abgelegt wurde. */
export async function senden(admin: Admin, konto: MailKonto, mail: Ausgang): Promise<string | null> {
  const passwort = await passwortLesen(admin, konto.id);
  const nachricht = {
    from: konto.anzeigename ? { name: konto.anzeigename, address: konto.adresse } : konto.adresse,
    to: mail.an,
    cc: mail.cc?.length ? mail.cc : undefined,
    subject: mail.betreff,
    text: mail.text,
    html: mail.html,
    ...(mail.antwortAufMessageId ? { inReplyTo: mail.antwortAufMessageId, references: mail.antwortAufMessageId } : {}),
  };
  await (await smtpTransport(konto, passwort)).sendMail(nachricht);
  // Ab hier ist die Mail beim Empfänger. Fehler danach dürfen nicht als
  // „nicht gesendet“ erscheinen, sonst schickt man sie ein zweites Mal.
  // Gmail legt gesendete Mails selbst ab; sonst gäbe es sie doppelt.
  if (/gmail|googlemail/i.test(konto.smtp_host ?? "")) return null;
  try {
    const roh: Uint8Array = await new MailComposer(nachricht).compile().build();
    await imapArbeiten(admin, konto, async (client, o) => {
      if (o.gesendet) await client.append(o.gesendet, roh, ["\\Seen"]);
    });
    return null;
  } catch (e) {
    return `Gesendet, aber nicht im Ordner „Gesendet“ abgelegt: ${fehlerText(e)}`;
  }
}
