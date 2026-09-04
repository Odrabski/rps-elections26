# Your own sounds

Drop a file in this folder named after the cue, and it replaces the default. Any format the Mac can
read — wav, mp3, ogg, m4a, aiff, flac. Then:

```
npm run sfx      # rebuilds client/public/sfx/ from here + the defaults
```

Open `tools/sfx-preview.html` in a browser afterwards to hear every cue back to back.

Only the cues you drop a file for change; everything else keeps its default. Nothing in here is
shipped — the build converts it to mono 48 kbps mp3 in `client/public/sfx/`, and that is what
deploys.

## Cue names

Name the file exactly this, plus any extension. Cues with variants take a `.1` … `.4` suffix, and
the game picks among them at random — that is what stops a sound you hear sixty times a game from
wearing out.

| file to drop | when it plays | heard per game |
| --- | --- | --- |
| `piece.select.1` … `.4` | you pick up one of your soldiers | 40–80 |
| `move.step.1` `.2` | **your** soldier moves to an empty tile | 20–40 |
| `move.opponent.1` `.2` | **their** soldier moves | 20–40 |
| `clash.impact` | two soldiers meet and the cloud drops | 10–20 |
| `fight.fanfare` | a bugle charge in the beat before 3-2-1 | 10–20 |
| `fight.start` | on the FIGHT beat, after 3-2-1 | 10–20 |
| `fight.throw` | rock/paper/scissors are revealed | 10–20 |
| `fight.win` | you won that fight | 5–12 |
| `fight.lose` | you lost that fight | 5–12 |
| `fight.tie` | same weapon, nothing decided | 3–8 |
| `trap.spring` | a trap goes off | 0–2 |
| `king.captured` | a king falls — the game is over | 0–1 |
| `result.win` | the victory screen | 0–1 |
| `result.lose` | the defeat screen | 0–1 |
| `setup.king` | you place your king | 1 |
| `setup.trap` | you place your trap | 1 |
| `setup.shuffle` | you re-deal your soldiers' weapons | 1 |
| `fight.win-fanfare` | the flourish before the winner is named | 1 |
| `fight.lose-fanfare` | the same beat, for the player who lost | 1 |
| `fight.punch` | blows landing inside the cloud | 10 |
| `setup.begin` | both sides ready, the match starts | 1 |
| `setup.wrong-side` | you tapped the other bloc's pieces | 0–4 |
| `team.pick` | you choose coalition or opposition | 1 |
| `lobby.opponent-joined` | your friend arrives and the game begins | 1 |
| `ui.tap` | any button | ~15 |
| `ui.error` | a join failed | 0–2 |

## What makes a good clip

**Keep the frequent ones short.** Anything above ~20 plays a game wants to be under 100 ms with
almost no tail — a tail is what turns a cue into an irritation by the second game. `king.captured`
and the two result stings are heard once and can run for seconds.

**Give the frequent ones variants.** Four slightly different takes of the same sound read as one
sound with life in it; a single take read sixty times reads as a machine.

**Level them together.** Aim for about −16 LUFS. The build does not normalise, so a clip mastered
loud will jump out. If one ends up too loud, `GAIN` near the top of `client/src/utils/sfx.ts` trims
a single cue without re-cutting the file.

`fight.fanfare` is synthesised rather than sampled — no CC0 pack I could find has a trumpet, and a
bugle call only uses notes from the harmonic series, which is exactly why it sounds like one. The
generator is in the commit history if you want to retune it; dropping a real trumpet in here
replaces it like any other cue.

The two move cues are the same fabric pitched apart — yours up 22%, theirs down 16% — so they
read as the same kind of event from two different people. Both are trimmed to 480ms, the length of
the slide they cover, so one move's sound never runs into the next.

Several cues have **no default** and only exist if you supply them: `fight.start` is currently
`fight.start.ogg` in this folder, from Kenney's Voiceover Pack: Fighter. That pack also has
`winner`, `you_lose`, `it's_a_tie`, `ready` and a spoken `3` / `2` / `1` — all CC0, all a good fit
for the fight sequence if you want more of it announced.

## Where free clips come from

The defaults are [Kenney](https://kenney.nl/assets/category:Audio) — Creative Commons CC0, public
domain, no attribution, commercial use fine. Others in the same vein: [Pixabay sound
effects](https://pixabay.com/sound-effects/), [BigSoundBank](https://bigsoundbank.com/), and
[freesound.org](https://freesound.org/) filtered to CC0.

Check the licence before shipping anything. CC0 needs nothing from you; CC-BY needs a credit
somewhere in the game.
