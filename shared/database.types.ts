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
      competitions: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      courtrack_leagues: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          cliente_name: string | null
          competition_id: string
          created_at: string
          fixture: Json | null
          id: string
          id_cliente: number
          is_active: boolean
          last_synced_at: string | null
          liga_id: number
          liga_name: string
          org_id: string
          season_label: string
          snapshot_at: string | null
          standings: Json | null
          team_logo_url: string | null
          team_name: string
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          cliente_name?: string | null
          competition_id: string
          created_at?: string
          fixture?: Json | null
          id?: string
          id_cliente: number
          is_active?: boolean
          last_synced_at?: string | null
          liga_id: number
          liga_name: string
          org_id: string
          season_label: string
          snapshot_at?: string | null
          standings?: Json | null
          team_logo_url?: string | null
          team_name: string
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          cliente_name?: string | null
          competition_id?: string
          created_at?: string
          fixture?: Json | null
          id?: string
          id_cliente?: number
          is_active?: boolean
          last_synced_at?: string | null
          liga_id?: number
          liga_name?: string
          org_id?: string
          season_label?: string
          snapshot_at?: string | null
          standings?: Json | null
          team_logo_url?: string | null
          team_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courtrack_leagues_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      courtrack_team_links: {
        Row: {
          courtrack_name: string
          created_at: string
          id: string
          normalized_name: string
          org_id: string
          team_id: string
        }
        Insert: {
          courtrack_name: string
          created_at?: string
          id?: string
          normalized_name: string
          org_id: string
          team_id: string
        }
        Update: {
          courtrack_name?: string
          created_at?: string
          id?: string
          normalized_name?: string
          org_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courtrack_team_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_players: {
        Row: {
          lineup_id: string
          player_id: string
          x: number
          y: number
        }
        Insert: {
          lineup_id: string
          player_id: string
          x: number
          y: number
        }
        Update: {
          lineup_id?: string
          player_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_players_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          activity_id: string | null
          competition_id: string | null
          courtrack_id: string | null
          courtrack_league_id: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          is_home: boolean
          location: string | null
          opponent_team_id: string
          phase: string | null
          played_on: string
          set_scores: Json
          sets_lost: number | null
          sets_won: number | null
          slug: string
          start_time: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          competition_id?: string | null
          courtrack_id?: string | null
          courtrack_league_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_home?: boolean
          location?: string | null
          opponent_team_id: string
          phase?: string | null
          played_on: string
          set_scores?: Json
          sets_lost?: number | null
          sets_won?: number | null
          slug: string
          start_time?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          competition_id?: string | null
          courtrack_id?: string | null
          courtrack_league_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_home?: boolean
          location?: string | null
          opponent_team_id?: string
          phase?: string | null
          played_on?: string
          set_scores?: Json
          sets_lost?: number | null
          sets_won?: number | null
          slug?: string
          start_time?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "weekly_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_courtrack_league_id_fkey"
            columns: ["courtrack_league_id"]
            isOneToOne: false
            referencedRelation: "courtrack_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          jersey_number: number | null
          name: string
          primary_position: string
          secondary_position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          name: string
          primary_position: string
          secondary_position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          name?: string
          primary_position?: string
          secondary_position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          courtrack_league_id: string | null
          dry_run: boolean
          error: string | null
          finished_at: string | null
          id: string
          org_id: string
          result: Json | null
          source: string
          started_at: string
          status: string
        }
        Insert: {
          courtrack_league_id?: string | null
          dry_run?: boolean
          error?: string | null
          finished_at?: string | null
          id?: string
          org_id: string
          result?: Json | null
          source?: string
          started_at?: string
          status?: string
        }
        Update: {
          courtrack_league_id?: string | null
          dry_run?: boolean
          error?: string | null
          finished_at?: string | null
          id?: string
          org_id?: string
          result?: Json | null
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_courtrack_league_id_fkey"
            columns: ["courtrack_league_id"]
            isOneToOne: false
            referencedRelation: "courtrack_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          category: string | null
          city: string | null
          created_at: string
          id: string
          is_own_team: boolean
          logo_url: string | null
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_own_team?: boolean
          logo_url?: string | null
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_own_team?: boolean
          logo_url?: string | null
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          activity_id: string | null
          category: string
          content_type: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          last_synced_at: string | null
          match_id: string | null
          recorded_on: string | null
          set_number: number | null
          size_bytes: number | null
          sort_order: number
          source: string
          status: string
          storage_key: string | null
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          activity_id?: string | null
          category?: string
          content_type?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          last_synced_at?: string | null
          match_id?: string | null
          recorded_on?: string | null
          set_number?: number | null
          size_bytes?: number | null
          sort_order?: number
          source?: string
          status?: string
          storage_key?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          activity_id?: string | null
          category?: string
          content_type?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          last_synced_at?: string | null
          match_id?: string | null
          recorded_on?: string | null
          set_number?: number | null
          size_bytes?: number | null
          sort_order?: number
          source?: string
          status?: string
          storage_key?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "weekly_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_activities: {
        Row: {
          activity_date: string
          activity_type: string
          category: string
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          is_cancelled: boolean
          location: string | null
          opponent_team_id: string | null
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_date: string
          activity_type?: string
          category?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_cancelled?: boolean
          location?: string | null
          opponent_team_id?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          category?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_cancelled?: boolean
          location?: string | null
          opponent_team_id?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_activities_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
