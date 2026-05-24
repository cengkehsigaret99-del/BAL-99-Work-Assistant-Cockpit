(function(){
  const VERSION = 'karyawan_borongan_v1';

  function addHppKaryawanMenu(){
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="gate_import_dosj_gate"]')) {
      const box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Import DO/SJ & Biaya</div>' +
        '<button class="nav-btn" data-key="karyawan_borongan_report" onclick="location.href=\'karyawan-borongan-performance.html?v=' + VERSION + '\'"><span class="dot"></span>Karyawan Borongan Report</button>' +
        '<button class="nav-btn" data-key="template_karyawan_borongan_csv" onclick="location.href=\'template_karyawan_produktivitas_bal.csv?v=' + VERSION + '\'"><span class="dot"></span>CSV Karyawan Borongan</button>' +
        '<button class="nav-btn" data-key="gate_import_dosj_gate" onclick="location.href=\'gate-import-do-sj-mei-2026.html?v=' + VERSION + '\'"><span class="dot"></span>Gate Import DO/SJ Mei</button>' +
        '<button class="nav-btn" data-key="csv_import_dosj_gate" onclick="location.href=\'import-do-sj-mei-2026-update-terbaru.csv?v=' + VERSION + '\'"><span class="dot"></span>CSV Import DO/SJ Mei</button>' +
        '<button class="nav-btn" data-key="gate_new16_gate" onclick="location.href=\'gate-hpp-new16.html?v=' + VERSION + '\'"><span class="dot"></span>Gate HPP New16 HOLD</button>' +
        '<button class="nav-btn" data-key="status_bahan16_gate" onclick="location.href=\'status-validasi-bahan-16.html?v=' + VERSION + '\'"><span class="dot"></span>Status Bahan 16</button>' +
        '<button class="nav-btn" data-key="mapping16_gate" onclick="location.href=\'mapping-varian-16.html?v=' + VERSION + '\'"><span class="dot"></span>Mapping Varian 16</button>' +
        '<button class="nav-btn" data-key="hpp_mini_gate" onclick="location.href=\'hpp-mini.html?v=' + VERSION + '\'"><span class="dot"></span>HPP Mini</button>';
      nav.insertBefore(box, nav.firstChild);
    }

    const mobile = document.getElementById('mobilePage');
    if (mobile && !mobile.querySelector('option[value="gate_import_dosj_gate"]')) {
      const group = document.createElement('optgroup');
      group.label = 'Karyawan Borongan & Biaya';
      group.innerHTML = '<option value="karyawan_borongan_report">Karyawan Borongan Report</option>' +
        '<option value="template_karyawan_borongan_csv">CSV Karyawan Borongan</option>' +
        '<option value="gate_import_dosj_gate">Gate Import DO/SJ Mei</option>' +
        '<option value="csv_import_dosj_gate">CSV Import DO/SJ Mei</option>' +
        '<option value="gate_new16_gate">Gate HPP New16 HOLD</option>' +
        '<option value="status_bahan16_gate">Status Bahan 16</option>' +
        '<option value="mapping16_gate">Mapping Varian 16</option>' +
        '<option value="hpp_mini_gate">HPP Mini</option>';
      mobile.insertBefore(group, mobile.firstChild);
      mobile.addEventListener('change', function(){
        if (mobile.value === 'karyawan_borongan_report') location.href = 'karyawan-borongan-performance.html?v=' + VERSION;
        if (mobile.value === 'template_karyawan_borongan_csv') location.href = 'template_karyawan_produktivitas_bal.csv?v=' + VERSION;
        if (mobile.value === 'gate_import_dosj_gate') location.href = 'gate-import-do-sj-mei-2026.html?v=' + VERSION;
        if (mobile.value === 'csv_import_dosj_gate') location.href = 'import-do-sj-mei-2026-update-terbaru.csv?v=' + VERSION;
        if (mobile.value === 'gate_new16_gate') location.href = 'gate-hpp-new16.html?v=' + VERSION;
        if (mobile.value === 'status_bahan16_gate') location.href = 'status-validasi-bahan-16.html?v=' + VERSION;
        if (mobile.value === 'mapping16_gate') location.href = 'mapping-varian-16.html?v=' + VERSION;
        if (mobile.value === 'hpp_mini_gate') location.href = 'hpp-mini.html?v=' + VERSION;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(addHppKaryawanMenu, 800); });
  } else {
    setTimeout(addHppKaryawanMenu, 800);
  }
})();