import { format } from "date-fns";
import jsPDF from "jspdf";

interface ReportCheck {
  check_name: string;
  status: string;
  severity?: string;
  details?: string;
  finding?: string;
  expected?: string;
  actual?: string;
  element_location?: string;
  recommendation?: string;
}

interface AgentReport {
  agent_name: string;
  agent_number: number;
  page_url: string;
  overall_status: string;
  checks: ReportCheck[];
  summary: string;
}

interface AgentRunForExport {
  status: string;
  report: unknown;
  summary_stats: unknown;
  duration_ms: number | null;
  completed_at: string | null;
  model_used: string | null;
  run_number: number;
  agents: {
    agent_number: number;
    name: string;
    is_blocking: boolean;
    confidence_tier?: string;
  } | null;
}

interface PageForExport {
  new_url: string;
  old_url: string | null;
  slug: string | null;
  mode: string;
  status: string;
}

const SCOPE_DISCLAIMERS: Record<number, string> = {
  14: "Automated heuristic WCAG 2.1 AA preflight. Not a full compliance certification.",
  15: "Preflight header and client-side checks. Not a comprehensive security audit.",
};

const LOWER_CONFIDENCE_AGENTS = [8, 9, 10, 13];

function getSlugDate(page: PageForExport): string {
  const slug = page.slug || "page";
  const date = format(new Date(), "yyyy-MM-dd");
  return `qa-${slug}-${date}`;
}

function triggerDownload(content: string | Blob, filename: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Markdown ────────────────────────────────────────────

export function exportMarkdown(page: PageForExport, latestRuns: Map<number, AgentRunForExport>) {
  const lines: string[] = [];
  const now = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

  lines.push(`# QA Report — ${page.slug || page.new_url}`);
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Page URL:** ${page.new_url}`);
  if (page.mode === "migration" && page.old_url) {
    lines.push(`**Old URL:** ${page.old_url}`);
  }
  lines.push(`**Mode:** ${page.mode}`);
  lines.push(`**Overall Status:** ${page.status.toUpperCase()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Agent summary table
  lines.push("## Agent Summary");
  lines.push("");
  lines.push("| # | Agent | Status | Passed | Failed | Warnings | Skipped |");
  lines.push("|---|-------|--------|--------|--------|----------|---------|");

  const sortedEntries = Array.from(latestRuns.entries()).sort((a, b) => a[0] - b[0]);

  for (const [agentNum, run] of sortedEntries) {
    const name = run.agents?.name || `Agent ${agentNum}`;
    const stats = run.summary_stats as Record<string, number> | null;
    const p = stats?.passed ?? "—";
    const f = stats?.failed ?? "—";
    const w = stats?.warnings ?? "—";
    const s = stats?.skipped ?? "—";
    lines.push(`| ${agentNum} | ${name} | ${run.status} | ${p} | ${f} | ${w} | ${s} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Detailed findings per agent
  lines.push("## Detailed Findings");
  lines.push("");

  for (const [agentNum, run] of sortedEntries) {
    const name = run.agents?.name || `Agent ${agentNum}`;
    lines.push(`### ${agentNum}. ${name}`);
    lines.push("");
    lines.push(`**Status:** ${run.status}`);

    if (run.completed_at) {
      lines.push(`**Completed:** ${format(new Date(run.completed_at), "MMM d, yyyy h:mm a")}`);
    }
    if (run.duration_ms) {
      lines.push(`**Duration:** ${(run.duration_ms / 1000).toFixed(1)}s`);
    }
    if (run.model_used) {
      lines.push(`**Model:** ${run.model_used}`);
    }

    const disclaimer = SCOPE_DISCLAIMERS[agentNum];
    if (disclaimer) {
      lines.push("");
      lines.push(`> ⚠️ ${disclaimer}`);
    }

    if (LOWER_CONFIDENCE_AGENTS.includes(agentNum)) {
      lines.push("");
      lines.push(`> 👁 **Review recommended** — this agent uses AI judgment.`);
    }

    const report = run.report as AgentReport | null;
    if (report?.checks && report.checks.length > 0) {
      lines.push("");
      for (const check of report.checks) {
        const icon = check.status === "passed" ? "✅" : check.status === "failed" ? "❌" : check.status === "warning" ? "⚠️" : "—";
        const sev = check.severity ? ` [${check.severity}]` : "";
        lines.push(`#### ${icon} ${check.check_name}${sev}`);
        lines.push("");
        if (check.details) lines.push(check.details);
        if (check.finding) lines.push(`\n**Finding:** ${check.finding}`);
        if (check.expected) lines.push(`\n**Expected:** ${check.expected}`);
        if (check.actual) lines.push(`\n**Actual:** ${check.actual}`);
        if (check.element_location) lines.push(`\n**Element:** \`${check.element_location}\``);
        if (check.recommendation) lines.push(`\n**Recommendation:** ${check.recommendation}`);
        lines.push("");
      }
    } else if (run.status === "skipped" || run.status === "not_started") {
      lines.push("");
      lines.push("_No checks run._");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push(`_Report generated by Zuper Web Preflight_`);

  const filename = `${getSlugDate(page)}.md`;
  triggerDownload(lines.join("\n"), filename);
}

// ─── PDF ─────────────────────────────────────────────────

export function exportPDF(page: PageForExport, latestRuns: Map<number, AgentRunForExport>) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 20; // margin left
  const mr = 20;
  const cw = pw - ml - mr; // content width
  let y = 25;
  const now = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

  const addFooter = () => {
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("Generated by Zuper Web Preflight — For internal use only", pw / 2, ph - 8, { align: "center" });
  };

  const checkPage = (needed: number) => {
    if (y + needed > ph - 20) {
      addFooter();
      doc.addPage();
      y = 20;
    }
  };

  const drawText = (text: string, x: number, maxWidth: number, size: number, style: string = "normal", color: [number, number, number] = [45, 30, 14]) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    checkPage(lines.length * size * 0.4 + 2);
    doc.text(lines, x, y);
    y += lines.length * size * 0.4 + 1;
  };

  // Header with brand bar
  doc.setFillColor(255, 107, 26); // #FF6B1A
  doc.rect(0, 0, pw, 8, "F");

  y = 18;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(45, 30, 14);
  doc.text("Zuper Web Preflight Report", ml, y);
  y += 8;

  // Meta
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated: ${now}`, ml, y);
  y += 5;
  doc.text(`Page URL: ${page.new_url}`, ml, y);
  y += 5;
  if (page.mode === "migration" && page.old_url) {
    doc.text(`Old URL: ${page.old_url}`, ml, y);
    y += 5;
  }
  doc.text(`Mode: ${page.mode} | Overall Status: ${page.status.toUpperCase()}`, ml, y);
  y += 8;

  // Divider
  doc.setDrawColor(230);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  // Summary table
  drawText("Agent Summary", ml, cw, 13, "bold");
  y += 2;

  const sortedEntries = Array.from(latestRuns.entries()).sort((a, b) => a[0] - b[0]);

  // Table header
  const cols = [ml, ml + 10, ml + 65, ml + 92, ml + 110, ml + 128, ml + 146];
  const rowHeight = 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100);
  doc.text("#", cols[0], y);
  doc.text("Agent", cols[1], y);
  doc.text("Status", cols[2], y);
  doc.text("Passed", cols[3], y);
  doc.text("Failed", cols[4], y);
  doc.text("Warnings", cols[5], y);
  doc.text("Skipped", cols[6], y);
  y += 2;
  doc.setDrawColor(220);
  doc.line(ml, y, pw - mr, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(45, 30, 14);

  sortedEntries.forEach(([agentNum, run], rowIndex) => {
    checkPage(rowHeight + 1);
    const name = run.agents?.name || `Agent ${agentNum}`;
    const stats = run.summary_stats as Record<string, number> | null;

    // Alternating row shading
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(ml, y - 3.5, cw, rowHeight, "F");
    }

    doc.setFontSize(7);
    doc.text(String(agentNum), cols[0], y);
    doc.text(name, cols[1], y);

    // Color-code status
    const statusColor: [number, number, number] =
      run.status === "passed" ? [34, 197, 94] :
      run.status === "failed" || run.status === "error" ? [239, 68, 68] :
      run.status === "warning" ? [245, 158, 11] : [156, 163, 175];
    doc.setTextColor(...statusColor);
    doc.text(run.status, cols[2], y);
    doc.setTextColor(45, 30, 14);

    doc.text(String(stats?.passed ?? "—"), cols[3], y);
    doc.text(String(stats?.failed ?? "—"), cols[4], y);
    doc.text(String(stats?.warnings ?? "—"), cols[5], y);
    doc.text(String(stats?.skipped ?? "—"), cols[6], y);
    y += rowHeight;
  });

  y += 6;
  doc.setDrawColor(230);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  // Detailed findings
  drawText("Detailed Findings", ml, cw, 13, "bold");
  y += 2;

  for (const [agentNum, run] of sortedEntries) {
    const name = run.agents?.name || `Agent ${agentNum}`;
    checkPage(30);

    drawText(`${agentNum}. ${name}`, ml, cw, 10, "bold");

    const statusColor: [number, number, number] =
      run.status === "passed" ? [34, 197, 94] :
      run.status === "failed" || run.status === "error" ? [239, 68, 68] :
      run.status === "warning" ? [245, 158, 11] : [156, 163, 175];
    drawText(`Status: ${run.status}`, ml, cw, 8, "normal", statusColor);

    const disclaimer = SCOPE_DISCLAIMERS[agentNum];
    if (disclaimer) {
      drawText(`[!] ${disclaimer}`, ml, cw, 7, "italic", [180, 130, 40]);
      y += 1;
    }

    if (LOWER_CONFIDENCE_AGENTS.includes(agentNum)) {
      drawText(`[Review] Review recommended -- this agent uses AI judgment.`, ml, cw, 7, "italic", [180, 130, 40]);
      y += 1;
    }

    const report = run.report as AgentReport | null;
    if (report?.checks && report.checks.length > 0) {
      for (const check of report.checks) {
        checkPage(12);
        const icon = check.status === "passed" ? "PASS" : check.status === "failed" ? "FAIL" : check.status === "warning" ? "WARN" : "--";
        const checkColor: [number, number, number] =
          check.status === "passed" ? [34, 197, 94] :
          check.status === "failed" ? [239, 68, 68] :
          check.status === "warning" ? [245, 158, 11] : [156, 163, 175];

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...checkColor);
        doc.text(icon, ml + 2, y);
        doc.setTextColor(45, 30, 14);
        const sevStr = check.severity ? ` [${check.severity}]` : "";
        doc.text(`${check.check_name}${sevStr}`, ml + 8, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);

        if (check.details) { drawText(check.details, ml + 8, cw - 8, 7, "normal", [100, 100, 100]); }
        if (check.finding) { drawText(`Finding: ${check.finding}`, ml + 8, cw - 8, 7); }
        if (check.expected) { drawText(`Expected: ${check.expected}`, ml + 8, cw - 8, 7, "normal", [34, 140, 70]); }
        if (check.actual) { drawText(`Actual: ${check.actual}`, ml + 8, cw - 8, 7, "normal", [200, 50, 50]); }
        if (check.element_location) { drawText(`Element: ${check.element_location}`, ml + 8, cw - 8, 7, "italic", [100, 100, 100]); }
        if (check.recommendation) { drawText(`Recommendation: ${check.recommendation}`, ml + 8, cw - 8, 7, "normal", [80, 80, 80]); }
        y += 3;
      }
    } else if (run.status === "skipped" || run.status === "not_started") {
      drawText("No checks run.", ml + 4, cw, 7, "italic", [150, 150, 150]);
    }

    y += 4;
  }

  addFooter();

  const filename = `${getSlugDate(page)}.pdf`;
  doc.save(filename);
}
