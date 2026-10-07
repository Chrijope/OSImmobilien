import type { LucideIcon } from "lucide-react";
import {
  Mail, UserPlus, Building2, LayoutDashboard, PlayCircle,
  HandHeart, CalendarDays, MessageCircle, Smartphone,
} from "lucide-react";
import { CALL_WOCHENTAG_NAME, rundeUhrzeitText } from "@/lib/weeklyCallZeit";

export type OnboardingSchrittId =
  | "email_postfach"
  | "nutzer_anlegen"
  | "investagon"
  | "community_channel"
  | "landingpage"
  | "walkthrough"
  | "begleitung"
  | "weekly_call"
  | "whatsapp"
  | "app_speichern";

export type OnboardingSchritt = {
  id: OnboardingSchrittId;
  nummer: number;
  titel: string;
  beschreibung: string;
  icon: LucideIcon;
  /** Wenn true, wird die Card vom bestehenden „Nutzer anlegen"-Block selbst gerendert (Platzhalter). */
  externesRendering?: boolean;
};

/**
 * Die drei Pflicht-Haken der Freischaltung: persönliche Mail erstellt,
 * CRM-Zugang freigeschaltet (Einladung versendet), Investagon freigeschaltet.
 * Sind alle drei gesetzt, wird der Bewerberstatus automatisch auf "Aktiv"
 * gestellt (siehe AktivierungTab).
 */
export const AKTIV_PFLICHT_SCHRITTE: OnboardingSchrittId[] = [
  "email_postfach",
  "nutzer_anlegen",
  "investagon",
];

/** Alles Weitere erledigt Christian Peetz im Onboarding-Termin. */
export const ONBOARDING_ZUSATZ_SCHRITTE: OnboardingSchrittId[] = [
  "community_channel",
  "landingpage",
  "walkthrough",
  "begleitung",
  "weekly_call",
  "whatsapp",
  "app_speichern",
];

/** Reine Prüfung für die Aktiv-Automatik: alle drei Pflicht-Haken gesetzt? */
export function alleAktivPflichtenErfuellt(
  done: Partial<Record<OnboardingSchrittId, boolean>>,
): boolean {
  return AKTIV_PFLICHT_SCHRITTE.every((id) => !!done[id]);
}

export const AKTIVIERUNG_ONBOARDING_SCHRITTE: OnboardingSchritt[] = [
  {
    id: "email_postfach",
    // Keine eigene Karte mehr, der Haken steht in Block 2 "Persönliche
    // E-Mail mitteilen". Die Karten unter "Freischalten" zaehlen ab 1.
    nummer: 0,
    titel: "E-Mail-Postfach anlegen",
    beschreibung:
      "Lege gemeinsam mit dem Partner sein geschäftliches E-Mail-Postfach an. Auf diese Adresse wird im nächsten Schritt die CRM-Einladung versendet.",
    icon: Mail,
  },
  {
    id: "nutzer_anlegen",
    nummer: 1,
    titel: "Nutzer im CRM anlegen",
    beschreibung:
      "Lege den Partner als Nutzer im Backoffice an und versende die Einladung manuell.",
    icon: UserPlus,
    externesRendering: true,
  },
  {
    id: "investagon",
    nummer: 2,
    titel: "Investagon-Zugang einrichten",
    beschreibung:
      "Übergib dem Partner den Investagon-Zugang. Logindaten vertraulich behandeln.",
    icon: Building2,
  },
  {
    id: "community_channel",
    nummer: 3,
    titel: "WhatsApp-Community beitreten",
    beschreibung:
      "Partner ueber den QR-Code in die OS Immobilien-Community einladen und den zur Rolle passenden Untergruppen direkt hinzufuegen.",
    icon: MessageCircle,
  },
  {
    id: "landingpage",
    nummer: 4,
    titel: "Persönliche Landingpage besprechen",
    beschreibung:
      "Gehe gemeinsam die persönliche Landingpage im Dashboard durch (Inhalte, Foto, Buchungslink).",
    icon: LayoutDashboard,
  },
  {
    id: "walkthrough",
    nummer: 5,
    titel: "Kundenabwicklungs-Walk-through",
    beschreibung:
      "Kompletter Prozess von Lead-Eingang bis Kaufpreisfälligkeit. Meeting aufzeichnen und die Aufzeichnung dem Partner zusenden.",
    icon: PlayCircle,
  },
  {
    id: "begleitung",
    nummer: 6,
    titel: "Erste Kundenberatungen begleiten",
    beschreibung:
      "Die ersten Kunden werden gemeinsam mit einem unserer Vertriebspartner begleitet, bis selbstständige Beratungen möglich sind.",
    icon: HandHeart,
  },
  {
    id: "weekly_call",
    nummer: 7,
    // Die Checkliste kennt die Anzeige-Variante des kuenftigen Nutzers nicht,
    // deshalb stehen hier beide Startzeiten.
    titel: `Weekly Team-Call (${CALL_WOCHENTAG_NAME} ${rundeUhrzeitText("lead_berater")}/${rundeUhrzeitText("vertriebspartner")})`,
    beschreibung:
      `Pflichttermin jeden ${CALL_WOCHENTAG_NAME}: ${rundeUhrzeitText("lead_berater")} Uhr für Lead-Berater, ${rundeUhrzeitText("vertriebspartner")} Uhr für Vertriebspartner. Im Dashboard im Kästchen „Weekly Call" einsehen.`,
    icon: CalendarDays,
  },
  {
    id: "whatsapp",
    nummer: 8,
    titel: 'WhatsApp-Gruppe „OS Immobilien Sales"',
    beschreibung:
      "Partner zur Sales-Gruppe hinzufügen – für Fragen, Bugs und offene Punkte.",
    icon: MessageCircle,
  },
  {
    id: "app_speichern",
    nummer: 9,
    titel: "CRM als App speichern",
    beschreibung:
      "Zeige dem Partner, wie er das CRM in Safari (Mac/iPhone) im Dock bzw. auf dem Home-Bildschirm als App speichert.",
    icon: Smartphone,
  },
];
