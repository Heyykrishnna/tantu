"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { acknowledgment, api, items, record, string } from "../lib/api";
import type { Workspace } from "../lib/api";
import { Icon } from "../components/icon";
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

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}
function member(value: unknown): Member {
  const data = record(value);
  if (typeof data.active !== "boolean")
    throw new Error("Invalid membership response.");
  return {
    id: string(data.id),
    name: string(data.name),
    email: string(data.email),
    role: string(data.role),
    active: data.active,
  };
}

export default function WorkspaceSettings({
  workspace,
  csrf,
  onJoined,
}: {
  workspace: Workspace;
  csrf: string;
  onJoined: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const manager = workspace.role === "owner" || workspace.role === "admin";
  const path = `/workspaces/${workspace.id}`;
  const refresh = useCallback(async () => {
    if (!manager) return;
    try {
      setMembers(await api(path + "/members", items(member)));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Members are unavailable.",
      );
    }
  }, [manager, path]);
  useEffect(() => {
    if (!manager) return;
    const controller = new AbortController();
    api(path + "/members", items(member), { signal: controller.signal })
      .then(setMembers)
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setMessage(
            error instanceof Error ? error.message : "Members are unavailable.",
          );
      });
    return () => controller.abort();
  }, [manager, path]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setToken("");
    const data = new FormData(event.currentTarget);
    try {
      setToken(
        await api(
          path + "/invitations",
          (value) => string(record(value).token),
          {
            method: "POST",
            csrf,
            body: {
              email: String(data.get("email")),
              role: String(data.get("role")),
              permission: String(data.get("permission")),
              ...(data.get("recordId")
                ? { recordId: String(data.get("recordId")) }
                : {}),
            },
          },
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/invitations/accept", acknowledgment, {
        method: "POST",
        csrf,
        body: { token: String(new FormData(event.currentTarget).get("token")) },
      });
      onJoined();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Member) {
    if (
      !window.confirm(
        `Remove ${item.name} from this workspace? Access will stop immediately.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(path + "/members/" + item.id, acknowledgment, {
        method: "DELETE",
        csrf,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-6">
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className={`${headingClass} text-[25px]`}>Workspace settings</h1>
          <Badge tone="violet">{workspace.role}</Badge>
        </div>
        <p className={`text-[12px] ${mutedClass}`}>
          {workspace.name} · People, permissions, and the space you share.
        </p>
      </header>
      <Notice tone="error" role="alert">
        {message}
      </Notice>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {manager ? (
          <section className={panelClass}>
            <header className="flex items-center gap-2 border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
              <Icon name="users" className="size-4 text-[#9690d4]" />
              <h2 className="text-[12px] font-medium">Invite someone</h2>
              <Badge>72-hour invitation</Badge>
            </header>
            <div className="p-5 sm:p-6">
              <p className={`mb-5 text-[11px] leading-relaxed ${mutedClass}`}>
                Make room for a teammate. Guests only see the records you
                explicitly invite them to.
              </p>
              <form onSubmit={invite} className="grid gap-4">
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="teammate@example.com"
                    className={inputClass}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Role">
                    <select
                      name="role"
                      aria-label="Role"
                      defaultValue="member"
                      className={inputClass}
                    >
                      <option value="member">Member</option>
                      <option value="guest">Guest — record access only</option>
                      {workspace.role === "owner" && (
                        <option value="admin">Administrator</option>
                      )}
                    </select>
                  </Field>
                  <Field label="Record permission">
                    <select
                      name="permission"
                      aria-label="Record permission"
                      className={inputClass}
                    >
                      <option value="read">Read</option>
                      <option value="edit">Edit</option>
                    </select>
                  </Field>
                </div>
                <Field
                  label={
                    <span>
                      Record ID{" "}
                      <span
                        className={`ml-1 text-[10px] font-normal ${mutedClass}`}
                      >
                        required for guests
                      </span>
                    </span>
                  }
                >
                  <input
                    name="recordId"
                    placeholder="Copy the ID from record details"
                    pattern="[0-9a-f-]{36}"
                    className={inputClass}
                  />
                </Field>
                <div className="border-t border-[#e4e6ef] pt-4 dark:border-[#303034]">
                  <Button type="submit" variant="primary" disabled={busy}>
                    <Icon name="plus" className="size-3.5" />
                    Create invitation
                  </Button>
                </div>
              </form>
              {token && (
                <div className="mt-5 grid gap-3 rounded-xl border border-violet-300/20 bg-violet-400/8 p-4">
                  <Field label="Invitation token">
                    <textarea
                      readOnly
                      aria-label="Invitation token"
                      value={token}
                      rows={2}
                      className={`${inputClass} resize-none break-all font-mono text-[11px]`}
                    />
                  </Field>
                  <p className={`text-[10px] leading-relaxed ${mutedClass}`}>
                    Share privately with the intended person. Expires after 72
                    hours and works once. This app has not sent an email.
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className={`${panelClass} p-6`}>
            <Icon name="shield" className="mb-4 size-6 text-[#9992d7]" />
            <h2 className={`${headingClass} mb-2 text-[18px]`}>
              Your workspace access
            </h2>
            <p className={`text-[12px] leading-7 ${mutedClass}`}>
              Your role is {workspace.role}. Workspace owners and administrators
              manage invitations and membership. Your record permissions always
              apply.
            </p>
          </section>
        )}
        <aside className="grid gap-5">
          <section className={panelClass}>
            <header className="flex items-center gap-2 border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
              <Icon name="mail" className="size-4 text-[#9690d4]" />
              <h2 className="text-[12px] font-medium">Accept an invitation</h2>
            </header>
            <div className="p-5 sm:p-6">
              <p className={`mb-5 text-[11px] leading-relaxed ${mutedClass}`}>
                Have an invitation for this account? Paste the token below to
                join.
              </p>
              <form onSubmit={join} className="grid gap-4">
                <Field label="Invitation token">
                  <input
                    name="token"
                    required
                    maxLength={100}
                    autoComplete="off"
                    placeholder="Paste your invitation token"
                    className={inputClass}
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  Join workspace
                  <Icon name="arrow" className="size-3.5" />
                </Button>
              </form>
            </div>
          </section>
          <div className="rounded-xl border border-[#e2e1f0] bg-[#efeff8] p-5 dark:border-[#373344] dark:bg-[#252331]">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[#756b9e] dark:text-[#c3b8ea]">
              <Icon name="lock" className="size-4" />
              Sharing with intention
            </div>
            <p className={`text-[11px] leading-6 ${mutedClass}`}>
              Workspace membership never grants automatic access to private
              records. An invitation or an explicit sharing choice determines
              who can see your work.
            </p>
          </div>
        </aside>
      </div>
      {manager && (
        <section className={`${panelClass} overflow-hidden`}>
          <header className="flex items-center justify-between border-b border-[#e4e6ef] px-5 py-4 dark:border-[#303034]">
            <h2 className="flex items-center gap-2 text-[12px] font-medium">
              <Icon name="users" className="size-4 text-[#9991d6]" />
              People
            </h2>
            <span className={`text-[10px] ${mutedClass}`}>
              {members.length} memberships shown
            </span>
          </header>
          <ul className="divide-y divide-[#e6e9f1] dark:divide-[#2e2e32]">
            {members.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eeeaf8] text-[10px] text-[#9b8fc3] dark:bg-[#322c40] dark:text-[#c2b0e0]"
                >
                  {item.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[12px] font-medium">
                    {item.name}
                  </strong>
                  <span className={`block truncate text-[10px] ${mutedClass}`}>
                    {item.email}
                  </span>
                </div>
                <Badge tone={item.active ? "violet" : "neutral"}>
                  {item.role}
                </Badge>
                {!item.active && <Badge>Removed</Badge>}
                {item.active && item.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void remove(item)}
                  >
                    Remove member
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
