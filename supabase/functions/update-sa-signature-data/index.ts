import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { SA_PERSON_TYPEN, SA_UEBERHOLT, darfSaKorrigieren, saFassungVon } from "../_shared/selbstauskunft-geltende-unterschrift.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNATURE_BASE_URL = "https://portal.more.immo/signatur";

/** Felder, die der Kunde nicht ueber die Korrektur veraendern darf (Identitaet des Signaturvorgangs). */
const GESPERRTE_FELDER = new Set(["versionen", "abgeschlossen"]);

/** Liefert eine kurze Liste der geaenderten Top-Level-Felder fuer die Benachrichtigung. */
function geaenderteFelder(alt: Record<string, unknown>, neu: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(alt || {}), ...Object.keys(neu || {})]);
  const geaendert: string[] = [];
  for (const k of keys) {
    if (GESPERRTE_FELDER.has(k)) continue;
    if (JSON.stringify(alt?.[k]) !== JSON.stringify(neu?.[k])) geaendert.push(k);
  }
  return geaendert;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, saData } = await req.json();

    if (!token || typeof token !== "string" || !saData || typeof saData !== "object" || Array.isArray(saData)) {
      return new Response(JSON.stringify({ error: "token und saData sind Pflichtfelder" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Token pruefen
    const { data: anfrage, error: anfrageFehler } = await supabase
      .from("signature_requests")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (anfrageFehler || !anfrage) {
      return new Response(JSON.stringify({ error: "Ungueltiger Link" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (anfrage.status === "signed") {
      return new Response(JSON.stringify({ error: "Bereits unterschrieben, Korrektur nicht mehr moeglich" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Eine neuere Fassung hat diese Anfrage abgeloest (Befund HB-004).
    if (anfrage.status === SA_UEBERHOLT) {
      return new Response(JSON.stringify({ error: "Diese Anfrage ist ueberholt, es gibt eine neuere Fassung" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (anfrage.expires_at && new Date(anfrage.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link abgelaufen" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Nur die Selbstauskunft, als Positivliste (NB-01): Vertrag,
    // Gegenzeichnung, Reservierung und alles Kuenftige bleiben aussen vor.
    if (!darfSaKorrigieren(anfrage.person_type)) {
      return new Response(JSON.stringify({ error: "Fuer dieses Dokument ist keine Korrektur vorgesehen" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const altData = (anfrage.sa_data || {}) as Record<string, unknown>;
    const versionen = Array.isArray((altData as any).versionen) ? (altData as any).versionen : [];

    // 2) Neue Fassung bauen: gesperrte Felder bleiben unveraendert, alte Fassung wird archiviert
    const neuData: Record<string, unknown> = { ...(saData as Record<string, unknown>) };
    for (const feld of GESPERRTE_FELDER) neuData[feld] = altData[feld];
    neuData.versionen = [
      ...versionen,
      {
        geaendertAm: new Date().toISOString(),
        geaendertVon: anfrage.name || anfrage.email,
        personType: anfrage.person_type,
        stand: { ...altData, versionen: undefined },
      },
    ].slice(-10);
    neuData.korrigiertAm = new Date().toISOString();
    neuData.korrigiertVon = anfrage.name || anfrage.email;

    const felder = geaenderteFelder(altData, saData as Record<string, unknown>);

    // 3) Alle offenen und bereits unterschriebenen Anfragen desselben Vorgangs aktualisieren
    let query = supabase
      .from("signature_requests")
      .select("id, token, name, email, person_type, status")
      .eq("kontakt_id", anfrage.kontakt_id)
      // Nur Anfragen der Selbstauskunft nachziehen, nie Vertrag oder
      // Gegenzeichnung, die denselben `kontakt_id`-Wert tragen koennen.
      .in("person_type", [...SA_PERSON_TYPEN]);
    query = anfrage.investment_id
      ? query.eq("investment_id", anfrage.investment_id)
      : query.is("investment_id", null);
    /*
     * Mit Fassungskennung nur die Anfragen dieser Fassung (seit 26.09.2026).
     * Unterschriften zu aelteren Fassungen sind Nachweise und bleiben, wie
     * sie sind. Ohne Kennung (Bestand) unveraendert alle.
     */
    const fassung = saFassungVon(anfrage);
    if (fassung) query = query.eq("meta->>saFassung", fassung);
    const { data: geschwister } = await query;

    const zurueckgesetzt: { name: string; email: string; token: string }[] = [];

    for (const row of geschwister || []) {
      const warUnterschrieben = row.status === "signed";
      const patch: Record<string, unknown> = { sa_data: neuData };
      if (warUnterschrieben) {
        patch.status = "pending";
        patch.signature_data = null;
        patch.signed_at = null;
      }
      const { error: updFehler } = await supabase
        .from("signature_requests")
        .update(patch)
        .eq("id", row.id);
      if (updFehler) {
        console.error("Update signature_request fehlgeschlagen", row.id, updFehler);
        continue;
      }
      if (warUnterschrieben) {
        zurueckgesetzt.push({ name: row.name, email: row.email, token: row.token });
      }
    }

    // 4) Investment spiegeln
    if (anfrage.investment_id) {
      const { data: inv } = await supabase
        .from("investments")
        .select("meta")
        .eq("id", anfrage.investment_id)
        .maybeSingle();
      if (inv) {
        const meta = ((inv.meta as Record<string, unknown> | null) ?? {}) as Record<string, any>;
        await supabase
          .from("investments")
          .update({
            meta: {
              ...meta,
              saData: neuData,
              saSignatures: {},
              saSignaturePartial: false,
              saSignaturePending: true,
              saSigned: false,
              saSignedAt: null,
              saKorrekturAm: new Date().toISOString(),
              saKorrekturVon: anfrage.name || anfrage.email,
              /*
               * Wann der Kunde zuletzt selbst gespeichert hat.
               *
               * Daran haengt die Vorfahrtsregel: Bei einem Gleichstand
               * gewinnen immer die Angaben des Kunden. Das Beraterformular
               * vergleicht diesen Zeitpunkt mit dem, den es beim Oeffnen
               * gesehen hat. Ist er neuer, schreibt der Berater nicht mehr in
               * den gemeinsamen Stand, sondern wird darauf hingewiesen.
               */
              saKundeStandAm: new Date().toISOString(),
            },
          })
          .eq("id", anfrage.investment_id);
      }
    }

    // 5) Bereits geleistete Unterschriften erneut anfordern
    // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die Mail den
    // Platzhalter "MOREImmo Team".
    const beraterSignatur = await zustaendigerAnsprechpartner(supabase, anfrage.kontakt_id);
    for (const person of zurueckgesetzt) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "selbstauskunft-geaendert",
            recipientEmail: person.email,
            idempotencyKey: `sa-korrektur-${person.token}-${Date.now()}`,
            templateData: {
              name: person.name,
              signUrl: `${SIGNATURE_BASE_URL}?token=${person.token}`,
              geaendertVon: anfrage.name || "",
              ...(beraterSignatur ? { berater: beraterSignatur } : {}),
            },
            metadata: { kontakt_id: anfrage.kontakt_id, person_type: anfrage.person_type },
          },
        });
      } catch (err) {
        console.error("Erneute Unterschriftsanfrage fehlgeschlagen", person.email, err);
      }
    }

    // 6) Zustaendigen Vertriebspartner benachrichtigen
    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("vorname, nachname, zustaendig_id")
      .eq("id", anfrage.kontakt_id)
      .maybeSingle();

    if (kontakt?.zustaendig_id) {
      await supabase.from("benachrichtigungen").insert({
        benutzer_id: kontakt.zustaendig_id,
        titel: "Selbstauskunft vom Kunden korrigiert",
        nachricht: `${anfrage.name} hat die Selbstauskunft von ${kontakt.vorname} ${kontakt.nachname} vor der Unterschrift geaendert${
          felder.length ? ` (${felder.slice(0, 8).join(", ")})` : ""
        }.${zurueckgesetzt.length ? " Bereits geleistete Unterschriften wurden zurueckgesetzt." : ""}`,
        link: `/kunden/${anfrage.kontakt_id}`,
      });
    }

    // 7) Audit
    await supabase.from("audit_log").insert({
      action: "sa_korrektur_durch_kunde",
      entity: "signature_requests",
      entity_id: anfrage.id,
      vorher: { saData: altData },
      nachher: { saData: neuData },
      meta: {
        kontakt_id: anfrage.kontakt_id,
        investment_id: anfrage.investment_id,
        person_type: anfrage.person_type,
        geaenderte_felder: felder,
        unterschriften_zurueckgesetzt: zurueckgesetzt.map((p) => p.email),
      },
      actor_email: anfrage.email,
    });

    return new Response(
      JSON.stringify({ success: true, geaenderteFelder: felder, zurueckgesetzt: zurueckgesetzt.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("update-sa-signature-data Fehler:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
