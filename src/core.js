// Typed by Hand core: keystroke log, replay, stats. No DOM. Shared by the app, exported replay files and selftest.
// An op is [t, at, del, ins, paste]: at ms t since the first op, delete `del` chars at `at`, insert `ins`.
var TBH = (function () {
  function diff(prev, next, t, paste) {
    if (prev === next) return null;
    var max = Math.min(prev.length, next.length), p = 0, s = 0;
    while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
    while (s < max - p && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
    return [t, p, prev.length - p - s, next.slice(p, next.length - s), paste ? 1 : 0];
  }

  function apply(text, op) {
    return text.slice(0, op[1]) + op[3] + text.slice(op[1] + op[2]);
  }

  function rebuild(ops, upto) {
    var text = '', n = upto == null ? ops.length : upto;
    for (var i = 0; i < n; i++) text = apply(text, ops[i]);
    return text;
  }

  // Replay clock: real gaps, but any pause is shown as at most `cap` ms.
  function timeline(ops, cap) {
    cap = cap || 1200;
    var out = [], acc = 0;
    for (var i = 0; i < ops.length; i++) {
      if (i) acc += Math.min(ops[i][0] - ops[i - 1][0], cap);
      out.push(acc);
    }
    return out;
  }

  var SITTING_GAP = 30 * 60 * 1000, ACTIVE_CAP = 30 * 1000, PAUSE = 2000;

  function stats(ops, finalText) {
    var typed = 0, pasted = 0, deleted = 0, keys = 0, pastes = 0, pauses = 0, longest = 0,
        active = 0, sittings = ops.length ? 1 : 0, gaps = [], bins = [];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], gap = i ? o[0] - ops[i - 1][0] : 0;
      if (o[4]) { pasted += o[3].length; pastes++; } else { typed += o[3].length; keys++; }
      deleted += o[2];
      if (i) {
        if (gap > SITTING_GAP) sittings++;
        if (gap > PAUSE && gap <= SITTING_GAP) pauses++;
        if (gap <= SITTING_GAP && gap > longest) longest = gap;
        active += Math.min(gap, ACTIVE_CAP);
        if (!o[4] && o[3].length === 1 && o[2] === 0 && gap < PAUSE) gaps.push(gap);
      }
      var m = Math.floor(active / 60000);
      bins[m] = (bins[m] || 0) + (o[4] ? 0 : o[3].length);
    }
    for (var b = 0; b < bins.length; b++) bins[b] = bins[b] || 0;
    var mean = 0, sd = 0;
    for (var g = 0; g < gaps.length; g++) mean += gaps[g];
    mean = gaps.length ? mean / gaps.length : 0;
    for (g = 0; g < gaps.length; g++) sd += (gaps[g] - mean) * (gaps[g] - mean);
    sd = gaps.length ? Math.sqrt(sd / gaps.length) : 0;
    var cv = mean ? sd / mean : 0,
        total = typed + pasted,
        words = (finalText.match(/\S+/g) || []).length,
        mins = active / 60000,
        matches = rebuild(ops) === finalText;
    var s = {
      ops: ops.length, keys: keys, typed: typed, pasted: pasted, pastes: pastes, deleted: deleted,
      words: words, chars: finalText.length, activeMs: active, wallMs: ops.length ? ops[ops.length - 1][0] - ops[0][0] : 0,
      sittings: sittings, pauses: pauses, longestPause: longest, rhythmCv: cv,
      wpm: mins > 0 ? typed / 5 / mins : 0,
      revision: typed ? deleted / typed : 0,
      pastedShare: total ? pasted / total : 0,
      bins: bins, matches: matches
    };
    s.checks = [
      { id: 'match', ok: matches, label: matches ? 'Replay rebuilds the final text exactly' : 'Replay does not match the text' },
      { id: 'paste', ok: s.pastedShare < 0.05, label: s.pasted ? fmtInt(s.pasted) + ' characters pasted (' + pct(s.pastedShare) + ')' : 'Nothing pasted' },
      { id: 'revise', ok: s.revision >= 0.03, label: pct(s.revision) + ' of typed characters later deleted' },
      { id: 'pause', ok: s.pauses >= Math.max(1, Math.floor(typed / 400)), label: s.pauses + ' pauses longer than 2 s' },
      { id: 'rhythm', ok: gaps.length >= 20 && cv >= 0.35, label: gaps.length < 20 ? 'Too little typing yet to judge rhythm' : cv >= 0.35 ? 'Typing speed varies like a person thinking' : 'Typing speed is unusually even' }
    ];
    var fails = s.checks.filter(function (c) { return !c.ok; }).length;
    s.verdict = !ops.length ? 'empty' : !matches ? 'broken' : fails === 0 ? 'hand' : s.pastedShare >= 0.5 ? 'pasted' : 'mixed';
    return s;
  }

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function pct(x) { var v = x * 100; return (v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function dur(ms) {
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    s = s % 60;
    return h ? h + 'h ' + m + 'm' : m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
  }

  async function sha256(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Fingerprint covers the ops and the final text, so editing either breaks it.
  function fingerprint(ops, text) { return sha256(JSON.stringify(ops) + '\u0000' + text); }

  return { diff: diff, apply: apply, rebuild: rebuild, timeline: timeline, stats: stats,
           fmtInt: fmtInt, pct: pct, dur: dur, sha256: sha256, fingerprint: fingerprint };
})();
if (typeof module !== 'undefined') module.exports = TBH;
