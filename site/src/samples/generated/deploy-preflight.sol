    function preflight() internal returns (Preflight memory p) {
        p.chainId = block.chainid;
        p.deployer = msg.sender;
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
