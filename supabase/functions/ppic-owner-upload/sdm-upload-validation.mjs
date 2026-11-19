const gilingDays=['JUMAT','SABTU','SENIN','SELASA','RABU','KAMIS'];
export function validateSdmSheetNames(names,division){
 const found=new Set(names);
 if(division==='SDM GILING'&&!gilingDays.every(n=>found.has(n)))return 'File SDM Giling harus memuat enam sheet rincian pekerja: JUMAT, SABTU, SENIN, SELASA, RABU, KAMIS. Rekap produksi saja belum dapat menghasilkan slip gaji.';
 if(division==='SDM VERPACK'&&!found.has('INPUT DATA'))return 'File SDM Verpack harus memuat sheet INPUT DATA per pekerja. Gunakan workbook detail Manajemen dan Gaji; rekap manajemen saja belum dapat menghasilkan slip gaji.';
 return null;
}
