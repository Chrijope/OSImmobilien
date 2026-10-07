import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CHRISTIAN_PEETZ_ID = "27ccfbab-f949-4484-90b1-7dffca6a65c9";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/submit-lead`;

/**
 * Simuliert eine Immowelten-Terminbuchung an die Edge Function `submit-lead`
 * und prüft, dass:
 *  1. Lead erfolgreich angelegt wird (Response 200 + kontaktId)
 *  2. Christian Peetz als zuständiger Berater zugewiesen wird
 *  3. Termin-Lead-Markierung in der Response steht
 *  4. (optional, falls Service Role Key vorhanden) DB enthält Kontakt + Glocken-Benachrichtigung
 *
 * Cleanup: Testdaten werden entfernt, falls Service Role Key verfügbar ist.
 */
Deno.test(
  "submit-lead: Immowelten-Terminbuchung weist Christian Peetz zu und triggert Glocken-Benachrichtigung",
  async () => {
    const uniqueSuffix = Date.now();
    const testEmail = `automated-test-${uniqueSuffix}@example.test`;
    const testVorname = "AutoTest";
    const testNachname = `Termin${uniqueSuffix}`;
    const terminDatum = "2026-05-15";
    const terminUhrzeit = "10:30";

    const payload = {
      vorname: testVorname,
      nachname: testNachname,
      email: testEmail,
      telefon: "+49 170 1234567",
      notizen: "Terminbuchung über Immowelten-Website (automatisierter Test)",
      quelle: "Website Immowelten-Consult DE",
      termin_datum: terminDatum,
      termin_uhrzeit: terminUhrzeit,
      meta: { quelle: "Website Immowelten-Consult DE" },
    };

    // ── 1) Edge Function aufrufen ───────────────────────────────────
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json();
    console.log("📨 submit-lead response:", responseBody);

    assertEquals(
      response.status,
      200,
      `Erwartet 200, war ${response.status}: ${JSON.stringify(responseBody)}`,
    );
    assert(responseBody.success === true, "Response sollte success: true zurückgeben");
    assertExists(responseBody.kontaktId, "kontaktId muss in der Response gesetzt sein");

    // ── 2) Termin-Lead-Markierung & Auto-Zuweisung in Response ─────
    assertEquals(
      responseBody.leadTyp,
      "erstgespraech",
      `leadTyp sollte 'erstgespraech' sein, war: ${responseBody.leadTyp}`,
    );
    assertEquals(
      responseBody.zugewiesenAn,
      CHRISTIAN_PEETZ_ID,
      `zugewiesenAn sollte Christian Peetz UID sein, war: ${responseBody.zugewiesenAn}`,
    );

    const kontaktId = responseBody.kontaktId as string;
    console.log(`✅ Lead erstellt: ${kontaktId}, zugewiesen an Christian Peetz`);

    // ── 3) Optional: DB-Verifikation + Cleanup mit Service Role ────
    if (SERVICE_ROLE_KEY) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      try {
        // Kontakt in DB verifizieren
        const { data: kontakt, error: kontaktError } = await admin
          .from("kontakte")
          .select("id, vorname, nachname, email, zustaendig_id, berater, meta")
          .eq("id", kontaktId)
          .single();

        assertEquals(kontaktError, null, `Kontakt-Read-Fehler: ${kontaktError?.message}`);
        assertExists(kontakt, "Kontakt sollte in DB existieren");
        assertEquals(kontakt.vorname, testVorname);
        assertEquals(kontakt.nachname, testNachname);
        assertEquals(kontakt.email, testEmail);
        assertEquals(kontakt.zustaendig_id, CHRISTIAN_PEETZ_ID);

        const meta = (kontakt.meta ?? {}) as Record<string, unknown>;
        assertEquals(meta.leadTyp, "erstgespraech");
        assertEquals(meta.pipelineStufe, "termin_gebucht");
        assertEquals(meta.terminDatum, terminDatum);
        assertEquals(meta.terminUhrzeit, terminUhrzeit);
        assertEquals(meta.prioritaet, "hoch");
        console.log("✅ Kontakt in DB korrekt mit Termin-Metadaten");

        // Glocken-Benachrichtigung verifizieren
        const { data: notifs, error: notifError } = await admin
          .from("benachrichtigungen")
          .select("id, titel, nachricht, link, gelesen, benutzer_id")
          .eq("benutzer_id", CHRISTIAN_PEETZ_ID)
          .like("link", `%${kontaktId}%`)
          .order("erstellt_am", { ascending: false })
          .limit(5);

        assertEquals(notifError, null, `Notification-Read-Fehler: ${notifError?.message}`);
        assertExists(notifs, "Notifications-Array sollte existieren");
        assert(
          notifs.length > 0,
          "Mindestens eine Glocken-Benachrichtigung sollte angelegt sein",
        );
        const notif = notifs[0];
        assert(
          notif.titel.includes("Erstgespräch") || notif.titel.includes("📅"),
          `Titel sollte Termin-Lead anzeigen, war: ${notif.titel}`,
        );
        assertEquals(notif.gelesen, false);
        assert(notif.link?.includes(kontaktId), "Link sollte zum Kontakt führen");
        console.log(`✅ Glocken-Benachrichtigung gefunden: "${notif.titel}"`);
      } finally {
        // Cleanup
        await admin
          .from("benachrichtigungen")
          .delete()
          .like("link", `%${kontaktId}%`);
        await admin.from("kontakte").delete().eq("id", kontaktId);
        console.log("🧹 Testdaten bereinigt");
      }
    } else {
      console.warn(
        "⚠️  SUPABASE_SERVICE_ROLE_KEY nicht gesetzt — DB-Verifikation und Cleanup übersprungen.\n" +
        `   Test-Lead bleibt in DB: kontakt_id = ${kontaktId} (manuell entfernen).`,
      );
    }
  },
);
