// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC1155Supply } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC6372 } from "@openzeppelin/contracts/interfaces/IERC6372.sol";
import { Checkpoints } from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title PropertyUnits
/// @notice Units of a property vehicle as ERC-1155 batches, one token id per property, every holder
/// gated to one Receptor request (the AU wholesale investor recipe, request 708). Both parties of
/// every movement are checked, so the register of holders is a register of eligible investors by
/// construction. The contract also keeps a history of every holder's balance per property, so the
/// rent distributor and the sale vote beside it can read who held what at a given moment without a
/// loop over holders and without a hook back into this contract.
///
/// Gating. `issue`, `safeTransferFrom` and `safeBatchTransferFrom` all end in `_update`, which runs
/// the same `_requireEligible` check that `Gated.gatedFor` wraps, on the real sender and the real
/// recipient (never on an approved operator). `issue` also carries `gatedFor(to)` on the signature
/// so the rule is visible in the ABI.
///
/// Holding. A holder whose credential lapses keeps the units but cannot send or receive them, and
/// the distributor and the vote run their own gate on the same request before paying or counting
/// that wallet. Decide this policy before mainnet and write it in your threat model; it is the
/// position the scaffold's own token takes.
///
/// Clock. Balance history is keyed by `block.timestamp` (ERC-6372 `mode=timestamp`), not by block
/// number: Redbelly produces blocks on demand, so a block count measures nothing there.
contract PropertyUnits is ERC1155Supply, AccessControl, Gated, IERC6372 {
    using Checkpoints for Checkpoints.Trace208;

    /// @notice May open a property and issue its units. A Safe, acting without delay.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    /// @notice The most ids one batch transfer may carry, so the only loop here has a ceiling the
    /// caller cannot raise.
    uint256 public constant MAX_BATCH = 8;

    /// @notice One property.
    /// @param totalUnits Units the property is divided into; `issue` may not exceed it.
    /// @param issued Units issued so far.
    /// @param termsHash keccak256 of the offer document. Keep the document; the hash is what an
    /// auditor asks you to match it against.
    struct Property {
        uint256 totalUnits;
        uint256 issued;
        bytes32 termsHash;
    }

    /// @notice Who holds what at construction. Zero for the issuer means `admin`.
    /// @param admin `DEFAULT_ADMIN_ROLE`: verifier and request id, URI, role grants. Put a timelock here.
    /// @param issuer `ISSUER_ROLE`: opens properties and issues units. A Safe.
    struct Roles {
        address admin;
        address issuer;
    }

    mapping(uint256 id => Property) private _properties;
    mapping(uint256 id => mapping(address holder => Checkpoints.Trace208)) private _unitHistory;
    mapping(uint256 id => Checkpoints.Trace208) private _totalHistory;

    /// @notice Emitted when a property is opened.
    event PropertyOpened(uint256 indexed id, uint256 totalUnits, bytes32 indexed termsHash);

    /// @notice Emitted on every issue.
    event Issued(uint256 indexed id, address indexed to, uint256 amount, address issuer);

    error ZeroAdmin();
    error PropertyExists(uint256 id);
    error UnknownProperty(uint256 id);
    error ZeroUnits();
    error ZeroTermsHash();
    error ExceedsTotalUnits(uint256 id, uint256 requested, uint256 remaining);
    error BatchTooLong(uint256 length, uint256 max);
    error FutureLookup(uint48 timepoint, uint48 clock);

    /// @param uri_ The ERC-1155 metadata URI, `{id}` substituted by the client.
    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param requestId_ The eligibility request every gate here is bound to.
    constructor(string memory uri_, Roles memory roles, IRedbellyVerifier verifier_, uint64 requestId_)
        ERC1155(uri_)
        Gated(verifier_, requestId_)
    {
        if (roles.admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(ISSUER_ROLE, roles.issuer == address(0) ? roles.admin : roles.issuer);
    }

    // ---- issuer ----

    /// @notice Open a property: fix how many units it has and the hash of its offer document.
    function openProperty(uint256 id, uint256 totalUnits, bytes32 termsHash) external onlyRole(ISSUER_ROLE) {
        if (_properties[id].totalUnits != 0) revert PropertyExists(id);
        if (totalUnits == 0) revert ZeroUnits();
        if (termsHash == bytes32(0)) revert ZeroTermsHash();
        _properties[id] = Property({ totalUnits: totalUnits, issued: 0, termsHash: termsHash });
        emit PropertyOpened(id, totalUnits, termsHash);
    }

    /// @notice Issue units of an open property to one eligible wallet, up to the property's total.
    function issue(uint256 id, address to, uint256 amount) external onlyRole(ISSUER_ROLE) gatedFor(to) {
        Property storage p = _properties[id];
        if (p.totalUnits == 0) revert UnknownProperty(id);
        if (amount == 0) revert ZeroUnits();
        uint256 remaining = p.totalUnits - p.issued;
        if (amount > remaining) revert ExceedsTotalUnits(id, amount, remaining);
        p.issued += amount;
        _mint(to, id, amount, "");
        emit Issued(id, to, amount, msg.sender);
    }

    // ---- admin ----

    /// @notice Change the metadata URI. Slow path: the admin is the timelock.
    function setURI(string calldata newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    // ---- reads ----

    /// @notice The property behind a token id.
    function property(uint256 id) external view returns (Property memory) {
        return _properties[id];
    }

    /// @notice Units `holder` held of `id` at `timepoint`, which must be in the past.
    function getPastUnits(uint256 id, address holder, uint48 timepoint) external view returns (uint256) {
        uint48 current = clock();
        if (timepoint >= current) revert FutureLookup(timepoint, current);
        return _unitHistory[id][holder].upperLookupRecent(timepoint);
    }

    /// @notice Units of `id` in existence at `timepoint`, which must be in the past.
    function getPastTotalUnits(uint256 id, uint48 timepoint) external view returns (uint256) {
        uint48 current = clock();
        if (timepoint >= current) revert FutureLookup(timepoint, current);
        return _totalHistory[id].upperLookupRecent(timepoint);
    }

    /// @notice Read-only mirror of a plain transfer's conditions. Not a substitute for the gate.
    function canTransfer(address from, address to, uint256 id, uint256 amount) external view returns (bool) {
        return balanceOf(from, id) >= amount && isEligible(from) && isEligible(to);
    }

    /// @inheritdoc IERC6372
    function clock() public view returns (uint48) {
        return SafeCast.toUint48(block.timestamp);
    }

    /// @inheritdoc IERC6372
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() external pure returns (string memory) {
        return "mode=timestamp";
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return interfaceId == type(IERC6372).interfaceId || super.supportsInterface(interfaceId);
    }

    // ---- the gate on every movement ----

    /// @dev Every issue and transfer passes through here. The real parties must be eligible, and the
    /// balance history of each is written before the balances change.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (ids.length > MAX_BATCH) revert BatchTooLong(ids.length, MAX_BATCH);
        if (from != address(0)) _requireEligible(from);
        if (to != address(0)) _requireEligible(to);
        super._update(from, to, ids, values);
        uint48 now_ = clock();
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (from != address(0)) _unitHistory[id][from].push(now_, SafeCast.toUint208(balanceOf(from, id)));
            if (to != address(0)) _unitHistory[id][to].push(now_, SafeCast.toUint208(balanceOf(to, id)));
            if (from == address(0) || to == address(0)) {
                _totalHistory[id].push(now_, SafeCast.toUint208(totalSupply(id)));
            }
        }
    }

    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
