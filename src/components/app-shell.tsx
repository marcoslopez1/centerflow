import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, LayoutList, BarChart3, MessagesSquare, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

const NAV = [
  { to: "/tasks", label: "Tasks", icon: LayoutList },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/chat", label: "Chat", icon: MessagesSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
          <Link to="/tasks" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <CheckSquare className="size-5" />
            </span>
            <span className="m3-title hidden sm:inline">Taskflow</span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || pathname.startsWith(`${to}/`);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`state-layer flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="state-layer ml-1 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="size-4" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
