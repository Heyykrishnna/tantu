"use client";

import { Select } from "@/components/ui/select";
import { LoadingState } from "../components/ui/loading-state";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "../components/ui/modal";
import {
  promises as parsePromises,
  promisePeople,
  promiseResponse,
} from "../lib/promises";
import type { PromiseItem } from "../lib/promises";
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

interface MemberOption {
  id: string;
  name: string;
}

export default function PromisePanel({
  workspaceId,
  csrf,
  currentUserId,
}: {
  workspaceId: string;
  csrf: string;
  currentUserId: string;
}) {
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [stateFilter, setStateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newResponsibleId, setNewResponsibleId] = useState("");
  const [newAgreedDate, setNewAgreedDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [outcomeModal, setOutcomeModal] = useState<PromiseItem | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<"fulfilled" | "broken">(
    "fulfilled",
  );
  const [outcomeNotes, setOutcomeNotes] = useState("");

  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (stateFilter !== "all") params.set("confirmationState", stateFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const queryStr = params.toString() ? `?${params.toString()}` : "";

    api(`/workspaces/${workspaceId}/promises${queryStr}`, parsePromises, {
      signal: controller.signal,
    })
      .then(setPromises)
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Failed to load promises.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, stateFilter, statusFilter, dataVersion]);

  useEffect(() => {
    const controller = new AbortController();
    api(`/workspaces/${workspaceId}/promises/people`, promisePeople, {
      signal: controller.signal,
    })
      .then((people) => {
        setMembers(people);
        setNewResponsibleId((current) =>
          people.some((person) => person.id === current)
            ? current
            : (people.find((person) => person.id === currentUserId)?.id ??
              people[0]?.id ??
              ""),
        );
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Responsible people are unavailable.",
          );
      });
    return () => controller.abort();
  }, [workspaceId, currentUserId]);

  const handleCreatePromise = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newResponsibleId) return;
    try {
      setBusy(true);
      setError("");
      const res = await api(
        `/workspaces/${workspaceId}/promises`,
        promiseResponse,
        {
          method: "POST",
          csrf,
          body: {
            title: newTitle.trim(),
            responsibleId: newResponsibleId,
            agreedDate: newAgreedDate || null,
            confirmationState: "confirmed",
            notes: newNotes.trim(),
          },
        },
      );
      setPromises((prev) => [res.promise, ...prev]);
      setModalOpen(false);
      setNewTitle("");
      setNewAgreedDate("");
      setNewNotes("");
      setNotice("Promise commitment created.");
      setDataVersion((v) => v + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create promise.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (promise: PromiseItem) => {
    try {
      setBusy(true);
      setError("");
      const operationId = crypto.randomUUID();
      const res = await api(
        `/workspaces/${workspaceId}/promises/${promise.id}/confirm`,
        promiseResponse,
        {
          method: "POST",
          csrf,
          body: { operationId },
        },
      );
      setPromises((prev) =>
        prev.map((p) => (p.id === promise.id ? { ...p, ...res.promise } : p)),
      );
      setNotice("Commitment explicitly confirmed.");
      setDataVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleOutcomeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!outcomeModal) return;
    try {
      setBusy(true);
      setError("");
      const res = await api(
        `/workspaces/${workspaceId}/promises/${outcomeModal.id}`,
        promiseResponse,
        {
          method: "PATCH",
          csrf,
          body: {
            status: outcomeStatus,
            notes: outcomeNotes
              ? `${outcomeModal.notes}\nOutcome: ${outcomeNotes}`
              : outcomeModal.notes,
            expectedVersion: outcomeModal.version,
          },
        },
      );
      setPromises((prev) =>
        prev.map((p) =>
          p.id === outcomeModal.id ? { ...p, ...res.promise } : p,
        ),
      );
      setOutcomeModal(null);
      setNotice(`Promise marked ${outcomeStatus}.`);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update outcome.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={headingClass}>Promise Tracker</h2>
          <p className={`text-xs ${mutedClass}`}>
            Explicit commitments with agreed dates, responsible people, and
            reviewed outcomes. Inferred requests remain tentative until
            confirmed.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setError("");
            setModalOpen(true);
          }}
        >
          <Icon name="plus" className="size-4" />
          New Promise
        </Button>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="neutral">{notice}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#677287] dark:text-[#8a8a93]">
            Confirmation:
          </span>
          <Select
            className={inputClass}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="confirmed">Confirmed</option>
            <option value="inferred">Inferred (Tentative)</option>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#677287] dark:text-[#8a8a93]">Status:</span>
          <Select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="broken">Broken</option>
          </Select>
        </div>
      </div>

      <section>
        {loading ? (
          <LoadingState label="Loading commitments…" />
        ) : promises.length === 0 ? (
          <div
            className={`${panelClass} p-8 text-center text-sm ${mutedClass}`}
          >
            No promises found matching the current filters.
          </div>
        ) : (
          <div className="divide-y divide-[#e3e6ef] rounded-lg border border-[#e3e6ef] bg-white dark:divide-[#2d2d31] dark:border-[#2d2d31] dark:bg-[#1a1a1c]">
            {promises.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        p.confirmationState === "confirmed"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      }`}
                    >
                      {p.confirmationState}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        p.status === "fulfilled"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                          : p.status === "broken"
                            ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                            : "bg-[#eceef5] text-[#555e70] dark:bg-[#252528] dark:text-[#a4a4ad]"
                      }`}
                    >
                      {p.status}
                    </span>
                    <h4 className="text-xs font-medium text-[#1e2025] dark:text-[#e4e4e7]">
                      {p.title}
                    </h4>
                  </div>
                  <div
                    className={`flex flex-wrap items-center gap-3 text-[11px] ${mutedClass}`}
                  >
                    <span>
                      Responsible: {p.responsibleName ?? p.responsibleId}
                    </span>
                    {p.agreedDate && (
                      <span className="flex items-center gap-1">
                        <Icon name="clock" className="size-3" />
                        Agreed by: {p.agreedDate}
                      </span>
                    )}
                    {p.taskTitle && (
                      <span className="rounded bg-zinc-100 px-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Linked: {p.taskTitle}
                      </span>
                    )}
                  </div>
                  {p.notes && (
                    <p className="text-xs text-[#677287] dark:text-[#a4a4ad] whitespace-pre-line">
                      {p.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {p.confirmationState === "inferred" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleConfirm(p)}
                      disabled={busy}
                    >
                      <Icon name="check" className="size-3.5" />
                      Confirm Promise
                    </Button>
                  )}
                  {p.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOutcomeModal(p);
                        setOutcomeStatus("fulfilled");
                        setOutcomeNotes("");
                      }}
                      disabled={busy}
                    >
                      Mark Outcome
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Record Promise Commitment"
          description="Record a clear commitment and the person responsible for it."
          busy={busy}
        >
          <Notice tone="error" role="alert">
            {error}
          </Notice>
          <form onSubmit={handleCreatePromise} className="space-y-4">
            <Field label="What is the commitment?">
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Deliver design tokens for review"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                maxLength={200}
              />
            </Field>

            <Field label="Responsible Person">
              <Select
                className={inputClass}
                value={newResponsibleId}
                onChange={(e) => setNewResponsibleId(e.target.value)}
                required
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Agreed Date">
              <input
                type="date"
                className={inputClass}
                value={newAgreedDate}
                onChange={(e) => setNewAgreedDate(e.target.value)}
              />
            </Field>

            <Field label="Commitment Notes & Context">
              <textarea
                className={`${inputClass} min-h-20`}
                placeholder="Specific scope, agreed deliverables, or conversation reference..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e3e6ef] dark:border-[#2d2d31]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !newTitle.trim() || !newResponsibleId}
              >
                Create Promise
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {outcomeModal && (
        <Modal
          open={Boolean(outcomeModal)}
          onClose={() => setOutcomeModal(null)}
          title="Review Promise Outcome"
          description="Record the delivery outcome and any supporting context."
          busy={busy}
        >
          <Notice tone="error" role="alert">
            {error}
          </Notice>
          <form onSubmit={handleOutcomeSubmit} className="space-y-4">
            <p className="text-xs text-[#1e2025] dark:text-[#e4e4e7] font-medium">
              {outcomeModal.title}
            </p>

            <Field label="Outcome Result">
              <Select
                className={inputClass}
                value={outcomeStatus}
                onChange={(e) =>
                  setOutcomeStatus(
                    e.target.value === "broken" ? "broken" : "fulfilled",
                  )
                }
              >
                <option value="fulfilled">
                  Fulfilled (Delivered as agreed)
                </option>
                <option value="broken">Broken (Missed or not delivered)</option>
              </Select>
            </Field>

            <Field label="Outcome Notes">
              <textarea
                className={`${inputClass} min-h-20`}
                placeholder="Describe actual delivery outcome, reasons for delay, or link to result..."
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e3e6ef] dark:border-[#2d2d31]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOutcomeModal(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Confirm Outcome
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
