import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ladeUnterlagen, onboardingStand, darfInsCrm, type OnboardingStand,
} from "@/lib/partnerUnterlagenStore";

/**
 * Der Stand der Pflichtunterlagen des angemeldeten Nutzers.
 *
 * Wird von Banner und Sperre gebraucht. Beide hängen am selben Hook, damit
 * nicht zwei Abfragen laufen und beide dieselbe Wahrheit sehen.
 *
 * Wen es NICHT betrifft: Kunden und Tippgeber. Die Pflicht gilt für Partner,
 * die für MOREImmo vermitteln, nicht für jeden, der sich anmelden kann.
 */

/** Rollen, für die die Pflichtunterlagen gelten. */
const BETROFFENE_ROLLEN = new Set([
  "vertriebspartner", "junior_partner", "lead_partner", "senior_partner",
  "team_lead", "lizenzpartner", "vertriebsleiter", "objektpartner", "setterin",
]);

export interface UnterlagenLage {
  /** Noch nicht geladen. Bis dahin nichts anzeigen und nichts sperren. */
  laedt: boolean;
  /** Gilt die Pflicht für diesen Nutzer überhaupt? */
  betroffen: boolean;
  stand: OnboardingStand | null;
  /** Darf der Nutzer ins CRM? */
  offen: boolean;
  /**
   * Banner zeigen?
   *
   * Nur bei Bestandspartnern, also solchen mit laufender Frist. Neue Partner
   * bekommen keinen: Sie sind ohnehin gesperrt, bis sie hochgeladen haben, und
   * ein Hinweis auf eine Frist, die es für sie nicht gibt, wäre irreführend.
   */
  bannerZeigen: boolean;
  neuLaden: () => void;
}

export function useUnterlagenStand(): UnterlagenLage {
  const { user } = useUser();
  const [lage, setLage] = useState<UnterlagenLage>({
    laedt: true, betroffen: false, stand: null, offen: true,
    bannerZeigen: false, neuLaden: () => {},
  });
  const [version, setVersion] = useState(0);
  const neuLaden = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    let abgebrochen = false;

    (async () => {
      const betroffen = BETROFFENE_ROLLEN.has(user?.role || "");
      if (!betroffen) {
        if (!abgebrochen) {
          setLage({ laedt: false, betroffen: false, stand: null, offen: true, bannerZeigen: false, neuLaden });
        }
        return;
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        // Nicht angemeldet: Das regelt die Anmeldung, nicht dieser Hook.
        if (!abgebrochen) {
          setLage({ laedt: false, betroffen: false, stand: null, offen: true, bannerZeigen: false, neuLaden });
        }
        return;
      }

      const db = supabase as unknown as { from: (t: string) => any };
      const [docs, profil] = await Promise.all([
        ladeUnterlagen(authUser.id),
        db.from("profiles")
          .select("gewerbeerlaubnis_34c, unterlagen_frist_bis")
          .eq("id", authUser.id).maybeSingle(),
      ]);
      if (abgebrochen) return;

      /*
       * Ist die Migration noch nicht gelaufen, gibt es die Spalten nicht.
       * Dann darf hier auf keinen Fall gesperrt werden: Sonst kommt nach dem
       * Publish niemand mehr ins CRM, nur weil eine Migration aussteht.
       */
      const fehler = (profil as { error?: { code?: string; message?: string } }).error;
      if (fehler) {
        console.warn("[useUnterlagenStand] Pflichtunterlagen noch nicht eingerichtet:", fehler.message);
        setLage({ laedt: false, betroffen: false, stand: null, offen: true, bannerZeigen: false, neuLaden });
        return;
      }

      const p = (profil.data || {}) as {
        gewerbeerlaubnis_34c?: boolean | null;
        unterlagen_frist_bis?: string | null;
      };
      const hat34c = p.gewerbeerlaubnis_34c === null || p.gewerbeerlaubnis_34c === undefined
        ? null : Boolean(p.gewerbeerlaubnis_34c);
      const stand = onboardingStand(docs, hat34c, p.unterlagen_frist_bis ?? null);

      setLage({
        laedt: false,
        betroffen: true,
        stand,
        offen: darfInsCrm(stand),
        // Nur Bestandspartner: Frist vorhanden, noch nicht abgelaufen, und es
        // fehlt tatsächlich etwas.
        bannerZeigen: !stand.vollstaendig && stand.tageRest !== null && stand.tageRest > 0,
        neuLaden,
      });
    })().catch((e) => {
      console.error("[useUnterlagenStand]", e);
      // Im Zweifel offen lassen. Ein Fehler beim Laden darf niemanden aussperren.
      if (!abgebrochen) {
        setLage({ laedt: false, betroffen: false, stand: null, offen: true, bannerZeigen: false, neuLaden });
      }
    });

    return () => { abgebrochen = true; };
  }, [user?.role, version, neuLaden]);

  return lage;
}

/**
 * Wurde der Banner heute schon weggeklickt?
 *
 * Je Nutzer und je Kalendertag. Am nächsten Tag erscheint er wieder, denn ein
 * Hinweis, den man einmal wegklickt und der nie wiederkommt, erinnert an
 * nichts.
 */
const SCHLUESSEL = (moreId: string) => `unterlagen-banner-weg:${moreId}`;

export function heuteWeggeklickt(moreId: string): boolean {
  try {
    return localStorage.getItem(SCHLUESSEL(moreId)) === new Date().toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

export function heuteWegklicken(moreId: string): void {
  try {
    localStorage.setItem(SCHLUESSEL(moreId), new Date().toISOString().slice(0, 10));
  } catch {
    /* Ohne Speicher erscheint er beim nächsten Seitenaufruf erneut. Ärgerlich,
       aber besser als eine Fehlermeldung. */
  }
}
