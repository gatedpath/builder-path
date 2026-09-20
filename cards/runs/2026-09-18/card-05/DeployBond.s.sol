// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";
import { TokenisedBond } from "../src/TokenisedBond.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { MockStable } from "../test/mocks/MockStable.sol";

/// @notice Deploys TokenisedBond after the same pre-flight as Deploy.s.sol.
///
/// Environment (public addresses and numbers only, never a key):
///   ADMIN_SAFE        Safe 1.4.1 that receives every role. Required on 151.
///   VERIFIER          Your dApp's verifier. Required on 151; a ReceptorMock is deployed elsewhere when unset.
///   REQUEST_ID        Default 708, the AU wholesale investor recipe (recipes/au-wholesale-investor).
///   STABLECOIN        The ERC-20 coupons are paid in. Required on 151 and 153. On a local chain only,
///                     a MockStable is deployed when unset, and the log says so in capitals.
///   COUPON_PER_UNIT   Stablecoin base units per whole bond unit per coupon. Default 25000000.
///   FIRST_COUPON_AT   Unix time of the first coupon. Default 90 days from now.
///   COUPON_PERIOD     Seconds between coupons. Default 90 days.
///   TOTAL_COUPONS     Default 4.
///   PAYING_AGENT      Who funds coupons. Default: the admin.
///
///   forge script script/DeployBond.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployBond is RedbellyDeployScript {
    /// @dev The bond's terms, read once from the environment.
    struct Terms {
        address stablecoin;
        uint256 couponPerUnit;
        uint64 firstCouponAt;
        uint64 couponPeriod;
        uint32 totalCoupons;
        address payingAgent;
    }

    function run() external returns (TokenisedBond bond) {
        Preflight memory p = preflight();
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
        address verifier = _verifier(p.chainId);
        Terms memory t = _terms(p.chainId);

        vm.startBroadcast();
        if (verifier == address(0)) verifier = address(new ReceptorMock());
        if (t.stablecoin == address(0)) t.stablecoin = address(new MockStable());
        GatedERC20.Roles memory roles =
            GatedERC20.Roles({ admin: p.admin, pauser: p.admin, compliance: p.admin, issuerAdmin: p.admin });
        bond = new TokenisedBond(
            "Fixed Coupon Bond",
            "FCB",
            roles,
            IRedbellyVerifier(verifier),
            requestId,
            IERC20(t.stablecoin),
            t.couponPerUnit,
            t.firstCouponAt,
            t.couponPeriod,
            t.totalCoupons,
            t.payingAgent
        );
        vm.stopBroadcast();

        console2.log("TokenisedBond:", address(bond));
        console2.log("verifier:", verifier);
        console2.log("stablecoin:", t.stablecoin);
        recordDeployment(
            "TokenisedBond",
            address(bond),
            p,
            "constructor(string,string,(address,address,address,address),address,uint64,address,uint256,uint64,uint64,uint32,address)",
            _constructorArgs(roles, verifier, requestId, t),
            verifier,
            requestId
        );
    }

    function _verifier(uint256 chainId) internal view returns (address verifier) {
        verifier = optionalEnvAddress("VERIFIER");
        if (verifier == address(0)) {
            if (chainId == Redbelly.MAINNET_CHAIN_ID) {
                revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            }
            console2.log("VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible. Not for mainnet.");
        } else {
            require(verifier.code.length > 0, "VERIFIER is not a contract");
        }
    }

    function _terms(uint256 chainId) internal view returns (Terms memory t) {
        t.stablecoin = optionalEnvAddress("STABLECOIN");
        if (t.stablecoin == address(0)) {
            if (chainId == Redbelly.MAINNET_CHAIN_ID || chainId == Redbelly.TESTNET_CHAIN_ID) {
                revert("STABLECOIN is not set; a mock stablecoin is never deployed to 151 or 153");
            }
            console2.log("STABLECOIN not set: DEPLOYING A MOCK STABLECOIN THAT MINTS TO ANYONE. Local chains only.");
        } else {
            require(t.stablecoin.code.length > 0, "STABLECOIN is not a contract");
        }
        t.couponPerUnit = vm.envOr("COUPON_PER_UNIT", uint256(25e6));
        t.firstCouponAt = uint64(vm.envOr("FIRST_COUPON_AT", block.timestamp + 90 days));
        t.couponPeriod = uint64(vm.envOr("COUPON_PERIOD", uint256(90 days)));
        t.totalCoupons = uint32(vm.envOr("TOTAL_COUPONS", uint256(4)));
        t.payingAgent = optionalEnvAddress("PAYING_AGENT");
    }

    function _constructorArgs(GatedERC20.Roles memory roles, address verifier, uint64 requestId, Terms memory t)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            "Fixed Coupon Bond",
            "FCB",
            roles,
            verifier,
            requestId,
            t.stablecoin,
            t.couponPerUnit,
            t.firstCouponAt,
            t.couponPeriod,
            t.totalCoupons,
            t.payingAgent
        );
    }
}
