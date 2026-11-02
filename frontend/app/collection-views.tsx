"use client";
import { Select } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import { integer } from "../lib/projects";
import type { Property } from "../lib/knowledge";
import { Button, Field, Notice, inputClass } from "../components/ui";
export interface CollectionView {
  mode: "table" | "list";
  sort: "title";
  group: "none";
  status: "all";
  columns: string[];
  filter: string;
  propertySort: string;
  propertyGroup: string;
  propertyFilter: { propertyId: string; value: string };
}
function saved(value: unknown) {
  const row = record(value);
  return {
    id: string(row.id),
    name: string(row.name),
    shared: row.ownerId === null,
    version: integer(row.version),
    settings: record(row.settings),
  };
}
export default function CollectionViews({
  workspaceId,
  collectionId,
  csrf,
  properties,
  current,
  onApply,
}: {
  workspaceId: string;
  collectionId: string;
  csrf: string;
  properties: Property[];
  current: CollectionView;
  onApply: (value: CollectionView) => void;
}) {
  const path = `/workspaces/${workspaceId}/views/collection/${collectionId}`;
  const [views, setViews] = useState<ReturnType<typeof saved>[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("My collection view");
  const [shared, setShared] = useState(false);
  const ids = properties.map((property) => property.id);
  useEffect(() => {
    const controller = new AbortController();
    api(path, items(saved), { signal: controller.signal })
      .then(setViews)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Saved views unavailable.",
          );
      });
    return () => controller.abort();
  }, [path]);
  function apply(view: ReturnType<typeof saved>) {
    const input = view.settings;
    const propertyFilter = input.propertyFilter
      ? record(input.propertyFilter)
      : {};
    const columns = Array.isArray(input.columns)
      ? input.columns.filter(
          (value): value is string => typeof value === "string",
        )
      : ids;
    const missing =
      columns.some((id) => !ids.includes(id)) ||
      (typeof input.propertySort === "string" &&
        !["title", ...ids].includes(input.propertySort)) ||
      (typeof input.propertyGroup === "string" &&
        !["none", ...ids].includes(input.propertyGroup));
    setMessage(
      missing
        ? "This view references removed properties. Unavailable columns and grouping were removed locally; save the repaired view explicitly."
        : "",
    );
    setName(view.name);
    setShared(view.shared);
    onApply({
      ...current,
      mode: input.mode === "list" ? "list" : "table",
      columns: columns.filter((id) => ids.includes(id)),
      filter: typeof input.filter === "string" ? input.filter : "",
      propertySort:
        typeof input.propertySort === "string" &&
        ids.includes(input.propertySort)
          ? input.propertySort
          : "title",
      propertyGroup:
        typeof input.propertyGroup === "string" &&
        ids.includes(input.propertyGroup)
          ? input.propertyGroup
          : "none",
      propertyFilter: {
        propertyId:
          typeof propertyFilter.propertyId === "string" &&
          ids.includes(propertyFilter.propertyId)
            ? propertyFilter.propertyId
            : "",
        value:
          typeof propertyFilter.value === "string" ? propertyFilter.value : "",
      },
    });
  }
  return (
    <details className="rounded-lg border border-[#dedfeb] p-3 dark:border-[#303032]">
      <summary className="cursor-pointer text-xs font-medium">
        Saved collection views
      </summary>
      <div className="mt-3 grid gap-3">
        <Notice>{message}</Notice>
        <div className="flex flex-wrap gap-2">
          {views.map((view) => (
            <Button key={view.id} size="sm" onClick={() => apply(view)}>
              {view.name} · {view.shared ? "Shared" : "Personal"}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Group collection by">
            <Select
              className={inputClass}
              value={current.propertyGroup}
              onChange={(event) =>
                onApply({ ...current, propertyGroup: event.target.value })
              }
            >
              <option value="none">No grouping</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Filter property">
            <Select
              className={inputClass}
              value={current.propertyFilter.propertyId}
              onChange={(event) =>
                onApply({
                  ...current,
                  propertyFilter: {
                    ...current.propertyFilter,
                    propertyId: event.target.value,
                  },
                })
              }
            >
              <option value="">No property filter</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property contains">
            <input
              maxLength={200}
              className={inputClass}
              value={current.propertyFilter.value}
              onChange={(event) =>
                onApply({
                  ...current,
                  propertyFilter: {
                    ...current.propertyFilter,
                    value: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Collection view name">
            <input
              maxLength={100}
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {properties.map((property) => (
            <label key={property.id}>
              <input
                type="checkbox"
                aria-label={"Show " + property.name + " column"}
                checked={current.columns.includes(property.id)}
                onChange={(event) =>
                  onApply({
                    ...current,
                    columns: event.target.checked
                      ? [...current.columns, property.id]
                      : current.columns.filter((id) => id !== property.id),
                  })
                }
              />{" "}
              {property.name}
            </label>
          ))}
        </div>
        <label className="text-xs">
          <input
            type="checkbox"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
          />{" "}
          Shared view (requires collection edit access)
        </label>
        <Button
          disabled={busy || !name.trim()}
          onClick={() => {
            setBusy(true);
            const { propertyFilter, ...settings } = current;
            api(path, acknowledgment, {
              method: "POST",
              csrf,
              body: {
                name,
                shared,
                settings: {
                  ...settings,
                  ...(propertyFilter.propertyId ? { propertyFilter } : {}),
                },
                expectedVersion:
                  views.find(
                    (view) => view.name === name && view.shared === shared,
                  )?.version ?? 0,
                operationId: crypto.randomUUID(),
              },
            })
              .then(() => api(path, items(saved)))
              .then(setViews)
              .catch((error: unknown) =>
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "View could not save.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Save collection view
        </Button>
      </div>
    </details>
  );
}
