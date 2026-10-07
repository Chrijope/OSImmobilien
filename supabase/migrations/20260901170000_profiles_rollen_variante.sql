-- Anzeige-Variante "Lead-Berater" fuer Vertriebspartner.
--
-- Bewusst KEINE neue Rolle im Aufzaehlungstyp app_role: Lead-Berater haben
-- exakt dieselben Rechte und Ansichten wie Vertriebspartner. has_role, RLS
-- und sidebarPermissions bleiben unveraendert. Die Spalte steuert nur den
-- Anzeigenamen (und die Weekly-Call-Zeit im Frontend).
--
-- NULL bedeutet: normale Anzeige nach Rolle (Bestand bleibt unangetastet,
-- kein Datenupdate, kein Default).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rollen_variante text
  CONSTRAINT profiles_rollen_variante_check
  CHECK (rollen_variante IS NULL OR rollen_variante = 'lead_berater');

COMMENT ON COLUMN public.profiles.rollen_variante IS
  'Reine Anzeige-Variante der Rolle. Aktuell nur ''lead_berater'' fuer '
  'Vertriebspartner, die als Lead-Berater angezeigt werden. Keine '
  'Rechtewirkung, massgeblich bleibt user_roles.';
