# Terra World — Rivergate story bible

## Status and authority

Approved direction from the two supplied pivot drafts, consolidated on 2026-08-30.
This replaces the earlier child-learning story brief. It defines the intended
living-city game; it is not a claim that its economic, relationship, mystery or
AI story systems are already playable. See [the implementation architecture](docs/living-city-architecture.md)
for the existing foundation, missing systems and delivery gates.

The product remains **Terra World**. The city remains **Rivergate**.
**Leo** is the companion; **LEO** is acceptable display styling.
The construction entrepreneur is **Malik**, not a second Leo. Physical rivers,
Rivergate, River Studios and other geographic names do not change.

## 1. The promise

> A living city. A thousand stories. Your decisions.

Rivergate is a populated river city caught between two futures. Its historic
neighbourhoods, busy market, apartment blocks, civic buildings and newer skyline
already coexist. People go to work, wait for buses, visit friends and return
home. The city is not empty land waiting for the player to make it interesting.

But activity is not the same as prosperity. Some businesses are struggling,
housing pressure is rising, infrastructure needs care, young residents cannot
always find a future here, and the river carries the cost of past decisions.

Outside investors see an opportunity. They offer jobs, construction, technology
and money. Growth could help Rivergate—but who benefits, who pays, and what
might disappear?

The player becomes the city's newly appointed steward, with a council mandate
to guide its next era. They can repair, investigate, negotiate, build and
reconsider. They do not own the residents or decide their private lives.

There is no predetermined perfect Rivergate. A dense modern city, a cleaner
industrial centre and a community-led riverfront can each succeed or struggle
depending on implementation. The city's identity emerges from decisions, not
from a preset moral score.

## 2. Arrival: an existing city, not a blank map

Keep the current populated 3D world, night default, aerial view, first-person
exploration and accessible building interiors. Do not remove homes, residents,
traffic, shops or the skyline to match the draft's phrase “a few houses.”

The opening follows the river past illuminated apartments, late buses, Maya's
closing bakery, the old downtown and newer construction. A bridge inspection
crew provides a hint of the first problem. The camera journey is skippable;
returning players continue their save immediately.

A short city briefing is available, not an obligatory wall of statistics.
These are **proposed scenario values for balancing**, not current runtime facts:

| Scenario measure                        | Proposed starting value   |
| --------------------------------------- | ------------------------- |
| Simulated population                    | 8,421                     |
| Businesses                              | 137                       |
| Treasury                                | 4.2 million civic credits |
| Already committed to essential services | 2.7 million civic credits |
| Available discretionary budget          | 1.5 million civic credits |
| River health                            | 61%                       |
| Resident satisfaction                   | 54%                       |

Civic credits are fictional game accounting, never 0G tokens or real money.
The existing 32 rendered ambient residents represent a larger community; they
are not evidence that 8,421 individual AI agents are being rendered or simulated.
Displayed figures must come from the loaded scenario once this mode is built.

Leo's opening:

> “So… you're the person they sent.”
>
> “I've been watching Rivergate for a while. People here want very different things.”
>
> “The good news is that they still care.”
>
> “The difficult part is deciding what we can promise them.”
>
> “Come on. Let's see the city before we decide what it needs.”

## 3. Leo: a companion, not an oracle

Leo is the in-world voice of Rivergate's city intelligence. Curious, observant,
occasionally dry, and willing to be corrected, Leo experiences the city's
development alongside the player. He is neither a classroom teacher nor a
constant tutorial narrator.

He notices a closed shop, remembers a promise, suggests who to speak with,
compares evidence and asks a useful question. He offers competing explanations
rather than secretly choosing the player's policy.

There are three distinct kinds of speech:

- **Observation:** grounded in an actual event or measurement.
- **Hypothesis:** explicitly uncertain, with evidence and a way to investigate.
- **Opinion:** a perspective, not a new fact about the simulation.

Example:

> “The pollution rose after the factory expanded. That makes it worth checking,
> but timing alone doesn't tell us where the waste came from.”

If inspection identifies a broken sewage system:

> “I was wrong about the factory. The samples point to the old sewer.”
>
> “Good catch. I'll correct the record.”

Leo's earlier hypothesis is retained as a corrected belief, never rewritten
into a historical fact. He cannot invent offences, witnesses, personal promises,
relationships or causes to make a scene more dramatic.

## 4. First morning: the East Bridge

Start with a visible civic problem, not a tutorial explaining every system.

> **East Bridge closed after a safety inspection**
>
> 143 residents face disrupted access to work and essential services.
> The remaining route is open, but journeys take longer.
> Permanent repair estimate: 1.2 million civic credits.

This preserves a believable alternative route in a city that already has more
than one crossing. Nobody should walk or drive through a visibly closed bridge.

> **Leo:** “We can afford the repair. We can't afford every other request as well.
> Let's find out who needs that crossing most.”

The player can inspect the bridge, visit Maya, ask Malik about construction,
hear commuters and examine Nia's riverbank findings. The available decisions
include:

| Decision                        | Immediate benefit                                   | Cost or uncertainty to investigate                  |
| ------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Repair now                      | Restores the original connection after construction | Uses most discretionary funds; other work waits     |
| Temporary service               | Keeps essential journeys possible sooner            | Capacity, running costs and accessibility limits    |
| Divert traffic                  | Uses an existing safe connection                    | Delays, noise and pressure on another neighbourhood |
| Defer with a review date        | Preserves funds for an urgent competing need        | Longer disruption and lost trade                    |
| Propose a supported alternative | Lets the player combine measures                    | Requires feasibility, cost and safety checks        |

Not every option must exist in the first playable slice. Only show choices
whose consequences the engine can actually simulate. A free-form suggestion
becomes a proposal for review; it does not execute arbitrary AI-generated code.

An unresolved decision stays visible on the map and in a concise case journal:
what happened, what is known, who is affected, and what the player can do next.
No task should disappear merely because the player investigated a different one.

## 5. People with something at stake

### Maya — the bakery owner

Maya runs her family's bakery in the old downtown. Practical and stubborn, she
values familiar customers and a neighbourhood where her family can keep living.
She may welcome better foot traffic and oppose a plan that prices her out.
Preservation is a livelihood question, not a refusal of every change.

> “You keep calling it development. Tell me where we're supposed to go.”

Her reaction depends on actual rent, access, trade and agreements. Her bakery
cannot be declared closed while its business state says it is open.

### Malik — the construction entrepreneur

Malik owns a growing construction business and believes Rivergate needs homes,
jobs and reliable infrastructure. He can help solve the bridge problem, benefit
from Project Horizon, or support a smaller local alternative.

> “You can't preserve a city by refusing to let it change.”

He is not automatically corrupt or automatically correct. Contracts, delivery,
working conditions and kept promises shape his reputation. This adapts the
draft's entrepreneur “Leo” to the existing Malik character.

### Nia — the environmental researcher

Nia studies water, wildlife, heat and the river's surrounding habitats.
She supports development that accounts for measurable consequences.

> “You keep looking at that forest as empty land. It's not empty.”

She brings samples and competing explanations. A protest is a response to
specific decisions and affected interests, not an automatic response to growth.

### Sam — the city's memory

Sam, also known locally as Mr. Sam, remembers earlier bridges, vanished
businesses and old river routes. He provides context that a dashboard cannot.
A recollection may be incomplete; corroborating it is part of investigation.

> “That street wasn't always dry. Ask me what stood there before the shops.”

Existing resident IDs remain stable. New occupations, family links and
relationships require versioned state; changing narrative roles must not
silently rewrite an old save or its historical events.

## 6. Daily life and relationships

The long-term ambition is residents with homes, jobs, relationships, resources,
goals, memories and routines. Begin with four story-rich residents and a
representative ambient population. Do not pretend every visible pedestrian
already has a complete independently reasoning life.

Residents form opinions from relevant events: access to work, broken promises,
rent, clean water, displacement, support and local change. They can cooperate,
disagree, offer information, organise or leave when simulation conditions justify
it. They also have lives unrelated to the player.

A remembered promise must have a recorded commitment:

> “You promised the park would stay.”

That line is valid only if the player actually made the promise and the park's
subsequent state supports the complaint. Opinions belong to fictional residents;
the system does not diagnose or morally profile the human player.

## 7. Project Horizon

A corporation proposes a major redevelopment: housing, infrastructure,
a technology district and a headline promise of 10,000 jobs. Its preferred
footprint includes forest, old industrial land, homes and part of the riverfront.

The job figure is a **claim in the proposal**, not a guaranteed outcome.
Construction time, financing, local hiring, housing demand and operating results
determine what actually happens.

The player can accept, reject, negotiate, delay with a deadline, or build a
feasible alternative. Negotiation should eventually expose concrete clauses:
affordable housing, protected land, resident relocation, local hiring,
transport investment and enforceable delivery conditions.

Maya cares about staying in business. Malik sees work and opportunity. Nia asks
about runoff and habitat. Sam asks what the city will remember. Each can support
parts of a deal and oppose others.

There is no forced choice between “good green city” and “bad profitable city.”
The same policy can distribute costs and benefits differently across residents,
places and time.

## 8. Consequences, not scripted verdicts

Every major action should produce a traceable consequence now, later, or both.
Examples are conditional scenario possibilities, not universal economic laws:

- A new road can relieve congestion, then attract enough development to create
  new demand. This requires a demand model, not a scripted punishment for roads.
- Redevelopment can create jobs while increasing rents; protections and new
  housing can change who benefits and who bears the cost.
- Wetlands can reduce runoff and flood damage during a comparable rainfall event.
- Planting trees can change local shade and habitat when those rules are present.
- Deferring a repair can preserve cash while worsening access and maintenance.

Corrected memory example:

> “The wetlands absorbed part of the floodwater. Without that buffer, the model
> estimates the damage would have been worse.”

A counterfactual is labelled as an estimate and requires a comparison run.
If no comparison exists, Leo only describes the observed reduction in runoff.
Never repeat the draft's inverted claim that preserving wetlands caused the flood.

Time advances in simulation. Pause and save remain available; returning after a
real-world absence does not secretly bankrupt a city. Introduce no streaks,
offline punishment or artificial urgency.

## 9. A city that creates stories

The story director looks for meaningful combinations of **real game events**.
It can select a focus, ask a grounded question and narrate a developing conflict.
The engine owns the events; AI does not invent them after the fact.

Example: **The Bakery, the Builder and the New District**

Maya's trade is struggling. A pedestrian district opens. Malik's company builds
nearby apartments. Rents change. If a simulated family member actually takes a
job with Malik, the director can connect these facts into a story about shared
interests within a neighbourhood dispute.

Without that family/job event, the story must use another supported development.
A touching invented detail is still a fabricated city history.

Stories carry related event IDs, affected residents, evidence, open questions,
known choices and a next possible interaction. A story can branch, pause, merge
with another or end quietly. Repeating the same article under a new title is not
a new story. Authored personalities and encounter patterns support generative
combinations; the goal is not to prewrite every quest or remove all authorship.

## 10. Investigations and mysteries

A pollution spike is a clue, not proof of illegal dumping. The player can examine
samples, inspect infrastructure, compare timings and speak with residents.

A scenario seeds its hidden cause before investigation. Evidence is revealed by
valid actions; AI cannot move the cause to whichever suspect makes the best
twist. Deliberate wrongdoing is a fictional scenario fact, never a baseless
generated accusation.

If an employer is responsible, decisions may include enforcement, remediation,
phased modernisation, support for affected workers or further investigation.
Their legal and financial effects exist only as authored game rules, not as
real-world legal advice. Ignoring the case may also have consequences.

## 11. Rivergate Times and city memory

Publish a small newspaper edition after meaningful simulated time or events,
not incessant pop-ups. Examples: a bridge reopening, a bakery anniversary,
a verified river improvement, a development hearing or an unresolved local rumour.

News, opinion, rumour and correction are visibly different. Every factual report
links to its source events. Reading an article can point the player toward a
resident or place, but closing it does not block play.

Significant events become named historical entries: the Horizon agreement,
a flood, a downtown revival, a river cleanup or a winter blackout. Titles, dates
and “year seven” belong to the actual playthrough, not a predetermined timeline.
Leo can recall them later without changing what happened.

0G-backed memory preserves this continuity across supported restores. It is not
a claim that a general AI model was retrained by the player.

## 12. Factions and the long view

Business owners, workers, tenants, environmental groups, infrastructure advocates
and heritage organisations can emerge from shared needs. Members can disagree
internally. Nobody is always right, and nobody is created only to be evil.

At major turning points, Leo reflects on the city through places and lives as
well as numbers: a saved bakery, a relocated family, a completed contract, a
cleaner river, an expensive compromise and a promise still unresolved.

> “When you arrived, the city was already full of stories.”
>
> “You changed some of them. Others changed your plans.”
>
> “If you could go back, what would you do differently?”

The game does not impose a single YOU WIN screen or announce the player's moral
character. The city remains explorable. Players can read its archives, visit
residents, compare an explicitly saved branch or start another city.

## 13. Play rhythm and presentation

Notice a change → investigate a place → talk to people → consult Leo → form a
theory → choose a feasible action → observe immediate and delayed effects →
discover a new story.

Learning happens through curiosity, not lessons, worksheets or constant quizzes.
The city remains the main screen. Contextual conversations, a case journal,
resident requests and map cues explain what to do without filling the view
with permanent dashboards. Important choices show known costs, affected places,
uncertainties and whether the action can be reversed.

Retain realistic 3D assets, first-person exploration, day/night, scalable
graphics, reduced motion and keyboard/touch access. Busy does not mean every
resident runs an expensive AI request every frame.

## 14. 0G is part of the story architecture

Our product design assigns clear jobs to the infrastructure:

- **0G Compute:** Leo, resident dialogue, evidence-grounded story selection,
  newspaper writing and relevant memory summaries.
- **0G Storage:** encrypted city histories, relationship state, accepted story
  records and checkpoints; versioned public scenario packs where appropriate.
- **0G Agentic NFT / Agentic ID:** one evolving Rivergate city intelligence,
  linking its authorised use to encrypted memory and verified milestone versions.

Leo is the city's interface, not a tokenised human or a separately required NFT.
Ordinary NPCs are fictional records inside the city; do not mint every pedestrian,
building or footstep. The city identity does not autonomously run its own AI:
the application coordinates approved work.

Gameplay stays wallet-free and local-first. AI and background 0G work do not block
walking, driving, repairs or saves. Missing infrastructure is visibly reported as
local/fallback—not falsely presented as a live 0G success.

The [0G architecture and delivery gates](docs/living-city-architecture.md)
specify the implementation, privacy boundaries and proof needed for these goals.

> Don't write every story. Build a world that can create stories.
