/**
 * Lokale Vorschau der Handbuch-Seite im OS-Konzept, /vorschau/handbuch-entwurf.
 * Nur `npm run dev` (siehe vorschauRouten.ts), ohne Anmeldung.
 *
 * Bis zur Freigabe am 17.10.2026 stand hier der Entwurf. Seit dem Umbau
 * öffnet die Seite das echte Handbuch: Antworten wählen, dann geht es mit
 * diesen Antworten auf /handbuch/ergebnis/neu, wie direkt nach dem
 * Konfigurator. Nichts wird gespeichert, kein Lead entsteht.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FRAGEN, type HandbuchAntworten } from "../../supabase/functions/_shared/handbuch-funnel.ts";
import type { HandbuchErgebnisZustand } from "@/pages/HandbuchLanding";
import VorschauHandbuchErgebnisEntwurf from "./VorschauHandbuchErgebnisEntwurf";

const BEISPIEL: HandbuchAntworten = {
  ziel: "steuer",
  beruf: "angestellt",
  brutto: "80_120",
  ueberschuss: "1000_1500",
  eigenkapital: "30_60",
  start: "drei_monate",
};

export default function VorschauHandbuchEntwurf() {
  const [a, setA] = useState<HandbuchAntworten>(BEISPIEL);
  const navigate = useNavigate();
  const oeffnen = () => {
    const zustand: HandbuchErgebnisZustand = {
      antworten: a,
      vorname: "Jonas",
      nachname: "Beispiel",
      handbuchToken: null,
      saToken: null,
      beraterSlug: null,
    };
    navigate("/handbuch/ergebnis/neu", { state: zustand });
  };
  return (
    <div className="min-h-screen bg-background text-foreground p-6" data-lg="seite">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-2xl font-semibold">Vorschau Handbuch-Seite</h1>
        <p className="text-sm text-muted-foreground">
          Lokal, ohne Anmeldung. Absenden auf der echten Strecke klappt hier nicht, weil keine Datenbank angebunden ist.
        </p>
        <p className="flex gap-4 text-sm">
          <Link className="underline" to="/handbuch">
            Landingpage
          </Link>
          <Link className="underline" to="/handbuch/konfigurator">
            Konfigurator
          </Link>
        </p>
        {FRAGEN.map((f) => (
          <label key={f.schluessel} className="block text-sm">
            <span className="font-medium">{f.frage}</span>
            <select
              className="mt-1 block w-full rounded-md border bg-background p-2"
              value={a[f.schluessel]}
              onChange={(e) => setA({ ...a, [f.schluessel]: e.target.value })}
            >
              {f.antworten.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.text}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!a.gemeinsamVeranlagt} onChange={(e) => setA({ ...a, gemeinsamVeranlagt: e.target.checked })} />
          gemeinsam veranlagt
        </label>
        <button type="button" onClick={oeffnen} className="rounded-full bg-primary text-primary-foreground px-6 h-11 font-semibold">
          Handbuch für Jonas Beispiel öffnen
        </button>
      </div>
      {/* Entwurf vom 17.10.2026 zur Freigabe: neue Ergebnisseite, rechnet mit den Antworten oben. */}
      <div className="mt-10 -mx-6">
        <VorschauHandbuchErgebnisEntwurf a={a} vorname="Jonas" />
      </div>
    </div>
  );
}
