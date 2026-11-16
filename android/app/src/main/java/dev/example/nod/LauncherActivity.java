/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package dev.example.nod;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;

/** Opens the stored server in the TWA, or the setup screen when none is stored yet. */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    /** A full URL on the stored server to open instead of the start page, such as the pair page. */
    static final String EXTRA_URL = "dev.example.nod.URL";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (!isFinishing() && HostStore.get(this) == null) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
        }
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return HostStore.get(this) != null;
    }

    @Override
    protected Uri getLaunchingUrl() {
        String host = HostStore.get(this);
        String url = getIntent().getStringExtra(EXTRA_URL);

        // The activity is exported, so another app could pass any URL. Only the stored server opens.
        if (url != null && url.startsWith("https://" + host + "/")) return Uri.parse(url);
        return Uri.parse(startUrl(host));
    }

    /** `apk` tells the phone page which build it runs in, for the update banner. */
    static String startUrl(String host) {
        return "https://" + host + "/?apk=" + BuildConfig.VERSION_CODE;
    }
}
