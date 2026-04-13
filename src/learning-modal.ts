import { App, Modal } from 'obsidian';
import type { StellavaultEngine, LearningPathItem } from './engine';

/**
 * Modal showing a personalized learning path based on
 * knowledge gaps and decay analysis.
 */
export class LearningPathModal extends Modal {
	private engine: StellavaultEngine;

	constructor(app: App, engine: StellavaultEngine) {
		super(app);
		this.engine = engine;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('sv-learning-modal');

		contentEl.createEl('h2', { text: 'Your learning path' });

		const loading = contentEl.createDiv({
			text: 'Analyzing your knowledge...',
			cls: 'sv-learning-loading',
		});

		try {
			const items = await this.engine.getLearningPath();
			loading.remove();

			if (items.length === 0) {
				contentEl.createDiv({
					text: 'No learning suggestions right now. Keep exploring!',
					cls: 'sv-learning-empty',
				});
				return;
			}

			const list = contentEl.createDiv({ cls: 'sv-learning-list' });

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const row = list.createDiv({ cls: 'sv-learning-item' });

				// Step number
				row.createSpan({
					text: `${i + 1}`,
					cls: 'sv-learning-step',
				});

				// Content
				const body = row.createDiv({ cls: 'sv-learning-body' });
				body.createDiv({
					text: item.title ?? item.filePath ?? 'Unknown',
					cls: 'sv-learning-title',
				});

				if (item.reason) {
					body.createDiv({
						text: item.reason,
						cls: 'sv-learning-reason',
					});
				}

				// Open button
				if (item.filePath) {
					const filePath = item.filePath;
					const openBtn = row.createEl('button', {
						text: 'Review',
						cls: 'sv-learning-open-btn',
					});
					openBtn.addEventListener('click', () => {
						void (async () => {
							this.close();
							await this.app.workspace.openLinkText(filePath, '', false);
							await this.engine.recordAccess(filePath);
						})();
					});
				}
			}
		} catch (_err) {
			loading.setText('Failed to generate learning path. Is your vault indexed?');
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
