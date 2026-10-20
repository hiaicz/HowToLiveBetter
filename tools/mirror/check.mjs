// 用 CDP 验证镜像产物真的渲染出来了（本机 Edge --dump-dom 不出东西，只能走远程调试端口）
// 用法：node tools/mirror/check.mjs [页面路径或 URL]
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/book.mjs';

const target = process.argv[2] ?? join(ROOT, 'dist-mirror/index.html');
const url = /^https?:/.test(target) ? target : pathToFileURL(resolve(target)).href;
const PORT = 9333;
const ud = mkdtempSync(join(tmpdir(), 'htlb-cdp-'));

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p));
if (!EDGE) throw new Error('找不到 msedge.exe');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`, 'about:blank',
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP 端口没起来');
}

const errors = [];
try {
  await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(6000);

  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.value;
  };
  const stats = await evalJs(`(() => ({
    title: document.title,
    total: (document.getElementById('tot')||{}).textContent,
    shown: (document.getElementById('cnt')||{}).textContent,
    items: document.querySelectorAll('#list .entry, #list .item, #list article').length,
    listText: (document.getElementById('list')||{}).innerText ? document.getElementById('list').innerText.slice(0,60) : '',
    mirrorNote: !!document.querySelector('.mirror-note'),
    adsNodes: document.querySelectorAll('img[src*="ads/"], #tip-mask, #tip-open').length,
    statusLeft: !!document.querySelector('#status'),
  }))()`);

  console.log('页面：' + url);
  console.log('  title       : ' + stats.title);
  console.log('  条目统计    : 显示 ' + stats.shown + ' / 共 ' + stats.total);
  console.log('  列表节点数  : ' + stats.items);
  console.log('  列表首行    : ' + String(stats.listText).replace(/\s+/g, ' ').slice(0, 50));
  console.log('  镜像说明块  : ' + (stats.mirrorNote ? '有' : '无'));
  console.log('  广告/赞赏节点: ' + stats.adsNodes);
  console.log('  加载中状态条: ' + (stats.statusLeft ? '仍在（说明没渲染完）' : '已移除（正常）'));
  console.log('  JS 异常     : ' + (errors.length ? errors.length + ' 条 → ' + errors[0].slice(0, 200) : '无'));

  const ok = !!stats.title && !stats.statusLeft && stats.items > 0 && stats.adsNodes === 0 && errors.length === 0;
  console.log(ok ? '✅ 渲染验证通过' : '❌ 渲染验证未通过');
  ws.close();
  process.exitCode = ok ? 0 : 1;
} finally {
  proc.kill();
  await sleep(500);
  try { rmSync(ud, { recursive: true, force: true }); } catch {}
}
