// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { InvoiceFinancing } from "../src/InvoiceFinancing.sol";
import { MockStablecoin } from "../src/mocks/MockStablecoin.sol";
import { MockZKPVerifierV2 } from "../src/mocks/MockZKPVerifierV2.sol";
import { MockBusinessIdentifier } from "../src/mocks/MockBusinessIdentifier.sol";

/// @notice Card 8, route B, step 2 (25 October 2026): the life of one invoice on testnet through the
/// live-shape adapters, in three phases signed separately so the refusals between them are read against
/// the real network's state, not a fork's. On 153 only the owner's wallet can transact, so it plays the
/// representative, the delegate, the investor and the payer in turn; the roles are still enforced by the
/// contracts, which is the point.
///
///   PHASE=1  mint mUSD to the sender, approve, list invoice (face 48,250.00 mUSD, 250 bps, due in 45 days).
///            Between phases: the sender has no proof for 708 yet, so `fund` is refused; a stranger is refused on `list`.
///   PHASE=2  record the sender's proof for 708, fund the invoice (the advance goes to the lister, here the
///            same wallet), repay the face value, then withdraw the proof.
///            Between phases: `release` is refused while the proof is withdrawn; the face value sits in the contract.
///   PHASE=3  restore the proof, release; then add and remove a second delegate on the identifier so the live
///            role read is shown moving.
///
///   PHASE=1 forge script script/LiveInvoice.s.sol --rpc-url redbelly_testnet --account <keystore-name> --sender <your-address> --broadcast
contract LiveInvoice is RedbellyDeployScript {
    InvoiceFinancing constant FIN = InvoiceFinancing(0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90);
    MockZKPVerifierV2 constant ZKP = MockZKPVerifierV2(0x68E07D5a913F9988240582a431acc1AEA4212461);
    MockBusinessIdentifier constant IDENTIFIER = MockBusinessIdentifier(0x87B7094051d38d00a150E394312c08C7700b6BF1);
    uint64 constant REQUEST = 708;
    uint256 constant FACE = 48_250_000000; // 48,250.00 mUSD, six decimals
    uint16 constant DISCOUNT_BPS = 250;
    address constant SECOND_DELEGATE = 0x000000000000000000000000000000000000D0c8; // never transacts; a role read only

    function run() external {
        Preflight memory p = preflight();
        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) revert("testnet only");
        uint256 phase = vm.envOr("PHASE", uint256(0));
        MockStablecoin usd = MockStablecoin(address(FIN.stablecoin()));
        uint256 id = FIN.invoiceCount();

        if (phase == 1) {
            uint64 due = uint64(block.timestamp + 45 days);
            bytes32 doc = keccak256("INV-2026-1042.pdf");
            vm.startBroadcast();
            usd.mint(p.deployer, FACE);
            usd.approve(address(FIN), FACE);
            id = FIN.list(FACE, DISCOUNT_BPS, due, doc);
            vm.stopBroadcast();
            console2.log("listed invoice", id, "due", due);
            console2.log("advance for it:", FIN.advanceFor(FACE, DISCOUNT_BPS));
        } else if (phase == 2) {
            require(id > 0, "no invoice listed yet; run PHASE=1 first");
            vm.startBroadcast();
            ZKP.recordProof(p.deployer, REQUEST, true);
            FIN.fund(id);
            // The advance used most of phase 1's allowance; the repayment is a second transfer of the face value.
            usd.approve(address(FIN), FACE);
            FIN.repay(id);
            ZKP.recordProof(p.deployer, REQUEST, false);
            vm.stopBroadcast();
            console2.log("funded and repaid invoice", id, "; proof for 708 now withdrawn");
        } else if (phase == 3) {
            require(id > 0, "no invoice listed yet; run PHASE=1 first");
            address[] memory one = new address[](1);
            one[0] = SECOND_DELEGATE;
            vm.startBroadcast();
            ZKP.recordProof(p.deployer, REQUEST, true);
            FIN.release(id);
            IDENTIFIER.addAuthorisedDelegate(one);
            bool listerWhileDelegate = FIN.isLister(SECOND_DELEGATE);
            IDENTIFIER.removeAuthorisedDelegate(one);
            vm.stopBroadcast();
            console2.log("released invoice", id);
            console2.log(
                "second delegate: isLister while added",
                listerWhileDelegate,
                "after removal",
                FIN.isLister(SECOND_DELEGATE)
            );
        } else {
            revert("pass PHASE=1, 2 or 3");
        }
        console2.log("sender mUSD balance:", usd.balanceOf(p.deployer));
        console2.log("contract mUSD balance:", usd.balanceOf(address(FIN)));
    }
}
