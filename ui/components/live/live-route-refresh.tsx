"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";

export function LiveRouteRefresh({
  workspaceId = "default",
  entity,
  types = [],
}: {
  workspaceId?: string;
  entity?: { type: string; id: string | null | undefined };
  types?: string[];
}) {
  const router = useRouter();
  const entityType = entity?.type || null;
  const entityId = entity?.id || null;
  const typeKey = types.join("|");

  React.useEffect(() => {
    function relatedEntityMatches(update: WorkspaceUpdate) {
      if (!entityId || !entityType) return false;
      if (update.entity?.type === entityType && update.entity.id === entityId) return true;
      const related = Array.isArray(update.payload?.related_entities) ? update.payload?.related_entities : [];
      return related.some((item: any) => item?.type === entityType && String(item?.id || "") === entityId);
    }

    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== workspaceId) return;
      const watchedTypes = typeKey ? typeKey.split("|") : [];
      if (watchedTypes.length && !watchedTypes.includes(update.type)) return;
      if (entityId && !relatedEntityMatches(update)) return;
      router.refresh();
    }

    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, [entityId, entityType, router, typeKey, workspaceId]);

  return null;
}
