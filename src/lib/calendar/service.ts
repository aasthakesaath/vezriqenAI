import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEvent, deleteEvent, fetchBusyPeriods, getAccessToken, type BusyPeriod } from "./google";

/**
 * Ownership guard for PRD §11's hardest rule: "Vezri must never edit/delete a
 * non-Vezri event."
 *
 * The check is a lookup in our own table rather than a property of the event as
 * Google reports it, because an attacker-supplied or stale event id must fail
 * closed. If we did not create it and record it, we do not touch it.
 */
export async function assertVezriOwned(options: {
  supabase: SupabaseClient;
  userId: string;
  providerEventId: string;
}): Promise<boolean> {
  const { data } = await options.supabase
    .from("calendar_blocks")
    .select("id")
    .eq("user_id", options.userId)
    .eq("provider_event_id", options.providerEventId)
    .eq("vezri_created", true)
    .maybeSingle();
  return Boolean(data);
}

/** Free windows between busy periods, within working hours. */
export function findFreeWindows(options: {
  busy: BusyPeriod[];
  from: Date;
  to: Date;
  minimumMinutes: number;
  dayStartHour?: number;
  dayEndHour?: number;
}): BusyPeriod[] {
  const dayStart = options.dayStartHour ?? 8;
  const dayEnd = options.dayEndHour ?? 21;
  const minimumMs = options.minimumMinutes * 60 * 1000;

  const sorted = [...options.busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const windows: BusyPeriod[] = [];

  for (
    let day = new Date(Date.UTC(options.from.getUTCFullYear(), options.from.getUTCMonth(), options.from.getUTCDate()));
    day <= options.to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const open = new Date(day);
    open.setUTCHours(dayStart, 0, 0, 0);
    const close = new Date(day);
    close.setUTCHours(dayEnd, 0, 0, 0);

    let cursor = open < options.from ? new Date(options.from) : open;

    for (const slot of sorted) {
      if (slot.end <= cursor || slot.start >= close) continue;
      if (slot.start.getTime() - cursor.getTime() >= minimumMs) {
        windows.push({ start: new Date(cursor), end: new Date(slot.start) });
      }
      if (slot.end > cursor) cursor = new Date(slot.end);
    }

    if (close.getTime() - cursor.getTime() >= minimumMs) {
      windows.push({ start: new Date(cursor), end: new Date(close) });
    }
  }

  return windows;
}

/** Total free minutes in a range — the §15 capacity factor and §11 detection. */
export function totalFreeMinutes(windows: BusyPeriod[]): number {
  return Math.round(
    windows.reduce((sum, w) => sum + (w.end.getTime() - w.start.getTime()), 0) / 60000,
  );
}

/**
 * PRD §11 capacity detection — "detect when planned effort exceeds realistic
 * free time". Reports the shortfall; it never resolves it, because §11 requires
 * the user to approve any material tradeoff.
 */
export async function detectCapacity(options: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  from: Date;
  to: Date;
  requiredMinutes: number;
}): Promise<{ availableMinutes: number; requiredMinutes: number; shortfallMinutes: number } | null> {
  try {
    const accessToken = await getAccessToken({ admin: options.admin, userId: options.userId });
    const busy = await fetchBusyPeriods({ accessToken, from: options.from, to: options.to });
    const windows = findFreeWindows({
      busy,
      from: options.from,
      to: options.to,
      minimumMinutes: 25,
    });
    const availableMinutes = totalFreeMinutes(windows);
    return {
      availableMinutes,
      requiredMinutes: options.requiredMinutes,
      shortfallMinutes: Math.max(0, options.requiredMinutes - availableMinutes),
    };
  } catch {
    // Not connected, or Google is unavailable. Capacity stays unknown rather
    // than defaulting to "sufficient", which would overstate Goal Health.
    return null;
  }
}

/** Creates a confirmed block and records it as ours. */
export async function createBlockForTask(options: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  taskId: string;
  taskTitle: string;
  rationale: string | null;
  start: Date;
  end: Date;
  siteUrl: string;
}): Promise<{ eventId: string }> {
  const accessToken = await getAccessToken({ admin: options.admin, userId: options.userId });

  const event = await createEvent({
    accessToken,
    event: {
      summary: options.taskTitle,
      description: options.rationale ?? "Scheduled by Vezriqen AI.",
      start: options.start,
      end: options.end,
      taskUrl: `${options.siteUrl}/today`,
    },
  });

  await options.supabase.from("calendar_blocks").insert({
    user_id: options.userId,
    task_id: options.taskId,
    provider_event_id: event.id,
    start_at: options.start.toISOString(),
    end_at: options.end.toISOString(),
    vezri_created: true,
    confirmed_by_user: true,
  });

  return { eventId: event.id };
}

/** Removes a Vezri block. Refuses anything we did not create. */
export async function removeBlock(options: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  providerEventId: string;
}): Promise<boolean> {
  const owned = await assertVezriOwned({
    supabase: options.supabase,
    userId: options.userId,
    providerEventId: options.providerEventId,
  });
  if (!owned) return false;

  const accessToken = await getAccessToken({ admin: options.admin, userId: options.userId });
  await deleteEvent({ accessToken, eventId: options.providerEventId });

  await options.supabase
    .from("calendar_blocks")
    .delete()
    .eq("provider_event_id", options.providerEventId);

  return true;
}
