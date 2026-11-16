package dev.example.nod;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

/** The one server this app opens, set by the setup screen. */
public final class HostStore {
    private static final String PREFS = "nod";
    private static final String KEY_HOST = "host";
    private static final String SHORTCUT_ID = "change-server";

    private HostStore() {}

    /** The stored host, or null before setup. */
    public static String get(Context context) {
        return prefs(context).getString(KEY_HOST, null);
    }

    /** Saves the host and adds the Change server launcher shortcut. */
    public static void set(Context context, String host) {
        prefs(context).edit().putString(KEY_HOST, host).apply();
        Intent intent = new Intent(context, SetupActivity.class)
                .setAction(SetupActivity.ACTION_CHANGE_SERVER);
        ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(context, SHORTCUT_ID)
                .setShortLabel(context.getString(R.string.change_title))
                .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                .setIntent(intent)
                .build();
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
