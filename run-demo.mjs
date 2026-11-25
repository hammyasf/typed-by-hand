// Drives the real app in headless Chrome: types a session with scripted human-like timing, tests paste,
// exports replay file + receipt + video, opens the replay file, and screenshots every state.
// Note: the typing here is scripted by this file, not a person. Real launch numbers must come from a human session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PPTR || 'puppeteer-core');

const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(dir, 'run'); fs.mkdirSync(out, { recursive: true });
const server = http.createServer((q, r) => {
  const f = path.join(dir, 'app', q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(path.join(dir, 'app')) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}); await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  userDataDir: path.join(dir, '.taste-skill', 'chrome-demo'), args: ['--no-first-run'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();

let seed = 11; const rnd = n => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function type(s) {
  for (const ch of s) {
    if (ch === '\n') await page.keyboard.press('Enter'); else await page.keyboard.type(ch);
    await sleep(ch === ' ' ? 90 + rnd(260) : /[.,]/.test(ch) ? 300 + rnd(500) : 45 + rnd(170));
  }
}
async function back(n) { for (let i = 0; i < n; i++) { await page.keyboard.press('Backspace'); await sleep(70 + rnd(90)); } }

const t0 = Date.now();
await page.$eval('#title', e => { e.value = ''; }); await page.type('#title', 'Follow-up note');
await page.click('#pad');
await type('Dear Ms. Patel,\n\nThank you for the interview on Tuesday. I keep thinking about your quesiton');
await sleep(600); await back(5); await type('stion on the onboarding flow, and I think my first answer was too quick.');
await sleep(3400);
await type(' A better one: start with the one thing a new user came to do, and let them finish it before we ask for antyhing');
await sleep(500); await back(6); await type('ything else.');
await sleep(2600);
await type('\n\nBest,\nSam');
const typingMs = Date.now() - t0;
await sleep(1700);
await page.screenshot({ path: path.join(out, 'live-1440.png') });

// replay mid-play
await page.click('#t-replay'); await sleep(300);
await page.click('[data-speed="16"]'); await page.click('#play'); await sleep(1500);
await page.screenshot({ path: path.join(out, 'replay-1440.png') });
await sleep(4000);
const replayText = await page.$eval('#view', e => e.textContent);
const padText = await page.$eval('#pad', e => e.value);

// receipt
await page.click('#t-receipt'); await sleep(1600);
await page.screenshot({ path: path.join(out, 'receipt-1440.png') });
const receipt = await page.$eval('.receipt', e => e.innerText);
await page.click('#x-file'); await sleep(800);
await page.click('#x-png'); await sleep(1200);
await page.click('#x-video');
for (let i = 0; i < 40 && !fs.readdirSync(out).some(f => /\.replay\.(mp4|webm)$/.test(f)); i++) await sleep(1000);

// second page: paste path
await page.click('#new'); await sleep(200);
await page.click('#pad'); await type('My essay. ');
await page.evaluate(() => {
  const p = document.getElementById('pad'), txt = 'This whole paragraph came from somewhere else and was pasted in one go, all at once.';
  p.dispatchEvent(new Event('paste')); p.setRangeText(txt, p.selectionStart, p.selectionEnd, 'end');
  p.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
});
await sleep(1600); await page.click('#t-receipt'); await sleep(1600);
await page.screenshot({ path: path.join(out, 'receipt-pasted-1440.png') });
const pastedReceipt = await page.$eval('.receipt', e => e.innerText);

// phone
await page.click('#docs'); await page.select('#docs', await page.$eval('#docs option:last-child', o => o.value));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await page.click('#t-live'); await sleep(800);
await page.screenshot({ path: path.join(out, 'live-390.png'), fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

// open the exported replay file
const file = fs.readdirSync(out).find(f => f.endsWith('.replay.html'));
let verify = 'no file';
if (file) {
  const p2 = await browser.newPage(); p2.on('pageerror', e => errors.push('replay file: ' + e));
  await p2.setViewport({ width: 1100, height: 800 });
  await p2.goto('file://' + path.join(out, file)); await sleep(800);
  verify = await p2.$eval('#v', e => e.textContent) + ' | ' + await p2.$eval('#m', e => e.textContent);
  await p2.screenshot({ path: path.join(out, 'replay-file.png') });
  // tamper test
  const tampered = fs.readFileSync(path.join(out, file), 'utf8').replace('"text":"Dear', '"text":"Deer');
  fs.writeFileSync(path.join(out, 'tampered.html'), tampered);
  await p2.goto('file://' + path.join(out, 'tampered.html')); await sleep(800);
  verify += ' | tampered: ' + await p2.$eval('#v', e => e.textContent);
}
console.log(JSON.stringify({ typingMs, replayMatches: replayText.replace(/\s+$/, '') === padText.replace(/\s+$/, ''), chars: padText.length,
  receipt, pastedReceipt, overflow390: overflow, verify, files: fs.readdirSync(out), errors }, null, 2));
await browser.close(); server.close();
