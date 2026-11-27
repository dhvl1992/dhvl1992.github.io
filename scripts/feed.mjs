// Curiosity Feed builder — runs in GitHub Actions 4× a day (see .github/workflows/feed.yml).
// 1. Read RSS/Atom feeds from reliable sources (free, no login).
// 2. Drop stories already used (feed/seen.json).
// 3. Ask Groq to pick 5 interesting ones and rewrite each in simple English with an "Aha!" line.
// 4. Save feed/feed.json (last 48 hours of runs). If anything fails, the old feed stays untouched.
// No npm packages: Node 20+ has fetch built in.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const FEED_FILE = "feed/feed.json";
const SEEN_FILE = "feed/seen.json";
const KEEP_HOURS = 48;          // keep 2 days of runs (≈ 8 runs × 5 = 40 stories)
const PICK = 5;                 // stories per run
const PER_SOURCE = 4;           // newest N candidates from each source
const MAX_AGE_DAYS = 7;         // ignore older items (some sources publish weekly)
const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]; // tried in order
const TOPICS = ["AI", "Science", "Money", "Mind", "History", "Business", "Wow"];
const DRY = process.env.DRY_RUN === "1"; // DRY_RUN=1 → print candidates, don't call AI or write files

// Reliable sources with public RSS. A broken one is skipped and logged, never fatal.
const SOURCES = [
  { name: "The Conversation", url: "https://theconversation.com/global/articles.atom" },
  { name: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/" },
  { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top/science.xml" },
  { name: "Smithsonian", url: "https://www.smithsonianmag.com/rss/latest_articles/" },
  { name: "Atlas Obscura", url: "https://www.atlasobscura.com/feeds/latest" },
  { name: "Our World in Data", url: "https://ourworldindata.org/atom.xml" },
  { name: "NASA", url: "https://www.nasa.gov/feed/" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/science" },
  { name: "PsyPost", url: "https://www.psypost.org/feed/" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "BBC Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { name: "NPR Economy", url: "https://feeds.npr.org/1017/rss.xml" },
  { name: "JSTOR Daily", url: "https://daily.jstor.org/feed/" },
  { name: "Nautilus", url: "https://nautil.us/feed/" },
  { name: "Big Think", url: "https://bigthink.com/feed/" },
];

// ---------- small helpers ----------
const log = (...a) => console.log(...a);
const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; } }

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
function text(s) { // HTML → plain text
  return decode(decode(s || "")) // some feeds escape HTML twice
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function safeDate(d) { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")); return m ? m[1] : ""; };

// Parse RSS <item> and Atom <entry> without a library
export function parseFeed(xml, sourceName) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = text(tag(b, "link"));
    if (!link) { // Atom: <link rel="alternate" href="..."/>
      const m = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = m ? decode(m[1]) : "";
    }
    const summary = text(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"));
    const date = text(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    return { source: sourceName, title: text(tag(b, "title")), url: link.trim(), summary, published: safeDate(date) };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url));
}

async function fetchSource(src) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(src.url, { signal: ctrl.signal, headers: { "User-Agent": "CuriosityFeed/1.0 (+https://dhvl1992.github.io)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const items = parseFeed(await res.text(), src.name);
    log(`  ✓ ${src.name}: ${items.length} items`);
    return items;
  } catch (e) {
    log(`  ✗ ${src.name}: ${e.message}`);
    return [];
  } finally { clearTimeout(t); }
}

// ---------- AI ----------
const SYSTEM = `You write a daily "Curiosity Feed" for a busy teacher in India who loves learning.
From the numbered candidate stories, choose exactly ${PICK} and rewrite each one.

CHOOSE stories that are:
- surprising, useful or fun to know (an "Aha!" moment), not routine news
- a MIX of topics: AI, Science, Money, Mind (psychology), History, Business, Wow (surprising facts). Use ${PICK} different topics if possible.
- from at least 3 different sources
SKIP: politics, crime, war, deaths, celebrity gossip, sales/deals, product launches, very technical stories, and stories without enough facts in the text.

WRITE each story:
- "headline": max 10 words, plain and curious. No clickbait, no question marks.
- "body": 3 or 4 very short sentences, 60–90 words total. Simple English (a 12-year-old should understand). Explain any hard word.
- "aha": ONE sentence, max 25 words: the surprising insight or why it matters in real life.
- "topic": one of ${TOPICS.join(", ")}.
- "emoji": one fitting emoji.

STRICT: use ONLY facts written in that candidate's title and summary. Do not add numbers, names, dates or claims that are not there. If unsure, choose another story. Do not copy sentences; write in your own words.

Reply with JSON only: {"stories":[{"id":<candidate number>,"topic":"","emoji":"","headline":"","body":"","aha":""}]}`;

const GROQ_URL = process.env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions"; // override only for tests
async function askGroq(model, candidates) {
  const user = candidates.map((c, i) => `#${i} [${c.source}] ${c.title}\n${c.summary.slice(0, 700)}`).join("\n\n");
  const body = { model, temperature: 0.5, max_tokens: 4000, response_format: { type: "json_object" },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
  let res = await fetch(GROQ_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify(body) });
  if (res.status === 400) { // some models reject JSON mode — retry without it
    delete body.response_format;
    res = await fetch(GROQ_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify(body) });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const out = json.choices?.[0]?.message?.content || "";
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in reply");
  return JSON.parse(m[0]).stories || [];
}

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
export function validate(stories, candidates) {
  const used = new Set();
  const ok = [];
  for (const s of stories) {
    const c = candidates[Number(s.id)];
    if (!c || used.has(s.id)) continue;
    if (!s.headline || !s.body || !s.aha) continue;
    if (words(s.body) < 30 || words(s.body) > 140) continue; // keeps the 30–40 s read time
    used.add(s.id);
    ok.push({
      id: sha(c.url),
      topic: TOPICS.includes(s.topic) ? s.topic : "Wow",
      emoji: String(s.emoji || "✨").slice(0, 4),
      headline: String(s.headline).trim(),
      body: String(s.body).trim(),
      aha: String(s.aha).trim(),
      source: c.source, url: c.url, published: c.published,
      readSec: Math.max(20, Math.round(((words(s.body) + words(s.aha) + words(s.headline)) / 200) * 60)),
    });
  }
  return ok.slice(0, PICK);
}

// ---------- main ----------
export async function main() {
  const seenList = await readJson(SEEN_FILE, []);
  const seen = new Set(seenList);
  log("Reading sources…");
  const all = (await Promise.all(SOURCES.map(fetchSource))).flat();

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400e3;
  const bySource = {};
  for (const it of all) {
    if (seen.has(sha(it.url))) continue;
    if (it.published && Date.parse(it.published) < cutoff) continue;
    if (it.summary.length < 80) continue; // not enough facts to write from safely
    (bySource[it.source] ||= []).push(it);
  }
  const candidates = Object.values(bySource).flatMap((list) =>
    list.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0)).slice(0, PER_SOURCE));
  log(`Candidates: ${candidates.length} from ${Object.keys(bySource).length} sources`);
  if (DRY) { candidates.forEach((c, i) => log(`#${i} [${c.source}] ${c.title}`)); return; }
  if (candidates.length < PICK) { log("Not enough new stories — keeping the old feed."); return; }
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY secret is missing");

  let stories = [];
  for (const model of MODELS) {
    try {
      log("Asking", model);
      stories = validate(await askGroq(model, candidates), candidates);
      log(`  got ${stories.length} good stories`);
      if (stories.length >= 3) break; // 3+ is a usable run; else try the next model
    } catch (e) { log("  failed:", e.message); }
  }
  if (stories.length < 3) { log("AI did not give usable stories — keeping the old feed."); process.exitCode = 0; return; }

  const feed = await readJson(FEED_FILE, { runs: [] });
  const now = new Date().toISOString();
  const keepFrom = Date.now() - KEEP_HOURS * 3600e3;
  feed.runs = [{ at: now, stories }, ...(feed.runs || []).filter((r) => Date.parse(r.at) >= keepFrom)];
  feed.updated = now;
  await mkdir("feed", { recursive: true });
  await writeFile(FEED_FILE, JSON.stringify(feed, null, 1));
  const newSeen = [...stories.map((s) => s.id), ...seenList].slice(0, 2000); // remember used stories
  await writeFile(SEEN_FILE, JSON.stringify(newSeen));
  log(`Saved ${stories.length} stories. Feed now has ${feed.runs.reduce((n, r) => n + r.stories.length, 0)} stories in ${feed.runs.length} runs.`);
  stories.forEach((s) => log(`  [${s.topic}] ${s.headline} — ${s.source}`));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
