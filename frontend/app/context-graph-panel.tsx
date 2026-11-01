"use client";

import { CandyButton } from "@/components/ui/candy-button";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";
import { Orb } from "@/components/ui/orb";

export interface ContextNodeItem {
  id: string;
  workspaceId: string;
  entityType: "project" | "task" | "page" | "event" | "promise" | "decision";
  entityId: string;
  title: string;
  provenance: Record<string, unknown>;
  confirmed: boolean;
  createdAt: string;
}

export interface ContextEdgeItem {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: "informs" | "decides" | "blocks" | "references" | "derives";
  provenance: Record<string, unknown>;
  confirmed: boolean;
  createdAt: string;
}

export default function ContextGraphPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [nodes, setNodes] = useState<ContextNodeItem[]>([]);
  const [edges, setEdges] = useState<ContextEdgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<ContextNodeItem | null>(
    null,
  );

  const [isLinking, setIsLinking] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relType, setRelType] = useState<
    "informs" | "decides" | "blocks" | "references" | "derives"
  >("references");

  useEffect(() => {
    const controller = new AbortController();
    api<{ nodes: ContextNodeItem[]; edges: ContextEdgeItem[] }>(
      `/workspaces/${workspaceId}/context-graph`,
      (v) => v as { nodes: ContextNodeItem[]; edges: ContextEdgeItem[] },
      { signal: controller.signal },
    )
      .then((res) => {
        setNodes(res.nodes ?? []);
        setEdges(res.edges ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load context graph.",
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function loadGraph() {
    setBusy(true);
    api<{ nodes: ContextNodeItem[]; edges: ContextEdgeItem[] }>(
      `/workspaces/${workspaceId}/context-graph`,
      (v) => v as { nodes: ContextNodeItem[]; edges: ContextEdgeItem[] },
    )
      .then((res) => {
        setNodes(res.nodes ?? []);
        setEdges(res.edges ?? []);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to reload context graph.",
        );
        setBusy(false);
      });
  }

  function handleCreateLink(e: FormEvent) {
    e.preventDefault();
    if (!sourceId || !targetId || sourceId === targetId) {
      setError("Please select distinct source and target nodes.");
      return;
    }

    const sNode = nodes.find((n) => n.id === sourceId);
    const tNode = nodes.find((n) => n.id === targetId);
    if (!sNode || !tNode) return;

    setBusy(true);
    setError("");
    api<{ edge: ContextEdgeItem }>(
      `/workspaces/${workspaceId}/context-graph/edges`,
      (v) => v as { edge: ContextEdgeItem },
      {
        method: "POST",
        csrf,
        body: {
          source: {
            entityType: sNode.entityType,
            entityId: sNode.entityId,
            title: sNode.title,
          },
          target: {
            entityType: tNode.entityType,
            entityId: tNode.entityId,
            title: tNode.title,
          },
          relationshipType: relType,
        },
      },
    )
      .then(() => {
        setNotice("Context edge established.");
        setIsLinking(false);
        setSourceId("");
        setTargetId("");
        loadGraph();
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to create context edge.",
        );
        setBusy(false);
      });
  }

  const filteredNodes = nodes.filter((n) => {
    if (typeFilter !== "all" && n.entityType !== typeFilter) return false;
    return true;
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={headingClass}>Context Graph</h2>
          <p className={mutedClass}>
            Explicit multi-entity relationships across projects, tasks, pages,
            decisions, and promises.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => setIsLinking(true)}
            disabled={busy || nodes.length < 2}
          >
            <Icon name="network" className="size-4" />
            <span>Link Entities</span>
          </Button>
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {["all", "project", "task", "page", "event", "promise", "decision"].map(
          (et) => (
            <CandyButton variant="ghost" size="unstyled"
              key={et}
              type="button"
              onClick={() => setTypeFilter(et)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                typeFilter === et
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              }`}
            >
              {et.charAt(0).toUpperCase() + et.slice(1)}
            </CandyButton>
          ),
        )}
      </div>

      {isLinking && (
        <form onSubmit={handleCreateLink} className={`${panelClass} space-y-4 p-5 sm:p-6`}>
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Create Context Relationship</h3>
            <CandyButton variant="ghost" size="unstyled"
              type="button"
              onClick={() => setIsLinking(false)}
              className="text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Cancel
            </CandyButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Source Entity">
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select source...</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    [{n.entityType}] {n.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Relationship Type">
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value as typeof relType)}
                className={inputClass}
              >
                <option value="informs">informs</option>
                <option value="decides">decides</option>
                <option value="blocks">blocks</option>
                <option value="references">references</option>
                <option value="derives">derives</option>
              </select>
            </Field>
            <Field label="Target Entity">
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select target...</option>
                {nodes
                  .filter((n) => n.id !== sourceId)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      [{n.entityType}] {n.title}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsLinking(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Establishing..." : "Connect"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
          <Orb state="solving" interactive={false} theme="auto" size={64} display={44} />
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Loading context graph...</p>
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className={`${panelClass} p-8 text-center space-y-2`}>
          <Icon name="network" className="size-8 mx-auto text-neutral-400" />
          <h3 className="font-medium text-sm">No context nodes found</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Context nodes are automatically indexed when projects, tasks, pages,
            decisions, and promises are recorded.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
              Indexed Nodes ({filteredNodes.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredNodes.map((node) => (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    selectedNode?.id === node.id
                      ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800"
                      : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
                      {node.entityType}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {node.confirmed ? "Confirmed" : "Inferred"}
                    </span>
                  </div>
                  <div className="font-medium text-sm mt-1">{node.title}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
              Connected Relationships ({edges.length})
            </h3>
            {edges.length === 0 ? (
              <div
                className={`${panelClass} p-6 text-center text-xs text-neutral-500`}
              >
                No explicit relationships established yet. Click &quot;Link
                Entities&quot; above to connect records.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {edges.map((edge) => {
                  const s = nodeMap.get(edge.sourceNodeId);
                  const t = nodeMap.get(edge.targetNodeId);
                  return (
                    <div
                      key={edge.id}
                      className="p-3 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 text-xs space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {s ? s.title : "Unknown"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 dark:bg-neutral-800 font-mono">
                          --[{edge.relationshipType}]--&gt;
                        </span>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {t ? t.title : "Unknown"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
