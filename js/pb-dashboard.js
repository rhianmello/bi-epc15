(function () {
  let model = null;
  let fileName = '';
  let paretoChart = null;
  let currentEditId = null;
  let initialized = false;

  const pt1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const pt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const pct = value => Number.isFinite(value) ? pt1.format(value * 100) + '%' : 'N/D';
  const pp = value => Number.isFinite(value) ? (value > 0 ? '+' : '') + pt1.format(value * 100) + ' p.p.' : 'N/D';
  const qty = value => Number.isFinite(value) ? pt0.format(value) : '—';

  function isoWeek(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function dateShort(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return 'N/D';
    return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', timeZone:'UTC' }).format(date).replace('.', '');
  }

  function selection() {
    return {
      unit: document.getElementById('pb-unit-filter')?.value || '',
      phase: document.getElementById('pb-phase-filter')?.value || '',
      week: document.getElementById('pb-week-filter')?.value || ''
    };
  }

  function selectedUnits() {
    const s = selection();
    return s.unit ? model.units.filter(u => u.code === s.unit) : model.units;
  }

  function filteredDetails() {
    const s = selection();
    return selectedUnits().flatMap(unit => unit.details.map(row => Object.assign({ __unit: unit.code }, row)))
      .filter(row => !s.phase || row.phase === s.phase);
  }

  function aggregate(rows) {
    if (!rows.length) return null;
    const weighted = field => {
      let sum = 0;
      let wsum = 0;
      rows.forEach(row => {
        if (!Number.isFinite(row[field])) return;
        const weight = Number.isFinite(row.weight) && row.weight > 0
          ? row.weight
          : Number.isFinite(row.plannedValue) && row.plannedValue > 0 ? row.plannedValue : 1;
        sum += row[field] * weight;
        wsum += weight;
      });
      return wsum ? sum / wsum : null;
    };
    const planned = weighted('planned');
    const actual = weighted('actual');
    return {
      planned,
      actual,
      variance: Number.isFinite(planned) && Number.isFinite(actual) ? actual - planned : null,
      plannedValue: rows.reduce((a,r) => a + (Number.isFinite(r.plannedValue) ? r.plannedValue : 0), 0),
      actualValue: rows.reduce((a,r) => a + (Number.isFinite(r.actualValue) ? r.actualValue : 0), 0)
    };
  }

  function scopeSummary() {
    const s = selection();
    if (!s.unit && !s.phase) return model.contract;
    if (s.unit) {
      const unit = model.units.find(u => u.code === s.unit);
      if (!unit) return null;
      if (!s.phase) return unit;
      return unit.phases.find(p => p.phase === s.phase) || aggregate(unit.phases.filter(p => p.phase === s.phase));
    }
    const phaseRows = model.units.flatMap(u => u.phases).filter(p => p.phase === s.phase);
    return aggregate(phaseRows);
  }

  function populateUnitFilter() {
    const el = document.getElementById('pb-unit-filter');
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '<option value="">Todas as Unidades</option>' + model.units.map(u =>
      '<option value="' + esc(u.code) + '">' + esc(u.code + ' — ' + u.rawName.replace(/^.*?\s[-–]\s*/,'').trim()) + '</option>'
    ).join('');
    if ([...el.options].some(o => o.value === prev)) el.value = prev;
  }

  function populatePhaseFilter() {
    const el = document.getElementById('pb-phase-filter');
    if (!el) return;
    const prev = el.value;
    const units = selectedUnits();
    const phases = [...new Set(units.flatMap(u => u.phases.map(p => p.phase)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    el.innerHTML = '<option value="">Todas as Fases</option>' + phases.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
    el.value = phases.includes(prev) ? prev : '';
  }

  function populateDateWeek() {
    const dateEl = document.getElementById('pb-date-filter');
    const weekEl = document.getElementById('pb-week-filter');
    const week = isoWeek(model.dataBase);
    if (dateEl) dateEl.innerHTML = '<option value="current">' + esc(model.dataBase ? new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(model.dataBase) : 'N/D') + '</option>';
    if (weekEl) weekEl.innerHTML = '<option value="' + (week || '') + '">' + (week ? 'Semana ' + week : 'Semana N/D') + '</option>';
  }

  function renderContext(summary) {
    const s = selection();
    const level = s.phase ? 'WBS Nível 2' : s.unit ? 'WBS Nível 1' : 'WBS Nível 0';
    const week = isoWeek(model.dataBase);
    document.getElementById('pb-wbs').textContent = level;
    document.getElementById('pb-context-date').textContent = 'Data Base: ' + dateShort(model.dataBase) + (week ? ' • Sem. ' + week : '');
    const deckStatus = window.CoordinationDeck?.status?.();
    document.getElementById('pb-file-info').textContent =
      (fileName ? 'Excel: ' + fileName : '') +
      (deckStatus ? ' • PPT: ' + deckStatus.fileName + (deckStatus.dataBase ? ' (' + deckStatus.dataBase + ')' : '') : '');
    document.getElementById('pb-planned').textContent = pct(summary?.planned);
    document.getElementById('pb-actual').textContent = pct(summary?.actual);
    document.getElementById('pb-gap').textContent = pp(summary?.variance);
    document.getElementById('pb-gap').className = 'pb-gap-value ' + (Number.isFinite(summary?.variance) && summary.variance >= 0 ? 'positive' : 'negative');
    document.getElementById('pb-planned-week').textContent = 'N/D';
    document.getElementById('pb-actual-week').textContent = 'N/D';
    document.getElementById('pb-gap-days').textContent = 'impacto temporal N/D';
  }

  function impact(row) {
    if (Number.isFinite(row.weightedVariance) && row.weightedVariance < 0) return Math.abs(row.weightedVariance);
    if (Number.isFinite(row.variance) && row.variance < 0) {
      const w = Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1;
      return Math.abs(row.variance) * w;
    }
    return 0;
  }

  function groupLabel(row, phaseSelected) {
    if (!phaseSelected) return row.phase || row.subphase || row.grouping || row.component || 'Outros';
    return row.subphase || row.grouping || row.component || row.step || row.criterion || row.phase || 'Outros';
  }

  function shortLabel(value) {
    const text = String(value || 'Outros').trim();
    return text.length > 15 ? text.slice(0,13) + '…' : text;
  }

  function buildPareto() {
    const s = selection();
    const groups = new Map();
    filteredDetails().forEach(row => {
      const v = impact(row);
      if (!(v > 0)) return;
      const label = groupLabel(row, Boolean(s.phase));
      groups.set(label, (groups.get(label) || 0) + v);
    });
    const sorted = [...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
    const total = sorted.reduce((a,b)=>a+b[1],0);
    let acc = 0;
    return sorted.map(([label,value]) => {
      const share = total ? value / total * 100 : 0;
      acc += share;
      return { label, share, cumulative: acc };
    });
  }

  function renderPareto() {
    const data = buildPareto();
    const empty = document.getElementById('pb-pareto-empty');
    const canvas = document.getElementById('pb-pareto-chart');
    const marker = document.getElementById('pb-pareto-marker');
    if (paretoChart) { paretoChart.destroy(); paretoChart = null; }
    if (!data.length) {
      empty.classList.remove('hidden');
      canvas.classList.add('hidden');
      marker.textContent = 'Sem desvios';
      return;
    }
    empty.classList.add('hidden');
    canvas.classList.remove('hidden');
    const idx80 = data.findIndex(x => x.cumulative >= 80);
    const reached = idx80 >= 0 ? data[idx80].cumulative : data[data.length - 1].cumulative;
    marker.textContent = pt0.format(reached) + '% em ' + (idx80 >= 0 ? idx80 + 1 : data.length) + ' frentes';
    const labelPlugin = {
      id:'pbValueLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '700 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        chart.getDatasetMeta(0).data.forEach((bar,i) => {
          ctx.fillStyle = '#55665e';
          ctx.fillText(pt0.format(data[i].share) + '%', bar.x, bar.y - 6);
        });
        ctx.restore();
      }
    };
    paretoChart = new Chart(canvas, {
      data:{
        labels:data.map(x=>shortLabel(x.label)),
        datasets:[
          {type:'bar',label:'% Desvio individual',data:data.map(x=>x.share),backgroundColor:['#c94a46','#f3c743','#4a9a62','#718079','#aab7b1'],borderRadius:3,yAxisID:'y'},
          {type:'line',label:'Curva acumulada',data:data.map(x=>x.cumulative),borderColor:'#2f6e45',backgroundColor:'#2f6e45',pointBackgroundColor:data.map(x=>x.cumulative>=80?'#c94a46':'#2f6e45'),pointRadius:3,borderWidth:2,tension:.22,yAxisID:'y1'}
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.dataset.label + ': ' + pt1.format(ctx.raw) + '%'}}},
        scales:{
          x:{grid:{display:false},ticks:{color:'#566a60',font:{size:9}}},
          y:{display:false,beginAtZero:true},
          y1:{display:false,beginAtZero:true,max:100}
        }
      },
      plugins:[labelPlugin]
    });
  }

  function offenderLabel(row) {
    return row.criterion || row.step || row.component || row.grouping || row.subphase || row.phase || 'Item sem identificação';
  }

  function offenderContext(row) {
    return [row.phase,row.subphase,row.grouping,row.component,row.step].filter(Boolean).filter(v=>v!==offenderLabel(row)).slice(-2).join(' • ');
  }

  function offenderId(row) {
    return [row.__unit,row.phase,row.subphase,row.grouping,row.component,row.step,row.criterion].map(v=>String(v||'')).join('|');
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function offenderNotes() {
    return readJson('epc15_pb_offender_notes_v1', {});
  }

  function offenderClass(row) {
    if (!Number.isFinite(row.variance)) return { key:'alerta', label:'ALERTA' };
    if (row.variance < -0.03) return { key:'critico', label:'CRÍTICO' };
    if (row.variance < 0) return { key:'alerta', label:'ALERTA' };
    return { key:'normal', label:'MONITORAR' };
  }

  function pptActionRows() {
    const s = selection();
    return window.CoordinationDeck?.actionsFor?.(s.unit, s.phase) || [];
  }

  function pptMetricRows() {
    const s = selection();
    return window.CoordinationDeck?.metricsFor?.(s.unit, s.phase) || [];
  }

  function pptLookaheadRows() {
    const s = selection();
    return window.CoordinationDeck?.lookaheadFor?.(s.unit, s.phase) || [];
  }

  function findBiRowForPpt(action, rows) {
    const source = String(action.topic || '').toUpperCase();
    const words = source.normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^A-Z0-9]+/).filter(w=>w.length>=4);
    let best=null;
    rows.forEach(row => {
      const hay=(offenderLabel(row)+' '+offenderContext(row)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      const hits=words.filter(w=>hay.includes(w)).length;
      const score=words.length?hits/words.length:0;
      if(!best || score>best.score) best={row,score};
    });
    return best && best.score>=.34 ? best.row : null;
  }

  function renderOffenders() {
    const biRows = filteredDetails()
      .filter(r => Number.isFinite(r.variance) && r.variance < 0)
      .map(r => Object.assign({}, r, { __impact: impact(r) }))
      .sort((a,b)=>b.__impact-a.__impact);

    const pptRows = pptActionRows();
    const notes = offenderNotes();
    const host = document.getElementById('pb-offenders-list');
    host.scrollTop = 0;

    if (pptRows.length) {
      const ranked = pptRows.map(action => {
        const bi = findBiRowForPpt(action, biRows);
        const variance = Number.isFinite(action.variance) ? action.variance : bi?.variance;
        const impactValue = Number.isFinite(variance) ? Math.abs(variance) : 0;
        return { action, bi, variance, impactValue };
      }).sort((a,b)=>b.impactValue-a.impactValue || a.action.sourceSlide-b.action.sourceSlide).slice(0,6);

      document.getElementById('pb-offender-count').textContent = ranked.length + (ranked.length===1?' Ofensor':' Ofensores');
      document.getElementById('pb-cpm-note').textContent = 'Causa/recuperação do PPT • desvio do BI quando houver correspondência';

      host.innerHTML = ranked.map((item,index) => {
        const action=item.action;
        const id='ppt|' + [action.unitCode,action.phase,action.topic].map(v=>String(v||'')).join('|');
        const note=notes[id] || {};
        const deckNewer=window.CoordinationDeck?.importedAfter?.(note._editedAt);
        const cause=(!deckNewer && note.cause) ? note.cause : (action.cause || note.cause || '');
        const recovery=(!deckNewer && note.mitigation) ? note.mitigation : (action.plan || note.mitigation || '');
        const cls=Number.isFinite(item.variance)
          ? offenderClass({variance:item.variance})
          : {key:'alerta',label:'PPT'};
        const deviation=Number.isFinite(item.variance) ? pp(item.variance) : 'PPT';
        const context=[action.unitCode,action.phase].filter(Boolean).join(' • ');
        return '<article class="pb-offender pb-offender-' + cls.key + '" data-offender-id="' + esc(id) + '">' +
          '<div class="pb-offender-head">' +
            '<span class="pb-offender-number">' + String(index+1).padStart(2,'0') + '</span>' +
            '<div class="pb-offender-title"><strong>' + esc(action.topic) + '</strong><span>' + esc(context) + '</span></div>' +
            '<span class="pb-offender-ppt">PPT · S' + action.sourceSlide + '</span>' +
            '<span class="pb-offender-impact">' + esc(deviation) + '</span>' +
            '<span class="pb-offender-tag">' + cls.label + '</span>' +
          '</div>' +
          '<div class="pb-offender-body">' +
            '<label><span>CAUSA RAIZ</span><textarea data-offender-field="cause" placeholder="Não informado no PowerPoint">' + esc(cause) + '</textarea></label>' +
            '<label><span>PLANO DE RECUPERAÇÃO</span><textarea data-offender-field="mitigation" placeholder="Não informado no PowerPoint">' + esc(recovery) + '</textarea></label>' +
          '</div>' +
        '</article>';
      }).join('');
      return;
    }

    const unique = [];
    const seen = new Set();
    biRows.forEach(row => {
      const id = offenderId(row);
      if (seen.has(id) || unique.length >= 4) return;
      seen.add(id);
      unique.push(row);
    });
    document.getElementById('pb-offender-count').textContent = unique.length + ' Ofensores';
    document.getElementById('pb-cpm-note').textContent = 'Sem conteúdo correspondente no PPT • ordenado pelo BI';
    if (!unique.length) {
      host.innerHTML = '<div class="pb-empty-light">Nenhum item com desvio negativo para esta seleção.</div>';
      return;
    }
    host.innerHTML = unique.map((row,index) => {
      const id = offenderId(row);
      const note = notes[id] || {};
      const cls = offenderClass(row);
      return '<article class="pb-offender pb-offender-' + cls.key + '" data-offender-id="' + esc(id) + '">' +
        '<div class="pb-offender-head">' +
          '<span class="pb-offender-number">' + String(index+1).padStart(2,'0') + '</span>' +
          '<div class="pb-offender-title"><strong>' + esc(offenderLabel(row)) + '</strong><span>' + esc(offenderContext(row) || row.__unit) + '</span></div>' +
          '<span class="pb-offender-impact">' + esc(pp(row.variance)) + '</span>' +
          '<span class="pb-offender-tag">' + cls.label + '</span>' +
        '</div>' +
        '<div class="pb-offender-body">' +
          '<label><span>CAUSA RAIZ</span><textarea data-offender-field="cause" placeholder="Digite a causa raiz...">' + esc(note.cause || '') + '</textarea></label>' +
          '<label><span>PLANO DE RECUPERAÇÃO</span><textarea data-offender-field="mitigation" placeholder="Digite o plano de recuperação...">' + esc(note.mitigation || '') + '</textarea></label>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function metricCandidates() {
    const rows = filteredDetails().filter(row =>
      Number.isFinite(row.plannedQuantity) && row.plannedQuantity > 0 &&
      Number.isFinite(row.actualQuantity) && row.actualQuantity >= 0
    );
    const unique = [];
    const seen = new Set();
    rows.sort((a,b)=>(b.plannedQuantity||0)-(a.plannedQuantity||0)).forEach(row => {
      const label = offenderLabel(row);
      const key = label + '|' + (row.measureUnit || '');
      if (seen.has(key) || unique.length >= 4) return;
      seen.add(key);
      unique.push(row);
    });
    return unique;
  }

  function metricTone(row) {
    if (Number.isFinite(row.variance)) {
      if (row.variance >= 0) return 'good';
      if (row.variance >= -0.03) return 'attention';
      return 'critical';
    }
    const ratio = row.plannedQuantity > 0 ? row.actualQuantity / row.plannedQuantity : null;
    return Number.isFinite(ratio) && ratio >= 1 ? 'good' : 'attention';
  }

  function renderMetrics() {
    const pptRows = pptMetricRows()
      .filter(row => Number.isFinite(row.planned) || Number.isFinite(row.actual))
      .sort((a,b)=>(Number.isFinite(a.variance)?a.variance:0)-(Number.isFinite(b.variance)?b.variance:0))
      .slice(0,6);
    const host = document.getElementById('pb-metrics-grid');

    if (pptRows.length) {
      document.getElementById('pb-metric-count').textContent = pptRows.length + ' métricas do PPT';
      host.innerHTML = pptRows.map((row,index) => {
        const planned=Number.isFinite(row.planned)?row.planned:null;
        const actual=Number.isFinite(row.actual)?row.actual:null;
        const deviation=Number.isFinite(row.variance)?row.variance:
          (Number.isFinite(planned)&&Number.isFinite(actual)?actual-planned:null);
        const ratio=Number.isFinite(planned)&&planned>0&&Number.isFinite(actual)?Math.max(0,Math.min(1,actual/planned)):null;
        const tone=Number.isFinite(deviation) ? (deviation>=0?'good':deviation>=-0.03?'attention':'critical') : 'attention';
        const context=[row.unitCode,row.phase].filter(Boolean).join(' • ');
        return '<div class="pb-metric pb-metric-' + tone + '">' +
          '<div class="pb-metric-head"><strong>' + (index+1) + '. ' + esc(row.topic) + '</strong><b>' + esc(Number.isFinite(deviation)?pp(deviation):'N/D') + '</b></div>' +
          '<div class="pb-metric-track"><span style="width:' + (Number.isFinite(ratio)?Math.min(100,ratio*100):0) + '%"></span></div>' +
          '<div class="pb-metric-foot"><span>Prev.: <strong>' + esc(pct(planned)) + '</strong> • Real: <strong>' + esc(pct(actual)) + '</strong></span><b>PPT S' + row.sourceSlide + '</b></div>' +
          '<small class="pb-metric-context">' + esc(context) + '</small>' +
        '</div>';
      }).join('');
      return;
    }

    const rows = metricCandidates();
    document.getElementById('pb-metric-count').textContent = rows.length + ' métricas-chave';
    if (!rows.length) {
      host.innerHTML = '<div class="pb-empty-light pb-metrics-empty">Sem métricas quantitativas comparáveis para esta seleção.</div>';
      return;
    }
    host.innerHTML = rows.map((row,index) => {
      const ratio = row.plannedQuantity > 0 ? Math.max(0, Math.min(1, row.actualQuantity / row.plannedQuantity)) : null;
      const deviation = Number.isFinite(row.actualQuantity) && Number.isFinite(row.plannedQuantity) ? row.actualQuantity - row.plannedQuantity : null;
      const tone = metricTone(row);
      return '<div class="pb-metric pb-metric-' + tone + '">' +
        '<div class="pb-metric-head"><strong>' + (index+1) + '. ' + esc(offenderLabel(row)) + '</strong><b>' + (Number.isFinite(ratio) ? pt1.format(ratio*100)+'%' : 'N/D') + '</b></div>' +
        '<div class="pb-metric-track"><span style="width:' + (Number.isFinite(ratio) ? Math.min(100,ratio*100) : 0) + '%"></span></div>' +
        '<div class="pb-metric-foot"><span>Real: <strong>' + qty(row.actualQuantity) + '</strong> / ' + qty(row.plannedQuantity) + ' ' + esc(row.measureUnit || '') + '</span><b>' + (Number.isFinite(deviation) ? (deviation>0?'+':'') + qty(deviation) + ' ' + esc(row.measureUnit || '') : 'N/D') + '</b></div>' +
      '</div>';
    }).join('');
  }

  function activityKey() {
    const s = selection();
    return 'epc15_pb_activities_v1::' + (s.unit || 'ALL') + '::' + (s.phase || 'ALL') + '::' + (s.week || 'NOW');
  }

  function activities() {
    return readJson(activityKey(), []);
  }

  function saveActivities(items) {
    writeJson(activityKey(), items);
  }

  const statusMeta = {
    concluido:{label:'Concluído',icon:'✓'},
    critico:{label:'Crítico',icon:'!'},
    andamento:{label:'Em Andamento',icon:'◷'},
    atencao:{label:'Atenção',icon:'!'},
    planejado:{label:'Planejado',icon:'○'},
    meta:{label:'Meta',icon:'↗'}
  };

  function statusLabel(item) {
    const meta = statusMeta[item.status] || statusMeta.planejado;
    if (item.status === 'meta' && Number.isFinite(Number(item.percent))) return pt0.format(Number(item.percent)) + '% Meta';
    return meta.label;
  }

  function renderActivities() {
    const manual = activities();
    const ppt = pptLookaheadRows().slice(0,6);
    const total = ppt.length + manual.length;
    document.getElementById('pb-lookahead-count').textContent = total + (total === 1 ? ' frente' : ' frentes');
    const host = document.getElementById('pb-lookahead-list');
    if (!total) {
      host.innerHTML = '<div class="pb-empty-light">Nenhum plano de recuperação foi identificado no PowerPoint e nenhuma atividade manual foi cadastrada para esta seleção.</div>';
      return;
    }
    const pptHtml = ppt.map(item => {
      const context=[item.unitCode,item.phase].filter(Boolean).join(' • ');
      return '<article class="pb-activity pb-activity-ppt">' +
        '<span class="pb-activity-icon">↗</span>' +
        '<div class="pb-activity-copy"><strong>' + esc(item.topic) + '</strong><span>' + esc(item.plan) + '</span><small class="pb-activity-context">' + esc(context) + '</small></div>' +
        '<span class="pb-activity-status">Plano PPT</span>' +
        '<span class="pb-source-chip">S' + item.sourceSlide + '</span>' +
      '</article>';
    }).join('');

    const manualHtml = manual.map(item => {
      const meta = statusMeta[item.status] || statusMeta.planejado;
      return '<article class="pb-activity pb-activity-' + esc(item.status || 'planejado') + '">' +
        '<span class="pb-activity-icon">' + meta.icon + '</span>' +
        '<div class="pb-activity-copy"><strong>' + esc(item.title) + '</strong><span>' + esc(item.description || '') + '</span></div>' +
        '<span class="pb-activity-status">' + esc(statusLabel(item)) + '</span>' +
        '<div class="pb-activity-actions">' +
          '<button type="button" data-activity-move="-1" data-activity-id="' + esc(item.id) + '" title="Subir">↑</button>' +
          '<button type="button" data-activity-move="1" data-activity-id="' + esc(item.id) + '" title="Descer">↓</button>' +
          '<button type="button" data-activity-edit="' + esc(item.id) + '" title="Editar">✎</button>' +
        '</div>' +
      '</article>';
    }).join('');

    host.innerHTML = pptHtml + manualHtml;
  }

  function addQuickActivity() {
    const input = document.getElementById('pb-activity-quick');
    const title = input.value.trim();
    if (!title) return;
    const items = activities();
    items.push({ id: String(Date.now()) + Math.random().toString(16).slice(2), title, description:'', status:'planejado', percent:null });
    saveActivities(items);
    input.value = '';
    renderActivities();
  }

  function openActivityModal(id) {
    const items = activities();
    const item = items.find(x => x.id === id);
    if (!item) return;
    currentEditId = id;
    document.getElementById('pb-activity-title').value = item.title || '';
    document.getElementById('pb-activity-desc').value = item.description || '';
    document.getElementById('pb-activity-status').value = item.status || 'planejado';
    document.getElementById('pb-activity-percent').value = item.percent == null ? '' : item.percent;
    document.getElementById('pb-activity-modal').classList.remove('hidden');
  }

  function closeActivityModal() {
    currentEditId = null;
    document.getElementById('pb-activity-modal').classList.add('hidden');
  }

  function saveActivityModal() {
    if (!currentEditId) return;
    const items = activities();
    const item = items.find(x => x.id === currentEditId);
    if (!item) return closeActivityModal();
    item.title = document.getElementById('pb-activity-title').value.trim() || item.title;
    item.description = document.getElementById('pb-activity-desc').value.trim();
    item.status = document.getElementById('pb-activity-status').value || 'planejado';
    const p = Number(document.getElementById('pb-activity-percent').value);
    item.percent = Number.isFinite(p) ? p : null;
    saveActivities(items);
    closeActivityModal();
    renderActivities();
  }

  function deleteActivityModal() {
    if (!currentEditId) return;
    saveActivities(activities().filter(x => x.id !== currentEditId));
    closeActivityModal();
    renderActivities();
  }

  function moveActivity(id, direction) {
    const items = activities();
    const i = items.findIndex(x => x.id === id);
    const j = i + Number(direction);
    if (i < 0 || j < 0 || j >= items.length) return;
    const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    saveActivities(items);
    renderActivities();
  }

  function saveOffenderField(target) {
    const card = target.closest('[data-offender-id]');
    if (!card) return;
    const id = card.dataset.offenderId;
    const notes = offenderNotes();
    notes[id] = notes[id] || {};
    notes[id][target.dataset.offenderField] = target.value.trim();
    notes[id]._editedAt = Date.now();
    writeJson('epc15_pb_offender_notes_v1', notes);
  }

  function bind() {
    if (initialized) return;
    initialized = true;
    const page = document.getElementById('page-pb');
    document.getElementById('pb-unit-filter')?.addEventListener('change', () => { populatePhaseFilter(); render(); });
    document.getElementById('pb-phase-filter')?.addEventListener('change', render);
    document.getElementById('pb-activity-add')?.addEventListener('click', addQuickActivity);
    document.getElementById('pb-activity-quick')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addQuickActivity(); }});
    page?.addEventListener('click', event => {
      const edit = event.target.closest('[data-activity-edit]');
      const move = event.target.closest('[data-activity-move]');
      if (edit) openActivityModal(edit.dataset.activityEdit);
      if (move) moveActivity(move.dataset.activityId, move.dataset.activityMove);
    });
    page?.addEventListener('change', event => {
      if (event.target.matches('[data-offender-field]')) saveOffenderField(event.target);
    });
    document.getElementById('pb-activity-modal-save')?.addEventListener('click', saveActivityModal);
    document.getElementById('pb-activity-modal-delete')?.addEventListener('click', deleteActivityModal);
    document.getElementById('pb-activity-modal-cancel')?.addEventListener('click', closeActivityModal);
    document.getElementById('pb-activity-modal')?.addEventListener('click', event => {
      if (event.target.id === 'pb-activity-modal') closeActivityModal();
    });
  }

  function init(data, importedFileName) {
    model = data;
    fileName = importedFileName || '';
    populateUnitFilter();
    populatePhaseFilter();
    populateDateWeek();
    bind();
  }

  function render() {
    if (!model) return;
    const summary = scopeSummary();
    renderContext(summary);
    renderPareto();
    renderOffenders();
    renderActivities();
    renderMetrics();
  }

  function exportManualData() {
    const activities = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('epc15_pb_activities_v1::')) {
        try { activities[key] = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}
      }
    }
    return {
      activities,
      offenderNotes: readJson('epc15_pb_offender_notes_v1', {}),
      coordinationDeck: window.CoordinationDeck?.exportData?.() || null
    };
  }

  function importManualData(payload) {
    if (!payload || typeof payload !== 'object') return;
    Object.entries(payload.activities || {}).forEach(([key,value]) => {
      if (!key.startsWith('epc15_pb_activities_v1::')) return;
      writeJson(key, Array.isArray(value) ? value : []);
    });
    if (payload.offenderNotes && typeof payload.offenderNotes === 'object') {
      writeJson('epc15_pb_offender_notes_v1', payload.offenderNotes);
    }
    if (payload.coordinationDeck) window.CoordinationDeck?.importData?.(payload.coordinationDeck);
    if (model) render();
  }

  window.PBDashboard = { init, render, exportManualData, importManualData };
}());