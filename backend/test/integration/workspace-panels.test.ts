import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./support.js";

test(
  "workspace panels load without optional query parameters",
  { timeout: 60_000 },
  async (context) => {
    const environment = await fixture();
    try {
      const owner = await environment.account("workspace-panels@example.test");
      for (const path of [
        "decisions",
        "context-graph",
        "meetings/briefs",
        "ai/settings",
      ]) {
        await context.test(path, async () => {
          const response = await environment.app.inject({
            url: `/api/v1/workspaces/${owner.workspaceId}/${path}`,
            headers: owner.headers,
          });
          assert.equal(response.statusCode, 200, response.body);
        });
      }
      await context.test(
        "meeting preparation persists and can be read back",
        async () => {
          const response = await environment.app.inject({
            method: "POST",
            url: `/api/v1/workspaces/${owner.workspaceId}/meetings/panel-reproduction/brief`,
            headers: owner.headers,
            payload: {
              title: "Release review",
              meetingDate: "2026-11-02",
              attendees: [],
            },
          });
          assert.equal(response.statusCode, 200, response.body);
          const read = await environment.app.inject({
            url: `/api/v1/workspaces/${owner.workspaceId}/meetings/panel-reproduction/brief`,
            headers: owner.headers,
          });
          assert.equal(read.statusCode, 200, read.body);
        },
      );
      await context.test(
        "decision creation is authorized and persistent",
        async () => {
          const response = await environment.app.inject({
            method: "POST",
            url: `/api/v1/workspaces/${owner.workspaceId}/decisions`,
            headers: owner.headers,
            payload: {
              title: "Release policy",
              rationale: "Keep an explicit review trail.",
            },
          });
          assert.equal(response.statusCode, 200, response.body);
        },
      );
      await context.test(
        "appearance and workspace identity persist",
        async () => {
          const preferences = await environment.app.inject({
            method: "PATCH",
            url: `/api/v1/workspaces/${owner.workspaceId}/preferences`,
            headers: owner.headers,
            payload: {
              theme: "light",
              accent: "sage",
              reduceMotion: true,
              density: "compact",
            },
          });
          assert.equal(preferences.statusCode, 200, preferences.body);
          assert.equal(
            preferences.json<{ preferences: { accent: string } }>().preferences
              .accent,
            "sage",
          );
          const profile = await environment.app.inject({
            method: "PATCH",
            url: `/api/v1/workspaces/${owner.workspaceId}`,
            headers: owner.headers,
            payload: { icon: "📚" },
          });
          assert.equal(profile.statusCode, 200, profile.body);
          assert.equal(profile.json<{ icon: string }>().icon, "📚");
        },
      );
      await context.test(
        "administrative policy and audit exports work with canonical audit columns",
        async () => {
          const policy = await environment.app.inject({
            method: "PUT",
            url: `/api/v1/workspaces/${owner.workspaceId}/enterprise-policy`,
            headers: owner.headers,
            payload: { retentionDays: 90 },
          });
          assert.equal(policy.statusCode, 200, policy.body);
          const audit = await environment.app.inject({
            method: "POST",
            url: `/api/v1/workspaces/${owner.workspaceId}/audit-exports`,
            headers: owner.headers,
            payload: { format: "ndjson" },
          });
          assert.equal(audit.statusCode, 200, audit.body);
        },
      );
    } finally {
      await environment.close();
    }
  },
);
