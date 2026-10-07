import { Phone, MessageSquare, ClipboardCheck, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UnterlagenDetailLayout, SectionCard, PullQuote } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function LeadErstkontakt() {
  return (
    <UnterlagenDetailLayout
      title="Erstkontakt-Skript & Qualifizierung"
      subtitle="So führst du den ersten Anruf – und qualifizierst gleichzeitig sauber"
    >
      <SectionCard title="Das Erstgesprächs-Skript ist im Kundenprofil hinterlegt" icon={<ClipboardCheck className="h-5 w-5" />}>
        <p>
          Jeder Lead, der dir zugewiesen wird, bringt im Kundenprofil bereits den vollständigen <strong>Erstgesprächs-
          Leitfaden</strong> mit. Du musst nichts auswendig lernen – du arbeitest das Skript direkt am Bildschirm ab und
          dokumentierst alle Antworten live im Profil.
        </p>
        <PullQuote>
          Du verkaufst im Erstkontakt nicht die Immobilie. Du verkaufst den nächsten Termin.
        </PullQuote>
        <div className="mt-3">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/kontakte">
              <Target className="h-4 w-4" /> Zu meinen Kontakten
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Praxis-Tipp: Öffne das Kundenprofil <strong>vor</strong> dem Anruf. Begrüßungssatz, Qualifizierungsfragen und
          Terminvorschlag stehen dort in der richtigen Reihenfolge.
        </p>
      </SectionCard>

      <SectionCard title="BANT – die vier Qualifizierungs-Achsen" icon={<Target className="h-5 w-5" />}>
        <p>
          Im Erstgespräch prüfst du implizit vier Dimensionen. Du musst sie nicht im Frage-Antwort-Stil abhaken – das
          Skript führt dich automatisch durch:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-bold text-primary mb-1">B – Budget</div>
            <p>Haushaltsnetto, vorhandenes Eigenkapital, freie Rate – passt das Volumen zu einer OS Immobilien-Wohnung?</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-bold text-primary mb-1">A – Authority</div>
            <p>Wer entscheidet mit? Partner/Ehepartner gleich mit ins Beratungsgespräch nehmen.</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-bold text-primary mb-1">N – Need</div>
            <p>Was ist der Treiber? Steuern sparen, Altersvorsorge, Vermögensaufbau, Inflationsschutz?</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-bold text-primary mb-1">T – Timeline</div>
            <p>Wann will der Lead konkret starten? „Sofort", „in 3 Monaten", „erstmal informieren" – beeinflusst die
            Schlagzahl beim Follow-Up.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Erwartungsmanagement: Termin statt Verkauf" icon={<Phone className="h-5 w-5" />}>
        <p>
          Ziel des Erstkontakts ist <strong>nicht der Abschluss</strong>, sondern ein fester Termin für das
          <strong> Beratungsgespräch</strong> (in der Regel 60–90 Min, online oder vor Ort). Wer im Erstkontakt
          verkauft, verliert den Lead.
        </p>
        <div className="bg-primary/5 border border-primary/20 rounded p-4 mt-3 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">Zielsatz am Ende des Erstkontakts</div>
          <p className="italic">
            „Das passt sehr gut zusammen. Ich schlage vor, wir nehmen uns 60 Minuten Zeit, gehen deine Zahlen
            gemeinsam durch und ich zeige dir, wie eine konkrete Lösung für dich aussehen kann. Wie sieht es
            bei dir am {`{Tag}`} um {`{Uhrzeit}`} aus?"
          </p>
        </div>
      </SectionCard>

      <SectionCard title={'Disqualifikation – früh „Nein" sagen schützt die Pipeline'} icon={<MessageSquare className="h-5 w-5" />}>
        <p>
          Nicht jeder Lead passt. Wenn Bonität, Einkommen oder Mindset offensichtlich nicht zu einer
          Kapitalanlage-Immobilie passen, darfst und sollst du den Lead direkt sauber verabschieden. Das spart dir
          Wochen Follow-Up – und dem Lead falsche Hoffnungen.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Im CRM markierst du den Lead als <strong>{'„nicht passend"'}</strong> mit kurzer Begründung. So lernt das System
          und die Lead-Qualität wird über Zeit besser.
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}