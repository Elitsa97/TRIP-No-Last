// // static/js/operator_home.js
// (() => {
//   // --- DOM къси помощници
//   const $  = id => document.getElementById(id);

//   // --- Елементи
//   const ordersList = $("ordersList");   // контейнер за активните TRIP-ове (долу)
//   const emptyList  = $("emptyList");    // "Няма активни"
//   const inputMain  = $("new-order");    // поле горе за TRIP-
//   const btnStart   = $("btnStart");     // бутон "Старт" горе
//   const status     = $("statusText");   // статус текст горе
// //   const bigTimer   = $("bigTimer");     // голям таймер горе

//   // --- Константи и локално състояние
//   const DEFAULT_PREFIX = "TRIP-";
//   const prefixLen = DEFAULT_PREFIX.length;
//   const timers = new Map();  // order_no -> { start_ts, intervalId, rowEls }
//   let currentOrd = null;     // <-- ТЕКУЩ АКТИВЕН TRIP за bigTimer

//   // =========================
//   // Utils
//   // =========================

//   function ensurePrefix(val) {
//     const raw = (val || "").trim();
//     if (!raw) return DEFAULT_PREFIX;
//     if (raw.startsWith(DEFAULT_PREFIX)) return raw;
//     return DEFAULT_PREFIX + raw.replace(/^TRIP-+/i, "");
//   }

//   function fmtBG(iso) {
//     if (!iso) return '';
//     const d = new Date(iso);
//     return d.toLocaleString('bg-BG');
//   }

//   function minutesSince(iso) {
//     const start = new Date(iso);
//     const now = new Date();
//     return Math.max(0, Math.floor((now - start) / 60000));
//   }

//   function setEmptyState() {
//     const hasRows = ordersList.children.length > 0;
//     emptyList.style.display = hasRows ? "none" : "block";
//   }

//   // =========================
//   // Входно поле горе – TRIP- guard (не може да се изтрива или препокрива)
//   // =========================

//   document.addEventListener("DOMContentLoaded", () => {
//     if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
//     // позиционирай курсора след префикса
//     inputMain.setSelectionRange(prefixLen, prefixLen);
//   });

//   inputMain.addEventListener("input", () => {
//     const v = ensurePrefix(inputMain.value);
//     const selEnd = inputMain.selectionEnd ?? v.length;
//     inputMain.value = v;
//     if (selEnd < prefixLen) inputMain.setSelectionRange(prefixLen, prefixLen);
//   });

//   inputMain.addEventListener("keydown", (e) => {
//     const selStart = inputMain.selectionStart ?? 0;
//     const selEnd   = inputMain.selectionEnd ?? 0;
//     const inPrefix = selStart <= prefixLen && selEnd <= prefixLen;

//     if ((e.key === "Backspace" && inPrefix) || (e.key === "Delete" && selStart < prefixLen)) {
//       e.preventDefault();
//       inputMain.setSelectionRange(prefixLen, prefixLen);
//       return;
//     }
//     if (e.key === "Home") {
//       e.preventDefault();
//       inputMain.setSelectionRange(prefixLen, prefixLen);
//       return;
//     }
//     if (e.key === "Enter") {
//       e.preventDefault();
//       btnStart.click();
//       return;
//     }
//   });

//   inputMain.addEventListener("paste", (e) => {
//     e.preventDefault();
//     const clip = (e.clipboardData || window.clipboardData).getData("text") || "";
//     const normalized = ensurePrefix(clip);
//     inputMain.value = normalized;
//     inputMain.setSelectionRange(prefixLen + (normalized.length - prefixLen), prefixLen + (normalized.length - prefixLen));
//   });

//   inputMain.addEventListener("blur", () => {
//     inputMain.value = ensurePrefix(inputMain.value);
//   });

//   // =========================
//   // Рендер на активен ред долу
//   // =========================

//   function renderActiveRow(ord, startIso) {
//     const existing = ordersList.querySelector(`.order-row[data-order="${ord}"]`);
//     if (existing) return existing;

//     const row = document.createElement("div");
//     row.className = "order-row";
//     row.dataset.order = ord;

//     // Ред 1: TRIP + бутони
//     const r1 = document.createElement("div");
//     r1.className = "row";

//     const label = document.createElement("span");
//     label.innerHTML = `<strong>TRIP:</strong> ${ord}`;

//     const bStart = document.createElement("button");
//     bStart.className = "btn start";
//     bStart.textContent = "Начало";
//     bStart.disabled = true; // активен е

//     const bStop = document.createElement("button");
//     bStop.className = "btn stop";
//     bStop.textContent = "Край";

//     r1.appendChild(label);
//     // r1.appendChild(bStart);
//     r1.appendChild(bStop);

//     // Ред 2: статус + таймер
//     const r2 = document.createElement("div");
//     r2.className = "row";
//     const stat = document.createElement("span");
//     stat.className = "muted";
//     stat.textContent = `Старт: ${fmtBG(startIso)}`;
//     const tEl = document.createElement("span");
//     tEl.className = "timer";
//     tEl.textContent = "0 мин";
//     r2.appendChild(stat);
//     r2.appendChild(tEl);

//     row.appendChild(r1);
//     row.appendChild(r2);
//     ordersList.prepend(row);
//     setEmptyState();

//     // Тик-тик визуализация
//     const tick = () => {
//       const m = minutesSince(startIso);
//       tEl.textContent = `${m} мин`;
//       // Обновявай големия таймер, ако това е текущият активен TRIP
//       if (currentOrd === ord) {
//         bigTimer.textContent = `${m} мин`;
//       }
//     };
//     tick();
//     const intervalId = setInterval(tick, 1000);

//     timers.set(ord, { start_ts: startIso, intervalId, rowEls: { row, stat, tEl, bStart, bStop } });

//     // КРАЙ – спира конкретния TRIP
//     bStop.addEventListener("click", async () => {
//       const res = await fetch("/stop", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ order_no: ord })
//       });
//       const data = await res.json();
//       if (!data.ok) return alert(data.error || "Грешка при спиране.");

//       // Обнови статуса на реда
//       stat.textContent = `Край: ${fmtBG(data.end_ts)} (мин.: ${data.minutes ?? 0})`;
//       tEl.textContent   = `${data.minutes ?? 0} мин`;

//       // Спри тиктакането и махни реда
//       const t = timers.get(ord);
//       if (t?.intervalId) clearInterval(t.intervalId);
//       timers.delete(ord);
//       row.remove();
//       setEmptyState();

//       // Ако текущият активен беше този TRIP – покажи край горе
//       if (currentOrd === ord) {
//         status.textContent   = `Край: ${fmtBG(data.end_ts)} (мин.: ${data.minutes ?? 0})`;
//         bigTimer.textContent = `${data.minutes ?? 0} мин`;
//         // по желание: currentOrd = null;
//       }
//     });

//     return row;
//   }

//   // =========================
//   // ГОРЕ – Старт на нов TRIP (и връщане на полето към TRIP-)
//   // =========================

//   btnStart.addEventListener("click", async () => {
//     const ordRaw = inputMain.value.trim();
//     const ord = ensurePrefix(ordRaw);
//     if (!ord) return alert("Въведи номер на TRIP-а.");

//     // забрани втори старт за същия TRIP
//     if (timers.has(ord) || ordersList.querySelector(`.order-row[data-order="${ord}"]`)) {
//       return alert("Този TRIP вече е активен.");
//     }

//     const res = await fetch("/start", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ order_no: ord })
//     });
//     const data = await res.json();
//     if (!data.ok) return alert(data.error || "Грешка при старт.");

//     // Задай текущ активен TRIP за големия таймер
//     currentOrd = ord;

//     // Върни полето към TRIP- и позиционирай курсора след префикса
//     inputMain.value = DEFAULT_PREFIX;
//     inputMain.setSelectionRange(prefixLen, prefixLen);

//     // Обнови горния статус и таймер
//     status.textContent   = `Старт: ${fmtBG(data.start_ts)}`;
//     // bigTimer.textContent = "0 мин";

//     // Създай ред долу
//     renderActiveRow(ord, data.start_ts);
//   });

//   // =========================
//   // Зареждане на активните от сървъра
//   // =========================

//   async function loadActive() {
//     try {
//       const res = await fetch("/active", { headers: { "Accept": "application/json" } });
//       if (res.status === 401) return (window.location.href = "/login");
//       const data = await res.json();
//       if (!data.ok) return;

//       // Ресетни визуализацията и таймерите
//       ordersList.innerHTML = "";
//       timers.forEach(t => t.intervalId && clearInterval(t.intervalId));
//       timers.clear();

//       const arr = data.active || [];
//       if (!arr.length) {
//         setEmptyState();
//         if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
//         inputMain.setSelectionRange(prefixLen, prefixLen);
//         status.textContent   = "Няма активна сесия.";
//         bigTimer.textContent = "0 мин";
//         currentOrd = null;
//         return;
//       }

//       // Рендерирай активните
//       arr.forEach(a => {
//         const ord = ensurePrefix(a.order_no);
//         renderActiveRow(ord, a.start_ts);
//       });

//       // Насочи големия таймер към първия активен, но НЕ променяй полето (остави TRIP-)
//       currentOrd = ensurePrefix(arr[0].order_no);
//       status.textContent   = `Старт: ${fmtBG(arr[0].start_ts)}`;
//       bigTimer.textContent = `${minutesSince(arr[0].start_ts)} мин`;

//       // Полето остава TRIP- за следващ нов TRIP
//       if (inputMain.value !== DEFAULT_PREFIX) {
//         inputMain.value = DEFAULT_PREFIX;
//       }
//       inputMain.setSelectionRange(prefixLen, prefixLen);
//     } catch (e) {
//       console.error("Грешка при /active:", e);
//     }
//   }

//   document.addEventListener("DOMContentLoaded", async () => {
//     await loadActive();
//     if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
//     inputMain.setSelectionRange(prefixLen, prefixLen);
//   });

//   document.addEventListener("visibilitychange", () => {
//     if (document.visibilityState === "visible") {
//       // локално опресни таймерите
//       timers.forEach(t => {
//         const m = minutesSince(t.start_ts);
//         t.rowEls?.tEl && (t.rowEls.tEl.textContent = `${m} мин`);
//         if (currentOrd && t.rowEls?.row?.dataset.order === currentOrd) {
//           bigTimer.textContent = `${m} мин`;
//         }
//       });
//       // синхронизирай от сървъра
//       loadActive();
//     }
//   });

// })();

// static/js/operator_home.js
(() => {
  // --- DOM къси помощници
  const $  = id => document.getElementById(id);

  // --- Елементи
  const ordersList = $("ordersList");   // контейнер за активните TRIP-ове (долу)
  const emptyList  = $("emptyList");    // "Няма активни"
  const inputMain  = $("new-order");    // поле горе за TRIP-
  const btnStart   = $("btnStart");     // бутон "Старт" горе
  const status     = $("statusText");   // статус текст горе
  // bigTimer го нямаме вече

  // --- Константи и локално състояние
  const DEFAULT_PREFIX = "TRIP-";
  const prefixLen = DEFAULT_PREFIX.length;
  const timers = new Map();  // order_no -> { start_ts, intervalId, rowEls }

  // =========================
  // Utils
  // =========================

  function ensurePrefix(val) {
    const raw = (val || "").trim();
    if (!raw) return DEFAULT_PREFIX;
    if (raw.startsWith(DEFAULT_PREFIX)) return raw;
    return DEFAULT_PREFIX + raw.replace(/^TRIP-+/i, "");
  }

  function fmtBG(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('bg-BG');
  }

  function minutesSince(iso) {
    const start = new Date(iso);
    const now = new Date();
    return Math.max(0, Math.floor((now - start) / 60000));
  }

  function setEmptyState() {
    const hasRows = ordersList.children.length > 0;
    emptyList.style.display = hasRows ? "none" : "block";
  }

  // =========================
  // Входно поле горе – TRIP guard
  // =========================

  document.addEventListener("DOMContentLoaded", () => {
    if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
    inputMain.setSelectionRange(prefixLen, prefixLen);
  });

  inputMain.addEventListener("input", () => {
    const v = ensurePrefix(inputMain.value);
    const selEnd = inputMain.selectionEnd ?? v.length;
    inputMain.value = v;
    if (selEnd < prefixLen) inputMain.setSelectionRange(prefixLen, prefixLen);
  });

  inputMain.addEventListener("keydown", (e) => {
    const selStart = inputMain.selectionStart ?? 0;
    const selEnd   = inputMain.selectionEnd ?? 0;
    const inPrefix = selStart <= prefixLen && selEnd <= prefixLen;

    if ((e.key === "Backspace" && inPrefix) || (e.key === "Delete" && selStart < prefixLen)) {
      e.preventDefault();
      inputMain.setSelectionRange(prefixLen, prefixLen);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      inputMain.setSelectionRange(prefixLen, prefixLen);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      btnStart.click();
      return;
    }
  });

  inputMain.addEventListener("paste", (e) => {
    e.preventDefault();
    const clip = (e.clipboardData || window.clipboardData).getData("text") || "";
    const normalized = ensurePrefix(clip);
    inputMain.value = normalized;
    inputMain.setSelectionRange(prefixLen + (normalized.length - prefixLen), prefixLen + (normalized.length - prefixLen));
  });

  inputMain.addEventListener("blur", () => {
    inputMain.value = ensurePrefix(inputMain.value);
  });

  // =========================
  // Рендер на активен ред долу
  // =========================

  function renderActiveRow(ord, startIso) {
    const existing = ordersList.querySelector(`.order-row[data-order="${ord}"]`);
    if (existing) return existing;

    const row = document.createElement("div");
    row.className = "order-row";
    row.dataset.order = ord;

    // Ред 1: TRIP + бутони
    const r1 = document.createElement("div");
    r1.className = "row";

    const label = document.createElement("span");
    label.innerHTML = `<strong>TRIP:</strong> ${ord}`;

    const bStart = document.createElement("button");
    bStart.className = "btn start";
    bStart.textContent = "Начало";
    bStart.disabled = true; // активен е

    const bStop = document.createElement("button");
    bStop.className = "btn stop";
    bStop.textContent = "Край";

    r1.appendChild(label);
    // r1.appendChild(bStart);
    r1.appendChild(bStop);

    // Ред 2: статус + таймер
    const r2 = document.createElement("div");
    r2.className = "row";
    const stat = document.createElement("span");
    stat.className = "muted";
    stat.textContent = `Старт: ${fmtBG(startIso)}`;
    const tEl = document.createElement("span");
    tEl.className = "timer";
    tEl.textContent = "0 мин";
    r2.appendChild(stat);
    r2.appendChild(tEl);

    row.appendChild(r1);
    row.appendChild(r2);
    ordersList.prepend(row);
    setEmptyState();

    // Тик-тик визуализация за този ред
    const tick = () => {
      const m = minutesSince(startIso);
      tEl.textContent = `${m} мин`;
    };
    tick();
    const intervalId = setInterval(tick, 1000);

    timers.set(ord, { start_ts: startIso, intervalId, rowEls: { row, stat, tEl, bStart, bStop } });

    // КРАЙ – спира конкретния TRIP
    bStop.addEventListener("click", async () => {
      const res = await fetch("/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_no: ord })
      });
      const data = await res.json();
      if (!data.ok) return alert(data.error || "Грешка при спиране.");

      // Обнови статуса на реда
      stat.textContent = `Край: ${fmtBG(data.end_ts)} (мин.: ${data.minutes ?? 0})`;
      tEl.textContent   = `${data.minutes ?? 0} мин`;

      // Спри тиктакането и махни реда
      const t = timers.get(ord);
      if (t?.intervalId) clearInterval(t.intervalId);
      timers.delete(ord);
      row.remove();
      setEmptyState();

      // Горе показваме само текстов статус (без таймер)
      status.textContent = `Край: ${fmtBG(data.end_ts)} (мин.: ${data.minutes ?? 0})`;
    });

    return row;
  }

  // =========================
  // ГОРЕ – Старт на нов TRIP
  // =========================

  btnStart.addEventListener("click", async () => {
    const ordRaw = inputMain.value.trim();
    const ord = ensurePrefix(ordRaw);
    if (!ord) return alert("Въведи номер на TRIP-а.");

    // забрани втори старт за същия TRIP
    if (timers.has(ord) || ordersList.querySelector(`.order-row[data-order="${ord}"]`)) {
      return alert("Този TRIP вече е активен.");
    }

    const res = await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_no: ord })
    });
    const data = await res.json();
    if (!data.ok) return alert(data.error || "Грешка при старт.");

    // Върни полето към TRIP- и позиционирай курсора след префикса
    inputMain.value = DEFAULT_PREFIX;
    inputMain.setSelectionRange(prefixLen, prefixLen);

    // Горе показваме само "Старт: ..." (без таймер)
    status.textContent = `Старт: ${fmtBG(data.start_ts)}`;

    // Създай ред долу (с таймер само там)
    renderActiveRow(ord, data.start_ts);
  });

  // =========================
  // Зареждане на активните от сървъра
  // =========================

  async function loadActive() {
    try {
      const res = await fetch("/active", { headers: { "Accept": "application/json" } });
      if (res.status === 401) return (window.location.href = "/login");
      const data = await res.json();
      if (!data.ok) return;

      // Ресетни визуализацията и таймерите
      ordersList.innerHTML = "";
      timers.forEach(t => t.intervalId && clearInterval(t.intervalId));
      timers.clear();

      const arr = data.active || [];
      if (!arr.length) {
        setEmptyState();
        if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
        inputMain.setSelectionRange(prefixLen, prefixLen);
        status.textContent = "Няма активна сесия.";
        return;
      }

      // Рендерирай активните
      arr.forEach(a => {
        const ord = ensurePrefix(a.order_no);
        renderActiveRow(ord, a.start_ts);
      });

      // Горе – само текстов статус (без таймер)
      status.textContent = `Старт: ${fmtBG(arr[0].start_ts)}`;

      // Полето остава TRIP- за следващ нов TRIP
      if (inputMain.value !== DEFAULT_PREFIX) {
        inputMain.value = DEFAULT_PREFIX;
      }
      inputMain.setSelectionRange(prefixLen, prefixLen);
    } catch (e) {
      console.error("Грешка при /active:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadActive();
    if (!inputMain.value) inputMain.value = DEFAULT_PREFIX;
    inputMain.setSelectionRange(prefixLen, prefixLen);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // локално опресни таймерите (само в редовете)
      timers.forEach(t => {
        const m = minutesSince(t.start_ts);
        t.rowEls?.tEl && (t.rowEls.tEl.textContent = `${m} мин`);
      });
      // синхронизирай от сървъра
      loadActive();
    }
  });

})();