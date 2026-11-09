import { strict as assert } from 'node:assert'
import test from 'node:test'
import { makeTarget, matchRule, normalizeDomain, parseRule } from '../src/rules.js'

function target(domain, extra) {
  return makeTarget(Object.assign({ domain: domain }, extra || {}))
}

function rule(line, options) {
  return parseRule(line, 0, options)
}

test('normalizeDomain strips scheme, path, port, wildcard and trailing dot', () => {
  assert.equal(normalizeDomain('HTTPS://WWW.Example.COM/path?q=1'), 'www.example.com')
  assert.equal(normalizeDomain('example.com:443'), 'example.com')
  assert.equal(normalizeDomain('*.example.com.'), 'example.com')
  assert.equal(normalizeDomain('+.example.com'), 'example.com')
  assert.equal(normalizeDomain('[::1]:8080'), '::1')
})

test('normalizeDomain converts IDN to punycode', () => {
  assert.equal(normalizeDomain('例子.中国'), 'xn--fsqu00a.xn--fiqs8s')
})

test('parseRule splits type/payload/policy and keeps trailing flags', () => {
  const parsed = rule('IP-CIDR,192.168.0.0/16,DIRECT,no-resolve')
  assert.equal(parsed.type, 'IP-CIDR')
  assert.equal(parsed.payload, '192.168.0.0/16')
  assert.equal(parsed.policy, 'DIRECT')
  assert.deepEqual(parsed.params, ['no-resolve'])
})

test('parseRule keeps commas inside a DOMAIN-REGEX payload', () => {
  const parsed = rule('DOMAIN-REGEX,^a{1,3}\\.example\\.com$,REJECT')
  assert.equal(parsed.payload, '^a{1,3}\\.example\\.com$')
  assert.equal(parsed.policy, 'REJECT')
})

test('parseRule handles MATCH and comments', () => {
  assert.equal(rule('MATCH,节点选择').policy, '节点选择')
  assert.equal(rule('  # comment'), null)
  assert.equal(rule(''), null)
})

test('parseRule with policyOptional reads a provider payload line', () => {
  const parsed = rule('DOMAIN-SUFFIX,example.com', { policyOptional: true })
  assert.equal(parsed.type, 'DOMAIN-SUFFIX')
  assert.equal(parsed.payload, 'example.com')
  assert.equal(parsed.policy, '')
})

test('DOMAIN is exact; DOMAIN-SUFFIX respects the label boundary', () => {
  assert.equal(matchRule(rule('DOMAIN,example.com,DIRECT'), target('example.com')).kind, 'match')
  assert.equal(matchRule(rule('DOMAIN,example.com,DIRECT'), target('www.example.com')).kind, 'no')
  assert.equal(matchRule(rule('DOMAIN-SUFFIX,example.com,DIRECT'), target('www.example.com')).kind, 'match')
  assert.equal(matchRule(rule('DOMAIN-SUFFIX,example.com,DIRECT'), target('example.com')).kind, 'match')
  assert.equal(matchRule(rule('DOMAIN-SUFFIX,example.com,DIRECT'), target('notexample.com')).kind, 'no')
  assert.equal(matchRule(rule('DOMAIN-SUFFIX,+.example.com,DIRECT'), target('a.example.com')).kind, 'match')
})

test('DOMAIN-KEYWORD and DOMAIN-REGEX', () => {
  assert.equal(matchRule(rule('DOMAIN-KEYWORD,google,PROXY'), target('ads.google.co.uk')).kind, 'match')
  assert.equal(matchRule(rule('DOMAIN-REGEX,^ads?\\.[a-z]+\\.com$,REJECT'), target('ads.example.com')).kind, 'match')
  const broken = rule('DOMAIN-REGEX,[,REJECT')
  assert.equal(matchRule(broken, target('x.com')).kind, 'indeterminate')
  assert.equal(matchRule(broken, target('x.com')).code, 'regex-invalid')
})

test('MATCH always matches; an invalid rule blocks the chain honestly', () => {
  assert.equal(matchRule(rule('MATCH,节点选择'), target('anything')).kind, 'match')
  const invalid = rule('DOMAIN-SUFFIX')
  assert.equal(matchRule(invalid, target('x.com')).kind, 'indeterminate')
})

test('IP-CIDR is decidable with an address, and honest without one', () => {
  const noResolve = rule('IP-CIDR,192.168.0.0/16,DIRECT,no-resolve')
  assert.equal(matchRule(noResolve, target('router.lan')).kind, 'no')
  assert.equal(matchRule(noResolve, target('router.lan', { ip: '192.168.1.1' })).kind, 'match')
  assert.equal(matchRule(noResolve, target('x.com', { ip: '8.8.8.8' })).kind, 'no')

  const resolving = rule('IP-CIDR,10.0.0.0/8,DIRECT')
  assert.equal(matchRule(resolving, target('x.com')).kind, 'indeterminate')
  assert.equal(matchRule(resolving, target('x.com')).code, 'needs-ip')
  assert.equal(matchRule(resolving, target('x.com', { ip: '10.1.2.3' })).kind, 'match')
})

test('IP-CIDR6 works with compressed IPv6 and embedded IPv4', () => {
  assert.equal(matchRule(rule('IP-CIDR6,fc00::/7,DIRECT'), target('x', { ip: 'fc00::1' })).kind, 'match')
  assert.equal(matchRule(rule('IP-CIDR6,2001:db8::/32,DIRECT'), target('x', { ip: '2001:db8::5' })).kind, 'match')
  assert.equal(matchRule(rule('IP-CIDR6,2001:db8::/32,DIRECT'), target('x', { ip: '2001:db9::5' })).kind, 'no')
})

test('GEOIP,CN needs a database; GEOIP,LAN is answerable offline', () => {
  assert.equal(matchRule(rule('GEOIP,CN,DIRECT'), target('x.com')).code, 'geoip-database')
  const lan = rule('GEOIP,LAN,DIRECT')
  assert.equal(matchRule(lan, target('x.com')).code, 'no-ip')
  assert.equal(matchRule(lan, target('x.com', { ip: '192.168.1.1' })).kind, 'match')
  assert.equal(matchRule(lan, target('x.com', { ip: '8.8.8.8' })).kind, 'no')
})

test('SRC-IP-CIDR, DST-PORT and NETWORK use the fields the case supplies', () => {
  assert.equal(matchRule(rule('SRC-IP-CIDR,192.168.0.0/16,DIRECT'), target('x.com')).code, 'needs-source-ip')
  assert.equal(matchRule(rule('SRC-IP-CIDR,192.168.0.0/16,DIRECT'), target('x.com', { sourceIp: '192.168.1.9' })).kind, 'match')
  assert.equal(matchRule(rule('DST-PORT,443,DIRECT'), target('x.com')).code, 'needs-port')
  assert.equal(matchRule(rule('DST-PORT,80/443,DIRECT'), target('x.com', { port: 443 })).kind, 'match')
  assert.equal(matchRule(rule('DST-PORT,8000-9000,DIRECT'), target('x.com', { port: 8080 })).kind, 'match')
  assert.equal(matchRule(rule('DST-PORT,8000-9000,DIRECT'), target('x.com', { port: 80 })).kind, 'no')
  assert.equal(matchRule(rule('NETWORK,udp,DIRECT'), target('x.com')).code, 'needs-network')
  assert.equal(matchRule(rule('NETWORK,udp,DIRECT'), target('x.com', { network: 'udp' })).kind, 'match')
})

test('unsupported rule types are indeterminate with a named reason', () => {
  const verdict = matchRule(rule('PROCESS-NAME,chrome.exe,DIRECT'), target('x.com'))
  assert.equal(verdict.kind, 'indeterminate')
  assert.equal(verdict.code, 'unsupported-type')
  assert.equal(matchRule(rule('FUTURE-TYPE,x,DIRECT'), target('x.com')).code, 'unknown-type')
})

test('RULE-SET without a loaded provider is indeterminate, not a silent no', () => {
  const verdict = matchRule(rule('RULE-SET,cn,DIRECT'), target('x.com'), new Map())
  assert.equal(verdict.kind, 'indeterminate')
  assert.equal(verdict.code, 'provider-unknown')
})
