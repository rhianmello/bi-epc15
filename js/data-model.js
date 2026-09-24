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

  function buildDataModel(parsed) {
    const normalized = parsed.primary.slice(parsed.headerRow + 1).map((row, i) => normalizeRow(row, parsed.headerRow + 1 + i));
    const contractIndexes = [];
    normalized.forEach((row, i) => { if (row.level === 0 && /CONTRATO/i.test(row.unit)) contractIndexes.push(i); });
    if (!contractIndexes.length) throw new Error('A linha consolidada do contrato (nível 0) não foi encontrada.');

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
      const curve = curveForUnit(parsed.curvesCharts, identity.code, summary.unit);
      return { ...summary, ...identity, rawName: summary.unit, phases, details: leaves, curve, status: statusFor(summary.variance) };
    });

    let dateValue = findSummaryValue(parsed.summary, 'DATA-BASE');
    if (dateValue == null) dateValue = parsed.primary[0]?.[c.weightedVariance];
    const dataBase = excelDate(dateValue);
    return {
      contract: { ...contract, status: statusFor(contract.variance) },
      units,
      dataBase,
      metadata: {
        sheetNames: parsed.workbook.SheetNames,
        primaryBlockRows: primaryBlock.length,
        ignoredSecondaryBlocks: Math.max(0, contractIndexes.length - 1),
        summaryAvailable: Boolean(parsed.summary),
        curvesAvailable: Boolean(parsed.curvesCharts?.length)
      }
    };
  }

  window.DataModel = { buildDataModel, statusFor };
}());
