import type { Candidate } from "../../shared/types";
import { d, categoryGuess } from "../../shared/finance";
export interface BankStatementReview {
  institution: string;
  last4: string;
  currency: string;
  opening_on: string;
  closing_on: string;
  opening_balance: string;
  closing_balance: string;
  total_debits: string;
  total_credits: string;
  reconciled: boolean;
  issues: string[];
  rows: Candidate[];
}
const date = (raw: string) => {
  const [day, month, year] = raw.split("-");
  return `${year}-${month}-${day}`;
};
const amounts = (line: string) => [...line.matchAll(/\d[\d,]*\.\d{2}/g)];
export function parseAxisStatement(text: string): BankStatementReview | null {
  if (!/Statement of Axis Account/i.test(text)) return null;
  const period = text.match(
    /From:\s*(\d{2}-\d{2}-\d{4})\s+To:\s*(\d{2}-\d{2}-\d{4})/i,
  );
  const last4 =
    text.match(/Statement of Axis Account No:\s*\d*(\d{4})/i)?.[1] ?? "";
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
  const openingLine = lines.find((l) => /OPENING BALANCE/i.test(l)),
    closingLine = lines.find((l) => /CLOSING BALANCE/i.test(l)),
    totalLine = lines.find((l) => /TRANSACTION TOTAL/i.test(l));
  const value = (line: string | undefined) =>
    line ? (amounts(line).at(-1)?.[0].replaceAll(",", "") ?? "") : "";
  const opening = value(openingLine),
    closing = value(closingLine),
    totals = totalLine
      ? amounts(totalLine).map((m) => m[0].replaceAll(",", ""))
      : [];
  const issues: string[] = [],
    rows: Candidate[] = [];
  let previous = d(opening || 0),
    pending: string[] = [];
  const owner = lines[0]?.toUpperCase();
  for (const line of lines) {
    const start = line.match(/^(\d{2}-\d{2}-\d{4})\s+(.+)/);
    if (!start) {
      if (/OPENING BALANCE|CLOSING BALANCE|TRANSACTION TOTAL/i.test(line)) {
        pending = [];
        continue;
      }
      if (
        /^(?:UPI\/|NEFT\/|IMPS\/|MOB\/|NBSM\/|RTGS\/|ACH\/|[A-Z].*\/|\/)/i.test(
          line,
        ) &&
        !/(?:Account No|REGISTERED|BRANCH ADDRESS|http)/i.test(line)
      )
        pending.push(line);
      continue;
    }
    const money = amounts(start[2]);
    if (money.length < 2) {
      issues.push("Missing amount or balance on " + start[1]);
      pending = [];
      continue;
    }
    const displayed = d(money.at(-2)![0].replaceAll(",", "")),
      balance = d(money.at(-1)![0].replaceAll(",", "")),
      signed = balance.minus(previous);
    previous = balance;
    const valid = signed.abs().eq(displayed) && !signed.isZero();
    if (!valid)
      issues.push("Amount does not match the running balance on " + start[1]);
    const narration = [...pending, start[2].slice(0, money.at(-2)!.index)]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pending = [];
    const upper = narration.toUpperCase(),
      investment =
        /MUTUAL FUND|MUTUAL FUNDS|REDEMPT|ICCL|GROWW|ZERODHA|AUTO.?SWEEP|SWEEP TRF|FIXED DEPOSIT/.test(
          upper,
        );
    const ownerParts = owner?.split(/\s+/).filter(Boolean) ?? [];
    const abbreviatedOwner =
      ownerParts.length >= 2
        ? ownerParts[0] + " " + ownerParts.at(-1)!.slice(0, 3)
        : "";
    const own =
      !!owner &&
      owner.length > 3 &&
      (upper.includes(owner) ||
        (!!abbreviatedOwner && upper.includes(abbreviatedOwner)));
    const reference = upper.match(/UPI\/P2[AM]\/(\d{12})\//)?.[1];
    const reversal =
      signed.gt(0) &&
      !!reference &&
      rows.some(
        (r) =>
          r.date === date(start[1]) &&
          d(r.amount).eq(signed.negated()) &&
          r.description.toUpperCase().includes("/" + reference + "/"),
      );
    const kind = reversal
      ? "refund"
      : own
        ? "adjustment"
        : investment
          ? "investment"
          : signed.lt(0)
            ? "expense"
            : "income";
    rows.push({
      line: rows.length + 1,
      date: date(start[1]),
      description: narration.slice(0, 200),
      amount: signed.toString(),
      kind,
      category: own || investment ? "Other" : categoryGuess(narration),
      confidence: "review",
      selected: false,
      duplicate: false,
      error: !valid
        ? "Check the amount and balance"
        : own
          ? "Possible own-account movement — excluded from income/spending until classified"
          : investment
            ? "Investment movement — excluded from income/spending"
            : "Review category and transaction type",
    });
  }
  const debits = rows
      .filter((r) => d(r.amount).lt(0))
      .reduce((s, r) => s.plus(d(r.amount).abs()), d(0)),
    credits = rows
      .filter((r) => d(r.amount).gt(0))
      .reduce((s, r) => s.plus(r.amount), d(0));
  if (!period || !opening || !closing || totals.length !== 2 || !rows.length)
    issues.push(
      "Statement header, totals or transaction rows are incomplete. Read the original PDF again.",
    );
  if (closing && !previous.eq(closing))
    issues.push(
      "The final running balance does not match the closing balance.",
    );
  if (totals.length === 2 && (!debits.eq(totals[0]) || !credits.eq(totals[1])))
    issues.push("Transaction totals do not match the statement totals.");
  return {
    institution: "Axis Bank",
    last4,
    currency: "INR",
    opening_on: period ? date(period[1]) : "",
    closing_on: period ? date(period[2]) : "",
    opening_balance: opening,
    closing_balance: closing,
    total_debits: debits.toString(),
    total_credits: credits.toString(),
    reconciled: issues.length === 0,
    issues,
    rows,
  };
}
