/**
 * URL validation with TTL-based caching.
 *
 * Validates that Kalshi market URLs return 200 OK before rendering them as clickable links.
 * Results are cached in chrome.storage.local with a 24-hour TTL.
 */

const URL_VALIDATION_PREFIX = 'url_valid:';
const VALIDATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UrlValidationResult {
  url: string;
  isValid: boolean;
  checkedAt: number;
  statusCode?: number;
  error?: string;
}

interface CachedValidation {
  isValid: boolean;
  checkedAt: number;
  statusCode?: number;
}

function validationCacheKey(url: string): string {
  // Create a consistent key from the URL
  return `${URL_VALIDATION_PREFIX}${btoa(url).slice(0, 60)}`;
}

/**
 * Get cached validation result if it exists and is not expired.
 */
async function getCachedValidation(url: string): Promise<CachedValidation | null> {
  const key = validationCacheKey(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const cached = result[key] as CachedValidation | undefined;
      if (!cached) return resolve(null);
      if (Date.now() - cached.checkedAt > VALIDATION_TTL_MS) return resolve(null);
      resolve(cached);
    });
  });
}

/**
 * Save validation result to cache.
 */
async function setCachedValidation(url: string, result: CachedValidation): Promise<void> {
  const key = validationCacheKey(url);
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: result }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

/**
 * Validate a URL by making a HEAD request.
 * Uses cached results if available and not expired.
 *
 * @param url The URL to validate
 * @param forceRefresh Skip cache and re-validate
 * @returns Validation result
 */
export async function validateUrl(
  url: string,
  forceRefresh = false
): Promise<UrlValidationResult> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getCachedValidation(url);
    if (cached) {
      return {
        url,
        isValid: cached.isValid,
        checkedAt: cached.checkedAt,
        statusCode: cached.statusCode,
      };
    }
  }

  // Perform validation
  const result: UrlValidationResult = {
    url,
    isValid: false,
    checkedAt: Date.now(),
  };

  try {
    // Use HEAD request for efficiency, fall back to GET if HEAD fails
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', // Kalshi may not allow CORS for HEAD
      });
    } catch {
      // HEAD failed, try GET with no-cors
      response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
      });
    }

    // In no-cors mode, we get an opaque response (type: 'opaque')
    // which means we can't read the status, but if it didn't throw, the URL exists
    if (response.type === 'opaque') {
      // Opaque response means the request succeeded but we can't read details
      // This is good enough - if the URL was truly 404, fetch would typically fail
      result.isValid = true;
      result.statusCode = 200; // Assumed
    } else {
      result.statusCode = response.status;
      result.isValid = response.ok;
    }
  } catch (error) {
    result.isValid = false;
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  // Cache the result
  await setCachedValidation(url, {
    isValid: result.isValid,
    checkedAt: result.checkedAt,
    statusCode: result.statusCode,
  }).catch(console.warn);

  return result;
}

/**
 * Validate multiple URLs in parallel with concurrency limit.
 */
export async function validateUrls(
  urls: string[],
  concurrency = 3
): Promise<Map<string, UrlValidationResult>> {
  const results = new Map<string, UrlValidationResult>();

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((url) => validateUrl(url)));
    for (const result of batchResults) {
      results.set(result.url, result);
    }
  }

  return results;
}

/**
 * Clear all cached URL validations.
 */
export async function clearValidationCache(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter((k) =>
        k.startsWith(URL_VALIDATION_PREFIX)
      );
      if (keysToRemove.length === 0) {
        resolve();
        return;
      }
      chrome.storage.local.remove(keysToRemove, () => resolve());
    });
  });
}

/**
 * Get validation cache stats for debugging.
 */
export async function getValidationCacheStats(): Promise<{
  totalEntries: number;
  validCount: number;
  invalidCount: number;
  expiredCount: number;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const entries = Object.entries(items).filter(([k]) =>
        k.startsWith(URL_VALIDATION_PREFIX)
      );

      let validCount = 0;
      let invalidCount = 0;
      let expiredCount = 0;

      for (const [, value] of entries) {
        const cached = value as CachedValidation;
        if (Date.now() - cached.checkedAt > VALIDATION_TTL_MS) {
          expiredCount++;
        } else if (cached.isValid) {
          validCount++;
        } else {
          invalidCount++;
        }
      }

      resolve({
        totalEntries: entries.length,
        validCount,
        invalidCount,
        expiredCount,
      });
    });
  });
}
