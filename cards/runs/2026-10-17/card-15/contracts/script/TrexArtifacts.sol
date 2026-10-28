// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Pragma 0.8.17 because the vendored sources pin it exactly: this file is their compilation unit and
// nothing else of ours is. It names every vendored contract the deploy script and the tests use, so the build
// compiles them (forge only compiles what src/, script/ and test/ import). Theirs, GPL-3.0, from npm
// at pinned versions; see remappings.txt.
import { Token } from "@tokenysolutions/t-rex/contracts/token/Token.sol";
import { ClaimTopicsRegistry } from "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import {
    TrustedIssuersRegistry
} from "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import { IdentityRegistry } from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import {
    IdentityRegistryStorage
} from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import { ModularCompliance } from "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";
import {
    TREXImplementationAuthority
} from "@tokenysolutions/t-rex/contracts/proxy/authority/TREXImplementationAuthority.sol";
import {
    ITREXImplementationAuthority
} from "@tokenysolutions/t-rex/contracts/proxy/authority/ITREXImplementationAuthority.sol";
import { TokenProxy } from "@tokenysolutions/t-rex/contracts/proxy/TokenProxy.sol";
import { ClaimTopicsRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/ClaimTopicsRegistryProxy.sol";
import { TrustedIssuersRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/TrustedIssuersRegistryProxy.sol";
import { IdentityRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryProxy.sol";
import { IdentityRegistryStorageProxy } from "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryStorageProxy.sol";
import { ModularComplianceProxy } from "@tokenysolutions/t-rex/contracts/proxy/ModularComplianceProxy.sol";
import { Identity } from "@onchain-id/solidity/contracts/Identity.sol";
import { ClaimIssuer } from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import { IIdentity } from "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import { IClaimIssuer } from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
