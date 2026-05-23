(function(){
  const VERSION = 'hpp_karyawan_menu_v1';

  function addHppKaryawanMenu(){
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="hpp_mini_gate"]')) {
      const box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Biaya & Produktivitas</div><button class="nav-btn" data-key="hpp_mini_gate" onclick="location.href=\'hpp-mini.html?v=' + VERSION + '\'"><span class="dot"></span>HPP Mini</button><button class="nav-btn" data-key="karyawan_gate" onclick="location.href=\'karyawan-produktivitas.html?v=' + VERSION + '\'"><span class="dot"></span>Karyawan & Produktivitas</button><button class="nav-btn" data-key="wip_gate" onclick="location.href=\'wip-giling-vs-verpack-22-mei.html?v=' + VERSION + '\'"><span class="dot"></span>WIP Giling vs Verpack</button>';
      nav.insertBefore(box, nav.firstChild);
    }

    const mobile = document.getElementById('mobilePage');
    if (mobile && !mobile.querySelector('option[value="hpp_mini_gate"]')) {
      const group = document.createElement('optgroup');
      group.label = 'Biaya & Produktivitas';
      group.innerHTML = '<option value="hpp_mini_gate">HPP Mini</option><option value="karyawan_gate">Karyawan & Produktivitas</option><option value="wip_gate">WIP Giling vs Verpack</option>';
      mobile.insertBefore(group, mobile.firstChild);
      mobile.addEventListener('change', function(){
        if (mobile.value === 'hpp_mini_gate') location.href = 'hpp-mini.html?v=' + VERSION;
        if (mobile.value === 'karyawan_gate') location.href = 'karyawan-produktivitas.html?v=' + VERSION;
        if (mobile.value === 'wip_gate') location.href = 'wip-giling-vs-verpack-22-mei.html?v=' + VERSION;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(addHppKaryawanMenu, 800); });
  } else {
    setTimeout(addHppKaryawanMenu, 800);
  }
})();
