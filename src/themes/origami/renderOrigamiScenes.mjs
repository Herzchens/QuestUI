import { png } from "./paperIndexedPng.mjs";
// Offline deterministic paper panorama baker; no dependencies or runtime rendering.
function bakeOrigamiScenes(){
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const hex=s=>[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
 const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
 const names=[
  ["crane","e9a9a3","b44154","8b263e","e66b62","edc65e","mountain",17],
  ["whale","8fc4e5","357cb6","134d85","559bc7","f2e2b8","ocean",31],
  ["wolf","b2a6d6","7262a4","423372","9474bf","f3d7c8","mountain",43],
  ["rabbit","d3dfab","78a659","3d6942","a9c975","f1d99c","meadow",59],
  ["fox","ecc08a","c47c43","80452d","e2a35f","f4d27e","forest",71],
  ["butterfly","e9c4df","ad77b8","784989","d5a4d3","f6ddad","garden",83],
  ["elephant","f3d4a2","c18a43","925523","e7b86a","f9d578","dunes",97],
  ["turtle","a8ddd1","4fa39c","246d77","78c9bd","f6e6b5","lagoon",109],
  ["koi","a8cfdc","4d94a5","2f647b","7bbbc3","f1ded1","pond",127],
  ["owl","8b9cb9","405b80","243552","637b9e","e7d7ad","night",149]
 ];
 // The ten scene silhouettes are deliberately authored, not variations of
 // the same random mountain generator. Each row is a complete paper layer.
 const compositions={
  crane:{disc:[365,47,39],stars:[[250,42,7],[615,51,11],[725,31,6]],layers:[
   [[0,133],[104,91],[182,112],[255,51],[320,103],[413,75],[516,125],[608,74],[703,95],[800,64]],
   [[0,150],[111,121],[196,145],[282,92],[380,142],[458,113],[566,155],[676,103],[800,133]],
   [[0,190],[116,148],[215,177],[327,126],[426,161],[544,148],[622,174],[800,133]]]},
  whale:{disc:[245,46,34],stars:[[388,34,6],[677,53,8]],waves:[
   [[0,116],[120,107],[230,118],[336,99],[450,114],[570,96],[690,115],[800,104]],
   [[0,148],[110,128],[216,147],[335,119],[445,140],[558,115],[690,145],[800,124]],
   [[0,183],[100,165],[225,175],[360,151],[460,172],[590,155],[714,179],[800,151]]]},
  wolf:{disc:[470,59,43],stars:[[276,36,8],[655,37,8],[725,59,5]],layers:[
   [[0,119],[90,82],[166,126],[285,57],[361,116],[447,91],[554,131],[651,52],[800,112]],
   [[0,159],[120,118],[242,148],[347,109],[440,145],[547,111],[677,149],[800,94]],
   [[0,188],[122,157],[250,179],[369,152],[502,169],[640,143],[800,180]]]},
  rabbit:{disc:[288,41,26],stars:[],waves:[
   [[0,116],[115,91],[231,106],[382,119],[510,83],[645,101],[800,123]],
   [[0,151],[140,128],[265,139],[382,115],[520,143],[690,126],[800,151]],
   [[0,181],[135,163],[260,172],[390,151],[540,170],[670,156],[800,175]]]},
  fox:{disc:[350,44,37],stars:[[204,38,6],[685,48,8]],layers:[
   [[0,139],[100,106],[220,113],[328,61],[420,115],[511,94],[608,120],[711,78],[800,123]],
   [[0,174],[144,137],[250,152],[361,111],[460,153],[565,128],[690,148],[800,118]],
   [[0,190],[160,165],[262,182],[389,147],[512,174],[668,158],[800,180]]]},
  butterfly:{disc:[655,39,25],stars:[[272,44,7],[495,27,6]],waves:[
   [[0,136],[143,100],[280,124],[436,103],[600,119],[800,93]],
   [[0,165],[125,139],[291,152],[448,125],[612,145],[800,126]],
   [[0,187],[185,169],[356,177],[506,151],[670,171],[800,157]]]},
  elephant:{disc:[428,52,43],stars:[[216,41,6],[650,34,7]],waves:[
   [[0,133],[137,111],[275,125],[418,90],[570,111],[699,94],[800,117]],
   [[0,167],[130,154],[245,124],[415,143],[570,121],[683,139],[800,122]],
   [[0,194],[171,178],[290,158],[456,176],[615,153],[800,177]]]},
  turtle:{disc:[628,43,31],stars:[[290,34,6]],waves:[
   [[0,120],[140,116],[278,123],[400,107],[530,115],[660,102],[800,117]],
   [[0,151],[135,139],[267,146],[410,126],[550,149],[690,134],[800,144]],
   [[0,182],[130,162],[285,175],[415,160],[555,170],[685,151],[800,169]]]},
  koi:{disc:[305,33,27],stars:[],waves:[
   [[0,106],[180,108],[340,99],[510,104],[680,96],[800,104]],
   [[0,144],[135,135],[300,141],[465,130],[625,139],[800,132]],
   [[0,177],[165,167],[330,176],[500,160],[665,171],[800,164]]]},
  owl:{disc:[355,44,34],stars:[[242,36,6],[514,29,7],[688,47,9],[740,28,4]],layers:[
   [[0,125],[122,89],[205,106],[301,77],[403,128],[503,96],[625,58],[800,121]],
   [[0,162],[130,129],[245,146],[351,121],[460,158],[580,112],[694,136],[800,114]],
   [[0,190],[135,157],[262,177],[378,153],[530,173],[660,145],[800,183]]]}
 };
 const results={};
 for(const [name,skyHex,midHex,darkHex,lightHex,sunHex,kind,seed] of names){
  const w=800,h=200,pixels=new Uint8Array(w*h),palette=[],keys=new Map(),rgbPixels=new Uint8Array(w*h*3);
  const sky=hex(skyHex),mid=hex(midHex),dark=hex(darkHex),light=hex(lightHex),sun=hex(sunHex);
  function pixel(x,y,rgb){const k=(y*w+x)*3;rgbPixels[k]=rgb[0];rgbPixels[k+1]=rgb[1];rgbPixels[k+2]=rgb[2]}
  const shade=(rgb,v)=>rgb.map(c=>clamp(Math.round(c*v),0,255));
  function triangle(a,b,c,rgb){
   const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<.001)return;
   const l=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),r=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),t=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),d=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   for(let y=t;y<=d;y++)for(let x=l;x<=r;x++){const px=x+.5,py=y+.5,u=((b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]))/area,v=((c[0]-b[0])*(py-b[1])-(c[1]-b[1])*(px-b[0]))/area;if(u>=-.00001&&v>=-.00001&&u+v<=1.00001){const edge=Math.min(u,v,1-u-v);const local=1.025-.10*u+.045*v+Math.max(0,.035-edge)*1.5;pixel(x,y,shade(rgb,local))}}
  }
  function polygon(points,rgb){for(let j=1;j<points.length-1;j++)triangle(points[0],points[j],points[j+1],rgb)}
  const design=compositions[name];
  // Matte sky with quiet facets and a brighter horizon. Keep the image a
  // single panorama; all paper faces are baked together before PNG encoding.
  for(let y=0;y<h;y++){const c=mix(sky,light,.12+.20*y/h);for(let x=0;x<w;x++)pixel(x,y,c)}
  const skyFaces=[
   [[0,0],[190,0],[129,91]],[[190,0],[335,0],[129,91]],
   [[335,0],[477,0],[395,75]],[[477,0],[612,0],[395,75]],
   [[612,0],[800,0],[712,97]]
  ];
  for(const [i,f] of skyFaces.entries())triangle(...f,mix(sky,light,.025+(i%3)*.025));
  const [cx,cy,rad]=design.disc;
  function ellipseShade(cx,cy,rx,ry,strength){
   const l=Math.max(0,Math.floor(cx-rx)),r=Math.min(w-1,Math.ceil(cx+rx)),t=Math.max(0,Math.floor(cy-ry)),d=Math.min(h-1,Math.ceil(cy+ry));
   for(let y=t;y<=d;y++)for(let x=l;x<=r;x++){const q=((x-cx)/rx)**2+((y-cy)/ry)**2;if(q>=1)continue;const k=(y*w+x)*3,m=1-strength*(1-q)**1.4;for(let c=0;c<3;c++)rgbPixels[k+c]=Math.round(rgbPixels[k+c]*m)}
  }
  ellipseShade(cx+2,cy+4,rad+4,rad+4,.22);
  const center=[cx-2,cy-1],pts=Array.from({length:16},(_,i)=>[cx+rad*Math.cos(i*Math.PI/8),cy+rad*Math.sin(i*Math.PI/8)]);
  for(let j=0;j<pts.length;j++){const a=pts[j],b=pts[(j+1)%pts.length];const lightness=.98+.12*Math.cos(j*Math.PI/8-2.15)+((j%2)*.035);triangle(center,a,b,shade(sun,lightness))}
  function star(x,y,r){
   ellipseShade(x+1.8,y+2,r+3,r+3,.15);
   const points=Array.from({length:10},(_,i)=>[x+Math.cos(i*Math.PI/5-Math.PI/2)*r*(i%2?.38:1),y+Math.sin(i*Math.PI/5-Math.PI/2)*r*(i%2?.38:1)]);
   for(let i=0;i<10;i++)triangle([x,y],points[i],points[(i+1)%10],shade(sun,i%2?.83:1.13));
  }
  for(const [x,y,r] of design.stars)star(x,y,r);
  // A shadow from the cut upper edge is composited onto the already painted
  // underlying layer, followed by the next paper surface.
  function shadowAt(x,edge,depth=8,strength=.23){
   for(let d=1;d<=depth;d++){const y=Math.floor(edge-d);if(y<0||y>=h)continue;const k=(y*w+x)*3,m=1-strength*(1-d/(depth+1))**1.55;for(let c=0;c<3;c++)rgbPixels[k+c]=Math.round(rgbPixels[k+c]*m)}
  }
  function mountain(points,rgb,index){
   for(let j=0;j<points.length-1;j++){
    const a=points[j],b=points[j+1],dx=b[0]-a[0],width=Math.max(1,dx);
    for(let x=Math.max(0,Math.floor(a[0]));x<Math.min(w,Math.ceil(b[0]));x++)shadowAt(x,a[1]+(b[1]-a[1])*(x-a[0])/width,8+index*2,.24);
    // A shared ridge is lit on its upper-left face and darker on the return.
    // Different sloped valleys and lower vertices break the repetitive grid.
    const foot=[a[0]+dx*(j%3===0?.78:j%3===1?.28:.56),Math.min(h+12,Math.max(a[1],b[1])+40+index*12)];
    const left=[a[0],h+2],right=[b[0],h+2];
    const slope=clamp((a[1]-b[1])/width,-.65,.65);
    triangle(a,b,foot,shade(rgb,1.09+slope*.10));triangle(a,foot,left,shade(rgb,1.03+slope*.08));
    triangle(foot,b,right,shade(rgb,.77+slope*.12));triangle(left,foot,right,shade(rgb,.91));
    triangle(a,b,[b[0],b[1]+1.5],shade(rgb,1.22));triangle(a,[b[0],b[1]+1.5],[a[0],a[1]+1.5],shade(rgb,1.22));
   }
  }
  function curved(points,x){
   let j=0;while(j<points.length-2&&x>points[j+1][0])j++;
   const a=points[j],b=points[j+1],p=points[Math.max(0,j-1)],q=points[Math.min(points.length-1,j+2)],t=clamp((x-a[0])/(b[0]-a[0]),0,1);
   return .5*((2*a[1])+(-p[1]+b[1])*t+(2*p[1]-5*a[1]+4*b[1]-q[1])*t*t+(-p[1]+3*a[1]-3*b[1]+q[1])*t*t*t);
  }
  // Sweeping continuous paper ribbons for water, dunes and rolling meadows.
  // They are not triangulated as rows of miniature pyramids.
  function ribbon(points,rgb,index){
   for(let x=0;x<w;x++){
    const e=curved(points,x+.5),slope=(curved(points,x+1)-curved(points,x-1))/2;
    shadowAt(x,e,8+index*2,.27);
    for(let y=Math.max(0,Math.ceil(e));y<h;y++){
     const d=y-e,frac=d/Math.max(1,h-e);
     const face=1.04+clamp(-slope,-.7,.7)*.14-.13*frac;
     const rim=d<2?1.16:d<6?1.07:1;
     const fold=.055*Math.sin(x*.016+index*1.3+frac*2.1)*Math.max(0,1-frac);
     pixel(x,y,shade(rgb,face*rim+fold));
    }
   }
  }
  const layerColors=[mix(sky,mid,.67),mid,mix(mid,dark,.52)];
  const layers=design.layers||design.waves;
  for(let i=0;i<layers.length;i++)(design.layers?mountain:ribbon)(layers[i],layerColors[i],i);
  // Backlit paper trees: broad faces, an offset lower flap and trunk, with
  // deliberately clustered, irregular silhouettes rather than repeated stamps.
  function tree(x,y,size,rgb){
   const s=size;
   ellipseShade(x+s*.13,y+2,s*.38,4+s*.08,.32);
   polygon([[x-s*.045,y-s*.27],[x+s*.05,y-s*.27],[x+s*.08,y],[x-s*.06,y]],shade(rgb,.59));
   for(let j=3;j>=0;j--){
    const yy=y-s*(1-j*.18),ww=s*(.16+j*.077),lower=yy+s*(.36+j*.018);
    triangle([x,yy],[x-ww,lower],[x,lower-s*.10],shade(rgb,1.20-j*.045));
    triangle([x,yy],[x,lower-s*.10],[x+ww,lower],shade(rgb,.74-j*.02));
    triangle([x-ww,lower],[x,lower-s*.10],[x+ww,lower],shade(rgb,.59));
   }
  }
  function leaf(x,y,s,angle,rgb){
   const c=Math.cos(angle),a=Math.sin(angle),transform=(u,v)=>[x+(u*c-v*a)*s,y+(u*a+v*c)*s];
   const points=[[0,-1],[-.24,-.47],[-.65,-.76],[-.52,-.21],[-1,-.12],[-.47,.25],[-.65,.58],[-.17,.46],[0,1],[.17,.46],[.65,.58],[.47,.25],[1,-.12],[.52,-.21],[.65,-.76],[.24,-.47]].map(q=>transform(...q));
   ellipseShade(x+1,y+2,s*.70,s*.52,.18);
   for(let i=0;i<points.length;i++)triangle([x,y],points[i],points[(i+1)%points.length],shade(rgb,i%4<2?1.10:.78));
  }
  function lotus(x,y,s,rgb){
   ellipseShade(x,y+2,s*1.2,s*.38,.19);
   polygon([[x-s,y],[x-s*.44,y-s*.32],[x+s*.33,y-s*.29],[x+s,y],[x+s*.38,y+s*.24],[x-s*.48,y+s*.23]],mix(dark,hex("78b595"),.63));
   for(const dir of [-1,1]){
    triangle([x,y],[x+dir*s*.82,y-s*.38],[x+dir*s*.24,y-s*.16],shade(rgb,.82));
    triangle([x,y],[x+dir*s*.46,y-s*.72],[x+dir*s*.60,y-s*.26],shade(rgb,1.05));
   }
   triangle([x,y],[x-s*.22,y-s*.38],[x,y-s*.91],shade(rgb,1.14));
   triangle([x,y],[x,y-s*.91],[x+s*.22,y-s*.38],shade(rgb,.92));
  }
  function blossom(x,y,s,rgb){
   const stalk=shade(mid,.55);
   triangle([x-1,y+s],[x+1,y+s],[x,y-s*.75],stalk);
   for(let j=0;j<5;j++){
    const a=j*Math.PI*2/5-Math.PI/2,b=a+.64;
    const p=[x+Math.cos(a)*s,y+Math.sin(a)*s],q=[x+Math.cos(b)*s*.52,y+Math.sin(b)*s*.52];
    triangle([x,y],p,q,shade(rgb,j%2?.87:1.13));
    triangle([x,y],p,[x+Math.cos(a-.64)*s*.52,y+Math.sin(a-.64)*s*.52],shade(rgb,j%2?1.05:.77));
   }
   triangle([x-2,y],[x+2,y],[x,y-3],sun);
  }
  function glint(x,y,s){
   polygon([[x-s,y],[x-s*.16,y-2],[x+s,y-1],[x+s*.31,y+2]],shade(light,1.18));
  }
  switch(kind){
   case "mountain":{
    const coords=name==="crane"?[[130,194,37],[159,194,50],[187,195,31],[585,194,45],[625,196,31],[715,195,49],[751,194,31]]:[[110,193,30],[146,194,44],[182,196,27],[571,195,38],[604,195,55],[640,194,43],[708,196,36],[745,196,51]];
    for(const [x,y,s] of coords)tree(x,y,s,mix(dark,mid,.10));
    if(name==="crane"){leaf(211,82,13,-.3,hex("b8303e"));leaf(696,81,11,.4,hex("d85c3e"))}
    break;
   }
   case "ocean":
    for(const [x,y,s] of [[105,145,26],[210,177,32],[340,133,19],[565,171,34],[672,142,27],[740,182,22]])glint(x,y,s);
    // One angular crest made of two overlapping, tapered paper folds.
    triangle([605,162],[670,119],[721,158],shade(light,1.12));
    triangle([605,162],[670,119],[682,153],shade(mid,.85));
    triangle([670,119],[721,158],[682,153],shade(light,.87));
    break;
   case "night":
    for(const [x,y,s] of [[100,193,46],[138,195,68],[182,193,49],[223,195,29],[570,195,37],[605,195,61],[645,195,46],[690,195,70],[735,195,56],[775,195,36]])tree(x,y,s,mix(dark,mid,.08));
    break;
   case "forest":
    for(const [x,y,s] of [[112,194,39],[145,195,54],[190,195,35],[596,196,37],[631,196,53],[683,196,41],[737,196,50]])tree(x,y,s,mix(dark,mid,.18));
    for(const [x,y,s,a] of [[200,62,14,-.4],[612,85,12,.6],[728,49,10,.2],[275,168,8,-.8]])leaf(x,y,s,a,hex("d25e36"));
    break;
   case "meadow":
    for(const [x,y,s] of [[126,193,18],[175,194,24],[242,195,17],[579,194,20],[620,194,28],[715,195,20]])tree(x,y,s,mix(dark,mid,.30));
    for(const [x,y,s] of [[153,179,6],[207,185,7],[274,178,6],[587,179,7],[673,184,9],[741,176,7]])blossom(x,y,s,sun);
    break;
   case "garden":
    for(const [x,y,s] of [[105,180,12],[133,187,17],[170,174,10],[205,184,14],[252,176,9],[582,182,14],[621,172,11],[663,185,16],[702,173,12],[753,184,16]])blossom(x,y,s,mix(sun,hex("e9a7d5"),(x%3)*.32));
    break;
   case "dunes":
    for(const [x,y,s] of [[172,182,15],[688,185,19]]){
     ellipseShade(x,y+1,s*.8,4,.24);
     triangle([x,y],[x-s*.54,y-s],[x+s*.10,y-s*.4],shade(dark,.91));
     triangle([x,y],[x+s*.88,y-s*.72],[x+s*.22,y-s*.22],shade(dark,.76));
     triangle([x,y],[x+s*.10,y-s*.4],[x+s*.22,y-s*.22],shade(light,1.12));
    }
    break;
   case "lagoon":
    for(const [x,y,s] of [[172,130,62],[689,139,75]]){
     ellipseShade(x,y+4,s,8,.26);
     triangle([x-s,y],[x-s*.24,y-s*.42],[x+s,y],shade(mid,.78));
     triangle([x-s,y],[x-s*.24,y-s*.42],[x+s*.12,y-s*.14],shade(light,1.12));
     tree(x-s*.22,y-4,s*.37,mix(dark,hex("5a966e"),.47));
    }
    for(const [x,y,s] of [[255,164,20],[551,179,27],[731,174,24]])glint(x,y,s);
    break;
   case "pond":
    for(const [x,y,s] of [[135,151,18],[216,183,23],[288,162,15],[575,177,22],[650,143,16],[724,186,25]])lotus(x,y,s,hex("efbdd6"));
    for(const [x,y,s] of [[105,183,18],[356,160,14],[510,147,20],[674,173,24]])glint(x,y,s);
    break;
  }
  // Quantize the illuminated sheet to a per-scene adaptive palette. Fine
  // grain is deliberately small; no noisy pixel-by-pixel RGB payload.
  const bins=new Map();
  for(let i=0;i<w*h;i++){const k=i*3;const r=rgbPixels[k]>>3,g=rgbPixels[k+1]>>3,b=rgbPixels[k+2]>>3;const key=(r<<10)|(g<<5)|b;let v=bins.get(key);if(!v)bins.set(key,v=[0,0,0,0]);v[0]++;v[1]+=rgbPixels[k];v[2]+=rgbPixels[k+1];v[3]+=rgbPixels[k+2]}
  const ranked=[...bins].sort((a,b)=>b[1][0]-a[1][0]||a[0]-b[0]).slice(0,256);
  for(const [k,v] of ranked){keys.set(k,palette.length);palette.push(v.slice(1).map(c=>Math.round(c/v[0])))}
  const nearest=new Map(keys);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=(y*w+x)*3;const grain=((Math.imul(x+seed,73856093)^Math.imul(y+seed,19349663))>>>0)%13===0?2:0;const r=clamp(rgbPixels[k]+grain,0,255),g=clamp(rgbPixels[k+1]+grain,0,255),b=clamp(rgbPixels[k+2]+grain,0,255);const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);let q=nearest.get(key);if(q===undefined){let best=Infinity;q=0;for(let j=0;j<palette.length;j++){const p=palette[j],d=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;if(d<best){best=d;q=j}}nearest.set(key,q)}pixels[y*w+x]=q}
  results[name]=png(w,h,pixels,palette);
 }
 return results;
}
export function makeOrigamiScenes(){return '/* Generated by renderOrigamiScenes.mjs. Offline paper illustration, no runtime drawing. */\n.quest-ui-theme-origami.quest-ui-theme {\n'+Object.entries(bakeOrigamiScenes()).map(([name,b64])=>'    --origami-scene-'+name+': url("data:image/png;base64,'+b64+'");').join('\n')+'\n}\n';}
if(process.argv[1]?.endsWith('renderOrigamiScenes.mjs')){const {writeFileSync}=await import('node:fs');writeFileSync(new URL('./scene-assets.css',import.meta.url),makeOrigamiScenes());}
