import fs from 'node:fs';

const PORT = process.env.SLACK_CDP_PORT || '9222';
const expression = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf8')
  : `(() => {
      const cs = el => el && getComputedStyle(el).color;
      return JSON.stringify({
        body: cs(document.querySelector('.p-rich_text_section')),
        list: cs(document.querySelector('.p-rich_text_list li')),
        sender: cs(document.querySelector('.c-message__sender')),
        injected: !!document.getElementById('slack-contrast-css'),
      }, null, 1);
    })()`;

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find(t => t.type === 'page' && t.url.startsWith('https://app.slack.com'));
if (!page) { console.error('no app.slack.com page target on port', PORT); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id !== 1) return;
  console.log(m.result?.result?.value ?? JSON.stringify(m, null, 1));
  ws.close();
};
