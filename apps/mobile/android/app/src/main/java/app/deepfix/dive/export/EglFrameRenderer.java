package app.deepfix.dive.export;

import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.view.Surface;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * Draws CPU frames (4-byte RGBA/BGRA rows from the WebView) into a
 * MediaCodec input surface: the GPU does the RGB -> YUV conversion and any
 * scaling the encoder needs, and eglPresentationTimeANDROID stamps each
 * frame. Must be created, used and released on one thread.
 */
final class EglFrameRenderer {
    private static final int EGL_RECORDABLE_ANDROID = 0x3142;

    private static final String VS =
        "attribute vec2 a_pos;\n"
            + "varying vec2 v_uv;\n"
            + "void main() {\n"
            // Row 0 of the upload is the top of the picture.
            + "  v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);\n"
            + "  gl_Position = vec4(a_pos, 0.0, 1.0);\n"
            + "}\n";
    private static final String FS =
        "precision mediump float;\n"
            + "uniform sampler2D u_tex;\n"
            + "uniform float u_bgr;\n"
            + "varying vec2 v_uv;\n"
            + "void main() {\n"
            + "  vec4 c = texture2D(u_tex, v_uv);\n"
            + "  gl_FragColor = vec4(mix(c.rgb, c.bgr, u_bgr), 1.0);\n"
            + "}\n";

    private EGLDisplay display = EGL14.EGL_NO_DISPLAY;
    private EGLContext context = EGL14.EGL_NO_CONTEXT;
    private EGLSurface surface = EGL14.EGL_NO_SURFACE;
    private final int outW, outH;
    private int program, tex, uBgr;
    private int texW = -1, texH = -1;
    private final FloatBuffer quad;

    EglFrameRenderer(Surface target, int width, int height) {
        outW = width;
        outH = height;
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (display == EGL14.EGL_NO_DISPLAY) throw new IllegalStateException("no EGL display");
        int[] version = new int[2];
        if (!EGL14.eglInitialize(display, version, 0, version, 1)) throw new IllegalStateException("eglInitialize failed");
        int[] attribs = {
            EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,
            EGL14.EGL_NONE,
        };
        EGLConfig[] configs = new EGLConfig[1];
        int[] num = new int[1];
        if (!EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, num, 0) || num[0] < 1) throw new IllegalStateException("no recordable EGL config");
        int[] ctxAttribs = {EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE};
        context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttribs, 0);
        if (context == EGL14.EGL_NO_CONTEXT) throw new IllegalStateException("eglCreateContext failed");
        surface = EGL14.eglCreateWindowSurface(display, configs[0], target, new int[] {EGL14.EGL_NONE}, 0);
        if (surface == EGL14.EGL_NO_SURFACE) throw new IllegalStateException("eglCreateWindowSurface failed");
        if (!EGL14.eglMakeCurrent(display, surface, surface, context)) throw new IllegalStateException("eglMakeCurrent failed");

        program = link(compile(GLES20.GL_VERTEX_SHADER, VS), compile(GLES20.GL_FRAGMENT_SHADER, FS));
        uBgr = GLES20.glGetUniformLocation(program, "u_bgr");
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        tex = t[0];
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        float[] v = {-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f};
        quad = ByteBuffer.allocateDirect(v.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        quad.put(v).position(0);
    }

    /** Uploads one frame (tightly packed rows, top row first) and draws it over the whole output. */
    void draw(ByteBuffer pixels, int w, int h, boolean bgr) {
        pixels.position(0);
        GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 4);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex);
        if (w != texW || h != texH) {
            GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, pixels);
            texW = w;
            texH = h;
        } else {
            GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, w, h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, pixels);
        }
        GLES20.glViewport(0, 0, outW, outH);
        GLES20.glUseProgram(program);
        GLES20.glUniform1f(uBgr, bgr ? 1f : 0f);
        int aPos = GLES20.glGetAttribLocation(program, "a_pos");
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        int err = GLES20.glGetError();
        if (err != GLES20.GL_NO_ERROR) throw new IllegalStateException("GL error 0x" + Integer.toHexString(err));
    }

    /** Stamps and submits the drawn frame to the encoder (blocks while the encoder's input queue is full). */
    void present(long ptsUs) {
        EGLExt.eglPresentationTimeANDROID(display, surface, ptsUs * 1000L);
        if (!EGL14.eglSwapBuffers(display, surface)) throw new IllegalStateException("eglSwapBuffers failed: 0x" + Integer.toHexString(EGL14.eglGetError()));
    }

    void release() {
        if (display != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface);
            if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context);
            EGL14.eglReleaseThread();
            EGL14.eglTerminate(display);
        }
        display = EGL14.EGL_NO_DISPLAY;
        context = EGL14.EGL_NO_CONTEXT;
        surface = EGL14.EGL_NO_SURFACE;
    }

    private static int compile(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) throw new IllegalStateException("shader: " + GLES20.glGetShaderInfoLog(s));
        return s;
    }

    private static int link(int vs, int fs) {
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, vs);
        GLES20.glAttachShader(p, fs);
        GLES20.glLinkProgram(p);
        int[] ok = new int[1];
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0);
        if (ok[0] == 0) throw new IllegalStateException("program: " + GLES20.glGetProgramInfoLog(p));
        return p;
    }
}
