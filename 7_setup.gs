/**
 * Project setup and trigger helpers.
 */

function setupProject() {
  const spreadsheet = SpreadsheetApp.getActive();
  ensureSheet_(spreadsheet, SHEET.USERS, USER_COLUMNS);
  ensureSheet_(spreadsheet, SHEET.MEAL_LOGS, MEAL_LOG_COLUMNS);
  ensureSheet_(spreadsheet, SHEET.NUTRITION_MASTER, NUTRITION_MASTER_COLUMNS);
}

function setupLineProject(config) {
  const input = config || {};
  setupProject();
  configureLiff(
    input.liffId,
    input.channelId,
    input.channelAccessToken,
    input.webAppUrl
  );
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
