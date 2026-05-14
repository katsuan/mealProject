const appConfig = window.__MEAL_APP_CONFIG__ || {};
const appVersion = String(appConfig.appVersion || '').trim();
const initialLiffId = String(appConfig.initialLiffId || '').trim();
const apiBaseUrl = String(appConfig.apiBaseUrl || '').trim();
const initialQuery = buildInitialQuery_(appConfig.initialQuery || {});
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
  isTargetEditing: false,
  identityWarningKey: '',
  statusAccordionOpen: false,
};

function buildInitialQuery_(fallback) {
  const params = new URLSearchParams(window.location.search || '');
  return {
    mode: params.get('mode') || String(fallback.mode || '').trim(),
    meal: params.get('meal') || String(fallback.meal || '').trim(),
    menu: params.get('menu') || String(fallback.menu || '').trim(),
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
  if (!appVersion) return;
  pushStatus('debug', `version: ${appVersion}`);
}

function renderStatus() {
  const latest = state.statusLogs[state.statusLogs.length - 1] || {
    level: 'info',
    label: STATUS_META.info.label,
    message: 'プロフィールと今日の集計を準備しています。',
  };
  const latestNode = document.getElementById('status-latest');
  const textNode = document.getElementById('status-text');
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

  latestNode.className = `status-latest ${STATUS_META[latest.level].className}`;
  textNode.textContent = latest.message;
  accordionNode.hidden = !state.statusAccordionOpen;
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
    throw new Error(`API request failed: ${response.status}`);
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
    hydrateQuery();
    bindMealTypeButtons();
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

    await reloadState();
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
      pushStatus('notice', 'LINEログインするとプロフィールを取得できます。');
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
  if (initialQuery.menu) {
    document.getElementById('menu-name').value = initialQuery.menu;
    updateFieldState(document.getElementById('menu-name'), false);
  }
}

function bindMealTypeButtons() {
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    button.addEventListener('click', () => setMealType(button.dataset.mealType));
  });
}

function setMealType(mealType) {
  const normalized = ['朝', '昼', '夜', 'その他'].includes(mealType) ? mealType : '朝';
  document.getElementById('meal-type').value = normalized;
  document.querySelectorAll('.meal-type-btn').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mealType === normalized);
  });
}

function bindFieldInteractions() {
  document.querySelectorAll('.field input, .field textarea').forEach(input => {
    input.addEventListener('focus', () => updateFieldState(input, true));
    input.addEventListener('blur', () => updateFieldState(input, false));
    input.addEventListener('input', () => updateFieldState(input, input === document.activeElement));
    updateFieldState(input, false);
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
  const profileName = state.displayName ? `${state.displayName}さん` : 'ログイン待ちです';
  document.getElementById('profile-name').textContent = profileName;
  document.getElementById('display-name').value = state.displayName || '';

  const avatar = document.getElementById('avatar');
  if (state.pictureUrl) {
    avatar.innerHTML = `<img src="${escapeHtml(state.pictureUrl)}" alt="LINE profile">`;
  } else {
    const fallback = (state.displayName || 'L').slice(0, 1);
    avatar.textContent = fallback;
  }

  refreshTargetControls();
}

async function reloadState() {
  const userId = document.getElementById('user-id').value.trim();
  const displayName = document.getElementById('display-name').value.trim();

  if (!userId) {
    state.dashboard = null;
    state.draft = null;
    renderDashboard(null);
    renderDraft(null);
    renderProfileHeader();
    pushStatus('notice', 'LINEログインすると目標カロリーと今日の集計を同期できます。');
    return;
  }

  setTargetSyncing(true);
  pushStatus('info', '同期中...');

  try {
    const result = await runServer('getLiffAppState', {
      userId: userId,
      displayName: displayName,
      idToken: state.idToken,
      meal: document.getElementById('meal-type').value,
      menu: document.getElementById('menu-name').value.trim(),
    });

    state.userId = userId;
    state.displayName = result.dashboard && result.dashboard.user
      ? (result.dashboard.user.displayName || state.displayName)
      : state.displayName;
    state.dashboard = result.dashboard || null;
    state.draft = result.draft || null;

    renderProfileHeader();
    renderDashboard(state.dashboard);
    renderDraft(state.draft);
    applyIdentityStatus_(result.identity);
    pushStatus('info', '同期しました。');
  } catch (error) {
    pushStatus('warning', `同期に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setTargetSyncing(false);
  }
}

function renderDashboard(dashboard) {
  if (!dashboard) {
    state.isTargetEditing = false;
    document.getElementById('calorie-target').value = '';
    updateFieldState(document.getElementById('calorie-target'), false);
    document.getElementById('card-exact').textContent = '0';
    document.getElementById('card-estimated').textContent = '0';
    document.getElementById('card-diff').textContent = '-';
    document.getElementById('card-diff').classList.remove('is-warning');
    document.getElementById('card-diff-rate').textContent = '-';
    document.getElementById('card-diff-rate').classList.remove('is-warning');
    document.getElementById('card-pending').textContent = '0';
    document.getElementById('nutrition-summary').textContent = '';
    document.getElementById('logs-list').innerHTML = '<div class="empty-state">ログインすると今日の記録を表示します。</div>';
    refreshTargetControls();
    return;
  }

  state.isTargetEditing = false;
  document.getElementById('calorie-target').value = dashboard.user.calorieTarget ?? '';
  updateFieldState(document.getElementById('calorie-target'), false);
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

  const logs = dashboard.recentLogs || [];
  document.getElementById('logs-list').innerHTML = logs.length
    ? logs.map(log => `
        <div class="log-item">
          <div class="log-top">
            <div class="log-menu">${escapeHtml(log.menu)}</div>
            <div class="log-date">${escapeHtml(formatDateTime(log.mealDate))}</div>
          </div>
          <div class="log-meta">${escapeHtml(log.meal)} / ${escapeHtml(formatLogKcal(log.kcal, log.kcalStatus))}</div>
        </div>
      `).join('')
    : '<div class="empty-state">まだ記録がありません。</div>';
  refreshTargetControls();
}

function renderDraft(draft) {
  const suggestionBox = document.getElementById('suggestion-box');
  const emptyBox = document.getElementById('empty-box');
  const candidateList = document.getElementById('candidate-list');

  if (!draft) {
    suggestionBox.hidden = true;
    emptyBox.hidden = true;
    candidateList.innerHTML = '<div class="empty-state">候補はここに表示されます。</div>';
    return;
  }

  if (draft.menu) {
    document.getElementById('menu-name').value = draft.menu;
    updateFieldState(document.getElementById('menu-name'), false);
  }
  if (draft.meal) {
    setMealType(draft.meal);
  }

  const prefill = draft.prefill || {};
  document.getElementById('master-key').value = prefill.masterKey || '';
  applyNutritionFields(prefill.nutrition || {}, {
    unit: prefill.unit || '',
    note: prefill.note || '',
  });

  if (prefill.hasSuggestion) {
    suggestionBox.hidden = false;
    suggestionBox.textContent = `「${prefill.masterName}」を近い候補として下書きに入れました。推定一致度は ${prefill.scorePercent}% です。`;
  } else {
    suggestionBox.hidden = true;
  }

  emptyBox.hidden = Boolean((draft.candidates || []).length);

  candidateList.innerHTML = (draft.candidates || []).length
    ? draft.candidates.map((candidate, index) => `
        <div class="candidate-item">
          <div class="candidate-top">
            <div class="candidate-name">${escapeHtml(candidate.name)}</div>
            <div class="candidate-score">${candidate.scorePercent}%</div>
          </div>
          <div class="candidate-meta">カロリー ${formatNumber(candidate.kcal)} kcal / たんぱく質 ${formatNumber(candidate.protein)} g / 脂質 ${formatNumber(candidate.fat)} g / 炭水化物 ${formatNumber(candidate.carb)} g</div>
          <button type="button" class="secondary" onclick="applyCandidate(${index})">この候補を使う</button>
        </div>
      `).join('')
    : '<div class="empty-state">近い候補はまだありません。</div>';
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

function setTargetSyncing(isLoading) {
  state.isTargetSyncing = Boolean(isLoading);
  refreshTargetControls();
}

function refreshTargetControls() {
  const input = document.getElementById('calorie-target');
  const button = document.getElementById('save-target');
  const field = document.getElementById('target-field');
  const hasUser = Boolean(document.getElementById('user-id').value.trim());

  input.disabled = state.isTargetSyncing || !hasUser || !state.isTargetEditing;
  button.disabled = state.isTargetSyncing || !hasUser;
  button.textContent = state.isTargetSyncing ? '同期中...' : (state.isTargetEditing ? '保存' : '更新');
  field.classList.toggle('is-editable', Boolean(hasUser && state.isTargetEditing && !state.isTargetSyncing));
}

function beginTargetEdit() {
  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後に目標を更新できます。');
    return;
  }

  state.isTargetEditing = true;
  refreshTargetControls();

  const input = document.getElementById('calorie-target');
  input.focus();
  input.select();
  updateFieldState(input, true);
}

async function saveProfileTarget() {
  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後に目標を更新できます。');
    return;
  }

  setTargetSyncing(true);
  pushStatus('info', '目標カロリーを同期中...');

  try {
    const result = await runServer('updateProfile', {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      calorieTarget: document.getElementById('calorie-target').value,
      goalType: 'keep',
      notify: true,
    });

    state.dashboard = result.dashboard || null;
    renderDashboard(state.dashboard);
    applyIdentityStatus_(result.identity);
    pushStatus('info', '目標カロリーを更新しました。');
  } catch (error) {
    pushStatus('warning', `目標カロリーの更新に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  } finally {
    setTargetSyncing(false);
  }
}

async function handleTargetButtonClick() {
  if (state.isTargetSyncing) return;
  if (!state.isTargetEditing) {
    beginTargetEdit();
    return;
  }
  await saveProfileTarget();
}

document.getElementById('meal-detail-form').addEventListener('submit', async event => {
  event.preventDefault();

  const userId = document.getElementById('user-id').value.trim();
  if (!userId) {
    pushStatus('notice', 'LINEログイン後に保存できます。');
    return;
  }

  pushStatus('info', '保存して集計を同期中...');

  try {
    const result = await runServer('submitMealDetail', {
      userId: userId,
      displayName: document.getElementById('display-name').value.trim(),
      idToken: state.idToken,
      meal: document.getElementById('meal-type').value,
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
    renderDashboard(state.dashboard);
    renderDraft(state.draft);
    applyIdentityStatus_(result.identity);
    pushStatus(
      'info',
      result.summaryPushed ? '保存してLINEに今日の集計を返しました。' : '保存しました。LINE送信は未実行です。'
    );
  } catch (error) {
    pushStatus('warning', `保存に失敗しました: ${error.message}`);
    pushStatus('debug', buildErrorDetail_(error));
  }
});

document.getElementById('refresh-draft').addEventListener('click', async () => {
  await reloadState();
});

document.getElementById('save-target').addEventListener('click', handleTargetButtonClick);
document.getElementById('calorie-target').addEventListener('keydown', async event => {
  if (event.key !== 'Enter' || !state.isTargetEditing) return;
  event.preventDefault();
  await saveProfileTarget();
});
document.getElementById('close-liff').addEventListener('click', () => {
  if (window.liff && typeof liff.closeWindow === 'function') {
    liff.closeWindow();
    return;
  }
  pushStatus('notice', 'この環境では画面を閉じられません。');
});

function applyIdentityStatus_(identity) {
  if (!identity || identity.verified) return;

  if (identity.verificationError) {
    const warningKey = `${identity.userId || 'unknown'}:${identity.verificationError}`;
    if (state.identityWarningKey === warningKey) return;
    state.identityWarningKey = warningKey;
    pushStatus('notice', 'LINEプロフィールの本人確認は一部スキップしました。入力はそのまま続けられます。');
    pushStatus('debug', `本人確認の詳細: ${identity.verificationError}`);
  }
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
initializeApp();
