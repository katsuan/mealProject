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
  const recentLogs = getRecentMealLogsByUser(userId, 20);
  const totalIntake = today.totalExact + today.totalEstimated;

  return {
    user: user,
    today: today,
    recentLogs: recentLogs.map(log => serializeMealLog_(log)),
    targetDiff: user.calorieTarget == null ? null : user.calorieTarget - totalIntake,
    detailUrl: buildLiffUrl_({ mode: 'detail' }),
  };
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
    prefill: serializeDraftPrefill_(draft.prefill),
    candidates: draft.candidates.map(serializeNutritionCandidate_),
  };
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
