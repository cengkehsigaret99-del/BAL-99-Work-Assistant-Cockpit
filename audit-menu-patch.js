(function(){
  const VERSION = 'audit_menu_v1';

  function ensureAuditData(){
    if (typeof CSV_FILES !== 'undefined') CSV_FILES.audit_harian = 'audit_harian_template.csv';
    if (typeof TITLES !== 'undefined') TITLES.audit_harian = ['Audit Harian','Pusat validasi data staging sebelum merge final ke stok, pita, CK4C, DO/SJ, dan piutang.'];
  }

  function addAuditMenu(){
    ensureAuditData();
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="audit_harian"]')) {
      const box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Audit & Validasi</div><button class="nav-btn" data-key="audit_harian" onclick="show(\'audit_harian\')"><span class="dot"></span>Audit Harian</button><button class="nav-btn" onclick="location.href=\'audit-harian.html?v=' + VERSION + '\'"><span class="dot"></span>Checklist Audit</button>';
      nav.insertBefore(box, nav.firstChild);
    }

    const mobile = document.getElementById('mobilePage');
    if (mobile && !mobile.querySelector('option[value="audit_harian"]')) {
      const group = document.createElement('optgroup');
      group.label = 'Audit & Validasi';
      group.innerHTML = '<option value="audit_harian">Audit Harian</option>';
      mobile.insertBefore(group, mobile.firstChild);
    }
  }

  if (typeof show === 'function') {
    const oldShow = show;
    show = async function(key){
      ensureAuditData();
      await oldShow(key);
      addAuditMenu();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(addAuditMenu, 700); });
  } else {
    setTimeout(addAuditMenu, 700);
  }
})();
