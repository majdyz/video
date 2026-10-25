import Accelerate
import CoreVideo
import Foundation

/// The 4-byte layouts the web side posts (see apps/studio/src/native/plugin.ts).
public enum PixelFormat: String, CaseIterable {
    case rgba = "RGBA", rgbx = "RGBX", bgra = "BGRA", bgrx = "BGRX"

    /// True when the bytes are already in CoreVideo's 32BGRA order.
    var isBGR: Bool { self == .bgra || self == .bgrx }
}

public enum PixelCopyError: Error, CustomStringConvertible {
    case sizeMismatch(expected: Int, got: Int)
    case lockFailed(CVReturn)
    case vImage(vImage_Error)

    public var description: String {
        switch self {
        case .sizeMismatch(let e, let g): return "frame is \(g) bytes, expected \(e)"
        case .lockFailed(let r): return "CVPixelBufferLockBaseAddress failed (\(r))"
        case .vImage(let e): return "vImage error \(e)"
        }
    }
}

public enum PixelCopy {
    /// Copies a tightly packed 4-byte frame (top row first) into a 32BGRA
    /// pixel buffer. The buffer may be smaller (even-size rounding): the
    /// frame's top-left region is used.
    public static func copy(_ bytes: UnsafeRawBufferPointer, width: Int, height: Int, format: PixelFormat, into pb: CVPixelBuffer) throws {
        let expected = width * height * 4
        guard bytes.count >= expected, let base = bytes.baseAddress else {
            throw PixelCopyError.sizeMismatch(expected: expected, got: bytes.count)
        }
        let lock = CVPixelBufferLockBaseAddress(pb, [])
        guard lock == kCVReturnSuccess else { throw PixelCopyError.lockFailed(lock) }
        defer { CVPixelBufferUnlockBaseAddress(pb, []) }
        guard let dst = CVPixelBufferGetBaseAddress(pb) else { throw PixelCopyError.lockFailed(kCVReturnInvalidPixelBufferAttributes) }
        let dstStride = CVPixelBufferGetBytesPerRow(pb)
        let w = min(width, CVPixelBufferGetWidth(pb))
        let h = min(height, CVPixelBufferGetHeight(pb))
        let srcStride = width * 4
        if format.isBGR {
            for y in 0..<h {
                memcpy(dst.advanced(by: y * dstStride), base.advanced(by: y * srcStride), w * 4)
            }
        } else {
            var src = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: base), height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: srcStride)
            var out = vImage_Buffer(data: dst, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: dstStride)
            // RGBA -> BGRA: channel order 2,1,0,3.
            let map: [UInt8] = [2, 1, 0, 3]
            let err = vImagePermuteChannels_ARGB8888(&src, &out, map, vImage_Flags(kvImageNoFlags))
            if err != kvImageNoError { throw PixelCopyError.vImage(err) }
        }
    }
}
