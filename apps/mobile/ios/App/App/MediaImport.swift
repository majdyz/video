import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Picks one video or photo and copies it into the app's sandbox.
///
/// Photos: PHPickerViewController with `preferredAssetRepresentationMode =
/// .current`, so the original file comes back (HEVC .mov with its metadata
/// and timed-metadata tracks) instead of the H.264 compatibility transcode a
/// WKWebView <input type=file> produces. No Photos permission is needed for
/// the picker. Files: UIDocumentPickerViewController (iCloud Drive, SD-card
/// readers, other providers).
final class MediaImport: NSObject, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    struct Picked {
        let url: URL
        let name: String
        let mime: String
        let size: Int
    }

    private let importsDir: URL
    private var completion: ((Result<[Picked], Error>) -> Void)?
    private var retainSelf: MediaImport?

    init(importsDir: URL) {
        self.importsDir = importsDir
    }

    func present(from vc: UIViewController, source: String, kinds: [String], completion: @escaping (Result<[Picked], Error>) -> Void) {
        self.completion = completion
        retainSelf = self
        let wantVideo = kinds.isEmpty || kinds.contains("video")
        let wantImage = kinds.isEmpty || kinds.contains("image")
        if source == "files" {
            var types: [UTType] = []
            if wantVideo { types += [.movie, .mpeg4Movie, .quickTimeMovie] }
            if wantImage { types += [.image, .heic, .jpeg, .png] }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.allowsMultipleSelection = false
            picker.delegate = self
            vc.present(picker, animated: true)
        } else {
            var config = PHPickerConfiguration()
            config.selectionLimit = 1
            config.preferredAssetRepresentationMode = .current
            var filters: [PHPickerFilter] = []
            if wantVideo { filters.append(.videos) }
            if wantImage { filters.append(.images) }
            config.filter = filters.count == 1 ? filters[0] : .any(of: filters)
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            vc.present(picker, animated: true)
        }
    }

    private func finish(_ result: Result<[Picked], Error>) {
        let c = completion
        completion = nil
        retainSelf = nil
        DispatchQueue.main.async { c?(result) }
    }

    private func destination(for name: String) throws -> URL {
        let dir = importsDir.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent(name.isEmpty ? "clip" : name)
    }

    private func picked(_ url: URL) -> Picked {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        return Picked(url: url, name: url.lastPathComponent, mime: mime, size: size)
    }

    // MARK: PHPicker

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else { return finish(.success([])) }
        let type: UTType
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            type = .movie
        } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            type = .image
        } else {
            return finish(.failure(NSError(domain: "MediaImport", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported item"])))
        }
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [self] url, error in
            // The provided file is deleted when this block returns: copy (an APFS clone) now.
            guard let url else {
                return finish(.failure(error ?? NSError(domain: "MediaImport", code: 2, userInfo: [NSLocalizedDescriptionKey: "No file"])))
            }
            do {
                var name = url.lastPathComponent
                if let suggested = provider.suggestedName, !suggested.isEmpty, !url.pathExtension.isEmpty {
                    name = "\(suggested).\(url.pathExtension)"
                }
                let dst = try destination(for: name)
                try FileManager.default.copyItem(at: url, to: dst)
                finish(.success([picked(dst)]))
            } catch {
                finish(.failure(error))
            }
        }
    }

    // MARK: UIDocumentPicker

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return finish(.success([])) }
        do {
            let dst = try destination(for: url.lastPathComponent)
            // asCopy: the file is already ours (in the app's tmp/Inbox): move it.
            do { try FileManager.default.moveItem(at: url, to: dst) } catch { try FileManager.default.copyItem(at: url, to: dst) }
            finish(.success([picked(dst)]))
        } catch {
            finish(.failure(error))
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(.success([]))
    }
}

/// Adds a finished export to the Photos library (add-only permission).
enum GallerySaver {
    static func save(_ url: URL, isVideo: Bool, completion: @escaping (Result<Bool, Error>) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { return completion(.success(false)) }
            PHPhotoLibrary.shared().performChanges({
                let req = PHAssetCreationRequest.forAsset()
                let opts = PHAssetResourceCreationOptions()
                opts.originalFilename = url.lastPathComponent
                req.addResource(with: isVideo ? .video : .photo, fileURL: url, options: opts)
            }) { ok, error in
                if let error { completion(.failure(error)) } else { completion(.success(ok)) }
            }
        }
    }
}
