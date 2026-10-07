/**
 * Stress-Test-Seed-Script
 *
 * Erzeugt 50 Test-VPs und 5.000 Test-Kontakte.
 * Alle Datensätze sind durch meta._testData = true markiert.
 *
 * USAGE:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/stress-test-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const VORNAMEN = ["Max", "Anna", "Lukas", "Julia", "Tim", "Sarah", "Felix", "Lara", "Jonas", "Mia"];
const NACHNAMEN = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer"];
const STUFEN = [
  "neuer_lead", "neuer_lead", "neuer_lead",
  "kontaktversuche", "kontaktversuche",
  "erstgespraech", "erstgespraech",
  "bonitaetsunterlagen",
  "closing",
  "objektauswahl",
  "reservierung",
  "finanzierung",
  "notar",
];
const QUELLEN = ["empfehlung", "website", "messe", "kaltakquise", "social_media"];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  console.log("→ Lege 50 Test-VPs an…");
  const vps: { id: string; name: string }[] = [];
  for (let i = 0; i < 50; i++) {
    const id = crypto.randomUUID();
    const name = `TestVP-${String(i + 1).padStart(2, "0")}`;
    vps.push({ id, name });
  }
  // Hinweis: profiles ist FK zu auth.users — daher nur kontakte seeden.
  // VP-Zuordnung erfolgt anhand zufälliger UUIDs (für UI-Tests ausreichend).

  console.log("→ Generiere 5.000 Test-Kontakte…");
  const BATCH = 500;
  let written = 0;
  const t0 = Date.now();

  for (let b = 0; b < 10; b++) {
    const rows = Array.from({ length: BATCH }, () => {
      const vp = rand(vps);
      const stufe = rand(STUFEN);
      const vn = rand(VORNAMEN);
      const nn = rand(NACHNAMEN);
      return {
        id: crypto.randomUUID(),
        vorname: vn,
        nachname: nn,
        email: `${vn.toLowerCase()}.${nn.toLowerCase()}.${Math.floor(Math.random() * 99999)}@stress.test`,
        telefon: "+49 " + Math.floor(100000000 + Math.random() * 899999999),
        quelle: rand(QUELLEN),
        berater: vp.name,
        zustaendig_id: vp.id,
        status: "neu",
        meta: { pipelineStufe: stufe, _testData: true, stressTestVp: vp.name },
      };
    });
    const { error } = await supabase.from("kontakte").insert(rows);
    if (error) { console.error("Batch", b, "failed:", error.message); process.exit(1); }
    written += rows.length;
    process.stdout.write(`\r  ${written}/5000`);
  }
  console.log(`\n✔ Fertig in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("\nAufräumen mit:");
  console.log("  DELETE FROM public.kontakte WHERE (meta ->> '_testData')::boolean = true;");
}

main().catch((e) => { console.error(e); process.exit(1); });
