/**
 * Meal domain functions.
 */

function parseMealText(text) {
  const raw = String(text || '').trim();
  const datePreset = raw.indexOf('昨日') !== -1 ? 'yesterday' : 'today';
  const mealDate = resolveMealDateByPreset_(datePreset);
  const meal = raw.match(/朝|昼|夜|その他/)?.[0] || inferMealType_(new Date(mealDate));
  const menu = raw.replace(/昨日|今日|朝|昼|夜|その他/g, '').trim() || raw;

  return {
    meal: meal,
    menu: menu,
    datePreset: datePreset,
    mealDate: mealDate,
  };
}

function logMealFromMaster(userId, parsed, master, options) {
  if (!master || !hasAnyNutritionValue_(master)) {
    throw new Error('nutrition master is required');
  }

  return appendMealLogRecord_(userId, parsed, {
    kcal: master.kcal,
    protein: master.protein,
    fat: master.fat,
    carb: master.carb,
    salt: master.salt,
    fiber: master.fiber,
    kcalStatus: KCAL_STATUS.EXACT,
    masterKey: master.masterKey,
    flavor: master.flavor,
    unit: master.unit,
    note: master.note,
  }, options);
}

function logMealWithNutrition(userId, parsed, nutrition, options) {
  return appendMealLogRecord_(userId, parsed, {
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carb: nutrition.carb,
    salt: nutrition.salt,
    fiber: nutrition.fiber,
    kcalStatus: options && options.kcalStatus ? options.kcalStatus : KCAL_STATUS.EXACT,
    masterKey: nutrition.masterKey || null,
    flavor: nutrition.flavor || '',
    unit: nutrition.unit || '',
    note: nutrition.note || '',
  }, options);
}

function appendMealLogRecord_(userId, parsed, nutrition, options) {
  const config = options || {};
  const now = new Date();
  const record = {
    mealDate: config.mealDate ? new Date(config.mealDate) : now,
    userId: userId,
    meal: sanitizeMealType_(parsed && parsed.meal),
    menu: String(parsed && parsed.menu || '').trim(),
    kcal: toNullableNumber_(nutrition.kcal),
    protein: toNullableNumber_(nutrition.protein),
    fat: toNullableNumber_(nutrition.fat),
    carb: toNullableNumber_(nutrition.carb),
    salt: toNullableNumber_(nutrition.salt),
    fiber: toNullableNumber_(nutrition.fiber),
    kcalStatus: String(nutrition.kcalStatus || KCAL_STATUS.PENDING),
    masterKey: nutrition.masterKey || null,
    flavor: String(nutrition.flavor || ''),
    unit: String(nutrition.unit || ''),
    note: String(nutrition.note || ''),
    source: config.source || SOURCE.TEXT,
    imageFileId: String(config.imageFileId || ''),
    imageUrl: String(config.imageUrl || ''),
    createdAt: now,
    updatedAt: now,
  };

  record.row = appendMealLog(record);
  return record;
}

function appendMealLog(log) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.MEAL_LOGS);
  if (!sheet) {
    throw new Error('meal_logs sheet not found');
  }

  const row = MEAL_LOG_COLUMNS.map(key => log[key] ?? null);
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function getMealLogByRow(rowNumber) {
  const row = Number(rowNumber || 0);
  if (!Number.isFinite(row) || row < 2) return null;
  return getMealLogs().find(log => log.row === row) || null;
}

function updateMealLog(log) {
  const rowNumber = Number(log && log.row || 0);
  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    throw new Error('meal log row is invalid');
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET.MEAL_LOGS);
  if (!sheet) {
    throw new Error('meal_logs sheet not found');
  }

  const row = MEAL_LOG_COLUMNS.map(key => log[key] ?? null);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function attachMealLogImage(rowNumber, imageFileId, imageUrl) {
  const log = getMealLogByRow(rowNumber);
  if (!log) {
    throw new Error('meal log not found');
  }
  const updated = Object.assign({}, log, {
    imageFileId: String(imageFileId || ''),
    imageUrl: String(imageUrl || ''),
    updatedAt: new Date(),
  });
  updateMealLog(updated);
  return updated;
}

function deleteMealLog(rowNumber) {
  const row = Number(rowNumber || 0);
  if (!Number.isFinite(row) || row < 2) {
    throw new Error('meal log row is invalid');
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET.MEAL_LOGS);
  if (!sheet) {
    throw new Error('meal_logs sheet not found');
  }

  sheet.deleteRow(row);
}

function getMealLogs() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.MEAL_LOGS);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  return values.slice(1).map((row, index) => mapMealLogRow_(row, index + 2));
}

function getRecentMealLogsByUser(userId, limit) {
  return getMealLogs()
    .filter(log => log.userId === userId)
    .sort((left, right) => new Date(right.mealDate) - new Date(left.mealDate))
    .slice(0, limit || 20);
}

function buildMealKcalView(record) {
  if (!record.kcalStatus) return { line: '' };

  if (record.kcalStatus === KCAL_STATUS.PENDING) {
    return { line: 'カロリー未登録' };
  }

  if (record.kcalStatus === KCAL_STATUS.EXACT) {
    return { line: record.kcal != null ? `${record.kcal} kcal` : '' };
  }

  return { line: record.kcal != null ? `約 ${record.kcal} kcal` : '' };
}

function mapMealLogRow_(row, rowNumber) {
  return {
    row: rowNumber,
    mealDate: row[MEAL_LOG_COL_INDEX.mealDate - 1] || null,
    userId: String(row[MEAL_LOG_COL_INDEX.userId - 1] || ''),
    meal: String(row[MEAL_LOG_COL_INDEX.meal - 1] || ''),
    menu: String(row[MEAL_LOG_COL_INDEX.menu - 1] || ''),
    kcal: toNullableNumber_(row[MEAL_LOG_COL_INDEX.kcal - 1]),
    protein: toNullableNumber_(row[MEAL_LOG_COL_INDEX.protein - 1]),
    fat: toNullableNumber_(row[MEAL_LOG_COL_INDEX.fat - 1]),
    carb: toNullableNumber_(row[MEAL_LOG_COL_INDEX.carb - 1]),
    salt: toNullableNumber_(row[MEAL_LOG_COL_INDEX.salt - 1]),
    fiber: toNullableNumber_(row[MEAL_LOG_COL_INDEX.fiber - 1]),
    kcalStatus: String(row[MEAL_LOG_COL_INDEX.kcalStatus - 1] || KCAL_STATUS.PENDING),
    masterKey: String(row[MEAL_LOG_COL_INDEX.masterKey - 1] || ''),
    flavor: String(row[MEAL_LOG_COL_INDEX.flavor - 1] || ''),
    unit: String(row[MEAL_LOG_COL_INDEX.unit - 1] || ''),
    note: String(row[MEAL_LOG_COL_INDEX.note - 1] || ''),
    source: String(row[MEAL_LOG_COL_INDEX.source - 1] || SOURCE.TEXT),
    imageFileId: String(row[MEAL_LOG_COL_INDEX.imageFileId - 1] || ''),
    imageUrl: String(row[MEAL_LOG_COL_INDEX.imageUrl - 1] || ''),
    createdAt: row[MEAL_LOG_COL_INDEX.createdAt - 1] || null,
    updatedAt: row[MEAL_LOG_COL_INDEX.updatedAt - 1] || null,
  };
}

function inferMealType_(date) {
  const hour = Number(Utilities.formatDate(date, APP_TIMEZONE, 'H'));
  if (hour < 11) return '朝';
  if (hour < 17) return '昼';
  return '夜';
}

function resolveMealDateByPreset_(datePreset) {
  const baseDate = new Date();
  if (datePreset === 'yesterday') {
    baseDate.setDate(baseDate.getDate() - 1);
  }
  return formatDateKey_(baseDate);
}
