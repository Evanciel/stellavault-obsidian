export interface StellavaultSettings {
	/** Auto-index on file changes */
	autoIndex: boolean;
	/** Number of search results to show */
	maxResults: number;
	/** Show decay indicators in file explorer */
	showDecayBadges: boolean;
	/** Minimum retrievability threshold for decay warning */
	decayThreshold: number;
	/** Language for UI */
	locale: 'en' | 'ko' | 'ja';
	/** API server port (default: 3333, set by `stellavault graph`) */
	apiPort: number;
}

export const DEFAULT_SETTINGS: StellavaultSettings = {
	autoIndex: true,
	maxResults: 20,
	showDecayBadges: true,
	decayThreshold: 0.5,
	locale: 'en',
	apiPort: 3333,
};

export interface SearchResultItem {
	filePath: string;
	title: string;
	score: number;
	snippet: string;
	tags: string[];
}

export interface DecayItem {
	filePath: string;
	title: string;
	retrievability: number;
	lastAccessed: string;
	daysSinceAccess: number;
}
