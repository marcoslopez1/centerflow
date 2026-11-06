import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeConnect } from "@/lib/connectors.functions";

export const Route = createFileRoute("/api/oauth/return")({
  component: OAuthReturn,
  head: () => ({ meta: [{ title: "Connecting…" }, { name: "robots", content: "noindex" }] }),
});

function OAuthReturn() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finishing the connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const connectorId = sessionStorage.getItem("oauth_pending_connector");
    if (!code || !connectorId) {
      setState("error");
      setMessage("This link is missing connection details. Please try connecting again from Settings.");
      return;
    }
    completeConnect({ data: { code, connectorId } })
      .then(() => {
        sessionStorage.removeItem("oauth_pending_connector");
        setState("done");
        setMessage("Connected! You can close this window and return to the app.");
        // If opened as a popup, close it; the opener will refresh on focus.
        if (window.opener) window.close();
      })
      .catch((e) => {
        setState("error");
        setMessage(e instanceof Error ? e.message : "The connection could not be completed.");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm rounded-2xl bg-card p-8 text-center shadow-elevation-1">
        <div
          className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${
            state === "done"
              ? "bg-success-container text-on-success-container"
              : state === "error"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary-container text-on-primary-container"
          }`}
        >
          {state === "working" ? "…" : state === "done" ? "✓" : "!"}
        </div>
        <p className="m3-title-sm">{message}</p>
        {state !== "working" && (
          <a href="/settings" className="mt-4 inline-block text-sm font-medium text-primary underline">
            Back to Settings
          </a>
        )}
      </div>
    </div>
  );
}
