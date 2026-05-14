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
  statusAccordionOpen: false,
  candidateAccordionOpen: false,
  selectedLogFilter: 'all',
  activeView: 'input',
  userPermission: { status: 'active', canUse: true, isAdmin: false, notify: true },
  headerLoaded: false,
  dashboardLoaded: false,
  masterSearchResults: [],
  isSettingsModalOpen: false,
  menuDirty: false,
  isProgrammaticMenuUpdate: false,
  appliedMenuValue: '',
};

function buildInitialQuery_(fallback) {
  const params = new URLSearchParams(window.location.search || '');
  return {
    mode: params.get('mode') || String(fallback.mode || '').trim(),
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
  const latest = state.statusLogs[state.statusLogs.length - 1] || {
    level: 'info',
    label: STATUS_META.info.label,
    message: 'プロフィールと今日の集計を準備しています。',
  };
  const panelNode = document.getElementById('status-panel');
  const accordionNode = document.getElementById('status-accordion');
  const accordionToggle = document.getElementById('status-accordion-toggle');
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

  panelNode.hidden = !state.statusAccordionOpen;
  accordionNode.hidden = !state.statusAccordionOpen;
  accordionToggle.className = `status-accordion-toggle ${STATUS_META[latest.level].className}`;
  accordionToggle.setAttribute('aria-expanded', state.statusAccordionOpen ? 'true' : 'false');
  accordionToggle.textContent = state.statusAccordionOpen ? '▾' : '▸';
  accordionToggle.setAttribute('aria-label', state.statusAccordionOpen ? 'ログを閉じる' : 'ログを開く');
  accordionToggle.setAttribute('title', state.statusAccordionOpen ? 'ログを閉じる' : 'ログを開く');

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
  document.getElementById('status-accordion-toggle').addEventListener('click', () => {
    state.statusAccordionOpen = !state.statusAccordionOpen;
    renderStatus();
  });

  document.getElementById('status-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-log-toggle]');
    if (!button) return;

    const level = button.dataset.logToggle;
    state.statusFilters[level] = !state.statusFilters[level];
    if (state.statusFilters[level]) {
      state.statusAccordionOpen = true;
    }
    renderStatus();
  });
}

function bindCandidateAccordion() {
  document.getElementById('candidate-accordion-toggle').addEventListener('click', () => {
    state.candidateAccordionOpen = !state.candidateAccordionOpen;
    renderCandidateAccordion_();
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
    const userId = document.getElementById('user-id').value.trim();
    const query = document.getElementById('master-search-query').value.trim();
    if (!userId) {
      pushStatus('notice', 'LINEログイン後に登録済みDBを検索できます。');
      return;
    }
    if (!query) {
      renderMasterSearchResults_([]);
      pushStatus('notice', '検索キーワードを入力してください。');
      return;
    }

    pushStatus('info', '登録済みDBを検索中...');
    try {
      const result = await runServer('searchNutritionMaster', {
        userId: userId,
        displayName: document.getElementById('display-name').value.trim(),
        idToken: state.idToken,
        query: query,
        limit: 12,
      });
      state.masterSearchResults = result.results || [];
      applyPermissionState_(result.permission);
      renderMasterSearchResults_(state.masterSearchResults);
      pushStatus('info', `${state.masterSearchResults.length}件の候補を見つけました。`);
    } catch (error) {
      pushStatus('warning', `登録済みDB検索に失敗しました: ${error.message}`);
      pushStatus('debug', buildErrorDetail_(error));
    }
  });
}

function resolveLoginRedirectUrl_() {
  if (window.location.protocol !== 'file:') {
    return window.location.href;
  }
  return publicAppUrl || '';
}

function openSettingsModal_() {
  state.isSettingsModalOpen = true;
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

function shouldLoadFullStateOnBoot_() {
  return Boolean(initialQuery.menu || initialQuery.mode === 'detail');
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
    bindCandidateAccordion();
    bindLoginButton();
    bindSettingsModal();
    bindMasterSearch();
    hydrateQuery();
    bindViewTabs();
    bindMealTypeButtons();
    bindMealDateButtons();
    bindLogFilterButtons();
    bindFieldInteractions();
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
  state.appliedMenuValue = String(value || '').trim();
  if (config.markDirty) {
    state.menuDirty = true;
  } else if (!config.preserveDirty) {
    state.menuDirty = false;
  }
}

function bindMealTypeButtons() {
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    if (button.dataset.mealType) {
      button.addEventListener('click', () => setMealType(button.dataset.mealType));
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
    button.addEventListener('click', () => setMealDatePreset(button.dataset.datePreset || 'today'));
  });
}

function bindLogFilterButtons() {
  document.querySelectorAll('[data-log-filter]').forEach(button => {
    button.addEventListener('click', () => setLogFilter(button.dataset.logFilter || 'all'));
  });
}

function setMealType(mealType) {
  const normalized = ['朝', '昼', '夜', 'その他'].includes(mealType) ? mealType : '朝';
  document.getElementById('meal-type').value = normalized;
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    if (button.dataset.mealType) {
      button.classList.toggle('is-active', button.dataset.mealType === normalized);
    }
  });
}

function setMealDatePreset(datePreset, mealDate) {
  const normalized = datePreset === 'yesterday' ? 'yesterday' : 'today';
  const resolvedDate = mealDate || buildMealDateFromPreset_(normalized);
  document.getElementById('meal-date').value = resolvedDate;
  document.querySelectorAll('.date-chip-btn').forEach(button => {
    button.classList.toggle('is-active', button.dataset.datePreset === normalized);
  });
  document.getElementById('meal-date-label').textContent = normalized === 'yesterday'
    ? `昨日 (${formatDateLabel_(resolvedDate)}) の記録として保存します。`
    : `今日 (${formatDateLabel_(resolvedDate)}) の記録として保存します。`;
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
    input.addEventListener('input', () => updateFieldState(input, input === document.activeElement));
    updateFieldState(input, false);
  });
  document.getElementById('menu-name').addEventListener('input', () => {
    if (!state.isProgrammaticMenuUpdate) {
      state.menuDirty = true;
    }
  });
}

function updateFieldState(input, isActive) {
  const field = input.closest('.field');
  if (!field) return;
  const label = field.querySelector('.field-label');
  const value = String(input.value || '').trim();

  field.classList.toggle('is-active', Boolean(isActive));
  field.classList.toggle('has-value', Boolean(value));
  if (label) {
    const baseLabel = input.dataset.fieldLabel || field.dataset.label || '';
    label.textContent = baseLabel;
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
  if (state.pictureUrl) {
    avatar.innerHTML = `<img src="${escapeHtml(state.pictureUrl)}" alt="LINE profile">`;
  } else {
    const fallback = (state.displayName || 'L').slice(0, 1);
    avatar.textContent = fallback;
  }

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
    document.getElementById('card-exact').textContent = '0';
    document.getElementById('card-estimated').textContent = '0';
    document.getElementById('card-diff').textContent = '-';
    document.getElementById('card-diff').classList.remove('is-warning');
    document.getElementById('card-diff-rate').textContent = '-';
    document.getElementById('card-diff-rate').classList.remove('is-warning');
    document.getElementById('card-pending').textContent = '0';
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
  document.getElementById('card-exact').textContent = formatNumber(dashboard.today.totalExact);
  document.getElementById('card-estimated').textContent = formatNumber(dashboard.today.totalEstimated);
  document.getElementById('card-diff').textContent = dashboard.targetDiff == null ? '-' : formatSignedNumber(dashboard.targetDiff);
  document.getElementById('card-diff-rate').textContent = formatTargetRateLabel(dashboard);
  document.getElementById('card-diff').classList.toggle(
    'is-warning',
    dashboard.targetDiff != null && Number(dashboard.targetDiff) < 0
  );
  document.getElementById('card-diff-rate').classList.toggle(
    'is-warning',
    dashboard.targetDiff != null && Number(dashboard.targetDiff) < 0
  );
  document.getElementById('card-pending').textContent = String((dashboard.today.pendingItems || []).length);
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

  document.getElementById('header-target-kcal').textContent = hasTarget ? `${formatNumber(target)} kcal` : '未設定';
  document.getElementById('header-exact-kcal').textContent = `${formatNumber(exact)} kcal`;
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
    : '<div class="empty-state">メニュー名や補足で検索できます。</div>';
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
        <div class="ranking-name">${escapeHtml(item.menu)}</div>
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
    <div class="ranking-item">
      <div class="ranking-rank">#${index + 1}</div>
      <div class="ranking-main">
        <div class="ranking-name">${escapeHtml(item.displayName)}</div>
      </div>
      <div class="ranking-value">${escapeHtml(String(item.streak))}日</div>
    </div>
  `);
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
          <div class="pending-summary-name">${escapeHtml(item)}</div>
          <button type="button" class="secondary compact-button" onclick="applyPendingMenu('${encodeURIComponent(String(item))}')">入力する</button>
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
            <button type="button" class="secondary compact-button" onclick="startEditLog(${Number(log.row || 0)})">編集</button>
            <button type="button" class="secondary compact-button" onclick="deleteLog(${Number(log.row || 0)}, '${encodeURIComponent(String(log.menu || ''))}')">削除</button>
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

  if (!draft) {
    suggestionBox.hidden = true;
    emptyBox.hidden = true;
    candidateAccordion.hidden = true;
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
    setMealType(draft.meal);
  }
  if (draft.mealDate || draft.datePreset) {
    setMealDatePreset(draft.datePreset || inferDatePresetFromMealDate_(draft.mealDate), draft.mealDate);
  }

  const prefill = draft.prefill || {};
  document.getElementById('master-key').value = prefill.masterKey || '';
  applyNutritionFields(prefill.nutrition || {}, {
    unit: prefill.unit || '',
    note: prefill.note || '',
  });

  if (prefill.hasSuggestion) {
    suggestionBox.hidden = false;
    suggestionBox.textContent = `「${prefill.masterName}」を近い候補として下書きに入れました。一致度は ${prefill.scorePercent}% です。`;
  } else {
    suggestionBox.hidden = true;
  }

  const candidates = draft.candidates || [];
  emptyBox.hidden = Boolean(candidates.length);
  candidateAccordion.hidden = !candidates.length;
  if (!candidates.length) {
    state.candidateAccordionOpen = false;
  }

  candidateList.innerHTML = candidates.length
    ? candidates.map((candidate, index) => `
        <div class="candidate-item">
          <div class="candidate-top">
            <div class="candidate-name">${escapeHtml(candidate.name)}</div>
            <div class="candidate-score">一致度 ${candidate.scorePercent}%</div>
          </div>
          <div class="candidate-meta">カロリー ${formatNumber(candidate.kcal)} kcal / たんぱく質 ${formatNumber(candidate.protein)} g / 脂質 ${formatNumber(candidate.fat)} g / 炭水化物 ${formatNumber(candidate.carb)} g</div>
          <button type="button" class="secondary" onclick="applyCandidate(${index})">この候補を使う</button>
        </div>
      `).join('')
    : '<div class="empty-state">近い候補はまだありません。</div>';
  renderCandidateAccordion_();
}

function applyNutritionFields(nutrition, extras) {
  setFieldValue('field-kcal', nutrition.kcal ?? '');
  setFieldValue('field-protein', nutrition.protein ?? '');
  setFieldValue('field-fat', nutrition.fat ?? '');
  setFieldValue('field-carb', nutrition.carb ?? '');
  setFieldValue('field-salt', nutrition.salt ?? '');
  setFieldValue('field-fiber', nutrition.fiber ?? '');
  setFieldValue('field-unit', extras.unit || '');
  setFieldValue('field-note', extras.note || '');
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
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  pushStatus('info', `「${candidate.name}」の数値を入力欄に反映しました。`);
}

function applyMasterSearchResult(index) {
  const candidate = state.masterSearchResults[index];
  if (!candidate) return;
  setMenuValue_(candidate.name || '');
  document.getElementById('master-key').value = candidate.masterKey || '';
  document.getElementById('editing-master-key').value = '';
  applyNutritionFields(candidate, {
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  updateFieldState(document.getElementById('menu-name'), false);
  clearEditMode_();
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${candidate.name}」を入力欄へ反映しました。`);
}

function startMasterEdit(index) {
  const candidate = state.masterSearchResults[index];
  if (!candidate) return;

  document.getElementById('editing-master-key').value = candidate.masterKey || '';
  document.getElementById('editing-log-row').value = '';
  document.getElementById('master-key').value = candidate.masterKey || '';
  setMenuValue_(candidate.name || '');
  applyNutritionFields(candidate, {
    unit: candidate.unit || '',
    note: candidate.note || '',
  });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${candidate.name}」のマスタ編集を開きました。`);
}

function applyPendingMenu(menu) {
  const resolvedMenu = decodeURIComponent(String(menu || ''));
  setMenuValue_(resolvedMenu);
  document.getElementById('master-key').value = '';
  clearEditMode_();
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${resolvedMenu}」の入力欄を開きました。`);
  reloadState();
}

function renderCandidateAccordion_() {
  const draft = state.draft || null;
  const candidates = draft && draft.candidates ? draft.candidates : [];
  const accordion = document.getElementById('candidate-accordion');
  const body = document.getElementById('candidate-accordion-body');
  const icon = document.getElementById('candidate-accordion-icon');
  const label = document.getElementById('candidate-accordion-label');
  const toggle = document.getElementById('candidate-accordion-toggle');

  if (!candidates.length) {
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
  label.textContent = buildCandidateAccordionLabel_(candidates);
}

function buildCandidateAccordionLabel_(candidates) {
  if (!candidates.length) {
    return '近い候補';
  }

  if (candidates.length === 1) {
    return `近い候補 (${candidates[0].name})`;
  }

  return `近い候補 (${candidates[0].name} など${candidates.length}件)`;
}

function setTargetSyncing(isLoading) {
  state.isTargetSyncing = Boolean(isLoading);
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
  saveButton.textContent = state.isTargetSyncing ? '同期中...' : '保存';
  openButton.disabled = state.isTargetSyncing || !hasUser || !canUse;
  field.classList.toggle('is-editable', Boolean(hasUser && canUse && !state.isTargetSyncing));
}

function isEditingLog_() {
  return Boolean(document.getElementById('editing-log-row').value.trim());
}

function clearEditMode_() {
  document.getElementById('editing-log-row').value = '';
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
  submitButton.textContent = editing ? '保存して更新' : '保存して記録';
  submitButton.disabled = !canUse;
  masterButton.hidden = !editingMaster;
  masterButton.disabled = !canUse;
  cancelButton.disabled = !canUse;
  cancelButton.hidden = !editing && !editingMaster;
}

function startEditLog(rowNumber) {
  const log = state.dashboard && state.dashboard.recentLogs
    ? state.dashboard.recentLogs.find(item => Number(item.row) === Number(rowNumber))
    : null;
  if (!log) return;

  document.getElementById('editing-log-row').value = String(log.row || '');
  setMenuValue_(log.menu || '');
  document.getElementById('master-key').value = log.masterKey || '';
  setMealType(log.meal || '朝');
  setMealDatePreset(inferDatePresetFromMealDate_(log.mealDate), String(log.mealDate || '').slice(0, 10));
  applyNutritionFields(log, {
    unit: log.unit || '',
    note: log.note || '',
  });
  refreshMealSubmitControls_();
  setActiveView('input');
  document.getElementById('meal-entry-band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pushStatus('info', `「${log.menu}」を編集しています。`);
}

async function deleteLog(rowNumber, menuName) {
  const resolvedName = decodeURIComponent(String(menuName || ''));
  if (!window.confirm(`「${resolvedName || 'この記録'}」を削除しますか？`)) {
    return;
  }
  if (!state.userPermission.canUse) {
    pushStatus('notice', '現在はログを編集できません。');
    return;
  }

  setSyncVisualState(true);
  pushStatus('info', 'ログを削除中...');
  try {
    const result = await runServer('deleteMealLog', {
      userId: document.getElementById('user-id').value.trim(),
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      row: rowNumber,
    });
    state.dashboard = result.dashboard || null;
    state.dashboardLoaded = true;
    renderDashboard(state.dashboard);
    applyPermissionState_(result.permission);
    pushStatus('info', 'ログを削除しました。');
  } catch (error) {
    pushStatus('warning', `ログ削除に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setSyncVisualState(false);
  }
}

async function saveProfileTarget() {
  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後に目標を更新できます。');
    return;
  }
  if (!state.userPermission.canUse) {
    pushStatus('notice', '現在は目標カロリーを更新できません。');
    return;
  }

  setTargetSyncing(true);
  setSyncVisualState(true);
  pushStatus('info', '目標カロリーを同期中...');

  try {
    const result = await runServer('updateProfile', {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      calorieTarget: document.getElementById('calorie-target').value,
      goalType: 'keep',
      notify: document.getElementById('notify-setting').checked,
    });

    state.dashboard = result.dashboard || null;
    state.header = buildHeaderSummaryFromDashboard_(state.dashboard);
    renderDashboard(state.dashboard);
    saveCachedAppState_(userId, state.dashboard, state.draft);
    applyIdentityStatus_(result.identity);
    applyPermissionState_(result.permission);
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

  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後に保存できます。');
    return;
  }
  if (!state.userPermission.canUse) {
    pushStatus('notice', '現在は管理者の許可待ちのため保存できません。');
    return;
  }

  const editingRow = document.getElementById('editing-log-row').value.trim();
  const action = editingRow ? 'updateMealLog' : 'submitMealDetail';

  setSyncVisualState(true);
  pushStatus('info', editingRow ? '更新して集計を同期中...' : '保存して集計を同期中...');

  try {
    const result = await runServer(action, {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      row: editingRow,
      meal: document.getElementById('meal-type').value,
      mealDate: document.getElementById('meal-date').value,
      datePreset: inferDatePresetFromMealDate_(document.getElementById('meal-date').value),
      menu: document.getElementById('menu-name').value.trim(),
      masterKey: document.getElementById('master-key').value.trim(),
      kcal: document.getElementById('field-kcal').value,
      protein: document.getElementById('field-protein').value,
      fat: document.getElementById('field-fat').value,
      carb: document.getElementById('field-carb').value,
      salt: document.getElementById('field-salt').value,
      fiber: document.getElementById('field-fiber').value,
      unit: document.getElementById('field-unit').value.trim(),
      note: document.getElementById('field-note').value.trim(),
      sendLineSummary: true,
    });

    document.getElementById('meal-reply').textContent = result.reply || '';
    state.dashboard = result.dashboard || null;
    state.draft = result.draft || null;
    state.dashboardLoaded = true;
    renderDashboard(state.dashboard);
    renderDraft(state.draft);
    saveCachedAppState_(userId, state.dashboard, state.draft);
    applyIdentityStatus_(result.identity);
    applyPermissionState_(result.permission);
    pushStatus(
      'info',
      editingRow
        ? 'ログを更新しました。'
        : (result.summaryPushed ? '保存してLINEに今日の集計を返しました。' : '保存しました。LINE送信は未実行です。')
    );
  } catch (error) {
    pushStatus('warning', `保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setSyncVisualState(false);
  }
});

document.getElementById('refresh-draft').addEventListener('click', async () => {
  await reloadState();
});

document.getElementById('save-target').addEventListener('click', saveProfileTarget);
document.getElementById('save-master-only-button').addEventListener('click', async () => {
  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後にマスタを保存できます。');
    return;
  }
  if (!state.userPermission.canUse) {
    pushStatus('notice', '現在はマスタを保存できません。');
    return;
  }

  setSyncVisualState(true);
  pushStatus('info', 'マスタを保存中...');
  try {
    const result = await runServer('saveNutritionMasterOnly', {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      meal: document.getElementById('meal-type').value,
      mealDate: document.getElementById('meal-date').value,
      datePreset: inferDatePresetFromMealDate_(document.getElementById('meal-date').value),
      masterKey: document.getElementById('editing-master-key').value.trim() || document.getElementById('master-key').value.trim(),
      menu: document.getElementById('menu-name').value.trim(),
      kcal: document.getElementById('field-kcal').value,
      protein: document.getElementById('field-protein').value,
      fat: document.getElementById('field-fat').value,
      carb: document.getElementById('field-carb').value,
      salt: document.getElementById('field-salt').value,
      fiber: document.getElementById('field-fiber').value,
      unit: document.getElementById('field-unit').value.trim(),
      note: document.getElementById('field-note').value.trim(),
    });
    document.getElementById('master-key').value = result.savedMaster && result.savedMaster.masterKey ? result.savedMaster.masterKey : document.getElementById('master-key').value;
    document.getElementById('editing-master-key').value = '';
    state.dashboard = result.dashboard || state.dashboard;
    state.draft = result.draft || state.draft;
    if (state.dashboard) {
      renderDashboard(state.dashboard);
    }
    if (state.draft) {
      renderDraft(state.draft);
    }
    applyIdentityStatus_(result.identity);
    applyPermissionState_(result.permission);
    refreshMealSubmitControls_();
    pushStatus('info', '栄養マスタを保存しました。');
  } catch (error) {
    pushStatus('warning', `マスタ保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
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

  const total = Number(dashboard.today.totalExact || 0) + Number(dashboard.today.totalEstimated || 0);
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
window.startEditLog = startEditLog;
window.deleteLog = deleteLog;
refreshMealSubmitControls_();
initializeApp();
