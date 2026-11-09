#!/usr/bin/env node
// Full-page screenshots through the Chrome DevTools Protocol.
//
// Headless Chrome's --screenshot only captures the viewport, and the report is
// taller than any sensible window. This drives CDP directly: navigate, measure
// the document, then capture beyond the viewport. No npm dependency is needed —
// Node 22+ ships fetch and WebSocket.
//
//   node scripts/screenshot.mjs docs/panel-preview.html docs/panel.png 1048
//   node scripts/screenshot.mjs docs/sample-report.html docs/report.png 1280

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('用法：node scripts/screenshot.mjs <html> <png> [宽度]')
  process.exit(2)
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const input = resolve(root, args[0])
const output = resolve(root, args[1])
const width = Number(args[2] || 1280)

function chromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      readFileSync(candidate)
      return candidate
    } catch (error) {
      // try the next one
    }
  }
  return undefined
}

function sleep(ms) {
  return new Promise(function (resolveSleep) { setTimeout(resolveSleep, ms) })
}

async function waitForPort(dir) {
  for (let i = 0; i < 100; i++) {
    try {
      const text = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8')
      const port = Number(text.split(/\r?\n/)[0])
      if (Number.isInteger(port) && port > 0) return port
    } catch (error) {
      // not up yet
    }
    await sleep(100)
  }
  throw new Error('Chrome did not open a debugging port')
}

function connect(wsUrl) {
  return new Promise(function (resolveConnect, rejectConnect) {
    const ws = new WebSocket(wsUrl)
    let nextId = 0
    const pending = new Map()
    const events = new Map()
    const api = {
      send: function (method, params) {
        return new Promise(function (resolveSend, rejectSend) {
          const id = ++nextId
          pending.set(id, { resolve: resolveSend, reject: rejectSend })
          ws.send(JSON.stringify({ id: id, method: method, params: params || {} }))
        })
      },
      once: function (method) {
        return new Promise(function (resolveEvent) {
          const list = events.get(method) || []
          list.push(resolveEvent)
          events.set(method, list)
        })
      },
      close: function () { ws.close() },
    }
    ws.onopen = function () { resolveConnect(api) }
    ws.onerror = function (error) { rejectConnect(error) }
    ws.onmessage = function (message) {
      const data = JSON.parse(message.data)
      if (data.id !== undefined) {
        const slot = pending.get(data.id)
        if (slot === undefined) return
        pending.delete(data.id)
        if (data.error !== undefined) slot.reject(new Error(data.error.message))
        else slot.resolve(data.result)
        return
      }
      const list = events.get(data.method)
      if (list !== undefined && list.length > 0) list.shift()(data.params)
    }
  })
}

const userDataDir = mkdtempSync(join(tmpdir(), 'split-proof-chrome-'))
const chrome = spawn(chromePath() || CHROME_CANDIDATES[0], [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--force-device-scale-factor=1',
  '--remote-debugging-port=0',
  '--user-data-dir=' + userDataDir,
  'about:blank',
], { stdio: 'ignore' })

try {
  const port = await waitForPort(userDataDir)
  const created = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent('file:///' + input.replace(/\\/g, '/')), { method: 'PUT' })
  const target = await created.json()
  const api = await connect(target.webSocketDebuggerUrl)
  await api.send('Page.enable')
  // Fix the layout width before measuring: a narrow default viewport makes the
  // report taller, and that inflated height would become empty space at the
  // bottom of the screenshot.
  await api.send('Emulation.setDeviceMetricsOverride', {
    width: width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await api.send('Emulation.setVisibleSize', { width: width, height: 900 }).catch(function () {})
  const loaded = api.once('Page.loadEventFired')
  await api.send('Page.navigate', { url: 'file:///' + input.replace(/\\/g, '/') })
  await loaded
  await api.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(function(){return true})', awaitPromise: true })
  const metrics = await api.send('Runtime.evaluate', {
    expression: '({height: Math.ceil(document.documentElement.scrollHeight), width: Math.ceil(document.documentElement.scrollWidth)})',
    returnByValue: true,
  })
  const measured = metrics.result.value
  const height = Math.max(200, measured.height)
  const pageWidth = Math.max(width, measured.width)
  await api.send('Emulation.setDeviceMetricsOverride', {
    width: pageWidth,
    height: height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise(function (resolveSleep) { setTimeout(resolveSleep, 100) })
  const shot = await api.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: pageWidth, height: height, scale: 1 },
  })
  writeFileSync(output, Buffer.from(shot.data, 'base64'))
  console.log('Wrote ' + output + ' (' + String(pageWidth) + 'x' + String(height) + ')')
  api.close()
  await fetch('http://127.0.0.1:' + port + '/json/close/' + target.id).catch(function () {})
} finally {
  chrome.kill()
  await sleep(200)
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  } catch (error) {
    // A locked profile directory is not worth failing the screenshot over.
  }
}
