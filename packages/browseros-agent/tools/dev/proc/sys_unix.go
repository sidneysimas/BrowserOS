//go:build !windows

package proc

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

// setChildProcAttrs puts a managed child in its own process group so the
// supervisor can signal the whole tree and Ctrl+C reaches only the supervisor.
func setChildProcAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killTree signals the process group led by pid.
func killTree(pid int, signal syscall.Signal) error {
	return syscall.Kill(-pid, signal)
}

func killPID(pid int, signal syscall.Signal) error {
	err := syscall.Kill(pid, signal)
	if err == syscall.ESRCH {
		return nil
	}
	return err
}

func killGroup(pgid int, signal syscall.Signal) error {
	err := syscall.Kill(-pgid, signal)
	if err == syscall.ESRCH {
		return nil
	}
	return err
}

func pidAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM
}

func groupAlive(pgid int) bool {
	err := syscall.Kill(-pgid, 0)
	return err == nil || err == syscall.EPERM
}

func currentPGID() (int, error) {
	return syscall.Getpgid(0)
}

// lockFileExclusive takes a non-blocking exclusive lock, returning
// errWatchRunLocked when another process holds it.
func lockFileExclusive(file *os.File) error {
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return errWatchRunLocked
		}
		return err
	}
	return nil
}

func unlockFile(file *os.File) error {
	return syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
}

// listProcesses returns "pid pgid command" lines for every process.
func listProcesses() (string, error) {
	output, err := exec.Command("ps", "-axo", "pid=,pgid=,command=").Output()
	if err != nil {
		return "", fmt.Errorf("listing processes: %w", err)
	}
	return string(output), nil
}

func KillPort(port int) {
	exec.Command("sh", "-c", fmt.Sprintf("lsof -ti:%d | xargs kill -9 2>/dev/null || true", port)).Run()
}
