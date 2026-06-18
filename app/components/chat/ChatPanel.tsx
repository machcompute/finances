"use client";

import OpenAI from "openai";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAssistantTool,
  useAssistantInstructions,
  useThreadRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type TextMessagePart,
  type ToolCallMessagePart,
  type ThreadMessage,
} from "@assistant-ui/react";
import { Eraser } from "lucide-react";
import { toJSONSchema } from "assistant-stream";
import { Thread } from "@/app/components/assistant-ui/thread";
import { getChatSettings } from "@/app/lib/chatSettings";
import {
  queryTransactionsTool,
  getSummaryTool,
  listAccountsTool,
  listCategoriesTool,
  proposeAnnotationTool,
} from "@/app/components/chat/tools";

function toOpenAIMessages(
  messages: readonly ThreadMessage[],
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    const text = m.content
      .filter((c): c is TextMessagePart => c.type === "text")
      .map((c) => c.text)
      .join("");
    if (m.role === "user") result.push({ role: "user", content: text });
    else if (m.role === "assistant")
      result.push({ role: "assistant", content: text });
  }
  return result;
}

const adapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, context }: ChatModelRunOptions) {
    const { baseUrl, apiKey, model } = getChatSettings();

    if (!baseUrl)
      throw new Error("No server URL set. Open chat settings and enter your model server's base URL.");
    if (!model)
      throw new Error("No model selected. Open chat settings, click Refresh, and pick a model.");

    const client = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey || "none",
      dangerouslyAllowBrowser: true,
    });

    const tools = context.tools
      ? Object.entries(context.tools)
          .filter(([, t]) => t.parameters !== undefined)
          .map(([name, t]) => ({
            type: "function" as const,
            function: {
              name,
              description: t.description ?? "",
              parameters: toJSONSchema(t.parameters!) as Record<string, unknown>,
            },
          }))
      : undefined;

    const history: OpenAI.ChatCompletionMessageParam[] = [
      ...(context.system
        ? [{ role: "system" as const, content: context.system }]
        : []),
      ...toOpenAIMessages(messages),
    ];

    type FnToolCall = OpenAI.ChatCompletionMessageToolCall & { type: "function" };
    type Part = TextMessagePart | ToolCallMessagePart;
    const parts: Part[] = [];

    while (true) {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: history,
          tools: tools?.length ? tools : undefined,
          stream: true,
        },
        { signal: abortSignal },
      );

      let textPartIdx = -1;
      const toolCalls: FnToolCall[] = [];
      const toolCallPartIdx: number[] = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          if (textPartIdx === -1) {
            textPartIdx = parts.length;
            parts.push({ type: "text", text: "" });
          }
          const prev = parts[textPartIdx] as TextMessagePart;
          parts[textPartIdx] = { type: "text", text: prev.text + delta.content };
          yield { content: [...parts] };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: tc.id ?? "",
                type: "function",
                function: { name: "", arguments: "" },
              } as FnToolCall;
              toolCallPartIdx[idx] = parts.length;
              parts.push({
                type: "tool-call",
                toolCallId: tc.id ?? "",
                toolName: "",
                argsText: "",
                args: {},
              });
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCalls[idx].function.arguments += tc.function.arguments;

            parts[toolCallPartIdx[idx]] = {
              type: "tool-call",
              toolCallId: toolCalls[idx].id,
              toolName: toolCalls[idx].function.name,
              argsText: toolCalls[idx].function.arguments,
              args: {},
            };
            yield { content: [...parts] };
          }
        }
      }

      if (toolCalls.length === 0) break;

      history.push({
        role: "assistant",
        content:
          (parts[textPartIdx] as TextMessagePart | undefined)?.text || null,
        tool_calls: toolCalls,
      });

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const toolDef = context.tools?.[tc.function.name];
        let result: unknown = "unknown tool";
        let isError = false;
        if (toolDef?.execute) {
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            result = await toolDef.execute(args, {
              toolCallId: tc.id,
              abortSignal,
              human: () => Promise.resolve(null),
            });
          } catch (e) {
            result = `Error: ${e}`;
            isError = true;
          }
        }
        const resultStr =
          typeof result === "string" ? result : JSON.stringify(result);
        parts[toolCallPartIdx[i]] = {
          ...(parts[toolCallPartIdx[i]] as ToolCallMessagePart),
          result,
          isError,
        };
        yield { content: [...parts] };
        history.push({ role: "tool", tool_call_id: tc.id, content: resultStr });
      }
    }
  },
};

const SYSTEM_PROMPT = `\
You are the assistant inside a personal finance tracker. Help the user understand their money and tidy up their records. Act decisively and use the tools rather than asking the user for details you can look up yourself.

Tools:
- \`get_summary\` — totals (income, expense, balance) and per-category breakdown, optionally by date range or account.
- \`query_transactions\` — find rows by account name, category, kind, date range, or description search; returns transaction ids.
- \`list_accounts\` — account names and balances. \`list_categories\` — existing categories.
- \`propose_annotation\` — set a category and/or note on transactions by id.

Use account names (from \`list_accounts\`) — never invent ids. To annotate, call \`query_transactions\` to get the ids, then \`propose_annotation\`. The app shows the user a confirmation dialog and only applies the change if they approve, so don't ask for permission first — just propose; the tool result tells you whether they approved.

Be concise. Dates are ISO (YYYY-MM-DD).`;

function ChatTools() {
  useAssistantInstructions(SYSTEM_PROMPT);
  useAssistantTool(queryTransactionsTool);
  useAssistantTool(getSummaryTool);
  useAssistantTool(listAccountsTool);
  useAssistantTool(listCategoriesTool);
  useAssistantTool(proposeAnnotationTool);
  return null;
}

function ClearButton() {
  const thread = useThreadRuntime();
  return (
    <button
      onClick={() => thread.reset()}
      className="flex items-center gap-1 text-xs text-mc-gray hover:text-mc-dark transition-colors"
      title="Clear chat"
    >
      <Eraser className="w-3.5 h-3.5" />
    </button>
  );
}

export default function ChatPanel() {
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatTools />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center justify-end border-b border-mc-gray/15 px-3">
          <ClearButton />
        </div>
        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

export { ClearButton };
