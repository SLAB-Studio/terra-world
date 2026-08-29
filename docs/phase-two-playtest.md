# Phase 2 offline campaign playtest

## Validation status

This is a repeatable 20–30 minute manual test script, not a record of a completed human playtest.

The automated clean-profile run completes all 15 missions from an empty deterministic map using only public production APIs. It validates real placement and utility propagation, exact turn-3 rain, exact turn-9 growth, exact turn-15 storm, all five chapter directors, a real **Steady Shaper** ending, full campaign-session save/close/reopen, completed-ending restore, and deterministic replay with matching city and action-log hashes.

The strategy deliberately reserves the school and clinic footprints from turn 1, balances homes across both neighbourhoods, removes excess treatment capacity instead of inventing a refund, and uses honest empty-plan turns for battery charging and scheduled time. The executable evidence is `apps/web/lib/integration/phase-two-campaign.integration.test.ts`.

Automation does not establish the 20–30 minute usability target or substitute for touch, keyboard, and comprehension testing by a person. Those results must be recorded with the script below before claiming a completed human playtest.

## Manual script (target: 20–30 minutes)

### 1. Clean start — 2 minutes

1. Clear Terra World site data, switch the device offline, and reopen the app.
2. Create a local guest profile without entering a name, age, school, location, wallet, or email.
3. Start Rivergate and confirm the map is empty, the budget is $8,000, the first mission is **Find the water**, and no wallet prompt appears.

Expected: the game is usable offline, shows child-friendly mission text, and exposes no technical account setup.

### 2. Mouse or trackpad building — 4 minutes

1. Select a road, place it, choose **Undo**, and confirm the tile and provisional cost return to their prior state.
2. Place the road again. Select a water pump, use the flood overlay, and place it beside the river.
3. Run the city and confirm turn 1 completes exactly once.
4. Add treatment plants on safe connected land and run turn 2.

Expected: valid and invalid tiles are obvious, undo changes only the provisional plan, committed buildings remain, and the mission advances only after its required facts are true.

### 3. Touch interaction — 3 minutes

1. On a phone or touch emulator, pan the map without placing a building.
2. Scroll the building tray horizontally and select a home.
3. Tap a valid tile beside a road, tap an invalid tile, and verify only the valid placement enters the plan.
4. Undo and replace the home, then commit the turn.

Expected: map panning does not cause accidental placement, the tray does not trap the page, invalid feedback is readable, and the turn-3 rain event appears once.

### 4. Keyboard-only interaction — 3 minutes

1. Reload the current session and use Tab until the catalogue and map controls receive visible focus.
2. Select a building without a pointer. Move the map cursor with arrow keys.
3. Press Enter to place, R to rotate a rotatable building, and Delete to remove a provisional or occupied item as the UI instructs.
4. Undo once, replace the item, and run the city.

Expected: the cursor remains visible, the spoken tile summary reports terrain/occupancy/validity, focus is never lost, and every pointer action has a keyboard equivalent.

### 5. Save, close, and resume — 3 minutes

1. Record the current chapter, mission, objective ticks, turn, budget, buildings, latest event, and active overlay.
2. Close the tab completely, reopen Terra World while still offline, and resume the same guest city.
3. Compare every recorded value and perform one undoable placement.

Expected: the full campaign cursor and history return—not merely the city map—and the next action appends to the existing deterministic log.

### 6. Finish Chapters 3 and 4 — 5 minutes

1. Build safe walking routes in both halves of Rivergate.
2. Place school and clinic coverage so both neighbourhoods meet the care evaluator, not just the citywide counters.
3. Add recycling and choose either a bus-led or road-led transport strategy.
4. Reach six homes, at least 32 residents, adequate waste processing and transport, low pollution, and affordable maintenance.

Expected: unfair care plans stay blocked; balanced care passes; either declared growth strategy can pass; the turn-9 growth event fires once.

### 7. Final storm and ending — 5 minutes

1. Restore at least one wetland and compare the nature/flood overlays before and after.
2. Confirm reliable energy, charged backup storage, emergency road access, safe water, and a repair reserve.
3. Run turns until the final storm fires on turn 15—never before, after, or twice.
4. Open the ending and adult learning summary.

Expected: the ending is one of River Guardian, Steady Shaper, or Brave Rebuilder; it matches the storm evaluator; it identifies strongest/weakest systems and explains causes without AI or blame.

### 8. Replay check — 2 minutes

1. Reload the completed city once more.
2. Replay its ordered action log from the original empty map.
3. Compare the replayed turn, buildings, budget, metrics, milestones, ending inputs, action-log hash, and final-state hash.

Expected: replay reproduces the exact final city and hashes, and the stored run contains no personal data.

## Recording template

- Tester/device/browser:
- Start and finish time:
- Mouse/trackpad result:
- Touch result:
- Keyboard result:
- Save/close/resume result:
- Final storm turn and event count:
- Ending reached:
- Replay/hash result:
- Confusing moment or intervention required:
- Overall pass/fail:

Only check P2.12 and the Phase 2 gate after a human completes this script from a clean profile without developer intervention and the observations are recorded here or in a dated test report.
