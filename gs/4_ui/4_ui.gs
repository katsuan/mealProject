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
  return `目標カロリーを ${kcal} kcal に更新しました`;
}

function buildDailySummaryFlexMessage(userId, options) {
  const context = options || {};
  const dashboard = context.dashboard || getDashboardData(userId);
  const today = dashboard.today;
  const total = Number(today.totalExact || 0) + Number(today.totalEstimated || 0);
  const targetKcal = Number(dashboard.user && dashboard.user.calorieTarget || 0);
  const hasTarget = targetKcal > 0;
  const targetPercent = hasTarget ? Math.round((total / targetKcal) * 100) : null;
  const isOverTarget = hasTarget && total > targetKcal;
  const detailUrl = dashboard.detailUrl || buildLiffUrl_({ mode: 'detail' });
  const headline = context.headline || '今日の集計';
  const subline = context.subline || buildKcalDiffLine_(userId, total);
  const sublineColor = isOverTarget ? '#C84949' : '#6b7280';
  const recordedLine = context.record
    ? `${context.record.meal} ${context.record.menu} / ${buildMealKcalLine(context.record)}`
    : '';
  const pendingLine = today.hasPending
    ? `未登録 ${today.pendingItems.length}件`
    : '未登録なし';
  const totalColor = isOverTarget ? '#C84949' : '#231815';
  const targetRatioLine = hasTarget ? `${targetPercent}% (${total} / ${targetKcal} kcal)` : '目標未設定';
  const targetRatioColor = isOverTarget ? '#C84949' : '#231815';

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
            color: sublineColor,
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
                color: totalColor,
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
              {
                type: 'text',
                text: targetRatioLine,
                flex: 5,
                size: 'sm',
                wrap: true,
                color: targetRatioColor,
                weight: isOverTarget ? 'bold' : 'regular',
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
            style: 'secondary',
            color: '#FDF5F2',
            action: {
              type: 'uri',
              label: '詳細を見る',
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

  return {
    type: 'flex',
    altText: `${parsed.menu} は未登録です。入力してください。`,
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
            text: 'DBにないので、数値を入力してください。',
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
              label: '入力する',
              uri: liffUrl,
            },
          },
        ],
      },
    },
  };
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
      label: `${candidate.name} を記録`,
      data: buildQueryString_({
        action: 'logCandidate',
        meal: parsed.meal,
        masterKey: candidate.masterKey,
        menu: candidate.name,
      }),
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
            text: `${candidate.kcal || '-'} kcal / ${candidate.scorePercent}%`,
            size: 'xs',
            color: '#8a6258',
            wrap: true,
          },
        ],
      },
      {
        type: 'text',
        text: '記録',
        size: 'xs',
        weight: 'bold',
        color: '#B8462C',
        flex: 0,
      },
    ],
  };
}

function roundNutrition_(value) {
  const number = Number(value || 0);
  return Math.round(number * 10) / 10;
}
