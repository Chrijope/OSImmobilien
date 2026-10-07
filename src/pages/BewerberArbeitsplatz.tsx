import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users, Clock, Rocket, XCircle, Search, Plus, ChevronRight,
  Star, ArrowLeft, Pencil, Building2, Trash2, Copy, ExternalLink, Save,
  FileText, Sparkles, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  getBewerber, getStellen, createBewerber, updateBewerber, deleteBewerber,
  createStelle, updateStelle, deleteStelle, getStellenShareUrl,
  changeBewerberStatus, updateDokumentStatus,
  addNotizEntry, deleteNotizEntry, addDokument,
  statusColor, PIPELINE_STUFEN, PIPELINE_COLORS, DOK_STATUS_COLOR,
  type Bewerber, type BewerberStatus, type KontaktversuchErgebnis, type Stelle, type StellenStatus,
} from "@/lib/bewerbungStore";
import {
  berechneAssessmentScore, hatAssessmentDaten, getPfadDef, staerksterPfad, EMPFEHLUNG_LABELS,
} from "@/lib/assessmentSkript";
import { istTeil1Abgeschlossen } from "@/lib/erstgespraechStand";
import { meldeNeuenBewerberAnHr } from "@/lib/hrBewerberMeldung";
import {
  fehlerDetail,
  versandFehlerText,
  versandMeldung,
  type VersandAntwort,
} from "@/lib/kennenlernenVersandMeldung";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon, whatsAppLink } from "@/lib/phoneUtils";
import { ErstgespraechsTab } from "@/components/bewerbung/ErstgespraechsTab";
import { kannBewerberVerwalten } from "@/lib/bewerberRechte";
import { ClosingTab } from "@/components/bewerbung/ClosingTab";
import { VertragsTab } from "@/components/bewerbung/VertragsTab";
import { RechnungsTab } from "@/components/bewerbung/RechnungsTab";
import { getRechnungZahlStatus, ZAHL_STATUS_LABEL, ZAHL_STATUS_BADGE } from "@/lib/rechnungStatus";
import { pruefeMahnErinnerungen } from "@/lib/rechnungMahnung";
import { AktivierungTab } from "@/components/bewerbung/AktivierungTab";
import { BewerberDuplikatBanner } from "@/components/bewerbung/BewerberDuplikatBanner";
import { logKontaktversuch, countNichtErreichtVersuche, closingGebucht } from "@/lib/bewerberKontaktversuch";
import { nichtErreichtMailStufe } from "@/lib/bewerberNichtErreichtMail";
import { closingGespraechTermin, gebuchterTerminText, terminIstVergangen, terminZeitpunktMs } from "@/lib/bewerberTermine";
import {
  bogenTrennungZeigen, naechsteSortierung, sortiereNachTermin, sortierungDerSpalte,
  type SortSpalte, type SortZustand, type SpaltenSortierung,
} from "@/lib/bewerberSortierung";
import { PhoneOff, PhoneMissed, CalendarClock, Video, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBewerberBuchungen, useSelbstGebuchterTermin } from "@/components/bewerbung/useBewerberVideocall";
import { MessageCircle } from "lucide-react";
import { onCacheChange } from "@/lib/dataCache";
import { stufenLabel, stelleAnzeige, type BewerberAblauf } from "@/lib/bewerberArbeitsplatz";
import { BEWERBERPROZESS_HANDBUCH_PFAD } from "@/lib/bewerberAblauf";
import { bewerberSpalteSichtbar } from "@/lib/bewerberSpalten";
import { unterschriftsstand } from "@/lib/vertragUnterschrift";
import { KennenlernenKarte } from "@/components/bewerbung/KennenlernenKarte";
import { formatDatum } from "@/lib/utils";
import { markItemSeen, isItemSeen, getSeenAt, SEEN_KEYS } from "@/lib/seenBadges";
import { confirmDialog } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { MetaScoreBadge, VorabScoreAbzeichen, VorabScoreBadge, VorabScoreSpaltenkopf, VorabScoreZelle } from "@/components/bewerbung/VorabScoreBadge";
import { useVorabScores } from "@/components/bewerbung/useVorabScores";
import { BewerberFilterLeer, BewerberFilterLeiste } from "@/components/bewerbung/BewerberFilterLeiste";
import {
  FILTER_STANDARD,
  filterAusGespeichertem,
  istFilterGesetzt,
  passtZumFilter,
  quellenAus,
  stellenAus,
  zaehleFilterwerte,
  type BewerberFilter,
  type FilterBewerber,
} from "@/lib/bewerberFilter";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { metaScore } from "@/lib/bewerberMetaScore";
import { NachfassMailDialog } from "@/components/bewerbung/NachfassMailDialog";
import { NachfassHinweisBalken, PerMailAbgemeldetBadge } from "@/components/bewerbung/NachfassBausteine";
import { WartetAufEntscheidungBadge } from "@/components/bewerbung/WartetAufEntscheidung";
import { TerminAbgesagtBadge } from "@/components/bewerbung/TerminAbgesagtBadge";
import { KennenlernMailVermerk, kennenlernMailAm } from "@/components/bewerbung/KennenlernMailVermerk";
import { useKennenlernVersand } from "@/components/bewerbung/useKennenlernVersand";
import { useMailOeffnungen } from "@/components/bewerbung/useMailOeffnungen";
import { KENNENLERN_MAILS } from "@/lib/bewerberMailTracking";
import { standAusBewerber } from "@/lib/kennenlernenStand";
import { useSammelmailStand } from "@/lib/bewerberSammelmailStand";
import { SelbstAbmeldungKarte } from "@/components/bewerbung/SelbstAbmeldungKarte";
import { PipelineStufenAuswahl } from "@/components/bewerbung/PipelineStufenAuswahl";
import { cacheReload } from "@/lib/dataCache";
import { useCacheReady } from "@/hooks/useCacheReady";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { BewerberprofilLayout } from "@/components/bewerbung/profil/BewerberprofilLayout";
import { BewerberprofilPerson } from "@/components/bewerbung/profil/BewerberprofilPerson";
import { BewerberprofilKennzahlen } from "@/components/bewerbung/profil/BewerberprofilKennzahlen";
import { BewerberprofilAktivitaeten, type VerlaufReiter } from "@/components/bewerbung/profil/BewerberprofilAktivitaeten";
import { BewerberSchnellaktionen } from "@/components/bewerbung/profil/BewerberSchnellaktionen";
import { BewerberNotizDialog } from "@/components/bewerbung/profil/BewerberNotizDialog";
import { useBewerberEreignisse } from "@/components/bewerbung/profil/useBewerberEreignisse";
import { useBewerberAktivitaetenLeiste } from "@/components/bewerbung/profil/useBewerberAktivitaetenLeiste";
import { Send } from "lucide-react";
import { tarnEmail, tarnName, tarnTelefon, tarnVerweis } from "@/lib/vorfuehrmodus";

// ─── Helpers ───
// Vergangen-Logik liegt zentral in bewerberTermine.ts (terminIstVergangen),
// damit Datum und Uhrzeit ueberall gleich behandelt werden.

/**
 * Die Tabellen, ohne die es keine Bewerberliste gibt.
 *
 * Als Konstante ausserhalb der Komponente, damit `useCacheReady` nicht bei
 * jedem Rendern eine neue Liste sieht und erneut prueft.
 */
const LISTEN_TABELLEN = ["bewerbungen"];

/**
 * Wie lange die Seite hoechstens auf die Nachlade-Abfragen wartet.
 *
 * Die Notbremse fuer den Fall, dass eine Abfrage weder antwortet noch
 * fehlschlaegt, etwa bei einer haengenden Verbindung. Danach erscheint die
 * Liste mit dem, was da ist. Eine Seite, die sich nachtraeglich umbaut, ist
 * aergerlich; eine Seite, die ewig laedt, ist unbenutzbar.
 */
const WARTEFRIST_MS = 5000;

const StarRating = ({ rating, size = "sm", editable, onChange }: { rating: number; size?: "sm" | "lg"; editable?: boolean; onChange?: (r: number) => void }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      <Star
        key={i}
        className={`${size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} ${i <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} ${editable ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
        onClick={() => editable && onChange?.(i)}
      />
    ))}
  </div>
);

/**
 * Wer im Bewerbermanagement arbeiten darf.
 *
 * Steuert nicht nur den Knopf "Bewerber erfassen", sondern alles: Felder
 * bearbeiten, bewerten, Stellen anlegen, Bewerber loeschen. HR gehoert
 * deshalb dazu. Eine HR-Managerin, die Bewerber erfassen, aber nicht
 * bearbeiten darf, koennte mit der Seite nichts anfangen.
 *
 * Bewusst nicht ueber die Rechtetabelle geloest: Dort steht, wer eine Seite
 * sehen darf. Was jemand auf der Seite tun darf, ist eine andere Frage, und
 * sie wird hier beantwortet.
 */
const canManage = kannBewerberVerwalten;

/**
 * Das Skelett der Seite, solange die Liste zum allerersten Mal aufgebaut wird.
 *
 * Kein Ladehinweis mit Text und Kreisel: Christian wollte am 26.09.2026 keine
 * Anzeige mehr sehen, die nach Warten aussieht. Der Titel steht schon echt da,
 * darunter liegen ruhige Flaechen in der Form von Reitern, Kennzahlen und
 * Tabelle, damit beim Eintreffen der Liste nichts verrutscht. Im Alltag
 * erscheint das Skelett kaum noch, weil die Angaben nach dem Login vorgeladen
 * werden (`bewerberlisteVorladen.ts`).
 */
function BewerberlisteSkelett({ titel, untertitel }: { titel: string; untertitel: string }) {
  return (
    <div className="space-y-6" aria-busy="true" data-testid="bewerberliste-skelett">
      <PageHeader title={titel} subtitle={untertitel} />
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="mx-auto h-5 w-5 rounded-full" />
            <Skeleton className="mx-auto mt-2 h-7 w-10" />
            <Skeleton className="mx-auto mt-2 h-3 w-16" />
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <TableSkeleton columns={6} rows={8} />
      </Card>
    </div>
  );
}


// ─── Main Component ───
/**
 * Die Rechnungsadresse steht als ein Textblock im Datensatz, in der Form
 * Name / Strasse / PLZ Ort / USt-IdNr. Fuer die Uebersicht wird sie in
 * dieselben zwei Felder zerlegt wie die Privatadresse, damit beide Adressen
 * gleich aussehen. Name und USt-IdNr bleiben dabei erhalten, auch wenn sie
 * in der Uebersicht nicht bearbeitet werden.
 */
function zerlegeRechnungsadresse(roh?: string) {
  const z = (roh || "").split(/\r?\n/).map((t) => t.trim());
  return { name: z[0] || "", strasse: z[1] || "", plzOrt: z[2] || "", ust: z[3] || "" };
}

function baueRechnungsadresse(
  teile: { name: string; strasse: string; plzOrt: string; ust: string },
  ersatzName: string,
): string {
  // Ohne Strasse und Ort gilt die Rechnungsadresse als nicht gesetzt, sonst
  // stuende dort nur noch ein Name und der Hinweis "identisch mit der
  // Privatadresse" verschwaende faelschlich.
  if (!teile.strasse && !teile.plzOrt) return "";
  return [teile.name || ersatzName, teile.strasse, teile.plzOrt, teile.ust]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ein Spaltenkopf, über den sich die Liste sortieren lässt.
 *
 * Einer für beide sortierenden Spalten, Vorab-Score und Closing-Gespräch.
 * Christian hat ausdrücklich dieselbe Bedienung verlangt, und zweimal
 * dasselbe Knopf-JSX wäre genau die Stelle, an der die beiden Spalten nach
 * ein paar Sitzungen unterschiedlich aussehen. So sind Pfeil, Farbe und der
 * Dreierschritt zwangsläufig gleich; verschieden sind nur die Beschriftung
 * und die Texte für die Vorlesehilfe.
 */
function SortierSpaltenkopf({ zustand, titel, ansage, onKlick, children }: {
  zustand: SpaltenSortierung;
  titel: string;
  /** Was beim nächsten Klick passiert, je nach jetzigem Zustand. */
  ansage: Record<SpaltenSortierung, string>;
  onKlick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onKlick}
      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
      title={titel}
    >
      {children}
      <span aria-hidden className={zustand === "aus" ? "text-muted-foreground/40" : "text-primary"}>
        {zustand === "runter" ? "↓" : "↑"}
      </span>
      <span className="sr-only">{ansage[zustand]}</span>
    </button>
  );
}

/**
 * Der Arbeitsplatz für Bewerber, einmal gebaut und zweimal benutzt.
 *
 * Das bestehende Bewerbungsmanagement und der neue Bewerberprozess sind
 * dieselbe Seite mit derselben Stufenübersicht, derselben Tabelle, demselben
 * Knopf zum Erfassen und demselben Bewerberprofil. Was sie unterscheidet,
 * steht vollständig in `bewerberArbeitsplatz.ts` und wird hier als `ablauf`
 * hereingereicht.
 *
 * Bewusst kein zweiter Aufbau: Ein eigens gebauter neuer Bereich lief nach
 * einer Sitzung auseinander, ließ sich nicht mit dem Bestand vergleichen und
 * fühlte sich halbfertig an. So kann das nicht mehr passieren, denn jede
 * Änderung an der Oberfläche wirkt zwangsläufig in beiden Abläufen.
 */
export function BewerberArbeitsplatz({ ablauf }: { ablauf: BewerberAblauf }) {
  const { user, authUser } = useUser();
  /*
   * Wer die Sammelmail zum Kennenlernen noch nicht hat und wessen Adresse
   * gesperrt ist. Nur im neuen Ablauf: Das bestehende Bewerbungsmanagement
   * arbeitet nicht mit dieser Mail, und eine Edge Function, die beim Öffnen
   * jeder Bewerberliste anläuft, wäre eine stille Dauerlast.
   */
  const sammelmailAktiv = ablauf.id === "neu";
  const sammelmail = useSammelmailStand(sammelmailAktiv);
  /*
   * Ob die Bewerber selbst schon im Zwischenspeicher liegen.
   *
   * Der Haken holt die Tabelle bei Bedarf auch selbst. Ohne ihn zeichnete die
   * Seite erst eine leere Liste und fuellte sie, sobald die Tabelle eintraf.
   */
  const cacheBereit = useCacheReady(LISTEN_TABELLEN);
  /** Die Beschriftung einer Stufe in diesem Ablauf, siehe `bewerberArbeitsplatz.ts`. */
  const stufeLabel = (s: BewerberStatus) => stufenLabel(ablauf, s);
  // Sidebar-Badge wird nicht mehr beim Listen-Öffnen zurückgesetzt,
  // sondern erst beim Öffnen eines einzelnen Bewerberprofils.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState("bewerber");
  const [search, setSearch] = useState("");
  const [stufeFilter, setStufeFilter] = useState("alle");
  /*
   * Die Filterleiste über der Liste, gemerkt je Nutzer.
   *
   * Der Stufenfilter darüber wird bewusst nicht gemerkt: Er ist ein Blick, den
   * man im Vorbeigehen wechselt. Die Filterleiste ist das Gegenteil, nämlich
   * eine Arbeitseinstellung („zeig mir die offenen Bögen aus dieser Woche"),
   * und die morgens erneut zusammenzuklicken wäre lästig. Gespeichert wird im
   * vorhandenen `user_settings`, dasselbe Muster wie bei den Spalten der
   * Kundenliste. Je Ablauf ein eigener Schlüssel, denn die beiden Listen
   * enthalten verschiedene Bewerber.
   */
  const filterSchluessel = `bewerberFilter_${ablauf.id}`;
  const [filter, setFilterRoh] = useState<BewerberFilter>(
    () => filterAusGespeichertem(getUserSetting<unknown>(filterSchluessel, null)),
  );
  const setFilter = useCallback((neu: BewerberFilter) => {
    setFilterRoh(neu);
    setUserSetting(filterSchluessel, neu);
  }, [filterSchluessel]);
  const [selectedBewerberId, setSelectedBewerberId] = useState<string | null>(null);
  /*
   * Ein frisch geoeffnetes Profil beginnt oben.
   *
   * Liste und Profil sind dieselbe Seite, nur ein anderer Zweig. Wer weit
   * unten in der Liste einen Bewerber anklickt, behaelt deshalb dessen
   * Scrollhoehe und landet im Profil mitten in den Karten, oft unterhalb des
   * Namens.
   *
   * Gescrollt wird nicht das Fenster, sondern der Inhaltsbereich des Layouts
   * (`<main className="overflow-auto">` in DashboardLayout). `window.scrollTo`
   * bliebe deshalb wirkungslos. `scrollIntoView` auf das oberste Element
   * trifft den richtigen Behaelter, ohne ihn kennen zu muessen.
   */
  const profilKopfRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedBewerberId) return;
    // Ohne "smooth": Beim Oeffnen soll die Seite oben stehen, nicht dorthin
    // fahren. Eine Fahrt ueber zwei Bildschirmhoehen sieht nach Fehler aus.
    profilKopfRef.current?.scrollIntoView({ block: "start" });
  }, [selectedBewerberId]);
  const [showNewBewerber, setShowNewBewerber] = useState(false);

  const [detailTab, setDetailTab] = useState("uebersicht");
  const [showNewStelle, setShowNewStelle] = useState(false);
  const [editStelleId, setEditStelleId] = useState<string | null>(null);
  const [_, setTick] = useState(0);

  // Re-render NEU-Badges, sobald markItemSeen ein Event feuert
  useEffect(() => {
    const onSeen = (e: any) => {
      if (e?.detail?.key === SEEN_KEYS.bewerbungen) setTick(t => t + 1);
    };
    window.addEventListener("seen-badge-updated", onSeen as any);
    return () => window.removeEventListener("seen-badge-updated", onSeen as any);
  }, []);

  // Sobald ein Bewerberprofil geöffnet ist → als gesehen markieren
  // (deckt alle Öffnungspfade ab, nicht nur den Tabellen-Klick)
  useEffect(() => {
    if (selectedBewerberId) markItemSeen(SEEN_KEYS.bewerbungen, selectedBewerberId);
  }, [selectedBewerberId]);

  // Stammdaten-Edit-Dialog (E-Mail + Telefon)
  const [stammdatenEdit, setStammdatenEdit] = useState<{ email: string; telefon: string } | null>(null);

  /*
   * Das Fenster zum Schreiben einer Notiz.
   *
   * Steht hier oben und nicht in der Detailansicht: Die Detailansicht steigt
   * mit einem eigenen `return` aus, ein Haken dort waere ein bedingt gerufener
   * Haken. Aus demselben Grund stehen `gebuchtesGespraech` und die
   * Aktivitaetenleiste weiter unten ebenfalls vor dem Ausstieg.
   *
   * Beide Wege hinein, der runde Knopf links und der Knopf im Reiter Notizen
   * rechts, schalten denselben Zustand.
   */
  const [notizOffen, setNotizOffen] = useState(false);

  /*
   * Welcher Reiter rechts vorn steht, „Aktivitaeten" oder „Notizen".
   *
   * Gefuehrt wird er hier und nicht in der Spalte selbst, weil das Schreiben
   * einer Notiz ausserhalb dieser Spalte geschieht: Der runde Knopf „Notiz"
   * sitzt links, das Fenster liegt unten auf dieser Seite. Ohne diesen Zustand
   * bliebe die Spalte nach dem Speichern auf „Aktivitaeten" stehen, und die
   * frisch geschriebene Notiz waere nirgends zu sehen.
   */
  const [verlaufReiter, setVerlaufReiter] = useState<VerlaufReiter>("aktivitaeten");

  // Bestätigungsdialog für die einmalige Nachfass-Mail an alle im Eingang
  const [nachfassOffen, setNachfassOffen] = useState(false);

  // ─── Per-Spalten-Filter Stellen ───
  const [stellenTitelFilter, setStellenTitelFilter] = useState("");
  const [stellenAbteilungFilter, setStellenAbteilungFilter] = useState("");
  const [stellenStandortFilter, setStellenStandortFilter] = useState("");
  const [stellenArtFilter, setStellenArtFilter] = useState("");
  const [stellenStatusFilter, setStellenStatusFilter] = useState("alle");
  const [stellenErstelltFilter, setStellenErstelltFilter] = useState("");

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    window.addEventListener("bewerbung-updated", refresh);
    return () => window.removeEventListener("bewerbung-updated", refresh);
  }, [refresh]);

  // Refresh sobald die Bewerbungs-Tabelle in den Daten-Cache geladen / aktualisiert wird
  // (verhindert leere Ansicht beim ersten Sidebar-Klick, solange deferred Tables noch laden)
  useEffect(() => {
    const unsub = onCacheChange((table) => {
      if (table === "bewerbungen") refresh();
    });
    return unsub;
  }, [refresh]);

  /*
   * Auto-Öffnen eines Bewerbers über die Adresse, etwa beim Rücksprung aus
   * /closing oder über die Glocke.
   *
   * Zwei Namen für dieselbe Sache, beide mit Absicht: `openBewerber` ist der
   * gewachsene im CRM, `bewerber` steht in den Mails und Glocken, die die
   * Edge Functions `send-bewerber-termin` und
   * `send-bewerber-kennenlernen-erinnerungen` verschicken. Die Links dort sind
   * schon draußen und sollen nicht ins Leere führen.
   */
  useEffect(() => {
    const openId = searchParams.get("openBewerber") || searchParams.get("bewerber");
    const dTab = searchParams.get("detailTab");
    if (openId) {
      markItemSeen(SEEN_KEYS.bewerbungen, openId);
      setSelectedBewerberId(openId);
      setTab("bewerber");
      if (dTab) setDetailTab(dTab);
      // Über die Glocke kommt man meist wegen etwas, das der Server gerade
      // geschrieben hat (Fragebogen, Abmeldung per Mail). Der Cache im
      // Arbeitsspeicher kennt das noch nicht; ein Speichern aus der alten
      // Ansicht würde den Status zurückdrehen. Deshalb frisch laden.
      void cacheReload("bewerbungen");
      // Param entfernen, damit ein erneutes Schließen nicht sofort wieder öffnet
      const next = new URLSearchParams(searchParams);
      next.delete("openBewerber");
      next.delete("bewerber");
      next.delete("tab");
      next.delete("detailTab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams]);

  // Automatische Mahn-Erinnerung (14d/21d) beim Mount prüfen – einmalig pro Schwelle
  useEffect(() => {
    const t = setTimeout(() => pruefeMahnErinnerungen(), 500);
    return () => clearTimeout(t);
  }, []);

  /*
   * Backfill: Bewerber mit Erstgesprächs-Datum + Uhrzeit automatisch auf Status
   * "Erstgespraech" setzen.
   *
   * Erst wenn die Tabelle im Zwischenspeicher liegt, und dann genau einmal.
   * Vorher lief das schon beim Einhaengen der Seite: War der Zwischenspeicher
   * da noch leer, sah der Backfill keinen einzigen Bewerber und lief nie
   * wieder. War er gefuellt, ruecken Bewerber nach dem ersten Zeichnen in eine
   * andere Stufe, und genau dieses Umspringen soll niemand mehr sehen. Jetzt
   * geschieht es, waehrend die Ladeanzeige steht.
   */
  const backfillGelaufen = useRef(false);
  useEffect(() => {
    if (!cacheBereit || backfillGelaufen.current) return;
    backfillGelaufen.current = true;
    const list = getBewerber();
    let changed = false;
    list.forEach(b => {
      if (b.erstgespraechDatum && b.erstgespraechUhrzeit && b.status === "Eingang") {
        changeBewerberStatus(b.id, "Erstgespraech");
        changed = true;
      }
    });
    if (changed) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheBereit]);

  /*
   * Die Trennung der beiden Listen, die einzige Zusage, an der wirklich etwas
   * hängt: Jeder Bewerber steht in genau einer der beiden. Sonst stünde ein
   * Übungsbewerber aus dem neuen Ablauf in der Liste der HR-Managerin, und sie
   * würde ihn anrufen. `ablauf.liste` ist `nurAlterProzess` beziehungsweise
   * `nurNeuerProzess`, siehe `bewerberprozessZuordnung.ts`.
   */
  const bewerberList = ablauf.liste(getBewerber());
  const stellenList = getStellen();
  // Vorab-Scores aller Bewerber, eine Abfrage für Liste und Übersicht.
  // `kennenlernEingereichtAm` steht daneben, weil der Score auch aus dem alten
  // Vorabbogen entstehen kann und der Filter genau das unterscheiden muss.
  // `vorabEingereichtAm` ist das Gegenstück dazu: Es geht nicht in den Filter,
  // belegt aber eine geöffnete Mail, denn auch der Link des Vorabbogens stand
  // ausschließlich in einer Mail. Siehe `KennenlernMailVermerk`.
  const {
    scores: vorabScores,
    kennenlernEingereichtAm,
    vorabEingereichtAm,
    bereit: scoresBereit,
  } = useVorabScores(bewerberList.map(b => b.id));
  /*
   * Wann die Mail mit dem Kennenlernbogen hinausging. Kommt nicht aus dem
   * Zwischenspeicher: Der Rueckfall dafuer ist das Anlagedatum des Bogens, und
   * `bewerber_formular` laedt die Liste sonst nicht. Ohne ihn fehlte das
   * Briefsymbol bei allen, deren Mail ohne Vermerk hinausging.
   */
  const { versand: bogenVersand, bereit: versandBereit } = useKennenlernVersand(bewerberList.map(b => b.id));
  /*
   * Ob der Link aus den Mails zum Kennenlernbogen aufgerufen wurde, für den
   * Umschlag in der Liste. Seit dem 26.09.2026 ohne Zählpixel, siehe
   * `src/lib/bewerberMailTracking.ts`. Grau heißt dort ausdrücklich „Link
   * noch nicht geöffnet" und nicht „ungelesen".
   */
  const { oeffnungen: mailOeffnungen, bereit: oeffnungenBereit } = useMailOeffnungen(bewerberList.map(b => b.id), KENNENLERN_MAILS);
  /*
   * Die Vorabeinschätzung je Bewerber, einmal berechnet.
   *
   * Sie wird an drei Stellen gebraucht, in der Tabelle, in der Handy-Liste und
   * in der Sortierung. Gerade die Sortierung fragt sie bei jedem Vergleich ab,
   * also über tausendmal je Seitenaufbau; einmal rechnen ist billiger und
   * stellt zugleich sicher, dass Anzeige und Reihenfolge denselben Wert
   * benutzen.
   */
  const metaScores = useMemo(
    () => Object.fromEntries(bewerberList.map(b => [b.id, metaScore(b)])),
    [bewerberList],
  );

  /*
   * ─── Die Filterleiste über der Liste ───
   *
   * Sie erscheint im Eingang und in der Gesamtsicht, und nur dort wirkt sie
   * auch. In den späteren Stufen sagt „Kennenlernbogen offen" nichts mehr, und
   * ein Filter, der unsichtbar weiterfiltert, wäre eine Falle.
   *
   * Was ein Filter bedeutet, steht in `src/lib/bewerberFilter.ts`. Hier wird
   * nur die Zeile zusammengesetzt, auf die er schaut: drei Angaben stehen am
   * Bewerber, drei kommen aus `bewerber_formular` und den Versandvermerken.
   */
  const filterLeisteSichtbar = stufeFilter === "alle" || stufeFilter === "Eingang";
  /** „Nicht erreicht": Bis zu diesem Tag steht der Bewerber nicht im Eingang. */
  const imEingangVerborgen = (b: Bewerber) =>
    !!b.eingangHiddenUntil && new Date(b.eingangHiddenUntil).getTime() > Date.now();
  const filterZeile = (b: Bewerber): FilterBewerber => ({
    id: b.id,
    erstelltAm: b.erstelltAm,
    kennenlernbogenAusgefuellt: !!kennenlernEingereichtAm[b.id],
    einstufung: vorabScores[b.id]?.einstufung ?? null,
    // Dieselbe Quelle wie das Briefsymbol in der Liste, damit Filter und
    // Symbol nicht zwei verschiedene Antworten auf dieselbe Frage geben.
    eingangsmailVerschickt: kennenlernMailAm(b, bogenVersand[b.id]) !== null,
    quelle: b.quelle,
    stelleTitel: b.stelleTitel,
  });
  /** Die Suche über der Liste, als eigene Bedingung. Sie wirkt immer. */
  const passtZurSuche = (b: Bewerber) => {
    const searchLower = search.toLowerCase();
    const searchDigits = search.replace(/\D/g, "");
    const telefonDigits = (b.telefon || "").replace(/\D/g, "");
    return (
      `${b.vorname} ${b.nachname} ${b.email} ${b.telefon} ${b.ort}`.toLowerCase().includes(searchLower)
      || (searchDigits.length > 0 && telefonDigits.includes(searchDigits))
    );
  };
  /*
   * Die Vorauswahl, auf die sich „12 von 48" und die Zahlen in den Auswahlen
   * beziehen: der angezeigte Abschnitt, die Suche bereits angewandt, die
   * Filter noch nicht. Die im Eingang geschlummerten fehlen hier wie in der
   * Liste, sonst stünde eine Zahl da, die man nirgends wiederfindet.
   */
  const filterMenge = filterLeisteSichtbar
    ? bewerberList
      .filter(b => (stufeFilter === "alle" || b.status === stufeFilter)
        && !(b.status === "Eingang" && imEingangVerborgen(b))
        && passtZurSuche(b))
      .map(filterZeile)
    : [];
  // Bewusst ohne useMemo: Die Liste entsteht ohnehin bei jedem Rendern neu,
  // ein Vergleich wäre teurer als die paar hundert Vergleiche hier.
  const filterZaehlung = zaehleFilterwerte(filterMenge, filter, new Date());
  const filterQuellen = quellenAus(filterMenge);
  const filterStellen = stellenAus(filterMenge);
  /** Wirkt der Filter gerade, schränkt also etwas ein? */
  const filterWirkt = filterLeisteSichtbar && istFilterGesetzt(filter);

  /*
   * Sortierung ueber die Spaltenkoepfe: Vorab-Score oder Closing-Gespraech.
   *
   * Es sortiert immer hoechstens eine Spalte. Das steckt im Zustand selbst,
   * er haelt genau eine (siehe `bewerberSortierung.ts`): Wer die andere
   * Spalte anklickt, schaltet die erste damit ab. Die Liste hat nur eine
   * Reihenfolge, zwei gleichzeitige Sortierungen waeren gar nicht darstellbar.
   *
   * `null` heisst: es bleibt bei der fachlichen Reihenfolge des Abschnitts,
   * also Termin zuerst dort, wo ein Termin ansteht, sonst Eingangsdatum. Wer
   * auf einen Spaltenkopf klickt, schaltet auf "hoch" (bester beziehungsweise
   * fruehester zuerst), dann auf "runter", dann wieder aus.
   *
   * Bewerber ohne Bogen haben keinen Score, Bewerber ohne Termin kein Datum.
   * Sie stehen jeweils am Ende, in beiden Richtungen: Eine fehlende Angabe
   * ist keine schlechte Angabe, und ganz oben stuenden sie nur im Weg.
   */
  const [sortierung, setSortierung] = useState<SortZustand>(null);
  const scoreSortierung = sortierungDerSpalte(sortierung, "score");
  const terminSortierung = sortierungDerSpalte(sortierung, "termin");
  const sortiereSpalte = (spalte: SortSpalte) =>
    setSortierung(v => naechsteSortierung(v, spalte));

  /*
   * Eine Sortierung, deren Spalte niemand mehr sieht, hebt sich selbst auf.
   *
   * Nach dem Closing-Gespraech laesst sich nur im Abschnitt "Closing"
   * sortieren, dort steht die Spalte. Filtert jemand danach auf eine andere
   * Stufe, ist der Abschnitt weg und mit ihm der Spaltenkopf. Bliebe die
   * Sortierung bestehen, stuende die Liste in einer Reihenfolge, deren Grund
   * man nicht mehr sehen kann. Der Vorab-Score steht in jeder Stufe, ihn
   * trifft das nicht.
   */
  const closingSpalteSichtbar =
    (stufeFilter === "alle" || stufeFilter === "Closing") && bewerberSpalteSichtbar("Termin", "Closing");
  useEffect(() => {
    if (!closingSpalteSichtbar) {
      setSortierung(v => (v?.spalte === "termin" ? null : v));
    }
  }, [closingSpalteSichtbar]);

  const selectedBewerber = selectedBewerberId ? bewerberList.find(b => b.id === selectedBewerberId) : null;

  /*
   * Der selbst gebuchte Termin des geöffneten Bewerbers.
   *
   * Steht hier oben und nicht in der Detailansicht: Die Detailansicht steigt
   * mit einem eigenen `return` aus, ein Haken dort wäre ein bedingt gerufener
   * Hook. Ohne geöffneten Bewerber fragt der Haken nichts ab und gibt null.
   */
  const gebuchtesGespraech = useSelbstGebuchterTermin(selectedBewerberId || "");
  /*
   * Die Buchungen aller Bewerber, eine Abfrage für Liste und Spalte.
   *
   * Warum überhaupt: Die Spalte „Closing-Gespräch" las bis zum 16.09.2026 nur
   * die Kopie in der Akte (`meta`). Die Karte „Videocall Termin" liest die
   * Buchung selbst. Bei Berat Kilapia zeigte die Karte deshalb den Termin und
   * die Spalte einen Strich. Jetzt lesen beide dieselbe Quelle, siehe
   * `closingGespraechTermin`.
   *
   * Abgesagte Termine sind darin enthalten, daran hängt das Abzeichen
   * „Abgesagt".
   */
  const { buchungen: bewerberBuchungen, bereit: buchungenBereit } = useBewerberBuchungen(selectedBewerberId || "");
  /*
   * Steht ein Termin, schrumpft die Übersicht auf die eine Zeile zusammen, die
   * dann zählt: das Gespräch und der Weg in den Raum. Alles Übrige bleibt
   * erhalten und ist einen Klick entfernt. Bewusst nur für diese Sitzung
   * gemerkt, es gibt an dieser Stelle kein Muster für Gespeichertes.
   */
  const [uebersichtOffen, setUebersichtOffen] = useState(false);
  // Ein Wechsel der Akte beginnt wieder eingeklappt.
  useEffect(() => { setUebersichtOffen(false); }, [selectedBewerberId]);

  /*
   * ─── Die Aktivitätenübersicht der geöffneten Akte ───
   *
   * Beide Haken stehen hier oben, aus demselben Grund wie `gebuchtesGespraech`
   * ein Stück darüber: Die Detailansicht steigt mit einem eigenen `return`
   * aus, ein Haken dort wäre ein bedingt gerufener Haken. Ohne geöffneten
   * Bewerber fragt `useBewerberEreignisse` nichts ab und gibt eine leere Liste.
   */
  const { ereignisse: bewerberEreignisse, laedt: ereignisseLaden } = useBewerberEreignisse({
    bewerber: selectedBewerber ?? null,
    buchung: selectedBewerberId ? bewerberBuchungen[selectedBewerberId] : null,
    kennenlernEingereichtAm: selectedBewerberId ? kennenlernEingereichtAm[selectedBewerberId] : undefined,
    vorabEingereichtAm: selectedBewerberId ? vorabEingereichtAm[selectedBewerberId] : undefined,
  });
  const aktivitaetenLeiste = useBewerberAktivitaetenLeiste();

  /*
   * ─── Wann die Liste erscheinen darf ───
   *
   * Christian hat am 17.09.2026 gemeldet, dass sich die Seite nach ein bis
   * zwei Sekunden noch einmal umbaut. Der Grund: Die Liste stand sofort da,
   * holte aber fuenf Angaben erst danach nach, und jede davon aendert, was in
   * der Liste steht.
   *
   *   1. Die Bewerber selbst, aus dem Zwischenspeicher. Fehlt er, ist die
   *      Liste leer und fuellt sich anschliessend.
   *   2. Die Vorab-Scores. Im Eingang und beim Videocall steht im oberen
   *      Bereich der Tabelle, wer einen Bogen ausgefuellt hat (siehe
   *      `bogenTrennungZeigen`). Bis die Antwort da ist, steht niemand dort,
   *      und danach springen die Zeilen.
   *   3. Der Versand des Kennenlernbogens. Er ist eine Bedingung der
   *      Filterleiste, es aendert sich also die Zahl der Zeilen.
   *   4. Die gemessenen Mailoeffnungen, fuer den Umschlag in der Zeile.
   *   5. Die selbst gebuchten Termine. Danach ist der Abschnitt „Closing"
   *      sortiert.
   *   6. Die Vorschau „Eingangsmail fehlt", nur im neuen Ablauf. Sie kommt aus
   *      einer Edge Function und ist meist die langsamste der sechs.
   *
   * Gewartet wird auf alle, nicht nur auf die Reihenfolge: Eine Liste, die
   * vollstaendig aussieht und trotzdem noch Abzeichen nachwachsen laesst,
   * beantwortet die Beschwerde nur halb.
   *
   * Seit dem 26.09.2026 wartet die Seite praktisch nie mehr. Christian hatte
   * gemeldet, dass beim Klick auf Bewerberprozess jedes Mal ein, zwei Sekunden
   * „Bewerber werden geladen" stand. Drei Ursachen, drei Abhilfen:
   *
   *   - Die gemerkten Antworten galten nur fuer genau dieselben Bewerber. Ein
   *     neuer Bewerber von der Website, und die Liste wartete wieder von vorn.
   *     Jetzt genuegt die letzte Antwort, die neue kommt im Hintergrund
   *     (`nachladeSpeicher.ts`).
   *   - Kam waehrend der Arbeit ein Bewerber dazu, sprang die offene Seite
   *     zurueck in die Ladeanzeige. Jetzt gilt: einmal gezeigt, bleibt die
   *     Liste stehen (`warSchonBereit`).
   *   - Beim ersten Klick nach dem Login gab es noch gar keine Antwort. Jetzt
   *     holt der App-Rahmen sie gleich nach dem Login im Hintergrund
   *     (`bewerberlisteVorladen.ts`).
   *
   * Kommt jemand trotzdem schneller, als die Antworten da sind, steht statt
   * eines Ladehinweises ein ruhiges Skelett der Seite (`BewerberlisteSkelett`).
   */
  const sammelmailBereit = !sammelmailAktiv || sammelmail.geladen || sammelmail.fehler !== "";
  const angabenBereit =
    cacheBereit && scoresBereit && versandBereit && oeffnungenBereit && buchungenBereit && sammelmailBereit;
  /*
   * Die Notbremse: Antwortet eine Abfrage weder noch schlaegt sie fehl, zeigt
   * die Seite die Liste trotzdem. Lieber eine Liste, die sich noch ergaenzt,
   * als eine Ladeanzeige ohne Ende.
   */
  const [wartefristAbgelaufen, setWartefristAbgelaufen] = useState(false);
  useEffect(() => {
    if (angabenBereit) return;
    const t = setTimeout(() => setWartefristAbgelaufen(true), WARTEFRIST_MS);
    return () => clearTimeout(t);
  }, [angabenBereit]);
  /*
   * Einmal gezeigt, bleibt die Liste stehen. Aendert sich danach etwas, etwa
   * weil ein Bewerber dazukommt, ergaenzt sie sich, statt in die Ladeanzeige
   * zurueckzuspringen.
   */
  const warSchonBereit = useRef(false);
  if (angabenBereit || wartefristAbgelaufen) warSchonBereit.current = true;
  const listeBereit = warSchonBereit.current;

  const filteredStellen = stellenList.filter(s => {
    const matchTitel = !stellenTitelFilter || s.titel.toLowerCase().includes(stellenTitelFilter.toLowerCase());
    const matchAbteilung = !stellenAbteilungFilter || s.abteilung.toLowerCase().includes(stellenAbteilungFilter.toLowerCase());
    const matchStandort = !stellenStandortFilter || s.standort.toLowerCase().includes(stellenStandortFilter.toLowerCase());
    const matchArt = !stellenArtFilter || s.art.toLowerCase().includes(stellenArtFilter.toLowerCase());
    const matchStatus = stellenStatusFilter === "alle" || s.status === stellenStatusFilter;
    const matchErstellt = !stellenErstelltFilter || s.erstellt.toLowerCase().includes(stellenErstelltFilter.toLowerCase());
    return matchTitel && matchAbteilung && matchStandort && matchArt && matchStatus && matchErstellt;
  });

  const gesamt = bewerberList.length;
  const imProzess = bewerberList.filter(b => !["Abgelehnt", "KeinInteresse", "Aktiv"].includes(b.status)).length;
  const onboarding = bewerberList.filter(b => b.status === "Aktiv").length;
  const abgelehnt = bewerberList.filter(b => b.status === "Abgelehnt" || b.status === "KeinInteresse").length;

  // ─── Bewerber Detail View ───
  if (selectedBewerber) {
    const b = selectedBewerber;
    const currentIdx = PIPELINE_STUFEN.indexOf(b.status as any);
    /*
      Wer die Stufe umstellen darf, sieht das Auswahlfeld. Auf dem Handy ist
      dieses Feld dann die einzige Stelle, an der die Stufe steht: Das farbige
      Kennzeichen daneben sagte dasselbe noch einmal und kostete eine ganze
      Zeile. Wer nicht umstellen darf, sieht kein Feld und braucht deshalb
      weiter das Kennzeichen.
    */
    const darfStufeAendern = canManage(user.role);

    const handleStatusChange = (newStatus: string) => {
      changeBewerberStatus(b.id, newStatus as BewerberStatus);
      toast({ title: `Status: ${newStatus}`, description: `Statusbenachrichtigung per Chat & E-Mail wird versendet.` });
      refresh();
    };

    const handleRatingChange = (rating: number) => {
      updateBewerber(b.id, { bewertung: rating });
      refresh();
    };

    const handleFieldSave = (field: keyof Bewerber, value: string) => {
      updateBewerber(b.id, { [field]: value });
      // Auto-Status: wenn Erstgesprächs-Datum & Uhrzeit gesetzt und noch im Eingang → Erstgespraech
      if (field === "erstgespraechDatum" || field === "erstgespraechUhrzeit") {
        const datum = field === "erstgespraechDatum" ? value : b.erstgespraechDatum;
        const uhrzeit = field === "erstgespraechUhrzeit" ? value : b.erstgespraechUhrzeit;
        if (datum && uhrzeit && b.status === "Eingang") {
          changeBewerberStatus(b.id, "Erstgespraech");
        }
      }
      refresh();
    };

    /*
     * ── Eine Notiz schreiben, und zwar nachweislich ──
     *
     * Christian hat am 17.09.2026 gemeldet, dass eine gespeicherte Notiz rechts
     * kurz erscheint und dann wieder verschwindet.
     *
     * Die Ursache lag nicht in der Anzeige, sondern darin, dass niemand auf den
     * Schreibvorgang gewartet hat. `addNotizEntry` war ein blinder Aufruf: Die
     * Notiz stand sofort da, weil `cacheUpdate` die Zeile im Zwischenspeicher
     * zuerst optimistisch aendert. Schlaegt der Schreibvorgang danach fehl,
     * nimmt `cacheUpdate` genau diese Zeile wieder zurueck und wirft den Fehler
     * in ein Versprechen, das niemand liest. Von aussen sieht das aus wie
     * „kurz da, dann weg", und niemand erfaehrt, warum.
     *
     * Jetzt wird gewartet. Erst wenn der Eintrag wirklich geschrieben ist,
     * springt die rechte Spalte auf den Reiter „Notizen" und der Toast kommt.
     * Schlaegt es fehl, sagt das ein Hinweis im Projektstil.
     */
    const notizSpeichern = async (text: string) => {
      const eintrag = await addNotizEntry(b.id, text, user.name || "Unbekannt", user.moreId);
      refresh();
      if (!eintrag) {
        toast({
          title: "Notiz nicht gespeichert",
          description:
            "Der Schreibvorgang ist fehlgeschlagen. Bitte pruefe die Verbindung und versuche es erneut.",
          variant: "destructive",
        });
        return;
      }
      // Ohne diesen Sprung stuende die frische Notiz hinter dem Reiter
      // „Aktivitaeten", also unsichtbar. Der Knopf „Notiz" sitzt links.
      setVerlaufReiter("notizen");
      toast({ title: "Notiz gespeichert" });
    };

    /** Dasselbe beim Loeschen: erst wenn es durch ist, ist es durch. */
    const notizLoeschen = async (notizId: string) => {
      const ok = await deleteNotizEntry(b.id, notizId);
      refresh();
      if (!ok) {
        toast({
          title: "Notiz nicht geloescht",
          description: "Der Schreibvorgang ist fehlgeschlagen. Die Notiz steht weiterhin in der Akte.",
          variant: "destructive",
        });
      }
    };

    /*
     * ── Das Ergebnis eines Telefonats ──
     *
     * Dieselben beiden Wege wie bisher: `logKontaktversuch` fuer die Wirkung,
     * `addNotizEntry` fuer die Notiz. Hier wird nichts neu entschieden, was
     * ein Ergebnis auslöst, steht in `lib/bewerberKontaktversuch.ts`.
     */
    const anrufFesthalten = async (ergebnis: KontaktversuchErgebnis, notiz: string) => {
      const { ok } = await logKontaktversuch({ bewerberId: b.id, ergebnis, beraterName: user.name });
      // Die Notiz haengt nicht am Ergebnis: Wurde der Versuch abgelehnt, etwa
      // wegen des Mindestabstands, waere eine Notiz dazu irrefuehrend.
      if (ok && notiz) await notizSpeichern(notiz);
      refresh();
    };

    /*
     * Das Loeschen ist endgueltig, es gibt keinen Papierkorb fuer Bewerber.
     * Vorher genuegte ein Klick, und die gesamte Akte war weg: Notizen,
     * Gespraechsergebnisse, hochgeladene Unterlagen, Vertragsstand. Deshalb
     * die Rueckfrage mit Namen, damit man sieht, wen man gerade trifft.
     *
     * Steht seit dem Umbau als eigene Funktion, weil der Knopf in die linke
     * Spalte gezogen ist. Der Wortlaut ist unveraendert; eine Rueckfrage, die
     * ihre Worte wechselt, liest irgendwann niemand mehr.
     */
    const loescheBewerber = async () => {
      const name = tarnName(`${b.vorname || ""} ${b.nachname || ""}`.trim(), "bewerber") || "diesen Bewerber";
      const ok = await confirmDialog({
        title: `${name} löschen?`,
        description:
          "Die gesamte Bewerberakte wird endgültig gelöscht: Notizen, Gesprächsergebnisse, " +
          "hochgeladene Unterlagen und der Vertragsstand. Das lässt sich nicht rückgängig machen, " +
          "es gibt keinen Papierkorb für Bewerber.\n\n" +
          "Soll der Bewerber nur nicht mehr in der Liste stehen, setze ihn stattdessen auf " +
          "abgelehnt. Dann bleiben die Daten erhalten.",
        confirmText: "Endgültig löschen",
        cancelText: "Abbrechen",
        variant: "destructive",
      });
      if (!ok) return;
      deleteBewerber(b.id);
      setSelectedBewerberId(null);
      toast({ title: "Bewerber gelöscht" });
    };

    return (
      <DashboardLayout>
        <div ref={profilKopfRef}>
          <button onClick={() => setSelectedBewerberId(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </button>

          {/*
            ── Das Bewerberprofil in drei Spalten ──

            Aufbau wie im Kundenprofil: Links steht die Person und bewegt sich
            nicht mit, in der Mitte wird gearbeitet, rechts steht der Verlauf
            und laesst sich wegklappen. Auf dem Telefon bricht alles ueber
            Containerabfragen in eine Spalte herunter, siehe
            `components/bewerbung/profil/bewerberprofil.css`.
          */}
          <BewerberprofilLayout
            aktivitaetenOffen={aktivitaetenLeiste.offen}
            aktivitaeten={
              <BewerberprofilAktivitaeten
                ereignisse={bewerberEreignisse}
                /*
                  Die Notizen kommen aus derselben Akte wie alles andere. Es
                  gibt keinen zweiten Bestand: `notizenLog` ist der Weg, den
                  der Reiter Uebersicht bisher benutzt hat.
                */
                notizen={b.notizenLog || []}
                altNotiz={b.notizen || ""}
                offen={aktivitaetenLeiste.offen}
                laedt={ereignisseLaden}
                reiter={verlaufReiter}
                onReiter={setVerlaufReiter}
                onUmschalten={() => { void aktivitaetenLeiste.setzen(!aktivitaetenLeiste.offen); }}
                onNotizSchreiben={canManage(user.role) ? () => setNotizOffen(true) : undefined}
                onNotizLoeschen={canManage(user.role) ? (notizId) => { void notizLoeschen(notizId); } : undefined}
              />
            }
            person={
              <BewerberprofilPerson
                b={b}
                canEdit={canManage(user.role)}
                beschreibung={[stelleAnzeige(b.stelleTitel), b.quelle].filter(Boolean).join(" · ")}
                feldKomponente={EditableField}
                /*
                  Die Rechnungsadresse steht bei den Kontaktdaten, kommt aber
                  von hier: Sie liegt als ein mehrzeiliger Text in der Akte und
                  wird zum Bearbeiten in Strasse und PLZ zerlegt. Diese Regel
                  bleibt an einer Stelle, sonst entstehen zwei Arten, dieselbe
                  Adresse zusammenzusetzen.
                */
                zusatzFelder={[
                  {
                    label: "Rechnung",
                    wert: canManage(user.role) ? (
                      <div className="space-y-1">
                        <EditableField
                          value={zerlegeRechnungsadresse(b.rechnungsAdresse).strasse}
                          onSave={(v) => handleFieldSave("rechnungsAdresse", baueRechnungsadresse(
                            { ...zerlegeRechnungsadresse(b.rechnungsAdresse), strasse: v.trim() },
                            [b.vorname, b.nachname].filter(Boolean).join(" "),
                          ))}
                          placeholder="Straße, Hausnr."
                        />
                        <EditableField
                          value={zerlegeRechnungsadresse(b.rechnungsAdresse).plzOrt}
                          onSave={(v) => handleFieldSave("rechnungsAdresse", baueRechnungsadresse(
                            { ...zerlegeRechnungsadresse(b.rechnungsAdresse), plzOrt: v.trim() },
                            [b.vorname, b.nachname].filter(Boolean).join(" "),
                          ))}
                          placeholder="PLZ Ort"
                        />
                        {zerlegeRechnungsadresse(b.rechnungsAdresse).ust && (
                          <p className="text-[10px] text-muted-foreground">{zerlegeRechnungsadresse(b.rechnungsAdresse).ust}</p>
                        )}
                      </div>
                    ) : b.rechnungsAdresse ? (
                      <span className="whitespace-pre-wrap">{b.rechnungsAdresse}</span>
                    ) : (
                      <span className="text-muted-foreground">Identisch mit der Privatadresse</span>
                    ),
                  },
                ]}
                schnellaktionen={
                  <BewerberSchnellaktionen
                    b={b}
                    canEdit={canManage(user.role)}
                    beraterName={user.name}
                    beraterEmail={user.email || ""}
                    autorId={user.moreId}
                    gebuchterTermin={gebuchtesGespraech}
                    abgesagterTermin={
                      bewerberBuchungen[b.id]?.status === "abgesagt" ? bewerberBuchungen[b.id] : null
                    }
                    videocallZusatz={
                      /* Onboarding-Termin: dauerhaft sichtbar wie bisher unter dem
                         Videocall-Termin, damit der naechste Schritt auch dann im
                         Blick bleibt, wenn noch kein Termin steht. */
                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-center gap-2 mb-1">
                          <CalendarClock className="h-4 w-4 text-primary" />
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Onboarding-Termin</p>
                        </div>
                        <p className="text-sm font-semibold">
                          📅 {formatDatum(b.onboardingTerminDatum)}
                          {b.onboardingTerminUhrzeit && ` · ${b.onboardingTerminUhrzeit} Uhr`}
                        </p>
                        {b.onboardingTerminDatum && !b.onboardingTerminGebucht ? (
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium mt-1">
                            Noch nicht als über den Buchungskalender eingebucht bestätigt
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground mt-1">Wird im Reiter „Aktivierung" gesetzt</p>
                        )}
                      </div>
                    }
                    onRefresh={refresh}
                    onFeld={handleFieldSave}
                    onNotiz={canManage(user.role) ? () => setNotizOffen(true) : undefined}
                    onAnruf={canManage(user.role) ? anrufFesthalten : undefined}
                    onFollowUp={(patch) => {
                      updateBewerber(b.id, patch);
                      // Wenn ein Follow-Up-Datum gesetzt wurde → Status automatisch
                      // auf „Follow-Up" setzen (außer der Bewerber ist bereits in
                      // einer späteren Phase wie Paketwahl/Vertrag/Aktiv etc.).
                      if (patch.followUpDatum) {
                        const laterStages: BewerberStatus[] = ["Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv", "Abgelehnt", "KeinInteresse"];
                        if (!laterStages.includes(b.status) && b.status !== "FollowUp") {
                          changeBewerberStatus(b.id, "FollowUp");
                        }
                      }
                      refresh();
                    }}
                  />
                }
                onNameSpeichern={(vorname, nachname) => {
                  updateBewerber(b.id, { vorname, nachname });
                  refresh();
                }}
                onFeld={handleFieldSave}
                onStammdatenBearbeiten={() => setStammdatenEdit({ email: b.email || "", telefon: b.telefon || "" })}
                onLoeschen={loescheBewerber}
                /*
                  Der Haken „schon angeschrieben" stand bis zum 17.09.2026 im
                  Reiter Uebersicht. Er gehoert zur Telefonnummer, und dort
                  steht er jetzt, direkt unter dem gruenen WhatsApp-Zeichen.
                */
                onWhatsappAngeschrieben={canManage(user.role) ? (angeschrieben) => {
                  updateBewerber(b.id, { whatsappAngeschrieben: angeschrieben });
                  refresh();
                } : undefined}
                /*
                  Seit dem 17.09.2026 die einzige Stelle, an der bewertet wird.
                  Der Kasten „Deine Bewertung" im Reiter Uebersicht ist
                  entfallen, er zeigte denselben Wert ein zweites Mal.
                */
                onBewertung={canManage(user.role) ? handleRatingChange : undefined}
                /*
                  Der Vorab-Score steht seit dem 17.09.2026 hier und nicht mehr
                  in der Mitte. Er und die Sterne beantworten dieselbe Frage,
                  der eine gerechnet, die anderen von Hand vergeben, und
                  untereinander sieht man, wo sie auseinandergehen.
                */
                vorabScore={vorabScores[b.id] ? <VorabScoreAbzeichen score={vorabScores[b.id]} /> : undefined}
                /*
                  Der Zaehler der erfolglosen Anrufe, direkt an der Nummer.
                  Dieselbe Bedingung wie der Kasten „Telefonstand": Wer nicht
                  verwalten darf, sieht den Telefonverlauf nicht, und eine Zahl
                  daraus ist nichts anderes als ein Stueck dieses Verlaufs.
                */
                nichtErreichtVersuche={canManage(user.role) ? countNichtErreichtVersuche(b) : 0}
              />
            }
          >
            {/*
              ── Die Reihenfolge der mittleren Spalte ──

              Ganz oben die drei Kaestchen, darunter die Pipelinestufen,
              darunter die Reiter. So von Christian am 17.09.2026 bestellt, und
              es ist auch die Reihenfolge der Fragen: Was ist zu tun, wo steht
              er, und dann erst die Einzelheiten.

              Vorher stand die Stufenleiste ganz oben und die Kaestchen
              darunter.
            */}
            <BewerberprofilKennzahlen b={b} ereignisse={bewerberEreignisse} />

            {/* ── Darunter: die Pipelinestufe ── */}
            <Card className="p-4 mb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  <Badge className={`${statusColor[b.status]} text-white whitespace-nowrap ${darfStufeAendern ? "hidden sm:inline-flex" : ""}`}>{stufeLabel(b.status)}</Badge>
                  {b.followUpDatum && (
                    <Badge className="bg-blue-500 text-white whitespace-nowrap" title={(b.followUpNotiz || "").trim() || "Manueller Follow-Up-Termin"}>
                      🔔 Follow-Up · {formatDatum(b.followUpDatum)}{b.followUpUhrzeit ? ` · ${b.followUpUhrzeit}` : ""}
                    </Badge>
                  )}
                </div>
                {darfStufeAendern && (
                  <Select value={b.status} onValueChange={handleStatusChange}>
                    <SelectTrigger aria-label="Pipelinestufe" className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {([...PIPELINE_STUFEN, "KeinInteresse", "Abgelehnt"] as BewerberStatus[]).map(s => (
                        <SelectItem key={s} value={s}>{stufeLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Pipeline Progress */}
              <div className="sm:hidden mt-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  {/* Den Namen der Stufe traegt auf dem Handy das Auswahlfeld darueber. */}
                  <span className="font-semibold">{darfStufeAendern ? "Pipeline" : stufeLabel(b.status)}</span>
                  <span className="text-muted-foreground">Schritt {Math.max(currentIdx + 1, 1)} von {PIPELINE_STUFEN.length}</span>
                </div>
                <div className="mt-2 flex gap-1" aria-hidden>
                  {PIPELINE_STUFEN.map((stufe, i) => (
                    <div key={stufe} className={`h-2 flex-1 rounded-full ${i <= currentIdx ? PIPELINE_COLORS[stufe] : "bg-muted"}`} />
                  ))}
                </div>
              </div>
              <div className="hidden sm:flex gap-1 mt-3">
                {PIPELINE_STUFEN.map((stufe, i) => (
                  <div key={stufe} className="flex-1 text-center min-w-0">
                    <div className={`h-2.5 rounded-full ${i <= currentIdx ? PIPELINE_COLORS[stufe] : "bg-muted"}`} />
                    <span className="text-[10px] text-muted-foreground mt-1 block truncate">{stufeLabel(stufe)}</span>
                  </div>
                ))}
              </div>
            </Card>

          <Tabs value={detailTab} onValueChange={setDetailTab}>
            {/* Mobile: Dropdown */}
            <div className="sm:hidden">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Bewerberprozess</Label>
              <Select value={detailTab} onValueChange={setDetailTab}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uebersicht">Übersicht</SelectItem>
                  <SelectItem value="erstgespraech">{ablauf.gespraechLabel}{istTeil1Abgeschlossen(b.erstgespraechSkript) ? " ✓" : ""}</SelectItem>
                  <SelectItem value="closing">Closing{b.paketwahl ? " ✓" : ""}</SelectItem>
                  <SelectItem value="dokumente">Dokumente{(b.dokumente || []).length > 0 ? ` (${(b.dokumente || []).length})` : ""}</SelectItem>
                  <SelectItem value="vertrag">Vertrag{b.vertragStatus === "unterschrieben" ? " ✓" : ""}</SelectItem>
                  <SelectItem value="rechnung">Rechnung{b.rechnungBezahltAm ? " ✓" : ""}</SelectItem>
                  <SelectItem value="aktivierung">Aktivierung{b.aktivAm ? " ✓" : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Desktop: Tabs */}
            <TabsList className="hidden sm:flex justify-start bg-transparent border-b rounded-none p-0 h-auto flex-wrap w-full">
              {/* Sieben Reiter, in beiden Abläufen dieselben. Nur der zweite heißt
                  im neuen Ablauf „Videocall": Es gibt dort nur noch einen
                  regulären Termin. Der Wert dahinter bleibt „erstgespraech",
                  damit derselbe Reiterinhalt und derselbe Datensatz gelten. */}
              {["Übersicht", ablauf.gespraechLabel, "Closing", "Dokumente", "Vertrag", "Rechnung", "Aktivierung"].map(t => {
                const valueMap: Record<string, string> = {
                  "Übersicht": "uebersicht",
                  [ablauf.gespraechLabel]: "erstgespraech",
                  "Closing": "closing",
                  "Aktivierung": "aktivierung",
                  "Dokumente": "dokumente",
                  "Vertrag": "vertrag",
                  "Rechnung": "rechnung",
                };
                return (
                  <TabsTrigger key={t} value={valueMap[t] || t.toLowerCase()} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    {t}
                    {t === "Dokumente" && (b.dokumente || []).length > 0 && <Badge className="ml-1 bg-primary text-primary-foreground text-[9px] px-1 py-0">{(b.dokumente || []).length}</Badge>}
                    {/* Grün heißt: Erstgespräch abgeschlossen (Zeitstempel durchgefuehrtAm),
                        dieselbe Regel wie der Einstieg "nur Teil 2" im Reiter Closing.
                        Vorher hing das Häkchen am Closing-Termin. */}
                    {t === ablauf.gespraechLabel && istTeil1Abgeschlossen(b.erstgespraechSkript) && <Badge className="ml-1 bg-green-500 text-white text-[9px] px-1 py-0">✓</Badge>}
                    {t === "Closing" && b.paketwahl && <Badge className="ml-1 bg-green-500 text-white text-[9px] px-1 py-0">✓</Badge>}
                    {t === "Vertrag" && b.vertragStatus === "unterschrieben" && <Badge className="ml-1 bg-green-500 text-white text-[9px] px-1 py-0">✓</Badge>}
                    {t === "Rechnung" && b.rechnungBezahltAm && <Badge className="ml-1 bg-green-500 text-white text-[9px] px-1 py-0">✓</Badge>}
                    {t === "Aktivierung" && b.aktivAm && <Badge className="ml-1 bg-green-500 text-white text-[9px] px-1 py-0">✓</Badge>}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="uebersicht" className="space-y-4 mt-4">
              {/*
                ── Steht ein Gespräch, tritt alles andere zurück ──

                Sobald der Bewerber sich sein persönliches Gespräch selbst
                gebucht hat, ist die Übersicht nur noch für eine Frage da: Wann
                ist es, und wie komme ich in den Raum? Deshalb bleibt diese eine
                Zeile stehen und der Rest klappt zusammen. Nichts wird
                weggenommen, ein Klick holt alles zurück.
              */}
              {gebuchtesGespraech && (
                <Card
                  className="p-4 border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5"
                  data-testid="uebersicht-gespraech-zeile"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      📅 {gebuchtesGespraech.bezeichnung || "Persönliches Gespräch"}
                      {gebuchterTerminText(gebuchtesGespraech.startAt)
                        ? ` am ${gebuchterTerminText(gebuchtesGespraech.startAt)}`
                        : ""}
                    </p>
                    {gebuchtesGespraech.raumPfad && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={gebuchtesGespraech.raumPfad} target="_blank" rel="noreferrer">
                          <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Gesprächsraum öffnen
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>
              )}

              <Collapsible
                open={!gebuchtesGespraech || uebersichtOffen}
                onOpenChange={setUebersichtOffen}
                className="space-y-4"
              >
                {gebuchtesGespraech && (
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${uebersichtOffen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                      {uebersichtOffen ? "Übrige Angaben einklappen" : "Übrige Angaben anzeigen"}
                    </Button>
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent className="space-y-4">
              {/*
                Das Kennenlernen steht nur im neuen Ablauf und nur ganz oben:
                Einladung verschicken, Stand des Bogens, der passende naechste
                Schritt, der selbst gebuchte Termin und die Erinnerungskette.
                Im bestehenden Bewerbungsmanagement gibt es das nicht, dort
                traegt die Karte darunter dieselbe Stelle.
              */}
              {ablauf.id === "neu" && (
                <KennenlernenKarte
                  bewerber={b}
                  canEdit={canManage(user.role)}
                  sammelmail={sammelmail.kennzeichen[b.id]}
                />
              )}

              {/*
                Steht ganz oben, weil es die erste Frage vor jedem Anruf ist:
                Muss ich bei null anfangen oder weiss ich schon etwas ueber ihn?
                Die Antworten selbst bleiben im Reiter Erstgespraech.
              */}

              {/* Hat er sich über die Nachfass-Mail selbst abgemeldet, steht das hier mit Zeitpunkt und Grund. */}
              <SelbstAbmeldungKarte bewerber={b} />

              {/* ─── 1. KI-Zusammenfassung – Schnellblick ─── */}
              {b.erstgespraechSkript?.zusammenfassung && (
                <Card className="p-2 bg-gradient-to-br from-primary/5 to-transparent border-primary/30">
                  {/* In der Uebersicht bewusst eingeklappt, im Erstgespraechs-Reiter offen. */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="ki-summary" className="border-none">
                      <AccordionTrigger className="px-2 py-2 hover:no-underline">
                        <div className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="font-semibold">KI-Zusammenfassung Erstgespräch</span>
                          {b.erstgespraechSkript.zusammenfassungAm && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              · {new Date(b.erstgespraechSkript.zusammenfassungAm).toLocaleDateString("de-DE")}
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pt-1 pb-2">
                        <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                          {b.erstgespraechSkript.zusammenfassung}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              )}

              {/* ─── 1a. Der Vorab-Score ist hier entfallen ───

                      Er stand am 17.09.2026 kurz als grosse Karte an dieser
                      Stelle. Christian wollte ihn als kleines Abzeichen im Stil
                      des Kundenprofils, und dort, wo er etwas beantwortet:
                      links neben den Sternen, siehe `VorabScoreAbzeichen`.
                      Die Herleitung ist nicht verloren, sie steckt hinter einem
                      Klick auf das Abzeichen. ─── */}

              {/* ─── 1b. Assessment-Kurzinfo: Profil-Weiche, Punktzahl, Empfehlung ─── */}
              {hatAssessmentDaten(b.erstgespraechSkript?.assessment) && (() => {
                const a = b.erstgespraechSkript!.assessment!;
                const score = berechneAssessmentScore(a);
                const pfadNamen = (a.pfade ?? []).map((p) => getPfadDef(p).label);
                const stark = staerksterPfad(a.pfade);
                const empfehlungClass =
                  score.empfehlung === "A" ? "bg-green-600 text-white"
                  : score.empfehlung === "B" ? "bg-amber-500 text-white"
                  : "bg-red-600 text-white";
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Assessment</span>
                    {pfadNamen.length > 0 ? (
                      pfadNamen.map((n) => (
                        <Badge key={n} variant={stark && n === stark.label ? "default" : "outline"} className="text-[10px]">
                          {n}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Profil-Weiche offen</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{score.punkte} / {score.maxPunkte} Punkte</Badge>
                    <Badge className={`text-[10px] ${empfehlungClass}`}>{EMPFEHLUNG_LABELS[score.empfehlung]}</Badge>
                    {score.uebersteuert && (
                      <Badge variant="outline" className="text-[10px]">von HR übersteuert</Badge>
                    )}
                  </div>
                );
              })()}

              {/* ─── 1c. Die eigene Bewertung ist hier entfallen ───

                      Sie stand seit dem 17.09.2026 hier, neben Vorab-Score und
                      Assessment. Christian hat den Kasten am selben Tag wieder
                      abbestellt: Dieselben Sterne stehen links bei den
                      Kontaktdaten, und zweimal derselbe Wert ist einmal zu viel.

                      Bewertet wird deshalb jetzt links, siehe `BewerberSterne`
                      in `BewerberprofilPerson`. Dass die beiden Urteile
                      Verschiedenes sind, sagen weiterhin die beiden Zeilen
                      darunter: „Gerechnet aus dem eingereichten Bogen" beim
                      Score, „Von Hand vergeben" bei den Sternen. ─── */}

              {/* ─── 2. Der Telefonstand ───

                      Die beiden Knoepfe „Nicht erreicht" und „Kein Interesse"
                      sind hier entfallen. Sie stecken seit dem Umbau im Fenster
                      hinter dem runden Knopf „Anrufen", zusammen mit dem neuen
                      „Erreicht" und der Notiz dazu. Zwei Stellen mit derselben
                      Wirkung waeren der Anfang zweier verschiedener Antworten
                      auf dieselbe Frage.

                      Der Kasten selbst bleibt, nur ohne Knoepfe und halb so
                      hoch. Was er zeigt, steht sonst nirgends: die Zahl der
                      erfolglosen Versuche, welche der fuenf Mail-Vorlagen als
                      Naechstes hinausgeht, ob ein Closing-Termin steht, ob
                      abgeschlossen ist, die fuenf Balken und der Verlauf.

                      Nicht nach oben in die Kaestchen „Naechste Aktion" und
                      „Zuletzt passiert" verschoben, und zwar aus drei Gruenden.
                      Erstens tragen die fuenf Balken ein Bild und keine Zeile,
                      ein Kaestchen mit einer Textzeile kann sie nicht zeigen.
                      Zweitens haengt dieser Kasten an `canManage`, die
                      Kaestchen oben haben keine Rechtepruefung; sie dorthin zu
                      tragen hiesse, an einer zweiten Stelle zu entscheiden, wer
                      den Telefonverlauf sehen darf. Drittens rechnet
                      `BewerberprofilKennzahlen` aus den Ereignissen, und
                      Kontaktversuche sind dort bewusst keine. ─── */}
              {canManage(user.role) && (
                <Card className="p-4" data-testid="uebersicht-telefonstand">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefonstand</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {(() => {
                          const n = countNichtErreichtVersuche(b);
                          if (b.status === "Abgelehnt" || b.status === "KeinInteresse") return "Abgeschlossen, keine weiteren Versuche";
                          if (closingGebucht(b)) return `Closing-Termin steht${b.closingTerminDatum ? `: ${formatDatum(b.closingTerminDatum)}${b.closingTerminUhrzeit ? ` um ${b.closingTerminUhrzeit} Uhr` : ""}` : ""}`;
                          if (n === 0) return "Noch kein Kontaktversuch protokolliert";
                          if (n >= 5) return `${n} erfolglose Versuche, alle 5 Mails sind raus, weitere werden nur notiert`;
                          return `${n} erfolglose Versuche, nächster: Mail-Vorlage Nr. ${n + 1}`;
                        })()}
                      </p>
                    </div>
                    {/* Fuenf Balken fuer die fuenf Mails. Was darueber hinaus geht,
                        steht als Zahl daneben, denn ab dem sechsten Versuch wird
                        weitergezaehlt, aber nicht mehr geschrieben. */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {[1,2,3,4,5].map(i => {
                        const n = countNichtErreichtVersuche(b);
                        const done = i <= n;
                        return (
                          <div key={i} className={`h-2.5 w-8 rounded-full ${done ? "bg-orange-500" : "bg-muted"}`} title={`Versuch ${i}`} />
                        );
                      })}
                      {countNichtErreichtVersuche(b) > 5 && (
                        <span className="text-xs font-semibold text-orange-500" title="Versuche ohne Mail">
                          +{countNichtErreichtVersuche(b) - 5}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Der Weg zur Aktion, damit niemand die entfallenen Knoepfe sucht. */}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Das Ergebnis eines Telefonats hältst Du über den runden Knopf „Anrufen" links
                    fest, samt Notiz dazu.
                  </p>

                  {/* Verlauf */}
                  {(b.kontaktversuche || []).length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-3">
                      {(b.kontaktversuche || []).map(k => {
                        const dt = new Date(k.datum);
                        // Seit 26.09.2026 geht nur nach dem ersten und dem fünften
                        // Versuch eine Mail raus. Ohne diesen Zusatz sähen die übrigen
                        // Zeilen aus wie ein fehlgeschlagener Versand.
                        const mailNotiz = k.emailGesendet
                          ? " · ✉ gesendet"
                          : nichtErreichtMailStufe(k.versuch || 0) === null ? " · bewusst ohne Mail" : "";
                        const label = k.ergebnis === "nicht_erreicht" ? `Nicht erreicht (Versuch ${k.versuch})${mailNotiz}`
                          : k.ergebnis === "erreicht" ? "Erreicht"
                          : k.ergebnis === "kein_interesse" ? "Kein Interesse"
                          : "Closing-Termin gebucht";
                        return (
                          <div key={k.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span className="min-w-0">{label} · {k.von}</span>
                            <span className="shrink-0">{dt.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}

              {/* ─── 8. Persönlichkeitstyp ─── */}
              {b.typ && (
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Persönlichkeitstyp</p>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary text-primary-foreground">{b.typ}</Badge>
                    <div>
                      <p className="text-sm font-semibold">{b.typLabel || "–"}</p>
                      <p className="text-xs text-muted-foreground">{b.typBeschreibung || ""}</p>
                    </div>
                    {b.typEignung && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">⭐ {b.typEignung}</Badge>
                    )}
                  </div>
                </Card>
              )}

                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            {/* ── Erstgespräch Tab ── */}
            <TabsContent value="erstgespraech" className="space-y-4 mt-4">
              <ErstgespraechsTab
                bewerber={b}
                canEdit={canManage(user.role)}
                onRefresh={refresh}
                beraterName={user.name}
                onWeiterZuClosing={() => setDetailTab("closing")}
              />
            </TabsContent>

            {/* ── Closing Tab ── */}
            <TabsContent value="closing" className="space-y-4 mt-4">
              <ClosingTab
                bewerber={b}
                canEdit={canManage(user.role)}
                hrName={user.name}
                onRefresh={refresh}
                gebuchterTermin={bewerberBuchungen[b.id] ?? null}
              />
            </TabsContent>

            {/* ── Dokumente Tab ── */}
            <TabsContent value="dokumente" className="space-y-4 mt-4">
              {b.lebenslaufUrl && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Lebenslauf</h3>
                  </div>
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">Lebenslauf von {tarnName(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim(), "bewerber")}</p>
                      <p className="text-[10px] text-muted-foreground">PDF · mit Bewerbung eingereicht</p>
                    </div>
                    <a href={b.lebenslaufUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />Öffnen
                      </Button>
                    </a>
                    <a href={b.lebenslaufUrl} download={`Lebenslauf_${tarnName(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim(), "bewerber").replace(/\s+/g, "_")}.pdf`}>
                      <Button size="sm">Download</Button>
                    </a>
                  </div>
                </Card>
              )}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Hochgeladene Dokumente</h3>
                  {canManage(user.role) && (
                    <div className="ml-auto">
                      <DokumentUpload bewerberId={b.id} onSave={refresh} />
                    </div>
                  )}
                </div>
                {(b.dokumente || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Noch keine Dokumente hochgeladen.</p>
                ) : (
                  <div className="space-y-2">
                    {(b.dokumente || []).map(d => (
                      <div key={d.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">{d.typ} · {d.datum}</p>
                        </div>
                        {d.url && (
                          <>
                            <a href={d.url} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 mr-1" />Öffnen</Button>
                            </a>
                            <a href={d.url} download={d.name}>
                              <Button size="sm" variant="outline">Download</Button>
                            </a>
                          </>
                        )}
                        <Badge className={`${DOK_STATUS_COLOR[d.status]} text-white text-[10px]`}>
                          {d.status === "hochgeladen" ? "Hochgeladen" : d.status === "in_pruefung" ? "In Prüfung" : d.status === "freigegeben" ? "Freigegeben" : "Abgelehnt"}
                        </Badge>
                        {canManage(user.role) && (
                          <Select value={d.status} onValueChange={v => { updateDokumentStatus(b.id, d.id, v as any); refresh(); }}>
                            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["hochgeladen", "in_pruefung", "freigegeben", "abgelehnt"].map(s => (
                                <SelectItem key={s} value={s}>{s === "hochgeladen" ? "Hochgeladen" : s === "in_pruefung" ? "In Prüfung" : s === "freigegeben" ? "Freigegeben" : "Abgelehnt"}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* ── Vertrag Tab ── */}
            <TabsContent value="vertrag" className="space-y-4 mt-4">
              <VertragsTab
                bewerber={b}
                canEdit={canManage(user.role)}
                hrName={user.name}
                onRefresh={refresh}
              />
            </TabsContent>

            {/* ── Rechnung Tab ── */}
            <TabsContent value="rechnung" className="space-y-4 mt-4">
              <RechnungsTab
                bewerber={b}
                canEdit={canManage(user.role)}
                currentUserName={user.name}
                onRefresh={refresh}
                adminVorschau={canManage(user.role)}
              />
            </TabsContent>

            <TabsContent value="aktivierung" className="mt-4">
              <AktivierungTab
                bewerber={b}
                canEdit={canManage(user.role)}
                currentUserName={user.name}
                currentUserId={authUser?.id}
                onRefresh={refresh}
                adminVorschau={canManage(user.role)}
                darfNutzerAnlegen={user.role === "admin" || user.role === "inhaber"}
              />
            </TabsContent>
          </Tabs>
          </BewerberprofilLayout>
        </div>

        {/*
          Das Fenster fuer eine neue Notiz, einmal fuer beide Wege hinein: den
          runden Knopf links und den Knopf im Reiter Notizen rechts.

          Gespeichert wird ueber `addNotizEntry`, also genau den Weg, den der
          fruehere Kasten „Notizen" im Reiter Uebersicht benutzt hat. Es
          entsteht kein zweiter Bestand; die Notiz landet wie bisher im
          `notizenLog` der Akte.
        */}
        <BewerberNotizDialog
          offen={notizOffen}
          onOffen={setNotizOffen}
          onSpeichern={(text) => { void notizSpeichern(text); }}
        />

        {/* Stammdaten-Edit-Dialog */}
        <Dialog open={!!stammdatenEdit} onOpenChange={(o) => { if (!o) setStammdatenEdit(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Stammdaten bearbeiten</DialogTitle>
            </DialogHeader>
            {stammdatenEdit && (
              <div className="space-y-4">
                <div>
                  <Label>E-Mail</Label>
                  <Input
                    type="email"
                    value={stammdatenEdit.email}
                    onChange={(e) => setStammdatenEdit({ ...stammdatenEdit, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <PhoneInput
                    value={stammdatenEdit.telefon}
                    onChange={(v) => setStammdatenEdit({ ...stammdatenEdit, telefon: v })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStammdatenEdit(null)}>Abbrechen</Button>
                  <Button onClick={() => {
                    updateBewerber(b.id, {
                      email: stammdatenEdit.email.trim(),
                      telefon: stammdatenEdit.telefon.trim(),
                    });
                    setStammdatenEdit(null);
                    refresh();
                    toast({ title: "Stammdaten aktualisiert" });
                  }}>
                    <Save className="h-4 w-4 mr-1.5" /> Speichern
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  /*
   * Solange noch Angaben fehlen, steht hier die Ladeanzeige.
   *
   * **Der Ausstieg steht bewusst hinter allen Haken.** Jeder `useState`,
   * `useEffect` und jeder eigene Haken dieser Komponente liegt oberhalb; ein
   * `return` davor wuerde die Reihenfolge der Haken zwischen zwei Durchlaeufen
   * veraendern und die Seite zerlegen. Die Detailansicht darueber haelt sich
   * an dieselbe Regel.
   *
   * Die geoeffnete Akte wartet nicht mit: Sie braucht die Angaben der Liste
   * nicht, und wer auf einen Bewerber klickt, soll ihn sofort sehen.
   */
  if (!listeBereit) {
    return (
      <DashboardLayout>
        <BewerberlisteSkelett titel={ablauf.titel} untertitel={ablauf.untertitel} />
      </DashboardLayout>
    );
  }

  // ─── Main List View ───
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title={ablauf.titel} subtitle={ablauf.untertitel}>
          {/*
            Zwei Knoepfe in zwei Gruppen.

            Links das Nachschlagen: das Handbuch zum Ablauf. Es oeffnet etwas
            zum Ansehen und aendert nichts an der Liste. Der Knopf „Ablauf
            umstellen" daneben ist am 26.09.2026 auf Christians Wunsch
            entfallen, siehe `bewerberprozessZuordnung.ts`.

            Rechts, abgesetzt, die eine Handlung dieser Seite: einen Bewerber
            erfassen. Sie steht bewusst allein und aussen, damit der Blick sie
            findet, ohne zwischen gleich aussehenden Knoepfen zu suchen.
          */}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <a href={BEWERBERPROZESS_HANDBUCH_PFAD} target="_blank" rel="noreferrer" title="Der Bewerberprozess im Wortlaut: jede Mail, jede Ansicht des Kennenlernbogens, jede Folie des Gespraechs">
                <FileText className="h-4 w-4" />
                Handbuch
              </a>
            </Button>
          </div>
          {canManage(user.role) && (
            <div className="sm:ml-3">
              <NewBewerberDialog
                open={showNewBewerber}
                onOpenChange={setShowNewBewerber}
                stellen={stellenList}
                onRefresh={refresh}
                ablauf={ablauf}
              />
            </div>
          )}
        </PageHeader>


        {canManage(user.role) && (
          <NachfassMailDialog open={nachfassOffen} onOpenChange={setNachfassOffen} onGesendet={refresh} />
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-transparent border-b rounded-none p-0 h-auto">
            <TabsTrigger value="bewerber" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-2">
              <Users className="h-4 w-4 mr-1.5" />Bewerber ({gesamt})
            </TabsTrigger>
            <TabsTrigger value="stellen" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-2">
              <Building2 className="h-4 w-4 mr-1.5" />Stellenprofile ({stellenList.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bewerber" className="space-y-6 mt-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {[
                { icon: Users, label: "Gesamt", value: gesamt, color: "text-primary" },
                { icon: Clock, label: "Im Prozess", value: imProzess, color: "text-yellow-500" },
                { icon: Rocket, label: "Aktiv", value: onboarding, color: "text-green-500" },
                { icon: XCircle, label: "Abgelehnt", value: abgelehnt, color: "text-red-500" },
              ].map(kpi => (
                <Card key={kpi.label} className="p-4 text-center">
                  <kpi.icon className={`h-5 w-5 mx-auto mb-1 ${kpi.color}`} />
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </Card>
              ))}
            </div>

            {/* Pipeline: eine Leiste fuer Anzeige UND Filter. Frueher gab es
                darunter zusaetzlich eine Pill-Reihe mit denselben Stufen, beide
                setzten denselben Filter, das war doppelt. Jetzt filtert die
                Pipeline selbst: Klick auf eine Stufe filtert, erneuter Klick
                hebt den Filter auf, "Alle" links, die beiden Endzustaende
                rechts. */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Pipeline</p>
              {(() => {
                const nowMsPipe = Date.now();
                const countFor = (s: BewerberStatus | "alle") => {
                  if (s === "alle") return bewerberList.length;
                  if (s === "Eingang") {
                    return bewerberList.filter(b =>
                      b.status === "Eingang" &&
                      !(b.eingangHiddenUntil && new Date(b.eingangHiddenUntil).getTime() > nowMsPipe)
                    ).length;
                  }
                  return bewerberList.filter(b => b.status === s).length;
                };
                const alleStufen: (BewerberStatus | "alle")[] = ["alle", ...PIPELINE_STUFEN, "KeinInteresse", "Abgelehnt"];
                return (
                  <PipelineStufenAuswahl
                    aktiv={stufeFilter}
                    onWaehlen={setStufeFilter}
                    stufen={alleStufen.map(stufe => ({
                      wert: stufe,
                      label: stufe === "alle" ? "Alle" : stufeLabel(stufe),
                      anzahl: countFor(stufe),
                      farbe: stufe === "alle"
                        ? "bg-foreground/70"
                        : (PIPELINE_COLORS[stufe as BewerberStatus] || "bg-muted"),
                    }))}
                  />
                );
              })()}
            </div>

            {/* Search */}
            <div className="flex flex-wrap gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Bewerber suchen..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Die Filterleiste, im Eingang und in der Gesamtsicht dieselbe.
                Sie wirkt zusammen mit der Suche darüber: Ein Bewerber muss
                jede Bedingung erfüllen, nicht irgendeine. */}
            {filterLeisteSichtbar && (
              <BewerberFilterLeiste
                filter={filter}
                onChange={setFilter}
                zaehlung={filterZaehlung}
                quellen={filterQuellen}
                stellen={filterStellen}
              />
            )}

            {/* Duplikat-Erkennung */}
            <BewerberDuplikatBanner bewerber={bewerberList} onMerged={refresh} />



            {/* ─── Gruppierte Ansicht: ein Abschnitt pro Status ─── */}
            {(() => {
              /*
               * Basis: Suche und Filterleiste anwenden, aber die Gruppierung
               * nach Stufen selber machen. Beide wirken zusammen, ein Bewerber
               * muss also jede Bedingung erfüllen. Die Filterleiste wirkt nur
               * dort, wo sie auch steht, siehe `filterLeisteSichtbar`.
               */
              const jetzt = new Date();
              const baseList = bewerberList.filter(
                b => passtZurSuche(b)
                  && (!filterLeisteSichtbar || passtZumFilter(filterZeile(b), filter, jetzt)),
              );

              type Section = {
                key: string;
                label: string;
                icon: string;
                color: string;
                items: Bewerber[];
                isDerived?: boolean;
              };

              // Sortier-Helfer
              const parseDE = (d?: string): number => {
                if (!d) return 0;
                const german = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (german) return new Date(+german[3], +german[2] - 1, +german[1]).getTime();
                const iso = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
                return 0;
              };
              const terminMs = (datum?: string, uhrzeit?: string): number => {
                const base = parseDE(datum);
                if (!base) return 0;
                const [h, mi] = (uhrzeit || "00:00").split(":").map(n => parseInt(n, 10) || 0);
                return base + h * 3600_000 + mi * 60_000;
              };
              const erstelltMs = (b: Bewerber) =>
                b.erstelltAm ? new Date(b.erstelltAm).getTime() : 0;
              // Termin-Sortierung: rein aufsteigend nach Datum + Uhrzeit
              // (frühestes Datum oben). Einträge ohne Termin ans Ende.
              const sortByTermin = (
                items: Bewerber[],
                getDatum: (b: Bewerber) => string | undefined,
                getUhrzeit: (b: Bewerber) => string | undefined,
              ) => {
                const withTermin: { b: Bewerber; t: number }[] = [];
                const withoutTermin: Bewerber[] = [];
                items.forEach(b => {
                  const t = terminMs(getDatum(b), getUhrzeit(b));
                  if (t > 0) withTermin.push({ b, t });
                  else withoutTermin.push(b);
                });
                withTermin.sort((a, b) => a.t - b.t);
                withoutTermin.sort((a, b) => erstelltMs(b) - erstelltMs(a));
                return [...withTermin.map(x => x.b), ...withoutTermin];
              };
              const sortByErstellt = (items: Bewerber[]) =>
                [...items].sort((a, b) => erstelltMs(b) - erstelltMs(a));
              const pipelineSections: Section[] = PIPELINE_STUFEN.map(stufe => ({
                key: stufe,
                label: stufeLabel(stufe),
                icon: "",
                color: (PIPELINE_COLORS[stufe] || "bg-muted").replace("text-white", "").trim(),
                items: (() => {
                  const items = baseList.filter(b => {
                    if (b.status !== stufe) return false;
                    // „Nicht erreicht"-Snooze: in der „Eingang"-Sektion immer ausblenden,
                    // bis das `eingangHiddenUntil`-Datum erreicht ist (konsistent mit Pill-Zähler).
                    if (stufe === "Eingang" && imEingangVerborgen(b)) return false;
                    return true;
                  });
                  if (stufe === "Erstgespraech") {
                    return sortByTermin(items, b => b.erstgespraechDatum, b => b.erstgespraechUhrzeit);
                  }
                  if (stufe === "Closing") {
                    // Nach demselben Termin sortieren, den die Spalte zeigt. Sonst
                    // stünde ein selbst gebuchter Termin unten bei den Terminlosen.
                    return sortByTermin(
                      items,
                      b => closingGespraechTermin(b, bewerberBuchungen[b.id]).datum,
                      b => closingGespraechTermin(b, bewerberBuchungen[b.id]).uhrzeit,
                    );
                  }
                  return sortByErstellt(items);
                })(),
              }));

              const keinInteresseSection: Section = {
                key: "KeinInteresse",
                label: stufeLabel("KeinInteresse"),
                icon: "○",
                color: "bg-amber-600",
                items: sortByErstellt(baseList.filter(b => b.status === "KeinInteresse")),
              };
              const abgelehntSection: Section = {
                key: "Abgelehnt",
                label: stufeLabel("Abgelehnt"),
                icon: "✕",
                color: "bg-red-500",
                items: sortByErstellt(baseList.filter(b => b.status === "Abgelehnt")),
              };

              const allSections = [...pipelineSections, keinInteresseSection, abgelehntSection];

              // Wenn ein Status-Filter aktiv ist: nur diesen Abschnitt auto-öffnen, andere zubleiben
              const defaultOpen = stufeFilter === "alle"
                ? allSections.filter(s => s.items.length > 0).map(s => s.key)
                : [stufeFilter];

              const renderTable = (items: Bewerber[], isAbgelehnt = false, sectionKey?: string) => {
                if (items.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {filterWirkt
                        ? "Zu diesem Filter passt hier kein Bewerber."
                        : "Keine Bewerber in diesem Status."}
                    </p>
                  );
                }
                const mobileListe = (
                  <div className="divide-y sm:hidden">
                    {items.map(b => {
                      // Dieselben Quellen wie in der Tabelle, sonst sieht das
                      // Handy weniger als der Rechner. Durch formatDatum, weil ein
                      // selbst gebuchter Termin als JJJJ-MM-TT gespeichert ist.
                      const closingTermin = closingGespraechTermin(b, bewerberBuchungen[b.id]);
                      const termin = sectionKey === "Closing"
                        ? [closingTermin.datum ? formatDatum(closingTermin.datum) : "", closingTermin.uhrzeit]
                            .filter(Boolean).join(" · ")
                        : sectionKey === "FollowUp"
                        ? [b.followUpDatum, b.followUpUhrzeit].filter(Boolean).join(" · ")
                        : sectionKey === "Bedenkzeit"
                        ? b.bedenkzeitRueckrufAm
                        : [b.erstgespraechDatum, b.erstgespraechUhrzeit].filter(Boolean).join(" · ");
                      const grund = b.erstgespraechSkript?.absageGrund || b.closingAbgelehntGrund;
                      return (
                        /*
                          Zwei Zeilen statt fünf.
                          ─────────────────────
                          Vorher stand jede Angabe auf einer eigenen Zeile, dazu die
                          Stellenbezeichnung. Damit passten knapp vier Bewerber auf
                          einen Handybildschirm, im Eingang mit über zweihundert
                          Bewerbern ist das unbrauchbar.

                          Jetzt trägt Zeile eins alles, woran man einen Bewerber
                          wiedererkennt und wonach man ihn vorzieht: Name, die
                          Kennzeichen und der Score. Zeile zwei trägt Kontakt und
                          Termin nebeneinander statt untereinander.

                          Die Stellenbezeichnung ist bewusst weg. Sie lautet bei fast
                          allen gleich, füllte aber eine ganze Zeile. Wer nach ihr
                          sucht, filtert in der Filterleiste danach; im Profil steht
                          sie ohnehin.
                        */
                        <button
                          key={b.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
                          onClick={() => { markItemSeen(SEEN_KEYS.bewerbungen, b.id); setSelectedBewerberId(b.id); }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="min-w-0 truncate text-sm font-semibold">
                                {tarnName(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim(), "bewerber")}
                              </span>
                              {/* Dieselben Kennzeichen wie in der Tabelle, sonst sieht das Handy weniger als der Rechner. */}
                              <WartetAufEntscheidungBadge
                                stand={standAusBewerber(b)}
                                sammelmail={sammelmail.kennzeichen[b.id]}
                                hatMailZumBogen={kennenlernMailAm(b, bogenVersand[b.id]) !== null}
                              />
                              <KennenlernMailVermerk bewerber={b} bogen={bogenVersand[b.id]} oeffnung={mailOeffnungen[b.id]}
                                bogenEingereichtAm={kennenlernEingereichtAm[b.id]}
                                vorabbogenEingereichtAm={vorabEingereichtAm[b.id]} />
                              {/*
                                Der Score, rechtsbündig und in jeder Karte an derselben
                                Stelle. Auf dem Rechner ist er eine eigene Spalte, hier
                                gibt es keine, deshalb steht er am Zeilenende. Der Bogen
                                schlägt die Schätzung, genau wie in der Spalte.
                              */}
                              {(() => {
                                const score = vorabScores[b.id];
                                if (score) return <span className="ml-auto shrink-0"><VorabScoreBadge score={score} /></span>;
                                const schaetzung = metaScores[b.id];
                                return schaetzung ? (
                                  <span className="ml-auto shrink-0"><MetaScoreBadge score={schaetzung} /></span>
                                ) : null;
                              })()}
                            </div>
                            {/*
                              Kontakt und Termin in EINER Zeile. Nur die Mailadresse darf
                              schrumpfen, Telefonnummer und Termin bleiben ganz: Die
                              Nummer ist auf dem Handy die eigentliche Handlung, und ein
                              halber Termin ist keiner.
                            */}
                            <div className="mt-0.5 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
                              {b.email && <span className="min-w-0 truncate">{tarnEmail(b.email)}</span>}
                              {b.telefon && <span className="shrink-0">{tarnTelefon(normalizeTelefon(b.telefon))}</span>}
                              {termin && <span className="shrink-0 font-medium text-foreground">📅 {formatDatum(termin.split(" · ")[0])}{termin.includes(" · ") ? ` · ${termin.split(" · ")[1]}` : ""}</span>}
                              {/* Dasselbe Kennzeichen wie in der Tabelle, sonst sieht das Handy weniger als der Rechner. */}
                              {sectionKey === "Closing" && closingTermin.abgesagt && <span className="shrink-0"><TerminAbgesagtBadge /></span>}
                            </div>
                            {grund && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Grund: {grund}</p>}
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
                  </div>
                );
                if (isAbgelehnt) {
                  return (
                    <><div className="hidden sm:block"><Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] uppercase tracking-wider">Erstellt</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider">Name</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider">Kontakt</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider">Stelle</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider">Abgelehnt am</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider">Grund</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(b => {
                          const grund = b.erstgespraechSkript?.absageGrund || b.closingAbgelehntGrund || "—";
                          const datum = b.erstgespraechSkript?.abgelehntAm
                            ? new Date(b.erstgespraechSkript.abgelehntAm).toLocaleDateString("de-DE")
                            : "—";
                          const erstelltDatum = b.erstelltAm
                            ? new Date(b.erstelltAm).toLocaleDateString("de-DE")
                            : "–";
                          return (
                            <TableRow key={b.id} className="cursor-pointer hover:bg-muted/30" onClick={() => { markItemSeen(SEEN_KEYS.bewerbungen, b.id); setSelectedBewerberId(b.id); }}>
                              <TableCell className="text-xs whitespace-nowrap">{erstelltDatum}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium flex items-center gap-1.5">
                                    {(() => {
                                      const cut = getSeenAt(SEEN_KEYS.bewerbungen);
                                      const isNew = !isItemSeen(SEEN_KEYS.bewerbungen, b.id) && (cut ? String(b.erstelltAm || "") > cut : false);
                                      return isNew ? (
                                        <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">Neu</Badge>
                                      ) : null;
                                    })()}
                                    {tarnName(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim(), "bewerber")}
                                    <PerMailAbgemeldetBadge bewerber={b} />
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{tarnEmail(b.email)}</TableCell>
                              <TableCell className="text-xs max-w-[160px] truncate">{stelleAnzeige(b.stelleTitel)}</TableCell>
                              <TableCell className="text-xs">{datum}</TableCell>
                              <TableCell className="text-xs max-w-[300px] truncate" title={grund}>{grund}</TableCell>
                              <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table></div>{mobileListe}</>
                  );
                }
                /*
                 * Welche Spalten diese Stufe zeigt. Die Regel steht in
                 * `bewerberSpalten.ts`, damit ein Test sie lesen kann: Kopf und
                 * Zellen sind zwei getrennte Stellen, und weicht eine ab,
                 * verrutscht jede Zeile um ein Feld.
                 */
                const zeige = (spalte: string) => bewerberSpalteSichtbar(spalte, sectionKey || "");

                const isClosingSection = sectionKey === "Closing";
                /*
                 * Zeigt dieser Abschnitt oben die mit ausgefülltem Bogen?
                 * Nur im Eingang und beim Videocall, die Begründung steht in
                 * `bogenTrennungZeigen`.
                 */
                const bogenTrennung = bogenTrennungZeigen(sectionKey || "");
                /** Sortiert der Nutzer diesen Abschnitt gerade nach Datum? */
                const nachTerminSortiert = terminSortierung !== "aus" && isClosingSection;
                const isFollowUpSection = sectionKey === "FollowUp";
                const isBedenkzeitSection = sectionKey === "Bedenkzeit";
                const stillesErstgespraech = ["Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv"].includes(sectionKey || "");
                const terminHeader = isClosingSection
                  ? "Closing-Gespräch"
                  : isFollowUpSection
                  ? "Follow-Up"
                  : isBedenkzeitSection
                  ? "Rückruf"
                  : ablauf.gespraechLabel;
                return (
                  <><div className="hidden sm:block"><Table>
                    <TableHeader>
                      <TableRow>
                        {([
                          ["Erstellt", "Erstellt"],
                          ["Name", "Name"],
                          ["Kontakt", "Kontakt"],
                          ["Telefon", "Telefon"],
                          ["Quelle", "Quelle"],
                          ["Anrufe", "Anrufe"],
                          ["Vorab-Score", "Vorab-Score"],
                          ["WhatsApp", "WhatsApp"],
                          ["Termin", terminHeader],
                          ["Stelle", "Stelle"],
                          ["Rechnung", "Rechnung"],
                          ["Unterschrieben", "Unterschrieben"],
                          ["Bewertung", "Bewertung"],
                          ["Typ", "Typ"],
                        ] as [string, string][]).filter(([id]) => zeige(id)).map(([id, kopf]) => (
                          <TableHead key={id} className="text-[10px] uppercase tracking-wider">
                            {id === "Vorab-Score" ? (
                              <SortierSpaltenkopf
                                zustand={scoreSortierung}
                                onKlick={() => sortiereSpalte("score")}
                                titel="Nach Vorab-Score sortieren. Die Einschätzungen aus den Bewerbungsfragen sortieren mit."
                                ansage={{
                                  aus: "Nach Vorab-Score sortieren, bester zuerst",
                                  hoch: "Sortierung umkehren, schwächster zuerst",
                                  runter: "Sortierung nach Vorab-Score aufheben",
                                }}
                              >
                                <VorabScoreSpaltenkopf />
                              </SortierSpaltenkopf>
                            ) : id === "Termin" && isClosingSection ? (
                              <SortierSpaltenkopf
                                zustand={terminSortierung}
                                onKlick={() => sortiereSpalte("termin")}
                                titel="Nach dem Termin des Closing-Gesprächs sortieren. Bewerber ohne Termin stehen in beiden Richtungen am Ende."
                                ansage={{
                                  aus: "Nach dem Closing-Gespräch sortieren, frühester Termin zuerst",
                                  hoch: "Sortierung umkehren, spätester Termin zuerst",
                                  runter: "Sortierung nach dem Closing-Gespräch aufheben",
                                }}
                              >
                                {kopf}
                              </SortierSpaltenkopf>
                            ) : kopf}
                          </TableHead>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        /*
                         * Zwei Bereiche im Eingang und beim Videocall: oben
                         * die mit ausgefülltem Bogen, darunter alle anderen.
                         * Ab Closing eine durchgehende Liste.
                         *
                         * Warum der Unterschied: Vor dem Gespräch entscheidet
                         * der ausgefüllte Bogen darüber, wer am Zug ist. Wer
                         * ihn ausgefüllt hat, will eingeladen werden, und ein
                         * solcher Fall darf nicht nach unten rutschen, nur
                         * weil jemand anders sortiert. Deshalb liegt die
                         * Zweiteilung dort ÜBER der Sortierung und nicht
                         * daneben.
                         *
                         * Ab Closing steht der Termin fest. Dann zählt das
                         * Datum und nicht mehr der Bogen, und eine
                         * Zweiteilung würde die Reihenfolge nach Datum nur
                         * zerreißen: Terminlose mit Bogen stünden mitten in
                         * der Liste. Welche Stufe was bekommt, steht in
                         * `bogenTrennungZeigen`; so entschieden am 18.09.2026.
                         *
                         * Die Sortierung nach dem Vorab-Score bleibt überall,
                         * sie ist eine eigene Sache.
                         *
                         * Erkennungsmerkmal ist der vorhandene Vorab-Score:
                         * Den gibt es nur zu einem eingereichten Bogen.
                         */
                        const ausgefuellt = (x: Bewerber) => vorabScores[x.id] !== undefined;
                        if (nachTerminSortiert) {
                          /*
                           * Sortiert wird nach genau dem Zeitpunkt, den die
                           * Spalte auch anzeigt (`closingGespraechTermin`),
                           * samt Uhrzeit. Sonst stünde die Liste in einer
                           * Reihenfolge, die man ihr nicht ansieht, und zwei
                           * Termine am selben Tag stünden zufällig.
                           * Bewerber ohne Termin stehen in beiden Richtungen
                           * am Ende, siehe `sortiereNachTermin`.
                           */
                          return sortiereNachTermin(items, b => {
                            const t = closingGespraechTermin(b, bewerberBuchungen[b.id]);
                            return terminZeitpunktMs(t.datum, t.uhrzeit);
                          }, terminSortierung);
                        }
                        const sortiert = scoreSortierung === "aus"
                        ? items
                        : [...items].sort((a, b) => {
                            /*
                             * Sortiert wird über beide Zahlen gemeinsam, den
                             * Score aus dem Bogen und die Einschätzung aus den
                             * Bewerbungsfragen. Getrennt sortiert stünde eine
                             * geschätzte 100 hinter einer belegten 30, und
                             * genau für die Anrufreihenfolge wäre das unbrauchbar.
                             */
                            const pa = vorabScores[a.id]?.punkte ?? metaScores[a.id]?.wert;
                            const pb = vorabScores[b.id]?.punkte ?? metaScores[b.id]?.wert;
                            // Weder Bogen noch Angaben aus der Anzeige. Diese
                            // Bewerber stehen in beiden Richtungen am Ende:
                            // Eine fehlende Angabe ist keine schlechte Angabe.
                            if (pa === undefined && pb === undefined) return 0;
                            if (pa === undefined) return 1;
                            if (pb === undefined) return -1;
                            if (pa !== pb) return scoreSortierung === "hoch" ? pb - pa : pa - pb;
                            /*
                             * Gleicher Wert: Der belegte Score steht vor der
                             * Schätzung, in beiden Richtungen. Er beruht auf
                             * einem ausgefüllten Bogen und nicht auf vier
                             * Antworten aus einer Anzeige.
                             */
                            const echtA = vorabScores[a.id] !== undefined ? 0 : 1;
                            const echtB = vorabScores[b.id] !== undefined ? 0 : 1;
                            return echtA - echtB;
                          });
                        // Ohne Zweiteilung bleibt es bei der einen Reihenfolge.
                        if (!bogenTrennung) return sortiert;
                        /*
                         * Stabil sortiert: Innerhalb der beiden Bereiche bleibt
                         * die Reihenfolge von oben erhalten, ob sie nun vom
                         * Erstelldatum kommt oder vom Score.
                         */
                        return [...sortiert].sort(
                          (a, b) => (ausgefuellt(a) ? 0 : 1) - (ausgefuellt(b) ? 0 : 1),
                        );
                      })().map((b, i, alle) => {
                        // Die erste Zeile des unteren Bereichs bekommt einen
                        // Trennstrich, damit man die Zweiteilung sieht. Ohne
                        // Zweiteilung kein Strich: Er stünde sonst an einer
                        // Stelle, die nichts trennt.
                        const grenzeHier =
                          bogenTrennung
                          && i > 0
                          && vorabScores[alle[i - 1].id] !== undefined
                          && vorabScores[b.id] === undefined;
                        const zs = getRechnungZahlStatus(b);
                        const versuche = countNichtErreichtVersuche(b);
                        const cg = closingGebucht(b);
                        const erstelltDatum = b.erstelltAm
                          ? new Date(b.erstelltAm).toLocaleDateString("de-DE")
                          : "–";
                        return (
                          <TableRow key={b.id} className={`cursor-pointer hover:bg-muted/30 ${grenzeHier ? "border-t-2 border-t-border" : ""}`} onClick={() => { markItemSeen(SEEN_KEYS.bewerbungen, b.id); setSelectedBewerberId(b.id); }}>
                            {/*
                              Unter dem Erstelldatum steht, wann die Mail mit dem
                              Kennenlernbogen hinausging. Beides sind Zeitangaben zum
                              selben Vorgang, deshalb gehoeren sie in eine Spalte und
                              nicht in zwei.
                            */}
                            <TableCell className="text-xs whitespace-nowrap align-top">
                              <span className="inline-flex items-start">
                                <span className="inline-block w-[5.5rem]">{erstelltDatum}</span>
                                <KennenlernMailVermerk bewerber={b} bogen={bogenVersand[b.id]} oeffnung={mailOeffnungen[b.id]}
                                  bogenEingereichtAm={kennenlernEingereichtAm[b.id]}
                                  vorabbogenEingereichtAm={vorabEingereichtAm[b.id]} />
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium flex items-center gap-1.5">
                                  {(() => {
                                    const cut = getSeenAt(SEEN_KEYS.bewerbungen);
                                    const isNew = !isItemSeen(SEEN_KEYS.bewerbungen, b.id) && (cut ? String(b.erstelltAm || "") > cut : false);
                                    return isNew ? (
                                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">Neu</Badge>
                                    ) : null;
                                  })()}
                                  {tarnName(`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim(), "bewerber")}
                                  {/*
                                    Bei wem die Erinnerungskette dauerhaft steht. Ohne dieses
                                    Kennzeichen sieht ein solcher Bewerber in der Liste aus wie
                                    jeder andere im Eingang, nur geschieht bei ihm nichts mehr.
                                  */}
                                  <WartetAufEntscheidungBadge
                                    stand={standAusBewerber(b)}
                                    sammelmail={sammelmail.kennzeichen[b.id]}
                                    hatMailZumBogen={kennenlernMailAm(b, bogenVersand[b.id]) !== null}
                                  />
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{tarnEmail(b.email)}</TableCell>
                            <TableCell className="text-xs">
                              {b.telefon ? (
                                (() => {
                                  const tel = normalizeTelefon(b.telefon);
                                  return (
                                    <a href={tarnVerweis(`tel:${tel.replace(/\s+/g, "")}`)} onClick={e => e.stopPropagation()} className="hover:text-primary hover:underline">{tarnTelefon(tel)}</a>
                                  );
                                })()
                              ) : <span className="text-muted-foreground">–</span>}
                            </TableCell>
                            {zeige("Quelle") && <TableCell className="text-sm">{b.quelle}</TableCell>}
                            {zeige("Anrufe") && <TableCell className="text-xs">
                              {cg ? <Badge className="bg-green-500 text-white text-[10px]">Closing gebucht</Badge>
                                : versuche === 0 ? <Badge variant="outline" className="text-[10px]">Kein Versuch</Badge>
                                : versuche >= 5 ? <Badge className="bg-red-500 text-white text-[10px]">{versuche}x nicht erreicht</Badge>
                                : <Badge className="bg-orange-500 text-white text-[10px]">{versuche}x nicht erreicht</Badge>}
                            </TableCell>}
                            <TableCell className="text-xs">
                              {/*
                                Wo kein Bogen vorliegt, stand hier bisher immer ein Strich.
                                Ein grüner Punkt tritt an seine Stelle, wenn die Antworten
                                aus der Anzeige Immobilien oder Finanzdienstleistung nennen.
                              */}
                              <VorabScoreZelle
                                score={vorabScores[b.id]}
                                metaScore={metaScores[b.id]}
                              />
                            </TableCell>
                            {zeige("WhatsApp") && <TableCell className="text-xs">
                              {b.whatsappAngeschrieben
                                ? (b.telefon ? (
                                    <a
                                      href={tarnVerweis(whatsAppLink(b.telefon) || "#")}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex"
                                    >
                                      <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] gap-1 cursor-pointer"><MessageCircle className="h-3 w-3" />Ja</Badge>
                                    </a>
                                  ) : <Badge className="bg-green-500 text-white text-[10px] gap-1"><MessageCircle className="h-3 w-3" />Ja</Badge>)
                                : <Badge variant="outline" className="text-[10px] text-muted-foreground">Nein</Badge>}
                            </TableCell>}
                            {zeige("Termin") && <TableCell className="text-xs">
                              {isClosingSection ? (
                                // Zwei Quellen, siehe closingGespraechTermin: der im CRM
                                // gepflegte Termin und der vom Bewerber selbst gebuchte.
                                (() => {
                                  const t = closingGespraechTermin(b, bewerberBuchungen[b.id]);
                                  if (!t.datum) return <span className="text-muted-foreground">–</span>;
                                  const vorbei = terminIstVergangen(t.datum, t.uhrzeit);
                                  return (
                                    <div className="flex flex-col gap-1" data-testid={`closing-termin-${b.id}`}>
                                      <span className={`font-semibold ${vorbei && !t.abgesagt ? "text-destructive" : ""}`}>
                                        📅 {formatDatum(t.datum)}{t.uhrzeit ? ` · ${t.uhrzeit}` : ""}
                                      </span>
                                      {(t.quelle === "selbstGebucht" || t.quelle === "buchung") && !t.abgesagt && (
                                        <span className="text-[10px] text-muted-foreground">Selbst gebucht</span>
                                      )}
                                      {/*
                                        Abgesagt schlaegt Vergangen: Ein abgesagter Termin ist
                                        nicht verstrichen, er findet gar nicht statt. Beide
                                        Kennzeichen nebeneinander saehen aus wie zwei Vorgaenge.
                                      */}
                                      {t.abgesagt ? (
                                        <TerminAbgesagtBadge className="w-fit" />
                                      ) : vorbei ? (
                                        <Badge className="bg-destructive text-white text-[10px] w-fit">Vergangen</Badge>
                                      ) : null}
                                    </div>
                                  );
                                })()
                              ) : isBedenkzeitSection ? (
                                // Der vereinbarte Rueckruftermin. Ueberfaellig wird rot,
                                // denn genau hier gehen die Bewerber verloren.
                                b.bedenkzeitRueckrufAm ? (
                                  <div className="flex flex-col gap-1">
                                    <span className={`font-semibold ${terminIstVergangen(b.bedenkzeitRueckrufAm) ? "text-destructive" : ""}`}>
                                      ⏳ {formatDatum(b.bedenkzeitRueckrufAm)}
                                    </span>
                                    {terminIstVergangen(b.bedenkzeitRueckrufAm) && (
                                      <Badge className="bg-destructive text-white text-[10px] w-fit">Überfällig</Badge>
                                    )}
                                    {b.bedenkzeitGrund && (
                                      <span className="text-muted-foreground text-[10px] max-w-[200px] truncate" title={b.bedenkzeitGrund}>
                                        {b.bedenkzeitGrund}
                                      </span>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground">–</span>
                              ) : isFollowUpSection ? (
                                b.followUpDatum ? (
                                  <div className="flex flex-col gap-1">
                                    <span className={`font-semibold ${terminIstVergangen(b.followUpDatum, b.followUpUhrzeit) ? "text-destructive" : ""}`}>
                                      🔔 {formatDatum(b.followUpDatum)}{b.followUpUhrzeit ? ` · ${b.followUpUhrzeit}` : ""}
                                    </span>
                                    {terminIstVergangen(b.followUpDatum, b.followUpUhrzeit) && (
                                      <Badge className="bg-destructive text-white text-[10px] w-fit">Überfällig</Badge>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground">–</span>
                              ) : b.erstgespraechDatum ? (
                                <div className="flex flex-col gap-1">
                                  <span className={`font-semibold ${!stillesErstgespraech && terminIstVergangen(b.erstgespraechDatum, b.erstgespraechUhrzeit) ? "text-destructive" : ""}`}>
                                    📅 {formatDatum(b.erstgespraechDatum)}{b.erstgespraechUhrzeit ? ` · ${b.erstgespraechUhrzeit}` : ""}
                                  </span>
                                  {b.erstgespraechBerater && <span className="text-muted-foreground">{b.erstgespraechBerater}</span>}
                                  {!stillesErstgespraech && terminIstVergangen(b.erstgespraechDatum, b.erstgespraechUhrzeit) && (
                                    <Badge className="bg-destructive text-white text-[10px] w-fit">Vergangen</Badge>
                                  )}
                                </div>
                              ) : <span className="text-muted-foreground">–</span>}
                            </TableCell>}
                            <TableCell className="text-xs max-w-[140px] truncate">{stelleAnzeige(b.stelleTitel)}</TableCell>
                            {/*
                              Die Spalte "Status" ist ersatzlos entfallen. Jeder
                              Abschnitt IST eine Stufe, die Spalte wiederholte in
                              jeder Zeile die Ueberschrift darueber.
                            */}
                            {zeige("Rechnung") && <TableCell>
                              {zs === "nicht_erstellt" ? <span className="text-xs text-muted-foreground">–</span>
                                : <Badge className={`${ZAHL_STATUS_BADGE[zs]} text-[10px]`}>{ZAHL_STATUS_LABEL[zs]}</Badge>}
                            </TableCell>}
                            {/*
                              In der Stufe Vertrag steht hier das Datum der
                              Unterschrift statt der Sternebewertung. Fehlt die
                              Gegenzeichnung noch, sagt die Zelle das
                              ausdruecklich: Ein blosses Datum liesse offen, ob
                              der Vorgang laeuft oder im eigenen Haus haengt.
                            */}
                            {zeige("Unterschrieben") && (() => {
                              const stand = unterschriftsstand(b);
                              if (!stand) return <TableCell><span className="text-xs text-muted-foreground">–</span></TableCell>;
                              return (
                                <TableCell className="text-sm whitespace-nowrap">
                                  {stand.datum || <span className="text-muted-foreground">Datum unbekannt</span>}
                                  {stand.wartetAufKurz && (
                                    <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                                      wartet auf Kurz
                                    </Badge>
                                  )}
                                </TableCell>
                              );
                            })()}
                            {zeige("Bewertung") && <TableCell><StarRating rating={b.bewertung} /></TableCell>}
                            {zeige("Typ") && <TableCell className="text-sm">{b.typ ? <Badge variant="outline" className="text-xs">{b.typ}</Badge> : "–"}</TableCell>}
                            <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table></div>{mobileListe}</>
                );
              };

              // Filter: bei aktivem stufeFilter nur diesen Abschnitt zeigen
              const visibleSections = stufeFilter === "alle"
                ? allSections
                : allSections.filter(s => s.key === stufeFilter);

              /*
               * Hat der Filter alles weggenommen, sagt eine Zeile das und
               * bietet den Weg zurück an. Sonst stünde da eine Reihe leerer,
               * zugeklappter Abschnitte, und das sieht aus wie ein Fehler.
               */
              if (filterWirkt && visibleSections.every(s => s.items.length === 0)) {
                return <BewerberFilterLeer onZuruecksetzen={() => setFilter({ ...FILTER_STANDARD })} />;
              }

              // Der Schlüssel des Accordions enthält auch den Filter: Sonst
              // bliebe ein Abschnitt zugeklappt, der durch den Filter gerade
              // erst Inhalt bekommen hat.
              return (
                <Accordion type="multiple" defaultValue={defaultOpen} key={stufeFilter + search + JSON.stringify(filter)} className="space-y-2">
                  {visibleSections.map(section => (
                    <AccordionItem key={section.key} value={section.key} className="border rounded-lg bg-card overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                        {/* `min-w-0` und `truncate`: Ohne beides schob eine lange
                            Stufenbezeichnung auf dem Handy die Anzahl und den Pfeil
                            aus dem Kasten heraus. */}
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                          <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${section.color}`} />
                          <span className="min-w-0 truncate text-sm font-semibold">{section.icon && `${section.icon} `}{section.label}</span>
                          {section.isDerived && <Badge variant="outline" className="shrink-0 text-[9px] uppercase">Schnellzugriff</Badge>}
                          <Badge variant="secondary" className="ml-auto mr-2 shrink-0 text-[10px]">{section.items.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pt-0 pb-0">
                        {/* Kopf des Eingangs: Hinweisbalken zur letzten Welle und der
                            Versandknopf. Nicht im AccordionTrigger, der ist selbst ein
                            Knopf und darf keinen zweiten enthalten. */}
                        {section.key === "Eingang" && (
                          <div className="flex flex-col gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <NachfassHinweisBalken bewerber={bewerberList} />
                            </div>
                            {canManage(user.role) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 shrink-0"
                                onClick={() => setNachfassOffen(true)}
                              >
                                <Send className="h-3.5 w-3.5" aria-hidden />
                                Sammelmail zum Kennenlernen senden
                              </Button>
                            )}
                          </div>
                        )}
                        {renderTable(section.items, section.key === "Abgelehnt" || section.key === "KeinInteresse", section.key)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              );
            })()}
          </TabsContent>

          <TabsContent value="stellen" className="space-y-6 mt-4">
            {canManage(user.role) && (
              <div className="flex justify-end">
                <StelleDialog open={showNewStelle} onOpenChange={setShowNewStelle} onRefresh={refresh} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {(["Veröffentlicht", "Entwurf", "Besetzt", "Geschlossen"] as StellenStatus[]).map(status => (
                <Card key={status} className="p-4 text-center">
                  <p className="text-2xl font-bold">{stellenList.filter(s => s.status === status).length}</p>
                  <p className="text-xs text-muted-foreground">{status}</p>
                </Card>
              ))}
            </div>

            <div className="space-y-3 sm:hidden">
              <Input placeholder="Stellen suchen..." value={stellenTitelFilter} onChange={e => setStellenTitelFilter(e.target.value)} />
              <Select value={stellenStatusFilter} onValueChange={setStellenStatusFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Alle Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  {["Veröffentlicht", "Entwurf", "Besetzt", "Geschlossen"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredStellen.map(s => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="break-words text-sm font-semibold">{s.titel}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {s.abteilung && <span>{s.abteilung}</span>}
                        {s.standort && <span>· {s.standort}</span>}
                        {s.art && <span className="w-full">{s.art}</span>}
                      </div>
                      <Badge className={`${statusColor[s.status]} mt-3 text-[10px] text-white`}>{s.status}</Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.status === "Veröffentlicht" && (
                        <Button variant="ghost" size="icon" aria-label="Bewerbungslink kopieren" className="h-8 w-8" onClick={() => {
                          navigator.clipboard.writeText(getStellenShareUrl(s.id));
                          toast({ title: "Link kopiert!", description: "Der Bewerbungslink wurde in die Zwischenablage kopiert." });
                        }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage(user.role) && (
                        <Button variant="ghost" size="icon" aria-label="Stelle bearbeiten" className="h-8 w-8" onClick={() => setEditStelleId(s.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Titel", "Abteilung", "Standort", "Art", "Status", "Erstellt", "Link"].map(h => (
                      <TableHead key={h} className="text-[10px] uppercase tracking-wider">{h}</TableHead>
                    ))}
                    {canManage(user.role) && <TableHead />}
                  </TableRow>
                  {/* Filter-Zeile */}
                  <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
                    <TableHead className="py-1.5">
                      <Input placeholder="Filter..." className="h-7 text-xs px-2" value={stellenTitelFilter} onChange={e => setStellenTitelFilter(e.target.value)} />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <Input placeholder="Filter..." className="h-7 text-xs px-2" value={stellenAbteilungFilter} onChange={e => setStellenAbteilungFilter(e.target.value)} />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <Input placeholder="Filter..." className="h-7 text-xs px-2" value={stellenStandortFilter} onChange={e => setStellenStandortFilter(e.target.value)} />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <Input placeholder="Filter..." className="h-7 text-xs px-2" value={stellenArtFilter} onChange={e => setStellenArtFilter(e.target.value)} />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <Select value={stellenStatusFilter} onValueChange={setStellenStatusFilter}>
                        <SelectTrigger className="h-7 text-xs px-2 w-full"><SelectValue placeholder="Alle" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alle">Alle</SelectItem>
                          {["Veröffentlicht", "Entwurf", "Besetzt", "Geschlossen"].map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead className="py-1.5">
                      <Input placeholder="Filter..." className="h-7 text-xs px-2" value={stellenErstelltFilter} onChange={e => setStellenErstelltFilter(e.target.value)} />
                    </TableHead>
                    <TableHead className="py-1.5" />
                    {canManage(user.role) && <TableHead className="py-1.5" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStellen.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" /> {s.titel}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.abteilung}</TableCell>
                      <TableCell className="text-sm">{s.standort}</TableCell>
                      <TableCell className="text-sm">{s.art}</TableCell>
                      <TableCell><Badge className={`${statusColor[s.status]} text-white text-[10px]`}>{s.status}</Badge></TableCell>
                      <TableCell className="text-sm">{s.erstellt}</TableCell>
                      <TableCell>
                        {s.status === "Veröffentlicht" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" aria-label="Kopieren" className="h-7 w-7" onClick={() => {
                              navigator.clipboard.writeText(getStellenShareUrl(s.id));
                              toast({ title: "Link kopiert!", description: "Der Bewerbungslink wurde in die Zwischenablage kopiert." });
                            }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="In neuem Tab öffnen" className="h-7 w-7" onClick={() => window.open(`/karriere/${s.id}`, "_blank")}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      {canManage(user.role) && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" aria-label="Bearbeiten" className="h-7 w-7" onClick={() => setEditStelleId(s.id)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="Löschen" className="h-7 w-7" onClick={() => {
                              deleteStelle(s.id);
                              refresh();
                              toast({ title: "Stelle gelöscht" });
                            }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filteredStellen.length === 0 && (
                    <TableRow><TableCell colSpan={canManage(user.role) ? 8 : 7} className="text-center py-8 text-muted-foreground">Keine Stellen gefunden.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            {/* Edit dialog */}
            {editStelleId && (
              <StelleDialog
                open={!!editStelleId}
                onOpenChange={(open) => { if (!open) setEditStelleId(null); }}
                stelle={stellenList.find(s => s.id === editStelleId)}
                onRefresh={() => { refresh(); setEditStelleId(null); }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-Components ───

function DokumentUpload({ bewerberId, onSave }: { bewerberId: string; onSave: () => void }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximal 5 MB pro Datei.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      addDokument(bewerberId, { name: file.name, typ: file.type || "Datei", url: dataUrl });
      setUploading(false);
      onSave();
      toast({ title: "Dokument hochgeladen", description: file.name });
      e.target.value = "";
    };
    reader.onerror = () => {
      setUploading(false);
      toast({ title: "Fehler beim Hochladen", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };
  return (
    <label className="inline-flex">
      <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
      <Button asChild size="sm" disabled={uploading}>
        <span className="cursor-pointer"><Plus className="h-3.5 w-3.5 mr-1" />{uploading ? "Lade hoch..." : "Dokument hochladen"}</span>
      </Button>
    </label>
  );
}

function EditableField({ value, onSave, placeholder, multiline }: { value: string; onSave: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (!editing) {
    return (
      <div className="flex items-start gap-2 mt-1 group cursor-pointer" onClick={() => { setVal(value); setEditing(true); }}>
        <p className="text-sm font-semibold flex-1 hover:text-primary">
          {value || <span className="text-muted-foreground italic">{placeholder || "Klicken zum Bearbeiten"}</span>}
        </p>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      {multiline ? (
        <Textarea value={val} onChange={e => setVal(e.target.value)} rows={3} />
      ) : (
        <Input value={val} onChange={e => setVal(e.target.value)} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { onSave(val); setEditing(false); }}><Save className="h-3.5 w-3.5 mr-1" />Speichern</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>
      </div>
    </div>
  );
}

function TypeEntryForm({ bewerberId, onSave }: { bewerberId: string; onSave: () => void }) {
  const [typ, setTyp] = useState("");
  const [typLabel, setTypLabel] = useState("");
  const [typBeschreibung, setTypBeschreibung] = useState("");
  const [typEignung, setTypEignung] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Typ-Kürzel (z.B. ENTJ)</Label><Input value={typ} onChange={e => setTyp(e.target.value.toUpperCase())} maxLength={4} /></div>
        <div><Label>Bezeichnung</Label><Input value={typLabel} onChange={e => setTypLabel(e.target.value)} placeholder="z.B. Der Kommandeur" /></div>
      </div>
      <div><Label>Beschreibung</Label><Input value={typBeschreibung} onChange={e => setTypBeschreibung(e.target.value)} placeholder="z.B. Strategischer Anführer..." /></div>
      <div>
        <Label>Eignung</Label>
        <Select value={typEignung} onValueChange={setTypEignung}>
          <SelectTrigger><SelectValue placeholder="Eignung wählen" /></SelectTrigger>
          <SelectContent>
            {["Hohe Eignung", "Mittlere Eignung", "Geringe Eignung"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" disabled={!typ} onClick={() => {
        updateBewerber(bewerberId, { typ, typLabel, typBeschreibung, typEignung });
        onSave();
        toast({ title: "Testergebnis gespeichert" });
      }}>
        <Save className="h-3.5 w-3.5 mr-1" />Speichern
      </Button>
    </div>
  );
}

function NewBewerberDialog({ open, onOpenChange, stellen, onRefresh, ablauf }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stellen: Stelle[];
  onRefresh: () => void;
  /**
   * In welchem Ablauf dieser Bewerber erfasst wird.
   *
   * Daraus kommen zwei Dinge: das Kennzeichen, mit dem er in genau der Liste
   * landet, in der er erfasst wurde, und die Einladungsmail, die er bekommt.
   * Beides steht in `bewerberArbeitsplatz.ts` und nicht hier, damit die
   * wenigen echten Unterschiede der beiden Abläufe an einer Stelle liegen.
   */
  ablauf: BewerberAblauf;
}) {
  const einladung = ablauf.einladung;
  const defaultStelleId = stellen.find(s => s.titel.toLowerCase().includes("vertriebspartner"))?.id || "";
  const [form, setForm] = useState({ vorname: "", nachname: "", email: "", telefon: "", ort: "", quelle: "", erfahrung: "", motivation: "", stelleId: defaultStelleId });
  /*
   * Wer sich ueber die Website bewirbt, bekommt die Einladung sofort. Wer von
   * Hand angelegt wird, bekam sie bisher nicht, und niemand dachte daran, sie
   * spaeter nachzuschicken.
   *
   * Das Haekchen ist vorausgewaehlt und bleibt trotzdem eines: Ein Bewerber,
   * der zum Ausprobieren angelegt wird, soll nicht ungefragt eine Mail
   * bekommen.
   *
   * Welche Mail das ist, entscheidet der Ablauf, siehe `ablauf.einladung`.
   */
  const [formularSenden, setFormularSenden] = useState(true);
  const [sendetGerade, setSendetGerade] = useState(false);

  const handleCreate = async () => {
    if (!form.vorname.trim() || !form.nachname.trim() || !form.email.trim()) {
      toast({ title: "Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    const stelle = stellen.find(s => s.id === form.stelleId);
    /*
     * Abwarten, bis der Bewerber wirklich in der Datenbank steht.
     *
     * Die Einladung unten braucht ihn dort. Vorher lief beides gleichzeitig,
     * und war die Function schneller als das Speichern, fand sie ihn nicht.
     */
    let neuer: Bewerber;
    try {
      neuer = await createBewerber({
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        email: form.email.trim(),
        telefon: form.telefon.trim(),
        ort: form.ort.trim(),
        quelle: form.quelle || "Manuell",
        erfahrung: form.erfahrung.trim(),
        motivation: form.motivation.trim(),
        stelleId: form.stelleId,
        stelleTitel: stelle?.titel || "–",
        beschaeftigungsart: stelle?.art || "",
        prozess: ablauf.prozessKennzeichen,
      });
    } catch (e) {
      // Frueher verschwand dieser Fehler in einem unbeachteten Versprechen:
      // Der Dialog schloss sich, und der Bewerber war nirgends.
      console.error("[bewerber] Anlegen fehlgeschlagen", e);
      toast({
        title: "Bewerber konnte nicht angelegt werden",
        description: "Die Daten stehen noch im Formular. Bitte noch einmal versuchen.",
        variant: "destructive",
      });
      return;
    }
    // HR wie bei den beiden anderen Eingangswegen melden. Von Hand erfasste
    // Bewerber loesten bisher als einzige gar nichts aus.
    void meldeNeuenBewerberAnHr({
      id: neuer.id,
      vorname: neuer.vorname,
      nachname: neuer.nachname,
      email: neuer.email,
      telefon: neuer.telefon,
      ort: neuer.ort,
      quelle: form.quelle || "Manuell",
      stelleTitel: stelle?.titel || "",
    });
    /*
     * Die Einladung gleich mitschicken, wenn gewuenscht.
     *
     * Erst nach dem Anlegen, weil die Function die Bewerbung braucht. Ein
     * Fehlschlag beim Versand darf das Anlegen nicht rueckgaengig machen,
     * deshalb wird er gemeldet und nicht geworfen: Der Bewerber ist dann da,
     * nur ohne Mail, und die laesst sich nachholen.
     *
     * Welche Function gerufen wird, sagt der Ablauf. Im bestehenden
     * Bewerbungsmanagement ist es der Vorabbogen, im neuen Bewerberprozess die
     * Einladung zum Kennenlernen.
     */
    if (formularSenden && neuer.email) {
      setSendetGerade(true);
      try {
        const { data, error } = await supabase.functions.invoke(einladung.funktion, {
          body: { bewerbungId: neuer.id },
        });
        if (error) throw error;
        /*
         * Die Antwort auswerten, nicht nur den Aufruf.
         *
         * Beide Functions antworten auch dann mit Erfolg, wenn nichts
         * hinausging: `ok: false`, wenn sie bewusst abbrechen, und
         * `versandt: false`, wenn der Link zwar steht, die Mail aber nicht
         * zugestellt wurde. Bis zum 14.09.2026 wurde hier nur `error`
         * geprueft, und in beiden Faellen erschien ein gruener Hinweis,
         * waehrend der Bewerber nichts bekam. Denselben Griff macht der Knopf
         * im Bewerberprofil, siehe `kennenlernenVersandMeldung`.
         */
        const meldung = versandMeldung(data as VersandAntwort | null, neuer.vorname);
        toast({
          title: meldung.gelungen ? "Bewerber erfasst" : `Bewerber erfasst, ${einladung.kurz} nicht verschickt`,
          description: meldung.gelungen
            ? `${einladung.kurz} an ${neuer.email} verschickt`
            : `${meldung.text} ${einladung.nachholen}`,
          variant: meldung.gelungen ? undefined : "destructive",
        });
      } catch (e) {
        console.error("[bewerber] Einladung konnte nicht gesendet werden", e);
        toast({
          title: `Bewerber erfasst, ${einladung.kurz} nicht verschickt`,
          description: `${versandFehlerText(e, await fehlerDetail(e))} ${einladung.nachholen}`,
          variant: "destructive",
        });
      } finally {
        setSendetGerade(false);
      }
    } else {
      toast({ title: "Bewerber erfasst" });
    }

    setForm({ vorname: "", nachname: "", email: "", telefon: "", ort: "", quelle: "", erfahrung: "", motivation: "", stelleId: defaultStelleId });
    setFormularSenden(true);
    onOpenChange(false);
    onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="brand"><Users className="h-4 w-4 mr-2" />Bewerber erfassen</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Neuen Bewerber erfassen</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Erfasse die Grunddaten des Bewerbers.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Vorname *</Label><Input value={form.vorname} onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} /></div>
            <div><Label>Nachname *</Label><Input value={form.nachname} onChange={e => setForm(f => ({ ...f, nachname: e.target.value }))} /></div>
          </div>
          <div><Label>E-Mail *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Telefon</Label><PhoneInput value={form.telefon} onChange={v => setForm(f => ({ ...f, telefon: v }))} /></div>
            <div><Label>Ort</Label><Input value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Stelle</Label>
            <Select value={form.stelleId} onValueChange={v => setForm(f => ({ ...f, stelleId: v }))}>
              <SelectTrigger><SelectValue placeholder="Stelle wählen" /></SelectTrigger>
              <SelectContent>
                {stellen.filter(s => s.status === "Veröffentlicht").map(s => <SelectItem key={s.id} value={s.id}>{s.titel}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quelle</Label>
            <Select value={form.quelle} onValueChange={v => setForm(f => ({ ...f, quelle: v }))}>
              <SelectTrigger><SelectValue placeholder="Quelle wählen" /></SelectTrigger>
              <SelectContent>
                {["LinkedIn", "Jobportal", "Empfehlung", "Website", "Social Media", "Messe", "Manuell"].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Erfahrung</Label><Input placeholder="z.B. 3 Jahre Vertrieb" value={form.erfahrung} onChange={e => setForm(f => ({ ...f, erfahrung: e.target.value }))} /></div>
          <div><Label>Motivation</Label><Textarea placeholder="Warum bewirbt sich die Person?" value={form.motivation} onChange={e => setForm(f => ({ ...f, motivation: e.target.value }))} /></div>
          {/*
            Die Einladung ist der erste Schritt im Ablauf. Wer von Hand
            angelegt wird, soll sie genauso bekommen wie jemand, der sich
            ueber die Website bewirbt. Beschriftung und Ziel kommen aus dem
            Ablauf, damit hier nicht steht, was woanders verschickt wird.
          */}
          <label className="flex items-start gap-2.5 rounded-md border bg-muted/40 p-3 cursor-pointer">
            <Checkbox
              checked={formularSenden}
              onCheckedChange={(v) => setFormularSenden(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              <span className="font-medium">{einladung.titel}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {einladung.erklaerung}
              </span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendetGerade}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={sendetGerade}>
              {sendetGerade
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Wird gesendet …</>
                : <><Users className="h-4 w-4 mr-1" />Erfassen</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StelleDialog({ open, onOpenChange, stelle, onRefresh }: { open: boolean; onOpenChange: (o: boolean) => void; stelle?: Stelle; onRefresh: () => void }) {
  const isEdit = !!stelle;
  const [form, setForm] = useState({
    titel: stelle?.titel || "",
    abteilung: stelle?.abteilung || "",
    standort: stelle?.standort || "",
    art: stelle?.art || "",
    beschreibung: stelle?.beschreibung || "",
    anforderungen: stelle?.anforderungen || "",
    benefits: stelle?.benefits || "",
    status: (stelle?.status || "Entwurf") as StellenStatus,
  });

  const handleSave = () => {
    if (!form.titel.trim()) {
      toast({ title: "Titel ist erforderlich", variant: "destructive" });
      return;
    }
    if (isEdit && stelle) {
      updateStelle(stelle.id, form);
    } else {
      createStelle(form);
    }
    onOpenChange(false);
    onRefresh();
    toast({ title: isEdit ? "Stelle aktualisiert" : "Stelle erstellt" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!isEdit && (
        <DialogTrigger asChild><Button variant="brand"><Plus className="h-4 w-4 mr-1" />Neue Stelle</Button></DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Stelle bearbeiten" : "Neue Stelle erstellen"}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Erstelle ein Stellenprofil – nur veröffentlichte Stellen sind für Bewerber sichtbar.</p>
        <div className="space-y-4">
          <div><Label>Titel *</Label><Input placeholder="z.B. Vertriebspartner (m/w/d)" value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Abteilung</Label><Input placeholder="z.B. Vertrieb" value={form.abteilung} onChange={e => setForm(f => ({ ...f, abteilung: e.target.value }))} /></div>
            <div><Label>Standort</Label><Input placeholder="z.B. München / Remote" value={form.standort} onChange={e => setForm(f => ({ ...f, standort: e.target.value }))} /></div>
          </div>
          <div><Label>Beschäftigungsart</Label><Input placeholder="z.B. Freier Handelsvertreter" value={form.art} onChange={e => setForm(f => ({ ...f, art: e.target.value }))} /></div>
          <div><Label>Beschreibung</Label><Textarea placeholder="Aufgabenbeschreibung..." value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} /></div>
          <div><Label>Anforderungen</Label><Textarea placeholder="Was bringt der Kandidat mit?" value={form.anforderungen} onChange={e => setForm(f => ({ ...f, anforderungen: e.target.value }))} /></div>
          <div><Label>Benefits</Label><Textarea placeholder="Was bieten wir?" value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as StellenStatus }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Veröffentlicht", "Entwurf", "Besetzt", "Geschlossen"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>✅ {isEdit ? "Speichern" : "Erstellen"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


