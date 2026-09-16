(function () {
  const cfg = window.EPC15_CONFIG;

  function validateExtension(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsb', 'xlsx', 'xlsm'].includes(extension)) {
      throw new Error('Formato não suportado. Selecione um arquivo .xlsb, .xlsx ou .xlsm.');
    }
  }

  function normalizeHeader(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[×*]/g, ' X ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function headerMatches(value, aliases) {
    const normalized = normalizeHeader(value);
    return aliases.some(alias => normalizeHeader(alias) === normalized);
  }

  function findHeaderRow(rows) {
    const limit = Math.min(rows.length, cfg.headerSearchLimit);
    for (let i = 0; i < limit; i += 1) {
      const row = rows[i] || [];
      if (headerMatches(row[cfg.columns.level], cfg.criticalHeaders.level.aliases) &&
          headerMatches(row[cfg.columns.unit], cfg.criticalHeaders.unit.aliases)) return i;
    }
    return -1;
  }

  function validateCriticalHeaders(row) {
    const mismatches = Object.entries(cfg.criticalHeaders).flatMap(([columnKey, expected]) => {
      const index = cfg.columns[columnKey];
      const actual = row?.[index];
      if (headerMatches(actual, expected.aliases)) return [];
      const found = String(actual ?? '').trim() || 'vazio';
      return [`${expected.label} (coluna ${XLSX.utils.encode_col(index)}): encontrado “${found}”`];
    });
    if (mismatches.length) {
      throw new Error(`Estrutura incompatível na aba ${cfg.sheets.primary}. Cabeçalhos críticos não correspondem ao formato esperado: ${mismatches.join('; ')}. Verifique se colunas foram inseridas, removidas ou reposicionadas.`);
    }
  }

  async function readWorkbook(file) {
    validateExtension(file);
    let workbook;
    try {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false });
    } catch (error) {
      throw new Error('Não foi possível ler o Excel. Confirme se o arquivo não está corrompido e tente novamente.');
    }
    if (!workbook.SheetNames.includes(cfg.sheets.primary)) {
      throw new Error(`A aba obrigatória “${cfg.sheets.primary}” não foi encontrada.`);
    }
    const primary = XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.primary], { header: 1, raw: true, defval: null });
    const headerRow = findHeaderRow(primary);
    if (headerRow < 0) throw new Error('O cabeçalho esperado da aba Avanço PLATAQ não foi identificado.');
    validateCriticalHeaders(primary[headerRow]);
    const summary = workbook.SheetNames.includes(cfg.sheets.summary)
      ? XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.summary], { header: 1, raw: true, defval: null })
      : null;
    return { workbook, primary, summary, headerRow };
  }

  window.ExcelReader = { readWorkbook };
}());
