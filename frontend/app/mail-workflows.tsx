"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, list, record, string } from "../lib/api";
import { integer } from "../lib/projects";
import { draft, providerItems } from "../lib/providers";
import {
  Button,
  Field,
  Notice,
  inputClass,
  panelClass,
  mutedClass,
} from "../components/ui";
export default function MailWorkflows({
  workspaceId,
  connectionId,
  csrf,
  onSaved,
}: {
  workspaceId: string;
  connectionId: string;
  csrf: string;
  onSaved: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<ReturnType<typeof draft>[]>([]);
  const [messages, setMessages] = useState<
    ReturnType<typeof providerItems>["items"]
  >([]);
  const [files, setFiles] = useState<
    { id: string; name: string; bytes: number }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [personal, setPersonal] = useState<Record<string, unknown> | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}/providers/${connectionId}`;
  const current = drafts.find((item) => item.id === selected);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(base + "/drafts", items(draft), { signal: controller.signal }),
      api(base + "/items?kind=mail&includeSnoozed=true", providerItems, {
        signal: controller.signal,
      }),
      api(
        base + "/attachment-options",
        items((value) => {
          const row = record(value);
          return {
            id: string(row.id),
            name: string(row.name),
            bytes: integer(row.bytes),
          };
        }),
        { signal: controller.signal },
      ),
      api(base + "/mail-preferences", record, { signal: controller.signal }),
    ])
      .then(([drafts, messages, files, personal]) => {
        setDrafts(drafts);
        setMessages(messages.items);
        setFiles(files);
        setPersonal(personal);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Mail workflows unavailable.",
          );
      });
    return () => controller.abort();
  }, [base]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm the mail change.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api(
        base + "/drafts" + (current ? "/" + current.id : ""),
        acknowledgment,
        {
          method: current ? "PATCH" : "POST",
          csrf,
          body: {
            operationId: crypto.randomUUID(),
            recipients: String(form.get("recipients"))
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            subject: String(form.get("subject")),
            body: String(form.get("body")),
            mode: String(form.get("mode")),
            sourceId: form.get("sourceId") || null,
            attachmentIds: form.getAll("attachmentId"),
            ...(current ? { expectedVersion: current.version } : {}),
          },
        },
      );
      setDrafts(await api(base + "/drafts", items(draft)));
      await onSaved();
      setSelected("");
      setMessage(
        "Draft saved. Review its exact recipients, content and attachments before sending.",
      );
    });
  }
  async function snooze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("messageId"));
    await run(async () => {
      const existing = personal
        ? list(personal.items, record).find((row) => row.messageId === id)
        : undefined;
      await api(base + "/snooze", acknowledgment, {
        method: "POST",
        csrf,
        body: {
          messageId: id,
          snoozedUntil: form.get("until")
            ? new Date(String(form.get("until"))).toISOString()
            : null,
          expectedVersion: existing ? integer(existing.version) : 0,
          operationId: crypto.randomUUID(),
        },
      });
      setPersonal(await api(base + "/mail-preferences", record));
      await onSaved();
      setMessage("Personal snooze saved; the provider mailbox is unchanged.");
    });
  }
  async function rule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    await run(async () => {
      await api(base + "/rules", acknowledgment, {
        method: "POST",
        csrf,
        body: {
          name: String(fields.get("name")),
          field: String(fields.get("field")),
          contains: String(fields.get("contains")),
          tag: String(fields.get("tag")),
          enabled: true,
          expectedVersion: 0,
          operationId: crypto.randomUUID(),
        },
      });
      setPersonal(await api(base + "/mail-preferences", record));
      form.reset();
      setMessage(
        "Personal tagging rule saved. It runs for synchronized messages and never sends mail.",
      );
    });
  }
  return (
    <details className={`${panelClass} p-5`}>
      <summary className="cursor-pointer text-[12px] font-medium">
        Reply, forward, edit drafts and manage personal mail
      </summary>
      <div className="mt-4 grid gap-4">
        <Notice role="alert" tone="error">
          {message}
        </Notice>
        <Field label="Draft to edit">
          <select
            aria-label="Draft to edit"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={busy}
            className={inputClass}
          >
            <option value="">Create a new draft</option>
            {drafts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.subject || "No subject"} · v{item.version}
              </option>
            ))}
          </select>
        </Field>
        <form
          key={current ? current.id + current.version : "new"}
          onSubmit={(event) => void save(event)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Message mode">
            <select
              aria-label="Message mode"
              name="mode"
              defaultValue={current?.mode ?? "new"}
              className={inputClass}
            >
              {["new", "reply", "replyAll", "forward"].map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </Field>
          <Field label="Source message">
            <select
              aria-label="Source message"
              name="sourceId"
              defaultValue={current?.sourceId ?? ""}
              className={inputClass}
            >
              <option value="">No source</option>
              {messages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject || "No subject"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Draft recipients">
            <input
              name="recipients"
              defaultValue={current?.recipients.join(", ") ?? ""}
              maxLength={5000}
              placeholder="Leave empty to derive reply recipients"
              className={inputClass}
            />
          </Field>
          <Field label="Draft subject">
            <input
              name="subject"
              defaultValue={current?.subject ?? ""}
              maxLength={200}
              placeholder="Leave empty to derive reply/forward subject"
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Draft plain text">
              <textarea
                name="body"
                rows={6}
                maxLength={100000}
                defaultValue={current?.body ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-2 text-[11px]">
              Existing scanned attachments (first 50)
            </legend>
            {files.map((file) => (
              <label
                key={file.id}
                className="flex items-center gap-2 text-[11px]"
              >
                <input
                  name="attachmentId"
                  type="checkbox"
                  value={file.id}
                  defaultChecked={current?.attachmentIds.includes(file.id)}
                />
                {file.name} · {file.bytes} bytes
              </label>
            ))}
            <p className={`text-[10px] ${mutedClass}`}>
              Upload files through their source task/page first. Only clean,
              currently authorized files are eligible. Original forwarded
              attachments are not silently included.
            </p>
          </fieldset>
          <Button type="submit" disabled={busy}>
            Save reviewed draft content
          </Button>
        </form>
        <form
          onSubmit={(event) => void snooze(event)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Message to snooze">
            <select
              aria-label="Message to snooze"
              name="messageId"
              required
              className={inputClass}
            >
              {messages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Snooze until (blank to clear)">
            <input name="until" type="datetime-local" className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy || !messages.length}>
            Save personal snooze
          </Button>
        </form>
        <form
          onSubmit={(event) => void rule(event)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Personal rule name">
            <input
              name="name"
              maxLength={100}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Rule field">
            <select aria-label="Rule field" name="field" className={inputClass}>
              <option>from</option>
              <option>subject</option>
            </select>
          </Field>
          <Field label="Contains text">
            <input
              name="contains"
              maxLength={200}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Personal tag">
            <input name="tag" maxLength={100} required className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy}>
            Create personal tagging rule
          </Button>
        </form>
        {personal &&
          list(personal.rules, record).map((item) => (
            <div
              key={string(item.id)}
              className="flex flex-wrap items-center gap-3 text-[11px]"
            >
              <span>
                {string(item.name)} ·{" "}
                {item.enabled === true ? "Enabled" : "Disabled"}
              </span>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(base + "/rules", acknowledgment, {
                      method: "POST",
                      csrf,
                      body: {
                        ...item,
                        enabled: item.enabled !== true,
                        expectedVersion: integer(item.version),
                        operationId: crypto.randomUUID(),
                        version: undefined,
                      },
                    });
                    setPersonal(await api(base + "/mail-preferences", record));
                  })
                }
              >
                {item.enabled === true ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
      </div>
    </details>
  );
}
