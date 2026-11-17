// handoff-record-pdf (v4, light): puts ApexOne's STORED hand-over record PDF into the ClickUp task's "Signed PDF" field.
// The PDF itself is made by handoff-record-store (light Helvetica, stored in bucket handoff-records). This function no
// longer renders anything (the old v6 IBM Plex renderer hit WORKER_RESOURCE_LIMIT on live). Called by pg_cron every
// minute with x-webhook-secret. A record without a stored copy yet is left for the next run (the claim simply expires).
// It never changes the task's status or anything else on the task. Trial hand-overs never reach ClickUp (outbox guard).
// Body (optional): {} process due records · {"probe_task": "<task id>"} read-only look at the task's Signed PDF field.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("CLICKUP_API_TOKEN");
const V2 = "https://api.clickup.com/api/v2", V3 = "https://api.clickup.com/api/v3";
const HANDOFF_LIST = "1200620000014666", FIELD_NAME = "Signed PDF", BUCKET = "handoff-records";
const MAX_ATTEMPTS = 6, MAX_PER_RUN = 3;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
const sha256Hex = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource)), x => x.toString(16).padStart(2, "0")).join("");

async function cu(url: string, init: RequestInit = {}) {
  if (!TOKEN) throw Error("CLICKUP_API_TOKEN not configured");
  const headers: Record<string, string> = { Authorization: TOKEN, ...(init.headers as Record<string, string> || {}) };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw Error(`ClickUp API ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const fileName = (recordNo: string, version: number) => `${recordNo}_handover_record_v${version}.pdf`;
const signedField = (task: any) => (task?.custom_fields || []).find((f: any) => f.name === FIELD_NAME && f.type === "attachment");
async function loadTask(taskId: string) {
  const t = await cu(`${V2}/task/${taskId}?include_subtasks=false`);
  if (String(t?.list?.id) !== HANDOFF_LIST) throw Error(`task ${taskId} is not in the PI → PM Handoff list`);
  const f = signedField(t);
  if (!f) throw Error(`task ${taskId} has no "${FIELD_NAME}" attachment field`);
  return { task: t, field: f };
}
async function uploadToField(taskId: string, teamId: string, fieldId: string, name: string, pdf: Uint8Array) {
  const fd = new FormData();
  fd.append("attachment", new Blob([pdf as BlobPart], { type: "application/pdf" }), name);
  fd.append("filename", name);
  const up = await cu(`${V3}/workspaces/${teamId}/custom_fields/${fieldId}/attachments`, { method: "POST", body: fd });
  const id = up?.id ?? up?.attachment?.id ?? up?.data?.id ?? up?.attachments?.[0]?.id;
  if (!id) throw Error(`upload gave no attachment id: ${JSON.stringify(up).slice(0, 300)}`);
  let last = "";
  for (const body of [{ value: { add: [String(id)] } }, { value: [String(id)] }]) {
    try { await cu(`${V2}/task/${taskId}/field/${fieldId}`, { method: "POST", body: JSON.stringify(body) }); } catch (e) { last = String(e); continue; }
    const { field } = await loadTask(taskId);
    const hit = (field.value || []).find((a: any) => a.title === name && !a.deleted);
    if (hit) return String(hit.id);
  }
  throw Error(`file uploaded (${id}) but not set on the field: ${last || "value not visible after setting it"}`);
}

async function processOne(c: any) {
  const recordNo = String(c.record_no), version = Number(c.version), name = fileName(recordNo, version);
  const report = async (outcome: string, info: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc("handoff_record_report", { p_id: c.id, p_token: c.token, p_outcome: outcome, p_info: info });
    if (error) throw Error(`handoff_record_report: ${error.message}`);
    return data;
  };
  if (!c.storage_path) return { id: c.id, record: `${recordNo} v${version}`, action: "waiting_for_stored_copy" };
  try {
    const { task, field } = await loadTask(String(c.clickup_task_id));
    const { data, error } = await supabase.storage.from(BUCKET).download(c.storage_path);
    if (error || !data) throw Error(`stored PDF not readable: ${error?.message}`);
    const pdf = new Uint8Array(await data.arrayBuffer());
    if (c.pdf_sha256 && await sha256Hex(pdf) !== c.pdf_sha256) throw Error("stored PDF does not match its recorded SHA-256");
    const existing = (field.value || []).find((a: any) => a.title === name && !a.deleted);
    const attachment = existing ? String(existing.id) : await uploadToField(String(task.id), String(task.team_id), field.id, name, pdf);
    const r = await report("uploaded", { task_id: String(task.id), custom_id: task.custom_id || null, attachment });
    return { id: c.id, record: `${recordNo} v${version}`, task: task.custom_id || task.id, action: existing ? "already_attached" : "uploaded", result: r };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const permanent = c.attempts >= MAX_ATTEMPTS || /API 40[0134]|not in the PI|no "Signed PDF"/.test(msg);
    try { await report(permanent ? "failed" : "retry", { error: msg }); } catch (_) { /* claim lost */ }
    return { id: c.id, record: `${recordNo} v${version}`, action: permanent ? "failed" : "retrying", error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.probe_task) {
      const t = await cu(`${V2}/task/${encodeURIComponent(String(body.probe_task))}`);
      return json({ id: t.id, custom_id: t.custom_id, team_id: t.team_id, list: t.list?.id, status: t.status?.status, signed_pdf: signedField(t) ?? null });
    }
    const out: unknown[] = [], worker = `handoff-record-pdf:${crypto.randomUUID().slice(0, 8)}`;
    for (let i = 0; i < MAX_PER_RUN; i++) {
      const { data: c, error } = await supabase.rpc("handoff_record_next", { p_worker: worker, p_ttl_seconds: 180 });
      if (error) throw Error(`handoff_record_next: ${error.message}`);
      if (!c) break;
      const r: any = await processOne(c); out.push(r);
      if (r.action === "waiting_for_stored_copy") break;
    }
    return json({ processed: out.length, results: out });
  } catch (e) { return json({ error: String(e instanceof Error ? e.message : e) }, 500); }
});
