import { add, mul, sub, dot, unit, clamp, hit } from "./math3d.mjs";

// Rough diffuse, normalized against a flat reference sheet. No gloss lobe.
// Angles and ambient fraction are engineering starting values, not measured
// optical constants for a particular commercial origami paper.
const lights=[[-.45,-.55,.70],[-.65,-.45,.70],[-.25,-.65,.70],[-.55,-.30,.76],[-.35,-.80,.76]].map(unit);
const view=[0,0,1],ambient=.38;
const aoDirections=[[-.6,0,1],[.6,0,1],[0,-.6,1],[0,.6,1],[0,0,1]].map(unit);
export function roughDiffuse(n,l,sigma=20*Math.PI/180){
    const nl=Math.max(0,dot(n,l)),nv=Math.max(0,dot(n,view));
    if(nl===0||nv===0)return 0;
    const s=sigma*sigma,A=1-.5*s/(s+.33),B=.45*s/(s+.09);
    const tl=sub(l,mul(n,nl)),tv=sub(view,mul(n,nv));
    const sl=Math.hypot(...tl),sv=Math.hypot(...tv);
    const az=sl*sv>1e-8?Math.max(0,dot(tl,tv)/(sl*sv)):0;
    return nl*(A+B*az*Math.max(sl,sv)*Math.min(sl/Math.max(nl,1e-8),sv/Math.max(nv,1e-8)));
}
const flat=ambient+(1-ambient)*lights.reduce((s,l)=>s+roughDiffuse(view,l),0)/lights.length;
export function illumination(face,p,occluders,grain=true){
    const n=face.n[2]<0?mul(face.n,-1):face.n;
    const o=add(p,mul(n,.02)),others=occluders.filter(t=>t!==face);
    const visible=d=>!others.some(t=>hit(t,o,d));
    const ao=aoDirections.reduce((s,d)=>s+Number(visible(d)),0)/aoDirections.length;
    const direct=lights.reduce((s,l)=>s+(visible(l)?roughDiffuse(n,l):0),0)/lights.length;

    // Fine fibers on the sheet, not broad wood-like streaks. Subpixel
    // frequencies are integrated by the rasterizer.
    const fiber=(grain?.012:0)*Math.sin(p[0]*8.1+p[1]*1.9)*Math.sin(p[1]*6.7-p[0]*.8);
    return clamp((ambient*(.78+.22*ao)+(1-ambient)*direct)/flat+fiber,.38,1.42);
}
