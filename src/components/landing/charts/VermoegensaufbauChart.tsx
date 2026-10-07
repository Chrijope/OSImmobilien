import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

/**
 * Vermögensaufbau über zehn Jahre.
 *
 * Gestapelte Fläche aus den beiden Bestandteilen, die am Ende den
 * Verkaufserlös ergeben: getilgte Schulden und Wertsteigerung.
 * Zusammen 165.616 € — aus 30.800 € eingesetztem Eigenkapital.
 *
 * Bewusst NICHT mitgestapelt: die Steuerersparnis. Sie fließt im Musterfall
 * bereits in die laufende Liquidität und würde hier doppelt gezählt. Lieber
 * eine kleinere, korrekte Zahl als eine große, die jemand nachrechnet.
 */

const TILGUNG = "#1A85FF"; // Markenblau
const WERT = "#1baf7a"; // Aqua, validiert gegen Blau (ΔE 22,9 normal)
const EINSATZ = 30800;

const daten = [
  { jahr: "2027", tilgung: 3689, wert: 8800 },
  { jahr: "2028", tilgung: 7520, wert: 17776 },
  { jahr: "2029", tilgung: 14368, wert: 26932 },
  { jahr: "2030", tilgung: 21447, wert: 36270 },
  { jahr: "2031", tilgung: 28765, wert: 45796 },
  { jahr: "2032", tilgung: 36332, wert: 55511 },
  { jahr: "2033", tilgung: 44156, wert: 65422 },
  { jahr: "2034", tilgung: 52245, wert: 75530 },
  { jahr: "2035", tilgung: 60610, wert: 85841 },
  { jahr: "2036", tilgung: 69258, wert: 96358 },
];

interface TipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

const Tip = ({ active, payload, label }: TipProps) => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).vermoegensaufbau;
  if (!active || !payload?.length) return null;
  const summe = payload.reduce((a, p) => a + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-[hsl(40,15%,88%)] bg-white px-3 py-2 shadow-[0_8px_28px_-8px_hsla(220,20%,14%,0.18)]">
      <div className="text-xs text-[hsl(220,10%,46%)] mb-1.5">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-[13px] text-[hsl(30,8%,16%)]">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto font-semibold tabular-nums">{t.voll(p.value)}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-[hsl(40,15%,88%)] flex text-[13px] font-semibold text-[hsl(30,8%,16%)]">
        {t.zusammen}
        <span className="ml-auto tabular-nums">{t.voll(summe)}</span>
      </div>
    </div>
  );
};

const VermoegensaufbauChart = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).vermoegensaufbau;
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-sm md:text-base font-semibold text-[hsl(30,8%,16%)]">
        {t.titel(165616)}
      </figcaption>
      <p className="mb-5 text-xs md:text-sm text-[hsl(220,10%,46%)]">
        {t.text}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs md:text-sm">
        <span className="inline-flex items-center gap-2 text-[hsl(220,10%,46%)]">
          <span className="w-3 h-3 rounded-sm" style={{ background: TILGUNG }} />
          {t.getilgt}
        </span>
        <span className="inline-flex items-center gap-2 text-[hsl(220,10%,46%)]">
          <span className="w-3 h-3 rounded-sm" style={{ background: WERT }} />
          {t.wertsteigerungLegende}
        </span>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={daten} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="gradTilgung" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TILGUNG} stopOpacity={0.22} />
                <stop offset="100%" stopColor={TILGUNG} stopOpacity={0.06} />
              </linearGradient>
              <linearGradient id="gradWert" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={WERT} stopOpacity={0.22} />
                <stop offset="100%" stopColor={WERT} stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(40,15%,90%)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="jahr"
              tickLine={false}
              axisLine={{ stroke: "hsl(40,15%,88%)" }}
              tick={{ fill: "hsl(220,10%,46%)", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={t.tausend}
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: "hsl(220,10%,46%)", fontSize: 12 }}
            />
            <Tooltip content={<Tip />} cursor={{ stroke: "hsl(220,10%,70%)", strokeWidth: 1 }} />
            <ReferenceLine
              y={EINSATZ}
              stroke="hsl(220,10%,55%)"
              strokeWidth={1}
              label={{
                value: t.eigenkapitalLinie(EINSATZ),
                position: "insideTopLeft",
                fill: "hsl(220,10%,46%)",
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="tilgung"
              name={t.getilgt}
              stackId="1"
              stroke={TILGUNG}
              strokeWidth={2}
              fill="url(#gradTilgung)"
            />
            <Area
              type="monotone"
              dataKey="wert"
              name={t.wertsteigerung}
              stackId="1"
              stroke={WERT}
              strokeWidth={2}
              fill="url(#gradWert)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-xs text-[hsl(220,10%,46%)]">
        {t.fussnote}
      </p>
    </figure>
  );
};

export default VermoegensaufbauChart;
