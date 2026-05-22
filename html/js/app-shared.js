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
  selectedLogDatePreset: 'today',
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
  isLogsRefreshing: false,
  lastLogsRefreshedAt: null,
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
    todayExact: params.get('todayExact') || String(fallback.todayExact || '').trim(),
    targetKcal: params.get('targetKcal') || String(fallback.targetKcal || '').trim(),
    pendingCount: params.get('pendingCount') || String(fallback.pendingCount || '').trim(),
    masterKey: params.get('masterKey') || String(fallback.masterKey || '').trim(),
    flavor: params.get('flavor') || String(fallback.flavor || '').trim(),
    unit: params.get('unit') || String(fallback.unit || '').trim(),
    note: params.get('note') || String(fallback.note || '').trim(),
    kcal: params.get('kcal') || String(fallback.kcal || '').trim(),
    protein: params.get('protein') || String(fallback.protein || '').trim(),
    fat: params.get('fat') || String(fallback.fat || '').trim(),
    carb: params.get('carb') || String(fallback.carb || '').trim(),
    salt: params.get('salt') || String(fallback.salt || '').trim(),
    fiber: params.get('fiber') || String(fallback.fiber || '').trim(),
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
    startLoginFlow_();
  });
}

function bindSettingsModal() {
  document.getElementById('open-settings').addEventListener('click', () => {
    const userId = document.getElementById('user-id').value.trim();
    if (!userId) {
      startLoginFlow_();
      return;
    }
    if (!state.userPermission.canUse) {
      pushStatus('notice', '現在は設定を変更できません。');
      return;
    }
    openSettingsModal_();
  });

  document.getElementById('refresh-page-button').addEventListener('click', () => {
    reloadPageWithCacheBust_();
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

function reloadPageWithCacheBust_() {
  pushStatus('info', '最新の画面を読み込み直しています...');
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_ts', String(Date.now()));
  window.location.href = nextUrl.toString();
}

function startLoginFlow_() {
  const redirectUrl = resolveLoginRedirectUrl_();
  if (!redirectUrl) {
    pushStatus('warning', '公開URLが未設定のため、ここではLINEログインを開始できません。');
    return;
  }
  pushStatus('info', 'LINEログイン画面へ移動しています...');
  if (window.location.protocol === 'file:') {
    try {
      window.location.assign(redirectUrl);
    } catch (error) {
      window.location.href = redirectUrl;
    }
    return;
  }
  if (!window.liff || typeof liff.login !== 'function') {
    try {
      window.location.assign(redirectUrl);
    } catch (error) {
      window.location.href = redirectUrl;
    }
    return;
  }
  try {
    liff.login({ redirectUri: redirectUrl });
  } catch (error) {
    try {
      window.location.assign(redirectUrl);
    } catch (fallbackError) {
      window.location.href = redirectUrl;
    }
  }
}

function bindMasterSearch() {
  document.getElementById('search-master').addEventListener('click', async () => {
    const query = document.getElementById('menu-name').value.trim() || document.getElementById('master-search-query').value.trim();
    if (!query) {
      renderMasterSearchResults_([]);
      renderMasterSearchStatus_('メニュー名を入力してから検索できます。', false);
      pushStatus('notice', 'メニュー名を入力してから検索してください。');
      return;
    }
    renderDraftLoadingState_();
    await Promise.all([
      runMasterSearch_(query, { announce: true, source: 'manual' }),
      reloadState(),
    ]);
  });
}

function bindLogsRefresh() {
  const button = document.getElementById('refresh-logs-button');
  if (!button) return;
  button.addEventListener('click', async () => {
    const auth = ensureUserCanProceed_('LINEログイン後にログを更新できます。', '現在はログを更新できません。');
    if (!auth) {
      return;
    }
    state.isLogsRefreshing = true;
    renderLogsRefreshState_();
    button.disabled = true;
    button.textContent = '更新中...';
    setSyncVisualState(true);
    pushStatus('info', 'ログを更新中...');
    try {
      await reloadState();
      pushStatus('info', 'ログを更新しました。');
    } finally {
      state.isLogsRefreshing = false;
      renderLogsRefreshState_();
      button.disabled = false;
      button.textContent = '更新';
      setSyncVisualState(false);
    }
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
  return Boolean(
    initialQuery.mode === 'detail' ||
    ((initialQuery.logId || initialQuery.row) &&
      !(initialQuery.kcal || initialQuery.masterKey || initialQuery.flavor || initialQuery.unit || initialQuery.note))
  );
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
    bindLogsRefresh();
    hydrateQuery();
    bindViewTabs();
    bindMealTypeButtons();
    bindMealDateButtons();
    bindLogDateButtons();
    bindLogFilterButtons();
    bindFieldInteractions();
    syncAllFieldStates_();
    window.setTimeout(syncAllFieldStates_, 200);
    renderAdvancedNutritionSection_();
    refreshTargetControls();
    renderStatus();
    renderLogsRefreshState_();
    pushStatus('info', 'プロフィールと今日の集計を準備しています。');
    pushVersionDebug_();

    await initializeLiffProfile_();

    if (!apiBaseUrl) {
      pushStatus('warning', 'GAS API URL が未設定です。site-config.js を確認してください。');
      return;
    }

    if (state.userId) {
      const needsFullState = shouldLoadFullStateOnBoot_();
      const bootedFromCache = applyCachedAppState_(state.userId);
      if (needsFullState) {
        await reloadState();
      } else if (!bootedFromCache) {
        await reloadHeaderState();
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
  } else {
    setMealType(inferCurrentMealType_());
  }
  if (initialQuery.mealDate || initialQuery.datePreset) {
    setMealDatePreset(initialQuery.datePreset || inferDatePresetFromMealDate_(initialQuery.mealDate), initialQuery.mealDate);
  } else {
    setMealDatePreset('today');
  }
  if (initialQuery.menu) {
    setMenuValue_(initialQuery.menu);
  }
  if (initialQuery.masterKey) {
    document.getElementById('master-key').value = initialQuery.masterKey;
  }
  if (
    initialQuery.kcal || initialQuery.protein || initialQuery.fat || initialQuery.carb ||
    initialQuery.salt || initialQuery.fiber || initialQuery.flavor || initialQuery.unit || initialQuery.note
  ) {
    applyNutritionFields({
      kcal: initialQuery.kcal,
      protein: initialQuery.protein,
      fat: initialQuery.fat,
      carb: initialQuery.carb,
      salt: initialQuery.salt,
      fiber: initialQuery.fiber,
    }, {
      flavor: initialQuery.flavor,
      unit: initialQuery.unit,
      note: initialQuery.note,
    });
  }
  applyHeaderSummaryFromQuery_();
}

function inferCurrentMealType_() {
  const hour = new Date().getHours();
  if (hour < 11) return '朝';
  if (hour < 17) return '昼';
  return '夜';
}

function applyHeaderSummaryFromQuery_() {
  const hasAnyHeaderValue =
    String(initialQuery.todayExact || '').trim() !== '' ||
    String(initialQuery.targetKcal || '').trim() !== '' ||
    String(initialQuery.pendingCount || '').trim() !== '';
  if (!hasAnyHeaderValue) return;

  renderHeaderSummary_({
    user: {
      calorieTarget: initialQuery.targetKcal,
    },
    todayExact: initialQuery.todayExact,
    pendingCount: initialQuery.pendingCount,
  });
}

function normalizeMenuKey_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
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

function formatNullableNumber_(value) {
  if (value == null || value === '') return '-';
  return formatNumber(value);
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
