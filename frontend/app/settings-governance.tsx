"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, list, record, string } from "../lib/api";
import {
  Badge,
  Button,
  Field,
  headingClass,
  inputClass,
  mutedClass,
  Notice,
  panelClass,
} from "../components/ui";

interface ExportItem {
  id: string;
  exportFormat: string;
  recordCount: number;
  createdAt: string;
  expiresAt: string;
}
function exportsList(value: unknown): ExportItem[] {
  return list(record(value).exports, (value) => {
    const item = record(value);
    if (
      typeof item.recordCount !== "number" ||
      !Number.isSafeInteger(item.recordCount)
    )
      throw new Error("Invalid export record count.");
    return {
      id: string(item.id),
      exportFormat: string(item.exportFormat),
      recordCount: item.recordCount,
      createdAt: string(item.createdAt),
      expiresAt: string(item.expiresAt),
    };
  });
}

export default function SettingsGovernance({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [retention, setRetention] = useState<number | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const path = `/workspaces/${workspaceId}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(
        path + "/enterprise-policy",
        (value) => {
          const days = record(record(value).policy).retentionDays;
          if (typeof days !== "number" || !Number.isSafeInteger(days))
            throw new Error("Invalid retention defaults.");
          return days;
        },
        { signal: controller.signal },
      ),
      api(path + "/audit-exports", exportsList, { signal: controller.signal }),
    ])
      .then(([days, items]) => {
        setRetention(days);
        setExports(items);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Audit settings are unavailable.",
          );
      });
    return () => controller.abort();
  }, [path, version]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The operation could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (retention === null) return;
    void run(async () => {
      await api(path + "/enterprise-policy", record, {
        method: "PUT",
        csrf,
        body: { retentionDays: retention },
      });
      setNotice("Retention defaults saved. No records were deleted.");
    });
  }
  function download(id: string) {
    void run(async () => {
      const file = await api(path + `/audit-exports/${id}/file`, (value) => {
        const data = record(value);
        return {
          payload: string(data.payload),
          fileName: string(data.fileName),
          mediaType: string(data.mediaType),
        };
      });
      const url = URL.createObjectURL(
        new Blob([file.payload], { type: file.mediaType }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.fileName;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  }
  return (
    <div className="grid gap-6">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      <section className={`${panelClass} p-6`}>
        <h2 className={`${headingClass} text-lg`}>Retention defaults</h2>
        <p className={`my-3 text-sm leading-relaxed ${mutedClass}`}>
          Set the workspace policy default. This setting does not schedule
          automatic deletion or purge existing content.
        </p>
        {retention !== null ? (
          <form onSubmit={save} className="flex flex-wrap items-end gap-3">
            <Field label="Default retention, days">
              <input
                type="number"
                required
                min={30}
                max={3650}
                value={retention}
                disabled={busy}
                onChange={(event) => setRetention(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              Save retention default
            </Button>
          </form>
        ) : (
          <p role="status" className={mutedClass}>
            Loading policy defaults…
          </p>
        )}
      </section>
      <section className={`${panelClass} p-6`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={`${headingClass} text-lg`}>
              Workspace audit exports
            </h2>
            <p className={`mt-2 text-sm ${mutedClass}`}>
              A snapshot of the latest 500 workspace audit events. Downloads
              require current administrator access and expire after seven days.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(path + "/audit-exports", record, {
                  method: "POST",
                  csrf,
                  body: { format: "ndjson" },
                });
                setVersion((value) => value + 1);
                setNotice("Audit snapshot created and ready to download.");
              })
            }
          >
            Create audit export
          </Button>
        </div>
        {exports.length ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {exports.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="text-sm">
                  <span>{item.recordCount} events</span>
                  <span className={`ml-3 text-xs ${mutedClass}`}>
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span className="ml-3">
                    <Badge>{item.exportFormat}</Badge>
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => download(item.id)}
                >
                  Download snapshot
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`py-6 text-sm ${mutedClass}`}>
            No audit snapshots have been created.
          </p>
        )}
      </section>
      <section className={`${panelClass} p-6`}>
        <h3 className={`${headingClass} text-base`}>
          Enterprise identity and advanced governance
        </h3>
        <p className={`mt-3 text-sm leading-relaxed ${mutedClass}`}>
          SSO/SCIM, configuration versioning, policy simulation, drift
          detection, dependency mapping, and resource forecasts require separate
          backend capabilities. They are not activated by these settings.
          Existing sign-in and source permissions remain authoritative.
        </p>
      </section>
      {error && (
        <Button
          onClick={() => {
            setError("");
            setVersion((value) => value + 1);
          }}
        >
          Retry settings
        </Button>
      )}
    </div>
  );
}
