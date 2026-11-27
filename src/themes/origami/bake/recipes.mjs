import { foldedSheet } from "./foldGeometry.mjs";
import { rasterize } from "./rasterizer.mjs";

// The sheet is thin and double-sided. Deliberately no solid rim or bevel.
const actions=[[12,154],[6,55],[11,159],[5,48]];
const icons=[[11,154],[5,52],[9,159],[5,48]];
export const actionPigments={start:[0,143,77],stop:[223,48,67],pause:[241,189,72]};
export function foldedAssets(png){
    const bake=(sheet,w,h,options)=>{const r=rasterize(sheet,w,h,options);return png(w,h,r.pixels,r.palette,r.alpha);};
    const entries={};
    const actionGeometry={
        start:[actions,[16,22]],
        stop:[[[4,42],[12,151],[3,46],[9,157]],null],
        pause:[[[4,48],[8,155],[11,157],[0,0]],null]
    };
    for(const [name,pigment] of Object.entries(actionPigments)){
        const [folds,endFold]=actionGeometry[name];
        entries["fold-action-"+name]=bake(foldedSheet(80,32,folds,endFold),160,64,{pigment});
    }
    // Both progress states use the same thin sheet geometry and silhouette.
    // Two returned corners and one shallow transverse fold remain legible at 16px.
    const segment=foldedSheet(44,16,[[3,52],[6,153],[3,47],[5,151]],[8,19]);
    entries["fold-segment-empty"]=bake(segment,88,32,{pigment:[231,216,196]});
    entries["fold-segment-filled"]=bake(segment,88,32,{pigment:[115,56,181]});
    entries["fold-settings"]=bake(foldedSheet(30,30,icons,[13,18]),60,60,{pigment:[219,194,158]});
    // The corner cut is exactly 1/2 of the 34px local frame. Each corner
    // is rendered in world orientation with the same light, not mirrored.
    for(const [i,name] of ["tl","tr","br","bl"].entries()){
        const corners=Array.from({length:4},(_,j)=>j===i?[17,[161,156,165,158][i]]:[0,0]);
        entries["wrap-"+name]=bake(foldedSheet(34,34,corners),96,96,{overlay:true});
    }
    // Chips have fewer folds than action sheets. Small stamps use their own
    // almost-square crease pattern, not a scaled action button.
    const micro=rasterize(foldedSheet(56,20,[[7,153],[3,48],[6,157],[3,42]],[10,24]),112,40,{overlay:"material"});
    const stamp=rasterize(foldedSheet(18,16,[[5,153],[2,48],[4,158],[2,42]],[7,20]),36,32,{overlay:"material"});
    const slip=rasterize(foldedSheet(80,32,[[12,154],[6,55],[11,159],[5,48]],[16,22]),160,64,{overlay:"material"});
    const encode=r=>png(r.w,r.h,r.pixels,r.palette,r.alpha);
    entries["stock-micro"]=encode(micro);
    entries["stock-stamp"]=encode(stamp);
    entries["stock-slip"]=encode(slip);
    // Portal controls retain their semantic outline frames; fixed endcaps
    // are background layers instead of competing border images.
    for(const [name,r,cut] of [["micro",micro,20],["slip",slip,36]]){
        for(const side of ["left","right"]){
            const pixels=new Uint8Array(cut*r.h),offset=side==="left"?0:r.w-cut;
            for(let y=0;y<r.h;y++)pixels.set(r.pixels.subarray(y*r.w+offset,y*r.w+offset+cut),y*cut);
            entries[name+"-"+side]=png(cut,r.h,pixels,r.palette,r.alpha);
        }
    }
    return entries;
}
