import { App, Editor, MarkdownView, Plugin, TFile } from 'obsidian';

interface StopwatchState {
	accumulated: number; // seconds banked from previous runs
	startSec: number;    // epoch seconds when the current run began (0 if stopped)
	isRunning: boolean;
}

export default class StopwatchPlugin extends Plugin {
	async onload() {
		console.log('Loading Stopwatch plugin (timestamp version)');

		this.addCommand({
			id: 'insert-stopwatch',
			name: 'Insert stopwatch',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				// Format: ⏱️[HH:MM:SS|accumulated_seconds|start_epoch_seconds|status]
				editor.replaceRange(`⏱️[00:00:00|0|0|stopped]`, cursor);
			}
		});

		// One global ticker updates every running stopwatch in the DOM from its data attributes
		this.registerInterval(window.setInterval(() => {
			document.querySelectorAll<HTMLElement>('.stopwatch-container[data-running="true"]').forEach((el) => {
				const acc = parseInt(el.dataset.acc || '0');
				const start = parseInt(el.dataset.start || '0');
				const disp = el.querySelector('.stopwatch-display');
				if (disp) disp.textContent = this.formatTime(acc + Math.max(0, this.nowSec() - start));
			});
		}, 250));

		this.registerMarkdownPostProcessor((element, context) => {
			this.processStopwatchElements(element, context);
		});
	}

	private nowSec(): number {
		return Math.floor(Date.now() / 1000);
	}

	private currentElapsed(s: StopwatchState): number {
		return s.isRunning ? s.accumulated + Math.max(0, this.nowSec() - s.startSec) : s.accumulated;
	}

	private serialize(s: StopwatchState): string {
		return `⏱️[${this.formatTime(this.currentElapsed(s))}|${s.accumulated}|${s.isRunning ? s.startSec : 0}|${s.isRunning ? 'running' : 'stopped'}]`;
	}

	private processStopwatchElements(element: HTMLElement, context: any) {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
		const nodesToReplace: Array<{node: Node, parent: Node}> = [];

		let node;
		while ((node = walker.nextNode())) {
			if ((node.textContent || '').includes('⏱️[')) {
				nodesToReplace.push({node, parent: node.parentNode!});
			}
		}

		nodesToReplace.forEach(({node, parent}) => {
			const text = node.textContent || '';
			// New: [HH:MM:SS|acc_s|start_s|status]   Legacy: [HH:MM:SS|elapsed_ms|status]
			const pattern = /⏱️\[(\d{2,}:\d{2}:\d{2})\|(\d+)\|(?:(\d+)\|)?(running|stopped)\]/g;
			let lastIndex = 0;
			let match;

			while ((match = pattern.exec(text)) !== null) {
				if (match.index > lastIndex) {
					parent.insertBefore(document.createTextNode(text.substring(lastIndex, match.index)), node);
				}

				const isRunning = match[4] === 'running';
				const state: StopwatchState = match[3] !== undefined
					? { accumulated: parseInt(match[2]), startSec: parseInt(match[3]), isRunning }
					// Legacy format (ms): resume from now
					: { accumulated: Math.floor(parseInt(match[2]) / 1000), startSec: this.nowSec(), isRunning };
				parent.insertBefore(this.createStopwatchElement(state, match[0], context), node);
				lastIndex = pattern.lastIndex;
			}

			if (lastIndex < text.length) {
				parent.insertBefore(document.createTextNode(text.substring(lastIndex)), node);
			}
			parent.removeChild(node);
		});
	}

	private createStopwatchElement(initial: StopwatchState, rawText: string, context: any): HTMLElement {
		let state = initial;
		const container = document.createElement('span');
		container.addClass('stopwatch-container');

		const display = document.createElement('span');
		display.addClass('stopwatch-display');

		const makeBtn = (cls: string, label: string, title: string) => {
			const b = document.createElement('button');
			b.addClass('stopwatch-btn', cls);
			b.textContent = label;
			b.title = title;
			return b;
		};
		const startBtn = makeBtn('stopwatch-start-btn', '▶', 'Start');
		const stopBtn = makeBtn('stopwatch-stop-btn', '⏹', 'Stop');
		const resetBtn = makeBtn('stopwatch-reset-btn', '↻', 'Reset');
		const finalizeBtn = makeBtn('stopwatch-finalize-btn', '✓', 'Finalize (converts to plain text)');
		container.append(display, startBtn, stopBtn, resetBtn, finalizeBtn);

		const sourcePath = context.sourcePath;
		let current = rawText; // exact text currently in the file for this stopwatch

		const refresh = () => {
			container.dataset.acc = String(state.accumulated);
			container.dataset.start = String(state.startSec);
			container.dataset.running = String(state.isRunning);
			display.textContent = this.formatTime(this.currentElapsed(state));
			startBtn.style.display = state.isRunning ? 'none' : 'inline-block';
			stopBtn.style.display = state.isRunning ? 'inline-block' : 'none';
		};
		const persist = async () => {
			const next = this.serialize(state);
			await this.replaceInFile(sourcePath, current, next);
			current = next;
		};

		refresh();

		startBtn.addEventListener('click', () => {
			state = { accumulated: state.accumulated, startSec: this.nowSec(), isRunning: true };
			refresh(); persist();
		});
		stopBtn.addEventListener('click', () => {
			state = { accumulated: this.currentElapsed(state), startSec: 0, isRunning: false };
			refresh(); persist();
		});
		resetBtn.addEventListener('click', () => {
			state = { accumulated: 0, startSec: 0, isRunning: false };
			refresh(); persist();
		});
		finalizeBtn.addEventListener('click', async () => {
			const total = this.currentElapsed(state);
			const endTime = new Date();
			const startTime = new Date(endTime.getTime() - total * 1000);
			await this.replaceInFile(sourcePath, current, `⏱️ ${this.formatTime(total)} (${this.formatDateTime(startTime)} - ${this.formatDateTime(endTime)})`);
		});

		return container;
	}

	private async replaceInFile(sourcePath: string, oldText: string, newText: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;
		await this.app.vault.process(file, (content) => content.replace(oldText, () => newText));
	}

	private formatTime(totalSecs: number): string {
		const totalSeconds = Math.floor(totalSecs);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	private formatDateTime(date: Date): string {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

}
