(() => {
  "use strict";

  const SETTINGS_KEY = "asl_settings_v4";
  const DEFAULT_SETTINGS = {
    city: "London",
    country: "Canada",
    madhab: "hanafi",
    manualLocation: false
  };

  const timingsCache = new Map();

  const countdownState = {
    model: null,
    timezone: "America/Toronto",
    currentPrayer: "Isha",
    currentSettingsKey: "",
    currentDateKey: "",
    loading: false,
    hadError: false,
    tickTimer: null,
    refreshTimer: null,
    dateTimer: null
  };

  function two(value) {
    return String(value).padStart(2, "0");
  }

  function titleCaseWords(input) {
    return String(input || "")
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  function normalizeMadhab(value) {
    return String(value || "").toLowerCase() === "shafi" ? "shafi" : "hanafi";
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const city = titleCaseWords(source.city || DEFAULT_SETTINGS.city) || DEFAULT_SETTINGS.city;
    const country = titleCaseWords(source.country || DEFAULT_SETTINGS.country) || DEFAULT_SETTINGS.country;
    const madhab = normalizeMadhab(source.madhab);
    const manualLocation = Boolean(source.manualLocation);

    return {
      city,
      country,
      madhab,
      manualLocation
    };
  }

  function getSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(raw));
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeSettings(settings) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Ignore localStorage write failures.
    }
  }

  function updateSettings(patch, options = {}) {
    const current = getSettings();
    const next = normalizeSettings({ ...current, ...(patch || {}) });
    writeSettings(next);

    if (!options.silent) {
      window.dispatchEvent(new CustomEvent("asl:settings-change", { detail: next }));
    }

    return next;
  }

  function formatLocationLabel(settings) {
    return `${settings.city}, ${settings.country}`;
  }

  function toApiDate(date) {
    return `${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()}`;
  }

  function cleanTime(value) {
    return String(value || "").split(" ")[0].trim();
  }

  function timeToMinutes(time24) {
    const [h, m] = String(time24).split(":").map(Number);
    return h * 60 + m;
  }

  function minutesToTime(totalMinutes) {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${two(hours)}:${two(minutes)}`;
  }

  function formatTime12(time24) {
    const [h, m] = String(time24).split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${two(m)} ${period}`;
  }

  function computeDahwa(sunrise, zuhr) {
    const sunriseMin = timeToMinutes(sunrise);
    const zuhrMin = timeToMinutes(zuhr);
    const midpoint = sunriseMin + Math.round((zuhrMin - sunriseMin) / 2);
    return minutesToTime(midpoint);
  }

  function prayerLabel(prayerName, madhab) {
    if (prayerName === "Asr" || prayerName === "Isha") {
      return `${prayerName} (${madhab === "shafi" ? "Shafi" : "Hanafi"})`;
    }
    return prayerName;
  }

  function getZonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const pick = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);

    return {
      year: pick("year"),
      month: pick("month"),
      day: pick("day"),
      hour: pick("hour"),
      minute: pick("minute"),
      second: pick("second")
    };
  }

  function getNowParts(timeZone) {
    try {
      return getZonedParts(new Date(), timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
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

  function buildTimings(rawTimings) {
    const fajr = cleanTime(rawTimings.Fajr);
    const sunrise = cleanTime(rawTimings.Sunrise);
    const zuhr = cleanTime(rawTimings.Dhuhr);
    const asr = cleanTime(rawTimings.Asr);
    const maghrib = cleanTime(rawTimings.Maghrib);
    const isha = cleanTime(rawTimings.Isha);

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

  async function fetchTimingsByCity(date, settings, school) {
    const safeSchool = school === 0 ? 0 : 1;
    const cacheKey = `${toApiDate(date)}|${settings.city.toLowerCase()}|${settings.country.toLowerCase()}|${safeSchool}`;

    if (timingsCache.has(cacheKey)) {
      return timingsCache.get(cacheKey);
    }

    const url = `https://api.aladhan.com/v1/timingsByCity/${toApiDate(date)}?city=${encodeURIComponent(settings.city)}&country=${encodeURIComponent(settings.country)}&method=2&school=${safeSchool}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Prayer API request failed (${response.status})`);
    }

    const payload = await response.json();
    const data = payload?.data;

    if (!payload || payload.code !== 200 || !data || !data.timings) {
      throw new Error("Prayer API returned invalid data");
    }

    const model = {
      timings: buildTimings(data.timings),
      timezone: data.meta?.timezone || "America/Toronto",
      hijri: data.date?.hijri || null
    };

    timingsCache.set(cacheKey, model);
    return model;
  }

  async function fetchCombinedTimings(date, settings) {
    const [shafiData, hanafiData] = await Promise.all([
      fetchTimingsByCity(date, settings, 0),
      fetchTimingsByCity(date, settings, 1)
    ]);

    return {
      timezone: hanafiData.timezone || shafiData.timezone || "America/Toronto",
      shafi: { ...shafiData.timings },
      hanafi: { ...hanafiData.timings },
      hijri: hanafiData.hijri || shafiData.hijri || null
    };
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

  function getCurrentPrayerStatus(times, nowParts) {
    const rows = scheduleEntries(times);
    const nowSeconds = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;

    // Default from midnight until Fajr.
    let current = "Isha";
    let next = rows[0][0];
    let nextTime = rows[0][1];

    if (nowSeconds >= rows[0][1] * 60) {
      for (let i = 0; i < rows.length; i += 1) {
        const active = rows[i];
        const following = rows[i + 1];

        if (!following || (nowSeconds >= active[1] * 60 && nowSeconds < following[1] * 60)) {
          current = active[0];
          next = following ? following[0] : rows[0][0];
          nextTime = following ? following[1] : rows[0][1];
          break;
        }
      }
    }

    let secondsToNext = nextTime * 60 - nowSeconds;
    if (secondsToNext <= 0) secondsToNext += 24 * 3600;

    return {
      current,
      next,
      nextTime,
      secondsToNext
    };
  }

  function formatDuration(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
  }

  function formatEnglishDate(date, timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function formatDayName(date, timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      weekday: "long"
    }).format(date);
  }

  function formatHijriDate(date, timeZone) {
    try {
      return new Intl.DateTimeFormat("en-GB-u-ca-islamic", {
        timeZone,
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(date);
    } catch (error) {
      return "Hijri date unavailable";
    }
  }

  function updateDatePills() {
    const now = new Date();
    const tz = countdownState.timezone;

    const englishNode = document.getElementById("englishDate");
    const hijriNode = document.getElementById("hijriDate");
    const dayNode = document.getElementById("dayName");

    if (englishNode) englishNode.textContent = formatEnglishDate(now, tz);
    if (hijriNode) hijriNode.textContent = formatHijriDate(now, tz);
    if (dayNode) dayNode.textContent = formatDayName(now, tz);
  }

  function updateYearText() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll(".js-year").forEach((node) => {
      node.textContent = year;
    });
  }

  function initReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;

    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("show"));
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

    nodes.forEach((node) => observer.observe(node));
  }

  function initMobileNav() {
    const toggle = document.getElementById("navToggle");
    const nav = document.getElementById("primaryNav");
    if (!toggle || !nav) return;

    function closeMenu() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
      const willOpen = !nav.classList.contains("open");
      nav.classList.toggle("open", willOpen);
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) closeMenu();
    });
  }

  function setActiveNavLink() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;

      const normalizedHref = href.split("/").pop();
      if (normalizedHref === path) {
        link.setAttribute("aria-current", "page");
      } else if (link.getAttribute("aria-current") === "page") {
        link.removeAttribute("aria-current");
      }
    });
  }

  function initBackToTop() {
    const button = document.getElementById("backToTop");
    if (!button) return;

    function onScroll() {
      if (window.scrollY > 280) {
        button.classList.add("show");
      } else {
        button.classList.remove("show");
      }
    }

    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function getLocationPill() {
    return document.getElementById("locationPill");
  }

  function getCountdownPill() {
    return document.getElementById("prayerCountdown");
  }

  function renderLocationPill() {
    const node = getLocationPill();
    if (!node) return;
    node.textContent = formatLocationLabel(getSettings());
  }

  function openLocationPrompt() {
    const current = getSettings();
    const nextCountry = window.prompt("Enter country", current.country);
    if (nextCountry === null) return;

    const nextCity = window.prompt("Enter city", current.city);
    if (nextCity === null) return;

    if (!nextCity.trim() || !nextCountry.trim()) return;

    updateSettings(
      {
        city: nextCity,
        country: nextCountry,
        manualLocation: true
      },
      { silent: false }
    );
  }

  function openNamazFromCountdown() {
    const prayer = countdownState.currentPrayer || "Isha";

    if (document.body.classList.contains("page-namaz")) {
      window.dispatchEvent(new CustomEvent("asl:focus-current-prayer", { detail: { prayer } }));
      return;
    }

    const target = new URL("namaz-timings.html", window.location.href);
    target.searchParams.set("focus", prayer);
    target.hash = "current-prayer-section";
    window.location.href = target.toString();
  }

  function bindHeaderActions() {
    const locationPill = getLocationPill();
    const countdownPill = getCountdownPill();

    if (locationPill && locationPill.dataset.bound !== "1") {
      locationPill.dataset.bound = "1";
      locationPill.addEventListener("click", openLocationPrompt);
    }

    if (countdownPill && countdownPill.dataset.bound !== "1") {
      countdownPill.dataset.bound = "1";
      countdownPill.addEventListener("click", openNamazFromCountdown);
    }
  }

  async function refreshCountdownModel(force = false) {
    if (countdownState.loading) return;

    const settings = getSettings();
    const settingsKey = `${settings.city.toLowerCase()}|${settings.country.toLowerCase()}|${settings.madhab}`;

    const nowInZone = getNowParts(countdownState.timezone);
    const requestDate = new Date(nowInZone.year, nowInZone.month - 1, nowInZone.day);
    const dateKey = `${nowInZone.year}-${two(nowInZone.month)}-${two(nowInZone.day)}`;

    if (
      !force &&
      countdownState.model &&
      countdownState.currentSettingsKey === settingsKey &&
      countdownState.currentDateKey === dateKey
    ) {
      return;
    }

    countdownState.loading = true;

    try {
      const model = await fetchCombinedTimings(requestDate, settings);
      countdownState.model = model;
      countdownState.timezone = model.timezone;
      countdownState.currentSettingsKey = settingsKey;
      countdownState.currentDateKey = dateKey;
      countdownState.hadError = false;
    } catch (error) {
      countdownState.model = null;
      countdownState.hadError = true;
    } finally {
      countdownState.loading = false;
      updateDatePills();
      renderLocationPill();
      renderCountdownPill();
    }
  }

  function renderCountdownPill() {
    const node = getCountdownPill();
    if (!node) return;

    if (!countdownState.model) {
      node.textContent = countdownState.hadError ? "Prayer timings unavailable" : "Loading prayer countdown...";
      return;
    }

    const settings = getSettings();
    const active = settings.madhab === "shafi" ? countdownState.model.shafi : countdownState.model.hanafi;
    const nowParts = getNowParts(countdownState.timezone);
    const status = getCurrentPrayerStatus(active, nowParts);

    countdownState.currentPrayer = status.current;

    node.textContent = `Now: ${prayerLabel(status.current, settings.madhab)} | Next: ${prayerLabel(status.next, settings.madhab)} in ${formatDuration(status.secondsToNext)}`;
  }

  function startCountdownLoop() {
    if (countdownState.tickTimer) clearInterval(countdownState.tickTimer);
    if (countdownState.refreshTimer) clearInterval(countdownState.refreshTimer);
    if (countdownState.dateTimer) clearInterval(countdownState.dateTimer);

    countdownState.tickTimer = window.setInterval(renderCountdownPill, 1000);
    countdownState.refreshTimer = window.setInterval(() => refreshCountdownModel(false), 45000);
    countdownState.dateTimer = window.setInterval(updateDatePills, 60000);
  }

  function initContactFormPlaceholder() {
    const form = document.getElementById("contactForm");
    const feedback = document.getElementById("contactFeedback");
    if (!form || !feedback) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        feedback.className = "form-feedback error show";
        feedback.textContent = "Please complete all required fields before submitting.";
        return;
      }

      feedback.className = "form-feedback success show";
      feedback.textContent = "Message draft captured. This form is currently front-end only and ready for backend integration.";
      form.reset();
    });
  }

  function initDonateCopyButton() {
    const button = document.getElementById("copyDonateEmail");
    const codeNode = document.getElementById("donateEmailText");
    const feedback = document.getElementById("copyDonateFeedback");

    if (!button || !codeNode || !feedback) return;

    button.addEventListener("click", async () => {
      const value = codeNode.textContent.trim();

      try {
        await navigator.clipboard.writeText(value);
        feedback.textContent = "Donation email copied successfully.";
      } catch (error) {
        feedback.textContent = "Could not copy automatically. Please copy manually.";
      }

      window.setTimeout(() => {
        feedback.textContent = "";
      }, 2800);
    });
  }

  function createDonationPopup() {
    if (document.getElementById("donationPopup")) return;

    const popup = document.createElement("aside");
    popup.id = "donationPopup";
    popup.className = "donation-popup";
    popup.setAttribute("aria-label", "Donation quick action");
    popup.innerHTML = [
      "<h4>Support Ahle Sunnat London</h4>",
      "<p>Interac e-Transfer donation email</p>",
      '<div class="popup-email" id="popupDonateEmail">AHLESUNNATLONDON@GMAIL.COM</div>',
      '<div class="popup-actions">',
      '  <button class="popup-copy" id="popupDonateCopy" type="button">Copy Email</button>',
      '  <button class="popup-close" id="popupDonateClose" type="button" aria-label="Close donation popup">×</button>',
      "</div>",
      '<div class="popup-feedback" id="popupDonateFeedback" aria-live="polite"></div>'
    ].join("");

    document.body.appendChild(popup);

    const copyButton = document.getElementById("popupDonateCopy");
    const closeButton = document.getElementById("popupDonateClose");
    const emailNode = document.getElementById("popupDonateEmail");
    const feedbackNode = document.getElementById("popupDonateFeedback");

    if (copyButton && emailNode && feedbackNode) {
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(emailNode.textContent.trim());
          feedbackNode.textContent = "Donation email copied.";
        } catch (error) {
          feedbackNode.textContent = "Copy failed. Please copy manually.";
        }

        window.setTimeout(() => {
          feedbackNode.textContent = "";
        }, 2400);
      });
    }

    if (closeButton) {
      closeButton.addEventListener("click", () => {
        popup.classList.add("hidden");
      });
    }
  }

  function initDonationPopup() {
    createDonationPopup();
  }

  async function reverseGeocode(latitude, longitude) {
    const endpoint = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed (${response.status})`);
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
      throw new Error("Could not detect city/country from current location");
    }

    return { city, country };
  }

  function maybeAutoLocate() {
    const current = getSettings();

    if (current.manualLocation) return;
    if (!("geolocation" in navigator)) return;
    if (!window.isSecureContext) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const live = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          const nowSettings = getSettings();

          if (
            nowSettings.city.toLowerCase() === live.city.toLowerCase() &&
            nowSettings.country.toLowerCase() === live.country.toLowerCase()
          ) {
            return;
          }

          updateSettings(
            {
              city: live.city,
              country: live.country,
              manualLocation: false
            },
            { silent: false }
          );
        } catch (error) {
          // Keep default/saved location silently.
        }
      },
      () => {
        // User denied permission or unavailable. Keep saved location.
      },
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 10 * 60 * 1000
      }
    );
  }

  function bindGlobalEvents() {
    window.addEventListener("asl:settings-change", () => {
      renderLocationPill();
      refreshCountdownModel(true);
    });

    window.addEventListener("storage", (event) => {
      if (event.key === SETTINGS_KEY) {
        renderLocationPill();
        refreshCountdownModel(true);
      }
    });
  }

  function init() {
    updateYearText();
    updateDatePills();
    renderLocationPill();

    setActiveNavLink();
    initMobileNav();
    initReveal();
    initBackToTop();
    initContactFormPlaceholder();
    initDonateCopyButton();
    initDonationPopup();

    bindHeaderActions();
    bindGlobalEvents();
    maybeAutoLocate();

    refreshCountdownModel(true);
    startCountdownLoop();

    window.requestAnimationFrame(() => {
      document.body.classList.add("page-ready");
    });
  }

  window.PrayerPrefs = {
    getSettings,
    updateSettings,
    normalizeSettings,
    formatLocationLabel,
    prayerLabel,
    fetchTimingsByCity,
    fetchCombinedTimings,
    getNowParts,
    formatTime12
  };

  window.ASLSite = {
    getSettings,
    updateSettings,
    formatLocationLabel,
    prayerLabel,
    formatTime12,
    getNowParts,
    getCurrentPrayerStatus,
    fetchCombinedTimings
  };

  window.addEventListener("DOMContentLoaded", init);
})();
