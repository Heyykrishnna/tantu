"use client";

import type { Workspace } from "../lib/api";
import {
  Badge,
  Button,
  headingClass,
  mutedClass,
  panelClass,
} from "../components/ui";

export interface SettingsUsage {
  storageBytesUsed: number;
  storageBytesLimit: number;
  recordCount: number;
  recordLimit: number;
  automationRunsToday: number;
  automationLimitDaily: number;
}

function UsageMeter({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number;
}) {
  const percent =
    limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className={mutedClass}>{label}</span>
        <span className="tabular-nums">
          {value.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <progress
        aria-label={label}
        max={Math.max(1, limit)}
        value={value}
        className="h-1.5 w-full overflow-hidden rounded-full accent-zinc-600 dark:accent-zinc-300"
      />
      <p className={`mt-1 text-[10px] ${mutedClass}`}>
        {percent}% of the configured limit
      </p>
    </div>
  );
}

export function PermissionsSummary({ role }: { role: Workspace["role"] }) {
  const manager = role === "owner" || role === "admin";
  return (
    <section className={`${panelClass} p-6`}>
      <div className="mb-5 flex items-center gap-3">
        <h2 className={`${headingClass} text-lg`}>
          Your workspace permissions
        </h2>
        <Badge>{role}</Badge>
      </div>
      <p className={`mb-5 text-sm leading-relaxed ${mutedClass}`}>
        Workspace administration and private content access are separate. Owning
        a workspace does not automatically reveal another person’s private
        records.
      </p>
      <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        {[
          ["Manage your appearance and sessions", "Allowed"],
          [
            "Create and edit workspace work",
            role === "guest"
              ? "Only explicitly shared editable records"
              : "Within your record permissions",
          ],
          [
            "Manage members and invitations",
            manager ? "Allowed" : "Administrator required",
          ],
          [
            "Change workspace ownership",
            role === "owner" ? "Owner controls apply" : "Owner required",
          ],
          [
            "Manage developer credentials and policies",
            manager ? "Allowed" : "Administrator required",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex flex-wrap justify-between gap-2 py-3"
          >
            <dt className={mutedClass}>{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={`mt-5 text-xs ${mutedClass}`}>
        The server rechecks current membership and record permissions for every
        protected action.
      </p>
    </section>
  );
}

export default function SettingsOverview({
  workspace,
  quota,
  onSelect,
}: {
  workspace: Workspace;
  quota: SettingsUsage | null;
  onSelect: (section: string) => void;
}) {
  return (
    <div className="grid gap-6">
      <section className={`${panelClass} p-6 sm:p-7`}>
        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
          Workspace overview
        </p>
        <h2 className={`${headingClass} text-2xl`}>A little less friction.</h2>
        <p className={`mt-3 max-w-xl text-sm leading-relaxed ${mutedClass}`}>
          Keep the essentials in one place: your workspace, the people in it,
          and the way you prefer to work.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => onSelect("preferences")}>
            Personalize appearance
          </Button>
          <Button onClick={() => onSelect("members")}>People & Roles</Button>
          <Button onClick={() => onSelect("connections")}>
            Connected Apps
          </Button>
        </div>
      </section>
      <section className={`${panelClass} p-6`}>
        <h3 className={`${headingClass} mb-5 text-base`}>Current usage</h3>
        {quota ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <UsageMeter
              label="Records"
              value={quota.recordCount}
              limit={quota.recordLimit}
            />
            <UsageMeter
              label="Automation runs today"
              value={quota.automationRunsToday}
              limit={quota.automationLimitDaily}
            />
          </div>
        ) : (
          <p role="status" className={`text-sm ${mutedClass}`}>
            Usage is loading. If it remains unavailable, retry from Data &
            Usage.
          </p>
        )}
      </section>
      <PermissionsSummary role={workspace.role} />
    </div>
  );
}
