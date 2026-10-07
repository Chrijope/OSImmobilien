import { Clock, Zap, Phone, MessageCircle } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PullQuote } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function Lead24hRegel() {
  return (
    <UnterlagenDetailLayout
      title="24-h-Regel: Warum Speed alles entscheidet"
      subtitle="Reaktionszeit ist der größte Conversion-Hebel im Lead-Geschäft"
      quellen={[
        { titel: 'Harvard Business Review – „The Short Life of Online Sales Leads"', hinweis: "Conversion-Rate sinkt um Faktor 7, wenn nicht innerhalb der ersten Stunde reagiert wird." },
        { titel: "InsideSales / Velocify – Lead Response Management Study", hinweis: "Anrufe innerhalb der ersten 5 Minuten konvertieren 21× besser als nach 30 Minuten." },
      ]}
    >
      <SectionCard title="Warum 24 Stunden die absolute Schmerzgrenze sind" icon={<Zap className="h-5 w-5" />}>
        <p>
          Ein Lead, der sich gerade aktiv auf eine Werbeanzeige eingetragen hat, ist <strong>heiß</strong>.
          Er erwartet einen Rückruf – oft sogar <em>sofort</em>. Verstreicht zu viel Zeit, kühlt das Interesse spürbar ab,
          und parallel laufen oft Mitbewerber, Bekannte oder einfach der Alltag dazwischen.
        </p>
        <PullQuote author="Harvard Business Review">
          Die ersten fünf Minuten sind hundertmal wertvoller als die ersten fünf Stunden.
        </PullQuote>
        <p>
          Studien zeigen: Wer innerhalb von <strong>einer Stunde</strong> reagiert, hat eine bis zu <strong>7× höhere
          Abschlussrate</strong> als jemand, der erst nach 24 Stunden zurückruft. Nach 48 Stunden ist der Lead in den
          meisten Fällen kalt – die Wahrscheinlichkeit eines Erstgesprächs fällt unter 10 %.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Ideal</div>
            <div className="text-2xl font-bold text-foreground mt-1">&lt; 1 Stunde</div>
            <p className="text-xs text-muted-foreground mt-1">Höchste Conversion. Der Lead ist mental noch im Thema.</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Gut</div>
            <div className="text-2xl font-bold text-foreground mt-1">&lt; 6 Stunden</div>
            <p className="text-xs text-muted-foreground mt-1">Noch warm. Erwartungshaltung ist erfüllt.</p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Spätestens</div>
            <div className="text-2xl font-bold text-foreground mt-1">&lt; 24 Stunden</div>
            <p className="text-xs text-muted-foreground mt-1">Schmerzgrenze. Danach ist der Lead in der Regel kalt.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Warum der Lead diese Geschwindigkeit erwartet" icon={<Clock className="h-5 w-5" />}>
        <p>
          Der Lead hat sich <strong>aktiv und freiwillig</strong> auf eine Werbeanzeige eingetragen – meist mit dem
          Gedanken: „Mal sehen, was kommt." Genau in diesem Moment ist die Aufmerksamkeit maximal und der innere
          Trigger („Ich will Vermögen aufbauen / Steuern sparen") frisch.
        </p>
        <p>
          Erwartungshaltung des Leads: <strong>„Der ruft mich an."</strong> Wer nicht innerhalb weniger Stunden reagiert,
          enttäuscht still – und der Lead erinnert sich nicht mehr genau, wo er sich eingetragen hat.
        </p>
      </SectionCard>

      <SectionCard title="Wochenend- & Abend-Leads richtig handhaben" icon={<MessageCircle className="h-5 w-5" />}>
        <p>
          Leads kommen rund um die Uhr – auch abends, an Feiertagen und Wochenenden. Die 24-h-Regel gilt trotzdem.
          Für Zeiten, in denen ein Anruf nicht passt, nutze die <strong>WhatsApp-Brücke</strong>:
        </p>
        <div className="bg-primary/5 border border-primary/20 rounded p-4 mt-3 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">WhatsApp-Vorlage „Brücke"</div>
          <p className="italic text-foreground/90 whitespace-pre-line">
            „Hallo {`{Vorname}`}, hier ist {`{VP-Vorname}`} von MOREImmo. Ich habe gerade deine Anfrage zur
            Kapitalanlage-Immobilie erhalten – vielen Dank für dein Interesse! Es ist jetzt etwas spät für einen Anruf,
            ich melde mich morgen früh zwischen 9 und 10 Uhr bei dir. Passt das so für dich? – Beste Grüße,
            {`{VP-Vorname}`}"
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-semibold mb-1">Samstag</div>
            <p>Wenn möglich, <strong>direkt anrufen</strong> – Samstagsleads sind besonders heiß. Falls Anruf nicht
            möglich: WhatsApp-Brücke senden und am Montag früh nachfassen.</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="font-semibold mb-1">Sonntag</div>
            <p>Sonntag bewusst <strong>kein Anruf</strong>. Eine kurze WhatsApp-Bestätigung reicht. Montag früh
            ist Prime-Time für den Erstkontakt.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Anrufbeantworter-Skript (15-Sekunden-Voicemail)" icon={<Phone className="h-5 w-5" />}>
        <p>Wenn der Lead nicht abnimmt, hinterlässt du in <strong>maximal 15 Sekunden</strong> Folgendes:</p>
        <div className="bg-muted/40 border-l-4 border-primary/40 rounded p-4 mt-3 text-sm italic">
          „Hallo {`{Vorname}`}, hier ist {`{VP-Vorname}`} von MOREImmo. Du hattest dich zur Kapitalanlage-Immobilie
          informiert – vielen Dank dafür. Ich versuche es gleich noch einmal, ansonsten freue ich mich, wenn du
          zurückrufst unter {`{Rufnummer}`}. Beste Grüße!"
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Direkt im Anschluss: WhatsApp-Nachricht mit Bezug auf die Voicemail senden („Habe gerade auf der Mailbox
          gesprochen, melde mich gerne nochmal …"). Multi-Kanal verdoppelt die Rückrufquote.
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}