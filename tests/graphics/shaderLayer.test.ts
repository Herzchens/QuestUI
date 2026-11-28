import assert from "node:assert/strict";
import { boundedFramebuffer, mountShaderLayer } from "../../src/graphics/shaderLayer";
import { graphicsQualityPolicy } from "../../src/graphics/policy";
import { createThemeRendering } from "../../src/themes/rendering";

assert.deepEqual(boundedFramebuffer(100, 50, 1.25), [125, 62]);
assert.deepEqual(boundedFramebuffer(100, 50, 4), [200, 100]);
assert.deepEqual(boundedFramebuffer(0, 50, 1), [0, 0]);
assert.deepEqual(boundedFramebuffer(Infinity, 50, 1), [0, 0]);
for (const [w,h] of [[10000,10000],[20000,10],[1920,1080],[100,40000]]) {
    const [x,y] = boundedFramebuffer(w,h,3);
    assert.ok(x*y <= 2_000_000 && x <= 4096 && y <= 4096);
}

function fixture() {
    const counts = { draw:0, deletedShader:0, deletedProgram:0, deletedBuffer:0, lost:0 };
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    const canvas = Object.assign(new EventTarget(), {
        style: { cssText: "" }, width:0, height:0, setAttribute() {},
        remove() { host.children.delete(canvas); },
        getContext() { return available ? gl : null; }
    });
    let available = true, compile = true, link = true, failDelete = false;
    const gl = {
        VERTEX_SHADER:1, FRAGMENT_SHADER:2, COMPILE_STATUS:3, LINK_STATUS:4, ARRAY_BUFFER:5,
        STATIC_DRAW:6, FLOAT:7, TRIANGLES:8, MAX_RENDERBUFFER_SIZE:9,
        createShader:()=>({}), shaderSource(){}, compileShader(){}, getShaderParameter:()=>compile,
        createProgram:()=>({}), attachShader(){}, linkProgram(){}, getProgramParameter:()=>link,
        getAttribLocation:()=>0, getUniformLocation:()=>null, createBuffer:()=>({}), bindBuffer(){}, bufferData(){},
        isContextLost:()=>false, getParameter:()=>4096, viewport(){}, useProgram(){}, enableVertexAttribArray(){},
        vertexAttribPointer(){}, uniform2f(){}, uniform1f(){}, drawArrays(){counts.draw++;},
        deleteShader(){if(failDelete)throw Error("delete");counts.deletedShader++;}, deleteProgram(){counts.deletedProgram++;},
        deleteBuffer(){counts.deletedBuffer++;}, getExtension:()=>({loseContext(){counts.lost++;}})
    };
    const document = Object.assign(new EventTarget(), {
        hidden:false,
        defaultView:Object.assign(new EventTarget(),{devicePixelRatio:2, requestAnimationFrame(cb:FrameRequestCallback){frames.set(++next,cb);return next;},cancelAnimationFrame(id:number){frames.delete(id);}}),
        createElement:()=>canvas
    });
    const host = Object.assign(new EventTarget(), {
        ownerDocument:document, children:new Set(), contains(value:unknown){return value===host;},
        getBoundingClientRect:()=>({width:100,height:80,left:0,top:0}),
        appendChild(value:unknown){host.children.add(value);}
    });
    const errors:unknown[]=[];
    const rendering = createThemeRendering(error=>errors.push(error));
    rendering.start();
    const context = { root:host as unknown as HTMLElement, surface:"dashboard" as const, graphics:graphicsQualityPolicy("3"), reducedMotion:false };
    const mount = (reducedMotion=false) => rendering.attach(ctx=>mountShaderLayer(ctx,context.root,{fragmentSource:"void main(){}",onFallback:error=>errors.push(error)}),{...context,reducedMotion});
    function tick(){const entries=[...frames];frames.clear();for(const [,cb] of entries)cb(100);}
    return {counts,frames,canvas,host,document,errors,rendering,mount,tick,setAvailable(v:boolean){available=v;},setCompile(v:boolean){compile=v;},setLink(v:boolean){link=v;},setFailDelete(v:boolean){failDelete=v;}};
}
{
    const f=fixture();const dispose=f.mount();
    assert.equal(f.host.children.size,1); assert.equal(f.frames.size,1);
    f.tick();assert.equal(f.counts.draw,1);assert.equal(f.frames.size,1);
    f.document.hidden=true;f.document.dispatchEvent(new Event("visibilitychange"));assert.equal(f.frames.size,0);
    f.document.hidden=false;f.document.dispatchEvent(new Event("visibilitychange"));assert.equal(f.frames.size,1);
    dispose();dispose();assert.equal(f.frames.size,0);assert.equal(f.host.children.size,0);
    assert.deepEqual(f.counts,{draw:1,deletedShader:2,deletedProgram:1,deletedBuffer:1,lost:1});
    f.rendering.stop();assert.equal(f.errors.length,0);
}
{
    const f=fixture();f.mount(true);f.tick();assert.equal(f.counts.draw,1);assert.equal(f.frames.size,0);
    f.rendering.stop();assert.equal(f.host.children.size,0);
}
for(const mode of ["unavailable","compile","link","context-lost"]){
    const f=fixture();
    if(mode==="unavailable")f.setAvailable(false);
    if(mode==="compile")f.setCompile(false);
    if(mode==="link")f.setLink(false);
    f.mount();
    if(mode==="context-lost")f.canvas.dispatchEvent(new Event("webglcontextlost",{cancelable:true}));
    assert.equal(f.errors.length,1,mode);assert.equal(f.frames.size,0,mode);assert.equal(f.host.children.size,0,mode);
    f.rendering.stop();assert.equal(f.errors.length,1,mode);
}
console.log("QuestUI shader layer: framebuffer budget, motion, visibility, fallback and cleanup PASS");

{
    const f=fixture();
    f.mount();
    f.setFailDelete(true);
    assert.throws(f.rendering.stop,/cleanup incomplete/);
    assert.equal(f.host.children.size,0);
    assert.equal(f.frames.size,0);
    assert.equal(f.counts.deletedBuffer,1);
    assert.equal(f.counts.deletedProgram,1);
    f.setFailDelete(false);
    f.rendering.stop();
    assert.equal(f.counts.deletedShader,2);
    assert.equal(f.counts.deletedBuffer,1);
    assert.equal(f.counts.deletedProgram,1);
}
{
    const f=fixture();
    f.mount(true);
    f.tick();
    f.document.defaultView.dispatchEvent(new Event("resize"));
    assert.equal(f.frames.size,1);
    f.tick();assert.equal(f.counts.draw,2);assert.equal(f.frames.size,0);
    f.rendering.stop();
    f.document.defaultView.dispatchEvent(new Event("resize"));
    assert.equal(f.frames.size,0);
}
