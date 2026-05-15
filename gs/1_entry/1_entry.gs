/**
 * LINE and text entry points.
 */

function handleTextEvent(param) {
  const result = handleMealMessageFlow(
    String(param.userId || '').trim(),
    String(param.text || '').trim(),
    String(param.displayName || '').trim(),
    param.source || SOURCE.TEXT,
    param.pictureUrl || ''
  );

  if (result.kind === 'target_updated') {
    return result.text;
  }

  if (result.kind === 'admin_text' || result.kind === 'permission_pending') {
    return result.text;
  }

  if (result.kind === 'logged') {
    return buildLogReply(param.userId, result.record);
  }

  return '未記入ログとして保存しました。詳細を入力してください。';
}

function handleLineWebhook_(payload) {
  const events = payload && payload.events ? payload.events : [];
  events.forEach(event => handleLineEvent_(event));
}

function resolveLineProfile_(userId) {
  const existingUser = getUserById(userId);
  const fallbackProfile = { displayName: String(existingUser && existingUser.displayName || '') };

  try {
    const profile = getLineProfile_(userId) || {};
    return {
      displayName: String(profile.displayName || fallbackProfile.displayName || ''),
      pictureUrl: String(profile.pictureUrl || ''),
    };
  } catch (error) {
    return fallbackProfile;
  }
}

function handleLineEvent_(event) {
  if (!event) {
    return;
  }

  const userId = String(event.source && event.source.userId || '').trim();
  if (!userId) {
    return;
  }

  if (String(event.source && event.source.type || '') === 'user') {
    try {
      showLineLoadingAnimation_(userId, 30);
    } catch (error) {
      // Loading animation is a best-effort enhancement.
    }
  }

  if (event.type === 'postback') {
    handleLinePostbackEvent_(event, userId);
    return;
  }

  if (event.type !== 'message' || !event.message) {
    return;
  }

  if (event.message.type === 'image') {
    handleLineImageEvent_(event, userId);
    return;
  }

  if (event.message.type !== 'text') {
    return;
  }

  const profile = resolveLineProfile_(userId);
  const isFirstPostToday = getMealLogsByUserAndDate(userId, new Date()).length === 0;
  const result = handleMealMessageFlow(
    userId,
    String(event.message.text || ''),
    String(profile.displayName || ''),
    SOURCE.LINE,
    String(profile.pictureUrl || '')
  );

  if (result.kind === 'target_updated') {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: result.text,
    }]);
    return;
  }

  if (result.kind === 'admin_text' || result.kind === 'permission_pending') {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: result.text,
    }]);
    return;
  }

  if (result.kind === 'logged') {
    const messages = [
      buildDailySummaryFlexMessage(userId, {
        dashboard: result.dashboard,
        record: result.record,
        headline: `${buildRecordDisplayName_(result.record)} を記録`,
        senderProfile: profile,
      }),
    ];
    if (isFirstPostToday) {
      messages.push({
        type: 'text',
        text: buildFirstPostComment(userId),
      });
    }
    replyLineMessages_(event.replyToken, messages);
    return;
  }

  replyLineMessages_(event.replyToken, [
    buildMealInputPromptFlexMessage(result.parsed, result.draft, profile),
  ]);
}

function handleLineImageEvent_(event, userId) {
  const profile = resolveLineProfile_(userId);

  try {
    const result = attachMealImageToNearestLog(userId, {
      displayName: String(profile.displayName || ''),
      messageId: event && event.message && event.message.id,
      timestamp: event && event.timestamp,
    });

    if (result.selectionToken && result.candidateLogs && result.candidateLogs.length) {
      replyLineMessages_(event.replyToken, [
        buildImageAttachChoiceFlexMessage(result.mealType, result.candidateLogs, result.selectionToken, profile),
      ]);
      return;
    }

    const text = result.linkedLog
      ? `画像を保存して、${result.mealType}の「${result.linkedLog.menu}」に紐づけました。`
      : `画像を保存しました。${result.mealType}帯の記録がまだ見つからなかったため、ひも付けは保留です。`;

    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: text,
    }]);
  } catch (error) {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: '画像の保存に失敗しました。しばらくしてからもう一度送ってください。',
    }]);
  }
}

function handleLinePostbackEvent_(event, userId) {
  const data = parseQueryString_(event && event.postback && event.postback.data);
  const action = String(data.action || '');
  if (!action) {
    return;
  }

  if (action === 'attachMealImage') {
    handleLineImageAttachPostback_(event, userId, data);
    return;
  }

  if (action !== 'logCandidate') {
    return;
  }

  const profile = resolveLineProfile_(userId);
  const isFirstPostToday = getMealLogsByUserAndDate(userId, new Date()).length === 0;

  try {
    const result = submitMealCandidate(userId, {
      displayName: String(profile.displayName || ''),
      masterKey: data.masterKey,
      meal: data.meal,
      menu: data.menu,
      mealDate: data.mealDate,
    }, SOURCE.LINE);

    const messages = [
      buildDailySummaryFlexMessage(userId, {
        dashboard: result.dashboard,
        record: result.record,
        headline: `${buildRecordDisplayName_(result.record)} を記録`,
        senderProfile: profile,
      }),
    ];
    if (isFirstPostToday) {
      messages.push({
        type: 'text',
        text: buildFirstPostComment(userId),
      });
    }
    replyLineMessages_(event.replyToken, messages);
  } catch (error) {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: '候補の記録に失敗しました。入力画面から登録してください。',
    }]);
  }
}

function handleLineImageAttachPostback_(event, userId, data) {
  const profile = resolveLineProfile_(userId);
  try {
    const result = attachMealImageBySelection(userId, {
      displayName: String(profile.displayName || ''),
      selectionToken: data.token,
      row: data.row,
    });
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: `画像を${result.mealType}の「${result.linkedLog.menu}」に紐づけました。`,
    }]);
  } catch (error) {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: '画像の紐づけ先を確定できませんでした。時間を空けてもう一度画像を送ってください。',
    }]);
  }
}
