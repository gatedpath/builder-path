// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { PropertyUnits } from "../src/PropertyUnits.sol";
import { RentDistributor } from "../src/RentDistributor.sol";
import { SaleVote } from "../src/SaleVote.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { MockStable } from "../test/mocks/MockStable.sol";

/// @notice Deploys the property vehicle after the pre-flight in RedbellyDeployScript: a 48-hour
/// TimelockController fed by the Safe, then PropertyUnits, RentDistributor and SaleVote with the
/// timelock as admin of each and the Safe on the operational roles (issuer, manager, proposer).
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1: the timelock's only proposer and executor, and the operational roles.
///                Required on 151. Elsewhere, when unset, the deployer stands in for it (fine on a
///                fork, where an unlocked Anvil account plays the Safe; the log says so).
///   TIMELOCK     An existing TimelockController to reuse. When unset a new one is deployed with a
///                48-hour minimum delay and no admin of its own, so only the timelock can change
///                the timelock.
///   VERIFIER     Your dApp's verifier contract. Required on 151. Off mainnet a ReceptorMock is
///                deployed when unset, and the log says so in capitals.
///   STABLE       The stablecoin rent is paid in. Required on 151. Off mainnet a six-decimal
///                MockStable is deployed when unset, and the log says so in capitals.
///   REQUEST_ID   The eligibility request id. Default 708, the AU wholesale investor recipe.
///   UNITS_URI    The ERC-1155 metadata URI. Default "ipfs://units/{id}.json".
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/DeployProperty.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployProperty is RedbellyDeployScript {
    uint256 internal constant DELAY = 48 hours;

    function run() external returns (PropertyUnits units, RentDistributor rent, SaleVote vote) {
        Preflight memory p = preflight();
        _safeSeat = p.admin;
        bool mainnet = p.chainId == Redbelly.MAINNET_CHAIN_ID;

        address verifier = optionalEnvAddress("VERIFIER");
        address stable = optionalEnvAddress("STABLE");
        address timelock = optionalEnvAddress("TIMELOCK");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
        string memory uri = vm.envOr("UNITS_URI", string("ipfs://units/{id}.json"));

        if (verifier == address(0)) {
            if (mainnet) revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            console2.log("VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible. Not for mainnet.");
        } else {
            require(verifier.code.length > 0, "VERIFIER is not a contract");
        }
        if (stable == address(0)) {
            if (mainnet) revert("STABLE is not set; mainnet never deploys a mock stablecoin");
            console2.log("STABLE not set: DEPLOYING MOCK STABLECOIN (mUSD, 6 decimals). Not for mainnet.");
        } else {
            require(stable.code.length > 0, "STABLE is not a contract");
        }
        if (timelock != address(0)) require(timelock.code.length > 0, "TIMELOCK is not a contract");
        if (!p.adminIsSafe) {
            console2.log("the Safe's seat (timelock proposer and executor, operational roles) is held by:", p.admin);
            console2.log("on a real deploy that is ADMIN_SAFE, a Safe 1.4.1 with threshold >= 2; here it is a stand-in");
        }

        vm.startBroadcast();
        if (verifier == address(0)) verifier = address(new ReceptorMock());
        if (stable == address(0)) stable = address(new MockStable());
        if (timelock == address(0)) {
            address[] memory safeOnly = new address[](1);
            safeOnly[0] = p.admin;
            // admin = address(0): the timelock administers itself; the Safe proposes and executes.
            timelock = address(new TimelockController(DELAY, safeOnly, safeOnly, address(0)));
        }
        units = new PropertyUnits(
            uri, PropertyUnits.Roles({ admin: timelock, issuer: p.admin }), IRedbellyVerifier(verifier), requestId
        );
        rent = new RentDistributor(
            units,
            IERC20(stable),
            RentDistributor.Roles({ admin: timelock, manager: p.admin }),
            IRedbellyVerifier(verifier),
            requestId
        );
        vote = new SaleVote(
            units, SaleVote.Roles({ admin: timelock, proposer: p.admin }), IRedbellyVerifier(verifier), requestId
        );
        vm.stopBroadcast();

        console2.log("TimelockController:", timelock);
        console2.log("PropertyUnits:", address(units));
        console2.log("RentDistributor:", address(rent));
        console2.log("SaleVote:", address(vote));
        console2.log("verifier:", verifier);
        console2.log("stable:", stable);
        console2.log("safe seat:", p.admin);

        p.admin = timelock; // the records name the admin every contract actually has
        _record(p, Wiring(units, rent, vote, uri, verifier, stable, requestId, _safeSeat));
    }

    /// @dev Everything the three deployment records need, in one struct so `run` keeps few locals.
    struct Wiring {
        PropertyUnits units;
        RentDistributor rent;
        SaleVote vote;
        string uri;
        address verifier;
        address stable;
        uint64 requestId;
        address safe;
    }

    /// @dev The Safe's seat as the pre-flight named it, kept for the records after `p.admin` becomes the timelock.
    address private _safeSeat;

    function _record(Preflight memory p, Wiring memory w) internal {
        recordDeployment(
            "PropertyUnits",
            address(w.units),
            p,
            "constructor(string,(address,address),address,uint64)",
            abi.encode(w.uri, PropertyUnits.Roles({ admin: p.admin, issuer: w.safe }), w.verifier, w.requestId),
            w.verifier,
            w.requestId
        );
        recordDeployment(
            "RentDistributor",
            address(w.rent),
            p,
            "constructor(address,address,(address,address),address,uint64)",
            abi.encode(
                address(w.units),
                w.stable,
                RentDistributor.Roles({ admin: p.admin, manager: w.safe }),
                w.verifier,
                w.requestId
            ),
            w.verifier,
            w.requestId
        );
        recordDeployment(
            "SaleVote",
            address(w.vote),
            p,
            "constructor(address,(address,address),address,uint64)",
            abi.encode(address(w.units), SaleVote.Roles({ admin: p.admin, proposer: w.safe }), w.verifier, w.requestId),
            w.verifier,
            w.requestId
        );
    }
}
