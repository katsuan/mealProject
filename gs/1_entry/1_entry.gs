/**
 * LINE and text entry points.
 */

function handleTextEvent(param) {
  const result = handleMealMessageFlow(
    String(param.userId || '').trim(),
    String(param.text || '').trim(),
    String(param.displayName || '').trim(),
    param.source || SOURCE.TEXT
  );

  if (result.kind === 'target_updated') {
    return result.text;
  }

  if (result.kind === 'logged') {
    return buildLogReply(param.userId, result.record);
  }

  return '詳細を入力してください。';
}

function handleLineWebhook_(payload) {
  const events = payload && payload.events ? payload.events : [];
  events.forEach(event => handleLineEvent_(event));
}

function resolveLineProfile_(userId) {
  const existingUser = getUserById(userId);
  if (existingUser && existingUser.displayName) {
    return { displayName: String(existingUser.displayName || '') };
  }

  try {
    return getLineProfile_(userId) || {};
  } catch (error) {
    return {};
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
      showLineLoadingAnimation_(userId, 5);
    } catch (error) {
      // Loading animation is a best-effort enhancement.
    }
  }

  if (event.type === 'postback') {
    handleLinePostbackEvent_(event, userId);
    return;
  }

  if (event.type !== 'message' || !event.message || event.message.type !== 'text') {
    return;
  }

  const profile = resolveLineProfile_(userId);
  const result = handleMealMessageFlow(
    userId,
    String(event.message.text || ''),
    String(profile.displayName || ''),
    SOURCE.LINE
  );

  if (result.kind === 'target_updated') {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: result.text,
    }]);
    return;
  }

  if (result.kind === 'logged') {
    replyLineMessages_(event.replyToken, [
      buildDailySummaryFlexMessage(userId, {
        dashboard: result.dashboard,
        record: result.record,
        headline: `${result.parsed.menu} を記録しました`,
      }),
    ]);
    return;
  }

  replyLineMessages_(event.replyToken, [
    buildMealInputPromptFlexMessage(result.parsed, result.draft),
  ]);
}

function handleLinePostbackEvent_(event, userId) {
  const data = parseQueryString_(event && event.postback && event.postback.data);
  if (String(data.action || '') !== 'logCandidate') {
    return;
  }

  const profile = resolveLineProfile_(userId);

  try {
    const result = submitMealCandidate(userId, {
      displayName: String(profile.displayName || ''),
      masterKey: data.masterKey,
      meal: data.meal,
      menu: data.menu,
    }, SOURCE.LINE);

    replyLineMessages_(event.replyToken, [
      buildDailySummaryFlexMessage(userId, {
        dashboard: result.dashboard,
        record: result.record,
        headline: `${result.record.menu} を記録しました`,
      }),
    ]);
  } catch (error) {
    replyLineMessages_(event.replyToken, [{
      type: 'text',
      text: '候補の記録に失敗しました。入力画面から登録してください。',
    }]);
  }
}
