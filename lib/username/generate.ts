// Auto-generated usernames for new accounts.
// Built ONLY from a hard-coded truck/parts vocabulary + a random number —
// never derived from any PII (name, email, phone). The single source of truth
// for the username format lives here and is re-exported by the Zod validator.

/** Canonical username format: 3–20 alphanumerics. */
export const USERNAME_REGEX = /^[A-Za-z0-9]{3,20}$/;

/**
 * Reserved handles that must never be assigned or accepted, even if they match
 * USERNAME_REGEX. Used as defense-in-depth by the register validator.
 */
const RESERVED = new Set(["admin", "login", "api", "auth", "u", "register"]);

/** Truck / heavy-parts vocabulary the generator draws from. */
const WORDS = [
  "Peterbilt",
  "Kenworth",
  "Chrome",
  "Diesel",
  "Rig",
  "Hood",
  "Stack",
  "Bumper",
  "Visor",
  "Aerodyne",
  "BigRig",
  "Cabover",
  "Deck",
  "Grille",
] as const;

const MAX_LEN = 20;
const MAX_TRIES = 10;

/** True if `value` is a reserved handle (case-insensitive). */
export function isReservedUsername(value: string): boolean {
  return RESERVED.has(value.toLowerCase());
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * Build a single candidate handle: `${Word}${num}` truncated to MAX_LEN.
 * Always matches USERNAME_REGEX (words are alphanumeric, num is 100–9999).
 */
function buildCandidate(): string {
  const word = pick(WORDS);
  const num = randomInt(100, 9999);
  return `${word}${num}`.slice(0, MAX_LEN);
}

/**
 * Generate a unique, format-valid username.
 *
 * @param isTaken optional async predicate the Server Action injects to check
 *   collisions against the DB. Defaults to "never taken" for unit tests.
 * @throws if a unique candidate is not found within MAX_TRIES attempts.
 */
export async function generateUsername(
  isTaken: (candidate: string) => Promise<boolean> = async () => false,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let candidate = buildCandidate();
    // Avoid the (astronomically unlikely) reserved collision.
    while (isReservedUsername(candidate)) {
      candidate = buildCandidate();
    }
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error(
    `Could not generate a unique username after ${MAX_TRIES} attempts`,
  );
}
