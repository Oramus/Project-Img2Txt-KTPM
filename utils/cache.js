// utils/cache.js
const Redis = require('ioredis');

class CacheService {
  constructor(config = {}) {
    this.isRedisAvailable = false;
    this.localCache = new Map();
    this.defaultTTL = config.defaultTTL || 3600; // 1 hour default
    
    this.redis = new Redis({
      host: config.host || 'localhost',
      port: config.port || 6379,
      lazyConnect: true, // Don't connect immediately
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    // Handle Redis connection events
    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
      this.isRedisAvailable = true;
    });

    this.redis.on('error', (error) => {
      console.warn('Redis connection error:', error.message);
      this.isRedisAvailable = false;
    });

    // Try to connect to Redis
    this.initializeRedis();
  }

  async initializeRedis() {
    try {
      await this.redis.connect();
    } catch (error) {
      console.warn('Failed to connect to Redis, falling back to local cache:', error.message);
      this.isRedisAvailable = false;
    }
  }

  generateKey(data) {
    const crypto = require('crypto');
    return crypto
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  async get(key) {
    try {
      if (this.isRedisAvailable) {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Fallback to local cache
        const value = this.localCache.get(key);
        return value ? JSON.parse(value) : null;
      }
    } catch (error) {
      console.warn('Cache get error:', error.message);
      // Fallback to local cache on Redis error
      const value = this.localCache.get(key);
      return value ? JSON.parse(value) : null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    const stringValue = JSON.stringify(value);
    
    try {
      if (this.isRedisAvailable) {
        await this.redis.set(key, stringValue, 'EX', ttl);
      }
      
      // Always update local cache as backup
      this.localCache.set(key, stringValue);
      
      // Set up TTL expiration for local cache
      setTimeout(() => {
        this.localCache.delete(key);
      }, ttl * 1000);
      
    } catch (error) {
      console.warn('Cache set error:', error.message);
      // Ensure local cache is updated even if Redis fails
      this.localCache.set(key, stringValue);
    }
  }

  async delete(key) {
    try {
      if (this.isRedisAvailable) {
        await this.redis.del(key);
      }
      this.localCache.delete(key);
    } catch (error) {
      console.warn('Cache delete error:', error.message);
      this.localCache.delete(key);
    }
  }

  // Method to check cache health
  async healthCheck() {
    if (!this.isRedisAvailable) {
      return {
        status: 'degraded',
        redis: 'unavailable',
        localCache: 'active',
        cacheSize: this.localCache.size
      };
    }

    try {
      await this.redis.ping();
      return {
        status: 'healthy',
        redis: 'connected',
        localCache: 'active',
        cacheSize: this.localCache.size
      };
    } catch (error) {
      return {
        status: 'degraded',
        redis: 'error',
        localCache: 'active',
        cacheSize: this.localCache.size,
        error: error.message
      };
    }
  }

  // Graceful shutdown
  async close() {
    if (this.isRedisAvailable) {
      await this.redis.quit();
    }
    this.localCache.clear();
  }
}

module.exports = CacheService;