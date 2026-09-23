(function () {
  let model;
  let currentUnit;
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
  }

  function renderUnitNavigation() {
    document.getElementById('unit-nav').innerHTML = model.units.map((unit, index) =>
      `<button class="nav-item unit-nav-item" data-unit-index="${index}">${escapeHtml(unit.code)}</button>`).join('');
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
    document.getElementById('page-title').textContent = page === 'executive' ? 'Visão Executiva' : page === 'analysis' ? 'Análises' : currentUnit?.rawName || 'Unidade';
  }

  function renderUnit(index) {
    currentUnit = model.units[index];
    const u = currentUnit;
    document.getElementById('unit-kpis').innerHTML = [
      kpi('Previsto', percent(u.planned), 'Avanço físico', '#60a5fa'), kpi('Realizado', percent(u.actual), 'Avanço físico', '#22d3ee'),
      kpi('Desvio', pp(u.variance), 'Pontos percentuais', u.variance >= 0 ? '#22c55e' : '#ef4444'),
      kpi('Valor previsto', currency(u.plannedValue), 'Escopo da unidade', '#8b5cf6'), kpi('Valor realizado', currency(u.actualValue), 'Acumulado', '#14b8a6')
    ].join('');
    document.getElementById('phase-table').innerHTML = u.phases.map(p => {
      const s = DataModel.statusFor(p.variance);
      return `<tr><td>${escapeHtml(p.phase)}</td><td class="numeric">${percent(p.planned)}</td><td class="numeric">${percent(p.actual)}</td><td class="numeric">${pp(p.variance)}</td><td>${status({status:s})}</td></tr>`;
    }).join('');
    DashboardCharts.phaseProgress(u.phases);
    buildFilters(u);
    renderDetails();
    showPage('unit');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-unit-index="${index}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = u.rawName;
  }

  function buildFilters(unit) {
    const fields = [['phase','Fase'],['subphase','Subfase'],['grouping','Agrupamento'],['component','Componente'],['step','Etapa']];
    document.getElementById('unit-filters').innerHTML = `<input id="detail-search" type="search" placeholder="Pesquisar no detalhamento...">` + fields.map(([key,label]) => {
      const values = [...new Set(unit.details.map(r => r[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
      return `<select data-filter="${key}"><option value="">${label}: todos</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>`;
    }).join('');
  }

  function renderDetails() {
    if (!currentUnit) return;
    const query = (document.getElementById('detail-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const selections = Object.fromEntries([...document.querySelectorAll('#unit-filters select')].map(el => [el.dataset.filter, el.value]));
    const rows = currentUnit.details.filter(row => {
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

  window.Dashboard = { init, showPage, renderUnit, renderDetails, toggleSort, format: { percent, pp, currency, quantity, date, escapeHtml }, getModel: () => model };
}());
