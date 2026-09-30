// End-to-end checks for Stripe billing (test mode): checkout sessions, the signed webhook, idempotent
// fulfilment and the billing page's return check. No real money. Needs `pnpm dev` running. Run: pnpm test:billing
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const Stripe = require("stripe").default ?? require("stripe");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const users = [], customers = [];

async function signIn(tag) {
  const email = `oneshot-billing-${tag}-${Date.now()}@example.com`, pw = `Pw-${Date.now()}-x!`;
  const { data } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  users.push(data.user.id);
  const jar = new Map();
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.signInWithPassword({ email, password: pw });
  return { id: data.user.id, email, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
}
const credits = async (id) => (await admin.from("profiles").select("credits").eq("id", id).single()).data.credits;

function signedEvent(type, object, id = `evt_test_${Math.random().toString(36).slice(2)}`) {
  const payload = JSON.stringify({ id, object: "event", type, api_version: "2026-08-26.dahlia", created: Math.floor(Date.now() / 1000), data: { object } });
  return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}
const sendWebhook = ({ payload, header }) =>
  fetch(`${APP}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload });

try {
  const A = await signIn("a"), B = await signIn("b");
  const post = (u, body) => fetch(`${APP}/api/stripe/checkout`, { method: "POST", headers: { "Content-Type": "application/json", cookie: u.cookie }, body: JSON.stringify(body) });

  // Checkout
  let r = await fetch(`${APP}/api/stripe/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: "starter" }) });
  check("checkout requires sign-in", r.status === 401);
  r = await post(A, { pack: "mega" });
  check("unknown pack rejected", r.status === 400);
  r = await post(A, { pack: "creator" });
  const { url } = await r.json();
  check("checkout returns a Stripe Checkout URL", r.status === 200 && url?.startsWith("https://checkout.stripe.com/"), url?.slice(0, 40));
  const sessionId = url.match(/cs_test_[A-Za-z0-9]+/)?.[0];
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  customers.push(session.customer);
  check("session: $15, 350-credit Creator pack for this user, test mode",
    session.amount_total === 1500 && session.currency === "usd" && session.metadata.pack === "creator" && session.metadata.user_id === A.id && !session.livemode);
  check("success and cancel URLs return to /billing", session.success_url.includes("/billing?session_id={CHECKOUT_SESSION_ID}") && session.cancel_url.endsWith("/billing?canceled=1"));
  const profileCustomer = (await admin.from("profiles").select("stripe_customer_id").eq("id", A.id).single()).data.stripe_customer_id;
  const r2 = await post(A, { pack: "starter" });
  const s2 = await stripe.checkout.sessions.retrieve((await r2.json()).url.match(/cs_test_[A-Za-z0-9]+/)[0]);
  check("Stripe customer saved and reused", profileCustomer === session.customer && s2.customer === session.customer);

  // Returning from Stripe with an unpaid session adds nothing; nobody can claim another user's session.
  let page = await fetch(`${APP}/billing?session_id=${sessionId}`, { headers: { cookie: A.cookie } });
  check("return with unpaid session: page loads, no credits", page.status === 200 && (await credits(A.id)) === 50);
  page = await fetch(`${APP}/billing?session_id=${sessionId}`, { headers: { cookie: B.cookie } });
  check("another user's session is ignored", page.status === 200 && (await credits(B.id)) === 50);

  // Webhook
  r = await fetch(`${APP}/api/stripe/webhook`, { method: "POST", body: "{}" });
  check("webhook without signature → 400", r.status === 400);
  const paid = { id: `cs_test_paid_${Date.now()}`, object: "checkout.session", mode: "payment", payment_status: "paid", amount_total: 1500, client_reference_id: A.id, metadata: { user_id: A.id, pack: "creator", credits: "350" } };
  const good = signedEvent("checkout.session.completed", paid);
  r = await fetch(`${APP}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": good.header.replace(/v1=[a-f0-9]{8}/, "v1=00000000") }, body: good.payload });
  check("webhook with invalid signature → 400", r.status === 400);
  r = await sendWebhook(good);
  const body = await r.json();
  check("signed checkout.session.completed adds 350 credits", r.status === 200 && body.result === "fulfilled" && (await credits(A.id)) === 400, JSON.stringify(body));
  r = await sendWebhook(good);
  check("same event replayed → ignored, no extra credits", (await r.json()).duplicate === true && (await credits(A.id)) === 400);
  r = await sendWebhook(signedEvent("checkout.session.completed", paid));
  check("new event for the same session → no extra credits", (await r.json()).result === "already" && (await credits(A.id)) === 400);

  const paid2 = { ...paid, id: `cs_test_race_${Date.now()}` };
  const results = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(signedEvent("checkout.session.completed", paid2)).then((x) => x.json())));
  check("5 parallel deliveries for one session → credited exactly once", results.filter((x) => x.result === "fulfilled").length === 1 && (await credits(A.id)) === 750, `credits=${await credits(A.id)}`);

  r = await sendWebhook(signedEvent("checkout.session.completed", { ...paid, id: `cs_test_unpaid_${Date.now()}`, payment_status: "unpaid" }));
  check("unpaid session → no credits", (await r.json()).result === "unpaid" && (await credits(A.id)) === 750);
  r = await sendWebhook(signedEvent("customer.created", { id: "cus_x", object: "customer" }));
  check("unrelated event acknowledged and ignored", r.status === 200 && (await r.json()).ignored === "customer.created");

  const { data: purchases } = await admin.from("purchases").select("stripe_session_id, credits, amount_cents").eq("user_id", A.id);
  const { data: ledger } = await admin.from("credit_ledger").select("delta, reason").eq("user_id", A.id).eq("reason", "purchase");
  check("2 purchases and 2 ledger rows recorded", purchases.length === 2 && ledger.length === 2 && ledger.every((l) => l.delta === 350));

  // React separates adjacent text nodes with <!-- --> in server HTML; strip them before matching.
  const text = async (res) => (await res.text()).replaceAll("<!-- -->", "");
  page = await text(await fetch(`${APP}/billing`, { headers: { cookie: A.cookie } }));
  check("billing page shows balance, purchases and history", page.includes("750") && page.includes("Creator · 350 credits") && page.includes("Credit purchase") && page.includes("Welcome credits"));
  page = await text(await fetch(`${APP}/billing?canceled=1`, { headers: { cookie: A.cookie } }));
  check("cancelled checkout: page loads, balance unchanged", page.includes("750") && (await credits(A.id)) === 750);
  const pricing = await fetch(`${APP}/pricing`);
  check("pricing page is public", pricing.status === 200 && (await pricing.text()).includes("Pay for what you create"));
} catch (e) { fail++; console.log("ERROR", e); }
finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  for (const c of customers) await stripe.customers.del(c).catch(() => {});
  console.log(`cleanup done (test users and Stripe test customers deleted)\n${pass} passed, ${fail} failed`);
}
