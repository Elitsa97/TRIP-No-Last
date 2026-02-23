// static/js/admin_history.js
(function () {
  const $ = (s, c=document) => c.querySelector(s);
  const tbody = $('#history-body');

  function rowHTML(r) {
    const esc = (v) => (v ?? '').toString();
    return `
      <tr>
        <td>${esc(r.username)}</td>
        <td>${esc(r.order_no)}</td>
        <td>${esc(r.hub)}</td>
        <td>${esc(r.start_day)}</td>
        <td>${esc(r.start_time)}</td>
        <td>${esc(r.end_day || '')}</td>
        <td>${esc(r.end_time || '')}</td>
        <td>${Number(r.minutes ?? 0)}</td>
      </tr>
    `;
  }

  async function loadHistory() {
    const order = $('#f-order').value.trim();
    const uname = $('#f-username').value.trim();
    const from  = $('#f-from').value;
    const to    = $('#f-to').value;

    const params = new URLSearchParams();
    if (order) params.set('order_no', order);
    if (uname) params.set('username', uname);
    if (from)  params.set('from', from);
    if (to)    params.set('to', to);

    try {
      const res = await fetch('/admin/history_data?' + params.toString(), { headers: { 'Accept': 'application/json' }});
      const data = await res.json();
      if (!data.ok) {
        tbody.innerHTML = `<tr><td class="no-data" colspan="8">${(data.error || 'Грешка при зареждане.')}</td></tr>`;
        return;
      }
      const rows = data.results || [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td class="no-data" colspan="8">Няма данни по зададените филтри.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(rowHTML).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td class="no-data" colspan="8">Грешка: ${e.message}</td></tr>`;
    }
  }

  // Приложи / Изчисти
  $('#btn-apply').addEventListener('click', (ev) => { ev.preventDefault(); loadHistory(); });
  $('#btn-clear').addEventListener('click', (ev) => {
    ev.preventDefault();
    $('#f-order').value = '';
    $('#f-username').value = '';
    $('#f-from').value = '';
    $('#f-to').value = '';
    loadHistory();
  });

  // Авто зареждане при влизане
  document.addEventListener('DOMContentLoaded', loadHistory);
})();