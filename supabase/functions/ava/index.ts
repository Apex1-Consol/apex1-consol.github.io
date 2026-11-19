import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handbookFor, handbookDirect } from "./handbook.ts";

// Ava: the ApexOne assistant. Signed-in users only (checked below). Free Gemini tier, so no
// personal data: the browser sends programme numbers, counts and flag labels,
// and ID numbers, emails and phone numbers are stripped again below.
// Shares the ai_usage daily caps with ai-generate (200 total, 60 for ava).
// "How ApexOne works" knowledge lives in handbook.ts (repo: supabase/functions/ava/).
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
const QCTO_SYSTEM_CONTEXT = `You are an AI assistant for ApexU, a South African QCTO-accredited training provider.
Terminology: SDP = Skills Development Provider, SETA = Sector Education and Training Authority,
EISA = External Integrated Summative Assessment, KMA = Key Monitoring Area (1-6),
PoE = Portfolio of Evidence, MOU = Memorandum of Understanding, PM = Project Manager.
KMA domains: 1=Programme Implementation, 2=Human Resources, 3=Assessment Strategy,
4=Progress on Implementation, 5=General Responsiveness, 6=E-learning (N/A if not applicable).
KMA scores: 1=Non-compliant, 2=Partially compliant, 3=Mostly compliant, 4=Fully compliant.
Overall Judgment scores: 1=Unacceptable, 2=Not Yet Adequate, 3=Adequate, 4=Outstanding.
Write professionally but clearly. Use South African English. Be specific with numbers.
Flag risks directly. Do not hedge or use filler.`;
function todaySAST(): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
}
// Numbers in the answer that appear nowhere in what the model was given (possible invented figures).
function checkNumbers(output: string, reference: string): string[] {
  const out: string[] = [];
  const norm = (x: string) => x.replace(",", ".").replace(/\.0+$/, "");
  const ref = new Set((reference.match(/\d+(?:[.,]\d+)?/g) || []).map(norm));
  for (const raw of output.replace(/\{\{\w+\}\}/g, " ").match(/\d+(?:[.,]\d+)?/g) || []) {
    const n = norm(raw);
    if (Number(n) <= 10 && !n.includes(".")) continue;
    if (!ref.has(n) && !out.includes(raw)) out.push(raw);
  }
  return out.slice(0, 20);
}
async function callGemini(prompt: string, systemInstruction: string, opts: { maxTokens?: number } = {}): Promise<string> {
  if (!GEMINI_API_KEY) throw Error("GEMINI_API_KEY not configured");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemInstruction }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: opts.maxTokens || 1400 } }),
    });
    if (res.status === 503 || res.status === 429) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1))); continue; }
      throw new HttpError(429, res.status === 429 ? "Ava is resting: the free AI quota is used up for now. Try again in a minute or tomorrow." : "The AI service is busy. Please try again in a minute.");
    }
    const body = await res.json();
    if (!res.ok) throw Error(`Gemini API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  }
  throw Error("Gemini API failed after retries");
}
async function checkAndLogUsage(userId: string, chars: number): Promise<string | null> {
  const sast = new Date(Date.now() + 2 * 3600000);
  const since = new Date(Date.UTC(sast.getUTCFullYear(), sast.getUTCMonth(), sast.getUTCDate()) - 2 * 3600000).toISOString();
  const { data, error } = await supabase.from("ai_usage").select("type").eq("user_id", userId).gte("created_at", since);
  if (!error) {
    const rows = data || [];
    if (rows.length >= 200) return "Daily AI limit reached (200 requests). It resets at midnight.";
    if (rows.filter((r: any) => r.type === "ava").length >= 60) return "You've asked Ava 60 questions today (free-tier limit). It resets at midnight.";
  }
  await supabase.from("ai_usage").insert({ user_id: userId, type: "ava", input_chars: chars });
  return null;
}

const AVA_GUIDE = `You are Ava, the built-in assistant of ApexOne, ApexU's training delivery and compliance system.
APEXONE PAGES (route key in braces; link a page by writing {{key}} exactly, e.g. {{qcto}}):
Overview: My work {{mywork}}, My Flow {{flow}}, My desk {{desk}} (admin), Dashboard {{dashboard}}, Consolidated view {{hoo}}.
Set-up: Clients {{clients}}, Accreditation {{accred}}, Programme Initiation {{pi}}, Hand-over {{handover}}, Programmes {{programmes}}, FAM Registry {{fam}}.
Learners: Learners {{learners}}, Data quality {{dq}}, Enrolments {{enrolments}}, Learner intake {{intake}}.
Delivery: PM Tracker {{pmtracker}}, Attendance & PoE {{attendance}}, QCTO Tracker {{qcto}}, Monitoring Visits {{visits}}, Recommendations {{recs}}.
Assessment & close-out: EISA Readiness {{eisa}}, Moderation & Verification {{modver}}, Report Generator {{reports}}.
Admin: Sign-off queue {{signoff}}, Data & Sync Health {{synchealth}}, Audit log {{audit}}, User management {{users}}.
RULES: Learners need a valid 13-digit SA ID (the admin /next/ version also accepts a passport number for new learners without one). Never put financial information (invoices, quotes, payments) in programmes, PM Tracker or hand-over documents. Legacy (SETA) programmes do not go through hand-over and have no QCTO tracker/EISA. Staff fix their own data in ApexOne. Ava explains and drafts; she never changes data or carries out tasks.
HOW TO ANSWER: Be short and practical (under 220 words unless asked). Lead with the answer. Use bullet points for steps or lists.
- Questions about what ApexOne is for, how a page, card, button, status or term works, or how the process runs: answer from the APEXONE HANDBOOK (accurate and current). Users misspell words (e.g. "clyckup" = ClickUp); answer what they meant.
- Numbers, programmes, learners, statuses: use ONLY the "ApexOne context"; never invent programmes, numbers, names or dates.
- If neither the handbook nor the context has the answer, say you don't have that information yet and point to the page most likely to have it. Never guess how a feature works.
Refer to programmes as #number. Link pages with {{key}}. Don't ask for or repeat ID numbers, emails or phone numbers. For QCTO/SETA rule questions answer from general knowledge but say when the user should confirm with QA.`;
const AVA_MODES: Record<string, string> = {
  ask: "Answer the user's question.",
  attention: "List what needs this user's attention, most urgent first: group by action, name the programmes (#number) and the page to fix it on. Maximum 7 bullets, then one line on what can wait.",
  brief: "Write a short management brief: 3-5 headline numbers, then the top 5 risks with programmes and pages, then 3 recommended next steps. Under 250 words.",
  page: "Explain the current page: what it is for, what each main part means, and the 3 most common things to do on it. Do not quote data.",
  draft: "Draft a short, polite follow-up message (email body) to the responsible person about the most urgent items in the context. Start with 'Hi [Name],' and leave [Name] as a placeholder. List the programmes (#number) and what is needed, and end with a request to update ApexOne.",
};
function avaClean(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max)
    .replace(/\b\d{13}\b/g, "[ID removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    .replace(/(?:\+27|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[phone removed]");
}
async function generateAva(body: any) {
  const mode = AVA_MODES[body.mode] ? body.mode : "ask";
  const question = avaClean(body.question, 800).trim();
  if (!question) throw new HttpError(400, "question required");
  const facts = avaClean(body.facts, 9000);
  const hist = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .map((m: any) => `${m?.r === "a" ? "Ava" : "User"}: ${avaClean(m?.t, 1200)}`).join("\n");
  const system = QCTO_SYSTEM_CONTEXT + "\n\n" + AVA_GUIDE + "\n\nTASK: " + AVA_MODES[mode] + `\nToday's date is ${todaySAST()} (South African time). Never invent dates that are not in the data.`;
  const hb = handbookFor(question, String(body.page || ""));
  const prompt = `APEXONE HANDBOOK:\n${hb}\n\nApexOne context (what this user can see right now):\n${facts || "(none)"}\n\n${hist ? `Conversation so far:\n${hist}\n\n` : ""}User: ${question}`;
  const answer = (await callGemini(prompt, system, { maxTokens: 1400 })).trim();
  return { answer, unverified: checkNumbers(answer, prompt + "\n" + system) };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function j(b: any, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, error: "POST required" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  let user: any = null;
  if (token) { const { data } = await authClient.auth.getUser(token); user = data?.user || null; }
  if (!user) return j({ ok: false, error: "Unauthorized" }, 401);
  try {
    const body = await req.json();
    const direct = (!body.mode || body.mode === "ask") ? handbookDirect(avaClean(body.question, 800)) : null;
    if (direct) return j({ ok: true, type: "ava", answer: direct, handbook: true });
    const cap = await checkAndLogUsage(user.id, String(body.facts || "").length + String(body.question || "").length);
    if (cap) return j({ ok: false, error: cap }, 429);
    const { answer, unverified } = await generateAva(body);
    return j({ ok: true, type: "ava", answer, ...(unverified.length ? { fact_check: { unverified_numbers: unverified } } : {}) });
  } catch (err) {
    console.error("ava error:", err);
    if (err instanceof HttpError) return j({ ok: false, error: err.message }, err.status);
    return j({ ok: false, error: "Ava could not answer right now. Please try again." }, 500);
  }
});
