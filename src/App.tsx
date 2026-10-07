import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { LastRouteMemory } from "./components/LastRouteMemory";
import { SeitenwechselRollen } from "@/components/SeitenwechselRollen";
import { UserProvider } from "@/contexts/UserContext";
import { AppShell } from "@/components/DashboardLayout";
import { VideoraumProvider } from "@/contexts/VideoraumContext";
import { VideoraumLeiste } from "@/components/videoraum/VideoraumLeiste";
import { SchwebendeKacheln } from "@/components/videoraum/SchwebendeKacheln";
import { CookieBanner } from "@/components/cookie/CookieBanner";
import { VersionsHinweis } from "@/components/VersionsHinweis";
import { LeistenBereich } from "@/components/LeistenBereich";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FehlerAufzeichnung } from "@/components/FehlerAufzeichnung";
import { LoadingFallback } from "@/components/LoadingFallback";
import IpAllowlistGuard from "@/components/security/IpAllowlistGuard";
import { PraesentationGuard } from "@/components/PraesentationGuard";
import { KundenMfaGuard } from "@/components/kunde/KundenMfaGuard";

// Oeffentliche Seiten (eager, klein und immer noetig)
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
const InvestagonDokument = lazy(() => import("./pages/InvestagonDokument"));

type LazyModule<T extends ComponentType<any>> = { default: T };

const LAZY_IMPORT_ERROR_RE = /Failed to fetch dynamically imported module|dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading module|Loading chunk/i;
const LAZY_LOAD_TIMEOUT_MS = 12000;

function triggerCacheBustReload() {
  if (typeof window === "undefined") return;
  const reloadKey = `lazy-route-reload:${window.location.pathname}${window.location.search}`;
  const last = sessionStorage.getItem(reloadKey);
  // Only reload once per minute per path to avoid infinite loops
  if (last && Date.now() - Number(last) < 60_000) return;
  sessionStorage.setItem(reloadKey, String(Date.now()));
  const url = new URL(window.location.href);
  url.searchParams.set("__reload", String(Date.now()));
  window.location.replace(url.toString());
}

function lazyRoute<T extends ComponentType<any>>(importer: () => Promise<LazyModule<T>>) {
  return lazy(async () => {
    // Race the import against a timeout so a hanging chunk doesn't leave the user
    // stuck on the Suspense fallback (skeletons) forever.
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Loading chunk timeout")), LAZY_LOAD_TIMEOUT_MS);
    });

    try {
      return (await Promise.race([importer(), timeoutPromise])) as LazyModule<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (typeof window !== "undefined" && LAZY_IMPORT_ERROR_RE.test(message)) {
        triggerCacheBustReload();
        // Hold here so React doesn't unmount the Suspense boundary before the reload happens.
        return new Promise<LazyModule<T>>(() => {});
      }

      throw error;
    }
  });
}

/*
 * Musterkalkulation und Immorechner sind entfernt (30.09.2026). Alte
 * Lesezeichen und Links landen auf der Objektseite beziehungsweise der
 * Einheit, der Kundenbezug in der Adresse bleibt erhalten.
 */
function AlteRechnerAdresse() {
  const { id, weId } = useParams();
  const { search } = useLocation();
  const ziel = weId ? `/objekte/${id}/einheiten/${weId}` : `/objekte/${id}`;
  return <Navigate to={`${ziel}${search}`} replace />;
}

// Lazy-loaded pages
const Index = lazyRoute(() => import("./pages/Index"));
const MeineLeads = lazyRoute(() => import("./pages/MeineLeads"));
const Inbox = lazyRoute(() => import("./pages/Inbox"));
const Email = lazyRoute(() => import("./pages/Email"));
const Kalender = lazyRoute(() => import("./pages/Kalender"));
const News = lazyRoute(() => import("./pages/News"));
const Einstellungen = lazyRoute(() => import("./pages/Einstellungen"));
const BuchungskalenderAnleitung = lazyRoute(() => import("./pages/BuchungskalenderAnleitung"));
const KundeEinstellungen = lazyRoute(() => import("./pages/KundeEinstellungen"));
const Kontakte = lazyRoute(() => import("./pages/Kontakte"));
const FollowUp = lazyRoute(() => import("./pages/FollowUp"));
const Neukunden = lazyRoute(() => import("./pages/Neukunden"));
const Abwicklung = lazyRoute(() => import("./pages/Abwicklung"));
const Bestandskunden = lazyRoute(() => import("./pages/Bestandskunden"));
const Pipeline = lazyRoute(() => import("./pages/Pipeline"));
const VerlorenPage = lazyRoute(() => import("./pages/Verloren"));
const ImmobilienLexikon = lazyRoute(() => import("./pages/ImmobilienLexikon"));
const Praesentation = lazyRoute(() => import("./pages/Praesentation"));
const Beratungspraesentation = lazyRoute(() => import("./pages/Beratungspraesentation"));

const BeratungspraesentationHV = lazyRoute(() => import("./pages/BeratungspraesentationHV"));
const BeratungspraesentationWG = lazyRoute(() => import("./pages/BeratungspraesentationWG"));
const BewerberVideocallPraesentation = lazyRoute(() => import("./pages/BewerberVideocallPraesentation"));
const BewerberVideocallModeration = lazyRoute(() => import("./pages/BewerberVideocallModeration"));
const PraesentationsUebung = lazyRoute(() => import("./pages/PraesentationsUebung"));


const WissenswertDetail = lazyRoute(() => import("./pages/WissenswertDetail"));
const Unterlagen = lazyRoute(() => import("./pages/Unterlagen"));
const BestandskundenImport = lazyRoute(() => import("./pages/BestandskundenImport"));
const BestandskundenImportCsv = lazyRoute(() => import("./pages/BestandskundenImportCsv"));
const UnterlagenRechnungsvorlage = lazyRoute(() => import("./pages/unterlagen/Rechnungsvorlage"));
const UnterlagenEmailSignatur = lazyRoute(() => import("./pages/unterlagen/EmailSignatur"));
const UnterlagenWhatsappCommunity = lazyRoute(() => import("./pages/unterlagen/WhatsappCommunity"));
const UnterlagenKundentypen = lazyRoute(() => import("./pages/unterlagen/Kundentypen"));
const Chat = lazyRoute(() => import("./pages/Chat"));
const Teampartner = lazyRoute(() => import("./pages/Teampartner"));
const TeampartnerProfil = lazyRoute(() => import("./pages/TeampartnerProfil"));
const Nutzerverwaltung = lazyRoute(() => import("./pages/Nutzerverwaltung"));
const AuditLog = lazyRoute(() => import("./pages/AuditLog"));
const SessionAnomalien = lazyRoute(() => import("./pages/SessionAnomalien"));
const StorageAudit = lazyRoute(() => import("./pages/StorageAudit"));
const WebhookAudit = lazyRoute(() => import("./pages/WebhookAudit"));
const SicherheitsCockpit = lazyRoute(() => import("./pages/SicherheitsCockpit"));
const NachtpruefungSeite = lazyRoute(() => import("./pages/Nachtpruefung"));
const Ansprechpartner = lazyRoute(() => import("./pages/Ansprechpartner"));
const Zielplanung = lazyRoute(() => import("./pages/Zielplanung"));
const Bewerberprozess = lazyRoute(() => import("./pages/Bewerberprozess"));
const Marketing = lazyRoute(() => import("./pages/Marketing"));
const Shop = lazyRoute(() => import("./pages/Shop"));
const Bonitaetsrechner = lazyRoute(() => import("./pages/Bonitaetsrechner"));
const Investmentrechner = lazyRoute(() => import("./pages/Investmentrechner"));
const KalkulationInvestagon = lazyRoute(() => import("./pages/KalkulationInvestagon"));
const Kultur = lazyRoute(() => import("./pages/Kultur"));
const WeeklyCall = lazyRoute(() => import("./pages/WeeklyCall"));
const KundenDetail = lazyRoute(() => import("./pages/KundenDetail"));
// Objekte war frueher fest im Startpaket ("instant sidebar navigation").
// Das Vorladen beim Ueberfahren des Menuepunkts leistet dasselbe, ohne dass
// jeder Login die Objektseite mitlaedt.
const Objekte = lazyRoute(() => import("./pages/Objekte"));
const ObjektDetail = lazyRoute(() => import("./pages/ObjektDetail"));
// Neue Objektseite (Gebäude) und Einheiten-Seite (Wohnung). Das bisherige
// ObjektDetail bleibt als Verwaltungsansicht unter /objekte/:id/verwaltung.
const ObjektSeite = lazyRoute(() => import("./pages/ObjektSeite"));
const EinheitSeite = lazyRoute(() => import("./pages/EinheitSeite"));
const Vertriebshandbuch = lazyRoute(() => import("./pages/Vertriebshandbuch"));
const ObjektExpose = lazyRoute(() => import("./pages/ObjektExpose"));
const Kundenprofilseite = lazyRoute(() => import("./pages/Kundenprofilseite"));
const Auswertungen = lazyRoute(() => import("./pages/Auswertungen"));
const Statistiken = lazyRoute(() => import("./pages/Statistiken"));
const Abrechnungen = lazyRoute(() => import("./pages/Abrechnungen"));
const Provisionsabrechnung = lazyRoute(() => import("./pages/Provisionsabrechnung"));
const Wettbewerb = lazyRoute(() => import("./pages/Wettbewerb"));
const KundeStammdaten = lazyRoute(() => import("./pages/KundeStammdaten"));
const KundeChat = lazyRoute(() => import("./pages/KundeChat"));
const KundeInvestments = lazyRoute(() => import("./pages/KundeInvestments"));
const KundeSteuerCockpit = lazyRoute(() => import("./pages/KundeSteuerCockpit"));
const KundeKundenordner = lazyRoute(() => import("./pages/KundeKundenordner"));
const KundeEmpfehlungen = lazyRoute(() => import("./pages/KundeEmpfehlungen"));
const KundeVpBewertung = lazyRoute(() => import("./pages/KundeVpBewertung"));
const VpBewertungen = lazyRoute(() => import("./pages/VpBewertungen"));
const SupportKontaktieren = lazyRoute(() => import("./pages/SupportKontaktieren"));
const Helpdesk = lazyRoute(() => import("./pages/Helpdesk"));
const Analysetool = lazyRoute(() => import("./pages/Analysetool"));
const Steuerrechner = lazyRoute(() => import("./pages/Steuerrechner"));
/* Die kurze, englische Fassung des Steuerrechners. Nur fuer Admins, siehe
   NUR_ADMIN_ROUTEN in `sidebarPermissions.ts`. */
const ExpatsRechner = lazyRoute(() => import("./pages/ExpatsRechner"));
const LinksPublic = lazyRoute(() => import("./pages/LinksPublic"));
const Marktanalyse = lazyRoute(() => import("./pages/Marktanalyse"));
const MarktanalyseDetail = lazyRoute(() => import("./pages/MarktanalyseDetail"));
const MarktanalyseVergleich = lazyRoute(() => import("./pages/MarktanalyseVergleich"));
const AnalysePublic = lazyRoute(() => import("./pages/AnalysePublic"));
const SteuerrechnerPublic = lazyRoute(() => import("./pages/SteuerrechnerPublic"));
const Einheitenspiegel = lazyRoute(() => import("./pages/Einheitenspiegel"));
const AfaRechner = lazyRoute(() => import("./pages/AfaRechner"));
const AfaObjekt = lazyRoute(() => import("./pages/AfaObjekt"));
const Empfehlungen = lazyRoute(() => import("./pages/Empfehlungen"));
const KarrierePage = lazyRoute(() => import("./pages/KarrierePage"));
const VertriebspartnerLanding = lazyRoute(() => import("./pages/VertriebspartnerLanding"));
const PartnerWerden = lazyRoute(() => import("./pages/PartnerWerden"));
const StellenanzeigePage = lazyRoute(() => import("./pages/StellenanzeigePage"));
const BewerbenPage = lazyRoute(() => import("./pages/BewerbenPage"));
const ObjektNeu = lazyRoute(() => import("./pages/ObjektNeu"));
const InvestmentAnalyse = lazyRoute(() => import("./pages/InvestmentAnalyse"));
const ObjektAfaRechner = lazyRoute(() => import("./pages/ObjektAfaRechner"));
const WohnungDetail = lazyRoute(() => import("./pages/WohnungDetail"));
const LeadVerwaltung = lazyRoute(() => import("./pages/LeadVerwaltung"));
const Papierkorb = lazyRoute(() => import("./pages/Papierkorb"));
const AlleKontakte = lazyRoute(() => import("./pages/AlleKontakte"));
const Reservierung = lazyRoute(() => import("./pages/Reservierung"));
const HVUebersicht = lazyRoute(() => import("./pages/HVUebersicht"));
const MieterPage = lazyRoute(() => import("./pages/Mieter"));
const MieterDetail = lazyRoute(() => import("./pages/MieterDetail"));
const MietvertragErstellen = lazyRoute(() => import("./pages/MietvertragErstellen"));
const VermietungPage = lazyRoute(() => import("./pages/Vermietung"));
const VermietungObjektNeu = lazyRoute(() => import("./pages/VermietungObjektNeu"));
const DienstleisterPage = lazyRoute(() => import("./pages/Dienstleister"));
const DienstleisterDetail = lazyRoute(() => import("./pages/DienstleisterDetail"));
const HVTicketsPage = lazyRoute(() => import("./pages/HVTickets"));
const HVStatistiken = lazyRoute(() => import("./pages/HVStatistiken"));
const Fristenueberwachung = lazyRoute(() => import("./pages/Fristenueberwachung"));
const EigentuemerPage = lazyRoute(() => import("./pages/Eigentuemer"));
const VersicherungenPage = lazyRoute(() => import("./pages/Versicherungen"));
const ZaehlerstaendePage = lazyRoute(() => import("./pages/Zaehlerstaende"));
const KautionenPage = lazyRoute(() => import("./pages/Kautionen"));
const BetriebskostenabrechnungPage = lazyRoute(() => import("./pages/Betriebskostenabrechnung"));
const HVKommunikationPage = lazyRoute(() => import("./pages/HVKommunikation"));
const MieterhoehungPage = lazyRoute(() => import("./pages/Mieterhoehung"));
const UebergabeprotokollPage = lazyRoute(() => import("./pages/Uebergabeprotokoll"));
const BeraterMicroseite = lazyRoute(() => import("./pages/BeraterMicroseite"));
const ResetPassword = lazyRoute(() => import("./pages/ResetPassword"));
const PortalAktivieren = lazyRoute(() => import("./pages/PortalAktivieren"));
const Aktivieren = lazyRoute(() => import("./pages/Aktivieren"));
const SelbstauskunftPage = lazyRoute(() => import("./pages/SelbstauskunftPage"));
const SelbstauskunftPublic = lazyRoute(() => import("./pages/SelbstauskunftPublic"));
const HandbuchLanding = lazyRoute(() => import("./pages/HandbuchLanding"));
const HandbuchErgebnis = lazyRoute(() => import("./pages/HandbuchErgebnis"));
const HandbuchKonfigurator = lazyRoute(() => import("./pages/HandbuchKonfigurator"));
const HandbuchEinladung = lazyRoute(() => import("./pages/HandbuchEinladung"));
const HandbuchSelbstauskunftOffen = lazyRoute(() => import("./pages/HandbuchSelbstauskunftOffen"));
const HandbuchSelbstauskunftStart = lazyRoute(() => import("./pages/HandbuchSelbstauskunftStart"));
const HandbuchSeiteVerwaltung = lazyRoute(() => import("./pages/HandbuchSeiteVerwaltung"));
const BewerberFormularPublic = lazyRoute(() => import("./pages/BewerberFormularPublic"));
const BewerberKennenlernen = lazyRoute(() => import("./pages/BewerberKennenlernen"));
const BewerberKooperationsgespraech = lazyRoute(() => import("./pages/BewerberKooperationsgespraech"));
const BewerberKennenlerntermin = lazyRoute(() => import("./pages/BewerberKennenlerntermin"));
const BewerberSeite = lazyRoute(() => import("./pages/BewerberSeite"));
const BewerberKeinInteresse = lazyRoute(() => import("./pages/BewerberKeinInteresse"));
const SignaturSeite = lazyRoute(() => import("./pages/SignaturSeite"));
const SaMobileSign = lazyRoute(() => import("./pages/SaMobileSign"));
const KundenansichtObjekt = lazyRoute(() => import("./pages/KundenansichtObjekt"));
const KundenansichtWohnung = lazyRoute(() => import("./pages/KundenansichtWohnung"));
const ExposePublic = lazyRoute(() => import("./pages/ExposePublic"));
// Die Kundenansicht („Objektübersicht“): öffentlich über den Kundenlink, intern als Vorschau.
const KundenansichtPublic = lazyRoute(() => import("./pages/KundenansichtPublic"));
const KundenansichtVorschau = lazyRoute(() => import("./pages/KundenansichtVorschau"));
const ExposePublicV2 = lazyRoute(() => import("./pages/ExposePublicV2"));
const ObjektvorstellungPublic = lazyRoute(() => import("./pages/ObjektvorstellungPublic"));
const ObjektAkquise = lazyRoute(() => import("./pages/ObjektAkquise"));
const ObjekteNeu = lazyRoute(() => import("./pages/ObjekteNeu"));
const ObjektEinreichungen = lazyRoute(() => import("./pages/ObjektEinreichungen"));
const ObjektEinreichungDetail = lazyRoute(() => import("./pages/ObjektEinreichungDetail"));
const ImpressumPage = lazyRoute(() => import("./pages/Impressum"));
const DatenschutzPage = lazyRoute(() => import("./pages/Datenschutz"));
const UnsubscribePage = lazyRoute(() => import("./pages/Unsubscribe"));
const LeitfadenKaltakquise = lazyRoute(() => import("./pages/leitfaeden/LeitfadenKaltakquise"));
const LeitfadenWarmkontakte = lazyRoute(() => import("./pages/leitfaeden/LeitfadenWarmkontakte"));
const LeitfadenEinwandbehandlung = lazyRoute(() => import("./pages/leitfaeden/LeitfadenEinwandbehandlung"));
const AftersalesSteuerwissen = lazyRoute(() => import("./pages/aftersales/AftersalesSteuerwissen"));
const AftersalesSteuersaetze = lazyRoute(() => import("./pages/aftersales/AftersalesSteuersaetze"));
const AftersalesSteuerersparnis = lazyRoute(() => import("./pages/aftersales/AftersalesSteuerersparnis"));
const AftersalesElsterAnleitung = lazyRoute(() => import("./pages/aftersales/AftersalesElsterAnleitung"));
const AftersalesLohnsteuer = lazyRoute(() => import("./pages/aftersales/AftersalesLohnsteuer"));
const AftersalesEhegattenschaukel = lazyRoute(() => import("./pages/aftersales/AftersalesEhegattenschaukel"));
const AftersalesVerkaufKinder = lazyRoute(() => import("./pages/aftersales/AftersalesVerkaufKinder"));
const Lead24hRegel = lazyRoute(() => import("./pages/leadarbeit/Lead24hRegel"));
const LeadErstkontakt = lazyRoute(() => import("./pages/leadarbeit/LeadErstkontakt"));
const LeadWarmVsKalt = lazyRoute(() => import("./pages/leadarbeit/LeadWarmVsKalt"));
const LeadFollowUp = lazyRoute(() => import("./pages/leadarbeit/LeadFollowUp"));
const LeadFehlerDsgvo = lazyRoute(() => import("./pages/leadarbeit/LeadFehlerDsgvo"));
const ChecklisteBonitaetsunterlagen = lazyRoute(() => import("./pages/bonitaet/ChecklisteBonitaetsunterlagen"));
const MobileScan = lazyRoute(() => import("./pages/MobileScan"));
const VideoraumGast = lazyRoute(() => import("./pages/VideoraumGast"));
const BuchungPublic = lazyRoute(() => import("./pages/BuchungPublic"));
const BuchungVerwalten = lazyRoute(() => import("./pages/BuchungVerwalten"));
const PartnerTermin = lazyRoute(() => import("./pages/PartnerTermin"));
const Videoraeume = lazyRoute(() => import("./pages/Videoraeume"));
const VideoraumGastgeber = lazyRoute(() => import("./pages/VideoraumGastgeber"));
const AlteRaumAdresse = lazyRoute(() => import("./pages/AlteRaumAdresse"));
const VideocallBuchungen = lazyRoute(() => import("./pages/videocall/VideocallBuchungen"));
const VideocallEinstellungen = lazyRoute(() => import("./pages/videocall/VideocallEinstellungen"));
const TippgeberPortal = lazyRoute(() => import("./pages/TippgeberPortal"));
const VertriebsakademieNeu = lazyRoute(() => import("./pages/vertriebsakademie/VertriebsakademieNeu"));
const VertriebsakademieAdmin = lazyRoute(() => import("./pages/vertriebsakademie/VertriebsakademieAdmin"));
const VertriebsakademieEinwaende = lazyRoute(() => import("./pages/vertriebsakademie/VertriebsakademieEinwaende"));
const VertriebsakademieTraining = lazyRoute(() => import("./pages/vertriebsakademie/VertriebsakademieTraining"));
const VertriebsakademieAblaufplan = lazyRoute(() => import("./pages/vertriebsakademie/VertriebsakademieAblaufplan"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 min – avoid refetching on every mount
      gcTime: 15 * 60 * 1000,         // 15 min garbage collection
      refetchOnWindowFocus: false,     // avoid unnecessary refetches
      retry: 1,                        // single retry on failure
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <FehlerAufzeichnung />
            {/*
              Das laufende Gespraech liegt oberhalb der Routen. Nur so ueberlebt
              die Videoverbindung einen Seitenwechsel, und der Partner kann
              waehrend des Gespraechs im CRM springen.
            */}
            <VideoraumProvider>
            <Suspense fallback={<LoadingFallback />}>
              {/*
                Eine Spalte ueber die volle Fensterhoehe: oben die Leisten, der
                ganze Rest darunter.

                Vorher war das ein `<main>` ohne Klassen. Die Leisten schoben
                den Seiteninhalt dadurch nach unten aus dem Fenster heraus, denn
                darunter steht das Grundgeruest auf `h-screen`, also auf voller
                Fensterhoehe. Gemessen am 18.09.2026: 40 Pixel Ueberstand bei
                minimiertem Gespraech, 84 mit Versionsstreifen dazu, 180 mit
                aufgeklappten Videos. Der Rumpf wurde dadurch scrollbar, und
                beim Scrollen wanderte die Kopfzeile mit weg.

                Jetzt teilt sich die Fensterhoehe auf: Die Leisten nehmen sich,
                was sie brauchen, das Grundgeruest bekommt den Rest. Deshalb
                steht im `DashboardLayout` `flex-1 min-h-0` statt `h-screen`.

                Bewusst kein `overflow-hidden`: Anmeldung, Kundenportal und
                Tippgeberportal bauen ihre Seiten auf `min-h-screen` und
                scrollen im Rumpf. Das soll so bleiben.
              */}
              <main className="flex h-screen flex-col">
              <LastRouteMemory />
              {/*
                Neue Seite beginnt oben, Zurueck fuehrt an die alte Stelle.
                Muss VOR `<Routes>` stehen, die Begruendung steht in der Datei.
              */}
              <SeitenwechselRollen />
              {/*
                Was oben steht und den Inhalt nach unten schiebt. Der Kasten
                misst seine eigene Hoehe, damit die Seitenleiste mitrutschen
                kann; sie haengt fest am Fensterrand und kann sonst nichts
                davon wissen. Siehe `LeistenBereich`.
              */}
              <LeistenBereich>
                <VideoraumLeiste />
                {/*
                  Der Hinweis auf eine neuere Fassung. Er steht im Fluss, direkt
                  nach der Videoraumleiste: Deren Platzhalter liegt oben, der
                  Streifen darunter, die Routen darunter. Damit stapeln sich
                  beide sauber, statt sich zu ueberdecken. Zu sehen ist er nur,
                  wenn wirklich eine neuere Fassung bereitliegt.
                */}
                <VersionsHinweis />
              </LeistenBereich>
              {/*
                Die Kacheln im schwebenden Fenster auf dem Schreibtisch. Sie
                stehen hier neben der Leiste, oberhalb der Routen: Das Fenster
                soll einen Seitenwechsel im CRM ueberleben. Sie nehmen in der
                Seite keinen Platz ein und gehoeren deshalb nicht in den
                Leistenkasten, sonst verfaelschten sie dessen Hoehe.
              */}
              <SchwebendeKacheln />
              {/*
                Der Cookie-Banner der oeffentlichen Seiten. Er steht hier
                einmal fuer alle und entscheidet selbst anhand der Adresse, ob
                er erscheint (`istOeffentlicheSeite`). Im CRM bleibt er weg.
              */}
              <CookieBanner />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/portal-aktivieren" element={<PortalAktivieren />} />
                <Route path="/aktivieren" element={<Aktivieren />} />
                
                <Route path="/karriere" element={<KarrierePage />} />
                <Route path="/karriere/vertriebspartner-immobilien" element={<VertriebspartnerLanding />} />
                {/* Seit dem 30.09.2026 die neue Seite „Partner werden“ mit Wizard
                    (Tippgeber und Portfolio-Partner). Die fruehere Landingpage
                    bleibt unter /karriere/vertriebspartner-immobilien. */}
                <Route path="/partner-werden" element={<PartnerWerden />} />
                {/* Die Stellenanzeige, OEFFENTLICH: Bewerber sehen sie ohne Anmeldung.
                    Sie steht vor `/karriere/:stelleId`, und weil sie unter
                    `/karriere` liegt, gilt fuer die Seitenleiste dieselbe
                    Freigabe wie fuer die Karriereseite (role_permissions). */}
                <Route path="/karriere/stellenanzeige" element={<StellenanzeigePage />} />
                <Route path="/karriere/:stelleId" element={<KarrierePage />} />
                {/* Die alte oeffentliche Closing-Seite ist seit dem 23.09.2026
                    entfernt. Aeltere Links landen auf der Partnerseite, ohne
                    die Parameter von damals. */}
                <Route path="/closing" element={<Navigate to="/partner-werden" replace />} />
                <Route path="/kundenansicht/objekt/:id" element={<KundenansichtObjekt />} />
                <Route path="/kundenansicht/objekt/:id/wohnung/:weId" element={<KundenansichtWohnung />} />
                <Route path="/bewerben/:stelleId" element={<BewerbenPage />} />
                <Route path="/analyse" element={<AnalysePublic />} />
                <Route path="/analyse/:slug" element={<AnalysePublic />} />
                {/* Der oeffentliche Steuerrechner, derselbe Aufbau wie /analyse:
                    /steuer/:slug ist der persoenliche Link eines Partners,
                    /steuer ohne Kuerzel bleibt fuer den Base64-Rueckfall. */}
                <Route path="/steuer" element={<SteuerrechnerPublic />} />
                <Route path="/steuer/:slug" element={<SteuerrechnerPublic />} />
                {/* Der EXPATS Calculator, die englische Anzeigenstrecke. Sie
                    steht hier im oeffentlichen Block und nicht hinter dem
                    Anmeldeschutz: Wer aus einer bezahlten Anzeige kommt, hat
                    kein Konto. Derselbe Weg wie bei /steuer.
                    Die alte Adresse /steuerrechner-kompakt leitet dauerhaft
                    hierher, damit vorhandene Verweise nicht ins Leere laufen.
                    Wer den Eintrag in der Seitenleiste sieht, entscheidet
                    weiterhin `adminOnly` in `AppSidebar.tsx`. Sichtbarkeit in
                    der Navigation und Erreichbarkeit der Adresse sind hier
                    ausdruecklich zwei verschiedene Dinge. */}
                <Route path="/expats-calculator" element={<ExpatsRechner />} />
                {/* Die Linkseite fuer die sozialen Netze, OEFFENTLICH.
                    Instagram laesst in der Bildunterschrift keinen Link zu; der
                    Profillink zeigt hierher, und diese Seite reicht die
                    Kampagnenkennung an jedes Ziel weiter. Sie steht hier oben
                    im Block vor dem Anmeldeschutz, wie "/steuer" und
                    "/analyse", und bewusst NICHT in `NUR_ADMIN_ROUTEN`.
                    Einzelheiten im Kopfkommentar von `LinksPublic.tsx`. */}
                <Route path="/links" element={<LinksPublic />} />
                <Route
                  path="/steuerrechner-kompakt"
                  element={<Navigate to="/expats-calculator" replace />}
                />
                {/* /analysetool ist die INTERNE Seite zum Teilen-Link und stand
                    versehentlich hier im öffentlichen Block. Geteilt wird immer
                    /analyse bzw. /analyse/:slug, die bleiben öffentlich. */}
                {/* Außerhalb des App-Rahmens. Ein Kunde mit Faktor braucht die
                    Sitzung mit Code, sonst bliebe die Seite leer. Zur
                    Einrichtung zwingt hier keiner, Interne und Gäste ohne
                    Konto kommen durch. */}
                <Route path="/selbstauskunft" element={<KundenMfaGuard nurCode><SelbstauskunftPage /></KundenMfaGuard>} />
                <Route path="/sa/:token" element={<SelbstauskunftPublic />} />
                {/* Die Handbuch-Seite, OEFFENTLICH (26.09.2026): Landingpage
                    mit Konfigurator, das Ergebnis mit dem persoenlichen
                    Handbuch und die Selbstauskunft aus dem Handbuch. /handbuch
                    ist die Seite des Hauses, /handbuch/:slug die eines
                    Partners. Die Reihenfolge zaehlt: "ergebnis" und
                    "selbstauskunft" stehen vor dem Kuerzel, sonst liest der
                    Router sie als Partnerkuerzel. Die Verwaltung im CRM heisst
                    /handbuch-seite und steht weiter unten hinter dem
                    Anmeldeschutz. */}
                <Route path="/handbuch" element={<HandbuchLanding />} />
                {/* Seit dem 26.09.2026: der Konfigurator als eigene Seite und
                    die offene Selbstauskunft ohne Token, je mit und ohne
                    Kuerzel. Die festen Namen stehen vor ":slug"; zusaetzlich
                    kann kein Partner so heissen (`_shared/vp-slug.ts`). */}
                <Route path="/handbuch/konfigurator" element={<HandbuchKonfigurator />} />
                <Route path="/handbuch-einladung/:token" element={<HandbuchEinladung />} />
                <Route path="/handbuch/selbstauskunft" element={<HandbuchSelbstauskunftOffen />} />
                <Route path="/handbuch/ergebnis/:token" element={<HandbuchErgebnis />} />
                <Route path="/handbuch/ergebnis/:token/selbstauskunft" element={<HandbuchSelbstauskunftStart />} />
                <Route path="/handbuch/selbstauskunft/:token" element={<SelbstauskunftPublic weg="handbuch" />} />
                <Route path="/handbuch/:slug" element={<HandbuchLanding />} />
                <Route path="/handbuch/:slug/konfigurator" element={<HandbuchKonfigurator />} />
                <Route path="/handbuch/:slug/selbstauskunft" element={<HandbuchSelbstauskunftOffen />} />
                <Route path="/bewerberfragen/:token" element={<BewerberFormularPublic />} />
                {/* Das Kennenlernen des neuen Bewerberprozesses. Eigene Adresse
                    neben dem Vorabbogen: Beide lesen dieselbe Zeile in
                    `bewerber_formular`, die Mail entscheidet, welchen Bogen der
                    Bewerber sieht. */}
                <Route path="/kennenlernen/:token" element={<BewerberKennenlernen />} />
                {/* Die Terminseite des Kennenlerngespraechs, seit dem
                    21.09.2026 das Ziel des Knopfs in der Einladungsmail. Schritt
                    eins ist der eingebettete Kalender, Schritt zwei die
                    Bestaetigung der gebuchten Zeit durch den Bewerber. */}
                <Route path="/kennenlerngespraech/:token" element={<BewerberKennenlerntermin />} />
                {/* Die alte Buchungsstrecke ueber den eigenen Videoraum. Sie ist
                    eingeklammert und wird nicht mehr verlinkt, bleibt aber
                    erreichbar: Wer eine aeltere Einladung aufgehoben hat, soll
                    seinen dort gebuchten Termin weiter verschieben koennen. */}
                <Route path="/kooperationsgespraech/:token" element={<BewerberKooperationsgespraech />} />
                {/* Die persoenliche Bewerberseite. Sie entsteht mit dem Eingang
                    der Bewerbung und begleitet den ganzen Weg. Zwei Token sind
                    gueltig: ihr eigenes und das des Kennenlernens, damit auch
                    Bewerber aus der Zeit davor ihre Seite finden. */}
                <Route path="/deine-bewerbung/:token" element={<BewerberSeite />} />
                {/* Abmeldeweg aus der Nachfass-Mail. Oeffnen aendert nichts, erst der Knopf. */}
                <Route path="/bewerbung/kein-interesse/:token" element={<BewerberKeinInteresse />} />
                <Route path="/signatur" element={<SignaturSeite />} />
                <Route path="/sa-mobile-sign" element={<SaMobileSign />} />
                <Route path="/expose/:id/wohnung/:weId" element={<ExposePublic />} />
                <Route path="/expose/:id/wohnung/:weId/v2" element={<ExposePublicV2 />} />
                <Route path="/expose/:id/v2" element={<ExposePublicV2 />} />
                <Route path="/expose/:id" element={<ExposePublic />} />
                <Route path="/objektvorstellung/:token" element={<ObjektvorstellungPublic />} />
                {/* Die Kundenansicht („Objektübersicht“), Bauplan vom 23.09.2026.
                    Öffentlich: der Kundenlink, ohne Anmeldung, der Schutz
                    liegt im Schlüssel und in `get-kundenansicht`. Beide
                    Adressen zeigen dieselbe Seite, damit der Wechsel zwischen
                    Haus und Wohnung nichts neu lädt.
                    Intern: „Als Kunde ansehen“ wie die Einheitsseite. Bewusst
                    außerhalb der AppShell, also ohne Seitenleiste und
                    Kopfzeile: Die Seite wird im Termin dem Kunden gezeigt. */}
                <Route path="/immobilie/:token" element={<KundenansichtPublic />} />
                <Route path="/immobilie/:token/wohnung/:weId" element={<KundenansichtPublic />} />
                <Route path="/objekte/:id/kundenansicht" element={<PraesentationGuard><KundenansichtVorschau /></PraesentationGuard>} />
                <Route path="/objekte/:id/einheiten/:weId/kundenansicht" element={<PraesentationGuard><KundenansichtVorschau /></PraesentationGuard>} />
                {/* Das interne Exposé (Einheit und ganzes Objekt), seit dem
                    23.09.2026 immer im eigenen Tab und ohne CRM-Rahmen. In der
                    AppShell lag seine Symbolleiste über der Seitenleiste des
                    CRM. Sehen darf es, wer die Einheitsseite sieht
                    (`ObjektseiteZugang` in der Seite). */}
                <Route path="/objekte/:id/einheiten/:weId/expose" element={<PraesentationGuard><ObjektExpose /></PraesentationGuard>} />
                <Route path="/objekte/:id/expose" element={<PraesentationGuard><ObjektExpose /></PraesentationGuard>} />
                <Route path="/impressum" element={<ImpressumPage />} />
                <Route path="/datenschutz" element={<DatenschutzPage />} />
                <Route path="/objekt-akquise" element={<ObjektAkquise />} />
                <Route path="/unsubscribe" element={<UnsubscribePage />} />
                <Route path="/vp/:slug" element={<BeraterMicroseite />} />
                {/* Interne Beratungspräsentationen: nur für eingeloggte, interne
                    Rollen. Der Guard laesst nicht eingeloggte Nutzer und
                    kundenseitige Rollen (kunde/tippgeber) nicht durch. */}
                <Route path="/beratungspraesentation" element={<PraesentationGuard><Beratungspraesentation /></PraesentationGuard>} />
                <Route path="/beratungspraesentation-moreimmo" element={<PraesentationGuard><BeratungspraesentationHV /></PraesentationGuard>} />
                {/* Alte URLs bleiben gültig und leiten inklusive Kundenkontext (Query) weiter.
                    "-neu" war eine ältere Fassung der OS Immobilien-Präsentation, die Seite ist entfernt. */}
                <Route path="/beratungspraesentation-hv" element={<Navigate to={`/beratungspraesentation-moreimmo${window.location.search}`} replace />} />
                <Route path="/beratungspraesentation-neu" element={<Navigate to={`/beratungspraesentation-moreimmo${window.location.search}`} replace />} />
                <Route path="/beratungspraesentation-wg" element={<PraesentationGuard><BeratungspraesentationWG /></PraesentationGuard>} />
                {/* Die alte Closing-Praesentation ist seit dem 23.09.2026
                    entfernt. Wer die Adresse noch offen hat, landet im
                    Bewerberprozess. */}
                <Route path="/closing-praesentation" element={<Navigate to="/bewerberprozess" replace />} />
                {/* Die beiden Fenster des Bewerber-Videocalls. Die Adressen
                    tragen noch den alten Namen, weil offene Tabs und
                    Lesezeichen darauf zeigen; sie zeigen immer den Videocall
                    mit den fuenf Wegen. Ein mitgeschicktes `ablauf=neu` aus
                    der Zeit der Weiche wird schlicht nicht mehr gelesen.
                    Das alte Deck mit 22 Folien lebt nur noch in der Uebung
                    unter /praesentation-uebung. */}
                {/* Die Praesentation, die im Termin geteilt wird. Per
                    window.open ohne CRM-Rahmen. Anders als die
                    Beratungspraesentationen nur fuer die Rollen des
                    Bewerberprozesses (nurBewerberprozess). */}
                <Route path="/closing-praesentation-entwurf" element={<PraesentationGuard nurBewerberprozess><BewerberVideocallPraesentation /></PraesentationGuard>} />
                {/* Die Moderation im zweiten Fenster neben der Praesentation.
                    Gleicher Guard wie die Praesentation, also nur hr, admin,
                    inhaber und backoffice (BEWERBERPROZESS_ROLLEN). */}
                <Route path="/closing-moderation" element={<PraesentationGuard nurBewerberprozess><BewerberVideocallModeration /></PraesentationGuard>} />
                {/* Die Moderation der beiden Ablaeufe: Folien des Vorabbogens,
                    des Kennenlernbogens oder nur der Rechner, mit Folienleiste,
                    Favoriten und PDF. Aus dem Bewerberprofil geoeffnet reist
                    die Kennung mit, dann steht der Name in der Leiste; ohne
                    Kennung laeuft dieselbe Seite als blanke Uebung.
                    Gleicher Guard wie die Moderation, dazu dieselbe
                    Rechteregel (Inhaber, Admin, HR) in der Seite selbst. */}
                <Route path="/praesentation-uebung" element={<PraesentationGuard><PraesentationsUebung /></PraesentationGuard>} />
                
                
                {/* Ohne Konto wie bisher. Ist auf dem Handy ein Kunde mit Faktor
                    ohne Code angemeldet, nähme die Datenbank den Scan sonst
                    nicht an. */}
                <Route path="/mobile-scan/:token" element={<KundenMfaGuard nurCode><MobileScan /></KundenMfaGuard>} />
                {/* Der Kunde betritt den Videoraum ohne Konto, nur mit dem Link. */}
                <Route path="/raum/:token" element={<VideoraumGast />} />
                {/* Der Kunde bucht ohne Konto. Die Verwaltungsadresse steht bewusst zuerst,
                    sonst schluckt "/termin/:token" das Wort "verwalten" als Token. */}
                <Route path="/termin/verwalten/:absageToken" element={<BuchungVerwalten />} />
                <Route path="/termin/:token" element={<BuchungPublic />} />
                {/* Dieselben Buchungstoken, aber der eigene Kalender des
                    Vertriebspartners statt unserer Zeiten. Drei Schritte:
                    Anliegen, Zeit im fremden Kalender, Bestaetigung der
                    gebuchten Zeit. */}
                <Route path="/terminwahl/:token" element={<PartnerTermin />} />
                <Route element={<AppShell />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/inbox" element={<Inbox />} />
                  {/* Die Seite "Anrufe" gibt es seit dem 25.09.2026 nicht mehr. Jeder Klick
                      auf eine Kundennummer steht jetzt im Verlauf des Kundenprofils.
                      Alte Lesezeichen landen ohne Fehlerseite auf dem Dashboard. */}
                  <Route path="/anrufe" element={<Navigate to="/" replace />} />
                  <Route path="/email" element={<Email />} />
                  <Route path="/kalender" element={<Kalender />} />
                  <Route path="/news" element={<News />} />
                  <Route path="/videocall" element={<Videoraeume />} />
                  <Route path="/videocall/raum/:id" element={<VideoraumGastgeber />} />
                  <Route path="/videocall/buchungen" element={<VideocallBuchungen />} />
                  <Route path="/videocall/einstellungen" element={<VideocallEinstellungen />} />
                  {/* Alte Adressen aus der Erprobung, damit kopierte Links nicht ins Leere laufen. */}
                  <Route path="/videoraum" element={<Navigate to="/videocall" replace />} />
                  <Route path="/videoraum/:id" element={<AlteRaumAdresse />} />
                  <Route path="/einstellungen" element={<Einstellungen />} />
                  <Route path="/einstellungen/buchungskalender-anleitung" element={<BuchungskalenderAnleitung />} />
                  <Route path="/lead-verwaltung" element={<LeadVerwaltung />} />
                  <Route path="/papierkorb" element={<Papierkorb />} />
                  <Route path="/meine-leads" element={<MeineLeads />} />
                  <Route path="/alle-kontakte" element={<AlleKontakte />} />
                  <Route path="/kontakte" element={<Kontakte />} />
                  <Route path="/follow-up" element={<Navigate to="/kontakte" replace />} />
                  <Route path="/neukunden" element={<Neukunden />} />
                  <Route path="/abwicklung" element={<Abwicklung />} />
                  <Route path="/bestandskunden" element={<Bestandskunden />} />
                  <Route path="/bestandskunden-import" element={<BestandskundenImport />} />
                  <Route path="/bestandskunden-import/csv" element={<BestandskundenImportCsv />} />
                  <Route path="/verloren" element={<VerlorenPage />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/vertriebshandbuch" element={<Vertriebshandbuch />} />
                  <Route path="/immobilien-lexikon" element={<ImmobilienLexikon />} />
                  <Route path="/praesentation" element={<Praesentation />} />
                  <Route path="/wissenswert/:slug" element={<WissenswertDetail />} />
                  <Route path="/unterlagen" element={<Unterlagen />} />
                  <Route path="/unterlagen/rechnungsvorlage" element={<UnterlagenRechnungsvorlage />} />
                  <Route path="/unterlagen/email-signatur" element={<UnterlagenEmailSignatur />} />
                  <Route path="/unterlagen/whatsapp-community" element={<UnterlagenWhatsappCommunity />} />
                  <Route path="/unterlagen/kundentypen" element={<UnterlagenKundentypen />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/support-kontaktieren" element={<SupportKontaktieren />} />
                  <Route path="/helpdesk" element={<Helpdesk />} />
                  <Route path="/teampartner" element={<Teampartner />} />
                  <Route path="/teampartner/:id" element={<TeampartnerProfil />} />
                  <Route path="/nutzerverwaltung" element={<IpAllowlistGuard><Nutzerverwaltung /></IpAllowlistGuard>} />
                  <Route path="/audit-log" element={<AuditLog />} />
                  <Route path="/session-anomalien" element={<SessionAnomalien />} />
                  <Route path="/storage-audit" element={<StorageAudit />} />
                  <Route path="/webhook-audit" element={<WebhookAudit />} />
                  <Route path="/sicherheits-cockpit" element={<SicherheitsCockpit />} />
                  <Route path="/nachtpruefung" element={<NachtpruefungSeite />} />
                  <Route path="/ansprechpartner" element={<Ansprechpartner />} />
                  <Route path="/berater-microseite" element={<BeraterMicroseite />} />
                  {/* Verwaltung der Handbuch-Seite. Wer sie sieht, regelt
                      `lib/handbuch/zugang.ts`, erzwungen ueber
                      `isUrlAllowedForRole` im Routenschutz. */}
                  <Route path="/handbuch-seite" element={<HandbuchSeiteVerwaltung />} />
                  <Route path="/zielplanung" element={<Zielplanung />} />
                  {/*
                      Der Bewerberprozess hat das Bewerbungsmanagement abgeloest.
                      Sichtbar fuer die Rollen hr, admin und inhaber sowie fuer
                      die Namen in `bewerberprozessFreigabe.ts`, erzwungen im
                      Route-Guard des DashboardLayout ueber `isUrlAllowedForRole`.
                  */}
                  <Route path="/bewerberprozess" element={<Bewerberprozess />} />
                  {/*
                      Die alte Adresse leitet weiter, statt ins Leere zu laufen.
                      Sie steht in Mails, die laengst verschickt sind, in
                      Glockenmeldungen und in gespeicherten Lesezeichen. Ein
                      Fehler an dieser Stelle saehe aus wie ein geloeschter
                      Bewerber und ist keiner.
                  */}
                  <Route
                    path="/bewerbungsmanagement"
                    element={<Navigate to="/bewerberprozess" replace />}
                  />
                  <Route path="/marketing" element={<Marketing />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/bonitaetsrechner" element={<Bonitaetsrechner />} />
                  <Route path="/immorechner" element={<Navigate to="/investmentrechner" replace />} />
                  <Route path="/investmentrechner" element={<Investmentrechner />} />
                  <Route path="/musterkalkulation" element={<Navigate to="/investmentrechner" replace />} />
                  {/* Kalkulation 1, Team Pro Q und die Kalkulator-Beispiele sind entfernt
                      (30.09.2026). Alte Links landen in der Investmentkalkulation. */}
                  <Route path="/kalkulation-1" element={<Navigate to="/investmentrechner" replace />} />
                  <Route path="/kalkulation-team-pro-q" element={<Navigate to="/investmentrechner" replace />} />
                  <Route path="/kalkulation-investagon" element={<KalkulationInvestagon />} />
                  <Route path="/kultur" element={<Kultur />} />
                  <Route path="/weekly-call" element={<WeeklyCall />} />
                  <Route path="/kalkulator-bsp-1" element={<Navigate to="/investmentrechner" replace />} />
                  <Route path="/kalkulator-bsp-2" element={<Navigate to="/investmentrechner" replace />} />
                  <Route path="/kunden/:id" element={<KundenDetail />} />
                  <Route path="/kunde/profil/:id" element={<Kundenprofilseite />} />
                  <Route path="/kunde/profil" element={<Kundenprofilseite />} />
                  
                  <Route path="/kunde/stammdaten" element={<KundeStammdaten />} />
                  <Route path="/kunde/chat" element={<KundeChat />} />
                  <Route path="/kunde/investments" element={<KundeInvestments />} />
                 <Route path="/kunde/steuer-cockpit" element={<KundeSteuerCockpit />} />
                  <Route path="/kunde/kundenordner" element={<KundeKundenordner />} />
                  <Route path="/kunde/empfehlungen" element={<KundeEmpfehlungen />} />
                  <Route path="/kunde/einstellungen" element={<KundeEinstellungen />} />
                  <Route path="/kunde/vp-bewertung" element={<KundeVpBewertung />} />
                  <Route path="/vp-bewertungen" element={<VpBewertungen />} />
                  <Route path="/auswertungen" element={<Auswertungen />} />
                  <Route path="/statistiken" element={<Statistiken />} />
                  <Route path="/analysetool" element={<Analysetool />} />
                  <Route path="/steuerrechner" element={<Steuerrechner />} />
                  <Route path="/abrechnungen" element={<Abrechnungen />} />
                  <Route path="/provisionsabrechnung" element={<Provisionsabrechnung />} />
                  <Route path="/wettbewerb" element={<Wettbewerb />} />
                  <Route path="/marktanalyse" element={<Marktanalyse />} />
                  <Route path="/marktanalyse/vergleich" element={<MarktanalyseVergleich />} />
                  <Route path="/marktanalyse/:standortId" element={<MarktanalyseDetail />} />
                  <Route path="/objekte-neu" element={<ObjekteNeu />} />
                  <Route path="/investagon-dokument/*" element={<InvestagonDokument />} />
                  <Route path="/objekte" element={<Objekte />} />
                  <Route path="/objekte/neu" element={<ObjektNeu />} />
                  <Route path="/objekte/:id/bearbeiten" element={<ObjektNeu />} />
                  <Route path="/objekte/:id" element={<ObjektSeite />} />
                  <Route path="/objekte/:id/verwaltung" element={<ObjektDetail />} />
                  <Route path="/objekte/:id/einheiten/:weId" element={<EinheitSeite />} />
                  <Route path="/objekte/:id/wohnung/:weId" element={<WohnungDetail />} />
                  <Route path="/objekte/:id/investment" element={<InvestmentAnalyse />} />
                  <Route path="/objekte/:id/investment/:weId" element={<InvestmentAnalyse />} />
                  <Route path="/objekte/:id/immorechner" element={<AlteRechnerAdresse />} />
                  <Route path="/objekte/:id/immorechner/:weId" element={<AlteRechnerAdresse />} />
                  <Route path="/objekte/:id/musterkalkulation" element={<AlteRechnerAdresse />} />
                  <Route path="/objekte/:id/musterkalkulation/:weId" element={<AlteRechnerAdresse />} />
                  <Route path="/objekte/:id/afa-rechner" element={<ObjektAfaRechner />} />
                  <Route path="/objekte/:id/afa-rechner/:weId" element={<ObjektAfaRechner />} />
                  <Route path="/objekte/:id/afa" element={<AfaObjekt />} />
                  <Route path="/objekte/:id/afa/:weId" element={<AfaObjekt />} />
                  <Route path="/einheitenspiegel" element={<Einheitenspiegel />} />
                  <Route path="/follow-ups" element={<Navigate to="/inbox" replace />} />
                  {/* objekt-akquise moved to public routes */}
                  <Route path="/objekt-einreichungen" element={<ObjektEinreichungen />} />
                  <Route path="/objekt-einreichungen/:id" element={<ObjektEinreichungDetail />} />
                  <Route path="/reservierung" element={<Reservierung />} />
                  <Route path="/afa-rechner" element={<AfaRechner />} />
                  <Route path="/empfehlungen" element={<Empfehlungen />} />
                  <Route path="/hausverwaltung" element={<HVUebersicht />} />
                  <Route path="/mieter" element={<MieterPage />} />
                  <Route path="/mieter/:id" element={<MieterDetail />} />
                  <Route path="/mieter/:id/mietvertrag" element={<MietvertragErstellen />} />
                  <Route path="/vermietung" element={<VermietungPage />} />
                  <Route path="/vermietung/objekt-neu" element={<VermietungObjektNeu />} />
                  <Route path="/dienstleister" element={<DienstleisterPage />} />
                  <Route path="/dienstleister/:id" element={<DienstleisterDetail />} />
                  <Route path="/hv-tickets" element={<HVTicketsPage />} />
                  <Route path="/hv-statistiken" element={<HVStatistiken />} />
                  <Route path="/fristenueberwachung" element={<Fristenueberwachung />} />
                  <Route path="/eigentuemer" element={<EigentuemerPage />} />
                  <Route path="/versicherungen" element={<VersicherungenPage />} />
                  <Route path="/zaehlerstaende" element={<ZaehlerstaendePage />} />
                  <Route path="/kautionen" element={<KautionenPage />} />
                  <Route path="/betriebskostenabrechnung" element={<BetriebskostenabrechnungPage />} />
                  <Route path="/hv-kommunikation" element={<HVKommunikationPage />} />
                  <Route path="/mieterhoehung" element={<MieterhoehungPage />} />
                  <Route path="/uebergabeprotokoll" element={<UebergabeprotokollPage />} />
                  <Route path="/leitfaeden/kaltakquise" element={<LeitfadenKaltakquise />} />
                  <Route path="/leitfaeden/warmkontakte" element={<LeitfadenWarmkontakte />} />
                  <Route path="/leitfaeden/einwandbehandlung" element={<LeitfadenEinwandbehandlung />} />
                  <Route path="/aftersales/steuerwissen" element={<AftersalesSteuerwissen />} />
                  <Route path="/aftersales/steuersaetze" element={<AftersalesSteuersaetze />} />
                  <Route path="/aftersales/steuerersparnis" element={<AftersalesSteuerersparnis />} />
                  <Route path="/aftersales/elster-anleitung" element={<AftersalesElsterAnleitung />} />
                  <Route path="/aftersales/lohnsteueroptimierung" element={<AftersalesLohnsteuer />} />
                  <Route path="/aftersales/ehegattenschaukel" element={<AftersalesEhegattenschaukel />} />
                  <Route path="/aftersales/verkauf-an-kinder" element={<AftersalesVerkaufKinder />} />
                  <Route path="/leadarbeit/24h-regel" element={<Lead24hRegel />} />
                  <Route path="/leadarbeit/erstkontakt" element={<LeadErstkontakt />} />
                  <Route path="/leadarbeit/warm-vs-kalt" element={<LeadWarmVsKalt />} />
                  <Route path="/leadarbeit/follow-up" element={<LeadFollowUp />} />
                  <Route path="/leadarbeit/fehler-dsgvo" element={<LeadFehlerDsgvo />} />
                  <Route path="/bonitaet/checkliste" element={<ChecklisteBonitaetsunterlagen />} />
                  <Route path="/tippgeber-portal" element={<TippgeberPortal />} />
                  <Route path="/vertriebsakademie-neu" element={<VertriebsakademieNeu />} />
                  <Route path="/vertriebsakademie-neu/training" element={<VertriebsakademieTraining />} />
                  <Route path="/vertriebsakademie-neu/einwaende" element={<VertriebsakademieEinwaende />} />
                  <Route path="/vertriebsakademie-neu/ablaufplan" element={<VertriebsakademieAblaufplan />} />
                  <Route path="/vertriebsakademie-neu/admin" element={<VertriebsakademieAdmin />} />
                  <Route path="/vertriebsakademie-neu/:slug" element={<VertriebsakademieNeu />} />
                  <Route path="/vertriebsakademie" element={<VertriebsakademieNeu />} />
                  <Route path="/vertriebsakademie/admin" element={<VertriebsakademieAdmin />} />
                  <Route path="/vertriebsakademie/einwaende" element={<VertriebsakademieEinwaende />} />
                  <Route path="/vertriebsakademie/training" element={<VertriebsakademieTraining />} />
                  <Route path="/vertriebsakademie/ablaufplan" element={<VertriebsakademieAblaufplan />} />
                  <Route path="/vertriebsakademie/:slug" element={<VertriebsakademieNeu />} />
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </main>
            </Suspense>
            </VideoraumProvider>
          </BrowserRouter>
        </TooltipProvider>
      </UserProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
