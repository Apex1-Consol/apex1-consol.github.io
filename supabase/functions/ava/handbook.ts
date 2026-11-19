// ApexOne handbook for Ava. Source of truth for "how ApexOne works" answers.
// Facts only, from the app's code and Stavros's decisions. No personal data, no live numbers.
// Every page in the menu must have an entry (checked by preview/tests/ava-handbook.test.js).
// Ava gets: OVERVIEW always + the current page's entry + up to 3 best-matching page entries + the full glossary.

export const OVERVIEW = `ABOUT APEXONE: ApexOne is ApexU's (Apex Academy's) own web app for running occupational training programmes from first sale to close-out, as a QCTO-accredited Skills Development Provider (SDP) that also runs legacy SETA programmes. It replaces scattered spreadsheets: one place where every programme, learner, register, result, monitoring visit, FAM practitioner and sign-off lives, with each person seeing their own to-do list (My work) built from live data. Data sits in a secure Supabase database; changes to programmes, learners, attendance, results, FAM records and other records that have a matching ClickUp task are also sent to that task automatically. Ava (this assistant) explains pages and drafts text; she never changes data or carries out tasks.
LIFECYCLE: Client and accreditation check > Programme Initiation (PI specialist) > hand-over sign-off (Compliance, Head of Ops) > PM accepts > learners enrolled > delivery: registers, PoE, modules, monitoring visits, recommendations > results and QCTO tracker (SoR > EISA booking > EISA outcome) > moderation and exit verification > monthly client reports > close-out.
ROLES: Project manager (PM) runs programmes; QA / ETQA specialist runs moderation, verification and quality reviews; Programme Initiation (PI) specialist sets up new programmes; FAM / OHS specialist keeps the FAM Registry; Recruitment fills places (Learner intake); Operations / Head of Ops oversees and signs off; Admin manages users and system health. Admins can "View as" another role on My work.
VERSIONS: /preview/ is the live ApexOne all staff use. /next/ is an admin-only copy with a new design and newer features (lifecycle strips, My desk capture/minutes/ink/scan, phone layout) that will be promoted later.`;

export const GLOSSARY: Record<string, string> = {
  "QCTO": "Quality Council for Trades and Occupations: accredits occupational qualifications and runs the EISA. New programmes are QCTO programmes.",
  "SETA": "Sector Education and Training Authority. Legacy (SETA) programmes are older qualifications: no hand-over, no QCTO tracker and no EISA.",
  "SAQA ID": "SAQA's number for a qualification. Every programme needs it; missing ones show on PM Tracker and the PI strip.",
  "SDP": "Skills Development Provider: Apex's accreditation status with the QCTO.",
  "EISA": "External Integrated Summative Assessment: the QCTO's final external exam for an occupational qualification. A learner needs all six readiness criteria before booking.",
  "SoR": "Statement of Results: issued once all modules are competent; needed before EISA booking. Tracked on the QCTO Tracker.",
  "KM PM WM": "Module types of an occupational qualification: KM = knowledge module, PM = practical skills module, WM = workplace experience module (logbook).",
  "PoE": "Portfolio of Evidence: the learner's assessed work per module. Tracked on Attendance & PoE > PoE tracker.",
  "C NYC": "Results: C = Competent, NYC = Not Yet Competent. NS (not submitted) and RW (re-work) also count as outstanding.",
  "KMA": "Key Monitoring Area (1-6) scored on monitoring visits: 1 Programme Implementation, 2 Human Resources, 3 Assessment Strategy, 4 Progress on Implementation, 5 General Responsiveness, 6 E-learning.",
  "FAM": "Facilitators, Assessors and Moderators: the practitioners who deliver, assess and moderate. Kept in the FAM Registry with SETA registrations, scope, documents and bookings.",
  "Form 3": "Programme Implementation form (QCTO): modules, facilitators and physical resources per programme. A tab on each programme.",
  "MOU": "Memorandum of Understanding with a client. Status shown on Clients.",
  "PwD": "Person with a disability. A recruitment target group on Learner intake.",
  "Hand-over": "Formal transfer of a new programme from the PI specialist to the PM: Initiator signs, Compliance verifies and signs, Head of Ops signs, then the PM accepts or queries.",
  "Moderation": "Checking that assessments were fair and correct. Internal moderation is recorded per module result; external moderation and exit verification are on Moderation & Verification.",
  "Report generator": "Separate Apex tool (report-generator.html) where PMs capture attendance and module results and build monthly client reports. ApexOne reads its data (attendance, results, terminated or resigned learners) and never changes it.",
  "Attendance marks": "P = present, A = absent, N/A = not applicable, R = resigned. N/A and R don't count towards the attendance %. A latest mark of R means the learner left.",
  "At risk": "A learner below 80% attendance or with outstanding module results (NYC, NS, RW).",
  "Learner journey": "Status worked out from attendance and results: Active, At risk, Left, Completed competent, Completed not yet competent, Completed no results, No data.",
  "ClickUp": "Apex's task tool. ApexOne sends changes to the matching ClickUp tasks automatically (ClickUp sync). Recruitment candidates come from ClickUp.",
  "ClickUp sync": "Every change in ApexOne to programmes, learners, clients and other linked records is queued and sent to the matching ClickUp task, so nobody retypes it. Queued = waiting to send; Retrying = ClickUp refused it for now (usually its rate limit), retries every 2 minutes by itself; Failed = an admin checks the error on Data & Sync Health and clicks Requeue; Delivered / Synced = in ClickUp. Nothing to do while Failed is 0.",
  "Flow": "Personal action board (My Flow). Send anything to it with + Action in Flow.",
  "Lifecycle strip": "Row of stage buttons at the top of a role's start page (in /next/), showing how many items are at each stage. Click a stage to filter.",
  "Stale programme": "A programme past its start date whose status was not moved on (still initiated). The PM updates it.",
  "Legacy": "A legacy (SETA) programme or qualification, as opposed to a QCTO occupational one.",
};

type Sec = { k: string; names: string[]; tags: string; text: string };
export const PAGES: Sec[] = [
  { k: "mywork", names: ["My work"], tags: "to-do todo tasks list home start", text: "My work = your to-do list, built from live data for your role. Each row says what is wrong, on which programme, and opens the page to fix it; it disappears by itself once the data is fixed. Items are grouped (e.g. stale programmes, learner gaps, hand-overs waiting for you, FAM reviews due). Admins can switch View as PM / QA / PI / Admin, and in /next/ see the lifecycle strip (Initiation, Hand-over, Learners, Delivery, Close-out, Closed) with learner counts, at risk, left and no data per stage. Counts in the menu = items needing attention." },
  { k: "flow", names: ["My Flow", "Flow"], tags: "action board steps due owner hand stuck", text: "My Flow = your action board. Click + Action in Flow (top bar) on any page, or under any Ava answer, to make a card. Each card has steps from a role template (or Custom), a status (To do, Doing, Waiting on someone, Done), a due date, an owner, notes and a link back to its page. Quick add understands typed text like 'Name to fix #774 end date by Friday, urgent'. Hand a card to someone and it moves to their Flow with history. Overdue items turn red and count in the menu. Stuck = overdue or no change in 5+ days; admins see Everyone > Stuck only." },
  { k: "desk", names: ["My desk"], tags: "notes meeting escalations decisions watch capture minutes handwrite ink pen scan paper", text: "My desk (admins) = personal workspace: meeting notes with actions, escalations, a decisions log and watch items. In /next/ also: + Capture builds one note from pages (copied text, scanned paper, S Pen handwriting, typing); drafts stay in ApexOne and expire after 7 days. Fill with Ava turns typed text into action items and owners (handwriting and images are never sent to any AI). Handwrite = stylus pad with pressure, palm rejection, undo and eraser. Scan page = phone photo, crop and rotate, saved as a light scan. Minutes register = formal minutes from a meeting note: approve to lock them (they can't be edited after approval), export to PDF, and make a redacted tender sample on the device. Install as a phone app from /next/index.html?app=desk." },
  { k: "dashboard", names: ["Dashboard"], tags: "numbers kpi totals clickup sync active programmes", text: "Dashboard = company-wide numbers: programmes, learners, visits and reports; click a number to open the list behind it. Also shows data issues (e.g. learners not enrolled on any programme), the ClickUp sync card (Queued, Retrying, Delivered; see ClickUp sync) and Active programmes with learners, attendance and EISA-ready counts." },
  { k: "hoo", names: ["Consolidated view"], tags: "head of operations all programmes health table", text: "Consolidated view = every programme and its health in one table, for heads of operations. Search or filter to find a programme and open it." },
  { k: "clients", names: ["Clients"], tags: "client company contact sales mou", text: "Clients = client companies with contacts, sales person, PM and MOU status. Use Edit to complete missing client details. Programmes link to a client." },
  { k: "accred", names: ["Accreditation"], tags: "accredited qualifications expiry site visit desktop", text: "Accreditation = qualifications Apex is accredited for (QCTO and legacy SETA): status, accredited-to date, SETA, desktop/site visit. Tiles show what expires soon. Check accreditation before initiating a programme." },
  { k: "pi", names: ["Programme Initiation"], tags: "new programme initiate pi form saqa dates people documents", text: "Programme Initiation = where new programmes start. The PI specialist captures client, qualification (SAQA ID, NQF), dates, PM, facilitator, assessor and moderator, uploads the hand-over documents, then submits for hand-over. In /next/ the strip shows Details missing (SAQA ID, dates, PM or client), People missing (facilitator or assessor), Ready and Hand-over. Admins can also create a programme from a signed proposal on Data & Sync Health. Never put financial information (invoices, quotes, payments) in PI fields." },
  { k: "handover", names: ["Hand-over", "Sign-off & hand-over"], tags: "handover sign accept query compliance acting signer pack", text: "Hand-over = one programme's hand-over pack. Order: Initiator prepares and signs > Compliance verifies and signs > Head of Ops signs (or names an acting signer) > the PM accepts or raises a query saying what is missing. The pack shows documents and deadlines; a signed record PDF is stored. Legacy (SETA) programmes skip hand-over. The Hand-over list (handovers) shows packs by stage." },
  { k: "programmes", names: ["Programmes", "Programme"], tags: "programme cohort overview form 3 learners attendance poe eisa visits close-out edit", text: "Programmes = one programme (cohort) at a time, numbered #number, in 7 tabs: Overview, Form 3, Learners, Attendance, PoE, EISA readiness, Visits. Run state Planned / Active / Completed comes from the dates. Edit details to fix missing dates, SAQA ID, PM or FAM people. Ending soon > prepare close-out. Programme dates and status are fixed by the PM in the app." },
  { k: "fam", names: ["FAM Registry"], tags: "facilitator assessor moderator registration scope documents expiry renew bookings quality review load", text: "FAM Registry = facilitators, assessors and moderators. Each profile has Overview, Compliance and Activity: SETA registrations and scope, document checklist, expiries (next 90 days), bookings, current load, delivery history, quality record and learner results on programmes they were booked on. Action queue, Bulk Intake and Scope Import help capture records. In /next/ the strip shows Booked, Running, Review due (booking ended without a quality/moderation review) and Reviewed. Kept by the FAM / OHS specialist; reviews by QA." },
  { k: "assessors", names: ["Assessors & Moderators"], tags: "registration status", text: "Assessors & Moderators = registration status of assessors and moderators (see also FAM Registry)." },
  { k: "learners", names: ["Learners", "Learner profile", "Learner"], tags: "learner record find personal id passport journey", text: "Learners = everyone on record; Active = enrolled on a running programme. A learner record holds personal details, enrolments and documents; Ava never sees personal details. New learners need a valid 13-digit SA ID (in /next/ a passport number is accepted when there is no SA ID). In /next/ the strip groups learners by journey (Active, At risk, Left, Completed, No data); a row opens the learner." },
  { k: "dq", names: ["Data quality"], tags: "invalid id missing duplicates not enrolled", text: "Data quality = learners with a missing or invalid SA ID, not enrolled on any programme, or possible duplicates. Check duplicates before creating a learner; fix the ID on the learner record." },
  { k: "enrolments", names: ["Enrolments"], tags: "enrol withdraw learner programme link", text: "Enrolments = which learner is on which programme. Withdraw (with withdrawal date and reason), never delete. Learners terminated or resigned in the report generator show as Left." },
  { k: "intake", names: ["Learner intake"], tags: "recruitment candidates places shortlist pwd pools", text: "Learner intake (admin and recruitment) = match ClickUp candidates to programmes with open places. Programmes tab = timeline of cohorts, bars = enrolled + reserved against target; red = starts within 30 days with places open. Candidates tab = pools (PwD, NQF level, Black PwD) sorted by days waiting. Shortlist ranking: same province, then waiting 60+ days, then education fit." },
  { k: "pmtracker", names: ["PM Tracker"], tags: "caseload project manager attention export", text: "PM Tracker = caseload per project manager: running programmes and what needs attention on each (missing dates or SAQA ID, FAM people). Pick a PM to see one caseload; Export downloads the tracker. No financial info here." },
  { k: "attendance", names: ["Attendance & PoE"], tags: "register session poe modules results documents", text: "Attendance & PoE = per programme: Session register (Add session), PoE tracker (modules KM/PM/WM via + Add module, results C/NYC and internal moderation) and the learner documents grid. Most PMs capture attendance and results in the report generator, which ApexOne reads." },
  { k: "qcto", names: ["QCTO Tracker"], tags: "sor eisa booking outcome status monitoring set for all", text: "QCTO Tracker = per learner on QCTO programmes: current status, monitoring, SoR status and date, EISA booking, EISA date and outcome. Set for all updates a whole cohort." },
  { k: "visits", names: ["Monitoring Visits", "Monitoring visits", "Visit"], tags: "visit kma score judgement next visit", text: "Monitoring Visits = QA visits to programmes, scored on KMA 1-6 (1 Non-compliant ... 4 Fully compliant) with an overall judgement (Unacceptable, Not Yet Adequate, Adequate, Outstanding), findings, recommendations and next visit date." },
  { k: "recs", names: ["Recommendations"], tags: "actions due close request", text: "Recommendations = actions from monitoring visits with due dates. Request close needs a closing note and goes to admin sign-off." },
  { k: "eisa", names: ["EISA Readiness", "EISA readiness"], tags: "ready criteria six book", text: "EISA Readiness = per programme, which learners meet all six criteria: every knowledge module competent, every practical module competent, every workplace module (logbook) competent, all modules assessed, internal moderation done, SoR issued. Then they can be booked. Results and moderation come from the PoE tracker; SoR and booking from the QCTO Tracker. '-' = no data yet; hover a mark for the rule." },
  { k: "modver", names: ["Moderation & Verification"], tags: "external moderation exit verification qcto projects link", text: "Moderation & Verification = external moderation, QCTO projects and exit verification items, each linked to a programme (unlinked items need linking by QA)." },
  { k: "reports", names: ["Report Generator", "Reports"], tags: "monthly client report draft review sent", text: "Reports = monthly client progress reports moving draft > review > sent; Build report opens the report generator. The report generator itself is a separate tool where PMs capture attendance and results." },
  { k: "signoff", names: ["Sign-off queue"], tags: "approve decision closing notes", text: "Sign-off queue = hand-overs, recommendation closing notes and reports waiting for a decision. Open an item, check documents, approve or send back." },
  { k: "synchealth", names: ["Data & Sync Health"], tags: "health sync clickup queue requeue failed cron emails ai usage compliance", text: "Data & Sync Health (admin) = system health: failed scheduled jobs (48 h), report emails not sent, report cards stuck, ClickUp sync alerts and the ClickUp sync queue (filter by status, Requeue a failed item), learner data quality, programme health, compliance summary, AI usage (Ava) and New programme from signed proposal." },
  { k: "audit", names: ["Audit log"], tags: "who changed history", text: "Audit log (admin) = who changed what and when." },
  { k: "users", names: ["User management"], tags: "accounts roles access invite", text: "User management (admin) = staff accounts and roles. Roles decide menus and My work items." },
];

const STOP = /^(how|the|can|what|where|does|and|for|with|this|that|you|ava|why|who|when|are|is|do|page|apexone|mean|means|use)$/;
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 1);
function score(q: string[], key: string, body: string): number {
  const kw = words(key), bw = new Set(words(body));
  return q.reduce((n, w) => n + (kw.includes(w) ? 3 : kw.some((k) => k.length >= 5 && lev(k, w) <= (k.length >= 8 ? 2 : 1)) ? 3 : bw.has(w) ? 1 : 0), 0);
}
export function handbookFor(question: string, pageName: string): string {
  const q = words(question).filter((w) => w.length > 2 && !STOP.test(w));
  const pn = String(pageName || "").toLowerCase();
  const cur = PAGES.find((p) => p.k === pn || p.names.some((n) => n.toLowerCase() === pn));
  const pages = PAGES.filter((p) => p !== cur).map((p) => ({ p, s: score(q, p.names.join(" ") + " " + p.tags, p.text) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.p);
  const L = [OVERVIEW];
  if (cur) L.push("CURRENT PAGE {{" + cur.k + "}}: " + cur.text);
  pages.forEach((p) => L.push("RELATED PAGE {{" + p.k + "}}: " + p.text));
  L.push("GLOSSARY:\n" + Object.entries(GLOSSARY).map(([t, d]) => t + " = " + d).join("\n"));
  return L.join("\n\n");
}

/* Direct answer for "what is X" / "what does X mean" when X is exactly a glossary term or page name: no AI call, no quota. */
export function handbookDirect(question: string): string | null {
  const m = String(question || "").toLowerCase().trim().replace(/[?.!\s]+$/, "").match(/^(?:what(?:'s| is| are| does)|define|meaning of)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+page)?(?:\s+mean|\s+stand for)?$/);
  if (!m) return null;
  const t = m[1].trim();
  const g = Object.keys(GLOSSARY).find((k) => k.toLowerCase() === t);
  if (g) return g + ": " + GLOSSARY[g];
  const p = PAGES.find((x) => x.k === t || x.names.some((n) => n.toLowerCase() === t));
  return p ? p.text : null;
}
