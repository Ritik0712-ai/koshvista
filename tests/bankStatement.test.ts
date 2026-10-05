import { describe, it, expect } from "vitest";
import { parseAxisStatement } from "../src/lib/bankStatement";
const text = `SYNTHETIC PERSON
Statement of Axis Account No: 0000001234 for the period (From: 01-07-2026 To: 05-07-2026)
Tran Date Particulars Debit Credit Balance Init Br
OPENING BALANCE 1000.00
NEFT/QA-REF/SYNTHETIC SENDER
BANK/QA
01-07-2026 /CREDIT 500.00 1500.00 248
UPI/P2M/QA-REF/TEST CAFE
02-07-2026 /PAYMENT 40.00 1460.00 1588
TRANSACTION TOTAL 40.00 500.00
CLOSING BALANCE 1460.00`;
describe("Axis statement reconciliation", () => {
  it("handles wrapped descriptions and derives signed amounts from running balances", () => {
    const r = parseAxisStatement(text)!;
    expect(r.reconciled).toBe(true);
    expect(r.last4).toBe("1234");
    expect(r.opening_on).toBe("2026-07-01");
    expect(r.rows.map((r) => r.amount)).toEqual(["500", "-40"]);
    expect(r.rows[0].description).toContain("SYNTHETIC SENDER");
    expect(r.rows.every((r) => !r.selected)).toBe(true);
  });
  it("recognizes a same-day UPI reversal without inflating income", () => {
    const statement = `SYNTHETIC PERSON
Statement of Axis Account No: 0000001234 for the period (From: 01-07-2026 To: 01-07-2026)
OPENING BALANCE 1000.00
UPI/P2A/123456789012/TEST PAYEE
01-07-2026 /PAYMENT 100.00 900.00 248
UPI/P2A/123456789012/TEST RETURN
01-07-2026 /RETURN 100.00 1000.00 248
TRANSACTION TOTAL 100.00 100.00
CLOSING BALANCE 1000.00`;
    const r = parseAxisStatement(statement)!;
    expect(r.reconciled).toBe(true);
    expect(r.rows[1].kind).toBe("refund");
  });
  it("blocks missing or contradictory transactions and totals", () => {
    expect(
      parseAxisStatement(text.replace("40.00 1460.00", "45.00 1460.00"))!
        .reconciled,
    ).toBe(false);
    expect(
      parseAxisStatement(text.replace("500.00 1500.00", ""))!.reconciled,
    ).toBe(false);
  });
  it("keeps investment movements out of income/spending", () => {
    const r = parseAxisStatement(
      text.replace("TEST CAFE", "MUTUAL FUNDS ICCL"),
    )!;
    expect(r.rows[1].kind).toBe("investment");
    expect(parseAxisStatement("ordinary generic CSV")).toBeNull();
  });
});
