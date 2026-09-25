(function () {
  const KEY = 'epc15_coordination_deck_v2';
  const LEGACY_KEY = 'epc15_coordination_ppt_v1';
  let pageIndex = 0;
  let installed = false;

  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const norm = value => String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const clean = value => String(value == null ? '' : value).replace(/\s+/g,' ').trim();

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
  }

  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
    pageIndex = 0;
    render();
    document.dispatchEvent(new CustomEvent('coordinationdeckchange'));
  }

  function clear() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch (_) {}
    pageIndex = 0;
    render();
    document.dispatchEvent(new CustomEvent('coordinationdeckchange'));
  }

  function localChildren(node, name) {
    return [...node.getElementsByTagNameNS('*', name)];
  }

  function shapeBlocks(doc) {
    const out = [];
    const shapes = [...doc.getElementsByTagNameNS('*','sp')];
    shapes.forEach(sp => {
      const paragraphs = [...sp.getElementsByTagNameNS('*','p')];
      const paraTexts = paragraphs.map(p => [...p.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join('')).map(clean).filter(Boolean);
      const text = clean(paraTexts.join(' '));
      if (!text) return;
      const xfrm = sp.getElementsByTagNameNS('*','xfrm')[0];
      const off = xfrm?.getElementsByTagNameNS('*','off')[0];
      const ext = xfrm?.getElementsByTagNameNS('*','ext')[0];
      out.push({
        text,
        x: Number(off?.getAttribute('x')) || 0,
        y: Number(off?.getAttribute('y')) || 0,
        cx: Number(ext?.getAttribute('cx')) || 0,
        cy: Number(ext?.getAttribute('cy')) || 0
      });
    });
    return out.sort((a,b) => a.y - b.y || a.x - b.x);
  }

  function tableRows(doc) {
    const tables = [];
    [...doc.getElementsByTagNameNS('*','tbl')].forEach(tbl => {
      const rows = [];
      [...tbl.getElementsByTagNameNS('*','tr')].forEach(tr => {
        const row = [];
        [...tr.children].filter(el => el.localName === 'tc').forEach(tc => {
          const paragraphs = [...tc.getElementsByTagNameNS('*','p')];
          const text = paragraphs.map(p => [...p.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join('')).map(clean).filter(Boolean).join('\n');
          row.push(text);
        });
        if (row.some(Boolean)) rows.push(row);
      });
      if (rows.length) tables.push(rows);
    });
    return tables;
  }

  function parsePct(value) {
    const m = String(value || '').replace(/−/g,'-').match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
    return m ? Number(m[1].replace('.','').replace(',','.')) / 100 : null;
  }

  function metricBelow(blocks, labelPattern, parser) {
    const label = blocks.find(b => labelPattern.test(norm(b.text)));
    if (!label) return null;
    const candidates = blocks
      .filter(b => b.y > label.y && b.y < label.y + 600000 && Math.abs(b.x - label.x) < 2600000)
      .map(b => ({ b, v: parser(b.text) }))
      .filter(x => Number.isFinite(x.v))
      .sort((a,b) => (a.b.y - label.y) - (b.b.y - label.y) || Math.abs(a.b.x-label.x)-Math.abs(b.b.x-label.x));
    return candidates[0]?.v ?? null;
  }

  function looksLikeTopic(block) {
    const n = norm(block.text);
    if (!n || block.text.length > 120) return false;
    if (/CAUSA RAIZ|PLANO DE RECUPERACAO|PONTOS DE ATENCAO|REGISTRO FOTOGRAFICO|ACRESCENTAR DESTAQUES|REUNIAO DE COORDENACAO|RESUMO DA FASE|PREVISTO|REALIZADO|DESVIO|VALOR PREVISTO|DATA BASE|BL PLANO|ESCALA/.test(n)) return false;
    if (/^R\$|%/.test(block.text)) return false;
    const letters = block.text.replace(/[^A-Za-zÀ-ÿ]/g,'');
    if (!letters) return false;
    const uppercase = block.text.replace(/[^A-ZÀ-Ý]/g,'').length;
    return uppercase / Math.max(1, letters.length) > 0.55 || block.text.includes('·');
  }

  function uniqueText(blocks) {
    const seen = new Set();
    const out = [];
    blocks.forEach(b => {
      const t = clean(b.text);
      const n = norm(t);
      if (!t || seen.has(n)) return;
      seen.add(n);
      out.push(t);
    });
    return out.join('\n');
  }

  function actionsFromAttention(blocks) {
    const head = blocks.find(b => norm(b.text).includes('PONTOS DE ATENCAO'));
    if (!head) return [];
    const region = blocks.filter(b => b.y > head.y + 150000);
    const topics = region
      .filter(b => b.x < 3500000 && looksLikeTopic(b))
      .sort((a,b)=>a.y-b.y);
    const actions = [];
    topics.forEach((topic, index) => {
      const nextY = topics[index+1]?.y ?? Infinity;
      const segment = region.filter(b => b.y >= topic.y && b.y < nextY && b !== topic);
      const causeLabel = segment.find(b => norm(b.text) === 'CAUSA RAIZ');
      const planLabel = segment.find(b => norm(b.text) === 'PLANO DE RECUPERACAO');
      if (!causeLabel && !planLabel) return;
      const cause = uniqueText(segment.filter(b =>
        b.x < 5500000 &&
        b.y > (causeLabel?.y ?? topic.y) &&
        !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text)) &&
        !looksLikeTopic(b)
      ));
      const plan = uniqueText(segment.filter(b =>
        b.x >= 5500000 &&
        b.y > (planLabel?.y ?? topic.y) &&
        !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text))
      ));
      if (cause || plan) actions.push({ topic: clean(topic.text), cause, plan, source:'attention' });
    });
    return actions;
  }

  function actionsFromSituation(blocks) {
    const head = blocks.find(b => norm(b.text) === 'SITUACAO DA FASE');
    if (!head) return [];
    const region = blocks.filter(b => b.y > head.y && b.x > 10000000);
    const topics = region.filter(b => looksLikeTopic(b)).sort((a,b)=>a.y-b.y);
    const actions = [];
    topics.forEach((topic,index) => {
      const nextY = topics[index+1]?.y ?? Infinity;
      const segment = region.filter(b => b.y > topic.y && b.y < nextY && b !== topic);
      const planLabel = segment.find(b => norm(b.text) === 'PLANO DE RECUPERACAO');
      const content = segment.filter(b => !/CAUSA RAIZ|PLANO DE RECUPERACAO/.test(norm(b.text)));
      const cause = uniqueText(content.filter(b => !planLabel || b.y < planLabel.y));
      const plan = uniqueText(content.filter(b => planLabel && b.y > planLabel.y));
      if (cause || plan) actions.push({ topic: clean(topic.text), cause, plan, source:'situation' });
    });
    return actions;
  }

  function classifyTables(tables) {
    const disciplines = [];
    const deliveries = [];
    const actions = [];
    const equipment = [];
    tables.forEach(rows => {
      if (!rows.length) return;
      const headers = rows[0].map(norm);
      const first = headers[0] || '';
      const prevIdx = headers.findIndex(h => h.includes('PREVISTO'));
      const realIdx = headers.findIndex(h => h.includes('REALIZADO'));
      const causeIdx = headers.findIndex(h => h.includes('CAUSA') || h.includes('CAUSAL') || h.includes('EVIDENCIA'));
      const planIdx = headers.findIndex(h => h.includes('PLANO'));
      if (causeIdx >= 0 && planIdx >= 0) {
        rows.slice(1).forEach(row => {
          const topic = clean(row[0]);
          const cause = clean(row[causeIdx]);
          const plan = clean(row[planIdx]);
          if (topic && (cause || plan)) actions.push({ topic, cause, plan, source:'table' });
        });
      } else if (first.includes('DISCIPLINA') && prevIdx >= 0 && realIdx >= 0) {
        rows.slice(1).forEach(row => {
          if (!clean(row[0])) return;
          disciplines.push({ name:clean(row[0]), planned:parsePct(row[prevIdx]), actual:parsePct(row[realIdx]) });
        });
      } else if (first.includes('ENTREGA') && prevIdx >= 0 && realIdx >= 0) {
        const devIdx = headers.findIndex(h => h.includes('DESVIO'));
        const statusIdx = headers.findIndex(h => h.includes('SITUACAO'));
        rows.slice(1).forEach(row => {
          if (!clean(row[0]) || norm(row[0]).startsWith('TOTAL')) return;
          deliveries.push({
            name:clean(row[0]), planned:parsePct(row[prevIdx]), actual:parsePct(row[realIdx]),
            variance:devIdx>=0?parsePct(row[devIdx]):null, status:statusIdx>=0?clean(row[statusIdx]):''
          });
        });
      } else if (first.includes('EQUIPAMENTO') || first.includes('MATERIAL')) {
        rows.slice(1).forEach(row => {
          if (!clean(row[0])) return;
          equipment.push({ name:clean(row[0]), application:clean(row[1]), qty:clean(row[2]), orderDate:clean(row[3]), delivery:clean(row[4]), status:clean(row[5]) });
        });
      }
    });
    return { disciplines, deliveries, actions, equipment };
  }

  function inferPhase(blocks) {
    const marker = blocks.find(b => norm(b.text) === 'RESUMO DA FASE');
    if (!marker) return '';
    const candidate = blocks
      .filter(b => b.y > marker.y && b.y < marker.y + 700000 && Math.abs(b.x-marker.x) < 2200000)
      .filter(b => !/RESUMO DA FASE|VALOR PREVISTO|REUNIAO DE COORDENACAO|DATA BASE|BL PLANO/.test(norm(b.text)))
      .sort((a,b)=>a.y-b.y)[0];
    return clean(candidate?.text);
  }

  function inferUnitName(blocks, unitBlock) {
    if (!unitBlock) return '';
    const candidate = blocks
      .filter(b => b.y > unitBlock.y && b.y < unitBlock.y + 800000 && Math.abs(b.x-unitBlock.x)<1800000)
      .filter(b => !/^U\s*-?\s*\d{4}/i.test(b.text))
      .sort((a,b)=>a.y-b.y)[0];
    return clean(candidate?.text);
  }

  function parseSlide(doc, number) {
    const blocks = shapeBlocks(doc);
    const tables = tableRows(doc);
    const structured = classifyTables(tables);
    const unitBlock = blocks.find(b => /U\s*-\s*\d{4}/i.test(b.text));
    const unitCode = unitBlock ? (unitBlock.text.match(/U\s*-\s*\d{4}/i)?.[0] || '').replace(/\s+/g,'').toUpperCase() : '';
    const unitName = inferUnitName(blocks, unitBlock);
    const phase = inferPhase(blocks);
    const dataBaseBlock = blocks.find(b => /DATA-?BASE\s+\d{2}\/\d{2}\/\d{4}/i.test(b.text));
    const dataBase = dataBaseBlock?.text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
    const valueBlock = blocks.find(b => /^R\$\s*[\d.]+/i.test(b.text));
    const weightBlock = blocks.find(b => /%\s*DO\s*CONTRATO/i.test(norm(b.text)));
    const planned = metricBelow(blocks,/^PREVISTO/,parsePct);
    const actual = metricBelow(blocks,/^REALIZADO/,parsePct);
    const variance = metricBelow(blocks,/^DESVIO/,parsePct);
    const actionList = [...structured.actions, ...actionsFromAttention(blocks), ...actionsFromSituation(blocks)];
    const dedup = [];
    const seen = new Set();
    actionList.forEach(a => {
      const key = [norm(a.topic),norm(a.cause),norm(a.plan)].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      dedup.push({ ...a, sourceSlide:number });
    });
    const rawText = blocks.map(b=>b.text).join('\n');
    return {
      number, unitCode, unitName, phase, dataBase,
      value: clean(valueBlock?.text), weight: clean(weightBlock?.text),
      planned, actual, variance,
      disciplines: structured.disciplines,
      deliveries: structured.deliveries,
      equipment: structured.equipment,
      actions: dedup,
      rawText
    };
  }

  async function parse(file) {
    if (!window.JSZip) throw new Error('Leitor de PowerPoint indisponível.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const files = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
    const parser = new DOMParser();
    const slides = [];
    for (const name of files) {
      const xml = await zip.file(name).async('text');
      const doc = parser.parseFromString(xml,'application/xml');
      slides.push(parseSlide(doc, Number(name.match(/slide(\d+)/)[1])));
    }
    return { version:2, fileName:file.name, importedAt:new Date().toISOString(), slides };
  }

  function scope() {
    return {
      unit: document.getElementById('pb-unit-filter')?.value || '',
      phase: document.getElementById('pb-phase-filter')?.value || ''
    };
  }

  function samePhase(a,b) {
    const na=norm(a), nb=norm(b);
    return !na || !nb ? !na && !nb : na===nb || na.includes(nb) || nb.includes(na);
  }

  function pagesFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length) return [];
    let slides = data.slides;
    if (unit) slides = slides.filter(s => s.unitCode === unit);
    else slides = slides.filter(s => !s.unitCode);
    if (phase) slides = slides.filter(s => samePhase(s.phase, phase));
    return slides;
  }

  function actionsFor(unit, phase) {
    const data = read();
    if (!data?.slides?.length || !unit) return [];
    return data.slides
      .filter(s => s.unitCode === unit && (!phase || samePhase(s.phase,phase)))
      .flatMap(s => (s.actions || []).map(a => ({...a, unitCode:s.unitCode, unitName:s.unitName, phase:s.phase, dataBase:s.dataBase, sourceSlide:s.number})));
  }

  const stop = new Set(['DE','DA','DO','DAS','DOS','E','A','O','AS','OS','EM','COM','PARA','POR','NO','NA','NOS','NAS','FASE','PROJETO','SERVICOS','SERVICO','CONSTRUCAO']);
  function tokens(value) {
    return norm(value).split(' ').filter(t => t.length>=4 && !stop.has(t));
  }

  function matchAction(unit, phase, label, context) {
    const source = norm(label + ' ' + context);
    const st = new Set(tokens(source));
    let best = null;
    actionsFor(unit,phase).forEach(action => {
      const topic = norm(action.topic);
      const at = tokens(topic);
      let overlap = at.filter(t=>st.has(t)).length;
      let score = at.length ? overlap / at.length : 0;
      if (topic && source.includes(topic)) score += .8;
      if (source && topic.includes(source) && source.length>5) score += .5;
      if (!best || score > best.score) best = {...action,score};
    });
    return best && best.score >= .34 ? best : null;
  }

  function fmtPct(v) {
    return Number.isFinite(v) ? new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(v*100)+'%' : '—';
  }

  function ensurePanel() {
    const page = document.getElementById('page-pb');
    if (!page || document.getElementById('coordination-deck-panel')) return;
    const panel = document.createElement('article');
    panel.id = 'coordination-deck-panel';
    panel.className = 'coordination-deck-panel hidden';
    panel.innerHTML =
      '<div class="coordination-deck-toolbar">' +
        '<div><p class="eyebrow">BASE DA APRESENTAÇÃO</p><h3>PowerPoint estruturado</h3><small id="coordination-deck-file"></small></div>' +
        '<div class="coordination-deck-actions">' +
          '<button type="button" id="coordination-prev">← Anterior</button>' +
          '<span id="coordination-counter">0 / 0</span>' +
          '<button type="button" id="coordination-next">Próxima →</button>' +
          '<button type="button" id="coordination-download">Baixar página</button>' +
          '<button type="button" id="coordination-clear">Limpar PPT</button>' +
        '</div>' +
      '</div>' +
      '<div id="coordination-deck-warning" class="coordination-deck-warning hidden"></div>' +
      '<div id="coordination-deck-page" class="coordination-deck-page"></div>';
    const layout = page.querySelector('.pb-layout');
    layout?.insertAdjacentElement('afterend', panel);
    document.getElementById('coordination-prev')?.addEventListener('click',()=>{pageIndex--;render();});
    document.getElementById('coordination-next')?.addEventListener('click',()=>{pageIndex++;render();});
    document.getElementById('coordination-clear')?.addEventListener('click',clear);
    document.getElementById('coordination-download')?.addEventListener('click',downloadCurrent);
  }

  function miniTable(title, rows, columns) {
    if (!rows?.length) return '';
    return '<section class="coordination-block"><h4>'+esc(title)+'</h4><div class="coordination-table-wrap"><table><thead><tr>'+
      columns.map(c=>'<th>'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(r=>'<tr>'+columns.map(c=>'<td>'+esc(c.format?c.format(r[c.key]):r[c.key])+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div></section>';
  }

  function actionCards(actions) {
    if (!actions?.length) return '';
    return '<section class="coordination-block"><h4>Causa raiz × Plano de recuperação</h4><div class="coordination-action-list">'+
      actions.map(a=>'<article class="coordination-action-card"><strong>'+esc(a.topic)+'</strong><div><span>CAUSA RAIZ</span><p>'+esc(a.cause||'Não informado no PPT')+'</p></div><div><span>PLANO DE RECUPERAÇÃO</span><p>'+esc(a.plan||'Não informado no PPT')+'</p></div><small>Slide '+a.sourceSlide+'</small></article>').join('')+
      '</div></section>';
  }

  function renderSlide(slide) {
    const header = (slide.unitCode ? esc(slide.unitCode + (slide.unitName?' — '+slide.unitName:'')) : 'CONTRATO EPC-15') +
      (slide.phase ? '<span>'+esc(slide.phase)+'</span>' : '');
    const metrics = [Number.isFinite(slide.planned)?['Previsto',fmtPct(slide.planned)]:null,Number.isFinite(slide.actual)?['Realizado',fmtPct(slide.actual)]:null,Number.isFinite(slide.variance)?['Desvio',fmtPct(slide.variance)]:null].filter(Boolean);
    let body = '';
    body += miniTable('Entregas de projeto',slide.deliveries,[
      {key:'name',label:'Entrega'},{key:'planned',label:'Previsto',format:fmtPct},{key:'actual',label:'Realizado',format:fmtPct},{key:'variance',label:'Desvio',format:fmtPct},{key:'status',label:'Situação'}
    ]);
    body += miniTable('Disciplinas / pacotes',slide.disciplines,[
      {key:'name',label:'Disciplina'},{key:'planned',label:'Previsto',format:fmtPct},{key:'actual',label:'Realizado',format:fmtPct}
    ]);
    body += miniTable('Equipamentos e materiais',slide.equipment,[
      {key:'name',label:'Equipamento / material'},{key:'application',label:'Aplicação'},{key:'delivery',label:'Entrega prevista'},{key:'status',label:'Status'}
    ]);
    body += actionCards(slide.actions);
    if (!body) {
      const concise = slide.rawText.split('\n').filter(Boolean).slice(0,22).join('\n');
      body = '<section class="coordination-block coordination-raw"><h4>Conteúdo identificado</h4><p>'+esc(concise)+'</p></section>';
    }
    return '<header class="coordination-page-head"><div><small>SLIDE '+slide.number+'</small><h3>'+header+'</h3></div><div class="coordination-page-meta">'+
      (slide.value?'<strong>'+esc(slide.value)+'</strong>':'')+(slide.dataBase?'<span>PPT: '+esc(slide.dataBase)+'</span>':'')+'</div></header>'+
      (metrics.length?'<div class="coordination-page-kpis">'+metrics.map(m=>'<div><span>'+m[0]+'</span><strong>'+m[1]+'</strong></div>').join('')+'</div>':'')+
      '<div class="coordination-page-body">'+body+'</div>';
  }

  function render() {
    ensurePanel();
    const panel = document.getElementById('coordination-deck-panel');
    const host = document.getElementById('coordination-deck-page');
    const counter = document.getElementById('coordination-counter');
    const file = document.getElementById('coordination-deck-file');
    const warning = document.getElementById('coordination-deck-warning');
    if (!panel || !host) return;
    const data = read();
    if (!data?.slides?.length) {
      panel.classList.add('hidden');
      host.innerHTML='';
      const legacy = (()=>{try{return JSON.parse(localStorage.getItem(LEGACY_KEY)||'null')}catch(_){return null}})();
      if (legacy?.slides?.length) {
        panel.classList.remove('hidden');
        host.innerHTML='<div class="coordination-empty">Existe uma importação antiga do PowerPoint. Reimporte o arquivo para mapear Unidade, Fase, Causa Raiz e Plano de Recuperação.</div>';
      }
      return;
    }
    panel.classList.remove('hidden');
    if (file) file.textContent=(data.fileName||'PowerPoint')+' • '+data.slides.length+' slides extraídos e classificados';
    const s=scope();
    const pages=pagesFor(s.unit,s.phase);
    if (!pages.length) {
      pageIndex=0;
      if(counter) counter.textContent='0 / 0';
      host.innerHTML='<div class="coordination-empty">Nenhum slide do PowerPoint corresponde ao filtro atual. Selecione outra Unidade/Fase.</div>';
      return;
    }
    pageIndex=((pageIndex%pages.length)+pages.length)%pages.length;
    const slide=pages[pageIndex];
    if(counter) counter.textContent=(pageIndex+1)+' / '+pages.length+' • slide '+slide.number;
    host.innerHTML=renderSlide(slide);
    const currentBiDate=document.getElementById('pb-date-filter')?.selectedOptions?.[0]?.textContent || '';
    if (warning) {
      const mismatch=slide.dataBase && currentBiDate && currentBiDate!=='N/D' && !currentBiDate.includes(slide.dataBase);
      warning.classList.toggle('hidden',!mismatch);
      warning.textContent=mismatch?'Atenção: o PowerPoint é de '+slide.dataBase+' e o BI está em '+currentBiDate+'. Os textos abaixo são históricos até você importar uma apresentação atualizada.':'';
    }
  }

  async function downloadCurrent() {
    const target=document.getElementById('coordination-deck-page');
    if (!target || !window.html2canvas) return;
    const canvas=await html2canvas(target,{backgroundColor:'#07111f',scale:2,useCORS:true});
    const link=document.createElement('a');
    const s=scope();
    link.download='reuniao-coordenacao_'+(s.unit||'contrato')+'_'+(s.phase?norm(s.phase).toLowerCase().replace(/\s+/g,'-'):'geral')+'.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  }

  async function importFile(file) {
    const data=await parse(file);
    write(data);
    return data;
  }

  function exportData(){ return read(); }
  function importData(data){ if(data?.slides?.length) write(data); }

  function install() {
    if (installed) return;
    installed=true;
    ensurePanel();
    const input=document.getElementById('ppt-input');
    const button=document.getElementById('select-ppt-dashboard');
    button?.addEventListener('click',()=>input?.click());
    input?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];
      if(!file) return;
      try{
        button.disabled=true;
        button.textContent='Lendo PowerPoint...';
        await importFile(file);
        window.Dashboard?.showPage?.('pb');
        window.PBDashboard?.render?.();
      }catch(error){
        alert(error.message||'Não foi possível ler o PowerPoint.');
        console.error(error);
      }finally{
        input.value='';
        button.disabled=false;
        button.textContent='Inserir PowerPoint';
      }
    });
    document.addEventListener('coordinationdeckchange',()=>window.PBDashboard?.render?.());
    render();
  }

  window.CoordinationDeck={install,render,parse,read,clear,exportData,importData,pagesFor,actionsFor,matchAction};
  window.addEventListener('DOMContentLoaded',install);
  window.addEventListener('load',()=>{install();render();});
}());
