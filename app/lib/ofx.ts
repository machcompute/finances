import {
  Account,
  Baseline,
  Transaction,
  UNCATEGORIZED_LABEL,
} from "./transactions";

export type ParsedOFXAccount =
  | { kind: "named"; name: string }
  | { kind: "legacy" }
  | { kind: "destination" };

export type ParsedOFXTransaction = {
  fitid: string;
  trntype: string;
  amount: number;
  date: string;
  name?: string;
  memo?: string;
  category?: string;
  account: ParsedOFXAccount;
};

export type ParsedOFXBaseline = {
  amount: number;
  date: string;
  account: ParsedOFXAccount;
};

export type OFXParseResult =
  | {
      ok: true;
      transactions: ParsedOFXTransaction[];
      baselines: ParsedOFXBaseline[];
    }
  | { ok: false; error: string };

export const LEGACY_ACCTID = "finances";
export const LEGACY_BASELINE_ACCTID = "finances-baseline";
export const BASELINE_ACCTID_PREFIX = "baseline-";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatOFXDateTime(d: Date): string {
  return (
    `${d.getFullYear()}` +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

function isoDateToOFX(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return formatOFXDateTime(new Date());
  return `${m[1]}${m[2]}${m[3]}120000`;
}

function ofxDateToISO(s: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXMLEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export function fitidFromId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "").slice(0, 32) || "tx";
}

function sanitizeAcctId(name: string): string {
  return escapeXML(name).slice(0, 32) || "account";
}

function buildBaselineStatement(account: Account, baseline: Baseline): string {
  const acctid = sanitizeAcctId(`${BASELINE_ACCTID_PREFIX}${account.name}`);
  return (
    `    <STMTTRNRS>\n` +
    `      <TRNUID>0</TRNUID>\n` +
    `      <STATUS>\n` +
    `        <CODE>0</CODE>\n` +
    `        <SEVERITY>INFO</SEVERITY>\n` +
    `      </STATUS>\n` +
    `      <STMTRS>\n` +
    `        <CURDEF>USD</CURDEF>\n` +
    `        <BANKACCTFROM>\n` +
    `          <BANKID>000000000</BANKID>\n` +
    `          <ACCTID>${acctid}</ACCTID>\n` +
    `          <ACCTTYPE>CHECKING</ACCTTYPE>\n` +
    `        </BANKACCTFROM>\n` +
    `        <BANKTRANLIST>\n` +
    `          <DTSTART>${isoDateToOFX(baseline.date)}</DTSTART>\n` +
    `          <DTEND>${isoDateToOFX(baseline.date)}</DTEND>\n` +
    `        </BANKTRANLIST>\n` +
    `        <LEDGERBAL>\n` +
    `          <BALAMT>${baseline.amount.toFixed(2)}</BALAMT>\n` +
    `          <DTASOF>${isoDateToOFX(baseline.date)}</DTASOF>\n` +
    `        </LEDGERBAL>\n` +
    `      </STMTRS>\n` +
    `    </STMTTRNRS>\n`
  );
}

function buildAccountStatement(
  account: Account,
  txs: Transaction[],
  baseline: Baseline | null,
  trnUid: number,
  dtServer: string,
): string {
  const acctid = sanitizeAcctId(account.name);
  const sortedDates = txs.map((t) => t.date).sort();
  const dtStart =
    sortedDates.length > 0 ? isoDateToOFX(sortedDates[0]) : dtServer;
  const dtEnd =
    sortedDates.length > 0
      ? isoDateToOFX(sortedDates[sortedDates.length - 1])
      : dtServer;

  let runningBalance = baseline?.amount ?? 0;
  const stmttrns = txs
    .map((tx) => {
      const sign = tx.kind === "income" ? 1 : -1;
      const signedAmount = sign * tx.amount;
      runningBalance += signedAmount;
      const amount = signedAmount.toFixed(2);
      const trntype = tx.kind === "income" ? "CREDIT" : "DEBIT";
      const fitid = fitidFromId(tx.id);
      const categoryLabel = tx.category ?? UNCATEGORIZED_LABEL;
      const name = escapeXML(categoryLabel).slice(0, 32);
      const memoText = tx.category
        ? tx.note
          ? `[${tx.category}] ${tx.note}`
          : `[${tx.category}]`
        : tx.note ?? "";
      const memoLine = memoText
        ? `\n        <MEMO>${escapeXML(memoText)}</MEMO>`
        : "";
      return (
        `      <STMTTRN>\n` +
        `        <TRNTYPE>${trntype}</TRNTYPE>\n` +
        `        <DTPOSTED>${isoDateToOFX(tx.date)}</DTPOSTED>\n` +
        `        <TRNAMT>${amount}</TRNAMT>\n` +
        `        <FITID>${fitid}</FITID>\n` +
        `        <NAME>${name}</NAME>${memoLine}\n` +
        `      </STMTTRN>`
      );
    })
    .join("\n");
  const balAmt = runningBalance.toFixed(2);
  const tranList = stmttrns ? `${stmttrns}\n` : "";

  return (
    `    <STMTTRNRS>\n` +
    `      <TRNUID>${trnUid}</TRNUID>\n` +
    `      <STATUS>\n` +
    `        <CODE>0</CODE>\n` +
    `        <SEVERITY>INFO</SEVERITY>\n` +
    `      </STATUS>\n` +
    `      <STMTRS>\n` +
    `        <CURDEF>USD</CURDEF>\n` +
    `        <BANKACCTFROM>\n` +
    `          <BANKID>000000000</BANKID>\n` +
    `          <ACCTID>${acctid}</ACCTID>\n` +
    `          <ACCTTYPE>CHECKING</ACCTTYPE>\n` +
    `        </BANKACCTFROM>\n` +
    `        <BANKTRANLIST>\n` +
    `          <DTSTART>${dtStart}</DTSTART>\n` +
    `          <DTEND>${dtEnd}</DTEND>\n` +
    `${tranList}` +
    `        </BANKTRANLIST>\n` +
    `        <LEDGERBAL>\n` +
    `          <BALAMT>${balAmt}</BALAMT>\n` +
    `          <DTASOF>${dtServer}</DTASOF>\n` +
    `        </LEDGERBAL>\n` +
    `      </STMTRS>\n` +
    `    </STMTTRNRS>\n`
  );
}

export function exportToOFX(
  accounts: Account[],
  txs: Transaction[],
  baselines: Map<string, Baseline>,
): string {
  const now = new Date();
  const dtServer = formatOFXDateTime(now);

  const txsByAccount = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const list = txsByAccount.get(tx.accountId) ?? [];
    list.push(tx);
    txsByAccount.set(tx.accountId, list);
  }

  const baselineStatements = accounts
    .map((a) => {
      const b = baselines.get(a.id);
      return b ? buildBaselineStatement(a, b) : "";
    })
    .join("");

  const accountStatements = accounts
    .map((a, i) => {
      const accountTxs = txsByAccount.get(a.id) ?? [];
      const baseline = baselines.get(a.id) ?? null;
      return buildAccountStatement(a, accountTxs, baseline, i + 1, dtServer);
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?OFX OFXHEADER="200" VERSION="202" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n` +
    `<OFX>\n` +
    `  <SIGNONMSGSRSV1>\n` +
    `    <SONRS>\n` +
    `      <STATUS>\n` +
    `        <CODE>0</CODE>\n` +
    `        <SEVERITY>INFO</SEVERITY>\n` +
    `      </STATUS>\n` +
    `      <DTSERVER>${dtServer}</DTSERVER>\n` +
    `      <LANGUAGE>ENG</LANGUAGE>\n` +
    `    </SONRS>\n` +
    `  </SIGNONMSGSRSV1>\n` +
    `  <BANKMSGSRSV1>\n` +
    baselineStatements +
    accountStatements +
    `  </BANKMSGSRSV1>\n` +
    `</OFX>\n`
  );
}

function extractField(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const value = decodeXMLEntities(m[1].trim());
  return value || undefined;
}

function classifyAcctId(
  acctid: string | undefined,
): { role: "transactions" | "baseline"; account: ParsedOFXAccount } {
  if (!acctid || acctid === LEGACY_ACCTID) {
    return { role: "transactions", account: { kind: "legacy" } };
  }
  if (acctid === LEGACY_BASELINE_ACCTID) {
    return { role: "baseline", account: { kind: "legacy" } };
  }
  if (acctid.toLowerCase().startsWith(BASELINE_ACCTID_PREFIX)) {
    const name = acctid.slice(BASELINE_ACCTID_PREFIX.length).trim();
    return {
      role: "baseline",
      account: name ? { kind: "named", name } : { kind: "legacy" },
    };
  }
  return { role: "transactions", account: { kind: "named", name: acctid } };
}

export function parseOFX(text: string): OFXParseResult {
  const ofxStart = text.search(/<OFX[\s>]/i);
  if (ofxStart === -1) {
    return { ok: false, error: "No <OFX> root element found." };
  }
  const body = text.slice(ofxStart);

  const transactions: ParsedOFXTransaction[] = [];
  const baselines: ParsedOFXBaseline[] = [];

  const stmtBlockRegex = /<STMTTRNRS>([\s\S]*?)<\/STMTTRNRS>/gi;
  const stmtBlocks: string[] = [];
  let stmtMatch: RegExpExecArray | null;
  while ((stmtMatch = stmtBlockRegex.exec(body)) !== null) {
    stmtBlocks.push(stmtMatch[1]);
  }

  const txStatementCount = stmtBlocks.filter((block) => {
    const acctid = extractField(block, "ACCTID");
    return classifyAcctId(acctid).role === "transactions";
  }).length;

  for (const block of stmtBlocks) {
    const acctid = extractField(block, "ACCTID");
    const { role, account: parsedAccount } = classifyAcctId(acctid);

    if (role === "baseline") {
      const balAmtStr = extractField(block, "BALAMT");
      const dtAsOf = extractField(block, "DTASOF");
      if (!balAmtStr || !dtAsOf) continue;
      const amount = parseFloat(balAmtStr);
      if (!isFinite(amount)) continue;
      const date = ofxDateToISO(dtAsOf);
      if (!date) continue;
      baselines.push({ amount, date, account: parsedAccount });
      continue;
    }

    const account: ParsedOFXAccount =
      txStatementCount === 1 && parsedAccount.kind === "legacy"
        ? { kind: "destination" }
        : parsedAccount;

    const txBlockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let txMatch: RegExpExecArray | null;
    while ((txMatch = txBlockRegex.exec(block)) !== null) {
      const txBlock = txMatch[1];
      const fitid = extractField(txBlock, "FITID");
      const amountStr = extractField(txBlock, "TRNAMT");
      const dtposted = extractField(txBlock, "DTPOSTED");
      const trntype = extractField(txBlock, "TRNTYPE") ?? "OTHER";
      const name = extractField(txBlock, "NAME");
      const memo = extractField(txBlock, "MEMO");
      const category = extractField(txBlock, "CATEGORY");

      if (!fitid || !amountStr || !dtposted) continue;
      const amount = parseFloat(amountStr);
      if (!isFinite(amount)) continue;
      const date = ofxDateToISO(dtposted);
      if (!date) continue;

      transactions.push({
        fitid,
        trntype,
        amount,
        date,
        name,
        memo,
        category,
        account,
      });
    }
  }

  if (transactions.length === 0 && baselines.length === 0) {
    return {
      ok: false,
      error: "No <STMTTRN> entries or baseline found in the OFX file.",
    };
  }
  return { ok: true, transactions, baselines };
}
