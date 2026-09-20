# The shared "save your work" card: run of 2026-09-17

Every command the card shows (`site/src/components/SaveYourWork.astro`) was run on the fresh scaffold
of `card-01-solidity.md`, on the owner's Mac, git 2.x as shipped with the Xcode tools. The push went
to a bare repository in a temporary folder, so nothing left the machine.

| What the card says | Command | What happened |
|---|---|---|
| The wrong folder gives a recognisable error | `git status` from the folder above the project | `fatal: not a git repository (or any of the parent directories): .git` |
| Inside the project it works | `git status -sb` | `## master` |
| `.env` is ignored before the first commit | `touch .env` then `git check-ignore .env` | prints `.env`; `git status --short` lists no `.env` |
| A commit | `git add -A` then `git commit -m "..."` | `fc592ea` |
| A new project here starts on `master` | `git branch --show-current` after `git init` | `master`, which is why the card has `git branch -M main` before the first push |
| The first push | `git remote add origin <remote>` then `git push -u origin <branch>` | `* [new branch]` and `branch ... set up to track` |
| A push with nothing new | `git push` | `Everything up-to-date` |
| Whether a push is owed | `git status -sb` | `## master...origin/master`, nothing after it, when both copies match; `[ahead 1]` when one commit waits (seen in this repository the same day) |

Not run: a push to GitHub itself from the scaffold, which needs an account and a repository of the
reader's own. The two failures the card names are the ones the owner met on 17 September: git run
from the folder above the project, and not knowing whether a push had gone.
