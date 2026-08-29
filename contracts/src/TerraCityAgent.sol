// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @title TerraCityAgent
/// @notice Privacy-minimised Agentic IDs for adult-controlled Terra World cities.
/// @dev A sponsor mints the identity, so a child never needs a wallet. The
///      contract stores encrypted-intelligence locators and commitments only;
///      it never accepts names, chat text, raw actions, or other child data.
contract TerraCityAgent {
    uint256 public constant CAPABILITY_GUIDE = 1 << 0;
    uint256 public constant CAPABILITY_INTELLIGENCE_UPDATE = 1 << 1;
    uint256 public constant CAPABILITY_MILESTONE_COMMIT = 1 << 2;
    uint256 public constant SUPPORTED_CAPABILITIES =
        CAPABILITY_GUIDE | CAPABILITY_INTELLIGENCE_UPDATE | CAPABILITY_MILESTONE_COMMIT;

    uint256 private constant MAX_INTELLIGENCE_URI_BYTES = 2_048;

    struct CityAgent {
        address adultOwner;
        address executor;
        string encryptedIntelligenceURI;
        bytes32 intelligenceHash;
        bytes32 campaignId;
        uint32 campaignVersion;
        uint64 mintedAt;
        uint64 executorEpoch;
        uint256 capabilities;
    }

    struct PendingIntelligence {
        string encryptedIntelligenceURI;
        bytes32 intelligenceHash;
        address preparedBy;
        uint64 executorEpoch;
    }

    struct MilestoneCommitment {
        bytes32 runCommitment;
        bytes32 intelligenceHash;
        bytes32 campaignId;
        uint32 campaignVersion;
        uint64 recordedAt;
    }

    struct VerificationAuthorization {
        address verifier;
        uint64 verifierEpoch;
    }

    error CityNotFound(uint256 cityTokenId);
    error DuplicateMilestone(uint256 cityTokenId, bytes32 milestoneId);
    error IntelligenceHashMismatch(bytes32 expected, bytes32 received);
    error InvalidAdultOwner();
    error InvalidAdmin();
    error InvalidCampaignId();
    error InvalidCampaignVersion();
    error InvalidCapabilities(uint256 capabilities);
    error InvalidExecutor();
    error InvalidIntelligenceHash();
    error InvalidIntelligenceURI();
    error InvalidMilestoneId();
    error InvalidMinter();
    error InvalidRunCommitment();
    error InvalidVerifier();
    error MissingCapability(uint256 requiredCapability);
    error NoPendingIntelligence(uint256 cityTokenId);
    error RunCommitmentAlreadyUsed(bytes32 runCommitment);
    error StalePendingIntelligence(uint256 cityTokenId);
    error TransfersArePaused();
    error UnauthorizedAdmin(address caller);
    error UnauthorizedCityOwner(address caller, uint256 cityTokenId);
    error UnauthorizedExecutor(address caller, uint256 cityTokenId);
    error UnauthorizedMinter(address caller);
    error UnauthorizedVerifier(address caller);
    error UnverifiedMilestone(bytes32 verificationId);

    /// @dev URI strings are deliberately omitted from every event. They are
    ///      readable through token state but never copied into long-lived logs.
    event CityMinted(
        uint256 indexed cityTokenId,
        address indexed adultOwner,
        bytes32 indexed campaignId,
        uint32 campaignVersion,
        bytes32 intelligenceHash
    );
    event CityExecutorUpdated(uint256 indexed cityTokenId, address indexed executor, uint256 capabilities);
    event IntelligenceUpdatePrepared(uint256 indexed cityTokenId, bytes32 indexed intelligenceHash);
    event IntelligenceUpdateCancelled(uint256 indexed cityTokenId, bytes32 indexed intelligenceHash);
    event IntelligenceUpdated(
        uint256 indexed cityTokenId, bytes32 indexed intelligenceHash, bytes32 indexed milestoneId
    );
    event MilestoneVerificationAuthorized(
        bytes32 indexed verificationId, uint256 indexed cityTokenId, bytes32 indexed milestoneId, address verifier
    );
    event MilestoneRecorded(
        uint256 indexed cityTokenId,
        bytes32 indexed milestoneId,
        bytes32 indexed runCommitment,
        bytes32 intelligenceHash,
        bytes32 campaignId,
        uint32 campaignVersion,
        uint64 recordedAt
    );
    event Transfer(address indexed from, address indexed to, uint256 indexed cityTokenId);
    event TransfersPausedUpdated(bool paused);
    event MinterAuthorizationUpdated(address indexed minter, bool authorized);
    event ExecutorAuthorizationUpdated(address indexed executor, bool authorized, uint64 epoch);
    event VerifierAuthorizationUpdated(address indexed verifier, bool authorized, uint64 epoch);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    address public admin;
    address public pendingAdmin;
    bool public transfersPaused = true;
    uint256 public nextCityTokenId = 1;

    mapping(address minter => bool authorized) public isMinter;
    mapping(address executor => bool authorized) public isExecutor;
    mapping(address executor => uint64 epoch) public executorEpoch;
    mapping(address verifier => bool authorized) public isVerifier;
    mapping(address verifier => uint64 epoch) public verifierEpoch;

    mapping(uint256 cityTokenId => CityAgent city) private cities;
    mapping(uint256 cityTokenId => PendingIntelligence pending) private pendingIntelligence;
    mapping(uint256 cityTokenId => mapping(bytes32 milestoneId => MilestoneCommitment commitment)) private milestones;
    mapping(uint256 cityTokenId => mapping(bytes32 milestoneId => bool recorded)) public milestoneRecorded;
    mapping(uint256 cityTokenId => uint256 count) public milestoneCount;
    mapping(bytes32 runCommitment => bool used) public usedRunCommitment;
    mapping(bytes32 verificationId => VerificationAuthorization authorization) private verificationAuthorizations;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert InvalidAdmin();
        admin = initialAdmin;
        isMinter[initialAdmin] = true;
        isExecutor[initialAdmin] = true;
        isVerifier[initialAdmin] = true;

        emit AdminTransferred(address(0), initialAdmin);
        emit MinterAuthorizationUpdated(initialAdmin, true);
        emit ExecutorAuthorizationUpdated(initialAdmin, true, 0);
        emit VerifierAuthorizationUpdated(initialAdmin, true, 0);
        emit TransfersPausedUpdated(true);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin(msg.sender);
        _;
    }

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert UnauthorizedMinter(msg.sender);
        _;
    }

    modifier onlyVerifier() {
        if (!isVerifier[msg.sender]) revert UnauthorizedVerifier(msg.sender);
        _;
    }

    modifier onlyCityOwner(uint256 cityTokenId) {
        CityAgent storage city = _requireCity(cityTokenId);
        if (msg.sender != city.adultOwner) {
            revert UnauthorizedCityOwner(msg.sender, cityTokenId);
        }
        _;
    }

    modifier onlyCityExecutor(uint256 cityTokenId, uint256 requiredCapability) {
        CityAgent storage city = _requireCity(cityTokenId);
        if (msg.sender != city.executor || !isExecutor[msg.sender] || city.executorEpoch != executorEpoch[msg.sender]) {
            revert UnauthorizedExecutor(msg.sender, cityTokenId);
        }
        if ((city.capabilities & requiredCapability) != requiredCapability) {
            revert MissingCapability(requiredCapability);
        }
        _;
    }

    /// @notice Grants or revokes sponsor-controlled minting authority.
    function setMinter(address minter, bool authorized) external onlyAdmin {
        if (minter == address(0)) revert InvalidMinter();
        if (isMinter[minter] == authorized) return;
        isMinter[minter] = authorized;
        emit MinterAuthorizationUpdated(minter, authorized);
    }

    /// @notice Allow-lists an application executor or revokes it globally.
    /// @dev A revocation increments an epoch. Re-authorising the same address
    ///      cannot silently reactivate old per-city grants.
    function setExecutor(address executor, bool authorized) external onlyAdmin {
        if (executor == address(0)) revert InvalidExecutor();
        if (isExecutor[executor] == authorized) return;
        isExecutor[executor] = authorized;
        if (!authorized) executorEpoch[executor] += 1;
        emit ExecutorAuthorizationUpdated(executor, authorized, executorEpoch[executor]);
    }

    /// @notice Allow-lists a deterministic-run verifier or revokes it globally.
    /// @dev Verifier epochs invalidate proof authorisations made before a
    ///      revocation, including after that address is later re-authorised.
    function setVerifier(address verifier, bool authorized) external onlyAdmin {
        if (verifier == address(0)) revert InvalidVerifier();
        if (isVerifier[verifier] == authorized) return;
        isVerifier[verifier] = authorized;
        if (!authorized) verifierEpoch[verifier] += 1;
        emit VerifierAuthorizationUpdated(verifier, authorized, verifierEpoch[verifier]);
    }

    function setTransfersPaused(bool paused) external onlyAdmin {
        if (transfersPaused == paused) return;
        transfersPaused = paused;
        emit TransfersPausedUpdated(paused);
    }

    /// @notice Begins a two-step transfer of contract administration.
    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAdmin();
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert UnauthorizedAdmin(msg.sender);
        address previousAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(previousAdmin, msg.sender);
    }

    /// @notice Mints a city identity directly to an adult-controlled authority.
    /// @dev The sponsor calls this server-side; no child/browser signature is
    ///      required. An executor may be omitted until the adult authorises one.
    function mintCity(
        address adultOwner,
        address executor,
        string calldata encryptedIntelligenceURI,
        bytes32 intelligenceHash,
        bytes32 campaignId,
        uint32 campaignVersion,
        uint256 capabilities
    ) external onlyMinter returns (uint256 cityTokenId) {
        if (adultOwner == address(0)) revert InvalidAdultOwner();
        _validateIntelligence(encryptedIntelligenceURI, intelligenceHash);
        if (campaignId == bytes32(0)) revert InvalidCampaignId();
        if (campaignVersion == 0) revert InvalidCampaignVersion();
        _validateExecutorGrant(executor, capabilities);

        cityTokenId = nextCityTokenId++;
        cities[cityTokenId] = CityAgent({
            adultOwner: adultOwner,
            executor: executor,
            encryptedIntelligenceURI: encryptedIntelligenceURI,
            intelligenceHash: intelligenceHash,
            campaignId: campaignId,
            campaignVersion: campaignVersion,
            mintedAt: uint64(block.timestamp),
            executorEpoch: executor == address(0) ? 0 : executorEpoch[executor],
            capabilities: capabilities
        });

        emit Transfer(address(0), adultOwner, cityTokenId);
        emit CityMinted(cityTokenId, adultOwner, campaignId, campaignVersion, intelligenceHash);
        if (executor != address(0)) emit CityExecutorUpdated(cityTokenId, executor, capabilities);
    }

    /// @notice Lets the adult authority grant only supported abilities to an
    ///         executor that the sponsor has independently allow-listed.
    function setCityExecutor(uint256 cityTokenId, address executor, uint256 capabilities)
        external
        onlyCityOwner(cityTokenId)
    {
        _validateExecutorGrant(executor, capabilities);
        CityAgent storage city = cities[cityTokenId];
        delete pendingIntelligence[cityTokenId];
        city.executor = executor;
        city.executorEpoch = executor == address(0) ? 0 : executorEpoch[executor];
        city.capabilities = capabilities;
        emit CityExecutorUpdated(cityTokenId, executor, capabilities);
    }

    /// @notice Emergency revocation available to either the adult or sponsor.
    function revokeCityExecutor(uint256 cityTokenId) external {
        CityAgent storage city = _requireCity(cityTokenId);
        if (msg.sender != city.adultOwner && msg.sender != admin) {
            revert UnauthorizedCityOwner(msg.sender, cityTokenId);
        }
        city.executor = address(0);
        city.executorEpoch = 0;
        city.capabilities = 0;
        delete pendingIntelligence[cityTokenId];
        emit CityExecutorUpdated(cityTokenId, address(0), 0);
    }

    /// @notice Stages encrypted intelligence. It is not made current until a
    ///         trusted verifier authorises, and the executor records, a milestone.
    function prepareIntelligenceUpdate(
        uint256 cityTokenId,
        string calldata encryptedIntelligenceURI,
        bytes32 intelligenceHash
    ) external onlyCityExecutor(cityTokenId, CAPABILITY_INTELLIGENCE_UPDATE) {
        _validateIntelligence(encryptedIntelligenceURI, intelligenceHash);
        pendingIntelligence[cityTokenId] = PendingIntelligence({
            encryptedIntelligenceURI: encryptedIntelligenceURI,
            intelligenceHash: intelligenceHash,
            preparedBy: msg.sender,
            executorEpoch: executorEpoch[msg.sender]
        });
        emit IntelligenceUpdatePrepared(cityTokenId, intelligenceHash);
    }

    function cancelPendingIntelligence(uint256 cityTokenId) external {
        CityAgent storage city = _requireCity(cityTokenId);
        if (msg.sender != city.adultOwner && msg.sender != admin) {
            revert UnauthorizedCityOwner(msg.sender, cityTokenId);
        }
        bytes32 intelligenceHash = pendingIntelligence[cityTokenId].intelligenceHash;
        if (intelligenceHash == bytes32(0)) revert NoPendingIntelligence(cityTokenId);
        delete pendingIntelligence[cityTokenId];
        emit IntelligenceUpdateCancelled(cityTokenId, intelligenceHash);
    }

    /// @notice Authorises an already replayed deterministic milestone result.
    /// @dev The trusted verifier submits commitments only, never the raw action
    ///      history, child's identity, or free-form content.
    function authorizeMilestoneVerification(
        uint256 cityTokenId,
        bytes32 milestoneId,
        bytes32 runCommitment,
        bytes32 intelligenceHash
    ) external onlyVerifier returns (bytes32 verificationId) {
        CityAgent storage city = _requireCity(cityTokenId);
        _validateMilestoneInputs(milestoneId, runCommitment, intelligenceHash);
        if (milestoneRecorded[cityTokenId][milestoneId]) {
            revert DuplicateMilestone(cityTokenId, milestoneId);
        }
        if (usedRunCommitment[runCommitment]) {
            revert RunCommitmentAlreadyUsed(runCommitment);
        }
        bytes32 pendingHash = pendingIntelligence[cityTokenId].intelligenceHash;
        if (pendingHash == bytes32(0)) revert NoPendingIntelligence(cityTokenId);
        if (pendingHash != intelligenceHash) {
            revert IntelligenceHashMismatch(pendingHash, intelligenceHash);
        }

        verificationId = _verificationId(
            cityTokenId, city.campaignId, city.campaignVersion, milestoneId, runCommitment, intelligenceHash
        );
        verificationAuthorizations[verificationId] =
            VerificationAuthorization({verifier: msg.sender, verifierEpoch: verifierEpoch[msg.sender]});
        emit MilestoneVerificationAuthorized(verificationId, cityTokenId, milestoneId, msg.sender);
    }

    /// @notice Records one verified, anonymous city milestone and atomically
    ///         advances its encrypted intelligence commitment.
    function recordMilestone(uint256 cityTokenId, bytes32 milestoneId, bytes32 runCommitment, bytes32 intelligenceHash)
        external
        onlyCityExecutor(cityTokenId, CAPABILITY_MILESTONE_COMMIT)
    {
        CityAgent storage city = cities[cityTokenId];
        _validateMilestoneInputs(milestoneId, runCommitment, intelligenceHash);
        if (milestoneRecorded[cityTokenId][milestoneId]) {
            revert DuplicateMilestone(cityTokenId, milestoneId);
        }
        if (usedRunCommitment[runCommitment]) {
            revert RunCommitmentAlreadyUsed(runCommitment);
        }

        PendingIntelligence storage pending = pendingIntelligence[cityTokenId];
        if (pending.intelligenceHash == bytes32(0)) revert NoPendingIntelligence(cityTokenId);
        if (pending.intelligenceHash != intelligenceHash) {
            revert IntelligenceHashMismatch(pending.intelligenceHash, intelligenceHash);
        }
        if (pending.preparedBy != msg.sender || pending.executorEpoch != executorEpoch[msg.sender]) {
            revert StalePendingIntelligence(cityTokenId);
        }

        bytes32 verificationId = _verificationId(
            cityTokenId, city.campaignId, city.campaignVersion, milestoneId, runCommitment, intelligenceHash
        );
        VerificationAuthorization memory authorization = verificationAuthorizations[verificationId];
        if (
            authorization.verifier == address(0) || !isVerifier[authorization.verifier]
                || authorization.verifierEpoch != verifierEpoch[authorization.verifier]
        ) {
            revert UnverifiedMilestone(verificationId);
        }

        uint64 recordedAt = uint64(block.timestamp);
        city.encryptedIntelligenceURI = pending.encryptedIntelligenceURI;
        city.intelligenceHash = intelligenceHash;
        milestones[cityTokenId][milestoneId] = MilestoneCommitment({
            runCommitment: runCommitment,
            intelligenceHash: intelligenceHash,
            campaignId: city.campaignId,
            campaignVersion: city.campaignVersion,
            recordedAt: recordedAt
        });
        milestoneRecorded[cityTokenId][milestoneId] = true;
        milestoneCount[cityTokenId] += 1;
        usedRunCommitment[runCommitment] = true;
        delete pendingIntelligence[cityTokenId];
        delete verificationAuthorizations[verificationId];

        emit IntelligenceUpdated(cityTokenId, intelligenceHash, milestoneId);
        emit MilestoneRecorded(
            cityTokenId, milestoneId, runCommitment, intelligenceHash, city.campaignId, city.campaignVersion, recordedAt
        );
    }

    /// @notice Optional adult-to-adult transfer path. It starts paused and can
    ///         only be enabled by the sponsor; no approval/operator surface is
    ///         exposed to a child-facing client.
    function transferFrom(address from, address to, uint256 cityTokenId) external onlyCityOwner(cityTokenId) {
        if (transfersPaused) revert TransfersArePaused();
        if (from != msg.sender) revert UnauthorizedCityOwner(msg.sender, cityTokenId);
        if (to == address(0)) revert InvalidAdultOwner();
        CityAgent storage city = cities[cityTokenId];
        city.adultOwner = to;
        city.executor = address(0);
        city.executorEpoch = 0;
        city.capabilities = 0;
        delete pendingIntelligence[cityTokenId];
        emit CityExecutorUpdated(cityTokenId, address(0), 0);
        emit Transfer(from, to, cityTokenId);
    }

    function ownerOf(uint256 cityTokenId) external view returns (address) {
        return _requireCity(cityTokenId).adultOwner;
    }

    function getCity(uint256 cityTokenId) external view returns (CityAgent memory) {
        return _requireCity(cityTokenId);
    }

    function getPendingIntelligence(uint256 cityTokenId) external view returns (PendingIntelligence memory) {
        _requireCity(cityTokenId);
        return pendingIntelligence[cityTokenId];
    }

    function getMilestone(uint256 cityTokenId, bytes32 milestoneId)
        external
        view
        returns (MilestoneCommitment memory)
    {
        _requireCity(cityTokenId);
        if (!milestoneRecorded[cityTokenId][milestoneId]) {
            revert UnverifiedMilestone(bytes32(0));
        }
        return milestones[cityTokenId][milestoneId];
    }

    function isAuthorizedCityExecutor(uint256 cityTokenId, address executor) external view returns (bool) {
        CityAgent storage city = _requireCity(cityTokenId);
        return city.executor == executor && isExecutor[executor] && city.executorEpoch == executorEpoch[executor];
    }

    function verificationIdFor(
        uint256 cityTokenId,
        bytes32 milestoneId,
        bytes32 runCommitment,
        bytes32 intelligenceHash
    ) external view returns (bytes32) {
        CityAgent storage city = _requireCity(cityTokenId);
        return _verificationId(
            cityTokenId, city.campaignId, city.campaignVersion, milestoneId, runCommitment, intelligenceHash
        );
    }

    /// @notice Domain-separated helper for the salted completion commitment.
    /// @dev `salt` must be a fresh random nonce held outside public child data.
    function deriveRunCommitment(
        bytes32 finalStateHash,
        bytes32 actionLogHash,
        bytes32 campaignRoot,
        uint256 cityTokenId,
        bytes32 salt
    ) external view returns (bytes32) {
        _requireCity(cityTokenId);
        if (
            finalStateHash == bytes32(0) || actionLogHash == bytes32(0) || campaignRoot == bytes32(0)
                || salt == bytes32(0)
        ) {
            revert InvalidRunCommitment();
        }
        return keccak256(
            abi.encode(
                "TERRA_WORLD_RUN_COMMITMENT_V1",
                block.chainid,
                address(this),
                cityTokenId,
                finalStateHash,
                actionLogHash,
                campaignRoot,
                salt
            )
        );
    }

    function _requireCity(uint256 cityTokenId) private view returns (CityAgent storage city) {
        city = cities[cityTokenId];
        if (city.adultOwner == address(0)) revert CityNotFound(cityTokenId);
    }

    function _validateExecutorGrant(address executor, uint256 capabilities) private view {
        if ((capabilities & ~SUPPORTED_CAPABILITIES) != 0) {
            revert InvalidCapabilities(capabilities);
        }
        if (executor == address(0)) {
            if (capabilities != 0) revert InvalidCapabilities(capabilities);
            return;
        }
        if (!isExecutor[executor]) revert InvalidExecutor();
    }

    function _validateIntelligence(string calldata encryptedURI, bytes32 intelligenceHash) private pure {
        uint256 uriLength = bytes(encryptedURI).length;
        if (uriLength == 0 || uriLength > MAX_INTELLIGENCE_URI_BYTES) {
            revert InvalidIntelligenceURI();
        }
        if (intelligenceHash == bytes32(0)) revert InvalidIntelligenceHash();
    }

    function _validateMilestoneInputs(bytes32 milestoneId, bytes32 runCommitment, bytes32 intelligenceHash)
        private
        pure
    {
        if (milestoneId == bytes32(0)) revert InvalidMilestoneId();
        if (runCommitment == bytes32(0)) revert InvalidRunCommitment();
        if (intelligenceHash == bytes32(0)) revert InvalidIntelligenceHash();
    }

    function _verificationId(
        uint256 cityTokenId,
        bytes32 campaignId,
        uint32 campaignVersion,
        bytes32 milestoneId,
        bytes32 runCommitment,
        bytes32 intelligenceHash
    ) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                "TERRA_WORLD_MILESTONE_VERIFICATION_V1",
                block.chainid,
                address(this),
                cityTokenId,
                campaignId,
                campaignVersion,
                milestoneId,
                runCommitment,
                intelligenceHash
            )
        );
    }
}
