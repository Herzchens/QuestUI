import { rotateAround, triangle, cross, sub } from "./math3d.mjs";

// A rectangle is partitioned into a central sheet and four corner triangles.
// Each tip rotates rigidly about its existing diagonal hinge. No extrusion,
// arbitrary height displacement, or independently painted corner polygon.
export function foldedSheet(w,h,folds,endFold=null){
    const d=folds.map(f=>f[0]);
    if(d[0]+d[1]>=w||d[3]+d[2]>=w||d[0]+d[3]>=h||d[1]+d[2]>=h)throw Error("Overlapping crease patterns");
    const xy=[[d[0],0],[w-d[1],0],[w,d[1]],[w,h-d[2]],[w-d[2],h],[d[3],h],[0,h-d[3]],[0,d[0]]];
    const faces=[],flaps=[];
    if(endFold && (endFold[0]<=Math.max(d[0],d[3])||endFold[0]>=w-Math.max(d[1],d[2])))throw Error("End hinge crosses a corner crease");
    const transform=(p,left)=>left&&endFold?rotateAround(p,[endFold[0],0,0],[endFold[0],h,0],endFold[1]*Math.PI/180):p;
    // Split in material coordinates before rotating any faces. All vertices
    // on the straight end hinge remain coincident after the rigid fold.
    function split(poly,left){
        if(!endFold)return poly;
        const x=endFold[0],out=[];
        for(let i=0;i<poly.length;i++){
            const a=poly[i],b=poly[(i+1)%poly.length],inside=p=>left?p[0]<=x:p[0]>=x;
            if(inside(a))out.push(a);
            if(inside(a)!==inside(b)){const t=(x-a[0])/(b[0]-a[0]);out.push([x,a[1]+(b[1]-a[1])*t,0]);}
        }
        return out;
    }
    for(const left of endFold?[true,false]:[false]){
        const poly=split(xy.map(p=>[...p,0]),left).map(p=>transform(p,left));
        for(let i=1;i<poly.length-1;i++){
            const a=poly[0],b=poly[i],c=poly[i+1];
            if(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-8)faces.push(triangle(a,b,c));
        }
    }
    for(let i=0;i<4;i++){
        const [size,degrees]=folds[i];
        if(size<=0)continue;
        if(degrees<=0||degrees>=180)throw Error("Fold must be between 0 and 180 degrees");
        const right=i===1||i===2,bottom=i>=2;
        const map=([x,y,z])=>[right?w-x:x,bottom?h-y:y,z];
        const a=[size,0,0],b=[0,size,0],tip=[0,0,0];
        const folded=rotateAround(tip,a,b,degrees*Math.PI/180);
        const A=transform(map(a),!right),B=transform(map(b),!right),P=transform(map(folded),!right);
        const face=right!==bottom?triangle(B,A,P,"return"):triangle(A,B,P,"return");
        faces.push(face);flaps.push({face,tip:transform(map(tip),!right),folded:P,hinge:[A,B],size});
    }
    return {w,h,faces,flaps};
}
