// Server-only: pulls items from each connected tool and upserts them as tasks.
import { appUserReconnectRequired, callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { decrypt, keyNameFor } from "@/lib/crypto.server";
import type { TaskStatus } from "@/lib/connectors";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.Read",
  "Calendars.Read",
];

interface NormalizedItem {
  external_id: string;
  title: string;
  description: string | null;
  url: string | null;
  status: TaskStatus;
  due_at: string | null;
}

class ReconnectError extends Error {}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function fetchJira(meta: { site: string; email: string }, token: string) {
  const site = meta.site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const auth = btoa(`${meta.email}:${token}`);
  const res = await fetch(`https://${site}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jql: "assignee = currentUser() AND (statusCategory != Done OR resolved >= -30d) ORDER BY updated DESC",
      maxResults: 50,
      fields: ["summary", "status", "duedate", "resolutiondate"],
    }),
  });
  if (res.status === 401 || res.status === 403) throw new ReconnectError("Jira rejected the credentials");
  if (!res.ok) throw new Error(`Jira request failed [${res.status}]: ${await res.text()}`);
  const data = (await res.json()) as {
    issues: { key: string; fields: { summary: string; status?: { name: string; statusCategory?: { key: string } }; duedate?: string } }[];
  };
  return data.issues.map<NormalizedItem>((i) => {
    const cat = i.fields.status?.statusCategory?.key;
    return {
      external_id: i.key,
      title: `${i.key} · ${i.fields.summary}`,
      description: i.fields.status?.name ?? null,
      url: `https://${site}/browse/${i.key}`,
      status: cat === "done" ? "done" : cat === "indeterminate" ? "now" : "soon",
      due_at: i.fields.duedate ? new Date(i.fields.duedate).toISOString() : null,
    };
  });
}

async function gw(connectorId: string, key: string, path: string, init?: RequestInit, scopes?: string[]) {
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId,
    path,
    ...(init ? { init } : {}),
    ...(scopes ? { requiredScopes: scopes } : {}),
  });
  if (await appUserReconnectRequired(res)) throw new ReconnectError("Reconnect required");
  if (!res.ok) throw new Error(`${connectorId} request failed [${res.status}]: ${await res.text()}`);
  return res.json();
}

async function fetchOutlook(key: string) {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86400000);
  const startOfDay = new Date(now);
  startOfDay.setHours(23, 59, 59, 999);
  const [mail, cal] = await Promise.all([
    gw(
      "microsoft_outlook",
      key,
      "/me/messages?$top=25&$filter=flag/flagStatus eq 'flagged'&$select=id,subject,webLink,bodyPreview,flag",
      undefined,
      OUTLOOK_SCOPES,
    ) as Promise<{ value: { id: string; subject: string; webLink: string; bodyPreview: string; flag?: { dueDateTime?: { dateTime: string } } }[] }>,
    gw(
      "microsoft_outlook",
      key,
      `/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=25&$select=id,subject,webLink,start,location`,
      { headers: { Prefer: 'outlook.timezone="UTC"' } },
      OUTLOOK_SCOPES,
    ) as Promise<{ value: { id: string; subject: string; webLink: string; start: { dateTime: string }; location?: { displayName?: string } }[] }>,
  ]);
  const items: NormalizedItem[] = mail.value.map((m) => ({
    external_id: `mail:${m.id}`,
    title: m.subject || "(no subject)",
    description: m.bodyPreview?.slice(0, 200) ?? null,
    url: m.webLink,
    status: "soon",
    due_at: m.flag?.dueDateTime?.dateTime ? new Date(m.flag.dueDateTime.dateTime + "Z").toISOString() : null,
  }));
  for (const e of cal.value) {
    const start = new Date(e.start.dateTime + "Z");
    items.push({
      external_id: `event:${e.id}`,
      title: e.subject || "(untitled event)",
      description: e.location?.displayName || "Calendar event",
      url: e.webLink,
      status: start <= startOfDay ? "now" : "soon",
      due_at: start.toISOString(),
    });
  }
  return items;
}

async function fetchNotion(key: string) {
  const data = (await gw("notion", key, "/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Notion-Version": "2025-09-03" },
    body: JSON.stringify({
      page_size: 25,
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
  })) as {
    results: { id: string; url: string; last_edited_time: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }> }[];
  };
  return data.results.map<NormalizedItem>((p) => {
    const titleProp = Object.values(p.properties ?? {}).find((v) => v.type === "title");
    const title = titleProp?.title?.map((t) => t.plain_text).join("") || "Untitled page";
    return {
      external_id: p.id,
      title,
      description: `Edited ${new Date(p.last_edited_time).toLocaleDateString()}`,
      url: p.url,
      status: "soon",
      due_at: null,
    };
  });
}

/** Sync one user's enabled connectors. Returns per-connector results. */
export async function syncUser(userId: string) {
  const db = await admin();
  const { data: conns, error } = await db
    .from("app_user_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) throw error;

  const results: { connector: string; ok: boolean; count?: number; error?: string }[] = [];
  for (const c of conns ?? []) {
    try {
      const secret = decrypt(c.connection_key_ciphertext, keyNameFor(c.connector_id));
      let items: NormalizedItem[] = [];
      if (c.connector_id === "jira") items = await fetchJira(c.meta as { site: string; email: string }, secret);
      else if (c.connector_id === "microsoft_outlook") items = await fetchOutlook(secret);
      else if (c.connector_id === "notion") items = await fetchNotion(secret);

      const { data: existing } = await db
        .from("tasks")
        .select("id, external_id, status")
        .eq("user_id", userId)
        .eq("source", c.connector_id);
      const byExt = new Map((existing ?? []).map((t) => [t.external_id, t]));
      const now = new Date().toISOString();
      for (const it of items) {
        const prev = byExt.get(it.external_id);
        if (prev) {
          // Keep the user's own status choice unless the tool says it's done.
          const status = it.status === "done" ? "done" : prev.status;
          await db
            .from("tasks")
            .update({
              title: it.title,
              description: it.description,
              url: it.url,
              due_at: it.due_at,
              status,
              ...(status === "done" && prev.status !== "done" ? { completed_at: now } : {}),
              updated_at: now,
            })
            .eq("id", prev.id);
        } else {
          await db.from("tasks").insert({
            user_id: userId,
            source: c.connector_id,
            ...it,
            completed_at: it.status === "done" ? now : null,
          });
        }
      }
      await db
        .from("app_user_connections")
        .update({ last_synced_at: now, reconnect_required: false })
        .eq("id", c.id);
      results.push({ connector: c.connector_id, ok: true, count: items.length });
    } catch (e) {
      if (e instanceof ReconnectError) {
        await db.from("app_user_connections").update({ reconnect_required: true }).eq("id", c.id);
      }
      console.error(`sync ${c.connector_id} failed`, e);
      results.push({ connector: c.connector_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
