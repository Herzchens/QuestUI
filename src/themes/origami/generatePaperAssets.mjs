// Original Origami artwork. Run: node src/themes/origami/generatePaperAssets.mjs
// Remaining local SVG artwork: paper controls, header leaves and footer.
import { writeFileSync } from "node:fs";
const clamp=(n,a=0,b=255)=>Math.max(a,Math.min(b,n));
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const shade=(c,k)=>"#"+rgb(c).map(n=>Math.round(clamp(k<0?n*(1+k):n+(255-n)*k)).toString(16).padStart(2,"0")).join("");
const vsub=(a,b)=>a.map((n,i)=>n-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n)};
const light=unit([-0.55,-0.7,1]);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const xy=p=>[p[0]+p[2]*.21,p[1]-p[2]*.35].map(x=>x.toFixed(2)).join(",");
const poly=(points,fill,extra="")=>'<polygon points="'+points.map(p=>Array.isArray(p)?xy(p):p).join(" ")+'" fill="'+fill+'" '+extra+'/>';
const path=(d,fill,extra="")=>'<path d="'+d+'" fill="'+fill+'" '+extra+'/>';
const svg=(w,h,b,extra="")=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" '+extra+'>'+b+'</svg>';
const grad=(id,a,b)=>'<linearGradient id="'+id+'" x1="0" y1="0" x2=".64" y2="1"><stop stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient>';
const drop=(id,dy,blur,color,alpha)=>'<filter id="'+id+'" x="-40%" y="-45%" width="180%" height="210%"><feDropShadow dx="1.1" dy="'+dy+'" stdDeviation="'+blur+'" flood-color="'+color+'" flood-opacity="'+alpha+'"/></filter>';
const grain='<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".79" numOctaves="3" seed="31" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>';
const grainLayer=(w,h,opacity=.07)=>'<rect width="'+w+'" height="'+h+'" filter="url(#grain)" opacity="'+opacity+'" style="mix-blend-mode:multiply"/>';
const defs=(extra="")=>'<defs>'+grain+drop("paperShadow",4.5,2.6,"#271320",.55)+drop("contact",2,1,"#28172c",.58)+drop("tiny",1.2,.75,"#261624",.5)+extra+'</defs>';
let seq=0;
function plane(points,c){
 const n=unit(cross(vsub(points[1],points[0]),vsub(points[2],points[0])));
 const incidence=dot(n[2]<0?n.map(v=>-v):n,light);
 const k=(incidence-.58)*.85;
 const color=shade(c,k),id="face"+seq++;
 return '<defs>'+grad(id,shade(color,.09),shade(color,-.13))+'</defs>'+poly(points,"url(#"+id+")",'stroke="'+shade(c,.66)+'" stroke-opacity=".43" stroke-width=".48" stroke-linejoin="round"');
}
function maple(x,y,s,c="#d74a3b"){
 const p=[[0,-22,0],[5,-7,4],[18,-16,0],[12,-1,5],[25,3,0],[9,8,5],[6,20,0],[0,10,7],[-7,20,0],[-10,8,4],[-25,3,0],[-12,-1,4],[-18,-16,0],[-5,-7,4]];
 let b='<g transform="translate('+x+' '+y+') scale('+s+')" filter="url(#tiny)">';
 for(let i=0;i<p.length;i++)b+=plane([p[7],p[i],p[(i+1)%p.length]],c);
 return b+path("M0 9L-2 27","none",'stroke="#86352d" stroke-width="1.3"')+'</g>';
}
function fold(){
 // Middle of a folded plaque. End caps are separate fixed-size images so
 // narrow icons and long product bands share the same physical edge depth.
 return svg(300,80,defs()+'<rect width="300" height="80" fill="#fff" opacity=".03"/>'+path("M0 0H300V7L210 5 104 8 0 6Z","#fff",'opacity=".38"')+path("M0 80L0 70 100 73 213 69 300 71V80Z","#241520",'opacity=".24"')+path("M0 6L104 8 160 22 210 5M0 70L100 73 160 22 213 69","none",'stroke="#fff" stroke-width=".65" stroke-opacity=".36"')+grainLayer(300,80,.075),'preserveAspectRatio="none"');
}
function end(right){
 const body=defs()+'<g '+(right?'transform="translate(24 0) scale(-1 1)"':'')+'>'+path("M0 0H24L9 8 2 19Z","#fff",'opacity=".30"')+path("M0 0L9 8 9 24 0 32Z","#35232d",'opacity=".27"')+path("M0 32L9 24 24 32Z","#291a25",'opacity=".40"')+path("M0 0L9 8 9 24 0 32","none",'stroke="#fff" stroke-width=".65" stroke-opacity=".55"')+path("M9 8L16 13 9 24Z","#fff",'opacity=".16"')+'</g>';
 return svg(24,32,body,'preserveAspectRatio="none"');
}
function headerPlaque(kind){
 const colors={
  title:["#fff5e8","#f0dbc4","#e0c4ab","#d0ad91"],
  purple:["#c381ff","#9b50e4","#6f2bb6","#4f2385"],
  green:["#76cb62","#269b39","#146f2a","#10501e"],
  palette:["#fff5e8","#f0dbc4","#e0c4ab","#c49e83"]
 };
 const [a,b,c,d]=colors[kind],wide=kind==="title",square=kind==="palette";
 const w=wide?320:square?54:132,h=54;
 const shape=wide?"M13 3L300 2 317 15 316 40 302 50 15 52 2 27Z":square?"M14 2H40L52 15 51 39 39 51H14L2 39 2 15Z":"M18 3L114 2 130 27 115 50 18 51 2 27Z";
 const folds=wide?[
  ["M13 3L89 7 52 23 2 27Z",a,.73],["M89 7L190 2 154 17 52 23Z",a,.45],
  ["M190 2L300 2 317 15 243 11Z",a,.40],["M2 27L52 23 15 52Z",c,.74],
  ["M15 52L52 23 105 49Z",a,.68],["M105 49L154 17 243 48Z",b,.54],
  ["M243 48L317 15 316 40 302 50Z",c,.7]
 ]:square?[
  ["M14 2H40L27 11 2 15Z",a,.74],["M2 15L27 11 14 51 2 39Z",c,.61],
  ["M27 11L52 15 51 39 39 51Z",b,.42],["M14 51L27 11 39 51Z",a,.32]
 ]:[
  ["M18 3L60 6 45 23 2 27Z",a,.67],["M60 6L114 2 130 27 90 15Z",a,.45],
  ["M2 27L45 23 18 51Z",c,.82],["M45 23L90 15 75 49 18 51Z",b,.30],
  ["M90 15L130 27 115 50 75 49Z",c,.65]
 ];
 const outline='<clipPath id="plaque"><path d="'+shape+'"/></clipPath>';
 let body=defs(grad("stock",a,b)+outline);
 body+=path(shape,d,'transform="translate(0 1.4)" opacity=".82"')+path(shape,"url(#stock)");
 body+='<g clip-path="url(#plaque)">'+folds.map(([p,color,opacity])=>path(p,color,'opacity="'+opacity+'" stroke="'+a+'" stroke-opacity=".35" stroke-width=".48"')).join("")+grainLayer(w,h,.058)+'</g>';
 body+=path(shape,"none",'stroke="'+a+'" stroke-opacity=".76" stroke-width=".65" stroke-linejoin="round"');
 return svg(w,h,body,'preserveAspectRatio="none"');
}
function headerLeaf(){
 seq=0;
 return svg(65,58,defs()+maple(31,27,1,"#d8463c")+maple(11,47,.38,"#eab446"));
}
const enc=s=>'url("data:image/svg+xml,'+encodeURIComponent(s).replace(/'/g,"%27")+'")';
export function makePaperAssets(footer){
 const a={footer,fold:fold(),"fold-left":end(false),"fold-right":end(true),"header-green":headerPlaque("green"),"header-leaf":headerLeaf()};
 return '/* Generated by generatePaperAssets.mjs. */\n.quest-ui-theme-origami.quest-ui-theme {\n'+Object.entries(a).map(([name,s])=>'    --origami-art-'+name+': '+enc(s)+';').join("\n")+'\n}\n';
}
if (process.argv[1]?.endsWith("generatePaperAssets.mjs")) {
 const { readFileSync } = await import("node:fs");
 const target=new URL("./paper-assets.css",import.meta.url);
 const previous=readFileSync(target,"utf8");
 const footer=decodeURIComponent(previous.match(/--origami-art-footer: url\("data:image\/svg\+xml,([^"]+)"\)/)[1]);
 writeFileSync(target,makePaperAssets(footer));
}
