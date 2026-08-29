// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {TerraCityAgent} from "../src/TerraCityAgent.sol";

interface CityVm {
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

contract TerraCityAgentTest {
    CityVm private constant vm = CityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SPONSOR = address(0x500050);
    address private constant ADULT = address(0xAD017);
    address private constant SECOND_ADULT = address(0xAD018);
    address private constant EXECUTOR = address(0xE0EC);
    address private constant VERIFIER = address(0xA11D);
    address private constant STRANGER = address(0xBAD);

    bytes32 private constant CAMPAIGN_ID = keccak256("rivergate");
    uint32 private constant CAMPAIGN_VERSION = 1;
    string private constant INITIAL_URI = "0g://encrypted/rivergate/city-1/v1";
    string private constant UPDATED_URI = "0g://encrypted/rivergate/city-1/v2";
    bytes32 private constant INITIAL_HASH = keccak256("encrypted-intelligence-v1");
    bytes32 private constant UPDATED_HASH = keccak256("encrypted-intelligence-v2");
    bytes32 private constant MILESTONE_ID = keccak256("water-ready");
    bytes32 private constant SECOND_MILESTONE_ID = keccak256("power-ready");
    bytes32 private constant RUN_COMMITMENT = keccak256("salted-run-commitment-1");
    bytes32 private constant SECOND_RUN_COMMITMENT = keccak256("salted-run-commitment-2");
    uint256 private constant GUIDE_CAPABILITY = 1;
    uint256 private constant FULL_CAPABILITIES = 7;

    TerraCityAgent private agent;

    function setUp() public {
        vm.prank(SPONSOR);
        agent = new TerraCityAgent(SPONSOR);

        vm.prank(SPONSOR);
        agent.setExecutor(EXECUTOR, true);
        vm.prank(SPONSOR);
        agent.setVerifier(VERIFIER, true);
    }

    function testSponsorMintsAgenticIdDirectlyToAdultWithoutChildWallet() public {
        vm.warp(1_788_000_000);
        uint256 cityTokenId = mintCity();

        TerraCityAgent.CityAgent memory city = agent.getCity(cityTokenId);
        assertEq(cityTokenId, 1, "token id");
        assertEq(agent.ownerOf(cityTokenId), ADULT, "adult owner");
        assertEq(city.adultOwner, ADULT, "city adult owner");
        assertEq(city.executor, EXECUTOR, "executor");
        assertEq(city.encryptedIntelligenceURI, INITIAL_URI, "encrypted URI");
        assertEq(city.intelligenceHash, INITIAL_HASH, "intelligence hash");
        assertEq(city.campaignId, CAMPAIGN_ID, "campaign id");
        assertEq(uint256(city.campaignVersion), CAMPAIGN_VERSION, "campaign version");
        assertEq(uint256(city.mintedAt), 1_788_000_000, "minted time");
        assertEq(city.capabilities, fullCapabilities(), "capabilities");
        assertTrue(agent.transfersPaused(), "transfers should start paused");
    }

    function testUnauthorizedAndRevokedMintersCannotMint() public {
        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedMinter.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities());

        vm.prank(SPONSOR);
        agent.setMinter(SPONSOR, false);
        vm.prank(SPONSOR);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedMinter.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities());
    }

    function testMintRejectsInvalidCampaignIntelligenceAndCapabilities() public {
        vm.prank(SPONSOR);
        vm.expectRevert(TerraCityAgent.InvalidAdultOwner.selector);
        agent.mintCity(
            address(0), EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities()
        );

        vm.prank(SPONSOR);
        vm.expectRevert(TerraCityAgent.InvalidIntelligenceURI.selector);
        agent.mintCity(ADULT, EXECUTOR, "", INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities());

        vm.prank(SPONSOR);
        vm.expectRevert(TerraCityAgent.InvalidIntelligenceHash.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, bytes32(0), CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities());

        vm.prank(SPONSOR);
        vm.expectRevert(TerraCityAgent.InvalidCampaignId.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, bytes32(0), CAMPAIGN_VERSION, fullCapabilities());

        vm.prank(SPONSOR);
        vm.expectRevert(TerraCityAgent.InvalidCampaignVersion.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, 0, fullCapabilities());

        vm.prank(SPONSOR);
        vm.expectPartialRevert(TerraCityAgent.InvalidCapabilities.selector);
        agent.mintCity(ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, 1 << 255);
    }

    function testAdultControlsExecutorGrantAndOnlyAllowlistedExecutorsQualify() public {
        uint256 cityTokenId = mintCityWithoutExecutor();

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedCityOwner.selector);
        agent.setCityExecutor(cityTokenId, EXECUTOR, fullCapabilities());

        vm.prank(ADULT);
        vm.expectRevert(TerraCityAgent.InvalidExecutor.selector);
        agent.setCityExecutor(cityTokenId, STRANGER, fullCapabilities());

        vm.prank(ADULT);
        agent.setCityExecutor(cityTokenId, EXECUTOR, fullCapabilities());
        assertTrue(agent.isAuthorizedCityExecutor(cityTokenId, EXECUTOR), "executor not active");

        vm.prank(ADULT);
        agent.setCityExecutor(cityTokenId, address(0), 0);
        assertFalse(agent.isAuthorizedCityExecutor(cityTokenId, EXECUTOR), "executor not revoked");
    }

    function testGlobalExecutorRevocationCannotReviveOldCityGrant() public {
        uint256 cityTokenId = mintCity();

        vm.prank(SPONSOR);
        agent.setExecutor(EXECUTOR, false);
        assertFalse(agent.isAuthorizedCityExecutor(cityTokenId, EXECUTOR), "revoked executor active");

        vm.prank(SPONSOR);
        agent.setExecutor(EXECUTOR, true);
        assertFalse(agent.isAuthorizedCityExecutor(cityTokenId, EXECUTOR), "old grant revived");

        vm.prank(EXECUTOR);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedExecutor.selector);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(ADULT);
        agent.setCityExecutor(cityTokenId, EXECUTOR, fullCapabilities());
        assertTrue(agent.isAuthorizedCityExecutor(cityTokenId, EXECUTOR), "fresh grant inactive");
    }

    function testVerifiedMilestoneAtomicallyCommitsEncryptedIntelligence() public {
        uint256 cityTokenId = mintCity();
        prepareAndVerify(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.warp(1_788_000_123);
        vm.prank(EXECUTOR);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        TerraCityAgent.CityAgent memory city = agent.getCity(cityTokenId);
        TerraCityAgent.MilestoneCommitment memory milestone = agent.getMilestone(cityTokenId, MILESTONE_ID);
        TerraCityAgent.PendingIntelligence memory pending = agent.getPendingIntelligence(cityTokenId);

        assertEq(city.encryptedIntelligenceURI, UPDATED_URI, "URI not advanced");
        assertEq(city.intelligenceHash, UPDATED_HASH, "hash not advanced");
        assertEq(milestone.runCommitment, RUN_COMMITMENT, "run commitment");
        assertEq(milestone.intelligenceHash, UPDATED_HASH, "milestone intelligence");
        assertEq(milestone.campaignId, CAMPAIGN_ID, "milestone campaign");
        assertEq(uint256(milestone.campaignVersion), CAMPAIGN_VERSION, "milestone version");
        assertEq(uint256(milestone.recordedAt), 1_788_000_123, "milestone timestamp");
        assertEq(agent.milestoneCount(cityTokenId), 1, "milestone count");
        assertTrue(agent.usedRunCommitment(RUN_COMMITMENT), "run commitment unused");
        assertEq(pending.intelligenceHash, bytes32(0), "pending hash retained");
        assertEq(pending.encryptedIntelligenceURI, "", "pending URI retained");
        assertEq(pending.preparedBy, address(0), "pending executor retained");
    }

    function testUnverifiedMilestoneCannotMutateIntelligence() public {
        uint256 cityTokenId = mintCity();
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(EXECUTOR);
        vm.expectPartialRevert(TerraCityAgent.UnverifiedMilestone.selector);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        TerraCityAgent.CityAgent memory city = agent.getCity(cityTokenId);
        assertEq(city.encryptedIntelligenceURI, INITIAL_URI, "unverified URI mutation");
        assertEq(city.intelligenceHash, INITIAL_HASH, "unverified hash mutation");
        assertFalse(agent.milestoneRecorded(cityTokenId, MILESTONE_ID), "unverified milestone recorded");
    }

    function testDuplicateMilestoneAndReusedRunCommitmentFail() public {
        uint256 firstCity = mintCity();
        prepareAndVerify(firstCity, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);
        vm.prank(EXECUTOR);
        agent.recordMilestone(firstCity, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(firstCity, "0g://encrypted/rivergate/city-1/v3", keccak256("v3"));
        vm.prank(VERIFIER);
        vm.expectPartialRevert(TerraCityAgent.DuplicateMilestone.selector);
        agent.authorizeMilestoneVerification(firstCity, MILESTONE_ID, SECOND_RUN_COMMITMENT, keccak256("v3"));

        uint256 secondCity = mintCity();
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(secondCity, UPDATED_URI, UPDATED_HASH);
        vm.prank(VERIFIER);
        vm.expectPartialRevert(TerraCityAgent.RunCommitmentAlreadyUsed.selector);
        agent.authorizeMilestoneVerification(secondCity, SECOND_MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);
    }

    function testVerifierRevocationInvalidatesOutstandingAuthorization() public {
        uint256 cityTokenId = mintCity();
        prepareAndVerify(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.prank(SPONSOR);
        agent.setVerifier(VERIFIER, false);
        vm.prank(SPONSOR);
        agent.setVerifier(VERIFIER, true);

        vm.prank(EXECUTOR);
        vm.expectPartialRevert(TerraCityAgent.UnverifiedMilestone.selector);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.prank(VERIFIER);
        agent.authorizeMilestoneVerification(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);
        vm.prank(EXECUTOR);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);
        assertTrue(agent.milestoneRecorded(cityTokenId, MILESTONE_ID), "fresh proof failed");
    }

    function testUnauthorizedVerifierCannotAuthorizeMilestone() public {
        uint256 cityTokenId = mintCity();
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedVerifier.selector);
        agent.authorizeMilestoneVerification(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);
    }

    function testChangingExecutorGrantClearsStagedIntelligence() public {
        uint256 cityTokenId = mintCity();
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(ADULT);
        agent.setCityExecutor(cityTokenId, EXECUTOR, fullCapabilities());

        TerraCityAgent.PendingIntelligence memory pending = agent.getPendingIntelligence(cityTokenId);
        assertEq(pending.intelligenceHash, bytes32(0), "stale pending intelligence retained");
        assertEq(pending.preparedBy, address(0), "stale preparer retained");
    }

    function testMissingCapabilityRejectsExecutorMutation() public {
        uint256 cityTokenId = mintCityWithoutExecutor();
        vm.prank(ADULT);
        agent.setCityExecutor(cityTokenId, EXECUTOR, GUIDE_CAPABILITY);

        vm.prank(EXECUTOR);
        vm.expectPartialRevert(TerraCityAgent.MissingCapability.selector);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);
    }

    function testDirectChildFacingCallerCannotMutateCity() public {
        uint256 cityTokenId = mintCity();

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedExecutor.selector);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedExecutor.selector);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedCityOwner.selector);
        agent.revokeCityExecutor(cityTokenId);
    }

    function testTransfersStartPausedAndClearDelegationWhenEnabled() public {
        uint256 cityTokenId = mintCity();
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, UPDATED_HASH);

        vm.prank(ADULT);
        vm.expectRevert(TerraCityAgent.TransfersArePaused.selector);
        agent.transferFrom(ADULT, SECOND_ADULT, cityTokenId);

        vm.prank(SPONSOR);
        agent.setTransfersPaused(false);
        vm.prank(ADULT);
        agent.transferFrom(ADULT, SECOND_ADULT, cityTokenId);

        TerraCityAgent.CityAgent memory city = agent.getCity(cityTokenId);
        TerraCityAgent.PendingIntelligence memory pending = agent.getPendingIntelligence(cityTokenId);
        assertEq(agent.ownerOf(cityTokenId), SECOND_ADULT, "new adult owner");
        assertEq(city.executor, address(0), "executor retained");
        assertEq(city.capabilities, 0, "capabilities retained");
        assertEq(pending.intelligenceHash, bytes32(0), "pending update retained");
    }

    function testTwoStepAdminTransferRejectsStranger() public {
        vm.prank(SPONSOR);
        agent.transferAdmin(SECOND_ADULT);

        vm.prank(STRANGER);
        vm.expectPartialRevert(TerraCityAgent.UnauthorizedAdmin.selector);
        agent.acceptAdmin();

        vm.prank(SECOND_ADULT);
        agent.acceptAdmin();
        assertEq(agent.admin(), SECOND_ADULT, "admin not transferred");
        assertEq(agent.pendingAdmin(), address(0), "pending admin retained");
    }

    function testSaltedRunCommitmentChangesWithSalt() public {
        uint256 cityTokenId = mintCity();
        bytes32 first = agent.deriveRunCommitment(
            keccak256("final-state"),
            keccak256("actions"),
            keccak256("campaign-root"),
            cityTokenId,
            keccak256("fresh-random-salt-1")
        );
        bytes32 second = agent.deriveRunCommitment(
            keccak256("final-state"),
            keccak256("actions"),
            keccak256("campaign-root"),
            cityTokenId,
            keccak256("fresh-random-salt-2")
        );

        assertTrue(first != second, "salt did not change commitment");
    }

    function testMilestoneEventContainsCommitmentsButNoURIOrFreeFormChildData() public {
        uint256 cityTokenId = mintCity();
        prepareAndVerify(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        vm.warp(1_788_000_456);
        vm.recordLogs();
        vm.prank(EXECUTOR);
        agent.recordMilestone(cityTokenId, MILESTONE_ID, RUN_COMMITMENT, UPDATED_HASH);

        CityVm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2, "milestone log count");
        CityVm.Log memory recorded = logs[1];
        assertEq(recorded.emitter, address(agent), "milestone emitter");
        assertEq(
            recorded.topics[0],
            keccak256("MilestoneRecorded(uint256,bytes32,bytes32,bytes32,bytes32,uint32,uint64)"),
            "milestone event signature"
        );
        assertEq(recorded.topics[1], bytes32(cityTokenId), "event city");
        assertEq(recorded.topics[2], MILESTONE_ID, "event milestone");
        assertEq(recorded.topics[3], RUN_COMMITMENT, "event run");
        (bytes32 intelligenceHash, bytes32 campaignId, uint32 version, uint64 timestamp) =
            abi.decode(recorded.data, (bytes32, bytes32, uint32, uint64));
        assertEq(intelligenceHash, UPDATED_HASH, "event intelligence");
        assertEq(campaignId, CAMPAIGN_ID, "event campaign");
        assertEq(uint256(version), CAMPAIGN_VERSION, "event version");
        assertEq(uint256(timestamp), 1_788_000_456, "event timestamp");
        assertEq(recorded.data.length, 128, "event contains dynamic/private data");
    }

    function mintCity() private returns (uint256) {
        vm.prank(SPONSOR);
        return agent.mintCity(
            ADULT, EXECUTOR, INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, fullCapabilities()
        );
    }

    function mintCityWithoutExecutor() private returns (uint256) {
        vm.prank(SPONSOR);
        return agent.mintCity(ADULT, address(0), INITIAL_URI, INITIAL_HASH, CAMPAIGN_ID, CAMPAIGN_VERSION, 0);
    }

    function prepareAndVerify(uint256 cityTokenId, bytes32 milestoneId, bytes32 runCommitment, bytes32 intelligenceHash)
        private
    {
        vm.prank(EXECUTOR);
        agent.prepareIntelligenceUpdate(cityTokenId, UPDATED_URI, intelligenceHash);
        vm.prank(VERIFIER);
        agent.authorizeMilestoneVerification(cityTokenId, milestoneId, runCommitment, intelligenceHash);
    }

    function fullCapabilities() private pure returns (uint256) {
        return FULL_CAPABILITIES;
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

    function assertEq(string memory actual, string memory expected, string memory message) private pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), message);
    }
}
