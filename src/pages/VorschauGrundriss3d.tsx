import { Suspense, lazy, useMemo, useState } from "react";
import { Grundriss3dBlock } from "@/components/grundriss3d/Grundriss3dBlock";
import { WE03_PLAN, WE03_PX_PRO_METER, beispielHaus } from "@/components/grundriss3d/beispielWe03";
import { gesamtFlaeche, qm, wohnflaeche, type Grundriss3dPlan } from "@/components/grundriss3d/plan";
import planBild from "./vorschauGrundriss3d/barfuss9-we03.jpg";

const Editor = lazy(() => import("@/components/grundriss3d/GrundrissEditor"));

/*
 * Lokale Vorschau 3D-Grundriss (16.10.2026): /vorschau/grundriss-3d. Nur im
 * Entwicklungsmodus (siehe vorschauRouten.ts), ohne Anmeldung und ohne
 * Datenbank. Beispiel ist Barfusstraße 9, WE 3, nachgezeichnet aus dem
 * Einzelgrundriss im Exposé (Seite 5). Speichern landet hier nur im Browser.
 */

type Reiter = "einheit" | "haus" | "expose" | "editor" | "neu";

const REITER: Array<{ id: Reiter; name: string }> = [
  { id: "einheit", name: "Einheitenseite (WE 03)" },
  { id: "haus", name: "Objektseite (Beispielhaus)" },
  { id: "expose", name: "Exposé" },
  { id: "editor", name: "Editor mit Plan" },
  { id: "neu", name: "Editor leer" },
];

const VORSCHAU_SCHLUESSEL = "vorschau-grundriss3d-we03";

function gespeicherterPlan(): Grundriss3dPlan {
  try {
    const roh = localStorage.getItem(VORSCHAU_SCHLUESSEL);
    if (roh) return { ...JSON.parse(roh), hintergrund: { url: planBild, pxProMeter: WE03_PX_PRO_METER } };
  } catch { /* nichts */ }
  return { ...WE03_PLAN, hintergrund: { url: planBild, pxProMeter: WE03_PX_PRO_METER } };
}

export default function VorschauGrundriss3d() {
  const [reiter, setReiter] = useState<Reiter>(() => (new URLSearchParams(location.search).get("reiter") as Reiter) || "einheit");
  const [plan, setPlan] = useState<Grundriss3dPlan>(gespeicherterPlan);
  const haus = useMemo(() => beispielHaus(), []);
  const einheit = useMemo(() => [{ plan, titel: "WE 03" }], [plan]);
  // Startwerte aus der Adresse, etwa ?stil=altbau&schnitt=1&modus=begehung (für Bildschirmfotos).
  const startwerte = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return {
      ...(q.get("stil") ? { stil: q.get("stil") as "modern" } : {}),
      ...(q.get("schnitt") ? { schnitt: true } : {}),
      ...(q.get("modus") ? { modus: q.get("modus") as "begehung" } : {}),
      ...(q.get("explosion") ? { explosion: Number(q.get("explosion")) } : {}),
      ...(q.get("wandhoehe") ? { wandhoehe: Number(q.get("wandhoehe")) } : {}),
    };
  }, []);

  const speichern = async (p: Grundriss3dPlan) => {
    localStorage.setItem(VORSCHAU_SCHLUESSEL, JSON.stringify({ ...p, hintergrund: undefined }));
    setPlan({ ...p, hintergrund: { url: planBild, pxProMeter: p.hintergrund?.pxProMeter ?? WE03_PX_PRO_METER } });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vorschau, nur lokal</p>
          <h1 className="text-2xl font-bold">3D-Grundriss</h1>
          <p className="text-sm text-muted-foreground">
            Barfusstraße 9, WE 3, 1. OG links. Nachgezeichnet aus dem Aufteilungsplan. Raumflächen zusammen {qm(gesamtFlaeche(plan))}, Wohnfläche mit halber Loggia {qm(wohnflaeche(plan))} (laut Exposé 72,32 m²).
          </p>
        </header>
        <nav className="flex flex-wrap gap-1">
          {REITER.map((r) => (
            <button key={r.id} type="button" onClick={() => setReiter(r.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${reiter === r.id ? "bg-primary text-primary-foreground" : "bg-white"}`}>{r.name}</button>
          ))}
        </nav>

        {reiter === "einheit" && (
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 font-bold">Grundriss in 3D</h2>
            <Grundriss3dBlock einheiten={einheit} hoehe={560} startwerte={startwerte} />
          </section>
        )}

        {reiter === "haus" && (
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-1 font-bold">Haus in 3D</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Beispiel: drei Geschosse mit je zwei Einheiten, alle aus dem WE-03-Plan (rechts gespiegelt). Das echte Haus ist anders geschnitten. Fassadenfarbe hier fest, im CRM aus dem Titelbild.
            </p>
            <Grundriss3dBlock einheiten={haus} hoehe={600} fassade="#d9c9a8" startwerte={startwerte} />
          </section>
        )}

        {reiter === "expose" && (
          <section className="rounded-xl border bg-white p-4" style={{ fontFamily: "Georgia, serif" }}>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">04 Grundriss</p>
            <h2 className="mb-4 text-2xl">Zwei Zimmer auf 72,32 m², 1. Obergeschoss im Vorderhaus.</h2>
            <img src={planBild} alt="Grundriss WE 3, wie im Exposé" className="mx-auto max-h-[520px] w-auto rounded border" />
            <p className="mt-2 text-xs text-muted-foreground">Einzelgrundriss aus der Aufteilungsplanung, nicht maßstäblich.</p>
            <div style={{ marginTop: 24 }}>
              <Grundriss3dBlock einheiten={einheit} kompakt hoehe={460} titel="Grundriss in 3D, zum Drehen mit der Maus" startwerte={startwerte} />
            </div>
          </section>
        )}

        {(reiter === "editor" || reiter === "neu") && (
          <section className="h-[86vh] rounded-xl border bg-white p-3">
            <Suspense fallback={<p className="text-sm">Editor wird geladen</p>}>
              {reiter === "editor"
                ? <Editor key="editor" start={plan} entwurfId="vorschau-we03" onSpeichern={speichern} titel="WE 03 (Beispiel)" />
                : <Editor key="neu" start={null} entwurfId="vorschau-neu" onSpeichern={async () => undefined} hintergrundVorschlag={planBild} titel="Neuer Plan" />}
            </Suspense>
          </section>
        )}
      </div>
    </div>
  );
}
