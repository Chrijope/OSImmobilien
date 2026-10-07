import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ObjektData } from "@/lib/objekteStore";
import {
  waehleGesamtlauf,
  zaehleTexteStand,
  type GesamtlaufBericht,
  type GesamtlaufEintrag,
} from "@/lib/objektTexteGesamtlauf";
import { halteGesamtlaufAn, starteGesamtlauf, useGesamtlauf } from "@/lib/objektTexteGesamtlaufStore";
import { KONTINGENT_STUNDE_LEITUNG } from "@/lib/objektTexteSammellauf";

/**
 * Beschreibung und fünf Standortargumente für alle Objekte, mit einem Klick.
 *
 * Nur für Admin und Inhaber, denn nur sie haben das Kontingent dafür. Die
 * anderen Rollen, die Objekte pflegen, behalten den Sammellauf mit zwanzig
 * Objekten je Stunde (`ObjektTexteSammellauf.tsx`).
 *
 * DER KNOPF IST ZUGLEICH DER STAND
 *
 * Er sagt, wie viele sichtbare Objekte fertig sind („Texte: 58 von 91
 * Objekten fertig“), und während eines Durchgangs, wie weit er ist. So steht
 * der Stand ruhig in der Objektübersicht, ohne eine eigene Zeile.
 *
 * WAS ER NICHT IST
 *
 * Keine Zugriffskontrolle. Über das Kontingent entscheidet die Edge Function
 * anhand der Rollen in `user_roles`, über das Schreiben die Zeilensicherheit.
 *
 * DIE SEITE BLEIBT BEDIENBAR
 *
 * Der Durchgang lebt in `objektTexteGesamtlaufStore.ts`, nicht hier. Das
 * Fenster lässt sich jederzeit schließen, auch mitten im Lauf, und die
 * Übersicht zeigt beim Zurückkommen den Fortschritt.
 */
export function ObjektTexteGesamtlauf({ objekte }: { objekte: ObjektData[] }) {
  const [offen, setOffen] = useState(false);
  const lauf = useGesamtlauf();

  // Wie der Sammelmodus des Servers: nur sichtbare Objekte. Ein Entwurf
  // erscheint bei niemandem, und bis er freigegeben wird, holt der Server
  // seine Texte ohnehin nach.
  const sichtbare = useMemo(() => (objekte || []).filter((o) => o.sichtbar), [objekte]);
  const stand = useMemo(() => zaehleTexteStand(sichtbare), [sichtbare]);
  const auswahl = useMemo(() => waehleGesamtlauf(sichtbare), [sichtbare]);

  const zuTun = auswahl.auftraege.length;
  const nachAnlass = (anlass: string) => auswahl.auftraege.filter((a) => a.anlass === anlass).length;
  const ohneStand = nachAnlass("ohne-stand");
  const unvollstaendig = nachAnlass("unvollstaendig");
  const vermerk = nachAnlass("vermerk");
  const ohneMessung = nachAnlass("ohne-messung");

  const fortschritt = lauf.laeuft ? lauf.fortschritt : undefined;
  const bericht = lauf.bericht;
  const fehlgeschlageneIds = useMemo(() => new Set((bericht?.fehlgeschlagen || []).map((e) => e.id)), [bericht]);

  const alleStarten = () => {
    void starteGesamtlauf(sichtbare, "alle");
  };
  const fehlgeschlageneStarten = () => {
    void starteGesamtlauf(sichtbare.filter((o) => fehlgeschlageneIds.has(o.id)), "fehlgeschlagene");
  };

  const anteil = fortschritt && fortschritt.gesamt > 0
    ? Math.round(((fortschritt.nummer - 1) / fortschritt.gesamt) * 100)
    : 0;

  const standSatz = `Texte: ${stand.fertig} von ${stand.gesamt} Objekten fertig`;
  const knopfTitel = fortschritt
    ? `Texte werden erzeugt, Objekt ${fortschritt.nummer} von ${fortschritt.gesamt}`
    : standSatz;

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title={knopfTitel} aria-label={knopfTitel}>
          {lauf.laeuft ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          {fortschritt ? (
            <>
              <span className="hidden md:inline">Texte: {fortschritt.nummer} von {fortschritt.gesamt} in Arbeit</span>
              <span className="md:hidden">Texte {fortschritt.nummer}/{fortschritt.gesamt}</span>
            </>
          ) : (
            <>
              <span className="hidden md:inline">{standSatz}</span>
              <span className="md:hidden">Texte {stand.fertig}/{stand.gesamt}</span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beschreibung und Standort für alle Objekte</DialogTitle>
          <DialogDescription>
            Für jedes sichtbare Objekt entstehen eine Beschreibung, fünf Standortargumente, bis zu drei
            Marktargumente und die Liste der Sanierungen, aus den Objektunterlagen, den Objektangaben, den
            Investagon-Daten, der gemessenen Umgebung und der Marktanalyse. Von Hand gepflegte Texte bleiben
            unangetastet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <p className="font-semibold">{standSatz}.</p>
            {zuTun > 0 ? (
              <p className="text-muted-foreground text-xs">
                Zu bearbeiten: {zuTun}.{" "}
                {[
                  ohneStand > 0 ? `${ohneStand} noch ohne aktuellen Text` : "",
                  unvollstaendig > 0 ? `${unvollstaendig} unvollständig` : "",
                  vermerk > 0 ? `${vermerk} mit Vermerk ohne Ergebnis` : "",
                  ohneMessung > 0 ? `${ohneMessung} ohne gemessene Umgebung` : "",
                ].filter(Boolean).join(", ")}
                {ohneStand + unvollstaendig + vermerk + ohneMessung > 0 ? "." : ""}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">Es ist kein Objekt mehr zu bearbeiten.</p>
            )}
            {auswahl.uebersprungen.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {auswahl.uebersprungen.length} {auswahl.uebersprungen.length === 1 ? "bleibt" : "bleiben"} außen vor,
                weil ein Lauf dort nichts ändern würde.
              </p>
            )}
          </div>

          {(zuTun > 0 || lauf.laeuft) && (
            <Alert>
              <AlertTitle>Tab offen lassen</AlertTitle>
              <AlertDescription className="text-sm space-y-1">
                <p>
                  Der Durchgang läuft in diesem Browserfenster, ein Objekt nach dem anderen, je Objekt etwa
                  20 bis 60 Sekunden, mit vielen Unterlagen eher länger.
                  {!lauf.laeuft && zuTun > 0 && ` Bei ${zuTun} Objekten sind das etwa ${dauer(zuTun)}.`}
                </p>
                <p>
                  Du kannst dieses Fenster schließen und im CRM weiterarbeiten, der Fortschritt steht am
                  Knopf „Texte“. Neu laden oder den Tab schließen beendet den Durchgang; was bis dahin fertig
                  ist, bleibt gespeichert.
                </p>
                {!lauf.laeuft && zuTun > KONTINGENT_STUNDE_LEITUNG && (
                  <p>
                    Mehr als {KONTINGENT_STUNDE_LEITUNG} Läufe je Stunde nimmt die Schnittstelle nicht an. Der
                    Rest bleibt für den nächsten Durchgang stehen.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {fortschritt && (
            <div className="space-y-2">
              <Progress value={anteil} className="h-2" />
              <p className="text-sm">
                Objekt {fortschritt.nummer} von {fortschritt.gesamt}: {fortschritt.titel}
              </p>
              <p className="text-xs text-muted-foreground">
                {fortschritt.erzeugt} erzeugt, {fortschritt.fehlgeschlagen} fehlgeschlagen.
                {lauf.haeltAn ? " Wird nach diesem Objekt angehalten." : ""}
              </p>
            </div>
          )}

          {lauf.laeuft && !fortschritt && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Der Durchgang beginnt...
            </p>
          )}

          {lauf.fehler && !lauf.laeuft && (
            <Alert variant="destructive">
              <AlertTitle>Der Durchgang ist abgebrochen</AlertTitle>
              <AlertDescription>{lauf.fehler}</AlertDescription>
            </Alert>
          )}

          {bericht && !lauf.laeuft && <Zusammenfassung bericht={bericht} />}

          <div className="flex flex-wrap gap-2">
            {lauf.laeuft ? (
              <>
                <Button variant="outline" onClick={halteGesamtlaufAn} disabled={lauf.haeltAn}>
                  {lauf.haeltAn ? "Wird angehalten..." : "Anhalten"}
                </Button>
                <Button variant="ghost" onClick={() => setOffen(false)}>Fenster schließen, weiterlaufen lassen</Button>
              </>
            ) : (
              <>
                <Button onClick={alleStarten} disabled={zuTun === 0}>
                  Alle Objekte jetzt durcharbeiten ({zuTun})
                </Button>
                {fehlgeschlageneIds.size > 0 && (
                  <Button variant="outline" onClick={fehlgeschlageneStarten}>
                    Nur Fehlgeschlagene erneut versuchen ({fehlgeschlageneIds.size})
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setOffen(false)}>Schließen</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Grobe Dauer für n Objekte, 20 bis 60 Sekunden je Objekt, seit die Unterlagen mitgelesen werden. */
function dauer(anzahl: number): string {
  const von = Math.max(1, Math.round((anzahl * 20) / 60));
  const bis = Math.max(1, Math.round((anzahl * 60) / 60));
  return von === bis ? `${von} Minuten` : `${von} bis ${bis} Minuten`;
}

const TITEL_JE_ENDE: Record<GesamtlaufBericht["ende"], string> = {
  fertig: "Fertig",
  abgebrochen: "Angehalten",
  kontingent: "Vorerst zu Ende",
  stoerung: "Wegen Fehlern angehalten",
  "nicht-ausgerollt": "Die Function ist noch nicht bereit",
};

function Zusammenfassung({ bericht }: { bericht: GesamtlaufBericht }) {
  /*
   * Fehlt die Function, zählt kein Objekt als fehlgeschlagen, und die Zahlen
   * darunter wären nur Rauschen. Stattdessen der eine Satz, der sagt, was zu
   * tun ist, rot wie jede andere Störung.
   */
  if (bericht.ende === "nicht-ausgerollt") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{TITEL_JE_ENDE[bericht.ende]}</AlertTitle>
        <AlertDescription className="text-sm">
          <p>{bericht.grenzeText}</p>
          <p className="mt-1">
            {bericht.erzeugt > 0
              ? `${bericht.erzeugt} ${bericht.erzeugt === 1 ? "Objekt hat" : "Objekte haben"} vorher schon Texte bekommen.`
              : "Kein Objekt wurde verändert."}{" "}
            {bericht.offen.length} {bericht.offen.length === 1 ? "bleibt" : "bleiben"} offen.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <Alert>
        <AlertTitle>{TITEL_JE_ENDE[bericht.ende]}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-5 space-y-0.5 text-sm">
            <li>{bericht.erzeugt} erzeugt</li>
            <li>{bericht.schonVorhanden} schon vorhanden</li>
            <li>{bericht.uebersprungen.length} übersprungen</li>
            <li>{bericht.fehlgeschlagen.length} fehlgeschlagen</li>
            {bericht.offen.length > 0 && <li>{bericht.offen.length} noch offen</li>}
          </ul>
          {bericht.grenzeText && <p className="mt-2 text-sm">{bericht.grenzeText}</p>}
        </AlertDescription>
      </Alert>
      <EintragListe titel="Fehlgeschlagen" eintraege={bericht.fehlgeschlagen} />
      <EintragListe titel="Erzeugt, aber noch nicht vollständig" eintraege={bericht.unvollstaendig} />
      <EintragListe titel="Übersprungen" eintraege={bericht.uebersprungen} />
    </div>
  );
}

/** Eine Liste mit Grund, auf zwölf Einträge begrenzt, damit das Fenster lesbar bleibt. */
function EintragListe({ titel, eintraege }: { titel: string; eintraege: GesamtlaufEintrag[] }) {
  if (eintraege.length === 0) return null;
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-semibold">{titel}</p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {eintraege.slice(0, 12).map((e) => (
          <li key={e.id}>
            <span className="font-medium">{e.titel}</span>
            <span className="text-muted-foreground">: {e.grund}</span>
          </li>
        ))}
      </ul>
      {eintraege.length > 12 && (
        <p className="mt-2 text-xs text-muted-foreground">und {eintraege.length - 12} weitere</p>
      )}
    </div>
  );
}
