(function () {
  window.EPC15_CONFIG = Object.freeze({
    sheets: { primary: 'Avanço PLATAQ', summary: 'PPT_RESUMO' },
    headerSearchLimit: 15,
    columns: {
      level: 3, unit: 4, phase: 5, subphase: 6, grouping: 7,
      component: 8, step: 9, criterion: 10, weight: 11,
      plannedValue: 12, plannedQuantity: 13, measureUnit: 14,
      actualValue: 15, actualQuantity: 16,
      plannedPercent: 24, actualPercent: 25, variance: 26,
      weightedVariance: 27
    },
    status: {
      good: 0,
      attention: -0.03,
      labels: { good: 'No prazo', attention: 'Atenção', critical: 'Crítico' }
    },
    colors: {
      blue: '#3b82f6', cyan: '#22d3ee', green: '#22c55e',
      orange: '#f59e0b', red: '#ef4444', grid: 'rgba(148,163,184,.15)'
    }
  });
}());
