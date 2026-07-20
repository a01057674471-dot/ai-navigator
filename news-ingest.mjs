#!/usr/bin/env node
/**
 * 공식 RSS/Atom 피드를 읽어 Supabase news 테이블에 draft로 넣습니다.
 * 실행 전 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * service_role key는 서버/cron 환경변수에만 두고 절대 브라우저에 넣지 마세요.
 */
import process from 'node:process';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');
const limit = Number(process.env.NEWS_INGEST_LIMIT || 15);

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
function stripHtml(value) {
  return escapeXml(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function tagValue(block, tagNames) {
  for (const tag of tagNames) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) return escapeXml(match[1]).trim();
  }
  return '';
}
function tagAttribute(block, tag, attribute) {
  const match = block.match(new RegExp(`<${tag}[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'));
  return match ? escapeXml(match[1]).trim() : '';
}
function parseFeed(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(match => match[0]);
  return blocks.map(block => {
    const title = stripHtml(tagValue(block, ['title']));
    const link = tagValue(block, ['link']) || tagAttribute(block, 'link', 'href');
    const externalId = tagValue(block, ['guid', 'id']) || link || title;
    const rawDate = tagValue(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const date = rawDate ? new Date(rawDate) : new Date();
    const summary = stripHtml(tagValue(block, ['description', 'summary', 'content:encoded', 'content']));
    return { title, link, externalId, date: Number.isNaN(date.valueOf()) ? new Date() : date, summary };
  }).filter(item => item.title && item.externalId);
}
function truncate(text, max) {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}
function makeId(sourceId, externalId) {
  const safe = `${sourceId}-${externalId}`.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  return `${safe.slice(0, 90)}-${Buffer.from(externalId).toString('base64url').slice(0, 10)}`;
}
async function supabase(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}
async function updateSource(source, patch) {
  await supabase(`news_sources?id=eq.${encodeURIComponent(source.id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}
async function main() {
  const sources = await supabase('news_sources?enabled=eq.true&select=*');
  const report = [];
  for (const source of sources) {
    const started = Date.now();
    try {
      const response = await fetch(source.feed_url, { headers: { 'User-Agent': 'AI-Navigator-NewsBot/1.0 (+official RSS ingestion)' } });
      if (!response.ok) throw new Error(`Feed returned ${response.status}`);
      const xml = await response.text();
      const items = parseFeed(xml).sort((a, b) => b.date - a.date).slice(0, limit);
      const rows = items.map(item => ({
        id: makeId(source.id, item.externalId), source_id: source.id, external_id: item.externalId,
        label: 'NEW', published_at: item.date.toISOString().slice(0, 10), title: truncate(item.title, 140),
        summary: truncate(item.summary || '공식 출처의 원문에서 자세한 내용을 확인하세요.', 400),
        insight: '자동 수집된 원문을 편집자가 확인한 뒤 핵심 맥락과 활용 포인트를 추가합니다.',
        category: source.category, source: source.publisher, source_url: item.link || source.site_url, status: 'draft'
      }));
      if (!dryRun && rows.length) await supabase('news?on_conflict=source_id%2Cexternal_id', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      if (!dryRun) await updateSource(source, { last_fetched_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null, item_count: rows.length });
      report.push({ source: source.id, fetched: rows.length, dryRun, ms: Date.now() - started });
    } catch (error) {
      if (!dryRun) await updateSource(source, { last_fetched_at: new Date().toISOString(), last_error: String(error.message || error).slice(0, 500) });
      report.push({ source: source.id, error: String(error.message || error), ms: Date.now() - started });
    }
  }
  console.log(JSON.stringify({ ok: report.every(row => !row.error), report }, null, 2));
  if (report.some(row => row.error)) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
