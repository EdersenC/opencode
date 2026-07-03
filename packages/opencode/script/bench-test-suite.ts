// Timing harness for the test-speed research in ../../perf/test-suite.md.
// Use full-suite mode for periodic sanity checks; use BENCH_TEST_FILES for
// targeted e2e smoke benchmarks, and profile-test-files.ts for discovery.
// Env: BENCH_WARMUPS=0 BENCH_RUNS=1 bun run bench:test
// Env: BENCH_TEST_FILES='test/cli/run/run-process.test.ts' BENCH_RUNS=3 bun run bench:test
const warmups = Number(Bun.env.BENCH_WARMUPS ?? 0)
const runs = Number(Bun.env.BENCH_RUNS ?? 1)
const timeout = Bun.env.BENCH_TEST_TIMEOUT ?? "30000"
const targets = (Bun.env.BENCH_TEST_FILES ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item.length > 0)
const timings: number[] = []

if (!Number.isInteger(warmups) || warmups < 0) {
  console.error("BENCH_WARMUPS must be a non-negative integer")
  process.exit(1)
}
if (!Number.isInteger(runs) || runs < 1) {
  console.error("BENCH_RUNS must be a positive integer")
  process.exit(1)
}
if (!/^\d+$/.test(timeout) || Number(timeout) < 1) {
  console.error("BENCH_TEST_TIMEOUT must be a positive integer number of milliseconds")
  process.exit(1)
}

const scope = targets.length === 0 ? "full suite" : targets.join(", ")
const metric = targets.length === 0 ? "test_suite" : "test_target"

for (const index of Array.from({ length: warmups + runs }, (_, index) => index)) {
  const measured = index >= warmups
  const label = measured ? `run ${index - warmups + 1}/${runs}` : `warmup ${index + 1}/${warmups}`
  const start = performance.now()
  console.log(`bench:test ${label} ${scope}`)

  const proc = Bun.spawn(["bun", "test", "--timeout", timeout, ...targets], {
    cwd: import.meta.dir + "/..",
    stdout: "inherit",
    stderr: "inherit",
    env: Bun.env,
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error(`bench:test failed during ${label} with exit code ${exitCode}`)
    process.exit(exitCode)
  }

  const seconds = (performance.now() - start) / 1000
  console.log(`bench:test ${label} ${seconds.toFixed(3)}s`)
  if (measured) timings.push(seconds)
}

const sorted = timings.toSorted((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)]
const mean = timings.reduce((sum, timing) => sum + timing, 0) / timings.length
const best = sorted[0] ?? median
const worst = sorted.at(-1) ?? median

console.log(
  `bench:test median=${median.toFixed(3)}s mean=${mean.toFixed(3)}s best=${best.toFixed(3)}s worst=${worst.toFixed(3)}s`,
)
console.log(`METRIC ${metric}_seconds=${median.toFixed(3)}`)
console.log(`METRIC ${metric}_best_seconds=${best.toFixed(3)}`)
console.log(`METRIC ${metric}_worst_seconds=${worst.toFixed(3)}`)
