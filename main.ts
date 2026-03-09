import { App, Editor, MarkdownView, Plugin, TFile } from 'obsidian';

interface StopwatchState {
	elapsed: number;
	startTime: number;
	isRunning: boolean;
}

export default class StopwatchPlugin extends Plugin {
	private intervals: Map<string, number> = new Map();
	private updateQueue: Map<string, NodeJS.Timeout> = new Map();

	async onload() {
		console.log('Loading Stopwatch plugin');

		// Add command to insert stopwatch
		this.addCommand({
			id: 'insert-stopwatch',
			name: 'Insert stopwatch',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				// Insert stopwatch with format: ⏱️[HH:MM:SS|elapsed_ms|status]
				editor.replaceRange(`⏱️[00:00:00|0|stopped]`, cursor);
			}
		});

		// Register post processor to render stopwatch with interactive controls
		this.registerMarkdownPostProcessor((element, context) => {
			const stopwatchPattern = /⏱️\[(\d{2}:\d{2}:\d{2})\|(\d+)\|(running|stopped)\]/g;
			
			this.processStopwatchElements(element, context);
		});
	}

	private processStopwatchElements(element: HTMLElement, context: any) {
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_TEXT,
			null
		);

		const nodesToReplace: Array<{node: Node, parent: Node}> = [];

		let node;
		while ((node = walker.nextNode())) {
			const text = node.textContent || '';
			if (text.includes('⏱️[')) {
				nodesToReplace.push({node, parent: node.parentNode!});
			}
		}

		// Replace text nodes with stopwatch components
		nodesToReplace.forEach(({node, parent}) => {
			const text = node.textContent || '';
			const pattern = /⏱️\[(\d{2}:\d{2}:\d{2})\|(\d+)\|(running|stopped)\]/g;
			let lastIndex = 0;
			let match;
			
			while ((match = pattern.exec(text)) !== null) {
				// Add text before match
				if (match.index > lastIndex) {
					const textBefore = text.substring(lastIndex, match.index);
					parent.insertBefore(document.createTextNode(textBefore), node);
				}
				
				// Create stopwatch element
				const timeStr = match[1];
				const elapsed = parseInt(match[2]);
				const status = match[3];
				const stopwatchEl = this.createStopwatchElement(timeStr, elapsed, status, context);
				parent.insertBefore(stopwatchEl, node);
				
				lastIndex = pattern.lastIndex;
			}
			
			// Add remaining text
			if (lastIndex < text.length) {
				const textAfter = text.substring(lastIndex);
				parent.insertBefore(document.createTextNode(textAfter), node);
			}
			
			parent.removeChild(node);
		});
	}

	private createStopwatchElement(timeStr: string, elapsed: number, status: string, context: any): HTMLElement {
		const container = document.createElement('span');
		container.addClass('stopwatch-container');
		const stopwatchId = `sw-${Date.now()}-${Math.random()}`;
		container.dataset.stopwatchId = stopwatchId;

		const display = document.createElement('span');
		display.addClass('stopwatch-display');
		display.textContent = timeStr;

		const startBtn = document.createElement('button');
		startBtn.addClass('stopwatch-btn', 'stopwatch-start-btn');
		startBtn.textContent = '▶';
		startBtn.title = 'Start';

		const stopBtn = document.createElement('button');
		stopBtn.addClass('stopwatch-btn', 'stopwatch-stop-btn');
		stopBtn.textContent = '⏹';
		stopBtn.title = 'Stop';

		const resetBtn = document.createElement('button');
		resetBtn.addClass('stopwatch-btn', 'stopwatch-reset-btn');
		resetBtn.textContent = '↻';
		stopBtn.title = 'Reset';

		const finalizeBtn = document.createElement('button');
		finalizeBtn.addClass('stopwatch-btn', 'stopwatch-finalize-btn');
		finalizeBtn.textContent = '✓';
		finalizeBtn.title = 'Finalize (converts to plain text)';

		// Set initial button visibility
		if (status === 'running') {
			startBtn.style.display = 'none';
			stopBtn.style.display = 'inline-block';
		} else {
			startBtn.style.display = 'inline-block';
			stopBtn.style.display = 'none';
		}

		container.appendChild(display);
		container.appendChild(startBtn);
		container.appendChild(stopBtn);
		container.appendChild(resetBtn);
		container.appendChild(finalizeBtn);

		// Get the source path from context
		const sourcePath = context.sourcePath;
		
		// If running, start the interval
		if (status === 'running') {
			this.startStopwatchInterval(stopwatchId, display, elapsed);
		}

		// Event handlers
		startBtn.addEventListener('click', () => {
			this.updateStopwatchInFile(sourcePath, timeStr, elapsed, 'stopped', 'running');
			startBtn.style.display = 'none';
			stopBtn.style.display = 'inline-block';
			this.startStopwatchInterval(stopwatchId, display, elapsed);
		});

		stopBtn.addEventListener('click', () => {
			const currentElapsed = this.stopStopwatchInterval(stopwatchId);
			const newTimeStr = this.formatTime(currentElapsed);
			this.updateStopwatchInFile(sourcePath, timeStr, elapsed, 'running', 'stopped', currentElapsed);
			stopBtn.style.display = 'none';
			startBtn.style.display = 'inline-block';
		});

		resetBtn.addEventListener('click', () => {
			this.stopStopwatchInterval(stopwatchId);
			this.updateStopwatchInFile(sourcePath, timeStr, elapsed, status, 'stopped', 0);
			display.textContent = '00:00:00';
			stopBtn.style.display = 'none';
			startBtn.style.display = 'inline-block';
		});

		finalizeBtn.addEventListener('click', () => {
			const finalElapsed = status === 'running' ? this.stopStopwatchInterval(stopwatchId) : elapsed;
			this.finalizeStopwatch(sourcePath, timeStr, elapsed, status, finalElapsed);
		});

		return container;
	}

	private startStopwatchInterval(stopwatchId: string, display: HTMLElement, initialElapsed: number) {
		// Clear any existing interval for this stopwatch
		this.stopStopwatchInterval(stopwatchId);
		
		const startTime = Date.now() - initialElapsed;
		
		const intervalId = window.setInterval(() => {
			const elapsed = Date.now() - startTime;
			display.textContent = this.formatTime(elapsed);
		}, 100);
		
		this.intervals.set(stopwatchId, intervalId);
	}

	private stopStopwatchInterval(stopwatchId: string): number {
		const intervalId = this.intervals.get(stopwatchId);
		let elapsed = 0;
		
		if (intervalId) {
			window.clearInterval(intervalId);
			this.intervals.delete(stopwatchId);
		}
		
		// Get elapsed time from display
		const containers = document.querySelectorAll(`[data-stopwatch-id="${stopwatchId}"]`);
		if (containers.length > 0) {
			const display = containers[0].querySelector('.stopwatch-display');
			if (display) {
				elapsed = this.parseTimeToMs(display.textContent || '00:00:00');
			}
		}
		
		return elapsed;
	}

	private parseTimeToMs(timeStr: string): number {
		const parts = timeStr.split(':');
		const hours = parseInt(parts[0]) || 0;
		const minutes = parseInt(parts[1]) || 0;
		const seconds = parseInt(parts[2]) || 0;
		return (hours * 3600 + minutes * 60 + seconds) * 1000;
	}

	private async updateStopwatchInFile(
		sourcePath: string, 
		oldTimeStr: string, 
		oldElapsed: number, 
		oldStatus: string,
		newStatus: string,
		newElapsed?: number
	) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const elapsed = newElapsed !== undefined ? newElapsed : oldElapsed;
		const timeStr = this.formatTime(elapsed);
		
		const oldPattern = `⏱️[${oldTimeStr}|${oldElapsed}|${oldStatus}]`;
		const newPattern = `⏱️[${timeStr}|${elapsed}|${newStatus}]`;
		
		// Replace first occurrence only
		const newContent = content.replace(oldPattern, newPattern);
		
		await this.app.vault.modify(file, newContent);
	}

	private async finalizeStopwatch(
		sourcePath: string,
		timeStr: string,
		elapsed: number,
		status: string,
		finalElapsed: number
	) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		
		const duration = this.formatTime(finalElapsed);
		const endTime = new Date();
		const startTime = new Date(endTime.getTime() - finalElapsed);
		
		const oldPattern = `⏱️[${timeStr}|${elapsed}|${status}]`;
		const finalText = `⏱️ ${duration} (${this.formatDateTime(startTime)} - ${this.formatDateTime(endTime)})`;
		
		const newContent = content.replace(oldPattern, finalText);
		
		await this.app.vault.modify(file, newContent);
	}

	private formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
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

	onunload() {
		console.log('Unloading Stopwatch plugin');
		
		// Clear all intervals
		this.intervals.forEach((intervalId) => {
			window.clearInterval(intervalId);
		});
		this.intervals.clear();
		this.updateQueue.forEach((timeout) => {
			clearTimeout(timeout);
		});
		this.updateQueue.clear();
	}
}
