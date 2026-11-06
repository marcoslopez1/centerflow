import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const DEFAULT_MODELS: Record<string, string> = {
  lovable: "openai/gpt-6-astra",
  openai: "gpt-5",
  anthropic: "claude-sonnet-4-5",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- Auth: validate the bearer token ---
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError(401, "Sign in to use the chat.");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData.user) return jsonError(401, "Your session expired. Sign in again.");
        const userId = authData.user.id;

        // --- Input ---
        let body: { threadId?: string; messages?: UIMessage[] };
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Invalid request body.");
        }
        const threadId = body.threadId;
        const messages = body.messages;
        if (!threadId || !Array.isArray(messages) || messages.length === 0) {
          return jsonError(400, "Missing conversation or messages.");
        }

        // --- Authorize the thread ---
        const { data: thread } = await supabaseAdmin
          .from("chat_threads")
          .select("id")
          .eq("id", threadId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!thread) return jsonError(404, "Conversation not found.");

        // --- AI settings for this user ---
        const { data: settings } = await supabaseAdmin
          .from("ai_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        const provider = (settings?.provider ?? "lovable") as "lovable" | "openai" | "anthropic";
        const model = settings?.model || DEFAULT_MODELS[provider];

        // --- Task context so the assistant can discuss the user's work ---
        const { data: tasks } = await supabaseAdmin
          .from("tasks")
          .select("title, description, status, source, due_at, url")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(100);
        const taskLines = (tasks ?? []).map(
          (t) =>
            `- [${t.status}] (${t.source}) ${t.title}${t.due_at ? ` — due ${t.due_at.slice(0, 10)}` : ""}${t.description ? ` — ${t.description.slice(0, 120)}` : ""}`,
        );
        const system = [
          "You are Taskflow Assistant, a helpful assistant inside a personal task management app.",
          "The user connects tools like Jira, Outlook and Notion; their synced items appear as tasks with statuses now / soon / done.",
          "Answer questions about their workload, prioritize, summarize and suggest next steps. Be concise and concrete.",
          "When listing tasks, use markdown. Never invent tasks that are not in the list.",
          "",
          "Current tasks:",
          taskLines.length > 0 ? taskLines.join("\n") : "(no tasks yet)",
        ].join("\n");

        // --- Build the model ---
        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        let result;
        try {
          if (provider === "openai") {
            const { decrypt } = await import("@/lib/crypto.server");
            if (!settings?.openai_key_ciphertext) return jsonError(400, "Add your OpenAI API key in Settings first.");
            const openai = createOpenAI({ apiKey: decrypt(settings.openai_key_ciphertext) });
            result = streamText({
              model: openai.chat(model),
              system,
              messages: await convertToModelMessages(messages),
              abortSignal: request.signal,
            });
          } else if (provider === "anthropic") {
            const { decrypt } = await import("@/lib/crypto.server");
            if (!settings?.anthropic_key_ciphertext) return jsonError(400, "Add your Anthropic API key in Settings first.");
            const anthropic = createAnthropic({ apiKey: decrypt(settings.anthropic_key_ciphertext) });
            result = streamText({
              model: anthropic(model),
              system,
              messages: await convertToModelMessages(messages),
              abortSignal: request.signal,
            });
          } else {
            const apiKey = process.env.LOVABLE_API_KEY;
            if (!apiKey) return jsonError(500, "Built-in AI is not configured.");
            const lovableProvider = createOpenAI({
              baseURL: GATEWAY_URL,
              apiKey,
              headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
              fetch: runIdFetch.fetch,
            });
            result = streamText({
              model: lovableProvider.responses(model),
              system,
              messages: await convertToModelMessages(messages),
              abortSignal: request.signal,
              providerOptions: {
                openai: {
                  store: false,
                  forceReasoning: true,
                  reasoningEffort: "medium",
                  reasoningSummary: "auto",
                  include: ["reasoning.encrypted_content"],
                },
              },
            });
          }
        } catch (e) {
          console.error("chat model setup failed", e);
          return jsonError(500, "Could not start the AI model. Check your AI settings.");
        }

        // --- Persist the user message, then the assistant reply on finish ---
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          const { data: existing } = await supabaseAdmin
            .from("chat_messages")
            .select("id")
            .eq("thread_id", threadId)
            .eq("message_id", lastUser.id)
            .maybeSingle();
          if (!existing) {
            const { error } = await supabaseAdmin.from("chat_messages").insert({
              thread_id: threadId,
              user_id: userId,
              message_id: lastUser.id,
              role: "user",
              parts: lastUser.parts as unknown as never,
            });
            if (error) console.error("failed to save user message", error);
          }
        }

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: provider === "lovable",
          onFinish: async ({ responseMessage }) => {
            const titleFromUser = lastUser?.parts
              ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join(" ")
              .slice(0, 60);
            const { error: msgErr } = await supabaseAdmin.from("chat_messages").insert({
              thread_id: threadId,
              user_id: userId,
              message_id: responseMessage.id,
              role: "assistant",
              parts: responseMessage.parts as unknown as never,
            });
            if (msgErr) console.error("failed to save assistant message", msgErr);
            const { error: thErr } = await supabaseAdmin
              .from("chat_threads")
              .update({
                updated_at: new Date().toISOString(),
                ...(titleFromUser ? { title: titleFromUser } : {}),
              })
              .eq("id", threadId)
              .eq("title", "New conversation");
            if (thErr) console.error("failed to update thread", thErr);
            await supabaseAdmin
              .from("chat_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
          },
        });
        return withLovableAiGatewayRunIdHeader(response, runIdFetch);
      },
    },
  },
});
