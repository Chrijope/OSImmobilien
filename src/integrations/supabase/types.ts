export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abwesenheiten: {
        Row: {
          aktualisiert_am: string
          bis: string
          erstellt_am: string
          id: string
          notiz: string | null
          user_id: string
          vertretung_id: string | null
          von: string
        }
        Insert: {
          aktualisiert_am?: string
          bis: string
          erstellt_am?: string
          id?: string
          notiz?: string | null
          user_id: string
          vertretung_id?: string | null
          von: string
        }
        Update: {
          aktualisiert_am?: string
          bis?: string
          erstellt_am?: string
          id?: string
          notiz?: string | null
          user_id?: string
          vertretung_id?: string | null
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "abwesenheiten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abwesenheiten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abwesenheiten_vertretung_id_fkey"
            columns: ["vertretung_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abwesenheiten_vertretung_id_fkey"
            columns: ["vertretung_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_progress: {
        Row: {
          aktualisiert_am: string
          certificate_issued_at: string | null
          certificate_pdf_url: string | null
          certificate_serial: string | null
          completed_modules: Json
          current_module_index: number
          erstellt_am: string
          id: string
          passed_at: string | null
          passed_score: number | null
          quiz_attempts: Json
          role: string
          user_id: string
        }
        Insert: {
          aktualisiert_am?: string
          certificate_issued_at?: string | null
          certificate_pdf_url?: string | null
          certificate_serial?: string | null
          completed_modules?: Json
          current_module_index?: number
          erstellt_am?: string
          id?: string
          passed_at?: string | null
          passed_score?: number | null
          quiz_attempts?: Json
          role: string
          user_id: string
        }
        Update: {
          aktualisiert_am?: string
          certificate_issued_at?: string | null
          certificate_pdf_url?: string | null
          certificate_serial?: string | null
          completed_modules?: Json
          current_module_index?: number
          erstellt_am?: string
          id?: string
          passed_at?: string | null
          passed_score?: number | null
          quiz_attempts?: Json
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      activation_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          kontakt_id: string | null
          kunde_name: string | null
          next: string | null
          portal: string | null
          role: string | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          kontakt_id?: string | null
          kunde_name?: string | null
          next?: string | null
          portal?: string | null
          role?: string | null
          token?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          kontakt_id?: string | null
          kunde_name?: string | null
          next?: string | null
          portal?: string | null
          role?: string | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          kontakt_id: string
          meta: Json | null
          source: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          kontakt_id: string
          meta?: Json | null
          source?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          kontakt_id?: string
          meta?: Json | null
          source?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          created_at: string
          id: string
          request_count: number
          tag: string
          updated_at: string
          user_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_count?: number
          tag?: string
          updated_at?: string
          user_key: string
        }
        Update: {
          created_at?: string
          id?: string
          request_count?: number
          tag?: string
          updated_at?: string
          user_key?: string
        }
        Relationships: []
      }
      aktivitaeten: {
        Row: {
          angepinnt_am: string | null
          angepinnt_von: string | null
          art: string
          benutzer_id: string | null
          beschreibung: string | null
          datum: string | null
          dauer: string | null
          details: string | null
          ergebnis: string | null
          erledigt_am: string | null
          faellig_am: string | null
          id: string
          kalender_event_id: string | null
          kalender_typ: string | null
          kalender_url: string | null
          kunde_id: string
          meeting_kommunikation: Json | null
          meeting_revision: number
          prioritaet: string | null
          teilnehmer: string | null
          uhrzeit: string | null
          von: string | null
          zoom_link: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          angepinnt_am?: string | null
          angepinnt_von?: string | null
          art?: string
          benutzer_id?: string | null
          beschreibung?: string | null
          datum?: string | null
          dauer?: string | null
          details?: string | null
          ergebnis?: string | null
          erledigt_am?: string | null
          faellig_am?: string | null
          id?: string
          kalender_event_id?: string | null
          kalender_typ?: string | null
          kalender_url?: string | null
          kunde_id: string
          meeting_kommunikation?: Json | null
          meeting_revision?: number
          prioritaet?: string | null
          teilnehmer?: string | null
          uhrzeit?: string | null
          von?: string | null
          zoom_link?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          angepinnt_am?: string | null
          angepinnt_von?: string | null
          art?: string
          benutzer_id?: string | null
          beschreibung?: string | null
          datum?: string | null
          dauer?: string | null
          details?: string | null
          ergebnis?: string | null
          erledigt_am?: string | null
          faellig_am?: string | null
          id?: string
          kalender_event_id?: string | null
          kalender_typ?: string | null
          kalender_url?: string | null
          kunde_id?: string
          meeting_kommunikation?: Json | null
          meeting_revision?: number
          prioritaet?: string | null
          teilnehmer?: string | null
          uhrzeit?: string | null
          von?: string | null
          zoom_link?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: []
      }
      analysetool_ereignisse: {
        Row: {
          berater_id: string | null
          erstellt_am: string
          id: string
          kampagne: string | null
          typ: string
          werkzeug: string
        }
        Insert: {
          berater_id?: string | null
          erstellt_am?: string
          id?: string
          kampagne?: string | null
          typ: string
          werkzeug?: string
        }
        Update: {
          berater_id?: string | null
          erstellt_am?: string
          id?: string
          kampagne?: string | null
          typ?: string
          werkzeug?: string
        }
        Relationships: []
      }
      anrufe: {
        Row: {
          angerufen_am: string
          benutzer_id: string
          dauer_sekunden: number | null
          ergebnis: Database["public"]["Enums"]["anruf_ergebnis"] | null
          erstellt_am: string
          id: string
          kontakt_id: string | null
          notizen: string | null
          telefon: string | null
        }
        Insert: {
          angerufen_am?: string
          benutzer_id: string
          dauer_sekunden?: number | null
          ergebnis?: Database["public"]["Enums"]["anruf_ergebnis"] | null
          erstellt_am?: string
          id?: string
          kontakt_id?: string | null
          notizen?: string | null
          telefon?: string | null
        }
        Update: {
          angerufen_am?: string
          benutzer_id?: string
          dauer_sekunden?: number | null
          ergebnis?: Database["public"]["Enums"]["anruf_ergebnis"] | null
          erstellt_am?: string
          id?: string
          kontakt_id?: string | null
          notizen?: string | null
          telefon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anrufe_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          aktualisiert_am: string | null
          id: string
          schluessel: string
          wert: Json | null
        }
        Insert: {
          aktualisiert_am?: string | null
          id?: string
          schluessel: string
          wert?: Json | null
        }
        Update: {
          aktualisiert_am?: string | null
          id?: string
          schluessel?: string
          wert?: Json | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          actor_email: string | null
          entity: string
          entity_id: string | null
          erstellt_am: string
          id: string
          meta: Json | null
          nachher: Json | null
          vorher: Json | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_email?: string | null
          entity: string
          entity_id?: string | null
          erstellt_am?: string
          id?: string
          meta?: Json | null
          nachher?: Json | null
          vorher?: Json | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_email?: string | null
          entity?: string
          entity_id?: string | null
          erstellt_am?: string
          id?: string
          meta?: Json | null
          nachher?: Json | null
          vorher?: Json | null
        }
        Relationships: []
      }
      audit_log_archive: {
        Row: {
          action: string | null
          actor: string | null
          actor_email: string | null
          archived_at: string
          entity: string | null
          entity_id: string | null
          erstellt_am: string
          id: string
          meta: Json | null
          nachher: Json | null
          vorher: Json | null
        }
        Insert: {
          action?: string | null
          actor?: string | null
          actor_email?: string | null
          archived_at?: string
          entity?: string | null
          entity_id?: string | null
          erstellt_am: string
          id: string
          meta?: Json | null
          nachher?: Json | null
          vorher?: Json | null
        }
        Update: {
          action?: string | null
          actor?: string | null
          actor_email?: string | null
          archived_at?: string
          entity?: string | null
          entity_id?: string | null
          erstellt_am?: string
          id?: string
          meta?: Json | null
          nachher?: Json | null
          vorher?: Json | null
        }
        Relationships: []
      }
      aufgaben: {
        Row: {
          aktualisiert_am: string
          ausloeser_schluessel: string | null
          benutzer_id: string
          beschreibung: string | null
          erledigt_am: string | null
          erstellt_am: string
          erstellt_von_name: string | null
          faellig_am: string | null
          id: string
          investment_id: string | null
          kontakt_id: string | null
          meeting_aktivitaet_id: string | null
          prioritaet: Database["public"]["Enums"]["aufgabe_prioritaet"]
          status: Database["public"]["Enums"]["aufgabe_status"]
          titel: string
          typ: Database["public"]["Enums"]["aufgabe_typ"]
          uhrzeit: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          aktualisiert_am?: string
          ausloeser_schluessel?: string | null
          benutzer_id: string
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string
          erstellt_von_name?: string | null
          faellig_am?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meeting_aktivitaet_id?: string | null
          prioritaet?: Database["public"]["Enums"]["aufgabe_prioritaet"]
          status?: Database["public"]["Enums"]["aufgabe_status"]
          titel: string
          typ?: Database["public"]["Enums"]["aufgabe_typ"]
          uhrzeit?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          aktualisiert_am?: string
          ausloeser_schluessel?: string | null
          benutzer_id?: string
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string
          erstellt_von_name?: string | null
          faellig_am?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meeting_aktivitaet_id?: string | null
          prioritaet?: Database["public"]["Enums"]["aufgabe_prioritaet"]
          status?: Database["public"]["Enums"]["aufgabe_status"]
          titel?: string
          typ?: Database["public"]["Enums"]["aufgabe_typ"]
          uhrzeit?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aufgaben_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgaben_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgaben_meeting_aktivitaet_id_fkey"
            columns: ["meeting_aktivitaet_id"]
            isOneToOne: false
            referencedRelation: "aktivitaeten"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_lockouts: {
        Row: {
          email: string
          failed_attempts: number
          first_failed_at: string | null
          last_failed_at: string | null
          last_ip: string | null
          locked_until: string | null
          lockout_count: number
          updated_at: string
        }
        Insert: {
          email: string
          failed_attempts?: number
          first_failed_at?: string | null
          last_failed_at?: string | null
          last_ip?: string | null
          locked_until?: string | null
          lockout_count?: number
          updated_at?: string
        }
        Update: {
          email?: string
          failed_attempts?: number
          first_failed_at?: string | null
          last_failed_at?: string | null
          last_ip?: string | null
          locked_until?: string | null
          lockout_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      benachrichtigungen: {
        Row: {
          absender_id: string | null
          benutzer_id: string
          erstellt_am: string
          gelesen: boolean
          id: string
          link: string | null
          meta: Json | null
          nachricht: string | null
          titel: string
          vertretung_fuer: string | null
          ziel_rolle: string | null
        }
        Insert: {
          absender_id?: string | null
          benutzer_id: string
          erstellt_am?: string
          gelesen?: boolean
          id?: string
          link?: string | null
          meta?: Json | null
          nachricht?: string | null
          titel: string
          vertretung_fuer?: string | null
          ziel_rolle?: string | null
        }
        Update: {
          absender_id?: string | null
          benutzer_id?: string
          erstellt_am?: string
          gelesen?: boolean
          id?: string
          link?: string | null
          meta?: Json | null
          nachricht?: string | null
          titel?: string
          vertretung_fuer?: string | null
          ziel_rolle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benachrichtigungen_vertretung_fuer_fkey"
            columns: ["vertretung_fuer"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benachrichtigungen_vertretung_fuer_fkey"
            columns: ["vertretung_fuer"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      betriebskosten: {
        Row: {
          benutzer_id: string | null
          erstellt_am: string | null
          gesamtkosten: number | null
          id: string
          jahr: number | null
          meta: Json | null
          mieter_name: string | null
          nachzahlung: number | null
          objekt: string | null
          positionen: Json | null
          status: string | null
          vorauszahlung: number | null
          wohnung: string | null
        }
        Insert: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          gesamtkosten?: number | null
          id?: string
          jahr?: number | null
          meta?: Json | null
          mieter_name?: string | null
          nachzahlung?: number | null
          objekt?: string | null
          positionen?: Json | null
          status?: string | null
          vorauszahlung?: number | null
          wohnung?: string | null
        }
        Update: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          gesamtkosten?: number | null
          id?: string
          jahr?: number | null
          meta?: Json | null
          mieter_name?: string | null
          nachzahlung?: number | null
          objekt?: string | null
          positionen?: Json | null
          status?: string | null
          vorauszahlung?: number | null
          wohnung?: string | null
        }
        Relationships: []
      }
      bewerber_abmeldung: {
        Row: {
          bewerbung_id: string
          erstellt_am: string
          expires_at: string
          grund: string | null
          id: string
          status: string
          token: string
          verwendet_am: string | null
          vorname: string
        }
        Insert: {
          bewerbung_id: string
          erstellt_am?: string
          expires_at?: string
          grund?: string | null
          id?: string
          status?: string
          token?: string
          verwendet_am?: string | null
          vorname?: string
        }
        Update: {
          bewerbung_id?: string
          erstellt_am?: string
          expires_at?: string
          grund?: string | null
          id?: string
          status?: string
          token?: string
          verwendet_am?: string | null
          vorname?: string
        }
        Relationships: [
          {
            foreignKeyName: "bewerber_abmeldung_bewerbung_id_fkey"
            columns: ["bewerbung_id"]
            isOneToOne: false
            referencedRelation: "bewerbungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bewerber_formular: {
        Row: {
          antworten: Json
          bewerbung_id: string
          created_at: string
          created_by: string | null
          eingereicht_am: string | null
          einwilligung_am: string | null
          einwilligung_version: string | null
          erinnerung_am: string | null
          expires_at: string
          id: string
          status: string
          token: string
          vorname: string
        }
        Insert: {
          antworten?: Json
          bewerbung_id: string
          created_at?: string
          created_by?: string | null
          eingereicht_am?: string | null
          einwilligung_am?: string | null
          einwilligung_version?: string | null
          erinnerung_am?: string | null
          expires_at?: string
          id?: string
          status?: string
          token?: string
          vorname?: string
        }
        Update: {
          antworten?: Json
          bewerbung_id?: string
          created_at?: string
          created_by?: string | null
          eingereicht_am?: string | null
          einwilligung_am?: string | null
          einwilligung_version?: string | null
          erinnerung_am?: string | null
          expires_at?: string
          id?: string
          status?: string
          token?: string
          vorname?: string
        }
        Relationships: [
          {
            foreignKeyName: "bewerber_formular_bewerbung_id_fkey"
            columns: ["bewerbung_id"]
            isOneToOne: false
            referencedRelation: "bewerbungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bewerber_mail_tracking: {
        Row: {
          bewerber_id: string
          clicked_at: string | null
          created_at: string
          kind: string
          opened_at: string | null
          opened_source: string | null
          paket: string | null
          paket_titel: string | null
          sent_at: string
          token: string
          tracked: boolean
        }
        Insert: {
          bewerber_id: string
          clicked_at?: string | null
          created_at?: string
          kind: string
          opened_at?: string | null
          opened_source?: string | null
          paket?: string | null
          paket_titel?: string | null
          sent_at?: string
          token?: string
          tracked?: boolean
        }
        Update: {
          bewerber_id?: string
          clicked_at?: string | null
          created_at?: string
          kind?: string
          opened_at?: string | null
          opened_source?: string | null
          paket?: string | null
          paket_titel?: string | null
          sent_at?: string
          token?: string
          tracked?: boolean
        }
        Relationships: []
      }
      bewerber_seite: {
        Row: {
          bewerbung_id: string
          erstellt_am: string
          expires_at: string
          id: string
          letzter_zugriff_am: string | null
          token: string
        }
        Insert: {
          bewerbung_id: string
          erstellt_am?: string
          expires_at?: string
          id?: string
          letzter_zugriff_am?: string | null
          token?: string
        }
        Update: {
          bewerbung_id?: string
          erstellt_am?: string
          expires_at?: string
          id?: string
          letzter_zugriff_am?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bewerber_seite_bewerbung_id_fkey"
            columns: ["bewerbung_id"]
            isOneToOne: true
            referencedRelation: "bewerbungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bewerbungen: {
        Row: {
          benutzer_id: string | null
          email: string | null
          erstellt_am: string | null
          gekuendigt_am: string | null
          id: string
          meta: Json | null
          nachname: string
          nachricht: string | null
          notizen: string | null
          position: string | null
          status: string | null
          telefon: string | null
          vorname: string
        }
        Insert: {
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          gekuendigt_am?: string | null
          id?: string
          meta?: Json | null
          nachname: string
          nachricht?: string | null
          notizen?: string | null
          position?: string | null
          status?: string | null
          telefon?: string | null
          vorname: string
        }
        Update: {
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          gekuendigt_am?: string | null
          id?: string
          meta?: Json | null
          nachname?: string
          nachricht?: string | null
          notizen?: string | null
          position?: string | null
          status?: string | null
          telefon?: string | null
          vorname?: string
        }
        Relationships: []
      }
      buchung_einstellungen: {
        Row: {
          begruessung: string | null
          created_at: string
          hinweis: string | null
          meta: Json
          mitarbeiter_id: string
          offen_aktiv: boolean
          slug: string | null
          updated_at: string
          zeitzone: string
        }
        Insert: {
          begruessung?: string | null
          created_at?: string
          hinweis?: string | null
          meta?: Json
          mitarbeiter_id: string
          offen_aktiv?: boolean
          slug?: string | null
          updated_at?: string
          zeitzone?: string
        }
        Update: {
          begruessung?: string | null
          created_at?: string
          hinweis?: string | null
          meta?: Json
          mitarbeiter_id?: string
          offen_aktiv?: boolean
          slug?: string | null
          updated_at?: string
          zeitzone?: string
        }
        Relationships: []
      }
      buchung_links: {
        Row: {
          aktiv: boolean
          created_at: string
          einmalig: boolean
          gueltig_bis: string | null
          id: string
          investment_id: string | null
          kontakt_id: string
          kontakt_snapshot: Json
          mitarbeiter_id: string
          terminart_id: string | null
          token: string
          updated_at: string
          ziel: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          einmalig?: boolean
          gueltig_bis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id: string
          kontakt_snapshot?: Json
          mitarbeiter_id: string
          terminart_id?: string | null
          token: string
          updated_at?: string
          ziel?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          einmalig?: boolean
          gueltig_bis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string
          kontakt_snapshot?: Json
          mitarbeiter_id?: string
          terminart_id?: string | null
          token?: string
          updated_at?: string
          ziel?: string
        }
        Relationships: [
          {
            foreignKeyName: "buchung_links_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buchung_links_terminart_id_fkey"
            columns: ["terminart_id"]
            isOneToOne: false
            referencedRelation: "buchung_terminarten"
            referencedColumns: ["id"]
          },
        ]
      }
      buchung_terminarten: {
        Row: {
          aktiv: boolean
          anlass: string
          beschreibung: string | null
          bezeichnung: string
          created_at: string
          dauer_minuten: number
          id: string
          meta: Json
          mitarbeiter_id: string
          oeffentlich: boolean
          puffer_nach_minuten: number
          puffer_vor_minuten: number
          raster_minuten: number
          sortierung: number
          updated_at: string
          vorausschau_tage: number
          vorlauf_minuten: number
        }
        Insert: {
          aktiv?: boolean
          anlass?: string
          beschreibung?: string | null
          bezeichnung: string
          created_at?: string
          dauer_minuten?: number
          id?: string
          meta?: Json
          mitarbeiter_id: string
          oeffentlich?: boolean
          puffer_nach_minuten?: number
          puffer_vor_minuten?: number
          raster_minuten?: number
          sortierung?: number
          updated_at?: string
          vorausschau_tage?: number
          vorlauf_minuten?: number
        }
        Update: {
          aktiv?: boolean
          anlass?: string
          beschreibung?: string | null
          bezeichnung?: string
          created_at?: string
          dauer_minuten?: number
          id?: string
          meta?: Json
          mitarbeiter_id?: string
          oeffentlich?: boolean
          puffer_nach_minuten?: number
          puffer_vor_minuten?: number
          raster_minuten?: number
          sortierung?: number
          updated_at?: string
          vorausschau_tage?: number
          vorlauf_minuten?: number
        }
        Relationships: []
      }
      buchung_verfuegbarkeiten: {
        Row: {
          bemerkung: string | null
          bis: string | null
          created_at: string
          datum: string | null
          geschlossen: boolean
          id: string
          mitarbeiter_id: string
          updated_at: string
          von: string | null
          wochentag: number | null
        }
        Insert: {
          bemerkung?: string | null
          bis?: string | null
          created_at?: string
          datum?: string | null
          geschlossen?: boolean
          id?: string
          mitarbeiter_id: string
          updated_at?: string
          von?: string | null
          wochentag?: number | null
        }
        Update: {
          bemerkung?: string | null
          bis?: string | null
          created_at?: string
          datum?: string | null
          geschlossen?: boolean
          id?: string
          mitarbeiter_id?: string
          updated_at?: string
          von?: string | null
          wochentag?: number | null
        }
        Relationships: []
      }
      buchungen: {
        Row: {
          abgesagt_at: string | null
          absage_grund: string | null
          absage_token: string
          aktivitaet_id: string | null
          anlass: string
          begleitung: Json | null
          bewerbung_id: string | null
          bezeichnung: string | null
          created_at: string
          dauer_minuten: number
          email: string
          ende_at: string
          id: string
          kontakt_id: string | null
          link_id: string | null
          meta: Json
          mitarbeiter_id: string
          nachricht: string | null
          name: string
          puffer_nach_minuten: number
          puffer_vor_minuten: number
          quelle: string
          start_at: string
          status: string
          telefon: string | null
          terminart_id: string | null
          updated_at: string
          videoraum_id: string | null
        }
        Insert: {
          abgesagt_at?: string | null
          absage_grund?: string | null
          absage_token: string
          aktivitaet_id?: string | null
          anlass?: string
          begleitung?: Json | null
          bewerbung_id?: string | null
          bezeichnung?: string | null
          created_at?: string
          dauer_minuten: number
          email: string
          ende_at: string
          id?: string
          kontakt_id?: string | null
          link_id?: string | null
          meta?: Json
          mitarbeiter_id: string
          nachricht?: string | null
          name: string
          puffer_nach_minuten?: number
          puffer_vor_minuten?: number
          quelle?: string
          start_at: string
          status?: string
          telefon?: string | null
          terminart_id?: string | null
          updated_at?: string
          videoraum_id?: string | null
        }
        Update: {
          abgesagt_at?: string | null
          absage_grund?: string | null
          absage_token?: string
          aktivitaet_id?: string | null
          anlass?: string
          begleitung?: Json | null
          bewerbung_id?: string | null
          bezeichnung?: string | null
          created_at?: string
          dauer_minuten?: number
          email?: string
          ende_at?: string
          id?: string
          kontakt_id?: string | null
          link_id?: string | null
          meta?: Json
          mitarbeiter_id?: string
          nachricht?: string | null
          name?: string
          puffer_nach_minuten?: number
          puffer_vor_minuten?: number
          quelle?: string
          start_at?: string
          status?: string
          telefon?: string | null
          terminart_id?: string | null
          updated_at?: string
          videoraum_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buchungen_bewerbung_id_fkey"
            columns: ["bewerbung_id"]
            isOneToOne: false
            referencedRelation: "bewerbungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buchungen_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "buchung_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buchungen_terminart_id_fkey"
            columns: ["terminart_id"]
            isOneToOne: false
            referencedRelation: "buchung_terminarten"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_gruppen: {
        Row: {
          aktualisiert_am: string
          erstellt_am: string
          erstellt_von: string
          id: string
          meta: Json | null
          name: string
          typ: string
        }
        Insert: {
          aktualisiert_am?: string
          erstellt_am?: string
          erstellt_von: string
          id?: string
          meta?: Json | null
          name: string
          typ?: string
        }
        Update: {
          aktualisiert_am?: string
          erstellt_am?: string
          erstellt_von?: string
          id?: string
          meta?: Json | null
          name?: string
          typ?: string
        }
        Relationships: []
      }
      chat_nachrichten: {
        Row: {
          absender_id: string
          chat_id: string
          gelesen: boolean | null
          gelesen_von: Json | null
          gesendet_am: string
          id: string
          inhalt: string
          meta: Json | null
        }
        Insert: {
          absender_id: string
          chat_id: string
          gelesen?: boolean | null
          gelesen_von?: Json | null
          gesendet_am?: string
          id?: string
          inhalt: string
          meta?: Json | null
        }
        Update: {
          absender_id?: string
          chat_id?: string
          gelesen?: boolean | null
          gelesen_von?: Json | null
          gesendet_am?: string
          id?: string
          inhalt?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_nachrichten_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chat_gruppen"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_teilnehmer: {
        Row: {
          beigetreten_am: string
          benutzer_id: string
          chat_id: string
          id: string
          meta: Json | null
        }
        Insert: {
          beigetreten_am?: string
          benutzer_id: string
          chat_id: string
          id?: string
          meta?: Json | null
        }
        Update: {
          beigetreten_am?: string
          benutzer_id?: string
          chat_id?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_teilnehmer_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chat_gruppen"
            referencedColumns: ["id"]
          },
        ]
      }
      dienstleister: {
        Row: {
          adresse: string | null
          benutzer_id: string | null
          bewertung: number | null
          email: string | null
          erstellt_am: string | null
          id: string
          kategorie: string | null
          meta: Json | null
          name: string
          notizen: string | null
          telefon: string | null
        }
        Insert: {
          adresse?: string | null
          benutzer_id?: string | null
          bewertung?: number | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          meta?: Json | null
          name: string
          notizen?: string | null
          telefon?: string | null
        }
        Update: {
          adresse?: string | null
          benutzer_id?: string | null
          bewertung?: number | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          meta?: Json | null
          name?: string
          notizen?: string | null
          telefon?: string | null
        }
        Relationships: []
      }
      dsgvo_deletion_log: {
        Row: {
          email_hash: string
          geloescht_am: string
          geloeschtvon: string | null
          geloeschtvon_name: string | null
          grund_referenz: string
          id: string
          kontakt_id: string
          name_hash: string
        }
        Insert: {
          email_hash: string
          geloescht_am?: string
          geloeschtvon?: string | null
          geloeschtvon_name?: string | null
          grund_referenz: string
          id?: string
          kontakt_id: string
          name_hash: string
        }
        Update: {
          email_hash?: string
          geloescht_am?: string
          geloeschtvon?: string | null
          geloeschtvon_name?: string | null
          grund_referenz?: string
          id?: string
          kontakt_id?: string
          name_hash?: string
        }
        Relationships: []
      }
      eigentuemer: {
        Row: {
          adresse: string | null
          benutzer_id: string | null
          email: string | null
          erstellt_am: string | null
          id: string
          meta: Json | null
          name: string
          notizen: string | null
          objekte: string[] | null
          telefon: string | null
        }
        Insert: {
          adresse?: string | null
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          name: string
          notizen?: string | null
          objekte?: string[] | null
          telefon?: string | null
        }
        Update: {
          adresse?: string | null
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          name?: string
          notizen?: string | null
          objekte?: string[] | null
          telefon?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          absender_email: string | null
          absender_name: string | null
          benutzer_id: string
          betreff: string
          empfangen_am: string
          erstellt_am: string
          gelesen: boolean
          id: string
          inhalt: string | null
          kontakt_id: string | null
          markiert: boolean
          ordner: Database["public"]["Enums"]["email_ordner"]
          vorschau: string | null
        }
        Insert: {
          absender_email?: string | null
          absender_name?: string | null
          benutzer_id: string
          betreff: string
          empfangen_am?: string
          erstellt_am?: string
          gelesen?: boolean
          id?: string
          inhalt?: string | null
          kontakt_id?: string | null
          markiert?: boolean
          ordner?: Database["public"]["Enums"]["email_ordner"]
          vorschau?: string | null
        }
        Update: {
          absender_email?: string | null
          absender_name?: string | null
          benutzer_id?: string
          betreff?: string
          empfangen_am?: string
          erstellt_am?: string
          gelesen?: boolean
          id?: string
          inhalt?: string | null
          kontakt_id?: string | null
          markiert?: boolean
          ordner?: Database["public"]["Enums"]["email_ordner"]
          vorschau?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      empfehlungen: {
        Row: {
          benutzer_id: string | null
          empfohlen_email: string | null
          empfohlen_name: string | null
          empfohlen_telefon: string | null
          empfohlen_von: string | null
          erstellt_am: string | null
          id: string
          kontakt_id: string | null
          meta: Json | null
          notizen: string | null
          provision: number | null
          status: string | null
        }
        Insert: {
          benutzer_id?: string | null
          empfohlen_email?: string | null
          empfohlen_name?: string | null
          empfohlen_telefon?: string | null
          empfohlen_von?: string | null
          erstellt_am?: string | null
          id?: string
          kontakt_id?: string | null
          meta?: Json | null
          notizen?: string | null
          provision?: number | null
          status?: string | null
        }
        Update: {
          benutzer_id?: string | null
          empfohlen_email?: string | null
          empfohlen_name?: string | null
          empfohlen_telefon?: string | null
          empfohlen_von?: string | null
          erstellt_am?: string | null
          id?: string
          kontakt_id?: string | null
          meta?: Json | null
          notizen?: string | null
          provision?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empfehlungen_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      empfehlungsprogramme: {
        Row: {
          aktiv: boolean | null
          benutzer_id: string | null
          beschreibung: string | null
          erstellt_am: string | null
          id: string
          meta: Json | null
          name: string
          praemie: string | null
        }
        Insert: {
          aktiv?: boolean | null
          benutzer_id?: string | null
          beschreibung?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          name: string
          praemie?: string | null
        }
        Update: {
          aktiv?: boolean | null
          benutzer_id?: string | null
          beschreibung?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          name?: string
          praemie?: string | null
        }
        Relationships: []
      }
      externe_investments: {
        Row: {
          adresse: string | null
          afa_satz_prozent: number | null
          aktualisiert_am: string
          baujahr: number | null
          bezeichnung: string
          darlehenssumme: number | null
          dokumente: Json | null
          erstellt_am: string
          gebaeude_anteil_prozent: number | null
          grundsteuer_jahr: number | null
          hausgeld: number | null
          hausgeld_nicht_umlage_monat: number | null
          id: string
          kaufdatum: string | null
          kaufpreis: number | null
          meta: Json | null
          mieteinnahmen_kalt: number | null
          mieteinnahmen_warm: number | null
          miteigentumsanteil_prozent: number | null
          monatliche_rate: number | null
          nebenkosten: number | null
          notizen: string | null
          objekttyp: string | null
          offene_tilgung: number | null
          ort: string | null
          plz: string | null
          ruecklagen: number | null
          umlagen_monat: number | null
          user_id: string
          versicherung_jahr: number | null
          verwalter: string | null
          verwaltungskosten_jahr: number | null
          wohnflaeche: number | null
          zinssatz: number | null
        }
        Insert: {
          adresse?: string | null
          afa_satz_prozent?: number | null
          aktualisiert_am?: string
          baujahr?: number | null
          bezeichnung: string
          darlehenssumme?: number | null
          dokumente?: Json | null
          erstellt_am?: string
          gebaeude_anteil_prozent?: number | null
          grundsteuer_jahr?: number | null
          hausgeld?: number | null
          hausgeld_nicht_umlage_monat?: number | null
          id?: string
          kaufdatum?: string | null
          kaufpreis?: number | null
          meta?: Json | null
          mieteinnahmen_kalt?: number | null
          mieteinnahmen_warm?: number | null
          miteigentumsanteil_prozent?: number | null
          monatliche_rate?: number | null
          nebenkosten?: number | null
          notizen?: string | null
          objekttyp?: string | null
          offene_tilgung?: number | null
          ort?: string | null
          plz?: string | null
          ruecklagen?: number | null
          umlagen_monat?: number | null
          user_id: string
          versicherung_jahr?: number | null
          verwalter?: string | null
          verwaltungskosten_jahr?: number | null
          wohnflaeche?: number | null
          zinssatz?: number | null
        }
        Update: {
          adresse?: string | null
          afa_satz_prozent?: number | null
          aktualisiert_am?: string
          baujahr?: number | null
          bezeichnung?: string
          darlehenssumme?: number | null
          dokumente?: Json | null
          erstellt_am?: string
          gebaeude_anteil_prozent?: number | null
          grundsteuer_jahr?: number | null
          hausgeld?: number | null
          hausgeld_nicht_umlage_monat?: number | null
          id?: string
          kaufdatum?: string | null
          kaufpreis?: number | null
          meta?: Json | null
          mieteinnahmen_kalt?: number | null
          mieteinnahmen_warm?: number | null
          miteigentumsanteil_prozent?: number | null
          monatliche_rate?: number | null
          nebenkosten?: number | null
          notizen?: string | null
          objekttyp?: string | null
          offene_tilgung?: number | null
          ort?: string | null
          plz?: string | null
          ruecklagen?: number | null
          umlagen_monat?: number | null
          user_id?: string
          versicherung_jahr?: number | null
          verwalter?: string | null
          verwaltungskosten_jahr?: number | null
          wohnflaeche?: number | null
          zinssatz?: number | null
        }
        Relationships: []
      }
      finanzierungen: {
        Row: {
          aktualisiert_am: string | null
          akzeptiertes_angebot_id: string | null
          angebote: Json | null
          erstellt_am: string | null
          id: string
          kunde_id: string
          phase: string | null
        }
        Insert: {
          aktualisiert_am?: string | null
          akzeptiertes_angebot_id?: string | null
          angebote?: Json | null
          erstellt_am?: string | null
          id?: string
          kunde_id: string
          phase?: string | null
        }
        Update: {
          aktualisiert_am?: string | null
          akzeptiertes_angebot_id?: string | null
          angebote?: Json | null
          erstellt_am?: string | null
          id?: string
          kunde_id?: string
          phase?: string | null
        }
        Relationships: []
      }
      follow_up_ketten: {
        Row: {
          aktiv: boolean | null
          benutzer_id: string | null
          erstellt_am: string | null
          id: string
          name: string
          pipeline_stufe: string | null
          schritte: Json | null
        }
        Insert: {
          aktiv?: boolean | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          name: string
          pipeline_stufe?: string | null
          schritte?: Json | null
        }
        Update: {
          aktiv?: boolean | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          name?: string
          pipeline_stufe?: string | null
          schritte?: Json | null
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          automatisch: boolean | null
          benutzer_id: string | null
          berater: string | null
          beschreibung: string | null
          erledigt_am: string | null
          erstellt_am: string | null
          faellig_am: string | null
          id: string
          kunde_id: string
          kunde_name: string | null
          pipeline_stufe: string | null
          prioritaet: string | null
          status: string | null
          titel: string
          typ: string | null
        }
        Insert: {
          automatisch?: boolean | null
          benutzer_id?: string | null
          berater?: string | null
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string | null
          faellig_am?: string | null
          id?: string
          kunde_id: string
          kunde_name?: string | null
          pipeline_stufe?: string | null
          prioritaet?: string | null
          status?: string | null
          titel: string
          typ?: string | null
        }
        Update: {
          automatisch?: boolean | null
          benutzer_id?: string | null
          berater?: string | null
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string | null
          faellig_am?: string | null
          id?: string
          kunde_id?: string
          kunde_name?: string | null
          pipeline_stufe?: string | null
          prioritaet?: string | null
          status?: string | null
          titel?: string
          typ?: string | null
        }
        Relationships: []
      }
      fristen: {
        Row: {
          benutzer_id: string | null
          beschreibung: string | null
          erinnerung_tage: number | null
          erstellt_am: string | null
          faellig_am: string | null
          id: string
          kategorie: string | null
          objekt: string | null
          status: string | null
          titel: string
        }
        Insert: {
          benutzer_id?: string | null
          beschreibung?: string | null
          erinnerung_tage?: number | null
          erstellt_am?: string | null
          faellig_am?: string | null
          id?: string
          kategorie?: string | null
          objekt?: string | null
          status?: string | null
          titel: string
        }
        Update: {
          benutzer_id?: string | null
          beschreibung?: string | null
          erinnerung_tage?: number | null
          erstellt_am?: string | null
          faellig_am?: string | null
          id?: string
          kategorie?: string | null
          objekt?: string | null
          status?: string | null
          titel?: string
        }
        Relationships: []
      }
      gespraech_mitschriften: {
        Row: {
          aktivitaet_id: string | null
          beendet_at: string | null
          begonnen_at: string | null
          created_at: string
          dauer_sekunden: number
          gastgeber_id: string
          id: string
          investment_id: string | null
          kontakt_id: string | null
          meta: Json
          modell: string | null
          raum_id: string | null
          updated_at: string
          volltext: string
          zeilen: Json
          zusammenfassung: string
        }
        Insert: {
          aktivitaet_id?: string | null
          beendet_at?: string | null
          begonnen_at?: string | null
          created_at?: string
          dauer_sekunden?: number
          gastgeber_id: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meta?: Json
          modell?: string | null
          raum_id?: string | null
          updated_at?: string
          volltext?: string
          zeilen?: Json
          zusammenfassung?: string
        }
        Update: {
          aktivitaet_id?: string | null
          beendet_at?: string | null
          begonnen_at?: string | null
          created_at?: string
          dauer_sekunden?: number
          gastgeber_id?: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meta?: Json
          modell?: string | null
          raum_id?: string | null
          updated_at?: string
          volltext?: string
          zeilen?: Json
          zusammenfassung?: string
        }
        Relationships: [
          {
            foreignKeyName: "gespraech_mitschriften_raum_id_fkey"
            columns: ["raum_id"]
            isOneToOne: false
            referencedRelation: "videoraeume"
            referencedColumns: ["id"]
          },
        ]
      }
      handbuch_anforderungen: {
        Row: {
          antworten: Json
          ausgang: string
          berater_id: string | null
          erstellt_am: string
          geoeffnet_am: string | null
          geoeffnet_anzahl: number
          gueltig_bis: string
          id: string
          investment_id: string | null
          kontakt_id: string
          mail_gesendet_am: string | null
          nachname: string
          pdf_gespeichert_am: string | null
          sa_token: string | null
          token: string
          vorname: string
          zuletzt_geoeffnet_am: string | null
        }
        Insert: {
          antworten: Json
          ausgang: string
          berater_id?: string | null
          erstellt_am?: string
          geoeffnet_am?: string | null
          geoeffnet_anzahl?: number
          gueltig_bis?: string
          id?: string
          investment_id?: string | null
          kontakt_id: string
          mail_gesendet_am?: string | null
          nachname?: string
          pdf_gespeichert_am?: string | null
          sa_token?: string | null
          token: string
          vorname?: string
          zuletzt_geoeffnet_am?: string | null
        }
        Update: {
          antworten?: Json
          ausgang?: string
          berater_id?: string | null
          erstellt_am?: string
          geoeffnet_am?: string | null
          geoeffnet_anzahl?: number
          gueltig_bis?: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string
          mail_gesendet_am?: string | null
          nachname?: string
          pdf_gespeichert_am?: string | null
          sa_token?: string | null
          token?: string
          vorname?: string
          zuletzt_geoeffnet_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handbuch_anforderungen_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_tickets: {
        Row: {
          aktualisiert_am: string | null
          benutzer_id: string | null
          beschreibung: string | null
          erledigt_am: string | null
          erstellt_am: string | null
          id: string
          kategorie: string | null
          melder: string | null
          meta: Json | null
          objekt: string | null
          prioritaet: string | null
          status: string | null
          titel: string
          wohnung: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          aktualisiert_am?: string | null
          benutzer_id?: string | null
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          melder?: string | null
          meta?: Json | null
          objekt?: string | null
          prioritaet?: string | null
          status?: string | null
          titel: string
          wohnung?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          aktualisiert_am?: string | null
          benutzer_id?: string | null
          beschreibung?: string | null
          erledigt_am?: string | null
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          melder?: string | null
          meta?: Json | null
          objekt?: string | null
          prioritaet?: string | null
          status?: string | null
          titel?: string
          wohnung?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: []
      }
      investagon_import_details: {
        Row: {
          geladen_am: string
          roh: Json
          schluessel: string
          version: string
        }
        Insert: {
          geladen_am?: string
          roh: Json
          schluessel: string
          version: string
        }
        Update: {
          geladen_am?: string
          roh?: Json
          schluessel?: string
          version?: string
        }
        Relationships: []
      }
      investagon_intern: {
        Row: {
          aktualisiert_am: string
          felder: Json
          id: string
          objekt_id: string | null
          wohnung_id: string | null
        }
        Insert: {
          aktualisiert_am?: string
          felder?: Json
          id?: string
          objekt_id?: string | null
          wohnung_id?: string | null
        }
        Update: {
          aktualisiert_am?: string
          felder?: Json
          id?: string
          objekt_id?: string | null
          wohnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investagon_intern_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: true
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investagon_intern_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: true
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investagon_intern_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: true
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investagon_sync_queue: {
        Row: {
          aktualisiert_am: string
          art: string
          created_at: string
          ereignis: string
          id: string
          kennung: string
          letzter_fehler: string | null
          naechster_versuch: string
          nutzlast: Json
          status: string
          versuche: number
        }
        Insert: {
          aktualisiert_am?: string
          art: string
          created_at?: string
          ereignis: string
          id?: string
          kennung: string
          letzter_fehler?: string | null
          naechster_versuch?: string
          nutzlast?: Json
          status?: string
          versuche?: number
        }
        Update: {
          aktualisiert_am?: string
          art?: string
          created_at?: string
          ereignis?: string
          id?: string
          kennung?: string
          letzter_fehler?: string | null
          naechster_versuch?: string
          nutzlast?: Json
          status?: string
          versuche?: number
        }
        Relationships: []
      }
      investment_berechnungen: {
        Row: {
          eingabe: Json
          erstellt_am: string
          erstellt_von: string
          geaendert_am: string
          herkunft: Json | null
          id: string
          investment_id: string
          kennzahlen: Json
          knk: Json
          kontakt_id: string
          name: string
          unterlagen: Json | null
          wohnung_id: string | null
        }
        Insert: {
          eingabe?: Json
          erstellt_am?: string
          erstellt_von?: string
          geaendert_am?: string
          herkunft?: Json | null
          id?: string
          investment_id: string
          kennzahlen?: Json
          knk?: Json
          kontakt_id: string
          name: string
          unterlagen?: Json | null
          wohnung_id?: string | null
        }
        Update: {
          eingabe?: Json
          erstellt_am?: string
          erstellt_von?: string
          geaendert_am?: string
          herkunft?: Json | null
          id?: string
          investment_id?: string
          kennzahlen?: Json
          knk?: Json
          kontakt_id?: string
          name?: string
          unterlagen?: Json | null
          wohnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_berechnungen_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          benutzer_id: string | null
          erstellt_am: string | null
          id: string
          kaufdatum: string | null
          kaufpreis: number | null
          kunde_id: string
          meta: Json | null
          notizen: string | null
          objekt: string | null
          status: string | null
          wohnung: string | null
        }
        Insert: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          kaufdatum?: string | null
          kaufpreis?: number | null
          kunde_id: string
          meta?: Json | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Update: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          kaufdatum?: string | null
          kaufpreis?: number | null
          kunde_id?: string
          meta?: Json | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      karriere_stufen: {
        Row: {
          id: string
          legacy_aliase: string[]
          rate: number
          sortierung: number
          titel: string
        }
        Insert: {
          id: string
          legacy_aliase?: string[]
          rate: number
          sortierung: number
          titel: string
        }
        Update: {
          id?: string
          legacy_aliase?: string[]
          rate?: number
          sortierung?: number
          titel?: string
        }
        Relationships: []
      }
      kautionen: {
        Row: {
          benutzer_id: string | null
          betrag: number | null
          eingegangen_am: string | null
          erstellt_am: string | null
          id: string
          meta: Json | null
          mieter_name: string | null
          notizen: string | null
          objekt: string | null
          status: string | null
          wohnung: string | null
        }
        Insert: {
          benutzer_id?: string | null
          betrag?: number | null
          eingegangen_am?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          mieter_name?: string | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Update: {
          benutzer_id?: string | null
          betrag?: number | null
          eingegangen_am?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          mieter_name?: string | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Relationships: []
      }
      kennzahlen_tagesstand: {
        Row: {
          bereich: string
          erfasst_am: string
          id: string
          kennzahl: string
          stichtag: string
          wert: number
        }
        Insert: {
          bereich: string
          erfasst_am?: string
          id?: string
          kennzahl: string
          stichtag: string
          wert: number
        }
        Update: {
          bereich?: string
          erfasst_am?: string
          id?: string
          kennzahl?: string
          stichtag?: string
          wert?: number
        }
        Relationships: []
      }
      kommunikation: {
        Row: {
          absender: string | null
          benutzer_id: string | null
          betreff: string | null
          empfaenger: string | null
          erstellt_am: string | null
          id: string
          inhalt: string | null
          meta: Json | null
          objekt: string | null
          status: string | null
          typ: string | null
        }
        Insert: {
          absender?: string | null
          benutzer_id?: string | null
          betreff?: string | null
          empfaenger?: string | null
          erstellt_am?: string | null
          id?: string
          inhalt?: string | null
          meta?: Json | null
          objekt?: string | null
          status?: string | null
          typ?: string | null
        }
        Update: {
          absender?: string | null
          benutzer_id?: string | null
          betreff?: string | null
          empfaenger?: string | null
          erstellt_am?: string | null
          id?: string
          inhalt?: string | null
          meta?: Json | null
          objekt?: string | null
          status?: string | null
          typ?: string | null
        }
        Relationships: []
      }
      kontakt_view_log: {
        Row: {
          created_at: string
          feld: string
          id: string
          kontakt_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feld?: string
          id?: string
          kontakt_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          feld?: string
          id?: string
          kontakt_id?: string
          user_id?: string
        }
        Relationships: []
      }
      kontakte: {
        Row: {
          aktualisiert_am: string
          anrede: string | null
          archiviert: boolean | null
          berater: string | null
          budget: number | null
          email: string | null
          erstellt_am: string
          finanzierbarkeit: string | null
          firma: string | null
          geloescht: boolean | null
          geloescht_am: string | null
          geloescht_grund: string | null
          geloescht_von: string | null
          geloescht_von_name: string | null
          hausnummer: string | null
          id: string
          kaufpreis: number | null
          land: string | null
          meta: Json | null
          nachname: string
          notizen: string | null
          objekt: string | null
          ort: string | null
          plz: string | null
          position: string | null
          quelle: string | null
          status: Database["public"]["Enums"]["kontakt_status"]
          strasse: string | null
          telefon: string | null
          vorname: string
          zustaendig_id: string | null
        }
        Insert: {
          aktualisiert_am?: string
          anrede?: string | null
          archiviert?: boolean | null
          berater?: string | null
          budget?: number | null
          email?: string | null
          erstellt_am?: string
          finanzierbarkeit?: string | null
          firma?: string | null
          geloescht?: boolean | null
          geloescht_am?: string | null
          geloescht_grund?: string | null
          geloescht_von?: string | null
          geloescht_von_name?: string | null
          hausnummer?: string | null
          id?: string
          kaufpreis?: number | null
          land?: string | null
          meta?: Json | null
          nachname: string
          notizen?: string | null
          objekt?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          quelle?: string | null
          status?: Database["public"]["Enums"]["kontakt_status"]
          strasse?: string | null
          telefon?: string | null
          vorname: string
          zustaendig_id?: string | null
        }
        Update: {
          aktualisiert_am?: string
          anrede?: string | null
          archiviert?: boolean | null
          berater?: string | null
          budget?: number | null
          email?: string | null
          erstellt_am?: string
          finanzierbarkeit?: string | null
          firma?: string | null
          geloescht?: boolean | null
          geloescht_am?: string | null
          geloescht_grund?: string | null
          geloescht_von?: string | null
          geloescht_von_name?: string | null
          hausnummer?: string | null
          id?: string
          kaufpreis?: number | null
          land?: string | null
          meta?: Json | null
          nachname?: string
          notizen?: string | null
          objekt?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          quelle?: string | null
          status?: Database["public"]["Enums"]["kontakt_status"]
          strasse?: string | null
          telefon?: string | null
          vorname?: string
          zustaendig_id?: string | null
        }
        Relationships: []
      }
      kunde_dokumente: {
        Row: {
          aktualisiert_am: string
          erstellt_am: string
          erstellt_von: string | null
          groesse_bytes: number | null
          id: string
          investment_id: string | null
          kontakt_id: string
          mime_type: string | null
          name: string
          parent_id: string | null
          sort_order: number
          storage_path: string | null
          typ: string
        }
        Insert: {
          aktualisiert_am?: string
          erstellt_am?: string
          erstellt_von?: string | null
          groesse_bytes?: number | null
          id?: string
          investment_id?: string | null
          kontakt_id: string
          mime_type?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          storage_path?: string | null
          typ: string
        }
        Update: {
          aktualisiert_am?: string
          erstellt_am?: string
          erstellt_von?: string | null
          groesse_bytes?: number | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string
          mime_type?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          storage_path?: string | null
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "kunde_dokumente_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_dokumente_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_dokumente_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "kunde_dokumente"
            referencedColumns: ["id"]
          },
        ]
      }
      kunden_bewertungen: {
        Row: {
          berater_id: string | null
          berater_name: string | null
          bewertung_berater: number | null
          bewertung_gesamt: number
          bewertung_objekt: number | null
          bewertung_prozess: number | null
          erstellt_am: string
          id: string
          investment_id: string | null
          kommentar: string | null
          kunde_id: string
          weiterempfehlung: boolean | null
        }
        Insert: {
          berater_id?: string | null
          berater_name?: string | null
          bewertung_berater?: number | null
          bewertung_gesamt: number
          bewertung_objekt?: number | null
          bewertung_prozess?: number | null
          erstellt_am?: string
          id?: string
          investment_id?: string | null
          kommentar?: string | null
          kunde_id: string
          weiterempfehlung?: boolean | null
        }
        Update: {
          berater_id?: string | null
          berater_name?: string | null
          bewertung_berater?: number | null
          bewertung_gesamt?: number
          bewertung_objekt?: number | null
          bewertung_prozess?: number | null
          erstellt_am?: string
          id?: string
          investment_id?: string | null
          kommentar?: string | null
          kunde_id?: string
          weiterempfehlung?: boolean | null
        }
        Relationships: []
      }
      kundenportal_sperren: {
        Row: {
          entsperrt_am: string | null
          geaendert_am: string
          geaendert_von: string | null
          gesperrt: boolean
          gesperrt_am: string | null
          kontakt_id: string
        }
        Insert: {
          entsperrt_am?: string | null
          geaendert_am?: string
          geaendert_von?: string | null
          gesperrt?: boolean
          gesperrt_am?: string | null
          kontakt_id: string
        }
        Update: {
          entsperrt_am?: string | null
          geaendert_am?: string
          geaendert_von?: string | null
          gesperrt?: boolean
          gesperrt_am?: string | null
          kontakt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kundenportal_sperren_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: true
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_paket_zuweisungen: {
        Row: {
          ersatz_fuer: string | null
          id: string
          kontakt_id: string
          paket_id: string
          reklamationsgrund: string | null
          reklamiert_am: string | null
          reklamiert_von: string | null
          zugewiesen_am: string
          zugewiesen_von: string | null
        }
        Insert: {
          ersatz_fuer?: string | null
          id?: string
          kontakt_id: string
          paket_id: string
          reklamationsgrund?: string | null
          reklamiert_am?: string | null
          reklamiert_von?: string | null
          zugewiesen_am?: string
          zugewiesen_von?: string | null
        }
        Update: {
          ersatz_fuer?: string | null
          id?: string
          kontakt_id?: string
          paket_id?: string
          reklamationsgrund?: string | null
          reklamiert_am?: string | null
          reklamiert_von?: string | null
          zugewiesen_am?: string
          zugewiesen_von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_paket_zuweisungen_ersatz_fuer_fkey"
            columns: ["ersatz_fuer"]
            isOneToOne: true
            referencedRelation: "lead_paket_zuweisungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_paket_zuweisungen_paket_id_fkey"
            columns: ["paket_id"]
            isOneToOne: false
            referencedRelation: "lead_pakete"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_pakete: {
        Row: {
          anzahl: number
          bemerkung: string | null
          bewerbung_id: string | null
          bezahlt_am: string | null
          erstellt_am: string
          erstellt_von: string | null
          freigeschaltet_am: string | null
          geaendert_am: string | null
          geaendert_von: string | null
          id: string
          paketpreis: number
          partner_id: string
          status: string
        }
        Insert: {
          anzahl: number
          bemerkung?: string | null
          bewerbung_id?: string | null
          bezahlt_am?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          freigeschaltet_am?: string | null
          geaendert_am?: string | null
          geaendert_von?: string | null
          id?: string
          paketpreis: number
          partner_id: string
          status?: string
        }
        Update: {
          anzahl?: number
          bemerkung?: string | null
          bewerbung_id?: string | null
          bezahlt_am?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          freigeschaltet_am?: string | null
          geaendert_am?: string | null
          geaendert_von?: string | null
          id?: string
          paketpreis?: number
          partner_id?: string
          status?: string
        }
        Relationships: []
      }
      lexikon: {
        Row: {
          begriff: string
          beschreibung: string
          buchstabe: string
          erstellt_am: string
          id: string
        }
        Insert: {
          begriff: string
          beschreibung: string
          buchstabe: string
          erstellt_am?: string
          id?: string
        }
        Update: {
          begriff?: string
          beschreibung?: string
          buchstabe?: string
          erstellt_am?: string
          id?: string
        }
        Relationships: []
      }
      login_sessions: {
        Row: {
          aktiv: boolean
          alert_sent_at: string | null
          anomaly_level: string | null
          anomaly_reason: string | null
          browser: string | null
          city: string | null
          country: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          logged_in_at: string
          os: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aktiv?: boolean
          alert_sent_at?: string | null
          anomaly_level?: string | null
          anomaly_reason?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          logged_in_at?: string
          os?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aktiv?: boolean
          alert_sent_at?: string | null
          anomaly_level?: string | null
          anomaly_reason?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          logged_in_at?: string
          os?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lotse_auswertung_warteschlange: {
        Row: {
          eingetragen_am: string
          objekt_id: string
        }
        Insert: {
          eingetragen_am?: string
          objekt_id: string
        }
        Update: {
          eingetragen_am?: string
          objekt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotse_auswertung_warteschlange_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: true
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
        ]
      }
      lotse_kontingent: {
        Row: {
          anzahl: number
          tag: string
          user_id: string
        }
        Insert: {
          anzahl?: number
          tag: string
          user_id: string
        }
        Update: {
          anzahl?: number
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      lotse_nachrichten: {
        Row: {
          erstellt_am: string
          id: string
          inhalt: string
          objekt_id: string
          quellen: Json | null
          rolle: string
          user_id: string
          wohnung_id: string | null
        }
        Insert: {
          erstellt_am?: string
          id?: string
          inhalt: string
          objekt_id: string
          quellen?: Json | null
          rolle: string
          user_id: string
          wohnung_id?: string | null
        }
        Update: {
          erstellt_am?: string
          id?: string
          inhalt?: string
          objekt_id?: string
          quellen?: Json | null
          rolle?: string
          user_id?: string
          wohnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotse_nachrichten_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotse_nachrichten_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotse_nachrichten_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lotse_unterlagen_auszug: {
        Row: {
          ampel: string
          art: string | null
          auszug: Json
          dokument_name: string | null
          dokument_schluessel: string
          erstellt_am: string
          id: string
          modell: string | null
          objekt_id: string
          schema_fassung: number | null
          wohnung_id: string | null
        }
        Insert: {
          ampel: string
          art?: string | null
          auszug: Json
          dokument_name?: string | null
          dokument_schluessel: string
          erstellt_am?: string
          id?: string
          modell?: string | null
          objekt_id: string
          schema_fassung?: number | null
          wohnung_id?: string | null
        }
        Update: {
          ampel?: string
          art?: string | null
          auszug?: Json
          dokument_name?: string | null
          dokument_schluessel?: string
          erstellt_am?: string
          id?: string
          modell?: string | null
          objekt_id?: string
          schema_fassung?: number | null
          wohnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotse_unterlagen_auszug_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotse_unterlagen_auszug_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotse_unterlagen_auszug_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lotse_zustimmung: {
        Row: {
          akzeptiert_am: string
          fassung: number
          user_id: string
        }
        Insert: {
          akzeptiert_am?: string
          fassung: number
          user_id: string
        }
        Update: {
          akzeptiert_am?: string
          fassung?: number
          user_id?: string
        }
        Relationships: []
      }
      marktanalyse_quellen: {
        Row: {
          beschreibung: string | null
          created_at: string
          id: string
          kategorie: string | null
          lizenz: string | null
          name: string
          stand: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          id: string
          kategorie?: string | null
          lizenz?: string | null
          name: string
          stand?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          kategorie?: string | null
          lizenz?: string | null
          name?: string
          stand?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      meeting_mail_auftraege: {
        Row: {
          art: string
          benutzer_id: string
          created_at: string
          daten: Json
          email: string
          fehler: string | null
          id: string
          kontakt_id: string | null
          lease_id: string | null
          meeting_id: string
          naechster_versuch: string
          revision: number
          status: string
          versuche: number
        }
        Insert: {
          art: string
          benutzer_id: string
          created_at?: string
          daten: Json
          email: string
          fehler?: string | null
          id?: string
          kontakt_id?: string | null
          lease_id?: string | null
          meeting_id: string
          naechster_versuch?: string
          revision: number
          status?: string
          versuche?: number
        }
        Update: {
          art?: string
          benutzer_id?: string
          created_at?: string
          daten?: Json
          email?: string
          fehler?: string | null
          id?: string
          kontakt_id?: string | null
          lease_id?: string | null
          meeting_id?: string
          naechster_versuch?: string
          revision?: number
          status?: string
          versuche?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_mail_auftraege_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      meldungen: {
        Row: {
          bearbeitet_am: string | null
          bearbeitet_von: string | null
          beschreibung: string | null
          erstellt_am: string
          grund: string
          id: string
          melder_id: string
          referenz_id: string
          status: string
          typ: string
        }
        Insert: {
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          beschreibung?: string | null
          erstellt_am?: string
          grund: string
          id?: string
          melder_id: string
          referenz_id: string
          status?: string
          typ?: string
        }
        Update: {
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          beschreibung?: string | null
          erstellt_am?: string
          grund?: string
          id?: string
          melder_id?: string
          referenz_id?: string
          status?: string
          typ?: string
        }
        Relationships: []
      }
      meta_pixel_berechtigung: {
        Row: {
          bestandsschutz: boolean
          bestandsschutz_beendet_am: string | null
          erfasst_am: string
          gesperrt_am: string | null
          gesperrt_grund: string | null
          user_id: string
        }
        Insert: {
          bestandsschutz?: boolean
          bestandsschutz_beendet_am?: string | null
          erfasst_am?: string
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          user_id: string
        }
        Update: {
          bestandsschutz?: boolean
          bestandsschutz_beendet_am?: string | null
          erfasst_am?: string
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          used_ip: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_ip?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_ip?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mieter: {
        Row: {
          benutzer_id: string | null
          dokumente: Json | null
          einzug: string | null
          email: string | null
          erstellt_am: string | null
          id: string
          kaution: number | null
          meta: Json | null
          miete: number | null
          nachname: string
          nebenkosten: number | null
          notizen: string | null
          objekt: string | null
          status: string | null
          telefon: string | null
          vorname: string
          wohnung: string | null
        }
        Insert: {
          benutzer_id?: string | null
          dokumente?: Json | null
          einzug?: string | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          kaution?: number | null
          meta?: Json | null
          miete?: number | null
          nachname: string
          nebenkosten?: number | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          telefon?: string | null
          vorname: string
          wohnung?: string | null
        }
        Update: {
          benutzer_id?: string | null
          dokumente?: Json | null
          einzug?: string | null
          email?: string | null
          erstellt_am?: string | null
          id?: string
          kaution?: number | null
          meta?: Json | null
          miete?: number | null
          nachname?: string
          nebenkosten?: number | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          telefon?: string | null
          vorname?: string
          wohnung?: string | null
        }
        Relationships: []
      }
      mobile_scan_sessions: {
        Row: {
          block: string
          created_at: string
          expires_at: string
          id: string
          investment_id: string | null
          kontakt_id: string
          last_doc_typ: string | null
          last_upload_at: string | null
          meta: Json
          person: number
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          block?: string
          created_at?: string
          expires_at?: string
          id?: string
          investment_id?: string | null
          kontakt_id: string
          last_doc_typ?: string | null
          last_upload_at?: string | null
          meta?: Json
          person?: number
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          block?: string
          created_at?: string
          expires_at?: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string
          last_doc_typ?: string | null
          last_upload_at?: string | null
          meta?: Json
          person?: number
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      moderations_aktionen: {
        Row: {
          aktion: string
          benutzer_id: string
          erstellt_am: string
          erstellt_von: string
          grund: string
          id: string
          meldung_id: string | null
          notizen: string | null
        }
        Insert: {
          aktion?: string
          benutzer_id: string
          erstellt_am?: string
          erstellt_von: string
          grund: string
          id?: string
          meldung_id?: string | null
          notizen?: string | null
        }
        Update: {
          aktion?: string
          benutzer_id?: string
          erstellt_am?: string
          erstellt_von?: string
          grund?: string
          id?: string
          meldung_id?: string | null
          notizen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderations_aktionen_meldung_id_fkey"
            columns: ["meldung_id"]
            isOneToOne: false
            referencedRelation: "meldungen"
            referencedColumns: ["id"]
          },
        ]
      }
      nachtpruefung_befunde: {
        Row: {
          anzahl: number
          beispiele: Json
          bereich: string | null
          created_at: string
          id: string
          lauf_at: string
          meldung: string
          pruefung: string
          schwere: string
        }
        Insert: {
          anzahl?: number
          beispiele?: Json
          bereich?: string | null
          created_at?: string
          id?: string
          lauf_at?: string
          meldung: string
          pruefung: string
          schwere?: string
        }
        Update: {
          anzahl?: number
          beispiele?: Json
          bereich?: string | null
          created_at?: string
          id?: string
          lauf_at?: string
          meldung?: string
          pruefung?: string
          schwere?: string
        }
        Relationships: []
      }
      naechtliche_abmeldung_laeufe: {
        Row: {
          gelaufen_am: string
          lauf_tag: string
          sitzungen_30_tage: number
          sitzungen_nacht: number
        }
        Insert: {
          gelaufen_am?: string
          lauf_tag: string
          sitzungen_30_tage?: number
          sitzungen_nacht?: number
        }
        Update: {
          gelaufen_am?: string
          lauf_tag?: string
          sitzungen_30_tage?: number
          sitzungen_nacht?: number
        }
        Relationships: []
      }
      news: {
        Row: {
          aktualisiert_am: string
          autor_id: string
          erstellt_am: string
          id: string
          inhalt: string
          kategorie: Database["public"]["Enums"]["news_kategorie"]
          meta: Json | null
          titel: string
          veroeffentlicht_am: string
        }
        Insert: {
          aktualisiert_am?: string
          autor_id: string
          erstellt_am?: string
          id?: string
          inhalt: string
          kategorie?: Database["public"]["Enums"]["news_kategorie"]
          meta?: Json | null
          titel: string
          veroeffentlicht_am?: string
        }
        Update: {
          aktualisiert_am?: string
          autor_id?: string
          erstellt_am?: string
          id?: string
          inhalt?: string
          kategorie?: Database["public"]["Enums"]["news_kategorie"]
          meta?: Json | null
          titel?: string
          veroeffentlicht_am?: string
        }
        Relationships: []
      }
      objekt_bilder: {
        Row: {
          alt: string | null
          erstellt_am: string | null
          id: string
          objekt_id: string
          reihenfolge: number | null
          url: string
        }
        Insert: {
          alt?: string | null
          erstellt_am?: string | null
          id?: string
          objekt_id: string
          reihenfolge?: number | null
          url: string
        }
        Update: {
          alt?: string | null
          erstellt_am?: string | null
          id?: string
          objekt_id?: string
          reihenfolge?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "objekt_bilder_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
        ]
      }
      objekt_dokumente: {
        Row: {
          erstellt_am: string | null
          geschwaerzt: boolean
          id: string
          kategorie: string | null
          kunden_freigabe: string | null
          kunden_freigabe_am: string | null
          kunden_freigabe_von: string | null
          name: string
          objekt_id: string
          sichtbar: boolean | null
          typ: string | null
          url: string | null
        }
        Insert: {
          erstellt_am?: string | null
          geschwaerzt?: boolean
          id?: string
          kategorie?: string | null
          kunden_freigabe?: string | null
          kunden_freigabe_am?: string | null
          kunden_freigabe_von?: string | null
          name: string
          objekt_id: string
          sichtbar?: boolean | null
          typ?: string | null
          url?: string | null
        }
        Update: {
          erstellt_am?: string | null
          geschwaerzt?: boolean
          id?: string
          kategorie?: string | null
          kunden_freigabe?: string | null
          kunden_freigabe_am?: string | null
          kunden_freigabe_von?: string | null
          name?: string
          objekt_id?: string
          sichtbar?: boolean | null
          typ?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objekt_dokumente_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
        ]
      }
      objekt_einreichung_notizen: {
        Row: {
          einreichung_id: string
          erstellt_am: string
          id: string
          text: string
          verfasser_id: string | null
          verfasser_name: string | null
        }
        Insert: {
          einreichung_id: string
          erstellt_am?: string
          id?: string
          text: string
          verfasser_id?: string | null
          verfasser_name?: string | null
        }
        Update: {
          einreichung_id?: string
          erstellt_am?: string
          id?: string
          text?: string
          verfasser_id?: string | null
          verfasser_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objekt_einreichung_notizen_einreichung_id_fkey"
            columns: ["einreichung_id"]
            isOneToOne: false
            referencedRelation: "objekt_einreichungen"
            referencedColumns: ["id"]
          },
        ]
      }
      objekt_einreichungen: {
        Row: {
          ab_eingereicht_am: string | null
          akquisiteur_name: string | null
          aktualisiert_am: string
          bauamt: string | null
          bauamt_ansprechpartner: string | null
          baujahr: number | null
          benutzer_id: string
          bewertung: string | null
          bilder: Json | null
          details: Json
          eigentuemer_email: string | null
          eigentuemer_familienstand: string | null
          eigentuemer_geburtsdatum: string | null
          eigentuemer_hrb: string | null
          eigentuemer_iban: string | null
          eigentuemer_name: string | null
          eigentuemer_telefon: string | null
          einheiten: number | null
          erstellt_am: string
          hausnummer: string | null
          hausverwaltung: string | null
          id: string
          kaufpreis: number | null
          musterwohnung: string | null
          notartermin_tk: string | null
          notizen: string | null
          ort: string | null
          plz: string | null
          sanierungsangebot: string | null
          sonstige_infos: string | null
          status: string
          strasse: string | null
          titel: string
          uebernommen_am: string | null
          uebernommenes_objekt_id: string | null
          visualisierung: string | null
          whg_massnahmen: string | null
          wohnflaeche_gesamt: number | null
          wohnungen: Json | null
          zusaetzliche_infos_tk: string | null
          zustand_aussenfassade: string | null
          zustand_baeder: string | null
          zustand_boden: string | null
          zustand_dach: string | null
          zustand_elektrik: string | null
          zustand_fenster: string | null
          zustand_haustuer: string | null
          zustand_heizung: string | null
          zustand_treppenhaus: string | null
          zustand_waende: string | null
          zustand_wohnungstueren: string | null
        }
        Insert: {
          ab_eingereicht_am?: string | null
          akquisiteur_name?: string | null
          aktualisiert_am?: string
          bauamt?: string | null
          bauamt_ansprechpartner?: string | null
          baujahr?: number | null
          benutzer_id: string
          bewertung?: string | null
          bilder?: Json | null
          details?: Json
          eigentuemer_email?: string | null
          eigentuemer_familienstand?: string | null
          eigentuemer_geburtsdatum?: string | null
          eigentuemer_hrb?: string | null
          eigentuemer_iban?: string | null
          eigentuemer_name?: string | null
          eigentuemer_telefon?: string | null
          einheiten?: number | null
          erstellt_am?: string
          hausnummer?: string | null
          hausverwaltung?: string | null
          id?: string
          kaufpreis?: number | null
          musterwohnung?: string | null
          notartermin_tk?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          sanierungsangebot?: string | null
          sonstige_infos?: string | null
          status?: string
          strasse?: string | null
          titel?: string
          uebernommen_am?: string | null
          uebernommenes_objekt_id?: string | null
          visualisierung?: string | null
          whg_massnahmen?: string | null
          wohnflaeche_gesamt?: number | null
          wohnungen?: Json | null
          zusaetzliche_infos_tk?: string | null
          zustand_aussenfassade?: string | null
          zustand_baeder?: string | null
          zustand_boden?: string | null
          zustand_dach?: string | null
          zustand_elektrik?: string | null
          zustand_fenster?: string | null
          zustand_haustuer?: string | null
          zustand_heizung?: string | null
          zustand_treppenhaus?: string | null
          zustand_waende?: string | null
          zustand_wohnungstueren?: string | null
        }
        Update: {
          ab_eingereicht_am?: string | null
          akquisiteur_name?: string | null
          aktualisiert_am?: string
          bauamt?: string | null
          bauamt_ansprechpartner?: string | null
          baujahr?: number | null
          benutzer_id?: string
          bewertung?: string | null
          bilder?: Json | null
          details?: Json
          eigentuemer_email?: string | null
          eigentuemer_familienstand?: string | null
          eigentuemer_geburtsdatum?: string | null
          eigentuemer_hrb?: string | null
          eigentuemer_iban?: string | null
          eigentuemer_name?: string | null
          eigentuemer_telefon?: string | null
          einheiten?: number | null
          erstellt_am?: string
          hausnummer?: string | null
          hausverwaltung?: string | null
          id?: string
          kaufpreis?: number | null
          musterwohnung?: string | null
          notartermin_tk?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          sanierungsangebot?: string | null
          sonstige_infos?: string | null
          status?: string
          strasse?: string | null
          titel?: string
          uebernommen_am?: string | null
          uebernommenes_objekt_id?: string | null
          visualisierung?: string | null
          whg_massnahmen?: string | null
          wohnflaeche_gesamt?: number | null
          wohnungen?: Json | null
          zusaetzliche_infos_tk?: string | null
          zustand_aussenfassade?: string | null
          zustand_baeder?: string | null
          zustand_boden?: string | null
          zustand_dach?: string | null
          zustand_elektrik?: string | null
          zustand_fenster?: string | null
          zustand_haustuer?: string | null
          zustand_heizung?: string | null
          zustand_treppenhaus?: string | null
          zustand_waende?: string | null
          zustand_wohnungstueren?: string | null
        }
        Relationships: []
      }
      objekt_exposes: {
        Row: {
          aktualisiert_am: string
          annahmen: Json
          annahmen_gesperrt: boolean
          art: string
          aufrufe: number
          einstieg_wohnung_id: string | null
          erstellt_am: string
          erstellt_von: string | null
          erstmals_aufgerufen_am: string | null
          gesendet_am: string | null
          gesendet_von: string | null
          gueltig_bis: string | null
          id: string
          investment_id: string | null
          kontakt_id: string | null
          objekt_id: string
          preisstand: number | null
          preisstand_am: string | null
          sichtbare_abschnitte: Json
          token: string
          versandweg: string | null
          wohnung_auswahl: string[] | null
          wohnung_id: string | null
          zuletzt_aufgerufen_am: string | null
          zurueckgezogen_am: string | null
        }
        Insert: {
          aktualisiert_am?: string
          annahmen?: Json
          annahmen_gesperrt?: boolean
          art?: string
          aufrufe?: number
          einstieg_wohnung_id?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          erstmals_aufgerufen_am?: string | null
          gesendet_am?: string | null
          gesendet_von?: string | null
          gueltig_bis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          objekt_id: string
          preisstand?: number | null
          preisstand_am?: string | null
          sichtbare_abschnitte?: Json
          token?: string
          versandweg?: string | null
          wohnung_auswahl?: string[] | null
          wohnung_id?: string | null
          zuletzt_aufgerufen_am?: string | null
          zurueckgezogen_am?: string | null
        }
        Update: {
          aktualisiert_am?: string
          annahmen?: Json
          annahmen_gesperrt?: boolean
          art?: string
          aufrufe?: number
          einstieg_wohnung_id?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          erstmals_aufgerufen_am?: string | null
          gesendet_am?: string | null
          gesendet_von?: string | null
          gueltig_bis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          objekt_id?: string
          preisstand?: number | null
          preisstand_am?: string | null
          sichtbare_abschnitte?: Json
          token?: string
          versandweg?: string | null
          wohnung_auswahl?: string[] | null
          wohnung_id?: string | null
          zuletzt_aufgerufen_am?: string | null
          zurueckgezogen_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objekt_exposes_einstieg_wohnung_id_fkey"
            columns: ["einstieg_wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_einstieg_wohnung_id_fkey"
            columns: ["einstieg_wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekt_exposes_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      objekte: {
        Row: {
          adresse: string | null
          afa_modell: string | null
          afa_satz: number | null
          aktualisiert_am: string | null
          badge: string | null
          belegung: string
          belegung_am: string | null
          belegung_kunde_id: string | null
          belegung_kunde_name: string | null
          belegung_von: string | null
          beschreibung: string | null
          bild_url: string | null
          bodenrichtwert: number | null
          cloud_ordner_url: string | null
          erhaltungsaufwand: number | null
          erhaltungsaufwand_jahre: number | null
          erstellt_am: string | null
          erstellt_von: string | null
          exklusiv_partner: string[] | null
          global_baujahr: number | null
          global_energieeffizienzklasse: string | null
          global_etagen: number | null
          global_gesamt_qm: number | null
          global_grundstueck_qm: number | null
          global_hausgeld_monat: number | null
          global_jahresnettomiete: number | null
          global_kaufnebenkosten: number | null
          global_objekt: boolean | null
          global_rendite: number | null
          global_stellplaetze: number | null
          global_verkaufspreis: number | null
          global_vermietungsstand: number | null
          global_zustand: string | null
          groesse_bis: number | null
          groesse_von: number | null
          grundstueck_anteil: number | null
          highlights: string[] | null
          id: string
          meta: Json | null
          ort: string | null
          plz: string | null
          preis_bis: number | null
          preis_von: number | null
          rendite_bis: number | null
          rendite_von: number | null
          restnutzungsdauer: number | null
          sanierungskosten: number | null
          sichtbar: boolean | null
          status: string
          titel: string
          video_sichtbar: boolean | null
          video_url: string | null
          vorgemerkt_berater_name: string | null
          vorgemerkt_bis: string | null
          vorgemerkt_kunde_id: string | null
          vorgemerkt_kunde_name: string | null
          vorgemerkt_von: string | null
        }
        Insert: {
          adresse?: string | null
          afa_modell?: string | null
          afa_satz?: number | null
          aktualisiert_am?: string | null
          badge?: string | null
          belegung?: string
          belegung_am?: string | null
          belegung_kunde_id?: string | null
          belegung_kunde_name?: string | null
          belegung_von?: string | null
          beschreibung?: string | null
          bild_url?: string | null
          bodenrichtwert?: number | null
          cloud_ordner_url?: string | null
          erhaltungsaufwand?: number | null
          erhaltungsaufwand_jahre?: number | null
          erstellt_am?: string | null
          erstellt_von?: string | null
          exklusiv_partner?: string[] | null
          global_baujahr?: number | null
          global_energieeffizienzklasse?: string | null
          global_etagen?: number | null
          global_gesamt_qm?: number | null
          global_grundstueck_qm?: number | null
          global_hausgeld_monat?: number | null
          global_jahresnettomiete?: number | null
          global_kaufnebenkosten?: number | null
          global_objekt?: boolean | null
          global_rendite?: number | null
          global_stellplaetze?: number | null
          global_verkaufspreis?: number | null
          global_vermietungsstand?: number | null
          global_zustand?: string | null
          groesse_bis?: number | null
          groesse_von?: number | null
          grundstueck_anteil?: number | null
          highlights?: string[] | null
          id?: string
          meta?: Json | null
          ort?: string | null
          plz?: string | null
          preis_bis?: number | null
          preis_von?: number | null
          rendite_bis?: number | null
          rendite_von?: number | null
          restnutzungsdauer?: number | null
          sanierungskosten?: number | null
          sichtbar?: boolean | null
          status?: string
          titel: string
          video_sichtbar?: boolean | null
          video_url?: string | null
          vorgemerkt_berater_name?: string | null
          vorgemerkt_bis?: string | null
          vorgemerkt_kunde_id?: string | null
          vorgemerkt_kunde_name?: string | null
          vorgemerkt_von?: string | null
        }
        Update: {
          adresse?: string | null
          afa_modell?: string | null
          afa_satz?: number | null
          aktualisiert_am?: string | null
          badge?: string | null
          belegung?: string
          belegung_am?: string | null
          belegung_kunde_id?: string | null
          belegung_kunde_name?: string | null
          belegung_von?: string | null
          beschreibung?: string | null
          bild_url?: string | null
          bodenrichtwert?: number | null
          cloud_ordner_url?: string | null
          erhaltungsaufwand?: number | null
          erhaltungsaufwand_jahre?: number | null
          erstellt_am?: string | null
          erstellt_von?: string | null
          exklusiv_partner?: string[] | null
          global_baujahr?: number | null
          global_energieeffizienzklasse?: string | null
          global_etagen?: number | null
          global_gesamt_qm?: number | null
          global_grundstueck_qm?: number | null
          global_hausgeld_monat?: number | null
          global_jahresnettomiete?: number | null
          global_kaufnebenkosten?: number | null
          global_objekt?: boolean | null
          global_rendite?: number | null
          global_stellplaetze?: number | null
          global_verkaufspreis?: number | null
          global_vermietungsstand?: number | null
          global_zustand?: string | null
          groesse_bis?: number | null
          groesse_von?: number | null
          grundstueck_anteil?: number | null
          highlights?: string[] | null
          id?: string
          meta?: Json | null
          ort?: string | null
          plz?: string | null
          preis_bis?: number | null
          preis_von?: number | null
          rendite_bis?: number | null
          rendite_von?: number | null
          restnutzungsdauer?: number | null
          sanierungskosten?: number | null
          sichtbar?: boolean | null
          status?: string
          titel?: string
          video_sichtbar?: boolean | null
          video_url?: string | null
          vorgemerkt_berater_name?: string | null
          vorgemerkt_bis?: string | null
          vorgemerkt_kunde_id?: string | null
          vorgemerkt_kunde_name?: string | null
          vorgemerkt_von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objekte_belegung_kunde_id_fkey"
            columns: ["belegung_kunde_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objekte_vorgemerkt_kunde_id_fkey"
            columns: ["vorgemerkt_kunde_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      objekte_sicherung_20260922: {
        Row: {
          adresse: string | null
          afa_modell: string | null
          afa_satz: number | null
          aktualisiert_am: string | null
          badge: string | null
          beschreibung: string | null
          bild_url: string | null
          bodenrichtwert: number | null
          cloud_ordner_url: string | null
          einheiten: number | null
          erhaltungsaufwand: number | null
          erhaltungsaufwand_jahre: number | null
          erstellt_am: string | null
          erstellt_von: string | null
          exklusiv_partner: string[] | null
          global_baujahr: number | null
          global_energieeffizienzklasse: string | null
          global_etagen: number | null
          global_gesamt_qm: number | null
          global_grundstueck_qm: number | null
          global_hausgeld_monat: number | null
          global_jahresnettomiete: number | null
          global_kaufnebenkosten: number | null
          global_objekt: boolean | null
          global_rendite: number | null
          global_stellplaetze: number | null
          global_verkaufspreis: number | null
          global_vermietungsstand: number | null
          global_zustand: string | null
          groesse_bis: number | null
          groesse_von: number | null
          grundstueck_anteil: number | null
          highlights: string[] | null
          id: string | null
          meta: Json | null
          ort: string | null
          plz: string | null
          preis_bis: number | null
          preis_von: number | null
          rendite_bis: number | null
          rendite_von: number | null
          restnutzungsdauer: number | null
          sanierungskosten: number | null
          sichtbar: boolean | null
          status: string | null
          titel: string | null
          video_sichtbar: boolean | null
          video_url: string | null
        }
        Insert: {
          adresse?: string | null
          afa_modell?: string | null
          afa_satz?: number | null
          aktualisiert_am?: string | null
          badge?: string | null
          beschreibung?: string | null
          bild_url?: string | null
          bodenrichtwert?: number | null
          cloud_ordner_url?: string | null
          einheiten?: number | null
          erhaltungsaufwand?: number | null
          erhaltungsaufwand_jahre?: number | null
          erstellt_am?: string | null
          erstellt_von?: string | null
          exklusiv_partner?: string[] | null
          global_baujahr?: number | null
          global_energieeffizienzklasse?: string | null
          global_etagen?: number | null
          global_gesamt_qm?: number | null
          global_grundstueck_qm?: number | null
          global_hausgeld_monat?: number | null
          global_jahresnettomiete?: number | null
          global_kaufnebenkosten?: number | null
          global_objekt?: boolean | null
          global_rendite?: number | null
          global_stellplaetze?: number | null
          global_verkaufspreis?: number | null
          global_vermietungsstand?: number | null
          global_zustand?: string | null
          groesse_bis?: number | null
          groesse_von?: number | null
          grundstueck_anteil?: number | null
          highlights?: string[] | null
          id?: string | null
          meta?: Json | null
          ort?: string | null
          plz?: string | null
          preis_bis?: number | null
          preis_von?: number | null
          rendite_bis?: number | null
          rendite_von?: number | null
          restnutzungsdauer?: number | null
          sanierungskosten?: number | null
          sichtbar?: boolean | null
          status?: string | null
          titel?: string | null
          video_sichtbar?: boolean | null
          video_url?: string | null
        }
        Update: {
          adresse?: string | null
          afa_modell?: string | null
          afa_satz?: number | null
          aktualisiert_am?: string | null
          badge?: string | null
          beschreibung?: string | null
          bild_url?: string | null
          bodenrichtwert?: number | null
          cloud_ordner_url?: string | null
          einheiten?: number | null
          erhaltungsaufwand?: number | null
          erhaltungsaufwand_jahre?: number | null
          erstellt_am?: string | null
          erstellt_von?: string | null
          exklusiv_partner?: string[] | null
          global_baujahr?: number | null
          global_energieeffizienzklasse?: string | null
          global_etagen?: number | null
          global_gesamt_qm?: number | null
          global_grundstueck_qm?: number | null
          global_hausgeld_monat?: number | null
          global_jahresnettomiete?: number | null
          global_kaufnebenkosten?: number | null
          global_objekt?: boolean | null
          global_rendite?: number | null
          global_stellplaetze?: number | null
          global_verkaufspreis?: number | null
          global_vermietungsstand?: number | null
          global_zustand?: string | null
          groesse_bis?: number | null
          groesse_von?: number | null
          grundstueck_anteil?: number | null
          highlights?: string[] | null
          id?: string | null
          meta?: Json | null
          ort?: string | null
          plz?: string | null
          preis_bis?: number | null
          preis_von?: number | null
          rendite_bis?: number | null
          rendite_von?: number | null
          restnutzungsdauer?: number | null
          sanierungskosten?: number | null
          sichtbar?: boolean | null
          status?: string | null
          titel?: string | null
          video_sichtbar?: boolean | null
          video_url?: string | null
        }
        Relationships: []
      }
      objektvorstellungen: {
        Row: {
          aktualisiert_am: string
          aufrufe: number
          begruessung: string | null
          erstellt_am: string
          erstellt_von: string | null
          id: string
          investment_id: string | null
          konfig: Json
          kontakt_id: string
          titel: string
          token: string
          zuletzt_aufgerufen_am: string | null
        }
        Insert: {
          aktualisiert_am?: string
          aufrufe?: number
          begruessung?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          investment_id?: string | null
          konfig?: Json
          kontakt_id: string
          titel?: string
          token?: string
          zuletzt_aufgerufen_am?: string | null
        }
        Update: {
          aktualisiert_am?: string
          aufrufe?: number
          begruessung?: string | null
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          investment_id?: string | null
          konfig?: Json
          kontakt_id?: string
          titel?: string
          token?: string
          zuletzt_aufgerufen_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objektvorstellungen_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objektvorstellungen_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tokens: {
        Row: {
          bewerber_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          fortschritt: Json
          id: string
          status: string
          token: string
          updated_at: string
          vor_daten: Json
        }
        Insert: {
          bewerber_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          fortschritt?: Json
          id?: string
          status?: string
          token: string
          updated_at?: string
          vor_daten?: Json
        }
        Update: {
          bewerber_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          fortschritt?: Json
          id?: string
          status?: string
          token?: string
          updated_at?: string
          vor_daten?: Json
        }
        Relationships: []
      }
      partner_unterlagen: {
        Row: {
          art: string
          dateiname: string
          groesse: number | null
          hochgeladen_am: string
          id: string
          mime_typ: string | null
          pfad: string
          user_id: string
        }
        Insert: {
          art: string
          dateiname: string
          groesse?: number | null
          hochgeladen_am?: string
          id?: string
          mime_typ?: string | null
          pfad: string
          user_id: string
        }
        Update: {
          art?: string
          dateiname?: string
          groesse?: number | null
          hochgeladen_am?: string
          id?: string
          mime_typ?: string | null
          pfad?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline: {
        Row: {
          aktualisiert_am: string
          benutzer_id: string
          erstellt_am: string
          id: string
          kontakt_id: string
          notizen: string | null
          stufe: Database["public"]["Enums"]["pipeline_stufe"]
          wahrscheinlichkeit: number | null
          wert_euro: number | null
        }
        Insert: {
          aktualisiert_am?: string
          benutzer_id: string
          erstellt_am?: string
          id?: string
          kontakt_id: string
          notizen?: string | null
          stufe?: Database["public"]["Enums"]["pipeline_stufe"]
          wahrscheinlichkeit?: number | null
          wert_euro?: number | null
        }
        Update: {
          aktualisiert_am?: string
          benutzer_id?: string
          erstellt_am?: string
          id?: string
          kontakt_id?: string
          notizen?: string | null
          stufe?: Database["public"]["Enums"]["pipeline_stufe"]
          wahrscheinlichkeit?: number | null
          wert_euro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_kontakt_id_fkey"
            columns: ["kontakt_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          beratungslink: string | null
          buchungslink: string | null
          created_at: string
          email: string | null
          finanzierungslink: string | null
          geburtstag: string | null
          gesperrt: boolean
          gesperrt_grund: string | null
          gewerbeerlaubnis_34c: boolean | null
          id: string
          more_id: string | null
          name: string
          objektlink: string | null
          onboarding_abgeschlossen_am: string | null
          rollen_variante: string | null
          telefon: string | null
          unterlagen_frist_bis: string | null
          updated_at: string
          vp_slug: string | null
        }
        Insert: {
          avatar_url?: string | null
          beratungslink?: string | null
          buchungslink?: string | null
          created_at?: string
          email?: string | null
          finanzierungslink?: string | null
          geburtstag?: string | null
          gesperrt?: boolean
          gesperrt_grund?: string | null
          gewerbeerlaubnis_34c?: boolean | null
          id: string
          more_id?: string | null
          name: string
          objektlink?: string | null
          onboarding_abgeschlossen_am?: string | null
          rollen_variante?: string | null
          telefon?: string | null
          unterlagen_frist_bis?: string | null
          updated_at?: string
          vp_slug?: string | null
        }
        Update: {
          avatar_url?: string | null
          beratungslink?: string | null
          buchungslink?: string | null
          created_at?: string
          email?: string | null
          finanzierungslink?: string | null
          geburtstag?: string | null
          gesperrt?: boolean
          gesperrt_grund?: string | null
          gewerbeerlaubnis_34c?: boolean | null
          id?: string
          more_id?: string | null
          name?: string
          objektlink?: string | null
          onboarding_abgeschlossen_am?: string | null
          rollen_variante?: string | null
          telefon?: string | null
          unterlagen_frist_bis?: string | null
          updated_at?: string
          vp_slug?: string | null
        }
        Relationships: []
      }
      provisionsabrechnungen: {
        Row: {
          aktualisiert_am: string
          ausgezahlt_am: string | null
          ausgezahlt_von: string | null
          beleg_hochgeladen_am: string | null
          beleg_name: string | null
          eigene_deals: Json
          erstellt_am: string
          freigegeben_am: string | null
          freigegeben_von: string | null
          gutschrift_ueberwiesen: boolean
          id: string
          karrierestufe: string | null
          monat: string
          netto: number
          overheads_abgezogen: Json
          overrides_erhalten: Json
          pdf_erstellt_am: string | null
          status: string
          summe_eigen: number
          summe_overhead: number
          summe_overrides_erhalten: number
          user_id: string
          user_name: string
        }
        Insert: {
          aktualisiert_am?: string
          ausgezahlt_am?: string | null
          ausgezahlt_von?: string | null
          beleg_hochgeladen_am?: string | null
          beleg_name?: string | null
          eigene_deals?: Json
          erstellt_am?: string
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          gutschrift_ueberwiesen?: boolean
          id?: string
          karrierestufe?: string | null
          monat: string
          netto?: number
          overheads_abgezogen?: Json
          overrides_erhalten?: Json
          pdf_erstellt_am?: string | null
          status?: string
          summe_eigen?: number
          summe_overhead?: number
          summe_overrides_erhalten?: number
          user_id: string
          user_name?: string
        }
        Update: {
          aktualisiert_am?: string
          ausgezahlt_am?: string | null
          ausgezahlt_von?: string | null
          beleg_hochgeladen_am?: string | null
          beleg_name?: string | null
          eigene_deals?: Json
          erstellt_am?: string
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          gutschrift_ueberwiesen?: boolean
          id?: string
          karrierestufe?: string | null
          monat?: string
          netto?: number
          overheads_abgezogen?: Json
          overrides_erhalten?: Json
          pdf_erstellt_am?: string | null
          status?: string
          summe_eigen?: number
          summe_overhead?: number
          summe_overrides_erhalten?: number
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          id: string
          request_count: number
          scope: string
          updated_at: string
          user_key: string
          window_kind: string
          window_start: string
        }
        Insert: {
          id?: string
          request_count?: number
          scope: string
          updated_at?: string
          user_key: string
          window_kind: string
          window_start: string
        }
        Update: {
          id?: string
          request_count?: number
          scope?: string
          updated_at?: string
          user_key?: string
          window_kind?: string
          window_start?: string
        }
        Relationships: []
      }
      rechnung_stammdaten: {
        Row: {
          aktualisiert_am: string | null
          bank_name: string | null
          bic: string | null
          email: string | null
          firma: string | null
          fusszeile: string | null
          iban: string | null
          kleinunternehmer: boolean | null
          kontoinhaber: string | null
          letzte_nummer: number | null
          logo_url: string | null
          nachname: string | null
          nummern_modus: string | null
          nummern_praefix: string | null
          ort: string | null
          plz: string | null
          steuernummer: string | null
          strasse: string | null
          telefon: string | null
          user_id: string
          ust_id: string | null
          vorname: string | null
          zahlungsziel_tage: number | null
        }
        Insert: {
          aktualisiert_am?: string | null
          bank_name?: string | null
          bic?: string | null
          email?: string | null
          firma?: string | null
          fusszeile?: string | null
          iban?: string | null
          kleinunternehmer?: boolean | null
          kontoinhaber?: string | null
          letzte_nummer?: number | null
          logo_url?: string | null
          nachname?: string | null
          nummern_modus?: string | null
          nummern_praefix?: string | null
          ort?: string | null
          plz?: string | null
          steuernummer?: string | null
          strasse?: string | null
          telefon?: string | null
          user_id: string
          ust_id?: string | null
          vorname?: string | null
          zahlungsziel_tage?: number | null
        }
        Update: {
          aktualisiert_am?: string | null
          bank_name?: string | null
          bic?: string | null
          email?: string | null
          firma?: string | null
          fusszeile?: string | null
          iban?: string | null
          kleinunternehmer?: boolean | null
          kontoinhaber?: string | null
          letzte_nummer?: number | null
          logo_url?: string | null
          nachname?: string | null
          nummern_modus?: string | null
          nummern_praefix?: string | null
          ort?: string | null
          plz?: string | null
          steuernummer?: string | null
          strasse?: string | null
          telefon?: string | null
          user_id?: string
          ust_id?: string | null
          vorname?: string | null
          zahlungsziel_tage?: number | null
        }
        Relationships: []
      }
      rechnungen: {
        Row: {
          brutto_summe: number | null
          empfaenger_anschrift: string | null
          empfaenger_firma: string | null
          erstellt_am: string | null
          id: string
          leistungsdatum: string | null
          netto_summe: number | null
          notizen: string | null
          nummer: string
          pdf_url: string | null
          positionen: Json | null
          rechnungsdatum: string | null
          status: string | null
          user_id: string
          ust_summe: number | null
          versendet_am: string | null
          versendet_an: Json | null
        }
        Insert: {
          brutto_summe?: number | null
          empfaenger_anschrift?: string | null
          empfaenger_firma?: string | null
          erstellt_am?: string | null
          id?: string
          leistungsdatum?: string | null
          netto_summe?: number | null
          notizen?: string | null
          nummer: string
          pdf_url?: string | null
          positionen?: Json | null
          rechnungsdatum?: string | null
          status?: string | null
          user_id: string
          ust_summe?: number | null
          versendet_am?: string | null
          versendet_an?: Json | null
        }
        Update: {
          brutto_summe?: number | null
          empfaenger_anschrift?: string | null
          empfaenger_firma?: string | null
          erstellt_am?: string | null
          id?: string
          leistungsdatum?: string | null
          netto_summe?: number | null
          notizen?: string | null
          nummer?: string
          pdf_url?: string | null
          positionen?: Json | null
          rechnungsdatum?: string | null
          status?: string | null
          user_id?: string
          ust_summe?: number | null
          versendet_am?: string | null
          versendet_an?: Json | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          role: string
          url: string
        }
        Insert: {
          created_at?: string
          role: string
          url: string
        }
        Update: {
          created_at?: string
          role?: string
          url?: string
        }
        Relationships: []
      }
      sa_fill_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          email_opened_at: string | null
          expires_at: string
          id: string
          investment_id: string
          kontakt_id: string
          link_opened_at: string | null
          name: string
          nur_am_link: boolean
          person_nr: number
          prefill_data: Json | null
          reminder_sent_at: string | null
          sprache: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          email_opened_at?: string | null
          expires_at?: string
          id?: string
          investment_id: string
          kontakt_id: string
          link_opened_at?: string | null
          name: string
          nur_am_link?: boolean
          person_nr?: number
          prefill_data?: Json | null
          reminder_sent_at?: string | null
          sprache?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          email_opened_at?: string | null
          expires_at?: string
          id?: string
          investment_id?: string
          kontakt_id?: string
          link_opened_at?: string | null
          name?: string
          nur_am_link?: boolean
          person_nr?: number
          prefill_data?: Json | null
          reminder_sent_at?: string | null
          sprache?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          category: string | null
          dedupe_key: string | null
          error: string | null
          erstellt_am: string
          id: string
          investment_id: string | null
          kontakt_id: string | null
          link: string | null
          nachricht: string
          sent_at: string | null
          skip_condition: string | null
          status: string
          target_role: string | null
          target_user_id: string
          titel: string
          trigger_at: string
        }
        Insert: {
          category?: string | null
          dedupe_key?: string | null
          error?: string | null
          erstellt_am?: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          link?: string | null
          nachricht?: string
          sent_at?: string | null
          skip_condition?: string | null
          status?: string
          target_role?: string | null
          target_user_id: string
          titel: string
          trigger_at: string
        }
        Update: {
          category?: string | null
          dedupe_key?: string | null
          error?: string | null
          erstellt_am?: string
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          link?: string | null
          nachricht?: string
          sent_at?: string | null
          skip_condition?: string | null
          status?: string
          target_role?: string | null
          target_user_id?: string
          titel?: string
          trigger_at?: string
        }
        Relationships: []
      }
      secret_rotations: {
        Row: {
          created_at: string
          id: string
          last_rotated_at: string
          notes: string | null
          rotated_by: string | null
          rotated_by_name: string | null
          secret_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_rotated_at?: string
          notes?: string | null
          rotated_by?: string | null
          rotated_by_name?: string | null
          secret_name: string
        }
        Update: {
          created_at?: string
          id?: string
          last_rotated_at?: string
          notes?: string | null
          rotated_by?: string | null
          rotated_by_name?: string | null
          secret_name?: string
        }
        Relationships: []
      }
      signature_requests: {
        Row: {
          consent_text: string | null
          created_at: string
          email: string
          email_opened_at: string | null
          expires_at: string
          id: string
          investment_id: string | null
          ip_address: string | null
          kontakt_id: string
          link_opened_at: string | null
          meta: Json
          name: string
          person_type: string
          sa_data: Json | null
          signature_data: string | null
          signed_at: string | null
          status: string
          token: string
          user_agent: string | null
        }
        Insert: {
          consent_text?: string | null
          created_at?: string
          email: string
          email_opened_at?: string | null
          expires_at: string
          id?: string
          investment_id?: string | null
          ip_address?: string | null
          kontakt_id: string
          link_opened_at?: string | null
          meta?: Json
          name: string
          person_type?: string
          sa_data?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          token: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string | null
          created_at?: string
          email?: string
          email_opened_at?: string | null
          expires_at?: string
          id?: string
          investment_id?: string | null
          ip_address?: string | null
          kontakt_id?: string
          link_opened_at?: string | null
          meta?: Json
          name?: string
          person_type?: string
          sa_data?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          token?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      standort_arbeitgeber: {
        Row: {
          branche: string | null
          created_at: string
          hauptsitz: boolean
          id: string
          meta: Json
          mitarbeiter: number | null
          name: string
          quelle: string | null
          quelle_id: string | null
          rang: number | null
          standort_id: string
          updated_at: string
        }
        Insert: {
          branche?: string | null
          created_at?: string
          hauptsitz?: boolean
          id?: string
          meta?: Json
          mitarbeiter?: number | null
          name: string
          quelle?: string | null
          quelle_id?: string | null
          rang?: number | null
          standort_id: string
          updated_at?: string
        }
        Update: {
          branche?: string | null
          created_at?: string
          hauptsitz?: boolean
          id?: string
          meta?: Json
          mitarbeiter?: number | null
          name?: string
          quelle?: string | null
          quelle_id?: string | null
          rang?: number | null
          standort_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standort_arbeitgeber_quelle_id_fkey"
            columns: ["quelle_id"]
            isOneToOne: false
            referencedRelation: "marktanalyse_quellen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standort_arbeitgeber_standort_id_fkey"
            columns: ["standort_id"]
            isOneToOne: false
            referencedRelation: "standorte"
            referencedColumns: ["id"]
          },
        ]
      }
      standort_kennzahlen: {
        Row: {
          created_at: string
          einheit: string | null
          id: string
          kennzahl: string
          meta: Json
          quelle_id: string | null
          stand: string | null
          standort_id: string
          updated_at: string
          wert: number | null
        }
        Insert: {
          created_at?: string
          einheit?: string | null
          id?: string
          kennzahl: string
          meta?: Json
          quelle_id?: string | null
          stand?: string | null
          standort_id: string
          updated_at?: string
          wert?: number | null
        }
        Update: {
          created_at?: string
          einheit?: string | null
          id?: string
          kennzahl?: string
          meta?: Json
          quelle_id?: string | null
          stand?: string | null
          standort_id?: string
          updated_at?: string
          wert?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "standort_kennzahlen_quelle_id_fkey"
            columns: ["quelle_id"]
            isOneToOne: false
            referencedRelation: "marktanalyse_quellen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standort_kennzahlen_standort_id_fkey"
            columns: ["standort_id"]
            isOneToOne: false
            referencedRelation: "standorte"
            referencedColumns: ["id"]
          },
        ]
      }
      standorte: {
        Row: {
          ags: string
          bundesland: string
          created_at: string
          einwohner: number | null
          einwohner_stand: string | null
          highlights: Json
          id: string
          kreis: string | null
          last_sync_at: string | null
          lat: number | null
          lng: number | null
          meta: Json
          name: string
          oepnv_score: number | null
          typ: string
          uni_stadt: boolean
          updated_at: string
        }
        Insert: {
          ags: string
          bundesland: string
          created_at?: string
          einwohner?: number | null
          einwohner_stand?: string | null
          highlights?: Json
          id?: string
          kreis?: string | null
          last_sync_at?: string | null
          lat?: number | null
          lng?: number | null
          meta?: Json
          name: string
          oepnv_score?: number | null
          typ?: string
          uni_stadt?: boolean
          updated_at?: string
        }
        Update: {
          ags?: string
          bundesland?: string
          created_at?: string
          einwohner?: number | null
          einwohner_stand?: string | null
          highlights?: Json
          id?: string
          kreis?: string | null
          last_sync_at?: string | null
          lat?: number | null
          lng?: number | null
          meta?: Json
          name?: string
          oepnv_score?: number | null
          typ?: string
          uni_stadt?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          antwort: string | null
          benutzer_id: string | null
          betreff: string
          erstellt_am: string | null
          id: string
          kategorie: string | null
          meta: Json | null
          nachricht: string | null
          prioritaet: string | null
          status: string | null
        }
        Insert: {
          antwort?: string | null
          benutzer_id?: string | null
          betreff: string
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          meta?: Json | null
          nachricht?: string | null
          prioritaet?: string | null
          status?: string | null
        }
        Update: {
          antwort?: string | null
          benutzer_id?: string | null
          betreff?: string
          erstellt_am?: string | null
          id?: string
          kategorie?: string | null
          meta?: Json | null
          nachricht?: string | null
          prioritaet?: string | null
          status?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      termin_erinnerungen: {
        Row: {
          aktivitaet_id: string
          erfolg: boolean
          fehler: string | null
          gesendet_am: string
          id: string
          stufe: string
          termin_at: string
        }
        Insert: {
          aktivitaet_id: string
          erfolg?: boolean
          fehler?: string | null
          gesendet_am?: string
          id?: string
          stufe: string
          termin_at: string
        }
        Update: {
          aktivitaet_id?: string
          erfolg?: boolean
          fehler?: string | null
          gesendet_am?: string
          id?: string
          stufe?: string
          termin_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "termin_erinnerungen_aktivitaet_id_fkey"
            columns: ["aktivitaet_id"]
            isOneToOne: false
            referencedRelation: "aktivitaeten"
            referencedColumns: ["id"]
          },
        ]
      }
      tippgeber: {
        Row: {
          benutzer_id: string | null
          email: string | null
          erstellt_am: string | null
          hausnummer: string | null
          id: string
          land: string | null
          meta: Json | null
          nachname: string
          notizen: string | null
          ort: string | null
          plz: string | null
          portal_aktiv: boolean
          provisionstyp: string | null
          provisionswert: string | null
          status: string | null
          strasse: string | null
          telefon: string | null
          tg_slug: string | null
          vorname: string
          zugeordnet_id: string | null
          zugeordnet_name: string | null
        }
        Insert: {
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          hausnummer?: string | null
          id?: string
          land?: string | null
          meta?: Json | null
          nachname: string
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          portal_aktiv?: boolean
          provisionstyp?: string | null
          provisionswert?: string | null
          status?: string | null
          strasse?: string | null
          telefon?: string | null
          tg_slug?: string | null
          vorname: string
          zugeordnet_id?: string | null
          zugeordnet_name?: string | null
        }
        Update: {
          benutzer_id?: string | null
          email?: string | null
          erstellt_am?: string | null
          hausnummer?: string | null
          id?: string
          land?: string | null
          meta?: Json | null
          nachname?: string
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          portal_aktiv?: boolean
          provisionstyp?: string | null
          provisionswert?: string | null
          status?: string | null
          strasse?: string | null
          telefon?: string | null
          tg_slug?: string | null
          vorname?: string
          zugeordnet_id?: string | null
          zugeordnet_name?: string | null
        }
        Relationships: []
      }
      tippgeber_klick_tage: {
        Row: {
          anzahl: number
          tag: string
          tippgeber_id: string
        }
        Insert: {
          anzahl?: number
          tag: string
          tippgeber_id: string
        }
        Update: {
          anzahl?: number
          tag?: string
          tippgeber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tippgeber_klick_tage_tippgeber_id_fkey"
            columns: ["tippgeber_id"]
            isOneToOne: false
            referencedRelation: "tippgeber"
            referencedColumns: ["id"]
          },
        ]
      }
      unterlagen_dokumente: {
        Row: {
          aktion: string | null
          beschreibung: string | null
          dateityp: string | null
          erstellt_am: string
          gesperrt: boolean | null
          id: string
          interne_route: string | null
          kategorie_id: string
          name: string
          nur_admin: boolean | null
          pdf_key: string | null
          reihenfolge: number | null
          slug: string | null
          tool_key: string | null
          url: string | null
        }
        Insert: {
          aktion?: string | null
          beschreibung?: string | null
          dateityp?: string | null
          erstellt_am?: string
          gesperrt?: boolean | null
          id?: string
          interne_route?: string | null
          kategorie_id: string
          name: string
          nur_admin?: boolean | null
          pdf_key?: string | null
          reihenfolge?: number | null
          slug?: string | null
          tool_key?: string | null
          url?: string | null
        }
        Update: {
          aktion?: string | null
          beschreibung?: string | null
          dateityp?: string | null
          erstellt_am?: string
          gesperrt?: boolean | null
          id?: string
          interne_route?: string | null
          kategorie_id?: string
          name?: string
          nur_admin?: boolean | null
          pdf_key?: string | null
          reihenfolge?: number | null
          slug?: string | null
          tool_key?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unterlagen_dokumente_kategorie_id_fkey"
            columns: ["kategorie_id"]
            isOneToOne: false
            referencedRelation: "unterlagen_kategorien"
            referencedColumns: ["id"]
          },
        ]
      }
      unterlagen_highlights: {
        Row: {
          beschreibung: string | null
          bild_url: string | null
          erstellt_am: string
          id: string
          reihenfolge: number | null
          titel: string
          typ: string
          url: string | null
          verknuepfung: string | null
        }
        Insert: {
          beschreibung?: string | null
          bild_url?: string | null
          erstellt_am?: string
          id?: string
          reihenfolge?: number | null
          titel: string
          typ?: string
          url?: string | null
          verknuepfung?: string | null
        }
        Update: {
          beschreibung?: string | null
          bild_url?: string | null
          erstellt_am?: string
          id?: string
          reihenfolge?: number | null
          titel?: string
          typ?: string
          url?: string | null
          verknuepfung?: string | null
        }
        Relationships: []
      }
      unterlagen_kategorien: {
        Row: {
          erstellt_am: string
          id: string
          name: string
          reihenfolge: number | null
          typ: string
        }
        Insert: {
          erstellt_am?: string
          id?: string
          name: string
          reihenfolge?: number | null
          typ?: string
        }
        Update: {
          erstellt_am?: string
          id?: string
          name?: string
          reihenfolge?: number | null
          typ?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          apple_calendar: Json | null
          closer_list: Json | null
          created_at: string | null
          einstellungen: Json | null
          id: string
          onboarding_complete: boolean | null
          onboarding_steps: Json | null
          unterlagen: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apple_calendar?: Json | null
          closer_list?: Json | null
          created_at?: string | null
          einstellungen?: Json | null
          id?: string
          onboarding_complete?: boolean | null
          onboarding_steps?: Json | null
          unterlagen?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apple_calendar?: Json | null
          closer_list?: Json | null
          created_at?: string | null
          einstellungen?: Json | null
          id?: string
          onboarding_complete?: boolean | null
          onboarding_steps?: Json | null
          unterlagen?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      va_abwaegung_antworten: {
        Row: {
          created_at: string
          fall_id: string
          id: string
          kapitel_slug: string
          updated_at: string
          user_id: string
          weg_id: string
        }
        Insert: {
          created_at?: string
          fall_id: string
          id?: string
          kapitel_slug: string
          updated_at?: string
          user_id: string
          weg_id: string
        }
        Update: {
          created_at?: string
          fall_id?: string
          id?: string
          kapitel_slug?: string
          updated_at?: string
          user_id?: string
          weg_id?: string
        }
        Relationships: []
      }
      va_aufgaben_ergebnisse: {
        Row: {
          aufgabe_id: string
          created_at: string
          geloest: boolean
          id: string
          kapitel_slug: string
          punkte: number
          updated_at: string
          user_id: string
          versuche: number
        }
        Insert: {
          aufgabe_id: string
          created_at?: string
          geloest?: boolean
          id?: string
          kapitel_slug: string
          punkte?: number
          updated_at?: string
          user_id: string
          versuche?: number
        }
        Update: {
          aufgabe_id?: string
          created_at?: string
          geloest?: boolean
          id?: string
          kapitel_slug?: string
          punkte?: number
          updated_at?: string
          user_id?: string
          versuche?: number
        }
        Relationships: []
      }
      va_fortschritt: {
        Row: {
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      va_partner_antworten: {
        Row: {
          antwort: string
          created_at: string
          erledigt: boolean
          id: string
          kapitel_slug: string
          uebung_id: string
          uebung_titel: string | null
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          antwort?: string
          created_at?: string
          erledigt?: boolean
          id?: string
          kapitel_slug: string
          uebung_id: string
          uebung_titel?: string | null
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          antwort?: string
          created_at?: string
          erledigt?: boolean
          id?: string
          kapitel_slug?: string
          uebung_id?: string
          uebung_titel?: string | null
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      va_partner_fortschritt: {
        Row: {
          checks_done: number
          id: string
          kapitel_abgeschlossen: boolean
          kapitel_slug: string
          pct: number
          uebungen_done: number
          updated_at: string
          user_id: string
          xp_total: number
        }
        Insert: {
          checks_done?: number
          id?: string
          kapitel_abgeschlossen?: boolean
          kapitel_slug: string
          pct?: number
          uebungen_done?: number
          updated_at?: string
          user_id: string
          xp_total?: number
        }
        Update: {
          checks_done?: number
          id?: string
          kapitel_abgeschlossen?: boolean
          kapitel_slug?: string
          pct?: number
          uebungen_done?: number
          updated_at?: string
          user_id?: string
          xp_total?: number
        }
        Relationships: []
      }
      vermietungen: {
        Row: {
          benutzer_id: string | null
          erstellt_am: string | null
          id: string
          meta: Json | null
          mietbeginn: string | null
          miete: number | null
          mietende: string | null
          mieter_name: string | null
          nebenkosten: number | null
          notizen: string | null
          objekt: string | null
          status: string | null
          wohnung: string | null
        }
        Insert: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          mietbeginn?: string | null
          miete?: number | null
          mietende?: string | null
          mieter_name?: string | null
          nebenkosten?: number | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Update: {
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          mietbeginn?: string | null
          miete?: number | null
          mietende?: string | null
          mieter_name?: string | null
          nebenkosten?: number | null
          notizen?: string | null
          objekt?: string | null
          status?: string | null
          wohnung?: string | null
        }
        Relationships: []
      }
      versicherungen: {
        Row: {
          anbieter: string | null
          benutzer_id: string | null
          erstellt_am: string | null
          gueltig_ab: string | null
          gueltig_bis: string | null
          id: string
          meta: Json | null
          name: string
          notizen: string | null
          objekt: string | null
          police_nr: string | null
          praemie: number | null
          typ: string | null
        }
        Insert: {
          anbieter?: string | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          gueltig_ab?: string | null
          gueltig_bis?: string | null
          id?: string
          meta?: Json | null
          name: string
          notizen?: string | null
          objekt?: string | null
          police_nr?: string | null
          praemie?: number | null
          typ?: string | null
        }
        Update: {
          anbieter?: string | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          gueltig_ab?: string | null
          gueltig_bis?: string | null
          id?: string
          meta?: Json | null
          name?: string
          notizen?: string | null
          objekt?: string | null
          police_nr?: string | null
          praemie?: number | null
          typ?: string | null
        }
        Relationships: []
      }
      videocall_freigaben: {
        Row: {
          erstellt_am: string
          user_id: string
        }
        Insert: {
          erstellt_am?: string
          user_id: string
        }
        Update: {
          erstellt_am?: string
          user_id?: string
        }
        Relationships: []
      }
      videoraeume: {
        Row: {
          agenda: Json
          art: string
          created_at: string
          dauer_minuten: number
          expires_at: string
          gastgeber_id: string
          gastgeber_snapshot: Json
          hinweis: string | null
          id: string
          investment_id: string | null
          kontakt_id: string | null
          meta: Json
          notiz: string | null
          objekt_id: string | null
          signal_geheimnis: string | null
          status: string
          termin_at: string | null
          titel: string | null
          token: string
          transkript_angeboten: boolean
          updated_at: string
          wohnung_id: string | null
        }
        Insert: {
          agenda?: Json
          art?: string
          created_at?: string
          dauer_minuten?: number
          expires_at?: string
          gastgeber_id: string
          gastgeber_snapshot?: Json
          hinweis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meta?: Json
          notiz?: string | null
          objekt_id?: string | null
          signal_geheimnis?: string | null
          status?: string
          termin_at?: string | null
          titel?: string | null
          token: string
          transkript_angeboten?: boolean
          updated_at?: string
          wohnung_id?: string | null
        }
        Update: {
          agenda?: Json
          art?: string
          created_at?: string
          dauer_minuten?: number
          expires_at?: string
          gastgeber_id?: string
          gastgeber_snapshot?: Json
          hinweis?: string | null
          id?: string
          investment_id?: string | null
          kontakt_id?: string | null
          meta?: Json
          notiz?: string | null
          objekt_id?: string | null
          signal_geheimnis?: string | null
          status?: string
          termin_at?: string | null
          titel?: string | null
          token?: string
          transkript_angeboten?: boolean
          updated_at?: string
          wohnung_id?: string | null
        }
        Relationships: []
      }
      videoraum_teilnehmer: {
        Row: {
          beigetreten_at: string
          eingelassen_at: string | null
          gast_token: string
          id: string
          name: string
          raum_id: string
          rolle: string
          status: string
          technik: Json
          transkript_zustimmung: boolean
          updated_at: string
          verlassen_at: string | null
        }
        Insert: {
          beigetreten_at?: string
          eingelassen_at?: string | null
          gast_token: string
          id?: string
          name: string
          raum_id: string
          rolle?: string
          status?: string
          technik?: Json
          transkript_zustimmung?: boolean
          updated_at?: string
          verlassen_at?: string | null
        }
        Update: {
          beigetreten_at?: string
          eingelassen_at?: string | null
          gast_token?: string
          id?: string
          name?: string
          raum_id?: string
          rolle?: string
          status?: string
          technik?: Json
          transkript_zustimmung?: boolean
          updated_at?: string
          verlassen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videoraum_teilnehmer_raum_id_fkey"
            columns: ["raum_id"]
            isOneToOne: false
            referencedRelation: "videoraeume"
            referencedColumns: ["id"]
          },
        ]
      }
      vp_bewertungen: {
        Row: {
          bewertet_von: string
          created_at: string
          datenschutz_akzeptiert: boolean
          gelohnt: boolean | null
          id: string
          kommentar: string | null
          kontakt_id: string
          kunde_name: string | null
          r_arbeitsweise: number
          r_berater_erfahrung: number
          r_beratungsart: number
          r_informationen: number
          r_produkt: number
          r_ziele: number
          updated_at: string
          vp_name: string | null
          vp_user_id: string | null
          weiterempfehlung: boolean | null
        }
        Insert: {
          bewertet_von: string
          created_at?: string
          datenschutz_akzeptiert?: boolean
          gelohnt?: boolean | null
          id?: string
          kommentar?: string | null
          kontakt_id: string
          kunde_name?: string | null
          r_arbeitsweise: number
          r_berater_erfahrung: number
          r_beratungsart: number
          r_informationen: number
          r_produkt: number
          r_ziele: number
          updated_at?: string
          vp_name?: string | null
          vp_user_id?: string | null
          weiterempfehlung?: boolean | null
        }
        Update: {
          bewertet_von?: string
          created_at?: string
          datenschutz_akzeptiert?: boolean
          gelohnt?: boolean | null
          id?: string
          kommentar?: string | null
          kontakt_id?: string
          kunde_name?: string | null
          r_arbeitsweise?: number
          r_berater_erfahrung?: number
          r_beratungsart?: number
          r_informationen?: number
          r_produkt?: number
          r_ziele?: number
          updated_at?: string
          vp_name?: string | null
          vp_user_id?: string | null
          weiterempfehlung?: boolean | null
        }
        Relationships: []
      }
      vp_marketing_einstellungen: {
        Row: {
          meta_capi_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          meta_capi_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          meta_capi_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_audit_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event: string | null
          id: string
          ip: string | null
          method: string | null
          payload: Json | null
          signature_reason: string | null
          signature_status: string
          source: string
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event?: string | null
          id?: string
          ip?: string | null
          method?: string | null
          payload?: Json | null
          signature_reason?: string | null
          signature_status?: string
          source: string
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event?: string | null
          id?: string
          ip?: string | null
          method?: string | null
          payload?: Json | null
          signature_reason?: string | null
          signature_status?: string
          source?: string
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      weekly_call_protokolle: {
        Row: {
          aufzeichnung_url: string | null
          call_termin: string
          created_at: string
          dokument_name: string | null
          dokument_pfad: string | null
          gepflegt_von: string | null
          notiz: string | null
          updated_at: string
        }
        Insert: {
          aufzeichnung_url?: string | null
          call_termin: string
          created_at?: string
          dokument_name?: string | null
          dokument_pfad?: string | null
          gepflegt_von?: string | null
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          aufzeichnung_url?: string | null
          call_termin?: string
          created_at?: string
          dokument_name?: string | null
          dokument_pfad?: string | null
          gepflegt_von?: string | null
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      weekly_call_punkte: {
        Row: {
          besprochen_am: string | null
          besprochen_von: string | null
          call_runde: string
          call_termin: string
          created_at: string
          id: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          besprochen_am?: string | null
          besprochen_von?: string | null
          call_runde?: string
          call_termin?: string
          created_at?: string
          id?: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          besprochen_am?: string | null
          besprochen_von?: string | null
          call_runde?: string
          call_termin?: string
          created_at?: string
          id?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wettbewerb_challenges: {
        Row: {
          aktiv: boolean | null
          anzeigemonat: string | null
          benutzer_id: string | null
          beschreibung: string | null
          einheit: string | null
          end_datum: string | null
          ergebnis: string | null
          erstellt_am: string | null
          fortschritt: number | null
          icon: string | null
          id: string
          preis: string | null
          ranking: Json | null
          start_datum: string | null
          titel: string
          zielwert: number | null
        }
        Insert: {
          aktiv?: boolean | null
          anzeigemonat?: string | null
          benutzer_id?: string | null
          beschreibung?: string | null
          einheit?: string | null
          end_datum?: string | null
          ergebnis?: string | null
          erstellt_am?: string | null
          fortschritt?: number | null
          icon?: string | null
          id?: string
          preis?: string | null
          ranking?: Json | null
          start_datum?: string | null
          titel: string
          zielwert?: number | null
        }
        Update: {
          aktiv?: boolean | null
          anzeigemonat?: string | null
          benutzer_id?: string | null
          beschreibung?: string | null
          einheit?: string | null
          end_datum?: string | null
          ergebnis?: string | null
          erstellt_am?: string | null
          fortschritt?: number | null
          icon?: string | null
          id?: string
          preis?: string | null
          ranking?: Json | null
          start_datum?: string | null
          titel?: string
          zielwert?: number | null
        }
        Relationships: []
      }
      wissenswelt_feedback: {
        Row: {
          aktualisiert_am: string
          erstellt_am: string
          id: string
          slug: string
          user_id: string
          vote: string
        }
        Insert: {
          aktualisiert_am?: string
          erstellt_am?: string
          id?: string
          slug: string
          user_id: string
          vote: string
        }
        Update: {
          aktualisiert_am?: string
          erstellt_am?: string
          id?: string
          slug?: string
          user_id?: string
          vote?: string
        }
        Relationships: []
      }
      wohnungen: {
        Row: {
          erstellt_am: string | null
          etage: string | null
          gesetzt_am: string | null
          gesetzt_bis: string | null
          groesse: number | null
          id: string
          kunde_id: string | null
          kunde_name: string | null
          lage: string | null
          meta: Json | null
          miete_gesamt: number | null
          objekt_id: string
          qm_preis: number | null
          rendite: number | null
          reserviert_am: string | null
          reserviert_von: string | null
          status: string | null
          vermietet: boolean | null
          vk_gesamt: number | null
          vorgemerkt_berater_name: string | null
          vorgemerkt_bis: string | null
          vorgemerkt_kunde_id: string | null
          vorgemerkt_kunde_name: string | null
          vorgemerkt_von: string | null
          we_nr: string | null
          zimmer: number | null
        }
        Insert: {
          erstellt_am?: string | null
          etage?: string | null
          gesetzt_am?: string | null
          gesetzt_bis?: string | null
          groesse?: number | null
          id?: string
          kunde_id?: string | null
          kunde_name?: string | null
          lage?: string | null
          meta?: Json | null
          miete_gesamt?: number | null
          objekt_id: string
          qm_preis?: number | null
          rendite?: number | null
          reserviert_am?: string | null
          reserviert_von?: string | null
          status?: string | null
          vermietet?: boolean | null
          vk_gesamt?: number | null
          vorgemerkt_berater_name?: string | null
          vorgemerkt_bis?: string | null
          vorgemerkt_kunde_id?: string | null
          vorgemerkt_kunde_name?: string | null
          vorgemerkt_von?: string | null
          we_nr?: string | null
          zimmer?: number | null
        }
        Update: {
          erstellt_am?: string | null
          etage?: string | null
          gesetzt_am?: string | null
          gesetzt_bis?: string | null
          groesse?: number | null
          id?: string
          kunde_id?: string | null
          kunde_name?: string | null
          lage?: string | null
          meta?: Json | null
          miete_gesamt?: number | null
          objekt_id?: string
          qm_preis?: number | null
          rendite?: number | null
          reserviert_am?: string | null
          reserviert_von?: string | null
          status?: string | null
          vermietet?: boolean | null
          vk_gesamt?: number | null
          vorgemerkt_berater_name?: string | null
          vorgemerkt_bis?: string | null
          vorgemerkt_kunde_id?: string | null
          vorgemerkt_kunde_name?: string | null
          vorgemerkt_von?: string | null
          we_nr?: string | null
          zimmer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wohnungen_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wohnungen_vorgemerkt_kunde_id_fkey"
            columns: ["vorgemerkt_kunde_id"]
            isOneToOne: false
            referencedRelation: "kontakte"
            referencedColumns: ["id"]
          },
        ]
      }
      wohnungs_bilder: {
        Row: {
          alt: string | null
          erstellt_am: string | null
          id: string
          reihenfolge: number | null
          url: string
          wohnung_id: string
        }
        Insert: {
          alt?: string | null
          erstellt_am?: string | null
          id?: string
          reihenfolge?: number | null
          url: string
          wohnung_id: string
        }
        Update: {
          alt?: string | null
          erstellt_am?: string | null
          id?: string
          reihenfolge?: number | null
          url?: string
          wohnung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wohnungs_bilder_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wohnungs_bilder_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      wohnungs_dokumente: {
        Row: {
          erstellt_am: string | null
          geschwaerzt: boolean
          id: string
          kategorie: string | null
          kunden_freigabe: string | null
          kunden_freigabe_am: string | null
          kunden_freigabe_von: string | null
          name: string
          url: string | null
          wohnung_id: string
        }
        Insert: {
          erstellt_am?: string | null
          geschwaerzt?: boolean
          id?: string
          kategorie?: string | null
          kunden_freigabe?: string | null
          kunden_freigabe_am?: string | null
          kunden_freigabe_von?: string | null
          name: string
          url?: string | null
          wohnung_id: string
        }
        Update: {
          erstellt_am?: string | null
          geschwaerzt?: boolean
          id?: string
          kategorie?: string | null
          kunden_freigabe?: string | null
          kunden_freigabe_am?: string | null
          kunden_freigabe_von?: string | null
          name?: string
          url?: string | null
          wohnung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wohnungs_dokumente_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wohnungs_dokumente_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
      zaehlerstaende: {
        Row: {
          abgelesen_am: string | null
          benutzer_id: string | null
          erstellt_am: string | null
          id: string
          meta: Json | null
          notizen: string | null
          objekt: string | null
          typ: string | null
          wert: number | null
          wohnung: string | null
          zaehler_nr: string | null
        }
        Insert: {
          abgelesen_am?: string | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          notizen?: string | null
          objekt?: string | null
          typ?: string | null
          wert?: number | null
          wohnung?: string | null
          zaehler_nr?: string | null
        }
        Update: {
          abgelesen_am?: string | null
          benutzer_id?: string | null
          erstellt_am?: string | null
          id?: string
          meta?: Json | null
          notizen?: string | null
          objekt?: string | null
          typ?: string | null
          wert?: number | null
          wohnung?: string | null
          zaehler_nr?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          buchungslink: string | null
          created_at: string | null
          email: string | null
          id: string | null
          more_id: string | null
          name: string | null
          vp_slug: string | null
        }
        Insert: {
          avatar_url?: string | null
          buchungslink?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          more_id?: string | null
          name?: string | null
          vp_slug?: string | null
        }
        Update: {
          avatar_url?: string | null
          buchungslink?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          more_id?: string | null
          name?: string | null
          vp_slug?: string | null
        }
        Relationships: []
      }
      wohnungen_public: {
        Row: {
          erstellt_am: string | null
          etage: string | null
          groesse: number | null
          id: string | null
          lage: string | null
          meta: Json | null
          miete_gesamt: number | null
          objekt_id: string | null
          qm_preis: number | null
          rendite: number | null
          status: string | null
          vermietet: boolean | null
          vk_gesamt: number | null
          we_nr: string | null
          zimmer: number | null
        }
        Insert: {
          erstellt_am?: string | null
          etage?: string | null
          groesse?: number | null
          id?: string | null
          lage?: string | null
          meta?: Json | null
          miete_gesamt?: number | null
          objekt_id?: string | null
          qm_preis?: number | null
          rendite?: number | null
          status?: string | null
          vermietet?: boolean | null
          vk_gesamt?: number | null
          we_nr?: string | null
          zimmer?: number | null
        }
        Update: {
          erstellt_am?: string | null
          etage?: string | null
          groesse?: number | null
          id?: string | null
          lage?: string | null
          meta?: Json | null
          miete_gesamt?: number | null
          objekt_id?: string | null
          qm_preis?: number | null
          rendite?: number | null
          status?: string | null
          vermietet?: boolean | null
          vk_gesamt?: number | null
          we_nr?: string | null
          zimmer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wohnungen_objekt_id_fkey"
            columns: ["objekt_id"]
            isOneToOne: false
            referencedRelation: "objekte"
            referencedColumns: ["id"]
          },
        ]
      }
      wohnungs_dokumente_public: {
        Row: {
          erstellt_am: string | null
          id: string | null
          kategorie: string | null
          name: string | null
          url: string | null
          wohnung_id: string | null
        }
        Insert: {
          erstellt_am?: string | null
          id?: string | null
          kategorie?: string | null
          name?: string | null
          url?: string | null
          wohnung_id?: string | null
        }
        Update: {
          erstellt_am?: string | null
          id?: string | null
          kategorie?: string | null
          name?: string | null
          url?: string | null
          wohnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wohnungs_dokumente_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wohnungs_dokumente_wohnung_id_fkey"
            columns: ["wohnung_id"]
            isOneToOne: false
            referencedRelation: "wohnungen_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activity_log_actor_snapshot: {
        Args: { _uid: string }
        Returns: {
          actor_name: string
          actor_role: string
        }[]
      }
      aftersales_signatur_anlegen: {
        Args: { _formular: Json; _investment_id: string; _vp_name: string }
        Returns: string
      }
      analysetool_trichter: {
        Args: {
          p_berater_id?: string
          p_kampagne?: string
          p_tage?: number
          p_werkzeug?: string
        }
        Returns: {
          beendet: number
          eintragung_abgesendet: number
          eintragung_gesehen: number
          gestartet: number
        }[]
      }
      analysetool_trichter_kampagnen: {
        Args: { p_grenze?: number; p_tage?: number; p_werkzeug?: string }
        Returns: {
          beendet: number
          eintragung_abgesendet: number
          eintragung_gesehen: number
          gestartet: number
          kampagne: string
        }[]
      }
      aufsicht_ueber: {
        Args: { _mitglied: string }
        Returns: {
          aufseher_id: string
        }[]
      }
      automatik_geheimnis: { Args: never; Returns: string }
      berater_name_normal: { Args: { _name: string }; Returns: string }
      bewerber_abmeldung_aufraeumen: { Args: never; Returns: number }
      bewerber_formular_aufraeumen: { Args: never; Returns: number }
      bewerber_kennenlern_kalender: { Args: never; Returns: string }
      bewerber_kennenlerntermin_eintragen: {
        Args: { _datum: string; _token: string; _uhrzeit: string }
        Returns: Json
      }
      bewerber_kennenlerntermin_zugang: {
        Args: { _token: string }
        Returns: Json
      }
      bewerber_seite_aufraeumen: { Args: never; Returns: number }
      bewerber_stufe_closing: {
        Args: { _bewerbung: string }
        Returns: undefined
      }
      bewerber_termin_absagen: {
        Args: { _grund?: string; _token: string }
        Returns: Json
      }
      bewerber_termin_buchen: {
        Args: { _start: string; _token: string }
        Returns: Json
      }
      bewerber_termin_dauer: {
        Args: { _antworten: Json; _lang: number }
        Returns: number
      }
      bewerber_termin_freie_zeiten: {
        Args: { _bis: string; _token: string; _von: string }
        Returns: Json
      }
      bewerber_termin_gastgeber: { Args: never; Returns: string }
      bewerber_termin_verschieben: {
        Args: { _start: string; _token: string }
        Returns: Json
      }
      bewerber_termin_zugang: { Args: { _token: string }; Returns: Json }
      buchung_absagen: {
        Args: { _absage_token: string; _grund?: string }
        Returns: Json
      }
      buchung_anlegen:
        | {
            Args: {
              _begleitung?: Json
              _email: string
              _nachricht?: string
              _name: string
              _sprache: string
              _start: string
              _telefon?: string
              _terminart_id: string
              _token: string
            }
            Returns: Json
          }
        | {
            Args: {
              _begleitung?: Json
              _email: string
              _nachricht?: string
              _name: string
              _start: string
              _telefon?: string
              _terminart_id: string
              _token: string
            }
            Returns: Json
          }
      buchung_ansicht: { Args: { _absage_token: string }; Returns: Json }
      buchung_freie_zeiten: {
        Args: {
          _bis: string
          _terminart_id: string
          _token: string
          _von: string
        }
        Returns: Json
      }
      buchung_intern_verschieben: {
        Args: { _buchung_id: string; _start: string }
        Returns: Json
      }
      buchung_investment_vorwaerts: {
        Args: { _kontakt: string; _stufe: string }
        Returns: boolean
      }
      buchung_pipeline_rang: { Args: { _stufe: string }; Returns: number }
      buchung_pipeline_vorwaerts: {
        Args: { _kontakt: string; _stufe: string }
        Returns: boolean
      }
      buchung_status_setzen: {
        Args: { _buchung_id: string; _status: string }
        Returns: Json
      }
      buchung_termin_belegt: {
        Args: {
          _bis: string
          _mitarbeiter: string
          _ohne_aktivitaet?: string
          _von: string
          _zone?: string
        }
        Returns: boolean
      }
      buchung_token: { Args: never; Returns: string }
      buchung_verschieben: {
        Args: { _absage_token: string; _start: string }
        Returns: Json
      }
      buchung_wochenplan_setzen: { Args: { _zeilen: Json }; Returns: number }
      buchung_zugang: { Args: { _token: string }; Returns: Json }
      buchung_zugang_aufloesen: {
        Args: { _token: string }
        Returns: {
          art: string
          kontakt_id: string
          kontakt_snapshot: Json
          link_id: string
          mitarbeiter_id: string
          terminart_id: string
        }[]
      }
      bulk_recompute_pipeline: { Args: never; Returns: Json }
      can_manage_kunde_dokumente: {
        Args: { _kontakt_id: string }
        Returns: boolean
      }
      chat_teilnehmer_eintragen: {
        Args: { p_chat_id: string; p_teilnehmer: Json }
        Returns: number
      }
      check_auth_lockout: { Args: { _email: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          _limit_per_day?: number
          _limit_per_hour?: number
          _scope: string
          _user_key: string
        }
        Returns: Json
      }
      claim_lead: {
        Args: { _kontakt_id: string; _via?: string }
        Returns: {
          claimed_by: string
          claimed_by_name: string
          success: boolean
        }[]
      }
      cleanup_activation_tokens: { Args: never; Returns: number }
      cleanup_ai_rate_limits: { Args: never; Returns: number }
      cleanup_email_artifacts: { Args: never; Returns: Json }
      cleanup_email_send_log: { Args: never; Returns: Json }
      cleanup_expired_tokens: { Args: never; Returns: Json }
      cleanup_rate_limit_buckets: { Args: never; Returns: number }
      complete_academy_quiz_attempt: {
        Args: { _attempt: Json; _role: string; _user_id: string }
        Returns: {
          aktualisiert_am: string
          certificate_issued_at: string | null
          certificate_pdf_url: string | null
          certificate_serial: string | null
          completed_modules: Json
          current_module_index: number
          erstellt_am: string
          id: string
          passed_at: string | null
          passed_score: number | null
          quiz_attempts: Json
          role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "academy_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_notar_termin: {
        Args: { _datum: string; _investment_id: string; _uhrzeit: string }
        Returns: Json
      }
      consume_activation_token: { Args: { _token: string }; Returns: string }
      consume_mfa_recovery_code: {
        Args: { _code_hash: string; _ip?: string; _user_id: string }
        Returns: boolean
      }
      create_empfehlung_kontakt: {
        Args: {
          _anmerkungen?: string
          _berater: string
          _beziehung: string
          _email: string
          _investment_id?: string
          _nachname: string
          _programm_id?: string
          _quelle: string
          _referrer_kontakt_id: string
          _telefon: string
          _vorname: string
        }
        Returns: Json
      }
      create_tippgeber_lead:
        | {
            Args: {
              _anliegen?: string
              _email: string
              _nachname: string
              _telefon: string
              _vorname: string
            }
            Returns: Json
          }
        | {
            Args: {
              _anliegen?: string
              _berufliche_situation?: string
              _eigenkapital?: string
              _einkommen?: string
              _einverstaendnis?: boolean
              _einverstaendnis_fassung?: string
              _einverstaendnis_wortlaut?: string
              _email: string
              _investitions_zeitpunkt?: string
              _nachname: string
              _schufa_sauber?: string
              _telefon: string
              _vorname: string
              _ziel?: string
            }
            Returns: Json
          }
      darf_alle_kunden_sehen: { Args: { _user_id: string }; Returns: boolean }
      darf_bewerberbereich: { Args: { _uid: string }; Returns: boolean }
      darf_dokument_freigeben: { Args: { _user_id: string }; Returns: boolean }
      darf_glocke_senden: {
        Args: {
          _empfaenger: string
          _kontakt_id?: string
          _ziel_rolle?: string
        }
        Returns: boolean
      }
      darf_hausverwaltung_lesen: {
        Args: { _user_id: string }
        Returns: boolean
      }
      darf_hausverwaltung_schreiben: {
        Args: { _user_id: string }
        Returns: boolean
      }
      darf_investment_berechnung: {
        Args: { _kontakt_id: string; _user_id: string }
        Returns: boolean
      }
      darf_investment_nutzen: {
        Args: { _kontakt_meta: Json; _kunde_id: string; _user_id: string }
        Returns: boolean
      }
      darf_kontakt_bearbeiten: {
        Args: { _kontakt_id: string; _user_id: string }
        Returns: boolean
      }
      darf_lead_uebernehmen: { Args: { _user_id: string }; Returns: boolean }
      darf_leads_zuweisen: { Args: { _user_id: string }; Returns: boolean }
      darf_objekt_medien_schreiben: {
        Args: { _name: string; _user_id: string }
        Returns: boolean
      }
      darf_objekt_schreiben: {
        Args: { _objekt_id: string; _user_id: string }
        Returns: boolean
      }
      darf_reservieren: { Args: { _user_id: string }; Returns: boolean }
      darf_sa_entfallen_setzen: { Args: { _user_id: string }; Returns: boolean }
      darf_unterlage_aendern: {
        Args: { _name: string; _user_id: string }
        Returns: boolean
      }
      darf_unterlage_lesen: {
        Args: { _name: string; _user_id: string }
        Returns: boolean
      }
      darf_videocall: { Args: { _uid: string }; Returns: boolean }
      darf_wohnung_schreiben: {
        Args: { _user_id: string; _wohnung_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_audit_anomalies: { Args: never; Returns: Json }
      dsgvo_hard_delete_kontakt: {
        Args: {
          _grund_referenz: string
          _kontakt_id: string
          _name_confirmation: string
        }
        Returns: Json
      }
      eigene_chat_ids: { Args: { _user_id: string }; Returns: string[] }
      eigene_kontakt_ids: { Args: { _user_id: string }; Returns: string[] }
      eigenfinanzierung_kunde_unterlage: {
        Args: { _aktion: string; _datei: Json; _investment_id: string }
        Returns: Json
      }
      eigentuemer_aus_investment: {
        Args: { _investment_id: string }
        Returns: string
      }
      einheit_belegung_abgleichen: {
        Args: { p_investment_id: string }
        Returns: Json
      }
      einheit_loesch_grund: { Args: { _w: Json }; Returns: string }
      einheit_reservierung_aufheben: {
        Args: { p_wohnung_id: string }
        Returns: Json
      }
      einstellung_zahl: {
        Args: { _einstellungen: Json; _key: string }
        Returns: number
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      empfehlungsprogramm_anfragen: {
        Args: { _kontakt_id: string }
        Returns: Json
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finanzierung_altbestand: {
        Args: { _investment_id: string }
        Returns: boolean
      }
      finanzierung_hat_angebote: { Args: { _angebote: Json }; Returns: boolean }
      finanzierung_intern_frei: {
        Args: { _investment_id: string }
        Returns: boolean
      }
      finanzierung_intern_frei_meta: { Args: { _meta: Json }; Returns: boolean }
      finanzierung_sperre_ausgenommen: {
        Args: { _user_id: string }
        Returns: boolean
      }
      get_activation_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expired: boolean
          expires_at: string
          kontakt_id: string
          kunde_name: string
          next: string
          portal: string
          role: string
          token: string
          used: boolean
          user_id: string
        }[]
      }
      get_bewerber_abmeldung: {
        Args: { _token: string }
        Returns: {
          status: string
          vorname: string
        }[]
      }
      get_bewerber_formular: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          status: string
          telefon: string
          vorname: string
        }[]
      }
      get_bewerber_seite: { Args: { _token: string }; Returns: Json }
      get_kunde_vp_profile: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          id: string
          name: string
          telefon: string
        }[]
      }
      get_mobile_scan_session: {
        Args: { _token: string }
        Returns: {
          block: string
          created_at: string
          expires_at: string
          id: string
          investment_id: string | null
          kontakt_id: string
          last_doc_typ: string | null
          last_upload_at: string | null
          meta: Json
          person: number
          status: string
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mobile_scan_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_mobile_scan_uploaded_docs: {
        Args: { _token: string }
        Returns: string[]
      }
      get_onboarding_token: { Args: { _token: string }; Returns: Json }
      get_or_create_tippgeber_vp_chat: { Args: never; Returns: Json }
      get_sa_fill_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          created_by: string | null
          email: string
          email_opened_at: string | null
          expires_at: string
          id: string
          investment_id: string
          kontakt_id: string
          link_opened_at: string | null
          name: string
          nur_am_link: boolean
          person_nr: number
          prefill_data: Json | null
          reminder_sent_at: string | null
          sprache: string | null
          status: string
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sa_fill_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_signature_request: {
        Args: { _token: string }
        Returns: {
          consent_text: string | null
          created_at: string
          email: string
          email_opened_at: string | null
          expires_at: string
          id: string
          investment_id: string | null
          ip_address: string | null
          kontakt_id: string
          link_opened_at: string | null
          meta: Json
          name: string
          person_type: string
          sa_data: Json | null
          signature_data: string | null
          signed_at: string | null
          status: string
          token: string
          user_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "signature_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_sla_thresholds: {
        Args: { p_role: string }
        Returns: {
          orange_days: number
          red_days: number
        }[]
      }
      get_sla_violations: {
        Args: { p_user_id: string }
        Returns: {
          days_inactive: number
          kontakt_id: string
          last_activity: string
          nachname: string
          pipeline_stufe: string
          reason: string
          severity: string
          vorname: string
        }[]
      }
      get_sla_violations_bereich: {
        Args: never
        Returns: {
          berater_name: string
          days_inactive: number
          kontakt_id: string
          last_activity: string
          nachname: string
          pipeline_stufe: string
          reason: string
          severity: string
          vorname: string
          zustaendig_id: string
        }[]
      }
      get_tippgeber_vp_profile: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          id: string
          name: string
          telefon: string
        }[]
      }
      get_user_login_summary: {
        Args: never
        Returns: {
          aktiv: boolean
          last_seen_at: string
          user_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      glocke_link_ist_intern: { Args: { _link: string }; Returns: boolean }
      handbuch_abrufen: { Args: { _token: string }; Returns: Json }
      handbuch_kennzahlen: {
        Args: { p_berater_id?: string; p_nur_firma?: boolean; p_tage?: number }
        Returns: Json
      }
      handbuch_lead_staende: {
        Args: { p_kontakt_ids: string[] }
        Returns: Json
      }
      handbuch_partner_freigeschaltet: { Args: never; Returns: boolean }
      handbuch_pdf_gespeichert: { Args: { _token: string }; Returns: undefined }
      handbuch_sa_starten: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hat_breiten_kontaktzugriff: {
        Args: { _user_id: string }
        Returns: boolean
      }
      hat_weiten_kontaktzugriff: {
        Args: { _user_id: string }
        Returns: boolean
      }
      increment_ai_rate_limit: {
        Args: { _limit?: number; _user_key: string }
        Returns: Json
      }
      increment_tippgeber_klick: {
        Args: { _tippgeber: string }
        Returns: undefined
      }
      investagon_roh_trennen: {
        Args: { roh: Json }
        Returns: Record<string, unknown>
      }
      investment_abwicklung_speichern: {
        Args: { _daten: Json; _investment_id: string }
        Returns: Json
      }
      investment_geschuetzte_schluessel: { Args: never; Returns: string[] }
      investment_loeschen: {
        Args: { _investment_id: string }
        Returns: undefined
      }
      investment_partner_id: { Args: { _kunde_id: string }; Returns: string }
      investment_sa_pdf_vermerken: {
        Args: {
          _dateiname: string
          _investment_id: string
          _papier_pfad?: string
        }
        Returns: Json
      }
      investment_wert_leer: { Args: { _wert: Json }; Returns: boolean }
      is_admin_role: { Args: { _user_id: string }; Returns: boolean }
      is_chat_participant: {
        Args: { _chat_id: string; _user_id: string }
        Returns: boolean
      }
      is_internal_role: { Args: { _user_id: string }; Returns: boolean }
      is_mobile_scan_token_open: { Args: { _token: string }; Returns: boolean }
      is_mobile_scan_token_valid: { Args: { _token: string }; Returns: boolean }
      is_objekt_manager: { Args: { _user_id: string }; Returns: boolean }
      is_vp_eigentuemer_of_kontakt: {
        Args: { _meta: Json; _user_id: string; _zustaendig_id: string }
        Returns: boolean
      }
      is_vp_owner_of_kontakt: {
        Args: { _meta: Json; _user_id: string; _zustaendig_id: string }
        Returns: boolean
      }
      ist_aktive_vertretung: {
        Args: { _user_id: string; _zustaendig_id: string }
        Returns: boolean
      }
      ist_eigene_finanzierung: {
        Args: { _investment_id_text: string; _user_id: string }
        Returns: boolean
      }
      ist_eigener_kontakt: {
        Args: { _kunde_id_text: string; _user_id: string }
        Returns: boolean
      }
      ist_eigenes_investment: {
        Args: { _kunde_id: string; _user_id: string }
        Returns: boolean
      }
      ist_empfehlungsgeber_von: {
        Args: { _empfehlungsgeber_kontakt_id: string; _user_id: string }
        Returns: boolean
      }
      ist_kunde_des_kontakts: {
        Args: { _kontakt_id: string; _user_id: string }
        Returns: boolean
      }
      jsonb_deep_merge: { Args: { a: Json; b: Json }; Returns: Json }
      karriere_stufe_rate: { Args: { _wert: string }; Returns: number }
      kennzahl_bewerberstatus: { Args: { _roh: string }; Returns: string }
      kennzahl_datum: { Args: { _roh: string }; Returns: string }
      kennzahl_investment_preis: {
        Args: { _kaufpreis: number; _meta: Json }
        Returns: number
      }
      kennzahl_schreiben: {
        Args: {
          _bereich: string
          _kennzahl: string
          _stichtag: string
          _wert: number
        }
        Returns: undefined
      }
      kennzahl_schwelle_final: { Args: { _stufe: string }; Returns: number }
      kennzahl_schwelle_rot: { Args: { _stufe: string }; Returns: number }
      kennzahl_stufe: { Args: { _roh: string }; Returns: string }
      kennzahl_wahrscheinlichkeit: { Args: { _stufe: string }; Returns: number }
      kennzahl_zahl: { Args: { _roh: string }; Returns: number }
      kennzahlen_gespraeche_woche: { Args: never; Returns: number }
      kennzahlen_tagesstand_lauf: { Args: never; Returns: number }
      kennzahlen_tagesstand_nordstern: { Args: never; Returns: number }
      kennzahlen_tagesstand_objektdaten: { Args: never; Returns: number }
      kennzahlen_tagesstand_zusatz: { Args: never; Returns: number }
      kennzahlen_verlauf: {
        Args: { p_bereich?: string }
        Returns: {
          bereich: string
          kennzahl: string
          stichtag_heute: string
          stichtag_vorwoche: string
          veraenderung: number
          wert_heute: number
          wert_vorwoche: number
        }[]
      }
      kontakt_dateipfade_umschreiben: {
        Args: {
          _abbildung?: Json
          _aufgeloest: string
          _aufrufer: string
          _behalten: string
        }
        Returns: Json
      }
      kontakt_marketing_nachweis_anhaengen: {
        Args: { p_kontakt_id: string; p_nachweis: Json }
        Returns: boolean
      }
      kontakt_pfade_ersetzen: {
        Args: { _abbildung: Json; _json: boolean; _wert: string }
        Returns: string
      }
      kontakt_sprache:
        | {
            Args: { _kontakt_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.kontakt_sprache(_kontakt_id => text), public.kontakt_sprache(_kontakt_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { _kontakt_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.kontakt_sprache(_kontakt_id => text), public.kontakt_sprache(_kontakt_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      kontakt_visible_to_internal: {
        Args: { _kunde_id_text: string; _user_id: string }
        Returns: boolean
      }
      kontakte_zusammenfuehren: {
        Args: {
          _aufloesen: string
          _behalten: string
          _felder: Json
          _meta: Json
          _notiz: string
          _stand?: Json
        }
        Returns: Json
      }
      kunde_portal_gesperrt: { Args: { _user_id: string }; Returns: boolean }
      kunde_zweiter_faktor_erfuellt: { Args: never; Returns: boolean }
      kunden_zwei_faktor_regeln_anlegen: { Args: never; Returns: number }
      kundenchat_starten: { Args: never; Returns: string }
      kundenportal_gesperrt_fuer_mich: { Args: never; Returns: boolean }
      kundenportal_sperre_schreiben: {
        Args: { _gesperrt: boolean; _kontakt_id: string; _von: string }
        Returns: Json
      }
      kundenportal_sperrregeln_anlegen: { Args: never; Returns: number }
      kundensprache_zum_link: {
        Args: { _art: string; _token: string }
        Returns: string
      }
      lead_an_zentrale_zurueckgeben: {
        Args: { _berater_historie?: Json; _kontakt_id: string }
        Returns: boolean
      }
      lead_paket_aendern: {
        Args: {
          _beendet: boolean
          _bemerkung?: string
          _bezahlt_am: string
          _freigeschaltet_am: string
          _paket_id: string
        }
        Returns: undefined
      }
      lead_paket_anlegen: {
        Args: {
          _anzahl: number
          _bemerkung?: string
          _bezahlt_am?: string
          _freigeschaltet_am?: string
          _paketpreis: number
          _partner_id: string
        }
        Returns: string
      }
      lead_paket_aus_bewerbung: {
        Args: { _bewerbung_id: string }
        Returns: Json
      }
      lead_paket_aus_bewerbung_intern: {
        Args: { _bewerbung_id: string }
        Returns: Json
      }
      lead_paket_datum: { Args: { _text: string }; Returns: string }
      lead_paket_reklamation: {
        Args: { _grund: string; _zuweisung_id: string }
        Returns: undefined
      }
      lead_paket_status_nachziehen: {
        Args: { _paket_id: string }
        Returns: undefined
      }
      lead_paket_zuweisung_vermerken: {
        Args: { _kontakt_id: string; _paket_id: string }
        Returns: string
      }
      loeschen_aus_dem_browser: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _entity: string
          _entity_id?: string
          _meta?: Json
          _nachher?: Json
          _vorher?: Json
        }
        Returns: string
      }
      log_audit_event: {
        Args: {
          _action: string
          _entity: string
          _entity_id?: string
          _meta?: Json
          _nachher?: Json
          _vorher?: Json
        }
        Returns: string
      }
      log_kontakt_view: {
        Args: { _feld?: string; _kontakt_id: string }
        Returns: undefined
      }
      lookup_activation_name: { Args: { _email: string }; Returns: string }
      lotse_aufraeumen: { Args: never; Returns: undefined }
      lotse_kontingent_reservieren: {
        Args: { p_limit: number; p_user: string }
        Returns: boolean
      }
      mark_bewerber_mail_clicked: {
        Args: { _token: string }
        Returns: undefined
      }
      mark_bewerber_mail_opened: {
        Args: { _token: string }
        Returns: undefined
      }
      mark_bewerber_mail_opened_aus_bogen: {
        Args: {
          _bewerbung_id: string
          _gesendet_am?: string
          _zeitpunkt?: string
        }
        Returns: undefined
      }
      mark_sa_email_opened: { Args: { _token: string }; Returns: undefined }
      mark_sa_fill_token_used: { Args: { _token: string }; Returns: boolean }
      mark_sa_link_opened: { Args: { _token: string }; Returns: undefined }
      mark_signature_email_opened: {
        Args: { _token: string }
        Returns: undefined
      }
      mark_signature_link_opened: {
        Args: { _token: string }
        Returns: undefined
      }
      meeting_alte_kommunikation: {
        Args: { _a: Database["public"]["Tables"]["aktivitaeten"]["Row"] }
        Returns: Json
      }
      meeting_anlegen: { Args: { _daten: Json; _id: string }; Returns: string }
      meeting_eigene_zeit_belegt: {
        Args: { _ende: string; _start: string }
        Returns: boolean
      }
      meeting_mail_claim: {
        Args: never
        Returns: {
          art: string
          benutzer_id: string
          created_at: string
          daten: Json
          email: string
          fehler: string | null
          id: string
          kontakt_id: string | null
          lease_id: string | null
          meeting_id: string
          naechster_versuch: string
          revision: number
          status: string
          versuche: number
        }[]
        SetofOptions: {
          from: "*"
          to: "meeting_mail_auftraege"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      meeting_mail_erneut: { Args: { _id: string }; Returns: undefined }
      meeting_mail_fertig: {
        Args: {
          _erfolg: boolean
          _fehler?: string
          _id: string
          _lease: string
        }
        Returns: undefined
      }
      meeting_raum_entfernen: { Args: { _raum_id: string }; Returns: undefined }
      merge_investment_meta: {
        Args: { _investment_id: string; _updates: Json }
        Returns: Json
      }
      merge_kontakt_meta: {
        Args: { _kontakt_id: string; _updates: Json }
        Returns: Json
      }
      merge_user_settings: {
        Args: { _patch: Json; _user_id: string }
        Returns: Json
      }
      meta_pixel_entfernen: { Args: { p_user_id: string }; Returns: undefined }
      mfa_recovery_codes_status: { Args: { _user_id: string }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      nachtpruefung_bericht: {
        Args: never
        Returns: {
          anzahl: number
          beispiele: Json
          lauf_at: string
          meldung: string
          pruefung: string
          schwere: string
        }[]
      }
      nachtpruefung_globalzeile: {
        Args: { _etage: string; _meta: Json; _we_nr: string }
        Returns: boolean
      }
      nachtpruefung_haengende_raeume: {
        Args: { _lauf: string }
        Returns: number
      }
      nachtpruefung_kontakt_ohne_zustaendigen: {
        Args: { _lauf: string }
        Returns: number
      }
      nachtpruefung_lauf: { Args: never; Returns: number }
      nachtpruefung_normtext: { Args: { _t: string }; Returns: string }
      nachtpruefung_objektdaten: { Args: { _lauf: string }; Returns: number }
      nachtpruefung_objektdaten_ausfall: {
        Args: {
          _bereich: string
          _fehler: string
          _lauf: string
          _pruefung: string
        }
        Returns: undefined
      }
      nachtpruefung_objektdaten_eintrag: {
        Args: {
          _art?: string
          _detail: string
          _einheiten?: string[]
          _meta: Json
          _objekt_id: string
          _titel: string
        }
        Returns: Json
      }
      nachtpruefung_objektdaten_schreiben: {
        Args: {
          _bereich: string
          _geprueft: number
          _lauf: string
          _pruefung: string
          _schwere: string
          _treffer: Json
          _was: string
        }
        Returns: number
      }
      nachtpruefung_raeume_nach_termin: {
        Args: { _lauf: string }
        Returns: number
      }
      nachtpruefung_reservierung_ohne_bonitaet: {
        Args: { _lauf: string }
        Returns: number
      }
      naechtliche_abmeldung: { Args: { p_jetzt?: string }; Returns: string }
      objekt_loesch_grund: { Args: { _objekt_id: string }; Returns: string }
      objekt_loeschen: { Args: { _objekt_id: string }; Returns: Json }
      objekt_sichtbarkeit_setzen: {
        Args: { p_objekt_id: string; p_sichtbar: boolean }
        Returns: Json
      }
      partner_link_aktiv: { Args: { _user_id: string }; Returns: boolean }
      partnertermin_bestaetigen: {
        Args: {
          _anlass: string
          _datum: string
          _investment_id: string
          _token: string
          _uhrzeit: string
        }
        Returns: Json
      }
      partnertermin_zugang: { Args: { _token: string }; Returns: Json }
      pipelinestufe_ist_kaufphase: {
        Args: { _stufe: string }
        Returns: boolean
      }
      provisionssatz_ermitteln: {
        Args: { _kunde_id: string }
        Returns: Record<string, unknown>
      }
      provisionssatz_fuer_partner: {
        Args: { _eigen: boolean; _partner: string }
        Returns: number
      }
      purge_email_queue: { Args: { queue_name: string }; Returns: number }
      purge_old_activity_log: { Args: never; Returns: number }
      purge_old_webhook_audit_logs: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_auth_attempt: {
        Args: {
          _email: string
          _ip?: string
          _lockout_minutes?: number
          _max_attempts?: number
          _success: boolean
          _window_minutes?: number
        }
        Returns: Json
      }
      register_unterlage_upload: {
        Args: { _doc_name: string; _file_url: string; _investment_id: string }
        Returns: Json
      }
      reserviere_einheit_nach_unterschrift: {
        Args: {
          p_kontakt_id: string
          p_kunde_name: string
          p_reserviert_am?: string
          p_reserviert_von?: string
          p_wohnung_id: string
        }
        Returns: Json
      }
      reserviere_objekt_nach_unterschrift: {
        Args: {
          p_belegung_am?: string
          p_belegung_von?: string
          p_kontakt_id: string
          p_kunde_name: string
          p_objekt_id: string
        }
        Returns: Json
      }
      resolve_tippgeber_slug: {
        Args: { _tg_slug: string; _vp_slug: string }
        Returns: {
          id: string
          nachname: string
          vorname: string
        }[]
      }
      restore_activation_token: { Args: { _token: string }; Returns: undefined }
      role_has_url: { Args: { _role: string; _url: string }; Returns: boolean }
      rotate_audit_log: { Args: never; Returns: Json }
      run_security_self_check: { Args: never; Returns: Json }
      rv_anfrage_aufgehoben: {
        Args: {
          _created_at: string
          _investment_id: string
          _person_type: string
        }
        Returns: boolean
      }
      setze_kunden_freigabe: {
        Args: {
          p_freigabe: string
          p_geschwaerzt: boolean
          p_id: string
          p_tabelle: string
        }
        Returns: Json
      }
      sign_signature_request: {
        Args: {
          _consent_text: string
          _signature_data: string
          _token: string
          _user_agent?: string
        }
        Returns: {
          consent_text: string | null
          created_at: string
          email: string
          email_opened_at: string | null
          expires_at: string
          id: string
          investment_id: string | null
          ip_address: string | null
          kontakt_id: string
          link_opened_at: string | null
          meta: Json
          name: string
          person_type: string
          sa_data: Json | null
          signature_data: string | null
          signed_at: string | null
          status: string
          token: string
          user_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "signature_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      signature_request_abgelaufen: {
        Args: { _token: string }
        Returns: boolean
      }
      sitzungen_beenden: { Args: { p_user_id: string }; Returns: number }
      slugify_de: { Args: { input: string }; Returns: string }
      support_ticket_antwort_melden: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      support_ticket_gelesen: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      support_ticket_mail_beanspruchen: {
        Args: { p_ticket_id: string }
        Returns: string
      }
      support_ticket_nachricht_anhaengen: {
        Args: { p_als?: string; p_inhalt: string; p_ticket_id: string }
        Returns: Json
      }
      team_mitglieder: {
        Args: { _leiter: string }
        Returns: {
          mitglied_id: string
        }[]
      }
      team_zuordnung: {
        Args: never
        Returns: {
          leiter_id: string
          mitglied_id: string
          quelle: string
        }[]
      }
      tippgeber_klick_buchen: { Args: { _id: string }; Returns: boolean }
      tippgeber_klick_zaehlen: {
        Args: { _tg: string; _vp_slug: string }
        Returns: undefined
      }
      unregister_unterlage_upload: {
        Args: { _doc_name: string; _investment_id: string }
        Returns: Json
      }
      unterlagen_lese_kontakt: { Args: { _name: string }; Returns: string }
      unterlagen_pfad_kontakt: { Args: { _name: string }; Returns: string }
      update_mobile_scan_session: {
        Args: {
          _last_doc_typ?: string
          _last_upload_at?: string
          _meta?: Json
          _status?: string
          _token: string
        }
        Returns: {
          block: string
          created_at: string
          expires_at: string
          id: string
          investment_id: string | null
          kontakt_id: string
          last_doc_typ: string | null
          last_upload_at: string | null
          meta: Json
          person: number
          status: string
          token: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mobile_scan_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_onboarding_fortschritt: {
        Args: { _fortschritt: Json; _status?: string; _token: string }
        Returns: boolean
      }
      update_sa_fill_token_data: {
        Args: { _data: Json; _token: string }
        Returns: Json
      }
      va_abwaegung_verteilung: {
        Args: { p_fall_id: string; p_kapitel_slug: string; p_mindest?: number }
        Returns: {
          anzahl: number
          weg_id: string
        }[]
      }
      va_team_average: {
        Args: never
        Returns: {
          team_avg_pct: number
          users_count: number
        }[]
      }
      videoraeume_aufraeumen: { Args: never; Returns: number }
      videoraum_ablauf: { Args: { _termin: string }; Returns: string }
      videoraum_ansicht: { Args: { _token: string }; Returns: Json }
      videoraum_beitreten: {
        Args: {
          _name: string
          _technik?: Json
          _token: string
          _transkript?: boolean
        }
        Returns: Json
      }
      videoraum_gast_melden: {
        Args: { _gast_token: string; _status?: string; _technik?: Json }
        Returns: Json
      }
      videoraum_gast_status: { Args: { _gast_token: string }; Returns: Json }
      videoraum_standard_agenda: { Args: { _art: string }; Returns: Json }
      vormerke_einheit: {
        Args: { p_kontakt_id: string; p_wohnung_id: string }
        Returns: Json
      }
      vormerke_objekt: {
        Args: { p_kontakt_id: string; p_objekt_id: string }
        Returns: Json
      }
      vp_slug_gesperrt: { Args: { _slug: string }; Returns: boolean }
      weekly_call_eigene_runde: { Args: never; Returns: string }
      weekly_call_punkt_abhaken: {
        Args: { _besprochen: boolean; _id: string }
        Returns: undefined
      }
      weekly_call_punkte_lesen: {
        Args: { _runde?: string; _termin?: string }
        Returns: {
          besprochen: boolean
          call_runde: string
          call_termin: string
          created_at: string
          id: string
          text: string
          von_mir: boolean
        }[]
      }
      weekly_call_runden: { Args: { _uid: string }; Returns: string[] }
      weekly_call_termine: {
        Args: { _runde?: string }
        Returns: {
          anzahl: number
          call_termin: string
        }[]
      }
      weekly_call_woche: { Args: { _zeitpunkt?: string }; Returns: string }
      zustaendigkeitsbereich: {
        Args: { _user: string }
        Returns: {
          bereich_id: string
        }[]
      }
    }
    Enums: {
      anruf_ergebnis:
        | "erreicht"
        | "nicht_erreicht"
        | "mailbox"
        | "termin_vereinbart"
        | "kein_interesse"
        | "follow_up"
      app_role:
        | "inhaber"
        | "admin"
        | "vertriebsleiter"
        | "vertriebspartner"
        | "objektpartner"
        | "finanzierungspartner"
        | "hausverwaltung"
        | "marketing"
        | "backoffice"
        | "buchhaltung"
        | "setterin"
        | "hr"
        | "kunde"
        | "testaccount"
        | "individuell"
        | "versicherungsexperte"
        | "tippgeber"
      aufgabe_prioritaet: "niedrig" | "mittel" | "hoch" | "dringend"
      aufgabe_status: "offen" | "in_bearbeitung" | "erledigt" | "abgesagt"
      aufgabe_typ: "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline"
      email_ordner:
        | "posteingang"
        | "gesendet"
        | "entwuerfe"
        | "archiviert"
        | "papierkorb"
      kontakt_status:
        | "neu"
        | "kontaktiert"
        | "qualifiziert"
        | "kunde"
        | "verloren"
        | "inaktiv"
      news_kategorie: "provision" | "event" | "update" | "system" | "allgemein"
      pipeline_stufe:
        | "erstgespraech"
        | "bedarfsanalyse"
        | "angebot"
        | "verhandlung"
        | "abschluss"
        | "verloren"
        | "neu"
        | "antrag"
        | "ruecklauf"
        | "vollstaendig"
        | "reserviert"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      anruf_ergebnis: [
        "erreicht",
        "nicht_erreicht",
        "mailbox",
        "termin_vereinbart",
        "kein_interesse",
        "follow_up",
      ],
      app_role: [
        "inhaber",
        "admin",
        "vertriebsleiter",
        "vertriebspartner",
        "objektpartner",
        "finanzierungspartner",
        "hausverwaltung",
        "marketing",
        "backoffice",
        "buchhaltung",
        "setterin",
        "hr",
        "kunde",
        "testaccount",
        "individuell",
        "versicherungsexperte",
        "tippgeber",
      ],
      aufgabe_prioritaet: ["niedrig", "mittel", "hoch", "dringend"],
      aufgabe_status: ["offen", "in_bearbeitung", "erledigt", "abgesagt"],
      aufgabe_typ: ["anruf", "meeting", "follow_up", "aufgabe", "deadline"],
      email_ordner: [
        "posteingang",
        "gesendet",
        "entwuerfe",
        "archiviert",
        "papierkorb",
      ],
      kontakt_status: [
        "neu",
        "kontaktiert",
        "qualifiziert",
        "kunde",
        "verloren",
        "inaktiv",
      ],
      news_kategorie: ["provision", "event", "update", "system", "allgemein"],
      pipeline_stufe: [
        "erstgespraech",
        "bedarfsanalyse",
        "angebot",
        "verhandlung",
        "abschluss",
        "verloren",
        "neu",
        "antrag",
        "ruecklauf",
        "vollstaendig",
        "reserviert",
      ],
    },
  },
} as const
