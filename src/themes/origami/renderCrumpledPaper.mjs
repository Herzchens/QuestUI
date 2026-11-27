// Offline orthographic paper relief bake. No runtime renderer or dependencies.
// The sheet has tapered intersecting creases, broad buckling, and fine fibers.
// Light is derived from the height-field normal, not drawn stroke outlines.
const N=640;
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function relief(seed){
 const random=rng(seed), z=new Float32Array(N*N);
 const folds=[];
 for(let i=0;i<22;i++){
  const cx=random()*N,cy=random()*N,angle=random()*Math.PI*2;
  const branches=2+Math.floor(random()*3);
  for(let j=0;j<branches;j++){
   const a=angle+j*2.1+(random()-.5)*.8,len=28+random()*105;
   const amp=(random()<.44?-1:1)*(.65+random()*1.75), width=3.5+random()*9;
   folds.push([cx,cy,Math.cos(a),Math.sin(a),len,amp,width,random()*1.1]);
  }
 }
 for(let i=0;i<37;i++){
  const a=random()*Math.PI*2;
  folds.push([random()*N,random()*N,Math.cos(a),Math.sin(a),14+random()*47,(random()<.5?-1:1)*(.30+random()*.95),1.7+random()*4,random()]);
 }
 // Residual long fold lines from opening a previously folded sheet.
 // Almost straight, shallow, with different lengths and signs.
 for(const [x,y,a,len,amp,w] of [[-22,116,.35,540,1.7,4.2],[112,-25,1.19,680,-1.9,4.8],[655,216,2.65,460,1.5,4.0],[37,465,-.46,360,-1.25,3.3]]){
  const angle=a+(random()-.5)*.09;
  folds.push([x+(random()-.5)*20,y+(random()-.5)*20,Math.cos(angle),Math.sin(angle),len,amp,w,.08]);
 }
 // Limit each branch to its local bounds. All folds fade at their ends.
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  z[y*N+x]=1.0*Math.sin(x*.018+y*.013)+.60*Math.sin(x*.032-y*.019)+.32*Math.cos(x*.052+y*.041);
 }
 for(const [cx,cy,ux,uy,len,amp,w,curve] of folds){
  const x2=cx+ux*len,y2=cy+uy*len,pad=w*4+5;
  const l=Math.max(0,Math.floor(Math.min(cx,x2)-pad)),r=Math.min(N-1,Math.ceil(Math.max(cx,x2)+pad));
  const t=Math.max(0,Math.floor(Math.min(cy,y2)-pad)),b=Math.min(N-1,Math.ceil(Math.max(cy,y2)+pad));
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
   const dx=x-cx,dy=y-cy,along=(dx*ux+dy*uy)/len;
   if(along<0||along>1)continue;
   const taper=Math.pow(Math.sin(Math.PI*along),1.15);
   const d=(-dx*uy+dy*ux)-Math.sin(Math.PI*along)*curve*w*.55;
   const width=w*(.42+.58*taper);
   if(Math.abs(d)>width*3)continue;
   const rounded=Math.sqrt(d*d+.40*.40)-.40;
   const ridge=Math.exp(-rounded/(width*.42));
   const shoulder=Math.exp(-Math.pow((d-width*.68)/(width*.95),2))*.18;
   z[y*N+x]+=amp*taper*(ridge-shoulder);
  }
 }
 const shade=new Float32Array(N*N);
 const at=(x,y)=>z[clamp(y,0,N-1)*N+clamp(x,0,N-1)];
 const light=[-.43,-.57,.70],norm=Math.hypot(...light),lx=light[0]/norm,ly=light[1]/norm,lz=light[2]/norm;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const p=y*N+x,h=z[p],dx=(at(x+1,y)-at(x-1,y))/2,dy=(at(x,y+1)-at(x,y-1))/2;
  const direct=Math.max(0,(-dx*lx-dy*ly+lz)/Math.hypot(dx,dy,1));
  let occlusion=0;
  for(const d of [2,5,11,19]){
   const q=at(Math.round(x+d*lx),Math.round(y+d*ly));
   occlusion=Math.max(occlusion,clamp((q-h-d*lz+.25)/2,0,1));
  }
  const local=(at(x-3,y)+at(x+3,y)+at(x,y-3)+at(x,y+3))/4-h;
  const fiber=(random()-.5)*.018+(Math.sin(x*1.92+y*.17)*Math.sin(y*.37+x*.04))*.003;
  shade[p]=clamp(1+(direct-lz)*.32-occlusion*.025-Math.max(0,local)*.012+fiber,.80,1.13);
 }
 return shade;
}
// Indexed PNG with a small fixed-Huffman DEFLATE encoder. This keeps the
// checked-in managed CSS self-contained and deterministic on every Node version.
const ascii=s=>Array.from(s,c=>c.charCodeAt(0));
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function crc(a){let c=-1;for(const v of a){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^-1)>>>0;}
function chunk(name,data){const a=ascii(name).concat(Array.from(data));return u32(data.length).concat(a,u32(crc(a)));}
function deflate(a){
 const out=[0x78,0x01];let word=0,bits=0;
 const put=(v,n)=>{word|=v<<bits;bits+=n;while(bits>=8){out.push(word&255);word>>>=8;bits-=8;}};
 const rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1;}return r;};
 const symbol=s=>{if(s<144)put(rev(0x30+s,8),8);else if(s<256)put(rev(0x190+s-144,9),9);else if(s<280)put(rev(s-256,7),7);else put(rev(0xc0+s-280,8),8);};
 const lb=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],le=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
 const db=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],de=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
 const prev=new Int32Array(65536);prev.fill(-1);
 const key=i=>((a[i]*251+a[i+1])*251+a[i+2])&65535;
 put(1,1);put(1,2);
 for(let i=0;i<a.length;){
  let n=0,d=0;
  if(i+2<a.length){const k=key(i),j=prev[k];prev[k]=i;if(j>=0&&i-j<=32768){const m=Math.min(258,a.length-i);while(n<m&&a[j+n]===a[i+n])n++;d=i-j;}}
  if(n>=3){
   let l=lb.length-1;while(lb[l]>n)l--;symbol(257+l);put(n-lb[l],le[l]);
   let q=db.length-1;while(db[q]>d)q--;put(rev(q,5),5);put(d-db[q],de[q]);
   for(let j=1;j<n&&i+j+2<a.length;j++)prev[key(i+j)]=i+j;
   i+=n;
  }else{symbol(a[i]);i++;}
 }
 symbol(256);if(bits)out.push(word&255);
 let s1=1,s2=0;for(const v of a){s1=(s1+v)%65521;s2=(s2+s1)%65521;}return out.concat(u32((s2<<16)|s1));
}
function base64(a){const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let s="";for(let i=0;i<a.length;i+=3){const v=(a[i]<<16)|((a[i+1]||0)<<8)|(a[i+2]||0);s+=abc[v>>>18]+abc[(v>>>12)&63]+(i+1<a.length?abc[(v>>>6)&63]:"=")+(i+2<a.length?abc[v&63]:"=");}return s;}
function encodePaper(z,navy,w,h){
 const palette=[],raw=new Uint8Array((w/2+1)*h);
 const base=navy?[12,35,65]:[246,230,210];
 for(let i=0;i<16;i++){const v=.80+i*.33/15;for(const c of base)palette.push(Math.round(clamp(navy?c+(v-1)*c*1.65:c*v,0,255)));}
 for(let y=0;y<h;y++)for(let x=0;x<w;x+=2){
  const q=k=>clamp(Math.round((z[y*w+k]-.80)*15/.33),0,15);
  raw[y*(w/2+1)+1+x/2]=(q(x)<<4)|q(x+1);
 }
 return base64([137,80,78,71,13,10,26,10].concat(chunk("IHDR",u32(w).concat(u32(h),[4,3,0,0,0])),chunk("PLTE",palette),chunk("IDAT",deflate(raw)),chunk("IEND",[])));
}
// Fixed, reopened crease network. No triangular mosaic or random vertices.
// A broad low-frequency bend supports the narrower, tapered fold scars.
// All coordinates are material coordinates of one continuous thin sheet.
function navyRelief(){
 const z=new Float32Array(N*N),shade=new Float32Array(N*N);
 const lines=[
  [-54,104,198,226,8.4,14],[198,226,445,-40,-7.1,15],
  [198,226,332,425,9.4,13],[332,425,680,307,-8.8,16],
  [332,425,238,680,-6.5,13],[445,-40,534,193,6.2,12],
  [534,193,680,243,-5.4,10],[534,193,332,425,5.1,10],
  [-40,493,119,396,-6.1,13],[119,396,198,226,4.6,10],
  [119,396,238,680,5.1,14],[680,570,490,510,6.0,12],
  [490,510,332,425,-5.0,10],[490,510,575,680,-4.7,12],
  [60,45,143,132,2.4,5],[143,132,198,226,-2.7,5],
  [332,425,385,565,2.8,5],[534,193,610,128,-2.5,5],
  [119,396,37,341,2.1,5],[490,510,552,456,2.3,4.5]
 ];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  // Shallow buckling on a much larger scale than the crease scars.
  z[y*N+x]=3.4*Math.sin(x*.012+y*.008)+2.2*Math.sin(x*.018-y*.015)+1.0*Math.cos(x*.031+y*.026);
 }
 for(const [ax,ay,bx,by,amp,width] of lines){
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  const pad=width*5;
  for(let y=Math.max(0,Math.floor(Math.min(ay,by)-pad));y<=Math.min(N-1,Math.ceil(Math.max(ay,by)+pad));y++){
   for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-pad));x<=Math.min(N-1,Math.ceil(Math.max(ax,bx)+pad));x++){
    const t=((x-ax)*ux+(y-ay)*uy)/len;
    if(t<=0||t>=1)continue;
    const taper=Math.sin(Math.PI*t)**.65;
    const d=(-(x-ax)*uy+(y-ay)*ux);
    const w=width*(.65+.35*taper),r=Math.sqrt(d*d+1.8*1.8)-1.8;
    z[y*N+x]+=amp*taper*Math.exp(-r/w);
   }
  }
 }
 const at=(x,y)=>z[clamp(y,0,N-1)*N+clamp(x,0,N-1)];
 const norm=Math.hypot(.45,.55,.70),lx=-.45/norm,ly=-.55/norm,lz=.70/norm;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const dx=(at(x+1,y)-at(x-1,y))/2,dy=(at(x,y+1)-at(x,y-1))/2;
  const direct=Math.max(0,(-dx*lx-dy*ly+lz)/Math.hypot(dx,dy,1));
  const fiber=.004*Math.sin(x*1.92+y*.17)*Math.sin(y*.37+x*.04);
  // Diffuse only, bounded so the navy sheet stays behind the foreground.
  shade[y*N+x]=clamp(1+(direct-lz)*.64+fiber,.86,1.12);
 }
 return shade;
}
export function paperImage(navy){return encodePaper(navy?navyRelief():relief(91437),navy,N,N);}
// Dedicated horizontal stock: one long residual fold and one short fold.
// Derivatives of the shallow height field provide the light/dark crease pair.
export function buttonPaper(){
 const w=320,h=80,r=rng(2719),z=new Float32Array(w*h),light=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const d=(x-47-y*.93),e=x-270+y*.72;
  const a=2.3*Math.exp(-Math.sqrt(d*d+.8)/5.6);
  const b=-1.5*Math.exp(-Math.sqrt(e*e+.8)/4.0)*Math.max(0,1-y/66);
  z[y*w+x]=a+b+.23*Math.cos(x/47+y/22);
 }
 const at=(x,y)=>z[clamp(y,0,h-1)*w+clamp(x,0,w-1)];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=(at(x+1,y)-at(x-1,y))/2,dy=(at(x,y+1)-at(x,y-1))/2;
  const direct=(.43*dx+.57*dy+.70)/Math.hypot(.43,.57,.70)/Math.hypot(dx,dy,1);
  light[y*w+x]=clamp(1+(direct-.70/Math.hypot(.43,.57,.70))*.56+(r()-.5)*.015,.80,1.13);
 }
 return encodePaper(light,false,w,h);
}
export function makeCrumpledPaper(){
 return '/* Generated by renderCrumpledPaper.mjs. */\n.quest-ui-theme-origami.quest-ui-theme {\n'+[["ivory",false],["navy",true]].map(([name,navy])=>'    --origami-art-'+name+': url("data:image/png;base64,'+paperImage(navy)+'");').join("\n")+'\n    --origami-art-unfolded-button: url("data:image/png;base64,'+buttonPaper()+'");\n}\n';
}

if (process.argv[1]?.endsWith("renderCrumpledPaper.mjs")) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(new URL("./crumpled-paper.css", import.meta.url), makeCrumpledPaper());
}
