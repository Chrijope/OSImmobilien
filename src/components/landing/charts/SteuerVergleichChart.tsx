import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";

/**
 * „Dieselbe Summe, zwei Verwendungen."
 *
 * Beide Säulen sind gleich hoch (455.659 € über zehn Jahre). Links fließt
 * alles als Steuer ab, rechts wird ein Teil zu Eigentum. Genau das ist die
 * Kernaussage der Seite — hier als Bild statt als Satz.
 *
 * Form: gestapelter Balken (Teil-zum-Ganzen). Farbe nach dem Prinzip
 * „Emphasis": eine Serie trägt die Aussage (Blau), der Rest ist Kontext (Grau).
 * Palette gegen die Sechs-Checks validiert; wegen des Kontrast-Hinweises sind
 * die Segmente direkt beschriftet statt nur farbcodiert.
 */

const STEUER = "#8a8f98"; // Kontext-Grau
const EIGENTUM = "#1A85FF"; // Markenblau, die Aussage

const SteuerVergleichChart = () => {
  const t = useSeitenTexte(MIKROSEITE_TEXTE).steuerVergleich;
  const daten = [
    { name: t.ohneImmobilie, steuer: 455659, eigentum: 0 },
    { name: t.mitImmobilie, steuer: 387431, eigentum: 68227 },
  ];
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-sm md:text-base font-semibold text-[hsl(30,8%,16%)]">
        {t.titel}
      </figcaption>
      <p className="mb-5 text-xs md:text-sm text-[hsl(220,10%,46%)]">
        {t.text}
      </p>

      {/* Legende, bei zwei Serien immer vorhanden */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs md:text-sm">
        <span className="inline-flex items-center gap-2 text-[hsl(220,10%,46%)]">
          <span className="w-3 h-3 rounded-sm" style={{ background: STEUER }} />
          {t.abgefuehrt}
        </span>
        <span className="inline-flex items-center gap-2 text-[hsl(220,10%,46%)]">
          <span className="w-3 h-3 rounded-sm" style={{ background: EIGENTUM }} />
          {t.umgewandelt}
        </span>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={daten} margin={{ top: 8, right: 8, bottom: 4, left: 8 }} barCategoryGap="28%">
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: "hsl(40,15%,88%)" }}
              tick={{ fill: "hsl(220,10%,46%)", fontSize: 13 }}
            />
            <YAxis hide domain={[0, 470000]} />
            {/* 2px Flächenlücke zwischen den Segmenten statt Rahmen */}
            <Bar dataKey="steuer" stackId="a" fill={STEUER} maxBarSize={96} radius={[0, 0, 0, 0]}>
              <LabelList
                dataKey="steuer"
                position="center"
                formatter={t.tausend}
                style={{ fill: "#fff", fontSize: 13, fontWeight: 600 }}
              />
            </Bar>
            <Bar dataKey="eigentum" stackId="a" fill={EIGENTUM} maxBarSize={96} radius={[4, 4, 0, 0]}>
              {daten.map((d, i) => (
                <Cell key={i} stroke="#fff" strokeWidth={2} />
              ))}
              <LabelList
                dataKey="eigentum"
                position="top"
                formatter={(v: number) => (v > 0 ? t.eigentumPlus(v) : "")}
                style={{ fill: EIGENTUM, fontSize: 13, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-xs text-[hsl(220,10%,46%)]">
        {t.fussnote}
      </p>
    </figure>
  );
};

export default SteuerVergleichChart;
