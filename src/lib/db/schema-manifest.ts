/**
 * Every table and column the application expects, derived from
 * supabase/migrations/.
 *
 * GENERATED — do not edit. Run `node scripts/build-schema-manifest.mjs`
 * after adding a migration; tests/schema-manifest.test.ts fails if this file
 * is out of date.
 *
 * This exists because a migration that was written but never APPLIED is
 * invisible until something tries to write the column, and then it surfaces
 * as a save failure at the end of a long, paid-for operation:
 *
 *   "Could not find the 'short_label' column of 'goals' in the schema cache"
 *
 * The extract route checks this before calling the model, so a missing column
 * costs a fast 503 naming the column instead of two minutes of extraction
 * thrown away at the final write.
 */

export const EXPECTED_SCHEMA: Record<string, readonly string[]> = {
  "ai_action_logs": [
    "action_type", // 0002_plan_structure.sql
    "created_at", // 0002_plan_structure.sql
    "explanation", // 0002_plan_structure.sql
    "goal_id", // 0002_plan_structure.sql
    "id", // 0002_plan_structure.sql
    "model_version", // 0002_plan_structure.sql
    "structured_input", // 0002_plan_structure.sql
    "structured_output", // 0002_plan_structure.sql
    "user_id", // 0002_plan_structure.sql
  ],
  "calendar_blocks": [
    "confirmed_by_user", // 0004_calendar_email.sql
    "created_at", // 0004_calendar_email.sql
    "end_at", // 0004_calendar_email.sql
    "id", // 0004_calendar_email.sql
    "provider_event_id", // 0004_calendar_email.sql
    "start_at", // 0004_calendar_email.sql
    "task_id", // 0004_calendar_email.sql
    "user_id", // 0004_calendar_email.sql
    "vezri_created", // 0004_calendar_email.sql
  ],
  "calendar_connections": [
    "connected_at", // 0004_calendar_email.sql
    "google_email", // 0004_calendar_email.sql
    "last_synced_at", // 0004_calendar_email.sql
    "provider", // 0004_calendar_email.sql
    "scopes", // 0004_calendar_email.sql
    "status", // 0004_calendar_email.sql
    "user_id", // 0004_calendar_email.sql
  ],
  "calendar_credentials": [
    "access_token_cipher", // 0004_calendar_email.sql
    "expires_at", // 0004_calendar_email.sql
    "key_version", // 0004_calendar_email.sql
    "refresh_token_cipher", // 0004_calendar_email.sql
    "token_auth_tag", // 0004_calendar_email.sql
    "token_iv", // 0004_calendar_email.sql
    "updated_at", // 0004_calendar_email.sql
    "user_id", // 0004_calendar_email.sql
  ],
  "check_ins": [
    "created_at", // 0003_execution.sql
    "id", // 0003_execution.sql
    "note", // 0003_execution.sql
    "reminder_id", // 0003_execution.sql
    "snooze_until", // 0003_execution.sql
    "state", // 0003_execution.sql
    "task_id", // 0003_execution.sql
    "user_id", // 0003_execution.sql
  ],
  "email_action_tokens": [
    "action", // 0004_calendar_email.sql
    "created_at", // 0004_calendar_email.sql
    "expires_at", // 0004_calendar_email.sql
    "id", // 0004_calendar_email.sql
    "reminder_id", // 0004_calendar_email.sql
    "task_id", // 0004_calendar_email.sql
    "token_hash", // 0004_calendar_email.sql
    "used_at", // 0004_calendar_email.sql
    "user_id", // 0004_calendar_email.sql
  ],
  "execution_blocks": [
    "accepted", // 0003_execution.sql
    "category", // 0003_execution.sql
    "check_in_id", // 0003_execution.sql
    "created_at", // 0003_execution.sql
    "explanation", // 0003_execution.sql
    "id", // 0003_execution.sql
    "intervention_type", // 0003_execution.sql
    "recommendation", // 0003_execution.sql
    "resolved_at", // 0003_execution.sql
    "task_id", // 0003_execution.sql
    "user_id", // 0003_execution.sql
    "user_text", // 0003_execution.sql
  ],
  "execution_profiles": [
    "common_blocks", // 0001_foundation.sql
    "completion_by_time", // 0001_foundation.sql
    "effective_interventions", // 0001_foundation.sql
    "estimate_accuracy", // 0001_foundation.sql
    "preferred_block_minutes", // 0001_foundation.sql
    "profile_confidence", // 0001_foundation.sql
    "snooze_patterns", // 0001_foundation.sql
    "updated_at", // 0001_foundation.sql
    "user_id", // 0001_foundation.sql
  ],
  "goal_audits": [
    "created_at", // 0003_execution.sql
    "explanation", // 0003_execution.sql
    "goal_id", // 0003_execution.sql
    "health_inputs", // 0003_execution.sql
    "health_score", // 0003_execution.sql
    "health_status", // 0003_execution.sql
    "id", // 0003_execution.sql
    "missing_items", // 0003_execution.sql
    "user_id", // 0003_execution.sql
  ],
  "goals": [
    "activated_at", // 0001_foundation.sql
    "constraints", // 0001_foundation.sql
    "created_at", // 0001_foundation.sql
    "dates_reshaped_at", // 0008_timezone_and_dates.sql
    "health_score", // 0001_foundation.sql
    "health_status", // 0001_foundation.sql
    "id", // 0001_foundation.sql
    "normalized_goal", // 0001_foundation.sql
    "primary_flag", // 0001_foundation.sql
    "short_label", // 0005_goal_short_label.sql
    "status", // 0001_foundation.sql
    "success_criteria", // 0001_foundation.sql
    "target_date", // 0001_foundation.sql
    "user_goal_text", // 0001_foundation.sql
    "user_id", // 0001_foundation.sql
  ],
  "milestones": [
    "confidence", // 0002_plan_structure.sql
    "created_at", // 0002_plan_structure.sql
    "date_anchor", // 0008_timezone_and_dates.sql
    "goal_id", // 0002_plan_structure.sql
    "id", // 0002_plan_structure.sql
    "origin", // 0002_plan_structure.sql
    "sort_order", // 0002_plan_structure.sql
    "source_anchor_id", // 0002_plan_structure.sql
    "status", // 0002_plan_structure.sql
    "target_date", // 0002_plan_structure.sql
    "title", // 0002_plan_structure.sql
    "user_id", // 0002_plan_structure.sql
    "weight", // 0002_plan_structure.sql
  ],
  "plan_documents": [
    "byte_size", // 0001_foundation.sql
    "created_at", // 0001_foundation.sql
    "extracted_structure", // 0007_resumable_extraction.sql
    "extracted_text", // 0001_foundation.sql
    "extraction_attempts", // 0007_resumable_extraction.sql
    "extraction_note", // 0007_resumable_extraction.sql
    "extraction_passes", // 0007_resumable_extraction.sql
    "extraction_state", // 0007_resumable_extraction.sql
    "extraction_usage", // 0007_resumable_extraction.sql
    "filename", // 0001_foundation.sql
    "goal_id", // 0001_foundation.sql
    "id", // 0001_foundation.sql
    "is_primary", // 0001_foundation.sql
    "mime_type", // 0001_foundation.sql
    "page_count", // 0001_foundation.sql
    "parse_error", // 0001_foundation.sql
    "parse_status", // 0001_foundation.sql
    "source_kind", // 0001_foundation.sql
    "storage_path", // 0001_foundation.sql
    "user_id", // 0001_foundation.sql
  ],
  "plan_source_anchors": [
    "created_at", // 0001_foundation.sql
    "document_id", // 0001_foundation.sql
    "excerpt", // 0001_foundation.sql
    "id", // 0001_foundation.sql
    "location_metadata", // 0001_foundation.sql
    "page_or_section", // 0001_foundation.sql
    "user_id", // 0001_foundation.sql
  ],
  "profiles": [
    "accountability_level", // 0001_foundation.sql
    "created_at", // 0001_foundation.sql
    "email", // 0001_foundation.sql
    "email_reminders", // 0006_reminder_channels.sql
    "id", // 0001_foundation.sql
    "name", // 0001_foundation.sql
    "onboarded_at", // 0001_foundation.sql
    "primary_goal_id", // 0001_foundation.sql
    "productive_window", // 0001_foundation.sql
    "quiet_hours_end", // 0001_foundation.sql
    "quiet_hours_start", // 0001_foundation.sql
    "reminder_style", // 0001_foundation.sql
    "timezone", // 0001_foundation.sql
    "timezone_set_by_user", // 0008_timezone_and_dates.sql
  ],
  "reminders": [
    "channel", // 0003_execution.sql
    "created_at", // 0003_execution.sql
    "delivery_status", // 0003_execution.sql
    "failure_reason", // 0003_execution.sql
    "follow_up_count", // 0003_execution.sql
    "id", // 0003_execution.sql
    "responded_at", // 0003_execution.sql
    "response", // 0003_execution.sql
    "response_required", // 0003_execution.sql
    "scheduled_at", // 0003_execution.sql
    "sent_at", // 0003_execution.sql
    "task_id", // 0003_execution.sql
    "type", // 0003_execution.sql
    "user_id", // 0003_execution.sql
  ],
  "task_dependencies": [
    "created_at", // 0002_plan_structure.sql
    "dependency_type", // 0002_plan_structure.sql
    "depends_on_task_id", // 0002_plan_structure.sql
    "external_party_name", // 0002_plan_structure.sql
    "id", // 0002_plan_structure.sql
    "resolved_at", // 0002_plan_structure.sql
    "task_id", // 0002_plan_structure.sql
    "user_id", // 0002_plan_structure.sql
  ],
  "tasks": [
    "completed_at", // 0002_plan_structure.sql
    "confidence", // 0002_plan_structure.sql
    "created_at", // 0002_plan_structure.sql
    "date_anchor", // 0008_timezone_and_dates.sql
    "deadline", // 0002_plan_structure.sql
    "estimated_minutes", // 0002_plan_structure.sql
    "goal_id", // 0002_plan_structure.sql
    "id", // 0002_plan_structure.sql
    "milestone_id", // 0002_plan_structure.sql
    "notes", // 0002_plan_structure.sql
    "origin", // 0002_plan_structure.sql
    "priority", // 0002_plan_structure.sql
    "rationale", // 0002_plan_structure.sql
    "recurrence_rule", // 0002_plan_structure.sql
    "source_anchor_id", // 0002_plan_structure.sql
    "start_by", // 0002_plan_structure.sql
    "start_by_reason", // 0002_plan_structure.sql
    "status", // 0002_plan_structure.sql
    "task_type", // 0002_plan_structure.sql
    "title", // 0002_plan_structure.sql
    "user_id", // 0002_plan_structure.sql
  ],
};

/** Tables in the order the migrations create them. */
export const EXPECTED_TABLES = Object.keys(EXPECTED_SCHEMA);
