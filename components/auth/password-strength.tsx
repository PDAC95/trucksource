"use client";

import { cn } from "@/lib/utils";

// Pure inline strength meter — no external library (per RESEARCH "Don't add").
// NIST-aligned: min length is the dominant signal; character variety adds
// segments. No rigid symbol/uppercase rules.
function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (variety >= 2) score++;
  if (variety >= 3) score++;
  return Math.min(score, 4);
}

const SEGMENTS = 4;
const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const COLORS = [
  "bg-muted",
  "bg-destructive",
  "bg-amber-500",
  "bg-yellow-400",
  "bg-emerald-500",
] as const;

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);

  return (
    <div data-slot="password-strength" className="grid gap-1.5">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score ? COLORS[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Password strength:{" "}
          <span className="font-medium">{LABELS[score]}</span>
          {password.length < 8 && " — use at least 8 characters"}
        </p>
      )}
    </div>
  );
}
