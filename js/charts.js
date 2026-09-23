(function () {
  const cfg = window.EPC15_CONFIG;
  const registry = {};
  Chart.defaults.color = '#8fa4bd';
  Chart.defaults.borderColor = cfg.colors.grid;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

  function replace(id, canvasId, config) {
    if (registry[id]) registry[id].destroy();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    registry[id] = new Chart(canvas, config);
  }

  function percentValue(value) {
    return Number.isFinite(value) ? value * 100 : null;
  }

  function unitProgress(units, canvasId, id) {
    replace(id, canvasId, {
      type: 'bar',
      data: { labels: units.map(u => u.code), datasets: [
        { label: 'Previsto', data: units.map(u => percentValue(u.planned)), backgroundColor: 'rgba(59,130,246,.78)', borderRadius: 5 },
        { label: 'Realizado', data: units.map(u => percentValue(u.actual)), backgroundColor: 'rgba(34,211,238,.8)', borderRadius: 5 }
      ] },
      options: commonOptions('%')
    });
  }

  function phaseProgress(phases) { unitProgress(phases.map(p => ({ ...p, code: p.phase })), 'phase-chart', 'phase'); }

  function variance(units) {
    replace('variance', 'variance-chart', {
      type: 'bar',
      data: { labels: units.map(u => u.code), datasets: [{
        label: 'Desvio (p.p.)', data: units.map(u => percentValue(u.variance)),
        backgroundColor: units.map(u => !Number.isFinite(u.variance) ? cfg.colors.neutral : u.variance >= 0 ? cfg.colors.green : u.variance >= cfg.status.attention ? cfg.colors.orange : cfg.colors.red), borderRadius: 5
      }] },
      options: commonOptions(' p.p.', true)
    });
  }

  function commonOptions(suffix, horizontal) {
    return {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 7 } }, tooltip: { callbacks: { label: ctx => Number.isFinite(ctx.raw) ? `${ctx.dataset.label}: ${ctx.raw.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}` : `${ctx.dataset.label}: Sem dado` } } },
      scales: { x: { grid: { color: cfg.colors.grid }, ticks: horizontal ? { callback: value => `${value}%` } : {} }, y: { grid: { color: horizontal ? 'transparent' : cfg.colors.grid }, beginAtZero: true, ticks: horizontal ? {} : { callback: value => `${value}%` } } }
    };
  }

  window.DashboardCharts = { unitProgress, phaseProgress, variance };
}());
