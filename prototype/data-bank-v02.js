"use strict";
const records=[
{id:"DEMO-001",division:"Giling",name:"Contoh Rekap Produksi",month:"2026-11",version:"V01",status:"WORKING",kind:"XLSX"},
{id:"DEMO-002",division:"Verpack",name:"Contoh Hasil Packing",month:"2026-11",version:"V02",status:"OPEN RECON",kind:"XLSX"},
{id:"DEMO-003",division:"Barang Jadi",name:"Contoh Kartu Persediaan",month:"2026-11",version:"V01",status:"OPEN RECON",kind:"PDF"},
{id:"DEMO-004",division:"Cukai",name:"Contoh Saldo Pita per HJE",month:"2026-11",version:"V01",status:"WORKING",kind:"XLSX"},
{id:"DEMO-005",division:"DO & Piutang",name:"Contoh Daftar Surat Jalan",month:"2026-10",version:"V03",status:"LOCKED",kind:"PDF"},
{id:"DEMO-006",division:"Kas Bank",name:"Contoh Mutasi Kas",month:"2026-11",version:"V01",status:"OPEN RECON",kind:"XLSX"},
{id:"DEMO-007",division:"Bahan Baku",name:"Contoh Kartu Stok",month:"2026-11",version:"V01",status:"WORKING",kind:"XLSX"},
{id:"DEMO-008",division:"TSG",name:"Contoh Mutasi TSG",month:"2026-11",version:"V01",status:"WORKING",kind:"PDF"}];
const $=id=>document.getElementById(id);
for(const div of [...new Set(records.map(r=>r.division))].sort()){const opt=document.createElement("option");opt.value=div;opt.textContent=div;$("division").append(opt)}
function filtered(){const q=$("search").value.trim().toLocaleLowerCase("id-ID");return records.filter(r=>(!$("division").value||r.division===$("division").value)&&(!$("status").value||r.status===$("status").value)&&(!$("month").value||r.month===$("month").value)&&(!q||Object.values(r).some(v=>String(v).toLocaleLowerCase("id-ID").includes(q))))}
function draw(){const rows=filtered();$("body").replaceChildren();for(const r of rows){const tr=document.createElement("tr");for(const val of [r.division,r.name,r.month,r.version,r.status,r.kind]){const td=document.createElement("td");td.textContent=val;tr.append(td)}$("body").append(tr)}$("count").textContent=rows.length+" dokumen"}
function csv(){const rows=[["Divisi","Dokumen","Periode","Versi","Status","Jenis"],...filtered().map(r=>[r.division,r.name,r.month,r.version,r.status,r.kind])];const data="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");const u=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=u;a.download="BAL_DEMO_DATA_BANK.csv";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
for(const id of ["search","division","status","month"])$(id).addEventListener(id==="search"?"input":"change",draw);
$("reset").addEventListener("click",()=>{$("search").value="";for(const id of ["division","status","month"])$(id).value="";draw()});
$("csv").addEventListener("click",csv);$("print").addEventListener("click",()=>window.print());draw();