import { App, SuggestModal } from 'obsidian';
import type { StellavaultEngine } from './engine';
import type { SearchResultItem } from './types';

/**
 * Fuzzy search modal powered by stellavault semantic search.
 * Opens via Command Palette → "Stellavault: Search"
 */
export class StellavaultSearchModal extends SuggestModal<SearchResultItem> {
	private engine: StellavaultEngine;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private lastResults: SearchResultItem[] = [];

	constructor(app: App, engine: StellavaultEngine) {
		super(app);
		this.engine = engine;
		this.setPlaceholder('Search your knowledge base...');
		this.setInstructions([
			{ command: 'Enter', purpose: 'Open file' },
			{ command: 'Esc', purpose: 'Close' },
		]);
	}

	async getSuggestions(query: string): Promise<SearchResultItem[]> {
		if (query.length < 2) return [];

		// Debounce: wait 200ms after last keystroke
		return new Promise((resolve) => {
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => {
				void (async () => {
					try {
						this.lastResults = await this.engine.search(query);
						resolve(this.lastResults);
					} catch {
						resolve([]);
					}
				})();
			}, 200);
		});
	}

	renderSuggestion(item: SearchResultItem, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'sv-search-item' });

		// Title + score
		const header = container.createDiv({ cls: 'sv-search-header' });
		header.createSpan({ text: item.title, cls: 'sv-search-title' });
		const score = Math.round(item.score * 100);
		header.createSpan({
			text: `${score}%`,
			cls: `sv-search-score ${score >= 80 ? 'sv-score-high' : score >= 50 ? 'sv-score-mid' : 'sv-score-low'}`,
		});

		// Snippet
		if (item.snippet) {
			container.createDiv({
				text: item.snippet.substring(0, 120) + (item.snippet.length > 120 ? '...' : ''),
				cls: 'sv-search-snippet',
			});
		}

		// Tags
		if (item.tags.length > 0) {
			const tagRow = container.createDiv({ cls: 'sv-search-tags' });
			for (const tag of item.tags.slice(0, 5)) {
				tagRow.createSpan({ text: `#${tag}`, cls: 'sv-tag' });
			}
		}

		// File path
		container.createDiv({
			text: item.filePath,
			cls: 'sv-search-path',
		});
	}

	onChooseSuggestion(item: SearchResultItem): void {
		const file = this.app.vault.getAbstractFileByPath(item.filePath);
		if (file) {
			void (async () => {
				await this.app.workspace.openLinkText(item.filePath, '', false);
				// Record access for decay tracking
				await this.engine.recordAccess(item.filePath);
			})();
		}
	}
}
