# tidelock

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/tatitho/tidelock/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/tatitho/tidelock/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

TIDELOCK is a 5v5 round-based tactical FPS in a blue-hour container terminal: Tide plants a breaching charge on the lock gate (Site A) or the pump house (Site B) while Harbour holds both. Rounds run 15 s buy, 100 s live, 35 s planted, first to 5. A buy economy ($800 start, per-weapon kill rewards, loss-streak bonuses, defuse kit) funds four primaries plus pistol, HE, smoke and flash grenades, armour and helmet, and team-plan bots that smoke entries, flash sites, follow routes, hold positions and react to sight and sound. Gunplay is hitscan with head/torso/leg damage, fixed learnable recoil patterns, armour penetration and aim punch — stopping to aim pays. When you die, spectate a living teammate and cycle between them. Built on three.js 0.187.0 as static files with no build step and no network: WebAudio-synthesised sound, a DOM HUD with minimap, and a fixed-step 60 Hz simulation kept apart from rendering.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — click to play. WASD move, mouse look, click fire, R reload, B buy, E hold to plant/defuse, 1/2/4 weapons, Q last weapon, RMB aim, C crouch, Space jump, M mute.

---

<sub>Entered on [make.fun](https://make.fun/?ref=q1wt1zrm&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
