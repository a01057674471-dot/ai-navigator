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
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const aiDraftLimit = Math.max(0, Number(process.env.AI_DRAFT_LIMIT || 3));

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
function responseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}
async function makeAiDraft(item, source) {
  if (!openaiApiKey) return null;
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'body', 'insight', 'category'],
    properties: {
      title: { type: 'string', minLength: 10, maxLength: 90 },
      summary: { type: 'string', minLength: 40, maxLength: 240 },
      body: { type: 'string', minLength: 400, maxLength: 2200 },
      insight: { type: 'string', minLength: 40, maxLength: 320 },
      category: { type: 'string', enum: ['model', 'workflow', 'guide', 'research', 'news', 'insight'] }
    }
  };
  const sourceText = [
    `공식 출처: ${source.publisher}`,
    `원문 제목: ${item.title}`,
    `원문 요약: ${item.summary || '요약 없음'}`,
    `원문 링크: ${item.link || source.site_url}`,
    `발행일: ${item.date.toISOString().slice(0, 10)}`
  ].join('\n');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: openaiModel,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: '당신은 한국의 초보 AI 사용자를 위한 뉴스 편집자입니다. 제공된 공식 출처 정보에 있는 사실만 사용하세요. 추측, 과장, 확인되지 않은 가격·성능·출시 여부를 만들지 마세요. 한국어로 쉽게 쓰고, body는 ## 소제목과 짧은 문단을 사용해 3~5개 부분으로 구성하세요. 마지막에는 독자가 원문에서 다시 확인해야 할 항목을 적으세요. 결과는 자동 공개되지 않고 편집자 검수용 초안입니다.' }] },
        { role: 'user', content: [{ type: 'input_text', text: sourceText }] }
      ],
      text: { format: { type: 'json_schema', name: 'news_review_draft', strict: true, schema } },
      max_output_tokens: 2200
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${data?.error?.message || 'draft generation failed'}`);
  return JSON.parse(responseText(data));
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
      const existingRows = dryRun ? [] : await supabase(`news?source_id=eq.${encodeURIComponent(source.id)}&select=external_id&limit=500`);
      const existingIds = new Set(existingRows.map(row => String(row.external_id)));
      const newItems = items.filter(item => !existingIds.has(String(item.externalId)));
      let aiGenerated = 0;
      const rows = [];
      for (const item of newItems) {
        let draft = null;
        if (openaiApiKey && aiGenerated < aiDraftLimit) {
          try {
            draft = await makeAiDraft(item, source);
            aiGenerated += 1;
          } catch (error) {
            console.warn(`AI draft skipped for ${source.id}: ${String(error.message || error).slice(0, 300)}`);
          }
        }
        rows.push({
          id: makeId(source.id, item.externalId), source_id: source.id, external_id: item.externalId,
          label: draft ? 'AI DRAFT' : 'NEW', published_at: item.date.toISOString().slice(0, 10),
          title: truncate(draft?.title || item.title, 140),
          summary: truncate(draft?.summary || item.summary || '공식 출처의 원문에서 자세한 내용을 확인하세요.', 400),
          body: draft?.body || '',
          insight: draft?.insight || '자동 수집된 원문을 편집자가 확인한 뒤 핵심 맥락과 활용 포인트를 추가합니다.',
          category: draft?.category || source.category, source: source.publisher,
          source_url: item.link || source.site_url, status: 'draft'
        });
      }
      if (!dryRun && rows.length) await supabase('news?on_conflict=source_id%2Cexternal_id', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } });
      if (!dryRun) await updateSource(source, { last_fetched_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null, item_count: rows.length });
      report.push({ source: source.id, scanned: items.length, newDrafts: rows.length, aiGenerated, dryRun, ms: Date.now() - started });
    } catch (error) {
      if (!dryRun) await updateSource(source, { last_fetched_at: new Date().toISOString(), last_error: String(error.message || error).slice(0, 500) });
      report.push({ source: source.id, error: String(error.message || error), ms: Date.now() - started });
    }
  }
  console.log(JSON.stringify({ ok: report.every(row => !row.error), report }, null, 2));
  if (report.some(row => row.error)) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
