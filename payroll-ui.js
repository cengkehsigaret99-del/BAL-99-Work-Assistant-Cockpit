(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const report = $('sdmPayroll');
  if (!report || !window.BALPayroll) return;
  let activePreview = false;
  function context() {return typeof window.ppicPayrollContext === 'function' ? window.ppicPayrollContext() : {};}
  function options() {return {division:$('sdmDiv').value,start:$('sdmStart').value,end:$('sdmEnd').value,search:$('sdmSearch').value.trim(),period:context().period};}
  function closePrivatePreview() {
    if (!activePreview) return;
    $('previewModal').hidden = true;
    $('previewFrame').removeAttribute('srcdoc');
    $('previewFrame').src = 'about:blank';
    $('shareStatus').textContent = '';
    activePreview = false;
  }
  function refresh() {
    const c = context(), o = options();
    const authenticated = c.authorized === true;
    const model = authenticated && c.data ? window.BALPayroll.buildModel(c.data,o) : null;
    const valid = !!model?.valid && !c.stale;
    $('payrollSlips').disabled = !valid || !model.staff.length;
    $('payrollCash').disabled = !valid || !model.staff.length;
    const amount = n => n==null?'Belum tersedia':'Rp ' + window.BALPayroll.format(n);
    $('payrollGross').textContent = model ? amount(model.totalGross) : '—';
    $('payrollCashGross').textContent = model ? amount(model.cashGross) : '—';
    $('payrollRecipients').textContent = model ? String(model.candidates.length) : '—';
    $('payrollHeld').textContent = model ? amount(model.heldGross) : '—';
    $('payrollScope').textContent = model ? o.division+' · '+o.start+' s.d. '+o.end+' · '+(o.search?'Pekerja: '+o.search:'Semua pekerja')+' · Semua merek' : 'Pilih sumber SDM dan rentang tanggal untuk melihat keluaran payroll.';
    const bonus = model?.bonusPolicy === 'OFF' ? 'Bonus OFF sesuai sumber.' : 'Bonus belum ditetapkan pada sumber.';
    $('payrollBasis').textContent = model ? bonus+' Dasar tunai menggunakan upah bruto calon penerima. Potongan / kasbon, gaji bersih, dan pembayaran belum disahkan. HOLD: '+model.holds.length+' · Pending di luar bruto: '+amount(model.pendingGross)+' · Sisa pecahan: '+amount(model.remainder)+'.' : 'Slip mencakup hasil harian dan upah per merek. Rekap tunai mencakup pecahan per orang, daftar paraf, HOLD, dan pending.';
    $('payrollState').textContent = !authenticated || !c.data ? 'Laporan menunggu sumber SDM privat.' : !model.valid ? model.invalidReason : c.stale ? 'Sumber baru perlu diproses sebelum keluaran payroll dicetak.' : !model.staff.length ? 'Tidak ada hasil atau upah untuk pilihan ini.' : 'Siap dipratinjau · WORKING / OPEN RECON. Cetak atau simpan PDF dari pratinjau.';
    if (!authenticated || !c.data || c.stale || !model?.valid) closePrivatePreview();
  }
  function preview(kind) {
    const c = context();
    if (!c.authorized || !c.data || c.stale) return;
    const model=window.BALPayroll.buildModel(c.data,options());
    if (!model.valid || !model.staff.length) return;
    const logo=new URL('bal-logo-user.webp',document.baseURI).href;
    const html=window.BALPayroll.renderDocument(model,{kind,logoUrl:logo});
    $('previewFrame').removeAttribute('src');
    $('previewFrame').srcdoc=html;
    $('previewModal').hidden=false;
    $('shareStatus').textContent='Pratinjau '+(kind==='slips'?'slip gaji':'rekap tarik tunai')+'. Gunakan Cetak / Simpan PDF; dokumen mengikuti filter divisi, tanggal, dan pekerja.';
    $('closePreview').focus();
    activePreview=true;
  }
  $('payrollSlips').addEventListener('click',()=>preview('slips'));
  $('payrollCash').addEventListener('click',()=>preview('cash'));
  $('closePreview').addEventListener('click',()=>{activePreview=false;});
  for(const id of ['sdmDiv','sdmStart','sdmEnd','sdmSearch'])$(id).addEventListener('input',refresh);
  $('logoutOwner').addEventListener('click',closePrivatePreview);
  new MutationObserver(refresh).observe($('ppicMain'),{attributes:true,attributeFilter:['hidden']});
  window.ppicRefreshPayroll=refresh;
  refresh();
})();
