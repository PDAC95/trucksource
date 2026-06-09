"use client";

// ── FINT-02 HARD GUARANTEE ──────────────────────────────────────────────────
// This component PROPOSES only. It MUST NEVER auto-apply a suggestion into the
// parent's confirmed-fitment state. There is intentionally NO React effect here
// and NO auto-accept: a suggestion enters confirmed state ONLY through an explicit
// click on a chip or "Add all", which calls the parent's onAccept* / onAddAll
// handlers. Do NOT replace these click handlers with an effect — that would break
// the FINT-02 "never auto-applied" guarantee the whole plan is built around.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { X } from "lucide-react";

import type {
  SuggestionGroup,
  SuggestedFitment,
  SuggestedTag,
} from "@/lib/fitment/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Stable session-dismiss key per suggestion. Fitments key on model+config arm;
// tags key on kind+id. The parent owns the dismissed Set and filters with these.
export function fitmentKey(f: SuggestedFitment): string {
  return `f-${f.modelId}-${f.configId ?? "null"}`;
}
export function tagKey(t: SuggestedTag): string {
  return `t-${t.kind}-${t.id}`;
}

function fitmentLabel(f: SuggestedFitment): string {
  return [f.makeName, f.modelName, f.configName].filter(Boolean).join(" ");
}

export function FitmentSuggestions({
  groups,
  isLoading,
  hasTrigger,
  dismissed,
  onDismiss,
  onAcceptFitment,
  onAcceptTag,
  onAddAll,
}: {
  groups: SuggestionGroup[];
  isLoading: boolean;
  hasTrigger: boolean;
  dismissed: Set<string>;
  onDismiss: (key: string) => void;
  onAcceptFitment: (f: SuggestedFitment) => void;
  onAcceptTag: (t: SuggestedTag) => void;
  onAddAll: (group: SuggestionGroup) => void;
}) {
  // Drop session-dismissed suggestions before rendering; recompute the visible
  // group set so an emptied group disappears and the empty-state copy is accurate.
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      fitments: g.fitments.filter((f) => !dismissed.has(fitmentKey(f))),
      tags: g.tags.filter((t) => !dismissed.has(tagKey(t))),
    }))
    .filter((g) => g.fitments.length > 0 || g.tags.length > 0);

  const hasVisible = visibleGroups.length > 0;

  return (
    <div
      role="group"
      aria-label="Fitment suggestions"
      aria-busy={isLoading}
      className="grid gap-3"
    >
      {visibleGroups.map((group) => {
        const isGarage = group.source === "garage";
        return (
          <div
            key={`${group.source}-${group.label}`}
            className={
              isGarage
                ? "rounded-md border border-primary/30 bg-primary/5 p-3"
                : "rounded-md border p-3"
            }
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {group.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onAddAll(group)}
              >
                Add all suggested
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {group.fitments.map((f) => (
                <Badge
                  key={fitmentKey(f)}
                  variant="outline"
                  className="gap-1.5 py-1"
                >
                  <button
                    type="button"
                    onClick={() => onAcceptFitment(f)}
                    aria-label={`Add fitment ${fitmentLabel(f)}`}
                    className="hover:text-foreground"
                  >
                    {fitmentLabel(f)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(fitmentKey(f))}
                    aria-label={`Dismiss suggestion ${fitmentLabel(f)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}

              {group.tags.map((t) => (
                <Badge
                  key={tagKey(t)}
                  variant="outline"
                  className="gap-1.5 py-1"
                >
                  <button
                    type="button"
                    onClick={() => onAcceptTag(t)}
                    aria-label={`Add tag ${t.name}`}
                    className="hover:text-foreground"
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(tagKey(t))}
                    aria-label={`Dismiss suggestion ${t.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        );
      })}

      {/* Subtle loading skeleton — shown BELOW any existing groups so suggestions
          don't flicker away while a new category recomputes. */}
      {isLoading && (
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      )}

      {/* Empty state — never hide the zone silently (CONTEXT). */}
      {!isLoading && !hasVisible && hasTrigger && (
        <p className="text-muted-foreground text-sm">
          No automatic suggestions — add fitments manually below.
        </p>
      )}
    </div>
  );
}
