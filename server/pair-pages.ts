const STYLE = `<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;
background:#0d1117;color:#f0f6fc;font:16px/24px system-ui,sans-serif;text-align:center}
main{width:100%;max-width:342px;display:flex;flex-direction:column;align-items:center}
svg{display:block;margin-bottom:16px;color:#9198a1}
h1{margin:0 0 8px;font:600 20px/28px system-ui,sans-serif}
p{margin:0}
.muted{color:#9198a1}
.card{box-sizing:border-box;width:100%;padding:16px;border:1px solid #da3633;border-radius:6px;background:#25181c}
.card h1{color:#f85149}
[hidden]{display:none}
</style>`;

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1117"><title>Nod</title>${STYLE}`;

const GLYPH = `<svg width="48" height="48" viewBox="0 0 16 16" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4.25" y="1.75" width="7.5" height="12.5" rx="2"/><path d="M7 12h2"/></g></svg>`;

const NOT_PAIRED_TEXT =
  "On your computer, open Nod and click the phone icon in the top bar. Then scan the code with this phone's camera.";
const RETRY_TEXT = 'On your computer, open Nod, click the phone icon in the top bar and scan the new code.';

/** Served to a tailnet request with no valid device key. Holds no data and no token. */
export const NOT_PAIRED_HTML = `<!doctype html><html lang="en"><head>${HEAD}</head><body><main>${GLYPH}
<h1>Not paired</h1>
<p role="status">${NOT_PAIRED_TEXT}</p></main></body></html>`;

/**
 * The pairing link target. The code rides in the URL fragment, so it never reaches a server log.
 * The query (such as `?apk=`) carries over to the inbox, and the fragment is dropped.
 */
export const PAIR_HTML = `<!doctype html><html lang="en"><head>${HEAD}</head><body><main id="box">${GLYPH}
<h1 id="title">Pairing...</h1>
<p id="msg" class="muted" role="status">Keep this page open.</p></main>
<script>
(function () {
  var box = document.getElementById('box');
  var title = document.getElementById('title');
  var msg = document.getElementById('msg');
  var code = new URLSearchParams(location.hash.slice(1)).get('code');
  function show(heading, text, failed) {
    title.textContent = heading;
    msg.textContent = text;
    msg.className = '';
    if (failed) {
      msg.setAttribute('role', 'alert');
      var card = document.createElement('div');
      card.className = 'card';
      box.replaceChild(card, title);
      card.appendChild(title);
      card.appendChild(msg);
    }
  }
  if (!code) { show('Not paired', ${JSON.stringify(NOT_PAIRED_TEXT)}, false); return; }
  fetch('/api/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: code })
  }).then(function (res) {
    if (res.ok) { location.replace('/' + location.search); return; }
    return res.json().then(function (b) { throw new Error(b.error || ''); });
  }).catch(function (e) {
    history.replaceState(null, '', location.pathname);
    var text = ${JSON.stringify(RETRY_TEXT)};
    var m = e && e.message ? String(e.message).replace(/\\.$/, '') : '';
    show('Pairing failed', m ? m + '. ' + text : text, true);
  });
})();
</script></body></html>`;
