import { describe, expect, it } from 'vitest'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../src/fetchPolicy'

describe('fetchPolicy', () => {
  describe('shouldReadCacheFromFetchPolicy', () => {
    it('should return true for cache-and-fetch', () => {
      expect(shouldReadCacheFromFetchPolicy('cache-and-fetch')).toBe(true)
    })

    it('should return true for cache-first', () => {
      expect(shouldReadCacheFromFetchPolicy('cache-first')).toBe(true)
    })

    it('should return true for cache-only', () => {
      expect(shouldReadCacheFromFetchPolicy('cache-only')).toBe(true)
    })

    it('should return false for fetch-only', () => {
      expect(shouldReadCacheFromFetchPolicy('fetch-only')).toBe(false)
    })

    it('should return false for no-cache', () => {
      expect(shouldReadCacheFromFetchPolicy('no-cache')).toBe(false)
    })

    it('should return false for null', () => {
      expect(shouldReadCacheFromFetchPolicy(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(shouldReadCacheFromFetchPolicy(undefined)).toBe(false)
    })
  })

  describe('shouldFetchDataFromFetchPolicy', () => {
    it('should return true for cache-and-fetch', () => {
      expect(shouldFetchDataFromFetchPolicy('cache-and-fetch')).toBe(true)
    })

    it('should return true for cache-first', () => {
      expect(shouldFetchDataFromFetchPolicy('cache-first')).toBe(true)
    })

    it('should return true for fetch-only', () => {
      expect(shouldFetchDataFromFetchPolicy('fetch-only')).toBe(true)
    })

    it('should return true for no-cache', () => {
      expect(shouldFetchDataFromFetchPolicy('no-cache')).toBe(true)
    })

    it('should return false for cache-only', () => {
      expect(shouldFetchDataFromFetchPolicy('cache-only')).toBe(false)
    })

    it('should return false for null', () => {
      expect(shouldFetchDataFromFetchPolicy(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(shouldFetchDataFromFetchPolicy(undefined)).toBe(false)
    })
  })
})
