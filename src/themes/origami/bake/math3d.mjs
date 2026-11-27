// Offline thin-sheet geometry. Coordinates use CSS pixels, +z toward camera.
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const mul = (a,s) => a.map(v=>v*s);
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = a => mul(a,1/Math.hypot(...a));
export const clamp = (x,lo=0,hi=1) => Math.max(lo,Math.min(hi,x));
export function rotateAround(p,a,b,angle){
    const k=unit(sub(b,a)),v=sub(p,a),c=Math.cos(angle),s=Math.sin(angle);
    return add(a,add(add(mul(v,c),mul(cross(k,v),s)),mul(k,dot(k,v)*(1-c))));
}
export function triangle(a,b,c,kind="sheet"){
    const u=sub(b,a),v=sub(c,a),n=unit(cross(u,v));
    return {a,b,c,u,v,n,kind,area:Math.hypot(...cross(u,v))/2};
}
export function hit(t,p,d){
    // Moller-Trumbore; double-sided, because a sheet has two faces.
    const h=cross(d,t.v),det=dot(t.u,h);
    if(Math.abs(det)<1e-9)return false;
    const inv=1/det,s=sub(p,t.a),u=dot(s,h)*inv;
    if(u<0||u>1)return false;
    const q=cross(s,t.u),v=dot(d,q)*inv;
    return v>=0&&u+v<=1&&dot(t.v,q)*inv>.015;
}
