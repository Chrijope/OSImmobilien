/**
 * Die Moderation des Bewerber-Videocalls: der Bildschirm der HR-Managerin.
 *
 * Zwei Ansichten in einer Seite, weil es zwei Momente sind:
 *
 * 1. **Die Moderation im Gespräch**, ein Bildschirm ohne Scrollen. Sie steht
 *    oben, weil sie der Grund ist, aus dem dieses Fenster offen ist. Links der
 *    Ablauf samt der nicht gewählten Module, in der Mitte die laufende Folie
 *    mit ihrem Impuls und darunter die Mitschrift, rechts seine Tagesordnung,
 *    die bestätigten Punkte und der Abschluss. Unter der Notiz liegen
 *    zugeklappt alle Antworten seines Kennenlernbogens, zum Nachschlagen
 *    während des Gesprächs.
 * 2. **Die Vorbereitung**, Ziel zwei bis drei Minuten. Sie steht darunter und
 *    klappt über den Knopf in der Kopfzeile weg, sobald das Gespräch läuft:
 *    die entscheidenden Antworten, höchstens drei offene Punkte, die Übersicht
 *    aus fünf Merkmalen, die den Punktwert ersetzt, und der Grund für die
 *    gewählte Dauer. Die vollständige Antwortübersicht stand bis zum
 *    22.09.2026 ebenfalls hier und klappte damit mit weg; sie liegt jetzt
 *    oben unter der Notiz. **Vor dem Gespräch steht hier kein Punktwert und keine
 *    Empfehlung.** Eine Zahl vor dem ersten Satz macht das Gespräch zur
 *    Bestätigung eines Urteils. Der vorhandene Vorab-Score wird dabei nicht
 *    gelöscht, er wird hier nur nicht angezeigt: eine Entscheidung über die
 *    Oberfläche und nicht über die Datenbank.
 *
 * Im Gespräch steht **eine Sache im Vordergrund**: die laufende Folie mit
 * ihrem Impuls. Alles, was nur gelegentlich gebraucht wird, ist einen Griff
 * entfernt und nicht einen Suchvorgang: die Folienvorschau ist in der Höhe
 * gedeckelt, die Hinweise zur Strecke sind zugeklappt, die Vorbereitung liegt
 * unter dem Gespräch.
 *
 * Zwei Regeln bestimmen diese Ansicht: Interne Notizen gehören niemals in die
 * geteilte Ansicht. Und erfasst werden sachliche Beispiele und Absprachen.
 * „Stimme, Energie, Umfeld" als Ersteindruck gibt es hier nicht; Auftreten und
 * Kamerahintergrund sind keine verlässliche Eignungsgrundlage.
 *
 * **Die nicht gewählten Module bleiben sichtbar.** Ein Modul lässt sich im
 * Gespräch einschieben, wenn eine Frage es verlangt. Genau dafür stehen sie
 * links, ausgegraut, mit einem Klick zum Zuschalten.
 *
 * Seit dem 23.09.2026 ist das die einzige Moderation des Videocalls, für
 * Bewerber im alten wie im neuen Ablauf. Sie liegt unter der Adresse
 * `/closing-moderation`, die ihren Namen aus der Zeit der alten
 * Closing-Präsentation behalten hat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MonitorPlay,
  Plus, Video, WifiOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useUser } from "@/contexts/UserContext";
import { kannBewerberVerwalten } from "@/lib/bewerberRechte";
import { LoadingFallback } from "@/components/LoadingFallback";
import { useBewerberAusCache } from "@/components/bewerbung/useBewerberAusCache";
import {
  useKennenlernenAntworten,
  useKooperationsgespraechAbschluss,
  useSelbstGebuchterTermin,
  useVideocallErfassung,
  useVideocallFolien,
} from "@/components/bewerbung/useBewerberVideocall";
import { KennenlernbogenKarte } from "@/components/bewerbung/KennenlernbogenKarte";
import { GespraechBeendenKarte } from "@/components/bewerbung/VideocallAbschluss";
import { AbsageDialog } from "@/components/bewerbung/erstgespraechBausteine";
import {
  KERNBAUSTEINE,
  MODULE,
  dauerBegruendung,
  dauerMinuten,
  entscheidendeAntworten,
  getModeration,
  getModul,
  getStrecke,
  impulsFuer,
  lies,
  merkmale,
  modulWahl,
  vorbereitungsPunkte,
  zusatzModule,
  type BausteinId,
  type MerkmalId,
  type ModulId,
  type VideocallErfassung,
  type VideocallFolie,
} from "@/lib/bewerberVideocall";
import { notizFolieLesen, notizFortschreiben, notizLesen } from "@/lib/videocallNotiz";
import { TERMIN_ZEITZONE } from "@/lib/bewerberTermine";
import { themenLabels, type WegId } from "@/lib/bewerberKennenlernen";
import {
  PING_INTERVALL_MS, bewerberprofilUrl, istVerbunden, oeffneKanal, praesentationsUrl,
  type KopplungsNachricht,
} from "@/lib/praesentationsKopplung";
import { BewerberVideocallBuehne } from "@/pages/BewerberVideocallPraesentation";

/**
 * Eine Zeile, die sich mit einem Klick in eine Liste einträgt.
 *
 * Ohne Rahmen und ohne getönte Fläche: vier umrandete Kästen nebeneinander
 * waren vier Kästen zu viel. Den Ton trägt jetzt ein Punkt vor der
 * Überschrift, die Zusammengehörigkeit trägt der Abstand.
 */
function KlickListe({
  titel,
  hinweis,
  eintraege,
  platzhalter,
  onHinzufuegen,
  onEntfernen,
  ton = "neutral",
}: {
  titel: string;
  hinweis?: string;
  eintraege: string[];
  platzhalter: string;
  onHinzufuegen: (text: string) => void;
  onEntfernen: (index: number) => void;
  ton?: "neutral" | "gut" | "offen";
}) {
  const [entwurf, setEntwurf] = useState("");
  const punkt =
    ton === "gut" ? "bg-green-600"
      : ton === "offen" ? "bg-orange-500"
        : "bg-muted-foreground/40";
  const eintragen = () => {
    const text = entwurf.trim();
    if (!text) return;
    onHinzufuegen(text);
    setEntwurf("");
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${punkt}`} />
        <p className="text-xs font-semibold">{titel}</p>
        {hinweis && <p className="text-[10px] text-muted-foreground leading-snug">{hinweis}</p>}
      </div>
      {eintraege.length > 0 && (
        <ul className="space-y-1">
          {eintraege.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="flex-1 leading-snug">{e}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive text-[11px] shrink-0"
                onClick={() => onEntfernen(i)}
              >
                entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={entwurf}
          onChange={(e) => setEntwurf(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); eintragen(); } }}
          placeholder={platzhalter}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={eintragen} aria-label={`${titel} eintragen`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Das freie Notizfeld, das über alle Folien hinweg gilt.
 *
 * Es steht neben den vier Listen und nicht unter ihnen: So kostet es keine
 * Höhe, die Folienvorschau darüber bleibt so groß wie bisher, und es ist
 * trotzdem ohne Klick und ohne Suchen da, wenn jemand mitten im Satz etwas
 * festhalten will. Für alles, was in keine der vier Listen passt.
 *
 * Die laufende Folie schreibt sich beim ersten Buchstaben von selbst darüber,
 * die Regel dazu steht in `videocallNotiz.ts`.
 */
function GespraechsNotiz({
  text,
  onText,
}: {
  text: string;
  onText: (neu: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
        <p className="text-xs font-semibold">Notiz zum Gespräch</p>
        <p className="text-[10px] text-muted-foreground leading-snug">Läuft über alle Folien mit.</p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        // Die Moderation hat heute keine Tastenkürzel für vor und zurück.
        // Sollte eines dazukommen, darf es beim Tippen die Folie nicht wechseln.
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Was dir auffällt. Die Folie schreibt sich von selbst dazu."
        aria-label="Notiz zum Gespräch"
        className="h-full min-h-[9rem] resize-none rounded-lg px-3 py-2 text-xs leading-relaxed"
      />
    </div>
  );
}

/**
 * Der Impuls zur laufenden Folie. Kein Sprechtext: Vorlesen soll ihn niemand.
 * Exportiert, weil die Übungsansicht (`PraesentationsUebung.tsx`) denselben
 * Baustein ohne Bewerber zeigt.
 */
export function FolienImpuls({ weg, bausteinId }: { weg: WegId; bausteinId: BausteinId }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Impuls, kein Sprechtext
      </p>
      <p className="mt-1 text-base leading-relaxed">{impulsFuer(weg, bausteinId)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Vorlesen soll ihn niemand. Wer vorliest, hört nicht zu.
      </p>
    </div>
  );
}

/**
 * Was auf dieser Strecke erfasst wird, und was nicht. Zugeklappt, weil sich
 * die Regeln während des Termins nicht ändern. Ohne Moderation zur Strecke
 * bleibt der Baustein leer. Exportiert für die Übungsansicht.
 */
export function StreckenRegeln({ weg }: { weg: WegId }) {
  const moderation = getModeration(weg);
  if (!moderation) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronDown
          className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
        Was auf dieser Strecke erfasst wird, und was nicht
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 pt-2 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold">Auf dieser Strecke zu erfassen</p>
          <ul className="mt-1 space-y-1">
            {moderation.erfassen.map((e, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-snug">{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold">Und was nicht erfasst wird</p>
          <ul className="mt-1 space-y-1">
            {moderation.nichtErfassen.map((e, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-snug">{e}</li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Die Vorbereitung, vor dem ersten Satz. Ohne Punktwert und ohne Empfehlung. */
function Vorbereitung({
  antworten,
  erfassung,
  vorname,
}: {
  antworten: Record<string, string | string[]>;
  erfassung: VideocallErfassung;
  vorname: string;
}) {
  const l = lies(antworten);
  const strecke = l.weg ? getStrecke(l.weg) : null;
  const zusatz = zusatzModule(erfassung);
  const bestaetigt = new Set(erfassung.bestaetigt ?? []);
  const frage = l.wert("eigeneFrage").trim();

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="p-3 space-y-2">
        <p className="text-xs font-semibold">Die entscheidenden Antworten</p>
        <ul className="space-y-1">
          {entscheidendeAntworten(antworten).map((z) => (
            <li key={z.label} className="flex justify-between gap-3 text-xs border-b py-1 last:border-b-0">
              <span className="text-muted-foreground shrink-0">{z.label}</span>
              <span className="text-right">{z.wert}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Mehr braucht die Vorbereitung nicht. Alles Weitere steht eine Ebene tiefer.
        </p>
      </Card>

      <Card className="p-3 space-y-2">
        <p className="text-xs font-semibold">Statt einer Punktzahl: fünf Merkmale</p>
        <ul className="space-y-1.5">
          {merkmale(antworten).map((m) => (
            <li key={m.id} className="text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={m.selbstauskunft === "erfuellt" ? "default" : "outline"}
                  className="h-5 text-[10px] font-normal"
                >
                  {m.selbstauskunft === "erfuellt" ? "Selbstauskunft ✓" : "offen"}
                </Badge>
                <span className="font-medium">{m.label}</span>
                {bestaetigt.has(m.id) && (
                  <Badge className="h-5 bg-green-600 text-white hover:bg-green-600 text-[10px] font-normal">
                    im Gespräch bestätigt
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{m.beleg}</p>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Kein Gesamtpunktwert und keine Empfehlung vor dem Gespräch. Die mittlere Spalte füllt sich
          erst im Termin, damit Selbstauskunft und Erkenntnis nicht verschwimmen.
        </p>
      </Card>

      <Card className="p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold">Höchstens drei offene Punkte</p>
          <ol className="mt-1 space-y-1">
            {vorbereitungsPunkte(antworten).map((p, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-muted-foreground">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>
        {frage && (
          <div>
            <p className="text-xs font-semibold">Seine eigene Frage, im Wortlaut</p>
            <p className="text-xs italic leading-snug mt-1">„{frage}“</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Die einzige Angabe im ganzen Kennenlernen, die man nicht erraten kann. Sie gehört an den
              Anfang des Gesprächs.
            </p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold">
            {vorname}, {l.weg ? dauerMinuten(l.weg, zusatz) : 0} Minuten
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">{dauerBegruendung(antworten, zusatz)}</p>
          {strecke && (
            <p className="text-[11px] text-muted-foreground leading-snug mt-1">
              Im Sprechtext: {strecke.imSprechtext}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Die Schrittliste links: der Kern, die gewählten und die nicht gewählten
 * Module. Zwei Abschnitte ohne Karten, getrennt durch Abstand statt durch
 * Rahmen. Die nicht gewählten Module stehen als Merkzettel nebeneinander,
 * damit sie wenig Höhe brauchen und trotzdem mit einem Klick laufen.
 */
function Schrittliste({
  folien,
  aktiv,
  weg,
  zusatz,
  begruendung,
  onGeheZu,
  onModulZuschalten,
  onModulEntfernen,
  onBegruendung,
}: {
  folien: VideocallFolie[];
  aktiv: number;
  weg: string;
  zusatz: ModulId[];
  begruendung: string;
  onGeheZu: (i: number) => void;
  onModulZuschalten: (m: ModulId) => void;
  onModulEntfernen: (m: ModulId) => void;
  onBegruendung: (text: string) => void;
}) {
  const imTermin = new Set(folien.filter((f) => f.art === "modul").map((f) => f.bausteinId as ModulId));
  const nichtGewaehlt = MODULE.filter((m) => !imTermin.has(m.id));
  const strecke = getStrecke(weg);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Ablauf</p>
        <ol className="space-y-0.5">
          {folien.map((f, i) => {
            const erledigt = i < aktiv;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onGeheZu(i)}
                  className={`w-full text-left flex items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted ${
                    i === aktiv ? "bg-primary/10 font-semibold" : "text-muted-foreground"
                  }`}
                >
                  <span className="w-4 shrink-0 tabular-nums">
                    {erledigt ? <Check className="h-3 w-3 text-green-600" /> : i + 1}
                  </span>
                  <span className="flex-1 leading-snug">
                    {f.art === "modul" ? `Modul ${getModul(f.bausteinId as ModulId).nummer} · ` : ""}
                    {f.art === "modul"
                      ? getModul(f.bausteinId as ModulId).titel
                      : KERNBAUSTEINE.find((k) => k.id === f.bausteinId)?.titel}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nicht gewählt</p>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Ein Klick schiebt eines ein, wenn eine Frage es verlangt.
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {nichtGewaehlt.map((m) => {
            const wahl = strecke ? modulWahl(strecke.weg, m.id) : "nicht";
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onModulZuschalten(m.id)}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={`Modul ${m.nummer} einschieben`}
                >
                  <Plus className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="leading-snug">M{m.nummer} {m.kurz}</span>
                  {wahl === "beiBedarf" && <span className="text-[9px] opacity-70">angeboten</span>}
                </button>
              </li>
            );
          })}
          {nichtGewaehlt.length === 0 && (
            <li className="text-[11px] text-muted-foreground">Alle sechs Module laufen in diesem Termin.</li>
          )}
        </ul>
        {zusatz.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Im Gespräch zugeschaltet</p>
            <ul className="mt-1 space-y-1">
              {zusatz.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 text-xs">
                  <span>M{getModul(m).nummer} {getModul(m).kurz}</span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() => onModulEntfernen(m)}
                  >
                    zurücknehmen
                  </button>
                </li>
              ))}
            </ul>
            {/* Die Modulwahl ist ein Vorschlag. Wer ihn ändert, schreibt den
                Grund dazu, damit die Änderung später nachvollziehbar bleibt. */}
            <Input
              value={begruendung}
              onChange={(e) => onBegruendung(e.target.value)}
              placeholder="Warum diese Änderung?"
              className="h-8 text-xs mt-2"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BewerberVideocallModeration() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const bewerberId = params.get("bewerberId") ?? "";
  const { bewerber, geladen: bewerberGeladen } = useBewerberAusCache(bewerberId);
  const { antworten, geladen, befund } = useKennenlernenAntworten(
    bewerberId,
    bewerber?.vorname ?? "",
  );
  const darfBearbeiten = !!user && kannBewerberVerwalten(user.role);
  const { erfassung, aendern } = useVideocallErfassung(bewerber, darfBearbeiten);
  const folien = useVideocallFolien(antworten, erfassung);

  const [absageOffen, setAbsageOffen] = useState(false);
  const [absageModus, setAbsageModus] = useState<"kein_interesse" | "abgelehnt">("abgelehnt");
  const [absageGrund, setAbsageGrund] = useState("");

  /** Absage aus dem Abschluss heraus: derselbe Dialog wie die Knöpfe darunter. */
  const absageOeffnen = useCallback(
    (modus: "kein_interesse" | "abgelehnt", grundVorschlag = "") => {
      setAbsageModus(modus);
      setAbsageGrund(grundVorschlag);
      setAbsageOffen(true);
    },
    [],
  );

  const termin = useSelbstGebuchterTermin(bewerberId);
  const { abschliessen, zwischenspeichern, adressenSpeichern, ablehnen } =
    useKooperationsgespraechAbschluss({
      bewerber,
      beraterName: user?.name ?? "",
      erfassung,
      onRefresh: undefined,
      onAbsageNoetig: absageOeffnen,
    });

  const [aktiv, setAktiv] = useState(0);
  const [vorbereitungOffen, setVorbereitungOffen] = useState(true);
  /*
   * Die Rückfrage vor dem Verlassen, und zwar nur dann, wenn wirklich etwas
   * auf dem Spiel steht: solange die Präsentation hängt (siehe `verbunden`
   * weiter unten). Die Mitschrift selbst braucht keine Rückfrage, sie liegt
   * mit jedem Tastendruck im Browser und kurz darauf in der Datenbank
   * (`useVideocallErfassung`). Eine Frage, die bei jedem Klick erscheint,
   * klickt man nach zwei Tagen ungelesen weg.
   */
  const [verlassenOffen, setVerlassenOffen] = useState(false);
  // Die Adressen leben am Bewerber. Sie werden im Gespräch diktiert und sofort
  // abgelegt, damit im Closing nichts nachgetippt werden muss.
  const [vertragsAdresse, setVertragsAdresse] = useState("");
  const [rechnungsAdresse, setRechnungsAdresse] = useState("");
  const [adressenIdentisch, setAdressenIdentisch] = useState(true);
  useEffect(() => {
    if (!bewerber) return;
    setVertragsAdresse(bewerber.vertragsAdresse ?? "");
    setRechnungsAdresse(bewerber.rechnungsAdresse ?? "");
    setAdressenIdentisch(
      !bewerber.rechnungsAdresse || bewerber.rechnungsAdresse === bewerber.vertragsAdresse,
    );
    // Absichtlich nur die drei Felder: Der ganze Bewerber als Abhängigkeit
    // würde die Eingabe bei jedem Autosave überschreiben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerber?.id, bewerber?.vertragsAdresse, bewerber?.rechnungsAdresse]);
  const [lebenszeichen, setLebenszeichen] = useState<number | null>(null);
  const [verbunden, setVerbunden] = useState(false);
  const kanalRef = useRef<ReturnType<typeof oeffneKanal>>(null);
  const folienRef = useRef(folien);
  folienRef.current = folien;

  const zusatz = useMemo(() => zusatzModule(erfassung), [erfassung]);
  const weg = antworten && lies(antworten).weg;
  const folieIndex = Math.min(aktiv, Math.max(0, folien.length - 1));
  const folie: VideocallFolie | undefined = folien[folieIndex];

  const geheZu = useCallback((i: number) => {
    const liste = folienRef.current;
    if (liste.length === 0) return;
    setAktiv(Math.max(0, Math.min(liste.length - 1, i)));
  }, []);

  // Kopplung: die Moderation führt, die Präsentation folgt.
  useEffect(() => {
    if (!bewerberId) return;
    const kanal = oeffneKanal(bewerberId);
    kanalRef.current = kanal;
    if (!kanal) return;
    const ab = kanal.empfangen((n: KopplungsNachricht) => {
      setLebenszeichen(Date.now());
      if (n.typ === "folie") {
        const i = folienRef.current.findIndex((f) => f.id === n.folieId);
        if (i >= 0) setAktiv(i);
      } else if (n.typ === "anfrage") {
        const liste = folienRef.current;
        if (liste.length > 0) kanal.senden({ typ: "zustand", folieId: liste[0].id });
      }
    });
    const ping = setInterval(() => kanal.senden({ typ: "ping" }), PING_INTERVALL_MS);
    return () => { ab(); clearInterval(ping); kanal.schliessen(); kanalRef.current = null; };
  }, [bewerberId]);

  useEffect(() => {
    if (folie) kanalRef.current?.senden({ typ: "gehe-zu", folieId: folie.id });
  }, [folie]);

  useEffect(() => {
    const t = setInterval(() => setVerbunden(istVerbunden(lebenszeichen, Date.now())), 1000);
    setVerbunden(istVerbunden(lebenszeichen, Date.now()));
    return () => clearInterval(t);
  }, [lebenszeichen]);

  // Die zuletzt gezeigte Folie merken, damit ein Neuladen nicht auf Folie 1 springt.
  useEffect(() => {
    if (folie && erfassung.letzteFolie !== folie.id) aendern({ letzteFolie: folie.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folie?.id]);

  if (!user) return <LoadingFallback />;
  if (!darfBearbeiten) return <Navigate to="/" replace />;
  if (!bewerberGeladen || !geladen) return <LoadingFallback />;
  if (!bewerber) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        Zu dieser Adresse gibt es keinen Bewerber.
      </div>
    );
  }

  const vorname = bewerber.vorname || "Der Bewerber";
  const name = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ");

  /**
   * Der selbst gebuchte Termin als eine Zeile. Er stand bisher nur in der
   * Übersicht der Akte; im Fenster, in dem das Gespräch geführt wird, fehlte er.
   */
  const terminZeile = (() => {
    if (!termin) return "";
    const d = new Date(termin.startAt);
    if (isNaN(d.getTime())) return "";
    const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
    const zeit = d.toLocaleTimeString("de-DE", {
      timeZone: TERMIN_ZEITZONE, hour: "2-digit", minute: "2-digit",
    });
    return `${tag} um ${zeit} Uhr, selbst gebucht`;
  })();

  /** Wann das Gespräch zuletzt abgeschlossen wurde, für die Knopfzeile. */
  const abgeschlossenAm = (() => {
    const roh = (bewerber.erstgespraechSkript?.durchgefuehrtAm ?? "").trim();
    if (!roh) return "";
    const d = new Date(roh);
    return isNaN(d.getTime()) ? roh : d.toLocaleDateString("de-DE");
  })();

  /** Adressen sofort ablegen: sie werden diktiert, nicht getippt. */
  const adressenAblegen = (vertrag: string, rechnung: string, gleich: boolean) =>
    adressenSpeichern(vertrag, gleich ? vertrag : rechnung);

  const liste = (key: keyof VideocallErfassung): string[] => {
    const wert = erfassung[key];
    return Array.isArray(wert) ? (wert as string[]) : [];
  };
  const ergaenzen = (key: "geklaert" | "nachreichen" | "beobachtungen" | "absprachen", text: string) =>
    aendern({ [key]: [...liste(key), text] });
  const streichen = (key: "geklaert" | "nachreichen" | "beobachtungen" | "absprachen", i: number) =>
    aendern({ [key]: liste(key).filter((_, n) => n !== i) });

  /**
   * Die Notiz fortschreiben. Sie geht denselben Weg wie der übrige
   * Gesprächsstand: sofort in den LocalStorage, verzögert in die Datenbank.
   */
  const notizSchreiben = (neu: string) =>
    aendern(
      notizFortschreiben({
        bisher: notizLesen(erfassung),
        neu,
        folieId: folie?.id ?? "",
        folieNummer: folieIndex + 1,
        folieTitel: folie?.titel ?? "",
        vermerkteFolie: notizFolieLesen(erfassung),
      }),
    );

  const merkmalUmschalten = (id: MerkmalId) => {
    const bisher = erfassung.bestaetigt ?? [];
    aendern({ bestaetigt: bisher.includes(id) ? bisher.filter((m) => m !== id) : [...bisher, id] });
  };

  const praesentationOeffnen = () =>
    window.open(praesentationsUrl(bewerber.id, 1, name), "_blank", "noopener,noreferrer");

  /**
   * Die Moderation verlassen und im Profil dieses Bewerbers landen.
   *
   * Warum eine Navigation und kein `window.close()`: Die Moderation geht zwar
   * in einem zweiten Tab auf, aber über einen Link mit
   * `rel="noopener noreferrer"` (siehe `VideocallTab.tsx`). Damit hat dieser
   * Tab kein `window.opener`, und ein Skript darf nur schließen, was ein
   * Skript geöffnet hat. `window.close()` täte hier also in aller Regel gar
   * nichts, und ein Knopf, der manchmal nichts tut, ist schlimmer als keiner.
   * Die Navigation führt dagegen immer ans Ziel.
   *
   * Vorher wird der Stand abgelegt. Der Autosave schreibt erst 1,5 Sekunden
   * nach dem letzten Tastendruck in die Datenbank; wer unmittelbar danach
   * zurückgeht, hätte diesen letzten Satz nur im Browser dieses Rechners.
   */
  const moderationVerlassen = () => {
    setVerlassenOffen(false);
    zwischenspeichern();
    navigate(bewerberprofilUrl(bewerber.id));
  };

  /** Der Zurückweg: mit laufender Präsentation erst die Rückfrage, sonst direkt. */
  const zurueckGehen = () => {
    if (verbunden) setVerlassenOffen(true);
    else moderationVerlassen();
  };

  return (
    <div data-lg="seite" className="min-h-screen bg-background text-foreground">
      <header data-lg="kopfscheibe" className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur px-4 py-2 flex flex-wrap items-center gap-3">
        {/* Der Zurückweg steht ganz vorn, vor dem Namen, wie beim
            Notaraufnahmebogen und der Reservierungsvereinbarung. `shrink-0`
            hält ihn aus dem Umbruch der Kopfzeile heraus. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={zurueckGehen}
          className="-ml-2 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zum Bewerberprofil
        </Button>
        {/* Die Kopfzeile sagt nur noch, wer und wie lange. Welche Folie gerade
            läuft, steht groß in der Bühne darunter und nicht zweimal. */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold truncate">{name}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
              Persönliches Gespräch
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {weg
              ? `${getStrecke(weg)?.label} · ${dauerMinuten(weg, zusatz)} Minuten${terminZeile ? ` · ${terminZeile}` : ""}`
              : "Ohne ausgefülltes Kennenlernen gibt es diesen Termin nicht"}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/*
            Der Punkt pulsiert, solange die Präsentation hängt.
            Ein Wort allein sagt nur, was beim Aufbau der Seite galt. Wer
            teilt, will während des Gesprächs auf einen Blick sehen, dass die
            Verbindung noch steht, ohne den Text zu lesen. Bewegung zeigt das
            besser als Farbe, deshalb der pulsierende Ring. Bei reduzierter
            Bewegung bleibt er stehen, dann trägt die Farbe die Aussage.
          */}
          <Badge
            variant={verbunden ? "default" : "outline"}
            className={`gap-1.5 font-normal ${verbunden ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" : ""}`}
            aria-live="polite"
          >
            {verbunden ? (
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {verbunden ? "Präsentation verbunden" : "Präsentation nicht verbunden"}
          </Badge>
          {termin?.raumPfad && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={termin.raumPfad} target="_blank" rel="noreferrer">
                <Video className="h-3.5 w-3.5" /> Videoraum öffnen
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={praesentationOeffnen}>
            <MonitorPlay className="h-3.5 w-3.5" /> Präsentation öffnen
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVorbereitungOffen((o) => !o)}>
            {vorbereitungOffen ? "Vorbereitung zuklappen" : "Vorbereitung"}
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Nicht mehr pauschal „kein ausgefülltes Kennenlernen": Der Befund
            unterscheidet die vier Fälle und sagt, was zu tun ist. */}
        {!antworten && (
          <Card className="p-4 text-sm" data-testid="moderation-kein-kennenlernen">
            <p className="font-semibold">{befund.titel}</p>
            {befund.text && <p className="text-muted-foreground mt-1">{befund.text}</p>}
            {befund.zuTun && <p className="text-muted-foreground mt-1">{befund.zuTun}</p>}
            <p className="text-muted-foreground mt-1">
              Ohne den Bogen lassen sich weder die Dauer noch die Module bestimmen. Der Weg in die
              Buchung führt deshalb ausschließlich über das Kennenlernen.
            </p>
          </Card>
        )}

        {antworten && folien.length > 0 && folie && weg && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,18rem)]">
            {/* Links: die Bausteine, gewählte wie nicht gewählte. */}
            <Schrittliste
              folien={folien}
              aktiv={aktiv}
              weg={weg}
              zusatz={zusatz}
              begruendung={erfassung.modulBegruendung ?? ""}
              onGeheZu={geheZu}
              onModulZuschalten={(m) => aendern({ module: [...zusatz, m] })}
              onModulEntfernen={(m) => aendern({ module: zusatz.filter((x) => x !== m) })}
              onBegruendung={(text) => aendern({ modulBegruendung: text })}
            />

            {/* Mitte, die Bühne: die laufende Folie, ihr Impuls, die Mitschrift.
                Nur hier steht etwas groß. */}
            <div className="space-y-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {folie.nummerText} · {folie.kicker} · {folie.kopfzeile}
                  </p>
                  <h1 className="text-lg font-semibold leading-tight">{folie.titel}</h1>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => geheZu(aktiv - 1)} disabled={aktiv === 0}>
                    <ChevronLeft className="h-3.5 w-3.5" /> Zurück
                  </Button>
                  <Button size="sm" onClick={() => geheZu(aktiv + 1)} disabled={aktiv >= folien.length - 1}>
                    Weiter <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Der Impuls steht über der Vorschau, weil er das ist, wonach sie
                  spricht. Die Folie sieht der Bewerber ohnehin. */}
              <FolienImpuls weg={weg} bausteinId={folie.bausteinId} />

              {/* Dieselbe Folie wie im geteilten Fenster, nur klein. Die Breite
                  ist an die Fensterhöhe gekoppelt, damit die Mitschrift darunter
                  auf einem Notebook ohne Scrollen erreichbar bleibt. */}
              <div
                className="relative mx-auto w-full overflow-hidden rounded-lg"
                style={{
                  aspectRatio: "16 / 9",
                  // 29rem sind Kopfzeile, Impuls, Mitschrift und Abstände. Was
                  // danach an Fensterhöhe übrig ist, darf die Vorschau haben.
                  // Auf 1280 mal 800 bleibt sie damit rund 340 Pixel hoch.
                  maxWidth: "min(100%, calc((100vh - 29rem) * 16 / 9))",
                }}
              >
                <BewerberVideocallBuehne folien={folien} aktiv={aktiv} eingebettet />
              </div>

              {/* Die Mitschrift: vier Listen und daneben die freie Notiz, ein
                  Strich trennt sie von der Folie. Kein Kasten, kein Rahmen,
                  nur Abstand. Die Notiz steht in einer eigenen Spalte, damit
                  sie der Vorschau darüber keine Höhe wegnimmt. */}
              <div className="grid gap-x-6 gap-y-4 border-t pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <KlickListe
                    titel="Geklärt"
                    hinweis="Was im Gespräch beantwortet wurde."
                    ton="gut"
                    eintraege={liste("geklaert")}
                    platzhalter="Was ist geklärt?"
                    onHinzufuegen={(t) => ergaenzen("geklaert", t)}
                    onEntfernen={(i) => streichen("geklaert", i)}
                  />
                  <KlickListe
                    titel="Nachreichen"
                    hinweis="Mit Name und Frist."
                    ton="offen"
                    eintraege={liste("nachreichen")}
                    platzhalter="Was, wer, bis wann?"
                    onHinzufuegen={(t) => ergaenzen("nachreichen", t)}
                    onEntfernen={(i) => streichen("nachreichen", i)}
                  />
                  <KlickListe
                    titel="Beobachtung, arbeitsbezogen"
                    hinweis="Ein Beispiel, kein Eindruck."
                    eintraege={liste("beobachtungen")}
                    platzhalter="Beispiel aus dem Gespräch"
                    onHinzufuegen={(t) => ergaenzen("beobachtungen", t)}
                    onEntfernen={(i) => streichen("beobachtungen", i)}
                  />
                  <KlickListe
                    titel="Absprache"
                    eintraege={liste("absprachen")}
                    platzhalter="Was wurde vereinbart?"
                    onHinzufuegen={(t) => ergaenzen("absprachen", t)}
                    onEntfernen={(i) => streichen("absprachen", i)}
                  />
                </div>

                <GespraechsNotiz text={notizLesen(erfassung)} onText={notizSchreiben} />
              </div>

              {/* Seine Antworten, unter der Notiz und zugeklappt.
                  Sie standen bis zum 22.09.2026 nur in der Vorbereitung, und
                  die klappt weg, sobald das Gespräch losgeht. Damit waren sie
                  genau dann nicht erreichbar, wenn man sie nachschlägt. Hier
                  stehen sie über das ganze Gespräch hinweg, und weil die Karte
                  ihren Zustand selbst hält, bleibt sie beim Folienwechsel
                  offen. Dieselbe Karte wie im Bewerberprofil im Reiter
                  Videocall, damit beide Stellen gleich aussehen. */}
              <KennenlernbogenKarte antworten={antworten} aufklappbar offenZuBeginn={false} />

              {/* Die Regeln der Strecke ändern sich während des Termins nicht.
                  Sie liegen deshalb zugeklappt, einen Klick entfernt. */}
              <StreckenRegeln weg={weg} />
            </div>

            {/* Rechts: seine Tagesordnung, die bestätigten Punkte, der Abschluss.
                Die beiden oberen Abschnitte kommen ohne Karte aus, damit der
                Abschluss darunter die einzige umrandete Fläche der Spalte ist
                und deshalb ohne Suchen gefunden wird. */}
            <div className="space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Seine Tagesordnung
                </p>
                <ul className="space-y-1">
                  {themenLabels(antworten).map((t) => {
                    const erledigt = liste("geklaert").some((g) => g.toLowerCase().includes(t.toLowerCase().slice(0, 8)));
                    return (
                      <li key={t} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 mt-[3px]">{erledigt ? "✓" : "○"}</span>
                        <span className="leading-snug">{t}</span>
                      </li>
                    );
                  })}
                  {themenLabels(antworten).length === 0 && (
                    <li className="text-[11px] text-muted-foreground">Er hat kein Thema markiert.</li>
                  )}
                </ul>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Im Gespräch bestätigt
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug mb-1">
                  Zu Beginn leer. Was hier steht, hast du gehört und nicht im Bogen gelesen.
                </p>
                <ul className="space-y-0.5">
                  {merkmale(antworten).map((m) => {
                    const an = (erfassung.bestaetigt ?? []).includes(m.id);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => merkmalUmschalten(m.id)}
                          className={`w-full text-left flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted ${
                            an ? "font-semibold" : "text-muted-foreground"
                          }`}
                        >
                          <span className="w-3 shrink-0">{an ? "✓" : "○"}</span>
                          <span className="flex-1">{m.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Am Ende dieselben vier Knöpfe wie im Reiter, dazu der Wunsch
                  des Bewerbers und, wo er zu einem Schriftstück führt, die
                  Adressen. Die Bausteine liegen in VideocallAbschluss.tsx,
                  damit Reiter und Moderation nicht auseinanderlaufen. `knapp`
                  lässt hier die erklärenden Sätze weg: Wer moderiert, liest
                  sie nicht, und ohne sie bleibt der Abschluss kurz genug, um
                  nicht die ganze Spalte zu füllen. */}
              <GespraechBeendenKarte
                knapp
                erfassung={erfassung}
                canEdit={darfBearbeiten}
                abgeschlossenAm={abgeschlossenAm}
                vertragsAdresse={vertragsAdresse}
                rechnungsAdresse={adressenIdentisch ? vertragsAdresse : rechnungsAdresse}
                identisch={adressenIdentisch}
                onAendern={aendern}
                onVertragsAdresse={(wert) => {
                  setVertragsAdresse(wert);
                  adressenAblegen(wert, rechnungsAdresse, adressenIdentisch);
                }}
                onRechnungsAdresse={(wert) => {
                  setRechnungsAdresse(wert);
                  adressenAblegen(vertragsAdresse, wert, false);
                }}
                onIdentisch={(an) => {
                  setAdressenIdentisch(an);
                  adressenAblegen(vertragsAdresse, rechnungsAdresse, an);
                }}
                onAbschliessen={abschliessen}
                onZwischenspeichern={zwischenspeichern}
                onKeinInteresse={() => absageOeffnen("kein_interesse")}
                onAbgelehnt={() => absageOeffnen("abgelehnt", (erfassung.entscheidungGrund ?? "").trim())}
              />
            </div>
          </div>
        )}

        {/* Die Vorbereitung steht unter dem Gespräch, nicht darüber: Sie gilt
            zwei bis drei Minuten lang, das Gespräch danach eine Stunde. Der
            Knopf in der Kopfzeile klappt sie weg, sobald es losgeht. */}
        {antworten && vorbereitungOffen && (
          <section className="border-t pt-4 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Vorbereitung, vor dem ersten Satz
            </p>
            <Vorbereitung antworten={antworten} erfassung={erfassung} vorname={vorname} />
            {/* Die vollständige Übersicht stand bis zum 22.09.2026 hier. Sie
                ist jetzt unter die Notiz gewandert, statt an beiden Stellen
                doppelt zu stehen: Dort ist sie auch dann erreichbar, wenn
                diese Vorbereitung zugeklappt ist. */}
          </section>
        )}
      </main>

      {/* Erscheint nur, solange die Präsentation hängt. Der Weg zurück
          beendet diese Seite, und mit ihr den Kanal zum Bewerberfenster: Die
          Folien dort bleiben stehen, wo sie gerade sind, und folgen nicht
          mehr. Deshalb sagt die Rückfrage genau das und nicht „ungespeicherte
          Änderungen", die es hier nicht gibt. */}
      <AlertDialog open={verlassenOffen} onOpenChange={setVerlassenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--warning))]" />
              Die Präsentation läuft noch
            </AlertDialogTitle>
            <AlertDialogDescription>
              Das geteilte Fenster hängt an dieser Seite. Gehst du zurück, bleibt es auf der
              aktuellen Folie stehen und folgt dir nicht mehr. Deine Mitschrift ist bereits
              abgelegt, die geht dabei nicht verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogCancel className="mt-0 w-full">Im Gespräch bleiben</AlertDialogCancel>
            <AlertDialogAction className="w-full" onClick={moderationVerlassen}>
              Zurück zum Bewerberprofil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AbsageDialog
        open={absageOffen}
        onOpenChange={setAbsageOffen}
        modus={absageModus}
        initialGrund={absageGrund || bewerber.erstgespraechSkript?.absageGrund || ""}
        bewerberEmail={bewerber.email}
        onBestaetigen={(grund, mail) => ablehnen(grund, absageModus, mail)}
      />
    </div>
  );
}
