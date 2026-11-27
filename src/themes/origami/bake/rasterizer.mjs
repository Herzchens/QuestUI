import { clamp } from "./math3d.mjs";
import { illumination } from "./lighting.mjs";

const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const srgb=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
const shadeColor=(base,s)=>base.map(v=>srgb(clamp(linear(v)*s)));

// Orthographic triangle rasterization with a depth comparison. Only the
// visible surface is illuminated. Output is downsampled by coverage in
// linear light; PNG palette quantization is performed after integration.
export function rasterize(sheet,w,h,{pigment=[0,143,77],overlay=false,samples=2}={}){
    const faces=sheet.faces.map(t=>{
        const [a,b,c]=[t.a,t.b,t.c],area=t.u[0]*t.v[1]-t.u[1]*t.v[0];
        return {t,a,area,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),minY:Math.min(a[1],b[1],c[1]),maxY:Math.max(a[1],b[1],c[1])};
    });
    const occluders=sheet.faces;
    const pixels=new Uint8Array(w*h),palette=[[0,0,0]],alpha=[0];
    const steps=23,levels=5,lo=.38,hi=1.42;
    const backPigment=pigment.map((v,i)=>Math.round(v*.72+[249,237,215][i]*.28));
    if(overlay){
        for(const v of [0,255])for(let i=1;i<=63;i++){palette.push([v,v,v]);alpha.push(Math.round(i*255/63));}
    }else{
        for(let a=1;a<=levels;a++)for(const base of [pigment,backPigment])for(let i=0;i<=steps;i++){palette.push(shadeColor(base,lo+(hi-lo)*i/steps));alpha.push(Math.round(a*255/levels));}
    }
    const denom=samples*samples;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        let coverage=0,total=0,paint=0,back=0,backTotal=0;
        for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
            const px=(x+(sx+.5)/samples)*sheet.w/w,py=(y+(sy+.5)/samples)*sheet.h/h;
            let best=null,z=-Infinity;
            for(const f of faces){
                if(px<f.minX||px>f.maxX||py<f.minY||py>f.maxY||Math.abs(f.area)<1e-8)continue;
                const dx=px-f.a[0],dy=py-f.a[1],t=f.t;
                const u=(dx*t.v[1]-dy*t.v[0])/f.area,v=(t.u[0]*dy-t.u[1]*dx)/f.area;
                if(u<0||v<0||u+v>1)continue;
                const depth=f.a[2]+u*t.u[2]+v*t.v[2];
                if(depth>z){best=t;z=depth;}
            }
            if(!best)continue;
            const s=illumination(best,[px,py,z],occluders,!overlay);
            coverage++;total+=s;if(best.n[2]<0){back++;backTotal+=s;}
            if(overlay){
                // Neutral black/white alpha is an sRGB approximation solely
                // for overlaying the live ivory/landscape backing. The
                // geometry and visibility are still those of the folded sheet.
                const reference=overlay==="material"?.58:.88;
                const reverse=best.n[2]<0?(overlay==="material"?1.28:.93):1;
                const actual=srgb(clamp(linear(reference*255)*s*reverse))/255;
                paint+=Math.abs(actual-reference)<.006?0:actual>=reference?Math.min(.48,(actual-reference)/(1-reference)):(actual-reference)/reference;
            }
        }
        if(!coverage)continue;
        if(overlay){
            const d=paint/denom,i=clamp(Math.round(Math.abs(d)*63),0,63);
            pixels[y*w+x]=i?d>0?63+i:i:0;
        }else{
            const a=clamp(Math.round(coverage/denom*levels),1,levels),i=clamp(Math.round((total/coverage-lo)/(hi-lo)*steps),0,steps);
            if(back===0||back===coverage){
                pixels[y*w+x]=1+((a-1)*2+Number(back===coverage))*(steps+1)+i;
            }else{
                const mixed=pigment.map((v,j)=>(linear(v)*(total-backTotal)+linear(backPigment[j])*backTotal)/coverage);
                const first=1+(a-1)*2*(steps+1),last=first+2*(steps+1);
                let best=first,distance=Infinity;
                for(let j=first;j<last;j++){
                    const d=palette[j].reduce((sum,v,k)=>sum+(linear(v)-mixed[k])**2,0);
                    if(d<distance){distance=d;best=j;}
                }
                pixels[y*w+x]=best;
            }
        }
    }
    return {w,h,pixels,palette,alpha};
}
