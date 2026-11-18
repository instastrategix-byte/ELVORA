/**
 * The ELVORA pixel — tiny, cookie-free, and inert until the site reports consent. See
 * docs/ADS_TRACKING.md for the install snippet. On landing it remembers the `elv_cid` click id from
 * the URL (sessionStorage only) so conversions can be attributed to an ELVORA ad click. Only the
 * page origin and path are sent, never query strings.
 */
export function pixelScript(endpoint: string): string {
  return `(function(w){"use strict";
var EP=${JSON.stringify(endpoint)},K="elvora_cid",q=(w.elvora&&w.elvora.q)||[],consent=false,pixel=null,pending=[];
try{var m=/[?&]elv_cid=([0-9a-fA-F-]{36})(?:&|$)/.exec(w.location.search);if(m)w.sessionStorage.setItem(K,m[1]);}catch(e){}
function rid(){try{return w.crypto.randomUUID();}catch(e){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);}}
function send(ev,p){p=p||{};var b={pixel:pixel,event:ev,event_id:String(p.event_id||rid()),consent:true,page_url:w.location.origin+w.location.pathname};
try{var c=w.sessionStorage.getItem(K);if(c)b.elv_cid=c;}catch(e){}
if(typeof p.value==="number")b.value=p.value;if(p.currency)b.currency=String(p.currency);if(p.custom_name)b.custom_name=String(p.custom_name);
var s=JSON.stringify(b);try{if(w.navigator.sendBeacon&&w.navigator.sendBeacon(EP,new Blob([s],{type:"text/plain"})))return;}catch(e){}
try{w.fetch(EP,{method:"POST",body:s,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}});}catch(e){}}
function api(cmd,a,b){if(cmd==="init"){pixel=a;}else if(cmd==="consent"){consent=a===true;if(consent){var p=pending;pending=[];for(var i=0;i<p.length;i++)send(p[i][0],p[i][1]);}else{pending=[];}}
else if(cmd==="track"){if(!pixel)return;if(consent)send(a,b);else if(pending.length<20)pending.push([a,b]);}}
w.elvora=api;for(var i=0;i<q.length;i++)api.apply(null,q[i]);})(window);`;
}
