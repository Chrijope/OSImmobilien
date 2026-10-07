/**
 * „Wie es jetzt weitergeht“: wer sich meldet und wie man ihn selbst erreicht.
 *
 * Er haengt am Knopf unter der Bestaetigung der Eintragung, oeffentlich also am
 * Ende der Strecke. Intern sitzt derselbe Knopf auf der Ergebnisseite, damit
 * der Vertriebspartner beim Ausprobieren sieht, was sein Interessent bekommt.
 *
 * KEIN BROWSER-DIALOG. `AlertDialog` aus `components/ui`, wie es die
 * Projektregel verlangt: gestaltbar, mit eigenen Knopfbeschriftungen, und ohne
 * die technische Adresse der Seite in der Kopfzeile.
 *
 * WELCHE FELDER HIER STEHEN DUERFEN
 *
 * Genau vier: Name, Position, Bild, Mailadresse, Telefonnummer. Sie stehen
 * unten in `ERLAUBT` und werden einzeln herausgegriffen, nicht als Objekt
 * durchgereicht. Das ist dieselbe Vorsichtsmassnahme wie bei der
 * Exposé-Schnittstelle am 16.09.2026: Dort gab ein Abruf mit Sternchen die
 * kompletten Rohdaten heraus, samt Provision und Kaeufernamen. Seither gilt im
 * Haus die Positivliste. Ein `{...berater}` an dieser Stelle waere derselbe
 * Fehler noch einmal, denn `BeraterInfo` traegt zusaetzlich die `userId`, und
 * die gehoert auf keine oeffentliche Anzeigeseite.
 *
 * Die Daten selbst kommen aus `get-vp-microsite` beziehungsweise dem Rueckfall
 * ueber `?b=`, aufgeloest in `SteuerrechnerPublic`. Ein zweiter Weg entsteht
 * hier bewusst nicht.
 *
 * WANN DIE KARTE UEBERHAUPT ERSCHEINT
 *
 * Nur wenn NAME UND MAILADRESSE da sind. Zwei Gruende, und beide zaehlen:
 *
 *   1  Der Zweck der Karte ist, dass der Interessent sich selbst melden kann.
 *      Die Mailadresse ist der Weg, der immer traegt, und sie passt zu dem,
 *      was er ohnehin gerade bekommen hat: Er kann auf die Auswertungsmail
 *      einfach antworten.
 *   2  Die Telefonnummer allein genuegt NICHT. Sie kommt aus `profil.telefon`
 *      in den Einstellungen des Partners, und dort gibt es bis heute nur EIN
 *      Telefonfeld und keinen Schalter „oeffentlich sichtbar“. Wer dort seine
 *      private Mobilnummer eingetragen hat, hat der Veroeffentlichung nie
 *      ausdruecklich zugestimmt. Eine Karte, die nur diese eine Nummer zeigt,
 *      waere die schwaechste Begruendung fuer die staerkste Preisgabe.
 *
 * Bild und Telefonnummer sind dagegen freiwillig. Fehlt das Bild, stehen die
 * Initialen; fehlt die Nummer, faellt die Zeile weg. Eine leere Zeile oder ein
 * leeres Feld gibt es nie.
 *
 * OHNE PARTNER AM LINK, oder ohne Mailadresse bei ihm, bleibt die Karte ganz
 * weg. Dann sagt der Einblender nur zu, dass wir uns zeitnah zurueckmelden, um
 * die Moeglichkeiten persoenlich zu besprechen. Kein Name, keine Nummer, und
 * auch keine Frist: Der Lead liegt in dem Fall im offenen Pool, bis ihn jemand
 * von Hand uebernimmt, und „innerhalb von 24 Stunden“ koennte dort niemand
 * halten. Die allgemeine Nummer des Hauses steht hier ebenfalls nicht: Sie saehe
 * aus wie ein persoenlicher Ansprechpartner und ist keiner.
 */
import { Mail, Phone } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/**
 * Die Positivliste dieser Anzeige.
 *
 * Bewusst NICHT dabei: `userId`. Sie ist die Auth-Kennung des Partners und
 * dient allein der Zuordnung des Leads.
 */
const ERLAUBT = ["name", "position", "bild", "email", "telefon"] as const;
type ErlaubtesFeld = (typeof ERLAUBT)[number];

/** Aus einem Wert wird eine saubere Zeichenkette oder nichts. */
const text = (wert: unknown): string => (typeof wert === "string" ? wert.trim() : "");

/**
 * Nur die erlaubten Felder, einzeln herausgegriffen.
 *
 * Jedes Feld steht hier ausdruecklich. Wer eines ergaenzt, muss es sowohl in
 * `ERLAUBT` als auch hier eintragen, und genau das ist der Sinn: Ein neues Feld
 * an `BeraterInfo` landet nicht von allein auf einer oeffentlichen Seite.
 */
function nurErlaubte(berater?: BeraterInfo): Record<ErlaubtesFeld, string> {
  return {
    name: text(berater?.name),
    position: text(berater?.position),
    bild: text(berater?.bild),
    email: text(berater?.email),
    telefon: text(berater?.telefon),
  };
}

/** Die Initialen fuer den Fall ohne Bild. */
function initialen(name: string): string {
  const teile = name.split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "MI";
  return teile
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? "")
    .join("");
}

interface Props {
  offen: boolean;
  onSchliessen: () => void;
  berater?: BeraterInfo;
}

export default function AnsprechpartnerEinblender({ offen, onSchliessen, berater }: Props) {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).einblender;
  const { name, position, bild, email, telefon } = nurErlaubte(berater);
  /* Name UND Mailadresse, sonst bleibt es beim allgemeinen Wortlaut. Die
     Begruendung steht oben im Kopf dieser Datei. */
  const hatPartner = !!name && !!email;

  return (
    <AlertDialog open={offen} onOpenChange={(o) => { if (!o) onSchliessen(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t.titel}</AlertDialogTitle>
          <AlertDialogDescription>{hatPartner ? t.mitPartner(name) : t.ohnePartner}</AlertDialogDescription>
        </AlertDialogHeader>

        {hatPartner && (
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                {bild && <AvatarImage src={bild} alt="" />}
                <AvatarFallback>{initialen(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                {position && (
                  <p className="truncate text-xs text-muted-foreground">{position}</p>
                )}
              </div>
            </div>

            {/* Anrufen und schreiben als echte Verweise, nicht als Text zum
                Abtippen. Auf dem Handy waehlt ein Fingertipp direkt. */}
            {(telefon || email) && (
              <div className="mt-4 grid gap-2">
                {telefon && (
                  <a
                    href={`tel:${telefon.replace(/[^+\d]/g, "")}`}
                    className="flex min-h-[2.75rem] items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{telefon}</span>
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="flex min-h-[2.75rem] items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{email}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          {/* Der Knopf sagt, was er tut. „OK“ sagt nichts. */}
          <AlertDialogAction onClick={onSchliessen}>{t.schliessen}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
