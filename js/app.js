(function () {
  const input = document.getElementById('excel-input');
  const upload = document.getElementById('upload-view');
  const app = document.getElementById('app-shell');
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('upload-error');

  async function load(file) {
    errorBox.classList.add('hidden');
    loading.classList.remove('hidden');
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      const parsed = await ExcelReader.readWorkbook(file);
      const model = DataModel.buildDataModel(parsed);
      Dashboard.init(model, file.name);
      upload.classList.add('hidden');
      app.classList.remove('hidden');
      Dashboard.showPage('executive');
    } catch (error) {
      errorBox.textContent = error.message || 'Erro inesperado ao processar o arquivo.';
      errorBox.classList.remove('hidden');
      upload.classList.remove('hidden');
      app.classList.add('hidden');
    } finally { loading.classList.add('hidden'); input.value=''; }
  }

  input.addEventListener('change', event => { const file=event.target.files?.[0]; if(file) load(file); });
  document.getElementById('change-file').addEventListener('click', () => input.click());
  document.addEventListener('click', event => {
    const page = event.target.closest('[data-page]')?.dataset.page;
    const unitIndex = event.target.closest('[data-unit-index]')?.dataset.unitIndex;
    if (page) Dashboard.showPage(page);
    if (unitIndex != null) Dashboard.renderUnit(Number(unitIndex));
    if (event.target.closest('[data-action="presentation"]')) Presentation.open();
  });
  document.getElementById('sort-units').addEventListener('click', Dashboard.toggleSort);
  document.getElementById('unit-filters').addEventListener('input', Dashboard.renderDetails);
  document.getElementById('unit-filters').addEventListener('change', Dashboard.renderDetails);
  document.getElementById('prev-slide').addEventListener('click', Presentation.previous);
  document.getElementById('next-slide').addEventListener('click', Presentation.next);
  document.getElementById('close-presentation').addEventListener('click', Presentation.close);
  document.getElementById('fullscreen').addEventListener('click', Presentation.fullscreen);
  document.getElementById('export-pdf').addEventListener('click', PDFExport.exportPDF);
  document.addEventListener('keydown', Presentation.onKey);
}());
