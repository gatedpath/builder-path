# The share register, explained for the company's lawyer

This is what the two programs beside this page do, in plain words. They are the company's share
register kept on Redbelly Network, a public ledger where every wallet belongs to a person or a
company that has been identified by an accredited issuer before it can act. The register itself
holds no names, no documents and no dates of birth. It holds wallet addresses, share counts, the
rules below, and a record of every entry ever made.

## What is on the register

The register has share classes, the way the constitution does: at the first deployment, Ordinary
shares and Series A Preference shares, each with a cap on how many may be on issue. For every class
the register names the credential a holder must prove. An Ordinary holder must prove they are an
adult, from a government identity document; a Series A holder must prove that an accountant has
certified them as a wholesale investor, the test the Corporations Act uses to let a company issue
shares without a disclosure document. The register never sees the document or the certificate. It
asks the company's verifier one question, "does this wallet hold a valid credential of this kind",
and gets yes or no. Which credential each class requires can be changed by the company's
constitutional decision maker, and more classes can be added.

## Who may do what

Three parties have powers, and each is a wallet or a group of wallets the company controls.

The administrator, meant to be a time-delayed multi-signature arrangement, creates classes, sets
each class's credential and its cap, appoints the vesting vault, and appoints the board. Nothing it
does takes effect at once; the delay is the time to notice and stop a mistake.

The board, meant to be the directors signing together, issues shares and decides every transfer.

The vesting vault is a program, not a person. It may hold shares on a person's behalf and hand them
over as they vest. It cannot do anything the board has not set in motion.

Shareholders ask. They cannot move their own shares.

## How shares are issued

The board issues shares of a class to a wallet. The register refuses if the wallet does not hold the
credential that class requires, if the class is at its cap, or if the wallet is being given a class
it is not entitled to (an employee cannot be issued preference shares, an investor cannot be issued
ordinary shares, unless the credentials say otherwise). Each refusal has a name that says why.

## How vesting works

For founders and employees, the board grants shares on a schedule: a start date, a cliff and a
duration. The register issues the shares to the vault, which holds them in its own name for the
beneficiary, the way an employee share trust does. Nothing can be released before the cliff. At the
cliff, the cliff's share vests at once (one year of a four-year grant is a quarter), then the rest
vests evenly to the end. The beneficiary asks the vault for what has vested, and the register
checks their credential again at that moment before entering the shares in their name. If their
credential has lapsed, the shares wait in the vault until it is valid again or the board acts.

The board may revoke a schedule, with a written reason. What had vested by then stays the
beneficiary's to collect; what had not is cancelled and may be issued again.

## How transfers work

A holder asks to transfer shares of one class to another wallet. Nothing moves. The request sits
until the board approves it, with a reference to its minute, or rejects it, with a reason. The holder
may withdraw it before then. When the board approves, the register checks the recipient's credential
at that moment, so a buyer whose credential lapsed between the request and the meeting is refused.
The seller is not checked again at approval: a transfer out of a wallet whose credential has lapsed
is how that wallet leaves the register, and the board decides it. A transfer never crosses classes.

## What the record shows

Every entry (a class created, shares issued, a grant, a release, a request, an approval with its
minute reference, a rejection with its reason, a revocation) is written to the ledger as an event
with the time, the wallets and the amounts. The register can be rebuilt from those events alone.
Anyone can read them. What anyone can therefore infer is that a wallet on the Series A register
holds a wholesale investor credential; the company's privacy notice should say so.

## What this is not

It is not a legal opinion, and it does not replace the company's constitution or its shareholder
agreements; it records what they allow. The credentials behind each class are drafts until they have
been run against a live Redbelly verifier, and which issuers the company trusts is a decision the
company makes, in writing, before anything real is issued. A compulsory transfer power (a bad leaver,
a court order) is not in this version.
