"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  acknowledgment,
  api,
  choice,
  items,
  page,
  record,
  string,
} from "../lib/api";
import type { CanonicalRecord } from "../lib/contracts";
import { collection, schemaReview } from "../lib/knowledge";
import type { Property } from "../lib/knowledge";
import { integer } from "../lib/projects";
import {
  Badge,
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";

function summary(value: unknown) {
  const item = record(value);
  return {
    id: string(item.id),
    title: string(item.title),
    version: integer(item.version),
  };
}
function display(value: unknown): string {
  return value === undefined || value === null
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);
}
export default function CollectionPanel({
  workspaceId,
  csrf,
  onOpen,
}: {
  workspaceId: string;
  csrf: string;
  onOpen: (id: string, kind: "task" | "page") => void;
}) {
  const [entries, setEntries] = useState<ReturnType<typeof summary>[]>([]);
  const [sources, setSources] = useState<CanonicalRecord[]>([]);
  const [detail, setDetail] = useState<ReturnType<typeof collection> | null>(
    null,
  );
  const [definitions, setDefinitions] = useState<Property[]>([]);
  const [review, setReview] = useState<ReturnType<typeof schemaReview> | null>(
    null,
  );
  const [reviewOperation, setReviewOperation] = useState("");
  const [editRow, setEditRow] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("title");
  const [mode, setMode] = useState<"table" | "list">("table");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const base = `/workspaces/${workspaceId}/collections`;
  const load = useCallback(async () => {
    const [collections, tasks, pages] = await Promise.all([
      api(base, items(summary)),
      api(`/workspaces/${workspaceId}/tasks?limit=50`, page),
      api(`/workspaces/${workspaceId}/pages?limit=50`, page),
    ]);
    setEntries(collections);
    setSources([...tasks.items, ...pages.items]);
  }, [base, workspaceId]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(base, items(summary), { signal: controller.signal }),
      api(`/workspaces/${workspaceId}/tasks?limit=50`, page, {
        signal: controller.signal,
      }),
      api(`/workspaces/${workspaceId}/pages?limit=50`, page, {
        signal: controller.signal,
      }),
    ])
      .then(([collections, tasks, pages]) => {
        setEntries(collections);
        setSources([...tasks.items, ...pages.items]);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Collections could not load.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, workspaceId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The collection change could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(id: string) {
    const data = await api(base + "/" + id, collection);
    setDetail(data);
    setDefinitions(data.properties);
    setReview(null);
    setEditRow("");
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      await api(base, acknowledgment, {
        method: "POST",
        csrf,
        body: {
          pageId: String(data.get("pageId")),
          operationId: crypto.randomUUID(),
        },
      });
      await load();
      await select(String(data.get("pageId")));
    });
  }
  function addProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = choice(data.get("type"), [
      "text",
      "number",
      "boolean",
      "date",
      "select",
      "formula",
    ]);
    setDefinitions([
      ...definitions,
      {
        id: crypto.randomUUID(),
        name: String(data.get("name")),
        type,
        options:
          type === "select"
            ? String(data.get("options"))
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
        formula:
          type === "formula"
            ? {
                operator: choice(data.get("operator"), [
                  "add",
                  "subtract",
                  "multiply",
                  "divide",
                ]),
                left: String(data.get("left")),
                right: String(data.get("right")),
              }
            : null,
      },
    ]);
    setReview(null);
    form.reset();
  }
  async function saveRow(
    event: FormEvent<HTMLFormElement>,
    id: string,
    version: number,
  ) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const property of detail.properties) {
      if (property.type === "formula") continue;
      const value = String(data.get(property.id) ?? "");
      values[property.id] =
        value === ""
          ? null
          : property.type === "number"
            ? Number(value)
            : property.type === "boolean"
              ? value === "true"
              : value;
    }
    await run(async () => {
      await api(base + `/${detail.id}/items`, acknowledgment, {
        method: "POST",
        csrf,
        body: {
          recordId: id,
          values,
          expectedVersion: version,
          schemaVersion: detail.version,
          operationId: crypto.randomUUID(),
        },
      });
      await select(detail.id);
    });
  }
  const selectedRow = detail?.items.find((row) => row.record.id === editRow);
  const newSource = sources.find((source) => source.id === editRow);
  const visible =
    detail?.items
      .filter((row) =>
        row.record.title.toLowerCase().includes(filter.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.record.title.localeCompare(b.record.title)
          : display(a.values[sort]).localeCompare(
              display(b.values[sort]),
              undefined,
              { numeric: true },
            ),
      ) ?? [];
  const valueField = (property: Property, value: unknown) =>
    property.type === "formula" ? (
      <p className={`text-[11px] ${mutedClass}`}>
        Computed from numeric properties.
      </p>
    ) : property.type === "boolean" ? (
      <select
        name={property.id}
        defaultValue={typeof value === "boolean" ? String(value) : ""}
        className={inputClass}
      >
        <option value="">Unset</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    ) : property.type === "select" ? (
      <select
        name={property.id}
        defaultValue={typeof value === "string" ? value : ""}
        className={inputClass}
      >
        <option value="">Unset</option>
        {property.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    ) : (
      <input
        name={property.id}
        type={
          property.type === "number"
            ? "number"
            : property.type === "date"
              ? "date"
              : "text"
        }
        step={property.type === "number" ? "any" : undefined}
        maxLength={4000}
        defaultValue={
          value === undefined || value === null ? "" : String(value)
        }
        className={inputClass}
      />
    );
  return (
    <section className="grid gap-5">
      <header>
        <h1 className={`${headingClass} text-2xl`}>Collections</h1>
        <p className={`mt-2 text-[12px] ${mutedClass}`}>
          Give existing tasks and pages a shared structure. Their original
          permissions still apply.
        </p>
      </header>
      <Notice role="alert" tone="error">
        {message}
      </Notice>
      <details className={`${panelClass} p-4`}>
        <summary className="cursor-pointer text-[12px] font-medium">
          Create a collection on a page
        </summary>
        <form
          onSubmit={(event) => void create(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <Field label="Collection page">
            <select aria-label="Collection page" name="pageId" required className={inputClass}>
              <option value="">Choose a page (first 50)</option>
              {sources
                .filter((source) => source.kind === "page" && source.canEdit)
                .map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            Create collection
          </Button>
        </form>
      </details>
      <div className="grid items-start gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside
          className={`${panelClass} grid gap-2 p-3`}
          aria-label="Collections"
        >
          {loading ? (
            <p role="status" className="p-3 text-[12px]">
              Loading collections…
            </p>
          ) : entries.length ? (
            entries.map((entry) => (
              <Button
                key={entry.id}
                variant={detail?.id === entry.id ? "primary" : "ghost"}
                className="justify-start truncate"
                disabled={busy}
                onClick={() => void run(() => select(entry.id))}
              >
                {entry.title}
              </Button>
            ))
          ) : (
            <p className={`p-3 text-[12px] ${mutedClass}`}>
              No collections yet.
            </p>
          )}
          <p className={`px-3 text-[10px] ${mutedClass}`}>
            First 100 accessible collections.
          </p>
        </aside>
        {detail ? (
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <Button
                aria-pressed={mode === "table"}
                onClick={() => setMode("table")}
              >
                Table
              </Button>
              <Button
                aria-pressed={mode === "list"}
                onClick={() => setMode("list")}
              >
                List
              </Button>
              <Field label="Filter record titles">
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  maxLength={100}
                  className={inputClass}
                />
              </Field>
              <Field label="Sort by">
                <select aria-label="Sort by"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className={inputClass}
                >
                  <option value="title">Title</option>
                  {detail.properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className={`${panelClass} overflow-auto`}>
              {!visible.length ? (
                <p className="p-6 text-[12px]">
                  No records in this view. Link a record below.
                </p>
              ) : mode === "table" ? (
                <table className="w-full text-left text-[11px]">
                  <caption className="sr-only">
                    Canonical collection records
                  </caption>
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Record</th>
                      {detail.properties.map((property) => (
                        <th
                          className="whitespace-nowrap px-4 py-3"
                          key={property.id}
                        >
                          {property.name}
                        </th>
                      ))}
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr
                        className="border-t border-[#e1e4ec] dark:border-[#303032]"
                        key={row.record.id}
                      >
                        <td className="max-w-xs px-4 py-3">
                          <button
                            className="max-w-xs truncate rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                            onClick={() =>
                              onOpen(row.record.id, row.record.kind)
                            }
                          >
                            {row.record.title}
                          </button>
                          {row.repairs.length > 0 && (
                            <span className="ml-2">
                              <Badge tone="amber">Needs repair</Badge>
                            </span>
                          )}
                        </td>
                        {detail.properties.map((property) => (
                          <td
                            className="max-w-xs truncate px-4 py-3"
                            key={property.id}
                          >
                            {display(row.values[property.id])}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            disabled={
                              !detail.canEdit || !row.record.canEdit || busy
                            }
                            onClick={() => setEditRow(row.record.id)}
                          >
                            Edit values
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ul className="divide-y divide-[#e1e4ec] dark:divide-[#303032]">
                  {visible.map((row) => (
                    <li
                      className="flex items-center justify-between gap-3 p-4"
                      key={row.record.id}
                    >
                      <button
                        className="truncate rounded text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                        onClick={() => onOpen(row.record.id, row.record.kind)}
                      >
                        {row.record.title}
                      </button>
                      <Badge>{row.record.kind}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {detail.nextCursor && (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const next = await api(
                      base + `/${detail.id}?cursor=${detail.nextCursor}`,
                      collection,
                    );
                    setDetail({
                      ...next,
                      items: [...detail.items, ...next.items],
                    });
                  })
                }
              >
                More records
              </Button>
            )}
            <p className={`text-[10px] ${mutedClass}`}>
              Only accessible endpoints are included. Personal filtering and
              sorting do not change the shared schema.
            </p>
            {detail.canEdit && (
              <>
                <Field label="Link or edit an existing record">
                  <select disabled={busy} aria-label="Link or edit an existing record"
                    value={editRow}
                    onChange={(event) => setEditRow(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">
                      Choose a source (first 50 tasks/pages)
                    </option>
                    {sources
                      .filter((source) => source.canEdit)
                      .map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                  </select>
                </Field>
                {editRow && (selectedRow || newSource) && (
                  <form
                    key={editRow + (selectedRow?.version ?? 0)}
                    onSubmit={(event) =>
                      void saveRow(event, editRow, selectedRow?.version ?? 0)
                    }
                    className={`${panelClass} grid gap-4 p-5`}
                  >
                    <h2 className="text-[13px] font-medium">
                      {selectedRow?.record.title ?? newSource?.title}
                    </h2>
                    {selectedRow?.repairs.map((repair) => (
                      <Notice key={repair.propertyId}>{repair.message}</Notice>
                    ))}
                    {detail.properties.map((property) => (
                      <Field label={property.name} key={property.id}>
                        {valueField(property, selectedRow?.values[property.id])}
                      </Field>
                    ))}
                    <p className={`text-[11px] ${mutedClass}`}>
                      Saving replaces this row’s property values with the
                      reviewed form. Removed-property values are cleared when
                      you save this repair.
                    </p>
                    <Button type="submit" disabled={busy}>
                      Save linked values
                    </Button>
                  </form>
                )}
                <details className={`${panelClass} p-5`}>
                  <summary className="cursor-pointer text-[12px] font-medium">
                    Shared collection schema
                  </summary>
                  <div className="mt-4 grid gap-4">
                    {definitions.map((property) => (
                      <div
                        className="flex flex-wrap items-center gap-2"
                        key={property.id}
                      >
                        <input
                          aria-label={`Property name ${property.name}`}
                          value={property.name}
                          maxLength={100}
                          onChange={(event) => {
                            setDefinitions(
                              definitions.map((item) =>
                                item.id === property.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            );
                            setReview(null);
                          }}
                          className={`${inputClass} sm:max-w-[220px]`}
                        />
                        <Badge>{property.type}</Badge>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setDefinitions(
                              definitions.filter(
                                (item) => item.id !== property.id,
                              ),
                            );
                            setReview(null);
                          }}
                        >
                          Remove {property.name}
                        </Button>
                      </div>
                    ))}
                    <form
                      onSubmit={addProperty}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <Field label="New property name">
                        <input
                          name="name"
                          required
                          maxLength={100}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Property type">
                        <select aria-label="Property type" name="type" className={inputClass}>
                          {[
                            "text",
                            "number",
                            "boolean",
                            "date",
                            "select",
                            "formula",
                          ].map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Select options (comma separated)">
                        <input
                          name="options"
                          maxLength={2000}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Formula operator">
                        <select aria-label="Formula operator" name="operator" className={inputClass}>
                          {["add", "subtract", "multiply", "divide"].map(
                            (operator) => (
                              <option key={operator}>{operator}</option>
                            ),
                          )}
                        </select>
                      </Field>
                      {["left", "right"].map((side) => (
                        <Field key={side} label={`Formula ${side} input`}>
                          <select name={side} className={inputClass}>
                            <option value="">Choose numeric property</option>
                            {definitions
                              .filter(
                                (item) =>
                                  item.type === "number" ||
                                  item.type === "formula",
                              )
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                      ))}
                      <Button
                        type="submit"
                        disabled={definitions.length >= 30 || busy}
                      >
                        Add property to review
                      </Button>
                    </form>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setReview(
                            await api(
                              base + `/${detail.id}/schema/review`,
                              schemaReview,
                              {
                                method: "POST",
                                csrf,
                                body: {
                                  properties: definitions,
                                  expectedVersion: detail.version,
                                },
                              },
                            ),
                          );
                          setReviewOperation(crypto.randomUUID());
                        })
                      }
                    >
                      Review schema changes
                    </Button>
                  </div>
                </details>
                {review && (
                  <section
                    aria-label="Schema change review"
                    className={`${panelClass} grid gap-3 p-5`}
                  >
                    <h2 className={`${headingClass} text-lg`}>
                      Review schema changes
                    </h2>
                    <p className="text-[12px]">
                      {review.removed.length} removed properties ·{" "}
                      {review.affected} visible rows need repair
                    </p>
                    <p className={`text-[11px] ${mutedClass}`}>
                      {review.repair}
                    </p>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            base + `/${detail.id}/schema/apply`,
                            acknowledgment,
                            {
                              method: "POST",
                              csrf,
                              body: {
                                reviewId: review.id,
                                operationId: reviewOperation,
                              },
                            },
                          );
                          await select(detail.id);
                        })
                      }
                    >
                      Confirm schema changes
                    </Button>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <p className={`${panelClass} p-8 text-[12px]`}>
            Select a collection to open its linked records.
          </p>
        )}
      </div>
    </section>
  );
}
