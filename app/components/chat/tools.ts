import { z } from "zod";
import {
  calculateAnchoredBalance,
  getAccounts,
  getBaselines,
  getCategories,
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

function normalizeToolText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function resolveExistingCategory(category: string): string | null {
  const normalized = normalizeToolText(category);
  if (!normalized) return null;
  return (
    getCategories().find(
      (existing) => existing.toLowerCase() === normalized.toLowerCase(),
    ) ?? null
  );
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

function transactionMatchesQuery(
  tx: ReturnType<typeof getTransactions>[number],
  accountName: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    tx.note,
    tx.category,
    accountName,
    tx.kind,
    tx.date,
    tx.amount.toFixed(2),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function transactionResult(
  tx: ReturnType<typeof getTransactions>[number],
  accountName: string,
) {
  return {
    id: tx.id,
    date: tx.date,
    kind: tx.kind,
    amount: tx.amount,
    category: tx.category ?? null,
    note: tx.note ?? null,
    account: accountName,
  };
}

export const queryTransactionsTool = {
  toolName: "query_transactions",
  type: "frontend" as const,
  description:
    "Search transactions to answer questions or inspect rows before annotation. Returns matching rows with their ids for display. For cleanup work, call repeatedly in batches.",
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
    limit: z.number().optional().describe("Max rows to return (default 100, max 200)"),
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
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    return {
      total: all.length,
      returned: Math.min(all.length, limit),
      transactions: all
        .slice(0, limit)
        .map((t) => transactionResult(t, nameById.get(t.accountId) ?? t.accountId)),
    };
  },
};

type SearchArgs = {
  query: string;
  account?: string;
  category?: string;
  kind?: "income" | "expense";
  from?: string;
  to?: string;
  limit?: number;
};

export const searchTransactionsTool = {
  toolName: "search_transactions",
  type: "frontend" as const,
  description:
    "Search transactions by a simple query string across description/note, category, account, kind, date, and amount. Returns matching rows with ids for display.",
  parameters: z.object({
    query: z.string().describe("Case-insensitive text to search for"),
    account: z
      .string()
      .optional()
      .describe("Optional account name to restrict to"),
    category: z
      .string()
      .optional()
      .describe('Optional exact category name, or "" / "uncategorized"'),
    kind: z.enum(["income", "expense"]).optional(),
    from: z.string().optional().describe("Inclusive lower date bound, YYYY-MM-DD"),
    to: z.string().optional().describe("Inclusive upper date bound, YYYY-MM-DD"),
    limit: z.number().optional().describe("Max rows to return (default 100, max 200)"),
  }),
  execute: async (args: SearchArgs) => {
    const search = normalizeToolText(args.query);
    if (!search) return "Error: provide a search query.";
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
      return transactionMatchesQuery(
        t,
        nameById.get(t.accountId) ?? t.accountId,
        search,
      );
    });
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    return {
      query: search,
      total: all.length,
      returned: Math.min(all.length, limit),
      transactions: all
        .slice(0, limit)
        .map((t) => transactionResult(t, nameById.get(t.accountId) ?? t.accountId)),
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
    "List accounts with their current balance using any as-of baseline anchor. Use these names with other tools.",
  parameters: z.object({}),
  execute: async () => {
    const baselines = getBaselines();
    const txs = getTransactions();
    return getAccounts().map((a) => {
      const accountTxs = txs.filter((t) => t.accountId === a.id);
      const balance = calculateAnchoredBalance(
        accountTxs,
        baselines.get(a.id) ?? null,
      );
      return {
        name: a.name,
        description: a.description ?? null,
        balance,
        transactions: accountTxs.length,
      };
    });
  },
};

export const listCategoriesTool = {
  toolName: "list_categories",
  type: "frontend" as const,
  description: "List all category names available in the app.",
  parameters: z.object({}),
  execute: async () => {
    return getCategories();
  },
};

type CategoryArgs = {
  name: string;
};

export const proposeCategoryTool = {
  toolName: "propose_category",
  type: "frontend" as const,
  description: "Create a standalone category.",
  parameters: z.object({
    name: z.string().describe("Category name to create"),
  }),
  execute: async ({ name }: CategoryArgs) => {
    const category = normalizeToolText(name);
    if (!category) return "Error: provide a category name.";
    const exists = getCategories().some(
      (c) => c.toLowerCase() === category.toLowerCase(),
    );
    if (exists) {
      return {
        applied: false,
        alreadyExists: true,
        category,
        message: `Category "${category}" already exists.`,
      };
    }
    const approved = await requestChanges([
      {
        kind: "create_category",
        value: category,
        summary: `Create category "${category}"`,
      },
    ]);
    return approved
      ? {
          applied: true,
          category,
          message: "Category created.",
        }
      : { applied: false, message: "User rejected the change; nothing was changed." };
  },
};

type AnnotateArgs = {
  query: string;
  account?: string;
  currentCategory?: string;
  kind?: "income" | "expense";
  from?: string;
  to?: string;
  limit?: number;
  category?: string;
  note?: string;
};

export const proposeAnnotationTool = {
  toolName: "propose_annotation",
  type: "frontend" as const,
  description:
    "Set a category and/or note on transactions matched by a required query and optional filters. Category must already exist in list_categories; create it with propose_category first if needed. This tool does not accept transaction ids.",
  parameters: z.object({
    query: z
      .string()
      .describe("Required search query used to find target transactions"),
    account: z
      .string()
      .optional()
      .describe("Optional account name to restrict to"),
    currentCategory: z
      .string()
      .optional()
      .describe('Optional current category filter, or "" / "uncategorized"'),
    kind: z.enum(["income", "expense"]).optional(),
    from: z.string().optional().describe("Inclusive lower date bound, YYYY-MM-DD"),
    to: z.string().optional().describe("Inclusive upper date bound, YYYY-MM-DD"),
    limit: z.number().optional().describe("Max matched rows to annotate (default 100, max 200)"),
    category: z.string().optional().describe("Category to assign"),
    note: z.string().optional().describe("Note to assign"),
  }),
  execute: async (args: AnnotateArgs) => {
    const search = normalizeToolText(args.query);
    if (!search) return "Error: provide a search query.";
    if (args.category === undefined && args.note === undefined) {
      return "Error: provide a category and/or note.";
    }
    const accId = resolveAccountId(args.account);
    if (accId === null) {
      return {
        applied: false,
        error: "unknown_account",
        message: `No account named "${args.account}". Call list_accounts for the available names.`,
      };
    }
    const nameById = new Map(getAccounts().map((a) => [a.id, a.name]));
    const wantUncategorized =
      args.currentCategory !== undefined &&
      (args.currentCategory === "" ||
        args.currentCategory.toLowerCase() === "uncategorized");
    const matched = getTransactions().filter((t) => {
      if (accId && t.accountId !== accId) return false;
      if (args.kind && t.kind !== args.kind) return false;
      if (wantUncategorized) {
        if (t.category) return false;
      } else if (
        args.currentCategory &&
        (t.category ?? "").toLowerCase() !==
          args.currentCategory.toLowerCase()
      ) {
        return false;
      }
      if (args.from && t.date < args.from) return false;
      if (args.to && t.date > args.to) return false;
      return transactionMatchesQuery(
        t,
        nameById.get(t.accountId) ?? t.accountId,
        search,
      );
    });
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const txIds = matched.slice(0, limit).map((t) => t.id);
    if (txIds.length === 0) {
      return {
        applied: false,
        error: "no_matches",
        query: search,
        message: `No transactions matched query "${search}".`,
      };
    }
    const n = txIds.length;
    const changes: ProposedChange[] = [];
    if (args.category !== undefined) {
      const existingCategory = resolveExistingCategory(args.category);
      if (!existingCategory) {
        return {
          applied: false,
          error: "unknown_category",
          category: args.category,
          message: `Category "${args.category}" does not exist. Call list_categories and use an existing category, or call propose_category first.`,
        };
      }
      changes.push({
        kind: "category",
        txIds,
        value: existingCategory,
        summary: `Set category "${existingCategory}" on ${n} transaction${n === 1 ? "" : "s"}`,
      });
    }
    if (args.note !== undefined) {
      changes.push({
        kind: "note",
        txIds,
        value: args.note,
        summary: `Set note "${args.note}" on ${n} transaction${n === 1 ? "" : "s"}`,
      });
    }
    const approved = await requestChanges(changes);
    return approved
      ? {
          applied: true,
          affected: n,
          matched: matched.length,
          query: search,
          message: "Changes applied.",
        }
      : { applied: false, message: "User rejected the changes; nothing was changed." };
  },
};
