export const workspaceViews = [
  "tasks", "pages", "capture", "promises", "decisions", "graph", "planning",
  "kits", "meetings", "integrations", "enterprise", "discovery", "projects",
  "calendar", "mail", "collections", "rules", "activity", "settings", "operations",
] as const;

export type WorkspaceView = typeof workspaceViews[number];

export function resolveView(candidate: string | null | undefined): WorkspaceView | null {
  return workspaceViews.find((view) => view === candidate) ?? null;
}
