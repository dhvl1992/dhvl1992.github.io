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
const PER_SOURCE = 2;           // newest N candidates from each source
const MAX_CANDIDATES = 40;      // keeps one request under Groq free limit (8,000 tokens/min)
const SUMMARY_CHARS = 420;      // per candidate
const MAX_AGE_DAYS = 7;         // ignore older items (some sources publish weekly)
const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]; // tried in order
const TOPICS = ["AI", "Science", "Money", "Mind", "History", "Business", "Geopolitics", "Communication", "Wow"];
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
  // geopolitics explainers
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/" },
  // communication / how to talk better
  { name: "Psyche", url: "https://psyche.co/feed" },
  { name: "Harvard Business Review", url: "https://feeds.hbr.org/harvardbusiness" },
  { name: "Greater Good (Berkeley)", url: "https://greatergood.berkeley.edu/site/rss/articles" },
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
const SYSTEM_BASE = `You write a "Curiosity Feed" for a busy teacher in India who loves learning.
From the numbered candidate stories, choose exactly ${PICK} STORIES and 1 RABBIT HOLE.

CHOOSE stories that are:
- surprising, useful or fun (a real "Aha!"), not routine news
- a MIX of topics: ${TOPICS.join(", ")}. Use ${PICK} different topics. Prefer the "topics needed" listed below.
- at least one Money or Business story if any candidate fits
- from at least 3 different sources
Topic meanings: Mind = psychology, habits, brain. Communication = how to talk, listen, persuade, write or handle people better.
Geopolitics = why countries act as they do: trade, borders, resources, alliances, power. Wow = surprising facts.
SKIP: election fights, party politics, crime, war casualties, deaths, celebrity gossip, sales/deals, product launches, very technical stories, and stories without enough facts in the text.

WRITE each story:
- "headline": max 10 words, plain and curious. No clickbait, no question marks.
- "body": 4 or 5 short sentences. EVERY sentence max 15 words. 80–100 words in total. Simple English a 12-year-old understands. Explain hard words in a few words.
- "aha": ONE sentence, max 25 words. It must say something the headline does NOT: a flipped expectation ("You'd think X, but Y"), a hidden link, or what it means for daily life. Never just repeat the story.
   BAD aha: "Shipwrecks have long been a battlefield where treasure drives competition." (only repeats)
   GOOD aha: "Old shipwrecks were not just lost treasure. They started the legal fights that still decide who owns the sea floor." (new angle)
- "topic": one of ${TOPICS.join(", ")}.  "emoji": one fitting emoji.

RABBIT HOLE (1 item): take ONE candidate (it may be one of your stories, or another) that opens a deeper question.
- "title": max 10 words, a curious question or idea.
- "body": 3 or 4 short sentences (max 15 words each) explaining what the candidate says and why it is worth digging into.
- "dig": exactly 3 short follow-up questions (max 10 words each) a curious person would search next.

STRICT FACT RULE: use ONLY facts written in that candidate's title and summary. Do not add numbers, times, speeds ("in minutes", "twice as fast"), names, dates, causes or background facts that are not in the text. If the text is thin, choose another candidate. Do not copy sentences; write in your own words.

Reply with JSON only:
{"stories":[{"id":<candidate number>,"topic":"","emoji":"","headline":"","body":"","aha":""}],
 "rabbit":{"id":<candidate number>,"topic":"","emoji":"","title":"","body":"","dig":["","",""]}}`;

const GROQ_URL = process.env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions"; // override only for tests
async function askGroq(model, candidates, system) {
  const user = candidates.map((c, i) => `#${i} [${c.source}] ${c.title}\n${c.summary.slice(0, SUMMARY_CHARS)}`).join("\n\n");
  const body = { model, temperature: 0.5, max_tokens: 4000, response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: user }] };
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
  log(`  reply: ${out.length} chars, tokens used: ${json.usage?.total_tokens ?? "?"}`);
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in reply");
  return JSON.parse(m[0]);
}

const toIdx = (id) => parseInt(String(id ?? "").replace(/[^0-9]/g, ""), 10); // accepts 3, "3", "#3"
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
export function validate(stories, candidates) {
  const used = new Set();
  const ok = [];
  for (const s of stories) {
    const idx = toIdx(s.id), c = candidates[idx];
    const why = !c ? `unknown id ${JSON.stringify(s.id)}` : used.has(idx) ? "duplicate"
      : !s.headline || !s.body || !s.aha ? "missing headline/body/aha"
      : words(s.body) < 45 || words(s.body) > 140 ? `body has ${words(s.body)} words` : ""; // keeps the 30–40 s read time
    if (why) { log(`    rejected: ${why} — ${String(s.headline || "").slice(0, 50)}`); continue; }
    used.add(idx);
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

const wikiSearch = (q) => "https://en.wikipedia.org/w/index.php?search=" + encodeURIComponent(q);
export function validateRabbit(r, candidates) {
  const c = r && candidates[toIdx(r.id)];
  if (!c || !r.title || !r.body || !Array.isArray(r.dig)) return null;
  const dig = r.dig.map((q) => String(q || "").trim()).filter(Boolean).slice(0, 3);
  if (dig.length < 2 || words(r.body) < 25 || words(r.body) > 110) return null;
  return {
    id: sha("rabbit:" + c.url),
    topic: TOPICS.includes(r.topic) ? r.topic : "Wow",
    emoji: String(r.emoji || "🕳️").slice(0, 4),
    title: String(r.title).trim(), body: String(r.body).trim(),
    dig: dig.map((q) => ({ q, url: wikiSearch(q) })), // real search links, never AI-made URLs
    source: c.source, url: c.url,
  };
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
    list.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0)).slice(0, PER_SOURCE))
    .sort(() => Math.random() - 0.5).slice(0, MAX_CANDIDATES); // shuffle so no source always wins
  log(`Candidates: ${candidates.length} from ${Object.keys(bySource).length} sources`);
  if (DRY) { candidates.forEach((c, i) => log(`#${i} [${c.source}] ${c.title}`)); return; }
  if (candidates.length < PICK) { log("Not enough new stories — keeping the old feed."); return; }
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY secret is missing");

  // Topic balance: which topics showed up least in the last 2 days → ask for those first
  const old = await readJson(FEED_FILE, { runs: [] });
  const count = Object.fromEntries(TOPICS.map((t) => [t, 0]));
  (old.runs || []).forEach((r) => (r.stories || []).forEach((st) => { if (st.topic in count) count[st.topic]++; }));
  const needed = TOPICS.slice().sort((a, b) => count[a] - count[b]).slice(0, 5);
  log("Topics needed most:", needed.join(", "));
  const system = SYSTEM_BASE + `\n\nTopics needed most right now: ${needed.join(", ")}.`;

  let stories = [], rabbit = null;
  for (const model of MODELS) {
    try {
      log("Asking", model);
      const out = await askGroq(model, candidates, system);
      if (!Array.isArray(out.stories)) log("    reply keys:", Object.keys(out).join(", "));
      stories = validate(out.stories || [], candidates);
      rabbit = validateRabbit(out.rabbit, candidates);
      log(`  got ${stories.length} good stories, rabbit hole: ${rabbit ? "yes" : "no"}`);
      if (stories.length >= 3) break; // 3+ is a usable run; else try the next model
    } catch (e) { log("  failed:", e.message); }
  }
  if (stories.length < 3) { log("AI did not give usable stories — keeping the old feed."); process.exitCode = 0; return; }

  const feed = await readJson(FEED_FILE, { runs: [] });
  const now = new Date().toISOString();
  const keepFrom = Date.now() - KEEP_HOURS * 3600e3;
  feed.runs = [{ at: now, stories, ...(rabbit ? { rabbit } : {}) }, ...(feed.runs || []).filter((r) => Date.parse(r.at) >= keepFrom)];
  feed.updated = now;
  await mkdir("feed", { recursive: true });
  await writeFile(FEED_FILE, JSON.stringify(feed, null, 1));
  const newSeen = [...stories.map((s) => s.id), ...seenList].slice(0, 2000); // remember used stories
  await writeFile(SEEN_FILE, JSON.stringify(newSeen));
  log(`Saved ${stories.length} stories. Feed now has ${feed.runs.reduce((n, r) => n + r.stories.length, 0)} stories in ${feed.runs.length} runs.`);
  stories.forEach((s) => log(`  [${s.topic}] ${s.headline} — ${s.source}`));
  if (rabbit) log(`  🕳️ [${rabbit.topic}] ${rabbit.title} — ${rabbit.source}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
