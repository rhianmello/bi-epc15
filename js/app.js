(function () {
  const input = document.getElementById('excel-input');
  const upload = document.getElementById('upload-view');
  const app = document.getElementById('app-shell');
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('upload-error');
  const openEpc = document.getElementById('open-epc-dashboard');
  const selectDashboard = document.getElementById('select-excel-dashboard');
  const selectEmpty = document.getElementById('select-excel-empty');
  const emptyState = document.getElementById('dashboard-empty');
  let hasData = false;

  function openDashboard() {
    upload.classList.add('hidden');
    app.classList.remove('hidden');
    Dashboard.showPage('executive');
  }

  async function load(file) {
    errorBox.classList.add('hidden');
    loading.classList.remove('hidden');
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      const parsed = await ExcelReader.readWorkbook(file);
      const model = DataModel.buildDataModel(parsed);
      Dashboard.init(model, file.name);
      hasData = true;
      emptyState?.classList.add('hidden');
      openDashboard();
    } catch (error) {
      errorBox.textContent = error.message || 'Erro inesperado ao processar o arquivo.';
      errorBox.classList.remove('hidden');
      openDashboard();
    } finally { loading.classList.add('hidden'); input.value=''; }
  }

  input.addEventListener('change', event => { const file=event.target.files?.[0]; if(file) load(file); });
  openEpc?.addEventListener('click', openDashboard);
  selectDashboard?.addEventListener('click', () => input.click());
  selectEmpty?.addEventListener('click', () => input.click());
  document.getElementById('change-file').addEventListener('click', () => input.click());
  document.addEventListener('click', event => {
    const page = event.target.closest('[data-page]')?.dataset.page;
    const unitIndex = event.target.closest('[data-unit-index]')?.dataset.unitIndex;
    if (page) {
      if (!hasData && page !== 'executive') return;
      Dashboard.showPage(page);
    }
    if (unitIndex != null && hasData) Dashboard.renderUnit(Number(unitIndex));
    if (event.target.closest('[data-action="presentation"]') && hasData) Presentation.open();
  });
  document.getElementById('sort-units').addEventListener('click', () => { if (hasData) Dashboard.toggleSort(); });
  document.getElementById('unit-filters').addEventListener('input', Dashboard.renderDetails);
  document.getElementById('unit-filters').addEventListener('change', Dashboard.renderDetails);
  document.getElementById('prev-slide').addEventListener('click', Presentation.previous);
  document.getElementById('next-slide').addEventListener('click', Presentation.next);
  document.getElementById('close-presentation').addEventListener('click', Presentation.close);
  document.getElementById('fullscreen').addEventListener('click', Presentation.fullscreen);
  document.getElementById('export-pdf').addEventListener('click', PDFExport.exportPDF);
  document.addEventListener('keydown', Presentation.onKey);
}());
