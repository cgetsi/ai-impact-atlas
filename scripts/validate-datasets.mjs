#!/usr/bin/env node
/**
 * Strict schema & anti-hype validator for AI Impact Atlas datasets.
 * Zero external dependencies (Node 18+). Exits with code 1 on any error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const VALID_DOMAINS = new Set(['medicine', 'math', 'science', 'accessibility']);
const VALID_TIERS = new Set(['verified', 'trial', 'milestone']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function readJson(relPath) {
  const full = path.join(rootDir, relPath);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

function validateBreakthroughs() {
  const data = readJson('data/breakthroughs.json');
  assert(data.meta && ISO_DATE_RE.test(data.meta.updatedAt || ''), 'breakthroughs.meta.updatedAt must be YYYY-MM-DD');
  assert(Array.isArray(data.events) && data.events.length > 0, 'breakthroughs.events must be a non-empty array');

  const seenIds = new Set();
  for (const ev of data.events || []) {
    const tag = `event[${ev.id || 'missing-id'}]`;
    assert(typeof ev.id === 'string' && /^[a-z0-9-]+$/.test(ev.id), `${tag}: id must be lowercase alphanumeric + hyphens`);
    assert(!seenIds.has(ev.id), `${tag}: duplicate event id`);
    seenIds.add(ev.id);

    assert(ISO_DATE_RE.test(ev.date || ''), `${tag}: date must be YYYY-MM-DD`);
    assert(VALID_DOMAINS.has(ev.domain), `${tag}: invalid domain "${ev.domain}"`);
    assert(typeof ev.title === 'string' && ev.title.length >= 8, `${tag}: title too short`);
    assert(typeof ev.shortLabel === 'string' && ev.shortLabel.length > 0 && ev.shortLabel.length <= 40, `${tag}: shortLabel must be 1–40 chars`);
    if (ev.plainHeadline !== undefined) {
      assert(typeof ev.plainHeadline === 'string' && ev.plainHeadline.length >= 10 && ev.plainHeadline.length <= 90, `${tag}: plainHeadline must be 10–90 chars`);
    }
    if (ev.bigStat !== undefined) {
      assert(ev.bigStat && typeof ev.bigStat.value === 'string' && ev.bigStat.value.length > 0 && ev.bigStat.value.length <= 10, `${tag}: bigStat.value must be 1–10 chars`);
      assert(typeof ev.bigStat.label === 'string' && ev.bigStat.label.length > 0 && ev.bigStat.label.length <= 40, `${tag}: bigStat.label must be 1–40 chars`);
    }
    assert(typeof ev.organization === 'string' && ev.organization.length > 1, `${tag}: organization required`);
    assert(Number.isInteger(ev.impactScore) && ev.impactScore >= 1 && ev.impactScore <= 5, `${tag}: impactScore must be integer 1..5`);
    assert(VALID_TIERS.has(ev.verificationTier), `${tag}: invalid verificationTier "${ev.verificationTier}"`);
    assert(typeof ev.verificationLabel === 'string' && ev.verificationLabel.length > 2, `${tag}: verificationLabel required`);
    assert(typeof ev.summary === 'string' && ev.summary.length >= 30, `${tag}: summary must be >= 30 chars`);
    assert(typeof ev.whyItMatters === 'string' && ev.whyItMatters.length >= 20, `${tag}: whyItMatters required`);
    assert(typeof ev.caveats === 'string' && ev.caveats.length >= 20, `${tag}: honest caveats required (anti-hype policy)`);
    assert(Array.isArray(ev.metrics) && ev.metrics.length >= 1, `${tag}: at least 1 quantitative metric required`);
    assert(Array.isArray(ev.sources) && ev.sources.length >= 1, `${tag}: at least 1 primary source required`);

    for (const src of ev.sources || []) {
      assert(typeof src.label === 'string' && src.label.length > 2, `${tag}: source label missing`);
      assert(typeof src.url === 'string' && src.url.startsWith('https://'), `${tag}: source URL must start with https://`);
      assert(typeof src.publisher === 'string' && src.publisher.length > 1, `${tag}: source publisher missing`);
    }
  }

  assert(Array.isArray(data.openMathProblems) && data.openMathProblems.length > 0, 'openMathProblems must be non-empty');
  assert(data.clinicalPipeline && Array.isArray(data.clinicalPipeline.fdaAnnualDevices), 'clinicalPipeline.fdaAnnualDevices required');
  assert(data.clinicalPipeline && Array.isArray(data.clinicalPipeline.trackedDrugs), 'clinicalPipeline.trackedDrugs required');

  console.log(`✓ Validated breakthroughs.json (${data.events.length} events, ${data.openMathProblems.length} open math trackers, ${data.clinicalPipeline.trackedDrugs.length} tracked drugs)`);
}

function validateScaling() {
  const data = readJson('data/ai-scaling.json');
  assert(data.meta && ISO_DATE_RE.test(data.meta.updatedAt || ''), 'ai-scaling.meta.updatedAt must be YYYY-MM-DD');
  assert(Array.isArray(data.costDecaySeries?.points) && data.costDecaySeries.points.length >= 3, 'costDecaySeries.points required');
  for (const pt of data.costDecaySeries?.points || []) {
    assert(typeof pt.pricePer1M === 'number' && pt.pricePer1M > 0, `cost point ${pt.label}: pricePer1M must be > 0`);
    assert(typeof pt.sourceUrl === 'string' && pt.sourceUrl.startsWith('https://'), `cost point ${pt.label}: sourceUrl must be https://`);
  }
  assert(Array.isArray(data.capabilityBenchmarks) && data.capabilityBenchmarks.length >= 2, 'capabilityBenchmarks required');
  assert(Array.isArray(data.taskHorizon?.points) && data.taskHorizon.points.length >= 3, 'taskHorizon.points required');

  console.log(`✓ Validated ai-scaling.json (${data.costDecaySeries.points.length} cost points, ${data.capabilityBenchmarks.length} benchmark curves)`);
}

try {
  validateBreakthroughs();
  validateScaling();
} catch (err) {
  errors.push(`Fatal parse/IO error: ${err.message}`);
}

if (errors.length) {
  console.error(`\n✗ Dataset validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('✓ All AI Impact Atlas datasets passed schema & anti-hype verification.');
