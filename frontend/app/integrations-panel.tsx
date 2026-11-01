"use client";

import { CandyButton } from "@/components/ui/candy-button";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import {
  Button,
  Field,
  Notice,
  headingClass,
  inputClass,
  mutedClass,
  panelClass,
} from "../components/ui";
import { Orb } from "@/components/ui/orb";

export interface DeveloperApiKeyItem {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "active" | "revoked" | "expired";
}

export interface WebhookItem {
  id: string;
  workspaceId: string;
  targetUrl: string;
  subscribedEvents: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryItem {
  id: string;
  webhookId: string;
  workspaceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  errorMessage: string | null;
  attemptCount: number;
  deliveredAt: string;
}

export interface ProviderCapabilityItem {
  id: string;
  name: string;
  category: "mail" | "calendar" | "sync";
  status: "supported" | "evaluated" | "unsupported";
  capabilities: string[];
  documentation: string;
}

const AVAILABLE_SCOPES = [
  "tasks:read",
  "tasks:write",
  "calendar:read",
  "calendar:write",
  "notes:read",
  "notes:write",
  "webhooks:manage",
];

const AVAILABLE_EVENTS = [
  "task.created",
  "task.updated",
  "calendar.event_created",
  "calendar.event_updated",
  "note.created",
  "note.updated",
  "ping",
];

export default function IntegrationsPanel({
  workspaceId,
  csrf,
}: {
  workspaceId: string;
  csrf: string;
}) {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "providers">(
    "keys",
  );
  const [apiKeys, setApiKeys] = useState<DeveloperApiKeyItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [providers, setProviders] = useState<ProviderCapabilityItem[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "tasks:read",
    "calendar:read",
  ]);
  const [expiresInDays, setExpiresInDays] = useState(30);

  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "task.created",
    "ping",
  ]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ apiKeys: DeveloperApiKeyItem[] }>(
        `/workspaces/${workspaceId}/api-keys`,
        (v) => v as { apiKeys: DeveloperApiKeyItem[] },
        { signal: controller.signal },
      ),
      api<{ webhooks: WebhookItem[] }>(
        `/workspaces/${workspaceId}/webhooks`,
        (v) => v as { webhooks: WebhookItem[] },
        { signal: controller.signal },
      ),
      api<{ providers: ProviderCapabilityItem[] }>(
        `/workspaces/${workspaceId}/integrations/providers`,
        (v) => v as { providers: ProviderCapabilityItem[] },
        { signal: controller.signal },
      ),
    ])
      .then(([keysRes, webhooksRes, providersRes]) => {
        setApiKeys(keysRes.apiKeys ?? []);
        setWebhooks(webhooksRes.webhooks ?? []);
        setProviders(providersRes.providers ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Failed to load integrations.",
          );
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  function loadDeliveries(webhookId: string) {
    setSelectedWebhookId(webhookId);
    setBusy(true);
    setError("");
    api<{ deliveries: WebhookDeliveryItem[] }>(
      `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`,
      (v) => v as { deliveries: WebhookDeliveryItem[] },
    )
      .then((res) => {
        setDeliveries(res.deliveries ?? []);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load deliveries.",
        );
        setBusy(false);
      });
  }

  function handleCreateApiKey(e: FormEvent) {
    e.preventDefault();
    if (!keyName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setNewKeySecret(null);

    api<{ apiKey: DeveloperApiKeyItem; secretKey: string }>(
      `/workspaces/${workspaceId}/api-keys`,
      (v) => v as { apiKey: DeveloperApiKeyItem; secretKey: string },
      {
        method: "POST",
        csrf,
        body: {
          name: keyName.trim(),
          scopes: selectedScopes,
          expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
        },
      },
    )
      .then((res) => {
        setApiKeys([res.apiKey, ...apiKeys]);
        setNewKeySecret(res.secretKey);
        setKeyName("");
        setNotice(
          "API key generated successfully. Copy the secret now; it will not be shown again.",
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to generate API key.",
        );
        setBusy(false);
      });
  }

  function handleRevokeApiKey(keyId: string) {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError("");
    api(`/workspaces/${workspaceId}/api-keys/${keyId}`, (v) => v, {
      method: "DELETE",
      csrf,
    })
      .then(() => {
        setApiKeys(
          apiKeys.map((k) =>
            k.id === keyId ? { ...k, status: "revoked" as const } : k,
          ),
        );
        setNotice("API key revoked successfully.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to revoke API key.",
        );
        setBusy(false);
      });
  }

  function handleCreateWebhook(e: FormEvent) {
    e.preventDefault();
    if (!targetUrl.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setNewWebhookSecret(null);

    api<{ webhook: WebhookItem; secret: string }>(
      `/workspaces/${workspaceId}/webhooks`,
      (v) => v as { webhook: WebhookItem; secret: string },
      {
        method: "POST",
        csrf,
        body: {
          targetUrl: targetUrl.trim(),
          subscribedEvents: selectedEvents,
        },
      },
    )
      .then((res) => {
        setWebhooks([res.webhook, ...webhooks]);
        setNewWebhookSecret(res.secret);
        setTargetUrl("");
        setNotice(
          "Webhook subscription created. Store your signing secret safely.",
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to register webhook.",
        );
        setBusy(false);
      });
  }

  function handleToggleWebhook(webhook: WebhookItem) {
    setBusy(true);
    setError("");
    api<{ webhook: WebhookItem }>(
      `/workspaces/${workspaceId}/webhooks/${webhook.id}`,
      (v) => v as { webhook: WebhookItem },
      {
        method: "PATCH",
        csrf,
        body: { isActive: !webhook.isActive },
      },
    )
      .then((res) => {
        setWebhooks(
          webhooks.map((w) => (w.id === webhook.id ? res.webhook : w)),
        );
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to toggle webhook.",
        );
        setBusy(false);
      });
  }

  function handleTestWebhook(webhookId: string) {
    setBusy(true);
    setError("");
    api<{ delivery: WebhookDeliveryItem; simulated: boolean }>(
      `/workspaces/${workspaceId}/webhooks/${webhookId}/test`,
      (v) => v as { delivery: WebhookDeliveryItem; simulated: boolean },
      {
        method: "POST",
        csrf,
        body: { eventType: "ping" },
      },
    )
      .then((res) => {
        setNotice(
          `Simulated test ping dispatched. Delivery logged with status ${res.delivery.responseStatus}.`,
        );
        if (selectedWebhookId === webhookId) {
          setDeliveries([res.delivery, ...deliveries]);
        }
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to test webhook.",
        );
        setBusy(false);
      });
  }

  function handleRotateSecret(webhookId: string) {
    if (
      !confirm(
        "Rotating the signing secret will invalidate previous signatures immediately.",
      )
    )
      return;
    setBusy(true);
    setError("");
    api<{ secret: string }>(
      `/workspaces/${workspaceId}/webhooks/${webhookId}/rotate-secret`,
      (v) => v as { secret: string },
      {
        method: "POST",
        csrf,
      },
    )
      .then((res) => {
        setNewWebhookSecret(res.secret);
        setNotice("Signing secret rotated successfully.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to rotate secret.",
        );
        setBusy(false);
      });
  }

  function handleDeleteWebhook(webhookId: string) {
    if (!confirm("Delete this webhook subscription?")) return;
    setBusy(true);
    setError("");
    api(`/workspaces/${workspaceId}/webhooks/${webhookId}`, (v) => v, {
      method: "DELETE",
      csrf,
    })
      .then(() => {
        setWebhooks(webhooks.filter((w) => w.id !== webhookId));
        if (selectedWebhookId === webhookId) {
          setSelectedWebhookId(null);
          setDeliveries([]);
        }
        setNotice("Webhook deleted.");
        setBusy(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to delete webhook.",
        );
        setBusy(false);
      });
  }

  function toggleScope(scope: string) {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  }

  function toggleEvent(evt: string) {
    if (selectedEvents.includes(evt)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== evt));
    } else {
      setSelectedEvents([...selectedEvents, evt]);
    }
  }

  if (loading) {
    return (
      <div className={`${panelClass} flex flex-col items-center justify-center gap-3 p-12 text-center`}>
        <Orb state="solving" interactive={false} theme="auto" size={64} display={44} />
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Loading integration settings...</p>
      </div>
    );
  }

  return (
    <div className={`${panelClass} p-5 sm:p-6 space-y-6`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h2 className={headingClass}>
            Integration Ecosystem & Developer APIs
          </h2>
          <p className={mutedClass}>
            Manage scoped developer API credentials, signed webhooks, and
            provider capabilities.
          </p>
        </div>
        <div className="flex gap-2">
          <CandyButton variant="ghost" size="unstyled"
            type="button"
            onClick={() => setActiveTab("keys")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "keys"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            API Keys
          </CandyButton>
          <CandyButton variant="ghost" size="unstyled"
            type="button"
            onClick={() => setActiveTab("webhooks")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "webhooks"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Webhooks
          </CandyButton>
          <CandyButton variant="ghost" size="unstyled"
            type="button"
            onClick={() => setActiveTab("providers")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "providers"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Providers Matrix
          </CandyButton>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {activeTab === "keys" && (
        <div className="space-y-6 pt-4">
          {newKeySecret && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg">
              <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                New Developer API Secret Key
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Save this key securely. You will not be able to view it again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newKeySecret}
                  className="w-full bg-white dark:bg-stone-900 font-mono text-sm px-3 py-1.5 rounded border border-emerald-300 dark:border-emerald-700"
                />
                <Button
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(newKeySecret)}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleCreateApiKey}
            className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Generate Developer Access Token
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Key Name">
                <input
                  type="text"
                  placeholder="e.g. CI Pipeline, Automation Bot"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Expiration (days)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(parseInt(e.target.value, 10) || 30)
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase text-stone-500">
                Allowed Token Scopes
              </span>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                    />
                    <span className="font-mono text-xs">{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={busy || !keyName.trim()}>
              Create Scoped API Key
            </Button>
          </form>

          <div className="space-y-3">
            <h3 className="text-base font-semibold">
              Active & Historical API Keys
            </h3>
            {apiKeys.length === 0 ? (
              <p className={mutedClass}>
                No API keys issued for this workspace yet.
              </p>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900 dark:text-stone-100">
                          {key.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            key.status === "active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : key.status === "expired"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {key.status}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-stone-500 mt-1">
                        Prefix: {key.keyPrefix} • Created:{" "}
                        {new Date(key.createdAt).toLocaleDateString()}
                        {key.expiresAt &&
                          ` • Expires: ${new Date(key.expiresAt).toLocaleDateString()}`}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {key.scopes.map((s) => (
                          <span
                            key={s}
                            className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded font-mono"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    {key.status === "active" && (
                      <Button
                        variant="secondary"
                        onClick={() => handleRevokeApiKey(key.id)}
                        disabled={busy}
                        className="text-red-600 dark:text-red-400 self-start sm:self-center"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="space-y-6 pt-4">
          {newWebhookSecret && (
            <div className="p-4 bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Webhook HMAC-SHA256 Signing Secret
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Use this secret to verify X-Tantu-Signature headers on incoming
                dispatches.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newWebhookSecret}
                  className="w-full bg-white dark:bg-[#141416] font-mono text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700"
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigator.clipboard.writeText(newWebhookSecret)
                  }
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleCreateWebhook}
            className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <h3 className="text-base font-semibold">
              Register New Webhook Endpoint
            </h3>
            <Field label="Target Destination URL">
              <input
                type="url"
                placeholder="https://api.yourdomain.com/webhooks/tantu"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className={inputClass}
                required
              />
            </Field>

            <div>
              <span className="text-xs font-semibold uppercase text-stone-500">
                Subscribed Workspace Events
              </span>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AVAILABLE_EVENTS.map((evt) => (
                  <label
                    key={evt}
                    className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(evt)}
                      onChange={() => toggleEvent(evt)}
                      className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                    />
                    <span className="font-mono text-xs">{evt}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={busy || !targetUrl.trim()}>
              Subscribe Webhook
            </Button>
          </form>

          <div className="space-y-4">
            <h3 className="text-base font-semibold">
              Registered Webhook Endpoints
            </h3>
            {webhooks.length === 0 ? (
              <p className={mutedClass}>No webhook subscriptions configured.</p>
            ) : (
              <div className="space-y-3">
                {webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg bg-white dark:bg-stone-900 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="font-mono text-sm break-all font-medium text-stone-900 dark:text-stone-100">
                        {wh.targetUrl}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            wh.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
                          }`}
                        >
                          {wh.isActive ? "active" : "paused"}
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => handleToggleWebhook(wh)}
                          disabled={busy}
                          className="text-xs"
                        >
                          {wh.isActive ? "Pause" : "Enable"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleTestWebhook(wh.id)}
                          disabled={busy}
                          className="text-xs"
                        >
                          Test Ping
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleRotateSecret(wh.id)}
                          disabled={busy}
                          className="text-xs"
                        >
                          Rotate Secret
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleDeleteWebhook(wh.id)}
                          disabled={busy}
                          className="text-xs text-red-600 dark:text-red-400"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-stone-500">Events:</span>
                      {wh.subscribedEvents.map((evt) => (
                        <span
                          key={evt}
                          className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded font-mono"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex justify-between items-center text-xs">
                      <span className="text-stone-400">
                        Created: {new Date(wh.createdAt).toLocaleDateString()}
                      </span>
                      <CandyButton variant="ghost" size="unstyled"
                        type="button"
                        onClick={() => loadDeliveries(wh.id)}
                        className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 underline font-medium"
                      >
                        {selectedWebhookId === wh.id
                          ? "Refresh Delivery Ledger"
                          : "View Delivery Ledger"}
                      </CandyButton>
                    </div>

                    {selectedWebhookId === wh.id && (
                      <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800 space-y-2">
                        <div className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                          Recent Delivery Ledger ({deliveries.length} entries)
                        </div>
                        {deliveries.length === 0 ? (
                          <p className="text-xs text-stone-400">
                            No deliveries recorded yet. Try sending a test ping.
                          </p>
                        ) : (
                          <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-100 dark:border-stone-800 rounded font-mono text-xs max-h-48 overflow-y-auto">
                            {deliveries.map((del) => (
                              <div
                                key={del.id}
                                className="p-2 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded ${
                                      del.responseStatus &&
                                      del.responseStatus < 300
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                    }`}
                                  >
                                    {del.responseStatus || "ERR"}
                                  </span>
                                  <span className="font-semibold">
                                    {del.eventType}
                                  </span>
                                </div>
                                <div className="text-stone-400">
                                  {new Date(
                                    del.deliveredAt,
                                  ).toLocaleTimeString()}{" "}
                                  (Attempt #{del.attemptCount})
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "providers" && (
        <div className="space-y-4 pt-4">
          <div className="p-4 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-semibold">
              Evaluated Additional Providers Matrix
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Truthful provider support contract status. Evaluated providers do
              not claim unverified production parity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((p) => (
              <div
                key={p.id}
                className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-stone-900 dark:text-stone-100">
                    {p.name}
                  </h4>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-mono ${
                      p.status === "supported"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  {p.documentation}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {p.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 px-2 py-0.5 rounded font-mono"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
