// UI: всеки ред = една поръчка със собствен Старт/Край
const $ = (id) => document.getElementById(id);
const ordersList = $("ordersList");

// Локална карта само за визуализация на таймера (не пазим нищо при refresh)
const timers = new Map(); // order_no -> { start_ts, intervalId, timerEl }

function minutesSince(iso) {
  const start = new Date(iso);
  const now = new Date();
  return Math.max(0, Math.round((now - start) / 60000));
}

function fmtBG(iso) {
  // Показва ден и час за България (пример: 30.01.2026, 15:45:10)
  const d = new Date(iso);
  return d.toLocaleString('bg-BG');
}

function createOrderRow(orderNo = "") {

  const DEFAULT_PREFIX = "TRIP-";

  // ако няма предварително подадена поръчка – започни с TRIP-
  if (!orderNo) {
    orderNo = DEFAULT_PREFIX;
  } else if (!orderNo.startsWith(DEFAULT_PREFIX)) {
    orderNo = DEFAULT_PREFIX + orderNo;
  }


  const wrapper = document.createElement("div");
  wrapper.className = "order-row";

  const row1 = document.createElement("div");
  row1.className = "row";

  const label = document.createElement("label");
  label.innerHTML = "<strong>TRIP:</strong>";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "order-id";
  input.placeholder = "TRIP-";
  input.value = orderNo;
  input.autocomplete = "off";

  const btnStart = document.createElement("button");
  btnStart.textContent = "Старт";
  const btnStop = document.createElement("button");
  btnStop.textContent = "Край";
  btnStop.disabled = true;

  row1.appendChild(label);
  row1.appendChild(input);
  row1.appendChild(btnStart);
  row1.appendChild(btnStop);

  const row2 = document.createElement("div");
  row2.className = "row";
  const status = document.createElement("span");
  status.className = "muted";
  status.textContent = "Няма активна сесия.";
  const timerEl = document.createElement("span");
  timerEl.className = "timer";
  timerEl.textContent = "0 мин";
  row2.appendChild(status);
  row2.appendChild(timerEl);

  wrapper.appendChild(row1);
  wrapper.appendChild(row2);
  ordersList.prepend(wrapper);

  
  // 🛡️ Не позволявай префиксът да бъде изтрит или модифициран
  input.addEventListener("input", () => {
    let v = input.value || "";
    if (!v.startsWith(DEFAULT_PREFIX)) {
      // ако е изтрит префиксът – върни го
      // ако е пейстнато нещо друго – залепи префикса отпред
      // махаме водещи/повтарящи префикси
      const raw = v.replace(/^TRIP-+/i, ""); // премахва TRIP- ако е удвоен
      v = DEFAULT_PREFIX + raw.replace(/^TRIP-+/i, "");
    }
    input.value = v;
  });

  input.addEventListener("keydown", (e) => {
    // Забрани backspace/delete когато курсорът е в зоната на префикса
    const prefixLen = DEFAULT_PREFIX.length;
    const selStart = input.selectionStart ?? 0;
    const selEnd = input.selectionEnd ?? 0;

    const isDeletingPrefix =
      (e.key === "Backspace" && selStart <= prefixLen && selEnd <= prefixLen) ||
      (e.key === "Delete" && selStart < prefixLen);

    if (isDeletingPrefix) {
      e.preventDefault();
      // позиционираме курсора точно след префикса
      input.setSelectionRange(prefixLen, prefixLen);
    }
  });


  // Старт за този ред
  btnStart.addEventListener("click", async () => {
    const ord = input.value.trim();
    if (!ord) {
      alert("Въведи номер на TRIP-a.");
      return;
    }
    if (timers.has(ord)) {
      alert("Този TRIP вече е стартиран.");
      return;
    }
    const res = await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_no: ord })
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Грешка при старт.");
      return;
    }
    input.readOnly = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    status.textContent = `Старт: ${fmtBG(data.start_ts)}`;
    const tick = () => { timerEl.textContent = minutesSince(data.start_ts) + " мин"; };
    tick();
    const id = setInterval(tick, 1000);
    timers.set(ord, { start_ts: data.start_ts, intervalId: id, timerEl });
  });

  // Край за този ред
  btnStop.addEventListener("click", async () => {
    const ord = input.value.trim();
    if (!ord) {
      alert("Няма въведен TRIP.");
      return;
    }
    const res = await fetch("/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_no: ord })
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "Грешка при спиране.");
      return;
    }
    btnStart.disabled = false;
    btnStop.disabled = true;
    input.readOnly = false;
    status.textContent = `Край: ${fmtBG(data.end_ts)}`;
    timerEl.textContent = `${data.minutes} мин`;

    const t = timers.get(ord);
    if (t && t.intervalId) clearInterval(t.intervalId);
    timers.delete(ord);
  });

  return { wrapper, input, btnStart, btnStop, status, timerEl };
}



async function loadActiveSessions() {
  try {
    const res = await fetch("/active");
    if (res.status === 401) {
      // ако сесията е изтекла, върни към логин
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    if (!data.ok) return;

    // за всяка активна поръчка: ако не е визуализирана, добави ред и стартирай UI таймера
    data.active.forEach(a => {
      const ord = a.order_no;
      if (timers.has(ord)) return; // вече е показан и тече

      const row = createOrderRow(ord);
      row.input.readOnly = true;
      row.btnStart.disabled = true;
      row.btnStop.disabled = false;
      row.status.textContent = `Старт: ${fmtBG(a.start_ts)}`;

      const tick = () => { row.timerEl.textContent = minutesSince(a.start_ts) + " мин"; };
      tick();
      const id = setInterval(tick, 1000);
      timers.set(ord, { start_ts: a.start_ts, intervalId: id, timerEl: row.timerEl });
    });
  } catch (err) {
    console.error("Грешка при loadActiveSessions:", err);
  }
}

// --- При първоначално зареждане: възстанови активните и добави един празен ред ---
document.addEventListener("DOMContentLoaded", async () => {
  await loadActiveSessions();
  // // Добавяме един празен ред, за да можеш директно да стартираш нов TRIP-
  // createOrderRow("");
});

// --- При връщане към таба: освежи показанието и провери за нови активни от сървъра ---
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    // освежи визуализацията за вече стартираните
    timers.forEach((t) => {
      t.timerEl.textContent = minutesSince(t.start_ts) + " мин";
    });
    // презареди активните от сървъра (ако са стартирани от друг таб/устройство)
    await loadActiveSessions();
  }
});


// Горе – бутон „Добави поръчка“
$("btnAddOrder").addEventListener("click", () => {
  createOrderRow("");
});


$("btnReportAll").addEventListener("click", async () => {
  const order = $("reportOrder").value.trim();
  const url = order
    ? `/report?order_no=${encodeURIComponent(order)}&group_by=both`
    : `/report?group_by=both`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) return $("reportBox").textContent = JSON.stringify(data, null, 2);
  let txt = "Минути (всички потребители):\n";
  data.results.forEach(r => {
    txt += `${r.username} | ${r.order_no || "(без TRIP)"}: ${r.total_minutes}\n`;
  });
  $("reportBox").textContent = txt || "Няма данни.";
});

// Начално – добавяме един празен ред (без авто-възстановяване)
createOrderRow("");