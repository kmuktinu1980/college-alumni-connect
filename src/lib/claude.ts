import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One place to build the Claude client. Keys are trimmed (stray spaces from
 * pasting are common), and ANTHROPIC_WORKSPACE_ID is sent when set, for API
 * keys created at the organization level rather than inside a workspace.
 */
export function claudeClient(opts: { timeout: number }) {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
    timeout: opts.timeout,
    maxRetries: 1,
    defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined,
  });
}

/**
 * Ask Claude for structured output through a single tool, without forcing
 * tool_choice (some models, e.g. those that think by default, reject forced
 * tool use). Claude is asked to call the tool; if it answers in text
 * instead, a JSON object in that text is accepted. Returns the tool input.
 */
export async function callTool(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "tool_choice" | "tools"> & { tool: Anthropic.Tool },
): Promise<Record<string, unknown>> {
  const { tool, messages, ...rest } = params;
  const nudge = `Respond by calling the ${tool.name} tool exactly once with your answer.`;
  const last = messages[messages.length - 1];
  const withNudge: Anthropic.MessageParam[] = [
    ...messages.slice(0, -1),
    {
      ...last,
      content:
        typeof last.content === "string"
          ? `${last.content}\n\n${nudge}`
          : [...last.content, { type: "text" as const, text: nudge }],
    },
  ];
  const res = await client.messages.create({ ...rest, messages: withNudge, tools: [tool], tool_choice: { type: "auto" } });

  const use = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (use && use.type === "tool_use") return use.input as Record<string, unknown>;

  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  throw new Error(`Claude didn't return ${tool.name} output (stop_reason: ${res.stop_reason})`);
}
