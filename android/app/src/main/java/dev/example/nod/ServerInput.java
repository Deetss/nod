package dev.example.nod;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Turns what the user typed, pasted or scanned into a server host.
 *
 * Accepts a bare host, an https URL (the desktop's pair link is `https://<host>/pair#code=<code>`)
 * and `nod://pair?host=<host>&code=<code>`. Keeps a port when one is given.
 */
public final class ServerInput {
    private static final Pattern HOST = Pattern.compile("[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?");

    /** The host to store, and the pair code when the input was a pair link. */
    public static final class Parsed {
        public final String host;
        public final String code;

        Parsed(String host, String code) {
            this.host = host;
            this.code = code;
        }
    }

    private ServerInput() {}

    /** Returns null when the input is not a usable host or link. */
    public static Parsed parse(String raw) {
        if (raw == null) return null;
        String text = raw.trim();
        if (text.isEmpty() || text.matches(".*\\s.*")) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.startsWith("nod:")) return parseNodLink(text);
        if (lower.startsWith("https://") || lower.startsWith("http://")) return parseUrl(text);
        if (lower.contains("://")) return null;
        int slash = text.indexOf('/');
        return host(slash < 0 ? text : text.substring(0, slash), null);
    }

    private static Parsed parseNodLink(String text) {
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            return null;
        }
        if (!"pair".equalsIgnoreCase(uri.getHost())) return null;
        return host(param(uri.getRawQuery(), "host"), param(uri.getRawQuery(), "code"));
    }

    private static Parsed parseUrl(String text) {
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            return null;
        }
        if (uri.getHost() == null) return null;
        String authority = uri.getPort() < 0 ? uri.getHost() : uri.getHost() + ":" + uri.getPort();
        String code = null;
        if ("/pair".equals(uri.getPath())) {
            code = param(uri.getRawFragment(), "code");
            if (code == null) code = param(uri.getRawQuery(), "code");
        }
        return host(authority, code);
    }

    private static Parsed host(String value, String code) {
        if (value == null) return null;
        String host = value.toLowerCase(Locale.ROOT);
        while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        if (!HOST.matcher(host).matches()) return null;
        return new Parsed(host, code == null || code.isEmpty() ? null : code);
    }

    /** One value from an `a=1&b=2` string, percent-decoded. */
    static String param(String query, String name) {
        if (query == null) return null;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                try {
                    return java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                } catch (java.io.UnsupportedEncodingException | IllegalArgumentException e) {
                    return null;
                }
            }
        }
        return null;
    }
}
