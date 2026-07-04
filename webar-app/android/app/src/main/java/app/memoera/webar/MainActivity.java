package app.memoera.webar;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Temporary: force-enable WebView remote debugging (chrome://inspect) in
        // this release build so JS console errors can be captured directly —
        // release builds otherwise suppress all WebView console output from logcat.
        WebView.setWebContentsDebuggingEnabled(true);
    }
}
