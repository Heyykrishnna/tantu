"use client";

import { CandyButton } from "@/components/ui/candy-button";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { api, searchResults } from "../lib/api";
import type { SearchResultItem } from "../lib/api";
import { Icon } from "../components/icon";
import { SearchInput } from "@/components/ui/search-input";
import { Orb } from "@/components/ui/orb";
import {
  Button,
  mutedClass,
  panelClass,
} from "../components/ui";

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
    if (!isOpen || !workspaceId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError("");
      const typeParam = typeFilter !== "all" ? `&type=${typeFilter}` : "";
      api(
        `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}${typeParam}`,
        searchResults,
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
  }, [isOpen, query, typeFilter, workspaceId]);

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

      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800 space-y-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={() => {}}
          onClear={() => setQuery("")}
          busy={loading}
          placeholder="Search tasks, pages, projects, promises, or archives..."
        />

        <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/90 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ["all", "All"],
              ["task", "Tasks"],
              ["page", "Pages"],
              ["project", "Projects"],
              ["promise", "Promises"],
            ] as const
          ).map(([val, label]) => (
            <CandyButton variant="ghost" size="unstyled"
              key={val}
              type="button"
              onClick={() => setTypeFilter(val)}
              className="relative rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors outline-none"
            >
              {typeFilter === val && (
                <motion.div
                  layoutId="search-filter-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className="absolute inset-0 rounded-lg border border-zinc-200/90 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
              )}
              <span
                className={`relative z-10 ${
                  typeFilter === val
                    ? "font-semibold text-zinc-950 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </span>
            </CandyButton>
          ))}
        </div>
      </div>

      <div className="max-h-90 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <Orb state="solving" interactive={false} theme="auto" size={64} display={36} />
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Searching live records...</p>
          </div>
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
              <CandyButton variant="ghost" size="unstyled"
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
              </CandyButton>
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
