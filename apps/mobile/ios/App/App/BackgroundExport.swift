import BackgroundTasks
import UIKit

/// Keeps an export alive when the app leaves the foreground.
///
/// iOS 26+: a BGContinuedProcessingTask (BackgroundTasks framework). It must
/// be submitted from the foreground in response to a user action (the Export
/// button), shows a system Live Activity with our progress, and the user can
/// stop it there (-> expiration handler). Identifiers are
/// "<bundle id>.export.<export id>", matched by the wildcard
/// "<bundle id>.export.*" in Info.plist BGTaskSchedulerPermittedIdentifiers;
/// handlers are registered dynamically right before submitting, once per
/// identifier (a second registration of the same identifier kills the app).
/// Background GPU use needs the com.apple.developer.background-tasks.
/// continued-processing.gpu entitlement (App.entitlements) and a device where
/// BGTaskScheduler.supportedResources contains .gpu.
///
/// Older iOS: UIApplication.beginBackgroundTask (about 30 s of grace).
///
/// Important limit (see MOBILE.md): frames are rendered by the
/// WebView, whose web content and GPU processes are WebKit's, not ours. The
/// continued-processing grant covers this process (the encoder keeps
/// running and the Live Activity stays up), but WebKit may still suspend
/// the page; the export then pauses and resumes when the app returns.
final class BackgroundExport {
    enum State: String {
        case granted = "background-granted"
        case denied = "background-denied"
        case expired = "background-expired"
    }

    let exportId: String
    private(set) var title: String
    private var subtitle: String
    private let onState: (State, String?) -> Void
    private var legacyTask: UIBackgroundTaskIdentifier = .invalid
    /// BGContinuedProcessingTask (typed as AnyObject to keep iOS 15 deployment).
    private var continued: AnyObject?
    private var finished = false
    private var lastTitleUpdate = Date.distantPast
    private let lock = NSLock()

    init(exportId: String, title: String, subtitle: String, onState: @escaping (State, String?) -> Void) {
        self.exportId = exportId
        self.title = title
        self.subtitle = subtitle
        self.onState = onState
    }

    static var mode: String {
        if #available(iOS 26.0, *) {
            return BGTaskScheduler.supportedResources.contains(.gpu) ? "continued-processing-gpu" : "continued-processing"
        }
        return "background-task"
    }

    /// Call from the foreground, while handling the user's Export tap.
    func start() {
        if #available(iOS 26.0, *), startContinued() { return }
        startLegacy()
    }

    @available(iOS 26.0, *)
    private func startContinued() -> Bool {
        guard let bundle = Bundle.main.bundleIdentifier else { return false }
        let identifier = "\(bundle).export.\(exportId)"
        let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { [weak self] task in
            guard let task = task as? BGContinuedProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            guard let self else {
                task.setTaskCompleted(success: false)
                return
            }
            self.attach(task)
        }
        guard registered else {
            onState(.denied, "identifier \(identifier) is not permitted (Info.plist BGTaskSchedulerPermittedIdentifiers)")
            return false
        }
        func request(gpu: Bool) -> BGContinuedProcessingTaskRequest {
            let r = BGContinuedProcessingTaskRequest(identifier: identifier, title: title, subtitle: subtitle)
            // Start now or not at all: a queued export would begin after the user left.
            r.strategy = .fail
            if gpu { r.requiredResources = .gpu }
            return r
        }
        let wantsGPU = BGTaskScheduler.supportedResources.contains(.gpu)
        do {
            try BGTaskScheduler.shared.submit(request(gpu: wantsGPU))
            return true
        } catch {
            if wantsGPU, (try? BGTaskScheduler.shared.submit(request(gpu: false))) != nil { return true }
            onState(.denied, error.localizedDescription)
            return false
        }
    }

    @available(iOS 26.0, *)
    private func attach(_ task: BGContinuedProcessingTask) {
        lock.lock()
        if finished {
            lock.unlock()
            task.setTaskCompleted(success: true)
            return
        }
        continued = task
        lock.unlock()
        task.progress.totalUnitCount = 1000
        task.progress.completedUnitCount = 0
        task.expirationHandler = { [weak self] in
            // The user stopped it from the Live Activity, or the system needed the resources.
            guard let self else { return }
            self.onState(.expired, nil)
            self.complete(success: false)
        }
        onState(.granted, nil)
    }

    private func startLegacy() {
        DispatchQueue.main.async {
            self.legacyTask = UIApplication.shared.beginBackgroundTask(withName: "export-\(self.exportId)") { [weak self] in
                self?.onState(.expired, "background time ran out")
                self?.endLegacy()
            }
        }
    }

    private func endLegacy() {
        DispatchQueue.main.async {
            if self.legacyTask != .invalid {
                UIApplication.shared.endBackgroundTask(self.legacyTask)
                self.legacyTask = .invalid
            }
        }
    }

    /// Progress for the Live Activity (the system deprioritises tasks that stop progressing).
    func update(fraction: Double, subtitle newSubtitle: String? = nil) {
        if let s = newSubtitle { subtitle = s }
        guard #available(iOS 26.0, *) else { return }
        lock.lock()
        let task = continued as? BGContinuedProcessingTask
        lock.unlock()
        guard let task else { return }
        task.progress.completedUnitCount = Int64(max(0, min(1, fraction)) * 1000)
        let now = Date()
        if newSubtitle != nil || now.timeIntervalSince(lastTitleUpdate) > 1 {
            lastTitleUpdate = now
            task.updateTitle(title, subtitle: newSubtitle ?? "\(Int((fraction * 100).rounded())) %")
        }
    }

    func complete(success: Bool) {
        lock.lock()
        let task = continued
        continued = nil
        let already = finished
        finished = true
        lock.unlock()
        if !already || task != nil {
            if #available(iOS 26.0, *), let t = task as? BGContinuedProcessingTask {
                if success { t.progress.completedUnitCount = t.progress.totalUnitCount }
                t.setTaskCompleted(success: success)
            }
        }
        endLegacy()
    }
}
