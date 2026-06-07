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
      activity_log: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          cv_id: string | null
          demand_candidate_id: string | null
          demand_id: string | null
          id: string
          kind: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          cv_id?: string | null
          demand_candidate_id?: string | null
          demand_id?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          cv_id?: string | null
          demand_candidate_id?: string | null
          demand_id?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      candidate_financials: {
        Row: {
          candidate_rate: number | null
          client_rate: number | null
          contract_duration_months: number | null
          created_at: string
          currency: string | null
          demand_candidate_id: string
          id: string
          margin: number | null
          notes: string | null
          placement_date: string | null
          updated_at: string
        }
        Insert: {
          candidate_rate?: number | null
          client_rate?: number | null
          contract_duration_months?: number | null
          created_at?: string
          currency?: string | null
          demand_candidate_id: string
          id?: string
          margin?: number | null
          notes?: string | null
          placement_date?: string | null
          updated_at?: string
        }
        Update: {
          candidate_rate?: number | null
          client_rate?: number | null
          contract_duration_months?: number | null
          created_at?: string
          currency?: string | null
          demand_candidate_id?: string
          id?: string
          margin?: number | null
          notes?: string | null
          placement_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_financials_demand_candidate_id_fkey"
            columns: ["demand_candidate_id"]
            isOneToOne: true
            referencedRelation: "demand_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      demand_candidates: {
        Row: {
          created_at: string
          cv_id: string
          demand_id: string
          id: string
          notes: string | null
          stage: Database["public"]["Enums"]["candidate_stage"]
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cv_id: string
          demand_id: string
          id?: string
          notes?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cv_id?: string
          demand_id?: string
          id?: string
          notes?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_candidates_cv_id_fkey"
            columns: ["cv_id"]
            isOneToOne: false
            referencedRelation: "talent_hub_cvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_candidates_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      demands: {
        Row: {
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          client_id: string
          commercial_outcome: Database["public"]["Enums"]["commercial_outcome"]
          created_at: string
          created_by: string | null
          description: string | null
          engagement: Database["public"]["Enums"]["engagement_type"]
          id: string
          is_rfo: boolean
          lifecycle: Database["public"]["Enums"]["demand_lifecycle"]
          location: string | null
          lost_reason: string | null
          positions_count: number
          priority: number | null
          required_skills: string[] | null
          rfo_deadline: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["demand_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          client_id: string
          commercial_outcome?: Database["public"]["Enums"]["commercial_outcome"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement?: Database["public"]["Enums"]["engagement_type"]
          id?: string
          is_rfo?: boolean
          lifecycle?: Database["public"]["Enums"]["demand_lifecycle"]
          location?: string | null
          lost_reason?: string | null
          positions_count?: number
          priority?: number | null
          required_skills?: string[] | null
          rfo_deadline?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["demand_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          client_id?: string
          commercial_outcome?: Database["public"]["Enums"]["commercial_outcome"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement?: Database["public"]["Enums"]["engagement_type"]
          id?: string
          is_rfo?: boolean
          lifecycle?: Database["public"]["Enums"]["demand_lifecycle"]
          location?: string | null
          lost_reason?: string | null
          positions_count?: number
          priority?: number | null
          required_skills?: string[] | null
          rfo_deadline?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["demand_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          demand_candidate_id: string | null
          demand_id: string | null
          id: string
          link: string | null
          message: string | null
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          demand_candidate_id?: string | null
          demand_id?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          demand_candidate_id?: string | null
          demand_id?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          updated_at?: string
        }
        Relationships: []
      }
      talent_hub_cvs: {
        Row: {
          availability:
            | Database["public"]["Enums"]["availability_status"]
            | null
          created_at: string
          created_by: string | null
          cv_url: string | null
          daily_rate: number | null
          email: string | null
          engagement_preference:
            | Database["public"]["Enums"]["engagement_type"]
            | null
          full_name: string
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          phone: string | null
          remote_ok: boolean | null
          salary_expectation: number | null
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          skills: string[] | null
          summary: string | null
          tags: string[] | null
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          availability?:
            | Database["public"]["Enums"]["availability_status"]
            | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          daily_rate?: number | null
          email?: string | null
          engagement_preference?:
            | Database["public"]["Enums"]["engagement_type"]
            | null
          full_name: string
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          remote_ok?: boolean | null
          salary_expectation?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          skills?: string[] | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          availability?:
            | Database["public"]["Enums"]["availability_status"]
            | null
          created_at?: string
          created_by?: string | null
          cv_url?: string | null
          daily_rate?: number | null
          email?: string | null
          engagement_preference?:
            | Database["public"]["Enums"]["engagement_type"]
            | null
          full_name?: string
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          remote_ok?: boolean | null
          salary_expectation?: number | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          skills?: string[] | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_team_members: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "sourcing_team"
        | "division_manager"
        | "division_director"
        | "ceo"
        | "admin"
      availability_status: "available" | "available_soon" | "unavailable"
      candidate_stage:
        | "identified"
        | "contacted"
        | "screened"
        | "submitted"
        | "client_interview"
        | "offer"
        | "placed"
        | "rejected"
        | "withdrawn"
      commercial_outcome: "pending" | "won" | "lost"
      demand_lifecycle:
        | "open"
        | "in_progress"
        | "on_hold"
        | "filled"
        | "cancelled"
      demand_status:
        | "open"
        | "sourcing"
        | "submitted"
        | "interview"
        | "offer"
        | "placed"
        | "closed"
        | "lost"
      engagement_type: "freelance" | "permanent"
      notification_type:
        | "demand_assigned"
        | "pipeline_changed"
        | "candidate_added"
      seniority_level: "junior" | "mid" | "senior" | "lead" | "principal"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "sourcing_team",
        "division_manager",
        "division_director",
        "ceo",
        "admin",
      ],
      availability_status: ["available", "available_soon", "unavailable"],
      candidate_stage: [
        "identified",
        "contacted",
        "screened",
        "submitted",
        "client_interview",
        "offer",
        "placed",
        "rejected",
        "withdrawn",
      ],
      commercial_outcome: ["pending", "won", "lost"],
      demand_lifecycle: [
        "open",
        "in_progress",
        "on_hold",
        "filled",
        "cancelled",
      ],
      demand_status: [
        "open",
        "sourcing",
        "submitted",
        "interview",
        "offer",
        "placed",
        "closed",
        "lost",
      ],
      engagement_type: ["freelance", "permanent"],
      notification_type: [
        "demand_assigned",
        "pipeline_changed",
        "candidate_added",
      ],
      seniority_level: ["junior", "mid", "senior", "lead", "principal"],
    },
  },
} as const
