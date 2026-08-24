(() => {
  if (window.__FM_SHOPEE_PDP_OBSERVER__) return;
  window.__FM_SHOPEE_PDP_OBSERVER__ = true;

  const targets = ["/api/v4/pdp/get_pc?"];
  const matchesTarget = (url) => targets.some((target) => String(url || "").includes(target));
  const publish = (url, data) => {
    try {
      window.dispatchEvent(new CustomEvent("fm-shopee-pdp-response", { detail: JSON.stringify({ url, data }) }));
    } catch {}
  };
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    const result = originalFetch.apply(this, args);
    if (!matchesTarget(requestUrl)) return result;
    return result.then((response) => {
      response.clone().json().then((data) => publish(requestUrl, data)).catch(() => {});
      return response;
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__fmShopeeRequestUrl = url;
    return originalOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (matchesTarget(this.__fmShopeeRequestUrl)) {
      this.addEventListener("load", () => {
        try {
          const data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          publish(this.__fmShopeeRequestUrl, data);
        } catch {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();
