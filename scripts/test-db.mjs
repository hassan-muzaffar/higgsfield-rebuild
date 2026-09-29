// Live checks for RLS, credit functions and storage policies against the linked Supabase project.
// Creates two throwaway users and deletes them afterwards. Run: pnpm test:db
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const stamp = Date.now(), pw = "Test-" + stamp + "-pw!";
const users = [];
async function mkUser(tag) {
  const { data, error } = await admin.auth.admin.createUser({ email: `oneshot-test-${tag}-${stamp}@example.com`, password: pw, email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error; users.push(data.user.id);
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email: data.user.email, password: pw }); if (s.error) throw s.error;
  return { id: data.user.id, c };
}
try {
  const A = await mkUser("a"), B = await mkUser("b");
  const pa = await A.c.from("profiles").select("*").eq("id", A.id).single();
  check("new user gets profile with 50 credits", pa.data?.credits === 50, `credits=${pa.data?.credits}`);
  check("display name from Google-style metadata", pa.data?.display_name === "Test a");
  const la = await A.c.from("credit_ledger").select("*");
  check("signup ledger row", la.data?.length === 1 && la.data[0].delta === 50 && la.data[0].reason === "signup");
  const pb = await A.c.from("profiles").select("*").eq("id", B.id);
  check("user A cannot read user B's profile", pb.data?.length === 0);
  const up = await A.c.from("profiles").update({ credits: 99999 }).eq("id", A.id).select();
  const after = (await admin.from("profiles").select("credits").eq("id", A.id).single()).data.credits;
  check("user cannot change own credits", after === 50, `error=${up.error?.code ?? "none"} credits=${after}`);
  const nm = await A.c.from("profiles").update({ display_name: "Renamed" }).eq("id", A.id).select();
  check("user can change own display name", nm.data?.[0]?.display_name === "Renamed", nm.error?.message);
  const rpc = await A.c.rpc("grant_credits", { p_user_id: A.id, p_amount: 1000, p_reason: "purchase", p_ref_id: "hack" });
  check("user cannot call grant_credits", !!rpc.error, rpc.error?.code);
  const rpc2 = await A.c.rpc("spend_credits", { p_user_id: B.id, p_amount: 10, p_ref_id: "x" });
  check("user cannot call spend_credits", !!rpc2.error, rpc2.error?.code);
  // generation owned by B, created by server
  const g = await admin.from("generations").insert({ user_id: B.id, kind: "image", mode: "text", model: "test", prompt: "p", final_prompt: "p", cost: 2 }).select().single();
  check("server can insert generation", !g.error, g.error?.message);
  const ga = await A.c.from("generations").select("*").eq("id", g.data.id);
  check("user A cannot read B's generation", ga.data?.length === 0);
  const gd = await A.c.from("generations").delete().eq("id", g.data.id).select();
  check("user A cannot delete B's generation", (gd.data?.length ?? 0) === 0);
  const gi = await A.c.from("generations").insert({ user_id: A.id, kind: "image", mode: "text", model: "t", prompt: "p", final_prompt: "p", cost: 0 });
  check("user cannot insert generations directly", !!gi.error, gi.error?.code);
  const fav = await A.c.from("favorites").insert({ user_id: A.id, generation_id: g.data.id });
  check("user cannot favourite someone else's generation", !!fav.error, fav.error?.code);
  const gb = await B.c.from("generations").select("*").eq("id", g.data.id);
  check("user B reads own generation", gb.data?.length === 1);
  const favB = await B.c.from("favorites").insert({ user_id: B.id, generation_id: g.data.id });
  check("user B can favourite own generation", !favB.error, favB.error?.message);
  // public view
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  let pv = await anon.from("public_generations").select("*").eq("id", g.data.id);
  check("private generation hidden from public view", pv.data?.length === 0, pv.error?.message);
  await admin.from("generations").update({ is_public: true, share_slug: "t" + stamp, status: "succeeded" }).eq("id", g.data.id);
  pv = await anon.from("public_generations").select("*").eq("id", g.data.id);
  check("public generation visible to signed-out visitors", pv.data?.length === 1 && pv.data[0].creator_name === "Test b" && !("cost" in pv.data[0]) && !("user_id" in pv.data[0]), pv.error?.message);
  const direct = await anon.from("generations").select("*");
  check("signed-out visitors cannot read generations table", (direct.data?.length ?? 0) === 0);
  // refund exactly once
  const r1 = await admin.rpc("refund_generation", { p_generation_id: g.data.id });
  const r2 = await admin.rpc("refund_generation", { p_generation_id: g.data.id });
  const bc = (await admin.from("profiles").select("credits").eq("id", B.id).single()).data.credits;
  check("refund happens exactly once", r1.data === true && r2.data === false && bc === 52, `credits=${bc}`);
  // concurrent spend: A has 50, 10 parallel spends of 30 → exactly 1 succeeds
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => admin.rpc("spend_credits", { p_user_id: A.id, p_amount: 30, p_ref_id: "par" + i })));
  const ok = res.filter((r) => !r.error).length, insuff = res.filter((r) => r.error?.message.includes("insufficient_credits")).length;
  const ac = (await admin.from("profiles").select("credits").eq("id", A.id).single()).data.credits;
  check("10 parallel spends: exactly 1 succeeds, balance never negative", ok === 1 && insuff === 9 && ac === 20, `ok=${ok} insufficient=${insuff} credits=${ac}`);
  // purchase idempotency
  const p1 = await admin.rpc("grant_credits", { p_user_id: A.id, p_amount: 100, p_reason: "purchase", p_ref_id: "cs_test_" + stamp });
  const p2 = await admin.rpc("grant_credits", { p_user_id: A.id, p_amount: 100, p_reason: "purchase", p_ref_id: "cs_test_" + stamp });
  check("same purchase credited only once", p1.data === 120 && p2.data === 120, `first=${p1.data} second=${p2.data}`);
  // stale-job sweeper: a video stuck for 20 minutes is failed and refunded; a fresh one is left alone
  await admin.from("profiles").update({ credits: 100 }).eq("id", B.id);
  const oldTs = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const stuck = (await admin.rpc("create_generations", { p_user_id: B.id, p_count: 1, p_kind: "video", p_mode: "text", p_model: "t", p_prompt: "p", p_final_prompt: "p", p_preset_id: null, p_params: {}, p_input_paths: [], p_cost_each: 16, p_parent_id: null })).data[0];
  const fresh = (await admin.rpc("create_generations", { p_user_id: B.id, p_count: 1, p_kind: "video", p_mode: "text", p_model: "t", p_prompt: "p", p_final_prompt: "p", p_preset_id: null, p_params: {}, p_input_paths: [], p_cost_each: 16, p_parent_id: null })).data[0];
  await admin.from("generations").update({ status: "running", created_at: oldTs }).eq("id", stuck.id);
  await admin.rpc("fail_stale_generations");
  const [s1row, s2row] = await Promise.all([stuck, fresh].map(async (g) => (await admin.from("generations").select("status,refunded").eq("id", g.id).single()).data));
  const bAfter = (await admin.from("profiles").select("credits").eq("id", B.id).single()).data.credits;
  check("sweeper fails and refunds a stuck video, leaves a fresh one", s1row.status === "failed" && s1row.refunded && s2row.status === "queued" && bAfter === 84, `credits=${bAfter}`);
  // storage: A cannot upload into B's folder
  const blob = new Blob([new Uint8Array([137,80,78,71])], { type: "image/png" });
  const s1 = await A.c.storage.from("inputs").upload(`${A.id}/t.png`, blob);
  const s2 = await A.c.storage.from("inputs").upload(`${B.id}/t.png`, blob);
  check("user can upload to own inputs folder", !s1.error, s1.error?.message);
  check("user cannot upload to another user's folder", !!s2.error);
  const s3 = await A.c.storage.from("outputs").upload(`${A.id}/t.png`, blob);
  check("user cannot write to outputs bucket", !!s3.error);
  await admin.storage.from("inputs").remove([`${A.id}/t.png`]);
} catch (e) { fail++; console.log("ERROR", e.message ?? e); }
finally {
  for (const id of users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) console.log("cleanup failed", id, error.message); }
  const left = await admin.from("profiles").select("id").in("id", users);
  console.log(`cleanup: test users deleted, leftover profiles=${left.data?.length}`);
  console.log(`\n${pass} passed, ${fail} failed`);
}
