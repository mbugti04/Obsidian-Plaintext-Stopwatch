# Stopwatch Example

## Active Stopwatch (Ready to Start)
Working on task A: ⏱️[00:00:00|0|stopped]

## Running Stopwatch (Currently Timing)
Working on task A: ⏱️[00:15:30|930000|running]

## Finalized Stopwatch (Completed)
Completed task A: ⏱️ 01:23:45 (09:15 - 10:38)

---

## Usage Instructions

1. In Obsidian, open command palette (Cmd/Ctrl + P)
2. Type "Insert stopwatch" and press Enter
3. The stopwatch will be inserted as: `⏱️[00:00:00|0|stopped]`
4. Click the play button (▶) to start timing
5. The markdown file will update to show running state
6. Click stop (⏹) to pause, reset (↻) to clear, or finalize (✓) to convert to permanent text

## Format Breakdown

`⏱️[HH:MM:SS|elapsed_milliseconds|status]`

- Time shown in hours:minutes:seconds
- Milliseconds stored for precision  
- Status is either "running" or "stopped"
