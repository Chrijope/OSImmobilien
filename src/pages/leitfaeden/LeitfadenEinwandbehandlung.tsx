import { UnterlagenDetailLayout } from "@/components/unterlagen/UnterlagenDetailLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { OS_EINWAENDE, OS_FUENF_SCHRITTE, OS_GRENZEN, OS_VORWAND_TEST } from "@/lib/osEinwaende";

const generateEinwandbehandlungPDF = async () => {
  const m = await import("@/lib/unterlagenPdfContent");
  await m.generateEinwandbehandlungPDF();
};

/**
 * Leitfaden Einwandbehandlung nach dem OS-Handbuch (Stand 15.10.2026).
 *
 * Bis zum 16.10.2026 zeigte diese Seite die Einwand-Bibliothek des
 * Ursprungsprojekts. Die Bibliothek bleibt in der Vertriebsakademie; hier
 * stehen nur noch die 15 Einwände des Handbuchs mit Kernsatz, Belegen und
 * dem, was wir nie sagen.
 */
export default function LeitfadenEinwandbehandlung() {
  return (
    <UnterlagenDetailLayout
      title="Einwandbehandlung"
      subtitle="Die 15 häufigsten Einwände bei vermieteten Kapitalanlage-Wohnungen, nach dem OS-Handbuch."
      onDownloadPdf={generateEinwandbehandlungPDF}
      pdfLabel="Als PDF"
      quellen={[
        { titel: "OS Real Estate: Handbuch Einwandbehandlung, Stand 15.10.2026", hinweis: "Intern" },
        { titel: "BGB §§ 556d, 558, 559", hinweis: "Mietpreisbremse, Kappungsgrenze, Modernisierungsumlage" },
        { titel: "EStG § 7 Abs. 4 und Abs. 5a", hinweis: "Lineare und degressive AfA" },
      ]}
    >
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold">Die fünf Schritte</p>
          <ol className="grid gap-2 sm:grid-cols-5">
            {OS_FUENF_SCHRITTE.map((s, i) => (
              <li key={s.schritt} className="rounded-md border p-2 text-xs">
                <span className="font-semibold">{i + 1}. {s.schritt}</span>
                <span className="mt-1 block text-muted-foreground">{s.ziel}</span>
              </li>
            ))}
          </ol>
          <p className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-semibold">Vorwand-Test: </span>„{OS_VORWAND_TEST}“
          </p>
          <p className="text-xs text-muted-foreground">
            Grenzen: {OS_GRENZEN.map((g) => `${g.thema} an ${g.verweis}`).join(" · ")}
          </p>
        </Card>

        <Accordion type="multiple" className="space-y-2">
          {OS_EINWAENDE.map((e) => (
            <AccordionItem key={e.nr} value={String(e.nr)} className="rounded-lg border px-3">
              <AccordionTrigger className="text-left text-sm">
                <span>
                  <span className="mr-2 text-muted-foreground">{e.nr}</span>
                  „{e.einwand}“
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="rounded-md border-l-4 border-primary bg-primary/5 p-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kernsatz</span>
                  „{e.kernsatz}“
                </p>
                <p><span className="font-semibold">Nachfrage: </span>„{e.nachfrage}“</p>
                <div>
                  <p className="font-semibold">Belege</p>
                  <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                    {e.belege.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
                <p><span className="font-semibold">Zustimmung: </span>„{e.zustimmung}“</p>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Das sagen wir nie</p>
                  <ul className="ml-4 list-disc text-xs">
                    {e.nie.map((n) => <li key={n}>„{n}“</li>)}
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </UnterlagenDetailLayout>
  );
}
