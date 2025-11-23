/**
 * CCTV source identifiers
 */
export type CCTVSource = 'banjarkab' | 'banjarbaru';

/**
 * Source-specific configuration for CCTV capture
 */
export interface SourceConfig {
  /** Unique source identifier */
  source: CCTVSource;

  /** URL of the CCTV grid/listing page */
  url: string;

  /** Human-readable display name */
  displayName: string;

  /** CSS selectors for page elements */
  selectors: {
    /** Container element for each camera card */
    cardContainer: string;

    /** Element containing camera title/name */
    cardTitle: string;

    /** Video element selector */
    videoElement: string;

    /** Optional: Element indicating camera is online */
    onlineIndicator?: string;

    /** Optional: Element indicating camera error/offline */
    errorIndicator?: string;

    /** Optional: Pagination controls */
    pagination?: {
      /** Next page button selector */
      nextButton: string;

      /** Selector to check if next page exists */
      hasNext: string;
    };
  };

  /** Whether videos require click interaction to load (e.g., Alpine.js) */
  requiresClick?: boolean;

  /** Time to wait for Alpine.js initialization (milliseconds) */
  alpineWaitTime?: number;

  /** Optional: Filter cameras by keyword in title (case-insensitive) */
  filterKeyword?: string;

  /** Optional: Target count override for this source */
  targetCount?: number;
}
