"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import {
  connections,
  draft,
  providerItems,
  sendReview,
  sends,
} from "../lib/providers";
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

export default function MailPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [accounts, setAccounts] = useState<ReturnType<
    typeof connections
  > | null>(null);
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<"mail" | "calendar">("mail");
  const [entries, setEntries] = useState<ReturnType<
    typeof providerItems
  > | null>(null);
  const [drafts, setDrafts] = useState<ReturnType<typeof draft>[]>([]);
  const [intents, setIntents] = useState<ReturnType<typeof sends>>([]);
  const [review, setReview] = useState<ReturnType<typeof sendReview> | null>(
    null,
  );
  const [operationId, setOperationId] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/workspaces/${workspaceId}/providers`;
  const mail = `/workspaces/${workspaceId}/mail`;
  const account = accounts?.items.find((item) => item.id === accountId);
  const refresh = useCallback(async () => {
    const result = await api(base, connections);
    setAccounts(result);
    setIntents(await api(mail + "/sends", sends));
    if (accountId) {
      setEntries(
        await api(base + `/${accountId}/items?kind=${kind}`, providerItems),
      );
      setDrafts(await api(base + `/${accountId}/drafts`, items(draft)));
    }
  }, [base, mail, accountId, kind]);
  useEffect(() => {
    const controller = new AbortController();
    api(base, connections, { signal: controller.signal })
      .then(setAccounts)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Connections are unavailable.",
          );
      });
    return () => controller.abort();
  }, [base]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The request could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(id: string, type = kind) {
    setAccountId(id);
    setKind(type);
    setSelected("");
    setReview(null);
    setEntries(await api(base + `/${id}/items?kind=${type}`, providerItems));
    setDrafts(await api(base + `/${id}/drafts`, items(draft)));
    setIntents(await api(mail + "/sends", sends));
  }
  async function compose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      await api(base + `/${accountId}/drafts`, acknowledgment, {
        method: "POST",
        csrf,
        body: {
          operationId: crypto.randomUUID(),
          recipients: String(data.get("recipients"))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          subject: String(data.get("subject")),
          body: String(data.get("body")),
        },
      });
      form.reset();
      await refresh();
      setNotice(
        "Draft saved. Review its recipients and content before sending.",
      );
    });
  }
  async function confirm() {
    if (!review) return;
    await run(async () => {
      const id = await api(
        mail + "/sends",
        (value) => string(record(value).id),
        { method: "POST", csrf, body: { reviewId: review.id, operationId } },
      );
      const state = await api(
        mail + `/sends/${id}/execute`,
        (value) => string(record(value).state),
        { method: "POST", csrf },
      );
      setReview(null);
      await refresh();
      setNotice(
        state === "confirmed"
          ? "The provider accepted the message. This does not confirm recipient delivery."
          : state === "unknown"
            ? "The outcome is unknown. Reconcile this intent; do not send it again."
            : "The send failed before confirmation. Review the account and draft.",
      );
    });
  }
  return (
    <section className="grid gap-5">
      <header>
        <h1 className={`${headingClass} text-2xl`}>Connected accounts</h1>
        <p className={`mt-2 text-[12px] ${mutedClass}`}>
          Your private mail and calendar projections stay scoped to your
          account.
        </p>
      </header>
      <Notice role="alert" tone="error">
        {message}
      </Notice>
      <Notice tone="success">{notice}</Notice>
      <div className={`${panelClass} flex flex-wrap items-center gap-3 p-4`}>
        {(["google", "microsoft"] as const).map((provider) => (
          <Button
            key={provider}
            disabled={busy || !accounts?.configured[provider]}
            onClick={() =>
              void run(async () => {
                const url = await api(
                  base + `/${provider}/connect`,
                  (value) => string(record(value).url),
                  { method: "POST", csrf },
                );
                window.location.assign(url);
              })
            }
          >
            Connect {provider === "google" ? "Google" : "Microsoft"}
          </Button>
        ))}
        <Button disabled={busy} onClick={() => void run(refresh)}>
          Refresh
        </Button>
      </div>
      {accounts &&
        !accounts.configured.google &&
        !accounts.configured.microsoft && (
          <Notice>
            Provider registrations are not configured. An operator must add
            approved OAuth credentials and a token-encryption key. No sample
            mailbox data is shown.
          </Notice>
        )}
      {!accounts ? (
        <p role="status" className="text-[12px]">
          Loading accounts…
        </p>
      ) : !accounts.items.length ? (
        <p className={`${panelClass} p-8 text-[12px]`}>
          No connected accounts yet.
        </p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside
            className={`${panelClass} grid gap-2 p-3`}
            aria-label="Connected accounts"
          >
            {accounts.items.map((item) => (
              <button
                key={item.id}
                className="grid gap-2 rounded-lg p-3 text-left text-[12px] outline-none hover:bg-violet-400/10 focus-visible:ring-2 focus-visible:ring-violet-400"
                onClick={() => void run(() => select(item.id))}
              >
                <span className="truncate">{item.address}</span>
                <Badge>
                  {item.provider} · {item.status}
                </Badge>
              </button>
            ))}
          </aside>
          {account ? (
            <div className="grid min-w-0 gap-4">
              <div
                className={`${panelClass} flex flex-wrap items-center gap-2 p-4`}
              >
                <Button
                  aria-pressed={kind === "mail"}
                  variant={kind === "mail" ? "primary" : "secondary"}
                  onClick={() => void run(() => select(account.id, "mail"))}
                >
                  Mail
                </Button>
                <Button
                  aria-pressed={kind === "calendar"}
                  variant={kind === "calendar" ? "primary" : "secondary"}
                  onClick={() => void run(() => select(account.id, "calendar"))}
                >
                  Provider calendar
                </Button>
                <Button
                  disabled={busy || account.status !== "active"}
                  onClick={() =>
                    void run(async () => {
                      await api(base + `/${account.id}/sync`, acknowledgment, {
                        method: "POST",
                        csrf,
                        body: { operationId: crypto.randomUUID(), kind },
                      });
                      setNotice(
                        "Synchronization queued. Keep the backend worker running, then refresh for progress.",
                      );
                    })
                  }
                >
                  Sync {kind}
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnect this account and remove its local mail/calendar projections? App-owned tasks are preserved.",
                      )
                    )
                      void run(async () => {
                        await api(
                          base + `/${account.id}/disconnect`,
                          acknowledgment,
                          {
                            method: "POST",
                            csrf,
                            body: {
                              operationId: crypto.randomUUID(),
                              expectedVersion: account.version,
                            },
                          },
                        );
                        setAccountId("");
                        setEntries(null);
                        setReview(null);
                        await refresh();
                      });
                  }}
                >
                  Disconnect
                </Button>
              </div>
              <p className={`text-[11px] ${mutedClass}`}>
                Coverage: {entries?.coverage ?? "Not synchronized"}
              </p>
              <div
                className={`${panelClass} divide-y divide-[#e0e3ed] dark:divide-[#303032]`}
              >
                {!entries?.items.length ? (
                  <p className="p-6 text-[12px]">
                    No synchronized {kind === "mail" ? "messages" : "events"} in
                    this account’s current coverage.
                  </p>
                ) : (
                  entries.items.map((entry) => (
                    <article className="p-4" key={entry.id}>
                      <button
                        onClick={() =>
                          setSelected(selected === entry.id ? "" : entry.id)
                        }
                        aria-expanded={selected === entry.id}
                        className="grid w-full gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      >
                        <span className="text-[12px] font-medium">
                          {entry.subject || "No subject"}
                        </span>
                        {entry.from && (
                          <span
                            className={`truncate text-[11px] ${mutedClass}`}
                          >
                            {entry.from}
                          </span>
                        )}
                        {entry.labels.length > 0 && (
                          <span className={`text-[10px] ${mutedClass}`}>
                            {entry.labels.join(" · ")}
                          </span>
                        )}
                      </button>
                      {selected === entry.id && (
                        <div className="mt-4 grid gap-2">
                          <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">
                            {entry.body ||
                              (kind === "mail"
                                ? "This message has no plain-text body. Active HTML and remote images are not rendered."
                                : `${entry.start} → ${entry.end}`)}
                          </p>
                          {entry.allDay && (
                            <Badge>All-day · exclusive end date</Badge>
                          )}
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
              {entries?.nextCursor && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const next = await api(
                        base +
                          `/${account.id}/items?kind=${kind}&cursor=${encodeURIComponent(entries.nextCursor ?? "")}`,
                        providerItems,
                      );
                      setEntries({
                        ...next,
                        items: [...entries.items, ...next.items],
                      });
                    })
                  }
                >
                  More {kind === "mail" ? "messages" : "events"}
                </Button>
              )}
              {kind === "mail" && (
                <>
                  <details className={`${panelClass} p-5`}>
                    <summary className="cursor-pointer text-[12px] font-medium">
                      Compose a plain-text draft
                    </summary>
                    <form
                      onSubmit={(event) => void compose(event)}
                      className="mt-4 grid gap-4"
                    >
                      <Field label="Recipients (comma separated)">
                        <input
                          name="recipients"
                          required
                          maxLength={5000}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Subject">
                        <input
                          name="subject"
                          required
                          maxLength={200}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Message">
                        <textarea
                          name="body"
                          required
                          rows={7}
                          maxLength={100000}
                          className={inputClass}
                        />
                      </Field>
                      <Button
                        type="submit"
                        disabled={busy || account.status !== "active"}
                      >
                        Save draft
                      </Button>
                    </form>
                  </details>
                  <div className={`${panelClass} grid gap-3 p-5`}>
                    <h2 className="text-[13px] font-medium">
                      Saved drafts (first 50)
                    </h2>
                    {drafts.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0e3ed] py-3 text-[12px] dark:border-[#303032]"
                      >
                        <span>{item.subject}</span>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              setReview(
                                await api(
                                  mail + `/drafts/${item.id}/review`,
                                  sendReview,
                                  {
                                    method: "POST",
                                    csrf,
                                    body: { expectedVersion: item.version },
                                  },
                                ),
                              );
                              setOperationId(crypto.randomUUID());
                            })
                          }
                        >
                          Review send
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {review && (
                <section
                  aria-label="Mail send review"
                  className={`${panelClass} grid gap-4 p-5`}
                >
                  <h2 className={`${headingClass} text-lg`}>
                    Review this external action
                  </h2>
                  <dl className="grid gap-2 text-[12px]">
                    <dt className={mutedClass}>From</dt>
                    <dd>{review.from}</dd>
                    <dt className={mutedClass}>To</dt>
                    <dd>{review.recipients.join(", ")}</dd>
                    <dt className={mutedClass}>Subject</dt>
                    <dd>{review.subject}</dd>
                  </dl>
                  <p className="whitespace-pre-wrap break-words text-[12px]">
                    {review.body}
                  </p>
                  <p className={`text-[11px] ${mutedClass}`}>
                    No attachments. Confirmation sends this exact saved draft
                    through your provider. Review expires in ten minutes.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => void confirm()}
                    >
                      Confirm send
                    </Button>
                    <Button onClick={() => setReview(null)}>
                      Cancel review
                    </Button>
                  </div>
                </section>
              )}
              <section className={`${panelClass} grid gap-3 p-5`}>
                <h2 className="text-[13px] font-medium">
                  Send outcomes (latest 50)
                </h2>
                {intents.map((intent) => (
                  <div
                    key={intent.id}
                    className="flex flex-wrap items-center gap-3 text-[11px]"
                  >
                    <code className="break-all">{intent.id}</code>
                    <Badge
                      tone={
                        intent.state === "confirmed"
                          ? "green"
                          : intent.state === "unknown"
                            ? "amber"
                            : "neutral"
                      }
                    >
                      {intent.state}
                    </Badge>
                    {intent.state === "unknown" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const state = await api(
                              mail + `/sends/${intent.id}/reconcile`,
                              (value) => string(record(value).state),
                              { method: "POST", csrf },
                            );
                            await refresh();
                            setNotice(
                              state === "unknown"
                                ? "Still unknown. No send was retried; check the provider’s Sent folder before any new draft."
                                : "Provider evidence confirmed acceptance.",
                            );
                          })
                        }
                      >
                        Reconcile only
                      </Button>
                    )}
                    {intent.state === "pending" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              mail + `/sends/${intent.id}/execute`,
                              acknowledgment,
                              { method: "POST", csrf },
                            );
                            await refresh();
                          })
                        }
                      >
                        Execute reviewed send
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            </div>
          ) : (
            <p className={`${panelClass} p-8 text-[12px]`}>
              Select an account.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
