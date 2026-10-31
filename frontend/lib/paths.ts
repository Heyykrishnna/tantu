export function apiPath(path: string): string {
  if (!path || path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes("\\")) {
    throw new Error("API paths must be relative to the application.");
  }
  const relative = path.startsWith("/") ? path : `/${path}`;
  if (relative === "/api/v1" || relative.startsWith("/api/v1/") || relative.startsWith("/api/v1?")) return relative;
  return `/api/v1${relative}`;
}
