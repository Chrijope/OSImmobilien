import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, CalendarPlus, ArrowLeft } from "lucide-react";
import { WeeklyCallPunkte } from "@/components/dashboard/WeeklyCallPunkte";
import { aktuellerWeeklyCall, downloadIcs } from "@/components/dashboard/WeeklyCallCard";
import { ZOOM_URL, callRundenFuer, callZeitenText } from "@/lib/weeklyCallZeit";
import { useUser } from "@/contexts/UserContext";

/**
 * Die Punkte für den Weekly Sales Call auf einer eigenen Seite.
 *
 * Im Dashboard steht nur noch ein Knopf hierher. Eingabe, Liste und die
 * Rückschau auf frühere Calls brauchen Platz, die Karte im Dashboard soll
 * kurz bleiben.
 *
 * Je Call eine eigene Liste: Lead-Berater sehen den 19:00-Call, Vertriebspartner
 * den 19:30-Call, die Leitung beide untereinander.
 */
export default function WeeklyCall() {
  const { user } = useUser();
  const runden = callRundenFuer(user.role, user.rollenVariante);
  const call = aktuellerWeeklyCall(runden);
  const datum = call?.start.toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Der Weg hierher fuehrt ueber die Karte im Dashboard, also auch zurueck. */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zum Dashboard
        </Link>

        <PageHeader
          title="Weekly Sales Call"
          subtitle={
            call
              ? `Nächster Termin: ${datum}, ${callZeitenText(runden)}`
              : "Der Weekly Sales Call ist für Vertriebspartner, Lead-Berater und die Vertriebsleitung."
          }
        >
          <Button variant="outline" className="gap-2" disabled={!call} onClick={() => downloadIcs(runden)}>
            <CalendarPlus className="h-4 w-4" /> In Kalender eintragen
          </Button>
          <Button className="gap-2" onClick={() => window.open(ZOOM_URL, "_blank", "noopener")}>
            <Video className="h-4 w-4" /> Jetzt einwählen
          </Button>
        </PageHeader>

        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Trag hier ein, was du im nächsten Call besprechen möchtest. Alle Teilnehmer deines
          Calls sehen die Liste, aber niemand sieht, von wem ein Punkt stammt. Genau das ist der Zweck:
          Jeder weiß vorher, worum es geht, und Themen sollen hochkommen, die sonst niemand
          anspricht. Deinen eigenen Punkt erkennst du am Kennzeichen „von mir“, und nur du
          kannst ihn ändern oder löschen. Aufzeichnung und Unterlagen eines Calls sind für
          alle einsehbar.
        </p>

        {runden.map((runde, i) => (
          <Card key={runde} className="max-w-3xl p-4">
            <WeeklyCallPunkte runde={runde} mitProtokoll={i === 0} />
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
