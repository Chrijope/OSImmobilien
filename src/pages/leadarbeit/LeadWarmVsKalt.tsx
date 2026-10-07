import { Flame, Snowflake, Phone, MessageSquare, Copy, Check } from "lucide-react";
import { useState } from "react";
import { UnterlagenDetailLayout, SectionCard, PullQuote } from "@/components/unterlagen/UnterlagenDetailLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";

const WA_VORLAGEN: { titel: string; zweck: string; text: string }[] = [
  {
    titel: "Vorlage 1 – Erstkontakt / Wiedererkennung",
    zweck: "Direkt nach Lead-Eingang, wenn telefonisch nicht erreicht.",
    text: `Hallo {{vorname}}, hier ist {{vpName}} von MOREImmo. Du hattest dich zum Thema Vermögensaufbau mit Immobilien bei uns informiert. Ich wollte dir kurz persönlich Hallo sagen und schauen, wann es bei dir für ein 15-Minuten-Telefonat passt. Antworte einfach kurz hier – ich melde mich dann zuverlässig. 👋`,
  },
  {
    titel: "Vorlage 2 – Nutzen-Hook (Mehrwert vor Termin)",
    zweck: "Wenn keine Reaktion auf Erstnachricht nach 24–48h.",
    text: `Hi {{vorname}}, kurzer Gedanke: Die meisten Interessenten, mit denen ich spreche, unterschätzen wie stark Steuer + Tilgung beim Vermögensaufbau wirken. Ich habe dazu eine kostenfreie 15-Min-Analyse für dich – ohne Verkauf, nur Zahlen. Passt dir Mittwoch oder Donnerstag besser?`,
  },
  {
    titel: "Vorlage 3 – Reaktivierung (alter / kalter Lead)",
    zweck: "Für Leads > 7 Tage oder nach mehreren Nichterreichbar-Versuchen.",
    text: `Hallo {{vorname}}, du hattest dich vor einiger Zeit bei MOREImmo zum Thema Kapitalanlage-Immobilien gemeldet. Vieles hat sich seitdem am Markt verändert (Zinsen, Förderungen, AfA). Soll ich dir kurz zeigen, was das aktuell konkret für dich bedeuten würde? Eine kurze "ja" reicht. 👍`,
  },
  {
    titel: "Vorlage 4 – Letzter Versuch (Soft-Close)",
    zweck: 'Vor dem Verschieben auf "Lost" – freundlich, druckfrei.',
    text: `Hi {{vorname}}, ich will dich nicht zuspammen – das ist meine letzte Nachricht von meiner Seite. Falls das Thema Immobilie als Kapitalanlage für dich gerade nicht relevant ist, alles gut, dann lasse ich dich in Ruhe. Wenn doch, schreib einfach kurz "passt" zurück und ich melde mich. Beste Grüße, {{vpName}}`,
  },
];

function CopyBlock({ titel, zweck, text }: { titel: string; zweck: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Vorlage kopiert");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };
  return (
    <div data-ui="card" className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-semibold text-sm">{titel}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{zweck}</div>
        </div>
        <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded p-3 font-sans leading-relaxed">{text}</pre>
    </div>
  );
}

export default function LeadWarmVsKalt() {
  const { user } = useUser();
  const vpName = (user?.name || "").trim().split(/\s+/)[0] || "{{vpName}}";
  const vorlagen = WA_VORLAGEN.map((v) => ({
    ...v,
    text: v.text.split("{{vpName}}").join(vpName),
  }));
  return (
    <UnterlagenDetailLayout
      title="Warm vs. Kalt – richtig priorisieren"
      subtitle="Nicht jeder Lead ist gleich – die richtige Reihenfolge entscheidet"
    >
      <SectionCard title="Warme Leads: sofort Telefon" icon={<Flame className="h-5 w-5" />}>
        <p>Warme Leads kommen über Quellen, bei denen sich der Interessent <strong>aktiv und bewusst</strong> eingetragen hat:</p>
        <PullQuote>
          Nicht jeder Lead ist gleich. Die richtige Reihenfolge ist die unsichtbare Hälfte deines Umsatzes.
        </PullQuote>
        <ul className="space-y-1 mt-2 list-disc list-inside text-sm">
          <li>Vertriebspartner-Landingpage</li>
          <li>Analysetool (Vermögensanalyse)</li>
          <li>Empfehlung über bestehenden Kunden</li>
        </ul>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-4 mt-3 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1">
            <Phone className="h-3 w-3" /> Aktion
          </div>
          <p><strong>Sofort anrufen.</strong> Idealerweise innerhalb von 1 Stunde. Diese Leads erwarten den Anruf.</p>
        </div>
      </SectionCard>

      <SectionCard title="Kalte Leads: Brücke vor dem Anruf" icon={<Snowflake className="h-5 w-5" />}>
        <p>
          Kalte Leads sind solche, die dich noch nicht kennen oder bei denen die Eintragung sehr beiläufig erfolgt
          ist – z. B. Listenkauf, Messekontakt, sehr alte Anfragen. Hier kommst du mit einem direkten Anruf oft
          schlechter durch.
        </p>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded p-4 mt-3 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Aktion
          </div>
          <p>
            <strong>WhatsApp- oder E-Mail-Sequenz vorschalten</strong>, um Wiedererkennung zu erzeugen. Erst danach
            anrufen – die Quote steigt signifikant.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            WhatsApp-Vorlagen (Copy & Paste)
          </div>
          {vorlagen.map((v) => (
            <CopyBlock key={v.titel} {...v} />
          ))}
          <p className="text-xs text-muted-foreground">
            <code>{"{{vpName}}"}</code> wird automatisch mit deinem Namen (<strong>{vpName}</strong>) ersetzt.
            Den Platzhalter <code>{"{{vorname}}"}</code> vor dem Senden noch durch den Vornamen des Leads ersetzen.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Lead-Score im CRM – schneller priorisieren">
        <p>
          Im Kontakt siehst du oben einen <strong>Lead-Score-Indikator</strong> (heiß / warm / kalt). Er kombiniert
          Quelle, Aktualität und bisherige Interaktionen. So priorisierst du deine Tagesliste in Sekunden:
        </p>
        <ul className="space-y-1 mt-2 list-disc list-inside text-sm">
          <li><strong>Heiß:</strong> heute eingetragen, qualifizierte Quelle – jetzt anrufen.</li>
          <li><strong>Warm:</strong> 1–3 Tage alt – heute noch fertig bearbeiten.</li>
          <li><strong>Kalt:</strong> &gt; 7 Tage / mehrfach nicht erreicht – WhatsApp-Brücke + Reaktivierungsmail.</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}