# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Confirmed in the brainstorming round (2026-10-26):
- Wallpaper: live HTML (canvas 2D scene + WebGL grade), hosted full-screen behind the desktop.
- Island and pet: one native Swift menu-bar app ("Kamar"), sprites pre-rendered from the same art pipeline so runtime stays light (the Mac has 8 GB RAM).
- Menu bar: the macOS menu bar auto-hides; the island carries the time and battery (SketchyBar was retired in revision round 3).
- Windows: floating, outlined by JankyBorders; macOS 26 native tiling instead of a tiling manager.
- App themes: VS Code + Ghostty terminal, Chrome, Spotify (Spicetify). Discord excluded (client mods break its ToS).
- One token file (`design/tokens.json`) is the material list; scripts generate every tool's config from it.

## Users

One person: the owner of this MacBook Air M1 (no notch, macOS 26.3, 2560×1600). Codes, studies, and listens to Spotify on it daily. Writes in Indonesian. Wants the desktop to stop feeling monotonous.

## Product Purpose

Turn the whole Mac desktop into one lived-in room drawn as a comic printed on old paper (the art direction in DESIGN.md). Success: the desktop feels warm and inhabited at a glance, changes with the time of day, and never gets in the way of work.

## Positioning

The desktop is the room, not a theme on top of macOS: widgets are objects in the room (wall clock, tear-off calendar, cork board), the pet lives there, and the light moves with the real sun.

## Operating Context

- The wallpaper is mostly covered by app windows; the edges (window wall on the left, floor along the bottom, shelves on the right) carry the most visible art.
- The Dock stays at the bottom (53 px tiles); the pet walks along its top edge, which reads as the room's floor.
- No notch: the "dynamic island" is a paper tab at the top centre of the screen. Clicking it opens a search (Claude Code, Spotify, VS Code projects, timers and alarms, focus mode).
- macOS appearance is currently Dark; generated themes ship a light (day) and dark (night) variant.

## Capabilities and Constraints

- Everything must be reversible: install by symlink, an uninstall script restores prior settings.
- Runtime budget: one WebView (wallpaper), animation capped at low fps, paused when covered.
- No permission-hungry features without need: typing reactions use idle-time APIs (no Input Monitoring); Spotify state comes from its distributed notifications; playback control asks Automation consent once.
- Never install from unverified sources (the ScreenKit repo in the first reference list was a malware lure and was dropped).

## Brand Commitments

DESIGN.md is binding and owned by the user: "a comic printed on old paper" — banded cel shading, hand-inked dark-brown lines (#2B1C14, never black), faded print grade, paper grain, late-afternoon sun as the default mood, pixel art only for people in pictures. It is never overwritten by tooling.

## Evidence on Hand

No user-supplied artwork; `references/` is empty. All illustration is authored in code for this project.

## Product Principles

1. The room is one coherent world; every surface (bar, island, borders, terminal) speaks its ink-and-paper language.
2. Alive but calm: motion is slow, ambient, and tied to real signals (time, music, typing), never decorative noise.
3. Work comes first: nothing steals focus, clicks, or battery the user would notice.
4. One source of truth: change a colour once in the material list and every tool follows.
