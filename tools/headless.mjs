// Run the simulation without rendering, for tuning and regression checks.
// usage: node tools/headless.mjs [seed] [days]
import { Sim } from '../src/sim/sim.js';
import { DAY, TICK } from '../src/sim/constants.js';

const seed = process.argv[2] || 'TESTAA';
const days = Number(process.argv[3] || 6);
const sim = new Sim(seed);
const t0 = performance.now();
let lastLog = 0;
const steps = Math.round(days * DAY / TICK);
const every = Math.round(DAY / 4 / TICK);
for (let s = 1; s <= steps; s++) {
  sim.step();
  if (s % every === 0) {
    const r = sim.stats.roles;
    console.log(
      `day ${sim.day.toFixed(2)} pop ${sim.ants.count} brood ${sim.brood.count} (e${sim.stats.eggs} l${sim.stats.larvae} p${sim.stats.pupae})`,
      `food ${sim.stock.total.toFixed(1)} q.fed ${sim.queen.fed.toFixed(2)} rate ${(sim.queen.rate || 0).toFixed(0)}`,
      `| idle ${r[0]} for ${r[1]} dig ${r[2]} nur ${r[3]} cln ${r[4]} def ${r[5]} eat ${r[6]}`,
      `| ch ${sim.chambers.filter((c) => c.active).length}/${sim.chambers.length} dug ${sim.world.dugCells} src ${sim.sources.filter((x) => x.alive).length} seeds ${sim.surfFood.length} corpses ${sim.corpses.length}`,
      `| need f${sim.need.forage.toFixed(2)} n${sim.need.nurse.toFixed(2)} d${sim.need.dig.toFixed(2)} c${sim.need.clean.toFixed(2)}`,
    );
  }
  if (sim.log.length && sim.log.length !== lastLog) {
    for (const e of sim.log.slice(lastLog >= sim.log.length ? sim.log.length - 1 : lastLog)) if (process.env.LOG) console.log('   *', (e.t / DAY).toFixed(2), e.text);
    lastLog = sim.log.length;
  }
}
const ms = performance.now() - t0;
console.log(`\n${steps} steps in ${ms.toFixed(0)} ms (${(ms / steps).toFixed(3)} ms/step), deaths`, sim.stats.deaths, 'born', sim.stats.born, 'nav BFS', sim.nav.calcs);
