"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Icon } from "../components/icon";
import {
  Button,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface SearchResultItem {
  recordId: string;
  targetType: "task" | "page" | "project" | "mail" | "promise";
  title: string;
  snippet: string;
  status: string;
  updatedAt: string;
  relevance: number;
}

export default function SearchModal({
  isOpen,
  workspaceId,
  onClose,
  onSelectResult,
}: {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onSelectResult: (type: SearchResultItem["targetType"], id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError("");
      const typeParam = typeFilter !== "all" ? `&type=${typeFilter}` : "";
      api<{ results: SearchResultItem[] }>(
        `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}${typeParam}`,
        (v) => v as { results: SearchResultItem[] },
        { signal: controller.signal }
      )
        .then((res) => {
          setResults(res.results);
          setLoading(false);
        })
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Search failed.");
          setLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, typeFilter, workspaceId]);

  const handleSelect = (item: SearchResultItem) => {
    onSelectResult(item.targetType, item.recordId);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={`${panelClass} m-auto w-160 max-w-[calc(100vw-32px)] p-0 text-inherit shadow-2xl dark:shadow-black/70 backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
      aria-label="Unified live search"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Icon name="search" className="size-4 text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            Unified Live Search
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
          <Icon name="close" className="size-4" />
        </Button>
      </header>

      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400 dark:text-zinc-500"
          />
          <input
            type="search"
            className={`${inputClass} pl-9 pr-4 text-sm`}
            placeholder="Search tasks, pages, projects, promises, or archives..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["task", "Tasks"],
              ["page", "Pages"],
              ["project", "Projects"],
              ["promise", "Promises"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setTypeFilter(val)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                typeFilter === val
                  ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 dark:bg-zinc-850 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-90 overflow-y-auto p-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Searching live records...</div>
        ) : error ? (
          <div className="p-4 text-center text-xs text-rose-500">{error}</div>
        ) : query.trim() && results.length === 0 ? (
          <div className={`p-8 text-center text-xs ${mutedClass}`}>
            No authorized records matched &ldquo;{query}&rdquo;.
          </div>
        ) : !query.trim() ? (
          <div className={`p-8 text-center text-xs ${mutedClass}`}>
            Type a query to search across all authorized workspace records in real time.
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((item) => (
              <button
                key={`${item.targetType}:${item.recordId}`}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full rounded-lg p-3 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-850"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                      {item.targetType}
                    </span>
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </span>
                  </div>
                  <span className={`text-[10px] ${mutedClass}`}>
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                {item.snippet && (
                  <p className="mt-1 line-clamp-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                    {item.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 text-[10px] dark:border-zinc-800">
        <span className={mutedClass}>
          Current access and tombstones rechecked · ESC to close
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
          Authoritative Live Index
        </span>
      </footer>
    </dialog>
  );
}
