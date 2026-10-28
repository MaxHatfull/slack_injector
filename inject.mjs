import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.SLACK_CDP_PORT || '9222';
const CSS_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), 'slack.css');
const STYLE_ID = 'slack-contrast-css';
const log = (...a) => console.log(new Date().toISOString(), ...a);

const injector = (css) => `(() => {
  const css = ${JSON.stringify(css)};
  const apply = () => {
    if (!document.head) return false;
    let el = document.getElementById(${JSON.stringify(STYLE_ID)});
    if (!el) { el = document.createElement('style'); el.id = ${JSON.stringify(STYLE_ID)}; document.head.appendChild(el); }
    if (el.textContent !== css) el.textContent = css;
    return true;
  };
  if (!apply()) new MutationObserver((_, o) => { if (apply()) o.disconnect(); }).observe(document.documentElement, { childList: true });
})();`;

const waitForPort = async () => {
  for (;;) {
    try { return await (await fetch(`http://localhost:${PORT}/json/version`)).json(); }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
};

const run = async () => {
  const { webSocketDebuggerUrl } = await waitForPort();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const attached = new Set();
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msgId = ++id; pending.set(msgId, { res, rej });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const css = () => fs.readFileSync(CSS_PATH, 'utf8');
  const inject = async (sessionId, url) => {
    const expression = injector(css());
    await send('Page.enable', {}, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: expression }, sessionId);
    await send('Runtime.evaluate', { expression }, sessionId);
    log('injected into', url);
  };
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = m.params;
      if (targetInfo.type === 'page' && !attached.has(sessionId)) {
        attached.add(sessionId);
        inject(sessionId, targetInfo.url).catch(err => log('inject failed', targetInfo.url, err.message));
      }
      if (m.params.waitingForDebugger) send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    }
    if (m.method === 'Target.detachedFromTarget') attached.delete(m.params.sessionId);
  };
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  fs.unwatchFile(CSS_PATH);
  fs.watchFile(CSS_PATH, { interval: 1000 }, () => {
    log('slack.css changed, re-injecting');
    for (const s of attached) send('Runtime.evaluate', { expression: injector(css()) }, s).catch(() => {});
  });
  log(`attached to Slack on port ${PORT}`);
  await new Promise(res => ws.onclose = res);
  log('Slack closed the debugging connection');
};

for (;;) { try { await run(); } catch (err) { log('error:', err.message); } await new Promise(r => setTimeout(r, 2000)); }
