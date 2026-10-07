/**
 * Field mappers between the app's in-memory records (short keys used by the
 * React bundle, e.g. `pid`, `ps`, `bac`) and Supabase table rows.
 */

export const toDb = {
  project: (p, uid) => ({ id: p.id, user_id: uid, code: p.code||'', name: p.name, description: p.desc||'', owner: p.owner||'', dept: p.dept||'', status: p.status||'notStarted', priority: p.priority||'medium', start_date: p.start||null, end_date: p.end||null, budget: Number(p.budget)||0, currency: p.currency||'SAR', methodology: p.methodology||'hybrid', template: p.template||'blank', type: p.type||'internal' }),
  wbs: (w, uid) => ({ id: w.id, project_id: w.pid, user_id: uid, parent_id: w.par||null, code: w.code||'', name: w.name, type: w.type||'workpackage', resp: w.resp||'', ps: w.ps||null, pe: w.pe||null, bac: Number(w.bac)||0, ac: Number(w.ac)||0, pct: Number(w.pct)||0, ks: w.ks||'backlog', deps: Array.isArray(w.deps)?w.deps:[], pri: w.pri||'medium', status: w.status||'notStarted' }),
  baseline: (b, uid) => ({ id: b.id, project_id: b.pid, user_id: uid, version: b.version||'', date: b.date||null, approved_by: b.by||'', notes: b.notes||'' }),
  claim: (c, uid) => ({ id: c.id, project_id: c.pid, user_id: uid, wbs_id: c.wid||null, title: c.title, vendor: c.vendor||'', cat: c.cat||'', type: c.type||'', req_by: c.reqBy||'', est: c.est!=null?Number(c.est):null, app: c.app!=null?Number(c.app):null, act: c.act!=null?Number(c.act):null, rd: c.rd||null, nd: c.nd||null, pd: c.pd||null, status: c.status||'draft', description: c.desc||'', attachment_path: c.attachmentPath||null, attachment_name: c.attachmentName||null }),
  risk: (r, uid) => ({ id: r.id, project_id: r.pid, user_id: uid, title: r.title, prob: r.prob||'medium', impact: r.impact||'medium', score: Number(r.score)||0, owner: r.owner||'', status: r.status||'open', mit: r.mit||'', due_date: r.due||null }),
  cr: (c, uid) => ({ id: c.id, project_id: c.pid, user_id: uid, title: c.title, description: c.desc||'', req_by: c.reqBy||'', orig_bac: Number(c.origBAC)||0, rev_bac: Number(c.revBAC)||0, orig_end: c.origEnd||null, rev_end: c.revEnd||null, status: c.status||'pending', submitted_at: c.submitted||null, approved_at: c.approved||null }),
};

export const fromDb = {
  project: (r) => ({ id: r.id, code: r.code, name: r.name, desc: r.description, owner: r.owner, dept: r.dept, status: r.status, priority: r.priority, start: r.start_date, end: r.end_date, budget: r.budget, currency: r.currency, methodology: r.methodology, template: r.template, type: r.type, created: r.created_at }),
  wbs: (r) => ({ id: r.id, pid: r.project_id, par: r.parent_id, code: r.code, name: r.name, type: r.type, resp: r.resp, ps: r.ps, pe: r.pe, bac: r.bac, ac: r.ac, pct: r.pct, ks: r.ks, deps: Array.isArray(r.deps)?r.deps:[], pri: r.pri, status: r.status }),
  baseline: (r) => ({ id: r.id, pid: r.project_id, version: r.version, date: r.date, by: r.approved_by, notes: r.notes }),
  claim: (r) => ({ id: r.id, pid: r.project_id, wid: r.wbs_id, title: r.title, vendor: r.vendor, cat: r.cat, type: r.type, reqBy: r.req_by, est: r.est, app: r.app, act: r.act, rd: r.rd, nd: r.nd, pd: r.pd, status: r.status, desc: r.description, attachmentPath: r.attachment_path||null, attachmentName: r.attachment_name||null }),
  risk: (r) => ({ id: r.id, pid: r.project_id, title: r.title, prob: r.prob, impact: r.impact, score: r.score, owner: r.owner, status: r.status, mit: r.mit, due: r.due_date }),
  cr: (r) => ({ id: r.id, pid: r.project_id, title: r.title, desc: r.description, reqBy: r.req_by, origBAC: r.orig_bac, revBAC: r.rev_bac, origEnd: r.orig_end, revEnd: r.rev_end, status: r.status, submitted: r.submitted_at, approved: r.approved_at }),
};
