import { ShieldAlert, Mail, Users, Lock, FileWarning } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PullQuote } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function LeadFehlerDsgvo() {
  return (
    <UnterlagenDetailLayout
      title="Häufige Fehler & DSGVO-Stolpersteine"
      subtitle="Was du beim Umgang mit B2C-Leads nicht falsch machen darfst"
      quellen={[
        { titel: "DSGVO Art. 6 Abs. 1 lit. a – Einwilligung", url: "https://dsgvo-gesetz.de/art-6-dsgvo/" },
        { titel: "DSGVO Art. 7 – Bedingungen für die Einwilligung", url: "https://dsgvo-gesetz.de/art-7-dsgvo/" },
        { titel: "DSGVO Art. 17 – Recht auf Löschung", url: "https://dsgvo-gesetz.de/art-17-dsgvo/" },
        { titel: "UWG § 7 – Unzumutbare Belästigungen (Werbe-Cold-Calls/Mails)", url: "https://www.gesetze-im-internet.de/uwg_2004/__7.html" },
      ]}
    >
      <SectionCard title="Unsere Zielgruppe ist B2C – das ändert alles" icon={<Users className="h-5 w-5" />}>
        <p>
          OS Immobilien-Leads sind <strong>Privatpersonen</strong>. Bei B2C gelten die DSGVO und das UWG deutlich strenger
          als bei B2B. Werbliche Kontaktaufnahme ist <strong>nur mit dokumentierter Einwilligung</strong> zulässig.
        </p>
        <PullQuote author="DSGVO Art. 6">
          Ohne dokumentierte Einwilligung gibt es keine werbliche Ansprache. Punkt.
        </PullQuote>
        <p>
          Die gute Nachricht: <strong>Jeder Lead, der über unsere Landingpages, das Analysetool oder Meta zu uns
          kommt, hat das Werbe-Opt-In bereits aktiv gesetzt</strong>. Diese Einwilligung ist zentral dokumentiert –
          du musst dich darum nicht kümmern, sie liegt sauber im Lead.
        </p>
      </SectionCard>

      <SectionCard title="Was du NICHT tun darfst" icon={<ShieldAlert className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li><strong>Keine Cold-E-Mails ohne Opt-In.</strong> Nicht von privaten Kontakten oder anderen Quellen E-Mail-Adressen ins CRM einspielen und anschreiben.</li>
          <li><strong>Keine Cold-Calls bei Privatpersonen ohne ausdrückliche Einwilligung</strong> (§ 7 UWG).</li>
          <li><strong>Keine Lead-Daten extern speichern</strong> – nicht in private Notizen, nicht in eigene Excel-Listen, nicht in private E-Mail-Postfächer.</li>
          <li><strong>Keine Weitergabe</strong> von Lead-Daten an Dritte (auch nicht an Familie, Bekannte oder andere Berater außerhalb von OS Immobilien).</li>
          <li><strong>Keine Excel-Exports</strong> ohne konkreten geschäftlichen Anlass – generell läuft alles im CRM.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Duplikate & Lead-Klau vermeiden" icon={<FileWarning className="h-5 w-5" />}>
        <p>
          Vor jeder manuellen Kontakt-Anlage prüft das System automatisch auf Duplikate (Name + Telefon + E-Mail).
          Bekommst du einen Duplikat-Hinweis, klicke {'nicht auf „Trotzdem anlegen"'} – sondern öffne den bestehenden
          Kontakt und prüfe, wem er zugewiesen ist.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Ist der Kontakt einem Kollegen zugewiesen, sprich zuerst mit ihm bzw. dem Admin. Doppelzuweisungen
          sind ein Compliance-Verstoß.
        </p>
      </SectionCard>

      <SectionCard title="Lösch- & Auskunftsanfragen" icon={<Mail className="h-5 w-5" />}>
        <p>
          Wenn ein Lead per Mail, Telefon oder WhatsApp eine <strong>Löschung</strong> oder eine
          <strong> Auskunft nach Art. 15 DSGVO</strong> verlangt, leitest du das <strong>sofort an den Admin /
          Inhaber</strong> weiter (Helpdesk-Ticket oder direkte Mail). Reagiere nicht selbst inhaltlich – die
          DSGVO-Antwort muss zentral und fristgerecht erfolgen.
        </p>
      </SectionCard>

      <SectionCard title="Vertraulichkeit deines CRM-Zugangs" icon={<Lock className="h-5 w-5" />}>
        <p>
          Dein CRM-Zugang ist personalisiert. Keine Weitergabe von Login-Daten, kein {'„mal eben für jemanden mitnutzen"'}.
          Bei Verdacht auf Kompromittierung: sofort Admin informieren und Passwort wechseln.
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}