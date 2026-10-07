import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { meldeVertragUnterschrieben } from "../_shared/hr-benachrichtigung.ts";
import { bewerberAnzeigename, bewerberVertragAusloeser } from "../_shared/bewerber-name.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import {
  LEAD_PAKET_RECHNUNG_GLOCKE_TITEL,
  leadPaketGlockeZeile,
  leadPaketRechnungDaten,
} from "../_shared/lead-paket-rechnung-mail.ts";
import { hatLeadPaket, stufeNachVollstaendigemVertrag } from "../_shared/lead-paket.ts";
import {
  GEGENZEICHNUNG_ABGELEHNT,
  personTypZurStufe,
  pruefeBewerberStufe,
  pruefeGegenzeichnung,
  tokenGiltFuerVertrag,
  type VertragsAnfrage,
} from "../_shared/vertrag-gegenzeichnung-zugriff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";
const CHRISTIAN_KURZ_USER_ID = "df8190e9-b5f2-4519-8343-293688ff062d";
const CHRISTIAN_KURZ_EMAIL = "os@os-immobilien.com";
// Nur noch die Adresse: Die Glocken an sein Konto sind entfallen, das
// Bewerbermanagement meldet ausschliesslich an die HR-Rolle. Die Mail zur
// Rechnungsstellung bleibt.
const CHRISTIAN_PEETZ_EMAIL = "os@os-immobilien.com";

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
}

/**
 * 2-Stufen-Workflow:
 *   stage="bewerber" (default): Bewerber hat unterschrieben → Signatur-Anfrage
 *     für Christian Kurz anlegen, E-Mail an os@os-immobilien.com, Status
 *     "wartet_auf_kurz". Es wird noch NICHTS in der Dokumentenakte abgelegt.
 *   stage="kurz": Christian Kurz hat gegengezeichnet → finale PDFs
 *     (vom Client base64-codiert mitgeliefert) in Storage hochladen,
 *     als Dokumente ablegen, Vertrag "unterschrieben", Status "Rechnung"
 *     (mit Lead-Paket) oder "Nutzer_anlegen" (ohne), Bestätigungs-Mail an
 *     den Bewerber, Rechnungsglocke und Rechnungsmail nur mit Lead-Paket.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const bewerberId: string = body.bewerberId;
    const stage: "bewerber" | "kurz" = body.stage === "kurz" ? "kurz" : "bewerber";
    const finalDocuments: Array<{ key: string; name: string; base64: string }> =
      Array.isArray(body.finalDocuments) ? body.finalDocuments : [];
    const kurzSignatureDataUrl: string = body.kurzSignatureDataUrl || "";
    const kurzSignedOrt: string = body.kurzSignedOrt || "Mittenwalde";
    const signatureToken: unknown = body.signatureToken;

    if (!bewerberId) {
      return new Response(JSON.stringify({ error: "bewerberId ist Pflichtfeld" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ─────────────── Nachweis (Audit-Befund F03C vom 15.09.2026) ───────────────
    //
    // Diese Function verlangt keine Anmeldung, denn weder der Bewerber noch die
    // gegenzeichnende Person ist beim Unterschreiben angemeldet. Massgeblich
    // ist deshalb der Token aus dem persoenlichen Unterschriftslink. Bis zum
    // 16.09.2026 wurde er in keiner der beiden Stufen angesehen; die
    // Begruendung und der mögliche Schaden stehen in
    // `_shared/vertrag-gegenzeichnung-zugriff.ts`.
    //
    // Abgelehnt wird neutral: immer derselbe Satz, egal ob der Token fehlt,
    // unbekannt ist, zu einer anderen Bewerbung gehoert, zum falschen Schritt
    // gehoert oder abgelaufen ist. Sonst liesse sich aus den Antworten
    // ablesen, welche Bewerbungen es gibt und wie weit sie sind.
    const nachweisOk = await tokenGiltFuerVertrag(
      supabase as unknown as Parameters<typeof tokenGiltFuerVertrag>[0],
      bewerberId,
      signatureToken,
      personTypZurStufe(stage),
    );
    if (!nachweisOk) {
      return new Response(JSON.stringify({ error: GEGENZEICHNUNG_ABGELEHNT }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: bewerber, error: bewerberError } = await supabase
      .from("bewerbungen")
      .select("id, vorname, nachname, email, telefon, status, meta")
      .eq("id", bewerberId)
      .maybeSingle();
    if (bewerberError) {
      console.error("Failed to load bewerber:", bewerberError);
      return new Response(JSON.stringify({ error: "Bewerber konnte nicht geladen werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!bewerber) {
      return new Response(JSON.stringify({ error: "Bewerber nicht gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currentMeta = (bewerber.meta as Record<string, any>) || {};
    // Name aus den Spalten, nicht aus meta: Dort steht er nie, siehe
    // _shared/bewerber-name.ts. Vorher hiess hier jeder Bewerber "Ein Bewerber".
    const bewerberName = bewerberAnzeigename(bewerber);
    const bewerberEmail: string = bewerber.email || currentMeta.email || "";
    const paketId: string = currentMeta.paketwahl || "";
    // Duplikat der Paketdaten fuer die Mail-Texte dieser Function. Die
    // massgebliche Quelle ist src/lib/lizenzPakete.ts (LIZENZ_PAKETE),
    // Aenderungen dort muessen hier nachgezogen werden. Stand 07.09.2026: Der
    // Vertriebspartner zahlt kein laufendes Entgelt mehr; lead/team_builder/
    // enterprise sind Bestandspakete mit CRM-Systemgebuehr 150 Euro brutto/Monat
    // inkl. USt. und werden nicht mehr neu vergeben.
    const PAKETE: Record<string, { titel: string; preis: number; monatlich: number }> = {
      junior: { titel: "Vertriebspartner", preis: 0, monatlich: 0 },
      lead: { titel: "Lead Partner", preis: 5000, monatlich: 150 },
      team_builder: { titel: "Team Lead", preis: 10000, monatlich: 150 },
      enterprise: { titel: "Lizenzpartner", preis: 25000, monatlich: 150 },
    };
    const paket = PAKETE[paketId];
    const paketTitel = paket?.titel || paketId || "—";

    // ─────────────── STAGE A: Bewerber → Kurz anfragen ───────────────
    if (stage === "bewerber") {
      // Genau die Anfrage dieses Links, nicht irgendeine unterschriebene
      // derselben Bewerbung (Codex-Pruefung 27.09.2026, A4-05): Nur so steht
      // fest, welche Fassung gegengezeichnet wird.
      const { data: sig, error: sigError } = await supabase
        .from("signature_requests").select("*")
        .eq("token", String(signatureToken).trim())
        .eq("kontakt_id", bewerberId).eq("person_type", "vertrag").eq("status", "signed")
        .maybeSingle();
      if (sigError) {
        return new Response(JSON.stringify({ error: "Signaturanfrage konnte nicht geladen werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!sig) {
        return new Response(JSON.stringify({ allSigned: false, reason: "Noch keine Unterschrift" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Nur die aktuelle echte Anfrage aendert Bewerbung und Gegenzeichnung
      // (NB-03). Ein alter Token, ein Testversand oder ein schon
      // gegengezeichneter Vertrag lassen alles, wie es ist.
      const { data: alleVertragsAnfragen, error: alleFehler } = await supabase
        .from("signature_requests").select("id, person_type, status, created_at, signed_at, sa_data")
        .eq("kontakt_id", bewerberId).eq("person_type", "vertrag");
      if (alleFehler) {
        return new Response(JSON.stringify({ error: "Signaturanfrage konnte nicht geladen werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const stufe = pruefeBewerberStufe(
        sig as VertragsAnfrage,
        (alleVertragsAnfragen || []) as VertragsAnfrage[],
        currentMeta.vertragStatus,
      );
      if (stufe === "schon_unterschrieben") {
        return new Response(JSON.stringify({ allSigned: true, stage: "unterschrieben" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (stufe === "testversand") {
        return new Response(JSON.stringify({ allSigned: false, stage: "testversand" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (stufe !== "aktuell") {
        console.warn("Stufe A abgelehnt:", stufe);
        return new Response(JSON.stringify({ error: GEGENZEICHNUNG_ABGELEHNT }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sa = (sig.sa_data as Record<string, any>) || {};
      const documents: { key?: string; name: string }[] = Array.isArray(sa.documents) ? sa.documents : [];
      const signedAt = sig.signed_at || new Date().toISOString();

      // Bewerber-Signatur (PNG-DataURL) aus signature_data extrahieren
      let bewerberSignatureDataUrl = "";
      try {
        const raw = (sig as any).signature_data;
        if (typeof raw === "string") {
          if (raw.startsWith("data:image")) bewerberSignatureDataUrl = raw;
          else if (raw.startsWith("{")) {
            const parsed = JSON.parse(raw);
            bewerberSignatureDataUrl = parsed?.signatures?.[0]?.signatureData || "";
          }
        }
      } catch { /* noop */ }

      // Idempotenz: eine offene Gegenzeichnung zu GENAU dieser Unterschrift
      // wird wiederverwendet. Offene Gegenzeichnungen zu aelteren
      // Unterschriften werden als ueberholt geschlossen, sonst liesse sich
      // ein alter Vertrag neben dem neuen gegenzeichnen.
      const { data: offeneKurz } = await supabase
        .from("signature_requests").select("id, token, sa_data")
        .eq("kontakt_id", bewerberId).eq("person_type", "vertrag_kurz").eq("status", "pending");
      const passend = (offeneKurz || []).find(
        (k: any) => String(k?.sa_data?.bewerberRequestId ?? "") === String(sig.id),
      );
      const fremde = (offeneKurz || []).filter((k: any) => k !== passend).map((k: any) => k.id);
      if (fremde.length) {
        const { error: ueberholtFehler } = await supabase.from("signature_requests")
          .update({ status: "ueberholt" }).in("id", fremde);
        if (ueberholtFehler) {
          console.error("Aeltere Gegenzeichnungen nicht geschlossen:", ueberholtFehler);
          return new Response(JSON.stringify({ error: "Gegenzeichnung konnte nicht vorbereitet werden" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      let kurzToken = passend?.token as string | undefined;
      if (!kurzToken) {
        kurzToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const saData = {
          docType: "vertrag_kurz",
          bewerberId,
          // Welche Unterschrift gegengezeichnet wird (A4-04/A4-05).
          bewerberRequestId: sig.id,
          bewerberName,
          bewerberEmail,
          paketTitel,
          paketId,
          zahlungsweise: currentMeta.zahlungsweise || "einmal",
          documents,
          bewerberData: sa.bewerberData || currentMeta,
          bewerberSignatureDataUrl,
          bewerberSignedAt: signedAt,
          bewerberSignedOrt: currentMeta.ort || "",
        };
        const { error: insErr } = await supabase.from("signature_requests").insert({
          token: kurzToken,
          kontakt_id: bewerberId,
          investment_id: null,
          name: "Christian Kurz",
          email: CHRISTIAN_KURZ_EMAIL,
          person_type: "vertrag_kurz",
          sa_data: saData,
          status: "pending",
          expires_at: expiresAt,
        });
        if (insErr) {
          console.error("Kurz-Anfrage konnte nicht erstellt werden:", insErr);
          return new Response(JSON.stringify({ error: "Kurz-Anfrage konnte nicht erstellt werden" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const signatureUrl = `${SIGNATURE_BASE_URL}?token=${kurzToken}&type=vertrag_kurz`;

      const nextMeta = {
        ...currentMeta,
        vertragStatus: "wartet_auf_kurz",
        vertragBewerberSignedAt: signedAt,
        vertragBewerberSignatureDataUrl: bewerberSignatureDataUrl,
        // Der Token der Gegenzeichnung steht nicht mehr am Bewerber: Die
        // Akte liest auch der Bewerber selbst.
        vertragKurzAnfrageToken: undefined,
        vertragKurzAnfrageAt: new Date().toISOString(),
      };
      await supabase.from("bewerbungen").update({ meta: nextMeta }).eq("id", bewerberId);

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "vertrag-gegenzeichnung-kurz",
            recipientEmail: CHRISTIAN_KURZ_EMAIL,
            idempotencyKey: `vertrag-kurz-${kurzToken}`,
            templateData: {
              bewerberName,
              paketTitel,
              signatureUrl,
              signedAt: new Date(signedAt).toLocaleString("de-DE"),
            },
          },
        });
      } catch (e) { console.error("Kurz-Mail failed:", e); }

      try {
        const rows: any[] = [{
          benutzer_id: CHRISTIAN_KURZ_USER_ID,
          titel: "Vertrag bereit zur Gegenzeichnung",
          nachricht: `${bewerberName} hat den Handelsvertretervertrag unterschrieben. Du hast die Unterschriftsanfrage per E-Mail an ${CHRISTIAN_KURZ_EMAIL} erhalten — bitte gegenzeichnen.`,
          // Deep-Link direkt auf die Signatur-Seite, damit Kurz nicht erst suchen muss.
          // Als Pfad, nicht als volle Adresse: Die Glocke nimmt seit
          // 20260928160000 nur Pfade im CRM an. Die Mail oben behaelt die volle Adresse.
          link: `/signatur?token=${kurzToken}&type=vertrag_kurz`,
        }];
        // Frueher ging hier zusaetzlich eine Glocke an jeden Admin, jeden
        // Inhaber und fest an Christian Peetz. Das ist entfallen: Das
        // Bewerbermanagement fuehrt HR, und HR bekommt die Unterschrift im
        // naechsten Block ohnehin gemeldet, samt Aufgabe. Eine zweite Meldung
        // an Leute, die damit nichts zu tun haben, war nur Laerm.
        await supabase.from("benachrichtigungen").insert(rows);
      } catch (e) { console.error("Notif failed:", e); }

      // ── HR informieren und die Aufgabe anlegen ──
      //
      // Ab der Unterschrift des Bewerbers wartet er auf den Anruf: Das
      // Erstgespraech verspricht ihm ausdruecklich, dass wir uns danach wegen
      // des Onboardings melden. Bisher hing das an der Aufmerksamkeit der
      // Admins. Jetzt bekommt jede HR-Rolle eine Glocke und eine echte
      // Aufgabe in der Inbox, damit der Schritt eine Besitzerin hat.
      //
      // Bewusst schon hier und nicht erst nach der Gegenzeichnung: Die
      // Kontaktaufnahme kann parallel laufen, und der Bewerber wartet ab
      // seiner eigenen Unterschrift.
      try {
        const { data: hrRollen } = await supabase
          .from("user_roles").select("user_id").eq("role", "hr");
        const hrIds = Array.from(new Set((hrRollen || []).map((r: any) => r.user_id as string)));

        if (!hrIds.length) {
          console.warn("Keine HR-Rolle vergeben, es wurde keine Onboarding-Aufgabe angelegt.");
        } else {
          const heute = new Date().toISOString().slice(0, 10);
          const titel = `${bewerberName} hat den Vertrag unterschrieben`;
          const beschreibung =
            `${bewerberName} hat den Handelsvertretervertrag digital unterschrieben. ` +
            `Bitte kontaktieren und den Onboarding-Termin vereinbaren. ` +
            `Im Erstgespraech wurde ausdruecklich zugesagt, dass wir uns nach der Unterschrift melden.`;

          // Der Ausloeser-Schluessel haelt die Aufgabe je Bewerber einmalig:
          // Auf (zugewiesen_an, ausloeser_schluessel) liegt ein eindeutiger
          // Index fuer alles, was noch nicht erledigt ist. Er traegt ausserdem
          // den Bewerberbezug, denn `aufgaben` hat keine Spalte dafuer. Die
          // Inbox liest die Bewerbungs-ID daraus und verlinkt die Akte.
          const aufgaben = hrIds.map((uid) => ({
            benutzer_id: uid,
            zugewiesen_an: uid,
            titel,
            beschreibung,
            prioritaet: "hoch",
            typ: "aufgabe",
            faellig_am: heute,
            ausloeser_schluessel: bewerberVertragAusloeser(bewerberId),
          }));
          const { error: aufgabenFehler } = await supabase.from("aufgaben").insert(aufgaben);
          if (aufgabenFehler) console.error("HR-Aufgabe failed:", aufgabenFehler);

          await supabase.from("benachrichtigungen").insert(
            hrIds.map((uid) => ({
              benutzer_id: uid,
              titel: `${bewerberName} hat den Vertrag unterschrieben`,
              nachricht: `Bitte kontaktieren und das Onboarding vereinbaren. Die Aufgabe dazu liegt in deiner Inbox.`,
              link: "/inbox",
            })),
          );
        }
      } catch (e) { console.error("HR-Benachrichtigung failed:", e); }

      // Dieselbe Meldung zusaetzlich per Mail. Glocke und Aufgabe erreichen nur
      // jemanden, der das CRM offen hat; der Bewerber wartet aber ab jetzt auf
      // den Anruf. Empfaenger ist wieder die Rolle, keine feste Adresse.
      await meldeVertragUnterschrieben(supabase, {
        bewerbungId: bewerberId,
        bewerberName,
        bewerberEmail,
        bewerberTelefon: bewerber.telefon || currentMeta.telefon || "",
        paketTitel,
        signedAt,
        naechsterSchritt:
          "Bitte kontaktieren und den Onboarding-Termin vereinbaren. Die Aufgabe dazu liegt in der Inbox. " +
          "Christian Kurz wurde parallel zur Gegenzeichnung aufgefordert.",
      });

      // Queue sofort abarbeiten, damit die Mail an Kurz nicht bis zu 5s
      // auf den pg_cron-Tick warten muss.
      try {
        await supabase.functions.invoke("process-email-queue", { body: {} });
      } catch (e) { console.error("process-email-queue kick failed:", e); }

      return new Response(
        // Ohne signatureUrl: Der Link der Gegenzeichnung geht nur per Mail und
        // Glocke an den Gegenzeichner. In dieser Antwort landete er beim
        // Bewerber, der damit selbst gegenzeichnen konnte (A4-04).
        JSON.stringify({ allSigned: false, stage: "awaiting_kurz", signedAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─────────────── STAGE B: Kurz hat gegengezeichnet ───────────────
    const { data: kurzAnfrage } = await supabase
      .from("signature_requests").select("id, person_type, status, created_at, signed_at, sa_data")
      .eq("token", String(signatureToken).trim()).maybeSingle();
    const { data: vertragsAnfragen, error: anfragenFehler } = await supabase
      .from("signature_requests").select("id, person_type, status, created_at, signed_at, sa_data")
      .eq("kontakt_id", bewerberId).eq("person_type", "vertrag");
    if (!kurzAnfrage || anfragenFehler) {
      return new Response(JSON.stringify({ error: GEGENZEICHNUNG_ABGELEHNT }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const befund = pruefeGegenzeichnung(
      kurzAnfrage as VertragsAnfrage,
      (vertragsAnfragen || []) as VertragsAnfrage[],
    );
    if (!befund.ok) {
      console.warn("Gegenzeichnung abgelehnt:", befund.grund);
      const text = befund.grund === "ueberholt"
        ? "Dieser Vertrag ist ueberholt, es gibt eine neuere Fassung. Bitte die aktuelle Anfrage gegenzeichnen."
        : GEGENZEICHNUNG_ABGELEHNT;
      return new Response(JSON.stringify({ error: text }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!finalDocuments.length) {
      return new Response(JSON.stringify({ error: "finalDocuments fehlt (base64 PDFs erwartet)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const signedAt = new Date().toISOString();
    const stamp = signedAt.replace(/[:.]/g, "-");
    const uploadedDocs: Array<{ key: string; name: string; url: string }> = [];

    for (const fd of finalDocuments) {
      try {
        const bytes = base64ToUint8(fd.base64);
        const path = `vertrag/${bewerberId}/final-${safeName(fd.key)}-${stamp}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("bewerbungen")
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("bewerbungen")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        uploadedDocs.push({ key: fd.key, name: fd.name, url: signed?.signedUrl || path });
      } catch (e) {
        console.error(`Upload final PDF ${fd.key} failed:`, e);
      }
    }

    if (!uploadedDocs.length) {
      return new Response(JSON.stringify({ error: "Keine finalen PDFs konnten gespeichert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const hauptUrl = uploadedDocs.find((d) => d.key === "vertrag")?.url || uploadedDocs[0].url;

    const existingDokumente: any[] = Array.isArray(currentMeta.dokumente) ? currentMeta.dokumente : [];
    const newEntries = uploadedDocs.map((d) => ({
      id: crypto.randomUUID(),
      name: `${d.name} (unterschrieben).pdf`,
      typ: d.key === "vertrag" ? "Vertrag" : "Anlage",
      status: "freigegeben",
      datum: signedAt,
      url: d.url,
    }));
    const filteredExisting = existingDokumente.filter(
      (e) => !newEntries.some((n) => n.name === e.name),
    );

    // Zuerst die Gegenzeichnung bedingt schliessen (NB-04): Nur wer genau
    // diese noch offene Anfrage schliesst, schreibt danach die Bewerbung.
    // Zwei gleichzeitige Laeufe koennen so nicht beide abschliessen.
    const kurzId = (kurzAnfrage as VertragsAnfrage).id;
    const { data: geschlossen, error: schliessFehler } = await supabase.from("signature_requests")
      .update({ status: "signed", signed_at: signedAt, signature_data: kurzSignatureDataUrl || null })
      .eq("id", kurzId).eq("status", "pending")
      .select("id");
    if (schliessFehler) {
      console.error("Gegenzeichnung konnte nicht geschlossen werden:", schliessFehler);
      return new Response(JSON.stringify({ error: "Gegenzeichnung konnte nicht gespeichert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((geschlossen || []).length !== 1) {
      return new Response(JSON.stringify({ error: GEGENZEICHNUNG_ABGELEHNT }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nextMeta = {
      ...currentMeta,
      // Die unterschriebene Fassung kommt aus der Anfrage, die unterschrieben
      // wurde, nicht aus dem Entwurf am Bewerber (A4-05). Die Pixel-Freigabe
      // (Anlage 4) liest `vertragUnterschrieben`.
      vertragFassung: befund.fassung,
      vertragUnterschrieben: {
        fassung: befund.fassung,
        quelle: "digital",
        requestId: befund.bewerberAnfrage.id,
        gegenzeichnungRequestId: (kurzAnfrage as VertragsAnfrage).id,
        bewerberAm: befund.bewerberAnfrage.signed_at || currentMeta.vertragBewerberSignedAt || "",
        gegenzeichnungAm: signedAt,
      },
      vertragKurzAnfrageToken: undefined,
      vertragStatus: "unterschrieben",
      vertragSignedAt: signedAt,
      vertragSignedPdfUrl: hauptUrl,
      vertragKurzSignedAt: signedAt,
      vertragKurzSignatureDataUrl: kurzSignatureDataUrl || currentMeta.vertragKurzSignatureDataUrl || "",
      vertragKurzSignedOrt: kurzSignedOrt,
      dokumente: [...filteredExisting, ...newEntries],
    };
    /*
     * Die Stufe nach der Gegenzeichnung haengt am Lead-Paket.
     *
     * Bis zum 19.09.2026 sprang JEDER Bewerber hier auf "Rechnung", auch wer
     * gar nichts zu zahlen hatte. Vom 19. bis 23.09.2026 blieb, wer kein
     * Lead-Paket hatte, in "Vertrag" liegen, bis der Onboarding-Termin stand.
     *
     * Seit dem 23.09.2026 (Christian): Mit Lead-Paket geht es nach
     * "Rechnung", weil dort wirklich Geld offen ist, und erst die bestaetigte
     * Zahlung schiebt weiter. Ohne Lead-Paket geht es direkt nach
     * "Nutzer_anlegen", die Stufe "Rechnung" entfaellt. Nur nach vorn: Wer
     * schon weiter ist oder ausgeschieden, bleibt stehen. Regel und Statusweg
     * stehen in _shared/lead-paket.ts, der VertragsTab liest dieselben.
     */
    const mitLeadPaket = hatLeadPaket(currentMeta.leadPaket);
    const neueStufe = stufeNachVollstaendigemVertrag(currentMeta.leadPaket, bewerber.status);

    const { error: bewerbungFehler } = await supabase
      .from("bewerbungen")
      .update(neueStufe ? { meta: nextMeta, status: neueStufe } : { meta: nextMeta })
      .eq("id", bewerberId);
    if (bewerbungFehler) {
      console.error("Bewerbung nach Gegenzeichnung nicht gespeichert:", bewerbungFehler);
      // Die Anfrage wieder oeffnen, damit sich die Gegenzeichnung wiederholen
      // laesst.
      // ponytail: keine echte Transaktion ueber zwei Tabellen; faellt die
      // Function genau zwischen Schliessen und diesem Zuruecksetzen aus, bleibt
      // die Anfrage geschlossen und die Bewerbung ungespeichert. Dann HR neu
      // versenden lassen. Abhilfe waere eine RPC, die beides in einer
      // Transaktion schreibt.
      const { error: zurueckFehler } = await supabase.from("signature_requests")
        .update({ status: "pending", signed_at: null, signature_data: null })
        .eq("id", kurzId).eq("status", "signed");
      if (zurueckFehler) console.error("Gegenzeichnung nicht wieder geoeffnet:", zurueckFehler);
      return new Response(JSON.stringify({ error: "Gegenzeichnung konnte nicht gespeichert werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Die Glocke "Rechnung erstellen" nur beim Lead-Paket; ohne gibt es
    // nichts abzurechnen. Empfaenger ist nur HR: Vorher standen hier Christian
    // Kurz, Christian Peetz und jeder Admin; die Rechnung erstellt aber, wer
    // das Bewerbermanagement fuehrt, und das ist HR.
    if (mitLeadPaket) {
      try {
        const { data: hrRollen } = await supabase
          .from("user_roles").select("user_id").eq("role", "hr");
        const empfaengerIds = new Set<string>();
        (hrRollen || []).forEach((a: any) => empfaengerIds.add(a.user_id));
        const rows = Array.from(empfaengerIds).map((uid) => ({
          benutzer_id: uid,
          titel: LEAD_PAKET_RECHNUNG_GLOCKE_TITEL,
          nachricht:
            `${bewerberName} und Christian Kurz haben den Handelsvertretervertrag unterschrieben. ` +
            `${leadPaketGlockeZeile(currentMeta.leadPaket)} Bitte die Rechnung über das Lead-Paket erstellen.`,
          link: `/bewerberprozess?bewerber=${bewerberId}`,
        }));
        if (rows.length) await supabase.from("benachrichtigungen").insert(rows);
      } catch (e) { console.error("Notif failed:", e); }
    }

    // Rechnung ueber das Lead-Paket. Seit dem 23.09.2026 nur noch, wenn der
    // Vertrag ein Lead-Paket enthaelt; ohne Lead-Paket ist nichts abzurechnen,
    // und die Onboardinggebuehr, um die es hier frueher ging, erhebt der
    // heutige Vertrag nicht mehr. Die Regel steht in _shared/lead-paket.ts,
    // der Wortlaut in _shared/lead-paket-rechnung-mail.ts.
    const templateData = leadPaketRechnungDaten({
      bewerberName,
      bewerberEmail,
      bewerberTelefon: bewerber.telefon || currentMeta.telefon || "",
      rechnungsAdresse: currentMeta.rechnungsAdresse || "",
      privatAdresse: currentMeta.adresse || "",
      ort: currentMeta.ort || "",
      leadPaket: currentMeta.leadPaket,
      signedAt: new Date(signedAt).toLocaleString("de-DE"),
      bewerberLink: `https://osimmobilien.netlify.app/bewerberprozess?bewerber=${bewerberId}`,
    });
    if (templateData) {
      try {
        await Promise.all([
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "vertrag-unterschrieben-rechnung",
              recipientEmail: CHRISTIAN_KURZ_EMAIL,
              idempotencyKey: `vertrag-unterschrieben-kurz-${bewerberId}`,
              templateData,
            },
          }),
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "vertrag-unterschrieben-rechnung",
              recipientEmail: CHRISTIAN_PEETZ_EMAIL,
              idempotencyKey: `vertrag-unterschrieben-peetz-${bewerberId}`,
              templateData,
            },
          }),
        ]);
      } catch (e) { console.error("Rechnung-Mail failed:", e); }
    }

    if (bewerberEmail) {
      try {
        const fmtTs = (iso: string) => {
          try { return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); }
          catch { return iso; }
        };
        const bewerberSignedAtIso = currentMeta.vertragBewerberSignedAt || signedAt;
        // Unter der Mail steht die HR-Managerin, wie unter der
        // Signatur-Anfrage und allen anderen Bewerbermails (Rolle `hr`, siehe
        // hr-ansprechpartner.ts). Rueckfall: der Closing-Berater aus der
        // Bewerbung, den send-transactional-email zentral aufloest.
        const hrKontakt = await hrAnsprechpartner(supabase as never);
        const closingBeraterName = hrKontakt
          ? ""
          : currentMeta.erstgespraechBerater || currentMeta.erstgespraechSkript?.durchgefuehrtVon || "";
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "vertrag-vollstaendig-unterschrieben",
            recipientEmail: bewerberEmail,
            idempotencyKey: `vertrag-vollstaendig-${bewerberId}-${stamp}`,
            templateData: {
              bewerberName,
              paketTitel,
              vertragUrl: hauptUrl,
              signedAt: fmtTs(bewerberSignedAtIso),
              kurzSignedAt: fmtTs(signedAt),
              documents: uploadedDocs.map((d) => ({ name: `${d.name} (unterschrieben).pdf`, url: d.url })),
              ...(hrKontakt
                ? { hrKontakt }
                : closingBeraterName ? { beraterName: closingBeraterName } : {}),
            },
          },
        });
      } catch (e) { console.error("Bewerber-Bestätigungs-Mail failed:", e); }
    }

    // Queue sofort abarbeiten (Rechnungs-Mails + Bewerber-Bestätigung),
    // damit die Mails nicht bis zu 5s auf den pg_cron-Tick warten.
    try {
      await supabase.functions.invoke("process-email-queue", { body: {} });
    } catch (e) { console.error("process-email-queue kick failed:", e); }

    return new Response(
      JSON.stringify({
        allSigned: true,
        stage: "completed",
        signedAt,
        documentCount: uploadedDocs.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in finalize-vertrag:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
