// static/js/admin_users.js
// (function () {
//   const $ = (sel, ctx = document) => ctx.querySelector(sel);
//   const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

//   function toast(msg) {
//     // Може да се замени с по-хубав toast; за сега alert
//     alert(msg);
//   }

//   function openDialog(id) {
//     const dlg = document.getElementById(id);
//     if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
//     else toast('Браузърът не поддържа системни диалози.');
//   }
//   function closeDialog(id) {
//     const dlg = document.getElementById(id);
//     if (dlg) dlg.close();
//   }

//   // --- DELETE ---
//   async function deleteUser(username, withHistory) {
//     const txt = withHistory
//       ? `Да изтрия ${username} и неговата история?`
//       : `Да изтрия акаунта на ${username} (историята остава)?`;
//     if (!confirm(txt)) return;

//     try {
//       const r = await fetch('/admin/users/delete', {
//         method: 'POST',
//         headers: {'Content-Type': 'application/json'},
//         body: JSON.stringify({ username, with_history: !!withHistory })
//       });
//       const j = await r.json();
//       if (!j.ok) throw new Error(j.error || 'Грешка');
//       location.reload();
//     } catch (e) { toast(e.message); }
//   }

//   // --- RENAME ---
//   function openRenameDialog(username) {
//     $('#old-username').value = username;
//     $('#new-username').value = username;
//     openDialog('dlg-rename');
//   }
//   async function submitRename() {
//     const oldU = $('#old-username').value.trim();
//     const newU = $('#new-username').value.trim();
//     if (!newU || newU === oldU) return toast('Въведи различно ново име.');
//     try {
//       const r = await fetch('/admin/users/rename', {
//         method: 'POST',
//         headers: {'Content-Type':'application/json'},
//         body: JSON.stringify({ old_username: oldU, new_username: newU })
//       });
//       const j = await r.json();
//       if (!j.ok) throw new Error(j.error || 'Грешка');
//       closeDialog('dlg-rename');
//       location.reload();
//     } catch (e) { toast(e.message); }
//   }

//   // --- RESET PASSWORD ---
//   function openPwdDialog(username) {
//     $('#pwd-username').value = username;
//     $('#pwd-newpass').value = '';
//     openDialog('dlg-pwd');
//   }
//   async function submitPwd() {
//     const username = $('#pwd-username').value.trim();
//     const newpass  = $('#pwd-newpass').value;
//     if (!newpass || newpass.length < 6) return toast('Паролата трябва да е поне 6 символа.');
//     try {
//       const r = await fetch('/admin/users/reset_password', {
//         method:'POST',
//         headers:{'Content-Type':'application/json'},
//         body: JSON.stringify({ username, new_password: newpass })
//       });
//       const j = await r.json();
//       if (!j.ok) throw new Error(j.error || 'Грешка');
//       closeDialog('dlg-pwd');
//       toast('Паролата е сменена.');
//     } catch (e) { toast(e.message); }
//   }

//   // --- Event Delegation за супер админ бутоните (таблица/карти) ---
//   document.addEventListener('click', (ev) => {
//     const btn = ev.target.closest('button');
//     if (!btn) return;

//     // Преименуване
//     if (btn.classList.contains('act-rename')) {
//       const username = btn.dataset.username || btn.closest('[data-username]')?.dataset.username;
//       if (username) openRenameDialog(username);
//     }

//     // Смяна парола
//     if (btn.classList.contains('act-reset-pwd')) {
//       const username = btn.dataset.username || btn.closest('[data-username]')?.dataset.username;
//       if (username) openPwdDialog(username);
//     }

//     // Изтриване – само акаунт
//     if (btn.classList.contains('act-delete-account')) {
//       const username = btn.dataset.username || btn.closest('[data-username]')?.dataset.username;
//       deleteUser(username, false);
//     }
//     // Изтриване – с история
//     if (btn.classList.contains('act-delete-all')) {
//       const username = btn.dataset.username || btn.closest('[data-username]')?.dataset.username;
//       deleteUser(username, true);
//     }
//   });

//   // Публични функции за inline onclick в диалозите
//   window.AdminUsers = {
//     closeDialog,
//     submitRename,
//     submitPwd
//   };
// })();


(function () {
  const $  = (sel, ctx = document) => ctx.querySelector(sel);

  function toast(msg) { alert(msg); }

  function openDialog(id) {
    const dlg = document.getElementById(id);
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
    else toast('Браузърът не поддържа системни диалози.');
  }
  function closeDialog(id) {
    const dlg = document.getElementById(id);
    if (dlg && typeof dlg.close === 'function') dlg.close();
  }

  // --- DELETE ---
  async function deleteUser(username, withHistory) {
    const txt = withHistory
      ? `Да изтрия ${username} и неговата история?`
      : `Да изтрия акаунта на ${username} (историята остава)?`;
    if (!confirm(txt)) return;

    try {
      const r = await fetch('/admin/users/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, with_history: !!withHistory })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Грешка');
      location.reload();
    } catch (e) { toast(e.message); }
  }

  // --- RENAME ---
  function openRenameDialog(username) {
    $('#old-username').value = username;
    $('#new-username').value = username;
    openDialog('dlg-rename');
  }
  async function submitRename() {
    const oldU = $('#old-username').value.trim();
    const newU = $('#new-username').value.trim();
    if (!newU || newU === oldU) return toast('Въведи различно ново име.');
    try {
      const r = await fetch('/admin/users/rename', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ old_username: oldU, new_username: newU })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Грешка');
      closeDialog('dlg-rename');
      location.reload();
    } catch (e) { toast(e.message); }
  }

  // --- RESET PASSWORD (диалог) ---
  function openPwdDialog(username) {
    $('#pwd-username').value = username;
    $('#pwd-newpass').value = '';
    openDialog('dlg-pwd');
  }

  
async function submitPwd() {
  const username = $('#pwd-username').value.trim();
  const newpass  = $('#pwd-newpass').value;

  if (!username) return toast('Липсва потребител.');

  // Ако искаш задължително въвеждане:
  // if (!newpass || newpass.length < 6) return toast('Паролата трябва да е поне 6 символа.');

  // Два режима:
  //  A) Имаш въведена парола -> ще я зададем точно нея
  //  B) Няма въведена парола -> бекендът ще генерира силна парола
  const body = newpass ? { username, new_password: newpass } : { username };

  try {
    const r = await fetch('/admin/users/reset_password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Грешка');
    closeDialog('dlg-pwd');

    // Бекендът ВИНАГИ връща 'new_password' -> покажи я за копиране
    toast(`Активна парола за ${j.username}:\n${j.new_password}\n(копирай и предай на потребителя)`);
  } catch (e) { toast(e.message); }
}


  // --- VIEW PASSWORD (ново) ---
  async function viewPwd(username) {
    if (!username) return toast('Липсва username.');
    try {
      const r = await fetch(`/admin/credentials/view?username=${encodeURIComponent(username)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Грешка');
      const pw = (j.password ?? '').trim();
      toast(`Текуща парола за ${j.username}:\n${pw || '(няма запазена криптирана парола)'}`);
    } catch (e) { toast(e.message); }
  }

  // --- Event Delegation за бутоните в таблицата ---
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    const row = btn.closest('[data-username]');
    const username = btn.dataset.username || row?.dataset.username;

    if (btn.classList.contains('act-rename')) {
      if (username) openRenameDialog(username);
    }

    if (btn.classList.contains('act-reset-pwd')) {
      if (username) openPwdDialog(username);
    }

    if (btn.classList.contains('act-delete-account')) {
      if (username) deleteUser(username, false);
    }

    if (btn.classList.contains('act-delete-all')) {
      if (username) deleteUser(username, true);
    }

    if (btn.classList.contains('act-view-pwd')) {
      if (username) viewPwd(username);
    }
  });

  // Глобално за inline onclick в диалозите
  window.AdminUsers = {
    closeDialog,
    submitRename,
    submitPwd
  };
})();
