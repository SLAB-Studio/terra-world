# Terra City Architecture

## 1. Product summary

Terra City is a browser-based learning game for children aged approximately 8–13. Children begin with an empty river-valley landscape and build a functioning city by dragging homes, utilities, public services, transport, waste systems, and natural infrastructure onto the map.

The city itself is a persistent AI character. It observes its condition, explains the consequences of the child's decisions, remembers verified milestones, and develops from empty land into a resilient city.

The child never connects a wallet, approves a transaction, handles tokens, or sees blockchain terminology.

### MVP promise

> Build a living city from scratch, discover how its systems affect one another, and help it survive the final storm.

### Learning method

Terra City does not teach through conventional quizzes. Its learning loop is:

1. Understand a city need.
2. Predict what might solve it.
3. Drag and place infrastructure.
4. Run the city simulation.
5. Observe visible consequences.
6. Hear the city explain what happened.
7. Revise the design.

## 2. Architectural principles

1. **The simulation is authoritative.** AI explains outcomes but never calculates or changes them.
2. **The city is the agent.** There is no separate generic chatbot character.
3. **0G is invisible to children.** The application sponsors all storage, compute, identity, and chain operations.
4. **Local-first interaction.** Dragging, placement, simulation, and ordinary saves work without waiting for a network transaction.
5. **Milestones, not clicks, go on-chain.** Only meaningful city evolution is committed to the Agentic ID.
6. **No child personal data on-chain.** City identity and city history are distinct from child identity.
7. **Graceful degradation.** The city remains playable when 0G services are temporarily unavailable.

## 3. High-level system

```mermaid
flowchart TB
    Child[Child or team] --> Web[Terra City web game]
    Adult[Parent or teacher] --> Controls[Adult controls and consent]
    Controls --> Web

    subgraph Device[Child device]
      Web --> Map[Drag-and-drop city map]
      Map --> Engine[Deterministic simulation engine]
      Engine --> Local[(IndexedDB local save)]
      Engine --> Queue[Background sync queue]
    end

    Web --> API[Terra City application server]

    subgraph Application[Application server]
      API --> Validation[Validation, privacy filter, rate limits]
      Validation --> AgentRuntime[City-agent runtime]
      Validation --> SaveService[Checkpoint service]
      Validation --> VerifyService[Run replay and verification]
      Sponsor[Restricted sponsor wallet] --> AgentRuntime
      Sponsor --> SaveService
      Sponsor --> VerifyService
    end

    AgentRuntime --> Compute[0G Compute Router]
    AgentRuntime --> AgentID[City Agentic ID on 0G Chain]
    AgentRuntime --> Storage[0G Storage]
    SaveService --> Storage
    VerifyService --> AgentID
    Campaign[Campaign Registry on 0G Chain] --> Storage
```

## 4. User experience architecture

### 4.1 Child experience

The child sees only game concepts:

- Create my city
- Choose a city name and emblem
- Select a planning role
- Drag a building onto the map
- Inspect water, power, nature, and community coverage
- Run the city
- Ask the city for an explanation or hint
- Improve the design

The child never sees:

- Connect wallet
- Gas fees
- Token balances
- Transaction signatures
- Contract addresses
- Storage hashes
- Model-provider selection

### 4.2 Adult experience

An adult area is separated from child play. It controls:

- Optional cloud backup
- Family or classroom membership
- Learning summaries
- AI and privacy information
- Data deletion
- Optional future ownership of the city's Agentic ID
- Technical proof mode for hackathon judges

### 4.3 Identity layers

| Layer | Child-facing representation | Technical representation |
|---|---|---|
| Player | Avatar, nickname, selected role | Local profile or adult-managed member ID |
| City | Name, emblem, stage, traits | Agentic ID token and city ID |
| Adult | Parent or teacher sign-in | Adult account and optional owner address |
| Platform | Invisible | Sponsor wallet and authorised executor |

For the MVP, the platform sponsor owns newly created City Agentic IDs. A later adult-only flow may transfer a city to a parent or teacher.

## 5. Gameplay architecture

### 5.1 Map

The MVP uses one isometric or top-down river-valley map divided into placeable tiles.

Each tile contains:

- Terrain type
- Elevation band
- Flood risk
- Soil or habitat value
- Existing occupancy
- Road, water, and electricity connections

### 5.2 Draggable building catalogue

The MVP contains approximately twelve placeable items:

1. Home
2. Road
3. Water pump
4. Water-treatment plant
5. Solar array
6. Battery
7. School
8. Clinic
9. Bus stop
10. Recycling centre
11. Wetland
12. Trees or community park

Each building definition is data-driven:

```ts
type BuildingDefinition = {
  id: string;
  name: string;
  category: "housing" | "water" | "energy" | "service" | "transport" | "waste" | "nature";
  constructionCost: number;
  maintenanceCost: number;
  footprint: TileOffset[];
  placementRules: PlacementRule[];
  inputs: ResourceFlow[];
  outputs: ResourceFlow[];
  effects: CityEffect[];
  coverage?: CoverageDefinition;
};
```

### 5.3 Placement interaction

While dragging a building, the game displays:

- Green valid tiles
- Red invalid tiles
- Flood-risk overlay
- Water and electricity coverage
- Habitat impact
- Construction cost
- Maintenance cost
- Connection requirements

Placement is provisional until the child selects **Run the City**. Provisional changes can be undone freely.

### 5.4 Guided campaign

A completely unrestricted sandbox may overwhelm first-time players. The MVP begins with an empty map but introduces systems through five guided chapters:

1. **Water brings a town to life** — water source, pipes, and first homes.
2. **Power the neighbourhood** — solar generation, batteries, and reliability.
3. **Care for residents** — clinic, school, safety, and fair access.
4. **Handle growth** — waste, transport, pollution, and maintenance.
5. **Survive the storm** — flooding, backup power, wetlands, and resilience.

The sandbox opens progressively as the child learns each system.

## 6. Deterministic simulation engine

The simulation engine is a pure TypeScript package shared between the browser and server.

### 6.1 Responsibilities

- Validate building placement
- Calculate construction and maintenance costs
- Calculate water, electricity, waste, transport, and service coverage
- Advance population and city demand
- Apply pollution and biodiversity effects
- Run scheduled events and the final storm
- Produce structured causes and effects
- Generate reproducible state hashes
- Replay a complete run on the server

### 6.2 Main state

```ts
type CityState = {
  schemaVersion: 1;
  cityId: string;
  campaignId: string;
  campaignVersion: number;
  seed: string;
  turn: number;
  stage: "seed" | "settlement" | "town" | "city" | "resilient-city";
  population: number;
  budget: number;
  tiles: TileState[];
  buildings: PlacedBuilding[];
  indicators: {
    water: number;
    energy: number;
    nature: number;
    community: number;
    resilience: number;
  };
  resources: ResourceState;
  milestones: string[];
  actionLog: TurnAction[];
};
```

### 6.3 Turn execution

```text
Provisional placements
        ↓
Validate prerequisites and available budget
        ↓
Commit accepted placements
        ↓
Rebuild utility and transport networks
        ↓
Calculate production, demand, coverage, and maintenance
        ↓
Apply environmental and community effects
        ↓
Process scheduled event
        ↓
Update population, indicators, stage, and milestones
        ↓
Return CityState + structured CauseEffect[]
```

### 6.4 Determinism

Given the same:

- Campaign version
- Initial seed
- Ordered action log

the engine must always produce the same final state and state hash. Random events use the fixed scenario seed rather than uncontrolled randomness.

## 7. City Agentic ID

### 7.1 Concept

Every team builds its own living city. The city—not the child and not a generic assistant—is represented by an Agentic ID.

The Agentic ID gives the city:

- Persistent identity
- Declared capabilities
- Encrypted evolving intelligence
- Verifiable ownership and authorised usage
- A history of resilience milestones
- Optional interoperability through ERC-8004 later

### 7.2 Public identity metadata

- City ID and Agentic ID token ID
- City name and emblem reference
- Campaign and ruleset version
- Current development stage
- Declared agent capabilities
- Current encrypted-intelligence commitment
- Anonymous resilience traits

### 7.3 Encrypted intelligence metadata

Stored as ciphertext on 0G Storage:

```ts
type CityIntelligence = {
  schemaVersion: 1;
  cityId: string;
  personality: CityPersonality;
  speakingPolicy: SpeakingPolicy;
  curriculumFactsVersion: string;
  currentMission: MissionContext;
  memories: CityMemory[];
  checkpointRoot: string;
  safetyPolicyVersion: string;
  updatedAt: string;
};
```

City memories describe verified city events, never the child's personal identity:

```text
Allowed: "A battery stabilised the clinic on turn four."
Allowed: "Wetlands reduced downstream flood damage."
Forbidden: child name, age, school, location, chat transcript, or inferred profile.
```

### 7.4 Capabilities

The city agent may:

- Read structured city state
- Explain verified consequences
- Ask reflective questions
- Offer graduated hints
- Select from approved missions
- Refer to verified city memories
- Update encrypted memory after milestones
- Record anonymous resilience traits

The city agent may not:

- Directly change city state or scores
- Invent buildings, prices, or rules
- Spend or transfer tokens
- Transfer its own Agentic ID
- Store unrestricted child conversation
- Contact other players
- Publish detailed play histories

### 7.5 Lifecycle

```text
Create city
    ↓
Mint Agentic ID through sponsor wallet
    ↓
Encrypt starting intelligence
    ↓
Upload ciphertext to 0G Storage
    ↓
Set Agentic ID intelligence URI and commitment
    ↓
Play locally
    ↓
At verified milestone: create new city memory
    ↓
Encrypt and upload new intelligence version
    ↓
Update Agentic ID commitment
```

Only milestone transitions update the Agentic ID. Ordinary drag-and-drop actions do not create transactions.

## 8. 0G Compute

0G Compute provides the intelligence used to express the city's voice. The application uses the 0G Compute Router from the server so API keys and billing remain invisible to the child.

### 8.1 Supported tasks

1. Explain a deterministic outcome in age-appropriate language.
2. Ask one reflective question.
3. Produce a three-level hint ladder.
4. Generate a short in-character city reaction.
5. Summarise a verified chapter milestone into a structured city memory.

### 8.2 Input contract

The application sends structured facts rather than unrestricted conversation history:

```ts
type CityGuideRequest = {
  ageBand: "8-10" | "11-13";
  task: "explain" | "hint" | "react" | "memory";
  cityPersonality: SafePersonalityView;
  mission: SafeMissionView;
  before: IndicatorSnapshot;
  action: SafeActionSummary;
  after: IndicatorSnapshot;
  causes: CauseEffect[];
  allowedFacts: string[];
  relevantMemories: CityMemory[];
};
```

### 8.3 Output contract

```ts
type CityGuideResponse = {
  headline: string;
  message: string;
  reflectiveQuestion?: string;
  hints?: [string, string, string];
  vocabulary?: { term: string; meaning: string }[];
  memoryCandidate?: CityMemory;
};
```

All responses are schema-validated, length-limited, and checked before display.

### 8.4 Privacy mode and fallback

- Use the Router's private trust mode where available.
- Never send child personal data.
- Never expose the Compute API key in the browser.
- If private inference is unavailable, display a prewritten explanation from the campaign pack.
- Never silently downgrade privacy to obtain an answer.
- Do not block simulation or saving on an inference failure.

## 9. 0G Storage

### 9.1 Public campaign packs

Each campaign is a versioned content bundle:

```text
campaigns/rivergate-v1/
  manifest.json
  map.json
  chapters.json
  missions.json
  buildings.json
  ruleset.json
  learning-objectives.json
  guide-facts.json
  locales/en.json
  assets/...
```

The published 0G Storage root and ruleset hash are registered on 0G Chain. Downloads use proof verification and are cached locally for offline play.

### 9.2 Encrypted city checkpoints

At the end of a chapter or milestone:

1. Serialize the verified `CityState` and action log.
2. Encrypt the checkpoint in the browser using AES-GCM.
3. Upload only ciphertext to 0G Storage.
4. Store the returned root in the adult-controlled session and the encrypted Agentic ID metadata.

Local saves occur immediately. Cloud backup runs asynchronously.

## 10. 0G Chain contracts

### 10.1 `TerraCampaignRegistry`

Registers official campaign content:

```solidity
function registerCampaign(
    bytes32 campaignId,
    uint32 version,
    bytes32 storageRoot,
    bytes32 rulesetHash
) external onlyPublisher;
```

### 10.2 `TerraCityAgent`

An ERC-7857-style Agentic ID contract for city identity and encrypted intelligence.

Required operations:

- Mint a city Agentic ID
- Read owner and authorised executor
- Read encrypted metadata URI and commitment
- Authorise restricted application usage
- Update encrypted intelligence after a verified milestone
- Record anonymous resilience milestones
- Pause transfers for the MVP

### 10.3 Completion commitment

```solidity
function recordMilestone(
    uint256 cityTokenId,
    bytes32 milestoneId,
    bytes32 runCommitment,
    bytes32 intelligenceHash
) external onlyAuthorizedExecutor;
```

`runCommitment` is a salted hash of:

- Final state hash
- Action-log hash
- Campaign root
- City Agentic ID
- Random nonce

It never includes child identity or the raw action history.

### 10.4 Sponsorship

A restricted server wallet sponsors contract and storage transactions. It must have:

- Environment-managed keys
- Per-operation allowlists
- Daily spending limits
- Rate limits per city session
- Monitoring and emergency pause capability

## 11. Application server

The MVP can use Next.js Route Handlers or an equivalent small TypeScript service.

### API surface

```text
POST /api/cities
  Create a city session and sponsor Agentic ID minting

GET /api/cities/:cityId
  Resolve public identity and latest permitted checkpoint

GET /api/campaigns/:campaignId
  Resolve official root and return a verified campaign manifest

POST /api/guide
  Run an authorised, constrained 0G Compute task

POST /api/checkpoints
  Upload ciphertext and attach its root to the adult-controlled session

POST /api/runs/:cityId/verify
  Replay the action log and return a verified final state

POST /api/runs/:cityId/milestone
  Verify, update encrypted city intelligence, and record a milestone
```

### Server boundaries

- Treat all browser input as untrusted.
- Validate campaign, building, and action IDs against the registered ruleset.
- Re-run milestone simulations on the server.
- Keep sponsor-wallet and Compute credentials server-only.
- Never accept arbitrary prompts for Agentic ID memory updates.
- Store application session records separately from public chain data.

## 12. Local persistence and synchronisation

### IndexedDB stores

```text
profiles          Child-facing local avatar and preferences
cities            Current local CityState
campaign-cache    Verified campaign packs
action-logs       Ordered deterministic actions
sync-queue        Pending checkpoints and milestones
settings          Accessibility and device preferences
```

### Sync strategy

- Save locally after every committed turn.
- Upload checkpoints only at chapter boundaries.
- Update Agentic ID only for verified milestones.
- Use idempotency keys for retryable server requests.
- Resume pending sync when connectivity returns.
- Show “Saved on this device” and “Backed up” as separate adult-facing states.

## 13. Safety and privacy

### Never collect or publish

- Child legal name
- Birth date
- Precise age
- School or classroom name in public metadata
- Location
- Free-text conversation history
- Behavioural or psychological profile
- Public child username

### Child AI interaction

The MVP uses bounded actions rather than unrestricted chat:

- Explain what happened
- Give me a small hint
- What needs help?
- What did we learn?
- Read this aloud

The onboarding explains:

> Rivergate is a computer character. It remembers what happens in your city, but you should never share private information with it.

### Adult consent

- Local guest play works without account creation.
- Cloud backup and persistent Agentic ID memory require the adult-controlled flow.
- Adults can delete the application session and request removal of encrypted off-chain data where supported.
- On-chain commitments contain no personal information and cannot reveal checkpoint contents.

## 14. Failure behaviour

| Failure | Child experience | Recovery |
|---|---|---|
| 0G Compute unavailable | Prewritten city explanation | Retry future guide requests |
| 0G Storage upload fails | “Saved on this device” | Background sync queue |
| Chain update delayed | Milestone celebration continues | Idempotent retry |
| Campaign proof invalid | Campaign does not load | Use last verified cached version |
| Server unavailable | Local gameplay continues | Reconnect and synchronise |
| Invalid AI response | Safe prewritten response | Log validation failure without child data |

## 15. Proof mode

The normal child interface hides technical infrastructure. An adult/judge-only proof drawer exposes:

- City Agentic ID and current intelligence commitment
- Declared and authorised capabilities
- Campaign version and 0G Storage root
- Ruleset hash
- 0G Compute trust tier and verification status
- Latest anonymous milestone transaction
- Server replay status and final state hash

This allows judges to verify deep 0G integration without compromising the child experience.

## 16. Recommended repository structure

```text
terra-world/
  architecture.md
  apps/
    web/
      app/                         Next.js pages and API routes
      components/                  Shared interface components
      game/                        Phaser scenes and map rendering
      features/city-builder/       Drag, placement, overlays, catalogue
      features/city-guide/         City dialogue and hint interface
      features/adult-controls/     Consent, reports, and proof mode
      lib/offline/                 IndexedDB and synchronisation
  packages/
    simulation/
      src/state.ts                 CityState schemas
      src/engine.ts                Deterministic turn execution
      src/placement.ts             Tile and building validation
      src/networks.ts              Utilities and transport graphs
      src/events.ts                Seeded events and final storm
      src/replay.ts                Server verification
      test/                        Golden scenario tests
    campaign-schema/
      src/                         Campaign validation and types
    zero-g/
      src/agentic-id.ts            City identity and memory updates
      src/compute.ts               0G Compute Router adapter
      src/storage.ts               Upload, download, and proof checks
      src/chain.ts                 Campaign and milestone operations
    safety/
      src/guide-input.ts           Input minimisation
      src/guide-output.ts          Output validation
      src/memory.ts                Structured memory policy
  contracts/
    src/TerraCampaignRegistry.sol
    src/TerraCityAgent.sol
    test/
  campaigns/
    rivergate-v1/
  scripts/
    publish-campaign.ts
  docs/
    product.md
    demo-script.md
```

## 17. MVP scope

- One river-valley map
- One city Agentic ID per persistent team city
- Twelve draggable building types
- Five guided chapters
- Ten turns
- Five primary indicators
- One final storm
- Three possible endings
- Mouse and touch controls
- Local guest mode
- Optional adult-controlled cloud persistence
- Constrained city explanations through 0G Compute
- Verified campaign pack on 0G Storage
- Campaign registry and city milestones on 0G Chain
- Judge proof mode

### Explicitly out of scope

- Networked multiplayer
- Open-ended child chat
- Child wallets
- Tradable achievements
- Public leaderboards
- User-generated campaign publishing
- 0G DA infrastructure
- City-to-city autonomous communication
- Full economic simulation
- More than one production map

## 18. Build sequence

The complete trackable checklist, acceptance criteria, and phase gates are maintained in [`build-phases.md`](./build-phases.md).

### Phase 1 — Deterministic city foundation

Build the repository, schemas, seeded map, twelve-building catalogue, placement rules, utility networks, turn simulation, local persistence, replay, and deterministic hashing.

**Gate:** A scripted multi-turn city can save, reload, and replay to the same final-state hash without AI or 0G services.

### Phase 2 — Complete offline game and campaign

Build the functional map shell, drag-and-drop construction, planning overlays, all five guided chapters, final storm, cause/effect feedback, three endings, and complete offline playthrough.

**Gate:** A new player can build from empty land and reach all three deterministic endings in complete 20–30 minute offline runs.

### Phase 3 — 0G intelligence, storage, and safety

Publish and verify Rivergate content on 0G Storage, encrypt and restore city checkpoints, connect 0G Compute, implement the Rivergate voice, validate all AI output, enforce data minimisation, and provide local fallbacks.

**Gate:** Storage and Compute flows work and fail safely; no child PII leaves the device/application boundary; the game remains playable with 0G disabled.

### Phase 4 — Agentic ID, chain, deployment, and full integration

Deploy the campaign and city-agent contracts, sponsor wallet-free city creation, authorise agent execution, evolve encrypted city memory, replay runs, record anonymous milestones, expose proof evidence, and deploy the functional MVP.

**Gate:** A clean device can complete the full deployed experience from city creation through final-storm milestone with live verifiable 0G evidence.

### Phase 5 — Child-facing UI, accessibility, and demo polish

Replace the developer shell with the finished visual system, Rivergate assets, onboarding, responsive city-builder interface, polished placement feedback, dialogue, learning moments, adult controls, proof mode, system states, accessibility, performance, and demo materials.

**Gate:** First-time children can play without assistance or Web3 knowledge, accessibility checks pass, and three consecutive demo rehearsals succeed.

## 19. Hackathon demonstration path

1. Create Rivergate from an empty map; its Agentic ID is minted invisibly.
2. Drag homes and a water pump onto the map.
3. Place the pump downstream from pollution and run the city.
4. Rivergate explains why its water quality is falling through 0G Compute.
5. Move the pump, add treatment, solar power, and a battery.
6. Complete a chapter and show Rivergate remembering the verified improvement.
7. Trigger the final storm and demonstrate how wetlands and batteries protect the city.
8. Open proof mode and show the Agentic ID, encrypted Storage commitment, campaign root, Compute protection, and milestone transaction.

## 20. Official 0G references

- [0G Agentic ID overview](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/overview)
- [0G Agentic ID integration guide](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/integration)
- [ERC-7857 on 0G](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857)
- [0G Compute Router](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview)
- [0G Compute privacy and zero data retention](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy)
- [0G Storage TypeScript SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Deploy contracts on 0G Chain](https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts)
- [0G Galileo testnet](https://docs.0g.ai/developer-hub/testnet/testnet-overview)
