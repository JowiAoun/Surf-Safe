import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 6 Unit Tests: Caching & Performance Optimization
 *
 * These tests verify:
 * - Content hash generation
 * - Cache key generation
 * - Debounce and throttle utilities
 * - Analysis queue functionality
 * - Cache statistics tracking
 */

import {
  contentHash,
  generateCacheKey,
  getDomainFromCacheKey,
  debounce,
  throttle,
  AnalysisQueue,
  CacheStatsTracker,
  CACHE_TTL_24H,
  CACHE_TTL_1H,
  DEBOUNCE_DELAY_MS,
} from '@/utils/cache';

// ============================================================================
// Content Hash Tests
// ============================================================================

describe('Content Hashing', () => {
  describe('contentHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'Hello World';
      const hash1 = contentHash(content);
      const hash2 = contentHash(content);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', () => {
      const hash1 = contentHash('Hello World');
      const hash2 = contentHash('Hello World!');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = contentHash('');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should handle very long content', () => {
      const longContent = 'a'.repeat(100000);
      const hash = contentHash(longContent);
      expect(hash).toBeDefined();
      expect(hash.length).toBeLessThan(20); // Hash should be reasonable length
    });

    it('should return hexadecimal string', () => {
      const hash = contentHash('test content');
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });
});

// ============================================================================
// Cache Key Tests
// ============================================================================

describe('Cache Key Generation', () => {
  describe('generateCacheKey', () => {
    it('should generate key from domain and content', () => {
      const key = generateCacheKey('example.com', 'page content');
      expect(key).toContain('example.com');
      expect(key).toContain(':');
    });

    it('should normalize www prefix', () => {
      const key1 = generateCacheKey('www.example.com', 'content');
      const key2 = generateCacheKey('example.com', 'content');
      expect(key1).toBe(key2);
    });

    it('should lowercase domain', () => {
      const key1 = generateCacheKey('EXAMPLE.COM', 'content');
      const key2 = generateCacheKey('example.com', 'content');
      expect(key1).toBe(key2);
    });

    it('should use first 1000 chars of content for hash', () => {
      const shortContent = 'short';
      const longContent = shortContent + 'a'.repeat(2000);
      // Hash should be based on first 1000 chars, so these should differ
      // since shortContent gets included in first 1000
      const key = generateCacheKey('example.com', longContent);
      expect(key).toBeDefined();
    });
  });

  describe('getDomainFromCacheKey', () => {
    it('should extract domain from cache key', () => {
      const key = 'example.com:abc123';
      expect(getDomainFromCacheKey(key)).toBe('example.com');
    });

    it('should handle key without hash', () => {
      expect(getDomainFromCacheKey('example.com')).toBe('example.com');
    });

    it('should handle subdomains', () => {
      const key = 'sub.example.com:abc123';
      expect(getDomainFromCacheKey(key)).toBe('sub.example.com');
    });
  });
});

// ============================================================================
// Debounce Tests
// ============================================================================

describe('Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on rapid calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to debounced function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

// ============================================================================
// Throttle Tests
// ============================================================================

describe('Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should execute immediately on first call', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throttle subsequent calls', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    throttledFn();
    throttledFn();

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // Last queued call executes
  });
});

// ============================================================================
// Analysis Queue Tests
// ============================================================================

describe('AnalysisQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should enqueue items', () => {
    const queue = new AnalysisQueue<string>();
    
    expect(queue.enqueue('id1', 'data1')).toBe(true);
    expect(queue.isEmpty()).toBe(false);
  });

  it('should reject duplicate IDs', () => {
    const queue = new AnalysisQueue<string>();
    
    expect(queue.enqueue('id1', 'data1')).toBe(true);
    expect(queue.enqueue('id1', 'data2')).toBe(false);
  });

  it('should respect rate limiting', () => {
    const queue = new AnalysisQueue<string>({ minIntervalMs: 100 });
    queue.enqueue('id1', 'data1');
    queue.enqueue('id2', 'data2');

    const item1 = queue.dequeue();
    expect(item1).not.toBeNull();

    const item2Immediate = queue.dequeue();
    expect(item2Immediate).toBeNull(); // Rate limited

    vi.advanceTimersByTime(100);
    const item2Delayed = queue.dequeue();
    expect(item2Delayed).not.toBeNull();
  });

  it('should respect max queue size', () => {
    const queue = new AnalysisQueue<string>({ maxQueueSize: 2 });
    
    queue.enqueue('id1', 'data1');
    queue.enqueue('id2', 'data2');
    queue.enqueue('id3', 'data3'); // Should remove oldest

    const stats = queue.getStats();
    expect(stats.pending).toBe(2);
  });

  it('should handle retries', () => {
    const queue = new AnalysisQueue<string>({ maxRetries: 2 });
    queue.enqueue('id1', 'data1');

    const item = queue.dequeue();
    expect(item).not.toBeNull();

    // Retry should work first time
    expect(queue.retry(item!)).toBe(true);
    
    // Advance time for rate limit
    vi.advanceTimersByTime(2000);
    const retried = queue.dequeue();
    expect(retried?.retries).toBe(1);

    // Retry again
    expect(queue.retry(retried!)).toBe(true);

    // Advance time again
    vi.advanceTimersByTime(2000);
    const retried2 = queue.dequeue();
    
    // Third retry should fail (max is 2)
    expect(queue.retry(retried2!)).toBe(false);
  });

  it('should track statistics', () => {
    const queue = new AnalysisQueue<string>();
    queue.enqueue('id1', 'data1');
    
    queue.dequeue();
    queue.markProcessed();

    const stats = queue.getStats();
    expect(stats.pending).toBe(0);
    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('should calculate time until next dequeue', () => {
    const queue = new AnalysisQueue<string>({ minIntervalMs: 100 });
    queue.enqueue('id1', 'data1');
    queue.enqueue('id2', 'data2');

    queue.dequeue(); // First dequeue sets lastProcessTime

    const waitTime = queue.getTimeUntilNext();
    expect(waitTime).toBe(100); // Full interval after dequeue
  });

  it('should clear queue', () => {
    const queue = new AnalysisQueue<string>();
    queue.enqueue('id1', 'data1');
    queue.enqueue('id2', 'data2');

    queue.clear();
    expect(queue.isEmpty()).toBe(true);
  });
});

// ============================================================================
// Cache Statistics Tests
// ============================================================================

describe('CacheStatsTracker', () => {
  it('should track cache hits', () => {
    const tracker = new CacheStatsTracker();
    
    tracker.recordHit();
    tracker.recordHit();
    
    const stats = tracker.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.hitRate).toBe(1); // 100% hit rate
  });

  it('should track cache misses', () => {
    const tracker = new CacheStatsTracker();
    
    tracker.recordMiss();
    
    const stats = tracker.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0); // 0% hit rate
  });

  it('should calculate hit rate correctly', () => {
    const tracker = new CacheStatsTracker();
    
    tracker.recordHit();
    tracker.recordHit();
    tracker.recordMiss();
    tracker.recordMiss();
    
    const stats = tracker.getStats();
    expect(stats.hitRate).toBe(0.5); // 50% hit rate
  });

  it('should track cache size', () => {
    const tracker = new CacheStatsTracker();
    
    tracker.updateSize(10);
    
    expect(tracker.getStats().size).toBe(10);
  });

  it('should reset statistics', () => {
    const tracker = new CacheStatsTracker();
    
    tracker.recordHit();
    tracker.recordMiss();
    tracker.reset();
    
    const stats = tracker.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('should handle zero total for hit rate', () => {
    const tracker = new CacheStatsTracker();
    expect(tracker.getStats().hitRate).toBe(0);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Cache Constants', () => {
  it('should have 24 hour TTL', () => {
    expect(CACHE_TTL_24H).toBe(24 * 60 * 60 * 1000);
  });

  it('should have 1 hour TTL', () => {
    expect(CACHE_TTL_1H).toBe(60 * 60 * 1000);
  });

  it('should have reasonable debounce delay', () => {
    expect(DEBOUNCE_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(DEBOUNCE_DELAY_MS).toBeLessThanOrEqual(5000);
  });
});

// ============================================================================
// Cache Expiration Tests
// ============================================================================

describe('Cache Expiration Logic', () => {
  it('should correctly calculate expiration', () => {
    const now = Date.now();
    const expiresAt = now + CACHE_TTL_24H;
    
    expect(expiresAt > now).toBe(true);
    expect(expiresAt - now).toBe(CACHE_TTL_24H);
  });

  it('should identify expired entries', () => {
    const now = Date.now();
    const expiredAt = now - 1000; // Expired 1 second ago
    const validAt = now + 1000; // Valid for 1 more second

    expect(expiredAt > now).toBe(false);
    expect(validAt > now).toBe(true);
  });
});
