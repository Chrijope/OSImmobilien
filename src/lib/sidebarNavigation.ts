/**
 * Die Menüpunkte der Seitenleiste, seit dem 28.09.2026 an einer Stelle.
 *
 * Sie standen bis dahin direkt in `AppSidebar.tsx`. Die globale Suche soll
 * aber genau die Seiten finden, die die Seitenleiste der aktiven Rolle zeigt,
 * nicht mehr und nicht weniger. Eine zweite, von Hand gepflegte Liste der
 * Seiten (vorher `SUCHE_SEITEN` in `sucheZiele.ts`) lief dabei auseinander:
 * Sie kannte Seiten, die die Leiste längst nicht mehr zeigt, und ihr fehlten
 * neue wie die Handbuch-Seite.
 *
 * Deshalb liegen hier die Einträge, die Gruppen je Rolle
 * (`navigationsGruppen`) und die Prüfung je Eintrag (`darfNavEintrag`,
 * `entwurfGesperrt`). Seitenleiste und Suche lesen beide daraus. Wer einen
 * Menüpunkt ergänzt, hat ihn damit auch in der Suche. Wonach Menschen
 * außer dem Titel suchen, steht im Feld `suchbegriffe` am Eintrag.
 */
import type { ComponentType, ReactNode } from "react";
import {
  LayoutDashboard, Inbox, Calendar, Newspaper, Users, UserPlus,
  GitBranch, Zap, Building2, BarChart3, PieChart,
  Search, Receipt, Trophy, Calculator, Megaphone, Target, CreditCard,
  GraduationCap, BookOpen, BookMarked, Presentation, FolderOpen,
  MessageCircle, Bot, UsersRound, UserCog, Contact, Globe, User, Headset,
  Gift, Key, Wrench, ClipboardList,
  Shield, Gauge, Banknote, MessageSquare, TrendingUp, Clock, ClipboardCheck,
  Trash2, ScrollText, ShieldAlert, Video, CalendarPlus, Star,
  ShoppingBag, Settings, Heart, Moon, Route, Handshake,
} from "lucide-react";
import type { UserRole } from "@/types/user";
import { HANDBUCH_SEITE_ROUTE } from "@/lib/handbuch/zugang";
import { isDraftRoute } from "@/lib/draftRoutes";
import {
  ANKAUFSTOOL_ROUTE, greiftAdminRiegel, isUrlAllowedForRole, isKundeRole, isTippgeberRole, objekteTestFreigabe, type NutzerIdentitaet,
} from "@/lib/sidebarPermissions";

/** Wonach Menschen die Einstellungen suchen. Steht hier, weil zwei Einträge sie brauchen. */
export const EINSTELLUNGEN_SUCHBEGRIFFE = ["passwort", "sicherheit", "profil", "konto", "profilbild", "einstellung"];

/*
 * Der Chat steht seit dem 25.09.2026 direkt unter der Inbox, fuer jede Rolle
 * des CRM. Vorher lag er unter Support und trug `adminOnly`, sichtbar nur fuer
 * Admin, Inhaber und hr. Ein Vertriebspartner sah ihn deshalb nicht, obwohl
 * `/chat` fuer ihn freigegeben ist und ihm Kunden dort schreiben.
 *
 * Wer welche Chats sieht, entscheidet nicht dieser Eintrag, sondern die
 * Zeilensicherheit auf `chat_gruppen`, `chat_teilnehmer` und
 * `chat_nachrichten`: Teilnehmer sehen ihre Chats, Admin und Inhaber alle.
 * Ob die Seite aufgerufen werden darf, entscheidet `isUrlAllowedForRole`.
 */
const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, suchbegriffe: ["start", "startseite", "uebersicht", "home"] },
  { title: "Inbox", url: "/inbox", icon: Inbox, suchbegriffe: ["aufgaben", "todo", "posteingang", "heute", "faellig"] },
  { title: "Chat", url: "/chat", icon: MessageCircle, suchbegriffe: ["nachricht", "schreiben", "kollegen", "intern"] },
  { title: "Kalender", url: "/kalender", icon: Calendar, draft: true, suchbegriffe: ["termine", "woche", "monat", "agenda"] },
  { title: "News & Updates", url: "/news", icon: Newspaper, suchbegriffe: ["neuigkeiten", "mitteilungen", "ankuendigung", "neu im crm"] },
];

const vertriebItems = [
  { title: "Lead-Verwaltung", url: "/lead-verwaltung", icon: Zap, suchbegriffe: ["leads", "neue leads", "zuweisen", "verteilen"] },
  { title: "Meine Leads", url: "/meine-leads", icon: ClipboardCheck, suchbegriffe: ["meine kunden", "zugewiesen", "eigene leads"] },
  { title: "Alle Kontakte", url: "/alle-kontakte", icon: Users, suchbegriffe: ["kunden", "kontakte", "lead", "interessent", "adressen", "liste", "neukunden", "bestandskunden", "abwicklung", "selbstauskunft", "kundenprofil"], tooltip: "Zentrale Anlaufstelle: alle aktiven Kontakte mit Pipeline-Chip-Filtern, Wartezeit-Anzeige und Anruf-Session (ersetzt die alten Buckets Kontakte, Neukunden, Abwicklung)." },
  { title: "Pipeline", url: "/pipeline", icon: GitBranch, suchbegriffe: ["stufen", "trichter", "funnel", "spalten", "kanban"] },
  { title: "Empfehlungen", url: "/empfehlungen", icon: Gift, suchbegriffe: ["tippgeber", "weiterempfehlung", "referral"] },
  // Verlorene, archivierte und geloeschte Kontakte liegen seit der
  // Zusammenfuehrung alle im Papierkorb, jeweils in einem eigenen Register.
  { title: "Papierkorb", url: "/papierkorb", icon: Trash2, suchbegriffe: ["geloescht", "muell", "wiederherstellen", "verloren", "archiv", "archiviert", "abgesagt", "kein interesse"] },
];

const immobilienItems = [
  /* Der Weg zu Investagon. Er steht oben, weil im Vertrieb hier gearbeitet
     wird. Der Eintrag darunter ist die eigene Objektverwaltung, sie traegt
     das Admin-Abzeichen und ist nur fuer die Pflege da. */
  { title: "Objekte", url: "/objekte-neu", icon: Building2, suchbegriffe: ["immobilien", "haus", "gebaeude", "wohnungen", "einheiten", "investagon", "expose", "lotse", "more lotse"] },
  { title: "Objekte", url: "/objekte", icon: Building2, adminOnly: true, adminBadge: true, suchbegriffe: ["objektverwaltung", "bestand", "investagon import"],
    tooltip: "Die eigene Objektverwaltung mit dem Investagon-Import. Fuer die Pflege, im Vertrieb wird der Eintrag darueber genutzt." },
  { title: "Objekt Akquise", url: "/objekt-akquise", icon: Search, adminOnly: true, suchbegriffe: ["ankauf", "einkauf", "neue objekte"] },
  { title: "Objekt Einreichungen", url: "/objekt-einreichungen", icon: ClipboardList, adminOnly: true, suchbegriffe: ["eingereicht", "vorschlaege"] },
  /* Bauträger-Kalkulator aus Ankaufstool.xlsx. Wer ihn sieht, steht in
     `ANKAUFSTOOL_ROLLEN` (sidebarPermissions.ts). */
  { title: "Ankaufstool", url: ANKAUFSTOOL_ROUTE, icon: Calculator, adminOnly: true, auchFuer: ["vertriebsleiter"], suchbegriffe: ["ankauf", "bautraeger", "kalkulator", "lohnt sich", "marge", "go no go", "aufteilung"] },
];

const auswertungItems = [
  { title: "Auswertungen", url: "/auswertungen", icon: BarChart3, suchbegriffe: ["reports", "berichte", "kennzahlen", "zahlen", "mein team"] },

  { title: "Statistiken", url: "/statistiken", icon: PieChart, suchbegriffe: ["statistik", "conversion", "quoten", "analyse"] },
  { title: "Abrechnungen", url: "/abrechnungen", icon: Receipt, suchbegriffe: ["provision", "provisionen", "geld", "auszahlung", "rechnung", "verdienst"] },
  { title: "Zielplanung", url: "/zielplanung", icon: Target, suchbegriffe: ["ziele", "planung", "soll", "jahresziel"] },
  { title: "Wettbewerb", url: "/wettbewerb", icon: Trophy, suchbegriffe: ["ranking", "wettkampf", "bestenliste", "podium"] },
];

const toolsItems = [
  /*
   * Heisst seit dem 22.09.2026 "Investmentkalkulation", so wie das Papier,
   * das am Ende herauskommt. Die Route bleibt /investmentrechner: Sie steht
   * in Berechtigungen und gespeicherten Links.
   */
  { title: "Investmentkalkulation", url: "/investmentrechner", icon: Calculator, suchbegriffe: ["investmentrechner", "kalkulator", "kalkulation", "rechner", "rechnen", "rendite", "cashflow", "musterrechnung"] },
  /*
   * Die Kalkulation Investagon ist seit dem 03.09.2026 aus der Sidebar
   * ausgeblendet, aber direkt aufrufbar. Zum Wiedereinblenden genügt es, die
   * Zeile wieder einzukommentieren. Immorechner, Musterkalkulation,
   * Kalkulation 1, Team Pro Q und die Kalkulator-Beispiele sind seit dem
   * 30.09.2026 ganz entfernt, ihre Adressen leiten auf die
   * Investmentkalkulation weiter.
   */
  // { title: "Kalkulation Investagon", url: "/kalkulation-investagon", icon: Calculator, draft: true },
  { title: "AfA-Rechner", url: "/afa-rechner", icon: Calculator, suchbegriffe: ["abschreibung", "afa", "steuer", "denkmal", "restnutzungsdauer"] },
  { title: "Analysetool", url: "/analysetool", icon: Search, suchbegriffe: ["analyse", "auswertung", "kunde pruefen"] },
  { title: "Steuerrechner", url: "/steuerrechner", icon: Calculator, suchbegriffe: ["steuer", "steuerersparnis", "rechner", "eigener link"], tooltip: "Eigener öffentlicher Rechner mit Deinem persönlichen Link. Der Interessent sieht seine Steuerlast, seine Ersparnis und sein Vermögen nach zehn Jahren, und wer sich einträgt, landet als Lead direkt bei Dir." },
  /* Die kurze, englische Fassung fuer Anzeigen an Expats. Sie steht unter dem
     grossen Rechner, weil sie ihn nicht ersetzt, sondern ergaenzt: drei Fragen
     statt acht, dafuer groebere Annahmen. Die alte Adresse
     `/steuerrechner-kompakt` leitet in `App.tsx` auf `/expats-calculator`.
     ACHTUNG, zwei verschiedene Dinge: Die Adresse selbst ist seit der Oeffnung
     OEFFENTLICH und liegt vor dem Anmeldeschutz, denn sie ist die Zielseite
     bezahlter Anzeigen. `adminOnly` hier steuert nur, wer den Eintrag in der
     Navigation sieht, und das bleiben Admin und Inhaber. */
  { title: "EXPATS Calculator", url: "/expats-calculator", icon: Calculator, adminOnly: true, adminBadge: true,
    tooltip: "Die kurze englische Strecke für Meta-Anzeigen an Expats. Öffentlich erreichbar, auch ohne Anmeldung. Drei Fragen, dann die Kontaktdaten, danach das Ergebnis. Wer absendet, wird als Lead in der Lead-Verwaltung angelegt, mit der Quelle EXPATS Calculator." },
  { title: "Vertriebspartner-Microseite", url: "/berater-microseite", icon: Globe, suchbegriffe: ["microseite", "mikroseite", "landingpage", "eigene seite", "visitenkarte"] },
  /*
   * Die Handbuch-Seite, seit dem 26.09.2026: Landingpage mit Konfigurator,
   * persönlichem Immobilienhandbuch und öffentlicher Selbstauskunft. Vorerst
   * nur Admin und Inhaber mit Badge. Freischalten für Vertriebspartner über
   * den Schalter in `app_config` (siehe `src/lib/handbuch/zugang.ts`); dann
   * fallen `adminOnly` und das Badge unten in `navigationsGruppen` weg.
   */
  {
    title: "Handbuch-Seite",
    url: HANDBUCH_SEITE_ROUTE,
    icon: BookMarked,
    adminOnly: true,
    adminBadge: true,
    // Die Vertriebsleitung hat die Gesamtsicht schon vor der Freischaltung.
    auchFuer: ["vertriebsleiter"],
    suchbegriffe: ["handbuch", "immobilienhandbuch", "konfigurator", "selbstauskunft", "landingpage"],
    tooltip: "Deine Landingpage mit Konfigurator: sechs Fragen, danach ein persönliches Immobilienhandbuch und die Selbstauskunft. Wer über deinen Link kommt, landet bei Dir.",
  },
];

/*
 * Wissen, getrennt von den Werkzeugen (Christians Wunsch vom 08.09.2026).
 *
 * Die Trennung ist nicht kosmetisch: Ein Werkzeug rechnet oder erzeugt etwas,
 * ein Wissenseintrag wird gelesen. Wer eine Zahl braucht, sucht anders als
 * jemand, der eine Antwort auf einen Einwand sucht. In einer gemeinsamen Liste
 * von zehn Einträgen liest man beides jedes Mal mit.
 *
 * Reihenfolge wie vom Geschäftsführer genannt: erst das, was im Kundentermin
 * gebraucht wird, dann das, was man nebenher lernt.
 */
const wissenItems = [
  { title: "Unterlagen", url: "/unterlagen", icon: FolderOpen, suchbegriffe: ["dokumente", "pdf", "downloads", "formulare", "vorlagen", "signatur", "rechnungsvorlage"] },
  { title: "Präsentation", url: "/praesentation", icon: Presentation, suchbegriffe: ["beratungspraesentation", "praesentation", "folien", "termin", "vorstellen"] },
  { title: "Immobilien-Lexikon", url: "/immobilien-lexikon", icon: BookOpen, suchbegriffe: ["lexikon", "begriffe", "fachbegriff", "was bedeutet"] },
  { title: "Einwand-Bibliothek", url: "/vertriebsakademie/einwaende", icon: ShieldAlert, suchbegriffe: ["einwand", "einwaende", "widerspruch", "zu teuer", "keine zeit", "kein interesse", "technik", "gegenargument", "bedenken"], tooltip: "Die häufigsten Kundeneinwände mit Übersetzung, Antwortvarianten, Fallen & Profi-Meta-Moves — auch mitten im Kundengespräch." },
  { title: "Vertriebsakademie", url: "/vertriebsakademie", icon: GraduationCap, suchbegriffe: ["schulung", "training", "lernen", "kapitel", "ausbildung", "akademie"], tooltip: "Der komplette Fahrplan durch den Vertrieb von Kapitalanlage-Immobilien — Grundlagen, Skripte, Einwandbehandlung, Empfehlungssystem, KPI-Selbstcontrolling." },
  /*
    Das Handbuch steht unter Wissen, direkt unter der Akademie. Es stand
    kurzzeitig zusaetzlich unter Vertrieb neben der Pipeline; Christian hat
    das am 11.09.2026 wieder herausgenommen, ein Menuepunkt an zwei Stellen
    verwirrt mehr, als der kurze Weg nuetzt.
  */
  { title: "Vertriebshandbuch", url: "/vertriebshandbuch", icon: BookOpen, suchbegriffe: ["handbuch", "prozess", "ablauf", "eskalation", "anleitung"], tooltip: "Der ganze Kundenabwicklungsprozess von der Anlage bis zum Abschluss, mit allen Erinnerungen, Eskalationsstufen und Meldungen. Oben eine Suche, die ganze Fragen versteht." },
  { title: "Unsere Kultur", url: "/kultur", icon: Heart, suchbegriffe: ["werte", "standards", "leitbild", "glaubenssaetze"], tooltip: "Werte, Standards, Glaubenssätze und wogegen wir antreten. Mit dem Glaubenssatz des Tages und dem PDF zum Aufhängen." },
];

/*
 * Eigener Bereich fuer Videogespraeche. Vorerst nur fuer admin und inhaber,
 * die Gruppe verschwindet fuer alle anderen von selbst, weil NavGroup nichts
 * zeichnet, wenn kein Eintrag uebrig bleibt.
 */
// Der Buchungskalender steht bewusst an erster Stelle: Er ist der Startpunkt,
// die Videoraeume unter "Meine Gespraeche" entstehen daraus automatisch.
// Sichtbar fuer admin/inhaber und einzeln freigeschaltete Nutzer, siehe
// useVideocallFreigabe. Die Gruppe wird unten nur bei Freigabe gerendert,
// deshalb tragen die Eintraege selbst kein adminOnly.
const videocallItems = [
  { title: "Buchungskalender", url: "/videocall/buchungen", icon: CalendarPlus, suchbegriffe: ["kalender", "termine", "buchungslink"], tooltip: "Deine Terminarten, deine Zeiten und dein Buchungslink. Hier stellst Du ein, wann Kunden bei Dir buchen können." },
  { title: "Meine Gespräche", url: "/videocall", icon: Video, suchbegriffe: ["videocall", "video", "videoraum"], tooltip: "Deine laufenden und geplanten Videogespräche im eigenen Videoraum. In Erprobung." },
  { title: "Einstellungen", url: "/videocall/einstellungen", icon: Settings },
];

const marketingItems = [
  { title: "Marketing", url: "/marketing", icon: Megaphone, suchbegriffe: ["werbung", "anzeigen", "social media", "kampagne"] },
  { title: "Shop", url: "/shop", icon: ShoppingBag, draft: true, suchbegriffe: ["bestellen", "kaufen", "merch"] },
];

// Der Chat stand hier bis zum 25.09.2026, er steht jetzt unter der Inbox.
const helpdeskItems = [
  { title: "Support kontaktieren", url: "/support-kontaktieren", icon: Bot, suchbegriffe: ["support", "hilfe", "problem", "fehler melden", "ticket", "frage"] },
  { title: "Helpdesk", url: "/helpdesk", icon: Headset, suchbegriffe: ["tickets", "anfragen", "support"] },
];

// (Kalender-Icon entfernt – stattdessen "Neu"-Badge via item.newBadge)

const hausverwaltungItems = [
  { title: "Mieter", url: "/mieter", icon: Key, draft: true },
  { title: "Vermietung", url: "/vermietung", icon: ClipboardList, draft: true },
  { title: "Dienstleister", url: "/dienstleister", icon: Wrench, draft: true },
  { title: "HV-Tickets", url: "/hv-tickets", icon: Wrench, draft: true },
  { title: "HV-Statistiken", url: "/hv-statistiken", icon: BarChart3, draft: true },
  { title: "Zählerstände", url: "/zaehlerstaende", icon: Gauge, draft: true },
  { title: "Kautionen", url: "/kautionen", icon: Banknote, draft: true },
  { title: "BK-Abrechnung", url: "/betriebskostenabrechnung", icon: Receipt, draft: true },
  { title: "Kommunikation", url: "/hv-kommunikation", icon: MessageSquare, draft: true },
  { title: "Mieterhöhung", url: "/mieterhoehung", icon: TrendingUp, draft: true },
  { title: "Übergabeprotokoll", url: "/uebergabeprotokoll", icon: ClipboardCheck, draft: true },
  { title: "Eigentümer", url: "/eigentuemer", icon: Shield, draft: true },
  { title: "Versicherungen", url: "/versicherungen", icon: Shield, draft: true },
  { title: "Fristenüberwachung", url: "/fristenueberwachung", icon: Clock, draft: true },
];

const teamAdminItems = [
  { title: "Teampartner", url: "/teampartner", icon: UsersRound, adminOnly: true, auchFuer: ["hr"], suchbegriffe: ["team", "kollegen", "struktur", "partner"] },
  { title: "Nutzerverwaltung", url: "/nutzerverwaltung", icon: UserCog, adminOnly: true, suchbegriffe: ["benutzer", "rollen", "rechte", "zugang", "user"] },
  { title: "Ansprechpartner", url: "/ansprechpartner", icon: Contact, suchbegriffe: ["kontaktperson", "zustaendig"] },
  // Die oeffentliche Stellenanzeige, nur fuer Admin und Inhaber (`adminOnly`).
  // Die Adresse liegt unter `/karriere` und ist damit ohne eigene Freigabe in
  // `role_permissions` abgedeckt; Bewerber erreichen sie ohnehin ohne
  // Anmeldung. Der Eintrag "VP-Immobilien Landingpage" darueber ist seit dem
  // 24.09.2026 weg (Christian). Die Seite selbst bleibt unter /partner-werden
  // und /karriere/vertriebspartner-immobilien oeffentlich erreichbar.
  { title: "Stellenanzeige", url: "/karriere/stellenanzeige", icon: Megaphone, adminOnly: true },
  // Die oeffentliche Seite „Partner werden“ (seit 30.09.2026), fuer dieselben
  // Rollen wie die Stellenanzeige. Oeffnet im neuen Tab, damit man die Seite
  // so sieht wie ein Besucher und das CRM offen bleibt.
  { title: "Partner werden", url: "/partner-werden", icon: Handshake, adminOnly: true, neuerTab: true, suchbegriffe: ["partnerprogramm", "tippgeber", "portfolio", "landingpage"] },
  // Der Bewerberprozess hat das Bewerbungsmanagement abgeloest, es gibt nur
  // noch diesen einen Eintrag. Geprueft wird er ueber `isUrlAllowedForRole`
  // wie jeder andere auch.
  { title: "Bewerberprozess", url: "/bewerberprozess", icon: Route, suchbegriffe: ["bewerber", "bewerbung", "recruiting", "einstellen", "bewerbungsmanagement"] },
  { title: "VP-Bewertungen", url: "/vp-bewertungen", icon: Star, suchbegriffe: ["bewertung", "feedback", "beurteilung"] },
  {
    title: "Sicherheit & Audit",
    url: "/sicherheits-cockpit",
    icon: ShieldAlert,
    adminOnly: true,
    children: [
      { title: "Sicherheits-Cockpit", url: "/sicherheits-cockpit", icon: ShieldAlert, adminOnly: true, suchbegriffe: ["sicherheit", "2fa", "anomalien"] },
      { title: "Audit-Log", url: "/audit-log", icon: ScrollText, adminOnly: true, suchbegriffe: ["protokoll", "verlauf", "wer hat was"] },
      { title: "Session-Anomalien", url: "/session-anomalien", icon: ShieldAlert, adminOnly: true },
      { title: "Storage-Audit", url: "/storage-audit", icon: ShieldAlert, adminOnly: true },
      { title: "Webhook-Audit", url: "/webhook-audit", icon: ScrollText, adminOnly: true },
      { title: "Nachtprüfung", url: "/nachtpruefung", icon: Moon, adminOnly: true, tooltip: "Was die nächtliche Systemprüfung gefunden hat." },
    ],
  },
];

const kundeItemsDef = [
  { title: "Stammdaten", url: "/kunde/stammdaten", icon: User },
  { title: "Chat", url: "/kunde/chat", icon: MessageCircle },
  { title: "Investments", url: "/kunde/investments", icon: Building2 },
  { title: "Steuer & Wertentwicklung", url: "/kunde/steuer-cockpit", icon: Calculator },
  { title: "Mein Kundenordner", url: "/kunde/kundenordner", icon: FolderOpen },
  { title: "Empfehlungen", url: "/kunde/empfehlungen", icon: Gift },
];

const tippgeberItemsDef = [
  { title: "Übersicht", url: "/tippgeber-portal?tab=uebersicht", icon: Gift },
  { title: "Neuer Kontakt", url: "/tippgeber-portal?tab=neu", icon: UserPlus, suchbegriffe: ["empfehlen", "kontakt anlegen", "tipp abgeben"] },
  { title: "Konditionen", url: "/tippgeber-portal?tab=konditionen", icon: CreditCard, suchbegriffe: ["provision", "verguetung", "tippgeberprovision"] },
  { title: "Chat mit VP", url: "/tippgeber-portal?tab=chat", icon: MessageCircle, suchbegriffe: ["nachricht", "vertriebspartner"] },
  { title: "Einstellungen", url: "/einstellungen", icon: UserCog, suchbegriffe: EINSTELLUNGEN_SUCHBEGRIFFE },
];

export type NavItem = {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  hasSubmenu?: boolean;
  draft?: boolean;
  badgeCount?: number;
  adminOnly?: boolean;
  /**
   * Rollen, fuer die `adminOnly` **nicht** gilt.
   *
   * Ohne dieses Feld gaebe es nur zwei Moeglichkeiten: den Riegel ganz
   * entfernen, womit der Eintrag fuer jede Rolle sichtbar wuerde, die ihn
   * freigegeben hat, oder die Rolle in `siehtAdminOnlyNavigation` aufnehmen,
   * womit sie **alle** Admin-Eintraege saehe, bis hin zum Audit-Log.
   * Beides waere zu grob. Hier steht namentlich, wer zusaetzlich darf.
   *
   * Die Freigabe der Route bleibt davon unberuehrt: Wer die Seite nicht in
   * seiner Liste hat, sieht den Eintrag auch mit diesem Feld nicht.
   */
  auchFuer?: string[];
  children?: NavItem[];
  tooltip?: string;
  newBadge?: boolean;
  /** Oeffnet in einem neuen Tab, etwa fuer oeffentliche Seiten ausserhalb des CRM. */
  neuerTab?: boolean;
  /** Kleiner Hinweis rechts am Eintrag, etwa "Admin" fuer Bereiche in Erprobung. */
  adminBadge?: boolean;
  trailing?: ReactNode;
  /**
   * Wonach Menschen außer dem Titel suchen, für die globale Suche. Klein
   * geschrieben. Niemand tippt „Einwand-Bibliothek", getippt wird „zu teuer".
   */
  suchbegriffe?: string[];
};

/** Was die Seitenleiste über die aktive Rolle und die Person wissen muss. */
export interface NavKontext {
  /** Die AKTIVE Rolle, nicht die Person. */
  rolle: UserRole | string;
  /** Individuelle Freigaben aus `user_settings.einstellungen.custom_permissions`. */
  customPermissions?: string[];
  /** Karrierestufe, nur wenn das Stufen-Gating für die Person aktiv ist. */
  vpStufeId?: string | null;
  /** Nur für Freigaben, die an einer Person hängen (Videocall, Bewerberprozess). */
  identitaet?: NutzerIdentitaet;
  /** Videocall-Bereich, siehe `useVideocallFreigabe`. */
  videocallFreigabe?: boolean;
  /** Schalter der Handbuch-Seite, siehe `handbuchPartnerFreigeschaltet`. */
  handbuchFrei?: boolean;
}

export interface NavGruppe {
  label: string;
  items: NavItem[];
  iconTint: string;
  defaultOpen?: boolean;
}

/**
 * Die Gruppen der Seitenleiste für eine Rolle, in ihrer Reihenfolge.
 *
 * Hier stehen die Regeln, die ganze Gruppen oder einzelne Einträge vorab
 * herausnehmen. Ob ein übrig gebliebener Eintrag erscheint, entscheidet danach
 * `darfNavEintrag`, genau wie in der Seitenleiste.
 */
export function navigationsGruppen(ctx: NavKontext): NavGruppe[] {
  const rolle = String(ctx.rolle || "");
  // Kunde und Tippgeber sehen ausschließlich ihr Portal.
  if (isKundeRole(rolle as UserRole)) return [{ label: "", items: kundeItemsDef, iconTint: "text-apple-blue" }];
  if (isTippgeberRole(rolle as UserRole)) return [{ label: "", items: tippgeberItemsDef, iconTint: "text-apple-pink" }];

  const eigene = ctx.customPermissions || [];
  const gruppen: NavGruppe[] = [
    { label: "", items: mainItems, iconTint: "text-apple-blue" },
    {
      label: "Vertrieb",
      items: vertriebItems.filter((item) => item.url !== "/meine-leads" || rolle === "setterin"),
      iconTint: "text-apple-green",
    },
    {
      label: "Immobilien",
      // Testfreischaltung „Objekte" für einzelne Vertriebspartner-Konten,
      // siehe `objekteTestFreigabe`. Nur der eine Eintrag, nicht Akquise und
      // Einreichungen.
      items: objekteTestFreigabe(rolle, ctx.identitaet?.userId)
        ? immobilienItems.map((item) => (item.url === "/objekte" ? { ...item, adminOnly: false, adminBadge: false } : item))
        : immobilienItems,
      iconTint: "text-apple-orange",
    },
    // Junior-Override und Mentoring sind in Auswertungen (Tab "Mein Team")
    // und Abrechnungen (Differenzumsatz-Spalte) integriert.
    { label: "Auswertung", items: auswertungItems, iconTint: "text-apple-indigo" },
    {
      label: "Tools",
      items: toolsItems.map((item) =>
        item.url === HANDBUCH_SEITE_ROUTE && ctx.handbuchFrei ? { ...item, adminOnly: false, adminBadge: false } : item,
      ),
      iconTint: "text-apple-purple",
    },
    { label: "Wissen", items: wissenItems, iconTint: "text-apple-purple" },
  ];
  if (ctx.videocallFreigabe) gruppen.push({ label: "Videocall", items: videocallItems, iconTint: "text-apple-teal" });
  gruppen.push(
    { label: "Marketing", items: marketingItems, iconTint: "text-apple-pink" },
    {
      label: "Support",
      items: helpdeskItems.filter(
        (item) => ["inhaber", "admin", "backoffice"].includes(rolle) || item.url !== "/helpdesk" || eigene.includes(item.url),
      ),
      iconTint: "text-apple-teal",
    },
  );
  if (["inhaber", "admin", "hausverwaltung"].includes(rolle) || hausverwaltungItems.some((item) => eigene.includes(item.url))) {
    gruppen.push({ label: "Hausverwaltung", items: hausverwaltungItems, iconTint: "text-apple-brown", defaultOpen: false });
  }
  gruppen.push({
    label: "Team & Admin",
    items: teamAdminItems.filter(
      (item) => item.title !== "VP-Bewertungen" || ["admin", "inhaber", "vertriebsleiter", "backoffice"].includes(rolle),
    ),
    iconTint: "text-apple-gray",
  });
  return gruppen;
}

/** Erscheint dieser Eintrag für die Rolle? Admin-Riegel plus Routenfreigabe. */
export function darfNavEintrag(item: Pick<NavItem, "url" | "adminOnly" | "auchFuer">, ctx: NavKontext): boolean {
  if (greiftAdminRiegel(item, ctx.rolle)) return false;
  return isUrlAllowedForRole(item.url, (ctx.rolle || "admin") as UserRole, ctx.customPermissions, ctx.vpStufeId, ctx.identitaet);
}

/**
 * Sieht die aktive Rolle den Eintrag „Objekte" (`/objekte`, die
 * Objektverwaltung mit dem Investagon-Import) in der Seitenleiste?
 *
 * Christian am 29.09.2026: Die Empfehlungen und die Liste aller Objekte mit
 * freien Einheiten in der Objektauswahl hängen an genau diesem Schalter. Wer
 * den Eintrag nicht sieht, bekommt dort nur „Objekt eintragen". Deshalb wird
 * der Eintrag hier aus denselben Gruppen gesucht und mit derselben Prüfung
 * bewertet wie in der Seitenleiste: Wird er für eine Rolle freigeschaltet
 * (`auchFuer` oder ohne `adminOnly`), folgt die Objektauswahl von selbst.
 */
export function siehtObjekteMenue(ctx: NavKontext): boolean {
  const eintrag = navigationsGruppen(ctx).flatMap((g) => g.items).find((item) => item.url === "/objekte");
  return !!eintrag && darfNavEintrag(eintrag, ctx) && !entwurfGesperrt(eintrag, String(ctx.rolle));
}

/**
 * Ist diese Adresse Teil des Objektbereichs (`/objekte` und alles darunter)
 * und für die aktive Rolle zu?
 *
 * Christian am 29.09.2026: Wer den Eintrag „Objekte" nicht sieht, soll auch
 * über Direktlinks, Lesezeichen, Glocken und die globale Suche nicht an die
 * Objekte kommen. Maßstab ist deshalb `siehtObjekteMenue`, keine eigene
 * Rollenliste: Wird der Eintrag für eine Rolle freigeschaltet, gehen
 * Routenschutz und Suche von selbst mit. `/objekte-neu` (Investagon) gehört
 * nicht dazu.
 *
 * Christian, ebenfalls am 29.09.2026: Der Bereich ist vorerst nur für die
 * Verwaltung. Das gilt auch für den Anlage-Assistenten `/objekte/neu` und den
 * Einheitenspiegel. Vertriebspartner tragen ein Objekt im Kundenprofil ein
 * (Investment, Objektauswahl, „Objekt eintragen“), der Dialog bleibt im
 * Investment.
 *
 * Das ist nur die Oberfläche. Die Zeilensicherheit auf `objekte` und
 * `wohnungen` bleibt unverändert, interne Rollen laden die Daten weiter.
 */
export function objektbereichGesperrt(pfad: string, ctx: NavKontext): boolean {
  const p = pfad.split(/[?#]/)[0];
  if (p !== "/objekte" && !p.startsWith("/objekte/") && p !== "/einheitenspiegel") return false;
  // Das Objektpartner-Dashboard führt ausschließlich in diesen Bereich
  // (Liste, eigene Objekte, Objekt anlegen). Christian: so lassen.
  if (ctx.rolle === "objektpartner") return false;
  // Die Testfreischaltung öffnet nur das Ansehen. Anlegen und Bearbeiten
  // bleiben zu, auch wenn `/objekte` als Präfix sie in den Rollenrechten mitnimmt.
  if (objekteTestFreigabe(ctx.rolle, ctx.identitaet?.userId) && (p === "/objekte/neu" || p.endsWith("/bearbeiten"))) return true;
  return !siehtObjekteMenue(ctx);
}

/**
 * Ist der Eintrag ein Entwurf, den diese Rolle nur ausgegraut sieht?
 *
 * Entwürfe kommen aus zwei Quellen: der zentralen Liste in `draftRoutes.ts`
 * und dem Merkmal `draft` am Eintrag. Öffnen dürfen sie Admin und Inhaber.
 */
export function entwurfGesperrt(item: Pick<NavItem, "url" | "draft">, rolle: string | undefined): boolean {
  if (!item.draft && !isDraftRoute(item.url)) return false;
  const darf =
    ["admin", "inhaber"].includes(rolle || "") ||
    // Der Kalender ist fuer das Bewerbermanagement freigegeben: Dort sieht
    // die HR-Managerin ihre ueber den Buchungslink gebuchten Termine nach
    // Tagen, genau wie im Buchungskalender unter Videocall.
    (item.url === "/kalender" && rolle === "hr");
  return !darf;
}
