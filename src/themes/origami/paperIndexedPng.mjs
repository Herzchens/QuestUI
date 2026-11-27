// Deterministic indexed PNG encoder for offline Origami asset generation.
const ascii=s=>Array.from(s,c=>c.charCodeAt(0));
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function crc(a){let c=-1;for(const v of a){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^-1)>>>0}
function chunk(name,data){const a=ascii(name).concat(Array.from(data));return u32(data.length).concat(a,u32(crc(a)))}
function deflate(a){
 const out=[0x78,0x01];let word=0,bits=0;
 const put=(v,n)=>{word|=v<<bits;bits+=n;while(bits>=8){out.push(word&255);word>>>=8;bits-=8}};
 const rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1}return r};
 const symbol=s=>{if(s<144)put(rev(0x30+s,8),8);else if(s<256)put(rev(0x190+s-144,9),9);else if(s<280)put(rev(s-256,7),7);else put(rev(0xc0+s-280,8),8)};
 const lb=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],le=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
 const db=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],de=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
 const prev=new Int32Array(65536);prev.fill(-1);
 const key=i=>((a[i]*251+a[i+1])*251+a[i+2])&65535;
 put(1,1);put(1,2);
 for(let i=0;i<a.length;){let n=0,d=0;if(i+2<a.length){const k=key(i),j=prev[k];prev[k]=i;if(j>=0&&i-j<=32768){const m=Math.min(258,a.length-i);while(n<m&&a[j+n]===a[i+n])n++;d=i-j}}
  if(n>=3){let l=lb.length-1;while(lb[l]>n)l--;symbol(257+l);put(n-lb[l],le[l]);let q=db.length-1;while(db[q]>d)q--;put(rev(q,5),5);put(d-db[q],de[q]);for(let j=1;j<n&&i+j+2<a.length;j++)prev[key(i+j)]=i+j;i+=n}else{symbol(a[i]);i++}}
 symbol(256);if(bits)out.push(word&255);
 let s1=1,s2=0;for(const v of a){s1=(s1+v)%65521;s2=(s2+s1)%65521}return out.concat(u32((s2<<16)|s1))
}
function b64(a){const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let s="";for(let i=0;i<a.length;i+=3){const v=(a[i]<<16)|((a[i+1]||0)<<8)|(a[i+2]||0);s+=abc[v>>>18]+abc[(v>>>12)&63]+(i+1<a.length?abc[(v>>>6)&63]:"=")+(i+2<a.length?abc[v&63]:"=")}return s}
export function png(w,h,indices,palette,alpha){const raw=new Uint8Array((w+1)*h);for(let y=0;y<h;y++)raw.set(indices.subarray(y*w,(y+1)*w),y*(w+1)+1);return b64([137,80,78,71,13,10,26,10].concat(chunk("IHDR",u32(w).concat(u32(h),[8,3,0,0,0])),chunk("PLTE",palette.flat()),alpha?chunk("tRNS",alpha):[],chunk("IDAT",deflate(raw)),chunk("IEND",[])))}
