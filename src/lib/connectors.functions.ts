import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OAUTH_IDS = ["microsoft_outlook", "notion"] as const;
const CLIENT_ENV: Record<(typeof OAUTH_IDS)[number], string> = {
  microsoft_outlook: "MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY",
  notion: "NOTION_APP_USER_CONNECTOR_CLIENT_API_KEY",
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data, error } = await db
      .from("app_user_connections")
      .select("connector_id, enabled, reconnect_required, last_synced_at, meta")
      .eq("user_id", context.userId);
    if (error) throw error;
    const available: Record<string, boolean> = { jira: true };
    for (const id of OAUTH_IDS) available[id] = !!process.env[CLIENT_ENV[id]];
    return {
      available,
      connections: (data ?? []).map((c) => ({
        connector_id: c.connector_id,
        enabled: c.enabled,
        reconnect_required: c.reconnect_required,
        last_synced_at: c.last_synced_at,
        // only non-secret metadata
        label: (c.meta as { email?: string; site?: string })?.site ?? null,
      })),
    };
  });

export const startConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectorId: string }) => z.object({ connectorId: z.enum(OAUTH_IDS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL, OUTLOOK_SCOPES } = await import("@/lib/sync.server");
    const clientKey = process.env[CLIENT_ENV[data.connectorId]];
    if (!clientKey) throw new Error("This connector has not been set up by the app owner yet.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: data.connectorId,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      ...(data.connectorId === "microsoft_outlook"
        ? { credentialsConfiguration: { scopes: OUTLOOK_SCOPES, domain_hint: "none", prompt: "select_account" } }
        : {}),
    });
    return { authorizationUrl };
  });

export const completeConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; connectorId: string }) =>
    z.object({ code: z.string().min(1), connectorId: z.enum(OAUTH_IDS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL } = await import("@/lib/sync.server");
    const { encrypt } = await import("@/lib/crypto.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== data.connectorId) throw new Error("OAuth completion returned the wrong connector");
    const db = await admin();
    const { error } = await db.from("app_user_connections").upsert(
      {
        user_id: context.userId,
        connector_id: connectorId,
        connection_key_ciphertext: encrypt(connectionAPIKey, "APP_USER_CONNECTION_KEY_SECRET"),
        enabled: true,
        reconnect_required: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const saveJiraConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { site: string; email: string; token: string }) =>
    z
      .object({
        site: z.string().trim().min(3).max(200).regex(/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/?$/i, "Enter a domain like team.atlassian.net"),
        email: z.string().trim().email().max(255),
        token: z.string().trim().min(10).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const site = data.site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    // Verify the credentials before saving.
    const res = await fetch(`https://${site}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${btoa(`${data.email}:${data.token}`)}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Jira didn't accept these details (status ${res.status}). Check the site, email and token.`);
    const { encrypt } = await import("@/lib/crypto.server");
    const db = await admin();
    const { error } = await db.from("app_user_connections").upsert(
      {
        user_id: context.userId,
        connector_id: "jira",
        connection_key_ciphertext: encrypt(data.token),
        meta: { site, email: data.email },
        enabled: true,
        reconnect_required: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const setConnectionEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectorId: string; enabled: boolean }) =>
    z.object({ connectorId: z.string().max(64), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { error } = await db
      .from("app_user_connections")
      .update({ enabled: data.enabled })
      .eq("user_id", context.userId)
      .eq("connector_id", data.connectorId);
    if (error) throw error;
    return { ok: true };
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connectorId: string }) => z.object({ connectorId: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db
      .from("app_user_connections")
      .select("connection_key_ciphertext")
      .eq("user_id", context.userId)
      .eq("connector_id", data.connectorId)
      .maybeSingle();
    if (row && data.connectorId !== "jira") {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      const { decrypt } = await import("@/lib/crypto.server");
      const { GATEWAY_BASE_URL } = await import("@/lib/sync.server");
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: decrypt(row.connection_key_ciphertext, "APP_USER_CONNECTION_KEY_SECRET"),
          connectorId: data.connectorId,
        });
      } catch (e) {
        console.error("gateway disconnect failed", e);
      }
    }
    await db.from("app_user_connections").delete().eq("user_id", context.userId).eq("connector_id", data.connectorId);
    return { ok: true };
  });

export const syncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncUser } = await import("@/lib/sync.server");
    return { results: await syncUser(context.userId) };
  });
