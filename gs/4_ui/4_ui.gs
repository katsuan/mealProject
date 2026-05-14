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
  const targetPercentText = hasTarget ? formatPercentValue_(targetPercent) : null;
  const targetRatioLine = hasTarget ? `${total} / ${targetKcal} kcal` : '目標未設定';
  const targetRatioColor = isOverTarget ? '#C84949' : '#231815';
  const tone = getFlexTone_(isOverTarget ? 'warning' : (today.hasPending ? 'notice' : 'success'));
  const progressWidth = hasTarget ? `${Math.max(6, Math.min(targetPercent, 100))}%` : '0%';
  const logs = (dashboard.recentLogs || []).slice(0, 6);

  return {
    type: 'flex',
    altText: `${headline} 合計 ${total} kcal`,
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
          targetRatioLine: targetRatioLine,
          targetRatioColor: targetRatioColor,
          targetPercentText: targetPercentText,
          isOverTarget: isOverTarget,
          today: today,
          pendingLine: pendingLine,
          detailUrl: detailUrl,
        }),
        buildTodayLogBubble_({
          logs: logs,
          detailUrl: detailUrl,
          pendingLine: pendingLine,
        }),
      ],
    },
  };
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
              text: '目標比',
              flex: 2,
              size: 'sm',
              color: '#6b7280',
            },
            {
              type: 'text',
              text: context.targetRatioLine,
              flex: 4,
              size: 'sm',
              wrap: true,
              color: context.targetRatioColor,
              weight: context.isOverTarget ? 'bold' : 'regular',
            },
            context.hasTarget ? {
              type: 'text',
              text: `${context.targetPercentText}%`,
              flex: 2,
              align: 'end',
              size: 'lg',
              color: context.targetRatioColor,
              weight: 'bold',
            } : null,
          ].filter(Boolean),
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
              text: `P ${roundNutrition_(context.today.nutrition.protein)} / F ${roundNutrition_(context.today.nutrition.fat)} / C ${roundNutrition_(context.today.nutrition.carb)}`,
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
              text: context.pendingLine,
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
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '10px',
        backgroundColor: '#FDF5F2',
        cornerRadius: '10px',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: log.menu,
                flex: 5,
                size: 'sm',
                weight: 'bold',
                wrap: true,
                color: '#231815',
              },
              {
                type: 'text',
                text: log.meal,
                flex: 1,
                align: 'end',
                size: 'xs',
                color: '#8a6258',
              },
            ],
          },
          {
            type: 'text',
            text: `${buildMealKcalLine(log)} / ${formatFlexLogTime_(log.mealDate)}`,
            size: 'xs',
            wrap: true,
            color: '#6b7280',
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
            label: '入力とログを見る',
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

function buildMealInputPromptFlexMessage(parsed, draft) {
  const liffUrl = buildLiffUrl_({
    mode: 'detail',
    meal: parsed.meal,
    menu: parsed.menu,
    mealDate: parsed.mealDate,
    datePreset: parsed.datePreset,
  });
  const topCandidates = (draft && draft.candidates || []).slice(0, 3);
  const mealButtons = ['朝', '昼', '夜'].map(meal => buildSelectionButton_(meal, buildLiffUrl_({
    mode: 'detail',
    meal: meal,
    menu: parsed.menu,
    mealDate: parsed.mealDate,
    datePreset: parsed.datePreset,
  }), meal === parsed.meal));
  const dateButtons = [
    buildSelectionButton_('今日', buildLiffUrl_({
      mode: 'detail',
      meal: parsed.meal,
      menu: parsed.menu,
      mealDate: resolveMealDateByPreset_('today'),
      datePreset: 'today',
    }), parsed.datePreset !== 'yesterday'),
    buildSelectionButton_('昨日', buildLiffUrl_({
      mode: 'detail',
      meal: parsed.meal,
      menu: parsed.menu,
      mealDate: resolveMealDateByPreset_('yesterday'),
      datePreset: 'yesterday',
    }), parsed.datePreset === 'yesterday'),
  ];

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
                text: '近い候補をタップすると、その数値を採用してすぐ記録します。',
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
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: dateButtons,
              },
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                margin: 'sm',
                contents: mealButtons,
              },
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
              label: '数値を入力する',
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

function buildSelectionButton_(label, uri, isActive) {
  return {
    type: 'button',
    flex: 1,
    height: 'sm',
    style: 'secondary',
    color: isActive ? '#FDE2DA' : '#FDF5F2',
    action: {
      type: 'uri',
      label: label,
      uri: uri,
    },
  };
}

function roundNutrition_(value) {
  const number = Number(value || 0);
  return Math.round(number * 10) / 10;
}
