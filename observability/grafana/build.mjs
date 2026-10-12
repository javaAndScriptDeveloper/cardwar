#!/usr/bin/env node
// Generates the committed Grafana dashboards and alert rules.
//
//     node observability/grafana/build.mjs        (or: make dashboards-json)
//
// Writes cardwar-technical.json, cardwar-business.json, cardwar-logs.json and alerting/alert-rules.yaml next to this
// file. Never hand-edit those: build.test.mjs fails when they drift from this script, when a query names a metric
// missing from exported-metrics.txt, and when a query forgets job="cardwar".
//
// Design rules:
// - Datasources are the literal uids of the hosted Prometheus and Loki in Grafana Cloud; the local harness
//   provisions its own under the same uids, so one file renders in both places.
// - Every PromQL selector filters on job="cardwar" and every LogQL selector on app="cardwar": other projects share
//   the Grafana Cloud stack.
// - Counters are read with rate()/increase(), which handle the reset on every deploy. Gauges with max()/sum().
// - Every panel description states the question it answers. A panel without one is noise.
// - No dependencies: Node 24 standard library only, so CI runs it without an install step.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const JOB = 'job="cardwar"';
const DS = { type: 'prometheus', uid: 'grafanacloud-prom' };
const DS_LOGS = { type: 'loki', uid: 'grafanacloud-logs' };
const TAGS = ['cardwar'];
export const FOLDER_UID = 'cardwar';
export const FOLDER_TITLE = 'Cardwar';
export const RULE_GROUP = 'cardwar';
const RULE_LABELS = { app: 'cardwar' };

// ── PromQL introspection (used by the tests) ─────────────────────────────────

const PROMQL_KEYWORDS = new Set([
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'and',
  'or',
  'unless',
  'bool',
  'offset',
]);

/** Metric names in a PromQL expression: identifiers that are not functions, keywords, labels or durations. */
export function metricNamesIn(expr) {
  const stripped = expr
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[[^\]]*\]/g, '')
    // Drop grouping clauses whole, so `sum by (le) (x)` reads as the call `sum (x)`.
    .replace(/\b(by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/g, ' ');
  const names = new Set();
  for (const [, ident, call] of stripped.matchAll(/(?<![\w.$])([a-zA-Z_][a-zA-Z0-9_]*)(\s*\()?/g)) {
    if (!call && !PROMQL_KEYWORDS.has(ident)) names.add(ident);
  }
  return names;
}

// ── Panel helpers ────────────────────────────────────────────────────────────

/** Places panels left to right, wrapping at 24 columns; rows reset the cursor. */
class Grid {
  x = 0;
  y = 0;
  rowH = 0;

  place(w, h) {
    if (this.x + w > 24) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    const pos = { x: this.x, y: this.y, w, h };
    this.x += w;
    this.rowH = Math.max(this.rowH, h);
    return pos;
  }

  row() {
    if (this.x) this.y += this.rowH;
    this.x = 0;
    this.rowH = 0;
    const pos = { x: 0, y: this.y, w: 24, h: 1 };
    this.y += 1;
    return pos;
  }
}

const target = (expr, legendFormat = '', refId = 'A') => ({ datasource: DS, expr, legendFormat, refId });

const targets = (...pairs) => pairs.map(([expr, legend], i) => target(expr, legend, String.fromCharCode(65 + i)));

const thresholds = (...steps) => ({ mode: 'absolute', steps: steps.map(([color, value]) => ({ color, value })) });

const row = (g, title) => ({ type: 'row', title, collapsed: false, gridPos: g.row(), panels: [] });

function stat(g, title, description, expr, { unit = 'none', steps = [['blue', null]], decimals, w = 6, h = 4 } = {}) {
  const defaults = { unit, thresholds: thresholds(...steps), noValue: '–' };
  if (decimals !== undefined) defaults.decimals = decimals;
  return {
    type: 'stat',
    title,
    description,
    datasource: DS,
    gridPos: g.place(w, h),
    targets: [{ ...target(expr), instant: true, range: false }],
    fieldConfig: { defaults, overrides: [] },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      colorMode: 'value',
      graphMode: 'none',
      textMode: 'value',
      justifyMode: 'center',
    },
  };
}

function timeseries(g, title, description, tgts, { unit = 'short', stacked = false, bars = false, w = 12, h = 8 } = {}) {
  return {
    type: 'timeseries',
    title,
    description,
    datasource: DS,
    gridPos: g.place(w, h),
    targets: tgts,
    fieldConfig: {
      defaults: {
        unit,
        min: 0,
        custom: {
          drawStyle: bars ? 'bars' : 'line',
          lineWidth: 2,
          fillOpacity: stacked || bars ? 25 : 8,
          showPoints: 'never',
          spanNulls: false,
          stacking: { mode: stacked ? 'normal' : 'none', group: 'A' },
        },
      },
      overrides: [],
    },
    options: {
      legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
  };
}

function dashboard(uid, title, panels, { refresh = '1m', from = 'now-6h', variables = [] } = {}) {
  // Grafana renders nothing for a panel without a unique id.
  panels.forEach((panel, i) => {
    panel.id = i + 1;
  });
  return {
    uid,
    title,
    tags: TAGS,
    timezone: 'browser',
    editable: true,
    graphTooltip: 1,
    refresh,
    schemaVersion: 39,
    version: 1,
    time: { from, to: 'now' },
    templating: { list: variables },
    annotations: { list: [] },
    panels,
  };
}

// ── Technical: is the service healthy? ───────────────────────────────────────

const HTTP = 'http_server_requests_seconds';

function technical() {
  const g = new Grid();
  const ratio5xx = (range) =>
    `sum(rate(${HTTP}_count{${JOB},status=~"5.."}[${range}])) / sum(rate(${HTTP}_count{${JOB}}[${range}]))`;
  const p = [
    row(g, 'Service'),
    stat(g, 'Up', 'Is at least one app instance answering scrapes right now?', `max(up{${JOB}})`, {
      steps: [
        ['red', null],
        ['green', 1],
      ],
      decimals: 0,
    }),
    stat(g, 'Requests/s', 'How much HTTP traffic is the app serving now?', `sum(rate(${HTTP}_count{${JOB}}[5m]))`, {
      unit: 'reqps',
      decimals: 2,
    }),
    stat(g, '5xx ratio (5m)', 'What share of requests failed on the server in the last 5 minutes?', ratio5xx('5m'), {
      unit: 'percentunit',
      steps: [
        ['green', null],
        ['orange', 0.01],
        ['red', 0.05],
      ],
      decimals: 2,
    }),
    stat(
      g,
      'p95 latency (5m)',
      'How long do the slowest 5% of requests take across all routes?',
      `histogram_quantile(0.95, sum by (le) (rate(${HTTP}_bucket{${JOB}}[5m])))`,
      {
        unit: 's',
        steps: [
          ['green', null],
          ['orange', 0.5],
          ['red', 1],
        ],
        decimals: 3,
      },
    ),

    row(g, 'HTTP'),
    timeseries(
      g,
      'Requests by route and status class',
      'Which routes carry the traffic, and which of them answer with client or server errors? (uri is the route template, never a raw path.)',
      targets([
        `sum by (uri, outcome) (rate(${HTTP}_count{${JOB}}[$__rate_interval]))`,
        '{{uri}} {{outcome}}',
      ]),
      { unit: 'reqps' },
    ),
    timeseries(
      g,
      'p95 latency by route',
      'Which route got slow? Long-lived SSE streams show their stream duration here, not a slowdown.',
      targets([
        `histogram_quantile(0.95, sum by (le, uri) (rate(${HTTP}_bucket{${JOB}}[$__rate_interval])))`,
        '{{uri}}',
      ]),
      { unit: 's' },
    ),
    timeseries(
      g,
      '5xx ratio',
      'Is the server failing a growing share of requests? The HighErrorRate alert fires above 5%.',
      targets([ratio5xx('$__rate_interval'), '5xx']),
      { unit: 'percentunit', w: 24, h: 6 },
    ),

    row(g, 'JVM and pools'),
    timeseries(
      g,
      'Heap used by pool',
      'Is the heap growing without coming back down after GC (a leak), or close to the container limit?',
      targets([`sum by (id) (jvm_memory_used_bytes{${JOB},area="heap"})`, '{{id}}']),
      { unit: 'bytes', stacked: true, w: 8 },
    ),
    timeseries(
      g,
      'Process CPU',
      'How busy is the app process? Sustained near 100% means requests queue.',
      targets([`max(process_cpu_usage{${JOB}})`, 'cpu']),
      { unit: 'percentunit', w: 8 },
    ),
    timeseries(
      g,
      'Hikari connections',
      'Are database connections exhausted? Pending above zero means requests wait for a connection.',
      targets(
        [`max by (pool) (hikaricp_connections_active{${JOB}})`, 'active {{pool}}'],
        [`max by (pool) (hikaricp_connections_pending{${JOB}})`, 'pending {{pool}}'],
      ),
      { w: 8 },
    ),

    row(g, 'Live game plumbing'),
    timeseries(
      g,
      'SSE streams open',
      'How many players hold a live turn-update stream? Zero while duels are being played means updates are not reaching anyone.',
      targets([`sum(cardwar_sse_streams_open{${JOB}})`, 'streams']),
    ),
    timeseries(
      g,
      'Telegram bot updates by outcome',
      'Is the bot webhook handling updates, and are any failing?',
      targets([`sum by (outcome) (rate(cardwar_bot_updates_total{${JOB}}[$__rate_interval]))`, '{{outcome}}']),
      { unit: 'reqps', stacked: true },
    ),
  ];
  return dashboard('cardwar-technical', 'Cardwar — Technical', p);
}

// ── Business: do people play? ────────────────────────────────────────────────

function business() {
  const g = new Grid();
  const inc = (metric, extra = '') => `increase(${metric}{${JOB}${extra}}[$__rate_interval])`;
  const conversion = (range) =>
    `sum(increase(cardwar_invites_total{${JOB},event="accepted"}[${range}])) / sum(increase(cardwar_invites_total{${JOB},event="created"}[${range}]))`;
  const p = [
    row(g, 'In the selected range'),
    stat(g, 'Sign-ins', 'How many sign-ins happened in the selected time range?', `sum(increase(cardwar_signins_total{${JOB}}[$__range]))`, {
      decimals: 0,
    }),
    stat(g, 'Duels started', 'How many duels began in the selected time range?', `sum(increase(cardwar_duels_started_total{${JOB}}[$__range]))`, {
      decimals: 0,
    }),
    stat(g, 'Duels finished', 'How many duels reached a result in the selected time range?', `sum(increase(cardwar_duels_finished_total{${JOB}}[$__range]))`, {
      decimals: 0,
    }),
    stat(g, 'Invite conversion', 'What share of created invites did a friend accept in the selected range?', conversion('$__range'), {
      unit: 'percentunit',
      decimals: 0,
    }),

    row(g, 'Players and duels'),
    timeseries(
      g,
      'Sign-ins by method',
      'Are people coming back, and through Telegram or another sign-in method?',
      targets([`sum by (method) (${inc('cardwar_signins_total')})`, '{{method}}']),
      { bars: true, stacked: true },
    ),
    timeseries(
      g,
      'Duels started by mode',
      'How many duels start, and in which mode?',
      targets([`sum by (mode) (${inc('cardwar_duels_started_total')})`, '{{mode}}']),
      { bars: true, stacked: true },
    ),
    timeseries(
      g,
      'Duels finished by result and reason',
      'Do duels end normally, or are many abandoned or forfeited? Compare with duels started to see drop-off.',
      targets([`sum by (result, reason) (${inc('cardwar_duels_finished_total')})`, '{{result}} {{reason}}']),
      { bars: true, stacked: true },
    ),
    timeseries(
      g,
      'Moves by type and outcome',
      'How actively is the game played, and how often is a move rejected (rule broken, or a lost race)?',
      targets([`sum by (type, outcome) (rate(cardwar_moves_total{${JOB}}[$__rate_interval]))`, '{{type}} {{outcome}}']),
      { unit: 'ops' },
    ),

    row(g, 'Invites'),
    timeseries(
      g,
      'Invites by event',
      'How many invites are created, accepted or left to expire?',
      targets([`sum by (event) (${inc('cardwar_invites_total')})`, '{{event}}']),
      { bars: true, stacked: true },
    ),
    timeseries(
      g,
      'Invite conversion (1d window)',
      'Of the invites created over the last day, what share did a friend accept? A drop points at the deep link or the bot.',
      targets([conversion('1d'), 'accepted / created']),
      { unit: 'percentunit' },
    ),
  ];
  return dashboard('cardwar-business', 'Cardwar — Business', p, { refresh: '5m', from: 'now-7d' });
}

// ── Logs: what happened to this request? ─────────────────────────────────────

const logsTarget = (expr, legendFormat) => ({
  datasource: DS_LOGS,
  expr,
  refId: 'A',
  ...(legendFormat ? { legendFormat } : {}),
});

function logsPanel(g, title, description, expr, { w = 24, h = 12 } = {}) {
  return {
    type: 'logs',
    title,
    description,
    datasource: DS_LOGS,
    gridPos: g.place(w, h),
    options: {
      showTime: true,
      wrapLogMessage: true,
      sortOrder: 'Descending',
      enableLogDetails: true,
      prettifyLogMessage: false,
    },
    targets: [logsTarget(expr)],
  };
}

function logsTimeseries(g, title, description, expr, legend, { w = 12, h = 8 } = {}) {
  return {
    type: 'timeseries',
    title,
    description,
    datasource: DS_LOGS,
    gridPos: g.place(w, h),
    fieldConfig: { defaults: { custom: { drawStyle: 'bars', fillOpacity: 60, stacking: { mode: 'normal', group: 'A' } } }, overrides: [] },
    options: {
      legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
    targets: [logsTarget(expr, legend)],
  };
}

const textbox = (name, label) => ({ type: 'textbox', name, label, query: '', current: { text: '', value: '' } });

function logs() {
  const g = new Grid();
  const p = [
    logsTimeseries(
      g,
      'Log volume by level',
      'Is the app suddenly logging far more than usual, or more warnings and errors?',
      'sum by (level) (count_over_time({app="cardwar", service="app"} [$__auto]))',
      '{{level}}',
    ),
    logsTimeseries(
      g,
      'Error lines by service',
      'Which container is logging errors, and since when?',
      'sum by (service) (count_over_time({app="cardwar", level="ERROR"} [$__auto]))',
      '{{service}}',
    ),
    logsPanel(
      g,
      'Errors',
      'What exactly failed? Every ERROR line with its stack trace; copy its requestId into the box above to see the whole request.',
      '{app="cardwar", level="ERROR"}',
      { h: 8 },
    ),
    logsPanel(
      g,
      'App log (filter by requestId and text)',
      'What did the app do for this request or this search text? Both boxes empty shows everything; the requestId comes from the X-Request-Id response header.',
      '{app="cardwar", service="app"} | json | requestId=~"$requestId.*" |~ "(?i)$search"',
      { h: 14 },
    ),
  ];
  return dashboard('cardwar-logs', 'Cardwar — Logs', p, {
    refresh: '',
    from: 'now-1h',
    variables: [textbox('requestId', 'requestId'), textbox('search', 'search text')],
  });
}

// ── Alert rules ──────────────────────────────────────────────────────────────

// A rule fires when its query returns a value > 0. A comparison whose true value can be 0 uses `bool`, so the
// result is exactly 0 or 1 and NoData means what it should: no series at all.
const RULES = [
  {
    uid: 'cardwar-service-down',
    title: 'ServiceDown',
    expr: `max(up{${JOB}}) < bool 1`,
    for: '3m',
    // No scrape at all (the app or Alloy died) IS the outage.
    noDataState: 'Alerting',
    summary: 'Cardwar is not answering metric scrapes, or nothing is pushing its metrics.',
  },
  {
    uid: 'cardwar-high-error-rate',
    title: 'HighErrorRate',
    expr:
      `(sum(rate(${HTTP}_count{${JOB},status=~"5.."}[10m])) / sum(rate(${HTTP}_count{${JOB}}[10m])) > 0.05)` +
      ` and (sum(increase(${HTTP}_count{${JOB}}[10m])) > 20)`,
    for: '5m',
    noDataState: 'OK',
    summary: 'More than 5% of Cardwar requests failed with 5xx over the last 10 minutes.',
  },
  {
    uid: 'cardwar-bot-updates-failing',
    title: 'BotUpdatesFailing',
    expr: `sum(rate(cardwar_bot_updates_total{${JOB},outcome="failed"}[5m])) > 0`,
    for: '10m',
    noDataState: 'OK',
    summary: 'The Telegram bot webhook has been failing updates for 10 minutes: invites and the Play button may not work.',
  },
];

/** The rules in the provisioning-API shape push.mjs sends; the YAML file wraps the same objects. */
export function alertRules() {
  return RULES.map((r) => ({
    uid: r.uid,
    title: r.title,
    condition: 'B',
    data: [
      {
        refId: 'A',
        relativeTimeRange: { from: 600, to: 0 },
        datasourceUid: DS.uid,
        model: { refId: 'A', expr: r.expr, instant: true, intervalMs: 1000, maxDataPoints: 43200 },
      },
      {
        refId: 'B',
        datasourceUid: '__expr__',
        model: {
          refId: 'B',
          type: 'threshold',
          expression: 'A',
          conditions: [{ evaluator: { type: 'gt', params: [0] } }],
        },
      },
    ],
    for: r.for,
    noDataState: r.noDataState,
    execErrState: 'Error',
    labels: { ...RULE_LABELS },
    annotations: { summary: r.summary },
  }));
}

// ── Output ───────────────────────────────────────────────────────────────────

/** Minimal YAML emitter: strings are JSON-quoted, which YAML reads as double-quoted scalars. */
function toYaml(value, indent = '') {
  const scalar = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  const nested = (v) => v !== null && typeof v === 'object';
  if (Array.isArray(value)) {
    if (!value.length) return ' []';
    return value
      .map((item) =>
        nested(item) ? `\n${indent}- ${toYaml(item, indent + '  ').replace(/^\n\s*/, '')}` : `\n${indent}- ${scalar(item)}`,
      )
      .join('');
  }
  const keys = Object.keys(value);
  if (!keys.length) return ' {}';
  return keys
    .map((k) => `\n${indent}${k}:${nested(value[k]) ? toYaml(value[k], indent + '  ') : ` ${scalar(value[k])}`}`)
    .join('');
}

function alertingYaml() {
  const doc = {
    apiVersion: 1,
    groups: [{ orgId: 1, name: RULE_GROUP, folder: FOLDER_TITLE, interval: '1m', rules: alertRules() }],
  };
  return '# Generated by observability/grafana/build.mjs; do not edit.' + toYaml(doc) + '\n';
}

export const DASHBOARDS = ['cardwar-technical', 'cardwar-business', 'cardwar-logs'];

/** Every generated file, keyed by its path relative to this directory. */
export function generate() {
  const files = {};
  for (const dash of [technical(), business(), logs()]) {
    files[`${dash.uid}.json`] = JSON.stringify(dash, null, 2) + '\n';
  }
  files['alerting/alert-rules.yaml'] = alertingYaml();
  return files;
}

/** Every PromQL expression in the dashboards and alert rules. */
export function promExpressions() {
  const exprs = [];
  for (const dash of [technical(), business(), logs()]) {
    for (const panel of dash.panels) {
      for (const t of panel.targets ?? []) if (t.datasource.uid === DS.uid) exprs.push(t.expr);
    }
  }
  for (const rule of alertRules()) exprs.push(rule.data[0].model.expr);
  return exprs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, content] of Object.entries(generate())) {
    const path = join(HERE, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log('wrote', `observability/grafana/${name}`);
  }
}
