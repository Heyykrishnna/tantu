"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Folder, FolderOpen, File } from "lucide-react";
import { CandyButton } from "./candy-button";
import { cn } from "../../lib/utils";
import { useUiMotion } from "../../lib/use-ui-motion";

export interface TreeNode {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  children?: TreeNode[];
  disabled?: boolean;
}

interface TreeViewProps {
  data: TreeNode[];
  label: string;
  selectedId: string;
  onNodeClick: (node: TreeNode) => void;
  defaultExpandedIds?: string[];
  className?: string;
}

export function TreeView({
  data,
  label,
  selectedId,
  onNodeClick,
  defaultExpandedIds = [],
  className,
}: TreeViewProps) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpandedIds));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const reduced = useUiMotion();
  const scope = useId();
  const visible = useMemo(() => {
    const nodes: { node: TreeNode; parentId: string | null }[] = [];
    function walk(items: TreeNode[], parentId: string | null) {
      for (const node of items) {
        if (node.disabled) continue;
        nodes.push({ node, parentId });
        if (node.children && expanded.has(node.id))
          walk(node.children, node.id);
      }
    }
    walk(data, null);
    return nodes;
  }, [data, expanded]);
  const tabStop =
    visible.find((item) => item.node.id === focusedId)?.node.id ??
    visible.find((item) => item.node.id === selectedId)?.node.id ??
    visible[0]?.node.id;

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function activate(node: TreeNode) {
    if (node.disabled) return;
    if (node.children?.length) toggle(node.id);
    else onNodeClick(node);
  }
  function focus(id?: string | null) {
    if (!id) return;
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  }
  function move(node: TreeNode, key: string) {
    const index = visible.findIndex((item) => item.node.id === node.id);
    if (index < 0) return false;
    switch (key) {
      case "ArrowDown":
        focus(visible[index + 1]?.node.id);
        return true;
      case "ArrowUp":
        focus(visible[index - 1]?.node.id);
        return true;
      case "Home":
        focus(visible[0]?.node.id);
        return true;
      case "End":
        focus(visible.at(-1)?.node.id);
        return true;
      case "ArrowRight":
        if (!node.children?.length) return false;
        if (expanded.has(node.id))
          focus(node.children.find((child) => !child.disabled)?.id);
        else toggle(node.id);
        return true;
      case "ArrowLeft":
        if (node.children?.length && expanded.has(node.id)) toggle(node.id);
        else focus(visible[index]?.parentId);
        return true;
      default:
        return false;
    }
  }
  function renderNode(node: TreeNode, level: number): ReactNode {
    const folder = Boolean(node.children?.length);
    const open = expanded.has(node.id);
    const selected = node.id === selectedId;
    const content = (
      <>
        <span className="grid size-4 shrink-0 place-items-center text-zinc-400">
          {folder ? (
            <motion.span
              animate={{ rotate: open ? 90 : 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 380, damping: 32 }
              }
            >
              <ChevronRight className="size-3.5" />
            </motion.span>
          ) : (
            <span className="size-1 rounded-full bg-current opacity-50" />
          )}
        </span>
        <span className="grid size-4 shrink-0 place-items-center text-zinc-500 dark:text-zinc-400">
          {node.icon ??
            (folder ? (
              open ? (
                <FolderOpen className="size-4" />
              ) : (
                <Folder className="size-4" />
              )
            ) : (
              <File className="size-4" />
            ))}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
      </>
    );
    return (
      <div key={node.id} className="relative min-w-0">
        <div
          ref={(element) => {
            if (element) itemRefs.current.set(node.id, element);
            else itemRefs.current.delete(node.id);
          }}
          role="treeitem"
          aria-label={node.label}
          aria-level={level + 1}
          aria-expanded={folder ? open : undefined}
          aria-owns={folder && open ? `${scope}-${node.id}-group` : undefined}
          aria-selected={!folder ? selected : undefined}
          aria-disabled={node.disabled || undefined}
          tabIndex={!node.disabled && tabStop === node.id ? 0 : -1}
          onFocus={() => setFocusedId(node.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate(node);
            } else if (move(node, event.key)) event.preventDefault();
          }}
          className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          {selected && (
            <motion.div
              layoutId={`${scope}-selection`}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 36 }
              }
              className="pointer-events-none absolute inset-0 rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            />
          )}
          <CandyButton
            as={node.href ? "a" : undefined}
            href={node.href}
            type="button"
            role={node.href ? "link" : "button"}
            variant="ghost"
            size="sm"
            tabIndex={-1}
            disabled={node.disabled}
            aria-current={selected && node.href ? "page" : undefined}
            onClick={(event) => {
              if (
                node.href &&
                (event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey)
              )
                return;
              event.preventDefault();
              activate(node);
            }}
            className={cn(
              "relative h-9 w-full justify-start rounded-lg px-2 text-left text-xs font-normal [&>span]:w-full [&>span]:justify-start [&>span]:gap-2",
              selected && "text-zinc-950 dark:text-zinc-100",
              folder && "font-medium",
            )}
          >
            {content}
          </CandyButton>
        </div>
        <AnimatePresence initial={false}>
          {folder && open && (
            <motion.div
              id={`${scope}-${node.id}-group`}
              role="group"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      height: { type: "spring", stiffness: 380, damping: 34 },
                      opacity: { duration: 0.14 },
                    }
              }
              className="ml-3 overflow-hidden border-l border-zinc-200 pl-2 dark:border-zinc-800"
            >
              {node.children?.map((child) => renderNode(child, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div
      role="tree"
      aria-label={label}
      className={cn("grid min-w-0 gap-0.5", className)}
    >
      {data.map((node) => renderNode(node, 0))}
    </div>
  );
}

export const FileTree = TreeView;
