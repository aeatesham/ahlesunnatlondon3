(() => {
  "use strict";

  const prefs = window.PrayerPrefs;
  const site = window.ASLSite;

  if (!prefs || !site) return;

  const countryInput = document.getElementById("countryInput");
  const cityInput = document.getElementById("cityInput");
  const applyLocationButton = document.getElementById("applyLocation");
  const dateInput = document.getElementById("prayerDate");
  const madhabSelect = document.getElementById("madhabSelect");
  const prevDateButton = document.getElementById("prevDate");
  const todayButton = document.getElementById("todayDate");
  const nextDateButton = document.getElementById("nextDate");

  const timingsState = document.getElementById("timingsState");
  const timingsInfo = document.getElementById("timingsInfo");
  const liveHeading = document.getElementById("liveHeading");
  const currentPrayerBox = document.getElementById("currentPrayerBox");
  const liveMeta = document.getElementById("liveMeta");
  const prayerTableBody = document.getElementById("prayerTableBody");

  if (
    !countryInput ||
    !cityInput ||
    !applyLocationButton ||
    !dateInput ||
    !madhabSelect ||
    !prevDateButton ||
    !todayButton ||
    !nextDateButton ||
    !timingsState ||
    !liveHeading ||
    !currentPrayerBox ||
    !liveMeta ||
    !prayerTableBody
  ) {
    return;
  }

  const timingsCache = new Map();
  const validPrayerNames = ["Fajr", "Sunrise", "Dahwa e Kubra", "Zuhr", "Asr", "Maghrib", "Isha"];
  let pendingFocusPrayer = normalizePrayerName(new URLSearchParams(window.location.search).get("focus"));

  function two(value) {
    return String(value).padStart(2, "0");
  }

  function toInputDate(date) {
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  }

  function parseInputDate(value) {
    return new Date(`${value}T00:00:00`);
  }

  function sameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function normalizePrayerName(value) {
    const incoming = String(value || "").trim().toLowerCase();
    if (!incoming) return "";
    return validPrayerNames.find((name) => name.toLowerCase() === incoming) || "";
  }

  function updateInputsFromSettings(settings) {
    countryInput.value = settings.country;
    cityInput.value = settings.city;
    madhabSelect.value = settings.madhab;
  }

  function showState(message, type) {
    if (!message) {
      timingsState.className = "state-message";
      timingsState.textContent = "";
      return;
    }

    const safeType = type === "error" ? "error" : "info";
    timingsState.className = `state-message ${safeType} show`;
    timingsState.textContent = message;
  }

  async function getCombinedModel(date, settings) {
    const key = `${toInputDate(date)}|${settings.city.toLowerCase()}|${settings.country.toLowerCase()}`;

    if (timingsCache.has(key)) {
      return timingsCache.get(key);
    }

    const model = await prefs.fetchCombinedTimings(date, settings);
    timingsCache.set(key, model);
    return model;
  }

  function buildPrayerRows(times, currentPrayerName, madhab) {
    const rows = [
      ["Fajr", times.Fajr],
      ["Sunrise", times.Sunrise],
      ["Dahwa e Kubra", times["Dahwa e Kubra"]],
      ["Zuhr", times.Zuhr],
      ["Asr", times.Asr],
      ["Maghrib", times.Maghrib],
      ["Isha", times.Isha]
    ];

    prayerTableBody.innerHTML = "";

    rows.forEach(([name, time]) => {
      const row = document.createElement("tr");
      row.dataset.prayerName = name;
      if (name === currentPrayerName) {
        row.classList.add("prayer-row-current");
      }

      const prayerCell = document.createElement("td");
      prayerCell.className = "prayer-name";
      prayerCell.textContent = prefs.prayerLabel(name, madhab);

      const timeCell = document.createElement("td");
      timeCell.className = "prayer-time";
      timeCell.textContent = prefs.formatTime12(time);

      row.appendChild(prayerCell);
      row.appendChild(timeCell);
      prayerTableBody.appendChild(row);
    });
  }

  function focusPrayerRow(prayerName) {
    const normalized = normalizePrayerName(prayerName);

    let row = null;
    if (normalized) {
      row = prayerTableBody.querySelector(`tr[data-prayer-name="${normalized}"]`);
    }

    if (!row) {
      row = prayerTableBody.querySelector(".prayer-row-current");
    }

    if (!row) return;

    row.classList.remove("prayer-row-blink");
    void row.offsetWidth;
    row.classList.add("prayer-row-blink");

    row.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    window.setTimeout(() => {
      row.classList.remove("prayer-row-blink");
    }, 4200);
  }

  async function renderTimings() {
    const settings = prefs.getSettings();
    const selectedDate = parseInputDate(dateInput.value);

    updateInputsFromSettings(settings);

    showState("Loading timings...", "info");

    try {
      const selectedModel = await getCombinedModel(selectedDate, settings);
      const timezone = selectedModel.timezone;
      const nowParts = prefs.getNowParts(timezone);
      const liveDate = new Date(nowParts.year, nowParts.month - 1, nowParts.day);

      const liveModel = sameDate(selectedDate, liveDate)
        ? selectedModel
        : await getCombinedModel(liveDate, settings);

      const madhab = settings.madhab;
      const selectedTimes = madhab === "shafi" ? selectedModel.shafi : selectedModel.hanafi;
      const liveTimes = madhab === "shafi" ? liveModel.shafi : liveModel.hanafi;
      const liveStatus = site.getCurrentPrayerStatus(liveTimes, nowParts);

      liveHeading.textContent = `Current Prayer in ${prefs.formatLocationLabel(settings)}`;
      currentPrayerBox.textContent = `Now Running: ${prefs.prayerLabel(liveStatus.current, madhab)}`;

      const liveClock = prefs.formatTime12(`${two(nowParts.hour)}:${two(nowParts.minute)}`);
      const nextClock = prefs.formatTime12(`${two(Math.floor(liveStatus.nextTime / 60))}:${two(liveStatus.nextTime % 60)}`);
      liveMeta.textContent = `Current local time: ${liveClock} • Next: ${prefs.prayerLabel(liveStatus.next, madhab)} at ${nextClock}`;

      const shouldHighlightCurrent = sameDate(selectedDate, liveDate) ? liveStatus.current : "";
      buildPrayerRows(selectedTimes, shouldHighlightCurrent, madhab);

      if (pendingFocusPrayer) {
        focusPrayerRow(pendingFocusPrayer);
        pendingFocusPrayer = "";

        if (window.history && window.history.replaceState) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("focus");
          window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }
      }

      if (timingsInfo) {
        timingsInfo.textContent = `Prayer timings are loaded by selected city and country: ${prefs.formatLocationLabel(settings)}.`;
      }

      showState("", "info");
    } catch (error) {
      prayerTableBody.innerHTML = "<tr><td colspan=\"2\">No results found for the selected location/date.</td></tr>";
      currentPrayerBox.textContent = "Current prayer unavailable";
      liveMeta.textContent = "Please verify city, country, and date, then apply again.";
      showState("No results found. Please check city and country spelling and try again.", "error");
    }
  }

  function adjustDate(days) {
    const selected = parseInputDate(dateInput.value);
    selected.setDate(selected.getDate() + days);
    dateInput.value = toInputDate(selected);
  }

  function applyLocation() {
    const city = cityInput.value.trim();
    const country = countryInput.value.trim();

    if (!city || !country) {
      showState("No results found. Enter both city and country.", "error");
      return;
    }

    timingsCache.clear();

    prefs.updateSettings(
      {
        city,
        country,
        madhab: madhabSelect.value,
        manualLocation: true
      },
      { silent: false }
    );

    renderTimings();
  }

  function boot() {
    const settings = prefs.getSettings();
    dateInput.value = toInputDate(new Date());
    updateInputsFromSettings(settings);
    renderTimings();
  }

  applyLocationButton.addEventListener("click", applyLocation);

  prevDateButton.addEventListener("click", () => {
    adjustDate(-1);
    renderTimings();
  });

  todayButton.addEventListener("click", () => {
    dateInput.value = toInputDate(new Date());
    renderTimings();
  });

  nextDateButton.addEventListener("click", () => {
    adjustDate(1);
    renderTimings();
  });

  dateInput.addEventListener("change", renderTimings);

  madhabSelect.addEventListener("change", () => {
    prefs.updateSettings({ madhab: madhabSelect.value }, { silent: false });
    renderTimings();
  });

  window.addEventListener("asl:settings-change", () => {
    renderTimings();
  });

  window.addEventListener("asl:focus-current-prayer", (event) => {
    const next = normalizePrayerName(event?.detail?.prayer);
    pendingFocusPrayer = next || "Isha";
    renderTimings();
  });

  boot();
})();
