/**
 * Aktionen auf Mails, im CRM und im echten Postfach zugleich (01.11.2026).
 *
 *  {aktion: "gelesen", ids, wert}            \Seen setzen oder entfernen
 *  {aktion: "verschieben", ids, ziel}        posteingang | archiviert | papierkorb
 *  {aktion: "loeschen", ids}                 endgültig, auch auf dem Server
 *  {aktion: "inhalt", id}                    Text nachladen, falls er fehlt
 *  {aktion: "senden", kontoId, an, cc?, betreff, text, html?, antwortAuf?}
 *
 * Nur eigene Mails und Konten. Mails ohne Konto (aus dem alten Abholen)
 * werden nur im CRM geändert.
 */
import { simpleParser } from "npm:mailparser@3.7.2";
import { antwort, corsHeaders, dienst, nutzerAus } from "../_shared/mail-anfrage.ts";
import { fehlerText, imapArbeiten, KONTO_SPALTEN, kontoAbholen, klein, ordnerSperren, senden, type MailKonto } from "../_shared/mailkonto.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

interface MailZeile {
  id: string;
  konto_id: string | null;
  imap_ordner: string | null;
  imap_uid: number | null;
  ordner: string;
  message_id: string | null;
}

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function eigeneMails(admin: Admin, nutzerId: string, ids: unknown): Promise<MailZeile[]> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) throw new Error("Keine gültige Auswahl.");
  const { data, error } = await admin
    .from("emails")
    .select("id, konto_id, imap_ordner, imap_uid, ordner, message_id")
    .eq("benutzer_id", nutzerId)
    .in("id", ids.map(String));
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function konto(admin: Admin, nutzerId: string, id: string): Promise<MailKonto> {
  const { data } = await admin.from("email_konten").select(KONTO_SPALTEN).eq("id", id).eq("benutzer_id", nutzerId).maybeSingle();
  if (!data) throw new Error("Konto nicht gefunden.");
  return data as MailKonto;
}

/** Je Konto und Ordner die UIDs, damit jeder Server nur einmal besucht wird. */
function gruppieren(mails: MailZeile[]) {
  const gruppen = new Map<string, Map<string, MailZeile[]>>();
  for (const m of mails) {
    if (!m.konto_id || !m.imap_ordner || m.imap_uid == null) continue;
    const k = gruppen.get(m.konto_id) ?? new Map();
    k.set(m.imap_ordner, [...(k.get(m.imap_ordner) ?? []), m]);
    gruppen.set(m.konto_id, k);
  }
  return gruppen;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const nutzer = await nutzerAus(req);
  if (!nutzer) return antwort({ error: "Nicht angemeldet" }, 401);
  const b = await req.json().catch(() => ({}));
  const admin = dienst();

  try {
    switch (b?.aktion) {
      case "gelesen": {
        const mails = await eigeneMails(admin, nutzer.id, b.ids);
        const wert = b.wert !== false;
        for (const [kontoId, ordner] of gruppieren(mails)) {
          const k = await konto(admin, nutzer.id, kontoId);
          await imapArbeiten(admin, k, async (client) => {
            for (const [pfad, liste] of ordner) {
              const lock = await ordnerSperren(client, k, pfad);
              try {
                const uids = liste.map((m) => m.imap_uid).join(",");
                if (wert) await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
                else await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
              } finally {
                lock.release();
              }
            }
          });
        }
        await admin.from("emails").update({ gelesen: wert }).in("id", mails.map((m) => m.id));
        return antwort({ ok: true });
      }

      case "verschieben": {
        const ziel = b.ziel as "posteingang" | "archiviert" | "papierkorb";
        if (!["posteingang", "archiviert", "papierkorb"].includes(ziel)) return antwort({ error: "Unbekanntes Ziel" }, 400);
        const mails = await eigeneMails(admin, nutzer.id, b.ids);
        for (const [kontoId, ordner] of gruppieren(mails)) {
          const k = await konto(admin, nutzer.id, kontoId);
          await imapArbeiten(admin, k, async (client, o) => {
            const zielPfad = ziel === "posteingang" ? o.eingang : ziel === "archiviert" ? o.archiv : o.papierkorb;
            if (!zielPfad) throw new Error(ziel === "archiviert" ? "Dieses Postfach hat keinen Archivordner." : "Dieses Postfach hat keinen Papierkorb.");
            for (const [pfad, liste] of ordner) {
              if (pfad === zielPfad) continue;
              const lock = await ordnerSperren(client, k, pfad);
              let karte: Map<number, number> | undefined;
              try {
                const ergebnis = await client.messageMove(liste.map((m) => m.imap_uid).join(","), zielPfad, { uid: true });
                karte = ergebnis && ergebnis.uidMap;
              } finally {
                lock.release();
              }
              // Neue Nummern im Zielordner übernehmen, sonst finden spätere
              // Aktionen die Mail nicht. Meldet der Server keine (ohne
              // UIDPLUS), wird über die Message-ID gesucht.
              for (const m of liste) {
                let neu = karte?.get(Number(m.imap_uid));
                if (neu === undefined && m.message_id) {
                  const zielLock = await client.getMailboxLock(zielPfad);
                  try {
                    const treffer = await client.search({ header: { "message-id": m.message_id } }, { uid: true });
                    neu = Array.isArray(treffer) && treffer.length ? Math.max(...treffer) : undefined;
                  } finally {
                    zielLock.release();
                  }
                }
                await admin.from("emails").update({ ordner: ziel, imap_ordner: zielPfad, imap_uid: neu ?? null }).eq("id", m.id);
              }
            }
          });
        }
        await admin.from("emails").update({ ordner: ziel }).in("id", mails.map((m) => m.id));
        return antwort({ ok: true });
      }

      case "loeschen": {
        const mails = await eigeneMails(admin, nutzer.id, b.ids);
        for (const [kontoId, ordner] of gruppieren(mails)) {
          const k = await konto(admin, nutzer.id, kontoId);
          await imapArbeiten(admin, k, async (client) => {
            for (const [pfad, liste] of ordner) {
              const lock = await ordnerSperren(client, k, pfad);
              try {
                await client.messageDelete(liste.map((m) => m.imap_uid).join(","), { uid: true });
              } finally {
                lock.release();
              }
            }
          });
        }
        await admin.from("emails").delete().in("id", mails.map((m) => m.id));
        return antwort({ ok: true });
      }

      case "inhalt": {
        const [mail] = await eigeneMails(admin, nutzer.id, [b.id]);
        if (!mail) return antwort({ error: "Mail nicht gefunden." }, 404);
        const { data: vorhanden } = await admin.from("emails").select("inhalt").eq("id", mail.id).single();
        if (vorhanden?.inhalt) return antwort({ inhalt: vorhanden.inhalt });
        if (!mail.konto_id || !mail.imap_ordner || mail.imap_uid == null) return antwort({ inhalt: "" });
        const k = await konto(admin, nutzer.id, mail.konto_id);
        const text = await imapArbeiten(admin, k, async (client) => {
          const lock = await ordnerSperren(client, k, mail.imap_ordner!);
          try {
            const msg = await client.fetchOne(String(mail.imap_uid), { source: { maxLength: 1_000_000 } }, { uid: true });
            if (!msg?.source) return "";
            const p = await simpleParser(msg.source);
            return (p.text ?? "").trim().slice(0, 100_000);
          } finally {
            lock.release();
          }
        });
        await admin.from("emails").update({ inhalt: text }).eq("id", mail.id);
        return antwort({ inhalt: text });
      }

      case "senden": {
        const k = await konto(admin, nutzer.id, String(b.kontoId ?? ""));
        const an = (Array.isArray(b.an) ? b.an : []).map(klein).filter((a: string) => ADRESSE.test(a));
        const cc = (Array.isArray(b.cc) ? b.cc : []).map(klein).filter((a: string) => ADRESSE.test(a));
        if (an.length === 0) return antwort({ error: "Bitte mindestens einen Empfänger angeben." }, 400);
        if (an.length + cc.length > 50) return antwort({ error: "Höchstens 50 Empfänger je Mail." }, 400);
        let antwortAuf: string | null = null;
        if (b.antwortAuf) {
          const [ursprung] = await eigeneMails(admin, nutzer.id, [b.antwortAuf]);
          antwortAuf = ursprung?.message_id ?? null;
        }
        const hinweis = await senden(admin, k, {
          an,
          cc,
          betreff: String(b.betreff ?? "").slice(0, 500) || "(kein Betreff)",
          text: String(b.text ?? ""),
          html: typeof b.html === "string" ? b.html : undefined,
          antwortAufMessageId: antwortAuf,
        });
        // Die gesendete Mail aus „Gesendet“ holen: so steht sie mit UID und Kontakt im CRM.
        await kontoAbholen(admin, k).catch(() => {});
        return antwort({ ok: true, hinweis });
      }

      default:
        return antwort({ error: "Unbekannte Aktion" }, 400);
    }
  } catch (e) {
    return antwort({ error: fehlerText(e) }, 502);
  }
});
