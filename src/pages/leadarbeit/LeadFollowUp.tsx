import { Repeat, Phone, MessageCircle, AlertTriangle } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PullQuote } from "@/components/unterlagen/UnterlagenDetailLayout";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

export default function LeadFollowUp() {
  return (
    <UnterlagenDetailLayout
      title="Follow-Up-Strategie & Nachfass-Rhythmus"
      subtitle="So holst du Leads ab, die nicht beim ersten Versuch ans Telefon gehen"
    >
      <SectionCard title={`Dranbleiben bis zum ${MAX_KONTAKTVERSUCHE}. Versuch`} icon={<Repeat className="h-5 w-5" />}>
        <p>
          80 % aller Erfolge passieren <strong>nicht beim ersten Versuch</strong>. Wer nach einem ersten „Nicht erreicht"
          aufgibt, verschenkt den Großteil seines Lead-Werts. Deshalb lässt das CRM bis zu{" "}
          <strong>{MAX_KONTAKTVERSUCHE} dokumentierte Kontaktversuche</strong> zu und steuert die Abstände selbst:
        </p>
        <PullQuote>
          Acht von zehn Abschlüssen liegen jenseits des ersten Anrufs. Wer dort aufhört, verschenkt sein Geschäft.
        </PullQuote>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-4 text-xs">
          {[
            { tag: "1. Versuch", zeit: "4 Stunden", kanal: "Lead kommt am selben Tag zurück" },
            { tag: "2. bis 4. Versuch", zeit: "bis morgen 09:00 Uhr", kanal: "Wiedervorlage am Vormittag" },
            { tag: "5. bis 10. Versuch", zeit: "48 Stunden", kanal: "jeder zweite Tag" },
            { tag: "11. bis 14. Versuch", zeit: "72 Stunden", kanal: "letzte Runde" },
          ].map((s, i) => (
            <div key={i} className="rounded-lg border bg-muted/30 p-3">
              <div className="font-bold text-primary">{s.tag}</div>
              <div className="text-muted-foreground">{s.zeit}</div>
              <div className="mt-1 font-medium">{s.kanal}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Während der Wartezeit ist der Lead ausgeblendet. Du brauchst keine eigene Wiedervorlage: Er taucht von
          selbst wieder auf, sobald er dran ist. Kombiniere jeden erfolglosen Anruf mit einer kurzen WhatsApp.
        </p>
      </SectionCard>

      <SectionCard title="Multi-Kanal: Anruf + WhatsApp" icon={<MessageCircle className="h-5 w-5" />}>
        <p>
          Kombiniere immer <strong>Anruf und WhatsApp</strong>. Nach jedem nicht erfolgreichen Anruf folgt sofort
          eine kurze persönliche Nachricht. Das verdoppelt die Rückrufquote.
        </p>
        <div className="bg-muted/40 border-l-4 border-primary/40 rounded p-4 mt-3 text-sm italic">
          „Hallo {`{Vorname}`}, habe gerade versucht dich zu erreichen. Kein Stress – ich melde mich morgen früh
          noch einmal. Falls es dir gerade gut passt, einfach kurz zurückrufen. Beste Grüße, {`{VP-Vorname}`}"
        </div>
      </SectionCard>

      <SectionCard title="Der Nicht-Erreicht-Zähler" icon={<Phone className="h-5 w-5" />}>
        <p>
          Im Kundenprofil siehst du in den <strong>Stammdaten</strong> live, wie oft der Lead bereits kontaktiert
          wurde und mit welchem Ausgang (Mailbox, Termin vereinbart, Kein Interesse, Rückruf erbeten…). Genau
          dieselben Felder, die früher nur die Setterin hatte, siehst jetzt auch du als VP.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Sobald die <strong>Selbstauskunft unterschrieben</strong> im System liegt, werden diese
          Nicht-Erreicht-Felder in den Stammdaten automatisch ausgeblendet – ab dann ist der Kunde im aktiven Prozess
          und die Kontaktversuche sind nicht mehr relevant.
        </p>
      </SectionCard>

      <SectionCard title={'Automatischer „Lost"-Trigger'} icon={<AlertTriangle className="h-5 w-5" />}>
        <p>
          Erst nach <strong>{MAX_KONTAKTVERSUCHE} dokumentierten Anrufversuchen ohne Erfolg</strong> wechselt der Lead
          automatisch auf {'„verloren"'}, mit dem Grund {'„mehrfach nicht erreicht"'}. Das schützt deine Pipeline vor
          Karteileichen und triggert die DSGVO-konforme Verarbeitung. Es zählen nur dokumentierte Versuche: Wer den
          Gesprächsausgang nicht setzt, hält den Lead künstlich am Leben.
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}