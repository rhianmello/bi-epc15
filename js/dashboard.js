(function () {
  let model;
  let currentUnit;
  let currentPhase = '';
  let unitSortAscending = true;
  const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const percent = value => Number.isFinite(value) ? `${pt.format(value * 100)}%` : '—';
  const pp = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${pt.format(value * 100)} p.p.` : '—';
  const currency = value => Number.isFinite(value) ? money.format(value) : '—';
  const quantity = value => Number.isFinite(value) ? integer.format(value) : '—';
  const date = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(value) : '—';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const status = item => `<span class="status-pill status-${item.status.key}">${item.status.label}</span>`;

  function kpi(label, value, note, accent) {
    return `<article class="kpi" style="--accent:${accent}"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong><span class="kpi-note">${note || ''}</span></article>`;
  }

  function init(data, fileName) {
    model = data;
    document.getElementById('file-name').textContent = fileName;
    document.getElementById('header-date').textContent = date(model.dataBase);
    renderUnitNavigation();
    renderExecutive();
    renderAnalyses();
    if (window.PBDashboard) window.PBDashboard.init(model, fileName);
  }

  function titleCaseUnit(raw) {
    const match = String(raw || '').match(/^(U-\d{4})\s*[-–]\s*(.+)$/i);
    if (!match) return raw || '';
    const small = new Set(['de','da','do','das','dos','e']);
    const name = match[2].toLocaleLowerCase('pt-BR').split(/\s+/).map((word,i) =>
      i > 0 && small.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
    ).join(' ');
    return match[1].toUpperCase() + ' - ' + name;
  }

  function renderUnitNavigation() {
    document.getElementById('unit-nav').innerHTML = model.units.map((unit, index) =>
      `<button class="nav-item unit-nav-item" data-unit-index="${index}" title="${escapeHtml(unit.rawName)}">${escapeHtml(titleCaseUnit(unit.rawName))}</button>`).join('');
  }

  function renderExecutive() {
    const c = model.contract;
    document.getElementById('executive-kpis').innerHTML = [
      kpi('Valor total do contrato', currency(c.plannedValue), 'Base consolidada', '#3b82f6'),
      kpi('Previsto', percent(c.planned), 'Avanço físico', '#60a5fa'),
      kpi('Realizado', percent(c.actual), 'Avanço físico', '#22d3ee'),
      kpi('Desvio', pp(c.variance), 'Previsto x realizado', c.variance >= 0 ? '#22c55e' : '#ef4444'),
      kpi('Avanço geral', percent(c.actual), `Data-base ${date(model.dataBase)}`, '#8b5cf6')
    ].join('');
    document.getElementById('planned-label').textContent = percent(c.planned);
    document.getElementById('actual-label').textContent = percent(c.actual);
    document.getElementById('variance-label').textContent = pp(c.variance);
    document.getElementById('variance-label').style.color = c.variance >= 0 ? '#86efac' : '#fca5a5';
    document.getElementById('planned-bar').style.width = `${Math.min(100, Math.max(0, (c.planned ?? 0) * 100))}%`;
    document.getElementById('actual-bar').style.width = `${Math.min(100, Math.max(0, (c.actual ?? 0) * 100))}%`;
    const progressStatus = document.getElementById('progress-status');
    progressStatus.className = `status-pill status-${c.status.key}`;
    progressStatus.textContent = c.status.label;
    renderUnitsTable();
    renderRankings();
    DashboardCharts.unitProgress(model.units, 'units-progress-chart', 'executiveUnits');
  }

  function renderUnitsTable() {
    const sorted = [...model.units].sort((a,b) => unitSortAscending ? (a.variance ?? 0) - (b.variance ?? 0) : (b.variance ?? 0) - (a.variance ?? 0));
    document.getElementById('units-table').innerHTML = sorted.map(unit => `<tr data-unit-code="${escapeHtml(unit.code)}">
      <td><strong>${escapeHtml(unit.code)}</strong><br><span class="muted">${escapeHtml(unit.rawName)}</span></td>
      <td class="numeric">${percent(unit.planned)}</td><td class="numeric">${percent(unit.actual)}</td>
      <td class="numeric">${pp(unit.variance)}</td><td class="numeric">${currency(unit.plannedValue)}</td><td>${status(unit)}</td></tr>`).join('');
  }

  function renderRankings() {
    const comparable = model.units.filter(u => Number.isFinite(u.variance) && Number.isFinite(u.actual));
    const worst = [...comparable].sort((a,b) => a.variance - b.variance).slice(0,5);
    const best = [...comparable].sort((a,b) => b.actual - a.actual).slice(0,5);
    document.getElementById('worst-ranking').innerHTML = ranking(worst, u => pp(u.variance));
    document.getElementById('best-ranking').innerHTML = ranking(best, u => percent(u.actual));
  }

  function ranking(items, valueFn) {
    if (!items.length) return '<p class="muted">Sem dados comparáveis.</p>';
    return items.map((u,i) => `<div class="ranking-item"><span class="ranking-position">${i+1}</span><span class="ranking-name">${escapeHtml(u.code)}</span><strong class="ranking-value">${valueFn(u)}</strong></div>`).join('');
  }

  function showPage(page) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = page === 'executive' ? 'Visão Executiva' : page === 'pb' ? 'Visão PB (Petrobras)' : page === 'analysis' ? 'Análises' : currentUnit?.rawName || 'Unidade';
    if (page === 'pb' && window.PBDashboard) window.PBDashboard.render();
  }

  function unitScope(unit) {
    if (!currentPhase) return unit;
    return unit.phases.find(p => p.phase === currentPhase) || unit;
  }

  function buildPhaseSelector(unit) {
    const select = document.getElementById('unit-phase-filter');
    if (!select) return;
    const phases = [...new Set(unit.phases.map(p => p.phase).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    select.innerHTML = '<option value="">Todas as fases</option>' + phases.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    select.value = currentPhase;
  }

  function rowLabel(row) {
    return row.criterion || row.step || row.component || row.grouping || row.subphase || row.phase || 'Item sem identificação';
  }

  function renderDelayedItems(unit) {
    const rows = unit.details
      .filter(row => !currentPhase || row.phase === currentPhase)
      .filter(row => Number.isFinite(row.variance) && row.variance < 0)
      .sort((a,b) => a.variance - b.variance);

    const unique = [];
    const seen = new Set();
    for (const row of rows) {
      const label = rowLabel(row);
      const key = [row.phase,row.subphase,row.grouping,row.component,row.step,row.criterion].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ ...row, displayLabel: label });
      if (unique.length >= 7) break;
    }

    const count = document.getElementById('delay-count');
    const list = document.getElementById('delay-list');
    if (count) count.textContent = `${integer.format(rows.length)} em atraso`;
    if (!list) return;
    if (!unique.length) {
      list.innerHTML = '<div class="delay-empty">Nenhum item com desvio negativo para esta seleção.</div>';
      return;
    }
    list.innerHTML = unique.map((row,index) => {
      const context = [row.subphase,row.grouping,row.component,row.step].filter(Boolean).filter(v => v !== row.displayLabel).slice(-2).join(' • ');
      return `<div class="delay-item">
        <span class="delay-rank">${String(index+1).padStart(2,'0')}</span>
        <div class="delay-copy"><strong>${escapeHtml(row.displayLabel)}</strong><span>${escapeHtml(context || row.phase || '')}</span></div>
        <div class="delay-metrics"><b>${pp(row.variance)}</b><small>${percent(row.actual)} / ${percent(row.planned)}</small></div>
      </div>`;
    }).join('');
  }

  function renderFinancialHeader(unit, curve) {
    const title = document.getElementById('unit-curve-unit');
    const dateEl = document.getElementById('unit-curve-date');
    const summaryEl = document.getElementById('unit-financial-summary');
    const sourceEl = document.getElementById('unit-curve-source');
    if (title) title.textContent = titleCaseUnit(unit.rawName).toUpperCase();
    if (dateEl) dateEl.textContent = 'Data-base: ' + date(model.dataBase);
    if (sourceEl) sourceEl.textContent = curve?.source === 'financial-sheets' ? 'Fonte: BLContratual + BLPlanAtaq + Corrente + BLProjetada' : 'Fonte legada: CURVAS';
    if (!summaryEl) return;
    const s = curve?.summary;
    if (!s) {
      summaryEl.innerHTML = '<div class="financial-summary-empty">Resumo financeiro não disponível para esta unidade.</div>';
      return;
    }
    const diffClass = v => Number.isFinite(v) && v >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <div class="financial-summary-row financial-summary-head">
        <span>Referência</span><span>Previsto Acum.</span><span>Real Acum.</span><span>Diferença</span>
      </div>
      <div class="financial-summary-row">
        <strong>BL Contratual</strong><span>${currency(s.contractualValue)}</span><span>${currency(s.actualValue)}</span><b class="${diffClass(s.contractualDifference)}">${currency(s.contractualDifference)}</b>
      </div>
      <div class="financial-summary-row attack">
        <strong>Plano de Ataque</strong><span>${currency(s.planValue)}</span><span>${currency(s.actualValue)}</span><b class="${diffClass(s.planDifference)}">${currency(s.planDifference)}</b>
      </div>`;
  }

  function renderUnitSummary() {
    if (!currentUnit) return;
    const u = currentUnit;
    const scope = unitScope(u);
    const phaseRows = currentPhase ? u.phases.filter(p => p.phase === currentPhase) : u.phases;

    document.getElementById('unit-kpis').innerHTML = [
      kpi('Previsto', percent(scope.planned), currentPhase ? currentPhase : 'Avanço físico da unidade', '#60a5fa'),
      kpi('Realizado', percent(scope.actual), currentPhase ? currentPhase : 'Avanço físico da unidade', '#22d3ee'),
      kpi('Desvio', pp(scope.variance), 'Previsto x realizado', scope.variance >= 0 ? '#22c55e' : '#ef4444'),
      kpi('Valor previsto', currency(scope.plannedValue), currentPhase ? 'Escopo da fase' : 'Escopo da unidade', '#8b5cf6'),
      kpi('Valor realizado', currency(scope.actualValue), 'Acumulado', '#14b8a6')
    ].join('');

    document.getElementById('phase-table').innerHTML = phaseRows.map(p => {
      const s = DataModel.statusFor(p.variance);
      return `<tr><td>${escapeHtml(p.phase)}</td><td class="numeric">${percent(p.planned)}</td><td class="numeric">${percent(p.actual)}</td><td class="numeric">${pp(p.variance)}</td><td>${status({status:s})}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Sem fases disponíveis.</td></tr>';

    DashboardCharts.phaseProgress(phaseRows);
    renderDelayedItems(u);

    renderFinancialHeader(u, u.curve);
    const curveOk = DashboardCharts.financialCurve(u.curve);
    const empty = document.getElementById('unit-curve-empty');
    if (empty) empty.classList.toggle('hidden', curveOk);

    buildFilters(u);
    renderDetails();
  }

  function renderUnit(index) {
    currentUnit = model.units[index];
    currentPhase = '';
    buildPhaseSelector(currentUnit);
    renderUnitSummary();
    showPage('unit');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-unit-index="${index}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = currentUnit.rawName;
  }

  function setPhaseFilter(value) {
    currentPhase = value || '';
    const select = document.getElementById('unit-phase-filter');
    if (select && select.value !== currentPhase) select.value = currentPhase;
    renderUnitSummary();
  }

  function buildFilters(unit) {
    const fields = [['subphase','Subfase'],['grouping','Agrupamento'],['component','Componente'],['step','Etapa']];
    document.getElementById('unit-filters').innerHTML = `<input id="detail-search" type="search" placeholder="Pesquisar no detalhamento...">` + fields.map(([key,label]) => {
      const values = [...new Set(unit.details.filter(r => !currentPhase || r.phase === currentPhase).map(r => r[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
      return `<select data-filter="${key}"><option value="">${label}: todos</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>`;
    }).join('');
  }

  function renderDetails() {
    if (!currentUnit) return;
    const query = (document.getElementById('detail-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const selections = Object.fromEntries([...document.querySelectorAll('#unit-filters select')].map(el => [el.dataset.filter, el.value]));
    const rows = currentUnit.details.filter(row => {
      if (currentPhase && row.phase !== currentPhase) return false;
      const selected = Object.entries(selections).every(([key,value]) => !value || row[key] === value);
      const haystack = [row.phase,row.subphase,row.grouping,row.component,row.step,row.criterion].join(' ').toLocaleLowerCase('pt-BR');
      return selected && (!query || haystack.includes(query));
    });
    document.getElementById('detail-count').textContent = `${integer.format(rows.length)} itens`;
    document.getElementById('detail-body').innerHTML = rows.slice(0,750).map(row => `<tr>
      <td>${escapeHtml(row.phase)}</td><td>${escapeHtml(row.subphase)}</td><td>${escapeHtml(row.grouping)}</td><td>${escapeHtml(row.component)}</td><td>${escapeHtml(row.step)}</td><td>${escapeHtml(row.criterion)}</td>
      <td class="numeric">${percent(row.planned)}</td><td class="numeric">${percent(row.actual)}</td><td class="numeric">${pp(row.variance)}</td>
      <td class="numeric">${quantity(row.plannedQuantity)}</td><td class="numeric">${quantity(row.actualQuantity)}</td><td>${escapeHtml(row.measureUnit)}</td></tr>`).join('');
    if (rows.length > 750) document.getElementById('detail-count').textContent += ' (750 exibidos)';
  }

  function renderAnalyses() {
    DashboardCharts.unitProgress(model.units, 'analysis-progress-chart', 'analysisProgress');
    DashboardCharts.variance(model.units);
  }

  function toggleSort() { unitSortAscending = !unitSortAscending; renderUnitsTable(); }

  window.Dashboard = { init, showPage, renderUnit, setPhaseFilter, renderDetails, toggleSort, format: { percent, pp, currency, quantity, date, escapeHtml }, getModel: () => model };
}());
