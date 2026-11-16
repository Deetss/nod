package dev.example.nod;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.io.IOException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

import javax.net.ssl.SSLHandshakeException;

public class HealthCheckTest {
    private static void assertMaps(IOException e, HealthCheck.Row row, HealthCheck.Detail detail) {
        HealthCheck.Failure f = HealthCheck.classify(e);
        assertEquals(row, f.row);
        assertEquals(detail, f.detail);
    }

    @Test
    public void timeoutsAndMissingRoutesFailTheTailnetRow() {
        assertMaps(new SocketTimeoutException("failed to connect after 5000ms"), HealthCheck.Row.TAILNET, HealthCheck.Detail.TIMEOUT);
        assertMaps(new NoRouteToHostException(), HealthCheck.Row.TAILNET, HealthCheck.Detail.NO_ROUTE);
        assertMaps(new ConnectException("connect failed: ENETUNREACH (Network is unreachable)"),
                HealthCheck.Row.TAILNET, HealthCheck.Detail.NO_ROUTE);
    }

    @Test
    public void dnsRefusedAndTlsFailTheDesktopRow() {
        assertMaps(new UnknownHostException("Unable to resolve host"), HealthCheck.Row.DESKTOP, HealthCheck.Detail.DNS);
        assertMaps(new ConnectException("isConnected failed: ECONNREFUSED (Connection refused)"),
                HealthCheck.Row.DESKTOP, HealthCheck.Detail.REFUSED);
        assertMaps(new SSLHandshakeException("bad cert"), HealthCheck.Row.DESKTOP, HealthCheck.Detail.TLS);
    }
}
