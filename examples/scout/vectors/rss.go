// Linux peak RSS wrapper (wait4 rusage), used when GNU time is not installed.
package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"syscall"
)

func main() {
	cmd := exec.Command(os.Args[1], os.Args[2:]...)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		panic(err)
	}
	var result map[string]any
	if err := json.Unmarshal(out, &result); err != nil {
		panic(err)
	}
	result["peakRssBytes"] = cmd.ProcessState.SysUsage().(*syscall.Rusage).Maxrss * 1024
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		panic(err)
	}
}
