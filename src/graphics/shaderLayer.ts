import type { ThemeRenderContext } from "../themes/rendering";

/** Conservative backing-store limits per decorative layer. */
export function boundedFramebuffer(width: number, height: number, dpr: number, maxDimension = 4096): readonly [number, number] {
    if (![width, height, dpr, maxDimension].every(Number.isFinite)
        || width <= 0 || height <= 0 || dpr <= 0 || maxDimension < 1) return [0, 0];
    const scale = Math.min(dpr, 2, maxDimension / width, maxDimension / height, Math.sqrt(2_000_000 / width / height));
    return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}

interface ShaderLayerOptions {
    readonly fragmentSource: string;
    readonly onFallback?: (error: unknown) => void;
}

const VERTEX_SOURCE = "attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.0,1.0);}";

/** A decorative full-screen quad, not a general graphics engine. The theme
 * supplies its own positioned host and fragment shader. No Quest state is read.
 * A failed/lost context removes the layer; existing CSS remains the fallback. */
export function mountShaderLayer(context: ThemeRenderContext, host: HTMLElement, options: ShaderLayerOptions): void {
    if (context.signal.aborted || !context.root.contains(host)) return;
    const canvas = host.ownerDocument.createElement("canvas");
    const doc = host.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;";
    let gl: WebGLRenderingContext | null = null;
    let frame: number | null = null;
    let closed = false;
    let observer: ResizeObserver | undefined;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    const shaders: WebGLShader[] = [];
    const pointer = [0.5, 0.5];
    let elapsed = 0, lastTime: number | null = null;

    function stopFrame() {
        if (frame !== null) win!.cancelAnimationFrame(frame);
        frame = null;
        lastTime = null;
    }
    function cleanup() {
        if (closed) return;
        closed = true;
        const errors: unknown[] = [];
        const attempt = (fn: () => void) => { try { fn(); } catch (error) { errors.push(error); } };
        attempt(stopFrame);
        attempt(() => observer?.disconnect());
        attempt(() => doc.removeEventListener("visibilitychange", visibility));
        attempt(() => host.removeEventListener("pointermove", onPointer));
        attempt(() => canvas.removeEventListener("webglcontextlost", lost));
        attempt(() => canvas.remove());
        if (gl) {
            const owned = gl;
            for (const shader of shaders) attempt(() => owned.deleteShader(shader));
            if (buffer) attempt(() => owned.deleteBuffer(buffer));
            if (program) attempt(() => owned.deleteProgram(program));
            attempt(() => owned.getExtension("WEBGL_lose_context")?.loseContext());
        }
        shaders.length = 0;
        gl = null;
        buffer = null;
        program = null;
        if (errors.length) throw new AggregateError(errors, "Shader layer cleanup failed.");
    }
    function fail(error: unknown) {
        if (closed) return;
        let failure = error;
        try { cleanup(); } catch (cleanupError) { failure = new AggregateError([error, cleanupError], "Shader layer failed."); }
        try { options.onFallback?.(failure); } catch { /* Cosmetic failure must not escape into the dashboard. */ }
    }
    function lost(event: Event) {
        // Do not restore automatically: use CSS until the next renderer mount.
        event.preventDefault();
        fail(new Error("WebGL context lost."));
    }
    function compile(type: number, source: string): WebGLShader {
        const shader = gl!.createShader(type);
        if (!shader) throw new Error("Could not allocate shader.");
        shaders.push(shader);
        gl!.shaderSource(shader, source);
        gl!.compileShader(shader);
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error("Shader compilation failed.");
        return shader;
    }
    let position = -1;
    let resolution: WebGLUniformLocation | null = null;
    let time: WebGLUniformLocation | null = null;
    let mouse: WebGLUniformLocation | null = null;
    function draw(now: number) {
        frame = null;
        if (closed || context.signal.aborted || doc.hidden || !gl) return;
        try {
            if (gl.isContextLost()) throw new Error("WebGL context lost.");
            const rect = host.getBoundingClientRect();
            const [width, height] = boundedFramebuffer(rect.width, rect.height, win!.devicePixelRatio, Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)));
            if (!width || !height) { lastTime = null; return; }
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            if (!context.reducedMotion && lastTime !== null) elapsed += Math.min(100, Math.max(0, now - lastTime)) / 1000;
            lastTime = now;
            gl.viewport(0, 0, width, height);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(resolution, width, height);
            gl.uniform1f(time, elapsed);
            gl.uniform2f(mouse, context.reducedMotion ? 0.5 : pointer[0], context.reducedMotion ? 0.5 : pointer[1]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (!context.reducedMotion) schedule();
        } catch (error) { fail(error); }
    }
    function schedule() {
        if (closed || context.signal.aborted || doc.hidden || frame !== null) return;
        frame = win!.requestAnimationFrame(draw);
    }
    function visibility() { if (doc.hidden) stopFrame(); else schedule(); }
    function onPointer(event: PointerEvent) {
        if (context.reducedMotion) return;
        const rect = host.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointer[0] = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        pointer[1] = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    }

    context.defer(cleanup);
    try {
        gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false,
            preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
        if (!gl) throw new Error("WebGL unavailable.");
        const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
        const fragment = compile(gl.FRAGMENT_SHADER, options.fragmentSource);
        program = gl.createProgram();
        if (!program) throw new Error("Could not allocate shader program.");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader link failed.");
        position = gl.getAttribLocation(program, "a_position");
        if (position < 0) throw new Error("Shader position attribute missing.");
        resolution = gl.getUniformLocation(program, "u_resolution");
        time = gl.getUniformLocation(program, "u_time");
        mouse = gl.getUniformLocation(program, "u_pointer");
        buffer = gl.createBuffer();
        if (!buffer) throw new Error("Could not allocate shader buffer.");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        canvas.addEventListener("webglcontextlost", lost);
        doc.addEventListener("visibilitychange", visibility);
        if (!context.reducedMotion) host.addEventListener("pointermove", onPointer, { passive: true });
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(schedule);
            observer.observe(host);
        }
        host.appendChild(canvas);
        schedule();
    } catch (error) { fail(error); }
}
