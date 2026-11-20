#!/usr/bin/env python3
"""Synthetic regression checks; no source files, business data, or personal data."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

SPEC=importlib.util.spec_from_file_location('robot_extract',Path(__file__).resolve().parents[1]/'tools/ppic_robot_extract.py')
X=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(X)


def write_fixture(path,sheets,extras=None):
    """Only minimal synthetic OOXML used to exercise the read-only parser."""
    ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<Types/>')
        z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join('<sheet name="'+escape(name)+'" sheetId="'+str(i)+'" r:id="rId'+str(i)+'"/>' for i,name in enumerate(sheets,1))+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships>'+''.join('<Relationship Id="rId'+str(i)+'" Target="worksheets/sheet'+str(i)+'.xml"/>' for i in range(1,len(sheets)+1))+'</Relationships>')
        for i,(name,cells) in enumerate(sheets.items(),1):
            xml=[]
            for addr,val in cells.items():
                if isinstance(val,tuple):
                    body=val[0];xml.append('<c r="'+addr+'"'+(' t="e"' if len(val)>1 else '')+'>'+body+'</c>')
                elif isinstance(val,str):xml.append('<c r="'+addr+'" t="inlineStr"><is><t>'+escape(val)+'</t></is></c>')
                elif val is None:xml.append('<c r="'+addr+'"/>')
                else:xml.append('<c r="'+addr+'"><v>'+str(val)+'</v></c>')
            z.writestr('xl/worksheets/sheet'+str(i)+'.xml','<worksheet xmlns="'+ns+'"><sheetData><row>'+''.join(xml)+'</row></sheetData></worksheet>')
        for name,data in (extras or {}).items():z.writestr(name,data)


def metadata(division):
    sheet,dc,pc,cc,vc=X.META_LAYOUTS[division]
    return sheet,{dc:division,pc:'2031-04',cc:'2031-04-12',vc:'V999'}


class ExtractTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'synthetic.xlsx'
    def tearDown(self):self.temp.cleanup()
    def build(self,division,sheets,extras=None):
        sheet,cells=metadata(division)
        sheets={k:dict(v) for k,v in sheets.items()};sheets.setdefault(sheet,{}).update(cells)
        write_fixture(self.path,sheets,extras)
        return {'local_path':str(self.path),'manifest':{'division':division,'period':'2031-04','cutoff':'2031-04-12','version':'V999','sha256':hashlib.sha256(self.path.read_bytes()).hexdigest()}}
    def facts(self,output):return {f['key']:f for f in output['facts']}

    def test_cached_formula_missing_is_not_zero(self):
        write_fixture(self.path,{'Sheet':{'A1':('<f>1+2</f><v>3</v>',),'A2':('<f>7*8</f>',)}})
        w=X.Workbook(self.path)
        self.assertEqual(w.get('Sheet','A1'),3);self.assertIsNone(w.get('Sheet','A2'))

    def test_metadata_and_actual_hash_are_required(self):
        req=self.build('TSG',{'Rekap Buku Utama':{'A3':'Uraian'},'Web SKT Pembanding':{}})
        for field,value in [('sha256','0'*64),('cutoff','2031-04-13'),('version','V998'),('period','2031-05')]:
            edited={**req,'manifest':{**req['manifest'],field:value}}
            with self.subTest(field=field),self.assertRaises(X.ExtractionError):X.extract_request(edited)

    def test_macro_and_traversal_are_rejected(self):
        for name in ['xl/vbaProject.bin','xl/externalLinks/externalLink1.xml','../outside.xml']:
            with self.subTest(name=name):
                write_fixture(self.path,{'Sheet':{}},{name:'test'})
                with self.assertRaises(X.ExtractionError):X.Workbook(self.path)

    def test_dtd_and_error_cells_are_rejected(self):
        write_fixture(self.path,{'Sheet':{'A1':('<v>#REF!</v>','error')}})
        with self.assertRaises(X.ExtractionError):X.Workbook(self.path).get('Sheet','A1')
        with zipfile.ZipFile(self.path,'a') as z:z.writestr('bad.xml','<!DOCTYPE x [<!ENTITY y "x">]><x/>')
        with self.assertRaises(X.ExtractionError):X.Workbook(self.path).xml('bad.xml')

    def test_excise_book_factory_and_unknown_factor_remain_distinct(self):
        req=self.build('CUKAI',{'Laporan November':{'B7':'HJE','C11':18,'D11':12,'E11':6,'F11':24,'D27':20,'E27':4},
            'PPIC_UPLOAD':{'B19':'HJE','B20':2999,'C20':20,'D20':0,'E20':100,'F20':0.2,'G20':0,'H20':20,'I20':'1 keping = 1 pack',
                'B21':3999,'C21':4,'D21':4,'E21':None,'F21':'Belum terverifikasi','G21':'Belum terverifikasi','H21':0}})
        f=self.facts(X.extract_request(req))
        self.assertEqual(f['book_closing_keping']['value'],24)
        self.assertEqual(f['factory_estimate_keping']['value'],4)
        self.assertEqual(f['hje_2999_factory_keping']['value'],0)
        self.assertEqual(f['hje_2999_factory_keping']['quality'],'ESTIMATE')
        self.assertIsNone(f['hje_3999_book_carton']['value']);self.assertEqual(f['hje_3999_book_carton']['quality'],'MISSING')

    def test_finished_goods_unposted_reference_is_removed_from_book(self):
        req=self.build('BARANG JADI',{'PPIC_UPLOAD':{'B20':'Saldo awal bulan','C20':2,'C21':14,'C22':2,'C23':14,'C24':9,'C25':23},
            'Rekap per merek':{'A13':'SKU','R13':'Indikatif pack','A14':'C-901','B14':'MEREK UJI A','C14':10,'R14':25,
                              'A15':'C-902','B15':'MEREK UJI B','C15':5,'R15':-2},
            'Referensi Web':{'B10':'C-901','H10':9}})
        out=X.extract_request(req);f=self.facts(out)
        self.assertEqual(f['sku_c_901_book_pack']['value'],16)
        self.assertEqual(f['sku_c_902_book_pack']['value'],-2)
        self.assertEqual(f['indicative_closing_pack']['quality'],'REFERENCE')
        self.assertIsNone(f['ready_for_delivery_pack']['value'])
        self.assertIn('BJ_NEGATIVE_STOCK',[i['code'] for i in out['issues']])
        self.assertIn('Referensi Web!H10:H10',f['sku_c_901_book_pack']['note'])

    def test_finished_goods_summary_mismatch_fails_closed(self):
        req=self.build('BARANG JADI',{'PPIC_UPLOAD':{'B20':'Saldo awal','C23':3,'C25':3},
              'Rekap per merek':{'A13':'SKU','R13':'Indikatif pack','A14':'C-901','B14':'MEREK UJI','C14':10,'R14':4},'Referensi Web':{}})
        with self.assertRaises(X.ExtractionError):X.extract_request(req)

    def test_verpack_zero_without_detail_is_missing_and_daily_conversion_uses_brand(self):
        req=self.build('VERPACK',{'01_RINGKASAN':{'A5':'Total hasil pack','B5':40,'B6':100,'B7':250},
           '03_MEREK_HJE':{'A1':'Merek','A2':'MEREK UJI','C2':40,'E2':8,'F2':5},
           '02_MUTASI_HARIAN':{'A1':'Tanggal','B1':'MEREK UJI','A2':'2031-04-11','B2':0,'I2':0,'J2':0,
                              'A3':'2031-04-12','B3':40,'I3':40,'J3':100}})
        f=self.facts(X.extract_request(req))
        self.assertIsNone(f['day_2031_04_11_pack']['value'])
        self.assertEqual(f['day_2031_04_11_pack']['quality'],'MISSING')
        self.assertEqual(f['latest_merek_uji_carton']['value'],5)
        self.assertEqual(f['hje_indicative_value']['quality'],'REFERENCE')

    def test_material_units_and_unpriced_positive_stock(self):
        req=self.build('BAHAN BAKU',{'DATA_BB_PPIC':{'E1':'code','M1':'closing_qty','W1':'physical_qty','Z1':'capacity_carton_equiv_simulation',
          'A2':'2031-04','B2':'2031-04-12','C2':'V999','E2':'U-91','F2':'UJI LEMBAR','G2':'LEMBAR','M2':120,'N2':None,'Z2':None,
          'A3':'2031-04','B3':'2031-04-12','C3':'V999','E3':'U-92','F3':'UJI BOX','G3':'BOX','M3':3,'N3':4,'Z3':1.5,'AC3':'Simulasi, BOM belum sah'},
          'Ringkasan':{'B11':12,'B22':10},'PO_BB_PPIC':{'A1':'po_line_id','M1':'remaining_po_qty'}})
        f=self.facts(X.extract_request(req))
        self.assertEqual(f['positive_unpriced_material_count']['value'],1)
        self.assertEqual(f['material_u_91_closing']['unit'],'LEMBAR')
        self.assertEqual(f['material_u_92_closing']['unit'],'BOX')
        self.assertEqual(f['material_u_92_capacity_carton']['quality'],'ESTIMATE')
        self.assertFalse(any(k=='total_material_quantity' for k in f))

    def test_daily_brand_spacing_matches_factor_and_unknown_has_no_fake_address(self):
        req=self.build('VERPACK',{'01_RINGKASAN':{'A5':'Total hasil pack','B5':50,'B6':100,'B7':250},
           '03_MEREK_HJE':{'A1':'Merek','A2':'GCC 16','C2':40,'E2':8,'F2':5,
                          'A3':'REFILL ORIGINAL','C3':10,'E3':None,'F3':None},
           '02_MUTASI_HARIAN':{'A1':'Tanggal','B1':'GCC16','G1':'REFILL ORI',
                              'A2':'2031-04-12','B2':40,'G2':10,'I2':50,'J2':100}})
        out=X.extract_request(req);f=self.facts(out)
        self.assertEqual(f['latest_gcc16_carton']['value'],5)
        self.assertEqual(f['latest_gcc16_carton']['quality'],'ESTIMATE')
        self.assertIn('03_MEREK_HJE!E2',f['latest_gcc16_carton']['note'])
        self.assertIsNone(f['latest_refill_ori_carton']['value'])
        self.assertNotIn('ENone',json.dumps(out))

    def test_sdm_summary_excludes_worker_detail_and_keeps_week_scope(self):
        req=self.build('SDM VERPACK',{'00_RINGKASAN':{'A12':'Merek','E12':'Upah bruto','A13':'UJI A','B13':5,'D13':0.5,'E13':15,
          'A14':'UJI B','B14':10,'D14':1,'E14':30,'B15':15,'E15':45,'B18':2},
          '04_REKONSILIASI':{'D19':3},'INPUT DATA':{'C8':'SYNTHETIC_PERSON_DO_NOT_EXPORT'}})
        out=X.extract_request(req);self.assertNotIn('SYNTHETIC_PERSON',json.dumps(out))
        self.assertEqual(self.facts(out)['source_week_output_pack']['scope'],'SOURCE_WEEK')

    def test_reference_date_retains_separate_scope(self):
        req=self.build('TSG',{'Rekap Buku Utama':{'A3':'Uraian','B4':4,'B5':8,'B6':3,'B7':9,'D7':27},
           'Web SKT Pembanding':{'A2':'13 Apr','B2':'UJI','F2':7,'G2':'SIMULASI'}})
        f=self.facts(X.extract_request(req))
        self.assertEqual(f['book_closing_kg']['value'],9)
        self.assertEqual(f['reference_2031_04_13_uji_stock']['value'],7)
        self.assertEqual(f['reference_2031_04_13_uji_stock']['quality'],'REFERENCE')
        self.assertEqual(f['source_data_cutoff']['value'],'2031-04-12')

    def test_fact_limits_and_text_are_bounded(self):
        req=self.build('TSG',{'Rekap Buku Utama':{},'Web SKT Pembanding':{}})
        e=X.Extractor(X.Workbook(self.path),req['manifest'])
        for i in range(X.MAX_FACTS-1):e.fact('test_'+str(i),'x\n'+('y'*300),None,'kg','scope','sheet','A1',note='a\tb')
        self.assertEqual(len(e.output['facts'][-1]['label']),240)
        self.assertNotIn('\n',e.output['facts'][-1]['label'])
        self.assertEqual(e.output['facts'][-1]['note'],'a b')
        with self.assertRaises(X.ExtractionError):e.fact('overflow','x',1,'kg','scope','sheet','A1')

    def test_legacy_diagnostics_do_not_relabel_old_headers_or_release_payroll(self):
        days=['JUMAT','SABTU','SENIN','SELASA','RABU','KAMIS'];sheets={}
        for i,sheet in enumerate(days,1):
            date='2031-04-'+str(i).zfill(2)
            sheets[sheet]={'B3':'TANGGAL ','D3':date,'R3':date,'V5':70 if i==1 else 0,
                           'W5':140 if i==1 else 0,'V6':'TOTAL GILING','W6':'TOTAL UPAH'}
        write_fixture(self.path,sheets,{'xl/vbaProject.bin':'inert synthetic macro marker'})
        req={'source_kind':'REGISTERED_LEGACY_SDM_GILING','local_path':str(self.path),
             'manifest':{'division':'SDM GILING','period':'2031-04','cutoff':'2031-04-12','version':'V999',
                         'sha256':hashlib.sha256(self.path.read_bytes()).hexdigest()}}
        out=X.extract_request(req);f=self.facts(out)
        self.assertEqual(out['cutoff'],'2031-04-12')
        self.assertEqual(f['observed_header_start']['value'],'2031-04-01')
        self.assertEqual(f['observed_header_end']['value'],'2031-04-06')
        self.assertEqual(f['sheet_jumat_qty_reference']['value'],70)
        self.assertEqual(f['sheet_jumat_qty_reference']['quality'],'REFERENCE')
        self.assertIsNone(f['confirmed_current_output']['value'])
        self.assertIsNone(f['approved_payroll_gross']['value'])
        self.assertIn('SDM_GILING_DATE_CONFLICT',[i['code'] for i in out['issues']])

    def test_legacy_packing_filters_other_month_and_flags_unexplained_pay(self):
        cells={'C3':'2031-04-12','A7':'TANGGAL','B7':'ID','K7':'GAJI','M7':'TOT PACK'}
        for col,brand in zip('DEFGHIJ',['GCC 99','CB 77','GCC 16','CB 16','REFILL H','REFILL ORIGINAL','BAL9']):cells[col+'7']=brand
        rows=[('2031-03-31',900,1800),('2031-04-11',0,0),('2031-04-12',40,80),('2031-04-12',0,12),('2031-04-13',800,1600)]
        for r,(date,qty,wage) in enumerate(rows,8):
            cells.update({'A'+str(r):date,'B'+str(r):'P'+str(r),'C'+str(r):'PRIVATE_SYNTHETIC_NAME','D'+str(r):qty,'K'+str(r):wage,'M'+str(r):qty})
            for col in 'EFGHIJ':cells[col+str(r)]=0
        cells.update({'A13':'2031-04-12','B13':'P99','K13':0,'M13':0})
        write_fixture(self.path,{'INPUT DATA':cells})
        req={'source_kind':'REGISTERED_LEGACY_SDM_VERPACK','local_path':str(self.path),
             'manifest':{'division':'SDM VERPACK','period':'2031-04','cutoff':'2031-04-12','version':'V999',
                         'sha256':hashlib.sha256(self.path.read_bytes()).hexdigest()}}
        out=X.extract_request(req);f=self.facts(out)
        self.assertEqual(f['source_period_output_pack']['value'],40)
        self.assertEqual(f['source_period_gross_wage']['value'],92)
        self.assertEqual(f['wage_without_output_total']['value'],12)
        self.assertEqual(f['wage_without_output_total']['source_range'],'K11')
        self.assertIsNone(f['day_2031_04_11_pack']['value'])
        self.assertEqual(f['day_2031_04_12_pack']['value'],40)
        self.assertNotIn('2031-04-12',f['unconfirmed_activity_dates']['value'])
        self.assertIsNone(f['approved_net_pay']['value'])
        self.assertNotIn('PRIVATE_SYNTHETIC_NAME',json.dumps(out))


if __name__=='__main__':unittest.main()
