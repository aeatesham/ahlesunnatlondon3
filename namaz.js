(function () {
  const prefs = window.PrayerPrefs;

  const dateInput = document.getElementById("prayerDate");
  const prevBtn = document.getElementById("prevDate");
  const nextBtn = document.getElementById("nextDate");
  const todayBtn = document.getElementById("todayDate");
  const madhabSelect = document.getElementById("madhabSelect");

  const countryInput = document.getElementById("countryInput");
  const cityInput = document.getElementById("cityInput");
  const applyLocationBtn = document.getElementById("applyLocation");

  const locationHeading = document.getElementById("locationHeading");
  const liveTitle = document.getElementById("liveTitle");
  const currentPrayerBox = document.getElementById("currentPrayerBox");
  const liveMeta = document.getElementById("liveMeta");
  const prayerRows = document.getElementById("prayerRows");
  const loadMessage = document.getElementById("loadMessage");

  if (
    !prefs ||
    !dateInput ||
    !prevBtn ||
    !nextBtn ||
    !todayBtn ||
    !madhabSelect ||
    !countryInput ||
    !cityInput ||
    !applyLocationBtn ||
    !currentPrayerBox ||
    !prayerRows
  ) {
    return;
  }

  const timingsCache = new Map();

  function two(num) {
    return String(num).padStart(2, "0");
  }

  function toInputDate(date) {
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  }

  function parseInputDate(value) {
    return new Date(`${value}T00:00:00`);
  }

  function displayTime(time24) {
    const [hours, mins] = String(time24).split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${two(mins)} ${period}`;
  }

  function timeToMinutes(time24) {
    const [hours, mins] = String(time24).split(":").map(Number);
    return hours * 60 + mins;
  }

  function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function getNowParts(timeZone) {
    return prefs.getNowParts(timeZone);
  }

  function localDateFromParts(parts) {
    return new Date(parts.year, parts.month - 1, parts.day);
  }

  function locationLabel(settings) {
    return prefs.formatLocationLabel(settings);
  }

  function setStatusMessage(text, isError) {
    loadMessage.textContent = text;
    loadMessage.style.color = isError ? "#8e3d32" : "var(--ink-700)";
  }

  async function getTimingsModel(date, settings) {
    const key = `${toInputDate(date)}|${settings.city.toLowerCase()}|${settings.country.toLowerCase()}`;
    if (timingsCache.has(key)) return timingsCache.get(key);

    try {
      const combined = await prefs.fetchCombinedTimings(date, settings);
      const model = {
        source: "live",
        timezone: combined.timezone,
        hanafi: combined.hanafi,
        shafi: combined.shafi
      };
      timingsCache.set(key, model);
      return model;
    } catch (error) {
      return null;
    }
  }

  function currentPrayerStatus(times, nowParts) {
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    const rows = [
      ["Fajr", timeToMinutes(times.Fajr)],
      ["Sunrise", timeToMinutes(times.Sunrise)],
      ["Dahwa e Kubra", timeToMinutes(times["Dahwa e Kubra"])],
      ["Zuhr", timeToMinutes(times.Zuhr)],
      ["Asr", timeToMinutes(times.Asr)],
      ["Maghrib", timeToMinutes(times.Maghrib)],
      ["Isha", timeToMinutes(times.Isha)]
    ];

    if (nowMinutes < rows[0][1]) {
      return { current: "Isha", next: rows[0][0], nextTime: rows[0][1] };
    }

    for (let i = 0; i < rows.length; i += 1) {
      const current = rows[i];
      const next = rows[i + 1];
      if (!next || (nowMinutes >= current[1] && nowMinutes < next[1])) {
        return {
          current: current[0],
          next: next ? next[0] : rows[0][0],
          nextTime: next ? next[1] : rows[0][1]
        };
      }
    }

    return { current: "Isha", next: "Fajr", nextTime: rows[0][1] };
  }

  function buildRows(times, currentPrayerName, highlightCurrent, madhab) {
    const rows = [
      ["Fajr", times.Fajr],
      ["Sunrise", times.Sunrise],
      ["Dahwa e Kubra", times["Dahwa e Kubra"]],
      ["Zuhr", times.Zuhr],
      ["Asr", times.Asr],
      ["Maghrib", times.Maghrib],
      ["Isha", times.Isha]
    ];

    prayerRows.innerHTML = "";

    rows.forEach(([name, value]) => {
      const tr = document.createElement("tr");
      if (highlightCurrent && name === currentPrayerName) {
        tr.classList.add("prayer-row-current");
      }

      const nameCell = document.createElement("td");
      const strong = document.createElement("strong");
      strong.className = "prayer-name";
      strong.textContent = prefs.prayerLabel(name, madhab);
      nameCell.appendChild(strong);

      const timeCell = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "prayer-time-pill";
      pill.textContent = displayTime(value);
      timeCell.appendChild(pill);

      tr.appendChild(nameCell);
      tr.appendChild(timeCell);
      prayerRows.appendChild(tr);
    });
  }

  function syncControls(settings) {
    countryInput.value = settings.country;
    cityInput.value = settings.city;
    madhabSelect.value = settings.madhab;
    locationHeading.textContent = locationLabel(settings);
  }

  function adjustDateBy(days) {
    const selected = parseInputDate(dateInput.value);
    selected.setDate(selected.getDate() + days);
    dateInput.value = toInputDate(selected);
  }

  async function renderSelectedDate() {
    const settings = prefs.getSettings();
    const madhab = settings.madhab === "shafi" ? "shafi" : "hanafi";
    const selectedDate = parseInputDate(dateInput.value);

    syncControls(settings);

    const selectedModel = await getTimingsModel(selectedDate, settings);
    if (!selectedModel) {
      setStatusMessage("No results found.", true);
      return;
    }

    const nowParts = getNowParts(selectedModel.timezone);
    const liveDate = localDateFromParts(nowParts);
    const liveModel = await getTimingsModel(liveDate, settings);

    if (!liveModel) {
      setStatusMessage("No results found.", true);
      return;
    }

    const selectedTimes = selectedModel[madhab];
    const liveTimes = liveModel[madhab];

    const liveStatus = currentPrayerStatus(liveTimes, nowParts);
    const currentLabel = prefs.prayerLabel(liveStatus.current, madhab);
    const nextLabel = prefs.prayerLabel(liveStatus.next, madhab);

    const nowTime = displayTime(`${two(nowParts.hour)}:${two(nowParts.minute)}`);
    const nextTime = displayTime(`${two(Math.floor(liveStatus.nextTime / 60))}:${two(liveStatus.nextTime % 60)}`);

    liveTitle.textContent = `Current Time (${locationLabel(settings)}): ${nowTime}`;
    currentPrayerBox.textContent = `Current running prayer: ${currentLabel}`;
    liveMeta.textContent = `Next: ${nextLabel} at ${nextTime}`;

    const highlightCurrent = isSameDate(selectedDate, liveDate);
    const selectedStatus = currentPrayerStatus(selectedTimes, nowParts);
    buildRows(selectedTimes, selectedStatus.current, highlightCurrent, madhab);

    setStatusMessage("", false);
  }

  applyLocationBtn.addEventListener("click", () => {
    const city = cityInput.value.trim();
    const country = countryInput.value.trim();

    if (!city || !country) {
      setStatusMessage("No results found.", true);
      return;
    }

    timingsCache.clear();
    prefs.updateSettings({ city, country });
    renderSelectedDate();
  });

  prevBtn.addEventListener("click", () => {
    adjustDateBy(-1);
    renderSelectedDate();
  });

  nextBtn.addEventListener("click", () => {
    adjustDateBy(1);
    renderSelectedDate();
  });

  todayBtn.addEventListener("click", () => {
    dateInput.value = toInputDate(new Date());
    renderSelectedDate();
  });

  dateInput.addEventListener("change", renderSelectedDate);

  madhabSelect.addEventListener("change", () => {
    prefs.updateSettings({ madhab: madhabSelect.value === "shafi" ? "shafi" : "hanafi" });
    renderSelectedDate();
  });

  window.addEventListener("prayer-settings-changed", () => {
    renderSelectedDate();
  });

  (function boot() {
    const settings = prefs.getSettings();
    dateInput.value = toInputDate(new Date());
    syncControls(settings);
    renderSelectedDate();
  })();
})();
