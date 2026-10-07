import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { analysePfadErlaubt } from "../_shared/speicherpfad.ts";
import { faktenauszugErzeugen, type RoteArt, unterlageEinordnen, wohnungAusMietvertrag } from "../_shared/lotse-faktenauszug.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** `kategorie` ist das Ablagefach der Objektanlage, etwa „mietvertrag“, seit dem 28.09.2026. */
type PdfRef = { name: string; storagePath: string; kategorie?: string };

const toolDefinition = {
  type: "function",
  function: {
    name: "extract_objekt_data",
    description: "Extrahierte Objektdaten aus den PDF-Dokumenten zurückgeben",
    parameters: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Verkaufsoptimierter Objekttitel im Format: '[Sanierungsart z.B. KFW 40 QNG / Neubau / Bestand / Kernsaniert] in [Ort]'. Beispiele: 'KFW 40 QNG Neubau in Memmingen', 'Kernsaniertes MFH in Regensburg', 'Denkmal-AfA Altbau in Augsburg'" },
        adresse: { type: "string", description: "Straße und Hausnummer" },
        plz: { type: "string", description: "Postleitzahl" },
        ort: { type: "string", description: "Stadt/Ort" },
        baujahr: { type: "number", description: "Baujahr des Gebäudes" },
        beschreibung: { type: "string", description: "Ausführliche verkaufspsychologische Objektbeschreibung für ein Immobilien-Exposé. Verwende Markdown-Formatierung mit Überschriften (#### Überschrift) und Absätzen (durch doppelte Zeilenumbrüche getrennt). Struktur: 1) Einleitung mit emotionalem Einstieg (1 Absatz), 2) #### Makrolage – Wirtschaftskraft der Region, Arbeitsmarkt, Infrastruktur, Bevölkerungsentwicklung, 3) #### Mikrolage – Wohnumfeld, Nahversorgung, ÖPNV-Anbindung, Schulen, Naherholung, 4) #### Objektdetails – Bauweise, Ausstattung, Sanierungsstand, Energieeffizienz. Jede Sektion beginnt mit #### und einer Überschrift. Schreibe überzeugend und professionell für Kapitalanleger. Mindestens 800 Zeichen." },
        objektart: { type: "string", description: "z.B. Mehrfamilienhaus, Einfamilienhaus" },
        gesamtWohnflaeche: { type: "number", description: "Gesamtwohnfläche in m²" },
        grundstueckFlaeche: { type: "number", description: "Grundstücksfläche in m²" },
        anzahlWohneinheiten: { type: "number", description: "Anzahl Wohneinheiten" },
        etagen: { type: "number", description: "Anzahl Etagen/Geschosse" },
        zustand: { type: "string", enum: ["Neubau", "Saniert", "Bestand", "Teilsaniert", "Denkmal"] },
        stellplaetze: { type: "number", description: "Anzahl Stellplätze" },
        energieeffizienzklasse: { type: "string" },
        endenergiebedarf: { type: "number" },
        primaerenergiebedarf: { type: "number" },
        heizungsart: { type: "string" },
        energietraeger: { type: "string" },
        energieausweisGueltigBis: { type: "string" },
        energieausweisRegistriernummer: { type: "string" },
        highlights: { type: "array", items: { type: "string" }, description: "Genau 10 prägnante, verkaufsfördernde Highlights/Verkaufsargumente für den Vertriebler im Kundengespräch. Beispiele: 'KFW 40 QNG Förderung möglich', 'Vollvermietung ab Fertigstellung', 'Leerstandsquote unter 1%', 'Bahnanbindung in 5 Min.', 'Sonder-AfA 5% p.a.', 'Hausverwaltung inklusive', 'Mietrendite über 4%', 'Wachstumsregion mit Zuzug'. Fokus auf steuerliche Vorteile, Standortqualität, Sicherheit der Anlage und Rendite. MAXIMAL 10 Stück." },
        sanierungen: {
          type: "array",
          items: {
            type: "object",
            properties: { bereich: { type: "string" }, status: { type: "string" } },
            required: ["bereich", "status"],
          },
        },
        grundbuchInfo: { type: "string" },
        flurstueck: { type: "string" },
        einwohner: { type: "number" },
        arbeitslosenquote: { type: "number" },
        leerstandsquote: { type: "number" },
        wohnungen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              weNr: { type: "string" },
              hauseingang: { type: "string" },
              etage: { type: "string" },
              zimmer: { type: "number" },
              groesse: { type: "number" },
              kaufpreis: { type: "number" },
              kaltmiete: { type: "number" },
              hausgeld: { type: "number" },
              vermietet: { type: "boolean" },
              raeume: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, flaeche: { type: "number" } },
                  required: ["name", "flaeche"],
                },
              },
              keller: { type: "boolean" },
              balkon: { type: "boolean" },
            },
            required: ["weNr", "etage", "groesse"],
          },
        },
        erkannte_dokumente: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dateiname: { type: "string" },
              typ: {
                type: "string",
                enum: ["expose", "wohnflaechenberechnung", "energieausweis", "aufteilungsplan", "grundbuchauszug", "mietvertrag", "teilungserklaerung", "versicherungsnachweis", "lageplan", "sonstige"],
              },
              zusammenfassung: { type: "string" },
            },
            required: ["dateiname", "typ"],
          },
        },
      },
      required: ["titel", "adresse", "plz", "ort"],
      additionalProperties: false,
    },
  },
};

const analysisInstructions = `Du bist ein Experte für Immobilien-Exposés und Kapitalanlage-Vertrieb. Analysiere die PDF-Dokumente und extrahiere ALLE Daten.

TITEL: Verkaufsoptimiert: "[Sanierungsart] in [Ort]" (z.B. "KFW 40 QNG Neubau in Memmingen")

BESCHREIBUNG: Verkaufspsychologisch für Kapitalanleger, min. 800 Zeichen. Verwende Markdown mit #### Überschriften für jede Sektion (durch doppelte Zeilenumbrüche \\n\\n getrennt). Struktur: Einleitung (ohne Überschrift) → #### Makrolage → #### Mikrolage → #### Objektdetails.

HIGHLIGHTS: EXAKT 10 prägnante Verkaufsargumente (Steuervorteile, Förderung, Standort, Rendite, Vermietungssicherheit). NIEMALS mehr als 10!

REGELN:
- Geldbeträge als reine Zahlen ohne €
- Flächen als Dezimalzahlen in m²
- ALLE Wohnungen einzeln auflisten
- Dokumenttyp jedes PDFs erkennen
- Fehlende Werte = null
- Verwende das Tool "extract_objekt_data"`;

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Rate-Limit: teure AI-Calls — 20/h, 100/Tag pro Nutzer (Fallback IP).
    let _ruid: string | null = null;
    const _auth = req.headers.get("Authorization");
    if (_auth?.startsWith("Bearer ")) {
      try {
        const _uc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
          global: { headers: { Authorization: _auth } },
        });
        const { data } = await _uc.auth.getUser();
        _ruid = data?.user?.id ?? null;
      } catch { /* ignore */ }
    }
    const rl = await checkRateLimit(req, _ruid, { scope: "analyze-objekt-pdfs", perHour: 20, perDay: 100 });
    if (!rl.ok) return rateLimitErrorBody("analyze-objekt-pdfs", rl, corsHeaders);

    const body = await req.json();

    if (!body.pdfRefs || !body.bucket || !Array.isArray(body.pdfRefs) || body.pdfRefs.length === 0) {
      return jsonResponse({ error: "Keine PDFs zum Analysieren" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    /*
     * Geladen wird mit dem Dienstschlüssel. Deshalb seit dem 28.09.2026 nur
     * noch, was die Objektanlage selbst hochlädt: Eimer `unterlagen`, Pfad
     * `<eigene Nutzerkennung>/analyse-temp/…` (`objektAnalyseRunner.ts`).
     * Vorher nahm die Function jeden Eimer und jeden Pfad aus der Anfrage an.
     */
    if (!_ruid) return jsonResponse({ error: "Bitte melde dich an." }, 401);
    const bucket: string = body.bucket;
    const pdfRefs: PdfRef[] = body.pdfRefs.filter((ref: PdfRef) =>
      !!ref?.name && analysePfadErlaubt(_ruid!, ref?.storagePath)
    );

    if (bucket !== "unterlagen" || pdfRefs.length === 0) {
      return jsonResponse({ error: "Keine gültigen PDF-Referenzen" }, 400);
    }

    // Convert each PDF to data URL (Gemini over OpenAI-compatible API cannot read remote PDF URLs as image_url)
    // Frontend sends one PDF per request, so this stays memory-stable.
    const userContent: any[] = [];
    const processedNames: string[] = [];

    // Download all PDFs in parallel for speed
    const downloadResults = await Promise.allSettled(
      pdfRefs.map(async (ref) => {
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(bucket)
          .download(ref.storagePath);
        if (downloadError || !fileData) {
          console.error(`Failed to download PDF ${ref.storagePath}:`, downloadError);
          return null;
        }
        const mimeType = fileData.type || "application/pdf";
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        const base64Pdf = uint8ToBase64(bytes);
        return { name: ref.name, kategorie: ref.kategorie, mimeType, base64Pdf };
      })
    );

    // Was nicht geladen werden konnte, wird namentlich zurueckgegeben. Vorher
    // fiel ein unlesbares PDF still heraus, und der Aufrufer erfuhr nie,
    // welches Dokument fehlt.
    const uebersprungen: string[] = [];
    /*
     * Rote Unterlagen (Mietvertrag, Grundbuch; Ampel aus dem Dateinamen) gehen
     * seit dem 28.09.2026 nicht mehr frei an das Modell, sie nennen Mieter und
     * Eigentümer. Ein Grundbuchauszug wird gar nicht mehr gelesen: Seine Felder
     * hier (`grundbuchInfo`, `flurstueck`) übernimmt die Objektanlage nirgends.
     * Ein Mietvertrag läuft über den Faktenauszug mit festem Schema und
     * Prüfung (`_shared/lotse-faktenauszug.ts`), daraus entsteht höchstens
     * eine Wohnung mit Nummer, Geschoss, Fläche, Zimmern und Kaltmiete.
     */
    const rote: Array<{ name: string; art: RoteArt; datenAdresse: string }> = [];
    // Vertriebsvereinbarungen werden nie ausgewertet, weder frei noch als Faktenauszug (Provisionen, 28.09.2026).
    const gesperrt: string[] = [];
    for (const [position, result] of downloadResults.entries()) {
      if (result.status === "fulfilled" && result.value) {
        const datenAdresse = `data:${result.value.mimeType};base64,${result.value.base64Pdf}`;
        /*
         * Die einheitliche Einordnung vor der freien Auswertung (LOTSE-R5),
         * für jede Datei, auch mit Fach „Exposé“: Fach und Name nur Richtung
         * rot, frei nur mit „sonstiges“ aus dem Einordnungsaufruf. Unklar
         * läuft wie ein Mietvertrag über den Faktenauszug.
         */
        const einordnung = await unterlageEinordnen(LOVABLE_API_KEY, {
          name: result.value.name, fach: result.value.kategorie ?? null, pdf: datenAdresse,
        });
        if (einordnung.ergebnis === "gesperrt") {
          gesperrt.push(result.value.name);
          continue;
        }
        const art: RoteArt | null = einordnung.ergebnis === "frei" ? null : einordnung.ergebnis === "rot" ? einordnung.art : "mietvertrag";
        if (art) {
          rote.push({ name: result.value.name, art, datenAdresse });
          continue;
        }
        userContent.push({ type: "image_url", image_url: { url: datenAdresse } });
        processedNames.push(result.value.name);
      } else {
        uebersprungen.push(pdfRefs[position]?.name || pdfRefs[position]?.storagePath || "unbekannte Datei");
      }
    }

    if (uebersprungen.length > 0) {
      console.error(`PDFs konnten nicht geladen werden: ${uebersprungen.join(", ")}`);
    }

    if (userContent.length === 0 && rote.length === 0 && gesperrt.length > 0) {
      return jsonResponse({
        success: true,
        data: { wohnungen: [], erkannte_dokumente: [] },
        meta: { processed: 0, total: pdfRefs.length, uebersprungen, gesperrt: gesperrt.length },
      });
    }
    if (userContent.length === 0 && rote.length === 0) {
      return jsonResponse(
        { error: `PDF konnte nicht geladen werden: ${uebersprungen.join(", ")}` },
        400,
      );
    }

    const ausRoten: { wohnungen: Record<string, unknown>[]; erkannte_dokumente: Record<string, unknown>[] } = {
      wohnungen: [],
      erkannte_dokumente: [],
    };
    for (const rot of rote) {
      ausRoten.erkannte_dokumente.push({ dateiname: rot.name, typ: rot.art === "grundbuch" ? "grundbuchauszug" : "mietvertrag" });
      if (rot.art !== "mietvertrag") continue;
      const auszug = await faktenauszugErzeugen(LOVABLE_API_KEY, "mietvertrag", { pdf: rot.datenAdresse });
      if (!auszug.ok) {
        if (rote.length === 1 && userContent.length === 0) return jsonResponse({ error: auszug.meldung }, auszug.status);
        continue;
      }
      const wohnung = wohnungAusMietvertrag(auszug.auszug);
      if (wohnung) ausRoten.wohnungen.push(wohnung);
    }

    if (userContent.length === 0) {
      return jsonResponse({
        success: true,
        data: ausRoten,
        meta: { processed: rote.length, total: pdfRefs.length, uebersprungen, faktenauszug: rote.length },
      });
    }

    // Add file name context so the AI knows which documents it's looking at
    userContent.push({
      type: "text",
      text: `Dateinamen der Dokumente: ${processedNames.map((n, i) => `${i + 1}. ${n}`).join(", ")}\n\n${analysisInstructions}`,
    });

    console.log(`Processing ${processedNames.length} PDFs via data URLs`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "Du bist ein Experte für Immobiliendokumente. Extrahiere alle relevanten Daten aus den hochgeladenen PDFs präzise und strukturiert. Antworte ausschließlich über den Tool-Call.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [toolDefinition],
        tool_choice: { type: "function", function: { name: "extract_objekt_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse({ error: "Zu viele Anfragen. Bitte versuche es in einer Minute erneut." }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ error: "KI-Kontingent erschöpft." }, 402);
      }
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      return jsonResponse({ error: "KI-Analyse fehlgeschlagen" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || !toolCall.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return jsonResponse({ error: "KI konnte keine Daten extrahieren" }, 500);
    }

    const extractedData = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Die Ergebnisse der roten Unterlagen hinten anhängen, sonst bleibt alles wie gehabt.
    if (rote.length > 0) {
      extractedData.wohnungen = [...(Array.isArray(extractedData.wohnungen) ? extractedData.wohnungen : []), ...ausRoten.wohnungen];
      extractedData.erkannte_dokumente = [
        ...(Array.isArray(extractedData.erkannte_dokumente) ? extractedData.erkannte_dokumente : []),
        ...ausRoten.erkannte_dokumente,
      ];
    }

    return jsonResponse({
      success: true,
      data: extractedData,
      meta: { processed: processedNames.length + rote.length, total: pdfRefs.length, uebersprungen, faktenauszug: rote.length },
    });
  } catch (e) {
    console.error("analyze-objekt-pdfs error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unbekannter Fehler";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
