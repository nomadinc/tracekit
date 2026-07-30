"use client";

import { useMemo, useState } from "react";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";
import type { IntegrationDefinition } from "@/lib/integrations/types";

const wowSuiteIntegrationIds = ["wowboost"] as const;

function isIntegrationDefinition(
  integration: IntegrationDefinition | undefined
): integration is IntegrationDefinition {
  return Boolean(integration);
}

export default function WowSuiteIntegrationPage() {
  const [activeId, setActiveId] =
    useState<(typeof wowSuiteIntegrationIds)[number]>("wowboost");

  const integrations = useMemo(
    () =>
      wowSuiteIntegrationIds
        .map((id) => getIntegrationDefinition(id))
        .filter(isIntegrationDefinition),
    []
  );

  const activeIntegration =
    integrations.find((integration) => integration?.id === activeId) ??
    integrations[0];

  if (!activeIntegration) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">WowSuite</h1>
          <p className="text-sm text-gray-500">
            Manage WowBoost commerce-order imports and revenue sync through the WowSuite API.
          </p>
        </div>

        <div className="inline-flex overflow-hidden rounded-lg border">
          {integrations.map((integration) => (
            <button
              key={integration.id}
              type="button"
              className={[
                "px-3 py-2 text-sm",
                activeId === integration.id
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-white text-gray-800 dark:bg-ink/60 dark:text-gray-100",
              ].join(" ")}
              onClick={() =>
                setActiveId(
                  integration.id as (typeof wowSuiteIntegrationIds)[number]
                )
              }
            >
              {integration.name}
            </button>
          ))}
        </div>
      </div>

      <IntegrationWizard integration={activeIntegration} />
    </div>
  );
}
