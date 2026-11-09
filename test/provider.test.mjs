import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { describeProviders, loadProviders } from '../src/provider.js'
import { makeTarget } from '../src/rules.js'

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), 'split-proof-provider-'))
  for (const name of Object.keys(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, files[name], 'utf8')
  }
  return dir
}

function t(domain, extra) {
  return makeTarget(Object.assign({ domain: domain }, extra || {}))
}

const CLASSICAL = 'payload:\n  - DOMAIN-SUFFIX,bilibili.com\n  - DOMAIN-KEYWORD,zhihu\n'

test('classical providers match their payload rules and report provenance-bearing status', () => {
  const dir = workspace({ 'rules/domestic.yaml': CLASSICAL })
  const providers = loadProviders({
    domestic: { type: 'file', behavior: 'classical', format: 'yaml', path: './rules/domestic.yaml' },
  }, dir)
  const provider = providers.get('domestic')
  assert.equal(provider.status, 'loaded')
  assert.equal(provider.entries.length, 2)
  assert.equal(provider.match(t('www.bilibili.com')).kind, 'match')
  assert.equal(provider.match(t('www.zhihu.com')).kind, 'match')
  assert.equal(provider.match(t('example.com')).kind, 'no')
  const described = describeProviders(providers)
  assert.equal(described[0].count, 2)
  assert.equal(described[0].match, undefined)
})

test('domain providers suffix-match each payload line, including +. prefixes', () => {
  const dir = workspace({ 'ads.yaml': "payload:\n  - '+.doubleclick.net'\n  - '*.adservice.google.com'\n" })
  const providers = loadProviders({
    ads: { type: 'file', behavior: 'domain', format: 'yaml', path: 'ads.yaml' },
  }, dir)
  const provider = providers.get('ads')
  assert.equal(provider.status, 'loaded')
  assert.equal(provider.match(t('ads.doubleclick.net')).kind, 'match')
  assert.equal(provider.match(t('doubleclick.net')).kind, 'match')
  assert.equal(provider.match(t('adservice.google.com')).kind, 'match')
  assert.equal(provider.match(t('safe.example.com')).kind, 'no')
})

test('ipcidr providers need an address and then answer by CIDR', () => {
  const dir = workspace({ 'cn-ip.txt': '10.0.0.0/8\n192.168.0.0/16\n' })
  const providers = loadProviders({
    'cn-ip': { type: 'file', behavior: 'ipcidr', path: 'cn-ip.txt' },
  }, dir)
  const provider = providers.get('cn-ip')
  assert.equal(provider.status, 'loaded')
  assert.equal(provider.match(t('x.com')).code, 'needs-ip')
  assert.equal(provider.match(t('x.com', { ip: '192.168.2.3' })).kind, 'match')
  assert.equal(provider.match(t('x.com', { ip: '8.8.8.8' })).kind, 'no')
})

test('a text-format classical provider also loads', () => {
  const dir = workspace({ 'cn.list': '# comment\nDOMAIN-SUFFIX,qq.com\nDOMAIN,weixin.qq.com\n' })
  const providers = loadProviders({
    cn: { type: 'file', behavior: 'classical', format: 'text', path: 'cn.list' },
  }, dir)
  assert.equal(providers.get('cn').status, 'loaded')
  assert.equal(providers.get('cn').match(t('www.qq.com')).kind, 'match')
})

test('a missing provider file is a stated limitation, not an empty rule set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-proof-provider-'))
  const providers = loadProviders({
    gone: { type: 'file', behavior: 'classical', path: './gone.yaml' },
  }, dir)
  assert.equal(providers.get('gone').status, 'missing')
  assert.match(providers.get('gone').reason, /不存在/)
  assert.equal(providers.get('gone').match, undefined)
})

test('remote providers are never fetched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-proof-provider-'))
  const providers = loadProviders({
    remote: { type: 'http', behavior: 'classical', url: 'https://rules.example.invalid/cn.yaml' },
  }, dir)
  const provider = providers.get('remote')
  assert.equal(provider.status, 'remote')
  assert.match(provider.reason, /不联网/)
})

test('a local cache behind an http provider is read and marked as cached', () => {
  const dir = workspace({ 'cached.yaml': CLASSICAL })
  const providers = loadProviders({
    cn: { type: 'http', behavior: 'classical', format: 'yaml', url: 'https://rules.example.invalid/cn.yaml', path: 'cached.yaml' },
  }, dir)
  const provider = providers.get('cn')
  assert.equal(provider.status, 'loaded')
  assert.equal(provider.cached, true)
  assert.equal(provider.match(t('bilibili.com')).kind, 'match')
})

test('provider paths outside the config directory are refused', () => {
  const outside = mkdtempSync(join(tmpdir(), 'split-proof-outside-'))
  writeFileSync(join(outside, 'secret.yaml'), CLASSICAL, 'utf8')
  const dir = mkdtempSync(join(tmpdir(), 'split-proof-provider-'))
  const providers = loadProviders({
    cn: { type: 'file', behavior: 'classical', path: join(outside, 'secret.yaml') },
  }, dir)
  assert.equal(providers.get('cn').status, 'outside')
  const allowed = loadProviders({
    cn: { type: 'file', behavior: 'classical', path: join(outside, 'secret.yaml') },
  }, dir, { allowOutside: true })
  assert.equal(allowed.get('cn').status, 'loaded')
})

test('unknown behavior and malformed YAML are labelled, never silent', () => {
  const dir = workspace({ 'bad.yaml': 'payload: [unclosed\n' })
  const providers = loadProviders({
    weird: { type: 'file', behavior: 'quantum', path: 'bad.yaml' },
    bad: { type: 'file', behavior: 'classical', format: 'yaml', path: 'bad.yaml' },
  }, dir)
  assert.equal(providers.get('weird').status, 'unsupported')
  assert.equal(providers.get('bad').status, 'unreadable')
})
