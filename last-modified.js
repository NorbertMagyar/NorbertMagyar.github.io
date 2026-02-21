(() => {
  const lastModifiedEl = document.getElementById("last-modified");
  const globalVisitCountEl = document.getElementById("global-visit-count");
  if (!lastModifiedEl && !globalVisitCountEl) return;

  if (lastModifiedEl) {
    const raw = document.lastModified;
    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      lastModifiedEl.textContent = raw;
    } else {
      lastModifiedEl.dateTime = parsed.toISOString();
      lastModifiedEl.textContent = parsed.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  if (!globalVisitCountEl) return;

  const namespace = "norbertmagyar-page";
  const key = "home";
  const url = `https://api.countapi.xyz/hit/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;

  fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Counter request failed");
      }
      return response.json();
    })
    .then((data) => {
      if (typeof data.value === "number") {
        globalVisitCountEl.textContent = String(data.value);
        return;
      }
      throw new Error("Unexpected counter response");
    })
    .catch(() => {
      globalVisitCountEl.textContent = "Unavailable";
    });
})();
