#!/usr/bin/env node
/**
 * Automated AI Impact Atlas Dataset Updater (Zero npm dependencies, Node 20+)
 *
 * Stage 1 (Structured APIs — no API key required):
 *   - Queries ClinicalTrials.gov v2 API for tracked AI-discovered drugs (NCT IDs)
 *   - Scans official RSS feeds (MIT News AI, DeepMind Blog, Nature AI) for recent items
 *
 * Stage 2 (Optional LLM Triage — set XAI_API_KEY for Grok OR GEMINI_API_KEY for Gemini):
 *   - Evaluates newly fetched official announcements against strict anti-hype criteria
 *   - Formats verified major breakthroughs into the strict breakthroughs.json schema
 *   - Appends deduplicated entries so GitHub Actions opens a human-reviewable Pull Request
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const btPath = path.join(rootDir, 'data', 'breakthroughs.json');
const summaryPath = path.join(rootDir, 'data-sources', 'last-sync-summary.md');

const RSS_FEEDS = [
  { name: 'MIT News (AI)', url: 'https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Nature Machine Intelligence', url: 'https://www.nature.com/natmachintell.rss' }
];

const todayIso = new Date().toISOString().slice(0, 10);
const changeLog = [];

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AI-Impact-Atlas-Bot/1.0 (+https://github.com)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function syncClinicalTrials(btData) {
  const drugs = btData.clinicalPipeline?.trackedDrugs || [];
  let updated = 0;

  for (const drug of drugs) {
    if (!drug.nctId) continue;
    try {
      const text = await fetchText(`https://clinicaltrials.gov/api/v2/studies/${encodeURIComponent(drug.nctId)}`);
      const study = JSON.parse(text);
      const statusMod = study?.protocolSection?.statusModule;
      const designMod = study?.protocolSection?.designModule;
      const overallStatus = statusMod?.overallStatus;
      const phases = designMod?.phases || [];

      if (overallStatus) {
        const prev = drug.clinicalTrialsStatus;
        drug.clinicalTrialsStatus = overallStatus;
        drug.clinicalTrialsSyncedAt = todayIso;
        if (phases.length) drug.clinicalTrialsPhases = phases;

        if (prev && prev !== overallStatus) {
          changeLog.push(`- **ClinicalTrials.gov update**: ${drug.name} (\`${drug.nctId}\`) changed status from \`${prev}\` → \`${overallStatus}\`.`);
          updated++;
        }
      }
    } catch (err) {
      console.warn(`  [warn] ClinicalTrials.gov fetch failed for ${drug.nctId}: ${err.message}`);
    }
  }
  return updated;
}

function parseSimpleRssItems(xml, feedName) {
  const items = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const raw of itemMatches.slice(0, 8)) {
    const getTag = (tag) => {
      const m = raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
    };
    const title = getTag('title');
    let link = getTag('link');
    if (!link) {
      const hrefMatch = raw.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) link = hrefMatch[1];
    }
    const pubDate = getTag('pubDate') || getTag('updated') || getTag('dc:date');
    const desc = (getTag('description') || getTag('summary')).slice(0, 360);
    if (title && link && link.startsWith('https://')) {
      items.push({ feedName, title, link, pubDate, desc });
    }
  }
  return items;
}

async function gatherRecentFeedItems() {
  const collected = [];
  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchText(feed.url);
      const parsed = parseSimpleRssItems(xml, feed.name);
      collected.push(...parsed);
      console.log(`  Fetched ${parsed.length} items from ${feed.name}`);
    } catch (err) {
      console.warn(`  [warn] RSS fetch skipped for ${feed.name}: ${err.message}`);
    }
  }
  return collected;
}

async function triageWithLlm(feedItems, existingEvents) {
  const xaiKey = process.env.XAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if ((!xaiKey && !geminiKey) || !feedItems.length) {
    console.log('  Skipping LLM discovery triage (no XAI_API_KEY or GEMINI_API_KEY configured).');
    return [];
  }

  const existingTitles = existingEvents.map((e) => `${e.date}: ${e.title}`).join('\n');
  const systemPrompt = [
    'You are a strict scientific editor for the AI Impact Atlas.',
    'Review the recent official feed items and return ONLY genuinely major, verifiable AI breakthroughs in medicine, math/Lean formal proofs, climate/science/energy, or accessibility.',
    'REJECT routine product updates, opinion pieces, funding rounds, minor incremental papers, or unverified claims (e.g., unproven Riemann Hypothesis claims).',
    'If nothing qualifies, return {"newEvents": []}.',
    'Every event MUST include honest limitations in "caveats", concrete quantitative "metrics", and the exact https:// source URL from the provided feed.',
    'Valid domain values: "medicine", "math", "science", "accessibility".',
    'Valid verificationTier values: "verified", "trial", "milestone".',
    'Also write "plainHeadline": a jargon-free sentence (<= 90 chars) a non-technical reader instantly understands, and "bigStat": { "value": one short headline number (<= 10 chars), "label": what it counts (<= 40 chars) }.',
    'Return ONLY valid JSON: { "newEvents": [ { "id", "date", "domain", "title", "shortLabel", "plainHeadline", "bigStat": {"value","label"}, "organization", "impactScore", "verificationTier", "verificationLabel", "summary", "whyItMatters", "caveats", "metrics", "sources": [{"label","url","publisher"}] } ] }'
  ].join('\n');

  const userPrompt = `Existing tracked milestones:\n${existingTitles}\n\nRecent official announcements to screen:\n${JSON.stringify(feedItems, null, 2)}`;

  try {
    let rawJsonText = '';
    if (xaiKey) {
      console.log('  Running Grok (xAI) anti-hype breakthrough triage...');
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${xaiKey}`
        },
        body: JSON.stringify({
          model: process.env.XAI_MODEL || 'grok-3-mini',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!res.ok) throw new Error(`xAI HTTP ${res.status}`);
      const body = await res.json();
      rawJsonText = body.choices?.[0]?.message?.content || '{"newEvents":[]}';
    } else if (geminiKey) {
      console.log('  Running Gemini anti-hype breakthrough triage...');
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
          })
        }
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const body = await res.json();
      rawJsonText = body.candidates?.[0]?.content?.parts?.[0]?.text || '{"newEvents":[]}';
    }

    const parsed = JSON.parse(rawJsonText);
    return Array.isArray(parsed.newEvents) ? parsed.newEvents : [];
  } catch (err) {
    console.warn(`  [warn] LLM triage failed cleanly: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log(`AI Impact Atlas Automated Sync (${todayIso})`);
  const btData = JSON.parse(fs.readFileSync(btPath, 'utf8'));

  console.log('1. Checking ClinicalTrials.gov v2 API for tracked AI drug statuses...');
  const ctChanges = await syncClinicalTrials(btData);

  console.log('2. Scanning official scientific RSS feeds...');
  const feedItems = await gatherRecentFeedItems();

  console.log('3. Evaluating candidate breakthroughs via optional LLM anti-hype gate...');
  const candidates = await triageWithLlm(feedItems, btData.events);

  const existingIds = new Set(btData.events.map((e) => e.id));
  let added = 0;
  for (const ev of candidates) {
    if (!ev || !ev.id || existingIds.has(ev.id)) continue;
    btData.events.push(ev);
    existingIds.add(ev.id);
    added++;
    changeLog.push(`- **New Candidate Breakthrough (${ev.verificationTier})**: ${ev.title} (${ev.date}, ${ev.organization})`);
  }

  if (added > 0 || ctChanges > 0) {
    btData.meta.updatedAt = todayIso;
    btData.meta.coverageEnd = todayIso;
    fs.writeFileSync(btPath, JSON.stringify(btData, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated breakthroughs.json (+${added} breakthroughs, ${ctChanges} clinical trial updates).`);
  } else {
    console.log('No new verified milestones or trial phase changes detected.');
  }

  const summaryMd = [
    `# AI Impact Atlas Sync Summary (${todayIso})`,
    '',
    `- RSS announcements scanned: **${feedItems.length}**`,
    `- New breakthrough candidates added for PR review: **${added}**`,
    `- ClinicalTrials.gov phase/status updates: **${ctChanges}**`,
    '',
    ...(changeLog.length ? ['## Proposed Changes', ...changeLog] : ['_No dataset changes required on this run._']),
    ''
  ].join('\n');

  fs.writeFileSync(summaryPath, summaryMd, 'utf8');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
