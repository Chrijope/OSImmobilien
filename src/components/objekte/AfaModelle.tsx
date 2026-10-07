/**
 * Weitere Abschreibungsmodelle neben der linearen AfA.
 *
 * Der AfA-Rechner kannte bisher nur einen Satz pro Jahr. Für den Vertrieb von
 * Kapitalanlage-Immobilien sind aber gerade die anderen Modelle das
 * Verkaufsargument: die degressive AfA beim Neubau, die Sonderabschreibung
 * nach § 7b und die Denkmal-AfA. Diese Karte stellt sie nebeneinander und
 * zeigt den Jahresverlauf, nicht nur einen Prozentsatz.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EuroInput } from "@/components/ui/euro-input";
import { Info, Layers } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BEWEGLICH_NUTZUNGSDAUER,
  DEGRESSIV_BAUBEGINN_BIS,
  DEGRESSIV_BAUBEGINN_VON,
  DEGRESSIV_SATZ,
  SONDER_7B_BAUKOSTEN_MAX,
  SONDER_7B_BEMESSUNG_MAX,
  SONDER_7B_JAHRE,
  beweglichVerlauf,
  degressivMoeglich,
  degressiverVerlauf,
  denkmalVerlauf,
  linearerAfaSatz,
  type DenkmalModell,
} from "@/lib/afaSaetze";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

const JAHRE_ANZEIGE = 15;

interface Props {
  /** AfA-Bemessungsgrundlage Gebäude aus dem Rechner oben. */
  bemessungsgrundlage: number;
  baujahr: number;
  wohnflaeche: number;
  /** Linearer Satz, den der Rechner oben angesetzt hat. */
  linearSatz: number;
}

export function AfaModelle({ bemessungsgrundlage, baujahr, wohnflaeche, linearSatz }: Props) {
  const [baubeginn, setBaubeginn] = useState("");
  const [sonder7b, setSonder7b] = useState(false);
  const [denkmalAktiv, setDenkmalAktiv] = useState(false);
  const [denkmalModell, setDenkmalModell] = useState<DenkmalModell>("vermietet");
  const [sanierungsanteil, setSanierungsanteil] = useState(0);
  const [beweglichWert, setBeweglichWert] = useState(0);
  const [beweglichArt, setBeweglichArt] = useState(BEWEGLICH_NUTZUNGSDAUER[0].key);

  const gesetzlich = linearerAfaSatz(baujahr, "wohnen");
  const degressivErlaubt = degressivMoeglich(baubeginn);

  const verlauf = useMemo(() => {
    const basis = Math.max(0, bemessungsgrundlage);
    const satz = linearSatz > 0 ? linearSatz : gesetzlich.satz;

    const linear = Array.from({ length: JAHRE_ANZEIGE }, (_, i) => ({
      jahr: i + 1,
      betrag: basis * (satz / 100),
    }));

    const degressiv = degressivErlaubt ? degressiverVerlauf(basis, JAHRE_ANZEIGE, satz, DEGRESSIV_SATZ) : [];

    // Die Sonderabschreibung läuft neben der linearen AfA, nicht statt ihrer.
    const sonderProJahr =
      sonder7b && wohnflaeche > 0
        ? Math.min(basis, SONDER_7B_BEMESSUNG_MAX * wohnflaeche) * 0.05
        : 0;

    const denkmal = denkmalAktiv ? denkmalVerlauf(sanierungsanteil, denkmalModell) : [];
    const beweglich = beweglichWert > 0
      ? beweglichVerlauf(
          beweglichWert,
          BEWEGLICH_NUTZUNGSDAUER.find((b) => b.key === beweglichArt)?.jahre ?? 10,
        )
      : [];

    return Array.from({ length: JAHRE_ANZEIGE }, (_, i) => ({
      name: `J${i + 1}`,
      linear: Math.round(linear[i]?.betrag ?? 0),
      degressiv: Math.round(degressiv[i]?.betrag ?? 0),
      sonder7b: Math.round(i < SONDER_7B_JAHRE ? sonderProJahr : 0),
      denkmal: Math.round(denkmal[i]?.betrag ?? 0),
      beweglich: Math.round(beweglich[i]?.betrag ?? 0),
      gewechselt: degressiv[i]?.gewechselt,
    }));
  }, [
    bemessungsgrundlage,
    linearSatz,
    gesetzlich.satz,
    degressivErlaubt,
    sonder7b,
    wohnflaeche,
    denkmalAktiv,
    denkmalModell,
    sanierungsanteil,
    beweglichWert,
    beweglichArt,
  ]);

  const baukostenJeQm = wohnflaeche > 0 ? bemessungsgrundlage / wohnflaeche : 0;
  const sonder7bMoeglich = wohnflaeche > 0 && baukostenJeQm <= SONDER_7B_BAUKOSTEN_MAX;
  const wechselJahr = verlauf.find((v) => v.gewechselt)?.name;

  const summeErste = (feld: keyof (typeof verlauf)[number], jahre: number) =>
    verlauf.slice(0, jahre).reduce((s, v) => s + (Number(v[feld]) || 0), 0);

  return (
    <Card className="p-5">
      <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" /> Weitere Abschreibungsmodelle
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Die lineare AfA ist der Regelfall. Je nach Objekt kommen weitere Modelle dazu oder an ihre Stelle. Alle Zahlen
        beziehen sich auf die Bemessungsgrundlage von {fmt(bemessungsgrundlage)} aus der Berechnung oben.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Degressive AfA ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Degressive AfA</p>
              <p className="text-[11px] text-muted-foreground">
                § 7 Abs. 5a EStG, {DEGRESSIV_SATZ} % vom Restbuchwert
              </p>
            </div>
          </div>
          <div>
            <Label className="text-xs">Baubeginn</Label>
            <Input
              type="date"
              value={baubeginn}
              onChange={(e) => setBaubeginn(e.target.value)}
              className="h-8 mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Möglich bei Baubeginn zwischen dem{" "}
              {new Date(DEGRESSIV_BAUBEGINN_VON).toLocaleDateString("de-DE")} und dem{" "}
              {new Date(DEGRESSIV_BAUBEGINN_BIS).toLocaleDateString("de-DE")}.
            </p>
          </div>
          {baubeginn && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                degressivErlaubt
                  ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5"
                  : "border-border bg-muted/40"
              }`}
            >
              {degressivErlaubt ? (
                <>
                  <p className="text-foreground font-medium">
                    Erstes Jahr {fmt(verlauf[0].degressiv)} statt {fmt(verlauf[0].linear)} linear.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    In den ersten fünf Jahren zusammen {fmt(summeErste("degressiv", 5))} gegenüber{" "}
                    {fmt(summeErste("linear", 5))}.
                    {wechselJahr && ` Wechsel zur linearen AfA in ${wechselJahr}.`}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Der Baubeginn liegt außerhalb des Förderzeitraums, die degressive AfA ist hier nicht möglich.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Sonderabschreibung 7b ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Sonderabschreibung Mietwohnungsneubau</p>
              <p className="text-[11px] text-muted-foreground">
                § 7b EStG, 5 % zusätzlich in den ersten {SONDER_7B_JAHRE} Jahren
              </p>
            </div>
            <Switch checked={sonder7b} onCheckedChange={setSonder7b} />
          </div>
          {sonder7b && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                sonder7bMoeglich ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5" : "border-destructive/30 bg-destructive/5"
              }`}
            >
              {wohnflaeche <= 0 ? (
                <p className="text-muted-foreground">Für die Prüfung wird die Wohnfläche gebraucht.</p>
              ) : !sonder7bMoeglich ? (
                <p className="text-muted-foreground">
                  Baukosten je m²: {fmt(baukostenJeQm)}. Damit ist die Obergrenze von{" "}
                  {fmt(SONDER_7B_BAUKOSTEN_MAX)} je m² gerissen und die Förderung entfällt vollständig, sie wird
                  nicht gekürzt.
                </p>
              ) : (
                <>
                  <p className="text-foreground font-medium">
                    {fmt(verlauf[0].sonder7b)} pro Jahr, zusammen {fmt(verlauf[0].sonder7b * SONDER_7B_JAHRE)}.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Baukosten je m²: {fmt(baukostenJeQm)}. Bemessungsgrundlage höchstens{" "}
                    {fmt(SONDER_7B_BEMESSUNG_MAX)} je m². Setzt ein Effizienzhaus 40 mit QNG-Siegel voraus.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Denkmal ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Denkmal und Sanierungsgebiet</p>
              <p className="text-[11px] text-muted-foreground">§ 7i und § 7h EStG, bei Eigennutzung § 10f EStG</p>
            </div>
            <Switch checked={denkmalAktiv} onCheckedChange={setDenkmalAktiv} />
          </div>
          {denkmalAktiv && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Sanierungsanteil (€)</Label>
                  <EuroInput value={sanierungsanteil} onChange={setSanierungsanteil} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Nutzung</Label>
                  <Select value={denkmalModell} onValueChange={(v) => setDenkmalModell(v as DenkmalModell)}>
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vermietet">vermietet (§ 7i / § 7h)</SelectItem>
                      <SelectItem value="eigengenutzt">eigengenutzt (§ 10f)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {sanierungsanteil > 0 && (
                <div className="rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 p-3 text-xs">
                  {denkmalModell === "vermietet" ? (
                    <p className="text-muted-foreground">
                      Acht Jahre je {fmt(sanierungsanteil * 0.09)}, danach vier Jahre je {fmt(sanierungsanteil * 0.07)}.
                      Zusammen {fmt(sanierungsanteil)}, also der volle Sanierungsanteil in zwölf Jahren. Der Altbauanteil
                      läuft daneben mit {gesetzlich.satz.toLocaleString("de-DE")} % weiter.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Zehn Jahre je {fmt(sanierungsanteil * 0.09)} als Sonderausgaben, zusammen{" "}
                      {fmt(sanierungsanteil * 0.9)}. Die restlichen 10 % bleiben Eigenanteil, der Altbauanteil ist bei
                      Eigennutzung nicht absetzbar.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bewegliche Wirtschaftsgüter ── */}
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold">Bewegliche Wirtschaftsgüter</p>
            <p className="text-[11px] text-muted-foreground">
              Getrennt vom Gebäude über die amtliche AfA-Tabelle abzuschreiben
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Anschaffungskosten (€)</Label>
              <EuroInput value={beweglichWert} onChange={setBeweglichWert} className="h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Art</Label>
              <Select value={beweglichArt} onValueChange={setBeweglichArt}>
                <SelectTrigger className="h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BEWEGLICH_NUTZUNGSDAUER.map((b) => (
                    <SelectItem key={b.key} value={b.key}>
                      {b.label} · {b.jahre} Jahre
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {beweglichWert > 0 && (
            <p className="text-xs text-muted-foreground">
              {fmt(verlauf[0].beweglich)} pro Jahr über{" "}
              {BEWEGLICH_NUTZUNGSDAUER.find((b) => b.key === beweglichArt)?.jahre} Jahre.
            </p>
          )}
        </div>
      </div>

      <Separator className="my-5" />

      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
        Jahresverlauf der Abschreibung
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={verlauf} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => Math.round(v / 1000).toLocaleString("de-DE") + "k"}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v: number, n: string) => [
              fmt(v),
              { linear: "Linear", degressiv: "Degressiv", sonder7b: "§ 7b", denkmal: "Denkmal", beweglich: "Bewegliche WG" }[n] ?? n,
            ]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(n: string) =>
              ({ linear: "Linear", degressiv: "Degressiv", sonder7b: "§ 7b", denkmal: "Denkmal", beweglich: "Bewegliche WG" }[n] ?? n)
            }
            wrapperStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="linear" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
          {degressivErlaubt && <Bar dataKey="degressiv" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} />}
          {sonder7b && <Bar dataKey="sonder7b" stackId="a" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />}
          {denkmalAktiv && <Bar dataKey="denkmal" stackId="a" fill="hsl(var(--warning))" radius={[3, 3, 0, 0]} />}
          {beweglichWert > 0 && <Bar dataKey="beweglich" stackId="a" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground mt-2 flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        Die degressive AfA steht alternativ zur linearen und ist deshalb als eigener Balken dargestellt. § 7b, Denkmal
        und bewegliche Wirtschaftsgüter kommen zur linearen AfA hinzu und sind gestapelt.
      </p>
    </Card>
  );
}

export default AfaModelle;
