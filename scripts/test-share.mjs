// End-to-end checks for sharing, public share pages, Explore and "Try this prompt", across two users.
// Seeds finished items directly, so it makes no AI calls (free). Needs `pnpm dev` running. Run: pnpm test:share
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.env.APP_URL ?? "http://localhost:3000"; // APP_URL=https://… to test a deployment
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const users = [];
const html = async (res) => (await res.text()).replaceAll("<!-- -->", "");

async function signIn(tag, name) {
  const email = `oneshot-share-${tag}-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
  const { data } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  users.push(data.user.id);
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([n, value]) => ({ name: n, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  return { id: data.user.id, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
}
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64");

try {
  const A = await signIn("a", "Ada Maker"), B = await signIn("b", "Bo Viewer");
  const { data: preset } = await admin.from("presets").select("id").eq("slug", "anime").single();
  const prompt = `a paper lantern festival over a river ${Date.now()}`;
  const g = (await admin.rpc("create_generations", { p_user_id: A.id, p_count: 1, p_kind: "image", p_mode: "text", p_model: "test", p_prompt: prompt, p_final_prompt: prompt, p_preset_id: preset.id, p_params: { aspectRatio: "3:4" }, p_input_paths: [], p_cost_each: 0, p_parent_id: null })).data[0];
  const path = `${A.id}/${g.id}.jpg`;
  await admin.storage.from("outputs").upload(path, JPEG, { contentType: "image/jpeg" });
  await admin.from("generations").update({ status: "running" }).eq("id", g.id);
  await admin.from("generations").update({ status: "succeeded", output_paths: [path] }).eq("id", g.id);
  const share = (u, body, id = g.id) => fetch(`${APP}/api/generations/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json", ...(u ? { cookie: u.cookie } : {}) }, body: JSON.stringify(body) });

  check("private by default: not in Explore", !(await html(await fetch(`${APP}/explore`))).includes(prompt));
  let r = await share(null, { public: true });
  check("sharing requires sign-in", r.status === 401);
  r = await share(B, { public: true });
  check("another user can't share it (404)", r.status === 404);
  const pending = (await admin.rpc("create_generations", { p_user_id: A.id, p_count: 1, p_kind: "image", p_mode: "text", p_model: "t", p_prompt: "p", p_final_prompt: "p", p_preset_id: null, p_params: {}, p_input_paths: [], p_cost_each: 0, p_parent_id: null })).data[0];
  r = await share(A, { public: true }, pending.id);
  check("unfinished items can't be shared (409)", r.status === 409);

  r = await share(A, { public: true });
  const body = await r.json();
  const slug = body.slug;
  check("owner shares: gets a /g/<slug> link", r.status === 200 && body.isPublic && /^[A-Za-z0-9]{10}$/.test(slug) && body.path === `/g/${slug}`, slug);

  let page = await fetch(`${APP}/g/${slug}`);
  let text = await html(page);
  check("share page works signed out", page.status === 200 && text.includes(prompt) && text.includes("Ada Maker") && text.includes("Try this prompt"));
  const ogImage = text.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  check("share page has Open Graph title and image", text.includes('<meta property="og:title"') && !!ogImage);
  check("the image link loads", ogImage && (await fetch(ogImage)).status === 200);

  text = await html(await fetch(`${APP}/explore`));
  check("appears in Explore with creator name", text.includes(prompt) && text.includes(`/g/${slug}`));
  const api = await (await fetch(`${APP}/api/explore?type=image`)).json();
  const item = api.items.find((i) => i.share_slug === slug);
  check("Explore API: only safe fields (no owner id, cost or inputs)", !!item && !("user_id" in item) && !("cost" in item) && !("input_paths" in item) && !("final_prompt" in item));
  check("Explore type filter works", !(await (await fetch(`${APP}/api/explore?type=video`)).json()).items.some((i) => i.share_slug === slug));

  // Try this prompt: prompt, preset and settings come across; files don't.
  page = await fetch(`${APP}/create?try=${slug}`, { headers: { cookie: B.cookie } });
  text = await html(page);
  check("Try this prompt fills in prompt, preset and aspect ratio", text.includes(`${prompt}</textarea>`) && text.includes("Style: Anime. Change") && text.includes("Aspect ratio 3:4"));
  check("…without the creator's files", !text.includes('alt="Reference image"'));
  r = await fetch(`${APP}/create?try=${slug}`, { redirect: "manual" });
  check("signed out: sign in first, then come back to it", r.status === 307 && decodeURIComponent(r.headers.get("location")).includes(`next=/create?try=${slug}`));

  // Make private
  r = await share(A, { public: false });
  check("owner makes it private", r.status === 200 && (await r.json()).isPublic === false);
  page = await fetch(`${APP}/g/${slug}`);
  check("share link now 404s", page.status === 404 && (await html(page)).includes("This link isn"));
  check("gone from Explore", !(await html(await fetch(`${APP}/explore`))).includes(prompt));
  text = await html(await fetch(`${APP}/create?try=${slug}`, { headers: { cookie: B.cookie } }));
  check("Try this prompt no longer works for it", !text.includes(`${prompt}</textarea>`));
  r = await share(A, { public: true });
  check("sharing again reuses the same link", (await r.json()).slug === slug && (await fetch(`${APP}/g/${slug}`)).status === 200);
  check("bad slugs are a clean 404", (await fetch(`${APP}/g/${encodeURIComponent("x'; drop--")}`)).status === 404);
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  for (const id of users) {
    const { data: files } = await admin.storage.from("outputs").list(id);
    if (files?.length) await admin.storage.from("outputs").remove(files.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
