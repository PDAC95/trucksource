// No-op stand-in for the real `server-only` package under Vitest. The genuine
// package throws if imported into a Client Component bundle; in unit tests we
// import server modules directly to exercise their logic. The actual RSC
// server/client boundary is still enforced by Next.js at build time.
export {};
