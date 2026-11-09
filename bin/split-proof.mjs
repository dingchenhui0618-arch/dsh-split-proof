#!/usr/bin/env node
// Runs the source directly in a checkout, and the built copy in an installed
// package. Both paths exist on purpose: `npm test` never needs a build.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const built = new URL('../lib/cli.js', import.meta.url)
const source = new URL('../src/cli.js', import.meta.url)
const target = existsSync(fileURLToPath(built)) ? built : source
const { main } = await import(target.href)
process.exitCode = await main(process.argv.slice(2))
