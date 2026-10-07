import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { euro } from "@/components/statistiken/ControllerViews";
import { getCurrentUserId } from "@/lib/currentUser";
import { cacheGet } from "@/lib/dataCache";
import { einsatzfrist, ladeLeadPakete, paketZaehlung, type LeadPaketDaten } from "@/lib/leadPaketStore";
import { datumDe } from "./LeadPaketAuswahl";

/**
 * Die eigenen Leadpakete des Partners, nur lesend. Ohne Paket oder ohne
 * Migration erscheint nichts.
 */
export function LeadPaketKarte() {
  const [daten, setDaten] = useState<LeadPaketDaten | null>(null);
  useEffect(() => {
    let aktiv = true;
    void ladeLeadPakete().then((d) => { if (aktiv) setDaten(d); });
    return () => { aktiv = false; };
  }, []);

  const ich = getCurrentUserId();
  const pakete = (daten?.pakete || []).filter((p) => p.partner_id === ich);
  if (!daten || pakete.length === 0) return null;
  const kontakte = new Map(cacheGet<Record<string, any>>("kontakte").map((k) => [k.id, k]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{pakete.length === 1 ? "Dein Leadpaket" : "Deine Leadpakete"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {pakete.map((p) => {
          const z = paketZaehlung(p, daten.zuweisungen);
          const frist = einsatzfrist(p);
          const lieferungen = daten.zuweisungen.filter((w) => w.paket_id === p.id);
          return (
            <div key={p.id} className="space-y-1">
              <p className="font-medium">
                {p.anzahl} Leads für {euro(p.paketpreis)} netto, gebucht am {datumDe(p.erstellt_am)}
                {p.status === "beendet" && ", beendet"}
              </p>
              <p className="text-muted-foreground">
                Zahlungseingang {datumDe(p.bezahlt_am) || "offen"}, Freischaltung {datumDe(p.freigeschaltet_am) || "offen"},
                Einsatzfrist {frist ? `bis ${datumDe(frist.ende)}` : "beginnt mit Zahlung und Freischaltung"}
              </p>
              <p>
                Geliefert {z.geliefert} von {p.anzahl}, reklamiert {z.reklamiert}, davon ersetzt {z.ersetzt}, noch offen {z.offen}
              </p>
              {lieferungen.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-primary">Gelieferte Leads anzeigen</summary>
                  <ul className="mt-2 space-y-1">
                    {lieferungen.map((w) => {
                      const k = kontakte.get(w.kontakt_id);
                      const name = `${k?.vorname || ""} ${k?.nachname || ""}`.trim();
                      return (
                        <li key={w.id}>
                          {k ? <Link className="text-primary underline" to={`/kunden/${w.kontakt_id}`}>{name || "Ohne Namen"}</Link> : "Nicht mehr bei dir"}
                          {" "}am {datumDe(w.zugewiesen_am)}
                          {w.reklamiert_am && `, reklamiert am ${datumDe(w.reklamiert_am)}`}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
