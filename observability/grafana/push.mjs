#!/usr/bin/env node
// Pushes the committed dashboards and alerting to Grafana Cloud.
//
//     node observability/grafana/push.mjs dashboards   # folder + three dashboards   (make dashboards)
//     node observability/grafana/push.mjs alerting     # contact point + policy route + rule group   (make alerting)
//     node observability/grafana/push.mjs all
//
// Reads GRAFANA_URL, GRAFANA_API_TOKEN and, for alerting, TELEGRAM_BOT_TOKEN and GRAFANA_ALERT_CHAT_ID from the
// environment (the Makefile sources .env). Touches only cardwar-owned objects: the folder `cardwar`, its three
// dashboards, the contact point `cardwar-telegram`, the one notification-policy route that sends to it, and the rule
// group `cardwar`. Other projects share the Grafana Cloud stack; nothing of theirs is listed, edited or deleted.
// Tokens are never printed, not even in error output.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DASHBOARDS, FOLDER_TITLE, FOLDER_UID, RULE_GROUP, alertRules } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTACT_POINT = 'cardwar-telegram';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function env(name) {
  const value = (process.env[name] ?? '').trim();
  if (!value) fail(`${name} is empty: set it in .env (see docs/observability.md)`);
  return value;
}

/** Strips anything secret-looking out of a response before it is shown. */
function redact(body) {
  let text = typeof body === 'string' ? body : JSON.stringify(body);
  for (const name of ['GRAFANA_API_TOKEN', 'TELEGRAM_BOT_TOKEN']) {
    const secret = (process.env[name] ?? '').trim();
    if (secret) text = text.split(secret).join('***');
  }
  return text?.slice(0, 500);
}

async function call(method, path, body) {
  const res = await fetch(env('GRAFANA_URL').replace(/\/+$/, '') + path, {
    method,
    headers: {
      Authorization: `Bearer ${env('GRAFANA_API_TOKEN')}`,
      'Content-Type': 'application/json',
      // Pushed objects stay editable in the UI, so thresholds can be tuned there.
      'X-Disable-Provenance': 'true',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON: keep the text for the error message.
  }
  return { status: res.status, body: parsed };
}

async function ensureFolder() {
  const existing = await call('GET', `/api/folders/${FOLDER_UID}`);
  if (existing.status === 200) {
    if (existing.body.title !== FOLDER_TITLE) {
      fail(`folder uid ${FOLDER_UID} exists with title "${existing.body.title}"; refusing to touch it`);
    }
    return;
  }
  const created = await call('POST', '/api/folders', { uid: FOLDER_UID, title: FOLDER_TITLE });
  if (![200, 201].includes(created.status)) fail(`could not create folder: ${created.status} ${redact(created.body)}`);
  console.log('created folder', FOLDER_TITLE);
}

async function pushDashboards() {
  await ensureFolder();
  for (const name of DASHBOARDS) {
    const dashboard = JSON.parse(readFileSync(join(HERE, `${name}.json`), 'utf8'));
    dashboard.id = null;
    const res = await call('POST', '/api/dashboards/db', {
      dashboard,
      folderUid: FOLDER_UID,
      overwrite: true,
      message: 'push.mjs',
    });
    if (res.status !== 200) fail(`dashboard ${name}: ${res.status} ${redact(res.body)}`);
    console.log('pushed', res.body.url);
  }
}

async function pushContactPoint() {
  const contactPoint = {
    name: CONTACT_POINT,
    type: 'telegram',
    settings: {
      bottoken: env('TELEGRAM_BOT_TOKEN'),
      chatid: env('GRAFANA_ALERT_CHAT_ID'),
      parse_mode: 'HTML',
    },
    disableResolveMessage: false,
  };
  const existing = await call('GET', `/api/v1/provisioning/contact-points?name=${CONTACT_POINT}`);
  const uid = existing.status === 200 && existing.body?.length ? existing.body[0].uid : null;
  const res = uid
    ? await call('PUT', `/api/v1/provisioning/contact-points/${uid}`, { ...contactPoint, uid })
    : await call('POST', '/api/v1/provisioning/contact-points', contactPoint);
  if (![200, 201, 202].includes(res.status)) fail(`contact point: ${res.status} ${redact(res.body)}`);
  console.log('contact point', CONTACT_POINT, 'ok');
}

async function pushPolicyRoute() {
  // Read-modify-write the policy tree: keep every existing route, replace only ours.
  const policy = await call('GET', '/api/v1/provisioning/policies');
  if (policy.status !== 200) fail(`read policy tree: ${policy.status} ${redact(policy.body)}`);
  const routes = (policy.body.routes ?? []).filter((r) => r.receiver !== CONTACT_POINT);
  routes.push({
    receiver: CONTACT_POINT,
    object_matchers: [['app', '=', 'cardwar']],
    group_by: ['alertname'],
    group_wait: '30s',
    group_interval: '5m',
    repeat_interval: '4h',
  });
  const res = await call('PUT', '/api/v1/provisioning/policies', { ...policy.body, routes });
  if (![200, 202].includes(res.status)) fail(`policy: ${res.status} ${redact(res.body)}`);
  console.log('policy route ok');
}

async function pushRules() {
  const rules = alertRules().map((rule) => ({ ...rule, folderUID: FOLDER_UID, ruleGroup: RULE_GROUP, orgID: 1 }));
  for (const rule of rules) {
    let res = await call('PUT', `/api/v1/provisioning/alert-rules/${rule.uid}`, rule);
    if (res.status === 404) res = await call('POST', '/api/v1/provisioning/alert-rules', rule);
    if (![200, 201].includes(res.status)) fail(`rule ${rule.title}: ${res.status} ${redact(res.body)}`);
    console.log('rule', rule.title, 'ok');
  }
  const res = await call('PUT', `/api/v1/provisioning/folder/${FOLDER_UID}/rule-groups/${RULE_GROUP}`, {
    title: RULE_GROUP,
    folderUid: FOLDER_UID,
    interval: 60,
    rules,
  });
  if (![200, 202].includes(res.status)) {
    // The rules already exist; only the group interval failed to apply.
    console.log(`warning: could not set the group interval (${res.status} ${redact(res.body)}); it stays as it was`);
  } else {
    console.log('rule group', RULE_GROUP, 'interval 1m');
  }
}

async function pushAlerting() {
  await ensureFolder();
  await pushContactPoint();
  await pushPolicyRoute();
  await pushRules();
}

const what = process.argv[2] ?? 'all';
if (!['dashboards', 'alerting', 'all'].includes(what)) fail('usage: push.mjs dashboards|alerting|all');
if (what !== 'alerting') await pushDashboards();
if (what !== 'dashboards') await pushAlerting();
