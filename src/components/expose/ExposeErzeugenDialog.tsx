import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Link2, Loader2, Mail, Search, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ObjektData } from "@/lib/objekteStore";
import { weitereEinheiten } from "@/lib/objektKennzahlen";
import {
  exposePfad, KUNDENLINK_ART_STANDARD, kundeHatEmail, kundenlinkAufDieserAdresse, kundenZurAuswahl, ladeKundenlinkAuswahl,
  objektExposePfad, sendeKundenExpose, type KundenlinkArt,
} from "@/lib/objektExposeStore";
import { kundenansichtVorschauPfad } from "@/lib/kundenansichtZiel";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { investmentAuswahlStand } from "@/lib/investmentAuswahl";
import { istSaHinterlegtAusMeta } from "@/lib/unterlagenFreigabe";
import { selbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";
import { onCacheChange } from "@/lib/dataCache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { kundenSprache } from "@/lib/kundenSprache";
import { englischeObjektTexteAnfordern, englischeObjektTexteFehlen } from "@/lib/objektTexteKi";
import { kopiereText } from "@/lib/textKopieren";
import { formatDatum, cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { useVertretungen } from "@/hooks/useVertretungen";
import { darfKontaktBearbeiten, isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { getKontaktById } from "@/lib/kundenStore";

/*
 * Stand der Selbstauskunft je Investment, nur als Hinweis in der Auswahl
 * (Wunsch Geschäftsführung, 05.10.2026). Gesperrt wird nichts, jedes
 * Investment bleibt wählbar. „Liegt vor“ ist dieselbe Regel wie für die
 * Unterlagen-Freischaltung und das Portal (`istSaHinterlegtAusMeta`), der
 * Selbstfinanzierer-Vermerk kommt aus `selbstauskunftEntfaellt`.
 */
const SA_STAND = {
  liegtVor: { text: "Selbstauskunft liegt vor", punkt: "bg-alert-green" },
  entfaellt: { text: "Selbstfinanzierer, keine Selbstauskunft nötig", punkt: "bg-alert-green" },
  fehlt: { text: "noch keine Selbstauskunft", punkt: "bg-alert-red" },
} as const;

function saStandVon(inv: { id: string; meta?: Record<string, unknown> } | undefined) {
  if (!inv) return SA_STAND.fehlt;
  if (istSaHinterlegtAusMeta(inv.meta)) return SA_STAND.liegtVor;
  if (selbstauskunftEntfaellt(inv.id)) return SA_STAND.entfaellt;
  return SA_STAND.fehlt;
}

function InvestmentMitSaStand({ bezeichnung, inv }: { bezeichnung: string; inv?: { id: string; meta?: Record<string, unknown> } }) {
  const stand = saStandVon(inv);
  return (
    <span className="inline-flex min-w-0 items-center gap-2" data-testid="expose-investment-sa">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", stand.punkt)} aria-hidden />
      <span className="min-w-0 truncate">{bezeichnung} · {stand.text}</span>
    </span>
  );
}

/**
 * „Kundenlink senden“: der eine Weg, einem Kunden einen Link zu geben.
 *
 * Seit dem 23.09.2026 (Bauplan Kundenansicht, Freigabe von Christian): Erst
 * die Art wählen, dann Kunde und Investment, dann per Mail senden (Mail mit
 * Knopf zum persönlichen Link) oder den Link kopieren, etwa für WhatsApp.
 *   - „Objektübersicht mit allen freien Wohnungen“ (Standard): ein Link je
 *     Kunde, Investment und Haus. Er öffnet bei der gewählten Wohnung; wer
 *     später aus einer anderen Wohnung sendet, schickt denselben Link mit
 *     neuem Einstieg und neuer Frist.
 *     Seit dem 05.10.2026 wählt man dabei, welche Wohnungen der Kunde
 *     sieht (Kästchen je Wohnung). Vorgewählt ist nur die Wohnung, bei der
 *     der Link öffnet; gibt es den Link schon, seine bisherige Auswahl.
 *     Erneut senden ersetzt sie. Die Einschränkung gilt auf dem Server
 *     (`objekt_exposes.wohnung_auswahl`, ausgeliefert von
 *     `get-kundenansicht`). Sind alle angehakt, geht `null` hinaus, also
 *     „alle freien“ wie bei jedem Link vor der Auswahl.
 *   - „nur Exposé dieser Wohnung“: wie bisher ein Link je Einheit.
 * Beides legt den Link im Kundenprofil beim Investment unter „Gesendete
 * Links“ ab (`GesendeteExposes`). Das Senden erledigt die Edge Function
 * `send-kunden-expose`; die Empfängeradresse nimmt sie nur aus dem Kontakt.
 *
 * Der Link rechnet immer mit neutralen Standardannahmen, nie mit Werten aus
 * der Selbstauskunft, denn er kann weitergeleitet werden. Er gilt 60 Tage.
 *
 * `ganzesObjekt` meint das ganze Haus (Globalobjekt): Objektübersicht auf
 * der Hausebene oder Exposé des ganzen Objekts, ohne Wahl der Einheit.
 *
 * Seit dem 05.10.2026 senden auch Vertriebsleitung und Vertriebspartner.
 * Ein Vertriebspartner sieht in der Kundenauswahl nur eigene und vertretene
 * Kunden (nach aktiver Rolle, wie die Kontaktliste). Das ist nur die
 * Anzeige: `send-kunden-expose` prüft dieselbe Regel noch einmal
 * (`pruefeKontaktZugriff`).
 */
export function ExposeErzeugenDialog({
  objekt, offen, onOpenChange, vorgewaehlteWohnungId, ganzesObjekt = false, vorgewaehlterKundeId,
  vorgewaehltesInvestmentId, vorgewaehlteArt = KUNDENLINK_ART_STANDARD,
}: {
  objekt: ObjektData;
  offen: boolean;
  onOpenChange: (o: boolean) => void;
  vorgewaehlteWohnungId?: string;
  ganzesObjekt?: boolean;
  vorgewaehlterKundeId?: string | null;
  /** Aus der Objektauswahl eines Kunden: dessen Investment steht dann schon fest. */
  vorgewaehltesInvestmentId?: string | null;
  vorgewaehlteArt?: KundenlinkArt;
}) {
  const einheiten = useMemo(() => weitereEinheiten(objekt.wohnungen), [objekt.wohnungen]);
  const [art, setArt] = useState<KundenlinkArt>(vorgewaehlteArt);
  const [wohnungId, setWohnungId] = useState<string>(vorgewaehlteWohnungId || einheiten[0]?.id || "");
  const [suche, setSuche] = useState("");
  const [kundeIdAuswahl, setKundeId] = useState<string | null>(vorgewaehlterKundeId ?? null);
  const [gewaehltesInvestment, setGewaehltesInvestment] = useState<string | null>(vorgewaehltesInvestmentId ?? null);
  const [laeuft, setLaeuft] = useState<"mail" | "link" | null>(null);
  const [erzeugterLink, setErzeugterLink] = useState<string | null>(null);
  // Welche Wohnungen der Kunde über die Objektübersicht sieht. Vorgewählt nur der Einstieg.
  const [gewaehlteWohnungen, setGewaehlteWohnungen] = useState<string[]>(() => (wohnungId ? [wohnungId] : []));
  const [bestehenderLink, setBestehenderLink] = useState(false);
  // Die Auswahl des bestehenden Links, `null` für alle freien. Solange sie lädt, ist die Auswahl gesperrt.
  const [bestehendeAuswahl, setBestehendeAuswahl] = useState<string[] | null>(null);
  const [auswahlLaedt, setAuswahlLaedt] = useState(false);

  /*
   * Der Zwischenspeicher füllt sich beim Start nach und nach. Ohne dieses
   * Mitzählen bliebe die Kundenliste leer, wenn der Dialog kurz nach dem
   * Laden geöffnet wird (dasselbe Muster wie in KundeUndInvestment).
   */
  const [stand, setStand] = useState(0);
  useEffect(() => onCacheChange((tabelle) => {
    if (tabelle === "kontakte" || tabelle === "investments") setStand((n) => n + 1);
  }), []);

  const { user, authUser } = useUser();
  const eigeneId = authUser?.id ?? null;
  const vertretungFuer = useVertretungen(eigeneId);
  // Leitung, Backoffice und Admin sehen alle Kunden, alle übrigen nur ihre eigenen und vertretenen.
  const nurEigeneKunden = !isTeamWideKontaktRole(user.role);
  const kunden = useMemo(() => {
    try {
      const alle = kundenZurAuswahl();
      if (!nurEigeneKunden) return alle;
      return alle.filter((k) => {
        const kontakt = getKontaktById(k.id);
        return !!kontakt && darfKontaktBearbeiten(kontakt, { userName: user.name, userId: eigeneId, vertretungFuer });
      });
    } catch { return []; }
  }, [offen, stand, nurEigeneKunden, user.name, eigeneId, vertretungFuer]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ein vorbelegter fremder Kunde (etwa aus der Adresse) gilt beim Vertriebspartner als nicht gewählt.
  const kundeId = nurEigeneKunden && kundeIdAuswahl && !kunden.some((k) => k.id === kundeIdAuswahl) ? null : kundeIdAuswahl;
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    const liste = s ? kunden.filter((k) => k.name.toLowerCase().includes(s)) : kunden;
    return liste.slice(0, 12);
  }, [kunden, suche]);
  const gewaehlt = kunden.find((k) => k.id === kundeId);

  const investments = useMemo(() => {
    if (!kundeId) return [];
    try { return getInvestmentsByKontakt(kundeId); } catch { return []; }
  }, [kundeId, stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const auswahl = investmentAuswahlStand(kundeId, investments, gewaehltesInvestment);
  const investmentId = auswahl.art === "gewaehlt" ? auswahl.investmentId : null;
  const mitEmail = kundeHatEmail(kundeId);

  const uebersicht = art === "objektuebersicht";
  /*
   * Die Auswahl gibt es nur bei der Objektübersicht einer Wohnung und nur,
   * wenn das Haus mehr als eine Wohnung im Angebot hat. Bei einer einzigen
   * gäbe es nichts zu wählen, es sei denn, der bestehende Link ist schon
   * eingeschränkt: Dann steht die Liste da, damit man sieht, was gilt.
   */
  const mitAuswahl = uebersicht && !ganzesObjekt && (einheiten.length > 1 || (bestehenderLink && bestehendeAuswahl !== null));
  // Bis die gespeicherte Auswahl da ist, nichts ändern und nichts senden; sonst überschriebe die Vorbelegung Eingaben.
  const auswahlGesperrt = uebersicht && !ganzesObjekt && auswahlLaedt;
  const gewaehltMenge = useMemo(() => new Set(gewaehlteWohnungen), [gewaehlteWohnungen]);
  // Gezählt wird nur, was in der Liste steht (etwa nicht die verkaufte Wohnung, aus der man kommt).
  const gewaehltListe = einheiten.filter((w) => gewaehltMenge.has(w.id));
  const auswahlFuerVersand: string[] | null = gewaehltListe.length === einheiten.length ? null : gewaehltListe.map((w) => w.id);
  const auswahlFehlt = mitAuswahl && gewaehltListe.length === 0;
  // „Öffnet bei“ nur aus den gewählten Wohnungen.
  const einstiegOptionen = mitAuswahl ? gewaehltListe : einheiten;

  const einheitFehlt = !ganzesObjekt && (!wohnungId || (mitAuswahl && !gewaehltListe.some((w) => w.id === wohnungId)));
  const bereit = !einheitFehlt && !auswahlFehlt && !auswahlGesperrt && !!kundeId && !!investmentId && !laeuft;
  const artName = uebersicht ? "Objektübersicht" : "Exposé";

  const kundeWaehlen = (id: string | null) => {
    setKundeId(id);
    setGewaehltesInvestment(null);
    setErzeugterLink(null);
  };

  /*
   * Gibt es für Kunde, Investment und Haus schon eine Objektübersicht, belegt
   * ihre Auswahl die Kästchen vor, dazu die Wohnung unter „Öffnet bei“.
   * `null` heißt dort: alle freien, also alle Kästchen.
   */
  useEffect(() => {
    setBestehenderLink(false);
    setBestehendeAuswahl(null);
    if (!offen || ganzesObjekt || !kundeId || !investmentId) {
      setAuswahlLaedt(false);
      return;
    }
    let aktuell = true;
    setAuswahlLaedt(true);
    void ladeKundenlinkAuswahl(kundeId, investmentId, objekt.id).then((stand) => {
      if (!aktuell) return;
      setAuswahlLaedt(false);
      if (!stand.vorhanden) return;
      setBestehenderLink(true);
      setBestehendeAuswahl(stand.auswahl);
      const bisher = stand.auswahl ? new Set(stand.auswahl) : null;
      setGewaehlteWohnungen(einheiten.filter((w) => !bisher || bisher.has(w.id) || w.id === wohnungId).map((w) => w.id));
    });
    return () => { aktuell = false; };
  }, [offen, ganzesObjekt, kundeId, investmentId, objekt.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const wohnungUmschalten = (id: string, an: boolean) => {
    setErzeugterLink(null);
    const neu = an ? [...gewaehlteWohnungen.filter((w) => w !== id), id] : gewaehlteWohnungen.filter((w) => w !== id);
    setGewaehlteWohnungen(neu);
    if (an && !wohnungId) setWohnungId(id);
    if (!an && id === wohnungId) setWohnungId(einheiten.find((w) => neu.includes(w.id))?.id ?? "");
  };

  const alleWaehlen = () => {
    setErzeugterLink(null);
    setGewaehlteWohnungen(einheiten.map((w) => w.id));
    if (!wohnungId) setWohnungId(einheiten[0]?.id ?? "");
  };

  const keineWaehlen = () => {
    setErzeugterLink(null);
    setGewaehlteWohnungen([]);
    setWohnungId("");
  };

  const artWaehlen = (neu: string) => {
    if (neu !== "objektuebersicht" && neu !== "expose") return;
    setArt(neu);
    setErzeugterLink(null);
  };

  const vorschauOeffnen = () => {
    if (einheitFehlt) return;
    /*
     * So, wie der Kunde es über den Link sieht, aber ohne Link, ohne Zähler
     * und ohne Glocke. Die Objektübersicht öffnet die interne Vorschau der
     * Kundenansicht, das Exposé seine Kundenansicht ohne interne Leiste.
     */
    const pfad = uebersicht
      ? kundenansichtVorschauPfad(objekt.id, ganzesObjekt ? null : wohnungId, investmentId, mitAuswahl ? auswahlFuerVersand : null)
      : ganzesObjekt ? objektExposePfad(objekt.id, kundeId, true) : exposePfad(objekt.id, wohnungId, kundeId, true);
    window.open(pfad, "_blank", "noopener");
  };

  const senden = async (modus: "mail" | "link") => {
    if (!bereit || !kundeId || !investmentId) return;
    // Der Link steht schon da: nur noch einmal kopieren, keinen zweiten Versand anlegen.
    if (modus === "link" && erzeugterLink) {
      const nochmal = await kopiereText(erzeugterLink);
      if (nochmal === "kopiert") toast.success("Link kopiert.");
      else toast.info("Der Link steht unten im Dialog, bitte von dort kopieren.");
      return;
    }
    setLaeuft(modus);
    const erg = await sendeKundenExpose({
      modus,
      art,
      kontaktId: kundeId,
      investmentId,
      objektId: objekt.id,
      wohnungId: ganzesObjekt ? null : wohnungId,
      // Ohne Kästchen (ganzes Haus, eine Wohnung) keine Angabe: Eine schon gespeicherte Auswahl bleibt dann stehen.
      ...(mitAuswahl ? { wohnungAuswahl: auswahlFuerVersand } : {}),
    });
    setLaeuft(null);
    if (!erg.ok || !erg.link) {
      // Bei fehlender Migration nennt `fehler` genau die, die fehlt.
      toast.error(erg.fehler || "Der Kundenlink konnte nicht gesendet werden.");
      return;
    }
    /*
     * Englischer Kunde, aber die Objekttexte sind vor dem 25.09.2026
     * entstanden und haben noch keine englische Fassung: Dann zeigt die Seite
     * hinter dem Link Beschreibung, Standort- und Marktargumente deutsch mit
     * „Description available in German only“. Nachgeholt wurde die Fassung
     * bisher nur beim PDF im internen Exposé. Jetzt auch hier, einmal je
     * Objekt; der Server legt sie am Objekt ab, die Seite liest sie beim
     * Öffnen frisch. Gefragt wird nach dem Versand, weil die Mail die Sprache
     * gerade erst festgelegt haben kann. Läuft im Hintergrund und hält den
     * Versand nie auf; klappt es nicht, bleibt es beim Vermerk.
     */
    if (kundenSprache(kundeId) === "en" && englischeObjektTexteFehlen(objekt)) {
      void englischeObjektTexteAnfordern(objekt.id);
    }
    const bis = erg.gueltigBis ? formatDatum(erg.gueltigBis) : "";
    if (modus === "mail") {
      toast.success(`${artName} an ${gewaehlt?.name || "den Kunden"} gesendet${bis ? `, gültig bis ${bis}` : ""}. Der Link liegt im Kundenprofil unter „Gesendete Links“.`);
      onOpenChange(false);
      return;
    }
    setErzeugterLink(erg.link);
    const kopiert = await kopiereText(erg.link);
    if (kopiert === "kopiert") {
      toast.success(`Link kopiert${bis ? `, gültig bis ${bis}` : ""}. Er liegt im Kundenprofil unter „Gesendete Links“.`);
    } else {
      toast.info("Der Link steht unten im Dialog, bitte von dort kopieren.");
    }
  };

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      {/* Über der Kopfleiste (`z-[60]`), wie die Objektauswahl und die Galerie.
          Die Auswahllisten darin deshalb auf `z-[100]`, sonst öffnen sie dahinter.
          Breite (23.09.2026): Bei `max-w-lg` schob die Knopfzeile mit ihren drei
          nicht umbrechenden Knöpfen die Rasterspalte des Fensters breiter als
          das Fenster selbst, rechts wurden Text, Auswahlfelder und „Per Mail
          senden“ abgeschnitten. Jetzt `max-w-2xl`, auf dem Handy die volle
          Breite mit Rand, und `grid-cols-1`: Die Spalte ist dann nie breiter
          als das Fenster, der Inhalt bricht um statt hinauszuragen.

          Auf dem Handy drei Zonen (Handyprüfung vom 23.09.2026): Kopf mit
          Schließen-Kreuz oben fest, die Mitte scrollt, die Knöpfe unten fest.
          Vorher scrollte das ganze Fenster, das Kreuz verschwand nach oben, und
          „Vorschau öffnen“ stand erst nach dem Wischen bis ganz unten. Der
          lange Erklärsatz steht deshalb am Anfang der Mitte statt im Kopf, sonst
          bliebe für die Auswahl kaum Platz. Ab sm sieht alles aus wie vorher:
          `sm:-mt-2.5` holt den Satz auf den Abstand, den er im Kopf hatte. */}
      <DialogContent className="z-[80] max-h-[86dvh] w-[calc(100%-2rem)] max-w-2xl grid-cols-1 rounded-2xl max-sm:flex max-sm:flex-col max-sm:overflow-hidden">
        <DialogHeader className="max-sm:shrink-0 max-sm:pr-6" data-testid="kundenlink-kopf">
          <DialogTitle>Kundenlink senden</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-sm:min-h-0 max-sm:flex-auto max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:py-1" data-testid="kundenlink-inhalt">
          <DialogDescription className="text-center sm:-mt-2.5 sm:text-left">
            Wähle, was der Kunde bekommt, dazu Kunde und Investment. Der Link geht per Mail hinaus, oder du kopierst ihn, etwa für WhatsApp. Er liegt danach im Kundenprofil unter „Gesendete Links“, gilt 60 Tage und rechnet mit neutralen Standardannahmen, nie mit Werten aus der Selbstauskunft.
          </DialogDescription>
          <RadioGroup value={art} onValueChange={artWaehlen} className="space-y-2" aria-label="Was der Kunde bekommt" data-testid="kundenlink-art">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
              <RadioGroupItem value="objektuebersicht" id="kundenlink-art-uebersicht" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="kundenlink-art-uebersicht" className="text-sm font-medium">
                  {ganzesObjekt ? "Objektübersicht des ganzen Hauses" : "Objektübersicht mit freien Wohnungen"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {ganzesObjekt
                    ? "Ein Link je Kunde und Haus, mit Bildern, Lage, Objektdaten und Unterlagen."
                    : einheiten.length > 1
                      ? "Ein Link je Kunde und Haus. Er öffnet bei der gewählten Wohnung, der Kunde sieht die Wohnungen, die du unten auswählst. Sendest du später aus einer anderen Wohnung, bleibt es derselbe Link."
                      : "Ein Link je Kunde und Haus. Er öffnet bei der gewählten Wohnung, der Kunde kann alle freien Wohnungen des Hauses ansehen. Sendest du später aus einer anderen Wohnung, bleibt es derselbe Link."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
              <RadioGroupItem value="expose" id="kundenlink-art-expose" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="kundenlink-art-expose" className="text-sm font-medium">
                  {ganzesObjekt ? "nur Exposé des ganzen Objekts" : "nur Exposé dieser Wohnung"}
                </Label>
                <p className="text-xs text-muted-foreground">Das Exposé mit Rechner, ein eigener Link je Wohnung.</p>
              </div>
            </div>
          </RadioGroup>

          {mitAuswahl && (
            <div className="space-y-1.5" data-testid="kundenlink-wohnungen">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Label id="kundenlink-wohnungen-titel">Welche Wohnungen der Kunde sieht</Label>
                <span className="flex gap-3 text-xs">
                  <button type="button" className="text-primary underline-offset-2 hover:underline disabled:opacity-50" onClick={alleWaehlen} disabled={auswahlGesperrt}>Alle auswählen</button>
                  <button type="button" className="text-primary underline-offset-2 hover:underline disabled:opacity-50" onClick={keineWaehlen} disabled={auswahlGesperrt}>Keine</button>
                </span>
              </div>
              <div className="max-h-52 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60" role="group" aria-labelledby="kundenlink-wohnungen-titel">
                {einheiten.map((w) => (
                  <label key={w.id} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted">
                    <Checkbox checked={gewaehltMenge.has(w.id)} onCheckedChange={(c) => wohnungUmschalten(w.id, c === true)} aria-label={w.weNr} disabled={auswahlGesperrt} />
                    <span className="min-w-[4.5rem] font-medium">{w.weNr}</span>
                    <span className="text-muted-foreground">{w.groesse ? `${w.groesse.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²` : ""}</span>
                    <span className="ml-auto text-right tabular-nums">
                      {w.vkGesamt ? w.vkGesamt.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : ""}
                      {w.status === "reserviert" ? <span className="ml-1 text-xs text-muted-foreground">(reserviert)</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {auswahlGesperrt
                  ? "Bisherige Auswahl wird geladen…"
                  : auswahlFehlt
                    ? "Wähle mindestens eine Wohnung."
                    : auswahlFuerVersand === null
                      ? "Alle angehakt: Der Kunde sieht auch Wohnungen, die später frei werden."
                      : "Der Kunde sieht nur die angehakten Wohnungen, solange sie frei sind."}
                {!auswahlGesperrt && bestehenderLink && " Die Auswahl gilt für den bestehenden Link dieses Kunden."}
              </p>
            </div>
          )}

          {ganzesObjekt ? (
            <div className="space-y-1.5">
              <Label>{artName}</Label>
              <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">Ganzes Objekt: {objekt.titel || objekt.adresse}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="expose-einheit">{uebersicht ? "Öffnet bei" : "Einheit"}</Label>
              <Select value={wohnungId} onValueChange={(v) => { setWohnungId(v); setErzeugterLink(null); }}>
                <SelectTrigger id="expose-einheit"><SelectValue placeholder="Einheit wählen" /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {einstiegOptionen.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.weNr}{w.groesse ? `, ${w.groesse.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²` : ""}{w.status === "reserviert" ? " (reserviert)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {einheiten.length === 0 && <p className="text-xs text-muted-foreground">Alle Einheiten sind verkauft.</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="expose-kunde">Kunde</Label>
            {gewaehlt ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-accent px-3 py-2 text-sm" data-testid="expose-kunde-gewaehlt">
                <span className="flex min-w-0 items-center gap-2"><User className="h-4 w-4 shrink-0 text-primary" /> <b className="min-w-0 break-words">{gewaehlt.name}</b>{gewaehlt.hatSelbstauskunft && <Badge variant="outline" className="border-primary/30 text-primary">Selbstauskunft</Badge>}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => kundeWaehlen(null)}>Entfernen</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="expose-kunde" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name suchen…" className="pl-8" autoComplete="off" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60">
                  {treffer.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{kunden.length === 0 ? (nurEigeneKunden ? "Keine eigenen oder vertretenen Kunden." : "Keine Kontakte im Zwischenspeicher.") : "Kein Treffer."}</p>
                  ) : treffer.map((k) => (
                    <button key={k.id} type="button" onClick={() => { kundeWaehlen(k.id); setSuche(""); }}
                      className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted", kundeId === k.id && "bg-accent")}>
                      <span className="min-w-0 break-words" data-testid="expose-kunde-name">{k.name}</span>
                      {k.hatSelbstauskunft && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">Selbstauskunft</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {kundeId && (
            <div className="space-y-1.5">
              <Label htmlFor="expose-investment">Investment</Label>
              {auswahl.art === "keineInvestments" ? (
                <p className="text-xs text-muted-foreground" data-testid="expose-kein-investment">
                  Für diesen Kunden gibt es noch kein Investment. Leg es im Kundenprofil an, dann lässt sich der Link senden.
                </p>
              ) : auswahl.art === "gewaehlt" && auswahl.einziges ? (
                <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm" data-testid="expose-investment-einziges">
                  <InvestmentMitSaStand bezeichnung={auswahl.bezeichnung} inv={investments.find((i) => i.id === auswahl.investmentId)} />
                </p>
              ) : (auswahl.art === "wahlNoetig" || auswahl.art === "gewaehlt") ? (
                <Select value={investmentId ?? ""} onValueChange={(v) => { setGewaehltesInvestment(v); setErzeugterLink(null); }}>
                  <SelectTrigger id="expose-investment"><SelectValue placeholder="Investment wählen" /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    {/* Der Inhalt des Eintrags erscheint auch im geschlossenen Feld, samt Stand. */}
                    {auswahl.optionen.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <InvestmentMitSaStand bezeichnung={o.bezeichnung} inv={investments.find((i) => i.id === o.id)} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {investmentId && !mitEmail && (
                <p className="text-xs text-muted-foreground" data-testid="expose-ohne-email">
                  Am Kunden ist keine E-Mail-Adresse hinterlegt. Per Mail geht es erst, wenn sie in den Stammdaten steht; den Link kannst du schon kopieren.
                </p>
              )}
            </div>
          )}

          {erzeugterLink && (
            <div className="space-y-1.5">
              <Label htmlFor="expose-link">Persönlicher Link</Label>
              <Input id="expose-link" readOnly value={erzeugterLink} onFocus={(e) => e.currentTarget.select()} data-testid="expose-link" />
              {/* Christian am 23.09.2026, „404“ nach „Link kopieren“: Der Link
                  führt immer auf osimmobilien.netlify.app. Aus der Lovable-Vorschau
                  kopiert, gibt es die Seite der Objektübersicht dort erst nach
                  dem Veröffentlichen, bis dahin zeigt sie „404“. */}
              {uebersicht && !kundenlinkAufDieserAdresse(window.location.hostname) && (
                <p className="text-xs text-muted-foreground" data-testid="expose-link-veroeffentlichen">
                  Der Link führt auf osimmobilien.netlify.app. Dort öffnet die Objektübersicht erst, wenn der aktuelle Stand in Lovable veröffentlicht ist, vorher zeigt sie „404“. Zum Prüfen davor nimm „Vorschau öffnen“.
                </p>
              )}
            </div>
          )}
        </div>
        {/* Kundensprache: „Geht auf Englisch raus“, bei Deutsch leer. */}
        {kundeId && <div className="flex justify-end"><KundenspracheHinweis kontaktId={kundeId} /></div>}
        {/* Passt ab Tabletbreite in eine Zeile, sonst bricht sie sauber um.
            Auf dem Handy fest unten: „Vorschau öffnen“ und „Link kopieren“
            nebeneinander, „Per Mail senden“ darunter über die volle Breite. */}
        <DialogFooter className="gap-2 sm:flex-wrap sm:gap-2 sm:space-x-0 max-sm:grid max-sm:shrink-0 max-sm:grid-cols-2 max-sm:border-t max-sm:border-border/60 max-sm:pt-3" data-testid="kundenlink-knoepfe">
          <Button type="button" variant="outline" className="gap-1.5" onClick={vorschauOeffnen} disabled={einheitFehlt}>
            <Eye className="h-4 w-4" /> Vorschau öffnen
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => void senden("link")} disabled={!bereit}>
            {laeuft === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : erzeugterLink ? <Copy className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} Link kopieren
          </Button>
          <Button type="button" className="gap-1.5 max-sm:col-span-2" onClick={() => void senden("mail")} disabled={!bereit || !mitEmail}>
            {laeuft === "mail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Per Mail senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
