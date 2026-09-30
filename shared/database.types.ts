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
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          org_id: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "courtrack_leagues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
          team_id: string
        }
        Insert: {
          courtrack_name: string
          created_at?: string
          id?: string
          normalized_name: string
          org_id: string
          organization_id?: string
          team_id: string
        }
        Update: {
          courtrack_name?: string
          created_at?: string
          id?: string
          normalized_name?: string
          org_id?: string
          organization_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courtrack_team_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "matches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          courtrack_daily_limit: number | null
          created_at: string
          id: string
          name: string
          slug: string
          theme: Json
          updated_at: string
        }
        Insert: {
          courtrack_daily_limit?: number | null
          created_at?: string
          id?: string
          name: string
          slug: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          courtrack_daily_limit?: number | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          jersey_number: number | null
          name: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          primary_position?: string
          secondary_position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          courtrack_league_id: string | null
          dry_run: boolean
          error: string | null
          finished_at: string | null
          id: string
          org_id: string
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "sync_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "videos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "weekly_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      default_org_id: { Args: never; Returns: string }
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
