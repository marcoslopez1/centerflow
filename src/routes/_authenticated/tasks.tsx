import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Plus, RefreshCw, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { listTasks, createTask, updateTaskStatus, deleteTask } from "@/lib/tasks.functions";
import { syncNow } from "@/lib/connectors.functions";
import { SOURCE_LABEL, STATUSES, type TaskStatus } from "@/lib/connectors";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  head: () => ({
    meta: [
      { title: "Tasks · Taskflow" },
      { name: "description", content: "Your Now / Soon / Done board with tasks synced from Jira, Outlook and Notion." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Task = Tables<"tasks">;

const ORDER: TaskStatus[] = ["now", "soon", "done"];

function TasksPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus({ data: { id, status } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not move the task"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTask({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete the task"),
  });

  const sync = useMutation({
    mutationFn: () => syncNow(),
    onSuccess: (r) => {
      invalidate();
      const failed = r.results.filter((x) => !x.ok);
      const synced = r.results.filter((x) => x.ok);
      if (r.results.length === 0) toast.info("No tools connected yet — add one in Settings.");
      else if (failed.length === 0)
        toast.success(`Synced ${synced.reduce((a, x) => a + (x.count ?? 0), 0)} items`);
      else
        toast.warning(
          `Synced with issues: ${failed.map((f) => `${f.connector} (${f.error ?? "failed"})`).join(", ")}`,
        );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="m3-headline">Your board</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.filter((t) => t.status !== "done").length} open · {tasks.filter((t) => t.status === "done").length} done
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="state-layer rounded-full"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sync now
          </Button>
          <Button className="state-layer rounded-full" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid flex-1 gap-4 md:grid-cols-3">
          {ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={tasks.filter((t) => t.status === status)}
              onMove={(id, s) => move.mutate({ id, status: s })}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </div>
      )}

      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} onSaved={invalidate} />
    </AppShell>
  );
}

function Column({
  status,
  tasks,
  onMove,
  onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const meta = STATUSES.find((s) => s.id === status)!;
  return (
    <section className="flex flex-col rounded-3xl bg-surface-container p-3">
      <header className="flex items-baseline gap-2 px-2 pt-1 pb-3">
        <h2 className="m3-title-sm">{meta.label}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        <span className="ml-auto text-xs text-muted-foreground">{meta.hint}</span>
      </header>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Nothing here
          </p>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onMove={onMove} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  onMove,
  onDelete,
}: {
  task: Task;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const idx = ORDER.indexOf(task.status as TaskStatus);
  const overdue = task.status !== "done" && task.due_at && new Date(task.due_at) < new Date();
  return (
    <article className="group rounded-2xl bg-card p-4 shadow-elevation-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-medium wrap-break-word ${task.status === "done" ? "line-through opacity-60" : ""}`}>
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          )}
        </div>
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noreferrer"
            className="state-layer rounded-full p-1 text-muted-foreground"
            title="Open in source tool"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          {SOURCE_LABEL[task.source] ?? task.source}
        </span>
        {task.due_at && (
          <span className={`text-[11px] ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {overdue ? "Overdue · " : ""}
            {new Date(task.due_at).toLocaleDateString()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {idx > 0 && (
            <button
              type="button"
              title={`Move to ${STATUSES[idx - 1].label}`}
              className="state-layer rounded-full p-1 text-muted-foreground"
              onClick={() => onMove(task.id, ORDER[idx - 1])}
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          {idx < ORDER.length - 1 && (
            <button
              type="button"
              title={`Move to ${STATUSES[idx + 1].label}`}
              className="state-layer rounded-full p-1 text-muted-foreground"
              onClick={() => onMove(task.id, ORDER[idx + 1])}
            >
              <ChevronRight className="size-4" />
            </button>
          )}
          <button
            type="button"
            title="Delete"
            className="state-layer rounded-full p-1 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("soon");
  const [due, setDue] = useState("");

  const save = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          title,
          description: description || undefined,
          status,
          due_at: due ? new Date(`${due}T17:00:00`).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Task added");
      setTitle("");
      setDescription("");
      setStatus("soon");
      setDue("");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the task"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">Notes (optional)</Label>
            <Textarea id="t-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Lane</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-due">Due (optional)</Label>
              <Input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="state-layer rounded-full" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
