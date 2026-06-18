// lib/listings/years.ts — the SINGLE source of truth for the listing YEAR range.
//
// Both the buyer search UIs (16-06) and the create/edit listing form (16-07)
// import these — the range 1970..2027 is declared here ONCE and nowhere else,
// mirroring the garage year picker bounds (garage_trucks_year_range, 0005) and
// the listings_year_bounds CHECK (0026). 2027 = current year (2026) + 1.
//
// Pure, dependency-free, client + server safe (no "use server", no imports).

export const YEAR_MIN = 1970;
export const YEAR_MAX = 2027;

/**
 * The full year list in DESCENDING order (newest first): [2027, 2026, … 1970].
 * Mirrors the garage picker pattern so both pickers read the same direction.
 */
export function yearOptions(): number[] {
  return Array.from(
    { length: YEAR_MAX - YEAR_MIN + 1 },
    (_, i) => YEAR_MAX - i,
  );
}

/** True when y is an integer inside the inclusive 1970..2027 range. */
export function isValidYear(y: number): boolean {
  return Number.isInteger(y) && y >= YEAR_MIN && y <= YEAR_MAX;
}
