/**
 * Project setup and trigger helpers.
 */

function setupProject(spreadsheetId) {
  if (spreadsheetId != null) {
    setSpreadsheetId(spreadsheetId);
  }

  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, SHEET.USERS, USER_COLUMNS);
  ensureSheet_(spreadsheet, SHEET.MEAL_LOGS, MEAL_LOG_COLUMNS);
  ensureSheet_(spreadsheet, SHEET.NUTRITION_MASTER, NUTRITION_MASTER_COLUMNS);
}

function setupLineProject(config) {
  const input = config || {};
  setupProject(input.spreadsheetId);
  configureLiff(
    input.liffId,
    input.channelId,
    input.channelAccessToken,
    input.webAppUrl
  );
  if (input.adminUserIds != null) {
    setAdminUserIds(input.adminUserIds);
  }
  if (input.autoApproveUserIds != null) {
    setAutoApproveUserIds(input.autoApproveUserIds);
  }
  if (input.driveFolderId != null) {
    setDriveFolderId(input.driveFolderId);
  }
  if (input.installReminderTrigger === true) {
    installDailyReminderTrigger();
  }
}

function ensureProjectSetup_() {
  setupProject();
}

function onEdit(e) {
  const sheet = e && e.range ? e.range.getSheet() : null;
  if (!sheet || sheet.getName() !== SHEET.NUTRITION_MASTER) return;

  refreshNutritionMasterCache_();
  reapplyNutritionMaster();
}

function send20hReminderNotifications() {
  ensureProjectSetup_();
  const todayKey = buildScriptDateKey_(new Date());
  listUsers()
    .filter(user => user.notify === true)
    .filter(user => serializeUserPermission_(user).canUse)
    .forEach(user => {
      const todayLogs = getMealLogsByUserAndDate(user.userId, new Date());
      if (todayLogs.length > 0) {
        resetReminderNotificationStreak_(user.userId);
        return;
      }

      const message = {
        type: 'text',
        text: '20時になりました。まだ今日の記録がなければ、食べたものを入力しておきましょう。',
      };
      try {
        pushLineMessages_(user.userId, [message]);
        const streakState = markReminderNotificationSent_(user.userId, todayKey);
        if (streakState.shouldNotifyAdmin) {
          notifyAdminsOfReminderStreak_(user, streakState.consecutiveReminderDays);
        }
      } catch (error) {
        // Reminder push is best-effort only.
      }
    });
}

function installDailyReminderTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'send20hReminderNotifications'
  );
  if (exists) {
    return 'send20hReminderNotifications trigger already exists';
  }

  ScriptApp.newTrigger('send20hReminderNotifications')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();
  return 'send20hReminderNotifications trigger created';
}

function ensureSheet_(spreadsheet, name, columns) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const header = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
  const sameHeader = columns.every((column, index) => header[index] === column);

  if (!sameHeader) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }

  if (sheet.getFrozenRows() !== 1) {
    sheet.setFrozenRows(1);
  }
}

function resetReminderNotificationStreak_(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return;
  const streaks = getReminderStreaks_();
  if (!Object.prototype.hasOwnProperty.call(streaks, normalizedUserId)) return;
  delete streaks[normalizedUserId];
  setReminderStreaks_(streaks);
}

function markReminderNotificationSent_(userId, dateKey) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedDateKey = String(dateKey || '').trim() || buildScriptDateKey_(new Date());
  const streaks = getReminderStreaks_();
  const current = streaks[normalizedUserId] || {};

  if (current.lastReminderDate === normalizedDateKey) {
    return {
      consecutiveReminderDays: Number(current.consecutiveReminderDays || 0),
      shouldNotifyAdmin: false,
    };
  }

  const consecutiveReminderDays = current.lastReminderDate === getPreviousDateKey_(normalizedDateKey)
    ? Number(current.consecutiveReminderDays || 0) + 1
    : 1;

  const shouldNotifyAdmin = consecutiveReminderDays >= 7 && current.lastAdminAlertDate !== normalizedDateKey;
  streaks[normalizedUserId] = {
    lastReminderDate: normalizedDateKey,
    consecutiveReminderDays: consecutiveReminderDays,
    lastAdminAlertDate: shouldNotifyAdmin ? normalizedDateKey : String(current.lastAdminAlertDate || ''),
  };
  setReminderStreaks_(streaks);

  return {
    consecutiveReminderDays: consecutiveReminderDays,
    shouldNotifyAdmin: shouldNotifyAdmin,
  };
}

function notifyAdminsOfReminderStreak_(user, consecutiveDays) {
  const adminIds = getAdminUserIds_().filter(adminUserId => adminUserId !== String(user && user.userId || ''));
  if (!adminIds.length || !getLineChannelAccessToken_()) return;

  const displayName = String(user && user.displayName || '').trim() || '未設定';
  const days = Number(consecutiveDays || 0);
  const message = {
    type: 'text',
    text: [
      '20時リマインドの連続送信を検知しました。',
      `表示名: ${displayName}`,
      `userId: ${String(user && user.userId || '')}`,
      `${days}日連続で今日の記録がないため、通知対象になっています。`,
    ].join('\n'),
  };

  adminIds.forEach(adminUserId => {
    try {
      pushLineMessages_(adminUserId, [message]);
    } catch (error) {
      // Admin notifications are best-effort only.
    }
  });
}
