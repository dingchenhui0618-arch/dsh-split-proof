// The rule engine: ordered evaluation with first-match-wins.
//
// Two behaviours are worth pinning because they decide the whole report:
//  * the FIRST rule that cannot be decided offline ends the walk. A later rule
//    matching does not make the verdict known, because the undecidable rule might
//    have matched first.
//  * `PASS` as a policy means "skip this rule and keep going" (Mihomo). It is
//    recorded in the proof so the reader can see it was deliberately passed.

import { matchRule } from './rules.js'

function isPassPolicy(policy) {
  return String(policy === undefined || policy === null ? '' : policy).trim().toLowerCase() === 'pass'
}

/**
 * Walk one target through the rules.
 * Returns:
 *   { verdict: 'matched', rule, policy, passed: [ruleIndex...] }
 *   { verdict: 'indeterminate', rule, code, reason, passed: [...] }
 *   { verdict: 'unmatched', passed: [...] }
 */
export function evaluateRules(rules, target, providers) {
  const passed = []
  for (const rule of rules) {
    const outcome = matchRule(rule, target, providers)
    if (outcome.kind === 'no') continue
    if (outcome.kind === 'indeterminate') {
      return {
        verdict: 'indeterminate',
        rule: rule,
        code: outcome.code,
        reason: outcome.reason,
        passed: passed,
      }
    }
    if (isPassPolicy(rule.policy)) {
      passed.push(rule.index)
      continue
    }
    return {
      verdict: 'matched',
      rule: rule,
      policy: rule.policy,
      passed: passed,
    }
  }
  return { verdict: 'unmatched', passed: passed }
}
