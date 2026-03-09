# Obsidian Plaintext Stopwatch Plugin

A simple Obsidian plugin that lets you insert interactive stopwatches directly into your notes. Track time spent on activities with in-text stopwatches that store their state as **plain text** in your markdown files.

## Installation

1. Download the latest release from the GitHub releases page
2. Extract the files to your vault's plugins folder: `VaultFolder/.obsidian/plugins/obsidian-plaintext-stopwatch/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

## Usage

### Inserting a Stopwatch

1. Open the command palette (Cmd/Ctrl + P)
2. Search for "Insert stopwatch"
3. Press Enter

A stopwatch will be inserted at your cursor position. In the markdown file, it looks like:
```
⏱️[00:00:00|0|stopped]
```

This format stores: `⏱️[time|elapsed_ms|status]`

### Using the Stopwatch

Each stopwatch has four controls:

- **▶** (Play): Start the stopwatch - changes status to `running` in the markdown
- **⏹** (Stop): Pause the stopwatch - changes status to `stopped` in the markdown
- **↻** (Reset): Reset the elapsed time to 00:00:00
- **✓** (Finalize): Stop the stopwatch and convert it to plain text

### Plain Text Format

**Active Stopwatch** (in the markdown file):
```
Working on project X: ⏱️[00:00:00|0|stopped]
```

**Running Stopwatch** (updates in the markdown):
```
Working on project X: ⏱️[00:25:30|1530000|running]
```

**Finalized** (after clicking ✓):
```
Working on project X: ⏱️ 00:25:30 (14:30 - 14:55)
```

The stopwatch state format is: `⏱️[HH:MM:SS|elapsed_milliseconds|running|stopped]`

## Development

1. Clone this repository into your Obsidian vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/yourusername/obsidian-stopwatch.git
   ```

2. Install dependencies:
   ```bash
   cd obsidian-stopwatch
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Enable the plugin in Obsidian's settings under "Community Plugins"

To start development with hot reload:

```bash
npm run dev
```

This will watch for changes and automatically rebuild the plugin.

## Building

To create a production build:

```bash
npm run build
```

## License

MIT