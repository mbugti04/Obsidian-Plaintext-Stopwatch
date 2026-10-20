# Stopwatch Example

## Active Stopwatch (Ready to Start)
Working on task A: ⏱️[00:00:00|0|0|stopped]

## Running Stopwatch (Currently Timing)
Working on task A: ⏱️[00:15:30|0|1760000000|running]

## Finalized Stopwatch (Completed)
Completed task A: ⏱️ 01:23:45 (09:15 - 10:38)

---

## Usage Instructions

1. In Obsidian, open command palette (Cmd/Ctrl + P)
2. Type "Insert stopwatch" and press Enter
3. The stopwatch will be inserted as: `⏱️[00:00:00|0|0|stopped]`
4. Click the play button (▶) to start timing
5. The markdown file will update to show running state
6. Click stop (⏹) to pause, reset (↻) to clear, or finalize (✓) to convert to permanent text

## Format Breakdown

`⏱️[HH:MM:SS|accumulated_seconds|start_epoch_seconds|status]`

- Time shown in hours:minutes:seconds
- `accumulated_seconds` is time banked from earlier runs; `start_epoch_seconds` is the Unix timestamp (seconds) when the current run began (0 when stopped)
- Elapsed time while running is `accumulated + (now - start)`, so it survives refreshes, restarts and closing Obsidian
- The leading HH:MM:SS is only a snapshot; the live display is recomputed
- Status is either "running" or "stopped"
