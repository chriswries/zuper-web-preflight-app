/** Normalize short-form check statuses returned by AI to long-form. */
const STATUS_MAP: Record<string, string> = {
  pass: "passed",
  fail: "failed",
  skip: "skipped",
};

export function normalizeCheckStatus(raw: string): string {
  return STATUS_MAP[raw] ?? raw;
}

/** Badge className by normalized status — matches PRD color scheme. */
export const CHECK_STATUS_BADGE_CLASS: Record<string, string> = {
  passed: "bg-zuper-green text-white border-transparent",
  failed: "bg-zuper-red text-white border-transparent",
  warning: "bg-zuper-amber text-white border-transparent",
  skipped: "bg-zuper-gray text-white border-transparent",
  error: "bg-zuper-red text-white border-transparent",
};

export function checkBadgeClass(status: string): string {
  return CHECK_STATUS_BADGE_CLASS[normalizeCheckStatus(status)] ?? CHECK_STATUS_BADGE_CLASS.skipped;
}
