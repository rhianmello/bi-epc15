(function () {
  const PROJECT_START = '2026-03-29';
  const PROJECT_WEEKS = 134;
  let weeks = buildFallbackWeeks();
  let selectedWeek = null;
  let unlockedWeek = null;
  let masterPassword = '';
  let currentSnapshot = null;
  let activeSnapshot = false;
  let loadedWeekNo = null;
  let usingLiveDraft = false;
  let cloudWeeksLoaded = false;
  let loadingWeeks = false;
  let loadingSnapshot = false;
  let installed = false;

  function isoDateInSaoPaulo() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0,10);
    }
  }

  function addDays(iso, days) {
    const [y,m,d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y,m-1,d + days));
    return dt.toISOString().slice(0,10);
  }

  function buildFallbackWeeks() {
    const today = isoDateInSaoPaulo();
    return Array.from({length:PROJECT_WEEKS}, (_,i) => {
      const start = addDays(PROJECT_START, i*7);
      const end = addDays(start,6);
      return {
        week_no:i+1, start_date:start, end_date:end,
        is_current:today>=start && today<=end,
        is_locked:end<today,
        has_snapshot:false, version_no:null, saved_at:null,
        excel_data_base:null, ppt_data_base:null
      };
    });
  }

  function weekByNo(no) {
    return weeks.find(w => Number(w.week_no) === Number(no)) || null;
  }

  function currentProjectWeek() {
    return weeks.find(w => w.is_current)?.week_no ||
      buildFallbackWeeks().find(w => w.is_current)?.week_no || 1;
  }

  function getSelectedWeek() {
    const select = document.getElementById('pb-week-filter');
    const fromUi = Number(select?.value);
    if (Number.isFinite(fromUi) && fromUi > 0) selectedWeek = fromUi;
    return selectedWeek || currentProjectWeek();
  }

  function fmtDate(iso) {
    if (!iso) return 'N/D';
    const s=String(iso).slice(0,10);
    const [y,m,d]=s.split('-');
    return y&&m&&d ? d+'/'+m+'/'+y : String(iso);
  }

  function shortDate(iso) {
    if (!iso) return 'N/D';
    const s=String(iso).slice(0,10);
    const [y,m,d]=s.split('-');
    return y&&m&&d ? d+'/'+m : String(iso);
  }

  function modelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    if (!value) return null;
    const raw=String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
    const m=raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? m[3]+'-'+m[2]+'-'+m[1] : null;
  }

  function fillWeekOptions(select) {
    if (!select) return;
    const previous = Number(select.value) || selectedWeek || currentProjectWeek();
    select.innerHTML = weeks.map(w => {
      const marks = [
        w.is_current ? 'ATUAL' : '',
        w.has_snapshot ? 'SALVA' : '',
        w.is_locked ? 'FECHADA' : ''
      ].filter(Boolean);
      const suffix = marks.length ? ' • ' + marks.join(' • ') : '';
      return '<option value="'+w.week_no+'">Semana '+w.week_no+' • '+shortDate(w.start_date)+'–'+shortDate(w.end_date)+suffix+'</option>';
    }).join('');
    const target = weekByNo(previous) ? previous : currentProjectWeek();
    select.value = String(target);
    selectedWeek = target;
    queueMicrotask(() => {
      ensureCloudWeeks();
      if (cloudWeeksLoaded && window.EPC15State?.hasData?.() && Number(loadedWeekNo) !== Number(target)) loadWeek(target);
    });
  }

  async function ensureCloudWeeks(force=false) {
    if (loadingWeeks || (cloudWeeksLoaded && !force)) return;
    if (!window.CloudSync?.ready?.() || !window.CloudSync?.hasCredentials?.()) return;
    loadingWeeks = true;
    try {
      const remote = await window.CloudSync.listCoordinationWeeks();
      if (remote?.length) {
        weeks = remote.map(w => ({
          ...w,
          week_no:Number(w.week_no),
          version_no:w.version_no == null ? null : Number(w.version_no),
          is_current:Boolean(w.is_current),
          is_locked:Boolean(w.is_locked),
          has_snapshot:Boolean(w.has_snapshot)
        }));
        cloudWeeksLoaded = true;
        const select=document.getElementById('pb-week-filter');
        const previous=selectedWeek || Number(select?.value) || currentProjectWeek();
        fillWeekOptions(select);
        selectedWeek=previous;
        if(select) select.value=String(previous);
        if (!currentSnapshot && window.EPC15State?.hasData?.()) await loadWeek(previous);
      }
    } catch (error) {
      console.error('Falha ao carregar calendário EPC-15', error);
    } finally {
      loadingWeeks=false;
      refreshStatus();
    }
  }

  function hasActiveSnapshot() { return activeSnapshot; }

  function isLocked() {
    return Boolean(weekByNo(getSelectedWeek())?.is_locked);
  }

  function canEdit() {
    const week=getSelectedWeek();
    return !isLocked() && Number(unlockedWeek)===Number(week) && Boolean(masterPassword);
  }

  function closeMasterModal() {
    document.getElementById('pb-master-modal')?.classList.add('hidden');
    const input=document.getElementById('pb-master-password');
    if(input) input.value='';
    document.getElementById('pb-master-error')?.classList.add('hidden');
  }

  function openMasterModal() {
    const week=weekByNo(getSelectedWeek());
    if (!week) return;
    if (week.is_locked) {
      alert('A Semana '+week.week_no+' encerrou em '+fmtDate(week.end_date)+'. Ela está em modo somente leitura e não pode mais ser alterada.');
      return;
    }
    const title=document.getElementById('pb-master-week-label');
    if(title) title.textContent='Liberar edição da Semana '+week.week_no;
    document.getElementById('pb-master-modal')?.classList.remove('hidden');
    setTimeout(()=>document.getElementById('pb-master-password')?.focus(),0);
  }

  async function unlock() {
    const input=document.getElementById('pb-master-password');
    const password=input?.value || '';
    const week=getSelectedWeek();
    const errorEl=document.getElementById('pb-master-error');
    try {
      const result=await window.CloudSync.verifyCoordinationMaster(password,week);
      if (!result?.ok) {
        if(errorEl) {
          errorEl.textContent=result?.locked ? 'Esta semana já foi encerrada e não pode mais ser modificada.' : 'Senha master incorreta.';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      masterPassword=password;
      unlockedWeek=week;
      closeMasterModal();
      // Ao liberar edição, a tela passa a usar o Excel mais recente.
      // A versão salva continua preservada até o usuário clicar em "Salvar semana".
      usingLiveDraft = true;
      activeSnapshot = false;
      window.PBDashboard?.useLive?.();
      updateEditState();
      window.PBDashboard?.render?.();
    } catch(error) {
      if(errorEl){errorEl.textContent=error.message||'Não foi possível liberar a edição.';errorEl.classList.remove('hidden');}
    }
  }

  async function loadWeek(weekNo) {
    selectedWeek=Number(weekNo);
    loadedWeekNo=selectedWeek;
    unlockedWeek=null;
    masterPassword='';
    usingLiveDraft=false;
    currentSnapshot=null;
    activeSnapshot=false;
    updateEditState();

    const week=weekByNo(selectedWeek);
    if (!week) return;

    if (!window.CloudSync?.ready?.() || !window.CloudSync?.hasCredentials?.()) {
      window.PBDashboard?.useLive?.();
      window.PBDashboard?.render?.();
      refreshStatus();
      return;
    }

    try {
      loadingSnapshot=true;
      const result=await window.CloudSync.loadCoordinationWeek(selectedWeek);
      const snapshot=result?.snapshot || null;
      if (snapshot?.dataset?.model) {
        currentSnapshot=snapshot;
        activeSnapshot=true;
        window.PBDashboard?.importWeekData?.(snapshot.pb_manual || {}, selectedWeek);
        if (snapshot.coordination_deck && Object.keys(snapshot.coordination_deck).length) {
          window.CoordinationDeck?.importData?.(snapshot.coordination_deck, selectedWeek);
        } else {
          window.CoordinationDeck?.clearWeek?.(selectedWeek);
        }
        window.PBDashboard?.useSnapshot?.(snapshot.dataset.model, snapshot.excel_file_name || ('Semana '+selectedWeek));
      } else {
        window.PBDashboard?.useLive?.();
      }
    } catch(error) {
      console.error('Falha ao carregar a Semana '+selectedWeek,error);
      window.PBDashboard?.useLive?.();
    } finally {
      loadingSnapshot=false;
      refreshStatus();
      updateEditState();
    }
  }

  async function selectWeekFromUI() {
    const week=Number(document.getElementById('pb-week-filter')?.value);
    if(!Number.isFinite(week)) return;
    await loadWeek(week);
  }

  function useLiveExcel() {
    if(!canEdit()) return;
    usingLiveDraft=true;
    activeSnapshot=false;
    window.PBDashboard?.useLive?.();
    refreshStatus();
  }

  async function saveWeek() {
    const week=getSelectedWeek();
    if(!canEdit()) {
      openMasterModal();
      return;
    }
    const model=window.EPC15State?.getCurrentModel?.();
    if(!model) {
      alert('Carregue o Excel antes de salvar a semana.');
      return;
    }
    const file=window.EPC15State?.getCurrentFile?.() || {};
    const publication=window.EPC15State?.getCurrentPublication?.() || {};
    const deck=window.CoordinationDeck?.exportData?.(week) || {};
    const deckStatus=window.CoordinationDeck?.status?.(week);
    const saveButton=document.getElementById('pb-save-week');
    try {
      if(saveButton){saveButton.disabled=true;saveButton.textContent='Salvando...';}
      const pbManual=window.PBDashboard?.exportWeekData?.(week) || {};
      const saved=await window.CloudSync.saveCoordinationWeek({
        masterPassword,
        weekNo:week,
        model,
        excelFileName:file.name || publication.file_name || 'Versão publicada',
        pptFileName:deckStatus?.fileName || null,
        pptDataBase:modelDate(deckStatus?.dataBase),
        pbManual,
        coordinationDeck:deck
      });
      usingLiveDraft=false;
      activeSnapshot=true;
      currentSnapshot={
        ...saved,
        dataset:{schema_version:'epc15_coordination_week_v1',model},
        pb_manual:pbManual,
        coordination_deck:deck
      };
      await ensureCloudWeeks(true);
      const refreshed=weekByNo(week);
      if(refreshed) refreshed.has_snapshot=true;
      window.PBDashboard?.useSnapshot?.(model, file.name || publication.file_name || 'Versão publicada');
      const badge=document.getElementById('pb-save-feedback');
      if(badge){badge.textContent='Semana '+week+' salva • V'+saved.version_no;badge.dataset.tone='ok';}
    } catch(error) {
      alert(error.message || 'Não foi possível salvar a semana.');
      const badge=document.getElementById('pb-save-feedback');
      if(badge){badge.textContent='Falha ao salvar';badge.dataset.tone='error';}
    } finally {
      if(saveButton){saveButton.textContent='Salvar semana';}
      updateEditState();
      refreshStatus();
    }
  }

  function sourceStatusText(excelIso,pptIso) {
    if(!pptIso) return {tone:'warning',text:'Sem PowerPoint salvo para esta semana'};
    if(!excelIso) return {tone:'warning',text:'Excel sem data-base comparável'};
    if(pptIso < excelIso) return {tone:'warning',text:'PPT desatualizado em relação ao Excel'};
    if(pptIso > excelIso) return {tone:'info',text:'PPT mais recente que o Excel'};
    return {tone:'ok',text:'Excel e PowerPoint alinhados na mesma data-base'};
  }

  function refreshStatus() {
    const info=window.PBDashboard?.getViewInfo?.() || {};
    const week=weekByNo(getSelectedWeek());
    const deck=window.CoordinationDeck?.status?.(getSelectedWeek());
    const excelIso=modelDate(info.dataBase);
    const pptIso=modelDate(deck?.dataBase);
    const status=sourceStatusText(excelIso,pptIso);

    const excel=document.getElementById('pb-excel-source-status');
    const ppt=document.getElementById('pb-ppt-source-status');
    const sync=document.getElementById('pb-sync-source-status');
    const weekEl=document.getElementById('pb-week-source-status');
    if(excel) excel.innerHTML='<span>EXCEL</span><strong>Data-base '+fmtDate(excelIso)+'</strong><small>'+(info.fileName||'Sem arquivo')+'</small>';
    if(ppt) ppt.innerHTML='<span>POWERPOINT</span><strong>Data-base '+fmtDate(pptIso)+'</strong><small>'+(deck?.fileName||'Não inserido nesta semana')+'</small>';
    if(sync){sync.dataset.tone=status.tone;sync.innerHTML='<span>STATUS</span><strong>'+status.text+'</strong><small>'+(usingLiveDraft?'Excel atual em preparação • ainda não salvo':'')+'</small>';}
    if(weekEl && week) {
      const state=week.is_locked?'FECHADA • somente leitura':(canEdit()?'EDIÇÃO LIBERADA':'visualização');
      const saved=currentSnapshot?.version_no ? ' • V'+currentSnapshot.version_no : (week.has_snapshot?' • salva':' • ainda não salva');
      weekEl.innerHTML='<span>SEMANA EPC-15</span><strong>Semana '+week.week_no+' • '+shortDate(week.start_date)+'–'+shortDate(week.end_date)+'</strong><small>'+state+saved+'</small>';
    }
    updateEditState();
  }

  function updateEditState() {
    const editable=canEdit();
    const locked=isLocked();
    const edit=document.getElementById('pb-edit-week');
    const ppt=document.getElementById('select-ppt-dashboard');
    const save=document.getElementById('pb-save-week');
    const live=document.getElementById('pb-use-live-excel');
    if(edit){
      edit.disabled=locked;
      edit.classList.toggle('active',editable);
      edit.title=locked?'Semana encerrada':editable?'Edição liberada':'Editar semana (senha master)';
    }
    if(ppt) ppt.disabled=!editable;
    if(save) save.disabled=!editable;
    if(live) live.disabled=!editable;
    document.getElementById('page-pb')?.classList.toggle('coordination-editing',editable);
  }

  function install() {
    if(installed) return;
    installed=true;
    const select=document.getElementById('pb-week-filter');
    fillWeekOptions(select);
    select?.addEventListener('change',selectWeekFromUI);
    document.getElementById('pb-edit-week')?.addEventListener('click',openMasterModal);
    document.getElementById('pb-master-cancel')?.addEventListener('click',closeMasterModal);
    document.getElementById('pb-master-submit')?.addEventListener('click',unlock);
    document.getElementById('pb-master-password')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();unlock();}});
    document.getElementById('pb-master-modal')?.addEventListener('click',e=>{if(e.target.id==='pb-master-modal') closeMasterModal();});
    document.getElementById('pb-save-week')?.addEventListener('click',saveWeek);
    document.getElementById('pb-use-live-excel')?.addEventListener('click',useLiveExcel);
    document.addEventListener('coordinationdeckchange',()=>{
      if(!loadingSnapshot) usingLiveDraft=true;
      refreshStatus();
      window.PBDashboard?.render?.();
    });
    ensureCloudWeeks();
    refreshStatus();
  }

  window.CoordinationWeek={
    install,fillWeekOptions,ensureCloudWeeks,getSelectedWeek,selectWeekFromUI,
    canEdit,hasActiveSnapshot,refreshStatus,useLiveExcel,saveWeek
  };
  window.addEventListener('DOMContentLoaded',install);
  window.addEventListener('load',()=>{install();ensureCloudWeeks();refreshStatus();});
}());
