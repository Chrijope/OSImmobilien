// KI-gestützte Marktwert-Schätzung für Eigene Investments im Kundenportal.
// Nutzt Lovable AI Gateway (kein User-API-Key nötig).
// Strategie für Seriosität ohne Live-Webzugriff:
//   1) Zwei unabhängige Schätzungen mit unterschiedlichem Framing
//      (a: marktbasiert €/m², b: vergleichsbasiert Lage/Objekt).
//   2) Konsens-Mittelwert, leicht konservativ gewichtet (-2 %).
//   3) Plausi-Cap: max. ±35 % vs. Kaufpreis, kappt KI-Ausreißer.
//   4) Konfidenz wird automatisch reduziert, wenn Schätzungen
//      stark voneinander abweichen oder Pflichtdaten fehlen.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

async function aiSchaetzung(prompt: string): Promise<any> {
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error("AI error", aiRes.status, t);
    throw new Error(aiRes.status === 429 ? "Rate Limit – bitte gleich erneut versuchen." : "KI-Schätzung fehlgeschlagen");
  }
  const aiJson = await aiRes.json();
  const raw = aiJson?.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { kaufpreis, kaufdatum, baujahr, wohnflaeche, objekttyp, plz, ort, adresse } = body || {};

    if (!kaufpreis) {
      return new Response(JSON.stringify({ error: "kaufpreis required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const heute = new Date().toISOString().slice(0, 10);
    const objektBlock = `Objektdaten:
- Objekttyp: ${objekttyp || "Eigentumswohnung"}
- Adresse: ${adresse || ""}, ${plz || ""} ${ort || ""}
- Wohnfläche: ${wohnflaeche || "?"} m²
- Baujahr: ${baujahr || "?"}
- Damaliger Kaufpreis: ${kaufpreis} €
- Kaufdatum: ${kaufdatum || "?"}`;

    const jsonShape = `Antworte NUR als JSON:
{
  "wert": <integer EUR>,
  "qmPreisMin": <integer €/m²>,
  "qmPreisMax": <integer €/m²>,
  "vergleichsmieteQm": <number €/m² ortsübliche Kaltmiete, oder null>,
  "begruendung": "<3-4 sachliche Sätze mit konkreten Zahlen>",
  "quellen": [{ "name": "<Portal/Behörde>", "hinweis": "<Region/Bericht>" }]
}`;

    // Prompt A: marktbasiert (€/m²-Spannen aus Portalen)
    const promptA = `Du bist ein sachlicher Immobilien-Bewerter für deutsche Wohnimmobilien. Stand ${heute}.
Bewerte ausschließlich KONSERVATIV (eher unteres Drittel der plausiblen Spanne).

${objektBlock}

Vorgehen METHODE A – €/m²-Marktdaten:
1. Leite eine realistische €/m²-Spanne aus öffentlichen Marktdaten ab (ImmoScout24 WohnBarometer, immowelt Preisatlas, Sprengnetter Marktindex).
2. Wende sie auf die Wohnfläche an, runde auf volle 1.000 €.
3. Bei fehlenden Daten: Spanne weiter wählen, NICHT raten.
4. Quellen NUR namentlich, KEINE erfundenen URLs.

${jsonShape}`;

    // Prompt B: vergleichswertbasiert (Lage/Objekt-Charakteristik)
    const promptB = `Du bist ein Sachverständiger nach Vergleichswertverfahren (ImmoWertV). Stand ${heute}.
Bewerte ausschließlich KONSERVATIV.

${objektBlock}

Vorgehen METHODE B – Vergleichswert:
1. Berücksichtige Bodenrichtwerte des zuständigen Gutachterausschusses (BORIS Geoportal des Bundeslandes) und ortsüblichen Mietspiegel.
2. Berücksichtige Baujahr/Modernisierungszustand, Lagequalität (Mikro-/Makrolage) und typische Multiplikatoren (Jahresnettomiete × Faktor).
3. Quellen NUR namentlich, KEINE erfundenen URLs.

${jsonShape}`;

    const [a, b] = await Promise.all([
      aiSchaetzung(promptA).catch(() => ({})),
      aiSchaetzung(promptB).catch(() => ({})),
    ]);

    const werte = [Number(a?.wert) || 0, Number(b?.wert) || 0].filter((v) => v > 0);
    if (werte.length === 0) throw new Error("Keine valide Schätzung erhalten");

    // Konsens: Mittelwert, konservativ -2 %
    let wert = werte.reduce((s, v) => s + v, 0) / werte.length;
    wert = wert * 0.98;

    // Plausi-Cap: max. ±35 % vs. Kaufpreis
    const minCap = kaufpreis * 0.65;
    const maxCap = kaufpreis * 1.35;
    const capped = wert < minCap || wert > maxCap;
    wert = Math.min(Math.max(wert, minCap), maxCap);
    wert = Math.round(wert / 1000) * 1000;

    // Konfidenz aus Abweichung
    let konfidenz: "niedrig" | "mittel" | "hoch" = "mittel";
    if (werte.length === 2) {
      const abw = Math.abs(werte[0] - werte[1]) / ((werte[0] + werte[1]) / 2);
      if (abw < 0.05) konfidenz = "hoch";
      else if (abw > 0.20) konfidenz = "niedrig";
    } else {
      konfidenz = "niedrig";
    }
    if (capped) konfidenz = "niedrig";
    if (!wohnflaeche || !ort) konfidenz = "niedrig";

    // Bänder zusammenführen
    const minMins = [a?.qmPreisMin, b?.qmPreisMin].map(Number).filter((v) => v > 0);
    const maxMaxs = [a?.qmPreisMax, b?.qmPreisMax].map(Number).filter((v) => v > 0);
    const qmPreisMin = minMins.length ? Math.round(Math.min(...minMins)) : null;
    const qmPreisMax = maxMaxs.length ? Math.round(Math.max(...maxMaxs)) : null;
    const mieten = [a?.vergleichsmieteQm, b?.vergleichsmieteQm].map(Number).filter((v) => v > 0);
    const vergleichsmieteQm = mieten.length ? mieten.reduce((s, v) => s + v, 0) / mieten.length : null;

    // Quellen mergen, dedupen
    const quellenRaw = [...(Array.isArray(a?.quellen) ? a.quellen : []), ...(Array.isArray(b?.quellen) ? b.quellen : [])];
    const seen = new Set<string>();
    const quellen = quellenRaw.filter((q: any) => {
      const k = (q?.name || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 6);

    const begruendung = [
      `Konsens aus zwei unabhängigen Bewertungsansätzen (Marktdaten €/m² und Vergleichswertverfahren), Mittelwert mit konservativem Abschlag von 2 %.`,
      a?.begruendung || "",
      b?.begruendung || "",
    ].filter(Boolean).join(" ");

    return new Response(JSON.stringify({
      wert,
      qmPreisMin,
      qmPreisMax,
      vergleichsmieteQm,
      konfidenz,
      begruendung,
      quellen,
      methodik: "Konsens aus 2 unabhängigen KI-Bewertungen (Marktdaten + Vergleichswertverfahren), konservativ gerundet, Plausi-Cap ±35 % vs. Kaufpreis.",
      hinweis: "Schätzung auf Basis öffentlich bekannter Marktdaten ohne Live-Webzugriff. Kein Verkehrswertgutachten nach §194 BauGB. Für einen rechtsverbindlichen Verkehrswert ist ein Sachverständigengutachten erforderlich.",
      stand: heute,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});