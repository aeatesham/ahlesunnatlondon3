(function () {
  const monthSelect = document.getElementById("monthSelect");
  const yearSelect = document.getElementById("yearSelect");
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  const todayBtn = document.getElementById("goToday");
  const caption = document.getElementById("calendarCaption");
  const grid = document.getElementById("calendarGrid");

  if (!monthSelect || !yearSelect || !prevBtn || !nextBtn || !todayBtn || !caption || !grid) return;

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth();
  let todayFlashTimer = null;

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  const hijriFormatter = new Intl.DateTimeFormat("en-u-ca-islamic", {
    day: "numeric",
    month: "short"
  });

  monthNames.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name;
    monthSelect.appendChild(option);
  });

  for (let year = 1900; year <= 2100; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  }

  function hijriLabel(date) {
    try {
      const parts = hijriFormatter.formatToParts(date);
      const day = parts.find((part) => part.type === "day")?.value || "";
      const month = parts.find((part) => part.type === "month")?.value || "";
      return `${day} ${month}`.trim();
    } catch (error) {
      return "Hijri";
    }
  }

  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function createDayCell(date, muted) {
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (muted) cell.classList.add("muted");
    if (sameDate(date, now)) cell.classList.add("today");

    const gDay = document.createElement("div");
    gDay.className = "g-day";
    gDay.textContent = String(date.getDate());

    const hDay = document.createElement("div");
    hDay.className = "h-day";
    hDay.textContent = hijriLabel(date);

    cell.appendChild(gDay);
    cell.appendChild(hDay);
    return cell;
  }

  function renderCalendar() {
    grid.innerHTML = "";

    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const lastOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = lastOfMonth.getDate();

    caption.textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDay - 1; i >= 0; i -= 1) {
      const date = new Date(currentYear, currentMonth - 1, prevMonthLastDate - i);
      grid.appendChild(createDayCell(date, true));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(currentYear, currentMonth, day);
      grid.appendChild(createDayCell(date, false));
    }

    const cells = grid.children.length;
    const trailing = (7 - (cells % 7)) % 7;
    for (let day = 1; day <= trailing; day += 1) {
      const date = new Date(currentYear, currentMonth + 1, day);
      grid.appendChild(createDayCell(date, true));
    }

    monthSelect.value = String(currentMonth);
    yearSelect.value = String(currentYear);
  }

  function flashTodayCell() {
    const todayCell = grid.querySelector(".day-cell.today");
    if (!todayCell) return;

    todayCell.classList.add("flash");
    if (todayFlashTimer) clearTimeout(todayFlashTimer);
    todayFlashTimer = window.setTimeout(() => {
      todayCell.classList.remove("flash");
    }, 5000);
  }

  function shiftMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear -= 1;
    }
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear += 1;
    }
    renderCalendar();
  }

  monthSelect.addEventListener("change", () => {
    currentMonth = Number(monthSelect.value);
    renderCalendar();
  });

  yearSelect.addEventListener("change", () => {
    currentYear = Number(yearSelect.value);
    renderCalendar();
  });

  prevBtn.addEventListener("click", () => shiftMonth(-1));
  nextBtn.addEventListener("click", () => shiftMonth(1));

  todayBtn.addEventListener("click", () => {
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
    flashTodayCell();
  });

  renderCalendar();
})();
