import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db.from("ai_settings").select("*").eq("user_id", context.userId).maybeSingle();
    return {
      provider: (data?.provider ?? "lovable") as "lovable" | "openai" | "anthropic",
      model: data?.model ?? "",
      hasOpenaiKey: !!data?.openai_key_ciphertext,
      hasAnthropicKey: !!data?.anthropic_key_ciphertext,
    };
  });

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: z.enum(["lovable", "openai", "anthropic"]),
        model: z.string().trim().max(100).optional(),
        openaiKey: z.string().trim().max(500).optional(),
        anthropicKey: z.string().trim().max(500).optional(),
        clearOpenai: z.boolean().optional(),
        clearAnthropic: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { encrypt } = await import("@/lib/crypto.server");
    const db = await admin();
    const { data: prev } = await db.from("ai_settings").select("*").eq("user_id", context.userId).maybeSingle();
    let openai = prev?.openai_key_ciphertext ?? null;
    let anthropic = prev?.anthropic_key_ciphertext ?? null;
    if (data.openaiKey) openai = encrypt(data.openaiKey);
    if (data.anthropicKey) anthropic = encrypt(data.anthropicKey);
    if (data.clearOpenai) openai = null;
    if (data.clearAnthropic) anthropic = null;
    if (data.provider === "openai" && !openai) throw new Error("Add an OpenAI API key to use OpenAI.");
    if (data.provider === "anthropic" && !anthropic) throw new Error("Add an Anthropic API key to use Anthropic.");
    const { error } = await db.from("ai_settings").upsert({
      user_id: context.userId,
      provider: data.provider,
      model: data.model || null,
      openai_key_ciphertext: openai,
      anthropic_key_ciphertext: anthropic,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  });
