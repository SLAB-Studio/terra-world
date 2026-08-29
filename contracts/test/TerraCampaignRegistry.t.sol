// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {TerraCampaignRegistry} from "../src/TerraCampaignRegistry.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function expectRevert(bytes4 selector) external;
    function expectPartialRevert(bytes4 selector) external;
    function prank(address caller) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory logs);
    function warp(uint256 timestamp) external;
}

contract TerraCampaignRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant PUBLISHER = address(0xA11CE);
    address private constant SECOND_PUBLISHER = address(0xB0B);
    address private constant STRANGER = address(0xBAD);

    bytes32 private constant CAMPAIGN_ID = keccak256("rivergate");
    bytes32 private constant STORAGE_ROOT_V1 = keccak256("rivergate-storage-root-v1");
    bytes32 private constant STORAGE_ROOT_V2 = keccak256("rivergate-storage-root-v2");
    bytes32 private constant RULESET_HASH_V1 = keccak256("rivergate-ruleset-v1");
    bytes32 private constant RULESET_HASH_V2 = keccak256("rivergate-ruleset-v2");

    TerraCampaignRegistry private registry;

    function setUp() public {
        registry = new TerraCampaignRegistry(address(this));
        registry.setPublisher(PUBLISHER, true);
    }

    function testAuthorizedPublisherRegistersVersionAndEmitsCommitments() public {
        vm.warp(1_788_000_000);
        vm.recordLogs();
        vm.prank(PUBLISHER);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V1, RULESET_HASH_V1);

        TerraCampaignRegistry.CampaignVersion memory campaign = registry.getCampaign(CAMPAIGN_ID, 1);
        assertEq(campaign.storageRoot, STORAGE_ROOT_V1, "storage root");
        assertEq(campaign.rulesetHash, RULESET_HASH_V1, "ruleset hash");
        assertEq(campaign.publisher, PUBLISHER, "publisher");
        assertEq(uint256(campaign.registeredAt), 1_788_000_000, "registration time");
        assertFalse(campaign.deprecated, "new campaign deprecated");
        assertTrue(registry.campaignExists(CAMPAIGN_ID, 1), "campaign missing");
        assertEq(uint256(registry.latestVersion(CAMPAIGN_ID)), 1, "latest version");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "registration log count");
        assertEq(logs[0].emitter, address(registry), "event emitter");
        assertEq(
            logs[0].topics[0],
            keccak256("CampaignRegistered(bytes32,uint32,bytes32,bytes32,address,uint64)"),
            "event signature"
        );
        assertEq(logs[0].topics[1], CAMPAIGN_ID, "event campaign");
        assertEq(logs[0].topics[2], bytes32(uint256(1)), "event version");
        assertEq(logs[0].topics[3], STORAGE_ROOT_V1, "event storage root");
        (bytes32 eventRuleset, address eventPublisher, uint64 eventTime) =
            abi.decode(logs[0].data, (bytes32, address, uint64));
        assertEq(eventRuleset, RULESET_HASH_V1, "event ruleset");
        assertEq(eventPublisher, PUBLISHER, "event publisher");
        assertEq(uint256(eventTime), 1_788_000_000, "event timestamp");
    }

    function testDuplicateVersionFailsAndKeepsOriginalCommitments() public {
        registerV1(PUBLISHER);

        vm.prank(PUBLISHER);
        vm.expectPartialRevert(TerraCampaignRegistry.CampaignAlreadyRegistered.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V2, RULESET_HASH_V2);

        TerraCampaignRegistry.CampaignVersion memory campaign = registry.getCampaign(CAMPAIGN_ID, 1);
        assertEq(campaign.storageRoot, STORAGE_ROOT_V1, "duplicate replaced root");
        assertEq(campaign.rulesetHash, RULESET_HASH_V1, "duplicate replaced ruleset");
        assertEq(registry.registeredVersionCount(CAMPAIGN_ID), 1, "duplicate added history");
    }

    function testRegistrationDoesNotUseTimestampAsExistenceSentinel() public {
        vm.warp(0);
        registerV1(PUBLISHER);

        assertTrue(registry.campaignExists(CAMPAIGN_ID, 1), "zero-time registration missing");
        assertEq(uint256(registry.getCampaign(CAMPAIGN_ID, 1).registeredAt), 0, "registration timestamp");
        vm.prank(PUBLISHER);
        vm.expectPartialRevert(TerraCampaignRegistry.CampaignAlreadyRegistered.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V2, RULESET_HASH_V2);
    }

    function testUnauthorizedAndRevokedPublishersCannotRegister() public {
        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCampaignRegistry.UnauthorizedPublisher.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V1, RULESET_HASH_V1);

        registry.setPublisher(PUBLISHER, false);
        vm.prank(PUBLISHER);
        vm.expectPartialRevert(TerraCampaignRegistry.UnauthorizedPublisher.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V1, RULESET_HASH_V1);
    }

    function testDeprecationPreservesHistoricalVersionsAndLatestVersion() public {
        registerV1(PUBLISHER);
        registry.setPublisher(SECOND_PUBLISHER, true);
        vm.prank(SECOND_PUBLISHER);
        registry.registerCampaign(CAMPAIGN_ID, 2, STORAGE_ROOT_V2, RULESET_HASH_V2);

        vm.prank(PUBLISHER);
        registry.setCampaignDeprecated(CAMPAIGN_ID, 1, true);

        TerraCampaignRegistry.CampaignVersion memory first = registry.getCampaign(CAMPAIGN_ID, 1);
        TerraCampaignRegistry.CampaignVersion memory second = registry.getCampaign(CAMPAIGN_ID, 2);
        assertTrue(first.deprecated, "first version not deprecated");
        assertEq(first.storageRoot, STORAGE_ROOT_V1, "history root changed");
        assertFalse(second.deprecated, "second version deprecated");
        assertEq(uint256(registry.latestVersion(CAMPAIGN_ID)), 2, "latest version changed");
        assertEq(registry.registeredVersionCount(CAMPAIGN_ID), 2, "history length");
        assertEq(uint256(registry.registeredVersionAt(CAMPAIGN_ID, 0)), 1, "history v1");
        assertEq(uint256(registry.registeredVersionAt(CAMPAIGN_ID, 1)), 2, "history v2");
    }

    function testOnlyRecordPublisherOrOwnerCanDeprecate() public {
        registerV1(PUBLISHER);
        registry.setPublisher(SECOND_PUBLISHER, true);

        vm.prank(SECOND_PUBLISHER);
        vm.expectPartialRevert(TerraCampaignRegistry.UnauthorizedRecordPublisher.selector);
        registry.setCampaignDeprecated(CAMPAIGN_ID, 1, true);

        registry.setPublisher(PUBLISHER, false);
        vm.prank(PUBLISHER);
        vm.expectPartialRevert(TerraCampaignRegistry.UnauthorizedRecordPublisher.selector);
        registry.setCampaignDeprecated(CAMPAIGN_ID, 1, true);

        registry.setCampaignDeprecated(CAMPAIGN_ID, 1, true);
        assertTrue(registry.getCampaign(CAMPAIGN_ID, 1).deprecated, "owner could not intervene");
    }

    function testRejectsEmptyRegistrationFields() public {
        vm.prank(PUBLISHER);
        vm.expectRevert(TerraCampaignRegistry.InvalidCampaignId.selector);
        registry.registerCampaign(bytes32(0), 1, STORAGE_ROOT_V1, RULESET_HASH_V1);

        vm.prank(PUBLISHER);
        vm.expectRevert(TerraCampaignRegistry.InvalidVersion.selector);
        registry.registerCampaign(CAMPAIGN_ID, 0, STORAGE_ROOT_V1, RULESET_HASH_V1);

        vm.prank(PUBLISHER);
        vm.expectRevert(TerraCampaignRegistry.InvalidStorageRoot.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, bytes32(0), RULESET_HASH_V1);

        vm.prank(PUBLISHER);
        vm.expectRevert(TerraCampaignRegistry.InvalidRulesetHash.selector);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V1, bytes32(0));
    }

    function testTwoStepOwnershipPreventsAccidentalTakeover() public {
        registry.transferOwnership(SECOND_PUBLISHER);

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCampaignRegistry.UnauthorizedOwner.selector);
        registry.acceptOwnership();

        vm.prank(SECOND_PUBLISHER);
        registry.acceptOwnership();
        assertEq(registry.owner(), SECOND_PUBLISHER, "ownership not transferred");
        assertEq(registry.pendingOwner(), address(0), "pending owner retained");
    }

    function registerV1(address publisher) private {
        vm.prank(publisher);
        registry.registerCampaign(CAMPAIGN_ID, 1, STORAGE_ROOT_V1, RULESET_HASH_V1);
    }

    function assertTrue(bool value, string memory message) private pure {
        require(value, message);
    }

    function assertFalse(bool value, string memory message) private pure {
        require(!value, message);
    }

    function assertEq(bytes32 actual, bytes32 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function assertEq(address actual, address expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }
}
