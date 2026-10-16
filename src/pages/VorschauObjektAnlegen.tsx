import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ObjektNeu from "./ObjektNeu";

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

function SchlichterRahmen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>;
}

export default function VorschauObjektAnlegen() {
  const [, setStand] = useState(0);
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
      <ObjektNeu Rahmen={SchlichterRahmen} />
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
