// Unsere Kultur
//
// Werte, Standards, Glaubenssätze, Feindbilder und Vision auf einer Seite,
// im ruhigen Stil der Beratungspräsentation: Kontrast und Typografie statt
// Bullet-Wüste. Alle Inhalte kommen aus dem zentralen Kultur-Modul.

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Loader2, Quote, ShieldAlert, Swords } from "lucide-react";
import {
  KULTUR_WERTE,
  KULTUR_STANDARDS,
  KULTUR_FEINDBILDER,
  KULTUR_GLAUBENSSAETZE,
  KULTUR_VISION,
  glaubenssatzDesTages,
} from "@/lib/kulturContent";

export default function Kultur() {
  const [ladePdf, setLadePdf] = useState(false);
  const heutigerSatz = glaubenssatzDesTages();
  const intern = KULTUR_FEINDBILDER.filter((f) => f.richtung === "intern");
  const extern = KULTUR_FEINDBILDER.filter((f) => f.richtung === "extern");

  const pdfHerunterladen = async () => {
    setLadePdf(true);
    try {
      const m = await import("@/lib/kulturManifestPdf");
      await m.generateKulturManifestPDF();
    } finally {
      setLadePdf(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Unsere Kultur"
          subtitle="Wofür wir stehen, worauf sich unsere Kunden verlassen können und wogegen wir antreten"
        >
          {/* Hauptaktion der Seite Unsere Kultur, deshalb Marken-Orange. */}
          <Button onClick={pdfHerunterladen} disabled={ladePdf} variant="brand" className="gap-2">
            {ladePdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Als PDF herunterladen
          </Button>
        </PageHeader>

        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Menschen vertrauen uns etwas an, das sie sich über Jahre erspart haben. Diese Seite hält
          fest, wie wir mit diesem Vertrauen umgehen. Nichts davon hängt an einer Wand, alles davon
          zeigt sich im Gespräch.
        </p>

        {/* Glaubenssatz des Tages */}
        <div className="rounded-3xl bg-[#080A0F] text-white p-8 md:p-12 relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(21,144,97,0.28) 0%, transparent 62%)",
            }}
          />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.24em] font-semibold" style={{ color: "#1ED28D" }}>
              Glaubenssatz des Tages
            </p>
            <p className="mt-4 text-2xl md:text-4xl font-light leading-snug tracking-tight max-w-3xl">
              „{heutigerSatz}"
            </p>
            <p className="mt-5 text-sm" style={{ color: "rgba(246,248,252,0.6)" }}>
              Für alle im Team derselbe Satz, jeden Tag ein anderer. Im Weekly Call darf man sich
              darauf beziehen.
            </p>
          </div>
        </div>

        {/* Werte */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Unsere Werte</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Vier Sätze, an denen wir uns messen lassen, wenn eine Entscheidung unbequem wird.
          </p>
          <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {KULTUR_WERTE.map((w, i) => (
              <Card key={w.titel} className="p-6">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-2">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="font-semibold text-lg">{w.titel}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{w.text}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Standards */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Unsere Standards</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Sechs Versprechen an die Menschen, die mit uns arbeiten. Fünf davon kann das System
            selbst nachhalten, und keines davon ist eine Empfehlung.
          </p>
          <div className="mt-6 space-y-3">
            {KULTUR_STANDARDS.map((s, i) => (
              <div data-ui="card"
                key={s.titel}
                className="flex items-start gap-4 rounded-xl border bg-card p-4"
              >
                <span className="text-sm font-semibold tabular-nums text-primary mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{s.titel}</p>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </div>
                {s.messbar && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded-full px-2.5 py-1 shrink-0">
                    im CRM messbar
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Glaubenssätze */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Unsere Glaubenssätze
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Sieben Sätze in Ich-Form für die Tage, an denen es nicht von allein läuft. Der Satz,
            der dir heute schwerfällt, ist meist der, den du heute brauchst.
          </p>
          <div className="mt-6 grid md:grid-cols-2 gap-3">
            {KULTUR_GLAUBENSSAETZE.map((satz) => (
              <div data-ui="card" key={satz} className="flex items-start gap-3 rounded-xl border bg-card p-5">
                <Quote className="h-4 w-4 mt-1 shrink-0 text-primary" />
                <p className="text-base md:text-lg font-medium leading-relaxed">{satz}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feindbilder */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Wogegen wir antreten
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Nie gegen Menschen, immer gegen Verhalten. Vier Gewohnheiten wollen wir uns selbst
            abgewöhnen, gegen zwei Dinge treten wir für unsere Kunden an.
          </p>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5" /> In uns selbst
              </p>
              {intern.map((f) => (
                <Card key={f.titel} className="p-5">
                  <p className="font-semibold">{f.titel}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
                </Card>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Swords className="h-3.5 w-3.5" /> Draußen, für unsere Kunden
              </p>
              {extern.map((f) => (
                <Card key={f.titel} className="p-5 border-primary/25 bg-primary/5">
                  <p className="font-semibold">{f.titel}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Vision */}
        <section className="rounded-3xl border-2 border-primary/25 bg-primary/5 p-8 md:p-10">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Ziele und Vision</h2>
          {KULTUR_VISION.entwurf && (
            <p className="mt-2 text-[11px] uppercase tracking-wide font-semibold text-amber-600 dark:text-amber-400">
              Entwurfsfassung, wird von der Geschäftsführung final formuliert
            </p>
          )}
          <p className="mt-4 text-lg md:text-xl font-light leading-relaxed">{KULTUR_VISION.satz}</p>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{KULTUR_VISION.warum}</p>
          <ul className="mt-5 space-y-2">
            {KULTUR_VISION.ziele.map((z) => (
              <li key={z} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-0.5">•</span>
                <span>{z}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
