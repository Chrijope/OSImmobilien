import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ObjektNeu from "./ObjektNeu";
import { UserContext, useUser } from "@/contexts/UserContext";

/*
 * Lokale Vorschau „Objekt anlegen“ (16.10.2026): /vorschau/objekt-anlegen.
 * Nur im Entwicklungsmodus erreichbar (siehe vorschauRouten.ts), ohne
 * Anmeldung.
 *
 * NICHTS GEHT AN DIE DATENBANK. Beim Laden dieser Seite werden Tabellen- und
 * Speicherzugriffe des Clients in diesem Tab durch eine Attrappe ersetzt:
 * Lesen liefert leere Listen, Schreiben und Hochladen landen nur im Protokoll
 * unten auf der Seite. Das gilt bis zum Neuladen des Tabs. Im Produktions-Build
 * ist diese Datei gar nicht enthalten.
 */

type Eintrag = { zeit: string; was: string; inhalt: unknown };
const protokoll: Eintrag[] = [];
const hoerer = new Set<() => void>();
const merke = (was: string, inhalt: unknown) => {
  protokoll.push({ zeit: new Date().toLocaleTimeString("de-DE"), was, inhalt });
  hoerer.forEach((h) => h());
};

/** Eine Abfragekette, die jede Methode annimmt und am Ende leer antwortet. */
function attrappe(tabelle: string): unknown {
  let einzeln = false;
  const kette: Record<string | symbol, unknown> = new Proxy({}, {
    get(_z, name) {
      if (name === "then") {
        return (fertig: (w: unknown) => unknown) => fertig({ data: einzeln ? null : [], error: null, count: 0 });
      }
      return (...args: unknown[]) => {
        if (name === "single" || name === "maybeSingle") einzeln = true;
        if (name === "insert" || name === "upsert" || name === "update" || name === "delete") {
          merke(`${String(name)} ${tabelle}`, args[0] ?? null);
        }
        return kette;
      };
    },
  });
  return kette;
}

const client = supabase as unknown as Record<string, unknown> & { storage: Record<string, unknown> };
client.from = (tabelle: string) => attrappe(tabelle);
client.rpc = (name: string, args: unknown) => { merke(`rpc ${name}`, args); return attrappe(name); };
client.storage.from = (eimer: string) => ({
  upload: async (pfad: string, datei: File) => { merke(`upload ${eimer}`, { pfad, groesse: datei?.size }); return { data: { path: pfad }, error: null }; },
  getPublicUrl: (pfad: string) => ({ data: { publicUrl: `https://vorschau.invalid/${eimer}/${pfad}` } }),
  createSignedUrl: async (pfad: string) => ({ data: { signedUrl: `https://vorschau.invalid/${eimer}/${pfad}` }, error: null }),
  remove: async (pfade: string[]) => { merke(`remove ${eimer}`, pfade); return { data: [], error: null }; },
});

// KI-Texte im Wizard: statt der Function eine feste Beispielantwort, ohne Schlüssel und ohne Netz.
const BEISPIEL_ARGUMENTE = [
  "Wachsende Universitätsstadt. Die BTU Cottbus bringt Studierende und Beschäftigte in die Stadt, die Wohnraum suchen.",
  "Strukturwandel mit Investitionen. In der Lausitz entstehen neue Arbeitsplätze, etwa im Bahnwerk und in der Forschung.",
  "Gute Anbindung. Regionalzüge fahren direkt nach Berlin, die Autobahn A15 liegt nahe.",
  "Innenstadtnahe Mikrolage. Einkauf, Ärzte und Schulen sind zu Fuß erreichbar.",
  "Grün vor der Tür. Spreeauen und Parks liegen in der Nähe und machen die Lage für Mieter attraktiv.",
];
const BEISPIEL_BESCHREIBUNG =
  "Dieses Haus verbindet den Charme eines Gründerzeitbaus mit dem Komfort einer umfassenden Sanierung. Hinter der hellen, frisch gestrichenen Fassade erwartet dich ein gepflegtes Treppenhaus mit originalen Details.\n\n" +
  "Die Wohnungen sind klug geschnitten, mit hohen Decken, großen Fenstern und viel Tageslicht. Neue Böden, modernisierte Bäder und Einbauküchen sorgen dafür, dass sich Mieter vom ersten Tag an wohlfühlen. Balkone zum ruhigen Hof laden zum Verweilen ein.\n\n" +
  "Die kompakten Zwei- und Dreizimmerwohnungen passen zu Paaren, Berufstätigen und kleinen Familien, die zentral und dennoch ruhig wohnen möchten. Ein Haus, das man gerne vermietet und das man im Gespräch leicht beschreiben kann.";
// `functions` ist am Client ein Getter, deshalb defineProperty statt Zuweisung.
Object.defineProperty(client, "functions", { configurable: true, value: {
  invoke: async (name: string, opts: { body?: { art?: string; bilder?: unknown[] } }) => {
    merke(`function ${name}`, { art: opts?.body?.art, bilder: opts?.body?.bilder?.length ?? 0 });
    await new Promise((r) => setTimeout(r, 600));
    if (name !== "objekt-wizard-texte") return { data: null, error: new Error("In der Vorschau nicht verfügbar") };
    return opts?.body?.art === "beschreibung"
      ? { data: { beschreibung: BEISPIEL_BESCHREIBUNG, hinweise: [], bilder: opts.body.bilder?.length ?? 0 }, error: null }
      : { data: { standortargumente: BEISPIEL_ARGUMENTE, hinweise: [] }, error: null };
  },
} });

function SchlichterRahmen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>;
}

export default function VorschauObjektAnlegen() {
  const [, setStand] = useState(0);
  // Ohne Anmeldung als Admin, sonst fehlen die Knöpfe, die nur Objektpflegende sehen (etwa „Mit KI erstellen“).
  const echt = useUser();
  const nutzer = echt.authUser ? echt : { ...echt, isLoggedIn: true, loading: false, user: { ...echt.user, name: "Vorschau (Admin)", role: "admin" as const } };
  useEffect(() => {
    const h = () => setStand((n) => n + 1);
    hoerer.add(h);
    return () => { hoerer.delete(h); };
  }, []);

  return (
    <div className="min-h-screen bg-background" data-lg="seite">
      <div className="border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
        Vorschau ohne Datenbank. Gespeichert und hochgeladen wird nichts, alles steht nur im Protokoll unten.
      </div>
      <UserContext.Provider value={nutzer}>
        <ObjektNeu Rahmen={SchlichterRahmen} />
      </UserContext.Provider>
      <section className="mx-auto max-w-6xl p-4 sm:p-6" data-testid="vorschau-protokoll">
        <h2 className="mb-2 text-sm font-semibold">Was gespeichert würde ({protokoll.length})</h2>
        {protokoll.length === 0 && <p className="text-xs text-muted-foreground">Noch nichts. „Objekt erstellen“ im Schritt Medien schreibt hierher.</p>}
        <div className="space-y-2">
          {protokoll.map((e, i) => (
            <details key={i} className="rounded border p-2 text-xs">
              <summary className="cursor-pointer font-mono">{e.zeit} {e.was}</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(e.inhalt, null, 2)}</pre>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
