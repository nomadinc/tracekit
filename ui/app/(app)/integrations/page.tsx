"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { apiPostJson } from "@/lib/api";

const PLATFORMS = [
  "Shopify",
  "WooCommerce",
  "Checkout Champ",
  "Konnektive",
  "Sticky.io",
  "29Next",
  "Everflow",
  "Impact",
  "CAKE",
  "TUNE",
  "Voluum",
  "RedTrack",
  "Klaviyo",
  "HubSpot",
  "GHL",
  "ActiveProspect",
  "Ringba",
  "Twilio",
  "Vapi",
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8787";

export default function Integrations() {
  const [sel, setSel] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");

  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleConnect() {
    if (!sel || !apiKey) {
      setStatus("error");
      setStatusMsg("Platform and API key are required.");
      return;
    }
    try {
      setStatus("connecting");
      setStatusMsg(null);

      const json = await apiPostJson<{ ok: boolean; message?: string }, any>(
	  "/v1/integrations/test-connect",
	  {
	    platform: sel,
	    apiKey,
	    secret,
	  }
	);
	
	if (!json.ok) {
	  setStatus("error");
	  setStatusMsg(json.message || "Connection failed.");
	  return;
	}


      setStatus("connected");
      setStatusMsg("Connected successfully.");
      setStep(3);
    } catch (e: any) {
      console.error(e);
      setStatus("error");
      setStatusMsg("Network error while connecting.");
    }
  }

  return (
    <div className="space-y-4">
      <Stepper step={step} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Platforms">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                className={`rounded-md border px-3 py-3 text-sm hover:bg-gray-100 dark:hover:bg-slate2/40 ${
                  sel === p ? "ring-2 ring-cyan" : ""
                }`}
                onClick={() => {
                  setSel(p);
                  setStep(2);
                  setStatus("idle");
                  setStatusMsg(null);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>

        <Card title={`Connect${sel ? `: ${sel}` : ""}`}>
          {!sel ? (
            <p className="text-sm text-gray-500">
              Select a platform to continue.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">Where to find credentials</p>
              <ul className="list-disc ml-4">
                <li>Open {sel} → Settings → API / Webhooks</li>
                <li>Create/Copy your API key or OAuth token</li>
                <li>Paste below and click <b>Connect</b></li>
              </ul>
              <div className="grid gap-2 max-w-md">
                <input
                  className="rounded-md border px-2 py-1 bg-white dark:bg-slate2/30"
                  placeholder="Client ID / API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <input
                  className="rounded-md border px-2 py-1 bg-white dark:bg-slate2/30"
                  placeholder="Client Secret (if any)"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={status === "connecting"}
                    className="rounded-md border px-3 py-1 disabled:opacity-60"
                  >
                    {status === "connecting" ? "Connecting..." : "Connect"}
                  </button>
                  <span className="text-xs">
                    {status === "connected" && (
                      <span className="text-green-600">● Connected</span>
                    )}
                    {status === "error" && (
                      <span className="text-red-500">● Error</span>
                    )}
                  </span>
                </div>
                {statusMsg && (
                  <p
                    className={`text-xs ${
                      status === "error"
                        ? "text-red-500"
                        : "text-green-600"
                    }`}
                  >
                    {statusMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="Install Snippets / Webhooks">
          <div className="text-sm space-y-2">
            <p className="font-semibold">Auto-filled for your workspace</p>
            <div className="grid gap-2">
              <Field
                label="Postback URL"
                value="https://tracekit.app/pb/{workspace}/impact?sig=•••"
              />
              <Field
                label="Orders Webhook"
                value="https://tracekit.app/wh/{workspace}/orders"
              />
              <Field
                label="Refunds Webhook"
                value="https://tracekit.app/wh/{workspace}/refunds"
              />
              <Field
                label="Website Pixel"
                value={`<script src="https://cdn.tracekit.app/tk.js" data-wk="{workspace}"></script>`}
              />
            </div>
            <button
              onClick={() => setStep(4)}
              className="mt-2 rounded-md border px-3 py-1"
            >
              I installed these
            </button>
          </div>
        </Card>

        <Card title="Verify">
          <div className="text-sm space-y-2">
            <div className="flex flex-wrap gap-2">
              <button className="rounded-md border px-3 py-1">
                Send test order
              </button>
              <button className="rounded-md border px-3 py-1">
                Send test refund
              </button>
              <button className="rounded-md border px-3 py-1">
                Simulate conversion
              </button>
            </div>
            <div className="mt-2 border rounded-md p-2 bg-white dark:bg-ink/60">
              <p className="text-xs">Latest:</p>
              <ul className="text-xs space-y-1">
                <li>✓ Order received • 200 OK • ts=…</li>
                <li>✓ Refund received • 200 OK • ts=…</li>
                <li>✓ Conversion received • 200 OK • ts=…</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-xs">
      <div className="mb-1 text-gray-500">{label}</div>
      <div className="flex">
        <input
          readOnly
          value={value}
          className="w-full rounded-l-md border px-2 py-1 bg-white dark:bg-slate2/30"
        />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-r-md border px-2 py-1"
        >
          Copy
        </button>
      </div>
    </label>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Choose Stack", "Connect", "Install", "Verify", "Done"];
  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      {labels.map((lab, i) => (
        <div
          key={lab}
          className={`rounded-md border px-2 py-2 text-center ${
            i < step ? "bg-cyan/10 border-cyan" : ""
          }`}
        >
          {i + 1}. {lab}
        </div>
      ))}
    </div>
  );
}
