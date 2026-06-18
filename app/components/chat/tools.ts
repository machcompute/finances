import { z } from "zod";
import {
  getAccounts,
  getBaselines,
  getTransactions,
  summarize,
} from "@/app/lib/transactions";
import { requestChanges, type ProposedChange } from "@/app/lib/chatConfirm";

function resolveAccountId(account?: string): string | null | undefined {
  if (!account) return undefined;
  const accounts = getAccounts();
  const byId = accounts.find((a) => a.id === account);
  if (byId) return byId.id;
  const byName = accounts.find(
    (a) => a.name.toLowerCase() === account.toLowerCase(),
  );
  return byName ? byName.id : null;
}

type QueryArgs = {
  account?: string;
  category?: string;
  kind?: "income" | "expense";
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
};

export const queryTransactionsTool = {
  toolName: "query_transactions",
  type: "frontend" as const,
  description:
    "Search transactions to answer questions or find rows to annotate. Returns matching rows with their ids. Use the returned ids with propose_annotation.",
  parameters: z.object({
    account: z
      .string()
      .optional()
      .describe("Account name to restrict to (as shown by list_accounts)"),
    category: z
      .string()
      .optional()
      .describe('Exact category name, or "" / "uncategorized" for rows with no category'),
    kind: z.enum(["income", "expense"]).optional(),
    from: z.string().optional().describe("Inclusive lower date bound, YYYY-MM-DD"),
    to: z.string().optional().describe("Inclusive upper date bound, YYYY-MM-DD"),
    search: z
      .string()
      .optional()
      .describe("Case-insensitive substring match on the description/note"),
    limit: z.number().optional().describe("Max rows to return (default 50)"),
  }),
  execute: async (args: QueryArgs) => {
    const accId = resolveAccountId(args.account);
    if (accId === null) {
      return {
        total: 0,
        returned: 0,
        transactions: [],
        note: `No account named "${args.account}". Call list_accounts for the available names.`,
      };
    }
    const nameById = new Map(getAccounts().map((a) => [a.id, a.name]));
    const q = (args.search ?? "").trim().toLowerCase();
    const wantUncategorized =
      args.category !== undefined &&
      (args.category === "" || args.category.toLowerCase() === "uncategorized");
    const all = getTransactions().filter((t) => {
      if (accId && t.accountId !== accId) return false;
      if (args.kind && t.kind !== args.kind) return false;
      if (wantUncategorized) {
        if (t.category) return false;
      } else if (
        args.category &&
        (t.category ?? "").toLowerCase() !== args.category.toLowerCase()
      ) {
        return false;
      }
      if (args.from && t.date < args.from) return false;
      if (args.to && t.date > args.to) return false;
      if (q && !(t.note ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    const limit = args.limit ?? 50;
    return {
      total: all.length,
      returned: Math.min(all.length, limit),
      transactions: all.slice(0, limit).map((t) => ({
        id: t.id,
        date: t.date,
        kind: t.kind,
        amount: t.amount,
        category: t.category ?? null,
        note: t.note ?? null,
        account: nameById.get(t.accountId) ?? t.accountId,
      })),
    };
  },
};

type SummaryArgs = { account?: string; from?: string; to?: string };

export const getSummaryTool = {
  toolName: "get_summary",
  type: "frontend" as const,
  description:
    "Aggregate totals (income, expense, balance) and a per-category breakdown over an optional date range and/or account.",
  parameters: z.object({
    account: z
      .string()
      .optional()
      .describe("Account name to restrict to (as shown by list_accounts)"),
    from: z.string().optional().describe("Inclusive lower date bound, YYYY-MM-DD"),
    to: z.string().optional().describe("Inclusive upper date bound, YYYY-MM-DD"),
  }),
  execute: async (args: SummaryArgs) => {
    const accId = resolveAccountId(args.account);
    if (accId === null) {
      return { count: 0, note: `No account named "${args.account}".` };
    }
    const txs = getTransactions().filter((t) => {
      if (accId && t.accountId !== accId) return false;
      if (args.from && t.date < args.from) return false;
      if (args.to && t.date > args.to) return false;
      return true;
    });
    return { count: txs.length, ...summarize(txs) };
  },
};

export const listAccountsTool = {
  toolName: "list_accounts",
  type: "frontend" as const,
  description:
    "List accounts with their current balance (baseline plus the sum of their transactions). Use these names with other tools.",
  parameters: z.object({}),
  execute: async () => {
    const baselines = getBaselines();
    const txs = getTransactions();
    return getAccounts().map((a) => {
      const base = baselines.get(a.id)?.amount ?? 0;
      const balance = txs.reduce(
        (n, t) =>
          t.accountId === a.id
            ? n + (t.kind === "income" ? t.amount : -t.amount)
            : n,
        base,
      );
      return {
        name: a.name,
        description: a.description ?? null,
        balance,
        transactions: txs.filter((t) => t.accountId === a.id).length,
      };
    });
  },
};

export const listCategoriesTool = {
  toolName: "list_categories",
  type: "frontend" as const,
  description: "List all category names currently in use.",
  parameters: z.object({}),
  execute: async () => {
    const set = new Set<string>();
    for (const t of getTransactions()) if (t.category) set.add(t.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  },
};

type AnnotateArgs = {
  transactionIds: string[];
  category?: string;
  note?: string;
};

export const proposeAnnotationTool = {
  toolName: "propose_annotation",
  type: "frontend" as const,
  description:
    "Set a category and/or note on the given transactions. This opens a confirmation dialog and waits for the user to approve or reject before anything changes. Call query_transactions first to obtain the ids.",
  parameters: z.object({
    transactionIds: z
      .array(z.string())
      .describe("Transaction ids to annotate (from query_transactions)"),
    category: z.string().optional().describe("Category to assign"),
    note: z.string().optional().describe("Note to assign"),
  }),
  execute: async ({ transactionIds, category, note }: AnnotateArgs) => {
    const known = new Set(getTransactions().map((t) => t.id));
    const txIds = transactionIds.filter((id) => known.has(id));
    if (txIds.length === 0) {
      return "Error: none of those transaction ids exist. Use query_transactions to get valid ids.";
    }
    if (category === undefined && note === undefined) {
      return "Error: provide a category and/or note.";
    }
    const n = txIds.length;
    const changes: ProposedChange[] = [];
    if (category !== undefined) {
      changes.push({
        kind: "category",
        txIds,
        value: category,
        summary: `Set category "${category}" on ${n} transaction${n === 1 ? "" : "s"}`,
      });
    }
    if (note !== undefined) {
      changes.push({
        kind: "note",
        txIds,
        value: note,
        summary: `Set note "${note}" on ${n} transaction${n === 1 ? "" : "s"}`,
      });
    }
    const approved = await requestChanges(changes);
    return approved
      ? { applied: true, affected: n, message: "User approved — changes applied." }
      : { applied: false, message: "User rejected the changes; nothing was changed." };
  },
};
