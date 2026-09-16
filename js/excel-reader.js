(function () {
  const cfg = window.EPC15_CONFIG;

  function validateExtension(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsb', 'xlsx', 'xlsm'].includes(extension)) {
      throw new Error('Formato não suportado. Selecione um arquivo .xlsb, .xlsx ou .xlsm.');
    }
  }

  function findHeaderRow(rows) {
    const limit = Math.min(rows.length, cfg.headerSearchLimit);
    for (let i = 0; i < limit; i += 1) {
      const row = rows[i] || [];
      if (String(row[cfg.columns.level] || '').trim().toUpperCase() === 'NÍVEL' &&
          String(row[cfg.columns.unit] || '').trim().toUpperCase() === 'ENTREGA') return i;
    }
    return -1;
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
    const required = [cfg.columns.level, cfg.columns.unit, cfg.columns.plannedPercent, cfg.columns.actualPercent, cfg.columns.variance];
    if (required.some(index => !primary[headerRow] || primary[headerRow].length <= index)) {
      throw new Error('A aba Avanço PLATAQ não contém todas as colunas mínimas necessárias.');
    }
    const summary = workbook.SheetNames.includes(cfg.sheets.summary)
      ? XLSX.utils.sheet_to_json(workbook.Sheets[cfg.sheets.summary], { header: 1, raw: true, defval: null })
      : null;
    return { workbook, primary, summary, headerRow };
  }

  window.ExcelReader = { readWorkbook };
}());
