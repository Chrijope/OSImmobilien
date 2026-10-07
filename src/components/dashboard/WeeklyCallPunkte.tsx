import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronUp, MessageSquarePlus, Pencil, Trash2, Check,
  Paperclip, Video, Upload, History, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import {
  PUNKT_MAX_ZEICHEN, aktuellerCallTermin, aenderePunkt, dokumentAdresse, formatCallTermin,
  hakePunktAb, ladeAnhaenge, ladeAnhangHoch, ladeDokumentHoch, ladeProtokoll, ladePunkte,
  ladeTermine, legePunktAn, loeschePunkt, loescheAnhang, speichereProtokoll,
  type WeeklyCallAnhang, type WeeklyCallProtokoll, type WeeklyCallPunkt, type WeeklyCallTermin,
} from "@/lib/weeklyCallStore";
import { CALL_RUNDEN, rundeUhrzeitText, type CallRunde } from "@/lib/weeklyCallZeit";

/** Wer den Call leitet: abhaken, Aufzeichnung und Unterlagen pflegen. */
const AUFSICHT = ["admin", "inhaber", "vertriebsleiter"];

/**
 * Punkte für den nächsten Weekly Sales Call.
 *
 * Jeder trägt ein, was er besprechen möchte, und alle Teilnehmer sehen die
 * ganze Liste. So weiß jeder vor dem Call, worum es gehen wird.
 *
 * Sichtbarkeit am 26.08.2026 bewusst geändert. Vorher sah jeder nur seine
 * eigenen Punkte, nur die Call-Leitung sah alle. Das war einmal ausdrücklich
 * so gewollt und ist jetzt ebenso ausdrücklich umgestellt. Wer den alten Stand
 * im Verlauf findet, hat also keinen Fehler vor sich.
 *
 * Ohne Namen bleibt es trotzdem. Die Datenbankfunktion gibt keine Verfasser-ID
 * heraus, nur das Kennzeichen "von mir" für die eigene Zeile. Das ist der
 * Grund, warum überhaupt jemand ein unbequemes Thema einträgt. Anonym heißt
 * dabei "anonym in der Anwendung": Die Verfasser-ID steht in der Datenbank,
 * sonst könnte niemand seinen eigenen Punkt ändern, und über den
 * Datenbankzugang ließe sie sich nachschlagen.
 *
 * Ändern und Löschen darf weiterhin nur, wer den Punkt eingetragen hat. Das
 * erzwingen die Zugriffsregeln der Tabelle, nicht diese Oberfläche.
 *
 * Aufzeichnung, Transkript und Zusammenfassung sind für alle sichtbar. Sie
 * hängen am Termin, nicht an einer Person.
 *
 * Seit dem 05.10.2026 gibt es zwei Calls am Montag. Die Liste gehört zu genau
 * einem (`runde`): Punkte des 19:00-Calls sehen nur dessen Teilnehmer, die des
 * 19:30-Calls nur dessen. Die Leitung sieht beide Listen nebeneinander. Die
 * Trennung erzwingt die Datenbank, nicht diese Oberfläche.
 *
 * Gelöscht wird nichts von selbst. Jeder Punkt trägt den Termin des Calls, für
 * den er gedacht war. Nach dem Call ist die Liste von selbst leer, die alten
 * Termine stehen in der Rückschau.
 */
export function WeeklyCallPunkte({
  runde,
  mitProtokoll = true,
}: {
  runde: CallRunde;
  /**
   * Aufzeichnung und Unterlagen hängen am Termin und gelten für beide Calls.
   * Wer beide Listen sieht, pflegt sie nur an einer Stelle.
   */
  mitProtokoll?: boolean;
}) {
  const { user } = useUser();
  const beschriftung = `${rundeUhrzeitText(runde)} Uhr, ${CALL_RUNDEN[runde].gruppe}`;
  const istAufsicht = AUFSICHT.includes(String(user?.role || ""));
  const termin = aktuellerCallTermin();

  // undefined: lädt noch, null: Liste nicht lesbar (etwa Migration offen).
  const [punkte, setPunkte] = useState<WeeklyCallPunkt[] | null | undefined>(undefined);
  const [entwurf, setEntwurf] = useState("");
  const [busy, setBusy] = useState(false);
  const [bearbeitet, setBearbeitet] = useState<{ id: string; text: string } | null>(null);
  const [rueckschauOffen, setRueckschauOffen] = useState(false);

  const laden = useCallback(async () => {
    setPunkte(await ladePunkte(termin, runde));
  }, [termin, runde]);

  useEffect(() => { void laden(); }, [laden]);

  // Die Karte tickt ohnehin jede Minute. Kein Echtzeit-Abo: das würde die
  // Rohzeilen samt Verfasser wieder in den Browser holen.
  useEffect(() => {
    const t = setInterval(() => void laden(), 60_000);
    return () => clearInterval(t);
  }, [laden]);

  if (punkte === undefined) return null;

  /*
   * Liste nicht lesbar, meist weil Migration 20261005160000 noch nicht
   * gelaufen ist. Dann weder die alte, ungetrennte Liste zeigen noch
   * eintragen lassen, sonst landeten 19:30-Punkte später beim 19:00-Call.
   * Ein ruhiger Satz statt einer Fehlermeldung; den technischen Grund sieht
   * nur die Leitung.
   */
  if (punkte === null) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1.5">
          <MessageSquarePlus className="h-3 w-3" /> Punkte für den Call · {beschriftung}
        </p>
        <p className="text-xs text-muted-foreground">Die Punkte für den Call sind gleich wieder da.</p>
        {istAufsicht && (
          <p className="text-[11px] text-muted-foreground">
            Für die Leitung: In Supabase fehlt noch die Migration 20261005160000_weekly_call_zwei_runden.sql.
          </p>
        )}
      </div>
    );
  }

  const eintragen = async () => {
    const text = entwurf.trim();
    if (!text) return;
    setBusy(true);
    const ok = await legePunktAn(text, runde);
    setBusy(false);
    if (!ok) { toast.error("Der Punkt konnte nicht gespeichert werden."); return; }
    setEntwurf("");
    toast.success("Punkt eingetragen. Alle Teilnehmer dieses Calls sehen ihn, aber ohne deinen Namen.");
    void laden();
  };

  const speichern = async () => {
    if (!bearbeitet) return;
    const ok = await aenderePunkt(bearbeitet.id, bearbeitet.text);
    if (!ok) { toast.error("Die Änderung konnte nicht gespeichert werden."); return; }
    setBearbeitet(null);
    void laden();
  };

  const entfernen = async (id: string) => {
    const ja = await confirmDialog({
      title: "Punkt löschen?",
      description: "Der Punkt wird aus der Liste für den nächsten Call entfernt.",
      confirmText: "Löschen",
    });
    if (!ja) return;
    const ok = await loeschePunkt(id);
    if (!ok) { toast.error("Der Punkt konnte nicht gelöscht werden."); return; }
    void laden();
  };

  const abhaken = async (p: WeeklyCallPunkt) => {
    const ok = await hakePunktAb(p.id, !p.besprochen);
    if (!ok) { toast.error("Nicht gespeichert."); return; }
    void laden();
  };

  /*
   * Abgehakte Punkte verschwinden sofort aus der Liste und stehen ab dann
   * unter "Fruehere Calls", zusammen mit der Aufzeichnung. Vorher blieben sie
   * durchgestrichen oben stehen, und die Liste wuchs bis zum Calltag zu.
   * Oben soll Platz fuer das sein, was noch aussteht.
   */
  const offeneP = punkte.filter((p) => !p.besprochen);
  const besprocheneP = punkte.filter((p) => p.besprochen);
  const offen = offeneP.length;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1.5">
          <MessageSquarePlus className="h-3 w-3" /> Punkte für den Call · {beschriftung}
        </p>
        <Badge variant="secondary" className="text-[10px]">
          {offen === 0 ? "noch keine" : `${offen} offen`}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <Textarea
          value={entwurf}
          onChange={(e) => setEntwurf(e.target.value.slice(0, PUNKT_MAX_ZEICHEN))}
          placeholder="Was möchtest du im nächsten Call besprechen?"
          rows={2}
          className="text-xs resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {entwurf.length}/{PUNKT_MAX_ZEICHEN} Zeichen · alle Teilnehmer dieses Calls sehen ihn, aber ohne deinen Namen
          </span>
          <Button size="sm" className="h-7 text-xs" disabled={!entwurf.trim() || busy} onClick={() => void eintragen()}>
            Eintragen
          </Button>
        </div>
      </div>

      {offeneP.length > 0 && (
        <ul className="space-y-1.5">
          {offeneP.map((p) => (
            <li
              key={p.id}
              className="rounded-md border border-border/60 bg-card px-2.5 py-2 text-xs"
            >
              {bearbeitet?.id === p.id ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={bearbeitet.text}
                    onChange={(e) => setBearbeitet({ id: p.id, text: e.target.value.slice(0, PUNKT_MAX_ZEICHEN) })}
                    rows={2}
                    className="text-xs resize-none"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setBearbeitet(null)}>
                      Abbrechen
                    </Button>
                    <Button size="sm" className="h-6 text-[11px]" onClick={() => void speichern()}>
                      Speichern
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{p.text}</span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {p.vonMir && (
                      <>
                        {/*
                         * Seit dem 26.08.2026 stehen fremde Punkte mit in der
                         * Liste. Das Kennzeichen zeigt jedem, welche Zeile
                         * seine eigene ist, denn nur die laesst sich aendern
                         * und loeschen.
                         */}
                        <span className="text-[9px] uppercase tracking-wide text-primary font-semibold mr-1">von mir</span>
                        <button
                          type="button"
                          title="Ändern"
                          className="p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setBearbeitet({ id: p.id, text: p.text })}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Löschen"
                          className="p-1 text-muted-foreground hover:text-destructive"
                          onClick={() => void entfernen(p.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    {istAufsicht && (
                      <button
                        type="button"
                        title="Im Call besprochen, wandert zu den früheren Calls"
                        className="p-1 text-muted-foreground hover:text-primary"
                        onClick={() => void abhaken(p)}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {istAufsicht && mitProtokoll && <ProtokollBlock termin={termin} />}

      <div>
        <button
          type="button"
          onClick={() => setRueckschauOffen((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {rueckschauOffen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <History className="h-3 w-3" /> Frühere Calls
        </button>
        {rueckschauOffen && (
          <Rueckschau
            aktuellerTermin={termin}
            runde={runde}
            istAufsicht={istAufsicht}
            mitProtokoll={mitProtokoll}
            besprocheneImLaufenden={besprocheneP}
            onGeaendert={() => void laden()}
          />
        )}
      </div>
    </div>
  );
}

/** Aufzeichnung und Unterlagen zu einem Call, nur für die Aufsicht. */
function ProtokollBlock({ termin }: { termin: string }) {
  const [protokoll, setProtokoll] = useState<WeeklyCallProtokoll | null>(null);
  const [anhaenge, setAnhaenge] = useState<WeeklyCallAnhang[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const dateiFeld = useRef<HTMLInputElement>(null);
  const anhangFeld = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    const p = await ladeProtokoll(termin);
    setProtokoll(p);
    setUrl(p?.aufzeichnungUrl || "");
    setAnhaenge(await ladeAnhaenge(termin));
  }, [termin]);

  useEffect(() => { void laden(); }, [laden]);

  const urlSpeichern = async () => {
    setBusy(true);
    const ok = await speichereProtokoll(termin, { aufzeichnungUrl: url.trim() });
    setBusy(false);
    if (!ok) { toast.error("Der Link konnte nicht gespeichert werden."); return; }
    toast.success("Link zur Aufzeichnung gespeichert.");
    void laden();
  };

  const hochladen = async (datei?: File | null) => {
    if (!datei) return;
    setBusy(true);
    const ok = await ladeDokumentHoch(termin, datei);
    setBusy(false);
    if (!ok) { toast.error("Die Datei konnte nicht hochgeladen werden."); return; }
    toast.success("Unterlage hinterlegt.");
    void laden();
  };

  /** Weitere Dateien zum Call, beliebig viele neben Transkript und Zusammenfassung. */
  const anhaengeHochladen = async (dateien?: FileList | null) => {
    if (!dateien || dateien.length === 0) return;
    setBusy(true);
    let fehler = "";
    for (const datei of Array.from(dateien)) {
      const meldung = await ladeAnhangHoch(termin, datei);
      if (meldung) fehler = meldung;
    }
    setBusy(false);
    if (fehler) toast.error(`Nicht alles konnte hochgeladen werden: ${fehler}`);
    else toast.success(dateien.length === 1 ? "Anhang hinterlegt." : "Anhänge hinterlegt.");
    void laden();
  };

  const anhangEntfernen = async (a: WeeklyCallAnhang) => {
    const sicher = await confirmDialog({
      title: "Anhang löschen",
      description: `„${a.name}“ wird aus diesem Call entfernt.`,
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!sicher) return;
    const ok = await loescheAnhang(a.pfad);
    if (!ok) { toast.error("Der Anhang konnte nicht gelöscht werden."); return; }
    void laden();
  };

  return (
    <div className="rounded-md border border-dashed border-border/60 p-2.5 space-y-2">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        Aufzeichnung und Unterlagen
      </p>
      <div className="flex gap-1.5">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link zur Gesprächsaufzeichnung"
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={() => void urlSpeichern()}>
          Speichern
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={dateiFeld}
          type="file"
          accept="application/pdf,text/plain"
          className="hidden"
          onChange={(e) => void hochladen(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => dateiFeld.current?.click()}
        >
          <Upload className="h-3 w-3 mr-1" /> Transkript oder Zusammenfassung
        </Button>
        {protokoll?.dokumentName && (
          <span className="text-[10px] text-muted-foreground truncate">{protokoll.dokumentName}</span>
        )}
      </div>

      {/* Alles Weitere zum Call: Folien, Tabellen, Bilder, beliebig viele. */}
      <div className="space-y-1.5 border-t border-border/50 pt-2">
        <input
          ref={anhangFeld}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { void anhaengeHochladen(e.target.files); e.target.value = ""; }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => anhangFeld.current?.click()}
        >
          <Paperclip className="h-3 w-3 mr-1" /> Weitere Dateien anhängen
        </Button>
        {anhaenge.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">Noch keine weiteren Dateien.</p>
        ) : (
          <ul className="space-y-1">
            {anhaenge.map((a) => (
              <li key={a.pfad} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void anhangOeffnen(a.pfad)}
                  className="min-w-0 flex-1 truncate text-left text-[11px] text-primary hover:underline"
                >
                  {a.name}
                </button>
                <button
                  type="button"
                  title="Löschen"
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => void anhangEntfernen(a)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Öffnet eine hinterlegte Datei über eine zeitlich begrenzte Adresse. */
async function anhangOeffnen(pfad: string) {
  const adresse = await dokumentAdresse(pfad);
  if (!adresse) { toast.error("Die Datei konnte nicht geöffnet werden."); return; }
  window.open(adresse, "_blank", "noopener");
}

/**
 * Die frueheren Calls, nach Datum gegliedert.
 *
 * Enthaelt auch den laufenden Termin, sobald dort Punkte abgehakt sind: Ein
 * besprochener Punkt gehoert zum Protokoll, nicht mehr auf die Sammelliste.
 */
function Rueckschau({
  aktuellerTermin,
  runde,
  istAufsicht,
  mitProtokoll,
  besprocheneImLaufenden,
  onGeaendert,
}: {
  aktuellerTermin: string;
  runde: CallRunde;
  istAufsicht: boolean;
  mitProtokoll: boolean;
  besprocheneImLaufenden: WeeklyCallPunkt[];
  onGeaendert: () => void;
}) {
  const [termine, setTermine] = useState<WeeklyCallTermin[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [inhalt, setInhalt] = useState<WeeklyCallPunkt[]>([]);
  const [protokoll, setProtokoll] = useState<WeeklyCallProtokoll | null>(null);
  const [anhaenge, setAnhaenge] = useState<WeeklyCallAnhang[]>([]);

  useEffect(() => {
    void (async () => {
      const alle = await ladeTermine(runde);
      setTermine(alle.filter((t) => t.callTermin !== aktuellerTermin));
    })();
  }, [aktuellerTermin, runde]);

  const aufklappen = async (t: string) => {
    if (offen === t) { setOffen(null); return; }
    setOffen(t);
    if (t === aktuellerTermin) {
      setInhalt(besprocheneImLaufenden);
    } else {
      setInhalt((await ladePunkte(t, runde)) || []);
    }
    setProtokoll(await ladeProtokoll(t));
    setAnhaenge(await ladeAnhaenge(t));
  };

  const wiederOeffnen = async (id: string) => {
    const ok = await hakePunktAb(id, false);
    if (!ok) { toast.error("Nicht gespeichert."); return; }
    setInhalt((liste) => liste.filter((p) => p.id !== id));
    onGeaendert();
  };

  const dokumentOeffnen = async (pfad: string) => {
    const adresse = await dokumentAdresse(pfad);
    if (!adresse) { toast.error("Die Unterlage konnte nicht geöffnet werden."); return; }
    window.open(adresse, "_blank", "noopener");
  };

  /*
   * Der laufende Termin steht mit ganz oben, sobald dort etwas abgehakt wurde.
   * Er traegt einen Zusatz, damit er nicht mit einem vergangenen Call
   * verwechselt wird.
   */
  const eintraege: Array<WeeklyCallTermin & { laufend?: boolean }> =
    besprocheneImLaufenden.length > 0
      ? [{ callTermin: aktuellerTermin, anzahl: besprocheneImLaufenden.length, laufend: true }, ...termine]
      : termine;

  if (eintraege.length === 0) {
    return <p className="mt-2 text-[11px] text-muted-foreground italic">Noch keine besprochenen Punkte.</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {eintraege.map((t) => (
        <div key={t.callTermin} className="rounded-md border border-border/50 bg-card">
          <button
            type="button"
            onClick={() => void aufklappen(t.callTermin)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold">
              {formatCallTermin(t.callTermin)}
              {t.laufend && (
                <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">
                  (anstehender Call)
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t.anzahl} {t.anzahl === 1 ? "Punkt" : "Punkte"}
            </span>
          </button>
          {offen === t.callTermin && (
            <div className="border-t border-border/50 px-2.5 py-2 space-y-1.5">
              {inhalt.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">Keine Punkte eingetragen.</p>
              )}
              {inhalt.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                    · {p.text}
                  </p>
                  {istAufsicht && t.laufend && (
                    <button
                      type="button"
                      title="Doch nicht besprochen, zurück auf die Liste"
                      className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => void wiederOeffnen(p.id)}
                    >
                      <Undo2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {protokoll?.aufzeichnungUrl && (
                <a
                  href={protokoll.aufzeichnungUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Video className="h-3 w-3" /> Aufzeichnung ansehen
                </a>
              )}
              {protokoll?.dokumentPfad && (
                <button
                  type="button"
                  onClick={() => void dokumentOeffnen(protokoll.dokumentPfad!)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {protokoll.dokumentName || "Unterlage öffnen"}
                </button>
              )}
              {/* Weitere Anhaenge sind fuer alle sichtbar, gepflegt werden sie unten. */}
              {anhaenge.map((a) => (
                <button
                  key={a.pfad}
                  type="button"
                  onClick={() => void anhangOeffnen(a.pfad)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {a.name}
                </button>
              ))}
              {istAufsicht && mitProtokoll && !t.laufend && <ProtokollBlock termin={t.callTermin} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
