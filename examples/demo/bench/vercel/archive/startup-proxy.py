# Research-only copy of the pinned public proxy; leaves readiness order intact.
# Usage: python3 startup-proxy.py <bootstrap directory>, then cross-compile Go.
from pathlib import Path
import sys
p = Path(sys.argv[1]) / 'proxy.go'
s = p.read_text()
s = s.replace('"fmt"', '"fmt"\n "encoding/json"')
s = s.replace('func main() {', '''func diagnostic(stage string) {
 b, _ := json.Marshal(map[string]interface{}{"diagnostic":"ipc-proxy-startup-v1", "stage":stage,"at":time.Now().UnixMilli(),"elapsedMs":float64(time.Since(startTime).Microseconds())/1000})
 fmt.Println(string(b))
}
func main() {''')
for before, after in [
 ('startTime = time.Now()', 'startTime = time.Now()\n diagnostic("proxy-main")'),
 ('// Race server readiness', 'diagnostic("child-started")\n // Race server readiness'),
 ('// Supervise the user server', 'diagnostic("child-port-ready")\n // Supervise the user server'),
 ('// Send server-started IPC message', 'diagnostic("before-ipc-ready")\n // Send server-started IPC message'),
 ('// Start the proxy server', 'diagnostic("after-ipc-ready")\n // Start the proxy server'),
 ('if err := server.ListenAndServe();', 'listener, err := net.Listen("tcp", server.Addr)\n if err != nil { panic(err) }\n diagnostic("proxy-listening")\n if err := server.Serve(listener);'),
 ('// Extract Vercel internal headers', 'diagnostic("proxy-request")\n // Extract Vercel internal headers'),
]:
 assert s.count(before) == 1, before
 s = s.replace(before, after)
p.write_text(s)
