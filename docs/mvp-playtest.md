# Terra World MVP playtest

## Test profile

- Date: 2026-08-29
- Campaign: Rivergate Foundations v1
- Child mode: guest, no account and no wallet
- Browser sizes: 1280 × 720 desktop and 390 × 844 mobile
- Network mode: local-first fallback; no 0G credentials were present
- Privacy rule: synthetic city data only; no name, age, school, location, photo,
  voice recording, wallet address, or free-form child text was entered

## Moderated child journey

1. The welcome screen explains that the child will grow Rivergate and that the
   computer guide can explain verified changes but cannot control the city.
2. The player chooses a planner badge and colour flag without entering a name
   or creating an account.
3. The player starts the water mission and lands on the Rivergate planning
   table with the water pump selected.
4. The map exposes the same first placement through pointer and keyboard: arrow
   keys move the cursor and Enter places the pump.
5. The provisional cost appears before the player runs the city. Undo remains
   available until that commit.
6. Running the city completes “Find the water,” advances to “Make water safe,”
   updates the budget and water indicator, and presents a cause-and-effect
   reflection.
7. Reloading restores the verified local session automatically. No wallet,
   transaction, token, or recovery phrase is shown to the child.

Result: passed in the in-app browser on desktop and narrow mobile layouts. No
horizontal page overflow was detected at 390 px.

## Adult and judge boundary

1. “Adults & judges” opens a separate modal and requires a simple adult check.
2. The unlocked view contains accessibility controls, a learning snapshot,
   deterministic package/state/action hashes, truthful 0G readiness states,
   and a protected reset flow.
3. High contrast, text scaling, sound/read-aloud state, and local-save status do
   not introduce technical language into the child workspace.
4. The proof view does not claim a live root, transaction, Agentic ID, or TEE
   result when the corresponding deployment configuration is absent.

Result: passed. Live links remain intentionally unavailable until Galileo,
Storage, Compute, and sponsor credentials are configured.

## Automated evidence

- Full Vitest suite: 46 files, 450 tests passed.
- Complete clean-profile campaign: all 15 missions finish and restore from a
  serialized session.
- Ending coverage: River Guardian, Steady Restorer, and Brave Rebuilder are
  reachable through legitimate deterministic runs.
- Safety coverage: malformed, ungrounded, overlong, personal-data-shaped, and
  prohibited guide output falls back safely.
- Checkpoint coverage: encryption, wrong-key rejection, tamper rejection,
  durable queueing, idempotent retry, and proof-bound remote receipts.
- Storage coverage: canonical package publication, fresh-reader retrieval,
  content/root/package checks, and deliberate tamper rejection.

## Demo rehearsal

Use this repeatable seven-step path:

1. Open Terra World and select **Water keeper**.
2. Start the water mission.
3. Press Enter on the highlighted map cursor to place the first pump.
4. Point out the provisional cost and undo control.
5. Run the city and show the completed mission plus water-system change.
6. Reload to demonstrate local recovery, then open **Adults & judges**.
7. Unlock the adult view with `4 + 3`, show replay hashes and the honest network
   readiness states, then explain that 0G is adult-sponsored and never requires
   a child wallet.

## Remaining environment rehearsal

Before the hackathon recording, repeat the same path with the production
variables configured and capture:

- the verified Rivergate 0G Storage root;
- one private 0G Compute guide response plus fallback proof;
- the deployed campaign registry and Terra City Agent addresses;
- one sponsored city milestone transaction;
- one encrypted backup restored in a fresh browser.

Do not replace missing evidence with mock transaction hashes or simulated
“verified” badges.
