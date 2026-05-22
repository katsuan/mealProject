function setMenuValue_(value, options) {
  const config = options || {};
  const input = document.getElementById('menu-name');
  state.isProgrammaticMenuUpdate = true;
  input.value = String(value || '');
  updateFieldState(input, false);
  state.isProgrammaticMenuUpdate = false;
  syncMasterSearchQueryFromMenu_();
  state.appliedMenuValue = String(value || '').trim();
  if (config.markDirty) {
    state.menuDirty = true;
  } else if (!config.preserveDirty) {
    state.menuDirty = false;
  }
  renderCurrentMealDetailCard_();
}

function syncMasterSearchQueryFromMenu_() {
  const menuValue = String(document.getElementById('menu-name').value || '').trim();
  const queryInput = document.getElementById('master-search-query');
  queryInput.value = menuValue;
  updateFieldState(queryInput, queryInput === document.activeElement);
}

function bindMealTypeButtons() {
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    if (button.dataset.mealType) {
      button.addEventListener('click', () => setMealType(button.dataset.mealType, { markDirty: true }));
    }
  });
}

function bindViewTabs() {
  document.querySelectorAll('[data-view-tab]').forEach(button => {
    button.addEventListener('click', async () => {
      await setActiveView(button.dataset.viewTab || 'input');
    });
  });
  setActiveView(resolveInitialView_());
}

function resolveInitialView_() {
  if (['input', 'summary', 'logs'].includes(initialQuery.mode)) {
    return initialQuery.mode;
  }
  return initialQuery.mode === 'detail' ? 'summary' : 'input';
}

async function setActiveView(view) {
  const normalized = ['input', 'summary', 'logs'].includes(view) ? view : 'input';
  state.activeView = normalized;
  document.querySelectorAll('[data-view-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.viewTab === normalized);
  });
  document.querySelectorAll('[data-view-section]').forEach(section => {
    section.hidden = section.dataset.viewSection !== normalized;
  });
  if (normalized !== 'input') {
    await ensureDashboardLoaded_();
  }
}

function bindMealDateButtons() {
  document.querySelectorAll('.date-chip-btn').forEach(button => {
    button.addEventListener('click', () => setMealDatePreset(button.dataset.datePreset || 'today', null, { markDirty: true }));
  });
}

function bindLogFilterButtons() {
  document.querySelectorAll('[data-log-filter]').forEach(button => {
    button.addEventListener('click', () => setLogFilter(button.dataset.logFilter || 'all'));
  });
}

function bindLogDateButtons() {
  document.querySelectorAll('[data-log-date]').forEach(button => {
    button.addEventListener('click', () => setLogDatePreset(button.dataset.logDate || 'today'));
  });
}

function setMealType(mealType, options) {
  const config = options || {};
  const normalized = ['朝', '昼', '夜', 'その他'].includes(mealType) ? mealType : '朝';
  document.getElementById('meal-type').value = normalized;
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    if (button.dataset.mealType) {
      button.classList.toggle('is-active', button.dataset.mealType === normalized);
    }
  });
  state.mealDirty = Boolean(config.markDirty);
}

function setMealDatePreset(datePreset, mealDate, options) {
  const config = options || {};
  const normalized = datePreset === 'yesterday' ? 'yesterday' : 'today';
  const resolvedDate = mealDate || buildMealDateFromPreset_(normalized);
  document.getElementById('meal-date').value = resolvedDate;
  document.querySelectorAll('.date-chip-btn').forEach(button => {
    button.classList.toggle('is-active', button.dataset.datePreset === normalized);
  });
  document.getElementById('meal-date-label').textContent = normalized === 'yesterday'
    ? `昨日 (${formatDateLabel_(resolvedDate)}) の記録として保存します。`
    : `今日 (${formatDateLabel_(resolvedDate)}) の記録として保存します。`;
  state.mealDateDirty = Boolean(config.markDirty);
}

function buildMealDateFromPreset_(datePreset) {
  const date = new Date();
  if (datePreset === 'yesterday') {
    date.setDate(date.getDate() - 1);
  }
  return toDateInputValue_(date);
}

function inferDatePresetFromMealDate_(mealDate) {
  const target = String(mealDate || '').slice(0, 10);
  if (!target) return 'today';
  return target === buildMealDateFromPreset_('yesterday') ? 'yesterday' : 'today';
}

function toDateInputValue_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel_(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function setLogFilter(filter) {
  state.selectedLogFilter = ['朝', '昼', '夜', 'その他'].includes(filter) ? filter : 'all';
  document.querySelectorAll('[data-log-filter]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.logFilter === state.selectedLogFilter);
  });
  renderLogList();
}

function setLogDatePreset(datePreset) {
  state.selectedLogDatePreset = datePreset === 'yesterday' ? 'yesterday' : 'today';
  document.querySelectorAll('[data-log-date]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.logDate === state.selectedLogDatePreset);
  });
  const titleNode = document.querySelector('#today-log-band .section-head h2');
  if (titleNode) {
    titleNode.textContent = state.selectedLogDatePreset === 'yesterday' ? '昨日のログ' : '今日のログ';
  }
  renderLogList();
}

function bindFieldInteractions() {
  document.querySelectorAll('.field input, .field textarea').forEach(input => {
    input.addEventListener('focus', () => updateFieldState(input, true));
    input.addEventListener('blur', () => updateFieldState(input, false));
    input.addEventListener('input', () => {
      updateFieldState(input, input === document.activeElement);
      if (['field-protein', 'field-fat', 'field-carb', 'field-salt', 'field-fiber'].includes(input.id)) {
        if (String(input.value || '').trim()) {
          state.advancedNutritionOpen = true;
        }
        renderAdvancedNutritionSection_();
      }
      renderCurrentMealDetailCard_();
    });
    updateFieldState(input, false);
  });
  document.getElementById('menu-name').addEventListener('input', () => {
    if (!state.isProgrammaticMenuUpdate) {
      state.menuDirty = true;
    }
    const menuValue = String(document.getElementById('menu-name').value || '').trim();
    syncMasterSearchQueryFromMenu_();
    resetDraftUiForMenuTyping_(menuValue);
    if (!menuValue) {
      state.lastMasterSearchQuery = '';
      renderMasterSearchResults_([]);
      renderMasterSearchStatus_('メニュー名に合わせて検索します。', false);
    } else {
      renderMasterSearchStatus_('右の「検索」で呼び出せます。', false);
    }
    renderCurrentMealDetailCard_();
  });
}

function syncAllFieldStates_() {
  document.querySelectorAll('.field input, .field textarea').forEach(input => {
    updateFieldState(input, input === document.activeElement);
  });
}

function resetDraftUiForMenuTyping_(menuValue) {
  const normalizedMenu = normalizeMenuKey_(menuValue);
  const normalizedDraftMenu = normalizeMenuKey_(state.draft && state.draft.menu);
  if (!normalizedMenu || !normalizedDraftMenu || normalizedMenu === normalizedDraftMenu) {
    return;
  }
  state.draft = null;
  state.candidateAccordionOpen = false;
  renderDraft(null);
}

function renderDraftLoadingState_() {
  const candidateAccordion = document.getElementById('candidate-accordion');
  const candidateList = document.getElementById('candidate-list');
  if (candidateAccordion.hidden) return;
  state.candidateAccordionOpen = true;
  renderCandidateAccordion_();
  candidateList.innerHTML = '<div class="empty-state">候補を読み込んでいます...</div>';
}

function hasAdvancedNutritionValues_() {
  return ['field-protein', 'field-fat', 'field-carb', 'field-salt', 'field-fiber']
    .some(id => String(document.getElementById(id).value || '').trim());
}

function renderAdvancedNutritionSection_() {
  const hasValues = hasAdvancedNutritionValues_();
  const section = document.getElementById('advanced-nutrition-section');
  const toggle = document.getElementById('advanced-nutrition-toggle');
  const label = document.getElementById('advanced-nutrition-toggle-label');
  const note = document.getElementById('advanced-nutrition-note');
  const shouldOpen = state.advancedNutritionOpen || hasValues;
  section.hidden = !shouldOpen;
  toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  label.textContent = hasValues
    ? '栄養項目を表示中'
    : (shouldOpen ? '栄養項目を閉じる' : '栄養項目を開く');
  note.hidden = !hasValues;
  toggle.classList.toggle('has-note', hasValues);
}

function updateFieldState(input, isActive) {
  const field = input.closest('.field');
  if (!field) return;
  const label = field.querySelector('.field-label');
  const value = String(input.value || '').trim();
  const isRequired = input.dataset.required === 'true';

  field.classList.toggle('is-active', Boolean(isActive));
  field.classList.toggle('has-value', Boolean(value));
  field.classList.toggle('is-required-empty', Boolean(isRequired && !value));
  if (label) {
    const baseLabel = input.dataset.fieldLabel || field.dataset.label || '';
    label.textContent = isRequired && !value ? `必須: ${baseLabel}` : baseLabel;
  }
}

function renderProfileHeader() {
  const nameNode = document.getElementById('profile-name');
  if (state.displayName) {
    nameNode.innerHTML = `<span class="name-main">${escapeHtml(state.displayName)}</span><span class="name-honorific">さん</span>`;
  } else {
    nameNode.textContent = 'ログイン待ちです';
  }
  document.getElementById('display-name').value = state.displayName || '';
  const loginButton = document.getElementById('login-line');
  loginButton.hidden = Boolean(state.userId);
  loginButton.textContent = window.location.protocol === 'file:' ? '公開URLでLINEログイン' : 'LINEでログイン';

  const avatar = document.getElementById('avatar');
  const avatarButton = document.getElementById('open-settings');
  avatarButton.disabled = Boolean(state.userId && state.userPermission.canUse === false);
  avatarButton.setAttribute('aria-label', state.userId ? '設定を開く' : '最新の画面に更新');
  avatarButton.setAttribute('title', state.userId ? '設定を開く' : '最新の画面に更新');
  if (state.pictureUrl) {
    avatar.innerHTML = `<img src="${escapeHtml(state.pictureUrl)}" alt="LINE profile">`;
  } else {
    const fallback = (state.displayName || 'L').slice(0, 1);
    avatar.textContent = fallback;
  }
  avatarButton.classList.toggle('is-syncing', Boolean(state.isVisualSyncing || state.isTargetSyncing));

  refreshTargetControls();
  refreshMealSubmitControls_();
}

function applyPermissionState_(permission) {
  if (!permission) return;
  state.userPermission = permission;
  if (!permission.canUse) {
    pushStatus(
      'notice',
      permission.status === 'pending'
        ? '現在は管理者の許可待ちです。承認されると入力と更新が使えるようになります。'
        : '現在このアカウントは利用停止中です。'
    );
  }
  refreshTargetControls();
  refreshMealSubmitControls_();
  const openSettingsButton = document.getElementById('open-settings');
  if (openSettingsButton) {
    openSettingsButton.disabled = permission.canUse === false && Boolean(document.getElementById('user-id').value.trim());
  }
}

function getLocalStateKey_(userId) {
  return `${LOCAL_STATE_PREFIX}${String(userId || '').trim()}`;
}

function loadCachedAppState_(userId) {
  if (!userId || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(getLocalStateKey_(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveCachedAppState_(userId, dashboard, draft) {
  if (!userId || !window.localStorage || !dashboard) return;

  try {
    window.localStorage.setItem(getLocalStateKey_(userId), JSON.stringify({
      savedAt: new Date().toISOString(),
      dashboard: dashboard,
      draft: draft || null,
    }));
  } catch (error) {
    // Local cache is best-effort only.
  }
}

function applyCachedAppState_(userId) {
  if (initialQuery.menu) return false;
  const cached = loadCachedAppState_(userId);
  if (!cached || !cached.dashboard) return false;

  state.dashboard = cached.dashboard;
  state.draft = cached.draft || null;
  state.dashboardLoaded = true;
  renderDashboard(state.dashboard);
  renderDraft(state.draft);
  pushStatus('debug', `cache: ${cached.savedAt || 'local'} の状態を先に表示しました。`);
  return true;
}

function setSyncVisualState(isLoading) {
  state.isVisualSyncing = Boolean(isLoading);
  [
    document.getElementById('header-summary-scope'),
    state.isSettingsModalOpen ? document.getElementById('target-field') : null,
    document.getElementById('today-summary-band'),
    document.getElementById('today-log-band'),
  ].filter(Boolean).forEach(node => {
    node.classList.toggle('is-syncing-scope', Boolean(isLoading));
    node.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  });
  const avatarButton = document.getElementById('open-settings');
  if (avatarButton) {
    avatarButton.classList.toggle('is-syncing', Boolean(state.isVisualSyncing || state.isTargetSyncing));
  }
}

function applyHeaderState_(header, permission) {
  const safeHeader = header || {};
  const safePermission = permission || safeHeader.permission || { status: 'active', canUse: true, isAdmin: false, notify: true };
  state.header = safeHeader;
  state.userPermission = safePermission;
  state.headerLoaded = true;

  const input = document.getElementById('calorie-target');
  input.value = safeHeader.user && safeHeader.user.calorieTarget != null ? safeHeader.user.calorieTarget : '';
  updateFieldState(input, false);
  document.getElementById('notify-setting').checked = Boolean(safeHeader.user && safeHeader.user.notify === true);

  if (safeHeader.user && safeHeader.user.displayName && !state.displayName) {
    state.displayName = safeHeader.user.displayName;
  }

  renderHeaderSummary_(safeHeader);
  refreshTargetControls();
}

async function reloadHeaderState() {
  const userId = document.getElementById('user-id').value.trim();
  const displayName = document.getElementById('display-name').value.trim();
  if (!userId) return;

  setTargetSyncing(true);
  pushStatus('info', 'ヘッダーを同期中...');

  try {
    const result = await runServer('getHeaderState', {
      userId: userId,
      displayName: displayName,
      idToken: state.idToken,
    });
    if (result.header && result.header.user) {
      state.displayName = result.header.user.displayName || state.displayName;
    }
    renderProfileHeader();
    applyHeaderState_(result.header, result.permission);
    applyIdentityStatus_(result.identity);
    applyPermissionState_(result.permission);
    pushStatus('info', 'ヘッダーを同期しました。');
  } catch (error) {
    pushStatus('warning', `ヘッダー同期に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setTargetSyncing(false);
  }
}

async function ensureDashboardLoaded_() {
  if (state.dashboardLoaded) return;
  await reloadState();
}

async function reloadState() {
  const userId = document.getElementById('user-id').value.trim();
  const displayName = document.getElementById('display-name').value.trim();

  if (!userId) {
    state.dashboard = null;
    state.draft = null;
    state.dashboardLoaded = false;
    renderDashboard(null);
    renderDraft(null);
    renderProfileHeader();
    pushStatus('notice', 'LINEログインすると目標カロリーと今日の集計を同期できます。');
    return;
  }

  applyCachedAppState_(userId);
  setTargetSyncing(true);
  setSyncVisualState(true);
  pushStatus('info', '同期中...');

  try {
    const result = await runServer('getLiffAppState', {
      userId: userId,
      displayName: displayName,
      idToken: state.idToken,
      meal: document.getElementById('meal-type').value,
      menu: document.getElementById('menu-name').value.trim(),
      mealDate: document.getElementById('meal-date').value,
      datePreset: inferDatePresetFromMealDate_(document.getElementById('meal-date').value),
    });

    state.userId = userId;
    state.displayName = result.dashboard && result.dashboard.user
      ? (result.dashboard.user.displayName || state.displayName)
      : state.displayName;
    state.dashboard = result.dashboard || null;
    state.draft = result.draft || null;
    state.dashboardLoaded = true;

    renderProfileHeader();
    applyHeaderState_(result.header, result.permission);
    renderDashboard(state.dashboard);
    renderDraft(state.draft);
    if ((initialQuery.logId || initialQuery.row) && !document.getElementById('editing-log-id').value.trim()) {
      document.getElementById('editing-log-id').value = initialQuery.logId || initialQuery.row;
      refreshMealSubmitControls_();
    }
    saveCachedAppState_(userId, state.dashboard, state.draft);
    applyIdentityStatus_(result.identity);
    applyPermissionState_(result.permission);
    pushStatus('info', '同期しました。');
  } catch (error) {
    pushStatus('warning', `同期に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setTargetSyncing(false);
    setSyncVisualState(false);
  }
}

function renderDashboard(dashboard) {
  if (!dashboard) {
    clearEditMode_();
    document.getElementById('calorie-target').value = '';
    updateFieldState(document.getElementById('calorie-target'), false);
    renderHeaderSummary_(null);
    document.getElementById('card-estimated').textContent = '0 kcal';
    document.getElementById('card-diff').textContent = '-';
    document.getElementById('card-diff').classList.remove('is-warning');
    document.getElementById('card-diff-rate').textContent = '-';
    document.getElementById('card-diff-rate').classList.remove('is-warning');
    document.getElementById('nutrition-summary').textContent = '';
    renderPendingSummary_([]);
    renderMasterSearchResults_([]);
    document.getElementById('logs-list').innerHTML = '<div class="empty-state">ログインすると今日と昨日の記録を表示します。</div>';
    renderWeeklyChart_(null, null);
    renderRankingList_('popular-ranking', []);
    renderStreakSection_(null, []);
    refreshTargetControls();
    return;
  }

  clearEditMode_();
  document.getElementById('calorie-target').value = dashboard.user.calorieTarget ?? '';
  updateFieldState(document.getElementById('calorie-target'), false);
  renderHeaderSummary_(buildHeaderSummaryFromDashboard_(dashboard));
  document.getElementById('card-estimated').textContent = `${formatNumber(dashboard.today.totalEstimated)} kcal`;
  document.getElementById('card-diff').textContent = dashboard.targetDiff == null ? '-' : `${formatSignedNumber(-Number(dashboard.targetDiff || 0))} kcal`;
  document.getElementById('card-diff-rate').textContent = formatTargetRateLabel(dashboard);
  document.getElementById('card-diff').classList.toggle(
    'is-warning',
    dashboard.targetDiff != null && Number(dashboard.targetDiff) < 0
  );
  document.getElementById('card-diff-rate').classList.toggle(
    'is-warning',
    dashboard.targetDiff != null && Number(dashboard.targetDiff) < 0
  );
  document.getElementById('nutrition-summary').textContent =
    `たんぱく質 ${formatNumber(dashboard.today.nutrition.protein)} g / 脂質 ${formatNumber(dashboard.today.nutrition.fat)} g / 炭水化物 ${formatNumber(dashboard.today.nutrition.carb)} g`;
  renderPendingSummary_(dashboard.today.pendingItems || []);
  renderLogList();
  renderWeeklyChart_(dashboard.weekly || [], dashboard.user && dashboard.user.calorieTarget);
  renderRankingList_('popular-ranking', dashboard.popularMenus || [], buildPopularRankingItem_);
  renderStreakSection_(dashboard.streak || null, dashboard.streakRanking || []);
  document.getElementById('notify-setting').checked = Boolean(dashboard.user && dashboard.user.notify === true);
  refreshTargetControls();
}

function buildHeaderSummaryFromDashboard_(dashboard) {
  if (!dashboard) return null;
  return {
    user: dashboard.user || {},
    todayExact: Number(dashboard.today && dashboard.today.totalExact || 0),
    pendingCount: Number(dashboard.today && dashboard.today.pendingItems ? dashboard.today.pendingItems.length : 0),
  };
}

function renderHeaderSummary_(header) {
  const summary = header || {};
  const user = summary.user || {};
  const target = Number(user.calorieTarget || 0);
  const exact = Number(summary.todayExact || 0);
  const pendingCount = Number(summary.pendingCount || 0);
  const hasTarget = Number.isFinite(target) && target > 0;
  const rate = hasTarget ? Math.round((exact / target) * 100) : null;
  const exactNode = document.getElementById('header-exact-kcal');
  const targetNode = document.getElementById('header-target-kcal');

  targetNode.textContent = hasTarget ? `${formatNumber(target)} kcal` : '-';
  exactNode.textContent = hasTarget ? `${formatNumber(exact)}` : `${formatNumber(exact)} kcal`;
  document.getElementById('header-exact-rate').textContent = hasTarget ? `確定値 ${rate}%` : '確定値 -';
  document.getElementById('header-pending-count').textContent = `${pendingCount}件未記入`;
  document.getElementById('header-exact-kcal').classList.toggle('is-warning', hasTarget && rate > 100);
  document.getElementById('header-exact-rate').classList.toggle('is-warning', hasTarget && rate > 100);
}

function formatDetailValue_(value, suffix) {
  if (value == null || value === '') return '-';
  const text = typeof value === 'number' ? formatNumber(value) : String(value).trim();
  if (!text) return '-';
  return suffix ? `${text} ${suffix}` : text;
}

function buildNutritionDetailRows_(detail) {
  const safe = detail || {};
  return [
    ['メニュー名', formatDetailValue_(safe.menu || safe.name || '')],
    ['種類・メーカー / サイズ・量', formatDetailValue_(buildDetailDescriptor_(safe.flavor, safe.unit))],
    ['カロリー', formatDetailValue_(safe.kcal, 'kcal')],
    ['たんぱく質 / 脂質', `${formatDetailValue_(safe.protein, 'g')} / ${formatDetailValue_(safe.fat, 'g')}`],
    ['炭水化物 / 食塩相当量', `${formatDetailValue_(safe.carb, 'g')} / ${formatDetailValue_(safe.salt, 'g')}`],
    ['食物繊維', formatDetailValue_(safe.fiber, 'g')],
    ['メモ', formatDetailValue_(safe.note || '')],
  ];
}

function buildDetailDescriptor_(flavor, unit) {
  return [String(flavor || '').trim(), String(unit || '').trim()].filter(Boolean).join(' / ');
}

function buildNutritionDetailCardMarkup_(detail, title) {
  const rows = buildNutritionDetailRows_(detail);
  return `
    ${title ? `<div class="nutrition-detail-title">${escapeHtml(title)}</div>` : ''}
    <div class="nutrition-detail-grid">
      ${rows.map(([label, value]) => `
        <div class="nutrition-detail-row">
          <div class="nutrition-detail-label">${escapeHtml(label)}</div>
          <div class="nutrition-detail-value">${escapeHtml(value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function getCurrentMealDetail_() {
  return {
    menu: document.getElementById('menu-name').value.trim(),
    flavor: document.getElementById('field-flavor').value.trim(),
    unit: document.getElementById('field-unit').value.trim(),
    kcal: toNullableNumber_(document.getElementById('field-kcal').value),
    protein: toNullableNumber_(document.getElementById('field-protein').value),
    fat: toNullableNumber_(document.getElementById('field-fat').value),
    carb: toNullableNumber_(document.getElementById('field-carb').value),
    salt: toNullableNumber_(document.getElementById('field-salt').value),
    fiber: toNullableNumber_(document.getElementById('field-fiber').value),
    note: document.getElementById('field-note').value.trim(),
  };
}

function hasRenderableMealDetail_(detail) {
  const safe = detail || {};
  return Boolean(
    String(safe.menu || '').trim() ||
    String(safe.flavor || '').trim() ||
    String(safe.unit || '').trim() ||
    toNullableNumber_(safe.kcal) != null ||
    toNullableNumber_(safe.protein) != null ||
    toNullableNumber_(safe.fat) != null ||
    toNullableNumber_(safe.carb) != null ||
    toNullableNumber_(safe.salt) != null ||
    toNullableNumber_(safe.fiber) != null ||
    String(safe.note || '').trim()
  );
}

function renderCurrentMealDetailCard_() {
  const card = document.getElementById('meal-detail-preview');
  const detail = getCurrentMealDetail_();
  const isEditingMaster = Boolean(document.getElementById('editing-master-key').value.trim());
  const isEditingLog = Boolean(document.getElementById('editing-log-id').value.trim());
  if (!hasRenderableMealDetail_(detail)) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }

  const title = isEditingMaster
    ? 'マスタの詳細'
    : (isEditingLog ? '記録の詳細' : '入力内容の詳細');
  card.hidden = false;
  card.innerHTML = buildNutritionDetailCardMarkup_(detail, title);
}

function renderMealReplyCard_(result, fallbackDetail) {
  const reply = document.getElementById('meal-reply');
  const record = result && result.record ? result.record : null;
  const safeDetail = record || fallbackDetail || {};
  if (!hasRenderableMealDetail_(safeDetail)) {
    reply.innerHTML = result && result.reply ? escapeHtml(result.reply) : '';
    return;
  }

  const replyTitle = record
    ? `保存しました (${String(record.meal || '').trim()} ${String(record.menu || '').trim()})`.trim()
    : '保存しました';

  reply.innerHTML = `
    <div class="reply-card">
      <div class="reply-title">${escapeHtml(replyTitle)}</div>
      ${buildNutritionDetailCardMarkup_(safeDetail)}
    </div>
  `;
}

function renderMasterSearchResults_(results) {
  const list = Array.isArray(results) ? results : [];
  const container = document.getElementById('master-search-results');
  const query = state.lastMasterSearchQuery || document.getElementById('menu-name').value.trim();
  container.innerHTML = list.length
    ? list.map((item, index) => `
        <div class="candidate-item">
          <div class="candidate-top">
            <div class="candidate-name">${buildHighlightedMatchHtml_(item.name, query)}</div>
            <div class="candidate-score">一致度 ${escapeHtml(String(item.scorePercent || 0))}%</div>
          </div>
          <div class="candidate-meta">カロリー ${formatNullableNumber_(item.kcal)} kcal / たんぱく質 ${formatNullableNumber_(item.protein)} g / 脂質 ${formatNullableNumber_(item.fat)} g / 炭水化物 ${formatNullableNumber_(item.carb)} g</div>
          <div class="master-result-actions">
            <button type="button" class="secondary compact-button" onclick="applyMasterSearchResult(${index})">入力に使う</button>
            <button type="button" class="secondary compact-button" onclick="startMasterEdit(${index})">マスタ編集</button>
          </div>
        </div>
      `).join('')
    : (
      state.lastMasterSearchQuery
        ? `
          <div class="empty-state">
            <div>一致する MYメニューはまだありません。</div>
            <button type="button" class="secondary compact-button" onclick="openExternalMenuSearch()">Webで調べる</button>
          </div>
        `
        : '<div class="empty-state">メニュー名・種類・サイズで検索できます。</div>'
    );
}

function buildHighlightedMatchHtml_(text, query) {
  const source = String(text || '');
  const tokens = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!source || !tokens.length) {
    return escapeHtml(source);
  }

  const pattern = tokens
    .map(token => escapeRegExp_(token))
    .filter(Boolean)
    .join('|');
  if (!pattern) {
    return escapeHtml(source);
  }

  const matches = [...source.matchAll(new RegExp(pattern, 'gi'))];
  if (!matches.length) {
    return escapeHtml(source);
  }

  let cursor = 0;
  let html = '';
  matches.forEach(match => {
    const matchedText = String(match[0] || '');
    const start = Number(match.index || 0);
    const end = start + matchedText.length;
    if (start < cursor) return;
    html += escapeHtml(source.slice(cursor, start));
    html += `<span class="match-highlight">${escapeHtml(matchedText)}</span>`;
    cursor = end;
  });
  html += escapeHtml(source.slice(cursor));
  return html;
}

function escapeRegExp_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderWeeklyChart_(weekly, calorieTarget) {
  const container = document.getElementById('weekly-chart');
  const items = Array.isArray(weekly) ? weekly : [];
  const maxValue = Math.max(
    Number(calorieTarget || 0),
    ...items.map(item => Number(item.total || 0)),
    1
  );

  container.innerHTML = items.length
    ? items.map(item => {
        const breakfast = Number(item.meals && item.meals['朝'] || 0);
        const lunch = Number(item.meals && item.meals['昼'] || 0);
        const dinner = Number(item.meals && item.meals['夜'] || 0);
        const other = Number(item.meals && item.meals['その他'] || 0);
        const total = Number(item.total || 0);
        const targetLeft = calorieTarget ? `${Math.min(100, (Number(calorieTarget) / maxValue) * 100)}%` : '';
        return `
          <div class="weekly-row">
            <div class="weekly-label">${escapeHtml(item.label)}</div>
            <div class="weekly-bar">
              <div class="weekly-segment breakfast" style="width:${(breakfast / maxValue) * 100}%"></div>
              <div class="weekly-segment lunch" style="width:${(lunch / maxValue) * 100}%"></div>
              <div class="weekly-segment dinner" style="width:${(dinner / maxValue) * 100}%"></div>
              <div class="weekly-segment other" style="width:${(other / maxValue) * 100}%"></div>
              ${calorieTarget ? `<div class="weekly-target-line" style="left:${targetLeft}"></div>` : ''}
            </div>
            <div class="weekly-total">${escapeHtml(formatNumber(total))}</div>
          </div>
        `;
      }).join('')
    : '<div class="empty-state">週間グラフはまだありません。</div>';
}

function renderRankingList_(id, items, renderer) {
  const container = document.getElementById(id);
  const list = Array.isArray(items) ? items : [];
  const itemRenderer = renderer || buildDefaultRankingItem_;
  container.innerHTML = list.length
    ? list.map((item, index) => itemRenderer(item, index)).join('')
    : '<div class="empty-state">まだデータがありません。</div>';
}

function buildPopularRankingItem_(item, index) {
  return `
    <div class="ranking-item">
      <div class="ranking-rank">#${index + 1}</div>
      <div class="ranking-main">
        <div class="ranking-name">${escapeHtml(item.displayName || item.menu)}</div>
        <div class="ranking-meta">平均 ${escapeHtml(formatNumber(item.averageKcal))} kcal</div>
      </div>
      <div class="ranking-value">${escapeHtml(String(item.count))}回</div>
    </div>
  `;
}

function buildDefaultRankingItem_(item, index) {
  return `
    <div class="ranking-item">
      <div class="ranking-rank">#${index + 1}</div>
      <div class="ranking-main">
        <div class="ranking-name">${escapeHtml(item.displayName || item.menu || '')}</div>
      </div>
      <div class="ranking-value">${escapeHtml(String(item.streak || item.count || 0))}</div>
    </div>
  `;
}

function renderStreakSection_(streak, ranking) {
  document.getElementById('card-streak-current').textContent = `${Number(streak && streak.current || 0)}日`;
  document.getElementById('card-streak-longest').textContent = `${Number(streak && streak.longest || 0)}日`;
  renderRankingList_('streak-ranking', ranking || [], (item, index) => `
    <div class="ranking-item ${item.userId === state.userId ? 'is-self' : ''}">
      <div class="ranking-rank">#${index + 1}</div>
      <div class="ranking-avatar">${buildRankingAvatarMarkup_(item)}</div>
      <div class="ranking-main">
        <div class="ranking-name-row">
          <div class="ranking-name">${escapeHtml(item.displayName)}</div>
          ${item.userId === state.userId ? '<div class="ranking-self-badge">あなた</div>' : ''}
        </div>
      </div>
      <div class="ranking-value">${escapeHtml(String(item.streak))}日</div>
    </div>
  `);
}

function buildRankingAvatarMarkup_(item) {
  const isSelf = item && item.userId === state.userId;
  const pictureUrl = String(
    item && item.pictureUrl
      ? item.pictureUrl
      : (isSelf ? state.pictureUrl : '')
  ).trim();
  if (pictureUrl) {
    return `<img src="${escapeHtml(pictureUrl)}" alt="${escapeHtml(item.displayName || 'user')}">`;
  }
  const fallback = String(item && item.displayName || 'U').trim().slice(0, 1) || 'U';
  return `<span>${escapeHtml(fallback)}</span>`;
}

function renderPendingSummary_(pendingItems) {
  const section = document.getElementById('pending-summary');
  const count = document.getElementById('pending-summary-count');
  const list = document.getElementById('pending-summary-list');
  const items = Array.isArray(pendingItems) ? pendingItems : [];

  section.hidden = !items.length;
  count.textContent = `${items.length}件`;
  list.innerHTML = items.length
    ? items.map(item => `
        <div class="pending-summary-item">
          <div class="pending-summary-name">未記入: ${escapeHtml(item.menu || item)}</div>
          <div class="pending-summary-actions">
            <button type="button" class="secondary compact-button" onclick="applyPendingMenu('${encodeURIComponent(String(item.menu || item))}', '${escapeHtml(String(item.logId || item.row || ''))}')">入力する</button>
            <button type="button" class="secondary compact-button" onclick="deletePendingItem('${escapeHtml(String(item.logId || item.row || ''))}', '${encodeURIComponent(String(item.menu || item))}')">削除</button>
          </div>
        </div>
      `).join('')
    : '';
}

function getActiveLogEntries_() {
  if (!state.dashboard) return [];
  const logEntries = state.dashboard.logEntries || {};
  if (state.selectedLogDatePreset === 'yesterday') {
    return Array.isArray(logEntries.yesterday) ? logEntries.yesterday : [];
  }
  return Array.isArray(logEntries.today)
    ? logEntries.today
    : (Array.isArray(state.dashboard.recentLogs) ? state.dashboard.recentLogs : []);
}

function renderLogList(logs) {
  const sourceLogs = Array.isArray(logs) ? logs : getActiveLogEntries_();
  const filteredLogs = sourceLogs.filter(log =>
    state.selectedLogFilter === 'all' || log.meal === state.selectedLogFilter
  );

  document.getElementById('logs-list').innerHTML = filteredLogs.length
    ? filteredLogs.map(log => `
        <div class="log-item">
          <div class="log-top">
            <div class="log-menu">${escapeHtml(log.menu)}</div>
            <div class="log-date">${escapeHtml(formatDateTime(log.updatedAt || log.createdAt || log.mealDate))}</div>
          </div>
          <div class="log-meta">${escapeHtml(log.meal)} / ${escapeHtml(formatLogKcal(log.kcal, log.kcalStatus))}</div>
          ${buildLogMediaMarkup_(log)}
          <div class="log-actions">
            <button type="button" class="secondary compact-button" onclick="startEditLog('${escapeHtml(String(log.logId || log.row || ''))}')">編集</button>
            <button type="button" class="secondary compact-button" onclick="deleteLog('${escapeHtml(String(log.logId || log.row || ''))}', '${encodeURIComponent(String(log.menu || ''))}')">削除</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-state">条件に合う記録はまだありません。</div>';
}

function buildLogMediaMarkup_(log) {
  const href = buildLogImageHref_(log);
  if (!href) return '';

  const thumbnailUrl = buildLogImageThumbnailUrl_(log);
  return `
    <div class="log-media">
      <a class="log-thumb" href="${escapeHtml(href)}" target="_blank" rel="noopener">
        ${thumbnailUrl
          ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(log.menu || '食事画像')}">`
          : '<span class="log-thumb-fallback">画像</span>'}
      </a>
      <a class="log-media-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">画像を見る</a>
    </div>
  `;
}

function buildLogImageHref_(log) {
  if (log && log.imageUrl) {
    return String(log.imageUrl);
  }
  if (log && log.imageFileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(String(log.imageFileId))}/view`;
  }
  return '';
}

function buildLogImageThumbnailUrl_(log) {
  if (log && log.imageFileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(String(log.imageFileId))}&sz=w160`;
  }
  return log && log.imageUrl ? String(log.imageUrl) : '';
}

function renderDraft(draft) {
  const suggestionBox = document.getElementById('suggestion-box');
  const emptyBox = document.getElementById('empty-box');
  const candidateList = document.getElementById('candidate-list');
  const candidateAccordion = document.getElementById('candidate-accordion');
  const menuValue = String(document.getElementById('menu-name').value || '').trim();

  if (!draft) {
    suggestionBox.hidden = true;
    emptyBox.hidden = true;
    candidateAccordion.hidden = !menuValue;
    candidateList.innerHTML = '<div class="empty-state">候補はここに表示されます。</div>';
    state.candidateAccordionOpen = false;
    renderCandidateAccordion_();
    return;
  }

  if (draft.menu) {
    const currentMenu = String(document.getElementById('menu-name').value || '').trim();
    const canReplaceMenu = !state.menuDirty ||
      !currentMenu ||
      normalizeMenuKey_(currentMenu) === normalizeMenuKey_(state.appliedMenuValue);
    if (canReplaceMenu) {
      setMenuValue_(draft.menu);
    }
  }
  if (draft.meal && !state.mealDirty) {
    setMealType(draft.meal);
  }
  if ((draft.mealDate || draft.datePreset) && !state.mealDateDirty) {
    setMealDatePreset(draft.datePreset || inferDatePresetFromMealDate_(draft.mealDate), draft.mealDate);
  }

  const prefill = draft.prefill || {};
  document.getElementById('master-key').value = prefill.masterKey || '';
  applyNutritionFields(prefill.nutrition || {}, {
    flavor: prefill.flavor || '',
    unit: prefill.unit || '',
    note: prefill.note || '',
  });

  if (prefill.hasSuggestion) {
    suggestionBox.hidden = false;
    suggestionBox.textContent = `「${prefill.masterName}」を候補から選びました。一致度は ${prefill.scorePercent}% です。`;
  } else {
    suggestionBox.hidden = true;
  }

  const candidates = draft.candidates || [];
  emptyBox.hidden = Boolean(candidates.length);
  candidateAccordion.hidden = !String(draft.menu || menuValue).trim();
  if (!candidates.length && !state.candidateAccordionOpen) {
    state.candidateAccordionOpen = false;
  }

  candidateList.innerHTML = candidates.length
    ? candidates.map((candidate, index) => `
        <button type="button" class="candidate-item-button" onclick="applyCandidate(${index})">
          <div class="candidate-top">
            <div class="candidate-name">${escapeHtml(candidate.name)}</div>
            <div class="candidate-score">一致度 ${candidate.scorePercent}%</div>
          </div>
          ${buildCandidateDetailLine_(candidate)}
          <div class="candidate-meta">カロリー ${formatNullableNumber_(candidate.kcal)} kcal / たんぱく質 ${formatNullableNumber_(candidate.protein)} g / 脂質 ${formatNullableNumber_(candidate.fat)} g / 炭水化物 ${formatNullableNumber_(candidate.carb)} g</div>
          <div class="candidate-cta">タップで入力欄に反映</div>
        </button>
      `).join('')
    : '<div class="empty-state">近い候補はまだありません。</div>';
  renderCandidateAccordion_();
}

function buildCandidateDetailLine_(candidate) {
  const detailParts = [candidate.flavor, candidate.unit]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (!detailParts.length) return '';
  return `<div class="candidate-detail">${escapeHtml(detailParts.join(' / '))}</div>`;
}

function applyNutritionFields(nutrition, extras) {
  setFieldValue('field-kcal', nutrition.kcal ?? '');
  setFieldValue('field-protein', nutrition.protein ?? '');
  setFieldValue('field-fat', nutrition.fat ?? '');
  setFieldValue('field-carb', nutrition.carb ?? '');
  setFieldValue('field-salt', nutrition.salt ?? '');
  setFieldValue('field-fiber', nutrition.fiber ?? '');
  setFieldValue('field-flavor', extras.flavor || '');
  setFieldValue('field-unit', extras.unit || '');
  setFieldValue('field-note', extras.note || '');
  state.advancedNutritionOpen = hasAdvancedNutritionValues_();
  renderAdvancedNutritionSection_();
  renderCurrentMealDetailCard_();
}

function setFieldValue(id, value) {
  const input = document.getElementById(id);
  input.value = value;
  updateFieldState(input, false);
  renderCurrentMealDetailCard_();
}

function renderCandidateAccordion_() {
  const draft = state.draft || null;
  const candidates = draft && draft.candidates ? draft.candidates : [];
  const accordion = document.getElementById('candidate-accordion');
  const body = document.getElementById('candidate-accordion-body');
  const icon = document.getElementById('candidate-accordion-icon');
  const label = document.getElementById('candidate-accordion-label');
  const toggle = document.getElementById('candidate-accordion-toggle');
  const menuValue = String(document.getElementById('menu-name').value || '').trim();
  const shouldShow = Boolean(menuValue || (draft && draft.menu));

  if (!shouldShow) {
    accordion.hidden = true;
    body.hidden = true;
    icon.textContent = '▸';
    label.textContent = '近い候補';
    toggle.setAttribute('aria-expanded', 'false');
    return;
  }

  accordion.hidden = false;
  body.hidden = !state.candidateAccordionOpen;
  icon.textContent = state.candidateAccordionOpen ? '▾' : '▸';
  toggle.setAttribute('aria-expanded', state.candidateAccordionOpen ? 'true' : 'false');
  label.textContent = buildCandidateAccordionLabel_(candidates, menuValue || (draft && draft.menu) || '');
}

function buildCandidateAccordionLabel_(candidates, menuName) {
  if (!candidates.length) {
    return menuName ? `近い候補 (0件)` : '近い候補';
  }

  if (candidates.length === 1) {
    return `近い候補 (${candidates[0].name})`;
  }

  return `近い候補 (${candidates[0].name} など${candidates.length}件)`;
}

function setTargetSyncing(isLoading) {
  state.isTargetSyncing = Boolean(isLoading);
  const avatarButton = document.getElementById('open-settings');
  if (avatarButton) {
    avatarButton.classList.toggle('is-syncing', Boolean(state.isVisualSyncing || state.isTargetSyncing));
  }
  refreshTargetControls();
}

function refreshTargetControls() {
  const input = document.getElementById('calorie-target');
  const saveButton = document.getElementById('save-target');
  const openButton = document.getElementById('open-settings');
  const field = document.getElementById('target-field');
  const hasUser = Boolean(document.getElementById('user-id').value.trim());
  const canUse = !hasUser || state.userPermission.canUse !== false;

  input.disabled = state.isTargetSyncing || !hasUser || !canUse;
  saveButton.disabled = state.isTargetSyncing || !hasUser || !canUse;
  saveButton.textContent = state.isTargetSyncing ? '保存中...' : '保存';
  openButton.disabled = state.isTargetSyncing || !hasUser || !canUse;
  field.classList.toggle('is-editable', Boolean(hasUser && canUse && !state.isTargetSyncing));
}

function isEditingLog_() {
  return Boolean(document.getElementById('editing-log-id').value.trim());
}

function clearEditMode_() {
  document.getElementById('editing-log-id').value = '';
  document.getElementById('editing-master-key').value = '';
  refreshMealSubmitControls_();
}

function refreshMealSubmitControls_() {
  const submitButton = document.getElementById('meal-submit-button');
  const masterButton = document.getElementById('save-master-only-button');
  const newEntryButton = document.getElementById('start-new-entry-button');
  const editing = isEditingLog_();
  const editingMaster = Boolean(document.getElementById('editing-master-key').value.trim());
  const hasUser = Boolean(document.getElementById('user-id').value.trim());
  const canUse = !hasUser || state.userPermission.canUse !== false;
  submitButton.textContent = state.isMealSubmitting ? (editing ? '更新中...' : '保存中...') : (editing ? '保存して更新' : '保存して記録');
  submitButton.disabled = !canUse || state.isMealSubmitting;
  masterButton.hidden = !editingMaster;
  masterButton.disabled = !canUse || state.isMasterSaving;
  masterButton.textContent = state.isMasterSaving ? '保存中...' : 'マスタだけ保存';
  newEntryButton.disabled = !canUse;
  newEntryButton.hidden = !editing && !editingMaster;
}

function resetInitialQueryState_() {
  Object.keys(initialQuery).forEach(key => {
    initialQuery[key] = '';
  });
  if (window.history && typeof window.history.replaceState === 'function') {
    window.history.replaceState({}, '', window.location.pathname);
  }
}
