// Connectivity health-check for the Supabase Staging project.
// Runs under Node (server context) — uses the anon key only, makes a
// trivial verified call. Creates NO tables. Run: npm run check:supabase
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in Staging credentials.",
  );
  process.exit(1);
}

const supabase = createClient(url, anon);

// getClaims() with no session returns no user but a successful round-trip
// proves connectivity + valid keys without needing any table.
const { error } = await supabase.auth.getClaims();

if (error) {
  console.error("Supabase connectivity FAILED:", error.message);
  process.exit(1);
}

console.log("Supabase connectivity OK (Staging reachable, keys valid).");
