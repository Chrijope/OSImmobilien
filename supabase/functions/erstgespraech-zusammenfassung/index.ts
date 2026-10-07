// Edge Function: erstgespraech-zusammenfassung
// Erstellt eine kurze, prägnante deutsche Zusammenfassung des Erstgesprächs
// aus den strukturierten Skript-Antworten via Lovable AI Gateway.

//
// Seit dem 04.10.2026 nur für Angemeldete mit interner Rolle und mit
// Mengenbremse je Nutzer. Vorher konnte jeder mit dem öffentlichen Schlüssel
// beliebige Texte auf unsere Kosten an die KI schicken.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { internerAufrufer } from "../_shared/interner-aufrufer.ts";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface Payload {
  vorname?: string;
  nachname?: string;
  ausgangslage?: string;
  ausgangslageNotiz?: string;
  beschaeftigungsart?: string;
  ziele?: string;
  motivation?: string;
  erfahrung?: string;
  vorErfahrung?: string;
  vorteileNotiz?: string;
  budget?: string;
  einwand?: string;
  bewertung?: number;
  closingTerminDatum?: string;
  closingTerminUhrzeit?: string;
  // Zusätzlich (Setter-Erstgesprächs-Skript v2):
  notizenJson?: string;
  antwortenJson?: string;
  // Teil 2 „Closing direkt": nur gesetzt, wenn der Direktweg im Erstgespräch
  // aktiv war. Ohne diese Felder bleibt alles beim bisherigen Verhalten.
  closingDirekt?: boolean;
  closingJson?: string;
  // Kunden-Erstgespräch (Kundenprofil): eigener Modus mit eigenen Feldern.
  // Ohne modus bleibt alles beim bisherigen Bewerber-Verhalten.
  modus?: "kunde" | "bewerber";
  beruf?: string;
  arbeitgeber?: string;
  familienstand?: string;
  nettoEinkommen?: string;
  eigenkapital?: string;
  sparformen?: string;
  investitionMonat?: string;
  verbindlichkeit?: string;
  cashflowPraeferenz?: string;
  offeneFragen?: string;
  /** Alle freien Notizen, je Zeile mit dem Titel ihres Skript-Schritts. */
  notizenBenannt?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const aufrufer = await internerAufrufer(req, corsHeaders);
  if (aufrufer instanceof Response) return aufrufer;

  // Ein Gespräch braucht eine, höchstens ein paar Fassungen.
  const bremse = await checkEdgeRateLimit({
    scope: "erstgespraech-zusammenfassung",
    key: `user:${aufrufer.nutzerId}`,
    perHour: 60,
    perDay: 300,
    failClosed: true,
  });
  if (bremse.unavailable) {
    return new Response(JSON.stringify({ error: "Zusammenfassung gerade nicht möglich. Bitte gleich erneut versuchen." }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (bremse.exceeded) {
    return new Response(JSON.stringify({ error: "Zu viele Anfragen. Bitte später erneut." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ist nicht konfiguriert");
    const data = (await req.json()) as Payload;

    const istKunde = data.modus === "kunde";
    const name = [data.vorname, data.nachname].filter(Boolean).join(" ") || (istKunde ? "Kunde/Kundin" : "Bewerber/in");
    const kontext = istKunde ? [
      `Name: ${name}`,
      data.beruf && `Beruf/Position: ${data.beruf}`,
      data.arbeitgeber && `Arbeitgeber, seit wann: ${data.arbeitgeber}`,
      data.familienstand && `Familiäre Situation: ${data.familienstand}`,
      data.nettoEinkommen && `Netto-Einkommen pro Monat: ${data.nettoEinkommen}`,
      data.eigenkapital && `Verfügbares/nachweisbares Eigenkapital: ${data.eigenkapital}`,
      data.sparformen && `Bisherige Sparformen: ${data.sparformen}`,
      data.investitionMonat && `Monatlich möglicher Investitionsbetrag: ${data.investitionMonat}`,
      data.verbindlichkeit && `Verbindlichkeit (Selbsteinschätzung 1 bis 10): ${data.verbindlichkeit}`,
      data.cashflowPraeferenz && `Erwartung Cashflow oder Qualität: ${data.cashflowPraeferenz}`,
      data.ziele && `Ziele beim Immobilieninvestment: ${data.ziele}`,
      data.motivation && `Wichtigste Punkte/Motivation: ${data.motivation}`,
      data.erfahrung && `Immobilien-Vorerfahrung: ${data.erfahrung}`,
      data.offeneFragen && `Offene Fragen/Einwände: ${data.offeneFragen}`,
      data.notizenBenannt && `Freie Notizen des Beraters:\n${data.notizenBenannt}`,
      data.antwortenJson && `Alle Skript-Antworten (JSON, nur ergänzend): ${data.antwortenJson}`,
    ].filter(Boolean).join("\n") : [
      `Name: ${name}`,
      data.beschaeftigungsart && `Beschäftigung: ${data.beschaeftigungsart}`,
      data.ausgangslage && `Aktuelle Situation/Branche: ${data.ausgangslage}`,
      data.ausgangslageNotiz && `Notizen Ausgangslage: ${data.ausgangslageNotiz}`,
      data.ziele && `Ziele (1–3 Jahre): ${data.ziele}`,
      data.motivation && `Motivation MOREImmo: ${data.motivation}`,
      data.erfahrung && `Vertriebserfahrung: ${data.erfahrung}`,
      data.vorErfahrung && `Details Erfahrung: ${data.vorErfahrung}`,
      data.vorteileNotiz && `Reaktion auf Vorstellung: ${data.vorteileNotiz}`,
      data.budget && `Budget/Investitionsbereitschaft: ${data.budget}`,
      data.einwand && `Einwände: ${data.einwand}`,
      typeof data.bewertung === "number" && data.bewertung > 0 && `Bewertung Berater: ${data.bewertung}/5`,
      (data.closingTerminDatum || data.closingTerminUhrzeit) &&
        `Closing-Termin: ${data.closingTerminDatum || ""} ${data.closingTerminUhrzeit || ""}`.trim(),
      data.antwortenJson && `Alle Skript-Antworten (JSON): ${data.antwortenJson}`,
      data.notizenJson && `Alle freien Notizen (JSON): ${data.notizenJson}`,
      data.closingJson &&
        `Teil 2 „Closing direkt" (Persönliches Gespräch direkt im Anschluss; JSON mit besprochenen Abschnitten, Notizen, Entscheidung, Paketwahl): ${data.closingJson}`,
    ].filter(Boolean).join("\n");

    // Lief Teil 2 (Closing direkt), bekommt die Zusammenfassung zwei
    // zusätzliche Abschnitte. Ohne closingJson bleibt der Prompt unverändert.
    const closingHinweis = !istKunde && data.closingJson
      ? " Zusätzlich wurde direkt im Anschluss Teil 2 „Closing direkt\" (das persönliche Gespräch) geführt, " +
        "die Daten dazu stehen unter Teil 2. Ergänze deshalb am Ende zwei weitere Abschnitte mit fettem Markdown-Titel: " +
        "**Closing-Gespräch** (Verlauf, Reaktionen und wichtige Notizen aus Teil 2) und " +
        "**Entscheidung & nächste Schritte** (Entscheidung, Paketwahl, Zahlungsweise, Startfahrplan-Weiche, " +
        "andere Vertriebe, vereinbarte Rückrufe oder Follow-ups). " +
        "Die Begrenzung auf 6 bis 8 Bullet Points gilt dann nur für den Erstgesprächs-Teil, " +
        "die beiden Closing-Abschnitte kommen mit je 1 bis 3 Stichpunkten hinzu."
      : "";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: istKunde
              ? "Du fasst Erstgespräche mit Kapitalanlage-Interessenten von MOREImmo prägnant auf Deutsch zusammen. " +
                "Die Zusammenfassung beschreibt den Kunden bzw. die Kundin aus Sicht eines Beobachters in der dritten Person " +
                "(z. B. 'Marc verdient …', 'sie möchte …'). Verwende konsequent den Vornamen, KEINE Du-Form, KEINE direkte Ansprache. " +
                "Stil: knapp, sachlich, in Stichpunkten. Maximal 6 bis 8 Bullet Points. " +
                "Strukturiere die Zusammenfassung in folgende Abschnitte mit fettem Markdown-Titel: " +
                "**Beruf & Situation**, **Ziele & Motivation**, **Finanzielle Ausgangslage**, " +
                "**Einwände & offene Punkte**, **Einschätzung**. " +
                "Nimm ausdrücklich auch die freien Notizen des Beraters auf, sie enthalten oft das Wichtigste. " +
                "Erwähne nur, was wirklich in den Daten steht. Gib NUR die Zusammenfassung zurück, keine Einleitung."
              : "Du fasst Erstgespräche aus dem MOREImmo-Vertriebs-Recruiting prägnant auf Deutsch zusammen. " +
              "Die Zusammenfassung ist IMMER auf den/die Bewerbende/n bezogen und beschreibt diese Person aus Sicht eines Beobachters " +
              "in der dritten Person (z. B. 'Max bringt …', 'sie verfügt über …'). Verwende konsequent den Vornamen bzw. " +
              "wenn nicht vorhanden 'die Bewerberin/der Bewerber'. KEINE Du-Form, KEINE direkte Ansprache, KEINE Ich-Form. " +
              "Stil: knapp, sachlich, in Stichpunkten. Maximal 6–8 Bullet Points. " +
              "Strukturiere die Zusammenfassung in folgende Abschnitte mit fettem Markdown-Titel: " +
              "**Profil & Werdegang**, **Ziele & Motivation**, **Vertriebserfahrung**, " +
              "**Investitionsbereitschaft & Einwände**, **Einschätzung**. " +
              "Schreibe pro Abschnitt 1–2 kurze Sätze oder Stichpunkte – jeweils klar auf die bewerbende Person bezogen. " +
              "Erwähne nur, was wirklich in den Daten steht. Gib NUR die Zusammenfassung zurück, keine Einleitung." +
              closingHinweis,
          },
          {
            role: "user",
            content: `Hier sind die strukturierten Antworten aus dem Erstgespräch mit ${istKunde ? "dem Kunden bzw. der Kundin" : ""} ${name}:\n\n${kontext}\n\nFasse das Gespräch prägnant zusammen – immer bezogen auf ${name} (dritte Person, Vorname verwenden, keine Du-Form).`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte später erneut." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Credits aufgebraucht. Bitte aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway: ${aiRes.status} ${txt}`);
    }

    const json = await aiRes.json();
    const summary: string = json?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("erstgespraech-zusammenfassung:", e?.message || e);
    return new Response(JSON.stringify({ error: "Zusammenfassung fehlgeschlagen" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});