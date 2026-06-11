// Manual admin flag script (Phase 10 — the locked "admin designated by a
// manual flag in the DB"). Writes app_metadata.role = 'admin' on an existing
// auth user; app_metadata is service-role-writable ONLY and rides in the
// verified JWT, so requireAdmin() can gate on it with zero extra queries.
//
// Usage:
//   node --env-file=.env.local scripts/grant-admin.mjs user@email.com
//   node --env-file=.env.local scripts/grant-admin.mjs user@email.com --revoke
//   npm run grant:admin -- user@email.com
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run with: node --env-file=.env.local scripts/grant-admin.mjs <email>",
  );
  process.exit(1);
}

if (!email) {
  console.error(
    "Usage: node --env-file=.env.local scripts/grant-admin.mjs <email> [--revoke]",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Look up the user id by email via the admin API (paged; Staging volume is tiny).
async function findUserByEmail(target) {
  const needle = target.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("listUsers failed:", error.message);
      process.exit(1);
    }
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const role = revoke ? null : "admin";
const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { role },
});
if (updateErr) {
  console.error("updateUserById failed:", updateErr.message);
  process.exit(1);
}

if (revoke) {
  console.log(`Revoked admin role from ${email} (${user.id}).`);
} else {
  console.log(`Granted admin role to ${email} (${user.id}).`);
}
console.log(
  "\nIMPORTANT: the user must SIGN OUT and back IN before the change " +
    "appears in their JWT — app_metadata is baked into the access token at " +
    "issuance, so an existing session keeps the old claims.",
);
