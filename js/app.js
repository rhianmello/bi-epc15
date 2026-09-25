(function () {
  const input = document.getElementById('excel-input');
  const upload = document.getElementById('upload-view');
  const app = document.getElementById('app-shell');
  const loading = document.getElementById('loading');
  const loadingTitle = document.getElementById('loading-title');
  const loadingDetail = document.getElementById('loading-detail');
  const errorBox = document.getElementById('upload-error');
  const openEpc = document.getElementById('open-epc-dashboard');
  const openRundown = document.getElementById('open-rundown-dashboard');
  const loginGate = document.getElementById('login-gate');
  const loginForm = document.getElementById('login-form');
  const loginUser = document.getElementById('login-user');
  const loginPass = document.getElementById('login-pass');
  const loginError = document.getElementById('login-error');
  const loginCancel = document.getElementById('login-cancel');
  const selectDashboard = document.getElementById('select-excel-dashboard');
  const selectEmpty = document.getElementById('select-excel-empty');
  const emptyState = document.getElementById('dashboard-empty');
  const sourceStatus = document.getElementById('source-status');
  const publishButton = document.getElementById('publish-update');
  const publishedButton = document.getElementById('use-published');
  const AUTH_KEY = 'bi_epc15_basic_auth';

  let pendingAccess = null;
  let hasData = false;
  let currentModel = null;
  let currentFile = null;
  let currentPublication = null;

  function cloudReady() { return Boolean(window.CloudSync?.ready?.()); }

  function isAuthenticated() {
    if (sessionStorage.getItem(AUTH_KEY) !== '1') return false;
    return !cloudReady() || Boolean(window.CloudSync?.hasCredentials?.());
  }

  function setSource(text, tone = 'neutral') {
    if (!sourceStatus) return;
    sourceStatus.textContent = text;
    sourceStatus.dataset.tone = tone;
  }

  function setLoading(title, detail) {
    if (loadingTitle) loadingTitle.textContent = title;
    if (loadingDetail) loadingDetail.textContent = detail;
  }

  function showLoading(title, detail) {
    setLoading(title, detail);
    loading.classList.remove('hidden');
  }

  function hideLoading() { loading.classList.add('hidden'); }

  function requestAccess(action) {
    if (isAuthenticated()) {
      Promise.resolve(action()).catch(console.error);
      return;
    }
    pendingAccess = action;
    loginError?.classList.add('hidden');
    loginGate?.classList.remove('hidden');
    setTimeout(() => loginUser?.focus(), 0);
  }

  function closeLogin() {
    pendingAccess = null;
    loginGate?.classList.add('hidden');
    if (loginPass) loginPass.value = '';
    if (loginError) loginError.classList.add('hidden');
  }

  function openDashboard() {
    upload.classList.add('hidden');
    app.classList.remove('hidden');
    Dashboard.showPage('executive');
  }

  function publicationLabel(publication) {
    if (!publication) return 'Fonte atual: versão publicada';
    const when = publication.published_at
      ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(publication.published_at))
      : '';
    const version = publication.version_no ? 'V' + publication.version_no : '';
    return ['Fonte atual: versão publicada', version, when].filter(Boolean).join(' • ');
  }

  function applyModel(model, fileMeta, options = {}) {
    currentModel = model;
    currentFile = fileMeta || {};
    currentPublication = options.publication || null;
    Dashboard.init(model, currentFile.name || options.publication?.file_name || 'Versão publicada');
    hasData = true;
    emptyState?.classList.add('hidden');
    if (publishButton) publishButton.disabled = !cloudReady();

    if (options.origin === 'published') {
      setSource(publicationLabel(options.publication), 'cloud');
    } else {
      const name = currentFile.name || 'Excel local';
      setSource('Fonte atual: Excel local • ' + name + ' • ainda não publicado', 'local');
    }
  }

  async function loadPublished({ keepLocalOnError = true } = {}) {
    if (!cloudReady()) {
      setSource(hasData ? sourceStatus.textContent : 'Supabase ainda não configurado • use o Excel local', 'warning');
      return false;
    }
    if (!window.CloudSync.hasCredentials()) return false;

    showLoading('Carregando versão publicada...', 'Buscando o snapshot atual no Supabase.');
    try {
      const result = await window.CloudSync.loadCurrent();
      if (!result) {
        if (!hasData) setSource('Nenhuma versão publicada no Supabase', 'warning');
        return false;
      }
      window.PBDashboard?.importManualData?.(result.pbManual);
      applyModel(result.model, {
        name: result.publication.file_name,
        size: result.publication.file_size,
        lastModified: result.publication.file_last_modified
      }, { origin:'published', publication:result.publication });
      openDashboard();
      return true;
    } catch (error) {
      if (!hasData || !keepLocalOnError) setSource('Supabase indisponível • carregue o Excel local', 'error');
      else setSource('Supabase indisponível • mantendo o Excel local já carregado', 'warning');
      console.error(error);
      return false;
    } finally {
      hideLoading();
    }
  }

  async function openEpcDashboard() {
    openDashboard();
    if (!hasData) await loadPublished();
  }

  async function load(file) {
    errorBox.classList.add('hidden');
    showLoading('Analisando o arquivo...', 'Validando abas, hierarquia, curvas e indicadores.');
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      const parsed = await ExcelReader.readWorkbook(file);
      const model = DataModel.buildDataModel(parsed);
      applyModel(model, {
        name:file.name,
        size:file.size,
        lastModified:file.lastModified
      }, { origin:'local' });
      openDashboard();
    } catch (error) {
      errorBox.textContent = error.message || 'Erro inesperado ao processar o arquivo.';
      errorBox.classList.remove('hidden');
      openDashboard();
    } finally {
      hideLoading();
      input.value='';
    }
  }

  async function publishCurrent() {
    if (!currentModel) return;
    if (!cloudReady()) {
      setSource('Supabase ainda não configurado • publicação indisponível', 'warning');
      return;
    }
    showLoading('Publicando atualização...', 'Gravando uma nova versão sem apagar o histórico.');
    publishButton.disabled = true;
    try {
      const publication = await window.CloudSync.publish({
        model: currentModel,
        fileName: currentFile?.name || currentPublication?.file_name || 'dataset-local',
        fileSize: Number(currentFile?.size ?? currentPublication?.file_size),
        fileLastModified: currentFile?.lastModified || currentPublication?.file_last_modified || null,
        pbManual: window.PBDashboard?.exportManualData?.() || {}
      });
      currentPublication = publication;
      setSource(publicationLabel(publication), 'cloud');
    } catch (error) {
      setSource('Falha ao publicar • os dados locais foram preservados', 'error');
      console.error(error);
    } finally {
      publishButton.disabled = !cloudReady();
      hideLoading();
    }
  }

  input.addEventListener('change', event => {
    const file=event.target.files?.[0];
    if(file) load(file);
  });

  openEpc?.addEventListener('click', () => requestAccess(openEpcDashboard));
  openRundown?.addEventListener('click', event => {
    event.preventDefault();
    const href = openRundown.href;
    requestAccess(() => { window.location.href = href; });
  });

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const user = (loginUser?.value || '').trim();
    const pass = loginPass?.value || '';
    let valid = user.toLowerCase() === 'admin' && pass === '12345678';

    if (cloudReady()) {
      try {
        valid = await window.CloudSync.verifyAccess(user, pass);
      } catch (error) {
        // Fallback local: o BI não fica bloqueado se o Supabase estiver fora do ar.
        valid = user.toLowerCase() === 'admin' && pass === '12345678';
        if (valid) {
          window.CloudSync.setCredentials(user, pass);
          setSource('Supabase indisponível • login local ativo', 'warning');
        }
      }
    } else if (valid) {
      window.CloudSync?.setCredentials?.(user, pass);
    }

    if (valid) {
      sessionStorage.setItem(AUTH_KEY, '1');
      loginGate?.classList.add('hidden');
      loginError?.classList.add('hidden');
      if (loginPass) loginPass.value = '';
      const action = pendingAccess;
      pendingAccess = null;
      if (action) await action();
    } else {
      loginError?.classList.remove('hidden');
      loginPass?.select();
    }
  });

  loginCancel?.addEventListener('click', closeLogin);
  selectDashboard?.addEventListener('click', () => input.click());
  selectEmpty?.addEventListener('click', () => input.click());
  document.getElementById('change-file').addEventListener('click', () => input.click());
  publishButton?.addEventListener('click', publishCurrent);
  publishedButton?.addEventListener('click', () => requestAccess(() => loadPublished({keepLocalOnError:true})));

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
  document.getElementById('unit-phase-filter')?.addEventListener('change', event => Dashboard.setPhaseFilter(event.target.value));
  document.getElementById('unit-filters').addEventListener('input', Dashboard.renderDetails);
  document.getElementById('unit-filters').addEventListener('change', Dashboard.renderDetails);
  document.getElementById('prev-slide').addEventListener('click', Presentation.previous);
  document.getElementById('next-slide').addEventListener('click', Presentation.next);
  document.getElementById('close-presentation').addEventListener('click', Presentation.close);
  document.getElementById('fullscreen').addEventListener('click', Presentation.fullscreen);
  document.getElementById('export-pdf').addEventListener('click', PDFExport.exportPDF);
  document.addEventListener('keydown', Presentation.onKey);

  setSource(cloudReady() ? 'Supabase pronto • abra o BI para carregar a versão publicada' : 'Supabase ainda não configurado • Excel local disponível', cloudReady() ? 'cloud' : 'neutral');
}());
