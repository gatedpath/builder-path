///   REQUEST_ID   The eligibility request id your verifier answers for. Default 708, the AU
///                wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (GatedERC20 token) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
