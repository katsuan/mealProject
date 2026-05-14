/**
 * Use case functions.
 */

function isSetTargetCommand(text) {
  return /^目標\s*\d+\s*(kcal)?$/i.test(String(text || '').trim());
}

function summarizeMealLogs(logs) {
  const exactLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.EXACT);
  const estimatedLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.ESTIMATED);
  const pendingLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.PENDING);

  return {
    totalExact: exactLogs.reduce((sum, log) => sum + Number(log.kcal || 0), 0),
    totalEstimated: estimatedLogs.reduce((sum, log) => sum + Number(log.kcal || 0), 0),
    hasPending: pendingLogs.length > 0,
    pendingItems: [...new Set(pendingLogs.map(log => log.menu))],
    nutrition: summarizeNutrition(logs),
  };
}

function getTodaySummary(userId) {
  return getSummaryByDate(userId, new Date());
}

function getSummaryByDate(userId, date) {
  const logs = getMealLogsByUserAndDate(userId, date);
  return summarizeMealLogs(logs);
}

function getMealLogsByUserAndDate(userId, date) {
  return getMealLogs().filter(log =>
    log.userId === userId && isSameDay(log.mealDate, date)
  );
}

function getMealLogsByUser(userId) {
  return getMealLogs().filter(log => log.userId === userId);
}

function getMealLogsByUserInRange(userId, startDate, endDate) {
  const startKey = formatDateKey_(startDate);
  const endKey = formatDateKey_(endDate);
  return getMealLogsByUser(userId).filter(log => {
    const key = formatDateKey_(log.mealDate);
    return key >= startKey && key <= endKey;
  });
}

function isSameDay(left, right) {
  if (!left || !right) return false;
  return formatDateKey_(left) === formatDateKey_(right);
}

function reapplyNutritionMaster() {
  const logs = getMealLogs();
  const sheet = getSpreadsheet_().getSheetByName(SHEET.MEAL_LOGS);
  if (!sheet) return;

  logs.forEach(log => {
    const master = log.masterKey ? getNutritionMaster(log.masterKey) : findExactNutritionMaster(log.menu);
    const nutrition = master ? pickNutrition_(master) : emptyNutrition_();
    const status = master && hasAnyNutritionValue_(master) ? KCAL_STATUS.EXACT : KCAL_STATUS.PENDING;

    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.kcal).setValue(nutrition.kcal);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.protein).setValue(nutrition.protein);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.fat).setValue(nutrition.fat);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.carb).setValue(nutrition.carb);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.salt).setValue(nutrition.salt);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.fiber).setValue(nutrition.fiber);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.kcalStatus).setValue(status);
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.masterKey).setValue(master ? master.masterKey : '');
    sheet.getRange(log.row, MEAL_LOG_COL_INDEX.updatedAt).setValue(new Date());
  });
}

function handleSetTargetCommand(userId, text) {
  const kcal = parseTargetKcal(text);
  updateUserCalorieTarget(userId, kcal);
  return buildTargetUpdatedReply(userId, kcal);
}

function parseTargetKcal(text) {
  const match = String(text || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getDashboardData(userId) {
  const user = ensureUserExists_(userId);
  const today = getTodaySummary(userId);
  const recentLogs = getMealLogsByUserAndDate(userId, new Date())
    .sort((left, right) => new Date(right.mealDate) - new Date(left.mealDate));
  const totalIntake = today.totalExact + today.totalEstimated;

  return {
    user: user,
    today: today,
    recentLogs: recentLogs.map(log => serializeMealLog_(log)),
    weekly: getWeeklyChartData_(userId, 7),
    popularMenus: getPopularMenusByUser_(userId, 5),
    streak: getUserStreakSummary_(userId),
    streakRanking: getStreakRanking_(10),
    targetDiff: user.calorieTarget == null ? null : user.calorieTarget - totalIntake,
    detailUrl: buildLiffUrl_({ mode: 'detail' }),
  };
}

function getWeeklyChartData_(userId, days) {
  const totalDays = Math.max(1, Number(days || 7));
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - (totalDays - 1));

  const logs = getMealLogsByUserInRange(userId, startDate, endDate);
  const byDate = {};
  logs.forEach(log => {
    const key = formatDateKey_(log.mealDate);
    if (!byDate[key]) {
      byDate[key] = { 朝: 0, 昼: 0, 夜: 0, その他: 0 };
    }
    byDate[key][sanitizeMealType_(log.meal)] += Number(log.kcal || 0);
  });

  const items = [];
  for (let index = 0; index < totalDays; index += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    const key = formatDateKey_(current);
    const mealTotals = byDate[key] || { 朝: 0, 昼: 0, 夜: 0, その他: 0 };
    const total = mealTotals.朝 + mealTotals.昼 + mealTotals.夜 + mealTotals.その他;
    items.push({
      dateKey: key,
      label: Utilities.formatDate(current, APP_TIMEZONE, 'M/d'),
      meals: mealTotals,
      total: Math.round(total * 10) / 10,
    });
  }

  return items;
}

function getPopularMenusByUser_(userId, limit) {
  const grouped = {};
  getMealLogsByUser(userId).forEach(log => {
    const key = buildMealLogGroupingKey_(log);
    if (!grouped[key]) {
      grouped[key] = {
        menu: log.menu,
        count: 0,
        totalKcal: 0,
        lastMealDate: log.mealDate,
      };
    }
    grouped[key].count += 1;
    grouped[key].totalKcal += Number(log.kcal || 0);
    if (new Date(log.mealDate) > new Date(grouped[key].lastMealDate)) {
      grouped[key].lastMealDate = log.mealDate;
    }
  });

  return Object.keys(grouped)
    .map(key => grouped[key])
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return new Date(right.lastMealDate) - new Date(left.lastMealDate);
    })
    .slice(0, limit || 5)
    .map(item => ({
      menu: item.menu,
      count: item.count,
      averageKcal: item.count ? Math.round((item.totalKcal / item.count) * 10) / 10 : 0,
      lastMealDate: toIsoDateTime_(item.lastMealDate),
    }));
}

function getUserStreakSummary_(userId) {
  const dateKeys = [...new Set(getMealLogsByUser(userId).map(log => formatDateKey_(log.mealDate)))].sort();
  if (!dateKeys.length) {
    return {
      current: 0,
      longest: 0,
    };
  }

  let longest = 0;
  let run = 0;
  let previousDate = null;
  dateKeys.forEach(key => {
    const date = new Date(`${key}T00:00:00`);
    if (!previousDate) {
      run = 1;
    } else {
      const diffDays = Math.round((date - previousDate) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    previousDate = date;
  });

  let current = 0;
  let cursor = new Date();
  while (dateKeys.includes(formatDateKey_(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (!current) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let fallback = 0;
    let currentCursor = yesterday;
    while (dateKeys.includes(formatDateKey_(currentCursor))) {
      fallback += 1;
      currentCursor.setDate(currentCursor.getDate() - 1);
    }
    current = fallback;
  }

  return {
    current: current,
    longest: longest,
  };
}

function getStreakRanking_(limit) {
  return listUsers()
    .map(user => ({
      userId: user.userId,
      displayName: user.displayName || 'ユーザー',
      streak: getUserStreakSummary_(user.userId).current,
    }))
    .filter(item => item.streak > 0)
    .sort((left, right) => {
      if (right.streak !== left.streak) return right.streak - left.streak;
      return String(left.displayName).localeCompare(String(right.displayName), 'ja');
    })
    .slice(0, limit || 10);
}

function buildMealLogGroupingKey_(log) {
  return normalizeText_(String(log && log.menu || ''));
}

function handleMealMessageFlow(userId, text, displayName, source) {
  ensureProjectSetup_();
  const inputText = String(text || '').trim();
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!inputText) {
    throw new Error('text is required');
  }

  ensureUserExists_(userId, displayName);

  if (isSetTargetCommand(inputText)) {
    return {
      kind: 'target_updated',
      text: handleSetTargetCommand(userId, inputText),
      dashboard: getDashboardData(userId),
    };
  }

  const parsed = parseMealText(inputText);
  const exact = findExactNutritionMaster(parsed.menu);

  if (exact) {
    const record = logMealFromMaster(userId, parsed, exact, {
      source: source || SOURCE.TEXT,
      mealDate: parsed.mealDate,
    });
    return {
      kind: 'logged',
      parsed: parsed,
      record: record,
      dashboard: getDashboardData(userId),
    };
  }

  return {
    kind: 'needs_liff',
    parsed: parsed,
    draft: buildNutritionDraft(parsed.menu),
    dashboard: getDashboardData(userId),
  };
}

function submitMealDetail(userId, payload, source) {
  ensureProjectSetup_();
  ensureUserExists_(userId, payload.displayName);

  const parsed = {
    meal: sanitizeMealType_(payload.meal),
    menu: String(payload.menu || '').trim(),
  };
  if (!parsed.menu) {
    throw new Error('menu is required');
  }
  if (toNullableNumber_(payload.kcal) == null) {
    throw new Error('kcal is required');
  }

  const existingMaster = payload.masterKey ? getNutritionMaster(payload.masterKey) : null;
  const shouldReuseMasterKey = existingMaster &&
    normalizeText_(existingMaster.name) === normalizeText_(parsed.menu);

  const savedMaster = saveNutritionMaster({
    masterKey: shouldReuseMasterKey ? payload.masterKey : '',
    name: parsed.menu,
    kcal: payload.kcal,
    protein: payload.protein,
    fat: payload.fat,
    carb: payload.carb,
    salt: payload.salt,
    fiber: payload.fiber,
    unit: payload.unit,
    note: payload.note,
    status: 'active',
    source: source || SOURCE.LIFF,
  });

  const record = logMealFromMaster(userId, parsed, savedMaster, {
    source: source || SOURCE.LIFF,
    mealDate: payload.mealDate,
  });

  return {
    record: record,
    savedMaster: savedMaster,
    dashboard: getDashboardData(userId),
    draft: buildNutritionDraft(parsed.menu),
  };
}

function submitMealCandidate(userId, payload, source) {
  ensureProjectSetup_();
  ensureUserExists_(userId, payload && payload.displayName);

  const masterKey = String(payload && payload.masterKey || '').trim();
  const master = masterKey ? getNutritionMaster(masterKey) : null;
  if (!master || !hasAnyNutritionValue_(master)) {
    throw new Error('candidate master is not available');
  }

  const parsed = {
    meal: sanitizeMealType_(payload && payload.meal),
    menu: String(master.name || payload && payload.menu || '').trim(),
  };
  if (!parsed.menu) {
    throw new Error('menu is required');
  }

  const record = logMealFromMaster(userId, parsed, master, {
    source: source || SOURCE.LINE,
    mealDate: payload && payload.mealDate,
  });

  return {
    parsed: parsed,
    record: record,
    dashboard: getDashboardData(userId),
  };
}

function getMealDraftState(payload) {
  const menu = String(payload && payload.menu || '').trim();
  const meal = sanitizeMealType_(payload && payload.meal);
  const mealDate = String(payload && payload.mealDate || '').trim();
  const datePreset = String(payload && payload.datePreset || inferDatePresetFromMealDate_(mealDate) || 'today').trim();
  const draft = menu ? buildNutritionDraft(menu) : {
    menu: '',
    prefill: {
      hasSuggestion: false,
      masterKey: '',
      masterName: '',
      score: 0,
      scorePercent: 0,
      nutrition: emptyNutrition_(),
      unit: '',
      note: '',
    },
    candidates: [],
  };

  return {
    meal: meal,
    menu: menu,
    mealDate: mealDate,
    datePreset: datePreset,
    prefill: serializeDraftPrefill_(draft.prefill),
    candidates: draft.candidates.map(serializeNutritionCandidate_),
  };
}

function inferDatePresetFromMealDate_(mealDate) {
  if (!mealDate) return 'today';
  const yesterday = resolveMealDateByPreset_('yesterday');
  return String(mealDate).slice(0, 10) === yesterday ? 'yesterday' : 'today';
}

function serializeDraftPrefill_(prefill) {
  return {
    hasSuggestion: Boolean(prefill && prefill.hasSuggestion),
    masterKey: String(prefill && prefill.masterKey || ''),
    masterName: String(prefill && prefill.masterName || ''),
    score: Number(prefill && prefill.score || 0),
    scorePercent: Number(prefill && prefill.scorePercent || 0),
    unit: String(prefill && prefill.unit || ''),
    note: String(prefill && prefill.note || ''),
    nutrition: Object.assign({}, emptyNutrition_(), prefill && prefill.nutrition),
  };
}

function serializeNutritionCandidate_(candidate) {
  return {
    masterKey: candidate.masterKey,
    name: candidate.name,
    kcal: candidate.kcal,
    protein: candidate.protein,
    fat: candidate.fat,
    carb: candidate.carb,
    salt: candidate.salt,
    fiber: candidate.fiber,
    unit: candidate.unit,
    note: candidate.note,
    status: candidate.status,
    score: candidate.score,
    scorePercent: candidate.scorePercent,
  };
}

function serializeMealLog_(log) {
  return {
    mealDate: toIsoDateTime_(log.mealDate),
    userId: log.userId,
    meal: log.meal,
    menu: log.menu,
    kcal: log.kcal,
    protein: log.protein,
    fat: log.fat,
    carb: log.carb,
    salt: log.salt,
    fiber: log.fiber,
    kcalStatus: log.kcalStatus,
    masterKey: log.masterKey,
    source: log.source,
    createdAt: toIsoDateTime_(log.createdAt),
    updatedAt: toIsoDateTime_(log.updatedAt),
  };
}
