// BAL-99 Borongan Premium Report Layer
// Reads rendered scorecard table only. Safe: no CSV mutation, no localStorage, no production data changes.
(function(){
  'use strict';

  function clean(v){ return (v || '').toString().trim(); }
  function num(v){
    const n = Number(clean(v).replace(/[^0-9.-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }
  function esc(s){
    return clean(s).replace(/[&<>"]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]; });
  }
  function badge(cat){
    const c = clean(cat).toUpperCase();
    let cls = 'b-gray';
    if(c.startsWith('A')) cls = 'b-green';
    else if(c.startsWith('B')) cls = 'b-blue';
    else if(c.startsWith('C') || c.startsWith('D')) cls = 'b-yellow';
    else if(c.startsWith('E')) cls = 'b-red';
    return '<span class="badge '+cls+'">'+esc(cat)+'</span>';
  }

  function ensureSection(){
    if(document.getElementById('premiumBoronganReport')) return;
    const app = document.querySelector('main.app');
    if(!app) return;
    const section = document.createElement('section');
    section.id = 'premiumBoronganReport';
    section.innerHTML =
      '<section class="table-wrap" style="margin-top:16px">' +
        '<div class="table-toolbar"><h3>Ranking & Keputusan Praktis</h3><span>Ringkasan siap cetak untuk mandor dan owner.</span></div>' +
        '<div class="scroll"><table><thead><tr><th>Kelompok</th><th>Nama</th><th>Mandor</th><th>Bagian</th><th>Skor</th><th>Kategori</th><th>Keputusan</th></tr></thead><tbody id="rankingBody"><tr><td colspan="7">Menunggu data...</td></tr></tbody></table></div>' +
      '</section>' +
      '<section class="cockpit-grid" style="margin-top:16px">' +
        '<div class="cockpit-panel"><h3>Keputusan SDM Minggu Ini</h3><div id="decisionBox" class="note">Menunggu data scorecard.</div></div>' +
        '<div class="cockpit-panel"><h3>Catatan Cetak</h3><p>Report ini dipakai untuk pembinaan dan produktivitas. Jangan gunakan bahasa menyalahkan. Gunakan bahasa: perlu dicek, perlu distabilkan, perlu pendampingan, atau layak menjadi contoh.</p></div>' +
      '</section>' +
      '<div class="print-footer-line"><span>BAL-99 • Borongan Performance & Quality Scorecard</span><span>Dicetak dari sistem internal</span></div>';
    app.appendChild(section);
  }

  function readRows(){
    const body = document.getElementById('detailBody');
    if(!body) return [];
    return Array.from(body.querySelectorAll('tr')).map(tr => {
      const td = Array.from(tr.children).map(x => clean(x.textContent));
      if(td.length < 13) return null;
      return { tanggal: td[0], minggu: td[1], mandor: td[2], nama: td[3], bagian: td[4], hadir: td[5], merek: td[6], output: num(td[7]), target: num(td[8]), prod: num(td[9]), qual: num(td[10]), skor: num(td[11]), kategori: td[12], catatan: td[13] || '' };
    }).filter(Boolean).filter(r => r.nama && !/Memuat|Belum ada/.test(r.nama));
  }

  function decisionFor(row){
    const cat = row.kategori.toUpperCase();
    if(cat.startsWith('A')) return 'Jadikan contoh ritme kerja / kandidat leader kecil';
    if(cat.startsWith('B')) return 'Pertahankan dan stabilkan target';
    if(cat.startsWith('C')) return 'Bina ringan: cek target, alat, bahan, dan ritme kerja';
    if(cat.startsWith('D')) return 'Pendampingan mandor dan evaluasi mingguan';
    if(cat.startsWith('E')) return 'Jangan tempatkan di bagian kritis dulu';
    return 'Tidak dihitung';
  }

  function renderPremium(){
    ensureSection();
    const rows = readRows().filter(r => !/OFF|LIBUR|TIDAK DIHITUNG/i.test(r.hadir + ' ' + r.kategori));
    const rankingBody = document.getElementById('rankingBody');
    const decisionBox = document.getElementById('decisionBox');
    if(!rankingBody || !decisionBox) return;
    if(!rows.length){
      rankingBody.innerHTML = '<tr><td colspan="7">Belum ada data aktif.</td></tr>';
      decisionBox.textContent = 'Belum ada data aktif untuk keputusan.';
      return;
    }
    const top = rows.slice().sort((a,b)=>b.skor-a.skor).slice(0,5).map(r => Object.assign({group:'Top Produktif'}, r));
    const coach = rows.filter(r => /^[CDE]/i.test(r.kategori)).sort((a,b)=>a.skor-b.skor).slice(0,8).map(r => Object.assign({group:'Perlu Pembinaan'}, r));
    const mix = top.concat(coach);
    rankingBody.innerHTML = mix.map(r => '<tr><td><b>'+esc(r.group)+'</b></td><td>'+esc(r.nama)+'</td><td>'+esc(r.mandor)+'</td><td>'+esc(r.bagian)+'</td><td class="right"><b>'+r.skor.toLocaleString('id-ID')+'</b></td><td>'+badge(r.kategori)+'</td><td>'+esc(decisionFor(r))+'</td></tr>').join('') || '<tr><td colspan="7">Tidak ada ranking.</td></tr>';

    const avg = rows.reduce((a,r)=>a+r.skor,0)/rows.length;
    const strong = rows.filter(r => /^[AB]/i.test(r.kategori)).length;
    const need = rows.filter(r => /^[CDE]/i.test(r.kategori)).length;
    let status = 'STABIL';
    if(avg >= 85 && need === 0) status = 'KUAT';
    else if(avg < 75 || need > strong) status = 'PERLU PENDAMPINGAN';
    decisionBox.innerHTML = '<b>Status tim: '+status+'</b><br>Rata-rata skor aktif: '+avg.toLocaleString('id-ID',{maximumFractionDigits:2})+'. Karyawan kategori A/B: '+strong+' orang. Perlu pembinaan C/D/E: '+need+' orang.<br><br>Keputusan praktis: '+(status === 'KUAT' ? 'pertahankan ritme dan beri apresiasi terukur.' : status === 'STABIL' ? 'stabilkan target, cek kualitas, dan bina karyawan kategori C.' : 'jangan naikkan target dulu; fokus stabilisasi kualitas, disiplin, bahan, dan arahan mandor.') ;
  }

  document.addEventListener('DOMContentLoaded', function(){
    ensureSection();
    const target = document.getElementById('detailBody');
    if(target && 'MutationObserver' in window){
      const obs = new MutationObserver(function(){
        clearTimeout(window.__boronganPremiumTimer);
        window.__boronganPremiumTimer = setTimeout(renderPremium, 160);
      });
      obs.observe(target,{childList:true,subtree:true});
    }
    setTimeout(renderPremium, 800);
  });
})();
