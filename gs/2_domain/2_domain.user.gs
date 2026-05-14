/**
 * User domain functions.
 */

function getUserById(userId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.USERS);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return null;

  const row = values.slice(1).find(record => record[USER_COL_INDEX.userId - 1] === userId);
  if (!row) return null;

  return mapUserRow_(row);
}

function listUsers() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.USERS);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  return values.slice(1).map(mapUserRow_);
}

function ensureUserExists_(userId, displayName) {
  const existing = getUserById(userId);
  if (existing) {
    if (displayName && existing.displayName !== displayName) {
      updateUserProfile(userId, { displayName: displayName });
      return getUserById(userId);
    }
    return existing;
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET.USERS);
  if (!sheet) {
    throw new Error('users sheet not found');
  }

  const now = new Date();
  const user = {
    userId: userId,
    displayName: displayName || '',
    calorieTarget: 2000,
    goalType: GOAL_TYPE.KEEP,
    notify: true,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  sheet.appendRow(USER_COLUMNS.map(key => user[key] ?? null));
  return user;
}

function updateUserCalorieTarget(userId, calorieTarget) {
  return updateUserProfile(userId, { calorieTarget: calorieTarget });
}

function updateUserProfile(userId, patch) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.USERS);
  if (!sheet) return false;

  const values = sheet.getDataRange().getValues();
  const rowIndex = values.findIndex(row => row[USER_COL_INDEX.userId - 1] === userId);
  if (rowIndex < 1) return false;

  if (Object.prototype.hasOwnProperty.call(patch, 'displayName')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.displayName).setValue(patch.displayName || '');
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'calorieTarget')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.calorieTarget)
      .setValue(toNullableNumber_(patch.calorieTarget));
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'goalType')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.goalType)
      .setValue(patch.goalType || GOAL_TYPE.KEEP);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'notify')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.notify).setValue(Boolean(patch.notify));
  }

  sheet.getRange(rowIndex + 1, USER_COL_INDEX.updatedAt).setValue(new Date());
  return true;
}

function mapUserRow_(row) {
  return {
    userId: String(row[USER_COL_INDEX.userId - 1] || ''),
    displayName: String(row[USER_COL_INDEX.displayName - 1] || ''),
    calorieTarget: toNullableNumber_(row[USER_COL_INDEX.calorieTarget - 1]),
    goalType: String(row[USER_COL_INDEX.goalType - 1] || GOAL_TYPE.KEEP),
    notify: row[USER_COL_INDEX.notify - 1] === true,
    status: String(row[USER_COL_INDEX.status - 1] || 'active'),
    createdAt: row[USER_COL_INDEX.createdAt - 1] || null,
    updatedAt: row[USER_COL_INDEX.updatedAt - 1] || null,
  };
}
