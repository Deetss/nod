package dev.example.nod;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;

import javax.net.ssl.SSLException;

/**
 * One `GET https://<host>/api/health`, run off the main thread.
 *
 * `connect()` finishes the TCP and TLS handshake before the request is sent, which is when the
 * first two check rows turn done. The third waits for the response.
 */
public final class HealthCheck {
    static final int TIMEOUT_MS = 5000;
    private static final int BODY_MAX = 64 * 1024;

    /** The check row a failure lands on, top to bottom. */
    public enum Row { TAILNET, DESKTOP, NOD }

    /** Which detail line the error card shows. */
    public enum Detail { TIMEOUT, NO_ROUTE, DNS, REFUSED, TLS, NOT_NOD, OTHER }

    public static final class Failure {
        public final Row row;
        public final Detail detail;
        /** The HTTP status for NOT_NOD, otherwise 0. */
        public final int status;
        /** The exception class for OTHER. */
        public final String other;

        Failure(Row row, Detail detail, int status, String other) {
            this.row = row;
            this.detail = detail;
            this.status = status;
            this.other = other;
        }
    }

    public interface Listener {
        void onConnected();

        void onPassed();

        void onFailed(Failure failure);
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;

    /** Debug builds may check the emulator's host loopback over http; release builds never do. */
    static String origin(String host) {
        boolean emulatorHost = host.equals("10.0.2.2") || host.startsWith("10.0.2.2:");
        return (BuildConfig.DEBUG && emulatorHost ? "http://" : "https://") + host;
    }

    public void start(final String host, final Listener listener) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                runCheck(host, listener);
            }
        }, "nod-health").start();
    }

    /** Aborts the request. No listener call follows. */
    public void cancel() {
        cancelled = true;
        HttpURLConnection c = connection;
        if (c != null) c.disconnect();
    }

    private void runCheck(String host, final Listener listener) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(origin(host) + "/api/health").openConnection();
            connection = c;
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json");
            c.connect();
            post(new Runnable() {
                @Override
                public void run() {
                    listener.onConnected();
                }
            });
            final int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            final boolean nod = status >= 200 && status < 300 && isNod(read(in));
            c.disconnect();
            post(new Runnable() {
                @Override
                public void run() {
                    if (nod) listener.onPassed();
                    else listener.onFailed(new Failure(Row.NOD, Detail.NOT_NOD, status, null));
                }
            });
        } catch (final IOException e) {
            post(new Runnable() {
                @Override
                public void run() {
                    listener.onFailed(classify(e));
                }
            });
        }
    }

    private void post(Runnable r) {
        if (cancelled) return;
        main.post(r);
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0 && out.size() < BODY_MAX) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }

    private static boolean isNod(String body) {
        try {
            return "nod".equals(new JSONObject(body).optString("app"));
        } catch (JSONException e) {
            return false;
        }
    }

    /** Maps a network error to its row and detail line, per the spec's failure table. */
    public static Failure classify(IOException e) {
        String message = String.valueOf(e.getMessage());
        if (e instanceof SocketTimeoutException) return fail(Row.TAILNET, Detail.TIMEOUT);
        if (e instanceof NoRouteToHostException) return fail(Row.TAILNET, Detail.NO_ROUTE);
        if (e instanceof UnknownHostException) return fail(Row.DESKTOP, Detail.DNS);
        if (e instanceof SSLException) return fail(Row.DESKTOP, Detail.TLS);
        if (e instanceof ConnectException) {
            if (message.contains("ENETUNREACH") || message.contains("EHOSTUNREACH")
                    || message.contains("unreachable") || message.contains("No route")) {
                return fail(Row.TAILNET, Detail.NO_ROUTE);
            }
            return fail(Row.DESKTOP, Detail.REFUSED);
        }
        return new Failure(Row.DESKTOP, Detail.OTHER, 0, e.getClass().getSimpleName());
    }

    private static Failure fail(Row row, Detail detail) {
        return new Failure(row, detail, 0, null);
    }
}
