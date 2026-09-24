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

  function financialCurve(curve) {
    if (registry.unitCurve) { registry.unitCurve.destroy(); delete registry.unitCurve; }
    if (!curve?.series?.length) return false;
    const canvas = document.getElementById('unit-curve-chart');
    if (!canvas) return false;

    const palette = ['#60a5fa','#f59e0b','#0f172a','#22c55e','#8b5cf6','#ef4444'];
    let labels = curve.series.find(s => s.categories?.length)?.categories || [];
    const maxLen = Math.max(...curve.series.map(s => s.values?.length || 0), labels.length);
    if (!labels.length) labels = Array.from({length:maxLen}, (_,i) => String(i+1));

    const allValues = curve.series.flatMap(s => s.values || []).filter(Number.isFinite);
    const asPercent = allValues.length && Math.max(...allValues.map(v => Math.abs(v))) <= 1.5;
    const datasets = curve.series.map((s,i) => ({
      label: s.name,
      data: (s.values || []).map(v => Number.isFinite(v) ? (asPercent ? v * 100 : v) : null),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      borderWidth: i === 2 ? 2.2 : 1.6,
      borderDash: /BL|BASE|PLANO/i.test(s.name) ? [5,4] : [],
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: .12,
      spanGaps: true
    }));

    registry.unitCurve = new Chart(canvas, {
      type:'line',
      data:{labels,datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'top',align:'start',labels:{color:'#334155',usePointStyle:true,boxWidth:7,font:{size:10}}},
          tooltip:{callbacks:{label:ctx => {
            const v=ctx.parsed.y;
            return Number.isFinite(v) ? ctx.dataset.label + ': ' + v.toLocaleString('pt-BR',{maximumFractionDigits:2}) + (asPercent?'%':'') : ctx.dataset.label + ': —';
          }}}
        },
        scales:{
          x:{grid:{color:'rgba(15,23,42,.08)'},ticks:{color:'#64748b',maxRotation:90,minRotation:0,autoSkip:true,maxTicksLimit:16,font:{size:9}}},
          y:{beginAtZero:true,suggestedMax:asPercent?100:undefined,grid:{color:'rgba(15,23,42,.10)'},ticks:{color:'#64748b',callback:v=>asPercent?v+'%':v}}
        }
      }
    });
    return true;
  }

  window.DashboardCharts = { unitProgress, phaseProgress, variance, financialCurve };
}());
