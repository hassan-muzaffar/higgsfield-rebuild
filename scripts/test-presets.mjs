// End-to-end checks for presets and prompt enhance, as a real signed-in user.
// Makes one real image (~$0.04) and a few cheap text calls. Needs `pnpm dev` running. Run: pnpm test:presets
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.env.APP_URL ?? "http://localhost:3000"; // APP_URL=https://… to test a deployment
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = `oneshot-presets-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const uid = u.user.id;

try {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = (path, body) => fetch(APP + path, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });

  // Presets are public data, 8 per kind, and their thumbnails exist.
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: presets } = await anon.from("presets").select("id, kind, slug, name, thumbnail_path").order("sort");
  const images = presets.filter((p) => p.kind === "image"), videos = presets.filter((p) => p.kind === "video");
  check("8 image styles and 8 camera moves, readable signed-out", images.length === 8 && videos.length === 8);
  const thumbs = await Promise.all([...new Set(presets.map((p) => p.thumbnail_path))].map((t) => fetch(APP + t).then((r) => r.status)));
  check("every preset thumbnail is served", thumbs.every((s) => s === 200), thumbs.join(","));

  // A preset is applied to the job's final prompt, and the user's own prompt is kept separately.
  const cinematic = images.find((p) => p.slug === "cinematic");
  let r = await post("/api/generate", { kind: "image", prompt: "a lighthouse at dusk", aspectRatio: "16:9", count: 1, presetId: cinematic.id });
  const job = (await r.json()).generations?.[0];
  check("image job with a style preset", r.status === 202 && job?.preset_id === cinematic.id);
  check("final prompt = preset template around the user's prompt", job?.prompt === "a lighthouse at dusk" && job?.final_prompt.startsWith("a lighthouse at dusk. Cinematic film still"), job?.final_prompt?.slice(0, 60));

  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 1, presetId: videos[0].id });
  check("camera preset rejected for an image (400)", r.status === 400, (await r.json()).error);
  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 1, presetId: "00000000-0000-4000-8000-000000000000" });
  check("unknown preset rejected (400)", r.status === 400);

  for (let i = 0; i < 40; i++) {
    const row = (await admin.from("generations").select("status").eq("id", job.id).single()).data;
    if (row.status === "succeeded" || row.status === "failed") { check("preset image generated", row.status === "succeeded", row.status); break; }
    await sleep(1500);
  }

  const page = await (await fetch(`${APP}/create?reuse=${job.id}`, { headers: { cookie } })).text();
  check("Reuse keeps the preset selected", page.includes("Style: Cinematic. Change"));

  // Enhance
  r = await fetch(APP + "/api/enhance", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("enhance requires sign-in", r.status === 401);
  r = await post("/api/enhance", { kind: "image", prompt: "  " });
  check("empty prompt rejected", r.status === 400);
  for (const [kind, prompt] of [["image", "cat on a roof"], ["video", "waves at night"], ["voice", "welcome to our shop we sell good coffee come visit"]]) {
    const t0 = Date.now();
    r = await post("/api/enhance", { kind, prompt });
    const b = await r.json();
    const words = b.prompt?.split(/\s+/).length ?? 0;
    const ms = Date.now() - t0;
    check(`enhance (${kind}) returns a richer prompt in under 5s`, r.status === 200 && words > prompt.split(/\s+/).length && ms < 5000, `${ms}ms, ${words} words: ${b.prompt?.slice(0, 80) ?? b.error}…`);
  }
  // Limit: 20 per hour. 3 used above; add 17 more directly, then the next is refused.
  await admin.from("usage_events").insert(Array.from({ length: 17 }, () => ({ user_id: uid, action: "enhance" })));
  r = await post("/api/enhance", { kind: "image", prompt: "cat" });
  check("enhance limited to 20 per hour (429)", r.status === 429, (await r.json()).error);
  const credits = (await admin.from("profiles").select("credits").eq("id", uid).single()).data.credits;
  check("enhance is free (only the image was charged)", credits === 48, `credits=${credits}`);
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  const { data: files } = await admin.storage.from("outputs").list(uid);
  if (files?.length) await admin.storage.from("outputs").remove(files.map((f) => `${uid}/${f.name}`));
  await admin.auth.admin.deleteUser(uid);
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
