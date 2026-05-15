/**
 * Shared constants and typedefs.
 */

const APP_TIMEZONE = 'Asia/Tokyo';

const SHEET = {
  USERS: 'users',
  MEAL_LOGS: 'meal_logs',
  NUTRITION_MASTER: 'nutrition_master',
};

const NUTRITION_KEYS = [
  'kcal',
  'protein',
  'fat',
  'carb',
  'salt',
  'fiber',
];

const MEAL_TYPES = ['朝', '昼', '夜', 'その他'];
const DEFAULT_CANDIDATE_LIMIT = 5;

/**
 * @typedef {Object} NutritionMaster
 * @property {string} masterKey
 * @property {string} name
 * @property {number|null} kcal
 * @property {number|null} protein
 * @property {number|null} fat
 * @property {number|null} carb
 * @property {number|null} salt
 * @property {number|null} fiber
 * @property {string} flavor
 * @property {string} unit
 * @property {string} note
 * @property {'active'|'pending'|'disabled'} status
 * @property {string} source
 * @property {Date|null} createdAt
 * @property {Date|null} updatedAt
 */
const NUTRITION_MASTER_COLUMNS = [
  'masterKey',
  'name',
  'kcal',
  'protein',
  'fat',
  'carb',
  'salt',
  'fiber',
  'unit',
  'note',
  'status',
  'source',
  'createdAt',
  'updatedAt',
  'flavor',
];

const NUTRITION_COL_INDEX = NUTRITION_MASTER_COLUMNS.reduce((acc, key, index) => {
  acc[key] = index + 1;
  return acc;
}, {});

/**
 * @typedef {Object} MealLog
 * @property {Date|null} mealDate
 * @property {string} userId
 * @property {string} meal
 * @property {string} menu
 * @property {number|null} kcal
 * @property {number|null} protein
 * @property {number|null} fat
 * @property {number|null} carb
 * @property {number|null} salt
 * @property {number|null} fiber
 * @property {string} kcalStatus
 * @property {string|null} masterKey
 * @property {string} source
 * @property {string=} imageFileId
 * @property {string=} imageUrl
 * @property {Date|null} createdAt
 * @property {Date|null} updatedAt
 * @property {number=} row
 */
const MEAL_LOG_COLUMNS = [
  'mealDate',
  'userId',
  'meal',
  'menu',
  'kcal',
  'protein',
  'fat',
  'carb',
  'salt',
  'fiber',
  'kcalStatus',
  'masterKey',
  'source',
  'imageFileId',
  'imageUrl',
  'createdAt',
  'updatedAt',
];

const MEAL_LOG_COL_INDEX = MEAL_LOG_COLUMNS.reduce((acc, key, index) => {
  acc[key] = index + 1;
  return acc;
}, {});

/**
 * @typedef {Object} User
 * @property {string} userId
 * @property {string} displayName
 * @property {string} pictureUrl
 * @property {number|null} calorieTarget
 * @property {string} goalType
 * @property {boolean} notify
 * @property {'active'|'inactive'} status
 * @property {Date|null} createdAt
 * @property {Date|null} updatedAt
 */
const USER_COLUMNS = [
  'userId',
  'displayName',
  'calorieTarget',
  'goalType',
  'notify',
  'status',
  'createdAt',
  'updatedAt',
  'pictureUrl',
];

const USER_COL_INDEX = USER_COLUMNS.reduce((acc, key, index) => {
  acc[key] = index + 1;
  return acc;
}, {});

const KCAL_STATUS = {
  EXACT: 'exact',
  ESTIMATED: 'estimated',
  PENDING: 'pending',
};

const SOURCE = {
  TEXT: 'text',
  MANUAL: 'manual',
  SYSTEM: 'system',
  LIFF: 'liff',
  LINE: 'line',
};

const GOAL_TYPE = {
  KEEP: 'keep',
  CUT: 'cut',
  BULK: 'bulk',
};

function summarizeNutrition(logs) {
  const total = Object.fromEntries(NUTRITION_KEYS.map(key => [key, 0]));

  logs.forEach(log => {
    NUTRITION_KEYS.forEach(key => {
      total[key] += Number(log[key] || 0);
    });
  });

  return total;
}

function toNullableNumber_(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].indexOf(normalized) !== -1;
}

function toIsoDateTime_(value) {
  if (!value) return '';
  return Utilities.formatDate(new Date(value), APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function formatDateKey_(value) {
  return Utilities.formatDate(new Date(value), APP_TIMEZONE, 'yyyy-MM-dd');
}

function sanitizeMealType_(value) {
  const meal = String(value || '').trim();
  return MEAL_TYPES.indexOf(meal) !== -1 ? meal : inferMealType_(new Date());
}

function hasAnyNutritionValue_(record) {
  return NUTRITION_KEYS.some(key => toNullableNumber_(record && record[key]) != null);
}
