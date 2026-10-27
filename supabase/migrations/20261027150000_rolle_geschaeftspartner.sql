-- Rolle Geschaeftspartner (Christian, 27.10.2026): sieht im CRM nur den
-- veroeffentlichten Verkaufsreport. Eigene Datei, weil ein neuer Wert von
-- app_role erst nach dem Ende dieser Transaktion benutzt werden darf; die
-- Regeln dazu stehen in 20261027150100_verkaufsreport.sql.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'geschaeftspartner';
