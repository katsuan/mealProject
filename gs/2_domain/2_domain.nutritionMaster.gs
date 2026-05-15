/**
 * Nutrition master domain functions.
 */

function matchNutrition(menu) {
  const exact = findExactNutritionMaster(menu);
  if (exact) {
    return Object.assign({}, emptyNutrition_(), pickNutrition_(exact), {
      status: KCAL_STATUS.EXACT,
      masterKey: exact.masterKey,
    });
  }

  const draft = buildNutritionDraft(menu);
  if (draft.prefill.hasSuggestion) {
    return Object.assign({}, emptyNutrition_(), draft.prefill.nutrition, {
      status: KCAL_STATUS.ESTIMATED,
      masterKey: draft.prefill.masterKey || null,
    });
  }

  return emptyNutrition_();
}

function findExactNutritionMaster(menu) {
  const normalizedMenu = normalizeText_(menu);
  if (!normalizedMenu) return null;

  const exactCandidates = getNutritionMasterCached().filter(master =>
    master.status !== 'disabled' &&
    hasAnyNutritionValue_(master)
  );

  const displayMatches = exactCandidates.filter(master =>
    normalizeText_(buildNutritionDisplayName_(master)) === normalizedMenu
  );
  if (displayMatches.length === 1) {
    return displayMatches[0];
  }

  const baseNameMatches = exactCandidates.filter(master =>
    normalizeText_(master.name) === normalizedMenu
  );
  if (baseNameMatches.length === 1) {
    return baseNameMatches[0];
  }

  return null;
}

function findNutritionCandidates(menu, limit) {
  const normalizedMenu = normalizeText_(menu);
  if (!normalizedMenu) return [];

  return getNutritionMasterCached()
    .filter(master => master.status === 'active')
    .filter(master => hasAnyNutritionValue_(master))
    .map(master => ({
      master: master,
      score: scoreNutritionCandidate_(normalizedMenu, getNutritionMasterSearchTexts_(master)),
    }))
    .filter(candidate => candidate.score >= 0.24)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return normalizeText_(right.master.name).length - normalizeText_(left.master.name).length;
    })
    .slice(0, limit || DEFAULT_CANDIDATE_LIMIT)
    .map(candidate => ({
      masterKey: candidate.master.masterKey,
      menu: String(candidate.master.name || ''),
      name: buildNutritionDisplayName_(candidate.master),
      kcal: toNullableNumber_(candidate.master.kcal),
      protein: toNullableNumber_(candidate.master.protein),
      fat: toNullableNumber_(candidate.master.fat),
      carb: toNullableNumber_(candidate.master.carb),
      salt: toNullableNumber_(candidate.master.salt),
      fiber: toNullableNumber_(candidate.master.fiber),
      flavor: String(candidate.master.flavor || ''),
      unit: String(candidate.master.unit || ''),
      note: String(candidate.master.note || ''),
      status: candidate.master.status,
      score: Number(candidate.score.toFixed(3)),
      scorePercent: Math.round(candidate.score * 100),
    }));
}

function buildNutritionDraft(menu) {
  const candidates = findNutritionCandidates(menu, DEFAULT_CANDIDATE_LIMIT);
  const best = candidates[0] || null;
  const shouldPrefill = best && best.score >= 0.52;

  return {
    menu: String(menu || '').trim(),
    prefill: {
      hasSuggestion: Boolean(shouldPrefill),
      masterKey: shouldPrefill ? best.masterKey : '',
      masterName: shouldPrefill ? best.name : '',
      score: shouldPrefill ? best.score : 0,
      scorePercent: shouldPrefill ? best.scorePercent : 0,
      nutrition: shouldPrefill
        ? pickNutrition_(best)
        : emptyNutrition_(),
      flavor: shouldPrefill ? best.flavor : '',
      unit: shouldPrefill ? best.unit : '',
      note: shouldPrefill ? best.note : '',
    },
    candidates: candidates,
  };
}

function getNutritionMasters() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.NUTRITION_MASTER);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  return values.slice(1).map(mapNutritionMasterRow_);
}

function getNutritionMaster(masterKey) {
  return getNutritionMasterByKey_(masterKey);
}

function registerNutritionCandidate(menu) {
  if (!menu) return null;

  const existing = getNutritionMasterCached().find(master => normalizeText_(master.name) === normalizeText_(menu));
  if (existing) return existing;

  return saveNutritionMaster({
    name: menu,
    status: 'pending',
    source: SOURCE.SYSTEM,
  });
}

function saveNutritionMaster(input) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET.NUTRITION_MASTER);
  if (!sheet) {
    throw new Error('nutrition_master sheet not found');
  }

  const now = new Date();
  const normalizedName = normalizeText_(input.name);
  const matchedByName = normalizedName ? findNutritionMasterByName_(input.name, input.flavor, input.unit) : null;
  const masterKey = String(input.masterKey || (matchedByName && matchedByName.masterKey) || Utilities.getUuid());
  const current = getNutritionMasterByKey_(masterKey) || matchedByName;
  const values = sheet.getDataRange().getValues();
  const rowIndex = current
    ? values.findIndex(row => row[NUTRITION_COL_INDEX.masterKey - 1] === current.masterKey)
    : -1;

  const record = {
    masterKey: masterKey,
    name: String(input.name || '').trim(),
    kcal: toNullableNumber_(input.kcal),
    protein: toNullableNumber_(input.protein),
    fat: toNullableNumber_(input.fat),
    carb: toNullableNumber_(input.carb),
    salt: toNullableNumber_(input.salt),
    fiber: toNullableNumber_(input.fiber),
    flavor: String(input.flavor || ''),
    unit: String(input.unit || ''),
    note: String(input.note || ''),
    status: String(input.status || 'active'),
    source: String(input.source || SOURCE.MANUAL),
    createdAt: current && current.createdAt ? new Date(current.createdAt) : now,
    updatedAt: now,
  };

  const row = NUTRITION_MASTER_COLUMNS.map(key => record[key] ?? null);
  if (rowIndex >= 1) {
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  refreshNutritionMasterCache_();
  return record;
}

function findNutritionMasterByName_(name, flavor, unit) {
  return getNutritionMasterCached().find(master => isSameNutritionKey_(master, name, flavor, unit)) || null;
}

function isSameNutritionKey_(master, name, flavor, unit) {
  return normalizeText_(master && master.name) === normalizeText_(name) &&
    normalizeText_(master && master.flavor) === normalizeText_(flavor) &&
    normalizeText_(master && master.unit) === normalizeText_(unit);
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .replace(/[　]/g, '')
    .replace(/[・･]/g, '')
    .replace(/[\/]/g, '')
    .replace(/[ー\-]/g, '');
}

function pickNutrition_(master) {
  return Object.fromEntries(
    NUTRITION_KEYS.map(key => [key, toNullableNumber_(master[key])])
  );
}

function emptyNutrition_() {
  return {
    kcal: null,
    protein: null,
    fat: null,
    carb: null,
    salt: null,
    fiber: null,
    status: KCAL_STATUS.PENDING,
    masterKey: null,
  };
}

function scoreNutritionCandidate_(normalizedMenu, normalizedTargets) {
  const targets = Array.isArray(normalizedTargets) ? normalizedTargets : [normalizedTargets];
  return targets.reduce((best, target) => Math.max(best, scoreNutritionCandidateText_(normalizedMenu, target)), 0);
}

function scoreNutritionCandidateText_(normalizedMenu, normalizedMaster) {
  if (!normalizedMenu || !normalizedMaster) return 0;
  if (normalizedMenu === normalizedMaster) return 1;

  const shorterLength = Math.min(normalizedMenu.length, normalizedMaster.length);
  const longerLength = Math.max(normalizedMenu.length, normalizedMaster.length);
  const bigramScore = bigramSimilarity_(normalizedMenu, normalizedMaster);
  const containsBonus = (
    normalizedMenu.indexOf(normalizedMaster) !== -1 ||
    normalizedMaster.indexOf(normalizedMenu) !== -1
  )
    ? 0.45 + (shorterLength / longerLength) * 0.3
    : 0;
  const prefixBonus = normalizedMenu.slice(0, 2) === normalizedMaster.slice(0, 2) ? 0.08 : 0;
  const suffixBonus = normalizedMenu.slice(-2) === normalizedMaster.slice(-2) ? 0.05 : 0;

  return Math.min(0.99, bigramScore * 0.72 + containsBonus + prefixBonus + suffixBonus);
}

function bigramSimilarity_(left, right) {
  const leftBigrams = makeBigrams_(left);
  const rightBigrams = makeBigrams_(right);
  if (!leftBigrams.length || !rightBigrams.length) return 0;

  const rightMap = rightBigrams.reduce((acc, token) => {
    acc[token] = (acc[token] || 0) + 1;
    return acc;
  }, {});

  let intersection = 0;
  leftBigrams.forEach(token => {
    if (rightMap[token] > 0) {
      intersection += 1;
      rightMap[token] -= 1;
    }
  });

  return (intersection * 2) / (leftBigrams.length + rightBigrams.length);
}

function makeBigrams_(value) {
  if (!value) return [];
  if (value.length === 1) return [value];

  const tokens = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    tokens.push(value.slice(index, index + 2));
  }
  return tokens;
}

function mapNutritionMasterRow_(row) {
  return {
    masterKey: String(row[NUTRITION_COL_INDEX.masterKey - 1] || ''),
    name: String(row[NUTRITION_COL_INDEX.name - 1] || ''),
    kcal: toNullableNumber_(row[NUTRITION_COL_INDEX.kcal - 1]),
    protein: toNullableNumber_(row[NUTRITION_COL_INDEX.protein - 1]),
    fat: toNullableNumber_(row[NUTRITION_COL_INDEX.fat - 1]),
    carb: toNullableNumber_(row[NUTRITION_COL_INDEX.carb - 1]),
    salt: toNullableNumber_(row[NUTRITION_COL_INDEX.salt - 1]),
    fiber: toNullableNumber_(row[NUTRITION_COL_INDEX.fiber - 1]),
    flavor: String(row[NUTRITION_COL_INDEX.flavor - 1] || ''),
    unit: String(row[NUTRITION_COL_INDEX.unit - 1] || ''),
    note: String(row[NUTRITION_COL_INDEX.note - 1] || ''),
    status: String(row[NUTRITION_COL_INDEX.status - 1] || 'active'),
    source: String(row[NUTRITION_COL_INDEX.source - 1] || SOURCE.MANUAL),
    createdAt: row[NUTRITION_COL_INDEX.createdAt - 1] || null,
    updatedAt: row[NUTRITION_COL_INDEX.updatedAt - 1] || null,
  };
}

function buildNutritionDescriptor_(flavor, unit) {
  return [String(unit || '').trim(), String(flavor || '').trim()].filter(Boolean).join(' / ');
}

function buildNutritionDisplayName_(master) {
  const descriptor = buildNutritionDescriptor_(master && master.flavor, master && master.unit);
  const baseName = String(master && master.name || '').trim();
  return descriptor ? `${baseName}：${descriptor}` : baseName;
}

function getNutritionMasterSearchTexts_(master) {
  const base = normalizeText_(master && master.name);
  const display = normalizeText_(buildNutritionDisplayName_(master));
  const note = normalizeText_(master && master.note);
  return [...new Set([base, display, note].filter(Boolean))];
}
