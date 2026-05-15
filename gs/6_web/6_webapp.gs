/**
 * Web app and LIFF entry points.
 */

function doGet(e) {
  ensureProjectSetup_();
  const params = e && e.parameter ? e.parameter : {};

  return jsonOutput_({
    ok: true,
    service: 'meal-project-api',
    version: 1,
    actions: ['getHeaderState', 'getLiffAppState', 'searchNutritionMaster', 'saveNutritionMasterOnly', 'submitMealDetail', 'updateProfile', 'updateMealLog', 'deleteMealLog'],
    lineWebhookEnabled: true,
    liffConfigured: Boolean(getLiffId_()),
    query: params,
  });
}

function doPost(e) {
  ensureProjectSetup_();
  const request = parseJsonBody_(e);

  try {
    if (request.events && Array.isArray(request.events)) {
      handleLineWebhook_(request);
      return textOutput_('ok');
    }

    switch (request.action || '') {
      case 'getHeaderState':
        return jsonOutput_(getHeaderStateFromLiff(request));
      case 'getLiffAppState':
        return jsonOutput_(getLiffAppState(request));
      case 'searchNutritionMaster':
        return jsonOutput_(searchNutritionMasterFromLiff(request));
      case 'saveNutritionMasterOnly':
        return jsonOutput_(saveNutritionMasterOnlyFromLiff(request));
      case 'submitMealDetail':
        return jsonOutput_(submitMealDetailFromLiff(request));
      case 'updateProfile':
        return jsonOutput_(updateLiffUserProfile(request));
      case 'updateMealLog':
        return jsonOutput_(updateMealLogFromLiff(request));
      case 'deleteMealLog':
        return jsonOutput_(deleteMealLogFromLiff(request));
      default:
        return jsonOutput_({ ok: false, error: 'unsupported action' });
    }
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message });
  }
}

function searchNutritionMasterFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }
  const user = ensureUserExists_(identity.userId, identity.displayName);
  ensureUserCanUseService_(user);
  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(user),
    results: searchNutritionMasterRecords(payload.query, payload.limit || 12),
  };
}

function saveNutritionMasterOnlyFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const result = saveNutritionMasterOnly(identity.userId, {
    displayName: identity.displayName,
    meal: payload.meal,
    mealDate: payload.mealDate,
    datePreset: payload.datePreset,
    masterKey: payload.masterKey,
    menu: payload.menu,
    flavor: payload.flavor,
    kcal: payload.kcal,
    protein: payload.protein,
    fat: payload.fat,
    carb: payload.carb,
    salt: payload.salt,
    fiber: payload.fiber,
    unit: payload.unit,
    note: payload.note,
  }, SOURCE.LIFF);

  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(getUserById(identity.userId)),
    dashboard: result.dashboard,
    draft: result.draft,
    savedMaster: serializeNutritionCandidate_(Object.assign({ score: 1, scorePercent: 100 }, result.savedMaster)),
  };
}

function getHeaderStateFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_({
    userId: payload && payload.userId,
    displayName: payload && payload.displayName,
    idToken: payload && payload.idToken,
  });

  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const user = ensureUserExists_(identity.userId, identity.displayName);
  return {
    ok: true,
    liffId: getLiffId_(),
    identity: serializeIdentityState_(identity),
    header: getHeaderState(user.userId),
    permission: serializeUserPermission_(user),
  };
}

function getLiffAppState(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_({
    userId: payload && payload.userId,
    displayName: payload && payload.displayName,
    idToken: payload && payload.idToken,
  });

  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const user = ensureUserExists_(identity.userId, identity.displayName);
  return {
    ok: true,
    liffId: getLiffId_(),
    channelIdConfigured: Boolean(getLineChannelId_()),
    identity: serializeIdentityState_(identity),
    header: getHeaderState(user.userId),
    permission: serializeUserPermission_(user),
    dashboard: getDashboardData(user.userId),
    draft: getMealDraftState({
      meal: payload && payload.meal,
      menu: payload && payload.menu,
      mealDate: payload && payload.mealDate,
      datePreset: payload && payload.datePreset,
    }),
  };
}

function submitMealDetailFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const result = submitMealDetail(identity.userId, {
    displayName: identity.displayName,
    meal: payload.meal,
    menu: payload.menu,
    masterKey: payload.masterKey,
    flavor: payload.flavor,
    kcal: payload.kcal,
    protein: payload.protein,
    fat: payload.fat,
    carb: payload.carb,
    salt: payload.salt,
    fiber: payload.fiber,
    unit: payload.unit,
    note: payload.note,
    mealDate: payload.mealDate,
  }, SOURCE.LIFF);

  let summaryPushed = false;
  if (payload.sendLineSummary == null || toBoolean_(payload.sendLineSummary)) {
    try {
      pushLineMessages_(identity.userId, [
        buildDailySummaryFlexMessage(identity.userId, {
          dashboard: result.dashboard,
          record: result.record,
          headline: `${buildRecordDisplayName_(result.record)} を記録`,
        }),
      ]);
      summaryPushed = true;
    } catch (error) {
      summaryPushed = false;
    }
  }

  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(getUserById(identity.userId)),
    reply: buildLogReply(identity.userId, result.record),
    dashboard: result.dashboard,
    draft: getMealDraftState({
      meal: result.record.meal,
      menu: result.record.menu,
      mealDate: payload && payload.mealDate,
      datePreset: payload && payload.datePreset,
    }),
    summaryPushed: summaryPushed,
    savedMaster: serializeNutritionCandidate_(Object.assign({ score: 1, scorePercent: 100 }, result.savedMaster)),
  };
}

function updateLiffUserProfile(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const user = ensureUserExists_(identity.userId, identity.displayName);
  ensureUserCanUseService_(user);
  updateUserProfile(identity.userId, {
    displayName: identity.displayName,
    calorieTarget: payload.calorieTarget,
    goalType: payload.goalType,
    notify: payload.notify,
  });

  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(getUserById(identity.userId)),
    dashboard: getDashboardData(identity.userId),
  };
}

function updateMealLogFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const result = updateMealLogDetail(identity.userId, {
    row: payload.row,
    displayName: identity.displayName,
    meal: payload.meal,
    menu: payload.menu,
    masterKey: payload.masterKey,
    flavor: payload.flavor,
    kcal: payload.kcal,
    protein: payload.protein,
    fat: payload.fat,
    carb: payload.carb,
    salt: payload.salt,
    fiber: payload.fiber,
    unit: payload.unit,
    note: payload.note,
    mealDate: payload.mealDate,
  }, SOURCE.LIFF);

  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(getUserById(identity.userId)),
    dashboard: result.dashboard,
    draft: getMealDraftState({
      meal: result.record.meal,
      menu: result.record.menu,
      mealDate: payload && payload.mealDate,
      datePreset: payload && payload.datePreset,
    }),
  };
}

function deleteMealLogFromLiff(payload) {
  ensureProjectSetup_();
  const identity = verifyLiffIdentity_(payload);
  if (!identity.userId) {
    throw new Error('userId is required');
  }

  const result = deleteMealLogDetail(identity.userId, payload.row);
  return {
    ok: true,
    identity: serializeIdentityState_(identity),
    permission: serializeUserPermission_(getUserById(identity.userId)),
    dashboard: result.dashboard,
  };
}

function serializeIdentityState_(identity) {
  return {
    userId: String(identity && identity.userId || ''),
    displayName: String(identity && identity.displayName || ''),
    verified: Boolean(identity && identity.verified),
    verificationError: String(identity && identity.verificationError || ''),
  };
}

function parseJsonBody_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(body);
}
