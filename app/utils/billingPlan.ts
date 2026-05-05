export function normalizePlanNameFromDb(planName: string | null | undefined) {
  const value = String(planName || "").toLowerCase();
  if (value.includes("year")) return "premium_yearly";
  if (value.includes("month") || value.includes("premium") || value.includes("pro")) return "premium_monthly";
  return "free";
}
