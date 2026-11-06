import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckSquare, KanbanSquare, BarChart3, MessagesSquare, Plug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Taskflow — every task from every tool, one board" },
      {
        name: "description",
        content:
          "Taskflow pulls your work from Jira, Outlook and Notion into one personal board with Now / Soon / Done lanes, reports and an AI assistant that knows your workload.",
      },
      { property: "og:title", content: "Taskflow — every task from every tool, one board" },
      {
        property: "og:description",
        content:
          "Sync Jira, Outlook and Notion into one personal task board, track progress with reports, and chat with an AI assistant that knows your workload.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const FEATURES = [
  {
    icon: Plug,
    title: "Connect your tools",
    text: "Link Jira, Outlook and Notion in Settings. Items sync in the background and land on your board.",
  },
  {
    icon: KanbanSquare,
    title: "Now / Soon / Done",
    text: "One calm board with three lanes. Move things along as your day progresses.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    text: "See what you completed week by week, where work comes from, and what's overdue.",
  },
  {
    icon: MessagesSquare,
    title: "AI assistant",
    text: "Chat with an assistant that can see your synced tasks and help you prioritize.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CheckSquare className="size-5" />
          </span>
          <span className="m3-title">Taskflow</span>
        </div>
        <div className="ml-auto">
          <Link
            to={signedIn ? "/tasks" : "/auth"}
            className="state-layer inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            {signedIn ? "Open your board" : "Sign in"}
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 text-center sm:pt-24">
        <h1 className="m3-display mx-auto max-w-3xl sm:text-5xl sm:leading-tight">
          Every task from every tool, on one board
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Taskflow syncs Jira issues, flagged Outlook emails, calendar events and Notion pages into a
          single personal board — then helps you finish them.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to={signedIn ? "/tasks" : "/auth"}
            className="state-layer inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-elevation-1"
          >
            {signedIn ? "Open your board" : "Get started"}
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-3xl bg-card p-6 shadow-elevation-1">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
              <Icon className="size-5" />
            </div>
            <h2 className="m3-title-sm mb-1">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
