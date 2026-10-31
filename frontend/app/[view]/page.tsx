import WorkspaceApp from "../workspace-app";
import { notFound } from "next/navigation";
import { resolveView, workspaceViews } from "../../lib/navigation";

export function generateStaticParams() {
  return workspaceViews.map((view) => ({ view }));
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const initialView = resolveView(view);
  if (!initialView) notFound();
  return <WorkspaceApp initialView={initialView} />;
}
