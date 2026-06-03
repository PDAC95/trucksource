"use client";

import * as React from "react";
import { CheckIcon, XIcon, Loader2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { USERNAME_REGEX } from "@/lib/username/generate";

const DEBOUNCE_MS = 400;

interface UsernameFieldProps extends Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
}

// The async lookup stores its answer keyed by the exact candidate it ran for.
// Synchronous statuses (idle / invalid / checking) are DERIVED during render by
// comparing the current candidate to the resolved one — so the effect never
// calls setState synchronously (only inside the async timeout callback).
type Resolved = {
  candidate: string;
  outcome: "available" | "taken" | "invalid" | "error";
};

// Live availability + format feedback for the optional registration username.
export function UsernameField({
  value,
  onChange,
  className,
  ...inputProps
}: UsernameFieldProps) {
  const candidate = value.trim();
  const formatValid = candidate !== "" && USERNAME_REGEX.test(candidate);

  const [resolved, setResolved] = React.useState<Resolved | null>(null);

  React.useEffect(() => {
    if (!formatValid) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/username-available?u=${encodeURIComponent(candidate)}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as {
          available: boolean;
          reason?: string;
        };
        const outcome: Resolved["outcome"] = data.available
          ? "available"
          : data.reason === "invalid" || data.reason === "reserved"
            ? "invalid"
            : "taken";
        setResolved({ candidate, outcome });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResolved({ candidate, outcome: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [candidate, formatValid]);

  // Derive the rendered status without any synchronous setState.
  const status:
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "invalid"
    | "error" =
    candidate === ""
      ? "idle"
      : !formatValid
        ? "invalid"
        : resolved?.candidate === candidate
          ? resolved.outcome
          : "checking"; // result is for a stale candidate → still checking

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          {...inputProps}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="username"
          aria-invalid={status === "taken" || status === "invalid"}
          className={cn("pr-9", className)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
          {status === "checking" && (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          )}
          {status === "available" && (
            <CheckIcon className="size-4 text-emerald-500" />
          )}
          {(status === "taken" || status === "invalid") && (
            <XIcon className="size-4 text-destructive" />
          )}
        </span>
      </div>
      {status === "available" && (
        <p className="text-xs text-emerald-600">Username available</p>
      )}
      {status === "taken" && (
        <p className="text-destructive text-xs">Username already taken</p>
      )}
      {status === "invalid" && (
        <p className="text-destructive text-xs">
          3–20 letters or numbers, no spaces
        </p>
      )}
      {status === "idle" && (
        <p className="text-muted-foreground text-xs">
          Optional — we&apos;ll generate one if you leave this blank
        </p>
      )}
    </div>
  );
}
