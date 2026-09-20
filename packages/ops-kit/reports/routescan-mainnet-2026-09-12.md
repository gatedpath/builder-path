# Routescan script runs, 2026-09-12

Read-only, keyless, against mainnet for token 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076. Each block is the exact output of the command above it.

## routescan-transfers

```
$ node scripts/routescan-transfers.mjs 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 --network mainnet --limit 10
10 transfer(s) of 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 on mainnet (https://redbelly.routescan.io/token/0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076), newest first; 1 API call(s)

block    time                      from                                        to                                          amount                   tx                 
-------  ------------------------  ------------------------------------------  ------------------------------------------  -----------------------  -------------------
3179586  2026-09-12T10:00:09.000Z  0x7199d184ee85d738bb347e0b1d53544007c5d7fc  0x5cfc8ea47b191ad9fd61cb879cab91a2ebee6ee4  801.781504296904707582   0xf14425fde9e8dc56…
3179536  2026-09-12T09:19:24.000Z  0x9fbb3d7ab27fb59f7e62114a2c6a7227ec80fde6  0x82147cf6334fe7940b335c487b174af3ef6ca806  2216.711956521739130435  0x67a17819eb8237e3…
3179535  2026-09-12T09:19:10.000Z  0x7199d184ee85d738bb347e0b1d53544007c5d7fc  0x82147cf6334fe7940b335c487b174af3ef6ca806  1116.707227419068623723  0x813ba4635b9f3974…
3179528  2026-09-12T09:11:43.000Z  0x9fbb3d7ab27fb59f7e62114a2c6a7227ec80fde6  0xbc06caf7a119aa4081d472d84e89df6719ed9731  2089.271336553945249597  0x46b0a9307c4d6879…
3179527  2026-09-12T09:11:00.000Z  0x7199d184ee85d738bb347e0b1d53544007c5d7fc  0xbc06caf7a119aa4081d472d84e89df6719ed9731  1339.398433340938474409  0xd0f5ccdef0ea0402…
3179487  2026-09-12T08:29:17.000Z  0x8bf0167911b1e81d8d69b9c91c20ff854b019c85  0xcde314b116cefecf93143f83cff01f5cc3937aeb  40000                    0x80b09c904a972686…
3179306  2026-09-12T05:15:44.000Z  0x9fbb3d7ab27fb59f7e62114a2c6a7227ec80fde6  0xf163a7d282b9f512e2027305ee25cd2136ee2941  4051.095762882447665056  0xf68dfab6c68fa542…
3179305  2026-09-12T05:15:31.000Z  0x7199d184ee85d738bb347e0b1d53544007c5d7fc  0xf163a7d282b9f512e2027305ee25cd2136ee2941  2040.617790960022308414  0x8d744af301aa2e5c…
3179284  2026-09-12T05:02:34.000Z  0x9fbb3d7ab27fb59f7e62114a2c6a7227ec80fde6  0xa98b5e1c7936f7a355f49da5151a813004041013  994.332477858293075685   0x852ea9485986c9d5…
3179282  2026-09-12T05:02:01.000Z  0x7199d184ee85d738bb347e0b1d53544007c5d7fc  0xa98b5e1c7936f7a355f49da5151a813004041013  500.709813167034248485   0xb333966d96a9eb8b…
(exit 0)
```

## routescan-holders

```
$ node scripts/routescan-holders.mjs 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 --network mainnet --limit 10
10 holder(s) of 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 on mainnet (https://redbelly.routescan.io/token/0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076), largest first; 1 API call(s)

holder                                      balance                       share 
------------------------------------------  ----------------------------  ------
0x5EfeCD7e24Ec14a7Cb970700001C7A3AC40A0282  968206672.189589010628833645  55.58%
0x20326720B4cfDf5914c8516c0e8b09dfCFb9e77f  161981254.316822437373160841  9.30% 
0x71a02ecbdA1C9523e54D53308D336931AB150600  108074206.954721889139353315  6.20% 
0x8d8A51215124e4c3969c1aF3c483c2ff8CBAFeB3  101742599.937344228540108953  5.84% 
0xF2D255dEB76A096e9b6FD8505e6d279d5017b55b  93359542.519691763317080121   5.36% 
0x0025b94f828E26f44caEAbB08bFe32Fe61204c54  57196746.289442726537073182   3.28% 
0x7199D184EE85d738bB347e0B1d53544007C5d7fC  51768027.568949762131876862   2.97% 
0xE356197f27282699f2C1d464AEf8Da18488C610D  46288438.123094585605239717   2.66% 
0x485BD595d2F0F88701901CDbafb88394Cf05B09B  32787024.255433338092014213   1.88% 
0x0E64C56498bB3ab47Ef095E4F9A5D3591b5A7Abb  25000000                      1.44% 

A holder list from an explorer is a snapshot of Transfer events it indexed; for a gated token the on-chain truth is balanceOf, and eligibility is a separate read (isEligible).
(exit 0)
```

## routescan-verified

```
$ node scripts/routescan-verified.mjs 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 --network mainnet
0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 on mainnet: verified as WRBNT1 (v0.4.18+commit.9cf6e910, evm , optimizer off)
https://redbelly.routescan.io/address/0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076/contract/code
(exit 0)
```
