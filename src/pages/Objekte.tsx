import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { confirmDialog } from "@/lib/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Building2, LayoutGrid, List, Plus, Ruler, Euro, TrendingUp, MapPin, ChevronDown, ChevronUp, Loader2, UserPlus, Pencil, Trash2, BedDouble, CalendarDays, Home, Tag, Hammer, Star } from "lucide-react";
import { getObjekteImAngebot, type ObjektData, markObjekteSeen, updateWohnung, deleteObjekt, removeReservierung, setObjektSichtbar } from "@/lib/objekteStore";
import { einheitLoeschenMitRueckfrage } from "@/lib/einheitLoeschen";
import { zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { resolveImageUrl } from "@/lib/objekteImages";
import { useUser } from "@/contexts/UserContext";
import { belegungsAnzeige, belegungsText, darfBelegteOeffnen, darfEinheitOeffnen, istEigenerKunde, nachBelegungGeordnet } from "@/lib/einheitBelegung";
import { uebersichtsBelegung } from "@/lib/objektBelegung";
import { ausInvestagon } from "@/lib/investagonHerkunft";
import { BelegungsAngaben } from "@/components/objektseite/BelegungsAngaben";
import { PortfolioKacheln } from "@/components/objekte/PortfolioKacheln";
import { InvestagonImportDialog } from "@/components/objekte/InvestagonImportDialog";
import { ObjektTexteSammellauf } from "@/components/objekte/ObjektTexteSammellauf";
import { useObjektFavorites } from "@/lib/objektFavorites";
import { objektGruppen } from "@/lib/objektFavoritenGruppen";
import { useNichtVerfuegbarOffen } from "@/components/objekte/useNichtVerfuegbarOffen";
import { useKennzahlenHandyOffen } from "@/components/objekte/useKennzahlenHandyOffen";
import { useIsMobile } from "@/hooks/use-mobile";
import { useObjekteNeu } from "@/components/objekte/useObjekteNeu";
const DeutschlandKarte = lazy(() =>
  import("@/components/objekte/DeutschlandKarte").then(m => ({ default: m.DeutschlandKarte }))
);
import { LazyImage } from "@/components/ui/lazy-image";
import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { objektExklusivSichtbar } from "@/lib/objektZugang";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const canEdit = (role: string) => ["admin", "inhaber", "objektpartner"].includes(role);
const isAdmin = (role: string) => ["admin", "inhaber"].includes(role);
const canFilterByObjStatus = (role: string) => ["admin", "inhaber", "objektpartner", "vertriebsleiter", "backoffice"].includes(role);

function isTestObjekt(obj: ObjektData): boolean {
  const a = (obj.adresse || "").toLowerCase().trim();
  const o = (obj.ort || "").toLowerCase().trim();
  if (a.includes("wormser") && a.includes("14") && o.includes("dresden")) return true;
  if (a.includes("karl-heine") && a.includes("27") && o.includes("leipzig")) return true;
  if (a.includes("olvenstedter") && a.includes("41") && o.includes("magdeburg")) return true;
  return false;
}

// Compute aggregated stats from wohnungen
function computeObjektStats(obj: ObjektData) {
  const wohnungen = obj.wohnungen;
  if (wohnungen.length === 0) {
    return { groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0 };
  }
  const groessen = wohnungen.map(w => w.groesse).filter(g => g > 0);
  const preise = wohnungen.map(w => w.vkGesamt).filter(p => p > 0);
  const renditen = wohnungen.map(w => w.rendite).filter(r => r > 0);
  return {
    groesseVon: groessen.length ? Math.min(...groessen) : 0,
    groesseBis: groessen.length ? Math.max(...groessen) : 0,
    preisVon: preise.length ? Math.min(...preise) : 0,
    preisBis: preise.length ? Math.max(...preise) : 0,
    renditeVon: renditen.length ? Math.min(...renditen) : 0,
    renditeBis: renditen.length ? Math.max(...renditen) : 0,
  };
}

/**
 * Hook that ensures objekte data is loaded, with a direct DB fallback
 * if the cache hasn't populated the deferred tables yet.
 *
 * Geladen wird die Angebotssicht: Verkaufte und in Investagon nicht
 * angebotene Einheiten fehlen in Liste, Zaehlern und Preisspannen
 * (Christians Regel vom 23.09.2026, siehe `objektImAngebot`).
 */
function useObjekte() {
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "objekt_dokumente", "wohnungs_dokumente"]);
  const [objekte, setObjekte] = useState<ObjektData[]>(() => getObjekteImAngebot());
  const [loading, setLoading] = useState(false);

  // Synchronous state sync during render to avoid flash of empty wohnungen
  const [prevVersion, setPrevVersion] = useState(liveVersion);
  if (liveVersion !== prevVersion) {
    setPrevVersion(liveVersion);
    setObjekte(getObjekteImAngebot());
  }

  /*
   * Bis zum 23.09.2026 lud die Übersicht hier für alle Objekte Lage und
   * Umgebung bei Photon und Overpass vor. Das entfällt: Der Standort wird beim
   * Import einmal gemessen und am Objekt gespeichert, die Karten lesen nur
   * noch diesen Stand (Christian: keine unnötigen Aufrufe).
   */

  useEffect(() => {
    if (isTestAccount()) return;

    const cached = getObjekteImAngebot();
    if (cached.length > 0) {
      setObjekte(cached);
    }

    let cancelled = false;
    const db = supabase as any;

    (async () => {
      const hasObjekte = cacheGet("objekte").length > 0;
      const hasWohnungen = cacheGet("wohnungen").length > 0;

      if (hasObjekte && hasWohnungen) {
        return;
      }

      setLoading(true);

      try {
        const requests: Promise<void>[] = [];

        if (!hasObjekte) {
          requests.push(
            db.from("objekte").select("*").limit(500).then(({ data }: any) => {
              if (cancelled || !data) return;
              cacheSet("objekte", data);
              setObjekte(getObjekteImAngebot());
            })
          );
        }

        if (!hasWohnungen) {
          requests.push(
            db.from("wohnungen").select("*").limit(5000).then(({ data }: any) => {
              if (cancelled || !data) return;
              cacheSet("wohnungen", data);
              setObjekte(getObjekteImAngebot());
            })
          );
        }

        await Promise.allSettled(requests);

        void Promise.allSettled([
          db.from("objekt_bilder").select("*").limit(5000),
          db.from("objekt_dokumente").select("*").limit(5000),
        ]).then((results) => {
          if (cancelled) return;
          const [bilderRes, doksRes] = results;
          if (bilderRes.status === "fulfilled" && bilderRes.value.data) {
            cacheSet("objekt_bilder", bilderRes.value.data);
          }
          if (doksRes.status === "fulfilled" && doksRes.value.data) {
            cacheSet("objekt_dokumente", doksRes.value.data);
          }
        });
      } catch (e) {
        console.error("useObjekte fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { objekte, loading };
}

export default function Objekte() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const { isFavorite, toggleFavorite } = useObjektFavorites();
  // Ob der Block "Nicht verfuegbar" zugeklappt ist, je Nutzer gespeichert.
  const nichtVerfuegbar = useNichtVerfuegbarOffen();
  // Auf dem Handy stehen die Portfolio-Kennzahlen eingeklappt (24.09.2026).
  const istHandy = useIsMobile();
  const kennzahlenHandy = useKennzahlenHandyOffen();
  // Das Kennzeichen "Neu" fuer frisch importierte Objekte, je Nutzer gemerkt.
  const neu = useObjekteNeu();
  const [filter, setFilter] = useState("");
  /*
   * Der Haken "Verkaufte Objekte" ist am 17.09.2026 entfallen. Er war
   * gezeichnet, aber nirgends gelesen: Anhaken bewirkte nichts. Ihn wirken zu
   * lassen haette die frische Entscheidung vom selben Tag umgedreht,
   * ausverkaufte Objekte sichtbar zu lassen und nur ans Ende zu sortieren
   * (siehe `objektBelegungsRang` weiter unten). Ein Haken, der sie
   * standardmaessig ausblendet, waere genau das Gegenteil.
   */
  const [viewMode, setViewMode] = useState<"grid" | "list" | "karte">("grid");
  const [pendingDelete, setPendingDelete] = useState<ObjektData | null>(null);
  // Erweiterte Filter
  const [fAdresse, setFAdresse] = useState("");
  const [fBauzustand, setFBauzustand] = useState<string>("alle");
  const [fAnlageklasse, setFAnlageklasse] = useState<string>("alle");
  const [fObjStatus, setFObjStatus] = useState<string>("alle");
  const [showMore, setShowMore] = useState(false);
  const [fKpMin, setFKpMin] = useState<string>("");
  const [fKpMax, setFKpMax] = useState<string>("");
  const [fBrMin, setFBrMin] = useState<string>("");
  const [fBrMax, setFBrMax] = useState<string>("");
  const [fGrMin, setFGrMin] = useState<string>("");
  const [fGrMax, setFGrMax] = useState<string>("");
  const [fBjMin, setFBjMin] = useState<string>("");
  const [fBjMax, setFBjMax] = useState<string>("");
  const resetFilters = () => {
    setFAdresse(""); setFBauzustand("alle"); setFAnlageklasse("alle"); setFObjStatus("alle");
    setFKpMin(""); setFKpMax(""); setFBrMin(""); setFBrMax("");
    setFGrMin(""); setFGrMax(""); setFBjMin(""); setFBjMax("");
  };
  const { objekte, loading } = useObjekte();
  const wohnungenReady = useCacheReady(["wohnungen"]);
  const [expandedObjs, setExpandedObjs] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedObjs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Mark objekte as seen when page mounts
  useEffect(() => {
    markObjekteSeen();
  }, []);

  // For Finanzierungspartner: only show Objekte where they have financing cases
  const finanziererObjektIds = useMemo(() => {
    if (user.role !== "finanzierungspartner") return null;
    const investments = cacheGet("investments") || [];
    const ids = new Set<string>();
    for (const inv of investments) {
      const meta = inv.meta || {};
      if (meta.objektId) ids.add(meta.objektId);
    }
    return ids;
  }, [user.role, objekte]);

  const filtered = objekte.filter((o) => {
    if (!o.sichtbar && !canEdit(user.role)) return false;
    // Finanzierungspartner: only show Objekte linked to their financing cases
    if (finanziererObjektIds !== null) {
      if (!finanziererObjektIds.has(o.id)) return false;
    }
    // Objektpartner: nur eigene Objekte sehen (keine von anderen Objektpartnern)
    if (user.role === "objektpartner") {
      const ownerId = o.erstellt_von || (o as any).meta?.erstelltVon;
      if (ownerId && authUser?.id && ownerId !== authUser.id) return false;
      if (!ownerId) return false;
    }
    // Exklusivpartner über die Kennung, der Name nur als Rückfall (05.10.2026).
    if (!canEdit(user.role) && !objektExklusivSichtbar(o, { rolle: user.role, benutzerId: authUser?.id, name: user.name })) return false;
    if (filter && !o.titel.toLowerCase().includes(filter.toLowerCase()) && !o.ort.toLowerCase().includes(filter.toLowerCase())) return false;
    // Erweiterte Filter
    if (fAdresse.trim()) {
      const q = fAdresse.trim().toLowerCase();
      const hay = `${o.adresse || ""} ${o.plz || ""} ${o.ort || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fBauzustand !== "alle" && (o.globalDaten?.zustand || "") !== fBauzustand) return false;
    if (fAnlageklasse !== "alle" && ((o.meta as any)?.anlageklasse || "") !== fAnlageklasse) return false;
    if (fObjStatus === "sichtbar" && !o.sichtbar) return false;
    if (fObjStatus === "entwurf" && o.sichtbar) return false;
    const stats = computeObjektStats(o);
    const kpMin = fKpMin ? parseFloat(fKpMin) : null;
    const kpMax = fKpMax ? parseFloat(fKpMax) : null;
    if (kpMin !== null && stats.preisBis < kpMin) return false;
    if (kpMax !== null && stats.preisVon > kpMax) return false;
    const brMin = fBrMin ? parseFloat(fBrMin.replace(",", ".")) : null;
    const brMax = fBrMax ? parseFloat(fBrMax.replace(",", ".")) : null;
    if (brMin !== null && stats.renditeBis < brMin) return false;
    if (brMax !== null && stats.renditeVon > brMax) return false;
    const grMin = fGrMin ? parseFloat(fGrMin) : null;
    const grMax = fGrMax ? parseFloat(fGrMax) : null;
    if (grMin !== null && stats.groesseBis < grMin) return false;
    if (grMax !== null && stats.groesseVon > grMax) return false;
    const baujahr = o.globalDaten?.baujahr || 0;
    const bjMin = fBjMin ? parseInt(fBjMin) : null;
    const bjMax = fBjMax ? parseInt(fBjMax) : null;
    if (bjMin !== null && baujahr > 0 && baujahr < bjMin) return false;
    if (bjMax !== null && baujahr > 0 && baujahr > bjMax) return false;
    return true;
  }).sort((a, b) => {
    /*
     * Zwei Stufen, in dieser Reihenfolge.
     *
     * 1. Belegung. Wo noch etwas frei ist, steht oben; ausverkaufte Objekte,
     *    also genau die grau hinterlegten mit Aufdruck, rutschen ans Ende.
     *    Christians Vorgabe vom 17.09.2026.
     * 2. Anlagedatum, das neueste zuerst. Die bisherige Reihenfolge, sie
     *    bleibt innerhalb der beiden Bloecke unveraendert.
     *
     * Die Favoriten standen frueher als dritte Stufe hier oben. Das ist
     * entfallen, weil sie jetzt einen eigenen Block mit Ueberschrift
     * bekommen, siehe `gruppen` weiter unten. Beides zugleich hiesse, die
     * gleiche Regel an zwei Stellen zu pflegen.
     */
    // Ein reserviertes Globalobjekt zählt als belegt, auch wenn seine Einheiten „frei“ heißen.
    const aRang = uebersichtsBelegung(a).vollBelegt ? 1 : 0;
    const bRang = uebersichtsBelegung(b).vollBelegt ? 1 : 0;
    if (aRang !== bRang) return aRang - bRang;
    const aTime = new Date(a.erstellt_am || 0).getTime();
    const bTime = new Date(b.erstellt_am || 0).getTime();
    return bTime - aTime;
  });

  /*
   * Favoriten oben unter eigener Ueberschrift, das verfuegbare Portfolio
   * darunter, ganz unten was nicht verfuegbar ist. Gilt fuer Kachel- und
   * Listenansicht gleichermassen. Die Kartenansicht kennt keine Reihenfolge
   * und bleibt unberuehrt.
   *
   * Gruppiert wird erst nach Filter und Suche. Ausgeblendete Objekte hat der
   * Filter oben fuer alle ohne Bearbeitungsrecht schon entfernt, sie koennen
   * hier also gar nicht erst ankommen.
   *
   * Im Gesamtportfolio stehen neue Objekte vorn (`neu.neuSeit`).
   */
  const gruppen = objektGruppen(filtered, isFavorite, neu.neuSeit);

  /*
   * Was gerade als Kachel oder Zeile dasteht, gilt fuer "Neu" als gesehen,
   * egal in welchem Block. Ein zugeklappter Block und die Kartenansicht
   * zeigen keine Kacheln, dort beginnt die Sieben-Tage-Frist noch nicht.
   */
  const angezeigt = viewMode === "karte"
    ? []
    : gruppen
        .filter((gruppe) => !(gruppe.einklappbar && gruppe.titel) || nichtVerfuegbar.offen)
        .flatMap((gruppe) => gruppe.objekte);
  const { merkeGesehen } = neu;
  // Bewusst ohne Abhaengigkeitsliste: `merkeGesehen` schreibt nur, wenn ein
  // Eintrag dazukommt. Ein erneuter Lauf nach jedem Zeichnen kostet nichts
  // und kann keine Schreibschleife ausloesen.
  useEffect(() => {
    merkeGesehen(angezeigt);
  });

  const objektKarte = (obj: ObjektData) => {
    /* Rueckfall auf das erste Galeriebild, wenn kein Titelbild
       gesetzt ist. Ohne ihn zeigte die Objektseite ein Bild und die
       Kachel hier daneben ein graues Haussymbol, obwohl beide
       dieselben Bilder haben. Die Kundenansicht und die
       Einheitenkarte machen es seit jeher so, nur diese Liste
       nicht. */
    const imgSrc = resolveImageUrl(
      obj.bildUrl ||
        [...(obj.bilder || [])].sort(
          (a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0),
        )[0]?.url ||
        "",
    );
    const stats = computeObjektStats(obj);
    /*
     * Ist an diesem Objekt ueberhaupt noch etwas zu holen?
     *
     * Ausgrauen und Sperren sind zwei getrennte Fragen, und das ist
     * Absicht. Ausgegraut wird, sobald keine Einheit mehr frei ist:
     * Das ist eine Tatsache und gilt fuer jeden Betrachter gleich.
     * Gesperrt wird nur, wer hier nichts mehr zu suchen hat. Die
     * Leitung und der Berater des eigenen Vorgangs kommen weiter
     * hinein, sonst koennte Christian eine Reservierung nicht mehr
     * aufloesen, die er selbst gesetzt hat.
     */
    /*
     * Beim Globalobjekt zählt zuerst das Haus: Ist es reserviert oder
     * verkauft, trägt die Kachel den Aufdruck „Reserviert“ beziehungsweise
     * „Verkauft“, in Kachel- und Listenansicht (seit dem 23.09.2026).
     */
    const belegung = uebersichtsBelegung(obj);
    const rechteKontext = { rolle: user.role as string, benutzerId: authUser?.id, name: user.name };
    const gesperrt = belegung.vollBelegt &&
      // Auch die nicht mehr angebotenen Einheiten zaehlen: Die Leitung und
      // der Berater eines eigenen Vorgangs muessen weiter hinein.
      ![...(obj.wohnungen || []), ...(obj.wohnungenNichtImAngebot || [])]
        .some((w) => darfBelegteOeffnen(w, rechteKontext));
    const oeffne = () => { if (!gesperrt) navigate(zielRouteFuerObjekt(obj)); };
    /*
     * Kommt das Objekt aus Investagon, kommt auch der Status seiner
     * Einheiten von dort und wird beim naechsten Abgleich neu geschrieben.
     * In der Einheitentabelle steht er deshalb als festes Kennzeichen, und
     * Aktion und Bearbeiten entfallen ganz (Christian am 23.09.2026).
     */
    const investagonObjekt = ausInvestagon(obj);
    /*
     * Der Punkt oben rechts: gruen sichtbar, orange ausgeblendet. Bei
     * Investagon-Objekten schalten Admin, Inhaber und Objektpartner (aktive
     * Rolle) ihn per Klick um (Christian am 30.09.2026). Der Import fasst
     * eine Ausblendung von Hand nicht an, siehe `investagon-import/sichtbarkeit.ts`.
     * Selbst angelegte Objekte behalten ihren Entwurf und die Freigabe auf
     * der Objektseite.
     */
    const sichtbarText = obj.sichtbar ? "Sichtbar" : investagonObjekt ? "Ausgeblendet" : "Entwurf";
    const punktFarbe = obj.sichtbar ? "hsl(142 76% 42%)" : "hsl(30 95% 55%)";
    const sichtbarkeitUmschalten = async () => {
      const einblenden = !obj.sichtbar;
      const ja = await confirmDialog({
        title: einblenden ? "Objekt für Vertriebspartner sichtbar schalten?" : "Objekt für Vertriebspartner ausblenden?",
        description: einblenden
          ? `„${obj.titel}“ erscheint danach wieder in der Objektübersicht der Vertriebspartner.`
          : `„${obj.titel}“ verschwindet danach aus der Objektübersicht der Vertriebspartner. Admin, Inhaber und Objektpartner sehen es weiter, mit orangem Punkt.`,
        confirmText: einblenden ? "Sichtbar schalten" : "Ausblenden",
        cancelText: "So lassen",
      });
      if (!ja) return;
      const ergebnis = await setObjektSichtbar(obj.id, einblenden);
      if (!ergebnis.ok) {
        toast({ title: "Sichtbarkeit nicht geändert", description: ergebnis.fehlerText, variant: "destructive" });
        return;
      }
      // Die Kachel folgt von selbst: `setObjektSichtbar` laedt den Cache neu.
      toast({ title: einblenden ? "Objekt ist sichtbar" : "Objekt ist ausgeblendet" });
    };
    /*
     * Der Stern zum Merken. Kachel- und Listenansicht benutzen denselben
     * Knopf, nur mit anderer Groesse und Lage. Vorher gab es ihn nur in der
     * Kachelansicht, und wer in der Liste arbeitete, kam an die Favoriten
     * gar nicht heran.
     */
    const sternKnopf = (klasse: string) => (
      <button
        type="button"
        aria-label={isFavorite(obj.id) ? "Favorit entfernen" : "Als Favorit markieren"}
        title={isFavorite(obj.id) ? "Favorit entfernen" : "Als Favorit markieren"}
        onClick={(e) => { e.stopPropagation(); toggleFavorite(obj.id); }}
        className={`${klasse} rounded-full bg-background/85 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-background transition-colors z-10`}
      >
        <Star className={`h-4 w-4 ${isFavorite(obj.id) ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`} />
      </button>
    );
    /*
     * Das Kennzeichen "Neu" fuer ein frisch importiertes Objekt. Gerade wie
     * das blaue Kennzeichen daneben, aber orange, damit es sich vom blauen
     * abhebt. Es schrumpft nie, bei Platznot kuerzt sich das blaue.
     *
     * Orange statt Gruen seit dem 23.09.2026 (Christian): Weiss auf dem
     * Gruen erreichte im Dunkelmodus nur 2,2:1. Das Orange ist `--warning`,
     * und das wechselt mit dem Modus (design-neu.css): hell ein dunkles
     * Orange, dunkel ein helles. Deshalb gibt es keine feste Schriftfarbe,
     * die auf beiden besteht, sondern das passende `--warning-foreground`:
     * hell Weiss (5,4:1), dunkel fast Schwarz (8,9:1). Der Rueckfallwert im
     * `var()` greift nur ohne design-neu.css, wo `--warning` in beiden Modi
     * #FF8C00 ist und `--warning-foreground` fehlt; dunkle Schrift schafft
     * dort 7,9:1. Die Seitenleiste hat ihr eigenes "Neu" und bleibt gruen.
     */
    const neuSeitAm = neu.neuSeit(obj);
    const neuKennzeichen = (klasse: string) => neuSeitAm !== null && (
      <Badge
        className={`shrink-0 border-transparent bg-warning text-[hsl(var(--warning-foreground,217_38%_9%))] hover:bg-warning font-semibold uppercase tracking-wide shadow-md ${klasse}`}
        title={`Neu angelegt am ${new Date(neuSeitAm).toLocaleDateString("de-DE")}`}
      >
        Neu
      </Badge>
    );
    return (
      <Card
        key={obj.id}
        className={`overflow-hidden transition-shadow ${gesperrt ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:shadow-lg"} ${viewMode === "grid" ? "flex flex-col h-full" : ""}`}
        onClick={oeffne}
        aria-disabled={gesperrt || undefined}
        title={gesperrt ? `Nicht verfügbar (${belegung.aufdruck})` : undefined}
      >
        {viewMode === "grid" && (
          // Auf dem Handy im Fotoformat 4:3 statt quadratisch: zeigt das ganze Foto und spart eine halbe Bildschirmhöhe je Kachel.
          <div className="relative aspect-[4/3] sm:aspect-square w-full shrink-0 bg-muted flex items-center justify-center overflow-hidden">
            {imgSrc && obj.bildUrl ? (
              <LazyImage src={imgSrc} alt={obj.titel} className={`w-full h-full object-cover ${belegung.vollBelegt ? "grayscale" : ""}`} wrapperClassName="w-full h-full" priority />
            ) : (
              <Building2 className={`h-16 w-16 text-muted-foreground/30 ${belegung.vollBelegt ? "grayscale" : ""}`} />
            )}
            {/* TESTOBJEKT-Wasserzeichen */}
            {isTestObjekt(obj) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span className="-rotate-12 text-[hsl(0,90%,55%)] font-black tracking-widest text-3xl md:text-5xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] [text-shadow:_2px_2px_0_rgba(255,255,255,0.9),_-2px_-2px_0_rgba(255,255,255,0.9),_2px_-2px_0_rgba(255,255,255,0.9),_-2px_2px_0_rgba(255,255,255,0.9)]">
                  TESTOBJEKT
                </span>
              </div>
            )}
            {/*
              * Aufdruck, wenn keine Einheit mehr frei ist.
              *
              * Derselbe Stil wie das TESTOBJEKT-Wasserzeichen, nur in
              * Grau statt Rot: Rot heisst in diesem Haus "stimmt
              * nicht", und ein ausverkauftes Objekt ist kein Fehler.
              * Der Text kommt aus Investagon, steht dort also genau
              * so ("Reserviert", "Notartermin"). Bei gemischten
              * Zustaenden das neutrale "Belegt".
              */}
            {belegung.vollBelegt && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span className="-rotate-12 text-white font-black tracking-widest text-2xl md:text-4xl uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] [text-shadow:_2px_2px_0_rgba(0,0,0,0.55),_-2px_-2px_0_rgba(0,0,0,0.55),_2px_-2px_0_rgba(0,0,0,0.55),_-2px_2px_0_rgba(0,0,0,0.55)]">
                  {belegung.aufdruck}
                </span>
              </div>
            )}
            {/*
              * Kennzeichen und Sichtbarkeitspunkt stehen in einer Zeile oben
              * rechts, das Kennzeichen links vor dem Punkt.
              *
              * Das Kennzeichen war frueher schraeg gedreht (`rotate-12`) und
              * sass hinter dem Punkt. Gerade ist es besser lesbar, und in der
              * gemeinsamen Zeile koennen sich beide nicht mehr ueberlagern.
              * Die Zeile beginnt erst bei `left-12`, also rechts vom Stern,
              * und das Kennzeichen nimmt hoechstens zwei Drittel davon ein.
              * Damit laeuft auch ein langer Text wie "KfW Klimafreundlicher
              * Neubau" nicht ueber das Bild hinaus, sondern wird gekuerzt;
              * der volle Text steht im Tooltip.
              *
              * "Neu" steht ganz links in derselben Zeile.
              */}
            {(obj.badge || neuSeitAm !== null || canEdit(user.role)) && (
              <div className="absolute top-2 left-12 right-2 z-10 flex items-center justify-end gap-1.5">
                {neuKennzeichen("text-[10px] px-2")}
                {obj.badge && (
                  <Badge className="min-w-0 bg-primary text-primary-foreground text-[10px] px-2 shadow-md max-w-[66%]" title={obj.badge}>
                    <span className="truncate">{obj.badge}</span>
                  </Badge>
                )}
                {canEdit(user.role) && (investagonObjekt ? (
                  <button
                    type="button"
                    className="h-4 w-4 shrink-0 rounded-full shadow-md ring-2 ring-white/90 hover:scale-125 transition-transform focus-visible:outline-none focus-visible:ring-primary"
                    style={{ backgroundColor: punktFarbe }}
                    title={`${sichtbarText}. Klicken, um das Objekt für Vertriebspartner ${obj.sichtbar ? "auszublenden" : "sichtbar zu schalten"}.`}
                    aria-label={sichtbarText}
                    onClick={(e) => { e.stopPropagation(); void sichtbarkeitUmschalten(); }}
                  />
                ) : (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full shadow-md ring-2 ring-white/90"
                    style={{ backgroundColor: punktFarbe }}
                    title={sichtbarText}
                    aria-label={sichtbarText}
                  />
                ))}
              </div>
            )}
            {sternKnopf("absolute top-2 left-2 h-[40px] w-[40px] sm:h-8 sm:w-8")}
            {obj.exklusivPartner && obj.exklusivPartner.length > 0 && (
              <Badge variant="outline" className="absolute top-12 left-2 bg-background/80 text-[10px] border-[hsl(var(--warning))] text-[hsl(var(--warning))]">
                🔒 Exklusiv{canEdit(user.role) ? `: ${obj.exklusivPartner.join(", ")}` : ""}
              </Badge>
            )}
            {wohnungenReady && obj.wohnungen.length > 0 && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/55 backdrop-blur-sm px-2.5 py-1 text-[11px] font-medium text-white shadow-md">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-400" />{obj.wohnungen.filter(w => w.status === "frei").length} frei</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />{obj.wohnungen.filter(w => w.status === "reserviert").length} reserviert</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" />{obj.wohnungen.filter(w => w.status === "verkauft").length} verkauft</span>
              </div>
            )}
          </div>
        )}
        {/*
          Listenansicht auf dem Handy: Bild als Streifen oben, Inhalt darunter
          über die ganze Breite. Nebeneinander blieb für Kennzahlen und die
          aufgeklappte Wohnungstabelle nur ein schmaler Rest neben dem Bild,
          „5 Wohneinheiten … verkauft“ brach dort mitten im Wort ab.
        */}
        <div className={viewMode === "list" ? "flex flex-col sm:flex-row sm:gap-4" : "flex flex-col flex-1"}>
        {viewMode === "list" && (
          <div className="relative h-36 w-full sm:w-40 sm:h-40 shrink-0 bg-muted flex items-center justify-center">
            {imgSrc && obj.bildUrl ? (
              <LazyImage src={imgSrc} alt={obj.titel} className={`w-full h-full object-cover ${belegung.vollBelegt ? "grayscale" : ""}`} wrapperClassName="w-full h-full" priority />
            ) : (
              <Building2 className={`h-10 w-10 text-muted-foreground/30 ${belegung.vollBelegt ? "grayscale" : ""}`} />
            )}
            {isTestObjekt(obj) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span className="-rotate-12 text-[hsl(0,90%,55%)] font-black tracking-widest text-xs sm:text-sm [text-shadow:_1px_1px_0_rgba(255,255,255,0.9),_-1px_-1px_0_rgba(255,255,255,0.9)]">
                  TESTOBJEKT
                </span>
              </div>
            )}
            {/* Derselbe Aufdruck, kleiner: die Listenansicht zeigt nur ein Vorschaubild. */}
            {belegung.vollBelegt && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span className="-rotate-12 text-white font-black tracking-widest text-xs sm:text-sm uppercase [text-shadow:_1px_1px_0_rgba(0,0,0,0.6),_-1px_-1px_0_rgba(0,0,0,0.6)]">
                  {belegung.aufdruck}
                </span>
              </div>
            )}
            {/*
              * Wie in der Kachel eine gemeinsame Zeile rechts vom Stern:
              * "Neu" links, das blaue Kennzeichen daneben. Bei Platznot kuerzt
              * sich das blaue, der volle Text steht im Tooltip.
              */}
            {(obj.badge || neuSeitAm !== null) && (
              <div className="absolute top-1 left-12 right-1 flex items-center justify-end gap-1 sm:left-9">
                {neuKennzeichen("text-[10px] px-1.5")}
                {obj.badge && (
                  <Badge className="min-w-0 max-w-full bg-primary text-primary-foreground text-[10px] px-1.5 shadow-md" title={obj.badge}>
                    <span className="truncate">{obj.badge}</span>
                  </Badge>
                )}
              </div>
            )}
            {sternKnopf("absolute top-1 left-1 h-[40px] w-[40px] sm:h-7 sm:w-7")}
            {canEdit(user.role) && (
              <Badge variant={obj.sichtbar ? "default" : "destructive"} className={`absolute bottom-1 left-1 text-[10px] ${obj.sichtbar ? "bg-green-500 hover:bg-green-600 text-white" : ""}`}>
                {sichtbarText}
              </Badge>
            )}
            {canEdit(user.role) && (
              <Button
                variant="destructive"
                size="icon" aria-label="Löschen"
                className="absolute bottom-1 right-1 h-[40px] w-[40px] shadow-md opacity-90 hover:opacity-100 sm:h-6 sm:w-6"
                title="Objekt löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(obj);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
         <div className={viewMode === "list" ? "p-4 space-y-1 flex-1 min-w-0" : "p-4 space-y-2 flex flex-col flex-1"}>
           <h3 className={`font-bold text-sm leading-tight line-clamp-2 ${viewMode === "grid" ? "min-h-[2.5rem]" : ""}`}>{obj.titel}</h3>
           {wohnungenReady && (stats.preisVon > 0 || stats.preisBis > 0) ? (
             <p className={`font-bold text-sm leading-tight text-foreground ${viewMode === "grid" ? "min-h-[1.25rem]" : ""}`}>
              {fmt(stats.preisVon)}{stats.preisBis !== stats.preisVon ? ` – ${fmt(stats.preisBis)}` : ""}
            </p>
           ) : (viewMode === "grid" && <p className="min-h-[1.25rem]">&nbsp;</p>)}
           <p className={`text-xs text-muted-foreground line-clamp-1 ${viewMode === "grid" ? "min-h-[1rem]" : ""}`}>{obj.plz} {obj.ort}, {obj.adresse}</p>
          {isAdmin(user.role) && (
            <p className="text-[10px] text-muted-foreground/60">
              Angelegt am {new Date(obj.erstellt_am).toLocaleDateString("de-DE")}
            </p>
          )}
          {wohnungenReady ? (
            (() => {
              const zimmerArr = obj.wohnungen.map(w => w.zimmer).filter(z => z > 0);
              const zVon = zimmerArr.length ? Math.min(...zimmerArr) : 0;
              const zBis = zimmerArr.length ? Math.max(...zimmerArr) : 0;
              const mietQmArr = obj.wohnungen
                .filter(w => w.groesse > 0 && w.mieteGesamt > 0)
                .map(w => w.mieteGesamt / w.groesse);
              const mqVon = mietQmArr.length ? Math.min(...mietQmArr) : 0;
              const mqBis = mietQmArr.length ? Math.max(...mietQmArr) : 0;
              const baujahr = obj.globalDaten?.baujahr || 0;
              const bauzustand = obj.globalDaten?.zustand || "";
              const anlageklasse = (obj.meta as any)?.anlageklasse || "";
              const rangeNum = (a: number, b: number, suffix = "", digits = 0) =>
                a === b ? `${a.toFixed(digits)}${suffix}` : `${a.toFixed(digits)} – ${b.toFixed(digits)}${suffix}`;
              const rangeCur = (a: number, b: number) =>
                a === b
                  ? `${a.toFixed(2).replace(".", ",")} €`
                  : `${a.toFixed(2).replace(".", ",")} – ${b.toFixed(2).replace(".", ",")} €`;
              return (
                <div className="space-y-2 pt-2">
                  <div className={`${viewMode === "list" ? "flex flex-wrap items-center gap-x-5 gap-y-1" : "grid grid-cols-2 gap-x-3 gap-y-1.5"} text-xs text-muted-foreground`}>
                    {(zVon > 0 || zBis > 0) && (
                      <div className="flex items-center gap-1"><BedDouble className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">Zimmer</span><span>{rangeNum(zVon, zBis, " Zi.")}</span></div>
                    )}
                    {baujahr > 0 && (
                      <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">Baujahr</span><span>{baujahr}</span></div>
                    )}
                    {(stats.groesseVon > 0 || stats.groesseBis > 0) && (
                      <div className="flex items-center gap-1"><Ruler className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">Größe</span><span>{rangeNum(stats.groesseVon, stats.groesseBis, " m²")}</span></div>
                    )}
                    {(mqVon > 0 || mqBis > 0) && (
                      <div className="flex items-center gap-1"><Home className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">Kaltmiete</span><span>{rangeCur(mqVon, mqBis)}/m²</span></div>
                    )}
                    {(stats.renditeVon > 0 || stats.renditeBis > 0) && (
                      <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">Bruttorendite</span><span>{stats.renditeVon.toFixed(2)} %{stats.renditeBis !== stats.renditeVon ? ` – ${stats.renditeBis.toFixed(2)} %` : ""}</span></div>
                    )}
                    {Number(obj.afaDaten?.afaSatz) > 0 && (
                      <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /><span className="text-[10px] text-muted-foreground/70">AfA</span><span>{Number(obj.afaDaten!.afaSatz).toFixed(2).replace(".", ",")} %</span></div>
                    )}
                  </div>
                  {(bauzustand || anlageklasse || canEdit(user.role)) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {bauzustand && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Hammer className="h-3 w-3" />{bauzustand}</Badge>
                      )}
                      {anlageklasse && (
                        <Badge variant="secondary" className="text-[10px] gap-1"><Tag className="h-3 w-3" />{anlageklasse}</Badge>
                      )}
                      {canEdit(user.role) && viewMode === "grid" && (
                        <button
                          type="button"
                          title="Objekt löschen"
                          aria-label="Objekt löschen"
                          onClick={(e) => { e.stopPropagation(); setPendingDelete(obj); }}
                          className="-my-2 -mr-2 ml-auto inline-flex h-[40px] w-[40px] items-center justify-center text-red-600 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Wohneinheiten werden geladen…
            </div>
          )}
          {/* Wohnungsübersicht – Liste: aufklappbare Tabelle, Grid: nur Anzeige */}
          {viewMode === "list" && ["admin", "inhaber", "objektpartner", "vertriebspartner", "vertriebsleiter", "setterin", "backoffice", "finanzierungspartner"].includes(user.role) && wohnungenReady && obj.wohnungen.length > 0 && (
            <div className="pt-2 border-t">
              {true ? (
                <button
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                  onClick={(e) => { e.stopPropagation(); toggleExpanded(obj.id); }}
                >
                  {expandedObjs.has(obj.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {obj.wohnungen.length} Wohneinheiten
                  <span className="ml-auto flex gap-2">
                    <span className="text-green-500">{obj.wohnungen.filter(w => w.status === "frei").length} frei</span>
                    <span className="text-blue-500">{obj.wohnungen.filter(w => w.status === "reserviert").length} reserviert</span>
                    <span className="text-muted-foreground">{obj.wohnungen.filter(w => w.status === "verkauft").length} verkauft</span>
                  </span>
                </button>
              ) : null}
              {viewMode === "list" && expandedObjs.has(obj.id) && (
                // LIST-VIEW: vollständige Tabelle synchron zur Wohnungsübersicht (ObjektDetail)
                <div className="mt-3 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">WE-Nr.</TableHead>
                          <TableHead className="text-xs">Etage</TableHead>
                          <TableHead className="text-xs">Lage</TableHead>
                          <TableHead className="text-xs">Größe</TableHead>
                          <TableHead className="text-xs">Zimmer</TableHead>
                          <TableHead className="text-xs">Miete</TableHead>
                          <TableHead className="text-xs">VK</TableHead>
                          <TableHead className="text-xs">Rendite</TableHead>
                          <TableHead className="text-xs">Vermietet</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Kunde / VP</TableHead>
                          {!investagonObjekt && <TableHead className="text-xs">Aktion</TableHead>}
                          {!investagonObjekt && canEdit(user.role) && <TableHead className="text-xs text-right">Bearbeiten</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/*
                          * Freie Einheiten oben, belegte darunter,
                          * verkaufte ganz am Ende. Diese Tabelle
                          * hat keine eigene Sortierung, die
                          * bisherige Reihenfolge aus dem Speicher
                          * bleibt innerhalb der Bloecke erhalten.
                          */}
                        {nachBelegungGeordnet(
                          obj.wohnungen.filter(w => canEdit(user.role) || !w.exklusivNutzer || w.exklusivNutzer.length === 0 || (authUser?.id && w.exklusivNutzer.includes(authUser.id))),
                          rechteKontext,
                        ).map(w => {
                          /*
                           * Seit dem 23.09.2026 oeffnet sich nur eine freie
                           * Einheit, fuer jede Rolle, auch fuer die
                           * Leitung. Eine vorgemerkte ist noch frei.
                           * Belegte bleiben ausgegraut und zeigen dafuer
                           * in „Kunde / VP", wer reserviert hat und wann.
                           */
                          const oeffenbar = darfEinheitOeffnen(w);
                          const anzeige = belegungsAnzeige(w, rechteKontext);
                          return (
                          <TableRow
                            key={w.id}
                            data-testid={`wohnung-${w.id}`}
                            className={oeffenbar ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed opacity-60"}
                            aria-disabled={!oeffenbar || undefined}
                            title={oeffenbar ? undefined : `${belegungsText(w)}, nicht verfügbar`}
                            onClick={() => {
                              if (!oeffenbar) return;
                              navigate(`/objekte/${obj.id}/wohnung/${w.id}`);
                            }}
                          >
                            <TableCell className="text-xs font-medium">WHG {w.weNr}</TableCell>
                            <TableCell className="text-xs">{w.etage || "–"}</TableCell>
                            <TableCell className="text-xs">{w.lage || "–"}</TableCell>
                            <TableCell className="text-xs">{w.groesse.toFixed(2)} m²</TableCell>
                            <TableCell className="text-xs">{w.zimmer}</TableCell>
                            <TableCell className="text-xs">{fmt(w.mieteGesamt)}</TableCell>
                            <TableCell className="text-xs">{fmt(w.vkGesamt)}</TableCell>
                            <TableCell className="text-xs">{w.rendite.toFixed(2)} %</TableCell>
                            <TableCell>
                              <Badge variant={w.vermietet !== false ? "default" : "destructive"} className="text-[10px]">
                                {w.vermietet !== false ? "Vermietet" : "Leerstand"}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {investagonObjekt ? (
                                /* Festes Kennzeichen statt Auswahlfeld: Eine Aenderung hier
                                   schriebe der naechste Abgleich wieder zurueck. */
                                <Badge
                                  variant="outline"
                                  data-testid="status-kennzeichen"
                                  title="Der Status kommt automatisch aus Investagon."
                                  className={`text-[10px] ${w.status === "frei" ? "border-green-600/40 text-green-600" : w.status === "reserviert" ? "border-blue-600/40 text-blue-600" : "text-muted-foreground"}`}
                                >
                                  {belegungsText(w)}
                                </Badge>
                              ) : ["admin", "inhaber"].includes(user.role) ? (
                                <Select
                                  value={w.status}
                                  onValueChange={async (val) => {
                                    const newStatus = val as "frei" | "reserviert" | "verkauft";
                                    const ok = await confirmDialog({
                                      title: "Status von Hand ändern?",
                                      description: "Damit wird die automatische Ableitung aus Reservierung und Notartermin für diese Wohnung übergangen.",
                                      confirmText: "Status ändern",
                                      cancelText: "So lassen",
                                    });
                                    if (!ok) return;
                                    const fields: any = { status: newStatus };
                                    if (newStatus === "frei") {
                                      fields.kundeId = undefined;
                                      fields.kundeName = undefined;
                                    }
                                    const fehler = await updateWohnung(obj.id, w.id, fields);
                                    if (fehler) {
                                      toast({ title: "Status nicht geändert", description: String((fehler as { message?: unknown }).message || fehler), variant: "destructive" });
                                      return;
                                    }
                                    toast({ title: "Status aktualisiert", description: `WHG ${w.weNr}: ${newStatus}` });
                                  }}
                                >
                                  <SelectTrigger className="h-7 w-[120px] text-[11px] px-2" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="frei">Frei</SelectItem>
                                    <SelectItem value="reserviert">Reserviert</SelectItem>
                                    <SelectItem value="verkauft">Verkauft</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className={`text-xs font-medium ${w.status === "frei" ? "text-green-600" : w.status === "reserviert" ? "text-blue-600" : "text-muted-foreground"}`}>
                                  {/* "Angefragt", "Notartermin", "Notarvorbereitung": der genaue
                                      Zustand aus Investagon statt des groben "Reserviert". */}
                                  {belegungsText(w)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {/* Kunde und Partner nur fuer Admin, Inhaber,
                                  Vertriebsleiter und beim eigenen Kunden,
                                  sonst nur „reserviert am …" (`belegungsAnzeige`). */}
                              {anzeige.art === "frei" ? (
                                <span className="text-xs text-muted-foreground">–</span>
                              ) : (
                                <BelegungsAngaben anzeige={anzeige} onKundeOeffnen={(kundeId) => navigate(`/kunden/${kundeId}`)} />
                              )}
                            </TableCell>
                            {!investagonObjekt && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {/* Der Partner nur beim eigenen Kunden, fremde lehnt `einheit_reservierung_aufheben` ab. */}
                              {w.status === "reserviert" && (["admin", "inhaber"].includes(user.role) || (user.role === "vertriebspartner" && istEigenerKunde(w, rechteKontext))) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 text-destructive"
                                  onClick={async () => {
                                    const ok = await confirmDialog({
                                      title: "Reservierung wirklich aufheben?",
                                      // Den Namen nur, wenn der Nutzer ihn auch in der Zeile sieht.
                                      description: `Die Wohnung von ${anzeige.kundeName || "diesem Kunden"} wird wieder als frei geführt.`,
                                      confirmText: "Reservierung aufheben",
                                      cancelText: "Bestehen lassen",
                                      variant: "destructive",
                                    });
                                    if (!ok) return;
                                    // Über die Datenbankfunktion, nur beim eigenen Kunden (30.09.2026).
                                    const ergebnis = await removeReservierung(obj.id, w.id);
                                    if (!ergebnis.ok) {
                                      toast({ title: "Reservierung nicht aufgehoben", description: ergebnis.fehlerText, variant: "destructive" });
                                      return;
                                    }
                                    toast({ title: "Reservierung aufgehoben", description: `WHG ${w.weNr} ist wieder frei.` });
                                  }}
                                >
                                  Aufheben
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">–</span>
                              )}
                            </TableCell>
                            )}
                            {!investagonObjekt && canEdit(user.role) && (
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-1 justify-end">
                                  {["admin", "inhaber"].includes(user.role) && (
                                    <Button
                                      variant="ghost"
                                      size="icon" aria-label="Person hinzufügen"
                                      className={`h-[40px] w-[40px] sm:h-7 sm:w-7 ${w.exklusivNutzer && w.exklusivNutzer.length > 0 ? "text-primary" : ""}`}
                                      title={w.exklusivNutzer && w.exklusivNutzer.length > 0 ? `Exklusiv: ${w.exklusivNutzer.length} VP(s) – im Objekt verwalten` : "Exklusiv zuweisen (im Objekt)"}
                                      onClick={() => navigate(`/objekte/${obj.id}?editWohnung=${w.id}&action=zuweisen`)}
                                    >
                                      <UserPlus className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon" aria-label="Bearbeiten"
                                    className="h-[40px] w-[40px] sm:h-7 sm:w-7"
                                    title="Wohnung bearbeiten"
                                    onClick={() => navigate(`/objekte/${obj.id}?editWohnung=${w.id}`)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Wohnung löschen"
                                    className="h-[40px] w-[40px] text-destructive sm:h-7 sm:w-7"
                                    title="Wohnung löschen"
                                    onClick={async () => {
                                      // Prüfung, Hinweis und Rückfrage: src/lib/einheitLoeschen.ts
                                      if (!(await einheitLoeschenMitRueckfrage(obj.id, w.id, w.weNr))) return;
                                      toast({ title: "Wohnung gelöscht", description: `WHG ${w.weNr} wurde entfernt.` });
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
              )}
            </div>
          )}
        </div>
        </div>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Objekte" />
        <div className="flex items-center gap-4 flex-wrap">
          {/*
            Auf dem Handy nimmt die Suche die ganze Breite, und die Knopfleiste
            darunter bricht um. Vorher lief sie 110 px über den Rand, „Neues
            Objekt“ und die Ansichtsknöpfe waren nur seitlich gewischt zu sehen.
          */}
          <div className="flex w-full items-center gap-2 sm:w-auto" data-no-wrap>
            <span className="shrink-0 text-sm font-medium">Objektsuche</span>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Suche..." className="h-[40px] min-w-0 flex-1 sm:h-8 sm:w-44 sm:flex-none" />
          </div>
          <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
            {/* Nur Sichtbarkeit: Die Edge Function prüft Admin und Inhaber selbst noch einmal. */}
            {isAdmin(user.role) && <InvestagonImportDialog />}
            {/* „Lotse: Unterlagen auswerten“ ausgeblendet (05.10.2026): Der Zeitplan wertet über die Warteschlange aus, nachts kommen alle Objekte einmal hinein. */}
            {/*
              * Beschreibung und Standortargumente für viele Objekte auf einmal.
              * Admin und Inhaber brauchen keinen Knopf mehr (05.10.2026): Jeder
              * Investagon-Import (alle 15 Minuten) stößt objekt-texte-ki für
              * Objekte ohne Texte an. Die übrigen Rollen, die Objekte pflegen,
              * behalten den Sammellauf über die aktuelle Liste. Maßgeblich
              * bleiben Kontingent und Zeilensicherheit in der Edge Function.
              */}
            {!isAdmin(user.role) && canEdit(user.role) && <ObjektTexteSammellauf objekte={filtered} />}
            {canEdit(user.role) && (
              <Button variant="brand" size="sm" onClick={() => navigate("/objekte/neu")}>
                <Plus className="h-4 w-4 mr-1" /> Neues Objekt
              </Button>
            )}
            <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" aria-label="Kachelansicht" className="h-[40px] w-[40px] sm:h-8 sm:w-8" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" aria-label="Listenansicht" className="h-[40px] w-[40px] sm:h-8 sm:w-8" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === "karte" ? "default" : "outline"} size="icon" aria-label="Auf der Karte zeigen" className="h-[40px] w-[40px] sm:h-8 sm:w-8" onClick={() => setViewMode("karte")}><MapPin className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Erweiterte Filter-Leiste */}
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Adresse / PLZ / Ort</label>
              <Input value={fAdresse} onChange={(e) => setFAdresse(e.target.value)} placeholder="z.B. Leipzig" className="h-[40px] sm:h-9" />
            </div>
            <div className="min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bauzustand</label>
              <Select value={fBauzustand} onValueChange={setFBauzustand}>
                <SelectTrigger className="h-[40px] sm:h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="Bestand">Bestand</SelectItem>
                  <SelectItem value="Denkmal">Denkmal</SelectItem>
                  <SelectItem value="Gepflegt">Gepflegt</SelectItem>
                  <SelectItem value="Jungbau">Jungbau</SelectItem>
                  <SelectItem value="Kapitalanlage">Kapitalanlage</SelectItem>
                  <SelectItem value="Kernsanierung">Kernsanierung</SelectItem>
                  <SelectItem value="Neubau">Neubau</SelectItem>
                  <SelectItem value="renoviert">renoviert</SelectItem>
                  <SelectItem value="Sanierung">Sanierung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Anlageklasse</label>
              <Select value={fAnlageklasse} onValueChange={setFAnlageklasse}>
                <SelectTrigger className="h-[40px] sm:h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="Micro Apartment">Micro Apartment</SelectItem>
                  <SelectItem value="Eigentumswohnung">Eigentumswohnung</SelectItem>
                  <SelectItem value="Pflege">Pflege</SelectItem>
                  <SelectItem value="Betreutes Wohnen">Betreutes Wohnen</SelectItem>
                  <SelectItem value="Ferienapartment">Ferienapartment</SelectItem>
                  <SelectItem value="Einfamilienhaus">Einfamilienhaus</SelectItem>
                  <SelectItem value="Wohnungspaket">Wohnungspaket</SelectItem>
                  <SelectItem value="Mehrfamilienhaus">Mehrfamilienhaus</SelectItem>
                  <SelectItem value="Globalobjekt">Globalobjekt</SelectItem>
                  <SelectItem value="Sonstiges (Gewerbe)">Sonstiges (Gewerbe)</SelectItem>
                  <SelectItem value="Sonstiges (Wohnen)">Sonstiges (Wohnen)</SelectItem>
                  <SelectItem value="WG-Wohnung">WG-Wohnung</SelectItem>
                  <SelectItem value="Doppelhaushälfte">Doppelhaushälfte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-[40px] sm:h-9" onClick={() => setShowMore(v => !v)}>
              {showMore ? "Weniger" : "Mehr"}
            </Button>
            <Button variant="ghost" size="sm" className="h-[40px] sm:h-9" onClick={resetFilters}>Zurücksetzen</Button>
          </div>
          {showMore && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Kaufpreis (€)</label>
                <div className="flex gap-1">
                  <Input type="number" value={fKpMin} onChange={(e) => setFKpMin(e.target.value)} placeholder="von" className="h-9" />
                  <Input type="number" value={fKpMax} onChange={(e) => setFKpMax(e.target.value)} placeholder="bis" className="h-9" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bruttorendite (%)</label>
                <div className="flex gap-1">
                  <Input type="text" value={fBrMin} onChange={(e) => setFBrMin(e.target.value)} placeholder="von" className="h-9" />
                  <Input type="text" value={fBrMax} onChange={(e) => setFBrMax(e.target.value)} placeholder="bis" className="h-9" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Größe (m²)</label>
                <div className="flex gap-1">
                  <Input type="number" value={fGrMin} onChange={(e) => setFGrMin(e.target.value)} placeholder="von" className="h-9" />
                  <Input type="number" value={fGrMax} onChange={(e) => setFGrMax(e.target.value)} placeholder="bis" className="h-9" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Baujahr</label>
                <div className="flex gap-1">
                  <Input type="number" value={fBjMin} onChange={(e) => setFBjMin(e.target.value)} placeholder="von" className="h-9" />
                  <Input type="number" value={fBjMax} onChange={(e) => setFBjMax(e.target.value)} placeholder="bis" className="h-9" />
                </div>
              </div>
              {canFilterByObjStatus(user.role) && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Objektstatus</label>
                  <Select value={fObjStatus} onValueChange={setFObjStatus}>
                    <SelectTrigger className="h-[40px] sm:h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle</SelectItem>
                      <SelectItem value="sichtbar">Sichtbar</SelectItem>
                      <SelectItem value="entwurf">Entwurf</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Portfolioübersicht, nur für Admins. Zeigt die Summe über den
            gesamten Bestand, die die Objektliste selbst nicht hergibt. */}
        {/*
          Auf dem Handy standen hier Kachel um Kachel vor dem ersten Objekt.
          Dort sind sie deshalb eingeklappt, der Zustand gilt je Nutzer wie
          beim Block „Nicht verfügbar“. Am Computer unverändert.
        */}
        {isAdmin(user.role) && wohnungenReady && (
          istHandy ? (
            <div data-testid="kennzahlen-handy">
              <Button
                variant="outline"
                size="sm"
                className="h-[44px] w-full justify-between"
                aria-expanded={kennzahlenHandy.offen}
                onClick={() => kennzahlenHandy.setzeOffen(!kennzahlenHandy.offen)}
              >
                {kennzahlenHandy.offen ? "Kennzahlen ausblenden" : "Kennzahlen anzeigen"}
                {kennzahlenHandy.offen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              {kennzahlenHandy.offen && <div className="mt-3"><PortfolioKacheln objekte={filtered} /></div>}
            </div>
          ) : (
            <PortfolioKacheln objekte={filtered} />
          )
        )}

        {/* Gesamtübersicht Wohnungsstatus */}
        {wohnungenReady ? (() => {
          const allW = filtered.flatMap(o => o.wohnungen);
          const frei = allW.filter(w => w.status === "frei").length;
          const reserviert = allW.filter(w => w.status === "reserviert").length;
          const verkauft = allW.filter(w => w.status === "verkauft").length;
          return (
            <div className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg px-4 py-2">
              <span className="font-medium text-muted-foreground">{allW.length} Wohneinheiten gesamt:</span>
              <span className="text-green-600 font-semibold">{frei} frei</span>
              <span className="text-blue-600 font-semibold">{reserviert} reserviert</span>
              <span className="text-muted-foreground font-semibold">{verkauft} verkauft</span>
            </div>
          );
        })() : (
          <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-4 py-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Wohneinheiten werden geladen…
          </div>
        )}

        {viewMode === "karte" ? (
          <Suspense fallback={
            <Card className="p-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Karte wird geladen…
            </Card>
          }>
            <DeutschlandKarte objekte={filtered} mitAdressliste={user.role !== "vertriebspartner"} onSelect={(id) => navigate(zielRouteFuerObjekt(filtered.find((o) => o.id === id) ?? { id }))} />
          </Suspense>
        ) : (
          <div className="space-y-8">
            {gruppen.map((gruppe) => {
              const einklappbar = Boolean(gruppe.einklappbar && gruppe.titel);
              const offen = !einklappbar || nichtVerfuegbar.offen;
              /*
               * Der Knopf steht IN der Ueberschrift, nicht um sie herum. So
               * bleibt sie fuer die Vorlesehilfe eine Ueberschrift, und der
               * Knopf ist mit Tabulator, Eingabe- und Leertaste bedienbar.
               * `aria-expanded` und `aria-controls` setzt Radix selbst, wie
               * im Kundenprofil.
               */
              const kopf = gruppe.titel && (
                <div className="border-b pb-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {einklappbar ? (
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md uppercase tracking-wide transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {gruppe.titel}
                            <ChevronDown
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${offen ? "rotate-180" : ""}`}
                            />
                          </button>
                        </CollapsibleTrigger>
                      ) : gruppe.titel}
                    </h2>
                    <span className="text-xs text-muted-foreground/70">{gruppe.objekte.length}</span>
                  </div>
                  {gruppe.unterzeile && (
                    <p className="text-xs text-muted-foreground/70">{gruppe.unterzeile}</p>
                  )}
                </div>
              );
              const kacheln = (
                <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-4"}>
                  {gruppe.objekte.map(objektKarte)}
                </div>
              );
              if (!einklappbar) {
                return (
                  <section key={gruppe.titel ?? "alle"} className="space-y-3">
                    {kopf}
                    {kacheln}
                  </section>
                );
              }
              // Zugeklappt bleiben Ueberschrift, Zahl und Unterzeile stehen,
              // nur die Objekte verschwinden.
              return (
                <Collapsible key={gruppe.titel} asChild open={offen} onOpenChange={nichtVerfuegbar.setzeOffen}>
                  <section className="space-y-3">
                    {kopf}
                    <CollapsibleContent>{kacheln}</CollapsibleContent>
                  </section>
                </Collapsible>
              );
            })}
            {filtered.length === 0 && !loading && <div className="text-center py-20 text-muted-foreground">Keine Objekte gefunden.</div>}
            {loading && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Objekt endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Möchtest du das Objekt <span className="font-semibold text-foreground">„{pendingDelete?.titel}"</span> wirklich endgültig löschen?
                </p>
                <p>
                  Diese Aktion kann <span className="font-semibold text-destructive">nicht rückgängig</span> gemacht werden. Alle{" "}
                  <span className="font-semibold text-foreground">{pendingDelete?.wohnungen.length ?? 0}</span> zugehörigen Wohneinheiten, Bilder, Dokumente und Verknüpfungen werden mit entfernt.
                </p>
                <p className="text-xs">Ist eine Einheit reserviert, verkauft, vorgemerkt oder an ein Investment gebunden, wird nichts gelöscht.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                const titel = pendingDelete.titel;
                setPendingDelete(null);
                // Erfolg erst nach der Antwort der Datenbank. Gebundene Einheiten
                // sperren das Löschen, siehe `deleteObjekt`.
                const ergebnis = await deleteObjekt(pendingDelete.id);
                if (ergebnis.geloescht) {
                  toast({ title: "Objekt gelöscht", description: `${titel} wurde entfernt.` });
                } else {
                  toast({ title: "Objekt nicht gelöscht", description: ergebnis.grund ?? undefined, variant: "destructive" });
                }
              }}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
