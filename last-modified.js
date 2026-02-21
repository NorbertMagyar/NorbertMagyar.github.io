(() => {
  const lastModifiedEl = document.getElementById("last-modified");
  if (!lastModifiedEl) return;

  const raw = document.lastModified;
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    lastModifiedEl.textContent = raw;
    return;
  }

  lastModifiedEl.dateTime = parsed.toISOString();
  lastModifiedEl.textContent = parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    });
})();
