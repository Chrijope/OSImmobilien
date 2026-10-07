-- ===========================================================================
-- Selbstauskunfts-Link: gespeicherter Stand nur, solange der Link offen ist
-- ===========================================================================
--
-- Christians Freigabe vom 28.09.2026, Leseluecke Stufe 1.
--
-- `get_sa_fill_token` gab jedem mit einem Selbstauskunfts-Link den ganzen
-- gespeicherten Stand heraus (`prefill_data` mit allen Angaben, dazu Name und
-- E-Mail), auch nachdem die Selbstauskunft abgeschickt war (Status `used`)
-- oder der Link abgelaufen ist. Wer den Link spaeter in einer weitergeleiteten
-- Mail oder im Verlauf eines fremden Geraets findet, las alles mit.
--
-- Jetzt: Den Stand und die uebrigen personenbezogenen Felder gibt die Funktion
-- nur heraus, solange der Link offen (`pending`) UND gueltig
-- (`expires_at > now()`) ist. Sonst kommen nur Kennung des Links, Status,
-- Ablauf und Sprache zurueck, also genau das, was die Seite fuer "Bereits
-- ausgefuellt" und "Link abgelaufen" braucht. Geleert werden `prefill_data`,
-- `email`, `name`, `kontakt_id`, `investment_id`, `created_by` und die drei
-- Zeitpunkte zu Mail, Link und Erinnerung.
--
-- Unveraendert: Name, Signatur und Rueckgabetyp (dieselben Schluessel, bei
-- geschlossenem Link nur leer bzw. null), SECURITY DEFINER, search_path,
-- Rechte (anon und authenticated) und der uebrige Rumpf aus 20260925180000.
-- Die Sprache wird vor dem Leeren ermittelt, sie braucht `kontakt_id`.
-- Die Spalte `nur_am_link` aus 20260928200000 kommt ueber den Zeilentyp mit
-- und bleibt, wie sie ist; die Reihenfolge der beiden Migrationen ist egal.
--
-- Mehrfach ausfuehrbar, aendert keine Daten.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sa_fill_token(_token text)
RETURNS public.sa_fill_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.sa_fill_tokens%ROWTYPE;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.sa_fill_tokens
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _zeile.sprache := CASE
    WHEN lower(btrim(coalesce(_zeile.sprache, ''))) IN ('de', 'en') THEN lower(btrim(_zeile.sprache))
    ELSE public.kontakt_sprache(_zeile.kontakt_id)
  END;

  -- Abgeschickt oder abgelaufen: nur Status, Ablauf und Sprache (seit 20260928220000).
  IF NOT coalesce(_zeile.status = 'pending' AND _zeile.expires_at > now(), false) THEN
    _zeile.prefill_data := NULL;
    _zeile.email := '';
    _zeile.name := '';
    _zeile.kontakt_id := NULL;
    _zeile.investment_id := NULL;
    _zeile.created_by := NULL;
    _zeile.email_opened_at := NULL;
    _zeile.link_opened_at := NULL;
    _zeile.reminder_sent_at := NULL;
  END IF;

  RETURN _zeile;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_sa_fill_token(text) IS
  'Selbstauskunfts-Link lesen: den gespeicherten Stand, Name und E-Mail nur bei offenem und gueltigem Link, sonst nur Status, Ablauf und Sprache. Migration 20260928220000.';

COMMIT;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts): Zeile 38.1 in 99_PRUEFUNG.sql
-- ---------------------------------------------------------------------------
