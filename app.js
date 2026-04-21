(function () {
  const body = document.body;
  const SETTINGS_KEY = "ahlesunnat_settings_v1";

  const DEFAULT_SETTINGS = {
    city: "London",
    country: "Canada",
    madhab: "hanafi"
  };

  const timingsCache = new Map();
  const countdownState = {
    model: null,
    timezone: "America/Toronto",
    locationLabel: "London, Ontario",
    currentPrayerName: "Isha",
    settingsKey: "",
    dateKey: "",
    loading: false,
    hadError: false,
    node: null,
    tickTimer: null,
    refreshTimer: null
  };

  function titleCaseWords(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  function two(value) {
    return String(value).padStart(2, "0");
  }

  function toApiDate(date) {
    return `${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()}`;
  }

  function cleanTime(value) {
    return String(value || "").split(" ")[0].trim();
  }

  function timeToMinutes(time) {
    const [hours, minutes] = String(time).split(":").map(Number);
    return hours * 60 + minutes;
  }

  function minutesToTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const mins = normalized % 60;
    return `${two(hours)}:${two(mins)}`;
  }

  function computeDahwa(sunrise, zuhr) {
    const sunriseMin = timeToMinutes(sunrise);
    const zuhrMin = timeToMinutes(zuhr);
    const midpoint = sunriseMin + Math.round((zuhrMin - sunriseMin) * 0.5);
    return minutesToTime(midpoint);
  }

  function buildTimings(raw) {
    const fajr = cleanTime(raw.Fajr || "05:15");
    const sunrise = cleanTime(raw.Sunrise || "06:42");
    const zuhr = cleanTime(raw.Dhuhr || "13:16");
    const asr = cleanTime(raw.Asr || "16:40");
    const maghrib = cleanTime(raw.Maghrib || "19:52");
    const isha = cleanTime(raw.Isha || "21:12");

    return {
      Fajr: fajr,
      Sunrise: sunrise,
      "Dahwa e Kubra": computeDahwa(sunrise, zuhr),
      Zuhr: zuhr,
      Asr: asr,
      Maghrib: maghrib,
      Isha: isha
    };
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const city = titleCaseWords(source.city || DEFAULT_SETTINGS.city) || DEFAULT_SETTINGS.city;
    const country = titleCaseWords(source.country || DEFAULT_SETTINGS.country) || DEFAULT_SETTINGS.country;
    const madhabRaw = String(source.madhab || DEFAULT_SETTINGS.madhab).toLowerCase();
    const madhab = madhabRaw === "shafi" ? "shafi" : "hanafi";
    return { city, country, madhab };
  }

  function readStoredSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(raw));
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeStoredSettings(settings) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Ignore write errors.
    }
  }

  function getPrayerSettings() {
    return readStoredSettings();
  }

  function updatePrayerSettings(patch) {
    const next = normalizeSettings({ ...getPrayerSettings(), ...(patch || {}) });
    writeStoredSettings(next);
    window.dispatchEvent(new CustomEvent("prayer-settings-changed", { detail: next }));
    return next;
  }

  function formatLocationLabel(settings) {
    const city = settings.city.trim();
    const country = settings.country.trim();
    if (city.toLowerCase() === "london" && country.toLowerCase() === "canada") {
      return "London, Ontario";
    }
    return `${city}, ${country}`;
  }

  function prayerLabel(name, madhab) {
    if (name === "Asr" || name === "Isha") {
      return `${name} (${madhab === "hanafi" ? "Hanafi" : "Shafi"})`;
    }
    return name;
  }

  function schoolFromMadhab(madhab) {
    return madhab === "shafi" ? 0 : 1;
  }

  async function fetchTimingsByCity(date, settings, school) {
    const key = `${toApiDate(date)}|${settings.city.toLowerCase()}|${settings.country.toLowerCase()}|${school}`;
    if (timingsCache.has(key)) return timingsCache.get(key);

    const endpoint = `https://api.aladhan.com/v1/timingsByCity/${toApiDate(date)}?city=${encodeURIComponent(settings.city)}&country=${encodeURIComponent(settings.country)}&method=2&school=${school}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Prayer API failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || payload.code !== 200 || !payload.data || !payload.data.timings) {
      throw new Error("Invalid prayer API response");
    }

    const result = {
      timings: buildTimings(payload.data.timings),
      timezone: payload.data.meta?.timezone || "America/Toronto"
    };

    timingsCache.set(key, result);
    return result;
  }

  async function fetchCombinedTimings(date, settings) {
    const [shafiData, hanafiData] = await Promise.all([
      fetchTimingsByCity(date, settings, 0),
      fetchTimingsByCity(date, settings, 1)
    ]);

    return {
      timezone: hanafiData.timezone || shafiData.timezone || "America/Toronto",
      shafi: { ...shafiData.timings },
      hanafi: { ...hanafiData.timings }
    };
  }

  function getZonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date);

    const value = (type) => Number(parts.find((item) => item.type === type)?.value || 0);
    return {
      year: value("year"),
      month: value("month"),
      day: value("day"),
      hour: value("hour"),
      minute: value("minute"),
      second: value("second")
    };
  }

  function getNowParts(timeZone) {
    try {
      return getZonedParts(new Date(), timeZone);
    } catch (error) {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      };
    }
  }

  function formatDuration(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
  }

  function scheduleEntries(times) {
    return [
      ["Fajr", timeToMinutes(times.Fajr)],
      ["Sunrise", timeToMinutes(times.Sunrise)],
      ["Dahwa e Kubra", timeToMinutes(times["Dahwa e Kubra"])],
      ["Zuhr", timeToMinutes(times.Zuhr)],
      ["Asr", timeToMinutes(times.Asr)],
      ["Maghrib", timeToMinutes(times.Maghrib)],
      ["Isha", timeToMinutes(times.Isha)]
    ];
  }

  function getCurrentAndNext(times, nowParts, madhab) {
    const entries = scheduleEntries(times);
    const nowSeconds = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;

    // From midnight until Fajr, keep the running period as Isha.
    let currentName = "Isha";
    let nextName = entries[0][0];
    let nextMinutes = entries[0][1];

    if (nowSeconds >= entries[0][1] * 60) {
      for (let i = 0; i < entries.length; i += 1) {
        const current = entries[i];
        const next = entries[i + 1];
        if (!next || (nowSeconds >= current[1] * 60 && nowSeconds < next[1] * 60)) {
          currentName = current[0];
          if (next) {
            nextName = next[0];
            nextMinutes = next[1];
          } else {
            nextName = entries[0][0];
            nextMinutes = entries[0][1];
          }
          break;
        }
      }
    }

    let secondsToNext = nextMinutes * 60 - nowSeconds;
    if (secondsToNext <= 0) {
      secondsToNext += 24 * 3600;
    }

    return {
      currentName,
      nextName,
      currentLabel: prayerLabel(currentName, madhab),
      nextLabel: prayerLabel(nextName, madhab),
      secondsToNext
    };
  }

  function formatEnglishDate(date) {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function formatDayName(date) {
    return new Intl.DateTimeFormat("en-CA", {
      weekday: "long"
    }).format(date);
  }

  function formatHijriDate(date) {
    try {
      return new Intl.DateTimeFormat("en-GB-u-ca-islamic", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(date);
    } catch (error) {
      return "Hijri date unavailable";
    }
  }

  function populateDates() {
    const today = new Date();
    const englishNode = document.getElementById("englishDate");
    const hijriNode = document.getElementById("hijriDate");
    const dayNode = document.getElementById("dayName");

    if (englishNode) englishNode.textContent = formatEnglishDate(today);
    if (hijriNode) hijriNode.textContent = formatHijriDate(today);
    if (dayNode) dayNode.textContent = formatDayName(today);

    document.querySelectorAll(".js-year").forEach((node) => {
      node.textContent = String(today.getFullYear());
    });
  }

  function initReveal() {
    const revealItems = document.querySelectorAll(".reveal");
    if (!revealItems.length) return;

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("show"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("show");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealItems.forEach((item) => observer.observe(item));
  }

  function initTransitions() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    document.querySelectorAll("a[href]").forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (anchor.target === "_blank") return;
        if (anchor.hasAttribute("download")) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

        let targetUrl;
        try {
          targetUrl = new URL(anchor.href, window.location.href);
        } catch (error) {
          return;
        }

        if (targetUrl.origin !== window.location.origin) return;

        const currentPath = window.location.pathname.replace(/\/$/, "");
        const targetPath = targetUrl.pathname.replace(/\/$/, "");
        if (currentPath === targetPath && targetUrl.hash) return;

        event.preventDefault();
        body.classList.add("page-leave");
        window.setTimeout(() => {
          window.location.href = targetUrl.href;
        }, 190);
      });
    });
  }

  function initMobileNav() {
    document.querySelectorAll(".nav").forEach((nav) => {
      const toggle = nav.querySelector(".nav-toggle");
      const linksWrap = nav.querySelector(".nav-links");
      if (!toggle || !linksWrap) return;

      const closeMenu = () => {
        nav.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      };

      toggle.addEventListener("click", () => {
        const willOpen = !nav.classList.contains("nav-open");
        nav.classList.toggle("nav-open", willOpen);
        toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      linksWrap.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 980) {
          closeMenu();
        }
      });
    });
  }

  function ensureCountdownNode() {
    if (countdownState.node) return countdownState.node;
    const dateWrap = document.querySelector(".date-wrap");
    if (!dateWrap) return null;

    let node = document.getElementById("prayerCountdown");
    if (!node) {
      node = document.createElement("button");
      node.type = "button";
      node.id = "prayerCountdown";
      node.className = "date-pill prayer-countdown";
      node.title = "Open Namaz Timing";
      node.textContent = "Loading prayer countdown...";
      dateWrap.appendChild(node);
    } else if (node.parentElement !== dateWrap) {
      dateWrap.appendChild(node);
    }

    countdownState.node = node;
    return node;
  }

  function ensureLocationNode() {
    let node = document.getElementById("locationPill");
    const dateWrap = document.querySelector(".date-wrap");
    if (!dateWrap) return null;
    const countdownNode = ensureCountdownNode();

    if (!node) {
      node = document.createElement("button");
      node.type = "button";
      node.id = "locationPill";
      node.className = "date-pill location-pill";
      node.textContent = `${formatLocationLabel(getPrayerSettings())}`;
      if (countdownNode && countdownNode.parentElement === dateWrap) {
        dateWrap.insertBefore(node, countdownNode);
      } else {
        dateWrap.appendChild(node);
      }
    } else if (node.parentElement !== dateWrap) {
      if (countdownNode && countdownNode.parentElement === dateWrap) {
        dateWrap.insertBefore(node, countdownNode);
      } else {
        dateWrap.appendChild(node);
      }
    }
    return node;
  }

  function updateLocationNode() {
    const node = ensureLocationNode();
    if (!node) return;
    const settings = getPrayerSettings();
    node.textContent = `${formatLocationLabel(settings)}`;
  }

  function initLocationQuickEdit() {
    const node = ensureLocationNode();
    if (!node || node.dataset.bound === "1") return;

    node.dataset.bound = "1";
    node.title = "Tap to change location";

    node.addEventListener("click", () => {
      const current = getPrayerSettings();
      const nextCountry = window.prompt("Enter country", current.country);
      if (nextCountry === null) return;

      const nextCity = window.prompt("Enter city", current.city);
      if (nextCity === null) return;

      if (!nextCity.trim() || !nextCountry.trim()) {
        return;
      }

      updatePrayerSettings({ city: nextCity, country: nextCountry });
    });
  }

  function focusRunningPrayerInNamazPage() {
    const prayer = countdownState.currentPrayerName || "Isha";
    window.dispatchEvent(new CustomEvent("focus-current-prayer", { detail: { prayer } }));
  }

  function openNamazTimingFromCountdown() {
    const prayer = countdownState.currentPrayerName || "Isha";

    if (body.classList.contains("page-namaz")) {
      focusRunningPrayerInNamazPage();
      return;
    }

    const targetUrl = new URL("namaz-timings.html", window.location.href);
    targetUrl.searchParams.set("focus", prayer);
    targetUrl.searchParams.set("from", "header");

    body.classList.add("page-leave");
    window.setTimeout(() => {
      window.location.href = targetUrl.href;
    }, 170);
  }

  function initMobileBrandText() {
    const isMobile = window.matchMedia("(max-width: 700px)").matches;
    document.querySelectorAll(".brand strong").forEach((node) => {
      const original = node.dataset.original || node.textContent.trim();
      if (!node.dataset.original) {
        node.dataset.original = original;
      }

      if (isMobile) {
        node.innerHTML = "AHLE SUNNAT<span class=\"brand-mobile-city\">London, ON.</span>";
      } else {
        node.textContent = node.dataset.original;
      }
    });
  }

  function renderPrayerCountdown() {
    const node = ensureCountdownNode();
    if (!node) return;

    if (!countdownState.model) {
      node.textContent = countdownState.hadError ? "Namaz countdown unavailable" : "Loading prayer countdown...";
      return;
    }

    const settings = getPrayerSettings();
    const nowParts = getNowParts(countdownState.timezone);
    const dateKey = `${nowParts.year}-${two(nowParts.month)}-${two(nowParts.day)}`;

    if (dateKey !== countdownState.dateKey) {
      refreshCountdownModel(true);
    }

    const activeTimings = settings.madhab === "shafi" ? countdownState.model.shafi : countdownState.model.hanafi;
    const status = getCurrentAndNext(activeTimings, nowParts, settings.madhab);
    countdownState.currentPrayerName = status.currentName;

    node.textContent = `Now: ${status.currentLabel} | Next: ${status.nextLabel} in ${formatDuration(status.secondsToNext)}`;
  }

  async function refreshCountdownModel(force) {
    const settings = getPrayerSettings();
    const settingsKey = `${settings.city.toLowerCase()}|${settings.country.toLowerCase()}|${settings.madhab}`;
    const locationLabel = formatLocationLabel(settings);

    const nowForZone = getNowParts(countdownState.timezone);
    const requestDate = new Date(nowForZone.year, nowForZone.month - 1, nowForZone.day);
    const dateKey = `${nowForZone.year}-${two(nowForZone.month)}-${two(nowForZone.day)}`;

    if (!force && countdownState.model && countdownState.settingsKey === settingsKey && countdownState.dateKey === dateKey) {
      countdownState.locationLabel = locationLabel;
      return;
    }

    if (countdownState.loading) return;
    countdownState.loading = true;

    try {
      const combined = await fetchCombinedTimings(requestDate, settings);
      countdownState.model = combined;
      countdownState.timezone = combined.timezone;
      countdownState.settingsKey = settingsKey;
      countdownState.dateKey = dateKey;
      countdownState.locationLabel = locationLabel;
      countdownState.hadError = false;
    } catch (error) {
      countdownState.model = null;
      countdownState.hadError = true;
      countdownState.locationLabel = locationLabel;
    } finally {
      countdownState.loading = false;
      updateLocationNode();
      renderPrayerCountdown();
    }
  }

  function initPrayerCountdown() {
    const node = ensureCountdownNode();
    if (!node) return;

    if (node.dataset.boundNav !== "1") {
      node.dataset.boundNav = "1";
      node.addEventListener("click", openNamazTimingFromCountdown);
    }

    refreshCountdownModel(true);
    updateLocationNode();

    if (countdownState.tickTimer) clearInterval(countdownState.tickTimer);
    if (countdownState.refreshTimer) clearInterval(countdownState.refreshTimer);

    countdownState.tickTimer = window.setInterval(renderPrayerCountdown, 1000);
    countdownState.refreshTimer = window.setInterval(() => refreshCountdownModel(false), 45000);

    window.addEventListener("prayer-settings-changed", () => {
      updateLocationNode();
      refreshCountdownModel(true);
    });

    window.addEventListener("storage", (event) => {
      if (event.key === SETTINGS_KEY) {
        updateLocationNode();
        refreshCountdownModel(true);
      }
    });
  }

  function navigationType() {
    const entry = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType("navigation")[0]
      : null;
    if (entry && entry.type) return entry.type;
    return "navigate";
  }

  async function reverseGeocodeLocation(latitude, longitude) {
    const endpoint = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Reverse geocode failed (${response.status})`);
    }

    const payload = await response.json();
    const cityRaw =
      payload?.city ||
      payload?.locality ||
      payload?.principalSubdivision ||
      payload?.localityInfo?.administrative?.[2]?.name ||
      "";
    const countryRaw = payload?.countryName || "";

    const city = titleCaseWords(cityRaw);
    const country = titleCaseWords(countryRaw);

    if (!city || !country) {
      throw new Error("Incomplete reverse geocode response");
    }

    return { city, country };
  }

  function initReloadAutoLocation() {
    if (navigationType() !== "reload") return;
    if (!("geolocation" in navigator)) return;
    if (!window.isSecureContext) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const liveLocation = await reverseGeocodeLocation(latitude, longitude);
          const current = getPrayerSettings();

          if (
            current.city.toLowerCase() === liveLocation.city.toLowerCase() &&
            current.country.toLowerCase() === liveLocation.country.toLowerCase()
          ) {
            return;
          }

          updatePrayerSettings({ city: liveLocation.city, country: liveLocation.country });
        } catch (error) {
          // Keep existing saved location if reverse geocode fails.
        }
      },
      () => {
        // Keep existing saved location if user denies permission.
      },
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 10 * 60 * 1000
      }
    );
  }

  function initDonationPopup() {
    // Show on Home loads, and on reload for every page.
    const navType = navigationType();
    if (!body.classList.contains("page-home") && navType !== "reload") return;
    if (document.getElementById("donationPopup")) return;

    const popup = document.createElement("aside");
    popup.id = "donationPopup";
    popup.className = "donation-popup";

    popup.innerHTML = [
      "<h4>Support Our Work</h4>",
      "<p>Interac e-Transfer donation ID</p>",
      "<code class=\"popup-id\" id=\"popupInterac\">AHLESUNNATLONDON@GMAIL.COM</code>",
      "<div class=\"popup-actions\">",
      "  <button class=\"popup-copy\" type=\"button\" id=\"popupCopy\">Copy ID</button>",
      "  <button class=\"popup-close\" type=\"button\" id=\"popupClose\" aria-label=\"Close\">&times;</button>",
      "</div>",
      "<div class=\"popup-status\" id=\"popupStatus\"></div>"
    ].join("");

    body.appendChild(popup);

    const codeNode = document.getElementById("popupInterac");
    const statusNode = document.getElementById("popupStatus");
    const copyBtn = document.getElementById("popupCopy");
    const closeBtn = document.getElementById("popupClose");

    if (copyBtn && codeNode && statusNode) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(codeNode.textContent.trim());
          statusNode.textContent = "Interac ID copied.";
        } catch (error) {
          statusNode.textContent = "Copy failed. Please copy manually.";
        }

        window.setTimeout(() => {
          statusNode.textContent = "";
        }, 2500);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        popup.classList.add("hidden");
      });
    }
  }

  window.SiteUtils = {
    formatEnglishDate,
    formatHijriDate,
    formatDayName
  };

  window.PrayerPrefs = {
    getSettings: getPrayerSettings,
    updateSettings: updatePrayerSettings,
    defaults: { ...DEFAULT_SETTINGS },
    formatLocationLabel,
    prayerLabel,
    schoolFromMadhab,
    fetchTimingsByCity,
    fetchCombinedTimings,
    getNowParts
  };

  window.addEventListener("DOMContentLoaded", () => {
    populateDates();
    initReveal();
    initMobileBrandText();
    initMobileNav();
    initTransitions();
    initPrayerCountdown();
    initLocationQuickEdit();
    initReloadAutoLocation();
    initDonationPopup();
    requestAnimationFrame(() => body.classList.add("page-ready"));
  });

  window.addEventListener("resize", initMobileBrandText);
})();
