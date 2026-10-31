package de.pdfmy.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfmyScanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
