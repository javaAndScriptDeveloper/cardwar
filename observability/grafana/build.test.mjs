// Guards the generated Grafana assets: run with `node --test observability/grafana/build.test.mjs`.
//
// The committed JSON/YAML is what `make dashboards` / `make alerting` push and what the local Grafana loads, so it
// must be exactly what build.mjs generates, and every query must name a metric the app really exports: a renamed
// counter otherwise shows up as an empty panel nobody notices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generate, promExpressions, metricNamesIn, JOB } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const exported = new Set(
  readFileSync(join(HERE, 'exported-metrics.txt'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean),
);

test('the committed files are exactly what the generator produces', () => {
  const files = generate();
  assert.deepEqual(Object.keys(files).sort(), [
    'alerting/alert-rules.yaml',
    'cardwar-business.json',
    'cardwar-logs.json',
    'cardwar-technical.json',
  ]);
  for (const [name, content] of Object.entries(files)) {
    assert.equal(readFileSync(join(HERE, name), 'utf8'), content, `${name} is stale: run make dashboards-json`);
  }
});

test('every PromQL expression names only metrics the app exports', () => {
  const exprs = promExpressions();
  assert.ok(exprs.length > 20, 'expected the dashboards and alerts to hold PromQL');
  for (const expr of exprs) {
    const names = metricNamesIn(expr);
    assert.ok(names.size > 0, `no metric found in ${expr}`);
    for (const name of names) {
      assert.ok(exported.has(name), `${name} (in ${expr}) is not in exported-metrics.txt`);
    }
  }
});

test('every PromQL expression filters on the cardwar job', () => {
  for (const expr of promExpressions()) {
    assert.ok(expr.includes(JOB), `missing ${JOB}: ${expr}`);
    // Each selector, not just one of them: another project's series share the Grafana Cloud stack.
    const selectors = [...expr.matchAll(/\b([a-z_][a-z0-9_]*)\s*\{([^}]*)\}/g)];
    for (const [, name, labels] of selectors) {
      assert.ok(labels.includes(JOB), `${name} selector lacks ${JOB} in ${expr}`);
    }
  }
});

test('the metric-name extractor ignores functions, keywords, labels and ranges', () => {
  const expr =
    'histogram_quantile(0.95, sum by (le, uri) (rate(http_server_requests_seconds_bucket{job="cardwar",status=~"5.."}[$__rate_interval])))' +
    ' / ignoring(uri) group_left max(up{job="cardwar"}) > bool 0';
  assert.deepEqual([...metricNamesIn(expr)].sort(), ['http_server_requests_seconds_bucket', 'up']);
});

test('every dashboard panel states its question and uses a Grafana Cloud datasource uid', () => {
  const files = generate();
  for (const name of ['cardwar-technical.json', 'cardwar-business.json', 'cardwar-logs.json']) {
    const dash = JSON.parse(files[name]);
    assert.equal(dash.uid, name.replace('.json', ''));
    for (const panel of dash.panels.filter((p) => p.type !== 'row')) {
      assert.ok(panel.description?.length > 10, `${name}: panel "${panel.title}" has no description`);
      assert.ok(['grafanacloud-prom', 'grafanacloud-logs'].includes(panel.datasource.uid), panel.title);
      for (const target of panel.targets) {
        if (target.datasource.uid === 'grafanacloud-logs') {
          assert.match(target.expr, /\{app="cardwar"/, `${panel.title}: logs query must select app="cardwar"`);
        }
      }
    }
  }
});
