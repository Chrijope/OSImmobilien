-- ===========================================================================
-- Wiederherstellungscodes: Zugriff nur noch ueber die Edge Function
-- ===========================================================================
--
-- WAS DAS PROBLEM WAR
--
-- `consume_mfa_recovery_code(_user_id, _code_hash, _ip)` und
-- `mfa_recovery_codes_status(_user_id)` laufen als SECURITY DEFINER, also mit
-- erhoehten Rechten, und nehmen die Benutzerkennung als **Parameter** entgegen.
-- Keine der beiden prueft, ob der Aufrufer diese Kennung ueberhaupt besitzt.
--
-- Beide waren zusaetzlich fuer die Rolle `authenticated` freigegeben
-- (20260601141419 fuer die erste, 20260531191124 fuer die zweite). Damit
-- konnte jeder angemeldete Nutzer sie fuer ein **fremdes** Konto aufrufen:
--
--   1. `mfa_recovery_codes_status` verraet, ob ein beliebiges Konto
--      Wiederherstellungscodes besitzt und wie viele davon noch offen sind.
--   2. `consume_mfa_recovery_code` laesst sich im Wettlauf durchprobieren.
--      Der Angreifer muss zwar den Pruefwert eines Codes treffen, umgeht dabei
--      aber die Begrenzung von fuenf Versuchen je Stunde, die in der Edge
--      Function `manage-mfa` sitzt und nicht in der Datenbank.
--
-- WARUM DAS ZURUECKNEHMEN GEFAHRLOS IST
--
-- Beide Funktionen werden ausschliesslich aus `manage-mfa` heraus aufgerufen,
-- und zwar mit dem Dienstschluessel (`SUPABASE_SERVICE_ROLE_KEY`), siehe dort
-- die Stellen mit `admin.rpc(...)`. Kein Aufruf aus dem Browser existiert; die
-- Suche im Quelltext findet ausserhalb der erzeugten Typdatei keinen Treffer.
-- Die Freigabe fuer `authenticated` war also von Anfang an ungenutzt.
--
-- Die Rolle `service_role` behaelt ihre Rechte, der Ablauf bleibt unveraendert:
-- Ein Nutzer loest seinen Code weiterhin ueber die Edge Function ein, dort
-- greift die Begrenzung, dort steht auch die Pruefung, wer fragt.
--
-- Wiederholbar: REVOKE auf ein bereits entzogenes Recht ist folgenlos.
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION public.consume_mfa_recovery_code(UUID, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mfa_recovery_codes_status(UUID) FROM authenticated;

-- Sicherstellen, dass der einzige benutzte Weg offen bleibt.
GRANT EXECUTE ON FUNCTION public.consume_mfa_recovery_code(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mfa_recovery_codes_status(UUID) TO service_role;
