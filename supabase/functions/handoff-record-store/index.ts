// handoff-record-store: makes ApexOne's own copy of the hand-over record PDF as soon as a programme is handed over,
// without waiting for the ClickUp task.
//
// Called by pg_cron every minute (x-webhook-secret). For the newest record of each programme with no stored PDF it
// draws a light one-to-two page A4 record from the frozen snapshot (handoff_records.data) with pdf-lib's built-in
// Helvetica (the v6 IBM Plex layout in handoff-record-pdf exceeds the edge worker's compute limit on live), lists the
// documents attached to the gates, stamps TRIAL when the sign-off is a trial, stores it in the private bucket
// handoff-records under the name handoff-record-pdf uses, and records storage_path / pdf_sha256 / pdf_bytes / stored_at.
// handoff-record-pdf later sends this stored copy to ClickUp unchanged (it checks the SHA-256).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, degrees } from "npm:pdf-lib@1.17.1";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "handoff-records";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
const NAVY = rgb(0, 0.17, 0.36), GOLD = rgb(0.98, 0.86, 0), INK = rgb(0.1, 0.14, 0.2), MUTED = rgb(0.29, 0.33, 0.41), LINE = rgb(0.84, 0.85, 0.88), RED = rgb(0.71, 0.14, 0.09);
const W = 595.28, H = 841.89, L = 40, CW = W - 80;

// Helvetica is WinAnsi only: map common typography to ASCII and drop the rest.
const asc = (s: unknown) => String(s ?? "").replace(/[→]/g, "->").replace(/[·•]/g, "-").replace(/[–—]/g, "-")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7e -ÿ]/g, "");
const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
const fmt = (x: unknown) => {
  if (!has(x)) return "";
  const d = String(x).length <= 10 ? new Date(String(x) + "T12:00:00Z") : new Date(String(x));
  if (isNaN(+d)) return String(x);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map(q => [q.type, q.value]));
  return String(x).length <= 10 ? `${p.day} ${p.month} ${p.year}` : `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} SAST`;
};

async function sha256Hex(b: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
  return Array.from(h, x => x.toString(16).padStart(2, "0")).join("");
}

class Doc {
  page!: PDFPage; y = 0;
  constructor(public doc: PDFDocument, public f: PDFFont, public b: PDFFont, public foot: string) { this.newPage(); }
  newPage() { this.page = this.doc.addPage([W, H]); this.y = 50; this.page.drawText(asc(this.foot), { x: L, y: 22, size: 7.5, font: this.f, color: MUTED }); }
  need(h: number) { if (this.y + h > H - 50) this.newPage(); }
  wrap(s: string, w: number, font: PDFFont, size: number) {
    const out: string[] = [];
    for (const para of asc(s).split(/\n/)) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? cur + " " + word : word;
        if (!cur || font.widthOfTextAtSize(next, size) <= w) { cur = next; continue; }
        out.push(cur); cur = word;
        while (font.widthOfTextAtSize(cur, size) > w && cur.length > 1) { let i = cur.length; while (i > 1 && font.widthOfTextAtSize(cur.slice(0, i), size) > w) i--; out.push(cur.slice(0, i)); cur = cur.slice(i); }
      }
      out.push(cur);
    }
    return out;
  }
  text(s: string, x: number, size = 10, o: { bold?: boolean; color?: any; w?: number } = {}) {
    const font = o.bold ? this.b : this.f, lines = this.wrap(s, o.w ?? CW - (x - L), font, size), lh = size * 1.35;
    this.need(lines.length * lh);
    lines.forEach((l, i) => this.page.drawText(l, { x, y: H - this.y - size - i * lh, size, font, color: o.color ?? INK }));
    return lines.length * lh;
  }
  line(s: string, size = 10, o: { bold?: boolean; color?: any } = {}) { this.y += this.text(s, L, size, o); }
  h2(s: string) { this.y += 12; this.need(40); this.page.drawText(asc(s).toUpperCase(), { x: L, y: H - this.y - 10, size: 9.5, font: this.b, color: NAVY }); this.y += 15;
    this.page.drawRectangle({ x: L, y: H - this.y, width: CW, height: 0.8, color: LINE }); this.y += 6; }
  row(cells: string[], widths: number[], size = 9, o: { bold?: boolean; color?: any[] } = {}) {
    const font = o.bold ? this.b : this.f, lh = size * 1.35;
    const lines = cells.map((c, i) => this.wrap(c, widths[i] * CW - 8, font, size)), h = Math.max(1, ...lines.map(l => l.length)) * lh + 4;
    this.need(h); let x = L;
    lines.forEach((ls, i) => { ls.forEach((l, j) => this.page.drawText(l, { x, y: H - this.y - size - j * lh, size, font, color: (o.color && o.color[i]) || INK })); x += widths[i] * CW; });
    this.y += h;
  }
}

async function render(rec: any, docs: { gate: string; name: string }[], trial: boolean) {
  const p = rec.data || {}, d = p.doc || {}, prog = d.prog || {}, dt = d.details || {}, pack = d.pack || {}, sg = p.signatures || {};
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const f = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const recNo = rec.record_no || `HO-${String(rec.programme_id).padStart(6, "0")}`;
  const D = new Doc(pdf, f, b, `${recNo} v${rec.version} - ApexOne hand-over record. The ApexOne database is the source of truth; this PDF is a generated copy.`);
  // header band
  const pg = D.page;
  pg.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: NAVY });
  pg.drawRectangle({ x: L, y: H - 44, width: 22, height: 22, color: GOLD });
  pg.drawText("ApexU", { x: L + 30, y: H - 40, size: 16, font: b, color: rgb(1, 1, 1) });
  pg.drawText(asc(`${recNo}  v${rec.version}`), { x: W - L - b.widthOfTextAtSize(asc(`${recNo}  v${rec.version}`), 11), y: H - 38, size: 11, font: b, color: rgb(1, 1, 1) });
  pg.drawText("PI -> PM PROGRAMME HAND-OVER RECORD", { x: L, y: H - 64, size: 9, font: b, color: GOLD });
  const title = D.wrap(rec.programme_name || prog.qualification || `Programme ${rec.programme_id}`, CW, b, 14).slice(0, 2);
  title.forEach((t, i) => pg.drawText(t, { x: L, y: H - 82 - i * 17, size: 14, font: b, color: rgb(1, 1, 1) }));
  D.y = 128;
  const kv: [string, string][] = [["Client", prog.client || pack.client], ["Qualification", prog.qualification], ["SAQA ID", prog.saqa], ["NQF", prog.nqf],
    ["Learners", dt.learners], ["Project Manager", p.pm_name || dt.pm_name], ["Programme type", [dt.qual_type, dt.learnership_type].filter(has).join(" - ")],
    ["Venue", dt.venue], ["Start date", fmt((d.dates || {}).start || rec.start_date)], ["Handed over", fmt(p.handed_over_at || rec.handed_over_at)]];
  for (const [k, v] of kv) { if (!has(v)) continue; D.text(k, L, 9, { color: MUTED, w: 120 }); D.y += D.text(String(v), L + 125, 9.5, { w: CW - 125 }); }
  D.h2("Approval chain");
  D.row(["Step", "Signed by", "When", "Record"], [0.3, 0.27, 0.28, 0.15], 8.5, { bold: true });
  for (const [k, t] of [["pi", "1 - Programme Initiator"], ["compliance", "2 - Compliance Officer"], ["ops", "3 - Head of Operations & HR"]]) {
    const s = sg[k]; D.row([t, s ? `${s.name || ""} (${s.email || ""})` : "Not signed", s ? fmt(s.at) : "", s ? String(s.hash || "").slice(0, 8) : ""], [0.3, 0.27, 0.28, 0.15], 9);
  }
  D.h2("Compliance result");
  const na = Object.keys(p.not_applicable || {}).length;
  D.line(`${p.verified ?? 0} of ${p.applicable ?? 0} applicable gates verified - ${na} not applicable - ${(p.open_risks || []).length} open risk(s).`, 10, { bold: true });
  D.h2("Key deadlines");
  if ((p.deadlines || []).length) { D.row(["Milestone", "Due", "Basis"], [0.35, 0.18, 0.47], 8.5, { bold: true });
    for (const x of p.deadlines) D.row([x.label || x.gate || "", has(x.due) ? fmt(x.due) : "Not set", x.rule || x.need || ""], [0.35, 0.18, 0.47], 9); }
  else D.line("No statutory deadlines apply.", 9.5);
  D.h2("Open risks");
  if ((p.open_risks || []).length) for (const r of p.open_risks) D.row([r.title || "", r.severity || "", r.owner || ""], [0.6, 0.15, 0.25], 9);
  else D.line("No open risks.", 9.5);
  D.h2("Hand-over notes");
  D.line(has(pack.handover_notes) ? pack.handover_notes : "None recorded.", 9.5);
  D.h2(`Documents attached to the gates (${docs.length})`);
  if (docs.length) for (const x of docs) D.row([x.gate.toUpperCase(), x.name], [0.08, 0.92], 8.5);
  else D.line("No files attached in ApexOne.", 9.5);
  D.h2("Integrity");
  D.line(`Signed record fingerprint (Head of Ops): ${p.record_hash || "-"}`, 8.5, { color: MUTED });
  D.line(`Snapshot SHA-256: ${rec.record_sha256 || "-"}`, 8.5, { color: MUTED });
  D.line("Approved electronically in ApexOne. Each signature covers the pack, evidence, verifications and risks at the moment it was given.", 8.5, { color: MUTED });
  if (trial) for (const pp of pdf.getPages()) {
    pp.drawText("TRIAL - NOT A REAL HAND-OVER", { x: W * 0.1, y: H * 0.28, size: 34, font: b, color: RED, opacity: 0.18, rotate: degrees(40) });
    pp.drawRectangle({ x: 0, y: 0, width: W, height: 14, color: RED });
    pp.drawText("TRIAL RUN - demo documents; some signatures entered for testing. Not a real hand-over.", { x: L, y: 4, size: 7.5, font: b, color: rgb(1, 1, 1) });
  }
  pdf.setTitle(`${recNo} hand-over record v${rec.version}`); pdf.setAuthor("ApexOne"); pdf.setProducer("ApexOne handoff-record-store");
  if (has(p.handed_over_at)) { pdf.setCreationDate(new Date(p.handed_over_at)); pdf.setModificationDate(new Date(p.handed_over_at)); }
  return await pdf.save({ useObjectStreams: true });
}

Deno.serve(async (req) => {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== Deno.env.get("WEBHOOK_SECRET")) return new Response("Unauthorized", { status: 401 });
  const { data: recs, error } = await supabase.from("handoff_records").select("id, programme_id, tenant_id, version, record_no, data, record_sha256, programme_name, start_date, handed_over_at, storage_path")
    .order("programme_id").order("version", { ascending: false }).limit(200);
  if (error) return json({ error: error.message }, 500);
  const latest = new Map<number, any>();
  for (const r of recs || []) if (!latest.has(r.programme_id)) latest.set(r.programme_id, r);
  const out: unknown[] = [];
  for (const r of latest.values()) {
    if (r.storage_path) continue;
    try {
      const { data: so } = await supabase.from("handoff_signoffs").select("trial_note").eq("programme_id", r.programme_id).maybeSingle();
      const { data: dd } = await supabase.from("programme_documents").select("doc_type, file_name").eq("programme_id", r.programme_id).like("doc_type", "gate\\_%").order("id");
      const docs = (dd || []).map((x: any) => ({ gate: String(x.doc_type).slice(5), name: x.file_name }));
      const pdf = await render(r, docs, !!so?.trial_note);
      const sha = await sha256Hex(pdf), path = `${r.programme_id}/${r.record_no}_handover_record_v${r.version}.pdf`;
      const up = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw Error(`store: ${up.error.message}`);
      const { error: e2 } = await supabase.from("handoff_records").update({ storage_path: path, pdf_sha256: sha, pdf_bytes: pdf.length, stored_at: new Date().toISOString() })
        .eq("id", r.id).is("storage_path", null);
      if (e2) throw Error(`record: ${e2.message}`);
      await supabase.from("handoff_events").insert({ programme_id: r.programme_id, tenant_id: r.tenant_id, kind: "record",
        detail: `Hand-over record ${r.record_no} v${r.version} PDF generated and stored in ApexOne (SHA-256 ${sha.slice(0, 12)})${so?.trial_note ? " · marked TRIAL" : ""}` });
      out.push({ id: r.id, stored: path, bytes: pdf.length });
    } catch (e) {
      out.push({ id: r.id, error: String(e instanceof Error ? e.message : e) });
    }
  }
  return json({ stored: out });
});
