import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_RECONNECT_MAX_ATTEMPTS,
  liveReconnectDelay,
  liveWorkspaceStreamUrl,
  shouldReconnectLiveStream,
} from "../lib/live";

test("live stream URLs never accept caller-controlled tenant scope", () => {
  assert.equal(liveWorkspaceStreamUrl(), "/api/events/stream");
  assert.equal(liveWorkspaceStreamUrl("cursor_01"), "/api/events/stream?cursor=cursor_01");
  assert.doesNotMatch(liveWorkspaceStreamUrl("workspace_id=other"), /workspace_id=/);
});

test("live stream retries are bounded and use capped exponential backoff", () => {
  assert.equal(shouldReconnectLiveStream(1), true);
  assert.equal(shouldReconnectLiveStream(LIVE_RECONNECT_MAX_ATTEMPTS - 1), true);
  assert.equal(shouldReconnectLiveStream(LIVE_RECONNECT_MAX_ATTEMPTS), false);
  assert.equal(liveReconnectDelay(1, 0), 1000);
  assert.equal(liveReconnectDelay(2, 0), 2000);
  assert.equal(liveReconnectDelay(20, 0), 30000);
});
