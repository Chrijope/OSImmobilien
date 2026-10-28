import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { openUnterlage } from "@/lib/storage";
import {
  STATUS_TEXT, angeboteNachZuschlag, ladeAngebotsVerlauf, ladeEinreichungen,
  type Einreichung, type VerlaufAngebot,
} from "@/lib/finanzierungEinreichung";

const eur = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const prozent = (v: number | string) => `${String(v).replace(".", ",")} %`;

/**
 * „Verlauf / andere Angebote“ in der Finanzierungskarte (Christian, 28.10.2026).
 *
 * Nach dem Zuschlag stehen in der Karte nur noch das gewonnene Angebot. Hier,
 * zugeklappt, stehen die uebrigen: die Angebote der anderen Finanzierer (aus
 * `finanzierung_einreichungen`) und die vorher von Hand eingetragenen
 * Angebote der Karte (aus `finanzierung_angebote_verlauf`). Geloescht wird
 * nichts. Was jemand sehen darf, entscheidet die Datenbank: Der Finanzierer
 * mit Zuschlag bekommt aus beiden Quellen keine fremde Zeile, der Abschnitt
 * bleibt fuer ihn leer und erscheint dann gar nicht.
 */
export function AngeboteVerlauf({ investmentId }: { investmentId: string }) {
  const [andere, setAndere] = useState<Einreichung[]>([]);
  const [archiv, setArchiv] = useState<VerlaufAngebot[]>([]);

  const laden = useCallback(() => {
    // Einzeln abfangen: Fehlt eine Quelle (Migration noch nicht da), bleibt die andere.
    ladeEinreichungen(investmentId).then((l) => setAndere(angeboteNachZuschlag(l).verlauf)).catch(() => setAndere([]));
    ladeAngebotsVerlauf(investmentId).then(setArchiv).catch(() => setArchiv([]));
  }, [investmentId]);
  useEffect(() => {
    laden();
    window.addEventListener("finanzierung-einreichung", laden);
    window.addEventListener("finanzierung-updated", laden);
    return () => {
      window.removeEventListener("finanzierung-einreichung", laden);
      window.removeEventListener("finanzierung-updated", laden);
    };
  }, [laden]);

  const anzahl = andere.length + archiv.length;
  if (anzahl === 0) return null;
  const namen = new Map(loadAllUsers().map((u) => [u.id, u.name || "Unbekannt"]));

  return (
    <details className="rounded-lg border px-4 py-2 text-sm" data-angebote-verlauf>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Verlauf / andere Angebote ({anzahl})
      </summary>
      <ul className="mt-2 divide-y">
        {andere.map((e) => {
          const a = e.angebot!;
          return (
            <li key={e.id} className="py-2 text-xs space-y-0.5">
              <p className="font-medium">{namen.get(e.finanzierer_id) || "Finanzierer"} · {a.bank} · {STATUS_TEXT[e.status]}</p>
              <p className="text-muted-foreground">
                {eur(a.summe)}, Sollzins {prozent(a.sollzins)}, effektiv {prozent(a.effektivzins)}, {a.zinsbindungJahre} J. Zinsbindung, Tilgung {prozent(a.tilgung)}
                {e.angebot_datei && (
                  <button className="ml-2 text-primary hover:underline inline-flex items-center gap-1" onClick={() => openUnterlage(e.angebot_datei)}>
                    <Download className="h-3 w-3" /> PDF
                  </button>
                )}
              </p>
            </li>
          );
        })}
        {archiv.map((v) => (
          <li key={v.id} className="py-2 text-xs space-y-0.5">
            <p className="font-medium">
              {v.angebot.label || "Angebot"}{v.angebot.bank ? ` · ${v.angebot.bank}` : ""} · von Hand eingetragen, beim Zuschlag am {new Date(v.archiviert_am).toLocaleDateString("de-DE")} in den Verlauf
            </p>
            <p className="text-muted-foreground">
              {[
                v.angebot.summe ? eur(Number(v.angebot.summe)) : "",
                v.angebot.zins ? `Zins ${prozent(v.angebot.zins)}` : "",
                v.angebot.tilgung ? `Tilgung ${prozent(v.angebot.tilgung)}` : "",
                v.angebot.laufzeit || "",
                v.angebot.anmerkungen || "",
              ].filter(Boolean).join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
