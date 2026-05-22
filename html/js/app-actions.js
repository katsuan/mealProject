function getCurrentUserRequestBase_() {
  return {
    userId: document.getElementById('user-id').value.trim(),
    displayName: document.getElementById('display-name').value.trim(),
    idToken: state.idToken,
  };
}

function ensureUserCanProceed_(loginMessage, deniedMessage) {
  const auth = getCurrentUserRequestBase_();
  if (!auth.userId) {
    pushStatus('notice', loginMessage);
    return null;
  }
  if (!state.userPermission.canUse) {
    pushStatus('notice', deniedMessage);
    return null;
  }
  return auth;
}

function buildMealDetailRequestPayload_(overrides) {
  return Object.assign(getCurrentUserRequestBase_(), {
    logId: document.getElementById('editing-log-id').value.trim(),
    row: document.getElementById('editing-log-id').value.trim(),
    meal: document.getElementById('meal-type').value,
    mealDate: document.getElementById('meal-date').value,
    datePreset: inferDatePresetFromMealDate_(document.getElementById('meal-date').value),
    menu: document.getElementById('menu-name').value.trim(),
    masterKey: document.getElementById('master-key').value.trim(),
    flavor: document.getElementById('field-flavor').value.trim(),
    kcal: document.getElementById('field-kcal').value,
    protein: document.getElementById('field-protein').value,
    fat: document.getElementById('field-fat').value,
    carb: document.getElementById('field-carb').value,
    salt: document.getElementById('field-salt').value,
    fiber: document.getElementById('field-fiber').value,
    unit: document.getElementById('field-unit').value.trim(),
    note: document.getElementById('field-note').value.trim(),
  }, overrides || {});
}

function applyDashboardDraftResponse_(userId, result, options) {
  const config = options || {};
  state.dashboard = result.dashboard || state.dashboard;
  state.draft = result.draft || (config.keepDraft ? state.draft : null);
  state.dashboardLoaded = Boolean(state.dashboard);
  if (state.dashboard) {
    renderDashboard(state.dashboard);
  }
  if (config.renderDraft !== false) {
    renderDraft(state.draft);
  }
  if (userId && state.dashboard) {
    saveCachedAppState_(userId, state.dashboard, state.draft);
  }
  applyIdentityStatus_(result.identity);
  applyPermissionState_(result.permission);
}

function applyCandidate(index) {
  const candidate = state.draft && state.draft.candidates ? state.draft.candidates[index] : null;
  if (!candidate) return;
  document.getElementById('master-key').value = candidate.masterKey || '';
  applyNutritionFields(candidate, {
    flavor: candidate.flavor || '',
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  pushStatus('info', `「${candidate.name}」を入力欄に反映しました。内容を確認して保存してください。`);
}

function applyMasterSearchResult(index) {
  const candidate = state.masterSearchResults[index];
  if (!candidate) return;
  const currentMeal = document.getElementById('meal-type').value;
  const currentMealDate = document.getElementById('meal-date').value;
  setMenuValue_(candidate.menu || candidate.name || '');
  document.getElementById('master-key').value = candidate.masterKey || '';
  document.getElementById('editing-master-key').value = '';
  applyNutritionFields(candidate, {
    flavor: candidate.flavor || '',
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  setMealType(currentMeal, { markDirty: state.mealDirty });
  setMealDatePreset(inferDatePresetFromMealDate_(currentMealDate), currentMealDate, { markDirty: state.mealDateDirty });
  clearEditMode_();
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${candidate.name}」を入力欄へ反映しました。`);
}

function startMasterEdit(index) {
  const candidate = state.masterSearchResults[index];
  if (!candidate) return;
  const currentMeal = document.getElementById('meal-type').value;
  const currentMealDate = document.getElementById('meal-date').value;

  document.getElementById('editing-master-key').value = candidate.masterKey || '';
  document.getElementById('editing-log-id').value = '';
  document.getElementById('master-key').value = candidate.masterKey || '';
  setMenuValue_(candidate.menu || candidate.name || '');
  applyNutritionFields(candidate, {
    flavor: candidate.flavor || '',
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  setSaveTargetState_({ master: true, log: false });
  setMealType(currentMeal, { markDirty: state.mealDirty });
  setMealDatePreset(inferDatePresetFromMealDate_(currentMealDate), currentMealDate, { markDirty: state.mealDateDirty });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${candidate.name}」のマスタ編集を開きました。`);
}

async function applyPendingMenu(menu, row) {
  const resolvedMenu = decodeURIComponent(String(menu || ''));
  const rowValue = row ? String(row) : '';
  setMenuValue_(resolvedMenu);
  document.getElementById('master-key').value = '';
  document.getElementById('editing-master-key').value = '';
  document.getElementById('editing-log-id').value = rowValue;
  state.draft = null;
  state.candidateAccordionOpen = false;
  renderDraft(null);
  renderMasterSearchResults_([]);
  renderMasterSearchStatus_('メニュー名に合わせて検索します。', false);
  state.masterSearchResults = [];
  state.lastMasterSearchQuery = '';
  setSaveTargetState_({ master: true, log: true });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${resolvedMenu}」の入力欄を開きました。`);
}

function deletePendingItem(rowNumber, menuName) {
  return deleteLog(rowNumber, menuName);
}

function startNewEntryMode_(options) {
  const config = options || {};
  const currentMeal = document.getElementById('meal-type').value;
  const currentMealDate = document.getElementById('meal-date').value;
  const currentDatePreset = inferDatePresetFromMealDate_(currentMealDate);
  const replyHtml = config.preserveReply ? document.getElementById('meal-reply').innerHTML : '';
  clearEditMode_();
  document.getElementById('master-key').value = '';
  document.getElementById('meal-reply').innerHTML = replyHtml || '';
  setMenuValue_('');
  setFieldValue('field-kcal', '');
  setFieldValue('field-protein', '');
  setFieldValue('field-fat', '');
  setFieldValue('field-carb', '');
  setFieldValue('field-salt', '');
  setFieldValue('field-fiber', '');
  setFieldValue('field-unit', '');
  setFieldValue('field-flavor', '');
  setFieldValue('field-note', '');
  renderMasterSearchResults_([]);
  renderMasterSearchStatus_('メニュー名に合わせて検索します。', false);
  state.masterSearchResults = [];
  state.lastMasterSearchQuery = '';
  state.draft = null;
  state.candidateAccordionOpen = false;
  state.advancedNutritionOpen = false;
  renderAdvancedNutritionSection_();
  renderDraft(null);
  setSaveTargetState_({ master: true, log: true });
  if (config.preserveMealContext) {
    setMealType(currentMeal);
    setMealDatePreset(currentDatePreset, currentMealDate);
  }
  resetInitialQueryState_();
  document.getElementById('menu-name').focus();
  if (!config.silent) {
    pushStatus('info', '新規登録の入力に切り替えました。');
  }
  renderCurrentMealDetailCard_();
}

function startEditLog(logRef) {
  const log = state.dashboard && state.dashboard.recentLogs
    ? state.dashboard.recentLogs.find(item => String(item.logId || item.row || '') === String(logRef || ''))
    : null;
  if (!log) return;

  document.getElementById('editing-log-id').value = String(log.logId || log.row || '');
  setMenuValue_(log.menu || '');
  document.getElementById('master-key').value = log.masterKey || '';
  setMealType(log.meal || '朝');
  setMealDatePreset(inferDatePresetFromMealDate_(log.mealDate), String(log.mealDate || '').slice(0, 10));
  applyNutritionFields(log, {
    flavor: log.flavor || '',
    unit: log.unit || '',
    note: log.note || '',
  });
  setSaveTargetState_({ master: true, log: true });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${log.menu}」を編集しています。`);
}

async function deleteLog(logRef, menuName) {
  const resolvedName = decodeURIComponent(String(menuName || ''));
  if (!window.confirm(`「${resolvedName || 'この記録'}」を削除しますか？`)) {
    return;
  }
  const auth = ensureUserCanProceed_('LINEログイン後にログを削除できます。', '現在はログを編集できません。');
  if (!auth) {
    return;
  }

  setSyncVisualState(true);
  pushStatus('info', 'ログを削除中...');
  try {
    const result = await runServer('deleteMealLog', {
      userId: auth.userId,
      displayName: auth.displayName,
      idToken: auth.idToken,
      logId: logRef,
      row: logRef,
    });
    applyDashboardDraftResponse_(auth.userId, result, { renderDraft: false });
    pushStatus('info', 'ログを削除しました。');
  } catch (error) {
    pushStatus('warning', `ログ削除に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setSyncVisualState(false);
  }
}

async function saveProfileTarget() {
  const auth = ensureUserCanProceed_('LINEログイン後に目標を更新できます。', '現在は目標カロリーを更新できません。');
  if (!auth) {
    return;
  }

  setTargetSyncing(true);
  setSyncVisualState(true);
  pushStatus('info', '目標カロリーを同期中...');

  try {
    const result = await runServer('updateProfile', {
      userId: auth.userId,
      displayName: auth.displayName,
      idToken: auth.idToken,
      calorieTarget: document.getElementById('calorie-target').value,
      goalType: 'keep',
      notify: document.getElementById('notify-setting').checked,
    });

    applyDashboardDraftResponse_(auth.userId, result, { keepDraft: true });
    state.header = buildHeaderSummaryFromDashboard_(state.dashboard);
    closeSettingsModal_();
    pushStatus('info', '目標カロリーを更新しました。');
  } catch (error) {
    pushStatus('warning', `目標カロリーの更新に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setTargetSyncing(false);
    setSyncVisualState(false);
  }
}

function applyIdentityStatus_(identity) {
  if (!identity || identity.verified) return;

  if (identity.verificationError) {
    const warningKey = `${identity.userId || 'unknown'}:${identity.verificationError}`;
    if (state.identityWarningKey === warningKey) return;
    state.identityWarningKey = warningKey;
    pushStatus('notice', 'LINEプロフィールの本人確認は一部スキップしました。入力はそのまま続けられます。');
    pushStatus('debug', `本人確認の詳細: ${describeIdentityVerificationError_(identity.verificationError)}`);
  }
}

function describeIdentityVerificationError_(message) {
  const text = String(message || '').trim();
  if (!text) return 'unknown';
  if (text.includes('Invalid IdToken Audience')) {
    return `${text} (LIFFで取得したIDトークンの発行先チャンネルと、GAS側の LINE_CHANNEL_ID が一致していません)`;
  }
  return text;
}

document.getElementById('meal-detail-form').addEventListener('submit', async event => {
  event.preventDefault();

  const auth = ensureUserCanProceed_('LINEログイン後に保存できます。', '現在は管理者の許可待ちのため保存できません。');
  if (!auth) {
    return;
  }

  const editingLogId = document.getElementById('editing-log-id').value.trim();
  const targets = getSaveTargetState_();
  const editingMasterKey = document.getElementById('editing-master-key').value.trim();
  const currentMasterKey = document.getElementById('master-key').value.trim();
  const skipMasterSave = Boolean(targets.master && currentMasterKey && !editingMasterKey);

  if (!targets.master && !targets.log) {
    pushStatus('notice', 'MYメニュー登録かログ登録のどちらかを選んでください。');
    return;
  }

  setSyncVisualState(true);
  state.isMealSubmitting = true;
  refreshMealSubmitControls_();
  pushStatus('info', targets.log ? (editingLogId ? '保存内容を反映中...' : '保存内容を登録中...') : 'MYメニューを保存中...');

  try {
    const payload = buildMealDetailRequestPayload_({
      sendLineSummary: targets.log,
      saveToMaster: targets.master && !skipMasterSave,
    });
    let result;
    if (targets.log) {
      const action = editingLogId ? 'updateMealLog' : 'submitMealDetail';
      result = await runServer(action, payload);
      applyDashboardDraftResponse_(auth.userId, result);
      renderMealReplyCard_(result, payload);
      startNewEntryMode_({
        preserveMealContext: true,
        preserveReply: true,
        silent: true,
      });
      if (skipMasterSave) {
        pushStatus('info', 'MYメニュー登録済みのため、ログ保存のみ反映しました。');
      }
      pushStatus(
        'info',
        editingLogId
          ? (result.summaryPushed ? '更新してLINEに今日の集計を返しました。' : 'ログを更新しました。LINE送信は未実行です。')
          : (result.summaryPushed ? '保存してLINEに今日の集計を返しました。' : '保存しました。LINE送信は未実行です。')
      );
    } else {
      if (skipMasterSave) {
        pushStatus('notice', 'この内容はすでにMYメニュー登録済みです。');
        return;
      }
      result = await runServer('saveNutritionMasterOnly', buildMealDetailRequestPayload_({
        masterKey: editingMasterKey || currentMasterKey,
      }));
      document.getElementById('master-key').value = result.savedMaster && result.savedMaster.masterKey ? result.savedMaster.masterKey : document.getElementById('master-key').value;
      document.getElementById('editing-master-key').value = '';
      applyDashboardDraftResponse_(auth.userId, result, { keepDraft: true });
      renderMealReplyCard_({
        reply: 'MYメニューに保存しました。',
        record: null,
      }, buildMealDetailRequestPayload_());
      pushStatus('info', 'MYメニューに保存しました。');
    }
  } catch (error) {
    pushStatus('warning', `保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    state.isMealSubmitting = false;
    refreshMealSubmitControls_();
    setSyncVisualState(false);
  }
});

document.getElementById('save-target-master').addEventListener('change', refreshMealSubmitControls_);
document.getElementById('save-target-log').addEventListener('change', refreshMealSubmitControls_);

document.getElementById('save-target').addEventListener('click', saveProfileTarget);
document.getElementById('save-master-only-button').addEventListener('click', async () => {
  const auth = ensureUserCanProceed_('LINEログイン後にマスタを保存できます。', '現在はマスタを保存できません。');
  if (!auth) {
    return;
  }

  setSyncVisualState(true);
  state.isMasterSaving = true;
  refreshMealSubmitControls_();
  pushStatus('info', 'マスタを保存中...');
  try {
    const result = await runServer('saveNutritionMasterOnly', buildMealDetailRequestPayload_({
      masterKey: document.getElementById('editing-master-key').value.trim() || document.getElementById('master-key').value.trim(),
    }));
    document.getElementById('master-key').value = result.savedMaster && result.savedMaster.masterKey ? result.savedMaster.masterKey : document.getElementById('master-key').value;
    document.getElementById('editing-master-key').value = '';
    applyDashboardDraftResponse_(auth.userId, result, { keepDraft: true });
    refreshMealSubmitControls_();
    pushStatus('info', '栄養マスタを保存しました。');
  } catch (error) {
    pushStatus('warning', `マスタ保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    state.isMasterSaving = false;
    refreshMealSubmitControls_();
    setSyncVisualState(false);
  }
});
document.getElementById('start-new-entry-button').addEventListener('click', startNewEntryMode_);
document.getElementById('calorie-target').addEventListener('keydown', async event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  await saveProfileTarget();
});

function openExternalMenuSearch() {
  const query = String(
    state.lastMasterSearchQuery ||
    document.getElementById('menu-name').value ||
    document.getElementById('master-search-query').value ||
    ''
  ).trim();
  if (!query) {
    pushStatus('notice', 'メニュー名を入力してから Web検索できます。');
    return;
  }
  const url = `https://www.google.com/search?q=${encodeURIComponent(`${query} カロリー 栄養`)}`;
  window.open(url, '_blank', 'noopener');
  pushStatus('info', `「${query}」をWeb検索で開きました。`);
}

window.applyCandidate = applyCandidate;
window.applyMasterSearchResult = applyMasterSearchResult;
window.applyPendingMenu = applyPendingMenu;
window.deletePendingItem = deletePendingItem;
window.startEditLog = startEditLog;
window.deleteLog = deleteLog;
window.openExternalMenuSearch = openExternalMenuSearch;
refreshMealSubmitControls_();
initializeApp();
