(function(){
  const VERSION = 'karyawan_borongan_v7_swot_focus';

  function injectExecutiveTheme(){
    if (document.querySelector('link[href*="bal99-executive-theme.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'bal99-executive-theme.css?v=' + VERSION;
    document.head.appendChild(link);
  }

  function addCoreMobileBottomNav(){
    if (document.getElementById('bal99CoreBottomNav')) return;
    const style = document.createElement('style');
    style.textContent = '@media(max-width:720px){.mobile-favs{display:none!important}.bal99-core-bottom-nav{position:fixed;left:7px;right:7px;bottom:7px;z-index:120;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:6px;background:rgba(6,26,49,.97);border:1px solid rgba(214,166,66,.42);border-radius:18px;box-shadow:0 14px 34px rgba(0,0,0,.22);backdrop-filter:blur(12px)}.bal99-core-bottom-nav button{border:0;border-radius:12px;background:transparent;color:#DDE8F4;font-weight:900;font-size:9.5px;padding:7px 2px;line-height:1.05}.bal99-core-bottom-nav button:focus,.bal99-core-bottom-nav button:hover{outline:none;background:rgba(214,166,66,.18);color:#F9D77A}.app{padding-bottom:94px!important}}@media(min-width:721px){.bal99-core-bottom-nav{display:none!important}}@media print{.bal99-core-bottom-nav{display:none!important}}';
    document.head.appendChild(style);
    const nav = document.createElement('nav');
    nav.id = 'bal99CoreBottomNav';
    nav.className = 'bal99-core-bottom-nav';
    const items = [
      ['SWOT', 'bal99-swot-overview.html?v=' + VERSION],
      ['Dashboard', 'dashboard-ringkas.html?v=' + VERSION],
      ['Status', 'status-hari-ini.html?v=' + VERSION],
      ['Cukai', 'dashboard-cukai-ringkas.html?v=' + VERSION],
      ['DO/SJ', 'index.html?v=' + VERSION + '#sj'],
      ['Piutang', 'index.html?v=' + VERSION + '#piutang']
    ];
    items.forEach(function(item){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item[0];
      btn.addEventListener('click', function(){ location.href = item[1]; });
      nav.appendChild(btn);
    });
    document.body.appendChild(nav);
  }

  function addExecutiveNavigationMenu(){
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="executive_swot_overview"]')) {
      const executiveBox = document.createElement('div');
      executiveBox.className = 'group';
      executiveBox.innerHTML = '<div class="group-title">Executive Control Tower</div>' +
        '<button class="nav-btn" data-key="executive_swot_overview" onclick="location.href=\'bal99-swot-overview.html?v=' + VERSION + '\'"><span class="dot"></span>Executive SWOT Overview</button>' +
        '<button class="nav-btn" data-key="executive_navigation_hub" onclick="location.href=\'executive-navigation-hub.html?v=' + VERSION + '\'"><span class="dot"></span>Executive Navigation Hub</button>' +
        '<button class="nav-btn" data-key="executive_control_tower" onclick="location.href=\'executive-control-tower.html?v=' + VERSION + '\'"><span class="dot"></span>Executive Control Tower</button>' +
        '<button class="nav-btn" data-key="dashboard_ringkas_exec" onclick="location.href=\'dashboard-ringkas.html?v=dashboard_ringkas_v1\'"><span class="dot"></span>Dashboard Ringkas</button>' +
        '<button class="nav-btn" data-key="status_hari_ini_exec" onclick="location.href=\'status-hari-ini.html?v=status_hari_ini_v1\'"><span class="dot"></span>Status Hari Ini</button>';
      nav.insertBefore(executiveBox, nav.firstChild);
    }

    if (nav && !document.querySelector('.nav-btn[data-key="scorecard_borongan_premium_print"]')) {
      const sdmBox = document.createElement('div');
      sdmBox.className = 'group';
      sdmBox.innerHTML = '<div class="group-title">SDM & Produktivitas</div>' +
        '<button class="nav-btn" data-key="scorecard_borongan_premium_print" onclick="location.href=\'scorecard-borongan-premium-print.html?v=' + VERSION + '\'"><span class="dot"></span>Scorecard Borongan Premium</button>' +
        '<button class="nav-btn" data-key="template_penilaian_borongan" onclick="location.href=\'template_penilaian_karyawan_borongan_bal99.csv?v=' + VERSION + '\'"><span class="dot"></span>Template Penilaian Borongan</button>' +
        '<button class="nav-btn" data-key="contoh_penilaian_borongan" onclick="location.href=\'contoh_penilaian_karyawan_borongan_bal99.csv?v=' + VERSION + '\'"><span class="dot"></span>CSV Contoh Borongan</button>' +
        '<button class="nav-btn" data-key="kontrol_upah_produksi_exec" onclick="location.href=\'kontrol-upah-produksi.html?v=prod_upah_1\'"><span class="dot"></span>Kontrol Upah Produksi</button>';
      const firstGroup = document.querySelector('.nav-btn[data-key="executive_swot_overview"]')?.closest('.group') || document.querySelector('.nav-btn[data-key="executive_navigation_hub"]')?.closest('.group');
      if (firstGroup && firstGroup.nextSibling) nav.insertBefore(sdmBox, firstGroup.nextSibling);
      else nav.insertBefore(sdmBox, nav.firstChild);
    }
  }

  function addLegacyProductionCostMenu(){
    const nav = document.getElementById('nav');
    if (nav && !document.querySelector('.nav-btn[data-key="gate_import_dosj_gate"]')) {
      const box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Import DO/SJ & Biaya</div>' +
        '<button class="nav-btn" data-key="karyawan_borongan_report" onclick="location.href=\'karyawan-borongan-performance-v2.html?v=' + VERSION + '\'"><span class="dot"></span>Karyawan Borongan Report V2</button>' +
        '<button class="nav-btn" data-key="template_karyawan_borongan_csv" onclick="location.href=\'template_karyawan_produktivitas_bal.csv?v=' + VERSION + '\'"><span class="dot"></span>CSV Karyawan Borongan Lama</button>' +
        '<button class="nav-btn" data-key="gate_import_dosj_gate" onclick="location.href=\'gate-import-do-sj-mei-2026.html?v=' + VERSION + '\'"><span class="dot"></span>Gate Import DO/SJ Mei</button>' +
        '<button class="nav-btn" data-key="csv_import_dosj_gate" onclick="location.href=\'import-do-sj-mei-2026-update-terbaru.csv?v=' + VERSION + '\'"><span class="dot"></span>CSV Import DO/SJ Mei</button>' +
        '<button class="nav-btn" data-key="gate_new16_gate" onclick="location.href=\'gate-hpp-new16.html?v=' + VERSION + '\'"><span class="dot"></span>Gate HPP New16 HOLD</button>' +
        '<button class="nav-btn" data-key="status_bahan16_gate" onclick="location.href=\'status-validasi-bahan-16.html?v=' + VERSION + '\'"><span class="dot"></span>Status Bahan 16</button>' +
        '<button class="nav-btn" data-key="mapping16_gate" onclick="location.href=\'mapping-varian-16.html?v=' + VERSION + '\'"><span class="dot"></span>Mapping Varian 16</button>' +
        '<button class="nav-btn" data-key="hpp_mini_gate" onclick="location.href=\'hpp-mini.html?v=' + VERSION + '\'"><span class="dot"></span>HPP Mini</button>';
      nav.appendChild(box);
    }
  }

  function addMobileMenu(){
    const mobile = document.getElementById('mobilePage');
    if (!mobile) return;

    if (!mobile.querySelector('option[value="executive_swot_overview"]')) {
      const execGroup = document.createElement('optgroup');
      execGroup.label = 'Executive Control Tower';
      execGroup.innerHTML = '<option value="executive_swot_overview">Executive SWOT Overview</option>' +
        '<option value="executive_navigation_hub">Executive Navigation Hub</option>' +
        '<option value="executive_control_tower">Executive Control Tower</option>' +
        '<option value="dashboard_ringkas_exec">Dashboard Ringkas</option>' +
        '<option value="status_hari_ini_exec">Status Hari Ini</option>';
      mobile.insertBefore(execGroup, mobile.firstChild);
    }

    if (!mobile.querySelector('option[value="scorecard_borongan_premium_print"]')) {
      const sdmGroup = document.createElement('optgroup');
      sdmGroup.label = 'SDM & Produktivitas';
      sdmGroup.innerHTML = '<option value="scorecard_borongan_premium_print">Scorecard Borongan Premium</option>' +
        '<option value="template_penilaian_borongan">Template Penilaian Borongan</option>' +
        '<option value="contoh_penilaian_borongan">CSV Contoh Borongan</option>' +
        '<option value="kontrol_upah_produksi_exec">Kontrol Upah Produksi</option>';
      mobile.insertBefore(sdmGroup, mobile.firstChild);
    }

    if (!mobile.querySelector('option[value="gate_import_dosj_gate"]')) {
      const group = document.createElement('optgroup');
      group.label = 'Karyawan Borongan & Biaya';
      group.innerHTML = '<option value="karyawan_borongan_report">Karyawan Borongan Report V2</option>' +
        '<option value="template_karyawan_borongan_csv">CSV Karyawan Borongan Lama</option>' +
        '<option value="gate_import_dosj_gate">Gate Import DO/SJ Mei</option>' +
        '<option value="csv_import_dosj_gate">CSV Import DO/SJ Mei</option>' +
        '<option value="gate_new16_gate">Gate HPP New16 HOLD</option>' +
        '<option value="status_bahan16_gate">Status Bahan 16</option>' +
        '<option value="mapping16_gate">Mapping Varian 16</option>' +
        '<option value="hpp_mini_gate">HPP Mini</option>';
      mobile.insertBefore(group, mobile.firstChild);
    }

    if (!mobile.dataset.executiveNavBound) {
      mobile.dataset.executiveNavBound = '1';
      mobile.addEventListener('change', function(){
        if (mobile.value === 'executive_swot_overview') location.href = 'bal99-swot-overview.html?v=' + VERSION;
        if (mobile.value === 'executive_navigation_hub') location.href = 'executive-navigation-hub.html?v=' + VERSION;
        if (mobile.value === 'executive_control_tower') location.href = 'executive-control-tower.html?v=' + VERSION;
        if (mobile.value === 'dashboard_ringkas_exec') location.href = 'dashboard-ringkas.html?v=dashboard_ringkas_v1';
        if (mobile.value === 'status_hari_ini_exec') location.href = 'status-hari-ini.html?v=status_hari_ini_v1';
        if (mobile.value === 'scorecard_borongan_premium_print') location.href = 'scorecard-borongan-premium-print.html?v=' + VERSION;
        if (mobile.value === 'template_penilaian_borongan') location.href = 'template_penilaian_karyawan_borongan_bal99.csv?v=' + VERSION;
        if (mobile.value === 'contoh_penilaian_borongan') location.href = 'contoh_penilaian_karyawan_borongan_bal99.csv?v=' + VERSION;
        if (mobile.value === 'kontrol_upah_produksi_exec') location.href = 'kontrol-upah-produksi.html?v=prod_upah_1';
        if (mobile.value === 'karyawan_borongan_report') location.href = 'karyawan-borongan-performance-v2.html?v=' + VERSION;
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

  function runPatch(){
    injectExecutiveTheme();
    addExecutiveNavigationMenu();
    addLegacyProductionCostMenu();
    addMobileMenu();
    addCoreMobileBottomNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(runPatch, 800); });
  } else {
    setTimeout(runPatch, 800);
  }
})();