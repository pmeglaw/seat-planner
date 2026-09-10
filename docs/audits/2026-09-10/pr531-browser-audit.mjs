// Local fixture audit: real component markup from the existing jsdom harness,
// painted in Chromium with the served build's CSS. No server mutation occurs.
// Run after npm run build and npm run start -- -p 3200.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { chromium } from '@playwright/test';
import { loadComponent, renderElement, React, configureContext, cleanup, fireEvent, act } from '../../../tests/helpers/renderComponent.mjs';
const output = 'output/playwright/pr531';
mkdirSync(output, {recursive:true});
const noop = () => {};
const fixtures = [];
const nativeFormData = globalThis.FormData;
globalThis.FormData = window.FormData;
async function capture(name, module, exported, props, drive) {
  cleanup();
  const C = exported === 'default'
    ? (await loadComponent('@audit/loading', {extraMocks:{'@audit/loading':transformSync(readFileSync(module.replace('@/', '')+'.tsx','utf8').replace('export default function','export function'), {loader:'tsx',jsx:'automatic'}).code}})).Loading
    : (await loadComponent(module))[exported];
  await renderElement(React.createElement(C, props));
  if (drive) await drive();
  fixtures.push({name, markup:document.body.innerHTML});
}
configureContext({actions:{askPlannerAction:async()=>({status:'answered',answer:'Fixture answer',highlights:[],warnings:[],followUps:[],sources:[]})}});
const seat={id:'seat-1',seat_key:'s01',label:'S01',floor:'3',x:.3,y:.3,status:'available',layer:'draft',employee_id:null,department:null,zone:'South Offices',notes:null,is_custom:true,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',employee:null};
await capture('inspector','@/components/seat-map/SeatInspector','SeatInspector',{seat,seats:[seat],employees:[],departmentOptions:[],canEdit:true,collapsed:false,onClose:noop,searchMismatchNotice:'Selected seat is outside this search',onClearSearchContext:noop});
await capture('publish','@/components/seat-map/PublishReviewSheet','PublishReviewSheet',{publishSummary:{draftSeatCount:1,publishedSeatCount:1,addedSeats:[],removedSeats:[],assignmentChanges:[],vacatedSeats:[],statusChanges:[],otherChanges:[],employeeDetailChanges:[],updatedSeatCount:1,totalChangeCount:1,hasChanges:true},publishDiffRows:[],publishDiffCounts:{assigned:0,added:0,vacated:0,removed:0,reassigned:0,updated:1},actionError:null,pending:true,onClose:noop,onConfirm:noop});
await capture('ask','@/components/seat-map/AskPlannerDrawer','AskPlannerDrawer',{open:true,draftDirty:false,zones:[],queuedRequest:null,highlightedSeatIds:[],onClose:noop,onHighlightSeats:noop,onClearHighlights:noop,onSelectSeat:noop},async()=>{
  await act(async()=>fireEvent.change(document.querySelector('textarea'),{target:{value:'Summarize the map'}}));
  await act(async()=>fireEvent.submit(document.querySelector('form')));
});
await capture('controls','@/components/seat-map/MapControlRow','MapControlRow',{floor:'3',onFloorChange:noop,search:{value:'',onChange:noop,onClear:noop,scope:'floor',onScopeChange:noop,hint:'Ctrl K',placeholder:'Search people or seats…',inputId:'viewer-seat-search',paletteOpen:false,onOpenPalette:noop,onClosePalette:noop,onArrowDown:noop,onEnter:noop},filters:{appliedCount:3,onOpen:noop,onClear:noop,panelOpen:false},count:{text:'68 seats',live:true},onFindMe:noop,names:{pressed:true,hidden:false,onToggle:noop}},async()=>{
  await act(async()=>fireEvent.click(document.querySelector('[aria-label^="Change floor"]')));
});
await capture('login-loading','@/app/login/loading','default',{});
await capture('my-seat-loading','@/app/my-seat/loading','default',{});
cleanup();
globalThis.FormData = nativeFormData;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const base=process.env.SEAT_PLANNER_URL||'http://localhost:3200';
await page.goto(base+'/login');
const htmlClass=await page.locator('html').getAttribute('class') || '';
const bodyClass=await page.locator('body').getAttribute('class') || '';
const sheets=await page.locator('link[rel="stylesheet"]').evaluateAll(els=>els.map(el=>el.href));
const styles=(await Promise.all(sheets.map(async url=>(await page.request.get(url)).text()))).join('\n');
const results=[];
for(const theme of ['white','g100','system-light','system-dark']){
  const dark=theme==='g100'||theme==='system-dark';
  await page.emulateMedia({colorScheme:theme==='white'||theme==='system-dark'?'dark':'light'});
  for(const {name,markup} of fixtures){
    await page.setContent(`<html class="${htmlClass}" ${theme.startsWith('system')?'':`data-carbon-theme="${theme}"`}><head><style>${styles}</style></head><body class="${bodyClass}">${markup}</body></html>`);
    if(['inspector','publish','ask'].includes(name)){
      const notice=page.locator('.cds-notification--info');
      assert.equal(await notice.count(),1,name+' info state rendered');
      const computed=await notice.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderLeftColor,icon:getComputedStyle(el.querySelector('svg')).color,text:getComputedStyle(el.querySelector('.cds-notification-text')).color};});
      assert.equal(computed.border,dark?'rgb(232, 160, 122)':'rgb(184, 92, 46)');
      assert.equal(computed.icon,computed.border);
      assert.equal(computed.background,dark?'rgb(38, 38, 38)':'rgb(251, 232, 220)');
      results.push({theme,name,...computed});
    }else if(name==='controls'){
      const button=page.locator('.cds-btn--tertiary').first();
      await button.focus();
      await button.hover();
      await page.waitForFunction(el=>getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)',await button.elementHandle());
      await page.waitForTimeout(100); // Carbon's 70ms hover transition must settle before measurement.
      const painted=await button.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,focus:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset};});
      assert.equal(painted.background,dark?'rgb(51, 51, 51)':'rgb(143, 69, 33)');
      assert.equal(painted.focus,dark?'rgb(255, 255, 255)':'rgb(184, 92, 46)');
      assert.equal(painted.width,'2px');assert.equal(painted.offset,'-2px');
      await page.mouse.down();
      const activeFill=dark?'rgb(57, 57, 57)':'rgb(122, 58, 28)';
      await page.waitForFunction(({el,fill})=>getComputedStyle(el).backgroundColor===fill,{el:await button.elementHandle(),fill:activeFill});
      const active=await button.evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(active,activeFill);
      await page.mouse.up();
      // The actual current floor menu item is the selected surface that exposed BR-2.
      const selected=page.locator('[role="menu"] [aria-current]').first();
      await selected.focus();await selected.hover();
      const selectedPaint=await selected.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,focus:s.outlineColor};});
      assert.equal(selectedPaint.focus,painted.focus);
      results.push({theme,name,...painted,active,selected:selectedPaint});
    }else{
      const bg=await page.locator('[role="status"]').first().evaluate(el=>getComputedStyle(el).backgroundColor);
      const chrome=page.locator('.sp-zone-chrome');
      if(await chrome.count())assert.equal(await chrome.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(22, 22, 22)');
      results.push({theme,name,background:bg,chromeHeight:await chrome.count()?(await chrome.boundingBox()).height:null});
    }
    await page.screenshot({animations:'disabled',path:`${output}/${name}-${theme}.png`});
  }
  // Visual snapshots of actual routes, not fixtures.
  await page.goto(base+'/login');
  await page.evaluate(t=>{if(t.startsWith('system')){document.documentElement.removeAttribute('data-carbon-theme');localStorage.removeItem('sp-theme');}else {document.documentElement.setAttribute('data-carbon-theme',t);localStorage.setItem('sp-theme',t==='white'?'light':'dark');}},theme);
  await page.getByRole('button',{name:'Log in',exact:true}).waitFor();
  await page.screenshot({animations:'disabled',path:`${output}/login-${theme}.png`});
  await page.goto(base+'/auth/update-password');
  await page.screenshot({animations:'disabled',path:`${output}/password-${theme}.png`});
}
writeFileSync(`${output}/computed.json`,JSON.stringify(results,null,2)+'\n');
await browser.close();
console.log(`${results.length} fixture/theme states verified; screenshots and computed.json in ${output}`);
