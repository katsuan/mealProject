/**
 * Use case functions.
 */

function isSetTargetCommand(text) {
  return /^目標\s*\d+\s*(kcal)?$/i.test(String(text || '').trim());
}

function isStandaloneKcalInput_(text) {
  return /^\d+(?:\.\d+)?$/.test(String(text || '').trim());
}

function parseStandaloneKcalInput_(text) {
  if (!isStandaloneKcalInput_(text)) return null;
  const value = Number(String(text || '').trim());
  return Number.isFinite(value) ? value : null;
}

function parsePendingKcalInputContext_(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^(?:(昨日|今日)\s*)?(?:(朝|昼|夜|その他)\s*)?(\d+(?:\.\d+)?)\s*(?:kcal)?$/i);
  if (!match) return null;
  const kcal = Number(match[3] || '');
  if (!Number.isFinite(kcal)) return null;
  const datePreset = match[1] === '昨日' ? 'yesterday' : 'today';
  const meal = match[2] ? sanitizeMealType_(match[2]) : '';
  return {
    kcal: kcal,
    datePreset: datePreset,
    meal: meal,
  };
}

function summarizeMealLogs(logs) {
  const exactLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.EXACT);
  const estimatedLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.ESTIMATED);
  const pendingLogs = logs.filter(log => log.kcalStatus === KCAL_STATUS.PENDING);
  const meals = { 朝: 0, 昼: 0, 夜: 0, その他: 0 };
  logs.forEach(log => {
    const meal = sanitizeMealType_(log.meal);
    meals[meal] = (meals[meal] || 0) + Number(log.kcal || 0);
  });

  return {
    totalExact: exactLogs.reduce((sum, log) => sum + Number(log.kcal || 0), 0),
    totalEstimated: estimatedLogs.reduce((sum, log) => sum + Number(log.kcal || 0), 0),
    hasPending: pendingLogs.length > 0,
    pendingItems: pendingLogs.map(log => ({
      logId: String(log.logId || ''),
      row: Number(log.row || 0),
      meal: String(log.meal || ''),
      menu: String(log.menu || ''),
      mealDate: toIsoDateTime_(log.mealDate),
    })),
    meals: meals,
    nutrition: summarizeNutrition(logs),
  };
}

function getTodaySummary(userId) {
  return getSummaryByDate(userId, new Date());
}

function getYesterdaySummary(userId) {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getSummaryByDate(userId, date);
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

function getPendingMealLogsByUser(userId) {
  return getMealLogsByUser(userId)
    .filter(log => log.kcalStatus === KCAL_STATUS.PENDING)
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt || left.createdAt || left.mealDate || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt || right.mealDate || 0).getTime();
      return rightTime - leftTime;
    });
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

function getHeaderState(userId) {
  const user = ensureUserExists_(userId);
  const today = getTodaySummary(userId);
  const totalIntake = Number(today.totalExact || 0) + Number(today.totalEstimated || 0);
  return {
    user: user,
    todayExact: Number(today.totalExact || 0),
    pendingCount: (today.pendingItems || []).length,
    targetDiff: user.calorieTarget == null ? null : user.calorieTarget - totalIntake,
    permission: serializeUserPermission_(user),
  };
}

function parseTargetKcal(text) {
  const match = String(text || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getDashboardData(userId) {
  const user = ensureUserExists_(userId);
  const today = getTodaySummary(userId);
  const todayLogs = getMealLogsByUserAndDate(userId, new Date())
    .sort(compareMealLogDisplayTimeDesc_);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayLogs = getMealLogsByUserAndDate(userId, yesterdayDate)
    .sort(compareMealLogDisplayTimeDesc_);
  const totalIntake = today.totalExact + today.totalEstimated;

  return {
    user: user,
    today: today,
    recentLogs: todayLogs.map(log => serializeMealLog_(log)),
    logEntries: {
      today: todayLogs.map(log => serializeMealLog_(log)),
      yesterday: yesterdayLogs.map(log => serializeMealLog_(log)),
    },
    weekly: getWeeklyChartData_(userId, 7),
    popularMenus: getPopularMenusByUser_(userId, 5),
    streak: getUserStreakSummary_(userId),
    streakRanking: getStreakRanking_(10),
    targetDiff: user.calorieTarget == null ? null : user.calorieTarget - totalIntake,
    detailUrl: buildLiffUrl_({ mode: 'input' }),
  };
}

function compareMealLogDisplayTimeDesc_(left, right) {
  const leftTime = new Date(left && (left.updatedAt || left.createdAt || left.mealDate) || 0).getTime();
  const rightTime = new Date(right && (right.updatedAt || right.createdAt || right.mealDate) || 0).getTime();
  return rightTime - leftTime;
}

function isAdminCommand_(text) {
  return /^(承認一覧|承認\s+\S+|拒否\s+\S+|停止\s+\S+)/.test(String(text || '').trim());
}

function handleAdminCommand(userId, text) {
  if (!isAdminUser_(userId)) {
    return null;
  }

  const input = String(text || '').trim();
  if (input === '承認一覧') {
    const pendingUsers = listUsersByStatus('pending');
    if (!pendingUsers.length) {
      return {
        kind: 'admin_text',
        text: '承認待ちユーザーはいません。',
      };
    }

    return {
      kind: 'admin_text',
      text: [
        '承認待ちユーザー一覧',
        ...pendingUsers.map(user => `${user.displayName || '未設定'} / ${user.userId}`),
      ].join('\n'),
    };
  }

  const approveMatch = input.match(/^承認\s+(\S+)$/);
  if (approveMatch) {
    const targetUserId = approveMatch[1];
    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      return { kind: 'admin_text', text: '対象ユーザーが見つかりません。' };
    }

    updateUserStatus(targetUserId, 'active');
    try {
      pushLineMessages_(targetUserId, [{
        type: 'text',
        text: '利用が承認されました。食事の記録を始められます。',
      }]);
    } catch (error) {
      // best-effort notification
    }
    return {
      kind: 'admin_text',
      text: `${targetUser.displayName || targetUserId} を承認しました。`,
    };
  }

  const rejectMatch = input.match(/^(拒否|停止)\s+(\S+)$/);
  if (rejectMatch) {
    const targetUserId = rejectMatch[2];
    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      return { kind: 'admin_text', text: '対象ユーザーが見つかりません。' };
    }

    updateUserStatus(targetUserId, 'inactive');
    try {
      pushLineMessages_(targetUserId, [{
        type: 'text',
        text: '現在このアカウントは利用停止中です。必要であれば管理者へ連絡してください。',
      }]);
    } catch (error) {
      // best-effort notification
    }
    return {
      kind: 'admin_text',
      text: `${targetUser.displayName || targetUserId} を停止しました。`,
    };
  }

  return null;
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
    const master = log.masterKey ? getNutritionMaster(log.masterKey) : null;
    if (!grouped[key]) {
      grouped[key] = {
        groupKey: key,
        menu: log.menu,
        displayName: buildMealLogDisplayName_(log),
        masterKey: String(log.masterKey || ''),
        flavor: String((master && master.flavor) || log.flavor || ''),
        unit: String((master && master.unit) || log.unit || ''),
        note: String((master && master.note) || log.note || ''),
        kcal: toNullableNumber_((master && master.kcal) != null ? master.kcal : log.kcal),
        protein: toNullableNumber_((master && master.protein) != null ? master.protein : log.protein),
        fat: toNullableNumber_((master && master.fat) != null ? master.fat : log.fat),
        carb: toNullableNumber_((master && master.carb) != null ? master.carb : log.carb),
        salt: toNullableNumber_((master && master.salt) != null ? master.salt : log.salt),
        fiber: toNullableNumber_((master && master.fiber) != null ? master.fiber : log.fiber),
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
      groupKey: item.groupKey,
      menu: item.menu,
      displayName: item.displayName,
      masterKey: item.masterKey,
      flavor: item.flavor,
      unit: item.unit,
      note: item.note,
      kcal: item.kcal,
      protein: item.protein,
      fat: item.fat,
      carb: item.carb,
      salt: item.salt,
      fiber: item.fiber,
      count: item.count,
      averageKcal: item.count ? Math.round((item.totalKcal / item.count) * 10) / 10 : 0,
      lastMealDate: toIsoDateTime_(item.lastMealDate),
    }));
}

function findPopularMenuByGroupKey_(userId, groupKey) {
  const normalizedKey = String(groupKey || '').trim();
  if (!normalizedKey) return null;
  return getPopularMenusByUser_(userId, 20).find(item => String(item.groupKey || '') === normalizedKey) || null;
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
      pictureUrl: String(user.pictureUrl || ''),
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
  return normalizeText_(buildMealLogDisplayName_(log));
}

function buildMealLogDisplayName_(log) {
  const master = log && log.masterKey ? getNutritionMaster(log.masterKey) : null;
  if (master) {
    return buildNutritionDisplayName_(master);
  }
  return String(log && log.menu || '').trim();
}

function handleMealMessageFlow(userId, text, displayName, source, pictureUrl) {
  ensureProjectSetup_();
  const inputText = String(text || '').trim();
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!inputText) {
    throw new Error('text is required');
  }

  const user = ensureUserExists_(userId, displayName, pictureUrl);

  const adminResult = handleAdminCommand(userId, inputText);
  if (adminResult) {
    return adminResult;
  }

  if (user.status !== 'active' && !isAdminUser_(userId)) {
    return {
      kind: 'permission_pending',
      text: user.status === 'pending'
        ? '現在は管理者の許可待ちです。承認されると記録を始められます。'
        : '現在このアカウントは利用停止中です。',
      dashboard: getDashboardData(userId),
      permission: serializeUserPermission_(user),
    };
  }

  if (isSetTargetCommand(inputText)) {
    return {
      kind: 'target_updated',
      text: handleSetTargetCommand(userId, inputText),
      dashboard: getDashboardData(userId),
    };
  }

  const pendingKcalContext = parsePendingKcalInputContext_(inputText);
  if (pendingKcalContext) {
    return handleStandaloneKcalInput_(userId, pendingKcalContext, source);
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

  const pendingRecord = logMealWithNutrition(userId, parsed, emptyNutrition_(), {
    source: source || SOURCE.TEXT,
    mealDate: parsed.mealDate,
    kcalStatus: KCAL_STATUS.PENDING,
  });

  return {
    kind: 'needs_liff',
    parsed: Object.assign({}, parsed, {
      logId: String(pendingRecord.logId || ''),
      row: Number(pendingRecord.row || 0),
    }),
    record: pendingRecord,
    draft: buildNutritionDraft(parsed.menu),
    dashboard: getDashboardData(userId),
  };
}

function handleStandaloneKcalInput_(userId, input, source) {
  const context = typeof input === 'object' && input
    ? input
    : { kcal: input, datePreset: 'today', meal: '' };
  const kcal = toNullableNumber_(context.kcal);
  if (kcal == null) {
    return {
      kind: 'plain_text',
      text: 'カロリーの数字を読み取れませんでした。',
      dashboard: getDashboardData(userId),
    };
  }

  const pendingLogs = getPendingMealLogsByUser(userId);
  if (!pendingLogs.length) {
    return {
      kind: 'plain_text',
      text: '未記入の記録がないため、数字だけでは登録できません。メニュー名と一緒に送ってください。',
      dashboard: getDashboardData(userId),
    };
  }

  const scopedLogs = pendingLogs.filter(log => {
    if (context.meal && sanitizeMealType_(log.meal) !== context.meal) {
      return false;
    }
    if (context.datePreset === 'yesterday') {
      return isSameDay(log.mealDate, new Date(resolveMealDateByPreset_('yesterday')));
    }
    return isSameDay(log.mealDate, new Date(resolveMealDateByPreset_('today')));
  });

  if ((context.meal || context.datePreset) && !scopedLogs.length) {
    const scopeLabel = [context.datePreset === 'yesterday' ? '昨日' : '', context.meal || '']
      .filter(Boolean)
      .join(' ');
    return {
      kind: 'plain_text',
      text: `${scopeLabel || '指定条件'} の未記入が見つかりません。`,
      dashboard: getDashboardData(userId),
    };
  }

  const targetLogs = scopedLogs.length ? scopedLogs : pendingLogs;

  if (targetLogs.length === 1) {
    const result = applyPendingKcalInput(userId, {
      logId: targetLogs[0].logId,
      row: targetLogs[0].row,
      kcal: kcal,
    }, source || SOURCE.LINE);
    return {
      kind: 'logged',
      record: result.record,
      dashboard: result.dashboard,
      parsed: {
        meal: result.record.meal,
        menu: result.record.menu,
      },
    };
  }

  return {
    kind: 'pending_kcal_selection',
    kcal: kcal,
    pendingLogs: targetLogs.slice(0, 10),
    dashboard: getDashboardData(userId),
  };
}

function submitMealDetail(userId, payload, source) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload.displayName);
  ensureUserCanUseService_(user);

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

  const shouldSaveMaster = payload.saveToMaster == null ? true : toBoolean_(payload.saveToMaster);
  const existingMaster = payload.masterKey ? getNutritionMaster(payload.masterKey) : null;
  const shouldReuseMasterKey = existingMaster && isSameNutritionKey_(
    existingMaster,
    parsed.menu,
    payload.flavor,
    payload.unit
  );

  const savedMaster = shouldSaveMaster
    ? saveNutritionMaster({
        masterKey: shouldReuseMasterKey ? payload.masterKey : '',
        name: parsed.menu,
        flavor: payload.flavor,
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
      })
    : null;

  const record = savedMaster
    ? logMealFromMaster(userId, parsed, savedMaster, {
        source: source || SOURCE.LIFF,
        mealDate: payload.mealDate,
      })
    : logMealWithNutrition(userId, parsed, {
        kcal: payload.kcal,
        protein: payload.protein,
        fat: payload.fat,
        carb: payload.carb,
        salt: payload.salt,
        fiber: payload.fiber,
      }, {
        source: source || SOURCE.LIFF,
        mealDate: payload.mealDate,
        kcalStatus: KCAL_STATUS.EXACT,
        masterKey: '',
        flavor: payload.flavor,
        unit: payload.unit,
        note: payload.note,
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
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

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

  const logId = String(payload && payload.logId || '').trim();
  const row = Number(payload && payload.row || 0);
  let record;
  if (logId || (Number.isFinite(row) && row >= 2)) {
    const currentLog = resolveMealLogReference_(logId || row);
    if (!currentLog || currentLog.userId !== userId) {
      throw new Error('candidate target log is not available');
    }
    record = Object.assign({}, currentLog, {
      mealDate: payload && payload.mealDate ? new Date(payload.mealDate) : currentLog.mealDate,
      meal: sanitizeMealType_(payload && payload.meal),
      menu: String(master.name || payload && payload.menu || '').trim(),
      kcal: toNullableNumber_(master.kcal),
      protein: toNullableNumber_(master.protein),
      fat: toNullableNumber_(master.fat),
      carb: toNullableNumber_(master.carb),
      salt: toNullableNumber_(master.salt),
      fiber: toNullableNumber_(master.fiber),
      kcalStatus: KCAL_STATUS.EXACT,
      masterKey: master.masterKey,
      flavor: String(master.flavor || ''),
      unit: String(master.unit || ''),
      note: String(master.note || ''),
      source: source || SOURCE.LINE,
      updatedAt: new Date(),
    });
    updateMealLog(record);
  } else {
    record = logMealFromMaster(userId, parsed, master, {
      source: source || SOURCE.LINE,
      mealDate: payload && payload.mealDate,
    });
  }

  return {
    parsed: parsed,
    record: record,
    dashboard: getDashboardData(userId),
  };
}

function applyPendingKcalInput(userId, payload, source) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const logId = String(payload && payload.logId || '').trim();
  const row = Number(payload && payload.row || 0);
  const currentLog = resolveMealLogReference_(logId || row);
  if (!currentLog || currentLog.userId !== userId) {
    throw new Error('未記入の記録が見つかりません。');
  }

  const kcal = toNullableNumber_(payload && payload.kcal);
  if (kcal == null) {
    throw new Error('kcal is required');
  }

  const updatedLog = Object.assign({}, currentLog, {
    kcal: kcal,
    kcalStatus: KCAL_STATUS.EXACT,
    source: source || SOURCE.LINE,
    updatedAt: new Date(),
  });
  updateMealLog(updatedLog);

  return {
    record: updatedLog,
    dashboard: getDashboardData(userId),
  };
}

function savePendingLogAsMaster(userId, payload, source) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const logId = String(payload && payload.logId || '').trim();
  const row = Number(payload && payload.row || 0);
  const currentLog = resolveMealLogReference_(logId || row);
  if (!currentLog || currentLog.userId !== userId) {
    throw new Error('対象の記録が見つかりません。');
  }
  if (toNullableNumber_(currentLog.kcal) == null) {
    throw new Error('カロリーが未入力のため、マスタに保存できません。');
  }

  const savedMaster = saveNutritionMaster({
    masterKey: currentLog.masterKey || '',
    name: currentLog.menu,
    flavor: currentLog.flavor,
    kcal: currentLog.kcal,
    protein: currentLog.protein,
    fat: currentLog.fat,
    carb: currentLog.carb,
    salt: currentLog.salt,
    fiber: currentLog.fiber,
    unit: currentLog.unit,
    note: currentLog.note,
    status: 'active',
    source: source || SOURCE.LINE,
  });

  const updatedLog = Object.assign({}, currentLog, {
    masterKey: savedMaster.masterKey,
    flavor: String(savedMaster.flavor || ''),
    unit: String(savedMaster.unit || ''),
    note: String(savedMaster.note || ''),
    updatedAt: new Date(),
  });
  updateMealLog(updatedLog);

  return {
    record: updatedLog,
    savedMaster: savedMaster,
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
      flavor: '',
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

function searchNutritionMasterRecords(query, limit) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  return findNutritionCandidates(keyword, limit || 12).map(serializeNutritionCandidate_);
}

function saveNutritionMasterOnly(userId, payload, source) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const menu = String(payload && payload.menu || '').trim();
  if (!menu) {
    throw new Error('menu is required');
  }
  if (toNullableNumber_(payload && payload.kcal) == null) {
    throw new Error('kcal is required');
  }

  const savedMaster = saveNutritionMaster({
    masterKey: payload && payload.masterKey,
    name: menu,
    flavor: payload && payload.flavor,
    kcal: payload && payload.kcal,
    protein: payload && payload.protein,
    fat: payload && payload.fat,
    carb: payload && payload.carb,
    salt: payload && payload.salt,
    fiber: payload && payload.fiber,
    unit: payload && payload.unit,
    note: payload && payload.note,
    status: 'active',
    source: source || SOURCE.LIFF,
  });

  return {
    savedMaster: savedMaster,
    dashboard: getDashboardData(userId),
    draft: getMealDraftState({
      meal: payload && payload.meal,
      menu: savedMaster.name,
      mealDate: payload && payload.mealDate,
      datePreset: payload && payload.datePreset,
    }),
  };
}

function updateMealLogDetail(userId, payload, source) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const logId = String(payload && payload.logId || '').trim();
  const row = Number(payload && payload.row || 0);
  const currentLog = resolveMealLogReference_(logId || row);
  if (!currentLog || currentLog.userId !== userId) {
    throw new Error('編集対象のログが見つかりません。');
  }

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

  const shouldSaveMaster = payload.saveToMaster == null ? true : toBoolean_(payload.saveToMaster);
  const existingMaster = payload.masterKey ? getNutritionMaster(payload.masterKey) : null;
  const shouldReuseMasterKey = existingMaster && isSameNutritionKey_(
    existingMaster,
    parsed.menu,
    payload.flavor,
    payload.unit
  );

  const savedMaster = shouldSaveMaster
    ? saveNutritionMaster({
        masterKey: shouldReuseMasterKey ? payload.masterKey : '',
        name: parsed.menu,
        flavor: payload.flavor,
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
      })
    : null;

  const updatedLog = Object.assign({}, currentLog, {
    mealDate: payload.mealDate ? new Date(payload.mealDate) : currentLog.mealDate,
    meal: sanitizeMealType_(parsed.meal),
    menu: parsed.menu,
    kcal: toNullableNumber_(savedMaster ? savedMaster.kcal : payload.kcal),
    protein: toNullableNumber_(savedMaster ? savedMaster.protein : payload.protein),
    fat: toNullableNumber_(savedMaster ? savedMaster.fat : payload.fat),
    carb: toNullableNumber_(savedMaster ? savedMaster.carb : payload.carb),
    salt: toNullableNumber_(savedMaster ? savedMaster.salt : payload.salt),
    fiber: toNullableNumber_(savedMaster ? savedMaster.fiber : payload.fiber),
    kcalStatus: savedMaster ? (hasAnyNutritionValue_(savedMaster) ? KCAL_STATUS.EXACT : KCAL_STATUS.PENDING) : KCAL_STATUS.EXACT,
    masterKey: savedMaster ? savedMaster.masterKey : '',
    flavor: String(savedMaster ? savedMaster.flavor : (payload.flavor || '')),
    unit: String(savedMaster ? savedMaster.unit : (payload.unit || '')),
    note: String(savedMaster ? savedMaster.note : (payload.note || '')),
    source: source || SOURCE.LIFF,
    updatedAt: new Date(),
  });
  updateMealLog(updatedLog);

  return {
    record: updatedLog,
    savedMaster: savedMaster,
    dashboard: getDashboardData(userId),
    draft: buildNutritionDraft(parsed.menu),
  };
}

function deleteMealLogDetail(userId, ref) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId);
  ensureUserCanUseService_(user);

  const currentLog = resolveMealLogReference_(ref);
  if (!currentLog || currentLog.userId !== userId) {
    throw new Error('削除対象のログが見つかりません。');
  }

  deleteMealLog(currentLog.logId || currentLog.row);
  return {
    ok: true,
    dashboard: getDashboardData(userId),
  };
}

function buildFirstPostComment(userId) {
  const yesterday = getYesterdaySummary(userId);
  const yesterdayTotal = Number(yesterday.totalExact || 0) + Number(yesterday.totalEstimated || 0);
  if (yesterdayTotal > 0) {
    const user = getUserById(userId);
    const target = Number(user && user.calorieTarget || 0);
    const percent = target > 0 ? Math.round((yesterdayTotal / target) * 100) : null;
    const diff = target > 0 ? target - yesterdayTotal : null;
    const diffText = diff == null
      ? ''
      : diff >= 0
        ? ` 目標まで ${Math.round(diff)} kcal でした。`
        : ` 目標を ${Math.round(Math.abs(diff))} kcal オーバーでした。`;
    return `昨日は合計 ${Math.round(yesterdayTotal)} kcal 記録。${percent != null ? `目標比 ${percent}%。` : ''}${diffText}`.trim();
  }
  return '今日も1件ずつ記録していきましょう。';
}

function attachMealImageToNearestLog(userId, payload) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const messageId = String(payload && payload.messageId || '').trim();
  if (!messageId) {
    throw new Error('messageId is required');
  }

  const eventDate = payload && payload.timestamp ? new Date(Number(payload.timestamp)) : new Date();
  const mealType = inferMealType_(eventDate);
  const imageBlob = fetchLineMessageContentBlob_(messageId);
  const fileInfo = saveLineImageToDrive_(
    imageBlob,
    buildMealImageFileName_(userId, eventDate, messageId, imageBlob.getContentType())
  );

  const sameDayLogs = getMealLogsByUserAndDate(userId, eventDate)
    .filter(log => sanitizeMealType_(log.meal) === mealType)
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || right.mealDate) - new Date(left.updatedAt || left.createdAt || left.mealDate));

  if (sameDayLogs.length > 1) {
    const selectionToken = cachePendingImageAttachment_({
      userId: userId,
      mealType: mealType,
      fileId: fileInfo.fileId,
      imageUrl: fileInfo.url,
      candidateLogIds: sameDayLogs.map(log => String(log.logId || '')),
      candidateRows: sameDayLogs.map(log => Number(log.row || 0)),
    });
    return {
      file: fileInfo,
      mealType: mealType,
      selectionToken: selectionToken,
      candidateLogs: sameDayLogs.map(serializeMealLog_),
      linkedLog: null,
      dashboard: getDashboardData(userId),
    };
  }

  const linkedLog = sameDayLogs[0]
    ? attachMealLogImage(sameDayLogs[0].logId || sameDayLogs[0].row, fileInfo.fileId, fileInfo.url)
    : null;

  return {
    file: fileInfo,
    mealType: mealType,
    linkedLog: linkedLog,
    dashboard: getDashboardData(userId),
  };
}

function attachMealImageBySelection(userId, payload) {
  ensureProjectSetup_();
  const user = ensureUserExists_(userId, payload && payload.displayName);
  ensureUserCanUseService_(user);

  const token = String(payload && payload.selectionToken || '').trim();
  const logId = String(payload && payload.logId || '').trim();
  const row = Number(payload && payload.row || 0);
  if (!token || (!logId && row < 2)) {
    throw new Error('image selection is invalid');
  }

  const pending = takePendingImageAttachment_(token);
  if (!pending || String(pending.userId || '') !== userId) {
    throw new Error('image selection is expired');
  }

  const candidateLogIds = Array.isArray(pending.candidateLogIds) ? pending.candidateLogIds.map(String) : [];
  const candidateRows = Array.isArray(pending.candidateRows) ? pending.candidateRows.map(Number) : [];
  if (logId ? !candidateLogIds.includes(logId) : !candidateRows.includes(row)) {
    throw new Error('selected log is not available');
  }

  const targetLog = resolveMealLogReference_(logId || row);
  if (!targetLog || targetLog.userId !== userId) {
    throw new Error('selected log is not found');
  }

  const linkedLog = attachMealLogImage(targetLog.logId || row, pending.fileId, pending.imageUrl);
  return {
    mealType: String(pending.mealType || ''),
    linkedLog: linkedLog,
    dashboard: getDashboardData(userId),
  };
}

function buildMealImageFileName_(userId, date, messageId, contentType) {
  const extension = guessImageExtension_(contentType);
  const timestamp = Utilities.formatDate(date, APP_TIMEZONE, 'yyyyMMdd-HHmmss');
  return `meal-image-${timestamp}-${String(userId || '').slice(-6)}-${String(messageId || '').slice(-8)}.${extension}`;
}

function guessImageExtension_(contentType) {
  const mime = String(contentType || '').toLowerCase();
  if (mime.indexOf('png') !== -1) return 'png';
  if (mime.indexOf('gif') !== -1) return 'gif';
  if (mime.indexOf('webp') !== -1) return 'webp';
  return 'jpg';
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
    flavor: String(prefill && prefill.flavor || ''),
    unit: String(prefill && prefill.unit || ''),
    note: String(prefill && prefill.note || ''),
    nutrition: Object.assign({}, emptyNutrition_(), prefill && prefill.nutrition),
  };
}

function serializeNutritionCandidate_(candidate) {
  const menu = String(candidate.menu || candidate.baseName || candidate.rawName || candidate.name || '');
  const flavor = String(candidate.flavor || '');
  const unit = String(candidate.unit || '');
  return {
    masterKey: candidate.masterKey,
    menu: menu,
    name: String(candidate.displayName || buildNutritionDisplayName_({ name: menu, flavor: flavor, unit: unit })),
    kcal: candidate.kcal,
    protein: candidate.protein,
    fat: candidate.fat,
    carb: candidate.carb,
    salt: candidate.salt,
    fiber: candidate.fiber,
    flavor: flavor,
    unit: unit,
    note: candidate.note,
    status: candidate.status,
    score: candidate.score,
    scorePercent: candidate.scorePercent,
  };
}

function serializeMealLog_(log) {
  const master = log.masterKey ? getNutritionMaster(log.masterKey) : null;
  return {
    logId: String(log.logId || ''),
    row: Number(log.row || 0),
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
    flavor: String(log.flavor || (master ? master.flavor : '') || ''),
    unit: String(log.unit || (master ? master.unit : '') || ''),
    note: String(log.note || (master ? master.note : '') || ''),
    source: log.source,
    imageFileId: String(log.imageFileId || ''),
    imageUrl: String(log.imageUrl || ''),
    createdAt: toIsoDateTime_(log.createdAt),
    updatedAt: toIsoDateTime_(log.updatedAt),
  };
}
