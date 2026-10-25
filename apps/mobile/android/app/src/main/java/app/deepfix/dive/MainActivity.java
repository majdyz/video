package app.deepfix.dive;

import android.os.Bundle;
import app.deepfix.dive.export.DiveNativePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(DiveNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
