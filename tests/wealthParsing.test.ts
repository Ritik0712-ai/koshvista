import { describe, it, expect } from "vitest";
import { wealthCandidates, dateFromSourceName } from "../src/WealthReview";
describe("Broker portfolio review", () => {
  it("reads multiline share holdings, keeps missing prices blank and merges screenshot overlap", () => {
    const text =
      "HOLDINGS (2)\nAlpha Company ₹120.00\n2 shares (₹100.00)\nBeta Company\n3 shares (₹200.00)\nAlpha Company ₹120.00\n2 shares (₹100.00)";
    const rows = wealthCandidates(
      text,
      "portfolio",
      "INR",
      "investment_holdings_05_oct_2026.pdf",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Alpha Company",
      quantity: "2",
      market_value: "120.00",
      cost_basis: "100.00",
      as_of: "2026-10-05",
    });
    expect(rows[1].market_value).toBe("");
    expect(rows[1].quantity).toBe("3");
  });
  it("uses the documented date ahead of an inferred filename date", () => {
    expect(
      wealthCandidates(
        "Valuation date: 2026-10-01\nAlpha Company ₹120.00\n2 shares (₹100.00)",
        "portfolio",
        "INR",
        "holdings_05_oct_2026.pdf",
      )[0].as_of,
    ).toBe("2026-10-01");
    expect(dateFromSourceName("holdings_31_feb_2026.pdf")).toBe("");
  });
});
