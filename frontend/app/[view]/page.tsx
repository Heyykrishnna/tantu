import { Suspense } from "react";
import WorkspaceApp from "../workspace-app";
import { notFound } from "next/navigation";
import { LoadingState } from "../../components/ui/loading-state";
import { resolveView, workspaceViews } from "../../lib/navigation";

type ViewParams = Promise<{ view: string }>;

export function generateStaticParams() {
  return workspaceViews.map((view) => ({ view }));
}

export default function ViewPage({ params }: { params: ViewParams }) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center p-6">
          <LoadingState label="Preparing workspace…" />
        </main>
      }
    >
      <WorkspaceView params={params} />
    </Suspense>
  );
}

async function WorkspaceView({ params }: { params: ViewParams }) {
  const { view } = await params;
  const initialView = resolveView(view);
  if (!initialView) notFound();
  return <WorkspaceApp initialView={initialView} />;
}
