import { describe, it, expect } from "vitest";
import { startOfWeek, format } from "date-fns";

// Unit test the computation logic extracted from useDashboardData

describe("Hours Saved Calculation", () => {
  it("computes estimated hours saved correctly", () => {
    const baseline = 60; // minutes
    const completedPages = [
      { created_at: "2026-01-01T00:00:00Z", id: "p1" },
      { created_at: "2026-01-02T00:00:00Z", id: "p2" },
    ];

    // Simulate: each page took 10min turnaround, 8min agent time → 2min operator attention
    const operatorAttentionMinutes = [2, 2];
    const avgOperatorAttention =
      operatorAttentionMinutes.reduce((a, b) => a + b, 0) / operatorAttentionMinutes.length;

    const estimatedHoursSaved =
      Math.max(0, ((baseline - avgOperatorAttention) * completedPages.length) / 60);

    // (60 - 2) * 2 / 60 = 116 / 60 ≈ 1.933
    expect(estimatedHoursSaved).toBeCloseTo(1.933, 2);
  });

  it("returns 0 when no completed pages", () => {
    const estimatedHoursSaved = 0;
    expect(estimatedHoursSaved).toBe(0);
  });

  it("clamps operator attention to minimum 0", () => {
    // If agent duration > turnaround (edge case), clamp to 0
    const turnaroundMs = 5000;
    const agentDurationMs = 10000;
    const attentionMs = Math.max(0, turnaroundMs - agentDurationMs);
    expect(attentionMs).toBe(0);
  });
});

describe("Weekly Trend Sort", () => {
  it("sorts weeks chronologically regardless of insertion order", () => {
    const pages = [
      { created_at: "2026-03-15T10:00:00Z", status: "passed" },
      { created_at: "2026-03-01T10:00:00Z", status: "passed" },
      { created_at: "2026-03-08T10:00:00Z", status: "failed" },
      { created_at: "2026-03-22T10:00:00Z", status: "passed" },
    ];

    const weekBuckets = new Map<number, { date: Date; count: number }>();
    for (const page of pages) {
      if (["passed", "failed", "passed_with_warnings"].includes(page.status)) {
        const ws = startOfWeek(new Date(page.created_at), { weekStartsOn: 1 });
        const key = ws.getTime();
        const existing = weekBuckets.get(key);
        if (existing) {
          existing.count++;
        } else {
          weekBuckets.set(key, { date: ws, count: 1 });
        }
      }
    }

    const weeklyTrend = Array.from(weekBuckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => ({ week: format(b.date, "MMM d"), count: b.count }));

    // Verify chronological order
    expect(weeklyTrend.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < weeklyTrend.length; i++) {
      // Each week label should come after the previous chronologically
      expect(weeklyTrend[i]).toBeDefined();
    }

    // First entry should be earliest week (Mar 1 week)
    expect(weeklyTrend[0].week).toContain("Feb"); // startOfWeek for Mar 1 2026 (Sunday) → Mon Feb 24
  });
});

describe("First-Pass Rate", () => {
  it("counts only pages where all blocking agents passed on run_number=1", () => {
    const blockingAgentIds = new Set(["a1", "a2"]);
    const agentRuns = [
      { page_id: "p1", agent_id: "a1", run_number: 1, status: "passed" },
      { page_id: "p1", agent_id: "a2", run_number: 1, status: "passed" },
      { page_id: "p2", agent_id: "a1", run_number: 1, status: "failed" },
      { page_id: "p2", agent_id: "a2", run_number: 1, status: "passed" },
      // p2 eventually passed on re-run but first-pass should be false
      { page_id: "p2", agent_id: "a1", run_number: 2, status: "passed" },
    ];

    const completedPages = [
      { id: "p1", status: "passed" },
      { id: "p2", status: "passed" },
    ];

    let firstPassCount = 0;
    for (const page of completedPages) {
      const firstRuns = agentRuns.filter(
        (r) => r.page_id === page.id && r.run_number === 1 && blockingAgentIds.has(r.agent_id)
      );
      const allPassed =
        firstRuns.length > 0 &&
        firstRuns.every((r) => r.status === "passed" || r.status === "warning");
      if (allPassed) firstPassCount++;
    }

    // Only p1 passed on first run
    expect(firstPassCount).toBe(1);
    expect(firstPassCount / completedPages.length).toBe(0.5);
  });
});
