// End-to-end checks for /api/generate and retry, as a real signed-in user. Needs `pnpm dev` running.
// Creates a throwaway user and deletes it (and its files) afterwards. Run: pnpm test:api
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = `oneshot-api-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "API Test" } });
const uid = u.user.id;
try {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = (path, body) => fetch(APP + path, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: body && JSON.stringify(body) });
  const credits = async () => (await admin.from("profiles").select("credits").eq("id", uid).single()).data.credits;

  let r = await fetch(APP + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("signed-out request rejected", r.status === 401, r.status);
  r = await post("/api/generate", { kind: "image", prompt: "  ", aspectRatio: "1:1", count: 1 });
  check("empty prompt rejected", r.status === 400, (await r.json()).error);
  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "7:3", count: 1 });
  check("bad aspect ratio rejected", r.status === 400);
  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 5 });
  check("count above 4 rejected", r.status === 400);
  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 1, referencePath: "someone-else/x.png" });
  check("someone else's reference rejected", r.status === 403);

  const t0 = Date.now();
  r = await post("/api/generate", { kind: "image", prompt: "A red paper boat on a lake", aspectRatio: "16:9", count: 2 });
  const body = await r.json();
  check("generate returns 202 with 2 queued jobs", r.status === 202 && body.generations?.length === 2 && body.generations.every((g) => g.status === "queued"), `${Date.now() - t0}ms`);
  check("4 credits charged up front", (await credits()) === 46);
  const ids = body.generations.map((g) => g.id);
  let rows;
  for (let i = 0; i < 60; i++) {
    rows = (await admin.from("generations").select("id,status,error,refunded,output_paths").in("id", ids)).data;
    if (rows.every((g) => g.status === "succeeded" || g.status === "failed")) break;
    await sleep(1000);
  }
  console.log("   job results:", rows.map((g) => `${g.status}${g.error ? " (" + g.error + ")" : ""}`).join(" | "));
  const failed = rows.filter((g) => g.status === "failed");
  if (failed.length) {
    check("failed jobs are refunded", failed.every((g) => g.refunded) && (await credits()) === 46 + 2 * failed.length, `credits=${await credits()}`);
    r = await post(`/api/generations/${failed[0].id}/retry`);
    const rb = await r.json();
    check("retry creates a new job and removes the failed one", r.status === 202 && rb.generation?.id && rb.replaced === failed[0].id);
    await sleep(8000);
  } else {
    check("images saved to storage", rows.every((g) => g.output_paths.length === 1));
  }
  await admin.from("profiles").update({ credits: 1 }).eq("id", uid);
  r = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 1 });
  check("not enough credits → 402", r.status === 402, (await r.json()).error);
  // rate limit counts ledger charges: 2 + 1 retry = 3 so far; +4 = 7 allowed; +4 = 11 refused
  await admin.from("profiles").update({ credits: 500 }).eq("id", uid);
  const a = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 4 });
  const b = await post("/api/generate", { kind: "image", prompt: "x", aspectRatio: "1:1", count: 4 });
  check("rate limit: more than 10 jobs per minute refused", a.status === 202 && b.status === 429, `${a.status}/${b.status}`);
  await sleep(10000);
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  const { data: files } = await admin.storage.from("outputs").list(uid);
  if (files?.length) await admin.storage.from("outputs").remove(files.map((f) => `${uid}/${f.name}`));
  await admin.auth.admin.deleteUser(uid);
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
