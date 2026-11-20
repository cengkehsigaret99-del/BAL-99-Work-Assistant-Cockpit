#!/usr/bin/env python3
"""Extract bounded, source-cited PPIC facts from a prepared private XLSX.

Input is one JSON object on stdin: {local_path, manifest:{division,period,
cutoff,version,sha256}}. Output is private JSON. This command neither contacts a
service nor changes a workbook/report. Never commit real inputs or outputs.
Cached Excel values are used; formulas, links, and document instructions never
execute. Unknown templates or metadata disagreement fail closed.
"""

import argparse
import datetime as dt
import hashlib
import io
import json
import math
import posixpath
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAX_BYTES = 10 * 1024 * 1024
MAX_XML = 16 * 1024 * 1024
MAX_FACTS = 500
MAX_ISSUES = 50
MAX_PAYLOAD = 512 * 1024
KEY_RE = re.compile(r'^[a-z][a-z0-9_]{0,79}$')
CELL_RE = re.compile(r'^([A-Z]{1,3})([1-9][0-9]{0,6})$')
QUALITIES = {'SOURCE', 'ESTIMATE', 'REFERENCE', 'MISSING'}


class ExtractionError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ExtractionError(message)


def normalized(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).casefold()


def keypart(value):
    text = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def brand_match_key(value):
    # Prepared admin sheets use GCC16/CB77 while their conversion table uses
    # GCC 16/CB 77. Ignore spacing only; do not infer an unknown product alias.
    return re.sub(r'\s+', '', normalized(value))


def text_limit(value, limit):
    text = re.sub(r'\s+', ' ', str(value or '')).strip()
    return text if len(text) <= limit else text[:limit - 1] + '…'


def localname(tag):
    return tag.rsplit('}', 1)[-1]


def child(node, name):
    return next((x for x in node if localname(x.tag) == name), None)


def excel_date(value, date1904=False):
    if isinstance(value, str):
        iso = re.match(r'^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$', value.strip())
        if iso:
            return dt.date.fromisoformat(iso[1]).isoformat()
        months = {'januari':1, 'februari':2, 'maret':3, 'april':4, 'mei':5,
                  'juni':6, 'juli':7, 'agustus':8, 'september':9,
                  'oktober':10, 'november':11, 'desember':12}
        match = re.fullmatch(r'(\d{1,2})\s+([a-z]+)\s+(\d{4})', value.strip().lower())
        if match and match[2] in months:
            return dt.date(int(match[3]), months[match[2]], int(match[1])).isoformat()
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 1 <= value <= 100000:
        base = dt.date(1904, 1, 1) if date1904 else dt.date(1899, 12, 30)
        return (base + dt.timedelta(days=math.floor(value))).isoformat()
    raise ExtractionError('Invalid or unavailable source date')


def date_in_period(value, period, date1904=False):
    """Resolve a yearless source date only against its explicit workbook period."""
    if isinstance(value,str):
        match=re.fullmatch(r'(\d{1,2})\s+([A-Za-z]{3})',value.strip())
        months={'jan':1,'feb':2,'mar':3,'apr':4,'mei':5,'may':5,'jun':6,'jul':7,
                'agu':8,'aug':8,'sep':9,'okt':10,'oct':10,'nov':11,'des':12,'dec':12}
        if match:
            month=months.get(match[2].lower())
            require(month==int(period[5:7]), 'Yearless source date disagrees with period')
            return dt.date(int(period[:4]),month,int(match[1])).isoformat()
    return excel_date(value,date1904)


class Workbook:
    """Minimal cached-value XLSX reader; no third-party dependency or network."""
    def __init__(self, path, allow_legacy_cache=False):
        path = Path(path)
        require(path.is_file() and 100 <= path.stat().st_size <= MAX_BYTES, 'Invalid XLSX size')
        data = path.read_bytes()
        self.sha256 = hashlib.sha256(data).hexdigest()
        self.zip = zipfile.ZipFile(io.BytesIO(data))
        entries = self.zip.infolist()
        require(len(entries) <= 1000, 'Too many ZIP entries')
        require(len(set(self.zip.namelist())) == len(entries), 'Duplicate ZIP paths')
        require(sum(e.file_size for e in entries) <= 64 * 1024 * 1024, 'Workbook expands beyond limit')
        require(all(e.file_size <= MAX_XML and not e.flag_bits & 1 for e in entries), 'Oversized or encrypted entry')
        names = self.zip.namelist()
        require(not any('..' in name.split('/') or name.startswith('/') for name in names), 'Unsafe ZIP path')
        require(allow_legacy_cache or not any(name.lower().endswith('vbaproject.bin') for name in names), 'Macros unsupported')
        require(allow_legacy_cache or not any(name.startswith('xl/externalLinks/') for name in names), 'External workbook links unsupported')
        require(self.zip.testzip() is None, 'Corrupt XLSX ZIP')
        wb, rels = self.xml('xl/workbook.xml'), self.xml('xl/_rels/workbook.xml.rels')
        self.date1904 = any(localname(n.tag) == 'workbookPr' and n.get('date1904') in ('1', 'true') for n in wb)
        links = {}
        for rel in rels:
            if rel.get('TargetMode') == 'External':
                continue
            if rel.get('Type') and not rel.get('Type').endswith('/worksheet'):
                continue
            target = rel.get('Target', '')
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            require(target.startswith('xl/') and '..' not in target.split('/'), 'Unsafe sheet target')
            links[rel.get('Id')] = target
        self.sheets = {}
        for item in wb.iter():
            if localname(item.tag) != 'sheet':
                continue
            rid = next((v for k, v in item.attrib.items() if localname(k) == 'id'), None)
            require(rid in links, 'Missing worksheet relationship')
            require(item.get('name') not in self.sheets, 'Duplicate worksheet name')
            self.sheets[item.get('name')] = links[rid]
        self.shared = []
        if 'xl/sharedStrings.xml' in names:
            for si in self.xml('xl/sharedStrings.xml'):
                self.shared.append(''.join(n.text or '' for n in si.iter() if localname(n.tag) == 't'))
        self.cache = {}

    def xml(self, path):
        try:
            data = self.zip.read(path)
        except KeyError as e:
            raise ExtractionError('Missing XLSX structure') from e
        require(len(data) <= MAX_XML, 'XML exceeds limit')
        require(b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper(), 'DTD/entities unsupported')
        return ET.fromstring(data)

    def sheet(self, name):
        require(name in self.sheets, 'Unsupported template: required sheet missing')
        if name in self.cache:
            return self.cache[name]
        result = {}
        for c in self.xml(self.sheets[name]).iter():
            if localname(c.tag) != 'c':
                continue
            address = c.get('r', '')
            require(CELL_RE.fullmatch(address), 'Invalid source cell address')
            require(address not in result, 'Duplicate source cell')
            require(len(result) < 300000, 'Too many cells in source sheet')
            raw = child(c, 'v')
            value = None if raw is None else raw.text
            kind = c.get('t')
            if kind == 'inlineStr':
                inline = child(c, 'is')
                value = ''.join(n.text or '' for n in inline.iter() if localname(n.tag) == 't') if inline is not None else None
            elif kind == 's' and value is not None:
                try:
                    value = self.shared[int(value)]
                except (IndexError, ValueError) as e:
                    raise ExtractionError('Invalid shared string') from e
            elif kind == 'e':
                value = {'excel_error': value}
            elif kind == 'b':
                value = value == '1'
            elif kind not in ('str', 'd') and value not in (None, ''):
                try:
                    value = float(value)
                    require(math.isfinite(value), 'Nonfinite source number')
                    if value.is_integer():
                        value = int(value)
                except (ValueError, TypeError):
                    raise ExtractionError('Invalid numeric cached value')
            result[address] = value
        self.cache[name] = result
        return result

    def get(self, sheet, cell):
        value = self.sheet(sheet).get(cell)
        require(not isinstance(value, dict), 'Excel error in a required source cell')
        return value

    def guard(self, sheet, cell, expected):
        require(normalized(self.get(sheet, cell)) == normalized(expected), 'Source template header changed; review required')

    def guard_prefix(self, sheet, cell, expected):
        require(normalized(self.get(sheet,cell)).startswith(normalized(expected)), 'Source template header changed; review required')

    def rows(self, sheet, start=1):
        numbers = sorted({int(CELL_RE.fullmatch(ref)[2]) for ref in self.sheet(sheet)})
        return [n for n in numbers if n >= start]


META_LAYOUTS = {
    'CUKAI': ('PPIC_UPLOAD', 'C6', 'C7', 'C8', 'C9'),
    'BARANG JADI': ('PPIC_UPLOAD', 'C6', 'C7', 'C8', 'C9'),
    'SDM VERPACK': ('PPIC_UPLOAD', 'B7', 'B8', 'B9', 'B10'),
    'GILING': ('PPIC_UPLOAD', 'B7', 'B8', 'B9', 'B10'),
    'VERPACK': ('PPIC_UPLOAD', 'B5', 'B6', 'B8', 'B7'),
    'KAS BANK': ('PPIC_UPLOAD', 'B5', 'B6', 'B8', 'B7'),
    'BAHAN BAKU': ('PETUNJUK_PPIC', 'B7', 'B8', 'B9', 'B11'),
    'TSG': ('PETUNJUK_PPIC', 'C5', 'C6', 'C7', 'C9'),
    'DO': ('12 PETUNJUK WEB', 'B6', 'B7', 'B8', 'B9'),
}


class Extractor:
    def __init__(self, workbook, manifest):
        self.w = workbook
        division = manifest.get('division', manifest.get('category'))
        require(division in META_LAYOUTS, 'Unsupported division or source template')
        sheet, dc, pc, cc, vc = META_LAYOUTS[division]
        period = str(workbook.get(sheet, pc))
        version = str(workbook.get(sheet, vc))
        cutoff = excel_date(workbook.get(sheet, cc), workbook.date1904)
        require(workbook.get(sheet, dc) == division, 'Manifest and worksheet division differ')
        require(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', period), 'Invalid period')
        require(re.fullmatch(r'V\d{3,}', version), 'Version requires at least three digits')
        require(cutoff.startswith(period + '-'), 'Cutoff is outside period')
        for field, expected in [('period', period), ('version', version), ('cutoff', cutoff), ('sha256', workbook.sha256)]:
            require(manifest.get(field) == expected, 'Manifest and actual workbook ' + field + ' differ')
        self.output = {'schema_version':'ppic-robot-facts-v1', 'division':division,
                       'period':period, 'cutoff':cutoff, 'version':version,
                       'source_sha256':workbook.sha256, 'facts':[], 'issues':[]}
        self.keys = set()
        self.fact('source_data_cutoff', 'Tanggal data buku/sumber', cutoff, 'tanggal', 'METADATA', sheet, cc,
                  note='Tanggal referensi, penyusunan, dan unggah tidak menaikkan tanggal data.')

    @property
    def cutoff(self):
        return self.output['cutoff']

    def fact(self, key, label, value, unit, scope, sheet, cells, quality='SOURCE', note=''):
        require(KEY_RE.fullmatch(key) and key not in self.keys, 'Invalid or duplicate fact key')
        require(quality in QUALITIES, 'Invalid fact quality')
        require(value is None or isinstance(value, (int, float, str)) and not isinstance(value, bool), 'Invalid fact value')
        require(not isinstance(value, float) or math.isfinite(value), 'Nonfinite fact value')
        require(not isinstance(value, str) or len(value) <= 500, 'Fact string too long')
        require(len(self.output['facts']) < MAX_FACTS, 'Facts limit exceeded; narrow the template')
        self.keys.add(key)
        self.output['facts'].append({'key':key, 'label':text_limit(label,240), 'value':value,
            'unit':text_limit(unit,240), 'scope':text_limit(scope,240), 'source_sheet':text_limit(sheet,120),
            'source_range':text_limit(cells,120), 'quality':'MISSING' if value is None else quality,
            'note':text_limit(note,1200)})
        return key

    def number(self, key, label, sheet, cell, unit, scope='BOOK', quality='SOURCE', note=''):
        value = self.w.get(sheet, cell)
        require(value is None or isinstance(value,(int,float)) and not isinstance(value,bool), 'Expected numeric cached source value')
        return self.fact(key,label,value,unit,scope,sheet,cell,quality,note)

    def issue(self, code, severity, title, detail, keys, sheet, cells):
        require(len(self.output['issues']) < MAX_ISSUES, 'Issues limit exceeded')
        require(all(key in self.keys for key in keys), 'Issue cites a missing fact')
        self.output['issues'].append({'code':code,'severity':severity,'title':text_limit(title,240),
            'detail':text_limit(detail,1200),'fact_keys':keys,'source_sheet':text_limit(sheet,120),
            'source_range':text_limit(cells,120)})

    def finish(self):
        require(len(json.dumps(self.output,ensure_ascii=False).encode()) <= MAX_PAYLOAD, 'Payload exceeds limit')
        return self.output


def extract_cukai(e):
    w=e.w; s='Laporan November'
    w.guard(s,'B7','HJE')
    for key,label,cell in [('book_opening_keping','Saldo awal buku pita','C11'),
                           ('book_receipt_keping','Pembelian/penerimaan buku pita','D11'),
                           ('book_used_keping','Pemakaian buku pita','E11'),
                           ('book_closing_keping','Saldo akhir buku pita','F11')]:
        e.number(key,label,s,cell,'keping',note='WORKING / OPEN RECON; saldo buku belum membuktikan lokasi fisik.')
    e.number('not_arrived_keping','Pita belum terkonfirmasi tiba',s,'D27','keping','LOCATION',note='Lokasi pemotongan/penyerahan perlu dikonfirmasi.')
    e.number('factory_estimate_keping','Estimasi pita di pabrik',s,'E27','keping','FACTORY_ESTIMATE','ESTIMATE','Saldo awal diasumsikan di pabrik; opname belum tersedia.')
    p='PPIC_UPLOAD'; w.guard(p,'B19','HJE')
    for r in w.rows(p,20):
        hje=w.get(p,f'B{r}')
        if not isinstance(hje,(int,float)): continue
        tag='hje_'+keypart(hje)
        for suffix,col,label,quality,scope,unit in [
            ('book_keping','C','Saldo buku','SOURCE','BOOK','keping'),
            ('factory_keping','D','Estimasi saldo di pabrik','ESTIMATE','FACTORY_ESTIMATE','keping'),
            ('carton_factor','E','Pack per karton','SOURCE','CONVERSION','pack/karton'),
            ('book_carton','F','Kapasitas saldo buku','ESTIMATE','BOOK_CAPACITY','karton'),
            ('factory_carton','G','Kapasitas estimasi pabrik','ESTIMATE','FACTORY_ESTIMATE','karton'),
            ('not_arrived_keping','H','Belum terkonfirmasi tiba','SOURCE','LOCATION','keping')]:
            value=w.get(p,f'{col}{r}')
            if isinstance(value,str): value=None
            e.fact(tag+'_'+suffix,f'HJE {hje} · {label}',value,unit,scope,p,f'{col}{r}',quality,
                   'Berdasarkan kelompok HJE, belum alokasi merek. Faktor kosong tidak diisi otomatis; '+str(w.get(p,f'I{r}') or ''))
        if w.get(p,f'E{r}') is None:
            e.issue('CUKAI_FACTOR_'+keypart(hje).upper(),'MEDIUM','Faktor karton pita belum terverifikasi',
                    'Kapasitas karton kelompok ini tetap kosong sampai faktor disahkan.',[tag+'_carton_factor'],p,f'B{r}:I{r}')
    e.issue('CUKAI_LOCATION_UNVERIFIED','HIGH','Saldo buku berbeda dari estimasi lokasi pabrik',
            'Jadwal produksi memerlukan konfirmasi pita yang benar-benar tersedia di pabrik. Estimasi pabrik masih memakai asumsi saldo awal.',
            ['book_closing_keping','not_arrived_keping','factory_estimate_keping'],s,'B24:F31')
    e.issue('CUKAI_BRAND_ALLOCATION','MEDIUM','Alokasi pita per merek belum tersedia',
            str(w.get(p,'B33') or 'Sumber baru membedakan kelompok HJE; tidak boleh mengalokasikan bebas ke merek.'),[],p,'B33')
    e.issue('CUKAI_HPP_UNAPPROVED','MEDIUM','HPP dan WAC pita belum disahkan',str(w.get(p,'B30') or 'Nilai kerja perlu pengesahan.'),[],p,'B30')


def extract_bj(e):
    w=e.w;p='PPIC_UPLOAD';s='Rekap per merek';ref='Referensi Web'
    w.guard_prefix(p,'B20','Saldo awal')
    for key,label,row,quality,scope in [
        ('book_opening_pack','Saldo awal buku',20,'SOURCE','BOOK'),
        ('book_receipt_pack','Penerimaan buku',21,'SOURCE','BOOK'),
        ('book_delivery_pack','Pengeluaran DO/SJ buku',22,'SOURCE','BOOK'),
        ('book_closing_pack','Saldo akhir buku',23,'SOURCE','BOOK'),
        ('reference_receipt_pack','Penerimaan referensi tambahan',24,'REFERENCE','UNPOSTED_REFERENCE'),
        ('indicative_closing_pack','Saldo indikatif setelah referensi',25,'REFERENCE','INDICATIVE')]:
        e.number(key,label,p,f'C{row}','pack',scope,quality,str(w.get(p,f'D{row}') or ''))
    w.guard(s,'A13','SKU');w.guard(s,'R13','Indikatif pack')
    add_by_sku={};ref_rows={}
    for r in w.rows(ref,10):
        sku=w.get(ref,f'B{r}'); value=w.get(ref,f'H{r}')
        if not isinstance(sku,str) or not re.fullmatch(r'C-\d+',sku):continue
        require(isinstance(value,(int,float)), 'Missing reference allocation quantity')
        add_by_sku[sku]=add_by_sku.get(sku,0)+value
        ref_rows.setdefault(sku,[]).append(r)
    book_sum=0;indicative_sum=0;negative=[]
    for r in w.rows(s,14):
        sku=w.get(s,f'A{r}')
        if not isinstance(sku,str) or not re.fullmatch(r'C-\d+',sku):continue
        brand=w.get(s,f'B{r}') or sku; val=w.get(s,f'R{r}')
        require(isinstance(val,(int,float)), 'Missing SKU closing quantity')
        base='sku_'+keypart(sku);book=val-add_by_sku.get(sku,0)
        book_sum+=book;indicative_sum+=val
        note='Saldo indikatif dikurangi penerimaan referensi yang belum diposting. '
        note+=f"Referensi Web!H{min(ref_rows[sku])}:H{max(ref_rows[sku])}." if sku in ref_rows else 'SKU ini tidak memiliki tambahan referensi.'
        e.fact(base+'_book_pack',f'{sku} · {brand}',book,'pack','BOOK_DERIVED',s,f'R{r}','SOURCE',note)
        e.number(base+'_carton_factor',f'{sku} · Isi karton',s,f'C{r}','pack/karton','CONVERSION',note='Faktor master Barang Jadi; tidak membuktikan faktor pita untuk refill.')
        if book<0:negative.append(base+'_book_pack')
    require(math.isclose(book_sum,w.get(p,'C23'),abs_tol=0.00001), 'SKU book quantities do not reconcile to summary')
    require(math.isclose(indicative_sum,w.get(p,'C25'),abs_tol=0.00001), 'SKU indicative quantities do not reconcile')
    if negative:
        e.issue('BJ_NEGATIVE_STOCK','HIGH','Ada saldo buku negatif per SKU','Periksa saldo awal dan mutasi SKU; jangan menghilangkan saldo negatif dari rekonsiliasi.',negative,s,'A14:U52')
    e.fact('ready_for_delivery_pack','Saldo siap kirim setelah QC',None,'pack','READY_STOCK',ref,'L10:M12',note='Kolom tertahan/rusak dan siap belum lengkap; saldo indikatif bukan ready stock.')
    e.issue('BJ_OUTBOUND_COVERAGE','HIGH','Pengeluaran setelah cut-off buku belum lengkap',str(w.get(p,'B30') or ''),['book_closing_pack','reference_receipt_pack','indicative_closing_pack'],p,'B27:D30')
    e.issue('BJ_QC_READY_MISSING','HIGH','Kuantitas siap kirim belum dapat dipastikan','Penerimaan fisik referensi belum menjelaskan semua hasil QC, barang tertahan, dan pengeluaran lanjutan.',['ready_for_delivery_pack'],ref,'A7:N12')


def extract_giling(e):
    w=e.w;s='00_RINGKASAN';w.guard_prefix(s,'A5','Produksi baru')
    for key,label,cell,unit,scope in [
        ('daily_output_batang','Hasil giling tanggal terakhir','B5','batang','DAILY'),
        ('daily_gross_wage','Upah bruto tanggal terakhir','B6','Rp','DAILY'),
        ('cumulative_output_batang','Hasil giling kumulatif berlapor','B7','batang','REPORTED_CUMULATIVE'),
        ('cumulative_gross_wage','Upah bruto kumulatif berlapor','B8','Rp','REPORTED_CUMULATIVE')]:
        e.number(key,label,s,cell,unit,scope,note='Akumulasi produksi bukan stok fisik. Upah bruto bukan bukti pembayaran.')
    t='01_MUTASI_HARIAN';w.guard(t,'A3','Tanggal')
    for r in w.rows(t,4):
        try:date=excel_date(w.get(t,f'A{r}'),w.date1904)
        except (ExtractionError,ValueError):continue
        if date>e.cutoff:continue
        tag='day_'+date.replace('-','_')
        e.number(tag+'_output',date+' · Hasil giling',t,f'B{r}','batang','DAILY',note='Hanya tanggal berlapor; hari lain tidak diisi nol/libur.')
        e.number(tag+'_wage',date+' · Upah bruto',t,f'D{r}','Rp','DAILY')
    t='03_SALDO_MEREK';w.guard(t,'A3','Merek')
    for r in w.rows(t,4):
        brand=w.get(t,f'A{r}')
        if not isinstance(brand,str) or 'TOTAL' in brand.upper():continue
        if not isinstance(w.get(t,f'B{r}'),(int,float)):continue
        e.number('brand_'+keypart(brand)+'_cumulative',brand+' · Produksi kumulatif',t,f'B{r}','batang','REPORTED_CUMULATIVE',note='Belum dikurangi serah ke Verpack; tidak boleh disebut saldo fisik.')
    e.fact('physical_stock_batang','Stok fisik batangan',None,'batang','PHYSICAL_STOCK',s,'B11:C11',note=str(w.get(s,'C11') or ''))
    e.fact('actual_weight_gram','Berat aktual per batang',None,'gram/batang','MEASURED_WEIGHT',s,'B12:C12',note=str(w.get(s,'C12') or ''))
    e.issue('GILING_HANDOFF_MISSING','HIGH','Saldo batangan antarproses belum terbukti','Saldo awal fisik dan serah terima ke Verpack belum lengkap.',['physical_stock_batang','cumulative_output_batang'],s,'B11:C11')
    e.issue('GILING_WEIGHT_MISSING','MEDIUM','Berat aktual dan konsumsi bahan belum diukur','Transfer TSG ke Giling bukan bukti konsumsi aktual per merek.',['actual_weight_gram'],s,'B12:C12')


def extract_verpack(e):
    w=e.w;s='01_RINGKASAN';w.guard(s,'A5','Total hasil pack')
    e.number('cumulative_output_pack','Total hasil Verpack pada sumber admin',s,'B5','pack','REPORTED_CUMULATIVE',note='Cakupan sumber admin; tanggal kosong tidak membuktikan nihil produksi.')
    e.number('cumulative_gross_wage','Total upah bruto admin',s,'B6','Rp','REPORTED_CUMULATIVE',note='Belum menjadi gaji bersih/bukti pembayaran.')
    e.number('hje_indicative_value','Nilai HJE indikatif',s,'B7','Rp','RETAIL_REFERENCE','REFERENCE','Bukan omzet, HPP, atau nilai persediaan.')
    t='03_MEREK_HJE';w.guard(t,'A1','Merek')
    for r in w.rows(t,2):
        brand=w.get(t,f'A{r}')
        if not isinstance(brand,str) or 'TOTAL' in brand.upper() or not isinstance(w.get(t,f'C{r}'),(int,float)):continue
        tag='brand_'+keypart(brand)
        e.number(tag+'_pack',brand+' · Hasil kumulatif',t,f'C{r}','pack','REPORTED_CUMULATIVE')
        e.number(tag+'_carton',brand+' · Karton setara kumulatif',t,f'F{r}','karton','EQUIVALENT_CARTON','ESTIMATE','Konversi per merek; tidak membuktikan karton fisik.')
        e.number(tag+'_carton_factor',brand+' · Isi karton',t,f'E{r}','pack/karton','CONVERSION')
    t='02_MUTASI_HARIAN';w.guard(t,'A1','Tanggal');latest=None
    for r in w.rows(t,2):
        try:date=excel_date(w.get(t,f'A{r}'),w.date1904)
        except (ExtractionError,ValueError):continue
        if date>e.cutoff:continue
        tag='day_'+date.replace('-','_');pack=w.get(t,f'I{r}');wage=w.get(t,f'J{r}')
        # Zero totals with no nonzero brand detail cannot establish no activity.
        available=isinstance(pack,(int,float)) and (pack!=0 or isinstance(wage,(int,float)) and wage!=0)
        e.fact(tag+'_pack',date+' · Hasil Verpack',pack if available else None,'pack','DAILY',t,f'I{r}',note='Tanpa rincian hasil: tidak disimpulkan nol/libur.' if not available else '')
        e.fact(tag+'_wage',date+' · Upah bruto',wage if available else None,'Rp','DAILY',t,f'J{r}',note='Tanpa rincian hasil: perlu sumber harian.' if not available else '')
        if date==e.cutoff:latest=r
    if latest is not None:
        brandrows={}
        for r in w.rows('03_MEREK_HJE',2):
            name=w.get('03_MEREK_HJE',f'A{r}')
            if not isinstance(name,str) or not name.strip():continue
            match_key=brand_match_key(name)
            require(match_key not in brandrows,'Ambiguous brand conversion rows')
            brandrows[match_key]=r
        for col in 'BCDEFGH':
            brand=w.get(t,f'{col}1');qty=w.get(t,f'{col}{latest}')
            if not isinstance(qty,(int,float)) or qty<=0:continue
            br=brandrows.get(brand_match_key(brand));factor=w.get('03_MEREK_HJE',f'E{br}') if br else None
            equivalent=qty/factor if isinstance(factor,(int,float)) and factor>0 else None
            tag='latest_'+keypart(brand)
            e.fact(tag+'_pack',str(brand)+' · Hasil tanggal terakhir',qty,'pack','DAILY',t,f'{col}{latest}')
            note=f'Pack dibagi faktor 03_MEREK_HJE!E{br}; konversi per merek, bukan karton fisik.' if equivalent is not None else 'Faktor karton untuk merek ini belum tersedia atau belum cocok dengan tabel konversi; kapasitas tetap kosong.'
            e.fact(tag+'_carton',str(brand)+' · Karton tanggal terakhir',equivalent,'karton','DAILY_EQUIVALENT',t,f'{col}{latest}','ESTIMATE',note)
    e.issue('VERPACK_COVERAGE_GAP','HIGH','Rincian admin belum lengkap pada tanggal tertentu',str(w.get(s,'A14') or ''),['cumulative_output_pack'],s,'A14')
    e.issue('VERPACK_PHYSICAL_UNKNOWN','MEDIUM','Hasil dan saldo pita tidak membuktikan stok fisik Verpack','Konfirmasi transfer Giling, hasil packing, QC, dan serah Barang Jadi.',['cumulative_output_pack'],s,'A12:A16')
    t='06_REKONSILIASI'
    if t in w.sheets:
        w.guard(t,'A1','Tanggal');w.guard(t,'D1','Selisih 12');w.guard(t,'G1','Selisih 16');w.guard(t,'J1','Selisih refill')
        for r in w.rows(t,2):
            try:date=excel_date(w.get(t,f'A{r}'),w.date1904)
            except (ExtractionError,ValueError):continue
            if date>e.cutoff:continue
            for col,group in [('D','isi12'),('G','isi16'),('J','refill')]:
                value=w.get(t,f'{col}{r}')
                if not isinstance(value,(int,float)) or value==0:continue
                e.number('recon_'+date.replace('-','_')+'_'+group+'_difference',date+' · Selisih packing–pita '+group,
                         t,f'{col}{r}','pack/keping','REPORTED_RECON_DIFFERENCE',note='Selisih antarcatatan, belum membuktikan kehilangan; periksa cakupan tanggal dan dokumen pemakaian.')


def extract_sdm_verpack(e):
    w=e.w;s='00_RINGKASAN';w.guard(s,'A12','Merek');w.guard(s,'E12','Upah bruto')
    for r in (13,14):
        brand=w.get(s,f'A{r}');tag='brand_'+keypart(brand)
        e.number(tag+'_pack',str(brand)+' · Hasil periode sumber',s,f'B{r}','pack','SOURCE_WEEK')
        e.number(tag+'_wage',str(brand)+' · Upah bruto periode sumber',s,f'E{r}','Rp','SOURCE_WEEK')
        e.number(tag+'_carton',str(brand)+' · Karton setara periode sumber',s,f'D{r}','karton','SOURCE_WEEK','ESTIMATE')
    e.number('source_week_output_pack','Total hasil periode sumber',s,'B15','pack','SOURCE_WEEK')
    e.number('source_week_gross_wage','Total upah bruto periode sumber',s,'E15','Rp','SOURCE_WEEK')
    e.number('source_worker_count','Jumlah ID pekerja dalam rekap',s,'B18','orang','SOURCE_WEEK',note='Jumlah ID agregat, bukan absensi resmi.')
    e.number('prior_version_wage_difference','Selisih bruto terhadap versi pembanding','04_REKONSILIASI','D19','Rp','VERSION_COMPARISON','REFERENCE','Aritmetika sumber; sumber lama perlu diperiksa untuk menentukan penyebab.')
    e.issue('SDM_WEEK_SCOPE','MEDIUM','Cakupan mingguan harus dipertahankan',str(w.get(s,'A32') or '')+' '+str(w.get(s,'A33') or ''),['source_week_output_pack'],s,'A32:A33')
    e.issue('SDM_GROSS_NOT_NET','HIGH','Upah bruto belum menjadi pembayaran final',str(w.get(s,'A36') or 'Bonus, potongan, kasbon, dan gaji bersih perlu pengesahan.'),['source_week_gross_wage'],s,'A36')
    e.issue('SDM_VERSION_RECON','MEDIUM','Selisih upah antarversi belum ditutup','Perlu bukti perubahan baris sumber dan versi lama.',['prior_version_wage_difference'],'04_REKONSILIASI','A15:D19')


def extract_bb(e):
    w=e.w;s='DATA_BB_PPIC'
    for cell,label in [('E1','code'),('M1','closing_qty'),('W1','physical_qty'),('Z1','capacity_carton_equiv_simulation')]:w.guard(s,cell,label)
    unpriced=[];missing_capacity=[];stock_keys=[]
    for r in w.rows(s,2):
        code=w.get(s,f'E{r}')
        if not isinstance(code,str) or not code.strip():continue
        require(w.get(s,f'A{r}')==e.output['period'] and excel_date(w.get(s,f'B{r}'),w.date1904)==e.cutoff and w.get(s,f'C{r}')==e.output['version'],'Material row metadata disagrees')
        tag='material_'+keypart(code);name=w.get(s,f'F{r}');unit=w.get(s,f'G{r}') or ''
        k=e.number(tag+'_closing',f'{code} · {name}',s,f'M{r}',unit,'BOOK',note='Kuantitas beda satuan tidak dijumlahkan. '+str(w.get(s,f'AD{r}') or ''))
        stock_keys.append(k)
        e.number(tag+'_unit_price',f'{code} · Harga acuan',s,f'N{r}','Rp/'+unit,'REFERENCE_PRICE','REFERENCE',str(w.get(s,f'O{r}') or ''))
        capacity=w.get(s,f'Z{r}')
        if capacity is not None:
            e.number(tag+'_capacity_carton',f'{code} · Simulasi kapasitas satu bahan',s,f'Z{r}','karton','SINGLE_MATERIAL_SIMULATION','ESTIMATE',str(w.get(s,f'AC{r}') or ''))
        else:missing_capacity.append(k)
        if isinstance(w.get(s,f'M{r}'),(int,float)) and w.get(s,f'M{r}')>0 and w.get(s,f'N{r}') is None:unpriced.append(k)
    e.fact('material_count','Kode bahan tercakup',len(stock_keys),'kode','COVERAGE',s,'E2:E'+str(max(w.rows(s))))
    e.fact('positive_unpriced_material_count','Kode bersaldo positif belum berharga',len(unpriced),'kode','COVERAGE',s,'M2:N'+str(max(w.rows(s))))
    e.fact('missing_capacity_material_count','Kode tanpa koefisien kapasitas',len(missing_capacity),'kode','COVERAGE',s,'Z2:AC'+str(max(w.rows(s))))
    p='Ringkasan'
    e.number('partial_closing_reference_value','Nilai saldo bahan berharga (parsial)',p,'B11','Rp','PARTIAL_VALUATION','REFERENCE',str(w.get(p,'C11') or ''))
    e.number('selected_po_commitment_value','Komitmen nominal PO yang berharga',p,'B22','Rp','PARTIAL_PO_COMMITMENT','REFERENCE','Tidak mewakili seluruh PO; bukan persediaan atau bukti pembayaran.')
    t='PO_BB_PPIC';w.guard(t,'A1','po_line_id');w.guard(t,'M1','remaining_po_qty')
    for r in w.rows(t,2):
        ident=w.get(t,f'A{r}')
        if not isinstance(ident,str) or not ident:continue
        tag='po_'+keypart(ident)
        e.number(tag+'_remaining','Sisa PO '+str(w.get(t,f'B{r}'))+' · '+str(w.get(t,f'E{r}')),t,f'M{r}',str(w.get(t,f'H{r}') or ''),'PURCHASE_ORDER',note=str(w.get(t,f'S{r}') or '')+'; PO tidak menambah stok sebelum penerimaan.')
        over=w.get(t,f'N{r}')
        if isinstance(over,(int,float)) and over>0:
            e.number(tag+'_overdelivery','Lebih kirim PO '+str(w.get(t,f'B{r}'))+' · '+str(w.get(t,f'E{r}')),t,f'N{r}',str(w.get(t,f'H{r}') or ''),'PURCHASE_ORDER',note=str(w.get(t,f'S{r}') or ''))
    e.issue('BB_BOM_UNAPPROVED','HIGH','Kapasitas seluruh rangkaian bahan belum tersedia','Simulasi satu bahan tidak membuktikan kapasitas produksi lengkap; BOM dan bahan pembatas perlu disahkan.',['missing_capacity_material_count'],s,'Y1:AC'+str(max(w.rows(s))))
    if unpriced:e.issue('BB_UNPRICED_STOCK','MEDIUM','Saldo bahan positif belum seluruhnya berharga','Valuasi persediaan parsial; jangan menilai kode tanpa harga sebagai nol.',['positive_unpriced_material_count'],s,'M1:V'+str(max(w.rows(s))))
    e.issue('BB_PO_ALLOCATION','MEDIUM','Pemetaan PO dan penerimaan masih terbuka',str(w.get(p,'C25') or '')+' '+str(w.get(p,'C26') or ''),[],p,'C24:C27')


def extract_tsg(e):
    w=e.w;s='Rekap Buku Utama';w.guard(s,'A3','Uraian')
    for key,label,row in [('book_opening_kg','Saldo awal buku TSG',4),('book_incoming_kg','Penerimaan buku TSG',5),('transferred_to_giling_kg','Serah TSG ke Giling',6),('book_closing_kg','Saldo akhir buku TSG',7)]:
        e.number(key,label,s,f'B{row}','kg','BOOK',note='Pengeluaran ke Giling bukan konsumsi aktual; belum penutupan fisik.')
    e.number('book_closing_reference_value','Nilai acuan saldo TSG',s,'D7','Rp','REFERENCE_VALUATION','REFERENCE')
    t='Web SKT Pembanding'
    for r in w.rows(t,2):
        try:date=date_in_period(w.get(t,f'A{r}'),e.output['period'],w.date1904)
        except (ExtractionError,ValueError):continue
        name=w.get(t,f'B{r}')
        if not isinstance(name,str) or not isinstance(w.get(t,f'F{r}'),(int,float)):continue
        tag='reference_'+date.replace('-','_')+'_'+keypart(name)
        e.number(tag+'_stock','Referensi web '+name+' · '+date,t,f'F{r}','kg','SEPARATE_WEB_REFERENCE','REFERENCE',str(w.get(t,f'G{r}') or '')+'; tanggal/scope berbeda, tidak ditambahkan ke saldo buku.')
    e.issue('TSG_DIFFERENT_CUTOFF','MEDIUM','Buku TSG dan web pembanding berbeda tanggal','Samakan cut-off dan status sebelum menyimpulkan selisih fisik.',['book_closing_kg'],'Kontrol Rekonsiliasi','B2:C2')
    e.issue('TSG_CONSUMPTION_UNKNOWN','HIGH','Konsumsi TSG aktual belum terbukti','Bahan yang diserahkan ke Giling masih dapat berada pada WIP, retur, atau rijek.',['transferred_to_giling_kg'],'Kontrol Rekonsiliasi','B7:C7')


def extract_cash(e):
    w=e.w;s='00 Dashboard';w.guard(s,'A6','Saldo indikatif')
    for key,label,cell,scope,quality,note in [
        ('opening_balance','Saldo awal empat ledger','B3','IDENTIFIED_LEDGER','SOURCE','Belum closing final.'),
        ('identified_receipts','Penerimaan bank teridentifikasi','B4','IDENTIFIED_LEDGER','SOURCE','Tidak termasuk rekening penampung pihak ketiga.'),
        ('identified_payments','Pengeluaran bank teridentifikasi','B5','IDENTIFIED_LEDGER','SOURCE','Rekening koran belum lengkap.'),
        ('indicative_balance','Saldo kas/bank indikatif','B6','INDICATIVE_BALANCE','ESTIMATE','Belum bank certified; tidak seluruh mutasi/kas tercakup.'),
        ('do_reference_value','Nilai DO acuan','B7','DO_REFERENCE','REFERENCE','Nilai DO bukan kas masuk atau saldo piutang.'),
        ('excise_tobacco_tax_paid','Cukai dan pajak rokok dengan bukti bayar','B9','IDENTIFIED_PAYMENT','SOURCE','Jangan dihitung ulang dari referensi dokumen.'),
        ('tsg_reference_obligation','Kewajiban TSG acuan','B10','REFERENCE_OBLIGATION','REFERENCE','Pembayaran terbaru belum seluruhnya diverifikasi.'),
        ('third_party_new_receipt','Penerimaan tambahan rekening penampung','B12','THIRD_PARTY_CLEARING','SOURCE','Terpisah dari bank perusahaan; perlu alokasi DP/DO/SJ.')]:
        e.number(key,label,s,cell,'Rp',scope,quality,note)
    e.number('excise_vat_document_value','PPN HT pada dokumen CK-1','12 Update 20Nov','B17','Rp','DOCUMENT_REFERENCE','REFERENCE','Belum ada bukti pembayaran PPN tersendiri; bukan otomatis kewajiban final atau pembayaran.')
    e.issue('CASH_BANK_STATEMENT_MISSING','HIGH','Saldo kas/bank belum direkonsiliasi penuh','Rekening koran lengkap, saldo kas lain, dan mutasi lanjutan diperlukan sebelum menetapkan dana bebas.',['indicative_balance'],'PPIC_UPLOAD','A18')
    e.issue('CASH_RECEIPT_ALLOCATION','MEDIUM','Penerimaan penampung belum dialokasikan ke dokumen','Pembayaran pelanggan tidak disimpulkan lunas tanpa alokasi DP/DO/SJ dan bukti yang sesuai.',['third_party_new_receipt'],'PPIC_UPLOAD','A19:A20')


def extract_do(e):
    w=e.w;s='01 RINGKASAN';w.guard(s,'A8','Total pack');w.guard(s,'A11','TOTAL NILAI DO (Rp)')
    for key,label,cell,unit,quality,note in [
        ('delivery_note_count','Jumlah Surat Jalan','B6','SJ','SOURCE',''),
        ('transaction_line_count','Baris transaksi DO','B7','baris','SOURCE',''),
        ('delivered_pack','Total pack keluar DO','B8','pack','SOURCE','Termasuk sampel.'),
        ('regular_pack','Pack reguler DO','B9','pack','SOURCE',''),
        ('sample_pack','Pack sampel DO','B10','pack','SOURCE','Sampel bernilai nol menurut sumber.'),
        ('working_sales_value','Nilai DO menurut harga kerja','B11','Rp','REFERENCE','Bukan kas masuk, saldo piutang, atau invoice final.'),
        ('equivalent_carton','Karton setara DO','B16','karton','ESTIMATE','Konversi master per SKU, bukan karton fisik.')]:
        e.number(key,label,s,cell,unit,'DELIVERY',quality,note)
    e.fact('verified_receivable','Saldo piutang terverifikasi',None,'Rp','RECEIVABLE',s,'B15',note='Saldo awal, invoice final, dan alokasi pembayaran belum lengkap.')
    t='04 PER MEREK';w.guard(t,'A4','SKU');w.guard(t,'F4','Total pack')
    for r in w.rows(t,5):
        sku=w.get(t,f'A{r}')
        if not isinstance(sku,str) or not re.fullmatch(r'C-\d+',sku):continue
        e.number('sku_'+keypart(sku)+'_delivered',sku+' · '+str(w.get(t,f'B{r}')),t,f'F{r}','pack','DELIVERY')
    e.issue('DO_COVERAGE_GAP','HIGH','Transaksi setelah cut-off belum tersedia','Tanggal tanpa SJ di sumber bukan bukti tidak ada pengiriman; lengkapi transaksi setelah tanggal sumber.',['delivered_pack'],'12 PETUNJUK WEB','B8:C8')
    e.issue('DO_RECEIVABLE_UNVERIFIED','HIGH','Piutang belum dapat disahkan','Perlu saldo awal, invoice final, bukti pembayaran, dan alokasi per dokumen.',['verified_receivable'],'12 PETUNJUK WEB','B16:C16')


HANDLERS={'CUKAI':extract_cukai,'BARANG JADI':extract_bj,'GILING':extract_giling,
          'VERPACK':extract_verpack,'SDM VERPACK':extract_sdm_verpack,
          'BAHAN BAKU':extract_bb,'TSG':extract_tsg,'KAS BANK':extract_cash,'DO':extract_do}


def extract_registered_giling_diagnostics(request):
    """Inspect cached headers/totals of a previously registered legacy source.

    This explicit diagnostic mode cannot produce payroll or assign dates from a
    filename. It permits reading a legacy macro container without reading or
    executing VBA or resolving external links. The caller supplies the already verified registry metadata.
    Observed worksheet dates remain separate from that metadata.
    """
    manifest=request['manifest']
    require(manifest.get('division')=='SDM GILING','Legacy diagnostics support SDM GILING only')
    w=Workbook(request['local_path'],allow_legacy_cache=True)
    require(manifest.get('sha256')==w.sha256,'Manifest and actual workbook sha256 differ')
    period=manifest.get('period','');cutoff=manifest.get('cutoff','');version=manifest.get('version','')
    require(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',period),'Invalid registered period')
    require(dt.date.fromisoformat(cutoff).isoformat()==cutoff and cutoff.startswith(period+'-'),'Invalid registered cutoff')
    require(re.fullmatch(r'V\d{3,}',version),'Invalid registered version')
    e=object.__new__(Extractor);e.w=w;e.keys=set()
    e.output={'schema_version':'ppic-robot-facts-v1','division':'SDM GILING','period':period,
              'cutoff':cutoff,'version':version,'source_sha256':w.sha256,'facts':[],'issues':[]}
    e.fact('registered_source_cutoff','Cut-off pada register sumber',cutoff,'tanggal','REGISTRY_METADATA',
           'PPIC_SOURCE_REGISTRY','cutoff',note='Metadata register, bukan pengesahan tanggal pada isi workbook.')
    observed=[];positive=[]
    days=['JUMAT','SABTU','SENIN','SELASA','RABU','KAMIS']
    for sheet in days:
        w.guard(sheet,'B3','TANGGAL');w.guard(sheet,'V6','TOTAL GILING');w.guard(sheet,'W6','TOTAL UPAH')
        date=excel_date(w.get(sheet,'D3'),w.date1904)
        duplicate_date=excel_date(w.get(sheet,'R3'),w.date1904)
        require(date==duplicate_date,'Conflicting date headers inside a daily sheet')
        require(date.startswith(period+'-'),'Daily header is outside registered period')
        observed.append((date,sheet))
        e.fact('sheet_'+keypart(sheet)+'_header_date',sheet+' · Tanggal tertulis',date,'tanggal','OBSERVED_HEADER',sheet,'D3:R3')
        qty=w.get(sheet,'V5');wage=w.get(sheet,'W5')
        require(qty is None or isinstance(qty,(int,float)),'Invalid legacy daily total')
        require(wage is None or isinstance(wage,(int,float)),'Invalid legacy daily wage')
        if (qty or 0)>0 or (wage or 0)>0:
            positive.append((date,sheet,qty,wage))
            e.fact('sheet_'+keypart(sheet)+'_qty_reference',sheet+' · Jumlah tertulis',qty,'batang','UNVERIFIED_DATE_REFERENCE',sheet,'V5','REFERENCE','Tanggal sumber belum disahkan; angka tidak dipindah ke tanggal pada nama file.')
            e.fact('sheet_'+keypart(sheet)+'_gross_reference',sheet+' · Upah bruto tertulis',wage,'Rp','UNVERIFIED_DATE_REFERENCE',sheet,'W5','REFERENCE','Bukan gaji bersih atau persetujuan pembayaran.')
    observed.sort()
    e.fact('observed_header_start','Tanggal awal pada header harian',observed[0][0],'tanggal','OBSERVED_HEADER',observed[0][1],'D3')
    e.fact('observed_header_end','Tanggal akhir pada header harian',observed[-1][0],'tanggal','OBSERVED_HEADER',observed[-1][1],'D3')
    e.fact('confirmed_current_output','Hasil pada cut-off yang terkonfirmasi',None,'batang','CONFIRMED_CURRENT_DAY',
           observed[0][1],'D3:W5',note='Diagnostik tidak mengesahkan tanggal produksi; perlu sumber bertanggal konsisten.')
    e.fact('approved_payroll_gross','Upah bruto yang disahkan untuk pembayaran',None,'Rp','APPROVED_PAYROLL',
           observed[0][1],'D3:W5',note='Tanggal, rincian, potongan, dan persetujuan pembayaran perlu pemeriksaan.')
    if observed[-1][0]<cutoff:
        e.issue('SDM_GILING_DATE_CONFLICT','HIGH','Cut-off register lebih baru dari seluruh header harian',
                'Register memakai '+cutoff+', sedangkan header harian berkisar '+observed[0][0]+' sampai '+observed[-1][0]+'. Koreksi sumber bertanggal dan validasi rincian sebelum memproses ulang SDM. Jangan menggeser hasil hanya berdasarkan nama file.',
                ['registered_source_cutoff','observed_header_start','observed_header_end','confirmed_current_output'],observed[0][1],'D3:W5')
    e.issue('SDM_GILING_PAYROLL_DATE_HOLD','HIGH','Sumber detail memerlukan pemeriksaan tanggal sebelum payroll',
            'Angka agregat sumber ditampilkan sebagai referensi. Header hari kosong/bernilai nol tidak membuktikan tidak bekerja. Diagnostik ini tidak memperbarui payroll atau menimpa riwayat.',
            ['approved_payroll_gross'],observed[0][1],'D3:W5')
    return e.finish()


def extract_registered_verpack_aggregates(request):
    """Aggregate current legacy INPUT DATA by its row dates without worker PII."""
    manifest=request['manifest']
    require(manifest.get('division')=='SDM VERPACK','Legacy aggregates support SDM VERPACK only')
    w=Workbook(request['local_path'],allow_legacy_cache=True)
    require(manifest.get('sha256')==w.sha256,'Manifest and actual workbook sha256 differ')
    period=manifest.get('period','');cutoff=manifest.get('cutoff','');version=manifest.get('version','')
    require(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',period),'Invalid registered period')
    require(dt.date.fromisoformat(cutoff).isoformat()==cutoff and cutoff.startswith(period+'-'),'Invalid registered cutoff')
    require(re.fullmatch(r'V\d{3,}',version),'Invalid registered version')
    e=object.__new__(Extractor);e.w=w;e.keys=set()
    e.output={'schema_version':'ppic-robot-facts-v1','division':'SDM VERPACK','period':period,
              'cutoff':cutoff,'version':version,'source_sha256':w.sha256,'facts':[],'issues':[]}
    s='INPUT DATA'
    w.guard(s,'A7','TANGGAL');w.guard(s,'B7','ID');w.guard(s,'K7','GAJI');w.guard(s,'M7','TOT PACK')
    columns=dict(zip('DEFGHIJ',['GCC 99','CB 77','GCC 16','CB 16','REFILL H','REFILL ORIGINAL','BAL9']))
    for col,brand in columns.items():w.guard(s,col+'7',brand)
    headerdate=excel_date(w.get(s,'C3'),w.date1904)
    e.fact('registered_source_cutoff','Cut-off pada register sumber',cutoff,'tanggal','REGISTRY_METADATA','PPIC_SOURCE_REGISTRY','cutoff')
    e.fact('selected_header_date','Tanggal pilihan pada workbook',headerdate,'tanggal','OBSERVED_HEADER',s,'C3')
    groups={};brands={col:0 for col in columns};included=[];ids=set();unidentified=[];wage_only=[]
    incomplete=[]
    for r in w.rows(s,8):
        rawdate=w.get(s,f'A{r}')
        try:date=excel_date(rawdate,w.date1904)
        except (ExtractionError,ValueError):
            values=[w.get(s,f'{col}{r}') for col in columns]+[w.get(s,f'K{r}')]
            require(not any(isinstance(v,(int,float)) and v!=0 for v in values),'Nonzero legacy transaction has no usable date')
            continue
        if not date.startswith(period+'-') or date>cutoff:continue
        values=[w.get(s,f'{col}{r}') for col in columns];wage=w.get(s,f'K{r}')
        require(all(v is None or isinstance(v,(int,float)) and not isinstance(v,bool) for v in values+[wage]),'Invalid worker quantity/wage type')
        qty=sum(v or 0 for v in values);known=any(v is not None for v in values)
        total=w.get(s,f'M{r}')
        require(total is None or isinstance(total,(int,float)) and math.isclose(total,qty,abs_tol=0.001),'Source row quantity control differs')
        # Empty result columns with a zero cached wage are inactive template
        # rows, not evidence of absence and not a missing wage on an actual
        # production row. They must not invalidate other reported daily rows.
        incomplete_activity=qty!=0 and wage is None
        if incomplete_activity:incomplete.append(r)
        ident=normalized(w.get(s,f'B{r}')).upper()
        valid_id=bool(re.fullmatch(r'P\d+',ident))
        if valid_id:ids.add(ident)
        elif qty or wage:unidentified.append(r)
        if not qty and wage is not None and wage>0:wage_only.append((r,wage))
        group=groups.setdefault(date,{'qty':0,'wage':0,'first':r,'last':r,'incomplete':False})
        group['qty']+=qty;group['wage']+=wage or 0;group['last']=r
        group['incomplete']|=incomplete_activity
        for col,v in zip(columns,values):brands[col]+=v or 0
        included.append(r)
    require(bool(included),'No source rows inside the registered period/cutoff')
    first=min(included);last=max(included);span=f'A{first}:M{last}'
    total_qty=sum(g['qty'] for g in groups.values());total_wage=sum(g['wage'] for g in groups.values())
    e.fact('source_period_output_pack','Hasil admin pada periode sampai cut-off',total_qty,'pack','FILTERED_SOURCE_PERIOD',s,span,
           note='Hanya tanggal baris yang sesuai periode/cut-off. Total seluruh sheet dapat memuat bulan lain; data kosong belum dianggap nihil.')
    e.fact('source_period_gross_wage','Upah bruto admin pada periode sampai cut-off',total_wage,'Rp','FILTERED_SOURCE_PERIOD',s,span,
           note='Bruto tertulis, belum potongan/kasbon, gaji bersih, atau pembayaran; baris belum lengkap tetap perlu pemeriksaan.')
    e.fact('source_worker_count','Jumlah ID berbeda pada periode sumber',len(ids),'orang','SOURCE_ID_COUNT',s,f'B{first}:B{last}',note='Agregat ID saja; bukan absensi resmi atau tenaga efektif.')
    for col,brand in columns.items():
        e.fact('brand_'+keypart(brand)+'_pack',brand+' · Hasil periode sumber',brands[col],'pack','FILTERED_SOURCE_PERIOD',s,f'{col}{first}:{col}{last}',
               note='Difilter berdasarkan tanggal di kolom A; tidak termasuk bulan lain.')
    for date,group in sorted(groups.items()):
        has_activity=group['qty']!=0 or group['wage']!=0
        tag='day_'+date.replace('-','_');cells=f'A{group["first"]}:K{group["last"]}'
        for suffix,label,value,unit in [('pack','Hasil',group['qty'],'pack'),('gross','Upah bruto',group['wage'],'Rp')]:
            e.fact(tag+'_'+suffix,date+' · '+label,value if has_activity and not group['incomplete'] else None,unit,'DAILY_SOURCE',s,cells,
                   note='Tidak ada rincian hasil nonnol atau ada kolom belum lengkap; perlu verifikasi, bukan bukti libur/absen.' if not has_activity or group['incomplete'] else 'Agregat baris sumber per tanggal, tanpa identitas pekerja.')
    missing=[]
    for day in range(1,int(cutoff[-2:])+1):
        date=period+'-'+str(day).zfill(2);g=groups.get(date)
        if not g or not g['qty'] and not g['wage'] or g['incomplete']:missing.append(date)
    e.fact('unconfirmed_activity_dates','Tanggal aktivitas belum terkonfirmasi',', '.join(missing),'tanggal','COVERAGE',s,f'A{first}:M{last}',
           note='Tanpa baris atau seluruh angka nol tidak otomatis berarti libur/tidak bekerja.')
    e.fact('wage_without_output_total','Upah pada baris tanpa hasil tercatat',sum(v for _,v in wage_only),'Rp','RECONCILIATION',s,
           ','.join('K'+str(r) for r,_ in wage_only) if wage_only else f'K{first}:K{last}',note='Perlu dasar pembayaran; tidak dihapus otomatis dari bruto sumber.')
    if missing:e.issue('SDM_VERPACK_COVERAGE_GAP','HIGH','Tanggal dengan aktivitas belum terkonfirmasi',
          'Periksa sumber harian untuk '+', '.join(missing)+'. Jangan menimpa rincian historis lengkap dengan baris kosong/nol.',
          ['unconfirmed_activity_dates','source_period_output_pack'],s,span)
    if wage_only:e.issue('SDM_VERPACK_WAGE_WITHOUT_OUTPUT','HIGH','Ada upah tanpa hasil pada baris sumber',
          'Cocokkan alasan, tanggal, dan bukti upah sebelum pembayaran. Nilai tetap tercatat dalam bruto sumber.',
          ['wage_without_output_total','source_period_gross_wage'],s,','.join('K'+str(r) for r,_ in wage_only))
    if unidentified:e.issue('SDM_VERPACK_IDENTITY_HOLD','HIGH','Hasil atau upah tanpa ID pekerja valid',
          'Pengesahan identitas diperlukan; robot hanya menampilkan agregat.',[],s,f'A{min(unidentified)}:K{max(unidentified)}')
    if incomplete:e.issue('SDM_VERPACK_INCOMPLETE_ROWS','HIGH','Kolom hasil atau upah belum lengkap',
          'Total sumber hanya menjumlahkan angka tersedia; belum merupakan payroll lengkap.',[],s,f'A{min(incomplete)}:K{max(incomplete)}')
    if headerdate!=cutoff:e.issue('SDM_VERPACK_HEADER_CUTOFF','MEDIUM','Tanggal pilihan berbeda dari cut-off register',
          'Agregat memakai tanggal baris sampai cut-off register, bukan tanggal pilihan formulir.',['selected_header_date','registered_source_cutoff'],s,'C3')
    e.fact('approved_net_pay','Gaji bersih yang disahkan',None,'Rp','APPROVED_PAYROLL',s,span,note='Rincian potongan/kasbon dan persetujuan tidak disimpulkan dari kolom GAJI.')
    return e.finish()


def extract_request(request):
    if request.get('source_kind')=='REGISTERED_LEGACY_SDM_GILING':
        return extract_registered_giling_diagnostics(request)
    if request.get('source_kind')=='REGISTERED_LEGACY_SDM_VERPACK':
        return extract_registered_verpack_aggregates(request)
    e=Extractor(Workbook(request['local_path']),request['manifest'])
    HANDLERS[e.output['division']](e)
    return e.finish()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',help='Private JSON output path; stdout otherwise')
    args=parser.parse_args()
    try:
        result=extract_request(json.load(sys.stdin))
        serialized=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
        if args.output:
            path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(serialized,encoding='utf-8')
        else:print(serialized,end='')
    except (ValueError,KeyError,TypeError,OSError,zipfile.BadZipFile,ET.ParseError) as error:
        message=str(error) if isinstance(error,ExtractionError) else 'Invalid request or unreadable workbook'
        print('PPIC facts extraction failed: '+message,file=sys.stderr)
        raise SystemExit(2)


if __name__=='__main__':
    main()
