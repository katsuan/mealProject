/**
 * User-facing message builders.
 */

function buildLogReply(userId, record) {
  const summary = getTodaySummary(userId);
  const total = summary.totalExact + summary.totalEstimated;
  const estimatedNote = summary.totalEstimated > 0
    ? `推定 ${summary.totalEstimated} kcal を含みます`
    : '';
  const displayName = buildRecordDisplayName_(record);

  return [
    '記録',
    `${record.meal}: ${displayName}`,
    buildMealKcalLine(record),
    buildKcalDiffLine_(userId, total),
    `今日の合計: ${total} kcal`,
    estimatedNote,
    buildPendingWarning_(summary),
  ].filter(Boolean).join('\n');
}

function buildMealKcalLine(record) {
  switch (record.kcalStatus) {
    case KCAL_STATUS.EXACT:
      return `${record.kcal} kcal`;
    case KCAL_STATUS.ESTIMATED:
      return `約 ${record.kcal} kcal`;
    case KCAL_STATUS.PENDING:
      return 'カロリー未登録';
    default:
      return '';
  }
}

function buildPendingWarning_(summary) {
  if (!summary.hasPending) return '';
  return ['未登録メニュー:', ...summary.pendingItems.map(item => `- ${item}`)].join('\n');
}

function buildKcalDiffLine_(userId, total) {
  const user = getUserById(userId);
  if (!user || user.calorieTarget == null) {
    return '目標カロリー未設定';
  }

  const diff = user.calorieTarget - total;
  return diff >= 0 ? `残り ${diff} kcal` : `目標オーバー ${Math.abs(diff)} kcal`;
}

function buildTargetUpdatedReply(userId, kcal) {
  return `目標カロリーを ${kcal} kcal に更新しました`;
}

function getFlexTone_(kind) {
  switch (kind) {
    case 'warning':
      return {
        soft: '#FDE2E2',
        text: '#C84949',
        bar: '#D75A3C',
      };
    case 'notice':
      return {
        soft: '#FDE7D6',
        text: '#B7672B',
        bar: '#D98C2B',
      };
    default:
      return {
        soft: '#E3F7EB',
        text: '#2F8F5B',
        bar: '#D98C2B',
      };
  }
}

function formatPercentValue_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.0';
  return (Math.round(number * 10) / 10).toFixed(1);
}

function buildDailySummaryFlexMessage(userId, options) {
  const context = options || {};
  const dashboard = context.dashboard || getDashboardData(userId);
  const today = dashboard.today;
  const total = Number(today.totalExact || 0) + Number(today.totalEstimated || 0);
  const targetKcal = Number(dashboard.user && dashboard.user.calorieTarget || 0);
  const hasTarget = targetKcal > 0;
  const targetPercent = hasTarget ? (total / targetKcal) * 100 : null;
  const isOverTarget = hasTarget && total > targetKcal;
  const inputUrl = buildLiffUrl_({ mode: 'input' });
  const logsUrl = buildLiffUrl_({ mode: 'logs' });
  const recordDisplayName = context.record ? buildRecordDisplayName_(context.record) : '';
  const headline = context.headline || (recordDisplayName ? `${recordDisplayName} を記録` : '今日の集計');
  const subline = context.subline || buildKcalDiffLine_(userId, total);
  const sublineColor = isOverTarget ? '#C84949' : '#6b7280';
  const recordedLine = context.record
    ? `${context.record.meal} ${recordDisplayName} / ${buildMealKcalLine(context.record)}`
    : '';
  const pendingLine = today.hasPending
    ? `未登録 ${today.pendingItems.length}件`
    : '未登録なし';
  const totalColor = isOverTarget ? '#C84949' : '#231815';
  const targetPercentText = hasTarget ? formatPercentValue_(targetPercent) : null;
  const targetValueLine = hasTarget ? `${targetKcal} kcal` : '目標未設定';
  const targetRatioColor = isOverTarget ? '#C84949' : '#231815';
  const targetValueColor = '#6b7280';
  const tone = getFlexTone_(isOverTarget ? 'warning' : (today.hasPending ? 'notice' : 'success'));
  const progressWidth = hasTarget ? `${Math.max(6, Math.min(targetPercent, 100))}%` : '0%';
  const logs = (dashboard.recentLogs || []).slice(0, 6);
  const quickReply = buildPopularQuickReply_(userId);

  const message = {
    type: 'flex',
    altText: `${headline} 合計 ${total} kcal`,
    quickReply: quickReply,
    contents: {
      type: 'carousel',
      contents: [
        buildDailySummaryBubble_({
          headline: headline,
          subline: subline,
          sublineColor: sublineColor,
          recordedLine: recordedLine,
          hasTarget: hasTarget,
          progressWidth: progressWidth,
          tone: tone,
          total: total,
          totalColor: totalColor,
          targetValueLine: targetValueLine,
          targetValueColor: targetValueColor,
          targetRatioColor: targetRatioColor,
          targetPercentText: targetPercentText,
          isOverTarget: isOverTarget,
          today: today,
          pendingLine: pendingLine,
          detailUrl: inputUrl,
        }),
        buildTodayLogBubble_({
          logs: logs,
          detailUrl: logsUrl,
          pendingLine: pendingLine,
        }),
      ],
    },
  };
  return applyFlexSender_(message, context.senderProfile);
}

function buildPopularQuickReply_(userId) {
  const items = getPopularMenusByUser_(userId, 6)
    .map(item => ({
      type: 'action',
      action: {
        type: 'message',
        label: trimQuickReplyLabel_(item.menu),
        text: `${item.menu}`,
      },
    }));

  return items.length ? { items: items } : undefined;
}

function buildRecordDisplayName_(record) {
  if (!record) return '';
  if (record.masterKey) {
    const master = getNutritionMaster(record.masterKey);
    if (master) {
      return buildNutritionDisplayName_(master);
    }
  }
  const flavor = String(record.flavor || '').trim();
  const unit = String(record.unit || '').trim();
  const descriptor = buildNutritionDescriptor_(flavor, unit);
  const menu = String(record.menu || '').trim();
  return descriptor ? `${menu}：${descriptor}` : menu;
}

function trimQuickReplyLabel_(value) {
  const text = String(value || '').trim();
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
}

function buildDailySummaryBubble_(context) {
  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: context.tone.soft,
          cornerRadius: '12px',
          paddingAll: '14px',
          contents: [
            {
              type: 'text',
              text: context.headline,
              weight: 'bold',
              size: 'lg',
              color: context.tone.text,
              wrap: true,
            },
            {
              type: 'text',
              text: context.subline,
              size: 'sm',
              color: context.sublineColor,
              wrap: true,
              margin: 'sm',
            },
          ],
        },
        context.recordedLine ? {
          type: 'box',
          layout: 'vertical',
          cornerRadius: '12px',
          backgroundColor: '#F3F4F6',
          paddingAll: '12px',
          contents: [
            {
              type: 'text',
              text: context.recordedLine,
              size: 'sm',
              wrap: true,
            },
          ],
        } : null,
        context.hasTarget ? {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              height: '10px',
              backgroundColor: '#D1D5DB',
              cornerRadius: '999px',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  width: context.progressWidth,
                  height: '10px',
                  backgroundColor: context.tone.bar,
                  cornerRadius: '999px',
                  contents: [],
                },
              ],
            },
          ],
        } : null,
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '合計',
              flex: 2,
              size: 'sm',
              color: '#6b7280',
            },
            {
              type: 'text',
              text: `${context.total} kcal`,
              flex: 5,
              size: 'xl',
              weight: 'bold',
              color: context.totalColor,
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '目標',
              flex: 2,
              size: 'sm',
              color: '#6b7280',
            },
            {
              type: 'text',
              text: context.targetValueLine,
              flex: 5,
              size: 'sm',
              wrap: true,
              color: context.targetValueColor,
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '目標比',
              flex: 2,
              size: 'sm',
              color: '#6b7280',
            },
            context.hasTarget ? {
              type: 'text',
              text: `${context.targetPercentText}%`,
              flex: 5,
              size: 'lg',
              color: context.targetRatioColor,
              weight: 'bold',
            } : {
              type: 'text',
              text: '未設定',
              flex: 5,
              size: 'sm',
              color: '#6b7280',
            },
          ].filter(Boolean),
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '状態',
              flex: 2,
              size: 'sm',
              color: '#6b7280',
            },
            {
              type: 'text',
              text: context.pendingLine,
              flex: 5,
              size: 'sm',
              wrap: true,
            },
          ],
        },
        {
          type: 'text',
          text: `P ${roundNutrition_(context.today.nutrition.protein)} / F ${roundNutrition_(context.today.nutrition.fat)} / C ${roundNutrition_(context.today.nutrition.carb)}`,
          size: 'xs',
          wrap: true,
          color: '#8a6258',
        },
      ].filter(Boolean),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          color: '#FDF5F2',
          action: {
            type: 'uri',
            label: '入力・編集する',
            uri: context.detailUrl,
          },
        },
      ],
    },
  };
}

function buildTodayLogBubble_(context) {
  const logs = context.logs || [];
  const logContents = logs.length
    ? logs.map(log => ({
        type: 'box',
        layout: 'horizontal',
        paddingAll: '10px',
        backgroundColor: '#FDF5F2',
        cornerRadius: '10px',
        contents: [
          {
            type: 'text',
            text: `${log.meal} ${formatFlexLogKcal_(log)} ${log.menu}`,
            size: 'sm',
            wrap: true,
            color: '#231815',
          },
        ],
      }))
    : [{
        type: 'text',
        text: 'まだ記録がありません。',
        size: 'sm',
        color: '#6b7280',
        wrap: true,
      }];

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FDF5F2',
          cornerRadius: '12px',
          paddingAll: '14px',
          contents: [
            {
              type: 'text',
              text: '今日のログ',
              weight: 'bold',
              size: 'lg',
              color: '#B8462C',
            },
            {
              type: 'text',
              text: context.pendingLine,
              size: 'sm',
              color: '#8a6258',
              margin: 'sm',
              wrap: true,
            },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: logContents,
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          color: '#FDF5F2',
          action: {
            type: 'uri',
            label: 'ログを編集する',
            uri: context.detailUrl,
          },
        },
      ],
    },
  };
}

function formatFlexLogTime_(value) {
  if (!value) return '';
  return Utilities.formatDate(new Date(value), APP_TIMEZONE, 'H:mm');
}

function buildMealInputPromptFlexMessage(parsed, draft, senderProfile) {
  const liffUrl = buildLiffUrl_({
    mode: 'input',
    meal: parsed.meal,
    menu: parsed.menu,
    mealDate: parsed.mealDate,
    datePreset: parsed.datePreset,
  });
  const topCandidates = (draft && draft.candidates || []).slice(0, 3);
  const message = {
    type: 'flex',
    altText: `${parsed.menu} は未登録です。候補を採用するか画面で入力してください。`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FDE7D6',
            cornerRadius: '12px',
            paddingAll: '14px',
            contents: [
              {
                type: 'text',
                text: '未登録メニュー',
                weight: 'bold',
                size: 'lg',
                color: '#B7672B',
              },
              {
                type: 'text',
                text: `${parsed.meal} ${parsed.menu}`,
                wrap: true,
                size: 'md',
                margin: 'sm',
              },
              {
                type: 'text',
                text: '近い候補をタップすると、その候補を採用してすぐ記録します。候補と違う場合は画面で内容を入力できます。',
                wrap: true,
                size: 'sm',
                color: '#8a6258',
                margin: 'sm',
              },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F9FAFB',
            cornerRadius: '12px',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: '近い候補',
                weight: 'bold',
                size: 'sm',
                margin: 'md',
              },
              topCandidates.length
                ? {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    margin: 'sm',
                    contents: topCandidates.map(item => buildCandidatePostbackRow_(parsed, item)),
                  }
                : {
                    type: 'text',
                    text: '候補なし',
                    wrap: true,
                    margin: 'sm',
                    size: 'sm',
                  },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
        {
          type: 'button',
          style: 'secondary',
          color: '#FDF5F2',
          action: {
            type: 'uri',
            label: '画面で入力する',
            uri: liffUrl,
          },
        },
        ],
      },
    },
  };
  return applyFlexSender_(message, senderProfile);
}

function applyFlexSender_(message, profile) {
  const safeProfile = profile || {};
  if (!safeProfile.displayName && !safeProfile.pictureUrl) {
    return message;
  }

  const sender = {
    name: String(safeProfile.displayName || '食事ログ'),
  };
  if (safeProfile.pictureUrl) {
    sender.iconUrl = String(safeProfile.pictureUrl);
  }
  return Object.assign({}, message, {
    sender: sender,
  });
}

function buildCandidatePostbackRow_(parsed, candidate) {
  return {
    type: 'box',
    layout: 'horizontal',
    alignItems: 'center',
    justifyContent: 'space-between',
    spacing: 'sm',
    paddingAll: '10px',
    cornerRadius: '10px',
    backgroundColor: '#FDF5F2',
    action: {
      type: 'postback',
      label: `${candidate.name} を採用して記録`,
      data: buildQueryString_({
        action: 'logCandidate',
        meal: parsed.meal,
        masterKey: candidate.masterKey,
        menu: candidate.name,
        mealDate: parsed.mealDate,
      }),
      displayText: `${parsed.meal} ${candidate.name} を記録しています...`,
    },
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        spacing: 'xs',
        contents: [
          {
            type: 'text',
            text: candidate.name,
            size: 'sm',
            weight: 'bold',
            wrap: true,
          },
          {
            type: 'text',
            text: `${candidate.kcal || '-'} kcal / 一致度 ${candidate.scorePercent}%`,
            size: 'xs',
            color: '#8a6258',
            wrap: true,
          },
        ],
      },
      {
        type: 'text',
        text: '採用',
        size: 'xs',
        weight: 'bold',
        color: '#B8462C',
        flex: 0,
      },
    ],
  };
}

function buildImageAttachChoiceFlexMessage(mealType, candidateLogs, selectionToken, senderProfile) {
  const logs = Array.isArray(candidateLogs) ? candidateLogs.slice(0, 8) : [];
  const message = {
    type: 'flex',
    altText: '画像の紐づけ先を選んでください。',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FDE7D6',
            cornerRadius: '12px',
            paddingAll: '14px',
            contents: [
              {
                type: 'text',
                text: '画像の紐づけ先を選ぶ',
                weight: 'bold',
                size: 'lg',
                color: '#B7672B',
                wrap: true,
              },
              {
                type: 'text',
                text: `${mealType}の記録が複数あります。画像を付ける記録を選んでください。`,
                wrap: true,
                size: 'sm',
                color: '#8a6258',
                margin: 'sm',
              },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: logs.map(log => ({
              type: 'box',
              layout: 'horizontal',
              alignItems: 'center',
              justifyContent: 'space-between',
              spacing: 'sm',
              paddingAll: '10px',
              cornerRadius: '10px',
              backgroundColor: '#FDF5F2',
              action: {
                type: 'postback',
                label: `${log.meal} ${log.menu} に画像を付ける`,
                data: buildQueryString_({
                  action: 'attachMealImage',
                  row: log.row,
                  token: selectionToken,
                }),
                displayText: `${log.meal} ${log.menu} に画像を紐づけています...`,
              },
              contents: [
                {
                  type: 'text',
                  text: `${log.meal} ${formatFlexLogKcal_(log)} ${log.menu}`,
                  size: 'sm',
                  wrap: true,
                  color: '#231815',
                  flex: 1,
                },
                {
                  type: 'text',
                  text: '選択',
                  size: 'xs',
                  weight: 'bold',
                  color: '#B8462C',
                  flex: 0,
                },
              ],
            })),
          },
        ],
      },
    },
  };
  return applyFlexSender_(message, senderProfile);
}

function roundNutrition_(value) {
  const number = Number(value || 0);
  return Math.round(number * 10) / 10;
}

function formatFlexLogKcal_(log) {
  const line = buildMealKcalLine(log);
  return line.replace(/^約\s*/, '').replace(/\s+/g, '');
}
