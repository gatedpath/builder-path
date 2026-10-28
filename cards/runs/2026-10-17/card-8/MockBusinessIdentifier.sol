// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice A stand-in for Redbelly's `BusinessIdentifier`, in the shape Vine prints (read 15 September
/// 2026): the two role constants with the same names and hashes, the issuer as admin ("Caller must be
/// IDP"), representatives added by the issuer only, delegates added or removed by a representative or
/// the issuer, and the business's public strings. What the real contract does beyond this, granting
/// and withdrawing network write access for each wallet through `IBusinessPermission`, has no meaning
/// on a fork and is left out; the role reads, which are what the gate uses, are the same. Off mainnet
/// only: the constructor refuses chain 151, as the kit's `ReceptorMock` does.
contract MockBusinessIdentifier is AccessControl {
    bytes32 public constant AUTHORISED_REPRESENTATIVE_ROLE = keccak256("AUTHORISED_REPRESENTATIVE");
    bytes32 public constant AUTHORISED_DELEGATE_ROLE = keccak256("AUTHORISED_DELEGATE");

    string public companyName;
    string public identifierType;
    string public identifierNumber;
    string public businessAddress;

    error UnauthorisedAccess(string message);
    error NotForMainnet();

    event RoleUpdated(address indexed wallet, bytes32 indexed role, bool added);

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) revert UnauthorisedAccess("Caller must be IDP");
        _;
    }

    modifier onlyAuthorisedRepresentative() {
        if (!hasRole(AUTHORISED_REPRESENTATIVE_ROLE, _msgSender()) && !hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            revert UnauthorisedAccess("Caller must have IDP or Authorised Representative");
        }
        _;
    }

    /// @param idp The accredited issuer's wallet; holds the admin role as on the real contract.
    /// @param firstRepresentative The director or officeholder named at verification.
    constructor(
        address idp,
        address firstRepresentative,
        string memory companyName_,
        string memory identifierType_,
        string memory identifierNumber_,
        string memory businessAddress_
    ) {
        if (block.chainid == 151) revert NotForMainnet();
        _grantRole(DEFAULT_ADMIN_ROLE, idp);
        _grantRole(AUTHORISED_REPRESENTATIVE_ROLE, firstRepresentative);
        emit RoleUpdated(firstRepresentative, AUTHORISED_REPRESENTATIVE_ROLE, true);
        companyName = companyName_;
        identifierType = identifierType_;
        identifierNumber = identifierNumber_;
        businessAddress = businessAddress_;
    }

    function addAuthorisedRepresentative(address[] memory wallets) external onlyAdmin {
        _update(wallets, AUTHORISED_REPRESENTATIVE_ROLE, true);
    }

    function removeAuthorisedRepresentative(address[] memory wallets) external onlyAdmin {
        _update(wallets, AUTHORISED_REPRESENTATIVE_ROLE, false);
    }

    function addAuthorisedDelegate(address[] memory wallets) external onlyAuthorisedRepresentative {
        _update(wallets, AUTHORISED_DELEGATE_ROLE, true);
    }

    function removeAuthorisedDelegate(address[] memory wallets) external onlyAuthorisedRepresentative {
        _update(wallets, AUTHORISED_DELEGATE_ROLE, false);
    }

    function _update(address[] memory wallets, bytes32 role, bool add) private {
        for (uint256 i = 0; i < wallets.length; i++) {
            if (add) _grantRole(role, wallets[i]);
            else _revokeRole(role, wallets[i]);
            emit RoleUpdated(wallets[i], role, add);
        }
    }
}
