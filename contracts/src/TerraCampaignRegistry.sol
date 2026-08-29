// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @title TerraCampaignRegistry
/// @notice Auditable registry for immutable Terra World campaign versions.
/// @dev Campaign bytes remain on 0G Storage. This contract stores only public
///      content commitments and publisher authorization state.
contract TerraCampaignRegistry {
    struct CampaignVersion {
        bytes32 storageRoot;
        bytes32 rulesetHash;
        address publisher;
        uint64 registeredAt;
        bool deprecated;
    }

    error CampaignAlreadyRegistered(bytes32 campaignId, uint32 version);
    error CampaignNotRegistered(bytes32 campaignId, uint32 version);
    error InvalidCampaignId();
    error InvalidOwner();
    error InvalidPublisher();
    error InvalidRulesetHash();
    error InvalidStorageRoot();
    error InvalidVersion();
    error UnauthorizedOwner(address caller);
    error UnauthorizedPublisher(address caller);
    error UnauthorizedRecordPublisher(address caller);

    event CampaignDeprecationUpdated(
        bytes32 indexed campaignId, uint32 indexed version, bool deprecated, address indexed actor
    );
    event CampaignRegistered(
        bytes32 indexed campaignId,
        uint32 indexed version,
        bytes32 indexed storageRoot,
        bytes32 rulesetHash,
        address publisher,
        uint64 registeredAt
    );
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PublisherAuthorizationUpdated(address indexed publisher, bool authorized);

    address public owner;
    address public pendingOwner;

    mapping(address publisher => bool authorized) public isPublisher;
    mapping(bytes32 campaignId => mapping(uint32 version => CampaignVersion)) private campaigns;
    mapping(bytes32 campaignId => mapping(uint32 version => bool exists)) private registered;
    mapping(bytes32 campaignId => uint32[]) private versions;
    mapping(bytes32 campaignId => uint32 version) public latestVersion;

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidOwner();
        owner = initialOwner;
        isPublisher[initialOwner] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit PublisherAuthorizationUpdated(initialOwner, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedOwner(msg.sender);
        _;
    }

    modifier onlyPublisher() {
        if (!isPublisher[msg.sender]) revert UnauthorizedPublisher(msg.sender);
        _;
    }

    /// @notice Authorizes or revokes a campaign publisher.
    function setPublisher(address publisher, bool authorized) external onlyOwner {
        if (publisher == address(0)) revert InvalidPublisher();
        if (isPublisher[publisher] == authorized) return;
        isPublisher[publisher] = authorized;
        emit PublisherAuthorizationUpdated(publisher, authorized);
    }

    /// @notice Begins a two-step ownership transfer.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Completes ownership transfer from the nominated account.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert UnauthorizedOwner(msg.sender);
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    /// @notice Registers one immutable campaign version.
    function registerCampaign(bytes32 campaignId, uint32 version, bytes32 storageRoot, bytes32 rulesetHash)
        external
        onlyPublisher
    {
        if (campaignId == bytes32(0)) revert InvalidCampaignId();
        if (version == 0) revert InvalidVersion();
        if (storageRoot == bytes32(0)) revert InvalidStorageRoot();
        if (rulesetHash == bytes32(0)) revert InvalidRulesetHash();
        if (registered[campaignId][version]) {
            revert CampaignAlreadyRegistered(campaignId, version);
        }

        uint64 registeredAt = uint64(block.timestamp);
        campaigns[campaignId][version] = CampaignVersion({
            storageRoot: storageRoot,
            rulesetHash: rulesetHash,
            publisher: msg.sender,
            registeredAt: registeredAt,
            deprecated: false
        });
        registered[campaignId][version] = true;
        versions[campaignId].push(version);
        if (version > latestVersion[campaignId]) latestVersion[campaignId] = version;

        emit CampaignRegistered(campaignId, version, storageRoot, rulesetHash, msg.sender, registeredAt);
    }

    /// @notice Marks a version deprecated without erasing its commitments.
    /// @dev The registry owner can intervene after revoking a compromised publisher.
    function setCampaignDeprecated(bytes32 campaignId, uint32 version, bool deprecated) external {
        CampaignVersion storage campaign = campaigns[campaignId][version];
        if (!registered[campaignId][version]) revert CampaignNotRegistered(campaignId, version);
        if (msg.sender != owner && (msg.sender != campaign.publisher || !isPublisher[msg.sender])) {
            revert UnauthorizedRecordPublisher(msg.sender);
        }
        if (campaign.deprecated == deprecated) return;
        campaign.deprecated = deprecated;
        emit CampaignDeprecationUpdated(campaignId, version, deprecated, msg.sender);
    }

    function getCampaign(bytes32 campaignId, uint32 version) external view returns (CampaignVersion memory) {
        CampaignVersion memory campaign = campaigns[campaignId][version];
        if (!registered[campaignId][version]) revert CampaignNotRegistered(campaignId, version);
        return campaign;
    }

    function campaignExists(bytes32 campaignId, uint32 version) external view returns (bool) {
        return registered[campaignId][version];
    }

    function registeredVersionCount(bytes32 campaignId) external view returns (uint256) {
        return versions[campaignId].length;
    }

    function registeredVersionAt(bytes32 campaignId, uint256 index) external view returns (uint32) {
        return versions[campaignId][index];
    }
}
