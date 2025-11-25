import { SourceConfig, CCTVSource } from '../types/source.types';

/**
 * Parse TARGET_COUNT environment variable
 * Format: "count" or "count1,count2"
 * Returns: [banjarkabCount, banjarbaruCount]
 */
function parseTargetCount(): [number, number] {
  const targetCountEnv = process.env.TARGET_COUNT || '3';
  const parts = targetCountEnv.split(',').map(s => s.trim());

  if (parts.length === 1) {
    // Single value: use for both sources
    const count = parseInt(parts[0], 10);
    return [count, count];
  } else if (parts.length === 2) {
    // Two values: first for banjarkab, second for banjarbaru
    const count1 = parseInt(parts[0], 10);
    const count2 = parseInt(parts[1], 10);
    return [count1, count2];
  } else {
    console.warn(`Invalid TARGET_COUNT format: "${targetCountEnv}". Using default: 3,3`);
    return [3, 3];
  }
}

/**
 * Parse BANJARBARU_FILTER environment variable
 * Comma-separated keywords for filtering Banjarbaru cameras
 */
function parseBanjarbaruFilter(): string | undefined {
  const filter = process.env.BANJARBARU_FILTER;
  if (!filter || filter.trim() === '') {
    return undefined;
  }
  return filter.trim();
}

/**
 * Check if CCTV sources should be combined into one analysis
 * Returns true if COMBINE_SOURCES is set to 'true', '1', or 'yes'
 * Defaults to true if not set (combined mode is the default)
 */
export function shouldCombineSources(): boolean {
  const combineSources = process.env.COMBINE_SOURCES;

  // Default to true if not set
  if (combineSources === undefined || combineSources === '') {
    return true;
  }

  // Parse value: 'true', '1', 'yes' = enabled
  return combineSources.toLowerCase() === 'true' ||
         combineSources === '1' ||
         combineSources.toLowerCase() === 'yes';
}

/**
 * Configuration for all supported CCTV sources
 */
export function getSourceConfigs(): Record<CCTVSource, SourceConfig> {
  const [banjarkabCount, banjarbaruCount] = parseTargetCount();
  const banjarbaruFilter = parseBanjarbaruFilter();

  return {
    banjarkab: {
      source: 'banjarkab',
      url: 'https://cctv.banjarkab.go.id/grid',
      displayName: 'Kabupaten Banjar',
      selectors: {
        cardContainer: '.cctv-card',
        cardTitle: '.cctv-header',
        videoElement: 'video',
        onlineIndicator: '.status-badge.online',
        errorIndicator: '.error-msg',
        pagination: {
          nextButton: '.pagination a:has-text("Next")',
          hasNext: '.pagination a:has-text("Next")'
        }
      },
      requiresClick: false,
      targetCount: banjarkabCount
    },

    banjarbaru: {
      source: 'banjarbaru',
      url: 'https://cctv.banjarbarukota.go.id/CCTV',
      displayName: 'Kota Banjarbaru',
      selectors: {
        cardContainer: '#cctv-container > div', // Each card is a direct child div
        cardTitle: 'h5',
        videoElement: 'video',
        // Banjarbaru uses HLS.js - check for error.png to detect offline cameras
        errorIndicator: 'img[src*="error.png"]'
      },
      requiresClick: true,
      alpineWaitTime: 3000, // Wait for Alpine.js to initialize
      filterKeyword: banjarbaruFilter,
      targetCount: banjarbaruCount
    }
  };
}

/**
 * Get source configuration by name
 * @param source - CCTV source identifier
 * @returns Source configuration
 * @throws Error if source is not recognized
 */
export function getSourceConfig(source: string): SourceConfig {
  const sourceConfigs = getSourceConfigs();
  const config = sourceConfigs[source as CCTVSource];
  if (!config) {
    throw new Error(
      `Unknown CCTV source: ${source}. Available sources: ${Object.keys(sourceConfigs).join(', ')}`
    );
  }
  return config;
}
