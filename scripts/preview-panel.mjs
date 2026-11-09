#!/usr/bin/env node
// Renders the real panel component to a static HTML file for docs/screenshots.
//
// This is a preview harness, not a second implementation: it loads src/client.cjs
// itself and supplies a minimal React-compatible shim plus the fixture report the
// host would return. The CSS string is the same one the plugin injects into the
// harness. Nothing here ships in lib/.
//
//   node scripts/preview-panel.mjs
//     -> docs/panel-preview.html   (panel, dark host theme)
//     -> docs/sample-report.html   (the standalone report page)

import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSuite, runVerification } from '../src/verify.js'
import { renderReportHtml } from '../src/report-html.js'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'docs'), { recursive: true })

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const css = require('../src/client-css.cjs')

function createElement(type, props) {
  const merged = Object.assign({}, props === undefined || props === null ? {} : props)
  const children = Array.prototype.slice.call(arguments, 2)
  if (children.length === 1) merged.children = children[0]
  else if (children.length > 1) merged.children = children
  return { type: type, props: merged }
}

const React = {
  createElement: createElement,
  useState: function (initial) {
    return [typeof initial === 'function' ? initial() : initial, function () {}]
  },
  useEffect: function () {},
  useMemo: function (fn) { return fn() },
  useRef: function (value) { return { current: value } },
  Fragment: 'Fragment',
}

function loadClient() {
  const source = readFileSync(join(root, 'src', 'client.cjs'), 'utf8')
  const loaded = { exports: {} }
  const localRequire = function (id) {
    if (id === 'react') return React
    if (id === './client-css.cjs') return css
    throw new Error('preview: unexpected require(' + id + ')')
  }
  const factory = new Function('require', 'module', 'exports', source + '\n//# sourceURL=client.cjs')
  factory(localRequire, loaded, loaded.exports)
  return loaded.exports
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  if (typeof value === 'string' || typeof value === 'number') return escapeHtml(value)
  if (typeof value.type === 'function') return render(value.type(value.props))
  const props = value.props || {}
  const attrs = []
  for (const key of Object.keys(props)) {
    if (key === 'children' || key === 'key') continue
    const item = props[key]
    if (item === undefined || item === null || item === false || typeof item === 'function' || typeof item === 'object') continue
    if (key === 'className') attrs.push('class="' + escapeHtml(item) + '"')
    else if (key === 'htmlFor') attrs.push('for="' + escapeHtml(item) + '"')
    else attrs.push(key + '="' + escapeHtml(String(item)) + '"')
  }
  const open = '<' + value.type + (attrs.length > 0 ? ' ' + attrs.join(' ') : '') + '>'
  return open + render(props.children) + '</' + value.type + '>'
}

const fixtures = join(root, 'fixtures')
const report = runVerification({
  configText: readFileSync(join(fixtures, 'home-wifi.yaml'), 'utf8'),
  configPath: 'fixtures/home-wifi.yaml',
  configDir: fixtures,
  suite: normalizeSuite(JSON.parse(readFileSync(join(fixtures, 'domestic-foreign.json'), 'utf8')), 'fixtures/domestic-foreign.json'),
  baseline: JSON.parse(readFileSync(join(fixtures, 'baseline.json'), 'utf8')),
  now: '2026-11-09T03:20:00.000Z',
})

const state = {
  version: pkg.version,
  stats: { runs: 1, failed: 0, lastMs: 12 },
  defaults: {
    configPath: join(fixtures, 'home-wifi.yaml'),
    suitePath: join(fixtures, 'domestic-foreign.json'),
    baselinePath: join(fixtures, 'baseline.json'),
  },
  demo: {
    configPath: join(fixtures, 'home-wifi.yaml'),
    suitePath: join(fixtures, 'domestic-foreign.json'),
    baselinePath: join(fixtures, 'baseline.json'),
  },
  latest: report,
  history: [],
}

const client = loadClient()
// The panel's report link is an absolute host route (`/dsh-split-proof/report`).
// In this static preview there is no host, so point it at the sample report page
// instead of leaving a 404 link in the screenshot artefact.
const panel = render(React.createElement(client.SplitProofView, { initial: state }))
  .replace('href="/dsh-split-proof/report"', 'href="sample-report.html"')

// The host panel inherits the harness theme; this wrapper reproduces the dark
// theme the GUI is currently using so the screenshot is representative.
const panelHtml = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<title>dsh-split-proof 面板预览</title>',
  '<style>',
  'html,body{margin:0;padding:0;background:#1b1b1d;color:#e9e7e4;',
  'font-family:"Segoe UI Variable Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}',
  '.host{width:auto;max-width:1048px;margin:0 auto;padding:24px 24px 40px;box-sizing:border-box}',
  '.sp-root{height:auto;overflow:visible;display:flex}',
  '.sp-table td .sp-badge{white-space:nowrap}',
  '</style>',
  '<style>' + css + '</style>',
  '</head>',
  '<body><div class="host">' + panel + '</div></body>',
  '</html>',
].join('\n')

writeFileSync(join(root, 'docs', 'panel-preview.html'), panelHtml, 'utf8')
writeFileSync(join(root, 'docs', 'sample-report.html'), renderReportHtml(report, { version: pkg.version }), 'utf8')
console.log('Wrote docs/panel-preview.html and docs/sample-report.html')
console.log('Panel markup: ' + String(panel.length) + ' chars; report cases: ' + String(report.cases.length))
