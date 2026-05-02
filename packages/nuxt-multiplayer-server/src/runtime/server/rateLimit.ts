/**
 * Per-peer token-bucket rate limiter. Each peer starts full; tokens refill
 * at `refillPerSecond`. `consume()` returns false when the bucket is empty,
 * signalling the caller to drop the frame (not crash the connection).
 */
export interface TokenBucketOptions {
  capacity: number
  refillPerSecond: number
}

interface Bucket {
  tokens: number
  updatedAt: number
}

export class PeerRateLimiter {
  private buckets = new Map<string, Bucket>()
  readonly capacity: number
  readonly refillPerSecond: number

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity
    this.refillPerSecond = options.refillPerSecond
  }

  /**
   * Attempt to consume one token for `peerId`. Returns `true` if allowed.
   * Silently refills the bucket from elapsed wall-clock time.
   */
  consume(peerId: string, now: number = Date.now()): boolean {
    let bucket = this.buckets.get(peerId)
    if (!bucket) {
      bucket = { tokens: this.capacity, updatedAt: now }
      this.buckets.set(peerId, bucket)
    }
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000)
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond)
    bucket.updatedAt = now

    if (bucket.tokens < 1) {
      return false
    }
    bucket.tokens -= 1
    return true
  }

  forget(peerId: string): void {
    this.buckets.delete(peerId)
  }
}
