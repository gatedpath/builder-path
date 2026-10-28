    function preflight() internal returns (Preflight memory p) {
        p.chainId = block.chainid;
        p.deployer = msg.sender;
        // Foundry's default sender, used whenever --sender is absent. `--account` alone rehearses as
        // this address, which fails isAllowed on 151 and 153; the first real run (17 October 2026)
        // stopped here. A broadcast refuses; a dry run and a plain test only say so.
        if (p.deployer == 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38) {
            console2.log(
                "deployer is Foundry's default sender: pass --sender <your-address> beside --account <keystore-name>"
            );
            if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
                revert("deployer is Foundry's default sender; pass --sender <your-address> beside --account");
            }
        }
        _requireChainIdIsTheNetworks(p.chainId);
        console2.log("chain id:", p.chainId);
        console2.log("deployer:", p.deployer);

        if (Redbelly.isRedbelly(p.chainId)) {
            p.identityChecked = true;
            _requireDeployerAllowed(p.deployer);
        } else {
            console2.log("chain is not 151 or 153: identity check skipped (local anvil without the registry?)");
        }

        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
            p.admin = adminSafeFromEnv();
            if (p.admin == address(0)) {
                console2.log("mainnet needs ADMIN_SAFE, the address of a Safe 1.4.1 with threshold >= 2");
                revert("ADMIN_SAFE is not set");
            }
            _requireSafe(p.admin, true);
            p.adminIsSafe = true;
        } else {
            p.admin = adminSafeFromEnv();
            if (p.admin == address(0)) {
                p.admin = p.deployer;
                console2.log(
                    "ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet."
                );
            } else {
                p.adminIsSafe = _requireSafe(p.admin, false);
            }
        }
        console2.log("admin:", p.admin);
        _requireShipReport(p.chainId);
    }
