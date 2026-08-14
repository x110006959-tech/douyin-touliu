const dashboardPath = "/dashboard";

export function createLoginHref(returnTo?: string) {
  const safeReturnTo = getSafeReturnTo(returnTo);
  return safeReturnTo ? `/login?returnTo=${encodeURIComponent(safeReturnTo)}` : "/login";
}

export function getSafeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;

  try {
    const target = new URL(value, "http://localhost");
    if (target.origin !== "http://localhost") return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function loginDestination(returnTo: string | null | undefined) {
  return getSafeReturnTo(returnTo) || dashboardPath;
}
