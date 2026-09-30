// End-to-end checks for voiceover (TTS) and dictation (speech-to-text) as a real signed-in user.
// Needs `pnpm dev` running. Uses OpenAI (a fraction of a cent). Run: pnpm test:voice
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.env.APP_URL ?? "http://localhost:3000"; // APP_URL=https://… to test a deployment
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// MP3 duration from frame headers (MPEG Layer III), to check the audio isn't cut short.
function mp3Duration(b) {
  let i = 0, secs = 0;
  if (b.subarray(0, 3).toString() === "ID3") i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  const br = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const sr = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  while (i + 4 < b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    const rate = sr[ver]?.[sri], kbps = br[ver === 3 ? 1 : 2][bri];
    if (!rate || !kbps) { i++; continue; }
    const spf = ver === 3 ? 1152 : 576;
    secs += spf / rate; i += Math.floor((spf / 8) * kbps * 1000 / rate) + pad;
  }
  return secs;
}
const email = `oneshot-voice-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const uid = u.user.id;
try {
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const credits = async () => (await admin.from("profiles").select("credits").eq("id", uid).single()).data.credits;
  const post = (body) => fetch(APP + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });

  let r = await post({ kind: "voice", prompt: "x".repeat(4001), voice: "marin", style: "natural" });
  check("script over 4,000 characters rejected", r.status === 400);
  r = await post({ kind: "voice", prompt: "Hello", voice: "robot", style: "natural" });
  check("unknown voice rejected", r.status === 400);

  // A realistic script: the model skips verbatim-repeated sentences, so repeated filler would under-read.
  const script = `Welcome to OneShot, the studio where a single idea becomes a finished shot. Type a sentence, or simply say it out loud, and within seconds you'll have an image worth sharing. Want motion? Turn that image into a cinematic clip with sound, complete with a slow push-in, an orbit, or a sweeping crane move. Need a voice? Write a short script, pick from eight natural-sounding voices, and choose a style that fits: a calm narrator for a documentary, an upbeat host for a product launch, or a dramatic trailer voice for something bigger. Everything you make is saved to your library, ready to download, remix, or share with the world. There are no complicated settings to learn and no prompt engineering required. Presets handle the craft for you, so you can focus on the story. Start with fifty free credits, and when you need more, top up in seconds. OneShot. One prompt. Finished shot.`;
  r = await post({ kind: "voice", prompt: script, voice: "cedar", style: "narrator" });
  const body = await r.json();
  const id = body.generations?.[0]?.id;
  const expected = 2 * Math.ceil(script.trim().length / 1000);
  check("voice job created (202)", r.status === 202 && !!id, body.error ?? `${script.trim().length} chars`);
  check(`charged ${expected} credits (2 per 1,000 chars, rounded up)`, (await credits()) === 50 - expected);

  let row;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    row = (await admin.from("generations").select("status,error,output_paths,created_at,completed_at").eq("id", id).single()).data;
    if (row.status === "succeeded" || row.status === "failed") break;
  }
  const secs = row.completed_at ? ((new Date(row.completed_at) - new Date(row.created_at)) / 1000).toFixed(1) : "?";
  check("voiceover finished", row.status === "succeeded", `${row.status} in ${secs}s ${row.error ?? ""}`);
  if (row.status === "succeeded") {
    const { data: file } = await admin.storage.from("outputs").download(row.output_paths[0]);
    const buf = Buffer.from(await file.arrayBuffer());
    const isMp3 = buf.subarray(0, 3).toString() === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    check("MP3 saved to storage", row.output_paths[0].endsWith(".mp3") && isMp3 && file.type === "audio/mpeg", `${(buf.length / 1024).toFixed(0)} KB`);
    const seconds = mp3Duration(buf), words = script.split(/\s+/).length, wpm = words / (seconds / 60);
    check("whole script was read (normal speaking pace)", wpm > 100 && wpm < 230, `${words} words in ${seconds.toFixed(1)}s = ${wpm.toFixed(0)} wpm`);
  }

  // Dictation
  const sample = readFileSync("public/voices/nova.mp3");
  const form = () => { const f = new FormData(); f.append("audio", new Blob([sample], { type: "audio/mpeg" }), "clip.mp3"); return f; };
  r = await fetch(APP + "/api/transcribe", { method: "POST", body: form() });
  check("dictation requires sign-in", r.status === 401);
  const bad = new FormData(); bad.append("audio", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  r = await fetch(APP + "/api/transcribe", { method: "POST", headers: { cookie }, body: bad });
  check("non-audio upload rejected", r.status === 415);
  r = await fetch(APP + "/api/transcribe", { method: "POST", headers: { cookie }, body: form() });
  const tb = await r.json();
  check("dictation transcribes speech", r.status === 200 && /one[\s-]?shot/i.test(tb.text ?? "") && /script/i.test(tb.text ?? ""), JSON.stringify(tb.text ?? tb.error));
  check("dictation is free", (await credits()) === 50 - expected);
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  const { data: files } = await admin.storage.from("outputs").list(uid);
  if (files?.length) await admin.storage.from("outputs").remove(files.map((f) => `${uid}/${f.name}`));
  await admin.auth.admin.deleteUser(uid);
  console.log(`cleanup done\n${pass} passed, ${fail} failed`);
}
