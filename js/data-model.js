(function () {
  const cfg = window.EPC15_CONFIG;
  const c = cfg.columns;
  const text = value => value == null ? '' : String(value).trim();
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const levelOf = row => Number.isFinite(Number(row?.[c.level])) ? Number(row[c.level]) : null;

  function excelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
    if (typeof value !== 'number') return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
  }

  function statusFor(variance) {
    if (!Number.isFinite(variance)) return { key: 'unknown', label: 'Sem dado' };
    if (variance >= cfg.status.good) return { key: 'good', label: cfg.status.labels.good };
    if (variance >= cfg.status.attention) return { key: 'attention', label: cfg.status.labels.attention };
    return { key: 'critical', label: cfg.status.labels.critical };
  }

  function normalizeRow(row, sourceIndex) {
    return {
      sourceIndex, level: levelOf(row),
      unit: text(row[c.unit]), phase: text(row[c.phase]), subphase: text(row[c.subphase]),
      grouping: text(row[c.grouping]), component: text(row[c.component]), step: text(row[c.step]),
      criterion: text(row[c.criterion]), weight: number(row[c.weight]),
      plannedValue: number(row[c.plannedValue]), plannedQuantity: number(row[c.plannedQuantity]),
      measureUnit: text(row[c.measureUnit]), actualValue: number(row[c.actualValue]),
      actualQuantity: number(row[c.actualQuantity]), planned: number(row[c.plannedPercent]),
      actual: number(row[c.actualPercent]), variance: number(row[c.variance]),
      weightedVariance: number(row[c.weightedVariance])
    };
  }

  function displayUnit(raw) {
    const code = raw.match(/U-\d{4}/i)?.[0]?.toUpperCase();
    if (code) return { code, name: raw.replace(/[–-]\s*.*/u, '').trim() === code ? raw : raw };
    if (/IMPLANTAÇÃO/i.test(raw)) return { code: 'IMPLANTAÇÃO', name: raw };
    return { code: raw, name: raw };
  }

  function findSummaryValue(summary, label) {
    if (!summary) return null;
    for (const row of summary) {
      const index = row.findIndex(cell => text(cell).toUpperCase() === label.toUpperCase());
      if (index >= 0) return row.slice(index + 1).find(value => value != null && value !== '') ?? null;
    }
    return null;
  }

  function leafRows(rows) {
    return rows.filter((row, index) => {
      const next = rows[index + 1];
      return !next || next.level <= row.level;
    });
  }

  function normalizedUnitKey(value) {
    const raw = text(value).toUpperCase();
    const match = raw.match(/U\s*-?\s*(\d{4})/);
    if (match) return 'U-' + match[1];
    return /IMPLANTA/.test(raw) ? 'IMPLANTAÇÃO' : raw.replace(/\s+/g, ' ');
  }

  function curveForUnit(charts, code, rawName) {
    if (!Array.isArray(charts) || !charts.length) return null;
    const keys = [normalizedUnitKey(code), normalizedUnitKey(rawName)].filter(Boolean);
    const exact = charts.find(chart => keys.includes(normalizedUnitKey(chart.unitCode)));
    if (exact) return exact;
    return charts.find(chart => {
      const haystack = normalizedUnitKey(chart.title);
      return keys.some(key => key && haystack.includes(key));
    }) || null;
  }


  function excelSerial(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
    return Math.round((date.getTime() - Date.UTC(1899,11,30)) / 86400000);
  }

  function dateLabel(serial) {
    const d = excelDate(serial);
    if (!d) return '';
    return String(d.getUTCDate()).padStart(2,'0') + '/' + String(d.getUTCMonth()+1).padStart(2,'0') + '/' + String(d.getUTCFullYear()).slice(-2);
  }

  function cumulativeMap(record, denominator, dateSet) {
    const map = new Map();
    if (!record || !Number.isFinite(denominator) || denominator <= 0) return map;
    const daily = new Map();
    (record.dates || []).forEach((serial,i) => daily.set(Number(serial), Number(record.values?.[i]) || 0));
    let cumulative = 0;
    [...dateSet].sort((a,b)=>a-b).forEach(serial => {
      cumulative += daily.get(serial) || 0;
      map.set(serial, Math.max(0, Math.min(1, cumulative / denominator)));
    });
    return map;
  }

  function financialCurveForUnit(sources, code, rawName, dataBase, fallbackActualValue) {
    if (!sources) return null;
    const contractual = sources.contractual?.units?.[code] || null;
    const planAttack = sources.planAttack?.units?.[code] || null;
    const current = sources.current?.units?.[code] || null;
    const projected = sources.projected?.units?.[code] || null;
    if (!contractual && !planAttack && !current && !projected) return null;

    const total = [planAttack?.total, contractual?.total, current?.total, projected?.total]
      .find(v => Number.isFinite(v) && v > 0) || null;
    if (!total) return null;

    const dateSet = new Set();
    [contractual, planAttack, current, projected].forEach(record => (record?.dates || []).forEach(v => {
      const serial = Number(v);
      if (Number.isFinite(serial)) dateSet.add(serial);
    }));
    const dataSerial = excelSerial(dataBase);
    if (Number.isFinite(dataSerial)) dateSet.add(dataSerial);
    const serials = [...dateSet].sort((a,b)=>a-b);
    if (!serials.length) return null;

    const contractualMap = cumulativeMap(contractual,total,serials);
    const planMap = cumulativeMap(planAttack,total,serials);

    const currentActual = [current?.actual, fallbackActualValue].find(v => Number.isFinite(v) && v >= 0);
    const actualPct = Number.isFinite(currentActual) ? Math.max(0,Math.min(1,currentActual/total)) : null;

    // Real do arquivo atual é um snapshot acumulado. Não inventamos histórico:
    // mostramos o ponto real na data-base e o projetado parte exatamente desse ponto.
    const realValues = serials.map(serial => Number.isFinite(dataSerial) && serial === dataSerial ? actualPct : null);

    const projectedDaily = new Map();
    (projected?.dates || []).forEach((serial,i) => projectedDaily.set(Number(serial), Number(projected.values?.[i]) || 0));
    let futurePct = actualPct;
    const projectedValues = serials.map(serial => {
      if (!Number.isFinite(actualPct) || !Number.isFinite(dataSerial) || serial < dataSerial) return null;
      if (serial === dataSerial) return actualPct;
      futurePct = Math.min(1, futurePct + (projectedDaily.get(serial) || 0) / total);
      return futurePct;
    });

    const valuesAt = map => serials.map(serial => map.has(serial) ? map.get(serial) : null);
    const atOrBefore = map => {
      if (!Number.isFinite(dataSerial)) return null;
      let value = null;
      serials.forEach(serial => { if (serial <= dataSerial && map.has(serial)) value = map.get(serial); });
      return value;
    };
    const contractualPct = atOrBefore(contractualMap);
    const planPct = atOrBefore(planMap);

    return {
      source: 'financial-sheets',
      unitCode: code,
      title: rawName || planAttack?.name || contractual?.name || code,
      total,
      serials,
      labels: serials.map(dateLabel),
      series: [
        { key:'planAttack', name:'Plan.Ataq - % Acum', values:valuesAt(planMap) },
        { key:'contractual', name:'BLcontratual - % Acum', values:valuesAt(contractualMap) },
        { key:'real', name:'Real - % Acum', values:realValues },
        { key:'projected', name:'Projetado - % Acum', values:projectedValues }
      ],
      summary: {
        dataSerial,
        contractualPct,
        planPct,
        actualPct,
        contractualValue: Number.isFinite(contractualPct) ? contractualPct * total : null,
        planValue: Number.isFinite(planPct) ? planPct * total : null,
        actualValue: Number.isFinite(currentActual) ? currentActual : null,
        contractualDifference: Number.isFinite(currentActual) && Number.isFinite(contractualPct) ? currentActual - contractualPct*total : null,
        planDifference: Number.isFinite(currentActual) && Number.isFinite(planPct) ? currentActual - planPct*total : null
      }
    };
  }

  function buildDataModel(parsed) {
    const normalized = parsed.primary.slice(parsed.headerRow + 1).map((row, i) => normalizeRow(row, parsed.headerRow + 1 + i));
    const contractIndexes = [];
    normalized.forEach((row, i) => { if (row.level === 0 && /CONTRATO/i.test(row.unit)) contractIndexes.push(i); });
    if (!contractIndexes.length) throw new Error('A linha consolidada do contrato (nível 0) não foi encontrada.');

    let dateValue = findSummaryValue(parsed.summary, 'DATA-BASE');
    if (dateValue == null) dateValue = parsed.primary[0]?.[c.weightedVariance];
    const dataBase = excelDate(dateValue);

    const start = contractIndexes[0];
    const end = contractIndexes[1] ?? normalized.length;
    const primaryBlock = normalized.slice(start, end);
    const contract = primaryBlock[0];
    const unitStarts = [];
    primaryBlock.forEach((row, i) => { if (row.level === 1 && row.unit) unitStarts.push(i); });
    if (!unitStarts.length) throw new Error('Nenhuma unidade consolidada (nível 1) foi encontrada no primeiro bloco.');

    const units = unitStarts.map((unitIndex, position) => {
      const nextIndex = unitStarts[position + 1] ?? primaryBlock.length;
      const summary = primaryBlock[unitIndex];
      const segment = primaryBlock.slice(unitIndex + 1, nextIndex);
      const phases = segment.filter(row => row.level === 2);
      const leaves = leafRows(segment.filter(row => row.level >= 2));
      const identity = displayUnit(summary.unit);
      const rawFinancialCurve = financialCurveForUnit(parsed.financialSources, identity.code, summary.unit, dataBase, summary.actualValue);
      const legacyCurve = curveForUnit(parsed.curvesCharts, identity.code, summary.unit);
      const curve = rawFinancialCurve || legacyCurve;
      return { ...summary, ...identity, rawName: summary.unit, phases, details: leaves, curve, status: statusFor(summary.variance) };
    });

    return {
      contract: { ...contract, status: statusFor(contract.variance) },
      units,
      dataBase,
      metadata: {
        sheetNames: parsed.workbook.SheetNames,
        primaryBlockRows: primaryBlock.length,
        ignoredSecondaryBlocks: Math.max(0, contractIndexes.length - 1),
        summaryAvailable: Boolean(parsed.summary),
        curvesAvailable: Boolean(parsed.curvesCharts?.length),
        financialSourcesAvailable: Boolean(parsed.financialSources?.planAttack || parsed.financialSources?.contractual)
      }
    };
  }

  window.DataModel = { buildDataModel, statusFor };
}());
