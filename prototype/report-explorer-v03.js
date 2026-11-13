"use strict";
const reports=[
[1,"Supply–Demand per SKU","Persediaan","Stok bebas, permintaan terbuka, alokasi customer, kebutuhan bersih","Barang Jadi, DO/SJ, PO customer"],
[2,"WIP Giling–Verpack","Produksi","Saldo batang per lot, konversi tray, susut, rencana packing","Giling, WIP fisik, Verpack"],
[3,"Master Production Schedule","Produksi","Jadwal harian, prioritas pesanan, kapasitas, release bersyarat","Order terbuka, WIP, stok, pita"],
[4,"Material Requirements Planning","Persediaan","BOM kebutuhan bahan, saldo tersedia, lead time, kebutuhan bersih","Bahan Baku, BOM, MPS"],
[5,"Kontrol Pita Cukai per HJE","Kontrol","Saldo awal, CK-1 diterima, pemakaian, saldo buku, alokasi","Ledger pita, CK-1, hasil Verpack"],
[6,"BOM Standar vs Aktual","Produksi","Koefisien standar, konsumsi aktual, varians dan bukti lot","Bahan Baku, Giling, Verpack, lot"],
[7,"HPP Full Costing per SKU","Keuangan","Biaya langsung, upah, BOP 5% provisional, biaya per pack","BOM, payroll, WIP, invoice, biaya pabrik"],
[8,"Proyeksi Kebutuhan Kas","Keuangan","Payroll, pemasok, cukai, pajak, skenario pendanaan","Kas Bank, kewajiban, payroll"],
[9,"DO, Piutang & Forecast Penerimaan","Keuangan","SJ, customer induk, invoice, pembayaran, piutang, estimasi","DO/SJ, kartu customer, bukti transfer"],
[10,"Kapasitas & Bottleneck","Produksi","Output harian, WIP, utilisasi, waktu siklus, antrean","Giling, Verpack, jam kerja"],
[11,"Rekonsiliasi Gap Antardivisi","Kontrol","Selisih sumber, prioritas, PIC, tindakan dan bukti","Seluruh divisi, register gap"],
[12,"Inventory Turnover & Aging","Persediaan","Perputaran, days cover, umur lot, slow moving","Barang Jadi, DO, lot penerimaan"],
[13,"Simulasi Optimasi Produksi","Produksi","Skenario WIP, produksi baru, stok, kapasitas, kebutuhan kas","MPS, WIP, demand, HPP"]
];
const $=id=>document.getElementById(id);let current=1;
function selected(){return reports.find(r=>r[0]===current)}
function render(){const q=$("search").value.toLocaleLowerCase("id-ID"),group=$("division").value;const filtered=reports.filter(r=>(!group||r[2]===group)&&(!q||r.slice(1).some(x=>String(x).toLocaleLowerCase("id-ID").includes(q))));$("count").textContent="("+filtered.length+")";$("list").replaceChildren();for(const r of filtered){const b=document.createElement("button");b.className="report";b.type="button";b.setAttribute("role","option");b.setAttribute("aria-selected",r[0]===current?"true":"false");b.textContent=String(r[0]).padStart(2,"0")+" · "+r[1];const s=document.createElement("span");s.textContent=r[2];b.append(s);b.addEventListener("click",()=>{current=r[0];render()});$("list").append(b)}const r=selected();$("number").textContent="Laporan "+String(r[0]).padStart(2,"0");$("title").textContent=r[1];$("description").textContent="Ruang lingkup: "+r[3]+".";$("details").textContent="Rincian ditampilkan setelah bank data privat dan manifest sumber tersedia; setiap angka harus memiliki referensi dokumen, tanggal cut-off, versi, dan status validitas.";$("sources").textContent="Kategori sumber yang dibutuhkan: "+r[4]+". Belum ada tautan bukti live."}
function exportCSV(){const r=selected();const rows=[["Nomor","Laporan","Kelompok","Ruang lingkup","Sumber kategori","Status"],[r[0],r[1],r[2],r[3],r[4],"PROTOTYPE / OPEN RECON"]];const csv="\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="BAL_REPORT_CATALOG_"+String(r[0]).padStart(2,"0")+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$("search").addEventListener("input",render);$("division").addEventListener("change",render);$("print").addEventListener("click",()=>window.print());$("csv").addEventListener("click",exportCSV);render();