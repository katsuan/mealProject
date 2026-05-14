/**
 * User-facing message builders.
 */

function buildLogReply(userId, record) {
  const summary = getTodaySummary(userId);
  const total = summary.totalExact + summary.totalEstimated;
  const estimatedNote = summary.totalEstimated > 0
    ? `推定 ${summary.totalEstimated} kcal を含みます`
    : '';

  return [
    '記録しました',
    `${record.meal}: ${record.menu}`,
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
  return `${userId} の目標カロリーを ${kcal} kcal に更新しました`;
}

function buildDailySummaryFlexMessage(userId, options) {
  const context = options || {};
  const dashboard = context.dashboard || getDashboardData(userId);
  const today = dashboard.today;
  const total = Number(today.totalExact || 0) + Number(today.totalEstimated || 0);
  const detailUrl = dashboard.detailUrl || buildLiffUrl_({ mode: 'detail' });
  const headline = context.headline || '今日の集計';
  const subline = context.subline || buildKcalDiffLine_(userId, total);
  const recordedLine = context.record
    ? `${context.record.meal} ${context.record.menu} / ${buildMealKcalLine(context.record)}`
    : '';
  const pendingLine = today.hasPending
    ? `未登録 ${today.pendingItems.length}件`
    : '未登録なし';

  return {
    type: 'flex',
    altText: `${headline} 合計 ${total} kcal`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: headline,
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: subline,
            size: 'sm',
            color: '#6b7280',
            wrap: true,
          },
          recordedLine ? {
            type: 'box',
            layout: 'vertical',
            cornerRadius: '12px',
            backgroundColor: '#F3F4F6',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: recordedLine,
                size: 'sm',
                wrap: true,
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
                text: `${total} kcal`,
                flex: 5,
                size: 'xl',
                weight: 'bold',
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
                text: 'PFC',
                flex: 2,
                size: 'sm',
                color: '#6b7280',
              },
              {
                type: 'text',
                text: `P ${roundNutrition_(today.nutrition.protein)} / F ${roundNutrition_(today.nutrition.fat)} / C ${roundNutrition_(today.nutrition.carb)}`,
                flex: 5,
                size: 'sm',
                wrap: true,
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
                text: '状態',
                flex: 2,
                size: 'sm',
                color: '#6b7280',
              },
              {
                type: 'text',
                text: pendingLine,
                flex: 5,
                size: 'sm',
                wrap: true,
              },
            ],
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
            style: 'primary',
            action: {
              type: 'uri',
              label: '詳細をLIFFで開く',
              uri: detailUrl,
            },
          },
        ],
      },
    },
  };
}

function buildMealInputPromptFlexMessage(parsed, draft) {
  const liffUrl = buildLiffUrl_({
    mode: 'detail',
    meal: parsed.meal,
    menu: parsed.menu,
  });
  const topCandidates = (draft && draft.candidates || []).slice(0, 3);
  const candidateLines = topCandidates.length
    ? topCandidates.map(item => `・${item.name} (${item.kcal || '-'} kcal, ${item.scorePercent}%)`).join('\n')
    : '候補なし';

  return {
    type: 'flex',
    altText: `${parsed.menu} は未登録です。LIFFで入力してください。`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '未登録メニュー',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: `${parsed.meal} ${parsed.menu}`,
            wrap: true,
            size: 'md',
          },
          {
            type: 'text',
            text: 'DBにないので、LIFFで数値を補完してください。',
            wrap: true,
            size: 'sm',
            color: '#6b7280',
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
              },
              {
                type: 'text',
                text: candidateLines,
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
            style: 'primary',
            action: {
              type: 'uri',
              label: 'LIFFで入力する',
              uri: liffUrl,
            },
          },
        ],
      },
    },
  };
}

function roundNutrition_(value) {
  const number = Number(value || 0);
  return Math.round(number * 10) / 10;
}
