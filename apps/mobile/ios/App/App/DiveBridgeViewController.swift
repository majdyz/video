import Capacitor
import UIKit

/// Capacitor's bridge view controller plus the app's own plugin (local
/// plugins are registered here rather than shipped as an npm package). The
/// WebView background comes from `backgroundColor` in capacitor.config.ts.
class DiveBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DiveNativePlugin())
    }
}
