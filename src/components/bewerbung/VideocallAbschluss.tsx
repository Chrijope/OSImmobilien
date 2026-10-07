/**
 * Der Abschluss des persönlichen Gesprächs, als Bausteine für beide Fenster.
 *
 * Der Reiter Videocall und die Moderation zeigen am Ende dasselbe:
 *
 *   1. **Die Entscheidung von MOREImmo.** Drei Möglichkeiten, wie auf der
 *      letzten Folie. „Nicht möglich" verlangt einen Grund.
 *   2. **Den Wunsch des Bewerbers.** Die drei Türen derselben Folie. Sie sind
 *      ausdrücklich getrennt von der Entscheidung des Hauses und können anders
 *      ausfallen.
 *   3. **Die Adressen**, sobald der Wunsch zu einem Schriftstück führt, also
 *      bei „Will starten" und bei „Möchte die Unterlagen".
 *   4. **Die vier Knöpfe**: abschließen, zwischenspeichern, kein Interesse,
 *      abgelehnt.
 *
 * Beide Fenster benutzen dieselben Bausteine, damit sie nicht auseinanderlaufen
 * können. Die Wirkung des Abschlusses liegt in `useBewerberVideocall.ts`.
 */
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { CheckCircle2, Save, XCircle } from "lucide-react";
import {
  ENTSCHEIDUNG_LABELS,
  UNTERLAGEN_NOTIZ_VORGABE,
  WUNSCH_LABELS,
  abschlussWirkung,
  brauchtAdressen,
  folgeterminVorschlag,
  type VideocallErfassung,
} from "@/lib/bewerberVideocall";

/**
 * Was bei „Noch Klärung erforderlich" zu tun ist: der Punkt und der Termin.
 *
 * Bis zum 07.09.2026 hatte diese Wahl keine Folge. Sie setzte den Status auf
 * Bedenkzeit, und damit war die Klärung nirgends festgehalten und niemandem
 * zugeteilt. Jetzt braucht sie beides: den Wortlaut dessen, was offen ist, und
 * einen Termin, an dem es wieder auf den Tisch kommt.
 *
 * Der Vorschlag für den Termin steht bereits im Feld, wenn die Wahl fällt. Er
 * ist ein Vorschlag und bleibt änderbar.
 */
export function KlaerungErfassung({
  erfassung,
  canEdit,
  onAendern,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  onAendern: (patch: Partial<VideocallErfassung>) => void;
}) {
  const datum = erfassung.klaerungDatum ?? "";
  const uhrzeit = erfassung.klaerungUhrzeit ?? "";

  // Vorbelegen, sobald die Wahl fällt: in einer Woche, zur selben Tageszeit.
  useEffect(() => {
    if (!canEdit || datum) return;
    const vorschlag = folgeterminVorschlag();
    onAendern({ klaerungDatum: vorschlag.datum, klaerungUhrzeit: uhrzeit || vorschlag.uhrzeit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, datum]);

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
      <div className="space-y-1">
        <Label htmlFor="videocall-klaerung" className="text-[11px] font-semibold">
          Was ist noch zu klären? (Pflichtfeld)
        </Label>
        <Textarea
          id="videocall-klaerung"
          rows={3}
          disabled={!canEdit}
          value={erfassung.klaerungBedarf ?? ""}
          onChange={(e) => onAendern({ klaerungBedarf: e.target.value })}
          placeholder="z. B. Umfang der Erlaubnis nach Paragraf 34c, er fragt bei der Behörde nach"
          className="text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Folgetermin (Pflichtfeld)</Label>
        <DateInput
          value={datum}
          disabled={!canEdit}
          onChange={(wert) => onAendern({ klaerungDatum: wert })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="videocall-klaerung-uhrzeit" className="text-[11px] text-muted-foreground">
          Uhrzeit (optional)
        </Label>
        <Input
          id="videocall-klaerung-uhrzeit"
          type="time"
          disabled={!canEdit}
          value={uhrzeit}
          onChange={(e) => onAendern({ klaerungUhrzeit: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Der Text wird die Notiz des Follow-ups. Der Termin steht danach in der Übersicht des
        Profils und erscheint am Fälligkeitstag in der Inbox.
      </p>
    </div>
  );
}

/**
 * Das Nachfassen, wenn er nur die Unterlagen wollte.
 *
 * Bis zum 08.09.2026 endete diese Wahl im Closing, als wäre er startbereit.
 * Sie tut jetzt, was sie sagt: Der Startfahrplan geht per Mail hinaus, und
 * hier steht, wann jemand nachfasst. Ohne Datum bliebe die Entscheidung bei
 * ihm liegen, und niemand im Haus wüsste davon.
 *
 * Der Vorschlag steht schon im Feld, sobald die Wahl fällt. Er ist ein
 * Vorschlag und bleibt änderbar.
 */
export function UnterlagenErfassung({
  erfassung,
  canEdit,
  onAendern,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  onAendern: (patch: Partial<VideocallErfassung>) => void;
}) {
  const datum = erfassung.unterlagenDatum ?? "";
  const uhrzeit = erfassung.unterlagenUhrzeit ?? "";

  useEffect(() => {
    if (!canEdit || datum) return;
    const vorschlag = folgeterminVorschlag();
    onAendern({ unterlagenDatum: vorschlag.datum, unterlagenUhrzeit: uhrzeit || vorschlag.uhrzeit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, datum]);

  return (
    <div
      className="space-y-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-2.5"
      data-testid="videocall-unterlagen"
    >
      <p className="text-[11px] font-semibold">Nachfassen zum Startfahrplan</p>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Wann fassen wir nach? (Pflichtfeld)</Label>
        <DateInput
          value={datum}
          disabled={!canEdit}
          onChange={(wert) => onAendern({ unterlagenDatum: wert })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="videocall-unterlagen-uhrzeit" className="text-[11px] text-muted-foreground">
          Uhrzeit (optional)
        </Label>
        <Input
          id="videocall-unterlagen-uhrzeit"
          type="time"
          disabled={!canEdit}
          value={uhrzeit}
          onChange={(e) => onAendern({ unterlagenUhrzeit: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="videocall-unterlagen-notiz" className="text-[11px] text-muted-foreground">
          Notiz (optional)
        </Label>
        <Textarea
          id="videocall-unterlagen-notiz"
          rows={2}
          disabled={!canEdit}
          value={erfassung.unterlagenNotiz ?? ""}
          onChange={(e) => onAendern({ unterlagenNotiz: e.target.value })}
          placeholder={UNTERLAGEN_NOTIZ_VORGABE}
          className="text-xs"
        />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Beim Abschließen geht der Startfahrplan als PDF per Mail an ihn. Der Termin steht danach
        in der Übersicht des Profils und erscheint am Fälligkeitstag in der Inbox.
      </p>
    </div>
  );
}

/** Die Entscheidung des Hauses, drei Knöpfe und was jeweils daran hängt. */
export function EntscheidungWahl({
  erfassung,
  canEdit,
  onAendern,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  onAendern: (patch: Partial<VideocallErfassung>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Unsere Einschätzung <span className="font-normal text-amber-700">Pflicht</span></p>
      <div className="space-y-1">
        {(Object.keys(ENTSCHEIDUNG_LABELS) as (keyof typeof ENTSCHEIDUNG_LABELS)[]).map((wert) => (
          <Button
            key={wert}
            size="sm"
            disabled={!canEdit}
            variant={erfassung.entscheidung === wert ? "default" : "outline"}
            className="w-full justify-start text-xs h-8"
            onClick={() => onAendern({ entscheidung: erfassung.entscheidung === wert ? "" : wert })}
          >
            {ENTSCHEIDUNG_LABELS[wert]}
          </Button>
        ))}
      </div>
      {erfassung.entscheidung === "nicht_moeglich" && (
        <Input
          value={erfassung.entscheidungGrund ?? ""}
          disabled={!canEdit}
          onChange={(e) => onAendern({ entscheidungGrund: e.target.value })}
          placeholder="Grund, in einem Satz"
          className="h-8 text-xs"
        />
      )}
      {/* Bei „Passt für ihn nicht" endet das Gespräch ohne Klärung, dann wäre
          ein Pflichtfeld für den Folgetermin schlicht falsch. */}
      {erfassung.entscheidung === "klaerung" && erfassung.wunsch !== "passt_nicht" && (
        <KlaerungErfassung erfassung={erfassung} canEdit={canEdit} onAendern={onAendern} />
      )}
    </div>
  );
}

/**
 * Die drei Türen der letzten Folie: was der Bewerber will.
 *
 * `knapp` lässt den erklärenden Satz weg. Die Moderation nutzt das: Wer
 * währenddessen spricht, liest keine Erklärung, und die gesparte Höhe fehlt
 * dort an anderer Stelle. Im Reiter bleibt der Satz stehen.
 */
export function WunschWahl({
  erfassung,
  canEdit,
  knapp = false,
  onAendern,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  knapp?: boolean;
  onAendern: (patch: Partial<VideocallErfassung>) => void;
}) {
  const gewaehlt = erfassung.wunsch ?? "";
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Und was er will <span className="font-normal text-amber-700">Pflicht</span></p>
      {!knapp && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Die drei Türen der letzten Folie. Sie hängen nicht an unserer Einschätzung und dürfen
          anders ausfallen.
        </p>
      )}
      <div className="space-y-1">
        {(Object.keys(WUNSCH_LABELS) as (keyof typeof WUNSCH_LABELS)[]).map((wert) => (
          <Button
            key={wert}
            size="sm"
            disabled={!canEdit}
            variant={gewaehlt === wert ? "default" : "outline"}
            className="w-full justify-start text-xs h-8"
            onClick={() => onAendern({ wunsch: gewaehlt === wert ? "" : wert })}
          >
            {WUNSCH_LABELS[wert].label}
          </Button>
        ))}
      </div>
      {gewaehlt && (
        <p className="text-[11px] leading-snug text-muted-foreground">{WUNSCH_LABELS[gewaehlt].hinweis}</p>
      )}
      {/* Bei „Klärung" steht der Termin schon im Klärungsblock darüber, und
          der Abschluss schickt den Startfahrplan trotzdem mit. Zwei Terminfelder
          nebeneinander wären nur die Frage, welches nun gilt. */}
      {gewaehlt === "unterlagen" && erfassung.entscheidung !== "klaerung"
        && erfassung.entscheidung !== "nicht_moeglich" && (
        <UnterlagenErfassung erfassung={erfassung} canEdit={canEdit} onAendern={onAendern} />
      )}
    </div>
  );
}

/**
 * Vertragsanschrift und Rechnungsadresse.
 *
 * Sie erscheinen nur, wenn der Wunsch zu einem Schriftstück führt. Ohne beide
 * lässt sich im Closing kein Vertrag erstellen, deshalb werden sie hier
 * erfasst, solange der Bewerber noch im Gespräch ist.
 */
export function AdressenErfassung({
  vertragsAdresse,
  rechnungsAdresse,
  identisch,
  canEdit,
  knapp = false,
  onVertragsAdresse,
  onRechnungsAdresse,
  onIdentisch,
}: {
  vertragsAdresse: string;
  rechnungsAdresse: string;
  identisch: boolean;
  canEdit: boolean;
  /** Ohne den Schlusssatz, für die Moderation. */
  knapp?: boolean;
  onVertragsAdresse: (wert: string) => void;
  onRechnungsAdresse: (wert: string) => void;
  onIdentisch: (an: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Vertragsanschrift und Rechnungsadresse</p>
      <div className="space-y-1">
        <Label htmlFor="videocall-vertragsadresse" className="text-[11px] text-muted-foreground">
          Vertragsanschrift, mit Name
        </Label>
        <Textarea
          id="videocall-vertragsadresse"
          rows={3}
          disabled={!canEdit}
          value={vertragsAdresse}
          onChange={(e) => onVertragsAdresse(e.target.value)}
          placeholder={"Max Mustermann\nMusterstraße 1\n80331 München"}
          className="text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-[11px]">
        <Checkbox
          checked={identisch}
          disabled={!canEdit}
          onCheckedChange={(an) => onIdentisch(an === true)}
        />
        Rechnungsadresse ist identisch
      </label>
      {!identisch && (
        <div className="space-y-1">
          <Label htmlFor="videocall-rechnungsadresse" className="text-[11px] text-muted-foreground">
            Rechnungsadresse
          </Label>
          <Textarea
            id="videocall-rechnungsadresse"
            rows={3}
            disabled={!canEdit}
            value={rechnungsAdresse}
            onChange={(e) => onRechnungsAdresse(e.target.value)}
            className="text-xs"
          />
        </div>
      )}
      {!knapp && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Beides bleibt im Reiter Closing änderbar. Ohne beides lässt sich kein Vertrag erstellen.
        </p>
      )}
    </div>
  );
}

/**
 * Die vier Knöpfe am Ende. Dieselben im Reiter und in der Moderation.
 *
 * Der große Knopf **heißt, was er tut**: Er liest die Einschätzung und den
 * Wunsch zusammen (`abschlussWirkung`) und führt je nach Fall ins Closing, in
 * ein Follow-up mit Termin oder in die Absage mit Grund. Was genau geschieht,
 * steht als Zeile darunter, damit niemand raten muss.
 */
export function AbschlussKnoepfe({
  erfassung,
  canEdit,
  abgeschlossenAm,
  onAbschliessen,
  onZwischenspeichern,
  onKeinInteresse,
  onAbgelehnt,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  /** Gesetzt, sobald das Gespräch einmal abgeschlossen wurde. */
  abgeschlossenAm?: string;
  onAbschliessen: () => void;
  onZwischenspeichern: () => void;
  onKeinInteresse: () => void;
  onAbgelehnt: () => void;
}) {
  const wirkung = abschlussWirkung(erfassung.entscheidung, erfassung.wunsch);
  /*
   * Abschließen geht erst, wenn beides gewählt ist: unsere Einschätzung und
   * was der Bewerber will.
   *
   * Beides zusammen entscheidet, was der Klick auslöst, vom Closing bis zur
   * Absage. Fehlt eine der beiden Angaben, würde stillschweigend der Weg
   * "nur speichern" genommen, und niemand sähe, dass die Hälfte fehlt.
   *
   * Zwischenspeichern, Kein Interesse und Abgelehnt bleiben immer erreichbar:
   * Genau die braucht man, wenn ein Gespräch anders läuft als geplant.
   */
  const fehltEinschaetzung = !erfassung.entscheidung;
  const fehltWunsch = !erfassung.wunsch;
  const nochOffen = fehltEinschaetzung || fehltWunsch;
  const offenText = fehltEinschaetzung && fehltWunsch
    ? "Bitte oben die Einschätzung und den Wunsch des Bewerbers wählen."
    : fehltEinschaetzung
      ? "Bitte oben unsere Einschätzung wählen."
      : "Bitte oben wählen, was der Bewerber will.";
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={!canEdit || nochOffen}
        title={nochOffen ? offenText : undefined}
        onClick={onAbschliessen}
        variant={abgeschlossenAm ? "erfolg" : "brand"}
        className="w-full h-auto whitespace-normal py-2"
        data-testid="videocall-abschliessen"
      >
        <CheckCircle2 className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
        {wirkung.knopf}
      </Button>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={onZwischenspeichern} className="w-full">
        <Save className="mr-1 h-3.5 w-3.5" aria-hidden /> Zwischenspeichern
      </Button>
      {/* Die beiden Absagen stehen nebeneinander: Sie gehören zusammen, und die
          gesparte Höhe fehlt in der Moderation an anderer Stelle. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={onKeinInteresse}
          className="w-full border-amber-600 px-2 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
        >
          <XCircle className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden /> Kein Interesse
        </Button>
        <Button size="sm" variant="destructive" disabled={!canEdit} onClick={onAbgelehnt} className="w-full px-2">
          <XCircle className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden /> Abgelehnt
        </Button>
      </div>
      {nochOffen && (
        <p className="pt-1 text-[11px] leading-snug text-amber-700" data-testid="videocall-offen">
          {offenText}
        </p>
      )}
      <p className="pt-1 text-[10px] leading-snug text-muted-foreground" data-testid="videocall-wirkung">
        {wirkung.wirkung}
        {abgeschlossenAm ? ` Zuletzt abgeschlossen am ${abgeschlossenAm}.` : ""}
      </p>
    </div>
  );
}

/**
 * Die ganze Karte „Gespräch beenden": Einschätzung, Wunsch, Adressen, Knöpfe.
 * Der Reiter zeigt sie in der Seitenleiste, die Moderation an derselben Stelle
 * wie bisher die drei Entscheidungsknöpfe.
 */
export function GespraechBeendenKarte(props: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  /**
   * Ohne die erklärenden Sätze. Die Moderation setzt das, weil dort neben dem
   * Abschluss noch das ganze Gespräch in der Spalte steht.
   */
  knapp?: boolean;
  abgeschlossenAm?: string;
  vertragsAdresse: string;
  rechnungsAdresse: string;
  identisch: boolean;
  onAendern: (patch: Partial<VideocallErfassung>) => void;
  onVertragsAdresse: (wert: string) => void;
  onRechnungsAdresse: (wert: string) => void;
  onIdentisch: (an: boolean) => void;
  onAbschliessen: () => void;
  onZwischenspeichern: () => void;
  onKeinInteresse: () => void;
  onAbgelehnt: () => void;
}) {
  return (
    <Card className="p-4 space-y-3" data-testid="videocall-beenden">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gespräch beenden</p>
      <EntscheidungWahl
        erfassung={props.erfassung}
        canEdit={props.canEdit}
        onAendern={props.onAendern}
      />
      <div className="border-t pt-3">
        <WunschWahl
          erfassung={props.erfassung}
          canEdit={props.canEdit}
          knapp={props.knapp}
          onAendern={props.onAendern}
        />
      </div>
      {brauchtAdressen(props.erfassung.wunsch) && (
        <div className="border-t pt-3">
          <AdressenErfassung
            vertragsAdresse={props.vertragsAdresse}
            rechnungsAdresse={props.rechnungsAdresse}
            identisch={props.identisch}
            canEdit={props.canEdit}
            knapp={props.knapp}
            onVertragsAdresse={props.onVertragsAdresse}
            onRechnungsAdresse={props.onRechnungsAdresse}
            onIdentisch={props.onIdentisch}
          />
        </div>
      )}
      <div className="border-t pt-3">
        <AbschlussKnoepfe
          erfassung={props.erfassung}
          canEdit={props.canEdit}
          abgeschlossenAm={props.abgeschlossenAm}
          onAbschliessen={props.onAbschliessen}
          onZwischenspeichern={props.onZwischenspeichern}
          onKeinInteresse={props.onKeinInteresse}
          onAbgelehnt={props.onAbgelehnt}
        />
      </div>
    </Card>
  );
}
