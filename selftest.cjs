// node selftest.cjs — fails loudly if the keystroke log, replay or stats break.
const T = require('./src/core.js');
const ok = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

// diff + apply round trip over random edits
let text = '', ops = [], t = 0, seed = 7;
const rnd = n => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
for (let i = 0; i < 3000; i++) {
  const at = rnd(text.length + 1), del = rnd(3) === 0 ? rnd(Math.min(5, text.length - at) + 1) : 0;
  const ins = rnd(4) === 0 ? '' : 'aé😀 b\n'.slice(rnd(4), 1 + rnd(6));
  const next = text.slice(0, at) + ins + text.slice(at + del);
  const op = T.diff(text, next, (t += 40 + rnd(400)), false);
  if (op) { ops.push(op); ok(T.apply(text, op) === next, 'apply(diff) at op ' + i); }
  text = next;
}
ok(T.rebuild(ops) === text, 'rebuild equals final text');
ok(T.diff('same', 'same', 0) === null, 'no-op diff is null');

// stats: a steady robot vs a hesitant person
const robot = [], human = [];
let r = '', h = '';
'the quick brown fox jumps'.split('').forEach((c, i) => { robot.push(T.diff(r, r + c, i * 100)); r += c; });
let ht = 0;
'the quikc'.split('').forEach(c => { human.push(T.diff(h, h + c, (ht += 80 + rnd(300)))); h += c; });
human.push(T.diff(h, 'the qui', (ht += 3000))); h = 'the qui';
'ck brown fox jumps over the dog'.split('').forEach(c => { human.push(T.diff(h, h + c, (ht += 60 + rnd(500)))); h += c; });
const sr = T.stats(robot, r), sh = T.stats(human, h);
ok(sr.rhythmCv < 0.05 && sr.verdict !== 'hand', 'even robot rhythm is flagged');
ok(sh.verdict === 'hand', 'hesitant typing with a fix passes, got ' + sh.verdict + ' ' + JSON.stringify(sh.checks));
ok(sh.deleted === 2 && sh.pauses === 1, 'deleted/pauses counted');

const pasted = [T.diff('', 'a whole essay from somewhere else', 0, true)];
ok(T.stats(pasted, 'a whole essay from somewhere else').verdict === 'pasted', 'paste verdict');
ok(T.stats(ops, text + 'x').verdict === 'broken', 'tampered text is caught');
ok(T.timeline([[0], [10000], [10100]], 1200).join() === '0,1200,1300', 'timeline caps pauses');

T.fingerprint(ops, text).then(a => T.fingerprint(ops, text + ' ').then(b => {
  ok(a.length === 64 && a !== b, 'fingerprint changes with text');
  console.log('selftest ok: ' + ops.length + ' random edits round-tripped, verdicts and fingerprint checked');
}));
