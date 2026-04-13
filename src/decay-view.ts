import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { StellavaultEngine } from './engine';
import type { DecayItem } from './types';

export const DECAY_VIEW_TYPE = 'stellavault-decay-view';

/**
 * Sidebar view showing documents sorted by memory decay.
 * Documents with low retrievability appear at the top.
 */
export class DecayView extends ItemView {
	private engine: StellavaultEngine;
	private items: DecayItem[] = [];
	private refreshTimer: ReturnType<typeof setInterval> | null = null;

	constructor(leaf: WorkspaceLeaf, engine: StellavaultEngine) {
		super(leaf);
		this.engine = engine;
	}

	getViewType(): string {
		return DECAY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Memory decay';
	}

	getIcon(): string {
		return 'brain';
	}

	async onOpen(): Promise<void> {
		await this.refresh();

		// Auto-refresh every 5 minutes
		this.refreshTimer = setInterval(() => { void this.refresh(); }, 5 * 60 * 1000);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async onClose(): Promise<void> {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	async refresh(): Promise<void> {
		if (!this.engine.isReady) {
			this.renderNotReady();
			return;
		}

		this.items = await this.engine.getDecayingDocs(30);
		this.render();
	}

	private renderNotReady(): void {
		const container = this.containerEl.children[1];
		container.empty();
		const msg = container.createDiv({ cls: 'sv-decay-loading' });
		msg.createEl('p', { text: 'Stellavault API server not connected.' });
		msg.createEl('p', {
			text: 'Run "npx stellavault graph" in your vault folder to start the server.',
			cls: 'sv-decay-hint',
		});
	}

	private render(): void {
		const container = this.containerEl.children[1];
		container.empty();

		// Header
		const header = container.createDiv({ cls: 'sv-decay-header' });
		header.createEl('h4', { text: 'Memory decay' });

		const refreshBtn = header.createEl('button', {
			text: 'Refresh',
			cls: 'sv-decay-refresh-btn',
		});
		refreshBtn.addEventListener('click', () => { void this.refresh(); });

		if (this.items.length === 0) {
			container.createDiv({
				text: 'No decaying documents found. Your memory is fresh!',
				cls: 'sv-decay-empty',
			});
			return;
		}

		// Stats summary
		const critical = this.items.filter((i) => i.retrievability < 0.3).length;
		const warning = this.items.filter((i) => i.retrievability >= 0.3 && i.retrievability < 0.6).length;
		const stats = container.createDiv({ cls: 'sv-decay-stats' });
		if (critical > 0) {
			stats.createSpan({ text: `${critical} critical`, cls: 'sv-stat-critical' });
		}
		if (warning > 0) {
			stats.createSpan({ text: `${warning} fading`, cls: 'sv-stat-warning' });
		}

		// Document list
		const list = container.createDiv({ cls: 'sv-decay-list' });
		for (const item of this.items) {
			this.renderDecayItem(list, item);
		}
	}

	private renderDecayItem(parent: HTMLElement, item: DecayItem): void {
		const el = parent.createDiv({ cls: 'sv-decay-item' });

		// Retrievability bar
		const barContainer = el.createDiv({ cls: 'sv-decay-bar-container' });
		const bar = barContainer.createDiv({ cls: 'sv-decay-bar' });
		const pct = Math.round(item.retrievability * 100);
		bar.style.width = `${pct}%`;
		bar.addClass(
			pct < 30 ? 'sv-bar-critical' : pct < 60 ? 'sv-bar-warning' : 'sv-bar-ok'
		);

		// Title
		const titleEl = el.createDiv({ cls: 'sv-decay-title' });
		titleEl.createSpan({ text: item.title });
		titleEl.createSpan({
			text: `${pct}%`,
			cls: 'sv-decay-pct',
		});

		// Days since access
		el.createDiv({
			text: `Last reviewed ${item.daysSinceAccess}d ago`,
			cls: 'sv-decay-meta',
		});

		// Click to open
		el.addEventListener('click', () => {
			void (async () => {
				await this.app.workspace.openLinkText(item.filePath, '', false);
				await this.engine.recordAccess(item.filePath);
				// Update this item's display
				item.retrievability = Math.min(1, item.retrievability + 0.1);
				this.render();
			})();
		});
	}
}
