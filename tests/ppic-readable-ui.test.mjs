import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {safeMode,key,mount}=require('../ppic-reading-ui.js');

test('Only three visual text sizes are accepted; user gets large by default',()=>{
 assert.equal(safeMode('normal'),'normal');
 assert.equal(safeMode('large'),'large');
 assert.equal(safeMode('xlarge'),'xlarge');
 for(const v of [undefined,null,'','XL','javascript:alert(1)','very-large',{},1]){
  assert.equal(safeMode(v),'large');
 }
});
function fake(initial){
 const buttons=['normal','large','xlarge'].map(mode=>({
  dataset:{readingChoice:mode},attrs:{},
  setAttribute(k,v){this.attrs[k]=v;}
 }));
 const handlers={},saved=new Map(initial===null?[]:[[key,initial]]);
 const grp={
  querySelectorAll(q){assert.equal(q,'button[data-reading-choice]');return buttons;},
  contains(x){return buttons.includes(x);},
  addEventListener(type,fn){handlers[type]=fn;}
 };
 const state={textContent:''},root={dataset:{}};
 const win={document:{documentElement:root,getElementById(id){
  return id==='ppicReadingControls'?grp:id==='ppicReadingStatus'?state:null;
 }},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
 addEventListener(type,fn){handlers[type]=fn;}
 };
 return{win,buttons,root,state,handlers,saved};
}
test('Mount persists only font preference; aria-pressed reflects selected mode',()=>{
 const f=fake('xlarge');
 mount(f.win);
 assert.equal(f.root.dataset.ppicReading,'xlarge');
 assert.equal(f.buttons[2].attrs['aria-pressed'],'true');
 assert.equal(f.buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);
 f.handlers.click({target:{closest:()=>f.buttons[0]}});
 assert.equal(f.root.dataset.ppicReading,'normal');
 assert.equal(f.saved.get(key),'normal');
 assert.match(f.state.textContent,/Normal/);
 assert.equal(f.buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);
 f.handlers.storage({key,newValue:'large'});
 assert.equal(f.root.dataset.ppicReading,'large');
});
test('Missing and denied localStorage do not disable text size buttons',()=>{
 const f=fake(null);
 f.win.localStorage.getItem=()=>{throw Error('Private browser');};
 f.win.localStorage.setItem=()=>{throw Error('Private browser');};
 mount(f.win);
 assert.equal(f.root.dataset.ppicReading,'large');
 f.handlers.click({target:{closest:()=>f.buttons[2]}});
 assert.equal(f.root.dataset.ppicReading,'xlarge');
 assert.equal(f.buttons[2].attrs['aria-pressed'],'true');
});
