import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/contexts/UserContext";
import { useCacheReady } from "@/hooks/useCacheReady";
import { getInvestments } from "@/lib/investmentsStore";
import { getKontakte } from "@/lib/kundenStore";
import { loadAllUsers } from "@/lib/loadAllUsers";
import {
  STATUS_TEXT, fristAmpel, kennzahlenJeFinanzierer, ladeEinreichungen, laeuft, type Einreichung,
} from "@/lib/finanzierungEinreichung";

/**
 * Finanzierungen auf einen Blick (Christian, 27.10.2026): Zeilen sind Kunden,
 * Spalten Finanzierer, jede Zelle zeigt den Stand und seit wann. Darunter die
 * Kennzahlen je Finanzierer, die nur Admin und Inhaber sehen.
 *
 * Zugang: admin, inhaber, backoffice (`FINANZIERUNGEN_ROUTE`).
 */

const eur = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const tageSeit = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

const ZELLE: Record<string, string> = {
  eingereicht: "bg-muted", in_pruefung: "bg-primary/10", rueckfrage: "bg-[hsl(var(--warning))]/15",
  angebot: "bg-[hsl(var(--success))]/10", zuschlag: "bg-[hsl(var(--success))]/25",
  abgelehnt: "bg-destructive/10", abgesagt: "", zurueckgezogen: "",
};
const AMPEL: Record<string, string> = { rot: "bg-destructive", gelb: "bg-[hsl(var(--warning))]", gruen: "bg-[hsl(var(--success))]" };

/** Notartermin minus 14 Tage: bis dahin muss die Finanzierung stehen (Christian, 27.10.2026). */
function finanzierungBis(notarTermin?: string): string {
  if (!notarTermin) return "";
  const d = new Date(`${notarTermin.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - 14);
  return d.toLocaleDateString("de-DE");
}

export default function Finanzierungen() {
  const navigate = useNavigate();
  const { user } = useUser();
  const cacheBereit = useCacheReady();
  const [liste, setListe] = useState<Einreichung[] | null>(null);
  const [nurLaufende, setNurLaufende] = useState(true);

  useEffect(() => {
    ladeEinreichungen().then(setListe).catch((f) => {
      console.error("[Finanzierungen]", f);
      setListe([]);
    });
  }, []);

  const namen = useMemo(() => new Map(loadAllUsers().map((u) => [u.id, u.name || "Unbekannt"])), [cacheBereit]);

  const zeilen = useMemo(() => {
    if (!liste) return [];
    const investments = new Map(getInvestments().map((i) => [i.id, i]));
    const kontakte = new Map(getKontakte().map((k) => [k.id, k]));
    const jeInvestment = new Map<string, Einreichung[]>();
    for (const e of liste) jeInvestment.set(e.investment_id, [...(jeInvestment.get(e.investment_id) || []), e]);
    return [...jeInvestment.entries()]
      .filter(([, eigene]) => !nurLaufende || eigene.some((e) => laeuft(e)))
      .map(([investmentId, eigene]) => {
        const inv = investments.get(investmentId);
        const k = inv ? kontakte.get(inv.kontaktId) : undefined;
        return {
          investmentId,
          kontaktId: inv?.kontaktId,
          kunde: k ? `${k.vorname} ${k.nachname}`.trim() : "Unbekannt",
          objekt: [inv?.objektTitel, inv?.weNr ? `WE ${String(inv.weNr).replace(/^WE\s*/i, "")}` : ""].filter(Boolean).join(", "),
          finanzierungBis: finanzierungBis(inv?.notarTermin),
          eigene,
          ueberfaellig: eigene.some((e) => fristAmpel(e) === "rot"),
        };
      })
      .sort((a, b) => Number(b.ueberfaellig) - Number(a.ueberfaellig) || a.kunde.localeCompare(b.kunde));
  }, [liste, nurLaufende, cacheBereit]);

  const finanzierer = useMemo(() => [...new Set((liste || []).map((e) => e.finanzierer_id))], [liste]);
  const kennzahlen = useMemo(() => kennzahlenJeFinanzierer(liste || []), [liste]);
  const zeigeKennzahlen = user.role === "admin" || user.role === "inhaber";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Finanzierungen" subtitle="Einreichungen bei Finanzierern, Stand und Fristen" />

        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="nur-laufende" checked={nurLaufende} onCheckedChange={setNurLaufende} />
            <label htmlFor="nur-laufende" className="text-sm">Nur laufende Finanzierungen</label>
          </div>
          {!liste ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : zeilen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Einreichungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Kunde</th>
                    <th className="py-2 pr-4 font-medium">Finanzierung bis</th>
                    {finanzierer.map((id) => <th key={id} className="py-2 pr-4 font-medium whitespace-nowrap">{namen.get(id) || "Unbekannt"}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z) => (
                    <tr key={z.investmentId} className="border-t align-top cursor-pointer hover:bg-muted/40"
                      onClick={() => z.kontaktId && navigate(`/kunden/${z.kontaktId}?tab=investments&investment=${z.investmentId}#finanzierung`)}>
                      <td className="py-2 pr-4">
                        <span className="font-medium">{z.kunde}</span>
                        {z.objekt && <span className="block text-xs text-muted-foreground">{z.objekt}</span>}
                      </td>
                      <td className="py-2 pr-4 text-xs whitespace-nowrap">{z.finanzierungBis || "kein Notartermin"}</td>
                      {finanzierer.map((id) => {
                        const e = z.eigene.find((x) => x.finanzierer_id === id);
                        if (!e) return <td key={id} className="py-2 pr-4 text-xs text-muted-foreground">nicht eingereicht</td>;
                        const ampel = fristAmpel(e);
                        const seit = e.entschieden_am || e.angebot_am || e.gesichtet_am || e.eingereicht_am;
                        return (
                          <td key={id} className="py-2 pr-4">
                            <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs ${ZELLE[e.status]}`}>
                              {ampel && <span className={`w-2 h-2 rounded-full ${AMPEL[ampel]}`} />}
                              {STATUS_TEXT[e.status]}
                            </span>
                            <span className="block text-xs text-muted-foreground mt-0.5">seit {tageSeit(seit)} Tagen</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Ampel: rot heißt Angebotsfrist überschritten, gelb heißt Frist heute oder morgen. Überfällige Finanzierer werden werktags morgens automatisch erinnert.
          </p>
        </div>

        {zeigeKennzahlen && kennzahlen.length > 0 && (
          <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
            <h2 className="font-semibold">Kennzahlen je Finanzierer</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    {["Finanzierer", "Eingereicht", "Laufend", "Ø Reaktionszeit", "Angebotsquote", "Zusagequote", "Bester Effektivzins", "Finanzierungsvolumen"].map((k) => (
                      <th key={k} className="py-2 pr-4 font-medium whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kennzahlen.map((k) => (
                    <tr key={k.finanziererId} className="border-t">
                      <td className="py-2 pr-4 font-medium">{namen.get(k.finanziererId) || "Unbekannt"}</td>
                      <td className="pr-4">{k.eingereicht}</td>
                      <td className="pr-4">{k.laufend}</td>
                      <td className="pr-4 whitespace-nowrap">{k.reaktionStunden === null ? "–" : k.reaktionStunden < 48 ? `${Math.round(k.reaktionStunden)} Std.` : `${(k.reaktionStunden / 24).toFixed(1).replace(".", ",")} Tage`}</td>
                      <td className="pr-4">{k.angebotsquote === null ? "–" : `${Math.round(k.angebotsquote * 100)} %`}</td>
                      <td className="pr-4">{k.zusagequote === null ? "–" : `${Math.round(k.zusagequote * 100)} %`}</td>
                      <td className="pr-4">{k.besterEffektivzins === null ? "–" : `${k.besterEffektivzins.toLocaleString("de-DE")} %`}</td>
                      <td className="pr-4 whitespace-nowrap">{eur(k.volumen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Reaktionszeit: Einreichung bis zum ersten Öffnen. Angebotsquote: Angebote je Einreichung, ohne zurückgezogene. Zusagequote: Zuschläge je Angebot. Volumen: Darlehenssummen mit Zuschlag.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
