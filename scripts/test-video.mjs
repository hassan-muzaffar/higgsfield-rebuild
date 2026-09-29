// Real end-to-end video test: generates one 4-second Veo clip (costs real money, ~$0.60).
// Needs `pnpm dev` running. Run: pnpm test:video [optional output.mp4]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = `oneshot-video-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const uid = u.user.id;
try {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const credits = async () => (await admin.from("profiles").select("credits").eq("id", uid).single()).data.credits;

  let r = await fetch(APP + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ kind: "video", prompt: "x", aspectRatio: "1:1", durationSeconds: 4 }) });
  check("video rejects 1:1", r.status === 400);
  r = await fetch(APP + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ kind: "video", prompt: "x", aspectRatio: "16:9", durationSeconds: 5 }) });
  check("video rejects 5s", r.status === 400);

  const t0 = Date.now();
  r = await fetch(APP + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ kind: "video", prompt: "Slow dolly-in on a steaming cup of coffee on a wooden table by a rainy window, soft morning light, gentle rain sounds", aspectRatio: "16:9", durationSeconds: 4 }) });
  const body = await r.json();
  const id = body.generations?.[0]?.id;
  check("video job created (202)", r.status === 202 && !!id, `${Date.now() - t0}ms ${body.error ?? ""}`);
  check("16 credits charged for 4s", (await credits()) === 34);

  let row, polled = false;
  for (let i = 0; i < 80; i++) {
    await sleep(5000);
    row = (await admin.from("generations").select("status,provider_op_id,error,output_paths,refunded").eq("id", id).single()).data;
    if (!polled && row.status === "running" && row.provider_op_id) {
      const g = await fetch(`${APP}/api/generations/${id}`, { headers: { cookie } });
      const gb = await g.json();
      check("status route works while running", g.status === 200 && gb.generation?.id === id, gb.generation?.status);
      const other = await fetch(`${APP}/api/generations/${id}`);
      check("status route requires sign-in", other.status === 401);
      polled = true;
    }
    if (row.status === "succeeded" || row.status === "failed") break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  check("video finished successfully", row.status === "succeeded", `${row.status} after ${secs}s ${row.error ?? ""}`);
  if (row.status === "succeeded") {
    const { data: file } = await admin.storage.from("outputs").download(row.output_paths[0]);
    const buf = Buffer.from(await file.arrayBuffer());
    const isMp4 = buf.subarray(4, 8).toString() === "ftyp";
    check("MP4 saved to storage", row.output_paths[0] === `${uid}/${id}.mp4` && isMp4 && file.type === "video/mp4", `${(buf.length / 1024).toFixed(0)} KB, ${file.type}`);
    if (process.argv[2]) writeFileSync(process.argv[2], buf);
  } else {
    check("failed video refunded", row.refunded && (await credits()) === 50);
  }
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  const { data: files } = await admin.storage.from("outputs").list(uid);
  if (files?.length) await admin.storage.from("outputs").remove(files.map((f) => `${uid}/${f.name}`));
  await admin.auth.admin.deleteUser(uid);
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
