(function () {
  let current = 0;
  const fmt = () => Dashboard.format;

  function bar(label, value, kind) {
    const width = Math.min(100, Math.max(0, (value || 0) * 100));
    return `<div><div class="slide-bar-label"><span>${label}</span><strong>${fmt().percent(value)}</strong></div><div class="progress-track"><span class="bar ${kind}" style="width:${width}%"></span></div></div>`;
  }

  function slideShell(title, subtitle, kpis, body) {
    const model = Dashboard.getModel();
    return `<article class="slide"><div class="slide-head"><div><p class="eyebrow">${subtitle}</p><h2>${fmt().escapeHtml(title)}</h2></div><div class="slide-date">BI EPC-15<br>Data-base ${fmt().date(model.dataBase)}</div></div><div class="slide-kpis">${kpis}</div>${body}</article>`;
  }

  function kpi(label, value) { return `<div class="slide-kpi"><span>${label}</span><strong>${value}</strong></div>`; }

  function render() {
    const model = Dashboard.getModel();
    const c = model.contract;
    const worst = [...model.units].sort((a,b) => (a.variance ?? 0) - (b.variance ?? 0)).slice(0,5);
    const summary = slideShell('Resumo geral', 'CONTRATO EPC-15',
      kpi('Valor do contrato', fmt().currency(c.plannedValue)) + kpi('Previsto', fmt().percent(c.planned)) + kpi('Realizado', fmt().percent(c.actual)) + kpi('Desvio', fmt().pp(c.variance)),
      `<div class="slide-grid"><div class="slide-panel"><h3>Avanço físico</h3><div class="slide-bars">${bar('Previsto',c.planned,'planned')}${bar('Realizado',c.actual,'actual')}</div></div><div class="slide-panel"><h3>Maiores desvios</h3><div class="slide-ranking">${worst.map(u=>`<div class="slide-ranking-row"><span>${fmt().escapeHtml(u.code)}</span><strong>${fmt().pp(u.variance)}</strong></div>`).join('')}</div></div></div>`);
    const unitSlides = model.units.map(unit => {
      const phases = [...unit.phases].sort((a,b) => (a.variance ?? 0) - (b.variance ?? 0)).slice(0,5);
      return slideShell(unit.rawName, 'UNIDADE',
        kpi('Previsto',fmt().percent(unit.planned)) + kpi('Realizado',fmt().percent(unit.actual)) + kpi('Desvio',fmt().pp(unit.variance)) + kpi('Valor previsto',fmt().currency(unit.plannedValue)),
        `<div class="slide-grid"><div class="slide-panel"><h3>Avanço da unidade</h3><div class="slide-bars">${bar('Previsto',unit.planned,'planned')}${bar('Realizado',unit.actual,'actual')}</div></div><div class="slide-panel"><h3>Principais fases e desvios</h3><div class="slide-ranking">${phases.map(p=>`<div class="slide-ranking-row"><span>${fmt().escapeHtml(p.phase)}</span><strong>${fmt().pp(p.variance)}</strong></div>`).join('') || '<span class="muted">Sem fases comparáveis.</span>'}</div></div></div>`);
    });
    document.getElementById('slides').innerHTML = summary + unitSlides.join('');
    current = 0;
    update();
  }

  function update() {
    const slides = [...document.querySelectorAll('.slide')];
    current = Math.max(0, Math.min(current, slides.length - 1));
    slides.forEach((slide,index) => slide.classList.toggle('active', index === current));
    document.getElementById('slide-counter').textContent = `${current + 1} / ${slides.length}`;
  }
  function open() { render(); document.getElementById('presentation').classList.remove('hidden'); document.body.style.overflow='hidden'; }
  function close() { document.getElementById('presentation').classList.add('hidden'); document.body.style.overflow=''; }
  function next() { current += 1; update(); }
  function previous() { current -= 1; update(); }
  async function fullscreen() { const el=document.getElementById('presentation'); if(!document.fullscreenElement) await el.requestFullscreen?.(); else await document.exitFullscreen?.(); }
  function onKey(event) { if (document.getElementById('presentation').classList.contains('hidden')) return; if(event.key==='ArrowRight')next(); if(event.key==='ArrowLeft')previous(); if(event.key==='Escape'&&!document.fullscreenElement)close(); }

  window.Presentation = { open, close, next, previous, fullscreen, onKey };
}());
