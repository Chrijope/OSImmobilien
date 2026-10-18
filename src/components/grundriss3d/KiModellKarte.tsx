import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { Grundriss3dBlock } from "./Grundriss3dBlock";
import { erkenneGrundriss, kiAuftragEinheit, kiAuftraegeObjekt, kiGemerkt, kiMerken, type KiAuftrag } from "./kiErkennung";
import { nebeneinander } from "./kiPlan";
import type { Grundriss3dPlan } from "./plan";

/*
 * Reiter „KI-Modell“ (18.10.2026, Christian): direkt hinter „3D-Modell“, zum
 * Vergleich. Liest die Grundrisspläne immer neu per KI aus, unabhängig davon,
 * ob es schon ein 3D-Modell gibt, und baut daraus das Modell. Nichts davon
 * landet in der Datenbank oder im Exposé; das Ergebnis merkt sich nur der
 * Browser, damit nicht jedes Öffnen erneut KI-Kosten auslöst.
 */

/** Gleichzeitige Anfragen: schnell genug für ein Haus, ohne die KI auszubremsen. */
const PARALLEL = 3;

type Stand = { art: "wartet" } | { art: "laeuft" } | { art: "fertig"; plan: Grundriss3dPlan } | { art: "fehler"; text: string };

function KiModell({ titel, auftraege, leer }: { titel: string; auftraege: KiAuftrag[]; leer: string }) {
  const [stand, setStand] = useState<Record<string, Stand>>({});
  const [lauf, setLauf] = useState(0);
  const schluessel = auftraege.map((a) => a.schluessel).join("|");

  useEffect(() => {
    let aktiv = true;
    const offen: KiAuftrag[] = [];
    const start: Record<string, Stand> = {};
    for (const a of auftraege) {
      const plan = kiGemerkt(a.schluessel);
      if (plan) start[a.schluessel] = { art: "fertig", plan };
      else { start[a.schluessel] = { art: "wartet" }; offen.push(a); }
    }
    setStand(start);
    const setze = (s: string, x: Stand) => { if (aktiv) setStand((alt) => ({ ...alt, [s]: x })); };
    const arbeiter = async () => {
      for (let a = offen.shift(); a && aktiv; a = offen.shift()) {
        setze(a.schluessel, { art: "laeuft" });
        try {
          const e = await erkenneGrundriss(a.quelle, a.wohnung);
          kiMerken(a.schluessel, e.plan);
          setze(a.schluessel, { art: "fertig", plan: e.plan });
        } catch (f) {
          setze(a.schluessel, { art: "fehler", text: f instanceof Error ? f.message : String(f) });
        }
      }
    };
    for (let i = 0; i < PARALLEL; i++) void arbeiter();
    return () => { aktiv = false; };
    // `schluessel` fasst die Aufträge zusammen; `lauf` startet „Neu erkennen“.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, lauf]);

  const einheiten = useMemo(() => nebeneinander(auftraege.flatMap((a) => {
    const s = stand[a.schluessel];
    return s?.art === "fertig" ? [{ plan: s.plan, titel: a.titel }] : [];
  })), [auftraege, stand]);
  const werte = Object.values(stand);
  const laeuft = werte.filter((s) => s.art === "wartet" || s.art === "laeuft").length;
  const fehler = auftraege.flatMap((a) => { const s = stand[a.schluessel]; return s?.art === "fehler" ? [{ titel: a.titel, text: s.text }] : []; });
  const neu = () => { for (const a of auftraege) kiMerken(a.schluessel, null); setLauf((l) => l + 1); };

  return (
    <Card className="p-6" data-testid="ki-modell">
      <div className="mb-3 h-1 w-8 bg-primary" />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-bold"><Sparkles className="h-4 w-4" /> {titel}</h3>
        {auftraege.length > 0 && (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={laeuft > 0} onClick={neu}>
            <RefreshCw className="h-3.5 w-3.5" /> Neu erkennen
          </Button>
        )}
      </div>
      {!auftraege.length ? (
        <p className="text-sm text-muted-foreground">{leer}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Automatisch per KI aus {auftraege.length === 1 ? "dem Grundriss" : `${auftraege.length} Grundrissplänen`} gebaut, zum Vergleich mit dem Reiter „3D-Modell“.
            {auftraege.length > 1 && " Wo eine Einheit im Geschoss liegt, steht in keinem Einzelplan; je Geschoss liegen die Pläne darum nebeneinander."}
            {" "}Nur zur Ansicht, nichts davon geht ins Exposé.
          </p>
          {laeuft > 0 && (
            <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {auftraege.length - laeuft} von {auftraege.length} erkannt. Je Plan dauert es etwa eine halbe Minute.
            </p>
          )}
          {fehler.length > 0 && (
            <ul className="mb-3 space-y-0.5 text-xs text-destructive">
              {fehler.map((f) => <li key={f.titel}>{f.titel}: {f.text}</li>)}
            </ul>
          )}
          {einheiten.length > 0 && <Grundriss3dBlock einheiten={einheiten} hoehe="voll" />}
        </>
      )}
    </Card>
  );
}

export function EinheitKiModellKarte({ objekt, wohnung }: { objekt: ObjektData; wohnung: ObjektWohnung }) {
  const auftrag = useMemo(() => kiAuftragEinheit(objekt, wohnung), [objekt, wohnung]);
  const auftraege = useMemo(() => (auftrag ? [auftrag] : []), [auftrag]);
  return <KiModell titel="Grundriss per KI" auftraege={auftraege} leer="Diese Einheit hat keinen eigenen Grundriss in den Unterlagen. Lade ihn unter „Dokumente“ hoch (Name mit „Grundriss“), dann entsteht hier das Modell." />;
}

export function ObjektKiModellKarte({ objekt }: { objekt: ObjektData }) {
  const auftraege = useMemo(() => kiAuftraegeObjekt(objekt), [objekt]);
  return <KiModell titel="Haus per KI" auftraege={auftraege} leer="Weder das Objekt noch eine Einheit hat einen Grundriss in den Unterlagen." />;
}
