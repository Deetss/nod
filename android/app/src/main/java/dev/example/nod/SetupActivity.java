package dev.example.nod;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.card.MaterialCardView;
import com.google.android.material.textfield.TextInputLayout;
import com.google.zxing.BarcodeFormat;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.BarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;

import java.util.ArrayDeque;
import java.util.Collections;

/**
 * First-launch setup and Change server: finds the desktop running Nod, checks it answers, saves
 * its host and hands off to the TWA. Layout and copy follow docs/design/apk-setup-spec.md.
 */
public class SetupActivity extends AppCompatActivity {
    /** Opens the Change server variant. The launcher shortcut and `nod://server` send it. */
    static final String ACTION_CHANGE_SERVER = "dev.example.nod.CHANGE_SERVER";

    private static final long FOUND_FLASH_MS = 300;
    private static final long HANDOFF_MS = 1200;

    private enum Screen { WELCOME, SCAN, TYPE, PASTE, CHECK, SUCCESS }

    private enum RowState { PENDING, RUNNING, DONE, FAILED }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayDeque<Screen> stack = new ArrayDeque<>();
    private FrameLayout root;
    private View screen;

    private String typed = "";
    private String pasted = "";
    private ServerInput.Parsed target;

    private HealthCheck check;
    private final RowState[] rows = new RowState[3];
    private HealthCheck.Failure failure;

    private BarcodeView barcode;
    private boolean torch;
    private ActivityResultLauncher<String> cameraPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        setContentView(R.layout.activity_setup);
        root = findViewById(R.id.setup_root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        cameraPermission = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) startCamera();
            else Toast.makeText(this, R.string.camera_denied, Toast.LENGTH_LONG).show();
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                back();
            }
        });

        open(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        open(intent);
    }

    /** A `nod://pair` link lands on the paste step, filled, and checks it straight away. */
    private void open(Intent intent) {
        cancelCheck();
        stack.clear();
        stack.push(Screen.WELCOME);
        Uri data = intent.getData();
        if (data != null && "nod".equals(data.getScheme()) && "pair".equals(data.getHost())) {
            pasted = data.toString();
            stack.push(Screen.PASTE);
            ServerInput.Parsed parsed = ServerInput.parse(pasted);
            if (parsed != null) {
                startCheck(parsed);
                return;
            }
        }
        render();
    }

    // Navigation

    private void push(Screen s) {
        stack.push(s);
        render();
    }

    /** Swaps the current step for another, so Back skips the one left. */
    private void replace(Screen s) {
        stack.pop();
        push(s);
    }

    private void back() {
        cancelCheck();
        handler.removeCallbacksAndMessages(null);
        if (stack.peek() == Screen.SUCCESS || stack.size() <= 1) {
            finish();
            return;
        }
        stack.pop();
        render();
    }

    private void render() {
        stopCamera();
        root.removeAllViews();
        Screen s = stack.peek();
        root.setBackgroundColor(color(s == Screen.SCAN ? R.color.bg_inset : R.color.bg_default));
        screen = LayoutInflater.from(this).inflate(layoutFor(s), root, false);
        root.addView(screen);
        View back = screen.findViewById(R.id.back);
        if (back != null) back.setOnClickListener(v -> back());
        switch (s) {
            case WELCOME: bindWelcome(); break;
            case SCAN: bindScan(); break;
            case TYPE: bindType(); break;
            case PASTE: bindPaste(); break;
            case CHECK: bindCheck(); break;
            case SUCCESS: bindSuccess(); break;
        }
    }

    private static int layoutFor(Screen s) {
        switch (s) {
            case SCAN: return R.layout.screen_scan;
            case TYPE: return R.layout.screen_type;
            case PASTE: return R.layout.screen_paste;
            case CHECK: return R.layout.screen_check;
            case SUCCESS: return R.layout.screen_success;
            default: return R.layout.screen_welcome;
        }
    }

    // Welcome (frames 1 and 9)

    private void bindWelcome() {
        final String current = HostStore.get(this);
        boolean change = current != null;
        text(R.id.title).setText(change ? R.string.change_title : R.string.setup_title);
        screen.findViewById(R.id.explain).setVisibility(change ? View.GONE : View.VISIBLE);
        screen.findViewById(R.id.footer).setVisibility(change ? View.GONE : View.VISIBLE);
        screen.findViewById(R.id.current).setVisibility(change ? View.VISIBLE : View.GONE);
        screen.findViewById(R.id.cancel).setVisibility(change ? View.VISIBLE : View.GONE);
        screen.findViewById(R.id.cancel).setOnClickListener(v -> finish());
        if (change) {
            text(R.id.current_host).setText(current);
            text(R.id.section).setText(R.string.replace_by);
        }

        int height = change ? 80 : 96;
        method(R.id.row_scan, R.drawable.ic_scan, change ? R.string.method_scan_new_title : R.string.method_scan_title,
                change ? R.string.method_scan_new_desc : R.string.method_scan_desc, !change, height)
                .setOnClickListener(v -> push(Screen.SCAN));
        method(R.id.row_paste, R.drawable.ic_clipboard, R.string.method_paste_title,
                change ? R.string.method_paste_new_desc : R.string.method_paste_desc, false, height)
                .setOnClickListener(v -> push(Screen.PASTE));
        method(R.id.row_type, R.drawable.ic_keyboard, change ? R.string.edit_address : R.string.method_type_title,
                change ? R.string.method_edit_desc : R.string.method_type_desc, false, height)
                .setOnClickListener(v -> {
                    if (change && typed.isEmpty()) typed = current;
                    push(Screen.TYPE);
                });
    }

    private View method(int id, int icon, int title, int desc, boolean primary, int heightDp) {
        MaterialCardView row = screen.findViewById(id);
        ViewGroup.LayoutParams lp = row.getLayoutParams();
        lp.height = dp(heightDp);
        row.setLayoutParams(lp);
        ImageView glyph = row.findViewById(R.id.icon);
        glyph.setImageResource(icon);
        ((TextView) row.findViewById(R.id.title)).setText(title);
        ((TextView) row.findViewById(R.id.desc)).setText(desc);
        if (primary) {
            row.setCardBackgroundColor(color(R.color.bg_accent_muted));
            row.setStrokeColor(color(R.color.border_accent));
            row.setStrokeWidth(dp(1.5f));
            glyph.setBackgroundResource(R.drawable.bg_row_icon_primary);
            glyph.setImageTintList(ContextCompat.getColorStateList(this, R.color.fg_on_emphasis));
        }
        return row;
    }

    // Scan (frame 2)

    private void bindScan() {
        torch = false;
        barcode = screen.findViewById(R.id.barcode);
        barcode.setDecoderFactory(new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)));
        final ImageButton flash = screen.findViewById(R.id.flash);
        flash.setOnClickListener(v -> {
            torch = !torch;
            barcode.setTorch(torch);
            flash.setBackgroundResource(torch ? R.drawable.bg_icon_btn_scrim_on : R.drawable.bg_icon_btn_scrim);
            flash.setImageTintList(ContextCompat.getColorStateList(this, torch ? R.color.fg_accent : R.color.fg_default));
        });
        screen.findViewById(R.id.paste_instead).setOnClickListener(v -> replace(Screen.PASTE));
        screen.findViewById(R.id.type_instead).setOnClickListener(v -> replace(Screen.TYPE));

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            barcode.setVisibility(View.INVISIBLE);
            cameraPermission.launch(Manifest.permission.CAMERA);
        }
    }

    private void startCamera() {
        if (barcode == null || stack.peek() != Screen.SCAN) return;
        barcode.setVisibility(View.VISIBLE);
        barcode.resume();
        barcode.decodeSingle(scanned);
    }

    private void stopCamera() {
        if (barcode == null) return;
        barcode.pause();
        barcode = null;
    }

    private final BarcodeCallback scanned = new BarcodeCallback() {
        @Override
        public void barcodeResult(BarcodeResult result) {
            final ServerInput.Parsed parsed = ServerInput.parse(result.getText());
            if (parsed == null) {
                Toast.makeText(SetupActivity.this, R.string.not_a_pair_code, Toast.LENGTH_SHORT).show();
                if (barcode != null) barcode.decodeSingle(this);
                return;
            }
            ((ViewfinderView) screen.findViewById(R.id.viewfinder)).setFound(true);
            handler.postDelayed(() -> startCheck(parsed), FOUND_FLASH_MS);
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        if (barcode != null && barcode.getVisibility() == View.VISIBLE) barcode.resume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (barcode != null) barcode.pause();
    }

    // Type the address (frame 3)

    private void bindType() {
        final TextInputLayout field = screen.findViewById(R.id.field);
        labelFont(field);
        final EditText input = screen.findViewById(R.id.input);
        input.setText(typed);
        input.setSelection(typed.length());
        input.addTextChangedListener(new Watcher() {
            @Override
            public void afterTextChanged(Editable s) {
                typed = s.toString();
                field.setError(null);
            }
        });
        input.setOnEditorActionListener((v, action, event) -> {
            if (action != EditorInfo.IME_ACTION_GO) return false;
            submitTyped(field);
            return true;
        });
        screen.findViewById(R.id.paste).setOnClickListener(v -> {
            String clip = clipboard();
            if (clip != null) {
                input.setText(clip.trim());
                input.setSelection(input.length());
            }
        });
        screen.findViewById(R.id.check).setOnClickListener(v -> submitTyped(field));
        updatePasteChip();
        input.requestFocus();
        input.post(() -> ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE))
                .showSoftInput(input, InputMethodManager.SHOW_IMPLICIT));
    }

    private void submitTyped(TextInputLayout field) {
        ServerInput.Parsed parsed = ServerInput.parse(typed);
        if (parsed == null) {
            field.setError(getString(R.string.address_invalid));
            return;
        }
        startCheck(parsed);
    }

    // Paste pair link (frame 10)

    private void bindPaste() {
        labelFont(screen.findViewById(R.id.field));
        final EditText input = screen.findViewById(R.id.input);
        input.setText(pasted);
        input.addTextChangedListener(new Watcher() {
            @Override
            public void afterTextChanged(Editable s) {
                pasted = s.toString();
                updateFound();
            }
        });
        screen.findViewById(R.id.paste).setOnClickListener(v -> {
            String clip = clipboard();
            if (clip != null) input.setText(clip.trim());
        });
        screen.findViewById(R.id.check).setOnClickListener(v -> {
            ServerInput.Parsed parsed = ServerInput.parse(pasted);
            if (parsed != null) startCheck(parsed);
        });
        updateFound();
        updatePasteChip();
    }

    private void updateFound() {
        ServerInput.Parsed parsed = ServerInput.parse(pasted);
        screen.findViewById(R.id.found).setVisibility(parsed == null ? View.GONE : View.VISIBLE);
        if (parsed != null) text(R.id.found_host).setText(parsed.host);
        screen.findViewById(R.id.check).setEnabled(parsed != null);
    }

    // Check (frames 4 to 7)

    private void startCheck(ServerInput.Parsed parsed) {
        target = parsed;
        if (stack.peek() != Screen.CHECK) stack.push(Screen.CHECK);
        runCheck();
    }

    private void runCheck() {
        cancelCheck();
        failure = null;
        rows[0] = RowState.RUNNING;
        rows[1] = RowState.PENDING;
        rows[2] = RowState.PENDING;
        render();
        check = new HealthCheck();
        check.start(target.host, new HealthCheck.Listener() {
            @Override
            public void onConnected() {
                rows[0] = RowState.DONE;
                rows[1] = RowState.DONE;
                rows[2] = RowState.RUNNING;
                bindCheck();
            }

            @Override
            public void onPassed() {
                check = null;
                HostStore.set(SetupActivity.this, target.host);
                stack.clear();
                push(Screen.SUCCESS);
                handler.postDelayed(SetupActivity.this::handOff, HANDOFF_MS);
            }

            @Override
            public void onFailed(HealthCheck.Failure f) {
                check = null;
                failure = f;
                int failed = f.row.ordinal();
                for (int i = 0; i < rows.length; i++) {
                    rows[i] = i < failed ? RowState.DONE : i == failed ? RowState.FAILED : RowState.PENDING;
                }
                bindCheck();
            }
        });
    }

    private void cancelCheck() {
        if (check != null) check.cancel();
        check = null;
    }

    private void bindCheck() {
        boolean failed = failure != null;
        text(R.id.title).setText(failed ? R.string.fail_title : R.string.checking_title);
        text(R.id.host).setText(target.host);
        screen.findViewById(R.id.back).setVisibility(failed ? View.VISIBLE : View.INVISIBLE);
        checkRow(R.id.row_tailnet, R.string.check_tailnet, getString(R.string.check_tailnet_sub), rows[0]);
        checkRow(R.id.row_desktop, R.string.check_desktop, target.host, rows[1]);
        checkRow(R.id.row_nod, R.string.check_nod, getString(R.string.check_nod_sub), rows[2]);
        screen.findViewById(R.id.note).setVisibility(failed ? View.GONE : View.VISIBLE);
        screen.findViewById(R.id.cancel).setVisibility(failed ? View.GONE : View.VISIBLE);
        screen.findViewById(R.id.cancel).setOnClickListener(v -> back());
        screen.findViewById(R.id.error).setVisibility(failed ? View.VISIBLE : View.GONE);
        screen.findViewById(R.id.actions).setVisibility(failed ? View.VISIBLE : View.GONE);
        if (!failed) return;

        int[] copy = errorCopy(failure.row);
        text(R.id.error_title).setText(copy[0]);
        text(R.id.error_body).setText(copy[1]);
        text(R.id.error_detail).setText(detail(failure));
        screen.findViewById(R.id.retry).setOnClickListener(v -> runCheck());
        screen.findViewById(R.id.edit).setOnClickListener(v -> {
            typed = target.host;
            stack.pop();
            if (stack.peek() == Screen.TYPE) render();
            else push(Screen.TYPE);
        });
    }

    private static int[] errorCopy(HealthCheck.Row row) {
        switch (row) {
            case TAILNET: return new int[] {R.string.err_tailnet_title, R.string.err_tailnet_body};
            case DESKTOP: return new int[] {R.string.err_host_title, R.string.err_host_body};
            default: return new int[] {R.string.err_nod_title, R.string.err_nod_body};
        }
    }

    private String detail(HealthCheck.Failure f) {
        switch (f.detail) {
            case TIMEOUT: return getString(R.string.detail_timeout);
            case NO_ROUTE: return getString(R.string.detail_no_route);
            case DNS: return getString(R.string.detail_dns);
            case REFUSED: return getString(R.string.detail_refused);
            case TLS: return getString(R.string.detail_tls);
            case NOT_NOD: return getString(R.string.detail_not_nod, f.status);
            default: return getString(R.string.detail_other, f.other);
        }
    }

    private void checkRow(int id, int title, String sub, RowState state) {
        View row = screen.findViewById(id);
        TextView titleView = row.findViewById(R.id.title);
        titleView.setText(title);
        ((TextView) row.findViewById(R.id.sub)).setText(sub);
        titleView.setTextColor(color(state == RowState.PENDING ? R.color.fg_muted : R.color.fg_default));

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        ImageView icon = row.findViewById(R.id.state);
        View spinner = row.findViewById(R.id.spinner);
        spinner.setVisibility(state == RowState.RUNNING ? View.VISIBLE : View.GONE);
        switch (state) {
            case DONE:
                bg.setColor(color(R.color.bg_muted));
                bg.setStroke(dp(1), color(R.color.border_muted));
                icon.setBackgroundResource(R.drawable.bg_check_done);
                icon.setImageResource(R.drawable.ic_check);
                icon.setImageTintList(ContextCompat.getColorStateList(this, R.color.fg_on_emphasis));
                break;
            case RUNNING:
                bg.setColor(color(R.color.bg_muted));
                bg.setStroke(dp(2), color(R.color.border_accent));
                icon.setBackgroundResource(R.drawable.bg_check_run);
                icon.setImageDrawable(null);
                break;
            case FAILED:
                bg.setColor(color(R.color.bg_danger_muted));
                bg.setStroke(dp(2), color(R.color.border_danger));
                icon.setBackgroundResource(R.drawable.bg_check_fail);
                icon.setImageResource(R.drawable.ic_close);
                icon.setImageTintList(ContextCompat.getColorStateList(this, R.color.fg_danger));
                break;
            default:
                bg.setStroke(dp(1), color(R.color.border_muted), dp(4), dp(4));
                icon.setBackgroundResource(R.drawable.bg_check_pend);
                icon.setImageDrawable(null);
                break;
        }
        row.setBackground(bg);
    }

    // Success (frame 8)

    private void bindSuccess() {
        text(R.id.host).setText(target.host);
        text(R.id.url).setText(handOffUrl());
    }

    /** A pair link finishes pairing on the web pair page, which reads the code from the fragment. */
    private String handOffUrl() {
        if (target.code != null) return "https://" + target.host + "/pair#code=" + Uri.encode(target.code);
        return LauncherActivity.startUrl(target.host);
    }

    private void handOff() {
        startActivity(new Intent(this, LauncherActivity.class)
                .putExtra(LauncherActivity.EXTRA_URL, handOffUrl())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        finish();
    }

    /** The field label is semibold sans; TextInputLayout would otherwise take the input's font. */
    private static void labelFont(TextInputLayout field) {
        field.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    }

    // Clipboard

    private final ClipboardManager.OnPrimaryClipChangedListener clipChanged = this::updatePasteChip;

    @Override
    protected void onStart() {
        super.onStart();
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.addPrimaryClipChangedListener(clipChanged);
    }

    @Override
    protected void onStop() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.removePrimaryClipChangedListener(clipChanged);
        super.onStop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) updatePasteChip();
    }

    /** The Paste chips show only when the clipboard holds text. */
    private void updatePasteChip() {
        View chip = screen == null ? null : screen.findViewById(R.id.paste);
        if (chip != null) chip.setVisibility(clipboard() == null ? View.GONE : View.VISIBLE);
    }

    private String clipboard() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = cm == null ? null : cm.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).coerceToText(this);
        return text == null || text.toString().trim().isEmpty() ? null : text.toString();
    }

    // Helpers

    @Override
    protected void onDestroy() {
        cancelCheck();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private TextView text(int id) {
        return screen.findViewById(id);
    }

    private int color(int id) {
        return ContextCompat.getColor(this, id);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private abstract static class Watcher implements TextWatcher {
        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

        @Override
        public void onTextChanged(CharSequence s, int start, int count, int after) {}
    }
}
