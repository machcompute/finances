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
  searchTransactionsTool,
  getSummaryTool,
  listAccountsTool,
  listCategoriesTool,
  proposeCategoryTool,
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
    if (m.role === "user") {
      result.push({ role: "user", content: text });
      continue;
    }
    if (m.role !== "assistant") continue;

    const toolParts = m.content.filter(
      (c): c is ToolCallMessagePart => c.type === "tool-call",
    );
    const completedToolParts = toolParts.filter(isReplayableToolCallPart);
    if (completedToolParts.length === 0) {
      if (!text) continue;
      result.push({ role: "assistant", content: text });
      continue;
    }

    const toolCalls: OpenAI.ChatCompletionMessageToolCall[] =
      completedToolParts.map((part) => ({
        id: part.toolCallId,
        type: "function",
        function: {
          name: part.toolName,
          arguments: part.argsText || JSON.stringify(part.args ?? {}),
        },
      }));
    result.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls,
    });

    for (const part of completedToolParts) {
      result.push({
        role: "tool",
        tool_call_id: part.toolCallId,
        content: stringifyToolResult(part.result),
      });
    }
  }
  return result;
}

function isReplayableToolCallPart(part: ToolCallMessagePart): boolean {
  return (
    part.result !== undefined &&
    Boolean(part.toolCallId) &&
    Boolean(part.toolName) &&
    isValidJson(part.argsText || JSON.stringify(part.args ?? {}))
  );
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value || "{}");
    return true;
  } catch {
    return false;
  }
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
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
        const resultStr = stringifyToolResult(result);
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
You are the assistant inside a personal finance tracker. Help the user inspect transactions, understand spending, and clean up records when they ask for it.

Use tools for facts you can inspect. Do not ask the user for account names, categories, totals, balances, or transaction ids before checking the tools.

Tool guidance:
- \`list_accounts\`: account names, descriptions, transaction counts, and current balances including baselines.
- \`get_summary\`: transaction totals and per-category breakdown for an optional account/date range. Its balance is net transaction flow for that range, not baseline-inclusive account balance.
- \`list_categories\`: category names available in the app.
- \`query_transactions\`: find rows by account name, exact category, kind, date range, or note search. Use it to inspect candidate rows; mention truncation when total > returned.
- \`search_transactions\`: search rows by a query string across note, category, account, kind, date, and amount. Use it to inspect candidate rows.
- \`propose_category\`: create a standalone category.
- \`propose_annotation\`: set category and/or note changes for transactions matched by its required query and optional filters. It does not accept transaction ids. Category names must come from \`list_categories\`; create missing categories with \`propose_category\` before using them.

Use account names from \`list_accounts\`, never invented ids. For edits, inspect candidate rows with \`query_transactions\` or \`search_transactions\`, then call \`propose_annotation\` with a query and filters that target those rows.

Only propose edits when the user explicitly asks to change, categorize, rename, clean up, create a category, or update records. For analysis questions, inspect the data and answer; do not volunteer edits, cleanup plans, or category changes.

For broad categorization or cleanup requests, do the work in high-confidence batches instead of asking the user to design the whole category system first. Call \`list_categories\`; reuse close existing categories; create obvious missing categories with \`propose_category\`; query uncategorized transactions in batches; then use \`propose_annotation\` with a query and filters for rows whose descriptions clearly match a category. Continue batch by batch while useful. If many rows remain ambiguous, summarize the uncertain patterns and ask one short clarification about those patterns only.

Ask a clarification before editing only when there is no reasonable high-confidence action to take. Do not ask for permission to use tools, do not ask whether to suggest categories, and do not stop only because the dataset is larger than one tool batch.

Category filters are exact. Use category "" or "uncategorized" for rows without a category.

Be concise. Dates are ISO YYYY-MM-DD. When a date range is ambiguous, ask one short clarification. Do not provide tax, legal, or investment advice; explain what the user's records show.`;

function ChatTools() {
  useAssistantInstructions(SYSTEM_PROMPT);
  useAssistantTool(queryTransactionsTool);
  useAssistantTool(searchTransactionsTool);
  useAssistantTool(getSummaryTool);
  useAssistantTool(listAccountsTool);
  useAssistantTool(listCategoriesTool);
  useAssistantTool(proposeCategoryTool);
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
