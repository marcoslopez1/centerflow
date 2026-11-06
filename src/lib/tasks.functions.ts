import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["now", "soon", "done"]);

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("user_id", context.userId)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(300),
        description: z.string().trim().max(2000).optional(),
        status: statusEnum.default("soon"),
        due_at: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tasks").insert({
      user_id: context.userId,
      source: "manual",
      title: data.title,
      description: data.description || null,
      status: data.status,
      due_at: data.due_at ?? null,
      completed_at: data.status === "done" ? new Date().toISOString() : null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("tasks")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? now : null,
        updated_at: now,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/** Aggregates for the reports page. */
export const taskStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("source, status, created_at, completed_at, due_at")
      .eq("user_id", context.userId);
    if (error) throw error;
    const rows = data ?? [];

    const byStatus: Record<string, number> = { now: 0, soon: 0, done: 0 };
    const bySource: Record<string, number> = {};
    for (const t of rows) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      bySource[t.source] = (bySource[t.source] ?? 0) + 1;
    }

    // Completions per ISO week, last 12 weeks.
    const weeks: { week: string; completed: number; created: number }[] = [];
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(monday.getTime() - i * 7 * 86400000);
      const end = new Date(start.getTime() + 7 * 86400000);
      const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      weeks.push({
        week: label,
        completed: rows.filter((t) => t.completed_at && new Date(t.completed_at) >= start && new Date(t.completed_at) < end).length,
        created: rows.filter((t) => new Date(t.created_at) >= start && new Date(t.created_at) < end).length,
      });
    }

    const done = rows.filter((t) => t.completed_at);
    const avgDays =
      done.length > 0
        ? done.reduce((acc, t) => acc + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 86400000, 0) / done.length
        : null;

    const overdue = rows.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at) < now).length;

    return {
      total: rows.length,
      byStatus,
      bySource,
      weeks,
      avgCompletionDays: avgDays === null ? null : Math.round(avgDays * 10) / 10,
      overdue,
    };
  });
