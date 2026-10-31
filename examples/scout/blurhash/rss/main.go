// Linux wait4 peak-RSS wrapper for minimal Sandbox images without time/Python.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

func main() {
	c := exec.Command(os.Args[1], os.Args[2:]...)
	c.Stdin = os.Stdin
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	e := c.Run()
	if c.ProcessState == nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "Maximum resident set size (kbytes):", c.ProcessState.SysUsage().(*syscall.Rusage).Maxrss)
	os.Exit(c.ProcessState.ExitCode())
}
