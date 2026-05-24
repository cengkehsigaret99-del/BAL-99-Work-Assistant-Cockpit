// BAL-99 Penilaian Karyawan Borongan App
// Safe module: reads CSV and calculates scorecard only. No localStorage, no mutation of production data.
(function(){
  'use strict';

  const CSV_SOURCE = 'template_penilaian_karyawan_borongan_bal99.csv';
  const rupiah = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const num = n => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const clean = v => v === undefined || v === null ? '' : String(v).trim();
  const nval = v => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  let DATA = [];

  function parseCSV(text){
    const rows = [];
    let row = [], cur = '', quote = false;
    for(let i=0;i<text.length;i++){
      const c = text[i], nx = text[i+1];
      if(quote){
        if(c === '"' && nx === '"'){ cur += '"'; i++; }
        else if(c === '"') quote = false;
        else cur += c;
      } else {
        if(c === '"') quote = true;
        else if(c === ','){ row.push(cur); cur = ''; }
        else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
        else if(c !== '\r') cur += c;
      }
    }
    if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim().replace(/^\uFEFF/, ''));
    return rows.filter(r => r.some(x => clean(x) !== '')).map(r => {
      const o = {};
      head.forEach((h,i) => o[h] = r[i] ?? '');
      return o;
    });
  }

  function productivityScore(r){
    let p = nval(r.produktivitas_skor);
    if(p > 0) return clamp(p);
    let pct = nval(r.persen_target);
    if(!pct){
      const rata = nval(r.rata_output_per_orang);
      const target = nval(r.target_output_per_orang);
      pct = target ? (rata / target * 100) : 0;
    }
    if(pct >= 110) return 100;
    if(pct >= 100) return 90;
    if(pct >= 90) return 80;
    if(pct >= 80) return 70;
    if(pct >= 70) return 60;
    return pct > 0 ? 50 : 0;
  }

  function qualityScore(r){
    let q = nval(r.kualitas_skor);
    if(q > 0) return clamp(q);
    const rijek = nval(r.rijek_persen);
    let score = 100;
    if(rijek > 1 && rijek <= 3) score = 90;
    else if(rijek > 3 && rijek <= 5) score = 75;
    else if(rijek > 5 && rijek <= 8) score = 60;
    else if(rijek > 8) score = 50;
    if(nval(r.ulang_kerja_pack) > 0) score -= 5;
    return clamp(score);
  }

  function clamp(n){ return Math.max(0, Math.min(100, Number(n || 0))); }

  function finalScore(r){
    const status = clean(r.status_hadir).toUpperCase();
    if(status === 'OFF' || status === 'LIBUR') return 0;
    const prod = productivityScore(r);
    const qual = qualityScore(r);
    const dis = clamp(nval(r.disiplin_skor) || 80);
    const neat = clamp(nval(r.kerapian_skor) || 80);
    const team = clamp(nval(r.kerjasama_skor) || 80);
    const existing = nval(r.skor_akhir);
    if(existing > 0) return clamp(existing);
    return Math.round((prod * .40) + (qual * .25) + (dis * .15) + (neat * .10) + (team * .10));
  }

  function category(score, status){
    const s = clean(status).toUpperCase();
    if(s === 'OFF' || s === 'LIBUR') return 'TIDAK DIHITUNG';
    if(score >= 90) return 'A - UNGGUL';
    if(score >= 80) return 'B - BAIK';
    if(score >= 70) return 'C - CUKUP';
    if(score >= 60) return 'D - PENDAMPINGAN';
    return 'E - RISIKO';
  }

  function badge(cat){
    const c = clean(cat).toUpperCase();
    let cls = 'b-gray';
    if(c.startsWith('A')) cls = 'b-green';
    else if(c.startsWith('B')) cls = 'b-blue';
    else if(c.startsWith('C') || c.startsWith('D')) cls = 'b-yellow';
    else if(c.startsWith('E')) cls = 'b-red';
    return '<span class="badge '+cls+'">'+escapeHTML(cat || '-')+'</span>';
  }

  function escapeHTML(s){
    return clean(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  function enrich(rows){
    return rows.map(r => {
      const score = finalScore(r);
      return Object.assign({}, r, {
        _prod: productivityScore(r),
        _qual: qualityScore(r),
        _score: score,
        _category: category(score, r.status_hadir)
      });
    });
  }

  function activeRows(rows){
    return rows.filter(r => !['OFF','LIBUR','TIDAK DIHITUNG'].includes(clean(r.status_hadir).toUpperCase()));
  }

  function groupBy(rows, key){
    const out = {};
    rows.forEach(r => {
      const k = clean(r[key]) || '-';
      if(!out[k]) out[k] = [];
      out[k].push(r);
    });
    return out;
  }

  function avg(rows, field){
    const arr = rows.map(r => nval(r[field])).filter(v => v > 0);
    return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;
  }

  function render(){
    const rows = enrich(DATA);
    const active = activeRows(rows);
    const elCards = document.getElementById('scoreCards');
    const elMandor = document.getElementById('mandorBody');
    const elDetail = document.getElementById('detailBody');
    if(!elCards || !elMandor || !elDetail) return;

    const countA = active.filter(r => r._category.startsWith('A')).length;
    const countB = active.filter(r => r._category.startsWith('B')).length;
    const needCoach = active.filter(r => /^C|^D|^E/.test(r._category)).length;
    const totalOutput = active.reduce((a,r)=>a+nval(r.rata_output_per_orang),0);
    const totalInsentif = active.reduce((a,r)=>a+nval(r.insentif),0);
    const avgScore = active.length ? active.reduce((a,r)=>a+r._score,0)/active.length : 0;

    elCards.innerHTML = [
      ['Karyawan Aktif', active.length + ' orang', 'Tidak termasuk OFF/libur', 'green'],
      ['Rata-rata Skor', num(avgScore), 'Skor akhir aktif', avgScore >= 80 ? 'green' : 'warn'],
      ['Kategori A/B', (countA + countB) + ' orang', 'Unggul dan baik', 'green'],
      ['Perlu Pembinaan', needCoach + ' orang', 'Kategori C/D/E', needCoach ? 'warn' : 'green'],
      ['Rata Output Tercatat', num(totalOutput), 'Akumulasi rata output/orang', 'blue'],
      ['Insentif', rupiah(totalInsentif), 'Total insentif CSV', 'blue']
    ].map(c => '<div class="card '+(c[3] === 'warn' ? 'warn' : c[3] === 'green' ? 'green' : '')+'"><small>'+c[0]+'</small><strong>'+c[1]+'</strong><p>'+c[2]+'</p></div>').join('');

    const mandors = groupBy(active, 'mandor');
    elMandor.innerHTML = Object.keys(mandors).sort().map(k => {
      const arr = mandors[k];
      const score = arr.reduce((a,r)=>a+r._score,0)/arr.length;
      const prod = arr.reduce((a,r)=>a+r._prod,0)/arr.length;
      const qual = arr.reduce((a,r)=>a+r._qual,0)/arr.length;
      const rijek = avg(arr, 'rijek_persen');
      const cats = arr.map(r=>r._category);
      const status = score >= 85 ? 'TIM KUAT' : score >= 75 ? 'STABIL' : 'PERLU PENDAMPINGAN';
      return '<tr><td><b>'+escapeHTML(k)+'</b></td><td class="right">'+arr.length+'</td><td class="right">'+num(score)+'</td><td class="right">'+num(prod)+'</td><td class="right">'+num(qual)+'</td><td class="right">'+num(rijek)+'%</td><td>'+badge(status)+'</td><td>'+escapeHTML(cats.join(', '))+'</td></tr>';
    }).join('') || '<tr><td colspan="8">Belum ada data aktif.</td></tr>';

    elDetail.innerHTML = rows.map(r => {
      return '<tr><td>'+escapeHTML(r.tanggal)+'</td><td>'+escapeHTML(r.minggu)+'</td><td>'+escapeHTML(r.mandor)+'</td><td><b>'+escapeHTML(r.nama_karyawan)+'</b></td><td>'+escapeHTML(r.bagian)+'</td><td>'+escapeHTML(r.status_hadir)+'</td><td>'+escapeHTML(r.merek)+'</td><td class="right">'+num(r.rata_output_per_orang)+'</td><td class="right">'+num(r.target_output_per_orang)+'</td><td class="right">'+num(r._prod)+'</td><td class="right">'+num(r._qual)+'</td><td class="right"><b>'+num(r._score)+'</b></td><td>'+badge(r._category)+'</td><td>'+escapeHTML(r.catatan_tindak_lanjut)+'</td></tr>';
    }).join('') || '<tr><td colspan="14">Belum ada data.</td></tr>';
  }

  function setStatus(msg){
    const el = document.getElementById('loadStatus');
    if(el) el.textContent = msg;
  }

  function loadDefault(){
    fetch(CSV_SOURCE + '?v=' + Date.now()).then(r => r.text()).then(t => {
      DATA = parseCSV(t);
      setStatus('Template CSV berhasil dimuat. Jika masih contoh, upload CSV aktual dari mandor.');
      render();
    }).catch(() => {
      setStatus('CSV default belum dapat dimuat. Upload CSV aktual untuk menghitung scorecard.');
      DATA = [];
      render();
    });
  }

  function setupUpload(){
    const input = document.getElementById('csvUpload');
    if(!input) return;
    input.addEventListener('change', function(){
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(){
        DATA = parseCSV(String(reader.result || ''));
        setStatus('CSV upload berhasil dibaca: ' + file.name);
        render();
      };
      reader.readAsText(file);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    setupUpload();
    loadDefault();
    const printBtn = document.getElementById('printBtn');
    if(printBtn) printBtn.addEventListener('click', () => window.print());
  });
})();
