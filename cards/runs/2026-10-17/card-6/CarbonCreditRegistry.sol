// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title CarbonCreditRegistry
/// @notice Card 6 of the builder path. Credits are ERC-1155 batches: one token id per mint, each
/// carrying the project id and vintage the issuer gave it. Holders retire credits by burning them
/// into a per-batch counter that only ever grows; nothing in this contract can move a retired
/// credit back into circulation.
///
/// Two gates, one verifier. The `Gated` base binds the holder gate: every wallet that receives,
/// sends or retires credits must hold an accepted proof for `requestId()`, which is request 18,
/// the over-18 recipe with the AU or NZ residency predicate added to its query (the query is in
/// `requests/holder-request-18.json`; the chain sees only the id and the boolean). The minting gate
/// is a second request id on the same verifier, `issuerRequestId()`, request 100, the accredited
/// issuer recipe: a wallet may mint only while the verifier says it holds a credential from the
/// pinned issuer. The two ids are two `setZKPRequest` calls on the dApp's verifier, which is how a
/// recipe becomes a gate, and the contract reuses `Gated.NotEligible` for both refusals so a block
/// explorer reads one error shape with the request id that said no.
///
/// Policy, stated so a reviewer can disagree with it. A holder whose credential lapses is frozen:
/// the holder gate runs on retirement as on every transfer, so a lapsed holder can neither sell nor
/// retire until the credential is fresh again. The prompt does not decide this; the scaffold's token
/// takes the same position for `burn`, and this contract follows it.
contract CarbonCreditRegistry is ERC1155, AccessControl, Gated {
    /// @notice One mint, as the issuer described it. `issued` never changes after the mint;
    /// `retired` only grows.
    struct Batch {
        address issuer;
        string projectId;
        uint16 vintage;
        uint256 issued;
        uint256 retired;
    }

    /// @notice Emitted once per mint. `batchId` is the ERC-1155 token id of the new batch.
    event Issued(
        uint256 indexed batchId,
        address indexed issuer,
        address indexed to,
        string projectId,
        uint16 vintage,
        uint256 amount
    );

    /// @notice Emitted on every retirement. Written for an indexer: the holder and the batch are
    /// indexed for filtering, and the project id and vintage are repeated in the data so a
    /// subgraph can build a retirement row from the log alone, without a contract call.
    /// `beneficiary` is who the retirement is claimed for (often the holder); `reason` is free text.
    event Retired(
        uint256 indexed batchId,
        address indexed holder,
        address indexed beneficiary,
        string projectId,
        uint16 vintage,
        uint256 amount,
        string reason
    );

    /// @notice Emitted when the admin binds minting to a different request id.
    event IssuerRequestIdChanged(uint64 previousRequestId, uint64 newRequestId);

    error ZeroAdmin();
    error ZeroAmount();
    error EmptyProjectId();
    error ZeroVintage();
    error UnknownBatch(uint256 batchId);

    /// @notice How many batches exist. Batch ids run from 1 to this number.
    uint256 public batchCount;

    uint64 private _issuerRequestId;
    mapping(uint256 batchId => Batch) private _batches;

    /// @param admin Holds `DEFAULT_ADMIN_ROLE`: may repoint the verifier and either request id. A Safe.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param holderRequestId The request every holder must pass: the over-18 query with residency, 18.
    /// @param issuerRequestId_ The request every minter must pass: the accredited issuer query, 100.
    constructor(address admin, IRedbellyVerifier verifier_, uint64 holderRequestId, uint64 issuerRequestId_)
        ERC1155("")
        Gated(verifier_, holderRequestId)
    {
        if (admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setIssuerRequestId(issuerRequestId_);
    }

    // ---- issuers ----

    /// @notice Mint a new batch of `amount` credits for `projectId` and `vintage` into `to`.
    /// The caller must pass the issuer gate and the recipient the holder gate; `_update` checks
    /// the recipient again on the way in, so the rule holds even if a later override forgets.
    /// @return batchId The ERC-1155 token id of the new batch.
    function mint(address to, string calldata projectId, uint16 vintage, uint256 amount)
        external
        gatedFor(to)
        returns (uint256 batchId)
    {
        _requireIssuer(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (bytes(projectId).length == 0) revert EmptyProjectId();
        if (vintage == 0) revert ZeroVintage();

        batchId = ++batchCount;
        _batches[batchId] =
            Batch({ issuer: msg.sender, projectId: projectId, vintage: vintage, issued: amount, retired: 0 });
        _mint(to, batchId, amount, "");
        emit Issued(batchId, msg.sender, to, projectId, vintage, amount);
    }

    // ---- holders ----

    /// @notice Retire `amount` credits of `batchId` from the caller's balance, for good. The
    /// credits are burned and added to the batch's `retired` counter, which nothing decrements.
    /// @param beneficiary Who the retirement is claimed on behalf of. Zero means the caller.
    /// @param reason Free text for the indexer and the certificate; keep personal data out of it.
    function retire(uint256 batchId, uint256 amount, address beneficiary, string calldata reason) external gated {
        if (amount == 0) revert ZeroAmount();
        Batch storage b = _batches[batchId];
        if (b.issued == 0) revert UnknownBatch(batchId);

        // The burn runs the holder gate on `msg.sender` once more through `_update` and reverts
        // on an insufficient balance with the ERC-1155 error, so the counter below only moves
        // when credits really left circulation.
        _burn(msg.sender, batchId, amount);
        b.retired += amount;

        address claimedFor = beneficiary == address(0) ? msg.sender : beneficiary;
        emit Retired(batchId, msg.sender, claimedFor, b.projectId, b.vintage, amount, reason);
    }

    // ---- reads ----

    /// @notice The batch behind a token id.
    function batch(uint256 batchId) external view returns (Batch memory) {
        if (_batches[batchId].issued == 0) revert UnknownBatch(batchId);
        return _batches[batchId];
    }

    /// @notice Credits of `batchId` still in circulation: issued minus retired.
    function outstanding(uint256 batchId) external view returns (uint256) {
        Batch storage b = _batches[batchId];
        return b.issued - b.retired;
    }

    /// @notice The request id a wallet must pass to mint.
    function issuerRequestId() public view returns (uint64) {
        return _issuerRequestId;
    }

    /// @notice Whether `wallet` would pass the issuer gate right now.
    function isIssuer(address wallet) public view returns (bool) {
        return verifier().isEligible(wallet, _issuerRequestId);
    }

    // ---- admin ----

    /// @notice Bind minting to a different request id. The accredited issuer recipe says to move
    /// to a new id when a trusted issuer is dropped, so proofs accepted under the old list stop
    /// counting; this is that lever.
    function setIssuerRequestId(uint64 newRequestId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setIssuerRequestId(newRequestId);
    }

    /// @inheritdoc ERC1155
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ---- the gate on every movement ----

    /// @dev Every mint, burn and transfer passes through here. The real parties must be eligible
    /// under the holder gate; an operator approved through `setApprovalForAll` is never checked,
    /// because approval moves someone else's credits and the rule is about who holds them.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0)) _requireEligible(from);
        if (to != address(0)) _requireEligible(to);
        super._update(from, to, ids, values);
    }

    /// @dev The second gate. Same verifier, the issuer's request id, the same error shape.
    function _requireIssuer(address wallet) internal view {
        if (!verifier().isEligible(wallet, _issuerRequestId)) revert NotEligible(wallet, _issuerRequestId);
    }

    function _setIssuerRequestId(uint64 newRequestId) private {
        uint64 previous = _issuerRequestId;
        _issuerRequestId = newRequestId;
        emit IssuerRequestIdChanged(previous, newRequestId);
    }

    /// @dev Only the admin may repoint the verifier or the holder request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
