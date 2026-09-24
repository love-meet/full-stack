# Landing-page graphics

Drop Olivia's renders in this folder using **exactly** these filenames. They
appear on the site automatically — no code change, no rebuild of anything but
the site itself.

| Filename | The graphic | Where it appears |
|---|---|---|
| `feed.png` | "A Feed of People" | Screenshots strip, first |
| `chat.png` | "Chat that stays yours" | Screenshots strip, second |
| `games.png` | "Games" — the picker with eight tiles | Screenshots strip, third |
| `coins.png` | "Coins" | Coins panel, in What you get |
| `gifts.png` | "Gifts" — the catalogue with coin prices | Coins panel, in What you get |

Two more of Olivia's set are not placed yet and can be dropped in later:
the draughts board render and the friends/follows one.

## Notes

- **PNG with transparency** where the render has no background — several of
  hers do, and they sit better on the dark page that way.
- **Do not add a caption underneath.** Five of these have their title baked
  into the artwork ("Chat that stays yours", "Games", "Coins", "Gifts",
  "A Feed of People"), so the page deliberately renders no heading beside
  them. A second title would read as a mistake.
- Anything missing falls back to a CSS drawing of the real screen — see
  `src/components/ScreenMockups.tsx`. The page never shows a hole or a broken
  image, so a wrong filename degrades quietly rather than embarrassingly.
- Keep them under ~400 KB each if you can. They are the heaviest thing on the
  page and the page is the first thing anyone sees.

## Where the code reads them

`src/components/Screenshots.tsx` and `src/components/WhatItIs.tsx`.
