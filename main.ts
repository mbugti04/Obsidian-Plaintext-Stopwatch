import { Editor, MarkdownPostProcessorContext, MarkdownView, Plugin, TFile, editorLivePreviewField } from 'obsidian';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';

// New: [HH:MM:SS|acc_s|start_s|status|first_start_s?]   Older: [HH:MM:SS|acc_s|start_s|status]   Legacy: [HH:MM:SS|elapsed_ms|status]
const STOPWATCH_PATTERN = /⏱️\[(\d{2,}:\d{2}:\d{2})\|(\d+)\|(?:(\d+)\|)?(running|stopped)(?:\|(\d+))?\]/g;

type Writer = (oldText: string, newText: string) => void | Promise<void>;

interface StopwatchState {
	accumulated: number; // seconds banked from previous runs
	startSec: number;    // epoch seconds when the current run began (0 if stopped)
	isRunning: boolean;
	firstStartSec: number; // epoch seconds of the very first start since reset (0 if unknown)
}

export default class StopwatchPlugin extends Plugin {
	async onload() {
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

		this.registerEditorExtension(this.buildLivePreviewExtension());

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
		return `⏱️[${this.formatTime(this.currentElapsed(s))}|${s.accumulated}|${s.isRunning ? s.startSec : 0}|${s.isRunning ? 'running' : 'stopped'}${s.firstStartSec > 0 ? `|${s.firstStartSec}` : ''}]`;
	}

	private parseState(match: RegExpExecArray): StopwatchState {
		const isRunning = match[4] === 'running';
		return match[3] !== undefined
			? { accumulated: parseInt(match[2]), startSec: parseInt(match[3]), isRunning, firstStartSec: match[5] !== undefined ? parseInt(match[5]) : 0 }
			// Legacy format (ms): resume from now
			: { accumulated: Math.floor(parseInt(match[2]) / 1000), startSec: this.nowSec(), isRunning, firstStartSec: 0 };
	}

	private buildLivePreviewExtension() {
		const plugin = this;

		class StopwatchWidget extends WidgetType {
			constructor(private raw: string, private state: StopwatchState) { super(); }
			eq(other: StopwatchWidget) { return other.raw === this.raw; }
			toDOM(view: EditorView) {
				let el: HTMLElement;
				const write: Writer = (oldText, newText) => {
					// Locate the text in the editor doc: prefer this widget's position, fall back to a search
					const doc = view.state.doc;
					let from = -1;
					try {
						const pos = view.posAtDOM(el);
						if (doc.sliceString(pos, pos + oldText.length) === oldText) from = pos;
					} catch (e) { /* detached */ }
					if (from < 0) from = doc.toString().indexOf(oldText);
					if (from < 0) return;
					view.dispatch({ changes: { from, to: from + oldText.length, insert: newText } });
				};
				el = plugin.createStopwatchElement(this.state, this.raw, write);
				return el;
			}
		}

		const build = (view: EditorView): DecorationSet => {
			const builder = new RangeSetBuilder<Decoration>();
			if (!view.state.field(editorLivePreviewField, false)) return builder.finish();
			const sel = view.state.selection;
			const tree = syntaxTree(view.state);
			for (const { from, to } of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				const re = new RegExp(STOPWATCH_PATTERN.source, 'g');
				let m: RegExpExecArray | null;
				while ((m = re.exec(text)) !== null) {
					const start = from + m.index;
					const end = start + m[0].length;
					// Show raw text while the cursor/selection touches it so it stays editable
					if (sel.ranges.some((r) => r.from <= end && r.to >= start)) continue;
					// Leave stopwatches inside inline code or code blocks as text
					if (/code/i.test(tree.resolveInner(start, 1).name)) continue;
					builder.add(start, end, Decoration.replace({ widget: new StopwatchWidget(m[0], plugin.parseState(m)) }));
				}
			}
			return builder.finish();
		};

		return ViewPlugin.fromClass(class implements PluginValue {
			decorations: DecorationSet;
			constructor(view: EditorView) { this.decorations = build(view); }
			update(u: ViewUpdate) {
				const lpChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
				if (u.docChanged || u.viewportChanged || u.selectionSet || lpChanged) this.decorations = build(u.view);
			}
		}, { decorations: (v) => v.decorations });
	}

	private processStopwatchElements(element: HTMLElement, context: MarkdownPostProcessorContext) {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
			// Leave stopwatches inside inline code or code blocks as text
			acceptNode: (n) => n.parentElement?.closest('code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
		});
		const nodesToReplace: Array<{node: Node, parent: Node}> = [];

		let node;
		while ((node = walker.nextNode())) {
			if ((node.textContent || '').includes('⏱️[')) {
				nodesToReplace.push({node, parent: node.parentNode!});
			}
		}

		// Text of the file before this section, used to tell identical stopwatches apart
		const info = context.getSectionInfo(element);
		const before = info ? info.text.split('\n').slice(0, info.lineStart).join('\n') : '';
		const seen = new Map<string, number>();

		nodesToReplace.forEach(({node, parent}) => {
			const text = node.textContent || '';
			const pattern = new RegExp(STOPWATCH_PATTERN.source, 'g');
			let lastIndex = 0;
			let match;

			while ((match = pattern.exec(text)) !== null) {
				if (match.index > lastIndex) {
					parent.insertBefore(document.createTextNode(text.substring(lastIndex, match.index)), node);
				}

				const raw = match[0];
				const n = seen.get(raw) ?? 0;
				seen.set(raw, n + 1);
				let ordinal = this.countOccurrences(before, raw) + n;
				const write: Writer = async (oldText, newText) => {
					ordinal = await this.replaceInFile(context.sourcePath, oldText, newText, ordinal);
				};
				parent.insertBefore(this.createStopwatchElement(this.parseState(match), raw, write), node);
				lastIndex = pattern.lastIndex;
			}

			if (lastIndex < text.length) {
				parent.insertBefore(document.createTextNode(text.substring(lastIndex)), node);
			}
			parent.removeChild(node);
		});
	}

	private createStopwatchElement(initial: StopwatchState, rawText: string, write: Writer): HTMLElement {
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

		let current = rawText; // exact text currently in the file for this stopwatch

		const refresh = () => {
			container.dataset.acc = String(state.accumulated);
			container.dataset.start = String(state.startSec);
			container.dataset.running = String(state.isRunning);
			display.textContent = this.formatTime(this.currentElapsed(state));
			container.toggleClass('is-running', state.isRunning);
		};
		const persist = async () => {
			const next = this.serialize(state);
			await write(current, next);
			current = next;
		};

		refresh();

		startBtn.addEventListener('click', () => {
			const now = this.nowSec();
			state = { accumulated: state.accumulated, startSec: now, isRunning: true, firstStartSec: state.firstStartSec || now };
			refresh(); persist();
		});
		stopBtn.addEventListener('click', () => {
			state = { accumulated: this.currentElapsed(state), startSec: 0, isRunning: false, firstStartSec: state.firstStartSec };
			refresh(); persist();
		});
		resetBtn.addEventListener('click', () => {
			state = { accumulated: 0, startSec: 0, isRunning: false, firstStartSec: 0 };
			refresh(); persist();
		});
		finalizeBtn.addEventListener('click', async () => {
			const total = this.currentElapsed(state);
			const endTime = new Date();
			// Prefer the recorded first start so pauses don't shift the range; older stopwatches fall back to end - total
			const startTime = state.firstStartSec > 0 ? new Date(state.firstStartSec * 1000) : new Date(endTime.getTime() - total * 1000);
			await write(current, `⏱️ ${this.formatTime(total)} (${this.formatDateTime(startTime)} - ${this.formatDateTime(endTime)})`);
		});

		return container;
	}

	private countOccurrences(text: string, needle: string): number {
		let count = 0;
		for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) count++;
		return count;
	}

	// Replaces the `ordinal`-th occurrence of oldText (falling back to the first) and
	// returns the ordinal of newText at that spot, so later writes hit the same stopwatch.
	private async replaceInFile(sourcePath: string, oldText: string, newText: string, ordinal: number): Promise<number> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return ordinal;
		let newOrdinal = ordinal;
		await this.app.vault.process(file, (content) => {
			let idx = -1;
			for (let i = 0; i <= ordinal; i++) {
				idx = content.indexOf(oldText, idx + 1);
				if (idx < 0) break;
			}
			if (idx < 0) idx = content.indexOf(oldText);
			if (idx < 0) return content;
			newOrdinal = this.countOccurrences(content.slice(0, idx), newText);
			return content.slice(0, idx) + newText + content.slice(idx + oldText.length);
		});
		return newOrdinal;
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
