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

function listUsersByStatus(status) {
  const targetStatus = String(status || '').trim();
  return listUsers().filter(user => String(user.status || '') === targetStatus);
}

function ensureUserExists_(userId, displayName, pictureUrl) {
  const existing = getUserById(userId);
  if (existing) {
    if (
      (displayName && existing.displayName !== displayName) ||
      (pictureUrl != null && existing.pictureUrl !== String(pictureUrl || ''))
    ) {
      updateUserProfile(userId, {
        displayName: displayName,
        pictureUrl: pictureUrl,
      });
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
    pictureUrl: String(pictureUrl || ''),
    calorieTarget: 2000,
    goalType: GOAL_TYPE.KEEP,
    notify: true,
    status: resolveNewUserStatus_(userId),
    createdAt: now,
    updatedAt: now,
  };

  sheet.appendRow(USER_COLUMNS.map(key => user[key] ?? null));
  if (user.status === 'pending') {
    notifyAdminsOfPendingUser_(user);
  }
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

  if (Object.prototype.hasOwnProperty.call(patch, 'pictureUrl')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.pictureUrl).setValue(String(patch.pictureUrl || ''));
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

  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    sheet.getRange(rowIndex + 1, USER_COL_INDEX.status).setValue(String(patch.status || 'active'));
  }

  sheet.getRange(rowIndex + 1, USER_COL_INDEX.updatedAt).setValue(new Date());
  return true;
}

function updateUserStatus(userId, status) {
  return updateUserProfile(userId, { status: status });
}

function isAdminUser_(userId) {
  return Boolean(userId) && getAdminUserIds_().includes(String(userId || '').trim());
}

function isAutoApprovedUser_(userId) {
  return Boolean(userId) && getAutoApproveUserIds_().includes(String(userId || '').trim());
}

function isPermissionControlEnabled_() {
  return getAdminUserIds_().length > 0 || getAutoApproveUserIds_().length > 0;
}

function resolveNewUserStatus_(userId) {
  if (!isPermissionControlEnabled_()) {
    return 'active';
  }
  return isAdminUser_(userId) || isAutoApprovedUser_(userId) ? 'active' : 'pending';
}

function ensureUserCanUseService_(user) {
  if (!user) {
    throw new Error('user not found');
  }
  if (user.status === 'active' || isAdminUser_(user.userId)) {
    return user;
  }
  if (user.status === 'pending') {
    throw new Error('管理者の許可待ちです。');
  }
  throw new Error('利用が停止されています。');
}

function serializeUserPermission_(user) {
  const safeUser = user || {};
  return {
    status: String(safeUser.status || 'active'),
    canUse: String(safeUser.status || 'active') === 'active' || isAdminUser_(safeUser.userId),
    isAdmin: isAdminUser_(safeUser.userId),
    notify: safeUser.notify === true,
  };
}

function notifyAdminsOfPendingUser_(user) {
  const adminIds = getAdminUserIds_().filter(adminUserId => adminUserId !== user.userId);
  if (!adminIds.length || !getLineChannelAccessToken_()) return;

  const displayName = String(user.displayName || '').trim() || '未設定';
  const message = [
    '新しい利用申請があります。',
    `表示名: ${displayName}`,
    `userId: ${user.userId}`,
    `承認コマンド: 承認 [userId]`,
    `拒否コマンド: 拒否 [userId]`,
  ].join('\n');
  const quickReplyMessage = {
    type: 'text',
    text: message,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: trimAdminQuickReplyLabel_(`承認 ${displayName}`),
            text: `承認 ${user.userId}`,
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: trimAdminQuickReplyLabel_(`拒否 ${displayName}`),
            text: `拒否 ${user.userId}`,
          },
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '承認一覧',
            text: '承認一覧',
          },
        },
      ],
    },
  };

  adminIds.forEach(adminUserId => {
    try {
      pushLineMessages_(adminUserId, [quickReplyMessage]);
    } catch (error) {
      // Admin notifications are best-effort only.
    }
  });
}

function trimAdminQuickReplyLabel_(value) {
  const text = String(value || '').trim();
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
}

function mapUserRow_(row) {
  const currentMapped = {
    userId: String(row[USER_COL_INDEX.userId - 1] || ''),
    displayName: String(row[USER_COL_INDEX.displayName - 1] || ''),
    pictureUrl: String(row[USER_COL_INDEX.pictureUrl - 1] || ''),
    calorieTarget: toNullableNumber_(row[USER_COL_INDEX.calorieTarget - 1]),
    goalType: normalizeGoalType_(row[USER_COL_INDEX.goalType - 1]),
    notify: toBoolean_(row[USER_COL_INDEX.notify - 1]),
    status: normalizeUserStatus_(row[USER_COL_INDEX.status - 1]),
    createdAt: row[USER_COL_INDEX.createdAt - 1] || null,
    updatedAt: row[USER_COL_INDEX.updatedAt - 1] || null,
  };

  const shiftedMapped = {
    userId: String(row[0] || ''),
    displayName: String(row[1] || ''),
    pictureUrl: String(row[2] || ''),
    calorieTarget: toNullableNumber_(row[3]),
    goalType: normalizeGoalType_(row[4]),
    notify: toBoolean_(row[5]),
    status: normalizeUserStatus_(row[6]),
    createdAt: row[7] || null,
    updatedAt: row[8] || null,
  };

  if (isPlausibleLegacyShiftedUserRow_(currentMapped, shiftedMapped)) {
    return shiftedMapped;
  }

  return currentMapped;
}

function isPlausibleLegacyShiftedUserRow_(currentMapped, shiftedMapped) {
  return !isKnownUserStatus_(currentMapped.status) &&
    isKnownUserStatus_(shiftedMapped.status) &&
    currentMapped.calorieTarget == null &&
    shiftedMapped.calorieTarget != null;
}

function normalizeGoalType_(value) {
  const text = String(value || '').trim();
  return Object.values(GOAL_TYPE).includes(text) ? text : GOAL_TYPE.KEEP;
}

function normalizeUserStatus_(value) {
  const text = String(value || '').trim();
  return isKnownUserStatus_(text) ? text : text;
}

function isKnownUserStatus_(value) {
  return ['active', 'inactive', 'pending'].includes(String(value || '').trim());
}
