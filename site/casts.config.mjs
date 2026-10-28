// The terminal recordings the site shows (PLAN.md 20.4). One entry per recording.
//
// `commands` is the contract between a page and its recording: scripts/check-casts.mjs fails the
// build unless every command here is on a line of a code block in `page`, and unless the recording
// holds exactly these commands in this order. Change a command on the page and this list must
// change, and then the recording must be made again. A recording is a run record: it lives beside
// the run under cards/runs/<date>/ and is never edited by hand.
//
// `stop`, on a command that never ends by itself, says what to wait for before Ctrl-C.
// `cwd` is relative to the empty work folder the recorder is given. Nothing here may need a key, a
// password or an answer typed mid-run: a recording is only ever made in a session that holds none.
export const casts = [
  {
    id: 'start-scaffold',
    page: 'src/content/docs/start.mdx',
    file: 'cards/runs/2026-09-21/casts/start-scaffold.cast',
    title: 'Scaffold with the defaults',
    cwd: '.',
    commands: ['npm create redbelly-dapp@latest my-app -- --yes'],
  },
  {
    id: 'start-doctor',
    page: 'src/content/docs/start.mdx',
    file: 'cards/runs/2026-09-21/casts/start-doctor.cast',
    title: 'npm run doctor, from my-app/',
    cwd: 'my-app',
    commands: ['npm run doctor'],
  },
  {
    id: 'start-install',
    page: 'src/content/docs/start.mdx',
    file: 'cards/runs/2026-09-21/casts/start-install.cast',
    title: 'Install, from my-app/',
    cwd: 'my-app',
    commands: ['npm install', 'npm run contracts:install'],
  },
  {
    id: 'start-test',
    page: 'src/content/docs/start.mdx',
    file: 'cards/runs/2026-09-21/casts/start-test.cast',
    title: 'npm test, from my-app/',
    cwd: 'my-app',
    commands: ['npm test'],
  },
  {
    id: 'start-dev',
    page: 'src/content/docs/start.mdx',
    file: 'cards/runs/2026-09-21/casts/start-dev.cast',
    title: 'npm run dev, from my-app/',
    cwd: 'my-app',
    commands: ['npm run dev'],
    // It runs until it is stopped. The recorder waits for the web app to say it is ready, lets it
    // run a few seconds more, and sends Ctrl-C, as a person would. The recording's header says so.
    stop: { command: 'npm run dev', when: 'Ready in', afterSeconds: 3 },
  },
  // Project 1 (change the gate). Recorded on a scaffold with the step 3 edits applied, so these
  // show the state the page describes: the gate moved from request id 18 to 708. The project
  // page's third command, the `cast call` with a <token-address> placeholder, is not here and
  // stays as text: a placeholder cannot be typed, so it cannot honestly be recorded.
  {
    id: 'project1-test',
    page: 'src/content/docs/tutorials/change-the-gate.mdx',
    file: 'cards/runs/2026-09-22/casts/project1-test.cast',
    title: 'npm run test after the gate moved to 708',
    cwd: 'my-app',
    commands: ['npm run test'],
  },
  {
    id: 'project1-dev',
    page: 'src/content/docs/tutorials/change-the-gate.mdx',
    file: 'cards/runs/2026-09-22/casts/project1-dev.cast',
    title: 'npm run dev, the table ending in request id 708',
    cwd: 'my-app',
    commands: ['npm run dev'],
    stop: { command: 'npm run dev', when: 'Ready in', afterSeconds: 3 },
  },
];

/** Gaps longer than this are shortened on replay; the page says so beside every recording. */
export const MAX_GAP_SECONDS = 1.5;
