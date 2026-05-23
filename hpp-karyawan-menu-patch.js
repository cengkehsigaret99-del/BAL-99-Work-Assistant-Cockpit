(function(){
  const VERSION = 'wa_bahan16_v1';

  function addHppKaryawanMenu(){
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="wa_bahan16_gate"]')) {
      const box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Biaya & Produktivitas</div>' +
        '<button class="nav-btn" data-key="wa_bahan16_gate" onclick="location.href=\'wa-minta-data-bahan-16.html?v=' + VERSION + '\'"><span class="dot"></span>WA Minta Data Bahan 16</button>' +
        '<button class="nav-btn" data-key="status_bahan16_gate" onclick="location.href=\'status-validasi-bahan-16.html?v=' + VERSION + '\'"><span class="dot"></span>Status Bahan 16</button>' +
        '<button class="nav-btn" data-key="sop_bahan16_gate" onclick="location.href=\'sop-validasi-bahan-varian-16.html?v=' + VERSION + '\'"><span class="dot"></span>SOP Bahan 16</button>' +
        '<button class="nav-btn" data-key="template_bahan16_gate" onclick="location.href=\'template_validasi_bahan_varian_16.csv?v=' + VERSION + '\'"><span class="dot"></span>Template Bahan 16</button>' +
        '<button class="nav-btn" data-key="validasi_bahan16_gate" onclick="location.href=\'validasi-ambree-etiket-varian-16.html?v=' + VERSION + '\'"><span class="dot"></span>Validasi Ambree/Etiket 16</button>' +
        '<button class="nav-btn" data-key="mapping16_gate" onclick="location.href=\'mapping-varian-16.html?v=' + VERSION + '\'"><span class="dot"></span>Mapping Varian 16</button>' +
        '<button class="nav-btn" data-key="hpp_mini_gate" onclick="location.href=\'hpp-mini.html?v=' + VERSION + '\'"><span class="dot"></span>HPP Mini</button>' +
        '<button class="nav-btn" data-key="karyawan_gate" onclick="location.href=\'karyawan-produktivitas.html?v=' + VERSION + '\'"><span class="dot"></span>Karyawan & Produktivitas</button>' +
        '<button class="nav-btn" data-key="wip_gate" onclick="location.href=\'wip-giling-vs-verpack-22-mei.html?v=' + VERSION + '\'"><span class="dot"></span>WIP Giling vs Verpack</button>';
      nav.insertBefore(box, nav.firstChild);
    }

    const mobile = document.getElementById('mobilePage');
    if (mobile && !mobile.querySelector('option[value="wa_bahan16_gate"]')) {
      const group = document.createElement('optgroup');
      group.label = 'Biaya & Produktivitas';
      group.innerHTML = '<option value="wa_bahan16_gate">WA Minta Data Bahan 16</option>' +
        '<option value="status_bahan16_gate">Status Bahan 16</option>' +
        '<option value="sop_bahan16_gate">SOP Bahan 16</option>' +
        '<option value="template_bahan16_gate">Template Bahan 16</option>' +
        '<option value="validasi_bahan16_gate">Validasi Ambree/Etiket 16</option>' +
        '<option value="mapping16_gate">Mapping Varian 16</option>' +
        '<option value="hpp_mini_gate">HPP Mini</option>' +
        '<option value="karyawan_gate">Karyawan & Produktivitas</option>' +
        '<option value="wip_gate">WIP Giling vs Verpack</option>';
      mobile.insertBefore(group, mobile.firstChild);
      mobile.addEventListener('change', function(){
        if (mobile.value === 'wa_bahan16_gate') location.href = 'wa-minta-data-bahan-16.html?v=' + VERSION;
        if (mobile.value === 'status_bahan16_gate') location.href = 'status-validasi-bahan-16.html?v=' + VERSION;
        if (mobile.value === 'sop_bahan16_gate') location.href = 'sop-validasi-bahan-varian-16.html?v=' + VERSION;
        if (mobile.value === 'template_bahan16_gate') location.href = 'template_validasi_bahan_varian_16.csv?v=' + VERSION;
        if (mobile.value === 'validasi_bahan16_gate') location.href = 'validasi-ambree-etiket-varian-16.html?v=' + VERSION;
        if (mobile.value === 'mapping16_gate') location.href = 'mapping-varian-16.html?v=' + VERSION;
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