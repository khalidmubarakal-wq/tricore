/* =========================
   PROJECT CREATION TOOLS SECTION
   - Normalizes project records
   - Builds starter WBS/template data
   - Keeps project artifacts aligned
   ========================= */
(function(){
  // Utility helpers for IDs, dates, and numeric safety
  function uid(){ return 'id-' + Math.random().toString(36).slice(2,9); }
  function iso(date){
    const d = date instanceof Date ? new Date(date) : new Date(date || Date.now());
    if (Number.isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  }
  function addDays(date, days){ const d = new Date(date || Date.now()); d.setDate(d.getDate() + Number(days || 0)); return iso(d); }
  function addMonths(date, months){ const d = new Date(date || Date.now()); d.setMonth(d.getMonth() + Number(months || 0)); return iso(d); }
  function toNumber(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function cleanCode(v){ return String(v || '').trim().toUpperCase().replace(/\s+/g,'-'); }
  const templateMap = {
    blank:[
      { code:'1.1', name:'Initiation', days:10, bac:25000, status:'notStarted', ks:'backlog' },
      { code:'1.2', name:'Planning', days:15, bac:40000, status:'notStarted', ks:'backlog' },
      { code:'1.3', name:'Execution', days:30, bac:90000, status:'inProgress', ks:'inprogress', pct:35 },
      { code:'1.4', name:'Closure', days:7, bac:15000, status:'notStarted', ks:'backlog' }
    ],
    it:[
      { code:'1.1', name:'Discovery & Requirements', days:14, bac:60000, status:'completed', ks:'done', pct:100 },
      { code:'1.2', name:'Architecture & Planning', days:14, bac:70000, status:'inProgress', ks:'inprogress', pct:40 },
      { code:'1.3', name:'Build Sprint', days:28, bac:120000, status:'notStarted', ks:'backlog' },
      { code:'1.4', name:'Testing & UAT', days:14, bac:50000, status:'notStarted', ks:'backlog' },
      { code:'1.5', name:'Deployment', days:7, bac:30000, status:'notStarted', ks:'backlog' }
    ],
    event:[
      { code:'1.1', name:'Concept & Planning', days:10, bac:30000, status:'completed', ks:'done', pct:100 },
      { code:'1.2', name:'Vendors & Logistics', days:18, bac:75000, status:'inProgress', ks:'inprogress', pct:35 },
      { code:'1.3', name:'Marketing & Registration', days:15, bac:40000, status:'notStarted', ks:'backlog' },
      { code:'1.4', name:'Execution Day', days:3, bac:100000, status:'notStarted', ks:'backlog' },
      { code:'1.5', name:'Post-Event Reporting', days:5, bac:20000, status:'notStarted', ks:'backlog' }
    ],
    construction:[
      { code:'1.1', name:'Mobilization & Site Setup', days:20, bac:120000, status:'completed', ks:'done', pct:100 },
      { code:'1.2', name:'Design & Approvals', days:30, bac:180000, status:'inProgress', ks:'inprogress', pct:30 },
      { code:'1.3', name:'Civil & Structural Works', days:60, bac:700000, status:'notStarted', ks:'backlog' },
      { code:'1.4', name:'MEP & Finishing', days:45, bac:500000, status:'notStarted', ks:'backlog' },
      { code:'1.5', name:'Commissioning & Handover', days:15, bac:150000, status:'notStarted', ks:'backlog' }
    ],
    pmo:[
      { code:'1.1', name:'Current State Assessment', days:12, bac:40000, status:'completed', ks:'done', pct:100 },
      { code:'1.2', name:'Operating Model Design', days:15, bac:55000, status:'inProgress', ks:'inprogress', pct:50 },
      { code:'1.3', name:'Governance & Templates', days:18, bac:65000, status:'notStarted', ks:'backlog' },
      { code:'1.4', name:'Tool Configuration', days:20, bac:80000, status:'notStarted', ks:'backlog' },
      { code:'1.5', name:'Pilot & Rollout', days:15, bac:45000, status:'notStarted', ks:'backlog' }
    ]
  };
  function statusToPct(status){ if(status==='completed') return 100; if(status==='inProgress') return 35; if(status==='onHold') return 10; return 0; }
  function normalizeProject(project){
    return { ...project, code: cleanCode(project.code || project.id || ''), budget: toNumber(project.budget || project.bac || 0), currency: project.currency || 'SAR', methodology: project.methodology || 'hybrid', template: project.template || 'blank', defaultView: project.defaultView || 'list', type: project.type || 'internal', progress: typeof project.progress === 'number' ? project.progress : statusToPct(project.status), created: project.created || iso(new Date()), updatedAt: iso(new Date()) };
  }
  function suggestProjectSequence(existing){
    const list = Array.isArray(existing) ? existing : [];
    let max = 0;
    list.forEach(function(project){
      const raw = String(project?.name || '').trim();
      const match = raw.match(/project(?:\s+number)?\s*(\d+)/i);
      if (match) max = Math.max(max, Number(match[1]) || 0);
    });
    return max + 1 || 1;
  }
  function defaultProjectName(existing){
    const seq = suggestProjectSequence(existing);
    return 'Project Number ' + seq;
  }
  function defaultProjectCode(existing){
    const seq = suggestProjectSequence(existing);
    return 'PRJ-' + String(seq).padStart(3, '0');
  }
  function createProjectPackage(form, currentState){
    const state = currentState || { projects: [] };
    const existing = Array.isArray(state.projects) ? state.projects : [];
    const name = String(form?.name || defaultProjectName(existing)).trim();
    const owner = String(form?.owner || '').trim();
    const code = cleanCode(form?.code || defaultProjectCode(existing));
    const start = form?.start || iso(new Date());
    const end = form?.end || addMonths(start, 2);
    if(!name) return { ok:false, error:'Project name is required.' };
    if(!code) return { ok:false, error:'Project code is required.' };
    if(!owner) return { ok:false, error:'Project owner is required.' };
    if(!form?.start) return { ok:false, error:'Start date is required.' };
    if(!form?.end) return { ok:false, error:'Target end date is required.' };
    if(new Date(end) < new Date(start)) return { ok:false, error:'Target end date must be after the start date.' };
    if(existing.some(p => String(p.code || '').toUpperCase() === code)) return { ok:false, error:'Project code must be unique.' };
    const id = 'PRJ-' + Date.now().toString().slice(-5);
    const project = normalizeProject({ ...form, id, code, name, owner, dept:String(form?.dept || '').trim(), status:form?.status || 'notStarted', priority:form?.priority || 'medium', start, end, targetEndDate:end, created:iso(new Date()), createdBy:owner, health:form?.status === 'onHold' ? 'warning' : 'good' });
    const template = templateMap[project.template] || templateMap.blank;
    const rootId = uid();
    const totalBudget = project.budget || template.reduce((sum, item) => sum + toNumber(item.bac), 0);
    let cursor = start;
    let prevId = null;
    const items = [{ id:rootId, pid:project.id, projectId:project.id, project_id:project.id, par:null, code:'1', name:project.name, description:project.desc || '', type:'summary', resp:project.owner, ps:start, pe:end, bac:totalBudget, ac:0, pct:project.progress || 0, status:project.status, deps:[], pri:project.priority, ks:project.status === 'completed' ? 'done' : (project.status === 'inProgress' ? 'inprogress' : 'backlog') }];
    template.forEach(function(step, idx){
      const stepId = uid();
      const stepStart = idx === 0 ? cursor : addDays(cursor, 1);
      const stepEnd = addDays(stepStart, step.days);
      items.push({ id:stepId, pid:project.id, projectId:project.id, project_id:project.id, par:rootId, code:step.code, name:step.name, description:project.desc || '', type:'workpackage', resp:project.owner, ps:stepStart, pe:stepEnd, bac:toNumber(step.bac), ac:0, pct:typeof step.pct === 'number' ? step.pct : (step.status === 'completed' ? 100 : step.status === 'inProgress' ? 35 : 0), status:step.status, deps:prevId ? [prevId] : [], pri:project.priority, ks:step.ks || (step.status === 'completed' ? 'done' : step.status === 'inProgress' ? 'inprogress' : 'backlog') });
      cursor = stepEnd;
      prevId = stepId;
    });
    project.budget = totalBudget;
    return { ok:true, project, wbs:items };
  }
  function syncProjectArtifacts(state){
    const next = { ...(state || {}) };
    next.projects = Array.isArray(next.projects) ? next.projects.map(normalizeProject) : [];
    next.wbs = Array.isArray(next.wbs) ? next.wbs.map(function(item){
      const project = next.projects.find(function(p){ return p.id === (item.projectId || item.project_id || item.pid); });
      if(!project) return { ...item, projectId:item.projectId || item.pid, project_id:item.project_id || item.pid };
      const linked = { ...item, pid:item.pid || project.id, projectId:item.projectId || project.id, project_id:item.project_id || project.id, resp:item.resp || project.owner, pri:item.pri || project.priority };
      if(item.type === 'summary' || item.par == null){ linked.name = project.name; linked.ps = project.start; linked.pe = project.end; linked.status = project.status; linked.ks = project.status === 'completed' ? 'done' : (project.status === 'inProgress' ? 'inprogress' : 'backlog'); linked.pct = typeof linked.pct === 'number' ? linked.pct : project.progress || 0; }
      return linked;
    }) : [];
    return next;
  }
  window.TriCoreProjectTools = { templateMap:templateMap, suggestProjectSequence:suggestProjectSequence, defaultProjectName:defaultProjectName, defaultProjectCode:defaultProjectCode, createProjectPackage:createProjectPackage, syncProjectArtifacts:syncProjectArtifacts };
})();
