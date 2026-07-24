# Regenerate demo.gif (requires https://github.com/charmbracelet/vhs):
#   npm run build && vhs demo.tape
Output demo.gif
Require git
Require node

Set FontSize 20
Set Width 1460
Set Height 720
Set Padding 16
Set TypingSpeed 30ms
Set Theme "Jellybeans"

Hide
Type `REPO="$PWD"; cd "$(mktemp -d)"; printf '# Weekly Sync\n\n## Notes\n\nKim walked through the Q3 timeline.\n\n## Attendees\n\n- Adam\n- Kim\n' > notes.md; git init -q; git add notes.md; git commit -qm baseline; mdpatch() { node "$REPO/dist/cli.js" "$@"; }; clear`
Enter
Sleep 3s
Show

Type "cat notes.md"
Enter
Sleep 2.5s

Type 'echo "Decided: we ship on Thursday." | mdpatch patch append heading "Weekly Sync::Notes" notes.md'
Enter
Sleep 2.5s

Type "git --no-pager diff"
Enter
Sleep 5s
