  const appConfig = window.__MEAL_APP_CONFIG__ || {};
  const initialLiffId = String(appConfig.initialLiffId || '');
  const initialQuery = appConfig.initialQuery || {};
  const apiBaseUrl = String(appConfig.apiBaseUrl || '').trim();
  const state = {
    userId: '',
    displayName: '',
    pictureUrl: '',
    idToken: '',
    dashboard: null,
    draft: null,
  };

  function setStatus(message) {
    document.getElementById('status').textContent = message;
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
      hydrateQuery();
      bindMealTypeButtons();
      bindFieldInteractions();

      if (initialLiffId && window.liff) {
        await liff.init({ liffId: initialLiffId });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          state.userId = profile.userId || '';
          state.displayName = profile.displayName || '';
          state.pictureUrl = profile.pictureUrl || '';
          state.idToken = liff.getIDToken() || '';
          document.getElementById('user-id').value = state.userId;
          document.getElementById('display-name').value = state.displayName;
          renderProfileHeader();
          setStatus('LINEプロフィールを読み込みました。');
        } else {
          setStatus('LIFFは初期化済みですが未ログインです。LINE上から開くとプロフィールを取得できます。');
        }
      } else {
        setStatus('LIFF ID が未設定です。LINEプロフィールの取得はまだできません。');
      }

      if (!apiBaseUrl) {
        setStatus('GAS API URL が未設定です。site-config.js を確認してください。');
        return;
      }

      await reloadState();
    } catch (error) {
      setStatus(`初期化失敗: ${error.message}`);
    }
  }

  function hydrateQuery() {
    if (initialQuery.meal) {
      setMealType(initialQuery.meal);
    }
    if (initialQuery.menu) {
      document.getElementById('menu-name').value = initialQuery.menu;
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
    const label = field.querySelector('.field-label');
    const baseLabel = input.dataset.fieldLabel || field.dataset.label || '';
    const value = String(input.value || '').trim();
    const compactValue = value.length > 18 ? `${value.slice(0, 18)}...` : value;

    field.classList.toggle('is-active', Boolean(isActive));
    field.classList.toggle('has-value', Boolean(value));
    if (isActive || !value) {
      label.textContent = baseLabel;
      return;
    }

    label.textContent = `${baseLabel}：${compactValue}`;
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
      return;
    }

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
  }

  function renderDashboard(dashboard) {
    if (!dashboard) {
      document.getElementById('calorie-target').value = '';
      document.getElementById('card-exact').textContent = '0';
      document.getElementById('card-estimated').textContent = '0';
      document.getElementById('card-diff').textContent = '-';
      document.getElementById('card-pending').textContent = '0';
      document.getElementById('nutrition-summary').textContent = '';
      document.getElementById('logs-list').innerHTML = '<div class="empty-state">ログインすると今日の記録を表示します。</div>';
      return;
    }

    document.getElementById('calorie-target').value = dashboard.user.calorieTarget ?? '';
    document.getElementById('card-exact').textContent = formatNumber(dashboard.today.totalExact);
    document.getElementById('card-estimated').textContent = formatNumber(dashboard.today.totalEstimated);
    document.getElementById('card-diff').textContent = dashboard.targetDiff == null ? '-' : formatSignedNumber(dashboard.targetDiff);
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
  }

  async function saveProfileTarget() {
    const userId = document.getElementById('user-id').value.trim();
    if (!userId) {
      setStatus('LINEプロフィールを取得できてから目標を更新できます。');
      return;
    }

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
    setStatus('目標カロリーを更新しました。');
  }

  document.getElementById('meal-detail-form').addEventListener('submit', async event => {
    event.preventDefault();

    const userId = document.getElementById('user-id').value.trim();
    if (!userId) {
      setStatus('LINEから開いてプロフィールを取得すると保存できます。');
      return;
    }

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
    setStatus(result.summaryPushed ? '保存してLINEに今日の集計を返しました。' : '保存しました。LINE送信は未実行です。');
  });

  document.getElementById('refresh-draft').addEventListener('click', reloadState);
  document.getElementById('save-target').addEventListener('click', saveProfileTarget);
  document.getElementById('close-liff').addEventListener('click', () => {
    if (window.liff && typeof liff.closeWindow === 'function') {
      liff.closeWindow();
      return;
    }
    setStatus('この環境では LIFF のウィンドウを閉じられません。');
  });

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

  function formatLogKcal(kcal, status) {
    if (kcal == null || kcal === '') {
      return 'カロリー未登録';
    }
    return status === 'estimated' ? `約 ${formatNumber(kcal)} kcal` : `${formatNumber(kcal)} kcal`;
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
