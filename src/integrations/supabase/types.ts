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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          agent_id: string
          config_key: string
          config_value: string
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_id: string
          config_key: string
          config_value?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_id?: string
          config_key?: string
          config_value?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          model_used: string | null
          page_id: string
          report: Json | null
          run_number: number
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          summary_stats: Json | null
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          page_id: string
          report?: Json | null
          run_number?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary_stats?: Json | null
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          page_id?: string
          report?: Json | null
          run_number?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary_stats?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_number: number
          blog_system_prompt: string | null
          confidence_tier: Database["public"]["Enums"]["confidence_tier"]
          description: string | null
          id: string
          is_active: boolean
          is_blocking: boolean
          migration_only: boolean
          model_tier: Database["public"]["Enums"]["model_tier"]
          name: string
          processing_model: string | null
          requires_browserless: boolean
          skip_in_blog_mode: boolean
          sort_order: number
          stage_number: number
          system_prompt: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_number: number
          blog_system_prompt?: string | null
          confidence_tier?: Database["public"]["Enums"]["confidence_tier"]
          description?: string | null
          id?: string
          is_active?: boolean
          is_blocking?: boolean
          migration_only?: boolean
          model_tier?: Database["public"]["Enums"]["model_tier"]
          name: string
          processing_model?: string | null
          requires_browserless?: boolean
          skip_in_blog_mode?: boolean
          sort_order?: number
          stage_number: number
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_number?: number
          blog_system_prompt?: string | null
          confidence_tier?: Database["public"]["Enums"]["confidence_tier"]
          description?: string | null
          id?: string
          is_active?: boolean
          is_blocking?: boolean
          migration_only?: boolean
          model_tier?: Database["public"]["Enums"]["model_tier"]
          name?: string
          processing_model?: string | null
          requires_browserless?: boolean
          skip_in_blog_mode?: boolean
          sort_order?: number
          stage_number?: number
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action_type: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action_type: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_flags: {
        Row: {
          admin_notes: string | null
          admin_status: string
          agent_name: string
          agent_number: number
          agent_run_id: string
          check_finding: string | null
          check_name: string
          check_severity: string
          created_at: string
          flagged_by: string
          id: string
          page_id: string
          page_slug: string | null
          page_url: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          admin_status?: string
          agent_name: string
          agent_number: number
          agent_run_id: string
          check_finding?: string | null
          check_name: string
          check_severity: string
          created_at?: string
          flagged_by: string
          id?: string
          page_id: string
          page_slug?: string | null
          page_url: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          admin_status?: string
          agent_name?: string
          agent_number?: number
          agent_run_id?: string
          check_finding?: string | null
          check_name?: string
          check_severity?: string
          created_at?: string
          flagged_by?: string
          id?: string
          page_id?: string
          page_slug?: string | null
          page_url?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finding_flags_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_flags_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      page_queue: {
        Row: {
          batch_name: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          id: string
          new_url: string
          old_url: string | null
          pipeline_profile: Database["public"]["Enums"]["pipeline_profile"]
          promoted_page_id: string | null
          slug: string | null
          sort_order: number
          status: Database["public"]["Enums"]["queue_status"]
          target_keyword: string | null
          updated_at: string
        }
        Insert: {
          batch_name?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          new_url: string
          old_url?: string | null
          pipeline_profile?: Database["public"]["Enums"]["pipeline_profile"]
          promoted_page_id?: string | null
          slug?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["queue_status"]
          target_keyword?: string | null
          updated_at?: string
        }
        Update: {
          batch_name?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          new_url?: string
          old_url?: string | null
          pipeline_profile?: Database["public"]["Enums"]["pipeline_profile"]
          promoted_page_id?: string | null
          slug?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["queue_status"]
          target_keyword?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_queue_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_queue_promoted_page_id_fkey"
            columns: ["promoted_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          created_by: string
          figma_comp_path: string | null
          id: string
          mode: Database["public"]["Enums"]["page_mode"]
          new_url: string
          old_url: string | null
          pipeline_profile: Database["public"]["Enums"]["pipeline_profile"]
          slug: string | null
          status: Database["public"]["Enums"]["page_status"]
          target_keyword: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          figma_comp_path?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["page_mode"]
          new_url: string
          old_url?: string | null
          pipeline_profile?: Database["public"]["Enums"]["pipeline_profile"]
          slug?: string | null
          status?: Database["public"]["Enums"]["page_status"]
          target_keyword?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          figma_comp_path?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["page_mode"]
          new_url?: string
          old_url?: string | null
          pipeline_profile?: Database["public"]["Enums"]["pipeline_profile"]
          slug?: string | null
          status?: Database["public"]["Enums"]["page_status"]
          target_keyword?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_rejections: {
        Row: {
          created_at: string
          email_domain: string
          id: string
          reason: string
        }
        Insert: {
          created_at?: string
          email_domain: string
          id?: string
          reason?: string
        }
        Update: {
          created_at?: string
          email_domain?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator"
      confidence_tier: "high" | "medium" | "lower"
      model_tier: "haiku" | "sonnet"
      page_mode: "migration" | "ongoing"
      page_status:
        | "pending"
        | "in_progress"
        | "passed"
        | "failed"
        | "passed_with_warnings"
        | "archived"
      pipeline_profile: "full" | "blog"
      queue_status: "queued" | "claimed" | "promoted" | "skipped"
      run_status:
        | "not_started"
        | "skipped"
        | "queued"
        | "running"
        | "passed"
        | "failed"
        | "warning"
        | "error"
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
      app_role: ["admin", "operator"],
      confidence_tier: ["high", "medium", "lower"],
      model_tier: ["haiku", "sonnet"],
      page_mode: ["migration", "ongoing"],
      page_status: [
        "pending",
        "in_progress",
        "passed",
        "failed",
        "passed_with_warnings",
        "archived",
      ],
      pipeline_profile: ["full", "blog"],
      queue_status: ["queued", "claimed", "promoted", "skipped"],
      run_status: [
        "not_started",
        "skipped",
        "queued",
        "running",
        "passed",
        "failed",
        "warning",
        "error",
      ],
    },
  },
} as const
