(function () {
  "use strict";

  var DEFAULT_ENDPOINT = "https://tracekit-api.anthony-d15.workers.dev";
  var DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  var TKID_KEY = "tracekit.tkid";
  var SESSION_KEY = "tracekit.session";
  var FIRST_TOUCH_KEY = "tracekit.first_touch";
  var CONFIG = {
    endpoint: DEFAULT_ENDPOINT,
    workspaceId: "default",
    writeKey: "",
    autoPageView: true,
    autoOutboundClicks: false,
    sessionTimeoutMs: DEFAULT_SESSION_TIMEOUT_MS
  };

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function storageGet(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (_error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, value);
    } catch (_error) {
      // Storage can be disabled; cookies still give the SDK a stable fallback.
    }
  }

  function cookieDomain() {
    var host = window.location.hostname || "";
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
    var parts = host.split(".");
    if (parts.length < 2) return "";
    return "; domain=." + parts.slice(-2).join(".");
  }

  function cookieSet(name, value, maxAgeSeconds) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=" + String(maxAgeSeconds) + "; SameSite=Lax" + cookieDomain();
  }

  function cookieGet(name) {
    var needle = name + "=";
    var parts = String(document.cookie || "").split(";");
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i].trim();
      if (part.indexOf(needle) === 0) return decodeURIComponent(part.slice(needle.length));
    }
    return null;
  }

  function ensureTkid() {
    var existing = storageGet(TKID_KEY) || cookieGet(TKID_KEY);
    if (existing) {
      storageSet(TKID_KEY, existing);
      cookieSet(TKID_KEY, existing, 60 * 60 * 24 * 365);
      return existing;
    }
    var created = "tk_" + uuid().replace(/-/g, "");
    storageSet(TKID_KEY, created);
    cookieSet(TKID_KEY, created, 60 * 60 * 24 * 365);
    return created;
  }

  function ensureSessionId() {
    var current = null;
    try {
      current = JSON.parse(storageGet(SESSION_KEY) || "null");
    } catch (_error) {
      current = null;
    }
    var now = Date.now();
    if (current && current.id && Number(current.expiresAt || 0) > now) {
      current.expiresAt = now + CONFIG.sessionTimeoutMs;
      storageSet(SESSION_KEY, JSON.stringify(current));
      return current.id;
    }
    var next = { id: "tks_" + uuid().replace(/-/g, ""), expiresAt: now + CONFIG.sessionTimeoutMs };
    storageSet(SESSION_KEY, JSON.stringify(next));
    return next.id;
  }

  function paramsFromLocation() {
    var params = new URLSearchParams(window.location.search || "");
    var out = {};
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "affiliate_id",
      "affid",
      "aff_id",
      "offer_id",
      "oid",
      "_ef_transaction_id",
      "ef_transaction_id",
      "transaction_id",
      "click_id",
      "gclid",
      "fbclid",
      "ttclid",
      "msclkid",
      "irclickid",
      "c1",
      "sub1",
      "sub2",
      "sub3",
      "sub4",
      "sub5",
      "sub6",
      "sub7",
      "sub8",
      "sub9",
      "sub10"
    ].forEach(function (key) {
      var value = params.get(key);
      if (value) out[key] = value;
    });
    return out;
  }

  function firstTouch() {
    var existing = null;
    try {
      existing = JSON.parse(storageGet(FIRST_TOUCH_KEY) || "null");
    } catch (_error) {
      existing = null;
    }
    if (existing && typeof existing === "object") return existing;
    var created = {
      captured_at: nowIso(),
      landing_url: window.location.href,
      referrer: document.referrer || "",
      params: paramsFromLocation()
    };
    storageSet(FIRST_TOUCH_KEY, JSON.stringify(created));
    return created;
  }

  function eventPayload(eventType, properties) {
    var touch = firstTouch();
    return {
      workspace_id: CONFIG.workspaceId,
      event_id: "evt_" + uuid().replace(/-/g, ""),
      event: eventType,
      event_type: eventType,
      timestamp: nowIso(),
      tkid: ensureTkid(),
      session_id: ensureSessionId(),
      url: window.location.href,
      page_url: window.location.href,
      path: window.location.pathname,
      title: document.title || "",
      referrer: document.referrer || "",
      first_touch: touch,
      current_touch: paramsFromLocation(),
      properties: properties || {}
    };
  }

  function send(payload) {
    if (!CONFIG.writeKey) return Promise.resolve({ ok: false, error: "missing_write_key" });
    return fetch(CONFIG.endpoint.replace(/\/+$/, "") + "/v1/browser/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tracekit-write-key": CONFIG.writeKey,
        "x-tracekit-workspace-id": CONFIG.workspaceId
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: response.ok, status: response.status };
      });
    });
  }

  function track(eventType, properties) {
    return send(eventPayload(eventType || "custom", properties || {}));
  }

  function identify(identity, properties) {
    var payload = eventPayload("identify", properties || {});
    payload.identity = identity || {};
    return send(payload);
  }

  function getTkid() {
    return ensureTkid();
  }

  function onTrackedClick(event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-tracekit-track], a[data-tracekit-track]") : null;
    if (!target) return;
    var eventName = target.getAttribute("data-tracekit-event") || "click";
    var props = {
      element_id: target.id || null,
      label: target.getAttribute("aria-label") || target.textContent || null,
      href: target.href || target.getAttribute("href") || null
    };
    track(eventName, props);
  }

  function installNavigationHooks() {
    var pushState = history.pushState;
    var replaceState = history.replaceState;
    history.pushState = function () {
      var result = pushState.apply(history, arguments);
      setTimeout(function () { track("page_view"); }, 0);
      return result;
    };
    history.replaceState = function () {
      var result = replaceState.apply(history, arguments);
      setTimeout(function () { track("page_view"); }, 0);
      return result;
    };
    window.addEventListener("popstate", function () {
      setTimeout(function () { track("page_view"); }, 0);
    });
  }

  function init(options) {
    options = options || {};
    CONFIG.endpoint = options.endpoint || CONFIG.endpoint;
    CONFIG.workspaceId = options.workspaceId || options.workspace_id || CONFIG.workspaceId;
    CONFIG.writeKey = options.writeKey || options.write_key || CONFIG.writeKey;
    CONFIG.autoPageView = options.autoPageView !== false;
    CONFIG.autoOutboundClicks = Boolean(options.autoOutboundClicks);
    CONFIG.sessionTimeoutMs = Math.max(60000, Number(options.sessionTimeoutMs || DEFAULT_SESSION_TIMEOUT_MS) || DEFAULT_SESSION_TIMEOUT_MS);
    ensureTkid();
    ensureSessionId();
    firstTouch();
    if (!window.__TRACEKIT_NAV_HOOKS__) {
      window.__TRACEKIT_NAV_HOOKS__ = true;
      installNavigationHooks();
    }
    if (CONFIG.autoOutboundClicks && !window.__TRACEKIT_CLICK_HOOKS__) {
      window.__TRACEKIT_CLICK_HOOKS__ = true;
      document.addEventListener("click", onTrackedClick, { capture: true });
    }
    if (CONFIG.autoPageView) track("page_view");
    return api;
  }

  var api = {
    init: init,
    track: track,
    identify: identify,
    getTkid: getTkid
  };

  window.TraceKit = api;
}());
