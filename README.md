# Plaintext Stopwatch

In-text stopwatches for Obsidian that store their state as plain text in your notes. They keep counting through refreshes, restarts and closed tabs, and work in both Reading view and Live Preview.

https://github.com/user-attachments/assets/809ff7d4-dd9d-40db-ba95-0f128f5beff2

## Usage

Run **Insert stopwatch** from the command palette. Controls:

- **▶** start, **⏹** pause
- **↻** reset to 00:00:00
- **✓** finalize into plain text, e.g. `⏱️ 00:25:30 (14:30 - 14:55)`

In Live Preview, move the cursor onto a stopwatch to edit its raw text. Stopwatches inside code are left alone.

## Format

```
⏱️[HH:MM:SS|accumulated_seconds|start_epoch_seconds|status|first_start_epoch_seconds]
```

- `accumulated_seconds`: time banked from earlier runs
- `start_epoch_seconds`: Unix time the current run started (`0` when stopped)
- `status`: `running` or `stopped`
- `first_start_epoch_seconds` (optional): Unix time of the first start, so finalizing shows the true start time even after pauses. Stopwatches without it still work.

Elapsed time is `accumulated + (now - start)`. `HH:MM:SS` is a snapshot from the last click.

## Manual installation

Copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/plaintext-stopwatch/`, then enable the plugin in Settings → Community plugins.

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # production build
```

## License

MIT
