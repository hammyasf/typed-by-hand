// Toy landing-page analytics (PostHog, cookieless). Copied into every <toy>/_site by pages.sh.
// Counts the funnel the weekly pick is judged on: view -> gate_open -> signup_submit -> signup_ok,
// plus sponsor/github clicks, video plays, scroll depth (pageleave), heatmaps and masked session replays.
// No cookies or storage: persistence is in memory, so a reload counts as a new visitor.
// The toy apps themselves (e.g. /app/) never load this file.
(() => {
  const KEY = 'phc_sYlyI1rVoZgX5Fg9560HOXk4KK6MsuX7kTabDauD1Jw'; // gitleaks:allow — PostHog project API key: public by design (it ships to every browser). Placeholder = analytics off.
  const HOST = 'https://us.i.posthog.com';
  const toy = location.hostname.split('.')[0];
  const queue = [];
  const track = (event, props = {}) => window.posthog && window.posthog.__loaded
    ? window.posthog.capture(event, { toy, ...props })
    : queue.push([event, props]);
  window.toyTrack = track;
  if (KEY.startsWith('PH_')) return;

  const s = document.createElement('script');
  s.src = HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.full.js';
  s.async = true;
  s.onload = () => {
    window.posthog.init(KEY, {
      api_host: HOST,
      persistence: 'memory',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      enable_heatmaps: true,
      autocapture: true,
      session_recording: { maskAllInputs: true },
      loaded: ph => { ph.register({ toy }); queue.splice(0).forEach(([e, p]) => ph.capture(e, { toy, ...p })); },
    });
  };
  document.head.appendChild(s);

  const where = el => el.closest('section[id], header, footer, nav')?.id || el.closest('section, header, footer, nav')?.tagName.toLowerCase() || 'page';
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#gate') track('gate_open', { from: where(a), label: a.textContent.trim().slice(0, 40) });
    else if (href.includes('github.com/sponsors')) track('sponsor_click', { from: where(a) });
    else if (/github\.com\/hammyasf\/[^/]+\/?$/.test(href)) track('github_click', { from: where(a) });
    else if (href.includes('#NEWSLETTER_LINK') || href.includes('kit.com')) track('newsletter_click', { from: where(a) });
  }, true);

  document.addEventListener('play', e => {
    if (e.target.tagName === 'VIDEO') track('video_play', { src: (e.target.currentSrc || '').split('/').pop() });
  }, true);

  const form = document.querySelector('#gate form');
  if (form) {
    form.addEventListener('submit', () => track('signup_submit'), true);
    const status = form.querySelector('[data-form-status]');
    if (status) new MutationObserver(() => {
      const t = status.textContent.trim();
      if (!t) return;
      if (t === form.dataset.sent) track('signup_ok');
      else if (/not sent/i.test(t)) track('signup_error', { message: t.slice(0, 80) });
      else if (/fix/i.test(t)) track('signup_invalid');
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }
})();
