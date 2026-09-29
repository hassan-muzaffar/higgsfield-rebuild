// End-to-end checks for the library, delete, favourites and chaining (Animate / Edit / Reuse / Add voiceover),
// as real signed-in users. Seeds finished items directly, so it makes no AI calls (free).
// Needs `pnpm dev` running. Run: pnpm test:library
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const users = [];

async function signIn(tag) {
  const email = `oneshot-lib-${tag}-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
  const { data } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  users.push(data.user.id);
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  const browser = createClient(URL_, ANON, { auth: { persistSession: false } });
  await browser.auth.signInWithPassword({ email, password: pw });
  return { id: data.user.id, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), browser };
}

// A tiny valid JPEG (1x1).
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", "base64");

async function seed(userId, kind, params, ext, prompt = "seeded " + kind) {
  const { data } = await admin.rpc("create_generations", { p_user_id: userId, p_count: 1, p_kind: kind, p_mode: kind === "voice" ? "tts" : "text", p_model: "test", p_prompt: prompt, p_final_prompt: prompt, p_preset_id: null, p_params: params, p_input_paths: [], p_cost_each: 0, p_parent_id: null });
  const g = data[0];
  const path = `${userId}/${g.id}.${ext}`;
  await admin.storage.from("outputs").upload(path, JPEG, { contentType: ext === "jpg" ? "image/jpeg" : ext === "mp4" ? "video/mp4" : "audio/mpeg", upsert: true });
  await admin.from("generations").update({ status: "running" }).eq("id", g.id);
  await admin.from("generations").update({ status: "succeeded", output_paths: [path] }).eq("id", g.id);
  return { ...g, path };
}

try {
  const A = await signIn("a"), B = await signIn("b");
  const img = await seed(A.id, "image", { aspectRatio: "9:16" }, "jpg", "a red paper boat");
  const vid = await seed(A.id, "video", { aspectRatio: "16:9", durationSeconds: 6 }, "mp4");
  const voice = await seed(A.id, "voice", { voice: "cedar", style: "narrator" }, "mp3", "Hello from the narrator");
  const doomed = await seed(A.id, "image", { aspectRatio: "1:1" }, "jpg");

  // Library pages and filters
  for (const [type, expect] of [["", 4], ["image", 2], ["video", 1], ["voice", 1], ["favorites", 0]]) {
    const r = await fetch(`${APP}/library${type ? "?type=" + type : ""}`, { headers: { cookie: A.cookie } });
    const html = await r.text();
    const cards = (html.match(/aria-label="Open details"/g) ?? []).length;
    check(`library${type ? " ?type=" + type : ""} shows ${expect} item(s)`, r.status === 200 && cards === expect, `status ${r.status}, ${cards} cards`);
  }
  const rOut = await fetch(`${APP}/library`, { redirect: "manual" });
  check("library requires sign-in", rOut.status === 307 && rOut.headers.get("location").includes("/login?next=%2Flibrary"));

  // Favourites (RLS through the browser client)
  let f = await A.browser.from("favorites").upsert({ user_id: A.id, generation_id: img.id });
  check("user can favourite own item", !f.error, f.error?.message);
  f = await B.browser.from("favorites").insert({ user_id: B.id, generation_id: vid.id });
  check("user cannot favourite someone else's item", !!f.error);
  const favPage = await (await fetch(`${APP}/library?type=favorites`, { headers: { cookie: A.cookie } })).text();
  check("favourites filter shows the favourited item", (favPage.match(/aria-label="Open details"/g) ?? []).length === 1 && favPage.includes("a red paper boat"));
  f = await A.browser.from("favorites").delete().eq("user_id", A.id).eq("generation_id", img.id);
  const favCount = (await admin.from("favorites").select("*", { count: "exact", head: true }).eq("user_id", A.id)).count;
  check("un-favourite persists", !f.error && favCount === 0);

  // Delete
  let r = await fetch(`${APP}/api/generations/${doomed.id}`, { method: "DELETE", headers: { cookie: B.cookie } });
  check("other user cannot delete (404)", r.status === 404);
  r = await fetch(`${APP}/api/generations/${doomed.id}`, { method: "DELETE" });
  check("delete requires sign-in (401)", r.status === 401);
  const running = (await admin.rpc("create_generations", { p_user_id: A.id, p_count: 1, p_kind: "image", p_mode: "text", p_model: "t", p_prompt: "p", p_final_prompt: "p", p_preset_id: null, p_params: {}, p_input_paths: [], p_cost_each: 0, p_parent_id: null })).data[0];
  r = await fetch(`${APP}/api/generations/${running.id}`, { method: "DELETE", headers: { cookie: A.cookie } });
  check("can't delete while generating (409)", r.status === 409);
  r = await fetch(`${APP}/api/generations/${doomed.id}`, { method: "DELETE", headers: { cookie: A.cookie } });
  const row = (await admin.from("generations").select("id").eq("id", doomed.id)).data;
  const { data: files } = await admin.storage.from("outputs").list(A.id, { search: doomed.id });
  check("owner deletes: row and file removed", r.status === 204 && row.length === 0 && files.length === 0, `status ${r.status}, rows ${row.length}, files ${files.length}`);

  // Chaining: the /create page prepares the prompt bar
  const inputsBefore = (await admin.storage.from("inputs").list(A.id)).data?.length ?? 0;
  let page = await (await fetch(`${APP}/create?animate=${img.id}`, { headers: { cookie: A.cookie } })).text();
  const inputsAfter = (await admin.storage.from("inputs").list(A.id)).data ?? [];
  check("Animate this: image copied into inputs", inputsAfter.length === inputsBefore + 1);
  check("Animate this: Video tab selected, 9:16 from portrait image, start frame attached",
    /aria-selected="true"[^>]*>(?:<[^>]+>)*Video/.test(page) && page.includes("Aspect ratio 9:16") && page.includes('alt="Start frame"'));
  const { data: orig } = await admin.storage.from("outputs").list(A.id, { search: img.id });
  check("original output untouched", orig.length === 1);

  page = await (await fetch(`${APP}/create?edit=${img.id}`, { headers: { cookie: A.cookie } })).text();
  check("Edit this: Image tab with reference attached", /aria-selected="true"[^>]*>(?:<[^>]+>)*Image/.test(page) && page.includes('alt="Reference image"'));

  page = await (await fetch(`${APP}/create?voiceover=${vid.id}`, { headers: { cookie: A.cookie } })).text();
  check("Add voiceover: Voice tab with the prompt as script", /aria-selected="true"[^>]*>(?:<[^>]+>)*Voice/.test(page) && page.includes("seeded video</textarea>"));

  page = await (await fetch(`${APP}/create?reuse=${voice.id}`, { headers: { cookie: A.cookie } })).text();
  check("Reuse: same voice and style", page.includes("Voice: Cedar") && page.includes("Style: Narrator") && page.includes("Hello from the narrator</textarea>"));

  page = await (await fetch(`${APP}/create?animate=${img.id}`, { headers: { cookie: B.cookie } })).text();
  check("chaining someone else's item is ignored", !page.includes('alt="Start frame"') && /aria-selected="true"[^>]*>(?:<[^>]+>)*Image/.test(page));

  // parent_id: set for own parent, dropped for someone else's
  await admin.from("profiles").update({ credits: 100 }).eq("id", B.id);
  r = await fetch(`${APP}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", cookie: B.cookie }, body: JSON.stringify({ kind: "voice", prompt: "Hi", voice: "marin", style: "natural", parentId: img.id }) });
  const bg = (await r.json()).generations?.[0];
  check("parent link to someone else's item is dropped", r.status === 202 && bg?.parent_id === null, `parent_id=${bg?.parent_id}`);
  await admin.from("profiles").update({ credits: 100 }).eq("id", A.id);
  r = await fetch(`${APP}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", cookie: A.cookie }, body: JSON.stringify({ kind: "voice", prompt: "Hi", voice: "marin", style: "natural", parentId: img.id }) });
  const ag = (await r.json()).generations?.[0];
  check("parent link to own item is kept", r.status === 202 && ag?.parent_id === img.id);
  await new Promise((res) => setTimeout(res, 8000)); // let the two small voiceovers finish before cleanup
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  for (const id of users) {
    for (const bucket of ["outputs", "inputs"]) {
      const { data: files } = await admin.storage.from(bucket).list(id);
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
