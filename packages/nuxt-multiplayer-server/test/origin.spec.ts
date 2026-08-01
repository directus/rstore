import { describe, expect, it } from 'vitest'
import { isOriginAllowed } from '../src/runtime/server/origin'

describe('isOriginAllowed', () => {
  it('allows same-origin upgrades by default', () => {
    expect(isOriginAllowed('https://example.com', 'example.com')).toBe(true)
    expect(isOriginAllowed('http://localhost:3000', 'localhost:3000')).toBe(true)
  })

  it('rejects cross-origin upgrades by default', () => {
    expect(isOriginAllowed('https://evil.test', 'example.com')).toBe(false)
    // Port mismatch is a different origin.
    expect(isOriginAllowed('http://localhost:4000', 'localhost:3000')).toBe(false)
    // Subdomain is a different host.
    expect(isOriginAllowed('https://sub.example.com', 'example.com')).toBe(false)
  })

  it('allows requests without an Origin header (non-browser clients)', () => {
    expect(isOriginAllowed(null, 'example.com')).toBe(true)
    expect(isOriginAllowed(undefined, 'example.com')).toBe(true)
    expect(isOriginAllowed('', 'example.com')).toBe(true)
  })

  it('accepts origins from the explicit allowlist', () => {
    expect(isOriginAllowed('https://app.example.com', 'api.example.com', ['https://app.example.com'])).toBe(true)
    // Same-origin still allowed alongside an allowlist.
    expect(isOriginAllowed('https://api.example.com', 'api.example.com', ['https://app.example.com'])).toBe(true)
    // Anything else still rejected.
    expect(isOriginAllowed('https://evil.test', 'api.example.com', ['https://app.example.com'])).toBe(false)
  })

  it('skips the check entirely when allowedOrigins is false', () => {
    expect(isOriginAllowed('https://evil.test', 'example.com', false)).toBe(true)
  })

  it('rejects malformed Origin headers and missing host', () => {
    expect(isOriginAllowed('not a url', 'example.com')).toBe(false)
    expect(isOriginAllowed('https://example.com', null)).toBe(false)
  })
})
