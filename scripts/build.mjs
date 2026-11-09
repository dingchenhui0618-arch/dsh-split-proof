#!/usr/bin/env node
// Dependency-free build.
//
// The host half is plain ESM whose only imports are node: builtins and its own
// sibling modules, so copying src/*.js into lib/ is a complete build — no
// bundler, no devDependency, nothing that can fail to install.
//
// The client half is CommonJS loaded through window.__ModuleLoader__ with a
// harness-provided require(), so it must carry no relative require of its own.
// The one relative require (the stylesheet) is inlined below, and the build fails
// loudly if that require changes shape.

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { wrapClient } from './wrap-client.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'lib')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

// host.js becomes index.js; every other module keeps its name. A new src/*.js
// that is neither copied nor explicitly skipped fails the build instead of being
// silently left out of the package.
const SKIP = new Set(['client.cjs', 'client-css.cjs'])
const entries = await readdir(join(root, 'src'))
for (const entry of entries) {
  if (!entry.endsWith('.js') && !entry.endsWith('.cjs')) continue
  if (SKIP.has(entry)) continue
  const target = entry === 'host.js' ? 'index.js' : entry
  await copyFile(join(root, 'src', entry), join(out, target))
}
const copied = entries.filter((entry) => (entry.endsWith('.js') || entry.endsWith('.cjs')) && !SKIP.has(entry))
if (copied.length === 0) throw new Error('src/ has no host modules to copy')

const cssModule = await import(pathToFileURL(join(root, 'src', 'client-css.cjs')).href)
const css = cssModule.default
if (typeof css !== 'string' || css.length === 0) {
  throw new Error('src/client-css.cjs did not export a non-empty CSS string')
}

const clientSource = await readFile(join(root, 'src', 'client.cjs'), 'utf8')
const CSS_REQUIRE = /require\((['"])\.\/client-css\.cjs\1\)/
if (!CSS_REQUIRE.test(clientSource)) {
  throw new Error('src/client.cjs no longer requires ./client-css.cjs — update scripts/build.mjs')
}

const bundle = wrapClient(clientSource.replace(CSS_REQUIRE, JSON.stringify(css)), pkg.name)
await writeFile(join(out, 'client.js'), bundle)

// Compile the client bundle and import the host module: a broken build fails
// here rather than in the browser, where the error is much harder to read.
new Function(bundle)
const host = await import(pathToFileURL(join(out, 'index.js')).href)
if (host.name !== pkg.name || typeof host.apply !== 'function') {
  throw new Error('invalid host plugin export: expected name "' + pkg.name + '" and an apply() function')
}

console.log('Built ' + pkg.name + ' ' + pkg.version + ': lib/index.js and lib/client.js (' + String(copied.length) + ' modules)')
