// Makes the landing-page samples in public/showcase/ by driving the real app as a signed-in user:
// 6 images with different styles, then "Animate this" on the hero image into a 6s image-to-video clip.
// Doubles as an end-to-end test of generate → animate → image-to-video. Costs ~$1.15.
// Needs `pnpm dev` running. Run: pnpm showcase
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.env.APP_URL ?? "http://localhost:3000"; // APP_URL=https://… to test a deployment
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };

const IMAGES = [
  { file: "hero", preset: "cinematic", aspectRatio: "16:9", prompt: "A lone astronaut standing on a red desert dune at golden hour, looking at a giant ringed planet rising over the horizon" },
  { file: "product", preset: "product", aspectRatio: "1:1", prompt: "A matte black perfume bottle on wet volcanic rock with a single orchid" },
  { file: "treehouse", preset: "anime", aspectRatio: "3:4", prompt: "A cosy treehouse library at golden hour, lanterns and a sleeping cat" },
  { file: "ramen", preset: "cyberpunk", aspectRatio: "3:4", prompt: "A tiny ramen stall on a rainy Tokyo backstreet at night, steam rising" },
  { file: "fisherman", preset: "editorial", aspectRatio: "3:4", prompt: "Portrait of an elderly fisherman with a weathered face in a yellow raincoat" },
  { file: "teapot", preset: "3d-render", aspectRatio: "1:1", prompt: "A glass teapot shaped like a snail, filled with glowing pastel tea" },
];

const email = `oneshot-showcase-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "OneShot Showcase" } });
const uid = u.user.id;
await admin.from("profiles").update({ credits: 500 }).eq("id", uid);

async function waitFor(id, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    // Poll through the app, as the studio does (this also advances running videos).
    const r = await fetch(`${APP}/api/generations/${id}`, { headers: { cookie } });
    const { generation } = await r.json();
    if (generation.status === "succeeded" || generation.status === "failed") return generation;
    await sleep(5000);
  }
  throw new Error(`timed out waiting for ${id}`);
}

let cookie;
try {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const { data: presets } = await admin.from("presets").select("id, slug");
  const presetId = (slug) => presets.find((p) => p.slug === slug).id;
  mkdirSync("public/showcase", { recursive: true });

  const jobs = await Promise.all(IMAGES.map(async (img) => {
    const r = await fetch(`${APP}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ kind: "image", prompt: img.prompt, aspectRatio: img.aspectRatio, count: 1, presetId: presetId(img.preset) }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    return { ...img, id: body.generations[0].id };
  }));
  const done = await Promise.all(jobs.map((j) => waitFor(j.id, 120_000).then((g) => ({ ...j, g }))));
  for (const { file, g } of done) {
    check(`image "${file}" generated`, g.status === "succeeded", g.error ?? "");
    if (g.status !== "succeeded") continue;
    const { data } = await admin.storage.from("outputs").download(g.output_paths[0]);
    writeFileSync(`public/showcase/${file}.jpg`, Buffer.from(await data.arrayBuffer()));
    execFileSync("sips", ["-Z", file === "hero" ? "1600" : "900", "-s", "format", "jpeg", "-s", "formatOptions", "78", `public/showcase/${file}.jpg`, "--out", `public/showcase/${file}.jpg`], { stdio: "ignore" });
  }

  // "Animate this" on the hero, exactly as the detail panel does it.
  const hero = done.find((d) => d.file === "hero");
  const page = (await (await fetch(`${APP}/create?animate=${hero.id}`, { headers: { cookie } })).text()).replaceAll("&amp;", "&");
  const startFramePath = decodeURIComponent(page.match(/\/object\/sign\/inputs\/([^?"]+)/)?.[1] ?? "");
  check("Animate this prepared a start frame from the hero image", startFramePath.startsWith(`${uid}/`) && page.includes("Aspect ratio 16:9"), startFramePath);

  const r = await fetch(`${APP}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({
    kind: "video", aspectRatio: "16:9", durationSeconds: 6, startFramePath, parentId: hero.id, presetId: presetId("dolly-in"),
    prompt: "The astronaut takes a slow step forward as fine red dust drifts in the wind and the ringed planet glows on the horizon",
  }) });
  const video = (await r.json()).generations?.[0];
  check("image-to-video job created with parent link and preset", r.status === 202 && video.mode === "image_to_video" && video.parent_id === hero.id && !!video.preset_id);
  const t0 = Date.now();
  const v = await waitFor(video.id, 8 * 60_000);
  check("image-to-video clip generated", v.status === "succeeded", `${v.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s ${v.error ?? ""}`);
  if (v.status === "succeeded") {
    const { data } = await admin.storage.from("outputs").download(v.output_paths[0]);
    writeFileSync("public/showcase/hero.mp4", Buffer.from(await data.arrayBuffer()));
  }
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  for (const bucket of ["outputs", "inputs"]) {
    const { data: files } = await admin.storage.from(bucket).list(uid);
    if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
  }
  await admin.auth.admin.deleteUser(uid);
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
