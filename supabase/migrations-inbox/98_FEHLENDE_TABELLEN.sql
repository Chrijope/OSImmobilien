-- Welche Tabellen aus dem Repo fehlen in der Datenbank?
--
-- WOZU DAS DA IST
--
-- Migrationen werden in diesem Projekt nicht automatisch angewendet, Christian
-- führt sie im Supabase-SQL-Editor aus. Bleibt eine liegen, merkt es niemand:
-- Der Code steht im Repo, die Tabelle fehlt in der Datenbank, und was auf sie
-- zugreift, schlägt still fehl. Zweimal ist das schon passiert:
--
--   * `analysetool_ereignisse` (Migration vom 27.07.2026): Der Trichter des
--     Analysetools zählte monatelang ins Leere.
--   * `va_aufgaben_ergebnisse` (Migration vom 27.07.2026): Sie hat am
--     09.09.2026 den ganzen Bereich VA aus dem Kennzahlenlauf gerissen.
--
-- Beide stammen aus derselben Woche. Es könnten weitere sein, und genau das
-- beantwortet diese Abfrage.
--
-- WIE SIE BENUTZT WIRD
--
-- Im Supabase-SQL-Editor ausführen. Sie ändert nichts, sie schaut nur nach.
-- Zuoberst steht, was fehlt. Steht in der Spalte „vorhanden" überall „ja",
-- ist die Datenbank vollständig.
--
-- Zu jeder fehlenden Tabelle gehört die Migration, die sie anlegt. Sie findet
-- sich mit einer Textsuche über `supabase/migrations/`, etwa
--
--     grep -rl "CREATE TABLE IF NOT EXISTS public.va_aufgaben_ergebnisse" \
--          supabase/migrations/
--
-- Diese Datei ist keine Migration. Sie bleibt liegen, auch wenn der
-- Eingangskorb leer ist, genau wie 99_PRUEFUNG.sql.
--
-- WIE DIE LISTE ENTSTANDEN IST
--
-- Aus allen `CREATE TABLE`-Anweisungen in `supabase/migrations/`, Stand
-- 09.09.2026. Kommt eine neue Tabelle dazu, gehört sie unten in die Liste.
--
-- Vier Tabellen stehen bewusst NICHT in der Liste, weil sie später wieder
-- entfernt wurden (20260622151218): `sales_coach_aufnahmen`,
-- `team_call_protokolle`, `team_call_punkte` und `team_call_settings`. Sie
-- sollen fehlen. Stünden sie hier, meldete die Abfrage jedes Mal vier
-- Fehlalarme.
--
-- Ebenso fehlt `zoom_connections`: Die Migration 20260929141000 entfernt sie
-- (Zoom aus dem CRM, Entscheidung vom 29.09.2026).

WITH erwartet(tabelle) AS (VALUES
  ('abwesenheiten'),
  ('academy_progress'),
  ('activation_tokens'),
  ('activity_log'),
  ('ai_rate_limits'),
  ('aktivitaeten'),
  ('analysetool_ereignisse'),
  ('anrufe'),
  ('app_config'),
  ('audit_log'),
  ('audit_log_archive'),
  ('aufgaben'),
  ('auth_lockouts'),
  ('benachrichtigungen'),
  ('betriebskosten'),
  ('bewerber_abmeldung'),
  ('bewerber_formular'),
  ('bewerber_mail_tracking'),
  ('bewerber_seite'),
  ('bewerbungen'),
  ('buchung_einstellungen'),
  ('buchung_links'),
  ('buchung_terminarten'),
  ('buchung_verfuegbarkeiten'),
  ('buchungen'),
  ('chat_gruppen'),
  ('chat_nachrichten'),
  ('chat_teilnehmer'),
  ('dienstleister'),
  ('dsgvo_deletion_log'),
  ('eigentuemer'),
  ('email_send_log'),
  ('email_send_state'),
  ('email_unsubscribe_tokens'),
  ('emails'),
  ('empfehlungen'),
  ('empfehlungsprogramme'),
  ('externe_investments'),
  ('finanzierungen'),
  ('follow_up_ketten'),
  ('follow_ups'),
  ('fristen'),
  ('gespraech_mitschriften'),
  ('hv_tickets'),
  ('investment_berechnungen'),
  ('investments'),
  ('karriere_stufen'),
  ('kautionen'),
  ('kennzahlen_tagesstand'),
  ('kommunikation'),
  ('kontakt_view_log'),
  ('kontakte'),
  ('kunde_dokumente'),
  ('kunden_bewertungen'),
  ('lexikon'),
  ('login_sessions'),
  ('marktanalyse_quellen'),
  ('meldungen'),
  ('mfa_recovery_codes'),
  ('mieter'),
  ('mobile_scan_sessions'),
  ('moderations_aktionen'),
  ('nachtpruefung_befunde'),
  ('news'),
  ('objekt_bilder'),
  ('objekt_dokumente'),
  ('objekt_einreichung_notizen'),
  ('objekt_einreichungen'),
  ('objekt_exposes'),
  ('objekte'),
  ('objektvorstellungen'),
  ('partner_unterlagen'),
  ('pipeline'),
  ('profiles'),
  ('provisionsabrechnungen'),
  ('push_subscriptions'),
  ('rate_limit_buckets'),
  ('rechnung_stammdaten'),
  ('rechnungen'),
  ('role_permissions'),
  ('sa_fill_tokens'),
  ('scheduled_notifications'),
  ('secret_rotations'),
  ('signature_requests'),
  ('standort_arbeitgeber'),
  ('standort_kennzahlen'),
  ('standorte'),
  ('support_tickets'),
  ('suppressed_emails'),
  ('termin_erinnerungen'),
  ('tippgeber'),
  ('unterlagen_dokumente'),
  ('unterlagen_highlights'),
  ('unterlagen_kategorien'),
  ('user_roles'),
  ('user_settings'),
  ('va_abwaegung_antworten'),
  ('va_aufgaben_ergebnisse'),
  ('va_fortschritt'),
  ('va_partner_antworten'),
  ('va_partner_fortschritt'),
  ('vermietungen'),
  ('versicherungen'),
  ('videocall_freigaben'),
  ('videoraeume'),
  ('videoraum_teilnehmer'),
  ('vp_bewertungen'),
  ('vp_marketing_einstellungen'),
  ('webhook_audit_log'),
  ('weekly_call_protokolle'),
  ('weekly_call_punkte'),
  ('wettbewerb_challenges'),
  ('wissenswelt_feedback'),
  ('wohnungen'),
  ('wohnungs_bilder'),
  ('wohnungs_dokumente'),
  ('zaehlerstaende')
)
SELECT
  e.tabelle,
  CASE WHEN to_regclass('public.' || e.tabelle) IS NULL
       THEN 'FEHLT' ELSE 'ja' END AS vorhanden
FROM erwartet e
-- Fehlendes zuerst, danach alphabetisch. Wer nur die Lücken sehen will,
-- setzt vor ORDER BY die Zeile
--   WHERE to_regclass('public.' || e.tabelle) IS NULL
ORDER BY (to_regclass('public.' || e.tabelle) IS NOT NULL), e.tabelle;
