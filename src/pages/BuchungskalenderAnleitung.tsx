import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Building2, Calendar, Clock, Video, Phone, Landmark, ExternalLink, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BuchungskalenderAnleitung() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <PageHeader title="Buchungskalender einrichten" subtitle="Schritt-für-Schritt-Anleitung für Calendly, Fantastical & Co." />

      <div className="max-w-4xl space-y-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Zurück zu den Einstellungen
        </Button>

        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-bold">Warum vier Buchungskalender?</h2>
          <p className="text-sm text-muted-foreground">
            Wir arbeiten mit vier klar getrennten Terminarten, einer je Etappe im Kundenweg. Jeden Buchungslink
            legst du einmalig in deinem Buchungskalender (z.&nbsp;B. Calendly oder Fantastical) an und hinterlegst
            ihn anschließend in deinen Einstellungen. Du musst nicht alle vier haben: Was du hinterlegst, taucht
            auf, der Rest bleibt einfach weg.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-2">
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-primary"><Phone className="h-4 w-4" /><span className="font-semibold">Erstgespräch · 15 bis 20 Min</span></div>
              <p className="text-xs text-muted-foreground">Telefonisches Kennenlernen. Link wird auf deiner persönlichen Landingpage angezeigt, Interessenten buchen sich dort selbst ein.</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-primary"><Video className="h-4 w-4" /><span className="font-semibold">Beratungsgespräch · 45 Min</span></div>
              <p className="text-xs text-muted-foreground">Der ausführliche Termin nach erfolgreichem Erstgespräch. Link wird im Erstgesprächs-Skript (Punkt 18) verlinkt, damit du direkt den nächsten Termin einbuchst.</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-primary"><Building2 className="h-4 w-4" /><span className="font-semibold">Objektgespräch · 60 Min</span></div>
              <p className="text-xs text-muted-foreground">Ein konkretes Objekt gemeinsam durchgehen. Link steht im Kundenprofil unter „Meeting erstellen".</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-primary"><Landmark className="h-4 w-4" /><span className="font-semibold">Finanzierungsgespräch · 60 Min</span></div>
              <p className="text-xs text-muted-foreground">Unterlagen, Konditionen und die Rate. Link steht ebenfalls im Kundenprofil unter „Meeting erstellen".</p>
            </div>
          </div>
          {/*
            Seit dem 21.09.2026 gibt es einen zweiten Weg, auf dem dieselben vier
            Kalender beim Kunden ankommen. Er gehoert hierher, sonst legt jemand
            die Ereignisse an und erfaehrt nie, wofuer sie sonst noch gut sind.
          */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-semibold mb-1">Alle vier auf einer Seite</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Im Kundenprofil kannst du unter „Meeting erstellen" statt eines nackten Kalenderlinks eine eigene
              Terminseite im Hausstil erzeugen. Der Kunde sieht dort alle Gespräche, für die du einen Link
              hinterlegt hast, wählt eines aus, bucht in deinem Kalender und bestätigt danach Datum und Uhrzeit.
              Damit steht der Termin sofort in seiner Akte, ohne dass du ihn nachträgst.
            </p>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold">Schritt 1: Buchungskalender wählen</h2>
          <p className="text-sm text-muted-foreground">
            Du kannst jedes Tool verwenden, das einen öffentlich teilbaren Buchungslink ausgibt. Bewährt haben sich:
          </p>
          <ul className="text-sm space-y-2">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /><span><strong>Calendly</strong>: Der kostenlose Tarif erlaubt nur einen Eventtyp. Für mehrere brauchst du den Tarif „Standard".</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /><span><strong>Fantastical</strong>: „Openings" anlegen, mehrere Eventtypen sind schon im Basistarif möglich.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /><span><strong>Cal.com, TidyCal, SavvyCal, Microsoft Bookings</strong>: funktionieren ebenfalls.</span></li>
          </ul>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Schritt 2: Erstgesprächs-Event anlegen (20 Min)</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Dauer</p>
              <p className="font-medium">20 Minuten</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> Format</p>
              <p className="font-medium">Telefonisch (Telefonnummer abfragen)</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Titel</p>
            <div className="rounded-md border bg-background p-3 text-sm font-medium">Erstqualifizierungsgespräch, Kapitalanlage Immobilien</div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Beschreibung</p>
            <div className="rounded-md border bg-background p-4 text-sm whitespace-pre-line">
{`In diesem unverbindlichen Erstgespräch schauen wir gemeinsam, ob und wie ein Investment in Kapitalanlage-Immobilien für dich sinnvoll sein kann.

Wir sprechen unter anderem über:
• deine aktuelle Situation und Ziele
• mögliche Einstiegsmöglichkeiten
• Kapitalaufbau, Steuervorteile und Vermögensschutz
• welche Immobilienstrategien zu dir passen könnten
• und ob eine Zusammenarbeit grundsätzlich Sinn ergibt

Das telefonische Gespräch dient vor allem dazu, ein erstes Bild zu bekommen und offene Fragen ehrlich zu klären. Kein Verkaufsdruck, sondern ein klarer Austausch auf Augenhöhe.

Bitte plane dir etwa 15 bis 20 Minuten Zeit ein und sorge möglichst für eine ruhige Umgebung.`}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Tipp: Frage im Buchungsformular zusätzlich Vorname, Nachname, E-Mail und Telefonnummer ab. Diesen Link
            trägst du anschließend in deinen Einstellungen unter „Erstgespräch · 15 bis 20 Minuten, Telefon · Buchungslink" ein.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Schritt 3: Beratungsgesprächs-Event anlegen (45 Min)</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Dauer</p>
              <p className="font-medium">45 Minuten</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Video className="h-3 w-3" /> Format</p>
              <p className="font-medium">Online-Termin mit Videolink</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Titel</p>
            <div className="rounded-md border bg-background p-3 text-sm font-medium">Beratungsgespräch Kapitalanlage-Immobilien</div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Beschreibung</p>
            <div className="rounded-md border bg-background p-4 text-sm whitespace-pre-line">
{`Du denkst über eine Immobilie als Kapitalanlage nach oder willst verstehen, ob und wie sich das für dich wirklich lohnt?

Dann ist dieses Gespräch der richtige nächste Schritt.

Wir schauen uns gemeinsam deine aktuelle Situation an und klären, ob und wie eine Immobilie zu deinen Zielen passt. Kein Verkaufsgespräch, kein Druck, sondern ein ehrlicher Blick auf deine Möglichkeiten.

Was wir im Gespräch konkret machen:
• Wir analysieren deine Ausgangssituation (Einkommen, Ziele, Risikobereitschaft)
• Du bekommst ein klares Verständnis, wie Kapitalanlage-Immobilien funktionieren
• Wir prüfen, ob sich eine Investition für dich aktuell sinnvoll umsetzen lässt
• Wenn ja: zeigen wir dir, wie der konkrete Weg aussehen kann

👉 Ziel des Gesprächs: Klarheit. Damit du weißt, ob du starten solltest und wie.`}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Diesen Link trägst du in deinen Einstellungen unter „Beratungsgespräch · 45 Minuten · Buchungslink" ein.
            Er wird automatisch im Kundenprofil im Erstgesprächs-Skript (Punkt 18 „Terminvereinbarung") angezeigt,
            damit du am Ende des Erstgesprächs direkt einen Beratungstermin einbuchst.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Schritt 4: Objektgesprächs-Event anlegen (60 Min)</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Dauer</p>
              <p className="font-medium">60 Minuten</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Video className="h-3 w-3" /> Format</p>
              <p className="font-medium">Video (Bildschirm teilen ist Pflicht)</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Titel</p>
            <div className="rounded-md border bg-background p-3 text-sm font-medium">Objektgespräch Kapitalanlage-Immobilie</div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Beschreibung</p>
            <div className="rounded-md border bg-background p-4 text-sm whitespace-pre-line">
{`In diesem Termin schauen wir uns eine konkrete Wohnung gemeinsam an. Nicht als Hochglanzprospekt, sondern Zahl für Zahl.

Was wir durchgehen:
• Lage und Umfeld: Wer wohnt dort, wie entwickelt sich der Ort
• Zustand und Baujahr, was in den nächsten Jahren ansteht
• Die Rechnung: Kaufpreis, Nebenkosten, Miete, Hausgeld, Finanzierung
• Was du monatlich wirklich einzahlst und was nach zehn Jahren dasteht
• Die Risiken, offen benannt: Leerstand, Zinsbindung, Instandhaltung

Du bekommst die Zahlen vor dem Termin oder wir bauen sie gemeinsam im Rechner auf. Beides geht.

Plane bitte 60 Minuten ein und sei an einem Rechner, nicht nur am Handy. Wir schauen zusammen auf den Bildschirm, und auf einem kleinen Display sieht man die Tabellen nicht.`}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Diesen Link trägst du in deinen Einstellungen unter „Objektgespräch, 60 Min" ein. Er steht danach im
            Kundenprofil unter „Meeting erstellen" und auf deiner Terminseite zur Auswahl.
          </p>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Schritt 5: Finanzierungsgesprächs-Event anlegen (60 Min)</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Dauer</p>
              <p className="font-medium">60 Minuten</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Video className="h-3 w-3" /> Format</p>
              <p className="font-medium">Video oder Telefon</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Titel</p>
            <div className="rounded-md border bg-background p-3 text-sm font-medium">Finanzierungsgespräch Kapitalanlage-Immobilie</div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Event-Beschreibung</p>
            <div className="rounded-md border bg-background p-4 text-sm whitespace-pre-line">
{`In diesem Termin klären wir, wie deine Finanzierung aussehen kann und was die Bank dafür von dir braucht.

Was wir besprechen:
• Welche Unterlagen nötig sind und in welcher Reihenfolge
• Wie deine Haushaltsrechnung aus Sicht der Bank aussieht
• Eigenkapital: wie viel sinnvoll ist und was es an der Rate ändert
• Zins, Tilgung und Zinsbindung, und was daran wirklich entscheidet
• Der Ablauf bis zur Zusage und was wann von dir kommen muss

Damit das Gespräch etwas bringt, halte bitte bereit: die letzten drei Gehaltsabrechnungen, den letzten Steuerbescheid und einen Überblick über laufende Kredite. Wenn etwas fehlt, ist das kein Problem, dann sprechen wir erst einmal über den Rahmen.

Wir vermitteln die Finanzierung nicht selbst, sondern bereiten sie mit dir vor und bringen sie zu unserem Finanzierungspartner.`}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Diesen Link trägst du in deinen Einstellungen unter „Finanzierungsgespräch, 60 Min" ein. Er steht
            danach im Kundenprofil unter „Meeting erstellen" und auf deiner Terminseite zur Auswahl.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Schritt 6: Links übernehmen</h2>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Öffne dein Buchungstool und kopiere die öffentliche Adresse deines jeweiligen Events.</li>
            <li>Gehe in OS Immobilien zu <strong>Einstellungen, Profil, Buchungskalender-Links</strong>.</li>
            <li>Füge jeden Link in das Feld mit dem passenden Namen ein, von oben nach unten: Erstgespräch, Beratungsgespräch, Objektgespräch, Finanzierungsgespräch.</li>
            <li>Speichern. Die Setterin sieht ab sofort deinen Erstgesprächs-Link, im Erstgesprächs-Skript erscheint dein Beratungsgesprächs-Link, und im Kundenprofil stehen alle vier unter „Meeting erstellen".</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Du musst nicht alle vier ausfüllen. Ein leeres Feld bedeutet schlicht, dass dieses Gespräch nirgends
            zur Auswahl steht. Nachtragen kannst du es jederzeit.
          </p>
        </Card>

        <Separator />
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/einstellungen?tab=profil")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Zurück zu den Einstellungen
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <a href="https://calendly.com/event_types/new" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Calendly öffnen
            </a>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}