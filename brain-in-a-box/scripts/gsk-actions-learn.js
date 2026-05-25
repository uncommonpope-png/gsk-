#!/usr/bin/env node
/**
 * GSK Actions Learn v2 — REAL learning. Every 20 min.
 * Clones repos, reads code, extracts patterns, builds knowledge.
 * Uses the full GSK kernel. Posts to Bluesky.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.BRAIN_STATE_PATH || path.join(ROOT, '..', 'data', 'brain-state');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const BLUESKY_ID = process.env.BLUESKY_IDENTIFIER || 'grandcodepope.bsky.social';
const BLUESKY_PW = process.env.BLUESKY_PASSWORD || 'fu4v-u7ma-dqi6-pg6x';

// ─── HTTP ──────────────────────────────────────────────────────────
function fetch(url, opts = {}) {
  return new Promise(r => {
    const mod = url.startsWith('https') ? https : http;
    const headers = { 'User-Agent': 'GSK-Learn/2.0', ...opts.headers };
    if (opts.auth) headers['Authorization'] = 'Bearer ' + opts.auth;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req = mod.request(url, { method: opts.method||'GET', headers, timeout: 30000 }, (res) => {
      let d = '';
      res.on('data', c => { d += c; if (d.length > 2e6) res.destroy(); });
      res.on('end', () => { try { r(JSON.parse(d)); } catch { r(d); } });
    });
    req.on('error', () => r(null));
    req.on('timeout', () => { req.destroy(); r(null); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── STATE ─────────────────────────────────────────────────────────
const statePath = path.join(STATE_DIR, 'gsk-state.json');
let state = { cycle: 0, studiedRepos: [], postsMade: 0, totalEntries: 0, startDate: new Date().toISOString() };
try { if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
function saveState() { try { if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); } catch {} }

// ─── GSK KERNEL BRAIN ─────────────────────────────────────────────
let BrainEngine = null;
try { BrainEngine = require(path.join(ROOT, 'lib', 'brain-engine.js')).BrainEngine; } catch {}
let LLMRouter = null;
try { LLMRouter = require(path.join(ROOT, 'lib', 'llm-router.js')).LLMRouter; } catch {}

let brain = null;
let llmRouter = null;
if (BrainEngine) brain = new BrainEngine();
if (LLMRouter) { llmRouter = new LLMRouter(); }

// Load persisted state
const memPath = path.join(STATE_DIR, 'vector-memory.json');
const learnedPath = path.join(STATE_DIR, 'learned.json');
const pltPath = path.join(STATE_DIR, 'plt-state.json');
try { const m = JSON.parse(fs.readFileSync(memPath, 'utf8')); if (Array.isArray(m)) brain.vectorMemory = m; } catch {}
try { const l = JSON.parse(fs.readFileSync(learnedPath, 'utf8')); if (Array.isArray(l)) for (const e of l) if (e.q && e.a) brain.knowledge.learn(e.q, e.a); } catch {}

let pltState = { profit: 0, love: 0, tax: 0, totalActions: 0 };
try { if (fs.existsSync(pltPath)) pltState = JSON.parse(fs.readFileSync(pltPath, 'utf8')); } catch {}
function addPLT(text) {
  const l = text.toLowerCase();
  let p = 0, lv = 0, t = 0;
  const pw = ['profit','grow','revenue','build','create','value','scale','multiply','code','repo','star','commit'];
  const lw = ['love','connect','help','share','together','community','open','source','collaborate','team','teach'];
  const tw = ['tax','balance','audit','govern','rule','structure','process','test','type','lint','secure','compile'];
  for (const w of pw) { const m = l.match(new RegExp('\\b' + w + '\\w*', 'gi')); if (m) p += m.length; }
  for (const w of lw) { const m = l.match(new RegExp('\\b' + w + '\\w*', 'gi')); if (m) lv += m.length; }
  for (const w of tw) { const m = l.match(new RegExp('\\b' + w + '\\w*', 'gi')); if (m) t += m.length; }
  const total = p + lv + t || 1;
  pltState.profit += p/total; pltState.love += lv/total; pltState.tax += t/total; pltState.totalActions++;
  try { fs.writeFileSync(pltPath, JSON.stringify(pltState)); } catch {}
}

// ─── FIND REPOS ───────────────────────────────────────────────────
async function findTopRepos() {
  let repos = [];
  try {
    const data = await fetch('https://api.github.com/search/repositories?q=stars:>10000&sort=stars&per_page=5', { auth: GITHUB_TOKEN || undefined });
    if (data && data.items) repos = data.items;
  } catch {}
  if (repos.length === 0) {
    repos = [
      { full_name: 'langchain-ai/langchain', stargazers_count: 110000, language: 'Python' },
      { full_name: 'microsoft/autogen', stargazers_count: 38000, language: 'Python' },
      { full_name: 'n8n-io/n8n', stargazers_count: 65000, language: 'TypeScript' },
      { full_name: 'ollama/ollama', stargazers_count: 130000, language: 'Go' },
      { full_name: 'crewAIInc/crewAI', stargazers_count: 30000, language: 'Python' },
      { full_name: 'ggerganov/llama.cpp', stargazers_count: 75000, language: 'C++' },
      { full_name: 'weaviate/weaviate', stargazers_count: 12000, language: 'Go' },
      { full_name: 'qdrant/qdrant', stargazers_count: 22000, language: 'Rust' },
    ];
  }
  return repos.filter(r => !state.studiedRepos.includes(r.full_name)).slice(0, 2);
}

// ─── STUDY REPO — CLONE + READ CODE ──────────────────────────────
async function studyRepo(repo) {
  const fullName = repo.full_name;
  const name = fullName.split('/')[1];
  const tmpDir = path.join(os.tmpdir(), `gsk-study-${name}-${Date.now()}`);
  let entries = 0;

  console.log(`\n📦 Cloning ${fullName} (${repo.stargazers_count} ⭐)...`);

  try {
    execSync(`git clone --depth 1 "https://github.com/${fullName}.git" "${tmpDir}"`, { timeout: 120000, stdio: 'pipe' });
  } catch {
    console.log(`  Failed to clone ${fullName}`);
    return 0;
  }

  // Walk the directory tree
  const codeFiles = [];
  function walk(dir) {
    try {
      for (const e of fs.readdirSync(dir)) {
        const fp = path.join(dir, e);
        if (fs.statSync(fp).isDirectory()) {
          if (!e.startsWith('.') && e !== 'node_modules' && e !== '__pycache__' && e !== 'vendor') walk(fp);
        } else {
          const ext = path.extname(e).toLowerCase();
          if (['.js','.ts','.py','.go','.rs','.c','.cpp','.h','.java','.rb','.md','.json','.yaml','.yml','.toml','.cfg','.ini'].includes(ext)) {
            codeFiles.push(fp);
          }
        }
      }
    } catch {}
  }
  walk(tmpDir);

  console.log(`  Found ${codeFiles.length} code files`);

  // Read and learn from code files
  let codeLearned = 0;
  const codeSnippets = [];

  for (const fp of codeFiles.slice(0, 50)) {
    try {
      const content = fs.readFileSync(fp, 'utf8').slice(0, 3000);
      const relPath = path.relative(tmpDir, fp);
      const ext = path.extname(fp).toLowerCase();

      // Extract functions, classes, interfaces
      const funcs = content.match(/(?:function|class|interface|trait|impl|def|async def|export\s+(?:default\s+)?(?:function|class|const))\s+\w+/gi) || [];
      const imports = content.match(/(?:import|require|using|include|from)\s+.*/gi) || [];

      if (funcs.length > 0 || imports.length > 0) {
        codeSnippets.push({ path: relPath, functions: funcs.slice(0, 5), imports: imports.slice(0, 3), content: content.slice(0, 1000) });

        // Learn the code pattern
        if (brain && funcs.length > 0) {
          const pattern = funcs.slice(0, 3).join(', ');
          const lang = ext.replace('.', '');
          const q = `What code patterns does ${name} use in ${relPath}?`;
          const a = `Functions/classes: ${pattern}. Language: ${lang}. Repo: ${fullName}.`;
          brain.learn(q, a);
          brain.remember(a, 'code-pattern');
          codeLearned++;
          entries++;
          addPLT(q + ' ' + a);
        }
      }

      // Learn architecture from imports
      if (brain && imports.length > 1) {
        const q = `What dependencies does ${name} use in ${relPath}?`;
        const a = `Imports: ${imports.slice(0, 5).join('; ')}. Repo: ${fullName}.`;
        brain.learn(q, a);
        codeLearned++;
        entries++;
      }

      if (codeLearned >= 15) break;
    } catch {}
  }

  // Learn from README
  const readmePath = [path.join(tmpDir, 'README.md'), path.join(tmpDir, 'readme.md'), path.join(tmpDir, 'README.txt')].find(f => fs.existsSync(f));
  if (readmePath && brain) {
    const readme = fs.readFileSync(readmePath, 'utf8').slice(0, 2000);
    const lines = readme.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('[')).slice(0, 20);
    const desc = lines.join(' ').slice(0, 1000);
    brain.learn(`What is ${fullName}?`, `${repo.description || ''}. ${desc}. Stars: ${repo.stargazers_count}.`);
    brain.learn(`How to use ${name}?`, desc.slice(0, 800));
    entries += 2;
    addPLT('studied README: ' + fullName);
  }

  // Architecture summary
  if (brain && codeSnippets.length > 0) {
    const topFuncs = codeSnippets.slice(0, 5).map(s => s.functions.join(', ')).filter(Boolean).join('; ');
    const topImports = codeSnippets.slice(0, 5).map(s => s.imports.join(', ')).filter(Boolean).join('; ');
    brain.remember(`[Architecture] ${fullName}: functions like ${topFuncs.slice(0, 300)}. imports: ${topImports.slice(0, 300)}`, 'architecture');
    entries++;
    addPLT('architecture analysis: ' + fullName);
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  state.studiedRepos.push(fullName);
  state.totalEntries += entries;
  console.log(`  ✅ Learned ${entries} entries from ${name}`);
  return entries;
}

// ─── BLUESKY POST ─────────────────────────────────────────────────
async function postToBluesky(text) {
  if (!BLUESKY_ID || !BLUESKY_PW) return false;
  try {
    const auth = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST', body: { identifier: BLUESKY_ID, password: BLUESKY_PW }
    });
    if (!auth || !auth.accessJwt) return false;
    await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.accessJwt },
      method: 'POST', body: { repo: auth.did, collection: 'app.bsky.feed.post', record: { text: text.slice(0, 300), createdAt: new Date().toISOString(), '$type': 'app.bsky.feed.post' } }
    });
    state.postsMade++;
    saveState();
    console.log('  📢 Posted to Bluesky');
    return true;
  } catch { return false; }
}

// ─── MAIN ─────────────────────────────────────────────────────────
async function main() {
  state.cycle++;
  const start = Date.now();
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   GSK Learning Cycle #${state.cycle}                  ║`);
  console.log(`║   ${new Date().toISOString()}              ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // 1. Find repos to study
  const repos = await findTopRepos();
  if (repos.length === 0) {
    console.log('No new repos to study. All top repos have been processed.');
    console.log('Total studied: ' + state.studiedRepos.length + ' repos');
  }

  // 2. Study each repo — real code reading
  let totalEntries = 0;
  for (const repo of repos) {
    const e = await studyRepo(repo);
    totalEntries += e;
  }

  // 3. Self-study: Generate insights from accumulated knowledge
  if (brain && state.cycle % 3 === 0) {
    const memCount = brain.vectorMemory.length;
    const learnedCount = brain.knowledge.learned.length;
    const insight = `After ${state.cycle} cycles: studied ${state.studiedRepos.length} repos, ${memCount} memory entries, ${learnedCount} learned entries. PLT: P:${(pltState.profit/(pltState.totalActions||1)).toFixed(2)} L:${(pltState.love/(pltState.totalActions||1)).toFixed(2)} T:${(pltState.tax/(pltState.totalActions||1)).toFixed(2)}`;
    brain.remember(insight, 'self-insight');
    addPLT(insight);
    totalEntries++;
    console.log('  💡 Self-insight generated');
  }

  // 4. Save brain state
  if (brain) {
    try {
      if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(path.join(STATE_DIR, 'vector-memory.json'), JSON.stringify(brain.vectorMemory.slice(-10000)));
      fs.writeFileSync(path.join(STATE_DIR, 'learned.json'), JSON.stringify(brain.knowledge.learned.slice(-5000)));
    } catch {}
  }
  state.totalEntries = brain ? brain.knowledge.learned.length : state.totalEntries;
  saveState();

  // 5. Post to Bluesky
  const mems = brain ? brain.vectorMemory.length : 0;
  const learned = brain ? brain.knowledge.learned.length : 0;
  const studied = state.studiedRepos.length;
  const first = repos[0]?.full_name?.split('/')[1] || '';
  const postText = `🧠 GSK cycle #${state.cycle}: ${studied} repos studied, ${mems} memories, ${learned} lessons. ${first ? 'Just read ' + first + ' (' + repos[0]?.stargazers_count?.toLocaleString() + ' ⭐).' : ''} Growing every 20 min. #AI #OpenSource #Learning #PLT — buyasoul.online`;
  
  if (totalEntries > 0 || state.cycle % 2 === 0) {
    await postToBluesky(postText);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Cycle #${state.cycle} — ${duration}s`);
  console.log(`   Repos studied: ${studied}`);
  console.log(`   New entries: ${totalEntries}`);
  console.log(`   Memory: ${mems} | Learned: ${learned}`);
  console.log(`   PLT actions: ${pltState.totalActions}\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
