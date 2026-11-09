// IP helpers used by the rule engine: CIDR containment for the rule types that
// can be decided offline, and private-address detection for `GEOIP,LAN`.
//
// The verifier never resolves DNS. An IP rule reached by a domain-only test case
// is reported as indeterminate, not as "no match": the real router would resolve
// first, and pretending otherwise would turn a blind spot into a green check.

export function parseIpv4(text) {
  const parts = String(text).split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

export function ipv4InCidr(ip, cidr) {
  const slash = String(cidr).indexOf('/')
  const baseText = slash < 0 ? String(cidr) : String(cidr).slice(0, slash)
  const bits = slash < 0 ? 32 : Number(String(cidr).slice(slash + 1))
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const base = parseIpv4(baseText)
  const target = parseIpv4(ip)
  if (base === null || target === null) return null
  if (bits === 0) return true
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0
  return ((base & mask) >>> 0) === ((target & mask) >>> 0)
}

// IPv6 is parsed to an eight-group array so containment does not depend on any
// platform library. An embedded IPv4 tail (`::ffff:1.2.3.4`) is accepted.
export function parseIpv6(text) {
  let value = String(text).trim().toLowerCase()
  if (value.indexOf('%') >= 0) value = value.slice(0, value.indexOf('%'))
  if (value.length === 0) return null
  const tail = value.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (tail !== null) {
    const v4 = parseIpv4(tail[1])
    if (v4 === null) return null
    const high = Math.floor(v4 / 65536)
    const low = v4 % 65536
    value = value.slice(0, -tail[1].length) + high.toString(16) + ':' + low.toString(16)
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  function groups(part) {
    if (part === '') return []
    return part.split(':')
  }
  const head = groups(halves[0])
  const rest = halves.length === 2 ? groups(halves[1]) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 && head.length !== 8) return null
  if (missing < 0) return null
  const pieces = head.concat(new Array(missing).fill('0'), rest)
  if (pieces.length !== 8) return null
  const out = []
  for (const piece of pieces) {
    if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
    out.push(parseInt(piece, 16))
  }
  return out
}

export function ipv6InCidr(ip, cidr) {
  const slash = String(cidr).indexOf('/')
  const baseText = slash < 0 ? String(cidr) : String(cidr).slice(0, slash)
  const bits = slash < 0 ? 128 : Number(String(cidr).slice(slash + 1))
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return null
  const base = parseIpv6(baseText)
  const target = parseIpv6(ip)
  if (base === null || target === null) return null
  let remaining = bits
  for (let i = 0; i < 8; i++) {
    if (remaining <= 0) return true
    const width = Math.min(16, remaining)
    const mask = width === 16 ? 0xffff : (0xffff << (16 - width)) & 0xffff
    if ((base[i] & mask) !== (target[i] & mask)) return false
    remaining -= width
  }
  return true
}

export function inCidr(ip, cidr) {
  const text = String(cidr)
  const base = text.split('/')[0]
  if (String(ip).indexOf(':') >= 0 || base.indexOf(':') >= 0) return ipv6InCidr(ip, cidr)
  return ipv4InCidr(ip, cidr)
}

/** RFC 1918 / RFC 4193 / loopback / link-local — the ranges `GEOIP,LAN` means. */
export function isPrivateIp(ip) {
  const v4 = parseIpv4(ip)
  if (v4 !== null) {
    return ipv4InCidr(ip, '10.0.0.0/8') === true ||
      ipv4InCidr(ip, '172.16.0.0/12') === true ||
      ipv4InCidr(ip, '192.168.0.0/16') === true ||
      ipv4InCidr(ip, '127.0.0.0/8') === true ||
      ipv4InCidr(ip, '169.254.0.0/16') === true
  }
  const v6 = parseIpv6(ip)
  if (v6 === null) return null
  return ipv6InCidr(ip, 'fc00::/7') === true || ipv6InCidr(ip, '::1/128') === true || ipv6InCidr(ip, 'fe80::/10') === true
}
