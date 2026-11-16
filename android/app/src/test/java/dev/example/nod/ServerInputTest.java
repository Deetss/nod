package dev.example.nod;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class ServerInputTest {
    private static final String HOST = "desk.example-tailnet.ts.net";

    @Test
    public void acceptsBareHostAndLowerCasesIt() {
        assertEquals(HOST, ServerInput.parse("  Desk.Example-Tailnet.ts.net  ").host);
    }

    @Test
    public void stripsSchemePathAndTrailingSlash() {
        assertEquals(HOST, ServerInput.parse("https://" + HOST + "/").host);
        assertEquals(HOST, ServerInput.parse(HOST + "/some/path").host);
        assertEquals(HOST, ServerInput.parse(HOST + ".").host);
    }

    @Test
    public void keepsAPort() {
        assertEquals(HOST + ":8443", ServerInput.parse("https://" + HOST + ":8443/").host);
    }

    @Test
    public void readsTheDesktopHttpsPairLink() {
        ServerInput.Parsed p = ServerInput.parse("https://" + HOST + "/pair#code=ABC123");
        assertEquals(HOST, p.host);
        assertEquals("ABC123", p.code);
    }

    @Test
    public void readsTheNodPairLink() {
        ServerInput.Parsed p = ServerInput.parse("nod://pair?host=" + HOST + "&code=ABC123");
        assertEquals(HOST, p.host);
        assertEquals("ABC123", p.code);
    }

    @Test
    public void aPlainHostHasNoCode() {
        assertNull(ServerInput.parse(HOST).code);
        assertNull(ServerInput.parse("https://" + HOST + "/?apk=3").code);
    }

    @Test
    public void rejectsSpacesOtherSchemesAndJunk() {
        assertNull(ServerInput.parse("desk example"));
        assertNull(ServerInput.parse("ftp://" + HOST));
        assertNull(ServerInput.parse("nod://pair?code=ABC"));
        assertNull(ServerInput.parse("nod://other?host=" + HOST));
        assertNull(ServerInput.parse(""));
        assertNull(ServerInput.parse("-bad-.host"));
    }
}
