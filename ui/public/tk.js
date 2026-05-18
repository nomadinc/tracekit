(function() {
  console.log("[TraceKit] tk.js loaded");

  const API = window.TRACEKIT_API || "http://127.0.0.1:8787";
  const STORAGE_KEY = "tkid_v1";

  // Generate UUID v4
  function uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  // Load or create tkid
  let tkid = null;
  try {
    tkid = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn("[TraceKit] localStorage not available", e);
  }

  if (!tkid) {
    tkid = uuid();
    try {
      localStorage.setItem(STORAGE_KEY, tkid);
    } catch (e) {
      console.warn("[TraceKit] Failed to persist tkid", e);
    }
  }

  console.log("[TraceKit] tkid =", tkid, "API =", API);

  // Extract UTM + click IDs
  const params = new URLSearchParams(window.location.search);

  const utms = {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || ""
  };

  const clickIds = {
    fbclid: params.get("fbclid") || "",
    gclid: params.get("gclid") || "",
    ttclid: params.get("ttclid") || "",
    msclkid: params.get("msclkid") || "",
    li_fat_id: params.get("li_fat_id") || ""
  };

  function send(event, extra = {}) {
    const payload = {
      tkid,
      event,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || "",
      utms,
      click_ids: clickIds,
      screen: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      meta: {
        ts: Date.now()
      },
      ...extra
    };

    console.log("[TraceKit] sending event", event, payload);

    fetch(`${API}/v1/track`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(res => {
        console.log("[TraceKit] /v1/track response", res.status);
      })
      .catch((err) => {
        console.error("[TraceKit] track failed", err);
      });
  }

  // Auto-pageview
  send("pageview");

  // Form autofill capture (email/phone)
  document.addEventListener("input", (e) => {
    if (!e.target) return;
    const target = e.target;
    const name = (target.name || "").toLowerCase();
    const val = target.value;

    if (!val) return;

    if (name.includes("email") && val.includes("@")) {
      send("identify", { identity: { email: val } });
    }

    if (name.includes("phone") || name.includes("tel")) {
      if (val.replace(/\D/g, "").length >= 7) {
        send("identify", { identity: { phone: val } });
      }
    }
  });

  // Outbound click tracking
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest("a");
    if (!link) return;
    const href = link.href;
    send("click", { href });
  });

})();
