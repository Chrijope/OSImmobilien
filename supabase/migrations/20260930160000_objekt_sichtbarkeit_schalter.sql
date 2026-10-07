-- ===========================================================================
-- Sichtbarkeitsschalter fuer Investagon-Objekte (Punkt auf der Objektkachel)
-- ===========================================================================
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
--
-- GL am 30.09.2026: Admin, Inhaber und Objektpartner entscheiden per
-- Klick auf den Punkt der Objektkachel, ob ein aus Investagon uebernommenes
-- Objekt fuer die Vertriebspartner sichtbar ist (gruen) oder nicht (orange).
--
-- WARUM EINE FUNKTION
--
-- Seit 20260930120000 aendern `objekte` direkt nur Admin, Inhaber und die
-- Rolle objektpartner am eigenen Objekt (`erstellt_von`). Investagon-Objekte
-- legt der Import mit der Dienstrolle an, `erstellt_von` ist leer, ein
-- Objektpartner koennte den Punkt also nie umschalten. Eine allgemeine
-- UPDATE-Regel fuer Objektpartner wuerde ihm dagegen jede Spalte oeffnen.
-- Diese Funktion aendert genau eine Spalte, `sichtbar`, und nur bei
-- Investagon-Objekten. Selbst angelegte Objekte behalten ihren Weg ueber die
-- Objektseite.
--
-- Die Datenbank kennt die in der Seitenleiste gewaehlte aktive Rolle nicht.
-- Geprueft wird deshalb, ob die Person eine der drei Rollen besitzt; die
-- Oberflaeche zeigt den Schalter nur in der aktiven Rolle Admin, Inhaber
-- oder Objektpartner.
--
-- Der Import fasst die Spalte bei bestehenden Objekten nicht an, ausser bei
-- seinen eigenen alten Ausblendungen mit Vermerk `meta.investagonAusblendung`
-- (siehe `investagon-import/sichtbarkeit.ts`). Eine Ausblendung von Hand
-- bleibt also stehen.
--
-- Ohne diese Migration schalten Admin und Inhaber trotzdem (direkter Weg),
-- Objektpartner bekommen eine Meldung, dass die Datenbank ablehnt.

BEGIN;

CREATE OR REPLACE FUNCTION public.objekt_sichtbarkeit_setzen(p_objekt_id uuid, p_sichtbar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL OR p_objekt_id IS NULL OR p_sichtbar IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF NOT (public.is_admin_role(v_uid)
          OR public.has_role(v_uid, 'objektpartner'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  SELECT coalesce(o.meta, '{}'::jsonb) INTO v_meta
    FROM public.objekte o
   WHERE o.id = p_objekt_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Dieselbe Erkennung wie `ausInvestagon` in src/lib/investagonHerkunft.ts.
  IF NOT (
       jsonb_typeof(v_meta -> 'investagonRaw') = 'object'
    OR nullif(v_meta ->> 'investagonId', '') IS NOT NULL
    OR nullif(v_meta ->> 'investagonVollSyncVersion', '') IS NOT NULL
    OR nullif(v_meta ->> 'api_property_id', '') IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'kein_investagon_objekt');
  END IF;

  UPDATE public.objekte SET sichtbar = p_sichtbar WHERE id = p_objekt_id;
  RETURN jsonb_build_object('ok', true, 'sichtbar', p_sichtbar);
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.objekt_sichtbarkeit_setzen(uuid, boolean) TO authenticated;

COMMIT;
