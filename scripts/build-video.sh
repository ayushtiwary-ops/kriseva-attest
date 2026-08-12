#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VIDEO_DIR="$PROJECT_ROOT/video"
OUTPUT_VIDEO="$VIDEO_DIR/KRISEVA_ATTEST_DEMO_90S.mp4"
OUTPUT_THUMBNAIL="$VIDEO_DIR/KRISEVA_ATTEST_DEMO_THUMBNAIL.png"
VOICE="${ATTEST_VOICE:-Rishi}"
SPEECH_RATE="${ATTEST_SPEECH_RATE:-170}"
TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/attest-video.XXXXXX")"

cleanup() {
  rm -rf "$TASK_DIR"
}
trap cleanup EXIT

for command_name in node ffmpeg ffprobe say awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

mkdir -p "$VIDEO_DIR" "$TASK_DIR/scenes"
node "$SCRIPT_DIR/build-video-scenes.mjs" "$TASK_DIR/scenes"
CANDIDATE_VIDEO="$TASK_DIR/KRISEVA_ATTEST_DEMO_90S.mp4"
CANDIDATE_THUMBNAIL="$TASK_DIR/KRISEVA_ATTEST_DEMO_THUMBNAIL.png"

durations=(12 12 12 22 17 15)
: > "$TASK_DIR/segments.txt"

for index in 1 2 3 4 5 6; do
  scene_id="$(printf '%02d' "$index")"
  duration="${durations[$((index - 1))]}"
  fade_out="$(awk -v d="$duration" 'BEGIN { printf "%.2f", d - 0.35 }')"
  frame_count="$((duration * 30))"

  say -v "$VOICE" -r "$SPEECH_RATE" -o "$TASK_DIR/voice-$scene_id.aiff" -f "$TASK_DIR/scenes/scene-$scene_id.txt"
  node "$SCRIPT_DIR/verify-narration-fit.mjs" "$TASK_DIR/voice-$scene_id.aiff" "$duration" > "$TASK_DIR/narration-fit-$scene_id.json"

  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -framerate 30 -i "$TASK_DIR/scenes/scene-$scene_id.png" \
    -i "$TASK_DIR/voice-$scene_id.aiff" \
    -filter_complex "[0:v]zoompan=z='min(zoom+0.00006,1.022)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frame_count:s=1920x1080:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=$fade_out:d=0.35,format=yuv420p[v];[1:a]highpass=f=70,lowpass=f=12000,loudnorm=I=-18:LRA=7:TP=-2,apad=pad_dur=$duration,atrim=duration=$duration,afade=t=in:st=0:d=0.12,afade=t=out:st=$fade_out:d=0.35[a]" \
    -map '[v]' -map '[a]' -t "$duration" -r 30 \
    -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.1 \
    -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
    "$TASK_DIR/segment-$scene_id.mp4"

  printf "file '%s'\n" "$TASK_DIR/segment-$scene_id.mp4" >> "$TASK_DIR/segments.txt"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$TASK_DIR/segments.txt" -c copy \
  -metadata title="KRISEVA ATTEST · 90-second synthetic prototype demonstration" \
  -metadata comment="Research-stage prototype; synthetic demo data; not a regulatory filing; not connected to IFSCA systems." \
  -movflags +faststart "$CANDIDATE_VIDEO"

ffmpeg -hide_banner -loglevel error -y -ss 2.5 -i "$CANDIDATE_VIDEO" -frames:v 1 "$CANDIDATE_THUMBNAIL"
node "$SCRIPT_DIR/install-video-release-cli.mjs" "$CANDIDATE_VIDEO" "$CANDIDATE_THUMBNAIL" "$OUTPUT_VIDEO" "$OUTPUT_THUMBNAIL"

echo "Built $OUTPUT_VIDEO"
