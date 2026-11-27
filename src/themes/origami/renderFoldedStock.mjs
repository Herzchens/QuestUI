import { png } from "./paperIndexedPng.mjs";
import { foldedAssets } from "./bake/recipes.mjs";
import { fixedFoldAssets } from "./bake/foldVariants.mjs";
function bakeFoldedStock(png){
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 function status(){
  const w=840,h=112,field=new Float32Array(w*h),pixels=new Uint8Array(w*h);
  const tent=(d,width)=>Math.max(0,1-Math.abs(d)/width);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=x/2,v=y/2;
   let z=1+.12*Math.sin(u/33+v/14)+.14*Math.cos(u/51-v/15);
   z+=2.4*tent(u-36+v*.75,15)*Math.max(0,1-v/48);
   z+=2.2*tent(420-u-35+(56-v)*.75,15)*Math.max(0,v/48);
   z+=1.4*tent(u-151-v*1.8,14)*Math.max(0,1-v/48);
   z-=.9*tent(u-304+(56-v)*.9,11)*Math.max(0,v/56);
   // Two separately modeled return faces, mostly at the ends.
   if(u<46&&v<31&&u/46+v/31<1)z=Math.max(z,1+u*.17+v*.20);
   if(420-u<46&&56-v<31&&(420-u)/46+(56-v)/31<1)z=Math.max(z,1+(420-u)*.17+(56-v)*.20);
   field[y*w+x]=z;
  }
  const at=(x,y)=>field[clamp(y,0,h-1)*w+clamp(x,0,w-1)];
  const palette=Array.from({length:64},(_,i)=>[246,228,206].map(v=>clamp(Math.round(v*(.68+i*.38/63)),0,255)));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const dx=at(x+1,y)-at(x-1,y),dy=at(x,y+1)-at(x,y-1),z=at(x,y);
   const direct=(.43*dx+.57*dy+.70)/Math.hypot(.43,.57,.70)/Math.hypot(dx,dy,1);
   let shadow=0;for(const d of [2,4,8,14,22]){const q=at(Math.round(x-d*.43),Math.round(y-d*.57));shadow=Math.max(shadow,clamp((q-z-d*.35+.18)/1.8,0,1))}
   const grain=((Math.imul(x+13,73856093)^Math.imul(y+29,19349663))>>>0)%7===0?.008:0;
   const edge=Math.min(y,h-1-y,x,w-1-x);
   // A shallow rolled lip, returned underside and directional fold contrast.
   const lip=y<5?.047*(1-y/5):0;
   const returnFace=y>h-9?.13*(1-(h-1-y)/9):0;
   const shade=clamp(1+(direct-.70/Math.hypot(.43,.57,.70))*.70-shadow*.15+grain+lip-returnFace-(edge<2?(2-edge)*.015:0),.68,1.06);
   pixels[y*w+x]=Math.round((shade-.68)*63/.38);
  }
  return png(w,h,pixels,palette);
 }
 // Transparent neutral lighting, so pigment remains the actual paper color.
 function lightingPalette(){
  const palette=[[0,0,0]],alpha=[0];
  for(const value of [0,255])for(let i=1;i<=63;i++){palette.push([value,value,value]);alpha.push(Math.round(i*255/63))}
  return {palette,alpha};
 }
 function lightIndex(d){
  const i=clamp(Math.round(Math.abs(d)*63),0,63);
  return i===0?0:d>0?63+i:i;
 }
 // Piecewise planar paper relief. Each triangle has an actual surface
 // normal; the large quiet face and folded returns share vertices.
 function mesh(w,h,vertices,faces){
  const field=new Float32Array(w*h),normal=new Float32Array(w*h);
  const lx=-.46,ly=-.56,lz=.69,ln=Math.hypot(lx,ly,lz);
  for(const face of faces){
   const [a,b,c]=face.map(i=>vertices[i]);
   const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],area=ux*vy-uy*vx;
   const dx=(uz*vy-uy*vz)/area,dy=(ux*vz-uz*vx)/area;
   const direct=(-dx*lx-dy*ly+lz)/Math.hypot(dx,dy,1)/ln;
   const shade=clamp((direct-lz/ln)*.74,-.40,.25);
   for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));y++){
    for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
     const px=x+.5-a[0],py=y+.5-a[1],u=(px*vy-py*vx)/area,v=(ux*py-uy*px)/area;
     if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6){const k=y*w+x;field[k]=a[2]+u*uz+v*vz;normal[k]=shade;}
    }
   }
  }
  return {field,normal};
 }
 function paperGrain(x,y){
  // Small deterministic fibers, not a noisy specular highlight.
  return .018*Math.sin(x*1.91+y*.19)*Math.sin(y*.71-x*.11)+.012*Math.cos(x*.24+y*2.31);
 }
 function matte(){
  const w=128,h=64,pixels=new Uint8Array(w*h),{palette,alpha}=lightingPalette();
  // The wide central face is almost planar; end panels fold at unequal
  // angles. A return edge below it conveys the thickness of folded paper.
  const vertices=[
   [0,0,0],[24,0,6],[104,0,7],[128,0,2],
   [0,64,1],[24,64,5],[104,64,4],[128,64,0],
   [15,17,10],[29,43,7],[111,13,4],[100,45,8],
   [0,32,2],[128,31,1],[64,0,6.5],[64,64,4.5],
   [64,42,6],[64,17,7]
  ];
  // Two irregular diagonal folds are the dominant detail; the central
  // area is a continuous sheet, rather than a raised gemstone plateau.
  const faces=[
   [0,1,8],[0,8,12],[12,8,9],[12,9,4],[4,9,5],
   [1,14,17],[1,17,8],[14,2,10],[14,10,17],
   [2,3,10],[3,13,10],[13,11,10],[13,7,11],[7,6,11],
   [8,17,16],[8,16,9],[17,10,11],[17,11,16],
   [9,16,15],[9,15,5],[16,11,6],[16,6,15]
  ];
  const {field,normal}=mesh(w,h,vertices,faces);
  const at=(x,y)=>field[clamp(y,0,h-1)*w+clamp(x,0,w-1)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const k=y*w+x,z=field[k];
   let shadow=0;
   for(const d of [2,4,8,13])shadow=Math.max(shadow,clamp((at(Math.round(x-d*.46),Math.round(y-d*.56))-z-d*.68)/5,0,1));
   const underside=y>=h-4?.11+.18*(1-(h-1-y)/4):0;
   const rim=y<2?.085*(1-y/2):0;
   // A faint residual fold on the broad sheet, not a uniform bevel.
   const crease=x-(40+y*.72),residual=Math.exp(-Math.abs(crease)/1.8)*(crease<0?.045:-.048);
   const shade=normal[k]-shadow*.23-underside+rim+paperGrain(x,y)+residual;

   pixels[k]=lightIndex(shade);
  }
  return png(w,h,pixels,palette,alpha);
 }
 return {"stock-status-3d":status(),"stock-matte":matte(),...foldedAssets(png),...fixedFoldAssets(png)};
}
export function makeFoldedStock(){return "/* Generated by renderFoldedStock.mjs; offline lighting only. */\n.quest-ui-theme-origami.quest-ui-theme {\n"+Object.entries(bakeFoldedStock(png)).map(([k,v])=>'    --origami-'+k+': url("data:image/png;base64,'+v+'");').join("\n")+"\n}\n";}
if(process.argv[1]?.endsWith("renderFoldedStock.mjs")){const {writeFileSync}=await import("node:fs");writeFileSync(new URL("./polish-stock.css",import.meta.url),makeFoldedStock());}
