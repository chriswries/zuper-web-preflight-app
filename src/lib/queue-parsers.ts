import { isValidUrl, deriveSlug } from "@/lib/page-helpers";

export interface ParsedQueueRow {
  newUrl: string;
  oldUrl: string | null;
  slug: string | null;
  targetKeyword: string | null;
  valid: boolean;
  duplicate: boolean;
  duplicateSource?: "queue" | "pages";
  included: boolean;
}

/**
 * Parse multi-line text input.
 * Supports: single URL per line, or two URLs (comma/tab separated).
 */
export function parseMultiLine(text: string): ParsedQueueRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(/[,\t]+/).map((p) => p.trim());
    const newUrl = parts[0] || "";
    const oldUrl = parts[1] || null;
    return {
      newUrl,
      oldUrl,
      slug: isValidUrl(newUrl) ? deriveSlug(newUrl) : null,
      targetKeyword: null,
      valid: isValidUrl(newUrl) && (!oldUrl || isValidUrl(oldUrl)),
      duplicate: false,
      included: true,
    };
  });
}

/**
 * Parse CSV text. If first row column names match known fields, treat as header.
 */
export function parseCsv(text: string): ParsedQueueRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const headerCandidates = ["new_url", "old_url", "slug", "target_keyword"];
  const firstCols = lines[0].split(",").map((c) => c.trim().toLowerCase().replace(/['"]/g, ""));
  const isHeader = firstCols.some((c) => headerCandidates.includes(c));

  const startIdx = isHeader ? 1 : 0;

  // Map column indices
  let newUrlIdx = 0;
  let oldUrlIdx = 1;
  let slugIdx = 2;
  let kwIdx = 3;

  if (isHeader) {
    newUrlIdx = firstCols.indexOf("new_url");
    oldUrlIdx = firstCols.indexOf("old_url");
    slugIdx = firstCols.indexOf("slug");
    kwIdx = firstCols.indexOf("target_keyword");
    if (newUrlIdx === -1) newUrlIdx = 0; // fallback
  }

  return lines.slice(startIdx).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
    const newUrl = cols[newUrlIdx] || "";
    const oldUrl = oldUrlIdx >= 0 ? cols[oldUrlIdx] || null : null;
    const slug = slugIdx >= 0 ? cols[slugIdx] || null : null;
    const targetKeyword = kwIdx >= 0 ? cols[kwIdx] || null : null;
    return {
      newUrl,
      oldUrl,
      slug: slug || (isValidUrl(newUrl) ? deriveSlug(newUrl) : null),
      targetKeyword,
      valid: isValidUrl(newUrl) && (!oldUrl || isValidUrl(oldUrl)),
      duplicate: false,
      included: true,
    };
  });
}
