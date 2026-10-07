import { Users, RefreshCw, AlertCircle } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PhaseStep } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesEhegattenschaukel() {
  return (
    <UnterlagenDetailLayout
      title="Ehegattenschaukel"
      subtitle="Steueroptimiert AfA-Volumen erneuern – nach Ablauf der 10-Jahres-Frist"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateEhegattenschaukelPDF();
      }}
      pdfLabel="Komplette PDF herunterladen"
      quellen={[
        { titel: "§ 23 EStG – Spekulationsfrist bei privaten Veräußerungsgeschäften", url: "https://www.gesetze-im-internet.de/estg/__23.html" },
        { titel: "BFH-Urteil IX R 8/22 – AfA-Bemessungsgrundlage nach Verkauf", url: "https://www.bundesfinanzhof.de" },
        { titel: "Haufe Steuer-Office: Ehegattenschaukel", url: "https://www.haufe.de" },
        { titel: "BMF-Schreiben zu § 42 AO (Gestaltungsmissbrauch)", hinweis: "Achten auf eindeutigen wirtschaftlichen Gehalt" },
      ]}
    >
      <SectionCard title="Was ist die Ehegattenschaukel?" icon={<RefreshCw className="h-5 w-5" />}>
        <p>
          Nach Ablauf der <strong>10-jährigen Spekulationsfrist</strong> (§ 23 EStG) kann eine vermietete
          Immobilie <strong>steuerfrei zwischen Ehepartnern verkauft</strong> werden. Der erwerbende Ehepartner
          setzt dabei den <strong>aktuellen Marktpreis als neue Anschaffungskosten</strong> an – und kann auf
          diesen höheren Wert erneut <strong>volle AfA</strong> über die nächsten Jahrzehnte geltend machen.
        </p>
        <p className="text-muted-foreground text-xs">
          Der Begriff „Schaukel" stammt daher, dass die Immobilie zwischen den Ehepartnern hin- und hergegeben werden
          kann (alle 10 Jahre wiederholbar) – jeweils mit erneuerter steuerlicher Bemessungsgrundlage.
        </p>
      </SectionCard>

      <SectionCard title="Konkrete Beispielrechnung">
        <div className="bg-muted/40 border border-border rounded p-4 space-y-1 text-sm">
          <div className="font-semibold mb-2 text-primary">Ausgangslage:</div>
          <div className="flex justify-between"><span>Kaufpreis 2014:</span><span>250.000 €</span></div>
          <div className="flex justify-between"><span>Davon Gebäudeanteil (80 %):</span><span>200.000 €</span></div>
          <div className="flex justify-between"><span>AfA 2 % p.a.:</span><span>4.000 €/Jahr</span></div>
          <div className="flex justify-between text-muted-foreground"><span>AfA-Restvolumen nach 10 Jahren:</span><span>160.000 €</span></div>

          <div className="font-semibold mt-4 mb-2 text-primary">Verkauf an Ehepartner 2024:</div>
          <div className="flex justify-between"><span>Marktpreis:</span><span>410.000 €</span></div>
          <div className="flex justify-between"><span>Davon Gebäudeanteil (80 %):</span><span>328.000 €</span></div>
          <div className="flex justify-between font-semibold text-primary"><span>Neue AfA 2 % p.a.:</span><span>6.560 €/Jahr</span></div>

          <div className="border-t border-border mt-3 pt-3 flex justify-between text-base">
            <span className="font-bold">Mehr AfA pro Jahr:</span>
            <span className="font-bold text-primary">+ 2.560 €</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Bei Spitzensteuersatz 42 %: ca. <strong>1.075 € mehr Netto pro Jahr</strong> – über 50 Jahre = 53.760 €.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Voraussetzungen & Ablauf" icon={<Users className="h-5 w-5" />}>
        <div className="space-y-5">
          <PhaseStep num={1} titel="10-Jahres-Frist abgelaufen" text="Zwischen Anschaffung und Verkauf an den Ehepartner müssen mindestens 10 Jahre liegen (§ 23 EStG). Frist beginnt mit dem Datum des notariellen Kaufvertrags." />
          <PhaseStep num={2} titel="Marktpreis ermitteln" text="Realistischer Verkehrswert durch Sachverständigen-Gutachten oder Maklerwertermittlung. Der Wert muss fremdüblich sein – sonst erkennt das Finanzamt den Verkauf nicht an." />
          <PhaseStep num={3} titel="Notarieller Kaufvertrag" text="Echter Kaufvertrag mit Kaufpreiszahlung (auch via Darlehen vom Ehepartner möglich). Grundbuchänderung muss erfolgen. Grunderwerbsteuer entfällt zwischen Ehegatten (§ 3 Nr. 4 GrEStG)." />
          <PhaseStep num={4} titel="Neue AfA-Bemessungsgrundlage ansetzen" text="Der erwerbende Ehepartner setzt den vollen Kaufpreis (abzüglich Grundstücksanteil) als neue Bemessungsgrundlage in seiner Anlage V an. Auch neue Sonder-AfA-Möglichkeiten sind prüfbar." />
        </div>
      </SectionCard>

      <SectionCard title="Achtung: Gestaltungsmissbrauch (§ 42 AO)" icon={<AlertCircle className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>Der Verkauf muss <strong>tatsächlich vollzogen</strong> werden – inklusive Kaufpreiszahlung und Grundbucheintrag.</li>
          <li>Der Kaufpreis muss <strong>fremdüblich</strong> sein (kein Schein-Verkauf zu Niedrigpreis).</li>
          <li>Bei Eigenfinanzierung über ein Ehegatten-Darlehen: marktübliche Zinsen und schriftliche Verträge.</li>
          <li>Das Finanzamt akzeptiert die Schaukel grundsätzlich, wenn alle formalen Anforderungen erfüllt sind (siehe BFH IX R 8/22).</li>
          <li>Wiederholung: Die Schaukel kann nach weiteren 10 Jahren erneut durchgeführt werden („Pendelschaukel").</li>
        </ul>
      </SectionCard>

      <SectionCard title="Wann ist die Schaukel besonders attraktiv?">
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>Hoher persönlicher Grenzsteuersatz (≥ 42 %)</li>
          <li>Starker Wertzuwachs der Immobilie zwischen Erstkauf und Schaukel-Verkauf</li>
          <li>Beide Ehepartner mit hohem Einkommen → Mehrfach-Effekt durch wechselnden Eigentümer</li>
          <li>Geplante langfristige Vermietung (mindestens weitere 10-15 Jahre)</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
