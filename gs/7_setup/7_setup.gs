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
  listUsers()
    .filter(user => user.notify === true)
    .filter(user => serializeUserPermission_(user).canUse)
    .forEach(user => {
      const todayLogs = getMealLogsByUserAndDate(user.userId, new Date());
      if (todayLogs.length > 0) return;

      const message = {
        type: 'text',
        text: '20時です。まだ今日の記録がなければ、夕食や間食を入力しておきましょう。',
      };
      try {
        pushLineMessages_(user.userId, [message]);
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
