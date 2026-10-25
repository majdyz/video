package app.deepfix.dive.export;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.Build;
import android.view.Surface;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * H.264 / HEVC encoder for frames rendered by the WebView: MediaCodec with
 * a Surface input (frames drawn by {@link EglFrameRenderer}), MediaMuxer
 * (MP4), and the source's audio track copied through packet by packet with
 * MediaExtractor (AAC / AMR: no re-encode; other codecs are dropped and
 * reported). Not thread-safe: create, append, finish and cancel on one
 * thread (it owns the EGL context).
 */
public final class FrameEncoder {
    public static final class Config {
        public File output;
        public int width;
        public int height;
        public double fps = 30;
        public int bitrate = 20_000_000;
        public String codec = "avc";
        public double keyFrameIntervalSec = 2;
        public double durationSec;
        /** Source file to copy the audio track from (null: no audio). */
        public String audioSource;
        /** Source time of the first video frame; frame timestamps are relative to it. */
        public double audioShiftSec;
    }

    public static final class Result {
        public final File file;
        public final int frames;
        public final boolean audioIncluded;
        public final double durationSec;

        Result(File file, int frames, boolean audioIncluded, double durationSec) {
            this.file = file;
            this.frames = frames;
            this.audioIncluded = audioIncluded;
            this.durationSec = durationSec;
        }
    }

    /** MP4 audio codecs MediaMuxer accepts as-is. */
    static boolean muxableAudio(String mime) {
        return mime != null && (mime.equals(MediaFormat.MIMETYPE_AUDIO_AAC) || mime.equals(MediaFormat.MIMETYPE_AUDIO_AMR_NB) || mime.equals(MediaFormat.MIMETYPE_AUDIO_AMR_WB));
    }

    /** 4:2:0 needs even sizes. */
    static int even(int v) {
        return Math.max(2, v & ~1);
    }

    public final Config config;
    public final int width;
    public final int height;
    private final MediaCodec codec;
    private final Surface inputSurface;
    private final EglFrameRenderer gl;
    private final MediaMuxer muxer;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    private int videoTrack = -1;
    private int audioTrack = -1;
    private boolean muxerStarted;
    private MediaExtractor extractor;
    private MediaFormat audioFormat;
    private ByteBuffer audioBuf;
    private boolean audioDone;
    private boolean audioWritten;
    private final long shiftUs;
    private long lastPtsUs = -1;
    private long maxVideoPtsUs = 0;
    private int frames;
    private boolean released;

    public FrameEncoder(Config c) throws IOException {
        config = c;
        width = even(c.width);
        height = even(c.height);
        shiftUs = Math.max(0, Math.round(c.audioShiftSec * 1e6));
        String mime = "hevc".equals(c.codec) ? MediaFormat.MIMETYPE_VIDEO_HEVC : MediaFormat.MIMETYPE_VIDEO_AVC;
        MediaFormat f = MediaFormat.createVideoFormat(mime, width, height);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, c.bitrate);
        f.setFloat(MediaFormat.KEY_FRAME_RATE, (float) (c.fps > 0 ? c.fps : 30));
        if (Build.VERSION.SDK_INT >= 25) f.setFloat(MediaFormat.KEY_I_FRAME_INTERVAL, (float) c.keyFrameIntervalSec);
        else f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, (int) Math.max(1, Math.round(c.keyFrameIntervalSec)));
        f.setInteger(MediaFormat.KEY_COLOR_STANDARD, MediaFormat.COLOR_STANDARD_BT709);
        f.setInteger(MediaFormat.KEY_COLOR_TRANSFER, MediaFormat.COLOR_TRANSFER_SDR_VIDEO);
        f.setInteger(MediaFormat.KEY_COLOR_RANGE, MediaFormat.COLOR_RANGE_LIMITED);
        String name = new MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(f);
        if (name == null) throw new IOException("No " + c.codec + " encoder for " + width + "x" + height + " on this device");
        codec = MediaCodec.createByCodecName(name);
        try {
            codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        } catch (RuntimeException e) {
            codec.release();
            throw new IOException("Encoder " + name + " rejected " + width + "x" + height + ": " + e.getMessage());
        }
        inputSurface = codec.createInputSurface();
        codec.start();
        if (c.output.exists()) c.output.delete();
        muxer = new MediaMuxer(c.output.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        if (c.audioSource != null) openAudio(c.audioSource);
        EglFrameRenderer r;
        try {
            r = new EglFrameRenderer(inputSurface, width, height);
        } catch (RuntimeException e) {
            releaseAll();
            throw new IOException("EGL: " + e.getMessage());
        }
        gl = r;
    }

    private void openAudio(String path) {
        try {
            MediaExtractor ex = new MediaExtractor();
            ex.setDataSource(path);
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat tf = ex.getTrackFormat(i);
                String m = tf.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) {
                    if (!muxableAudio(m)) break;
                    ex.selectTrack(i);
                    if (shiftUs > 0) ex.seekTo(shiftUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                    int max = tf.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? tf.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 0;
                    audioBuf = ByteBuffer.allocateDirect(Math.max(max, 256 * 1024));
                    audioFormat = tf;
                    extractor = ex;
                    return;
                }
            }
            ex.release();
        } catch (IOException | RuntimeException e) {
            extractor = null;
            audioFormat = null;
        }
    }

    public boolean hasAudio() {
        return audioFormat != null;
    }

    public int frames() {
        return frames;
    }

    /** Encodes one frame; `ptsUs` is relative to the first frame. */
    public void append(ByteBuffer pixels, int w, int h, PixelFormat fmt, long ptsUs) {
        if (released) throw new IllegalStateException("encoder released");
        if (ptsUs <= lastPtsUs) throw new IllegalArgumentException("frame timestamps out of order (" + lastPtsUs + " then " + ptsUs + " us)");
        gl.draw(pixels, w, h, fmt.isBgr());
        gl.present(ptsUs);
        lastPtsUs = ptsUs;
        frames++;
        drain(false);
    }

    private void drain(boolean endOfStream) {
        if (endOfStream) codec.signalEndOfInputStream();
        long deadline = System.nanoTime() + 10_000_000_000L;
        while (true) {
            int idx = codec.dequeueOutputBuffer(info, endOfStream ? 10_000 : 0);
            if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!endOfStream) return;
                if (System.nanoTime() > deadline) throw new IllegalStateException("encoder did not finish");
            } else if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (muxerStarted) throw new IllegalStateException("encoder format changed twice");
                videoTrack = muxer.addTrack(codec.getOutputFormat());
                if (audioFormat != null) {
                    try {
                        audioTrack = muxer.addTrack(audioFormat);
                    } catch (RuntimeException e) {
                        audioTrack = -1;
                        audioFormat = null;
                    }
                }
                muxer.start();
                muxerStarted = true;
            } else if (idx >= 0) {
                ByteBuffer out = codec.getOutputBuffer(idx);
                if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
                if (info.size > 0 && muxerStarted && out != null) {
                    out.position(info.offset);
                    out.limit(info.offset + info.size);
                    muxer.writeSampleData(videoTrack, out, info);
                    maxVideoPtsUs = Math.max(maxVideoPtsUs, info.presentationTimeUs);
                    // Keep the audio about half a second ahead of the video in the file.
                    writeAudioUpTo(maxVideoPtsUs + 500_000);
                }
                codec.releaseOutputBuffer(idx, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
            }
        }
    }

    private void writeAudioUpTo(long limitUs) {
        if (extractor == null || audioTrack < 0 || audioDone) return;
        MediaCodec.BufferInfo ai = new MediaCodec.BufferInfo();
        while (true) {
            long t = extractor.getSampleTime();
            if (t < 0) {
                audioDone = true;
                return;
            }
            long outUs = t - shiftUs;
            if (outUs > limitUs) return;
            int size = extractor.readSampleData(audioBuf, 0);
            if (size < 0) {
                audioDone = true;
                return;
            }
            // Priming / pre-roll before the first video frame is dropped.
            if (outUs >= 0 && size > 0) {
                int flags = (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                ai.set(0, size, outUs, flags);
                muxer.writeSampleData(audioTrack, audioBuf, ai);
                audioWritten = true;
            }
            extractor.advance();
        }
    }

    /** Flushes the encoder, copies the rest of the audio (cut at the end of the video) and closes the file. */
    public Result finish() {
        if (frames == 0) {
            cancel();
            throw new IllegalStateException("no frames");
        }
        drain(true);
        double frameDur = 1.0 / (config.fps > 0 ? config.fps : 30);
        long endUs = lastPtsUs + Math.round(frameDur * 1e6);
        writeAudioUpTo(endUs);
        boolean audio = audioWritten;
        releaseAll();
        return new Result(config.output, frames, audio || config.audioSource == null, endUs / 1e6);
    }

    public void cancel() {
        releaseAll();
        //noinspection ResultOfMethodCallIgnored
        config.output.delete();
    }

    private void releaseAll() {
        if (released) return;
        released = true;
        try {
            if (gl != null) gl.release();
        } catch (RuntimeException ignored) {
        }
        try {
            codec.stop();
        } catch (RuntimeException ignored) {
        }
        codec.release();
        inputSurface.release();
        try {
            if (muxerStarted) muxer.stop();
        } catch (RuntimeException ignored) {
        }
        muxer.release();
        if (extractor != null) extractor.release();
    }
}
