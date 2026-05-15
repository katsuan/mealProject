const appConfig = window.__MEAL_APP_CONFIG__ || {};
const appVersion = String(appConfig.appVersion || '').trim();
const appCommit = String(appConfig.appCommit || '').trim();
const initialLiffId = String(appConfig.initialLiffId || '').trim();
const apiBaseUrl = String(appConfig.apiBaseUrl || '').trim();
const publicAppUrl = String(appConfig.publicAppUrl || '').trim();
const initialQuery = buildInitialQuery_(appConfig.initialQuery || {});
const LOCAL_STATE_PREFIX = 'meal-app-state:';
const STATUS_META = {
  debug: { label: 'DEBUG', className: 'is-debug' },
  info: { label: 'INFO', className: 'is-info' },
  notice: { label: '注意', className: 'is-notice' },
  warning: { label: '警告', className: 'is-warning' },
};
const state = {
  userId: '',
  displayName: '',
  pictureUrl: '',
  idToken: '',
  header: null,
  dashboard: null,
  draft: null,
  statusLogs: [],
  statusFilters: {
    debug: false,
    notice: false,
    warning: false,
  },
  statusSeq: 0,
  isTargetSyncing: false,
  identityWarningKey: '',
  settingsModalTab: 'settings',
  candidateAccordionOpen: false,
  selectedLogFilter: 'all',
  activeView: 'input',
  userPermission: { status: 'active', canUse: true, isAdmin: false, notify: true },
  headerLoaded: false,
  dashboardLoaded: false,
  masterSearchResults: [],
  isSettingsModalOpen: false,
  menuDirty: false,
  mealDirty: false,
  mealDateDirty: false,
  isProgrammaticMenuUpdate: false,
  appliedMenuValue: '',
  isDraftRefreshing: false,
  isMasterSearching: false,
  isMealSubmitting: false,
  isMasterSaving: false,
  isVisualSyncing: false,
  advancedNutritionOpen: false,
  masterSearchTimer: null,
  lastMasterSearchQuery: '',
};

function buildInitialQuery_(fallback) {
  const params = new URLSearchParams(window.location.search || '');
  return {
    mode: params.get('mode') || String(fallback.mode || '').trim(),
    logId: params.get('logId') || String(fallback.logId || '').trim(),
    row: params.get('row') || String(fallback.row || '').trim(),
    meal: params.get('meal') || String(fallback.meal || '').trim(),
    menu: params.get('menu') || String(fallback.menu || '').trim(),
    datePreset: params.get('datePreset') || String(fallback.datePreset || '').trim(),
    mealDate: params.get('mealDate') || String(fallback.mealDate || '').trim(),
  };
}

function pushStatus(level, message) {
  const normalizedLevel = STATUS_META[level] ? level : 'info';
  const text = String(message || '').trim();
  if (!text) return null;

  const previous = state.statusLogs[state.statusLogs.length - 1];
  if (previous && previous.level === normalizedLevel && previous.message === text) {
    return previous;
  }

  const entry = {
    id: ++state.statusSeq,
    level: normalizedLevel,
    label: STATUS_META[normalizedLevel].label,
    message: text,
    createdAt: new Date(),
  };

  state.statusLogs.push(entry);
  renderStatus();
  return entry;
}

function pushVersionDebug_() {
  const versionParts = [appVersion, appCommit].filter(Boolean);
  if (!versionParts.length) return;
  pushStatus('debug', `version: ${versionParts.join(' / ')}`);
}

function renderStatus() {
  const panelNode = document.getElementById('status-panel');
  const controlsNode = document.getElementById('status-controls');
  const historyNode = document.getElementById('status-history');
  const availableLevels = [...new Set(
    state.statusLogs
      .map(entry => entry.level)
      .filter(level => level !== 'info')
  )];
  const selectedLevels = Object.keys(state.statusFilters).filter(level =>
    state.statusFilters[level] && availableLevels.includes(level)
  );

  panelNode.hidden = state.settingsModalTab !== 'debug';

  controlsNode.hidden = availableLevels.length <= 1;
  controlsNode.innerHTML = availableLevels.length > 1
    ? availableLevels.map(level => `
        <button
          type="button"
          class="status-toggle is-${level} ${state.statusFilters[level] ? 'is-active' : ''}"
          data-log-toggle="${escapeHtml(level)}"
        >${escapeHtml(STATUS_META[level].label)}</button>
      `).join('')
    : '';

  if (!availableLevels.length) {
    historyNode.hidden = true;
    historyNode.innerHTML = '';
    return;
  }

  const logs = state.statusLogs
    .filter(entry => entry.level !== 'info')
    .filter(entry => !selectedLevels.length || selectedLevels.includes(entry.level))
    .slice()
    .reverse();

  historyNode.hidden = false;
  historyNode.innerHTML = logs.length
    ? logs.map(entry => `
        <div class="status-log ${STATUS_META[entry.level].className}">
          <div class="status-log-top">
            <div class="status-log-label">${escapeHtml(entry.label)}</div>
            <div class="status-log-time">${escapeHtml(formatClockTime(entry.createdAt))}</div>
          </div>
          <div class="status-log-message">${escapeHtml(entry.message)}</div>
        </div>
      `).join('')
    : '<div class="empty-state">表示できるログはまだありません。</div>';
}

function bindStatusToggles() {
  document.getElementById('status-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-log-toggle]');
    if (!button) return;

    const level = button.dataset.logToggle;
    state.statusFilters[level] = !state.statusFilters[level];
    renderStatus();
  });
}

function bindSettingsModalTabs() {
  document.querySelectorAll('[data-settings-tab]').forEach(button => {
    button.addEventListener('click', () => {
      setSettingsModalTab_(button.dataset.settingsTab || 'settings');
    });
  });
}

function bindCandidateAccordion() {
  document.getElementById('candidate-accordion-toggle').addEventListener('click', () => {
    state.candidateAccordionOpen = !state.candidateAccordionOpen;
    renderCandidateAccordion_();
  });
}

function bindAdvancedNutritionToggle() {
  document.getElementById('advanced-nutrition-toggle').addEventListener('click', () => {
    state.advancedNutritionOpen = !state.advancedNutritionOpen;
    renderAdvancedNutritionSection_();
  });
}

function bindPendingSummaryJump() {
  document.getElementById('header-pending-count').addEventListener('click', async () => {
    await setActiveView('summary');
    const target = document.getElementById('pending-summary');
    if (!target || target.hidden) {
      pushStatus('notice', '未登録メニューはまだありません。');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function bindLoginButton() {
  document.getElementById('login-line').addEventListener('click', () => {
    const redirectUrl = resolveLoginRedirectUrl_();
    if (!redirectUrl) {
      pushStatus('warning', '公開URLが未設定のため、ここではLINEログインを開始できません。');
      return;
    }
    if (!window.liff || typeof liff.login !== 'function') {
      window.location.href = redirectUrl;
      return;
    }
    liff.login({ redirectUri: redirectUrl });
  });
}

function bindSettingsModal() {
  document.getElementById('open-settings').addEventListener('click', () => {
    const userId = document.getElementById('user-id').value.trim();
    if (!userId) {
      pushStatus('notice', 'LINEログイン後に設定を変更できます。');
      return;
    }
    if (!state.userPermission.canUse) {
      pushStatus('notice', '現在は設定を変更できません。');
      return;
    }
    openSettingsModal_();
  });

  document.getElementById('close-settings-modal').addEventListener('click', closeSettingsModal_);
  document.getElementById('close-settings-secondary').addEventListener('click', closeSettingsModal_);
  document.getElementById('settings-modal-backdrop').addEventListener('click', closeSettingsModal_);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.isSettingsModalOpen) {
      closeSettingsModal_();
    }
  });
}

function bindMasterSearch() {
  document.getElementById('search-master').addEventListener('click', async () => {
    const query = document.getElementById('master-search-query').value.trim();
    if (!query) {
      renderMasterSearchResults_([]);
      pushStatus('notice', '検索キーワードを入力してください。');
      return;
    }
    await runMasterSearch_(query, { announce: true, source: 'manual' });
  });
}

function renderMasterSearchStatus_(message, isLoading) {
  const node = document.getElementById('master-search-status');
  if (!node) return;
  node.textContent = message || 'メニュー名に合わせて検索します。';
  node.classList.toggle('is-loading', Boolean(isLoading));
}

async function runMasterSearch_(query, options) {
  const config = options || {};
  const normalizedQuery = String(query || '').trim();
  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    if (config.announce) {
      pushStatus('notice', 'LINEログイン後に登録済みDBを検索できます。');
    }
    return;
  }

  if (!normalizedQuery) {
    state.masterSearchResults = [];
    state.lastMasterSearchQuery = '';
    renderMasterSearchResults_([]);
    renderMasterSearchStatus_('メニュー名に合わせて検索します。', false);
    return;
  }

  state.isMasterSearching = true;
  const searchButton = document.getElementById('search-master');
  const previous = searchButton.textContent;
  searchButton.disabled = true;
  searchButton.textContent = '検索中...';
  renderMasterSearchStatus_(
    config.source === 'menu-blur'
      ? 'メニュー名の入力をもとに検索しています...'
      : '登録済みDBを検索しています...',
    true
  );
  if (config.announce) {
    pushStatus('info', '登録済みDBを検索中...');
  }
  try {
    const result = await runServer('searchNutritionMaster', {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      query: normalizedQuery,
      limit: 12,
    });
    state.masterSearchResults = result.results || [];
    state.lastMasterSearchQuery = normalizedQuery;
    applyPermissionState_(result.permission);
    renderMasterSearchResults_(state.masterSearchResults);
    renderMasterSearchStatus_(
      state.masterSearchResults.length
        ? `${state.masterSearchResults.length}件見つかりました。`
        : '一致する登録済みDBはまだありません。',
      false
    );
    if (config.announce) {
      pushStatus('info', `${state.masterSearchResults.length}件の候補を見つけました。`);
    }
  } catch (error) {
    renderMasterSearchStatus_('検索に失敗しました。少し待ってからもう一度お試しください。', false);
    if (config.announce) {
      pushStatus('warning', `登録済みDB検索に失敗しました: ${error.message}`);
      pushStatus('debug', buildErrorDetail_(error));
    }
  } finally {
    state.isMasterSearching = false;
    searchButton.disabled = false;
    searchButton.textContent = previous || '検索する';
  }
}

function resolveLoginRedirectUrl_() {
  if (window.location.protocol !== 'file:') {
    return window.location.href;
  }
  return publicAppUrl || '';
}

function openSettingsModal_() {
  state.isSettingsModalOpen = true;
  setSettingsModalTab_('settings');
  document.getElementById('settings-modal').hidden = false;
  document.body.classList.add('has-modal');
  refreshTargetControls();
  const input = document.getElementById('calorie-target');
  window.setTimeout(() => {
    input.focus();
    input.select();
    updateFieldState(input, true);
  }, 0);
}

function closeSettingsModal_() {
  state.isSettingsModalOpen = false;
  document.getElementById('settings-modal').hidden = true;
  document.body.classList.remove('has-modal');
  updateFieldState(document.getElementById('calorie-target'), false);
  refreshTargetControls();
}

function setSettingsModalTab_(tab) {
  state.settingsModalTab = tab === 'debug' ? 'debug' : 'settings';
  document.querySelectorAll('[data-settings-tab]').forEach(button => {
    const isActive = button.dataset.settingsTab === state.settingsModalTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.getElementById('settings-tab-panel').hidden = state.settingsModalTab !== 'settings';
  document.getElementById('debug-tab-panel').hidden = state.settingsModalTab !== 'debug';
  renderStatus();
}

function shouldLoadFullStateOnBoot_() {
  return Boolean(initialQuery.menu || initialQuery.logId || initialQuery.row || initialQuery.mode === 'detail');
}

async function runServer(action, payload) {
  if (!apiBaseUrl) {
    throw new Error('GAS API URL is not configured');
  }

  const response = await fetch(apiBaseUrl, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(Object.assign({ action: action }, payload || {})),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (error) {
      detail = '';
    }
    if (response.status === 404) {
      throw new Error(`API 404 (${action}) - apiBaseUrl またはデプロイ先が古い可能性があります: ${apiBaseUrl}`);
    }
    throw new Error(`API request failed (${action}): ${response.status}${detail ? ` / ${detail}` : ''}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || 'API returned an error');
  }

  return result;
}

async function initializeApp() {
  try {
    bindStatusToggles();
    bindSettingsModalTabs();
    bindCandidateAccordion();
    bindAdvancedNutritionToggle();
    bindPendingSummaryJump();
    bindLoginButton();
    bindSettingsModal();
    bindMasterSearch();
    hydrateQuery();
    bindViewTabs();
    bindMealTypeButtons();
    bindMealDateButtons();
    bindLogFilterButtons();
    bindFieldInteractions();
    syncAllFieldStates_();
    window.setTimeout(syncAllFieldStates_, 200);
    renderAdvancedNutritionSection_();
    refreshTargetControls();
    renderStatus();
    pushStatus('info', 'プロフィールと今日の集計を準備しています。');
    pushVersionDebug_();

    await initializeLiffProfile_();

    if (!apiBaseUrl) {
      pushStatus('warning', 'GAS API URL が未設定です。site-config.js を確認してください。');
      return;
    }

    if (state.userId) {
      await reloadHeaderState();
      if (shouldLoadFullStateOnBoot_()) {
        await reloadState();
      }
    }
  } catch (error) {
    pushStatus('warning', `初期化失敗: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  }
}

async function initializeLiffProfile_() {
  if (!initialLiffId) {
    pushStatus('notice', 'プロフィール連携の設定がまだ入っていません。');
    return;
  }

  if (!window.liff) {
    pushStatus('warning', 'LINEプロフィール連携の読み込みに失敗しました。');
    return;
  }

  try {
    await liff.init({ liffId: initialLiffId });
    if (!liff.isLoggedIn()) {
      pushStatus(
        'notice',
        window.location.protocol === 'file:'
          ? 'PCデバッグ中は「公開URLでLINEログイン」から公開URLを開いてログインしてください。'
          : 'LINEアプリ内、またはLINEログイン済みブラウザでプロフィールを取得できます。'
      );
      return;
    }

    const profile = await liff.getProfile();
    state.userId = profile.userId || '';
    state.displayName = profile.displayName || '';
    state.pictureUrl = profile.pictureUrl || '';
    state.idToken = liff.getIDToken() || '';
    document.getElementById('user-id').value = state.userId;
    document.getElementById('display-name').value = state.displayName;
    renderProfileHeader();
    pushStatus('info', 'LINEプロフィールを読み込みました。');
  } catch (error) {
    pushStatus('warning', 'LINEプロフィールの初期化に失敗しました。');
    pushStatus('debug', buildErrorDetail_(error));
  }
}

function hydrateQuery() {
  if (initialQuery.logId || initialQuery.row) {
    document.getElementById('editing-log-id').value = initialQuery.logId || initialQuery.row;
  }
  if (initialQuery.meal) {
    setMealType(initialQuery.meal);
  }
  if (initialQuery.mealDate || initialQuery.datePreset) {
    setMealDatePreset(initialQuery.datePreset || inferDatePresetFromMealDate_(initialQuery.mealDate), initialQuery.mealDate);
  } else {
    setMealDatePreset('today');
  }
  if (initialQuery.menu) {
    setMenuValue_(initialQuery.menu);
  }
}

function normalizeMenuKey_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

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
  renderLogList(state.dashboard ? state.dashboard.recentLogs : []);
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
    if (state.masterSearchTimer) {
      window.clearTimeout(state.masterSearchTimer);
    }
    if (!menuValue) {
      state.lastMasterSearchQuery = '';
      renderMasterSearchResults_([]);
      renderMasterSearchStatus_('メニュー名に合わせて検索します。', false);
      return;
    }
    state.masterSearchTimer = window.setTimeout(() => {
      if (!document.getElementById('user-id').value.trim()) return;
      if (menuValue === state.lastMasterSearchQuery) return;
      runMasterSearch_(menuValue, { announce: false, source: 'menu-input' });
    }, 350);
  });
  document.getElementById('menu-name').addEventListener('blur', () => {
    const menuValue = String(document.getElementById('menu-name').value || '').trim();
    if (state.masterSearchTimer) {
      window.clearTimeout(state.masterSearchTimer);
      state.masterSearchTimer = null;
    }
    if (!menuValue || !document.getElementById('user-id').value.trim()) return;
    if (menuValue === state.lastMasterSearchQuery || state.isMasterSearching) return;
    runMasterSearch_(menuValue, { announce: false, source: 'menu-blur' });
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
  document.getElementById('open-settings').disabled = !state.userId || state.userPermission.canUse === false;

  const avatar = document.getElementById('avatar');
  const avatarButton = document.getElementById('open-settings');
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
    openSettingsButton.disabled = permission.canUse === false || !document.getElementById('user-id').value.trim();
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
  const menuValue = String(document.getElementById('menu-name').value || '').trim();
  [
    document.getElementById('header-summary-scope'),
    state.isSettingsModalOpen ? document.getElementById('target-field') : null,
    menuValue ? document.getElementById('candidate-sync-scope') : null,
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
    document.getElementById('logs-list').innerHTML = '<div class="empty-state">ログインすると今日の記録を表示します。</div>';
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
  renderLogList(dashboard.recentLogs || []);
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

  targetNode.textContent = hasTarget ? `${formatNumber(target)}` : '未設定';
  exactNode.textContent = `${formatNumber(exact)}`;
  exactNode.classList.add('has-unit');
  targetNode.classList.toggle('has-unit', hasTarget);
  document.getElementById('header-exact-rate').textContent = hasTarget ? `目標比 ${rate}%` : '目標比 -';
  document.getElementById('header-pending-count').textContent = `${pendingCount}件未登録`;
  document.getElementById('header-exact-kcal').classList.toggle('is-warning', hasTarget && rate > 100);
  document.getElementById('header-exact-rate').classList.toggle('is-warning', hasTarget && rate > 100);
}

function renderMasterSearchResults_(results) {
  const list = Array.isArray(results) ? results : [];
  const container = document.getElementById('master-search-results');
  container.innerHTML = list.length
    ? list.map((item, index) => `
        <div class="candidate-item">
          <div class="candidate-top">
            <div class="candidate-name">${escapeHtml(item.name)}</div>
            <div class="candidate-score">一致度 ${escapeHtml(String(item.scorePercent || 0))}%</div>
          </div>
          <div class="candidate-meta">カロリー ${formatNumber(item.kcal)} kcal / たんぱく質 ${formatNumber(item.protein)} g / 脂質 ${formatNumber(item.fat)} g / 炭水化物 ${formatNumber(item.carb)} g</div>
          <div class="master-result-actions">
            <button type="button" class="secondary compact-button" onclick="applyMasterSearchResult(${index})">入力に使う</button>
            <button type="button" class="secondary compact-button" onclick="startMasterEdit(${index})">マスタ編集</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-state">メニュー名・フレーバー・単位で検索できます。</div>';
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
          <div class="pending-summary-name">${escapeHtml(item.menu || item)}</div>
          <div class="pending-summary-actions">
            <button type="button" class="secondary compact-button" onclick="applyPendingMenu('${encodeURIComponent(String(item.menu || item))}', '${escapeHtml(String(item.logId || item.row || ''))}')">入力する</button>
            <button type="button" class="secondary compact-button" onclick="deletePendingItem('${escapeHtml(String(item.logId || item.row || ''))}', '${encodeURIComponent(String(item.menu || item))}')">削除</button>
          </div>
        </div>
      `).join('')
    : '';
}

function renderLogList(logs) {
  const filteredLogs = (logs || []).filter(log =>
    state.selectedLogFilter === 'all' || log.meal === state.selectedLogFilter
  );

  document.getElementById('logs-list').innerHTML = filteredLogs.length
    ? filteredLogs.map(log => `
        <div class="log-item">
          <div class="log-top">
            <div class="log-menu">${escapeHtml(log.menu)}</div>
            <div class="log-date">${escapeHtml(formatDateTime(log.mealDate))}</div>
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
  if (draft.meal) {
    if (!state.mealDirty) {
      setMealType(draft.meal);
    }
  }
  if (draft.mealDate || draft.datePreset) {
    if (!state.mealDateDirty) {
      setMealDatePreset(draft.datePreset || inferDatePresetFromMealDate_(draft.mealDate), draft.mealDate);
    }
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
          <div class="candidate-meta">カロリー ${formatNumber(candidate.kcal)} kcal / たんぱく質 ${formatNumber(candidate.protein)} g / 脂質 ${formatNumber(candidate.fat)} g / 炭水化物 ${formatNumber(candidate.carb)} g</div>
          <div class="candidate-cta">タップで入力欄に反映</div>
        </button>
      `).join('')
    : '<div class="empty-state">近い候補はまだありません。</div>';
  renderCandidateAccordion_();
}

function buildCandidateDetailLine_(candidate) {
  const detailParts = [candidate.unit, candidate.flavor]
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
}

function setFieldValue(id, value) {
  const input = document.getElementById(id);
  input.value = value;
  updateFieldState(input, false);
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
  setMealType(currentMeal, { markDirty: state.mealDirty });
  setMealDatePreset(inferDatePresetFromMealDate_(currentMealDate), currentMealDate, { markDirty: state.mealDateDirty });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${candidate.name}」のマスタ編集を開きました。`);
}

async function applyPendingMenu(menu, row) {
  const resolvedMenu = decodeURIComponent(String(menu || ''));
  setMenuValue_(resolvedMenu);
  const rowValue = row ? String(row) : '';
  document.getElementById('master-key').value = '';
  document.getElementById('editing-master-key').value = '';
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${resolvedMenu}」の入力欄を開きました。`);
  await reloadState();
  document.getElementById('editing-log-id').value = rowValue;
  refreshMealSubmitControls_();
}

function deletePendingItem(rowNumber, menuName) {
  return deleteLog(rowNumber, menuName);
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
  const cancelButton = document.getElementById('cancel-edit-button');
  const editing = isEditingLog_();
  const editingMaster = Boolean(document.getElementById('editing-master-key').value.trim());
  const hasUser = Boolean(document.getElementById('user-id').value.trim());
  const canUse = !hasUser || state.userPermission.canUse !== false;
  submitButton.textContent = state.isMealSubmitting ? (editing ? '更新中...' : '保存中...') : (editing ? '保存して更新' : '保存して記録');
  submitButton.disabled = !canUse || state.isMealSubmitting;
  masterButton.hidden = !editingMaster;
  masterButton.disabled = !canUse || state.isMasterSaving;
  masterButton.textContent = state.isMasterSaving ? '保存中...' : 'マスタだけ保存';
  cancelButton.disabled = !canUse;
  cancelButton.hidden = !editing && !editingMaster;
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

document.getElementById('meal-detail-form').addEventListener('submit', async event => {
  event.preventDefault();

  const auth = ensureUserCanProceed_('LINEログイン後に保存できます。', '現在は管理者の許可待ちのため保存できません。');
  if (!auth) {
    return;
  }

  const editingLogId = document.getElementById('editing-log-id').value.trim();
  const action = editingLogId ? 'updateMealLog' : 'submitMealDetail';

  setSyncVisualState(true);
  state.isMealSubmitting = true;
  refreshMealSubmitControls_();
  pushStatus('info', editingLogId ? '更新して集計を同期中...' : '保存して集計を同期中...');

  try {
    const result = await runServer(action, buildMealDetailRequestPayload_({
      sendLineSummary: true,
    }));

    document.getElementById('meal-reply').textContent = result.reply || '';
    applyDashboardDraftResponse_(auth.userId, result);
    pushStatus(
      'info',
      editingLogId
        ? (result.summaryPushed ? '更新してLINEに今日の集計を返しました。' : 'ログを更新しました。LINE送信は未実行です。')
        : (result.summaryPushed ? '保存してLINEに今日の集計を返しました。' : '保存しました。LINE送信は未実行です。')
    );
  } catch (error) {
    pushStatus('warning', `保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    state.isMealSubmitting = false;
    refreshMealSubmitControls_();
    setSyncVisualState(false);
  }
});

document.getElementById('refresh-draft').addEventListener('click', async () => {
  if (state.isDraftRefreshing) return;
  state.isDraftRefreshing = true;
  const button = document.getElementById('refresh-draft');
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = '更新中...';
  renderDraftLoadingState_();
  try {
    await reloadState();
  } finally {
    state.isDraftRefreshing = false;
    button.disabled = false;
    button.textContent = previous;
  }
});

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
document.getElementById('cancel-edit-button').addEventListener('click', () => {
  clearEditMode_();
  pushStatus('info', 'ログ編集をやめました。');
});
document.getElementById('calorie-target').addEventListener('keydown', async event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  await saveProfileTarget();
});
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

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClockTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatNumber(value) {
  if (value == null || value === '') return '0';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  if (Number.isNaN(number)) return String(value);
  return number > 0 ? `+${formatNumber(number)}` : formatNumber(number);
}

function formatTargetRateLabel(dashboard) {
  const target = Number(dashboard && dashboard.user && dashboard.user.calorieTarget || 0);
  if (!Number.isFinite(target) || target <= 0) {
    return '目標未設定';
  }

  const total = Number(dashboard && dashboard.today && dashboard.today.totalExact || 0);
  const percent = Math.round((total / target) * 100);
  return `目標比 ${percent}%`;
}

function formatLogKcal(kcal, status) {
  if (kcal == null || kcal === '') {
    return 'カロリー未登録';
  }
  return status === 'estimated' ? `約 ${formatNumber(kcal)} kcal` : `${formatNumber(kcal)} kcal`;
}

function buildErrorDetail_(error) {
  if (!error) return 'unknown error';
  if (error.stack) return String(error.stack);
  return String(error.message || error);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.applyCandidate = applyCandidate;
window.applyMasterSearchResult = applyMasterSearchResult;
window.applyPendingMenu = applyPendingMenu;
window.deletePendingItem = deletePendingItem;
window.startEditLog = startEditLog;
window.deleteLog = deleteLog;
refreshMealSubmitControls_();
initializeApp();
