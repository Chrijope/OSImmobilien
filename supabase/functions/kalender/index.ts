/**
 * Kalender für angemeldete Nutzer (01.11.2026).
 *
 *  {aktion: "caldav-verbinden", server_url?, benutzername, passwort}
 *  {aktion: "abo-verbinden", url, name?}
 *  {aktion: "oauth-start", art: "google" | "microsoft", herkunft}
 *  {aktion: "oauth-status"}                      welche Anmeldungen eingerichtet sind
 *  {aktion: "schreibziel", id}
 *  {aktion: "termine", von, bis}                 alle verbundenen Kalender zusammen
 *  {aktion: "anlegen", titel, beschreibung?, ort?, start, dauerMinuten?}
 *  {aktion: "aendern" | "loeschen", typ?, verbindungId?, eventId, ...}
 *  {aktion: "feed-link"}                         neuer Abo-Link für die CRM-Termine
 */
import { antwort, corsHeaders, dienst, nutzerAus } from "../_shared/mail-anfrage.ts";
import {
  caldavEntdecken, OAUTH, oauthEingerichtet, oauthRueckweg, sicheresFetch, terminAendern, terminAnlegen,
  termineAusIcs, termineLesen, terminLoeschen, VERBINDUNG_SPALTEN, type TerminDaten, type Verbindung,
} from "../_shared/kalender.ts";
import { statusSignieren } from "../_shared/kalender-status.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

async function verbindungen(admin: Admin, nutzerId: string): Promise<Verbindung[]> {
  const { data } = await admin.from("kalender_verbindungen").select(VERBINDUNG_SPALTEN).eq("benutzer_id", nutzerId).order("erstellt_am");
  return (data ?? []) as Verbindung[];
}

/** Die Verbindung zu einem gespeicherten Eintrag; alte Einträge kennen nur „google“ oder „apple“. */
function zuEintrag(liste: Verbindung[], b: { verbindungId?: string; typ?: string }): Verbindung | undefined {
  if (b.verbindungId) return liste.find((v) => v.id === b.verbindungId);
  const art = b.typ === "apple" ? "caldav" : b.typ;
  return liste.find((v) => v.art === art && v.schreibziel) ?? liste.find((v) => v.art === art);
}

function termin(b: Record<string, unknown>): TerminDaten {
  const start = String(b.start ?? "");
  if (Number.isNaN(new Date(start).getTime())) throw new Error("Ungültiger Beginn.");
  return {
    titel: String(b.titel ?? "Termin").slice(0, 300),
    beschreibung: typeof b.beschreibung === "string" ? b.beschreibung.slice(0, 5000) : undefined,
    ort: typeof b.ort === "string" ? b.ort.slice(0, 300) : undefined,
    start,
    dauerMinuten: Math.min(24 * 60, Math.max(5, Number(b.dauerMinuten) || 60)),
  };
}

async function fehlerMerken(admin: Admin, id: string, fehler: string | null) {
  await admin.from("kalender_verbindungen").update({ letzter_fehler: fehler }).eq("id", id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const nutzer = await nutzerAus(req);
  if (!nutzer) return antwort({ error: "Nicht angemeldet" }, 401);
  const b = await req.json().catch(() => ({}));
  const admin = dienst();

  try {
    switch (b?.aktion) {
      case "oauth-status":
        return antwort({ google: oauthEingerichtet("google"), microsoft: oauthEingerichtet("microsoft") });

      case "oauth-start": {
        const art = b.art === "microsoft" ? "microsoft" : "google";
        if (!oauthEingerichtet(art)) return antwort({ error: "Diese Anmeldung ist noch nicht eingerichtet." }, 409);
        const herkunft = String(b.herkunft ?? "");
        if (!/^https?:\/\/[^/]+$/.test(herkunft)) return antwort({ error: "Ungültige Herkunft" }, 400);
        const o = OAUTH[art];
        const q = new URLSearchParams({
          client_id: o.id(), redirect_uri: oauthRueckweg(), response_type: "code", scope: o.scope.kalender,
          state: await statusSignieren({ u: nutzer.id, a: art, z: "kalender", o: herkunft }),
          ...(art === "google" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { prompt: "select_account" }),
        });
        return antwort({ url: `${o.auth}?${q}` });
      }

      case "caldav-verbinden": {
        const server = String(b.server_url || "https://caldav.icloud.com").trim();
        const benutzer = String(b.benutzername ?? "").trim();
        const passwort = String(b.passwort ?? "");
        if (!benutzer || !passwort) return antwort({ error: "Bitte Benutzername und Passwort angeben." }, 400);
        const { kalender, serverUrl } = await caldavEntdecken(server, benutzer, passwort);
        const { data: v, error } = await admin.from("kalender_verbindungen")
          .upsert({ benutzer_id: nutzer.id, art: "caldav", konto: benutzer, server_url: serverUrl, benutzername: benutzer, kalender, letzter_fehler: null }, { onConflict: "benutzer_id,art,konto" })
          .select("id").single();
        if (error) throw new Error(error.message);
        await admin.rpc("kalender_geheimnis_setzen", { _verbindung: v.id, _wert: JSON.stringify({ passwort }) });
        // Der erste schreibbare Kalender wird Ziel für neue CRM-Termine.
        if (!(await verbindungen(admin, nutzer.id)).some((x) => x.schreibziel)) {
          await admin.from("kalender_verbindungen").update({ schreibziel: true }).eq("id", v.id);
        }
        return antwort({ ok: true, id: v.id, kalender: kalender.length });
      }

      case "abo-verbinden": {
        const url = String(b.url ?? "").trim();
        const r = await sicheresFetch(url);
        const text = r.ok ? await r.text() : "";
        if (!text.includes("BEGIN:VCALENDAR")) return antwort({ error: "Unter diesem Link liegt kein Kalender (.ics)." }, 422);
        const name = String(b.name ?? "").trim() || new URL(url.replace(/^webcal:/, "https:")).hostname;
        const anzahl = termineAusIcs(text, { id: "probe", art: "abo" }, new Date(Date.now() - 30 * 864e5), new Date(Date.now() + 365 * 864e5)).length;
        const { data: v, error } = await admin.from("kalender_verbindungen")
          .upsert({ benutzer_id: nutzer.id, art: "abo", konto: name.slice(0, 100), kalender: [], letzter_fehler: null }, { onConflict: "benutzer_id,art,konto" })
          .select("id").single();
        if (error) throw new Error(error.message);
        // Private Abo-Links enthalten oft eine geheime Kennung, deshalb in den Tresor.
        await admin.rpc("kalender_geheimnis_setzen", { _verbindung: v.id, _wert: JSON.stringify({ url }) });
        return antwort({ ok: true, id: v.id, termine: anzahl });
      }

      case "schreibziel": {
        const liste = await verbindungen(admin, nutzer.id);
        const ziel = liste.find((v) => v.id === b.id);
        if (b.id && (!ziel || ziel.art === "abo")) return antwort({ error: "In diesen Kalender kann nicht geschrieben werden." }, 400);
        await admin.from("kalender_verbindungen").update({ schreibziel: false }).eq("benutzer_id", nutzer.id).eq("schreibziel", true);
        if (ziel) await admin.from("kalender_verbindungen").update({ schreibziel: true }).eq("id", ziel.id);
        return antwort({ ok: true });
      }

      case "termine": {
        const von = new Date(b.von), bis = new Date(b.bis);
        if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) || bis.getTime() - von.getTime() > 400 * 864e5) {
          return antwort({ error: "Ungültiger Zeitraum" }, 400);
        }
        const liste = await verbindungen(admin, nutzer.id);
        const ergebnisse = await Promise.allSettled(liste.map((v) => termineLesen(admin, v, von, bis)));
        const termine = [];
        const fehler: { verbindungId: string; konto: string; fehler: string }[] = [];
        for (let i = 0; i < liste.length; i++) {
          const r = ergebnisse[i];
          if (r.status === "fulfilled") {
            termine.push(...r.value);
            await fehlerMerken(admin, liste[i].id, null);
          } else {
            const text = String((r.reason as Error)?.message ?? r.reason).slice(0, 300);
            fehler.push({ verbindungId: liste[i].id, konto: liste[i].konto, fehler: text });
            await fehlerMerken(admin, liste[i].id, text);
          }
        }
        return antwort({ termine, fehler });
      }

      case "anlegen": {
        const ziel = (await verbindungen(admin, nutzer.id)).find((v) => v.schreibziel);
        if (!ziel) return antwort({ eventId: null });
        const eventId = await terminAnlegen(admin, ziel, termin(b));
        return antwort({ ok: true, eventId, verbindungId: ziel.id, typ: ziel.art });
      }

      case "aendern":
      case "loeschen": {
        const v = zuEintrag(await verbindungen(admin, nutzer.id), b);
        if (!v || !b.eventId) return antwort({ error: "Kalender zu diesem Termin nicht gefunden." }, 404);
        if (b.aktion === "aendern") await terminAendern(admin, v, String(b.eventId), termin(b));
        else await terminLoeschen(admin, v, String(b.eventId));
        return antwort({ ok: true });
      }

      case "feed-link": {
        const kennung = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kennung))))
          .map((x) => x.toString(16).padStart(2, "0")).join("");
        const { error } = await admin.from("kalender_feed").upsert({ benutzer_id: nutzer.id, kennung_hash: hash, erstellt_am: new Date().toISOString() });
        if (error) throw new Error(error.message);
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/kalender-feed?k=${kennung}`;
        return antwort({ url, webcal: url.replace(/^https:/, "webcal:") });
      }

      default:
        return antwort({ error: "Unbekannte Aktion" }, 400);
    }
  } catch (e) {
    return antwort({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 502);
  }
});
