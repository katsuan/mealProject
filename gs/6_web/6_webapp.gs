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
    actions: ['getLiffAppState', 'submitMealDetail', 'updateProfile'],
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
      case 'getLiffAppState':
        return jsonOutput_(getLiffAppState(request));
      case 'submitMealDetail':
        return jsonOutput_(submitMealDetailFromLiff(request));
      case 'updateProfile':
        return jsonOutput_(updateLiffUserProfile(request));
      default:
        return jsonOutput_({ ok: false, error: 'unsupported action' });
    }
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message });
  }
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
    dashboard: getDashboardData(user.userId),
    draft: getMealDraftState({
      meal: payload && payload.meal,
      menu: payload && payload.menu,
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
          headline: `${result.record.menu} を記録しました`,
        }),
      ]);
      summaryPushed = true;
    } catch (error) {
      summaryPushed = false;
    }
  }

  return {
    ok: true,
    reply: buildLogReply(identity.userId, result.record),
    dashboard: result.dashboard,
    draft: getMealDraftState({
      meal: result.record.meal,
      menu: result.record.menu,
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

  ensureUserExists_(identity.userId, identity.displayName);
  updateUserProfile(identity.userId, {
    displayName: identity.displayName,
    calorieTarget: payload.calorieTarget,
    goalType: payload.goalType,
    notify: payload.notify,
  });

  return {
    ok: true,
    dashboard: getDashboardData(identity.userId),
  };
}

function parseJsonBody_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(body);
}
