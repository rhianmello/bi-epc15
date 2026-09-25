(function () {
  const cfg = window.EPC15_SUPABASE_CONFIG || {};
  let client = null;
  let credentials = null;

  function ready() {
    return Boolean(cfg.enabled && cfg.url && cfg.publishableKey && window.supabase?.createClient);
  }

  function getClient() {
    if (!ready()) return null;
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    return client;
  }

  function setCredentials(username, password) {
    credentials = { username: String(username || '').trim(), password: String(password || '') };
  }

  function clearCredentials() { credentials = null; }
  function hasCredentials() { return Boolean(credentials?.username && credentials?.password); }

  async function rpc(name, args) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase ainda não está configurado.');
    if (!hasCredentials()) throw new Error('Informe o login do BI para acessar a versão publicada.');
    const { data, error } = await supabase.rpc(name, {
      p_username: credentials.username,
      p_password: credentials.password,
      ...args
    });
    if (error) throw new Error(error.message || 'Falha de comunicação com o Supabase.');
    return data;
  }

  async function verifyAccess(username, password) {
    if (!ready()) return null;
    setCredentials(username, password);
    try {
      const data = await rpc('verify_bi_access', {});
      if (data !== true) {
        clearCredentials();
        return false;
      }
      return true;
    } catch (error) {
      clearCredentials();
      throw error;
    }
  }

  function reviveModel(model) {
    if (!model || typeof model !== 'object') return model;
    const copy = JSON.parse(JSON.stringify(model));
    if (copy.dataBase) {
      const d = new Date(copy.dataBase);
      copy.dataBase = Number.isNaN(d.valueOf()) ? null : d;
    }
    return copy;
  }

  async function loadCurrent() {
    const data = await rpc('get_current_bi_snapshot', { p_dataset_type: 'epc15' });
    if (!data) return null;
    const publication = typeof data === 'string' ? JSON.parse(data) : data;
    if (!publication?.dataset?.model) throw new Error('A publicação atual está incompleta ou incompatível.');
    return {
      publication,
      model: reviveModel(publication.dataset.model),
      pbManual: publication.pb_manual || null
    };
  }

  async function publish({ model, fileName, fileSize, fileLastModified, pbManual }) {
    if (!model) throw new Error('Nenhum dataset foi carregado para publicação.');
    const dataset = {
      schema_version: cfg.schemaVersion || 'epc15_snapshot_v1',
      generated_at: new Date().toISOString(),
      model
    };
    const dataBase = model.dataBase instanceof Date && !Number.isNaN(model.dataBase.valueOf())
      ? model.dataBase.toISOString().slice(0,10)
      : null;

    const data = await rpc('publish_bi_snapshot', {
      p_dataset_type: 'epc15',
      p_file_name: fileName || 'dataset-local',
      p_file_size: Number.isFinite(fileSize) ? fileSize : null,
      p_file_last_modified: fileLastModified ? new Date(fileLastModified).toISOString() : null,
      p_data_base: dataBase,
      p_schema_version: cfg.schemaVersion || 'epc15_snapshot_v1',
      p_dataset: dataset,
      p_pb_manual: pbManual || {}
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function history(limit = 10) {
    const data = await rpc('list_bi_publications', {
      p_dataset_type: 'epc15',
      p_limit: Math.max(1, Math.min(50, Number(limit) || 10))
    });
    return Array.isArray(data) ? data : [];
  }

  window.CloudSync = {
    ready,
    setCredentials,
    clearCredentials,
    hasCredentials,
    verifyAccess,
    loadCurrent,
    publish,
    history,
    schemaVersion: cfg.schemaVersion || 'epc15_snapshot_v1'
  };
}());
