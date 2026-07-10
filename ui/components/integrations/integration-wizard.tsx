"use client";

import { useMemo, useState } from "react";
import type {
  IntegrationDefinition,
  IntegrationTestEvent,
} from "@/lib/integrations/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://tracekit-api.anthony-d15.workers.dev";

type WizardStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "sending"
  | "success"
  | "error";

export function IntegrationWizard({
  integration,
}: {
  integration: IntegrationDefinition;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<WizardStatus>("idle");
  const [message, setMessage] = useState("");

  const postbackUrl = useMemo(() => {
    if (!integration.postbackPath) return null;
    return `${API_BASE}${integration.postbackPath}`;
  }, [integration.postbackPath]);

  function updateCredential(key: string, value: string) {
    setCredentials((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function connect() {
    if (!integration.connectPath) return;

    const missingField = integration.credentialFields.find(
      (field) => field.required && !credentials[field.key]?.trim()
    );

    if (missingField) {
      setStatus("error");
      setMessage(`${missingField.label} is required.`);
      return;
    }

    try {
      setStatus("connecting");
      setMessage("");

      const res = await fetch(`${API_BASE}${integration.connectPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Connection failed.");
      }

      setStatus("connected");
      setMessage(`${integration.name} connected successfully.`);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Connection failed."
      );
    }
  }

  async function sendTestEvent(type: IntegrationTestEvent) {
    if (!postbackUrl) return;

    const amount =
      type === "sale"
        ? 100
        : type === "chargeback_fee"
          ? 15
          : type === "bank_fee"
            ? 3.5
            : 25;

    try {
      setStatus("sending");
      setMessage("");

      const timestamp = Date.now();

      const res = await fetch(postbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type,
          status: type,
          order_id: `TEST-${timestamp}`,
          transaction_id: `${type.toUpperCase()}-${timestamp}`,
          amount,
          currency: "USD",
          platform: integration.id,
          reason: `${integration.name} wizard test`,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Test event failed.");
      }

      setStatus("success");
      setMessage(
        `${type.replaceAll("_", " ")} inserted successfully. Ledger amount: ${json.ledger?.amount}`
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Test event failed."
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 dark:bg-ink/60">
        <h1 className="text-xl font-semibold">{integration.name}</h1>

        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {integration.description}
        </p>
      </section>

      {integration.credentialFields.length > 0 && (
        <section className="rounded-xl border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Connect</h2>

          {integration.documentation?.credentialInstructions && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
              {integration.documentation.credentialInstructions.map(
                (instruction) => (
                  <li key={instruction}>{instruction}</li>
                )
              )}
            </ol>
          )}

          <div className="mt-4 grid max-w-xl gap-3">
            {integration.credentialFields.map((field) => (
              <label key={field.key}>
                <div className="mb-1 text-sm font-medium">{field.label}</div>

                <input
                  type={field.type === "password" ? "password" : "text"}
                  value={credentials[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    updateCredential(field.key, event.target.value)
                  }
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                />

                {field.helpText && (
                  <div className="mt-1 text-xs text-gray-500">
                    {field.helpText}
                  </div>
                )}
              </label>
            ))}

            {integration.supportsTestConnection && (
              <button
                type="button"
                onClick={connect}
                disabled={status === "connecting"}
                className="w-fit rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              >
                {status === "connecting"
                  ? "Connecting..."
                  : `Connect ${integration.name}`}
              </button>
            )}
          </div>
        </section>
      )}

      {postbackUrl && (
        <section className="rounded-xl border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Webhook / Postback</h2>

          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Send JSON events to this endpoint.
          </p>

          <CopyField label="Postback URL" value={postbackUrl} />

          {integration.documentation?.installInstructions && (
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
              {integration.documentation.installInstructions.map(
                (instruction) => (
                  <li key={instruction}>{instruction}</li>
                )
              )}
            </ol>
          )}
        </section>
      )}

      {integration.supportsTestEvents && integration.testEvents && (
        <section className="rounded-xl border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Verify</h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {integration.testEvents.map((eventType) => (
              <button
                key={eventType}
                type="button"
                onClick={() => sendTestEvent(eventType)}
                disabled={status === "sending"}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              >
                Send test {eventType.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </section>
      )}

      {message && (
        <div
          className={[
            "rounded-lg border p-3 text-sm",
            status === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          ].join(" ")}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs text-gray-500">{label}</div>

      <div className="flex">
        <input
          readOnly
          value={value}
          className="w-full rounded-l-lg border bg-transparent px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-r-lg border border-l-0 px-3 py-2 text-sm"
        >
          Copy
        </button>
      </div>
    </div>
  );
}