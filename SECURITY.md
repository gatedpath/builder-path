# Security

These packages are supposed to be in front of contracts that hold value, so if something is wrong
here I want to know about it quickly.

## If you find a problem

Please do not open a public issue for it. Use the private reporting on this repo provided by
GitHub: open the **Security** tab, and choose **Report a vulnerability**. Tell me what you found,
how I can reproduce it, and what package and version it is in. I will get back to you, and I am
happy to credit you if you would like that.

Do not put a private key, a seed phrase or an access token in a report, an issue or a pull request.
If you think one of yours has leaked, treat it as compromised and move whatever it controls before
you do anything else.

## What I care about most

The nine packages in `packages/`, the project the scaffolder produces, and the deploy scripts. The
faults that worry me are ones where a guard passes without doing the thing it is there to do. That
means the mainnet deploy checks, the pre-flight secret scan, and the eligibility gate on the token.
The other kind is anything that could make a tool print, log or store a secret.

## What has been reviewed so far

An internal audit found twelve faults of exactly that kind in 0.1.x on 19 September 2026. Each one
is fixed in 0.2.0, starting from a test that failed first, and 0.1.x is deprecated on npm. There has
not been an external audit. This project has not deployed anything to a real network.

## Which versions get fixes

The newest published version of each package. An older version is deprecated with a notice pointing
you at the fix. It doesn't get a patch of its own.
