// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { TrexSuiteDeployer } from "../script/TrexSuite.sol";
import {
    IClaimIssuerLike,
    IClaimTopicsRegistry,
    IIdentityRegistry,
    IIdentityRegistryStorage,
    IModularCompliance,
    IOnchainId,
    IOwnable,
    ITrexImplementationAuthority,
    ITrexToken,
    ITrustedIssuersRegistry
} from "../src/interfaces/ITrex.sol";
import { ExpiringClaimIssuer } from "../src/ExpiringClaimIssuer.sol";
import { GateReport } from "../src/GateReport.sol";
import { PermissionMock } from "./mocks/RedbellyMocks.sol";

/// @notice The suite as the deploy script stands it up, then every state a claim can be in, seen from the
/// token's own transfer: none, valid, expired, revoked, wrong topic, untrusted issuer. The test contract
/// is the deployer and the admin (the Safe's stand-in); the claim signer is a wallet derived from a label.
contract TrexSuiteTest is Test, TrexSuiteDeployer {
    uint256 internal constant DELAY = 2 days;
    uint16 internal constant AU = 36;
    uint256 internal constant SCHEME_ECDSA = 1;

    Suite internal s;
    PermissionMock internal permission;
    address internal agent = makeAddr("agent");
    address internal investor = makeAddr("investor");
    address internal recipient = makeAddr("recipient");
    address internal stranger = makeAddr("stranger");
    Vm.Wallet internal signer;
    Vm.Wallet internal otherSigner;

    ITrexToken internal token;
    IIdentityRegistry internal registry;
    TimelockController internal timelock;

    function setUp() public {
        signer = vm.createWallet("card-15 claim signer");
        otherSigner = vm.createWallet("card-15 untrusted signer");
        permission = new PermissionMock();

        Config memory c;
        c.deployer = address(this);
        c.admin = address(this);
        c.timelockDelay = DELAY;
        c.agent = agent;
        c.claimSigner = signer.addr;
        c.permission = address(permission);
        c.name = "Card 15 Note";
        c.symbol = "C15";
        c.decimals = 0;
        c.claimTopics = new uint256[](2);
        c.claimTopics[0] = 1;
        c.claimTopics[1] = 2;
        s = deploySuite(c);

        token = ITrexToken(s.token);
        registry = IIdentityRegistry(s.identityRegistry);
        timelock = TimelockController(payable(s.timelock));

        // T-REX tokens are born paused (Token.init sets it); the agent opens the register.
        assertTrue(token.paused());
        vm.prank(agent);
        token.unpause();

        // One verified investor holding 1,000 units, the sender in every transfer below.
        address id = _registerWithIdentity(investor);
        _addReferenceClaim(investor, id, s.claimIssuer, signer, 1);
        _addReferenceClaim(investor, id, s.claimIssuer, signer, 2);
        vm.prank(agent);
        token.mint(investor, 1000);
    }

    // ---- the suite as deployed ---------------------------------------------------------------------

    function test_suite_isWiredAndOwnedByTheTimelock() public view {
        assertEq(token.version(), "4.1.3");
        assertEq(token.name(), "Card 15 Note");
        assertEq(token.decimals(), 0);
        assertEq(token.identityRegistry(), s.identityRegistry);
        assertEq(token.compliance(), s.compliance);
        assertEq(token.onchainID(), s.tokenOnchainId);
        assertEq(registry.identityStorage(), s.identityRegistryStorage);
        assertEq(registry.issuersRegistry(), s.trustedIssuersRegistry);
        assertEq(registry.topicsRegistry(), s.claimTopicsRegistry);
        assertEq(IModularCompliance(s.compliance).getTokenBound(), s.token);
        assertEq(IIdentityRegistryStorage(s.identityRegistryStorage).linkedIdentityRegistries()[0], s.identityRegistry);

        uint256[] memory topics = IClaimTopicsRegistry(s.claimTopicsRegistry).getClaimTopics();
        assertEq(topics.length, 2);
        assertEq(topics[0], 1);
        assertEq(topics[1], 2);
        address[] memory issuers = ITrustedIssuersRegistry(s.trustedIssuersRegistry).getTrustedIssuers();
        assertEq(issuers.length, 1);
        assertEq(issuers[0], s.claimIssuer);
        assertEq(ITrustedIssuersRegistry(s.trustedIssuersRegistry).getTrustedIssuerClaimTopics(s.claimIssuer).length, 2);

        // Every owner role is the timelock's; the deployer kept none.
        address[7] memory owned = [
            s.implementationAuthority,
            s.token,
            s.identityRegistry,
            s.identityRegistryStorage,
            s.trustedIssuersRegistry,
            s.claimTopicsRegistry,
            s.compliance
        ];
        for (uint256 i = 0; i < owned.length; i++) {
            assertEq(IOwnable(owned[i]).owner(), s.timelock, "owner is not the timelock");
        }
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(this)));
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(this)));
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(timelock.getMinDelay(), DELAY);

        // Agents: the operations wallet on token and registry, the token on its registry.
        assertTrue(token.isAgent(agent));
        assertTrue(registry.isAgent(agent));
        assertTrue(registry.isAgent(s.token));
        assertFalse(token.isAgent(address(this)));

        // The claim issuer: signer holds a claim key, the admin the management key, the deployer nothing.
        IOnchainId issuer = IOnchainId(s.claimIssuer);
        assertTrue(issuer.keyHasPurpose(_key(signer.addr), KEY_CLAIM));
        assertFalse(issuer.keyHasPurpose(_key(signer.addr), KEY_MANAGEMENT));
        assertTrue(issuer.keyHasPurpose(_key(address(this)), KEY_MANAGEMENT));
        assertTrue(ITrexImplementationAuthority(s.implementationAuthority).isReferenceContract());
    }

    function test_adminCannotActDirectly_timelockCanAfterTheDelay() public {
        IClaimTopicsRegistry ctr = IClaimTopicsRegistry(s.claimTopicsRegistry);
        vm.expectRevert("Ownable: caller is not the owner");
        ctr.addClaimTopic(3);

        bytes memory call = abi.encodeCall(IClaimTopicsRegistry.addClaimTopic, (3));
        timelock.schedule(s.claimTopicsRegistry, 0, call, bytes32(0), bytes32(0), DELAY);
        vm.expectRevert(); // TimelockUnexpectedOperationState: not ready
        timelock.execute(s.claimTopicsRegistry, 0, call, bytes32(0), bytes32(0));

        vm.warp(block.timestamp + DELAY);
        timelock.execute(s.claimTopicsRegistry, 0, call, bytes32(0), bytes32(0));
        assertEq(ctr.getClaimTopics().length, 3);
    }

    // ---- the six states of a claim, seen from the token ----------------------------------------------

    function test_claim_none_isRefused() public {
        // Not registered at all.
        assertFalse(registry.isVerified(stranger));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(stranger, 10);

        // Registered with an identity but no claim: the registration alone is not enough when topics are required.
        _registerWithIdentity(recipient);
        assertTrue(registry.contains(recipient));
        assertFalse(registry.isVerified(recipient));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(recipient, 10);

        // Nor can the agent mint to it.
        vm.prank(agent);
        vm.expectRevert("Identity is not verified.");
        token.mint(recipient, 1);
    }

    function test_claim_valid_transfers() public {
        address id = _registerWithIdentity(recipient);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 1);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 2);
        assertTrue(registry.isVerified(recipient));

        vm.prank(investor);
        assertTrue(token.transfer(recipient, 10));
        assertEq(token.balanceOf(recipient), 10);
        assertEq(token.balanceOf(investor), 990);
    }

    function testFuzz_claim_valid_anyAmountWithinBalance(uint256 amount) public {
        amount = bound(amount, 1, 1000);
        address id = _registerWithIdentity(recipient);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 1);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 2);
        vm.prank(investor);
        token.transfer(recipient, amount);
        assertEq(token.balanceOf(recipient) + token.balanceOf(investor), 1000);
    }

    function test_claim_wrongTopic_isRefused() public {
        // One of the two required topics, from the trusted issuer: not enough.
        address id = _registerWithIdentity(recipient);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 1);
        assertFalse(registry.isVerified(recipient));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(recipient, 10);

        // A topic the token never asked for does not help either.
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 99);
        assertFalse(registry.isVerified(recipient));

        // The missing topic completes it.
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 2);
        assertTrue(registry.isVerified(recipient));
    }

    function test_claim_untrustedIssuer_isRefused_untilTheTimelockTrustsIt() public {
        // A second reference ClaimIssuer, correctly signed claims on both topics, but not in the registry.
        address rogue = _create("ClaimIssuer.sol:ClaimIssuer", abi.encode(address(this)));
        IOnchainId(rogue).addKey(_key(otherSigner.addr), KEY_CLAIM, KEY_TYPE_ECDSA);
        address id = _registerWithIdentity(recipient);
        _addReferenceClaim(recipient, id, rogue, otherSigner, 1);
        _addReferenceClaim(recipient, id, rogue, otherSigner, 2);
        assertFalse(registry.isVerified(recipient));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(recipient, 10);

        // Trusting it is the timelock's decision, two days out.
        uint256[] memory topics = new uint256[](2);
        topics[0] = 1;
        topics[1] = 2;
        _viaTimelock(
            s.trustedIssuersRegistry, abi.encodeCall(ITrustedIssuersRegistry.addTrustedIssuer, (rogue, topics))
        );
        assertTrue(registry.isVerified(recipient));
        vm.prank(investor);
        assertTrue(token.transfer(recipient, 10));
    }

    function test_claim_revoked_isRefused() public {
        address id = _registerWithIdentity(recipient);
        bytes memory sig1 = _addReferenceClaim(recipient, id, s.claimIssuer, signer, 1);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 2);
        vm.prank(investor);
        token.transfer(recipient, 10);

        // The admin revokes at once: no timelock in front of the claim issuer's management key.
        IClaimIssuerLike(s.claimIssuer).revokeClaimBySignature(sig1);
        assertTrue(IClaimIssuerLike(s.claimIssuer).isClaimRevoked(sig1));
        assertFalse(registry.isVerified(recipient));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(recipient, 10);

        // What the recipient already holds stays; only receiving is gated.
        assertEq(token.balanceOf(recipient), 10);
        vm.prank(recipient);
        assertTrue(token.transfer(investor, 10));

        // A stranger cannot revoke.
        vm.prank(stranger);
        vm.expectRevert();
        IClaimIssuerLike(s.claimIssuer).revokeClaimBySignature(sig1);
    }

    function test_claim_expired_referenceIssuerNeverExpires() public {
        // The reference ClaimIssuer has no notion of time: a claim is valid until revoked, ten years on.
        address id = _registerWithIdentity(recipient);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 1);
        _addReferenceClaim(recipient, id, s.claimIssuer, signer, 2);
        vm.warp(block.timestamp + 3650 days);
        assertTrue(registry.isVerified(recipient));
    }

    function test_claim_expired_isRefusedByTheExpiringIssuer() public {
        ExpiringClaimIssuer expiring = new ExpiringClaimIssuer(address(this), signer.addr);
        uint256[] memory topics = new uint256[](2);
        topics[0] = 1;
        topics[1] = 2;
        // Replace the reference issuer with the expiring one, through the timelock.
        _viaTimelock(
            s.trustedIssuersRegistry, abi.encodeCall(ITrustedIssuersRegistry.removeTrustedIssuer, (s.claimIssuer))
        );
        _viaTimelock(
            s.trustedIssuersRegistry,
            abi.encodeCall(ITrustedIssuersRegistry.addTrustedIssuer, (address(expiring), topics))
        );
        // The investor's own claims came from the old issuer, so the investor is no longer verified for
        // receiving; sending is not gated, which is what this test needs.
        assertFalse(registry.isVerified(investor));

        address id = _registerWithIdentity(recipient);
        uint256 validUntil = block.timestamp + 30 days;
        bytes memory sig1 = _addExpiringClaim(recipient, id, expiring, signer, 1, validUntil);
        _addExpiringClaim(recipient, id, expiring, signer, 2, validUntil);
        assertTrue(registry.isVerified(recipient));
        vm.prank(investor);
        assertTrue(token.transfer(recipient, 10));

        vm.warp(validUntil + 1);
        assertFalse(expiring.isClaimValid(id, 1, sig1, _expiringData(1, validUntil)));
        assertFalse(registry.isVerified(recipient));
        vm.prank(investor);
        vm.expectRevert("Transfer not possible");
        token.transfer(recipient, 10);

        // Data that is not (validUntil, reference) is refused outright, and revocation works here too.
        assertFalse(expiring.isClaimValid(id, 1, sig1, hex"01"));
        expiring.revokeClaimBySignature(sig1);
        assertTrue(expiring.isClaimRevoked(sig1));
        vm.expectRevert(ExpiringClaimIssuer.AlreadyRevoked.selector);
        expiring.revokeClaimBySignature(sig1);
    }

    // ---- the two layers, read side by side ---------------------------------------------------------------

    function test_gateReport_saysWhichLayerRefused() public {
        GateReport gate = GateReport(s.gateReport);
        assertEq(address(gate.registry()), s.identityRegistry);

        // Investor: register yes, network no (a test wallet never verified on the network).
        GateReport.Answer memory a = gate.check(investor);
        assertTrue(a.networkReadable);
        assertFalse(a.networkAllowed);
        assertTrue(a.registerVerified);
        assertEq(
            gate.describe(investor),
            "refused by the network gate (permission.isAllowed is false); the register would accept this wallet"
        );

        // Stranger: both refuse.
        assertEq(gate.describe(stranger), "refused by both layers: the network gate and the register");

        // Network allows, register refuses.
        permission.setAllowed(stranger, true);
        assertEq(
            gate.describe(stranger),
            "refused by the register (identityRegistry.isVerified is false); the network gate allows this wallet"
        );

        // Both allow.
        permission.setAllowed(investor, true);
        assertEq(gate.describe(investor), "allowed by both layers");

        // A chain with no permission contract: the reader says so instead of guessing.
        GateReport bare = new GateReport(makeAddr("no code here"), s.identityRegistry);
        assertFalse(bare.check(investor).networkReadable);
        assertEq(bare.describe(investor), "network gate unreadable on this chain; the register accepts this wallet");
    }

    // ---- helpers -----------------------------------------------------------------------------------------

    /// @dev The agent deploys an ONCHAINID managed by the wallet and registers it; the state before any claim.
    function _registerWithIdentity(address wallet) internal returns (address id) {
        id = _create("Identity.sol:Identity", abi.encode(wallet, false));
        vm.prank(agent);
        registry.registerIdentity(wallet, id, AU);
    }

    /// @dev A claim in the reference ClaimIssuer's scheme: the signer signs the prefixed hash of
    /// (identity, topic, data); the wallet, as its identity's management key, adds it.
    function _addReferenceClaim(address wallet, address id, address issuer, Vm.Wallet memory w, uint256 topic)
        internal
        returns (bytes memory sig)
    {
        bytes memory data = abi.encode(keccak256(abi.encodePacked("reference ", topic)));
        sig = _sign(w, id, topic, data);
        vm.prank(wallet);
        IOnchainId(id).addClaim(topic, SCHEME_ECDSA, issuer, sig, data, "");
    }

    function _addExpiringClaim(
        address wallet,
        address id,
        ExpiringClaimIssuer issuer,
        Vm.Wallet memory w,
        uint256 topic,
        uint256 validUntil
    ) internal returns (bytes memory sig) {
        bytes memory data = _expiringData(topic, validUntil);
        sig = _sign(w, id, topic, data);
        vm.prank(wallet);
        IOnchainId(id).addClaim(topic, SCHEME_ECDSA, address(issuer), sig, data, "");
    }

    function _expiringData(uint256 topic, uint256 validUntil) internal pure returns (bytes memory) {
        return abi.encode(validUntil, keccak256(abi.encodePacked("reference ", topic)));
    }

    function _sign(Vm.Wallet memory w, address id, uint256 topic, bytes memory data)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(id, topic, data)));
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(w, digest);
        return abi.encodePacked(r, s_, v);
    }

    function _viaTimelock(address target, bytes memory call) internal {
        bytes32 salt = keccak256(call);
        timelock.schedule(target, 0, call, bytes32(0), salt, DELAY);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(target, 0, call, bytes32(0), salt);
    }
}
