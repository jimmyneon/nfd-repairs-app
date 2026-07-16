# Notification Sound Required

## File Needed
`/public/notification.mp3`

## Purpose
This audio file is used by the CustomerWaitingBanner component to alert staff when a customer arrives for collection.

## Requirements
- **Format:** MP3
- **Duration:** 1-3 seconds
- **Volume:** Medium (will be played at 50%)
- **Type:** Pleasant notification sound (not jarring)

## Recommendations

### Option 1: Use a Free Sound
Download from:
- **Freesound.org** - https://freesound.org/search/?q=notification
- **Zapsplat** - https://www.zapsplat.com/sound-effect-category/notifications/
- **Pixabay** - https://pixabay.com/sound-effects/search/notification/

### Option 2: System Sounds
Use macOS system sounds:
```bash
# Copy a system sound to your project
cp /System/Library/Sounds/Glass.aiff /path/to/repair-app/public/
# Convert to MP3 using ffmpeg
ffmpeg -i Glass.aiff notification.mp3
```

### Option 3: Generate Online
- **MyInstants** - https://www.myinstants.com/
- **SoundBible** - https://soundbible.com/

## Suggested Sounds
1. **"Ding"** - Simple, professional
2. **"Chime"** - Pleasant, attention-grabbing
3. **"Bell"** - Classic notification
4. **"Ping"** - Subtle but noticeable

## Testing
After adding the file:
1. Enable audio in the CustomerWaitingBanner
2. Trigger a customer arrival
3. Verify sound plays
4. Check volume is appropriate
5. Test on different devices/browsers

## Fallback
If the file is missing, the component will:
- Catch the error gracefully
- Log to console
- Continue working without audio
- Visual banner still appears

## Current Status
⚠️ **File not yet added** - Audio alerts will not work until this file is present.
