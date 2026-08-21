import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unstable_readConfig } from "wrangler";

const configUrl = new URL("../wrangler.toml", import.meta.url);

function productionConfig(): Record<string, any> {
  return unstable_readConfig({ config: configUrl.pathname });
}

test("production Worker configuration preserves the authorized Queue topology", () => {
  const config = productionConfig();
  const producers = config.queues?.producers ?? [];
  const consumers = config.queues?.consumers ?? [];

  assert.equal(producers.filter((entry: any) => entry.queue === "wowboost-imports").length, 1);
  assert.equal(consumers.filter((entry: any) => entry.queue === "wowboost-imports").length, 1);
  assert.equal(producers.filter((entry: any) => entry.queue === "continuous-commerce").length, 1);
  assert.equal(consumers.filter((entry: any) => entry.queue === "continuous-commerce").length, 1);
  const continuousProducer = producers.find((entry: any) => entry.queue === "continuous-commerce");
  const continuousConsumer = consumers.find((entry: any) => entry.queue === "continuous-commerce");
  assert.equal(continuousProducer.binding, "continuous_commerce");
  assert.deepEqual(continuousConsumer, {
    queue: "continuous-commerce",
    max_batch_size: 1,
    max_batch_timeout: 5,
    max_retries: 10,
  });
  assert.deepEqual(config.services, [{ binding: "CONTINUOUS_COMMERCE_RUNTIME", service: "tracekit-continuous-runtime" }]);

  const wowboostProducer = producers.find((entry: any) => entry.queue === "wowboost-imports");
  const wowboostConsumer = consumers.find((entry: any) => entry.queue === "wowboost-imports");
  assert.equal(wowboostProducer.binding, "wowboost_imports");
  assert.deepEqual(wowboostConsumer, {
    queue: "wowboost-imports",
    max_batch_size: 1,
    max_batch_timeout: 5,
    max_retries: 10,
  });
});

test("production Worker configuration preserves route, cron, maintenance, and key controls", () => {
  const config = productionConfig();

  assert.deepEqual(config.routes, [{ pattern: "journey.trace-kit.io", custom_domain: true }]);
  assert.deepEqual(config.triggers?.crons, ["*/5 * * * *"]);
  assert.equal(config.vars?.TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED, "false");
  assert.equal(config.vars?.TRACEKIT_COMMERCE_SCHEDULER_ENABLED, "false");
  assert.equal(config.vars?.TRACEKIT_COMMERCE_KILL_SWITCH, "disabled");

  const source = readFileSync(configUrl, "utf8");
  for (const binding of [
    "INTEGRATIONS_ENC_KEY_V2",
    "INTEGRATIONS_ENC_WRITE_VERSION",
  ]) {
    assert.match(source, new RegExp(`\\b${binding}\\b`));
  }
});
