(() => {
  "use strict";

  const monthSelect = document.getElementById("monthSelect");
  const yearSelect = document.getElementById("yearSelect");
  const prevButton = document.getElementById("prevMonth");
  const nextButton = document.getElementById("nextMonth");
  const todayButton = document.getElementById("goToday");
  const caption = document.getElementById("calendarCaption");
  const grid = document.getElementById("calendarGrid");

  if (!monthSelect || !yearSelect || !prevButton || !nextButton || !todayButton || !caption || !grid) {
    return;
  }

  const today = new Date();
  let activeYear = today.getFullYear();
  let activeMonth = today.getMonth();
  let flashTimer = null;

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

  function sameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function buildMonthOptions() {
    monthNames.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      monthSelect.appendChild(option);
    });
  }

  function buildYearOptions() {
    for (let year = 1900; year <= 2100; year += 1) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      yearSelect.appendChild(option);
    }
  }

  function getHijriLabel(date) {
    try {
      const parts = hijriFormatter.formatToParts(date);
      const day = parts.find((part) => part.type === "day")?.value || "";
      const month = parts.find((part) => part.type === "month")?.value || "";
      return `${day} ${month}`.trim();
    } catch (error) {
      return "Hijri";
    }
  }

  function createDayCell(date, isMuted) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    if (isMuted) {
      cell.classList.add("calendar-day--muted");
    }

    if (sameDate(date, today)) {
      cell.classList.add("calendar-day--today");
      cell.dataset.today = "1";
    }

    const gregNode = document.createElement("div");
    gregNode.className = "calendar-day-greg";
    gregNode.textContent = String(date.getDate());

    const hijriNode = document.createElement("div");
    hijriNode.className = "calendar-day-hijri";
    hijriNode.textContent = getHijriLabel(date);

    cell.appendChild(gregNode);
    cell.appendChild(hijriNode);

    return cell;
  }

  function renderCalendar() {
    grid.innerHTML = "";

    const firstOfMonth = new Date(activeYear, activeMonth, 1);
    const lastOfMonth = new Date(activeYear, activeMonth + 1, 0);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = lastOfMonth.getDate();

    caption.textContent = `${monthNames[activeMonth]} ${activeYear}`;

    const prevMonthLastDate = new Date(activeYear, activeMonth, 0).getDate();
    for (let i = startDay - 1; i >= 0; i -= 1) {
      const date = new Date(activeYear, activeMonth - 1, prevMonthLastDate - i);
      grid.appendChild(createDayCell(date, true));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(activeYear, activeMonth, day);
      grid.appendChild(createDayCell(date, false));
    }

    const totalCells = grid.children.length;
    const trailing = (7 - (totalCells % 7)) % 7;

    for (let day = 1; day <= trailing; day += 1) {
      const date = new Date(activeYear, activeMonth + 1, day);
      grid.appendChild(createDayCell(date, true));
    }

    monthSelect.value = String(activeMonth);
    yearSelect.value = String(activeYear);
  }

  function flashTodayCell() {
    const todayCell = grid.querySelector(".calendar-day[data-today='1']");
    if (!todayCell) return;

    todayCell.classList.add("calendar-day--flash");

    if (flashTimer) {
      clearTimeout(flashTimer);
    }

    flashTimer = window.setTimeout(() => {
      todayCell.classList.remove("calendar-day--flash");
    }, 5000);
  }

  function shiftMonth(delta) {
    activeMonth += delta;

    if (activeMonth < 0) {
      activeMonth = 11;
      activeYear -= 1;
    }

    if (activeMonth > 11) {
      activeMonth = 0;
      activeYear += 1;
    }

    renderCalendar();
  }

  monthSelect.addEventListener("change", () => {
    activeMonth = Number(monthSelect.value);
    renderCalendar();
  });

  yearSelect.addEventListener("change", () => {
    activeYear = Number(yearSelect.value);
    renderCalendar();
  });

  prevButton.addEventListener("click", () => shiftMonth(-1));
  nextButton.addEventListener("click", () => shiftMonth(1));

  todayButton.addEventListener("click", () => {
    activeYear = today.getFullYear();
    activeMonth = today.getMonth();
    renderCalendar();
    flashTodayCell();
  });

  buildMonthOptions();
  buildYearOptions();
  renderCalendar();
})();
