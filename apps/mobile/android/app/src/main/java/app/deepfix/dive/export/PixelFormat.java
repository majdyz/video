package app.deepfix.dive.export;

/** The 4-byte layouts the web side posts (apps/studio/src/native/plugin.ts). */
public enum PixelFormat {
    RGBA, RGBX, BGRA, BGRX;

    /** Red and blue swapped relative to GL_RGBA. */
    public boolean isBgr() {
        return this == BGRA || this == BGRX;
    }

    public static PixelFormat parse(String s) {
        if (s == null) return null;
        try {
            return PixelFormat.valueOf(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
