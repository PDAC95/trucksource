// Gate 3: OKLCH -> linear sRGB -> WCAG contrast + sRGB gamut checker.
// Zero runtime deps, pure Node ESM. Self-contained: the palette under test is
// hardcoded below so this runs BEFORE globals.css is edited (interface-first).
// Method mirrors the one that produced RESEARCH.md §Palette (Ottosson OKLab matrices).

// --- OKLCH -> OKLab -> linear sRGB (Bjorn Ottosson) ---
function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [r, g, bl]; // linear, NOT clamped (so gamut can be checked)
}

// In-gamut iff every linear channel is within [0,1] before clamping.
function inGamut([r, g, b], eps = 1e-4) {
  return [r, g, b].every((c) => c >= -eps && c <= 1 + eps);
}

// WCAG relative luminance from LINEAR sRGB channels (clamp for the math).
function relLuminance([r, g, b]) {
  const c = (x) => Math.min(1, Math.max(0, x));
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contrastRatio(fg, bg) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Palette under test (must match globals.css :root + @theme) ---
const palette = {
  base: [0.18, 0.022, 264],
  card: [0.215, 0.025, 264],
  foreground: [0.97, 0.005, 264],
  "muted-foreground": [0.72, 0.02, 264],
  "neon-red": [0.58, 0.232, 25], // decorative
  "neon-red-text": [0.66, 0.2, 25], // AA text
  "neon-cyan": [0.78, 0.13, 195], // decorative
  "neon-cyan-text": [0.85, 0.115, 195], // AA text
};

const lin = {};
for (const [name, [L, C, h]] of Object.entries(palette)) {
  lin[name] = oklchToLinearSrgb(L, C, h);
}

const cr = (fg, bg) => contrastRatio(lin[fg], lin[bg]);

// --- Assertions: [label, value, floor] ---
const checks = [
  ["foreground vs base", cr("foreground", "base"), 4.5],
  ["muted-foreground vs base", cr("muted-foreground", "base"), 4.5],
  ["neon-red-text vs base", cr("neon-red-text", "base"), 4.5],
  ["neon-red-text vs card", cr("neon-red-text", "card"), 4.5],
  ["neon-cyan-text vs base", cr("neon-cyan-text", "base"), 4.5],
  ["neon-cyan-text vs card", cr("neon-cyan-text", "card"), 4.5],
  ["neon-red (decorative) vs base", cr("neon-red", "base"), 3.0],
  ["neon-cyan (decorative) vs base", cr("neon-cyan", "base"), 3.0],
];

let failed = false;

console.log("\n  Contrast ratios (OKLCH -> linear sRGB -> WCAG):\n");
console.log("  " + "label".padEnd(34) + "CR".padStart(8) + "  floor   result");
console.log("  " + "-".repeat(60));
for (const [label, value, floor] of checks) {
  const ok = value >= floor;
  if (!ok) failed = true;
  console.log(
    "  " +
      label.padEnd(34) +
      value.toFixed(2).padStart(8) +
      `  >=${floor.toFixed(1)}   ${ok ? "PASS" : "FAIL"}`
  );
}

console.log("\n  sRGB gamut check:\n");
console.log("  " + "color".padEnd(20) + "  in-gamut");
console.log("  " + "-".repeat(34));
for (const [name, channels] of Object.entries(lin)) {
  const ok = inGamut(channels);
  if (!ok) failed = true;
  console.log("  " + name.padEnd(20) + "  " + (ok ? "PASS" : "FAIL (out of sRGB)"));
}

console.log("");
if (failed) {
  console.error("  Contrast/gamut check FAILED.\n");
  process.exit(1);
}
console.log("  All contrast + gamut checks PASSED.\n");
process.exit(0);
