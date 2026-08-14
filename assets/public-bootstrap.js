(() => {
  'use strict';

  if (new URLSearchParams(window.location.search).get('demo') === '1') return;
  const apiUrl = String(window.TRAINING_SIGN_WEB_APP_URL || window.TRAINING_SIGN_CONFIG?.API_URL || '').trim();
  const shareToken = new URLSearchParams(window.location.hash.slice(1)).get('k') || '';
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(shareToken)) return;

  try {
    const url = new URL(apiUrl);
    if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return;
  } catch (error) {
    return;
  }

  const promise = fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'get_public_data', shareToken }),
    redirect: 'follow',
    cache: 'no-store'
  }).then(
    response => ({ response }),
    error => ({ error })
  );

  window.TRAINING_SIGN_PUBLIC_DATA_PREFETCH = { apiUrl, shareToken, promise };
})();
