# author-compass
Author Compass
Never wonder if your book is ready.
A private AI writing studio built for editing, not generating. It's your editor-in-chief — it identifies weak spots, protects the parts that already work, and helps you finish and publish instead of endlessly rewriting.
Setup — free, no build step
Open index.html locally, or turn on GitHub Pages for this repo (Settings → Pages → Deploy from branch → main).
That's it. The app works completely free with no account, no API key, no cost:
Book Library, Chapter Manager, Freeze Chapter
Chapter Health scoring (flow, emotion, clarity, pacing, repetition, dialogue, and more — computed locally from your text)
Book Readiness score with plain-English reasoning
Story Map, Version Timeline, Compare Versions (word-level diff)
Lessons Learned (patterns from your own edit history)
Daily Writing Mission
Optional: AI-powered features
A few deeper features use Claude's API directly from your browser and need your own Anthropic API key (a few cents per use, entirely optional):
AI Editor — diagnoses weak paragraphs and explains why, without rewriting them
Consistency Scanner (deep scan) — catches contradictions, tone shifts, and loose threads across the whole manuscript
Protect the Soul of the Book — summarizes your book's voice and themes so future edits stay true to it
Smart Questions — ask things like "Should I publish?" or "Which chapter is strongest?"
Get a key at console.anthropic.com and add it in the app's Settings page. It's stored only in your browser's local storage and sent directly to Anthropic — never through any other server.
Notes
All data (books, chapters, versions, health scores) lives in this browser's localStorage. It stays on this device only — no cloud sync, no account.
Clearing your browser data will erase everything. There's no backup built in.
Files
index.html — page shell
style.css — nighttime fairy garden theme
app.js — all app logic
