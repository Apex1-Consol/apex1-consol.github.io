// doc-check: rule-based check of ONE hand-over evidence file (no AI, zero credits).
// POPIA: organisational gates only (C1-C3, Q1-Q4, W1, W2, W4, D1, D3-D5, S1, S4, S6). Learner, facilitator and mentor
// documents (L*, D2, W3, H*) are refused before anything is downloaded. The PDF text is read in memory only and never
// stored or sent anywhere; only verdict, reason, method and time are saved (handoff_doc_checks) and logged (handoff_events).
// Advice only: Compliance still verifies.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Rule = { need: string[][]; sign?: boolean; expiry?: boolean };
const RULES: Record<string, Rule> = {
  c1: { need: [["memorandum of understanding", "service level agreement", "mou", "sla"]], sign: true },
  c2: { need: [["skills development levy", "sdl", "levy"]] },
  c3: { need: [["objective", "target"]] },
  q1: { need: [["saqa"], ["qualification", "registered", "registration"]] },
  q2: { need: [["accreditation", "accredited"], ["qcto", "seta", "quality council"]], expiry: true },
  q3: { need: [["government gazette", "gazette", "extension"]] },
  q4: { need: [["learnership"], ["registration", "registered"]], expiry: true },
  w1: { need: [["workplace"], ["approval", "approved"]], expiry: true },
  w2: { need: [["memorandum of understanding", "mou", "agreement"], ["workplace", "host employer", "employer"]], sign: true },
  w4: { need: [["coida", "compensation for occupational"], ["uif", "unemployment insurance"], ["occupational health and safety", "ohs"]], sign: true },
  d1: { need: [["learning material", "learner guide", "material"], ["register"]] },
  d3: { need: [["implementation plan", "implementation schedule", "project plan"]] },
  d4: { need: [["assessment"], ["instrument", "logbook", "log book", "poe", "portfolio"]] },
  d5: { need: [["occupational health and safety", "ohs", "health and safety"], ["audit", "inspection"]], expiry: true },
  s1: { need: [["seta"], ["submission", "diary", "submitted"]] },
  s4: { need: [["tracking", "tracker"], ["trainee", "learner"]] },
  s6: { need: [["12h", "12 h", "section 12"], ["tax", "allowance", "sars"]] },
};
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const has = (t: string, w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}([^a-z0-9]|$)`).test(t);
function toDate(s: string): string | null {
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/); if (m && MON.includes(m[2])) return iso(+m[3], MON.indexOf(m[2]) + 1, +m[1]);
  m = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/); if (m && MON.includes(m[1])) return iso(+m[3], MON.indexOf(m[1]) + 1, +m[2]);
  return null;
}
const iso = (y: number, mo: number, d: number) => (y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") || "";
    const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser(); if (!u?.user) return json({ ok: false, error: "Please sign in again." }, 401);
    const { programme_id, gate } = await req.json().catch(() => ({}));
    const g = String(gate || "").toLowerCase(), rule = RULES[g];
    if (!rule) return json({ ok: false, error: "Not checked automatically: only organisational documents are checked (never learner, facilitator or mentor documents)." }, 400);
    // RLS decides whether this user may see the file.
    const { data: doc } = await user.from("programme_documents").select("id,tenant_id,file_path,file_name").eq("programme_id", Number(programme_id)).eq("doc_type", "gate_" + g).order("id", { ascending: false }).limit(1).maybeSingle();
    if (!doc) return json({ ok: false, error: "No file attached to this gate." }, 404);
    const { data: prog } = await admin.from("programmes").select("end_date").eq("id", Number(programme_id)).maybeSingle();
    const today = new Date().toISOString().slice(0, 10), end = prog?.end_date || null;
    let verdict = "ok", pages = 0; const reasons: string[] = [];
    const file = await admin.storage.from("programme-documents").download(doc.file_path);
    if (file.error || !file.data) return json({ ok: false, error: "Could not open the file." }, 500);
    const buf = new Uint8Array(await file.data.arrayBuffer());
    if (buf.length > 10485760) reasons.push("file too large to check: check by eye");
    else if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") reasons.push("not a PDF: check by eye");
    else {
      const pdf = await getDocumentProxy(buf); pages = pdf.numPages;
      const { text } = await extractText(pdf, { mergePages: true });
      const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
      if (t.replace(/[^a-z]/g, "").length < 40) reasons.push("scanned image only (no text layer): check by eye");
      else {
        for (const grp of rule.need) if (!grp.some(w => has(t, w))) reasons.push(`does not mention "${grp[0]}"`);
        if (rule.sign && !/(signed|signature|signatory)/.test(t)) reasons.push("no signature wording found");
        if (rule.expiry) {
          const ex = [...t.matchAll(/(expir[a-z]*|valid until|valid to|valid till|validity)[^.]{0,60}/g)].map(m => toDate(m[0])).filter(Boolean) as string[];
          if (ex.length) { const d = ex.sort()[ex.length - 1];
            if (d < today) reasons.push(`expired ${d}`); else if (end && d < end) reasons.push(`expires ${d}, before the programme ends ${end}`); }
        }
      }
    }
    if (reasons.length) verdict = "check";
    const reason = verdict === "ok" ? `Looks right${pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : ""}` : reasons.join("; ");
    const row = { tenant_id: doc.tenant_id, programme_id: Number(programme_id), gate: g, document_id: doc.id, verdict, reason, method: "rules", checked_by: u.user.email };
    await admin.from("handoff_doc_checks").insert(row);
    await admin.from("handoff_events").insert({ programme_id: Number(programme_id), tenant_id: doc.tenant_id, kind: "doc_check", actor: u.user.id, actor_email: u.user.email,
      detail: `${g.toUpperCase()} automatic check (rules): ${verdict === "ok" ? "Looks right" : "Check: " + reason}` });
    return json({ ok: true, gate: g, verdict, reason, method: "rules" });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
});
