import WorkspaceApp from "../workspace-app";
import type { WorkspaceView } from "../workspace-navigation";

const workspaceViews: readonly WorkspaceView[] = [
  "tasks",
  "pages",
  "capture",
  "promises",
  "decisions",
  "graph",
  "planning",
  "kits",
  "meetings",
  "integrations",
  "enterprise",
  "discovery",
  "projects",
  "calendar",
  "mail",
  "collections",
  "rules",
  "activity",
  "settings",
  "operations",
];

export function generateStaticParams() {
  return workspaceViews.map((view) => ({ view }));
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const initialView = workspaceViews.find((v) => v === view) ?? "tasks";
  return <WorkspaceApp initialView={initialView} />;
}
