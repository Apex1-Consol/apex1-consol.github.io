// fam-relay: stateless relay between the FAM front end and ClickUp (FAM Preview folder).
// Stores and logs nothing. Each row is one ClickUp task; the row is kept as JSON in the
// folder-level "FAM Data" text field. ID numbers and bank details never come here.
// To move to another backend: reimplement verifyCaller() and keep the same actions.
import { createClient } from "npm:@supabase/supabase-js@2";

const CU = "https://api.clickup.com/api/v2";
const FIELD = "8f0fb50f-2b77-421e-b3f0-3d7a4f399db7"; // FAM Data
const LISTS: Record<string, string> = {
  assessors: "1200620000017233",
  fam_seta_registrations: "1200620000017234",
  fam_registration_scope: "1200620000017235",
  fam_documents: "1200620000017236",
  fam_follow_ups: "1200620000017237",
  fam_quality: "1200620000017238",
};
const WRITERS_ONLY_READ = new Set(["fam_quality"]);
const NEVER = ["id_number", "bank_account", "bank_account_last4", "bank_name", "tax_number", "vat_number"];
const ORIGINS = ["https://apex1-consol.github.io"];

const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.includes(o) ? o : ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});

// The only place that knows about Supabase auth. Returns null if not signed in.
async function verifyCaller(token: string) {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [{ data: user }, t, w, a] = await Promise.all([
    sb.auth.getUser(token), sb.rpc("auth_tenant_id"), sb.rpc("auth_is_fam_writer"), sb.rpc("auth_is_fam_admin"),
  ]);
  if (!user?.user || !t.data) return null;
  return { user: user.user.email || "", tenant: String(t.data), writer: !!w.data, admin: !!a.data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function cu(path: string, init: RequestInit = {}, tries = 3): Promise<any> {
  const r = await fetch(CU + path, {
    ...init,
    headers: { Authorization: Deno.env.get("CLICKUP_FAM_TOKEN")!, "Content-Type": "application/json" },
  });
  if (r.status === 429 && tries > 0) {
    const reset = Number(r.headers.get("x-ratelimit-reset") || 0) * 1000 - Date.now();
    await sleep(Math.min(Math.max(reset, 2000), 30000));
    return cu(path, init, tries - 1);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ClickUp ${r.status}: ${body.err || body.ECODE || "error"}`);
  return body;
}

const clean = (row: any) => { const o = { ...row }; for (const k of NEVER) delete o[k]; delete o._t; return o; };
const label = (t: string, r: any) => ({
  assessors: () => r.full_name || `Practitioner ${r.id}`,
  fam_seta_registrations: () => `#${r.assessor_id} ${r.seta_name || ""} ${r.role || ""} ${r.registration_number || ""}`,
  fam_registration_scope: () => `Reg ${r.registration_id} · ${r.qualification_id}`,
  fam_documents: () => `#${r.assessor_id} ${r.doc_type || "Document"} v${r.version || 1}`,
  fam_follow_ups: () => `#${r.assessor_id} ${r.kind || ""}: ${(r.notes || r.source_type || "").slice(0, 80)}`,
  fam_quality: () => `#${r.assessor_id} ${r.kind || ""} ${r.outcome || ""}`,
} as any)[t]().replace(/\s+/g, " ").trim().slice(0, 250);

function rowOf(task: any) {
  const f = (task.custom_fields || []).find((x: any) => x.id === FIELD);
  if (!f?.value) return null;
  try { return { ...JSON.parse(f.value), _t: task.id }; } catch { return null; }
}

async function listRows(table: string) {
  const out: any[] = [];
  for (let page = 0; page < 50; page++) {
    const b = await cu(`/list/${LISTS[table]}/task?include_closed=true&subtasks=false&page=${page}`);
    for (const t of b.tasks || []) { const r = rowOf(t); if (r) out.push(r); }
    if (b.last_page !== false || !(b.tasks || []).length) break;
  }
  return out;
}

async function createRow(table: string, row: any) {
  const t = await cu(`/list/${LISTS[table]}/task`, {
    method: "POST",
    body: JSON.stringify({ name: label(table, row), custom_fields: [{ id: FIELD, value: JSON.stringify(clean(row)) }] }),
  });
  return { ...clean(row), _t: t.id };
}

const DEFAULTS: Record<string, any> = {
  fam_documents: { status: "Missing", is_current: true, version: 1 },
  fam_follow_ups: { status: "Open" },
  fam_seta_registrations: { status: "Active" },
};

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  const send = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: h });
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const me = token ? await verifyCaller(token) : null;
    if (!me) return send({ ok: false, reason: "not_signed_in" }, 401);
    if (!Deno.env.get("CLICKUP_FAM_TOKEN")) return send({ ok: false, reason: "not_connected" });
    const { action, table, rows, offset } = await req.json();
    if (action !== "ping" && !LISTS[table]) return send({ ok: false, reason: "unknown_table" }, 400);
    const mine = (r: any) => r && r.tenant_id === me.tenant;

    if (action === "ping") return send({ ok: true, writer: me.writer, admin: me.admin });

    if (action === "list") {
      if (WRITERS_ONLY_READ.has(table) && !me.writer) return send({ ok: true, rows: [] });
      return send({ ok: true, rows: (await listRows(table)).filter(mine) });
    }

    if (!me.writer) return send({ ok: false, reason: "read_only" }, 403);

    if (action === "insert") {
      const have = await listRows(table);
      let next = have.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      const now = new Date().toISOString(), out = [];
      for (const r of rows as any[]) {
        const row = { ...DEFAULTS[table], created_at: now, ...r, id: r.id ?? next++, tenant_id: me.tenant };
        if ("owner_email" in row || ["assessors", "fam_documents", "fam_seta_registrations"].includes(table)) row.owner_email ??= me.user;
        if (table === "fam_follow_ups" || table === "fam_quality") row.created_by ??= me.user;
        out.push(await createRow(table, row));
      }
      return send({ ok: true, rows: out });
    }

    if (action === "update") {
      const out = [];
      for (const r of rows as any[]) {
        const task = await cu(`/task/${r._t}`), cur = rowOf(task);
        if (task.list?.id !== LISTS[table] || !mine(cur)) return send({ ok: false, reason: "not_found" }, 404);
        const row = { ...cur, ...clean(r), id: cur!.id, tenant_id: me.tenant, updated_at: new Date().toISOString() };
        await cu(`/task/${r._t}/field/${FIELD}`, { method: "POST", body: JSON.stringify({ value: JSON.stringify(clean(row)) }) });
        await cu(`/task/${r._t}`, { method: "PUT", body: JSON.stringify({ name: label(table, row) }) });
        out.push({ ...clean(row), _t: r._t });
      }
      return send({ ok: true, rows: out });
    }

    // One-time copy of this tenant's preview rows into ClickUp. Admin only. Safe to re-run:
    // ids already in ClickUp are skipped. Call with offset 0, then the returned next until done.
    if (action === "import") {
      if (!me.admin) return send({ ok: false, reason: "admin_only" }, 403);
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const from = Number(offset) || 0, n = 40;
      const { data, error } = await svc.from(table).select("*").eq("tenant_id", me.tenant).order("id").range(from, from + n - 1);
      if (error) throw new Error(error.message);
      const have = new Set((await listRows(table)).map((r) => String(r.id)));
      let made = 0;
      for (const r of data || []) {
        if (table === "assessors" && r.id_number) {
          await svc.from("fam_private").upsert({ assessor_id: r.id, tenant_id: me.tenant, id_number: r.id_number }, { onConflict: "assessor_id" });
        }
        if (have.has(String(r.id))) continue;
        await createRow(table, r); made++;
      }
      const done = (data || []).length < n;
      return send({ ok: true, made, next: done ? null : from + n });
    }

    return send({ ok: false, reason: "unknown_action" }, 400);
  } catch (e) {
    return send({ ok: false, reason: "error", message: String((e as Error).message || e) }, 500);
  }
});
