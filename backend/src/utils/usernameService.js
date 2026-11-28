import User from "../models/User.js";

/**
 * Scalable 3-Layer Username Availability Pipeline:
 * 1. Counting Bloom Filter (O(1) memory check -> eliminates DB queries for definitely unused names)
 * 2. Bounded In-Memory TTL Cache (avoids repeated DB hits on hot/colliding usernames)
 * 3. Indexed MongoDB Query (User.exists using unique B-tree index as final source of truth)
 */

const BLOOM_SIZE = 65536; // 65K buckets (~128 KB RAM)
const HASH_SEEDS = [0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 10000;

const bloomCounters = new Uint16Array(BLOOM_SIZE);
const memoryCache = new Map(); // normalizedUsername -> { available, expiresAt }
let isBloomWarmed = false;

export const normalizeUsername = (raw = "") =>
  raw.toString().replace(/^@/, "").toLowerCase().trim();

export const validateUsernameFormat = (raw = "") => {
  const normalized = normalizeUsername(raw);
  if (normalized.length < 3 || normalized.length > 24) {
    return {
      valid: false,
      normalized,
      message: "Username must be between 3 and 24 characters.",
    };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: "Username can only contain lowercase letters, numbers, and underscores.",
    };
  }
  return { valid: true, normalized };
};

// Fast FNV-1a variant hash returning bucket index within [0, BLOOM_SIZE)
const getBucketHashes = (str) =>
  HASH_SEEDS.map((seed) => {
    let hash = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash % BLOOM_SIZE;
  });

const bloomAdd = (username) => {
  for (const idx of getBucketHashes(username)) {
    if (bloomCounters[idx] < 65535) bloomCounters[idx] += 1;
  }
};

const bloomRemove = (username) => {
  for (const idx of getBucketHashes(username)) {
    if (bloomCounters[idx] > 0) bloomCounters[idx] -= 1;
  }
};

const bloomMightContain = (username) =>
  getBucketHashes(username).every((idx) => bloomCounters[idx] > 0);

const setCache = (username, available) => {
  if (memoryCache.has(username)) {
    memoryCache.delete(username);
  } else if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(username, {
    available,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

const getCache = (username) => {
  const entry = memoryCache.get(username);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(username);
    return null;
  }
  // Refresh LRU position on hit
  memoryCache.delete(username);
  memoryCache.set(username, entry);
  return entry.available;
};

/**
 * Loads all existing usernames into the Counting Bloom Filter at startup.
 */
export const warmupUsernameIndex = async () => {
  try {
    const users = await User.find().select("username").lean();
    bloomCounters.fill(0);
    memoryCache.clear();
    for (const u of users) {
      if (u.username) bloomAdd(u.username);
    }
    isBloomWarmed = true;
    console.log(`[UsernameIndex] Warmed Bloom Filter with ${users.length} usernames.`);
  } catch (err) {
    console.error("[UsernameIndex] Failed to warm Bloom Filter:", err.message);
  }
};

export const registerUsernameInIndex = (rawUsername) => {
  const normalized = normalizeUsername(rawUsername);
  if (!normalized) return;
  bloomAdd(normalized);
  setCache(normalized, false);
};

export const removeUsernameFromIndex = (rawUsername) => {
  const normalized = normalizeUsername(rawUsername);
  if (!normalized) return;
  bloomRemove(normalized);
  setCache(normalized, true);
};

export const swapUsernameInIndex = (oldUsername, newUsername) => {
  removeUsernameFromIndex(oldUsername);
  registerUsernameInIndex(newUsername);
};

/**
 * Checks username availability via Bloom Filter -> In-Memory Cache -> Indexed DB.
 */
export const checkUsernameAvailability = async (rawUsername, currentUserId = null) => {
  const format = validateUsernameFormat(rawUsername);
  if (!format.valid) {
    return {
      available: false,
      valid: false,
      normalized: format.normalized,
      message: format.message,
    };
  }

  const normalized = format.normalized;

  if (!isBloomWarmed) {
    await warmupUsernameIndex();
  }

  // Layer 1: Bloom Filter fast-path (Zero DB load when bucket is 0)
  if (!bloomMightContain(normalized)) {
    setCache(normalized, true);
    return {
      available: true,
      valid: true,
      normalized,
      source: "bloom_filter",
      message: `@${normalized} is available!`,
    };
  }

  // Layer 2: In-Memory TTL/LRU Cache (when no currentUserId exclusion check needed)
  if (!currentUserId) {
    const cached = getCache(normalized);
    if (cached !== null) {
      return {
        available: cached,
        valid: true,
        normalized,
        source: "memory_cache",
        message: cached
          ? `@${normalized} is available!`
          : `@${normalized} is already taken.`,
      };
    }
  }

  // Layer 3: Indexed Database Lookup (handles Bloom false positives & self-ownership checks)
  const query = currentUserId
    ? { username: normalized, _id: { $ne: currentUserId } }
    : { username: normalized };
  const owner = await User.exists(query);
  const available = !owner;

  if (!currentUserId) {
    setCache(normalized, available);
  }

  return {
    available,
    valid: true,
    normalized,
    source: "indexed_db",
    message: available
      ? `@${normalized} is available!`
      : `@${normalized} is already taken.`,
  };
};
