import { Notice, Plugin, TFile, debounce } from 'obsidian';
import { StellavaultEngine } from './engine';
import { StellavaultSearchModal } from './search-modal';
import { DecayView, DECAY_VIEW_TYPE } from './decay-view';
import { LearningPathModal } from './learning-modal';
import { StellavaultSettingTab } from './settings-tab';
import { DEFAULT_SETTINGS } from './types';
import type { StellavaultSettings } from './types';

export default class StellavaultPlugin extends Plugin {
	settings: StellavaultSettings = DEFAULT_SETTINGS;
	engine: StellavaultEngine = null!;

	private indexDebounced = debounce(
		(filePath: string) => this.engine.indexFile(filePath),
		2000,
		true
	);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.engine = new StellavaultEngine(this.app, this.settings);

		// Register the decay sidebar view
		this.registerView(DECAY_VIEW_TYPE, (leaf) => new DecayView(leaf, this.engine));

		// Commands
		this.addCommand({
			id: 'stellavault-search',
			name: 'Search knowledge base',
			callback: () => {
				if (!this.engine.isReady) {
					new Notice('Stellavault is still initializing...');
					return;
				}
				new StellavaultSearchModal(this.app, this.engine).open();
			},
		});

		this.addCommand({
			id: 'stellavault-index',
			name: 'Index vault',
			callback: async () => {
				if (!this.engine.isReady) {
					new Notice('Stellavault is still initializing...');
					return;
				}
				if (this.engine.isIndexing) {
					new Notice('Indexing already in progress...');
					return;
				}
				new Notice('Stellavault: Indexing started...');
				const count = await this.engine.indexVault((current, total) => {
					if (current % 50 === 0) {
						new Notice(`Indexing: ${current}/${total}`);
					}
				});
				new Notice(`Stellavault: Indexed ${count} documents`);
			},
		});

		this.addCommand({
			id: 'stellavault-decay',
			name: 'Show memory decay panel',
			callback: () => this.activateDecayView(),
		});

		this.addCommand({
			id: 'stellavault-learn',
			name: 'Show learning path',
			callback: () => {
				if (!this.engine.isReady) {
					new Notice('Stellavault is still initializing...');
					return;
				}
				new LearningPathModal(this.app, this.engine).open();
			},
		});

		// Settings tab
		this.addSettingTab(new StellavaultSettingTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon('brain', 'Stellavault: Search', () => {
			if (this.engine.isReady) {
				new StellavaultSearchModal(this.app, this.engine).open();
			} else {
				new Notice('Stellavault is still initializing...');
			}
		});

		// File change tracking
		if (this.settings.autoIndex) {
			this.registerEvent(
				this.app.vault.on('modify', (file) => {
					if (file instanceof TFile && file.extension === 'md') {
						this.indexDebounced(file.path);
					}
				})
			);

			this.registerEvent(
				this.app.vault.on('delete', (file) => {
					if (file instanceof TFile) {
						// Remove from index on delete
						this.engine.indexFile(file.path).catch(() => {});
					}
				})
			);
		}

		// Track file opens for decay
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.engine.recordAccess(file.path);
				}
			})
		);

		// Initialize engine after layout is ready
		this.app.workspace.onLayoutReady(async () => {
			try {
				await this.engine.init();
				new Notice('Stellavault: Ready');
			} catch (err) {
				console.error('[Stellavault]', err);
				new Notice('Stellavault: Failed to initialize. Check console for details.');
			}
		});
	}

	async onunload(): Promise<void> {
		await this.engine?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.engine?.updateSettings(this.settings);
	}

	private async activateDecayView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(DECAY_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: DECAY_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}
}
