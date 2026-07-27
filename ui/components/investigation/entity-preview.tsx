"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EntityHeader } from "@/components/shared/entity-header";
import { EntityLink } from "@/components/shared/entity-link";
import { PageSection, SectionHeader } from "@/components/shared/primitives";
import { formatAbsoluteTime } from "@/lib/format";
import { entityTypeLabel, type EntityPreview as EntityPreviewShape } from "@/lib/entities";

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  const ms = Date.parse(text);
  if (Number.isFinite(ms) && /\d{4}-\d{2}-\d{2}/.test(text)) return formatAbsoluteTime(text);
  return text;
}

export function EntityPreview({
  entity,
  onRefresh,
  onWorkItemAction,
  busyActionId,
}: {
  entity: EntityPreviewShape;
  onRefresh: () => void;
  onWorkItemAction: (action: string) => Promise<void>;
  busyActionId?: string | null;
}) {
  return (
    <div className="space-y-5">
      <EntityHeader
        entityType={entity.type}
        title={entity.title}
        subtitle={entity.subtitle}
        statuses={entity.statuses}
        metadata={entity.metrics.map((metric) => ({ label: metric.label, value: displayValue(metric.value) }))}
        identifiers={entity.identifiers}
        actions={entity.actions}
        busyActionId={busyActionId}
        onAction={async (action) => {
          if (action.kind === "work_item_action" && action.action) {
            await onWorkItemAction(action.action);
            onRefresh();
          }
        }}
      />

      {entity.explanation ? (
        <PageSection>
          <SectionHeader title={entity.explanation.title || "Explanation"} description={entity.explanation.summary} />
          {entity.explanation.statements?.length ? (
            <div className="space-y-2">
              {entity.explanation.statements.map((statement) => (
                <div key={statement.id} className="rounded-lg border bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                  {statement.text}
                </div>
              ))}
            </div>
          ) : null}
          {entity.explanation.recommended_review_steps?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {entity.explanation.recommended_review_steps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          ) : null}
        </PageSection>
      ) : null}

      {entity.related_entities.length ? (
        <PageSection>
          <SectionHeader title="Related Entities" />
          <div className="space-y-2">
            {entity.related_entities.map((related) => (
              <EntityLink
                key={`${related.type}:${related.id}`}
                target={{ type: related.type, id: related.id, label: related.label }}
                href={related.href}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{related.label}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{entityTypeLabel(related.type)}{related.subtitle ? ` · ${related.subtitle}` : ""}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </EntityLink>
            ))}
          </div>
        </PageSection>
      ) : null}

      {entity.sections.map((section) => (
        <PageSection key={section.id}>
          <SectionHeader title={section.title} />
          {section.items.length ? (
            <dl className="divide-y text-sm dark:divide-white/10">
              {section.items.map((item, index) => (
                <div key={`${item.label}:${index}`} className="grid gap-2 py-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-slate-500 dark:text-slate-400">{item.label}</dt>
                  <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">{displayValue(item.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No records in this bounded preview.</p>
          )}
        </PageSection>
      ))}

      {entity.recent_activity.length ? (
        <PageSection>
          <SectionHeader title="Recent Activity" />
          <div className="space-y-3">
            {entity.recent_activity.map((activity) => (
              <div key={activity.id} className="rounded-lg border p-3 text-sm dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{activity.title}</div>
                    {activity.summary ? <div className="mt-1 text-slate-500 dark:text-slate-400">{activity.summary}</div> : null}
                  </div>
                  <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{activity.occurred_at ? formatAbsoluteTime(activity.occurred_at) : "Unknown"}</div>
                </div>
                {activity.entity ? (
                  <EntityLink
                    target={{ type: activity.entity.type, id: activity.entity.id, label: activity.entity.label }}
                    href={activity.entity.href}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-300"
                  >
                    Open {entityTypeLabel(activity.entity.type)}
                    <ArrowRight className="h-3 w-3" />
                  </EntityLink>
                ) : null}
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}

      <Link href={entity.full_page_link} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950">
        Open full page
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
