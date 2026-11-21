import { setFlagsFromString } from "node:v8";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Keep the collector quiet while the timed run works.
setFlagsFromString("--no-incremental-marking");

const { run } = await import("./solve.js");

// The harness hands the entry its folders through the environment when it
// runs outside a container; inside one they are the plain mounts.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(inputDir + "/cases.json", "utf8"));
const answers = new Array(cases.length);
for (let k = 0; k < cases.length; k++) {
  answers[k] = run(cases[k].input);
}
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + "/answers.json", JSON.stringify(answers));
