/**
 * Cache utilities for SurfSafe
 * Provides content hashing, cache management, debouncing, and analysis queue
 */

// ============================================================================
// Constants
// ============================================================================

/** Cache TTL: 24 hours in milliseconds */
export const CACHE_TTL_24H = 24 * 60 * 60 * 1000;

/** Cache TTL: 1 hour in milliseconds (for dynamic sites) */
export const CACHE_TTL_1H = 60 * 60 * 1000;

/** Maximum cache entries before cleanup */
export const MAX_CACHE_ENTRIES = 500;

/** Debounce delay for analysis (ms) */
export const DEBOUNCE_DELAY_MS = 1000;

/** Minimum interval between API calls (ms) */
export const MIN_API_INTERVAL_MS = 2000;

/** Maximum queue size */
export const MAX_QUEUE_SIZE = 10;

// ============================================================================
// Content Hashing
// ============================================================================

/**
 * Generate a simple hash from content string
 * Uses djb2 algorithm for fast, reasonably distributed hashes
 */
export function contentHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

/**
 * Generate a cache key from domain and content hash
 * Format: "domain:hash" for efficient lookup
 */
export function generateCacheKey(domain: string, bodyTextSample: string): string {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  const hash = contentHash(bodyTextSample.slice(0, 1000)); // Use first 1000 chars
  return `${normalizedDomain}:${hash}`;
}

/**
 * Extract domain from cache key
 */
export function getDomainFromCacheKey(cacheKey: string): string {
  return cacheKey.split(':')[0] || cacheKey;
}

// ============================================================================
// Debounce Utility
// ============================================================================

/**
 * Create a debounced version of a function
 * The function will only execute after the specified delay has passed
 * without any new calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Create a throttled version of a function
 * The function will execute at most once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  intervalMs: number
): (...args: Parameters<T>) => void {
  let lastExecutionTime = 0;
  let pendingArgs: Parameters<T> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function throttled(...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastExecution = now - lastExecutionTime;

    if (timeSinceLastExecution >= intervalMs) {
      lastExecutionTime = now;
      fn(...args);
    } else {
      // Queue the latest call
      pendingArgs = args;
      if (timeoutId === null) {
        const remainingTime = intervalMs - timeSinceLastExecution;
        timeoutId = setTimeout(() => {
          if (pendingArgs !== null) {
            lastExecutionTime = Date.now();
            fn(...pendingArgs);
            pendingArgs = null;
          }
          timeoutId = null;
        }, remainingTime);
      }
    }
  };
}

// ============================================================================
// Analysis Queue
// ============================================================================

export interface QueueItem<T> {
  id: string;
  data: T;
  timestamp: number;
  retries: number;
}

export interface QueueStats {
  pending: number;
  processed: number;
  failed: number;
}

/**
 * Analysis queue for rate-limiting API requests
 * Processes requests with configurable delays between them
 */
export class AnalysisQueue<T> {
  private queue: QueueItem<T>[] = [];
  private processing = false;
  private processedCount = 0;
  private failedCount = 0;
  private lastProcessTime = 0;
  private readonly minIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly maxRetries: number;

  constructor(options?: {
    minIntervalMs?: number;
    maxQueueSize?: number;
    maxRetries?: number;
  }) {
    this.minIntervalMs = options?.minIntervalMs ?? MIN_API_INTERVAL_MS;
    this.maxQueueSize = options?.maxQueueSize ?? MAX_QUEUE_SIZE;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  /**
   * Add an item to the queue
   * Returns false if queue is full
   */
  enqueue(id: string, data: T): boolean {
    // Check if already in queue
    if (this.queue.some((item) => item.id === id)) {
      return false;
    }

    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      // Remove oldest item
      this.queue.shift();
    }

    this.queue.push({
      id,
      data,
      timestamp: Date.now(),
      retries: 0,
    });

    return true;
  }

  /**
   * Get next item from queue, respecting rate limit
   * Returns null if queue is empty or rate limit not met
   */
  dequeue(): QueueItem<T> | null {
    if (this.queue.length === 0) {
      return null;
    }

    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;

    if (timeSinceLastProcess < this.minIntervalMs) {
      return null;
    }

    this.lastProcessTime = now;
    return this.queue.shift() || null;
  }

  /**
   * Re-queue an item for retry (at end of queue)
   */
  retry(item: QueueItem<T>): boolean {
    if (item.retries >= this.maxRetries) {
      this.failedCount++;
      return false;
    }

    this.queue.push({
      ...item,
      retries: item.retries + 1,
      timestamp: Date.now(),
    });
    return true;
  }

  /**
   * Mark an item as successfully processed
   */
  markProcessed(): void {
    this.processedCount++;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      processed: this.processedCount,
      failed: this.failedCount,
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get time until next item can be processed
   */
  getTimeUntilNext(): number {
    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;
    return Math.max(0, this.minIntervalMs - timeSinceLastProcess);
  }
}

// ============================================================================
// Cache Statistics
// ============================================================================

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * Cache statistics tracker
 */
export class CacheStatsTracker {
  private hits = 0;
  private misses = 0;
  private size = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  updateSize(size: number): void {
    this.size = size;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

// Global cache stats instance
export const cacheStats = new CacheStatsTracker();
