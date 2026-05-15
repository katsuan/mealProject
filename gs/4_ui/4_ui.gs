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
    `今日の合計: ${formatKcalDisplay_(total)} kcal`,
    estimatedNote,
    buildPendingWarning_(summary),
  ].filter(Boolean).join('\n');
}

function buildMealKcalLine(record) {
  const formattedKcal = formatKcalDisplay_(record && record.kcal);
  switch (record.kcalStatus) {
    case KCAL_STATUS.EXACT:
      return `${formattedKcal} kcal`;
    case KCAL_STATUS.ESTIMATED:
      return `約 ${formattedKcal} kcal`;
    case KCAL_STATUS.PENDING:
      return 'カロリー未登録';
    default:
      return '';
  }
}

function buildPendingWarning_(summary) {
  if (!summary.hasPending) return '';
  return ['未登録メニュー:', ...summary.pendingItems.map(item => `- ${item.menu || item}`)].join('\n');
}

function buildKcalDiffLine_(userId, total) {
  const user = getUserById(userId);
  if (!user || user.calorieTarget == null) {
    return '目標カロリー未設定';
  }

  const diff = user.calorieTarget - total;
  return diff >= 0
    ? `残り ${formatKcalDisplay_(diff)} kcal`
    : `目標オーバー ${formatKcalDisplay_(Math.abs(diff))} kcal`;
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

function getMealFlexColor_(meal) {
  switch (String(meal || '')) {
    case '朝':
      return '#F5A623';
    case '昼':
      return '#4A90E2';
    case '夜':
      return '#7B61FF';
    default:
      return '#6FCF97';
  }
}

function formatPercentValue_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.0';
  return (Math.round(number * 10) / 10).toFixed(1);
}

function formatKcalDisplay_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return String(Math.round(number * 10) / 10).replace(/\.0$/, '');
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
  const recordDetailLine = context.record ? buildRecordDetailLine_(context.record) : '';
  const headline = context.headline || (recordDisplayName ? `${recordDisplayName} を記録` : '今日の集計');
  const subline = context.subline || buildKcalDiffLine_(userId, total);
  const sublineColor = isOverTarget ? '#C84949' : '#6b7280';
  const pendingLine = today.hasPending
    ? `未登録 ${today.pendingItems.length}件`
    : '未登録なし';
  const totalColor = isOverTarget ? '#C84949' : '#231815';
  const targetPercentText = hasTarget ? formatPercentValue_(targetPercent) : null;
  const targetValueLine = hasTarget ? `${formatKcalDisplay_(targetKcal)} kcal` : '目標未設定';
  const targetRatioColor = isOverTarget ? '#C84949' : '#231815';
  const targetValueColor = '#6b7280';
  const tone = getFlexTone_(isOverTarget ? 'warning' : (today.hasPending ? 'notice' : 'success'));
  const progressWidth = hasTarget ? `${Math.max(6, Math.min(targetPercent, 100))}%` : '0%';
  const logs = (dashboard.recentLogs || []).slice(0, 6);
  const quickReply = buildPopularQuickReply_(userId);

  const message = {
    type: 'flex',
      altText: `${headline} 合計 ${formatKcalDisplay_(total)} kcal${targetPercentText ? ` / 目標比 ${targetPercentText}%` : ''}`,
    quickReply: quickReply,
    contents: {
      type: 'carousel',
      contents: [
        buildDailySummaryBubble_({
          headline: headline,
          subline: subline,
          sublineColor: sublineColor,
          record: context.record,
          recordDisplayName: recordDisplayName,
          recordDetailLine: recordDetailLine,
          hasTarget: hasTarget,
          progressWidth: progressWidth,
          tone: tone,
          total: total,
          totalColor: totalColor,
          targetKcal: targetKcal,
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
  const seenMenus = {};
  const items = getPopularMenusByUser_(userId, 20)
    .filter(item => {
      const menu = String(item.menu || '').trim();
      if (!menu) return false;
      const normalized = normalizeText_(menu);
      if (seenMenus[normalized]) return false;
      seenMenus[normalized] = true;
      return true;
    })
    .slice(0, 6)
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
      return String(master.name || '').trim();
    }
  }
  return String(record.menu || '').trim();
}

function buildRecordDetailLine_(record) {
  if (!record) return '';
  if (record.masterKey) {
    const master = getNutritionMaster(record.masterKey);
    if (master) {
      return buildNutritionDescriptor_(master.flavor, master.unit);
    }
  }
  return buildNutritionDescriptor_(record.flavor, record.unit);
}

function trimQuickReplyLabel_(value) {
  const text = String(value || '').trim();
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
}

function buildDailySummaryBubble_(context) {
  const mealSegments = buildFlexMealSegments_(context.today, context.hasTarget ? context.targetKcal : 0, context.total);
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
        context.record ? {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          cornerRadius: '12px',
          backgroundColor: '#F3F4F6',
          paddingAll: '12px',
          contents: [
            {
              type: 'text',
              text: `${context.record.meal} ${context.recordDisplayName}`,
              size: 'sm',
              weight: 'bold',
              wrap: true,
            },
            context.recordDetailLine ? {
              type: 'text',
              text: context.recordDetailLine,
              size: 'xs',
              color: '#231815',
              wrap: true,
            } : null,
            {
              type: 'text',
              text: buildMealKcalLine(context.record),
              size: 'xs',
              color: '#6b7280',
              wrap: true,
            },
          ].filter(Boolean),
        } : null,
        context.hasTarget ? {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              height: '10px',
              backgroundColor: '#D1D5DB',
              cornerRadius: '999px',
              contents: mealSegments.length
                ? mealSegments
                : [
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
              text: `${formatKcalDisplay_(context.total)} kcal`,
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
  const logs = summarizeFlexLogs_(context.logs || [], 6);
  const logContents = logs.length
    ? logs.map(log => ({
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        spacing: 'sm',
        paddingAll: '10px',
        backgroundColor: '#FDF5F2',
        cornerRadius: '10px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            width: '26px',
            height: '26px',
            cornerRadius: '999px',
            backgroundColor: getMealFlexColor_(log.meal),
            justifyContent: 'center',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: String(log.meal || '他').slice(0, 1),
                size: 'xxs',
                color: '#FFFFFF',
                weight: 'bold',
                align: 'center',
              },
            ],
          },
          {
            type: 'text',
            text: `${formatFlexLogKcal_(log)} ${log.menu}`,
            size: 'sm',
            wrap: true,
            color: '#231815',
            flex: 1,
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
              wrap: false,
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
    row: parsed.row,
    meal: parsed.meal,
    menu: parsed.menu,
    mealDate: parsed.mealDate,
    datePreset: parsed.datePreset,
  });
  const topCandidates = (draft && draft.candidates || []).slice(0, 3);
  const message = {
    type: 'flex',
    altText: `${parsed.menu} は未登録のため未記入ログとして保存しました。候補を採用するか画面で入力してください。`,
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
                text: 'いったん未記入のログとして保存しました。近い候補をタップするとこのログに採用して記録します。候補と違う場合は画面で内容を入力できます。',
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
  const detailLine = buildNutritionDescriptor_(candidate.flavor, candidate.unit);
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
        row: parsed.row,
        meal: parsed.meal,
        masterKey: candidate.masterKey,
        menu: candidate.name,
        mealDate: parsed.mealDate,
      }),
      displayText: `> ${parsed.meal} ${candidate.name} \nを記録しています...`,
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
            text: buildRecordDisplayName_(candidate),
            size: 'sm',
            weight: 'bold',
            wrap: true,
          },
          detailLine ? {
            type: 'text',
            text: detailLine,
            size: 'xs',
            color: '#231815',
            wrap: true,
          } : null,
          {
            type: 'text',
            text: `${candidate.kcal || '-'} kcal / 一致度 ${candidate.scorePercent}%`,
            size: 'xs',
            color: '#8a6258',
            wrap: true,
          },
        ].filter(Boolean),
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
                displayText: `> ${log.meal} ${log.menu} \nに画像を紐づけています...`,
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

function buildFlexMealSegments_(today, targetKcal, total) {
  const meals = today && today.meals ? today.meals : {};
  const base = Number(targetKcal || total || 0) > 0 ? Number(targetKcal || total || 0) : 1;
  return ['朝', '昼', '夜', 'その他']
    .map(meal => {
      const value = Number(meals[meal] || 0);
      if (!value) return null;
      return {
        type: 'box',
        layout: 'vertical',
        width: `${Math.max(2, Math.min((value / base) * 100, 100))}%`,
        height: '10px',
        backgroundColor: getMealFlexColor_(meal),
        contents: [],
      };
    })
    .filter(Boolean);
}

function summarizeFlexLogs_(logs, maxLines) {
  const items = Array.isArray(logs) ? logs.slice() : [];
  const grouped = {
    '朝': items.filter(log => log.meal === '朝'),
    '昼': items.filter(log => log.meal === '昼'),
    '夜': items.filter(log => log.meal === '夜'),
    'その他': items.filter(log => log.meal === 'その他'),
  };
  const order = ['朝', '昼', '夜', 'その他'].filter(meal => grouped[meal].length);
  const lines = [];
  order.forEach((meal, index) => {
    const group = grouped[meal];
    const remainingGroups = order.length - index - 1;
    const remainingSlots = Math.max(0, (maxLines || 6) - lines.length);
    if (!remainingSlots) return;
    const desiredLines = Math.min(2, group.length);
    const allowedLines = Math.max(1, Math.min(desiredLines, remainingSlots - remainingGroups));
    if (allowedLines === 1) {
      lines.push(buildCollapsedFlexLogLine_(meal, group));
      return;
    }
    lines.push(group[0]);
    if (group.length === 2) {
      lines.push(group[1]);
      return;
    }
    lines.push(buildCollapsedFlexLogLine_(meal, group.slice(1)));
  });
  return lines.slice(0, maxLines || 6);
}

function buildCollapsedFlexLogLine_(meal, logs) {
  const items = Array.isArray(logs) ? logs : [];
  const totalKcal = items.reduce((sum, item) => sum + Number(item.kcal || 0), 0);
  const first = items[0] || {};
  return {
    meal: meal,
    kcalStatus: items.some(item => item.kcalStatus === KCAL_STATUS.ESTIMATED) ? KCAL_STATUS.ESTIMATED : KCAL_STATUS.EXACT,
    kcal: totalKcal,
    menu: items.length > 1 ? `${first.menu || '記録'} 他${items.length - 1}件` : String(first.menu || ''),
  };
}
