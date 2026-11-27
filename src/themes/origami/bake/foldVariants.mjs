import { clamp, unit } from "./math3d.mjs";
import { roughDiffuse } from "./lighting.mjs";
import { foldedSheet } from "./foldGeometry.mjs";
import { rasterize } from "./rasterizer.mjs";

// Fixed material recipes, corner order TL, TR, BR, BL. No runtime selection.
const cornerPatterns={
    "top-right":[[0,0],[9,156],[3,42],[0,0]],
    "bottom-left":[[3,44],[0,0],[0,0],[9,154]],
    "bottom-right":[[0,0],[3,46],[9,158],[0,0]],
    "top-pair":[[7,150],[8,155],[0,0],[0,0]],
    "bottom-pair":[[0,0],[0,0],[8,153],[7,151]],
    "diagonal-pair":[[8,154],[0,0],[8,157],[0,0]],
    "right-pair":[[0,0],[8,151],[8,159],[0,0]]
};
// Released folds: normalized endpoints, signed residual height and width in CSS px.
const releasedPatterns={
    "unfolded-diagonal":[[.02,.94,.35,.02,.70,1.8],[.67,.98,.97,.05,-.45,1.5]],
    "unfolded-cross":[[.22,0,.26,1,-.63,1.4],[.02,.63,.98,.41,.40,1.6],[.77,0,.94,.75,.34,1.35]],
    "pleat":[[.18,0,.21,1,.56,1.1],[.27,0,.30,1,-.53,1.1],[.73,0,.78,1,.37,1.2]],
    "crumpled":[[0,.76,.25,.26,.66,1.8],[.25,.26,.47,.94,-.55,1.5],[.25,.26,.39,0,-.44,1.2],[.47,.94,.72,.37,.63,1.7],[.72,.37,.96,.04,-.53,1.35],[.72,.37,1,.75,.45,1.6],[.47,.94,.61,.62,.26,1.2]]
};
const creaseLight=unit([-.45,-.55,.70]),creaseFlat=roughDiffuse([0,0,1],creaseLight);
function residualHeight(x,y,w,h,lines){
    let z=0;
    for(const [ax,ay,bx,by,amplitude,width] of lines){
        const dx=(bx-ax)*w,dy=(by-ay)*h,len=Math.hypot(dx,dy);
        const u=((x-ax*w)*dx+(y-ay*h)*dy)/(len*len);
        if(u<0||u>1)continue;
        const d=((x-ax*w)*dy-(y-ay*h)*dx)/len;
        const fade=Math.min(1,u*8,(1-u)*8);
        z+=amplitude*Math.exp(-Math.abs(d)/width)*fade;
    }
    return z;
}
function releasedPaper(png,name,lines){
    const w=name==="crumpled"?280:112,h=name==="crumpled"?80:40;
    const W=w/2,H=h/2,pixels=new Uint8Array(w*h),palette=[[0,0,0]],alpha=[0];
    for(const v of [0,255])for(let i=1;i<=63;i++){palette.push([v,v,v]);alpha.push(Math.round(i*255/63));}
    const eps=.14;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        let sum=0;
        for(const sy of [.25,.75])for(const sx of [.25,.75]){
            const a=(x+sx)/2,b=(y+sy)/2;
            const dx=(residualHeight(a+eps,b,W,H,lines)-residualHeight(a-eps,b,W,H,lines))/(2*eps);
            const dy=(residualHeight(a,b+eps,W,H,lines)-residualHeight(a,b-eps,W,H,lines))/(2*eps);
            const n=unit([-dx,-dy,1]);
            const diffuse=.42+.58*roughDiffuse(n,creaseLight)/creaseFlat;
            const fiber=.008*Math.sin(a*9.1+b*1.7)*Math.sin(b*6.4-a*.9);
            sum+=(diffuse-1)*.68+fiber;
        }
        const value=clamp(sum/4,-.36,.26),i=Math.round(Math.abs(value)*63);
        pixels[y*w+x]=i?(value>0?63+i:i):0;
    }
    return png(w,h,pixels,palette,alpha);
}
export function fixedFoldAssets(png){
    const entries={};
    for(const [name,folds] of Object.entries(cornerPatterns)){
        const r=rasterize(foldedSheet(56,20,folds),112,40,{overlay:"material",samples:1});
        entries["variant-"+name]=png(r.w,r.h,r.pixels,r.palette,r.alpha);
    }
    for(const [name,lines] of Object.entries(releasedPatterns))
        entries["variant-"+name]=releasedPaper(png,name,lines);
    return entries;
}
